# V4.1 — Reactive Trading Intelligence Engine (Institutional Grade)

**Versão**: 4.1.0  
**Codinome**: V4.1-REACTIVE-INSTITUTIONAL  
**Data**: Junho 2025  
**Arquivos**: `www/ta-engine-v4.js` (~1,870 linhas) | `backend/app/services/collective.py` (~800 linhas)

---

## Sumário Executivo

A V4.1 é uma reescrita completa do motor V4.0, corrigindo **todas as fraquezas identificadas** na auditoria:

| Problema V4.0 | Solução V4.1 |
|---|---|
| Constantes fixas (bodyRatio > 1.8) | **Z-Score dinâmico** (rolling 100 candles) |
| Sem consciência de sessão | **Kill Zones** (London/NY overlap) + filtro de fim de semana |
| "Compre AGORA" após displacement | **Limit Order no reteste** com R:R 1:2 e 1:3 |
| Peso igual para todos os dispositivos | **Reputation Scoring** (curva exponencial) |
| Número fixo de gates | **Gates Regime-Adaptivos** (bull/bear/ranging + counter-trend) |
| Sem proteção contra overfitting | **Walk-Forward Validation** (70/30 split) + temporal decay |
| Sem gestão de risco | **Risk Engine** (position sizing, kill switch, drawdown controls) |
| Só macro-confirmação | **Microstructure Detection** (absorção, FVG, vazio de liquidez) |
| Signal only | **Bot Integration Layer** (webhook estruturado para Binance/3Commas) |
| Sem monitor de degradação | **Model Stability Monitor** (rolling WR, edge trend, forçar AGUARDAR) |

---

## Arquitetura: 17 Módulos

```
┌─────────────────────────────────────────────────────────┐
│                    MASTER ORCHESTRATOR                    │
│              enhanceWithReactive(analysis, data, symbol)│
│                                                         │
│  [1] Z-Score Engine ──► [2] Session Context             │
│  [3] Displacement Z ──► [4] Volume Expansion Z          │
│  [5] Range Position ──► [6] Retest + Limit Order        │
│  [7] Funding Filter ──► [8] Microstructure              │
│  [9] Squeeze/Expand ──► [10] Regime-Adaptive Gates      │
│  [11] Risk Engine   ──► [12] Model Stability            │
│  [13] Performance   ──► [14] Collective Client          │
│  [15] Bot Webhook   ──► [16] Summary Generator          │
│  [17] Output Assembly                                    │
└─────────────────────────────────────────────────────────┘
```

---

## Módulo 1: Z-Score Statistical Engine

**Problema resolvido**: Constantes fixas (bodyRatio > 1.8) que funcionam para BTC mas falham para altcoins de baixa liquidez.

**Solução**: Z-Score dinâmico com janela deslizante de 100 candles.

```
Z = (valor - média) / desvio_padrão
```

**Parâmetros**:
- `Z_SCORE_DISPLACEMENT = 2.0` — Body Z mínimo para displacement
- `Z_SCORE_VOLUME = 2.0` — Volume Z mínimo para expansão
- `Z_SCORE_LOOKBACK = 100` — Janela de cálculo

**Funções**:
- `computeZScoreContext(candles)` → retorna `{ mean, std, zScore }` para body e volume
- `getZScore(value, mean, std)` → cálculo puro de Z-Score

**Por que funciona**: Domingo à noite com ATR 0.2%, um candle de 0.5% tem Z=2.5 e é capturado. Sexta com NFP e ATR 3%, um candle de 2% tem Z=0.7 e é ignorado. Auto-adaptação sem constantes fixas.

---

## Módulo 2: Session Context (Kill Zones)

**Problema resolvido**: Sem consciência de horário → sinais LONG às 3h UTC em vazio de liquidez.

**Kill Zones (UTC)**:

| Sessão | Horário UTC | Multiplicador | Liquidez | Fake Breakout |
|---|---|---|---|---|
| ASIAN | 0:00 - 7:00 | ×0.6 | BAIXA | ALTO |
| LONDON_OPEN | 7:00 - 9:00 | ×1.3 | ALTA | MÉDIO |
| LONDON | 9:00 - 12:00 | ×1.0 | MÉDIA | MÉDIO |
| **KILL_ZONE** | **12:00 - 16:00** | **×1.5** | **MÁXIMA** | **BAIXO** |
| NY_CLOSE | 16:00 - 21:00 | ×0.8 | MÉDIA | MÉDIO |
| DEAD | 21:00 - 0:00 | ×0.4 | MÍNIMA | ALTO |
| **WEEKEND** | Sáb/Dom | **×0.0** | **NENHUMA** | **MÁXIMO** |

**Comportamento**: O multiplicador de sessão é aplicado ao gateScore final. Kill Zone (London/NY overlap) amplifica sinais bons. Weekend **força AGUARDAR** independentemente de gates.

---

## Módulo 3: Displacement Z-Score

Detecta deslocamento institucional real usando body Z-Score > 2.0 **E** volume Z-Score > 1.5.

**Output**: `{ detected, direction, bodyZScore, volZScore, strength, details }`

---

## Módulo 4: Volume Expansion Z-Score

Volume Z-Score > 2.0 com verificação de sustentação (3+ candles acima da média).

**Output**: `{ expanding, volZScore, sustained, ratio, details }`

---

## Módulo 5: Range Position

Posição do preço no range de 24h. Bloqueia operações quando o preço está nos 30% centrais do range (zona de indecisão).

---

## Módulo 6: Retest + Limit Order Generator

**Problema resolvido**: "Compre AGORA!" depois do candle de displacement = entrar no topo.

**Solução**: Gera Limit Order na zona de reteste, não no preço atual.

**Dois modos**:
1. `LIMIT_ON_RETEST` — Reteste ainda não ocorreu → gera order limit
2. `MARKET_AFTER_RETEST` — Reteste confirmado no candle anterior → market entry OK

**Cálculo**:
- Entry: nível retestado (não o topo do displacement)
- Stop Loss: abaixo da estrutura + buffer de 0.5× ATR
- **TP1**: R:R 1:2 (take profit conservador)
- **TP2**: R:R 1:3 (take profit agressivo)

**Output**: `{ type, entry, stopLoss, takeProfit1, takeProfit2, rr1, rr2, direction, details }`

---

## Módulo 7: Funding Filter

Bloqueia operações quando funding rate > 0.1% (extremo).

---

## Módulo 8: Microstructure Detection

**Problema resolvido**: Só macro-confirmação, sem leitura de microestrutura.

**3 Detecções**:

| Tipo | O que detecta | Como |
|---|---|---|
| **Absorção** | Candle com corpo pequeno + pavio ≥60% do range | Indica smart money absorvendo liquidez |
| **FVG** (Fair Value Gap) | Gap entre high[i-2] e low[i] | Zona que precisa ser preenchida |
| **Liquidity Void** | 3+ candles unidirecionais consecutivos sem retrace | Zona frágil, preço pode retornar violentamente |

**Output**: `{ absorption: { detected, direction }, fvg: { detected, direction }, liquidityVoid: { detected, direction }, details }`

---

## Módulo 9: Squeeze/Expansion Detection

Identifica squeeze (Bollinger Bands estreitas) e momento de expansão.

---

## Módulo 10: Regime-Adaptive Gates

**Problema resolvido**: 5 gates fixos para qualquer mercado.

**Solução**: Número de gates varia por regime + aumenta para contra-tendência.

| Regime | Com Tendência | Contra Tendência |
|---|---|---|
| **BULL_TREND** | 4 gates, 55% min | 6 gates, 75% min |
| **RANGING** | 6 gates, 70% min | 6 gates, 70% min |
| **BEAR_TREND** | 4 gates, 55% min | 6 gates, 75% min |
| **DEFAULT** | 5 gates, 65% min | 5 gates, 65% min |

