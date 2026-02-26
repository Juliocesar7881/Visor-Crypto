# VISOR CRYPTO — ANÁLISE TÉCNICA AVANÇADA
## Documentação Completa do Sistema de Análise

> Última atualização: Fevereiro 2026 — Engine v7.0.0 (27+ Módulos + V7 AI News + Macro Liquidity)

---

## VISÃO GERAL

O sistema de análise técnica funciona em **três camadas** (engines), processadas em sequência:

```
ta-engine-v2.js  →  ta-engine-v3.js  →  ta-engine-v4.js  →  SINAL FINAL
    [Base]             [NL Score]          [27+ Módulos]
  Indicadores        Classificação        Gates + Regime
  Tradicionais        por Score           + OI + Spoof
                                          + V5 Contexto
                                          + V6 Calibração
                                          + V6.1 Vol Regime
                                          + V6.1 Breadth
                                          + V7 Macro Liquidity
                                          + V7 Extended Pairs
```

A análise sempre começa no v2 (cálculos base), passa pelo v3 (pontuação e regime), e termina no v4 que aplica todos os filtros de qualidade e decide o sinal final. Os Módulos 18–23 (V5) enriquecem o resultado com contexto de mercado. **V6 adiciona:** thresholds dinâmicos por ativo, pesos de gate adaptativos por regime, calibração logística (sigmoid), penalização de redundância, separação entry/timing, expectancy real, macro regime, risco sistêmico, e notificações FCM com threshold configurável (70-100%). **V6.1 adiciona:** reconciliation loop (safety net contra posições órfãs), slippage penalty no backtesting (0.02% + strict fill), key validation diária + FCM alert, volatility regime shift detector (ATR EMA ratio), BTC correlation multi-window (12h/24h/72h), market breadth (% de ativos confirmados), position sizing por Half-Kelly, top opportunities ranking, e UI limpa de loading. **V7.0 adiciona:** macro liquidity index (Fed, ECB, BoJ, BoE, PBoC), AI-powered news filtering (Groq/Llama), entry/continuation score split, extended redundancy pairs (10+), Bayesian fingerprint database, e UI layout simplificado.

---

## DADOS BUSCADOS (17 chamadas à API Binance + 1 extra V5)

Todos os dados vêm da **Binance** em paralelo, atualizados a cada 5 minutos.

| # | API | Endpoint | O que traz |
|---|-----|----------|-----------|
| 1 | `klines1m` | Binance Spot | 60 candles de 1 minuto |
| 2 | `klines5m` | Binance Spot | 60 candles de 5 minutos |
| 3 | `klines15m` | Binance Spot | 100 candles de 15 minutos |
| 4 | `klines1h` | Binance Spot | 100 candles de 1 hora |
| 5 | `klines4h` | Binance Spot | 100 candles de 4 horas |
| 6 | `klines1d` | Binance Spot | 50 candles diários |
| 7 | `ticker24h` | Binance Spot | Variação 24h, volume, preço atual |
| 8 | `orderBook` | Binance Spot | 100 níveis bid/ask (profundidade) |
| 9 | `fundingRate` | Binance Futures | Taxa de funding atual |
| 10 | `openInterest` | Binance Futures | OI total atual em contratos |
| 11 | `openInterestHist` | Binance Futures | 12 períodos de 5min de OI histórico |
| 12 | `longShortRatio` | Binance Futures | Ratio long/short de todas as contas (1h) |
| 13 | `topLongShortPosition` | Binance Futures | Ratio de top traders por posição (1h) |
| 14 | `topLongShortAccount` | Binance Futures | Ratio de top traders por conta (1h) |
| 15 | `takerBuySellVol` | Binance Futures | Volume taker buy/sell (24 períodos de 1h) |
| 16 | `forceOrders` | Binance Futures | Últimas 100 ordens de liquidação forçada |
| 17 | `trades` | Binance Spot | Últimos 500 trades (para CVD) |
| V5 | `BTC klines1h` | Binance Spot | 100 candles BTC 1h (cache 5min) — **somente para altcoins** |

### Multi-Exchange (Backend — V5)

O backend agora coleta dados adicionais de **OKX** e **Bybit** para cross-referência:

| Exchange | Dado | Endpoint |
|----------|------|----------|
| OKX | Open Interest em contratos SWAP | `https://www.okx.com/api/v5/public/open-interest` |
| OKX | Funding rate | `https://www.okx.com/api/v5/public/funding-rate` |
| Bybit | Open Interest histórico 5min | `https://api.bybit.com/v5/market/open-interest` |
| Bybit | Funding rate | `https://api.bybit.com/v5/market/funding/history` |

Divergência cross-exchange detectada quando diferença > 15% entre exchanges → sinaliza manipulação potencial.

---

## SEPARAÇÃO: O QUE INFLUENCIA O SINAL vs O QUE É INFORMATIVO

### ✅ DADOS QUE ENTRAM DIRETO NA CONFLUÊNCIA DO SINAL

| Dado | Como é usado | Gate relacionada |
|------|-------------|-----------------|
| `klines1h` (crítico) | Displacement Z-Score, Volume Z-Score, Range Position, CVD, Microestrutura, BOS | Displacement, Volume Z, BOS, Range, CVD |
| `klines4h` (crítico) | Displacement 4h, Volume 4h, Regime (EMA 20/50), Saturação | Displacement, Volume Z |
| `currentPrice` (crítico) | Range Position, cálculo de stops, todos os comparativos | Range, Aceitação Breakout |
| `orderBook` | Anti-Spoofing: imbalance bid/ask, paredes suspeitas | Gate Anti-Spoof OK |
| `fundingRate` | Funding Filter: extremo bloqueia operação | Gate Funding OK |
| `trades` (500) | CVD em USD: acumula pressão compradora/vendedora real | Gate CVD Confirma |
| `openInterest` | OI atual para percentual de variação | Gate OI Confirma |
| `openInterestHist` | OI Delta: variação nos últimos 60 min | Gate OI Confirma |
| `takerBuySellVol` | Taker bias (BULLISH/BEARISH) — complementa OI Delta | Gate OI Confirma |
| `forceOrders` | Contagem de liquidações last 1h: long vs short squeeze | Gate OI Confirma |

### 📊 DADOS INFORMATIVOS (NÃO VEDAM O SINAL — contexto de qualidade)

| Dado | O que mostra | Uso real |
|------|-------------|---------|
| `longShortRatio` | % de contas compradas vs vendidas | Exibição na UI |
| `topLongShortPosition/Account` | Top traders | Exibição na UI |
| `ticker24h` | Variação 24h | Exibição na UI |
| `klines1m/5m` | Granularidade fina | Exibição MTF |
| `klines1d` | EMA 200 diário no v2 | Contexto macro |
| **BTC klines (V5)** | Correlação Pearson, BTC trend | Painel BTC Alignment — não veda |
| **Score Percentile (V5)** | Ranking relativo entre ativos | Painel Percentil — não veda |
| **Setup History (V5)** | Win rate histórico do fingerprint | Painel Histórico — não veda |
| **Regime Quality (V5)** | ADX + Vol — classifica saúde do regime | Label no painel Regime |
| **Saturation (V5)** | % do ATR 4h já percorrida | Barra de saturação |
| **Multi-Exchange OI (V5)** | OI cross Binance/OKX/Bybit | Exibição na UI |

**Regra de ouro:** Os módulos V5 (18–23) não possuem gates próprias — eles enriquecem o contexto exibido mas não bloqueam nem confirmam sinais. A decisão de entrar ou não segue exclusivamente as 9 gates dos módulos 1–13.

---

## PIPELINE COMPLETO DE ANÁLISE

### CAMADA 1: ta-engine-v2.js — Indicadores Base

- **RSI** em 15m, 1h, 4h — com divergências
- **EMA 200** em 1h e 4h — define viés macro
- **Bollinger Bands** — squeeze e extremos
- **MACD** — momento de curto prazo
- **ATR** — volatilidade real
- **Volume Profile** (VAH, VAL, POC) — range de negociação
- **Market Structure** (HH/HL/LH/LL) — tendência de estrutura
- **Market Regime** — classificação inicial
- **CVD Avançado** — calculado em USD: `volume = quantidade × preço`
- **ADX** — força da tendência

### CAMADA 2: ta-engine-v3.js — Pontuação e Classificação

- **Score ponderado** por confluência
- **Sinal direcional** (LONG / SHORT / NEUTRO)
- **Crash Detection** — variação extrema bloqueia
- **Volatile Market Detection** — força AGUARDAR
- **Regime refinado** — ADX, MA alignment, momentum

### CAMADA 3: ta-engine-v4.js — 23 Módulos

Recebe o sinal do v3 e aplica filtros institucionais (Módulos 0–17) + contexto V5 (Módulos 18–23).

