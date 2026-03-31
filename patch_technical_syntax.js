const fs = require('fs');
let code = fs.readFileSync('www/js/technical.js', 'utf8');
code = code.replace(/\n\s*================================\n/g, '\n            // ================================\n');
fs.writeFileSync('www/js/technical.js', code);
console.log('Fixed syntax error in technical.js');
