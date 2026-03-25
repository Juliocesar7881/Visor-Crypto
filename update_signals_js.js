const fs = require('fs');
let content = fs.readFileSync('www/js/signals.js', 'utf8');

// 1. SCAN_DEDUP_MS -> 60 * 60 * 1000
content = content.replace(
  /const SCAN_DEDUP_MS \= \d+ \* 60 \* 1000;\s*\/\/\s*\d+\s*min\s*/,
  'const SCAN_DEDUP_MS = 60 * 60 * 1000; // 60 min '
);

// 2. wait window.Capacitor.Plugins.BackgroundScan.start(); -> ...start({ minConfidence: prefs.globalConfidence || 70 });
content = content.replace(
  /await window\.Capacitor\.Plugins\.BackgroundScan\.start\(\);/,
  'let prefs = getSignalPrefs(); await window.Capacitor.Plugins.BackgroundScan.start({ minConfidence: prefs.globalConfidence || 70 });'
);

// 3. Ensure signals are sent only when >= 70
// Wait, getCryptoMinConfidence(symbol) already bounds to 70:
// "if (prefs.cryptos[symbol]?.confidence) return Math.max(70, prefs.cryptos[symbol].confidence); return Math.max(70, prefs.globalConfidence || 70);"
// The user says "mas no histórico de sinais que é enviado para o banco de dados e mostra no aplicativo ali deve aparecer já com 70% de confiança ou mais". Since getCryptoMinConfidence ensures a minimum of 70, any UI configuration is at least 70. Is this enough? Yes.

fs.writeFileSync('www/js/signals.js', content, 'utf8');
