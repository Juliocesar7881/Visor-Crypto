"""
Technical Analysis Service
Serviço de Análise Técnica com Confluência Institucional

Calcula:
- Fluxo (CVD Proxy, Open Interest)
- Estrutura (EMA, VWAP)
- Filtros de Segurança (RSI, ADX, Fear & Greed)
- Score de Confluência (0-100)
- Recomendação IA via Groq API (gratuita)
"""

import asyncio
import httpx
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
from dataclasses import dataclass, asdict
from enum import Enum
import json
from functools import lru_cache

# Importar settings para pegar a API key
from app.core.config import get_settings

# ==================== TIPOS ====================
class Bias(str, Enum):
    LONG = "LONG"
    SHORT = "SHORT"
    NEUTRAL = "NEUTRAL"

class Action(str, Enum):
    LONG_RAPIDO = "LONG_RAPIDO"
    SHORT_RAPIDO = "SHORT_RAPIDO"
    LONG_SWING = "LONG_SWING"
    SHORT_SWING = "SHORT_SWING"
    NAO_OPERAR = "NAO_OPERAR"

@dataclass
class CandleData:
    open_time: int
    open: float
    high: float
    low: float
    close: float
    volume: float
    close_time: int
    quote_volume: float
    trades: int
    taker_buy_base_volume: float
    taker_buy_quote_volume: float

@dataclass
class FlowAnalysis:
    cvd_proxy: float
    cvd_trend: str
    buy_volume: float
    sell_volume: float
    volume_ratio: float
    open_interest: float
    oi_change_24h: float
    oi_trend: str

@dataclass
class StructureAnalysis:
    ema200_1h: float
    ema200_4h: float
    price_vs_ema200_1h: str
    price_vs_ema200_4h: str
    vwap: float
    price_vs_vwap: str
    trend: str

@dataclass
class SafetyFilters:
    rsi14: float
    rsi_divergence: str
    adx14: float
    trend_strength: str
    btc_dominance: float
    btc_dominance_change: float
    fear_greed_index: int
    fear_greed_label: str

@dataclass
class ConfluenceScore:
    total: int
    flow_score: int
    structure_score: int
    safety_score: int
    bias: str
    probability: int

@dataclass
class AIRecommendation:
    action: str
    confidence: int
    reasoning: str
    entry: Optional[float] = None
    stop_loss: Optional[float] = None
    take_profit: Optional[List[float]] = None
    risk_reward_ratio: Optional[float] = None
    timeframe: str = ""

@dataclass
class KeyLevels:
    strong_resistances: List[float]
    strong_supports: List[float]
    liquidation_zones: List[Dict[str, Any]]

@dataclass
class TechnicalAnalysisResult:
    symbol: str
    timestamp: int
    current_price: float
    flow: FlowAnalysis
    structure: StructureAnalysis
    safety: SafetyFilters
    confluence: ConfluenceScore
    ai_recommendation: AIRecommendation
    key_levels: KeyLevels
    summary: str
    ai_text_recommendation: Optional[str] = None

# ==================== CACHE ====================
_analysis_cache: Dict[str, tuple] = {}  # {symbol: (result, expiry_time)}
CACHE_DURATION = 15 * 60  # 15 minutos em segundos

def get_cached_analysis(symbol: str) -> Optional[TechnicalAnalysisResult]:
    """Retorna análise do cache se ainda válida"""
    if symbol in _analysis_cache:
        result, expiry = _analysis_cache[symbol]
        if datetime.now().timestamp() < expiry:
            return result
        else:
            del _analysis_cache[symbol]
    return None

def set_cached_analysis(symbol: str, result: TechnicalAnalysisResult):
    """Salva análise no cache"""
    expiry = datetime.now().timestamp() + CACHE_DURATION
    _analysis_cache[symbol] = (result, expiry)

# ==================== BINANCE API ====================
BINANCE_BASE = "https://api.binance.com"
BINANCE_FUTURES_BASE = "https://fapi.binance.com"

