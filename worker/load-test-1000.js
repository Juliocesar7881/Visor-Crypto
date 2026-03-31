const { performance } = require('perf_hooks');

try {
    const { setGlobalDispatcher, Agent } = require('undici');
    setGlobalDispatcher(new Agent({ connections: 2048, pipelining: 1 }));
} catch (_) {
    // Node runtime without undici package: continue with default dispatcher.
}

const BASE_URL = (process.env.BASE_URL || 'http://127.0.0.1:8787').replace(/\/+$/, '');
const TEST_ORIGIN = process.env.TEST_ORIGIN || 'https://visorcrypto.loan';
const SEND_ORIGIN = String(process.env.SEND_ORIGIN || '1') === '1';
const SPOOF_CONNECTING_IP = String(process.env.SPOOF_CONNECTING_IP || '0') === '1';
const USERS = Number(process.env.USERS || 1000);
const AUTH_USERS = Math.max(0, Number(process.env.AUTH_USERS || USERS));
const POST_REQUESTS = Math.max(0, Number(process.env.POST_REQUESTS || USERS));
const RUN_CALENDAR = String(process.env.RUN_CALENDAR || '0') === '1';
const RUN_HEALTH = String(process.env.RUN_HEALTH || '1') === '1';
const RUN_AUTH = String(process.env.RUN_AUTH || '1') === '1';
const RUN_POST_CALLS = String(process.env.RUN_POST_CALLS || '1') === '1';
const RUN_GET_CALLS = String(process.env.RUN_GET_CALLS || '1') === '1';
const AUTH_MODE = String(process.env.AUTH_MODE || 'concurrent').toLowerCase();
const POST_BATCH_SIZE = Math.max(1, Number(process.env.POST_BATCH_SIZE || 100));
const POST_BATCH_DELAY_MS = Math.max(0, Number(process.env.POST_BATCH_DELAY_MS || 120));
const POST_MAX_RETRIES = Math.max(1, Number(process.env.POST_MAX_RETRIES || 4));
const RETRY_BASE_DELAY_MS = Math.max(1, Number(process.env.RETRY_BASE_DELAY_MS || 120));
const RETRY_JITTER_MS = Math.max(0, Number(process.env.RETRY_JITTER_MS || 40));

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffDelayMs(attempt) {
    const jitter = RETRY_JITTER_MS > 0 ? Math.floor(Math.random() * RETRY_JITTER_MS) : 0;
    return (RETRY_BASE_DELAY_MS * Math.pow(2, Math.max(0, attempt - 1))) + jitter;
}

function fakeIp(i) {
    const a = 10;
    const b = (i >> 8) & 255;
    const c = i & 255;
    return `${a}.0.${b}.${c}`;
}

function percentile(sorted, p) {
    if (sorted.length === 0) return 0;
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
    return sorted[idx];
}

async function runConcurrent(name, count, task) {
    const latencies = [];
    const statuses = {};
    const errorSamples = [];
    let success = 0;
    let failed = 0;

    const startedAt = performance.now();
    await Promise.all(
        Array.from({ length: count }, (_, i) => (async () => {
            const t0 = performance.now();
            try {
                const result = await task(i);
                const statusKey = String(result && result.status ? result.status : 'ERR');
                statuses[statusKey] = (statuses[statusKey] || 0) + 1;
                if (result && result.ok) success += 1;
                else failed += 1;
            } catch (_) {
                if (errorSamples.length < 5) {
                    const msg = _ && _.message ? _.message : String(_);
                    errorSamples.push(msg);
                }
                statuses.ERR = (statuses.ERR || 0) + 1;
                failed += 1;
            } finally {
                latencies.push(performance.now() - t0);
            }
        })())
    );

    const totalMs = performance.now() - startedAt;
    latencies.sort((a, b) => a - b);

    return {
        name,
        requests: count,
        success,
        failed,
        durationMs: totalMs,
        rps: (count / (totalMs / 1000)),
        p50Ms: percentile(latencies, 50),
        p95Ms: percentile(latencies, 95),
        p99Ms: percentile(latencies, 99),
        statuses,
        errorSamples,
    };
}

async function runSequential(name, count, task) {
    const latencies = [];
    const statuses = {};
    const errorSamples = [];
    let success = 0;
    let failed = 0;

    const startedAt = performance.now();
    for (let i = 0; i < count; i++) {
        const t0 = performance.now();
        try {
            const result = await task(i);
            const statusKey = String(result && result.status ? result.status : 'ERR');
            statuses[statusKey] = (statuses[statusKey] || 0) + 1;
            if (result && result.ok) success += 1;
            else failed += 1;
        } catch (err) {
            if (errorSamples.length < 5) {
                errorSamples.push(err && err.message ? err.message : String(err));
            }
            statuses.ERR = (statuses.ERR || 0) + 1;
            failed += 1;
        } finally {
            latencies.push(performance.now() - t0);
        }
    }

    const totalMs = performance.now() - startedAt;
    latencies.sort((a, b) => a - b);

    return {
        name,
        requests: count,
        success,
        failed,
        durationMs: totalMs,
        rps: (count / (totalMs / 1000)),
        p50Ms: percentile(latencies, 50),
        p95Ms: percentile(latencies, 95),
        p99Ms: percentile(latencies, 99),
        statuses,
        errorSamples,
    };
}

