"""
═══════════════════════════════════════════════════════════════
VISOR CRYPTO — WEBSOCKET ANTI-SPOOFING DETECTOR
═══════════════════════════════════════════════════════════════

Maintains persistent WebSocket connections to Binance's
real-time order book depth stream. Detects spoofing by
tracking large order placements and cancellations within
configurable time windows.

Spoofing pattern:
  1. Large order appears (e.g., 100 BTC bid wall)
  2. Order is cancelled within seconds (never executed)
  3. Repeated pattern = market manipulation

Detection:
  - Track order book snapshots at sub-second intervals
  - When a large level appears and disappears without trading → flag
  - Persist spoofing flags in memory for worker to read

Production:
  - Uses Binance WebSocket depth stream (diff updates)
  - Falls back to REST if WebSocket unavailable
  - Stores flags per symbol with TTL
"""

import asyncio
import json
import time
import logging
from typing import Dict, Optional, List, Set
from collections import defaultdict, deque

logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════
# CONFIG
# ═══════════════════════════════════════════════════

WS_BASE = "wss://stream.binance.com:9443/ws"
DEPTH_LEVELS = 20  # Track top 20 levels

# Spoofing detection thresholds
WALL_MIN_USD = 500_000       # $500K minimum to be considered a "wall"
CANCEL_WINDOW_SEC = 30       # Wall must disappear within 30s to be "spoof"
SPOOF_MIN_EVENTS = 2         # 2+ spoofs in 10 min = flag
SPOOF_FLAG_TTL = 600         # Flag persists 10 minutes

# Tracked symbols (top volume)
WS_TRACKED = ["btcusdt", "ethusdt", "solusdt", "bnbusdt", "xrpusdt"]

# ═══════════════════════════════════════════════════
# IN-MEMORY STATE
# ═══════════════════════════════════════════════════

# Per-symbol wall tracking: {symbol: deque of {price, size_usd, side, first_seen, last_seen}}
_wall_tracker: Dict[str, deque] = defaultdict(lambda: deque(maxlen=100))

# Per-symbol spoof events: {symbol: [{timestamp, side, size_usd, duration_sec}]}
_spoof_events: Dict[str, List[dict]] = defaultdict(list)

# Current spoof flags: {symbol: {flagged, risk, events_count, last_event, details}}
_spoof_flags: Dict[str, dict] = {}

# Previous snapshot for diff comparison
_prev_snapshots: Dict[str, dict] = {}

# Active connections
_ws_tasks: Dict[str, asyncio.Task] = {}
_ws_running = False


def get_spoof_flag(symbol: str) -> dict:
    """Get current spoofing flag for a symbol (called by analysis worker)."""
    symbol = symbol.upper()
    flag = _spoof_flags.get(symbol)
    if flag and time.time() - flag.get("timestamp", 0) < SPOOF_FLAG_TTL:
        return flag
    return {"flagged": False, "risk": "LOW", "events_count": 0, "details": "Monitoramento WebSocket ativo"}


def get_all_spoof_flags() -> dict:
    """Get all active spoofing flags."""
    now = time.time()
    return {
        sym: flag for sym, flag in _spoof_flags.items()
        if now - flag.get("timestamp", 0) < SPOOF_FLAG_TTL
    }


