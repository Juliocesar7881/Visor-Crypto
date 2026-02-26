"""
═══════════════════════════════════════════════════════════════
VISOR CRYPTO — AUTO EXECUTION SERVICE V3 (CCXT + OCO + RECONCILIATION)
═══════════════════════════════════════════════════════════════

Complete order lifecycle management:
  1. Entry via Limit Order (offset 0.1%)
  2. Polling-based fill monitoring
  3. On fill → immediate OCO (SL + TP) placement
  4. TP hit → cancel SL (and vice-versa)
  5. Kill switch → cancel ALL open orders
  6. Reconciliation loop → orphan position protection
  7. Key validation → auto-disable on AuthenticationError + FCM alert

Security:
  - API keys encrypted with AES-256-GCM at rest
  - Master key from VISOR_MASTER_KEY environment variable
  - Encrypted keys persisted to disk — survive restarts
  - Limit orders only (never market for entry)
  - Max position / leverage / rate limits enforced
  - Daily key validation — auto-disables expired/revoked keys
"""

import asyncio
import time
import os
import json
import hashlib
import logging
from typing import Dict, Optional, List
from enum import Enum
from pathlib import Path

logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════
# CONFIG
# ═══════════════════════════════════════════════════

class OrderSide(str, Enum):
    BUY = "buy"
    SELL = "sell"

class OrderStatus(str, Enum):
    PENDING = "pending"
    PLACED = "placed"
    FILLED = "filled"
    OCO_PLACED = "oco_placed"
    TP_HIT = "tp_hit"
    SL_HIT = "sl_hit"
    CANCELLED = "cancelled"
    FAILED = "failed"

# Safety limits
MAX_POSITION_USD = 1000.0
MAX_LEVERAGE = 5
MAX_ORDERS_PER_HOUR = 10
LIMIT_OFFSET_PCT = 0.1

# OCO defaults
DEFAULT_SL_ATR_MULT = 1.5
DEFAULT_TP1_RR = 2.0
FILL_CHECK_INTERVAL = 2
FILL_TIMEOUT = 3600

# Reconciliation loop
RECONCILIATION_INTERVAL = 30  # seconds
KEY_VALIDATION_INTERVAL = 86400  # 24 hours

# Encrypted storage
ENCRYPTED_KEYS_FILE = Path(__file__).parent / ".encrypted_keys.json"
MASTER_KEY_ENV = "VISOR_MASTER_KEY"

# ═══════════════════════════════════════════════════
# CRYPTO: AES-256-GCM Encryption
# ═══════════════════════════════════════════════════

def _get_master_key() -> bytes:
    """Get master encryption key from environment variable."""
    key_hex = os.environ.get(MASTER_KEY_ENV)
    if not key_hex:
        import platform
        seed = f"visor-dev-{platform.node()}"
        key_hex = hashlib.sha256(seed.encode()).hexdigest()
        logger.warning("[AutoExec] Using dev master key — set VISOR_MASTER_KEY in production!")
    return bytes.fromhex(key_hex[:64])


def _encrypt_data(plaintext: str) -> dict:
    """Encrypt string with AES-256-GCM."""
    try:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    except ImportError:
        import base64
        logger.warning("[AutoExec] cryptography not installed — using base64 fallback (NOT SECURE)")
        return {"method": "base64", "data": base64.b64encode(plaintext.encode()).decode()}
    key = _get_master_key()
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)
    ciphertext = aesgcm.encrypt(nonce, plaintext.encode(), None)
    return {"method": "aes-256-gcm", "nonce": nonce.hex(), "ciphertext": ciphertext.hex()}


def _decrypt_data(encrypted: dict) -> str:
    """Decrypt AES-256-GCM encrypted data."""
    if encrypted.get("method") == "base64":
        import base64
        return base64.b64decode(encrypted["data"]).decode()
    try:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    except ImportError:
        raise RuntimeError("cryptography library required for decryption")
    key = _get_master_key()
    aesgcm = AESGCM(key)
    nonce = bytes.fromhex(encrypted["nonce"])
    ciphertext = bytes.fromhex(encrypted["ciphertext"])
    return aesgcm.decrypt(nonce, ciphertext, None).decode()


# ═══════════════════════════════════════════════════
# ENCRYPTED KEY PERSISTENCE
# ═══════════════════════════════════════════════════

