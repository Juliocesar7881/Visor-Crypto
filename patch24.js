const fs = require('fs');
let code = fs.readFileSync('www/js/technical.js', 'utf8');

code = code.replace(
    'const adx4h = calculateADX(klines4h) || { adx: 0, plusDI: 0, minusDI: 0 };',
    `const adx4h = calculateADX(klines4h) || { adx: 0, plusDI: 0, minusDI: 0 };
            const stoch1h = calculateStochastic(klines1h) || { k: 50, d: 50 };
            const stoch4h = calculateStochastic(klines4h) || { k: 50, d: 50 };
            const bb1h = calculateBollingerBands(klines1h) || { upper: 0, lower: 0, middle: 0 };
            const bb4h = calculateBollingerBands(klines4h) || { upper: 0, lower: 0, middle: 0 };
            const volumeProfile = calculateVolumeProfile(klines15m, currentPrice) || { poc: currentPrice, vah: currentPrice, val: currentPrice, vwap: currentPrice, priceLocation: 'inside' };`
);

fs.writeFileSync('www/js/technical.js', code);
console.log('patched24');