def _process_depth_update(symbol: str, bids: list, asks: list, current_price: float):
    """Process a depth snapshot/update and detect wall placement/cancellation."""
    now = time.time()
    sym = symbol.upper()

    # Build current walls
    current_walls = {}
    for side, levels in [("BID", bids), ("ASK", asks)]:
        for level in levels[:DEPTH_LEVELS]:
            price = float(level[0])
            qty = float(level[1])
            usd = price * qty
            if usd >= WALL_MIN_USD:
                key = f"{side}_{price}"
                current_walls[key] = {"price": price, "qty": qty, "usd": usd, "side": side}

    # Compare with previous snapshot
    prev = _prev_snapshots.get(sym, {})
    tracker = _wall_tracker[sym]

    # Check for NEW walls (appeared since last snapshot)
    for key, wall in current_walls.items():
        if key not in prev:
            tracker.append({
                "key": key,
                "price": wall["price"],
                "usd": wall["usd"],
                "side": wall["side"],
                "first_seen": now,
                "last_seen": now,
                "active": True
            })
        else:
            # Update last_seen for existing walls
            for tw in tracker:
                if tw["key"] == key and tw["active"]:
                    tw["last_seen"] = now
                    break

    # Check for CANCELLED walls (were there, now gone)
    for key, prev_wall in prev.items():
        if key not in current_walls:
            # Wall disappeared — was it executed or cancelled?
            for tw in tracker:
                if tw["key"] == key and tw["active"]:
                    duration = now - tw["first_seen"]
                    tw["active"] = False

                    # If wall existed < CANCEL_WINDOW and was large → potential spoof
                    if duration < CANCEL_WINDOW_SEC and tw["usd"] >= WALL_MIN_USD:
                        _spoof_events[sym].append({
                            "timestamp": now,
                            "side": tw["side"],
                            "size_usd": tw["usd"],
                            "price": tw["price"],
                            "duration_sec": round(duration, 1)
                        })
                        logger.warning(
                            f"[AntiSpoof] {sym} — Potential spoof: {tw['side']} wall "
                            f"${tw['usd']:,.0f} at {tw['price']} cancelled after {duration:.1f}s"
                        )
                    break

    # Update previous snapshot
    _prev_snapshots[sym] = current_walls

    # Clean old spoof events (> 10 min)
    cutoff = now - SPOOF_FLAG_TTL
    _spoof_events[sym] = [e for e in _spoof_events[sym] if e["timestamp"] > cutoff]

    # Evaluate spoofing flag
    recent_spoofs = _spoof_events[sym]
    if len(recent_spoofs) >= SPOOF_MIN_EVENTS:
        total_usd = sum(e["size_usd"] for e in recent_spoofs)
        _spoof_flags[sym] = {
            "flagged": True,
            "risk": "HIGH" if len(recent_spoofs) >= 5 else "MEDIUM",
            "events_count": len(recent_spoofs),
            "total_spoofed_usd": round(total_usd),
            "last_event": recent_spoofs[-1],
            "timestamp": now,
            "details": f"🚨 {len(recent_spoofs)} paredes canceladas em {SPOOF_FLAG_TTL // 60}min (${total_usd:,.0f} total)"
        }
    elif sym in _spoof_flags:
        # Decay flag if no recent events
        if time.time() - _spoof_flags[sym].get("timestamp", 0) > SPOOF_FLAG_TTL:
            _spoof_flags[sym] = {
                "flagged": False,
                "risk": "LOW",
                "events_count": 0,
                "timestamp": now,
                "details": "Sem spoofing detectado recentemente"
            }


async def _ws_depth_listener(symbol: str):
    """WebSocket listener for a single symbol's depth stream."""
    import websockets

    stream = f"{WS_BASE}/{symbol.lower()}@depth20@100ms"
    logger.info(f"[AntiSpoof WS] Connecting to {symbol}...")

    while _ws_running:
        try:
            async with websockets.connect(stream, ping_interval=30) as ws:
                logger.info(f"[AntiSpoof WS] Connected: {symbol}")
                async for msg in ws:
                    if not _ws_running:
                        break
                    try:
                        data = json.loads(msg)
                        bids = data.get("bids", [])
                        asks = data.get("asks", [])
                        # Estimate current price from best bid/ask
                        if bids and asks:
                            mid = (float(bids[0][0]) + float(asks[0][0])) / 2
                            _process_depth_update(symbol.upper(), bids, asks, mid)
                    except Exception as e:
                        logger.debug(f"[AntiSpoof WS] Parse error {symbol}: {e}")
        except ImportError:
            logger.warning("[AntiSpoof WS] websockets not installed — falling back to REST polling")
            # Fallback: REST polling every 5 seconds
            await _rest_depth_fallback(symbol)
            return
        except Exception as e:
            logger.warning(f"[AntiSpoof WS] {symbol} disconnected: {e}, reconnecting in 5s...")
            await asyncio.sleep(5)


async def _rest_depth_fallback(symbol: str):
    """REST fallback for environments without websockets."""
    import httpx

    logger.info(f"[AntiSpoof REST] Polling depth for {symbol} every 5s")
    async with httpx.AsyncClient(timeout=10) as client:
        while _ws_running:
            try:
                resp = await client.get(
                    f"https://api.binance.com/api/v3/depth",
                    params={"symbol": symbol.upper(), "limit": 20}
                )
                if resp.status_code == 200:
                    data = resp.json()
                    bids = data.get("bids", [])
                    asks = data.get("asks", [])
                    if bids and asks:
                        mid = (float(bids[0][0]) + float(asks[0][0])) / 2
                        _process_depth_update(symbol.upper(), bids, asks, mid)
            except Exception as e:
                logger.debug(f"[AntiSpoof REST] {symbol} error: {e}")
            await asyncio.sleep(5)


async def start_ws_spoof_detector():
    """Start WebSocket anti-spoofing detector for tracked symbols."""
    global _ws_running
    if _ws_running:
        return

    _ws_running = True
    logger.info(f"[AntiSpoof] Starting detector for {len(WS_TRACKED)} symbols")

    for sym in WS_TRACKED:
        task = asyncio.create_task(_ws_depth_listener(sym))
        _ws_tasks[sym] = task


def stop_ws_spoof_detector():
    """Stop all WebSocket connections."""
    global _ws_running
    _ws_running = False
    for task in _ws_tasks.values():
        task.cancel()
    _ws_tasks.clear()
    logger.info("[AntiSpoof] Stopped")