**Gate Score**: Soma ponderada de todos gates passados, multiplicada pelo multiplicador de sessão.

**Gates disponíveis (até 9)**:
1. Displacement Z-Score (peso 2.0)
2. Volume Expansion Z-Score (peso 1.5)
3. Range Position OK (peso 1.0)
4. Retest Confirmado (peso 2.0)
5. Funding Rate OK (peso 0.5)
6. Microstructure Pró-Trend (peso 1.5)
7. Squeeze Expandindo (peso 1.0)
8. V3 Score Alinhado (peso 1.0)
9. V3 NL Score ≥ 60 (peso 0.8)

---

## Módulo 11: Risk Engine

**Problema resolvido**: Sem gestão de risco. Sem kill switch. Sem position sizing.

**Funcionalidades**:

| Feature | Detalhe |
|---|---|
| **Position Sizing** | 1-3% do capital baseado em confidence e volatilidade |
| **Kill Switch** | 3 losses consecutivos → pausa de 4 horas |
| **Daily Drawdown** | Máximo 3% — excedeu = força AGUARDAR para o dia |
| **Weekly Drawdown** | Máximo 7% — excedeu = força AGUARDAR para a semana |
| **Leverage** | Sugestão dinâmica: 1× (baixo conf) a 5× (alto conf, baixo vol) |
| **Risk Level** | LOW / MEDIUM / HIGH / CRITICAL baseado em drawdown + kill switch |

**Output**: `{ positionSizePct, leverage, killSwitchActive, killSwitchReason, dailyDrawdown, weeklyDrawdown, maxDailyDrawdown, maxWeeklyDrawdown, riskLevel }`

---

## Módulo 12: Model Stability Monitor

**Problema resolvido**: Sem proteção contra degradação — modelo pode ter 25% WR por semanas sem aviso.

**Mecanismo**:
- Rolling window dos últimos 20 sinais
- Calcula WR local com temporal decay (halflife 14 dias)
- Classifica edge trend: **STABLE** (WR 40-60%) | **IMPROVING** (WR > 55%) | **DEGRADING** (WR < 40%)
- **Forçar AGUARDAR** quando WR < 30%

**Output**: `{ rollingWR, signals, edgeTrend, temporalDecayFactor, lastNResults, forcedAguardar }`

---

## Módulo 13: Performance Tracker

Rastreia performance por regime (BULL/BEAR/RANGING) e por sessão (KILL_ZONE/ASIAN/etc).

---

## Módulo 14: Collective Client (com Reputação)

Envia trades para o backend com `device_hash`, WR local, e trade count. Recebe stats coletivas com peso de reputação.

---

## Módulo 15: Bot Webhook

**Problema resolvido**: Signal only — sem integração com bots de execução.

**Gera output estruturado**:
```json
{
  "action": "LONG" | "SHORT" | "CLOSE" | "NONE",
  "ticker": "BTCUSDT",
  "side": "buy" | "sell",
  "quantity": "3%",
  "type": "limit" | "market",
  "entry": 67450.00,
  "sl": 66200.00,
  "tp1": 69950.00,
  "tp2": 71200.00,
  "timestamp": "2025-06-19T14:30:00.000Z"
}
```

Compatível com: **Binance Webhook**, **3Commas**, **Cornix**, **TradingView Alerts**.

---

## Módulo 16: Summary Generator

Gera resumo em linguagem natural com:
- Zona de sessão atual
- Z-Scores encontrados
- Plano de execução (limit order details)
- Status do risk engine
- Microstructure findings
- Edge trend do modelo

---

## Backend: Collective Learning V4.1

### Reputation Scoring

**Problema resolvido**: Todos os dispositivos pesam igual — um com 20% WR influencia tanto quanto um com 75%.

