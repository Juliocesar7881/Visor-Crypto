"""
═══════════════════════════════════════════════════════════════
VISOR CRYPTO — DYNAMIC THRESHOLDS SERVICE
═══════════════════════════════════════════════════════════════

Replaces ALL fixed thresholds with percentile-based dynamic ones.
BTC ≠ SOL ≠ XRP — each asset has its own statistical distribution.

Instead of Z ≥ 2.0 for all:
  - OI_threshold = percentile_80(symbol_OI_delta_last_30d)
  - Z_threshold  = percentile_85(symbol_body_distribution)
  - Vol_threshold = percentile_80(symbol_volume_distribution)
  - Funding_threshold = percentile_90(symbol_funding_abs)

Distributions are built from Binance kline data and updated every cycle.
"""

import json
import logging
import math
import time
from pathlib import Path
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════
# CONFIG
# ═══════════════════════════════════════════════════

DISTRIBUTIONS_FILE = Path(__file__).parent / "threshold_distributions.json"
DISTRIBUTION_WINDOW = 500   # max candles to store per metric
MIN_SAMPLES = 30            # minimum samples before using dynamic threshold

# Percentile targets for each metric
PERCENTILE_TARGETS = {
    "displacement_z": 85,     # body z-score threshold
    "volume_z": 80,           # volume z-score threshold
    "oi_delta": 80,           # OI delta % threshold
    "funding_rate": 90,       # abs(funding) threshold
    "spoofing_imbalance": 85, # bid/ask ratio threshold
    "cvd_ratio": 75,          # CVD buy/sell ratio threshold
    "atr_percentile": 80,     # ATR-based volatility threshold
}

# Fallback fixed values (used when insufficient data)
FALLBACK_THRESHOLDS = {
    "displacement_z": 2.0,
    "volume_z": 2.0,
    "oi_delta": 5.0,
    "funding_rate": 0.05,
    "spoofing_imbalance": 3.0,
    "cvd_ratio": 0.1,
    "atr_percentile": 60,
}


# ═══════════════════════════════════════════════════
# IN-MEMORY STATE
# ═══════════════════════════════════════════════════

_distributions: Dict[str, Dict[str, List[float]]] = {}
_computed_thresholds: Dict[str, Dict[str, float]] = {}
_last_update: Dict[str, float] = {}


def _percentile(data: List[float], pct: float) -> float:
    """Calculate percentile using linear interpolation."""
    if not data:
        return 0.0
    sorted_data = sorted(data)
    n = len(sorted_data)
    k = (n - 1) * pct / 100.0
    f = math.floor(k)
    c = math.ceil(k)
    if f == c:
        return sorted_data[int(k)]
    d0 = sorted_data[int(f)] * (c - k)
    d1 = sorted_data[int(c)] * (k - f)
    return d0 + d1


def _std(data: List[float]) -> float:
    if len(data) < 2:
        return 0.0
    mean = sum(data) / len(data)
    variance = sum((x - mean) ** 2 for x in data) / (len(data) - 1)
    return math.sqrt(variance)


def _mean(data: List[float]) -> float:
    return sum(data) / len(data) if data else 0.0


# ═══════════════════════════════════════════════════
# DISTRIBUTION BUILDING
# ═══════════════════════════════════════════════════

def update_distribution(symbol: str, metric: str, value: float):
    """Add a new observation to a symbol's metric distribution."""
    if symbol not in _distributions:
        _distributions[symbol] = {}
    if metric not in _distributions[symbol]:
        _distributions[symbol][metric] = []

    dist = _distributions[symbol][metric]
    dist.append(value)

    # Trim to window size
    if len(dist) > DISTRIBUTION_WINDOW:
        _distributions[symbol][metric] = dist[-DISTRIBUTION_WINDOW:]


def update_from_klines(symbol: str, klines: list, oi_data: dict = None, funding_data: list = None):
    """
    Build distributions from raw kline data for a symbol.
    Called by analysis_worker every cycle.
    """
    if not klines or len(klines) < 20:
        return

    # Body z-scores (displacement)
    bodies = []
    volumes = []
    for k in klines:
        o, h, l, c, v = float(k[1]), float(k[2]), float(k[3]), float(k[4]), float(k[5])
        body = abs(c - o)
        bodies.append(body)
        volumes.append(v)

    if len(bodies) >= 20:
        body_mean = _mean(bodies[-100:])
        body_std = _std(bodies[-100:])
        if body_std > 0:
            for b in bodies[-20:]:
                z = (b - body_mean) / body_std
                update_distribution(symbol, "displacement_z", abs(z))

        vol_mean = _mean(volumes[-100:])
        vol_std = _std(volumes[-100:])
        if vol_std > 0:
            for v in volumes[-20:]:
                z = (v - vol_mean) / vol_std
                update_distribution(symbol, "volume_z", abs(z))

    # OI delta
    if oi_data and isinstance(oi_data, list) and len(oi_data) >= 2:
        for i in range(1, len(oi_data)):
            old_oi = float(oi_data[i-1].get("sumOpenInterest", 0))
            new_oi = float(oi_data[i].get("sumOpenInterest", 0))
            if old_oi > 0:
                delta_pct = abs(((new_oi - old_oi) / old_oi) * 100)
                update_distribution(symbol, "oi_delta", delta_pct)

    # Funding rate
    if funding_data and isinstance(funding_data, list):
        for fr in funding_data:
            rate = abs(float(fr.get("fundingRate", 0)) * 100)
            if rate > 0:
                update_distribution(symbol, "funding_rate", rate)

    _last_update[symbol] = time.time()