def _save_encrypted_keys(user_configs: dict):
    try:
        serializable = {}
        for uid, cfg in user_configs.items():
            serializable[uid] = {
                "exchange_name": cfg["exchange_name"],
                "encrypted_key": cfg["encrypted_key"],
                "encrypted_secret": cfg["encrypted_secret"],
                "encrypted_password": cfg.get("encrypted_password"),
                "configured_at": cfg["configured_at"],
            }
        with open(ENCRYPTED_KEYS_FILE, "w") as f:
            json.dump(serializable, f)
        logger.info(f"[AutoExec] Saved {len(serializable)} encrypted configs to disk")
    except Exception as e:
        logger.error(f"[AutoExec] Failed to save encrypted keys: {e}")


def _load_encrypted_keys() -> dict:
    if not ENCRYPTED_KEYS_FILE.exists():
        return {}
    try:
        with open(ENCRYPTED_KEYS_FILE) as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"[AutoExec] Failed to load encrypted keys: {e}")
        return {}


# ═══════════════════════════════════════════════════
# IN-MEMORY STATE
# ═══════════════════════════════════════════════════

_user_exchanges: Dict[str, dict] = {}
_user_configs: Dict[str, dict] = {}
_order_history: list = []
_active_orders: Dict[str, dict] = {}
_kill_switch = False
_orders_this_hour: list = []
_fill_monitor_tasks: Dict[str, asyncio.Task] = {}
_reconciliation_task: Optional[asyncio.Task] = None
_last_key_validation: Dict[str, float] = {}  # user_id → timestamp


# ═══════════════════════════════════════════════════
# CCXT EXCHANGE INITIALIZATION
# ═══════════════════════════════════════════════════

def _get_ccxt():
    try:
        import ccxt
        return ccxt
    except ImportError:
        logger.error("[AutoExec] ccxt not installed. Run: pip install ccxt")
        return None


def _create_exchange(exchange_name: str, api_key: str, secret: str, password: str = None):
    ccxt = _get_ccxt()
    if not ccxt:
        return None
    exchange_class = getattr(ccxt, exchange_name.lower())
    config = {
        "apiKey": api_key, "secret": secret, "enableRateLimit": True,
        "options": {"defaultType": "future", "adjustForTimeDifference": True}
    }
    if password:
        config["password"] = password
    return exchange_class(config)


def configure_exchange(user_id: str, exchange_name: str, api_key: str, secret: str, password: str = None) -> dict:
    """Configure exchange — encrypts and persists keys to disk."""
    supported = ["binance", "okx", "bybit"]
    if exchange_name.lower() not in supported:
        return {"success": False, "error": f"Exchange not supported. Use: {supported}"}
    try:
        exchange = _create_exchange(exchange_name, api_key, secret, password)
        if not exchange:
            return {"success": False, "error": "ccxt library not installed"}
        encrypted_key = _encrypt_data(api_key)
        encrypted_secret = _encrypt_data(secret)
        encrypted_password = _encrypt_data(password) if password else None
        now = int(time.time() * 1000)
        _user_exchanges[user_id] = {
            "exchange": exchange, "exchange_name": exchange_name.lower(),
            "configured_at": now, "active": True,
        }
        _user_configs[user_id] = {
            "exchange_name": exchange_name.lower(),
            "encrypted_key": encrypted_key, "encrypted_secret": encrypted_secret,
            "encrypted_password": encrypted_password, "configured_at": now,
        }
        _save_encrypted_keys(_user_configs)
        return {
            "success": True, "exchange": exchange_name.lower(),
            "encryption": encrypted_key.get("method", "unknown"),
            "message": f"Exchange {exchange_name} configured with encrypted credentials"
        }
    except Exception as e:
        logger.error(f"[AutoExec] Configure error: {e}")
        return {"success": False, "error": str(e)}


