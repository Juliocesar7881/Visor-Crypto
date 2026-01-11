# TradeBot AI - Flutter App Complete Specification

## 📱 OVERVIEW

**TradeBot AI** é um aplicativo mobile de simulação de trading de criptomoedas (paper trading) com inteligência artificial integrada. O app permite que usuários pratiquem estratégias de trading sem risco financeiro, usando um saldo virtual de $10,000 USDT.

### 💡 O QUE O APP FAZ?

O TradeBot AI simula operações reais de trading de criptomoedas (Bitcoin, Ethereum, etc.) mas usando dinheiro virtual. É como um "jogo de simulação" onde você aprende a fazer trading sem perder dinheiro real. A diferença é que o app tem IA que:

1. **Analisa o mercado** usando indicadores técnicos (RSI, MACD, Volume)
2. **Sugere operações** (quando comprar ou vender) baseado em padrões
3. **Aprende com cada operação** que você faz, gerando relatórios detalhados
4. **Mostra notícias** que podem impactar o preço das moedas

### 🎯 PARA QUEM É O APP?

- **Iniciantes** que querem aprender trading sem risco
- **Traders experientes** que querem testar novas estratégias
- **Estudantes** de mercado financeiro e criptomoedas
- **Curiosos** sobre trading automatizado com IA

---

## 🧭 NAVEGAÇÃO DO APP (5 ABAS)

### 📊 1. DASHBOARD (Tela Inicial - Ícone: ⚡ Raio)
**Para que serve:** É a "central de comando" do app, onde você vê tudo que está acontecendo agora.

**O que tem:**
- **Seu saldo**: $10,000 USDT disponível para operar
- **Lucro/Prejuízo total**: Quanto você ganhou ou perdeu até agora (ex: +$250 = +2.5%)
- **Preços ao vivo**: BTC, ETH e outras moedas com preço atual e se está subindo ↑ ou descendo ↓
- **Sinais de trading**: A IA sugere operações (ex: "LONG BTC - RSI Oversold - Confiança 85%")
- **Botão rápido**: Para abrir uma nova operação rapidamente

**Como funciona:** É tipo um painel de carro - mostra todas as informações importantes de uma vez. Se a IA detecta uma boa oportunidade, aparece um sinal piscando para você considerar abrir uma posição.

---

### 📈 2. POSIÇÕES (Ícone: 📊 Gráfico de Barras)
**Para que serve:** Mostra todas as suas operações ativas e histórico de operações fechadas.

**O que tem:**
- **Aba "Abertas"**: Operações que você fez e ainda estão rodando
  - LONG = aposta que o preço vai subir
  - SHORT = aposta que o preço vai descer
- **Aba "Fechadas"**: Histórico de operações que você já encerrou
- **Detalhes de cada operação**:
  - Preço de entrada (quanto custava quando você comprou)
  - Preço atual
  - Quanto você está ganhando ou perdendo (P&L)
  - Alavancagem (multiplicador do seu investimento: 5x = 5 vezes mais lucro/prejuízo)

**Como funciona:** 
- Se você abriu um LONG (aposta na alta) de BTC a $42,800 e agora está $43,250, você está lucrando!
- Pode arrastar o card para fechar a operação rápido (swipe)
- Pode editar Stop Loss (fecha automático se cair) ou Take Profit (fecha automático se subir)

**Exemplo real:** Você compra 0.5 BTC a $42,800 com alavancagem 5x. Se BTC sobe para $43,250 (+1.05%), seu lucro é +$225 (5x mais que sem alavancagem).

---

### 📉 3. GRÁFICOS (Ícone: 📈 Gráfico de Linha)
**Para que serve:** Ver gráficos de preços das moedas e analisar indicadores técnicos para decidir quando comprar/vender.

**O que tem:**
- **Gráfico de velas** (candlestick): Cada vela mostra preço de abertura, fechamento, máxima e mínima em um período
- **Timeframes**: 15 minutos, 1 hora, 4 horas, 1 dia (você escolhe o zoom)
- **Indicadores técnicos ao vivo**:
  - **RSI (14)**: De 0-100, se < 30 = oversold (pode subir), se > 70 = overbought (pode cair)
  - **MACD**: Indica tendência (bullish = subindo, bearish = caindo)
  - **Médias Móveis (MA)**: Linha média de preço dos últimos 20 ou 50 períodos
  - **Volume**: Quanto dinheiro está sendo negociado (volume alto = movimento forte)
