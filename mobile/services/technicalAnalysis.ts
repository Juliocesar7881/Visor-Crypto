/**
 * Technical Analysis Service
 * 
 * Serviço de Análise Técnica com sistema de confluência institucional
 * Utiliza Binance API (grátis) + cache inteligente + análise de IA
 * 
 * Inclui: Análise de Notícias do X para impacto no mercado
 */

import * as SecureStore from 'expo-secure-store';
import { fetchXNews, calculateNewsImpact, XNews } from './xNewsService';

// ==================== TIPOS ====================
export interface CandleData {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
  quoteVolume: number;
  trades: number;
  takerBuyBaseVolume: number;
  takerBuyQuoteVolume: number;
}

export interface FlowAnalysis {
  cvdProxy: number;  // Volume Delta aproximado
  cvdTrend: 'bullish' | 'bearish' | 'neutral';
  buyVolume: number;
  sellVolume: number;
  volumeRatio: number;  // Buy/Sell ratio
  openInterest: number;
  oiChange24h: number;
  oiTrend: 'increasing' | 'decreasing' | 'stable';
}

export interface StructureAnalysis {
  ema200_1h: number;
  ema200_4h: number;
  priceVsEma200_1h: 'above' | 'below';
  priceVsEma200_4h: 'above' | 'below';
  vwap: number;
  priceVsVwap: 'above' | 'below';
  trend: 'uptrend' | 'downtrend' | 'sideways';
}

export interface SafetyFilters {
  rsi14: number;
  rsiDivergence: 'bullish' | 'bearish' | 'none';
  adx14: number;
  trendStrength: 'strong' | 'moderate' | 'weak';
  btcDominance: number;
  btcDominanceChange: number;
  fearGreedIndex: number;
  fearGreedLabel: string;
  // Impacto das notícias do X
  newsImpact?: {
    score: number;      // -10 a +10
    label: string;      // 'Muito Bullish' | 'Bullish' | 'Neutro' | 'Bearish' | 'Muito Bearish'
    reasoning: string;  // Resumo da notícia mais importante
  };
}

export interface ConfluenceScore {
  total: number;           // 0-100
  flowScore: number;       // 0-100 (peso 3x)
  structureScore: number;  // 0-100 (peso 2x)
  safetyScore: number;     // 0-100 (peso 1x)
  newsScore?: number;      // 0-100 (peso dinâmico: 0 se neutro, até 2x se muito importante)
  bias: 'LONG' | 'SHORT' | 'NEUTRAL';
  probability: number;     // % de confiança
}

export interface AIRecommendation {
  action: 'LONG_RAPIDO' | 'SHORT_RAPIDO' | 'NAO_OPERAR' | 'LONG_SWING' | 'SHORT_SWING';
  confidence: number;
  reasoning: string;
  entry?: number;
  stopLoss?: number;
  takeProfit?: number[];
  riskRewardRatio?: number;
  timeframe: string;
}

export interface TechnicalAnalysisResult {
  symbol: string;
  timestamp: number;
  currentPrice: number;
  flow: FlowAnalysis;
  structure: StructureAnalysis;
  safety: SafetyFilters;
  confluence: ConfluenceScore;
  aiRecommendation: AIRecommendation;
  keyLevels: {
    strongResistances: number[];
    strongSupports: number[];
    liquidationZones: { price: number; type: 'long' | 'short'; magnitude: number }[];
  };
  summary: string;
  cacheExpiry: number;
  aiTextRecommendation?: string; // Recomendação em texto da IA (Groq/Llama)
  momentum?: {
    macd: { value: number; signal: number; histogram: number };
    stochastic: { k: number; d: number };
    momentum: number;
  };
}

// ==================== CACHE ====================
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos em ms (reduzido de 15 para atualização mais frequente)

// Cache em memória (mais rápido que SecureStore para dados temporários)
const memoryCache: Map<string, TechnicalAnalysisResult> = new Map();

async function getCachedAnalysis(symbol: string): Promise<TechnicalAnalysisResult | null> {
  try {
    // Primeiro tenta cache em memória
    const memoryCached = memoryCache.get(symbol);
    if (memoryCached && Date.now() < memoryCached.cacheExpiry) {
      return memoryCached;
    }
    
    // Fallback para SecureStore
    const cached = await SecureStore.getItemAsync(`ta_${symbol.replace(/[^a-zA-Z0-9]/g, '')}`);
    if (cached) {
      const data: TechnicalAnalysisResult = JSON.parse(cached);
      if (Date.now() < data.cacheExpiry) {
        memoryCache.set(symbol, data);
        return data;
      }
    }
  } catch (e) {
    console.log('Cache read error:', e);
  }
  return null;
}