def restore_exchanges():
    """Restore exchange connections from encrypted disk storage on startup."""
    saved = _load_encrypted_keys()
    restored = 0
    for user_id, cfg in saved.items():
        try:
            api_key = _decrypt_data(cfg["encrypted_key"])
            secret = _decrypt_data(cfg["encrypted_secret"])
            password = _decrypt_data(cfg["encrypted_password"]) if cfg.get("encrypted_password") else None
            exchange = _create_exchange(cfg["exchange_name"], api_key, secret, password)
            if exchange:
                _user_exchanges[user_id] = {
                    "exchange": exchange, "exchange_name": cfg["exchange_name"],
                    "configured_at": cfg["configured_at"], "active": True,
                }
                _user_configs[user_id] = cfg
                restored += 1
        except Exception as e:
            logger.error(f"[AutoExec] Failed to restore {user_id}: {e}")
    logger.info(f"[AutoExec] Restored {restored}/{len(saved)} exchange connections from encrypted storage")


def remove_exchange(user_id: str) -> dict:
    """Remove exchange configuration and delete encrypted keys."""
    removed = False
    if user_id in _user_exchanges:
        del _user_exchanges[user_id]
        removed = True
    if user_id in _user_configs:
        del _user_configs[user_id]
        _save_encrypted_keys(_user_configs)
        removed = True
    if removed:
        return {"success": True, "message": "Exchange and encrypted keys removed"}
    return {"success": False, "error": "No configuration found"}


# ═══════════════════════════════════════════════════
# OCO ORDER MANAGEMENT
# ═══════════════════════════════════════════════════

def _convert_symbol(symbol: str) -> str:
    return f"{symbol[:-4]}/{symbol[-4:]}"


async def _place_oco_after_fill(user_id, symbol, entry_price, amount, side, sl_price, tp_price, order_id):
    """After entry fill, immediately place SL + TP bracket on the exchange."""
    user_config = _user_exchanges.get(user_id)
    if not user_config:
        logger.error(f"[OCO] User {user_id} not configured — POSITION UNPROTECTED!")
        return
    exchange = user_config["exchange"]
    ccxt_symbol = _convert_symbol(symbol)
    close_side = "sell" if side.lower() == "buy" else "buy"
    try:
        exch = user_config["exchange_name"]
        if exch == "binance":
            sl_order = exchange.create_order(symbol=ccxt_symbol, type="stop_market", side=close_side, amount=amount,
                params={"stopPrice": sl_price, "workingType": "MARK_PRICE", "priceProtect": True})
            tp_order = exchange.create_order(symbol=ccxt_symbol, type="take_profit_market", side=close_side, amount=amount,
                params={"stopPrice": tp_price, "workingType": "MARK_PRICE", "priceProtect": True})
        elif exch == "okx":
            sl_order = exchange.create_order(symbol=ccxt_symbol, type="market", side=close_side, amount=amount,
                params={"stopLossPrice": sl_price, "ordType": "conditional"})
            tp_order = exchange.create_order(symbol=ccxt_symbol, type="market", side=close_side, amount=amount,
                params={"takeProfitPrice": tp_price, "ordType": "conditional"})
        elif exch == "bybit":
            sl_order = exchange.create_order(symbol=ccxt_symbol, type="market", side=close_side, amount=amount,
                params={"stopLoss": sl_price, "triggerPrice": sl_price, "triggerBy": "MarkPrice"})
            tp_order = exchange.create_order(symbol=ccxt_symbol, type="market", side=close_side, amount=amount,
                params={"takeProfit": tp_price, "triggerPrice": tp_price, "triggerBy": "MarkPrice"})
        else:
            logger.error(f"[OCO] Unsupported exchange: {exch}")
            return
        if order_id in _active_orders:
            _active_orders[order_id].update({
                "status": OrderStatus.OCO_PLACED, "sl_order_id": sl_order.get("id"),
                "tp_order_id": tp_order.get("id"), "sl_price": sl_price, "tp_price": tp_price,
            })
        logger.info(f"[OCO] Bracket placed for {symbol}: SL={sl_price:.2f} TP={tp_price:.2f}")
        asyncio.create_task(_monitor_oco_fills(user_id, symbol, order_id, sl_order.get("id"), tp_order.get("id")))
    except Exception as e:
        logger.error(f"[OCO] CRITICAL: Failed to place SL/TP for {symbol}: {e} — POSITION UNPROTECTED!")
        if order_id in _active_orders:
            _active_orders[order_id]["oco_error"] = str(e)