---

## OS 23 MÓDULOS DO ENGINE V5 (v5.1.0)

### Módulo 0 — Data Integrity Gate

Valida dados **críticos**: `klines1h`, `klines4h`, `currentPrice`
- Ausentes → `FORCE_NEUTRO` imediato, análise encerrada.

Valida dados **importantes**: `orderBook`, `trades`, `fundingRate`
- Ausentes → qualidade reduzida (score 70/100), análise continua.

```
Score 100 → todos os dados disponíveis
Score 70  → dados importantes indisponíveis
Score 0   → dados críticos ausentes → FORCE_NEUTRO
```

---

### Módulo 1 — Z-Score Statistical Engine

A pergunta não é _"volume é 1.3× a média?"_, mas _"quão anômalo é este volume em relação aos últimos 100 candles?"_

- Calcula média e σ de: corpo, volume, range, wick
- Z-Score > 2.0 = percentil 95 = significativo
- Adaptativo: adapta automaticamente a eventos macro (CPI, etc.)

---

### Módulo 2 — Session Context & Kill Zones

| Sessão (UTC) | BRT | Multiplicador | Risco de Fake BO |
|-------------|-----|---------------|-----------------|
| Asiática (0–7h) | 21–4h | 0.6× | ALTO |
| Abertura Londres (7–9h) | 4–6h | 1.3× | MÉDIO |
| Londres (9–12h) | 6–9h | 1.0× | MÉDIO |
| **Kill Zone (12–16h)** | **9–13h** | **1.5×** | **BAIXO** |
| Nova York (16–20h) | 13–17h | 1.0× | MÉDIO |
| Fechamento NY (20–21h) | 17–18h | 0.8× | MÉDIO |
| Zona Morta (21–24h) | 18–21h | 0.4× | ALTO |
| Fim de semana | qualquer | máx 0.5× | MUITO ALTO |

---

### Módulo 3 — Displacement Detector (Z-Score)
- Corpo do candle com z-score ≥ 2.0 **E** volume z-score ≥ 1.5 = displacement institucional
- Verificado em 1h e 4h, apenas na direção do trade

---

### Módulo 4 — Volume Expansion (Z-Score)
- Volume médio dos últimos 3 candles com z-score ≥ 2.0 = expansão
- "Sustentado" = 2 dos 3 candles individualmente anômalos

---

### Módulo 5 — Range Position Detector
- Estados: `ABOVE_RANGE`, `BELOW_RANGE`, `NEAR_VAH`, `NEAR_VAL`, `AT_POC`, `MID_RANGE`
- `tradeable = true` apenas com breakout + candle fechado fora
- `MID_RANGE` e `AT_POC` → bloqueados (sem edge)

---

### Módulo 6 — Retest Detector + Limit Order Generator
- Qualidade do retest: `STRONG` (rejeição > 70%), `MODERATE`, `WEAK`
- Gera: Entry, Stop Loss, TP1 (1:2), TP2 (1:3)
- Sem reteste → Limit Order no nível de breakout
- Com reteste confirmado → Market Order agora

---

### Módulo 7 — Funding Rate Filter
- Funding > +0.05% + LONG → bloqueado
- Funding < -0.05% + SHORT → bloqueado

---

### Módulo 8 — Microstructure Detection
- **Absorption**: wick > 60% do range
- **FVG**: gap entre candles > 0.15%
- **Liquidity Void**: corpo > 85% do range

---

### Módulo 9 — Squeeze Expansion
- Squeeze sem expansão de volume → rebaixa CONFIRMED para AGUARDAR
- Expansão de squeeze com volume → reforça o sinal

---

### Módulo 10 — Data Integrity (veja Módulo 0)

---

### Módulo 11 — Open Interest Analysis (OI + OI Delta)

Usa: `openInterest`, `openInterestHist`, `takerBuySellVol`, `forceOrders`

| Pattern | Condição | Direção |
|---------|----------|---------|
| Short Squeeze 🔥 | OI caindo rápido + shorts liquidados > 2× | LONG |
| Long Squeeze 🔥 | OI caindo rápido + longs liquidados > 2× | SHORT |
| Long Buildup 📈 | OI subindo + taker bias BULLISH | LONG |
| Short Buildup 📉 | OI subindo + taker bias BEARISH | SHORT |
| Fake Breakout ⚠️ | OI caindo + liquidações | NENHUMA |
| Neutro | Variação < 1% | Confirma qualquer |

**Thresholds:** OI Delta > 5% = RISING_FAST, < -5% = FALLING_FAST. Taker ratio > 1.1 = BULLISH.

---

### Módulo 12 — Anti-Spoofing (Order Book Delta)

Usa: `orderBook` (100 níveis)

| Tipo | Threshold | Risco |
|------|-----------|-------|
| Imbalance bid/ask | > 3:1 | HIGH |
| Parede isolada | Único nível > 5% do depth | MEDIUM |
| Spread alto | > 0.1% | MEDIUM |

> **V5 — WebSocket Anti-Spoofing (backend):** O servidor também monitora `wss://stream.binance.com:9443/ws/{symbol}@depth20@100ms` em tempo real. Paredes ≥ $500K que desaparecem em < 30s são registradas. Após 2 eventos em 10 min, o símbolo recebe flag de spoof ativo. Consultado via `GET /api/analysis/spoof/{symbol}`.

---

### Módulo 13 — Enhanced 6-State Regime

| Estado | Ícone | ATR % | Risco Fake BO |
|--------|-------|-------|---------------|
| COMPRESSION | 💎 | < 20° perc. | ALTO |
| HIGH_VOL | 🌋 | > 85° perc. | MÉDIO |
| EXPANSION_UP | 🚀 | > 60° perc. | BAIXO |
| EXPANSION_DOWN | 💀 | > 60° perc. | BAIXO |
| TREND_UP | 📈 | médio | BAIXO |
| TREND_DOWN | 📉 | médio | BAIXO |
| RANGE | ⚖️ | médio | MÉDIO |

**O regime define minGates e minScore necessários para CONFIRMED:**

| Regime | Com a tendência | Contra a tendência |
|--------|----------------|--------------------|
| BULL_TREND | 4 gates, score ≥ 55 | 6 gates, score ≥ 75 |
| STRONG_BULL | 4 gates, score ≥ 50 | 7 gates, score ≥ 80 |
| BEAR_TREND | 4 gates, score ≥ 55 | 6 gates, score ≥ 75 |
| STRONG_BEAR | 4 gates, score ≥ 50 | 7 gates, score ≥ 80 |
| RANGING | 6 gates, score ≥ 70 | 6 gates, score ≥ 70 |
| VOLATILE | 5 gates, score ≥ 65 | 5 gates, score ≥ 65 |

---

### Módulos 14–17 — Risk Engine, Stability, Bot, Collective

**Risk Engine (14):** Position sizing por ATR. Kill switch: 3 perdas → pausa 4h. Drawdown diário > 3% → para.

**Model Stability (15):** Rolling 20 trades. WR < 30% → força AGUARDAR.

**Bot Integration (16):** Webhook formatter para TradingView/3Commas/Alertatron.

**Collective Intelligence (17):** Envio anônimo de resultados, consenso entre dispositivos.

---

## MÓDULOS V5 — DIAGNÓSTICO E CONTEXTO (18–23)

> Estes módulos **não vedam nem confirmam** o sinal. Respondem às perguntas: _"Está alinhado com o mercado? Este setup historicamente funciona? O movimento ainda tem espaço? A estrutura é estável ou frágil?"_

---

### Módulo 18 — BTC Alignment
**Responde:** _"A altcoin está se movendo com ou contra o Bitcoin?"_

- Busca `BTCUSDT` klines 1h (cache 5 min via `vc4_btc_klines_cache`)
- Calcula **Correlação de Pearson** nos retornos das últimas **48 horas**
- Calcula tendência BTC via EMA 20 vs EMA 50
- Calcula **Força Relativa**: `altMomentum - btcMomentum` (últimas 24 velas)

| Alinhamento | Condição | Risco |
|-------------|----------|-------|
| ALIGNED ✅ | Trade vai na direção do BTC | LOW |
| DIVERGING ⚠️ | Trade oposto ao BTC + correlação > 0.7 | HIGH |
| DIVERGING ⚠️ | Trade oposto ao BTC + correlação ≤ 0.7 | MEDIUM |
| NEUTRAL | BTC lateralizado | LOW |
| SELF | Ativo é BTC | N/A |

**Exibido na UI:** Correlação (-1 a 1), BTC Trend (UP/DOWN/NEUTRAL), Força Relativa (%), Risco (LOW/MEDIUM/HIGH).

