
const fs = require('fs');
let code = fs.readFileSync('www/js/technical.js', 'utf8');

// Fix stoch1h and stoch4h missing definitions
if (!code.includes('const stoch1h = calculateStochastic(klines1h)')) {
    code = code.replace(
        'const netVolume4h = calculateNetVolume(klines4h) || { delta: 0, ratio: 0, total: 0 };',
        \const netVolume4h = calculateNetVolume(klines4h) || { delta: 0, ratio: 0, total: 0 };
            const stoch1h = calculateStochastic(klines1h) || { k: 50, d: 50 };
            const stoch4h = calculateStochastic(klines4h) || { k: 50, d: 50 };\
    );
}

// Fix calculateBollingerBands
code = code.replace(
    /const bb1h = calculateBollingerBands\(klines1h, 20, 2\);/g,
    'const bb1h = (window.TAEngineV2 && window.TAEngineV2.calculateBollingerBands) ? window.TAEngineV2.calculateBollingerBands(klines1h, 20, 2) : null;'
);

fs.writeFileSync('www/js/technical.js', code);
console.log('Finals patched');