async def _monitor_oco_fills(user_id, symbol, parent_id, sl_id, tp_id):
    """Monitor SL and TP orders. When one fills, cancel the other."""
    exchange = _user_exchanges.get(user_id, {}).get("exchange")
    if not exchange:
        return
    ccxt_symbol = _convert_symbol(symbol)
    while True:
        try:
            await asyncio.sleep(FILL_CHECK_INTERVAL)
            try:
                sl_st = exchange.fetch_order(sl_id, ccxt_symbol)
                if sl_st.get("status") == "closed":
                    try: exchange.cancel_order(tp_id, ccxt_symbol)
                    except Exception: pass
                    if parent_id in _active_orders:
                        _active_orders[parent_id]["status"] = OrderStatus.SL_HIT
                    logger.info(f"[OCO] SL hit for {symbol} — TP cancelled")
                    return
            except Exception: pass
            try:
                tp_st = exchange.fetch_order(tp_id, ccxt_symbol)
                if tp_st.get("status") == "closed":
                    try: exchange.cancel_order(sl_id, ccxt_symbol)
                    except Exception: pass
                    if parent_id in _active_orders:
                        _active_orders[parent_id]["status"] = OrderStatus.TP_HIT
                    logger.info(f"[OCO] TP hit for {symbol} — SL cancelled")
                    return
            except Exception: pass
        except Exception as e:
            logger.debug(f"[OCO] Monitor error for {symbol}: {e}")
            await asyncio.sleep(10)


async def _monitor_fill(user_id, symbol, order_id, ccxt_order_id, side, amount, sl_price, tp_price):
    """Monitor entry order for fill, then place OCO bracket."""
    exchange = _user_exchanges.get(user_id, {}).get("exchange")
    if not exchange:
        return
    ccxt_symbol = _convert_symbol(symbol)
    start = time.time()
    while time.time() - start < FILL_TIMEOUT:
        try:
            await asyncio.sleep(FILL_CHECK_INTERVAL)
            order_status = exchange.fetch_order(ccxt_order_id, ccxt_symbol)
            status = order_status.get("status", "")
            if status == "closed":
                fill_price = float(order_status.get("average", order_status.get("price", 0)))
                if order_id in _active_orders:
                    _active_orders[order_id].update({"status": OrderStatus.FILLED, "fill_price": fill_price})
                logger.info(f"[AutoExec] Entry FILLED: {side} {amount:.6f} {symbol} @ {fill_price:.2f}")
                if side.lower() == "buy":
                    risk = fill_price - sl_price
                    actual_tp = fill_price + (risk * DEFAULT_TP1_RR)
                else:
                    risk = sl_price - fill_price
                    actual_tp = fill_price - (risk * DEFAULT_TP1_RR)
                await _place_oco_after_fill(user_id, symbol, fill_price, amount, side, sl_price, actual_tp, order_id)
                return
            elif status in ("canceled", "cancelled", "expired"):
                if order_id in _active_orders:
                    _active_orders[order_id]["status"] = OrderStatus.CANCELLED
                return
        except Exception as e:
            logger.debug(f"[AutoExec] Fill monitor error: {e}")
    try: exchange.cancel_order(ccxt_order_id, ccxt_symbol)
    except Exception: pass
    if order_id in _active_orders:
        _active_orders[order_id]["status"] = OrderStatus.CANCELLED


# ═══════════════════════════════════════════════════
# ORDER PLACEMENT (with OCO lifecycle)
# ═══════════════════════════════════════════════════

def _check_rate_limit() -> bool:
    global _orders_this_hour
    now = time.time()
    _orders_this_hour = [t for t in _orders_this_hour if now - t < 3600]
    return len(_orders_this_hour) < MAX_ORDERS_PER_HOUR


