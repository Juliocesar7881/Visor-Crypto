# VISOR CRYPTO v5.0 — CHANGELOG

## Data: Fevereiro 2026

---

## 🚀 NOVAS FUNCIONALIDADES

### 1. Data Integrity Gate (FORCE_NEUTRO)
- Validação de TODOS os dados recebidos antes da análise
- Se dados **críticos** (klines, preço) estiverem ausentes → **FORCE_NEUTRO**
- Se dados **importantes** (order book, trades) estiverem indisponíveis → qualidade reduzida
- **Nunca mais sinais baseados em dados ruins/fallback**

### 2. Open Interest + OI Delta (Módulo 11)
- **Novo fetch**: Open Interest Histórico (5min intervals, 12 períodos)
- Detecção automática de:
  - 🔥 **Short Squeeze**: OI caindo + shorts sendo liquidados
  - 🔥 **Long Squeeze**: OI caindo + longs sendo liquidados
  - 📈 **Long Buildup**: OI subindo + compras agressivas
  - 📉 **Short Buildup**: OI subindo + vendas agressivas
  - ⚠️ **Fake Breakout**: Movimento sem novas posições (OI caindo)
- Análise de Taker Buy/Sell Volume (últimos 6 períodos)
- Contagem de liquidações forçadas (última 1 hora)
- **Gate "OI Confirma"** agora verificado para sinais

### 3. Anti-Spoofing / Order Book Delta (Módulo 12)
- Detecção de manipulação de mercado:
  - 🚨 **Spoofing**: Desequilíbrio bid/ask > 3:1
  - ⚠️ **Paredes**: Nível único > 5% do depth total
  - ⚠️ **Spread alto**: > 0.1% indica liquidez baixa
- Order Book Bias (BULLISH/BEARISH/NEUTRAL)
- **Gate "Anti-Spoof OK"** agora verificado para sinais

### 4. Enhanced 6-State Regime Detection (Módulo 13)
- 6 estados de mercado (vs 5 anteriores):
  - **TREND_UP** / **TREND_DOWN**: Tendência confirmada
  - **RANGE**: Mercado lateral
  - **EXPANSION_UP** / **EXPANSION_DOWN**: Tendência + OI crescente + vol alta
  - **COMPRESSION**: Volatilidade extremamente baixa (squeeze iminente)
  - **HIGH_VOL**: Volatilidade extrema (stops largos obrigatórios)
- Regime afeta gates requeridas e R:R esperado
- ATR Percentile para classificação de volatilidade

### 5. Server-Side Analysis Worker (Backend)
- Worker roda a cada **5 minutos** para todos os symbols trackeados
- Computa: OI Delta, Anti-Spoofing, CVD, Data Integrity server-side
- Cache em memória (pronto para Redis)
- API read-only para servir resultados cacheados
- **Escalável para infinitos usuários** (cada usuário lê do cache)
- Endpoints:
  - `GET /api/analysis/symbol/{symbol}` — Análise cacheada por symbol
  - `GET /api/analysis/all` — Todas as análises
  - `GET /api/analysis/status` — Status do worker

### 6. Separação de Dados: Análise vs Mercado
- **Bloco "Confirmações"**: Dados usados diretamente na confluência do sinal
- **Bloco "Dados de Mercado"**: Informações complementares (OI absoluto, funding rate, long/short ratio, order book bias, liquidações)
- Clareza visual sobre o que influencia o sinal e o que é informacional

---

## 🔧 CORREÇÕES

### CVD (Cumulative Volume Delta)
- **Corrigido**: Cálculo agora usa volume em **USD** (`qty × price`) em vez de quantidade raw
- Isso resolve o problema de "Binance 0% buy" que aparecia anteriormente
- O `isBuyerMaker` distingue corretamente compras/vendas market vs limit

### Version Labels Removidos
- Removido "V4.1 INSTITUTIONAL" do badge do sinal
- Removido "V3 Engine" do badge
- Removido "ANÁLISE REATIVA V4" do resumo IA → agora "ANÁLISE AVANÇADA"
- Removido "Confirmações Reativas V4.1" → agora "Confirmações"
- Interface limpa e profissional, sem referências internas de versão

---

## 📊 SISTEMA DE GATES (9 gates total, antes eram 7)

| Gate | Peso | Novo? | Descrição |
|------|------|-------|-----------|
| BOS Confirmado | 2.0 | — | Break of Structure (volume + close + CVD) |
| Displacement Z-Score | 2.0 | — | Body Z-Score > 2.0 e Volume Z-Score > 1.5 |
| Volume Z-Score | 1.5 | — | Expansão sustentada de volume |
| CVD Confirma | 1.5 | — | Delta cumulativo confirma direção |
| Fora do Range | 2.0 | — | Preço fora da zona neutra do range |
| Funding OK | 1.0 | — | Funding rate não bloqueia operação |
| Aceitação Breakout | 1.5 | — | Candle fechou fora do range |
| **OI Confirma** | **1.5** | ✅ | OI Delta confirma direção do trade |
| **Anti-Spoof OK** | **1.0** | ✅ | Sem manipulação detectada no book |

---

## 🏗️ ARQUITETURA

```
www/
├── index.html          — App principal (~15.6K linhas)
├── ta-engine-v2.js     — Regime, Structure, CVD Advanced, Macro
├── ta-engine-v3.js     — Crash Detection, NL Scoring
└── ta-engine-v4.js     — 20 módulos: Z-Score, Session, Gates,
                          OI Delta, Anti-Spoof, Data Integrity,
                          Risk Engine, Bot Webhook, Collective

backend/app/
├── main.py             — FastAPI + Worker startup
├── routes/analysis.py  — API read-only para cache de análise
└── services/
    ├── analysis_worker.py  — Worker 5min (OI, CVD, Spoofing)
    └── collective.py       — Inteligência coletiva
```

---

## 📱 APK Build

```powershell
cd android
.\gradlew.bat assembleDebug
```

APK: `android/app/build/outputs/apk/debug/app-debug.apk` (~23MB)