- **Botões de ação**: LONG (comprar) ou SHORT (vender)

**Como funciona:** Você analisa o gráfico como um "médico lendo um eletrocardiograma". Se RSI está baixo (35), MACD cruza para cima e volume aumenta, pode ser sinal de alta. Daí você clica em LONG para abrir uma posição.

**Exemplo real:** Você vê que BTC está em RSI 32 (oversold), MACD fez cruzamento bullish e volume subiu 45%. Esses 3 sinais juntos indicam forte chance de alta, então você abre um LONG.

---

### 📰 4. NOTÍCIAS (Ícone: 📰 Jornal)
**Para que serve:** Ver notícias sobre criptomoedas que podem impactar o preço (alta ou baixa).

**O que tem:**
- **Feed de notícias** de fontes confiáveis (CoinDesk, Reuters, TradingView)
- **Filtros**: Todas, Bitcoin, Ethereum, Altcoins
- **Prioridade**:
  - 🔥 Alta (ex: "Bitcoin atinge $50k")
  - ⚡ Média (ex: "Fed mantém taxas")
  - 📊 Baixa (análises gerais)
- **Sentimento**: 
  - 🟢 Positivo = bom para o preço
  - 🔴 Negativo = ruim para o preço
  - 🟡 Neutro = sem impacto claro
- **Tempo**: Quando a notícia foi publicada (5 min atrás, 1h atrás)

**Como funciona:** Se sair notícia "Bitcoin aprovado como reserva nacional da China" (positivo), preço tende a subir. Se sair "Hack de exchange rouba $100M" (negativo), preço tende a cair. Você usa isso para decidir suas operações.

**Exemplo real:** Você vê notícia "El Salvador compra mais 500 BTC" (sentimento positivo) há 10 minutos. Isso pode empurrar o preço para cima, então você abre um LONG rápido.

---

### 👤 5. CONTA (Ícone: 👤 Perfil)
**Para que serve:** Ver suas estatísticas, histórico de aprendizado da IA e configurações do app.

**O que tem:**
- **Resumo da conta**:
  - Saldo atual: $10,000 + lucros/perdas
  - P&L Total: Quanto você ganhou ou perdeu desde o início
  - Win Rate: % de operações lucrativas (ex: 68% = 68 de 100 deram lucro)
  - Total de trades: Quantas operações você já fez

- **Estatísticas**:
  - Melhor trade: Maior lucro em uma operação (+$450)
  - Pior trade: Maior prejuízo (-$120)
  - Tempo médio: Quanto tempo você segura cada posição (2.5 horas)
  - Sharpe Ratio: Indicador de qualidade das operações (>1 = bom)

- **🧠 Relatórios de Aprendizado** (O DIFERENCIAL DO APP):
  - Cada vez que você fecha uma operação, a IA gera um relatório completo
  - Mostra o que funcionou e o que não funcionou
  - Analisa indicadores no momento da entrada
  - Coleta notícias que estavam rolando
  - **APRENDE** para sugerir melhores operações no futuro

- **Configurações**:
  - Notificações (avisos de sinais)
  - API Keys (se quiser conectar exchange real no futuro)
  - Modo escuro (já é padrão)
  - Sobre o app

**Como funciona:** É como um "diário de bordo" + "professor particular". A IA anota tudo que aconteceu em cada operação e te mostra o que você acertou ou errou. Com o tempo, você vê padrões e melhora suas estratégias.

**Exemplo real de relatório:**
```
Trade #47 - BTC LONG 5x
✅ Sucesso (+$225)

📈 Multi-Timeframe na entrada:
- 15m: Bullish 🟢
- 1h: Bullish 🟢
- 4h: Neutral 🟡
- 1d: Bullish 🟢

📊 Indicadores:
- RSI: 35 (Oversold) ✅
- MACD: Bullish Cross ✅
- Volume: +45% ✅
- MA20 > MA50 ✅

📰 Notícias:
• "Bitcoin adoption grows in Latin America" (Positive)

🧠 Aprendizado:
"RSI abaixo de 40 + aumento de volume + notícia positiva = 
combinação forte. Alinhamento de múltiplos timeframes 
aumentou probabilidade de sucesso para 85%."
```

