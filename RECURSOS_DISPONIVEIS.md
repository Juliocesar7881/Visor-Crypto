# TradeBot AI - Recursos Disponíveis para Monitoramento

## 📊 O QUE O APP MONITORA ATUALMENTE

Este documento resume todas as funcionalidades de monitoramento disponíveis no TradeBot AI.

---

## 1. 💰 MONITORAMENTO DE CONTA (Paper Trading)

### Saldo e Patrimônio
- **Saldo disponível**: $10,000 USDT inicial (virtual)
- **Saldo atual**: Atualizado em tempo real conforme operações
- **P&L Total**: Lucro/Prejuízo acumulado desde o início
- **P&L Percentual**: Variação em % do saldo inicial

### Estatísticas de Performance
- **Win Rate**: Porcentagem de trades lucrativos
- **Total de Trades**: Quantidade de operações realizadas
- **Melhor Trade**: Maior lucro em uma única operação
- **Pior Trade**: Maior prejuízo em uma única operação
- **Tempo Médio de Holding**: Duração média das posições
- **Sharpe Ratio**: Indicador de qualidade risco/retorno

---

## 2. 📈 MONITORAMENTO DE MERCADO

### Preços em Tempo Real
| Moeda | Dados Disponíveis |
|-------|-------------------|
| **BTC/USDT** | Preço atual, variação 24h, volume |
| **ETH/USDT** | Preço atual, variação 24h, volume |
| **Altcoins** | Suporte para múltiplas moedas |

### Dados de Cada Moeda
- **Preço atual**: Atualizado a cada 5 segundos
- **Variação 24h**: Alta ou baixa percentual
- **Volume 24h**: Total negociado nas últimas 24 horas
- **High 24h**: Preço máximo do dia
- **Low 24h**: Preço mínimo do dia
- **Direção**: Indicador visual ↑ (subindo) ou ↓ (descendo)

---

## 3. 📉 INDICADORES TÉCNICOS

### RSI (Relative Strength Index)
- **Período**: 14 candles
- **Escala**: 0-100
- **Interpretação**:
  - RSI < 30 = Oversold (sobrevendido) 🟢 Possível alta
  - RSI 30-70 = Neutro 🟡
  - RSI > 70 = Overbought (sobrecomprado) 🔴 Possível queda

### MACD (Moving Average Convergence Divergence)
- **Linhas**: MACD Line, Signal Line, Histogram
- **Sinais**:
  - Bullish Cross = Linha MACD cruza acima da Signal 🟢
  - Bearish Cross = Linha MACD cruza abaixo da Signal 🔴
  - Divergências = Preço vs MACD em direções opostas

### Médias Móveis (Moving Averages)
- **MA(20)**: Média dos últimos 20 períodos (curto prazo)
- **MA(50)**: Média dos últimos 50 períodos (médio prazo)
- **Cruzamentos**: MA20 > MA50 = Tendência de alta

### Volume
- **Volume atual**: Comparado com média
- **Variação**: % acima ou abaixo da média
- **Spikes**: Alertas quando volume aumenta significativamente (+30%+)

---

## 4. ⏱️ ANÁLISE MULTI-TIMEFRAME

### Timeframes Disponíveis
| Timeframe | Uso Principal |
|-----------|---------------|
| **15 minutos** | Scalping, entradas precisas |
| **1 hora** | Day trading |
| **4 horas** | Swing trading |
| **1 dia** | Tendência geral, contexto macro |

### O que é analisado em cada timeframe
- Tendência (Bullish/Bearish/Neutral)
- RSI do timeframe
- Posição das médias móveis
- Volume relativo

### Alinhamento de Timeframes
- **3+ timeframes alinhados** = Sinal forte (alta confiança)
- **Timeframes conflitantes** = Sinal fraco (baixa confiança)

---

## 5. 📰 MONITORAMENTO DE NOTÍCIAS

### Fontes de Notícias
- CoinDesk
- Reuters
- TradingView
- CryptoPanic (agregador)

### Classificação de Notícias
| Prioridade | Descrição | Exemplo |
|------------|-----------|---------|
| 🔥 **Alta** | Impacto imediato no mercado | "Bitcoin atinge $100k" |
| ⚡ **Média** | Relevante mas não urgente | "Fed mantém taxas" |
| 📊 **Baixa** | Análises e opiniões | "Análise técnica semanal" |

