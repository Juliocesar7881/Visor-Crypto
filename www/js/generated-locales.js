(function () {
    'use strict';
    const supported = ["af","sq","am","ar","hy-AM","az-AZ","bn-BD","eu-ES","be","bg","my-MM","ca","zh-HK","zh-CN","zh-TW","hr","cs-CZ","da-DK","nl-NL","en-AU","en-CA","en-US","en-GB","en-IN","en-SG","en-ZA","et","fil","fi-FI","fr-CA","fr-FR","gl-ES","ka-GE","de-DE","el-GR","gu","iw-IL","hi-IN","hu-HU","is-IS","id","it-IT","ja-JP","kn-IN","kk","km-KH","ko-KR","ky-KG","lo-LA","lv","lt","mk-MK","ms-MY","ms","ml-IN","mr-IN","mn-MN","ne-NP","no-NO","fa","fa-AE","fa-AF","fa-IR","pl-PL","pt-BR","pt-PT","pa","ro","rm","ru-RU","sr","si-LK","sk","sl","es-419","es-ES","es-US","sw","sv-SE","ta-IN","te-IN","th","tr-TR","uk","ur","vi","zu"];
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
