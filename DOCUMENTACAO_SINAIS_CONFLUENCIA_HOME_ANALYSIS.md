# Documentacao Tecnica - Sinais e Confluencia (HOME/ANALYSIS)

## 1. Escopo
Esta documentacao cobre a logica de analise tecnica avancada que aparece no card "Analise Tecnica" (abas "Order Book" e "Medias Moveis") da secao `analysis` do app.

Arquivos principais:
- `www/index.html`
- `www/js/core.js`
- `www/js/init.js`
- `www/js/navigation.js`
- `www/js/lifecycle.js`
- `www/js/prices.js`
- `www/js/market.js`

## 2. Fluxo de execucao
### 2.1 Inicializacao (app start)
No `DOMContentLoaded`:
- Renderiza placeholders e UI basica.
- Chama `renderDropdownMenu()` para o seletor de cripto da analise.
- Agenda carga inicial escalonada (startup tasks).
- Inicia auto-refresh com intervalos diferentes para cada bloco.

Startup tasks relevantes:
- `fetchMovingAverages()` apos 2100ms.
- `fetchOrderBook()` apos 2500ms.

Auto-refresh relevante:
- `fetchOrderBook()` a cada 1500ms.
- `fetchMovingAverages()` a cada 60000ms.
- `fetchVolume()` a cada 30000ms.
- `fetchCryptoStats()` a cada 120000ms.

Importante:
- `fetchOrderBook()` so atualiza quando `currentSection === 'analysis'`.

### 2.2 Navegacao
Ao entrar na secao `analysis` (`showSection('analysis')`):
- `fetchOrderBook()`
- `fetchFearGreed()`
- `fetchVolume()`
- `fetchCryptoStats()`
- `fetchMovingAverages()`

### 2.3 Troca de cripto no dropdown
Em `selectOrderbookCrypto(symbol)`:
- Atualiza `currentOrderbookSymbol`.
- Atualiza icone/label do dropdown.
- Dispara recarga imediata de:
  - `fetchOrderBook()`
  - `fetchVolume()`
  - `fetchCryptoStats()`
  - `fetchMovingAverages()`

## 3. Estrutura de UI (IDs usados)
No card "Analise Tecnica" (`www/index.html`):
- Painel Order Book: `orderbook-container`
- Painel MAs: `panel-ma`
- Valores MAs: `ema-9`, `ema-20`, `ema-50`, `ma-50`, `ma-99`, `ma-200`
- Sinais por MA: `ema-9-signal`, `ema-20-signal`, `ema-50-signal`, `ma-50-signal`, `ma-99-signal`, `ma-200-signal`
- S/R: `sr-support`, `sr-resistance`
- Resumo final: `ma-summary`

## 4. Logica de Order Book (prices.js)
### 4.1 Fonte de dados
Endpoint Binance:
- `GET /api/v3/depth?symbol=<SYMBOL>&limit=10`

### 4.2 Renderizacao
- Mostra Bids e Asks em duas colunas.
- Exibe ate 8 linhas de cada lado.
- Nao calcula score direcional no card da HOME/ANALYSIS.

Conclusao:
- Nesta tela, Order Book e visual/informativo.
- Nao entra hoje na confluencia numerica junto com MA/SR.

## 5. Logica de Medias Moveis e Sinais (market.js)
Funcao principal: `fetchMovingAverages()`

### 5.1 Timeframes e dados
Busca klines Binance:
- 15m (380 candles)
- 1h (380 candles)
- 4h (260 candles)
- 1d (260 candles)
- 1w (160 candles)

Preco atual usado nos calculos:
- Ultimo close de 15m.

### 5.2 Medias calculadas
Mapeamento atual:
- `ema9` = EMA(9) de 15m
- `ema20` = EMA(21) de 1h (nome legado da variavel)
- `ema50` = EMA(50) de 4h
- `ma50` = SMA(20) de 1h
- `ma99` = SMA(50) de 4h
- `ma200` = SMA(200) de 1d

### 5.3 Regra de sinal por media
Para cada MA:
- `diffPct = ((currentPrice - ma) / ma) * 100`
- Se `diffPct > 2`: sinal `buy` com texto `UP ACIMA`
- Se `diffPct < -2`: sinal `sell` com texto `DOWN ABAIXO`
- Senao: sinal `neutral` com texto `NEUTRO`

Observacao:
- No codigo o texto exibido usa setas: `↑ ACIMA`, `↓ ABAIXO`, `→ NEUTRO`.

## 6. Confluencia de tendencia (MAs)
Confluencia atual de tendencia usa contagem simples:
- Conta quantos sinais sao `buy`.
- Conta quantos sinais sao `sell`.

Regra do resumo (`ma-summary`):
- `buyCount > sellCount` -> "TENDENCIA DE ALTA"
- `sellCount > buyCount` -> "TENDENCIA DE BAIXA"
- Empate -> "CONSOLIDACAO"

Importante:
- Todas as 6 MAs possuem peso igual nessa contagem.
- Nao existe score unico ponderado por timeframe nesta parte.

