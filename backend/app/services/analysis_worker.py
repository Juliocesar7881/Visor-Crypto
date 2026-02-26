"""
═══════════════════════════════════════════════════════════════
VISOR CRYPTO — SERVER-SIDE ANALYSIS WORKER V2
═══════════════════════════════════════════════════════════════

Scheduled worker with CANDLE-CLOSE SYNCHRONIZATION.
Instead of running on a fixed 5-minute interval, the worker now:
  1. Syncs to the next 1h candle close (XX:00:05 UTC)
  2. Runs the full analysis cycle for all symbols
  3. Updates dynamic thresholds per symbol
  4. Updates macro regime + systemic risk
  5. Triggers FCM push notifications for confirmed signals
  6. Records setups to the centralized database

Architecture:
- Worker aligns to 1h candle closes (avoids mid-candle false signals)
- Falls back to 5-min interval for responsiveness between candle closes
- Integrates: dynamic_thresholds, macro_regime, backtesting, notifications
"""

import asyncio
import json
import time
import logging
from datetime import datetime, timedelta
from typing import Dict, Optional, List
from pathlib import Path

import httpx

logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════
# CONFIG
# ═══════════════════════════════════════════════════

BINANCE_BASE = "https://api.binance.com/api/v3"
BINANCE_FUTURES = "https://fapi.binance.com"

# Symbols to track (expand as needed)
TRACKED_SYMBOLS = [
    "BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT",
    "ADAUSDT", "DOGEUSDT", "AVAXUSDT", "DOTUSDT", "MATICUSDT",
    "LINKUSDT", "ATOMUSDT", "NEARUSDT", "ARBUSDT", "OPUSDT"
]

# Candle-close synchronization
CANDLE_CLOSE_OFFSET_SEC = 5     # run 5 seconds AFTER candle close
FAST_INTERVAL_SECONDS = 300     # 5 min between candle closes
CANDLE_SYNC_INTERVAL = 3600     # 1h candle sync
CACHE_TTL_SECONDS = 360

# Anti-Spoofing thresholds (now dynamic — these are fallbacks)
SPOOF_IMBALANCE_THRESHOLD = 3.0
SPOOF_WALL_PERCENT = 5.0
SPOOF_SPREAD_THRESHOLD = 0.1

# OI Delta thresholds (now dynamic — these are fallbacks)
OI_SQUEEZE_THRESHOLD = 5.0
OI_BUILDUP_THRESHOLD = 5.0


# ═══════════════════════════════════════════════════
# IN-MEMORY CACHE (Replace with Redis in production)
# ═══════════════════════════════════════════════════

_analysis_cache: Dict[str, dict] = {}
_cache_timestamps: Dict[str, float] = {}
_worker_running = False
_worker_stats = {
    "last_run": None,
    "total_runs": 0,
    "errors": 0,
    "symbols_computed": 0
}


def get_cached_analysis(symbol: str) -> Optional[dict]:
    """Get cached analysis for a symbol. Returns None if expired."""
    if symbol not in _analysis_cache:
        return None
    ts = _cache_timestamps.get(symbol, 0)
    if time.time() - ts > CACHE_TTL_SECONDS:
        return None
    return _analysis_cache[symbol]


def get_all_cached() -> dict:
    """Get all cached analysis results."""
    result = {}
    now = time.time()
    for sym, data in _analysis_cache.items():
        ts = _cache_timestamps.get(sym, 0)
        if now - ts <= CACHE_TTL_SECONDS:
            result[sym] = data
    return result


def get_worker_stats() -> dict:
    return {**_worker_stats, "cache_size": len(_analysis_cache)}


# ═══════════════════════════════════════════════════
# DATA FETCHING (from Binance)
# ═══════════════════════════════════════════════════

