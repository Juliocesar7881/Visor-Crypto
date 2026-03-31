
const fs = require('fs');
let code = fs.readFileSync('www/js/technical.js', 'utf8');

const sandbox = {
    window: {},
    document: {},
    console: console
};

try {
    const fn = new Function('window', 'document', 'console', code);
    fn(sandbox.window, sandbox.document, sandbox.console);
    console.log('No top level errors in technical.js');
} catch (e) {
    console.log('Error parsing technical.js:', e);
}

