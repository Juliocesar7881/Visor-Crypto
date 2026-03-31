const fs = require('fs');
const filepath = 'www/js/technical.js';
let code = fs.readFileSync(filepath, 'utf8');

const startStr = '// CONFLUENCE SCORING SYSTEM';
const endStr = '// VWAP';
const startIndex = code.indexOf(startStr);
const endIndex = code.indexOf(endStr);

if (startIndex !== -1 && endIndex !== -1) {
    const originalBlock = code.substring(startIndex - 45, endIndex);
    
    const newBlock = `// ============================================
            // CONFLUENCE SCORING SYSTEM (Gradient Gradual)
            // ============================================
            let confluenceScore = 0;
            const confluenceDetails = [];
            
            // RSI gradual: de -1.0 a +1.0 proporcional à intensidade
            const rsiSignalGradual = (rsiVal) => {
                if (!rsiVal) return 0;
                return Math.max(-1, Math.min(1, (rsiVal - 50) / 30));
            };
            
            // EMA gradual: usa a distância relativa ao invés de binário
            const emaSignalGradual = (price, emaVal) => {
                if (!emaVal) return 0;
                const distPct = (price - emaVal) / emaVal;
                return Math.max(-1, Math.min(1, distPct / 0.03));
            };
            
            // RSI 15m (peso 2 — gradiente)
            const rsi15mContrib = rsiSignalGradual(rsi15m) * 2;
            confluenceScore += rsi15mContrib;
            const rsi15mSignal = rsi15mContrib > 0.3 ? 'LONG' : rsi15mContrib < -0.3 ? 'SHORT' : 'NEUTRO';
            confluenceDetails.push({ name: 'RSI 15m', value: (rsi15m||0).toFixed(1), signal: rsi15mSignal, weight: Math.abs(+rsi15mContrib.toFixed(2)), color: rsi15mSignal === 'LONG' ? '#22c55e' : rsi15mSignal === 'SHORT' ? '#ef4444' : '#94a3b8' });
            
            // RSI 1h (peso 2 — gradiente)
            const rsi1hContrib = rsiSignalGradual(rsi1h) * 2;
            confluenceScore += rsi1hContrib;
            const rsi1hSignal = rsi1hContrib > 0.3 ? 'LONG' : rsi1hContrib < -0.3 ? 'SHORT' : 'NEUTRO';
            confluenceDetails.push({ name: 'RSI 1h', value: (rsi1h||0).toFixed(1), signal: rsi1hSignal, weight: Math.abs(+rsi1hContrib.toFixed(2)), color: rsi1hSignal === 'LONG' ? '#22c55e' : rsi1hSignal === 'SHORT' ? '#ef4444' : '#94a3b8' });
            
            // RSI 4h (peso 2 — gradiente)
            const rsi4hContrib = rsiSignalGradual(rsi4h) * 2;
            confluenceScore += rsi4hContrib;
            const rsi4hSignal = rsi4hContrib > 0.3 ? 'LONG' : rsi4hContrib < -0.3 ? 'SHORT' : 'NEUTRO';
            confluenceDetails.push({ name: 'RSI 4h', value: (rsi4h||0).toFixed(1), signal: rsi4hSignal, weight: Math.abs(+rsi4hContrib.toFixed(2)), color: rsi4hSignal === 'LONG' ? '#22c55e' : rsi4hSignal === 'SHORT' ? '#ef4444' : '#94a3b8' });
            
            // EMA 200 1h (peso 1.5)
            const ema1hDist = ema200_1h !== 0 ? ((currentPrice - ema200_1h) / ema200_1h) * 100 : 0;
            const ema1hContrib = emaSignalGradual(currentPrice, ema200_1h) * 1.5;
            confluenceScore += ema1hContrib;
            const ema1hSignal = ema1hContrib > 0.2 ? 'LONG' : ema1hContrib < -0.2 ? 'SHORT' : 'NEUTRO';
            confluenceDetails.push({ name: 'EMA 200 (1h)', value: \`\${ema1hDist > 0 ? '+' : ''}\${ema1hDist.toFixed(1)}%\`, signal: ema1hSignal, weight: Math.abs(+ema1hContrib.toFixed(2)), color: ema1hSignal === 'LONG' ? '#22c55e' : ema1hSignal === 'SHORT' ? '#ef4444' : '#94a3b8' });
            
            // EMA 200 4h (peso 1.5)
            const ema4hDist = ema200_4h !== 0 ? ((currentPrice - ema200_4h) / ema200_4h) * 100 : 0;
            const ema4hContrib = emaSignalGradual(currentPrice, ema200_4h) * 1.5;
            confluenceScore += ema4hContrib;
            const ema4hSignal = ema4hContrib > 0.2 ? 'LONG' : ema4hContrib < -0.2 ? 'SHORT' : 'NEUTRO';
            confluenceDetails.push({ name: 'EMA 200 (4h)', value: \`\${ema4hDist > 0 ? '+' : ''}\${ema4hDist.toFixed(1)}%\`, signal: ema4hSignal, weight: Math.abs(+ema4hContrib.toFixed(2)), color: ema4hSignal === 'LONG' ? '#22c55e' : ema4hSignal === 'SHORT' ? '#ef4444' : '#94a3b8' });
            
            `;
    code = code.replace(originalBlock, newBlock);
    console.log("Updated RSI / EMA");
}

fs.writeFileSync(filepath, code, 'utf8');
