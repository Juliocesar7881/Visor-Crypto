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
const CALL_HISTORY_STORAGE_VERSION = 'v3';
const SHARED_CALL_HISTORY_KEY = `shared_call_history_${CALL_HISTORY_STORAGE_VERSION}`;
const CALL_HISTORY_DO_KEY = `calls_${CALL_HISTORY_STORAGE_VERSION}`;
const SIGNAL_STRATEGY_VERSION = 'S3';
const SIGNALS_SNAPSHOT_KEY = 'signals_snapshot_v1';
const SIGNALS_SNAPSHOT_TTL_SECONDS = 6 * 60;
const MARKET_MACRO_QUOTES_KEY = 'market_macro_quotes_v1';
const MARKET_GLOBAL_KEY = 'market_global_v1';
const MARKET_ALTSEASON_KEY = 'market_altseason_v3';
const MARKET_FEAR_GREED_KEY = 'market_fear_greed_v2';
const MARKET_NEWS_KEY = 'market_news_v1';
const MARKET_FEDWATCH_KEY_PREFIX = 'market_fedwatch_polymarket_v1_';
const MARKET_FRESH_SECONDS = 5 * 60;
const MARKET_STALE_SECONDS = 3 * 60 * 60;
const FEDWATCH_FRESH_SECONDS = 5 * 60;
const FEDWATCH_STALE_SECONDS = 24 * 60 * 60;
const NEWS_FRESH_SECONDS = 4 * 60;
const NEWS_STALE_SECONDS = 45 * 60;
const BTC_DOMINANCE_ADJUSTMENT = 2.1;
const FEAR_GREED_DISPLAY_ADJUSTMENT = 1;
const NOTIF_TOKEN_PREFIX = 'notif_token_';
const NOTIF_PREF_PREFIX = 'notif_prefs_';
const NOTIF_DEDUP_PREFIX = 'notif_dedup_';
const NOTIF_DEDUP_SECONDS = 30 * 60;
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
const APP_SIGNAL_SYMBOLS = new Set([
    'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT',
    'ADAUSDT', 'AVAXUSDT', 'DOGEUSDT', 'SHIBUSDT', 'PEPEUSDT',
    'LINKUSDT', 'UNIUSDT', 'AAVEUSDT', 'DOTUSDT', 'LTCUSDT',
    'ATOMUSDT', 'NEARUSDT', 'RENDERUSDT', 'FETUSDT', 'ZECUSDT',
    'BCHUSDT', 'SUIUSDT'
]);
let AUTH_SECRET_CACHE = globalThis.__visorAuthSecretCache || '';

function normalizeAllowedSignalSymbol(raw) {
    const cleaned = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const symbol = cleaned.endsWith('USDT') ? cleaned : `${cleaned}USDT`;
    return APP_SIGNAL_SYMBOLS.has(symbol) ? symbol : '';
}

function filterAllowedCalls(calls) {
    return Array.isArray(calls)
        ? calls.filter((call) => !!normalizeAllowedSignalSymbol(call?.symbol))
        : [];
}

function normalizeSignalDirection(raw) {
    const value = String(raw || '').toUpperCase();
    if (value.includes('LONG')) return 'LONG';
    if (value.includes('SHORT')) return 'SHORT';
    return 'NEUTRO';
}

function clampPercent(value, fallback = 0) {
    const n = Number(value);
    if (!Number.isFinite(n)) return Math.max(0, Math.min(100, Math.round(fallback || 0)));
    return Math.max(0, Math.min(100, Math.round(n)));
}

function normalizeNotificationPrefs(rawPrefs = {}) {
    const symbols = Array.isArray(rawPrefs.symbols)
        ? rawPrefs.symbols.map(normalizeAllowedSignalSymbol).filter(Boolean)
        : [];
    const perSymbol = rawPrefs.perSymbol && typeof rawPrefs.perSymbol === 'object'
        ? rawPrefs.perSymbol
        : {};
    return {
        enabled: rawPrefs.enabled === true,
        confidenceThreshold: Math.max(70, Math.min(100, Number(rawPrefs.confidenceThreshold || rawPrefs.confidence_threshold || 70) || 70)),
        symbols: [...new Set(symbols)],
        perSymbol,
        updatedAt: Date.now()
    };
}

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

let FCM_ACCESS_TOKEN_CACHE = globalThis.__visorFcmAccessTokenCache || { token: '', expiresAt: 0 };

function pemPrivateKeyToArrayBuffer(pem) {
    const normalized = String(pem || '')
        .replace(/\\n/g, '\n')
        .replace('-----BEGIN PRIVATE KEY-----', '')
        .replace('-----END PRIVATE KEY-----', '')
        .replace(/\s+/g, '');
    const binary = atob(normalized);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
}

async function signServiceAccountJwt(env) {
    const clientEmail = getSecret(env, 'FCM_CLIENT_EMAIL');
    const privateKey = getSecret(env, 'FCM_PRIVATE_KEY');
    if (!clientEmail || !privateKey) return '';

    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', typ: 'JWT' };
    const payload = {
        iss: clientEmail,
        scope: 'https://www.googleapis.com/auth/firebase.messaging',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600
    };
    const signingInput = `${base64UrlEncodeString(JSON.stringify(header))}.${base64UrlEncodeString(JSON.stringify(payload))}`;
    const key = await crypto.subtle.importKey(
        'pkcs8',
        pemPrivateKeyToArrayBuffer(privateKey),
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encodeUtf8(signingInput));
    return `${signingInput}.${base64UrlEncodeBytes(new Uint8Array(signature))}`;
}

async function getFcmAccessToken(env) {
    const now = Date.now();
    if (FCM_ACCESS_TOKEN_CACHE.token && FCM_ACCESS_TOKEN_CACHE.expiresAt > now + 60_000) {
        return FCM_ACCESS_TOKEN_CACHE.token;
    }

    const assertion = await signServiceAccountJwt(env);
    if (!assertion) return '';

    const resp = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion
        }).toString()
    });
    if (!resp.ok) return '';

    const data = await resp.json();
    const token = String(data?.access_token || '');
    if (!token) return '';

    FCM_ACCESS_TOKEN_CACHE = {
        token,
        expiresAt: now + Math.max(60, Number(data?.expires_in || 3600) - 60) * 1000
    };
    globalThis.__visorFcmAccessTokenCache = FCM_ACCESS_TOKEN_CACHE;
    return token;
}

async function sendFcmSignal(env, token, signal) {
    const projectId = getSecret(env, 'FCM_PROJECT_ID');
    const accessToken = await getFcmAccessToken(env);
    if (!projectId || !accessToken || !token) {
        return { ok: false, status: 503, error: 'FCM not configured' };
    }
    const ts = Number(signal.ts || Date.now()) || Date.now();
    const direction = normalizeSignalDirection(signal.finalDirection || signal.direction || signal.signal);
    const confidence = clampPercent(signal.finalConfidence || signal.confidence);
    const snapshotId = String(signal.snapshotId || `${signal.symbol}_${direction}_${Math.floor(ts / 1800000)}`);
    const expiresAt = Number(signal.expiresAt || (ts + 30 * 60 * 1000)) || (ts + 30 * 60 * 1000);

    const data = {
        type: 'signal',
        symbol: String(signal.symbol || ''),
        short: String(signal.short || String(signal.symbol || '').replace('USDT', '')),
        direction,
        finalDirection: direction,
        confidence: String(confidence),
        finalConfidence: String(confidence),
        price: String(signal.price || ''),
        reason: String(signal.reason || '').slice(0, 180),
        ts: String(ts),
        notifiedAt: String(ts),
        expiresAt: String(expiresAt),
        snapshotId,
        notificationId: String(signal.notificationId || Math.abs(`${signal.symbol}_${direction}_${Math.floor(ts / 1800000)}`.split('').reduce((a, c) => ((a << 5) - a) + c.charCodeAt(0), 0)))
    };

    const resp = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
            message: {
                token,
                data,
                android: {
                    priority: 'HIGH'
                }
            }
        })
    });

    return { ok: resp.ok, status: resp.status, body: resp.ok ? '' : await resp.text().catch(() => '') };
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

