const fs = require('fs');
let code = fs.readFileSync('www/js/navigation.js', 'utf8');

code = code.replace(/if \(sectionId === 'macro'\) \{\s*if \(window\.loadMacroData\) \{\s*Promise\.resolve\(window\.loadMacroData\(\)\)\.catch\(\(\) => \{\}\);\s*\}\s*\}/g,
`if (sectionId === 'macro') {
                if (window.loadMacroData) {
                    Promise.resolve(window.loadMacroData()).then(() => {
                        if (window.updateAllIndicators) {
                            setTimeout(() => window.updateAllIndicators(), 50);
                        }
                    }).catch(() => {});
                }
            }`);

fs.writeFileSync('www/js/navigation.js', code);
console.log('navigation.js patched');
