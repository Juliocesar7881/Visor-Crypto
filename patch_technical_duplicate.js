const fs = require('fs');
let code = fs.readFileSync('www/js/technical.js', 'utf8');

const startIndex = code.indexOf('// CONFLUENCE SCORING SYSTEM (Gradient Gradual)');
const endIndex = code.indexOf('// CONFLUENCE SCORING SYSTEM (Gradient — sem thresholds binários)');

if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
    const startToKeep = code.substring(0, startIndex);
    const endToKeep = code.substring(endIndex);
    code = startToKeep + endToKeep;
    fs.writeFileSync('www/js/technical.js', code);
    console.log('Removed duplicate block');
} else {
    // Try the other encoding for the end block
    const altEndIndex = code.indexOf('sem thresholds bin');
    const fullLineIndex = code.lastIndexOf('// ================================', altEndIndex);
    if (startIndex !== -1 && fullLineIndex !== -1 && fullLineIndex > startIndex) {
         const startToKeep = code.substring(0, startIndex);
         const endToKeep = code.substring(fullLineIndex + 36);
         code = startToKeep + endToKeep.replace(/^\s*\n/g, '');
         fs.writeFileSync('www/js/technical.js', code);
         console.log('Removed duplicate block using alt encoding');
    } else {
         console.log('Could not find boundaries');
    }
}
