# Fed Watch API

API gratuita para dados do Fed Watch, atualizada automaticamente a cada 30 minutos via GitHub Actions.

## 📊 Endpoint

```
https://SEU_USUARIO.github.io/fed-watch-api/data/fed-watch.json
```

## 📋 Dados Retornados

```json
{
  "lastUpdate": "2026-01-24T15:00:00.000Z",
  "nextMeeting": {
    "date": "2026-01-28",
    "label": "27-28 Jan 2026",
    "daysUntil": 4
  },
  "currentRate": {
    "range": "4.25-4.50%",
    "midpoint": 4.375
  },
  "probabilities": {
    "cut": 25,
    "hold": 65,
    "hike": 10
  },
  "market": {
    "impliedRate": "4.375",
    "fearGreed": 50,
    "fearGreedClassification": "Neutral"
  },
  "source": "GitHub Actions - Fed Watch API"
}
```

## ⚙️ Como Funciona

1. GitHub Actions roda a cada 30 minutos
2. Busca dados de Treasury Rates e Fear & Greed
3. Calcula probabilidades de corte/manutenção/aumento
4. Salva o JSON no repositório
5. GitHub Pages serve o arquivo gratuitamente

## 🚀 Setup

1. Faça fork deste repositório
2. Vá em Settings > Pages
3. Em "Source", selecione "Deploy from a branch"
4. Selecione a branch "main" e pasta "/ (root)"
5. Clique em Save
6. Aguarde alguns minutos e acesse seu endpoint

## 📅 Reuniões FOMC 2026

- 27-28 Janeiro
- 17-18 Março
- 5-6 Maio
- 16-17 Junho
- 28-29 Julho
- 15-16 Setembro
- 3-4 Novembro
- 15-16 Dezembro

## 📝 Licença

MIT - Use livremente!
