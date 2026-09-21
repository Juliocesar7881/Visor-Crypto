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
const LIQUIDATIONS_BASE_SYMBOLS = [
    'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT',
    'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'DOTUSDT', 'LINKUSDT',
    'MATICUSDT', 'LTCUSDT', 'UNIUSDT', 'ATOMUSDT', 'NEARUSDT'
];
const CALLS_POST_RATE_LIMIT_PER_DEVICE = 60;  // writes per minute per authenticated device
const CALLS_POST_RATE_LIMIT_PER_IP = 1200;    // shared IP ceiling to preserve burst capacity behind NAT
const CALLS_POST_RATE_WINDOW_SECONDS = 60;
const WORKER_BUILD_VERSION = '1.3.2';
const CALL_HISTORY_STORAGE_VERSION = 'v6';
const SHARED_CALL_HISTORY_KEY = `shared_call_history_${CALL_HISTORY_STORAGE_VERSION}`;
const CALL_HISTORY_DO_KEY = `calls_${CALL_HISTORY_STORAGE_VERSION}`;
const CALL_HISTORY_LEGACY_KEYS = ['calls_v4', 'calls_v3'];
const SHARED_CALL_HISTORY_LEGACY_KEYS = ['shared_call_history_v4', 'shared_call_history_v3'];
const SIGNAL_STRATEGY_VERSION = 'S6_INV';
const SIGNAL_DIRECTION_POLICY_VERSION = 'inverse-long-short-v1';
const SIGNAL_FEEDBACK_STRATEGY_VERSIONS = ['S6_INV'];
const SIGNAL_MIN_CONFIDENCE = 70;
const CALL_HISTORY_RESET_EPOCH_MS = Date.parse('2026-05-30T21:10:00Z');
const SIGNALS_SNAPSHOT_KEY = 'signals_snapshot_s6_inv_v1';
const SIGNALS_SNAPSHOT_D1_KEY = 'signals_snapshot_s6_inv_v1';
const SIGNALS_SNAPSHOT_TTL_SECONDS = 6 * 60;
const SIGNALS_SNAPSHOT_STALE_TTL_SECONDS = 24 * 60 * 60;
const SIGNALS_SNAPSHOT_KV_BACKUP_SECONDS = 3 * 60 * 60;
const MARKET_MACRO_QUOTES_KEY = 'market_macro_quotes_v1';
const MARKET_GLOBAL_KEY = 'market_global_v1';
const MARKET_GLOBAL_SNAPSHOT_KEY = 'market_global_snapshot_v1';
const MARKET_ALTSEASON_KEY = 'market_altseason_v4';
const MARKET_FEAR_GREED_KEY = 'market_fear_greed_v2';
const MARKET_NEWS_KEY = 'market_news_v1';
const MARKET_FED_RATE_KEY = 'market_fed_rate_v1';
const MARKET_FEDWATCH_KEY_PREFIX = 'market_fedwatch_v2_';
const MARKET_YAHOO_QUOTES_KEY_PREFIX = 'market_yahoo_quotes_v1_';
const MARKET_YAHOO_CHART_KEY_PREFIX = 'market_yahoo_chart_v1_';
const WALLET_LABEL_KEY_PREFIX = 'wallet_label_v1_';
const MARKET_FRESH_SECONDS = 15 * 60;
const MARKET_STALE_SECONDS = 3 * 60 * 60;
const MARKET_GLOBAL_SNAPSHOT_FRESH_SECONDS = 15 * 60;
const MARKET_GLOBAL_SNAPSHOT_STALE_SECONDS = 7 * 24 * 60 * 60;
const MARKET_ALTSEASON_FRESH_SECONDS = 60 * 60;
const MARKET_ALTSEASON_STALE_SECONDS = 7 * 24 * 60 * 60;
const FED_RATE_FRESH_SECONDS = 6 * 60 * 60;
const FED_RATE_STALE_SECONDS = 30 * 24 * 60 * 60;
const FEDWATCH_FRESH_SECONDS = 30 * 60;
const FEDWATCH_STALE_SECONDS = 24 * 60 * 60;
const NEWS_FRESH_SECONDS = 15 * 60;
const NEWS_STALE_SECONDS = 45 * 60;
const YAHOO_QUOTES_FRESH_SECONDS = 10 * 60;
const YAHOO_QUOTES_STALE_SECONDS = 15 * 60;
const WALLET_LABEL_FRESH_SECONDS = 24 * 60 * 60;
const WALLET_LABEL_STALE_SECONDS = 30 * 24 * 60 * 60;
const BTC_DOMINANCE_ADJUSTMENT = 2.1;
const FEAR_GREED_DISPLAY_ADJUSTMENT = 1;
const NOTIF_DEDUP_PREFIX = 'notif_dedup_';
const NOTIF_DEDUP_SECONDS = 30 * 60;
const RATE_LIMIT_BUCKETS = globalThis.__visorRateLimitBuckets || (globalThis.__visorRateLimitBuckets = new Map());
const EDGE_JSON_MEMORY_CACHE = globalThis.__visorEdgeJsonMemoryCache || (globalThis.__visorEdgeJsonMemoryCache = new Map());
const EDGE_JSON_MEMORY_MAX_ENTRIES = 220;
const NOTIF_PREFS_SYNC_WINDOW_SECONDS = 90 * 24 * 60 * 60;
const SIGNAL_TOPIC_PROTOCOL_VERSION = 'topic_v1';
const SIGNAL_TOPIC_PREFIX = 'visor_s6_inv_';
const SIGNAL_RUNTIME_STATUS_KEY = 'signals';
// Workers Free allows 10 ms of CPU per invocation; these caches keep the
// 5-minute cron and the hot GET routes under it (see loadCallFeedbackStatsCached).
const CALLS_REVISION_KEY = 'calls_revision';
const SIGNAL_FEEDBACK_CACHE_KEY = 'signal_feedback_v1';
const SIGNAL_FEEDBACK_CACHE_MAX_AGE_MS = 30 * 60 * 1000;
const SIGNAL_FEEDBACK_STALE_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const CALLS_PAGE_CACHE_PREFIX = 'calls_page_v1:';
const CALLS_PAGE_CACHE_MAX_AGE_MS = 5 * 60 * 1000;
const SIGNALS_HTTP_REFRESH_LOCK_KEY = 'signals_http_refresh_lock';
const FCM_ACCESS_TOKEN_KV_KEY = 'fcm_access_token_v1';
const SIGNAL_CRON_EXPRESSION = '*/5 * * * *';
const LEGACY_PUSH_CRON_EXPRESSION = '4,14,24,34,44,54 * * * *';
const MARKET_CRON_EXPRESSION = '2,17,32,47 * * * *';
const LIQUIDATIONS_CRON_EXPRESSION = '7,22,37,52 * * * *';
const CALENDAR_CRON_EXPRESSION = '12,42 * * * *';
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
const APP_SIGNAL_SYMBOL_LIST = Object.freeze([
    'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT',
    'ADAUSDT', 'AVAXUSDT', 'DOGEUSDT', 'SHIBUSDT', 'PEPEUSDT',
    'LINKUSDT', 'UNIUSDT', 'AAVEUSDT', 'DOTUSDT', 'LTCUSDT',
    'ATOMUSDT', 'NEARUSDT', 'RENDERUSDT', 'FETUSDT', 'ZECUSDT',
    'BCHUSDT', 'SUIUSDT'
]);
const APP_SIGNAL_SYMBOLS = new Set(APP_SIGNAL_SYMBOL_LIST);

function getSignalTopic(symbol) {
    const safeSymbol = normalizeAllowedSignalSymbol(symbol).toLowerCase();
    return safeSymbol ? `${SIGNAL_TOPIC_PREFIX}${safeSymbol}_v1` : '';
}
const CALL_SETTLEMENT_VERSION = 'worker_settlement_v3_usdm';
const CALL_SETTLEMENT_SOURCE = 'binance_usdm_1m_close';
const CALL_DEDUP_WINDOW_MS = 30 * 60 * 1000;
const SIGNALS_MIN_HEALTHY_RATIO = 0.55;
const CALL_SETTLEMENT_INTERVALS = [
    { key: '1h', ms: 60 * 60 * 1000 },
    { key: '2h', ms: 2 * 60 * 60 * 1000 },
    { key: '4h', ms: 4 * 60 * 60 * 1000 }
];
const CALL_INTERVAL_KEYS = CALL_SETTLEMENT_INTERVALS.map((item) => item.key);
const HIGH_BETA_CALL_SYMBOLS = new Set([
    'DOGEUSDT', 'SHIBUSDT', 'PEPEUSDT', 'FETUSDT', 'RENDERUSDT',
    'SUIUSDT', 'NEARUSDT', 'AVAXUSDT', 'SOLUSDT'
]);
const BINANCE_USDM_HOSTS = [
    'https://www.binance.com',
    'https://fapi.binance.com',
    'https://fapi1.binance.com',
    'https://fapi2.binance.com',
    'https://fapi3.binance.com'
];
// Cron executions can originate from regions where Binance rejects Cloudflare
// egress. Keep a single Binance attempt for signals, then use another USDT
// perpetual venue instead of burning the whole subrequest budget on mirrors.
const BINANCE_USDM_SIGNAL_HOSTS = ['https://fapi.binance.com'];
const GATE_USDT_FUTURES_BASE = 'https://api.gateio.ws/api/v4/futures/usdt';
const BINANCE_FETCH_INIT = {
    headers: {
        'Accept': 'application/json,text/plain,*/*',
        'User-Agent': 'Mozilla/5.0 (compatible; VisorCrypto/1.0; +https://visorcrypto.loan)'
    },
    cf: { cacheTtl: 60 }
};
const BINANCE_USDM_CONTRACT_ALIASES = {
    SHIBUSDT: { contractSymbol: '1000SHIBUSDT', priceScale: 1000 },
    PEPEUSDT: { contractSymbol: '1000PEPEUSDT', priceScale: 1000 }
};
let AUTH_SECRET_CACHE = globalThis.__visorAuthSecretCache || '';

function normalizeAllowedSignalSymbol(raw) {
    const cleaned = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const symbol = cleaned.endsWith('USDT') ? cleaned : `${cleaned}USDT`;
    return APP_SIGNAL_SYMBOLS.has(symbol) ? symbol : '';
}

function getUsdmContractSpec(rawSymbol) {
    const appSymbol = normalizeAllowedSignalSymbol(rawSymbol);
    if (!appSymbol) return null;
    const alias = BINANCE_USDM_CONTRACT_ALIASES[appSymbol] || {};
    return {
        appSymbol,
        contractSymbol: alias.contractSymbol || appSymbol,
        priceScale: Number(alias.priceScale || 1) || 1
    };
}

function normalizeUsdmPriceForAppSymbol(rawSymbol, rawPrice) {
    const spec = getUsdmContractSpec(rawSymbol);
    const price = Number(rawPrice);
    if (!spec || !Number.isFinite(price) || price <= 0) return 0;
    return price / spec.priceScale;
}

function scaleUsdmKlineForAppSymbol(row, rawSymbol) {
    return scaleUsdmKlineRow(row, getUsdmContractSpec(rawSymbol));
}

// Takes a resolved spec so batch callers resolve the contract once per symbol,
// not once per candle (2,640 lookups per signal cron otherwise).
function scaleUsdmKlineRow(row, spec) {
    if (!spec || !Array.isArray(row)) return row;
    if (spec.priceScale === 1) return row;
    const out = [...row];
    [1, 2, 3, 4].forEach((idx) => {
        const value = Number(out[idx]);
        if (Number.isFinite(value) && value > 0) {
            out[idx] = String(value / spec.priceScale);
        }
    });
    return out;
}

function normalizeUsdmTickerForAppSymbol(row, appSymbol) {
    const spec = getUsdmContractSpec(appSymbol);
    if (!spec || !row || typeof row !== 'object') return null;
    const out = { ...row, symbol: spec.appSymbol };
    ['lastPrice', 'openPrice', 'highPrice', 'lowPrice', 'weightedAvgPrice', 'priceChange'].forEach((key) => {
        const value = Number(out[key]);
        if (Number.isFinite(value) && value !== 0) {
            out[key] = String(value / spec.priceScale);
        }
    });
    out.contractSymbol = spec.contractSymbol;
    out.priceScale = spec.priceScale;
    out.market = 'BINANCE_USDM';
    return out;
}

function getGateUsdtContract(rawSymbol) {
    const appSymbol = normalizeAllowedSignalSymbol(rawSymbol);
    if (!appSymbol) return '';
    return `${appSymbol.slice(0, -4)}_USDT`;
}

function normalizeGateTickerForAppSymbol(row, appSymbol) {
    const symbol = normalizeAllowedSignalSymbol(appSymbol);
    if (!symbol || !row || typeof row !== 'object') return null;
    const lastPrice = Number(row.last || row.mark_price || 0);
    if (!Number.isFinite(lastPrice) || lastPrice <= 0) return null;
    return {
        symbol,
        contractSymbol: String(row.contract || getGateUsdtContract(symbol)),
        lastPrice: String(lastPrice),
        openPrice: String(Number(row.last || 0) - Number(row.change_price || 0)),
        highPrice: String(Number(row.high_24h || 0) || lastPrice),
        lowPrice: String(Number(row.low_24h || 0) || lastPrice),
        priceChange: String(Number(row.change_price || 0) || 0),
        priceChangePercent: String(Number(row.change_percentage || 0) || 0),
        closeTime: Date.now(),
        fundingRate: String(Number(row.funding_rate || row.funding_rate_indicative || 0) || 0),
        market: 'GATE_USDT_PERP',
        provider: 'gate_usdt_perp'
    };
}

function gateKlineRowsToBinanceShape(rows, interval = '15m') {
    if (!Array.isArray(rows)) return [];
    const intervalMatch = String(interval).match(/^(\d+)([mhdw])$/);
    const amount = Number(intervalMatch?.[1] || 15) || 15;
    const unitMs = { m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 }[intervalMatch?.[2]] || 60_000;
    const intervalMs = amount * unitMs;
    return rows
        .map((row) => {
            if (!row || typeof row !== 'object') return null;
            const openTime = Number(row.t || row.timestamp || 0) * 1000;
            const open = Number(row.o || row.open || 0);
            const high = Number(row.h || row.high || 0);
            const low = Number(row.l || row.low || 0);
            const close = Number(row.c || row.close || 0);
            const volume = Number(row.v || row.volume || 0);
            if (![openTime, open, high, low, close, volume].every(Number.isFinite) || openTime <= 0 || close <= 0) return null;
            return [
                openTime,
                String(open),
                String(high),
                String(low),
                String(close),
                String(volume),
                openTime + intervalMs - 1,
                String(Number(row.sum || 0) || 0),
                0,
                '0',
                '0',
                '0'
            ];
        })
        .filter(Boolean)
        .sort((a, b) => Number(a[0]) - Number(b[0]));
}

function filterAllowedCalls(calls) {
    return Array.isArray(calls)
        ? calls.filter((call) => {
            const time = Number(call?.time || call?.timestamp || call?.notifiedAt || call?.ts || call?.id || 0) || 0;
            const strategy = String(call?.strategyVersion || call?.strategy || call?.reason || call?.source || '');
            return !!normalizeAllowedSignalSymbol(call?.symbol) &&
                time >= CALL_HISTORY_RESET_EPOCH_MS &&
                strategy.includes(SIGNAL_STRATEGY_VERSION);
        })
        : [];
}

function stablePositiveHash(text) {
    const value = String(text || '');
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function normalizeCallTime(raw, fallback = Date.now()) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
    return Math.floor(Number(fallback) || Date.now());
}

function buildCallDedupBucket(time) {
    const safeTime = normalizeCallTime(time, 0);
    return safeTime ? Math.floor(safeTime / CALL_DEDUP_WINDOW_MS) : 0;
}

function buildCanonicalCallKey(symbol, direction, time, strategyVersion = SIGNAL_STRATEGY_VERSION) {
    const safeSymbol = normalizeAllowedSignalSymbol(symbol);
    const safeDirection = normalizeSignalDirection(direction);
    const bucket = buildCallDedupBucket(time);
    if (!safeSymbol || (safeDirection !== 'LONG' && safeDirection !== 'SHORT') || !bucket) return '';
    const strategy = String(strategyVersion || SIGNAL_STRATEGY_VERSION).replace(/[^A-Za-z0-9_:-]/g, '').slice(0, 24) || SIGNAL_STRATEGY_VERSION;
    return `${strategy}:${safeSymbol}:${safeDirection}:${bucket}`;
}

function getCallDedupKey(call) {
    return buildCanonicalCallKey(call?.symbol, call?.direction || call?.signal, call?.time || call?.timestamp || call?.id, call?.strategyVersion);
}

function countCheckedIntervals(call) {
    return CALL_INTERVAL_KEYS.reduce((total, key) => total + (call?.checked?.[key] === true ? 1 : 0), 0);
}

function isFeedbackEligibleStrategy(call) {
    const strategy = String(call?.strategyVersion || call?.reason || call?.source || '');
    return SIGNAL_FEEDBACK_STRATEGY_VERSIONS.some((version) => strategy.includes(version));
}

function scoreCanonicalCall(call) {
    let score = 0;
    if (hasTrustedCallSettlement(call)) score += 200;
    score += countCheckedIntervals(call) * 40;
    if (String(call?.strategyVersion || '').includes(SIGNAL_STRATEGY_VERSION)) score += 30;
    else if (isFeedbackEligibleStrategy(call)) score += 12;
    if (String(call?.source || call?.reason || '').includes('WORKER_SNAPSHOT')) score += 20;
    score += Math.min(100, Math.max(0, Number(call?.confidence || 0) || 0));
    score += Math.min(20, Math.floor((Number(call?.time || 0) || 0) / CALL_DEDUP_WINDOW_MS) % 20);
    return score;
}

function shouldHideCallFromFeedback(call) {
    if (!call) return true;
    if (call.legacyHiddenFromStats === true) return true;
    return !isFeedbackEligibleStrategy(call);
}

function dedupeAndSortCallHistory(rawCalls, now = Date.now()) {
    const normalized = filterAllowedCalls(rawCalls)
        .map((call) => normalizeCallRecordForStorage(call, now))
        .filter(Boolean);
    const grouped = new Map();
    normalized.forEach((call) => {
        const key = getCallDedupKey(call);
        if (!key) return;
        const current = grouped.get(key);
        if (!current || scoreCanonicalCall(call) > scoreCanonicalCall(current)) {
            grouped.set(key, call);
        }
    });
    return [...grouped.values()]
        .map((call) => ({
            ...call,
            legacyHiddenFromStats: shouldHideCallFromFeedback(call) ? true : undefined
        }))
        .sort((a, b) => Number(b.time || 0) - Number(a.time || 0));
}

function buildUniqueCallId(symbol, direction, time, rawId = null) {
    const safeTime = normalizeCallTime(time, Date.now());
    const numericId = Number(rawId);
    if (
        Number.isFinite(numericId) &&
        numericId > 0 &&
        Math.floor(numericId) !== Math.floor(safeTime)
    ) {
        return Math.floor(numericId);
    }
    const suffix = stablePositiveHash(`${symbol}:${direction}`) % 1000;
    const candidate = (safeTime * 1000) + suffix;
    return Number.isSafeInteger(candidate) ? candidate : safeTime + suffix;
}

function normalizeIntervalMap(source, fillValue = null) {
    const map = (source && typeof source === 'object') ? { ...source } : {};
    CALL_INTERVAL_KEYS.forEach((key) => {
        if (map[key] === undefined) map[key] = fillValue;
    });
    return map;
}

function hasTrustedCallSettlement(call) {
    return String(call?.settlementVersion || '').startsWith('worker_settlement_v');
}

function normalizeOfficialOutcomeMaps(rawCall, trustedSettlement) {
    const prices = normalizeIntervalMap(null, null);
    const pnl = normalizeIntervalMap(null, null);
    const checked = normalizeIntervalMap(null, false);
    if (!trustedSettlement) return { prices, pnl, checked };

    CALL_INTERVAL_KEYS.forEach((key) => {
        const isChecked = rawCall?.checked?.[key] === true;
        const price = Number(rawCall?.prices?.[key]);
        const pct = Number(rawCall?.pnl?.[key]);
        if (isChecked && Number.isFinite(price) && price > 0 && Number.isFinite(pct)) {
            prices[key] = price;
            pnl[key] = pct;
            checked[key] = true;
        }
    });

    return { prices, pnl, checked };
}

function sanitizeCallFeatures(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const out = {};
    const allowed = [
        'emaState', 'rsiZone', 'volumeState', 'momentum24h', 'fundingState',
        'confirmations', 'spreadBucket', 'scoreBucket', 'reasonFingerprint',
        'sessionBucket', 'movementBucket'
    ];
    allowed.forEach((key) => {
        const value = raw[key];
        if (value === null || value === undefined) return;
        if (typeof value === 'number') {
            if (Number.isFinite(value)) out[key] = Math.round(value * 1000) / 1000;
            return;
        }
        if (typeof value === 'boolean') {
            out[key] = value;
            return;
        }
        out[key] = String(value).slice(0, 40);
    });
    return Object.keys(out).length > 0 ? out : null;
}

function buildReasonFingerprint(reason) {
    const text = String(reason || '').toLowerCase();
    const parts = [];
    if (/ema|m[eé]dia/.test(text)) parts.push('ema');
    if (/rsi|sobrecompr|sobrevend/.test(text)) parts.push('rsi');
    if (/vol|volume/.test(text)) parts.push('volume');
    if (/funding|taxa/.test(text)) parts.push('funding');
    if (/baixa|short|bear/.test(text)) parts.push('bearish');
    if (/alta|long|bull/.test(text)) parts.push('bullish');
    if (/snapshot/.test(text)) parts.push('snapshot');
    if (/native/.test(text)) parts.push('native');
    return parts.length ? parts.slice(0, 4).join('+') : 'generic';
}

function confidenceBucket(confidence) {
    const n = clampPercent(confidence);
    return `${Math.floor(n / 10) * 10}s`;
}

