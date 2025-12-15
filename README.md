# Visor Crypto - Alpha v0.1

📱 **Aplicativo de visualização de criptomoedas em tempo real**

## 🚀 Features Alpha

- ✅ Preços em tempo real via WebSocket (Binance)
- ✅ 19 criptomoedas principais (BTC, ETH, SOL, BNB, XRP, ADA, AVAX, DOGE, SHIB, PEPE, LINK, UNI, AAVE, DOT, LTC, ATOM, NEAR, RNDR, FET)
- ✅ Order Book ao vivo (atualiza a cada 2s)
- ✅ Médias Móveis (MA 7, 25, 99, 200) - atualiza a cada 10s
- ✅ Fear & Greed Index (atualiza a cada 60s)
- ✅ Volume 24h e Market Cap (atualiza a cada 5-30s)
- ✅ Notícias traduzidas para português (atualiza a cada 30s)
- ✅ Recomendações IA baseadas em sinais técnicos
- ✅ PWA (Progressive Web App) instalável
- ✅ APK Android pronto para uso

---

## 📁 Estrutura do Projeto

```
App para pagar/
├── TradeBotAI_MobileArchitecture.md  # Documentação técnica completa
├── backend/                          # API Python (FastAPI)
│   ├── app/
│   │   ├── core/                     # Configurações
│   │   ├── routes/                   # Endpoints (devices, signals, bot)
│   │   ├── schemas/                  # Modelos Pydantic
│   │   ├── services/                 # Lógica de negócio
│   │   └── main.py
│   ├── requirements.txt
│   ├── .env.example
│   └── README.md
└── mobile/                           # App React Native (Expo)
    ├── app/                          # Telas (Expo Router)
    ├── components/                   # Componentes UI
    ├── services/                     # API, Notificações, Biometria
    ├── store/                        # Estado global (Zustand)
    ├── app.json
    ├── package.json
    └── README.md
```

## 🚀 Quick Start

### Backend (Python/FastAPI)

1. **Instalar dependências:**
   ```bash
   cd backend
   python -m venv venv
   venv\Scripts\activate  # Windows
   pip install -r requirements.txt
   ```

2. **Configurar `.env`:**
   ```bash
   cp .env.example .env
   # Edite DATABASE_URL, REDIS_URL, FCM_CREDENTIALS_PATH
   ```

3. **Executar:**
   ```bash
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

4. **Acessar docs:** http://localhost:8000/docs

### Mobile (React Native/Expo)

1. **Instalar dependências:**
   ```bash
   cd mobile
   npm install
   ```

2. **Configurar:**
   - Edite `services/api.ts`: substitua `localhost:8000` pelo IP da sua máquina.
   - Edite `services/notifications.ts`: adicione seu `projectId` do Expo.

3. **Executar:**
   ```bash
   npm start
   ```
   - Pressione `i` (iOS) ou `a` (Android)
   - Use dispositivo físico para testar notificações push

## 🔑 Funcionalidades Principais

### Backend
- ✅ Registro de dispositivos (tokens FCM/Expo)
- ✅ Webhook para receber sinais de trading
- ✅ Push notifications (High Priority)
- ✅ Controle Start/Stop de monitoramento WebSocket
- ✅ Integração CCXT (stubs para ordens reais)
- ✅ Estratégias básicas (confiança threshold)

### Mobile
- ✅ Autenticação biométrica (FaceID/TouchID)
- ✅ Controle Start/Stop do bot
- ✅ Recepção de notificações push em tempo real
- ✅ Lista de alertas com histórico
- ✅ UI responsiva (modo escuro)
- ✅ Armazenamento seguro de tokens

## 🛠️ Tecnologias

| Camada | Stack |
|--------|-------|
| **Backend** | Python 3.11, FastAPI, CCXT, PostgreSQL, Redis, Firebase Admin SDK, WebSockets |
| **Mobile** | React Native (Expo), TypeScript, Expo Notifications, Local Auth, Secure Store, Zustand |
| **Infra** | AWS/DigitalOcean (VPS), Nginx, Firebase Cloud Messaging |

## 📖 Documentação Completa

Consulte [TradeBotAI_MobileArchitecture.md](./TradeBotAI_MobileArchitecture.md) para:
- Arquitetura detalhada
- Fluxos de dados
- Sistema de notificações
- Segurança mobile
- Roadmap de implementação

## 🔐 Segurança

- **Biometria**: Obrigatória para acessar carteira
- **SSL Pinning**: Proteção contra MITM (a implementar)
- **Secure Store**: Tokens salvos no chip de segurança
- **API Keys**: Nunca armazenadas no app (backend apenas)

## 📦 Deploy

### Backend (Produção)
```bash
# Ubuntu VPS
sudo apt install postgresql redis-server
pip install gunicorn
gunicorn app.main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
# Configure Nginx reverse proxy + Certbot SSL
```

### Mobile (Build)
```bash
npx eas-cli build --platform android
npx eas-cli build --platform ios
```

## 🧪 Testes

### Backend
```bash
pytest  # (quando testes forem adicionados)
```

### Mobile
```bash
npm test  # Jest + Detox (quando configurados)
```

## 🗺️ Próximos Passos

- [ ] Integrar banco de dados PostgreSQL real
- [ ] Adicionar autenticação JWT
- [ ] Implementar gráficos de preços (wagmi-charts)
- [ ] Conectar n8n para inteligência de notícias
- [ ] Adicionar testes unitários e E2E
- [ ] Deploy CI/CD (GitHub Actions)
- [ ] Monitoramento (Sentry, Grafana)

## 📄 Licença

Projeto educacional/demonstrativo. Ajuste conforme necessário para uso comercial.

## 🤝 Contribuindo

1. Fork o projeto
2. Crie uma branch (`git checkout -b feature/MinhaFeature`)
3. Commit suas mudanças (`git commit -m 'Adiciona MinhaFeature'`)
4. Push para a branch (`git push origin feature/MinhaFeature`)
5. Abra um Pull Request

---

**TradeBot AI** - Controle seu trading de qualquer lugar 📱⚡
