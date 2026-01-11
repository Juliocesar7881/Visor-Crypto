# 🚀 TradeBot AI - App REAL com Cruzamento de Médias

## ✅ O QUE ACABOU DE SER IMPLEMENTADO

### 1️⃣ **Estratégia de Cruzamento de Médias EMA (Real)**
- ✅ EMA 9 períodos (rápida)
- ✅ EMA 21 períodos (lenta)
- ✅ **Golden Cross**: Quando EMA9 cruza EMA21 de baixo para cima → **SINAL DE COMPRA**
- ✅ **Death Cross**: Quando EMA9 cruza EMA21 de cima para baixo → **SINAL DE VENDA**
- ✅ Cálculo de confiança baseado na diferença entre as médias

### 2️⃣ **Suporte a 10 Criptomoedas**
Moedas disponíveis:
1. BTC/USDT (Bitcoin)
2. ETH/USDT (Ethereum)
3. BNB/USDT (Binance Coin)
4. SOL/USDT (Solana)
5. XRP/USDT (Ripple)
6. ADA/USDT (Cardano)
7. DOGE/USDT (Dogecoin)
8. MATIC/USDT (Polygon)
9. DOT/USDT (Polkadot)
10. LTC/USDT (Litecoin)

### 3️⃣ **WebSocket Real da Binance**
- ✅ Conexão direta com `wss://stream.binance.com:9443`
- ✅ Recebe preços em tempo real (todos os trades)
- ✅ Monitora múltiplas moedas simultaneamente
- ✅ Reconexão automática se cair

### 4️⃣ **Sistema de Detecção Automática**
- ✅ Analisa TODOS os preços recebidos
- ✅ Calcula EMAs automaticamente
- ✅ Detecta cruzamentos em tempo real
- ✅ Envia notificação push quando detecta sinal

### 5️⃣ **App Mobile React Native Funcional**
- ✅ Botão Start/Stop conectado ao backend real
- ✅ Seletor de moedas (escolha quais monitorar)
- ✅ Recebe alertas push reais
- ✅ Lista de sinais detectados

---

## 🎯 COMO FUNCIONA AGORA

### Fluxo Completo:

```
1. Binance → WebSocket → Backend recebe preços em tempo real
                              ↓
2. Backend calcula EMA 9 e EMA 21 para cada moeda
                              ↓
3. Detecta cruzamento → Gera sinal (BUY/SELL)
                              ↓
4. Envia notificação push via Firebase → Celular do usuário
                              ↓
5. App mobile mostra alerta na lista
```

---

## 🚀 TESTAR AGORA (Backend Real)

