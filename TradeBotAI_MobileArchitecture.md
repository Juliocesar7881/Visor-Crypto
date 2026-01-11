# TradeBot AI – Documentação Técnica (Arquitetura Mobile)

## 1. Visão do Produto (Mobile First)
- **Objetivo**: Aplicativo nativo iOS/Android para gerir e automatizar operações de criptomoedas com controle total via smartphone.
- **Experiência**: Usuário inicia/pausa o robô, ajusta estratégias e recebe alertas críticos via notificações push sem deixar o app aberto.
- **Processamento**: Toda a carga computacional roda na nuvem; o bot permanece ativo 24/7 mesmo se o dispositivo estiver offline. A bateria do usuário não é afetada por execuções contínuas.
- **Disponibilidade**: Infra em múltiplas zonas; uso de WebSockets persistentes e filas garante resiliência a quedas temporárias.

## 2. Arquitetura Geral (Client-Server)
- **Camadas**:
  - **App Mobile (Cliente)**: Interface React Native (Expo) com acesso a push, biometria, gráficos e armazenamento seguro.
  - **Servidor Cloud (Motor)**: FastAPI + workers Python executando estratégias, conectados às exchanges e ao serviço de notificações.
- **Fluxo em tempo real**:
  1. Servidor mantém WebSockets com Binance/Bybit (e canais de notícias n8n).
  2. Estratégias detectam sinais (ex.: cruzamento de médias, rompimento de volatilidade).
  3. Dependendo do modo configurado pelo usuário:
     - **Modo Auto**: Ordem enviada imediatamente para a exchange via REST (CCXT).
     - **Modo Notificação**: Evento publicado no Firebase Cloud Messaging (FCM).
  4. FCM desperta o app, mostra push com som/vibração e direciona o usuário para a tela de ação.
- **Observability**: Logs estruturados (JSON) enviados ao CloudWatch/ELK; métricas em Prometheus (latência de sinal → notificação, taxa de sucesso de ordens, erros de WebSocket).

## 3. Stack Tecnológico Mobile (Produção)
### 3.1 Aplicativo (Frontend)
| Camada | Tecnologia | Observações |
|--------|------------|-------------|
| Framework | React Native + Expo Managed Workflow | Atualizações OTA, build única para iOS/Android.
| Navegação | React Navigation (stack + modal) | Deep links para abrir alertas específicos.
| Notificações | `expo-notifications` ou `@react-native-firebase/messaging` | Suporte a canais/importance Android, categorias iOS.
| Biometria | `expo-local-authentication` | Desbloqueia dados sensíveis e aprova start/stop.
| Storage Seguro | `expo-secure-store` | Tokens, refresh tokens e preferências criptografadas no Secure Enclave/KeyStore.
| Charts | `react-native-wagmi-charts` | Candles, depth e indicadores com gestos nativos.
| Estado | Zustand ou Recoil | Mantém preferências offline, sincroniza com backend via REST/WebSocket.
| Qualidade | TypeScript + Jest + Detox | Cobertura de lógica e flows críticos (login, push).

### 3.2 Backend (Cérebro na Nuvem)
- **Linguagem/Framework**: Python 3.11 + FastAPI (async) servindo REST/WebSocket.
- **Trading Engine**: CCXT para ordens spot/futuros em Binance/Bybit; workers em Celery/RQ para execução isolada.
- **Dados**:
  - PostgreSQL para usuários, estratégias, auditoria de ordens e tokens FCM.
  - Redis para cache de preços, throttling de notificações e filas leves.
- **Push Layer**: Firebase Admin SDK (HTTP v1) assíncrono; suporta tópicos por moeda, testes A/B e prioridade custom.
- **Infra**: Ubuntu em AWS EC2 ou DigitalOcean Droplets com autoscaling horizontal; Nginx ingress + Certbot para TLS.

## 4. Sistema de Notificações Nativas
### 4.1 Tipos de Notificação
| Tipo | Gatilho | Comportamento | Payload sugerido |
|------|---------|---------------|------------------|
| **Alerta Crítico (High Priority)** | Confirmação de sinal ou Stop Loss | Som, vibração, tela liga, botão de ação rápido | `{ "type": "TRADE_ALERT", "coin": "BTC", "action": "BUY", "confidence": 0.82 }`
| **Alerta Informativo (Silent)** | Notícias com impacto médio, atualização de estratégia | Entrega silenciosa para bandeja; badge opcional | `{ "type": "INFO", "topic": "NEWS", "severity": "MEDIUM" }`
| **Background Fetch** | Atualizar widget/tiles | Task em background a cada ~15 min (limitações iOS/Android) | Sem UI; apenas refresh local.