---

## 🎮 FLUXO DE USO (COMO ALGUÉM USA O APP)

1. **Abre o app** → Vai para Dashboard
2. **Vê um sinal**: "LONG BTC - RSI Oversold - 85% confiança"
3. **Clica no sinal** → Abre modal de nova posição
4. **Escolhe**:
   - Quantidade: 0.5 BTC
   - Alavancagem: 5x (slider)
   - Stop Loss: $42,500 (proteção)
   - Take Profit: $44,500 (meta)
5. **Confirma** → Posição aberta!
6. **Vai para aba Posições** → Vê a operação rodando
7. **Vai para aba Gráficos** → Acompanha o preço subindo
8. **Preço atinge Take Profit** → Operação fecha automaticamente com lucro!
9. **Vai para aba Conta** → Vê o relatório gerado pela IA
10. **Lê o aprendizado** → Entende o que funcionou
11. **Próxima operação** → Usa o conhecimento para melhorar

---

## 🚀 RESUMO RÁPIDO

| Aba | Ícone | O que faz | Quando usar |
|-----|-------|-----------|-------------|
| **Dashboard** | ⚡ | Ver tudo de uma vez: saldo, preços, sinais | Sempre que abrir o app |
| **Posições** | 📊 | Ver operações abertas e histórico | Para acompanhar seus trades |
| **Gráficos** | 📈 | Analisar preços e indicadores técnicos | Antes de abrir uma posição |
| **Notícias** | 📰 | Ver notícias que impactam preços | Para contexto do mercado |
| **Conta** | 👤 | Ver stats e relatórios de aprendizado | Para melhorar suas estratégias |

---

## 💰 PAPER TRADING - EXPLICAÇÃO SIMPLES

**O que é?** É trading com dinheiro de mentira, mas preços de verdade.

**Como funciona?**
- Você começa com $10,000 virtuais
- Preços das moedas são reais (pegamos da API)
- Você faz operações como se fosse dinheiro real
- Se acertar, seu saldo aumenta ($10,500)
- Se errar, seu saldo diminui ($9,500)
- **MAS SEU DINHEIRO REAL NUNCA MUDA!**

**Por que isso é útil?**
- Treinar sem risco
- Testar estratégias
- Aprender com erros sem perder dinheiro
- Quando estiver pronto, pode usar em exchange real

---

## 🧠 SISTEMA DE IA - COMO FUNCIONA

A IA do app faz 3 coisas:

### 1. 📊 Análise de Mercado
- Calcula RSI, MACD, Volume em tempo real
- Compara múltiplos timeframes (15m, 1h, 4h, 1d)
- Detecta padrões (oversold, bullish cross, volume spike)

### 2. 💡 Geração de Sinais
- Se 3+ indicadores alinham, gera sinal
- Calcula confiança (0-100%)
- Mostra no Dashboard com botão "Abrir Posição"

### 3. 🧠 Aprendizado Contínuo
- Quando você fecha uma posição, IA analisa:
  - Indicadores no momento da entrada
  - Notícias que estavam rolando
  - Timeframes alinhados ou não
  - Se deu lucro ou prejuízo
- Gera relatório explicando O QUE FUNCIONOU
- Usa esses dados para melhorar próximos sinais

**Exemplo de evolução:**
- Trade 1: RSI + Volume → 60% confiança → Deu lucro
- Trade 5: RSI + Volume + MA → 70% confiança → Deu lucro
- Trade 20: RSI + Volume + MA + Notícia positiva → 85% confiança → Deu lucro

A IA aprende que notícias positivas aumentam chance de sucesso!

---

---

## 🎨 DESIGN SYSTEM

### Color Palette
```dart
// Primary Colors
const primaryBlue = Color(0xFF3B82F6);
const primaryDark = Color(0xFF0F172A);
const secondaryDark = Color(0xFF1E293B);
const accentGreen = Color(0xFF10B981);
const accentRed = Color(0xFFEF4444);

// Text Colors
const textWhite = Color(0xFFFFFFFF);
const textGray = Color(0xFF94A3B8);
const textLightGray = Color(0xFFCBD5E1);
const textDarkGray = Color(0xFF64748B);

// Border/Divider
const borderColor = Color(0xFF334155);
```

