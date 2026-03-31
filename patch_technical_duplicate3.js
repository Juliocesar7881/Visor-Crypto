const fs = require('fs');
let code = fs.readFileSync('www/js/technical.js', 'utf8');

const occurrences = [];
let idx = code.indexOf('CONFLUENCE SCORING SYSTEM');
while (idx !== -1) {
    occurrences.push(idx);
    idx = code.indexOf('CONFLUENCE SCORING SYSTEM', idx + 1);
}
console.log('Occurrences:', occurrences);

if (occurrences.length >= 2) {
    // We want to delete from the first occurrence line start, up to the second occurrence line start
    const startIdx = code.lastIndexOf('//', occurrences[0]);
    const endIdx = code.lastIndexOf('//', occurrences[1]);
    
    // go up one more line for endIdx to capture the === 
    let finalEndIdx = code.lastIndexOf('// ======');
    let realEndIdx = code.lastIndexOf('// ========', occurrences[1]);
    
    code = code.substring(0, startIdx) + code.substring(realEndIdx);
    fs.writeFileSync('www/js/technical.js', code);
    console.log('Deleted intermediate duplicate code');
}