async def fetch_candles(client: httpx.AsyncClient, symbol: str, interval: str, limit: int = 50) -> List[CandleData]:
    """Busca candles da Binance"""
    formatted_symbol = symbol if "USDT" in symbol else f"{symbol}USDT"
    url = f"{BINANCE_BASE}/api/v3/klines"
    params = {"symbol": formatted_symbol, "interval": interval, "limit": limit}
    
    response = await client.get(url, params=params)
    data = response.json()
    
    if not isinstance(data, list):
        raise ValueError(f"Invalid candle data: {data}")
    
    return [
        CandleData(
            open_time=c[0],
            open=float(c[1]),
            high=float(c[2]),
            low=float(c[3]),
            close=float(c[4]),
            volume=float(c[5]),
            close_time=c[6],
            quote_volume=float(c[7]),
            trades=c[8],
            taker_buy_base_volume=float(c[9]),
            taker_buy_quote_volume=float(c[10]),
        )
        for c in data
    ]

async def fetch_open_interest(client: httpx.AsyncClient, symbol: str) -> Dict[str, Any]:
    """Busca Open Interest da Binance Futures"""
    try:
        formatted_symbol = symbol if "USDT" in symbol else f"{symbol}USDT"
        url = f"{BINANCE_FUTURES_BASE}/fapi/v1/openInterest"
        params = {"symbol": formatted_symbol}
        
        response = await client.get(url, params=params)
        data = response.json()
        
        return {
            "open_interest": float(data.get("openInterest", 0)),
            "time": data.get("time", int(datetime.now().timestamp() * 1000)),
        }
    except Exception as e:
        print(f"OI fetch error: {e}")
        return {"open_interest": 0, "time": int(datetime.now().timestamp() * 1000)}

async def fetch_fear_greed_index(client: httpx.AsyncClient) -> Dict[str, Any]:
    """Busca Fear & Greed Index"""
    try:
        url = "https://api.alternative.me/fng/?limit=1"
        response = await client.get(url)
        data = response.json()
        
        return {
            "value": int(data["data"][0]["value"]),
            "classification": data["data"][0]["value_classification"],
        }
    except Exception as e:
        print(f"Fear & Greed fetch error: {e}")
        return {"value": 50, "classification": "Neutral"}

async def fetch_btc_dominance(client: httpx.AsyncClient) -> Dict[str, Any]:
    """Busca BTC Dominance"""
    try:
        url = "https://api.coingecko.com/api/v3/global"
        response = await client.get(url)
        data = response.json()
        
        return {
            "dominance": data["data"]["market_cap_percentage"].get("btc", 0),
            "change_24h": data["data"].get("market_cap_change_percentage_24h_usd", 0),
        }
    except Exception as e:
        print(f"BTC Dominance fetch error: {e}")
        return {"dominance": 50, "change_24h": 0}

# ==================== INDICADORES TÉCNICOS ====================
def calculate_ema(closes: List[float], period: int) -> float:
    """Calcula EMA"""
    if len(closes) < period:
        return closes[-1] if closes else 0
    
    multiplier = 2 / (period + 1)
    ema = sum(closes[:period]) / period
    
    for close in closes[period:]:
        ema = (close - ema) * multiplier + ema
    
    return ema

def calculate_rsi(closes: List[float], period: int = 14) -> float:
    """Calcula RSI"""
    if len(closes) < period + 1:
        return 50
    
    gains = 0
    losses = 0
    
    for i in range(1, period + 1):
        change = closes[i] - closes[i - 1]
        if change > 0:
            gains += change
        else:
            losses -= change
    
    avg_gain = gains / period
    avg_loss = losses / period
    
    for i in range(period + 1, len(closes)):
        change = closes[i] - closes[i - 1]
        if change > 0:
            avg_gain = (avg_gain * (period - 1) + change) / period
            avg_loss = (avg_loss * (period - 1)) / period
        else:
            avg_gain = (avg_gain * (period - 1)) / period
            avg_loss = (avg_loss * (period - 1) - change) / period
    
    if avg_loss == 0:
        return 100
    
    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))