async function setCachedAnalysis(symbol: string, data: TechnicalAnalysisResult): Promise<void> {
  try {
    data.cacheExpiry = Date.now() + CACHE_DURATION;
    memoryCache.set(symbol, data);
    await SecureStore.setItemAsync(`ta_${symbol.replace(/[^a-zA-Z0-9]/g, '')}`, JSON.stringify(data));
  } catch (e) {
    console.log('Cache write error:', e);
  }
}

// ==================== BINANCE API ====================
const BINANCE_BASE = 'https://api.binance.com';
const BINANCE_FUTURES_BASE = 'https://fapi.binance.com';

async function fetchCandles(symbol: string, interval: string, limit: number = 50): Promise<CandleData[]> {
  const formattedSymbol = symbol.includes('USDT') ? symbol : `${symbol}USDT`;
  
  // Tentar primeiro a API de Futuros (tem dados de volume mais precisos)
  try {
    const futuresUrl = `${BINANCE_FUTURES_BASE}/fapi/v1/klines?symbol=${formattedSymbol}&interval=${interval}&limit=${limit}`;
    const futuresResponse = await fetch(futuresUrl);
    
    if (futuresResponse.ok) {
      const futuresData = await futuresResponse.json();
      
      if (Array.isArray(futuresData) && futuresData.length > 0) {
        return futuresData.map((c: any[]) => ({
          openTime: c[0],
          open: parseFloat(c[1]),
          high: parseFloat(c[2]),
          low: parseFloat(c[3]),
          close: parseFloat(c[4]),
          volume: parseFloat(c[5]),
          closeTime: c[6],
          quoteVolume: parseFloat(c[7]),
          trades: c[8],
          takerBuyBaseVolume: parseFloat(c[9]) || parseFloat(c[5]) * 0.5, // fallback
          takerBuyQuoteVolume: parseFloat(c[10]) || parseFloat(c[7]) * 0.5,
        }));
      }
    }
  } catch (e) {
    console.log('Futures klines failed, trying spot:', e);
  }
  
  // Fallback para API Spot
  const url = `${BINANCE_BASE}/api/v3/klines?symbol=${formattedSymbol}&interval=${interval}&limit=${limit}`;
  
  const response = await fetch(url);
  const data = await response.json();
  
  if (!Array.isArray(data)) throw new Error('Invalid candle data');
  
  return data.map((c: any[]) => ({
    openTime: c[0],
    open: parseFloat(c[1]),
    high: parseFloat(c[2]),
    low: parseFloat(c[3]),
    close: parseFloat(c[4]),
    volume: parseFloat(c[5]),
    closeTime: c[6],
    quoteVolume: parseFloat(c[7]),
    trades: c[8],
    takerBuyBaseVolume: parseFloat(c[9]) || parseFloat(c[5]) * 0.5, // fallback se for NaN
    takerBuyQuoteVolume: parseFloat(c[10]) || parseFloat(c[7]) * 0.5,
  }));
}

async function fetchOpenInterest(symbol: string): Promise<{ openInterest: number; time: number }> {
  try {
    const formattedSymbol = symbol.includes('USDT') ? symbol : `${symbol}USDT`;
    const url = `${BINANCE_FUTURES_BASE}/fapi/v1/openInterest?symbol=${formattedSymbol}`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    return {
      openInterest: parseFloat(data.openInterest || '0'),
      time: data.time || Date.now(),
    };
  } catch (e) {
    console.log('OI fetch error:', e);
    return { openInterest: 0, time: Date.now() };
  }
}