function ema(values, period) {
    if (!Array.isArray(values) || values.length < period) return 0;
    const k = 2 / (period + 1);
    let out = values.slice(0, period).reduce((sum, v) => sum + Number(v || 0), 0) / period;
    for (let i = period; i < values.length; i++) out = Number(values[i] || 0) * k + out * (1 - k);
    return out;
}

function rsi(values, period = 14) {
    if (!Array.isArray(values) || values.length <= period) return 50;
    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
        const diff = Number(values[i] || 0) - Number(values[i - 1] || 0);
        if (diff >= 0) gains += diff;
        else losses -= diff;
    }
    let avgGain = gains / period;
    let avgLoss = losses / period;
    for (let i = period + 1; i < values.length; i++) {
        const diff = Number(values[i] || 0) - Number(values[i - 1] || 0);
        avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
        avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
    }
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
}

function avg(values) {
    if (!Array.isArray(values) || values.length === 0) return 0;
    return values.reduce((sum, v) => sum + Number(v || 0), 0) / values.length;
}

async function analyzeSignalSymbol(symbol) {
    const [klinesResp, tickerResp, fundingResp] = await Promise.allSettled([
        fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=15m&limit=120`, { cf: { cacheTtl: 60 } }),
        fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`, { cf: { cacheTtl: 60 } }),
        fetch(`https://fapi.binance.com/fapi/v1/fundingRate?symbol=${symbol}&limit=1`, { cf: { cacheTtl: 60 } })
    ]);

    if (klinesResp.status !== 'fulfilled' || !klinesResp.value.ok || tickerResp.status !== 'fulfilled' || !tickerResp.value.ok) {
        return null;
    }

    const klines = await klinesResp.value.json();
    const ticker = await tickerResp.value.json();
    if (!Array.isArray(klines) || klines.length < 50) return null;

    const closes = klines.map((k) => Number(k[4] || 0)).filter((v) => Number.isFinite(v) && v > 0);
    const volumes = klines.map((k) => Number(k[5] || 0)).filter((v) => Number.isFinite(v) && v >= 0);
    const currentPrice = Number(ticker?.lastPrice || closes[closes.length - 1] || 0) || 0;
    if (currentPrice <= 0) return null;

    const ema9 = ema(closes, 9);
    const ema21 = ema(closes, 21);
    const ema50 = ema(closes, 50);
    const rsi14 = rsi(closes, 14);
    const avgVol20 = avg(volumes.slice(-21, -1));
    const lastVol = volumes[volumes.length - 1] || 0;
    const volumeRatio = avgVol20 > 0 ? lastVol / avgVol20 : 1;
    const change24h = Number(ticker?.priceChangePercent || 0) || 0;
    let fundingRate = 0;

    if (fundingResp.status === 'fulfilled' && fundingResp.value.ok) {
        try {
            const funding = await fundingResp.value.json();
            if (Array.isArray(funding) && funding[0]) fundingRate = Number(funding[0].fundingRate || 0) || 0;
        } catch (_) {}
    }

    let longScore = 0;
    let shortScore = 0;
    let longConfirmations = 0;
    let shortConfirmations = 0;
    const reasons = [];
    const lastKline = klines[klines.length - 1] || [];
    const lastOpen = Number(lastKline[1] || 0) || currentPrice;
    const candleUp = currentPrice >= lastOpen;
    const candleDown = currentPrice <= lastOpen;
    const emaAlignedLong = currentPrice > ema9 && ema9 > ema21 && ema21 > ema50;
    const emaAlignedShort = currentPrice < ema9 && ema9 < ema21 && ema21 < ema50;
    const strongVolume = volumeRatio > 1.45;
    const alignedVolumeLong = strongVolume && candleUp && change24h > -1;
    const alignedVolumeShort = strongVolume && candleDown && change24h < 1;

    if (emaAlignedLong) {
        longScore += 22;
        longConfirmations++;
        reasons.push('EMAs alinhadas para alta');
    } else if (emaAlignedShort) {
        shortScore += 22;
        shortConfirmations++;
        reasons.push('EMAs alinhadas para baixa');
    }

    if (rsi14 < 30) {
        longScore += 18;
        longConfirmations++;
        reasons.push('RSI sobrevendido');
    } else if (rsi14 < 38) {
        longScore += 8;
    } else if (rsi14 > 70) {
        shortScore += 18;
        shortConfirmations++;
        reasons.push('RSI sobrecomprado');
    } else if (rsi14 > 62) {
        shortScore += 8;
    }

    if (currentPrice > ema21) longScore += 8; else shortScore += 8;
    if (currentPrice > ema50) longScore += 8; else shortScore += 8;
    if (alignedVolumeLong) {
        longScore += 14;
        longConfirmations++;
        reasons.push(`volume ${volumeRatio.toFixed(1)}x alta`);
    } else if (alignedVolumeShort) {
        shortScore += 14;
        shortConfirmations++;
        reasons.push(`volume ${volumeRatio.toFixed(1)}x baixa`);
    } else if (strongVolume) {
        longScore += 4;
        shortScore += 4;
        reasons.push(`volume ${volumeRatio.toFixed(1)}x`);
    }
    if (change24h > 3) {
        longScore += 12;
        longConfirmations++;
    } else if (change24h > 1.5) {
        longScore += 6;
    } else if (change24h < -3) {
        shortScore += 12;
        shortConfirmations++;
    } else if (change24h < -1.5) {
        shortScore += 6;
    }
    if (fundingRate > 0.0005) {
        shortScore += 8;
        shortConfirmations++;
    } else if (fundingRate < -0.0005) {
        longScore += 8;
        longConfirmations++;
    }

    const direction = longScore > shortScore ? 'LONG' : shortScore > longScore ? 'SHORT' : 'NEUTRO';
    const rawScore = Math.max(longScore, shortScore);
    const spread = Math.abs(longScore - shortScore);
    const confirmations = direction === 'LONG' ? longConfirmations : shortConfirmations;
    const hasAlignedVolume = direction === 'LONG' ? alignedVolumeLong : alignedVolumeShort;
    const hasAcceleration = hasAlignedVolume || Math.abs(change24h) >= 3 || Math.abs(fundingRate) >= 0.0005 || (direction === 'LONG' ? rsi14 < 30 : rsi14 > 70);
    const rsiContradiction = (direction === 'LONG' && rsi14 > 68) || (direction === 'SHORT' && rsi14 < 32);
    const qualityOk = (
        direction !== 'NEUTRO' &&
        rawScore >= 58 &&
        spread >= 16 &&
        confirmations >= 2 &&
        hasAcceleration &&
        !rsiContradiction
    );
    let confidence = clampPercent(Math.round(rawScore * 0.86 + spread * 0.42 + confirmations * 4), 0);
    if (!hasAlignedVolume) confidence = Math.min(confidence, 84);
    if (confirmations < 3) confidence = Math.min(confidence, 82);
    if (!qualityOk) confidence = Math.min(confidence, 64);
    const finalDirection = qualityOk && confidence >= 70 ? direction : 'NEUTRO';

    return {
        symbol,
        short: symbol.replace('USDT', ''),
        signal: finalDirection,
        direction: finalDirection,
        finalDirection,
        confidence,
        finalConfidence: confidence,
        price: Number(currentPrice.toFixed(currentPrice >= 1 ? 4 : 8)),
        reason: reasons.slice(0, 3).join(' | ') || 'Snapshot tecnico 15m',
        gates: `${Math.round(rawScore)}`,
        longPoints: longScore,
        shortPoints: shortScore,
        directionalSpread: spread,
        lastScanAt: Date.now(),
        source: 'worker_snapshot'
    };
}

