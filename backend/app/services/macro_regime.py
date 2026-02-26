"""
═══════════════════════════════════════════════════════════════
VISOR CRYPTO — MACRO REGIME + SYSTEMIC RISK SERVICE
═══════════════════════════════════════════════════════════════

Two modules in one:

1. MACRO REGIME DETECTION
   Classifies the overall market into one of:
     MACRO_EXPANSION — BTC strong trend + high ADX + alt follow
     MACRO_CHOP      — BTC ranging, ADX < 25, mixed signals
     MACRO_RISK_OFF  — BTC falling, high correlation, alts dump harder

2. SYSTEMIC MARKET RISK
   Calculates cross-market correlation and simultaneous drawdown.
   When >80% of top assets are correlated AND falling:
     → Multiplier applied to ALL signals (reduces confidence)
     → FCM alert sent if enabled
"""

import asyncio
import logging
import math
import time
from typing import Dict, List, Optional, Tuple

import httpx

logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════
# CONFIG
# ═══════════════════════════════════════════════════

BINANCE_BASE = "https://api.binance.com/api/v3"
BTC_SYMBOL = "BTCUSDT"
MAJOR_SYMBOLS = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT"]
CORRELATION_WINDOW = 48  # 48 hourly candles = 2 days
SYSTEMIC_CORRELATION_THRESHOLD = 0.75
SYSTEMIC_DRAWDOWN_THRESHOLD = -2.0  # -2% avg across majors

# ═══════════════════════════════════════════════════
# IN-MEMORY STATE
# ═══════════════════════════════════════════════════

_macro_regime = {
    "regime": "UNKNOWN",
    "btcTrend": "NEUTRAL",
    "btcAdx": 0,
    "btcAtr": 0,
    "btcChange24h": 0,
    "altFollowing": 0,
    "updatedAt": 0,
}

_systemic_risk = {
    "riskLevel": "NORMAL",
    "avgCorrelation": 0,
    "avgDrawdown": 0,
    "correlationMatrix": {},
    "riskMultiplier": 1.0,
    "btcChange": 0,
    "updatedAt": 0,
}


# ═══════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════

def _ema(data: List[float], period: int) -> float:
    if not data or len(data) < period:
        return data[-1] if data else 0
    k = 2 / (period + 1)
    ema_val = sum(data[:period]) / period
    for val in data[period:]:
        ema_val = val * k + ema_val * (1 - k)
    return ema_val


def _adx(highs: List[float], lows: List[float], closes: List[float], period: int = 14) -> float:
    """Simplified ADX calculation."""
    if len(highs) < period + 2:
        return 20.0
    plus_dm_list, minus_dm_list, tr_list = [], [], []
    for i in range(1, len(highs)):
        high_diff = highs[i] - highs[i-1]
        low_diff = lows[i-1] - lows[i]
        plus_dm = max(high_diff, 0) if high_diff > low_diff else 0
        minus_dm = max(low_diff, 0) if low_diff > high_diff else 0
        tr = max(highs[i] - lows[i], abs(highs[i] - closes[i-1]), abs(lows[i] - closes[i-1]))
        plus_dm_list.append(plus_dm)
        minus_dm_list.append(minus_dm)
        tr_list.append(tr)
    if len(tr_list) < period:
        return 20.0
    smoothed_plus = sum(plus_dm_list[:period])
    smoothed_minus = sum(minus_dm_list[:period])
    smoothed_tr = sum(tr_list[:period])
    dx_list = []
    for i in range(period, len(tr_list)):
        smoothed_plus = smoothed_plus - smoothed_plus / period + plus_dm_list[i]
        smoothed_minus = smoothed_minus - smoothed_minus / period + minus_dm_list[i]
        smoothed_tr = smoothed_tr - smoothed_tr / period + tr_list[i]
        if smoothed_tr == 0:
            continue
        plus_di = 100 * smoothed_plus / smoothed_tr
        minus_di = 100 * smoothed_minus / smoothed_tr
        di_sum = plus_di + minus_di
        dx = 100 * abs(plus_di - minus_di) / di_sum if di_sum > 0 else 0
        dx_list.append(dx)
    if not dx_list:
        return 20.0
    adx_val = sum(dx_list[:period]) / period if len(dx_list) >= period else sum(dx_list) / len(dx_list)
    for i in range(period, len(dx_list)):
        adx_val = (adx_val * (period - 1) + dx_list[i]) / period
    return adx_val