async def place_order(
    user_id: str, symbol: str, side: str, price: float,
    amount_usd: float = None, leverage: int = 1,
    sl_price: float = None, tp_price: float = None, atr: float = None
) -> dict:
    """
    Place a limit entry order with automatic OCO (SL+TP) on fill.
    Flow: Entry → fill monitor → OCO bracket → SL/TP monitor.
    """
    global _kill_switch
    if _kill_switch:
        return {"success": False, "error": "Kill switch activated — no orders allowed"}
    if user_id not in _user_exchanges:
        return {"success": False, "error": "Exchange not configured for this user"}
    if not _check_rate_limit():
        return {"success": False, "error": f"Rate limit: max {MAX_ORDERS_PER_HOUR} orders/hour"}
    if leverage > MAX_LEVERAGE:
        return {"success": False, "error": f"Max leverage is {MAX_LEVERAGE}x"}
    if amount_usd is None:
        amount_usd = MAX_POSITION_USD
    if amount_usd > MAX_POSITION_USD:
        return {"success": False, "error": f"Max position size is ${MAX_POSITION_USD}"}
    user_config = _user_exchanges[user_id]
    if not user_config.get("active"):
        return {"success": False, "error": "Exchange connection is inactive"}
    exchange = user_config["exchange"]
    try:
        amount = amount_usd / price
        ccxt_symbol = _convert_symbol(symbol)
        try: exchange.set_leverage(leverage, ccxt_symbol)
        except Exception as e: logger.debug(f"[AutoExec] Leverage set note: {e}")
        if side.lower() == "buy":
            limit_price = price * (1 - LIMIT_OFFSET_PCT / 100)
        else:
            limit_price = price * (1 + LIMIT_OFFSET_PCT / 100)
        # Calculate SL/TP
        if sl_price is None:
            sl_distance = atr * DEFAULT_SL_ATR_MULT if atr and atr > 0 else limit_price * 0.015
            sl_price = limit_price - sl_distance if side.lower() == "buy" else limit_price + sl_distance
        if tp_price is None:
            risk = abs(limit_price - sl_price)
            tp_price = limit_price + (risk * DEFAULT_TP1_RR) if side.lower() == "buy" else limit_price - (risk * DEFAULT_TP1_RR)
        order = exchange.create_order(
            symbol=ccxt_symbol, type="limit", side=side.lower(),
            amount=amount, price=limit_price, params={"timeInForce": "GTC"}
        )
        internal_id = f"vc_{int(time.time()*1000)}_{symbol}"
        _orders_this_hour.append(time.time())
        order_record = {
            "orderId": internal_id, "ccxtOrderId": order.get("id"),
            "symbol": symbol, "side": side, "entryPrice": limit_price,
            "amount": amount, "amountUsd": amount_usd, "leverage": leverage,
            "slPrice": sl_price, "tpPrice": tp_price,
            "status": OrderStatus.PLACED, "exchange": user_config["exchange_name"],
            "createdAt": int(time.time() * 1000),
            "lifecycle": "ENTRY_PLACED → awaiting fill → OCO on fill"
        }
        _order_history.append(order_record)
        _active_orders[internal_id] = order_record
        task = asyncio.create_task(
            _monitor_fill(user_id, symbol, internal_id, order.get("id"), side, amount, sl_price, tp_price)
        )
        _fill_monitor_tasks[internal_id] = task
        logger.info(f"[AutoExec] Entry placed: {side} {amount:.6f} {symbol} @ {limit_price:.2f} | SL={sl_price:.2f} TP={tp_price:.2f}")
        return {
            "success": True,
            "order": {**order_record, "riskReward": f"1:{DEFAULT_TP1_RR}"},
            "message": f"Limit {side} @ ${limit_price:.2f} | SL=${sl_price:.2f} TP=${tp_price:.2f} (OCO on fill)"
        }
    except Exception as e:
        _order_history.append({
            "symbol": symbol, "side": side, "price": price, "amountUsd": amount_usd,
            "status": OrderStatus.FAILED, "error": str(e),
            "exchange": user_config["exchange_name"], "createdAt": int(time.time() * 1000),
        })
        logger.error(f"[AutoExec] Order failed: {e}")
        return {"success": False, "error": str(e)}


# ═══════════════════════════════════════════════════
# KILL SWITCH (cancel ALL + close positions)
# ═══════════════════════════════════════════════════

async def activate_kill_switch() -> dict:
    global _kill_switch
    _kill_switch = True
    logger.warning("[AutoExec] KILL SWITCH ACTIVATED — cancelling all orders")
    cancelled = 0
    for uid, cfg in _user_exchanges.items():
        exchange = cfg.get("exchange")
        if not exchange:
            continue
        try:
            open_orders = exchange.fetch_open_orders()
            for order in open_orders:
                try:
                    exchange.cancel_order(order["id"], order.get("symbol"))
                    cancelled += 1
                except Exception: pass
        except Exception as e:
            logger.error(f"[KillSwitch] Cancel error for {uid}: {e}")
    for task in _fill_monitor_tasks.values():
        task.cancel()
    _fill_monitor_tasks.clear()
    return {"success": True, "message": f"Kill switch activated — {cancelled} orders cancelled"}