async function fetchFearGreedIndex(): Promise<{ value: number; classification: string }> {
  try {
    // Primeiro, verificar cache válido (24h)
    const cached = await SecureStore.getItemAsync('fear_greed');
    if (cached) {
      const data = JSON.parse(cached);
      if (Date.now() - data.timestamp < 24 * 60 * 60 * 1000) { // Cache 24h
        console.log('Fear & Greed from cache:', data.value);
        return { value: data.value, classification: data.classification };
      }
    }
    
    // Buscar da API
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    
    const response = await fetch('https://api.alternative.me/fng/?limit=1', {
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data?.data?.[0]?.value) {
      throw new Error('Invalid Fear & Greed response');
    }
    
    const fgValue = parseInt(data.data[0].value);
    const fgClassification = data.data[0].value_classification || getClassification(fgValue);
    
    const result = {
      value: fgValue,
      classification: fgClassification,
      timestamp: Date.now(),
    };
    
    await SecureStore.setItemAsync('fear_greed', JSON.stringify(result));
    console.log('Fear & Greed fetched:', fgValue);
    return { value: fgValue, classification: fgClassification };
  } catch (e) {
    console.log('Fear & Greed fetch error:', e);
    // Tentar retornar cache mesmo expirado
    try {
      const cached = await SecureStore.getItemAsync('fear_greed');
      if (cached) {
        const data = JSON.parse(cached);
        console.log('Using expired Fear & Greed cache:', data.value);
        return { value: data.value, classification: data.classification };
      }
    } catch {}
    // Fallback real com valor neutro
    return { value: 50, classification: 'Neutral' };
  }
}

// Helper para classificação do Fear & Greed
function getClassification(value: number): string {
  if (value <= 25) return 'Extreme Fear';
  if (value <= 45) return 'Fear';
  if (value <= 55) return 'Neutral';
  if (value <= 75) return 'Greed';
  return 'Extreme Greed';
}

async function fetchBTCDominance(): Promise<{ dominance: number; change24h: number }> {
  try {
    const response = await fetch('https://api.coingecko.com/api/v3/global');
    const data = await response.json();
    
    return {
      dominance: data.data.market_cap_percentage.btc || 0,
      change24h: data.data.market_cap_change_percentage_24h_usd || 0,
    };
  } catch (e) {
    return { dominance: 50, change24h: 0 };
  }
}

// ==================== INDICADORES TÉCNICOS ====================
function calculateEMA(closes: number[], period: number): number {
  if (closes.length < period) return closes[closes.length - 1];
  
  const multiplier = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
  for (let i = period; i < closes.length; i++) {
    ema = (closes[i] - ema) * multiplier + ema;
  }
  
  return ema;
}

function calculateRSI(closes: number[], period: number = 14): number {
  if (closes.length < period + 1) return 50;
  
  let gains = 0;
  let losses = 0;
  
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }
  
  let avgGain = gains / period;
  let avgLoss = losses / period;
  
  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) {
      avgGain = (avgGain * (period - 1) + change) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) - change) / period;
    }
  }
  
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calculateADX(candles: CandleData[], period: number = 14): number {
  if (candles.length < period * 2) return 25;
  
  const tr: number[] = [];
  const plusDM: number[] = [];
  const minusDM: number[] = [];
  
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevHigh = candles[i - 1].high;
    const prevLow = candles[i - 1].low;
    const prevClose = candles[i - 1].close;
    
    tr.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
    
    const upMove = high - prevHigh;
    const downMove = prevLow - low;
    
    if (upMove > downMove && upMove > 0) {
      plusDM.push(upMove);
    } else {
      plusDM.push(0);
    }
    
    if (downMove > upMove && downMove > 0) {
      minusDM.push(downMove);
    } else {
      minusDM.push(0);
    }
  }
  
  // Smooth com EMA
  const smoothTR = calculateEMA(tr, period);
  const smoothPlusDM = calculateEMA(plusDM, period);
  const smoothMinusDM = calculateEMA(minusDM, period);
  
  const plusDI = (smoothPlusDM / smoothTR) * 100;
  const minusDI = (smoothMinusDM / smoothTR) * 100;
  
  const dx = (Math.abs(plusDI - minusDI) / (plusDI + minusDI)) * 100;
  
  return dx;
}

function calculateVWAP(candles: CandleData[]): number {
  let cumulativeTPV = 0;
  let cumulativeVolume = 0;
  
  for (const candle of candles) {
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    cumulativeTPV += typicalPrice * candle.volume;
    cumulativeVolume += candle.volume;
  }
  
  return cumulativeVolume > 0 ? cumulativeTPV / cumulativeVolume : candles[candles.length - 1].close;
}

// ==================== INDICADORES AVANÇADOS ====================
function calculateMACD(closes: number[]): { value: number; signal: number; histogram: number } {
  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);
  const macdLine = ema12 - ema26;
  
  // Calcular signal line (EMA 9 do MACD)
  const macdValues: number[] = [];
  for (let i = 26; i <= closes.length; i++) {
    const ema12Temp = calculateEMA(closes.slice(0, i), 12);
    const ema26Temp = calculateEMA(closes.slice(0, i), 26);
    macdValues.push(ema12Temp - ema26Temp);
  }
  
  const signalLine = macdValues.length >= 9 ? calculateEMA(macdValues, 9) : macdLine;
  const histogram = macdLine - signalLine;
  
  return { value: macdLine, signal: signalLine, histogram };
}

function calculateStochastic(candles: CandleData[], period: number = 14): { k: number; d: number } {
  if (candles.length < period) return { k: 50, d: 50 };
  
  const recentCandles = candles.slice(-period);
  const highs = recentCandles.map(c => c.high);
  const lows = recentCandles.map(c => c.low);
  const close = recentCandles[recentCandles.length - 1].close;
  
  const highestHigh = Math.max(...highs);
  const lowestLow = Math.min(...lows);
  
  const k = highestHigh !== lowestLow 
    ? ((close - lowestLow) / (highestHigh - lowestLow)) * 100 
    : 50;
  
  // D = média móvel de K (3 períodos)
  const kValues: number[] = [];
  for (let i = period; i <= candles.length; i++) {
    const slice = candles.slice(i - period, i);
    const h = Math.max(...slice.map(c => c.high));
    const l = Math.min(...slice.map(c => c.low));
    const c = slice[slice.length - 1].close;
    kValues.push(h !== l ? ((c - l) / (h - l)) * 100 : 50);
  }
  
  const d = kValues.length >= 3 
    ? kValues.slice(-3).reduce((a, b) => a + b, 0) / 3 
    : k;
  
  return { k, d };
}

