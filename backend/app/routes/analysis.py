"""
API routes for server-side analysis cache.
Serves pre-computed analysis results to all clients (read-only, scalable).
Includes V6 endpoints: OCO, notifications, thresholds, macro, backtesting.
"""

from fastapi import APIRouter, Query
from typing import Optional

from app.services.analysis_worker import (
    get_cached_analysis,
    get_all_cached,
    get_worker_stats,
    TRACKED_SYMBOLS
)
from app.services.ws_antispoof import get_spoof_flag, get_all_spoof_flags
from app.services.multi_exchange import fetch_multi_exchange_data, get_cached_multi_exchange
from app.services.auto_execution import (
    configure_exchange,
    remove_exchange,
    place_order,
    activate_kill_switch,
    deactivate_kill_switch,
    get_execution_status,
    get_order_history,
    get_active_positions,
)
from app.services.notifications import (
    set_user_notification_prefs,
    get_user_notification_prefs,
    register_fcm_token,
    unregister_fcm_token,
)
from app.services.dynamic_thresholds import (
    get_thresholds,
    get_all_thresholds,
    get_threshold_summary,
)
from app.services.macro_regime import get_macro_regime, get_systemic_risk
from app.services.backtesting import (
    get_global_stats,
    get_stats_by_symbol,
    get_stats_by_fingerprint,
    get_combined_stats,
    run_backtest_seed,
    record_setup,
    update_setup_outcome,
    estimate_signal_frequency,
    calculate_kelly_position_size,
)
from app.services.auto_execution import start_reconciliation_loop

router = APIRouter(prefix="/analysis", tags=["Server Analysis"])


@router.get("/symbol/{symbol}")
async def get_symbol_analysis(symbol: str):
    """Get cached analysis for a specific symbol."""
    symbol = symbol.upper()
    cached = get_cached_analysis(symbol)

    if cached is None:
        return {
            "symbol": symbol,
            "cached": False,
            "message": "Análise não disponível no cache. Aguarde o próximo ciclo do worker (5 min)."
        }

    return {
        "symbol": symbol,
        "cached": True,
        **cached
    }


@router.get("/all")
async def get_all_analysis():
    """Get cached analysis for all tracked symbols."""
    return {
        "symbols": get_all_cached(),
        "tracked": TRACKED_SYMBOLS,
        "count": len(get_all_cached())
    }


@router.get("/status")
async def get_worker_status():
    """Get worker health/status info."""
    stats = get_worker_stats()
    return {
        "worker": "analysis",
        "status": "running" if stats.get("total_runs", 0) > 0 else "starting",
        **stats,
        "tracked_symbols": TRACKED_SYMBOLS
    }


@router.get("/symbols")
async def list_tracked_symbols():
    """List all tracked symbols."""
    return {"symbols": TRACKED_SYMBOLS}


# ═══════════════════════════════════════════════════
# V5: ANTI-SPOOFING ENDPOINTS
# ═══════════════════════════════════════════════════

@router.get("/spoof/{symbol}")
async def get_spoof_status(symbol: str):
    """Get real-time spoof detection flags for a symbol."""
    symbol = symbol.lower()
    flag = get_spoof_flag(symbol)
    return {"symbol": symbol, "spoof": flag}


@router.get("/spoof")
async def get_all_spoof_status():
    """Get spoof flags for all tracked symbols."""
    return {"spoof_flags": get_all_spoof_flags()}


# ═══════════════════════════════════════════════════
# V5: MULTI-EXCHANGE ENDPOINTS
# ═══════════════════════════════════════════════════

@router.get("/multi-exchange/{symbol}")
async def get_multi_exchange(symbol: str):
    """Get aggregated OI/funding from multiple exchanges."""
    symbol = symbol.upper()
    data = await fetch_multi_exchange_data(symbol)
    return {"symbol": symbol, **data}


@router.get("/multi-exchange")
async def get_all_multi_exchange():
    """Get cached multi-exchange data for all tracked symbols."""
    results = {}
    for sym in TRACKED_SYMBOLS:
        cached = get_cached_multi_exchange(sym)
        if cached:
            results[sym] = cached
    return {"data": results, "count": len(results)}


# ═══════════════════════════════════════════════════
# V5: AUTO-EXECUTION ENDPOINTS
# ═══════════════════════════════════════════════════

@router.post("/execution/configure")
async def configure_execution(
    user_id: str,
    exchange: str,
    api_key: str,
    secret: str,
    password: str = None
):
    """Configure exchange API credentials for auto-execution."""
    result = configure_exchange(user_id, exchange, api_key, secret, password)
    return result