function gatesBucket(gates) {
    const n = Number(gates);
    if (Number.isFinite(n)) return `${Math.floor(n / 10) * 10}s`;
    const text = String(gates || '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    return text ? text.slice(0, 24) : 'unknown';
}

function getCallMinMovePct(symbol, intervalKey = '4h') {
    const normalized = normalizeAllowedSignalSymbol(symbol);
    const base4h = (normalized === 'BTCUSDT' || normalized === 'ETHUSDT')
        ? 0.20
        : HIGH_BETA_CALL_SYMBOLS.has(normalized)
            ? 0.60
            : 0.35;
    const ratio = intervalKey === '1h' ? 0.60 : intervalKey === '2h' ? 0.78 : 1;
    const floor = intervalKey === '1h' ? 0.12 : intervalKey === '2h' ? 0.16 : 0.20;
    return Math.max(base4h * ratio, floor);
}

function calculateDirectionalPnl(direction, entryPrice, horizonPrice) {
    const entry = Number(entryPrice);
    const price = Number(horizonPrice);
    if (!Number.isFinite(entry) || entry <= 0 || !Number.isFinite(price) || price <= 0) return null;
    const rawPct = ((price - entry) / entry) * 100;
    return normalizeSignalDirection(direction) === 'SHORT'
        ? +(-rawPct).toFixed(3)
        : +rawPct.toFixed(3);
}

function normalizeCallRecordForStorage(rawCall, fallbackNow = Date.now()) {
    if (!rawCall || typeof rawCall !== 'object') return null;
    const symbol = normalizeAllowedSignalSymbol(rawCall.symbol);
    const direction = normalizeSignalDirection(rawCall.direction || rawCall.signal);
    if (!symbol || (direction !== 'LONG' && direction !== 'SHORT')) return null;

    const time = normalizeCallTime(rawCall.time || rawCall.timestamp || rawCall.notifiedAt || rawCall.ts || rawCall.id, fallbackNow);
    const strategyVersion = String(rawCall.strategyVersion || SIGNAL_STRATEGY_VERSION).slice(0, 20);
    const callKey = buildCanonicalCallKey(symbol, direction, time, strategyVersion);
    const trustedSettlement = hasTrustedCallSettlement(rawCall);
    const entryPrice = Number(rawCall.entryPrice ?? rawCall.price ?? 0) || 0;
    const { prices, pnl, checked } = normalizeOfficialOutcomeMaps(rawCall, trustedSettlement);

    return {
        ...rawCall,
        id: buildUniqueCallId(symbol, direction, time, rawCall.id),
        callKey,
        symbol,
        name: String(rawCall.name || '').slice(0, 50),
        short: String(rawCall.short || symbol.replace('USDT', '')).slice(0, 10),
        img: String(rawCall.img || '').slice(0, 200),
        direction,
        confidence: clampPercent(rawCall.confidence),
        gates: String(rawCall.gates || '').slice(0, 20),
        price: entryPrice > 0 ? String(entryPrice).slice(0, 20) : String(rawCall.price || '').slice(0, 20),
        entryPrice: entryPrice > 0 ? entryPrice : null,
        reason: String(rawCall.reason || '').slice(0, 180),
        source: String(rawCall.source || rawCall.reason || '').slice(0, 180),
        strategyVersion,
        time,
        timestamp: time,
        prices,
        pnl,
        checked,
        settlementVersion: trustedSettlement ? String(rawCall.settlementVersion).slice(0, 40) : undefined,
        settledAt: trustedSettlement ? Number(rawCall.settledAt || 0) || undefined : undefined,
        settlementSource: trustedSettlement ? String(rawCall.settlementSource || '').slice(0, 80) || undefined : undefined,
        settlementCandles: trustedSettlement && rawCall.settlementCandles && typeof rawCall.settlementCandles === 'object'
            ? rawCall.settlementCandles
            : undefined,
        legacyHiddenFromStats: rawCall.legacyHiddenFromStats === true ? true : undefined,
        features: sanitizeCallFeatures(rawCall.features)
    };
}

function normalizeSignalDirection(raw) {
    const value = String(raw || '').toUpperCase();
    if (value.includes('LONG')) return 'LONG';
    if (value.includes('SHORT')) return 'SHORT';
    return 'NEUTRO';
}

function applySignalDirectionPolicy(rawDirection, options = {}) {
    const direction = normalizeSignalDirection(rawDirection);
    if (options && options.alreadyFinal === true) return direction;
    if (direction === 'LONG') return 'SHORT';
    if (direction === 'SHORT') return 'LONG';
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
        confidenceThreshold: Math.max(SIGNAL_MIN_CONFIDENCE, Math.min(100, Number(rawPrefs.confidenceThreshold || rawPrefs.confidence_threshold || SIGNAL_MIN_CONFIDENCE) || SIGNAL_MIN_CONFIDENCE)),
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

function hasVisorD1(env) {
    return !!(env?.VISOR_DB && typeof env.VISOR_DB.prepare === 'function');
}

function safeJsonStringify(value, fallback = null) {
    try {
        if (value === undefined) return fallback;
        return JSON.stringify(value);
    } catch (_) {
        return fallback;
    }
}

function safeJsonParse(value, fallback = null) {
    if (value === null || value === undefined || value === '') return fallback;
    try {
        return JSON.parse(String(value));
    } catch (_) {
        return fallback;
    }
}

function bytesToHex(bytes) {
    return Array.from(bytes || []).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(value) {
    const digest = await crypto.subtle.digest('SHA-256', encodeUtf8(String(value || '')));
    return bytesToHex(new Uint8Array(digest));
}

function constantTimeStringEqual(a, b) {
    const left = String(a || '');
    const right = String(b || '');
    const max = Math.max(left.length, right.length);
    let diff = left.length ^ right.length;
    for (let i = 0; i < max; i++) {
        diff |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
    }
    return diff === 0;
}

async function constantTimeSecretEqual(provided, expected) {
    const left = await sha256Hex(String(provided || ''));
    const right = await sha256Hex(String(expected || ''));
    return constantTimeStringEqual(left, right);
}

function normalizeDeviceSecret(raw) {
    const clean = String(raw || '').trim();
    if (!/^[A-Za-z0-9._:-]{32,160}$/.test(clean)) return '';
    return clean;
}

function publicCallRecord(call) {
    if (!call || typeof call !== 'object') return call;
    const copy = { ...call };
    delete copy.deviceId;
    delete copy.userId;
    delete copy.device_id;
    delete copy.user_id;
    delete copy.raw_json;
    return copy;
}

function publicCallsPayload(payload) {
    if (!payload || typeof payload !== 'object') return payload;
    const next = { ...payload };
    if (Array.isArray(next.calls)) next.calls = next.calls.map(publicCallRecord).filter(Boolean);
    if (next.call) next.call = publicCallRecord(next.call);
    return next;
}

function buildD1CallRecord(rawCall, fallbackNow = Date.now()) {
    const normalized = normalizeCallRecordForStorage(rawCall, fallbackNow);
    if (!normalized) return null;
    return {
        ...normalized,
        deviceId: normalizeDeviceId(rawCall?.deviceId || normalized.deviceId || ''),
        userId: normalizeUserId(rawCall?.userId || normalized.userId || '')
    };
}

function d1CallBindValues(rawCall, fallbackNow = Date.now()) {
    const call = buildD1CallRecord(rawCall, fallbackNow);
    if (!call?.callKey) return null;
    const now = Number(fallbackNow || Date.now()) || Date.now();
    const featuresJson = safeJsonStringify(call.features, null);
    const pricesJson = safeJsonStringify(normalizeIntervalMap(call.prices, null), '{}');
    const pnlJson = safeJsonStringify(normalizeIntervalMap(call.pnl, null), '{}');
    const checkedJson = safeJsonStringify(normalizeIntervalMap(call.checked, false), '{}');
    const settlementCandlesJson = safeJsonStringify(call.settlementCandles, null);
    const rawJson = safeJsonStringify(call, '{}');
    return {
        call,
        values: [
            Number(call.id || buildUniqueCallId(call.symbol, call.direction, call.time)) || Date.now(),
            call.callKey,
            call.symbol,
            call.direction,
            clampPercent(call.confidence),
            String(call.gates || '').slice(0, 20) || null,
            String(call.price || '').slice(0, 20) || null,
            Number(call.entryPrice || 0) || null,
            String(call.name || '').slice(0, 50) || null,
            String(call.short || call.symbol.replace('USDT', '')).slice(0, 10) || null,
            String(call.img || '').slice(0, 200) || null,
            String(call.reason || '').slice(0, 180) || null,
            String(call.source || '').slice(0, 180) || null,
            String(call.strategyVersion || SIGNAL_STRATEGY_VERSION).slice(0, 20),
            Number(call.time || call.timestamp || 0) || now,
            Number(call.timestamp || call.time || 0) || now,
            Number(call.entryTime || 0) || null,
            Number(call.priceTime || 0) || null,
            String(call.market || '').slice(0, 30) || null,
            String(call.entrySource || '').slice(0, 50) || null,
            call.deviceId || null,
            call.userId || null,
            featuresJson,
            pricesJson,
            pnlJson,
            checkedJson,
            String(call.settlementVersion || '').slice(0, 40) || null,
            String(call.settlementSource || '').slice(0, 80) || null,
            settlementCandlesJson,
            Number(call.settledAt || 0) || null,
            call.legacyHiddenFromStats === true ? 1 : 0,
            rawJson,
            Number(call.createdAt || call.created_at || now) || now,
            now
        ]
    };
}

const D1_CALL_UPSERT_SQL = `
INSERT INTO calls (
  id, call_key, symbol, direction, confidence, gates, price_text, entry_price,
  name, short, img, reason, source, strategy_version, time, timestamp,
  entry_time, price_time, market, entry_source, device_id, user_id,
  features_json, prices_json, pnl_json, checked_json, settlement_version,
  settlement_source, settlement_candles_json, settled_at, legacy_hidden_from_stats,
  raw_json, created_at, updated_at
) VALUES (
  ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
)
ON CONFLICT(call_key) DO UPDATE SET
  confidence = excluded.confidence,
  gates = excluded.gates,
  price_text = excluded.price_text,
  entry_price = excluded.entry_price,
  name = excluded.name,
  short = excluded.short,
  img = excluded.img,
  reason = excluded.reason,
  source = excluded.source,
  strategy_version = excluded.strategy_version,
  timestamp = excluded.timestamp,
  entry_time = excluded.entry_time,
  price_time = excluded.price_time,
  market = excluded.market,
  entry_source = excluded.entry_source,
  device_id = COALESCE(excluded.device_id, calls.device_id),
  user_id = COALESCE(excluded.user_id, calls.user_id),
  features_json = excluded.features_json,
  prices_json = excluded.prices_json,
  pnl_json = excluded.pnl_json,
  checked_json = excluded.checked_json,
  settlement_version = excluded.settlement_version,
  settlement_source = excluded.settlement_source,
  settlement_candles_json = excluded.settlement_candles_json,
  settled_at = excluded.settled_at,
  legacy_hidden_from_stats = excluded.legacy_hidden_from_stats,
  raw_json = excluded.raw_json,
  updated_at = excluded.updated_at
`;

function d1RowToCall(row) {
    if (!row) return null;
    const raw = safeJsonParse(row.raw_json, {}) || {};
    const call = buildD1CallRecord({
        ...raw,
        id: Number(row.id || raw.id || 0) || raw.id,
        callKey: String(row.call_key || raw.callKey || ''),
        symbol: row.symbol || raw.symbol,
        direction: row.direction || raw.direction,
        confidence: Number(row.confidence ?? raw.confidence),
        gates: row.gates ?? raw.gates,
        price: row.price_text ?? raw.price,
        entryPrice: Number(row.entry_price ?? raw.entryPrice ?? 0) || raw.entryPrice,
        name: row.name ?? raw.name,
        short: row.short ?? raw.short,
        img: row.img ?? raw.img,
        reason: row.reason ?? raw.reason,
        source: row.source ?? raw.source,
        strategyVersion: row.strategy_version ?? raw.strategyVersion,
        time: Number(row.time || raw.time || raw.timestamp || 0),
        timestamp: Number(row.timestamp || row.time || raw.timestamp || raw.time || 0),
        entryTime: Number(row.entry_time || raw.entryTime || 0) || undefined,
        priceTime: Number(row.price_time || raw.priceTime || 0) || undefined,
        market: row.market ?? raw.market,
        entrySource: row.entry_source ?? raw.entrySource,
        deviceId: row.device_id ?? raw.deviceId,
        userId: row.user_id ?? raw.userId,
        features: safeJsonParse(row.features_json, raw.features || null),
        prices: safeJsonParse(row.prices_json, raw.prices || null),
        pnl: safeJsonParse(row.pnl_json, raw.pnl || null),
        checked: safeJsonParse(row.checked_json, raw.checked || null),
        settlementVersion: row.settlement_version ?? raw.settlementVersion,
        settlementSource: row.settlement_source ?? raw.settlementSource,
        settlementCandles: safeJsonParse(row.settlement_candles_json, raw.settlementCandles || null),
        settledAt: Number(row.settled_at || raw.settledAt || 0) || undefined,
        legacyHiddenFromStats: Number(row.legacy_hidden_from_stats || 0) === 1 || raw.legacyHiddenFromStats === true,
        createdAt: Number(row.created_at || raw.createdAt || 0) || undefined,
        updatedAt: Number(row.updated_at || raw.updatedAt || 0) || undefined
    }, Date.now());
    return call;
}

async function d1PersistCalls(env, rawCalls, options = {}) {
    if (!hasVisorD1(env) || !Array.isArray(rawCalls) || rawCalls.length === 0) {
        return { written: 0, calls: [] };
    }
    const now = Number(options.now || Date.now()) || Date.now();
    const rows = rawCalls
        .map((call) => d1CallBindValues(call, now))
        .filter(Boolean);
    let written = 0;
    for (let i = 0; i < rows.length; i += 20) {
        const batch = rows.slice(i, i + 20).map((row) =>
            env.VISOR_DB.prepare(D1_CALL_UPSERT_SQL).bind(...row.values)
        );
        if (batch.length > 0) {
            await env.VISOR_DB.batch(batch);
            written += batch.length;
        }
    }
    if (written > 0) await d1BumpCallsRevision(env).catch(() => false);
    return { written, calls: rows.map((row) => row.call) };
}

async function d1FindDuplicateCall(env, call) {
    if (!hasVisorD1(env) || !call) return null;
    const strategyVersion = String(call.strategyVersion || SIGNAL_STRATEGY_VERSION).slice(0, 20);
    const incomingKey = buildCanonicalCallKey(call.symbol, call.direction, call.time, strategyVersion);
    const row = await env.VISOR_DB.prepare(`
        SELECT * FROM calls
        WHERE strategy_version = ?
          AND (
            call_key = ?
            OR (symbol = ? AND direction = ? AND ABS(time - ?) < ?)
          )
        ORDER BY time DESC
        LIMIT 1
    `).bind(
        strategyVersion,
        incomingKey,
        call.symbol,
        call.direction,
        Number(call.time || 0) || 0,
        CALL_DEDUP_WINDOW_MS
    ).first();
    return d1RowToCall(row);
}

async function d1RecordCall(env, rawCall, identity = {}) {
    if (!hasVisorD1(env)) return null;
    const now = Date.now();
    const call = buildD1CallRecord({
        ...rawCall,
        deviceId: identity.deviceId || rawCall?.deviceId || '',
        userId: identity.userId || rawCall?.userId || ''
    }, now);
    if (!call) return { success: false, error: 'Invalid call' };
    if (call.confidence < SIGNAL_MIN_CONFIDENCE) {
        return { success: false, error: 'Confidence below strategy minimum' };
    }
    const duplicate = await d1FindDuplicateCall(env, call);
    if (duplicate) {
        return {
            success: true,
            duplicate: true,
            message: 'Call already recorded',
            call: publicCallRecord(duplicate),
            source: 'd1'
        };
    }
    await d1PersistCalls(env, [call], { now });
    const stored = await d1FindDuplicateCall(env, call);
    return {
        success: true,
        duplicate: false,
        call: publicCallRecord(stored || call),
        source: 'd1'
    };
}

async function d1ListCalls(env, options = {}) {
    if (!hasVisorD1(env)) return [];
    const limit = Math.min(Math.max(Number(options.limit || 100) || 100, 1), 500);
    const direction = normalizeSignalDirection(options.direction || '');
    const hasDirection = direction === 'LONG' || direction === 'SHORT';
    const stmt = hasDirection
        ? env.VISOR_DB.prepare('SELECT * FROM calls WHERE strategy_version = ? AND direction = ? ORDER BY time DESC LIMIT ?').bind(SIGNAL_STRATEGY_VERSION, direction, limit)
        : env.VISOR_DB.prepare('SELECT * FROM calls WHERE strategy_version = ? ORDER BY time DESC LIMIT ?').bind(SIGNAL_STRATEGY_VERSION, limit);
    const result = await stmt.all();
    return Array.isArray(result?.results)
        ? result.results.map(d1RowToCall).filter(Boolean)
        : [];
}

async function d1GetCallsPayload(env, options = {}) {
    if (!hasVisorD1(env)) return null;
    const limit = Math.min(Math.max(Number(options.limit || 100) || 100, 1), 500);
    const filterDir = normalizeSignalDirection(options.direction || '');
    const settlementLimit = Math.min(120, Math.max(20, limit));
    // Only list the settlement window when settling; plain reads skipped it anyway.
    const settlementCalls = options.settle === true ? await d1ListCalls(env, { limit: settlementLimit }) : [];
    let settlement = {
        version: CALL_SETTLEMENT_VERSION,
        settledIntervals: 0,
        fetches: 0,
        touchedCalls: 0,
        changed: false,
        skipped: false,
        lastSettlementAt: null
    };

    if (options.settle === true && settlementCalls.length > 0) {
        const result = await settlePendingCallOutcomes(settlementCalls, {
            maxCalls: settlementLimit,
            maxFetches: Math.min(12, Math.max(1, Number(options.maxFetches || 12) || 12))
        });
        settlement = {
            version: CALL_SETTLEMENT_VERSION,
            settledIntervals: Number(result.settledIntervals || 0) || 0,
            fetches: Number(result.fetches || 0) || 0,
            touchedCalls: Number(result.touchedCalls || 0) || 0,
            changed: !!result.changed,
            skipped: false,
            lastSettlementAt: Date.now()
        };
        if (result.changed) {
            await d1PersistCalls(env, result.calls, { now: Date.now() });
        }
    }

    let calls = await d1ListCalls(env, {
        limit,
        direction: filterDir === 'LONG' || filterDir === 'SHORT' ? filterDir : ''
    });

    return {
        success: true,
        calls: calls.map(publicCallRecord).filter(Boolean),
        total: calls.length,
        source: 'd1',
        storageVersion: 'd1_v1',
        settlement
    };
}

function parseCallsPageCacheEntry(text) {
    if (typeof text !== 'string' || text.charCodeAt(text.length - 1) !== 125) return null;
    const header = /^\{"revision":(\d+),"builtAt":(\d+),"hasCalls":(true|false),"body":/.exec(text);
    if (!header) return null;
    return {
        revision: Number(header[1]),
        builtAt: Number(header[2]),
        hasCalls: header[3] === 'true',
        body: text.slice(header[0].length, -1)
    };
}

// GET /calls is polled by every open app and used to rebuild and re-serialise
// hundreds of calls per request. The page only changes when a call is written,
// so the serialised body is stored in D1 tagged with the calls revision; a hit
// is one indexed query with no per-call parsing or JSON.stringify.
async function d1GetCallsPageCached(env, options = {}) {
    if (!hasVisorD1(env)) return null;
    const limit = Math.min(Math.max(Number(options.limit || 100) || 100, 1), 500);
    const direction = normalizeSignalDirection(options.direction || '');
    const directionKey = direction === 'LONG' || direction === 'SHORT' ? direction : 'ALL';
    const cacheKey = `${CALLS_PAGE_CACHE_PREFIX}${limit}:${directionKey}`;

    const rows = await d1ReadRuntimeRows(env, [CALLS_REVISION_KEY, cacheKey]);
    const revision = callsRevisionFromRows(rows);
    const cached = parseCallsPageCacheEntry(rows.get(cacheKey)?.payload_json);
    if (cached && cached.revision === revision && Date.now() - cached.builtAt < CALLS_PAGE_CACHE_MAX_AGE_MS) {
        return { body: cached.body, hasCalls: cached.hasCalls, cache: 'd1-page' };
    }
    if (options.inline !== true && env?.CALL_HISTORY_DO) {
        const rebuilt = await rebuildCallsPageViaDurableObject(env, limit, directionKey);
        if (rebuilt) return rebuilt;
    }

    const payload = await d1GetCallsPayload(env, {
        limit,
        direction: directionKey === 'ALL' ? '' : directionKey
    });
    if (!payload) return null;
    const body = JSON.stringify(payload);
    const hasCalls = payload.calls.length > 0;
    const builtAt = Date.now();
    await env.VISOR_DB.prepare(`
        INSERT INTO runtime_status (status_key, payload_json, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(status_key) DO UPDATE SET
          payload_json = excluded.payload_json,
          updated_at = excluded.updated_at
    `).bind(
        cacheKey,
        `{"revision":${revision},"builtAt":${builtAt},"hasCalls":${hasCalls},"body":${body}}`,
        builtAt
    ).run().catch(() => false);
    return { body, hasCalls, cache: 'd1' };
}

async function rebuildCallsPageViaDurableObject(env, limit, directionKey) {
    try {
        const doStub = env.CALL_HISTORY_DO.get(env.CALL_HISTORY_DO.idFromName('global'));
        const resp = await doStub.fetch('https://call-history.internal/internal/calls-page', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ limit, direction: directionKey })
        });
        if (!resp.ok) return null;
        return { body: await resp.text(), hasCalls: resp.headers.get('X-Visor-Has-Calls') === '1', cache: 'd1-do' };
    } catch (e) {
        console.warn('Calls page DO rebuild failed:', e?.message || e);
        return null;
    }
}

async function d1SettleCalls(env, options = {}) {
    if (!hasVisorD1(env)) return null;
    const maxCalls = Math.min(120, Math.max(1, Number(options.maxCalls || 80) || 80));
    const maxFetches = Math.min(12, Math.max(1, Number(options.maxFetches || 8) || 8));
    const current = await d1ListCalls(env, { limit: maxCalls });
    const result = await settlePendingCallOutcomes(current, { maxCalls, maxFetches, force: true });
    if (result.changed) {
        await d1PersistCalls(env, result.calls, { now: Date.now() });
    }
    return {
        success: true,
        settlementVersion: CALL_SETTLEMENT_VERSION,
        changed: !!result.changed,
        settledIntervals: Number(result.settledIntervals || 0) || 0,
        fetches: Number(result.fetches || 0) || 0,
        total: Array.isArray(result.calls) ? result.calls.length : 0,
        source: 'd1'
    };
}

async function d1CallCount(env) {
    if (!hasVisorD1(env)) return 0;
    const row = await env.VISOR_DB.prepare('SELECT COUNT(*) AS total FROM calls').first();
    return Number(row?.total || 0) || 0;
}

async function d1ResetCalls(env) {
    if (!hasVisorD1(env)) return false;
    await env.VISOR_DB.batch([
        env.VISOR_DB.prepare('DELETE FROM calls'),
        env.VISOR_DB.prepare('DELETE FROM signal_stats'),
        env.VISOR_DB.prepare('DELETE FROM notification_events')
    ]);
    await d1BumpCallsRevision(env).catch(() => false);
    return true;
}

function d1DeviceRowToDevice(row) {
    if (!row) return null;
    const prefs = normalizeNotificationPrefs(safeJsonParse(row.prefs_json, {}) || {});
    return {
        deviceId: normalizeDeviceId(row.device_id),
        userId: normalizeUserId(row.user_id || ''),
        token: String(row.token || ''),
        platform: String(row.platform || 'android').slice(0, 30),
        appVersion: String(row.app_version || '').slice(0, 40),
        prefs,
        updatedAt: Number(row.updated_at || 0) || 0,
        expiresAt: Number(row.expires_at || 0) || 0
    };
}

async function d1ListNotificationDevices(env) {
    if (!hasVisorD1(env)) return [];
    const now = Date.now();
    const result = await env.VISOR_DB.prepare(`
        SELECT * FROM devices
        WHERE enabled = 1
          AND token IS NOT NULL
          AND token != ''
          AND (expires_at IS NULL OR expires_at > ?)
        ORDER BY updated_at DESC
        LIMIT 5000
    `).bind(now).all();
    return Array.isArray(result?.results)
        ? result.results.map(d1DeviceRowToDevice).filter((item) => item?.deviceId && item?.token)
        : [];
}

async function d1SaveNotificationDevice(env, device) {
    if (!hasVisorD1(env) || !device?.deviceId) return false;
    const now = Date.now();
    const prefs = device?.prefs ? normalizeNotificationPrefs(device.prefs) : null;
    await env.VISOR_DB.prepare(`
        INSERT INTO devices (
          device_id, user_id, token, platform, app_version, prefs_json,
          enabled, updated_at, last_seen_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
        ON CONFLICT(device_id) DO UPDATE SET
          user_id = COALESCE(excluded.user_id, devices.user_id),
          token = excluded.token,
          platform = excluded.platform,
          app_version = excluded.app_version,
          prefs_json = COALESCE(excluded.prefs_json, devices.prefs_json),
          enabled = 1,
          updated_at = excluded.updated_at,
          last_seen_at = excluded.last_seen_at,
          expires_at = excluded.expires_at
    `).bind(
        device.deviceId,
        normalizeUserId(device.userId || '') || null,
        String(device.token || '').trim(),
        String(device.platform || 'android').slice(0, 30),
        String(device.appVersion || '').slice(0, 40),
        prefs ? safeJsonStringify(prefs, '{}') : null,
        Number(device.updatedAt || now) || now,
        now,
        now + NOTIF_PREFS_SYNC_WINDOW_SECONDS * 1000
    ).run();
    return true;
}

async function d1SaveNotificationPrefs(env, deviceId, prefs, identity = {}) {
    if (!hasVisorD1(env) || !deviceId) return false;
    const now = Date.now();
    const normalized = normalizeNotificationPrefs(prefs);
    await env.VISOR_DB.prepare(`
        INSERT INTO devices (
          device_id, user_id, token, platform, app_version, prefs_json,
          enabled, updated_at, last_seen_at, expires_at
        ) VALUES (?, ?, '', 'android', '', ?, ?, ?, ?, ?)
        ON CONFLICT(device_id) DO UPDATE SET
          user_id = COALESCE(excluded.user_id, devices.user_id),
          prefs_json = excluded.prefs_json,
          enabled = excluded.enabled,
          updated_at = excluded.updated_at,
          last_seen_at = excluded.last_seen_at,
          expires_at = excluded.expires_at
    `).bind(
        deviceId,
        normalizeUserId(identity.userId || '') || null,
        safeJsonStringify(normalized, '{}'),
        normalized.enabled === true ? 1 : 0,
        now,
        now,
        now + NOTIF_PREFS_SYNC_WINDOW_SECONDS * 1000
    ).run();
    return true;
}

async function d1RemoveNotificationDevice(env, deviceId) {
    if (!hasVisorD1(env) || !deviceId) return false;
    await env.VISOR_DB.prepare(`
        UPDATE devices
        SET enabled = 0, token = '', updated_at = ?, last_seen_at = ?
        WHERE device_id = ?
    `).bind(Date.now(), Date.now(), deviceId).run();
    return true;
}

async function hashDeviceSecret(env, deviceId, deviceSecret) {
    const authSecret = getAuthSecret(env);
    if (!authSecret || !deviceId || !deviceSecret) return '';
    return sha256Hex(`${deviceId}:${deviceSecret}:${authSecret}`);
}

async function verifyOrRegisterDeviceSecret(env, deviceId, deviceSecret, userId = '') {
    const safeDeviceId = normalizeDeviceId(deviceId);
    const safeSecret = normalizeDeviceSecret(deviceSecret);
    if (!hasVisorD1(env) || !safeDeviceId || !safeSecret) return { ok: false, error: 'Missing device proof' };

    const now = Date.now();
    const secretHash = await hashDeviceSecret(env, safeDeviceId, safeSecret);
    if (!secretHash) return { ok: false, error: 'Auth service unavailable' };

    let row = null;
    try {
        row = await env.VISOR_DB.prepare(`
            SELECT device_secret_hash FROM devices WHERE device_id = ?
        `).bind(safeDeviceId).first();
    } catch (e) {
        return { ok: false, error: 'Device proof storage unavailable' };
    }

    if (!row) {
        await env.VISOR_DB.prepare(`
            INSERT INTO devices (
              device_id, user_id, token, platform, app_version, prefs_json,
              enabled, updated_at, last_seen_at, expires_at,
              device_secret_hash, device_secret_created_at, device_secret_last_seen_at
            ) VALUES (?, ?, '', 'android', '', '{}', 0, ?, ?, ?, ?, ?, ?)
        `).bind(
            safeDeviceId,
            normalizeUserId(userId || '') || null,
            now,
            now,
            now + NOTIF_PREFS_SYNC_WINDOW_SECONDS * 1000,
            secretHash,
            now,
            now
        ).run();
        return { ok: true, registered: true };
    }

    const storedHash = String(row.device_secret_hash || '');
    if (!storedHash) {
        await env.VISOR_DB.prepare(`
            UPDATE devices
            SET device_secret_hash = ?,
                device_secret_created_at = COALESCE(device_secret_created_at, ?),
                device_secret_last_seen_at = ?,
                user_id = COALESCE(?, user_id),
                updated_at = ?,
                last_seen_at = ?
            WHERE device_id = ?
        `).bind(
            secretHash,
            now,
            now,
            normalizeUserId(userId || '') || null,
            now,
            now,
            safeDeviceId
        ).run();
        return { ok: true, registered: true };
    }

    if (!constantTimeStringEqual(storedHash, secretHash)) {
        return { ok: false, error: 'Device proof mismatch' };
    }

    await env.VISOR_DB.prepare(`
        UPDATE devices
        SET device_secret_last_seen_at = ?, last_seen_at = ?, updated_at = ?
        WHERE device_id = ?
    `).bind(now, now, now, safeDeviceId).run();
    return { ok: true, registered: false };
}

async function d1RecordNotificationEvent(env, event) {
    if (!hasVisorD1(env) || !event?.deviceId || !event?.symbol || !event?.direction) return false;
    const now = Date.now();
    const direction = normalizeSignalDirection(event.direction);
    const symbol = normalizeAllowedSignalSymbol(event.symbol);
    if (!symbol || (direction !== 'LONG' && direction !== 'SHORT')) return false;
    const dedupBucket = Math.floor((Number(event.ts || now) || now) / (NOTIF_DEDUP_SECONDS * 1000));
    const eventKey = `${event.deviceId}:${symbol}:${direction}:${dedupBucket}`;
    await env.VISOR_DB.prepare(`
        INSERT OR IGNORE INTO notification_events (
          event_key, device_id, symbol, direction, dedup_bucket, event_ts,
          sent_ok, status, error, payload_json, created_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
        eventKey,
        normalizeDeviceId(event.deviceId),
        symbol,
        direction,
        dedupBucket,
        Number(event.ts || now) || now,
        event.sentOk === true ? 1 : 0,
        Number(event.status || 0) || null,
        String(event.error || '').slice(0, 180) || null,
        safeJsonStringify(event.payload || null, null),
        now,
        now + NOTIF_PREFS_SYNC_WINDOW_SECONDS * 1000
    ).run();
    return true;
}

async function d1WriteRuntimeStatus(env, key, payload) {
    if (!hasVisorD1(env)) return false;
    const safeKey = String(key || '').replace(/[^a-z0-9._:-]/gi, '').slice(0, 80);
    if (!safeKey) return false;
    const updatedAt = Number(payload?.updatedAt || Date.now()) || Date.now();
    await env.VISOR_DB.prepare(`
        INSERT INTO runtime_status (status_key, payload_json, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(status_key) DO UPDATE SET
          payload_json = excluded.payload_json,
          updated_at = excluded.updated_at
    `).bind(safeKey, safeJsonStringify(payload || {}, '{}'), updatedAt).run();
    return true;
}

async function d1ReadRuntimeStatus(env, key) {
    if (!hasVisorD1(env)) return null;
    const safeKey = String(key || '').replace(/[^a-z0-9._:-]/gi, '').slice(0, 80);
    if (!safeKey) return null;
    const row = await env.VISOR_DB.prepare(
        'SELECT payload_json, updated_at FROM runtime_status WHERE status_key = ?'
    ).bind(safeKey).first();
    if (!row) return null;
    const payload = safeJsonParse(row.payload_json, {}) || {};
    payload.updatedAt = Number(payload.updatedAt || row.updated_at || 0) || 0;
    return payload;
}

async function d1ReadRuntimeRows(env, keys) {
    const rows = new Map();
    if (!hasVisorD1(env) || !Array.isArray(keys) || keys.length === 0) return rows;
    const result = await env.VISOR_DB.prepare(
        `SELECT status_key, payload_json, updated_at FROM runtime_status WHERE status_key IN (${keys.map(() => '?').join(', ')})`
    ).bind(...keys).all();
    (Array.isArray(result?.results) ? result.results : []).forEach((row) => rows.set(row.status_key, row));
    return rows;
}

// Every write to `calls` bumps this counter (updated_at, strictly increasing).
// Caches derived from the calls table are tagged with the revision they were
// built from, so they stay valid until a call is recorded or settled.
async function d1BumpCallsRevision(env) {
    if (!hasVisorD1(env)) return false;
    await env.VISOR_DB.prepare(`
        INSERT INTO runtime_status (status_key, payload_json, updated_at)
        VALUES (?, '{}', ?)
        ON CONFLICT(status_key) DO UPDATE SET
          updated_at = MAX(runtime_status.updated_at + 1, excluded.updated_at)
    `).bind(CALLS_REVISION_KEY, Date.now()).run();
    return true;
}

function callsRevisionFromRows(rows) {
    return Number(rows?.get(CALLS_REVISION_KEY)?.updated_at || 0) || 0;
}

// Cross-isolate "at most once per ttlMs" guard backed by one D1 row.
async function tryAcquireRuntimeLock(env, key, ttlMs) {
    if (!hasVisorD1(env)) return true;
    const now = Date.now();
    try {
        const result = await env.VISOR_DB.prepare(`
            INSERT INTO runtime_status (status_key, payload_json, updated_at)
            VALUES (?, '{}', ?)
            ON CONFLICT(status_key) DO UPDATE SET updated_at = excluded.updated_at
            WHERE runtime_status.updated_at <= ?
        `).bind(key, now, now - ttlMs).run();
        return Number(result?.meta?.changes || 0) > 0;
    } catch (_) {
        return false;
    }
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
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Device-Id, X-User-Id, X-Device-Secret, Idempotency-Key, X-App-Client, X-Admin-Token',
        'Access-Control-Expose-Headers': 'X-RateLimit-Limit, X-RateLimit-Remaining, Retry-After, X-Visor-Cache',
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

function createExternalBudget(limit = 48) {
    return { limit: Math.max(1, Number(limit) || 48), remaining: Math.max(1, Number(limit) || 48), used: 0 };
}

function consumeExternalBudget(budget) {
    if (!budget) return true;
    if (Number(budget.remaining || 0) <= 0) return false;
    budget.remaining -= 1;
    budget.used = Number(budget.used || 0) + 1;
    return true;
}

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

async function getFcmAccessToken(env, externalBudget = null) {
    const now = Date.now();
    if (FCM_ACCESS_TOKEN_CACHE.token && FCM_ACCESS_TOKEN_CACHE.expiresAt > now + 60_000) {
        return FCM_ACCESS_TOKEN_CACHE.token;
    }

    // Share the OAuth token across isolates: signing the RS256 assertion costs
    // ~3 ms of CPU, a third of the Free plan budget, on every fresh isolate.
    const tokenOwner = `${getSecret(env, 'FCM_PROJECT_ID')}|${getSecret(env, 'FCM_CLIENT_EMAIL')}`;
    if (env?.CALENDAR_KV) {
        try {
            const shared = await env.CALENDAR_KV.get(FCM_ACCESS_TOKEN_KV_KEY, 'json');
            if (shared?.token && shared.owner === tokenOwner && Number(shared.expiresAt || 0) > now + 5 * 60_000) {
                FCM_ACCESS_TOKEN_CACHE = { token: String(shared.token), expiresAt: Number(shared.expiresAt) };
                globalThis.__visorFcmAccessTokenCache = FCM_ACCESS_TOKEN_CACHE;
                return FCM_ACCESS_TOKEN_CACHE.token;
            }
        } catch (_) {}
    }

    const assertion = await signServiceAccountJwt(env);
    if (!assertion) return '';

    if (!consumeExternalBudget(externalBudget)) return '';
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
    if (env?.CALENDAR_KV) {
        const ttlSeconds = Math.floor((FCM_ACCESS_TOKEN_CACHE.expiresAt - now) / 1000) - 60;
        if (ttlSeconds >= 60) {
            await env.CALENDAR_KV.put(FCM_ACCESS_TOKEN_KV_KEY, JSON.stringify({
                token,
                owner: tokenOwner,
                expiresAt: FCM_ACCESS_TOKEN_CACHE.expiresAt
            }), { expirationTtl: ttlSeconds }).catch(() => false);
        }
    }
    return token;
}

function buildFcmSignalData(signal) {
    const ts = Number(signal.ts || Date.now()) || Date.now();
    const direction = normalizeSignalDirection(signal.finalDirection || signal.direction || signal.signal);
    const confidence = clampPercent(signal.finalConfidence || signal.confidence);
    const snapshotId = String(signal.snapshotId || `${signal.symbol}_${direction}_${Math.floor(ts / 1800000)}`);
    const expiresAt = Number(signal.expiresAt || (ts + 30 * 60 * 1000)) || (ts + 30 * 60 * 1000);
    const eventId = String(signal.eventId || `${SIGNAL_TOPIC_PROTOCOL_VERSION}:${signal.symbol}:${direction}:${Math.floor(ts / (NOTIF_DEDUP_SECONDS * 1000))}`);
    return {
        type: 'signal',
        eventId,
        pushProtocol: String(signal.pushProtocol || SIGNAL_TOPIC_PROTOCOL_VERSION),
        strategyVersion: String(signal.strategyVersion || SIGNAL_STRATEGY_VERSION),
        symbol: String(signal.symbol || ''),
        short: String(signal.short || String(signal.symbol || '').replace('USDT', '')),
        direction,
        finalDirection: direction,
        confidence: String(confidence),
        finalConfidence: String(confidence),
        price: String(signal.entryPrice || signal.price || ''),
        reason: String(signal.reason || '').slice(0, 180),
        ts: String(ts),
        notifiedAt: String(ts),
        expiresAt: String(expiresAt),
        snapshotId,
        notificationId: String(signal.notificationId || Math.abs(`${signal.symbol}_${direction}_${Math.floor(ts / 1800000)}`.split('').reduce((a, c) => ((a << 5) - a) + c.charCodeAt(0), 0)))
    };
}

function buildFcmAndroidConfig(signal) {
    const symbol = normalizeAllowedSignalSymbol(signal?.symbol) || 'signal';
    return {
        priority: 'HIGH',
        ttl: `${NOTIF_DEDUP_SECONDS}s`,
        collapseKey: `${SIGNAL_TOPIC_PROTOCOL_VERSION}_${symbol}`,
        restrictedPackageName: 'com.visorcrypto.app'
    };
}

async function sendFcmSignal(env, token, signal, externalBudget = null) {
    try {
        const projectId = getSecret(env, 'FCM_PROJECT_ID');
        const accessToken = await getFcmAccessToken(env, externalBudget);
        if (!projectId || !accessToken || !token) {
            return { ok: false, status: 503, error: 'FCM not configured' };
        }
        const data = buildFcmSignalData(signal);
        if (!consumeExternalBudget(externalBudget)) {
            return { ok: false, status: 429, error: 'FCM external request budget exhausted' };
        }
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
                    android: buildFcmAndroidConfig(signal)
                }
            }),
            signal: AbortSignal.timeout(10000)
        });
        return { ok: resp.ok, status: resp.status, body: resp.ok ? '' : await resp.text().catch(() => '') };
    } catch (e) {
        return { ok: false, status: 0, error: String(e?.message || e || 'FCM request failed').slice(0, 180) };
    }
}

async function sendFcmTopicSignal(env, topic, signal, externalBudget = null) {
    try {
        const projectId = getSecret(env, 'FCM_PROJECT_ID');
        const accessToken = await getFcmAccessToken(env, externalBudget);
        if (!projectId || !accessToken || !topic) {
            return { ok: false, status: 503, error: 'FCM topic delivery unavailable' };
        }
        const data = buildFcmSignalData(signal);
        if (!consumeExternalBudget(externalBudget)) {
            return { ok: false, status: 429, error: 'FCM topic request budget exhausted', topic };
        }
        const resp = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify({
                message: {
                    topic,
                    data,
                    android: buildFcmAndroidConfig(signal)
                }
            }),
            signal: AbortSignal.timeout(10000)
        });
        return {
            ok: resp.ok,
            status: resp.status,
            body: resp.ok ? '' : await resp.text().catch(() => ''),
            topic
        };
    } catch (e) {
        return { ok: false, status: 0, error: String(e?.message || e || 'FCM topic request failed').slice(0, 180), topic };
    }
}

async function sendFcmWithRetry(send) {
    let result = await send();
    if (result?.ok || ![0, 429, 500, 502, 503, 504].includes(Number(result?.status || 0))) return result;
    await new Promise((resolve) => setTimeout(resolve, 350));
    result = await send();
    return result;
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
        bucket = { count: 0, resetAt: now + windowMs, lastSyncAt: 0 };
    }

    if (bucket.count >= limit) {
        RATE_LIMIT_BUCKETS.set(key, bucket);
        return { allowed: false, remaining: 0 };
    }

    bucket.count += 1;
    RATE_LIMIT_BUCKETS.set(key, bucket);

    return { allowed: true, remaining: Math.max(0, limit - bucket.count), resetAt: bucket.resetAt };
}

async function checkPersistentRateLimit(env, key, limit, windowSeconds) {
    const safeKey = String(key || '').replace(/[^A-Za-z0-9:_-]/g, '_').slice(0, 160);
    if (!safeKey || !hasVisorD1(env)) {
        return checkRateLimit(env, safeKey || key, limit, windowSeconds);
    }

    const now = Date.now();
    const resetAt = now + (windowSeconds * 1000);
    try {
        const row = await env.VISOR_DB.prepare(
            'SELECT count, reset_at FROM rate_limits WHERE key = ?'
        ).bind(safeKey).first();

        if (!row || Number(row.reset_at || 0) <= now) {
            await env.VISOR_DB.prepare(`
                INSERT INTO rate_limits (key, count, reset_at, updated_at)
                VALUES (?, 1, ?, ?)
                ON CONFLICT(key) DO UPDATE SET count = 1, reset_at = excluded.reset_at, updated_at = excluded.updated_at
            `).bind(safeKey, resetAt, now).run();
            return { allowed: true, remaining: Math.max(0, limit - 1), resetAt };
        }

        const count = Number(row.count || 0) || 0;
        if (count >= limit) {
            return { allowed: false, remaining: 0, resetAt: Number(row.reset_at || resetAt) || resetAt };
        }

        await env.VISOR_DB.prepare(`
            UPDATE rate_limits SET count = count + 1, updated_at = ? WHERE key = ?
        `).bind(now, safeKey).run();
        return { allowed: true, remaining: Math.max(0, limit - count - 1), resetAt: Number(row.reset_at || resetAt) || resetAt };
    } catch (e) {
        console.warn('D1 rate limit failed, falling back to memory:', e?.message || e);
        return checkRateLimit(env, safeKey, limit, windowSeconds);
    }
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

function findHistoricalCloseAtOrAfter(klines, targetTs) {
    if (!Array.isArray(klines) || !targetTs) return null;
    for (const row of klines) {
        const openTs = Number(row?.[0] || 0);
        const closeTs = Number(row?.[6] || 0);
        if ((closeTs || openTs) >= targetTs) {
            const close = Number(row?.[4]);
            return Number.isFinite(close) && close > 0
                ? { price: close, openTime: openTs || null, closeTime: closeTs || null }
                : null;
        }
    }
    return null;
}

async function fetchHistoricalCloseAtOrAfter(symbol, targetTs) {
    const safeSymbol = normalizeAllowedSignalSymbol(symbol);
    const spec = getUsdmContractSpec(safeSymbol);
    const safeTargetTs = Number(targetTs || 0);
    if (!safeSymbol || !spec || !safeTargetTs) return null;

    const startTime = Math.max(0, safeTargetTs - (2 * 60 * 1000));
    const endTime = safeTargetTs + (12 * 60 * 1000);
    const query = `symbol=${spec.contractSymbol}&interval=1m&startTime=${startTime}&endTime=${endTime}&limit=20`;

    for (const host of BINANCE_USDM_HOSTS) {
        try {
            const resp = await fetch(`${host}/fapi/v1/klines?${query}`, BINANCE_FETCH_INIT);
            if (!resp.ok) continue;
            const klines = await resp.json().catch(() => null);
            const close = findHistoricalCloseAtOrAfter(klines, safeTargetTs);
            if (Number.isFinite(Number(close?.price)) && Number(close.price) > 0) {
                const rawPrice = Number(close.price);
                return {
                    ...close,
                    price: normalizeUsdmPriceForAppSymbol(safeSymbol, rawPrice),
                    rawPrice,
                    contractSymbol: spec.contractSymbol,
                    priceScale: spec.priceScale,
                    market: 'BINANCE_USDM',
                    host
                };
            }
        } catch (_) {}
    }

    return null;
}

async function settlePendingCallOutcomes(rawCalls, options = {}) {
    const now = Number(options.now || Date.now()) || Date.now();
    const maxCalls = Math.max(1, Number(options.maxCalls || 25) || 25);
    const maxFetches = Math.max(1, Number(options.maxFetches || 75) || 75);
    let changed = false;
    let settledIntervals = 0;
    let fetches = 0;
    let touchedCalls = 0;

    const calls = Array.isArray(rawCalls)
        ? rawCalls.map((call) => normalizeCallRecordForStorage(call, now)).filter(Boolean)
        : [];
    if (calls.length !== (Array.isArray(rawCalls) ? rawCalls.length : 0)) changed = true;

    for (const call of calls) {
        if (touchedCalls >= maxCalls || fetches >= maxFetches) break;
        const entry = Number(call.entryPrice ?? call.price ?? 0) || 0;
        if (!entry || !call.symbol || (call.direction !== 'LONG' && call.direction !== 'SHORT')) continue;

        let touchedThisCall = false;
        call.prices = normalizeIntervalMap(call.prices, null);
        call.pnl = normalizeIntervalMap(call.pnl, null);
        call.checked = normalizeIntervalMap(call.checked, false);
        const settlementWasCurrent = call.settlementVersion === CALL_SETTLEMENT_VERSION &&
            call.settlementSource === CALL_SETTLEMENT_SOURCE;

        for (const interval of CALL_SETTLEMENT_INTERVALS) {
            if (fetches >= maxFetches) break;
            const targetTs = Number(call.time || 0) + interval.ms;
            if (!targetTs || now < targetTs) continue;

            if (
                settlementWasCurrent &&
                call.checked[interval.key] === true &&
                call.prices[interval.key] != null &&
                call.pnl[interval.key] != null
            ) {
                continue;
            }

            fetches++;
            const candle = await fetchHistoricalCloseAtOrAfter(call.symbol, targetTs).catch(() => null);
            const horizonPrice = Number(candle?.price);
            if (!Number.isFinite(horizonPrice) || horizonPrice <= 0) continue;

            const pnl = calculateDirectionalPnl(call.direction, entry, horizonPrice);
            if (pnl === null) continue;

            call.prices[interval.key] = Number(horizonPrice);
            call.pnl[interval.key] = pnl;
            call.checked[interval.key] = true;
            call.settlementVersion = CALL_SETTLEMENT_VERSION;
            call.settledAt = now;
            call.settlementSource = CALL_SETTLEMENT_SOURCE;
            call.settlementCandles = {
                ...(call.settlementCandles && typeof call.settlementCandles === 'object' ? call.settlementCandles : {}),
                [interval.key]: {
                    targetTs,
                    openTime: Number(candle?.openTime || 0) || null,
                    closeTime: Number(candle?.closeTime || 0) || null,
                    market: String(candle?.market || 'BINANCE_USDM'),
                    contractSymbol: String(candle?.contractSymbol || call.symbol || ''),
                    priceScale: Number(candle?.priceScale || 1) || 1,
                    rawPrice: Number(candle?.rawPrice || horizonPrice) || horizonPrice,
                    host: String(candle?.host || '').replace(/^https?:\/\//, '')
                }
            };
            changed = true;
            touchedThisCall = true;
            settledIntervals++;
        }

        if (touchedThisCall) touchedCalls++;
    }

    return { calls, changed, settledIntervals, fetches, touchedCalls };
}

function makeEmptyFeedbackBucket() {
    return { wins: 0, losses: 0, flat: 0, total: 0, pnl: 0 };
}

function addFeedbackStat(map, key, pnl, minMovePct) {
    if (!key) return;
    if (!map[key]) map[key] = makeEmptyFeedbackBucket();
    const bucket = map[key];
    bucket.total++;
    bucket.pnl += Number(pnl || 0);
    if (pnl >= minMovePct) bucket.wins++;
    else if (pnl <= -minMovePct) bucket.losses++;
    else bucket.flat++;
}

function normalizeFeedbackStats(rawStats) {
    const out = {};
    Object.entries(rawStats || {}).forEach(([key, value]) => {
        const total = Number(value?.total || 0) || 0;
        if (total <= 0) return;
        const wins = Number(value?.wins || 0) || 0;
        const losses = Number(value?.losses || 0) || 0;
        const flat = Number(value?.flat || 0) || 0;
        const pnl = Number(value?.pnl || 0) || 0;
        out[key] = {
            wins,
            losses,
            flat,
            total,
            avgPnl: +(pnl / total).toFixed(3),
            winRate: +((wins / total) * 100).toFixed(1),
            lossRate: +((losses / total) * 100).toFixed(1)
        };
    });
    return out;
}

function makeOutcomeSummaryBucket() {
    return {
        wins: 0,
        losses: 0,
        flats: 0,
        pending: 0,
        evaluated: 0,
        decisions: 0,
        assertiveness: null
    };
}

function finalizeOutcomeSummaryBucket(bucket) {
    bucket.evaluated = bucket.wins + bucket.losses + bucket.flats;
    bucket.decisions = bucket.wins + bucket.losses;
    bucket.assertiveness = bucket.decisions > 0
        ? Math.round((bucket.wins / bucket.decisions) * 100)
        : null;
    return bucket;
}

function buildOutcomeSummary() {
    return {
        all: makeOutcomeSummaryBucket(),
        long: makeOutcomeSummaryBucket(),
        short: makeOutcomeSummaryBucket(),
        '1h': makeOutcomeSummaryBucket(),
        '2h': makeOutcomeSummaryBucket(),
        '4h': makeOutcomeSummaryBucket()
    };
}

function recordOutcomeSummary(summary, call, intervalKey, pnl) {
    const direction = normalizeSignalDirection(call?.direction);
    const buckets = [summary.all, summary[intervalKey]];
    if (direction === 'LONG') buckets.push(summary.long);
    if (direction === 'SHORT') buckets.push(summary.short);

    buckets.filter(Boolean).forEach((bucket) => {
        if (!Number.isFinite(pnl)) {
            bucket.pending++;
        } else if (pnl > 0) {
            bucket.wins++;
        } else if (pnl < 0) {
            bucket.losses++;
        } else {
            bucket.flats++;
        }
    });
}

function finalizeOutcomeSummary(summary) {
    Object.values(summary || {}).forEach(finalizeOutcomeSummaryBucket);
    return summary;
}

function isCallSnapshotSafeForRead(calls, now = Date.now()) {
    if (!Array.isArray(calls)) return false;
    return calls.every((rawCall) => {
        const call = normalizeCallRecordForStorage(rawCall, now);
        if (!call) return false;
        if (!hasTrustedCallSettlement(call)) {
            return CALL_SETTLEMENT_INTERVALS.every((interval) => now < Number(call.time || 0) + interval.ms);
        }
        return CALL_SETTLEMENT_INTERVALS.every((interval) => {
            const matured = now >= Number(call.time || 0) + interval.ms;
            if (!matured) return true;
            return call.checked?.[interval.key] === true &&
                Number.isFinite(Number(call.prices?.[interval.key])) &&
                Number(call.prices?.[interval.key]) > 0 &&
                Number.isFinite(Number(call.pnl?.[interval.key]));
        });
    });
}

function buildCallFeedbackStats(rawCalls, now = Date.now()) {
    const stats = {};
    const calls = filterAllowedCalls(rawCalls).map((call) => normalizeCallRecordForStorage(call, now)).filter(Boolean);
    const outcomeSummary = buildOutcomeSummary();
    let evaluatedCallsSet = new Set();

    calls.forEach((call) => {
        if (shouldHideCallFromFeedback(call)) return;
        const direction = normalizeSignalDirection(call.direction);
        if (direction !== 'LONG' && direction !== 'SHORT') return;

        CALL_SETTLEMENT_INTERVALS.forEach((interval) => {
            const targetTs = Number(call.time || 0) + interval.ms;
            const matured = targetTs > 0 && now >= targetTs;
            const hasOfficial = hasTrustedCallSettlement(call) &&
                call.checked?.[interval.key] === true &&
                Number.isFinite(Number(call.pnl?.[interval.key]));

            if (!hasOfficial) {
                if (matured) recordOutcomeSummary(outcomeSummary, call, interval.key, NaN);
                return;
            }

            const pnl = Number(call.pnl?.[interval.key]);
            const minMovePct = getCallMinMovePct(call.symbol, interval.key);
            const reasonFingerprint = call.features?.reasonFingerprint || buildReasonFingerprint(call.reason || call.source);
            const hourBucket = `${Math.floor(new Date(Number(call.time || 0)).getUTCHours() / 4) * 4}h`;
            const feature = call.features || {};

            evaluatedCallsSet.add(call.callKey || call.id || `${call.symbol}:${call.direction}:${call.time}`);
            recordOutcomeSummary(outcomeSummary, call, interval.key, pnl);
            addFeedbackStat(stats, `direction:${direction}`, pnl, minMovePct);
            addFeedbackStat(stats, `symbol:${call.symbol}:${direction}`, pnl, minMovePct);
            addFeedbackStat(stats, `confidence:${direction}:${confidenceBucket(call.confidence)}`, pnl, minMovePct);
            addFeedbackStat(stats, `gates:${direction}:${gatesBucket(call.gates)}`, pnl, minMovePct);
            addFeedbackStat(stats, `reason:${direction}:${reasonFingerprint}`, pnl, minMovePct);
            addFeedbackStat(stats, `session:${direction}:${hourBucket}`, pnl, minMovePct);
            addFeedbackStat(stats, `interval:${interval.key}:${direction}`, pnl, minMovePct);
            if (feature.emaState) addFeedbackStat(stats, `feature:${direction}:ema:${feature.emaState}`, pnl, minMovePct);
            if (feature.volumeState) addFeedbackStat(stats, `feature:${direction}:volume:${feature.volumeState}`, pnl, minMovePct);
            if (feature.momentum24h) addFeedbackStat(stats, `feature:${direction}:mom:${feature.momentum24h}`, pnl, minMovePct);
            if (feature.fundingState) addFeedbackStat(stats, `feature:${direction}:funding:${feature.fundingState}`, pnl, minMovePct);
        });
    });

    const summary = finalizeOutcomeSummary(outcomeSummary);
    return {
        version: 'feedback_v2_all_horizons',
        evaluatedCalls: evaluatedCallsSet.size,
        evaluatedOutcomes: summary.all.evaluated,
        assertivenessAllHorizons: summary.all.assertiveness,
        outcomes: summary,
        stats: normalizeFeedbackStats(stats)
    };
}

function getFeedbackKeysForSignal(signal) {
    const symbol = normalizeAllowedSignalSymbol(signal?.symbol);
    const direction = normalizeSignalDirection(signal?.direction || signal?.finalDirection || signal?.signal);
    if (!symbol || (direction !== 'LONG' && direction !== 'SHORT')) return [];

    const feature = signal.features || {};
    const hourBucket = `${Math.floor(new Date(Number(signal.ts || signal.lastScanAt || Date.now())).getUTCHours() / 4) * 4}h`;
    return [
        `direction:${direction}`,
        `symbol:${symbol}:${direction}`,
        `confidence:${direction}:${confidenceBucket(signal.confidence)}`,
        `gates:${direction}:${gatesBucket(signal.gates)}`,
        `reason:${direction}:${feature.reasonFingerprint || buildReasonFingerprint(signal.reason || signal.source)}`,
        `session:${direction}:${hourBucket}`,
        feature.emaState ? `feature:${direction}:ema:${feature.emaState}` : '',
        feature.volumeState ? `feature:${direction}:volume:${feature.volumeState}` : '',
        feature.momentum24h ? `feature:${direction}:mom:${feature.momentum24h}` : '',
        feature.fundingState ? `feature:${direction}:funding:${feature.fundingState}` : ''
    ].filter(Boolean);
}

function getFeedbackAdjustmentForSignal(signal, feedback) {
    const stats = feedback?.stats || {};
    const keys = getFeedbackKeysForSignal(signal);
    const direction = normalizeSignalDirection(signal?.direction || signal?.finalDirection || signal?.signal);
    let adjustment = 0;
    let evidence = 0;
    let strongestBad = null;
    let strongestGood = null;

    keys.forEach((key) => {
        const item = stats[key];
        if (!item || item.total < 5) return;
        evidence += item.total;

        if (item.total >= 6 && item.winRate >= 62 && item.avgPnl > 0.15) {
            const boost = item.total >= 12 && item.winRate >= 70 ? 2 : 1;
            adjustment += boost;
            if (!strongestGood || item.total > strongestGood.total || item.avgPnl > strongestGood.avgPnl) strongestGood = { key, ...item };
            return;
        }

        if (item.winRate <= 42 || item.avgPnl <= -0.20) {
            const penalty = item.total >= 10 && (item.winRate <= 34 || item.avgPnl <= -0.45) ? 5 : 3;
            adjustment -= penalty;
            if (!strongestBad || item.total > strongestBad.total || item.avgPnl < strongestBad.avgPnl) strongestBad = { key, ...item };
        }
    });

    adjustment = Math.max(-14, Math.min(5, adjustment));
    const longHasSpecificGoodEvidence = !!(
        direction === 'LONG' &&
        strongestGood &&
        !String(strongestGood.key || '').startsWith('direction:') &&
        strongestGood.total >= 6 &&
        strongestGood.winRate >= 62 &&
        strongestGood.avgPnl > 0.15
    );
    const hardBlockByBadHistory = !!(
        strongestBad &&
        strongestBad.total >= 6 &&
        (
            (strongestBad.winRate <= 25 && strongestBad.avgPnl <= -0.20) ||
            strongestBad.avgPnl <= -0.45
        ) &&
        !(direction === 'LONG' && longHasSpecificGoodEvidence && String(strongestBad.key || '').startsWith('direction:'))
    );
    const hardBlockByLongEvidence = !!(
        direction === 'LONG' &&
        evidence >= 8 &&
        !longHasSpecificGoodEvidence
    );
    const hardBlock = hardBlockByBadHistory || hardBlockByLongEvidence;

    return {
        adjustment,
        hardBlock,
        evidence,
        strongestGood,
        strongestBad,
        longHasSpecificGoodEvidence
    };
}

async function loadCallFeedbackStats(env) {
    if (hasVisorD1(env)) {
        try {
            const calls = await d1ListCalls(env, { limit: 500 });
            if (calls.length > 0) return buildCallFeedbackStats(calls);
        } catch (e) {
            console.warn('Call feedback D1 unavailable:', e?.message || e);
        }
    }

    if (env?.CALL_HISTORY_DO) {
        try {
            const doId = env.CALL_HISTORY_DO.idFromName('global');
            const doStub = env.CALL_HISTORY_DO.get(doId);
            const resp = await doStub.fetch('https://call-history.internal/calls/feedback');
            if (resp.ok) {
                const data = await resp.json().catch(() => null);
                if (data?.success && data.feedback) return data.feedback;
            }
        } catch (e) {
            console.warn('Call feedback DO unavailable:', e?.message || e);
        }
    }

    if (env?.CALENDAR_KV) {
        try {
            const calls = filterAllowedCalls(await env.CALENDAR_KV.get(SHARED_CALL_HISTORY_KEY, 'json'));
            return buildCallFeedbackStats(calls);
        } catch (e) {
            console.warn('Call feedback KV unavailable:', e?.message || e);
        }
    }

    return { version: 'feedback_v1', evaluatedCalls: 0, stats: {} };
}

// Rebuilds the D1 feedback stats and stores them tagged with the calls revision
// they were built from. Returns null when D1 has no calls.
async function refreshCallFeedbackCache(env, revision) {
    const calls = await d1ListCalls(env, { limit: 500 });
    if (calls.length === 0) return null;
    const feedback = buildCallFeedbackStats(calls);
    const builtAt = Date.now();
    await d1WriteRuntimeStatus(env, SIGNAL_FEEDBACK_CACHE_KEY, {
        revision: Number(revision) || 0,
        builtAt,
        updatedAt: builtAt,
        feedback
    }).catch(() => false);
    return feedback;
}

async function refreshCallFeedbackViaDurableObject(env, revision) {
    if (!env?.CALL_HISTORY_DO) return null;
    try {
        const doStub = env.CALL_HISTORY_DO.get(env.CALL_HISTORY_DO.idFromName('global'));
        const resp = await doStub.fetch('https://call-history.internal/internal/feedback-refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ revision })
        });
        if (!resp.ok) return null;
        const data = await resp.json().catch(() => null);
        return data?.success && data.feedback ? data.feedback : null;
    } catch (e) {
        console.warn('Call feedback DO refresh failed:', e?.message || e);
        return null;
    }
}

// Feedback stats from D1, or null when D1 has no calls. Rebuilding them from
// 500 rows costs ~10 ms of CPU (the whole Free plan budget) yet they only
// change when a call is written or settled. Serve the stored copy while the
// calls revision is unchanged; otherwise let CallHistoryDO rebuild it, since a
// Durable Object request gets 30 s of CPU. `inline` is for callers that already
// run inside a Durable Object.
async function getD1CallFeedbackStats(env, options = {}) {
    if (!hasVisorD1(env)) return null;
    const rows = await d1ReadRuntimeRows(env, [CALLS_REVISION_KEY, SIGNAL_FEEDBACK_CACHE_KEY]);
    const revision = callsRevisionFromRows(rows);
    const cached = safeJsonParse(rows.get(SIGNAL_FEEDBACK_CACHE_KEY)?.payload_json, null);
    const cacheAgeMs = Date.now() - (Number(cached?.builtAt || 0) || 0);
    if (cached?.feedback && Number(cached.revision) === revision && cacheAgeMs < SIGNAL_FEEDBACK_CACHE_MAX_AGE_MS) {
        return cached.feedback;
    }
    if (options.inline !== true) {
        const refreshed = await refreshCallFeedbackViaDurableObject(env, revision);
        if (refreshed) return refreshed;
        if (cached?.feedback && cacheAgeMs < SIGNAL_FEEDBACK_STALE_MAX_AGE_MS) return cached.feedback;
    }
    return refreshCallFeedbackCache(env, revision);
}

async function loadCallFeedbackStatsCached(env, options = {}) {
    try {
        const feedback = await getD1CallFeedbackStats(env, options);
        if (feedback) return feedback;
    } catch (e) {
        console.warn('Call feedback cache unavailable:', e?.message || e);
    }
    return loadCallFeedbackStats(env);
}

function buildUnavailableSignalResult(symbol, reason = 'provider_unavailable') {
    return {
        symbol,
        short: symbol.replace('USDT', ''),
        signal: 'NEUTRO',
        direction: 'NEUTRO',
        finalDirection: 'NEUTRO',
        confidence: 0,
        finalConfidence: 0,
        price: 0,
        reason,
        gates: 'UNAVAILABLE',
        longPoints: 0,
        shortPoints: 0,
        directionalSpread: 0,
        lastScanAt: Date.now(),
        source: 'worker_snapshot',
        status: 'unavailable',
        unavailable: true
    };
}

// Binance/Gate list endpoints return every contract (0.2-0.5 MB of JSON). Only
// the APP_SIGNAL_SYMBOLS rows are needed, so slice those flat objects out of
// the text and parse them alone. Returns null when the body is not the
// expected compact array (the caller then parses the whole body as before).
function pickJsonArrayRows(text, field, wanted) {
    if (typeof text !== 'string' || text.charCodeAt(0) !== 91) return null;
    // One pass over the body. The needle deliberately omits the leading quote:
    // quotes are every few bytes in JSON, so starting on the field's first
    // letter makes indexOf skip far more text per step.
    const needle = `${field}":"`;
    const rows = [];
    for (let at = text.indexOf(needle); at !== -1; at = text.indexOf(needle, at + needle.length)) {
        if (text.charCodeAt(at - 1) !== 34) continue;
        const valueStart = at + needle.length;
        const valueEnd = text.indexOf('"', valueStart);
        if (valueEnd === -1) return null;
        const value = text.slice(valueStart, valueEnd);
        if (!wanted.has(value)) continue;
        const start = text.lastIndexOf('{', at);
        const end = text.indexOf('}', valueEnd);
        if (start === -1 || end === -1) return null;
        let row;
        try {
            row = JSON.parse(text.slice(start, end + 1));
        } catch (_) {
            return null;
        }
        if (!row || typeof row !== 'object' || row[field] !== value) return null;
        rows.push(row);
    }
    return rows.length > 0 ? rows : null;
}

const SIGNAL_USDM_CONTRACTS = new Set(APP_SIGNAL_SYMBOL_LIST.map((symbol) => getUsdmContractSpec(symbol)?.contractSymbol).filter(Boolean));
const SIGNAL_GATE_CONTRACTS = new Set(APP_SIGNAL_SYMBOL_LIST.map((symbol) => getGateUsdtContract(symbol)).filter(Boolean));

async function fetchBinanceSignalRows(path, label, externalBudget = null) {
    let lastStatus = '';
    for (const host of BINANCE_USDM_SIGNAL_HOSTS) {
        try {
            if (!consumeExternalBudget(externalBudget)) break;
            const resp = await fetch(`${host}${path}`, BINANCE_FETCH_INIT);
            lastStatus = `${label} HTTP ${resp.status}`;
            if (!resp.ok) continue;
            const text = await resp.text().catch(() => '');
            const payload = pickJsonArrayRows(text, 'symbol', SIGNAL_USDM_CONTRACTS) || safeJsonParse(text, null);
            if (Array.isArray(payload)) return { rows: payload, lastStatus };
        } catch (e) {
            lastStatus = e?.message || `${label} fetch failed`;
        }
    }
    return { rows: null, lastStatus };
}

// Ticker and funding both fall back to the same Gate endpoint; `shared` lets
// one snapshot build fetch and parse it once instead of twice.
function fetchGateSignalTickerRows(externalBudget = null, shared = null) {
    if (shared?.gateTickers) return shared.gateTickers;
    const promise = (async () => {
        if (!consumeExternalBudget(externalBudget)) throw new Error('external request budget exhausted');
        const text = await fetchTextWithTimeout(`${GATE_USDT_FUTURES_BASE}/tickers`, {
            headers: BINANCE_FETCH_INIT.headers,
            cf: { cacheTtl: 30 }
        }, 7000);
        const payload = pickJsonArrayRows(text, 'contract', SIGNAL_GATE_CONTRACTS) || JSON.parse(text);
        return Array.isArray(payload) ? payload : null;
    })();
    if (shared) shared.gateTickers = promise;
    return promise;
}

async function fetchSignalTickerMap(externalBudget = null, shared = null) {
    let { rows, lastStatus } = await fetchBinanceSignalRows('/fapi/v1/ticker/24hr', 'ticker', externalBudget);
    let provider = 'binance_usdm';
    if (!Array.isArray(rows)) {
        try {
            const payload = await fetchGateSignalTickerRows(externalBudget, shared);
            if (Array.isArray(payload)) {
                rows = payload;
                provider = 'gate_usdt_perp';
            }
        } catch (e) {
            lastStatus = e?.message || 'Gate ticker fetch failed';
        }
    }
    if (!Array.isArray(rows)) throw new Error(lastStatus || 'ticker unavailable');
    const contractToApp = new Map(
        [...APP_SIGNAL_SYMBOLS]
            .map((symbol) => getUsdmContractSpec(symbol))
            .filter(Boolean)
            .map((spec) => [spec.contractSymbol, spec.appSymbol])
    );
    const gateContractToApp = new Map(
        [...APP_SIGNAL_SYMBOLS].map((symbol) => [getGateUsdtContract(symbol), symbol])
    );
    const map = new Map();
    rows.forEach((row) => {
        const contractSymbol = String(row?.symbol || row?.contract || '').toUpperCase();
        const appSymbol = provider === 'gate_usdt_perp'
            ? gateContractToApp.get(contractSymbol)
            : contractToApp.get(contractSymbol);
        const normalized = appSymbol
            ? (provider === 'gate_usdt_perp'
                ? normalizeGateTickerForAppSymbol(row, appSymbol)
                : normalizeUsdmTickerForAppSymbol(row, appSymbol))
            : null;
        if (normalized) map.set(appSymbol, normalized);
    });
    if (map.size === 0) throw new Error('ticker unavailable');
    map.provider = provider;
    return map;
}

async function fetchSignalFundingMap(externalBudget = null, shared = null) {
    let { rows, lastStatus } = await fetchBinanceSignalRows('/fapi/v1/premiumIndex', 'funding', externalBudget);
    let provider = 'binance_usdm';
    if (!Array.isArray(rows)) {
        try {
            const payload = await fetchGateSignalTickerRows(externalBudget, shared);
            if (Array.isArray(payload)) {
                rows = payload;
                provider = 'gate_usdt_perp';
            }
        } catch (e) {
            lastStatus = e?.message || 'Gate funding fetch failed';
        }
    }
    if (!Array.isArray(rows)) throw new Error(lastStatus || 'funding unavailable');
    const contractToApp = new Map(
        [...APP_SIGNAL_SYMBOLS]
            .map((symbol) => getUsdmContractSpec(symbol))
            .filter(Boolean)
            .map((spec) => [spec.contractSymbol, spec.appSymbol])
    );
    const gateContractToApp = new Map(
        [...APP_SIGNAL_SYMBOLS].map((symbol) => [getGateUsdtContract(symbol), symbol])
    );
    const map = new Map();
    rows.forEach((row) => {
        const contractSymbol = String(row?.symbol || row?.contract || '').toUpperCase();
        const appSymbol = provider === 'gate_usdt_perp'
            ? gateContractToApp.get(contractSymbol)
            : contractToApp.get(contractSymbol);
        const fundingRate = provider === 'gate_usdt_perp'
            ? Number(row?.funding_rate || row?.funding_rate_indicative || 0)
            : Number(row?.lastFundingRate || 0);
        if (appSymbol) map.set(appSymbol, fundingRate || 0);
    });
    map.provider = provider;
    return map;
}

async function fetchSignalKlines(symbol, interval = '15m', limit = 120, externalBudget = null, preferredProvider = '') {
    const safeSymbol = normalizeAllowedSignalSymbol(symbol);
    if (!safeSymbol) return null;
    const spec = getUsdmContractSpec(safeSymbol);
    if (!spec) return null;
    const safeInterval = /^[0-9]+[mhdw]$/.test(String(interval)) ? String(interval) : '15m';
    const safeLimit = Math.max(50, Math.min(500, Number(limit) || 120));
    if (preferredProvider !== 'gate_usdt_perp') {
        for (const host of BINANCE_USDM_SIGNAL_HOSTS) {
            try {
                if (!consumeExternalBudget(externalBudget)) break;
                const resp = await fetch(`${host}/fapi/v1/klines?symbol=${spec.contractSymbol}&interval=${safeInterval}&limit=${safeLimit}`, BINANCE_FETCH_INIT);
                if (!resp.ok) continue;
                const rows = await resp.json().catch(() => null);
                if (Array.isArray(rows) && rows.length >= 50) {
                    const normalized = rows.map((row) => scaleUsdmKlineRow(row, spec));
                    normalized.provider = 'binance_usdm';
                    return normalized;
                }
            } catch (_) {}
        }
    }

    try {
        if (!consumeExternalBudget(externalBudget)) return null;
        const contract = getGateUsdtContract(safeSymbol);
        const payload = await fetchJsonWithTimeout(
            `${GATE_USDT_FUTURES_BASE}/candlesticks?contract=${encodeURIComponent(contract)}&interval=${encodeURIComponent(safeInterval)}&limit=${safeLimit}`,
            { headers: BINANCE_FETCH_INIT.headers, cf: { cacheTtl: 30 } },
            7000
        );
        const rows = gateKlineRowsToBinanceShape(payload, safeInterval);
        if (rows.length >= 50) {
            rows.provider = 'gate_usdt_perp';
            return rows;
        }
    } catch (_) {
        // A failed symbol remains unavailable for this cycle and is retried next cron.
    }
    return null;
}

async function analyzeSignalSymbol(symbol, marketData = {}, feedback = null, externalBudget = null) {
    const ticker = marketData?.tickers instanceof Map ? marketData.tickers.get(symbol) : null;
    const klines = await fetchSignalKlines(symbol, '15m', 120, externalBudget, marketData?.provider || '');
    if (!Array.isArray(klines) || klines.length < 50) return buildUnavailableSignalResult(symbol, 'klines_unavailable');

    const closes = klines.map((k) => Number(k[4] || 0)).filter((v) => Number.isFinite(v) && v > 0);
    const volumes = klines.map((k) => Number(k[5] || 0)).filter((v) => Number.isFinite(v) && v >= 0);
    const highs = klines.map((k) => Number(k[2] || 0)).filter((v) => Number.isFinite(v) && v > 0);
    const lows = klines.map((k) => Number(k[3] || 0)).filter((v) => Number.isFinite(v) && v > 0);
    const klineProvider = String(klines.provider || marketData?.provider || 'binance_usdm');
    const tickerProvider = String(ticker?.provider || marketData?.provider || 'binance_usdm');
    const currentPrice = Number(
        (tickerProvider === klineProvider ? ticker?.lastPrice : 0) || closes[closes.length - 1] || 0
    ) || 0;
    if (currentPrice <= 0) return buildUnavailableSignalResult(symbol, 'price_unavailable');
    const priceTime = Number(ticker?.closeTime || ticker?.time || Date.now()) || Date.now();
    if ((Date.now() - priceTime) > 90 * 1000) return buildUnavailableSignalResult(symbol, 'stale_futures_price');

    const ema9 = ema(closes, 9);
    const ema21 = ema(closes, 21);
    const ema50 = ema(closes, 50);
    const rsi14 = rsi(closes, 14);
    const avgVol20 = avg(volumes.slice(-21, -1));
    const lastVol = volumes[volumes.length - 1] || 0;
    const volumeRatio = avgVol20 > 0 ? lastVol / avgVol20 : 1;
    const change24h = Number(ticker?.priceChangePercent || 0) || 0;
    const fundingRate = marketData?.funding instanceof Map ? (Number(marketData.funding.get(symbol) || 0) || 0) : 0;

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
    const recentHigh = Math.max(...highs.slice(-16), currentPrice);
    const recentLow = Math.min(...lows.slice(-16), currentPrice);
    const recentRangePct = currentPrice > 0 ? Math.max(0, ((recentHigh - recentLow) / currentPrice) * 100) : 0;
    const minMove4h = getCallMinMovePct(symbol, '4h');
    const movementPotentialPct = Math.max(
        recentRangePct * 0.35,
        Math.abs(change24h) * 0.18,
        hasAlignedVolume ? minMove4h : 0
    );
    const isHighBeta = HIGH_BETA_CALL_SYMBOLS.has(normalizeAllowedSignalSymbol(symbol));
    const legacyErrorGuardOk = (
        spread >= 24 &&
        movementPotentialPct >= minMove4h * 1.08 &&
        (!isHighBeta || hasAlignedVolume)
    );
    const qualityOk = (
        direction !== 'NEUTRO' &&
        rawScore >= 62 &&
        spread >= 24 &&
        confirmations >= 3 &&
        hasAcceleration &&
        movementPotentialPct >= minMove4h &&
        legacyErrorGuardOk &&
        !rsiContradiction
    );
    const reasonText = reasons.slice(0, 3).join(' | ') || 'Snapshot tecnico 15m';
    const features = sanitizeCallFeatures({
        emaState: emaAlignedLong ? 'long' : emaAlignedShort ? 'short' : 'mixed',
        rsiZone: rsi14 < 30 ? 'oversold' : rsi14 > 70 ? 'overbought' : rsi14 < 45 ? 'low' : rsi14 > 55 ? 'high' : 'mid',
        volumeState: alignedVolumeLong ? 'long' : alignedVolumeShort ? 'short' : strongVolume ? 'strong_mixed' : 'normal',
        momentum24h: change24h > 3 ? 'strong_up' : change24h > 1.5 ? 'up' : change24h < -3 ? 'strong_down' : change24h < -1.5 ? 'down' : 'flat',
        fundingState: fundingRate > 0.0005 ? 'positive_extreme' : fundingRate < -0.0005 ? 'negative_extreme' : 'neutral',
        confirmations,
        spreadBucket: `${Math.floor(spread / 10) * 10}s`,
        scoreBucket: `${Math.floor(rawScore / 10) * 10}s`,
        movementBucket: `${Math.floor(movementPotentialPct * 10) / 10}%`,
        reasonFingerprint: buildReasonFingerprint(reasonText),
        sessionBucket: `${Math.floor(new Date().getUTCHours() / 4) * 4}h`
    });

    let confidence = clampPercent(Math.round(rawScore * 0.86 + spread * 0.42 + confirmations * 4), 0);
    if (!hasAlignedVolume) confidence = Math.min(confidence, 84);
    if (confirmations < 3) confidence = Math.min(confidence, 82);
    const baseConfidence = confidence;
    const feedbackResult = direction !== 'NEUTRO'
        ? getFeedbackAdjustmentForSignal({
            symbol,
            direction,
            confidence,
            gates: `${Math.round(rawScore)}`,
            reason: reasonText,
            source: 'worker_snapshot',
            features,
            lastScanAt: Date.now()
        }, feedback)
        : { adjustment: 0, hardBlock: false, evidence: 0 };
    if (feedbackResult.adjustment > 0) {
        confidence = clampPercent(confidence + feedbackResult.adjustment, confidence);
    }
    const prePolicyDirection = direction !== 'NEUTRO' && confidence >= SIGNAL_MIN_CONFIDENCE ? direction : 'NEUTRO';
    const finalDirection = applySignalDirectionPolicy(prePolicyDirection);
    const qualityWarnings = [];
    if (!qualityOk && direction !== 'NEUTRO') qualityWarnings.push('quality_filters_warning');
    if (feedbackResult.adjustment < 0) qualityWarnings.push('feedback_penalty_warning');
    if (feedbackResult.hardBlock) qualityWarnings.push('feedback_hard_block_warning');

    return {
        symbol,
        short: symbol.replace('USDT', ''),
        signal: finalDirection,
        direction: finalDirection,
        finalDirection,
        confidence,
        finalConfidence: confidence,
        baseConfidence,
        prePolicyDirection,
        directionPolicy: SIGNAL_DIRECTION_POLICY_VERSION,
        feedbackAdjustment: feedbackResult.adjustment || 0,
        feedbackEvidence: feedbackResult.evidence || 0,
        price: Number(currentPrice.toFixed(currentPrice >= 1 ? 4 : 8)),
        entryPrice: Number(currentPrice.toFixed(currentPrice >= 1 ? 4 : 8)),
        entryTime: priceTime,
        priceTime,
        market: klineProvider === 'gate_usdt_perp' ? 'GATE_USDT_PERP' : 'BINANCE_USDM',
        reason: qualityWarnings.length ? `${reasonText} | ${qualityWarnings.join(',')}` : reasonText,
        gates: `${Math.round(rawScore)}`,
        longPoints: longScore,
        shortPoints: shortScore,
        directionalSpread: spread,
        qualityOk,
        qualityWarnings,
        features,
        lastScanAt: Date.now(),
        source: klineProvider === 'gate_usdt_perp' ? 'worker_snapshot_gate_fallback' : 'worker_snapshot'
    };
}

async function buildSignalsSnapshot(env, persist = true, options = {}) {
    const symbols = [...APP_SIGNAL_SYMBOLS];
    const results = {};
    const feedback = await loadCallFeedbackStatsCached(env, { inline: options.inlineFeedback === true });
    const externalBudget = options.externalBudget || null;
    const sharedProviderData = {};
    const [tickersResult, fundingResult] = await Promise.allSettled([
        fetchSignalTickerMap(externalBudget, sharedProviderData),
        fetchSignalFundingMap(externalBudget, sharedProviderData)
    ]);
    const marketData = {
        tickers: tickersResult.status === 'fulfilled' ? tickersResult.value : new Map(),
        funding: fundingResult.status === 'fulfilled' ? fundingResult.value : new Map(),
        provider: tickersResult.status === 'fulfilled'
            ? String(tickersResult.value?.provider || 'binance_usdm')
            : String(fundingResult.value?.provider || '')
    };
    const providerWarnings = [];
    if (tickersResult.status !== 'fulfilled') providerWarnings.push('ticker_map_unavailable');
    if (fundingResult.status !== 'fulfilled') providerWarnings.push('funding_map_unavailable');
    if (marketData.provider === 'gate_usdt_perp') providerWarnings.push('binance_unavailable_using_gate_futures');

    const batchSize = 5;
    for (let i = 0; i < symbols.length; i += batchSize) {
        const batch = symbols.slice(i, i + batchSize);
        const settled = await Promise.allSettled(batch.map((symbol) => analyzeSignalSymbol(symbol, marketData, feedback, externalBudget)));
        settled.forEach((item, idx) => {
            if (item.status === 'fulfilled' && item.value) {
                results[batch[idx]] = item.value;
            } else {
                results[batch[idx]] = buildUnavailableSignalResult(batch[idx], 'analysis_failed');
            }
        });
    }

    const unavailableSymbols = symbols.filter((symbol) => {
        const item = results[symbol];
        return !item || item.status === 'unavailable' || item.unavailable === true;
    });

    const snapshot = {
        success: true,
        updatedAt: Date.now(),
        strategyVersion: SIGNAL_STRATEGY_VERSION,
        directionPolicy: SIGNAL_DIRECTION_POLICY_VERSION,
        pushProtocol: SIGNAL_TOPIC_PROTOCOL_VERSION,
        marketProvider: marketData.provider || 'unavailable',
        externalRequestsUsed: Number(externalBudget?.used || 0) || 0,
        ttl: SIGNALS_SNAPSHOT_TTL_SECONDS,
        expectedSymbols: symbols.length,
        returnedSymbols: Object.keys(results).length,
        unavailableSymbols,
        unavailableRatio: symbols.length ? +(unavailableSymbols.length / symbols.length).toFixed(3) : 1,
        providerWarnings,
        feedback: {
            version: feedback?.version || 'feedback_v1',
            evaluatedCalls: Number(feedback?.evaluatedCalls || 0) || 0
        },
        stale: false,
        results
    };
    const snapshotUsable = isSignalsSnapshotUsable(snapshot);
    if (!snapshotUsable) {
        snapshot.unhealthy = true;
        snapshot.providerWarnings = [...new Set([...(snapshot.providerWarnings || []), 'snapshot_health_below_threshold'])];
        const cached = await loadUsableCachedSignalsSnapshot(env);
        if (cached) {
            return {
                ...cached,
                stale: true,
                providerWarnings: [...new Set([...(cached.providerWarnings || []), ...snapshot.providerWarnings, 'fresh_snapshot_rejected'])],
                rejectedSnapshotAt: snapshot.updatedAt
            };
        }
    }
    if (persist && snapshotUsable) {
        await persistSignalsSnapshot(env, snapshot);
    }
    return snapshot;
}

function normalizeSignalsSnapshotMeta(snapshot, stale = false) {
    const results = snapshot && typeof snapshot.results === 'object' ? snapshot.results : {};
    const symbols = [...APP_SIGNAL_SYMBOLS];
    const unavailableSymbols = symbols.filter((symbol) => {
        const item = results[symbol];
        return !item || item.status === 'unavailable' || item.unavailable === true;
    });
    return {
        ...(snapshot || {}),
        success: true,
        expectedSymbols: symbols.length,
        returnedSymbols: Object.keys(results).length,
        unavailableSymbols,
        unavailableRatio: symbols.length ? +(unavailableSymbols.length / symbols.length).toFixed(3) : 1,
        stale: !!stale,
        snapshotAgeMs: snapshot?.updatedAt ? Math.max(0, Date.now() - Number(snapshot.updatedAt)) : null,
        ttl: SIGNALS_SNAPSHOT_TTL_SECONDS,
        results
    };
}

function isSignalsSnapshotComplete(snapshot) {
    if (!snapshot || typeof snapshot.results !== 'object') return false;
    const results = snapshot.results;
    return [...APP_SIGNAL_SYMBOLS].every((symbol) => !!results[symbol]);
}

function getSignalsSnapshotHealthyCount(snapshot) {
    if (!snapshot || typeof snapshot.results !== 'object') return 0;
    return [...APP_SIGNAL_SYMBOLS].filter((symbol) => {
        const item = snapshot.results[symbol];
        return item && item.status !== 'unavailable' && item.unavailable !== true && Number(item.confidence || item.finalConfidence || 0) > 0;
    }).length;
}

function isSignalsSnapshotUsable(snapshot) {
    if (!isSignalsSnapshotComplete(snapshot)) return false;
    const expected = [...APP_SIGNAL_SYMBOLS].length;
    if (!expected) return false;
    return (getSignalsSnapshotHealthyCount(snapshot) / expected) >= SIGNALS_MIN_HEALTHY_RATIO;
}

async function persistSignalsSnapshot(env, snapshot) {
    let d1Saved = false;
    if (hasVisorD1(env)) {
        try {
            d1Saved = await d1WriteRuntimeStatus(env, SIGNALS_SNAPSHOT_D1_KEY, snapshot);
        } catch (e) {
            console.warn('Signals snapshot D1 write failed:', e?.message || e);
        }
    }

    if (!env?.CALENDAR_KV) return d1Saved;
    try {
        const backup = await env.CALENDAR_KV.get(SIGNALS_SNAPSHOT_KEY, 'json');
        const backupAgeMs = backup?.updatedAt ? Date.now() - Number(backup.updatedAt) : Infinity;
        if (!d1Saved || backupAgeMs >= SIGNALS_SNAPSHOT_KV_BACKUP_SECONDS * 1000) {
            await env.CALENDAR_KV.put(SIGNALS_SNAPSHOT_KEY, JSON.stringify(snapshot), {
                expirationTtl: SIGNALS_SNAPSHOT_STALE_TTL_SECONDS
            });
        }
    } catch (e) {
        console.warn('Signals snapshot KV backup failed:', e?.message || e);
    }
    return d1Saved;
}

async function loadCachedSignalsSnapshot(env) {
    if (hasVisorD1(env)) {
        try {
            const snapshot = await d1ReadRuntimeStatus(env, SIGNALS_SNAPSHOT_D1_KEY);
            if (isSignalsSnapshotUsable(snapshot)) return { snapshot, source: 'd1' };
        } catch (e) {
            console.warn('Signals snapshot D1 read failed:', e?.message || e);
        }
    }
    if (env?.CALENDAR_KV) {
        try {
            const snapshot = await env.CALENDAR_KV.get(SIGNALS_SNAPSHOT_KEY, 'json');
            if (isSignalsSnapshotUsable(snapshot)) return { snapshot, source: 'kv' };
        } catch (_) {}
    }
    return { snapshot: null, source: 'none' };
}

async function loadUsableCachedSignalsSnapshot(env) {
    return (await loadCachedSignalsSnapshot(env)).snapshot;
}

async function verifyCallMatchesAuthoritativeSnapshot(env, call, now = Date.now()) {
    const safeSymbol = normalizeAllowedSignalSymbol(call?.symbol);
    const safeDirection = normalizeSignalDirection(call?.direction);
    if (!safeSymbol || (safeDirection !== 'LONG' && safeDirection !== 'SHORT')) {
        return { ok: false, status: 400, error: 'Invalid call direction' };
    }

    let snapshot = await loadUsableCachedSignalsSnapshot(env);
    if (!snapshot) {
        try {
            snapshot = await buildSignalsSnapshot(env, true);
        } catch (_) {}
    }

    if (!isSignalsSnapshotUsable(snapshot)) {
        return { ok: false, status: 503, error: 'Authoritative signal snapshot unavailable' };
    }

    const item = snapshot?.results?.[safeSymbol];
    const officialDirection = normalizeSignalDirection(item?.finalDirection || item?.direction || item?.signal);
    const officialConfidence = Number(item?.finalConfidence ?? item?.confidence ?? 0);
    const officialPrice = Number(item?.entryPrice ?? item?.price ?? 0);
    const officialTs = Number(item?.entryTime || item?.priceTime || item?.lastScanAt || snapshot?.updatedAt || 0) || 0;
    const callTs = Number(call?.time || call?.timestamp || now) || now;
    const maxAgeMs = NOTIF_DEDUP_SECONDS * 1000;

    if (officialDirection !== safeDirection || officialConfidence < SIGNAL_MIN_CONFIDENCE) {
        return { ok: false, status: 409, error: 'Call does not match official worker signal' };
    }

    if (!officialTs || Math.abs(callTs - officialTs) > maxAgeMs || now - officialTs > maxAgeMs) {
        return { ok: false, status: 409, error: 'Official signal is no longer fresh' };
    }

    const callConfidence = Number(call?.confidence);
    if (!Number.isFinite(callConfidence) || callConfidence > officialConfidence + 2 || callConfidence < SIGNAL_MIN_CONFIDENCE) {
        return { ok: false, status: 409, error: 'Call confidence does not match official worker signal' };
    }

    const callEntry = Number(call?.entryPrice ?? call?.price ?? 0);
    if (Number.isFinite(callEntry) && callEntry > 0 && Number.isFinite(officialPrice) && officialPrice > 0) {
        const priceDiffPct = Math.abs(callEntry - officialPrice) / officialPrice * 100;
        if (priceDiffPct > 0.75) {
            return { ok: false, status: 409, error: 'Call entry price does not match official worker signal' };
        }
    }

    return {
        ok: true,
        snapshot,
        signal: item,
        officialTime: officialTs
    };
}

function getNotificationRegistryStub(env) {
    if (!env?.NOTIFICATION_REGISTRY_DO) return null;
    const doId = env.NOTIFICATION_REGISTRY_DO.idFromName('global');
    return env.NOTIFICATION_REGISTRY_DO.get(doId);
}

async function listNotificationDevices(env) {
    const merged = new Map();
    if (hasVisorD1(env)) {
        try {
            const d1Devices = await d1ListNotificationDevices(env);
            d1Devices.forEach((device) => {
                if (device?.deviceId) merged.set(device.deviceId, device);
            });
        } catch (e) {
            console.warn('D1 notification device list failed:', e?.message || e);
        }
    }

    const stub = getNotificationRegistryStub(env);
    if (stub) {
        try {
            const resp = await stub.fetch('https://notifications.internal/notifications/devices');
            if (resp.ok) {
                const data = await resp.json();
                if (Array.isArray(data.devices)) {
                    data.devices.forEach((device) => {
                        const deviceId = normalizeDeviceId(device?.deviceId);
                        if (deviceId && !merged.has(deviceId)) merged.set(deviceId, device);
                    });
                }
            }
        } catch (e) {
            console.warn('NotificationRegistryDO list failed:', e?.message || e);
        }
    }

    return [...merged.values()];
}

async function saveNotificationDevice(env, device) {
    if (hasVisorD1(env)) {
        try {
            return await d1SaveNotificationDevice(env, device);
        } catch (e) {
            console.warn('D1 notification register failed:', e?.message || e);
        }
    }

    const stub = getNotificationRegistryStub(env);
    if (stub) {
        const resp = await stub.fetch('https://notifications.internal/notifications/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(device)
        });
        return resp.ok;
    }
    return false;
}

async function saveNotificationPrefs(env, deviceId, prefs, identity = {}) {
    const normalized = normalizeNotificationPrefs(prefs);
    if (hasVisorD1(env)) {
        try {
            return await d1SaveNotificationPrefs(env, deviceId, normalized, identity);
        } catch (e) {
            console.warn('D1 notification prefs failed:', e?.message || e);
        }
    }

    const stub = getNotificationRegistryStub(env);
    if (stub) {
        const resp = await stub.fetch('https://notifications.internal/notifications/prefs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                deviceId,
                userId: identity.userId || '',
                prefs: normalized
            })
        });
        return resp.ok;
    }
    return false;
}

async function removeNotificationDevice(env, deviceId) {
    if (hasVisorD1(env)) {
        try {
            return await d1RemoveNotificationDevice(env, deviceId);
        } catch (e) {
            console.warn('D1 notification unregister failed:', e?.message || e);
        }
    }

    const stub = getNotificationRegistryStub(env);
    if (stub) {
        const resp = await stub.fetch('https://notifications.internal/notifications/unregister', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId })
        });
        return resp.ok;
    }
    return false;
}

async function claimNotificationDedup(env, deviceId, symbol, direction, now) {
    const stub = getNotificationRegistryStub(env);
    if (stub) {
        const resp = await stub.fetch('https://notifications.internal/notifications/dedup/claim', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId, symbol, direction, ts: now })
        });
        if (!resp.ok) return true;
        const data = await resp.json().catch(() => ({}));
        return data.allowed !== false;
    }

    const key = `${NOTIF_DEDUP_PREFIX}${deviceId}_${symbol}_${direction}`;
    let bucket = RATE_LIMIT_BUCKETS.get(key);
    if (bucket && now - Number(bucket.ts || 0) < NOTIF_DEDUP_SECONDS * 1000) return false;
    RATE_LIMIT_BUCKETS.set(key, { ts: now });
    return true;
}

async function releaseNotificationDedup(env, deviceId, symbol, direction) {
    const stub = getNotificationRegistryStub(env);
    if (stub) {
        try {
            const resp = await stub.fetch('https://notifications.internal/notifications/dedup/release', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deviceId, symbol, direction })
            });
            return resp.ok;
        } catch (_) {}
    }
    RATE_LIMIT_BUCKETS.delete(`${NOTIF_DEDUP_PREFIX}${deviceId}_${symbol}_${direction}`);
    return true;
}

function notificationDedupEventKey(symbol, direction) {
    return `${normalizeAllowedSignalSymbol(symbol)}:${normalizeSignalDirection(direction)}`;
}

async function claimNotificationDedupBatch(env, deviceId, events, now) {
    const normalized = (Array.isArray(events) ? events : [])
        .map((event) => ({
            symbol: normalizeAllowedSignalSymbol(event?.symbol),
            direction: normalizeSignalDirection(event?.direction)
        }))
        .filter((event) => event.symbol && (event.direction === 'LONG' || event.direction === 'SHORT'))
        .slice(0, APP_SIGNAL_SYMBOL_LIST.length);
    const allKeys = new Set(normalized.map((event) => notificationDedupEventKey(event.symbol, event.direction)));
    if (normalized.length === 0) return allKeys;

    const stub = getNotificationRegistryStub(env);
    if (stub) {
        try {
            const resp = await stub.fetch('https://notifications.internal/notifications/dedup/claim-batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deviceId, events: normalized, ts: now })
            });
            if (!resp.ok) return allKeys;
            const data = await resp.json().catch(() => ({}));
            return new Set(Array.isArray(data.allowed) ? data.allowed.map(String) : [...allKeys]);
        } catch (_) {
            return allKeys;
        }
    }

    const allowed = new Set();
    for (const event of normalized) {
        const key = notificationDedupEventKey(event.symbol, event.direction);
        const memoryKey = `${NOTIF_DEDUP_PREFIX}${deviceId}_${event.symbol}_${event.direction}`;
        const bucket = RATE_LIMIT_BUCKETS.get(memoryKey);
        if (bucket && now - Number(bucket.ts || 0) < NOTIF_DEDUP_SECONDS * 1000) continue;
        RATE_LIMIT_BUCKETS.set(memoryKey, { ts: now });
        allowed.add(key);
    }
    return allowed;
}

async function releaseNotificationDedupBatch(env, deviceId, events) {
    const normalized = (Array.isArray(events) ? events : [])
        .map((event) => ({
            symbol: normalizeAllowedSignalSymbol(event?.symbol),
            direction: normalizeSignalDirection(event?.direction)
        }))
        .filter((event) => event.symbol && (event.direction === 'LONG' || event.direction === 'SHORT'))
        .slice(0, APP_SIGNAL_SYMBOL_LIST.length);
    if (normalized.length === 0) return true;

    const stub = getNotificationRegistryStub(env);
    if (stub) {
        try {
            const resp = await stub.fetch('https://notifications.internal/notifications/dedup/release-batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deviceId, events: normalized })
            });
            return resp.ok;
        } catch (_) {}
    }
    normalized.forEach((event) => {
        RATE_LIMIT_BUCKETS.delete(`${NOTIF_DEDUP_PREFIX}${deviceId}_${event.symbol}_${event.direction}`);
    });
    return true;
}

async function getNotificationPrefs(env, deviceId) {
    const devices = await listNotificationDevices(env);
    const device = devices.find((item) => item?.deviceId === deviceId);
    return normalizeNotificationPrefs(device?.prefs || {});
}

function getLiquidationsStub(env) {
    if (!env?.LIQUIDATIONS_DO) return null;
    const doId = env.LIQUIDATIONS_DO.idFromName('global');
    return env.LIQUIDATIONS_DO.get(doId);
}

function normalizeLiquidationSymbol(raw) {
    return String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20);
}

function mergeLiquidationOrders(existingOrders, newOrders, now = Date.now()) {
    const window12h = 12 * 60 * 60 * 1000;
    const orderMap = new Map();
    [...(Array.isArray(existingOrders) ? existingOrders : []), ...(Array.isArray(newOrders) ? newOrders : [])].forEach((order) => {
        if (!order) return;
        const time = Number(order.time || 0);
        if (!time || now - time >= window12h) return;
        const key = `${order.time}_${order.price || order.averagePrice}_${order.side}`;
        if (!orderMap.has(key)) orderMap.set(key, order);
    });
    return [...orderMap.values()]
        .sort((a, b) => Number(b.time || 0) - Number(a.time || 0))
        .slice(0, 5000);
}

async function trackLiquidationSymbol(env, symbol) {
    const safeSymbol = normalizeLiquidationSymbol(symbol);
    if (!safeSymbol) return false;
    const stub = getLiquidationsStub(env);
    if (stub) {
        const resp = await stub.fetch('https://liquidations.internal/liquidations/track', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbol: safeSymbol })
        });
        return resp.ok;
    }
    return false;
}

async function getTrackedLiquidationSymbols(env) {
    const stub = getLiquidationsStub(env);
    if (!stub) return [];
    try {
        const resp = await stub.fetch('https://liquidations.internal/liquidations/tracked');
        if (!resp.ok) return [];
        const data = await resp.json();
        return Array.isArray(data.symbols) ? data.symbols.map(normalizeLiquidationSymbol).filter(Boolean) : [];
    } catch (_) {
        return [];
    }
}

async function getAccumulatedLiquidationOrders(env, symbol) {
    const safeSymbol = normalizeLiquidationSymbol(symbol);
    const stub = getLiquidationsStub(env);
    if (stub && safeSymbol) {
        try {
            const resp = await stub.fetch(`https://liquidations.internal/liquidations/accum?symbol=${encodeURIComponent(safeSymbol)}`);
            if (resp.ok) {
                const data = await resp.json();
                return Array.isArray(data.orders) ? data.orders : [];
            }
        } catch (_) {}
    }
    return [];
}

async function saveAccumulatedLiquidationOrders(env, symbol, orders, now = Date.now()) {
    const safeSymbol = normalizeLiquidationSymbol(symbol);
    const stub = getLiquidationsStub(env);
    if (!stub || !safeSymbol) return false;
    const resp = await stub.fetch('https://liquidations.internal/liquidations/accum', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: safeSymbol, orders, ts: now })
    });
    return resp.ok;
}

