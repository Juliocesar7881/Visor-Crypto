const fs = require('fs');
let code = fs.readFileSync('www/macro-section.js', 'utf8');

const nativeHttpTextCode = \
    async function nativeHttpText(url) {
        try {
            if (window.Capacitor?.Plugins?.CapacitorHttp) {
                const resp = await window.Capacitor.Plugins.CapacitorHttp.request({ url, method: 'GET', connectTimeout: 8000, readTimeout: 8000 });
                if (resp.status >= 200 && resp.status < 300) {
                    return typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);
                }
            }
        } catch (_) {}

        try {
            if (window.CapacitorHttp?.request) {
                const resp = await window.CapacitorHttp.request({ url, method: 'GET', connectTimeout: 8000, readTimeout: 8000 });
                if (resp.status >= 200 && resp.status < 300) {
                    return typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);
                }
            }
        } catch (_) {}

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        try {
            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timer);
            if (!response.ok) throw new Error('HTTP ' + response.status);
            return await response.text();
        } catch (err) {
            clearTimeout(timer);
            throw err;
        }
    }
\;

if (!code.includes('async function nativeHttpText')) {
    code = code.replace(
        'async function nativeHttpGet(url) {', 
        nativeHttpTextCode + '\\n    async function nativeHttpGet(url) {'
    );
}

const newCsvFallback = \
    async function fetchFredCsvFallback(seriesId, sortOrder = 'desc', limit = 10) {
        const csvUrl = 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=' + encodeURIComponent(seriesId);
        
        const urls = [
            csvUrl,
            CORS_PROXY + encodeURIComponent(csvUrl),
            'https://api.allorigins.win/raw?url=' + encodeURIComponent(csvUrl)
        ];

        for (let i=0; i<urls.length; i++) {
            try {
                const url = urls[i];
                let text = await nativeHttpText(url);
                if (text && typeof text === 'string') {
                    const observations = parseFredCsvObservations(text, sortOrder, limit);
                    if (observations.length > 0) return { observations };
                }
            } catch (e) {
                // fall through
            }
        }

        return { observations: [] };
    }
\;

code = code.replace(
    /async function fetchFredCsvFallback\\([\\s\\S]*?return \\{ observations: \\[\\] \\};\\s*\\}/, 
    newCsvFallback.trim()
);

fs.writeFileSync('www/macro-section.js', code, 'utf8');
console.log('Patched macro-section.js successfully!');
