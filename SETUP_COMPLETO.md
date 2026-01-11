# 🚀 TradeBot AI - Checklist para App 100% Funcional

## ✅ O que já está pronto (0% → 70%)

- ✅ Backend FastAPI completo e funcionando
- ✅ Frontend mobile simulator com design moderno
- ✅ Sistema de notificações (estrutura pronta)
- ✅ Integração de sinais de trading
- ✅ Controle Start/Stop do bot
- ✅ WebSocket de preços (estrutura)
- ✅ App React Native completo (código gerado)

---

## 🔑 O que você precisa para chegar a 100%

### 1️⃣ **APIs de Exchange (Exchanges de Cripto)**

#### Binance API
- **O que é**: Permite conectar com a Binance para ler preços e executar ordens
- **Como conseguir**:
  1. Acesse: https://www.binance.com/en/my/settings/api-management
  2. Crie uma API Key
  3. Guarde: `API Key` e `Secret Key`
  4. **Importante**: Ative apenas permissões de leitura para testes (não habilite trading real ainda)

- **Onde usar**:
  ```env
  # backend/.env
  BINANCE_API_KEY=sua_key_aqui
  BINANCE_API_SECRET=sua_secret_aqui
  ```

#### Alternativa: Bybit API
- Link: https://www.bybit.com/app/user/api-management
- Processo similar ao Binance

**Custo**: 🆓 Gratuito (mas precisa de conta verificada)

---

### 2️⃣ **Firebase Cloud Messaging (Notificações Push)**

- **O que é**: Serviço do Google para enviar notificações push para celulares
- **Como conseguir**:
  1. Acesse: https://console.firebase.google.com/
  2. Crie um novo projeto "TradeBot AI"
  3. Adicione um app Android e um app iOS
  4. Baixe o arquivo `serviceAccountKey.json` (Admin SDK)
  5. No projeto Firebase:
     - Vá em **Project Settings** → **Service Accounts**
     - Clique em "Generate new private key"

- **Onde usar**:
  ```env
  # backend/.env
  FCM_CREDENTIALS_PATH=/caminho/para/serviceAccountKey.json
  ```

- **No mobile**:
  ```typescript
  // mobile/services/notifications.ts (linha 18)
  projectId: 'seu-firebase-project-id', // trocar
  ```

**Custo**: 🆓 Gratuito até milhões de mensagens/mês

---

### 3️⃣ **Banco de Dados PostgreSQL (Opcional para MVP)**

- **O que é**: Banco de dados para salvar usuários, histórico de trades, tokens de dispositivos
- **Opções**:

#### Opção A: Local (para testes)
```bash
# Windows com Chocolatey
choco install postgresql

# Ou use Docker
docker run --name postgres-tradebot -e POSTGRES_PASSWORD=tradebot -p 5432:5432 -d postgres
```

#### Opção B: Cloud (recomendado para produção)
- **Supabase**: https://supabase.com (tem plano grátis, super fácil)
- **Railway**: https://railway.app (também tem free tier)
- **Neon**: https://neon.tech (PostgreSQL serverless grátis)

- **Onde usar**:
  ```env
  # backend/.env
  DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/tradebot
  ```

**Custo**: 
- 🆓 Grátis (local ou free tiers)
- 💰 $5-20/mês (produção pequena)

---

### 4️⃣ **Redis (Opcional mas recomendado)**

- **O que é**: Cache rápido para cotações em tempo real
- **Opções**:

#### Local:
```bash
# Windows
choco install redis-64

# Docker
docker run --name redis-tradebot -p 6379:6379 -d redis
```

#### Cloud:
- **Upstash**: https://upstash.com (Redis serverless grátis)
- **Redis Cloud**: https://redis.com/try-free/

- **Onde usar**:
  ```env
  # backend/.env
  REDIS_URL=redis://localhost:6379/0
  ```

**Custo**: 
- 🆓 Grátis (local ou Upstash free)
- 💰 $5-10/mês (produção)

---

### 5️⃣ **Inteligência de Notícias (Opcional - Feature Avançada)**

#### CryptoPanic API
- **Link**: https://cryptopanic.com/developers/api/
- **Free Tier**: 1000 requests/dia
- Retorna notícias agregadas de cripto

#### Twitter/X API
- **Link**: https://developer.twitter.com/
- **Custo**: $100/mês para API v2 (caro!)
- Alternativa: usar RSS feeds ou scrapers

#### OpenAI GPT-4 (para análise de sentimento)
- **Link**: https://platform.openai.com/api-keys
- **Custo**: ~$0.03 por 1K tokens (barato para análises pontuais)

