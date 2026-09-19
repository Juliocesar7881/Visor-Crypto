(function () {
    'use strict';

    const DEVICE_ID_KEY = 'vc_device_id_v1';
    const DEVICE_SECRET_KEY = 'vc_device_secret_v1';
    const USER_ID_KEY = 'vc_user_id_v1';
    const TOKEN_CACHE_KEY = 'vc_auth_token_cache_v1';
    const TOKEN_REFRESH_SAFETY_MS = 10000;
    const DEFAULT_TOKEN_TTL_MS = 120000;

    let inFlightTokenPromise = null;

    function getWorkerUrl() {
        const cfg = (window.APP_CONFIG || {});
        return String(cfg.CALENDAR_WORKER_URL || '').trim().replace(/\/+$/, '');
    }

    function getWorkerUrls(preferredUrl) {
        const preferred = String(preferredUrl || '').trim().replace(/\/+$/, '');
        const configured = typeof window.getVisorWorkerUrls === 'function'
            ? window.getVisorWorkerUrls()
            : [getWorkerUrl(), (window.APP_CONFIG || {}).CALENDAR_WORKER_FALLBACK_URL];
        return [...new Set([preferred, ...configured]
            .map((url) => String(url || '').trim().replace(/\/+$/, ''))
            .filter(Boolean))];
    }

    function normalizeId(raw) {
        return String(raw || '').trim().toLowerCase().replace(/[^a-z0-9._:-]/g, '').slice(0, 128);
    }

    function randomHex(bytesLength) {
        const bytes = new Uint8Array(bytesLength);
        crypto.getRandomValues(bytes);
        return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
    }

    function getOrCreateDeviceId() {
        let existing = normalizeId(localStorage.getItem(DEVICE_ID_KEY));
        if (existing && existing.length >= 8) {
            return existing;
        }
        existing = `dev_${Date.now().toString(36)}_${randomHex(8)}`;
        localStorage.setItem(DEVICE_ID_KEY, existing);
        return existing;
    }

    function getOrCreateDeviceSecret() {
        let existing = String(localStorage.getItem(DEVICE_SECRET_KEY) || '').trim();
        if (/^[A-Za-z0-9._:-]{32,160}$/.test(existing)) {
            return existing;
        }
        existing = randomHex(32);
        localStorage.setItem(DEVICE_SECRET_KEY, existing);
        clearCachedToken();
        return existing;
    }

    function getUserId() {
        return String(localStorage.getItem(USER_ID_KEY) || '').trim().slice(0, 64);
    }

    function setUserId(userId) {
        const normalized = String(userId || '').trim().slice(0, 64);
        if (!normalized) {
            localStorage.removeItem(USER_ID_KEY);
            return;
        }
        localStorage.setItem(USER_ID_KEY, normalized);
    }

    function loadCachedToken(workerUrl, requiredScope) {
        try {
            const raw = localStorage.getItem(TOKEN_CACHE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return null;
            if (!parsed.token || !parsed.expiresAt) return null;
            const cachedWorkerUrl = String(parsed.workerUrl || '').replace(/\/+$/, '');
            if (workerUrl && cachedWorkerUrl && cachedWorkerUrl !== workerUrl) return null;
            if (requiredScope && !((Array.isArray(parsed.scopes) ? parsed.scopes : []).includes(requiredScope))) return null;
            return parsed;
        } catch (_) {
            return null;
        }
    }

    function saveCachedToken(token, expiresAt, workerUrl, scopes) {
        try {
            localStorage.setItem(TOKEN_CACHE_KEY, JSON.stringify({ token, expiresAt, workerUrl, scopes: Array.isArray(scopes) ? scopes : [] }));
        } catch (_) {
            // Ignore storage quota errors.
        }
    }

    function clearCachedToken() {
        try {
            localStorage.removeItem(TOKEN_CACHE_KEY);
        } catch (_) {
            // no-op
        }
    }

    function parseTokenExpiryMs(token) {
        try {
            const parts = String(token || '').split('.');
            if (parts.length !== 3) return Date.now() + DEFAULT_TOKEN_TTL_MS;
            const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
            const exp = Number(payload && payload.exp);
            if (!Number.isFinite(exp)) return Date.now() + DEFAULT_TOKEN_TTL_MS;
            return exp * 1000;
        } catch (_) {
            return Date.now() + DEFAULT_TOKEN_TTL_MS;
        }
    }

    async function issueToken(forceRefresh) {
        const options = typeof forceRefresh === 'object' && forceRefresh !== null ? forceRefresh : {};
        const force = typeof forceRefresh === 'boolean' ? forceRefresh : !!options.forceRefresh;
        const workerUrls = getWorkerUrls(options.workerUrl);
        if (!workerUrls.length) {
            throw new Error('CALENDAR_WORKER_URL not configured');
        }

        const now = Date.now();
        const cached = loadCachedToken(workerUrls[0], options.requireScope);
        if (!force && cached && cached.token && Number(cached.expiresAt) > (now + TOKEN_REFRESH_SAFETY_MS)) {
            return cached.token;
        }

        if (!force && inFlightTokenPromise) {
            return inFlightTokenPromise;
        }

        const deviceId = getOrCreateDeviceId();
        const deviceSecret = getOrCreateDeviceSecret();
        const userId = getUserId();

        inFlightTokenPromise = (async () => {
            let lastErr = null;
            for (const workerUrl of workerUrls) {
                try {
                    const resp = await fetch(`${workerUrl}/auth/issue`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Device-Id': deviceId,
                            'X-User-Id': userId,
                            'X-App-Client': 'visor-mobile'
                        },
                        body: JSON.stringify({ deviceId, userId, deviceSecret }),
                        signal: AbortSignal.timeout(6000)
                    });

                    if (!resp.ok) {
                        lastErr = new Error(`Auth issue failed (${resp.status})`);
                        continue;
                    }

                    const data = await resp.json();
                    const scopes = Array.isArray(data?.scope) ? data.scope : [];
                    if (!data || !data.success || !data.token || (options.requireScope && !scopes.includes(options.requireScope))) {
                        lastErr = new Error('Auth issue failed (invalid payload)');
                        continue;
                    }

                    const expiresAt = Math.min(
                        Date.now() + ((Number(data.expiresIn) || 120) * 1000),
                        parseTokenExpiryMs(data.token)
                    );
                    saveCachedToken(data.token, expiresAt, workerUrl, scopes);
                    return data.token;
                } catch (err) {
                    lastErr = err;
                }
            }

            throw (lastErr || new Error('Auth issue failed'));
        })();

        try {
            return await inFlightTokenPromise;
        } finally {
            inFlightTokenPromise = null;
        }
    }

    async function getWriteAuthHeaders(options) {
        const forceRefresh = !!(options && options.forceRefresh);
        const token = await issueToken({
            forceRefresh,
            workerUrl: options && options.workerUrl,
            requireScope: options && options.requireScope
        });
        const headers = {
            'Authorization': `Bearer ${token}`,
            'X-Device-Id': getOrCreateDeviceId(),
            'X-App-Client': 'visor-mobile'
        };
        const userId = getUserId();
        if (userId) {
            headers['X-User-Id'] = userId;
        }
        return headers;
    }

    function createIdempotencyKey(prefix) {
        const safePrefix = String(prefix || 'req').replace(/[^a-zA-Z0-9._:-]/g, '').slice(0, 32) || 'req';
        return `${safePrefix}:${Date.now().toString(36)}:${randomHex(6)}`;
    }

    async function fetchWithWriteAuth(url, init) {
        const baseInit = init || {};
        const headers = Object.assign({}, baseInit.headers || {});
        Object.assign(headers, await getWriteAuthHeaders());
        return fetch(url, Object.assign({}, baseInit, { headers }));
    }

    window.AuthClient = {
        getDeviceId: getOrCreateDeviceId,
        getDeviceSecret: getOrCreateDeviceSecret,
        getUserId,
        setUserId,
        clearCachedToken,
        getWorkerUrls,
        getWriteAuthHeaders,
        fetchWithWriteAuth,
        createIdempotencyKey,
    };
})();