Cache: localStorage com TTL 5 minutos. Para BTCUSDT retorna `alignment: SELF`.

---

### Módulo 19 — Score Percentile
**Responde:** _"O score deste ativo é forte ou fraco comparado ao mercado agora?"_

- Cada análise salva `{ confidence, gateScore, passedGates }` por símbolo em `vc4_score_history` (TTL 15 min)
- Calcula o **percentil** da confiança atual de um ativo vs todos os outros analisados recentemente

| Percentil | Descrição |
|-----------|-----------|
| ≥ 90 | 🏆 Top 10% — entre os mais fortes |
| 70–89 | 📈 Acima da média |
| 30–69 | ➖ Na média |
| < 30 | 📉 Abaixo da média |

Retorna: `percentile` (0–100), `rank` (1/N), `total` (N ativos com dados), `description`.

Requer mínimo 3 ativos com dados recentes para calcular percentil. Abaixo disso retorna `available: false`.

---

### Módulo 20 — Setup History Statistics
**Responde:** _"Historicamente, quando este padrão aparece, qual é o resultado?"_

**Fingerprint** do setup = `regime + oiSignal + cvdDirection + displacement`:

```
Exemplo: "EXPANSION_UP+LONG_BUILDUP+bullish+LONG"
```

Cada resultado de trade (win/loss + R múltiplo) é registrado em `vc4_setup_history` (max 500 entradas) via `recordSetupOutcome(fingerprint, won, rMultiple)`.

| Qualidade | Condição |
|-----------|----------|
| EXCELENTE 🏆 | WR ≥ 60% E avgR ≥ 1.0 |
| BOM 👍 | WR ≥ 50% E avgR ≥ 0.8 |
| MÉDIO 🤔 | WR ≥ 40% |
| FRACO ⚠️ | WR < 40% |

Retorna: `winRate` (%), `avgR` (R médio), `count` (amostras), `quality`. Abaixo de 3 amostras → `available: false`.

**Nota:** Os dados são locais por dispositivo. Quanto mais o usuário usar o app e registrar resultados, mais preciso fica.

---

### Módulo 21 — Regime Quality Classifier
**Responde:** _"TREND_UP está acelerando, estável, ou enfraquecendo?"_

Usa: `enhancedRegimeV4.adx`, `enhancedRegimeV4.atrPercentile`, `volumeExpansion.expanding`, `volumeExpansion.sustained`

| Regime base | ADX + Volume | Qualidade | Emoji | Score |
|------------|-------------|----------|-------|-------|
| TREND_UP/DOWN | ADX > 40 + vol expandindo | Acelerando | 🔥 | 95 |
| TREND_UP/DOWN | ADX > 40 ou ADX > 30 + vol sustentado | Forte | 💪 | 80 |
| TREND_UP/DOWN | ADX > 30 | Estável | ✅ | 65 |
| TREND_UP/DOWN | ADX 25–30 | Fraco | ⚠️ | 40 |
| TREND_UP/DOWN | ADX < 25 | Enfraquecendo | 📉 | 25 |
| HIGH_VOL | qualquer | Perigoso | 🌋 | 20 |
| RANGE/COMPRESSION | ATR baixo + ADX < 20 | Estável | 🔒 | 50 |
| RANGE/COMPRESSION | ATR alto | Instável | ⚡ | 30 |

Retorna: `quality`, `qualityEmoji`, `qualityScore` (0–100), `adxLevel`, `details`.

---

### Módulo 22 — Saturation / Extension Indicator
**Responde:** _"O movimento já está exausto ou ainda tem espaço?"_

**Método:** Calcula o ATR de 14 períodos do 4h. Mede a distância entre o preço atual e a abertura do candle 4h corrente. A saturação é a % do ATR já percorrida.

$$\text{saturação} = \frac{|\text{preço} - \text{open}_{4h}|}{\text{ATR}_{14}(4h)} \times 100$$

| Saturação | Risco | Emoji | Descrição |
|-----------|-------|-------|-----------|
| ≥ 85% | HIGH | 🔴 | Estendido — risco de pullback |
| 60–84% | MEDIUM | 🟡 | Moderado — cuidado com late entry |
| 30–59% | LOW | 🟢 | Espaço disponível — entrada boa |
| < 30% | VERY_LOW | 🟢 | Início do movimento — timing ótimo |

Também verifica se o preço está se movendo **na direção pretendida** (`movingWithDirection`).

Exibido na UI como uma **barra de progresso** de 0% a 100%.

---

### Módulo 23 — Notification Configuration
**Propósito:** Controlar quando o app envia notificações locais (Capacitor Local Notifications).

Configuração armazenada em `vc4_notif_config` por símbolo ou globalmente (`__global__`).

**4 tipos de trigger configuráveis:**

| Trigger | Condição | Prioridade |
|---------|----------|-----------|
| `SETUP_CONFIRMED` | Sinal passou de não-CONFIRMED para CONFIRMED | HIGH |
| `CONFIDENCE_THRESHOLD` | Confiança cruzou o limiar configurado (ex: 70%) | MEDIUM |
| `REGIME_CHANGE` | Regime mudou (e.g. RANGE → TREND_UP) | MEDIUM |
| `SCORE_JUMP` | Gate score subiu ≥ N% (padrão: 10%) | LOW |

Funções: `getNotificationConfig(symbol)`, `setNotificationConfig(symbol, config)`, `checkNotificationTriggers(symbol, analysis, prevAnalysis)`.

---

## MÓDULOS V6.1 — SEGURANÇA E ANÁLISE AVANÇADA (24–26)

> **V6.1.0** adiciona 3 novos módulos focados em segurança operacional e análise de mercado mais profunda. Estes módulos não são painéis independentes — eles se integram ao pipeline existente para melhorar a qualidade do sinal.

---

### Módulo 24 — Volatility Regime Shift Detector
**Responde:** _"A volatilidade está mudando estruturalmente?"_

Usa **ATR EMA ratio** para detectar mudanças estruturais na volatilidade:
- **ATR Fast:** EMA(20) do True Range
- **ATR Slow:** EMA(100) do True Range
- **Ratio:** ATR Fast / ATR Slow

| Shift State | Condição | Ajuste Confiança | Ação Recomendada |
|------------|----------|------------------|------------------|
| EXPLOSIVE 🌋 | ratio ≥ 1.5 | -5% | SL mais amplo — mercado volátil |
| COMPRESSED 🧊 | ratio ≤ 0.6 | +5% | Breakout iminente — timing favorável |
| TRANSITIONING_UP 📈 | ratio 1.2–1.5 | 0% | Monitorar expansão |
| TRANSITIONING_DOWN 📉 | ratio 0.6–0.8 | 0% | Contração em curso |
| STABLE ⚖️ | ratio 0.8–1.2 | 0% | Volatilidade normal |

**Métricas Adicionais:**
- **Aceleração:** Variação % do TR médio (últimos 10 vs 10 anteriores) — detecta se o shift está acelerando
- **Confidence Score:** Baseado na intensidade do desvio (0–95%)

**Integração no Pipeline:**
- Se EXPLOSIVE + CONFIRMED → warning "usar SL mais amplo" + reduz confiança 5%
- Se COMPRESSED + CONFIRMED → boost de confiança 5% + "breakout favorável"
- Exibido no novo painel **Regime de Volatilidade** na UI

---

### Módulo 25 — Dynamic BTC Correlation Multi-Window
**Responde:** _"A correlação com BTC é estável ou está mudando?"_

**Upgrade do Módulo 18 (BTC Alignment):** Em vez de uma única janela de correlação fixa (48h), agora calcula **3 janelas simultâneas:**

| Janela | Peso | Uso |
|--------|------|-----|
| 12h | 0.5 | Correlação de curto prazo (movimentos recentes) |
| 24h | 0.3 | Correlação de médio prazo (tendência diária) |
| 72h | 0.2 | Correlação de longo prazo (tendência macro) |

**Cálculo:**
1. Pearson Correlation nos retornos de cada janela
2. Weighted Average: `corr = 0.5×corr12h + 0.3×corr24h + 0.2×corr72h`
3. **Correlation Trend:** Compara corr12h vs corr72h — INCREASING, DECREASING, STABLE
4. **Dominant Window:** Janela com maior correlação absoluta

**Vantagens:**
- Detecta **divergências temporais**: alt pode estar correlacionada no longo prazo mas divergindo no curto
- **Correlation Trend INCREASING** + DIVERGING = risco crescente
- **Correlation Trend DECREASING** + ALIGNED = força relativa aumentando

**Exibido na UI:** Painel BTC Alignment agora mostra:
- Matriz de correlações (12h / 24h / 72h)
- Janela dominante
- Tendência da correlação (INCREASING/DECREASING/STABLE)

---