### Análise de Sentimento
- 🟢 **Positivo**: Notícia favorável ao preço subir
- 🔴 **Negativo**: Notícia que pode derrubar preço
- 🟡 **Neutro**: Sem impacto claro definido

### Filtros Disponíveis
- Por moeda (Bitcoin, Ethereum, Altcoins)
- Por sentimento
- Por prioridade
- Por tempo (recentes primeiro)

---

## 6. 🎯 SINAIS DE TRADING

### Como os Sinais são Gerados
A IA analisa combinações de:
1. Indicadores técnicos (RSI, MACD, Volume, MAs)
2. Alinhamento de múltiplos timeframes
3. Sentimento das notícias recentes
4. Padrões históricos de sucesso

### Estrutura de um Sinal
```
Símbolo: BTC/USDT
Direção: LONG (compra) ou SHORT (venda)
Confiança: 0-100%
Razão: "RSI Oversold + MACD Bullish Cross"
Indicadores: Detalhes técnicos
```

### Níveis de Confiança
| Confiança | Significado |
|-----------|-------------|
| 80-100% | Sinal muito forte 🟢 |
| 60-79% | Sinal moderado 🟡 |
| 40-59% | Sinal fraco 🟠 |
| < 40% | Não recomendado 🔴 |

---

## 7. 📊 MONITORAMENTO DE POSIÇÕES

### Posições Abertas
- **Símbolo**: Par sendo operado (ex: BTC/USDT)
- **Lado**: LONG (aposta na alta) ou SHORT (aposta na queda)
- **Preço de entrada**: Preço no momento da abertura
- **Preço atual**: Preço em tempo real
- **Quantidade**: Volume da operação
- **Alavancagem**: Multiplicador (1x a 10x)
- **P&L em USD**: Lucro/prejuízo em dólares
- **P&L %**: Lucro/prejuízo percentual
- **Data/hora de abertura**: Timestamp

### Parâmetros de Proteção
- **Stop Loss**: Preço que fecha posição automaticamente se der errado
- **Take Profit**: Preço que fecha posição automaticamente se der certo
- **Margem**: Quanto do saldo está alocado na posição

### Histórico de Posições Fechadas
- Todas as operações passadas
- Resultado final (lucro/prejuízo)
- Duração da operação
- Motivo do fechamento (manual, SL, TP)

---

## 8. 🧠 RELATÓRIOS DE APRENDIZADO (IA)

### O que a IA registra em cada trade
```
📊 Dados da Operação:
- Símbolo, lado, alavancagem
- Preço entrada/saída
- P&L final

📈 Análise Multi-Timeframe na entrada:
- 15m: Bullish/Bearish/Neutral
- 1h: Bullish/Bearish/Neutral
- 4h: Bullish/Bearish/Neutral
- 1d: Bullish/Bearish/Neutral

📉 Indicadores no momento da entrada:
- RSI: valor e interpretação
- MACD: estado do cruzamento
- Volume: variação percentual
- MAs: posicionamento relativo

📰 Contexto de mercado:
- Notícias relevantes no momento
- Sentimento geral do mercado

🧠 Aprendizado:
- O que funcionou
- O que não funcionou
- Padrão identificado
```

### Métricas de Evolução da IA
- Taxa de acerto por tipo de sinal
- Melhores combinações de indicadores
- Impacto de notícias nos resultados
- Timeframes mais confiáveis

---

## 9. 🔔 ALERTAS E NOTIFICAÇÕES

### Tipos de Alertas
| Alerta | Descrição |
|--------|-----------|
| **Novo Sinal** | IA detectou oportunidade de trade |
| **Stop Loss Hit** | Posição fechada por proteção |
| **Take Profit Hit** | Posição fechada com lucro |
| **Preço Alvo** | Moeda atingiu preço definido |
| **Notícia Importante** | News de alta prioridade |
| **Volume Spike** | Volume aumentou significativamente |

---

## 10. 📱 DASHBOARD - VISÃO CONSOLIDADA

