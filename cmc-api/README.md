# CMC API - Backend Centralizado

Backend que busca dados do CoinMarketCap e disponibiliza para infinitos usuários.

## Dados Disponíveis

- **Fear & Greed Index** - Índice de medo e ganância do mercado
- **BTC Dominance** - Dominância do Bitcoin no mercado
- **Altseason Index** - Índice de temporada de altcoins

## Como Usar

### 1. Criar repositório no GitHub

```bash
cd cmc-api
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/cmc-api.git
git push -u origin main
```

### 2. Configurar Secret da API

1. Vá em **Settings** → **Secrets and variables** → **Actions**
2. Clique em **New repository secret**
3. Nome: `CMC_API_KEY`
4. Valor: `c3989cf0317a4eacbda6802f3c851a16`

### 3. Ativar GitHub Actions

1. Vá em **Actions** na página do repositório
2. Clique em **"I understand my workflows, go ahead and enable them"**
3. Clique em **"Fetch CMC Data"** → **"Run workflow"** para testar

### 4. URL dos Dados

Após configurado, os dados ficam disponíveis em:

```
https://raw.githubusercontent.com/SEU_USUARIO/cmc-api/main/data/cmc-data.json
```

## Formato dos Dados

```json
{
  "fearGreed": 29,
  "fearGreedClassification": "Fear",
  "btcDominance": 59.65,
  "altseasonIndex": 16,
  "lastUpdate": "2024-01-26T12:00:00.000Z"
}
```

## Frequência de Atualização

- **A cada 5 minutos** (limite mínimo do GitHub Actions)
- ~8.640 atualizações/mês (bem abaixo do limite de 10.000)

## Custos

- **GitHub Actions**: Grátis (2.000 min/mês para repos públicos)
- **CoinMarketCap**: Grátis (10.000 req/mês no plano Basic)
