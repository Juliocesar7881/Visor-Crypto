# 🔒 Segurança do App Visor Crypto

## Medidas de Segurança Implementadas

### 1. Headers de Segurança (Meta Tags)
- **Content-Security-Policy (CSP)**: Restringe de onde scripts, estilos e imagens podem ser carregados
- **X-Content-Type-Options**: Previne MIME type sniffing
- **X-Frame-Options**: Previne clickjacking (DENY)
- **X-XSS-Protection**: Ativa filtro XSS do navegador
- **Referrer-Policy**: Limita informações enviadas em referrer

### 2. Proteções JavaScript
- **Anti-Clickjacking**: Código que impede o app de ser carregado em iframe
- **Object.freeze**: Objetos de configuração são congelados para prevenir modificação
- **sanitizeHTML()**: Sanitiza todo conteúdo de APIs externas antes de inserir no DOM
- **isValidURL()**: Valida URLs antes de abrir links externos
- **openExternalLink()**: Abre links externos com `noopener,noreferrer`
- **rateLimiter**: Limita chamadas de API para prevenir abuse

### 3. Validação de Dados
- Todas as notícias são sanitizadas antes de exibição
- URLs de imagens são validadas antes de renderizar
- Conteúdo de APIs externas passa por sanitização

### 4. API Keys
- Token da CryptoPanic centralizado em `API_CONFIG`
- Em produção, recomenda-se usar um backend proxy

---

## 📱 Como Buildar para Dispositivos Móveis

### Opção 1: PWA (Progressive Web App) - RECOMENDADO
O app já está quase pronto para ser uma PWA. Precisa adicionar:

#### Passo 1: Criar arquivo manifest.json
Crie o arquivo `manifest.json` na mesma pasta do HTML:

```json
{
  "name": "Visor Crypto",
  "short_name": "VisorCrypto",
  "description": "Visualizador de criptomoedas em tempo real",
  "start_url": "/tradebot-mobile.html",
  "display": "standalone",
  "background_color": "#0d1117",
  "theme_color": "#58a6ff",
  "orientation": "portrait",
  "icons": [
    {
      "src": "icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

#### Passo 2: Criar Service Worker (sw.js)
```javascript
const CACHE_NAME = 'visor-crypto-v1';
const urlsToCache = [
  '/tradebot-mobile.html',
  '/manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});
```

#### Passo 3: Adicionar ao HTML (já parcialmente feito)
Adicione no `<head>`:
```html
<link rel="manifest" href="manifest.json">
```

Adicione antes de `</body>`:
```html
<script>
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}
</script>
```

#### Passo 4: Hospedar com HTTPS
- Use Vercel, Netlify, GitHub Pages, ou Firebase Hosting
- O PWA precisa de HTTPS para funcionar

#### Passo 5: Instalar no celular
- Acesse o site pelo navegador do celular
- No Chrome: Menu → "Adicionar à tela inicial"
- No Safari: Compartilhar → "Adicionar à Tela de Início"

---

### Opção 2: Capacitor (App Nativo)

#### Passo 1: Instalar Node.js
Download: https://nodejs.org/

#### Passo 2: Criar projeto
```bash
mkdir visor-crypto-app
cd visor-crypto-app
npm init -y
npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios
npx cap init "Visor Crypto" com.visorcrypto.app
```

#### Passo 3: Configurar
Crie pasta `www` e copie o HTML:
```bash
mkdir www
copy tradebot-mobile.html www/index.html
```

#### Passo 4: Adicionar plataformas
```bash
npx cap add android
npx cap add ios
```

#### Passo 5: Abrir no Android Studio/Xcode
```bash
npx cap open android
# ou
npx cap open ios
```

#### Passo 6: Build
- Android: Android Studio → Build → Generate Signed Bundle/APK
- iOS: Xcode → Product → Archive

---

### Opção 3: Cordova

#### Passo 1: Instalar
```bash
npm install -g cordova
```

#### Passo 2: Criar projeto
```bash
cordova create visor-crypto com.visorcrypto.app "Visor Crypto"
cd visor-crypto
```

#### Passo 3: Copiar HTML
```bash
copy ..\tradebot-mobile.html www\index.html
```

#### Passo 4: Adicionar plataformas
```bash
cordova platform add android
cordova platform add ios
```

#### Passo 5: Build
```bash
cordova build android
cordova build ios
```

---

## 🚀 Recomendação

**Para começar rapidamente**: Use PWA
- Não precisa de Android Studio ou Xcode
- Funciona em Android e iOS
- Pode ser instalado direto do navegador
- Atualizações automáticas

**Para publicar nas lojas**: Use Capacitor
- Gera APK para Google Play
- Gera IPA para App Store
- Mais controle sobre o app nativo

---

## ⚠️ Antes de Publicar

### Checklist de Segurança
- [ ] Mover API tokens para um backend proxy
- [ ] Usar HTTPS em todas as conexões
- [ ] Testar em múltiplos dispositivos
- [ ] Verificar se CSP não bloqueia funcionalidades
- [ ] Adicionar política de privacidade

### Para Google Play
- [ ] Conta de desenvolvedor ($25 única vez)
- [ ] Ícones em vários tamanhos
- [ ] Screenshots do app
- [ ] Descrição e categoria
- [ ] Classificação de conteúdo

### Para App Store
- [ ] Conta Apple Developer ($99/ano)
- [ ] App Review Guidelines compliance
- [ ] Ícones e screenshots
- [ ] Info.plist configurado