### Módulo 26 — Market Breadth (Cross-Asset Sentiment)
**Responde:** _"O mercado inteiro está alinhado ou só este ativo?"_

Analisa **todos os símbolos recentemente analisados** (cache de 15 min) para calcular o sentimento do mercado:

$$\text{breadth\_long} = \frac{\text{ativos com sinal LONG}}{\text{total de ativos}} \times 100$$

$$\text{breadth\_short} = \frac{\text{ativos com sinal SHORT}}{\text{total de ativos}} \times 100$$

**Thresholds:**
- **STRONG_ALIGNED:** > 65% do mercado na mesma direção → boost +8 confiança
- **WEAK/DIVERGING:** < 35% na mesma direção → penaliza -10 confiança
- **NEUTRAL:** Entre 35–65% → sem ajuste

**Exemplo:**
- LONG setup com breadth 72% bullish → `🟢 Breadth FORTE: 72% do mercado bullish — confirma LONG` → +8%
- SHORT setup com apenas 25% bearish → `🔴 Breadth CONTRA: apenas 25% bearish — SHORT contra a maré` → -10%

**Dados Usados:**
- `vc4_score_history` (confiança + gates por símbolo)
- `vc4_signal_directions` (direção LONG/SHORT/NEUTRAL por símbolo)
- Requer mínimo 3 ativos com dados recentes

**Integração no Pipeline:**
- Calcula breadth antes da decisão final
- Aplica boost/penalidade à confiança
- Exibido no novo painel **Market Breadth** na UI com barra visual (Long% / Neutral% / Short%)

**Cache:** `vc4_market_breadth` com TTL de 3 min

---

## AS 9 GATES DE CONFLUÊNCIA

$$\text{gateScore} = \frac{\sum(\text{peso das gates passadas})}{\sum(\text{peso de todas as gates})} \times 100 \times \text{multiplicador de sessão}$$

| Gate | Peso | Dados usados | O que verifica |
|------|------|-------------|----------------|
| **BOS Confirmado** | 2.0 | klines1h, trades (CVD), volume | Break of Structure com volume + CVD confirmado |
| **Displacement Z-Score** | 2.0 | klines1h, klines4h | Corpo ≥ 2.0σ acima da média dos últimos 100 candles |
| **Volume Z-Score** | 1.5 | klines1h, klines4h | Volume médio recente ≥ 2.0σ, sustentado 2/3 candles |
| **CVD Confirma** | 1.5 | trades (500, em USD) | Delta cumulativo buy-sell na direção do sinal |
| **Fora do Range** | 2.0 | klines1h, Volume Profile | Preço saiu do VAH/VAL, não está no mid/POC |
| **Funding OK** | 1.0 | fundingRate | Funding não está extremo contra a direção |
| **Aceitação Breakout** | 1.5 | klines1h | Candle de 1h fechou fora do range |
| **OI Confirma** | 1.5 | openInterest, openInterestHist, takerVol, forceOrders | OI Delta ok, sem fake breakout |
| **Anti-Spoof OK** | 1.0 | orderBook (100 níveis) | Sem manipulação no book |

**Total máximo:** 14.0 pontos ponderados.

---

## DETERMINAÇÃO DO SINAL FINAL

```
1. FORCE_NEUTRO se DataIntegrity.valid = false
        ↓
2. Avaliar 9 gates → gateScore (0–100)
        ↓
3. Aplicar multiplicador de sessão ao gateScore
        ↓
4. Consultar regime → minGates e minScore necessários
        ↓
5. Verificar crash (v3 crash detection)
        ↓
6. passedCount >= minGates AND gateScore >= minScore → CONFIRMED
   passedCount >= 2 → AGUARDAR
   Caso contrário → NEUTRO
        ↓
7. Squeeze sem expansão? → rebaixa CONFIRMED para AGUARDAR
        ↓
8. Model Stability < 30% WR? → força AGUARDAR
        ↓
9. Risk Engine Kill Switch? → força NEUTRO
        ↓
10. Sessão morta + confiança < 45? → rebaixa para AGUARDAR
        ↓
11. FalseBreakoutRisk = HIGH + confiança < 45? → rebaixa para AGUARDAR
        ↓
12. Módulos V5 (18–23) adicionam contexto ao objeto resultado (não vetam)
```

| Sinal | Significado | Ação |
|-------|-------------|------|
| `LONG_CONFIRMED` | Todas as gates e regime ok | Executar |
| `SHORT_CONFIRMED` | Todas as gates e regime ok | Executar |
| `AGUARDAR_LONG` | Estrutura formando, gates insuficientes | Aguardar |
| `AGUARDAR_SHORT` | Estrutura formando, gates insuficientes | Aguardar |
| `NEUTRO` | Sem viés, dados ruins ou crash | Não operar |

---

## CVD — COMO É CALCULADO

```javascript
// Para cada trade dos últimos 500:
const usdVol = quantidade × preço;

if (isBuyerMaker === false) {
    buyVolume += usdVol;  // Compra agressiva (market buy)
} else {
    sellVolume += usdVol; // Venda agressiva (market sell)
}

CVD_delta = buyVolume - sellVolume;
CVD_percent = buyVolume / (buyVolume + sellVolume) × 100;
```

`isBuyerMaker = false` → comprador usou market order (agressivo). Usar USD elimina distorções de contratos com tamanhos diferentes.

---

## FLUXO VISUAL COMPLETO (V6.1)

```
17 APIs Binance + BTC klines (cache 5min)
                    │
                    ▼
  ──── CAMADA 1 — v2 ─────────────────────────────────
  RSI, EMA, MACD, ATR, Bollinger, Volume Profile,
  Market Structure, ADX, CVD em USD
                    │
                    ▼
  ──── CAMADA 2 — v3 ─────────────────────────────────
  Score ponderado, Direção, Regime inicial,
  Crash Detection, NL scoring (Tanh)
                    │
                    ▼
  ──── CAMADA 3 — v4 (Módulos 0–17) ─────────────────
  [0]  DataIntegrity       → FORCE_NEUTRO se crítico falhar
  [1]  Z-Score Engine      → normaliza todos os limiares
  [2]  Session Context     → Kill Zone 1.5× / Dead Zone 0.4×
  [3]  Displacement 1h/4h  → corpo ≥ 2.0σ na direção
  [4]  Volume Expansion    → volume ≥ 2.0σ, sustentado
  [5]  Range Position      → breakout + aceitação necessária
  [6]  Retest + Limit Gen  → ordens Entry/SL/TP1/TP2
  [7]  Funding Filter      → extremo bloqueia
  [8]  Microstructure      → absorption, FVG, liquidity void
  [9]  Squeeze Block       → sem expansão → rebaixa
  [10] OI + OI Delta       → Long/Short Squeeze, Buildup, Fake
  [11] Anti-Spoofing       → book imbalance, paredes
  [12] 6-State Regime      → define minGates e minScore
  [13] ── 9 GATES ──       → gateScore × sessão × regime
  [14] Risk Engine         → Kelly + ATR + Kill Switch
  [15] Model Stability     → Rolling WR, força AGUARDAR < 30%
  [16] Bot Webhook         → formato para automação
  [17] Collective Sync     → dados anônimos backend
                    │
                    ▼
  ──── V5 — Módulos 18–23 (contexto, não vetam) ──────
  [18] BTC Alignment   → correlação Pearson 48h, força relativa
  [19] Score Percentile → ranking entre ativos analisados
  [20] Setup History   → WR + avgR do fingerprint local
  [21] Regime Quality  → Acelerando / Forte / Fraco / Enfraquecendo
  [22] Saturation      → % do ATR 4h já percorrida
  [23] Notifications   → triggers configuráveis por símbolo
                    │
                    ▼
  ──── V6.1 — Módulos 24–26 (análise avançada) ───────
  [24] Vol Regime Shift → ATR EMA(20)/EMA(100) ratio
                          EXPLOSIVE/COMPRESSED/TRANSITIONING
                          ajusta confiança ±5%, alerta SL amplo
  [25] BTC Multi-Window → corr 12h/24h/72h (weighted avg)
                          correlation trend, dominant window
                          detecta divergências temporais
  [26] Market Breadth   → % mercado LONG/SHORT/NEUTRAL
                          boost +8% se aligned > 65%
                          penalty -10% se < 35% mesma direção
                    │
                    ▼
   SINAL FINAL + CONFIANÇA + GATES + R:R + CONTEXTO V5 + V6.1
   
   BACKEND SAFETY NET (em paralelo):
   • Reconciliation Loop (30s) → detecta posições órfãs
   • Key Validation (24h) → auto-disable em auth failure
   • Slippage Penalty (backtesting) → 0.02% + strict fill
   • Kelly Sizing → Half-Kelly based on real expectancy
   • Top Opportunities → composite score ranking
```

