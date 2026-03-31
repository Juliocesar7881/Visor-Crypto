/**
 * Visor Crypto - Economic Calendar Worker
 * Cloudflare Worker que faz scraping do calendário econômico
 * e serve JSON limpo para o app.
 *
 * Fontes:
 *   1. ForexFactory (JSON feed gratuito - semana atual)
 *   2. FMP API (server-side, limpo e deduplicado - 30 dias)
 *   3. FRED API (dados históricos de indicadores)
 *
 * Cache: KV Store com TTL de 3 horas
 * Cron: Roda a cada 3 horas automaticamente
 * Custo: Zero (free tier do Cloudflare Workers)
 */

// ============================================
// CONFIGURAÇÃO
// ============================================
const CACHE_KEY_CALENDAR = 'calendar_events_v1';
const CACHE_KEY_HISTORY = 'event_history_v1';
const CACHE_TTL_SECONDS = 3 * 60 * 60; // 3 horas

// Liquidations endpoint protection
const LIQUIDATIONS_CACHE_SECONDS = 180;       // standard cache (freshness/perf balance)
const LIQUIDATIONS_SHORT_CACHE_SECONDS = 60;  // burst cache for high-QPS spikes (KV minimum TTL)
const LIQUIDATIONS_CACHE_MAX_AGE_MS = LIQUIDATIONS_CACHE_SECONDS * 1000;
const LIQUIDATIONS_SHORT_CACHE_MAX_AGE_MS = LIQUIDATIONS_SHORT_CACHE_SECONDS * 1000;
const LIQUIDATIONS_RATE_LIMIT = 120;          // requests per window per IP
const LIQUIDATIONS_RATE_WINDOW_SECONDS = 60;
const CALLS_POST_RATE_LIMIT_PER_DEVICE = 60;  // writes per minute per authenticated device
const CALLS_POST_RATE_LIMIT_PER_IP = 1200;    // shared IP ceiling to preserve burst capacity behind NAT
const CALLS_POST_RATE_WINDOW_SECONDS = 60;
const RATE_LIMIT_SYNC_INTERVAL_MS = 10 * 1000;
const RATE_LIMIT_BUCKETS = globalThis.__visorRateLimitBuckets || (globalThis.__visorRateLimitBuckets = new Map());
const AUTH_TOKEN_TTL_SECONDS = 120;
const AUTH_CLOCK_SKEW_SECONDS = 15;
const DEFAULT_ALLOWED_ORIGINS = [
    'https://visorcrypto.loan',
    'https://www.visorcrypto.loan',
    'capacitor://localhost',
    'http://localhost',
    'http://127.0.0.1',
    'https://localhost',
    'https://127.0.0.1'
];
let AUTH_SECRET_CACHE = globalThis.__visorAuthSecretCache || '';

function getSecret(env, keyName) {
    return String(env?.[keyName] || '').trim();
}

function getAuthSecret(env) {
    const direct = getSecret(env, 'APP_AUTH_SECRET');
    if (direct) {
        AUTH_SECRET_CACHE = direct;
        globalThis.__visorAuthSecretCache = direct;
        return direct;
    }
    return AUTH_SECRET_CACHE;
}

function normalizeDeviceId(raw) {
    const normalized = String(raw || '').trim().toLowerCase();
    if (!normalized) return '';
    if (!/^[a-z0-9._:-]{8,128}$/.test(normalized)) return '';
    return normalized;
}

function normalizeUserId(raw) {
    const normalized = String(raw || '').trim();
    if (!normalized) return '';
    if (!/^[A-Za-z0-9._@:-]{1,64}$/.test(normalized)) return '';
    return normalized;
}

function parseAllowedOrigins(env) {
    const envValue = String(env?.ALLOWED_ORIGINS || '').trim();
    if (!envValue) return DEFAULT_ALLOWED_ORIGINS;
    const list = envValue
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);
    return list.length > 0 ? list : DEFAULT_ALLOWED_ORIGINS;
}

function getRequestOrigin(request) {
    return String(request.headers.get('Origin') || '').trim();
}

function isOriginAllowed(origin, allowedOrigins) {
    if (!origin) return true;
    return allowedOrigins.includes(origin);
}

function buildCorsHeaders(request, env) {
    const allowedOrigins = parseAllowedOrigins(env);
    const requestOrigin = getRequestOrigin(request);
    const origin = isOriginAllowed(requestOrigin, allowedOrigins)
        ? requestOrigin
        : allowedOrigins[0];

    return {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Device-Id, X-User-Id, Idempotency-Key, X-App-Client',
        'Access-Control-Expose-Headers': 'X-RateLimit-Limit, X-RateLimit-Remaining, Retry-After',
        'Cache-Control': 'public, max-age=1800',
        'Vary': 'Origin',
    };
}

function isRequestOriginAllowed(request, env) {
    const requestOrigin = getRequestOrigin(request);
    if (!requestOrigin) return true;
    return isOriginAllowed(requestOrigin, parseAllowedOrigins(env));
}

function encodeUtf8(value) {
    return new TextEncoder().encode(value);
}

function decodeUtf8(bytes) {
    return new TextDecoder().decode(bytes);
}