async function buildSignalsSnapshot(env, persist = true) {
    const symbols = [...APP_SIGNAL_SYMBOLS];
    const results = {};
    const batchSize = 5;
    for (let i = 0; i < symbols.length; i += batchSize) {
        const batch = symbols.slice(i, i + batchSize);
        const settled = await Promise.allSettled(batch.map((symbol) => analyzeSignalSymbol(symbol)));
        settled.forEach((item, idx) => {
            if (item.status === 'fulfilled' && item.value) {
                results[batch[idx]] = item.value;
            }
        });
    }

    const snapshot = {
        success: true,
        updatedAt: Date.now(),
        ttl: SIGNALS_SNAPSHOT_TTL_SECONDS,
        results
    };
    if (persist && env?.CALENDAR_KV) {
        await env.CALENDAR_KV.put(SIGNALS_SNAPSHOT_KEY, JSON.stringify(snapshot), {
            expirationTtl: SIGNALS_SNAPSHOT_TTL_SECONDS
        });
    }
    return snapshot;
}

async function listNotificationDevices(env) {
    if (!env?.CALENDAR_KV) return [];
    const devices = [];
    let cursor;
    do {
        const listed = await env.CALENDAR_KV.list({ prefix: NOTIF_TOKEN_PREFIX, cursor });
        cursor = listed.cursor;
        for (const key of listed.keys || []) {
            const item = await env.CALENDAR_KV.get(key.name, 'json');
            if (item && item.token && item.deviceId) devices.push(item);
        }
    } while (cursor);
    return devices;
}

async function getNotificationPrefs(env, deviceId) {
    if (!env?.CALENDAR_KV || !deviceId) return normalizeNotificationPrefs({});
    const prefs = await env.CALENDAR_KV.get(`${NOTIF_PREF_PREFIX}${deviceId}`, 'json');
    return normalizeNotificationPrefs(prefs || {});
}

async function recordSharedCallFromWorker(env, call, identity = {}) {
    const safeSymbol = normalizeAllowedSignalSymbol(call?.symbol);
    const safeDirection = normalizeSignalDirection(call?.direction);
    const safeConfidence = clampPercent(call?.confidence);
    if (!safeSymbol || (safeDirection !== 'LONG' && safeDirection !== 'SHORT') || safeConfidence < 50) return false;

    const payload = {
        id: Number(call.ts || Date.now()) || Date.now(),
        symbol: safeSymbol,
        name: String(call.name || '').slice(0, 50),
        short: String(call.short || safeSymbol.replace('USDT', '')).slice(0, 10),
        img: '',
        direction: safeDirection,
        confidence: safeConfidence,
        gates: String(call.gates || 'SNAPSHOT').slice(0, 20),
        price: String(call.price || '').slice(0, 20),
        reason: `${SIGNAL_STRATEGY_VERSION} | ${String(call.reason || 'Worker snapshot')}`.slice(0, 180),
        time: Number(call.ts || Date.now()) || Date.now(),
        userId: String(identity.userId || '').slice(0, 64)
    };

    if (env?.CALL_HISTORY_DO) {
        const doId = env.CALL_HISTORY_DO.idFromName('global');
        const doStub = env.CALL_HISTORY_DO.get(doId);
        const resp = await doStub.fetch('https://call-history.internal/calls', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Device-Id': identity.deviceId || 'worker_snapshot',
                'X-User-Id': identity.userId || '',
                'Idempotency-Key': `worker:${safeSymbol}:${safeDirection}:${Math.floor(payload.time / NOTIF_DEDUP_SECONDS / 1000)}`
            },
            body: JSON.stringify(payload)
        });
        return resp.ok;
    }

    if (env?.CALENDAR_KV) {
        let calls = filterAllowedCalls(await env.CALENDAR_KV.get(SHARED_CALL_HISTORY_KEY, 'json'));
        if (!Array.isArray(calls)) calls = [];
        const duplicate = calls.find((c) =>
            c.symbol === safeSymbol &&
            c.direction === safeDirection &&
            (Date.now() - Number(c.time || 0)) < NOTIF_DEDUP_SECONDS * 1000
        );
        if (duplicate) return true;
        calls.unshift({ ...payload, deviceId: identity.deviceId || 'worker_snapshot' });
        calls = calls.slice(0, 500);
        await env.CALENDAR_KV.put(SHARED_CALL_HISTORY_KEY, JSON.stringify(calls), {
            expirationTtl: 30 * 24 * 60 * 60
        });
        return true;
    }
    return false;
}

async function dispatchSignalPushes(env, snapshot) {
    if (!snapshot?.results || !env?.CALENDAR_KV) return { sent: 0, skipped: 0 };
    const devices = await listNotificationDevices(env);
    let sent = 0;
    let skipped = 0;
    const now = Date.now();

    for (const device of devices) {
        const prefs = await getNotificationPrefs(env, device.deviceId);
        if (!prefs.enabled || !device.token) {
            skipped++;
            continue;
        }

        for (const symbol of prefs.symbols) {
            const signal = snapshot.results[symbol];
            if (!signal) continue;
            const direction = normalizeSignalDirection(signal.direction || signal.signal);
            const confidence = clampPercent(signal.confidence);
            const symbolCfg = prefs.perSymbol?.[symbol] || {};
            const minConfidence = Math.max(70, Number(symbolCfg.minConfidence || symbolCfg.confidence || prefs.confidenceThreshold || 70) || 70);
            if (direction === 'NEUTRO' || confidence < minConfidence) continue;

            const dedupKey = `${NOTIF_DEDUP_PREFIX}${device.deviceId}_${symbol}_${direction}`;
            const dedup = await env.CALENDAR_KV.get(dedupKey, 'json');
            if (dedup && (now - Number(dedup.ts || 0)) < NOTIF_DEDUP_SECONDS * 1000) {
                skipped++;
                continue;
            }

            const pushPayload = {
                ...signal,
                symbol,
                direction,
                finalDirection: direction,
                confidence,
                finalConfidence: confidence,
                ts: now,
                notifiedAt: now,
                expiresAt: now + (NOTIF_DEDUP_SECONDS * 1000),
                snapshotId: `${symbol}_${direction}_${Math.floor(now / (NOTIF_DEDUP_SECONDS * 1000))}`,
                notificationId: Math.abs(`${device.deviceId}_${symbol}_${direction}_${Math.floor(now / (NOTIF_DEDUP_SECONDS * 1000))}`.split('').reduce((acc, ch) => ((acc << 5) - acc) + ch.charCodeAt(0), 0))
            };
            const result = await sendFcmSignal(env, device.token, pushPayload);
            if (result.ok) {
                sent++;
                await env.CALENDAR_KV.put(dedupKey, JSON.stringify({ ts: now }), {
                    expirationTtl: NOTIF_DEDUP_SECONDS
                });
                await recordSharedCallFromWorker(env, pushPayload, {
                    deviceId: device.deviceId,
                    userId: device.userId || ''
                }).catch(() => false);
            } else {
                skipped++;
            }
        }
    }

    return { sent, skipped };
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

function isFedSpeechTitle(rawTitle) {
    const lower = String(rawTitle || '').toLowerCase();
    if (!lower) return false;
    const hasFedContext = (
        lower.includes('fomc member') ||
        lower.includes('fed chair') ||
        lower.includes('fed governor') ||
        lower.includes('federal reserve governor') ||
        lower.includes('federal reserve bank') ||
        lower.includes('federal reserve') ||
        lower.includes('discurso fed') ||
        lower.includes('discurso powell')
    );
    const hasSpeechAction = (
        lower.includes('speaks') ||
        lower.includes('speech') ||
        lower.includes('remarks') ||
        lower.includes('testifies') ||
        lower.includes('testimony') ||
        lower.includes('discurso')
    );
    const isDecisionEvent = (
        lower.includes('interest rate decision') ||
        lower.includes('federal funds rate') ||
        lower.includes('fed rate decision') ||
        lower.includes('fomc statement') ||
        lower.includes('fomc minutes') ||
        lower.includes('press conference')
    );
    return hasFedContext && hasSpeechAction && !isDecisionEvent;
}

function isHighImpactUS(event) {
    const name = (event.event || '').toLowerCase();
    const country = (event.country || '').toLowerCase();
    const isUS = country.includes('us') || country.includes('united states');
    if (!isUS) return false;
    if (isFedSpeechTitle(name)) return false;

    // FMP impact field
    if (event.impact === 'High') return true;

    // Check against our keyword list
    return HIGH_IMPACT_EVENTS.some(keyword => name.includes(keyword));
}

function getEventCategory(name) {
    const lower = name.toLowerCase();
    if (isFedSpeechTitle(lower)) return 'fed_speech';
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

function jsonResponse(data, corsHeaders, status = 200, extraHeaders = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            ...corsHeaders,
            ...extraHeaders,
            'Content-Type': 'application/json',
        },
    });
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 5000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } finally {
        clearTimeout(timer);
    }
}