@router.delete("/execution/configure/{user_id}")
async def remove_execution(user_id: str):
    """Remove exchange configuration."""
    return remove_exchange(user_id)


@router.post("/execution/order")
async def execute_order(
    user_id: str,
    symbol: str,
    side: str,
    price: float,
    amount_usd: float = None,
    leverage: int = 1,
    sl_price: float = None,
    tp_price: float = None,
    atr: float = None
):
    """Place a limit order with automatic OCO (SL+TP) on fill."""
    result = await place_order(user_id, symbol, side, price, amount_usd, leverage, sl_price, tp_price, atr)
    return result


@router.post("/execution/kill-switch")
async def toggle_kill_switch(activate: bool = True):
    """Activate or deactivate the kill switch."""
    if activate:
        return await activate_kill_switch()
    else:
        return deactivate_kill_switch()


@router.get("/execution/status")
async def get_exec_status(user_id: str = None):
    """Get execution service status."""
    return get_execution_status(user_id)


@router.get("/execution/history")
async def get_exec_history(limit: int = 50):
    """Get order history."""
    return {"orders": get_order_history(limit)}


@router.get("/execution/positions")
async def get_positions():
    """Get active positions with OCO brackets."""
    return {"positions": get_active_positions()}


# ═══════════════════════════════════════════════════
# V6: NOTIFICATION PREFERENCES
# ═══════════════════════════════════════════════════

@router.post("/notifications/prefs")
async def set_notif_prefs(user_id: str, enabled: bool = True, confidence_threshold: int = 75,
                           notify_setup: bool = True, notify_regime: bool = False,
                           notify_score_jump: bool = False, notify_kill_switch: bool = True,
                           notify_systemic_risk: bool = True, notify_oco_fill: bool = True):
    """Set notification preferences. Confidence threshold: 70–100%."""
    prefs = {
        "enabled": enabled,
        "confidenceThreshold": confidence_threshold,
        "notifySetupConfirmed": notify_setup,
        "notifyRegimeChange": notify_regime,
        "notifyScoreJump": notify_score_jump,
        "notifyKillSwitch": notify_kill_switch,
        "notifySystemicRisk": notify_systemic_risk,
        "notifyOcoFill": notify_oco_fill,
    }
    return set_user_notification_prefs(user_id, prefs)


@router.get("/notifications/prefs/{user_id}")
async def get_notif_prefs(user_id: str):
    """Get notification preferences for a user."""
    return get_user_notification_prefs(user_id)


@router.post("/notifications/register-token")
async def register_token(user_id: str, token: str, device_name: str = "unknown"):
    """Register an FCM token for push notifications."""
    return register_fcm_token(user_id, token, device_name)


@router.delete("/notifications/unregister-token")
async def unregister_token(token: str):
    """Unregister an FCM token."""
    return unregister_fcm_token(token)


# ═══════════════════════════════════════════════════
# V6: DYNAMIC THRESHOLDS
# ═══════════════════════════════════════════════════

@router.get("/thresholds/{symbol}")
async def get_symbol_thresholds(symbol: str):
    """Get dynamic thresholds for a specific symbol."""
    symbol = symbol.upper()
    return get_threshold_summary(symbol)


@router.get("/thresholds")
async def get_all_symbol_thresholds():
    """Get dynamic thresholds for all symbols."""
    return {"thresholds": get_all_thresholds()}


# ═══════════════════════════════════════════════════
# V6: MACRO REGIME + SYSTEMIC RISK
# ═══════════════════════════════════════════════════

@router.get("/macro-regime")
async def get_macro():
    """Get current macro market regime (EXPANSION/CHOP/RISK_OFF)."""
    return get_macro_regime()


@router.get("/systemic-risk")
async def get_systemic():
    """Get systemic market risk level and cross-market correlation."""
    return get_systemic_risk()


# ═══════════════════════════════════════════════════
# V6: BACKTESTING + SETUP STATS
# ═══════════════════════════════════════════════════

@router.get("/setup-stats/global")
async def get_setup_global_stats():
    """Get global setup statistics (all symbols, all time)."""
    return get_global_stats()


@router.get("/setup-stats/symbol/{symbol}")
async def get_setup_symbol_stats(symbol: str):
    """Get setup statistics for a specific symbol."""
    return get_stats_by_symbol(symbol.upper())