**Curva exponencial**:
```
weight = 10^((wr - 50) / 25)
```

| WR do Dispositivo | Peso na Aprendizagem |
|---|---|
| 30% | ×0.1 (quase ignorado) |
| 50% | ×1.0 (baseline) |
| 65% | ×3.6 |
| 75% | ×10.0 (máximo) |

**Verificação**: O backend compara o WR auto-reportado com os resultados reais no banco para evitar fraude.

### Walk-Forward Validation

**Problema resolvido**: Sem proteção contra overfitting.

**Mecanismo**:
1. Ordena todos trades avaliados por timestamp
2. Split 70% treino / 30% teste
3. Calcula feature importance no treino
4. Valida no teste — se train WR >> test WR = **overfitting**
5. Aplica overfit penalty aos weights ajustados

| Train - Test WR | Overfit Risk | Penalty |
|---|---|---|
| Diff > 15% | HIGH | ×0.5 |
| Diff 8-15% | MEDIUM | ×0.75 |
| Diff < 8% | LOW | ×1.0 (sem penalidade) |

### Temporal Decay

Trades recentes pesam mais que trades antigos:
```
weight = 0.5^(age_days / 14)
```

| Idade do Trade | Peso |
|---|---|
| Hoje | ×1.0 |
| 7 dias | ×0.61 |
| 14 dias | ×0.50 |
| 28 dias | ×0.25 |
| 60 dias | ×0.06 |

### Session-Specific Learning

O backend agora analisa feature importance por sessão: KILL_ZONE, ASIAN, LONDON, NY.

---

## O Que NÃO É Utilizado na Confluência

A análise completa critica que os seguintes dados **não são consumidos como gates** na V4.1:

| Dado | Status | Razão |
|---|---|---|
| **Order Book Depth** | ❌ Não disponível | API de order book não está conectada. Requer WebSocket da Binance (wss://stream.binance.com). Para V5. |
| **Liquidation Data** | ❌ Não disponível | Requer API do CoinGlass ou similar. Para V5. |
| **Open Interest** | ❌ Não disponível | Requer endpoint /fapi/v1/openInterest da Binance Futures. Para V5. |
| **Fear & Greed Index** | ❌ Não como gate | Disponível como macro (via API externa) mas não entra como gate — apenas informacional no V3. Pode virar gate na V5 com threshold Z-Score. |
| **Multi-Asset Correlation** | ❌ Não implementado | Cross-correlation BTC↔ETH↔SPX. Requer data pipeline. Para V5. |
| **CVD (Cumulative Volume Delta)** | ⚠️ Parcial | V3 tem CVD avançado mas V4.1 não usa como gate separado — está implícito na análise de displacement. |
| **Macro News (FOMC/CPI/NFP)** | ⚠️ Parcial | V3 tem macroNews + Big Tech Macro. V4.1 não usa como gate — informacional. Poderia ser gate "FOMC day = force AGUARDAR". |
| **Whale Tracking** | ❌ Não disponível | Requer API de blockchain analytics (Whale Alert, Nansen). Para V5. |
| **Social Sentiment** | ❌ Removido da confluência | CryptoPanic API estava integrada mas desabilitada por rate limits. |
| **Heatmap de Liquidações** | ❌ Não disponível | Requer CoinGlass Pro API. Dado premium. |

### Dados EFETIVAMENTE Utilizados como Gates:

1. ✅ **Body Z-Score** (displacement) — gate peso 2.0
2. ✅ **Volume Z-Score** (expansão) — gate peso 1.5
3. ✅ **Range Position** (zona operável) — gate peso 1.0
4. ✅ **Retest Confirmation** (reteste) — gate peso 2.0
5. ✅ **Funding Rate** (filtro) — gate peso 0.5
6. ✅ **Microstructure** (absorção/FVG) — gate peso 1.5
7. ✅ **Squeeze Expansion** — gate peso 1.0
8. ✅ **V3 Score** (alinhamento multi-timeframe) — gate peso 1.0
9. ✅ **V3 NL Score** (score normalizado) — gate peso 0.8
10. ✅ **Session Kill Zone** — multiplicador no gateScore
11. ✅ **Regime Detection** — adapta gates mínimos
12. ✅ **Kill Switch / Risk Engine** — pode forçar AGUARDAR
13. ✅ **Model Stability** — pode forçar AGUARDAR se WR < 30%
14. ✅ **Reputation Score** — peso do dispositivo na aprendizagem coletiva

---

## UI — Novas Seções na Análise

| Seção | Ícone | Cor | Dado Exibido |
|---|---|---|---|
| **Sessão / Kill Zone** | 🔥/🇬🇧/🌏/🕐 | Vermelho (KZ) / Azul (London) | Multiplicador, liquidez, fake breakout risk |
| **Plano de Execução** | 📋 | Roxo | Entry, SL, TP1 (1:2), TP2 (1:3), tipo (limit/market) |
| **Microestrutura** | 🔬 | Cyan | Absorção, FVG, Vazio de Liquidez (3 cards) |
| **Risk Engine** | 🛡️/🛑 | Amarelo/Vermelho | Position size, alavancagem, drawdown, kill switch |
| **Estabilidade do Modelo** | 📊/📈/📉 | Dinâmica | Rolling WR, sinais rastreados, edge trend |
| **Bot Webhook** | 🤖 | Cyan | Output monospace para copiar/integrar |
| **Gates V4.1** | 🎯 | Laranja | Agora mostra regime + contra-tendência no subtítulo |
| **Displacement** | ⚡ | Cyan | Agora mostra Body Z e Vol Z ao invés de "Força: 80%" |

---

## Fluxo Completo de um Sinal

```
1. Candles chegam → Z-Score Engine computa contexto estatístico
2. Session Context identifica Kill Zone / Weekend
3. Displacement Z > 2.0 detectado com Volume Z > 1.5
4. Range Position confirma zona operável (não está no meio do range)
5. Retest detectado → Limit Order gerada com Entry/SL/TP1/TP2
6. Microstructure: absorção confirma smart money, sem FVG contra
7. Regime identificado: BULL_TREND. Operação com tendência → 4 gates mínimos
8. Squeeze expandindo → confirma momentum
9. V3 Score alinhado multi-timeframe
10. Gates avaliados: 7/9 passaram → Score=78% × 1.5 (Kill Zone) = 117%
11. Risk Engine: OK, sem kill switch, position size 2.5%, leverage 3×
12. Model Stability: WR=62%, edge IMPROVING → OK
13. Signal: LONG_CONFIRMED (confidence 78%, probability 82%)
14. Bot Webhook: output estruturado para automação
15. Collective: trade submetido com device_hash + reputation
16. Summary: "🔥 KILL ZONE ativa. Displacement Z=2.8 detectado em BTCUSDT..."
```

---

## Build & Deploy

```bash
# Sync files
cp www/ta-engine-v4.js android/app/src/main/assets/public/
cp www/index.html android/app/src/main/assets/public/

# Build APK
cd android && ./gradlew assembleDebug

# APK location
android/app/build/outputs/apk/debug/app-debug.apk
```

---

## Roadmap V5 (Futuro)

- [ ] WebSocket Order Book (Binance depth stream)
- [ ] Open Interest como gate
- [ ] Liquidation heatmap (CoinGlass)
- [ ] Multi-asset correlation (BTC↔ETH↔SPX)
- [ ] Fear & Greed Z-Score como gate
- [ ] Whale alert integration
- [ ] FOMC/CPI calendar → force AGUARDAR em dias de evento
- [ ] Neural net feature weights (upgrade do walk-forward)
- [ ] Portfolio management (multi-position tracking)
- [ ] Public audit page com métricas verificáveis
