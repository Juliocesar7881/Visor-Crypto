const fs = require('fs');
const filepath = 'www/js/technical.js';
let code = fs.readFileSync(filepath, 'utf8');

const s1 = 'function calcModel(klines) {';
const s2 = 'const m5 = calcModel(klines5m);';

const i1 = code.indexOf(s1);
const i2 = code.indexOf(s2);

if (i1 !== -1 && i2 !== -1) {
    const oldBlock = code.substring(i1, i2);
    const newBlock = `function calcModel(klines) {
                if (!klines || klines.length === 0) return { score: 0, direction: 'NEUTRO', atr: 0 };
                const ema21 = calculateEMA(klines, 21);
                const ema50 = calculateEMA(klines, 50);
                const ema200 = calculateEMA(klines, 200);
                const rsi = calculateRSI(klines);
                const adxPack = calculateADX(klines);
                const adx = adxPack?.adx || 0;
                const atr = calculateATR(klines);

                const alta = ema21 > ema50 && ema50 > ema200;
                const baixa = ema21 < ema50 && ema50 < ema200;
                const forca = adx > 20;

                const pullbackCompra = currentPrice > ema21 * 0.99 && currentPrice < ema50 * 1.01;
                const pullbackVenda = currentPrice < ema21 * 1.01 && currentPrice > ema50 * 0.99;

                const conditionsBuy = [
                    ema21 > ema50,
                    ema50 > ema200,
                    pullbackCompra,
                    rsi > 50,
                    adx > 20
                ];
                
                const conditionsSell = [
                    ema21 < ema50,
                    ema50 < ema200,
                    pullbackVenda,
                    rsi < 50,
                    adx > 20
                ];
                
                const scoreBuyRaw = conditionsBuy.filter(Boolean).length / conditionsBuy.length;
                const scoreSellRaw = conditionsSell.filter(Boolean).length / conditionsSell.length;

                // Transforma em valor de 0 a 100
                const rawScore = Math.max(scoreBuyRaw, scoreSellRaw) * 100;
                let score = rawScore;

                const compra = scoreBuyRaw >= 0.6;
                const venda = scoreSellRaw >= 0.6;

                const highs = klines.slice(-lookbackEstrutura).map(k => parseFloat(k[2]));
                const lows = klines.slice(-lookbackEstrutura).map(k => parseFloat(k[3]));
                const topo = highs.length ? Math.max(...highs) : currentPrice;
                const fundo = lows.length ? Math.min(...lows) : currentPrice;

                return {
                    score,
                    compra, venda,
                    atr, topo, fundo,
                    ema21, ema50, ema200, rsi, adx, forca, pullbackCompra, pullbackVenda, alta, baixa
                };
            }

            // Calculando ambos os timeframes (5m focado em scalp, 15m estrutural)
            `;
    code = code.replace(oldBlock, newBlock);
    console.log("Updated Pine V7");
}

const c1 = 'const alignedIndicators = Math.max(longIndicators, shortIndicators);';
const c2 = '// Regime alignment bonus/penalty';

const ci1 = code.indexOf(c1);
const ci2 = code.indexOf(c2);

if (ci1 !== -1 && ci2 !== -1) {
    const oldConf = code.substring(ci1, ci2);
    const newConf = `const alignedIndicators = Math.max(longIndicators, shortIndicators);
            const alignmentRatio = alignedIndicators / totalIndicators;
            let baseConfidence = Math.round(Math.min(alignmentRatio * 100 + Math.abs(totalScore) * 2, 95));
            
            // Consensus Multiplier Gradual
            const calcConsensusMultiplier = (details) => {
                if(!details) return 1.0;
                const signalsVals = details.map(d => {
                    if(d.signal === 'LONG') return d.weight;
                    if(d.signal === 'SHORT') return -Math.abs(d.weight || 0);
                    return 0;
                });
                const bullish = signalsVals.filter(s => s > 0.1).length;
                const bearish = signalsVals.filter(s => s < -0.1).length;
                const dominant = Math.max(bullish, bearish);
                if (dominant >= 5) return 1.30; // todos concordam
                if (dominant >= 4) return 1.15; // maioria forte
                return 1.00;
            };
            
            let confidence = Math.round(baseConfidence * calcConsensusMultiplier(confluenceDetails));
            confidence = Math.min(confidence, 100);

            `;
    code = code.replace(oldConf, newConf);
    console.log("Updated Confidence logic");
}


// Now fix analyzeMultiTimeframe where "+1 / -1" is used instead of graduated weights
const m1 = 'if (analysis.signal === \\\'LONG\\\') {';
const m2 = 'totalWeight += tf.weight;';

fs.writeFileSync(filepath, code, 'utf8');
