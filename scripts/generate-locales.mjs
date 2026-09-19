import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const i18nPath = path.join(root, 'www/js/i18n.js');
const i18nSource = fs.readFileSync(i18nPath, 'utf8');

function extractLiteral(startMarker, endMarker) {
    const start = i18nSource.indexOf(startMarker);
    const end = i18nSource.indexOf(endMarker, start + startMarker.length);
    if (start < 0 || end < 0) throw new Error(`Unable to extract ${startMarker}`);
    return i18nSource.slice(start + startMarker.length, end).trim();
}

const locales = Function(`"use strict"; return (${extractLiteral('const SUPPORTED =', ';\n    const RTL_LANGUAGES')});`)();
const baseMessages = Function(`"use strict"; return (${extractLiteral('const BASE_MESSAGES =', ';\n\n    function languageOf')});`)();
const cachePath = path.join(root, 'scripts/.translation-cache-v1.json');
const webLocalesDir = path.join(root, 'www/locales');
let cache = {};
try { cache = JSON.parse(fs.readFileSync(cachePath, 'utf8')); } catch {}
fs.mkdirSync(webLocalesDir, { recursive: true });

const glossary = [
    'Visor Crypto', 'Fed Watch', 'LONG', 'SHORT', 'RSI', 'MACD', 'FOMC', 'USDT', 'BTC', 'ETH',
    'S6_INV', 'DXY', 'VIX', 'S&P 500', 'NASDAQ', 'Altseason', 'Bitcoin', 'Ethereum', 'Binance',
    'Coinbase', 'BlackRock', 'Fidelity', 'Grayscale', 'MetaMask', 'MicroStrategy'
].sort((a, b) => b.length - a.length);

function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function protectTerms(value) {
    let text = String(value || '');
    const protectedValues = [];
    const protect = (match) => {
        const index = protectedValues.push(match) - 1;
        return `<span class="notranslate">VCX${index}XCV</span>`;
    };
    text = text.replace(/\{[a-zA-Z0-9_]+\}|%\d+\$[a-z]|%%/g, protect);
    glossary.forEach((term) => {
        text = text.replace(new RegExp(`\\b${escapeRegex(term)}\\b`, 'gi'), protect);
    });
    return { text, protectedValues };
}

function restoreTerms(value, protectedValues) {
    let text = String(value || '');
    text = text.replace(/<span class=["']notranslate["']>VCX(\d+)XCV<\/span>/gi, (_, index) => protectedValues[Number(index)] || '');
    text = text.replace(/VCX(\d+)XCV/g, (_, index) => protectedValues[Number(index)] || '');
    return text.trim();
}

const cp1252Bytes = new Map([
    ['€', 0x80], ['‚', 0x82], ['ƒ', 0x83], ['„', 0x84], ['…', 0x85], ['†', 0x86], ['‡', 0x87],
    ['ˆ', 0x88], ['‰', 0x89], ['Š', 0x8a], ['‹', 0x8b], ['Œ', 0x8c], ['Ž', 0x8e], ['‘', 0x91],
    ['’', 0x92], ['“', 0x93], ['”', 0x94], ['•', 0x95], ['–', 0x96], ['—', 0x97], ['˜', 0x98],
    ['™', 0x99], ['š', 0x9a], ['›', 0x9b], ['œ', 0x9c], ['ž', 0x9e], ['Ÿ', 0x9f]
]);

function repairMojibake(raw) {
    let value = String(raw || '');
    for (let pass = 0; pass < 2 && /[ÃÂâð]/.test(value); pass++) {
        try {
            const bytes = [];
            let valid = true;
            for (const character of value) {
                const code = character.codePointAt(0);
                if (code <= 0xff) bytes.push(code);
                else if (cp1252Bytes.has(character)) bytes.push(cp1252Bytes.get(character));
                else { valid = false; break; }
            }
            if (!valid) break;
            const decoded = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes));
            if (!decoded || decoded.includes('�')) break;
            value = decoded;
        } catch (_) { break; }
    }
    return value;
}