- **Onde usar**:
  ```env
  # backend/.env
  OPENAI_API_KEY=sk-...
  CRYPTOPANIC_API_KEY=...
  ```

**Custo Total**: 💰 $10-20/mês (se usar tudo)

---

### 6️⃣ **n8n (Automação - Opcional)**

- **O que é**: Ferramenta de automação visual (alternativa ao Zapier)
- **Como usar**:
  1. Self-hosted: https://docs.n8n.io/hosting/
  2. Cloud: https://n8n.io/ ($20/mês)

- **Para que serve**: Conectar TradingView → Backend automaticamente

**Custo**: 
- 🆓 Grátis (self-hosted)
- 💰 $20/mês (cloud)

---

## 📱 Para Testar o App Mobile Real (React Native)

### No seu celular físico:

1. **Instale o Expo Go**:
   - Android: https://play.google.com/store/apps/details?id=host.exp.exponent
   - iOS: https://apps.apple.com/app/expo-go/id982107779

2. **Execute**:
   ```bash
   cd mobile
   npm start
   ```

3. **Escaneie o QR Code** que aparece no terminal com:
   - Android: App Expo Go
   - iOS: Câmera nativa

### Para build de produção (publicar na loja):

1. **Crie conta no Expo**:
   ```bash
   npm install -g eas-cli
   eas login
   ```

2. **Configure o projeto**:
   ```bash
   eas build:configure
   ```

3. **Build**:
   ```bash
   eas build --platform android
   eas build --platform ios
   ```

**Custo**: 
- 🆓 Grátis para desenvolvimento
- 💰 $29/mês (Expo EAS para builds ilimitados)

---

## 💰 Resumo de Custos

### Para MVP Funcional (testes):
```
✅ GRÁTIS:
- Backend (localhost)
- Firebase FCM
- Binance/Bybit API (testnet)
- PostgreSQL local
- Redis local
- Expo desenvolvimento

Total: $0/mês
```

### Para Produção Básica:
```
💰 PAGO:
- VPS (DigitalOcean): $6/mês
- PostgreSQL (Supabase free ou Railway): $0-5/mês
- Redis (Upstash free): $0/mês
- Firebase FCM: $0/mês (free tier é generoso)
- Domain (Namecheap): $10/ano

Total: ~$10-15/mês
```

### Para Produção Completa (com IA):
```
💰💰 PREMIUM:
- VPS maior: $12-20/mês
- Database: $10/mês
- OpenAI API: $10-50/mês (dependendo do uso)
- CryptoPanic API Pro: $15/mês
- n8n Cloud: $20/mês
- Expo EAS: $29/mês

Total: ~$100-150/mês
```

---

## 🎯 Prioridade de Implementação

### Fase 1 - MVP Local (AGORA):
1. ✅ Já funciona no simulador HTML
2. ⚠️ Testar no celular com Expo Go
3. ⚠️ Criar conta Firebase (push real)

### Fase 2 - Produção Básica (1-2 semanas):
1. Contratar VPS ($6/mês)
2. Deploy do backend
3. Configurar Binance API (testnet primeiro)
4. Banco PostgreSQL cloud
5. Build do app mobile

### Fase 3 - Features Avançadas (1 mês+):
1. Integrar notícias com IA
2. Gráficos avançados
3. Estratégias customizáveis
4. Histórico de performance
5. Painel web admin

---

## 📝 Próximos Passos IMEDIATOS

1. **Criar conta Firebase** (15 minutos):
   - https://console.firebase.google.com/
   - Baixar `serviceAccountKey.json`
   - Colocar em `backend/serviceAccountKey.json`

2. **Criar conta Binance Testnet** (10 minutos):
   - https://testnet.binance.vision/
   - Pegar API keys de teste (sem risco!)

3. **Testar app no celular** (5 minutos):
   ```bash
   cd mobile
   npm start
   # Escanear QR code no Expo Go
   ```

4. **Atualizar .env** com as chaves:
   ```env
   FCM_CREDENTIALS_PATH=./serviceAccountKey.json
   BINANCE_API_KEY=testnet_key
   BINANCE_API_SECRET=testnet_secret
   ```

---

## 🆘 Suporte e Recursos

- **Documentação Firebase**: https://firebase.google.com/docs/cloud-messaging
- **Binance API Docs**: https://binance-docs.github.io/apidocs/
- **Expo Docs**: https://docs.expo.dev/
- **FastAPI Docs**: https://fastapi.tiangolo.com/

---

**Quer começar agora?** Me diga qual parte você quer implementar primeiro e eu te ajudo passo a passo! 🚀