async function recordSharedCallFromWorker(env, call, identity = {}) {
    const safeSymbol = normalizeAllowedSignalSymbol(call?.symbol);
    const safeDirection = normalizeSignalDirection(call?.direction);
    const safeConfidence = clampPercent(call?.confidence);
    if (!safeSymbol || (safeDirection !== 'LONG' && safeDirection !== 'SHORT') || safeConfidence < SIGNAL_MIN_CONFIDENCE) return false;
    const safeTime = normalizeCallTime(call?.ts || call?.time || call?.notifiedAt || Date.now());
    const entryPrice = Number(call?.entryPrice ?? call?.price ?? 0) || 0;

    const payload = {
        id: buildUniqueCallId(safeSymbol, safeDirection, safeTime, call?.id),
        callKey: buildCanonicalCallKey(safeSymbol, safeDirection, safeTime),
        symbol: safeSymbol,
        name: String(call.name || '').slice(0, 50),
        short: String(call.short || safeSymbol.replace('USDT', '')).slice(0, 10),
        img: '',
        direction: safeDirection,
        confidence: safeConfidence,
        gates: String(call.gates || 'SNAPSHOT').slice(0, 20),
        price: entryPrice > 0 ? String(entryPrice).slice(0, 20) : String(call.price || '').slice(0, 20),
        entryPrice: entryPrice > 0 ? entryPrice : null,
        reason: `${SIGNAL_STRATEGY_VERSION} | ${String(call.reason || 'Worker snapshot')}`.slice(0, 180),
        source: `${SIGNAL_STRATEGY_VERSION} | WORKER_SNAPSHOT`,
        strategyVersion: SIGNAL_STRATEGY_VERSION,
        time: safeTime,
        timestamp: safeTime,
        prices: normalizeIntervalMap(null, null),
        pnl: normalizeIntervalMap(null, null),
        checked: normalizeIntervalMap(null, false),
        features: sanitizeCallFeatures(call.features),
        userId: String(identity.userId || '').slice(0, 64)
    };

    if (hasVisorD1(env)) {
        try {
            const result = await d1RecordCall(env, payload, {
                deviceId: identity.deviceId || 'worker_snapshot',
                userId: identity.userId || ''
            });
            if (result?.success) return true;
        } catch (e) {
            console.warn('D1 worker call record failed:', e?.message || e);
        }
    }

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
    return false;
}