function googleTarget(locale) {
    if (locale === 'iw-IL') return 'he';
    if (locale === 'fil') return 'tl';
    if (locale.startsWith('en-')) return 'en';
    if (locale.startsWith('es-')) return locale === 'es-ES' ? 'es' : 'es';
    if (locale.startsWith('fr-')) return 'fr';
    if (locale.startsWith('fa-')) return 'fa';
    if (locale.startsWith('ms-')) return 'ms';
    return locale;
}

function cacheKey(source, target, text) {
    return `${source}|${target}|${text}`;
}

function placeholders(value) {
    return [...String(value || '').matchAll(/\{[a-zA-Z0-9_]+\}|%\d+\$[a-z]|%%/g)]
        .map((match) => match[0])
        .sort();
}

function sanitizeTranslation(value, sourceText) {
    let safe = String(value || '')
        .replace(/\[object Object\]/gi, '')
        .replace(/(^|[^\p{L}\p{N}_])undefined(?=$|[^\p{L}\p{N}_])/giu, '$1not determined')
        .replace(/(^|[^\p{L}\p{N}_])NaN(?=$|[^\p{L}\p{N}_])/gu, '$1not available')
        .replace(/\s+/g, ' ')
        .trim();
    if (!safe) return String(sourceText || '');
    if (JSON.stringify(placeholders(sourceText)) !== JSON.stringify(placeholders(safe))) {
        return String(sourceText || '');
    }
    return safe;
}

async function fetchWithHardTimeout(url, timeoutMs = 9000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let hardTimer = null;
    try {
        return await Promise.race([
            fetch(url, { signal: controller.signal }),
            new Promise((_, reject) => {
                hardTimer = setTimeout(() => reject(new Error('translation timeout')), timeoutMs + 250);
            })
        ]);
    } finally {
        clearTimeout(timer);
        if (hardTimer) clearTimeout(hardTimer);
    }
}

async function fetchTranslation(text, source, target) {
    if (!text || source === target) return text;
    const key = cacheKey(source, target, text);
    if (cache[key]) return cache[key];
    const protectedText = protectTerms(text);
    let lastError = null;
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(source)}&tl=${encodeURIComponent(target)}&dt=t&q=${encodeURIComponent(protectedText.text)}`;
            const response = await fetchWithHardTimeout(url, 8000);
            if (!response.ok) throw new Error(`translate HTTP ${response.status}`);
            const body = await response.json();
            const translated = restoreTerms((body?.[0] || []).map((part) => part?.[0] || '').join(''), protectedText.protectedValues);
            if (!translated || /undefined|\[object Object\]/i.test(translated)) throw new Error('invalid translation');
            const placeholders = String(text).match(/\{[a-zA-Z0-9_]+\}|%\d+\$[a-z]|%%/g) || [];
            if (!placeholders.every((placeholder) => translated.includes(placeholder))) throw new Error('placeholder mismatch');
            cache[key] = translated;
            return translated;
        } catch (error) {
            lastError = error;
            await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
        }
    }
    console.warn(`Translation fallback (${source}->${target}): ${text.slice(0, 60)} (${lastError?.message || 'failed'})`);
    return text;
}

async function translateList(values, source, target) {
    const output = [];
    let providerUnavailable = false;
    for (let i = 0; i < values.length; i += 24) {
        const chunk = values.slice(i, i + 24);
        chunk.forEach((text) => {
            const key = cacheKey(source, target, text);
            if (cache[key]) cache[key] = sanitizeTranslation(cache[key], text);
        });
        const missing = chunk.filter((text) => !cache[cacheKey(source, target, text)] && source !== target);
        if (missing.length && !providerUnavailable) {
            const protectedChunk = missing.map(protectTerms);
            const separator = '__VISOR_SEPARATOR_9F4C__';
            const joined = protectedChunk.map((item) => item.text).join(`\n${separator}\n`);
            try {
                const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(source)}&tl=${encodeURIComponent(target)}&dt=t&q=${encodeURIComponent(joined)}`;
                const response = await fetchWithHardTimeout(url, 3000);
                if (!response.ok) throw new Error(`translate HTTP ${response.status}`);
                const body = await response.json();
                const translated = (body?.[0] || []).map((part) => part?.[0] || '').join('').split(new RegExp(`\\s*${separator}\\s*`, 'i'));
                if (translated.length !== missing.length) throw new Error('batch line mismatch');
                missing.forEach((sourceText, index) => {
                    const restored = sanitizeTranslation(
                        restoreTerms(translated[index], protectedChunk[index].protectedValues),
                        sourceText
                    );
                    if (restored) {
                        cache[cacheKey(source, target, sourceText)] = restored;
                    }
                });
            } catch {
                providerUnavailable = true;
            }
        }
        if (missing.length) {
            // A release must be reproducible even when the translation provider
            // throttles one language. Persist the source marker; non-English UI
            // phrases are converted to the validated English fallback below.
            missing.forEach((text) => {
                const key = cacheKey(source, target, text);
                if (!cache[key]) cache[key] = text;
            });
        }
        output.push(...chunk.map((text) => sanitizeTranslation(cache[cacheKey(source, target, text)] || text, text)));
        if (missing.length) await new Promise((resolve) => setTimeout(resolve, 90));
    }
    return output;
}