function calculateMomentum(closes: number[], period: number = 10): number {
  if (closes.length < period) return 0;
  return ((closes[closes.length - 1] - closes[closes.length - period]) / closes[closes.length - period]) * 100;
}

// ==================== BACKEND API (para IA) ====================
const BACKEND_URL = 'http://192.168.1.3:8000/api';

async function fetchAIRecommendation(symbol: string): Promise<string | null> {
  try {
    const formattedSymbol = symbol.includes('USDT') ? symbol : `${symbol}USDT`;
    const response = await fetch(`${BACKEND_URL}/technical-analysis/${formattedSymbol}`);
    
    if (response.ok) {
      const data = await response.json();
      return data.ai_text_recommendation || null;
    }
  } catch (e) {
    console.log('Backend AI fetch error:', e);
  }
  return null;
}

function detectRSIDivergence(prices: number[], rsiValues: number[]): 'bullish' | 'bearish' | 'none' {
  if (prices.length < 10 || rsiValues.length < 10) return 'none';
  
  const recentPrices = prices.slice(-10);
  const recentRSI = rsiValues.slice(-10);
  
  // Preço faz novo high, RSI não = divergência bearish
  const priceHigh = Math.max(...recentPrices);
  const priceHighIndex = recentPrices.lastIndexOf(priceHigh);
  
  if (priceHighIndex > 5) {
    const prevHighIndex = recentPrices.slice(0, priceHighIndex).lastIndexOf(
      Math.max(...recentPrices.slice(0, priceHighIndex))
    );
    if (prevHighIndex >= 0 && recentRSI[priceHighIndex] < recentRSI[prevHighIndex]) {
      return 'bearish';
    }
  }
  
  // Preço faz novo low, RSI não = divergência bullish
  const priceLow = Math.min(...recentPrices);
  const priceLowIndex = recentPrices.lastIndexOf(priceLow);
  
  if (priceLowIndex > 5) {
    const prevLowIndex = recentPrices.slice(0, priceLowIndex).lastIndexOf(
      Math.min(...recentPrices.slice(0, priceLowIndex))
    );
    if (prevLowIndex >= 0 && recentRSI[priceLowIndex] > recentRSI[prevLowIndex]) {
      return 'bullish';
    }
  }
  
  return 'none';
}

// ==================== ANÁLISE DE CONFLUÊNCIA ====================
function calculateFlowScore(flow: FlowAnalysis): number {
  let score = 50; // Base neutra
  
  // CVD Proxy Analysis (±30 pontos)
  if (flow.cvdTrend === 'bullish') {
    score += flow.volumeRatio > 1.2 ? 30 : flow.volumeRatio > 1.1 ? 20 : 10;
  } else if (flow.cvdTrend === 'bearish') {
    score -= flow.volumeRatio < 0.8 ? 30 : flow.volumeRatio < 0.9 ? 20 : 10;
  }
  
  // Open Interest Analysis (±20 pontos)
  if (flow.oiTrend === 'increasing') {
    score += flow.oiChange24h > 5 ? 20 : flow.oiChange24h > 2 ? 15 : 10;
  } else if (flow.oiTrend === 'decreasing') {
    // OI caindo pode ser bom (fechamento de shorts) ou ruim (fechamento de longs)
    // Interpretamos baseado no CVD
    if (flow.cvdTrend === 'bullish') {
      score += 10; // Shorts fechando = bullish
    } else {
      score -= 10; // Longs fechando = bearish
    }
  }
  
  return Math.max(0, Math.min(100, score));
}

function calculateStructureScore(structure: StructureAnalysis): number {
  let score = 50;
  
  // EMA 200 Analysis (±25 pontos)
  if (structure.priceVsEma200_1h === 'above' && structure.priceVsEma200_4h === 'above') {
    score += 25;
  } else if (structure.priceVsEma200_1h === 'below' && structure.priceVsEma200_4h === 'below') {
    score -= 25;
  } else {
    // Conflito entre timeframes = menos pontos
    if (structure.priceVsEma200_4h === 'above') score += 10;
    else score -= 10;
  }
  
  // VWAP Analysis (±15 pontos)
  if (structure.priceVsVwap === 'above') score += 15;
  else score -= 15;
  
  // Trend Analysis (±10 pontos)
  if (structure.trend === 'uptrend') score += 10;
  else if (structure.trend === 'downtrend') score -= 10;
  
  return Math.max(0, Math.min(100, score));
}

