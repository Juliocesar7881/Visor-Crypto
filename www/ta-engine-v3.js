/**
 * TA Engine V3 â€” Advanced Trading Intelligence Engine
 * Visor Crypto â€” Institutional-Grade Quantitative Analysis
 * 
 * MODULES:
 *  1.  Crash / Black Swan Detector
 *  2.  Indicator Decorrelation Engine
 *  3.  Adaptive Weight Engine (Online Learning)
 *  4.  Position Sizing Engine (Kelly + ATR)
 *  5.  Virtual Trade Tracker & Forward Tester
 *  6.  On-Chain Analyzer
 *  7.  Multi-Exchange Aggregated CVD
 *  8.  Edge Calculator (Statistical Edge)
 *  9.  Rolling Correlation Engine (BTC vs TradFi)
 *  10. Non-Linear Scoring Engine
 *  11. Enhanced Regime Detector
 *  12. Master Enhancement Orchestrator
 *
 * Exports: window.TAEngineV3
 */
(function () {
    'use strict';

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // UTILS & STORAGE HELPERS
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const STORAGE_PREFIX = 'vc3_';
    const MAX_STORAGE_AGE_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

    function storageGet(key) {
        try {
            const raw = localStorage.getItem(STORAGE_PREFIX + key);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (parsed._ts && Date.now() - parsed._ts > MAX_STORAGE_AGE_MS) {
                localStorage.removeItem(STORAGE_PREFIX + key);
                return null;
            }
            return parsed.data;
        } catch { return null; }
    }

    function storageSet(key, data) {
        try {
            localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify({ data, _ts: Date.now() }));
        } catch (e) {
            // Quota exceeded â€” prune old entries
            pruneStorage();
            try { localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify({ data, _ts: Date.now() })); } catch {}
        }
    }

    function pruneStorage() {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith(STORAGE_PREFIX)) keys.push(k);
        }
        // Remove oldest 50%
        const items = keys.map(k => {
            try { return { k, ts: JSON.parse(localStorage.getItem(k))._ts || 0 }; } catch { return { k, ts: 0 }; }
        }).sort((a, b) => a.ts - b.ts);
        const half = Math.ceil(items.length / 2);
        for (let i = 0; i < half; i++) localStorage.removeItem(items[i].k);
    }

    function parseKlineClose(k) { return parseFloat(k[4]); }
    function parseKlineHigh(k) { return parseFloat(k[2]); }
    function parseKlineLow(k) { return parseFloat(k[3]); }
    function parseKlineOpen(k) { return parseFloat(k[1]); }
    function parseKlineVolume(k) { return parseFloat(k[5]); }
    function parseKlineTime(k) { return parseInt(k[0]); }

    function mean(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }
    function stddev(arr) {
        if (arr.length < 2) return 0;
        const m = mean(arr);
        return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1));
    }
    function sigmoid(x, k = 1) { return 2 / (1 + Math.exp(-k * x)) - 1; } // maps â„ â†’ (-1, 1)
    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
    function pearsonCorrelation(x, y) {
        const n = Math.min(x.length, y.length);
        if (n < 5) return 0;
        const mx = mean(x.slice(0, n)), my = mean(y.slice(0, n));
        let num = 0, dx2 = 0, dy2 = 0;
        for (let i = 0; i < n; i++) {
            const dx = x[i] - mx, dy = y[i] - my;
            num += dx * dy; dx2 += dx * dx; dy2 += dy * dy;
        }
        const den = Math.sqrt(dx2 * dy2);
        return den === 0 ? 0 : num / den;
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // MODULE 1: CRASH / BLACK SWAN DETECTOR
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    /**
     * Detects rapid price movements that invalidate oscillator-based signals.
     * When a crash is detected, oscillator "buy" signals are suppressed and
     * trend-following weights are boosted to prevent "catching a falling knife".
     */
    function detectCrashConditions(klines1m, klines5m, klines15m, klines1h, currentPrice) {
        const result = {
            isCrash: false,
            isRapidPump: false,
            severity: 'NONE',        // NONE | MINOR | MODERATE | SEVERE | BLACK_SWAN
            direction: 'neutral',    // 'down' | 'up' | 'neutral'
            rateOfChange: {},        // per window
            consecutiveRedCandles: 0,
            consecutiveGreenCandles: 0,
            volumeSpikeDetected: false,
            cascadingLiquidations: false,
            override: {
                suppressOscillatorBuy: false,
                suppressOscillatorSell: false,
                trendWeightMultiplier: 1.0,
                confidencePenalty: 0,
                message: null,
                icon: null
            }
        };

        // Helper: rate of change from klines
        function calcRoC(klines, lookback) {
            if (!klines || klines.length < lookback) return { roc: 0, red: 0, green: 0, volSpike: false };
            const slice = klines.slice(-lookback);
            const openPrice = parseKlineOpen(slice[0]);
            const roc = openPrice > 0 ? ((currentPrice - openPrice) / openPrice) * 100 : 0;

            let red = 0, green = 0, prevVol = 0, volIncreasing = true;
            for (let i = slice.length - 1; i >= 0; i--) {
                const c = parseKlineClose(slice[i]), o = parseKlineOpen(slice[i]);
                const vol = parseKlineVolume(slice[i]);
                if (c < o) { red++; } else if (c > o) { if (red === 0) green++; else break; } else break;
                if (i < slice.length - 1 && vol < prevVol * 0.8) volIncreasing = false;
                prevVol = vol;
                if (c >= o && red > 0) break;
                if (c <= o && green > 0) break;
            }
            // Volume spike: recent volume > 3x average
            const avgVol = mean(klines.slice(-Math.min(60, klines.length)).map(parseKlineVolume));
            const recentVol = mean(slice.slice(-3).map(parseKlineVolume));
            const volSpike = recentVol > avgVol * 3;

            return { roc, red, green, volSpike, volIncreasing };
        }

        const w1m = calcRoC(klines1m, 5);    // last 5 min
        const w5m = calcRoC(klines5m, 6);    // last 30 min
        const w15m = calcRoC(klines15m, 4);  // last 1h
        const w1h = calcRoC(klines1h, 4);    // last 4h

        result.rateOfChange = {
            '5min': w1m.roc,
            '30min': w5m.roc,
            '1h': w15m.roc,
            '4h': w1h.roc
        };
        result.consecutiveRedCandles = Math.max(w1m.red, w5m.red, w15m.red);
        result.consecutiveGreenCandles = Math.max(w1m.green, w5m.green, w15m.green);
        result.volumeSpikeDetected = w1m.volSpike || w5m.volSpike;

        // Determine severity
        const absRoC5m = Math.abs(w1m.roc);
        const absRoC30m = Math.abs(w5m.roc);
        const absRoC1h = Math.abs(w15m.roc);
        const absRoC4h = Math.abs(w1h.roc);

        const dominant = w1m.roc < 0 || w5m.roc < 0 || w15m.roc < 0 ? 'down' : 'up';
        result.direction = dominant;

        // Cascading liquidation pattern: sharp drop + volume spike + consecutive reds
        if (dominant === 'down' && result.consecutiveRedCandles >= 4 && result.volumeSpikeDetected) {
            result.cascadingLiquidations = true;
        }

        // Severity thresholds (tuned for crypto volatility)
        if (absRoC5m > 8 || absRoC30m > 12 || absRoC1h > 15 || absRoC4h > 20) {
            result.severity = 'BLACK_SWAN';
        } else if (absRoC5m > 5 || absRoC30m > 8 || absRoC1h > 10 || absRoC4h > 15) {
            result.severity = 'SEVERE';
        } else if (absRoC5m > 3 || absRoC30m > 5 || absRoC1h > 7 || absRoC4h > 10) {
            result.severity = 'MODERATE';
        } else if (absRoC5m > 1.5 || absRoC30m > 3 || absRoC1h > 4) {
            result.severity = 'MINOR';
        }

        result.isCrash = (result.severity === 'SEVERE' || result.severity === 'BLACK_SWAN') && dominant === 'down';
        result.isRapidPump = (result.severity === 'SEVERE' || result.severity === 'BLACK_SWAN') && dominant === 'up';

        // Apply overrides
        const sev = { NONE: 0, MINOR: 1, MODERATE: 2, SEVERE: 3, BLACK_SWAN: 4 }[result.severity];

        if (sev >= 2) {
            if (dominant === 'down') {
                result.override.suppressOscillatorBuy = true;
                result.override.trendWeightMultiplier = 1.5 + sev * 0.3;
                result.override.confidencePenalty = sev * 5;
                result.override.icon = 'ðŸš¨';
                result.override.message = sev >= 3
                    ? `CRASH DETECTADO (${result.severity}): Queda de ${Math.abs(w5m.roc).toFixed(1)}% em 30min. Sinais de compra DESATIVADOS. NÃ£o compre durante queda livre.`
                    : `QUEDA ACENTUADA (${result.severity}): Osciladores de compra com peso reduzido.`;
            } else {
                result.override.suppressOscillatorSell = true;
                result.override.trendWeightMultiplier = 1.5 + sev * 0.3;
                result.override.confidencePenalty = sev * 5;
                result.override.icon = 'ðŸš€';
                result.override.message = sev >= 3
                    ? `PUMP VIOLENTO (${result.severity}): Alta de ${w5m.roc.toFixed(1)}% em 30min. Sinais de venda DESATIVADOS. Evite shorts em pump.`
                    : `ALTA RÃPIDA (${result.severity}): Osciladores de venda com peso reduzido.`;
            }
        }

        return result;
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // MODULE 2: INDICATOR DECORRELATION ENGINE
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    /**
     * Groups indicators by family and reduces effective weight of redundant signals.
     * Prevents 3 momentum oscillators all saying "BUY" from triple-counting.
     * 
     * Families:
     *   MOMENTUM: RSI (all TFs), Stochastic, MACD (histogram direction)
     *   TREND:    EMA 200, ADX
     *   VOLUME:   Net Volume, CVD
     *   PRICE:    VWAP, Volume Profile location
     *   LEVERAGE: Liquidations, Funding
     */
    function decorrelateIndicators(confluenceDetails, crashState) {
        const families = {
            MOMENTUM: { indicators: [], maxEffectiveSignals: 2 },
            TREND: { indicators: [], maxEffectiveSignals: 2 },
            VOLUME: { indicators: [], maxEffectiveSignals: 2 },
            PRICE: { indicators: [], maxEffectiveSignals: 1 },
            LEVERAGE: { indicators: [], maxEffectiveSignals: 1 }
        };

        // Classify each indicator into a family
        const familyMap = {
            'RSI 15m': 'MOMENTUM', 'RSI 1h': 'MOMENTUM', 'RSI 4h': 'MOMENTUM',
            'Stochastic 1h': 'MOMENTUM',
            'MACD 1h': 'MOMENTUM', 'MACD 4h': 'MOMENTUM',
            'EMA 200 (1h)': 'TREND', 'EMA 200 (4h)': 'TREND',
            'ADX 1h': 'TREND',
            'Net Volume 1h': 'VOLUME', 'Net Volume 4h': 'VOLUME',
            'VWAP': 'PRICE',
            'Liq. Estimadas': 'LEVERAGE'
        };

        const adjusted = confluenceDetails.map(ind => ({ ...ind, originalWeight: ind.weight }));

        // Group
        adjusted.forEach(ind => {
            const fam = familyMap[ind.name] || 'OTHER';
            if (families[fam]) families[fam].indicators.push(ind);
        });

        // Apply decorrelation within each family
        Object.values(families).forEach(fam => {
            const aligned = fam.indicators.filter(i => i.signal !== 'NEUTRO');
            if (aligned.length <= fam.maxEffectiveSignals) return;

            // Sort by absolute weight (strongest first)
            aligned.sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));

            // Keep strongest at full weight, reduce others
            for (let i = fam.maxEffectiveSignals; i < aligned.length; i++) {
                const decay = 0.4; // reduce redundant signals to 40%
                aligned[i].weight = +(aligned[i].weight * decay).toFixed(2);
                aligned[i].decorrelated = true;
            }
        });

        // Crash override: if crash detected, suppress oscillator buys
        if (crashState && crashState.override) {
            adjusted.forEach(ind => {
                const isMomentum = familyMap[ind.name] === 'MOMENTUM';
                if (isMomentum) {
                    if (crashState.override.suppressOscillatorBuy && ind.signal === 'LONG') {
                        ind.weight = +(ind.weight * 0.1).toFixed(2); // nearly zero
                        ind.crashOverridden = true;
                    }
                    if (crashState.override.suppressOscillatorSell && ind.signal === 'SHORT') {
                        ind.weight = +(ind.weight * 0.1).toFixed(2);
                        ind.crashOverridden = true;
                    }
                }
                // Boost trend indicators during crash
                const isTrend = familyMap[ind.name] === 'TREND';
                if (isTrend && crashState.override.trendWeightMultiplier > 1) {
                    ind.weight = +(ind.weight * crashState.override.trendWeightMultiplier).toFixed(2);
                    ind.crashBoosted = true;
                }
            });
        }

        // Calculate adjusted score
        let adjustedScore = 0;
        adjusted.forEach(ind => {
            if (ind.signal === 'LONG') adjustedScore += Math.abs(ind.weight);
            else if (ind.signal === 'SHORT') adjustedScore -= Math.abs(ind.weight);
        });

        return {
            details: adjusted,
            adjustedScore,
            decorrelationApplied: true,
            familyBreakdown: Object.fromEntries(
                Object.entries(families).map(([k, v]) => [k, {
                    count: v.indicators.length,
                    aligned: v.indicators.filter(i => i.signal !== 'NEUTRO').length,
                    reduced: v.indicators.filter(i => i.decorrelated).length
                }])
            )
        };
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // MODULE 3: ADAPTIVE WEIGHT ENGINE (Online Learning)
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    /**
     * Tracks which indicators actually predicted correctly.
     * Uses exponential weighted moving average (EWMA) of recent accuracy.
     * Weights evolve: weight = base Ã— (0.5 + 0.5 Ã— recentAccuracy)
     * 
     * Half-life: ~30 signals (recent signals matter more)
     */
    const ADAPTIVE_ALPHA = 0.05; // EWMA smoothing factor

    function getAdaptiveWeights(symbol) {
        const key = 'adaptive_' + symbol;
        const stored = storageGet(key);
        if (!stored) return null; // no history yet

        const weights = {};
        for (const [name, stats] of Object.entries(stored)) {
            if (stats.count < 5) continue; // need minimum signals
            const accuracy = stats.ewmaAccuracy;
            // Weight multiplier: 0.5 (very bad) to 1.5 (very good)
            weights[name] = 0.5 + accuracy; // accuracy is 0 to 1, so range is 0.5 to 1.5
        }
        return Object.keys(weights).length > 0 ? weights : null;
    }

    function updateAdaptiveWeights(symbol, indicatorResults) {
        // indicatorResults: [{ name, signal, wasCorrect }]
        const key = 'adaptive_' + symbol;
        const stored = storageGet(key) || {};

        indicatorResults.forEach(({ name, wasCorrect }) => {
            if (!stored[name]) {
                stored[name] = { ewmaAccuracy: 0.5, count: 0 };
            }
            const s = stored[name];
            const correctVal = wasCorrect ? 1 : 0;
            s.ewmaAccuracy = ADAPTIVE_ALPHA * correctVal + (1 - ADAPTIVE_ALPHA) * s.ewmaAccuracy;
            s.count++;
        });

        storageSet(key, stored);
    }

    function applyAdaptiveWeights(confluenceDetails, symbol) {
        const weights = getAdaptiveWeights(symbol);
        if (!weights) return confluenceDetails; // no history

        return confluenceDetails.map(ind => {
            const mult = weights[ind.name];
            if (mult !== undefined) {
                return { ...ind, weight: +(ind.weight * mult).toFixed(2), adaptiveMultiplier: mult };
            }
            return ind;
        });
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // MODULE 4: POSITION SIZING ENGINE
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    /**
     * Calculates recommended position size based on:
     *   - Modified Kelly Criterion
     *   - ATR-based volatility adjustment
     *   - Confidence level from analysis
     *   - Crash state (reduce during crashes)
     *   - Edge statistics (from trade tracker)
     */
    function calculatePositionSize(params) {
        const {
            signalType,    // 'long' | 'short' | 'neutral'
            confidence,    // 0-95
            probability,   // 5-95
            atr,
            currentPrice,
            stopLoss,
            crashState,
            edgeStats,
            portfolioBalance = 10000 // default reference
        } = params;

        if (signalType === 'neutral') {
            return {
                recommendation: 'SEM POSIÃ‡ÃƒO',
                sizePercent: 0,
                kellyFraction: 0,
                riskPerTrade: 0,
                contracts: 0,
                reasoning: 'Sinal neutro â€” nenhuma posiÃ§Ã£o recomendada.',
                riskLevel: 'NONE',
                icon: 'â¸ï¸'
            };
        }

        // 1. Kelly Criterion (half-Kelly for safety)
        const winRate = Math.max(0.3, Math.min(0.85, probability / 100));
        const avgWin = atr && stopLoss ? Math.abs(currentPrice - stopLoss) * 2 : atr * 2;
        const avgLoss = atr && stopLoss ? Math.abs(currentPrice - stopLoss) : atr;
        const b = avgLoss > 0 ? avgWin / avgLoss : 2;
        const kellyFull = (winRate * b - (1 - winRate)) / b;
        const kellyHalf = Math.max(0, kellyFull / 2); // half-Kelly

        // 2. Confidence adjustment
        const confMultiplier = clamp(confidence / 70, 0.3, 1.5);

        // 3. Crash penalty
        const crashMultiplier = crashState && crashState.isCrash ? 0.25 :
            crashState && crashState.severity === 'MODERATE' ? 0.5 : 1.0;

        // 4. Edge adjustment
        let edgeMultiplier = 1.0;
        if (edgeStats && edgeStats.totalTrades >= 10) {
            if (edgeStats.edge > 0.03) edgeMultiplier = 1.2;       // proven edge
            else if (edgeStats.edge < -0.01) edgeMultiplier = 0.5;  // negative edge
        }

        // 5. Calculate final size
        let sizePercent = kellyHalf * 100 * confMultiplier * crashMultiplier * edgeMultiplier;
        sizePercent = clamp(sizePercent, 0.5, 15); // 0.5% to 15% max

        // ATR-based risk check
        const atrPercent = currentPrice > 0 ? (atr / currentPrice) * 100 : 2;
        if (atrPercent > 5) sizePercent *= 0.5; // high volatility = smaller position

        sizePercent = +sizePercent.toFixed(1);

        // Risk per trade in dollars
        const riskPerTrade = +(portfolioBalance * sizePercent / 100).toFixed(2);

        let riskLevel, recommendation, icon;
        if (sizePercent <= 2) { riskLevel = 'CONSERVADOR'; icon = 'ðŸŸ¢'; recommendation = `Entrada conservadora: ${sizePercent}% da banca`; }
        else if (sizePercent <= 5) { riskLevel = 'MODERADO'; icon = 'ðŸŸ¡'; recommendation = `Entrada moderada: ${sizePercent}% da banca`; }
        else if (sizePercent <= 10) { riskLevel = 'AGRESSIVO'; icon = 'ðŸŸ '; recommendation = `Entrada agressiva: ${sizePercent}% da banca (alta confianÃ§a)`; }
        else { riskLevel = 'MÃXIMO'; icon = 'ðŸ”´'; recommendation = `PosiÃ§Ã£o mÃ¡xima: ${sizePercent}% (somente com edge comprovado)`; }

        return {
            recommendation,
            sizePercent,
            kellyFraction: +(kellyHalf * 100).toFixed(1),
            riskPerTrade,
            contracts: currentPrice > 0 ? +(riskPerTrade / currentPrice).toFixed(6) : 0,
            riskLevel,
            icon,
            reasoning: `KellyÂ½=${(kellyHalf * 100).toFixed(1)}% Ã— Conf=${confMultiplier.toFixed(2)} Ã— Crash=${crashMultiplier} Ã— Edge=${edgeMultiplier.toFixed(1)} â†’ ${sizePercent}%`,
            breakdown: {
                kellyHalf: +(kellyHalf * 100).toFixed(1),
                confMultiplier: +confMultiplier.toFixed(2),
                crashMultiplier,
                edgeMultiplier: +edgeMultiplier.toFixed(1),
                atrPercent: +atrPercent.toFixed(2)
            }
        };
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // MODULE 5: VIRTUAL TRADE TRACKER & FORWARD TESTER
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    /**
     * Saves every signal generated. On subsequent analyses, checks past signals
     * against current price data to determine outcomes. Builds a performance
     * database over time â€” the "forward testing" backtester.
     */
    function trackVirtualTrade(symbol, analysis) {
        const key = 'trades_' + symbol;
        const trades = storageGet(key) || [];

        const trade = {
            id: Date.now(),
            timestamp: Date.now(),
            symbol,
            signal: analysis.signal,
            signalType: analysis.signalType,
            score: parseFloat(analysis.confluenceSummary?.score || 0),
            confidence: analysis.confidence,
            probability: analysis.probability,
            entryPrice: analysis.entry || analysis.indicators?.movingAverages?.currentPrice,
            stopLoss: analysis.stopLoss,
            tp1: analysis.dynamicTargets?.tp1,
            tp2: analysis.dynamicTargets?.tp2,
            tp3: analysis.dynamicTargets?.tp3,
            regime: analysis.marketRegime?.regime,
            outcome: null, // filled later
            exitPrice: null,
            pnlPercent: null,
            indicatorSignals: (analysis.confluenceDetails || []).map(d => ({
                name: d.name, signal: d.signal, weight: d.weight
            }))
        };

        // Only track actual signals (not neutral)
        if (trade.signal === 'NEUTRO') return;

        // Avoid duplicate (same symbol within 30min)
        const recent = trades.filter(t => Date.now() - t.timestamp < 30 * 60 * 1000);
        if (recent.length > 0) return;

        trades.push(trade);

        // Keep last 200 trades per symbol
        while (trades.length > 200) trades.shift();

        storageSet(key, trades);
    }

    function evaluatePendingTrades(symbol, klines1h, currentPrice) {
        const key = 'trades_' + symbol;
        const trades = storageGet(key) || [];
        if (trades.length === 0) return [];

        let updated = false;

        trades.forEach(trade => {
            if (trade.outcome !== null) return; // already evaluated
            if (!trade.entryPrice) return;

            // Need at least 1h of data since trade
            const ageMs = Date.now() - trade.timestamp;
            if (ageMs < 60 * 60 * 1000) return; // wait at least 1h

            // Check klines after trade time
            const entryPrice = trade.entryPrice;
            const isLong = trade.signalType === 'long';

            let hitTP1 = false, hitTP2 = false, hitTP3 = false, hitSL = false;
            let maxFavorable = 0, maxAdverse = 0;

            if (klines1h && klines1h.length > 0) {
                for (const k of klines1h) {
                    const kTime = parseKlineTime(k);
                    if (kTime <= trade.timestamp) continue;

                    const high = parseKlineHigh(k);
                    const low = parseKlineLow(k);

                    if (isLong) {
                        maxFavorable = Math.max(maxFavorable, (high - entryPrice) / entryPrice);
                        maxAdverse = Math.max(maxAdverse, (entryPrice - low) / entryPrice);
                        if (trade.tp1 && high >= trade.tp1) hitTP1 = true;
                        if (trade.tp2 && high >= trade.tp2) hitTP2 = true;
                        if (trade.tp3 && high >= trade.tp3) hitTP3 = true;
                        if (trade.stopLoss && low <= trade.stopLoss) hitSL = true;
                    } else {
                        maxFavorable = Math.max(maxFavorable, (entryPrice - low) / entryPrice);
                        maxAdverse = Math.max(maxAdverse, (high - entryPrice) / entryPrice);
                        if (trade.tp1 && low <= trade.tp1) hitTP1 = true;
                        if (trade.tp2 && low <= trade.tp2) hitTP2 = true;
                        if (trade.tp3 && low <= trade.tp3) hitTP3 = true;
                        if (trade.stopLoss && high >= trade.stopLoss) hitSL = true;
                    }
                }
            }

            // Evaluate if enough time has passed (4h+) or if SL/TP hit
            if (ageMs > 4 * 60 * 60 * 1000 || hitSL || hitTP2) {
                if (hitSL && !hitTP1) {
                    trade.outcome = 'LOSS';
                    trade.exitPrice = trade.stopLoss;
                    trade.pnlPercent = isLong
                        ? -((entryPrice - trade.stopLoss) / entryPrice) * 100
                        : -((trade.stopLoss - entryPrice) / entryPrice) * 100;
                } else if (hitTP2) {
                    trade.outcome = 'WIN_TP2';
                    trade.exitPrice = trade.tp2;
                    trade.pnlPercent = isLong
                        ? ((trade.tp2 - entryPrice) / entryPrice) * 100
                        : ((entryPrice - trade.tp2) / entryPrice) * 100;
                } else if (hitTP1) {
                    trade.outcome = 'WIN_TP1';
                    trade.exitPrice = trade.tp1;
                    trade.pnlPercent = isLong
                        ? ((trade.tp1 - entryPrice) / entryPrice) * 100
                        : ((entryPrice - trade.tp1) / entryPrice) * 100;
                } else if (ageMs > 24 * 60 * 60 * 1000) {
                    // Timed out after 24h â€” evaluate at current price
                    const pnl = isLong
                        ? ((currentPrice - entryPrice) / entryPrice) * 100
                        : ((entryPrice - currentPrice) / entryPrice) * 100;
                    trade.outcome = pnl > 0 ? 'WIN_TIME' : 'LOSS_TIME';
                    trade.exitPrice = currentPrice;
                    trade.pnlPercent = +pnl.toFixed(2);
                }

                trade.maxFavorableExcursion = +(maxFavorable * 100).toFixed(2);
                trade.maxAdverseExcursion = +(maxAdverse * 100).toFixed(2);
                updated = true;

                // Also update adaptive weights
                if (trade.indicatorSignals && trade.outcome) {
                    const wasWin = trade.outcome.startsWith('WIN');
                    const indResults = trade.indicatorSignals
                        .filter(i => i.signal !== 'NEUTRO')
                        .map(i => ({
                            name: i.name,
                            wasCorrect: (i.signal === 'LONG' && wasWin && trade.signalType === 'long') ||
                                (i.signal === 'SHORT' && wasWin && trade.signalType === 'short') ||
                                (i.signal === 'LONG' && !wasWin && trade.signalType === 'short') ||
                                (i.signal === 'SHORT' && !wasWin && trade.signalType === 'long')
                        }));
                    updateAdaptiveWeights(symbol, indResults);
                }
            }
        });

        if (updated) storageSet(key, trades);
        return trades.filter(t => t.outcome !== null);
    }

    function getPerformanceStats(symbol) {
        // If symbol provided, get for that symbol. Otherwise aggregate all.
        const allKeys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith(STORAGE_PREFIX + 'trades_')) {
                if (symbol && !k.endsWith(symbol)) continue;
                allKeys.push(k);
            }
        }

        let allTrades = [];
        allKeys.forEach(k => {
            try {
                const data = JSON.parse(localStorage.getItem(k));
                if (data && data.data) allTrades = allTrades.concat(data.data);
            } catch {}
        });

        const evaluated = allTrades.filter(t => t.outcome !== null);
        if (evaluated.length === 0) {
            return {
                totalTrades: 0, wins: 0, losses: 0,
                winRate: 0, avgWinPnl: 0, avgLossPnl: 0,
                profitFactor: 0, edge: 0, expectancy: 0,
                maxDrawdown: 0, sharpeApprox: 0,
                byRegime: {}, byScoreBucket: {},
                message: 'Ainda sem dados suficientes. O sistema coleta sinais e avalia automaticamente.'
            };
        }

        const wins = evaluated.filter(t => t.outcome.startsWith('WIN'));
        const losses = evaluated.filter(t => !t.outcome.startsWith('WIN'));
        const winRate = wins.length / evaluated.length;
        const avgWinPnl = wins.length > 0 ? mean(wins.map(t => t.pnlPercent || 0)) : 0;
        const avgLossPnl = losses.length > 0 ? mean(losses.map(t => Math.abs(t.pnlPercent || 0))) : 0;
        const profitFactor = avgLossPnl > 0 ? (winRate * avgWinPnl) / ((1 - winRate) * avgLossPnl) : 0;
        const edge = (winRate * avgWinPnl / 100) - ((1 - winRate) * avgLossPnl / 100);
        const expectancy = winRate * avgWinPnl - (1 - winRate) * avgLossPnl;

        // By regime
        const byRegime = {};
        evaluated.forEach(t => {
            const r = t.regime || 'UNKNOWN';
            if (!byRegime[r]) byRegime[r] = { wins: 0, total: 0 };
            byRegime[r].total++;
            if (t.outcome.startsWith('WIN')) byRegime[r].wins++;
        });
        Object.values(byRegime).forEach(r => { r.winRate = +(r.wins / r.total * 100).toFixed(1); });

        // By score bucket
        const byScoreBucket = { '4-6': { w: 0, t: 0 }, '6-10': { w: 0, t: 0 }, '10+': { w: 0, t: 0 } };
        evaluated.forEach(t => {
            const s = Math.abs(t.score || 0);
            const bucket = s >= 10 ? '10+' : s >= 6 ? '6-10' : '4-6';
            byScoreBucket[bucket].t++;
            if (t.outcome.startsWith('WIN')) byScoreBucket[bucket].w++;
        });
        Object.entries(byScoreBucket).forEach(([k, v]) => {
            v.winRate = v.t > 0 ? +(v.w / v.t * 100).toFixed(1) : 0;
        });

        // Max drawdown (sequential losses)
        let dd = 0, maxDd = 0;
        evaluated.forEach(t => {
            dd += t.pnlPercent || 0;
            if (dd < maxDd) maxDd = dd;
        });

        // Approximate Sharpe
        const pnls = evaluated.map(t => t.pnlPercent || 0);
        const avgPnl = mean(pnls);
        const pnlStd = stddev(pnls);
        const sharpe = pnlStd > 0 ? avgPnl / pnlStd : 0;

        return {
            totalTrades: evaluated.length,
            wins: wins.length,
            losses: losses.length,
            winRate: +(winRate * 100).toFixed(1),
            avgWinPnl: +avgWinPnl.toFixed(2),
            avgLossPnl: +avgLossPnl.toFixed(2),
            profitFactor: +profitFactor.toFixed(2),
            edge: +edge.toFixed(4),
            expectancy: +expectancy.toFixed(2),
            maxDrawdown: +maxDd.toFixed(2),
            sharpeApprox: +sharpe.toFixed(2),
            byRegime,
            byScoreBucket
        };
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // MODULE 6: ON-CHAIN ANALYZER
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    /**
     * Fetches on-chain data for BTC:
     *   - Mempool size (network congestion)
     *   - Hash rate trend
     *   - Estimated exchange net flow
     *   - Stablecoin supply signals
     * 
     * Uses free APIs: blockchain.info, blockchair
     */
    async function fetchOnChainData(symbol) {
        const result = {
            available: false,
            exchangeNetFlow: null,    // positive = inflow (sell pressure), negative = outflow (accumulation)
            mempoolSize: null,
            hashRate: null,
            stablecoinSignal: null,
            onChainScore: 0,
            details: [],
            timestamp: Date.now()
        };

        // Only for BTC/ETH based pairs
        const baseSymbol = symbol.replace('USDT', '').replace('BUSD', '');
        if (!['BTC', 'ETH'].includes(baseSymbol)) {
            result.details.push({ name: 'On-Chain', value: 'DisponÃ­vel somente para BTC/ETH', signal: 'N/A' });
            return result;
        }

        try {
            const fetches = [];

            if (baseSymbol === 'BTC') {
                // Mempool size (unconfirmed transactions)
                fetches.push(
                    fetch('https://api.blockchain.info/charts/mempool-size?timespan=2days&format=json&cors=true')
                        .then(r => r.json()).catch(() => null)
                );
                // Hash rate (30 days)
                fetches.push(
                    fetch('https://api.blockchain.info/charts/hash-rate?timespan=30days&format=json&cors=true')
                        .then(r => r.json()).catch(() => null)
                );
                // Exchange volume estimation
                fetches.push(
                    fetch('https://api.blockchain.info/charts/estimated-transaction-volume-usd?timespan=7days&format=json&cors=true')
                        .then(r => r.json()).catch(() => null)
                );
            }

            // Stablecoin supply (USDT market cap as proxy)
            fetches.push(
                fetch('https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=usd&include_market_cap=true')
                    .then(r => r.json()).catch(() => null)
            );

            const results = await Promise.all(fetches);

            if (baseSymbol === 'BTC') {
                // Mempool analysis
                const mempool = results[0];
                if (mempool && mempool.values && mempool.values.length > 1) {
                    const recent = mempool.values[mempool.values.length - 1].y;
                    const prev = mempool.values[Math.max(0, mempool.values.length - 12)].y;
                    result.mempoolSize = recent;
                    const mempoolChange = prev > 0 ? ((recent - prev) / prev) * 100 : 0;

                    if (mempoolChange > 50) {
                        result.onChainScore -= 0.5;
                        result.details.push({ name: 'Mempool', value: `Congestionado (+${mempoolChange.toFixed(0)}%)`, signal: 'BEARISH', color: '#ef4444' });
                    } else if (mempoolChange < -30) {
                        result.onChainScore += 0.5;
                        result.details.push({ name: 'Mempool', value: `Descongestionando (${mempoolChange.toFixed(0)}%)`, signal: 'BULLISH', color: '#22c55e' });
                    } else {
                        result.details.push({ name: 'Mempool', value: `Normal`, signal: 'NEUTRO', color: '#94a3b8' });
                    }
                }

                // Hash rate trend
                const hashData = results[1];
                if (hashData && hashData.values && hashData.values.length > 7) {
                    const vals = hashData.values;
                    const recent7 = mean(vals.slice(-7).map(v => v.y));
                    const prev7 = mean(vals.slice(-14, -7).map(v => v.y));
                    result.hashRate = recent7;
                    const hrChange = prev7 > 0 ? ((recent7 - prev7) / prev7) * 100 : 0;

                    if (hrChange > 5) {
                        result.onChainScore += 1;
                        result.details.push({ name: 'Hash Rate', value: `Subindo (+${hrChange.toFixed(1)}%)`, signal: 'BULLISH', color: '#22c55e' });
                    } else if (hrChange < -5) {
                        result.onChainScore -= 1;
                        result.details.push({ name: 'Hash Rate', value: `Caindo (${hrChange.toFixed(1)}%)`, signal: 'BEARISH', color: '#ef4444' });
                    } else {
                        result.details.push({ name: 'Hash Rate', value: `EstÃ¡vel`, signal: 'NEUTRO', color: '#94a3b8' });
                    }
                }

                // Transaction volume trend (proxy for exchange flows)
                const txVol = results[2];
                if (txVol && txVol.values && txVol.values.length > 2) {
                    const vals = txVol.values;
                    const recentVol = vals[vals.length - 1].y;
                    const avgVol = mean(vals.slice(-7).map(v => v.y));
                    const volRatio = avgVol > 0 ? recentVol / avgVol : 1;

                    if (volRatio > 1.5) {
                        result.details.push({ name: 'Volume On-Chain', value: `Alto (${(volRatio * 100).toFixed(0)}% da mÃ©dia)`, signal: 'ATIVO', color: '#eab308' });
                    } else if (volRatio < 0.5) {
                        result.details.push({ name: 'Volume On-Chain', value: `Baixo(${(volRatio * 100).toFixed(0)}% da mÃ©dia)`, signal: 'INATIVO', color: '#94a3b8' });
                    } else {
                        result.details.push({ name: 'Volume On-Chain', value: 'Normal', signal: 'NEUTRO', color: '#94a3b8' });
                    }
                }
            }

            // Stablecoin supply signal
            const stableIdx = baseSymbol === 'BTC' ? 3 : 0;
            const stableData = results[stableIdx];
            if (stableData && stableData.tether) {
                const usdtMcap = stableData.tether.usd_market_cap;
                // Store for trend comparison
                const prevMcap = storageGet('usdt_mcap');
                if (prevMcap && prevMcap.value) {
                    const mcapChange = ((usdtMcap - prevMcap.value) / prevMcap.value) * 100;
                    if (mcapChange > 1) {
                        result.onChainScore += 1;
                        result.stablecoinSignal = 'GROWING';
                        result.details.push({ name: 'Stablecoin Supply', value: `USDT crescendo (+${mcapChange.toFixed(1)}%)`, signal: 'BULLISH', color: '#22c55e' });
                    } else if (mcapChange < -1) {
                        result.onChainScore -= 1;
                        result.stablecoinSignal = 'SHRINKING';
                        result.details.push({ name: 'Stablecoin Supply', value: `USDT encolhendo (${mcapChange.toFixed(1)}%)`, signal: 'BEARISH', color: '#ef4444' });
                    } else {
                        result.stablecoinSignal = 'STABLE';
                        result.details.push({ name: 'Stablecoin Supply', value: 'EstÃ¡vel', signal: 'NEUTRO', color: '#94a3b8' });
                    }
                }
                storageSet('usdt_mcap', { value: usdtMcap, ts: Date.now() });
            }

            result.available = result.details.length > 0;
            result.onChainScore = clamp(result.onChainScore, -3, 3);
        } catch (e) {
            result.details.push({ name: 'On-Chain', value: 'Erro ao buscar dados', signal: 'ERROR' });
        }

        return result;
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // MODULE 7: MULTI-EXCHANGE AGGREGATED CVD
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    /**
     * Fetches recent trades from Bybit to complement Binance CVD.
     * True market picture requires seeing multiple venues.
     */
    async function fetchMultiExchangeCVD(symbol) {
        const result = {
            exchanges: {},
            aggregatedDelta: 0,
            aggregatedSignal: 'NEUTRO',
            divergence: false,           // Binance bullish but Bybit bearish = divergence
            divergenceDescription: null,
            score: 0
        };

        try {
            // Bybit perpetual trades
            const bybitSymbol = symbol; // BTCUSDT works on Bybit too
            const bybitTrades = await fetch(
                `https://api.bybit.com/v5/market/recent-trade?category=linear&symbol=${bybitSymbol}&limit=500`
            ).then(r => r.json()).catch(() => null);

            if (bybitTrades && bybitTrades.result && bybitTrades.result.list) {
                let buyVol = 0, sellVol = 0;
                bybitTrades.result.list.forEach(t => {
                    const qty = parseFloat(t.size || 0) * parseFloat(t.price || 0);
                    if (t.side === 'Buy') buyVol += qty;
                    else sellVol += qty;
                });
                const bybitDelta = buyVol - sellVol;
                const bybitTotal = buyVol + sellVol;
                result.exchanges.bybit = {
                    buyVolume: buyVol,
                    sellVolume: sellVol,
                    delta: bybitDelta,
                    ratio: bybitTotal > 0 ? ((bybitDelta / bybitTotal) * 100).toFixed(2) + '%' : '0%'
                };
            }
        } catch {}

        try {
            // OKX trades
            const okxSymbol = symbol.replace('USDT', '-USDT-SWAP');
            const okxTrades = await fetch(
                `https://www.okx.com/api/v5/market/trades?instId=${okxSymbol}&limit=100`
            ).then(r => r.json()).catch(() => null);

            if (okxTrades && okxTrades.data) {
                let buyVol = 0, sellVol = 0;
                okxTrades.data.forEach(t => {
                    const qty = parseFloat(t.sz || 0) * parseFloat(t.px || 0);
                    if (t.side === 'buy') buyVol += qty;
                    else sellVol += qty;
                });
                const delta = buyVol - sellVol;
                const total = buyVol + sellVol;
                result.exchanges.okx = {
                    buyVolume: buyVol,
                    sellVolume: sellVol,
                    delta,
                    ratio: total > 0 ? ((delta / total) * 100).toFixed(2) + '%' : '0%'
                };
            }
        } catch {}

        // Aggregate all exchanges
        let totalBuy = 0, totalSell = 0;
        Object.values(result.exchanges).forEach(ex => {
            totalBuy += ex.buyVolume || 0;
            totalSell += ex.sellVolume || 0;
        });
        result.aggregatedDelta = totalBuy - totalSell;
        const totalVol = totalBuy + totalSell;

        if (totalVol > 0) {
            const ratio = result.aggregatedDelta / totalVol;
            if (ratio > 0.05) { result.aggregatedSignal = 'BULLISH'; result.score = 1; }
            else if (ratio < -0.05) { result.aggregatedSignal = 'BEARISH'; result.score = -1; }
        }

        // Check for cross-exchange divergence
        const binanceDelta = result.exchanges.binance?.delta || 0;
        const bybitDelta = result.exchanges.bybit?.delta || 0;
        if (bybitDelta !== 0 && binanceDelta !== 0) {
            if ((binanceDelta > 0 && bybitDelta < 0) || (binanceDelta < 0 && bybitDelta > 0)) {
                result.divergence = true;
                result.divergenceDescription = binanceDelta > 0
                    ? 'Binance comprando, Bybit vendendo â€” divergÃªncia entre exchanges (cautela)'
                    : 'Binance vendendo, Bybit comprando â€” divergÃªncia entre exchanges (cautela)';
                result.score *= 0.5; // reduce confidence
            }
        }

        return result;
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // MODULE 8: EDGE CALCULATOR
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    /**
     * Calculates statistical edge from trade history.
     * Edge = (WinRate Ã— AvgWin) - (LossRate Ã— AvgLoss)
     * Returns edge per score bucket.
     */
    function calculateEdge(symbol) {
        const stats = getPerformanceStats(symbol);
        if (stats.totalTrades < 5) {
            return {
                hasEdge: false,
                edge: 0,
                edgePercent: '0%',
                classification: 'INSUFICIENTE',
                description: `${stats.totalTrades}/5 trades mÃ­nimos. O sistema coleta dados automaticamente.`,
                icon: 'ðŸ“Š',
                color: '#94a3b8',
                stats
            };
        }

        const edge = stats.edge;
        let classification, description, icon, color;

        if (edge > 0.05) {
            classification = 'FORTE';
            description = `Edge positivo de ${(edge * 100).toFixed(2)}% por trade. Sistema comprovado.`;
            icon = 'ðŸ†';
            color = '#22c55e';
        } else if (edge > 0.02) {
            classification = 'MODERADO';
            description = `Edge positivo de ${(edge * 100).toFixed(2)}% por trade. Promissor.`;
            icon = 'âœ…';
            color = '#84cc16';
        } else if (edge > 0) {
            classification = 'FRACO';
            description = `Edge marginal de ${(edge * 100).toFixed(2)}%. Precisa de mais dados.`;
            icon = 'âš ï¸';
            color = '#eab308';
        } else {
            classification = 'NEGATIVO';
            description = `Edge negativo (${(edge * 100).toFixed(2)}%). Sistema ajustando pesos automaticamente.`;
            icon = 'âŒ';
            color = '#ef4444';
        }

        return {
            hasEdge: edge > 0,
            edge,
            edgePercent: (edge * 100).toFixed(2) + '%',
            classification,
            description,
            icon,
            color,
            stats
        };
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // MODULE 9: ROLLING CORRELATION ENGINE
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    /**
     * Calculates dynamic correlation between BTC and traditional markets.
     * Used to adjust macro impact: high correlation = macro matters more.
     */
    function calculateRollingCorrelation(klines1d_crypto, sp500Data, dxyData) {
        const result = {
            btcSp500Correlation: 0,
            btcDxyCorrelation: 0,
            correlationRegime: 'DECORRELATED',  // DECORRELATED | LOW | MODERATE | HIGH
            macroWeightMultiplier: 1.0,
            description: '',
            lagDays: 0
        };

        if (!klines1d_crypto || klines1d_crypto.length < 20) return result;

        const cryptoReturns = [];
        for (let i = 1; i < Math.min(klines1d_crypto.length, 30); i++) {
            const prev = parseKlineClose(klines1d_crypto[i - 1]);
            const curr = parseKlineClose(klines1d_crypto[i]);
            if (prev > 0) cryptoReturns.push((curr - prev) / prev);
        }

        // Calculate correlation with SP500 if data available
        if (sp500Data && sp500Data.prices && sp500Data.prices.length >= cryptoReturns.length) {
            const sp500Returns = [];
            for (let i = 1; i < Math.min(sp500Data.prices.length, cryptoReturns.length + 1); i++) {
                const prev = sp500Data.prices[i - 1];
                const curr = sp500Data.prices[i];
                if (prev > 0) sp500Returns.push((curr - prev) / prev);
            }
            if (sp500Returns.length >= 10) {
                result.btcSp500Correlation = +pearsonCorrelation(cryptoReturns, sp500Returns).toFixed(3);
            }
        }

        // Determine correlation regime
        const absCorr = Math.abs(result.btcSp500Correlation);
        if (absCorr > 0.7) {
            result.correlationRegime = 'HIGH';
            result.macroWeightMultiplier = 1.5;
            result.description = `Alta correlaÃ§Ã£o BTC-SP500 (${result.btcSp500Correlation}). Macro tem FORTE impacto.`;
        } else if (absCorr > 0.4) {
            result.correlationRegime = 'MODERATE';
            result.macroWeightMultiplier = 1.2;
            result.description = `CorrelaÃ§Ã£o moderada BTC-SP500 (${result.btcSp500Correlation}). Macro tem impacto relevante.`;
        } else if (absCorr > 0.2) {
            result.correlationRegime = 'LOW';
            result.macroWeightMultiplier = 0.8;
            result.description = `Baixa correlaÃ§Ã£o BTC-SP500 (${result.btcSp500Correlation}). Crypto segue dinÃ¢mica prÃ³pria.`;
        } else {
            result.correlationRegime = 'DECORRELATED';
            result.macroWeightMultiplier = 0.5;
            result.description = `DecorrelaÃ§Ã£o BTC-SP500 (${result.btcSp500Correlation}). Macro Ã© pouco relevante agora.`;
        }

        return result;
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // MODULE 10: NON-LINEAR SCORING ENGINE
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    /**
     * Replaces linear summation with non-linear aggregation.
     * Uses sigmoid compression to prevent extreme scores.
     * Applies diminishing returns: 5th bullish signal adds less than 1st.
     * 
     * The mathematical formalization:
     *   RawScore = Î£(weight_i Ã— signal_i)
     *   DecorrelatedScore = decorrelate(RawScore)
     *   CrashAdjustedScore = crashAdjust(DecorrelatedScore)
     *   ContextualScore = regimeAdjust(CrashAdjustedScore)
     *   FinalScore = sigmoid_compress(ContextualScore + MacroScore + OnChainScore)
     *
     * Formula:
     *   S_final = S_max Ã— tanh(S_raw / S_scale)
     *   where S_max = 35, S_scale = 20
     *   This creates natural diminishing returns.
     */
    function nonLinearScore(params) {
        const {
            decorrelatedScore,    // from decorrelation engine
            orderFlowScore,       // funding + CVD + book + etc
            v2ContextualScore,    // from ta-engine-v2 contextual scoring
            macroScore,           // from macro/news layer
            bigTechScore,         // from big tech engine
            onChainScore,         // from on-chain analyzer
            multiExchangeScore,   // from multi-exchange CVD
            crashState,           // from crash detector
            correlationData,      // from rolling correlation
            marketRegime          // from regime detector
        } = params;

        const S_MAX = 35;
        const S_SCALE = 20;

        // 1. Combine raw scores
        let rawScore = (decorrelatedScore || 0) + (orderFlowScore || 0);

        // 2. Add V2 contextual adjustments
        if (v2ContextualScore !== undefined && v2ContextualScore !== null) {
            // Use V2's adjusted score as base (it already has regime adjustments)
            rawScore = (v2ContextualScore || 0) + (orderFlowScore || 0);
        }

        // 3. Macro with correlation adjustment
        const macroMultiplier = correlationData ? correlationData.macroWeightMultiplier : 1.0;
        rawScore += (macroScore || 0) * macroMultiplier;
        rawScore += (bigTechScore || 0) * macroMultiplier;

        // 4. On-chain score (always relevant for crypto)
        rawScore += (onChainScore || 0);

        // 5. Multi-exchange adjustment
        rawScore += (multiExchangeScore || 0);

        // 6. Crash override â€” penalize score in crash direction
        if (crashState && crashState.isCrash) {
            if (crashState.direction === 'down' && rawScore > 0) {
                rawScore *= 0.2; // heavily suppress buy signals during crash
            } else if (crashState.direction === 'up' && rawScore < 0) {
                rawScore *= 0.2; // suppress sells during pump
            }
        }

        // 7. Non-linear compression (tanh)
        const compressedScore = S_MAX * Math.tanh(rawScore / S_SCALE);

        // 8. Determine signal
        let signal = 'NEUTRO', signalType = 'neutral';
        const effectiveThreshold = crashState && crashState.severity !== 'NONE' ? 5 : 1.8;

        if (compressedScore >= effectiveThreshold) { signal = 'LONG'; signalType = 'long'; }
        else if (compressedScore <= -effectiveThreshold) { signal = 'SHORT'; signalType = 'short'; }

        // 9. Probability (non-linear)
        let probability = 50 + (compressedScore / S_MAX) * 45;
        probability = clamp(Math.round(probability), 5, 100);

        // 10. Confidence with crash penalty
        let confidence = Math.abs(compressedScore) / S_MAX * 80;
        if (crashState) confidence -= crashState.override.confidencePenalty;
        if (marketRegime && marketRegime.isTrending) {
            const trendDir = marketRegime.regime === 'TRENDING_UP' ? 1 : -1;
            if ((compressedScore > 0 && trendDir > 0) || (compressedScore < 0 && trendDir < 0)) {
                confidence += 10;
            } else {
                confidence -= 15;
            }
        }
        confidence = clamp(Math.round(confidence), 5, 100);

        // 11. Confidence gate â€” if confidence is too low, force NEUTRO
        // A signal with < 15% confidence is not actionable
        if (confidence < 15 && signal !== 'NEUTRO') {
            signal = 'NEUTRO';
            signalType = 'neutral';
            probability = clamp(Math.round(50 + (compressedScore / S_MAX) * 15), 35, 65);
        }

        return {
            rawScore: +rawScore.toFixed(2),
            compressedScore: +compressedScore.toFixed(2),
            signal,
            signalType,
            probability,
            confidence,
            effectiveThreshold,
            formula: `S = ${S_MAX} Ã— tanh(${rawScore.toFixed(1)} / ${S_SCALE}) = ${compressedScore.toFixed(2)}`,
            components: {
                decorrelated: +(decorrelatedScore || 0).toFixed(2),
                orderFlow: +(orderFlowScore || 0).toFixed(2),
                macro: +((macroScore || 0) * macroMultiplier).toFixed(2),
                bigTech: +((bigTechScore || 0) * macroMultiplier).toFixed(2),
                onChain: +(onChainScore || 0).toFixed(2),
                multiExchange: +(multiExchangeScore || 0).toFixed(2),
                macroMultiplier: +macroMultiplier.toFixed(2)
            }
        };
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // MODULE 11: ENHANCED REGIME DETECTOR
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    /**
     * Improves upon V2's regime detection:
     *   - Volume confirmation for regime changes
     *   - Squeeze direction prediction
     *   - False breakout detection (volume + delta at BOS)
     *   - Regime transition scoring
     */
    function enhancedRegimeDetection(klines1h, klines4h, adx1h, adx4h, volumeProfile, currentPrice, crashState) {
        const result = {
            regimeConfidence: 0,        // 0-100 how confident we are in regime
            squeezeDirection: null,     // predicted direction of breakout
            falseBreakoutRisk: 'LOW',   // LOW | MEDIUM | HIGH
            regimeTransition: null,     // 'ENTERING_TREND' | 'ENTERING_RANGE' | 'SQUEEZING'
            volumeConfirmsRegime: false,
            details: []
        };

        if (!klines1h || klines1h.length < 20) return result;

        // Volume analysis for regime confirmation
        const volumes = klines1h.slice(-20).map(parseKlineVolume);
        const recentVol = mean(volumes.slice(-5));
        const olderVol = mean(volumes.slice(0, 10));
        const volTrend = olderVol > 0 ? ((recentVol - olderVol) / olderVol) * 100 : 0;

        // ADX trend (is ADX rising or falling?)
        const adxVal = adx1h?.adx || 20;
        const adxIsTrending = adxVal > 25;

        // If ADX says trending but volume is declining â†’ weak trend, possible false breakout
        if (adxIsTrending && volTrend < -20) {
            result.falseBreakoutRisk = 'HIGH';
            result.volumeConfirmsRegime = false;
            result.details.push('ADX indica tendÃªncia mas volume estÃ¡ caindo â€” risco de falso rompimento ALTO');
        } else if (adxIsTrending && volTrend > 10) {
            result.volumeConfirmsRegime = true;
            result.falseBreakoutRisk = 'LOW';
            result.details.push('TendÃªncia confirmada por volume crescente');
        } else {
            result.falseBreakoutRisk = 'MEDIUM';
        }

        // Squeeze direction prediction
        // Look at which side has more volume: above or below current price
        const closes = klines1h.slice(-20).map(parseKlineClose);
        const vols = klines1h.slice(-20).map(parseKlineVolume);
        let volAbove = 0, volBelow = 0;
        for (let i = 0; i < closes.length; i++) {
            if (closes[i] > currentPrice) volAbove += vols[i];
            else volBelow += vols[i];
        }

        // Check OBV trend
        let obv = 0;
        for (let i = 1; i < closes.length; i++) {
            if (closes[i] > closes[i - 1]) obv += vols[i];
            else if (closes[i] < closes[i - 1]) obv -= vols[i];
        }

        // ADX direction change detection
        const adx4val = adx4h?.adx || 20;

        if (adxVal < 20 && adx4val < 20) {
            // In squeeze â€” predict direction
            if (obv > 0 && volBelow > volAbove) {
                result.squeezeDirection = 'UP';
                result.details.push('Squeeze detectado: OBV positivo + volume acumulando abaixo â†’ provÃ¡vel rompimento para CIMA');
            } else if (obv < 0 && volAbove > volBelow) {
                result.squeezeDirection = 'DOWN';
                result.details.push('Squeeze detectado: OBV negativo + volume distribuindo acima â†’ provÃ¡vel rompimento para BAIXO');
            } else {
                result.squeezeDirection = 'INDEFINIDO';
                result.details.push('Squeeze detectado: direÃ§Ã£o indefinida');
            }
            result.regimeTransition = 'SQUEEZING';
        } else if (adxVal > 25 && adx4val < 20) {
            result.regimeTransition = 'ENTERING_TREND';
            result.details.push('TransiÃ§Ã£o de range para tendÃªncia detectada (1h trending, 4h ainda range)');
        } else if (adxVal < 20 && adx4val > 25) {
            result.regimeTransition = 'ENTERING_RANGE';
            result.details.push('TransiÃ§Ã£o de tendÃªncia para range detectada (1h ranging, 4h ainda trending)');
        }

        // Regime confidence
        result.regimeConfidence = result.volumeConfirmsRegime ? 80 : 50;
        if (crashState && crashState.isCrash) {
            result.regimeConfidence = 30; // regimes are unreliable during crashes
            result.details.push('ConfianÃ§a reduzida: mercado em crash/pump extremo');
        }

        return result;
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // MODULE 12: FALSE BREAKOUT DETECTOR (BOS Validation)
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    /**
     * Validates BOS (Break of Structure) signals from V2.
     * True breakouts require volume + delta confirmation.
     * Without confirmation, the BOS may be a liquidity sweep (fake breakout).
     */
    function validateBOS(marketStructure, klines1h, trades, currentPrice) {
        const result = {
            bosValidated: false,
            bosType: null,                // 'REAL' | 'FAKE_SWEEP' | 'UNCONFIRMED'
            adjustedStructureScore: 0,
            reasoning: ''
        };

        if (!marketStructure || !marketStructure.overallStructure || marketStructure.overallStructure === 'NEUTRO') {
            result.bosType = null;
            result.adjustedStructureScore = marketStructure?.structureScore || 0;
            return result;
        }

        const structScore = marketStructure.structureScore || 0;
        const isBullish = structScore > 0;

        // Check volume at the breakout candle
        if (klines1h && klines1h.length >= 3) {
            const lastCandles = klines1h.slice(-3);
            const breakCandle = lastCandles[lastCandles.length - 1];
            const avgVol = mean(klines1h.slice(-20).map(parseKlineVolume));
            const breakVol = parseKlineVolume(breakCandle);
            const volConfirm = breakVol > avgVol * 1.3;

            // Check if price closed beyond the level (not just wicked)
            const close = parseKlineClose(breakCandle);
            const open = parseKlineOpen(breakCandle);
            const bullishClose = close > open;
            const bodyConfirm = isBullish ? bullishClose : !bullishClose;

            // Check CVD at breakout
            let cvdConfirm = false;
            if (trades && trades.length > 10) {
                const recentTrades = trades.slice(-100);
                let buyVol = 0, sellVol = 0;
                recentTrades.forEach(t => {
                    const qty = parseFloat(t.qty || 0) * parseFloat(t.price || 0);
                    if (t.isBuyerMaker === false) buyVol += qty;
                    else sellVol += qty;
                });
                cvdConfirm = isBullish ? buyVol > sellVol * 1.2 : sellVol > buyVol * 1.2;
            }

            if (volConfirm && bodyConfirm && cvdConfirm) {
                result.bosValidated = true;
                result.bosType = 'REAL';
                result.adjustedStructureScore = structScore; // full score
                result.reasoning = 'BOS confirmado: Volume alto + fechamento consistente + CVD confirma pressÃ£o.';
            } else if (!volConfirm && !bodyConfirm) {
                result.bosValidated = false;
                result.bosType = 'FAKE_SWEEP';
                result.adjustedStructureScore = structScore * -0.5; // invert! fake breakout = opposite signal
                result.reasoning = 'PROVÃVEL SWEEP: Volume baixo + wick (sem fechamento). Market Makers varrendo stops.';
            } else {
                result.bosValidated = false;
                result.bosType = 'UNCONFIRMED';
                result.adjustedStructureScore = structScore * 0.3; // heavily reduced
                result.reasoning = 'BOS nÃ£o confirmado: falta confirmaÃ§Ã£o de ' +
                    (!volConfirm ? 'volume, ' : '') +
                    (!bodyConfirm ? 'fechamento, ' : '') +
                    (!cvdConfirm ? 'CVD' : '');
            }
        } else {
            result.adjustedStructureScore = structScore * 0.5;
            result.bosType = 'UNCONFIRMED';
            result.reasoning = 'Dados insuficientes para validar BOS.';
        }

        // Liquidity sweep detected by V2 â€” this is a strong counter-signal
        if (marketStructure.liquiditySweeps && marketStructure.liquiditySweeps.detected) {
            if (result.bosType !== 'REAL') {
                result.bosType = 'FAKE_SWEEP';
                result.adjustedStructureScore = structScore * -0.3;
                result.reasoning += ' Sweep de liquidez detectado â€” provÃ¡vel reversÃ£o.';
            }
        }

        return result;
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // MODULE 13: SYSTEM LIMITATIONS & RISK WARNINGS
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    /**
     * Generates context-aware warnings about when the system is unreliable.
     */
    function generateWarnings(params) {
        const { crashState, marketRegime, enhancedRegime, onChainData, correlationData, edgeData, analysis } = params;
        const warnings = [];

        // Crash warning
        if (crashState && crashState.isCrash) {
            warnings.push({
                severity: 'CRITICAL',
                icon: 'ðŸš¨',
                title: 'Mercado em Crash/Pump Extremo',
                message: 'Indicadores tÃ©cnicos sÃ£o irrelevantes durante movimentos extremos. Todos os sinais de osciladores foram suprimidos. EVITE operar.',
                color: '#ef4444'
            });
        }

        // High volatility regime
        if (analysis?.volatilityMetrics?.volRegime === 'EXTREME') {
            warnings.push({
                severity: 'HIGH',
                icon: 'âš¡',
                title: 'Volatilidade Extrema',
                message: 'ATR acima do percentil 90. Stop losses podem ser atingidos por ruÃ­do de mercado. Reduza tamanho da posiÃ§Ã£o.',
                color: '#f97316'
            });
        }

        // False breakout risk
        if (enhancedRegime && enhancedRegime.falseBreakoutRisk === 'HIGH') {
            warnings.push({
                severity: 'HIGH',
                icon: 'ðŸª¤',
                title: 'Risco Alto de Falso Rompimento',
                message: 'ADX indica tendÃªncia mas volume estÃ¡ caindo. Breakouts atuais podem ser armadilhas de liquidez.',
                color: '#f97316'
            });
        }

        // Negative edge
        if (edgeData && edgeData.stats.totalTrades >= 10 && edgeData.edge < -0.01) {
            warnings.push({
                severity: 'HIGH',
                icon: 'ðŸ“‰',
                title: 'Edge Negativo HistÃ³rico',
                message: `Ãšltimos ${edgeData.stats.totalTrades} sinais resultaram em edge de ${edgeData.edgePercent}. Sistema estÃ¡ ajustando pesos automaticamente.`,
                color: '#f97316'
            });
        }

        // Correlated redundancy
        if (analysis?.confluenceDetails) {
            const longCount = analysis.confluenceDetails.filter(i => i.signal === 'LONG').length;
            const shortCount = analysis.confluenceDetails.filter(i => i.signal === 'SHORT').length;
            const dominantCount = Math.max(longCount, shortCount);
            if (dominantCount >= 8) {
                warnings.push({
                    severity: 'MEDIUM',
                    icon: 'ðŸ”„',
                    title: 'PossÃ­vel Falsa ConfluÃªncia',
                    message: `${dominantCount} indicadores alinhados, mas vÃ¡rios sÃ£o correlacionados (RSI, Stoch, MACD medem momentum similar). O sistema aplicou decorrelaÃ§Ã£o para ajustar.`,
                    color: '#eab308'
                });
            }
        }

        // Macro timing
        const hour = new Date().getUTCHours();
        if (hour >= 18 && hour <= 19) { // FOMC typically 2pm ET = 18-19 UTC
            warnings.push({
                severity: 'MEDIUM',
                icon: 'ðŸ›ï¸',
                title: 'PossÃ­vel HorÃ¡rio de FOMC',
                message: 'O mercado pode estar em perÃ­odo de anÃºncio do FED. Indicadores tÃ©cnicos sÃ£o irrelevantes durante FOMC.',
                color: '#eab308'
            });
        }

        // Exchange tunnel vision
        if (!analysis?.multiExchangeCVD?.exchanges?.bybit) {
            warnings.push({
                severity: 'LOW',
                icon: 'ðŸ‘ï¸',
                title: 'VisÃ£o Limitada a Binance',
                message: 'Dados de outras exchanges indisponÃ­veis. O CVD pode nÃ£o refletir o mercado global.',
                color: '#94a3b8'
            });
        }

        // Data freshness
        if (analysis?.timestamp && Date.now() - analysis.timestamp > 10 * 60 * 1000) {
            warnings.push({
                severity: 'MEDIUM',
                icon: 'â°',
                title: 'Dados Desatualizados',
                message: 'AnÃ¡lise tem mais de 10 minutos. Considere atualizar antes de operar.',
                color: '#eab308'
            });
        }

        return warnings;
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // MODULE 14: MASTER ENHANCEMENT ORCHESTRATOR
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    /**
     * Main function that takes the basic V1/V2 analysis and enhances it
     * with all V3 modules. Called after generateTechnicalAnalysis().
     */
    async function enhanceAnalysis(analysis, rawData, symbol) {
        const startTime = Date.now();

        // 1. Crash Detection
        const crashState = detectCrashConditions(
            rawData.klines1m, rawData.klines5m, rawData.klines15m,
            rawData.klines1h, rawData.currentPrice
        );

        // 2. Indicator Decorrelation (with crash override)
        const decorrelated = decorrelateIndicators(
            analysis.confluenceDetails || [], crashState
        );

        // 3. Apply Adaptive Weights (from learning history)
        const adaptedDetails = applyAdaptiveWeights(decorrelated.details, symbol);

        // Recalculate decorrelated score with adaptive weights
        let adaptedScore = 0;
        adaptedDetails.forEach(ind => {
            if (ind.signal === 'LONG') adaptedScore += Math.abs(ind.weight);
            else if (ind.signal === 'SHORT') adaptedScore -= Math.abs(ind.weight);
        });

        // 4. Enhanced Regime Detection
        const enhancedRegime = enhancedRegimeDetection(
            rawData.klines1h, rawData.klines4h,
            analysis.indicators?.multiTimeframe ? { adx: parseFloat(analysis.indicators.multiTimeframe.adx1h?.adx || 20) } : { adx: 20 },
            analysis.indicators?.multiTimeframe ? { adx: parseFloat(analysis.indicators.multiTimeframe.adx1h?.adx || 20) } : { adx: 20 },
            analysis.indicators?.volumeProfile,
            rawData.currentPrice,
            crashState
        );

        // 5. BOS Validation (false breakout detection)
        const bosValidation = validateBOS(
            analysis.marketStructure,
            rawData.klines1h,
            rawData.trades,
            rawData.currentPrice
        );

        // 6. Parallel async fetches: On-Chain + Multi-Exchange CVD
        let onChainData = { available: false, onChainScore: 0, details: [] };
        let multiExchangeCVD = { aggregatedDelta: 0, score: 0 };

        try {
            const [onChain, multiCVD] = await Promise.all([
                fetchOnChainData(symbol).catch(() => onChainData),
                fetchMultiExchangeCVD(symbol).catch(() => multiExchangeCVD)
            ]);
            onChainData = onChain || onChainData;
            multiExchangeCVD = multiCVD || multiExchangeCVD;

            // Add Binance CVD to multi-exchange for comparison
            if (analysis.cvdAdvanced) {
                multiExchangeCVD.exchanges = multiExchangeCVD.exchanges || {};
                multiExchangeCVD.exchanges.binance = {
                    delta: analysis.cvdAdvanced.delta || 0,
                    buyVolume: 0,
                    sellVolume: 0
                };
            }
        } catch {}

        // 7. Rolling Correlation
        const correlationData = calculateRollingCorrelation(
            rawData.klines1d,
            analysis.bigTechMacro?.sp500 ? { prices: [analysis.bigTechMacro.sp500.price] } : null,
            null
        );

        // 8. Evaluate past trades (forward testing)
        const evaluatedTrades = evaluatePendingTrades(symbol, rawData.klines1h, rawData.currentPrice);

        // 9. Edge Calculation
        const edgeData = calculateEdge(symbol);

        // 10. Order Flow Score (extracted from analysis)
        const orderFlowScore = (
            (analysis.indicators?.orderFlow ? parseFloat(analysis.indicators.orderFlow.fundingRate || 0) : 0) +
            (analysis.indicators?.sentiment?.rsiSignal === 'oversold' ? 1 : analysis.indicators?.sentiment?.rsiSignal === 'overbought' ? -1 : 0)
        );

        // 11. Non-Linear Score Calculation
        const v2ContextScore = analysis.contextualAdjustments
            ? parseFloat(analysis.confluenceSummary?.score || 0)
            : adaptedScore;

        const nlScore = nonLinearScore({
            decorrelatedScore: adaptedScore,
            orderFlowScore: orderFlowScore,
            v2ContextualScore: v2ContextScore,
            macroScore: analysis.macroNewsScore || 0,
            bigTechScore: analysis.bigTechScore || 0,
            onChainScore: onChainData.onChainScore || 0,
            multiExchangeScore: multiExchangeCVD.score || 0,
            crashState,
            correlationData,
            marketRegime: analysis.marketRegime
        });

        // 12. Position Sizing
        const positionSize = calculatePositionSize({
            signalType: nlScore.signalType,
            confidence: nlScore.confidence,
            probability: nlScore.probability,
            atr: analysis.volatilityMetrics?.atr1h || analysis.indicators?.volumeProfile?.vwap * 0.02 || 100,
            currentPrice: rawData.currentPrice,
            stopLoss: analysis.stopLoss,
            crashState,
            edgeStats: edgeData.stats
        });

        // 13. Track this signal
        const enhancedAnalysis = {
            ...analysis,
            // Override signal with V3 non-linear score
            v3Signal: nlScore.signal,
            v3SignalType: nlScore.signalType,
            v3Confidence: nlScore.confidence,
            v3Probability: nlScore.probability,
            v3Score: nlScore,
            // V3 additions
            crashState,
            decorrelation: {
                applied: true,
                originalScore: analysis.confluenceSummary?.score,
                adjustedScore: adaptedScore,
                familyBreakdown: decorrelated.familyBreakdown,
                adjustedDetails: adaptedDetails
            },
            enhancedRegime,
            bosValidation,
            onChainData,
            multiExchangeCVD,
            correlationData,
            positionSize,
            edgeData,
            performanceStats: edgeData.stats,
            // Generated warnings
            warnings: [],
            // Processing time
            v3ProcessingTime: Date.now() - startTime
        };

        // Generate warnings
        enhancedAnalysis.warnings = generateWarnings({
            crashState,
            marketRegime: analysis.marketRegime,
            enhancedRegime,
            onChainData,
            correlationData,
            edgeData,
            analysis: enhancedAnalysis
        });

        // Track virtual trade
        trackVirtualTrade(symbol, enhancedAnalysis);

        return enhancedAnalysis;
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // EXPORT
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    window.TAEngineV3 = {
        // Core enhancement
        enhanceAnalysis,

        // Individual modules (for testing/direct use)
        detectCrashConditions,
        decorrelateIndicators,
        getAdaptiveWeights,
        updateAdaptiveWeights,
        applyAdaptiveWeights,
        calculatePositionSize,
        trackVirtualTrade,
        evaluatePendingTrades,
        getPerformanceStats,
        fetchOnChainData,
        fetchMultiExchangeCVD,
        calculateEdge,
        calculateRollingCorrelation,
        nonLinearScore,
        enhancedRegimeDetection,
        validateBOS,
        generateWarnings,

        // Version
        VERSION: '3.0.0'
    };

    console.log('[TA Engine V3] Loaded â€” Advanced Trading Intelligence Engine v3.0.0');
})();