### O que aparece na tela inicial
```
┌─────────────────────────────────────┐
│  💰 SALDO: $10,250.00              │
│  📊 P&L: +$250.00 (+2.5%)          │
├─────────────────────────────────────┤
│  📈 MERCADO AO VIVO                │
│  BTC: $97,500 ↑ (+2.3%)            │
│  ETH: $3,450 ↓ (-0.8%)             │
├─────────────────────────────────────┤
│  🔥 SINAIS ATIVOS: 2                │
│  • LONG BTC - 85% confiança        │
│  • SHORT ETH - 72% confiança       │
├─────────────────────────────────────┤
│  📊 POSIÇÕES ABERTAS: 1             │
│  • BTC LONG +$125 (+1.2%)          │
└─────────────────────────────────────┘
```

---

## 📡 APIs UTILIZADAS

### Backend Local (Seu Servidor)
- **URL**: `http://192.168.1.3:8000/api`
- **Função**: Paper trading, posições, relatórios

### CoinGecko API (Gratuita)
- **Função**: Preços de criptomoedas em tempo real
- **Limite**: 10-50 requests/minuto (plano gratuito)

### CryptoPanic API
- **Função**: Notícias e sentimento de mercado
- **Chave**: Necessária para acesso completo

---

## 🔗 LINKS DE ANÁLISE EXTERNOS

### Arkham Intelligence (Whale Tracking)
| Link | Descrição |
|------|-----------|
| **[BlackRock Holdings](https://intel.arkm.com/explorer/entity/blackrock)** | Monitorar carteiras e movimentações da BlackRock |
| **[Grayscale GBTC](https://intel.arkm.com/explorer/entity/grayscale)** | Fluxos de entrada/saída do Grayscale |
| **[MicroStrategy](https://intel.arkm.com/explorer/entity/microstrategy)** | Holdings de Bitcoin da MSTR |

### Outros Links Úteis
| Link | Descrição |
|------|-----------|
| **[Liquidation Heatmap](https://www.coinglass.com/pro/futures/LiquidationHeatMap)** | Mapa de calor de liquidações |
| **[Fear & Greed Index](https://alternative.me/crypto/fear-and-greed-index/)** | Índice de medo e ganância |

---

## 📊 NOVOS RECURSOS ADICIONADOS

### SuperTrend Indicator
O SuperTrend é um indicador de tendência baseado em ATR (Average True Range):
- **Tendência Bullish** 🟢: Preço acima do SuperTrend = tendência de ALTA
- **Tendência Bearish** 🔴: Preço abaixo do SuperTrend = tendência de BAIXA
- **Força**: Porcentagem de distância do preço ao SuperTrend (0-100%)
- **Sinal**: BUY (bullish) ou SELL (bearish)

### Livro de Ordens (Order Book)
Visualização em tempo real das ordens de compra e venda:
- **Bids (Compras)**: Ordens de compra abaixo do preço atual
- **Asks (Vendas)**: Ordens de venda acima do preço atual
- **Spread**: Diferença entre melhor bid e ask
- **Imbalance**: Desequilíbrio entre compradores e vendedores

### Tipos de Ordens
| Tipo | Descrição |
|------|-----------|
| **Ordem de Mercado** | Executa imediatamente no preço atual |
| **Ordem Limite** | Executa apenas quando preço atingir o valor definido |

### Whale Tracker
Monitoramento de movimentações de grandes investidores:
- BlackRock, Grayscale, MicroStrategy
- Transações grandes detectadas
- Fluxos de entrada/saída de exchanges
- Sentimento institucional

---

## ✅ RESUMO - O QUE VOCÊ PODE MONITORAR

| Categoria | Itens Monitorados |
|-----------|-------------------|
| **Conta** | Saldo, P&L, Win Rate, Stats |
| **Mercado** | Preços BTC/ETH, Volume, Variação 24h |
| **Técnico** | RSI, MACD, MAs, Volume |
| **Timeframes** | 15m, 1h, 4h, 1d |
| **Notícias** | Feed, Sentimento, Prioridade |
| **Sinais** | Direção, Confiança, Razão |
| **Posições** | Abertas, Fechadas, P&L |
| **IA** | Relatórios, Aprendizado, Padrões |

---

**Última atualização**: Dezembro 2025