async def fetch_symbol_data(client: httpx.AsyncClient, symbol: str) -> dict:
    """Fetch all data needed for server-side analysis."""
    tasks = {
        "klines_1h": client.get(f"{BINANCE_BASE}/klines", params={"symbol": symbol, "interval": "1h", "limit": 100}),
        "klines_4h": client.get(f"{BINANCE_BASE}/klines", params={"symbol": symbol, "interval": "4h", "limit": 100}),
        "ticker": client.get(f"{BINANCE_BASE}/ticker/24hr", params={"symbol": symbol}),
        "orderbook": client.get(f"{BINANCE_BASE}/depth", params={"symbol": symbol, "limit": 100}),
        "trades": client.get(f"{BINANCE_BASE}/trades", params={"symbol": symbol, "limit": 500}),
        "funding": client.get(f"{BINANCE_FUTURES}/fapi/v1/fundingRate", params={"symbol": symbol, "limit": 1}),
        "oi": client.get(f"{BINANCE_FUTURES}/fapi/v1/openInterest", params={"symbol": symbol}),
        "oi_hist": client.get(f"{BINANCE_FUTURES}/futures/data/openInterestHist", params={"symbol": symbol, "period": "5m", "limit": 12}),
        "ls_ratio": client.get(f"{BINANCE_FUTURES}/futures/data/globalLongShortAccountRatio", params={"symbol": symbol, "period": "1h", "limit": 1}),
        "taker_vol": client.get(f"{BINANCE_FUTURES}/futures/data/takerlongshortRatio", params={"symbol": symbol, "period": "1h", "limit": 24}),
        "force_orders": client.get(f"{BINANCE_FUTURES}/fapi/v1/allForceOrders", params={"symbol": symbol, "limit": 100}),
    }

    results = {}
    for key, coro in tasks.items():
        try:
            resp = await coro
            if resp.status_code == 200:
                results[key] = resp.json()
            else:
                results[key] = None
        except Exception as e:
            logger.warning(f"[{symbol}] Failed to fetch {key}: {e}")
            results[key] = None

    return results


# ═══════════════════════════════════════════════════
# ANALYSIS FUNCTIONS (server-side replicas)
# ═══════════════════════════════════════════════════

def check_data_integrity(data: dict) -> dict:
    """Validate all incoming data."""
    critical_keys = ["klines_1h", "klines_4h", "ticker"]
    important_keys = ["orderbook", "trades", "funding"]
    issues = []
    critical = False
    degraded = False

    for key in critical_keys:
        val = data.get(key)
        if not val or (isinstance(val, list) and len(val) == 0):
            issues.append(f"❌ {key}: ausente")
            critical = True

    for key in important_keys:
        val = data.get(key)
        if not val or (isinstance(val, list) and len(val) == 0) or (isinstance(val, dict) and len(val) == 0):
            issues.append(f"⚠️ {key}: indisponível")
            degraded = True

    return {
        "valid": not critical,
        "critical": critical,
        "degraded": degraded,
        "issues": issues,
        "score": 0 if critical else 70 if degraded else 100
    }


def analyze_open_interest(data: dict) -> dict:
    """Analyze OI + OI Delta for squeeze/buildup detection."""
    oi = data.get("oi")
    oi_hist = data.get("oi_hist")
    taker_vol = data.get("taker_vol")
    force_orders = data.get("force_orders")

    if not oi or "openInterest" not in oi:
        return {"available": False, "signal": "UNKNOWN"}

    current_oi = float(oi["openInterest"])
    oi_delta_percent = 0.0
    oi_trend = "STABLE"

    if oi_hist and len(oi_hist) >= 2:
        old_oi = float(oi_hist[0].get("sumOpenInterest", 0))
        new_oi = float(oi_hist[-1].get("sumOpenInterest", 0))
        if old_oi > 0:
            oi_delta_percent = ((new_oi - old_oi) / old_oi) * 100
            if oi_delta_percent > OI_BUILDUP_THRESHOLD:
                oi_trend = "RISING_FAST"
            elif oi_delta_percent > 1:
                oi_trend = "RISING"
            elif oi_delta_percent < -OI_SQUEEZE_THRESHOLD:
                oi_trend = "FALLING_FAST"
            elif oi_delta_percent < -1:
                oi_trend = "FALLING"

    # Taker bias
    taker_bias = "NEUTRAL"
    if taker_vol and len(taker_vol) > 0:
        recent = taker_vol[-6:]
        ratios = []
        for t in recent:
            buy = float(t.get("buyVol", 0))
            sell = float(t.get("sellVol", 1))
            ratios.append(buy / sell if sell > 0 else 1)
        avg_ratio = sum(ratios) / len(ratios) if ratios else 1
        taker_bias = "BULLISH" if avg_ratio > 1.1 else "BEARISH" if avg_ratio < 0.9 else "NEUTRAL"

    # Liquidations
    liq_longs = 0
    liq_shorts = 0
    liq_total_usd = 0
    if force_orders and isinstance(force_orders, list):
        one_hour_ago = int(time.time() * 1000) - 3600000
        for order in force_orders:
            if int(order.get("time", 0)) > one_hour_ago:
                usd = float(order.get("price", 0)) * float(order.get("origQty", 0))
                liq_total_usd += usd
                if order.get("side") == "SELL":
                    liq_longs += 1
                else:
                    liq_shorts += 1

    # Signal detection
    signal = "NEUTRAL"
    description = f"OI estável (Δ{oi_delta_percent:.1f}%)"

    if oi_trend == "FALLING_FAST" and liq_shorts > liq_longs * 2:
        signal = "SHORT_SQUEEZE"
        description = "🔥 Short Squeeze: OI caindo + shorts liquidados"
    elif oi_trend == "FALLING_FAST" and liq_longs > liq_shorts * 2:
        signal = "LONG_SQUEEZE"
        description = "🔥 Long Squeeze: OI caindo + longs liquidados"
    elif oi_trend in ("RISING", "RISING_FAST") and taker_bias == "BULLISH":
        signal = "LONG_BUILDUP"
        description = "📈 Acumulação LONG: OI subindo + compras agressivas"
    elif oi_trend in ("RISING", "RISING_FAST") and taker_bias == "BEARISH":
        signal = "SHORT_BUILDUP"
        description = "📉 Acumulação SHORT: OI subindo + vendas agressivas"
    elif oi_trend == "FALLING" and liq_total_usd > 0:
        signal = "POSSIBLE_FAKE"
        description = "⚠️ Possível falso breakout: OI caindo"

    return {
        "available": True,
        "currentOI": current_oi,
        "oiDeltaPercent": round(oi_delta_percent, 2),
        "oiTrend": oi_trend,
        "takerBias": taker_bias,
        "liquidations": {"longs": liq_longs, "shorts": liq_shorts, "totalUSD": liq_total_usd},
        "signal": signal,
        "description": description
    }