def calculate_adx(candles: List[CandleData], period: int = 14) -> float:
    """Calcula ADX simplificado"""
    if len(candles) < period * 2:
        return 25
    
    tr_list = []
    plus_dm_list = []
    minus_dm_list = []
    
    for i in range(1, len(candles)):
        high = candles[i].high
        low = candles[i].low
        prev_high = candles[i - 1].high
        prev_low = candles[i - 1].low
        prev_close = candles[i - 1].close
        
        tr = max(high - low, abs(high - prev_close), abs(low - prev_close))
        tr_list.append(tr)
        
        up_move = high - prev_high
        down_move = prev_low - low
        
        if up_move > down_move and up_move > 0:
            plus_dm_list.append(up_move)
        else:
            plus_dm_list.append(0)
        
        if down_move > up_move and down_move > 0:
            minus_dm_list.append(down_move)
        else:
            minus_dm_list.append(0)
    
    smooth_tr = calculate_ema(tr_list, period)
    smooth_plus_dm = calculate_ema(plus_dm_list, period)
    smooth_minus_dm = calculate_ema(minus_dm_list, period)
    
    if smooth_tr == 0:
        return 25
    
    plus_di = (smooth_plus_dm / smooth_tr) * 100
    minus_di = (smooth_minus_dm / smooth_tr) * 100
    
    if plus_di + minus_di == 0:
        return 25
    
    dx = (abs(plus_di - minus_di) / (plus_di + minus_di)) * 100
    return dx

def calculate_vwap(candles: List[CandleData]) -> float:
    """Calcula VWAP"""
    cumulative_tpv = 0
    cumulative_volume = 0
    
    for candle in candles:
        typical_price = (candle.high + candle.low + candle.close) / 3
        cumulative_tpv += typical_price * candle.volume
        cumulative_volume += candle.volume
    
    return cumulative_tpv / cumulative_volume if cumulative_volume > 0 else candles[-1].close

def detect_rsi_divergence(prices: List[float], rsi_values: List[float]) -> str:
    """Detecta divergências no RSI"""
    if len(prices) < 10 or len(rsi_values) < 10:
        return "none"
    
    recent_prices = prices[-10:]
    recent_rsi = rsi_values[-10:]
    
    # Divergência bearish
    price_high = max(recent_prices)
    price_high_idx = len(recent_prices) - 1 - recent_prices[::-1].index(price_high)
    
    if price_high_idx > 5:
        prev_high_idx = recent_prices[:price_high_idx].index(max(recent_prices[:price_high_idx]))
        if recent_rsi[price_high_idx] < recent_rsi[prev_high_idx]:
            return "bearish"
    
    # Divergência bullish
    price_low = min(recent_prices)
    price_low_idx = len(recent_prices) - 1 - recent_prices[::-1].index(price_low)
    
    if price_low_idx > 5:
        prev_low_idx = recent_prices[:price_low_idx].index(min(recent_prices[:price_low_idx]))
        if recent_rsi[price_low_idx] > recent_rsi[prev_low_idx]:
            return "bullish"
    
    return "none"

# ==================== SCORE DE CONFLUÊNCIA ====================
def calculate_flow_score(flow: FlowAnalysis) -> int:
    """Calcula score de fluxo (0-100)"""
    score = 50
    
    # CVD Proxy (±30)
    if flow.cvd_trend == "bullish":
        score += 30 if flow.volume_ratio > 1.2 else 20 if flow.volume_ratio > 1.1 else 10
    elif flow.cvd_trend == "bearish":
        score -= 30 if flow.volume_ratio < 0.8 else 20 if flow.volume_ratio < 0.9 else 10
    
    # Open Interest (±20)
    if flow.oi_trend == "increasing":
        score += 20 if flow.oi_change_24h > 5 else 15 if flow.oi_change_24h > 2 else 10
    elif flow.oi_trend == "decreasing":
        score += 10 if flow.cvd_trend == "bullish" else -10
    
    return max(0, min(100, score))

def calculate_structure_score(structure: StructureAnalysis) -> int:
    """Calcula score de estrutura (0-100)"""
    score = 50
    
    # EMA 200 (±25)
    if structure.price_vs_ema200_1h == "above" and structure.price_vs_ema200_4h == "above":
        score += 25
    elif structure.price_vs_ema200_1h == "below" and structure.price_vs_ema200_4h == "below":
        score -= 25
    else:
        score += 10 if structure.price_vs_ema200_4h == "above" else -10
    
    # VWAP (±15)
    score += 15 if structure.price_vs_vwap == "above" else -15
    
    # Trend (±10)
    if structure.trend == "uptrend":
        score += 10
    elif structure.trend == "downtrend":
        score -= 10
    
    return max(0, min(100, score))