async function fetchTextWithTimeout(url, options = {}, timeoutMs = 5000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.text();
    } finally {
        clearTimeout(timer);
    }
}

async function readMarketCache(env, key) {
    if (!env?.CALENDAR_KV) return null;
    try {
        const cached = await env.CALENDAR_KV.get(key, 'json');
        return cached && typeof cached === 'object' ? cached : null;
    } catch (_) {
        return null;
    }
}

async function writeMarketCache(env, key, payload, ttlSeconds) {
    if (!env?.CALENDAR_KV || !payload || typeof payload !== 'object') return false;
    try {
        await env.CALENDAR_KV.put(key, JSON.stringify(payload), { expirationTtl: ttlSeconds });
        return true;
    } catch (_) {
        return false;
    }
}

function withMarketCacheMeta(payload, stale) {
    return {
        ...payload,
        success: payload?.success !== false,
        stale: !!stale,
        cacheAgeMs: payload?.updatedAt ? Math.max(0, Date.now() - Number(payload.updatedAt)) : null,
    };
}

async function serveCachedMarketPayload(env, ctx, corsHeaders, config) {
    const cached = await readMarketCache(env, config.key);
    const now = Date.now();
    const cachedAgeMs = cached?.updatedAt ? now - Number(cached.updatedAt) : Infinity;
    const freshMs = config.freshSeconds * 1000;
    const staleMs = config.staleSeconds * 1000;

    if (cached && cachedAgeMs >= 0 && cachedAgeMs <= freshMs) {
        return jsonResponse(withMarketCacheMeta(cached, false), corsHeaders, 200, config.headers);
    }

    if (cached && cachedAgeMs >= 0 && cachedAgeMs <= staleMs) {
        if (ctx?.waitUntil) {
            ctx.waitUntil(
                config.builder()
                    .then((fresh) => writeMarketCache(env, config.key, fresh, config.staleSeconds))
                    .catch(() => {})
            );
        }
        return jsonResponse(withMarketCacheMeta(cached, true), corsHeaders, 200, config.headers);
    }

    try {
        const fresh = await config.builder();
        await writeMarketCache(env, config.key, fresh, config.staleSeconds);
        return jsonResponse(withMarketCacheMeta(fresh, false), corsHeaders, 200, config.headers);
    } catch (e) {
        if (cached) {
            return jsonResponse(withMarketCacheMeta(cached, true), corsHeaders, 200, config.headers);
        }
        return jsonResponse({
            success: false,
            error: config.error || 'Market data unavailable',
            updatedAt: null,
            stale: false,
            source: config.source || 'unavailable',
        }, corsHeaders, 503, config.headers);
    }
}

function parsePolymarketArray(value) {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string') return [];
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
        return [];
    }
}

function toFiniteMarketNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const num = Number(String(value).replace(',', '.'));
    return Number.isFinite(num) ? num : null;
}

function normalizeMarketProbability(value) {
    const num = toFiniteMarketNumber(value);
    if (num === null || num < 0) return null;
    if (num <= 1) return num * 100;
    if (num <= 100) return num;
    return null;
}

function extractPolymarketYesProbability(market) {
    const outcomes = parsePolymarketArray(market?.outcomes).map((v) => String(v || '').toLowerCase());
    const prices = parsePolymarketArray(market?.outcomePrices);
    const yesIndex = Math.max(0, outcomes.findIndex((outcome) => outcome === 'yes'));
    if (prices.length > yesIndex) {
        const price = normalizeMarketProbability(prices[yesIndex]);
        if (price !== null) return price;
    }
    const direct = normalizeMarketProbability(market?.lastTradePrice ?? market?.bestAsk ?? market?.bestBid);
    return direct;
}

function normalizeFedWatchProbabilities(probabilities) {
    const cutRaw = toFiniteMarketNumber(probabilities?.cut);
    const holdRaw = toFiniteMarketNumber(probabilities?.hold);
    const hikeRaw = toFiniteMarketNumber(probabilities?.hike);
    if (cutRaw === null || holdRaw === null || hikeRaw === null) return null;
    const cut = Math.max(0, cutRaw);
    const hold = Math.max(0, holdRaw);
    const hike = Math.max(0, hikeRaw);
    const total = cut + hold + hike;
    if (total <= 0) return null;
    const normalizedCut = Math.round((cut / total) * 1000) / 10;
    const normalizedHold = Math.round((hold / total) * 1000) / 10;
    const normalizedHike = Math.max(0, Math.round((100 - normalizedCut - normalizedHold) * 10) / 10);
    return { cut: normalizedCut, hold: normalizedHold, hike: normalizedHike };
}

function extractPolymarketEventsPayload(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.data)) return payload.data;
    return [];
}

async function fetchPolymarketEventsPage(limit, offset) {
    const safeLimit = Math.max(50, Math.min(1000, Number(limit) || 200));
    const safeOffset = Math.max(0, Number(offset) || 0);
    const url = `https://gamma-api.polymarket.com/events?closed=false&limit=${safeLimit}&offset=${safeOffset}`;
    const payload = await fetchJsonWithTimeout(url, {
        headers: {
            'Accept': 'application/json',
            'User-Agent': 'VisorCryptoWorker/1.0'
        },
        cf: { cacheTtl: 60, cacheEverything: true }
    }, 5200);
    return extractPolymarketEventsPayload(payload);
}

