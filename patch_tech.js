
const fs = require('fs');
let cnt = fs.readFileSync('www/js/technical.js', 'utf8');

cnt = cnt.replace(/x\/g, '??'); // That's a backtick breaking the template literal!
cnt = cnt.replace(/xa/g, '?');
cnt = cnt.replace(/x/g, '??');
cnt = cnt.replace(/<span style=\ont-size: 18px;\>.*<\/span>/g, '<span style=\'font-size: 18px;\'>??</span>');

fs.writeFileSync('www/js/technical.js', cnt, 'utf8');

