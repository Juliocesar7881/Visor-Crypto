const fs = require('fs');
let s = fs.readFileSync('../www/js/technical.iter2.js', 'utf8');
const replacements = new Map([
  ['â€¢', '-'],
  ['âš ï¸', '[ALERTA]'],
  ['â³', 'NEUTRO'],
  ['â–²', '▲'],
  ['â”', '-'],
  ['âœ…', 'OK'],
  ['âŒ', 'X'],
  ['â€”', '-'],
  ['ÃŠ', 'Ê'],
  ['Ã‡', 'Ç'],
  ['Ãš', 'Ú'],
  ['Ã´', 'ô'],
  ['Ã“', 'Ó'],
  ['Ã', 'Í'],
  ['Ã•', 'Õ']
]);
for (const [from, to] of replacements.entries()) {
  s = s.split(from).join(to);
}
// Remove remaining emoji mojibake tokens like ðŸ...
s = s.replace(/ðŸ[^\s"'<>\)\]\}]+/g, '');
// Remove leftover â-encoded bullet/symbol fragments
s = s.replace(/â[^\s"'<>\)\]\}]+/g, '');
fs.writeFileSync('../www/js/technical.clean.js', s, 'utf8');
console.log('counts', {
  A: (s.match(/Ã/g) || []).length,
  B: (s.match(/Â/g) || []).length,
  a: (s.match(/â/g) || []).length,
  d: (s.match(/ð/g) || []).length,
  r: (s.match(/�/g) || []).length
});
try {
  new Function(s);
  console.log('syntax ok');
} catch (e) {
  console.log('syntax err', e.message);
}
