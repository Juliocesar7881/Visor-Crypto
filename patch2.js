
const fs = require('fs');
let text = fs.readFileSync('www/js/technical.js', 'utf8');
const lines = text.split('\n');
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('font-size: 18px;')) {
        lines[i] = lines[i].replace(/\/g, '');
        lines[i] = lines[i].replace(/x/g, '??');
    }
}
fs.writeFileSync('www/js/technical.js', lines.join('\n'), 'utf8');

