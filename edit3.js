
const fs = require('fs');
let content = fs.readFileSync('www/js/technical.js', 'utf8');

content = content.replace(/, confian[^\n]*\n/, ', e confiança final.\n');

fs.writeFileSync('www/js/technical.js', content, 'utf8');
console.log('Edit 3 complete.');