function calculateSafetyScore(safety: SafetyFilters, isAltcoin: boolean): number {
  let score = 50;
  
  // RSI Divergence (±15 pontos) - mais importante que níveis
  if (safety.rsiDivergence === 'bullish') score += 15;
  else if (safety.rsiDivergence === 'bearish') score -= 15;
  
  // ADX - Força da tendência (±10 pontos)
  if (safety.adx14 > 25) {
    score += safety.trendStrength === 'strong' ? 10 : 5;
  } else {
    score -= 5; // Mercado sem tendência definida
  }
  
  // Fear & Greed (±10 pontos)
  if (safety.fearGreedIndex < 25) {
    score += 10; // Extreme fear = oportunidade de compra
  } else if (safety.fearGreedIndex > 75) {
    score -= 10; // Extreme greed = cautela
  }
  
  // BTC Dominance para Altcoins (±15 pontos)
  if (isAltcoin) {
    if (safety.btcDominanceChange > 2) {
      score -= 15; // BTC.D subindo forte = ruim para alts
    } else if (safety.btcDominanceChange < -2) {
      score += 15; // BTC.D caindo = bom para alts
    }
  }
  
  return Math.max(0, Math.min(100, score));
}

// Calcula o score de notícias (0-100, 50 = neutro)
function calculateNewsScore(newsImpact: SafetyFilters['newsImpact']): number {
  if (!newsImpact || newsImpact.score === 0) {
    return 50; // Neutro, sem impacto
  }
  
  // Converte score de -10 a +10 para 0 a 100
  // -10 = 0 (muito bearish)
  // 0 = 50 (neutro)
  // +10 = 100 (muito bullish)
  return Math.round(50 + (newsImpact.score * 5));
}

// Calcula o peso dinâmico das notícias (0 a 2)
function calculateNewsWeight(newsImpact: SafetyFilters['newsImpact']): number {
  if (!newsImpact) return 0;
  
  const absScore = Math.abs(newsImpact.score);
  
  // Score <= 2: peso 0 (notícias irrelevantes)
  // Score 3-5: peso 0.5 (impacto leve)
  // Score 6-8: peso 1 (impacto moderado)
  // Score 9-10: peso 2 (impacto extremo - guerras, tarifas, etc)
  if (absScore <= 2) return 0;
  if (absScore <= 5) return 0.5;
  if (absScore <= 8) return 1;
  return 2;
}

function calculateConfluence(
  flow: FlowAnalysis,
  structure: StructureAnalysis,
  safety: SafetyFilters,
  isAltcoin: boolean
): ConfluenceScore {
  const flowScore = calculateFlowScore(flow);
  const structureScore = calculateStructureScore(structure);
  const safetyScore = calculateSafetyScore(safety, isAltcoin);
  const newsScore = calculateNewsScore(safety.newsImpact);
  const newsWeight = calculateNewsWeight(safety.newsImpact);
  
  // Pesos base: Fluxo 3x, Estrutura 2x, Segurança 1x
  // Peso das notícias: 0 a 2x (dinâmico baseado na importância)
  const totalWeight = 3 + 2 + 1 + newsWeight;
  const weightedScore = (
    flowScore * 3 + 
    structureScore * 2 + 
    safetyScore * 1 + 
    newsScore * newsWeight
  ) / totalWeight;
  
  // Determinar viés
  let bias: 'LONG' | 'SHORT' | 'NEUTRAL';
  if (weightedScore >= 60) bias = 'LONG';
  else if (weightedScore <= 40) bias = 'SHORT';
  else bias = 'NEUTRAL';
  
  // Calcular probabilidade baseada na distância do neutro
  const distanceFromNeutral = Math.abs(weightedScore - 50);
  const probability = Math.min(95, 50 + distanceFromNeutral);
  
  return {
    total: Math.round(weightedScore),
    flowScore: Math.round(flowScore),
    structureScore: Math.round(structureScore),
    safetyScore: Math.round(safetyScore),
    newsScore: newsWeight > 0 ? Math.round(newsScore) : undefined,
    bias,
    probability: Math.round(probability),
  };
}