async function dispatchSignalPushes(env, snapshot, options = {}) {
    if (!snapshot?.results) return { sent: 0, skipped: 0, topicSent: 0, legacySent: 0 };
    const now = Date.now();
    const sendTopics = options.topics !== false;
    const sendLegacy = options.legacy !== false;
    const externalBudget = options.externalBudget || null;
    // Legacy per-token delivery is intentionally bounded. Topic clients are the
    // scalable path; this compatibility pass must never exhaust one invocation.
    const maxLegacyAttempts = Math.min(10, Math.max(0, Number(options.maxLegacyAttempts ?? 10) || 0));
    const generatedEvents = new Map();
    let topicSent = 0;
    let topicSkipped = 0;
    let topicFailed = 0;
    const topicCandidates = sendTopics
        ? APP_SIGNAL_SYMBOL_LIST.map((symbol) => {
            const signal = snapshot.results[symbol];
            const direction = normalizeSignalDirection(signal?.direction || signal?.signal);
            const confidence = clampPercent(signal?.confidence);
            return signal && direction !== 'NEUTRO' && confidence >= SIGNAL_MIN_CONFIDENCE
                ? { symbol, signal, direction, confidence }
                : null;
        }).filter(Boolean)
        : [];
    const topicDeviceId = `${SIGNAL_TOPIC_PROTOCOL_VERSION}_broadcast`;
    const allowedTopicKeys = await claimNotificationDedupBatch(env, topicDeviceId, topicCandidates, now);
    const failedTopicClaims = [];

    // New clients subscribe to one topic per enabled symbol. One FCM request fans
    // out to every installation, so traffic no longer grows with the user count.
    for (const candidate of topicCandidates) {
        const { symbol, signal, direction, confidence } = candidate;
        const topic = getSignalTopic(symbol);
        if (!topic) continue;
        if (!allowedTopicKeys.has(notificationDedupEventKey(symbol, direction))) {
            topicSkipped++;
            continue;
        }

        const pushPayload = {
            ...signal,
            eventId: `${SIGNAL_TOPIC_PROTOCOL_VERSION}:${symbol}:${direction}:${Math.floor(now / (NOTIF_DEDUP_SECONDS * 1000))}`,
            pushProtocol: SIGNAL_TOPIC_PROTOCOL_VERSION,
            strategyVersion: SIGNAL_STRATEGY_VERSION,
            symbol,
            direction,
            finalDirection: direction,
            confidence,
            finalConfidence: confidence,
            ts: now,
            notifiedAt: now,
            expiresAt: now + (NOTIF_DEDUP_SECONDS * 1000),
            snapshotId: `${symbol}_${direction}_${Math.floor(now / (NOTIF_DEDUP_SECONDS * 1000))}`,
            notificationId: Math.abs(`${SIGNAL_TOPIC_PROTOCOL_VERSION}_${symbol}_${direction}_${Math.floor(now / (NOTIF_DEDUP_SECONDS * 1000))}`.split('').reduce((acc, ch) => ((acc << 5) - acc) + ch.charCodeAt(0), 0))
        };
        // A call is a market event, not a per-device delivery receipt. Persist it
        // once even if FCM has a temporary outage; clients can recover via snapshot.
        generatedEvents.set(`${symbol}:${direction}`, pushPayload);
        const result = await sendFcmWithRetry(() => sendFcmTopicSignal(env, topic, pushPayload, externalBudget));
        await d1RecordNotificationEvent(env, {
            deviceId: topicDeviceId,
            symbol,
            direction,
            ts: now,
            sentOk: result.ok,
            status: result.status,
            error: result.error || result.body || '',
            payload: { ...pushPayload, topic }
        }).catch(() => false);
        if (result.ok) {
            topicSent++;
        } else {
            topicFailed++;
            failedTopicClaims.push({ symbol, direction });
        }
    }
    if (failedTopicClaims.length > 0) {
        await releaseNotificationDedupBatch(env, topicDeviceId, failedTopicClaims);
    }

    // Compatibility path for versions that predate topic_v1. Version 136
    // unregisters its direct token after topic subscription succeeds.
    const devices = sendLegacy ? await listNotificationDevices(env) : [];
    let legacySent = 0;
    let legacySkipped = 0;
    let legacyAttempts = 0;
    let legacyDedupChecks = 0;

    legacyLoop: for (const device of devices) {
        const prefs = normalizeNotificationPrefs(device.prefs || {});
        if (!prefs.enabled || !device.token) {
            legacySkipped++;
            continue;
        }

        for (const symbol of prefs.symbols) {
            if (legacyAttempts >= maxLegacyAttempts || legacyDedupChecks >= 12 || Number(externalBudget?.remaining ?? 1) <= 0) break legacyLoop;
            const signal = snapshot.results[symbol];
            if (!signal) continue;
            const direction = normalizeSignalDirection(signal.direction || signal.signal);
            const confidence = clampPercent(signal.confidence);
            const symbolCfg = prefs.perSymbol?.[symbol] || {};
            const minConfidence = Math.max(SIGNAL_MIN_CONFIDENCE, Number(symbolCfg.minConfidence || symbolCfg.confidence || prefs.confidenceThreshold || SIGNAL_MIN_CONFIDENCE) || SIGNAL_MIN_CONFIDENCE);
            if (direction === 'NEUTRO' || confidence < minConfidence) continue;

            legacyDedupChecks++;
            const allowedByDedup = await claimNotificationDedup(env, device.deviceId, symbol, direction, now);
            if (!allowedByDedup) {
                legacySkipped++;
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
            legacyAttempts++;
            const result = await sendFcmWithRetry(() => sendFcmSignal(env, device.token, pushPayload, externalBudget));
            await d1RecordNotificationEvent(env, {
                deviceId: device.deviceId,
                symbol,
                direction,
                ts: now,
                sentOk: result.ok,
                status: result.status,
                error: result.error || result.body || '',
                payload: pushPayload
            }).catch(() => false);
            if (result.ok) {
                legacySent++;
            } else {
                legacySkipped++;
                await releaseNotificationDedup(env, device.deviceId, symbol, direction);
            }
        }
    }

    for (const payload of generatedEvents.values()) {
        await recordSharedCallFromWorker(env, payload, {
            deviceId: SIGNAL_TOPIC_PROTOCOL_VERSION,
            userId: ''
        }).catch(() => false);
    }

    return {
        sent: topicSent + legacySent,
        skipped: topicSkipped + legacySkipped,
        topicSent,
        topicSkipped,
        topicFailed,
        legacySent,
        legacySkipped,
        legacyDevices: devices.length,
        legacyAttempts,
        legacyDedupChecks,
        externalRequestsUsed: Number(externalBudget?.used || 0) || 0,
        lastPushAt: (topicSent + legacySent) > 0 ? now : 0,
        protocol: SIGNAL_TOPIC_PROTOCOL_VERSION
    };
}

// One signal cycle: shared snapshot, topic pushes and the runtime status row.
// Runs inside SignalCycleDO (30 s of CPU per request) when that binding exists;
// inline in the cron otherwise.
async function runSignalCycle(env, options = {}) {
    const signalRunStartedAt = Date.now();
    const externalBudget = options.externalBudget || createExternalBudget(48);
    try {
        const snapshot = await buildSignalsSnapshot(env, true, { externalBudget, inlineFeedback: options.inlineFeedback === true });
        const pushResult = snapshot?.stale === true
            ? { sent: 0, skipped: Object.keys(snapshot?.results || {}).length, stale: true }
            : await dispatchSignalPushes(env, snapshot, {
                topics: true,
                legacy: false,
                externalBudget
            });
        const previousSignalStatus = await d1ReadRuntimeStatus(env, SIGNAL_RUNTIME_STATUS_KEY).catch(() => null);
        const pushError = Number(pushResult?.topicFailed || 0) > 0
            ? `${Number(pushResult.topicFailed)}_topic_push_failed`
            : '';
        const signalStatus = {
            success: snapshot?.stale !== true && !pushError,
            updatedAt: Date.now(),
            startedAt: signalRunStartedAt,
            durationMs: Date.now() - signalRunStartedAt,
            snapshotUpdatedAt: Number(snapshot?.updatedAt || 0) || 0,
            snapshotStale: snapshot?.stale === true,
            symbols: Object.keys(snapshot?.results || {}).length,
            push: pushResult,
            lastPushAt: Number(pushResult?.lastPushAt || previousSignalStatus?.lastPushAt || 0) || 0,
            lastError: pushError,
            externalRequestsUsed: Number(externalBudget.used || 0) || 0,
            protocol: SIGNAL_TOPIC_PROTOCOL_VERSION,
            strategyVersion: SIGNAL_STRATEGY_VERSION,
            runner: options.runner || 'cron'
        };
        await d1WriteRuntimeStatus(env, SIGNAL_RUNTIME_STATUS_KEY, signalStatus).catch(() => false);
        console.log(
            `Signal snapshot refreshed: ${Object.keys(snapshot?.results || {}).length} symbols, ` +
            `topic sent=${pushResult.topicSent || 0}, legacy sent=${pushResult.legacySent || 0}, skipped=${pushResult.skipped || 0}`
        );
        return signalStatus;
    } catch (e) {
        console.error('Cron error (signals):', e);
        const previousSignalStatus = await d1ReadRuntimeStatus(env, SIGNAL_RUNTIME_STATUS_KEY).catch(() => null);
        await d1WriteRuntimeStatus(env, SIGNAL_RUNTIME_STATUS_KEY, {
            success: false,
            updatedAt: Date.now(),
            startedAt: signalRunStartedAt,
            durationMs: Date.now() - signalRunStartedAt,
            error: String(e?.message || e || 'Signal cron failed').slice(0, 240),
            lastError: String(e?.message || e || 'Signal cron failed').slice(0, 240),
            lastPushAt: Number(previousSignalStatus?.lastPushAt || 0) || 0,
            snapshotUpdatedAt: Number(previousSignalStatus?.snapshotUpdatedAt || 0) || 0,
            externalRequestsUsed: Number(externalBudget.used || 0) || 0,
            protocol: SIGNAL_TOPIC_PROTOCOL_VERSION,
            strategyVersion: SIGNAL_STRATEGY_VERSION
        }).catch(() => false);
        return { success: false, error: String(e?.message || e || 'Signal cron failed').slice(0, 240) };
    }
}

async function delegateToSignalCycleDO(env, action, cronExpression = '') {
    if (!env?.SIGNAL_CYCLE_DO) return false;
    try {
        // One object per cron so a slow run only blocks its own next tick.
        const name = action === 'cron' ? `cron:${cronExpression}` : 'signals';
        const query = action === 'cron' ? `?cron=${encodeURIComponent(cronExpression)}` : '';
        const stub = env.SIGNAL_CYCLE_DO.get(env.SIGNAL_CYCLE_DO.idFromName(name));
        const resp = await stub.fetch(`https://signal-cycle.internal/${action}${query}`, { method: 'POST' });
        if (!resp.ok) console.warn(`SignalCycleDO ${action} returned HTTP ${resp.status}`);
    } catch (e) {
        // Do not fall back inline: the object may already be mid-cycle, and the
        // inline path is exactly what exceeds the Free plan CPU limit.
        console.error(`SignalCycleDO ${action} failed:`, e?.message || e);
    }
    return true;
}

// The non-signal crons (legacy pushes, market prewarm and call settlement,
// calendar, liquidations). Runs inside SignalCycleDO like the signal cycle;
// inline only when that binding is missing.
async function runScheduledCron(env, cronExpression) {
    const runLegacyPush = cronExpression === LEGACY_PUSH_CRON_EXPRESSION;
    const runMarket = cronExpression === MARKET_CRON_EXPRESSION;
    const runLiquidations = cronExpression === LIQUIDATIONS_CRON_EXPRESSION;
    const runCalendar = cronExpression === CALENDAR_CRON_EXPRESSION;
    const FMP_API_KEY = getSecret(env, 'FMP_API_KEY');
    const FRED_API_KEY = getSecret(env, 'FRED_API_KEY');

    if (runLegacyPush) {
        const snapshot = await loadUsableCachedSignalsSnapshot(env).catch(() => null);
        if (snapshot) {
            const externalBudget = createExternalBudget(48);
            const legacyResult = await dispatchSignalPushes(env, snapshot, {
                topics: false,
                legacy: true,
                maxLegacyAttempts: 45,
                externalBudget
            }).catch((e) => ({ sent: 0, legacySent: 0, error: String(e?.message || e || 'Legacy push failed') }));
            const previous = await d1ReadRuntimeStatus(env, SIGNAL_RUNTIME_STATUS_KEY).catch(() => null);
            await d1WriteRuntimeStatus(env, SIGNAL_RUNTIME_STATUS_KEY, {
                ...(previous || {}),
                updatedAt: Number(previous?.updatedAt || 0) || Date.now(),
                legacyLastRunAt: Date.now(),
                legacy: legacyResult
            }).catch(() => false);
        }
        return;
    }

    if (!runMarket && !runCalendar && !runLiquidations) return;

    // Keep each scheduled invocation below the Workers Free external-subrequest cap.
    if (runMarket) {
    try {
        const settlement = await d1SettleCalls(env, { maxCalls: 80, maxFetches: 5 });
        if (settlement?.changed) {
            console.log(`Call settlement refreshed: ${settlement.settledIntervals || 0} intervals`);
        }
    } catch (e) {
        console.error('Cron error (call settlement):', e);
    }

    try {
        const refreshed = await prewarmMarketCacheIfStale(env, {
            key: MARKET_FED_RATE_KEY,
            freshSeconds: FED_RATE_FRESH_SECONDS,
            staleSeconds: FED_RATE_STALE_SECONDS,
            builder: () => buildFedRateMarketPayload({ fredApiKey: FRED_API_KEY }),
            isValid: (payload) => payload && payload.success !== false && Number(payload.updatedAt || 0) > 0,
        });
        if (refreshed) console.log('Fed rate cache refreshed');
    } catch (e) {
        console.error('Cron error (fed rate):', e);
    }

    try {
        const refreshed = await prewarmMarketCacheIfStale(env, {
            key: MARKET_FEDWATCH_KEY_PREFIX + 'next',
            freshSeconds: FEDWATCH_FRESH_SECONDS,
            staleSeconds: FEDWATCH_STALE_SECONDS,
            builder: () => buildFedWatchPayload({ meetingDate: 'next', fredApiKey: FRED_API_KEY }),
            isValid: (payload) => payload && payload.success !== false && Number(payload.updatedAt || 0) > 0,
        });
        if (refreshed) console.log('FedWatch cache refreshed');
    } catch (e) {
        console.error('Cron error (fedwatch):', e);
    }

    try {
        const refreshed = await prewarmMarketCacheIfStale(env, {
            key: MARKET_MACRO_QUOTES_KEY,
            freshSeconds: MARKET_FRESH_SECONDS,
            staleSeconds: MARKET_STALE_SECONDS,
            builder: buildMacroQuotesPayload,
            isValid: (payload) => payload && payload.success !== false && Object.keys(payload.prices || {}).length > 0,
        });
        if (refreshed) console.log('Macro quotes cache refreshed');
    } catch (e) {
        console.error('Cron error (macro quotes):', e);
    }

    try {
        const refreshed = await prewarmMarketCacheIfStale(env, {
            key: MARKET_NEWS_KEY,
            freshSeconds: NEWS_FRESH_SECONDS,
            staleSeconds: NEWS_STALE_SECONDS,
            builder: buildNewsPayload,
            isValid: (payload) => payload && payload.success !== false && Array.isArray(payload.articles),
        });
        if (refreshed) console.log('News cache refreshed');
    } catch (e) {
        console.error('Cron error (news):', e);
    }

    // ─── CALENDÁRIO: só atualiza a cada 3 horas ───
    }

    if (runCalendar) {
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
            const seriesIds = [...new Set(events.map(e => e.fredSeriesId).filter(Boolean))].slice(0, 30);
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
    }

    // ─── LIQUIDAÇÕES: acumula a cada execução (5 min) ───
    // Escalável: KV compartilhado entre todos os usuários
    if (runLiquidations) {
    try {
        // Símbolos base + símbolos dinâmicos adicionados por requisições de usuários
        const baseSymbols = LIQUIDATIONS_BASE_SYMBOLS;

        // Carregar símbolos dinâmicos (adicionados por requisições de usuários)
        const dynamicSymbols = await getTrackedLiquidationSymbols(env);

        const allSymbols = [...new Set([...baseSymbols, ...dynamicSymbols])].slice(0, 40);
        let accumulated = 0;

        for (const sym of allSymbols) {
            try {
                const binRes = await fetch(`https://fapi.binance.com/fapi/v1/allForceOrders?symbol=${sym}&limit=1000`);
                if (!binRes.ok) continue;
                const orders = await binRes.json();
                if (!Array.isArray(orders) || orders.length === 0) continue;

                const now = Date.now();
                const existingOrders = await getAccumulatedLiquidationOrders(env, sym);
                const merged = mergeLiquidationOrders(existingOrders, orders, now);
                await saveAccumulatedLiquidationOrders(env, sym, merged, now);
                accumulated++;
            } catch (symErr) {
                console.warn(`Liq accumulate ${sym}:`, symErr.message);
            }
        }
        console.log(`Liquidation accumulation: ${accumulated}/${allSymbols.length} symbols`);
    } catch (e) {
        console.error('Cron error (liquidations):', e);
    }
    }

    // MARKET SNAPSHOT: preaquece fontes globais para todos os usuarios via KV/edge cache.
    if (runMarket) {
    try {
        const refreshedGlobal = await prewarmMarketGlobalCache(env);
        if (refreshedGlobal) console.log('Global market cache refreshed');
    } catch (e) {
        console.error('Cron error (market global):', e);
    }

    // ALTSEASON: preaquece a mesma fonte usada pelo endpoint para evitar cold miss.
    try {
        const refreshed = await prewarmAltseasonCache(env);
        if (refreshed) console.log('Altseason cache refreshed');
    } catch (e) {
        console.error('Cron error (altseason):', e);
    }

    try {
        const refreshedSnapshot = await prewarmMarketGlobalSnapshotCache(env);
        if (refreshedSnapshot) console.log('Global market snapshot refreshed');
    } catch (e) {
        console.error('Cron error (market snapshot):', e);
    }
    }

}

// After each cycle, rebuild what the hot GET routes read (feedback stats and
// the default /calls page) so app requests stay cache hits.
async function prewarmCallDerivedCaches(env) {
    if (!hasVisorD1(env)) return false;
    await getD1CallFeedbackStats(env, { inline: true });
    await d1GetCallsPageCached(env, { limit: 200, inline: true });
    return true;
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

function getPublicCacheKey(request) {
    const url = new URL(request.url);
    const cacheUrl = new URL(`https://visor-cache.local${url.pathname}`);
    [...url.searchParams.entries()]
        .sort(([aKey, aValue], [bKey, bValue]) => {
            if (aKey === bKey) return String(aValue).localeCompare(String(bValue));
            return String(aKey).localeCompare(String(bKey));
        })
        .forEach(([key, value]) => cacheUrl.searchParams.append(key, value));
    return cacheUrl.toString();
}

function getMaxAgeSeconds(headers = {}, fallbackSeconds = 60) {
    const cc = String(headers['Cache-Control'] || headers['cache-control'] || '');
    const sMax = cc.match(/(?:^|,\s*)s-maxage=(\d+)/i);
    if (sMax) return Math.max(1, Number(sMax[1]) || fallbackSeconds);
    const max = cc.match(/(?:^|,\s*)max-age=(\d+)/i);
    if (max) return Math.max(1, Number(max[1]) || fallbackSeconds);
    return Math.max(1, fallbackSeconds);
}

function pruneEdgeMemoryCache() {
    if (EDGE_JSON_MEMORY_CACHE.size <= EDGE_JSON_MEMORY_MAX_ENTRIES) return;
    const now = Date.now();
    for (const [key, value] of EDGE_JSON_MEMORY_CACHE.entries()) {
        if (!value || Number(value.expiresAt || 0) <= now) {
            EDGE_JSON_MEMORY_CACHE.delete(key);
        }
    }
    while (EDGE_JSON_MEMORY_CACHE.size > EDGE_JSON_MEMORY_MAX_ENTRIES) {
        const firstKey = EDGE_JSON_MEMORY_CACHE.keys().next().value;
        if (!firstKey) break;
        EDGE_JSON_MEMORY_CACHE.delete(firstKey);
    }
}

function stripCorsCacheHeaders(headers = {}) {
    const out = {};
    Object.entries(headers || {}).forEach(([key, value]) => {
        const lower = String(key).toLowerCase();
        if (lower.startsWith('access-control-') || lower === 'vary') return;
        out[key] = value;
    });
    return out;
}

function setMemoryJsonCache(request, text, status, headers = {}, ttlSeconds = 60) {
    try {
        const cacheKey = getPublicCacheKey(request);
        EDGE_JSON_MEMORY_CACHE.set(cacheKey, {
            text,
            status,
            headers: stripCorsCacheHeaders(headers),
            expiresAt: Date.now() + (Math.max(1, ttlSeconds) * 1000)
        });
        pruneEdgeMemoryCache();
    } catch (_) {}
}

function responseFromCachedText(entry, corsHeaders, source) {
    return new Response(entry.text, {
        status: entry.status || 200,
        headers: {
            ...corsHeaders,
            ...stripCorsCacheHeaders(entry.headers || {}),
            'Content-Type': 'application/json',
            'X-Visor-Cache': source
        }
    });
}

async function getCachedJsonResponse(request, corsHeaders) {
    if (request.method !== 'GET') return null;
    const cacheKey = getPublicCacheKey(request);
    const memory = EDGE_JSON_MEMORY_CACHE.get(cacheKey);
    if (memory && Number(memory.expiresAt || 0) > Date.now()) {
        return responseFromCachedText(memory, corsHeaders, 'memory');
    }
    if (memory) EDGE_JSON_MEMORY_CACHE.delete(cacheKey);

    if (typeof caches === 'undefined' || !caches.default) return null;
    try {
        const cached = await caches.default.match(new Request(cacheKey, { method: 'GET' }));
        if (!cached) return null;
        const text = await cached.text();
        const headers = {};
        cached.headers.forEach((value, key) => { headers[key] = value; });
        setMemoryJsonCache(request, text, cached.status, headers, getMaxAgeSeconds(headers, 30));
        return responseFromCachedText({ text, status: cached.status, headers }, corsHeaders, 'edge');
    } catch (_) {
        return null;
    }
}

function putCachedJsonResponse(request, ctx, data, status = 200, headers = {}, fallbackTtlSeconds = 60) {
    if (!request || request.method !== 'GET' || status < 200 || status >= 300) return;
    const cacheHeaders = {
        ...stripCorsCacheHeaders(headers),
        'Content-Type': 'application/json'
    };
    if (!cacheHeaders['Cache-Control'] && !cacheHeaders['cache-control']) {
        cacheHeaders['Cache-Control'] = `public, max-age=${fallbackTtlSeconds}`;
    }
    const ttlSeconds = getMaxAgeSeconds(cacheHeaders, fallbackTtlSeconds);
    const text = JSON.stringify(data);
    setMemoryJsonCache(request, text, status, cacheHeaders, ttlSeconds);

    if (typeof caches === 'undefined' || !caches.default) return;
    const write = caches.default.put(
        new Request(getPublicCacheKey(request), { method: 'GET' }),
        new Response(text, { status, headers: cacheHeaders })
    ).catch(() => {});
    if (ctx?.waitUntil) ctx.waitUntil(write);
}

function cacheableJsonResponse(request, ctx, corsHeaders, data, status = 200, headers = {}, cacheSource = 'fresh', fallbackTtlSeconds = 60) {
    putCachedJsonResponse(request, ctx, data, status, headers, fallbackTtlSeconds);
    return jsonResponse(data, corsHeaders, status, {
        ...headers,
        'X-Visor-Cache': cacheSource
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
    if (shouldUseD1MarketCache(env, key)) {
        try {
            const cached = await d1ReadRuntimeStatus(env, getD1MarketCacheKey(key));
            if (cached && typeof cached === 'object') return cached;
        } catch (_) {
            // During rollout, fall through to the existing KV cache.
        }
    }
    if (!env?.CALENDAR_KV) return null;
    try {
        const cached = await env.CALENDAR_KV.get(key, 'json');
        return cached && typeof cached === 'object' ? cached : null;
    } catch (_) {
        return null;
    }
}

async function writeMarketCache(env, key, payload, ttlSeconds) {
    if (!payload || typeof payload !== 'object') return false;
    if (shouldUseD1MarketCache(env, key)) {
        try {
            return await d1WriteRuntimeStatus(env, getD1MarketCacheKey(key), payload);
        } catch (_) {
            // Keep KV as a rollout fallback until the D1 migration is live everywhere.
        }
    }
    if (!env?.CALENDAR_KV) return false;
    try {
        await env.CALENDAR_KV.put(key, JSON.stringify(payload), { expirationTtl: ttlSeconds });
        return true;
    } catch (_) {
        return false;
    }
}

function shouldUseD1MarketCache(env, key) {
    if (!hasVisorD1(env)) return false;
    const value = String(key || '');
    return value.startsWith(MARKET_YAHOO_CHART_KEY_PREFIX) ||
        value.startsWith(MARKET_YAHOO_QUOTES_KEY_PREFIX) ||
        value === MARKET_MACRO_QUOTES_KEY ||
        value === MARKET_NEWS_KEY ||
        value.startsWith(MARKET_FEDWATCH_KEY_PREFIX);
}

function getD1MarketCacheKey(key) {
    const raw = String(key || '');
    const readable = raw.replace(/[^a-z0-9._:-]/gi, '_').slice(0, 42);
    return `market:${stablePositiveHash(raw).toString(36)}:${readable}`;
}

function withMarketCacheMeta(payload, stale) {
    return {
        ...payload,
        success: payload?.success !== false,
        stale: !!stale,
        cacheAgeMs: payload?.updatedAt ? Math.max(0, Date.now() - Number(payload.updatedAt)) : null,
    };
}

// Payloads without Fed probabilities are fallbacks; keep them out of edge caches for long.
function marketCacheHeaders(payload, headers) {
    if (!payload?.probabilityUnavailable) return headers;
    return { ...headers, 'Cache-Control': 'public, max-age=60, s-maxage=60' };
}

function marketCacheTtl(payload, freshSeconds) {
    return payload?.probabilityUnavailable ? Math.min(freshSeconds, 60) : freshSeconds;
}

async function serveCachedMarketPayload(env, ctx, corsHeaders, config) {
    if (config.request) {
        const edgeCached = await getCachedJsonResponse(config.request, corsHeaders);
        if (edgeCached) return edgeCached;
    }

    const cached = await readMarketCache(env, config.key);
    const now = Date.now();
    const cachedAgeMs = cached?.updatedAt ? now - Number(cached.updatedAt) : Infinity;
    // Rate-only Fed Watch fallbacks must not pin "no probabilities" for the full fresh window.
    const freshMs = cached?.probabilityUnavailable
        ? Math.min(config.freshSeconds, 120) * 1000
        : config.freshSeconds * 1000;
    const staleMs = config.staleSeconds * 1000;
    const headers = config.headers || {};

    if (cached && cachedAgeMs >= 0 && cachedAgeMs <= freshMs) {
        return cacheableJsonResponse(config.request, ctx, corsHeaders, withMarketCacheMeta(cached, false), 200, marketCacheHeaders(cached, headers), 'kv', marketCacheTtl(cached, config.freshSeconds));
    }

    if (cached && cachedAgeMs >= 0 && cachedAgeMs <= staleMs) {
        if (ctx?.waitUntil) {
            ctx.waitUntil(
                config.builder()
                    .then((fresh) => writeMarketCache(env, config.key, fresh, config.staleSeconds))
                    .catch(() => {})
            );
        }
        return cacheableJsonResponse(config.request, ctx, corsHeaders, withMarketCacheMeta(cached, true), 200, marketCacheHeaders(cached, headers), 'kv', marketCacheTtl(cached, config.freshSeconds));
    }

    try {
        const fresh = await config.builder();
        await writeMarketCache(env, config.key, fresh, config.staleSeconds);
        return cacheableJsonResponse(config.request, ctx, corsHeaders, withMarketCacheMeta(fresh, false), 200, marketCacheHeaders(fresh, headers), 'fresh', marketCacheTtl(fresh, config.freshSeconds));
    } catch (e) {
        if (cached) {
            return cacheableJsonResponse(config.request, ctx, corsHeaders, withMarketCacheMeta(cached, true), 200, marketCacheHeaders(cached, headers), 'kv', marketCacheTtl(cached, config.freshSeconds));
        }
        if (config.loadingOnColdMiss) {
            return jsonResponse({
                success: false,
                loading: true,
                updatedAt: null,
                stale: false,
                source: config.source || 'unavailable',
            }, corsHeaders, 200, { ...headers, 'X-Visor-Cache': 'fresh' });
        }
        return jsonResponse({
            success: false,
            ...(config.errorPayload || {}),
            error: config.error || 'Market data unavailable',
            updatedAt: null,
            stale: false,
            source: config.source || 'unavailable',
        }, corsHeaders, 503, { ...headers, 'X-Visor-Cache': 'fresh' });
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

async function fetchPolymarketEventsByTag(tagSlug) {
    const url = `https://gamma-api.polymarket.com/events?tag_slug=${encodeURIComponent(tagSlug)}&closed=false&limit=100`;
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

function latestFredObservation(observations) {
    if (!Array.isArray(observations)) return null;
    return observations.find((obs) => {
        const value = toFiniteMarketNumber(obs?.value);
        return obs?.date && value !== null;
    }) || null;
}

function formatDateOnly(date) {
    const d = date instanceof Date ? date : new Date(date);
    if (!Number.isFinite(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
}

async function fetchNyFedEffrPayload() {
    const end = new Date();
    const start = new Date(end.getTime() - 28 * 24 * 60 * 60 * 1000);
    const url = 'https://markets.newyorkfed.org/api/rates/unsecured/effr/search.json'
        + `?startDate=${encodeURIComponent(formatDateOnly(start))}`
        + `&endDate=${encodeURIComponent(formatDateOnly(end))}`;
    const data = await fetchJsonWithTimeout(url, {
        headers: {
            'Accept': 'application/json',
            'User-Agent': 'VisorCryptoWorker/1.0'
        },
        cf: { cacheTtl: 6 * 60 * 60 }
    }, 6500);
    const rows = Array.isArray(data?.refRates) ? data.refRates : [];
    const latest = rows
        .filter((row) => String(row?.type || '').toUpperCase() === 'EFFR')
        .filter((row) => toFiniteMarketNumber(row?.percentRate) !== null)
        .sort((a, b) => new Date(String(b.effectiveDate || '') + 'T00:00:00Z').getTime() - new Date(String(a.effectiveDate || '') + 'T00:00:00Z').getTime())[0];

    if (!latest) return null;
    const effectiveRate = toFiniteMarketNumber(latest.percentRate);
    let targetLower = toFiniteMarketNumber(latest.targetRateFrom);
    let targetUpper = toFiniteMarketNumber(latest.targetRateTo);
    if (effectiveRate !== null && (targetLower === null || targetUpper === null)) {
        targetUpper = Math.ceil(effectiveRate * 4) / 4;
        targetLower = targetUpper - 0.25;
    }
    if (targetLower === null || targetUpper === null) return null;

    const lower = Math.min(targetLower, targetUpper);
    const upper = Math.max(targetLower, targetUpper);
    const now = Date.now();
    return {
        effectiveRate,
        targetUpper: upper,
        targetLower: lower,
        currentRate: { lower, upper },
        cpi: null,
        unemployment: null,
        obsDate: {
            dff: latest.effectiveDate || null,
            upper: latest.effectiveDate || null,
            lower: latest.effectiveDate || null,
            cpi: null,
            unrate: null,
        },
        rateSource: 'NY Fed EFFR',
        dataSource: 'NY Fed Markets API',
        rateUpdatedAt: now,
        lastUpdate: now,
    };
}

function parseFredCsvObservations(text) {
    if (!text || typeof text !== 'string') return [];
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length <= 1) return [];

    const observations = [];
    for (let i = 1; i < lines.length; i++) {
        const comma = lines[i].indexOf(',');
        if (comma <= 0) continue;
        const date = lines[i].slice(0, comma).trim();
        const value = toFiniteMarketNumber(lines[i].slice(comma + 1).trim());
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || value === null) continue;
        observations.push({ date, value });
    }
    return observations;
}

function applyFredPc1Transform(observations) {
    if (!Array.isArray(observations) || observations.length <= 12) return observations || [];
    const transformed = [];
    for (let i = 12; i < observations.length; i++) {
        const current = toFiniteMarketNumber(observations[i]?.value);
        const previous = toFiniteMarketNumber(observations[i - 12]?.value);
        if (current === null || previous === null || previous === 0) continue;
        transformed.push({
            date: observations[i].date,
            value: ((current - previous) / Math.abs(previous)) * 100,
        });
    }
    return transformed;
}

async function fetchFredCsvFallbackForFed(seriesId, opts = {}) {
    const safeSeries = String(seriesId || '').trim().toUpperCase();
    if (!/^[A-Z0-9]+$/.test(safeSeries)) return [];

    const limit = Math.min(Math.max(parseInt(String(opts.limit || 6), 10) || 6, 1), 500);
    const sortOrder = String(opts.sortOrder || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
    const units = String(opts.units || '').trim().toLowerCase();
    const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(safeSeries)}`;

    try {
        const text = await fetchTextWithTimeout(url, {
            headers: {
                'Accept': 'text/csv,*/*',
                'User-Agent': 'VisorCryptoWorker/1.0'
            },
            cf: { cacheTtl: 24 * 60 * 60 }
        }, 6500);
        let observations = parseFredCsvObservations(text);
        if (units === 'pc1') observations = applyFredPc1Transform(observations);
        if (sortOrder === 'desc') observations = observations.slice().reverse();
        return observations.slice(0, limit);
    } catch (e) {
        console.error(`FRED CSV fallback error for ${safeSeries}:`, e);
        return [];
    }
}

async function fetchFedRateSeries(seriesId, opts, fredApiKey) {
    const apiData = await fetchHistoryFromFRED(seriesId, opts, fredApiKey);
    if (Array.isArray(apiData) && apiData.length > 0) return apiData;
    return fetchFredCsvFallbackForFed(seriesId, opts);
}

async function buildFedRatePayload(fredApiKey = '') {
    const nyFedPayload = await fetchNyFedEffrPayload().catch((e) => {
        console.error('NY Fed EFFR payload failed:', e);
        return null;
    });
    if (nyFedPayload?.currentRate) return nyFedPayload;

    const [dffResult, upperResult, lowerResult, cpiResult, unrateResult] = await Promise.allSettled([
        fetchFedRateSeries('DFF', { limit: 5 }, fredApiKey),
        fetchFedRateSeries('DFEDTARU', { limit: 5 }, fredApiKey),
        fetchFedRateSeries('DFEDTARL', { limit: 5 }, fredApiKey),
        fetchFedRateSeries('CPIAUCSL', { limit: 13, units: 'pc1' }, fredApiKey),
        fetchFedRateSeries('UNRATE', { limit: 5 }, fredApiKey),
    ]);

    const dffObs = latestFredObservation(dffResult.status === 'fulfilled' ? dffResult.value : null);
    const upperObs = latestFredObservation(upperResult.status === 'fulfilled' ? upperResult.value : null);
    const lowerObs = latestFredObservation(lowerResult.status === 'fulfilled' ? lowerResult.value : null);
    const cpiObs = latestFredObservation(cpiResult.status === 'fulfilled' ? cpiResult.value : null);
    const unrateObs = latestFredObservation(unrateResult.status === 'fulfilled' ? unrateResult.value : null);

    const effectiveRate = toFiniteMarketNumber(dffObs?.value);
    let targetUpper = toFiniteMarketNumber(upperObs?.value);
    let targetLower = toFiniteMarketNumber(lowerObs?.value);

    if (effectiveRate !== null && (targetUpper === null || targetLower === null)) {
        targetUpper = Math.ceil(effectiveRate * 4) / 4;
        targetLower = targetUpper - 0.25;
    }

    if (targetUpper === null && effectiveRate !== null) targetUpper = effectiveRate + 0.125;
    if (targetLower === null && effectiveRate !== null) targetLower = effectiveRate - 0.125;
    if (targetUpper === null || targetLower === null) return null;

    const lower = Math.min(targetLower, targetUpper);
    const upper = Math.max(targetLower, targetUpper);
    const now = Date.now();

    return {
        effectiveRate,
        targetUpper: upper,
        targetLower: lower,
        currentRate: { lower, upper },
        cpi: toFiniteMarketNumber(cpiObs?.value),
        unemployment: toFiniteMarketNumber(unrateObs?.value),
        obsDate: {
            dff: dffObs?.date || null,
            upper: upperObs?.date || null,
            lower: lowerObs?.date || null,
            cpi: cpiObs?.date || null,
            unrate: unrateObs?.date || null,
        },
        rateSource: 'FRED (Worker)',
        dataSource: 'FRED (Worker)',
        rateUpdatedAt: now,
        lastUpdate: now,
    };
}

async function buildFedRateMarketPayload(options = {}) {
    const fedRate = await buildFedRatePayload(options.fredApiKey);
    if (!fedRate || !fedRate.currentRate) throw new Error('Fed rate unavailable');
    const now = Date.now();
    return {
        success: true,
        ...fedRate,
        source: fedRate.rateSource || 'FRED (Worker)',
        dataSource: fedRate.dataSource || 'FRED (Worker)',
        updatedAt: Number(fedRate.updatedAt || fedRate.lastUpdate || now) || now,
        fetchedAt: now,
        stale: false,
    };
}

async function buildFedWatchProbabilityPayload(options = {}) {
    const meetingDateKey = getFedWatchMeetingDateParam(options.meetingDate);
    const fedRatePromise = buildFedRatePayload(options.fredApiKey).catch((e) => {
        console.error('Fed rate payload failed:', e);
        return null;
    });
    const meetingDate = meetingDateKey !== 'next' ? new Date(`${meetingDateKey}T12:00:00Z`) : null;
    const isFedText = (value) => {
        const lower = String(value || '').toLowerCase();
        return /(fomc|federal reserve|fed decision|fed decisions|fed rate|fed rates|fed funds|interest rates?|rate cut|rate hike|will the fed)/.test(lower);
    };
    // Only single-meeting events ("Fed Decision in October?") map to cut/hold/hike;
    // multi-meeting combos ("Fed decisions (Sep–Dec)") also mention pause/cut.
    const isSingleMeetingFedEvent = (event) => {
        const title = String(event?.title || event?.slug || '').toLowerCase();
        if (/next (two|three|\d+) decisions|decisions \(/.test(title)) return false;
        if (/fed decision in\b/.test(title)) return true;
        const markets = Array.isArray(event?.markets) ? event.markets : [];
        return markets.some((market) => /fed .*interest rates? .*after the [a-z]+ \d{4} meeting/i.test(String(market?.question || '')));
    };
    const selectFedCandidates = (eventList) => eventList.filter((event) => {
        if (!isSingleMeetingFedEvent(event)) return false;
        const title = String(event?.title || event?.slug || '').trim();
        const marketText = Array.isArray(event?.markets)
            ? event.markets.map((market) => `${market?.question || ''} ${market?.title || ''}`).join(' ')
            : '';
        const isFedContext = isFedText(`${title} ${marketText}`);
        if (!isFedContext) return false;

        const eventDate = event?.endDate ? new Date(event.endDate) : null;
        const nearMeeting = (
            meetingDate instanceof Date &&
            eventDate instanceof Date &&
            Number.isFinite(eventDate.getTime()) &&
            Math.abs(eventDate.getTime() - meetingDate.getTime()) <= (16 * 24 * 60 * 60 * 1000)
        );

        return nearMeeting || isPolymarketQuestionForMeeting(`${title} ${marketText}`, meetingDate);
    });

    // Gamma caps /events at 100 rows per page; query the Fed tags directly first.
    const events = [];
    for (const tag of ['fed-rates', 'fomc']) {
        const tagged = await fetchPolymarketEventsByTag(tag).catch(() => []);
        events.push(...tagged);
        if (selectFedCandidates(events).length) break;
    }
    let fedCandidates = selectFedCandidates(events);

    if (!fedCandidates.length) {
        const pageSize = 100;
        for (let page = 0; page < 10; page++) {
            const pageEvents = await fetchPolymarketEventsPage(pageSize, page * pageSize);
            if (!pageEvents.length) break;
            events.push(...pageEvents);
            fedCandidates = selectFedCandidates(events);
            if (fedCandidates.length) break;
        }
    }

    if (!events.length) throw new Error('Polymarket returned no active events');
    if (!fedCandidates.length) {
        const matchingMarkets = [];
        events.forEach((event) => {
            const markets = Array.isArray(event?.markets) ? event.markets : [];
            markets.forEach((market) => {
                const question = `${market?.question || ''} ${market?.title || ''}`;
                if (isFedText(question) && isPolymarketQuestionForMeeting(question, meetingDate)) {
                    matchingMarkets.push(market);
                }
            });
        });
        if (matchingMarkets.length) {
            fedCandidates = [{
                title: `Fed decision markets ${meetingDateKey}`,
                slug: `fed-decision-${meetingDateKey}`,
                endDate: meetingDate instanceof Date ? meetingDate.toISOString() : null,
                markets: matchingMarkets
            }];
        }
    }
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
    const fedRate = await fedRatePromise;
    return {
        success: true,
        ...(fedRate || {}),
        probabilities: normalized,
        ...normalized,
        source: 'Polymarket (Worker)',
        probabilitySource: 'Polymarket (Worker)',
        dataSource: fedRate ? `${fedRate.dataSource || fedRate.rateSource || 'Fed Rate'} + Polymarket (Worker)` : 'Polymarket (Worker)',
        eventTitle: String(selectedEvent?.title || selectedEvent?.slug || 'Fed decision event'),
        marketsUsed,
        meetingDate: meetingDateKey,
        fetchedAt: now,
        updatedAt: now,
        stale: false
    };
}

async function buildFedWatchPayload(options = {}) {
    try {
        return await buildFedWatchProbabilityPayload(options);
    } catch (probabilityError) {
        const fedRate = await buildFedRatePayload(options.fredApiKey).catch((e) => {
            console.error('Fed Watch rate-only fallback failed:', e);
            return null;
        });
        if (!fedRate || !fedRate.currentRate) throw probabilityError;
        const now = Date.now();
        return {
            success: true,
            ...fedRate,
            probabilities: null,
            cut: null,
            hold: null,
            hike: null,
            source: 'FRED (Worker)',
            probabilitySource: 'unavailable',
            dataSource: fedRate.dataSource || 'FRED (Worker)',
            eventTitle: null,
            marketsUsed: 0,
            meetingDate: getFedWatchMeetingDateParam(options.meetingDate),
            fetchedAt: now,
            updatedAt: now,
            probabilityUnavailable: true,
            probabilityError: String(probabilityError?.message || probabilityError || 'Fed probabilities unavailable').slice(0, 160),
            stale: false
        };
    }
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

const MARKET_YAHOO_ALLOWED_SYMBOLS = new Set([
    ...Object.keys(MARKET_MACRO_INDICATORS),
    'AAPL', 'MSFT', 'TSLA', 'META', 'NVDA',
    '^GSPC', '^VIX', '^TNX', '^TYX', '^FVX', '^IRX',
    'DX-Y.NYB'
]);

function normalizeYahooQuoteSymbol(raw) {
    const symbol = String(raw || '').trim().toUpperCase();
    if (!/^[A-Z0-9.^=-]{1,24}$/.test(symbol)) return '';
    return MARKET_YAHOO_ALLOWED_SYMBOLS.has(symbol) ? symbol : '';
}

function getYahooQuoteSymbols(raw) {
    const list = String(raw || '')
        .split(',')
        .map(normalizeYahooQuoteSymbol)
        .filter(Boolean);
    const symbols = [...new Set(list)].slice(0, 24);
    return symbols.length ? symbols : Object.keys(MARKET_MACRO_INDICATORS);
}

function getYahooQuotesCacheKey(symbols) {
    const normalized = getYahooQuoteSymbols((symbols || []).join ? symbols.join(',') : symbols);
    return `${MARKET_YAHOO_QUOTES_KEY_PREFIX}${normalized.map((symbol) => symbol.replace(/[^A-Z0-9]/g, '_')).join('_')}`;
}

const MARKET_YAHOO_CHART_PERIODS = Object.freeze({
    '15m': [
        { interval: '1m', range: '1d' },
        { interval: '5m', range: '5d' },
    ],
    '30m': [
        { interval: '1m', range: '1d' },
        { interval: '5m', range: '5d' },
    ],
    '4h': [
        { interval: '5m', range: '5d' },
        { interval: '15m', range: '5d' },
        { interval: '1h', range: '1mo' },
    ],
    '1d': [
        { interval: '15m', range: '5d' },
        { interval: '1h', range: '1mo' },
    ],
    '1w': [
        { interval: '1h', range: '1mo' },
        { interval: '1d', range: '3mo' },
    ],
    '1M': [
        { interval: '1d', range: '3mo' },
        { interval: '1d', range: '6mo' },
        { interval: '1h', range: '1mo' },
    ],
    '6M': [
        { interval: '1d', range: '1y' },
        { interval: '1d', range: '2y' },
    ],
    '1Y': [
        { interval: '1d', range: '2y' },
        { interval: '1wk', range: '2y' },
        { interval: '1d', range: '5y' },
    ],
});

const MARKET_YAHOO_CHART_WINDOW_MS = Object.freeze({
    '15m': 15 * 60 * 1000,
    '30m': 30 * 60 * 1000,
    '4h': 4 * 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000,
    '1w': 7 * 24 * 60 * 60 * 1000,
    '1M': 30 * 24 * 60 * 60 * 1000,
    '6M': 183 * 24 * 60 * 60 * 1000,
    '1Y': 366 * 24 * 60 * 60 * 1000,
});

function normalizeYahooChartPeriod(raw) {
    const period = String(raw || '1d').trim();
    return Object.prototype.hasOwnProperty.call(MARKET_YAHOO_CHART_PERIODS, period) ? period : '';
}

function getYahooChartCacheKey(symbol, period) {
    const safeSymbol = normalizeYahooQuoteSymbol(symbol);
    const safePeriod = normalizeYahooChartPeriod(period);
    return `${MARKET_YAHOO_CHART_KEY_PREFIX}${safeSymbol.replace(/[^A-Z0-9]/g, '_')}_${safePeriod}`;
}

function finitePositive(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? num : fallback;
}

function selectYahooChartPeriodCandles(rawCandles, period) {
    const all = Array.isArray(rawCandles)
        ? rawCandles.filter((c) => c && finitePositive(c.close, 0) > 0)
        : [];
    if (!all.length) return { candles: [], stats: null };

    const windowMs = MARKET_YAHOO_CHART_WINDOW_MS[period] || MARKET_YAHOO_CHART_WINDOW_MS['1d'];
    const anchorTs = Number(all[all.length - 1].timestamp || 0) || Date.now();
    const startTs = anchorTs - windowMs;
    let visible = all.filter((c) => Number(c.timestamp || 0) >= startTs && Number(c.timestamp || 0) <= anchorTs);
    if (!visible.length) visible = all.slice(-1);

    const firstVisibleTs = Number(visible[0]?.timestamp || 0) || 0;
    const previous = all.filter((c) => Number(c.timestamp || 0) < firstVisibleTs).slice(-1)[0] || null;
    const highs = visible.map((c) => finitePositive(c.high, finitePositive(c.close, 0))).filter((v) => v > 0);
    const lows = visible.map((c) => finitePositive(c.low, finitePositive(c.close, 0))).filter((v) => v > 0);
    const first = visible[0];
    const last = visible[visible.length - 1];
    const stats = {
        open: finitePositive(first.open, finitePositive(first.close, 0)),
        previousClose: previous ? finitePositive(previous.close, null) : null,
        high: highs.length ? Math.max(...highs) : null,
        low: lows.length ? Math.min(...lows) : null,
        close: finitePositive(last.close, 0),
        startTs: Number(first.timestamp || 0) || 0,
        endTs: Number(last.timestamp || 0) || 0,
        candles: visible.length,
        fullCandles: all.length
    };
    return { candles: visible, stats };
}

async function fetchYahooChartQuote(symbol) {
    const encoded = encodeURIComponent(symbol);
    const urls = [
        `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?interval=1d&range=1d`,
        `https://query2.finance.yahoo.com/v8/finance/chart/${encoded}?interval=1d&range=1d`,
    ];
    let result = null;
    let lastError = null;
    for (const yahooUrl of urls) {
        try {
            const data = await fetchJsonWithTimeout(yahooUrl, {
                headers: {
                    'Accept': 'application/json,text/plain,*/*',
                    'User-Agent': 'Mozilla/5.0 (compatible; VisorCryptoWorker/1.0; +https://visorcrypto.loan)'
                },
                cf: { cacheTtl: 60 }
            }, 3200);
            result = data?.chart?.result?.[0] || null;
            if (result) break;
        } catch (e) {
            lastError = e;
        }
    }
    if (!result && lastError) throw lastError;
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

function toYahooQuoteResponseItem(quote) {
    if (!quote) return null;
    return {
        symbol: quote.symbol,
        regularMarketPrice: quote.price,
        regularMarketPreviousClose: quote.previousClose,
        regularMarketChangePercent: quote.change,
        regularMarketTime: Math.floor((Number(quote.updatedAt || Date.now()) || Date.now()) / 1000)
    };
}

async function fetchYahooChartCandles(symbol, period) {
    const safeSymbol = normalizeYahooQuoteSymbol(symbol);
    const safePeriod = normalizeYahooChartPeriod(period);
    if (!safeSymbol || !safePeriod) return null;

    const encoded = encodeURIComponent(safeSymbol);
    const attempts = MARKET_YAHOO_CHART_PERIODS[safePeriod] || MARKET_YAHOO_CHART_PERIODS['1d'];
    let lastError = null;

    for (const attempt of attempts) {
        const urls = [
            `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?interval=${attempt.interval}&range=${attempt.range}`,
            `https://query2.finance.yahoo.com/v8/finance/chart/${encoded}?interval=${attempt.interval}&range=${attempt.range}`,
        ];

        for (const yahooUrl of urls) {
            try {
                const data = await fetchJsonWithTimeout(yahooUrl, {
                    headers: {
                        'Accept': 'application/json,text/plain,*/*',
                        'User-Agent': 'Mozilla/5.0 (compatible; VisorCryptoWorker/1.0; +https://visorcrypto.loan)'
                    },
                    cf: { cacheTtl: 120 }
                }, 4200);
                const result = data?.chart?.result?.[0] || null;
                const timestamps = Array.isArray(result?.timestamp) ? result.timestamp : [];
                const quote = result?.indicators?.quote?.[0] || {};
                if (!timestamps.length || !Array.isArray(quote.close)) continue;

                const rawCandles = timestamps.map((ts, index) => {
                    const close = finitePositive(quote.close?.[index], 0);
                    return {
                        timestamp: Number(ts || 0) * 1000,
                        open: finitePositive(quote.open?.[index], close),
                        high: finitePositive(quote.high?.[index], close),
                        low: finitePositive(quote.low?.[index], close),
                        close,
                        volume: Number(quote.volume?.[index] || 0) || 0
                    };
                }).filter((c) => c.timestamp > 0 && c.close > 0);
                const selected = selectYahooChartPeriodCandles(rawCandles, safePeriod);
                if (selected.candles.length > 0) {
                    return {
                        symbol: safeSymbol,
                        period: safePeriod,
                        interval: attempt.interval,
                        range: attempt.range,
                        candles: selected.candles,
                        stats: selected.stats,
                        rawCandles: rawCandles.length
                    };
                }
            } catch (e) {
                lastError = e;
            }
        }
    }

    if (lastError) throw lastError;
    return null;
}

async function buildYahooChartPayload(symbol, period) {
    const safeSymbol = normalizeYahooQuoteSymbol(symbol);
    const safePeriod = normalizeYahooChartPeriod(period);
    if (!safeSymbol) throw new Error('Invalid Yahoo chart symbol');
    if (!safePeriod) throw new Error('Invalid Yahoo chart period');

    const result = await fetchYahooChartCandles(safeSymbol, safePeriod);
    if (!result || !Array.isArray(result.candles) || !result.candles.length) {
        throw new Error('No Yahoo chart candles loaded');
    }

    return {
        success: true,
        source: 'yahoo_chart_v8_worker',
        updatedAt: Date.now(),
        symbol: safeSymbol,
        period: safePeriod,
        interval: result.interval,
        range: result.range,
        rawCandles: result.rawCandles,
        candles: result.candles,
        stats: result.stats || null,
        loaded: result.candles.length
    };
}

async function buildYahooQuotesPayload(symbols) {
    const safeSymbols = [...new Set((symbols || []).map(normalizeYahooQuoteSymbol).filter(Boolean))].slice(0, 24);
    if (!safeSymbols.length) throw new Error('No allowed Yahoo symbols');

    const settled = await Promise.allSettled(safeSymbols.map(fetchYahooChartQuote));
    const result = settled
        .filter((item) => item.status === 'fulfilled' && item.value)
        .map((item) => toYahooQuoteResponseItem(item.value))
        .filter(Boolean);

    if (!result.length) throw new Error('No Yahoo quotes loaded');

    return {
        success: true,
        source: 'yahoo_chart_v8_worker',
        updatedAt: Date.now(),
        symbols: safeSymbols,
        quoteResponse: { result },
        loaded: result.length
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
    const requestOptions = {
        cf: { cacheTtl: 180 },
        headers: {
            'Accept': 'application/json',
            'User-Agent': 'VisorCrypto/1.0 (+https://visorcrypto.loan)'
        }
    };
    const providers = [
        async () => {
            const data = await fetchJsonWithTimeout('https://api.coingecko.com/api/v3/global', requestOptions, 5000);
            return {
                source: 'coingecko_global',
                raw: Number(data?.data?.market_cap_percentage?.btc || 0),
                marketCapUsd: Number(data?.data?.total_market_cap?.usd || 0) || 0,
                volumeUsd: Number(data?.data?.total_volume?.usd || 0) || 0
            };
        },
        async () => {
            const data = await fetchJsonWithTimeout('https://api.coinpaprika.com/v1/global', requestOptions, 5000);
            return {
                source: 'coinpaprika_global',
                raw: Number(data?.bitcoin_dominance_percentage || 0),
                marketCapUsd: Number(data?.market_cap_usd || 0) || 0,
                volumeUsd: Number(data?.volume_24h_usd || 0) || 0
            };
        },
        async () => {
            const data = await fetchJsonWithTimeout('https://api.coinlore.net/api/global/', requestOptions, 5000);
            const row = Array.isArray(data) ? data[0] : data;
            return {
                source: 'coinlore_global',
                raw: Number(row?.btc_d || 0),
                marketCapUsd: Number(row?.total_mcap || 0) || 0,
                volumeUsd: Number(row?.total_volume || 0) || 0
            };
        }
    ];

    let lastError = null;
    for (const load of providers) {
        try {
            const result = await load();
            if (!Number.isFinite(result.raw) || result.raw <= 0 || result.raw > 100) {
                throw new Error('Invalid BTC dominance');
            }
            return {
                success: true,
                source: result.source,
                updatedAt: Date.now(),
                btcDominanceRaw: result.raw,
                btcDominance: result.raw + BTC_DOMINANCE_ADJUSTMENT,
                adjustment: BTC_DOMINANCE_ADJUSTMENT,
                marketCapUsd: result.marketCapUsd,
                volumeUsd: result.volumeUsd
            };
        } catch (error) {
            lastError = error;
        }
    }
    throw lastError || new Error('Invalid BTC dominance');
}

function parseBlockchainCenterAltseason(text) {
    const raw = String(text || '');
    const plain = raw
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const patterns = [
        /Altcoin Season\s*\((\d{1,3})\)/i,
        /It is not Altcoin Season!\s*(\d{1,3})\s*Bitcoin Season/i,
        /### Altcoin Season Index[\s\S]{0,160}?(?:Altcoin Season!\s*)?(\d{1,3})\s*Bitcoin Season/i,
    ];
    for (const pattern of patterns) {
        const match = plain.match(pattern) || raw.match(pattern);
        const value = Number(match?.[1]);
        if (Number.isFinite(value) && value >= 0 && value <= 100) return Math.round(value);
    }
    return null;
}

async function fetchBlockchainCenterAltseason() {
    const text = await fetchTextWithTimeout(
        'https://www.blockchaincenter.net/altcoin-season-index/',
        {
            cf: { cacheTtl: 1800 },
            headers: {
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'User-Agent': 'Mozilla/5.0 (compatible; VisorCrypto/1.0; +https://visorcrypto.loan)'
            }
        },
        12000
    );
    const value = parseBlockchainCenterAltseason(text);
    if (value !== null) return value;
    throw new Error('BlockchainCenter altseason unavailable');
}

async function buildAltseasonPayload() {
    const value = await fetchBlockchainCenterAltseason();
    return {
        success: true,
        source: 'blockchaincenter',
        methodology: 'top50_vs_btc_90d',
        lookbackDays: 90,
        universe: 'top50_ex_stable_wrapped',
        updatedAt: Date.now(),
        value,
        label: getAltseasonLabel(value),
    };
}

async function prewarmAltseasonCache(env) {
    const cached = await readMarketCache(env, MARKET_ALTSEASON_KEY);
    const cachedAgeMs = cached?.updatedAt ? Date.now() - Number(cached.updatedAt) : Infinity;
    if (cached && cachedAgeMs >= 0 && cachedAgeMs < MARKET_ALTSEASON_FRESH_SECONDS * 1000) return false;
    const fresh = await buildAltseasonPayload();
    await writeMarketCache(env, MARKET_ALTSEASON_KEY, fresh, MARKET_ALTSEASON_STALE_SECONDS);
    return true;
}

function isValidMarketGlobalPayload(payload) {
    const value = Number(payload?.btcDominance || 0);
    const updatedAt = Number(payload?.updatedAt || 0);
    return payload && typeof payload === 'object' && Number.isFinite(value) && value > 0 && Number.isFinite(updatedAt) && updatedAt > 0;
}

function isValidAltseasonPayload(payload) {
    const value = Number(payload?.value);
    const updatedAt = Number(payload?.updatedAt || 0);
    return payload && typeof payload === 'object' && Number.isFinite(value) && value >= 0 && value <= 100 && Number.isFinite(updatedAt) && updatedAt > 0;
}

function getAltseasonLabel(value) {
    const score = clampIndexValue(value);
    if (score === null) return 'Indisponível';
    if (score < 25) return 'Bitcoin Season';
    if (score < 45) return 'BTC Favorecido';
    if (score < 55) return 'Mercado Neutro';
    if (score < 75) return 'Altcoins Favorecidas';
    return 'Altseason';
}

async function getMarketComponentPayload(env, config) {
    const now = Date.now();
    const cached = await readMarketCache(env, config.key);
    const cachedAgeMs = cached?.updatedAt ? now - Number(cached.updatedAt) : Infinity;
    const freshMs = Number(config.freshSeconds || 0) * 1000;
    const staleMs = Number(config.staleSeconds || 0) * 1000;
    const isValid = typeof config.isValid === 'function' ? config.isValid : (() => true);

    if (cached && cachedAgeMs >= 0 && cachedAgeMs <= freshMs && isValid(cached)) {
        return { payload: cached, stale: false, cacheAgeMs: cachedAgeMs };
    }

    try {
        const fresh = await config.builder();
        if (!isValid(fresh)) throw new Error(`Invalid ${config.key} payload`);
        await writeMarketCache(env, config.key, fresh, config.staleSeconds);
        return { payload: fresh, stale: false, cacheAgeMs: 0 };
    } catch (e) {
        if (cached && cachedAgeMs >= 0 && cachedAgeMs <= staleMs && isValid(cached)) {
            return { payload: cached, stale: true, cacheAgeMs: cachedAgeMs, error: e?.message || String(e || '') };
        }
        throw e;
    }
}

function normalizeBtcDominanceBlock(component) {
    const payload = component?.payload || {};
    const value = Number(payload.btcDominance || 0);
    const raw = Number(payload.btcDominanceRaw || 0);
    if (!Number.isFinite(value) || value <= 0) return null;
    return {
        value,
        raw: Number.isFinite(raw) && raw > 0 ? raw : null,
        adjustment: Number(payload.adjustment || BTC_DOMINANCE_ADJUSTMENT) || BTC_DOMINANCE_ADJUSTMENT,
        updatedAt: Number(payload.updatedAt || Date.now()) || Date.now(),
        source: String(payload.source || 'coingecko_global'),
        stale: !!component?.stale,
        cacheAgeMs: Number.isFinite(Number(component?.cacheAgeMs)) ? Number(component.cacheAgeMs) : null,
        marketCapUsd: Number(payload.marketCapUsd || 0) || 0,
        volumeUsd: Number(payload.volumeUsd || 0) || 0,
    };
}

function normalizeAltseasonBlock(component) {
    const payload = component?.payload || {};
    const value = clampIndexValue(payload.value);
    if (value === null) return null;
    return {
        value,
        label: String(payload.label || getAltseasonLabel(value)),
        updatedAt: Number(payload.updatedAt || Date.now()) || Date.now(),
        source: String(payload.source || 'blockchaincenter'),
        stale: !!component?.stale,
        cacheAgeMs: Number.isFinite(Number(component?.cacheAgeMs)) ? Number(component.cacheAgeMs) : null,
        methodology: payload.methodology || 'top50_vs_btc_90d',
        lookbackDays: Number(payload.lookbackDays || 90) || 90,
        universe: payload.universe || 'top50_ex_stable_wrapped',
    };
}

async function buildMarketGlobalSnapshotPayload(env) {
    const [globalResult, altseasonResult] = await Promise.allSettled([
        getMarketComponentPayload(env, {
            key: MARKET_GLOBAL_KEY,
            freshSeconds: MARKET_FRESH_SECONDS,
            staleSeconds: MARKET_GLOBAL_SNAPSHOT_STALE_SECONDS,
            builder: buildMarketGlobalPayload,
            isValid: isValidMarketGlobalPayload,
        }),
        getMarketComponentPayload(env, {
            key: MARKET_ALTSEASON_KEY,
            freshSeconds: MARKET_ALTSEASON_FRESH_SECONDS,
            staleSeconds: MARKET_ALTSEASON_STALE_SECONDS,
            builder: buildAltseasonPayload,
            isValid: isValidAltseasonPayload,
        }),
    ]);

    const btcDominance = globalResult.status === 'fulfilled' ? normalizeBtcDominanceBlock(globalResult.value) : null;
    const altseasonIndex = altseasonResult.status === 'fulfilled' ? normalizeAltseasonBlock(altseasonResult.value) : null;
    if (!btcDominance && !altseasonIndex) {
        throw new Error('Global market snapshot unavailable');
    }

    const updatedAt = Math.max(
        Number(btcDominance?.updatedAt || 0) || 0,
        Number(altseasonIndex?.updatedAt || 0) || 0,
        Date.now()
    );

    const snapshot = {
        success: true,
        source: 'worker_market_snapshot',
        updatedAt,
        builtAt: Date.now(),
        stale: !!(btcDominance?.stale || altseasonIndex?.stale),
        partial: !(btcDominance && altseasonIndex),
        btcDominance,
        altseasonIndex,
    };

    await writeMarketCache(env, MARKET_GLOBAL_SNAPSHOT_KEY, snapshot, MARKET_GLOBAL_SNAPSHOT_STALE_SECONDS);
    return snapshot;
}

async function prewarmMarketGlobalCache(env) {
    const cached = await readMarketCache(env, MARKET_GLOBAL_KEY);
    const cachedAgeMs = cached?.updatedAt ? Date.now() - Number(cached.updatedAt) : Infinity;
    if (cached && cachedAgeMs >= 0 && cachedAgeMs < MARKET_FRESH_SECONDS * 1000 && isValidMarketGlobalPayload(cached)) return false;
    const fresh = await buildMarketGlobalPayload();
    await writeMarketCache(env, MARKET_GLOBAL_KEY, fresh, MARKET_GLOBAL_SNAPSHOT_STALE_SECONDS);
    return true;
}

async function prewarmMarketGlobalSnapshotCache(env) {
    const cached = await readMarketCache(env, MARKET_GLOBAL_SNAPSHOT_KEY);
    const cachedAgeMs = cached?.updatedAt ? Date.now() - Number(cached.updatedAt) : Infinity;
    if (cached && cachedAgeMs >= 0 && cachedAgeMs < MARKET_GLOBAL_SNAPSHOT_FRESH_SECONDS * 1000) return false;
    await buildMarketGlobalSnapshotPayload(env);
    return true;
}

async function prewarmMarketCacheIfStale(env, config) {
    const cached = await readMarketCache(env, config.key);
    const cachedAgeMs = cached?.updatedAt ? Date.now() - Number(cached.updatedAt) : Infinity;
    const freshSeconds = Number(config.freshSeconds || 0);
    const isValid = typeof config.isValid === 'function' ? config.isValid : (() => true);
    if (cached && cachedAgeMs >= 0 && cachedAgeMs < freshSeconds * 1000 && isValid(cached)) return false;
    const fresh = await config.builder();
    if (!isValid(fresh)) throw new Error(`Invalid ${config.key} payload`);
    await writeMarketCache(env, config.key, fresh, config.staleSeconds);
    return true;
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

function normalizeBitcoinAddress(raw) {
    const address = String(raw || '').trim();
    if (/^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(address)) return address;
    if (/^bc1[ac-hj-np-z02-9]{11,71}$/i.test(address)) return address.toLowerCase();
    return '';
}

async function buildWalletLabelPayload(address) {
    const safeAddress = normalizeBitcoinAddress(address);
    if (!safeAddress) throw new Error('Invalid wallet address');

    const url = `https://www.walletexplorer.com/api/1/address-lookup?address=${encodeURIComponent(safeAddress)}&caller=visor-crypto`;
    const data = await fetchJsonWithTimeout(url, {
        cf: { cacheTtl: WALLET_LABEL_FRESH_SECONDS },
        headers: {
            'Accept': 'application/json',
            'User-Agent': 'VisorCrypto/1.0 (+https://visorcrypto.loan)'
        }
    }, 5000);

    const label = String(data?.label || '').trim().slice(0, 120);
    return {
        success: true,
        source: 'walletexplorer_worker',
        updatedAt: Date.now(),
        address: safeAddress,
        label: label || null,
        found: !!label
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

class LiquidationsDO {
    constructor(state, env) {
        this.state = state;
        this.env = env;
        this.trackedKey = 'liq_tracked_symbols_v1';
        this.accumPrefix = 'liq_accum:';
        this.maxTracked = 50;
    }

    _json(data, status = 200) {
        return new Response(JSON.stringify(data), {
            status,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    async _track(symbol) {
        const safeSymbol = normalizeLiquidationSymbol(symbol);
        if (!safeSymbol || !/^[A-Z0-9]{4,20}$/.test(safeSymbol)) {
            return this._json({ success: false, error: 'Invalid symbol' }, 400);
        }
        const data = await this.state.storage.get(this.trackedKey);
        const symbols = Array.isArray(data?.symbols) ? data.symbols.map(normalizeLiquidationSymbol).filter(Boolean) : [];
        const next = symbols.filter((item) => item !== safeSymbol);
        next.push(safeSymbol);
        await this.state.storage.put(this.trackedKey, {
            symbols: next.slice(-this.maxTracked),
            ts: Date.now()
        });
        return this._json({ success: true, symbol: safeSymbol });
    }

    async _tracked() {
        const data = await this.state.storage.get(this.trackedKey);
        const symbols = Array.isArray(data?.symbols) ? data.symbols.map(normalizeLiquidationSymbol).filter(Boolean) : [];
        return this._json({ success: true, symbols: [...new Set(symbols)].slice(-this.maxTracked), ts: Number(data?.ts || 0) || 0 });
    }

    async _getAccum(symbol) {
        const safeSymbol = normalizeLiquidationSymbol(symbol);
        if (!safeSymbol) return this._json({ success: false, error: 'Invalid symbol' }, 400);
        const now = Date.now();
        const data = await this.state.storage.get(`${this.accumPrefix}${safeSymbol}`);
        const orders = mergeLiquidationOrders(data?.orders || [], [], now);
        if (orders.length !== (Array.isArray(data?.orders) ? data.orders.length : 0)) {
            await this.state.storage.put(`${this.accumPrefix}${safeSymbol}`, { orders, ts: now });
        }
        return this._json({ success: true, symbol: safeSymbol, orders, ts: Number(data?.ts || 0) || 0 });
    }

    async _putAccum(body) {
        const safeSymbol = normalizeLiquidationSymbol(body?.symbol);
        if (!safeSymbol) return this._json({ success: false, error: 'Invalid symbol' }, 400);
        const now = Number(body?.ts || Date.now()) || Date.now();
        const key = `${this.accumPrefix}${safeSymbol}`;
        const existing = await this.state.storage.get(key);
        const orders = mergeLiquidationOrders(existing?.orders || [], body?.orders || [], now);
        await this.state.storage.put(key, { orders, ts: now });
        return this._json({ success: true, symbol: safeSymbol, count: orders.length, ts: now });
    }

    async fetch(request) {
        const url = new URL(request.url);
        try {
            if (url.pathname === '/liquidations/track' && request.method === 'POST') {
                const body = await request.json().catch(() => ({}));
                return this._track(body?.symbol);
            }
            if (url.pathname === '/liquidations/tracked' && request.method === 'GET') {
                return this._tracked();
            }
            if (url.pathname === '/liquidations/accum' && request.method === 'GET') {
                return this._getAccum(url.searchParams.get('symbol'));
            }
            if (url.pathname === '/liquidations/accum' && request.method === 'POST') {
                const body = await request.json().catch(() => ({}));
                return this._putAccum(body);
            }
        } catch (e) {
            console.error('LiquidationsDO error:', e);
            return this._json({ success: false, error: 'Liquidations storage error' }, 500);
        }
        return this._json({ success: false, error: 'Not found' }, 404);
    }
}

class NotificationRegistryDO {
    constructor(state, env) {
        this.state = state;
        this.env = env;
        this.devicePrefix = 'device:';
        this.dedupPrefix = 'dedup:';
        this.deviceTtlMs = NOTIF_PREFS_SYNC_WINDOW_SECONDS * 1000;
        this.dedupTtlMs = NOTIF_DEDUP_SECONDS * 1000;
    }

    _json(data, status = 200) {
        return new Response(JSON.stringify(data), {
            status,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    _deviceKey(deviceId) {
        const safeDeviceId = normalizeDeviceId(deviceId);
        return safeDeviceId ? `${this.devicePrefix}${safeDeviceId}` : '';
    }

    async _cleanupDedup(now = Date.now()) {
        const lastCleanup = Number(await this.state.storage.get('dedup_last_cleanup') || 0);
        if (now - lastCleanup < 10 * 60 * 1000) return;
        const listed = await this.state.storage.list({ prefix: this.dedupPrefix });
        const deletes = [];
        for (const [key, value] of listed.entries()) {
            const ts = Number(value?.ts || 0);
            if (!ts || now - ts > this.dedupTtlMs) deletes.push(key);
        }
        if (deletes.length > 0) await this.state.storage.delete(deletes);
        await this.state.storage.put('dedup_last_cleanup', now);
    }

    async _register(body) {
        const deviceId = normalizeDeviceId(body?.deviceId);
        const token = String(body?.token || '').trim();
        if (!deviceId || token.length < 40 || token.length > 4096) {
            return this._json({ success: false, error: 'Invalid device registration' }, 400);
        }
        const key = this._deviceKey(deviceId);
        const existing = await this.state.storage.get(key);
        const now = Date.now();
        const prefs = normalizeNotificationPrefs(body?.prefs || existing?.prefs || {});
        const record = {
            ...(existing && typeof existing === 'object' ? existing : {}),
            deviceId,
            userId: normalizeUserId(body?.userId || existing?.userId || ''),
            token,
            platform: String(body?.platform || existing?.platform || 'android').slice(0, 30),
            appVersion: String(body?.appVersion || existing?.appVersion || '').slice(0, 40),
            prefs,
            updatedAt: now,
            expiresAt: now + this.deviceTtlMs
        };
        await this.state.storage.put(key, record);
        return this._json({ success: true, registeredAt: now });
    }

    async _prefs(body) {
        const deviceId = normalizeDeviceId(body?.deviceId);
        if (!deviceId) return this._json({ success: false, error: 'Invalid device identity' }, 400);
        const key = this._deviceKey(deviceId);
        const existing = await this.state.storage.get(key);
        const now = Date.now();
        const record = {
            ...(existing && typeof existing === 'object' ? existing : {}),
            deviceId,
            userId: normalizeUserId(body?.userId || existing?.userId || ''),
            token: String(existing?.token || ''),
            platform: String(existing?.platform || 'android').slice(0, 30),
            appVersion: String(existing?.appVersion || '').slice(0, 40),
            prefs: normalizeNotificationPrefs(body?.prefs || {}),
            updatedAt: now,
            expiresAt: now + this.deviceTtlMs
        };
        await this.state.storage.put(key, record);
        return this._json({ success: true, updatedAt: now });
    }

    async _unregister(body) {
        const key = this._deviceKey(body?.deviceId);
        if (key) await this.state.storage.delete(key);
        return this._json({ success: true });
    }

    async _devices() {
        const now = Date.now();
        const listed = await this.state.storage.list({ prefix: this.devicePrefix });
        const devices = [];
        const expired = [];
        for (const [key, value] of listed.entries()) {
            if (!value || Number(value.expiresAt || 0) <= now) {
                expired.push(key);
                continue;
            }
            if (value.token && value.deviceId) {
                devices.push({
                    ...value,
                    prefs: normalizeNotificationPrefs(value.prefs || {})
                });
            }
        }
        if (expired.length > 0) await this.state.storage.delete(expired);
        return this._json({ success: true, devices, total: devices.length });
    }

    async _claimDedup(body) {
        const deviceId = normalizeDeviceId(body?.deviceId);
        const symbol = normalizeAllowedSignalSymbol(body?.symbol);
        const direction = normalizeSignalDirection(body?.direction);
        if (!deviceId || !symbol || (direction !== 'LONG' && direction !== 'SHORT')) {
            return this._json({ success: false, allowed: true, error: 'Invalid dedup identity' }, 400);
        }
        const now = Number(body?.ts || Date.now()) || Date.now();
        const key = `${this.dedupPrefix}${deviceId}:${symbol}:${direction}`;
        const result = await this.state.storage.transaction(async (txn) => {
            const existing = await txn.get(key);
            const ts = Number(existing?.ts || 0);
            if (ts && now - ts < this.dedupTtlMs) {
                return { success: true, allowed: false, ts };
            }
            await txn.put(key, { ts: now, expiresAt: now + this.dedupTtlMs });
            return { success: true, allowed: true, ts: now };
        });
        await this._cleanupDedup(now);
        return this._json(result);
    }

    async _releaseDedup(body) {
        const deviceId = normalizeDeviceId(body?.deviceId);
        const symbol = normalizeAllowedSignalSymbol(body?.symbol);
        const direction = normalizeSignalDirection(body?.direction);
        if (!deviceId || !symbol || (direction !== 'LONG' && direction !== 'SHORT')) {
            return this._json({ success: false, error: 'Invalid dedup identity' }, 400);
        }
        await this.state.storage.delete(`${this.dedupPrefix}${deviceId}:${symbol}:${direction}`);
        return this._json({ success: true });
    }

    _normalizeDedupEvents(body) {
        return (Array.isArray(body?.events) ? body.events : [])
            .map((event) => ({
                symbol: normalizeAllowedSignalSymbol(event?.symbol),
                direction: normalizeSignalDirection(event?.direction)
            }))
            .filter((event) => event.symbol && (event.direction === 'LONG' || event.direction === 'SHORT'))
            .slice(0, APP_SIGNAL_SYMBOL_LIST.length);
    }

    async _claimDedupBatch(body) {
        const deviceId = normalizeDeviceId(body?.deviceId);
        const events = this._normalizeDedupEvents(body);
        if (!deviceId || events.length === 0) {
            return this._json({ success: false, allowed: [], denied: [], error: 'Invalid dedup batch' }, 400);
        }
        const now = Number(body?.ts || Date.now()) || Date.now();
        const result = await this.state.storage.transaction(async (txn) => {
            const keys = events.map((event) => `${this.dedupPrefix}${deviceId}:${event.symbol}:${event.direction}`);
            const existing = await txn.get(keys);
            const allowed = [];
            const denied = [];
            const writes = {};
            events.forEach((event, index) => {
                const publicKey = notificationDedupEventKey(event.symbol, event.direction);
                const previous = existing.get(keys[index]);
                const ts = Number(previous?.ts || 0);
                if (ts && now - ts < this.dedupTtlMs) {
                    denied.push(publicKey);
                    return;
                }
                allowed.push(publicKey);
                writes[keys[index]] = { ts: now, expiresAt: now + this.dedupTtlMs };
            });
            if (Object.keys(writes).length > 0) await txn.put(writes);
            return { success: true, allowed, denied, ts: now };
        });
        await this._cleanupDedup(now);
        return this._json(result);
    }

    async _releaseDedupBatch(body) {
        const deviceId = normalizeDeviceId(body?.deviceId);
        const events = this._normalizeDedupEvents(body);
        if (!deviceId || events.length === 0) {
            return this._json({ success: false, error: 'Invalid dedup batch' }, 400);
        }
        const keys = events.map((event) => `${this.dedupPrefix}${deviceId}:${event.symbol}:${event.direction}`);
        await this.state.storage.delete(keys);
        return this._json({ success: true, released: keys.length });
    }

    async fetch(request) {
        const url = new URL(request.url);
        try {
            if (url.pathname === '/notifications/devices' && request.method === 'GET') {
                return this._devices();
            }
            if (url.pathname === '/notifications/register' && request.method === 'POST') {
                return this._register(await request.json().catch(() => ({})));
            }
            if (url.pathname === '/notifications/prefs' && request.method === 'POST') {
                return this._prefs(await request.json().catch(() => ({})));
            }
            if (url.pathname === '/notifications/unregister' && request.method === 'POST') {
                return this._unregister(await request.json().catch(() => ({})));
            }
            if (url.pathname === '/notifications/dedup/claim' && request.method === 'POST') {
                return this._claimDedup(await request.json().catch(() => ({})));
            }
            if (url.pathname === '/notifications/dedup/release' && request.method === 'POST') {
                return this._releaseDedup(await request.json().catch(() => ({})));
            }
            if (url.pathname === '/notifications/dedup/claim-batch' && request.method === 'POST') {
                return this._claimDedupBatch(await request.json().catch(() => ({})));
            }
            if (url.pathname === '/notifications/dedup/release-batch' && request.method === 'POST') {
                return this._releaseDedupBatch(await request.json().catch(() => ({})));
            }
        } catch (e) {
            console.error('NotificationRegistryDO error:', e);
            return this._json({ success: false, error: 'Notification registry error' }, 500);
        }
        return this._json({ success: false, error: 'Not found' }, 404);
    }
}

class CallHistoryDO {
    constructor(state, env) {
        this.state = state;
        this.env = env;
        this.callsKey = CALL_HISTORY_DO_KEY;
        this.maxCalls = 500;
        this.idempotencyTtlMs = 24 * 60 * 60 * 1000;
        this.settlementMetaKey = 'calls_settlement_meta_v1';
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

    async _isAdminAuthorized(request) {
        const token = getSecret(this.env, 'CALLS_ADMIN_TOKEN');
        if (!token) return { ok: false, status: 503, error: 'Calls admin token not configured' };
        const provided = String(request.headers.get('X-Admin-Token') || '').trim();
        if (!provided || !(await constantTimeSecretEqual(provided, token))) return { ok: false, status: 401, error: 'Unauthorized' };
        return { ok: true };
    }

    async _mirrorCallsSnapshot(calls) {
        if (getSecret(this.env, 'ENABLE_CALLS_KV_MIRROR') !== 'true' || !this.env?.CALENDAR_KV || !Array.isArray(calls)) {
            return;
        }
        try {
            await this.env.CALENDAR_KV.put(SHARED_CALL_HISTORY_KEY, JSON.stringify(calls), {
                expirationTtl: 30 * 24 * 60 * 60
            });
        } catch (kvErr) {
            console.warn('CallHistoryDO KV mirror failed:', kvErr && kvErr.message ? kvErr.message : kvErr);
        }
    }

    async _loadCallsFromStorage() {
        const now = Date.now();
        let calls = filterAllowedCalls(await this.state.storage.get(this.callsKey));
        let migrated = false;

        if (!Array.isArray(calls) || calls.length === 0) {
            for (const key of CALL_HISTORY_LEGACY_KEYS) {
                const legacy = filterAllowedCalls(await this.state.storage.get(key));
                if (legacy.length) {
                    calls = calls.concat(legacy);
                    migrated = true;
                }
            }
            if ((!calls || calls.length === 0) && this.env?.CALENDAR_KV) {
                for (const key of SHARED_CALL_HISTORY_LEGACY_KEYS) {
                    const legacy = filterAllowedCalls(await this.env.CALENDAR_KV.get(key, 'json'));
                    if (legacy.length) {
                        calls = calls.concat(legacy);
                        migrated = true;
                    }
                }
            }
        }

        const deduped = dedupeAndSortCallHistory(calls, now).slice(0, this.maxCalls);
        if (migrated || JSON.stringify(calls || []) !== JSON.stringify(deduped)) {
            await this.state.storage.put(this.callsKey, deduped);
            await this._mirrorCallsSnapshot(deduped);
        }
        return deduped;
    }

    async _settleAndPersist(options = {}) {
        const current = await this._loadCallsFromStorage();
        const now = Date.now();
        const minIntervalMs = Math.max(0, Number(options.minIntervalMs || 0) || 0);
        const force = options.force === true;
        if (!force && minIntervalMs > 0) {
            const meta = await this.state.storage.get(this.settlementMetaKey).catch(() => null);
            const lastSettlementAt = Number(meta?.lastSettlementAt || 0) || 0;
            if (lastSettlementAt && now - lastSettlementAt >= 0 && now - lastSettlementAt < minIntervalMs) {
                return {
                    calls: current,
                    changed: false,
                    settledIntervals: 0,
                    fetches: 0,
                    touchedCalls: 0,
                    skipped: true,
                    lastSettlementAt
                };
            }
        }

        const before = JSON.stringify(current || []);
        const result = await settlePendingCallOutcomes(current, options);
        const calls = dedupeAndSortCallHistory(result.calls, Date.now()).slice(0, this.maxCalls);
        const after = JSON.stringify(calls);
        const changed = result.changed || before !== after;

        if (changed) {
            await this.state.storage.put(this.callsKey, calls);
            await this._mirrorCallsSnapshot(calls);
        }

        await this.state.storage.put(this.settlementMetaKey, {
            lastSettlementAt: Date.now(),
            changed,
            settledIntervals: Number(result.settledIntervals || 0) || 0,
            fetches: Number(result.fetches || 0) || 0
        }).catch(() => {});

        return { ...result, calls, changed };
    }

    async _handleReset(request) {
        const auth = await this._isAdminAuthorized(request);
        if (!auth.ok) return this._json({ success: false, error: auth.error }, auth.status || 401);

        const resetAt = new Date().toISOString();
        const callsKeys = [...new Set([this.callsKey, CALL_HISTORY_DO_KEY, 'calls_v5', 'calls_v4', 'calls_v3'])];
        await this.state.storage.delete(callsKeys);

        const idemItems = await this.state.storage.list({ prefix: 'idem:' });
        const idemKeys = [...idemItems.keys()];
        if (idemKeys.length > 0) {
            await this.state.storage.delete(idemKeys);
        }
        await this.state.storage.delete('idem_last_cleanup');

        if (this.env?.CALENDAR_KV) {
            try {
                await Promise.allSettled([
                    this.env.CALENDAR_KV.delete(SHARED_CALL_HISTORY_KEY),
                    this.env.CALENDAR_KV.delete('shared_call_history_v5'),
                    this.env.CALENDAR_KV.delete('shared_call_history_v3'),
                    this.env.CALENDAR_KV.delete('shared_call_history_v4')
                ]);
            } catch (_) {}
        }

        return this._json({ success: true, resetAt }, 200);
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

        if (safeConfidence < SIGNAL_MIN_CONFIDENCE) {
            return this._json({ success: false, error: 'Confidence below strategy minimum' }, 400);
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

            let storedCalls = filterAllowedCalls(await txn.get(this.callsKey));
            if (!storedCalls.length) {
                for (const key of CALL_HISTORY_LEGACY_KEYS) {
                    const legacy = filterAllowedCalls(await txn.get(key));
                    if (legacy.length) storedCalls = storedCalls.concat(legacy);
                }
            }
            let calls = dedupeAndSortCallHistory(storedCalls, now);

            const incomingKey = buildCanonicalCallKey(safeSymbol, safeDirection, safeTime);
            const duplicateCall = calls.find((c) =>
                c.symbol === safeSymbol &&
                c.direction === safeDirection &&
                (
                    getCallDedupKey(c) === incomingKey ||
                    Math.abs(Number(c.time || 0) - safeTime) < CALL_DEDUP_WINDOW_MS
                )
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

            const newCall = normalizeCallRecordForStorage({
                ...body,
                id: buildUniqueCallId(safeSymbol, safeDirection, safeTime, body?.id),
                callKey: buildCanonicalCallKey(safeSymbol, safeDirection, safeTime),
                symbol: safeSymbol,
                name: String(body?.name || '').slice(0, 50),
                short: String(body?.short || safeSymbol.replace('USDT', '')).slice(0, 10),
                img: String(body?.img || '').slice(0, 200),
                direction: safeDirection,
                confidence: Math.round(safeConfidence),
                gates: String(body?.gates || '').slice(0, 20),
                price: String(body?.price || '').slice(0, 20),
                entryPrice: Number(body?.entryPrice ?? body?.price ?? 0) || null,
                reason: String(body?.reason || '').slice(0, 180),
                source: String(body?.source || body?.reason || '').slice(0, 180),
                strategyVersion: String(body?.strategyVersion || SIGNAL_STRATEGY_VERSION).slice(0, 20),
                time: safeTime,
                timestamp: safeTime,
                prices: normalizeIntervalMap(null, null),
                pnl: normalizeIntervalMap(null, null),
                checked: normalizeIntervalMap(null, false),
                features: sanitizeCallFeatures(body?.features),
                deviceId,
                userId: userId || String(body?.userId || '').slice(0, 64)
            }, now);

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

        if (Array.isArray(result?.callsSnapshot)) {
            await this._mirrorCallsSnapshot(result.callsSnapshot);
        }

        if (result && Object.prototype.hasOwnProperty.call(result, 'callsSnapshot')) {
            delete result.callsSnapshot;
        }

        await this._cleanupIdempotency();
        return this._json(result, 200);
    }

    async _handleGet(url) {
        const requestedLimit = parseInt(url.searchParams.get('limit') || '100', 10);
        const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), this.maxCalls) : 100;
        let calls = await this._loadCallsFromStorage();

        const filterDir = String(url.searchParams.get('direction') || '').toUpperCase();
        if (filterDir === 'LONG' || filterDir === 'SHORT') {
            calls = calls.filter((c) => c.direction === filterDir);
        }

        calls = calls.slice(0, limit);

        return this._json({
            success: true,
            calls,
            total: calls.length,
            settlement: {
                version: CALL_SETTLEMENT_VERSION,
                settledIntervals: 0,
                fetches: 0,
                touchedCalls: 0,
                changed: false,
                skipped: true,
                source: 'scheduled'
            }
        }, 200);
    }

    async _handleSettle(url) {
        const maxCalls = Math.min(120, Math.max(1, Number(url.searchParams.get('maxCalls') || 80) || 80));
        const maxFetches = Math.min(12, Math.max(1, Number(url.searchParams.get('maxFetches') || 8) || 8));
        const result = await this._settleAndPersist({ maxCalls, maxFetches, force: true });
        return this._json({
            success: true,
            settlementVersion: CALL_SETTLEMENT_VERSION,
            changed: result.changed,
            settledIntervals: result.settledIntervals,
            fetches: result.fetches,
            total: result.calls.length
        }, 200);
    }

    async _handleFeedback() {
        const current = await this._loadCallsFromStorage();
        const normalized = current.map((call) => normalizeCallRecordForStorage(call)).filter(Boolean).slice(0, this.maxCalls);
        if (JSON.stringify(current || []) !== JSON.stringify(normalized)) {
            await this.state.storage.put(this.callsKey, normalized);
            await this._mirrorCallsSnapshot(normalized);
        }
        return this._json({
            success: true,
            feedback: buildCallFeedbackStats(normalized)
        }, 200);
    }

    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === '/calls/reset' && request.method === 'POST') {
            try {
                return await this._handleReset(request);
            } catch (e) {
                console.error('CallHistoryDO RESET error:', e);
                return this._json({ success: false, error: 'Failed to reset calls' }, 500);
            }
        }

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

        if (url.pathname === '/calls/settle' && request.method === 'POST') {
            try {
                return await this._handleSettle(url);
            } catch (e) {
                console.error('CallHistoryDO SETTLE error:', e);
                return this._json({ success: false, error: 'Failed to settle calls' }, 500);
            }
        }

        if (url.pathname === '/calls/feedback' && request.method === 'GET') {
            try {
                return await this._handleFeedback();
            } catch (e) {
                console.error('CallHistoryDO FEEDBACK error:', e);
                return this._json({ success: false, error: 'Failed to build feedback' }, 500);
            }
        }

        // Internal only (reachable through the binding, never proxied from the
        // public router): rebuilds the D1 feedback cache off the Worker's 10 ms budget.
        if (url.pathname === '/internal/feedback-refresh' && request.method === 'POST') {
            try {
                const body = await request.json().catch(() => ({}));
                const feedback = await refreshCallFeedbackCache(this.env, Number(body?.revision || 0) || 0);
                return this._json({ success: !!feedback, feedback }, feedback ? 200 : 404);
            } catch (e) {
                console.error('CallHistoryDO FEEDBACK REFRESH error:', e);
                return this._json({ success: false, error: 'Failed to refresh feedback' }, 500);
            }
        }

        if (url.pathname === '/internal/calls-page' && request.method === 'POST') {
            try {
                const body = await request.json().catch(() => ({}));
                const page = await d1GetCallsPageCached(this.env, { limit: body?.limit, direction: body?.direction, inline: true });
                if (!page) return this._json({ success: false, error: 'Calls page unavailable' }, 404);
                return new Response(page.body, {
                    status: 200,
                    headers: { 'Content-Type': 'application/json', 'X-Visor-Has-Calls': page.hasCalls ? '1' : '0' }
                });
            } catch (e) {
                console.error('CallHistoryDO CALLS PAGE error:', e);
                return this._json({ success: false, error: 'Failed to build calls page' }, 500);
            }
        }

        return this._json({ success: false, error: 'Not found' }, 404);
    }
}

// Runs the cron work: the 5-minute signal cycle and the other scheduled jobs.
// A Free plan cron invocation gets 10 ms of CPU; a Durable Object request gets
// 30 s, so the cron only forwards here. It keeps no storage: the snapshot,
// status and calls live in D1/KV.
class SignalCycleDO {
    constructor(state, env) {
        this.state = state;
        this.env = env;
        this.running = null;
    }

    _json(data, status = 200) {
        return new Response(JSON.stringify(data), {
            status,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    async fetch(request) {
        const url = new URL(request.url);
        const action = url.pathname.replace(/^\/+/, '');
        const cronExpression = url.searchParams.get('cron') || '';
        const knownCron = [LEGACY_PUSH_CRON_EXPRESSION, MARKET_CRON_EXPRESSION, LIQUIDATIONS_CRON_EXPRESSION, CALENDAR_CRON_EXPRESSION].includes(cronExpression);
        if (request.method !== 'POST' || !(action === 'cycle' || action === 'snapshot' || (action === 'cron' && knownCron))) {
            return this._json({ success: false, error: 'Not found' }, 404);
        }
        // A slow cycle (provider timeouts) must not overlap the next one.
        if (this.running) return this._json({ success: true, skipped: 'already_running' }, 202);

        this.running = (async () => {
            if (action === 'cron') {
                await runScheduledCron(this.env, cronExpression);
                return { success: true, cron: cronExpression };
            }
            if (action === 'snapshot') {
                const snapshot = await buildSignalsSnapshot(this.env, true, { inlineFeedback: true });
                return { success: true, snapshotUpdatedAt: Number(snapshot?.updatedAt || 0) || 0, stale: snapshot?.stale === true };
            }
            const status = await runSignalCycle(this.env, { inlineFeedback: true, runner: 'signal_cycle_do' });
            await prewarmCallDerivedCaches(this.env).catch((e) => {
                console.warn('Call cache prewarm failed:', e?.message || e);
            });
            return status;
        })();
        try {
            // The cycle already recorded its outcome in the runtime status row.
            return this._json(await this.running || { success: false });
        } catch (e) {
            console.error(`SignalCycleDO ${action} error:`, e);
            return this._json({ success: false, error: 'Signal cycle failed' }, 500);
        } finally {
            this.running = null;
        }
    }
}

export { CallHistoryDO, LiquidationsDO, NotificationRegistryDO, SignalCycleDO };

function buildPublicPrivacyPolicyHtml() {
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="index,follow">
<title>Visor Crypto - Privacy Policy</title>
<style>body{max-width:760px;margin:0 auto;padding:24px;font:15px/1.65 system-ui,sans-serif;background:#0d1117;color:#c9d1d9}h1,h2{color:#58a6ff}a{color:#79c0ff}small{color:#8b949e}</style>
</head>
<body>
<h1>Visor Crypto Privacy Policy</h1>
<small>Last updated: September 16, 2026</small>
<p>Visor Crypto is an informational market-analysis application. It does not require an account and does not request exchange credentials, passwords, precise location, contacts, camera, microphone, or device files.</p>
<h2>Local and technical data</h2>
<p>The app stores settings, market cache, analysis history, and notification preferences locally. When signal monitoring is enabled, Firebase Cloud Messaging processes a technical push token and topic subscriptions. A pseudonymous installation identifier and minimal notification preferences may be processed by our backend to authenticate requests, deliver alerts, synchronize calls, prevent duplicates, and limit abuse.</p>
<h2>Advertising</h2>
<p>The app may display limited advertising through Appodeal and enabled demand partners. Depending on your region and privacy choices, these providers may process the Android advertising identifier, ad interactions, IP address, approximate location inferred from IP, and technical device information. Where required, Appodeal's consent manager is shown before personalized advertising is requested, and an in-app privacy entry point is provided when required. See the <a href="https://appodeal.com/privacy-policy" rel="noopener noreferrer">Appodeal Privacy Policy</a>.</p>
<h2>Market services</h2>
<p>The app and its Cloudflare backend obtain market data from providers such as Binance, CoinGecko, Yahoo Finance, FRED, and Mempool.space. Shared backend caching is used for scalability. These services do not receive exchange credentials from the app.</p>
<h2>Retention and choices</h2>
<p>Local data can be removed by clearing the app data or uninstalling it. Notification monitoring can be disabled in the app or Android settings. Regional advertising choices can be reviewed through the in-app advertising privacy option when available. Pseudonymous notification records are retained only as operationally necessary, generally no longer than 90 days after the last synchronization.</p>
<h2>Children and financial disclaimer</h2>
<p>The app is not intended for anyone under 18. All signals and market information are educational and do not constitute investment or financial advice.</p>
<h2>Contact</h2>
<p>Privacy questions or deletion requests: <a href="mailto:visorcrypto@gmail.com">visorcrypto@gmail.com</a>.</p>
</body>
</html>`;
}

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

        if (path === '/privacy-policy' && request.method === 'GET') {
            return new Response(buildPublicPrivacyPolicyHtml(), {
                status: 200,
                headers: {
                    'Content-Type': 'text/html; charset=utf-8',
                    'Cache-Control': 'public, max-age=3600, s-maxage=86400',
                    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
                    'Referrer-Policy': 'no-referrer',
                    'X-Content-Type-Options': 'nosniff',
                    'X-Frame-Options': 'DENY'
                }
            });
        }

        // GET /signals/snapshot — latest shared signal snapshot for instant dashboard hydration
        if (path === '/market/macro-quotes' && request.method === 'GET') {
            return serveCachedMarketPayload(env, ctx, corsHeaders, {
                request,
                key: MARKET_MACRO_QUOTES_KEY,
                freshSeconds: MARKET_FRESH_SECONDS,
                staleSeconds: MARKET_STALE_SECONDS,
                builder: buildMacroQuotesPayload,
                error: 'Macro quotes unavailable',
                source: 'yahoo_chart_v8_worker',
                headers: { 'Cache-Control': 'public, max-age=45, stale-while-revalidate=300' },
            });
        }

        if (path === '/market/yahoo-quotes' && request.method === 'GET') {
            const symbols = getYahooQuoteSymbols(url.searchParams.get('symbols'));
            return serveCachedMarketPayload(env, ctx, corsHeaders, {
                request,
                key: getYahooQuotesCacheKey(symbols),
                freshSeconds: YAHOO_QUOTES_FRESH_SECONDS,
                staleSeconds: YAHOO_QUOTES_STALE_SECONDS,
                builder: () => buildYahooQuotesPayload(symbols),
                error: 'Yahoo quotes unavailable',
                source: 'yahoo_chart_v8_worker',
                headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=900' },
            });
        }

        if (path === '/market/yahoo-chart' && request.method === 'GET') {
            const symbol = normalizeYahooQuoteSymbol(url.searchParams.get('symbol'));
            const period = normalizeYahooChartPeriod(url.searchParams.get('period'));
            if (!symbol) {
                return new Response(JSON.stringify({ success: false, error: 'Invalid symbol' }), {
                    status: 400,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
                });
            }
            if (!period) {
                return new Response(JSON.stringify({ success: false, error: 'Invalid period' }), {
                    status: 400,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
                });
            }

            return serveCachedMarketPayload(env, ctx, corsHeaders, {
                request,
                key: getYahooChartCacheKey(symbol, period),
                freshSeconds: MARKET_FRESH_SECONDS,
                staleSeconds: MARKET_STALE_SECONDS,
                builder: () => buildYahooChartPayload(symbol, period),
                error: 'Yahoo chart unavailable',
                source: 'yahoo_chart_v8_worker',
                headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=900' },
            });
        }

        if (path === '/market/fed-rate' && request.method === 'GET') {
            return serveCachedMarketPayload(env, ctx, corsHeaders, {
                request,
                key: MARKET_FED_RATE_KEY,
                freshSeconds: FED_RATE_FRESH_SECONDS,
                staleSeconds: FED_RATE_STALE_SECONDS,
                builder: () => buildFedRateMarketPayload({ fredApiKey: FRED_API_KEY }),
                error: 'Fed rate unavailable',
                errorPayload: { currentRate: null, effectiveRate: null, targetLower: null, targetUpper: null },
                source: 'fred_worker',
                headers: { 'Cache-Control': 'public, max-age=900, s-maxage=21600, stale-while-revalidate=2592000' },
            });
        }

        if (path === '/market/fedwatch' && request.method === 'GET') {
            const meetingDate = getFedWatchMeetingDateParam(url.searchParams.get('meetingDate'));
            return serveCachedMarketPayload(env, ctx, corsHeaders, {
                request,
                key: MARKET_FEDWATCH_KEY_PREFIX + meetingDate,
                freshSeconds: FEDWATCH_FRESH_SECONDS,
                staleSeconds: FEDWATCH_STALE_SECONDS,
                builder: () => buildFedWatchPayload({ meetingDate, fredApiKey: FRED_API_KEY }),
                error: 'Fed Watch probabilities unavailable',
                errorPayload: { meetingDate, probabilities: null, eventTitle: null, marketsUsed: 0 },
                source: 'polymarket_gamma',
                headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400' },
            });
        }

        if (path === '/market/global-snapshot' && request.method === 'GET') {
            return serveCachedMarketPayload(env, ctx, corsHeaders, {
                request,
                key: MARKET_GLOBAL_SNAPSHOT_KEY,
                freshSeconds: MARKET_GLOBAL_SNAPSHOT_FRESH_SECONDS,
                staleSeconds: MARKET_GLOBAL_SNAPSHOT_STALE_SECONDS,
                builder: () => buildMarketGlobalSnapshotPayload(env),
                error: 'Global market snapshot unavailable',
                source: 'worker_market_snapshot',
                headers: { 'Cache-Control': 'public, max-age=120, stale-while-revalidate=604800' },
            });
        }

        if (path === '/market/global' && request.method === 'GET') {
            return serveCachedMarketPayload(env, ctx, corsHeaders, {
                request,
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
                request,
                key: MARKET_ALTSEASON_KEY,
                freshSeconds: MARKET_ALTSEASON_FRESH_SECONDS,
                staleSeconds: MARKET_ALTSEASON_STALE_SECONDS,
                builder: buildAltseasonPayload,
                error: 'Altseason data unavailable',
                source: 'blockchaincenter',
                headers: { 'Cache-Control': 'public, max-age=600, stale-while-revalidate=604800' },
            });
        }

        if (path === '/market/fear-greed' && request.method === 'GET') {
            return serveCachedMarketPayload(env, ctx, corsHeaders, {
                request,
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
                request,
                key: MARKET_NEWS_KEY,
                freshSeconds: NEWS_FRESH_SECONDS,
                staleSeconds: NEWS_STALE_SECONDS,
                builder: buildNewsPayload,
                error: 'News unavailable',
                source: 'worker_rss',
                headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=600' },
            });
        }

        if (path === '/wallet/label' && request.method === 'GET') {
            const address = normalizeBitcoinAddress(url.searchParams.get('address'));
            if (!address) {
                return jsonResponse({ success: false, error: 'Invalid address' }, corsHeaders, 400);
            }
            return serveCachedMarketPayload(env, ctx, corsHeaders, {
                request,
                key: `${WALLET_LABEL_KEY_PREFIX}${address}`,
                freshSeconds: WALLET_LABEL_FRESH_SECONDS,
                staleSeconds: WALLET_LABEL_STALE_SECONDS,
                builder: () => buildWalletLabelPayload(address),
                error: 'Wallet label unavailable',
                errorPayload: { address, label: null, found: false },
                source: 'walletexplorer_worker',
                headers: { 'Cache-Control': 'public, max-age=86400, stale-while-revalidate=2592000' },
            });
        }

        if (path === '/signals/status' && request.method === 'GET') {
            try {
                const status = await d1ReadRuntimeStatus(env, SIGNAL_RUNTIME_STATUS_KEY);
                const now = Date.now();
                const updatedAt = Number(status?.updatedAt || 0) || 0;
                return new Response(JSON.stringify({
                    success: true,
                    healthy: !!status?.success && status?.snapshotStale !== true && updatedAt > 0 && (now - updatedAt) <= 15 * 60 * 1000,
                    protocol: SIGNAL_TOPIC_PROTOCOL_VERSION,
                    strategyVersion: SIGNAL_STRATEGY_VERSION,
                    ageMs: updatedAt > 0 ? Math.max(0, now - updatedAt) : null,
                    lastCronAt: updatedAt || null,
                    lastSnapshotAt: Number(status?.snapshotUpdatedAt || 0) || null,
                    lastPushAt: Number(status?.lastPushAt || status?.push?.lastPushAt || 0) || null,
                    lastError: String(status?.error || status?.lastError || '') || null,
                    status: status || null
                }), {
                    status: 200,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=30' }
                });
            } catch (e) {
                return new Response(JSON.stringify({
                    success: false,
                    healthy: false,
                    protocol: SIGNAL_TOPIC_PROTOCOL_VERSION,
                    strategyVersion: SIGNAL_STRATEGY_VERSION,
                    error: 'Signal status unavailable'
                }), {
                    status: 503,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
                });
            }
        }

        if (path === '/signals/snapshot' && request.method === 'GET') {
            try {
                const edgeCached = await getCachedJsonResponse(request, corsHeaders);
                if (edgeCached) return edgeCached;

                const cachedSnapshot = await loadCachedSignalsSnapshot(env);
                let snapshot = cachedSnapshot.snapshot;
                let snapshotCacheSource = cachedSnapshot.source;

                const ageMs = snapshot?.updatedAt ? Date.now() - Number(snapshot.updatedAt) : Infinity;
                const snapshotComplete = isSignalsSnapshotComplete(snapshot) && isSignalsSnapshotUsable(snapshot);
                const snapshotFresh = snapshotComplete && ageMs <= SIGNALS_SNAPSHOT_TTL_SECONDS * 1000;

                if (snapshotFresh) {
                    return cacheableJsonResponse(request, ctx, corsHeaders, { success: true, snapshot: normalizeSignalsSnapshotMeta(snapshot, false) }, 200, {
                        'Cache-Control': 'public, max-age=120, stale-while-revalidate=300',
                    }, snapshotCacheSource, 120);
                }

                if (snapshotComplete && snapshot) {
                    if (ctx?.waitUntil) {
                        // The cron owns refreshes. When it is late, let one request
                        // per minute (across all isolates) rebuild instead of each one.
                        ctx.waitUntil((async () => {
                            if (!(await tryAcquireRuntimeLock(env, SIGNALS_HTTP_REFRESH_LOCK_KEY, 60 * 1000))) return;
                            if (!(await delegateToSignalCycleDO(env, 'snapshot'))) await buildSignalsSnapshot(env, true);
                        })().catch((e) => {
                            console.error('Signals snapshot background refresh failed:', e);
                        }));
                    }
                    return cacheableJsonResponse(request, ctx, corsHeaders, { success: true, snapshot: normalizeSignalsSnapshotMeta(snapshot, true) }, 200, {
                        'Cache-Control': 'public, max-age=20, stale-while-revalidate=120',
                    }, 'stale', 20);
                }

                try {
                    snapshot = await buildSignalsSnapshot(env, true);
                    snapshotCacheSource = 'fresh';
                } catch (buildErr) {
                    if (snapshot) {
                        console.error('Signals snapshot fresh build failed, returning stale:', buildErr);
                        return cacheableJsonResponse(request, ctx, corsHeaders, { success: true, snapshot: normalizeSignalsSnapshotMeta(snapshot, true) }, 200, {
                            'Cache-Control': 'public, max-age=120, stale-while-revalidate=300',
                        }, 'stale', 120);
                    }
                    throw buildErr;
                }

                return cacheableJsonResponse(request, ctx, corsHeaders, { success: true, snapshot: normalizeSignalsSnapshotMeta(snapshot, snapshot?.stale === true) }, 200, {
                    'Cache-Control': 'public, max-age=120, stale-while-revalidate=300',
                }, snapshotCacheSource, 120);
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
                const rl = await checkPersistentRateLimit(env, `rl_notifications_register_${authCheck.identity.deviceId}`, 20, 60);
                if (!rl.allowed) {
                    return new Response(JSON.stringify({ success: false, error: 'Rate limit exceeded' }), {
                        status: 429,
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
                const stored = await saveNotificationDevice(env, {
                    deviceId,
                    userId: authCheck.identity.userId || '',
                    token,
                    platform: String(body?.platform || 'android').slice(0, 30),
                    appVersion: String(body?.appVersion || '').slice(0, 40),
                    updatedAt: now,
                    prefs: body?.prefs ? normalizeNotificationPrefs(body.prefs) : undefined
                });

                if (!stored) {
                    return new Response(JSON.stringify({ success: false, error: 'Notification storage unavailable' }), {
                        status: 503,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
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
                const rl = await checkPersistentRateLimit(env, `rl_notifications_prefs_${authCheck.identity.deviceId}`, 30, 60);
                if (!rl.allowed) {
                    return new Response(JSON.stringify({ success: false, error: 'Rate limit exceeded' }), {
                        status: 429,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }
                const prefs = normalizeNotificationPrefs(await request.json());
                const updatedAt = Date.now();
                const stored = await saveNotificationPrefs(env, authCheck.identity.deviceId, {
                    ...prefs,
                    updatedAt,
                }, authCheck.identity);

                if (!stored) {
                    return new Response(JSON.stringify({ success: false, error: 'Notification storage unavailable' }), {
                        status: 503,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }

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
                const rl = await checkPersistentRateLimit(env, `rl_notifications_unregister_${authCheck.identity.deviceId}`, 20, 60);
                if (!rl.allowed) {
                    return new Response(JSON.stringify({ success: false, error: 'Rate limit exceeded' }), {
                        status: 429,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }
                await removeNotificationDevice(env, authCheck.identity.deviceId);
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
                const rl = await checkPersistentRateLimit(env, `rl_auth_issue_${clientIp}`, 30, 60);
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
                const deviceSecret = normalizeDeviceSecret(body?.deviceSecret || request.headers.get('X-Device-Secret'));

                if (!deviceId) {
                    return new Response(JSON.stringify({ success: false, error: 'Invalid device identity' }), {
                        status: 400,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }

                let deviceProof = { ok: false, error: 'Missing device proof' };
                if (deviceSecret) {
                    deviceProof = await verifyOrRegisterDeviceSecret(env, deviceId, deviceSecret, userId);
                    if (!deviceProof.ok) {
                        return new Response(JSON.stringify({ success: false, error: deviceProof.error || 'Invalid device proof' }), {
                            status: 401,
                            headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
                        });
                    }
                }

                const scopes = deviceProof.ok
                    ? ['ai-summary:write', 'calls:write', 'notifications:write', 'signals:read']
                    : ['signals:read'];
                const nowSec = Math.floor(Date.now() / 1000);
                const origin = getRequestOrigin(request);
                const payload = {
                    sub: deviceId,
                    uid: userId || '',
                    ori: origin || '',
                    scopes,
                    dpf: deviceProof.ok === true,
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
                    deviceProof: deviceProof.ok === true,
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
                const edgeCached = await getCachedJsonResponse(request, corsHeaders);
                if (edgeCached) return edgeCached;

                // Tentar cache primeiro
                let cachedData = null;
                if (env.CALENDAR_KV) {
                    cachedData = await env.CALENDAR_KV.get(CACHE_KEY_CALENDAR, 'json');
                }

                if (cachedData) {
                    return cacheableJsonResponse(request, ctx, corsHeaders, {
                        success: true,
                        events: cachedData.events,
                        lastUpdate: cachedData.lastUpdate,
                        source: 'cache',
                        nextUpdate: cachedData.nextUpdate,
                    }, 200, { 'Cache-Control': 'public, max-age=1800, stale-while-revalidate=3600' }, 'kv', 1800);
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

                return cacheableJsonResponse(request, ctx, corsHeaders, {
                    success: true,
                    events,
                    lastUpdate: now.toISOString(),
                    source: 'fresh',
                    nextUpdate: cacheData.nextUpdate,
                }, 200, { 'Cache-Control': 'public, max-age=1800, stale-while-revalidate=3600' }, 'fresh', 1800);
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
            const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 500) : 12;
            const sortOrder = String(url.searchParams.get('sort') || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
            const rawUnits = String(url.searchParams.get('units') || '').trim();
            const units = /^[a-z0-9_]+$/i.test(rawUnits) ? rawUnits : '';

            try {
                const edgeCached = await getCachedJsonResponse(request, corsHeaders);
                if (edgeCached) return edgeCached;

                // Tentar cache
                const cacheKey = `history_${seriesId}_${sortOrder}_${limit}_${units || 'raw'}`;
                let cached = null;
                if (env.CALENDAR_KV) {
                    cached = await env.CALENDAR_KV.get(cacheKey, 'json');
                }

                if (cached) {
                    return cacheableJsonResponse(request, ctx, corsHeaders, {
                        success: true,
                        seriesId,
                        data: cached,
                        sort: sortOrder,
                        limit,
                        units: units || null,
                        source: 'cache',
                    }, 200, { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' }, 'kv', 3600);
                }

                const data = await fetchHistoryFromFRED(seriesId, { limit, sortOrder, units }, FRED_API_KEY);

                if (env.CALENDAR_KV) {
                    await env.CALENDAR_KV.put(
                        cacheKey,
                        JSON.stringify(data),
                        { expirationTtl: 24 * 60 * 60 } // 24h para histórico
                    );
                }

                return cacheableJsonResponse(request, ctx, corsHeaders, {
                    success: true,
                    seriesId,
                    data,
                    sort: sortOrder,
                    limit,
                    units: units || null,
                    source: 'fresh',
                }, 200, { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' }, 'fresh', 3600);
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

            const edgeCached = await getCachedJsonResponse(request, corsHeaders);
            if (edgeCached) return edgeCached;

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
            if (false && env.CALENDAR_KV) {
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

            if (ctx?.waitUntil) {
                ctx.waitUntil(trackLiquidationSymbol(env, symbol).catch(() => false));
            } else {
                trackLiquidationSymbol(env, symbol).catch(() => false);
            }

            try {
                const shortCacheKey = `liq_short_${symbol}`;
                const cacheKey = `liq_12h_${symbol}`;
                let shortCached = null;
                let cached = null;

                if (false && env.CALENDAR_KV) {
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
                const existingOrders = await getAccumulatedLiquidationOrders(env, symbol);

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
                if (false && env.CALENDAR_KV) {
                    await env.CALENDAR_KV.put(accumKey, JSON.stringify({
                        orders: allOrders12h.slice(0, 5000), // limitar tamanho
                        ts: now
                    }), { expirationTtl: 43200 }); // 12h TTL
                }
                if (ctx?.waitUntil) {
                    ctx.waitUntil(saveAccumulatedLiquidationOrders(env, symbol, allOrders12h, now).catch(() => false));
                } else {
                    saveAccumulatedLiquidationOrders(env, symbol, allOrders12h, now).catch(() => false);
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

                if (false && env.CALENDAR_KV) {
                    await Promise.all([
                        env.CALENDAR_KV.put(cacheKey, JSON.stringify(result), { expirationTtl: LIQUIDATIONS_CACHE_SECONDS }),
                        env.CALENDAR_KV.put(shortCacheKey, JSON.stringify(result), { expirationTtl: LIQUIDATIONS_SHORT_CACHE_SECONDS })
                    ]);
                }

                return cacheableJsonResponse(request, ctx, corsHeaders, { success: true, ...result, source: 'fresh' }, 200, {
                    'Cache-Control': `public, max-age=${LIQUIDATIONS_SHORT_CACHE_SECONDS}, stale-while-revalidate=20`,
                    'X-RateLimit-Limit': String(LIQUIDATIONS_RATE_LIMIT),
                    'X-RateLimit-Remaining': String(liqRate.remaining)
                }, 'fresh', LIQUIDATIONS_SHORT_CACHE_SECONDS);
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
                    rl = await checkPersistentRateLimit(env, `rl_ai_summary_${authCheck.identity.deviceId}_${clientIp}`, 20, 60);
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
                if (body && (Object.prototype.hasOwnProperty.call(body, 'model') ||
                    Object.prototype.hasOwnProperty.call(body, 'systemPrompt') ||
                    Object.prototype.hasOwnProperty.call(body, 'userPrompt'))) {
                    return new Response(JSON.stringify({ success: false, error: 'Raw prompts are not accepted' }), {
                        status: 400,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }

                const analysisPayload = (body?.analysisPayload && typeof body.analysisPayload === 'object')
                    ? body.analysisPayload
                    : (body?.dataPayload && typeof body.dataPayload === 'object' ? body.dataPayload : null);
                if (!analysisPayload) {
                    return new Response(JSON.stringify({ success: false, error: 'Missing analysis payload' }), {
                        status: 400,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }

                const payloadText = JSON.stringify(analysisPayload);
                if (!payloadText || payloadText.length > 24000) {
                    return new Response(JSON.stringify({ success: false, error: 'Prompt too large' }), {
                        status: 413,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }

                const model = 'llama-3.3-70b-versatile';
                const symbol = String(analysisPayload.symbol || analysisPayload.crypto || 'crypto').slice(0, 24);
                const confidence = clampPercent(analysisPayload.confidence ?? analysisPayload.finalConfidence, 0);
                const direction = normalizeSignalDirection(analysisPayload.direction || analysisPayload.signal || analysisPayload.finalDirection);
                const requestedLocale = String(body?.locale || 'pt-BR').trim().replace(/[^A-Za-z0-9-]/g, '').slice(0, 16) || 'pt-BR';
                const responseLocale = requestedLocale.replace(/^iw-/, 'he-');
                const systemPrompt = `You are a professional crypto technical analyst. Use only the structured data supplied by Visor Crypto. The final confidence has already been calculated by the internal engine and must remain exactly ${confidence}%. Never invent data or promise results. Respond in locale ${responseLocale}, using a concise professional conclusion. Preserve LONG, SHORT, RSI, MACD, FOMC and market tickers exactly.`;
                const userPrompt = `Structured technical-analysis data for ${symbol}. Final direction: ${direction}. Final confidence: ${confidence}%.\n${payloadText}`;

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

        // POST /calls/reset — Admin-only hard reset for shared call history.
        if (path === '/calls/reset' && request.method === 'POST') {
            try {
                const adminToken = getSecret(env, 'CALLS_ADMIN_TOKEN');
                if (!adminToken) {
                    return new Response(JSON.stringify({ success: false, error: 'Calls admin token not configured' }), {
                        status: 503,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }
                const providedToken = String(request.headers.get('X-Admin-Token') || '').trim();
                if (!providedToken || !(await constantTimeSecretEqual(providedToken, adminToken))) {
                    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
                        status: 401,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }

                const resetAt = new Date().toISOString();
                let d1 = null;
                if (hasVisorD1(env)) {
                    try {
                        await d1ResetCalls(env);
                        d1 = { success: true, storageVersion: 'd1_v1' };
                    } catch (d1Err) {
                        d1 = { success: false, error: d1Err?.message || String(d1Err) };
                    }
                }
                if (env.CALENDAR_KV) {
                    await Promise.allSettled([
                        env.CALENDAR_KV.delete(SHARED_CALL_HISTORY_KEY),
                        env.CALENDAR_KV.delete('shared_call_history_v5'),
                        env.CALENDAR_KV.delete('shared_call_history_v3'),
                        env.CALENDAR_KV.delete('shared_call_history_v4')
                    ]);
                }

                let durableObject = null;
                if (env.CALL_HISTORY_DO) {
                    const doId = env.CALL_HISTORY_DO.idFromName('global');
                    const doStub = env.CALL_HISTORY_DO.get(doId);
                    const doResp = await doStub.fetch('https://call-history.internal/calls/reset', {
                        method: 'POST',
                        headers: { 'X-Admin-Token': adminToken }
                    });
                    try { durableObject = await doResp.json(); } catch (_) { durableObject = { success: doResp.ok, status: doResp.status }; }
                    if (!doResp.ok) {
                        return new Response(JSON.stringify({ success: false, resetAt, durableObject }), {
                            status: doResp.status,
                            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                        });
                    }
                }

                return new Response(JSON.stringify({ success: true, resetAt, d1, durableObject }), {
                    status: 200,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            } catch (e) {
                console.error('Calls RESET error:', e);
                return new Response(JSON.stringify({ success: false, error: 'Failed to reset calls' }), {
                    status: 500,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            }
        }

        // POST /calls — Record a new call signal
        if (path === '/admin/migrate-calls-to-d1' && request.method === 'POST') {
            try {
                const adminToken = getSecret(env, 'CALLS_ADMIN_TOKEN');
                if (!adminToken) {
                    return new Response(JSON.stringify({ success: false, error: 'Calls admin token not configured' }), {
                        status: 503,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }
                const providedToken = String(request.headers.get('X-Admin-Token') || '').trim();
                if (!providedToken || !(await constantTimeSecretEqual(providedToken, adminToken))) {
                    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
                        status: 401,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }
                if (!hasVisorD1(env)) {
                    return new Response(JSON.stringify({ success: false, error: 'D1 binding unavailable' }), {
                        status: 503,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }

                const sources = [];
                let legacyCalls = [];
                if (env.CALL_HISTORY_DO) {
                    try {
                        const doId = env.CALL_HISTORY_DO.idFromName('global');
                        const doStub = env.CALL_HISTORY_DO.get(doId);
                        const doResp = await doStub.fetch('https://call-history.internal/calls?limit=500', { method: 'GET' });
                        const doData = await doResp.json().catch(() => null);
                        if (Array.isArray(doData?.calls)) {
                            legacyCalls = legacyCalls.concat(doData.calls);
                            sources.push({ source: 'do', count: doData.calls.length });
                        }
                    } catch (doErr) {
                        sources.push({ source: 'do', error: doErr?.message || String(doErr) });
                    }
                }
                if (env.CALENDAR_KV) {
                    for (const key of [SHARED_CALL_HISTORY_KEY, ...SHARED_CALL_HISTORY_LEGACY_KEYS]) {
                        try {
                            const kvCalls = filterAllowedCalls(await env.CALENDAR_KV.get(key, 'json'));
                            if (kvCalls.length > 0) {
                                legacyCalls = legacyCalls.concat(kvCalls);
                                sources.push({ source: `kv:${key}`, count: kvCalls.length });
                            }
                        } catch (kvErr) {
                            sources.push({ source: `kv:${key}`, error: kvErr?.message || String(kvErr) });
                        }
                    }
                }

                const deduped = dedupeAndSortCallHistory(legacyCalls).slice(0, 500);
                const before = await d1CallCount(env);
                const persisted = await d1PersistCalls(env, deduped, { now: Date.now() });
                const after = await d1CallCount(env);

                return new Response(JSON.stringify({
                    success: true,
                    storageVersion: 'd1_v1',
                    before,
                    after,
                    scanned: legacyCalls.length,
                    deduped: deduped.length,
                    written: persisted.written,
                    sources
                }), {
                    status: 200,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            } catch (e) {
                console.error('D1 migration error:', e);
                return new Response(JSON.stringify({ success: false, error: 'Failed to migrate calls to D1' }), {
                    status: 500,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            }
        }

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

                const rlDevice = await checkPersistentRateLimit(
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

                const rlIp = await checkPersistentRateLimit(
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
                    reason,
                    source,
                    strategyVersion,
                    features
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

                if (safeConfidence < SIGNAL_MIN_CONFIDENCE) {
                    return new Response(JSON.stringify({ success: false, error: 'Confidence below strategy minimum' }), {
                        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }

                const now = Date.now();
                const safeTime = normalizeCallTime(body?.time || body?.timestamp || body?.notifiedAt || now, now);
                const entryPrice = Number(body?.entryPrice ?? price ?? 0) || 0;
                const callPayload = normalizeCallRecordForStorage({
                    id: buildUniqueCallId(safeSymbol, safeDirection, safeTime, body?.id),
                    callKey: buildCanonicalCallKey(safeSymbol, safeDirection, safeTime),
                    symbol: safeSymbol,
                    name: String(name || '').slice(0, 50),
                    short: String(shortName || safeSymbol.replace('USDT', '')).slice(0, 10),
                    img: String(img || '').slice(0, 200),
                    direction: safeDirection,
                    confidence: Math.round(safeConfidence),
                    gates: String(gates || '').slice(0, 20),
                    price: entryPrice > 0 ? String(entryPrice).slice(0, 20) : String(price || '').slice(0, 20),
                    entryPrice: entryPrice > 0 ? entryPrice : null,
                    reason: String(reason || '').slice(0, 180),
                    source: String(source || reason || '').slice(0, 180),
                    strategyVersion: String(strategyVersion || SIGNAL_STRATEGY_VERSION).slice(0, 20),
                    time: safeTime,
                    timestamp: safeTime,
                    prices: normalizeIntervalMap(null, null),
                    pnl: normalizeIntervalMap(null, null),
                    checked: normalizeIntervalMap(null, false),
                    features: sanitizeCallFeatures(features),
                    deviceId: authCheck.identity.deviceId,
                    userId: authCheck.identity.userId || ''
                }, now);

                const officialMatch = await verifyCallMatchesAuthoritativeSnapshot(env, callPayload, now);
                if (!officialMatch.ok) {
                    return new Response(JSON.stringify({ success: false, error: officialMatch.error }), {
                        status: officialMatch.status || 409,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }

                const officialSignal = officialMatch.signal || {};
                const officialTime = normalizeCallTime(officialMatch.officialTime || safeTime, now);
                const officialPrice = Number(officialSignal.entryPrice ?? officialSignal.price);
                callPayload.id = buildUniqueCallId(safeSymbol, safeDirection, officialTime, body?.id);
                callPayload.callKey = buildCanonicalCallKey(safeSymbol, safeDirection, officialTime);
                callPayload.time = officialTime;
                callPayload.timestamp = officialTime;
                callPayload.entryTime = officialTime;
                callPayload.priceTime = Number(officialSignal.priceTime || officialTime) || officialTime;
                callPayload.market = 'BINANCE_USDM';
                callPayload.entrySource = 'binance_usdm_ticker';
                callPayload.confidence = Math.round(Number(officialSignal.finalConfidence ?? officialSignal.confidence ?? callPayload.confidence));
                callPayload.gates = String(officialSignal.gates || callPayload.gates || '').slice(0, 20);
                if (Number.isFinite(officialPrice) && officialPrice > 0) {
                    callPayload.price = String(officialPrice).slice(0, 20);
                    callPayload.entryPrice = officialPrice;
                }
                callPayload.reason = `${SIGNAL_STRATEGY_VERSION} | ${String(officialSignal.reason || callPayload.reason || 'Worker snapshot')}`.slice(0, 180);
                callPayload.source = `${SIGNAL_STRATEGY_VERSION} | WORKER_SNAPSHOT`;
                callPayload.strategyVersion = SIGNAL_STRATEGY_VERSION;
                callPayload.features = sanitizeCallFeatures(officialSignal.features || callPayload.features);
                const effectiveCallTime = Number(callPayload.time || safeTime) || safeTime;

                if (hasVisorD1(env)) {
                    try {
                        const d1Result = await d1RecordCall(env, callPayload, authCheck.identity);
                        if (d1Result?.success) {
                            return new Response(JSON.stringify({
                                ...d1Result,
                                source: 'd1',
                                storageVersion: 'd1_v1'
                            }), {
                                status: 200,
                                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                            });
                        }
                    } catch (d1Err) {
                        console.warn('Calls POST D1 failed, falling back to DO:', d1Err?.message || d1Err);
                    }
                }

                if (!env.CALL_HISTORY_DO) {
                    return new Response(JSON.stringify({ success: false, error: 'Call storage unavailable' }), {
                        status: 503,
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
                    return new Response(JSON.stringify({ success: false, error: 'Call storage unavailable' }), {
                        status: 503,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }

                const doText = await doResp.text();
                const doData = safeJsonParse(doText, null);
                return new Response(JSON.stringify(doData ? publicCallsPayload(doData) : { success: false, error: 'Invalid calls response' }), {
                    status: doData ? doResp.status : 502,
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
        if (path === '/calls/settle' && request.method === 'POST') {
            try {
                const adminToken = getSecret(env, 'CALLS_ADMIN_TOKEN');
                const providedToken = String(request.headers.get('X-Admin-Token') || '').trim();
                if (!adminToken || !providedToken || !(await constantTimeSecretEqual(providedToken, adminToken))) {
                    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
                        status: 401,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }

                if (hasVisorD1(env)) {
                    const result = await d1SettleCalls(env, {
                        maxCalls: Number(url.searchParams.get('maxCalls') || 80) || 80,
                        maxFetches: Number(url.searchParams.get('maxFetches') || 180) || 180
                    });
                    return new Response(JSON.stringify(result), {
                        status: 200,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
                    });
                }

                if (env.CALL_HISTORY_DO) {
                    const doId = env.CALL_HISTORY_DO.idFromName('global');
                    const doStub = env.CALL_HISTORY_DO.get(doId);
                    const doResp = await doStub.fetch(`https://call-history.internal/calls/settle${url.search}`, {
                        method: 'POST'
                    });
                    const doText = await doResp.text();
                    return new Response(doText, {
                        status: doResp.status,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
                    });
                }

                return new Response(JSON.stringify({ success: false, error: 'Call storage unavailable' }), {
                    status: 503,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            } catch (e) {
                console.error('Calls SETTLE error:', e);
                return new Response(JSON.stringify({ success: false, error: 'Failed to settle calls' }), {
                    status: 500,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            }
        }

        if (path === '/calls/feedback' && request.method === 'GET') {
            try {
                if (hasVisorD1(env)) {
                    const d1Feedback = await getD1CallFeedbackStats(env);
                    if (d1Feedback || !env.CALL_HISTORY_DO) {
                        return new Response(JSON.stringify({
                            success: true,
                            feedback: d1Feedback || buildCallFeedbackStats([]),
                            source: 'd1',
                            storageVersion: 'd1_v1'
                        }), {
                            status: 200,
                            headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
                        });
                    }
                }

                if (env.CALL_HISTORY_DO) {
                    const doId = env.CALL_HISTORY_DO.idFromName('global');
                    const doStub = env.CALL_HISTORY_DO.get(doId);
                    const doResp = await doStub.fetch('https://call-history.internal/calls/feedback', { method: 'GET' });
                    const doText = await doResp.text();
                    return new Response(doText, {
                        status: doResp.status,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
                    });
                }

                return new Response(JSON.stringify({ success: true, feedback: buildCallFeedbackStats([]), source: 'empty' }), {
                    status: 200,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
                });
            } catch (e) {
                console.error('Calls FEEDBACK error:', e);
                return new Response(JSON.stringify({ success: false, error: 'Failed to build feedback' }), {
                    status: 500,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            }
        }

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

                if (hasVisorD1(env)) {
                    try {
                        const d1Page = await d1GetCallsPageCached(env, {
                            limit,
                            direction: filterDir
                        });
                        if (d1Page && (d1Page.hasCalls || !env.CALL_HISTORY_DO)) {
                            return new Response(d1Page.body, {
                                status: 200,
                                headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Visor-Cache': d1Page.cache },
                            });
                        }
                    } catch (d1Err) {
                        console.warn('Calls GET D1 failed, falling back to legacy storage:', d1Err?.message || d1Err);
                    }
                }

                const allowKvRead = !env.CALL_HISTORY_DO && env.CALENDAR_KV;
                if (allowKvRead) {
                    try {
                        let cachedCalls = dedupeAndSortCallHistory(
                            filterAllowedCalls(await env.CALENDAR_KV.get(SHARED_CALL_HISTORY_KEY, 'json')),
                            Date.now()
                        );
                        if (Array.isArray(cachedCalls) && isCallSnapshotSafeForRead(cachedCalls)) {
                            if (filterDir === 'LONG' || filterDir === 'SHORT') {
                                cachedCalls = cachedCalls.filter((c) => c.direction === filterDir);
                            }
                            cachedCalls = cachedCalls.slice(0, limit).map(publicCallRecord).filter(Boolean);
                            return cacheableJsonResponse(request, ctx, corsHeaders, { success: true, calls: cachedCalls, total: cachedCalls.length, source: 'kv' }, 200, {
                                'Cache-Control': 'public, max-age=30'
                            }, 'kv', 30);
                        }
                    } catch (kvErr) {
                        console.warn('Calls GET KV read failed:', kvErr && kvErr.message ? kvErr.message : kvErr);
                    }
                }

                if (!env.CALL_HISTORY_DO) {
                    return cacheableJsonResponse(request, ctx, corsHeaders, { success: true, calls: [], total: 0, source: 'no-do' }, 200, {
                        'Cache-Control': 'public, max-age=30'
                    }, 'fresh', 30);
                }

                const doId = env.CALL_HISTORY_DO.idFromName('global');
                const doStub = env.CALL_HISTORY_DO.get(doId);
                const doResp = await doStub.fetch(`https://call-history.internal/calls${url.search}`, {
                    method: 'GET'
                });
                const doData = await doResp.json().catch(() => null);
                if (doData && typeof doData === 'object') {
                    return new Response(JSON.stringify(publicCallsPayload({
                        ...doData,
                        source: doData.source || 'do'
                    })), {
                        status: doResp.status,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
                    });
                }

                return jsonResponse({ success: false, error: 'Invalid calls response' }, corsHeaders, 502, {
                    'X-Visor-Cache': 'do'
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
                version: WORKER_BUILD_VERSION,
                signalStrategyVersion: SIGNAL_STRATEGY_VERSION,
                signalDirectionPolicyVersion: SIGNAL_DIRECTION_POLICY_VERSION,
                signalPushProtocolVersion: SIGNAL_TOPIC_PROTOCOL_VERSION,
                fcmConfigured: !!(
                    getSecret(env, 'FCM_PROJECT_ID') &&
                    getSecret(env, 'FCM_CLIENT_EMAIL') &&
                    getSecret(env, 'FCM_PRIVATE_KEY')
                ),
                callHistoryStorageVersion: CALL_HISTORY_STORAGE_VERSION,
                storageVersion: hasVisorD1(env) ? 'd1_v1' : CALL_HISTORY_STORAGE_VERSION,
                callHistoryBackend: hasVisorD1(env) ? 'd1' : (env.CALL_HISTORY_DO ? 'durable_object' : 'kv_fallback'),
                callSettlementVersion: CALL_SETTLEMENT_VERSION,
                domain: url.hostname,
                canonicalDomain: 'visorcrypto.loan',
                workersDevFallback: 'visor-crypto-calendar.visorcrypto.workers.dev',
                timestamp: new Date().toISOString(),
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // Proxies genéricos legados permanecem encerrados. Os endpoints
        // dedicados validam entradas e nunca expõem chaves dos provedores.
        if (path.startsWith('/proxy/fmp/')) {
            return new Response(JSON.stringify({ success: false, error: 'Legacy proxy disabled' }), {
                status: 410,
                headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
            });
        }

        if (path.startsWith('/proxy/fred/')) {
            return new Response(JSON.stringify({ success: false, error: 'Legacy proxy disabled' }), {
                status: 410,
                headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
            });
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
        const cronExpression = String(event?.cron || SIGNAL_CRON_EXPRESSION);
        const runSignals = cronExpression === SIGNAL_CRON_EXPRESSION;
        console.log('Cron triggered:', cronExpression, new Date().toISOString());

        // SINAIS: the full cycle needs far more than the 10 ms of CPU a Free plan
        // cron gets, so it runs in SignalCycleDO (30 s per request).
        if (runSignals) {
            if (!(await delegateToSignalCycleDO(env, 'cycle'))) {
                await runSignalCycle(env, { runner: 'cron_inline' });
            }
            return;
        }

        // The other crons also outgrow 10 ms of CPU (feeds, settlement, device
        // lists), so they run in SignalCycleDO as well.
        if (!(await delegateToSignalCycleDO(env, 'cron', cronExpression))) {
            await runScheduledCron(env, cronExpression);
        }
    },
};