---

## BACKEND — SERVIÇOS V5

### ws_antispoof.py — WebSocket Anti-Spoofing Detector

Conecta ao stream `wss://stream.binance.com:9443/ws/{symbol}@depth20@100ms` para os 5 símbolos mais líquidos: BTC, ETH, SOL, BNB, XRP.

**Lógica:**
- Monitora os top 20 níveis do book a cada 100ms
- Registra qualquer "parede" (wall) com valor ≥ $500K
- Se a parede desaparece em < 30 segundos → evento de spoof registrado
- 2 eventos em 10 min → `spoof_active = True` para o símbolo

**Endpoints:**
- `GET /api/analysis/spoof/{symbol}` — flag de spoof para um símbolo
- `GET /api/analysis/spoof` — todos os flags

Fallback automático para polling REST (5s) se biblioteca `websockets` não estiver instalada.

---

### multi_exchange.py — Agregador Multi-Exchange

Busca OI e funding em paralelo de: Binance Futures, OKX SWAP, Bybit Linear.

**Mapeamento de símbolos:**

| App | OKX | Bybit |
|-----|-----|-------|
| BTCUSDT | BTC-USDT-SWAP | BTCUSDT |
| ETHUSDT | ETH-USDT-SWAP | ETHUSDT |
| (idem para SOL, BNB, XRP, ADA, DOGE, AVAX) | | |

**Divergência OI:** Se diferença entre exchanges > 15% → `oiDivergence = True` com detalhes.

Cache: 5 minutos por símbolo.

**Endpoints:**
- `GET /api/analysis/multi-exchange/{symbol}`
- `GET /api/analysis/multi-exchange` — todos (com cache)

---

### auto_execution.py — Execução Automática via CCXT

Quando o engine gera `LONG_CONFIRMED` ou `SHORT_CONFIRMED`, este serviço pode colocar automaticamente uma **limit order** na exchange configurada pelo usuário.

**Segurança:**
- Chaves API armazenadas **apenas em memória** (nunca persistidas em disco)
- Apenas permissões de **leitura + trade** (nunca saque/withdraw)
- Apenas **limit orders** (nunca market)
- Limites duros: `MAX_POSITION_USD = $1.000`, `MAX_LEVERAGE = 5×`, `MAX_ORDERS = 10/hora`
- **Kill switch global** para emergências

**Exchanges suportadas via CCXT:** Binance Futures, OKX, Bybit

**Offset de limit order:** 0.1% abaixo do preço para compra, 0.1% acima para venda.

**Endpoints:**
- `POST /api/analysis/execution/configure` — configurar credenciais
- `DELETE /api/analysis/execution/configure/{user_id}` — remover
- `POST /api/analysis/execution/order` — executar ordem
- `POST /api/analysis/execution/kill-switch` — ativar/desativar kill switch
- `GET /api/analysis/execution/status` — status do serviço
- `GET /api/analysis/execution/history` — histórico de ordens

---

## PAINÉIS NA UI

### Painéis que influenciam o sinal

| Painel | Baseado em | Influencia sinal? |
|--------|-----------|-------------------|
| Sinal Principal | Gates 1–9 + Regime | ✅ Resultado final |
| Confirmações (9 gates) | Módulos 1–13 | ✅ Critérios do sinal |
| Sessão + Horário | Módulo 2 | ✅ Multiplica gate score |
| Regime de Mercado | Módulo 13 | ✅ Define min gates |
| OI Analysis | Módulo 11 | ✅ Gate OI Confirma |
| Anti-Spoofing | Módulo 12 | ✅ Gate Anti-Spoof OK |
| Integridade de Dados | Módulo 0 | ✅ FORCE_NEUTRO se crítico |
| Model Stability | Módulo 15 | ✅ Pode forçar AGUARDAR |
| Risk Engine | Módulo 14 | ✅ Kill switch = NEUTRO |

### Painéis V5 (contexto, não vedam)

| Painel V5 | Módulo | O que mostra |
|-----------|--------|-------------|
| BTC Alignment | 18 | Correlação Pearson, BTC trend, força relativa |
| Score Percentil | 19 | P0–P100 vs todos os ativos analisados |
| Histórico do Setup | 20 | Win rate + avgR do fingerprint atual |
| Qualidade do Regime | 21 | Label no painel Regime (Acelerando 🔥 etc.) |
| Saturação | 22 | Barra 0–100% do ATR 4h percorrido |
| Diagnóstico V5 | 18–22 | Painel consolidado: percentil + qualidade + saturação |

### Painéis V6.1 (análise avançada, ajustam confiança)

| Painel V6.1 | Módulo | O que mostra | Ajuste Confiança |
|------------|--------|-------------|------------------|
| Regime de Volatilidade | 24 | ATR ratio fast/slow, shift state (EXPLOSIVE/COMPRESSED), aceleração | ±5% |
| BTC Alignment (upgrade) | 25 | Correlações 12h/24h/72h, weighted avg, dominant window, correlation trend | Contextual |
| Market Breadth | 26 | % mercado LONG/SHORT/NEUTRAL, barra visual, alignment status | +8% se aligned, -10% se diverging |
| Top Oportunidades | — | Ranking top 5 setups por composite score (home tab) | Informativo |

**Observação:** Os painéis V6.1 **ajustam ativamente a confiança final**, mas não vetam sinais (não são gates). Eles funcionam como **multiplicadores de qualidade** aplicados após as 9 gates base.

### Painéis informativos (apenas exibição)

| Painel | Influencia sinal? |
|--------|-------------------|
| Open Interest valor absoluto | ❌ |
| Long/Short Ratio | ❌ |
| Order Book Bias | ❌ |
| CVD Multi-Exchange | ❌ |
| Big Tech & Macro EUA | ❌ |
| Fear & Greed | ❌ |

---

## ARQUIVOS DO SISTEMA

```
www/
├── index.html              Fetch das 17 APIs, renderização, UI (29 painéis V6.1)
├── ta-engine-v2.js         RSI, EMA, MACD, ATR, Volume Profile, CVD base
├── ta-engine-v3.js         Score ponderado, regime, crash detection
└── ta-engine-v4.js         26 módulos, 9 gates, regime 6-estados
                            Módulos 18–23: BTC Align, Percentile, Setup History,
                            Regime Quality, Saturation, Notifications
                            V6: Dynamic Thresholds, Calibração Logística,
                            Redundancy Penalty, Entry/Timing Split, Expectancy
                            V6.1: Vol Regime Shift, BTC Multi-Window, Market Breadth

backend/app/
├── main.py                 FastAPI v6.1.0 + startup (restore_exchanges, reconciliation,
│                           load thresholds)
├── routes/analysis.py      35+ endpoints: /symbol, /all, /status, /spoof,
│                           /multi-exchange, /execution/*, /notifications/*,
│                           /thresholds/*, /macro-regime, /systemic-risk,
│                           /setup-stats/*, /backtest/*, /signal-estimate,
│                           /position-sizing, /top-opportunities
└── services/
    ├── analysis_worker.py  Worker candle-close sync (XX:00:05 UTC) + 5min interim
    ├── ws_antispoof.py     WebSocket depth20@100ms — spoof detection em tempo real
    ├── multi_exchange.py   OI/funding agregado: Binance + OKX + Bybit
    ├── auto_execution.py   OCO orders V3 (entry→fill→SL+TP) + AES-256-GCM keys
    │                       + reconciliation loop (30s) + key validation (24h)
    ├── collective.py       Inteligência coletiva + reputation scoring
    ├── notifications.py    FCM push + confidence threshold configurável (70-100%)
    ├── dynamic_thresholds.py  Thresholds percentil por ativo (P85 displacement, P80 vol)
    ├── macro_regime.py     Macro regime (EXPANSION/CHOP/RISK_OFF) + risco sistêmico
    └── backtesting.py      Setup history DB + expectancy + backtest seed
                            + slippage (0.02%) + strict fill + Kelly sizing
                            + signal frequency estimator
```

---

## STORAGE KEYS (localStorage)

| Chave | Módulo | TTL | Conteúdo |
|-------|--------|-----|---------|
| `vc4_btc_klines_cache` | 18 — BTC Alignment | 5 min | klines BTCUSDT 1h |
| `vc4_score_history` | 19 — Percentile | 15 min | `{ symbol: { confidence, gateScore, ts } }` |
| `vc4_setup_history` | 20 — Setup Stats | Permanente (max 500) | `{ fingerprint: { wins, losses, totalR, count } }` |
| `vc4_notif_config` | 23 — Notificações | Permanente | `{ symbol: { enabled, conditions, confidenceThreshold } }` |
| `vc4_fcm_token` | 23 — FCM Token | Permanente | Token FCM registrado no backend |
| `vc4_edge_*` | 3 — Edge Stats | Permanente | Histórico de trades por símbolo/sessão |
| `vc4_perf_*` | Collective/Perf | Permanente | Performance reativa local |
| `vc4_signal_directions` | 26 — Market Breadth | 15 min | `{ symbol: { direction, ts } }` — para cálculo de breadth |
| `vc4_market_breadth` | 26 — Market Breadth | 3 min | `{ longPct, shortPct, neutralPct, totalAssets, ts }` |