def _pearson_correlation(x: List[float], y: List[float]) -> float:
    n = min(len(x), len(y))
    if n < 5:
        return 0.0
    x, y = x[-n:], y[-n:]
    sum_x = sum(x)
    sum_y = sum(y)
    sum_xy = sum(a * b for a, b in zip(x, y))
    sum_x2 = sum(a * a for a in x)
    sum_y2 = sum(a * a for a in y)
    num = n * sum_xy - sum_x * sum_y
    den = math.sqrt((n * sum_x2 - sum_x**2) * (n * sum_y2 - sum_y**2))
    return num / den if den > 0 else 0.0


def _returns(closes: List[float]) -> List[float]:
    return [(closes[i] - closes[i-1]) / closes[i-1] for i in range(1, len(closes))]


# ═══════════════════════════════════════════════════
# MACRO REGIME DETECTION
# ═══════════════════════════════════════════════════

async def update_macro_regime() -> dict:
    """
    Fetch BTC data and classify the macro regime.
    Should be called every worker cycle (5 min).
    """
    global _macro_regime
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            # BTC 1h klines
            resp = await client.get(f"{BINANCE_BASE}/klines", params={"symbol": BTC_SYMBOL, "interval": "1h", "limit": 100})
            btc_klines = resp.json() if resp.status_code == 200 else []

            # BTC 24h ticker
            resp2 = await client.get(f"{BINANCE_BASE}/ticker/24hr", params={"symbol": BTC_SYMBOL})
            btc_ticker = resp2.json() if resp2.status_code == 200 else {}

            # Top alts tickers
            alt_changes = []
            for sym in MAJOR_SYMBOLS[1:]:
                try:
                    r = await client.get(f"{BINANCE_BASE}/ticker/24hr", params={"symbol": sym})
                    if r.status_code == 200:
                        alt_changes.append(float(r.json().get("priceChangePercent", 0)))
                except Exception:
                    pass

        if not btc_klines or len(btc_klines) < 50:
            return _macro_regime

        closes = [float(k[4]) for k in btc_klines]
        highs = [float(k[2]) for k in btc_klines]
        lows = [float(k[3]) for k in btc_klines]

        btc_adx = _adx(highs, lows, closes)
        btc_ema20 = _ema(closes, 20)
        btc_ema50 = _ema(closes, 50)
        btc_price = closes[-1]
        btc_change = float(btc_ticker.get("priceChangePercent", 0))

        # BTC trend
        if btc_price > btc_ema20 > btc_ema50:
            btc_trend = "UP"
        elif btc_price < btc_ema20 < btc_ema50:
            btc_trend = "DOWN"
        else:
            btc_trend = "NEUTRAL"

        # ATR
        atr_sum = 0
        for i in range(max(1, len(closes) - 14), len(closes)):
            atr_sum += max(highs[i] - lows[i], abs(highs[i] - closes[i-1]), abs(lows[i] - closes[i-1]))
        btc_atr = atr_sum / 14

        # Alt following BTC direction
        alt_following = 0
        for chg in alt_changes:
            if (btc_change > 0 and chg > 0) or (btc_change < 0 and chg < 0):
                alt_following += 1
        alt_follow_pct = alt_following / len(alt_changes) * 100 if alt_changes else 0

        # Classify regime
        if btc_adx > 30 and btc_trend in ("UP", "DOWN") and alt_follow_pct > 60:
            regime = "MACRO_EXPANSION"
        elif btc_adx < 25 and abs(btc_change) < 2:
            regime = "MACRO_CHOP"
        elif btc_trend == "DOWN" and btc_change < -3 and alt_follow_pct > 70:
            regime = "MACRO_RISK_OFF"
        elif btc_adx > 25 and btc_trend == "UP":
            regime = "MACRO_EXPANSION"
        elif btc_trend == "DOWN" and btc_adx > 25:
            regime = "MACRO_RISK_OFF"
        else:
            regime = "MACRO_CHOP"

        _macro_regime = {
            "regime": regime,
            "btcTrend": btc_trend,
            "btcAdx": round(btc_adx, 1),
            "btcAtr": round(btc_atr, 2),
            "btcChange24h": round(btc_change, 2),
            "btcPrice": round(btc_price, 2),
            "altFollowingPercent": round(alt_follow_pct, 0),
            "altChanges": [round(c, 2) for c in alt_changes],
            "updatedAt": int(time.time() * 1000),
        }

        logger.info(f"[MacroRegime] {regime} | BTC {btc_trend} ADX={btc_adx:.0f} Chg={btc_change:.1f}% | Alts follow={alt_follow_pct:.0f}%")
        return _macro_regime

    except Exception as e:
        logger.error(f"[MacroRegime] Update failed: {e}")
        return _macro_regime


