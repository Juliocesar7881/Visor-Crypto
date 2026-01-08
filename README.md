# 📱 Visor Crypto (APP)

<div align="center">
  <img src="www/Icone.png" alt="Visor Crypto Logo" width="120" height="120">
  
  ### Visualizador de Criptomoedas em Tempo Real
  
  [![Android](https://img.shields.io/badge/Android-3DDC84?style=for-the-badge&logo=android&logoColor=white)](https://www.android.com/)
  [![Capacitor](https://img.shields.io/badge/Capacitor-119EFF?style=for-the-badge&logo=Capacitor&logoColor=white)](https://capacitorjs.com/)
  [![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
</div>

---

## 🚀 Sobre o Projeto

**Visor Crypto** é um aplicativo Android nativo para visualização e análise de criptomoedas em tempo real. Com interface moderna e intuitiva, oferece gráficos detalhados, notícias atualizadas e análises de mercado.

### ✨ Funcionalidades Principais

- 📊 **Gráficos em Tempo Real**: Visualize preços com atualização automática
- 📈 **Múltiplos Timeframes**: 1m, 5m, 30m, 1h, 4h, 24h, 7d, 30d
- 🕯️ **Candlestick Charts**: Gráficos de velas para análise técnica
- 📰 **Notícias Cripto**: Últimas notícias dos últimos 15 dias
- 🧠 **IA Market Advisor**: Recomendações baseadas em análise de mercado
- 🌍 **Dados Macroeconômicos**: S&P 500, DXY, VIX, Ouro
- 📊 **Fear & Greed Index**: Índice de sentimento do mercado
- 🔄 **Atualização Automática**: Preços e gráficos atualizados constantemente

---

## 🎯 Versão Atual: v1.0

### 📋 Changelog

#### ✅ Novidades v1.0
- 🎨 Logo aumentado e mais visível (80px)
- ⚡ Gráficos com atualização em tempo real
- ⏱️ 4 novos timeframes: 1m, 30m, 7d, 30d
- 🔙 Botão voltar do Android corrigido (nunca fecha o app)
- 📰 Notícias ampliadas para 15 dias de histórico

---

## 🛠️ Tecnologias Utilizadas

### Frontend
- **HTML5 + CSS3 + JavaScript**: Interface web moderna
- **Canvas API**: Renderização de gráficos customizados
- **Fetch API**: Comunicação com APIs REST

### Mobile
- **Capacitor**: Framework híbrido para Android
- **Android SDK**: Build nativo para Android
- **Gradle**: Sistema de build

### APIs Integradas
- **Binance API**: Preços e dados de mercado
- **CryptoPanic API**: Notícias de criptomoedas
- **CoinGecko API**: Dados complementares
- **Yahoo Finance**: Dados macroeconômicos

---

## 📦 Instalação

### Pré-requisitos
- Node.js 16+ e npm
- Android Studio
- JDK 11 ou superior
- Capacitor CLI

### Clone o Repositório
```bash
git clone https://github.com/SEU_USUARIO/visor-crypto-app.git
cd visor-crypto-app
```

### Instale as Dependências
```bash
npm install
```

### Sincronize com Android
```bash
npx cap sync android
```

### Build do APK
```bash
cd android
./gradlew assembleRelease
```

O APK será gerado em: `android/app/build/outputs/apk/release/`

---

## 📱 Download do APK

O APK pronto para instalação está disponível na pasta raiz do projeto:
- **Arquivo**: `Visor-Crypto-v1.0.apk`
- **Tamanho**: 3.33 MB
- **Compatibilidade**: Android 5.0+

### Como Instalar
1. Transfira o APK para seu celular
2. Habilite "Fontes Desconhecidas" nas configurações
3. Abra o APK e instale
4. Aproveite! 🚀

---

## 🎨 Screenshots

| Home | Gráficos | Notícias |
|------|----------|----------|
| ![Home](docs/screenshots/home.png) | ![Charts](docs/screenshots/charts.png) | ![News](docs/screenshots/news.png) |

---

## 📂 Estrutura do Projeto

```
visor-crypto-apk/
├── www/                      # Frontend web
│   ├── index.html           # Aplicação principal
│   ├── Icone.png            # Logo do app
│   ├── manifest.json        # PWA manifest
│   └── sw.js                # Service Worker
├── android/                  # Projeto Android nativo
│   ├── app/                 # Código do app
│   └── build.gradle         # Configuração Gradle
├── capacitor.config.json    # Configuração Capacitor
└── package.json             # Dependências Node.js
```

---

## 🔧 Desenvolvimento

### Modo de Desenvolvimento
```bash
# Executar servidor de desenvolvimento
npx cap run android
```

### Build de Produção
```bash
# Sincronizar código
npx cap sync android

# Compilar APK de release
cd android
./gradlew assembleRelease
```

### Assinar APK
```bash
# Gerar keystore (apenas uma vez)
keytool -genkey -v -keystore app.keystore -alias app -keyalg RSA -keysize 2048 -validity 10000

# Assinar APK
jarsigner -verbose -sigalg SHA256withRSA -digestalg SHA-256 -keystore app.keystore app-release-unsigned.apk app

# Otimizar com zipalign
zipalign -v 4 app-release-unsigned.apk app-release.apk
```

---

## 🌐 APIs e Limites

| API | Uso | Limite |
|-----|-----|--------|
| Binance | Preços e gráficos | 1200 req/min |
| CryptoPanic | Notícias | Gratuito |
| CoinGecko | Dados gerais | 50 req/min |
| Yahoo Finance | Macro | Sem limite |

---

## 🤝 Contribuindo

Contribuições são bem-vindas! Sinta-se à vontade para:

1. Fazer fork do projeto
2. Criar uma branch para sua feature (`git checkout -b feature/MinhaFeature`)
3. Commit suas mudanças (`git commit -m 'Adiciona MinhaFeature'`)
4. Push para a branch (`git push origin feature/MinhaFeature`)
5. Abrir um Pull Request

---

## 📝 Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

---

## 👤 Autor

Desenvolvido com ❤️ para a comunidade crypto

---

## 🎯 Roadmap

- [ ] Modo escuro/claro
- [ ] Notificações push para alertas
- [ ] Favoritos/watchlist personalizada
- [ ] Widget para tela inicial
- [ ] Sistema de alertas personalizados
- [ ] Compartilhamento de gráficos
- [ ] Suporte para mais exchanges
- [ ] Análise técnica avançada

---

## 📞 Suporte

Se você encontrar algum problema ou tiver sugestões, por favor:
- Abra uma [Issue](https://github.com/SEU_USUARIO/visor-crypto-app/issues)
- Entre em contato através das discussões

---

<div align="center">
  
  **⭐ Se este projeto te ajudou, considere dar uma estrela! ⭐**
  
  Made with 💙 for crypto traders
  
</div>