### 4.2 Fluxo de Registro de Push
1. App solicita permissão (`expo-notifications` → `requestPermissionsAsync`).
2. Se aprovado, gera `ExpoPushToken` ou `FCM Device Token`.
3. App envia token + metadados (plataforma, idioma, versão) ao endpoint `/devices/register` (FastAPI) autenticado.
4. Backend persiste: `UPDATE users SET fcm_token = $1, device_meta = $2 WHERE id = $3`.
5. Workers validam tokens periodicamente; tokens inválidos são removidos após erro 404/410 do FCM.

### 4.3 Resiliência
- Retries exponenciais (máx. 3) em falha do FCM.
- Dead-letter queue em Redis para inspeção manual.
- Métrica chave: tempo de ponta-a-ponta (detecção → push) < 800 ms.

## 5. Integrações Externas
### 5.1 Exchanges (Dados e Execução)
- **WebSockets**: `wss://stream.binance.com:9443/ws/btcusdt@trade` e equivalentes Bybit para preços/ordens em tempo real.
- **REST**: `POST /api/v3/order` (Binance) para ordens; `GET /fapi/v1/account` para saldo.
- **Segurança**:
  - Keys do usuário enviadas uma única vez, cifradas (AES-256) e guardadas no backend; app não mantém as chaves long term.
  - HMAC SHA256 exigido em cada chamada REST.

### 5.2 Pipeline de Notícias (n8n + IA)
- **Fontes**: CryptoPanic API, Twitter API (stream filtrado por moedas top 20).
- **Orquestração**: n8n agrega, deduplica e classifica urgência.
- **Processador IA**: OpenAI GPT-4o avalia sentimento/impacto; responde com `impact_score` (0-1) e resumo acionável.
- **Entrega**: Eventos de impacto alto publicam mensagem no backend → push em lote para usuários inscritos na moeda.

## 6. Segurança Mobile
- **Autenticação**: FaceID/TouchID obrigatório para revelar carteira e iniciar/parar bot.
- **SSL Pinning**: Certificado público embutido e verificado em cada request (via `react-native-ssl-pinning`).
- **Proteção de Tela**: Ativar `expo-screen-capture` para esconder conteúdo em multitarefa/prints; usar splash estático.
- **Session Handling**: Refresh tokens rotativos, revogados ao deslogar ou em detecção de device jailbreak/root.
- **Compliance**: OWASP MASVS L1/L2 checklist automatizada em CI (MobSF).

## 7. Roadmap de Implementação
1. **Backend MVP**
   - Webhook FastAPI recebe sinais do TradingView/n8n.
   - Dispara notificações FCM (High Priority) com mock de ordens.
2. **Mobile MVP**
   - Login + cadastro de dispositivo.
   - Listener de push mostrando lista cronológica de alertas.
3. **Trading Real**
   - Integração CCXT com execuções reais/testnet.
   - Painel de status das ordens e sincronização com exchange.
4. **Refinamento**
   - Gráficos nativos, widgets, modo escuro, IA de notícias integrada.
   - Recursos premium: limites avançados, trailing stop, alertas condicionais.
5. **Operação**
   - Monitoramento (Grafana), alertas on-call, testes Chaos para WebSockets.

## 8. Considerações de Deploy e QA
- **CI/CD**: Expo EAS para builds OTA; GitHub Actions para backend (lint, testes, deploy blue/green).
- **Testes**:
  - Unitários (pytest, Jest) cobrindo estratégias e parsing de payloads.
  - Integração (contract tests fastapi ↔ mobile mocks).
  - End-to-end (Detox + sandbox Binance testnet).
- **Observabilidade Mobile**: Sentry para crashes, Firebase Analytics para funil (recebeu push → abriu → executou ação).

## 9. Próximos Passos
- Validar limites de taxa das APIs Binance/Bybit para volume esperado.
- Definir SLAs internos (MTTR push, disponibilidade do motor) e runbooks de incidentes.
- Formalizar modelo de permissão granular (quem pode acionar modo auto vs. notificação).