def calculate_safety_score(safety: SafetyFilters, is_altcoin: bool) -> int:
    """Calcula score de segurança (0-100)"""
    score = 50
    
    # RSI Divergence (±15)
    if safety.rsi_divergence == "bullish":
        score += 15
    elif safety.rsi_divergence == "bearish":
        score -= 15
    
    # ADX (±10)
    if safety.adx14 > 25:
        score += 10 if safety.trend_strength == "strong" else 5
    else:
        score -= 5
    
    # Fear & Greed (±10)
    if safety.fear_greed_index < 25:
        score += 10
    elif safety.fear_greed_index > 75:
        score -= 10
    
    # BTC Dominance para altcoins (±15)
    if is_altcoin:
        if safety.btc_dominance_change > 2:
            score -= 15
        elif safety.btc_dominance_change < -2:
            score += 15
    
    return max(0, min(100, score))

def calculate_confluence(
    flow: FlowAnalysis, 
    structure: StructureAnalysis, 
    safety: SafetyFilters, 
    is_altcoin: bool
) -> ConfluenceScore:
    """Calcula score de confluência total"""
    flow_score = calculate_flow_score(flow)
    structure_score = calculate_structure_score(structure)
    safety_score = calculate_safety_score(safety, is_altcoin)
    
    # Pesos: Fluxo 3x, Estrutura 2x, Segurança 1x
    weighted_score = (flow_score * 3 + structure_score * 2 + safety_score * 1) / 6
    
    # Determinar viés
    if weighted_score >= 60:
        bias = Bias.LONG
    elif weighted_score <= 40:
        bias = Bias.SHORT
    else:
        bias = Bias.NEUTRAL
    
    # Probabilidade
    distance_from_neutral = abs(weighted_score - 50)
    probability = min(95, 50 + distance_from_neutral)
    
    return ConfluenceScore(
        total=round(weighted_score),
        flow_score=flow_score,
        structure_score=structure_score,
        safety_score=safety_score,
        bias=bias.value,
        probability=round(probability),
    )

