# 🚀 TradeBot AI - APIs Integradas e Funcionais

## ✅ Status Geral
**Backend:** ✅ Online (`http://localhost:8000`)  
**APIs Externas:** 
- **CoinGecko** ✅ Funcionando (Market data, Fear & Greed, Heatmap)
- **CryptoPanic** ⚠️ Mock data (API retorna 502, fallback ativo)
- **Binance WebSocket** ✅ Streaming de preços real-time

---

## 📊 MERCADO (CoinGecko API)

### 1. **Preços de Criptomoedas**
```http
GET /api/market/price?coins=bitcoin,ethereum,cardano
```
**Retorna:** Preço atual, market cap, volume 24h, variação 24h

**Exemplo de resposta:**
```json
{
  "bitcoin": {
    "usd": 88114,
    "usd_market_cap": 1760605702066,
    "usd_24h_vol": 77155750166,
    "usd_24h_change": 2.14
  }
}
```

---

### 2. **Top Moedas por Market Cap**
```http
GET /api/market/top?limit=100&vs_currency=usd
```
**Retorna:** Lista das principais criptomoedas ordenadas por capitalização

---

### 3. **Visão Geral do Mercado**
```http
GET /api/market/overview
```
**Retorna:**
```json
{
  "total_market_cap_usd": 3110880000000,
  "total_volume_usd": 77155750166,
  "market_cap_percentage": {
    "btc": 56.5,
    "eth": 12.3
  },
  "market_cap_change_percentage_24h_usd": 2.5
}
```

---

### 4. **Moedas em Alta (Trending)**
```http
GET /api/market/trending
```
**Retorna:** Top 7 moedas em tendência no CoinGecko

---

### 5. **Detalhes de uma Moeda**
```http
GET /api/market/coin/bitcoin
```
**Retorna:** Informações completas (preço, market cap, ATH, ATL, links, descrição)

---

### 6. **Heatmap do Mercado**
```http
GET /api/market/heatmap?limit=50
```
**Retorna:** Dados formatados para visualização em heatmap
```json
{
  "data": [
    {
      "name": "Bitcoin",
      "symbol": "BTC",
      "change_24h": 2.15,
      "market_cap": 1760605702066,
      "market_cap_rank": 1
    }
  ]
}
```

**Como usar no frontend:**
- **Verde** (>5%): Alta forte
- **Verde claro** (0-5%): Alta moderada
- **Laranja** (0 a -5%): Queda moderada
- **Vermelho** (<-5%): Queda forte

---

### 7. **Fear & Greed Index**
```http
GET /api/market/fear-greed
```
**Retorna:**
```json
{
  "value": 20,
  "classification": "Extreme Fear",
  "sentiment": "extreme_fear",
  "timestamp": "1764028800",
  "emoji": "😱"
}
```

