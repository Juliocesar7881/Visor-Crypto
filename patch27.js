const fs = require('fs');
let code = fs.readFileSync('www/js/technical.js', 'utf8');

code = code.replace(
    'const adx4h = calculateADX(klines4h) || { adx: 0, plusDI: 0, minusDI: 0 };',
    `const adx4h = calculateADX(klines4h) || { adx: 0, plusDI: 0, minusDI: 0 };
            const netVolume1h = calculateNetVolume(klines1h) || { delta: 0, ratio: 0, total: 0 };
            const netVolume4h = calculateNetVolume(klines4h) || { delta: 0, ratio: 0, total: 0 };`
);

fs.writeFileSync('www/js/technical.js', code);
console.log('patched net volume');