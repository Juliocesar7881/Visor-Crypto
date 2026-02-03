# 🚀 Guia de Configuração: MACRO API para Visor Crypto

## 📋 Resumo do que foi criado

### 1. `macro-api/` - Nova API de dados macroeconômicos
```
macro-api/
├── .github/
│   └── workflows/
│       └── update-macro.yml   # GitHub Actions para atualização automática
├── data/
│   └── macro-data.json        # Dados gerados (atualizado automaticamente)
├── fetch-macro-data.js        # Script principal de coleta
├── package.json
└── README.md
```

### 2. Arquivos modificados no App
- `www/macro-section.js` - Novo módulo JavaScript para a seção MACRO
- `www/index.html` - Adicionado import do macro-section.js
- `visor-crypto-apk/www/macro-section.js` - Cópia para o APK
- `visor-crypto-apk/www/index.html` - Adicionado import do macro-section.js

---

## 🔧 Passo a Passo para Publicar

### Passo 1: Criar repositório macro-api no GitHub

1. Vá em https://github.com/new
2. Nome do repositório: `macro-api`
3. Marque "Public" (necessário para GitHub Pages gratuito)
4. Clique em "Create repository"

### Passo 2: Fazer upload da pasta macro-api

**Opção A - Via Git:**
```bash
cd "c:\Users\Luchini\Downloads\App para pagar\macro-api"
git init
git add .
git commit -m "Initial commit - Macro API"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/macro-api.git
git push -u origin main
```

**Opção B - Via Upload no GitHub:**
1. No repositório criado, clique em "uploading an existing file"
2. Arraste toda a pasta `macro-api`
3. Clique em "Commit changes"

### Passo 3: Configurar GitHub Pages

1. No repositório, vá em **Settings** > **Pages**
2. Em "Source", selecione:
   - **Deploy from a branch**
   - Branch: **main**
   - Folder: **/ (root)**
3. Clique em **Save**
4. Aguarde alguns minutos para o deploy

### Passo 4: Configurar Secrets (Opcional, melhora os dados)

1. Vá em **Settings** > **Secrets and variables** > **Actions**
2. Clique em **New repository secret**
3. Adicione:
   - `FRED_API_KEY`: Crie em https://fred.stlouisfed.org/docs/api/api_key.html (gratuito)
   - `FMP_API_KEY`: Já está configurado, mas pode criar o seu em https://financialmodelingprep.com/developer/docs/

### Passo 5: Ativar GitHub Actions

1. Vá em **Actions**
2. Se aparecer aviso, clique em "I understand my workflows, go ahead and enable them"
3. Clique no workflow "Update Macro Data"
4. Clique em "Run workflow" > "Run workflow"
5. Aguarde a execução (1-2 minutos)

### Passo 6: Verificar o endpoint

Acesse:
```
https://juliocesar7881.github.io/macro-api/data/macro-data.json
```

Se aparecer o JSON, está funcionando!

### Passo 7: ✅ JÁ CONFIGURADO!

O arquivo `www/macro-section.js` já foi atualizado com sua URL:

```javascript
const MACRO_API_URL = localStorage.getItem('macro_api_url') || 
    'https://juliocesar7881.github.io/macro-api/data/macro-data.json';
```

---

## 📊 O que a API fornece

| Dado | Fonte | Atualização |
|------|-------|-------------|
| Taxa de Juros Fed | FRED / Fallback | A cada 30 min |
| Probabilidades Fed | Polymarket / Estimativa | A cada 30 min |
| Calendário Econômico | FMP / FOMC | A cada 30 min |
| S&P 500 | Yahoo Finance | A cada 30 min |
| DXY (Dólar) | Yahoo Finance | A cada 30 min |
| VIX | Yahoo Finance | A cada 30 min |
| Ouro | Yahoo Finance | A cada 30 min |
| Petróleo | Yahoo Finance | A cada 30 min |
| Treasury 10Y | Yahoo Finance | A cada 30 min |

---

## 🔄 Frequência de Atualização

| Período | Frequência |
|---------|------------|
| Segunda a Sexta (9h-22h BRT) | A cada 30 minutos |
| Finais de Semana | A cada 2 horas |

---

## 🎯 Escalabilidade

**Por que essa arquitetura escala infinitamente?**

1. **GitHub Actions** coleta os dados das APIs (com rate limit apenas aqui)
2. **JSON estático** é salvo no repositório
3. **GitHub Pages CDN** serve o JSON para todos os usuários
4. **Cada usuário** faz apenas 1 requisição a cada 5+ minutos
5. **Sem limite de usuários** - GitHub Pages aguenta milhões de requests

---

## 🐛 Troubleshooting

### "Dados de demonstração" aparece no app
- Verifique se a URL da API está correta em `macro-section.js`
- Verifique se o GitHub Pages está ativo
- Limpe o cache do navegador/app

### GitHub Actions não executa
- Vá em Settings > Actions > General
- Em "Workflow permissions", marque "Read and write permissions"
- Salve e execute novamente

### Dados não atualizam
- Verifique o log do GitHub Actions em Actions > último workflow
- Pode haver erro de API key ou conexão

---

## 📝 Personalização

### Mudar frequência de atualização
Edite `.github/workflows/update-macro.yml`:
```yaml
schedule:
  - cron: '*/15 * * * *'  # A cada 15 minutos
```

### Adicionar mais indicadores
Edite `fetch-macro-data.js`, na seção `fetchMarketIndicators()`:
```javascript
const symbols = [
    // Adicione novos símbolos aqui
    { symbol: 'AAPL', name: 'Apple', desc: 'Tech Stock', icon: 'apple', iconClass: 'fab fa-apple' },
];
```

---

## ✅ Pronto!

Após seguir todos os passos, seu app Visor Crypto estará usando dados macroeconômicos reais, atualizados automaticamente, e escalável para milhões de usuários!

---

**Desenvolvido para o Visor Crypto** 🚀
