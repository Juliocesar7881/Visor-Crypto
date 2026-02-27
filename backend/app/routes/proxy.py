"""
External API Proxy Routes
Proxies requests to external APIs (FRED, FMP, Finnhub, TwelveData, AlphaVantage)
so API keys are never exposed to the client.
"""
from fastapi import APIRouter, HTTPException, Query
from typing import Optional
import httpx
import os

router = APIRouter(prefix="/proxy", tags=["proxy"])

# API keys from environment variables
FRED_API_KEY = os.environ.get("FRED_API_KEY", "289c022214958a3eb611142e8dc34f6b")
FMP_API_KEY = os.environ.get("FMP_API_KEY", "yTzpl8eGbfIStxlI6xBjQoiHycAb4PhZ")
FINNHUB_API_KEY = os.environ.get("FINNHUB_API_KEY", "d5j4209r01qh37ui6ehgd5j4209r01qh37ui6ei0")
TWELVE_DATA_API_KEYS = [
    os.environ.get("TWELVE_DATA_KEY_1", "f3eee307545843abb139dc2e68932f16"),
    os.environ.get("TWELVE_DATA_KEY_2", "07a47c138e344323add83b5e97bb2bd6"),
    os.environ.get("TWELVE_DATA_KEY_3", "8449b7e97a8641a7a2126f0ccd7cea2d"),
]
ALPHA_VANTAGE_KEY = os.environ.get("ALPHA_VANTAGE_KEY", "G5QZWN5KBTAEORIT")

_twelve_data_index = 0

def _get_twelve_data_key():
    global _twelve_data_index
    key = TWELVE_DATA_API_KEYS[_twelve_data_index % len(TWELVE_DATA_API_KEYS)]
    _twelve_data_index += 1
    return key


@router.get("/fred")
async def proxy_fred(
    series_id: str = Query(..., description="FRED series ID"),
    sort_order: str = Query("desc"),
    limit: int = Query(10),
    units: Optional[str] = Query(None, description="Data transformation (e.g. pc1 for percent change)"),
):
    """Proxy FRED API requests."""
    url = (
        f"https://api.stlouisfed.org/fred/series/observations"
        f"?series_id={series_id}&api_key={FRED_API_KEY}"
        f"&file_type=json&sort_order={sort_order}&limit={limit}"
    )
    if units:
        url += f"&units={units}"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            return resp.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"FRED API error: {str(e)}")


@router.get("/fmp/calendar")
async def proxy_fmp_calendar(
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
):
    """Proxy FMP economic calendar."""
    url = f"https://financialmodelingprep.com/api/v3/economic_calendar?apikey={FMP_API_KEY}"
    if from_date:
        url += f"&from={from_date}"
    if to_date:
        url += f"&to={to_date}"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            return resp.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"FMP API error: {str(e)}")


@router.get("/fmp/{path:path}")
async def proxy_fmp_generic(path: str):
    """Proxy generic FMP API requests."""
    url = f"https://financialmodelingprep.com/api/v3/{path}?apikey={FMP_API_KEY}"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            return resp.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"FMP API error: {str(e)}")


@router.get("/finnhub/quote")
async def proxy_finnhub_quote(symbol: str = Query(...)):
    """Proxy Finnhub quote."""
    url = f"https://finnhub.io/api/v1/quote?symbol={symbol}&token={FINNHUB_API_KEY}"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            return resp.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Finnhub API error: {str(e)}")


@router.get("/finnhub/{path:path}")
async def proxy_finnhub_generic(path: str, symbol: Optional[str] = None):
    """Proxy generic Finnhub requests."""
    url = f"https://finnhub.io/api/v1/{path}?token={FINNHUB_API_KEY}"
    if symbol:
        url += f"&symbol={symbol}"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            return resp.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Finnhub API error: {str(e)}")


@router.get("/twelvedata/time_series")
async def proxy_twelve_data(
    symbol: str = Query(...),
    interval: str = Query("1day"),
    outputsize: int = Query(30),
):
    """Proxy Twelve Data time series."""
    key = _get_twelve_data_key()
    url = (
        f"https://api.twelvedata.com/time_series"
        f"?symbol={symbol}&interval={interval}&outputsize={outputsize}&apikey={key}"
    )
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            return resp.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"TwelveData API error: {str(e)}")


@router.get("/twelvedata/{path:path}")
async def proxy_twelve_data_generic(
    path: str,
    symbol: Optional[str] = None,
    interval: Optional[str] = None,
    outputsize: Optional[int] = None,
):
    """Proxy generic Twelve Data requests."""
    key = _get_twelve_data_key()
    url = f"https://api.twelvedata.com/{path}?apikey={key}"
    if symbol:
        url += f"&symbol={symbol}"
    if interval:
        url += f"&interval={interval}"
    if outputsize:
        url += f"&outputsize={outputsize}"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            return resp.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"TwelveData API error: {str(e)}")


@router.get("/alphavantage")
async def proxy_alpha_vantage(
    function: str = Query(...),
    symbol: Optional[str] = None,
    interval: Optional[str] = None,
):
    """Proxy Alpha Vantage requests."""
    url = f"https://www.alphavantage.co/query?function={function}&apikey={ALPHA_VANTAGE_KEY}"
    if symbol:
        url += f"&symbol={symbol}"
    if interval:
        url += f"&interval={interval}"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            return resp.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Alpha Vantage API error: {str(e)}")