### Typography
- **Heading 1**: 32px, Bold, White
- **Heading 2**: 24px, Bold, White
- **Heading 3**: 18px, Bold, White
- **Body**: 16px, Regular, Light Gray
- **Caption**: 14px, Regular, Gray
- **Small**: 12px, Regular, Dark Gray

### Components Style
- **Cards**: Background #1E293B, border-radius 16px, padding 20px
- **Buttons**: Primary #3B82F6, height 56px, border-radius 12px
- **Input Fields**: Background #1E293B, border #334155, border-radius 8px
- **Bottom Navigation**: Background #1E293B, border-top #334155

---

## 📐 SCREEN STRUCTURE

### 1. DASHBOARD (Home Screen)
**Layout:**
```
┌─────────────────────────────────┐
│  🤖 TradeBot AI         [⚙️]    │
│  Sistema de Trading Inteligente  │
├─────────────────────────────────┤
│  ┌───────────────────────────┐  │
│  │  💰 Saldo Disponível      │  │
│  │  $10,000.00 USDT          │  │
│  │  📊 P&L: +$0.00 (+0.00%)  │  │
│  └───────────────────────────┘  │
├─────────────────────────────────┤
│  📈 Mercado ao Vivo             │
│  ┌──────────┬──────────────┐   │
│  │ BTC/USDT │ $43,250.00 ↑│   │
│  │ Volume   │ 2.5B         │   │
│  ├──────────┼──────────────┤   │
│  │ ETH/USDT │ $2,280.50 ↓ │   │
│  │ Volume   │ 890M         │   │
│  └──────────┴──────────────┘   │
├─────────────────────────────────┤
│  🔥 Sinais Ativos               │
│  ┌───────────────────────────┐  │
│  │ ⚡ BTC/USDT                │  │
│  │ LONG - RSI Oversold       │  │
│  │ Confiança: 85% 🟢         │  │
│  │ [Abrir Posição]           │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

**Widgets:**
- `BalanceCard`: Shows balance, P&L with gradient background
- `MarketTicker`: Real-time price list with up/down indicators
- `SignalCard`: Trading signals with confidence meter
- `FloatingActionButton`: Quick trade button (bottom-right)

---

### 2. POSIÇÕES (Positions Screen)
**Layout:**
```
┌─────────────────────────────────┐
│  📊 Minhas Posições              │
├─────────────────────────────────┤
│  [Abertas] [Fechadas] [Todas]   │
├─────────────────────────────────┤
│  ┌───────────────────────────┐  │
│  │ 🟢 LONG BTC/USDT          │  │
│  │ Entrada: $42,800          │  │
│  │ Atual: $43,250 (+1.05%)   │  │
│  │ Quantidade: 0.5 BTC       │  │
│  │ P&L: +$225.00 🟢          │  │
│  │ Alavancagem: 5x           │  │
│  │ [Fechar] [Editar SL/TP]   │  │
│  └───────────────────────────┘  │
│  ┌───────────────────────────┐  │
│  │ 🔴 SHORT ETH/USDT         │  │
│  │ Entrada: $2,350           │  │
│  │ Atual: $2,280 (+2.98%)    │  │
│  │ Quantidade: 5 ETH         │  │
│  │ P&L: +$350.00 🟢          │  │
│  │ Alavancagem: 3x           │  │
│  │ [Fechar] [Editar SL/TP]   │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

**Features:**
- Swipe to close position
- Pull to refresh
- Tap card to see detailed chart
- Color-coded P&L (green/red)

---

