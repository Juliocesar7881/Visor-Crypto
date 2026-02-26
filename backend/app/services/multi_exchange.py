"""
═══════════════════════════════════════════════════════════════
VISOR CRYPTO — MULTI-EXCHANGE AGGREGATOR
═══════════════════════════════════════════════════════════════

Cross-references data from multiple exchanges to detect
divergences that single-exchange analysis would miss.

Supported exchanges:
  - Binance (primary)
  - OKX (Open Interest, Taker Volume)
  - Bybit (Open Interest, Liquidations)

Key insight: If Binance Spot shows buying but OKX/Bybit
derivatives show OI dropping with sells → divergence = trap.

Production:
  - Each exchange has its own rate limits
  - Data cached per-exchange with staggered fetches
  - Aggregated view exposed to analysis worker
"""

import asyncio
import time
import logging
from typing import Dict, Optional, List

import httpx

logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════
# CONFIG
# ═══════════════════════════════════════════════════

# Exchange API URLs
EXCHANGES = {
    "binance": {
        "oi": "https://fapi.binance.com/fapi/v1/openInterest",
        "taker": "https://fapi.binance.com/futures/data/takerlongshortRatio",
        "funding": "https://fapi.binance.com/fapi/v1/fundingRate",
    },
    "okx": {
        "oi": "https://www.okx.com/api/v5/public/open-interest",
        "taker": "https://www.okx.com/api/v5/rubik/stat/taker-volume",
        "funding": "https://www.okx.com/api/v5/public/funding-rate",
    },
    "bybit": {
        "oi": "https://api.bybit.com/v5/market/open-interest",
        "taker": "https://api.bybit.com/v5/market/account-ratio",
        "funding": "https://api.bybit.com/v5/market/funding/history",
    }
}

# Symbol mapping per exchange
SYMBOL_MAP = {
    "BTCUSDT": {"okx": "BTC-USDT-SWAP", "bybit": "BTCUSDT"},
    "ETHUSDT": {"okx": "ETH-USDT-SWAP", "bybit": "ETHUSDT"},
    "SOLUSDT": {"okx": "SOL-USDT-SWAP", "bybit": "SOLUSDT"},
    "BNBUSDT": {"okx": "BNB-USDT-SWAP", "bybit": "BNBUSDT"},
    "XRPUSDT": {"okx": "XRP-USDT-SWAP", "bybit": "XRPUSDT"},
    "ADAUSDT": {"okx": "ADA-USDT-SWAP", "bybit": "ADAUSDT"},
    "DOGEUSDT": {"okx": "DOGE-USDT-SWAP", "bybit": "DOGEUSDT"},
    "AVAXUSDT": {"okx": "AVAX-USDT-SWAP", "bybit": "AVAXUSDT"},
}

CACHE_TTL = 300  # 5 min cache

# ═══════════════════════════════════════════════════
# IN-MEMORY CACHE
# ═══════════════════════════════════════════════════

_exchange_cache: Dict[str, dict] = {}
_cache_ts: Dict[str, float] = {}


# ═══════════════════════════════════════════════════
# FETCH FUNCTIONS
# ═══════════════════════════════════════════════════

async def _fetch_okx_oi(client: httpx.AsyncClient, symbol: str) -> Optional[float]:
    """Fetch Open Interest from OKX."""
    mapping = SYMBOL_MAP.get(symbol, {})
    okx_sym = mapping.get("okx")
    if not okx_sym:
        return None
    try:
        resp = await client.get(
            EXCHANGES["okx"]["oi"],
            params={"instType": "SWAP", "instId": okx_sym}
        )
        if resp.status_code == 200:
            data = resp.json()
            items = data.get("data", [])
            if items:
                return float(items[0].get("oi", 0))
    except Exception as e:
        logger.debug(f"[MultiEx] OKX OI error for {symbol}: {e}")
    return None


async def _fetch_bybit_oi(client: httpx.AsyncClient, symbol: str) -> Optional[float]:
    """Fetch Open Interest from Bybit."""
    mapping = SYMBOL_MAP.get(symbol, {})
    bybit_sym = mapping.get("bybit")
    if not bybit_sym:
        return None
    try:
        resp = await client.get(
            EXCHANGES["bybit"]["oi"],
            params={"category": "linear", "symbol": bybit_sym, "intervalTime": "5min", "limit": 1}
        )
        if resp.status_code == 200:
            data = resp.json()
            items = data.get("result", {}).get("list", [])
            if items:
                return float(items[0].get("openInterest", 0))
    except Exception as e:
        logger.debug(f"[MultiEx] Bybit OI error for {symbol}: {e}")
    return None