# ==================== RECOMENDAÇÃO IA ====================
def generate_ai_recommendation(
    confluence: ConfluenceScore,
    current_price: float,
    flow: FlowAnalysis,
    structure: StructureAnalysis,
    safety: SafetyFilters,
    candles: List[CandleData],
) -> AIRecommendation:
    """Gera recomendação baseada na confluência"""
    # Calcular ATR simplificado
    highs = [c.high for c in candles[-20:]]
    lows = [c.low for c in candles[-20:]]
    atr = (max(highs) - min(lows)) / 20
    
    if confluence.total >= 75:
        action = Action.LONG_RAPIDO if flow.cvd_proxy > 0 and safety.adx14 > 25 else Action.LONG_SWING
        stop_loss = current_price - (atr * 1.5)
        take_profit = [current_price * 1.02, current_price * 1.05, current_price * 1.10]
        timeframe = "1-4 horas" if action == Action.LONG_RAPIDO else "1-7 dias"
        reasoning = f"✅ CONFLUÊNCIA FORTE ({confluence.total}%)\n\n📊 Fluxo: Volume comprador dominante ({confluence.flow_score}%)\n📈 Estrutura: Preço acima de níveis chave ({confluence.structure_score}%)\n🛡️ Segurança: Indicadores confirmam ({confluence.safety_score}%)"
    elif confluence.total <= 25:
        action = Action.SHORT_RAPIDO if flow.cvd_proxy < 0 and safety.adx14 > 25 else Action.SHORT_SWING
        stop_loss = current_price + (atr * 1.5)
        take_profit = [current_price * 0.98, current_price * 0.95, current_price * 0.90]
        timeframe = "1-4 horas" if action == Action.SHORT_RAPIDO else "1-7 dias"
        reasoning = f"🔴 CONFLUÊNCIA BEARISH ({confluence.total}%)\n\n📊 Fluxo: Volume vendedor dominante ({confluence.flow_score}%)\n📉 Estrutura: Preço abaixo de níveis chave ({confluence.structure_score}%)\n🛡️ Segurança: Indicadores negativos ({confluence.safety_score}%)"
    elif confluence.total >= 55:
        action = Action.LONG_SWING
        stop_loss = current_price - (atr * 2)
        take_profit = [current_price * 1.03, current_price * 1.06]
        timeframe = "2-5 dias"
        reasoning = f"🟡 CONFLUÊNCIA MODERADA BULLISH ({confluence.total}%)\n\nPosição menor recomendada. Aguarde confirmação com volume."
    elif confluence.total <= 45:
        action = Action.SHORT_SWING
        stop_loss = current_price + (atr * 2)
        take_profit = [current_price * 0.97, current_price * 0.94]
        timeframe = "2-5 dias"
        reasoning = f"🟡 CONFLUÊNCIA MODERADA BEARISH ({confluence.total}%)\n\nPosição menor recomendada. Stop curto obrigatório."
    else:
        action = Action.NAO_OPERAR
        stop_loss = 0
        take_profit = []
        timeframe = "-"
        reasoning = f"⚪ ZONA NEUTRA ({confluence.total}%)\n\n🚫 NÃO OPERAR - Aguarde confluência\nMercado em consolidação. Risco de falsas entradas alto."
    
    # Risk/Reward
    rr_ratio = abs(take_profit[0] - current_price) / abs(current_price - stop_loss) if take_profit and stop_loss else 0
    
    return AIRecommendation(
        action=action.value,
        confidence=confluence.probability,
        reasoning=reasoning,
        entry=round(current_price, 2),
        stop_loss=round(stop_loss, 2) if stop_loss else None,
        take_profit=[round(tp, 2) for tp in take_profit] if take_profit else None,
        risk_reward_ratio=round(rr_ratio, 2) if rr_ratio else None,
        timeframe=timeframe,
    )

# ==================== NÍVEIS CHAVE ====================
def calculate_key_levels(candles: List[CandleData]) -> KeyLevels:
    """Calcula níveis chave de suporte/resistência"""
    highs = [c.high for c in candles]
    lows = [c.low for c in candles]
    
    resistances = []
    supports = []
    
    for i in range(2, len(candles) - 2):
        # Pivot high
        if highs[i] > highs[i-1] and highs[i] > highs[i-2] and highs[i] > highs[i+1] and highs[i] > highs[i+2]:
            resistances.append(highs[i])
        # Pivot low
        if lows[i] < lows[i-1] and lows[i] < lows[i-2] and lows[i] < lows[i+1] and lows[i] < lows[i+2]:
            supports.append(lows[i])
    
    strong_resistances = sorted(resistances, reverse=True)[:3]
    strong_supports = sorted(supports)[:3]
    
    # Zonas de liquidação estimadas
    current_price = candles[-1].close
    atr = (max(highs[-14:]) - min(lows[-14:])) / 14
    
    liquidation_zones = [
        {"price": round(current_price - atr * 2, 2), "type": "long", "magnitude": 70},
        {"price": round(current_price - atr * 3, 2), "type": "long", "magnitude": 90},
        {"price": round(current_price + atr * 2, 2), "type": "short", "magnitude": 70},
        {"price": round(current_price + atr * 3, 2), "type": "short", "magnitude": 90},
    ]
    
    return KeyLevels(
        strong_resistances=[round(r, 2) for r in strong_resistances],
        strong_supports=[round(s, 2) for s in strong_supports],
        liquidation_zones=liquidation_zones,
    )

