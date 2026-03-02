# Documentação Completa — Análise Técnica Avançada (Visor Crypto)

> Versão: ta-engine-v2.js + **ta-engine-v3.js** + **ta-engine-v4.js (v7.2.0)** + index.html  
> Data: Fevereiro 2026  
> APK: v11 (23.1 MB)

---

## Índice

1. [Visão Geral do Sistema](#visão-geral)
2. [Arquitetura dos Arquivos](#arquitetura)
3. [Fluxo de Execução Completo](#fluxo)
4. [Coleta de Dados (Binance + Externas)](#coleta-de-dados)
5. [Indicadores Técnicos Multi-Timeframe](#indicadores-tecnicos)
6. [Sistema de Pontuação por Confluência](#pontuacao-confluencia)
7. [Order Flow & Microestrutura](#order-flow)
8. [Volume Profile](#volume-profile)
9. [Análise Gráfica Multi-Timeframe](#analise-grafica)
10. [Módulo V2 — Engine Institucional](#modulo-v2)
    - [10a. Regime de Mercado](#regime-mercado)
    - [10b. Estrutura de Mercado (BOS/CHoCH)](#estrutura-mercado)
    - [10c. CVD Avançado](#cvd-avancado)
    - [10d. Bollinger Bands](#bollinger)
    - [10e. Volatilidade Metrics (ATR)](#volatilidade)
    - [10f. Macro & Notícias Layer](#macro-noticias)
    - [10g. Big Tech & Macro Global](#big-tech-macro)
    - [10h. Contextual Scoring (não-linear)](#contextual-scoring)
    - [10i. Dynamic Targets (TP1/TP2/TP3)](#dynamic-targets)
    - [10j. Liquidation Model](#liquidation-model)
11. [**Módulo V3 — Advanced Trading Intelligence**](#modulo-v3)
    - [11a. Crash / Black Swan Detector](#crash-detector)
    - [11b. Indicator Decorrelation Engine](#decorrelation)
    - [11c. Adaptive Weight Engine (Online Learning)](#adaptive-weights)
    - [11d. Position Sizing Engine (Kelly Criterion)](#position-sizing)
    - [11e. Virtual Trade Tracker & Forward Tester](#virtual-tracker)
    - [11f. On-Chain Analyzer](#on-chain)
    - [11g. Multi-Exchange Aggregated CVD](#multi-exchange)
    - [11h. Edge Calculator (Statistical Edge)](#edge-calculator)
    - [11i. Rolling Correlation Engine](#rolling-correlation)
    - [11j. Non-Linear Scoring Engine](#non-linear-score)
    - [11k. Enhanced Regime Detector](#enhanced-regime)
    - [11l. BOS Validation (False Breakout Detector)](#bos-validation)
    - [11m. System Limitations & Warnings](#system-warnings)
12. [**Módulo V4 — Reactive Intelligence Engine (v7.2.0)**](#modulo-v4)
    - [12a. Arquitetura de 9 Gates](#9-gates)
    - [12b. Regime-Adaptive Weights](#regime-weights)
    - [12c. Sistema Centralizado de Soft Adjustments (±25)](#soft-adjustments)
    - [12d. Penalidade de Redundância (Worst-Penalty)](#redundancy-v4)
    - [12e. Calibração Piecewise](#calibracao-piecewise)
    - [12f. Filtro de Funding Gradual (4 tiers)](#funding-gradual)
    - [12g. Cold Start Guard (<8 sinais)](#cold-start)
    - [12h. Acceptance Timing (15m candles)](#acceptance-timing)
    - [12i. BOS Scoring Contínuo (0/0.5/1.0)](#bos-continuo)
    - [12j. Liquidity Levels Analysis](#liquidity-levels)
    - [12k. Hidden Divergence Detection](#hidden-divergence)
    - [12l. Signal TTL (Time-To-Live)](#signal-ttl)
    - [12m. Dynamic Exit Plan (TP1/TP2/TP3 + ATR Trailing)](#dynamic-exit)
    - [12n. Liquidation Zones Estimation](#liquidation-zones)
    - [12o. Order Flow Ring Buffer (WebSocket)](#order-flow-ws)
    - [12p. Notification Cooldown](#notification-cooldown)
    - [12q. EWMA Adaptive Alpha (V3 Enhancement)](#ewma-alpha)
    - [12r. Pipeline Completo V2→V3→V4](#pipeline-completo)
13. [Cálculo Final do Score e Sinal](#score-final)
14. [Cache e Auto-Refresh](#cache-autorefresh)
15. [AI Summary](#ai-summary)
16. [Interface Renderizada (Seções da UI)](#ui-render)
17. [Tabela Resumo de Pesos](#tabela-pesos)

---

## 1. Visão Geral do Sistema {#visão-geral}

A Análise Técnica Avançada é um sistema de confluência multi-camada que combina:

- **14+ indicadores técnicos** em múltiplos timeframes (1m, 5m, 15m, 1h, 4h, 1d)  
- **Order flow profissional**: CVD, Funding Rate, Open Interest, Order Book Imbalance  
- **Volume Profile**: POC, VAH, VAL, VWAP  
- **Detecção de padrões gráficos**: 12 padrões de candlestick, estrutura HH/HL/LL/LH  
- **Engine V2 institucional**: Regime de mercado, BOS/CHoCH, CVD avançado, squeeze  
- **Macroeconômico**: Big Tech (AAPL, MSFT, TSLA, META, NVDA), SP500, VIX, DXY, Curva de Juros  
- **Notícias**: FMP Economic Calendar + CryptoPanic com análise de sentimento  
- **Liquidações reais** da Binance (force orders) + heatmap estimado  

O sistema gera um **score numérico total** que determina LONG / SHORT / NEUTRO, com **probabilidade** (5-95%) e **confiança** (0-95%).

---

## 2. Arquitetura dos Arquivos {#arquitetura}

```
www/
├── index.html          (~14.648 linhas)
│   ├── openTechnicalAnalysis()       ← ponto de entrada
│   ├── fetchTechnicalAnalysisData()  ← coleta Binance
│   ├── generateTechnicalAnalysis()   ← cálculo de todos os indicadores
│   ├── renderTechnicalAnalysis()     ← renderiza a UI
│   ├── startTAAutoRefresh()          ← auto-refresh 5min
│   ├── analyzeChartPatterns()        ← padrões gráficos
│   ├── calculateLiquidationHeatmap() ← heatmap estimado
│   ├── analyzeRealLiquidations()     ← liquidações reais Binance
│   └── [funções utilitárias]
│       calculateRSI / calculateEMA / calculateMACD / calculateADX
│       calculateStochastic / calculateVWAP / calculateATR
│       calculateVolumeProfile / calculateCVD / calculateBookImbalance
│       calculateNetVolume / findLiquidityPools / generateAISummary
│
└── ta-engine-v2.js     (1.330 linhas, IIFE)
    Exporta para window.TAEngineV2:
    ├── detectMarketRegime()
    ├── detectMarketStructure()
    ├── calculateCVDAdvanced()
    ├── calculateBollingerBands()
    ├── calculateVolatilityMetrics()
    ├── fetchMacroNewsLayer()
    ├── fetchBigTechAndMacro()
    ├── applyContextualScoring()
    ├── calculateDynamicTargets()
    └── improvedLiquidationModel()

├── ta-engine-v3.js     (1.734 linhas, IIFE)
│   Exporta para window.TAEngineV3:
│   ├── detectCrash()
│   ├── calculateDecorrelation()
│   ├── updateAdaptiveWeights()
│   ├── calculatePositionSize()
│   ├── recordVirtualTrade()
│   ├── analyzeOnChain()
│   ├── aggregateCVDMultiExchange()
│   ├── calculateEdge()
│   ├── rollingCorrelationEngine()
│   ├── nonLinearScoringEngine()
│   ├── enhancedRegimeDetector()
│   ├── validateBOS()
│   └── getAdaptiveAlpha()          ← v7.2 (regime-adaptive EWMA)
│
└── ta-engine-v4.js     (4.678 linhas, v7.2.0)
    Exporta para window.TAEngineV4:
    ├── enhanceWithReactive()        ← entry point principal
    ├── evaluateReactiveGates()      ← 9 gates regime-adaptivos
    ├── calibrateConfidence()        ← piecewise 3-segment
    ├── applyRedundancyPenalty()     ← worst-penalty + 2%/extra
    ├── checkFundingFilter()         ← 4-tier gradual
    ├── checkModelStability()        ← cold start guard
    ├── scoreBosGate()               ← BOS contínuo 0-1
    ├── detectAcceptance()           ← 15m acceptance timing
    ├── analyzeLiquidityLevels()     ← pools de liquidez
    ├── detectHiddenDivergence()     ← divergência oculta
    ├── checkSignalTTL()             ← time-to-live 4h
    ├── generateDynamicExitPlan()    ← TP1-3 + ATR trailing
    ├── estimateLiquidationZones()   ← 5x/10x/25x/50x
    ├── connectOrderFlowWS()         ← WebSocket ring buffer 500
    ├── getOrderFlowAnalysis()       ← análise tempo real
    ├── isNotificationOnCooldown()   ← cooldown por tipo
    └── markNotificationSent()
```

---

## 3. Fluxo de Execução Completo {#fluxo}

```
Usuário toca em uma crypto
        │
        ▼
openTechnicalAnalysis(symbol)
        │
        ├── Exibe loading screen com 8 chips animados
        │
        ├── getTACache(symbol)      ← tem cache <5min?
        │       ├── SIM → pula direto para renderTechnicalAnalysis()
        │       └── NÃO → continua
        │
        ├── Promise.all([
        │       fetchTechnicalAnalysisData(symbol),   ← Binance (16 endpoints)
        │       fetchMacroNewsLayer(),                ← FMP + CryptoPanic
        │       fetchBigTechAndMacro()                ← Yahoo + Fear&Greed + World Bank
        │   ])
        │
        ├── generateTechnicalAnalysis(binanceData, symbol)
        │       │
        │       ├── 14+ indicadores técnicos (RSI, EMA, MACD, ADX, etc.)
        │       ├── Chart patterns (1m/5m/15m/1h)
        │       ├── Volume Profile (POC/VAH/VAL)
        │       ├── Order Flow (Funding, OI, CVD, Book)
        │       ├── Confluence Scoring (ponderado)
        │       ├── V2 Engine (Regime, Structure, CVD Adv, Volatility)
        │       ├── Contextual Scoring (ajuste não-linear por regime)
        │       ├── Dynamic Targets (TP1/TP2/TP3, R:R)
        │       └── AI Summary
        │
        ├── Injetar scores Macro + BigTech no resultado
        │
        ├── setTACache(symbol, result, 5min)
        │
        ├── renderTechnicalAnalysis(analysis, crypto)
        │
        └── startTAAutoRefresh(symbol, crypto, 5min)
```

---

## 4. Coleta de Dados {#coleta-de-dados}

### 4.1 Binance (fetchTechnicalAnalysisData) — 16 endpoints paralelos

| Endpoint | Dados | Uso |
|---|---|---|
| `/api/v3/klines?interval=1m&limit=60` | Candles 1min (60 velas) | Scalping, padrões de curto prazo |
| `/api/v3/klines?interval=5m&limit=60` | Candles 5min (60 velas) | Confirmação curto prazo |
| `/api/v3/klines?interval=15m&limit=100` | Candles 15min (100 velas) | RSI 15m, padrões |
| `/api/v3/klines?interval=1h&limit=100` | Candles 1h (100 velas) | Indicadores principais |
| `/api/v3/klines?interval=4h&limit=100` | Candles 4h (100 velas) | Confirmação tendência |
| `/api/v3/klines?interval=1d&limit=50` | Candles diários (50) | EMA 200 diário, ATR 1d |
| `/api/v3/ticker/24hr` | Volume 24h, variação, lastPrice | Contexto geral |
| `/api/v3/depth?limit=100` | Order Book (100 bids+asks) | Book Imbalance, Liquidity Pools |
| `/fapi/v1/fundingRate?limit=1` | Funding Rate atual | Order flow (taxa paga/recebida) |
| `/fapi/v1/openInterest` | Open Interest total | Entrada/saída de capital |
| `/futures/data/globalLongShortAccountRatio?period=1h&limit=1` | Ratio Long/Short global | Sentimento contrarian |
| `/api/v3/trades?limit=500` | 500 trades recentes | CVD, pressão compradora/vendedora |
| `/futures/data/topLongShortPositionRatio?period=1h&limit=1` | Top Traders — Posição | Análise smart money |
| `/futures/data/topLongShortAccountRatio?period=1h&limit=1` | Top Traders — Conta | Análise smart money |
| `/futures/data/takerlongshortRatio?period=1h&limit=24` | Taker Buy/Sell Vol (24h) | Pressão aggressiva de ordens |
| `/fapi/v1/allForceOrders?limit=100` | Liquidações reais (Force Orders) | Heatmap de liquidações real |

### 4.2 APIs Externas

| API | O que busca | Fallback |
|---|---|---|
| **FMP** (Financial Modeling Prep) | Calendário econômico (impacto alto/médio) | Ignora se falhar |
| **CryptoPanic** | Notícias cripto (últimas 50) + sentimento | Ignora se falhar |
| **Yahoo Finance** | AAPL, MSFT, TSLA, META, NVDA, ^GSPC, ^VIX, DX-Y.NYB, ^IRX, ^FVX, ^TNX, ^TYX | 4 estratégias CORS em cascata |
| **alternative.me** | Fear & Greed Index (0-100) | Sem fallback |
| **World Bank** | CPI (inflação) e Desemprego dos EUA | Cache por 24h |

#### Estratégia CORS do Yahoo Finance (4 níveis):
1. Chamada direta `https://query1.finance.yahoo.com/v8/finance/chart/{symbol}`
2. URL alternativa `https://query2.finance.yahoo.com/...`
3. Proxy público `https://corsproxy.io/?...`
4. Proxy alternativo `https://api.allorigins.win/get?url=...`

---

## 5. Indicadores Técnicos Multi-Timeframe {#indicadores-tecnicos}

Todos calculados dentro de `generateTechnicalAnalysis()`:

### RSI (Relative Strength Index)
- **RSI 15m** — calculado sobre klines15m  
- **RSI 1h** — calculado sobre klines1h  
- **RSI 4h** — calculado sobre klines4h  
- Período padrão: 14  
- Fórmula: `RSI = 100 - (100 / (1 + RS))` onde RS = média de ganhos / média de perdas  

### EMA (Exponential Moving Average)
- **EMA 200 (1h)** — tendência principal 1h  
- **EMA 200 (4h)** — tendência principal 4h  
- **EMA 9, EMA 20, EMA 50** (1h) — painel de médias móveis  
- **SMA 50, SMA 99, SMA 200** (1h) — médias simples  
- **EMA 8, EMA 21** (por timeframe) — para análise gráfica  

### VWAP (Volume Weighted Average Price)
- Calculado sobre klines1h  
- Fórmula: `Σ(TP × Volume) / Σ(Volume)` onde TP = (High+Low+Close)/3  

### MACD
- **MACD 1h** e **MACD 4h**  
- Padrão: EMA12 − EMA26, Signal = EMA9 do MACD, Histograma = MACD − Signal  
- Sinal confirmado apenas quando: `histograma > 0 E linha MACD acima da Signal`  

### ADX (Average Directional Index)
- **ADX 1h** e **ADX 4h**  
- Componentes: ADX, +DI, −DI  
- Threshold de força: >25 = tendência válida, >35 = tendência forte  
- Direção: +DI > −DI = bullish, +DI < −DI = bearish  

### Stochastic Oscillator
- **Stochastic 1h** e **Stochastic 4h**  
- Período %K = 14, %D = SMA3 do %K  
- Oversold: K < 20; Overbought: K > 80  
- Sinal: cruzamento K/D dentro das zonas extremas  

### Net Volume / Volume Delta
- **Net Volume 1h** e **Net Volume 4h**  
- Fórmula: `delta = Σ(bullVol) − Σ(bearVol)`; `ratio = delta / totalVol × 100`  
- Threshold: ratio > 0.1% = pressão compradora  

### ATR (Average True Range)
- **ATR 1h**, **ATR 4h**, **ATR 1d** — período 14  
- Fórmula: média do True Range ao longo de 14 períodos  
- Usado para: stop loss, tamanho das metas (TP3 = ATR×4, SL = ATR×1.5)  

---

## 6. Sistema de Pontuação por Confluência {#pontuacao-confluencia}

Cada indicador contribui com pontos para `confluenceScore`. Sinal LONG = positivo, SHORT = negativo.

| Indicador | Condição LONG | Peso LONG | Condição SHORT | Peso SHORT |
|---|---|---|---|---|
| RSI 15m | RSI < 30 (oversold) | +2 | RSI > 70 (overbought) | -2 |
| RSI 1h | RSI < 30 | +2 | RSI > 70 | -2 |
| RSI 4h | RSI < 30 | +2 | RSI > 70 | -2 |
| EMA 200 (1h) | Preço > EMA 200 | +1.5 | Preço < EMA 200 | -1.5 |
| EMA 200 (4h) | Preço > EMA 200 | +1.5 | Preço < EMA 200 | -1.5 |
| VWAP | Preço > VWAP | +1.5 | Preço < VWAP | -1.5 |
| MACD 1h | Histograma > 0 E MACD > Signal | +1.5 | Histograma < 0 E MACD < Signal | -1.5 |
| MACD 4h | Idem | +1.5 | Idem | -1.5 |
| ADX 1h | ADX > 25 E +DI > −DI | +1 | ADX > 25 E −DI > +DI | -1 |
| Stochastic 1h | K < 20 E K > D | +1 | K > 80 E K < D | -1 |
| Net Volume 1h | delta > 0 E ratio > 0.1% | +1.5 | delta < 0 E ratio < −0.1% | -1.5 |
| Net Volume 4h | Idem | +1.5 | Idem | -1.5 |
| Liquidações | >55% shorts em risco | +1 | >55% longs em risco | -1 |

**Score máximo teórico puro: ±20 pontos** (só pela grade de confluência)

---

## 7. Order Flow & Microestrutura {#order-flow}

Estes indicadores compõem o `orderFlowScore`, somado ao confluence score após ajuste contextual.

### Funding Rate
| Valor | Sinal | Score |
|---|---|---|
| > +0.05% | Bearish (muito comprado) | -1 |
| +0.01% a +0.05% | Levemente Bearish | -0.5 |
| -0.01% a 0 | Neutro | 0 |
| < -0.01% | Bullish (muito vendido) | +1 |
| < -0.05% | Muito Bullish | +1.5 |

### Open Interest
- Variação calculada vs klines 1h  
- OI subindo >5% = novo dinheiro entrando (confirma tendência)  
- OI caindo <-5% = dinheiro saindo (enfraquece movimento)  
- Não tem score direto no total — é informativo  

### CVD Simples (calculateCVD)
Calcula a pressão líquida de 500 trades recentes:
| Condição | Sinal | Score |
|---|---|---|
| delta > 0 E trend = up | Bullish | +1 |
| delta < 0 E trend = down | Bearish | -1 |
| delta > 0 E trend = down | Absorção Bullish (compradores absorvendo venda) | +1.5 |
| delta < 0 E trend = up | Absorção Bearish (vendedores absorvendo compra) | -1.5 |

### Order Book Imbalance
- Calcula `ratio = bidVolume / askVolume` (top 100 de cada lado)  
| Ratio | Sinal | Score |
|---|---|---|
| > 1.5 | Bid Heavy (mais compra) | +1 |
| < 0.67 | Ask Heavy (mais venda) | -1 |
| Entre 0.67 e 1.5 | Neutro | 0 |

### Long/Short Ratio (Contrarian)
| L/S Ratio | Sinal | Score |
|---|---|---|
| > 1.5 (muitos longs) | SHORT contrarian | -1 |
| < 0.67 (muitos shorts) | LONG contrarian | +1 |

### RSI standalone (1h)
| RSI | Sinal | Score |
|---|---|---|
| < 30 | Oversold | +1 |
| > 70 | Overbought | -1 |

### Liquidation Heatmap (estimado)
Analisa taker buy/sell das últimas 24h + bid/ask volume:
| Condição | Dominância | Score |
|---|---|---|
| bidAskRatio > 1.3 E buySellRatio > 1.1 | Shorts em risco | +1.5 |
| bidAskRatio < 0.7 E buySellRatio < 0.9 | Longs em risco | -1.5 |
| buyPressure > sellPressure × 1.2 | Compradores dominam | +1 |
| sellPressure > buyPressure × 1.2 | Vendedores dominam | -1 |

### Liquidações Reais (Binance Force Orders)
- Dados diretos de `/fapi/v1/allForceOrders` (últimas 100 liquidações)  
- Separa long liq vs short liq por volume  
- Se >55% long liq → mais longs sendo eliminados → bearish sinal  
- Se >55% short liq → squeeze possível → bullish sinal  

---

## 8. Volume Profile {#volume-profile}

Calculado sobre klines 1h:

- **POC (Point of Control)**: nível de preço com maior volume negociado  
- **VAH (Value Area High)**: limite superior da "value area" (70% do volume)  
- **VAL (Value Area Low)**: limite inferior da "value area"  

### Localização do preço vs Value Area

| Localização | Significado | Score |
|---|---|---|
| Preço > VAH | Caro, acima do valor | -1 |
| Preço < VAL | Barato, abaixo do valor | +1 |
| POC < Preço < VAH | Parte superior do intervalo | -0.5 |
| VAL < Preço < POC | Parte inferior do intervalo | +0.5 |

O POC também serve como referência para TP1 nos Dynamic Targets.

---

## 9. Análise Gráfica Multi-Timeframe {#analise-grafica}

Função: `analyzeChartPatterns(klines1m, klines5m, klines15m, klines1h, currentPrice)`

### Timeframes e Pesos

| TF | Peso na Confluência |
|---|---|
| 1m | 0.5 |
| 5m | 1.0 |
| 15m | 1.5 |
| 1h | 2.0 |

### O que é calculado por timeframe (analyzeTimeframe):
1. **EMA 8 e EMA 21** — direção da tendência  
2. **Cruzamento EMA**: GOLDEN CROSS, DEATH CROSS, CRUZANDO_ALTA, CRUZANDO_BAIXA  
3. **Momentum** = variação % das últimas 5 velas  
4. **HH / HL / LL / LH** contagem nas últimas 10 velas  
5. **Volume trend**: AUMENTANDO (>120% da média), DIMINUINDO (<80%), ESTÁVEL  

### Padrões de Candlestick detectados (última vela)

| Padrão | Condição de Detecção | Bias |
|---|---|---|
| Doji | Corpo < 10% da range total | Neutro |
| Martelo | Sombra inferior > 2× corpo, sombra superior < 0.5× corpo | Alta |
| Shooting Star | Sombra superior > 2× corpo, sombra inferior < 0.5× corpo | Baixa |
| Engolfo de Alta | Vela bullish engolfa vela bearish anterior | Alta |
| Engolfo de Baixa | Vela bearish engolfa vela bullish anterior | Baixa |
| Pin Bar Alta | Sombra inferior > 60% da range E corpo < 20% | Alta |
| Pin Bar Baixa | Sombra superior > 60% da range E corpo < 20% | Baixa |
| Marubozu Alta | Corpo > 90% da range (bullish) | Alta |
| Marubozu Baixa | Corpo > 90% da range (bearish) | Baixa |
| 3 Soldados (Three White Soldiers) | 3 velas bullish consecutivas crescentes | Alta |
| 3 Corvos (Three Black Crows) | 3 velas bearish consecutivas decrescentes | Baixa |
| Morning Star | Vela bearish + doji/pequena + vela bullish confirmadora | Alta |
| Evening Star | Vela bullish + doji/pequena + vela bearish confirmadora | Baixa |

### Sinal Final do Timeframe
- `emaTrend = ALTA` E `momentum > 0.05%` → LONG, strength = f(momentum, HH, HL, padrões)  
- `emaTrend = BAIXA` E `momentum < -0.05%` → SHORT  
- Desacordo: padrões de candlestick desempatam  
- Volume AUMENTANDO: +15 no strength  
- Normalização: `confluenceScore = (Σ score ponderado / peso total) × 2`  

### Key Levels
- Pivot Highs e Lows identificados sobre klines1h (suporte/resistência dentro de ±10% do preço atual)  
- Máximo 3 suportes e 3 resistências  

---

## 10. Módulo V2 — Engine Institucional {#modulo-v2}

Todo o código está em `www/ta-engine-v2.js`, encapsulado em IIFE, exportado para `window.TAEngineV2`.

---

### 10a. Regime de Mercado {#regime-mercado}

**Função**: `detectMarketRegime(klines1h, klines4h, adx1h, adx4h, volumeProfile, currentPrice)`

Usa ADX + Bollinger Bandwidth para classificar o mercado em 5 regimes:

| ADX | BB Width Percentile | Regime | Ícone |
|---|---|---|---|
| > 35 | Alto | TRENDING_UP ou TRENDING_DOWN | ⭐ |
| > 25 | Moderado | TRENDING_UP ou TRENDING_DOWN | ↗ / ↘ |
| < 20 | Baixo | RANGING | ↔ |
| < 20 | Baixíssimo (squeeze) | ACCUMULATION ou DISTRIBUTION | 📦 / 📤 |
| Qualquer | Extremamente baixo | SQUEEZE detectado | 🗜 |

- **BB Width Percentile**: calculado comparando BB Width atual vs últimas 100 velas  
- **ACCUMULATION**: preço próximo ao VAL (range inferior) — mãos fortes acumulando  
- **DISTRIBUTION**: preço próximo ao VAH (range superior) — mãos fortes distribuindo  
- `isTrending` = true quando regime é TRENDING_UP ou TRENDING_DOWN  
- `isRange` = true quando RANGING/ACCUMULATION/DISTRIBUTION  

---

### 10b. Estrutura de Mercado (BOS/CHoCH) {#estrutura-mercado}

**Função**: `detectMarketStructure(klines1h, klines4h, currentPrice)`

#### Detecção de Swing Points
- Lookback = 5 candles  
- **Swing High**: máximo local superior a todos os 5 vizinhos  
- **Swing Low**: mínimo local inferior a todos os 5 vizinhos  

#### BOS (Break of Structure)
- Preço rompe acima do último Swing High → BOS bullish (tendência continua)  
- Preço cai abaixo do último Swing Low → BOS bearish  

#### CHoCH (Change of Character)
- Após sequência de BOS bearish, preço rompe Swing High → CHoCH bullish (início de reversão)  
- Após sequência de BOS bullish, preço cai do Swing Low → CHoCH bearish  

#### Liquidity Sweeps (Varredura de Liquidez)
- Últimas 5 velas verificadas vs Swing Highs/Lows identificados  
- Se vela ultrapassou nível e voltou = sweep detectado  
- Sweep acima = bullish (stop hunt de shorts)  
- Sweep abaixo = bearish (stop hunt de longs)  

#### Score de Estrutura
- BOS bullish → +1.5  
- CHoCH bullish → +2.5 (maior peso — reversão)  
- BOS bearish → -1.5  
- CHoCH bearish → -2.5  
- Liquidity sweep bullish → +0.5  

---

### 10c. CVD Avançado {#cvd-avancado}

**Função**: `calculateCVDAdvanced(trades, klines1h, currentPrice)`

Trabalha sobre os 500 trades mais recentes.

#### Processamento dos Trades
- Cada trade: `isBuyerMaker = true` → taker é vendedor (sell aggressive)  
- CVD acumulado = Σ(buyVolume) − Σ(sellVolume) ao longo do tempo  

#### Divergência (CVD vs Preço)
- Calcula slope linear de preço e slope do CVD nas últimas N amostras  
- `divergência bullish` = preço caindo mas CVD subindo (compradores acumulando)  
- `divergência bearish` = preço subindo mas CVD caindo (vendedores absorvendo)  

#### Absorção
- Se variação % do preço < 0.1% (preço estagnado) mas |delta CVD| é grande → absorção  
- Absorção bullish: vendas sendo absorvidas por compradores  
- Absorção bearish: compras sendo absorvidas por vendedores  

#### Breakout de CVD
- CVD ultrapassa ±2 desvios padrão da média → breakout confirmado  

---

### 10d. Bollinger Bands {#bollinger}

**Função**: `calculateBollingerBands(klines, period=20, stdDev=2)`

- **Upper Band** = SMA20 + 2×σ  
- **Middle Band** = SMA20  
- **Lower Band** = SMA20 − 2×σ  
- **BB Width** = (Upper − Lower) / Middle  
- **BB Width Percentile** = posição do BB Width atual vs histórico de 100 candles  
- **%B** = (Preço − Lower) / (Upper − Lower) → 0 = bordo inferior, 1 = bordo superior  

---

### 10e. Volatilidade Metrics (ATR) {#volatilidade}

**Função**: `calculateVolatilityMetrics(klines1h, klines4h, klines1d)`

Calcula ATR 14 para 3 timeframes:
- `atr1h` = ATR de 14 períodos em 1h  
- `atr4h` = ATR de 14 períodos em 4h  
- `atr1d` = ATR de 14 períodos em 1d  

#### Regime de Volatilidade (baseado em BB Width Percentile)
| BB Width Percentile | Regime | Score de Penalidade |
|---|---|---|
| < 10% | SQUEEZE | Bônus ±1.5 na scoring |
| < 25% | LOW | Sem penalidade |
| 25-75% | NORMAL | Sem penalidade |
| 75-90% | HIGH | Sem penalidade |
| > 90% | EXTREME | -1 (penalidade de volatilidade extrema) |

---

### 10f. Macro & Notícias Layer {#macro-noticias}

**Função**: `fetchMacroNewsLayer()`

#### FMP Economic Calendar
- Busca eventos de alto e médio impacto  
- Eventos com impacto **High**: `macroScore += 1` (bull) ou `-1` (bear, dependendo do tipo: CPI, taxa, etc.)  
- Sem acesso ao resultado real do evento (apenas antecipação)  

#### CryptoPanic News
- Busca últimas 50 notícias  
- Palavras-chave bearish: "war", "ban", "hack", "crash", "fear", "dump", "sell", "regulation"  
- Palavras-chave bullish: "etf", "adoption", "launch", "partnership", "buy", "bull", "approve"  
- Score por notícia: +0.5 (bullish) ou -0.5 (bearish)  
- `macroScore` = Σ scores, clampeado entre -5 e +5  

O macroScore final é adicionado ao totalScore após `generateTechnicalAnalysis()`.

---

### 10g. Big Tech & Macro Global {#big-tech-macro}

**Função**: `fetchBigTechAndMacro()`

#### Ativos Buscados (Yahoo Finance)
| Tipo | Símbolo | Significado |
|---|---|---|
| Big Tech | AAPL | Apple |
| Big Tech | MSFT | Microsoft |
| Big Tech | TSLA | Tesla |
| Big Tech | META | Meta |
| Big Tech | NVDA | Nvidia |
| Índice | ^GSPC | S&P 500 |
| Índice | ^VIX | Volatilidade (Fear Index) |
| Moeda | DX-Y.NYB | Dólar Index (DXY) |
| Yield | ^IRX | Treasury 3 meses |
| Yield | ^FVX | Treasury 5 anos |
| Yield | ^TNX | Treasury 10 anos |
| Yield | ^TYX | Treasury 30 anos |

#### Fear & Greed Index (alternative.me)
- Escala 0-100: `0-24 = Extreme Fear`, `25-44 = Fear`, `45-55 = Neutral`, `56-74 = Greed`, `75-100 = Extreme Greed`  

#### World Bank
- CPI (inflação anual EUA)  
- Taxa de Desemprego EUA  
- Cache de 24h (dado pouco volátil)  

#### Lógica de Scoring BigTech

**VIX (Fear Index)**:
| VIX | Impacto bigTechScore |
|---|---|
| > 30 | -2 (alto medo, risk-off) |
| > 25 | -1 |
| < 15 | +1 (baixo medo, risk-on) |

**DXY (Dólar Index)**:
| DXY Change | Impacto |
|---|---|
| Subindo >0.5% | -1 (dólar forte = pressão em cripto) |
| Caindo >0.5% | +1 (dólar fraco = bom para cripto) |

**S&P 500**:
| SP500 Change | Impacto |
|---|---|
| Subindo >1% | +1 (risk-on) |
| Caindo >1% | -1 (risk-off) |

**Big Tech (media de variação de AAPL, MSFT, TSLA, META, NVDA)**:
| Variação média | Impacto |
|---|---|
| > +1% | +1.5 (tech rally = risk-on) |
| > +0.3% | +0.5 |
| < -1% | -1.5 |
| < -0.3% | -0.5 |

**Curva de Juros (Yield Curve)**:
- Inversão = taxa 3 meses > taxa 10 anos → score -1 (recessão iminente)  
- Normalização = taxa 10 anos > taxa 3 meses → score +0.5  

#### Badge Bigtech Sentiment (UI)
- Soma total → badge exibe: **POSITIVO** (>+1.5), **NEGATIVO** (<-1.5), **RISK-ON** (+0.5 a +1.5), **RISK-OFF** (-0.5 a -1.5)  
- Sem emojis (removidos na última versão)  

---

### 10h. Contextual Scoring (não-linear) {#contextual-scoring}

**Função**: `applyContextualScoring(confluenceDetails, marketRegime, marketStructure, cvdAdvanced, null, volatilityMetrics)`

Ajusta os pesos de cada indicador dependendo do regime atual:

#### Ajustes por Regime

| Indicador | TRENDING (up/down) | RANGING |
|---|---|---|
| RSI | ×0.3 (contra-tendência menos confiável) | ×1.5 (reversão mais confiável) |
| EMA 200 | ×1.5 (tendência confirma) | ×1.0 |
| MACD | ×1.3 (momentum em tendência) | ×1.0 |
| Stochastic | ×0.5 (em tendência = menos relevante) | ×1.5 (range = mais relevante) |
| Volume | ×1.2 sempre | ×1.0 |

#### Adições pela V2 Engine
- **Score de Estrutura** (`marketStructure.structureScore`) adicionado diretamente  
- **CVD Avançado** (`cvdAdvanced.score`) adicionado  
- **Penalidade de Volatilidade**: se regime = EXTREME → score `-1`  
- **Squeeze Bonus**: se squeeze detectado → ±1.5 na direção do sinal  

---

### 10i. Dynamic Targets (TP1/TP2/TP3) {#dynamic-targets}

**Função**: `calculateDynamicTargets(signalType, currentPrice, atr1h, atr4h, poc, vah, val)`

Para sinal LONG:
| Nível | Fórmula | Significado |
|---|---|---|
| Entry | currentPrice | Entrada ao mercado |
| SL | VAL − (ATR1h × 1.5) | Stop abaixo da Value Area + buffer ATR |
| TP1 | POC | Point of Control (alvo de mínima resistência) |
| TP2 | VAH | Value Area High (alvo principal) |
| TP3 | Entry + (ATR4h × 4) | Alvo extenso de alta volatilidade |
| R:R1 | (TP1−Entry)/(Entry−SL) | — |
| R:R2 | (TP2−Entry)/(Entry−SL) | — |
| R:R3 | (TP3−Entry)/(Entry−SL) | — |

Para sinal SHORT: espelhado (SL acima de VAH, TP1 = POC, TP2 = VAL, TP3 = Entry − ATR4h×4)

**Fallback** (se V2 não disponível):
- SL = `max(VAL, currentPrice − ATR×1.5)` para long  
- TP = `currentPrice + ATR×3`  
- R:R = `(TP−Entry) / (Entry−SL)`  

---

### 10j. Liquidation Model {#liquidation-model}

**Função**: `improvedLiquidationModel(fundingRate, ...)`

Estima leverage dominante com base no Funding Rate:

| Funding Rate (abs) | Leverage Estimado | Interpretação |
|---|---|---|
| < 0.01% | 3x | Mercado conservador |
| 0.01% - 0.03% | 5x | Alavancagem leve |
| 0.03% - 0.07% | 10x | Alavancagem moderada |
| 0.07% - 0.15% | 20x | Alta especulação |
| > 0.15% | 50-100x | Mercado extremamente alavancado |

Gera os preços de liquidação para cada lever estimada:
- Long: `entry × (1 − 0.9/leverage)`  
- Short: `entry × (1 + 0.9/leverage)`  

---

## 11. Módulo V3 — Advanced Trading Intelligence Engine {#modulo-v3}

> **Arquivo:** `www/ta-engine-v3.js` (1.701 linhas)  
> **Export:** `window.TAEngineV3` (IIFE)  
> **Versão:** 3.0.0

O Engine V3 é uma camada de **pós-processamento** que recebe a análise completa do V1+V2 e a aprimora com 13 módulos avançados. Resolve 12 falhas estruturais identificadas por auditoria:

| Falha Original | Módulo V3 que Resolve |
|---|---|
| Soma linear (compra em crash) | Crash Detector + Non-Linear Score |
| Redundância de indicadores | Decorrelation Engine |
| Pesos heurísticos fixos | Adaptive Weight Engine |
| Sem backtesting | Virtual Trade Tracker |
| Sem position sizing | Position Sizing (Kelly Criterion) |
| Sem on-chain | On-Chain Analyzer |
| Visão tunnel (Binance) | Multi-Exchange CVD |
| Sem edge medido | Edge Calculator |
| Macro rasa | Rolling Correlation |
| BOS falso | BOS Validation |
| Sem warnings | System Limitations |
| Regime fraco | Enhanced Regime Detector |

### 11a. Crash / Black Swan Detector {#crash-detector}

**Detecta movimentos rápidos de preço** que invalidam osciladores.

**Rate of Change (RoC)** calculado em 4 janelas:
- 5 minutos (klines 1m × 5)
- 30 minutos (klines 5m × 6)
- 1 hora (klines 15m × 4)
- 4 horas (klines 1h × 4)

**Tabela de Severidade:**

| RoC 5min | RoC 30min | RoC 1h | RoC 4h | Severidade |
|---|---|---|---|---|
| >8% | >12% | >15% | >20% | BLACK_SWAN |
| >5% | >8% | >10% | >15% | SEVERE |
| >3% | >5% | >7% | >10% | MODERATE |
| >1.5% | >3% | >4% | – | MINOR |

**Overrides durante crash:**
- `suppressOscillatorBuy = true` → RSI, Stoch, MACD "LONG" multiplicados por 0.1
- `trendWeightMultiplier = 1.5 + severity × 0.3` → EMA/ADX amplificados
- `confidencePenalty = severity × 5` → reduz confiança geral
- Padrão de liquidação em cascata detectado quando: 4+ velas vermelhas consecutivas + volume spike

### 11b. Indicator Decorrelation Engine {#decorrelation}

**Agrupa indicadores por família** e limita sinais efetivos por grupo:

| Família | Indicadores | Max Sinais Efetivos |
|---|---|---|
| MOMENTUM | RSI (15m/1h/4h), Stochastic 1h, MACD (1h/4h) | 2 |
| TREND | EMA 200 (1h/4h), ADX 1h | 2 |
| VOLUME | Net Volume (1h/4h) | 2 |
| PRICE | VWAP | 1 |
| LEVERAGE | Liquidações Estimadas | 1 |

**Algoritmo:**
1. Classifica cada indicador em sua família
2. Dentro de cada família, ordena por |peso| (mais forte primeiro)
3. Mantém os `maxEffectiveSignals` mais fortes com peso integral
4. Reduz os excedentes para 40% do peso original (`decay = 0.4`)
5. Aplica overrides de crash (MOMENTUM × 0.1 se crash + sinal oposto)

### 11c. Adaptive Weight Engine (Online Learning) {#adaptive-weights}

**EWMA (Exponential Weighted Moving Average)** de acurácia por indicador.

- **Alpha:** 0.05 (suavização)
- **Mínimo de sinais:** 5 antes de aplicar
- **Fórmula:** `weight_multiplier = 0.5 + ewmaAccuracy` (range 0.5-1.5)
- **Storage:** localStorage com prefixo `vc3_adaptive_{symbol}`
- **Atualização:** após avaliação de cada trade virtual (win→accuracy sobe, loss→desce)

### 11d. Position Sizing Engine (Kelly Criterion) {#position-sizing}

**Saída:** Recomendação de % da banca para o trade.

**Fórmula:**
```
size = Kelly½ × confMultiplier × crashMultiplier × edgeMultiplier
Kelly½ = max(0, (p×b - q) / (2×b))
  onde p = winRate, q = 1-p, b = avgWin/avgLoss
confMultiplier = clamp(confidence / 70, 0.3, 1.5)
crashMultiplier = 0.25 (crash) | 0.5 (moderate) | 1.0 (normal)
edgeMultiplier = 1.2 (edge>3%) | 0.5 (edge<-1%) | 1.0 (default)
```

**Range final:** 0.5% a 15% da banca.

**Níveis de risco:**
| Size | Nível | Ícone |
|---|---|---|
| ≤2% | CONSERVADOR | 🟢 |
| ≤5% | MODERADO | 🟡 |
| ≤10% | AGRESSIVO | 🟠 |
| >10% | MÁXIMO | 🔴 |

### 11e. Virtual Trade Tracker & Forward Tester {#virtual-tracker}

**Design:** Salva cada sinal gerado e avalia o resultado automaticamente.

**Fluxo:**
1. A cada análise com sinal ≠ NEUTRO, salva `{ timestamp, symbol, signal, entry, SL, TP1/2/3, score, regime }`
2. Evita duplicatas (30min cooldown por símbolo)
3. Limite: 200 trades por símbolo em localStorage
4. Avaliação: utiliza klines 1h para verificar se TP/SL foram atingidos
5. Timeout: após 24h sem TP/SL, avalia ao preço atual

**Classificação de outcomes:**
- `WIN_TP1` / `WIN_TP2` / `WIN_TP3` / `WIN_TIME` → vitória
- `LOSS` / `LOSS_TIME` → derrota
- Registra `maxFavorableExcursion` e `maxAdverseExcursion`

**Métricas calculadas:**
- Win Rate, Avg Win PnL, Avg Loss PnL
- Profit Factor = (WR × AvgWin) / ((1-WR) × AvgLoss)
- Edge = WR × AvgWin/100 - (1-WR) × AvgLoss/100
- Expectancy = WR × AvgWin - (1-WR) × AvgLoss
- Max Drawdown (sequencial), Sharpe Ratio aproximado
- Breakdown por regime e por score bucket (4-6, 6-10, 10+)

### 11f. On-Chain Analyzer {#on-chain}

**Disponível para:** BTC e ETH apenas.

**APIs utilizadas (gratuitas):**
| API | Dado | Endpoint |
|---|---|---|
| blockchain.info | Mempool size | `/charts/mempool-size?timespan=2days` |
| blockchain.info | Hash rate (30d) | `/charts/hash-rate?timespan=30days` |
| blockchain.info | TX volume USD | `/charts/estimated-transaction-volume-usd?timespan=7days` |
| CoinGecko | USDT market cap | `/simple/price?ids=tether&include_market_cap=true` |

**Scoring:**
- Mempool congestionado (+50%) → -0.5
- Mempool descongestionando (-30%) → +0.5
- Hash rate subindo (+5%) → +1
- Hash rate caindo (-5%) → -1
- Stablecoin supply crescendo (+1%) → +1
- Stablecoin supply encolhendo (-1%) → -1
- **Range:** -3 a +3

### 11g. Multi-Exchange Aggregated CVD {#multi-exchange}

**Resolve:** "Visão tunnel da Binance"

**Exchanges consultadas:**
| Exchange | API | Endpoint |
|---|---|---|
| Bybit | v5 | `/market/recent-trade?category=linear&limit=500` |
| OKX | v5 | `/market/trades?instId={SYMBOL}-USDT-SWAP&limit=100` |
| Binance | (já existente no V1) | CVD das recent trades |

**Detecção de divergência:** Se Binance e Bybit têm deltas opostos → `divergence = true` → score × 0.5.

**Sinal agregado:** BULLISH se ratio > 5%, BEARISH se < -5%, NEUTRO no meio.

### 11h. Edge Calculator (Statistical Edge) {#edge-calculator}

**Fórmula:** `Edge = (WinRate × AvgWin) - (LossRate × AvgLoss)`

**Classificações:**
| Edge | Classificação | Ícone |
|---|---|---|
| >5% | FORTE | 🏆 |
| >2% | MODERADO | ✅ |
| >0% | FRACO | ⚠️ |
| <0% | NEGATIVO | ❌ |
| <5 trades | INSUFICIENTE | 📊 |

### 11i. Rolling Correlation Engine {#rolling-correlation}

**Calcula correlação de Pearson** entre retornos diários de BTC e SP500 (30 dias).

**Regimes de correlação:**
| |r| | Regime | Macro Multiplier |
|---|---|---|
| >0.7 | HIGH | 1.5× |
| >0.4 | MODERATE | 1.2× |
| >0.2 | LOW | 0.8× |
| ≤0.2 | DECORRELATED | 0.5× |

**Impacto:** O `macroWeightMultiplier` escala o peso de scores macro/bigtech no score final.

### 11j. Non-Linear Scoring Engine {#non-linear-score}

**A inovação central do V3.** Substitui a soma linear por compressão tanh.

**Fórmula matemática completa:**
```
RawScore = DecorrelatedScore + OrderFlowScore 
         + (MacroScore + BigTechScore) × macroMultiplier
         + OnChainScore + MultiExchangeScore

// Crash override
if (crash && score oposto ao crash):
    RawScore × 0.2

// Compressão não-linear (diminishing returns)
S_final = 35 × tanh(RawScore / 20)

// Threshold dinâmico
threshold = crash ? 6 : 4
```

**Propriedades da tanh:**
- Score ±5 → comprime para ±8.6 (quase linear)
- Score ±15 → comprime para ±23 (desaceleração)
- Score ±30 → comprime para ±34 (quase saturado)
- **Nunca excede ±35** independente de quantos indicadores concordam

**Sinal final:** LONG se S ≥ threshold, SHORT se S ≤ -threshold, NEUTRO no meio.

### 11k. Enhanced Regime Detector {#enhanced-regime}

**Melhorias sobre o V2:**
1. **Volume confirma regime:** ADX diz tendência + volume caindo = FALSO (alto risco de falso breakout)
2. **Squeeze direction prediction:** OBV + distribuição de volume acima/abaixo do preço → probabilidade direcional
3. **Regime transition:** Detecta transições 1h vs 4h (ENTERING_TREND, ENTERING_RANGE, SQUEEZING)
4. **Confidence reduzida em crash:** Regime detection → 30% de confiança durante crash

### 11l. BOS Validation (False Breakout Detector) {#bos-validation}

**Valida sinais de Break of Structure** do V2 com 3 confirmações:

| Confirmação | Critério |
|---|---|
| Volume | Volume da vela de breakout > 1.3× média |
| Fechamento | Close na direção do breakout (bullish close para BOS bullish) |
| CVD | Delta na direção (buy > sell×1.2 para bullish BOS) |

**Classificação:**
- **REAL** (3/3): Score integral
- **FAKE_SWEEP** (0-1/3): Score invertido × -0.5 (contra-sinal!)
- **UNCONFIRMED** (2/3): Score × 0.3

**Se V2 detectou liquiditySweep + BOS não confirmado → FAKE_SWEEP com score × -0.3.**

### 11m. System Limitations & Context-Aware Warnings {#system-warnings}

**Gera avisos dinâmicos** baseados no contexto atual:

| Warning | Condição | Severidade |
|---|---|---|
| Crash/Pump Extremo | crashState.isCrash | CRITICAL |
| Volatilidade Extrema | volRegime === 'EXTREME' | HIGH |
| Falso Rompimento | falseBreakoutRisk === 'HIGH' | HIGH |
| Edge Negativo | edge < -1% com 10+ trades | HIGH |
| Falsa Confluência | 8+ indicadores alinhados | MEDIUM |
| Horário FOMC | 18-19h UTC | MEDIUM |
| Dados Desatualizados | >10min desde última análise | MEDIUM |
| Visão Limitada | Bybit data indisponível | LOW |

---

## 12. Módulo V4 — Reactive Intelligence Engine (v7.2.0) {#modulo-v4}

O **ta-engine-v4.js** é a camada final do pipeline de análise. Recebe os outputs de V2 e V3 e aplica um sistema de **9 gates regime-adaptivos** que modulam a confiança final do sinal. Introduzido na v7.0 e significativamente refatorado na **v7.2.0** com 17 mudanças arquiteturais.

**Arquivo:** `www/ta-engine-v4.js` — 4.678 linhas  
**Versão atual:** 7.2.0  
**Entry point:** `enhanceWithReactive(analysis, rawData)`

### Filosofia do V4

```
V2 (score bruto + regime + BOS + targets)
  │
  ▼
V3 (crash detector, decorrelation, adaptive weights, edge, on-chain)
  │
  ▼
V4 (9 gates → soft adjustments → confiança calibrada → módulos finais)
```

O V4 **não substitui** V2/V3 — ele **refina** o score via:
1. **Gates** que devem ser "passados" para o sinal ser válido
2. **Soft adjustments** que somam/subtraem da confiança (±25 cap)
3. **Módulos enrichment** que adicionam contexto extra (liquidez, divergência, exit plan, etc.)

---

### 12a. Arquitetura de 9 Gates {#9-gates}

O sistema de gates é o coração do V4. Cada gate retorna `true/false` + um score parcial. O `gateScore` acumulado determina se o sinal é aceito.

| Gate | Nome | O que avalia | Score máx |
|------|------|-------------|-----------|
| 1 | **Trend Alignment** | Regime + direção do sinal | 2.0 |
| 2 | **Volume Confirmation** | Volume relativo da vela | 2.0 |
| 3 | **Order Flow Agreement** | CVD + book delta na direção | 2.0 |
| 4 | **MultTF Consensus** | Confluência 1h + 4h | 2.0 |
| 5 | **Funding Sentiment** | Funding rate (4 tiers) | 1.5 |
| 6 | **Volatility Regime** | ATR + volRegime check | 1.5 |
| 7 | **BOS Validation** | Break of Structure contínuo | 2.0 |
| 8 | **Risk/Reward** | TP1/SL ratio mínimo | 1.5 |
| 9 | **Acceptance** | Candle fecha acima/abaixo nível | 1.0 |

**Threshold de aceitação:** `gateScore ≥ requiredGateScore(regime)`

```
regimeThresholds = {
  VOLATILE: 4.5,   // mais rígido
  TREND:    3.0,   // mais flexível em tendência
  RANGE:    4.0,
  SQUEEZE:  3.5,
  DEFAULT:  4.0
}
```

---

### 12b. Regime-Adaptive Weights {#regime-weights}

Cada gate tem seu peso modulado pelo regime de mercado atual. Isso permite que o sistema seja **mais exigente** em mercados laterais/voláteis e **mais flexível** em tendências claras.

**Mapa de pesos por regime:**

| Gate | TREND | VOLATILE | RANGE | SQUEEZE | DEFAULT |
|------|-------|----------|-------|---------|---------|
| Trend Alignment | 1.5 | 0.8 | 1.0 | 1.0 | 1.0 |
| Volume | 1.0 | 1.5 | 1.2 | 1.3 | 1.0 |
| Order Flow | 1.2 | 1.3 | 1.0 | 1.0 | 1.0 |
| MultTF | 1.3 | 0.7 | 1.0 | 1.0 | 1.0 |
| Funding | 0.8 | 1.2 | 1.0 | 1.0 | 1.0 |
| Volatility | 0.7 | 1.5 | 1.0 | 1.2 | 1.0 |
| BOS | 1.3 | 0.9 | 1.2 | 1.0 | 1.0 |
| Risk/Reward | 1.0 | 1.2 | 1.0 | 1.1 | 1.0 |
| Acceptance | 1.0 | 1.0 | 1.0 | 1.0 | 1.0 |

---

### 12c. Sistema Centralizado de Soft Adjustments (±25) {#soft-adjustments}

**Mudança central da v7.2.0.** Antes, ~12 ajustes de confiança pós-gate estavam espalhados pelo código, cada um com seu próprio `clamp()`. Agora existe um **array centralizado** que coleta todos os ajustes e aplica uma vez só.

**Funcionamento:**

```javascript
const softAdjustments = [];

// Cada módulo adiciona um ajuste:
softAdjustments.push({ source: 'regime_align', delta: +5 });
softAdjustments.push({ source: 'liquidity_near', delta: -3 });
softAdjustments.push({ source: 'hidden_div', delta: +4 });
// ... até ~15 fontes possíveis

// Aplicação final:
const rawSoftTotal = softAdjustments.reduce((s, a) => s + a.delta, 0);
const cappedSoftTotal = clamp(rawSoftTotal, -25, +25);
confidence = clamp(confidence + cappedSoftTotal, 0, 100);
```

**Fontes de soft adjustments:**

| Fonte | Delta | Condição |
|-------|-------|----------|
| Regime alignment | +3 a +5 | Regime favorece direção |
| Regime misalignment | −5 | Regime contra sinal |
| Strong trend | +5 | Trend Alignment gate forte |
| Volume surge | +3 | Volume > 2× média |
| Funding OK | +2 | Funding favorece |
| Funding penalty | −3 a −15 | Funding adverso (gradual) |
| Edge positivo | +3 | Edge > 1% |
| Edge negativo | −5 | Edge < −1% |
| Macro favorável | +2 a +3 | DXY/VIX confirmam |
| Crash state | −10 | crashDetector ativo |
| Liquidity levels | −3 a +3 | Proximidade de pools |
| Hidden divergence | +4 | Divergência oculta confirmada |
| Signal age | −2 a −8 | TTL decaying |
| High decorrelation | +3 | Sinais independentes |
| Low decorrelation | −4 | Sinais redundantes |

**Cap ±25:** Nenhuma combinação de ajustes ultrapassa 25 pontos positivos ou negativos, evitando overshoot.

---

### 12d. Penalidade de Redundância (Worst-Penalty) {#redundancy-v4}

**Antes (v7.1):** Fazia média das penalidades de sobreposição.  
**Agora (v7.2):** Usa **worst-penalty** como base + 2% por sobreposição adicional.

```javascript
function applyRedundancyPenalty(indicators) {
  const overlaps = findOverlappingIndicators(indicators);
  if (overlaps.length === 0) return indicators;

  // Pega a MAIOR penalidade individual
  const worstPenalty = Math.max(...overlaps.map(o => o.penalty));

  // Adiciona 2% por cada sobreposição extra
  const totalPenalty = worstPenalty + (overlaps.length - 1) * 0.02;

  // Aplica aos pesos dos indicadores redundantes
  overlaps.forEach(o => {
    o.indicator.weight *= (1 - totalPenalty);
  });
}
```

**Exemplo:** Se RSI e Stochastic RSI ambos dizem "sobrecomprado" (overlap), e RSI + CCI também se sobrepõem:
- Worst penalty = max(0.30, 0.20) = 0.30
- Total = 0.30 + (2−1) × 0.02 = 0.32
- Pesos dos indicadores redundantes × 0.68

---

### 12e. Calibração Piecewise {#calibracao-piecewise}

**Antes (v7.1):** Usava sigmoid logística para mapear confiança bruta → calibrada.  
**Agora (v7.2):** Usa **função piecewise de 3 segmentos** que é mais previsível e interpretável.

```
calibrateConfidence(raw):
  Se raw ≤ 30:   → raw × 0.5          // Sinais fracos: mantém baixo
  Se raw ≤ 70:   → 15 + (raw-30) × 1.0  // Zona média: linear 1:1
  Se raw > 70:   → 55 + (raw-70) × 0.6  // Sinais fortes: comprime
```

**Gráfico:**
```
Calibrada
  80 │                         ╱╱╱
  60 │                    ╱╱╱╱
  40 │               ╱╱╱╱
  20 │          ╱╱╱╱
  10 │    ╱╱╱
   0 ├───┬───┬───┬───┬───┬───┬───
     0   20  30  40  50  60  70  80  100  Raw
```

**Vantagens sobre sigmoid:**
- Linear na zona média (30-70) = mais sensível onde importa
- Comprime extremos sem platô artificial
- Fácil de tunar (3 coeficientes vs sigmoid opaca)

---

### 12f. Filtro de Funding Gradual (4 Tiers) {#funding-gradual}

**Antes:** Funding rate fora do limiar = sinal **bloqueado** (binário).  
**Agora:** Sistema de 4 tiers com penalidade gradual.

| Tier | Funding Rate | Ação | Penalty |
|------|-------------|------|---------|
| 1 - Normal | |rate| < 0.01% | Nenhuma | 0 |
| 2 - Watch | 0.01% ≤ |rate| < 0.03% | Soft warning | −3 |
| 3 - Elevated | 0.03% ≤ |rate| < 0.06% | Confiança reduzida | −8 |
| 4 - Extreme | |rate| ≥ 0.06% | Quase-bloqueio | −15 |

**Nota:** Penalidades entram no soft adjustments system. Apenas taxa ≥ 0.10% bloqueia completamente o sinal (backward compat com `blocked: true`).

Também verifica **direção**: funding rate positivo alto + sinal LONG = penalidade extra (crowded trade).

---

### 12g. Cold Start Guard (<8 Sinais) {#cold-start}

Quando o modelo tem poucos dados históricos (< 8 sinais processados), os gates e weights ainda não são confiáveis. O cold start guard:

1. Reduz `maxConfidence` em 20% (cap temporário)
2. Adiciona warning `"COLD_START: modelo com poucos dados, confiança reduzida"`
3. Desabilita gates que dependem de histórico (edge, decorrelation)
4. Mantém apenas gates baseados em dados atuais (volume, funding, BOS)

```
if (signalCount < 8) {
  maxConfidence *= 0.80;
  warnings.push("COLD_START");
  gates.edge.enabled = false;
  gates.decorrelation.enabled = false;
}
```

**Após 8+ sinais:** comportamento normal restaurado automaticamente.

---

### 12h. Acceptance Timing (15m Candles) {#acceptance-timing}

O gate de **Acceptance** verifica se o preço "aceitou" um nível-chave em timeframe rápido (15 minutos), aumentando a confiança de que o breakout/rejection é real.

**Função:** `detectAcceptance(rawData, direction)`

```
Lógica:
1. Pega as últimas 4 candles de 15m
2. Se direction = 'LONG':
   - Verifica se ≥ 3 candles fecharam ACIMA do nível de breakout
   - Close da última candle > Open (bullish)
3. Se direction = 'SHORT':
   - Verifica se ≥ 3 candles fecharam ABAIXO do nível
   - Close da última candle < Open (bearish)

Retorno:
  { accepted: true/false, strength: 0-1.0 }
```

**Score do gate:**
- `accepted + strength > 0.7` → gate score = 1.0
- `accepted + strength > 0.4` → gate score = 0.5
- Caso contrário → gate score = 0

---

### 12i. BOS Scoring Contínuo (0/0.5/1.0) {#bos-continuo}

**Antes:** BOS gate era binário (pass/fail).  
**Agora:** Retorna score contínuo via `scoreBosGate()`.

**Função:** `scoreBosGate(bosData, direction)`

| Condição | Score |
|----------|-------|
| BOS confirmado (REAL) na mesma direção do sinal | 1.0 |
| BOS não-confirmado (UNCONFIRMED) na direção | 0.5 |
| Sem BOS / BOS contra direção | 0.0 |
| FAKE_SWEEP detectado (contra sinal) | −0.5 |

**Integração no gateScore:**
```
bosGateScore = scoreBosGate(v2.bos, direction) * regimeWeight.bos;
gateScore += bosGateScore;
```

Isso permite sinais com BOS parcial passarem com score reduzido em vez de serem descartados.

---

### 12j. Liquidity Levels Analysis {#liquidity-levels}

**Função:** `analyzeLiquidityLevels(rawData, currentPrice)`

Identifica **pools de liquidez** onde existem concentrações de ordens, usando dados do order book e volume profile.

**Análise:**

1. **Mapeamento:** Identifica clusters de bid/ask no livro de ordens (> 2× média)
2. **Proximidade:** Calcula distância do preço atual a cada pool
3. **Magnetismo:** Pools próximos (< 0.5% de distância) "atraem" o preço

**Output:**
```javascript
{
  nearestSupport: { price: 64200, strength: 8.5, distance: -0.3% },
  nearestResistance: { price: 65800, strength: 6.2, distance: +0.8% },
  liquidityImbalance: 'BID_HEAVY',  // mais liquidez no bid
  poolsNearby: 3,
  magneticBias: 'DOWN'  // preço tende a ser puxado para suporte forte
}
```

**Soft adjustment:**
- Pool forte na direção do sinal = +3
- Pool forte contra = −3
- Imbalance favorece = +2

---

### 12k. Hidden Divergence Detection {#hidden-divergence}

**Função:** `detectHiddenDivergence(rawData, direction)`

Divergências **ocultas** (hidden) são sinais de **continuação** da tendência, ao contrário das regulares (que indicam reversão).

**Tipos detectados:**

| Tipo | Preço | RSI | Significado |
|------|-------|-----|-------------|
| Hidden Bullish | Higher Low | Lower Low | Tendência de alta continua |
| Hidden Bearish | Lower High | Higher High | Tendência de baixa continua |

**Algoritmo:**
1. Identifica os últimos 3 pivots de preço (swing highs/lows)
2. Compara com os pivots correspondentes do RSI
3. Se preço faz HL mas RSI faz LL → hidden bullish divergence

**Output:**
```javascript
{
  detected: true,
  type: 'HIDDEN_BULLISH',
  strength: 0.75,      // 0-1 baseado na magnitude
  pivotCount: 3,
  confirmedByVolume: true
}
```

**Soft adjustment:** +4 se hidden divergence confirma direção do sinal. Ignorada se contra.

---

### 12l. Signal TTL (Time-To-Live) {#signal-ttl}

**Função:** `checkSignalTTL(signalTimestamp)`

Sinais não devem viver eternamente. O TTL system controla a **idade** do sinal e aplica **decay**.

**Regras:**

| Idade do Sinal | Status | Ação |
|----------------|--------|------|
| 0 – 2 horas | FRESH | Nenhuma penalidade |
| 2 – 3 horas | AGING | −2 no soft adjustment |
| 3 – 4 horas | STALE | −5 no soft adjustment |
| > 4 horas | EXPIRED | Sinal invalidado |

**Output:**
```javascript
{
  age: 150,           // minutos
  status: 'AGING',
  remainingMinutes: 90,
  decayFactor: 0.92,  // multiplicador de confiança
  expired: false
}
```

**Integração:** Se `expired: true`, o sinal é removido da UI e não gera notificações.

---

### 12m. Dynamic Exit Plan (TP1/TP2/TP3 + ATR Trailing) {#dynamic-exit}

**Função:** `generateDynamicExitPlan(analysis, rawData)`

Gera targets de saída **adaptativos** baseados em volatilidade (ATR) e estrutura de mercado.

**Targets:**

| Target | Cálculo | Saída sugerida |
|--------|---------|----------------|
| TP1 | entry ± 1.0 × ATR(14) | 40% da posição |
| TP2 | entry ± 2.0 × ATR(14) | 35% da posição |
| TP3 | entry ± 3.5 × ATR(14) | 25% da posição |
| Stop Loss | entry ∓ 1.5 × ATR(14) | 100% (proteção) |

**ATR Trailing Stop:**

Após atingir TP1:
1. Stop move para **breakeven** (entry)
2. Trailing stop = último high/low − 1.2 × ATR
3. Move apenas na direção favorável (nunca recua)

**Output:**
```javascript
{
  entry: 64500,
  tp1: { price: 65130, pct: 0.98, exitPortion: 0.40 },
  tp2: { price: 65760, pct: 1.95, exitPortion: 0.35 },
  tp3: { price: 66705, pct: 3.42, exitPortion: 0.25 },
  stopLoss: { price: 63555, pct: -1.46 },
  atrTrailing: {
    enabled: true,
    activateAfterTP1: true,
    multiplier: 1.2,
    currentTrail: null  // null até TP1 atingido
  },
  riskReward: 2.34
}
```

---

### 12n. Liquidation Zones Estimation {#liquidation-zones}

**Função:** `estimateLiquidationZones(currentPrice, direction)`

Estima onde posições alavancadas seriam liquidadas, ajudando a identificar **cascatas potenciais**.

**Leverage levels analisados:** 5×, 10×, 25×, 50×

**Cálculo para LONG:**
```
liquidationPrice = currentPrice × (1 - 1/leverage)
  5×:  currentPrice × 0.80  = -20%
  10×: currentPrice × 0.90  = -10%
  25×: currentPrice × 0.96  = -4%
  50×: currentPrice × 0.98  = -2%
```

**Cálculo para SHORT:**
```
liquidationPrice = currentPrice × (1 + 1/leverage)
  5×:  currentPrice × 1.20  = +20%
  10×: currentPrice × 1.10  = +10%
  25×: currentPrice × 1.04  = +4%
  50×: currentPrice × 1.02  = +2%
```

**Output:**
```javascript
{
  longLiquidations: [
    { leverage: '5x',  price: 51600, distance: '-20.0%' },
    { leverage: '10x', price: 58050, distance: '-10.0%' },
    { leverage: '25x', price: 61920, distance: '-4.0%'  },
    { leverage: '50x', price: 63210, distance: '-2.0%'  }
  ],
  shortLiquidations: [
    { leverage: '5x',  price: 77400, distance: '+20.0%' },
    { leverage: '10x', price: 70950, distance: '+10.0%' },
    { leverage: '25x', price: 67080, distance: '+4.0%'  },
    { leverage: '50x', price: 65790, distance: '+2.0%'  }
  ],
  nearestCascade: { side: 'LONG_50x', distance: '-2.0%', risk: 'HIGH' }
}
```

**Uso:** Zonas de liquidação 50× e 25× próximas do preço = risco de squeeze/cascade.

---

### 12o. Order Flow Ring Buffer (WebSocket) {#order-flow-ws}

**Funções:** `connectOrderFlowWS()`, `pushToOrderFlowBuffer()`, `getOrderFlowBuffer()`, `getOrderFlowAnalysis()`

Buffer circular de **500 trades** em tempo real via WebSocket da Binance (`@aggTrade`).

**Estrutura do buffer:**
```javascript
const ORDER_FLOW_BUFFER = {
  trades: [],           // ring buffer, max 500
  pointer: 0,           // índice circular
  buyVolume: 0,         // volume acumulado buy
  sellVolume: 0,        // volume acumulado sell
  lastUpdate: null,     // timestamp
  connected: false      // estado do WebSocket
};
```

**Análise em tempo real:**
```javascript
getOrderFlowAnalysis() → {
  totalTrades: 500,
  buyRatio: 0.58,       // 58% do volume é compra
  sellRatio: 0.42,
  netDelta: +16.2,      // BTC (buy - sell)
  avgTradeSize: 0.034,  // BTC por trade
  largeTradesCount: 12, // trades > 3× média
  largeTradesBias: 'BUY',
  vwap: 64523.50,
  lastTradeTime: '2026-02-01T15:23:45Z'
}
```

**Integração:** Alimenta o gate de Order Flow Agreement e o soft adjustment de volume.

---

### 12p. Notification Cooldown {#notification-cooldown}

**Funções:** `isNotificationOnCooldown(type)`, `markNotificationSent(type)`

Evita spam de notificações repetidas. Cada tipo de notificação tem seu **cooldown independente**.

| Tipo de Notificação | Cooldown |
|---------------------|----------|
| `signal_new` | 30 min |
| `signal_update` | 15 min |
| `crash_alert` | 60 min |
| `whale_alert` | 45 min |
| `funding_alert` | 30 min |
| `ttl_warning` | 10 min |

**Implementação:**
```javascript
const NOTIFICATION_COOLDOWNS = {};

function isNotificationOnCooldown(type) {
  const last = NOTIFICATION_COOLDOWNS[type];
  if (!last) return false;
  const cooldownMs = COOLDOWN_TIMES[type] || 30 * 60 * 1000;
  return (Date.now() - last) < cooldownMs;
}

function markNotificationSent(type) {
  NOTIFICATION_COOLDOWNS[type] = Date.now();
}
```

---

### 12q. EWMA Adaptive Alpha (V3 Enhancement) {#ewma-alpha}

**Mudança no ta-engine-v3.js**, mas documentada aqui como parte do pacote v7.2.

O **adaptive weight engine** do V3 usa EWMA (Exponentially Weighted Moving Average) para aprender quais indicadores performam melhor. O alpha da EWMA controla a velocidade de aprendizado.

**Antes:** Alpha fixo = 0.05  
**Agora:** Alpha adaptativo por regime:

| Regime | Alpha | Razão |
|--------|-------|-------|
| VOLATILE | 0.10 | Adapta rápido em volatilidade |
| TREND | 0.03 | Adapta lento em tendência estável |
| RANGE | 0.05 | Velocidade média |
| SQUEEZE | 0.07 | Levemente mais rápido |
| DEFAULT | 0.05 | Fallback |

**Função:** `getAdaptiveAlpha(regime)` em `ta-engine-v3.js`

```javascript
const ADAPTIVE_ALPHA_MAP = {
  VOLATILE: 0.10,
  TREND: 0.03,
  RANGE: 0.05,
  SQUEEZE: 0.07,
  DEFAULT: 0.05
};

function getAdaptiveAlpha(regime) {
  return ADAPTIVE_ALPHA_MAP[regime] || ADAPTIVE_ALPHA_MAP.DEFAULT;
}
```

**Impacto:** Em mercados voláteis, o sistema aprende 3× mais rápido que em tendências, permitindo adaptação dinâmica.

---

### 12r. Pipeline Completo V2→V3→V4 {#pipeline-completo}

```
┌────────────────────────────────────────────────────────────────┐
│                    PIPELINE DE ANÁLISE                          │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌─────────────────────────────────────┐                      │
│  │  DADOS BRUTOS (rawData)              │                      │
│  │  • 16 endpoints Binance              │                      │
│  │  • 5 APIs externas                   │                      │
│  │  • WebSocket aggTrade (500 buffer)   │                      │
│  └──────────────┬──────────────────────┘                      │
│                 │                                               │
│                 ▼                                               │
│  ┌─────────────────────────────────────┐                      │
│  │  V2 — ENGINE INSTITUCIONAL           │                      │
│  │  • 13 indicadores multi-TF           │                      │
│  │  • Regime detection                  │                      │
│  │  • BOS/CHoCH detection               │                      │
│  │  • CVD + order flow                  │                      │
│  │  • Dynamic targets TP1/2/3           │                      │
│  │  • Contextual scoring (non-linear)   │                      │
│  │  OUTPUT: score + regime + targets     │                      │
│  └──────────────┬──────────────────────┘                      │
│                 │                                               │
│                 ▼                                               │
│  ┌─────────────────────────────────────┐                      │
│  │  V3 — ADVANCED TRADING INTEL         │                      │
│  │  • Crash/Black Swan detector         │                      │
│  │  • Decorrelation engine              │                      │
│  │  • Adaptive weights (EWMA α adapt.)  │                      │
│  │  • Kelly position sizing             │                      │
│  │  • Virtual trade tracker             │                      │
│  │  • On-chain analysis                 │                      │
│  │  • Edge calculator                   │                      │
│  │  • Enhanced regime                   │                      │
│  │  OUTPUT: adjustedScore + edge + risk  │                      │
│  └──────────────┬──────────────────────┘                      │
│                 │                                               │
│                 ▼                                               │
│  ┌─────────────────────────────────────┐                      │
│  │  V4 — REACTIVE INTELLIGENCE (v7.2)   │                      │
│  │                                      │                      │
│  │  ┌──────────────────────────┐       │                      │
│  │  │ 9 GATES (regime-adaptive) │       │                      │
│  │  │ • Trend Alignment         │       │                      │
│  │  │ • Volume Confirmation     │       │                      │
│  │  │ • Order Flow Agreement    │       │                      │
│  │  │ • MultTF Consensus        │       │                      │
│  │  │ • Funding (4-tier)        │       │                      │
│  │  │ • Volatility Regime       │       │                      │
│  │  │ • BOS Contínuo (0-1)      │       │                      │
│  │  │ • Risk/Reward             │       │                      │
│  │  │ • Acceptance (15m)        │       │                      │
│  │  └────────────┬─────────────┘       │                      │
│  │               │                      │                      │
│  │               ▼                      │                      │
│  │  ┌──────────────────────────┐       │                      │
│  │  │ SOFT ADJUSTMENTS (±25)    │       │                      │
│  │  │ ~15 fontes → array →     │       │                      │
│  │  │ sum → clamp(−25,+25)     │       │                      │
│  │  │ → confidence final       │       │                      │
│  │  └────────────┬─────────────┘       │                      │
│  │               │                      │                      │
│  │               ▼                      │                      │
│  │  ┌──────────────────────────┐       │                      │
│  │  │ MÓDULOS ENRICHMENT        │       │                      │
│  │  │ • Liquidity Levels        │       │                      │
│  │  │ • Hidden Divergence       │       │                      │
│  │  │ • Signal TTL              │       │                      │
│  │  │ • Dynamic Exit Plan       │       │                      │
│  │  │ • Liquidation Zones       │       │                      │
│  │  │ • Order Flow WS Buffer    │       │                      │
│  │  │ • Calibração Piecewise    │       │                      │
│  │  │ • Notification Cooldown   │       │                      │
│  │  └────────────┬─────────────┘       │                      │
│  │               │                      │                      │
│  └───────────────┼──────────────────────┘                      │
│                  │                                              │
│                  ▼                                              │
│  ┌─────────────────────────────────────┐                      │
│  │  OUTPUT FINAL                        │                      │
│  │  • signal: LONG/SHORT/NEUTRAL        │                      │
│  │  • confidence: 0-100 (calibrada)     │                      │
│  │  • gateScore / gatesPassed           │                      │
│  │  • softAdjustments[] (detalhado)     │                      │
│  │  • dynamicExitPlan (TP1-3 + trail)   │                      │
│  │  • liquidityLevels                   │                      │
│  │  • hiddenDivergence                  │                      │
│  │  • signalTTL                         │                      │
│  │  • liquidationZones (5×-50×)         │                      │
│  │  • orderFlow (real-time)             │                      │
│  │  • warnings[]                        │                      │
│  └─────────────────────────────────────┘                      │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## 13. Cálculo Final do Score e Sinal {#score-final}

```
confluenceScore      ← soma dos 13 indicadores da grade
        │
        ▼
contextual.adjustedScore  ← após applyContextualScoring()
                             (pesos ajustados por regime + V2 adds)
        +
orderFlowScore       = priceLocationScore
                     + fundingScore
                     + cvdScore
                     + bookScore
                     + rsiScore (1h standalone)
                     + lsScore (long/short ratio)
        │
        ▼
totalScore           = contextual.adjustedScore + orderFlowScore
        │
        ├── score >= +4  → signal = "LONG" (V1/V2)
        ├── score <= -4  → signal = "SHORT" (V1/V2)
        └── else         → signal = "NEUTRO" (V1/V2)
        │
        ▼ ══════ V3 ENHANCEMENT ══════
        │
        ├── crashDetection(klines) → suppress oscillators if crash
        ├── decorrelate(indicators) → reduce redundant signal families
        ├── adaptiveWeights(symbol) → EWMA-adjusted indicator weights
        ├── enhancedRegime(klines, ADX) → squeeze dir, false breakout risk
        ├── validateBOS(structure, vol, CVD) → REAL/FAKE_SWEEP
        ├── fetchOnChain(symbol) → mempool, hash rate, stablecoins
        ├── fetchMultiExchangeCVD(symbol) → Bybit + OKX delta
        ├── rollingCorrelation() → BTC-SP500 dynamic beta
        │
        ▼
v3Score = 35 × tanh(rawScore / 20)  ← NON-LINEAR COMPRESSION
        threshold = crash ? 6 : 4
        │
        ├── v3Score >= +threshold → v3Signal = "LONG"
        ├── v3Score <= -threshold → v3Signal = "SHORT"
        └── else                 → v3Signal = "NEUTRO"
        │
        ├── calculateEdge(symbol) → statistical edge from history
        ├── positionSize(kelly, crash, edge) → % of portfolio
        ├── trackVirtualTrade(symbol) → forward testing database
        └── generateWarnings() → context-aware risk alerts
        │
        ▼ ══════ V4 REACTIVE INTELLIGENCE (v7.2) ══════
        │
        ├── evaluateReactiveGates(analysis, rawData, regime)
        │     └── 9 gates × regime weights → gateScore
        │         ├── gateScore ≥ threshold → ACCEPTED
        │         └── gateScore < threshold → REJECTED / confidence reduced
        │
        ├── softAdjustments[] ← ~15 fontes (regime, funding, edge, macro, etc.)
        │     └── clamp(sum, -25, +25) → confiança ajustada
        │
        ├── calibrateConfidence(raw) → piecewise 3-segment
        │     ├── raw ≤ 30:  raw × 0.5
        │     ├── raw ≤ 70:  15 + (raw-30) × 1.0
        │     └── raw > 70:  55 + (raw-70) × 0.6
        │
        ├── Módulos enrichment:
        │     ├── analyzeLiquidityLevels()
        │     ├── detectHiddenDivergence()
        │     ├── checkSignalTTL() → expire at 4h
        │     ├── generateDynamicExitPlan() → TP1/2/3 + ATR trailing
        │     ├── estimateLiquidationZones() → 5x/10x/25x/50x
        │     └── getOrderFlowAnalysis() → 500-trade WS buffer
        │
        ▼
v4Confidence = clamp(calibrated + softTotal, 0, 100)
        v4Signal = gatesPassed ? v3Signal : "NEUTRO"
```

### Probabilidade
```
maxScore = 35

if totalScore > 0:
    probability = min(50 + (totalScore / 35) × 45, 95)
else:
    probability = max(50 + (totalScore / 35) × 45, 5)
```

Range efetivo: **5% a 95%**

### Confiança
```
alignedIndicators = max(longCount, shortCount)
alignmentRatio    = alignedIndicators / totalIndicators
confidence        = min(alignmentRatio × 100 + |totalScore| × 2, 95)

if regime.isTrending:
    if sinal alinhado com tendência: confidence += 10
    else (contra-tendência):         confidence -= 10
```

Clampeado entre **10% e 95%**

---

## 14. Cache e Auto-Refresh {#cache-autorefresh}

### Cache
- **TTL**: 5 minutos  
- **Chave**: símbolo (ex: "BTCUSDT")  
- Armazenado em objeto em memória `taCache`  
- Ao abrir TA: verifica `Date.now() - cache.timestamp < 5*60*1000`  
- Se válido: renderiza imediatamente sem nenhuma chamada de rede  

### Auto-Refresh
- `startTAAutoRefresh(symbol, crypto)` chama `setInterval` de 5 minutos  
- A cada ciclo: refaz todos os fetches e regenera a análise  
- O intervalo é limpo quando o modal da TA é fechado (`clearInterval`)  

---

## 15. AI Summary {#ai-summary}

**Função**: `generateAISummary(signalType, confidence, contextData, symbol)`

Gera um texto narrativo em português descrevendo:
- Sinal principal + confiança
- Localização do preço (acima/abaixo VWAP, EMA 200, POC, VAH, VAL)
- Estado do Funding Rate (crowded long/short)
- Pressão de compra/venda (CVD, book)
- Regime de mercado (V2) e implicação
- Estrutura de mercado (BOS/CHoCH detectados)
- Volatilidade atual
- Confluência de indicadores (X de Y alinhados)
- Médias móveis (EMA9 > EMA20 > EMA50 = bullish stack, etc.)

---

## 16. Interface Renderizada — Seções da UI {#ui-render}

`renderTechnicalAnalysis(analysis, crypto)` renderiza as seguintes seções:

1. **Header** — Nome da crypto + timestamp da análise + botão refresh
2. **Signal Banner** — LONG / SHORT / NEUTRO com probability e confidence (badges coloridos)
3. **Confluence Summary Bar** — Grid de 7 círculos mostrando: RSI TF, EMA 200, VWAP, MACD, Volume, Estrutura
4. **Indicadores Multi-TF** — Tabela com todos os 13 indicadores ponderados, cor LONG/SHORT/NEUTRO
5. **Volume Profile** — POC, VAH, VAL, VWAP e localização do preço
6. **Market Regime (V2)** — Ícone + descrição do regime + squeeze status
7. **Market Structure (V2)** — BOS/CHoCH detectados, sweeps de liquidez
8. **CVD Avançado (V2)** — Delta, divergência, absorção, breakout
9. **Volatilidade (V2)** — ATR 1h/4h/1d, regime de volatilidade
10. **Order Flow** — Funding Rate, OI, Long/Short Ratio, Book Imbalance
11. **Análise Gráfica Multi-TF** — 1m, 5m, 15m, 1h com padrões de candlestick
12. **Dynamic Targets** — Entry, SL, TP1, TP2, TP3 com R:R de cada
13. **Big Tech & Macro** — Badge POSITIVO/NEGATIVO/RISK-ON/RISK-OFF + detalhes VIX/DXY/SP500/Tech
14. **Notícias Macro** — Score FMP + manchetes CryptoPanic
15. **Liquidações** — Reais (Binance) + Heatmap estimado por alavancagem
16. **Moving Averages Panel** — EMA9/20/50, SMA50/99/200 vs preço atual
17. **AI Summary** — Texto narrativo completo

---

## 17. Tabela Resumo de Pesos {#tabela-pesos}

| Fonte | Score Máximo LONG | Score Máximo SHORT |
|---|---|---|
| RSI 15m + 1h + 4h | +6 | -6 |
| EMA 200 (1h + 4h) | +3 | -3 |
| VWAP | +1.5 | -1.5 |
| MACD (1h + 4h) | +3 | -3 |
| ADX 1h | +1 | -1 |
| Stochastic 1h | +1 | -1 |
| Net Volume (1h + 4h) | +3 | -3 |
| Liquidações | +1 | -1 |
| **Subtotal Confluência** | **+19.5** | **-19.5** |
| Price Location (POC/VAH/VAL) | +1 | -1 |
| Funding Rate | +1.5 | -1 |
| CVD Simples | +1.5 | -1.5 |
| Book Imbalance | +1 | -1 |
| RSI 1h (standalone) | +1 | -1 |
| L/S Ratio Contrarian | +1 | -1 |
| **Subtotal Order Flow** | **+7** | **-6.5** |
| Market Structure (V2) | +2.5 | -2.5 |
| CVD Avançado (V2) | +2 | -2 |
| Volatilidade Squeeze bonus | +1.5 | -1.5 |
| Macro News Layer | +5 | -5 |
| BigTech/VIX/DXY/SP500 | ~+5 | ~-5 |
| **Total máximo teórico** | **~42** | **~-42** |
| **maxScore usado** | **35** | **35** |

> Nota: O `maxScore = 35` é soft-cap para normalizar a probabilidade. Scores acima de 35 resultam em probabilidade próxima de 95%.

---

## Fluxograma Simplificado de Score

```
                    ┌─────────────────┐
                    │  13 Indicadores  │
                    │  (confluência)   │──► confluenceScore
                    └─────────────────┘
                            │
                    ┌───────▼──────────┐
                    │  applyContextual  │
                    │  Scoring (V2)     │──► adjustedScore (+struct +CVD +squeeze)
                    └───────────────────┘
                            │
                    ┌───────▼──────────┐
                    │   Order Flow      │
                    │  (fund+cvd+book)  │──► orderFlowScore
                    └───────────────────┘
                            │
                            ▼
                      totalScore
                  (>= +4 → LONG)
                  (<= -4 → SHORT)
                  (else → NEUTRO)
                            │
          ┌─────────────────┼──────────────────┐
          ▼                 ▼                  ▼
     probability        confidence         signal
     (5-95%)            (10-95%)     LONG/SHORT/NEUTRO
          │
          └──► Macro News (+/-5) adicionado
          └──► BigTech Score (+/-5) adicionado
               (pós-geração, injetados no resultado)
```

---

*Documentação gerada pelo GitHub Copilot com base na leitura completa do código fonte.*  
*Arquivos de referência: `www/index.html`, `www/ta-engine-v2.js`, `www/ta-engine-v3.js` e `www/ta-engine-v4.js` (v7.2.0)*
