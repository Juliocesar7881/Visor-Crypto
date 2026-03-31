const fs = require('fs');
let code = fs.readFileSync('www/js/technical.js', 'utf8');

const startIndex = code.indexOf('// CONFLUENCE SCORING SYSTEM (Gradient Gradual)');
const altEndIndex = code.indexOf('sem thresholds bin');
console.log(startIndex, altEndIndex);

if (startIndex !== -1 && altEndIndex !== -1) {
    const endBlockStart = code.lastIndexOf('// =================', altEndIndex);
    console.log("endBlockStart:", endBlockStart);
    if (endBlockStart > startIndex) {
        code = code.substring(0, startIndex) + code.substring(endBlockStart);
        fs.writeFileSync('www/js/technical.js', code);
        console.log('Fixed');
    }
}