function isPolymarketQuestionForMeeting(title, meetingDate) {
    const q = String(title || '').toLowerCase();
    if (!(meetingDate instanceof Date) || Number.isNaN(meetingDate.getTime())) return true;

    const months = [
        'january', 'february', 'march', 'april', 'may', 'june',
        'july', 'august', 'september', 'october', 'november', 'december'
    ];
    const monthShort = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const monthName = months[meetingDate.getUTCMonth()];
    const monthAbbr = monthShort[meetingDate.getUTCMonth()];
    const year = String(meetingDate.getUTCFullYear());
    const monthNum = String(meetingDate.getUTCMonth() + 1).padStart(2, '0');

    if (q.includes(`${year}-${monthNum}`) || q.includes(`${monthNum}/${year}`)) return true;
    const hasMonth = q.includes(monthName) || q.includes(`${monthAbbr}.`) || q.includes(`${monthAbbr} `) || q.endsWith(monthAbbr);
    const hasYear = q.includes(year);
    return hasMonth && (hasYear || !/\b20\d{2}\b/.test(q));
}

function getFedWatchMeetingDateParam(value) {
    const raw = String(value || '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : 'next';
}

async function buildFedWatchPayload(options = {}) {
    const meetingDateKey = getFedWatchMeetingDateParam(options.meetingDate);
    const meetingDate = meetingDateKey !== 'next' ? new Date(`${meetingDateKey}T12:00:00Z`) : null;
    const selectFedCandidates = (eventList) => eventList.filter((event) => {
        const title = String(event?.title || event?.slug || '').trim();
        const lower = title.toLowerCase();
        const isFedContext = /(fomc|federal reserve|fed decision|fed decisions|fed rate|fed funds)/.test(lower);
        if (!isFedContext) return false;

        const eventDate = event?.endDate ? new Date(event.endDate) : null;
        const nearMeeting = (
            meetingDate instanceof Date &&
            eventDate instanceof Date &&
            Number.isFinite(eventDate.getTime()) &&
            Math.abs(eventDate.getTime() - meetingDate.getTime()) <= (16 * 24 * 60 * 60 * 1000)
        );

        return nearMeeting || isPolymarketQuestionForMeeting(title, meetingDate);
    });

    const events = [];
    const firstBatch = await fetchPolymarketEventsPage(500, 0);
    if (firstBatch.length > 0) events.push(...firstBatch);
    let fedCandidates = selectFedCandidates(events);

    if (!fedCandidates.length) {
        const pageSize = 200;
        for (let page = 1; page <= 3; page++) {
            const pageEvents = await fetchPolymarketEventsPage(pageSize, page * pageSize);
            if (!pageEvents.length) break;
            events.push(...pageEvents);
            fedCandidates = selectFedCandidates(events);
            if (fedCandidates.length) break;
        }
    }

    if (!events.length) throw new Error('Polymarket returned no active events');
    if (!fedCandidates.length) throw new Error('No active Fed decision event found');

    const selectedEvent = fedCandidates.sort((a, b) => {
        const ad = a?.endDate ? new Date(a.endDate).getTime() : Number.MAX_SAFE_INTEGER;
        const bd = b?.endDate ? new Date(b.endDate).getTime() : Number.MAX_SAFE_INTEGER;
        const meetingTs = meetingDate instanceof Date ? meetingDate.getTime() : ad;
        const da = Math.abs(ad - meetingTs);
        const db = Math.abs(bd - meetingTs);
        if (da !== db) return da - db;
        const av = toFiniteMarketNumber(a?.volume24hr) || 0;
        const bv = toFiniteMarketNumber(b?.volume24hr) || 0;
        return bv - av;
    })[0];

    const eventMarkets = Array.isArray(selectedEvent?.markets) ? selectedEvent.markets : [];
    if (!eventMarkets.length) throw new Error('Fed event has no markets');

    const totals = { cut: 0, hold: 0, hike: 0 };
    let marketsUsed = 0;
    eventMarkets.forEach((market) => {
        if (market?.active === false || market?.closed === true) return;
        const question = String(market?.question || market?.title || '').toLowerCase();
        if (!question) return;
        const yesProbability = extractPolymarketYesProbability(market);
        if (yesProbability === null) return;

        let bucket = null;
        if (/(no change|unchanged|maintain|pause|stay at|no-change)/.test(question)) {
            bucket = 'hold';
        } else if (/(decrease|cut|lower|down|easing)/.test(question)) {
            bucket = 'cut';
        } else if (/(increase|hike|raise|higher|up|tightening)/.test(question)) {
            bucket = 'hike';
        }
        if (!bucket) return;
        totals[bucket] += yesProbability;
        marketsUsed++;
    });

    if (marketsUsed === 0) throw new Error('Fed markets could not be classified');
    if (totals.hold <= 0 && (totals.cut > 0 || totals.hike > 0)) {
        totals.hold = Math.max(0, 100 - totals.cut - totals.hike);
    }

    const normalized = normalizeFedWatchProbabilities(totals);
    if (!normalized) throw new Error('Invalid Fed probability totals');

    const now = Date.now();
    return {
        success: true,
        ...normalized,
        source: 'Polymarket (Worker)',
        eventTitle: String(selectedEvent?.title || selectedEvent?.slug || 'Fed decision event'),
        marketsUsed,
        meetingDate: meetingDateKey,
        fetchedAt: now,
        updatedAt: now,
        stale: false
    };
}

const MARKET_MACRO_INDICATORS = {
    'GC=F': { name: 'Ouro', short: 'XAU/USD' },
    'SI=F': { name: 'Prata', short: 'XAG/USD' },
    'CL=F': { name: 'Petroleo WTI', short: 'WTI' },
    'DX-Y.NYB': { name: 'Dolar Index', short: 'DXY' },
    '^GSPC': { name: 'S&P 500', short: 'SPX' },
    '^NDX': { name: 'Nasdaq 100', short: 'NDX' },
    '^RUT': { name: 'Russell 2000', short: 'RUT' },
    '^VIX': { name: 'VIX', short: 'VIX' },
    'XLE': { name: 'Energia', short: 'XLE' },
};

async function fetchYahooChartQuote(symbol) {
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
    const data = await fetchJsonWithTimeout(yahooUrl, { cf: { cacheTtl: 60 } }, 1900);
    const result = data?.chart?.result?.[0];
    const meta = result?.meta || {};
    const price = Number(meta.regularMarketPrice || 0);
    if (!Number.isFinite(price) || price <= 0) return null;
    const prevClose = Number(meta.previousClose || meta.chartPreviousClose || price) || price;
    const change = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;
    const marketTime = Number(meta.regularMarketTime || 0) * 1000;
    return {
        symbol,
        price,
        previousClose: prevClose,
        change: Number.isFinite(change) ? change : 0,
        updatedAt: marketTime > 0 ? marketTime : Date.now(),
    };
}

async function buildMacroQuotesPayload() {
    const symbols = Object.keys(MARKET_MACRO_INDICATORS);
    const settled = await Promise.allSettled(symbols.map(fetchYahooChartQuote));
    const prices = {};
    const changes = {};
    const prev = {};
    const updatedAtBySymbol = {};

    settled.forEach((result) => {
        if (result.status !== 'fulfilled' || !result.value) return;
        const q = result.value;
        prices[q.symbol] = q.price;
        changes[q.symbol] = q.change;
        prev[q.symbol] = q.previousClose;
        updatedAtBySymbol[q.symbol] = q.updatedAt;
    });

    const loaded = Object.keys(prices).length;
    if (loaded === 0) throw new Error('No Yahoo chart quotes loaded');

    return {
        success: true,
        source: 'yahoo_chart_v8_worker',
        updatedAt: Date.now(),
        symbols: MARKET_MACRO_INDICATORS,
        prices,
        changes,
        prev,
        updatedAtBySymbol,
        loaded,
    };
}

async function buildMarketGlobalPayload() {
    const data = await fetchJsonWithTimeout('https://api.coingecko.com/api/v3/global', { cf: { cacheTtl: 180 } }, 2200);
    const raw = Number(data?.data?.market_cap_percentage?.btc || 0);
    if (!Number.isFinite(raw) || raw <= 0) throw new Error('Invalid BTC dominance');
    return {
        success: true,
        source: 'coingecko_global',
        updatedAt: Date.now(),
        btcDominanceRaw: raw,
        btcDominance: raw + BTC_DOMINANCE_ADJUSTMENT,
        adjustment: BTC_DOMINANCE_ADJUSTMENT,
        marketCapUsd: Number(data?.data?.total_market_cap?.usd || 0) || 0,
        volumeUsd: Number(data?.data?.total_volume?.usd || 0) || 0,
    };
}

function calculateAltseasonValue(globalData, topCoins) {
    const btcDomRaw = Number(globalData?.data?.market_cap_percentage?.btc || 0);
    if (!Number.isFinite(btcDomRaw) || btcDomRaw <= 0) throw new Error('Invalid global data');
    if (!Array.isArray(topCoins) || topCoins.length === 0) throw new Error('Invalid market data');

    const excludeTerms = [
        'tether', 'usd-coin', 'binance-usd', 'dai', 'true-usd', 'wrapped',
        'staked', 'bridged', 'paxos', 'frax', 'usdd', 'first-digital',
        'ethena', 'paypal', 'gemini', 'huobi', 'wbtc', 'weth', 'lido'
    ];
    const btcCoin = topCoins.find(c => c.id === 'bitcoin');
    const btc30d = Number(btcCoin?.price_change_percentage_30d_in_currency || 0);
    const altcoins = topCoins.filter(c =>
        c.id !== 'bitcoin' &&
        !excludeTerms.some(term => String(c.id || '').toLowerCase().includes(term)) &&
        !String(c.name || '').toLowerCase().includes('usd') &&
        c.market_cap_rank &&
        c.market_cap_rank <= 100
    ).slice(0, 50);

    let outperform30d = 0;
    let valid30d = 0;
    altcoins.forEach((coin) => {
        const change30d = Number(coin.price_change_percentage_30d_in_currency);
        if (Number.isFinite(change30d)) {
            valid30d++;
            if (change30d > btc30d) outperform30d++;
        }
    });
    const pctOutperforming = valid30d > 0 ? (outperform30d / valid30d) * 100 : 50;
    const btcDom = btcDomRaw + BTC_DOMINANCE_ADJUSTMENT;
    const domScore = Math.max(0, Math.min(100, 150 - 2 * btcDom));
    const value = Math.max(0, Math.min(100, Math.round(pctOutperforming * 0.35 + domScore * 0.65)));

    return {
        value,
        btcDom,
        btcDomRaw,
        outperform30d,
        valid30d,
        pctOutperforming: Math.round(pctOutperforming),
    };
}

function parseBlockchainCenterAltseason(text) {
    const raw = String(text || '');
    const patterns = [
        /Altcoin Season\s*\((\d{1,3})\)/i,
        /It is not Altcoin Season!\s*(\d{1,3})\s*Bitcoin Season/i,
        /### Altcoin Season Index[\s\S]{0,160}?(?:Altcoin Season!\s*)?(\d{1,3})\s*Bitcoin Season/i,
    ];
    for (const pattern of patterns) {
        const match = raw.match(pattern);
        const value = Number(match?.[1]);
        if (Number.isFinite(value) && value >= 0 && value <= 100) return Math.round(value);
    }
    return null;
}

async function fetchBlockchainCenterAltseason() {
    const urls = [
        'https://www.blockchaincenter.net/altcoin-season-index/',
        'https://r.jina.ai/http://https://www.blockchaincenter.net/altcoin-season-index/',
    ];
    for (const url of urls) {
        try {
            const text = await fetchTextWithTimeout(url, { cf: { cacheTtl: 1800 } }, 5000);
            const value = parseBlockchainCenterAltseason(text);
            if (value !== null) return value;
        } catch (_) {}
    }
    throw new Error('BlockchainCenter altseason unavailable');
}

async function buildAltseasonPayload() {
    try {
        const value = await fetchBlockchainCenterAltseason();
        return {
            success: true,
            source: 'blockchaincenter',
            methodology: 'top50_vs_btc_90d',
            lookbackDays: 90,
            universe: 'top50_ex_stable_wrapped',
            updatedAt: Date.now(),
            value,
        };
    } catch (_) {}

    const [globalData, topCoins] = await Promise.all([
        fetchJsonWithTimeout('https://api.coingecko.com/api/v3/global', { cf: { cacheTtl: 180 } }, 2200),
        fetchJsonWithTimeout('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=75&page=1&sparkline=false&price_change_percentage=7d,14d,30d', { cf: { cacheTtl: 300 } }, 3200)
    ]);
    const calc = calculateAltseasonValue(globalData, topCoins);
    return {
        success: true,
        source: 'coingecko_markets_worker_fallback',
        methodology: 'fallback_30d_dominance',
        lookbackDays: 30,
        updatedAt: Date.now(),
        ...calc,
    };
}

function clampIndexValue(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    return Math.max(0, Math.min(100, Math.round(numeric)));
}

function normalizeFearGreedDisplayValue(rawValue) {
    return clampIndexValue(Number(rawValue) + FEAR_GREED_DISPLAY_ADJUSTMENT);
}

async function buildFearGreedPayload() {
    const data = await fetchJsonWithTimeout('https://api.alternative.me/fng/?limit=1&format=json', { cf: { cacheTtl: 300 } }, 5000);
    const item = data?.data?.[0];
    const rawValue = Number(item?.value);
    if (!Number.isFinite(rawValue) || rawValue < 0 || rawValue > 100) {
        throw new Error('Invalid Fear & Greed payload');
    }
    const displayValue = normalizeFearGreedDisplayValue(rawValue);
    if (displayValue === null) throw new Error('Invalid Fear & Greed display value');

    const dataTimestamp = Number(item?.timestamp || 0) * 1000;
    const secondsUntilUpdate = Number(item?.time_until_update || 0);
    return {
        success: true,
        source: 'alternative_me',
        updatedAt: Date.now(),
        dataTimestamp: dataTimestamp > 0 ? dataTimestamp : null,
        nextUpdateAt: secondsUntilUpdate > 0 ? Date.now() + secondsUntilUpdate * 1000 : null,
        secondsUntilUpdate: Number.isFinite(secondsUntilUpdate) ? secondsUntilUpdate : null,
        value: displayValue,
        rawValue: Math.round(rawValue),
        displayAdjustment: FEAR_GREED_DISPLAY_ADJUSTMENT,
        classification: String(item?.value_classification || '').trim() || null,
    };
}

function decodeHtmlEntities(text) {
    const map = {
        '&amp;': '&',
        '&lt;': '<',
        '&gt;': '>',
        '&quot;': '"',
        '&#39;': "'",
        '&apos;': "'",
        '&nbsp;': ' ',
    };
    return String(text || '')
        .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (m) => map[m] || m)
        .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
        .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
        .trim();
}