// ==================== AI RECOMMENDATION ====================
function generateAIRecommendation(
  confluence: ConfluenceScore,
  currentPrice: number,
  flow: FlowAnalysis,
  structure: StructureAnalysis,
  safety: SafetyFilters,
  candles: CandleData[]
): AIRecommendation {
  // Calcular níveis de suporte/resistência para stops
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const recentHigh = Math.max(...highs.slice(-20));
  const recentLow = Math.min(...lows.slice(-20));
  const atr = (recentHigh - recentLow) / 20; // ATR simplificado
  
  let action: AIRecommendation['action'];
  let reasoning: string;
  let entry = currentPrice;
  let stopLoss: number;
  let takeProfit: number[];
  let timeframe: string;
  
  // Lógica de recomendação baseada em confluência
  if (confluence.total >= 75) {
    // Forte confluência bullish
    action = flow.cvdProxy > 0 && safety.adx14 > 25 ? 'LONG_RAPIDO' : 'LONG_SWING';
    stopLoss = currentPrice - (atr * 1.5);
    takeProfit = [currentPrice * 1.02, currentPrice * 1.05, currentPrice * 1.10];
    timeframe = action === 'LONG_RAPIDO' ? '1-4 horas' : '1-7 dias';
    reasoning = `✅ CONFLUÊNCIA FORTE (${confluence.total}%)\n\n` +
      `📊 Fluxo: Volume comprador dominante (${confluence.flowScore}%)\n` +
      `📈 Estrutura: Preço acima de níveis chave (${confluence.structureScore}%)\n` +
      `🛡️ Segurança: Indicadores confirmam (${confluence.safetyScore}%)\n\n` +
      `💡 ${flow.oiTrend === 'increasing' ? 'OI crescente confirma força' : 'Atenção ao OI'}\n` +
      `💡 ${safety.trendStrength === 'strong' ? 'Tendência forte (ADX > 25)' : 'Tendência moderada'}`;
  } else if (confluence.total <= 25) {
    // Forte confluência bearish
    action = flow.cvdProxy < 0 && safety.adx14 > 25 ? 'SHORT_RAPIDO' : 'SHORT_SWING';
    stopLoss = currentPrice + (atr * 1.5);
    takeProfit = [currentPrice * 0.98, currentPrice * 0.95, currentPrice * 0.90];
    timeframe = action === 'SHORT_RAPIDO' ? '1-4 horas' : '1-7 dias';
    reasoning = `🔴 CONFLUÊNCIA BEARISH (${confluence.total}%)\n\n` +
      `📊 Fluxo: Volume vendedor dominante (${confluence.flowScore}%)\n` +
      `📉 Estrutura: Preço abaixo de níveis chave (${confluence.structureScore}%)\n` +
      `🛡️ Segurança: Indicadores negativos (${confluence.safetyScore}%)\n\n` +
      `💡 ${flow.oiTrend === 'decreasing' ? 'OI caindo = longs fechando' : 'Atenção ao OI'}\n` +
      `💡 ${safety.rsiDivergence === 'bearish' ? 'Divergência bearish no RSI!' : ''}`;
  } else if (confluence.total >= 55 && confluence.total < 75) {
    // Confluência moderada bullish
    action = 'LONG_SWING';
    stopLoss = currentPrice - (atr * 2);
    takeProfit = [currentPrice * 1.03, currentPrice * 1.06];
    timeframe = '2-5 dias';
    reasoning = `🟡 CONFLUÊNCIA MODERADA BULLISH (${confluence.total}%)\n\n` +
      `📊 Fluxo: ${confluence.flowScore > 50 ? 'Levemente positivo' : 'Neutro'}\n` +
      `📈 Estrutura: ${confluence.structureScore > 50 ? 'Favorável' : 'Neutra'}\n` +
      `🛡️ Segurança: ${confluence.safetyScore}%\n\n` +
      `⚠️ Posição menor recomendada\n` +
      `💡 Aguarde confirmação com volume`;
  } else if (confluence.total > 25 && confluence.total <= 45) {
    // Confluência moderada bearish
    action = 'SHORT_SWING';
    stopLoss = currentPrice + (atr * 2);
    takeProfit = [currentPrice * 0.97, currentPrice * 0.94];
    timeframe = '2-5 dias';
    reasoning = `🟡 CONFLUÊNCIA MODERADA BEARISH (${confluence.total}%)\n\n` +
      `📊 Fluxo: ${confluence.flowScore < 50 ? 'Levemente negativo' : 'Neutro'}\n` +
      `📉 Estrutura: ${confluence.structureScore < 50 ? 'Desfavorável' : 'Neutra'}\n` +
      `🛡️ Segurança: ${confluence.safetyScore}%\n\n` +
      `⚠️ Posição menor recomendada\n` +
      `💡 Stop curto obrigatório`;
  } else {
    // Zona neutra
    action = 'NAO_OPERAR';
    stopLoss = 0;
    takeProfit = [];
    timeframe = '-';
    reasoning = `⚪ ZONA NEUTRA (${confluence.total}%)\n\n` +
      `📊 Fluxo: Indefinido (${confluence.flowScore}%)\n` +
      `📊 Estrutura: Sem direção clara (${confluence.structureScore}%)\n` +
      `🛡️ Segurança: ${confluence.safetyScore}%\n\n` +
      `🚫 NÃO OPERAR - Aguarde confluência\n` +
      `💡 Mercado em consolidação\n` +
      `💡 Risco de falsas entradas alto`;
  }
  
  // Calcular Risk/Reward
  const riskRewardRatio = takeProfit.length > 0 
    ? Math.abs(takeProfit[0] - entry) / Math.abs(entry - stopLoss)
    : 0;
  
  return {
    action,
    confidence: confluence.probability,
    reasoning,
    entry,
    stopLoss: Math.round(stopLoss * 100) / 100,
    takeProfit: takeProfit.map(tp => Math.round(tp * 100) / 100),
    riskRewardRatio: Math.round(riskRewardRatio * 100) / 100,
    timeframe,
  };
}