**Escala:**
- **0-20:** Extreme Fear 😱 (Vermelho #ef4444)
- **21-40:** Fear 😨 (Laranja #f59e0b)
- **41-60:** Neutral 😐 (Amarelo #eab308)
- **61-80:** Greed 😊 (Verde claro #84cc16)
- **81-100:** Extreme Greed 🤑 (Verde #10b981)

---

### 8. **Relatório Completo do Mercado**
```http
GET /api/market/report
```
**Retorna:** Overview + Fear & Greed + Trending + Top Gainers + Top Losers

---

## 📰 NOTÍCIAS (CryptoPanic API)

⚠️ **Status:** API externa retornando erro 502. Sistema está usando **mock data** com 5 notícias realistas.

### Endpoints Disponíveis:
```http
GET /api/news/          # Últimas notícias
GET /api/news/rising    # Notícias em alta
GET /api/news/hot       # Notícias quentes
GET /api/news/bullish   # Notícias otimistas
GET /api/news/bearish   # Notícias pessimistas
GET /api/news/important # Notícias importantes
```

**Filtros disponíveis:**
- `?currencies=BTC,ETH` - Filtrar por moedas
- `?limit=20` - Limitar quantidade

**Exemplo de resposta:**
```json
{
  "count": 5,
  "results": [
    {
      "id": "1",
      "title": "Bitcoin supera $88k enquanto investidores institucionais aumentam posições",
      "url": "https://cryptopanic.com/news/bitcoin",
      "source": "CoinDesk",
      "published_at": "2025-01-25T10:30:00Z",
      "sentiment": "positive",
      "impact": "high",
      "currencies": ["BTC"]
    }
  ]
}
```

---

## 🤖 BOT DE TRADING

### 1. **Iniciar Bot**
```http
POST /api/bot/start
Content-Type: application/json

{
  "symbols": ["BTCUSDT", "ETHUSDT"],
  "strategy": "ema_crossover",
  "ema_short": 9,
  "ema_long": 21
}
```

---

### 2. **Parar Bot**
```http
POST /api/bot/stop
```

---

### 3. **Status do Bot**
```http
GET /api/bot/status
```
**Retorna:**
```json
{
  "running": true,
  "symbols": ["BTCUSDT", "ETHUSDT"],
  "strategy": "ema_crossover",
  "uptime": 3600,
  "signals_generated": 12
}
```

---

## 📈 SINAIS DE TRADING (EMA Strategy)

### 1. **Últimos Sinais**
```http
GET /api/signals/?limit=50
```

---

### 2. **Histórico de Sinais**
```http
GET /api/signals/history?start_date=2025-01-01&end_date=2025-01-25
```

**Exemplo de sinal:**
```json
{
  "id": "uuid",
  "symbol": "BTCUSDT",
  "type": "BUY",
  "price": 88114.50,
  "ema_short": 87980.23,
  "ema_long": 87850.11,
  "confidence": 85,
  "timestamp": "2025-01-25T10:30:00Z",
  "strategy": "ema_crossover"
}
```

---

## 📱 DISPOSITIVOS MÓVEIS

### 1. **Registrar Dispositivo**
```http
POST /api/devices/register
Content-Type: application/json

{
  "device_id": "abc123xyz",
  "platform": "android",
  "push_token": "ExponentPushToken[xxx]"
}
```

---

### 2. **Listar Dispositivos**
```http
GET /api/devices/list
```

---

## 🔑 CHAVES DE API CONFIGURADAS

```python
# backend/app/core/config.py
CRYPTOPANIC_API_KEY = "a9a68f7c2deb41fd426935995e3324df210bcba5"
COINGECKO_API_KEY = "CG-iDkKAPFHhbA3v3nKW3ph87SL"
```

---

## 🎨 MOBILE APP - Tabs Implementadas

### 1. **Bot** (`/`)
- Controle do bot (Start/Stop)
- Status em tempo real
- Configuração de estratégia EMA
- Lista de moedas monitoradas

### 2. **News** (`/news`)
- Feed de notícias com CryptoPanic
- Filtros: Rising, Hot, Bullish, Bearish
- Indicadores de sentimento
- Links para fontes originais

### 3. **Charts** (`/charts`)
- Gráficos de preços em tempo real
- Visualização de EMA 9 e EMA 21
- Indicadores de cruzamento (Buy/Sell)
- Múltiplos pares de trading

### 4. **Reports** (`/reports`) ✨ **NOVO!**
- **Fear & Greed Index** com emoji e barra visual
- **Market Overview** (Market Cap $3.11T, Volume, Dominâncias BTC/ETH)
- **Top 5 Gainers** (maiores altas 24h)
- **Top 5 Losers** (maiores quedas 24h)
- **Heatmap 20 moedas** com cores baseadas na variação

---

## 🧪 TESTES REALIZADOS

### ✅ Testado e Funcionando:
```bash
# Preço do Bitcoin
GET http://localhost:8000/api/market/price?coins=bitcoin
✅ $88,114 (+2.14% em 24h)

# Fear & Greed Index
GET http://localhost:8000/api/market/fear-greed
✅ Valor: 20 (Extreme Fear 😱)

# Heatmap
GET http://localhost:8000/api/market/heatmap?limit=10
✅ Top 10 moedas com variação 24h

# Relatório Completo
GET http://localhost:8000/api/market/report
✅ Overview + Trending + Gainers/Losers
```

---

## 📝 PRÓXIMOS PASSOS

### 🔜 Pendente:
1. **5ª Tab** - Adicionar tab de Configurações ou Whale Tracking
2. **Arkham Intelligence API** - Monitoramento de baleias (BlackRock, etc)
3. **Binance Trading API** - Execução automática de ordens
4. **Firebase** - Notificações push quando há sinais
5. **Autenticação** - Login e gestão de usuários

### 💡 Sugestões:
- **Dashboard Web** - Criar versão web do mobile app
- **Backtest** - Testar estratégias com dados históricos
- **Multi-estratégias** - RSI, MACD, Bollinger Bands
- **Portfolio Tracking** - Rastrear investimentos do usuário

---

## 🚀 Como Iniciar

### Backend:
```bash
cd backend
.\venv\Scripts\Activate.ps1
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Mobile:
```bash
cd mobile
npm start
# ou
npx expo start
```

---

## 📞 Suporte

**APIs Utilizadas:**
- [CoinGecko API Docs](https://www.coingecko.com/en/api/documentation)
- [CryptoPanic API Docs](https://cryptopanic.com/developers/api/)
- [Binance WebSocket Docs](https://binance-docs.github.io/apidocs/spot/en/#websocket-market-streams)

**Versões:**
- Python: 3.14
- FastAPI: Latest
- React Native: Expo 52
- Node.js: 18+
