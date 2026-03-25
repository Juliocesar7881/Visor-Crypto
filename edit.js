
const fs = require('fs');
let content = fs.readFileSync('www/js/technical.js', 'utf8');

content = content.replace(/, a confian[^\n]*\n/, '\n');
content = content.replace(/- A pro[^\n]*\n/, '- NUNCA mencione probabilidade, apenas a Confiança.\n');

fs.writeFileSync('www/js/technical.js', content, 'utf8');
console.log('Edit 2 complete.');