---

## V6.1.0 — CHANGELOG (FEVEREIRO 2026)

### SEGURANÇA OPERACIONAL — SAFETY NET COMPLETO

#### 1. Reconciliation Loop (Orphan Position Safety)
**Problema:** Posições abertas sem SL/TP após falhas de rede, crashes ou bugs de exchange podem gerar prejuízos ilimitados.

**Solução:** Loop assíncrono no backend verifica a cada **30 segundos** se existem posições ativas sem ordens de proteção.

**Fluxo:**
1. `fetch_balance()` → lista posições abertas via REST
2. Para cada posição com tamanho > 0, verifica se existe ordem SL+TP ativa
3. Se NÃO existir → **injeta OCO emergencial:**
   - SL de emergência: 1.5% do preço de entrada
   - TP de emergência: 3.0% do preço de entrada (R:R 1:2)
4. Envia **alerta FCM urgente:** "⚠️ Posição órfã detectada — proteção emergencial ativada"

**Configuração:**
- `RECONCILIATION_INTERVAL = 30` segundos
- Função: `_reconciliation_loop()` em `auto_execution.py`
- Startup: `start_reconciliation_loop()` chamado no `main.py` on startup
- Shutdown: `stop_reconciliation_loop()` chamado no shutdown

**Proteção contra:** 
- Falha na criação do OCO inicial
- Cancelamentos acidentais das ordens de proteção
- Bugs de integração com a exchange
- Desconexões de rede durante a operação

---

#### 2. API Key Validation + Auto-Disable
**Problema:** API keys podem expirar, ser revogadas, ou ter permissões alteradas sem aviso, causando falhas silenciosas ou exposição de capital.

**Solução:** Validação diária automática da chave API com desativação + alerta.

**Fluxo:**
1. A cada **24 horas**, executa `fetch_balance()` de teste
2. Se retornar `AuthenticationError` ou `InvalidNonce`:
   - Auto-desativa a exchange connection
   - Marca como `key_expired = True` no estado interno
   - Envia **push FCM urgente:** "⚠️ Ação Necessária: Sua API key expirou ou foi revogada. Atualize no app."
3. Bloqueia novas operações até o usuário atualizar credenciais

**Configuração:**
- `KEY_VALIDATION_INTERVAL = 86400` segundos (24h)
- Função: `_check_key_validity()` em `auto_execution.py`
- Handler: `_handle_auth_failure()` — desativa + FCM

**Proteção contra:**
- Expiração de API key sem aviso
- Revogação manual pelo usuário na exchange (esquecimento)
- Alterações de permissões (ex: trade desabilitado)
- Contas comprometidas (exchange bloqueia chave)

---

#### 3. Slippage Penalty + Strict Fill Simulation
**Problema:** Backtesting otimista — assume que toda limit order na VAH/VAL é preenchida apenas tocando o nível. Na realidade, o preço pode tocar e reverter sem executar.

**Solução:** Strict simulation + slippage realístico no backtesting.

**Mudanças:**
- **SLIPPAGE_PCT = 0.02%** aplicado ao preço de entrada (conservador)
- **STRICT_FILL = True:**
  - Limit orders só são preenchidas se o próximo candle **cruza através** do nível (high > entry para LONG, low < entry para SHORT)
  - Apenas **tocar** o nível (high = entry exatamente) **NÃO** gera fill
- **Same-candle SL+TP:**
  - Se o candle toca SL e TP no mesmo candle → assume SL (conservador)
  - USA `<` em vez de `<=` para evitar false fills

**Exemplo:**
- Entry limit @ $100
- Candle: Open 98, High 99.98, Low 97, Close 98.5 → **SEM FILL** (não cruzou 100)
- Próximo candle: Open 99, High 100.50, Low 99, Close 100.20 → **FILL** (cruzou 100)

**Impacto:** Win rate no backtesting deve cair 5-10% mas refletirá a realidade. Expectancy se torna confiável.

**Configuração:**
- Constantes em `backtesting.py`
- Função: `_execute_backtest()` possui lógica strict fill

---

### ANÁLISE AVANÇADA — 3 NOVOS MÓDULOS

#### 4. Volatility Regime Shift Detector (Módulo 24)
**Problema:** Sistema detecta volatilidade instantânea (ATR atual) mas não mudanças estruturais no regime de volatilidade.

**Solução:** ATR EMA ratio (20 vs 100) detecta expansões/contrações estruturais.

**Método:**
- Calcula True Range para cada candle
- ATR Fast = EMA(20) do TR
- ATR Slow = EMA(100) do TR
- Ratio = Fast / Slow

**Estados:**
- **EXPLOSIVE** (ratio ≥ 1.5): Volatilidade subindo estruturalmente → SL mais amplo, confiança -5%
- **COMPRESSED** (ratio ≤ 0.6): Coiled spring, breakout iminente → confiança +5%
- **TRANSITIONING_UP/DOWN**: Mudança em andamento
- **STABLE**: Equilíbrio normal

**Métricas:**
- **Acceleration:** % de mudança no TR médio recente vs anterior
- **Confidence:** Score 0-95% baseado na intensidade do desvio

**UI:** Novo painel "Regime de Volatilidade" com ratio, ATR fast/slow, aceleração

---

#### 5. Dynamic BTC Correlation Multi-Window (Módulo 25)
**Problema:** Correlação fixa de 48h não captura mudanças temporais. Uma alt pode estar correlacionada no macro mas divergindo no curto prazo.

**Solução:** 3 janelas de correlação simultâneas (12h, 24h, 72h) com weighted average.

**Cálculo:**
- Pearson em cada janela: `corr12h`, `corr24h`, `corr72h`
- Weighted: `final_corr = 0.5×corr12h + 0.3×corr24h + 0.2×corr72h`
- **Dominant Window:** A janela com maior |correlação|
- **Correlation Trend:** Compara corr12h vs corr72h:
  - `INCREASING` se corr12h > corr72h + 0.1 → correlação crescente (risco aumentando se divergente)
  - `DECREASING` se corr12h < corr72h - 0.1 → desacoplamento (força relativa)
  - `STABLE` caso contrário

**Vantagens:**
- Detecta **divergências temporais**: convergente no macro, divergente no micro
- **Correlation Trend** permite antecipar mudanças no alinhamento
- Mais robusto a ruído de curto prazo (ponderação maior no 12h mas com validação no 72h)

**UI:** Painel BTC Alignment agora exibe matriz de correlações + janela dominante + tendência

---

#### 6. Market Breadth — Cross-Asset Sentiment (Módulo 26)
**Problema:** Sistema analisa cada ativo isoladamente. Não sabe se é um movimento generalizado (bull run) ou isolado (pump específico).

**Solução:** Calcula % de todos os ativos analisados recentemente que estão LONG vs SHORT.

**Dados:**
- `vc4_score_history`: confiança + gates de cada símbolo (TTL 15 min)
- `vc4_signal_directions`: direção (LONG/SHORT/NEUTRAL) de cada símbolo

**Cálculo:**
```
breadth_long = (símbolos LONG / total) × 100
breadth_short = (símbolos SHORT / total) × 100
```

**Ajustes de Confiança:**
- Se breadth_long ≥ 65% e setup é LONG → boost +8% ("mercado bullish confirma")
- Se breadth_long ≤ 35% e setup é LONG → penaliza -10% ("contra a maré")
- Análogo para SHORT

**Requer:** Mínimo 3 ativos com dados recentes. Abaixo disso → `available: false`

**UI:** Novo painel "Market Breadth" com barra visual (Long% verde / Neutral% cinza / Short% vermelho)

---

### NOVAS FEATURES DE PRODUTO

#### 7. Kelly Position Sizing
**Problema:** Position sizing arbitrário (1% do capital).

**Solução:** **Half-Kelly** baseado no expectancy real do setup:

$$f^* = \frac{p \times b - q}{b} \times 0.5$$

Onde:
- `p` = win rate do setup (backtesting DB)
- `q` = 1 - p (loss rate)
- `b` = avg win / avg loss (payoff ratio)
- Limitado: max 5%, min 0.5%

**Endpoint:** `GET /analysis/position-sizing?capital=1000&symbol=BTCUSDT&fingerprint=...`

