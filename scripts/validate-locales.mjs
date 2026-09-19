import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const source = fs.readFileSync(path.join(root, 'www/js/i18n.js'), 'utf8');

function extractLiteral(startMarker, endMarker) {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start + startMarker.length);
    if (start < 0 || end < 0) throw new Error(`Unable to extract ${startMarker}`);
    return source.slice(start + startMarker.length, end).trim();
}

const expectedLocales = Function(`"use strict"; return (${extractLiteral('const SUPPORTED =', ';\n    const RTL_LANGUAGES')});`)();
const baseMessages = Function(`"use strict"; return (${extractLiteral('const BASE_MESSAGES =', ';\n\n    function languageOf')});`)();
const catalogs = {};
for (const locale of expectedLocales) {
    const file = path.join(root, 'www/locales', `${locale}.json`);
    if (!fs.existsSync(file)) continue;
    try { catalogs[locale] = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
}
const errors = [];

function androidQualifier(locale) {
    const [language, region] = locale.split('-');
    if (!region) return `values-${language}`;
    if (/^\d+$/.test(region)) return `values-b+${language}+${region}`;
    return `values-${language}-r${region}`;
}
function containsForbidden(value) {
    const text = String(value || '');
    return /\[object Object\]/i.test(text)
        || /(^|[^\p{L}\p{N}_])(?:undefined|NaN)(?=$|[^\p{L}\p{N}_])/iu.test(text);
}

function placeholders(value) {
    return [...String(value || '').matchAll(/\{[a-zA-Z0-9_]+\}|%\d+\$[a-z]|%%/g)].map((match) => match[0]).sort();
}

for (const locale of expectedLocales) {
    const catalog = catalogs[locale];
    if (!catalog) { errors.push(`${locale}: missing web catalog`); continue; }
    for (const [key, baseValue] of Object.entries(baseMessages)) {
        const translated = catalog.messages?.[key];
        if (!translated || containsForbidden(translated)) errors.push(`${locale}.${key}: invalid translation`);
        if (JSON.stringify(placeholders(baseValue)) !== JSON.stringify(placeholders(translated))) {
            errors.push(`${locale}.${key}: placeholder mismatch`);
        }
    }
    for (const [sourcePhrase, translatedPhrase] of Object.entries(catalog.phrases || {})) {
        if (!translatedPhrase || containsForbidden(translatedPhrase)) {
            errors.push(`${locale}: invalid phrase translation for ${sourcePhrase.slice(0, 60)}`);
            continue;
        }
        if (JSON.stringify(placeholders(sourcePhrase)) !== JSON.stringify(placeholders(translatedPhrase))) {
            errors.push(`${locale}: phrase placeholder mismatch for ${sourcePhrase.slice(0, 60)}`);
        }
    }
    const listingDir = path.join(root, 'playstore-assets/listings', locale);
    for (const file of ['title.txt', 'short-description.txt', 'full-description.txt', 'release-notes-136.txt']) {
        if (!fs.existsSync(path.join(listingDir, file))) errors.push(`${locale}: missing ${file}`);
    }
    if (fs.existsSync(path.join(listingDir, 'title.txt')) && fs.readFileSync(path.join(listingDir, 'title.txt'), 'utf8').trim().length > 30) {
        errors.push(`${locale}: title exceeds 30 characters`);
    }
    if (fs.existsSync(path.join(listingDir, 'short-description.txt')) && fs.readFileSync(path.join(listingDir, 'short-description.txt'), 'utf8').trim().length > 80) {
        errors.push(`${locale}: short description exceeds 80 characters`);
    }
    if (fs.existsSync(path.join(listingDir, 'full-description.txt')) && fs.readFileSync(path.join(listingDir, 'full-description.txt'), 'utf8').trim().length > 4000) {
        errors.push(`${locale}: full description exceeds 4000 characters`);
    }
    if (fs.existsSync(path.join(listingDir, 'release-notes-136.txt')) && fs.readFileSync(path.join(listingDir, 'release-notes-136.txt'), 'utf8').trim().length > 500) {
        errors.push(`${locale}: release notes exceed 500 characters`);
    }

    const androidStringsFile = path.join(root, 'android/app/src/main/res', androidQualifier(locale), 'strings.xml');
    if (!fs.existsSync(androidStringsFile)) {
        errors.push(`${locale}: missing Android strings`);
    } else {
        const androidStrings = fs.readFileSync(androidStringsFile, 'utf8');
        const body = androidStrings.match(/<string name="signal_notification_body">([\s\S]*?)<\/string>/)?.[1] || '';
        if ((body.match(/%1\$d/g) || []).length !== 1 || body.includes('%%1$d') || body.includes('{value}')) {
            errors.push(`${locale}: invalid Android notification confidence placeholder`);
        }
        if (!androidStrings.includes('<string name="signal_notification_title">%1$s - %2$s</string>')) {
            errors.push(`${locale}: invalid Android notification title placeholders`);
        }
        if (/name="(?:app_name|title_activity_main)"/.test(androidStrings)) {
            errors.push(`${locale}: brand strings must only exist in base resources`);
        }
    }
}

const localeConfig = fs.readFileSync(path.join(root, 'android/app/src/main/res/xml/locales_config.xml'), 'utf8');
for (const locale of expectedLocales) {
    if (!localeConfig.includes(`android:name="${locale}"`)) errors.push(`${locale}: missing Android locale config`);
}

const baseAndroidStrings = fs.readFileSync(path.join(root, 'android/app/src/main/res/values/strings.xml'), 'utf8');
for (const key of ['app_name', 'title_activity_main']) {
    if (!new RegExp(`<string name="${key}" translatable="false">`).test(baseAndroidStrings)) {
        errors.push(`base Android string ${key} must be non-translatable`);
    }
}

const androidResourcesRoot = path.join(root, 'android/app/src/main/res');
for (const entry of fs.readdirSync(androidResourcesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith('values-')) continue;
    const stringsFile = path.join(androidResourcesRoot, entry.name, 'strings.xml');
    if (!fs.existsSync(stringsFile)) continue;
    const localizedStrings = fs.readFileSync(stringsFile, 'utf8');
    if (/name="(?:app_name|title_activity_main)"/.test(localizedStrings)) {
        errors.push(`${entry.name}: non-translatable base configuration found in localized resources`);
    }
}

if (Object.keys(catalogs).length !== expectedLocales.length) {
    errors.push(`catalog count ${Object.keys(catalogs).length}, expected ${expectedLocales.length}`);
}

if (errors.length) {
    console.error(errors.slice(0, 100).join('\n'));
    console.error(`Localization validation failed with ${errors.length} error(s).`);
    process.exit(1);
}

console.log(`Localization OK: ${expectedLocales.length} locales, ${Object.keys(baseMessages).length} structured messages each.`);
