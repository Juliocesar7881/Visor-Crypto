// API Keys — copie este arquivo para config.js e preencha as chaves reais.
window.APP_CONFIG = {
    FINNHUB_API_KEY: 'YOUR_FINNHUB_API_KEY',
    ALPHA_VANTAGE_KEY: 'YOUR_ALPHA_VANTAGE_KEY',
    TWELVE_DATA_API_KEYS: ['YOUR_TWELVE_DATA_KEY_1', 'YOUR_TWELVE_DATA_KEY_2'],
    // Cloudflare Worker URL para calendário econômico (deploy worker/ primeiro)
    CALENDAR_WORKER_URL: 'https://visor-crypto-calendar.visor-crypto.workers.dev',
    CALENDAR_WORKER_FALLBACK_URL: 'https://visorcrypto.loan',
    CALENDAR_WORKER_URLS: [
        'https://visor-crypto-calendar.visor-crypto.workers.dev',
        'https://visor-crypto-calendar.visorcrypto.workers.dev',
        'https://visorcrypto.loan'
    ]
};
