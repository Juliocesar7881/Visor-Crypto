
const fs = require('fs');
let code = fs.readFileSync('www/js/technical.js', 'utf8');

// fix missing variables
code = code.replace(
    'const rsi4h = calculateRSI(klines4h);',
    \const rsi4h = calculateRSI(klines4h);
            const macd1h = calculateMACD(klines1h) || { histogram: 0, macd: 0, signal: 0 };
            const macd4h = calculateMACD(klines4h) || { histogram: 0, macd: 0, signal: 0 };
            const vwap = calculateVWAP(klines15m) || currentPrice;\
);

fs.writeFileSync('www/js/technical.js', code);
console.log('patched');

