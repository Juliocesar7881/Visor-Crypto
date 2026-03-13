// ============================================================================
// VISOR CRYPTO - TECHNICAL ANALYSIS ENGINE v2.0
// Nível Institucional: Regime Detection, Market Structure, CVD Avançado,
// Macro/News Layer, Volatility Metrics, Contextual Scoring
// ============================================================================

(function() {
    'use strict';

    // ========================================================================
    // 1. MARKET REGIME DETECTION
    // Classifica: TRENDING_UP, TRENDING_DOWN, RANGING, ACCUMULATION, DISTRIBUTION
    // ========================================================================
    function detectMarketRegime(klines1h, klines4h, adx1h, adx4h, volumeProfile, currentPrice) {
        const adxVal = adx1h?.adx || 20;
        const adx4hVal = adx4h?.adx || 20;
        const plusDI = adx1h?.plusDI || 0;
        const minusDI = adx1h?.minusDI || 0;
        
        // Bollinger Band Width para detectar squeeze/expansão
        const bb = calculateBollingerBands(klines1h, 20, 2);
        const bbWidth = bb.width;
        const bbPercentile = bb.widthPercentile;
        
        // Volume trend analysis
        const volTrend = analyzeVolumeTrend(klines1h);
        
        // Price position relative to value area
        const poc = volumeProfile?.poc || currentPrice;
        const vah = volumeProfile?.vah || currentPrice * 1.02;
        const val = volumeProfile?.val || currentPrice * 0.98;
        
        let regime = 'RANGING';
        let regimeStrength = 0;
        let regimeIcon = '⚖️';
        let regimeColor = '#f59e0b';
        let regimeDescription = '';
        let regimeImplication = '';
        
        // Trend detection
        const isTrending = adxVal > 25 || adx4hVal > 30;
        const isStrongTrend = adxVal > 35 || adx4hVal > 40;
        const isRange = adxVal < 20 && adx4hVal < 25;
        
        if (isStrongTrend && plusDI > minusDI) {
            regime = 'TRENDING_UP';
            regimeStrength = Math.min((adxVal - 25) / 25, 1);
            regimeIcon = '🚀';
            regimeColor = '#22c55e';
            regimeDescription = 'Forte tendência de ALTA';
            regimeImplication = 'Priorizar sinais LONG. Ignorar RSI overbought. EMA/MACD mais confiáveis.';
        } else if (isStrongTrend && minusDI > plusDI) {
            regime = 'TRENDING_DOWN';
            regimeStrength = Math.min((adxVal - 25) / 25, 1);
            regimeIcon = '📉';
            regimeColor = '#ef4444';
            regimeDescription = 'Forte tendência de BAIXA';
            regimeImplication = 'Priorizar sinais SHORT. Ignorar RSI oversold. EMA/MACD mais confiáveis.';
        } else if (isTrending && plusDI > minusDI) {
            regime = 'TRENDING_UP';
            regimeStrength = Math.min((adxVal - 15) / 25, 0.7);
            regimeIcon = '📈';
            regimeColor = '#4ade80';
            regimeDescription = 'Tendência de alta moderada';
            regimeImplication = 'Cautela com sinais SHORT contratendência. Preferir pullbacks para LONG.';
        } else if (isTrending && minusDI > plusDI) {
            regime = 'TRENDING_DOWN';
            regimeStrength = Math.min((adxVal - 15) / 25, 0.7);
            regimeIcon = '🔻';
            regimeColor = '#f87171';
            regimeDescription = 'Tendência de baixa moderada';
            regimeImplication = 'Cautela com sinais LONG. Preferir rallies para SHORT.';
        } else if (isRange) {
            // Distinguish accumulation vs distribution
            if (volTrend.increasing && currentPrice < poc) {
                regime = 'ACCUMULATION';
                regimeStrength = 0.5 + (volTrend.ratio * 0.3);
                regimeIcon = '🔋';
                regimeColor = '#06b6d4';
                regimeDescription = 'Acumulação detectada';
                regimeImplication = 'Volume crescente em faixa de preço baixa. Possível breakout para CIMA. Osciladores mais confiáveis.';
            } else if (volTrend.increasing && currentPrice > poc) {
                regime = 'DISTRIBUTION';
                regimeStrength = 0.5 + (volTrend.ratio * 0.3);
                regimeIcon = '⚡';
                regimeColor = '#f97316';
                regimeDescription = 'Distribuição detectada';
                regimeImplication = 'Volume crescente em faixa de preço alta. Possível breakdown para BAIXO. Cuidado com falsas altas.';
            } else {
                regime = 'RANGING';
                regimeStrength = 0.3;
                regimeIcon = '⚖️';
                regimeColor = '#f59e0b';
                regimeDescription = 'Mercado lateral (range)';
                regimeImplication = 'Osciladores (RSI, Stoch) mais confiáveis. Volume Profile dominante. Operar nas extremidades do range.';
            }
        }
        
        // Bollinger squeeze detection
        let squeezeDetected = false;
        let squeezeType = '';
        if (bbPercentile < 20) {
            squeezeDetected = true;
            squeezeType = 'SQUEEZE';
            regimeDescription += ' + 💎 Bollinger Squeeze (explosão iminente)';
        } else if (bbPercentile > 80) {
            squeezeType = 'EXPANSION';
            regimeDescription += ' + ⚡ Expansão de volatilidade ativa';
        }
        
        return {
            regime,
            regimeStrength: Math.min(regimeStrength, 1),
            regimeIcon,
            regimeColor,
            regimeDescription,
            regimeImplication,
            adx: adxVal,
            adx4h: adx4hVal,
            plusDI,
            minusDI,
            bbWidth,
            bbPercentile,
            squeezeDetected,
            squeezeType,
            isTrending,
            isRange
        };
    }

    // ========================================================================
    // 2. MARKET STRUCTURE DETECTION (BOS / CHoCH / Liquidity Sweeps)
    // ========================================================================
    function detectMarketStructure(klines1h, klines4h, currentPrice) {
        const swingPoints1h = findSwingPoints(klines1h, 5);
        const swingPoints4h = findSwingPoints(klines4h, 5);
        
        const structure1h = analyzeStructure(swingPoints1h, currentPrice);
        const structure4h = analyzeStructure(swingPoints4h, currentPrice);
        
        // Liquidity sweep detection
        const liquiditySweeps = detectLiquiditySweeps(klines1h, swingPoints1h, currentPrice);
        
        // Overall structure
        let overallStructure = 'NEUTRO';
        let structureScore = 0;
        let structureDescription = '';
        
        if (structure4h.type === 'BOS_BULLISH' || structure4h.type === 'CHOCH_BULLISH') {
            overallStructure = 'BULLISH';
            structureScore = structure4h.type === 'BOS_BULLISH' ? 2 : 2.5;
            structureDescription = structure4h.type === 'BOS_BULLISH' 
                ? '📐 Break of Structure (BOS) para CIMA no 4h - tendência de alta confirmada'
                : '🔄 Change of Character (CHoCH) para CIMA no 4h - possível reversão bullish';
        } else if (structure4h.type === 'BOS_BEARISH' || structure4h.type === 'CHOCH_BEARISH') {
            overallStructure = 'BEARISH';
            structureScore = structure4h.type === 'BOS_BEARISH' ? -2 : -2.5;
            structureDescription = structure4h.type === 'BOS_BEARISH' 
                ? '📐 Break of Structure (BOS) para BAIXO no 4h - tendência de baixa confirmada'
                : '🔄 Change of Character (CHoCH) para BAIXO no 4h - possível reversão bearish';
        } else if (structure1h.type === 'BOS_BULLISH' || structure1h.type === 'CHOCH_BULLISH') {
            overallStructure = 'BULLISH';
            structureScore = structure1h.type === 'BOS_BULLISH' ? 1 : 1.5;
            structureDescription = structure1h.type === 'BOS_BULLISH'
                ? '📐 BOS para CIMA no 1h'
                : '🔄 CHoCH para CIMA no 1h';
        } else if (structure1h.type === 'BOS_BEARISH' || structure1h.type === 'CHOCH_BEARISH') {
            overallStructure = 'BEARISH';
            structureScore = structure1h.type === 'BOS_BEARISH' ? -1 : -1.5;
            structureDescription = structure1h.type === 'BOS_BEARISH'
                ? '📐 BOS para BAIXO no 1h'
                : '🔄 CHoCH para BAIXO no 1h';
        }
        
        // Liquidity sweep modifier
        if (liquiditySweeps.detected) {
            if (liquiditySweeps.type === 'SWEEP_LOWS') {
                structureScore += 1.5;
                structureDescription += `\n🎯 Sweep de mínimas detectado → provável reversão para CIMA`;
            } else if (liquiditySweeps.type === 'SWEEP_HIGHS') {
                structureScore -= 1.5;
                structureDescription += `\n🎯 Sweep de máximas detectado → provável reversão para BAIXO`;
            }
        }
        
        return {
            overallStructure,
            structureScore,
            structureDescription,
            structure1h,
            structure4h,
            liquiditySweeps,
            swingHighs1h: swingPoints1h.highs.slice(-3),
            swingLows1h: swingPoints1h.lows.slice(-3),
            swingHighs4h: swingPoints4h.highs.slice(-3),
            swingLows4h: swingPoints4h.lows.slice(-3)
        };
    }
    
    function findSwingPoints(klines, lookback) {
        const highs = [];
        const lows = [];
        if (!klines || klines.length < lookback * 2 + 1) return { highs, lows };
        
        for (let i = lookback; i < klines.length - lookback; i++) {
            const high = parseFloat(klines[i][2]);
            const low = parseFloat(klines[i][3]);
            const time = parseInt(klines[i][0]);
            
            let isSwingHigh = true;
            let isSwingLow = true;
            
            for (let j = 1; j <= lookback; j++) {
                if (parseFloat(klines[i - j][2]) >= high || parseFloat(klines[i + j][2]) >= high) {
                    isSwingHigh = false;
                }
                if (parseFloat(klines[i - j][3]) <= low || parseFloat(klines[i + j][3]) <= low) {
                    isSwingLow = false;
                }
            }
            
            if (isSwingHigh) highs.push({ price: high, time, index: i });
            if (isSwingLow) lows.push({ price: low, time, index: i });
        }
        
        return { highs, lows };
    }
    
    function analyzeStructure(swingPoints, currentPrice) {
        const { highs, lows } = swingPoints;
        if (highs.length < 2 || lows.length < 2) {
            return { type: 'UNDEFINED', level: 0, description: 'Dados insuficientes' };
        }
        
        const lastHigh = highs[highs.length - 1];
        const prevHigh = highs[highs.length - 2];
        const lastLow = lows[lows.length - 1];
        const prevLow = lows[lows.length - 2];
        
        // Check for Higher Highs / Lower Lows (trend continuation = BOS)
        const hh = lastHigh.price > prevHigh.price;
        const ll = lastLow.price < prevLow.price;
        const hl = lastLow.price > prevLow.price;
        const lh = lastHigh.price < prevHigh.price;
        
        // BOS: Continuation of existing structure
        if (hh && hl) {
            // Higher High + Higher Low = Bullish BOS
            return { type: 'BOS_BULLISH', level: lastHigh.price, description: 'Higher High + Higher Low', lastHigh, lastLow, prevHigh, prevLow };
        }
        if (ll && lh) {
            // Lower Low + Lower High = Bearish BOS
            return { type: 'BOS_BEARISH', level: lastLow.price, description: 'Lower Low + Lower High', lastHigh, lastLow, prevHigh, prevLow };
        }
        
        // CHoCH: Change of Character (reversal)
        if (hh && ll) {
            // Expansion — check which is more recent
            if (lastHigh.index > lastLow.index) {
                return { type: 'CHOCH_BULLISH', level: lastHigh.price, description: 'Quebra de topo após mínima mais baixa', lastHigh, lastLow, prevHigh, prevLow };
            } else {
                return { type: 'CHOCH_BEARISH', level: lastLow.price, description: 'Quebra de fundo após máxima mais alta', lastHigh, lastLow, prevHigh, prevLow };
            }
        }
        
        // Neutral structure
        if (currentPrice > prevHigh.price && currentPrice > lastHigh.price) {
            return { type: 'BOS_BULLISH', level: currentPrice, description: 'Preço acima dos últimos topos', lastHigh, lastLow, prevHigh, prevLow };
        }
        if (currentPrice < prevLow.price && currentPrice < lastLow.price) {
            return { type: 'BOS_BEARISH', level: currentPrice, description: 'Preço abaixo dos últimos fundos', lastHigh, lastLow, prevHigh, prevLow };
        }
        
        return { type: 'CONSOLIDATION', level: currentPrice, description: 'Sem estrutura clara - consolidação', lastHigh, lastLow, prevHigh, prevLow };
    }
    
    function detectLiquiditySweeps(klines, swingPoints, currentPrice) {
        if (!klines || klines.length < 10) return { detected: false };
        
        const { highs, lows } = swingPoints;
        const recentCandles = klines.slice(-5);
        
        // Check if recent candle wicked below a swing low then closed above (sweep of lows)
        for (let i = 0; i < recentCandles.length; i++) {
            const low = parseFloat(recentCandles[i][3]);
            const close = parseFloat(recentCandles[i][4]);
            const open = parseFloat(recentCandles[i][1]);
            
            for (const swingLow of lows.slice(-3)) {
                if (low < swingLow.price && close > swingLow.price && close > open) {
                    return {
                        detected: true,
                        type: 'SWEEP_LOWS',
                        level: swingLow.price,
                        description: `Wick abaixo de $${swingLow.price.toFixed(2)} mas fechou acima — varredura de liquidez`,
                        confidence: 0.7 + (Math.abs(close - low) / close) * 10
                    };
                }
            }
            
            const high = parseFloat(recentCandles[i][2]);
            for (const swingHigh of highs.slice(-3)) {
                if (high > swingHigh.price && close < swingHigh.price && close < open) {
                    return {
                        detected: true,
                        type: 'SWEEP_HIGHS',
                        level: swingHigh.price,
                        description: `Wick acima de $${swingHigh.price.toFixed(2)} mas fechou abaixo — varredura de liquidez`,
                        confidence: 0.7 + (Math.abs(high - close) / close) * 10
                    };
                }
            }
        }
        
        return { detected: false };
    }

    // ========================================================================
    // 3. CVD AVANÇADO (Divergências, Absorção, Breakouts)
    // ========================================================================
    function calculateCVDAdvanced(trades, klines1h, currentPrice) {
        if (!trades || trades.length < 50) {
            return {
                delta: 0, trend: 'neutral', signal: 'neutral', score: 0,
                divergence: null, absorption: null, breakout: null,
                description: 'Dados insuficientes'
            };
        }
        
        // Basic CVD calculation
        let buyVolume = 0, sellVolume = 0;
        const cvdValues = [];
        let cumDelta = 0;
        
        // Split trades into chunks for CVD series
        const chunkSize = Math.max(10, Math.floor(trades.length / 20));
        for (let i = 0; i < trades.length; i += chunkSize) {
            let chunkBuy = 0, chunkSell = 0;
            for (let j = i; j < Math.min(i + chunkSize, trades.length); j++) {
                const vol = parseFloat(trades[j].qty) * parseFloat(trades[j].price);
                if (trades[j].isBuyerMaker) {
                    sellVolume += vol;
                    chunkSell += vol;
                } else {
                    buyVolume += vol;
                    chunkBuy += vol;
                }
            }
            cumDelta += (chunkBuy - chunkSell);
            cvdValues.push(cumDelta);
        }
        
        const totalDelta = buyVolume - sellVolume;
        const trend = totalDelta > 0 ? 'up' : 'down';
        
        // === DIVERGENCE DETECTION ===
        // Compare price trend vs CVD trend using last 20 candles + CVD series
        let divergence = null;
        if (klines1h && klines1h.length >= 10 && cvdValues.length >= 5) {
            const recentCloses = klines1h.slice(-10).map(k => parseFloat(k[4]));
            const priceSlope = (recentCloses[recentCloses.length - 1] - recentCloses[0]) / recentCloses[0];
            const cvdSlope = cvdValues.length >= 2 ? 
                (cvdValues[cvdValues.length - 1] - cvdValues[Math.floor(cvdValues.length / 2)]) / (Math.abs(cvdValues[Math.floor(cvdValues.length / 2)]) + 1) : 0;
            
            if (priceSlope > 0.005 && cvdSlope < -0.1) {
                divergence = {
                    type: 'BEARISH_DIVERGENCE',
                    description: 'Preço subindo mas CVD caindo → compradores perdendo força',
                    icon: '🔴',
                    impact: -1.5
                };
            } else if (priceSlope < -0.005 && cvdSlope > 0.1) {
                divergence = {
                    type: 'BULLISH_DIVERGENCE',
                    description: 'Preço caindo mas CVD subindo → vendedores perdendo força',
                    icon: '🟢',
                    impact: 1.5
                };
            }
        }
        
        // === ABSORPTION DETECTION ===
        let absorption = null;
        if (klines1h && klines1h.length >= 3) {
            const last3 = klines1h.slice(-3);
            const priceRange = Math.abs(parseFloat(last3[2][4]) - parseFloat(last3[0][4]));
            const avgPrice = parseFloat(last3[1][4]);
            const priceChangePercent = (priceRange / avgPrice) * 100;
            
            // Price barely moved but big delta = absorption
            if (priceChangePercent < 0.5 && Math.abs(totalDelta) > buyVolume * 0.3) {
                if (totalDelta > 0) {
                    absorption = {
                        type: 'BULLISH_ABSORPTION',
                        description: 'Preço parado + forte delta comprador → baleias absorvendo vendas',
                        icon: '🐋',
                        impact: 2
                    };
                } else {
                    absorption = {
                        type: 'BEARISH_ABSORPTION',
                        description: 'Preço parado + forte delta vendedor → institucionais distribuindo',
                        icon: '🐋',
                        impact: -2
                    };
                }
            }
        }
        
        // === CVD BREAKOUT DETECTION ===
        let breakout = null;
        if (cvdValues.length >= 5) {
            const cvdMean = cvdValues.slice(0, -2).reduce((a, b) => a + b, 0) / (cvdValues.length - 2);
            const cvdStd = Math.sqrt(cvdValues.slice(0, -2).reduce((a, b) => a + Math.pow(b - cvdMean, 2), 0) / (cvdValues.length - 2));
            const lastCVD = cvdValues[cvdValues.length - 1];
            
            if (lastCVD > cvdMean + 2 * cvdStd) {
                breakout = {
                    type: 'CVD_BREAKOUT_UP',
                    description: 'O volume de compra rompeu o teto da média de forma agressiva → pressão compradora excepcional',
                    icon: '💥',
                    impact: 1.5
                };
            } else if (lastCVD < cvdMean - 2 * cvdStd) {
                breakout = {
                    type: 'CVD_BREAKOUT_DOWN',
                    description: 'O volume de venda rompeu o teto da média de forma agressiva → pressão vendedora excepcional',
                    icon: '💥',
                    impact: -1.5
                };
            }
        }
        
        // Total score
        let score = totalDelta > 0 ? 1 : -1;
        let signal = 'neutral';
        let description = '';
        
        if (divergence) {
            score += divergence.impact;
            description += divergence.description + '. ';
        }
        if (absorption) {
            score += absorption.impact;
            description += absorption.description + '. ';
            signal = absorption.type.includes('BULLISH') ? 'absorption_bullish' : 'absorption_bearish';
        }
        if (breakout) {
            score += breakout.impact;
            description += breakout.description + '. ';
        }
        
        if (!description) {
            if (totalDelta > 0 && trend === 'up') {
                signal = 'bullish';
                description = 'Delta positivo — compradores dominantes';
            } else if (totalDelta < 0 && trend === 'down') {
                signal = 'bearish';
                description = 'Delta negativo — vendedores dominantes';
            } else {
                description = 'Fluxo misto — sem dominância clara';
            }
        }
        
        return {
            delta: totalDelta,
            buyVolume,
            sellVolume,
            trend,
            signal,
            score: Math.max(-5, Math.min(5, score)),
            divergence,
            absorption,
            breakout,
            description,
            cvdSeries: cvdValues
        };
    }

    // ========================================================================
    // 4. BOLLINGER BANDS + VOLATILITY METRICS
    // ========================================================================
    function calculateBollingerBands(klines, period, stdDev) {
        period = period || 20;
        stdDev = stdDev || 2;
        
        if (!klines || klines.length < period) {
            return { upper: 0, middle: 0, lower: 0, width: 0, widthPercentile: 50, percentB: 50 };
        }
        
        const closes = klines.map(k => parseFloat(k[4]));
        const recentCloses = closes.slice(-period);
        
        const sma = recentCloses.reduce((a, b) => a + b, 0) / period;
        const variance = recentCloses.reduce((a, b) => a + Math.pow(b - sma, 2), 0) / period;
        const std = Math.sqrt(variance);
        
        const upper = sma + stdDev * std;
        const lower = sma - stdDev * std;
        const width = ((upper - lower) / sma) * 100;
        
        // Width percentile over last 100 candles
        const allWidths = [];
        for (let i = period; i <= closes.length; i++) {
            const slice = closes.slice(i - period, i);
            const m = slice.reduce((a, b) => a + b, 0) / period;
            const v = slice.reduce((a, b) => a + Math.pow(b - m, 2), 0) / period;
            const s = Math.sqrt(v);
            allWidths.push(((m + stdDev * s) - (m - stdDev * s)) / m * 100);
        }
        
        const sortedWidths = allWidths.slice().sort((a, b) => a - b);
        const currentIndex = sortedWidths.findIndex(w => w >= width);
        const widthPercentile = Math.round((currentIndex / sortedWidths.length) * 100);
        
        // %B = (price - lower) / (upper - lower)
        const currentPrice = closes[closes.length - 1];
        const percentB = ((currentPrice - lower) / (upper - lower)) * 100;
        
        return { upper, middle: sma, lower, width, widthPercentile, percentB, std };
    }
    
    function calculateVolatilityMetrics(klines1h, klines4h, klines1d) {
        // ATR 14 on different timeframes
        const atr1h = _calcATR(klines1h, 14);
        const atr4h = _calcATR(klines4h, 14);
        const atr1d = _calcATR(klines1d, 14);
        
        // Bollinger Bands
        const bb1h = calculateBollingerBands(klines1h, 20, 2);
        const bb4h = calculateBollingerBands(klines4h, 20, 2);
        
        // Current price for ATR percentage
        const currentPrice = klines1h && klines1h.length > 0 ? parseFloat(klines1h[klines1h.length - 1][4]) : 0;
        const atrPercent1h = currentPrice > 0 ? (atr1h / currentPrice) * 100 : 0;
        const atrPercent4h = currentPrice > 0 ? (atr4h / currentPrice) * 100 : 0;
        
        // Volatility regime
        let volRegime = 'NORMAL';
        let volColor = '#f59e0b';
        let volIcon = '📊';
        let volDescription = '';
        
        if (bb1h.widthPercentile < 15 || bb4h.widthPercentile < 20) {
            volRegime = 'SQUEEZE';
            volColor = '#8b5cf6';
            volIcon = '💎';
            volDescription = 'Volatilidade extremamente baixa — explosão de preço iminente. Alta probabilidade de breakout.';
        } else if (bb1h.widthPercentile < 30) {
            volRegime = 'LOW';
            volColor = '#06b6d4';
            volIcon = '🌊';
            volDescription = 'Volatilidade baixa — mercado comprimido. Breakout pode ocorrer em breve.';
        } else if (bb1h.widthPercentile > 85 || bb4h.widthPercentile > 80) {
            volRegime = 'EXTREME';
            volColor = '#ef4444';
            volIcon = '🌋';
            volDescription = 'Volatilidade extrema — cuidado com reversões. Mercado pode estar overshooting.';
        } else if (bb1h.widthPercentile > 65) {
            volRegime = 'HIGH';
            volColor = '#f97316';
            volIcon = '🔥';
            volDescription = 'Volatilidade alta — movimentos fortes. Stops mais largos necessários.';
        } else {
            volDescription = 'Volatilidade normal — condições padrão de mercado.';
        }
        
        return {
            atr1h,
            atr4h,
            atr1d,
            atrPercent1h: atrPercent1h.toFixed(2),
            atrPercent4h: atrPercent4h.toFixed(2),
            bb1h,
            bb4h,
            volRegime,
            volColor,
            volIcon,
            volDescription
        };
    }
    
    function _calcATR(klines, period) {
        if (!klines || klines.length < period + 1) return 0;
        let trSum = 0;
        for (let i = klines.length - period; i < klines.length; i++) {
            const high = parseFloat(klines[i][2]);
            const low = parseFloat(klines[i][3]);
            const prevClose = parseFloat(klines[i - 1]?.[4] || klines[i][1]);
            const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
            trSum += tr;
        }
        return trSum / period;
    }

    // ========================================================================
    // 5. MACRO + NEWS DE ALTO IMPACTO
    // ========================================================================
    async function fetchMacroNewsLayer(symbol) {
        const results = {
            macroEvents: [],
            urgentNews: [],
            macroScore: 0,
            newsScore: 0,
            totalImpact: 0,
            hasCriticalEvent: false,
            criticalEventDescription: '',
            macroSentiment: 'NEUTRO',
            macroColor: '#94a3b8'
        };
        
        try {
            // 1. Fetch upcoming economic events (next 7 days)
            const today = new Date();
            const fromDate = today.toISOString().split('T')[0];
            const toDate = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            
            const FMP_KEY = window._FMP_API_KEY || null /* FMP key moved to backend proxy */;
            
            const [calendarRes, newsRes] = await Promise.all([
                fetch(`https://financialmodelingprep.com/api/v3/economic_calendar?from=${fromDate}&to=${toDate}&apikey=${FMP_KEY}`)
                    .then(r => r.ok ? r.json() : []).catch(() => []),
                // CryptoPanic for urgent crypto news
                fetch(`https://cryptopanic.com/api/free/v1/posts/?public=true&kind=news&filter=important`)
                    .then(r => r.ok ? r.json() : { results: [] }).catch(() => ({ results: [] }))
            ]);
            
            // Process macro events
            const criticalEvents = [
                'Federal Funds Rate', 'Interest Rate Decision', 'FOMC',
                'Non Farm Payrolls', 'NFP', 'CPI', 'Consumer Price Index',
                'Core CPI', 'PPI', 'Producer Price Index', 'GDP',
                'Unemployment Rate', 'Retail Sales', 'PCE Price Index',
                'Core PCE', 'ISM Manufacturing', 'ISM Services'
            ];
            
            const warKeywords = [
                'war', 'guerra', 'invasion', 'invasão', 'missile', 'míssil',
                'bomb', 'attack', 'ataque', 'military', 'militar',
                'nuclear', 'sanctions', 'sanções', 'tariff', 'tarifa',
                'trade war', 'guerra comercial', 'ban', 'embargo',
                'emergency', 'emergência', 'collapse', 'colapso',
                'crash', 'default', 'bankruptcy', 'falência',
                'hack', 'exploit', 'shutdown', 'regulation', 'regulação',
                'sec ', 'blackrock', 'etf rejected', 'etf denied',
                'federal reserve', 'rate hike', 'rate cut',
                'executive order', 'decreto', 'trump', 'china ban'
            ];
            
            if (Array.isArray(calendarRes)) {
                const highImpact = calendarRes.filter(e => {
                    const importance = (e.impact || e.importance || '').toLowerCase();
                    return importance === 'high' || importance === 'medium' ||
                           criticalEvents.some(ce => (e.event || '').toLowerCase().includes(ce.toLowerCase()));
                });
                
                results.macroEvents = highImpact.slice(0, 10).map(e => ({
                    event: e.event,
                    date: e.date,
                    country: e.country,
                    impact: e.impact || 'High',
                    actual: e.actual,
                    estimate: e.estimate,
                    previous: e.previous,
                    isCritical: criticalEvents.some(ce => (e.event || '').toLowerCase().includes(ce.toLowerCase()))
                }));
                
                // Score macro events
                const upcomingCritical = results.macroEvents.filter(e => e.isCritical);
                if (upcomingCritical.length > 0) {
                    results.hasCriticalEvent = true;
                    const nextEvent = upcomingCritical[0];
                    const eventDate = new Date(nextEvent.date);
                    const hoursUntil = (eventDate - today) / (1000 * 60 * 60);
                    
                    if (hoursUntil <= 24) {
                        results.macroScore = -2; // Reduce confidence — high-volatility event imminent
                        results.criticalEventDescription = `⚠️ ${nextEvent.event} em ${hoursUntil.toFixed(0)}h — ALTA VOLATILIDADE esperada`;
                    } else if (hoursUntil <= 72) {
                        results.macroScore = -1;
                        results.criticalEventDescription = `📅 ${nextEvent.event} em ${Math.floor(hoursUntil / 24)}d — Cautela recomendada`;
                    }
                }
            }
            
            // Process news
            const newsItems = (newsRes.results || []).slice(0, 20);
            for (const item of newsItems) {
                const title = (item.title || '').toLowerCase();
                const isUrgent = warKeywords.some(kw => title.includes(kw));
                const isRelevant = title.includes(symbol.replace('USDT', '').toLowerCase()) ||
                                   title.includes('bitcoin') || title.includes('btc') ||
                                   title.includes('crypto') || title.includes('ethereum') ||
                                   warKeywords.some(kw => title.includes(kw));
                
                if (isUrgent || isRelevant) {
                    // Sentiment analysis by keyword
                    let sentiment = 0;
                    const bullishWords = ['approve', 'adoption', 'etf approved', 'bullish', 'rally', 'surge', 'rate cut', 'dovish', 'stimulus', 'buy', 'accumulate', 'whale buy'];
                    const bearishWords = ['crash', 'ban', 'hack', 'exploit', 'war', 'attack', 'sanctions', 'tariff', 'regulation', 'sec charges', 'rate hike', 'hawkish', 'sell', 'dump', 'collapse', 'fraud'];
                    
                    for (const w of bullishWords) { if (title.includes(w)) sentiment += 1; }
                    for (const w of bearishWords) { if (title.includes(w)) sentiment -= 1; }
                    
                    results.urgentNews.push({
                        title: item.title,
                        source: item.source?.title || 'CryptoPanic',
                        url: item.url,
                        publishedAt: item.published_at,
                        isUrgent,
                        sentiment,
                        votes: item.votes || {}
                    });
                    
                    if (isUrgent) {
                        results.newsScore += sentiment * 1.5;
                    } else {
                        results.newsScore += sentiment * 0.5;
                    }
                }
            }
            
            // Clamp news score
            results.newsScore = Math.max(-5, Math.min(5, results.newsScore));
            results.totalImpact = results.macroScore + results.newsScore;
            
            // Overall sentiment
            if (results.totalImpact > 2) {
                results.macroSentiment = 'BULLISH';
                results.macroColor = '#22c55e';
            } else if (results.totalImpact < -2) {
                results.macroSentiment = 'BEARISH';
                results.macroColor = '#ef4444';
            } else if (results.totalImpact < -0.5 || results.hasCriticalEvent) {
                results.macroSentiment = 'CAUTELA';
                results.macroColor = '#f59e0b';
            }
            
        } catch (err) {
        }
        
        return results;
    }

    // ========================================================================
    // 5B. BIG TECH STOCKS + US MACRO INDICATORS (Real-time)
    // Apple, Microsoft, Tesla, Meta, Nvidia + SP500, VIX, DXY, Treasury Yields
    // Sources: Yahoo Finance (free/no key), alternative.me, WorldBank
    // ========================================================================
    async function fetchBigTechAndMacro() {
        const results = {
            bigTech: [],
            indices: [],
            treasuryYields: null,
            fearGreed: null,
            bigTechSentiment: 'NEUTRO',
            bigTechScore: 0,
            macroIndicators: [],
            timestamp: Date.now()
        };
        
        try {
            // === Yahoo Finance batch request with CORS proxy fallback ===
            const yhSymbols = 'AAPL,MSFT,TSLA,META,NVDA,%5EGSPC,%5EVIX,DX-Y.NYB,%5ETNX,%5ETYX,%5EFVX,%5EIRX';
            const yhUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${yhSymbols}`;
            
            // Helper: try fetch with multiple fallback strategies
            async function fetchYahoo() {
                // Strategy 1: Direct fetch (works on Capacitor Android WebView)
                try {
                    const r1 = await fetch(yhUrl, { 
                        headers: { 'Accept': 'application/json' },
                        signal: AbortSignal.timeout(8000)
                    });
                    if (r1.ok) {
                        const json = await r1.json();
                        if (json?.quoteResponse?.result?.length > 0) return json;
                    }
                } catch(e) { /* console.log('YF direct failed:', e.message); */ }
                
                // Strategy 2: Use query2 endpoint
                try {
                    const r2 = await fetch(`https://query2.finance.yahoo.com/v7/finance/quote?symbols=${yhSymbols}`, {
                        headers: { 'Accept': 'application/json' },
                        signal: AbortSignal.timeout(8000)
                    });
                    if (r2.ok) {
                        const json = await r2.json();
                        if (json?.quoteResponse?.result?.length > 0) return json;
                    }
                } catch(e) { /* console.log('YF query2 failed:', e.message); */ }
                
                // Strategy 3: CORS proxy (corsproxy.io)
                try {
                    const proxyUrl = 'https://corsproxy.io/?' + encodeURIComponent(yhUrl);
                    const r3 = await fetch(proxyUrl, { signal: AbortSignal.timeout(10000) });
                    if (r3.ok) {
                        const json = await r3.json();
                        if (json?.quoteResponse?.result?.length > 0) return json;
                    }
                } catch(e) { /* console.log('YF corsproxy failed:', e.message); */ }
                
                // Strategy 4: allorigins proxy
                try {
                    const allOriginsUrl = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(yhUrl);
                    const r4 = await fetch(allOriginsUrl, { signal: AbortSignal.timeout(10000) });
                    if (r4.ok) {
                        const json = await r4.json();
                        if (json?.quoteResponse?.result?.length > 0) return json;
                    }
                } catch(e) { /* console.log('YF allorigins failed:', e.message); */ }
                
                return null;
            }
            
            const FRED_KEY = (window.APP_CONFIG && window.APP_CONFIG.FRED_KEY) || '';
            const fredFetch = (seriesId) => {
                if (!FRED_KEY) return Promise.resolve(null);
                return fetch(`https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&sort_order=desc&limit=1&api_key=${FRED_KEY}&file_type=json`, { signal: AbortSignal.timeout(8000) })
                    .then(r => r.ok ? r.json() : null)
                    .catch(() => null);
            };
            
            const [yhRes, fgiRes, wbCpiRes, wbUnempRes, fredCpi, fredPce, fredUnemp, fredIsm] = await Promise.all([
                fetchYahoo(),
                // Crypto Fear & Greed Index — free, no key
                fetch('https://api.alternative.me/fng/?limit=1&format=json')
                    .then(r => r.ok ? r.json() : null).catch(() => null),
                // US CPI from World Bank — free, no key (annual, ~1y lag but real)
                fetch('https://api.worldbank.org/v2/country/US/indicator/FP.CPI.TOTL.ZG?format=json&mrv=3&per_page=1')
                    .then(r => r.ok ? r.json() : null).catch(() => null),
                // US Unemployment from World Bank — free, no key
                fetch('https://api.worldbank.org/v2/country/US/indicator/SL.UEM.TOTL.ZS?format=json&mrv=1&per_page=1')
                    .then(r => r.ok ? r.json() : null).catch(() => null),
                // FRED: CPI YoY (CPIAUCSL → monthly)
                fredFetch('CPIAUCSL'),
                // FRED: PCE Price Index (PCEPI → monthly)
                fredFetch('PCEPI'),
                // FRED: Unemployment Rate (UNRATE → monthly)
                fredFetch('UNRATE'),
                // FRED: ISM Manufacturing PMI (MANEMP → monthly, proxy ISM)
                fredFetch('ISM/MAN_PMI').catch(() => fredFetch('NAPM'))
            ]);
            
            // === PROCESS YAHOO FINANCE DATA ===
            const yhQuotes = yhRes?.quoteResponse?.result || [];
            
            const techSymbols = ['AAPL', 'MSFT', 'TSLA', 'META', 'NVDA'];
            const techNames = { AAPL: 'Apple', MSFT: 'Microsoft', TSLA: 'Tesla', META: 'Meta', NVDA: 'Nvidia' };
            const techIcons = { AAPL: '🍎', MSFT: '🪟', TSLA: '⚡', META: '📘', NVDA: '🟢' };
            
            const indexSymbolMap = {
                '^GSPC': { name: 'S&P 500', icon: '📈' },
                '^VIX':  { name: 'VIX', icon: '😱' },
                'DX-Y.NYB': { name: 'Dollar (DXY)', icon: '💵' }
            };
            const yieldSymbolMap = {
                '^IRX': '3M',
                '^FVX': '5Y',
                '^TNX': '10Y',
                '^TYX': '30Y'
            };
            
            let bullCount = 0, bearCount = 0;
            const yieldData = {};
            
            for (const q of yhQuotes) {
                const sym = q.symbol;
                const price = q.regularMarketPrice || 0;
                const change = q.regularMarketChange || 0;
                const changePct = q.regularMarketChangePercent || 0;
                
                if (techSymbols.includes(sym)) {
                    // Big Tech stock
                    if (changePct > 0.5) bullCount++;
                    else if (changePct < -0.5) bearCount++;
                    
                    results.bigTech.push({
                        symbol: sym,
                        name: techNames[sym] || sym,
                        icon: techIcons[sym] || '📊',
                        price, change, changePercent: changePct,
                        volume: q.regularMarketVolume || 0,
                        marketCap: q.marketCap || 0,
                        dayHigh: q.regularMarketDayHigh || 0,
                        dayLow: q.regularMarketDayLow || 0,
                        previousClose: q.regularMarketPreviousClose || 0,
                        isBullish: changePct > 0
                    });
                    
                } else if (indexSymbolMap[sym]) {
                    // Market index
                    const idxInfo = indexSymbolMap[sym];
                    results.indices.push({
                        symbol: sym, name: idxInfo.name, icon: idxInfo.icon,
                        price, change, changePercent: changePct,
                        dayHigh: q.regularMarketDayHigh || 0,
                        dayLow: q.regularMarketDayLow || 0
                    });
                    
                    if (sym === '^VIX') {
                        if (price > 30) results.bigTechScore -= 1.5;
                        else if (price > 25) results.bigTechScore -= 0.5;
                        else if (price < 15) results.bigTechScore += 0.5;
                    }
                    if (sym === 'DX-Y.NYB') {
                        if (changePct > 0.5) results.bigTechScore -= 0.5;
                        else if (changePct < -0.5) results.bigTechScore += 0.5;
                    }
                    if (sym === '^GSPC') {
                        if (changePct > 1) results.bigTechScore += 1;
                        else if (changePct < -1) results.bigTechScore -= 1;
                    }
                    
                } else if (yieldSymbolMap[sym]) {
                    // Treasury yield — Yahoo Finance reports these as % directly (e.g. 4.50)
                    yieldData[yieldSymbolMap[sym]] = price;
                }
            }
            
            // Big Tech sentiment
            if (bullCount >= 4) { results.bigTechSentiment = 'RISK-ON'; results.bigTechScore += 2; }
            else if (bullCount >= 3) { results.bigTechSentiment = 'POSITIVO'; results.bigTechScore += 1; }
            else if (bearCount >= 4) { results.bigTechSentiment = 'RISK-OFF'; results.bigTechScore -= 2; }
            else if (bearCount >= 3) { results.bigTechSentiment = 'NEGATIVO'; results.bigTechScore -= 1; }
            
            // Treasury yields
            if (Object.keys(yieldData).length > 0) {
                const y2 = yieldData['3M'];   // proxy 2Y with 3M for free data
                const y10 = yieldData['10Y'];
                results.treasuryYields = {
                    month3: yieldData['3M'] || null,
                    year5:  yieldData['5Y'] || null,
                    year10: yieldData['10Y'] || null,
                    year30: yieldData['30Y'] || null,
                    date: new Date().toISOString().split('T')[0]
                };
                if (y2 && y10) {
                    const spread = y10 - y2;
                    results.treasuryYields.yieldCurveSpread = spread;
                    results.treasuryYields.isInverted = spread < 0;
                    if (spread < -0.3) {
                        results.bigTechScore -= 1;
                        results.treasuryYields.invertedAlert = '⚠️ Curva de juros invertida — sinal de recessão';
                    }
                }
            }
            
            // === FEAR & GREED INDEX ===
            if (fgiRes?.data?.[0]) {
                const fgi = fgiRes.data[0];
                const val = parseInt(fgi.value);
                results.fearGreed = {
                    value: val,
                    classification: fgi.value_classification,
                    timestamp: fgi.timestamp
                };
                if (val <= 20) {
                    results.bigTechScore += 1.5;
                    results.fearGreed.icon = '😨'; results.fearGreed.color = '#ef4444';
                    results.fearGreed.implication = 'Medo extremo — momento contrário de compra';
                } else if (val <= 35) {
                    results.bigTechScore += 0.5;
                    results.fearGreed.icon = '😟'; results.fearGreed.color = '#f97316';
                    results.fearGreed.implication = 'Medo — cautela no mercado';
                } else if (val >= 80) {
                    results.bigTechScore -= 1.5;
                    results.fearGreed.icon = '🤑'; results.fearGreed.color = '#22c55e';
                    results.fearGreed.implication = 'Ganância extrema — risco de correção';
                } else if (val >= 65) {
                    results.bigTechScore -= 0.5;
                    results.fearGreed.icon = '😏'; results.fearGreed.color = '#84cc16';
                    results.fearGreed.implication = 'Ganância — mercado otimista';
                } else {
                    results.fearGreed.icon = '😐'; results.fearGreed.color = '#f59e0b';
                    results.fearGreed.implication = 'Neutro';
                }
            }
            
            // === WORLD BANK MACRO INDICATORS (free, annual data) ===
            // CPI (inflation YoY %)
            const wbCpiData = wbCpiRes?.[1]?.[0];
            if (wbCpiData?.value != null) {
                results.macroIndicators.push({
                    name: 'CPI Inflação EUA (YoY)',
                    value: parseFloat(wbCpiData.value).toFixed(1),
                    date: wbCpiData.date,
                    icon: '📊', unit: '%',
                    note: 'Dado anual World Bank'
                });
                if (parseFloat(wbCpiData.value) > 4) results.bigTechScore -= 0.5;
            }
            
            // Unemployment
            const wbUnempData = wbUnempRes?.[1]?.[0];
            if (wbUnempData?.value != null) {
                results.macroIndicators.push({
                    name: 'Desemprego EUA',
                    value: parseFloat(wbUnempData.value).toFixed(1),
                    date: wbUnempData.date,
                    icon: '👷', unit: '%',
                    note: 'Dado anual World Bank'
                });
            }
            
            // Fed Funds Rate — use the 3-Month T-Bill yield as real-time proxy
            if (yieldData['3M'] != null) {
                results.macroIndicators.push({
                    name: 'Fed Funds Rate (proxy 3M T-Bill)',
                    value: yieldData['3M'].toFixed(2),
                    date: new Date().toISOString().split('T')[0],
                    icon: '🏦', unit: '%',
                    note: 'Tempo real via Yahoo Finance'
                });
                if (yieldData['3M'] > 5) results.bigTechScore -= 0.5;
            }
            
            // 10Y Treasury Yield as inflation/rate expectations indicator
            if (yieldData['10Y'] != null) {
                results.macroIndicators.push({
                    name: 'US 10Y Treasury Yield',
                    value: yieldData['10Y'].toFixed(2),
                    date: new Date().toISOString().split('T')[0],
                    icon: '🏛️', unit: '%',
                    note: 'Tempo real via Yahoo Finance'
                });
            }
            
            // === FRED API INDICATORS (monthly, near real-time) ===
            // CPI from FRED (overrides World Bank if available)
            const fredCpiObs = fredCpi?.observations?.[0];
            if (fredCpiObs?.value && fredCpiObs.value !== '.') {
                const cpiVal = parseFloat(fredCpiObs.value);
                const existingCpi = results.macroIndicators.findIndex(m => m.name.includes('CPI'));
                const cpiEntry = {
                    name: 'CPI EUA (Índice Mensal)',
                    value: cpiVal.toFixed(1),
                    date: fredCpiObs.date,
                    icon: '📊', unit: '',
                    note: 'FRED API — mensal'
                };
                if (existingCpi >= 0) results.macroIndicators[existingCpi] = cpiEntry;
                else results.macroIndicators.push(cpiEntry);
            }
            
            // PCE from FRED
            const fredPceObs = fredPce?.observations?.[0];
            if (fredPceObs?.value && fredPceObs.value !== '.') {
                results.macroIndicators.push({
                    name: 'PCE Price Index',
                    value: parseFloat(fredPceObs.value).toFixed(1),
                    date: fredPceObs.date,
                    icon: '💵', unit: '',
                    note: 'FRED API — indicador preferido do Fed'
                });
            }
            
            // Unemployment from FRED (overrides World Bank if available)
            const fredUnempObs = fredUnemp?.observations?.[0];
            if (fredUnempObs?.value && fredUnempObs.value !== '.') {
                const unempVal = parseFloat(fredUnempObs.value);
                const existingUnemp = results.macroIndicators.findIndex(m => m.name.includes('Desemprego'));
                const unempEntry = {
                    name: 'Desemprego EUA',
                    value: unempVal.toFixed(1),
                    date: fredUnempObs.date,
                    icon: '👷', unit: '%',
                    note: 'FRED API — mensal'
                };
                if (existingUnemp >= 0) results.macroIndicators[existingUnemp] = unempEntry;
                else results.macroIndicators.push(unempEntry);
                if (unempVal > 5) results.bigTechScore -= 0.5;
            }
            
            // ISM Manufacturing PMI from FRED
            const fredIsmObs = fredIsm?.observations?.[0];
            if (fredIsmObs?.value && fredIsmObs.value !== '.') {
                const ismVal = parseFloat(fredIsmObs.value);
                results.macroIndicators.push({
                    name: 'ISM Manufacturing PMI',
                    value: ismVal.toFixed(1),
                    date: fredIsmObs.date,
                    icon: '🏭', unit: '',
                    note: ismVal >= 50 ? 'Expansão' : 'Contração'
                });
                if (ismVal < 48) results.bigTechScore -= 0.5;
                else if (ismVal > 55) results.bigTechScore += 0.3;
            }
            
            // Clamp score
            results.bigTechScore = Math.max(-5, Math.min(5, results.bigTechScore));
            
            // Recalculate final sentiment from total score
            if (results.bigTechScore >= 2) results.bigTechSentiment = 'RISK-ON';
            else if (results.bigTechScore >= 1) results.bigTechSentiment = 'POSITIVO';
            else if (results.bigTechScore <= -2) results.bigTechSentiment = 'RISK-OFF';
            else if (results.bigTechScore <= -1) results.bigTechSentiment = 'NEGATIVO';
            else results.bigTechSentiment = 'NEUTRO';
            
        } catch (err) {
        }
        
        return results;
    }

    // ========================================================================
    // 6. CONTEXTUAL SCORING (Non-Linear, Regime-Aware)
    // ========================================================================
    function applyContextualScoring(confluenceDetails, regime, marketStructure, cvdAdvanced, macroNews, volatility) {
        let adjustedScore = 0;
        const adjustments = [];
        const adjustedDetails = [];
        
        const isTrending = regime.regime === 'TRENDING_UP' || regime.regime === 'TRENDING_DOWN';
        const isRange = regime.regime === 'RANGING' || regime.regime === 'ACCUMULATION' || regime.regime === 'DISTRIBUTION';
        const trendDir = regime.regime === 'TRENDING_UP' ? 1 : regime.regime === 'TRENDING_DOWN' ? -1 : 0;
        
        for (const ind of confluenceDetails) {
            let effectiveWeight = ind.weight;
            let note = '';
            
            // === REGIME-BASED WEIGHT ADJUSTMENT ===
            
            // RSI: In strong trend, ignore counter-trend RSI signals
            if (ind.name.includes('RSI')) {
                if (isTrending) {
                    if ((trendDir > 0 && ind.signal === 'SHORT') || (trendDir < 0 && ind.signal === 'LONG')) {
                        effectiveWeight *= 0.3; // Reduce counter-trend RSI weight
                        note = `⚠️ RSI contra-tendência (${regime.regimeDescription}) — peso reduzido`;
                    } else if ((trendDir > 0 && ind.signal === 'LONG') || (trendDir < 0 && ind.signal === 'SHORT')) {
                        effectiveWeight *= 1.3;
                        note = `✅ RSI alinhado com tendência — peso aumentado`;
                    }
                } else if (isRange) {
                    effectiveWeight *= 1.5; // RSI is king in ranges
                    note = `📊 Mercado lateral — RSI tem peso MÁXIMO`;
                }
            }
            
            // Stochastic: Same logic as RSI
            if (ind.name.includes('Stochastic')) {
                if (isTrending) {
                    if ((trendDir > 0 && ind.signal === 'SHORT') || (trendDir < 0 && ind.signal === 'LONG')) {
                        effectiveWeight *= 0.3;
                        note = `⚠️ Estocástico contra-tendência — peso reduzido`;
                    }
                } else if (isRange) {
                    effectiveWeight *= 1.5;
                    note = `📊 Mercado lateral — Estocástico amplificado`;
                }
            }
            
            // EMA 200: Stronger in trends
            if (ind.name.includes('EMA 200')) {
                if (isTrending) {
                    effectiveWeight *= 1.5;
                    note = `🚀 Tendência ativa — EMA 200 tem peso MÁXIMO`;
                } else if (isRange) {
                    effectiveWeight *= 0.7;
                    note = `⚖️ Mercado lateral — EMA 200 menos relevante`;
                }
            }
            
            // MACD: Stronger in trends
            if (ind.name.includes('MACD')) {
                if (isTrending) {
                    effectiveWeight *= 1.3;
                    note = `🚀 Tendência ativa — MACD amplificado`;
                }
            }
            
            // Net Volume: more important in trends for confirmation
            if (ind.name.includes('Net Volume')) {
                if (isTrending) {
                    effectiveWeight *= 1.2;
                }
            }
            
            // Apply adjusted weight to score
            if (ind.signal === 'LONG') {
                adjustedScore += effectiveWeight;
            } else if (ind.signal === 'SHORT') {
                adjustedScore -= effectiveWeight;
            }
            
            adjustedDetails.push({
                ...ind,
                originalWeight: ind.weight,
                adjustedWeight: parseFloat(effectiveWeight.toFixed(1)),
                regimeNote: note
            });
        }
        
        // === ADD MARKET STRUCTURE SCORE ===
        if (marketStructure && marketStructure.structureScore !== 0) {
            adjustedScore += marketStructure.structureScore;
            adjustments.push({
                name: 'Estrutura de Mercado',
                score: marketStructure.structureScore,
                description: marketStructure.structureDescription
            });
        }
        
        // === ADD CVD ADVANCED SCORE ===
        if (cvdAdvanced && cvdAdvanced.score !== 0) {
            adjustedScore += cvdAdvanced.score;
            adjustments.push({
                name: 'CVD Avançado',
                score: cvdAdvanced.score,
                description: cvdAdvanced.description
            });
        }
        
        // === ADD MACRO/NEWS SCORE ===
        if (macroNews && macroNews.totalImpact !== 0) {
            adjustedScore += macroNews.totalImpact;
            adjustments.push({
                name: 'Macro + Notícias',
                score: macroNews.totalImpact,
                description: macroNews.criticalEventDescription || 
                    (macroNews.newsScore > 0 ? 'Notícias positivas' : macroNews.newsScore < 0 ? 'Notícias negativas/alerta' : 'Neutro')
            });
        }
        
        // === VOLATILITY PENALTY ===
        if (volatility && volatility.volRegime === 'EXTREME') {
            // In extreme volatility, reduce confidence but don't change direction
            const volPenalty = adjustedScore > 0 ? -1 : 1;
            adjustedScore += volPenalty;
            adjustments.push({
                name: 'Penalidade Volatilidade',
                score: volPenalty,
                description: 'Volatilidade extrema — confiança reduzida'
            });
        }
        
        // === SQUEEZE BONUS ===
        if (volatility && volatility.volRegime === 'SQUEEZE') {
            // Squeeze amplifies the signal direction
            const squeezeBonus = adjustedScore > 0 ? 1.5 : adjustedScore < 0 ? -1.5 : 0;
            if (squeezeBonus !== 0) {
                adjustedScore += squeezeBonus;
                adjustments.push({
                    name: 'Bônus Squeeze',
                    score: squeezeBonus,
                    description: 'Bollinger Squeeze → explosão na direção dominante amplificada'
                });
            }
        }
        
        return {
            adjustedScore,
            adjustedDetails,
            adjustments,
            originalScore: confluenceDetails.reduce((s, i) => {
                if (i.signal === 'LONG') return s + i.weight;
                if (i.signal === 'SHORT') return s - i.weight;
                return s;
            }, 0)
        };
    }

    // ========================================================================
    // 7. DYNAMIC TARGETS (ATR-based R:R)
    // ========================================================================
    function calculateDynamicTargets(signalType, currentPrice, atr1h, atr4h, poc, vah, val) {
        if (signalType === 'neutral' || !atr1h) {
            return { entry: null, sl: null, tp1: null, tp2: null, tp3: null, rr1: null, rr2: null, rr3: null };
        }
        
        const entry = currentPrice;
        const atr = atr1h;
        
        if (signalType === 'long') {
            const sl = Math.max(val * 0.998, currentPrice - atr * 1.5);
            const risk = entry - sl;
            
            const tp1 = poc > currentPrice ? poc : currentPrice + atr * 1.5;
            const tp2 = vah > currentPrice ? vah : currentPrice + atr * 2.5;
            const tp3 = currentPrice + atr * 4;
            
            return {
                entry,
                sl,
                tp1,
                tp2,
                tp3,
                rr1: risk > 0 ? ((tp1 - entry) / risk).toFixed(1) : '0',
                rr2: risk > 0 ? ((tp2 - entry) / risk).toFixed(1) : '0',
                rr3: risk > 0 ? ((tp3 - entry) / risk).toFixed(1) : '0',
                risk,
                riskPercent: ((risk / entry) * 100).toFixed(2)
            };
        } else {
            const sl = Math.min(vah * 1.002, currentPrice + atr * 1.5);
            const risk = sl - entry;
            
            const tp1 = poc < currentPrice ? poc : currentPrice - atr * 1.5;
            const tp2 = val < currentPrice ? val : currentPrice - atr * 2.5;
            const tp3 = currentPrice - atr * 4;
            
            return {
                entry,
                sl,
                tp1,
                tp2,
                tp3,
                rr1: risk > 0 ? ((entry - tp1) / risk).toFixed(1) : '0',
                rr2: risk > 0 ? ((entry - tp2) / risk).toFixed(1) : '0',
                rr3: risk > 0 ? ((entry - tp3) / risk).toFixed(1) : '0',
                risk,
                riskPercent: ((risk / entry) * 100).toFixed(2)
            };
        }
    }
    
    // ========================================================================
    // 8. IMPROVED LIQUIDATION MODEL (Funding-based leverage estimate)
    // ========================================================================
    function improvedLiquidationModel(currentPrice, openInterest, fundingRate, atr1h) {
        const oiValue = parseFloat(openInterest?.openInterest || 0);
        const funding = parseFloat(fundingRate?.fundingRate || 0) * 100;
        
        if (!oiValue) return null;
        
        // Estimate average leverage from funding rate
        // Higher funding → higher average leverage on long side
        let avgLeverage;
        if (Math.abs(funding) < 0.005) {
            avgLeverage = 8; // Normal
        } else if (funding > 0.03) {
            avgLeverage = 15; // High long leverage
        } else if (funding > 0.01) {
            avgLeverage = 12;
        } else if (funding < -0.03) {
            avgLeverage = 15; // High short leverage
        } else if (funding < -0.01) {
            avgLeverage = 12;
        } else {
            avgLeverage = 10;
        }
        
        // Volatility adjustment - high ATR means more spread out liquidations
        const volMultiplier = atr1h ? (atr1h / currentPrice) * 100 : 1;
        
        // Dynamic leverage distribution based on funding
        const leverageTiers = funding > 0.01 ? 
            [{ lev: 3, pct: 3 }, { lev: 5, pct: 8 }, { lev: 10, pct: 25 }, { lev: 20, pct: 30 }, { lev: 25, pct: 18 }, { lev: 50, pct: 10 }, { lev: 100, pct: 6 }] :
            funding < -0.01 ?
            [{ lev: 3, pct: 3 }, { lev: 5, pct: 8 }, { lev: 10, pct: 25 }, { lev: 20, pct: 30 }, { lev: 25, pct: 18 }, { lev: 50, pct: 10 }, { lev: 100, pct: 6 }] :
            [{ lev: 3, pct: 5 }, { lev: 5, pct: 15 }, { lev: 10, pct: 35 }, { lev: 20, pct: 25 }, { lev: 25, pct: 12 }, { lev: 50, pct: 5 }, { lev: 100, pct: 3 }];
        
        return {
            avgLeverage,
            leverageTiers,
            volMultiplier: volMultiplier.toFixed(2),
            description: `Alavancagem média estimada: ${avgLeverage}x (baseado em Funding ${funding.toFixed(4)}%)`
        };
    }

    // ========================================================================
    // UTILITY FUNCTIONS
    // ========================================================================
    function analyzeVolumeTrend(klines) {
        if (!klines || klines.length < 20) return { increasing: false, ratio: 0 };
        
        const recent = klines.slice(-10);
        const older = klines.slice(-20, -10);
        
        const recentVol = recent.reduce((s, k) => s + parseFloat(k[5]), 0) / recent.length;
        const olderVol = older.reduce((s, k) => s + parseFloat(k[5]), 0) / older.length;
        
        return {
            increasing: recentVol > olderVol * 1.1,
            decreasing: recentVol < olderVol * 0.9,
            ratio: olderVol > 0 ? (recentVol / olderVol - 1) : 0,
            recentAvg: recentVol,
            olderAvg: olderVol
        };
    }

    // ========================================================================
    // EXPORT TO WINDOW
    // ========================================================================
    window.TAEngineV2 = {
        detectMarketRegime,
        detectMarketStructure,
        calculateCVDAdvanced,
        calculateBollingerBands,
        calculateVolatilityMetrics,
        fetchMacroNewsLayer,
        fetchBigTechAndMacro,
        applyContextualScoring,
        calculateDynamicTargets,
        improvedLiquidationModel,
        // Sub-exports for testing
        findSwingPoints,
        analyzeStructure,
        detectLiquiditySweeps,
        analyzeVolumeTrend
    };
})();