function base64UrlEncodeBytes(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlEncodeString(value) {
    return base64UrlEncodeBytes(encodeUtf8(value));
}

function base64UrlDecodeToBytes(value) {
    const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '==='.slice((normalized.length + 3) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

async function importAuthSigningKey(secret) {
    return crypto.subtle.importKey(
        'raw',
        encodeUtf8(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign', 'verify']
    );
}

function randomTokenId() {
    const bytes = new Uint8Array(18);
    crypto.getRandomValues(bytes);
    return base64UrlEncodeBytes(bytes);
}

async function signShortLivedToken(payload, secret) {
    const header = { alg: 'HS256', typ: 'JWT' };
    const encodedHeader = base64UrlEncodeString(JSON.stringify(header));
    const encodedPayload = base64UrlEncodeString(JSON.stringify(payload));
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const key = await importAuthSigningKey(secret);
    const signature = await crypto.subtle.sign('HMAC', key, encodeUtf8(signingInput));
    const encodedSignature = base64UrlEncodeBytes(new Uint8Array(signature));
    return `${signingInput}.${encodedSignature}`;
}

async function verifyShortLivedToken(token, secret) {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) {
        return { ok: false, error: 'Invalid token format' };
    }

    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const signingInput = `${encodedHeader}.${encodedPayload}`;

    let payload;
    try {
        payload = JSON.parse(decodeUtf8(base64UrlDecodeToBytes(encodedPayload)));
    } catch (_) {
        return { ok: false, error: 'Invalid token payload' };
    }

    let signatureBytes;
    try {
        signatureBytes = base64UrlDecodeToBytes(encodedSignature);
    } catch (_) {
        return { ok: false, error: 'Invalid token signature' };
    }

    const key = await importAuthSigningKey(secret);
    const validSignature = await crypto.subtle.verify('HMAC', key, signatureBytes, encodeUtf8(signingInput));
    if (!validSignature) {
        return { ok: false, error: 'Invalid token signature' };
    }

    const now = Math.floor(Date.now() / 1000);
    if (!payload || typeof payload !== 'object') {
        return { ok: false, error: 'Invalid token payload' };
    }

    if (!Number.isFinite(payload.exp) || now > (payload.exp + AUTH_CLOCK_SKEW_SECONDS)) {
        return { ok: false, error: 'Token expired' };
    }

    if (Number.isFinite(payload.nbf) && now + AUTH_CLOCK_SKEW_SECONDS < payload.nbf) {
        return { ok: false, error: 'Token not active yet' };
    }

    return { ok: true, payload };
}

async function requireSignedAuth(request, env, requiredScope) {
    const secret = getAuthSecret(env);
    if (!secret) {
        return { ok: false, status: 503, error: 'Auth service unavailable' };
    }

    const authHeader = String(request.headers.get('Authorization') || '').trim();
    if (!authHeader.startsWith('Bearer ')) {
        return { ok: false, status: 401, error: 'Missing bearer token' };
    }

    const token = authHeader.slice(7).trim();
    const tokenCheck = await verifyShortLivedToken(token, secret);
    if (!tokenCheck.ok) {
        return { ok: false, status: 401, error: tokenCheck.error || 'Invalid token' };
    }

    const payload = tokenCheck.payload || {};
    const deviceId = normalizeDeviceId(request.headers.get('X-Device-Id'));
    if (!deviceId) {
        return { ok: false, status: 401, error: 'Missing device identity' };
    }

    if (String(payload.sub || '') !== deviceId) {
        return { ok: false, status: 401, error: 'Token/device mismatch' };
    }

    const requestOrigin = getRequestOrigin(request);
    const tokenOrigin = String(payload.ori || '');
    if (tokenOrigin && requestOrigin && tokenOrigin !== requestOrigin) {
        return { ok: false, status: 401, error: 'Origin mismatch' };
    }

    const scopes = Array.isArray(payload.scopes) ? payload.scopes : [];
    if (requiredScope && !scopes.includes(requiredScope) && !scopes.includes('*')) {
        return { ok: false, status: 403, error: 'Insufficient scope' };
    }

    const headerUserId = normalizeUserId(request.headers.get('X-User-Id'));
    const tokenUserId = normalizeUserId(payload.uid || '');
    if (tokenUserId && headerUserId && tokenUserId !== headerUserId) {
        return { ok: false, status: 401, error: 'Token/user mismatch' };
    }

    return {
        ok: true,
        identity: {
            deviceId,
            userId: tokenUserId || headerUserId || ''
        },
        payload
    };
}

function getClientIp(request) {
    return (
        request.headers.get('CF-Connecting-IP') ||
        request.headers.get('x-forwarded-for') ||
        request.headers.get('x-real-ip') ||
        'unknown'
    ).split(',')[0].trim();
}

async function checkRateLimit(env, key, limit, windowSeconds) {
    const now = Date.now();
    const windowMs = windowSeconds * 1000;

    let bucket = RATE_LIMIT_BUCKETS.get(key);

    if (!bucket || typeof bucket.count !== 'number' || typeof bucket.resetAt !== 'number' || now > bucket.resetAt) {
        let fromKv = null;
        if (env?.CALENDAR_KV) {
            try {
                fromKv = await env.CALENDAR_KV.get(key, 'json');
            } catch (kvReadErr) {
                console.error('Rate-limit KV read failed:', kvReadErr);
            }
        }

        if (fromKv && typeof fromKv.count === 'number' && typeof fromKv.resetAt === 'number' && now <= fromKv.resetAt) {
            bucket = { count: fromKv.count, resetAt: fromKv.resetAt, lastSyncAt: now };
        } else {
            bucket = { count: 0, resetAt: now + windowMs, lastSyncAt: 0 };
        }
    }

    if (bucket.count >= limit) {
        RATE_LIMIT_BUCKETS.set(key, bucket);
        return { allowed: false, remaining: 0 };
    }

    bucket.count += 1;
    RATE_LIMIT_BUCKETS.set(key, bucket);

    if (env?.CALENDAR_KV) {
        const remainingMs = Math.max(1000, bucket.resetAt - now);
        const shouldSync = (
            bucket.count === 1 ||
            bucket.count >= limit ||
            (now - (bucket.lastSyncAt || 0) >= RATE_LIMIT_SYNC_INTERVAL_MS)
        );

        if (shouldSync) {
            bucket.lastSyncAt = now;
            const expirationTtl = Math.max(60, Math.ceil(remainingMs / 1000));
            try {
                await env.CALENDAR_KV.put(key, JSON.stringify({ count: bucket.count, resetAt: bucket.resetAt }), {
                    expirationTtl
                });
            } catch (kvWriteErr) {
                console.error('Rate-limit KV write failed:', kvWriteErr);
            }
        }
    }

    return { allowed: true, remaining: Math.max(0, limit - bucket.count) };
}

// Apenas eventos de ALTA importância dos EUA
const HIGH_IMPACT_EVENTS = [
    'nonfarm payroll', 'cpi', 'core cpi', 'ppi', 'core ppi',
    'gdp', 'fomc', 'interest rate decision',
    'unemployment rate', 'retail sales', 'core retail sales',
    'ism manufacturing pmi', 'ism services pmi', 'ism non-manufacturing',
    'consumer confidence', 'michigan consumer sentiment',
    'pce price index', 'core pce', 'personal spending', 'personal income',
    'jolts job openings', 'adp employment', 'adp nonfarm',
    'initial jobless claims', 'durable goods', 'industrial production',
    'building permits', 'housing starts', 'existing home sales', 'new home sales',
    'trade balance', 'empire state manufacturing', 'philadelphia fed',
    'fed chair powell', 'fed chair'
];

// Traduções PT-BR
const TRANSLATIONS = {
    'nonfarm payrolls': 'Emprego Não-Agrícola (NFP)',
    'nonfarm payroll': 'Emprego Não-Agrícola (NFP)',
    'change in nonfarm payrolls': 'Variação Emprego Não-Agrícola',
    'adp nonfarm employment change': 'Emprego Privado ADP',
    'adp employment change': 'Emprego Privado ADP',
    'cpi': 'Índice de Preços (CPI)',
    'core cpi': 'CPI Núcleo (ex-Alimentos e Energia)',
    'cpi yoy': 'CPI Anual',
    'cpi mom': 'CPI Mensal',
    'consumer price index': 'Índice de Preços (CPI)',
    'ppi': 'Preços ao Produtor (PPI)',
    'core ppi': 'PPI Núcleo',
    'producer price index': 'Preços ao Produtor (PPI)',
    'gdp': 'PIB dos EUA',
    'gdp growth rate': 'Crescimento do PIB',
    'gdp price index': 'Deflator do PIB',
    'gross domestic product': 'PIB dos EUA',
    'fomc': 'Decisão de Juros (FOMC)',
    'fomc meeting minutes': 'Ata do FOMC',
    'fomc minutes': 'Ata do FOMC',
    'fomc press conference': 'Coletiva do Fed',
    'interest rate decision': 'Decisão de Taxa de Juros',
    'interest rate': 'Taxa de Juros do Fed',
    'retail sales': 'Vendas no Varejo',
    'core retail sales': 'Vendas no Varejo (Núcleo)',
    'retail sales mom': 'Vendas no Varejo (Mensal)',
    'unemployment rate': 'Taxa de Desemprego',
    'initial jobless claims': 'Pedidos de Seguro-Desemprego',
    'continuing jobless claims': 'Seguro-Desemprego Contínuo',
    'ism manufacturing pmi': 'PMI Manufatura (ISM)',
    'ism manufacturing': 'ISM Manufatura',
    'ism services pmi': 'PMI Serviços (ISM)',
    'ism services': 'ISM Serviços',
    'ism non-manufacturing pmi': 'PMI Serviços (ISM)',
    'consumer confidence': 'Confiança do Consumidor',
    'consumer confidence index': 'Índice Confiança Consumidor',
    'michigan consumer sentiment': 'Sentimento Michigan',
    'university of michigan consumer sentiment': 'Sentimento Michigan',
    'housing starts': 'Início de Construções',
    'building permits': 'Alvarás de Construção',
    'existing home sales': 'Vendas de Imóveis Usados',
    'new home sales': 'Vendas de Imóveis Novos',
    'pce price index': 'PCE (Inflação preferida do Fed)',
    'core pce price index': 'PCE Núcleo',
    'personal spending': 'Gastos Pessoais',
    'personal income': 'Renda Pessoal',
    'personal consumption expenditures': 'PCE (Inflação preferida do Fed)',
    'fed chair powell': 'Discurso Powell (Fed)',
    'fed chair': 'Discurso Presidente do Fed',
    'jolts job openings': 'Vagas de Emprego (JOLTS)',
    'job openings': 'Vagas de Emprego (JOLTS)',
    'trade balance': 'Balança Comercial',
    'industrial production': 'Produção Industrial',
    'capacity utilization': 'Utilização da Capacidade',
    'durable goods orders': 'Pedidos de Bens Duráveis',
    'empire state manufacturing index': 'Índice Empire State',
    'empire state manufacturing': 'Índice Empire State',
    'philadelphia fed manufacturing index': 'Índice Philly Fed',
    'philadelphia fed manufacturing': 'Índice Philly Fed',
};

// FRED series IDs para dados históricos dos eventos
const FRED_SERIES = {
    'nonfarm payroll': 'PAYEMS',
    'unemployment rate': 'UNRATE',
    'cpi': 'CPIAUCSL',
    'core cpi': 'CPILFESL',
    'ppi': 'PPIACO',
    'pce price index': 'PCEPI',
    'core pce': 'PCEPILFE',
    'gdp': 'GDP',
    'retail sales': 'RSAFS',
    'industrial production': 'INDPRO',
    'ism manufacturing': 'MANEMP',
    'consumer confidence': 'UMCSENT',
    'michigan consumer sentiment': 'UMCSENT',
    'housing starts': 'HOUST',
    'building permits': 'PERMIT',
    'durable goods': 'DGORDER',
    'initial jobless claims': 'ICSA',
    'jolts job openings': 'JTSJOL',
    'personal income': 'PI',
    'personal spending': 'PCE',
    'trade balance': 'BOPGSTB',
    'interest rate': 'FEDFUNDS',
};

// ============================================
// FUNÇÕES AUXILIARES
// ============================================

function formatDate(date) {
    return date.toISOString().split('T')[0];
}

function parseFMPDate(dateStr) {
    if (!dateStr) return new Date(NaN);
    const parts = dateStr.split(/[T ]/);
    const [year, month, day] = parts[0].split('-').map(Number);
    let hour = 0, min = 0;
    if (parts[1]) {
        const timeParts = parts[1].split(':');
        hour = parseInt(timeParts[0]) || 0;
        min = parseInt(timeParts[1]) || 0;
    }
    return new Date(Date.UTC(year, month - 1, day, hour, min));
}

function translateTitle(rawTitle) {
    const lower = rawTitle.toLowerCase().trim();
    const sortedKeys = Object.keys(TRANSLATIONS).sort((a, b) => b.length - a.length);
    for (const key of sortedKeys) {
        if (lower.includes(key)) {
            return TRANSLATIONS[key];
        }
    }
    return rawTitle;
}

function isHighImpactUS(event) {
    const name = (event.event || '').toLowerCase();
    const country = (event.country || '').toLowerCase();
    const isUS = country.includes('us') || country.includes('united states');
    if (!isUS) return false;

    // FMP impact field
    if (event.impact === 'High') return true;

    // Check against our keyword list
    return HIGH_IMPACT_EVENTS.some(keyword => name.includes(keyword));
}

function getEventCategory(name) {
    const lower = name.toLowerCase();
    const categories = {
        'employment': ['nonfarm', 'payroll', 'employment', 'adp', 'jolts', 'job opening', 'unemployment', 'jobless'],
        'inflation_cpi': ['core cpi', 'cpi '],
        'inflation_ppi': ['ppi', 'producer price'],
        'inflation_pce': ['pce', 'personal consumption'],
        'gdp': ['gdp', 'gross domestic'],
        'fed': ['fomc', 'interest rate decision', 'fed funds'],
        'retail': ['retail sales'],
        'ism_mfg': ['ism manufacturing'],
        'ism_svc': ['ism services', 'ism non-manufacturing'],
        'housing': ['housing starts', 'building permits', 'home sales'],
        'consumer': ['consumer confidence', 'consumer sentiment', 'michigan'],
        'durable': ['durable goods'],
        'industrial': ['industrial production', 'capacity utilization'],
    };
    for (const [cat, keywords] of Object.entries(categories)) {
        if (keywords.some(kw => lower.includes(kw))) return cat;
    }
    return null;
}

function scoreEntry(e) {
    let score = 0;
    const ed = parseFMPDate(e.date);
    const h = ed.getUTCHours(), m = ed.getUTCMinutes();
    const hasRealTime = !(h === 0 && m === 0);
    const hasActual = e.actual !== undefined && e.actual !== null && e.actual !== '';

    if (hasRealTime) score += 20;
    if (hasActual) score += 12;
    if (e.estimate !== undefined && e.estimate !== null && e.estimate !== '') score += 5;
    if (e.previous !== undefined && e.previous !== null && e.previous !== '') score += 2;
    if (e.impact === 'High') score += 3;
    if (!hasRealTime && hasActual) score -= 8;
    return score;
}

function formatEconomicValue(val, eventTitle) {
    if (val === undefined || val === null || val === '') return null;
    const num = parseFloat(val);
    if (isNaN(num)) return String(val);
    const lower = eventTitle.toLowerCase();

    if (lower.includes('payroll') || lower.includes('employment') || lower.includes('job')) {
        return num >= 0 ? `+${num.toFixed(0)}K` : `${num.toFixed(0)}K`;
    }
    if (lower.includes('cpi') || lower.includes('ppi') || lower.includes('pce') || lower.includes('inflação')) {
        return `${num.toFixed(1)}%`;
    }
    if (lower.includes('rate') || lower.includes('juros') || lower.includes('fomc')) {
        return `${num.toFixed(2)}%`;
    }
    if (lower.includes('gdp') || lower.includes('pib')) {
        return `${num.toFixed(1)}%`;
    }
    if (Math.abs(num) >= 1000) {
        return num >= 0 ? `+${(num / 1000).toFixed(1)}K` : `${(num / 1000).toFixed(1)}K`;
    }
    return num >= 0 ? `+${num.toFixed(1)}` : `${num.toFixed(1)}`;
}

// ============================================
// FONTE 1: FMP API (server-side, limpo)
// ============================================
async function fetchFromFMP(fromDate, toDate, fmpApiKey) {
    if (!fmpApiKey) return [];
    const url = `https://financialmodelingprep.com/api/v3/economic_calendar?from=${fromDate}&to=${toDate}&apikey=${fmpApiKey}`;
    try {
        const res = await fetch(url, { cf: { cacheTtl: 3600 } });
        if (!res.ok) return [];
        const data = await res.json();
        if (!Array.isArray(data)) return [];
        return data;
    } catch (e) {
        console.error('FMP fetch error:', e);
        return [];
    }
}

// ============================================
// FONTE 2: ForexFactory JSON feed (semana atual)
// ============================================
async function fetchFromForexFactory() {
    const url = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
    try {
        const res = await fetch(url, { cf: { cacheTtl: 3600 } });
        if (!res.ok) return [];
        const data = await res.json();
        if (!Array.isArray(data)) return [];
        // Normalizar para formato compatível
        return data
            .filter(e => (e.country || '').toUpperCase() === 'USD' && e.impact === 'High')
            .map(e => ({
                event: e.title || '',
                date: e.date || '',
                country: 'US',
                impact: 'High',
                actual: e.actual || null,
                previous: e.previous || null,
                estimate: e.forecast || null,
                source: 'forexfactory',
            }));
    } catch (e) {
        console.error('ForexFactory fetch error:', e);
        return [];
    }
}

// ============================================
// DADOS HISTÓRICOS VIA FRED API
// ============================================
async function fetchHistoryFromFRED(seriesId, optsOrLimit = 6, fredApiKey = '') {
    if (!fredApiKey) return [];

    const opts = (typeof optsOrLimit === 'number')
        ? { limit: optsOrLimit }
        : (optsOrLimit || {});

    const limit = Math.min(Math.max(parseInt(String(opts.limit || 6), 10) || 6, 1), 120);
    const sortOrder = String(opts.sortOrder || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
    const units = String(opts.units || '').trim();
    const safeUnits = /^[a-z0-9_]+$/i.test(units) ? units : '';

    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&sort_order=${sortOrder}&limit=${limit}${safeUnits ? `&units=${safeUnits}` : ''}&api_key=${fredApiKey}&file_type=json`;

    try {
        const res = await fetch(url, { cf: { cacheTtl: 86400 } });
        if (!res.ok) return [];
        const data = await res.json();
        if (!data.observations) return [];

        return data.observations
            .filter(o => o.value && o.value !== '.')
            .map(o => ({
                date: o.date,
                value: parseFloat(o.value),
            }));
    } catch (e) {
        console.error(`FRED fetch error for ${seriesId}:`, e);
        return [];
    }
}

// ============================================
// PIPELINE PRINCIPAL: MERGE + DEDUP + CLEAN
// ============================================
async function buildCalendar(fmpApiKey = '') {
    const now = new Date();
    const fromDate = formatDate(now);
    const toDate = formatDate(new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000));
    const nowMs = now.getTime();

    // Buscar de ambas as fontes em paralelo
    const [fmpData, ffData] = await Promise.all([
        fetchFromFMP(fromDate, toDate, fmpApiKey),
        fetchFromForexFactory(),
    ]);

    // 1. Filtrar FMP: apenas alta importância dos EUA
    const fmpFiltered = fmpData.filter(e => {
        if (!isHighImpactUS(e)) return false;
        const eventDate = parseFMPDate(e.date);
        if (isNaN(eventDate.getTime())) return false;
        // Remover placeholders: datas futuras sem horário real
        const h = eventDate.getUTCHours(), m = eventDate.getUTCMinutes();
        const isFarFuture = eventDate.getTime() > nowMs + 35 * 24 * 60 * 60 * 1000;
        if (isFarFuture && (h === 0 && m === 0)) return false;
        return true;
    }).map(e => ({ ...e, source: 'fmp' }));

    // 2. Merge: FMP + ForexFactory (FF tem prioridade para semana atual)
    const allEvents = [...fmpFiltered, ...ffData];

    // 3. Traduzir e agrupar por título
    const groupsByTitle = new Map();
    allEvents.forEach(e => {
        const title = translateTitle(e.event || '');
        if (!groupsByTitle.has(title)) groupsByTitle.set(title, []);
        groupsByTitle.get(title).push({ ...e, translatedTitle: title });
    });

    // 4. Dedup: melhor score por cluster de 10 dias
    const WEEKLY_EVENTS = ['initial jobless claims', 'continuing jobless claims'];
    const deduplicated = [];

    groupsByTitle.forEach((entries, translatedTitle) => {
        const isWeekly = WEEKLY_EVENTS.some(w =>
            entries[0] && (entries[0].event || '').toLowerCase().includes(w)
        );

        if (isWeekly) {
            // Eventos semanais: 1 por janela de 5 dias
            const scored = entries.map(e => ({
                entry: e,
                score: scoreEntry(e),
                date: parseFMPDate(e.date),
            }));
            scored.sort((a, b) => b.score - a.score);
            const buckets = new Map();
            scored.forEach(s => {
                const bucket = Math.floor((s.date.getTime() - nowMs) / (5 * 24 * 60 * 60 * 1000));
                if (!buckets.has(bucket)) buckets.set(bucket, s.entry);
            });
            buckets.forEach(entry => deduplicated.push(entry));
        } else {
            // Eventos normais: cluster por 10 dias
            const scored = entries.map(e => ({
                entry: e,
                score: scoreEntry(e),
                date: parseFMPDate(e.date),
                hasTime: (() => {
                    const d = parseFMPDate(e.date);
                    return !(d.getUTCHours() === 0 && d.getUTCMinutes() === 0);
                })(),
            }));
            scored.sort((a, b) => a.date - b.date);

            const clusters = [];
            let cluster = [scored[0]];
            for (let i = 1; i < scored.length; i++) {
                const gap = (scored[i].date - cluster[0].date) / (24 * 60 * 60 * 1000);
                if (gap <= 10) {
                    cluster.push(scored[i]);
                } else {
                    clusters.push(cluster);
                    cluster = [scored[i]];
                }
            }
            clusters.push(cluster);

            clusters.forEach(cl => {
                cl.sort((a, b) => {
                    if (b.score !== a.score) return b.score - a.score;
                    if (a.hasTime !== b.hasTime) return a.hasTime ? -1 : 1;
                    const af = a.date.getTime() >= nowMs, bf = b.date.getTime() >= nowMs;
                    if (af !== bf) return af ? -1 : 1;
                    return a.date - b.date;
                });
                deduplicated.push(cl[0].entry);
            });
        }
    });

    // 5. Remover placeholders de "valor atual"
    const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
    const cleaned = deduplicated.filter(e => {
        const ed = parseFMPDate(e.date);
        const h = ed.getUTCHours(), m = ed.getUTCMinutes();
        const hasRealTime = !(h === 0 && m === 0);
        const hasActual = e.actual !== undefined && e.actual !== null && e.actual !== '';
        const nearNow = Math.abs(ed.getTime() - nowMs) < threeDaysMs;
        if (!hasRealTime && hasActual && nearNow) return false;
        return true;
    });

    // 6. Ordenar por data e limitar
    cleaned.sort((a, b) => parseFMPDate(a.date) - parseFMPDate(b.date));

    // 7. Formatar para JSON final
    const months = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

    const events = cleaned.slice(0, 30).map(e => {
        const eventDate = parseFMPDate(e.date);
        const title = translateTitle(e.event || 'Evento');
        const time = `${String(eventDate.getUTCHours()).padStart(2, '0')}:${String(eventDate.getUTCMinutes()).padStart(2, '0')}`;

        // Histórico inline
        const history = [];
        if (e.previous !== undefined && e.previous !== null && e.previous !== '') {
            history.push({
                date: 'Anterior',
                value: formatEconomicValue(e.previous, title) || String(e.previous),
                type: 'neutral'
            });
        }
        if (e.actual !== undefined && e.actual !== null && e.actual !== '') {
            const formattedActual = formatEconomicValue(e.actual, title) || String(e.actual);
            const type = parseFloat(e.actual) > parseFloat(e.previous) ? 'positive'
                : parseFloat(e.actual) < parseFloat(e.previous) ? 'negative' : 'neutral';
            history.push({ date: 'Atual', value: formattedActual, type });
        }

        // Determinar FRED series para este evento
        let fredSeriesId = null;
        const eventLower = (e.event || '').toLowerCase();
        for (const [keyword, seriesId] of Object.entries(FRED_SERIES)) {
            if (eventLower.includes(keyword)) {
                fredSeriesId = seriesId;
                break;
            }
        }

        return {
            day: eventDate.getUTCDate(),
            month: months[eventDate.getUTCMonth()],
            year: eventDate.getUTCFullYear(),
            time,
            title,
            country: '🇺🇸 EUA',
            impact: 'high',
            description: e.event || '',
            isoDate: e.date,
            source: e.source || 'fmp',
            fredSeriesId,
            history: history.length > 0 ? history : [
                { date: 'Aguardando', value: '-', type: 'neutral' }
            ],
        };
    });

    return events;
}

// ============================================
// BUSCAR HISTÓRICO FRED PARA TODOS OS EVENTOS
// ============================================
async function buildHistory(events, fredApiKey = '') {
    const seriesIds = [...new Set(events.map(e => e.fredSeriesId).filter(Boolean))];
    const historyMap = {};

    // Buscar em paralelo (max 6 concurrent)
    const batchSize = 6;
    for (let i = 0; i < seriesIds.length; i += batchSize) {
        const batch = seriesIds.slice(i, i + batchSize);
        const results = await Promise.all(
            batch.map(id => fetchHistoryFromFRED(id, 12, fredApiKey))
        );
        batch.forEach((id, idx) => {
            historyMap[id] = results[idx];
        });
    }

    return historyMap;
}

class CallHistoryDO {
    constructor(state, env) {
        this.state = state;
        this.env = env;
        this.callsKey = 'calls_v2';
        this.maxCalls = 500;
        this.idempotencyTtlMs = 24 * 60 * 60 * 1000;
    }

    _json(data, status = 200) {
        return new Response(JSON.stringify(data), {
            status,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    _sanitizeIdempotencyKey(rawKey) {
        return String(rawKey || '')
            .trim()
            .replace(/[^A-Za-z0-9._:-]/g, '')
            .slice(0, 120);
    }

    async _cleanupIdempotency() {
        const now = Date.now();
        const lastCleanup = Number(await this.state.storage.get('idem_last_cleanup') || 0);
        if (now - lastCleanup < 10 * 60 * 1000) {
            return;
        }

        const items = await this.state.storage.list({ prefix: 'idem:' });
        const deletes = [];
        for (const [key, value] of items.entries()) {
            const ts = Number(value?.ts || 0);
            if (!ts || (now - ts) > this.idempotencyTtlMs) {
                deletes.push(key);
            }
        }

        if (deletes.length > 0) {
            await this.state.storage.delete(deletes);
        }

        await this.state.storage.put('idem_last_cleanup', now);
    }

    async _handlePost(request) {
        const body = await request.json();
        const deviceId = normalizeDeviceId(request.headers.get('X-Device-Id'));
        const userId = normalizeUserId(request.headers.get('X-User-Id'));
        const idempotencyKey = this._sanitizeIdempotencyKey(request.headers.get('Idempotency-Key'));

        const safeSymbol = String(body?.symbol || '').toUpperCase().trim();
        const safeDirection = String(body?.direction || '').toUpperCase().trim();
        const safeConfidence = Number(body?.confidence);
        const safeTime = Number(body?.time) || Date.now();

        if (!deviceId) {
            return this._json({ success: false, error: 'Missing device identity' }, 400);
        }

        if (!safeSymbol || !safeDirection || body?.confidence == null) {
            return this._json({ success: false, error: 'Missing required fields' }, 400);
        }

        if (!/^[A-Z0-9]{4,20}$/.test(safeSymbol)) {
            return this._json({ success: false, error: 'Invalid symbol' }, 400);
        }

        if (safeDirection !== 'LONG' && safeDirection !== 'SHORT') {
            return this._json({ success: false, error: 'Invalid direction' }, 400);
        }

        if (!Number.isFinite(safeConfidence) || safeConfidence < 0 || safeConfidence > 100) {
            return this._json({ success: false, error: 'Invalid confidence' }, 400);
        }

        const result = await this.state.storage.transaction(async (txn) => {
            const now = Date.now();
            const idemStorageKey = idempotencyKey ? `idem:${deviceId}:${idempotencyKey}` : '';

            if (idemStorageKey) {
                const idemValue = await txn.get(idemStorageKey);
                if (idemValue?.call) {
                    return {
                        success: true,
                        duplicate: true,
                        idempotent: true,
                        message: 'Duplicate request ignored',
                        call: idemValue.call,
                    };
                }
            }

            let calls = await txn.get(this.callsKey);
            if (!Array.isArray(calls)) {
                calls = [];
            }

            const dedupWindowMs = 30 * 60 * 1000;
            const duplicateCall = calls.find((c) =>
                c.symbol === safeSymbol &&
                c.direction === safeDirection &&
                (now - Number(c.time || 0)) < dedupWindowMs
            );

            if (duplicateCall) {
                if (idemStorageKey) {
                    await txn.put(idemStorageKey, { call: duplicateCall, ts: now });
                }
                return {
                    success: true,
                    duplicate: true,
                    message: 'Call already recorded',
                    call: duplicateCall,
                };
            }

            const newCall = {
                id: safeTime,
                symbol: safeSymbol,
                name: String(body?.name || '').slice(0, 50),
                short: String(body?.short || safeSymbol.replace('USDT', '')).slice(0, 10),
                img: String(body?.img || '').slice(0, 200),
                direction: safeDirection,
                confidence: Math.round(safeConfidence),
                gates: String(body?.gates || '').slice(0, 20),
                price: String(body?.price || '').slice(0, 20),
                reason: String(body?.reason || '').slice(0, 180),
                time: safeTime,
                deviceId,
                userId: userId || String(body?.userId || '').slice(0, 64)
            };

            calls.unshift(newCall);
            calls = calls.slice(0, this.maxCalls);

            await txn.put(this.callsKey, calls);
            if (idemStorageKey) {
                await txn.put(idemStorageKey, { call: newCall, ts: now });
            }

            return {
                success: true,
                duplicate: false,
                call: newCall,
                callsSnapshot: calls
            };
        });

        if (this.env?.CALENDAR_KV && Array.isArray(result?.callsSnapshot)) {
            try {
                await this.env.CALENDAR_KV.put('shared_call_history_v2', JSON.stringify(result.callsSnapshot), {
                    expirationTtl: 30 * 24 * 60 * 60
                });
            } catch (kvErr) {
                console.warn('CallHistoryDO KV mirror failed:', kvErr && kvErr.message ? kvErr.message : kvErr);
            }
        }

        if (result && Object.prototype.hasOwnProperty.call(result, 'callsSnapshot')) {
            delete result.callsSnapshot;
        }

        await this._cleanupIdempotency();
        return this._json(result, 200);
    }

    async _handleGet(url) {
        let calls = await this.state.storage.get(this.callsKey);
        if (!Array.isArray(calls)) {
            calls = [];
        }

        const filterDir = String(url.searchParams.get('direction') || '').toUpperCase();
        if (filterDir === 'LONG' || filterDir === 'SHORT') {
            calls = calls.filter((c) => c.direction === filterDir);
        }

        const requestedLimit = parseInt(url.searchParams.get('limit') || '100', 10);
        const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), this.maxCalls) : 100;
        calls = calls.slice(0, limit);

        return this._json({ success: true, calls, total: calls.length }, 200);
    }

    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === '/calls' && request.method === 'POST') {
            try {
                return await this._handlePost(request);
            } catch (e) {
                console.error('CallHistoryDO POST error:', e);
                return this._json({ success: false, error: 'Failed to record call' }, 500);
            }
        }

        if (url.pathname === '/calls' && request.method === 'GET') {
            try {
                return await this._handleGet(url);
            } catch (e) {
                console.error('CallHistoryDO GET error:', e);
                return this._json({ success: false, error: 'Failed to fetch calls' }, 500);
            }
        }

        return this._json({ success: false, error: 'Not found' }, 404);
    }
}

export { CallHistoryDO };

// ============================================
// HANDLER PRINCIPAL
// ============================================
export default {
    // HTTP request handler
    async fetch(request, env) {
        const url = new URL(request.url);
        const path = url.pathname;
        const FMP_API_KEY = getSecret(env, 'FMP_API_KEY');
        const FRED_API_KEY = getSecret(env, 'FRED_API_KEY');
        const GROQ_API_KEY = getSecret(env, 'GROQ_API_KEY');

        // CORS headers
        const corsHeaders = buildCorsHeaders(request, env);

        if (request.method === 'OPTIONS') {
            if (!isRequestOriginAllowed(request, env)) {
                return new Response(null, { status: 403, headers: corsHeaders });
            }
            return new Response(null, { headers: corsHeaders });
        }

        if (!isRequestOriginAllowed(request, env)) {
            return new Response(JSON.stringify({ success: false, error: 'Origin not allowed' }), {
                status: 403,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // POST /auth/issue — issue short-lived signed token scoped to write endpoints
        if (path === '/auth/issue' && request.method === 'POST') {
            try {
                const clientIp = getClientIp(request);
                const rl = await checkRateLimit(env, `rl_auth_issue_${clientIp}`, 30, 60);
                if (!rl.allowed) {
                    return new Response(JSON.stringify({ success: false, error: 'Rate limit exceeded' }), {
                        status: 429,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }

                const authSecret = getAuthSecret(env);
                if (!authSecret) {
                    return new Response(JSON.stringify({ success: false, error: 'Auth service unavailable' }), {
                        status: 503,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }

                const body = await request.json();
                const deviceId = normalizeDeviceId(body?.deviceId || request.headers.get('X-Device-Id'));
                const userId = normalizeUserId(body?.userId || request.headers.get('X-User-Id'));

                if (!deviceId) {
                    return new Response(JSON.stringify({ success: false, error: 'Invalid device identity' }), {
                        status: 400,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }

                const nowSec = Math.floor(Date.now() / 1000);
                const origin = getRequestOrigin(request);
                const payload = {
                    sub: deviceId,
                    uid: userId || '',
                    ori: origin || '',
                    scopes: ['ai-summary:write', 'calls:write'],
                    jti: randomTokenId(),
                    iat: nowSec,
                    nbf: nowSec,
                    exp: nowSec + AUTH_TOKEN_TTL_SECONDS,
                };

                const token = await signShortLivedToken(payload, authSecret);
                return new Response(JSON.stringify({
                    success: true,
                    token,
                    tokenType: 'Bearer',
                    expiresIn: AUTH_TOKEN_TTL_SECONDS,
                    scope: payload.scopes,
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
                });
            } catch (e) {
                console.error('Auth issue endpoint error:', e);
                return new Response(JSON.stringify({ success: false, error: 'Failed to issue token' }), {
                    status: 500,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            }
        }

        // GET /calendar - Eventos dos próximos 30 dias (apenas alta importância EUA)
        if (path === '/calendar' || path === '/') {
            try {
                // Tentar cache primeiro
                let cachedData = null;
                if (env.CALENDAR_KV) {
                    cachedData = await env.CALENDAR_KV.get(CACHE_KEY_CALENDAR, 'json');
                }

                if (cachedData) {
                    return new Response(JSON.stringify({
                        success: true,
                        events: cachedData.events,
                        lastUpdate: cachedData.lastUpdate,
                        source: 'cache',
                        nextUpdate: cachedData.nextUpdate,
                    }), {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }

                // Cache miss - buscar dados frescos
                const events = await buildCalendar(FMP_API_KEY);
                const now = new Date();
                const cacheData = {
                    events,
                    lastUpdate: now.toISOString(),
                    nextUpdate: new Date(now.getTime() + CACHE_TTL_SECONDS * 1000).toISOString(),
                };

                // Salvar no KV
                if (env.CALENDAR_KV) {
                    await env.CALENDAR_KV.put(
                        CACHE_KEY_CALENDAR,
                        JSON.stringify(cacheData),
                        { expirationTtl: CACHE_TTL_SECONDS }
                    );
                }

                return new Response(JSON.stringify({
                    success: true,
                    events,
                    lastUpdate: now.toISOString(),
                    source: 'fresh',
                    nextUpdate: cacheData.nextUpdate,
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            } catch (e) {
                console.error('Calendar endpoint error:', e);
                return new Response(JSON.stringify({
                    success: false,
                    error: 'Failed to fetch calendar data',
                }), {
                    status: 500,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            }
        }

        // GET /history?series=UNRATE - Dados históricos FRED
        if (path === '/history') {
            const seriesId = url.searchParams.get('series');
            if (!seriesId || !/^[A-Z0-9]+$/.test(seriesId)) {
                return new Response(JSON.stringify({
                    success: false,
                    error: 'Invalid series parameter',
                }), {
                    status: 400,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            }

            const requestedLimit = parseInt(url.searchParams.get('limit') || '12', 10);
            const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 120) : 12;
            const sortOrder = String(url.searchParams.get('sort') || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
            const rawUnits = String(url.searchParams.get('units') || '').trim();
            const units = /^[a-z0-9_]+$/i.test(rawUnits) ? rawUnits : '';

            try {
                // Tentar cache
                const cacheKey = `history_${seriesId}_${sortOrder}_${limit}_${units || 'raw'}`;
                let cached = null;
                if (env.CALENDAR_KV) {
                    cached = await env.CALENDAR_KV.get(cacheKey, 'json');
                }

                if (cached) {
                    return new Response(JSON.stringify({
                        success: true,
                        seriesId,
                        data: cached,
                        sort: sortOrder,
                        limit,
                        units: units || null,
                        source: 'cache',
                    }), {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }

                const data = await fetchHistoryFromFRED(seriesId, { limit, sortOrder, units }, FRED_API_KEY);

                if (env.CALENDAR_KV) {
                    await env.CALENDAR_KV.put(
                        cacheKey,
                        JSON.stringify(data),
                        { expirationTtl: 24 * 60 * 60 } // 24h para histórico
                    );
                }

                return new Response(JSON.stringify({
                    success: true,
                    seriesId,
                    data,
                    sort: sortOrder,
                    limit,
                    units: units || null,
                    source: 'fresh',
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            } catch (e) {
                console.error('History endpoint error:', e);
                return new Response(JSON.stringify({
                    success: false,
                    error: 'Failed to fetch history',
                }), {
                    status: 500,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            }
        }

        // GET /liquidations?symbol=BTCUSDT — Liquidações agregadas 12h via Binance + pendentes reais via OI
        if (path === '/liquidations') {
            const symbol = (url.searchParams.get('symbol') || 'BTCUSDT').toUpperCase();
            if (!/^[A-Z0-9]{4,20}$/.test(symbol)) {
                return new Response(JSON.stringify({ success: false, error: 'Invalid symbol' }), {
                    status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            }

            const clientIp = getClientIp(request);
            let liqRate = { allowed: true, remaining: LIQUIDATIONS_RATE_LIMIT };
            try {
                liqRate = await checkRateLimit(
                    env,
                    `rl_liquidations_${clientIp}`,
                    LIQUIDATIONS_RATE_LIMIT,
                    LIQUIDATIONS_RATE_WINDOW_SECONDS
                );
            } catch (rateErr) {
                // Fail-open if KV rate state is unavailable.
                console.error('Liquidations rate-limit check failed:', rateErr);
            }

            if (!liqRate.allowed) {
                return new Response(JSON.stringify({ success: false, error: 'Rate limit exceeded' }), {
                    status: 429,
                    headers: {
                        ...corsHeaders,
                        'Content-Type': 'application/json',
                        'Retry-After': String(LIQUIDATIONS_RATE_WINDOW_SECONDS),
                        'X-RateLimit-Limit': String(LIQUIDATIONS_RATE_LIMIT),
                        'X-RateLimit-Remaining': '0'
                    },
                });
            }

            // Registrar símbolo dinâmico para acumulação via cron (se não é base)
            if (env.CALENDAR_KV) {
                try {
                    const dynData = await env.CALENDAR_KV.get('liq_tracked_symbols', 'json');
                    const tracked = (dynData && Array.isArray(dynData.symbols)) ? dynData.symbols : [];
                    if (!tracked.includes(symbol)) {
                        tracked.push(symbol);
                        // Manter no máximo 50 símbolos dinâmicos, remover os mais antigos
                        const trimmed = tracked.slice(-50);
                        await env.CALENDAR_KV.put('liq_tracked_symbols', JSON.stringify({
                            symbols: trimmed, ts: Date.now()
                        }), { expirationTtl: 86400 }); // 24h TTL
                    }
                } catch (_) { /* non-critical */ }
            }

            try {
                const shortCacheKey = `liq_short_${symbol}`;
                const cacheKey = `liq_12h_${symbol}`;
                let shortCached = null;
                let cached = null;

                if (env.CALENDAR_KV) {
                    shortCached = await env.CALENDAR_KV.get(shortCacheKey, 'json');
                    cached = await env.CALENDAR_KV.get(cacheKey, 'json');
                }

                if (shortCached && (Date.now() - shortCached.ts < LIQUIDATIONS_SHORT_CACHE_MAX_AGE_MS)) {
                    return new Response(JSON.stringify({ success: true, ...shortCached, source: 'short-cache' }), {
                        headers: {
                            ...corsHeaders,
                            'Content-Type': 'application/json',
                            'Cache-Control': `public, max-age=${LIQUIDATIONS_SHORT_CACHE_SECONDS}, stale-while-revalidate=20`,
                            'X-RateLimit-Limit': String(LIQUIDATIONS_RATE_LIMIT),
                            'X-RateLimit-Remaining': String(liqRate.remaining)
                        },
                    });
                }

                if (cached && (Date.now() - cached.ts < LIQUIDATIONS_CACHE_MAX_AGE_MS)) {
                    return new Response(JSON.stringify({ success: true, ...cached, source: 'cache' }), {
                        headers: {
                            ...corsHeaders,
                            'Content-Type': 'application/json',
                            'Cache-Control': `public, max-age=${LIQUIDATIONS_SHORT_CACHE_SECONDS}, stale-while-revalidate=20`,
                            'X-RateLimit-Limit': String(LIQUIDATIONS_RATE_LIMIT),
                            'X-RateLimit-Remaining': String(liqRate.remaining)
                        },
                    });
                }

                // Fetch em paralelo: forceOrders + OI + L/S ratios + preço atual
                const [binRes, oiRes, lsAccountRes, lsPositionRes, tickerRes] = await Promise.all([
                    fetch(`https://fapi.binance.com/fapi/v1/allForceOrders?symbol=${symbol}&limit=1000`),
                    fetch(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${symbol}`),
                    fetch(`https://fapi.binance.com/futures/data/topLongShortAccountRatio?symbol=${symbol}&period=5m&limit=1`),
                    fetch(`https://fapi.binance.com/futures/data/topLongShortPositionRatio?symbol=${symbol}&period=5m&limit=1`),
                    fetch(`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbol}`)
                ]);

                const orders = binRes.ok ? await binRes.json() : [];
                const oiData = oiRes.ok ? await oiRes.json() : {};
                const lsAccount = lsAccountRes.ok ? await lsAccountRes.json() : [];
                const lsPosition = lsPositionRes.ok ? await lsPositionRes.json() : [];
                const tickerData = tickerRes.ok ? await tickerRes.json() : {};

                const currentPrice = parseFloat(tickerData.price || 0);
                const oiQty = parseFloat(oiData.openInterest || 0);
                const oiValueUSD = oiQty * currentPrice;

                // L/S ratios
                const accountRatio = parseFloat(lsAccount[0]?.longShortRatio || 1);
                const positionRatio = parseFloat(lsPosition[0]?.longShortRatio || 1);
                // Combined ratio: weighted average of account (40%) and position (60%) ratios
                const combinedRatio = accountRatio * 0.4 + positionRatio * 0.6;
                const longPct = combinedRatio / (1 + combinedRatio);
                const shortPct = 1 - longPct;
                const longOI = oiValueUSD * longPct;
                const shortOI = oiValueUSD * shortPct;

                // ─── Liquidações históricas reais (12h) ───
                const now = Date.now();
                const window12h = 12 * 60 * 60 * 1000;

                // Mesclar com dados acumulados do KV (cron acumula a cada 5 min)
                const accumKey = `liq_accum_${symbol}`;
                let accumData = null;
                if (env.CALENDAR_KV) {
                    accumData = await env.CALENDAR_KV.get(accumKey, 'json');
                }
                const existingOrders = (accumData && Array.isArray(accumData.orders)) ? accumData.orders : [];

                // Mesclar: ordens existentes + novas, deduplicar por time+price
                const orderMap = new Map();
                [...existingOrders, ...(Array.isArray(orders) ? orders : [])].forEach(o => {
                    const key = `${o.time}_${o.price}_${o.side}`;
                    if (!orderMap.has(key)) orderMap.set(key, o);
                });
                // Filtrar janela de 12h
                const allOrders12h = [...orderMap.values()].filter(o => now - parseInt(o.time || 0) < window12h);

                let longVol = 0, shortVol = 0, longCount = 0, shortCount = 0;
                const levels = [];

                allOrders12h.forEach(o => {
                    const price = parseFloat(o.averagePrice || o.price);
                    const qty = parseFloat(o.executedQty || o.origQty);
                    const vol = price * qty;
                    const isLong = o.side === 'SELL';
                    if (isLong) { longVol += vol; longCount++; }
                    else { shortVol += vol; shortCount++; }
                    levels.push({ price, vol, side: isLong ? 'LONG' : 'SHORT', time: parseInt(o.time || 0) });
                });

                levels.sort((a, b) => b.vol - a.vol);

                // Salvar acumulado no KV para próxima chamada
                if (env.CALENDAR_KV) {
                    await env.CALENDAR_KV.put(accumKey, JSON.stringify({
                        orders: allOrders12h.slice(0, 5000), // limitar tamanho
                        ts: now
                    }), { expirationTtl: 43200 }); // 12h TTL
                }

                // ─── Liquidações pendentes (estimadas com base em OI real) ───
                // Distribuição de alavancagem estimada para o mercado crypto
                const leverageDist = [
                    { lev: 2, pct: 0.05 },
                    { lev: 3, pct: 0.08 },
                    { lev: 5, pct: 0.15 },
                    { lev: 10, pct: 0.30 },
                    { lev: 20, pct: 0.22 },
                    { lev: 25, pct: 0.10 },
                    { lev: 50, pct: 0.07 },
                    { lev: 100, pct: 0.03 }
                ];

                const pendingLevels = [];
                leverageDist.forEach(({ lev, pct }) => {
                    const longLiqPrice = currentPrice * (1 - (0.9 / lev));
                    const shortLiqPrice = currentPrice * (1 + (0.9 / lev));
                    const longAtRisk = longOI * pct;
                    const shortAtRisk = shortOI * pct;
                    pendingLevels.push({
                        leverage: lev, type: 'LONG',
                        liqPrice: Math.round(longLiqPrice * 100) / 100,
                        distPct: ((currentPrice - longLiqPrice) / currentPrice * 100).toFixed(2),
                        volumeUSD: Math.round(longAtRisk)
                    });
                    pendingLevels.push({
                        leverage: lev, type: 'SHORT',
                        liqPrice: Math.round(shortLiqPrice * 100) / 100,
                        distPct: ((shortLiqPrice - currentPrice) / currentPrice * 100).toFixed(2),
                        volumeUSD: Math.round(shortAtRisk)
                    });
                });

                const result = {
                    symbol, ts: now, currentPrice,
                    longVol, shortVol, longCount, shortCount,
                    totalVol: longVol + shortVol,
                    totalCount: longCount + shortCount,
                    ratio: shortVol > 0 ? longVol / shortVol : 0,
                    topLevels: levels.slice(0, 30),
                    // Dados reais de OI
                    openInterestUSD: Math.round(oiValueUSD),
                    longOI: Math.round(longOI),
                    shortOI: Math.round(shortOI),
                    longPct: Math.round(longPct * 1000) / 10,
                    shortPct: Math.round(shortPct * 1000) / 10,
                    // Liquidações pendentes com valores reais de OI
                    pendingLevels,
                    totalPendingLong: Math.round(longOI),
                    totalPendingShort: Math.round(shortOI),
                };

                if (env.CALENDAR_KV) {
                    await Promise.all([
                        env.CALENDAR_KV.put(cacheKey, JSON.stringify(result), { expirationTtl: LIQUIDATIONS_CACHE_SECONDS }),
                        env.CALENDAR_KV.put(shortCacheKey, JSON.stringify(result), { expirationTtl: LIQUIDATIONS_SHORT_CACHE_SECONDS })
                    ]);
                }

                return new Response(JSON.stringify({ success: true, ...result, source: 'fresh' }), {
                    headers: {
                        ...corsHeaders,
                        'Content-Type': 'application/json',
                        'Cache-Control': `public, max-age=${LIQUIDATIONS_SHORT_CACHE_SECONDS}, stale-while-revalidate=20`,
                        'X-RateLimit-Limit': String(LIQUIDATIONS_RATE_LIMIT),
                        'X-RateLimit-Remaining': String(liqRate.remaining)
                    },
                });
            } catch (e) {
                console.error('Liquidations endpoint error:', e);
                return new Response(JSON.stringify({ success: false, error: 'Failed to fetch liquidations' }), {
                    status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            }
        }

        // POST /ai-summary — Groq proxy (keeps API key server-side)
        if (path === '/ai-summary' && request.method === 'POST') {
            try {
                const authCheck = await requireSignedAuth(request, env, 'ai-summary:write');
                if (!authCheck.ok) {
                    return new Response(JSON.stringify({ success: false, error: authCheck.error }), {
                        status: authCheck.status || 401,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }

                const clientIp = getClientIp(request);
                let rl = { allowed: true, remaining: 20 };
                try {
                    rl = await checkRateLimit(env, `rl_ai_summary_${clientIp}`, 20, 60);
                } catch (rateErr) {
                    // Fail-open: if KV is unavailable, do not break AI endpoint.
                    console.error('AI rate-limit check failed:', rateErr);
                }
                if (!rl.allowed) {
                    return new Response(JSON.stringify({ success: false, error: 'Rate limit exceeded' }), {
                        status: 429,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }

                if (!GROQ_API_KEY) {
                    return new Response(JSON.stringify({ success: false, error: 'AI provider not configured' }), {
                        status: 503,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }

                const body = await request.json();
                const model = String(body?.model || 'llama-3.3-70b-versatile').trim();
                const systemPrompt = String(body?.systemPrompt || '').trim();
                const userPrompt = String(body?.userPrompt || '').trim();

                if (!systemPrompt || !userPrompt) {
                    return new Response(JSON.stringify({ success: false, error: 'Missing prompt payload' }), {
                        status: 400,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }

                if (systemPrompt.length > 12000 || userPrompt.length > 24000) {
                    return new Response(JSON.stringify({ success: false, error: 'Prompt too large' }), {
                        status: 413,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }

                const groqResp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${GROQ_API_KEY}`,
                    },
                    body: JSON.stringify({
                        model,
                        messages: [
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: userPrompt }
                        ],
                        temperature: 0.4,
                        max_tokens: 500,
                        stream: false
                    })
                });

                if (!groqResp.ok) {
                    return new Response(JSON.stringify({ success: false, error: 'AI upstream error' }), {
                        status: 502,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }

                const groqJson = await groqResp.json();
                const content = String(groqJson?.choices?.[0]?.message?.content || '').trim();

                if (!content) {
                    return new Response(JSON.stringify({ success: false, error: 'Empty AI response' }), {
                        status: 502,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }

                return new Response(JSON.stringify({
                    success: true,
                    content,
                    model,
                    source: 'groq-worker'
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            } catch (e) {
                console.error('AI summary endpoint error:', e);
                return new Response(JSON.stringify({ success: false, error: 'Failed to generate AI summary' }), {
                    status: 500,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            }
        }

        // ═══ CALL HISTORY — Shared across all users ═══

        // POST /calls — Record a new call signal
        if (path === '/calls' && request.method === 'POST') {
            try {
                const authCheck = await requireSignedAuth(request, env, 'calls:write');
                if (!authCheck.ok) {
                    return new Response(JSON.stringify({ success: false, error: authCheck.error }), {
                        status: authCheck.status || 401,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }

                const clientIp = getClientIp(request);
                const deviceIdForRate = authCheck.identity.deviceId;

                const rlDevice = await checkRateLimit(
                    env,
                    `rl_calls_post_device_${deviceIdForRate}`,
                    CALLS_POST_RATE_LIMIT_PER_DEVICE,
                    CALLS_POST_RATE_WINDOW_SECONDS
                );
                if (!rlDevice.allowed) {
                    return new Response(JSON.stringify({ success: false, error: 'Rate limit exceeded' }), {
                        status: 429,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }

                const rlIp = await checkRateLimit(
                    env,
                    `rl_calls_post_ip_${clientIp}`,
                    CALLS_POST_RATE_LIMIT_PER_IP,
                    CALLS_POST_RATE_WINDOW_SECONDS
                );
                if (!rlIp.allowed) {
                    return new Response(JSON.stringify({ success: false, error: 'Rate limit exceeded' }), {
                        status: 429,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }

                const body = await request.json();
                const {
                    symbol,
                    direction,
                    confidence,
                    gates,
                    price,
                    name,
                    short: shortName,
                    img,
                    reason
                } = body;

                const safeSymbol = String(symbol || '').toUpperCase().trim();
                const safeDirection = String(direction || '').toUpperCase().trim();
                const safeConfidence = Number(confidence);

                // Validate required fields
                if (!safeSymbol || !safeDirection || confidence == null) {
                    return new Response(JSON.stringify({ success: false, error: 'Missing required fields' }), {
                        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }

                // Validate symbol and direction
                if (!/^[A-Z0-9]{4,20}$/.test(safeSymbol)) {
                    return new Response(JSON.stringify({ success: false, error: 'Invalid symbol' }), {
                        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }

                if (safeDirection !== 'LONG' && safeDirection !== 'SHORT') {
                    return new Response(JSON.stringify({ success: false, error: 'Invalid direction' }), {
                        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }

                if (!Number.isFinite(safeConfidence) || safeConfidence < 0 || safeConfidence > 100) {
                    return new Response(JSON.stringify({ success: false, error: 'Invalid confidence' }), {
                        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }

                const now = Date.now();
                const callPayload = {
                    id: now,
                    symbol: safeSymbol,
                    name: String(name || '').slice(0, 50),
                    short: String(shortName || safeSymbol.replace('USDT', '')).slice(0, 10),
                    img: String(img || '').slice(0, 200),
                    direction: safeDirection,
                    confidence: Math.round(safeConfidence),
                    gates: String(gates || '').slice(0, 20),
                    price: String(price || '').slice(0, 20),
                    reason: String(reason || '').slice(0, 180),
                    time: now,
                    deviceId: authCheck.identity.deviceId,
                    userId: authCheck.identity.userId || ''
                };

                if (!env.CALL_HISTORY_DO) {
                    // Graceful fallback: keep endpoint operational if DO binding is unavailable.
                    let calls = [];
                    if (env.CALENDAR_KV) {
                        calls = await env.CALENDAR_KV.get('shared_call_history_v2', 'json') || [];
                    }
                    if (!Array.isArray(calls)) calls = [];

                    const duplicate = calls.find((c) =>
                        c.symbol === safeSymbol &&
                        c.direction === safeDirection &&
                        (now - Number(c.time || 0)) < (30 * 60 * 1000)
                    );

                    if (duplicate) {
                        return new Response(JSON.stringify({ success: true, duplicate: true, message: 'Call already recorded', call: duplicate }), {
                            status: 200,
                            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                        });
                    }

                    calls.unshift(callPayload);
                    calls = calls.slice(0, 500);
                    if (env.CALENDAR_KV) {
                        await env.CALENDAR_KV.put('shared_call_history_v2', JSON.stringify(calls), {
                            expirationTtl: 30 * 24 * 60 * 60
                        });
                    }

                    return new Response(JSON.stringify({ success: true, duplicate: false, call: callPayload, source: 'kv-fallback' }), {
                        status: 200,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }

                const doId = env.CALL_HISTORY_DO.idFromName('global');
                const doStub = env.CALL_HISTORY_DO.get(doId);
                const inboundIdempotencyKey = String(request.headers.get('Idempotency-Key') || '').trim();

                const forwardHeaders = {
                    'Content-Type': 'application/json',
                    'X-Device-Id': authCheck.identity.deviceId,
                    'X-User-Id': authCheck.identity.userId || ''
                };
                if (inboundIdempotencyKey) {
                    forwardHeaders['Idempotency-Key'] = inboundIdempotencyKey;
                }

                const doResp = await doStub.fetch('https://call-history.internal/calls', {
                    method: 'POST',
                    headers: forwardHeaders,
                    body: JSON.stringify(callPayload)
                });

                if (doResp.status === 503) {
                    let calls = [];
                    if (env.CALENDAR_KV) {
                        calls = await env.CALENDAR_KV.get('shared_call_history_v2', 'json') || [];
                    }
                    if (!Array.isArray(calls)) calls = [];

                    const duplicate = calls.find((c) =>
                        c.symbol === safeSymbol &&
                        c.direction === safeDirection &&
                        (now - Number(c.time || 0)) < (30 * 60 * 1000)
                    );

                    if (duplicate) {
                        return new Response(JSON.stringify({ success: true, duplicate: true, message: 'Call already recorded', call: duplicate, source: 'kv-fallback-do-503' }), {
                            status: 200,
                            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                        });
                    }

                    calls.unshift(callPayload);
                    calls = calls.slice(0, 500);
                    if (env.CALENDAR_KV) {
                        await env.CALENDAR_KV.put('shared_call_history_v2', JSON.stringify(calls), {
                            expirationTtl: 30 * 24 * 60 * 60
                        });
                    }

                    return new Response(JSON.stringify({ success: true, duplicate: false, call: callPayload, source: 'kv-fallback-do-503' }), {
                        status: 200,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }

                const doText = await doResp.text();
                return new Response(doText, {
                    status: doResp.status,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            } catch (e) {
                console.error('Calls POST error:', e);
                return new Response(JSON.stringify({ success: false, error: 'Failed to record call' }), {
                    status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            }
        }

        // GET /calls — Fetch shared call history
        if (path === '/calls' && request.method === 'GET') {
            try {
                const clientIp = getClientIp(request);
                const rl = await checkRateLimit(env, `rl_calls_get_${clientIp}`, 120, 60);
                if (!rl.allowed) {
                    return new Response(JSON.stringify({ success: false, error: 'Rate limit exceeded' }), {
                        status: 429,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }

                const filterDir = String(url.searchParams.get('direction') || '').toUpperCase();
                const requestedLimit = parseInt(url.searchParams.get('limit') || '100', 10);
                const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 500) : 100;

                if (env.CALENDAR_KV) {
                    try {
                        let cachedCalls = await env.CALENDAR_KV.get('shared_call_history_v2', 'json');
                        if (Array.isArray(cachedCalls)) {
                            if (filterDir === 'LONG' || filterDir === 'SHORT') {
                                cachedCalls = cachedCalls.filter((c) => c.direction === filterDir);
                            }
                            cachedCalls = cachedCalls.slice(0, limit);
                            return new Response(JSON.stringify({ success: true, calls: cachedCalls, total: cachedCalls.length, source: 'kv' }), {
                                status: 200,
                                headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=30' },
                            });
                        }
                    } catch (kvErr) {
                        console.warn('Calls GET KV read failed:', kvErr && kvErr.message ? kvErr.message : kvErr);
                    }
                }

                if (!env.CALL_HISTORY_DO) {
                    return new Response(JSON.stringify({ success: true, calls: [], total: 0, source: 'no-do' }), {
                        status: 200,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=30' },
                    });
                }

                const doId = env.CALL_HISTORY_DO.idFromName('global');
                const doStub = env.CALL_HISTORY_DO.get(doId);
                const doResp = await doStub.fetch(`https://call-history.internal/calls${url.search}`, {
                    method: 'GET'
                });
                const doText = await doResp.text();

                return new Response(doText, {
                    status: doResp.status,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' },
                });
            } catch (e) {
                console.error('Calls GET error:', e);
                return new Response(JSON.stringify({ success: false, error: 'Failed to fetch calls' }), {
                    status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            }
        }

        // GET /health - Status check
        if (path === '/health') {
            return new Response(JSON.stringify({
                status: 'ok',
                version: '1.0.0',
                timestamp: new Date().toISOString(),
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // ==========================================
        // PROXY REVERSO COM CACHE CDN (Custo zero e infinitos usuários)
        // ==========================================
        
        // Proxy para o FMP
        if (path.startsWith('/proxy/fmp/')) {
            const FMP_KEY_TO_USE = FMP_API_KEY || ''; // Set via Cloudflare Worker secret
            const targetUrl = new URL(url.toString().replace(url.origin + '/proxy/fmp/', 'https://financialmodelingprep.com/'));
            targetUrl.searchParams.set('apikey', FMP_KEY_TO_USE);
            
            try {
                const proxyReq = new Request(targetUrl, { method: request.method, } );
                const res = await fetch(proxyReq);
                const clone = new Response(res.body, res);
                clone.headers.set('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
                clone.headers.set('Vary', 'Origin');
                // Força o cache do Cloudflare por 6 minutos (360s) para driblar limite diário do FMP
                if(res.ok) clone.headers.set('Cache-Control', 'public, max-age=360, s-maxage=360'); 
                return clone;
            } catch (err) {
                return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
            }
        }

        // Proxy para o FRED
        if (path.startsWith('/proxy/fred/')) {
            //  || 'bea57f400390b78a3bb3d7622c7eb591'; // Fallback
            const targetUrl = new URL(url.toString().replace(url.origin + '/proxy/fred/', 'https://api.stlouisfed.org/')); if(url.searchParams.get('test_debug')) return new Response(targetUrl.toString());
            targetUrl.searchParams.set('api_key', FRED_API_KEY || ''); // Set via Cloudflare Worker secret

            
            try {
                const proxyReq = new Request(targetUrl, { method: request.method, } );
                const res = await fetch(proxyReq);
                const clone = new Response(res.body, res);
                clone.headers.set('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
                clone.headers.set('Vary', 'Origin');
                // Macro dados mudam pouco. Cache de 1 hora
                if(res.ok) clone.headers.set('Cache-Control', 'public, max-age=3600, s-maxage=3600'); 
                return clone;
            } catch (err) {
                return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
            }
        }

        // Proxy para o GROQ (desativado para evitar abuso de chave)
        if (path.startsWith('/proxy/groq/')) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Groq proxy disabled. Use POST /ai-summary with signed short-lived token.'
            }), {
                status: 403,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        return new Response('Not Found', { status: 404, headers: corsHeaders });
    },

    // Cron trigger handler - roda a cada 5 minutos
    // Liquidações: acumula a cada execução (5min)
    // Calendário: atualiza a cada 3 horas (verifica lastUpdate)
    async scheduled(event, env, ctx) {
        console.log('Cron triggered:', new Date().toISOString());
        const FMP_API_KEY = getSecret(env, 'FMP_API_KEY');
        const FRED_API_KEY = getSecret(env, 'FRED_API_KEY');

        // ─── CALENDÁRIO: só atualiza a cada 3 horas ───
        try {
            let shouldRefreshCalendar = true;
            if (env.CALENDAR_KV) {
                const cached = await env.CALENDAR_KV.get(CACHE_KEY_CALENDAR, 'json');
                if (cached && cached.lastUpdate) {
                    const elapsed = Date.now() - new Date(cached.lastUpdate).getTime();
                    if (elapsed < 3 * 60 * 60 * 1000) { // 3 horas
                        shouldRefreshCalendar = false;
                    }
                }
            }

            if (shouldRefreshCalendar) {
                const events = await buildCalendar(FMP_API_KEY);
                const now = new Date();
                if (env.CALENDAR_KV) {
                    await env.CALENDAR_KV.put(
                        CACHE_KEY_CALENDAR,
                        JSON.stringify({
                            events,
                            lastUpdate: now.toISOString(),
                            nextUpdate: new Date(now.getTime() + CACHE_TTL_SECONDS * 1000).toISOString(),
                        }),
                        { expirationTtl: CACHE_TTL_SECONDS }
                    );
                }
                const seriesIds = [...new Set(events.map(e => e.fredSeriesId).filter(Boolean))];
                for (let i = 0; i < seriesIds.length; i += 4) {
                    const batch = seriesIds.slice(i, i + 4);
                    const results = await Promise.all(
                        batch.map(id => fetchHistoryFromFRED(id, 12, FRED_API_KEY))
                    );
                    if (env.CALENDAR_KV) {
                        await Promise.all(batch.map((id, idx) =>
                            env.CALENDAR_KV.put(
                                `history_${id}`,
                                JSON.stringify(results[idx]),
                                { expirationTtl: 24 * 60 * 60 }
                            )
                        ));
                    }
                }
                console.log(`Calendar refreshed: ${events.length} events, ${seriesIds.length} history series`);
            }
        } catch (e) {
            console.error('Cron error (calendar):', e);
        }

        // ─── LIQUIDAÇÕES: acumula a cada execução (5 min) ───
        // Escalável: KV compartilhado entre todos os usuários
        try {
            // Símbolos base + símbolos dinâmicos adicionados por requisições de usuários
            const baseSymbols = [
                'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT',
                'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'DOTUSDT', 'LINKUSDT',
                'MATICUSDT', 'LTCUSDT', 'UNIUSDT', 'ATOMUSDT', 'NEARUSDT'
            ];

            // Carregar símbolos dinâmicos (adicionados por requisições de usuários)
            let dynamicSymbols = [];
            if (env.CALENDAR_KV) {
                const dynData = await env.CALENDAR_KV.get('liq_tracked_symbols', 'json');
                if (dynData && Array.isArray(dynData.symbols)) {
                    dynamicSymbols = dynData.symbols;
                }
            }

            const allSymbols = [...new Set([...baseSymbols, ...dynamicSymbols])];
            let accumulated = 0;

            for (const sym of allSymbols) {
                try {
                    const binRes = await fetch(`https://fapi.binance.com/fapi/v1/allForceOrders?symbol=${sym}&limit=1000`);
                    if (!binRes.ok) continue;
                    const orders = await binRes.json();
                    if (!Array.isArray(orders) || orders.length === 0) continue;

                    const now = Date.now();
                    const window12h = 12 * 60 * 60 * 1000;
                    const accumKey = `liq_accum_${sym}`;
                    let existing = null;
                    if (env.CALENDAR_KV) {
                        existing = await env.CALENDAR_KV.get(accumKey, 'json');
                    }
                    const existingOrders = (existing && Array.isArray(existing.orders)) ? existing.orders : [];

                    const orderMap = new Map();
                    [...existingOrders, ...orders].forEach(o => {
                        const key = `${o.time}_${o.price}_${o.side}`;
                        if (!orderMap.has(key)) orderMap.set(key, o);
                    });
                    const merged = [...orderMap.values()].filter(o => now - parseInt(o.time || 0) < window12h);

                    if (env.CALENDAR_KV) {
                        await env.CALENDAR_KV.put(accumKey, JSON.stringify({
                            orders: merged.slice(0, 5000),
                            ts: now
                        }), { expirationTtl: 43200 });
                    }
                    accumulated++;
                } catch (symErr) {
                    console.warn(`Liq accumulate ${sym}:`, symErr.message);
                }
            }
            console.log(`Liquidation accumulation: ${accumulated}/${allSymbols.length} symbols`);
        } catch (e) {
            console.error('Cron error (liquidations):', e);
        }
    },
};


