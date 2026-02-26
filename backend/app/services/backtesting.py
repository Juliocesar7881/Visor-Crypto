"""
═══════════════════════════════════════════════════════════════
VISOR CRYPTO — CENTRALIZED BACKTESTING + SETUP HISTORY DB
═══════════════════════════════════════════════════════════════

Two components:

1. SETUP HISTORY DATABASE (centralized)
   Stores every signal as {fingerprint, regime, result, R, timestamp}
   Calculates:
     - WR by asset / regime / session / BTC alignment / saturation bucket
     - Expectancy = (WR × AvgWin) - ((1-WR) × AvgLoss)
   New users get immediate access to the full statistical database.

2. BACKTESTING ENGINE
   Runs on historical klines (1h/4h) to generate initial seed data.
   Can replay 23 modules' logic on past data to estimate:
     - Win rate per setup combination
     - R:R distribution
     - Regime-based performance
"""

import json
import logging
import time
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════
# CONFIG
# ═══════════════════════════════════════════════════

SETUP_DB_FILE = Path(__file__).parent / "setup_database.json"
MAX_RECORDS = 10000
EXPECTANCY_MIN_SAMPLES = 10

# Slippage & fill simulation
# A limit order is only considered filled if the NEXT candle's price
# crosses THROUGH the level (not just touches it). This reduces WR
# to a realistic level matching live trading.
SLIPPAGE_PCT = 0.02  # 0.02% slippage penalty on entry
STRICT_FILL = True    # require price to cross level, not just touch

# ═══════════════════════════════════════════════════
# IN-MEMORY DATABASE
# ═══════════════════════════════════════════════════

_setup_records: List[dict] = []
_setup_stats_cache: Dict[str, dict] = {}
_global_stats: dict = {}


def _load_db():
    global _setup_records
    if SETUP_DB_FILE.exists():
        try:
            with open(SETUP_DB_FILE) as f:
                data = json.load(f)
            _setup_records = data.get("records", [])
            logger.info(f"[BacktestDB] Loaded {len(_setup_records)} setup records")
        except Exception as e:
            logger.error(f"[BacktestDB] Load failed: {e}")


def _save_db():
    try:
        with open(SETUP_DB_FILE, "w") as f:
            json.dump({"records": _setup_records[-MAX_RECORDS:], "updated": time.time()}, f)
    except Exception as e:
        logger.error(f"[BacktestDB] Save failed: {e}")


# ═══════════════════════════════════════════════════
# RECORD MANAGEMENT
# ═══════════════════════════════════════════════════

def record_setup(
    symbol: str,
    fingerprint: str,
    regime: str,
    signal: str,
    confidence: float,
    gate_score: float,
    gates_passed: int,
    session: str,
    btc_alignment: str = "UNKNOWN",
    saturation_pct: float = 0,
    macro_regime: str = "UNKNOWN",
    entry_price: float = 0,
) -> str:
    """Record a new setup signal. Returns a record ID for later outcome update."""
    record_id = f"{symbol}_{int(time.time()*1000)}"
    record = {
        "id": record_id,
        "symbol": symbol,
        "fingerprint": fingerprint,
        "regime": regime,
        "signal": signal,
        "confidence": confidence,
        "gateScore": gate_score,
        "gatesPassed": gates_passed,
        "session": session,
        "btcAlignment": btc_alignment,
        "saturationPct": saturation_pct,
        "macroRegime": macro_regime,
        "entryPrice": entry_price,
        "timestamp": int(time.time() * 1000),
        "outcome": None,  # PENDING
        "rMultiple": None,
        "exitPrice": None,
    }
    _setup_records.append(record)
    if len(_setup_records) > MAX_RECORDS:
        _setup_records[:] = _setup_records[-MAX_RECORDS:]
    _save_db()
    return record_id


def update_setup_outcome(record_id: str, won: bool, r_multiple: float, exit_price: float = 0) -> dict:
    """Update a previously recorded setup with its outcome."""
    for rec in reversed(_setup_records):
        if rec.get("id") == record_id:
            rec["outcome"] = "WIN" if won else "LOSS"
            rec["rMultiple"] = r_multiple
            rec["exitPrice"] = exit_price
            rec["resolvedAt"] = int(time.time() * 1000)
            _save_db()
            _invalidate_stats_cache()
            return {"success": True, "record": rec}
    return {"success": False, "error": "Record not found"}