async function runBatched(name, count, task, batchSize, batchDelayMs) {
    const latencies = [];
    const statuses = {};
    const errorSamples = [];
    let success = 0;
    let failed = 0;

    const startedAt = performance.now();

    for (let start = 0; start < count; start += batchSize) {
        const end = Math.min(count, start + batchSize);
        await Promise.all(
            Array.from({ length: end - start }, (_, offset) => (async () => {
                const i = start + offset;
                const t0 = performance.now();
                try {
                    const result = await task(i);
                    const statusKey = String(result && result.status ? result.status : 'ERR');
                    statuses[statusKey] = (statuses[statusKey] || 0) + 1;
                    if (result && result.ok) success += 1;
                    else failed += 1;
                } catch (err) {
                    if (errorSamples.length < 5) {
                        errorSamples.push(err && err.message ? err.message : String(err));
                    }
                    statuses.ERR = (statuses.ERR || 0) + 1;
                    failed += 1;
                } finally {
                    latencies.push(performance.now() - t0);
                }
            })())
        );

        if (end < count && batchDelayMs > 0) {
            await sleep(batchDelayMs);
        }
    }

    const totalMs = performance.now() - startedAt;
    latencies.sort((a, b) => a - b);

    return {
        name,
        requests: count,
        success,
        failed,
        durationMs: totalMs,
        rps: (count / (totalMs / 1000)),
        p50Ms: percentile(latencies, 50),
        p95Ms: percentile(latencies, 95),
        p99Ms: percentile(latencies, 99),
        statuses,
        errorSamples,
    };
}

async function fetchJson(path, options) {
    const resp = await fetchWithTimeout(`${BASE_URL}${path}`, options, 120000);
    let json = null;
    try {
        json = await resp.json();
    } catch (_) {
        json = null;
    }
    return { ok: resp.ok, status: resp.status, json };
}

async function fetchWithTimeout(url, options, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error(`timeout_${timeoutMs}ms`)), timeoutMs);
    try {
        const merged = Object.assign({}, options || {}, { signal: controller.signal });
        return await fetch(url, merged);
    } finally {
        clearTimeout(timer);
    }
}

async function withRetries(fn, retries = 2) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;
            if (attempt < retries) {
                await new Promise((resolve) => setTimeout(resolve, 40 * (attempt + 1)));
            }
        }
    }
    throw lastError;
}

function baseHeaders(ip, deviceId, token) {
    const headers = {
        'X-Device-Id': deviceId,
        'X-App-Client': 'load-test'
    };
    if (SEND_ORIGIN && TEST_ORIGIN) {
        headers.Origin = TEST_ORIGIN;
    }
    if (SPOOF_CONNECTING_IP && ip) {
        headers['CF-Connecting-IP'] = ip;
    }
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
}

async function requestWithRetries(requestFactory, maxRetries) {
    let last = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        last = await requestFactory();
        const shouldRetry = [429, 500, 502, 503, 504].includes(last.status);
        if (!shouldRetry || attempt === maxRetries) {
            return last;
        }
        await sleep(backoffDelayMs(attempt));
    }
    return last;
}

