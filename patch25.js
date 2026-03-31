const fs = require('fs');
let code = fs.readFileSync('www/js/technical.js', 'utf8');

code = code.replace(
    /const volumeProfile = calculateVolumeProfile\(klines15m, currentPrice\) \|\| \{ poc: currentPrice, vah: currentPrice, val: currentPrice, vwap: currentPrice, priceLocation: 'inside' \};/,
    ""
);

fs.writeFileSync('www/js/technical.js', code);
console.log('removed duplicate');