# ═══════════════════════════════════════════════════
# THRESHOLD COMPUTATION
# ═══════════════════════════════════════════════════

def compute_thresholds(symbol: str) -> Dict[str, float]:
    """
    Compute all dynamic thresholds for a given symbol.
    Uses percentile-based approach:
      threshold = percentile_X(distribution)
    Falls back to global fixed values if insufficient data.
    """
    thresholds = {}
    sym_dist = _distributions.get(symbol, {})

    for metric, target_pct in PERCENTILE_TARGETS.items():
        data = sym_dist.get(metric, [])
        if len(data) >= MIN_SAMPLES:
            thresholds[metric] = round(_percentile(data, target_pct), 4)
        else:
            thresholds[metric] = FALLBACK_THRESHOLDS.get(metric, 0)

    thresholds["_dynamic"] = len(sym_dist.get("displacement_z", [])) >= MIN_SAMPLES
    thresholds["_samples"] = {m: len(sym_dist.get(m, [])) for m in PERCENTILE_TARGETS}
    thresholds["_updated"] = _last_update.get(symbol, 0)

    _computed_thresholds[symbol] = thresholds
    return thresholds


def get_thresholds(symbol: str) -> Dict[str, float]:
    """Get current thresholds (compute if stale)."""
    cached = _computed_thresholds.get(symbol)
    if cached and time.time() - cached.get("_updated", 0) < 600:
        return cached
    return compute_thresholds(symbol)


def get_all_thresholds() -> Dict[str, Dict[str, float]]:
    """Get thresholds for all tracked symbols."""
    return {sym: get_thresholds(sym) for sym in _distributions}


# ═══════════════════════════════════════════════════
# PERSISTENCE
# ═══════════════════════════════════════════════════

def save_distributions():
    """Persist distributions to disk for faster cold-start."""
    try:
        with open(DISTRIBUTIONS_FILE, "w") as f:
            json.dump({
                "distributions": _distributions,
                "thresholds": _computed_thresholds,
                "updated": time.time(),
            }, f)
        logger.info(f"[Thresholds] Saved distributions for {len(_distributions)} symbols")
    except Exception as e:
        logger.error(f"[Thresholds] Save failed: {e}")


def load_distributions():
    """Load distributions from disk on startup."""
    global _distributions, _computed_thresholds
    if not DISTRIBUTIONS_FILE.exists():
        return
    try:
        with open(DISTRIBUTIONS_FILE) as f:
            data = json.load(f)
        _distributions = data.get("distributions", {})
        _computed_thresholds = data.get("thresholds", {})
        logger.info(f"[Thresholds] Loaded distributions for {len(_distributions)} symbols")
    except Exception as e:
        logger.error(f"[Thresholds] Load failed: {e}")


# ═══════════════════════════════════════════════════
# API-FRIENDLY SUMMARY
# ═══════════════════════════════════════════════════

def get_threshold_summary(symbol: str) -> dict:
    """Get a human-readable threshold summary for UI display."""
    t = get_thresholds(symbol)
    is_dynamic = t.get("_dynamic", False)
    return {
        "symbol": symbol,
        "method": "DYNAMIC_PERCENTILE" if is_dynamic else "FIXED_FALLBACK",
        "thresholds": {
            "displacement_z": {"value": t.get("displacement_z", 2.0), "percentile": PERCENTILE_TARGETS["displacement_z"]},
            "volume_z": {"value": t.get("volume_z", 2.0), "percentile": PERCENTILE_TARGETS["volume_z"]},
            "oi_delta": {"value": t.get("oi_delta", 5.0), "percentile": PERCENTILE_TARGETS["oi_delta"]},
            "funding_rate": {"value": t.get("funding_rate", 0.05), "percentile": PERCENTILE_TARGETS["funding_rate"]},
            "spoofing_imbalance": {"value": t.get("spoofing_imbalance", 3.0), "percentile": PERCENTILE_TARGETS["spoofing_imbalance"]},
        },
        "samples": t.get("_samples", {}),
        "minSamplesRequired": MIN_SAMPLES,
    }
