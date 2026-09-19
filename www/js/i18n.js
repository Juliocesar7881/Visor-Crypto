(function () {
    'use strict';

    const LEGACY_STORAGE_KEY = 'vc_app_locale_v2';
    const SYSTEM = 'system';
    const FALLBACK = 'en-US';
    const SUPPORTED = [
        'af', 'sq', 'am', 'ar', 'hy-AM', 'az-AZ', 'bn-BD', 'eu-ES', 'be', 'bg', 'my-MM', 'ca',
        'zh-HK', 'zh-CN', 'zh-TW', 'hr', 'cs-CZ', 'da-DK', 'nl-NL', 'en-AU', 'en-CA', 'en-US',
        'en-GB', 'en-IN', 'en-SG', 'en-ZA', 'et', 'fil', 'fi-FI', 'fr-CA', 'fr-FR', 'gl-ES',
        'ka-GE', 'de-DE', 'el-GR', 'gu', 'iw-IL', 'hi-IN', 'hu-HU', 'is-IS', 'id', 'it-IT',
        'ja-JP', 'kn-IN', 'kk', 'km-KH', 'ko-KR', 'ky-KG', 'lo-LA', 'lv', 'lt', 'mk-MK',
        'ms-MY', 'ms', 'ml-IN', 'mr-IN', 'mn-MN', 'ne-NP', 'no-NO', 'fa', 'fa-AE', 'fa-AF',
        'fa-IR', 'pl-PL', 'pt-BR', 'pt-PT', 'pa', 'ro', 'rm', 'ru-RU', 'sr', 'si-LK', 'sk',
        'sl', 'es-419', 'es-ES', 'es-US', 'sw', 'sv-SE', 'ta-IN', 'te-IN', 'th', 'tr-TR',
        'uk', 'ur', 'vi', 'zu'
    ];
    const RTL_LANGUAGES = new Set(['ar', 'fa', 'he', 'iw', 'ur']);
    const CATALOGS = window.__VISOR_LOCALE_CATALOGS__ || {};
    const BASE_MESSAGES = {
        appTitle: 'Visor Crypto: Bitcoin, crypto signals and market news',
        description: 'Visor Crypto tracks Bitcoin, altcoins, crypto signals, filtered news, technical analysis and macro indicators in real time.',
        navHome: 'Home', navSignals: 'Signals', navNews: 'News', navMacro: 'Macro', navAnalysis: 'Analysis',
        newsAll: 'All', newsPositive: 'Positive', newsNegative: 'Negative', newsHot: 'Relevant',
        macroFedWatch: 'Fed Watch', macroCalendar: 'Calendar', macroIndicators: 'Indicators',
        currentFedRate: 'Current Interest Rate (Fed Funds)', effectiveFedRate: 'Effective Rate (Fed Funds)',
        nextFomcLoading: 'Next FOMC meeting: Loading...', fedProbabilitiesTitle: 'Next Meeting Probabilities',
        fedWatchAbout: 'What is Fed Watch?', calendarTitle: 'US Calendar - Next 30 days',
        marketIndicators: 'Market Indicators', cryptoCorrelations: 'Crypto Correlations',
        monitorActive: 'Active', monitorSyncing: 'Syncing', monitorNoPermission: 'No permission',
        monitorOffline: 'Connection unavailable', monitorInactive: 'Inactive',
        monitorDetail: '{count} crypto assets · FCM alerts + 15 min recovery checks',
        monitorEnableHint: 'Enable to receive trading signals',
        monitorAndroidRestricted: 'Monitoring may be restricted by Android',
        forceStopWarning: 'Android Force stop blocks alerts until you open the app again.',
        activeSignals: 'Active Signals', confidenceTitle: 'Analysis Confidence', callsHistory: 'Call History',
        settings: 'Settings', globalConfidence: 'Global minimum confidence', perCrypto: 'Per Crypto',
        noActiveSignal: 'No active signal', noActiveSignalDesc: 'Signals appear when a setup is confirmed by the S6 engine.',
        noHistory: 'No history yet', noHistoryDesc: 'Confirmed calls will appear here automatically.',
        all: 'All', loading: 'Loading...', loadingSignals: 'Updating signals...', syncing: 'Syncing...',
        updatedNow: 'Updated now', temporarilyUnavailable: 'Temporarily unavailable',
        openOriginalNews: 'Open Original News', chartHigh: 'High', chartLow: 'Low', chartChange: 'Change',
        chartVolume: 'Volume', fullscreenTitle: 'Fullscreen', technicalAnalysis: 'Technical Analysis',
        realTimeAI: 'AI · Real Time · Multi-TF', notifications: 'Notifications',
        receiveSignalAlerts: 'Receive signal alerts', alertMinimumConfidence: 'Minimum confidence for alerts',
        alertDescription: 'Push notifications when a strong signal appears', language: 'Language',
        languageDescription: 'Interface and native notifications', systemDefault: 'System default',
        adPrivacyOptions: 'Ad privacy options', adPrivacyDescription: 'Review your consent choices',
        signalChannelName: 'Trading signals',
        signalChannelDescription: 'Confirmed LONG and SHORT signal alerts',
        longLabel: 'Long', shortLabel: 'Short', neutralLabel: 'Neutral', totalLabel: 'Total',
        accuracyLabel: 'Accuracy', todayLabel: 'Today', signalCount: '{count} signals',
        confidenceNotification: 'Confidence: {value}%', marketClosed: 'Market closed',
        loadingData: 'Loading data...', unavailableData: 'Data temporarily unavailable',
        insufficientData: 'Insufficient data for analysis', lastUpdated: 'Last updated: {time}',
        timeMinute: '1 minute', timeMinutes: '{count} minutes', timeHour: '1 hour',
        timeHours: '{count} hours', timeDays: '{count} days', timeMonth: '1 month',
        timeMonths: '{count} months', timeYear: '1 year'
    };

    function languageOf(locale) {
        return String(locale || '').toLowerCase().split('-')[0];
    }

    function canonicalAlias(raw) {
        const value = String(raw || '').trim().replace('_', '-');
        if (!value) return '';
        if (/^he(?:-|$)/i.test(value)) return value.replace(/^he/i, 'iw');
        if (/^in(?:-|$)/i.test(value)) return value.replace(/^in/i, 'id');
        if (/^tl(?:-|$)/i.test(value)) return value.replace(/^tl/i, 'fil');
        return value;
    }

    function matchSupportedLocale(raw) {
        const value = canonicalAlias(raw);
        if (!value) return null;
        const exact = SUPPORTED.find((locale) => locale.toLowerCase() === value.toLowerCase());
        if (exact) return exact;
        const lang = languageOf(value);
        const sameLanguage = SUPPORTED.filter((locale) => languageOf(locale) === lang);
        if (!sameLanguage.length) return null;
        const preferredDefaults = { en: 'en-US', es: 'es-419', pt: 'pt-BR', zh: 'zh-CN', fr: 'fr-FR', fa: 'fa', ms: 'ms' };
        return preferredDefaults[lang] && sameLanguage.includes(preferredDefaults[lang])
            ? preferredDefaults[lang]
            : sameLanguage[0];
    }

    function getPreference() {
        return SYSTEM;
    }

    function getSystemLocale() {
        const candidates = [];
        try {
            if (Array.isArray(navigator.languages)) candidates.push(...navigator.languages);
            candidates.push(navigator.language, navigator.userLanguage);
        } catch (_) {}
        for (const candidate of candidates) {
            const matched = matchSupportedLocale(candidate);
            if (matched) return matched;
        }
        return FALLBACK;
    }

    function getLocale() {
        return getSystemLocale();
    }

    function catalogFor(locale = getLocale()) {
        return CATALOGS[locale] || CATALOGS[matchSupportedLocale(locale)] || CATALOGS[FALLBACK] || {};
    }

    function interpolate(value, params) {
        return String(value == null ? '' : value).replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => {
            return params && Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : `{${key}}`;
        });
    }

    function t(key, params) {
        const catalog = catalogFor();
        return interpolate((catalog.messages && catalog.messages[key]) || BASE_MESSAGES[key] || key, params);
    }

    function setNodeText(node, value) {
        if (!node) return;
        if (!node.children || node.children.length === 0) { node.textContent = value; return; }
        const textNode = Array.from(node.childNodes).find((child) => child.nodeType === Node.TEXT_NODE && child.textContent.trim());
        if (textNode) textNode.textContent = ` ${value}`;
        else node.appendChild(document.createTextNode(` ${value}`));
    }

    function setText(selector, key, params) {
        document.querySelectorAll(selector).forEach((node) => setNodeText(node, t(key, params)));
    }

    function setIndexedText(selector, index, key) {
        const node = document.querySelectorAll(selector)[index];
        if (node) setNodeText(node, t(key));
    }

    function setAttr(selector, attr, key) {
        document.querySelectorAll(selector).forEach((node) => node.setAttribute(attr, t(key)));
    }

    const CP1252_BYTES = new Map([
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
                    else if (CP1252_BYTES.has(character)) bytes.push(CP1252_BYTES.get(character));
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

    function translateLiteral(raw) {
        const value = String(raw || '');
        const trimmed = value.replace(/\s+/g, ' ').trim();
        if (!trimmed) return value;
        const repaired = repairMojibake(trimmed);
        const phrases = catalogFor().phrases || {};
        let translated = phrases[trimmed] || phrases[repaired];
        if (!translated) {
            const patterns = getPhrasePatterns();
            for (const pattern of patterns) {
                const match = repaired.match(pattern.regex);
                if (!match) continue;
                const captured = {};
                pattern.placeholders.forEach((name, index) => { captured[name] = match[index + 1]; });
                translated = String(pattern.translation).replace(/\{([a-zA-Z0-9_]+)\}/g, (_, name) => captured[name] ?? `{${name}}`);
                break;
            }
        }
        if (!translated) translated = repaired !== trimmed ? repaired : '';
        if (!translated || translated === trimmed) return value;
        const leading = value.match(/^\s*/)?.[0] || '';
        const trailing = value.match(/\s*$/)?.[0] || '';
        return `${leading}${translated}${trailing}`;
    }

    let phrasePatternCache = { locale: '', patterns: [] };
    function getPhrasePatterns() {
        const locale = getLocale();
        if (phrasePatternCache.locale === locale) return phrasePatternCache.patterns;
        const phrases = catalogFor(locale).phrases || {};
        const patterns = [];
        Object.entries(phrases).forEach(([source, translation]) => {
            if (!/\{[a-zA-Z0-9_]+\}/.test(source)) return;
            const placeholders = [];
            let cursor = 0;
            let expression = '^';
            for (const match of source.matchAll(/\{([a-zA-Z0-9_]+)\}/g)) {
                expression += source.slice(cursor, match.index).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                expression += '(.+?)';
                placeholders.push(match[1]);
                cursor = match.index + match[0].length;
            }
            expression += source.slice(cursor).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$';
            try { patterns.push({ regex: new RegExp(expression, 'i'), placeholders, translation }); } catch (_) {}
        });
        phrasePatternCache = { locale, patterns };
        return patterns;
    }

    function translateTree(root) {
        if (!root || typeof document === 'undefined') return;
        const blocked = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'CANVAS', 'CODE', 'PRE']);
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        nodes.forEach((node) => {
            const parent = node.parentElement;
            if (!parent || blocked.has(parent.tagName) || parent.closest('[data-i18n-skip="true"]')) return;
            const next = translateLiteral(node.nodeValue);
            if (next !== node.nodeValue) node.nodeValue = next;
        });
        if (root.querySelectorAll) {
            root.querySelectorAll('[title], [placeholder], [aria-label]').forEach((element) => {
                ['title', 'placeholder', 'aria-label'].forEach((attr) => {
                    if (!element.hasAttribute(attr)) return;
                    const current = element.getAttribute(attr);
                    const next = translateLiteral(current);
                    if (next !== current) element.setAttribute(attr, next.trim());
                });
            });
        }
    }

    function applyTranslations() {
        if (typeof document === 'undefined') return;
        const locale = getLocale();
        const rtl = RTL_LANGUAGES.has(languageOf(locale));
        document.documentElement.lang = locale.replace(/^iw-/, 'he-');
        document.documentElement.dir = rtl ? 'rtl' : 'ltr';
        document.body?.classList.toggle('is-rtl', rtl);
        document.title = t('appTitle');
        setAttr('meta[name="description"]', 'content', 'description');
        setAttr('meta[property="og:title"], meta[name="twitter:title"]', 'content', 'appTitle');
        setAttr('meta[property="og:description"], meta[name="twitter:description"]', 'content', 'description');
        setText('.nav-item[data-section="home"] span', 'navHome');
        setText('.nav-item[data-section="dashboard"] span', 'navSignals');
        setText('.nav-item[data-section="news"] span', 'navNews');
        setText('.nav-item[data-section="macro"] span', 'navMacro');
        setText('.nav-item[data-section="analysis"] span', 'navAnalysis');
        setText('.news-filter[data-filter="all"]', 'newsAll');
        setText('.news-filter[data-filter="positive"]', 'newsPositive');
        setText('.news-filter[data-filter="negative"]', 'newsNegative');
        setText('.news-filter[data-filter="hot"]', 'newsHot');
        setText('.macro-tab[onclick*="fedwatch"] span', 'macroFedWatch');
        setText('.macro-tab[onclick*="calendar"] span', 'macroCalendar');
        setText('.macro-tab[onclick*="indicators"] span', 'macroIndicators');
        setText('.fed-current-rate > div:first-child .fed-rate-label', 'currentFedRate');
        setText('.fed-current-rate > div:last-child .fed-rate-label', 'effectiveFedRate');
        setText('#next-fomc-meeting', 'nextFomcLoading');
        setIndexedText('#panel-fedwatch .card-header .card-title', 0, 'fedProbabilitiesTitle');
        setIndexedText('#panel-fedwatch .card-header .card-title', 1, 'fedWatchAbout');
        setText('#panel-calendar .card-title', 'calendarTitle');
        setIndexedText('#panel-indicators .card-title', 0, 'marketIndicators');
        setIndexedText('#panel-indicators .card-title', 1, 'cryptoCorrelations');
        setIndexedText('#dashboard .dash-section-title', 0, 'activeSignals');
        setIndexedText('#dashboard .dash-section-title', 1, 'confidenceTitle');
        setIndexedText('#dashboard .dash-section-title', 2, 'callsHistory');
        setIndexedText('#dashboard .dash-section-title', 3, 'settings');
        setText('#dash-signal-settings-card .global-confidence-label', 'globalConfidence');
        setText('#dash-signal-settings-card .per-crypto-label', 'perCrypto');
        setText('#news-modal-button', 'openOriginalNews');
        setAttr('.fullscreen-chart-btn', 'title', 'fullscreenTitle');
        document.querySelectorAll('[data-i18n]').forEach((node) => {
            const key = node.getAttribute('data-i18n');
            if (key) setNodeText(node, t(key));
        });
        translateTree(document.body);
    }

    async function syncNativeLocale(preference) {
        try {
            const plugin = window?.Capacitor?.Plugins?.BackgroundScan;
            if (plugin && typeof plugin.setLocale === 'function') await plugin.setLocale({ locale: preference });
        } catch (_) {}
    }

    function formatNumber(value, options) {
        const number = Number(value);
        if (!Number.isFinite(number)) return t('temporarilyUnavailable');
        try { return new Intl.NumberFormat(getLocale().replace(/^iw-/, 'he-'), options || {}).format(number); }
        catch (_) { return String(number); }
    }

    function formatDate(value, options) {
        const date = value instanceof Date ? value : new Date(value);
        if (!Number.isFinite(date.getTime())) return t('temporarilyUnavailable');
        try { return new Intl.DateTimeFormat(getLocale().replace(/^iw-/, 'he-'), options || {}).format(date); }
        catch (_) { return date.toISOString(); }
    }

    window.VisorI18n = {
        locales: SUPPORTED.slice(), fallback: FALLBACK, getPreference, getLocale,
        matchLocale: matchSupportedLocale,
        isRTL: () => RTL_LANGUAGES.has(languageOf(getLocale())),
        t, apply: applyTranslations, translateTree, formatNumber, formatDate
    };

    document.addEventListener('DOMContentLoaded', () => {
        try { localStorage.removeItem(LEGACY_STORAGE_KEY); } catch (_) {}
        applyTranslations();
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => mutation.addedNodes.forEach((node) => {
                if (node.nodeType === Node.ELEMENT_NODE) translateTree(node);
                else if (node.nodeType === Node.TEXT_NODE && node.parentElement) {
                    const next = translateLiteral(node.nodeValue);
                    if (next !== node.nodeValue) node.nodeValue = next;
                }
            }));
        });
        if (document.body) observer.observe(document.body, { childList: true, subtree: true });
        syncNativeLocale(SYSTEM);
    });
})();
