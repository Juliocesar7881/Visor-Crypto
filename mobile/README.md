# TradeBot AI Mobile (React Native + Expo)

## Estrutura

```
mobile/
  app/            - Rotas Expo Router (index.tsx - tela principal, _layout.tsx)
  components/     - Componentes reutilizáveis (AlertCard, Button)
  services/       - Integrações (api, notifications, biometric)
  store/          - Estado global (Zustand)
  app.json        - Configuração Expo
  package.json
```

## Setup

1. **Instalar dependências:**
   ```bash
   cd mobile
   npm install
   ```

2. **Configurar:**
   - Edite `services/api.ts` e substitua `http://localhost:8000/api` pelo IP do backend.
   - Edite `services/notifications.ts` e substitua `'your-expo-project-id'` pelo ID do seu projeto Expo.

3. **Executar:**
   ```bash
   npm start
   ```
   - Pressione `i` para iOS ou `a` para Android.
   - Use o app Expo Go em seu dispositivo físico (simuladores não suportam push completo).

## Funcionalidades

- **Autenticação Biométrica**: FaceID/TouchID na inicialização.
- **Controle do Bot**: Botão para Start/Stop do monitoramento.
- **Notificações Push**: Recebe alertas de trade em tempo real (High Priority).
- **Lista de Alertas**: Histórico cronológico dos sinais recebidos.
- **Armazenamento Seguro**: Token de dispositivo salvo com `expo-secure-store`.

## Assets necessários

Crie os seguintes arquivos na pasta `assets/` (ou use placeholders):
- `icon.png` (1024x1024)
- `splash.png` (2048x2048)
- `adaptive-icon.png` (Android, 1024x1024)
- `notification-icon.png` (Android, 96x96)

## Build para produção

```bash
npx eas-cli build --platform android
npx eas-cli build --platform ios
```

Consulte [Expo EAS Build](https://docs.expo.dev/build/introduction/) para mais detalhes.

## Próximos Passos

- Integrar gráficos (`react-native-wagmi-charts`)
- Adicionar tela de configuração de estratégias
- Implementar histórico de ordens executadas
