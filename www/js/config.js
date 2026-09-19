// Runtime config file.
// Keep keys empty by default; production secrets should be injected in CI/CD.
window.APP_CONFIG = window.APP_CONFIG || {
    FINNHUB_API_KEY: '',
    ALPHA_VANTAGE_KEY: '',
    TWELVE_DATA_API_KEYS: [],
    CALENDAR_WORKER_URL: 'https://visor-crypto-calendar.visor-crypto.workers.dev',
    CALENDAR_WORKER_FALLBACK_URL: 'https://visorcrypto.loan',
    CALENDAR_WORKER_URLS: [
        'https://visor-crypto-calendar.visor-crypto.workers.dev',
        'https://visor-crypto-calendar.visorcrypto.workers.dev',
        'https://visorcrypto.loan'
    ]
};

window.getVisorWorkerUrls = window.getVisorWorkerUrls || function getVisorWorkerUrls() {
    const cfg = window.APP_CONFIG || {};
    const urls = Array.isArray(cfg.CALENDAR_WORKER_URLS) ? cfg.CALENDAR_WORKER_URLS : [
        cfg.CALENDAR_WORKER_URL,
        cfg.CALENDAR_WORKER_FALLBACK_URL
    ];
    return [...new Set(urls.map(url => String(url || '').trim().replace(/\/+$/, '')).filter(Boolean))];
};
