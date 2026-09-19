import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', 'www');
const files = [];

function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) walk(fullPath);
        else if (entry.isFile() && entry.name.endsWith('.js') && entry.name !== 'generated-locales.js') files.push(fullPath);
    }
}

walk(root);
let replacements = 0;
for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    let next = source.replace(/\.toLocale(DateString|TimeString|String)\((['"])pt-BR\2/g, (_, method) => {
        replacements++;
        return `.toLocale${method}(window.VisorI18n?.getLocale?.() || 'en-US'`;
    });
    next = next.replace(/new Intl\.(DateTimeFormat|NumberFormat)\((['"])pt-BR\2/g, (_, formatter) => {
        replacements++;
        return `new Intl.${formatter}(window.VisorI18n?.getLocale?.() || 'en-US'`;
    });
    if (next !== source) fs.writeFileSync(file, next);
}

console.log(`Updated ${replacements} locale-bound formatter call(s).`);