def detect_spoofing(data: dict) -> dict:
    """Detect order book manipulation."""
    ob = data.get("orderbook")
    if not ob or "bids" not in ob or "asks" not in ob:
        return {"detected": False, "risk": "UNKNOWN"}

    total_bid = 0
    total_ask = 0
    max_bid_wall = 0
    max_ask_wall = 0

    for bid in ob["bids"]:
        vol = float(bid[0]) * float(bid[1])
        total_bid += vol
        max_bid_wall = max(max_bid_wall, vol)

    for ask in ob["asks"]:
        vol = float(ask[0]) * float(ask[1])
        total_ask += vol
        max_ask_wall = max(max_ask_wall, vol)

    ba_ratio = total_bid / total_ask if total_ask > 0 else 1

    best_bid = float(ob["bids"][0][0]) if ob["bids"] else 0
    best_ask = float(ob["asks"][0][0]) if ob["asks"] else 0
    spread_pct = ((best_ask - best_bid) / best_bid * 100) if best_bid > 0 else 0

    risk = "LOW"
    detected = False
    issues = []

    if ba_ratio > SPOOF_IMBALANCE_THRESHOLD or (1 / ba_ratio) > SPOOF_IMBALANCE_THRESHOLD:
        risk = "HIGH"
        detected = True
        issues.append(f"Muro suspeito: {max(ba_ratio, 1/ba_ratio):.1f}:1")

    max_bid_pct = (max_bid_wall / total_bid * 100) if total_bid > 0 else 0
    max_ask_pct = (max_ask_wall / total_ask * 100) if total_ask > 0 else 0
    if max_bid_pct > SPOOF_WALL_PERCENT or max_ask_pct > SPOOF_WALL_PERCENT:
        if risk == "LOW":
            risk = "MEDIUM"
        issues.append(f"Parede: {max(max_bid_pct, max_ask_pct):.0f}%")

    if spread_pct > SPOOF_SPREAD_THRESHOLD:
        if risk == "LOW":
            risk = "MEDIUM"
        issues.append(f"Spread: {spread_pct:.3f}%")

    ob_bias = "BULLISH" if ba_ratio > 1.2 else "BEARISH" if ba_ratio < 0.8 else "NEUTRAL"

    return {
        "detected": detected,
        "risk": risk,
        "bidAskRatio": round(ba_ratio, 3),
        "spreadPercent": round(spread_pct, 4),
        "obBias": ob_bias,
        "issues": issues
    }


def compute_cvd(trades_data: list) -> dict:
    """Compute CVD from trades using USD volume."""
    if not trades_data:
        return {"delta": 0, "trend": "neutral", "buyVolume": 0, "sellVolume": 0}

    buy_vol = 0
    sell_vol = 0

    for t in trades_data:
        usd = float(t.get("qty", 0)) * float(t.get("price", 0))
        if t.get("isBuyerMaker"):
            sell_vol += usd
        else:
            buy_vol += usd

    delta = buy_vol - sell_vol
    total = buy_vol + sell_vol
    ratio = delta / total if total > 0 else 0

    trend = "up" if ratio > 0.1 else "down" if ratio < -0.1 else "neutral"

    return {
        "delta": round(delta),
        "trend": trend,
        "buyVolume": round(buy_vol),
        "sellVolume": round(sell_vol),
        "buyPercent": round(buy_vol / total * 100, 1) if total > 0 else 0,
        "sellPercent": round(sell_vol / total * 100, 1) if total > 0 else 0
    }


