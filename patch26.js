const fs = require('fs');
let code = fs.readFileSync('www/js/technical.js', 'utf8');

code = code.replace(
    /const bb1h = calculateBollingerBands\(klines1h\) \|\| \{ upper: 0, lower: 0, middle: 0 \};\n/g,
    ""
);
code = code.replace(
    /const bb4h = calculateBollingerBands\(klines4h\) \|\| \{ upper: 0, lower: 0, middle: 0 \};\n/g,
    ""
);


fs.writeFileSync('www/js/technical.js', code);
console.log('removed bb duplicate');