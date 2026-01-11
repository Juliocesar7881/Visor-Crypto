"""
Order Book e SuperTrend Routes
Livro de ordens e indicador de tendência
"""
from fastapi import APIRouter, HTTPException
from typing import Optional, List
from datetime import datetime
import random
import math

router = APIRouter(prefix="/orderbook", tags=["orderbook"])

# Simulação de Order Book
def generate_order_book(symbol: str = "BTC", current_price: float = 97500):
    """Gera um order book simulado realista"""
    
    bids = []  # Ordens de compra
    asks = []  # Ordens de venda
    
    # Gerar 20 níveis de preço para cada lado
    for i in range(20):
        # Bids (compras) - abaixo do preço atual
        bid_price = current_price * (1 - (i + 1) * 0.001)  # 0.1% abaixo cada nível
        bid_quantity = random.uniform(0.1, 5.0) * (1 + i * 0.1)  # Volume aumenta longe do preço
        bids.append({
            "price": round(bid_price, 2),
            "quantity": round(bid_quantity, 4),
            "total": round(bid_price * bid_quantity, 2)
        })
        
        # Asks (vendas) - acima do preço atual
        ask_price = current_price * (1 + (i + 1) * 0.001)
        ask_quantity = random.uniform(0.1, 5.0) * (1 + i * 0.1)
        asks.append({
            "price": round(ask_price, 2),
            "quantity": round(ask_quantity, 4),
            "total": round(ask_price * ask_quantity, 2)
        })
    
    # Calcular totais acumulados
    bid_total = sum(b["total"] for b in bids)
    ask_total = sum(a["total"] for a in asks)
    
    return {
        "symbol": f"{symbol}/USDT",
        "timestamp": datetime.now().isoformat(),
        "current_price": current_price,
        "spread": round(asks[0]["price"] - bids[0]["price"], 2),
        "spread_percentage": round((asks[0]["price"] - bids[0]["price"]) / current_price * 100, 4),
        "bids": bids,
        "asks": asks,
        "bid_total_volume": round(sum(b["quantity"] for b in bids), 4),
        "ask_total_volume": round(sum(a["quantity"] for a in asks), 4),
        "bid_total_usd": round(bid_total, 2),
        "ask_total_usd": round(ask_total, 2),
        "imbalance": round((bid_total - ask_total) / (bid_total + ask_total) * 100, 2)  # Positivo = mais compradores
    }


def calculate_supertrend(prices: list, period: int = 10, multiplier: float = 3.0):
    """
    Calcula o indicador SuperTrend
    
    SuperTrend = ATR-based trend indicator
    - Verde (bullish): Preço acima do SuperTrend
    - Vermelho (bearish): Preço abaixo do SuperTrend
    """
    if len(prices) < period:
        return None
    
    # Simular dados OHLC baseado nos preços
    highs = [p * random.uniform(1.001, 1.02) for p in prices]
    lows = [p * random.uniform(0.98, 0.999) for p in prices]
    closes = prices
    
    # Calcular True Range
    tr_list = []
    for i in range(len(prices)):
        if i == 0:
            tr = highs[i] - lows[i]
        else:
            tr = max(
                highs[i] - lows[i],
                abs(highs[i] - closes[i-1]),
                abs(lows[i] - closes[i-1])
            )
        tr_list.append(tr)
    
    # Calcular ATR (Average True Range)
    atr = sum(tr_list[-period:]) / period
    
    # Calcular SuperTrend
    hl2 = (highs[-1] + lows[-1]) / 2
    upper_band = hl2 + (multiplier * atr)
    lower_band = hl2 - (multiplier * atr)
    
    current_price = closes[-1]
    
    # Determinar tendência
    trend = "bullish" if current_price > lower_band else "bearish"
    supertrend_value = lower_band if trend == "bullish" else upper_band
    
    # Calcular força da tendência (distância do preço ao SuperTrend)
    distance = abs(current_price - supertrend_value)
    strength = min(100, (distance / current_price) * 1000)  # 0-100%
    
    return {
        "trend": trend,
        "supertrend_value": round(supertrend_value, 2),
        "upper_band": round(upper_band, 2),
        "lower_band": round(lower_band, 2),
        "atr": round(atr, 2),
        "current_price": round(current_price, 2),
        "strength": round(strength, 1),
        "signal": "BUY" if trend == "bullish" else "SELL",
        "distance_to_flip": round(distance, 2)
    }


@router.get("/{symbol}")
async def get_order_book(symbol: str = "BTC"):
    """
    Retorna o livro de ordens para um símbolo
    
    - symbol: BTC, ETH, SOL, etc.
    """
    # Preços base simulados
    base_prices = {
        "BTC": 97500,
        "ETH": 3450,
        "SOL": 185,
        "BNB": 620,
        "XRP": 2.35,
        "DOGE": 0.38,
        "ADA": 0.95,
        "AVAX": 42
    }
    
    symbol = symbol.upper()
    price = base_prices.get(symbol, 100)
    # Adicionar variação randômica
    price = price * random.uniform(0.99, 1.01)
    
    order_book = generate_order_book(symbol, price)
    return order_book