### 3. GRÁFICOS (Charts Screen)
**Layout:**
```
┌─────────────────────────────────┐
│  [BTC/USDT ▼] [1H] [4H] [1D]    │
├─────────────────────────────────┤
│  ┌───────────────────────────┐  │
│  │                           │  │
│  │    📈 Candlestick Chart   │  │
│  │        with Volume        │  │
│  │                           │  │
│  │   (Interactive Chart)     │  │
│  │                           │  │
│  └───────────────────────────┘  │
├─────────────────────────────────┤
│  📊 Indicadores Técnicos         │
│  ┌───────────────────────────┐  │
│  │ RSI (14): 45.2 🟡         │  │
│  │ MACD: Bullish 🟢          │  │
│  │ MA(20): $42,500           │  │
│  │ MA(50): $41,800           │  │
│  │ Volume: 2.5B (+15%)       │  │
│  └───────────────────────────┘  │
├─────────────────────────────────┤
│  [🔼 LONG] [🔽 SHORT]            │
└─────────────────────────────────┘
```

**Chart Library:** Use `fl_chart` or `syncfusion_flutter_charts`

---

### 4. NOTÍCIAS (News Screen)
**Layout:**
```
┌─────────────────────────────────┐
│  📰 Notícias Crypto              │
│  [Todas] [Bitcoin] [Ethereum]   │
├─────────────────────────────────┤
│  ┌───────────────────────────┐  │
│  │ 🔥 ALTA PRIORIDADE        │  │
│  │ Bitcoin atinge $50k       │  │
│  │ CoinDesk • 5 min atrás    │  │
│  │ Sentimento: 🟢 Positivo   │  │
│  └───────────────────────────┘  │
│  ┌───────────────────────────┐  │
│  │ ⚡ MÉDIA PRIORIDADE       │  │
│  │ Fed mantém taxas          │  │
│  │ Reuters • 1h atrás        │  │
│  │ Sentimento: 🟡 Neutro     │  │
│  └───────────────────────────┘  │
│  ┌───────────────────────────┐  │
│  │ 📊 Análise de mercado     │  │
│  │ Volume aumenta 50%        │  │
│  │ TradingView • 3h atrás    │  │
│  │ Sentimento: 🟢 Positivo   │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

**Features:**
- Pull to refresh
- Filter by sentiment (positive/negative/neutral)
- Tap to open full article in WebView

---

### 5. CONTA (Account Screen)
**Layout:**
```
┌─────────────────────────────────┐
│  👤 Minha Conta                  │
├─────────────────────────────────┤
│  ┌───────────────────────────┐  │
│  │  💼 Paper Trading Account │  │
│  │  Saldo: $10,000.00        │  │
│  │  Total P&L: +$1,250.00    │  │
│  │  Win Rate: 68%            │  │
│  │  Total Trades: 47         │  │
│  └───────────────────────────┘  │
├─────────────────────────────────┤
│  📊 Estatísticas                 │
│  ┌───────────────────────────┐  │
│  │ Melhor Trade: +$450       │  │
│  │ Pior Trade: -$120         │  │
│  │ Avg. Holding: 2.5 horas   │  │
│  │ Sharpe Ratio: 1.8         │  │
│  └───────────────────────────┘  │
├─────────────────────────────────┤
│  🧠 Relatórios de Aprendizado    │
│  ┌───────────────────────────┐  │
│  │ 📝 Trade #47 - BTC        │  │
│  │ ✅ Sucesso                │  │
│  │ Aprendizado: RSI + Volume │  │
│  │ [Ver Detalhes]            │  │
│  └───────────────────────────┘  │
├─────────────────────────────────┤
│  ⚙️ Configurações                │
│  [Notificações] [API Keys]      │
│  [Modo Escuro] [Sobre]          │
└─────────────────────────────────┘
```

---

### 6. ABRIR POSIÇÃO (Trade Modal)
**Bottom Sheet:**
```
┌─────────────────────────────────┐
│  📈 Nova Posição                 │
├─────────────────────────────────┤
│  Par: [BTC/USDT ▼]              │
│  Tipo: [⚪ LONG] [⚪ SHORT]      │
│  Preço Entrada: $43,250.00      │
│  Quantidade: [0.5 BTC]          │
│  Alavancagem: [5x] [━━━●━━━]    │
│  ┌───────────────────────────┐  │
│  │ Stop Loss: $42,500        │  │
│  │ Take Profit: $44,500      │  │
│  └───────────────────────────┘  │
│  Margem Necessária: $4,325.00   │
│  P&L Potencial: -$375 / +$625   │
│  ┌───────────────────────────┐  │
│  │  [Confirmar Posição] 🚀   │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

---

