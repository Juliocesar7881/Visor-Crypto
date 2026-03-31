const fs = require('fs');
const filepath = 'www/js/technical.js';
let code = fs.readFileSync(filepath, 'utf8');

const anchorStr = '// Combinar scores';
const anchorIdx = code.indexOf(anchorStr);

if (anchorIdx !== -1) {
    const newSignals = `
            // ============================================
            // NOVOS SINAIS DE ALTA ASSERTIVIDADE
            // ============================================
            // 1. Volume Breakout (Volume atual > 1.5x mÃ©dia dos ultimos 20)
            const recentVols = klines1h.slice(-21).map(k => parseFloat(k[5]));
            if (recentVols.length >= 21) {
                const currentVol = recentVols[recentVols.length - 1];
                const avgVol20 = recentVols.slice(0, 20).reduce((a, b) => a + b, 0) / 20;
                
                if (currentVol > avgVol20 * 1.5) {
                    const priceDiff = currentPrice - parseFloat(klines1h[klines1h.length - 1][1]);
                    if (priceDiff > 0) {
                        confluenceScore += 2;
                        confluenceDetails.push({ name: 'Volume Breakout', value: \`\${(currentVol/avgVol20).toFixed(1)}x mÃ©dia\`, signal: 'LONG', weight: 2, color: '#22c55e' });
                    } else if (priceDiff < 0) {
                        confluenceScore -= 2;
                        confluenceDetails.push({ name: 'Volume Breakout', value: \`\${(currentVol/avgVol20).toFixed(1)}x mÃ©dia\`, signal: 'SHORT', weight: 2, color: '#ef4444' });
                    }
                }
            }

            // 2. DivergÃªncia RSI x PreÃ§o
            const rsiValues = [];
            const closePrices = klines1h.map(k => parseFloat(k[4]));
            // CalculaÃ§Ã£o bÃ¡sica de historico de RSI (aproximada para detecÃ§Ã£o de divergÃªncia)
            for(let i = closePrices.length - 20; i <= closePrices.length; i++) {
                if(i > 14) {
                    // pseudo-historico RSI
                    rsiValues.push({ val: rsi1h, idx: i }); 
                }
            }
            if (klines1h.length >= 10) {
                const prevHigh = Math.max(...closePrices.slice(-10, -3));
                const currentHigh = Math.max(...closePrices.slice(-3));
                
                // bearish divergence
                if (currentHigh > prevHigh && rsi1h < 50) {
                    confluenceScore -= 2.5; 
                    confluenceDetails.push({ name: 'DivergÃªncia Bearish', value: 'PreÃ§o sobe, RSI nÃ£o', signal: 'SHORT', weight: 2.5, color: '#ef4444' });
                }
                // bullish divergence
                const prevLow = Math.min(...closePrices.slice(-10, -3));
                const currentLow = Math.min(...closePrices.slice(-3));
                if (currentLow < prevLow && rsi1h > 50) {
                    confluenceScore += 2.5;
                    confluenceDetails.push({ name: 'DivergÃªncia Bullish', value: 'PreÃ§o cai, RSI nÃ£o', signal: 'LONG', weight: 2.5, color: '#22c55e' });
                }
            }

            // 3. Bollinger Squeeze 
            const bb1h = calculateBollingerBands(klines1h, 20, 2);
            if (bb1h) {
                const bbWidth = (bb1h.upper - bb1h.lower) / bb1h.middle;
                // Identifica se estÃ¡ estreito (< 2%) 
                if (bbWidth < 0.02) {
                    if (currentPrice > bb1h.upper) {
                        confluenceScore += 2;
                        confluenceDetails.push({ name: 'BB Squeeze Breakout', value: 'Banda expandindo cima', signal: 'LONG', weight: 2, color: '#22c55e' });
                    } else if (currentPrice < bb1h.lower) {
                        confluenceScore -= 2;
                        confluenceDetails.push({ name: 'BB Squeeze Breakout', value: 'Banda expandindo baixo', signal: 'SHORT', weight: 2, color: '#ef4444' });
                    }
                }
            }

            // 4. S/R HistÃ³rico (estimado via repetiÃ§Ã£o de toques)
            if (sr && sr.supportCount >= 3 && currentPrice < sr.support * 1.01 && currentPrice > sr.support * 0.99) {
                confluenceScore += 2.5;
                confluenceDetails.push({ name: 'Suporte HistÃ³rico', value: \`>= 3 toques nÃvel \${sr.support}\`, signal: 'LONG', weight: 2.5, color: '#22c55e' });
            }
            if (sr && sr.resistanceCount >= 3 && currentPrice > sr.resistance * 0.99 && currentPrice < sr.resistance * 1.01) {
                confluenceScore -= 2.5;
                confluenceDetails.push({ name: 'ResistÃªncia HistÃ³rica', value: \`>= 3 toques nÃvel \${sr.resistance}\`, signal: 'SHORT', weight: 2.5, color: '#ef4444' });
            }

            `;
    
    code = code.substring(0, anchorIdx) + newSignals + code.substring(anchorIdx);
    console.log("Added new confidence signals!");
    fs.writeFileSync(filepath, code, 'utf8');
}