async def _fetch_okx_funding(client: httpx.AsyncClient, symbol: str) -> Optional[float]:
    """Fetch funding rate from OKX."""
    mapping = SYMBOL_MAP.get(symbol, {})
    okx_sym = mapping.get("okx")
    if not okx_sym:
        return None
    try:
        resp = await client.get(
            EXCHANGES["okx"]["funding"],
            params={"instId": okx_sym}
        )
        if resp.status_code == 200:
            data = resp.json()
            items = data.get("data", [])
            if items:
                return float(items[0].get("fundingRate", 0)) * 100
    except Exception as e:
        logger.debug(f"[MultiEx] OKX funding error for {symbol}: {e}")
    return None


async def _fetch_bybit_funding(client: httpx.AsyncClient, symbol: str) -> Optional[float]:
    """Fetch funding rate from Bybit."""
    mapping = SYMBOL_MAP.get(symbol, {})
    bybit_sym = mapping.get("bybit")
    if not bybit_sym:
        return None
    try:
        resp = await client.get(
            EXCHANGES["bybit"]["funding"],
            params={"category": "linear", "symbol": bybit_sym, "limit": 1}
        )
        if resp.status_code == 200:
            data = resp.json()
            items = data.get("result", {}).get("list", [])
            if items:
                return float(items[0].get("fundingRate", 0)) * 100
    except Exception as e:
        logger.debug(f"[MultiEx] Bybit funding error for {symbol}: {e}")
    return None


# ═══════════════════════════════════════════════════
# AGGREGATION
# ═══════════════════════════════════════════════════

async def fetch_multi_exchange_data(symbol: str) -> dict:
    """Fetch OI and funding from multiple exchanges."""
    cache_key = f"multi_{symbol}"
    if cache_key in _exchange_cache:
        ts = _cache_ts.get(cache_key, 0)
        if time.time() - ts < CACHE_TTL:
            return _exchange_cache[cache_key]

    async with httpx.AsyncClient(timeout=10.0) as client:
        # Fetch all exchanges in parallel
        binance_oi_task = client.get(
            EXCHANGES["binance"]["oi"],
            params={"symbol": symbol}
        )
        okx_oi_task = _fetch_okx_oi(client, symbol)
        bybit_oi_task = _fetch_bybit_oi(client, symbol)
        okx_funding_task = _fetch_okx_funding(client, symbol)
        bybit_funding_task = _fetch_bybit_funding(client, symbol)

        results = await asyncio.gather(
            binance_oi_task, okx_oi_task, bybit_oi_task,
            okx_funding_task, bybit_funding_task,
            return_exceptions=True
        )

    # Parse Binance OI
    binance_oi = None
    if not isinstance(results[0], Exception) and hasattr(results[0], 'status_code') and results[0].status_code == 200:
        data = results[0].json()
        binance_oi = float(data.get("openInterest", 0))

    okx_oi = results[1] if not isinstance(results[1], Exception) else None
    bybit_oi = results[2] if not isinstance(results[2], Exception) else None
    okx_funding = results[3] if not isinstance(results[3], Exception) else None
    bybit_funding = results[4] if not isinstance(results[4], Exception) else None

    # Analyze divergences
    oi_values = {}
    if binance_oi: oi_values["binance"] = binance_oi
    if okx_oi: oi_values["okx"] = okx_oi
    if bybit_oi: oi_values["bybit"] = bybit_oi

    funding_values = {}
    if okx_funding is not None: funding_values["okx"] = okx_funding
    if bybit_funding is not None: funding_values["bybit"] = bybit_funding

    # OI divergence detection
    oi_divergence = False
    oi_divergence_detail = ""
    if len(oi_values) >= 2:
        vals = list(oi_values.values())
        max_val = max(vals)
        min_val = min(vals)
        if min_val > 0 and ((max_val - min_val) / min_val) > 0.15:
            oi_divergence = True
            max_ex = [k for k, v in oi_values.items() if v == max_val][0]
            min_ex = [k for k, v in oi_values.items() if v == min_val][0]
            oi_divergence_detail = f"OI divergência: {max_ex} alto vs {min_ex} baixo ({((max_val - min_val) / min_val * 100):.1f}%)"

    result = {
        "available": len(oi_values) >= 2,
        "exchanges": list(oi_values.keys()),
        "oi": oi_values,
        "funding": funding_values,
        "oiDivergence": oi_divergence,
        "oiDivergenceDetail": oi_divergence_detail,
        "timestamp": int(time.time() * 1000),
        "details": f"Multi-exchange: {len(oi_values)} fontes de OI, {len(funding_values)} fontes de funding"
    }

    _exchange_cache[cache_key] = result
    _cache_ts[cache_key] = time.time()

    return result


def get_cached_multi_exchange(symbol: str) -> Optional[dict]:
    """Get cached multi-exchange data."""
    cache_key = f"multi_{symbol}"
    if cache_key in _exchange_cache:
        ts = _cache_ts.get(cache_key, 0)
        if time.time() - ts < CACHE_TTL:
            return _exchange_cache[cache_key]
    return None