@router.get("/setup-stats/fingerprint/{fingerprint}")
async def get_setup_fingerprint_stats(fingerprint: str):
    """Get statistics for a specific setup fingerprint."""
    return get_stats_by_fingerprint(fingerprint)


@router.get("/setup-stats/combined")
async def get_setup_combined_stats(
    symbol: str, fingerprint: str, regime: str = "DEFAULT",
    session: str = "KILL_ZONE", btc_alignment: str = "ALIGNED",
    saturation_pct: float = 50, macro_regime: str = "MACRO_EXPANSION"
):
    """Get comprehensive stats for a specific setup combination."""
    return get_combined_stats(symbol.upper(), fingerprint, regime, session,
                             btc_alignment, saturation_pct, macro_regime)


@router.post("/setup-stats/record")
async def record_new_setup(
    symbol: str, fingerprint: str, regime: str, signal: str,
    confidence: float, gate_score: float, gates_passed: int,
    session: str, btc_alignment: str = "UNKNOWN",
    saturation_pct: float = 0, macro_regime: str = "UNKNOWN",
    entry_price: float = 0
):
    """Record a new setup signal for statistics tracking."""
    record_id = record_setup(symbol.upper(), fingerprint, regime, signal,
                             confidence, gate_score, gates_passed, session,
                             btc_alignment, saturation_pct, macro_regime, entry_price)
    return {"success": True, "recordId": record_id}


@router.post("/setup-stats/outcome")
async def record_outcome(record_id: str, won: bool, r_multiple: float, exit_price: float = 0):
    """Record the outcome of a previously tracked setup."""
    return update_setup_outcome(record_id, won, r_multiple, exit_price)


@router.post("/backtest/seed/{symbol}")
async def seed_backtest(symbol: str, lookback_days: int = 30):
    """Run backtesting to seed initial setup data for a symbol."""
    return await run_backtest_seed(symbol.upper(), lookback_days)


# ═══════════════════════════════════════════════════
# V6.1: SIGNAL FREQUENCY ESTIMATION
# ═══════════════════════════════════════════════════

@router.get("/signal-estimate")
async def get_signal_estimate(threshold: int = 75):
    """Estimate signal frequency at a given confidence threshold.
    Used for the notification slider predictive visualization."""
    threshold = max(70, min(100, threshold))
    return estimate_signal_frequency(threshold)


# ═══════════════════════════════════════════════════
# V6.1: KELLY POSITION SIZING
# ═══════════════════════════════════════════════════

@router.get("/position-sizing")
async def get_position_sizing(
    capital: float = 1000,
    symbol: str = None,
    fingerprint: str = None,
):
    """Calculate position size using Half-Kelly based on real expectancy."""
    return calculate_kelly_position_size(capital, symbol, fingerprint)


# ═══════════════════════════════════════════════════
# V6.1: TOP OPPORTUNITIES RANKING
# ═══════════════════════════════════════════════════

@router.get("/top-opportunities")
async def get_top_opportunities(limit: int = 5):
    """
    Return top N assets ranked by calibrated confidence + expectancy.
    Uses the real-time analysis cache to find the best setups right now.
    """
    all_cached = get_all_cached()
    scored = []
    for symbol, data in all_cached.items():
        analysis = data.get("analysis", {})
        signal = analysis.get("v4Signal", "NEUTRO")
        confidence = analysis.get("v4Confidence", 0)
        gate_score = analysis.get("v4GateScore", 0)
        regime = analysis.get("v4RegimeKey", "UNKNOWN")
        gates_passed = analysis.get("v4GatesPassed", 0)
        gates_total = analysis.get("v4GatesTotal", 9)
        expectancy_data = analysis.get("expectancy", {})
        expectancy_val = expectancy_data.get("expectancy", 0) if isinstance(expectancy_data, dict) else 0
        regime_quality = analysis.get("regimeQuality", {})
        rq_score = regime_quality.get("qualityScore", 50) if isinstance(regime_quality, dict) else 50
        saturation = analysis.get("saturation", {})
        sat_pct = saturation.get("saturationPercent", 50) if isinstance(saturation, dict) else 50
        
        # Composite score: confidence × 0.5 + gate_score × 0.2 + regime_quality × 0.15 + inverse_saturation × 0.15
        # Plus bonus for positive expectancy
        composite = (
            confidence * 0.5
            + gate_score * 0.2
            + rq_score * 0.15
            + (100 - sat_pct) * 0.15  # less saturated = better
        )
        if expectancy_val and expectancy_val > 0:
            composite += min(expectancy_val * 10, 15)  # up to +15 for strong expectancy
        
        # Only include CONFIRMED or strong AGUARDAR
        if "CONFIRMED" in signal or (confidence >= 50 and "AGUARDAR" in signal):
            direction = "LONG" if "LONG" in signal else "SHORT" if "SHORT" in signal else ""
            scored.append({
                "symbol": symbol,
                "signal": signal,
                "direction": direction,
                "confidence": confidence,
                "gateScore": gate_score,
                "gatesPassed": gates_passed,
                "gatesTotal": gates_total,
                "regime": regime,
                "regimeQuality": rq_score,
                "saturation": sat_pct,
                "expectancy": expectancy_val,
                "compositeScore": round(composite, 1),
            })
    
    scored.sort(key=lambda x: x["compositeScore"], reverse=True)
    return {
        "opportunities": scored[:limit],
        "totalAnalyzed": len(all_cached),
        "totalQualified": len(scored),
    }