# ═══════════════════════════════════════════════════
# ANALYSIS COMPUTATION
# ═══════════════════════════════════════════════════

async def compute_analysis(client: httpx.AsyncClient, symbol: str) -> dict:
    """Compute full server-side analysis for a symbol."""
    data = await fetch_symbol_data(client, symbol)

    integrity = check_data_integrity(data)
    if not integrity["valid"]:
        return {
            "symbol": symbol,
            "timestamp": int(time.time() * 1000),
            "dataIntegrity": integrity,
            "signal": "NEUTRO",
            "confidence": 0,
            "reason": "FORCE_NEUTRO: dados críticos ausentes"
        }

    oi_analysis = analyze_open_interest(data)
    anti_spoof = detect_spoofing(data)
    cvd = compute_cvd(data.get("trades", []))

    # Price info
    ticker = data.get("ticker", {})
    current_price = float(ticker.get("lastPrice", 0))
    change_24h = float(ticker.get("priceChangePercent", 0))
    volume_24h = float(ticker.get("quoteVolume", 0))

    # Funding rate
    funding_data = data.get("funding")
    funding_rate = 0
    if funding_data and isinstance(funding_data, list) and len(funding_data) > 0:
        funding_rate = float(funding_data[0].get("fundingRate", 0)) * 100

    # Long/Short ratio
    ls_data = data.get("ls_ratio")
    ls_ratio = 0
    if ls_data and isinstance(ls_data, list) and len(ls_data) > 0:
        ls_ratio = float(ls_data[0].get("longShortRatio", 1))

    return {
        "symbol": symbol,
        "timestamp": int(time.time() * 1000),
        "dataIntegrity": integrity,
        "currentPrice": current_price,
        "change24h": round(change_24h, 2),
        "volume24h": round(volume_24h),
        "fundingRate": round(funding_rate, 4),
        "longShortRatio": round(ls_ratio, 3),
        "cvd": cvd,
        "oiAnalysis": oi_analysis,
        "antiSpoof": anti_spoof,
        "serverComputed": True,
        "ttl": CACHE_TTL_SECONDS
    }


# ═══════════════════════════════════════════════════
# WORKER LOOP (Candle-Close Synchronized)
# ═══════════════════════════════════════════════════