function stripHtml(text) {
    return decodeHtmlEntities(String(text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
}

function extractXmlTag(xml, tag) {
    const re = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i');
    const match = String(xml || '').match(re);
    return match ? decodeHtmlEntities(match[1]) : '';
}

function extractXmlImage(xml) {
    const text = String(xml || '');
    const patterns = [
        /<media:content[^>]+url=["']([^"']+)["']/i,
        /<media:thumbnail[^>]+url=["']([^"']+)["']/i,
        /<enclosure[^>]+url=["']([^"']+)["'][^>]*type=["']image/i,
        /<img[^>]+src=["']([^"']+)["']/i,
    ];
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match && match[1]) return decodeHtmlEntities(match[1]).replace(/&amp;/g, '&');
    }
    return '';
}

function normalizeNewsUrl(url) {
    try {
        const u = new URL(String(url || '').trim());
        u.hash = '';
        ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach(k => u.searchParams.delete(k));
        return u.toString().replace(/\/$/, '').toLowerCase();
    } catch (_) {
        return String(url || '').trim().toLowerCase();
    }
}

const WORKER_NEWS_FEEDS = [
    { url: 'https://cointelegraph.com/rss', source: 'Cointelegraph' },
    { url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', source: 'CoinDesk' },
    { url: 'https://decrypt.co/feed', source: 'Decrypt' },
    { url: 'https://www.theblock.co/rss.xml', source: 'The Block' },
    { url: 'https://cryptoslate.com/feed/', source: 'CryptoSlate' },
    { url: 'https://cryptonews.com/news/feed/', source: 'CryptoNews' },
    { url: 'https://bitcoinmagazine.com/.rss/full/', source: 'Bitcoin Magazine' },
    { url: 'https://thedefiant.io/feed', source: 'The Defiant' },
    { url: 'https://beincrypto.com/feed/', source: 'BeInCrypto' },
    { url: 'https://feeds.bbci.co.uk/news/business/rss.xml', source: 'BBC Business' },
];

const WORKER_NEWS_TRASH_PATTERNS = [
    /price prediction/i,
    /price forecast/i,
    /could reach/i,
    /will reach/i,
    /may reach/i,
    /best crypto (to buy|exchange|wallet)/i,
    /how to (buy|earn|stake|invest)/i,
    /sponsored/i,
    /sign up/i,
    /bonus/i,
    /airdrop/i,
    /coupon/i,
];

function isWorkerTrashNews(title) {
    const clean = String(title || '').trim();
    if (!clean) return true;
    return WORKER_NEWS_TRASH_PATTERNS.some(pattern => pattern.test(clean));
}

function parseRssItems(text, source) {
    const items = [];
    const xml = String(text || '');
    const itemMatches = xml.match(/<item[^>]*>[\s\S]*?<\/item>/gi) || [];
    const entryMatches = itemMatches.length ? [] : (xml.match(/<entry[^>]*>[\s\S]*?<\/entry>/gi) || []);
    const blocks = itemMatches.length ? itemMatches : entryMatches;

    for (const block of blocks.slice(0, 55)) {
        const title = stripHtml(extractXmlTag(block, 'title'));
        let link = stripHtml(extractXmlTag(block, 'link'));
        const hrefMatch = block.match(/<link[^>]+href=["']([^"']+)["']/i);
        if (!link && hrefMatch) link = decodeHtmlEntities(hrefMatch[1]);
        const published = stripHtml(extractXmlTag(block, 'pubDate') || extractXmlTag(block, 'published') || extractXmlTag(block, 'updated'));
        const description = stripHtml(extractXmlTag(block, 'description') || extractXmlTag(block, 'summary') || extractXmlTag(block, 'content:encoded'));
        if (!title || !link || isWorkerTrashNews(title)) continue;

        const parsedDate = Date.parse(published);
        const safePublished = Number.isFinite(parsedDate) ? new Date(parsedDate).toISOString() : new Date().toISOString();
        const ageMs = Date.now() - new Date(safePublished).getTime();
        if (ageMs > 15 * 24 * 60 * 60 * 1000 || ageMs < -24 * 60 * 60 * 1000) continue;

        items.push({
            title,
            url: link,
            source,
            published: safePublished,
            image: extractXmlImage(block) || null,
            body: description ? description.slice(0, 500) : '',
        });
    }
    return items;
}

async function fetchNewsFeed(feed) {
    const text = await fetchTextWithTimeout(feed.url, {
        cf: { cacheTtl: 240 },
        headers: {
            'User-Agent': 'VisorCrypto/1.0 (+https://visorcrypto.loan)',
            'Accept': 'application/rss+xml, application/xml, text/xml, */*',
        },
    }, 2800);
    return parseRssItems(text, feed.source);
}

async function buildNewsPayload() {
    const settled = await Promise.allSettled(WORKER_NEWS_FEEDS.map(fetchNewsFeed));
    const collected = [];
    settled.forEach((result) => {
        if (result.status === 'fulfilled' && Array.isArray(result.value)) {
            collected.push(...result.value);
        }
    });
    if (collected.length === 0) throw new Error('No RSS news loaded');

    const seenUrls = new Set();
    const seenTitles = new Set();
    const deduped = [];
    collected
        .sort((a, b) => new Date(b.published) - new Date(a.published))
        .forEach((item) => {
            const urlKey = normalizeNewsUrl(item.url);
            const titleKey = String(item.title || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter(w => w.length > 3).slice(0, 9).join(' ');
            if (!urlKey || seenUrls.has(urlKey) || (titleKey && seenTitles.has(titleKey))) return;
            seenUrls.add(urlKey);
            if (titleKey) seenTitles.add(titleKey);
            deduped.push(item);
        });

    return {
        success: true,
        source: 'worker_rss',
        updatedAt: Date.now(),
        total: deduped.length,
        articles: deduped.slice(0, 240),
    };
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
        this.callsKey = CALL_HISTORY_DO_KEY;
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

        const safeSymbol = normalizeAllowedSignalSymbol(body?.symbol);
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
                await this.env.CALENDAR_KV.put(SHARED_CALL_HISTORY_KEY, JSON.stringify(result.callsSnapshot), {
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
        let calls = filterAllowedCalls(await this.state.storage.get(this.callsKey));

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
    async fetch(request, env, ctx) {
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

        // GET /signals/snapshot — latest shared signal snapshot for instant dashboard hydration
        if (path === '/market/macro-quotes' && request.method === 'GET') {
            return serveCachedMarketPayload(env, ctx, corsHeaders, {
                key: MARKET_MACRO_QUOTES_KEY,
                freshSeconds: MARKET_FRESH_SECONDS,
                staleSeconds: MARKET_STALE_SECONDS,
                builder: buildMacroQuotesPayload,
                error: 'Macro quotes unavailable',
                source: 'yahoo_chart_v8_worker',
                headers: { 'Cache-Control': 'public, max-age=45, stale-while-revalidate=300' },
            });
        }

        if (path === '/market/fedwatch' && request.method === 'GET') {
            const meetingDate = getFedWatchMeetingDateParam(url.searchParams.get('meetingDate'));
            return serveCachedMarketPayload(env, ctx, corsHeaders, {
                key: MARKET_FEDWATCH_KEY_PREFIX + meetingDate,
                freshSeconds: FEDWATCH_FRESH_SECONDS,
                staleSeconds: FEDWATCH_STALE_SECONDS,
                builder: () => buildFedWatchPayload({ meetingDate }),
                error: 'Fed Watch probabilities unavailable',
                source: 'polymarket_gamma',
                headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400' },
            });
        }

        if (path === '/market/global' && request.method === 'GET') {
            return serveCachedMarketPayload(env, ctx, corsHeaders, {
                key: MARKET_GLOBAL_KEY,
                freshSeconds: MARKET_FRESH_SECONDS,
                staleSeconds: MARKET_STALE_SECONDS,
                builder: buildMarketGlobalPayload,
                error: 'Global market data unavailable',
                source: 'coingecko_global',
                headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' },
            });
        }

        if (path === '/market/altseason' && request.method === 'GET') {
            return serveCachedMarketPayload(env, ctx, corsHeaders, {
                key: MARKET_ALTSEASON_KEY,
                freshSeconds: 60 * 60,
                staleSeconds: 24 * 60 * 60,
                builder: buildAltseasonPayload,
                error: 'Altseason data unavailable',
                source: 'blockchaincenter',
                headers: { 'Cache-Control': 'public, max-age=600, stale-while-revalidate=86400' },
            });
        }

        if (path === '/market/fear-greed' && request.method === 'GET') {
            return serveCachedMarketPayload(env, ctx, corsHeaders, {
                key: MARKET_FEAR_GREED_KEY,
                freshSeconds: 10 * 60,
                staleSeconds: 48 * 60 * 60,
                builder: buildFearGreedPayload,
                error: 'Fear & Greed data unavailable',
                source: 'alternative_me',
                headers: { 'Cache-Control': 'public, max-age=180, stale-while-revalidate=900' },
            });
        }

        if (path === '/news' && request.method === 'GET') {
            return serveCachedMarketPayload(env, ctx, corsHeaders, {
                key: MARKET_NEWS_KEY,
                freshSeconds: NEWS_FRESH_SECONDS,
                staleSeconds: NEWS_STALE_SECONDS,
                builder: buildNewsPayload,
                error: 'News unavailable',
                source: 'worker_rss',
                headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=600' },
            });
        }

        if (path === '/signals/snapshot' && request.method === 'GET') {
            try {
                const authCheck = await requireSignedAuth(request, env, 'signals:read');
                if (!authCheck.ok) {
                    return new Response(JSON.stringify({ success: false, error: authCheck.error }), {
                        status: authCheck.status || 401,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }

                let snapshot = null;
                if (env.CALENDAR_KV) {
                    snapshot = await env.CALENDAR_KV.get(SIGNALS_SNAPSHOT_KEY, 'json');
                }

                const ageMs = snapshot?.updatedAt ? Date.now() - Number(snapshot.updatedAt) : Infinity;
                if (!snapshot || ageMs > SIGNALS_SNAPSHOT_TTL_SECONDS * 1000) {
                    snapshot = await buildSignalsSnapshot(env, true);
                }

                return new Response(JSON.stringify({ success: true, snapshot }), {
                    headers: {
                        ...corsHeaders,
                        'Content-Type': 'application/json',
                        'Cache-Control': 'private, max-age=20, stale-while-revalidate=120',
                    },
                });
            } catch (e) {
                console.error('Signals snapshot endpoint error:', e);
                return new Response(JSON.stringify({ success: false, error: 'Failed to load signals snapshot' }), {
                    status: 500,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            }
        }

        // POST /notifications/register-token — bind a device FCM token to notification prefs
        if (path === '/notifications/register-token' && request.method === 'POST') {
            try {
                const authCheck = await requireSignedAuth(request, env, 'notifications:write');
                if (!authCheck.ok) {
                    return new Response(JSON.stringify({ success: false, error: authCheck.error }), {
                        status: authCheck.status || 401,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }
                if (!env.CALENDAR_KV) {
                    return new Response(JSON.stringify({ success: false, error: 'Notification storage unavailable' }), {
                        status: 503,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }

                const body = await request.json();
                const token = String(body?.token || '').trim();
                if (token.length < 40 || token.length > 4096) {
                    return new Response(JSON.stringify({ success: false, error: 'Invalid FCM token' }), {
                        status: 400,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }

                const deviceId = authCheck.identity.deviceId;
                const now = Date.now();
                await env.CALENDAR_KV.put(`${NOTIF_TOKEN_PREFIX}${deviceId}`, JSON.stringify({
                    deviceId,
                    userId: authCheck.identity.userId || '',
                    token,
                    platform: String(body?.platform || 'android').slice(0, 30),
                    appVersion: String(body?.appVersion || '').slice(0, 40),
                    updatedAt: now,
                }), { expirationTtl: 90 * 24 * 60 * 60 });

                if (body?.prefs) {
                    await env.CALENDAR_KV.put(`${NOTIF_PREF_PREFIX}${deviceId}`, JSON.stringify({
                        ...normalizeNotificationPrefs(body.prefs),
                        updatedAt: now,
                    }), { expirationTtl: 90 * 24 * 60 * 60 });
                }

                return new Response(JSON.stringify({ success: true, registeredAt: now }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
                });
            } catch (e) {
                console.error('Register token endpoint error:', e);
                return new Response(JSON.stringify({ success: false, error: 'Failed to register token' }), {
                    status: 500,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            }
        }

        // POST /notifications/prefs — update server-side filters used by worker cron
        if (path === '/notifications/prefs' && request.method === 'POST') {
            try {
                const authCheck = await requireSignedAuth(request, env, 'notifications:write');
                if (!authCheck.ok) {
                    return new Response(JSON.stringify({ success: false, error: authCheck.error }), {
                        status: authCheck.status || 401,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }
                if (!env.CALENDAR_KV) {
                    return new Response(JSON.stringify({ success: false, error: 'Notification storage unavailable' }), {
                        status: 503,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }

                const prefs = normalizeNotificationPrefs(await request.json());
                const updatedAt = Date.now();
                await env.CALENDAR_KV.put(`${NOTIF_PREF_PREFIX}${authCheck.identity.deviceId}`, JSON.stringify({
                    ...prefs,
                    updatedAt,
                }), { expirationTtl: 90 * 24 * 60 * 60 });

                return new Response(JSON.stringify({ success: true, updatedAt }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
                });
            } catch (e) {
                console.error('Notification prefs endpoint error:', e);
                return new Response(JSON.stringify({ success: false, error: 'Failed to save notification prefs' }), {
                    status: 500,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            }
        }

        // POST /notifications/unregister-token — remove remote push registration for this device
        if (path === '/notifications/unregister-token' && request.method === 'POST') {
            try {
                const authCheck = await requireSignedAuth(request, env, 'notifications:write');
                if (!authCheck.ok) {
                    return new Response(JSON.stringify({ success: false, error: authCheck.error }), {
                        status: authCheck.status || 401,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }
                if (env.CALENDAR_KV) {
                    await env.CALENDAR_KV.delete(`${NOTIF_TOKEN_PREFIX}${authCheck.identity.deviceId}`);
                }
                return new Response(JSON.stringify({ success: true }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
                });
            } catch (e) {
                console.error('Unregister token endpoint error:', e);
                return new Response(JSON.stringify({ success: false, error: 'Failed to unregister token' }), {
                    status: 500,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            }
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
                    scopes: ['ai-summary:write', 'calls:write', 'notifications:write', 'signals:read'],
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

                const safeSymbol = normalizeAllowedSignalSymbol(symbol);
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
                        calls = filterAllowedCalls(await env.CALENDAR_KV.get(SHARED_CALL_HISTORY_KEY, 'json'));
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
                        await env.CALENDAR_KV.put(SHARED_CALL_HISTORY_KEY, JSON.stringify(calls), {
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
                        calls = filterAllowedCalls(await env.CALENDAR_KV.get(SHARED_CALL_HISTORY_KEY, 'json'));
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
                        await env.CALENDAR_KV.put(SHARED_CALL_HISTORY_KEY, JSON.stringify(calls), {
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
                        let cachedCalls = filterAllowedCalls(await env.CALENDAR_KV.get(SHARED_CALL_HISTORY_KEY, 'json'));
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

        // SINAIS: one shared scan every 5 minutes, then push eligible calls via FCM.
        try {
            const snapshot = await buildSignalsSnapshot(env, true);
            const pushResult = await dispatchSignalPushes(env, snapshot);
            console.log(
                `Signal snapshot refreshed: ${Object.keys(snapshot?.results || {}).length} symbols, ` +
                `push sent=${pushResult.sent}, skipped=${pushResult.skipped}`
            );
        } catch (e) {
            console.error('Cron error (signals):', e);
        }
    },
};