# ═══════════════════════════════════════════════════
# V7: GLOBAL FINGERPRINT DB + BAYESIAN UPDATES
# ═══════════════════════════════════════════════════

# In-memory global fingerprint store (persists as long as backend runs)
_global_fingerprints: dict = {}


@router.post("/setup-outcome")
async def record_setup_outcome_v7(data: dict):
    """
    V7: Receive setup outcome from any device.
    Body: {fingerprint, won, r_multiple, device_id, timestamp}
    Uses Bayesian beta distribution for win-rate estimation.
    """
    fp = data.get("fingerprint", "")
    won = data.get("won", False)
    r_mul = data.get("r_multiple", 0)
    device_id = data.get("device_id", "unknown")

    if not fp:
        return {"error": "Missing fingerprint"}

    if fp not in _global_fingerprints:
        _global_fingerprints[fp] = {
            "alpha": 1,      # Bayesian beta prior (successes + 1)
            "beta": 1,       # Bayesian beta prior (failures + 1)
            "totalR": 0.0,
            "count": 0,
            "devices": set(),
        }

    entry = _global_fingerprints[fp]
    entry["count"] += 1
    entry["totalR"] += r_mul
    entry["devices"].add(device_id)

    if won:
        entry["alpha"] += 1
    else:
        entry["beta"] += 1

    # Bayesian posterior mean: alpha / (alpha + beta)
    wr = entry["alpha"] / (entry["alpha"] + entry["beta"])
    avg_r = entry["totalR"] / entry["count"] if entry["count"] > 0 else 0
    expectancy = wr * avg_r - (1 - wr) * 1.0  # assume 1R loss

    return {
        "fingerprint": fp,
        "winRate": round(wr, 4),
        "count": entry["count"],
        "avgR": round(avg_r, 3),
        "expectancy": round(expectancy, 3),
        "devices": len(entry["devices"]),
    }


@router.get("/setup-outcome/stats")
async def get_fingerprint_stats(fingerprint: str = None):
    """Get Bayesian stats for a specific fingerprint or all."""
    if fingerprint:
        entry = _global_fingerprints.get(fingerprint)
        if not entry:
            return {"fingerprint": fingerprint, "winRate": 0.5, "count": 0, "avgR": 0, "expectancy": 0}
        wr = entry["alpha"] / (entry["alpha"] + entry["beta"])
        avg_r = entry["totalR"] / entry["count"] if entry["count"] > 0 else 0
        return {
            "fingerprint": fingerprint,
            "winRate": round(wr, 4),
            "count": entry["count"],
            "avgR": round(avg_r, 3),
            "expectancy": round(wr * avg_r - (1 - wr) * 1.0, 3),
            "devices": len(entry["devices"]),
        }

    # Return top 20 fingerprints by count
    ranked = sorted(_global_fingerprints.items(), key=lambda x: x[1]["count"], reverse=True)[:20]
    results = []
    for fp, entry in ranked:
        wr = entry["alpha"] / (entry["alpha"] + entry["beta"])
        avg_r = entry["totalR"] / entry["count"] if entry["count"] > 0 else 0
        results.append({
            "fingerprint": fp,
            "winRate": round(wr, 4),
            "count": entry["count"],
            "avgR": round(avg_r, 3),
            "expectancy": round(wr * avg_r - (1 - wr) * 1.0, 3),
            "devices": len(entry["devices"]),
        })
    return {"topFingerprints": results, "totalTracked": len(_global_fingerprints)}