function normalizeCandidate(value) {
    return repairMojibake(value)
        .replace(/\\n|\\r|\\t/g, ' ')
        .replace(/\\(['"`])/g, '$1')
        .replace(/&amp;/g, '&')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function isLikelyPortugueseUi(value) {
    if (!value || value.length < 2 || value.length > 700) return false;
    if (/https?:\/\/|www\.|data:|\$\{|^[.#/]|(?:class|style|onclick|src|href)=|querySelector|addEventListener|localStorage|JSON\.|console\.|window\.|document\.|function\s*\(|\w+\([^)]*\)|=>/i.test(value)) return false;
    if (/^[\w.-]+(?:_[\w.-]+)+$/.test(value) || /^[-\d$%.,:+/()]+$/.test(value)) return false;
    const plain = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return /[\u00c0-\u024f]/.test(value) ||
        /\b(?:a|o|as|os|de|do|da|dos|das|para|com|sem|uma|um|nao|sim|sinal|sinais|analise|confianca|mercado|preco|dados|carregando|atualizando|historico|noticias|taxa|moeda|compradora|vendedora|compra|venda|alta|baixa|forte|fraca|nenhum|disponivel|indisponivel|resultado|indicador|tendencia|agora|atras|erro|falha|suporte|resistencia|volume|abertura|fechamento|maxima|minima|ultimo|proxima|monitoramento|ativado|desativado|receber|configuracoes|periodo|tempo|pontos|direcao|lateral|acima|abaixo|neutro)\b/.test(plain);
}

function addPhraseFragments(target, rawValue) {
    const value = String(rawValue || '');
    const fragments = /<[^>]+>/.test(value)
        ? value.replace(/<[^>]+>/g, '\n').split('\n')
        : [value];
    fragments.forEach((fragment) => {
        const normalized = normalizeCandidate(fragment);
        if (isLikelyPortugueseUi(normalized)) target.add(normalized);
    });
}

function jsVisiblePhrases() {
    const output = new Set();
    const jsFiles = fs.readdirSync(path.join(root, 'www/js'))
        .filter((name) => name.endsWith('.js') && !['generated-locales.js', 'i18n.js', 'config.js', 'config.example.js'].includes(name))
        .map((name) => path.join(root, 'www/js', name));
    jsFiles.push(
        path.join(root, 'www/macro-section.js'),
        path.join(root, 'www/realtime-cvd.js'),
        path.join(root, 'www/ta-engine-v2.js'),
        path.join(root, 'www/ta-engine-v3.js'),
        path.join(root, 'www/ta-engine-v4.js')
    );

    jsFiles.filter((file) => fs.existsSync(file)).forEach((file) => {
        const source = fs.readFileSync(file, 'utf8');
        for (const match of source.matchAll(/(['"])((?:\\.|(?!\1)[^\r\n])*)\1/g)) {
            addPhraseFragments(output, match[2]);
        }
        for (const match of source.matchAll(/`((?:\\.|[^`])*)`/g)) {
            let placeholderIndex = 0;
            const templated = match[1].replace(/\$\{(?:[^{}]|\{[^{}]*\})*\}/g, () => `{value${++placeholderIndex}}`);
            if (templated.includes('${')) continue;
            addPhraseFragments(output, templated);
        }
    });
    return [...output];
}

function htmlPhrases() {
    const html = fs.readFileSync(path.join(root, 'www/index.html'), 'utf8')
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '');
    const values = [];
    for (const match of html.matchAll(/>([^<>]+)</g)) values.push(match[1]);
    for (const match of html.matchAll(/(?:title|placeholder|aria-label)=["']([^"']+)["']/g)) values.push(match[1]);
    const common = [
        'Atualizando sinais...', 'Carregando...', 'Sincronizando...', 'Atualizado agora', 'Carregando dados...',
        'Dados temporariamente indisponíveis', 'Nenhum sinal ativo', 'Nenhum histórico ainda',
        'Sem divergência detectada', 'Sem absorção detectada', 'Sem breakout detectado',
        'Análise Técnica Avançada', 'Confiança Final', 'Confiança por Pontos', 'Sinal ativo',
        'Conexão indisponível', 'Sem permissão', 'Ativo', 'Inativo', 'Notificações', 'Configurações'
    ];
    return [...new Set([...values, ...common, ...jsVisiblePhrases()]
        .map((value) => value.replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim())
        .filter((value) => value.length >= 2 && value.length <= 700 && !/^[-\d$%.,:+/()]+$/.test(value)))];
}

function androidQualifier(locale) {
    const [language, region] = locale.split('-');
    if (!region) return `values-${language}`;
    if (/^\d+$/.test(region)) return `values-b+${language}+${region}`;
    return `values-${language}-r${region}`;
}

function xmlEscape(value) {
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, "\\'");
}

function safeFileLocale(locale) {
    return locale.replace(/[^A-Za-z0-9-]/g, '-');
}

function trimTo(value, max) {
    if (value.length <= max) return value;
    const clipped = value.slice(0, max + 1);
    const boundary = clipped.lastIndexOf(' ');
    return `${clipped.slice(0, boundary > max * 0.65 ? boundary : max - 1).trim()}…`;
}

const phrases = htmlPhrases();
const messageKeys = Object.keys(baseMessages);
const messageValues = messageKeys.map((key) => baseMessages[key]);
const catalogs = {};
const targetCache = new Map();
const releaseNotesByLocale = new Map();
let englishPhrasePromise = null;
const listingSource = {
    short: 'Crypto signals, prices, news and macro data in real time.',
    full: [
        'Visor Crypto brings Bitcoin and altcoin prices, technical signals, call history, filtered crypto news and macro indicators into one fast market dashboard.',
        'Monitor opportunities, check Fed Watch, follow the US economic calendar and review signal history with 1h, 2h and 4h outcomes.',
        'Signals are informational and based on market data. They are not financial advice.'
    ],
    notes: [
        'Discreet ads at natural pauses help keep Visor Crypto free.',
        'Cleaner Bitcoin Heatmap shortcut on the Home screen.',
        'Security, performance, animation efficiency and stability improvements.'
    ]
};
const listingOverrides = {
    'pt-BR': {
        notes: [
            'Anúncios discretos em pausas naturais ajudam a manter o Visor Crypto gratuito.',
            'Atalho do Heatmap do Bitcoin mais limpo e discreto na HOME.',
            'Melhorias de segurança, desempenho, eficiência das animações e estabilidade.'
        ]
    }
};

function getEnglishPhrases() {
    if (!englishPhrasePromise) englishPhrasePromise = translateList(phrases, 'auto', 'en');
    return englishPhrasePromise;
}

async function buildTarget(target) {
    if (targetCache.has(target)) return targetCache.get(target);
    const promise = (async () => {
        const messages = target === 'en' ? messageValues : await translateList(messageValues, 'en', target);
        const englishPhrases = target === 'pt-BR' ? null : await getEnglishPhrases();
        const rawPhrases = target === 'pt-BR'
            ? phrases
            : target === 'en'
                ? englishPhrases
                : await translateList(phrases, 'auto', target);
        const translatedPhrases = target === 'pt-BR' || target === 'en'
            ? rawPhrases
            : rawPhrases.map((value, index) => value === phrases[index] ? englishPhrases[index] : value);
        const listingValues = [listingSource.short, ...listingSource.full, ...listingSource.notes];
        const listing = target === 'en' ? listingValues : await translateList(listingValues, 'en', target);
        const override = listingOverrides[target];
        if (override?.notes?.length === listingSource.notes.length) {
            listing.splice(1 + listingSource.full.length, listingSource.notes.length, ...override.notes);
        }
        return { messages, translatedPhrases, listing };
    })();
    targetCache.set(target, promise);
    return promise;
}

async function generateLocale(locale) {
    const target = googleTarget(locale);
    console.log(`Generating ${locale} (${target})`);
    const generated = await buildTarget(target);
    const messages = Object.fromEntries(messageKeys.map((key, index) => [key, generated.messages[index]]));
    const phraseMap = Object.fromEntries(phrases.map((phrase, index) => [phrase, generated.translatedPhrases[index]]));
    catalogs[locale] = { messages, phrases: phraseMap };
    fs.writeFileSync(
        path.join(webLocalesDir, `${safeFileLocale(locale)}.json`),
        `${JSON.stringify(catalogs[locale])}\n`
    );

    const qualifier = androidQualifier(locale);
    const valuesDir = path.join(root, 'android/app/src/main/res', qualifier);
    fs.mkdirSync(valuesDir, { recursive: true });
    const bodyTemplate = String(messages.confidenceNotification || 'Confidence: {value}%')
        .replace(/%\s*\{value\}/g, '{value}%')
        .replace('{value}', '%1$d')
        .replace(/%(?!1\$d|%)/g, '%%');
    const stringsXml = `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n` +
        `    <string name="signal_channel_name">${xmlEscape(messages.signalChannelName)}</string>\n` +
        `    <string name="signal_channel_description">${xmlEscape(messages.signalChannelDescription)}</string>\n` +
        `    <string name="signal_notification_title">%1$s - %2$s</string>\n` +
        `    <string name="signal_notification_body">${xmlEscape(bodyTemplate)}</string>\n` +
        `</resources>\n`;
    fs.writeFileSync(path.join(valuesDir, 'strings.xml'), stringsXml);

    const [shortDescription, ...remaining] = generated.listing;
    const fullDescription = remaining.slice(0, 3).join('\n\n');
    const releaseNotes = remaining.slice(3).map((line) => `- ${line}`).join('\n');
    const trimmedReleaseNotes = trimTo(releaseNotes, 500);
    const listingDir = path.join(root, 'playstore-assets/listings', safeFileLocale(locale));
    fs.mkdirSync(listingDir, { recursive: true });
    fs.writeFileSync(path.join(listingDir, 'title.txt'), 'Visor Crypto\n');
    fs.writeFileSync(path.join(listingDir, 'short-description.txt'), `${trimTo(shortDescription, 80)}\n`);
    fs.writeFileSync(path.join(listingDir, 'full-description.txt'), `${fullDescription}\n`);
    fs.writeFileSync(path.join(listingDir, 'release-notes-138.txt'), `${trimmedReleaseNotes}\n`);
    releaseNotesByLocale.set(locale, trimmedReleaseNotes);
    const markdown = `# Visor Crypto - ${locale}\n\n## Short title\nVisor Crypto\n\n## Short description\n${trimTo(shortDescription, 80)}\n\n## Full description\n${fullDescription}\n\n## What's new 1.0.10\n${trimmedReleaseNotes}\n`;
    fs.writeFileSync(path.join(root, `playstore-assets/listing-${safeFileLocale(locale)}.md`), markdown);
    fs.writeFileSync(cachePath, JSON.stringify(cache));
}

for (let index = 0; index < locales.length; index += 4) {
    await Promise.all(locales.slice(index, index + 4).map(generateLocale));
}

const combinedReleaseNotes = locales
    .map((locale) => `<${locale}>\n${releaseNotesByLocale.get(locale) || ''}\n</${locale}>`)
    .join('\n\n');
fs.writeFileSync(
    path.join(root, 'playstore-assets/release-notes-1.0.10-138-all-locales.txt'),
    `${combinedReleaseNotes}\n`
);

const localeBootstrap = `(function () {
    'use strict';
    const supported = ${JSON.stringify(locales)};
    const fallback = 'en-US';
    const aliases = { he: 'iw', in: 'id', tl: 'fil' };
    const languageOf = (value) => String(value || '').toLowerCase().split('-')[0];
    const normalize = (value) => {
        const raw = String(value || '').trim().replace('_', '-');
        const language = languageOf(raw);
        return aliases[language] ? raw.replace(/^[^-]+/, aliases[language]) : raw;
    };
    const match = (value) => {
        const raw = normalize(value);
        const exact = supported.find((item) => item.toLowerCase() === raw.toLowerCase());
        if (exact) return exact;
        const language = languageOf(raw);
        const defaults = { en: 'en-US', es: 'es-419', pt: 'pt-BR', zh: 'zh-CN', fr: 'fr-FR', fa: 'fa', ms: 'ms' };
        return (defaults[language] && supported.includes(defaults[language]))
            ? defaults[language]
            : (supported.find((item) => languageOf(item) === language) || '');
    };
    try { localStorage.removeItem('vc_app_locale_v2'); } catch (_) {}
    let selected = '';
    const candidates = [];
    try {
        if (Array.isArray(navigator.languages)) candidates.push(...navigator.languages);
        candidates.push(navigator.language);
    } catch (_) {}
    for (const candidate of candidates) {
        selected = match(candidate);
        if (selected) break;
    }
    selected = selected || fallback;
    const load = (locale) => {
        try {
            const request = new XMLHttpRequest();
            request.open('GET', 'locales/' + encodeURIComponent(locale) + '.json', false);
            request.send(null);
            if (request.status === 0 || (request.status >= 200 && request.status < 300)) {
                return JSON.parse(request.responseText);
            }
        } catch (_) {}
        return null;
    };
    const selectedCatalog = load(selected);
    const fallbackCatalog = selected === fallback ? selectedCatalog : (!selectedCatalog ? load(fallback) : null);
    window.__VISOR_LOCALE_MANIFEST__ = supported.slice();
    window.__VISOR_LOCALE_CATALOGS__ = {};
    if (selectedCatalog) window.__VISOR_LOCALE_CATALOGS__[selected] = selectedCatalog;
    if (fallbackCatalog) window.__VISOR_LOCALE_CATALOGS__[fallback] = fallbackCatalog;
})();
`;
fs.writeFileSync(path.join(root, 'www/js/generated-locales.js'), localeBootstrap);
const localeXml = locales
    .map((locale) => locale)
    .map((locale) => `    <locale android:name="${locale}" />`)
    .join('\n');
fs.writeFileSync(path.join(root, 'android/app/src/main/res/xml/locales_config.xml'), `<?xml version="1.0" encoding="utf-8"?>\n<locale-config xmlns:android="http://schemas.android.com/apk/res/android">\n${localeXml}\n</locale-config>\n`);
fs.writeFileSync(cachePath, JSON.stringify(cache));

const report = {
    generatedAt: new Date().toISOString(),
    locales: locales.length,
    messageKeys: messageKeys.length,
    staticPhrases: phrases.length,
    fallback: 'en-US',
    rtl: ['ar', 'iw-IL', 'fa', 'fa-AE', 'fa-AF', 'fa-IR', 'ur']
};
fs.writeFileSync(path.join(root, 'playstore-assets/localization-report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
