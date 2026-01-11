"""
Market Routes - CoinGecko Integration
Dados de mercado, heatmaps, relatórios
"""
from fastapi import APIRouter, HTTPException
from typing import Optional, List
from app.core.config import get_settings
from app.services.coingecko import CoinGeckoService

router = APIRouter(prefix="/market", tags=["market"])
settings = get_settings()

# Inicializar serviço
coingecko_service = None
if hasattr(settings, 'coingecko_api_key') and settings.coingecko_api_key:
    coingecko_service = CoinGeckoService(settings.coingecko_api_key)


@router.get("/price")
async def get_price(coins: str = "bitcoin,ethereum,solana"):
    """
    Buscar preços de moedas
    
    - coins: Lista separada por vírgula (ex: bitcoin,ethereum,bnb)
    """
    if not coingecko_service:
        raise HTTPException(status_code=503, detail="CoinGecko API não configurada")
    
    try:
        coin_list = coins.split(',')
        prices = await coingecko_service.get_price(coin_list, include_24h_change=True)
        return prices
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/top")
async def get_top_coins(limit: int = 100):
    """
    Top moedas por market cap
    
    - limit: Quantas moedas retornar (1-250)
    """
    if not coingecko_service:
        raise HTTPException(status_code=503, detail="CoinGecko API não configurada")
    
    try:
        coins = await coingecko_service.get_top_coins(limit=min(limit, 250))
        return {"coins": coins, "count": len(coins)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/overview")
async def get_market_overview():
    """
    Visão geral do mercado cripto
    
    Retorna:
    - Market cap total
    - Volume 24h
    - Dominância BTC/ETH
    - Total de criptomoedas
    - Variação 24h
    """
    if not coingecko_service:
        raise HTTPException(status_code=503, detail="CoinGecko API não configurada")
    
    try:
        overview = await coingecko_service.get_market_overview()
        return overview
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/trending")
async def get_trending():
    """
    Moedas em alta (trending) no momento
    """
    if not coingecko_service:
        raise HTTPException(status_code=503, detail="CoinGecko API não configurada")
    
    try:
        trending = await coingecko_service.get_trending()
        return {"trending": trending, "count": len(trending)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/coin/{coin_id}")
async def get_coin_details(coin_id: str):
    """
    Detalhes completos de uma moeda
    
    - coin_id: ID da moeda (ex: bitcoin, ethereum, solana)
    """
    if not coingecko_service:
        raise HTTPException(status_code=503, detail="CoinGecko API não configurada")
    
    try:
        details = await coingecko_service.get_coin_details(coin_id)
        return details
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/heatmap")
async def get_heatmap(limit: int = 50):
    """
    Dados para heatmap de criptomoedas
    
    - limit: Quantas moedas incluir (1-100)
    
    Retorna dados prontos para visualização em heatmap
    """
    if not coingecko_service:
        raise HTTPException(status_code=503, detail="CoinGecko API não configurada")
    
    try:
        heatmap_data = await coingecko_service.get_heatmap_data(limit=min(limit, 100))
        return {"data": heatmap_data, "count": len(heatmap_data)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/fear-greed")
async def get_fear_greed_index():
    """
    Índice Fear & Greed do mercado cripto
    
    Valores:
    - 0-24: Extreme Fear 😱
    - 25-44: Fear 😰
    - 45-55: Neutral 😐
    - 56-75: Greed 😊
    - 76-100: Extreme Greed 🤑
    """
    if not coingecko_service:
        raise HTTPException(status_code=503, detail="CoinGecko API não configurada")
    
    try:
        fng = await coingecko_service.get_fear_and_greed_index()
        return fng
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/report")
async def get_market_report():
    """
    Relatório completo do mercado
    
    Inclui:
    - Visão geral (market cap, volume, dominância)
    - Fear & Greed Index
    - Top 5 moedas em alta
    - Top 5 gainers (maiores altas 24h)
    - Top 5 losers (maiores quedas 24h)
    """
    if not coingecko_service:
        raise HTTPException(status_code=503, detail="CoinGecko API não configurada")
    
    try:
        report = await coingecko_service.get_market_report()
        return report
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