// ==================== NÍVEIS CHAVE ====================
function calculateKeyLevels(candles: CandleData[]): {
  strongResistances: number[];
  strongSupports: number[];
  liquidationZones: { price: number; type: 'long' | 'short'; magnitude: number }[];
} {
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const volumes = candles.map(c => c.volume);
  
  // Encontrar níveis de alto volume (potenciais suportes/resistências)
  const volumeThreshold = volumes.reduce((a, b) => a + b, 0) / volumes.length * 1.5;
  
  const resistances: number[] = [];
  const supports: number[] = [];
  
  for (let i = 2; i < candles.length - 2; i++) {
    // Pivot high
    if (highs[i] > highs[i-1] && highs[i] > highs[i-2] && 
        highs[i] > highs[i+1] && highs[i] > highs[i+2]) {
      resistances.push(highs[i]);
    }
    // Pivot low
    if (lows[i] < lows[i-1] && lows[i] < lows[i-2] && 
        lows[i] < lows[i+1] && lows[i] < lows[i+2]) {
      supports.push(lows[i]);
    }
  }
  
  // Ordenar e pegar top 3
  const strongResistances = resistances.sort((a, b) => b - a).slice(0, 3);
  const strongSupports = supports.sort((a, b) => a - b).slice(0, 3);
  
  // Zonas de liquidação estimadas (usando ATR e níveis psicológicos)
  const currentPrice = candles[candles.length - 1].close;
  const atr = (Math.max(...highs.slice(-14)) - Math.min(...lows.slice(-14))) / 14;
  
  const liquidationZones = [
    { price: currentPrice - atr * 2, type: 'long' as const, magnitude: 70 },
    { price: currentPrice - atr * 3, type: 'long' as const, magnitude: 90 },
    { price: currentPrice + atr * 2, type: 'short' as const, magnitude: 70 },
    { price: currentPrice + atr * 3, type: 'short' as const, magnitude: 90 },
  ];
  
  return { strongResistances, strongSupports, liquidationZones };
}