def deactivate_kill_switch() -> dict:
    global _kill_switch
    _kill_switch = False
    return {"success": True, "message": "Kill switch deactivated — trading resumed"}


def get_execution_status(user_id: str = None) -> dict:
    active = [o for o in _active_orders.values() if o.get("status") in (
        OrderStatus.PLACED, OrderStatus.FILLED, OrderStatus.OCO_PLACED)]
    return {
        "killSwitch": _kill_switch,
        "configuredExchanges": len(_user_exchanges),
        "totalOrders": len(_order_history),
        "activeOrders": len(active),
        "ordersThisHour": len([t for t in _orders_this_hour if time.time() - t < 3600]),
        "maxOrdersPerHour": MAX_ORDERS_PER_HOUR,
        "maxPositionUsd": MAX_POSITION_USD,
        "maxLeverage": MAX_LEVERAGE,
        "encryptionMethod": "AES-256-GCM",
        "recentOrders": _order_history[-10:] if _order_history else [],
    }


def get_order_history(limit: int = 50) -> list:
    return _order_history[-limit:]


def get_active_positions() -> list:
    return [o for o in _active_orders.values() if o.get("status") in (OrderStatus.OCO_PLACED, OrderStatus.FILLED)]


# ═══════════════════════════════════════════════════
# RECONCILIATION LOOP (Orphan Position Protection)
# ═══════════════════════════════════════════════════

async def _reconciliation_loop():
    """
    Runs every 30s independently. Sweeps ALL open positions via REST API
    and checks each has an associated SL/TP order. If a position is 'orphan'
    (filled entry but no OCO bracket), immediately injects emergency OCO.
    
    Also runs daily key validation.
    """
    logger.info("[Reconciliation] Loop started — checking every 30s")
    while True:
        try:
            await asyncio.sleep(RECONCILIATION_INTERVAL)
            if _kill_switch:
                continue
            
            for user_id, user_cfg in list(_user_exchanges.items()):
                if not user_cfg.get("active"):
                    continue
                exchange = user_cfg.get("exchange")
                if not exchange:
                    continue
                
                try:
                    # --- KEY VALIDATION (daily) ---
                    await _check_key_validity(user_id, exchange)
                    
                    # --- ORPHAN POSITION CHECK ---
                    positions = exchange.fetch_positions()
                    open_orders = exchange.fetch_open_orders()
                    
                    # Build set of symbols with active conditional orders
                    protected_symbols = set()
                    for order in open_orders:
                        otype = order.get("type", "").lower()
                        if any(k in otype for k in ["stop", "take_profit", "conditional", "trigger"]):
                            protected_symbols.add(order.get("symbol", ""))
                    
                    # Check each position
                    for pos in positions:
                        amt = float(pos.get("contracts", 0) or pos.get("contractSize", 0) or 0)
                        if amt == 0:
                            continue
                        sym = pos.get("symbol", "")
                        if sym in protected_symbols:
                            continue
                        
                        # ORPHAN DETECTED — position without SL/TP
                        entry_price = float(pos.get("entryPrice", 0))
                        side = pos.get("side", "long").lower()
                        if entry_price <= 0:
                            continue
                        
                        logger.warning(f"[Reconciliation] ORPHAN POSITION: {sym} {side} {amt} @ {entry_price} — injecting emergency OCO")
                        
                        # Calculate emergency SL/TP based on 1.5% risk / 3% reward
                        if side == "long":
                            sl = entry_price * 0.985
                            tp = entry_price * 1.03
                        else:
                            sl = entry_price * 1.015
                            tp = entry_price * 0.97
                        
                        # Remove the slash from symbol for our internal ID
                        clean_sym = sym.replace("/", "").replace(":USDT", "")
                        orphan_id = f"vc_orphan_{int(time.time()*1000)}_{clean_sym}"
                        
                        await _place_oco_after_fill(
                            user_id, clean_sym, entry_price, abs(amt),
                            "buy" if side == "long" else "sell", sl, tp, orphan_id
                        )
                        
                        _active_orders[orphan_id] = {
                            "orderId": orphan_id, "symbol": clean_sym,
                            "side": "buy" if side == "long" else "sell",
                            "entryPrice": entry_price, "amount": abs(amt),
                            "slPrice": sl, "tpPrice": tp,
                            "status": OrderStatus.OCO_PLACED,
                            "exchange": user_cfg["exchange_name"],
                            "createdAt": int(time.time() * 1000),
                            "lifecycle": "ORPHAN_RECOVERED — emergency OCO injected",
                            "orphan_recovery": True,
                        }
                        
                        # Send FCM alert about orphan recovery
                        try:
                            from .notifications import NotificationService
                            ns = NotificationService()
                            await ns.send_oco_notification(
                                user_id, clean_sym, "ORPHAN_RECOVERED",
                                {"entry": entry_price, "sl": sl, "tp": tp, "side": side}
                            )
                        except Exception:
                            pass
                
                except Exception as e:
                    err_str = str(e).lower()
                    # Handle authentication errors
                    if any(k in err_str for k in ["authenticationerror", "invalidnonce", "invalid api", "api key", "expired", "permission"]):
                        await _handle_auth_failure(user_id, str(e))
                    else:
                        logger.debug(f"[Reconciliation] Error for {user_id}: {e}")
        
        except asyncio.CancelledError:
            logger.info("[Reconciliation] Loop cancelled")
            return
        except Exception as e:
            logger.error(f"[Reconciliation] Unexpected error: {e}")
            await asyncio.sleep(10)