### 7. RELATÓRIO DETALHADO (Learning Report)
**Full Screen:**
```
┌─────────────────────────────────┐
│  ← 📊 Relatório Trade #47        │
├─────────────────────────────────┤
│  BTC/USDT • LONG • 5x            │
│  ✅ Sucesso (+$225.00)           │
├─────────────────────────────────┤
│  📈 Análise Multi-Timeframe      │
│  ┌───────────────────────────┐  │
│  │ 15m: Bullish 🟢           │  │
│  │ 1h:  Bullish 🟢           │  │
│  │ 4h:  Neutral 🟡           │  │
│  │ 1d:  Bullish 🟢           │  │
│  └───────────────────────────┘  │
├─────────────────────────────────┤
│  📊 Indicadores na Entrada       │
│  ┌───────────────────────────┐  │
│  │ RSI: 35 (Oversold) ✅     │  │
│  │ MACD: Bullish Cross ✅    │  │
│  │ Volume: +45% ✅           │  │
│  │ MA20 > MA50 ✅            │  │
│  └───────────────────────────┘  │
├─────────────────────────────────┤
│  📰 Notícias Relevantes          │
│  • Bitcoin adoção cresce         │
│  • Sentimento: Positivo          │
├─────────────────────────────────┤
│  🧠 O que aprendi                │
│  "RSI abaixo de 40 + aumento de │
│   volume indicou bom momento    │
│   de entrada. Alinhamento de    │
│   múltiplos timeframes aumentou │
│   probabilidade de sucesso."    │
└─────────────────────────────────┘
```

---

## 🔧 BACKEND API INTEGRATION

### Base URL
```dart
const String API_BASE_URL = "http://192.168.1.3:8000/api";
```

### API Endpoints
```dart
// Account
GET  /account/balance
GET  /account/paper/positions

// Market Data
GET  /market/crypto/{symbol}
GET  /market/candles/{symbol}/{timeframe}

// Trading
POST /bot/paper/open
POST /bot/paper/close

// News
GET  /news
GET  /news/sentiment

// Signals
GET  /signals

// Reports
GET  /bot/paper/reports
GET  /bot/paper/reports/{position_id}
```

### Models (Dart Classes)
```dart
class Balance {
  final double balanceUsd;
  final double totalPnl;
  final double pnlPercentage;
}

class Position {
  final String id;
  final String symbol;
  final String side; // "long" or "short"
  final double entryPrice;
  final double currentPrice;
  final double quantity;
  final int leverage;
  final double pnlUsd;
  final double pnlPercentage;
  final DateTime openedAt;
}

class MarketData {
  final String symbol;
  final double price;
  final double change24h;
  final double volume24h;
  final double high24h;
  final double low24h;
}

class NewsItem {
  final String id;
  final String title;
  final String source;
  final DateTime publishedAt;
  final String sentiment; // "positive", "negative", "neutral"
  final String url;
}

class TradingSignal {
  final String symbol;
  final String direction; // "long" or "short"
  final double confidence;
  final String reason;
  final Map<String, dynamic> indicators;
}

class LearningReport {
  final String positionId;
  final String symbol;
  final bool success;
  final double pnl;
  final Map<String, String> multiTimeframe;
  final Map<String, dynamic> indicators;
  final List<String> news;
  final String learning;
}
```

---

## 📦 DEPENDENCIES (pubspec.yaml)

```yaml
dependencies:
  flutter:
    sdk: flutter
  
  # HTTP & API
  http: ^1.1.0
  dio: ^5.4.0
  
  # State Management
  provider: ^6.1.1
  get: ^4.6.6
  
  # Charts
  fl_chart: ^0.66.0
  syncfusion_flutter_charts: ^24.1.41
  
  # UI Components
  google_fonts: ^6.1.0
  flutter_svg: ^2.0.9
  shimmer: ^3.0.0
  
  # Storage
  shared_preferences: ^2.2.2
  hive: ^2.2.3
  hive_flutter: ^1.1.0
  
  # Utilities
  intl: ^0.19.0
  timeago: ^3.6.0
  url_launcher: ^6.2.2
  
  # WebView
  webview_flutter: ^4.4.4
  
  # Icons
  font_awesome_flutter: ^10.6.0
```

---

