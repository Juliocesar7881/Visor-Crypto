# Visor Crypto - Economic Calendar Worker

Cloudflare Worker que serve o calendário econômico dos EUA com dados limpos e deduplicados.

## Arquitetura

```
┌─────────────────────────────────────────────────┐
│                 Cloudflare Worker                │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ FMP API  │  │ ForexFac │  │   FRED API   │  │
│  │(30 dias) │  │ (semana) │  │ (histórico)  │  │
│  └────┬─────┘  └────┬─────┘  └──────┬───────┘  │
│       │              │               │           │
│       └──────┬───────┘               │           │
│              ▼                       ▼           │
│     ┌────────────────┐    ┌──────────────────┐  │
│     │ Merge + Dedup  │    │  Cache Histórico │  │
│     │  + Translate   │    │    (24h TTL)     │  │
│     └───────┬────────┘    └────────┬─────────┘  │
│             ▼                      │             │
│     ┌────────────────┐             │             │
│     │  KV Store (3h) │             │             │
│     └───────┬────────┘             │             │
│             │                      │             │
│             ▼                      ▼             │
│     ┌──────────────────────────────────────┐    │
│     │     JSON API (GET /calendar)          │    │
│     │     JSON API (GET /history?series=)   │    │
│     └──────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
                        │
                        ▼
              ┌──────────────────┐
              │   App Mobile     │
              │  (Visor Crypto)  │
              └──────────────────┘
```

## Endpoints

| Método | Path | Descrição |
|--------|------|-----------|
| GET | `/calendar` | Eventos alta importância EUA, próximos 30 dias |
| GET | `/history?series=UNRATE` | Dados históricos FRED (12 últimas observações) |
| GET | `/health` | Status check |

## Deploy

### 1. Instalar Wrangler CLI
```bash
npm install -g wrangler
```

### 2. Login no Cloudflare
```bash
wrangler login
```

### 3. Criar KV Namespace
```bash
wrangler kv:namespace create "CALENDAR_KV"
```
Copie o ID retornado e atualize `wrangler.toml`:
```toml
[[kv_namespaces]]
binding = "CALENDAR_KV"
id = "SEU_ID_AQUI"
```

### 4. Deploy
```bash
cd worker
wrangler deploy
```

### 4.1 Configurar segredos (obrigatorio)
Nao deixe chaves no codigo. Configure via Wrangler Secrets:

```bash
wrangler secret put FMP_API_KEY
wrangler secret put FRED_API_KEY
```

Sem esses segredos, o worker continua online, mas fontes que dependem dessas APIs ficam limitadas.

### 5. Configurar URL no App
Após o deploy, o Wrangler mostrará a URL (ex: `https://visor-crypto-calendar.SEU_USER.workers.dev`).

Atualize no app em `www/js/macro.js`:
```javascript
const CALENDAR_WORKER_URL = 'https://visor-crypto-calendar.SEU_USER.workers.dev';
```

## Custos

| Recurso | Free Tier | Uso Estimado |
|---------|-----------|--------------|
| Workers Requests | 100K/dia | ~800/dia (3h refresh + users) |
| KV Reads | 100K/dia | ~800/dia |
| KV Writes | 1K/dia | ~16/dia (8 cron × 2 keys) |
| Cron Triggers | 5/worker | 1 (a cada 3h) |

**Custo total: $0/mês** (dentro do free tier mesmo com milhares de usuários)

## Escalabilidade

- **Edge caching**: Worker roda em 300+ datacenters globais
- **KV replication**: Dados replicados globalmente
- **Cron**: Atualiza dados 1x a cada 3h, independente de quantos usuários
- **Cache-first**: 99%+ dos requests servidos do cache em <5ms
- **Sem estado**: Escala infinitamente sem servidor dedicado

## Seguranca

- Chaves FMP/FRED lidas de secrets do Cloudflare (nao hardcoded).
- Endpoints de `calls` com validacao e rate limiting por IP.
- Erros internos nao expoem detalhes sensiveis ao cliente.