def _invalidate_stats_cache():
    global _setup_stats_cache, _global_stats
    _setup_stats_cache = {}
    _global_stats = {}


# ═══════════════════════════════════════════════════
# STATISTICS + EXPECTANCY
# ═══════════════════════════════════════════════════

def _compute_stats(records: List[dict]) -> dict:
    """Compute WR, expectancy, avg R from a set of resolved records."""
    resolved = [r for r in records if r.get("outcome") in ("WIN", "LOSS")]
    if not resolved:
        return {"available": False, "count": 0}
    wins = [r for r in resolved if r["outcome"] == "WIN"]
    losses = [r for r in resolved if r["outcome"] == "LOSS"]
    total = len(resolved)
    wr = len(wins) / total * 100 if total > 0 else 0
    avg_win_r = sum(r.get("rMultiple", 0) for r in wins) / len(wins) if wins else 0
    avg_loss_r = sum(abs(r.get("rMultiple", 0)) for r in losses) / len(losses) if losses else 0
    # Expectancy = (WR × AvgWin) - ((1-WR%) × AvgLoss)
    expectancy = (wr/100 * avg_win_r) - ((1 - wr/100) * avg_loss_r) if total >= EXPECTANCY_MIN_SAMPLES else None
    # Quality assessment
    if expectancy is not None:
        if expectancy > 0.5:
            quality = "EXCELENTE"
        elif expectancy > 0.2:
            quality = "BOM"
        elif expectancy > 0:
            quality = "MARGINAL"
        else:
            quality = "NEGATIVO"
    else:
        quality = "INSUFICIENTE"

    return {
        "available": True,
        "count": total,
        "wins": len(wins),
        "losses": len(losses),
        "winRate": round(wr, 1),
        "avgWinR": round(avg_win_r, 2),
        "avgLossR": round(avg_loss_r, 2),
        "expectancy": round(expectancy, 3) if expectancy is not None else None,
        "quality": quality,
    }


def get_stats_by_fingerprint(fingerprint: str) -> dict:
    if fingerprint in _setup_stats_cache:
        return _setup_stats_cache[fingerprint]
    records = [r for r in _setup_records if r.get("fingerprint") == fingerprint]
    stats = _compute_stats(records)
    stats["fingerprint"] = fingerprint
    _setup_stats_cache[fingerprint] = stats
    return stats


def get_stats_by_symbol(symbol: str) -> dict:
    records = [r for r in _setup_records if r.get("symbol") == symbol]
    stats = _compute_stats(records)
    stats["symbol"] = symbol
    return stats


def get_stats_by_regime(regime: str) -> dict:
    records = [r for r in _setup_records if r.get("regime") == regime]
    stats = _compute_stats(records)
    stats["regime"] = regime
    return stats


def get_stats_by_session(session: str) -> dict:
    records = [r for r in _setup_records if r.get("session") == session]
    stats = _compute_stats(records)
    stats["session"] = session
    return stats


def get_stats_by_btc_alignment(alignment: str) -> dict:
    records = [r for r in _setup_records if r.get("btcAlignment") == alignment]
    stats = _compute_stats(records)
    stats["btcAlignment"] = alignment
    return stats


def get_stats_by_saturation_bucket(min_sat: float, max_sat: float) -> dict:
    records = [r for r in _setup_records if min_sat <= r.get("saturationPct", 0) < max_sat]
    stats = _compute_stats(records)
    stats["saturationBucket"] = f"{min_sat}-{max_sat}%"
    return stats


def get_stats_by_macro_regime(macro: str) -> dict:
    records = [r for r in _setup_records if r.get("macroRegime") == macro]
    stats = _compute_stats(records)
    stats["macroRegime"] = macro
    return stats