## 🏗️ PROJECT STRUCTURE

```
lib/
├── main.dart
├── app.dart
├── core/
│   ├── constants/
│   │   ├── colors.dart
│   │   ├── text_styles.dart
│   │   └── api_constants.dart
│   ├── utils/
│   │   ├── formatters.dart
│   │   └── validators.dart
│   └── theme/
│       └── app_theme.dart
├── data/
│   ├── models/
│   │   ├── balance.dart
│   │   ├── position.dart
│   │   ├── market_data.dart
│   │   ├── news_item.dart
│   │   ├── trading_signal.dart
│   │   └── learning_report.dart
│   ├── services/
│   │   ├── api_service.dart
│   │   ├── account_service.dart
│   │   ├── market_service.dart
│   │   ├── trading_service.dart
│   │   ├── news_service.dart
│   │   └── reports_service.dart
│   └── repositories/
│       ├── account_repository.dart
│       ├── market_repository.dart
│       └── trading_repository.dart
├── presentation/
│   ├── screens/
│   │   ├── dashboard/
│   │   │   ├── dashboard_screen.dart
│   │   │   └── widgets/
│   │   ├── positions/
│   │   │   ├── positions_screen.dart
│   │   │   └── widgets/
│   │   ├── charts/
│   │   │   ├── charts_screen.dart
│   │   │   └── widgets/
│   │   ├── news/
│   │   │   ├── news_screen.dart
│   │   │   └── widgets/
│   │   ├── account/
│   │   │   ├── account_screen.dart
│   │   │   └── widgets/
│   │   └── trade/
│   │       └── trade_modal.dart
│   ├── widgets/
│   │   ├── balance_card.dart
│   │   ├── position_card.dart
│   │   ├── signal_card.dart
│   │   └── loading_indicator.dart
│   └── providers/
│       ├── account_provider.dart
│       ├── market_provider.dart
│       └── trading_provider.dart
└── routes/
    └── app_routes.dart
```

---

## 🎯 KEY FEATURES TO IMPLEMENT

### 1. Real-time Price Updates
- WebSocket connection for live prices
- Auto-refresh every 5 seconds as fallback
- Smooth price animations

### 2. Paper Trading
- $10,000 initial balance
- Long/Short positions with leverage (1x-10x)
- Stop Loss / Take Profit
- Position management (close, edit)

### 3. Technical Analysis
- Multi-timeframe view (15m, 1h, 4h, 1d)
- RSI, MACD, Moving Averages
- Volume analysis
- Support/Resistance levels

### 4. AI Learning System
- Auto-generate reports on position close
- Store learning insights
- Query reports for AI improvement
- Track success patterns

### 5. News Integration
- Real-time crypto news
- Sentiment analysis
- Filter by coin/priority
- Impact on trading decisions

### 6. Offline Support
- Cache last known data
- Queue trades for when online
- Sync when connection restored

---

## 🚀 IMPLEMENTATION STEPS

### Phase 1: Setup (Day 1)
1. Create Flutter project in Android Studio
2. Add dependencies
3. Setup folder structure
4. Create theme and constants
5. Setup API service base

### Phase 2: Core Screens (Day 2-3)
1. Bottom navigation
2. Dashboard with balance card
3. Positions list screen
4. Account screen
5. Basic routing

### Phase 3: API Integration (Day 4)
1. Create all models
2. Implement API services
3. Setup providers
4. Connect screens to API
5. Error handling

### Phase 4: Trading Features (Day 5-6)
1. Trade modal (open position)
2. Position management
3. Real-time updates
4. Charts screen
5. Technical indicators

### Phase 5: News & Reports (Day 7)
1. News screen with filters
2. Learning reports view
3. Report details screen
4. Search and filters

### Phase 6: Polish (Day 8)
1. Loading states
2. Empty states
3. Error states
4. Animations
5. Testing

---

## 💡 ANDROID STUDIO PROMPT

**COPY THIS TO ANDROID STUDIO AI:**

