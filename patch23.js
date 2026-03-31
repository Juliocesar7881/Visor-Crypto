const fs = require('fs');
let code = fs.readFileSync('www/js/technical.js', 'utf8');

// fix missing variables
code = code.replace(
    /const macd1h = calculateMACD\(klines1h\).*;/g,
    ''
);
code = code.replace(
    /const macd4h = calculateMACD\(klines4h\).*;/g,
    ''
);
code = code.replace(
    /const vwap = calculateVWAP\(klines15m\).*;/g,
    ''
);

code = code.replace(
    'const rsi4h = calculateRSI(klines4h);',
    `const rsi4h = calculateRSI(klines4h);
            const macd1h = calculateMACD(klines1h) || { histogram: 0, macd: 0, signal: 0 };
            const macd4h = calculateMACD(klines4h) || { histogram: 0, macd: 0, signal: 0 };
            const vwap = calculateVWAP(klines15m) || currentPrice;
            const adx1h = calculateADX(klines1h) || { adx: 0, plusDI: 0, minusDI: 0 };
            const adx4h = calculateADX(klines4h) || { adx: 0, plusDI: 0, minusDI: 0 };`
);

fs.writeFileSync('www/js/technical.js', code);
console.log('patched');