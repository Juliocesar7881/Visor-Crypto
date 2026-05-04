(function () {
    'use strict';

    const DEVICE_ID_KEY = 'vc_device_id_v1';
    const USER_ID_KEY = 'vc_user_id_v1';
    const TOKEN_CACHE_KEY = 'vc_auth_token_cache_v1';
    const TOKEN_REFRESH_SAFETY_MS = 10000;
    const DEFAULT_TOKEN_TTL_MS = 120000;

    let inFlightTokenPromise = null;

    function getWorkerUrl() {
        const cfg = (window.APP_CONFIG || {});
        return String(cfg.CALENDAR_WORKER_URL || '').trim().replace(/\/+$/, '');
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

    function loadCachedToken() {
        try {
            const raw = localStorage.getItem(TOKEN_CACHE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return null;
            if (!parsed.token || !parsed.expiresAt) return null;
            return parsed;
        } catch (_) {
            return null;
        }
    }

    function saveCachedToken(token, expiresAt) {
        try {
            localStorage.setItem(TOKEN_CACHE_KEY, JSON.stringify({ token, expiresAt }));
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
        const workerUrl = getWorkerUrl();
        if (!workerUrl) {
            throw new Error('CALENDAR_WORKER_URL not configured');
        }

        const now = Date.now();
        const cached = loadCachedToken();
        if (!forceRefresh && cached && cached.token && Number(cached.expiresAt) > (now + TOKEN_REFRESH_SAFETY_MS)) {
            return cached.token;
        }

        if (!forceRefresh && inFlightTokenPromise) {
            return inFlightTokenPromise;
        }

        const deviceId = getOrCreateDeviceId();
        const userId = getUserId();

        inFlightTokenPromise = (async () => {
            const resp = await fetch(`${workerUrl}/auth/issue`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Device-Id': deviceId,
                    'X-User-Id': userId,
                    'X-App-Client': 'visor-mobile'
                },
                body: JSON.stringify({ deviceId, userId }),
                signal: AbortSignal.timeout(6000)
            });

            if (!resp.ok) {
                const message = `Auth issue failed (${resp.status})`;
                throw new Error(message);
            }

            const data = await resp.json();
            if (!data || !data.success || !data.token) {
                throw new Error('Auth issue failed (invalid payload)');
            }

            const expiresAt = Math.min(
                Date.now() + ((Number(data.expiresIn) || 120) * 1000),
                parseTokenExpiryMs(data.token)
            );
            saveCachedToken(data.token, expiresAt);
            return data.token;
        })();

        try {
            return await inFlightTokenPromise;
        } finally {
            inFlightTokenPromise = null;
        }
    }

    async function getWriteAuthHeaders(options) {
        const forceRefresh = !!(options && options.forceRefresh);
        const token = await issueToken(forceRefresh);
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
        getUserId,
        setUserId,
        clearCachedToken,
        getWriteAuthHeaders,
        fetchWithWriteAuth,
        createIdempotencyKey,
    };
})();