```
Create a Flutter crypto trading app called "TradeBot AI" with the following:

DESIGN:
- Dark theme (primary: #0F172A, secondary: #1E293B, accent: #3B82F6)
- Bottom navigation with 5 tabs: Dashboard, Positions, Charts, News, Account
- Modern card-based UI with rounded corners and shadows

FEATURES:
1. Paper Trading with $10,000 USDT balance
2. Long/Short positions with leverage (1x-10x)
3. Real-time market data (BTC, ETH prices)
4. Technical analysis charts with RSI, MACD, Volume
5. Crypto news feed with sentiment analysis
6. AI learning reports for each closed position
7. Account stats: balance, P&L, win rate

API:
- Base URL: http://192.168.1.3:8000/api
- Endpoints: /account/balance, /account/paper/positions, /market/crypto/{symbol}, /bot/paper/open, /bot/paper/close, /news, /bot/paper/reports

SCREENS:
1. Dashboard: Balance card, market tickers, trading signals
2. Positions: List of open/closed positions with P&L
3. Charts: Candlestick chart with timeframes (15m, 1h, 4h, 1d)
4. News: Feed with sentiment tags (positive/negative/neutral)
5. Account: Stats, learning reports, settings

Use Provider for state management, http/dio for API calls, fl_chart for charts.
Include loading states, error handling, and pull-to-refresh.
```

---

## 📱 SCREEN MOCKUP DETAILS

### Dashboard Widgets Details:
```dart
// Balance Card
Container(
  padding: EdgeInsets.all(24),
  decoration: BoxDecoration(
    gradient: LinearGradient(
      colors: [Color(0xFF3B82F6), Color(0xFF2563EB)],
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
    ),
    borderRadius: BorderRadius.circular(16),
  ),
  child: Column(
    children: [
      Text("Saldo Disponível", style: caption),
      Text("\$10,000.00", style: heading1),
      Row(
        children: [
          Text("P&L: +\$250.00", style: bodyGreen),
          Text("(+2.5%)", style: captionGreen),
        ],
      ),
    ],
  ),
)
```

### Position Card Details:
```dart
Container(
  padding: EdgeInsets.all(16),
  decoration: BoxDecoration(
    color: Color(0xFF1E293B),
    borderRadius: BorderRadius.circular(12),
  ),
  child: Column(
    children: [
      Row(
        children: [
          Icon(Icons.arrow_upward, color: Colors.green),
          Text("LONG BTC/USDT", style: heading3),
          Spacer(),
          Text("+1.05%", style: bodyGreen),
        ],
      ),
      Divider(),
      Row(
        children: [
          Text("Entrada: \$42,800", style: caption),
          Spacer(),
          Text("Atual: \$43,250", style: body),
        ],
      ),
      Row(
        children: [
          Text("P&L: +\$225.00", style: bodyGreen),
          Spacer(),
          Text("5x Leverage", style: caption),
        ],
      ),
      SizedBox(height: 12),
      Row(
        children: [
          ElevatedButton("Fechar"),
          SizedBox(width: 8),
          OutlinedButton("Editar SL/TP"),
        ],
      ),
    ],
  ),
)
```

---

## 🎨 ANIMATIONS

- **Page transitions**: Slide from right
- **Card entrance**: Fade in + scale
- **Price changes**: Color pulse (green/red)
- **Loading**: Shimmer effect
- **Pull to refresh**: Custom indicator
- **Bottom sheet**: Slide up with backdrop

---

## ✅ CHECKLIST

**Must Have:**
- [x] Dark theme throughout
- [x] Bottom navigation (5 tabs)
- [x] Real-time price updates
- [x] Paper trading (open/close positions)
- [x] Position list with P&L
- [x] Account balance and stats
- [x] News feed
- [x] Learning reports

**Nice to Have:**
- [ ] Push notifications
- [ ] Biometric authentication
- [ ] Export trades to CSV
- [ ] Price alerts
- [ ] Watchlist
- [ ] Multiple themes

---

## 🔒 SECURITY NOTES

- Store API base URL in environment variables
- Use HTTPS in production
- Validate all inputs
- Handle API errors gracefully
- No sensitive data in logs
- Implement rate limiting on API calls

---

**END OF SPECIFICATION**

Use this document as the complete guide to build the TradeBot AI Flutter app in Android Studio. All design specifications, API endpoints, models, and UI layouts are detailed above. Copy the Android Studio prompt section directly into Gemini/AI assistant in Android Studio for automated code generation.