Retorna: `kelly_fraction`, `half_kelly`, `recommended_size_usd`, `expectancy`, `win_rate`, `sample_count`

---

#### 8. Top Opportunities Ranking
**Problema:** Usuário precisa abrir cada ativo manualmente para ver setups.

**Solução:** Painel "Top Oportunidades" na home que mostra os 5 melhores setups do mercado.

**Composite Score:**
```
score = confidence×0.6 + gateScore×0.4
```

Ordenado decrescente. Só exibe se:
- Confiança ≥ 50%
- Direção = LONG ou SHORT (exclui NEUTRAL)
- Dados recentes (TTL 15 min)

**UI:** Card na home tab com:
- Ranking (1º em dourado, 2-3 em prata)
- Nome + ícone do ativo
- Direção (LONG/SHORT) + confiança %
- Gates passadas (ex: 7/9)
- Clickável → abre análise técnica do ativo

**Refresh:** A cada 30s via `loadTopOpportunities()`

---

#### 9. Clean Loading Screen
**Problema:** Loading com 8 chip badges animados ("Regime", "Estrutura", "CVD"...) polui a UI e torna loading mais lento visualmente.

**Solução:** Loading minimalista — apenas spinner + texto.

**Antes:**
```
[spinner]
Analisando Bitcoin...
Order Flow + Volume Profile + Regime + ...
[8 chip badges pulsando]
```

**Agora:**
```
[spinner]
Analisando Bitcoin...
```

Clean, rápido, profissional.

---

### BACKEND UPGRADES

#### 10. Signal Frequency Estimator
**Problema:** Usuário não sabe com que frequência vai receber sinais em um determinado threshold de confiança.

**Solução:** `estimate_signal_frequency(threshold)` no backtesting.

**Método:**
- Conta quantos setups confirmados com confiança ≥ threshold ocorreram
- Divide pelo time span coberto
- Retorna: sinais/dia, sinais/semana com ±30% uncertainty range
- Fallback: estimates típicos se amostras < 30

**Endpoint:** `GET /analysis/signal-estimate?threshold=75`

**Uso:** UI de configuração de notificações pode mostrar: "Neste threshold (75%), você receberá ~3-5 sinais por semana"

---

#### 11. Startup Lifecycle Improvements
**Adições ao `main.py`:**
- `restore_exchanges()` → recupera API keys criptografadas do disco
- `start_reconciliation_loop()` → inicia safety net de 30s
- `load_distributions()` → carrega thresholds dinâmicos do cache
- `stop_reconciliation_loop()` no shutdown → graceful stop

**Versão:** Bumped para `v6.1.0` no endpoint `/` 

---

### STORAGE KEYS NOVOS

| Chave | Conteúdo | TTL |
|-------|---------|-----|
| `vc4_signal_directions` | `{ symbol: { direction: 'LONG'/'SHORT'/'NEUTRAL', ts } }` | 15 min |
| `vc4_market_breadth` | `{ longPct, shortPct, neutralPct, totalAssets, ts }` | 3 min |

---

### ENDPOINTS NOVOS DO BACKEND

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/signal-estimate?threshold=75` | Frequência estimada de sinais por threshold |
| GET | `/position-sizing?capital=1000&symbol=BTCUSDT&fingerprint=...` | Half-Kelly sizing |
| GET | `/top-opportunities?limit=5` | Top N setups por composite score |

---

### ARQUIVOS ALTERADOS

**Backend:**
- `auto_execution.py` — V2 → V3 (reconciliation + key validation)
- `backtesting.py` — strict fill + slippage + Kelly sizing + frequency estimator
- `routes/analysis.py` — 3 novos endpoints
- `main.py` — startup hooks + v6.1.0

**Frontend:**
- `ta-engine-v4.js` — v6.0.0 → v6.1.0, Módulos 24-26 (Vol Regime Shift, BTC Multi-Window, Market Breadth)
- `index.html` — clean loading, Top Opportunities panel, novos painéis V6.1

---

## V6.0.0 — CHANGELOG COMPLETO

### PROBLEMAS CRÍTICOS CORRIGIDOS

#### 1. OCO Orders (One-Cancels-Other)
**Antes:** Ordem simples sem stop-loss nem take-profit automatizados.
**Agora:** Ciclo completo: entry → monitor fill → SL+TP bracket → cancel other on fill.
- Binance: `stop_market` + `take_profit_market`
- OKX: ordens condicionais
- Bybit: `triggerPrice`
- Monitoramento assíncrono de fills via asyncio tasks

#### 2. API Keys Criptografadas
**Antes:** Chaves em memória, perdidas no restart.
**Agora:** AES-256-GCM com master key de `VISOR_MASTER_KEY` env var.
- Persistência em disco (`.encrypted_exchanges.json`)
- `restore_exchanges()` no startup recupera automaticamente
- Fallback base64 em modo dev

#### 3. Notificações FCM com Threshold Configurável
**Antes:** Notificação local do Capacitor sem controle de qualidade.
**Agora:** Firebase Cloud Messaging (server-side push) com threshold configurável.
- **Mínimo aceito: 70%** | **Máximo: 100%** | **Padrão: 75%**
- Só notifica quando confiança calibrada ≥ threshold do usuário
- Filtragem por símbolo, alertas de OCO fill, alertas de risco sistêmico
- `registerFcmToken()`, `unregisterFcmToken()`, `setConfidenceThreshold()`

#### 4. Centralização de Backtesting
**Antes:** Histórico local no localStorage (max 500, perdido ao limpar cache).
**Agora:** Database centralizada no backend com expectancy real.
- Expectancy: `(WR × AvgWin) - ((1-WR) × AvgLoss)` com mín. 10 amostras
- Stats por: fingerprint, símbolo, regime, sessão, btcAlignment, saturação, macro regime
- Backtest seed: gera dados simulados de klines históricos

### MELHORIAS DO ENGINE (ta-engine-v4.js)

#### 5. Thresholds Dinâmicos por Ativo
**Antes:** Z > 2.0 fixo para todos os ativos (BTCUSDT e DOGEUSDT iguais).
**Agora:** Percentis calculados da distribuição histórica de cada ativo.
- Displacement Z: percentil 85 da distribuição
- Volume Z: percentil 80
- OI Delta: percentil 80
- Funding Rate: percentil 90
- Spoofing: percentil 85
- Fallback para valores fixos quando amostras < 30
- Cache de 5 min por símbolo

#### 6. Pesos de Gate Adaptativos por Regime
**Antes:** Pesos fixos (BOS=2.0, Displacement=2.0, Volume=1.5...) para todos os regimes.
**Agora:** Pesos ajustam automaticamente por regime de mercado.

| Gate | RANGING | BULL/BEAR TREND | VOLATILE | ACCUMULATION |
|------|---------|-----------------|----------|-------------|
| BOS | 2.5 | 1.5 | 2.0 | 2.5 |
| Displacement | 1.0 | 2.5 | 1.5 | 1.5 |
| Volume | 1.0 | 2.0 | 1.0 | 2.0 |
| Range | 2.5 | 1.5 | 1.5 | 2.0 |
| OI | 1.0 | 2.0 | 1.5 | 1.5 |

#### 7. Calibração Logística (Sigmoid)
**Antes:** Confiança era `gateScore × 0.85 + v3 × 0.15` — heurística sem base estatística.
**Agora:** Confiança calibrada via função sigmoide:
```
probability = sigmoid(a0 + a1×gateScore + a2×regimeQuality + a3×saturation + a4×btcAlignment + a5×session)
```
- Blend: 60% heurística + 40% calibrada (progressivo até treinar com dados reais)
- Coeficientes iniciais estimados — devem ser treinados com backtesting

#### 8. Penalização de Redundância
**Antes:** Gates correlacionadas (BOS+Displacement, Range+Acceptance) contavam dobrado.
**Agora:** Se ambos os gates de um par correlato passam, o segundo tem peso reduzido.
- BOS + Displacement: penalty 0.7 (displacement → peso × 0.7)
- Displacement + Volume: penalty 0.8
- Range + Acceptance: penalty 0.75

#### 9. Separação Entry vs Timing
**Antes:** Todos os gates numa única "cesta" — timing e estrutura misturados.
**Agora:** Dois scores separados:
- **Engine A (Estrutura):** BOS, Displacement, Volume, Range, OI — "há setup?"
- **Engine B (Timing):** Acceptance, CVD, Funding, Anti-Spoof — "hora de entrar?"
- Se estrutura forte mas timing fraco → recomenda AGUARDAR entry ótimo
- Se timing bom mas estrutura fraca → "não operar sem estrutura"

#### 10. Macro Regime + Risco Sistêmico
**Antes:** Só regime local do ativo (BULL/BEAR/RANGE).
**Agora:** Dois novos dados macro do backend:
- **Macro Regime:** MACRO_EXPANSION / MACRO_CHOP / MACRO_RISK_OFF
  - Baseado em BTC ADX, EMA trend, e % de alts seguindo BTC
- **Risco Sistêmico:** Correlação cruzada de BTC/ETH/BNB/SOL/XRP
  - CRITICAL (corr > 0.9): confiança × 0.3, bloqueia CONFIRMED
  - HIGH (corr > 0.8): confiança × 0.6
  - ELEVATED (corr > 0.7): confiança × 0.85
  - NORMAL: sem ajuste

#### 11. Worker com Sincronização de Candle Close
**Antes:** Worker rodava a cada 5 min fixo (desalinhado com closes de candle).
**Agora:** Dois tipos de ciclo:
- **CANDLE_CLOSE:** Roda 5s após XX:00:00 UTC (captura candle fechado)
- **INTERIM:** Roda a cada 5 min entre candle closes
- Thresholds dinâmicos e macro regime atualizados a cada ciclo

### ENDPOINTS NOVOS DO BACKEND (routes/analysis.py)

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/notifications/prefs/{user_id}` | Busca preferências de notificação |
| POST | `/notifications/prefs` | Salva preferências (threshold 70-100%) |
| POST | `/notifications/register-token` | Registra token FCM |
| POST | `/notifications/unregister-token` | Remove token FCM |
| GET | `/analysis/thresholds/{symbol}` | Thresholds dinâmicos por ativo |
| GET | `/analysis/macro-regime` | Macro regime atual (BTC-based) |
| GET | `/analysis/systemic-risk` | Risco sistêmico (correlação cruzada) |
| GET | `/analysis/setup-stats/global` | Stats globais de todos os setups |
| GET | `/analysis/setup-stats/symbol/{symbol}` | Stats por símbolo |
| GET | `/analysis/setup-stats/fingerprint/{fp}` | Stats por fingerprint |
| GET | `/analysis/setup-stats/combined` | Stats combinados multi-dimensão |
| POST | `/analysis/setup/record` | Registra novo setup no DB |
| POST | `/analysis/setup/outcome` | Registra outcome (win/loss/R) |
| POST | `/analysis/backtest/seed` | Gera seed data de klines históricos |

