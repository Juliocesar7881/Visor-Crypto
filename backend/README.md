# TradeBot AI Backend (Python/FastAPI)

## Estrutura

```
backend/
  app/
    core/       - Configurações (config.py)
    routes/     - Endpoints REST (devices, signals, bot)
    schemas/    - Modelos Pydantic (device, signal, bot)
    services/   - Lógica (notificações FCM, trading CCXT, estratégias)
    main.py     - Inicialização FastAPI
  requirements.txt
```

## Setup

1. **Criar ambiente virtual:**
   ```bash
   cd backend
   python -m venv venv
   venv\Scripts\activate  # Windows
   # ou: source venv/bin/activate  # Linux/Mac
   ```

2. **Instalar dependências:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Configurar variáveis de ambiente (`.env`):**
   ```env
   DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/tradebot
   REDIS_URL=redis://localhost:6379/0
   FCM_CREDENTIALS_PATH=path/to/firebase-adminsdk.json
   BINANCE_WS_ENDPOINT=wss://stream.binance.com:9443/ws/btcusdt@trade
   DEBUG=true
   ```

4. **Executar:**
   ```bash
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

5. **Testar:**
   - Documentação Swagger: http://localhost:8000/docs

## Endpoints principais

- `POST /api/devices/register` - Registra token de dispositivo para push
- `POST /api/signals/webhook` - Recebe sinais de TradingView/n8n (dispara push ou ordem)
- `POST /api/bot/state` - Liga/desliga monitoramento WebSocket de preços

## Produção

- PostgreSQL/Redis rodando (ou managed services)
- Firebase Admin SDK configurado com credenciais
- Deploy em VPS (AWS, DigitalOcean) com supervisor/systemd
- Nginx como reverse proxy com TLS