### 1. Reiniciar o backend:
```bash
cd backend
# Pressione Ctrl+C no terminal do uvicorn
& "C:/Users/Luchini/Downloads/App para pagar/backend/venv/Scripts/python.exe" -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 2. Iniciar o bot:
```bash
# Via API ou app mobile
POST http://localhost:8000/api/bot/state
{
  "desired_state": "start"
}
```

### 3. Ver os sinais sendo detectados:
```bash
# No terminal do backend você verá:
🎯 Sinal detectado: BUY BTCUSDT (confiança: 75%)
📨 Notificação enviada: BUY BTCUSDT
```

---

## 📱 TESTAR NO CELULAR (App Real)

### 1. Instalar Expo Go:
- Android: https://play.google.com/store/apps/details?id=host.exp.exponent
- iOS: https://apps.apple.com/app/expo-go/id982107779

### 2. Executar o app:
```bash
cd mobile
npm install  # se ainda não instalou
npm start
```

### 3. Escanear QR Code:
- Android: Abrir Expo Go e escanear
- iOS: Abrir câmera e escanear

### 4. Usar o app:
1. Clique em "⚙️ Moedas (10/10)"
2. Escolha quais moedas monitorar (desmarque as que não quer)
3. Clique em "Salvar"
4. Clique em "Iniciar Bot"
5. **Aguarde os sinais chegarem!** (podem levar minutos ou horas dependendo do mercado)

---

## 🧪 FORÇAR UM SINAL DE TESTE

Se quiser ver funcionando sem esperar o mercado:

```bash
# Enviar sinal manual via API
POST http://localhost:8000/api/signals/webhook
{
  "source": "manual",
  "symbol": "BTCUSDT",
  "action": "BUY",
  "confidence": 0.85,
  "strategy": "ema_9_21",
  "mode": "notification"
}
```

---

## 📊 NOVOS ENDPOINTS DISPONÍVEIS

### GET /api/bot/status
Retorna status do bot:
```json
{
  "running": true,
  "symbols": ["BTCUSDT", "ETHUSDT"],
  "strategy": "EMA Crossover (9/21)",
  "detectors_active": 2
}
```

### GET /api/bot/symbols
Lista moedas disponíveis e monitoradas:
```json
{
  "available": ["BTCUSDT", "ETHUSDT", ...],
  "currently_monitoring": ["BTCUSDT", "ETHUSDT"]
}
```

### POST /api/bot/symbols
Atualiza moedas monitoradas:
```json
["BTCUSDT", "ETHUSDT", "SOLUSDT"]
```

---

## 🔥 DIFERENÇA DO SIMULADOR vs APP REAL

### ANTES (Simulador HTML):
- ❌ Preços simulados/falsos
- ❌ Sinais manuais (você clica no botão)
- ❌ Não conecta na Binance
- ✅ Bom para ver o design

### AGORA (App Real):
- ✅ Preços reais da Binance via WebSocket
- ✅ Sinais automáticos (detecta cruzamentos sozinho)
- ✅ Conecta na Binance real
- ✅ Calcula EMAs de verdade
- ✅ Funciona no celular real

---

## 💡 O QUE AINDA FALTA PARA 100%

### Para funcionar completamente:

1. **Firebase** (Notificações Push):
   - Crie projeto: https://console.firebase.google.com/
   - Baixe `serviceAccountKey.json`
   - Coloque em `backend/serviceAccountKey.json`
   - Atualize no `mobile/services/notifications.ts` o `projectId`

2. **Testar em dispositivo físico**:
   - Emulador não suporta push notifications completo
   - Use Expo Go no seu celular

3. **Ajustar IP do backend no mobile**:
   ```typescript
   // mobile/services/api.ts (linha 6)
   const API_BASE_URL = 'http://SEU_IP_LOCAL:8000/api';
   // Exemplo: 'http://192.168.1.100:8000/api'
   ```

4. **Deploy em VPS (Produção)**:
   - Para funcionar 24/7 mesmo com celular desligado
   - DigitalOcean/AWS ~$6/mês

---

## 🎓 ENTENDENDO A ESTRATÉGIA EMA

### O que é EMA (Exponential Moving Average)?
- Média móvel que dá mais peso aos preços recentes
- EMA 9 = média dos últimos 9 períodos
- EMA 21 = média dos últimos 21 períodos

### Por que cruzamento funciona?
- **Golden Cross**: Indica momento de alta (preço subindo forte)
- **Death Cross**: Indica momento de baixa (preço caindo forte)
- É uma das estratégias mais usadas em trading

### Exemplo real:
```
BTC está a $40,000
EMA9 = $39,500 (sobe rápido)
EMA21 = $39,000 (sobe devagar)

↓ Preço sobe para $41,000

EMA9 = $40,500 (cruza acima)
EMA21 = $39,500
→ GOLDEN CROSS! Sinal de COMPRA 🚀
```

---

## 🐛 TROUBLESHOOTING

### "Stream caiu, reconectando..."
- Normal! Binance pode fechar conexão periodicamente
- O bot reconecta automaticamente em 5s

### "websockets não instalado!"
```bash
cd backend
pip install websockets
```

### App mobile não conecta
1. Verifique se backend está rodando: http://localhost:8000
2. Atualize IP em `mobile/services/api.ts` para IP da rede local
3. Certifique-se que celular está na mesma rede WiFi

### Nenhum sinal está sendo detectado
- É normal! Cruzamentos não acontecem toda hora
- Mercado precisa estar volátil
- Pode levar minutos, horas ou até dias dependendo da moeda
- Use o endpoint manual para testar: `POST /api/signals/webhook`

---

## 📈 PRÓXIMOS UPGRADES POSSÍVEIS

1. **Stop Loss / Take Profit automático**
2. **Backtesting** (testar estratégia em dados históricos)
3. **Múltiplas estratégias** (RSI, MACD, Bollinger Bands)
4. **Execução automática** (compra/venda real na exchange)
5. **Dashboard web** com gráficos
6. **Modo paper trading** (simulação sem dinheiro real)

---

**Agora é o APP REAL funcionando! 🚀**

Quer testar? Execute o backend e veja os logs mostrando os preços sendo processados!