@router.get("/supertrend/{symbol}")
async def get_supertrend(symbol: str = "BTC", period: int = 10, multiplier: float = 3.0):
    """
    Calcula o indicador SuperTrend para um símbolo
    
    - symbol: BTC, ETH, SOL, etc.
    - period: Período do ATR (padrão: 10)
    - multiplier: Multiplicador do ATR (padrão: 3.0)
    
    Retorna:
    - trend: bullish ou bearish
    - signal: BUY ou SELL
    - strength: força da tendência (0-100%)
    """
    base_prices = {
        "BTC": 97500,
        "ETH": 3450,
        "SOL": 185,
        "BNB": 620,
        "XRP": 2.35
    }
    
    symbol = symbol.upper()
    base_price = base_prices.get(symbol, 100)
    
    # Gerar histórico de preços simulado (últimos 50 períodos)
    prices = []
    price = base_price * 0.95  # Começar um pouco abaixo
    for i in range(50):
        # Tendência de alta com ruído
        price = price * random.uniform(0.995, 1.015)
        prices.append(price)
    
    supertrend = calculate_supertrend(prices, period, multiplier)
    
    if not supertrend:
        raise HTTPException(status_code=400, detail="Dados insuficientes para calcular SuperTrend")
    
    return {
        "symbol": f"{symbol}/USDT",
        "timestamp": datetime.now().isoformat(),
        "period": period,
        "multiplier": multiplier,
        **supertrend
    }


@router.post("/order/market")
async def place_market_order(symbol: str, side: str, quantity: float):
    """
    Simula uma ordem de mercado (execução imediata)
    
    - symbol: Par de trading (ex: BTC)
    - side: buy ou sell
    - quantity: Quantidade a comprar/vender
    """
    base_prices = {"BTC": 97500, "ETH": 3450, "SOL": 185}
    price = base_prices.get(symbol.upper(), 100) * random.uniform(0.999, 1.001)
    
    return {
        "order_type": "market",
        "symbol": f"{symbol.upper()}/USDT",
        "side": side.lower(),
        "quantity": quantity,
        "executed_price": round(price, 2),
        "total": round(price * quantity, 2),
        "status": "filled",
        "timestamp": datetime.now().isoformat(),
        "fee": round(price * quantity * 0.001, 2)  # 0.1% fee
    }


@router.post("/order/limit")
async def place_limit_order(symbol: str, side: str, quantity: float, limit_price: float):
    """
    Simula uma ordem limite (execução quando preço atingir)
    
    - symbol: Par de trading (ex: BTC)
    - side: buy ou sell
    - quantity: Quantidade
    - limit_price: Preço limite desejado
    """
    base_prices = {"BTC": 97500, "ETH": 3450, "SOL": 185}
    current_price = base_prices.get(symbol.upper(), 100)
    
    # Verificar se ordem será executada imediatamente
    if side.lower() == "buy" and limit_price >= current_price:
        status = "filled"
        executed_price = current_price
    elif side.lower() == "sell" and limit_price <= current_price:
        status = "filled"
        executed_price = current_price
    else:
        status = "pending"
        executed_price = None
    
    return {
        "order_type": "limit",
        "symbol": f"{symbol.upper()}/USDT",
        "side": side.lower(),
        "quantity": quantity,
        "limit_price": limit_price,
        "current_price": current_price,
        "executed_price": executed_price,
        "total": round(limit_price * quantity, 2),
        "status": status,
        "timestamp": datetime.now().isoformat(),
        "estimated_fee": round(limit_price * quantity * 0.001, 2)
    }


@router.get("/whale-tracker")
async def get_whale_movements():
    """
    Retorna movimentações de baleias (grandes investidores)
    
    Monitora:
    - BlackRock, Grayscale, MicroStrategy
    - Grandes wallets
    - Fluxos de exchanges
    """
    whales = [
        {
            "entity": "BlackRock",
            "action": "BUY",
            "amount_btc": 1250.5,
            "amount_usd": 121_923_750,
            "timestamp": "2025-12-15T10:30:00Z",
            "wallet": "bc1q...arkm",
            "explorer_url": "https://intel.arkm.com/explorer/entity/blackrock"
        },
        {
            "entity": "MicroStrategy",
            "action": "HOLD",
            "total_btc": 439_000,
            "total_usd": 42_802_500_000,
            "timestamp": "2025-12-15T09:00:00Z",
            "wallet": "bc1q...mstr"
        },
        {
            "entity": "Grayscale GBTC",
            "action": "OUTFLOW",
            "amount_btc": -520.3,
            "amount_usd": -50_729_250,
            "timestamp": "2025-12-15T08:45:00Z"
        },
        {
            "entity": "Unknown Whale",
            "action": "TRANSFER",
            "amount_btc": 2000,
            "amount_usd": 195_000_000,
            "from": "Binance",
            "to": "Cold Wallet",
            "timestamp": "2025-12-15T07:30:00Z"
        }
    ]
    
    return {
        "timestamp": datetime.now().isoformat(),
        "whale_movements": whales,
        "summary": {
            "net_flow_btc": 730.2,  # Positivo = acumulação
            "net_flow_usd": 71_194_500,
            "sentiment": "bullish",
            "institutional_buying": True
        },
        "links": {
            "arkham_blackrock": "https://intel.arkm.com/explorer/entity/blackrock",
            "arkham_grayscale": "https://intel.arkm.com/explorer/entity/grayscale",
            "arkham_microstrategy": "https://intel.arkm.com/explorer/entity/microstrategy"
        }
    }
