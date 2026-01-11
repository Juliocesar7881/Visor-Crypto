# 📱 Visor Crypto v1.0 - Changelog

**Data do Build:** 08 de Janeiro de 2026  
**APK:** `Visor-Crypto-v1.0.apk` (3.33 MB)

---

## ✨ Novidades desta Versão

### 🎨 **1. Logo/Ícone Aumentado**
- Tamanho do logo no header aumentado de `38px` para `80px`
- Logo agora muito mais visível e impactante
- Mantém centralização e efeitos visuais

### 📊 **2. Gráficos em Tempo Real**
- **NOVO:** Atualização automática dos gráficos em tempo real
- Diferentes taxas de atualização baseadas no timeframe:
  - **1m**: atualiza a cada 5 segundos
  - **5m**: atualiza a cada 10 segundos
  - **30m**: atualiza a cada 30 segundos
  - **1h**: atualiza a cada 1 minuto
  - **4h/24h/7d**: atualiza a cada 5 minutos
  - **30d**: atualiza a cada 10 minutos

### ⏱️ **3. Novos Timeframes**
Adicionados 4 novos períodos de visualização:
- **1m** - 1 minuto (mais granular)
- **30m** - 30 minutos
- **7d** - 7 dias (tendência semanal)
- **30d** - 30 dias (tendência mensal)

**Timeframes disponíveis:**
`1m | 5m | 30m | 1h | 4h | 24h | 7d | 30d`

### 🔙 **4. Botão Voltar Corrigido**
- ✅ O app **NUNCA** fecha ao pressionar o botão voltar do Android
- ✅ Comportamento inteligente:
  - Fecha modais (gráficos, notícias, eventos)
  - Volta para seção anterior
  - Retorna para home se não houver histórico
  - Permanece na home se já estiver lá
- ✅ Funciona com gestos de swipe e botões físicos
- ✅ Implementado no `MainActivity.java` + JavaScript

### 📰 **5. Notícias Ampliadas**
- **ANTES:** Apenas 7 dias de histórico
- **AGORA:** 15 dias de histórico (2 semanas completas)
- Usuários podem ler notícias mais antigas

---

## 🔧 Arquivos Modificados

### 📄 Frontend (Web)
- `visor-crypto-apk/www/index.html` - Interface completa atualizada

### ☕ Backend (Android)
- `visor-crypto-apk/android/app/src/main/java/com/visorcrypto/app/MainActivity.java` - Handler do botão voltar

---

## 📦 Instalação

### No Celular:
1. Transfira o arquivo `Visor-Crypto-v1.0.apk` para seu celular
2. Habilite "Fontes Desconhecidas" nas configurações
3. Abra o APK e instale
4. Aproveite! 🚀

### Localização do APK:
```
c:\Users\Luchini\Downloads\App para pagar\Visor-Crypto-v1.0.apk
```

---

## 🛠️ Detalhes Técnicos

- **Plataforma:** Android
- **Framework:** Capacitor + Web Technologies
- **APIs:** Binance, CryptoPanic, CoinGecko
- **Build Tool:** Gradle 8.14.3
- **Java Version:** OpenJDK 21
- **APK Assinado:** ✅ Sim
- **APK Otimizado:** ✅ Zipalign 4-byte

---

## 🎯 Próximas Melhorias Sugeridas

- [ ] Notificações push para alertas de preço
- [ ] Favoritos/watchlist personalizada
- [ ] Modo escuro/claro
- [ ] Widget para tela inicial
- [ ] Compartilhamento de gráficos
- [ ] Sistema de alertas personalizados

---

**Desenvolvido com ❤️ para trading de criptomoedas**