def get_macro_regime() -> dict:
    return _macro_regime


# ═══════════════════════════════════════════════════
# SYSTEMIC MARKET RISK
# ═══════════════════════════════════════════════════

async def update_systemic_risk() -> dict:
    """
    Calculate cross-market correlation and simultaneous drawdown.
    When all majors are highly correlated AND falling → systemic risk.
    """
    global _systemic_risk
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            # Fetch 1h klines for all majors
            all_returns = {}
            all_changes = {}
            for sym in MAJOR_SYMBOLS:
                try:
                    resp = await client.get(f"{BINANCE_BASE}/klines",
                        params={"symbol": sym, "interval": "1h", "limit": CORRELATION_WINDOW + 5})
                    if resp.status_code == 200:
                        klines = resp.json()
                        closes = [float(k[4]) for k in klines]
                        all_returns[sym] = _returns(closes)
                        if len(closes) >= 24:
                            all_changes[sym] = ((closes[-1] - closes[-24]) / closes[-24]) * 100
                except Exception:
                    pass

        if len(all_returns) < 3:
            return _systemic_risk

        # Correlation matrix
        symbols = list(all_returns.keys())
        correlations = {}
        pair_correlations = []
        for i in range(len(symbols)):
            for j in range(i + 1, len(symbols)):
                s1, s2 = symbols[i], symbols[j]
                corr = _pearson_correlation(all_returns[s1], all_returns[s2])
                pair_key = f"{s1}-{s2}"
                correlations[pair_key] = round(corr, 3)
                pair_correlations.append(corr)

        avg_corr = sum(pair_correlations) / len(pair_correlations) if pair_correlations else 0
        avg_change = sum(all_changes.values()) / len(all_changes) if all_changes else 0
        btc_change = all_changes.get(BTC_SYMBOL, 0)

        # Determine risk level
        if avg_corr > SYSTEMIC_CORRELATION_THRESHOLD and avg_change < SYSTEMIC_DRAWDOWN_THRESHOLD:
            risk_level = "CRITICAL"
            risk_multiplier = 0.3  # reduce all confidence by 70%
        elif avg_corr > 0.6 and avg_change < -1.0:
            risk_level = "HIGH"
            risk_multiplier = 0.6
        elif avg_corr > 0.5 and avg_change < 0:
            risk_level = "ELEVATED"
            risk_multiplier = 0.85
        else:
            risk_level = "NORMAL"
            risk_multiplier = 1.0

        _systemic_risk = {
            "riskLevel": risk_level,
            "avgCorrelation": round(avg_corr, 3),
            "avgDrawdown": round(avg_change, 2),
            "correlationMatrix": correlations,
            "riskMultiplier": risk_multiplier,
            "btcChange": round(btc_change, 2),
            "assetChanges": {k: round(v, 2) for k, v in all_changes.items()},
            "updatedAt": int(time.time() * 1000),
        }

        if risk_level != "NORMAL":
            logger.warning(f"[SystemicRisk] {risk_level} | avgCorr={avg_corr:.2f} avgDraw={avg_change:.1f}% mult={risk_multiplier}")
        return _systemic_risk

    except Exception as e:
        logger.error(f"[SystemicRisk] Update failed: {e}")
        return _systemic_risk


def get_systemic_risk() -> dict:
    return _systemic_risk