# ==================== GROQ AI (LLama - Gratuito) ====================
async def get_ai_text_recommendation(
    client: httpx.AsyncClient,
    symbol: str,
    confluence: ConfluenceScore,
    flow: FlowAnalysis,
    structure: StructureAnalysis,
    safety: SafetyFilters,
    current_price: float,
    recommendation: AIRecommendation,
    key_levels: KeyLevels,
) -> Optional[str]:
    """Gera recomendação em texto usando Groq API (gratuita com Llama)"""
    settings = get_settings()
    groq_api_key = settings.groq_api_key
    
    if not groq_api_key:
        return generate_local_recommendation_text(symbol, confluence, recommendation)
    
    try:
        # Prompt otimizado para máxima assertividade
        prompt = f"""Você é um trader profissional de criptomoedas com 15 anos de experiência em análise institucional. Analise os dados abaixo e dê uma recomendação OBJETIVA e ASSERTIVA.

═══════════════════════════════════════
📊 ANÁLISE DE CONFLUÊNCIA: {symbol}
═══════════════════════════════════════

💰 PREÇO ATUAL: ${current_price:,.2f}

📈 SCORE GERAL: {confluence.total}/100
   • Viés: {confluence.bias}
   • Probabilidade: {confluence.probability}%
   • Flow Score: {confluence.flow_score}/100 (peso 3x)
   • Structure Score: {confluence.structure_score}/100 (peso 2x)  
   • Safety Score: {confluence.safety_score}/100 (peso 1x)

🌊 ANÁLISE DE FLUXO (Mais importante):
   • CVD (Volume Delta): {flow.cvd_trend.upper()} {'✅' if flow.cvd_trend == 'bullish' else '❌' if flow.cvd_trend == 'bearish' else '⚪'}
   • Ratio Compra/Venda: {flow.volume_ratio:.2f} {'(Compradores dominam)' if flow.volume_ratio > 1.1 else '(Vendedores dominam)' if flow.volume_ratio < 0.9 else '(Equilibrado)'}
   • Open Interest: {flow.oi_trend.upper()} {'📈' if flow.oi_trend == 'increasing' else '📉' if flow.oi_trend == 'decreasing' else '➡️'}
   • OI Variação: {flow.oi_change_24h:.1f}%

📐 ANÁLISE DE ESTRUTURA:
   • vs EMA200 (1H): {structure.price_vs_ema200_1h.upper()} {'✅' if structure.price_vs_ema200_1h == 'above' else '❌'}
   • vs EMA200 (4H): {structure.price_vs_ema200_4h.upper()} {'✅' if structure.price_vs_ema200_4h == 'above' else '❌'}
   • vs VWAP: {structure.price_vs_vwap.upper()} {'✅' if structure.price_vs_vwap == 'above' else '❌'}
   • Tendência: {structure.trend.upper()}

🛡️ FILTROS DE SEGURANÇA:
   • RSI (14): {safety.rsi14:.1f} {'⚠️ SOBRECOMPRADO' if safety.rsi14 > 70 else '⚠️ SOBREVENDIDO' if safety.rsi14 < 30 else '✅ OK'}
   • Divergência RSI: {safety.rsi_divergence.upper()} {'🚨 ATENÇÃO!' if safety.rsi_divergence != 'none' else ''}
   • ADX (14): {safety.adx14:.1f} - Força: {safety.trend_strength.upper()}
   • Fear & Greed: {safety.fear_greed_index} ({safety.fear_greed_label})
   • BTC Dominance: {safety.btc_dominance:.1f}% (var: {safety.btc_dominance_change:+.1f}%)

🎯 NÍVEIS CHAVE:
   • Suportes: {', '.join([f'${s:,.0f}' for s in key_levels.strong_supports[:2]]) if key_levels.strong_supports else 'N/A'}
   • Resistências: {', '.join([f'${r:,.0f}' for r in key_levels.strong_resistances[:2]]) if key_levels.strong_resistances else 'N/A'}

🤖 RECOMENDAÇÃO ALGORÍTMICA: {recommendation.action}
   • Entry: ${recommendation.entry:,.2f}
   • Stop Loss: ${recommendation.stop_loss:,.2f}
   • Take Profits: {', '.join([f'${tp:,.2f}' for tp in (recommendation.take_profit or [])])}

═══════════════════════════════════════

Com base nesta análise completa, responda de forma DIRETA e OBJETIVA:

1. **DECISÃO FINAL**: Operar ou não operar? Se sim, LONG ou SHORT?
2. **TIPO DE OPERAÇÃO**: Scalp (minutos), Day Trade (horas), Swing (dias)?
3. **NÍVEL DE CONFIANÇA**: Baixo, Médio, Alto ou Muito Alto?
4. **PRINCIPAIS RAZÕES**: Liste 3 motivos que justificam sua decisão
5. **RISCOS**: Quais os principais riscos desta operação?
6. **DICA PRÁTICA**: Uma dica objetiva para o trader

Seja ASSERTIVO. Não seja vago. Dê uma opinião clara como um trader profissional faria."""

        response = await client.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {groq_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": "llama-3.3-70b-versatile",
                "messages": [
                    {
                        "role": "system",
                        "content": "Você é um trader profissional de criptomoedas. Sempre dê respostas diretas, assertivas e práticas. Nunca seja vago ou indeciso. Use emojis para destacar pontos importantes."
                    },
                    {"role": "user", "content": prompt}
                ],
                "max_tokens": 800,
                "temperature": 0.3,  # Baixa temperatura para mais consistência
            },
            timeout=30.0,
        )
        
        data = response.json()
        return data["choices"][0]["message"]["content"]
    
    except Exception as e:
        print(f"Groq API error: {e}")
        return generate_local_recommendation_text(symbol, confluence, recommendation)