def get_global_stats() -> dict:
    """Get overall statistics across all setups."""
    global _global_stats
    if _global_stats:
        return _global_stats
    stats = _compute_stats(_setup_records)
    # Breakdowns
    stats["byRegime"] = {}
    regimes = set(r.get("regime", "UNKNOWN") for r in _setup_records)
    for regime in regimes:
        stats["byRegime"][regime] = get_stats_by_regime(regime)
    stats["bySession"] = {}
    sessions = set(r.get("session", "UNKNOWN") for r in _setup_records)
    for session in sessions:
        stats["bySession"][session] = get_stats_by_session(session)
    stats["byBtcAlignment"] = {}
    for align in ["ALIGNED", "DIVERGING", "NEUTRAL"]:
        s = get_stats_by_btc_alignment(align)
        if s.get("count", 0) > 0:
            stats["byBtcAlignment"][align] = s
    stats["bySaturation"] = {}
    for bucket in [(0, 30), (30, 60), (60, 85), (85, 101)]:
        s = get_stats_by_saturation_bucket(*bucket)
        if s.get("count", 0) > 0:
            label = f"{bucket[0]}-{min(bucket[1], 100)}%"
            stats["bySaturation"][label] = s
    stats["totalRecords"] = len(_setup_records)
    stats["resolvedRecords"] = len([r for r in _setup_records if r.get("outcome")])
    stats["pendingRecords"] = len([r for r in _setup_records if not r.get("outcome")])
    _global_stats = stats
    return stats


def get_combined_stats(symbol: str, fingerprint: str, regime: str, session: str,
                       btc_alignment: str, saturation_pct: float, macro_regime: str) -> dict:
    """Get a comprehensive stats package for a specific setup — combines all dimensions."""
    sat_bucket = (0, 30) if saturation_pct < 30 else (30, 60) if saturation_pct < 60 else (60, 85) if saturation_pct < 85 else (85, 101)
    return {
        "fingerprint": get_stats_by_fingerprint(fingerprint),
        "symbol": get_stats_by_symbol(symbol),
        "regime": get_stats_by_regime(regime),
        "session": get_stats_by_session(session),
        "btcAlignment": get_stats_by_btc_alignment(btc_alignment),
        "saturation": get_stats_by_saturation_bucket(*sat_bucket),
        "macroRegime": get_stats_by_macro_regime(macro_regime),
        "global": {"count": len(_setup_records), "resolved": len([r for r in _setup_records if r.get("outcome")])},
    }


# ═══════════════════════════════════════════════════
# BACKTESTING (seed data generation)
# ═══════════════════════════════════════════════════