// ==================== FUNÇÃO PRINCIPAL ====================
export async function performTechnicalAnalysis(
  symbol: string,
  forceRefresh: boolean = false
): Promise<TechnicalAnalysisResult> {
  // Verificar cache
  if (!forceRefresh) {
    const cached = await getCachedAnalysis(symbol);
    if (cached) {
      console.log('Using cached analysis for', symbol);
      return cached;
    }
  }
  
  console.log('Fetching fresh analysis for', symbol);
  
  const isAltcoin = !symbol.toUpperCase().includes('BTC');
  
  // Buscar dados em paralelo
  const [
    candles15m,
    candles1h,
    candles4h,
    oiData,
    fearGreed,
    btcDom,
  ] = await Promise.all([
    fetchCandles(symbol, '15m', 50),
    fetchCandles(symbol, '1h', 200),
    fetchCandles(symbol, '4h', 50),
    fetchOpenInterest(symbol),
    fetchFearGreedIndex(),
    fetchBTCDominance(),
  ]);
  
  const currentPrice = candles15m[candles15m.length - 1].close;
  const closes1h = candles1h.map(c => c.close);
  const closes4h = candles4h.map(c => c.close);
  
  // ===== ANÁLISE DE FLUXO =====
  const buyVolume = candles15m.reduce((sum, c) => {
    const vol = c.takerBuyBaseVolume || 0;
    return sum + (isNaN(vol) ? 0 : vol);
  }, 0);
  const totalVolume = candles15m.reduce((sum, c) => {
    const vol = c.volume || 0;
    return sum + (isNaN(vol) ? 0 : vol);
  }, 0);
  const sellVolume = Math.max(0, totalVolume - buyVolume);
  const cvdProxy = buyVolume - sellVolume;
  const volumeRatio = sellVolume > 0 ? buyVolume / sellVolume : 1;
  
  console.log('Volume analysis:', { buyVolume, sellVolume, totalVolume, ratio: volumeRatio });
  
  // Estimativa de mudança de OI (comparando com volume)
  const oiChange24h = ((oiData.openInterest - totalVolume * 0.1) / oiData.openInterest) * 100;
  
  const flow: FlowAnalysis = {
    cvdProxy,
    cvdTrend: cvdProxy > 0 ? 'bullish' : cvdProxy < 0 ? 'bearish' : 'neutral',
    buyVolume,
    sellVolume,
    volumeRatio,
    openInterest: oiData.openInterest,
    oiChange24h,
    oiTrend: oiChange24h > 2 ? 'increasing' : oiChange24h < -2 ? 'decreasing' : 'stable',
  };
  
  // ===== ANÁLISE DE ESTRUTURA =====
  const ema200_1h = calculateEMA(closes1h, 200);
  const ema200_4h = calculateEMA(closes4h, 50); // 50 candles de 4h = ~200h
  const vwap = calculateVWAP(candles15m);
  
  const structure: StructureAnalysis = {
    ema200_1h,
    ema200_4h,
    priceVsEma200_1h: currentPrice > ema200_1h ? 'above' : 'below',
    priceVsEma200_4h: currentPrice > ema200_4h ? 'above' : 'below',
    vwap,
    priceVsVwap: currentPrice > vwap ? 'above' : 'below',
    trend: currentPrice > ema200_1h && currentPrice > vwap ? 'uptrend' : 
           currentPrice < ema200_1h && currentPrice < vwap ? 'downtrend' : 'sideways',
  };
  
  // ===== FILTROS DE SEGURANÇA =====
  const rsi14 = calculateRSI(closes1h, 14);
  const adx14 = calculateADX(candles1h, 14);
  
  // Calcular RSI para cada candle para detectar divergência
  const rsiValues: number[] = [];
  for (let i = 15; i <= closes1h.length; i++) {
    rsiValues.push(calculateRSI(closes1h.slice(0, i), 14));
  }
  const rsiDivergence = detectRSIDivergence(closes1h.slice(-10), rsiValues.slice(-10));
  
  // ===== BUSCAR NOTÍCIAS DO X =====
  let newsImpact: SafetyFilters['newsImpact'] = undefined;
  try {
    const xNews = await fetchXNews();
    const impact = calculateNewsImpact(xNews);
    if (impact.score !== 0) {
      newsImpact = impact;
      console.log('News impact:', impact.label, impact.score);
    }
  } catch (e) {
    console.log('X News fetch error:', e);
  }
  
  const safety: SafetyFilters = {
    rsi14,
    rsiDivergence,
    adx14,
    trendStrength: adx14 > 40 ? 'strong' : adx14 > 25 ? 'moderate' : 'weak',
    btcDominance: btcDom.dominance,
    btcDominanceChange: btcDom.change24h,
    fearGreedIndex: fearGreed.value,
    fearGreedLabel: fearGreed.classification,
    newsImpact,
  };
  
  // ===== INDICADORES DE MOMENTUM =====
  const macd = calculateMACD(closes1h);
  const stochastic = calculateStochastic(candles1h);
  const momentum = calculateMomentum(closes1h);
  
  // ===== CONFLUÊNCIA =====
  const confluence = calculateConfluence(flow, structure, safety, isAltcoin);
  
  // ===== RECOMENDAÇÃO IA =====
  const aiRecommendation = generateAIRecommendation(
    confluence, currentPrice, flow, structure, safety, candles1h
  );
  
  // ===== NÍVEIS CHAVE =====
  const keyLevels = calculateKeyLevels(candles1h);
  
  // ===== BUSCAR RECOMENDAÇÃO IA DO BACKEND =====
  let aiTextRecommendation: string | undefined;
  try {
    const aiText = await fetchAIRecommendation(symbol);
    if (aiText) {
      aiTextRecommendation = aiText;
    }
  } catch (e) {
    console.log('AI recommendation fetch failed, using local:', e);
  }
  
  // ===== RESUMO =====
  const biasEmoji = confluence.bias === 'LONG' ? '🟢' : confluence.bias === 'SHORT' ? '🔴' : '⚪';
  const summary = `${biasEmoji} ${confluence.bias} | Score: ${confluence.total}/100 | Prob: ${confluence.probability}%`;
  
  const result: TechnicalAnalysisResult = {
    symbol,
    timestamp: Date.now(),
    currentPrice,
    flow,
    structure,
    safety,
    confluence,
    aiRecommendation,
    keyLevels,
    summary,
    cacheExpiry: Date.now() + CACHE_DURATION,
    aiTextRecommendation,
    momentum: {
      macd,
      stochastic,
      momentum,
    },
  };
  
  // Salvar no cache
  await setCachedAnalysis(symbol, result);
  
  return result;
}

// ==================== EXPORTAR UTILITÁRIOS ====================
export { CACHE_DURATION };
