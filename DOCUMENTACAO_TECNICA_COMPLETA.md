# 📊 Visor Crypto — Documentação Técnica Completa

> **Versão do Sistema**: V4 Reactive Engine 7.1.0  
> **Tipo de App**: Capacitor/Cordova Hybrid Mobile (Single-Page HTML + JS)  
> **Arquivos Principais**: `www/index.html` (~17.494 linhas), `www/ta-engine-v4.js` (~4.008 linhas)  
> **Scripts Externos**: `realtime-cvd.js`, `ta-engine-v2.js`, `ta-engine-v3.js`, `ta-engine-v4.js`, `macro-section.js`  
> **Backend**: `https://visor-crypto-api.onrender.com/api`  
> **Última Atualização**: Fevereiro 2026

---

## Índice

1. [Arquitetura de Engines (4 Camadas)](#1-arquitetura-de-engines-4-camadas)
2. [Fontes de Dados (APIs & Endpoints)](#2-fontes-de-dados-apis--endpoints)
3. [Indicadores Calculados](#3-indicadores-calculados)
4. [Painel de Médias Móveis vs Análise Técnica Avançada](#4-painel-de-médias-móveis-vs-análise-técnica-avançada)
5. [Sistema de Confluence Scoring (V1 + V2)](#5-sistema-de-confluence-scoring-v1--v2)
6. [Motor Reativo V4](#6-motor-reativo-v4)
7. [Sistema de 9 Gates](#7-sistema-de-9-gates)
8. [CVD em Tempo Real (WebSocket)](#8-cvd-em-tempo-real-websocket)
9. [Análise Multi-Timeframe (MTF) com Pesos Adaptativos](#9-análise-multi-timeframe-mtf-com-pesos-adaptativos)
10. [Sistema de Scoring & Determinação de Sinal](#10-sistema-de-scoring--determinação-de-sinal)
11. [Seções de UI Renderizadas na Análise Técnica](#11-seções-de-ui-renderizadas-na-análise-técnica)
12. [Seções Ocultas (Processamento em Background)](#12-seções-ocultas-processamento-em-background)
13. [Dados Externos (Macro, Notícias, FED)](#13-dados-externos-macro-notícias-fed)
14. [Sistema de Histórico de Calls (Banco de Dados)](#14-sistema-de-histórico-de-calls-banco-de-dados)
15. [Sistema de Notificações & Auto-Scan](#15-sistema-de-notificações--auto-scan)
16. [Integração AdMob](#16-integração-admob)
17. [Apêndices](#17-apêndices)

---

## 1. Arquitetura de Engines (4 Camadas)

O sistema utiliza uma arquitetura em 4 camadas (engines), onde cada camada adiciona inteligência sobre a anterior:

| Camada | Arquivo | Linhas | Papel |
|--------|---------|:------:|-------|
| **V1** | `www/index.html` | ~17.494 | Busca de dados, cálculo de indicadores, confluence scoring, UI, call history |
| **V2** | `www/ta-engine-v2.js` | ~1.330 | Regime de mercado, estrutura (BOS/CHoCH), CVD avançado, scoring contextual |
| **V3** | `www/ta-engine-v3.js` | ~1.709 | Detector de crash/black-swan, decorrelação, pesos adaptativos, position sizing |
| **V4** | `www/ta-engine-v4.js` | ~4.008 | Z-scores dinâmicos, sessões/kill zones, 9 gates reativos, risk engine, OI, anti-spoofing, MTF |
| **CVD** | `www/realtime-cvd.js` | ~417 | CVD em tempo real via WebSocket aggTrade da Binance |

### Fluxo de Dados

```
Binance API → V1 (indicadores + confluence) → V2 (regime + estrutura + contexto)
    → V3 (quant scoring + crash detection) → V4 (gates reativos → decisão final)
```

### Ordem de Carregamento dos Scripts

```
1. realtime-cvd.js        → WebSocket CVD engine
2. ta-engine-v2.js        → V2: Regime, Structure, CVD, Macro/News
3. ta-engine-v3.js        → V3: Crash, Decorrelation, Adaptive Weights
4. ta-engine-v4.js        → V4: Reactive Intelligence (28+ módulos)
5. macro-section.js       → Macro section UI module
```

---

## 2. Fontes de Dados (APIs & Endpoints)

### 2.1 Binance Spot API (`api.binance.com/api/v3/`)

| Endpoint | Parâmetros | Dados Obtidos |
|----------|-----------|---------------|
| `/klines` | `symbol, interval=15m, limit=100` | Candles 15min (RSI curto, chart patterns) |
| `/klines` | `symbol, interval=1h, limit=500` | Candles 1h (SMA200, EMA200, VWAP, MACD, ADX, Stoch, Volume Profile) |
| `/klines` | `symbol, interval=4h, limit=250` | Candles 4h (EMA200, MACD, ADX, structure) |
| `/klines` | `symbol, interval=1d, limit=250` | Candles diários (EMA9/20/50, SMA50/99/200 — painel de MAs) |
| `/ticker/24hr` | `symbol` | Volume, variação 24h |
| `/depth` | `symbol, limit=100` | Order book (bid/ask imbalance) |
| `/trades` | `symbol, limit=500` | Trades recentes (CVD por kline) |
| `/ticker/price` | `symbol` | Preço atual |

### 2.2 Binance Futures API (`fapi.binance.com/fapi/v1/`)

| Endpoint | Parâmetros | Dados Obtidos |
|----------|-----------|---------------|
| `/fundingRate` | `symbol, limit=1` | Taxa de funding atual |
| `/openInterest` | `symbol` | Open Interest |
| `/allForceOrders` | `symbol, limit=100` | Liquidações forçadas |
| `/futures/data/takerlongshortRatio` | `symbol, period=1h, limit=24` | Ratio Long/Short |
| `/futures/data/openInterestHist` | `symbol, period=5m, limit=12` | Histórico de OI (última hora, para OI Delta) |

### 2.3 Binance WebSocket (Tempo Real)

| Stream | URL | Dados |
|--------|-----|-------|
| `aggTrade` | `wss://stream.binance.com:9443/ws/{symbol}@aggTrade` | Trades em tempo real para CVD real |

### 2.4 CoinGecko API (`api.coingecko.com/api/v3/`)

| Endpoint | Dados |
|----------|-------|
| `/coins/bitcoin` | Market cap, supply, histórico BTC |
| `/coins/ethereum` | Market cap, supply, histórico ETH |
| `/global` | Dominância BTC, market cap total |

### 2.5 Yahoo Finance (`query2.finance.yahoo.com`)

| Símbolo | Ativo | Uso |
|---------|-------|-----|
| `^GSPC` | S&P 500 | Correlação risk-on/off |
| `DX-Y.NYB` | DXY | USD forte = crypto fraco |
| `^VIX` | VIX | Medo de mercado |
| `GC=F` | Ouro | Flight to safety |
| `CL=F` | Petróleo | Pressão inflacionária |
| `^TNX` | Treasury 10Y | Política monetária |
| `^FVX` | Treasury 5Y | Curva de juros |
| `AAPL, MSFT, GOOGL, AMZN, META, NVDA, TSLA` | Big Tech | Sentimento tech/growth |

### 2.6 Mempool.space API (`mempool.space/api/`)

| Endpoint | Dados |
|----------|-------|
| `/v1/blocks` | Blocos recentes (~2.5h) |
| `/block/{id}/txs` | Transações do bloco (whale filtering) |

**Filtragem de Baleias**: Transações acima do threshold em USD → `to_exchange` (venda) ou `from_exchange` (acumulação).

### 2.7 CryptoPanic API

Notícias crypto trending filtradas por BTC/ETH com score de sentimento.

### 2.8 Backend Próprio (`visor-crypto-api.onrender.com/api`)

| Endpoint | Método | Uso |
|----------|--------|-----|
| `/analysis/thresholds/{symbol}` | GET | Z-Score dinâmicos por ativo |
| `/analysis/macro-regime` | GET | Classificação macro (HAWKISH/DOVISH/NEUTRAL) |
| `/analysis/systemic-risk` | GET | Risk assessment sistêmico |
| `/analysis/setup-stats/combined` | GET | Win rate por fingerprint |
| `/analysis/setup-outcome` | POST | Registro de resultado |
| `/collective/submit-trades` | POST | Aprendizado coletivo |
| `/collective/global-stats` | GET | Consenso global |
| `/collective/model-weights` | GET | Pesos do modelo |
| `/notifications/register-token` | POST | Token FCM |
| `/notifications/prefs` | PUT | Preferências de notificação |

---

## 3. Indicadores Calculados

### 3.1 Indicadores Core (V1 — index.html)

| Indicador | Função | Período | Retorno |
|-----------|--------|---------|---------|
| **RSI** | `calculateRSI()` | 14 | 0-100 |
| **ATR** | `calculateATR()` | 14 | Valor absoluto |
| **EMA** | `calculateEMA()` | variável | Preço (SMA-seeded) |
| **SMA** | `calculateSMA()` | variável | Preço |
| **MACD** | `calculateMACD()` | 12/26/9 | {macdLine, signalLine, histogram} |
| **ADX** | `calculateADX()` | 14 | {adx, plusDI, minusDI} |
| **Stochastic** | `calculateStochastic()` | K=14, D=3 | {k, d} |
| **Bollinger Bands** | `calculateBollingerBands()` | 20, dev=2 | {upper, middle, lower, width} |
| **Net Volume** | `calculateNetVolume()` | — | Buy/Sell delta |
| **Book Imbalance** | `calculateBookImbalance()` | Top 20 | Bid/Ask ratio |
| **Support/Resistance** | `calculateSupportResistance()` | Swing H/L + MAs | Níveis S/R |

### 3.2 Indicadores de Volume/Preço

| Indicador | Função | Descrição |
|-----------|--------|-----------|
| **Volume Profile** | `calculateVolumeProfile()` | POC, VAH, VAL (Value Area 70%) |
| **VWAP** | `calculateVWAP()` | Volume-Weighted Average Price |
| **CVD** | `calculateCVD()` | Cumulative Volume Delta (kline-based) |
| **CVD Real** | `RealtimeCVD.getFullCVDAnalysis()` | CVD via WebSocket aggTrade (preferencial) |
| **OI Change** | `calculateOIChange()` | Variação de Open Interest % |
| **Liquidation Heatmap** | `calculateLiquidationHeatmap()` | Clusters de liquidação |

### 3.3 Mapa de Timeframes por Indicador

| Indicador | 15min | 1h | 4h | 1d |
|-----------|:-----:|:--:|:--:|:--:|
| RSI (14) | ✅ | ✅ | ✅ | — |
| EMA 200 | — | ✅ | ✅ | — |
| EMA 9/20/50 | — | — | — | ✅ |
| SMA 50/99/200 | — | — | — | ✅ |
| MACD (12/26/9) | — | ✅ | ✅ | — |
| ADX (14) | — | ✅ | ✅ | — |
| Stochastic (14/3) | — | ✅ | ✅ | — |
| Net Volume | — | ✅ | ✅ | — |
| Volume Profile | — | ✅ | — | — |
| VWAP | — | ✅ | — | — |
| CVD | — | ✅ | — | — |
| Bollinger Bands | — | ✅ | — | — |
| ATR | — | ✅ | — | — |

---

## 4. Painel de Médias Móveis vs Análise Técnica Avançada

> **⚠️ NOTA IMPORTANTE**: As Médias Móveis mostradas no **painel "Médias Móveis"** da tela principal são **diferentes** das usadas na **Análise Técnica Avançada**. Isso é **intencional** — cada uma serve a um propósito diferente.

### 4.1 Painel "Médias Móveis" (Tela Principal)

Localizado na aba "Análise Técnica" da tela principal, ao lado do Order Book.

| MA | Tipo | Timeframe | Fonte de Dados |
|----|------|-----------|----------------|
| **EMA 9** | Exponencial | **Diário (1d)** | `klines 1d × 200` via Binance |
| **EMA 20** | Exponencial | **Diário (1d)** | `klines 1d × 200` |
| **EMA 50** | Exponencial | **Diário (1d)** | `klines 1d × 200` |
| **SMA 50** | Simples | **Diário (1d)** | `klines 1d × 200` |
| **SMA 99** | Simples | **Diário (1d)** | `klines 1d × 200` |
| **SMA 200** | Simples | **Diário (1d)** | `klines 1d × 200` |

**Função**: `fetchMovingAverages()` — busca klines diários e calcula 6 médias móveis.  
**Sinal**: Compara preço atual com cada MA. Se preço > MA +2% → "ACIMA" (bullish). Se < -2% → "ABAIXO" (bearish). Senão → "NEUTRO".  
**Propósito**: Visão de **tendência de longo prazo** (todas as MAs são calculadas em candles diários).

### 4.2 Análise Técnica Avançada (Modal de AT)

Acessada via botão "Análise Técnica" em cada crypto.

| MA | Tipo | Timeframe | Uso no Scoring |
|----|------|-----------|----------------|
| **EMA 200** | Exponencial | **1h** | Confluence score (peso 1.5): `tanh(dist%/3)` |
| **EMA 200** | Exponencial | **4h** | Confluence score (peso 1.5): `tanh(dist%/3)` |
| **EMA 9** | Exponencial | **Diário** | AI Summary + painel MAs (não no scoring) |
| **EMA 20** | Exponencial | **Diário** | AI Summary + painel MAs |
| **EMA 50** | Exponencial | **Diário** | AI Summary + painel MAs |
| **SMA 50** | Simples | **Diário** | AI Summary + painel MAs |
| **SMA 99** | Simples | **Diário** | AI Summary + painel MAs |
| **SMA 200** | Simples | **Diário** | AI Summary + painel MAs |

**No scoring de confluência**, apenas **EMA 200 em 1h e 4h** participam diretamente com peso.  
**As MAs diárias** (EMA 9/20/50, SMA 50/99/200) são calculadas e mostradas no AI Summary e no painel de MAs dentro do modal de AT, mas **não contribuem diretamente para o score numérico**.

### 4.3 Por Que São Diferentes?

| Aspecto | Painel Principal | Análise Técnica |
|---------|-----------------|-----------------|
| **Timeframe** | Diário (1d) | 1h + 4h (score) + 1d (info) |
| **Propósito** | Tendência macro/longo prazo | Score de confluência para sinal LONG/SHORT |
| **MAs no Score** | Nenhuma (apenas visual) | EMA 200 1h + EMA 200 4h (peso ±1.5 cada) |
| **Fórmula de Sinal** | Simples: preço >/<  MA ±2% | Gradiente: `1.5 × tanh(distância%/3)` |

### 4.4 Seção "ANÁLISE" (Indicadores Macro)

Para indicadores macro (S&P 500, DXY, VIX, etc.), a análise técnica usa **SMA 5, 10 e 20** com dados do Yahoo Finance. Estas são médias muito mais curtas, adequadas para mercados tradicionais com horário de funcionamento limitado.

---

## 5. Sistema de Confluence Scoring (V1 + V2)

### 5.1 Pipeline de Scoring

```
fetchTechnicalAnalysisData(symbol)     — 12 chamadas paralelas à Binance
    → generateTechnicalAnalysis()      — calcula todos os indicadores
    → V2.applyContextualScoring()      — regime + estrutura + CVD avançado
    → V3 enhancement                   — crash detection, adaptive weights
    → V4.enhanceWithReactive()         — gates reativos → sinal final
```

### 5.2 Contribuidores de Score e Pesos

O scoring usa funções **gradiente** (sigmoid/tanh), não thresholds binários:

| Indicador | Peso Máx | Método de Scoring |
|-----------|:--------:|-------------------|
| **RSI 15m** | ±2.0 | Sigmoid: `sig((35-rsi)/5)` para long; `sig((rsi-65)/5)` para short |
| **RSI 1h** | ±2.0 | Mesmo gradiente |
| **RSI 4h** | ±2.0 | Mesmo gradiente |
| **EMA 200 (1h)** | ±1.5 | `1.5 × tanh(distância%/3)` — satura a ~3% de distância |
| **EMA 200 (4h)** | ±1.5 | Mesmo formula tanh |
| **VWAP** | ±1.5 | Preço > VWAP = +1.5; < VWAP = -1.5 |
| **MACD 1h** | ±1.5 | Histogram > 0 AND MACD > Signal = +1.5 |
| **MACD 4h** | ±1.5 | Idem |
| **ADX 1h** | ±1.0 | ADX > 25 AND +DI > -DI = +1 (LONG); inverso = -1 (SHORT) |
| **ADX 4h** | ±1.0 | Idem |
| **Stochastic 1h** | ±1.0 | K < 20 AND K > D = +1; K > 80 AND K < D = -1 |
| **Stochastic 4h** | ±1.0 | Idem |
| **Net Volume 1h** | ±1.5 | Delta > 0 AND ratio > 3% = +1.5 |
| **Net Volume 4h** | ±1.5 | Idem |
| **Liquidações** | ±1.0 | >55% long liquidadas = SHORT; >55% short = LONG |

**Score Teórico Máximo**: ±37

### 5.3 Order Flow Score (Adicional)

| Componente | Score Máx | Critério |
|-----------|:---------:|----------|
| Price Location (Vol Profile) | ±1.0 | Acima VAH = -1; abaixo VAL = +1 |
| Funding Rate | -1 a +1.5 | >0.05% = -1; <-0.05% = +1.5 (squeeze) |
| CVD | ±1.5 | Padrões de absorção |
| Book Imbalance | ±1.0 | Ratio > 1.5 = bull; < 0.67 = bear |
| RSI (1h) | ±1.0 | <30 = +1; >70 = -1 |
| Taker Ratio | ±1.0 | >1.3 = bull; <0.77 = bear |

### 5.4 Determinação de Sinal V1

```
totalScore = contextual.adjustedScore + orderFlowScore
probability = 50 + (totalScore / maxScore) × 45  [clamped 5-95]
confidence  = alignmentRatio × 100 + |totalScore| × 2  [+ regime bonus ±10]

Sinal:
  totalScore ≥ +4  → LONG
  totalScore ≤ -4  → SHORT
  caso contrário   → NEUTRO
```

### 5.5 Camadas Contextuais V2

Aplicadas via `V2.applyContextualScoring()`:

| Módulo | Descrição |
|--------|-----------|
| **Market Regime** | TRENDING_UP, TRENDING_DOWN, RANGING, ACCUMULATION, DISTRIBUTION |
| **Market Structure** | BOS (Break of Structure), CHoCH (Change of Character), liquidity sweeps |
| **CVD Advanced** | Divergência, absorção, detecção de breakout |
| **Volatility Metrics** | ATR 1h/4h, regime de volatilidade (NORMAL, HIGH, LOW) |
| **Dynamic Targets** | TP baseado em ATR: TP1 (POC), TP2 (VAH/VAL), TP3 (ATR×4) |

---

## 6. Motor Reativo V4

### 6.1 Visão Geral

O V4 (`ta-engine-v4.js`, versão 7.1.0) é o **motor de inteligência reativa** que processa os dados das engines anteriores e aplica 28+ módulos especializados para gerar sinais de grau institucional. A decisão final de CONFIRMED vs AGUARDAR depende do V4.

### 6.2 Pipeline de Execução — `enhanceWithReactive()`

| # | Módulo | Função | Descrição |
|---|--------|--------|-----------|
| 0 | Data Integrity | `checkDataIntegrity()` | FORCE_NEUTRO se dados ausentes |
| 1 | Z-Score Context | `computeZScoreContext()` | Z-Scores de corpo, volume, range, wicks (100 candles) |
| 2 | Session Context | `getSessionContext()` | Sessão de trading + multiplicador |
| 3 | Displacement | `detectDisplacement()` | Movimento impulsivo (bodyZ ≥ 1.3 + volumeZ ≥ 1.5) |
| 4 | Volume Expansion | `detectVolumeExpansion()` | Volume Z-Score ≥ 1.5 com sustentação |
| 5 | Range Position | `detectRangePosition()` | Posição no range + breakout via Volume Profile |
| 6 | Retest & Limit Order | `detectRetestAndGenerateOrder()` | Retest de níveis + geração de ordens |
| 7 | Funding Filter | `checkFundingFilter()` | Funding extremo bloqueia sinais |
| 8 | Microstructure | `detectMicrostructure()` | Absorção, FVG, Liquidity Void |
| 9a | Squeeze Detection | `detectSqueezeExpansion()` | Bollinger squeeze → SQUEEZE/EXPANSION/NORMAL |
| 9b | Vol Regime Shift | `detectVolatilityRegimeShift()` | EXPLOSIVE/COMPRESSED/NORMAL |
| 9c | Market Breadth | `calculateMarketBreadth()` | Sentimento cross-asset (>65% LONG = boost) |
| 10 | OI Analysis | `analyzeOpenInterest()` | Short/Long squeeze, OI buildup, fake breakout |
| 11 | Anti-Spoofing | `detectSpoofing()` | Detecção de walls/spoofing no order book |
| 12 | Enhanced Regime | `computeEnhancedRegime()` | 6 estados de regime avançado |
| 13 | Model Stability | `checkModelStability()` | Win rate rolling — bloqueia se muito baixo |
| 14 | **EVALUATE GATES** | `evaluateReactiveGates()` | 9 gates de validação (ver seção 7) |
| 15 | Risk Engine | `calculateRisk()` | Position sizing, kill switch, drawdown limits |
| 16 | Calibração | `calibrateConfidence()` | Sigmoid + blend 60/40 |
| 17 | BTC Alignment | `analyzeBtcAlignment()` | Correlação Pearson (12h/24h/72h) |
| 18 | MTF Analysis | `analyzeMultiTimeframe()` | Multi-timeframe com pesos adaptativos |
| 19 | Setup Fingerprint | `getSetupFingerprint()` | Tracking por tipo de setup |
| 20 | Summary | `generateReactiveSummary()` | Resumo human-readable |
| 21 | Bot Webhook | `generateBotWebhook()` | JSON para 3Commas/Cornix |
| 22 | Collective Learning | `queueTradeForBackend()` | Submit para backend |
| 23 | Real CVD Connect | `RealtimeCVD.connect()` | Auto-connect WebSocket |

### 6.3 Sessões de Trading & Kill Zones

| Sessão | Horário (UTC) | Multiplicador | Emoji |
|--------|:------------:|:------------:|:-----:|
| Asian | 00:00-07:00 | 0.6 | 🌙 |
| London Open | 07:00-09:00 | 1.3 | 🇬🇧 |
| London | 09:00-12:00 | 1.0 | 🇬🇧 |
| **Kill Zone** | **12:00-16:00** | **1.5** | 🎯 |
| New York | 16:00-20:00 | 1.0 | 🇺🇸 |
| NY Close | 20:00-21:00 | 0.8 | 🔔 |
| Dead Zone | 21:00-00:00 | 0.4 | 💤 |

- **Fins de semana**: Multiplicador máximo 0.5; sinal máximo = AGUARDAR

### 6.4 Regimes Avançados (6 Estados)

| Regime | Descrição | Impacto |
|--------|-----------|---------|
| `COMPRESSION` | Volatilidade extremamente baixa | Bloqueia sinais |
| `HIGH_VOL` | Volatilidade extremamente alta | Aumenta thresholds |
| `EXPANSION_UP` | Expansão bullish | Favorece LONG |
| `EXPANSION_DOWN` | Expansão bearish | Favorece SHORT |
| `TREND_UP` | Tendência de alta sustentada | Favorece LONG |
| `TREND_DOWN` | Tendência de baixa sustentada | Favorece SHORT |
| `RANGE` | Mercado lateral | Mean reversion |

---

## 7. Sistema de 9 Gates

### 7.1 Os 9 Gates

O sinal só é promovido a "CONFIRMED" se passar por um número mínimo de gates independentes:

| # | Gate | Peso Base | Critério de Passagem |
|---|------|:---------:|---------------------|
| 1 | **BOS** (Break of Structure) | 2.0 | `bosType === 'REAL'` (volume + close + CVD confirmam) |
| 2 | **Displacement** | 2.0 | Z-score corpo ≥ 1.3 em 1h ou 4h, mesma direção |
| 3 | **Volume Expansion** | 1.5 | Z-score volume ≥ 1.5 AND sustentado (2+ candles) |
| 4 | **CVD Confirms** | 1.5 | CVD delta alinhado (WebSocket preferido, fallback kline) |
| 5 | **Outside Range** | 2.0 | `rangePosition.tradeable === true` |
| 6 | **Funding OK** | 1.0 | Funding não bloqueia (não-contra extremo) |
| 7 | **Acceptance** | 1.5 | Candle fechou fora do range (breakout aceito) |
| 8 | **OI Confirms** | 1.5 | OI confirma direção (squeeze/buildup) |
| 9 | **Anti-Spoof OK** | 1.0 | Sem spoofing detectado |

### 7.2 Requisitos por Regime (Regime-Adaptivos)

| Regime | Com Tendência: Gates Min | Com Tendência: Score Min | Contra Tendência: Gates Min | Contra: Score Min |
|--------|:-----------------------:|:------------------------:|:--------------------------:|:-----------------:|
| TREND_UP / TREND_DOWN | 3 | 45% | 5 | 65% |
| EXPANSION_UP / DOWN | 3 | 40% | 5 | 65% |
| RANGE | 4 | 55% | 5 | 60% |
| HIGH_VOL | 4 | 55% | 4 | 55% |
| COMPRESSION | 4 | 50% | 5 | 60% |

### 7.3 Pesos Dinâmicos por Regime

Os pesos de cada gate **mudam conforme o regime**:

**Em RANGING** (estrutura importa mais):
- BOS: 2.5, Outside Range: 2.5, Acceptance: 2.0
- Displacement: 1.0, Volume: 1.0 (menos importante)

**Em BULL_TREND** (momentum importa mais):
- Displacement: 2.5, Volume: 2.0, OI: 2.0
- BOS: 1.5, Funding: 0.5 (menos restritivo)

### 7.4 Cálculo do Gate Score

```
gateScore = (pesoAbertos / pesoTotal) × 100
scoreAjustado = gateScore × 0.7 + (gateScore × multiplicadorSessão) × 0.3
```

### 7.5 Requisito de Gate Ativo

Gates passivos (funding, anti-spoof) sozinhos **não são suficientes**. É necessário pelo menos 1 de:
- BOS, Displacement, ou Volume (gates estruturais)
- **OU** CVD + OI (confluência de fluxo)
- **OU** 6+ gates totais abertos

### 7.6 Penalização de Redundância

Gates correlacionados (ex: Displacement + Volume) são penalizados quando ambos abertos, para evitar double-counting. 7 pares de redundância são avaliados.

---

## 8. CVD em Tempo Real (WebSocket)

### 8.1 Arquitetura

O módulo `realtime-cvd.js` conecta diretamente ao stream WebSocket `aggTrade` da Binance para calcular CVD com granularidade trade-a-trade (vs. kline-based que usa candles).

### 8.2 Funcionalidades

| Feature | Descrição |
|---------|-----------|
| **Conexão** | `RealtimeCVD.connect(symbol)` → WebSocket aggTrade |
| **Desconexão** | `RealtimeCVD.disconnect(symbol)` / `disconnectAll()` |
| **Buffer** | 10.000 trades máx por símbolo |
| **Janelas** | 1min, 5min, 15min, 30min, 1h |
| **Iceberg Detection** | Volume > 5× média sem movimento de preço (< 0.02%) |
| **Auto-reconnect** | Backoff exponencial (2s base → 60s max) |
| **Persistência** | localStorage |

### 8.3 Integração com V4

O gate **CVD Confirms** (gate #4) usa IIFE que:
1. Tenta `RealtimeCVD.getFullCVDAnalysis(symbol)` primeiro (confidence ≥ 30)
2. Se indisponível, faz fallback para CVD baseado em klines
3. Resultado inclui `cvdSource` ('WebSocket' ou 'kline')

### 8.4 Auto-Connect

Quando o usuário abre a Análise Técnica, `RealtimeCVD.connect(symbol)` é chamado automaticamente para iniciar a coleta de trades em tempo real.

---

## 9. Análise Multi-Timeframe (MTF) com Pesos Adaptativos

### 9.1 Timeframes e Pesos Base

| Timeframe | Peso Base | Análise |
|-----------|:---------:|---------|
| 15min | 0.15 | EMA20, EMA50, RSI14 |
| 1h | 0.30 | EMA20, EMA50, RSI14 |
| 4h | 0.30 | EMA20, EMA50, RSI14 |
| 1d | 0.25 | EMA20, EMA50, RSI14 |

### 9.2 Pesos Adaptativos

Os pesos são ajustados **dinamicamente** com base na volatilidade de cada timeframe:

```
volatilidade_por_TF = ATR(5) / preço_médio × 100
peso_adaptativo = inverso_normalizado(volatilidade)  // menos volátil = mais confiável
peso_final = 0.70 × peso_base + 0.30 × peso_adaptativo
```

**Lógica**: Timeframes menos voláteis são mais confiáveis para tendência, então recebem mais peso.

### 9.3 Classificação de Tendência por TF

| Condição | Classificação |
|----------|:------------:|
| Preço > EMA20 > EMA50 | BULLISH |
| Preço > EMA20, EMA20 < EMA50 | WEAK_BULL |
| Preço < EMA20 < EMA50 | BEARISH |
| Preço < EMA20, EMA20 > EMA50 | WEAK_BEAR |
| Outros | NEUTRAL |

### 9.4 Score de Alinhamento

Score 0-100 indicando quão alinhados estão os timeframes. Todos BULLISH = 100. Todos BEARISH = 0. Misto = proporção ponderada.

---

## 10. Sistema de Scoring & Determinação de Sinal

### 10.1 Pipeline Completo

```
V1 Confluence Score (±37 max)
    → V2 Contextual Adjustment (regime, structure, CVD)
    → V3 Enhancement (crash detection, adaptive weights)
    → V4 Gate Evaluation (9 gates)
    → Final Signal
```

### 10.2 Determinação Final

| Estado | Critério |
|--------|----------|
| **LONG_CONFIRMED** | Gates ≥ mínimo + Score ≥ threshold + direção LONG + gate ativo |
| **SHORT_CONFIRMED** | Gates ≥ mínimo + Score ≥ threshold + direção SHORT + gate ativo |
| **AGUARDAR_LONG** | Tendência LONG mas gates insuficientes |
| **AGUARDAR_SHORT** | Tendência SHORT mas gates insuficientes |
| **NEUTRO** | Sem direção clara, bloqueado, ou dados inválidos |

### 10.3 Condições de Override (Podem Forçar NEUTRO)

| Override | Condição |
|----------|----------|
| Squeeze Block | Bollinger squeeze sem expansão |
| Vol Regime Shift | Regime EXPLOSIVE sem confirmação |
| Market Breadth | Sinal contra > 65% do mercado |
| MTF Misalignment | Timeframes divergentes |
| V3/V4 Conflict | Engines discordam na direção |
| Model Instability | Win rate rolling abaixo do mínimo |
| Risk Kill Switch | 3 perdas consecutivas |
| Systemic Risk | Backend assessment = HIGH |
| Macro Regime | Regime macro desfavorável |
| Data Integrity | Dados críticos ausentes → FORCE_NEUTRO |
| Weekend | Sábado/domingo → max AGUARDAR (confidence cap 45%) |
| Crash/Pump | Evento extremo → NEUTRO forçado |

### 10.4 Calibração de Confidence

```javascript
calibratedConfidence = sigmoid(rawConfidence)
finalConfidence = 0.6 × calibratedConfidence + 0.4 × heuristicConfidence
```

Minimum para registrar call: **70%**  
Sinais com ≥70% são automaticamente promovidos de AGUARDAR para CONFIRMED.

---

## 11. Seções de UI Renderizadas na Análise Técnica

A função `renderTechnicalAnalysis()` renderiza estas seções no modal de AT:

| # | Seção | Conteúdo |
|---|-------|----------|
| 1 | **Crypto Header** | Nome, símbolo, preço atual |
| 2 | **Signal Card** | LONG/SHORT/NEUTRO, confidence %, sessão, regime, gates, action message |
| 3 | **Entry/Exit Levels** | Entry, Stop Loss, Risk%, TP1 (POC), TP2 (VAH/VAL), TP3 (ATR×4), ratios R:R |
| 4 | **BTC Alignment** | Correlação Pearson (12h/24h/72h), tendência BTC, força relativa, risco |
| 5 | **Market Diagnostics** | Score Percentile, Regime Quality (ADX/Volume/ATR), Saturação/Extensão |
| 6 | **MTF Analysis** | Grid 4 colunas (15m/1h/4h/1d) com trend arrows, RSI, alignment score |
| 7 | **Setup History** | Win rate por fingerprint, avg R, sample count, quality rating |
| 8 | **Market Breadth** | Barra Long/Neutral/Short, status de alinhamento |
| 9 | **AI Summary** | Resumo textual gerado inclui análise de MAs (EMA9/20/50, SMA50/99/200) + V4 reactive summary |
| 10 | **Market Regime** | Nome do regime, força, ADX 1h/4h, BB percentile, squeeze, implicação |
| 11 | **Market Structure** | BOS/CHoCH, estrutura 1h/4h, liquidity sweeps |
| 12 | **CVD Advanced** | Delta cumulativo, divergência, absorção, breakout |
| 13 | **Macro + News** | Sentimento macro, eventos críticos, notícias urgentes |
| 14 | **Big Tech & US Macro** | AAPL/MSFT/GOOGL/AMZN/META/NVDA/TSLA + indices + Fear & Greed + Yields (3M/5Y/10Y/30Y) + yield curve |
| 15 | **Order Flow** | Funding rate gauge, CVD visual, OI visual |
| 16 | **Volume Profile** | POC, VWAP, VAH, VAL |
| 17 | **Liquidation Heatmap** | Clusters de liquidação por nível de preço |
| 18 | **Whale Activity** | Transações on-chain BTC (Mempool.space) |
| 19 | **Call History** | Win rates (1h/4h/12h/24h), tabela de calls com PnL %, botões exportar JSON/CSV |
| 20 | **Risk Metrics** | Position size, drawdown, kill switch status |
| 21 | **Squeeze/Volatility** | Estado de squeeze, regime de volatilidade |

---

## 12. Seções Ocultas (Processamento em Background)

Módulos que executam e influenciam o sinal mas **não possuem cards visuais dedicados**:

| Módulo | Impacto |
|--------|---------|
| **BOS Validation** (V4) | Gate #1, resultado no signal card |
| **Microstructure Detection** | Ajuste de confidence ±5-10% |
| **Anti-Spoofing** | Gate #9, pode bloquear silenciosamente |
| **Signal Conflict V3/V4** | Penalidade se engines discordam |
| **Bot Webhook** | JSON gerado mas não exibido |
| **Collective Learning** | Submit assíncrono ao backend |
| **Data Integrity** | FORCE_NEUTRO silencioso |
| **Model Stability** | Bloqueio se win rate baixo |
| **Kill Switch** | 3 perdas → NEUTRO forçado |
| **Session Context** | Multiplicador silencioso |
| **Dynamic Thresholds** | Z-Score do backend calibra módulos |
| **Score Percentile History** | localStorage em background |

---

## 13. Dados Externos (Macro, Notícias, FED)

### 13.1 Macro Data

| Fonte | Indicador | Impacto |
|-------|-----------|---------|
| Yahoo Finance | S&P 500 | Correlação risk-on/off |
| Yahoo Finance | DXY | USD forte = crypto fraco |
| Yahoo Finance | VIX | Medo → reduz confidence |
| Yahoo Finance | Gold | Flight to safety |
| Yahoo Finance | Oil | Pressão inflacionária |
| Yahoo Finance | Treasury 10Y/5Y | Política monetária |
| CoinGecko | BTC Dominance | Rotação alt → BTC |
| CoinGecko | Total Market Cap | Health geral |
| CoinGecko | Fear & Greed | Sentimento |

### 13.2 Big Tech Score

```
bigTechScore = média ponderada(AAPL, MSFT, GOOGL, AMZN, META, NVDA, TSLA variações intraday)
```

Aplicado como modificador ao confluence score.

### 13.3 Notícias

| Fonte | Tipo |
|-------|------|
| CryptoPanic API | Hot posts com score de sentimento |
| RSS Feeds | Múltiplos feeds via RSS2JSON |

### 13.4 FED / Macro Regime

| Endpoint | Impacto |
|----------|---------|
| `/analysis/macro-regime` | HAWKISH/DOVISH/NEUTRAL → ajuste de pesos |
| `/analysis/systemic-risk` | HIGH → pode forçar NEUTRO |

---

## 14. Sistema de Histórico de Calls (Banco de Dados)

### 14.1 Regras de Registro

| Regra | Valor |
|-------|-------|
| Confidence mínima | ≥ 70% |
| Sinal necessário | Deve conter "CONFIRMED" |
| Deduplicação | Mesmo símbolo + direção dentro de 30 min → ignora |
| Limite de armazenamento | **500 calls** |
| Storage | `localStorage` (`vc_call_history`) |

### 14.2 Dados Registrados por Call (Analytics Snapshot)

Cada call registra **35+ campos** analíticos para posterior análise:

| Categoria | Campos |
|----------|--------|
| **Core** | symbol, direction, confidence, entryPrice, timestamp |
| **V4 Signal** | v4Signal, v4Confidence, v4Probability, v4GatesPassed, v4GatesTotal, v4GateScore, v4RegimeKey, v4ExecutionType, v4IsCounterTrend, v4ActionMessage |
| **Gates Individuais** | Para cada gate: passed, name, cvdSource |
| **Contexto** | regime, session, isKillZone |
| **Displacement** | detected, direction |
| **Volume** | volumeExpansion (bool) |
| **Indicadores** | rsi1h, rsi4h, macd1h, adx1h, atr14, bookImbalance, fundingRate |
| **CVD Real** | trend, trendScore, deltaAcceleration, divergence, icebergs count |
| **BTC Alignment** | correlation, aligned, risk |
| **MTF** | alignedCount, totalAvailable, dominantDirection, alignmentScore, adaptiveWeights |
| **Trade Plan** | entry, stopLoss, takeProfit1, takeProfit2, riskReward |
| **Macro** | squeeze, volRegime, setupFingerprint, marketBreadth, macroRegime, systemicRisk |

### 14.3 Verificação de Resultado (PnL)

**Intervalos de Checagem**: 1h, 4h, 12h, **24h**

Para cada intervalo, o sistema:
1. Busca preço atual via Binance `/ticker/price`
2. Calcula PnL%: `(preçoAtual - entry) / entry × 100` (ajustado para SHORT)
3. Classifica como **WIN** ou **LOSS**
4. Armazena no objeto da call

### 14.4 Estatísticas Agregadas

| Métrica | Por Intervalo |
|---------|:------------:|
| Wins / Losses / Pending | ✅ |
| Win Rate % | ✅ |
| PnL Médio % | ✅ |
| PnL Total % | ✅ |

### 14.5 Analytics Avançados

`getCallAnalyticsSummary()` fornece breakdowns de win rate por:
- **Regime** (TREND_UP, RANGING, HIGH_VOL, etc.)
- **Sessão** (KILL_ZONE, LONDON_OPEN, ASIAN, etc.)
- **Quantidade de Gates** (3, 4, 5, 6+ gates abertos)

### 14.6 Exportação

| Formato | Função | Colunas |
|---------|--------|:-------:|
| **JSON** | `exportCallHistoryJSON()` | Todos os dados + stats |
| **CSV** | `exportCallHistoryCSV()` | 35+ colunas |

Botões "Exportar JSON" e "Exportar CSV" disponíveis na seção Call History do modal de AT.

### 14.7 Estrutura de Dados de uma Call

```javascript
{
    symbol: "BTCUSDT",
    signal: "LONG_CONFIRMED",
    confidence: 78.5,
    entryPrice: 67500.00,
    timestamp: 1700000000000,
    crypto: { name: "Bitcoin", ... },
    analytics: {
        v4Signal: "LONG_CONFIRMED",
        v4Confidence: 78.5,
        v4GatesPassed: 5,
        v4GatesTotal: 9,
        v4GateScore: 68.3,
        v4RegimeKey: "TREND_UP",
        regime: "TREND_UP",
        session: "KILL_ZONE",
        indicators: { rsi1h: 42, macd1h: 0.05, adx1h: 35, ... },
        realtimeCVD: { trend: "BULLISH", trendScore: 72, ... },
        btcAlignment: { correlation: 0.85, aligned: true },
        mtfAlignment: { alignedCount: 3, dominantDirection: "BULLISH" },
        // ... 35+ campos
    },
    results: {
        "1h":  { price: 67800, pnl: 0.44, win: true },
        "4h":  { price: 68200, pnl: 1.04, win: true },
        "12h": { price: 67100, pnl: -0.59, win: false },
        "24h": { price: 68500, pnl: 1.48, win: true }
    }
}
```

---

## 15. Sistema de Notificações & Auto-Scan

### 15.1 Configurações por Crypto

| Setting | Descrição |
|---------|-----------|
| Master toggle | Liga/desliga todas as notificações |
| Confidence global | Mínimo 70% |
| Per-crypto toggle | Liga/desliga individualmente |
| Per-crypto slider | Min 70, Max 100, Step 5 |

### 15.2 Auto-Scan

O sistema faz scan automático a cada **5 minutos** de todas as cryptos habilitadas nas configurações de notificação:

1. Para cada crypto habilitada, executa `fetchTechnicalAnalysisData()`
2. Aplica pipeline completo (V1 → V2 → V3 → V4)
3. Verifica triggers de notificação

### 15.3 Triggers de Notificação

| Trigger | Condição | Prioridade |
|---------|----------|:----------:|
| `SETUP_CONFIRMED` | V4 muda para CONFIRMED com confidence ≥ threshold | HIGH |
| `CONFIDENCE_THRESHOLD` | Confidence cruza threshold para cima | MEDIUM |
| `REGIME_CHANGE` | Regime avançado muda | MEDIUM |
| `SCORE_JUMP` | Gate score pula ≥ 10 pontos | LOW |

### 15.4 Formato de Notificação

```
Título: "{SYMBOL} — LONG CONFIRMED"
Corpo: "Confidence: 82% | Gates: 5/9 | Regime: TREND_UP"
```

---

## 16. Integração AdMob

### 16.1 Configuração

| Propriedade | Valor |
|-------------|-------|
| Tipo | Interstitial (tela cheia) |
| Ad Unit ID | `ca-app-pub-2121626726443679/9603615439` |
| Plugin | `@capacitor-community/admob@8.0.0` |
| App ID | `ca-app-pub-2121626726443679~6618629871` |

### 16.2 Fluxo

```
Usuário abre Análise Técnica
    → showInterstitialAd()
    → Anúncio exibe enquanto dados carregam
    → Dados prontos → modal renderiza
    → Após dismiss: prepareInterstitial() recarrega próximo
    → Falha: retry após 30s
```

### 16.3 Eventos (v8 API)

| Evento | Ação |
|--------|------|
| `interstitialAdLoaded` | Ad pronto |
| `interstitialAdDismissed` | Re-prepara após 5s |
| `interstitialAdFailedToLoad` | Retry após 30s |

---

## 17. Apêndices

### 17.1 Storage (localStorage)

| Chave | Uso |
|-------|-----|
| `vc_call_history` | Histórico de calls (500 últimas) |
| `vc_ta_cache_{symbol}` | Cache de análise por símbolo |
| `vc_score_history` | Histórico de scores (para breadth) |
| `vc_signal_directions` | Direção do último sinal |
| `vc_setup_fingerprints` | Win rates por setup |
| `vc_risk_state` | Estado do risk engine |
| `vc_collective_queue` | Fila de trades para backend |
| `vc_notification_settings` | Configurações de notificação |

### 17.2 Constantes Z-Score (V4)

| Constante | Valor | Uso |
|----------|:-----:|-----|
| `Z_SCORE_DISPLACEMENT` | 1.3 | Body z-score para displacement |
| `Z_SCORE_VOLUME` | 1.5 | Volume z-score para expansão |
| `Z_SCORE_VOLUME_MILD` | 1.0 | Expansão de volume suave |
| `Z_SCORE_LOOKBACK` | 100 | Janela de normalização |
| `Z_SCORE_MICRO_LOOKBACK` | 50 | Lookback microestrutura |

São **fallbacks** — thresholds reais são percentile-based por ativo, vindos do backend.

### 17.3 Dependências

| Dependência | Versão | Uso |
|-------------|--------|-----|
| Capacitor | 8.0.2 | Container nativo Android |
| @capacitor-community/admob | 8.0.0 | Monetização |
| @capacitor/local-notifications | 8.0.1 | Notificações locais |
| @capacitor/screen-orientation | 8.0.0 | Orientação de tela |
| Chart.js | CDN | Gráficos |

### 17.4 Build

```
1. Copy-Item www/* visor-crypto-apk/www/ -Recurse -Force
2. npx cap sync android
3. cd android && .\gradlew.bat assembleDebug
4. APK: android/app/build/outputs/apk/debug/app-debug.apk (~27 MB)
```

### 17.5 22 Cryptos Suportadas

BTC, ETH, SOL, BNB, XRP, ADA, AVAX, DOGE, SHIB, PEPE, LINK, UNI, AAVE, DOT, LTC, ATOM, NEAR, RNDR, FET, ZEC, BCH, SUI

---

> **Nota**: Este documento reflete o estado atual do sistema após todas as implementações (Real-time CVD, MTF adaptativos, banco de dados de calls completo). Números de linha são aproximados e podem variar.