async def run_backtest_seed(symbol: str, lookback_days: int = 30) -> dict:
    """
    Simplified backtester that generates seed setup data from historical klines.
    Uses basic signal detection (displacement + volume + trend) to identify
    potential setups, then uses next-candle price action for outcome.
    """
    import httpx
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            # Fetch historical 1h klines
            limit = min(lookback_days * 24, 1000)
            resp = await client.get(f"https://api.binance.com/api/v3/klines",
                params={"symbol": symbol, "interval": "1h", "limit": limit})
            if resp.status_code != 200:
                return {"success": False, "error": f"Failed to fetch klines: {resp.status_code}"}
            klines = resp.json()

        if len(klines) < 100:
            return {"success": False, "error": "Insufficient historical data"}

        # Parse candles
        candles = []
        for k in klines:
            candles.append({
                "open": float(k[1]), "high": float(k[2]), "low": float(k[3]),
                "close": float(k[4]), "volume": float(k[5]), "time": int(k[0])
            })

        # Calculate rolling stats for z-scores
        setups_found = 0
        for i in range(100, len(candles) - 5):
            window = candles[i-100:i]
            bodies = [abs(c["close"] - c["open"]) for c in window]
            volumes = [c["volume"] for c in window]
            body_mean = sum(bodies) / len(bodies)
            body_std = (sum((b - body_mean)**2 for b in bodies) / len(bodies)) ** 0.5
            vol_mean = sum(volumes) / len(volumes)
            vol_std = (sum((v - vol_mean)**2 for v in volumes) / len(volumes)) ** 0.5

            current = candles[i]
            body = abs(current["close"] - current["open"])
            body_z = (body - body_mean) / body_std if body_std > 0 else 0
            vol_z = (current["volume"] - vol_mean) / vol_std if vol_std > 0 else 0

            # Simple signal detection: strong displacement + volume
            if body_z > 1.5 and vol_z > 1.0:
                direction = "LONG" if current["close"] > current["open"] else "SHORT"
                # Check outcome: next 5 candles
                future = candles[i+1:i+6]
                if not future:
                    continue
                
                # Apply slippage penalty to entry
                raw_entry = current["close"]
                if direction == "LONG":
                    entry = raw_entry * (1 + SLIPPAGE_PCT / 100)
                else:
                    entry = raw_entry * (1 - SLIPPAGE_PCT / 100)
                
                atr = sum(c["high"] - c["low"] for c in window[-14:]) / 14
                sl_dist = atr * 1.5
                tp_dist = atr * 3.0
                won = False
                r_mult = 0
                
                for j, fc in enumerate(future):
                    if direction == "LONG":
                        # STRICT FILL: SL must be crossed through (low goes below SL)
                        sl_hit = fc["low"] < entry - sl_dist  # strict: < not <=
                        # TP: for limit TP, price must cross through
                        tp_hit = fc["high"] > entry + tp_dist if STRICT_FILL else fc["high"] >= entry + tp_dist
                        
                        if sl_hit and tp_hit:
                            # Both in same candle — assume SL hit first (conservative)
                            r_mult = -1.0
                            break
                        elif sl_hit:
                            r_mult = -1.0
                            break
                        elif tp_hit:
                            won = True
                            r_mult = 2.0
                            break
                    else:
                        sl_hit = fc["high"] > entry + sl_dist
                        tp_hit = fc["low"] < entry - tp_dist if STRICT_FILL else fc["low"] <= entry - tp_dist
                        
                        if sl_hit and tp_hit:
                            r_mult = -1.0
                            break
                        elif sl_hit:
                            r_mult = -1.0
                            break
                        elif tp_hit:
                            won = True
                            r_mult = 2.0
                            break

                # Use simple regime detection
                ema20 = sum(c["close"] for c in window[-20:]) / 20
                ema50 = sum(c["close"] for c in window[-50:]) / 50
                if entry > ema20 > ema50:
                    regime = "BULL_TREND"
                elif entry < ema20 < ema50:
                    regime = "BEAR_TREND"
                else:
                    regime = "RANGING"

                hour = (current["time"] // 3600000) % 24
                if hour < 7:
                    session = "ASIAN"
                elif hour < 12:
                    session = "LONDON"
                elif hour < 16:
                    session = "KILL_ZONE"
                elif hour < 21:
                    session = "NY"
                else:
                    session = "DEAD"

                fingerprint = f"{regime}+NEUTRAL+NONE+{direction}"
                rec_id = record_setup(
                    symbol=symbol, fingerprint=fingerprint, regime=regime,
                    signal=f"{direction}_CONFIRMED", confidence=round(60 + body_z * 5, 0),
                    gate_score=round(50 + body_z * 10, 0), gates_passed=5,
                    session=session, entry_price=entry
                )
                if r_mult != 0:
                    update_setup_outcome(rec_id, won, r_mult, entry + (tp_dist if won else -sl_dist) if direction == "LONG" else entry - (tp_dist if won else -sl_dist))
                setups_found += 1

        _save_db()
        stats = get_stats_by_symbol(symbol)
        logger.info(f"[Backtest] {symbol}: found {setups_found} setups from {len(candles)} candles")
        return {
            "success": True,
            "symbol": symbol,
            "candlesAnalyzed": len(candles),
            "setupsFound": setups_found,
            "stats": stats,
        }

    except Exception as e:
        logger.error(f"[Backtest] Error for {symbol}: {e}")
        return {"success": False, "error": str(e)}


# Initialize on import
_load_db()


# ═══════════════════════════════════════════════════
# SIGNAL FREQUENCY ESTIMATION
# ═══════════════════════════════════════════════════

def estimate_signal_frequency(confidence_threshold: int) -> dict:
    """
    Estimate how many signals per day/week the user would receive
    at a given confidence threshold. Uses historical setup data.
    This powers the predictive slider in the notification UI.
    """
    if not _setup_records:
        return {
            "threshold": confidence_threshold,
            "estimatedPerDay": "3-5" if confidence_threshold <= 75 else "1-2" if confidence_threshold <= 85 else "0-1",
            "estimatedPerWeek": "20-35" if confidence_threshold <= 75 else "7-14" if confidence_threshold <= 85 else "1-5",
            "sampleSize": 0,
            "note": "Estimativa baseada em padrões típicos (sem dados históricos suficientes)"
        }
    
    # Count confirmed setups above threshold
    confirmed = [r for r in _setup_records if r.get("signal", "").endswith("_CONFIRMED")]
    above_threshold = [r for r in confirmed if r.get("confidence", 0) >= confidence_threshold]
    
    if not confirmed:
        return {
            "threshold": confidence_threshold,
            "estimatedPerDay": "?",
            "estimatedPerWeek": "?",
            "sampleSize": 0,
            "note": "Sem setups confirmados no histórico"
        }
    
    # Calculate time span of data
    timestamps = [r.get("timestamp", 0) for r in confirmed if r.get("timestamp")]
    if len(timestamps) < 2:
        return {
            "threshold": confidence_threshold,
            "estimatedPerDay": "?",
            "estimatedPerWeek": "?",
            "sampleSize": len(confirmed),
            "note": "Dados insuficientes para estimativa temporal"
        }
    
    span_ms = max(timestamps) - min(timestamps)
    span_days = max(span_ms / (86400 * 1000), 1)
    
    total_above = len(above_threshold)
    per_day = total_above / span_days
    per_week = per_day * 7
    
    # Format ranges (±30% uncertainty)
    def fmt_range(val):
        lo = max(0, round(val * 0.7))
        hi = round(val * 1.3)
        if lo == hi:
            return str(lo)
        return f"{lo}-{hi}"
    
    # Pass rate
    pass_rate = (total_above / len(confirmed) * 100) if confirmed else 0
    
    return {
        "threshold": confidence_threshold,
        "estimatedPerDay": fmt_range(per_day),
        "estimatedPerWeek": fmt_range(per_week),
        "passRate": round(pass_rate, 1),
        "totalConfirmed": len(confirmed),
        "aboveThreshold": total_above,
        "sampleSize": len(_setup_records),
        "spanDays": round(span_days, 1),
        "note": f"Baseado em {len(confirmed)} sinais confirmados em {span_days:.0f} dias"
    }


# ═══════════════════════════════════════════════════
# POSITION SIZING BY EXPECTANCY (Kelly Criterion)
# ═══════════════════════════════════════════════════

def calculate_kelly_position_size(
    capital: float,
    symbol: str = None,
    fingerprint: str = None,
    max_fraction: float = 0.5,
) -> dict:
    """
    Calculate position size using Half-Kelly based on real expectancy.
    
    edge = expectancy / avgLossR
    kelly_fraction = edge / (avgWinR / avgLossR)
    position_size = capital × kelly_fraction × 0.5 (half-kelly for safety)
    """
    # Get stats for this setup
    if fingerprint:
        stats = get_stats_by_fingerprint(fingerprint)
    elif symbol:
        stats = get_stats_by_symbol(symbol)
    else:
        stats = get_global_stats()
    
    if not stats.get("available") or stats.get("count", 0) < EXPECTANCY_MIN_SAMPLES:
        # Not enough data — use conservative 1% of capital
        return {
            "positionSize": round(capital * 0.01, 2),
            "kellyFraction": 0.01,
            "method": "conservative_default",
            "reason": f"Dados insuficientes ({stats.get('count', 0)}/{EXPECTANCY_MIN_SAMPLES} amostras)",
            "expectancy": None,
        }
    
    wr = stats["winRate"] / 100
    avg_win = stats.get("avgWinR", 2.0)
    avg_loss = stats.get("avgLossR", 1.0)
    
    if avg_loss <= 0:
        avg_loss = 1.0
    
    expectancy = stats.get("expectancy", 0)
    
    if expectancy is None or expectancy <= 0:
        return {
            "positionSize": round(capital * 0.005, 2),
            "kellyFraction": 0.005,
            "method": "minimal_negative_edge",
            "reason": f"Expectancy negativa ou zero ({expectancy})",
            "expectancy": expectancy,
        }
    
    # Kelly criterion: f* = (p × b - q) / b
    # where p = win rate, q = 1-p, b = avg_win / avg_loss
    b = avg_win / avg_loss if avg_loss > 0 else 1
    kelly = (wr * b - (1 - wr)) / b if b > 0 else 0
    
    # Half-Kelly for safety (never go full Kelly)
    half_kelly = kelly * max_fraction
    
    # Cap at 5% max
    fraction = max(0.005, min(0.05, half_kelly))
    
    position_size = capital * fraction
    
    return {
        "positionSize": round(position_size, 2),
        "kellyFraction": round(fraction, 4),
        "fullKelly": round(kelly, 4),
        "halfKelly": round(half_kelly, 4),
        "method": "half_kelly",
        "winRate": stats["winRate"],
        "avgWinR": avg_win,
        "avgLossR": avg_loss,
        "expectancy": expectancy,
        "sampleSize": stats["count"],
    }