async function main() {
    console.log(`Base URL: ${BASE_URL}`);
    console.log(`Origin: ${TEST_ORIGIN}`);
    console.log(`Send Origin header: ${SEND_ORIGIN}`);
    console.log(`Spoof CF-Connecting-IP: ${SPOOF_CONNECTING_IP}`);
    console.log(`Simulated users: ${USERS}`);
    console.log(`Auth users: ${AUTH_USERS}`);
    console.log(`Post requests: ${POST_REQUESTS}`);
    console.log(`Post ramp: batch_size=${POST_BATCH_SIZE} delay_ms=${POST_BATCH_DELAY_MS}`);

    const devices = Array.from({ length: USERS }, (_, i) => ({
        index: i,
        ip: fakeIp(i),
        deviceId: `dev-${Date.now().toString(36)}-${i.toString(36)}`,
        userId: `user_${i.toString(36)}`,
        token: ''
    }));

    let healthResult = null;
    if (RUN_HEALTH) {
        healthResult = await runConcurrent('GET /health', USERS, async (i) => {
            const d = devices[i];
            const resp = await fetchWithTimeout(`${BASE_URL}/health`, {
                method: 'GET',
                headers: baseHeaders(d.ip, d.deviceId)
            }, 15000);
            return { ok: resp.ok, status: resp.status };
        });
    }

    let calendarResult = null;
    if (RUN_CALENDAR) {
        calendarResult = await runConcurrent('GET /calendar', USERS, async (i) => {
            const d = devices[i];
            const resp = await fetchWithTimeout(`${BASE_URL}/calendar`, {
                method: 'GET',
                headers: baseHeaders(d.ip, d.deviceId)
            }, 25000);
            return { ok: resp.ok, status: resp.status };
        });
    }

    let authResult = null;
    const authUsersCount = Math.min(USERS, AUTH_USERS);
    const authDevices = devices.slice(0, authUsersCount);

    if ((RUN_AUTH || RUN_POST_CALLS) && authDevices.length > 0) {
        const authRunner = AUTH_MODE === 'sequential' ? runSequential : runConcurrent;
        authResult = await authRunner('POST /auth/issue', authDevices.length, async (i) => {
            const d = authDevices[i];
            const result = await withRetries(() => fetchJson('/auth/issue', {
                method: 'POST',
                headers: {
                    ...baseHeaders(d.ip, d.deviceId),
                    'Content-Type': 'application/json',
                    'X-User-Id': d.userId
                },
                body: JSON.stringify({
                    deviceId: d.deviceId,
                    userId: d.userId
                })
            }), 1);
            if (result.ok && result.json && result.json.token) {
                d.token = result.json.token;
            }
            return result;
        });
    }

    const devicesWithToken = devices.filter((d) => !!d.token);

    let callsPostResult = null;
    if (RUN_POST_CALLS) {
        const postCount = Math.max(0, POST_REQUESTS);
        callsPostResult = await runBatched('POST /calls (ramped)', postCount, async (i) => {
            if (devicesWithToken.length === 0) {
                return { ok: false, status: 401 };
            }

            const d = devicesWithToken[i % devicesWithToken.length];
            const symbol = `T${(100000 + i).toString(36).toUpperCase()}USDT`.slice(0, 12);
            const direction = i % 2 === 0 ? 'LONG' : 'SHORT';
            const idempotencyKey = `lt-call-${i}-${Date.now().toString(36)}-${d.index}`;
            const requestFactory = () => fetchJson('/calls', {
                method: 'POST',
                headers: {
                    ...baseHeaders(d.ip, d.deviceId, d.token),
                    'Content-Type': 'application/json',
                    'X-User-Id': d.userId,
                    'Idempotency-Key': idempotencyKey
                },
                body: JSON.stringify({
                    symbol,
                    direction,
                    confidence: 80,
                    gates: 'SCORE',
                    price: '123.45',
                    name: symbol,
                    short: symbol.replace('USDT', ''),
                    img: '',
                    reason: 'LOAD_TEST'
                })
            });

            return requestWithRetries(requestFactory, POST_MAX_RETRIES);
        }, POST_BATCH_SIZE, POST_BATCH_DELAY_MS);
    }

    let callsGetResult = null;
    if (RUN_GET_CALLS) {
        callsGetResult = await runConcurrent('GET /calls?limit=20', USERS, async (i) => {
            const d = devices[i];
            const resp = await fetchWithTimeout(`${BASE_URL}/calls?limit=20`, {
                method: 'GET',
                headers: baseHeaders(d.ip, d.deviceId)
            }, 120000);
            return { ok: resp.ok, status: resp.status };
        });
    }

    const results = [];
    if (healthResult) results.push(healthResult);
    if (calendarResult) results.push(calendarResult);
    if (authResult) results.push(authResult);
    if (callsPostResult) results.push(callsPostResult);
    if (callsGetResult) results.push(callsGetResult);

    console.log('\n=== LOAD TEST RESULTS ===');
    for (const r of results) {
        console.log(`\n[${r.name}]`);
        console.log(`requests=${r.requests} success=${r.success} failed=${r.failed}`);
        console.log(`duration_ms=${r.durationMs.toFixed(1)} rps=${r.rps.toFixed(1)}`);
        console.log(`latency_ms p50=${r.p50Ms.toFixed(1)} p95=${r.p95Ms.toFixed(1)} p99=${r.p99Ms.toFixed(1)}`);
        console.log(`status_breakdown=${JSON.stringify(r.statuses)}`);
        if (Array.isArray(r.errorSamples) && r.errorSamples.length > 0) {
            console.log(`error_samples=${JSON.stringify(r.errorSamples)}`);
        }
    }

    const failedCritical = results.some((r) => r.failed > 0);
    if (failedCritical) {
        process.exitCode = 2;
    }
}

main().catch((err) => {
    console.error('Load test crashed:', err);
    process.exit(1);
});