def generate_local_recommendation_text(
    symbol: str,
    confluence: ConfluenceScore,
    recommendation: AIRecommendation,
) -> str:
    """Gera recomendação local sem IA externa"""
    if recommendation.action == Action.NAO_OPERAR.value:
        return f"""🚫 **NÃO OPERAR {symbol}**

O mercado está em zona de indecisão (Score: {confluence.total}/100). Não há confluência suficiente entre os indicadores de fluxo, estrutura e segurança para justificar uma entrada.

**Recomendação:** Aguarde o mercado desenvolver uma tendência mais clara. Foque em outras oportunidades ou mantenha-se em caixa."""

    action_text = "LONG" if "LONG" in recommendation.action else "SHORT"
    speed_text = "RÁPIDO (scalp/intraday)" if "RAPIDO" in recommendation.action else "SWING (1-7 dias)"
    
    return f"""📊 **RECOMENDAÇÃO: {action_text} {speed_text}**

Com base na análise de confluência institucional (Score: {confluence.total}/100, Probabilidade: {confluence.probability}%), o cenário atual favorece uma operação de **{action_text}**.

**Níveis Sugeridos:**
• Entrada: ${recommendation.entry:,.2f}
• Stop Loss: ${recommendation.stop_loss:,.2f}
• Take Profits: {', '.join([f'${tp:,.2f}' for tp in (recommendation.take_profit or [])])}
• Risk/Reward: 1:{recommendation.risk_reward_ratio}

⚠️ **Gestão de Risco:** Nunca arrisque mais de 1-2% do capital por operação. Esta análise é baseada em dados históricos e não garante resultados futuros."""

