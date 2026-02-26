# Visor Crypto — Documentação Completa da Análise Técnica

> **Versão:** V1 (index.html) + V2 (ta-engine-v2.js) + V3 (ta-engine-v3.js)  
> **Data:** Fevereiro 2026  
> **Tipo:** Capacitor v8 Hybrid Android App  
> **Arquitetura:** Client-side — 100% no dispositivo do usuário

---

## Índice

1. [Visão Geral da Arquitetura](#1-visão-geral)
2. [Escalabilidade & Auto-Refresh](#2-escalabilidade)
3. [Coleta de Dados — Todas as APIs](#3-coleta-de-dados)
4. [V1 — Indicadores Multi-Timeframe](#4-v1-indicadores)
5. [V1 — Sistema de Confluência & Score](#5-v1-confluencia)
6. [V1 — Order Flow & Microestrutura](#6-v1-order-flow)
7. [V1 — Volume Profile (POC/VAH/VAL/VWAP)](#7-v1-volume-profile)
8. [V1 — Análise Gráfica (12 Padrões)](#8-v1-grafica)
9. [V2 — Engine Institucional (10 Módulos)](#9-v2-engine)
10. [V3 — Advanced Trading Intelligence (14 Módulos)](#10-v3-engine)
11. [Fluxo de Dados Completo](#11-fluxo)
12. [Fórmula Final do Score](#12-formula-score)
13. [Interface Renderizada](#13-ui)
14. [Tabela de Pesos dos Indicadores](#14-pesos)
15. [Limitações Conhecidas](#15-limitacoes)

---

## 1. Visão Geral da Arquitetura {#1-visão-geral}

O sistema de Análise Técnica é processado em **3 camadas sequenciais**:

```
┌─────────────────────────────────────────────────────────────┐
│                     CAMADA V1 (index.html)                  │
│  14 indicadores técnicos × 6 timeframes                    │
│  Order Flow + Volume Profile + 12 padrões gráficos         │
│  Score linear por confluência                               │
├─────────────────────────────────────────────────────────────┤
│                     CAMADA V2 (ta-engine-v2.js)             │
│  Regime de mercado + BOS/CHoCH + CVD avançado               │
│  Bollinger Bands + Volatilidade + Macro/News                │
│  Big Tech & Macro Global + Contextual Scoring               │
│  Dynamic Targets + Modelo de Liquidações                    │
├─────────────────────────────────────────────────────────────┤
│                     CAMADA V3 (ta-engine-v3.js)             │
│  Crash Detection + Decorrelação + Pesos Adaptativos         │
│  Position Sizing (Kelly) + Forward Testing + On-Chain       │
│  Multi-Exchange CVD + Edge Calculator + Score Não-Linear    │
│  BOS Validation + Enhanced Regime + System Warnings         │
└─────────────────────────────────────────────────────────────┘
```

**Arquivos:**
| Arquivo | Linhas | Função |
|---|---|---|
| `www/index.html` | ~15.000 | App completo: UI + V1 indicators + rendering |
| `www/ta-engine-v2.js` | 1.330 | Engine V2 institucional |
| `www/ta-engine-v3.js` | ~1.710 | Engine V3 inteligência avançada |

---

## 2. Escalabilidade & Auto-Refresh {#2-escalabilidade}

### É automático a cada 5 minutos? **SIM.**

```javascript
setInterval(async () => {
    // Refetch todas as 16+ APIs → regenera V1 → V2 → V3 → re-renderiza
}, 300000); // 5 minutos
```

**Comportamento:**
- Ao abrir a análise, dados são carregados imediatamente
- Cache local com TTL de 5 minutos evita chamadas redundantes
- `setInterval` de 300.000ms reconecta automaticamente
- Se o modal for fechado, o intervalo é cancelado (`clearInterval`)
- Se reaberto, reinicia o ciclo

### É escalável para infinitos usuários? **SIM, com ressalvas.**

**Por que SIM:**
- **Arquitetura 100% client-side**: cada celular roda sua própria análise
- **Zero servidor central**: não existe backend compartilhado
- **Sem WebSocket/streaming**: cada dispositivo faz suas próprias chamadas REST
- **1.000 ou 1.000.000 de usuários**: o sistema escala horizontalmente sem mudança

**Ressalvas (rate limits das APIs):**
| API | Rate Limit | Impacto com muitos usuários |
|---|---|---|
| Binance Spot | 1.200 req/min por IP | OK — cada celular tem IP próprio |
| Binance Futures | 2.400 req/min por IP | OK — cada celular tem IP próprio |
| Bybit | 120 req/min por IP | OK |
| OKX | 20 req/2s por IP | OK |
| blockchain.info | ~100 req/min | Pode falhar silenciosamente (tem catch) |
| CoinGecko | 30 req/min sem key | Pode falhar em Wi-Fi compartilhado |
| Yahoo Finance | Sem limite claro | CORS proxies podem saturar |
| CryptoPanic | API gratuita com rate limit | Pode falhar |

**Conclusão**: Para WiFi doméstico, até ~5-10 dispositivos simultâneos. Para dados móveis (4G/5G), cada dispositivo tem IP único = escalabilidade ilimitada.

---

## 3. Coleta de Dados — Todas as APIs {#3-coleta-de-dados}

### Binance Spot (9 endpoints) — `api.binance.com`

| # | Endpoint | Dados | Uso |
|---|---|---|---|
| 1 | `/api/v3/klines?interval=1m&limit=60` | 60 velas de 1min | Crash detection V3 |
| 2 | `/api/v3/klines?interval=5m&limit=60` | 60 velas de 5min | Crash detection V3 |
| 3 | `/api/v3/klines?interval=15m&limit=100` | 100 velas de 15min | RSI 15m |
| 4 | `/api/v3/klines?interval=1h&limit=100` | 100 velas de 1h | Core analysis |
| 5 | `/api/v3/klines?interval=4h&limit=100` | 100 velas de 4h | EMA 200, ADX |
| 6 | `/api/v3/klines?interval=1d&limit=50` | 50 velas diárias | EMA 200d, correlation |
| 7 | `/api/v3/ticker/24hr` | Ticker 24h | Volume, variação |
| 8 | `/api/v3/depth?limit=100` | Order book (100 níveis) | Imbalance, suporte/resistência |
| 9 | `/api/v3/trades?limit=500` | 500 trades recentes | CVD, whale detection |

### Binance Futures (7 endpoints) — `fapi.binance.com`

| # | Endpoint | Dados | Uso |
|---|---|---|---|
| 10 | `/fapi/v1/fundingRate?limit=1` | Funding Rate | Sentimento de mercado |
| 11 | `/fapi/v1/openInterest` | Open Interest | Alavancagem total |
| 12 | `/futures/data/globalLongShortAccountRatio` | L/S global | Posicionamento da multidão |
| 13 | `/futures/data/topLongShortPositionRatio` | L/S top traders | Smart money |
| 14 | `/futures/data/topLongShortAccountRatio` | L/S top contas | Smart money |
| 15 | `/futures/data/takerlongshortRatio?limit=24` | Taker Buy/Sell (24h) | Agressividade |
| 16 | `/fapi/v1/allForceOrders?limit=100` | Liquidações forçadas | Heatmap real |

### APIs Externas V2 (6 domínios)

| API | Endpoint | Dados |
|---|---|---|
| FMP | `financialmodelingprep.com/api/v3/economic_calendar` | FOMC, CPI, NFP, juros |
| CryptoPanic | `cryptopanic.com/api/free/v1/posts/?filter=important` | Notícias crypto urgentes |
| Yahoo Finance | `query1.finance.yahoo.com/v7/finance/quote` | AAPL, MSFT, TSLA, META, NVDA, SP500, VIX, DXY, Treasuries |
| Fear & Greed | `api.alternative.me/fng/?limit=1` | Índice Fear & Greed |
| World Bank | `api.worldbank.org/v2/country/US/indicator/FP.CPI.TOTL.ZG` | Inflação EUA (CPI) |
| World Bank | `api.worldbank.org/v2/country/US/indicator/SL.UEM.TOTL.ZS` | Desemprego EUA |

### APIs Externas V3 (3 domínios)

| API | Endpoint | Dados |
|---|---|---|
| blockchain.info | `/charts/mempool-size`, `/charts/hash-rate`, `/charts/estimated-transaction-volume-usd` | Mempool, Hash Rate, TX Volume (BTC) |
| CoinGecko | `/api/v3/simple/price?ids=tether&include_market_cap=true` | Supply de Stablecoins (USDT mcap) |
| Bybit | `api.bybit.com/v5/market/recent-trade?category=linear&limit=500` | Trades perp para CVD multi-exchange |
| OKX | `www.okx.com/api/v5/market/trades?limit=100` | Trades para CVD multi-exchange |

**Total: 10 domínios de API, ~28 endpoints por ciclo de análise.**

---

## 4. V1 — Indicadores Multi-Timeframe {#4-v1-indicadores}

### RSI (Relative Strength Index)
- **Timeframes:** 15m, 1h, 4h
- **Peso:** 2.0 cada
- **Sinal:** <30 = LONG (oversold), >70 = SHORT (overbought)

### EMA 200 (Exponential Moving Average)
- **Timeframes:** 1h, 4h
- **Peso:** 1.5 cada
- **Sinal:** Preço acima = LONG, abaixo = SHORT

### MACD (Moving Average Convergence Divergence)
- **Timeframes:** 1h, 4h
- **Peso:** 1.0 cada
- **Sinal:** Histograma positivo = LONG, negativo = SHORT

### Stochastic Oscillator
- **Timeframe:** 1h
- **Peso:** 1.5
- **Sinal:** <20 = LONG (oversold), >80 = SHORT (overbought)

### ADX (Average Directional Index)
- **Timeframe:** 1h
- **Peso:** 1.0
- **Uso:** >25 = trending, <20 = ranging. DI+ > DI- = LONG, vice-versa

### VWAP (Volume Weighted Average Price)
- **Peso:** 1.0
- **Sinal:** Preço abaixo VWAP = LONG, acima = SHORT

### Net Volume (1h, 4h)
- **Peso:** 1.0 cada
- **Sinal:** Volume comprador dominante = LONG, vendedor = SHORT

### Liquidações Estimadas
- **Peso:** 1.5
- **Fonte:** `allForceOrders` da Binance Futures
- **Sinal:** Longs liquidados > Shorts = SHORT, vice-versa

**Total V1: 13 indicadores com pesos → Score de Confluência**

---

## 5. V1 — Sistema de Confluência {#5-v1-confluencia}

```
Para cada indicador:
  Se sinal = LONG  → score += peso
  Se sinal = SHORT → score -= peso
  Se sinal = NEUTRO → score += 0

confluenceScore = Σ(peso × direção)

Se score >= +4 → LONG
Se score <= -4 → SHORT
Senão → NEUTRO

Probabilidade = 50 + (score / 35) × 45   [clamp 5-95%]
Confiança = alinhamento% × 100 + |score| × 2   [clamp 10-95%]
```

---

## 6. V1 — Order Flow {#6-v1-order-flow}

| Componente | Peso | Fonte |
|---|---|---|
| Price Location (vs. POC/VAH/VAL) | Score component | Volume Profile |
| Funding Rate | Score component | Binance Futures |
| CVD básico | Score component | 500 recent trades |
| Order Book Imbalance | Score component | Depth 100 levels |
| RSI standalone | Score component | klines 1h |
| Long/Short Ratio | Score component | Futures data |

**Order Flow Score** = soma de todos os componentes acima, adicionado ao totalScore.

---

## 7. V1 — Volume Profile {#7-v1-volume-profile}

Calculado a partir de 100 velas de 1h:

| Métrica | Descrição |
|---|---|
| **POC** (Point of Control) | Preço com maior volume acumulado |
| **VAH** (Value Area High) | Limite superior da área de 70% do volume |
| **VAL** (Value Area Low) | Limite inferior da área de 70% do volume |
| **VWAP** | Preço médio ponderado por volume |

---

## 8. V1 — Análise Gráfica {#8-v1-grafica}

12 padrões de candlestick detectados automaticamente em 3 timeframes (15m, 1h, 4h):

| Padrão | Sinal |
|---|---|
| Hammer / Inverted Hammer | LONG |
| Bullish Engulfing | LONG |
| Morning Star | LONG |
| Three White Soldiers | LONG |
| Bullish Harami | LONG |
| Dragonfly Doji | LONG |
| Shooting Star | SHORT |
| Bearish Engulfing | SHORT |
| Evening Star | SHORT |
| Three Black Crows | SHORT |
| Bearish Harami | SHORT |
| Gravestone Doji | SHORT |

---

## 9. V2 — Engine Institucional {#9-v2-engine}

**Arquivo:** `ta-engine-v2.js` (1.330 linhas)  
**Export:** `window.TAEngineV2`

### 9a. Regime de Mercado
Classifica: TRENDING_UP | TRENDING_DOWN | RANGING | ACCUMULATION | DISTRIBUTION  
Usa: ADX, BB width percentile, volume trend, preço vs POC/VAH/VAL  
Detecta: Bollinger Squeeze (BB width < p20)

### 9b. Estrutura de Mercado (BOS/CHoCH)
- **BOS Bullish:** Higher High + Higher Low
- **BOS Bearish:** Lower Low + Lower High
- **CHoCH Bullish/Bearish:** Mudança de padrão
- **Liquidity Sweeps:** Wick além de swing, close dentro

### 9c. CVD Avançado
Score range: [-5, +5]
- Divergência: preço sobe + CVD desce = bearish divergence
- Absorção: preço flat + delta grande = whale activity
- Breakout: CVD > 2 desvios padrão

### 9d. Bollinger Bands
Período 20, desvio 2. Calcula: upper, middle, lower, %B, bandwidth percentile.

### 9e. Volatilidade
ATR-14 em 1h, 4h, 1d. Regime: SQUEEZE | LOW | NORMAL | HIGH | EXTREME.

### 9f. Macro & Notícias
FMP Economic Calendar + CryptoPanic. Score impacto de FOMC (±3), CPI (±2), NFP (±2), notícias crypto por keywords.

### 9g. Big Tech & Macro Global
Yahoo Finance: AAPL, MSFT, TSLA, META, NVDA, SP500, VIX, DXY, Treasury yields (3M/5Y/10Y/30Y).  
Fear & Greed Index. World Bank CPI/Unemployment.

### 9h. Contextual Scoring
- RSI/Stoch peso ×1.5 em range, ×0.3 contra-tendência
- EMA/MACD peso ×1.3-1.5 em trend, ×0.7 em range
- Adiciona: structureScore + cvdAdvancedScore + macroScore
- Penaliza: extreme volatility, contra-squeeze

### 9i. Dynamic Targets
TP1 = POC, TP2 = VAH/VAL, TP3 = 4×ATR. SL = max(VAL×0.998, price - 1.5×ATR).  
Calcula R:R ratios para cada target.

### 9j. Modelo de Liquidações
Estima alavancagem média pelo funding rate. Gera distribuição por tier (3x-100x).

---

## 10. V3 — Advanced Trading Intelligence {#10-v3-engine}

**Arquivo:** `ta-engine-v3.js` (~1.710 linhas)  
**Export:** `window.TAEngineV3`  
**Versão:** 3.0.0

O V3 é uma camada de **pós-processamento** que resolve 12 falhas estruturais identificadas por auditoria.

### 10a. Crash / Black Swan Detector (Módulo 1)

**Problema resolvido:** O sistema recomendava COMPRA durante crashes porque osciladores como RSI indicavam "oversold".

**Como funciona:**
- Calcula Rate of Change (RoC) em 4 janelas: 5min, 30min, 1h, 4h
- Classifica severidade: NONE → MINOR → MODERATE → SEVERE → BLACK_SWAN

| Janela | MINOR | MODERATE | SEVERE | BLACK_SWAN |
|---|---|---|---|---|
| 5min | >1.5% | >3% | >5% | >8% |
| 30min | >3% | >5% | >8% | >12% |
| 1h | >4% | >7% | >10% | >15% |
| 4h | — | >10% | >15% | >20% |

**Overrides durante MODERATE+:**
- Osciladores de compra desativados (peso ×0.1) durante queda
- Osciladores de venda desativados durante pump
- Peso de indicadores de tendência amplificado (×1.5 + severity×0.3)
- Penalidade de confiança: severity × 5%

### 10b. Indicator Decorrelation Engine (Módulo 2)

**Problema resolvido:** 3 osciladores de momentum (RSI, Stoch, MACD) todos diziam "LONG" → contagem tripla falsa.

| Família | Indicadores | Max Sinais Efetivos |
|---|---|---|
| MOMENTUM | RSI (15m/1h/4h), Stochastic, MACD (1h/4h) | 2 |
| TREND | EMA 200 (1h/4h), ADX | 2 |
| VOLUME | Net Volume (1h/4h) | 2 |
| PRICE | VWAP | 1 |
| LEVERAGE | Liquidações | 1 |

Indicadores excedentes têm peso reduzido para **40%** do original.

### 10c. Adaptive Weight Engine (Módulo 3)

**Problema resolvido:** Pesos heurísticos fixos que nunca aprendem.

- EWMA (α = 0.05) de acurácia por indicador
- Multiplicador: 0.5 (péssimo histórico) a 1.5 (excelente)
- Mínimo 5 sinais antes de aplicar
- Armazenado em localStorage: `vc3_adaptive_{SYMBOL}`
- Atualizado automaticamente quando trades virtuais são avaliados

### 10d. Position Sizing Engine — Kelly Criterion (Módulo 4)

**Problema resolvido:** Sem gestão de risco / dimensionamento de posição.

```
Kelly½ = max(0, (p×b - q) / (2×b))   [p=winRate, q=1-p, b=avgWin/avgLoss]
Size = Kelly½ × Confidence × CrashMult × EdgeMult
Final = clamp(Size, 0.5%, 15%)
```

| Nível | % Banca | Condição |
|---|---|---|
| CONSERVADOR | ≤2% | Padrão |
| MODERADO | 2-5% | Boa confluência |
| AGRESSIVO | 5-10% | Alta confiança + edge |
| MÁXIMO | 10-15% | Somente com edge comprovado |

### 10e. Virtual Trade Tracker & Forward Tester (Módulo 5)

**Problema resolvido:** Sem backtesting / validação histórica.

- Salva cada sinal (entry, SL, TP1-3, score, regime, indicadores)
- Cooldown de 30min por símbolo (evita duplicatas)
- Até 200 trades por símbolo no localStorage
- Avalia automaticamente usando klines 1h: TP1/TP2 atingido? SL atingido?
- Timeout: 24h sem TP/SL → avalia ao preço atual
- Outcomes: WIN_TP1, WIN_TP2, WIN_TIME, LOSS, LOSS_TIME
- Métricas: Win Rate, Profit Factor, Expectancy, Max Drawdown, Sharpe
- Breakdown por regime e por score bucket (4-6, 6-10, 10+)

### 10f. On-Chain Analyzer (Módulo 6)

**Problema resolvido:** Sem análise on-chain.

Disponível para **BTC e ETH** apenas.

| Métrica | API | Score |
|---|---|---|
| Mempool congestionado (+50%) | blockchain.info | -0.5 |
| Mempool descongestionando (-30%) | blockchain.info | +0.5 |
| Hash Rate subindo (+5%) | blockchain.info | +1 |
| Hash Rate caindo (-5%) | blockchain.info | -1 |
| Stablecoin supply crescendo (+1%) | CoinGecko | +1 |
| Stablecoin supply encolhendo (-1%) | CoinGecko | -1 |

Score final: -3 a +3.

### 10g. Multi-Exchange CVD (Módulo 7)

**Problema resolvido:** Visão limitada à Binance.

| Exchange | API | Trades |
|---|---|---|
| Binance | (já existente V1) | 500 trades |
| Bybit | v5 /recent-trade | 500 trades |
| OKX | v5 /trades | 100 trades |

Detecção de **divergência cross-exchange**: Se Binance compra mas Bybit vende → cautela, score ×0.5.

### 10h. Edge Calculator (Módulo 8)

**Problema resolvido:** Sem medição de edge real.

```
Edge = (WinRate × AvgWin) - (LossRate × AvgLoss)
```

| Edge | Classificação |
|---|---|
| >5% | FORTE 🏆 |
| >2% | MODERADO ✅ |
| >0% | FRACO ⚠️ |
| <0% | NEGATIVO ❌ |
| <5 trades | INSUFICIENTE 📊 |

### 10i. Rolling Correlation Engine (Módulo 9)

**Problema resolvido:** Camada macro superficial.

Calcula correlação de Pearson (30 dias) entre retornos diários BTC e SP500.

| |r| | Regime | Macro Weight |
|---|---|---|
| >0.7 | HIGH | ×1.5 (macro muito relevante) |
| >0.4 | MODERATE | ×1.2 |
| >0.2 | LOW | ×0.8 |
| ≤0.2 | DECORRELATED | ×0.5 (macro pouco relevante) |

### 10j. Non-Linear Scoring Engine (Módulo 10)

**Problema resolvido:** Soma linear que explode com muitos indicadores alinhados.

```
RawScore = DecorrelatedScore + OrderFlowScore
         + (MacroScore + BigTechScore) × CorrelationMultiplier
         + OnChainScore + MultiExchangeScore

// Crash override
Se crash detectado e score oposto ao crash → RawScore ×0.2

// COMPRESSÃO NÃO-LINEAR (inovação principal)
S_final = 35 × tanh(RawScore / 20)

// Threshold dinâmico
threshold = crash detectado ? 6 : 4

LONG se S ≥ +threshold
SHORT se S ≤ -threshold
NEUTRO senão

// Confidence Gate (NOVO)
Se confiança < 40% → força NEUTRO
```

**Propriedades da tanh:**
- Score ±5 → comprime para ±8.6 (quase linear, bom)
- Score ±15 → comprime para ±23 (desacelera)
- Score ±30 → comprime para ±34 (quase saturado)
- **Nunca excede ±35** = sem inflação de score

### 10k. Enhanced Regime Detector (Módulo 11)

**Problema resolvido:** Regime detection sem confirmação de volume.

- ADX trending + volume caindo → Risco de falso breakout: HIGH
- ADX trending + volume subindo → Tendência confirmada
- Squeeze (ADX < 20 ambos TF): OBV + volume distribution → predição direcional (UP/DOWN/INDEFINIDO)
- Transição: ENTERING_TREND | ENTERING_RANGE | SQUEEZING
- Confiança reduzida a 30% durante crash

### 10l. BOS Validation — False Breakout Detector (Módulo 12)

**Problema resolvido:** BOS/rompimentos falsos (liquidity sweeps).

| Confirmação | Critério |
|---|---|
| Volume | Vela de breakout > 1.3× média |
| Fechamento | Close na direção do breakout |
| CVD | Delta na direção (buy > sell×1.2 para bullish) |

| Resultado | Score |
|---|---|
| REAL (3/3) | Score integral |
| FAKE_SWEEP (0-1/3) | **Score invertido ×-0.5** (contra-sinal!) |
| UNCONFIRMED (2/3) | Score ×0.3 |

### 10m. System Limitations & Warnings (Módulo 13)

**Problema resolvido:** Sem warnings sobre quando o sistema pode errar.

| Warning | Condição | Severidade |
|---|---|---|
| Crash/Pump Extremo | crashState.isCrash | CRITICAL |
| Volatilidade Extrema | volRegime EXTREME | HIGH |
| Falso Rompimento | falseBreakoutRisk HIGH | HIGH |
| Edge Negativo | edge < -1% com 10+ trades | HIGH |
| Falsa Confluência | 8+ indicadores alinhados | MEDIUM |
| Horário FOMC | 18-19h UTC | MEDIUM |
| Dados Desatualizados | >10min | MEDIUM |
| Visão Limitada | Bybit indisponível | LOW |

---

## 11. Fluxo de Dados Completo {#11-fluxo}

```
Usuário toca "Análise Técnica" em uma crypto
              │
              ▼
   fetchTechnicalAnalysisData(symbol)
   ├── 9 calls Binance Spot (klines 1m-1d, ticker, book, trades)
   └── 7 calls Binance Futures (funding, OI, L/S ratios, liquidações)
              │
              ▼  [Em paralelo]
   fetchMacroNewsLayer(symbol)        fetchBigTechAndMacro()
   ├── FMP Economic Calendar          ├── Yahoo Finance (stocks, indices)
   └── CryptoPanic News               ├── Fear & Greed Index
                                       └── World Bank (CPI, desemprego)
              │
              ▼
   generateTechnicalAnalysis(data, symbol)  ← CAMADA V1
   ├── RSI (3 TFs), MACD (2 TFs), EMA 200 (2 TFs), Stochastic, ADX
   ├── Volume Profile (POC/VAH/VAL/VWAP)
   ├── Order Flow (CVD, Book Imbalance, Funding)
   ├── 12 padrões de candlestick (3 TFs)
   ├── V2.detectMarketRegime()
   ├── V2.detectMarketStructure()        (BOS/CHoCH/Sweeps)
   ├── V2.calculateCVDAdvanced()         (divergência/absorção)
   ├── V2.calculateVolatilityMetrics()   (ATR, BB, regime vol)
   ├── V2.applyContextualScoring()       (pesos ajustados por regime)
   ├── V2.calculateDynamicTargets()      (TP1/TP2/TP3/SL)
   ├── V2.improvedLiquidationModel()     (tiers de alavancagem)
   └── generateAISummary()               (texto narrativo)
              │
              ▼
   TAEngineV3.enhanceAnalysis(analysis, data, symbol)  ← CAMADA V3
   ├── detectCrashConditions()        ← klines multi-TF
   ├── decorrelateIndicators()        ← famílias de indicadores
   ├── applyAdaptiveWeights()         ← EWMA de localStorage
   ├── enhancedRegimeDetection()      ← volume + OBV + squeeze
   ├── validateBOS()                  ← volume + close + CVD
   ├── fetchOnChainData()             ← blockchain.info + CoinGecko [async]
   ├── fetchMultiExchangeCVD()        ← Bybit + OKX [async]
   ├── calculateRollingCorrelation()  ← daily returns Pearson
   ├── evaluatePendingTrades()        ← forward-testing outcomes
   ├── calculateEdge()                ← statistical edge
   ├── nonLinearScore()               ← tanh compression → v3Signal/v3Confidence
   ├── calculatePositionSize()        ← Kelly criterion
   ├── trackVirtualTrade()            ← salva para forward-testing
   └── generateWarnings()             ← alertas contextuais
              │
              ▼
   Re-generate AI Summary com V3 signal/confidence
              │
              ▼
   renderTechnicalAnalysis(analysis, crypto)  ← UI
   ├── Signal Card (usa V3 signal se disponível)
   ├── Entry/SL/TP1-3 levels
   ├── Market Regime + Structure + CVD
   ├── Volatility + Macro + Big Tech
   ├── V3: Warnings, Crash Banner, Non-Linear Score
   ├── V3: Position Sizing, BOS Validation
   ├── V3: On-Chain, Multi-Exchange CVD
   ├── V3: Edge Stats, Enhanced Regime
   └── AI Summary (V3-corrigido)
              │
              ▼
   setInterval → repete tudo a cada 5 minutos
```

---

## 12. Fórmula Final do Score {#12-formula-score}

### Caminho V1 → V2 → V3:

```
1. confluenceScore = Σ(13 indicadores × peso × direção)     [V1]

2. contextualScore = applyContextualScoring(confluenceScore)  [V2]
   + structureScore (BOS/CHoCH)
   + cvdAdvancedScore
   + macroNewsScore
   ± volatility/squeeze adjustments

3. orderFlowScore = funding + cvd + book + rsi + l/s          [V1]

4. totalV2Score = contextualScore + orderFlowScore             [V1+V2]
   Se ≥ +4 → LONG (V2)
   Se ≤ -4 → SHORT (V2)

5. V3 Enhancement:
   decorrelatedScore = decorrelate(confluenceDetails)          [V3]
   adaptedScore = applyAdaptive(decorrelatedScore)             [V3]
   
   rawScore = adaptedScore + orderFlowScore
            + (macroScore + bigTechScore) × correlationMultiplier
            + onChainScore + multiExchangeScore                [V3]
   
   Se crash + score oposto: rawScore × 0.2                    [V3]
   
   SCORE FINAL = 35 × tanh(rawScore / 20)                     [V3]
   
   threshold = crash ? 6 : 4
   Se SCORE ≥ +threshold → LONG
   Se SCORE ≤ -threshold → SHORT
   Se confiança < 40% → NEUTRO (confidence gate)
   Senão → NEUTRO
```

---

## 13. Interface Renderizada {#13-ui}

Seções do modal de Análise Técnica (de cima para baixo):

1. **Header** — Nome da crypto + imagem
2. **Signal Card** — LONG/SHORT/NEUTRO + confiança% + badge V3 Engine
3. **Entry/SL/TP1-TP2-TP3** — Preços de entrada/saída + R:R ratios
4. **Market Regime** — Ícone + ADX + BB Percentile + força%
5. **Market Structure** — BOS/CHoCH 1h e 4h + sweep detection
6. **CVD Avançado** — Delta + divergência + absorção
7. **Volatilidade** — ATR 1h/4h + BB width + regime atual
8. **Macro & News** — Calendário econômico + notícias crypto
9. **Big Tech & Macro** — Ações tech + SP500 + VIX + DXY + Treasuries
10. **Análise Gráfica** — 12 padrões em 3 timeframes + MAs
11. **Confluência** — Lista de todos indicadores + sinais + pesos
12. *[V3]* **Alertas & Limitações** — Warnings dinâmicos
13. *[V3]* **Crash/Black Swan Detector** — RoC + severidade + overrides
14. *[V3]* **Score Não-Linear V3** — Fórmula + raw/compressed + componentes
15. *[V3]* **Gestão de Risco & Posição** — % banca + Kelly + breakdown
16. *[V3]* **Validação de BOS** — REAL/FAKE_SWEEP/UNCONFIRMED
17. *[V3]* **On-Chain** — Mempool + Hash Rate + Stablecoins
18. *[V3]* **CVD Multi-Exchange** — Binance + Bybit + OKX + divergência
19. *[V3]* **Edge & Performance** — Win Rate + Profit Factor + by regime
20. *[V3]* **Regime Aprimorado** — Squeeze direction + false breakout
21. **Análise da IA** — Texto narrativo com V3 signal/confidence
22. **Última atualização** — Timestamp + "Atualiza a cada 5 min" + tempo V3

---

## 14. Tabela de Pesos dos Indicadores {#14-pesos}

| Indicador | Peso Base | Família V3 | Max Efetivo |
|---|---|---|---|
| RSI 15m | 2.0 | MOMENTUM | 2 de 6 |
| RSI 1h | 2.0 | MOMENTUM | ↑ |
| RSI 4h | 2.0 | MOMENTUM | ↑ |
| Stochastic 1h | 1.5 | MOMENTUM | ↑ |
| MACD 1h | 1.0 | MOMENTUM | ↑ |
| MACD 4h | 1.0 | MOMENTUM | ↑ |
| EMA 200 (1h) | 1.5 | TREND | 2 de 3 |
| EMA 200 (4h) | 1.5 | TREND | ↑ |
| ADX 1h | 1.0 | TREND | ↑ |
| Net Volume 1h | 1.0 | VOLUME | 2 de 2 |
| Net Volume 4h | 1.0 | VOLUME | ↑ |
| VWAP | 1.0 | PRICE | 1 de 1 |
| Liq. Estimadas | 1.5 | LEVERAGE | 1 de 1 |

**Peso efetivo** = Peso base × Contextual V2 (0.3-1.5) × Decorrelation V3 (0.4 ou 1.0) × Adaptive V3 (0.5-1.5)

---

## 15. Limitações Conhecidas {#15-limitacoes}

1. **Latência de dados**: APIs REST têm delay de ~1-5 segundos. Não é websocket/realtime.
2. **On-chain limitado**: Somente BTC e ETH têm dados on-chain.
3. **CORS**: Yahoo Finance precisa de proxies CORS que podem falhar.
4. **Sem ML verdadeiro**: Adaptive weights usam EWMA, não gradient descent.
5. **Forward testing é local**: Dados ficam no localStorage do dispositivo — se limpar dados, perde histórico.
6. **APIs gratuitas**: blockchain.info, CoinGecko, CryptoPanic têm rate limits.
7. **Moedas menores**: Bybit/OKX podem não ter pares como DOGEUSDT-SWAP.
8. **Câmbio único por vez**: Análise é para 1 par/moeda. Não analisa portfolio.
9. **Sem dados de derivativos complexos**: Não analisa options greeks, implied volatility surfaces.
10. **Confiança ≠ Certeza**: Mesmo com 90% de confiança, o mercado pode fazer o oposto.

---

> **Resumo**: O sistema combina 28+ indicadores em 3 camadas (V1+V2+V3), consulta 10 domínios de API (~28 endpoints), aplica compressão não-linear tanh, gestão de risco por Kelly Criterion, e se auto-atualiza a cada 5 minutos de forma 100% client-side, escalável para qualquer número de usuários.