## 7. Suporte e Resistencia Inteligente (market.js)
Tambem dentro de `fetchMovingAverages()`.

### 7.1 Fontes de candidatos de nivel
1. Swings (fractais) em:
- 1h
- 4h
- 1d
- 1w

2. Pivots do candle anterior:
- Diario: `pivot`, `s1`, `s2`, `r1`, `r2`
- Semanal: `pivot`, `s1`, `s2`, `r1`, `r2`

3. Medias moveis atuais.

4. Niveis psicologicos:
- Grade baseada no preco (step adaptativo: 1000, 500, 250, 100, 10 ou 1).

### 7.2 Pesos base por tipo
- Swing 1w: 3.2
- Swing 1d: 2.8
- Swing 4h: 2.0
- Swing 1h: 1.6
- Pivot semanal: 2.2
- Pivot diario: 1.8
- MA: 1.2
- Psicologico: 1.5

### 7.3 ATR e parametros de distancia
ATR(14) em 4h:
- TR = max(high-low, abs(high-prevClose), abs(low-prevClose))
- ATR = media dos ultimos 14 TR
- Fallback ATR: `currentPrice * 0.012` se dados insuficientes.

Parametros principais:
- `toleranceAbs = max(price*0.005, atr14*0.9, price*0.0015)`
- `minDistanceAbs = max(price*0.0075, atr14*1.05)`
- `minSpacing = max(price*0.009, atr14*1.2)`
- Filtro de distancia maxima: `distPct <= 18`

### 7.4 Clusterizacao
- Junta niveis proximos por `toleranceAbs`.
- Recalcula centro do cluster por media incremental.

### 7.5 Score de confluencia do cluster
Para cada cluster:
- `weightSum`: soma de pesos dos membros.
- `touchScore`: toques por timeframe com pesos:
  - 1h: *0.4
  - 4h: *0.6
  - 1d: *0.9
  - 1w: *1.2
- `psychBoost`: +0.8 se cluster contem nivel psicologico.
- `tfBoost`:
  - +1.6 se tem componente forte (swing1w/swing1d/pivotW)
  - +0.9 se tem componente medio (swing4h/pivotD)
- `maPenalty`: -1.1 se cluster for somente de MAs.
- `nearPenalty`: penaliza niveis muito colados no preco.

Formula final:
- `score = weightSum*1.35 + touchScore*1.1 + psychBoost + tfBoost + maPenalty + nearPenalty - distPct*0.2`

### 7.6 Escolha de suporte e resistencia
1. Seleciona por direcao:
- Suporte: abaixo do preco e respeitando `minDistanceAbs`
- Resistencia: acima do preco e respeitando `minDistanceAbs`

2. Fallback relaxado:
- Se nao achar nivel, usa corte de distancia reduzido (`0.6 * minDistanceAbs`).

3. Evita S/R muito proximos:
- Se `(resistance - support) < minSpacing`, tenta alternativas por score.

4. Evita nivel colado no preco:
- Se suporte/resistencia ainda estiver muito perto, busca alternativa mais distante.

5. Fallback final garantido:
- Suporte: `price - atr14*1.8`
- Resistencia: `price + atr14*1.8`
- E ajuste final para manter suporte < preco e resistencia > preco.

## 8. O que hoje conta como "confluencia"
Confluencia implementada em dois pontos:
1. Confluencia de tendencia (MAs): contagem de sinais buy/sell.
2. Confluencia de zona (S/R): score por cluster (pesos + toques + timeframe + distancia).

Nao existe ainda:
- Um score unico fundindo Order Book + MAs + S/R.
- Probabilidade/calibracao historica por ativo.

## 9. Pontos importantes para melhoria da logica
1. `allMAs` e calculada mas nao e usada para nada.
2. `pickBestLevel()` existe no codigo e nao e usada.
3. Rotulos visuais de MAs no HTML ainda estao desalinhados com o mapeamento real das series (labels legados).
4. Order Book nao gera sinal numerico/score, so exibe book.
5. A confluencia de tendencia usa peso igual para todas as MAs.

## 10. Sugestoes praticas de evolucao (roadmap)
1. Criar score unificado (0-100) combinando:
- Trend score (MAs)
- SR quality score (clusters)
- Book pressure score (bid/ask imbalance)

2. Dar peso dinamico por regime:
- Tendencia forte: mais peso para 4h/1d.
- Lateralizacao: mais peso para SR e toques.

3. Validar qualidade por historico:
- Track de acerto por ativo/timeframe.
- Ajuste automatico de thresholds (2%, minDistance, minSpacing).

4. Melhorar UX de explicabilidade:
- Mostrar no card os "motivos" do score (top 3 fatores).
- Exibir distancia percentual ate suporte e resistencia.

5. Resolver divida tecnica:
- Remover funcoes/variaveis nao usadas.
- Alinhar labels do HTML com calculo real.

---

Se quiser, no proximo passo eu ja implemento a versao 1 desse score unificado de confluencia com pesos configuraveis por ativo.