# ==================== FUNÇÃO PRINCIPAL ====================
async def perform_technical_analysis(
    symbol: str,
    force_refresh: bool = False,
) -> Dict[str, Any]:
    """
    Executa análise técnica completa para um símbolo
    
    Args:
        symbol: Par de trading (ex: BTCUSDT, ETH, SOL)
        force_refresh: Ignora cache e busca dados novos
    
    Returns:
        Dicionário com resultado completo da análise
    """
    # Verificar cache
    if not force_refresh:
        cached = get_cached_analysis(symbol)
        if cached:
            return asdict(cached)
    
    is_altcoin = "BTC" not in symbol.upper()
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        # Buscar dados em paralelo
        candles_15m, candles_1h, candles_4h, oi_data, fear_greed, btc_dom = await asyncio.gather(
            fetch_candles(client, symbol, "15m", 50),
            fetch_candles(client, symbol, "1h", 200),
            fetch_candles(client, symbol, "4h", 50),
            fetch_open_interest(client, symbol),
            fetch_fear_greed_index(client),
            fetch_btc_dominance(client),
        )
        
        current_price = candles_15m[-1].close
        closes_1h = [c.close for c in candles_1h]
        closes_4h = [c.close for c in candles_4h]
        
        # ===== ANÁLISE DE FLUXO =====
        buy_volume = sum(c.taker_buy_base_volume for c in candles_15m)
        total_volume = sum(c.volume for c in candles_15m)
        sell_volume = total_volume - buy_volume
        cvd_proxy = buy_volume - sell_volume
        volume_ratio = buy_volume / sell_volume if sell_volume > 0 else 1
        
        oi_change_24h = ((oi_data["open_interest"] - total_volume * 0.1) / max(oi_data["open_interest"], 1)) * 100
        
        flow = FlowAnalysis(
            cvd_proxy=cvd_proxy,
            cvd_trend="bullish" if cvd_proxy > 0 else "bearish" if cvd_proxy < 0 else "neutral",
            buy_volume=buy_volume,
            sell_volume=sell_volume,
            volume_ratio=volume_ratio,
            open_interest=oi_data["open_interest"],
            oi_change_24h=oi_change_24h,
            oi_trend="increasing" if oi_change_24h > 2 else "decreasing" if oi_change_24h < -2 else "stable",
        )
        
        # ===== ANÁLISE DE ESTRUTURA =====
        ema200_1h = calculate_ema(closes_1h, 200)
        ema200_4h = calculate_ema(closes_4h, 50)
        vwap = calculate_vwap(candles_15m)
        
        structure = StructureAnalysis(
            ema200_1h=ema200_1h,
            ema200_4h=ema200_4h,
            price_vs_ema200_1h="above" if current_price > ema200_1h else "below",
            price_vs_ema200_4h="above" if current_price > ema200_4h else "below",
            vwap=vwap,
            price_vs_vwap="above" if current_price > vwap else "below",
            trend="uptrend" if current_price > ema200_1h and current_price > vwap else 
                  "downtrend" if current_price < ema200_1h and current_price < vwap else "sideways",
        )
        
        # ===== FILTROS DE SEGURANÇA =====
        rsi14 = calculate_rsi(closes_1h, 14)
        adx14 = calculate_adx(candles_1h, 14)
        
        # RSI para cada candle
        rsi_values = [calculate_rsi(closes_1h[:i+15], 14) for i in range(len(closes_1h) - 14)]
        rsi_divergence = detect_rsi_divergence(closes_1h[-10:], rsi_values[-10:] if len(rsi_values) >= 10 else rsi_values)
        
        safety = SafetyFilters(
            rsi14=rsi14,
            rsi_divergence=rsi_divergence,
            adx14=adx14,
            trend_strength="strong" if adx14 > 40 else "moderate" if adx14 > 25 else "weak",
            btc_dominance=btc_dom["dominance"],
            btc_dominance_change=btc_dom["change_24h"],
            fear_greed_index=fear_greed["value"],
            fear_greed_label=fear_greed["classification"],
        )
        
        # ===== CONFLUÊNCIA =====
        confluence = calculate_confluence(flow, structure, safety, is_altcoin)
        
        # ===== RECOMENDAÇÃO =====
        ai_recommendation = generate_ai_recommendation(
            confluence, current_price, flow, structure, safety, candles_1h
        )
        
        # ===== NÍVEIS CHAVE =====
        key_levels = calculate_key_levels(candles_1h)
        
        # ===== IA TEXT (Groq/Llama) =====
        ai_text = await get_ai_text_recommendation(
            client, symbol, confluence, flow, structure, safety, current_price, ai_recommendation, key_levels
        )
        
        # ===== RESULTADO =====
        bias_emoji = "🟢" if confluence.bias == "LONG" else "🔴" if confluence.bias == "SHORT" else "⚪"
        summary = f"{bias_emoji} {confluence.bias} | Score: {confluence.total}/100 | Prob: {confluence.probability}%"
        
        result = TechnicalAnalysisResult(
            symbol=symbol,
            timestamp=int(datetime.now().timestamp() * 1000),
            current_price=current_price,
            flow=flow,
            structure=structure,
            safety=safety,
            confluence=confluence,
            ai_recommendation=ai_recommendation,
            key_levels=key_levels,
            summary=summary,
            ai_text_recommendation=ai_text,
        )
        
        # Salvar no cache
        set_cached_analysis(symbol, result)
        
        return asdict(result)