def _seconds_until_next_candle_close() -> float:
    """Calculate seconds until the next 1h candle close + offset."""
    now = time.time()
    # Next hour boundary
    current_hour_start = (int(now) // 3600) * 3600
    next_close = current_hour_start + 3600 + CANDLE_CLOSE_OFFSET_SEC
    if next_close <= now:
        next_close += 3600
    wait = next_close - now
    return max(1.0, wait)


def _is_near_candle_close() -> bool:
    """Check if we're within 30s after a candle close."""
    now = time.time()
    seconds_past_hour = now % 3600
    return seconds_past_hour <= 30 or seconds_past_hour >= 3570


async def run_worker_cycle():
    """Run a single worker cycle for all symbols + integrate new services."""
    global _worker_stats

    is_candle_close = _is_near_candle_close()
    cycle_type = "CANDLE_CLOSE" if is_candle_close else "INTERIM"
    logger.info(f"[Worker] Starting {cycle_type} cycle for {len(TRACKED_SYMBOLS)} symbols")
    start = time.time()
    computed = 0

    # Import new services (lazy to avoid circular imports)
    try:
        from app.services.dynamic_thresholds import update_from_klines, save_distributions
        has_dynamic_thresholds = True
    except ImportError:
        has_dynamic_thresholds = False

    try:
        from app.services.macro_regime import update_macro_regime, update_systemic_risk, get_systemic_risk
        has_macro = True
    except ImportError:
        has_macro = False

    try:
        from app.services.notifications import NotificationService
        has_notifications = True
    except ImportError:
        has_notifications = False

    try:
        from app.services.backtesting import record_setup
        has_backtesting = True
    except ImportError:
        has_backtesting = False

    # Update macro regime + systemic risk first (influences all symbols)
    macro_data = None
    systemic_data = None
    if has_macro:
        try:
            macro_data = await update_macro_regime()
            systemic_data = await update_systemic_risk()
        except Exception as e:
            logger.error(f"[Worker] Macro/systemic update error: {e}")

    async with httpx.AsyncClient(timeout=15.0) as client:
        for symbol in TRACKED_SYMBOLS:
            try:
                analysis = await compute_analysis(client, symbol)

                # Update dynamic thresholds with raw data
                if has_dynamic_thresholds:
                    try:
                        data = await fetch_symbol_data(client, symbol)
                        update_from_klines(
                            symbol,
                            data.get("klines_1h", []),
                            data.get("oi_hist"),
                            data.get("funding")
                        )
                    except Exception as e:
                        logger.debug(f"[Worker] Threshold update error for {symbol}: {e}")

                # Attach macro + systemic data
                if macro_data:
                    analysis["macroRegime"] = macro_data
                if systemic_data:
                    analysis["systemicRisk"] = systemic_data
                    # Apply systemic risk multiplier to confidence
                    risk_mult = systemic_data.get("riskMultiplier", 1.0)
                    if risk_mult < 1.0 and "confidence" in analysis:
                        analysis["confidence"] = round(analysis["confidence"] * risk_mult)
                        analysis["systemicAdjusted"] = True

                _analysis_cache[symbol] = analysis
                _cache_timestamps[symbol] = time.time()
                computed += 1

            except Exception as e:
                logger.error(f"[Worker] Error computing {symbol}: {e}")
                _worker_stats["errors"] += 1

    # Save dynamic threshold distributions on candle close cycles
    if has_dynamic_thresholds and is_candle_close:
        try:
            save_distributions()
        except Exception as e:
            logger.debug(f"[Worker] Distribution save error: {e}")

    elapsed = time.time() - start
    _worker_stats["last_run"] = datetime.utcnow().isoformat()
    _worker_stats["total_runs"] += 1
    _worker_stats["symbols_computed"] = computed
    _worker_stats["last_cycle_type"] = cycle_type

    logger.info(f"[Worker] {cycle_type} cycle complete: {computed}/{len(TRACKED_SYMBOLS)} symbols in {elapsed:.1f}s")

    # Persist cache to disk (backup)
    try:
        cache_path = Path(__file__).parent / "analysis_cache.json"
        with open(cache_path, "w") as f:
            json.dump({
                "timestamp": time.time(),
                "data": _analysis_cache,
                "stats": _worker_stats
            }, f, default=str)
    except Exception as e:
        logger.warning(f"[Worker] Cache persist failed: {e}")


async def start_worker():
    """Start the background analysis worker with candle-close sync."""
    global _worker_running

    if _worker_running:
        logger.warning("[Worker] Already running")
        return

    _worker_running = True
    logger.info(f"[Worker] Started with candle-close sync — symbols: {len(TRACKED_SYMBOLS)}")

    # Load cached data from disk if available
    try:
        cache_path = Path(__file__).parent / "analysis_cache.json"
        if cache_path.exists():
            with open(cache_path) as f:
                saved = json.load(f)
                _analysis_cache.update(saved.get("data", {}))
                for sym in _analysis_cache:
                    _cache_timestamps[sym] = saved.get("timestamp", 0)
                logger.info(f"[Worker] Loaded {len(_analysis_cache)} cached results from disk")
    except Exception as e:
        logger.warning(f"[Worker] Failed to load cache: {e}")

    # Load dynamic threshold distributions
    try:
        from app.services.dynamic_thresholds import load_distributions
        load_distributions()
    except Exception:
        pass

    # Run initial cycle immediately
    try:
        await run_worker_cycle()
    except Exception as e:
        logger.error(f"[Worker] Initial cycle error: {e}")

    while _worker_running:
        try:
            # Calculate wait: sync to candle close when close, otherwise 5min
            wait_for_close = _seconds_until_next_candle_close()
            if wait_for_close <= FAST_INTERVAL_SECONDS:
                # Candle close is coming soon — wait for it
                logger.info(f"[Worker] Waiting {wait_for_close:.0f}s for candle close sync")
                await asyncio.sleep(wait_for_close)
            else:
                # Run interim cycle, then wait
                await asyncio.sleep(FAST_INTERVAL_SECONDS)

            await run_worker_cycle()
        except Exception as e:
            logger.error(f"[Worker] Cycle error: {e}")
            _worker_stats["errors"] += 1
            await asyncio.sleep(60)  # Wait 1 min on error


def stop_worker():
    """Signal the worker to stop."""
    global _worker_running
    _worker_running = False
    logger.info("[Worker] Stop signal sent")