---

## NOVIDADES DA VERSÃO 7.0.0

### 1. Macro Liquidity Index (Módulo 26)

Novo módulo que calcula liquidez global macro baseado em dados dos 5 principais bancos centrais:

```
Macro Liquidity = Fed Balance + ECB Balance + BoJ Balance + BoE Balance + PBoC Proxy
```

| Banco Central | Peso | Fonte |
|---------------|------|-------|
| Federal Reserve (Fed) | 35% | FRED API |
| European Central Bank (ECB) | 25% | ECB Data Portal |
| Bank of Japan (BoJ) | 20% | BoJ Statistics |
| Bank of England (BoE) | 10% | BoE API |
| People's Bank of China (PBoC) | 10% | Proxy via reservas |

**Impacto no Score:**
- Liquidez EXPANDING + Delta > 0: bonus +5% na confiança
- Liquidez CONTRACTING + Delta < 0: penalty -10% na confiança
- Regime RISK_OFF: força cautela em todos os sinais

### 2. AI-Powered News Intelligence (Backend)

Sistema de filtragem de notícias baseado em IA (Groq/Llama 3.3 70B):

**Pipeline de Filtragem:**
1. **Trash Filter (Regex):** 60+ patterns para remover clickbait, previsões de preço, memecoins
2. **Keyword Classifier:** Categorização rápida por palavras-chave em 5 categorias
3. **AI Refinement:** Groq classifica e pontua artigos de alto potencial (0-100)
4. **Deduplication:** Jaccard similarity ≥ 0.65 para remover duplicatas

**Categorias:**
- 🏛️ REGULACAO — SEC, leis, ETFs, bancos centrais
- 🐋 FLUXO_CAPITAL — Baleias, fundos, movimentos on-chain
- 🏦 INSTITUCIONAL — Bancos integrando crypto, custody, L2
- ⚠️ RISCO_SISTEMICO — Hacks, insolvência, depegs
- 🌍 MACRO — Juros, inflação, geopolítica
- 🗑️ RUIDO — Opiniões, clickbait (filtrado)

### 3. Entry/Continuation Score Split (Módulo 27)

**Antes:** Um único score de confiança para todas as situações.
**Agora:** Dois scores separados com pesos diferentes:

| Score Type | Gates com Mais Peso | Quando Usar |
|------------|---------------------|-------------|
| **Entry Score** | BOS, Displacement, Volume, Range | Nova posição |
| **Continuation Score** | CVD, Anti-Spoof, OI Delta | Adicionar à posição existente |

**Entry Score:**
- Prioriza estrutura de mercado (BOS validado, displacement institucional)
- Requer confirmação de volume e posição no range
- Mais restritivo — evita falsas entradas

**Continuation Score:**
- Prioriza confirmação de fluxo (CVD, OI crescente)
- Valida que a posição ainda tem momentum
- Menos restritivo — gerenciar posição existente

### 4. Extended Redundancy Pairs

**Antes:** 3 pares de redundância (BOS+Displacement, Displacement+Volume, Range+Acceptance)
**Agora:** 10+ pares para evitar contagem dupla de confirmações correlacionadas

| Par | Penalty | Razão |
|-----|---------|-------|
| BOS + Displacement | 0.70 | Ambos medem momentum institucional |
| Displacement + Volume | 0.80 | Volume valida displacement |
| Range + Acceptance | 0.75 | Acceptance confirma range breakout |
| OI + CVD | 0.75 | Ambos medem pressão de mercado |
| Funding + OI | 0.80 | Funding extremo correlaciona com OI |
| Anti-Spoof + CVD | 0.70 | CVD é proxy de intenção real |
| Session + Volume | 0.85 | Kill zones têm volume alto |
| BTC Corr + Macro Regime | 0.75 | BTC domina em risk-off |
| Vol Regime + Displacement | 0.80 | Alta vol amplia displacements |
| Breadth + BTC Corr | 0.80 | Breadth alta = alta correlação |

### 5. Bayesian Fingerprint Database

Sistema de armazenamento e consulta de setups históricos com atualização Bayesiana:

```javascript
// Estrutura do fingerprint
{
  symbol: "BTCUSDT",
  regime: "BULL_TREND",
  session: "KILL_ZONE",
  bos_passed: true,
  displacement_zscore: 2.3,
  volume_zscore: 1.8,
  entry_score: 78,
  continuation_score: 65,
  timestamp: "2026-02-15T14:30:00Z",
  outcome: "WIN", // ou "LOSS"
  r_multiple: 1.5
}
```

**Prior Update:**
- Cada outcome atualiza a probabilidade do fingerprint
- Win rate converge para valor real após ~30 samples
- Fingerprints similares (regime + session + gates) agrupados

### 6. UI Layout Simplificado

**Antes:** Banners "Parte 1" e "Parte 2" dividindo a análise
**Agora:** Layout limpo sem divisões artificiais

**Mudanças:**
- Removido banner "Parte 1 — Confluência & Sinais"
- Removido banner "Parte 2 — Dados de Mercado"
- Aviso legal movido para o final da análise
- Ordem das seções mantida por relevância natural

### 7. Filtragem Agressiva de Notícias (Frontend)

Além do backend AI, o frontend também filtra com 50+ keywords:

```javascript
const trashKeywords = [
  // Price predictions
  'price prediction', 'could reach', 'will hit', 'to $', 'target $',
  // Clickbait
  'you won\'t believe', 'shocking', 'breaking:', 'massive', 'insane',
  // Filler
  'best crypto', 'top 10', 'hidden gem', 'meme coin', 'airdrop',
  // Opinion
  'expert says', 'analyst believes', 'bullish signal', 'bearish signal',
  // Sponsored
  'sponsored', 'press release', 'partner content',
  // Low-cap noise
  'shib', 'doge', 'pepe', 'floki', 'new token', 'dex listing'
];
```

---

## CHANGELOG V7.0.0

- ✅ Macro Liquidity Index com 5 bancos centrais
- ✅ AI News Intelligence (Groq/Llama 3.3 70B)
- ✅ Entry/Continuation score split
- ✅ 10+ redundancy pairs (vs 3 anterior)
- ✅ Bayesian fingerprint DB
- ✅ UI layout simplificado (sem banners Parte 1/2)
- ✅ Aviso legal no final da análise
- ✅ 60+ trash patterns no backend
- ✅ 50+ trash keywords no frontend
- ✅ News tabs: Todas, Positivas, Negativas, Relevantes
| GET | `/execution/positions` | Posições ativas (OCO em andamento) |