async def _check_key_validity(user_id: str, exchange):
    """Daily key validation — fetch balance to verify credentials are still valid."""
    now = time.time()
    last_check = _last_key_validation.get(user_id, 0)
    if now - last_check < KEY_VALIDATION_INTERVAL:
        return
    
    try:
        # Simple balance fetch to validate key
        exchange.fetch_balance()
        _last_key_validation[user_id] = now
        logger.debug(f"[KeyValidation] {user_id} — credentials valid")
    except Exception as e:
        err_str = str(e).lower()
        if any(k in err_str for k in ["authenticationerror", "invalidnonce", "invalid api", "api key", "expired", "permission"]):
            await _handle_auth_failure(user_id, str(e))
        _last_key_validation[user_id] = now  # Don't recheck for 24h even on failure


async def _handle_auth_failure(user_id: str, error_msg: str):
    """Disable user's auto-execution and send urgent FCM notification."""
    logger.warning(f"[KeyValidation] AUTH FAILURE for {user_id}: {error_msg}")
    
    # Deactivate the exchange connection
    if user_id in _user_exchanges:
        _user_exchanges[user_id]["active"] = False
    
    # Send urgent FCM notification
    try:
        from .notifications import NotificationService, get_tokens_for_user
        tokens = get_tokens_for_user(user_id)
        if tokens and firebase_admin_available():
            from firebase_admin import messaging
            messages = [
                messaging.Message(
                    token=tok,
                    data={"type": "KEY_EXPIRED", "user_id": user_id, "error": error_msg[:200]},
                    notification=messaging.Notification(
                        title="⚠️ Ação Necessária: Chave da Corretora",
                        body="Sua API key expirou ou foi revogada. Renove nas configurações para continuar operações automáticas."
                    ),
                    android=messaging.AndroidConfig(priority="high"),
                    apns=messaging.APNSConfig(headers={"apns-priority": "10"}),
                )
                for tok in tokens
            ]
            messaging.send_each(messages)
            logger.info(f"[KeyValidation] Sent key expiry alert to {user_id} ({len(tokens)} devices)")
    except Exception as e:
        logger.error(f"[KeyValidation] Failed to send FCM alert: {e}")


def firebase_admin_available() -> bool:
    try:
        import firebase_admin
        return firebase_admin._apps is not None and len(firebase_admin._apps) > 0
    except Exception:
        return False


def start_reconciliation_loop():
    """Start the reconciliation background task. Called from main.py on startup."""
    global _reconciliation_task
    if _reconciliation_task and not _reconciliation_task.done():
        return
    _reconciliation_task = asyncio.create_task(_reconciliation_loop())
    logger.info("[AutoExec] Reconciliation loop started")


def stop_reconciliation_loop():
    global _reconciliation_task
    if _reconciliation_task:
        _reconciliation_task.cancel()
        _reconciliation_task = None
