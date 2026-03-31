const fs = require('fs');
const p = '../www/js/technical.js';
let s = fs.readFileSync(p, 'utf8');
const pairs = [
  ['\u008f', ''],
  ['NÍO', 'NÃO'],
  ['[ALERTA]', '⚠️'],
  ['-€', '—'],
  ['RESISTÃŠNCIA', 'RESISTÊNCIA'],
  ['ABSORÃ‡ÃO', 'ABSORÇÃO'],
  ['ANÁLISE AVANÃ‡ADA', 'ANÁLISE AVANÇADA'],
  ['LIQUIDAÃ‡Ã•ES', 'LIQUIDAÇÕES'],
  ['LIQUIDAÃ‡ÃO', 'LIQUIDAÇÃO'],
  ['DETECÃ‡ÃO', 'DETECÇÃO'],
  ['DIVERGÃŠNCIA', 'DIVERGÊNCIA'],
  ['INÃCIO', 'INÍCIO'],
  ['CONSOLIDAÃ‡ÃO', 'CONSOLIDAÇÃO'],
  ['MacroeconÃ´micos', 'Macroeconômicos'],
  ['MACROECONÃ´MICOS', 'MACROECONÔMICOS'],
  ['CONFIRMAÃ‡Ã•ES', 'CONFIRMAÇÕES'],
  ['PADRÍO', 'PADRÃO']
];
for (const [a,b] of pairs) s = s.split(a).join(b);
fs.writeFileSync(p, s, 'utf8');
console.log('done');
try { new Function(s); console.log('syntax ok'); } catch (e) { console.log('syntax err', e.message); }
