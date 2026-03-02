/**
 * ══════════════════════════════════════════════════════════════════════════
 *  VISOR CRYPTO — TRADING INTELLIGENCE ENGINE
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  FEATURES:
 *  [1] Z-Score Dynamic Thresholds
 *  [2] Session Context / Kill Zones
 *  [3] Limit Order Retest Execution
 *  [4] Regime-Adaptive Gates (6-state)
 *  [5] Risk Engine with Kill Switch
 *  [6] Microstructure Detection (absorption, FVG, voids)
 *  [7] Model Stability Monitor
 *  [8] Bot Integration Layer
 *  [9] Reputation-Weighted Collective Learning
 *  [10] Data Integrity Gate (FORCE_NEUTRO on failure)
 *  [11] OI + OI Delta Analysis (squeeze, buildup, fake breakout)
 *  [12] Anti-Spoofing (Order Book Delta)
 *  [13] Enhanced 6-State Regime Detection
 *
 *  Depends on: ta-engine-v3.js
 */
(function () {
    'use strict';

    // ═══════════════════════════════════════════════════════════════
    // CONSTANTS & CONFIG
    // ═══════════════════════════════════════════════════════════════

    const VERSION = '7.2.0';
    const STORAGE_PREFIX = 'vc4_';

    // Backend
    const BACKEND_URL = 'https://visor-crypto-api.onrender.com/api';
    const BACKEND_TIMEOUT = 5000;

    // ── Z-Score Thresholds (DYNAMIC — these are fallbacks only) ──
    // Real thresholds are now percentile-based per asset from backend
    const Z_SCORE_DISPLACEMENT = 1.3;       // fallback: body z > 1.3
    const Z_SCORE_VOLUME = 1.5;             // fallback: volume z > 1.5
    const Z_SCORE_VOLUME_MILD = 1.0;        // fallback: volume z > 1.0
    const Z_SCORE_LOOKBACK = 100;
    const Z_SCORE_MICRO_LOOKBACK = 50;

    // ── Session / Kill Zone definitions (UTC hours) ──
    const SESSIONS = {
        ASIAN:       { start: 0,  end: 7,  name: 'Asiática',                weight: 0.6, emoji: '🌙' },
        LONDON_OPEN: { start: 7,  end: 9,  name: 'Abertura Londres',        weight: 1.3, emoji: '🇬🇧' },
        LONDON:      { start: 9,  end: 12, name: 'Londres',                 weight: 1.0, emoji: '🇬🇧' },
        KILL_ZONE:   { start: 12, end: 16, name: 'Kill Zone (London/NY)',    weight: 1.5, emoji: '🎯' },
        NY:          { start: 16, end: 20, name: 'Nova York',               weight: 1.0, emoji: '🇺🇸' },
        NY_CLOSE:    { start: 20, end: 21, name: 'Fechamento NY',           weight: 0.8, emoji: '🔔' },
        DEAD:        { start: 21, end: 24, name: 'Zona Morta',              weight: 0.4, emoji: '💤' }
    };

    // ── Regime-Adaptive Gate Requirements ──
    const REGIME_GATES = {
        // V4 regime names (from computeEnhancedRegime)
        TREND_UP:          { withTrend: { gates: 3, score: 45 }, counterTrend: { gates: 5, score: 65 } },
        TREND_DOWN:        { withTrend: { gates: 3, score: 45 }, counterTrend: { gates: 5, score: 65 } },
        EXPANSION_UP:      { withTrend: { gates: 3, score: 40 }, counterTrend: { gates: 5, score: 65 } },
        EXPANSION_DOWN:    { withTrend: { gates: 3, score: 40 }, counterTrend: { gates: 5, score: 65 } },
        RANGE:             { withTrend: { gates: 4, score: 55 }, counterTrend: { gates: 5, score: 60 } },
        HIGH_VOL:          { withTrend: { gates: 4, score: 55 }, counterTrend: { gates: 4, score: 55 } },
        COMPRESSION:       { withTrend: { gates: 4, score: 50 }, counterTrend: { gates: 5, score: 60 } },
        // Legacy names (backward compatibility)
        BULL_TREND:        { withTrend: { gates: 3, score: 45 }, counterTrend: { gates: 5, score: 65 } },
        STRONG_BULL:       { withTrend: { gates: 3, score: 40 }, counterTrend: { gates: 5, score: 65 } },
        BEAR_TREND:        { withTrend: { gates: 3, score: 45 }, counterTrend: { gates: 5, score: 65 } },
        STRONG_BEAR:       { withTrend: { gates: 3, score: 40 }, counterTrend: { gates: 5, score: 65 } },
        RANGING:           { withTrend: { gates: 4, score: 55 }, counterTrend: { gates: 5, score: 60 } },
        VOLATILE:          { withTrend: { gates: 4, score: 55 }, counterTrend: { gates: 4, score: 55 } },
        ACCUMULATION:      { withTrend: { gates: 4, score: 50 }, counterTrend: { gates: 5, score: 60 } },
        DEFAULT:           { withTrend: { gates: 4, score: 50 }, counterTrend: { gates: 4, score: 55 } }
    };
    const MIN_CONFIRMATIONS_AGUARDAR = 2;

    // ── DYNAMIC GATE WEIGHTS BY REGIME ──
    // Instead of static weights, each regime adjusts gate importance.
    // Format: { gateName: weight } — missing keys use the default weight.
    const DEFAULT_GATE_WEIGHTS = {
        bosConfirmed: 2.0, displacement: 2.0, volumeExpansion: 1.5,
        cvdConfirms: 1.5, outsideRange: 2.0, fundingOk: 1.0,
        acceptance: 1.5, oiConfirms: 1.5, antiSpoofOk: 1.0
    };
    const REGIME_GATE_WEIGHTS = {
        RANGING: {
            bosConfirmed: 2.5, displacement: 1.0, volumeExpansion: 1.0,
            cvdConfirms: 1.5, outsideRange: 2.5, fundingOk: 1.5,
            acceptance: 2.0, oiConfirms: 1.0, antiSpoofOk: 1.0
        },
        BULL_TREND: {
            bosConfirmed: 1.5, displacement: 2.5, volumeExpansion: 2.0,
            cvdConfirms: 1.5, outsideRange: 1.5, fundingOk: 0.5,
            acceptance: 1.5, oiConfirms: 2.0, antiSpoofOk: 1.0
        },
        STRONG_BULL: {
            bosConfirmed: 1.5, displacement: 2.5, volumeExpansion: 2.0,
            cvdConfirms: 1.5, outsideRange: 1.5, fundingOk: 0.5,
            acceptance: 1.0, oiConfirms: 2.0, antiSpoofOk: 1.0
        },
        BEAR_TREND: {
            bosConfirmed: 1.5, displacement: 2.5, volumeExpansion: 2.0,
            cvdConfirms: 1.5, outsideRange: 1.5, fundingOk: 0.5,
            acceptance: 1.5, oiConfirms: 2.0, antiSpoofOk: 1.0
        },
        STRONG_BEAR: {
            bosConfirmed: 1.5, displacement: 2.5, volumeExpansion: 2.0,
            cvdConfirms: 1.5, outsideRange: 1.5, fundingOk: 0.5,
            acceptance: 1.0, oiConfirms: 2.0, antiSpoofOk: 1.0
        },
        VOLATILE: {
            bosConfirmed: 2.0, displacement: 1.5, volumeExpansion: 1.0,
            cvdConfirms: 2.0, outsideRange: 1.5, fundingOk: 1.5,
            acceptance: 1.5, oiConfirms: 1.5, antiSpoofOk: 1.5
        },
        ACCUMULATION: {
            bosConfirmed: 2.5, displacement: 1.5, volumeExpansion: 2.0,
            cvdConfirms: 1.5, outsideRange: 2.0, fundingOk: 1.0,
            acceptance: 2.0, oiConfirms: 1.5, antiSpoofOk: 1.0
        },
    };

    // ── REDUNDANCY PENALIZATION (V7: Enhanced Correlation Matrix) ──
    // Gates that are conceptually correlated — if both pass, reduce weight of second
    // Expanded with Z-score correlation: displacement, volume, BOS all measure structural expansion
    const REDUNDANCY_PAIRS = [
        { gate1: 'bosConfirmed', gate2: 'displacement', penaltyFactor: 0.85 },      // BOS + displacement = related but complementary
        { gate1: 'displacement', gate2: 'volumeExpansion', penaltyFactor: 0.85 },    // displacement usually has vol
        { gate1: 'bosConfirmed', gate2: 'volumeExpansion', penaltyFactor: 0.90 },    // BOS validates vol already
        { gate1: 'outsideRange', gate2: 'acceptance', penaltyFactor: 0.80 },         // acceptance = outside range confirmation
        { gate1: 'outsideRange', gate2: 'bosConfirmed', penaltyFactor: 0.90 },       // related but distinct signals
        { gate1: 'cvdConfirms', gate2: 'antiSpoofOk', penaltyFactor: 0.95 },        // barely correlated
        { gate1: 'oiConfirms', gate2: 'cvdConfirms', penaltyFactor: 0.90 },         // OI buildup + CVD = complementary
    ];

    // ── LOGISTIC CALIBRATION COEFFICIENTS ──
    // probability = sigmoid(a0 + a1*gateScore + a2*regimeScore + a3*saturation + a4*btcAlignment + a5*session)
    // These are initial estimates — should be trained on backtesting data
    const CALIBRATION_COEFFICIENTS = {
        intercept: -3.5,
        gateScore: 0.06,       // higher gate score → higher probability
        regimeQuality: 0.02,   // better regime → higher probability
        saturation: -0.03,     // higher saturation → lower probability
        btcAlignment: 0.5,     // aligned = +0.5, diverging = -0.5
        sessionWeight: 0.3,    // kill zone = +0.3, dead = -0.3
    };

    // ── NOTIFICATION CONFIDENCE THRESHOLD ──
    const NOTIF_MIN_CONFIDENCE = 70;
    const NOTIF_MAX_CONFIDENCE = 100;
    const NOTIF_DEFAULT_CONFIDENCE = 75;

    // ── Range ──
    const RANGE_BUFFER_PERCENT = 0.3;
    const FUNDING_EXTREME_THRESHOLD = 0.05;

    // ── Retest ──
    const RETEST_WINDOW_CANDLES = 10;
    const RETEST_PROXIMITY_PERCENT = 0.5;

    // ── Risk Engine ──
    const DEFAULT_RISK_PERCENT = 1.0;      // 1% risk per trade
    const KILL_SWITCH_CONSECUTIVE = 3;     // 3 consecutive losses → pause
    const KILL_SWITCH_PAUSE_HOURS = 4;
    const EDGE_DEGRADE_THRESHOLD = 40;     // rolling WR < 40% → reduce size
    const MAX_DAILY_DRAWDOWN = 3.0;        // 3% daily DD → stop
    const MAX_WEEKLY_DRAWDOWN = 5.0;       // 5% weekly DD → half size

    // ── Microstructure ──
    const ABSORPTION_WICK_RATIO = 0.60;    // wick > 60% of range = absorption
    const FVG_MIN_GAP_PERCENT = 0.15;      // minimum gap for FVG (0.15%)
    const VOID_BODY_RATIO = 0.85;          // body > 85% of range = liquidity void

    // ── Model Stability ──
    const STABILITY_WINDOW = 20;           // rolling window for edge monitoring
    const STABILITY_DEGRADE_WR = 40;       // WR < 40% = edge degrading
    const STABILITY_CRITICAL_WR = 30;      // WR < 30% = force AGUARDAR all
    const WEIGHT_DECAY_HALFLIFE = 14;      // days — older signals worth less

    // ── Data Integrity ──
    const CRITICAL_DATA_KEYS = ['klines1h', 'klines4h', 'currentPrice'];
    const IMPORTANT_DATA_KEYS = ['orderBook', 'trades', 'fundingRate'];

    // ── OI Analysis ──
    const OI_DELTA_SIGNIFICANT = 3;        // 3% OI change = significant
    const OI_SQUEEZE_THRESHOLD = 5;        // 5% OI drop with liquidations = squeeze
    const OI_BUILDUP_THRESHOLD = 5;        // 5% OI rise = position buildup

    // ── Anti-Spoofing (v7.1: Adaptive thresholds per regime) ──
    const SPOOFING_IMBALANCE_THRESHOLD = 3.0;  // 3:1 bid/ask ratio = suspicious (base)
    const SPOOFING_WALL_PERCENT = 5.0;         // wall > 5% of total depth (base)
    const SPOOFING_SPREAD_THRESHOLD = 0.1;     // spread > 0.1% = low liquidity (base)
    
    // v7.1: Regime-adaptive multipliers for anti-spoofing thresholds
    // VOLATILE/HIGH_VOL: relax thresholds (market is naturally skewed)
    // RANGING/COMPRESSION: tighten (spoofing more impactful)
    const SPOOFING_REGIME_MULTIPLIERS = {
        'HIGH_VOL':       { imbalance: 1.5, wall: 1.3, spread: 1.5 },
        'VOLATILE':       { imbalance: 1.4, wall: 1.2, spread: 1.3 },
        'EXPANSION_UP':   { imbalance: 1.3, wall: 1.1, spread: 1.0 },
        'EXPANSION_DOWN': { imbalance: 1.3, wall: 1.1, spread: 1.0 },
        'TREND_UP':       { imbalance: 1.2, wall: 1.0, spread: 1.0 },
        'TREND_DOWN':     { imbalance: 1.2, wall: 1.0, spread: 1.0 },
        'RANGE':          { imbalance: 0.8, wall: 0.8, spread: 0.9 },
        'RANGING':        { imbalance: 0.8, wall: 0.8, spread: 0.9 },
        'COMPRESSION':    { imbalance: 0.7, wall: 0.7, spread: 0.8 },
    };

    // ── Volatility Regime Shift ──
    const VOL_SHIFT_ATR_FAST = 20;             // Fast ATR EMA period
    const VOL_SHIFT_ATR_SLOW = 100;            // Slow ATR EMA period
    const VOL_SHIFT_EXPLOSIVE = 1.5;           // fast/slow > 1.5 = EXPLOSIVE
    const VOL_SHIFT_COMPRESSED = 0.6;          // fast/slow < 0.6 = COMPRESSED

    // ── BTC Correlation Multi-Window ──
    const BTC_CORR_WINDOWS = [12, 24, 72];     // hours for multi-window correlation

    // ── Market Breadth ──
    const BREADTH_CACHE_KEY = STORAGE_PREFIX + 'market_breadth';
    const BREADTH_CACHE_TTL = 3 * 60 * 1000;   // 3 min
    const BREADTH_STRONG_THRESHOLD = 65;        // > 65% same dir = strong breadth
    const BREADTH_WEAK_THRESHOLD = 35;          // < 35% same dir = weak breadth

    // ── Collective ──
    const COLLECTIVE_SYNC_INTERVAL = 30 * 60 * 1000;
    const COLLECTIVE_CACHE_KEY = STORAGE_PREFIX + 'collective_cache';
    const COLLECTIVE_QUEUE_KEY = STORAGE_PREFIX + 'trade_queue';
    const REACTIVE_STATS_KEY = STORAGE_PREFIX + 'reactive_stats_';
    const DEVICE_HASH_KEY = STORAGE_PREFIX + 'device_hash';
    const RISK_STATE_KEY = STORAGE_PREFIX + 'risk_state';
    const STABILITY_KEY = STORAGE_PREFIX + 'stability_';

    // ═══════════════════════════════════════════════════════════════
    // UTILITIES
    // ═══════════════════════════════════════════════════════════════

    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
    function mean(a) { return a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0; }
    function stddev(a) {
        const m = mean(a);
        return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length || 1));
    }
    function zScore(value, arr) {
        const m = mean(arr);
        const s = stddev(arr);
        return s > 0 ? (value - m) / s : 0;
    }
    function percentile(value, arr) {
        const sorted = [...arr].sort((a, b) => a - b);
        const idx = sorted.findIndex(v => v >= value);
        return idx >= 0 ? (idx / sorted.length) * 100 : 100;
    }
    function parseKline(k) {
        return {
            open: parseFloat(k[1]), high: parseFloat(k[2]),
            low: parseFloat(k[3]),  close: parseFloat(k[4]),
            volume: parseFloat(k[5]), time: k[0]
        };
    }
    function safeGet(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } }
    function safeSet(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }

    // Persistent anonymous device hash for reputation scoring
    function getDeviceHash() {
        let hash = safeGet(DEVICE_HASH_KEY);
        if (!hash) {
            hash = 'dev_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
            safeSet(DEVICE_HASH_KEY, hash);
        }
        return hash;
    }

    // ── SIGMOID for logistic calibration ──
    function sigmoid(x) { return 1.0 / (1.0 + Math.exp(-x)); }

    // ── Dynamic threshold cache (per symbol) ──
    const _dynamicThresholdCache = {};
    const _dynamicThresholdTTL = 5 * 60 * 1000; // 5 min

    async function fetchDynamicThresholds(symbol) {
        const now = Date.now();
        const cached = _dynamicThresholdCache[symbol];
        if (cached && (now - cached._ts) < _dynamicThresholdTTL) return cached;
        try {
            const resp = await fetch(`${BACKEND_URL}/analysis/thresholds/${encodeURIComponent(symbol)}`, {
                signal: AbortSignal.timeout(BACKEND_TIMEOUT)
            });
            if (resp.ok) {
                const data = await resp.json();
                data._ts = now;
                _dynamicThresholdCache[symbol] = data;
                return data;
            }
        } catch (e) { /* fallback to fixed */ }
        return null;
    }

    function getDynamicThreshold(dynThresholds, key, fallback) {
        if (dynThresholds && dynThresholds[key] !== undefined && dynThresholds[key] !== null) {
            return dynThresholds[key];
        }
        return fallback;
    }

    // ── Macro regime cache ──
    let _macroRegimeCache = null;
    let _macroRegimeCacheTs = 0;
    const _macroRegimeTTL = 10 * 60 * 1000; // 10 min

    async function fetchMacroRegime() {
        const now = Date.now();
        if (_macroRegimeCache && (now - _macroRegimeCacheTs) < _macroRegimeTTL) return _macroRegimeCache;
        try {
            const resp = await fetch(`${BACKEND_URL}/analysis/macro-regime`, {
                signal: AbortSignal.timeout(BACKEND_TIMEOUT)
            });
            if (resp.ok) {
                _macroRegimeCache = await resp.json();
                _macroRegimeCacheTs = now;
                return _macroRegimeCache;
            }
        } catch (e) { /* fallback */ }
        return null;
    }

    // ── Systemic risk cache ──
    let _systemicRiskCache = null;
    let _systemicRiskCacheTs = 0;

    async function fetchSystemicRisk() {
        const now = Date.now();
        if (_systemicRiskCache && (now - _systemicRiskCacheTs) < _macroRegimeTTL) return _systemicRiskCache;
        try {
            const resp = await fetch(`${BACKEND_URL}/analysis/systemic-risk`, {
                signal: AbortSignal.timeout(BACKEND_TIMEOUT)
            });
            if (resp.ok) {
                _systemicRiskCache = await resp.json();
                _systemicRiskCacheTs = now;
                return _systemicRiskCache;
            }
        } catch (e) { /* fallback */ }
        return null;
    }

    // ── Setup expectancy cache ──
    const _expectancyCache = {};
    const _expectancyTTL = 15 * 60 * 1000; // 15 min

    async function fetchSetupExpectancy(symbol, fingerprint) {
        const cacheKey = `${symbol}_${fingerprint}`;
        const now = Date.now();
        const cached = _expectancyCache[cacheKey];
        if (cached && (now - cached._ts) < _expectancyTTL) return cached;
        try {
            const resp = await fetch(`${BACKEND_URL}/analysis/setup-stats/combined?symbol=${encodeURIComponent(symbol)}&fingerprint=${encodeURIComponent(fingerprint)}`, {
                signal: AbortSignal.timeout(BACKEND_TIMEOUT)
            });
            if (resp.ok) {
                const data = await resp.json();
                data._ts = now;
                _expectancyCache[cacheKey] = data;
                return data;
            }
        } catch (e) { /* fallback */ }
        return null;
    }

    // ── Get gate weights for current regime ──
    function getGateWeightsForRegime(regime) {
        const weights = REGIME_GATE_WEIGHTS[regime] || DEFAULT_GATE_WEIGHTS;
        return { ...DEFAULT_GATE_WEIGHTS, ...weights };
    }

    // ── Apply redundancy penalization (v7.2: worst-penalty + 2% per extra) ──
    function applyRedundancyPenalty(gateResults, weights) {
        const adjusted = { ...weights };
        // Collect all penalty factors that hit each gate
        const penalties = {}; // gateName → [penaltyFactor, ...]
        for (const pair of REDUNDANCY_PAIRS) {
            if (gateResults[pair.gate1] && gateResults[pair.gate2]) {
                if (!penalties[pair.gate2]) penalties[pair.gate2] = [];
                penalties[pair.gate2].push(pair.penaltyFactor);
            }
        }
        // For each penalized gate: apply worst penalty + 2% per additional overlap
        for (const [gate, factors] of Object.entries(penalties)) {
            if (factors.length === 0) continue;
            const worstPenalty = Math.min(...factors);
            const extraPenalty = (factors.length - 1) * 0.02;
            adjusted[gate] = (adjusted[gate] || 1.0) * Math.max(worstPenalty - extraPenalty, 0.5);
        }
        return adjusted;
    }

    // ── Piecewise calibration: less restrictive than logistic (v7.2) ──
    // Low gateScore → needs minimum floor; Mid → gradual scale; High → near-linear
    function calibrateConfidence(gateScorePercent, regimeQuality, saturation, btcAligned, sessionWeight) {
        let base;
        if (gateScorePercent < 30) {
            // Low: floor at 15, slow rise
            base = 15 + (gateScorePercent / 30) * 15; // 15-30
        } else if (gateScorePercent < 60) {
            // Mid: gradual (30→60 maps to 30→65)
            base = 30 + ((gateScorePercent - 30) / 30) * 35;
        } else {
            // High: near-linear (60→100 maps to 65→95)
            base = 65 + ((gateScorePercent - 60) / 40) * 30;
        }

        // Contextual adjustments (bounded)
        const regimeAdj = ((regimeQuality || 50) - 50) * 0.08; // ±4
        const satAdj = ((saturation || 50) - 50) * -0.06;      // ±3
        const btcAdj = btcAligned ? 2 : -2;
        const sessAdj = ((sessionWeight - 1.0)) * 5;           // kill zone ~+2.5, dead ~-3

        return Math.round(clamp(base + regimeAdj + satAdj + btcAdj + sessAdj, 10, 95));
    }

    // ═══════════════════════════════════════════════════════════════
    // MODULE 1: Z-SCORE STATISTICAL ENGINE
    // ═══════════════════════════════════════════════════════════════
    /**
     * Replaces ALL fixed multipliers. The question is no longer
     * "Is volume 1.3x average?" but "How statistically anomalous
     * is this volume compared to the last 100 candles?"
     *
     * Z-Score > 2.0 = 95th percentile = significant
     * Z-Score > 3.0 = 99.7th percentile = highly significant
     *
     * This auto-adapts: Sunday noise gets filtered, CPI tsunami gets caught.
     */
    function computeZScoreContext(klines, lookback) {
        if (!klines || klines.length < lookback + 3) return null;

        const candles = klines.slice(-(lookback + 5)).map(parseKline);
        const historical = candles.slice(0, lookback);
        const recent = candles.slice(-3);

        const bodies = historical.map(c => Math.abs(c.close - c.open));
        const volumes = historical.map(c => c.volume);
        const ranges = historical.map(c => c.high - c.low);
        const wicks = historical.map(c => {
            const body = Math.abs(c.close - c.open);
            return (c.high - c.low) - body;
        });

        return {
            body:   { mean: mean(bodies),  std: stddev(bodies),  values: bodies },
            volume: { mean: mean(volumes), std: stddev(volumes), values: volumes },
            range:  { mean: mean(ranges),  std: stddev(ranges),  values: ranges },
            wick:   { mean: mean(wicks),   std: stddev(wicks),   values: wicks },
            recent,
            historical,
            lookback
        };
    }

    function getZScore(value, ctx) {
        return ctx.std > 0 ? (value - ctx.mean) / ctx.std : 0;
    }

    // ═══════════════════════════════════════════════════════════════
    // MODULE 2: SESSION CONTEXT & KILL ZONES
    // ═══════════════════════════════════════════════════════════════
    /**
     * Time is as important as price.
     * A breakout at 03:00 BRT (Asian session) has 70% chance of being
     * a fake sweep reversed when London opens at 04:00.
     *
     * Kill Zones (London/NY overlap) get 1.5× signal weight.
     * Dead zones (post-NY) get 0.4× weight.
     * Weekend: cap at AGUARDAR maximum.
     */
    function getSessionContext() {
        const now = new Date();
        const utcHour = now.getUTCHours();
        const utcDay = now.getUTCDay(); // 0=Sunday, 6=Saturday
        const isWeekend = utcDay === 0 || utcDay === 6;

        let currentSession = null;
        for (const [key, session] of Object.entries(SESSIONS)) {
            if (utcHour >= session.start && utcHour < session.end) {
                currentSession = { key, ...session };
                break;
            }
        }
        if (!currentSession) {
            currentSession = { key: 'DEAD', ...SESSIONS.DEAD };
        }

        // BRT offset display (UTC-3)
        const brtHour = (utcHour - 3 + 24) % 24;

        // Liquidity estimate
        let liquidityLevel;
        if (currentSession.weight >= 1.3) liquidityLevel = 'HIGH';
        else if (currentSession.weight >= 0.8) liquidityLevel = 'MEDIUM';
        else liquidityLevel = 'LOW';

        if (isWeekend) {
            liquidityLevel = 'VERY_LOW';
        }

        // Session-adjusted signal multiplier
        let signalMultiplier = currentSession.weight;
        if (isWeekend) signalMultiplier = Math.min(signalMultiplier, 0.5);

        // Fake breakout risk by session
        let fakeBreakoutRisk;
        if (currentSession.key === 'ASIAN' || currentSession.key === 'DEAD') {
            fakeBreakoutRisk = 'HIGH';
        } else if (currentSession.key === 'KILL_ZONE') {
            fakeBreakoutRisk = 'LOW';
        } else {
            fakeBreakoutRisk = 'MEDIUM';
        }
        if (isWeekend) fakeBreakoutRisk = 'VERY_HIGH';

        return {
            session: currentSession.key,
            sessionName: currentSession.name,
            sessionEmoji: currentSession.emoji,
            utcHour,
            brtHour,
            isWeekend,
            isKillZone: currentSession.key === 'KILL_ZONE',
            isDeadZone: currentSession.key === 'DEAD' || currentSession.key === 'ASIAN',
            signalMultiplier,
            liquidityLevel,
            fakeBreakoutRisk,
            maxSignalLevel: isWeekend ? 'AGUARDAR' : (currentSession.weight < 0.5 ? 'AGUARDAR' : 'CONFIRMED'),
            details: `${currentSession.emoji} ${currentSession.name} (${brtHour}h BRT / ${utcHour}h UTC) — Liquidez: ${liquidityLevel}${isWeekend ? ' [WEEKEND]' : ''}`
        };
    }

    // ═══════════════════════════════════════════════════════════════
    // MODULE 3: DISPLACEMENT DETECTOR (Z-SCORE BASED)
    // ═══════════════════════════════════════════════════════════════
    /**
     * V4.0 asked: "Is body > 1.5× average?"
     * V4.1 asks: "How many standard deviations is this body from the norm?"
     *
     * Sunday afternoon: avg body = $50, std = $15
     *   → A $90 body has z-score = 2.67 → SIGNIFICANT
     *
     * CPI day NY open: avg body = $500, std = $300
     *   → A $700 body has z-score = 0.67 → NOT significant (normal for CPI)
     *   → Needs $1100+ body (z=2.0) to be real displacement
     *
     * This is why Z-Score > fixed multipliers.
     */
    function detectDisplacement(klines, timeframe = '1h') {
        const ctx = computeZScoreContext(klines, Z_SCORE_LOOKBACK);
        if (!ctx) return { detected: false, direction: null, strength: 0, bodyZScore: 0, volZScore: 0, details: `Dados insuficientes para ${timeframe}` };

        let best = null;

        for (let i = 0; i < ctx.recent.length; i++) {
            const c = ctx.recent[i];
            const body = Math.abs(c.close - c.open);
            const isBullish = c.close > c.open;

            const bodyZ = getZScore(body, ctx.body);
            const volZ = getZScore(c.volume, ctx.volume);

            // Z-Score based detection: body AND volume must be anomalous
            if (bodyZ >= Z_SCORE_DISPLACEMENT && volZ >= Z_SCORE_VOLUME_MILD) {
                const strength = Math.min((bodyZ * volZ) / 6, 1);

                if (!best || strength > best.strength) {
                    best = {
                        detected: true,
                        direction: isBullish ? 'LONG' : 'SHORT',
                        strength: +strength.toFixed(3),
                        bodyZScore: +bodyZ.toFixed(2),
                        volZScore: +volZ.toFixed(2),
                        bodyRatio: ctx.body.mean > 0 ? +(body / ctx.body.mean).toFixed(2) : 0,
                        volRatio: ctx.volume.mean > 0 ? +(c.volume / ctx.volume.mean).toFixed(2) : 0,
                        timeframe,
                        details: `Displacement ${isBullish ? 'bullish' : 'bearish'} (${timeframe}): body z=${bodyZ.toFixed(1)} vol z=${volZ.toFixed(1)} [${(body / (ctx.body.mean || 1)).toFixed(1)}× / ${(c.volume / (ctx.volume.mean || 1)).toFixed(1)}×]`
                    };
                }
            }
        }

        return best || {
            detected: false, direction: null, strength: 0,
            bodyZScore: ctx.recent.length ? +getZScore(Math.abs(ctx.recent[ctx.recent.length - 1].close - ctx.recent[ctx.recent.length - 1].open), ctx.body).toFixed(2) : 0,
            volZScore: ctx.recent.length ? +getZScore(ctx.recent[ctx.recent.length - 1].volume, ctx.volume).toFixed(2) : 0,
            bodyRatio: 0, volRatio: 0, timeframe,
            details: `Sem displacement ${timeframe}: candles dentro do desvio padrão normal`
        };
    }

    // ═══════════════════════════════════════════════════════════════
    // MODULE 4: VOLUME EXPANSION (Z-SCORE BASED)
    // ═══════════════════════════════════════════════════════════════
    /**
     * Same Z-Score principle applied to volume.
     * Not "is volume 1.3× avg?" but "how anomalous is this volume?"
     */
    function detectVolumeExpansion(klines, lookback) {
        const ctx = computeZScoreContext(klines, lookback || Z_SCORE_LOOKBACK);
        if (!ctx) return { expanding: false, ratio: 0, zScore: 0, sustained: false, direction: null, details: 'Dados insuficientes' };

        const recentVols = ctx.recent.map(c => c.volume);
        const avgRecentVol = mean(recentVols);
        const mainZScore = getZScore(avgRecentVol, ctx.volume);
        const ratio = ctx.volume.mean > 0 ? avgRecentVol / ctx.volume.mean : 0;

        // Sustained: at least 2/3 recent candles individually anomalous
        const anomalousCount = ctx.recent.filter(c => getZScore(c.volume, ctx.volume) >= Z_SCORE_VOLUME_MILD).length;
        const sustained = anomalousCount >= 2;

        // Direction from buy/sell volume
        let buyVol = 0, sellVol = 0;
        ctx.recent.forEach(c => {
            if (c.close > c.open) buyVol += c.volume;
            else sellVol += c.volume;
        });
        const direction = buyVol > sellVol * 1.2 ? 'LONG' : sellVol > buyVol * 1.2 ? 'SHORT' : null;

        const expanding = mainZScore >= Z_SCORE_VOLUME;

        return {
            expanding,
            ratio: +ratio.toFixed(2),
            zScore: +mainZScore.toFixed(2),
            sustained,
            direction,
            anomalousCandles: anomalousCount,
            percentile: +percentile(avgRecentVol, ctx.volume.values).toFixed(0),
            details: expanding
                ? `Volume anômalo: z=${mainZScore.toFixed(1)} (${ratio.toFixed(1)}× média, p${percentile(avgRecentVol, ctx.volume.values).toFixed(0)}${sustained ? ', sustentado' : ', pontual'})`
                : `Volume normal: z=${mainZScore.toFixed(1)} (${ratio.toFixed(1)}× média)`
        };
    }

    // ═══════════════════════════════════════════════════════════════
    // MODULE 5: RANGE POSITION DETECTOR
    // ═══════════════════════════════════════════════════════════════
    function detectRangePosition(currentPrice, volumeProfile, klines1h) {
        const result = {
            inRange: false, rangePosition: null,
            breakoutDetected: false, breakoutDirection: null, breakoutAccepted: false,
            distanceToVAH: 0, distanceToVAL: 0, distanceToPOC: 0,
            rangeWidth: 0, tradeable: false, blockReason: null, details: ''
        };

        if (!volumeProfile || !currentPrice) return result;

        const poc = volumeProfile.poc || currentPrice;
        const vah = volumeProfile.vah || poc * 1.01;
        const val = volumeProfile.val || poc * 0.99;
        const rangeWidth = vah - val;
        const buffer = currentPrice * (RANGE_BUFFER_PERCENT / 100);

        result.rangeWidth = rangeWidth;
        result.distanceToVAH = ((currentPrice - vah) / vah) * 100;
        result.distanceToVAL = ((currentPrice - val) / val) * 100;
        result.distanceToPOC = ((currentPrice - poc) / poc) * 100;

        if (currentPrice > vah + buffer) {
            result.rangePosition = 'ABOVE_RANGE';
            result.breakoutDetected = true;
            result.breakoutDirection = 'LONG';
        } else if (currentPrice < val - buffer) {
            result.rangePosition = 'BELOW_RANGE';
            result.breakoutDetected = true;
            result.breakoutDirection = 'SHORT';
        } else if (Math.abs(currentPrice - vah) < buffer) {
            result.rangePosition = 'NEAR_VAH';
            result.inRange = true;
        } else if (Math.abs(currentPrice - val) < buffer) {
            result.rangePosition = 'NEAR_VAL';
            result.inRange = true;
        } else if (Math.abs(currentPrice - poc) < buffer) {
            result.rangePosition = 'AT_POC';
            result.inRange = true;
        } else {
            result.rangePosition = 'MID_RANGE';
            result.inRange = true;
        }

        // Acceptance check
        if (klines1h && klines1h.length > 0) {
            const last = parseKline(klines1h[klines1h.length - 1]);
            if (last.close > vah + buffer) {
                result.breakoutAccepted = true;
                result.breakoutDirection = 'LONG';
            } else if (last.close < val - buffer) {
                result.breakoutAccepted = true;
                result.breakoutDirection = 'SHORT';
            }
        }

        if (result.breakoutDetected && result.breakoutAccepted) {
            result.tradeable = true;
            result.details = `Breakout ${result.breakoutDirection} aceito fora do range (${result.rangePosition})`;
        } else if (result.breakoutDetected && !result.breakoutAccepted) {
            result.tradeable = false;
            result.blockReason = 'BREAKOUT_NAO_ACEITO';
            result.details = `Breakout sem aceitação — candle não fechou fora do range. AGUARDAR.`;
        } else if (result.rangePosition === 'MID_RANGE') {
            result.tradeable = false;
            result.blockReason = 'MID_RANGE';
            result.details = `Preço no meio do range (POC: $${poc.toFixed(0)}, VAH: $${vah.toFixed(0)}, VAL: $${val.toFixed(0)}). Combustível de liquidez.`;
        } else if (result.rangePosition === 'AT_POC') {
            result.tradeable = false;
            result.blockReason = 'AT_POC';
            result.details = `Preço no POC ($${poc.toFixed(0)}) — zona de máxima liquidez. Sem edge.`;
        } else {
            result.tradeable = false;
            result.blockReason = 'NO_BREAKOUT';
            result.details = `Dentro do range sem breakout. Aguardar expansão.`;
        }

        return result;
    }

    // ═══════════════════════════════════════════════════════════════
    // MODULE 6: RETEST DETECTOR + LIMIT ORDER GENERATOR
    // ═══════════════════════════════════════════════════════════════
    /**
     * V4.0: "Compre Agora" after displacement → you buy the TOP
     * V4.1: "Set Limit Order at Retest" → you get optimal entry
     *
     * Flow:
     *  1. Displacement happens (price rockets from $100 to $110)
     *  2. Old V4: "LONG CONFIRMED - REAGIR AGORA" at $110 ← BAD ENTRY
     *  3. New V4.1: "LONG CONFIRMED - LIMIT ORDER @ $101.5 (retest do breakout)"
     *     → Entry at $101.5, Stop at $99, TP1 $106 (1:2 R:R), TP2 $109 (1:3 R:R)
     *
     * If retest already happened and bounced → MARKET ORDER NOW
     */
    function detectRetestAndGenerateOrder(klines, breakoutLevel, breakoutDirection, currentPrice, atr) {
        const base = { retested: false, retestQuality: null, details: '' };

        if (!klines || klines.length < RETEST_WINDOW_CANDLES || !breakoutLevel) {
            return {
                ...base,
                limitOrder: generateLimitOrder(breakoutLevel, breakoutDirection, currentPrice, atr, false)
            };
        }

        const candles = klines.slice(-RETEST_WINDOW_CANDLES).map(parseKline);
        const proximity = breakoutLevel * (RETEST_PROXIMITY_PERCENT / 100);

        let retestCandle = null;
        let retestQuality = null;

        for (let i = candles.length - 1; i >= 0; i--) {
            const c = candles[i];

            if (breakoutDirection === 'LONG') {
                if (c.low <= breakoutLevel + proximity && c.close > breakoutLevel) {
                    const wickRej = (c.close - c.low) / (c.high - c.low || 1);
                    retestCandle = c;
                    retestQuality = wickRej > 0.7 ? 'STRONG' : wickRej > 0.5 ? 'MODERATE' : 'WEAK';
                    break;
                }
            } else if (breakoutDirection === 'SHORT') {
                if (c.high >= breakoutLevel - proximity && c.close < breakoutLevel) {
                    const wickRej = (c.high - c.close) / (c.high - c.low || 1);
                    retestCandle = c;
                    retestQuality = wickRej > 0.7 ? 'STRONG' : wickRej > 0.5 ? 'MODERATE' : 'WEAK';
                    break;
                }
            }
        }

        const retested = !!retestCandle;

        return {
            retested,
            retestQuality,
            retestPrice: retestCandle ? (breakoutDirection === 'LONG' ? retestCandle.low : retestCandle.high) : null,
            details: retested
                ? `Reteste ${retestQuality} em $${breakoutLevel.toFixed(0)} — bounce confirmado`
                : `Sem reteste em $${breakoutLevel?.toFixed(0) || '?'}`,
            limitOrder: generateLimitOrder(breakoutLevel, breakoutDirection, currentPrice, atr, retested)
        };
    }

    /**
     * Generate execution plan: Limit Order or Market Order
     * Never buy the top of displacement.
     */
    function generateLimitOrder(breakoutLevel, direction, currentPrice, atr, retested) {
        if (!breakoutLevel || !direction || !currentPrice) {
            return { type: 'NONE', reason: 'Sem nível de breakout para ordem' };
        }

        const atrValue = atr || currentPrice * 0.015; // fallback 1.5%

        let entry, stopLoss, tp1, tp2, invalidation;

        if (direction === 'LONG') {
            entry = retested ? currentPrice : breakoutLevel + (atrValue * 0.1); // retest zone
            stopLoss = breakoutLevel - atrValue * 1.2; // below breakout + buffer
            const risk = entry - stopLoss;
            tp1 = entry + risk * 2; // 1:2 R:R
            tp2 = entry + risk * 3; // 1:3 R:R
            invalidation = breakoutLevel - atrValue * 2; // setup dies here
        } else {
            entry = retested ? currentPrice : breakoutLevel - (atrValue * 0.1);
            stopLoss = breakoutLevel + atrValue * 1.2;
            const risk = stopLoss - entry;
            tp1 = entry - risk * 2;
            tp2 = entry - risk * 3;
            invalidation = breakoutLevel + atrValue * 2;
        }

        const risk = Math.abs(entry - stopLoss);
        const rr1 = risk > 0 ? Math.abs(tp1 - entry) / risk : 0;
        const rr2 = risk > 0 ? Math.abs(tp2 - entry) / risk : 0;

        // Execution type
        let execType, execNote;
        if (retested) {
            execType = 'MARKET_AFTER_RETEST';
            execNote = `Reteste confirmado. Entrada a mercado no bounce @ $${currentPrice.toFixed(2)}`;
        } else {
            execType = 'LIMIT_ON_RETEST';
            execNote = `AGUARDAR reteste em $${entry.toFixed(2)}. NÃO comprar no topo do displacement.`;
        }

        return {
            type: execType,
            direction,
            entry: +entry.toFixed(2),
            stopLoss: +stopLoss.toFixed(2),
            tp1: +tp1.toFixed(2),
            tp2: +tp2.toFixed(2),
            invalidation: +invalidation.toFixed(2),
            riskReward1: +rr1.toFixed(1),
            riskReward2: +rr2.toFixed(1),
            riskPercent: currentPrice > 0 ? +((risk / currentPrice) * 100).toFixed(2) : 0,
            note: execNote
        };
    }

    // ═══════════════════════════════════════════════════════════════
    // MODULE 7: FUNDING RATE FILTER (v7.2 — gradual penalty)
    // ═══════════════════════════════════════════════════════════════
    // Replaces binary block with a gradual confidence penalty.
    // Only blocks at truly extreme levels (>0.08%).
    function checkFundingFilter(fundingRate, signalDirection) {
        const rate = parseFloat(fundingRate) || 0;
        const absRate = Math.abs(rate);
        const ratePct = rate * 100;
        const absRatePct = absRate * 100;

        // Determine if funding opposes the signal direction
        const opposes = (rate > 0 && signalDirection === 'LONG') ||
                        (rate < 0 && signalDirection === 'SHORT');

        let passed = true;
        let blocked = false;
        let penalty = 0;
        let riskLevel = 'LOW';
        let reason = `Funding neutro (${ratePct.toFixed(3)}%)`;

        if (opposes) {
            if (absRate > 0.08) {
                // Extreme: block entirely
                passed = false;
                blocked = true;
                penalty = -25;
                riskLevel = 'CRITICAL';
                reason = `Funding ${ratePct.toFixed(3)}% extremo contra ${signalDirection} — bloqueado.`;
            } else if (absRate > FUNDING_EXTREME_THRESHOLD) {
                // High: heavy penalty but allow
                passed = true;
                blocked = false;
                penalty = -15;
                riskLevel = 'HIGH';
                reason = `Funding ${ratePct.toFixed(3)}% alto contra ${signalDirection} (−15%).`;
            } else if (absRate > FUNDING_EXTREME_THRESHOLD * 0.5) {
                // Medium: moderate penalty
                passed = true;
                blocked = false;
                penalty = -8;
                riskLevel = 'MEDIUM';
                reason = `Funding ${ratePct.toFixed(3)}% moderado contra ${signalDirection} (−8%).`;
            } else if (absRate > FUNDING_EXTREME_THRESHOLD * 0.25) {
                // Low-medium: slight warning
                passed = true;
                blocked = false;
                penalty = -3;
                riskLevel = 'LOW';
                reason = `Funding ${ratePct.toFixed(3)}% levemente desfavorável (−3%).`;
            }
        } else if (absRate > FUNDING_EXTREME_THRESHOLD) {
            // Funding favors our direction at extreme level — bonus
            penalty = 5;
            riskLevel = 'LOW';
            reason = `Funding ${ratePct.toFixed(3)}% extremo a FAVOR de ${signalDirection} (+5%).`;
        }

        return {
            rate: +ratePct.toFixed(4),
            isExtreme: absRate > FUNDING_EXTREME_THRESHOLD,
            blocked,  // backward compat
            passed,   // v7.2: gate uses this
            penalty,  // confidence adjustment to apply via soft adjustments
            riskLevel,
            reason,
            details: reason
        };
    }

    // ═══════════════════════════════════════════════════════════════
    // MODULE 8: MICROSTRUCTURE DETECTOR
    // ═══════════════════════════════════════════════════════════════
    /**
     * Detects institutional footprints from candle data:
     *
     * 1. ABSORPTION: Large wick + high volume + small body at key level
     *    → Institutional player absorbing retail orders
     *
     * 2. FAIR VALUE GAP (FVG): Gap between candle[i-1].low and candle[i+1].high
     *    → Imbalance in price delivery, price tends to fill
     *
     * 3. LIQUIDITY VOID: Large body + tiny wicks = price moved fast
     *    → No resistance zone, price can snap back violently
     */
    function detectMicrostructure(klines, direction) {
        if (!klines || klines.length < 20) {
            return { absorption: null, fvg: null, liquidityVoid: null, score: 0, details: 'Dados insuficientes' };
        }

        const candles = klines.slice(-20).map(parseKline);
        const ctx = computeZScoreContext(klines, Z_SCORE_MICRO_LOOKBACK);

        // ── 1. Absorption Detection ──
        let absorption = null;
        for (let i = candles.length - 1; i >= candles.length - 5 && i >= 0; i--) {
            const c = candles[i];
            const range = c.high - c.low;
            if (range <= 0) continue;

            const body = Math.abs(c.close - c.open);
            const wickRatio = (range - body) / range;
            const volZ = ctx ? getZScore(c.volume, ctx.volume) : 0;

            // Large wick (>60% of range) + high volume + small body = absorption
            if (wickRatio >= ABSORPTION_WICK_RATIO && volZ > 1.5) {
                const upperWick = c.high - Math.max(c.open, c.close);
                const lowerWick = Math.min(c.open, c.close) - c.low;
                const absDirection = lowerWick > upperWick ? 'BULLISH' : 'BEARISH';

                absorption = {
                    detected: true,
                    direction: absDirection,
                    wickRatio: +wickRatio.toFixed(2),
                    volumeZScore: +volZ.toFixed(2),
                    priceLevel: absDirection === 'BULLISH' ? c.low : c.high,
                    details: `Absorção ${absDirection} detectada: wick ${(wickRatio * 100).toFixed(0)}%, vol z=${volZ.toFixed(1)}`
                };
                break;
            }
        }

        // ── 2. Fair Value Gap (FVG) Detection ──
        let fvg = null;
        for (let i = candles.length - 2; i >= candles.length - 8 && i >= 1; i--) {
            const prev = candles[i - 1];
            const curr = candles[i];
            const next = candles[i + 1];
            if (!next) continue;

            const gapPercent = ((prev.low - next.high) / curr.close) * 100;

            // Bullish FVG: prev candle low > next candle high (gap up)
            if (prev.low > next.high && gapPercent >= FVG_MIN_GAP_PERCENT) {
                fvg = {
                    detected: true,
                    type: 'BULLISH',
                    gapHigh: prev.low,
                    gapLow: next.high,
                    gapPercent: +Math.abs(gapPercent).toFixed(2),
                    filled: curr.low <= next.high,
                    details: `FVG bullish: gap de ${Math.abs(gapPercent).toFixed(2)}% ($${next.high.toFixed(0)} - $${prev.low.toFixed(0)})`
                };
                break;
            }

            // Bearish FVG: next candle low > prev candle high (gap down)
            const gapPercentBear = ((next.low - prev.high) / curr.close) * 100;
            if (next.low > prev.high && Math.abs(gapPercentBear) >= FVG_MIN_GAP_PERCENT) {
                fvg = {
                    detected: true,
                    type: 'BEARISH',
                    gapHigh: next.low,
                    gapLow: prev.high,
                    gapPercent: +Math.abs(gapPercentBear).toFixed(2),
                    filled: curr.high >= next.low,
                    details: `FVG bearish: gap de ${Math.abs(gapPercentBear).toFixed(2)}%`
                };
                break;
            }
        }

        // ── 3. Liquidity Void Detection ──
        let liquidityVoid = null;
        for (let i = candles.length - 1; i >= candles.length - 5 && i >= 0; i--) {
            const c = candles[i];
            const range = c.high - c.low;
            if (range <= 0) continue;

            const body = Math.abs(c.close - c.open);
            const bodyRatio = body / range;

            // Large body (>85% of range) = price moved with no resistance
            if (bodyRatio >= VOID_BODY_RATIO && ctx) {
                const rangeZ = getZScore(range, ctx.range);
                if (rangeZ > 1.5) {
                    const voidDirection = c.close > c.open ? 'BULLISH' : 'BEARISH';
                    liquidityVoid = {
                        detected: true,
                        direction: voidDirection,
                        bodyRatio: +bodyRatio.toFixed(2),
                        rangeZScore: +rangeZ.toFixed(2),
                        voidRange: { high: c.high, low: c.low },
                        details: `Void ${voidDirection}: body ${(bodyRatio * 100).toFixed(0)}% do range (z=${rangeZ.toFixed(1)}). Preço pode voltar para preencher.`
                    };
                    break;
                }
            }
        }

        // ── Microstructure Score ──
        let score = 0;
        let confirms = [];

        if (absorption?.detected) {
            const absConfirms = (direction === 'LONG' && absorption.direction === 'BULLISH') ||
                                (direction === 'SHORT' && absorption.direction === 'BEARISH');
            if (absConfirms) { score += 8; confirms.push('absorção'); }
            else { score -= 3; }
        }

        if (fvg?.detected) {
            const fvgConfirms = (direction === 'LONG' && fvg.type === 'BULLISH') ||
                                (direction === 'SHORT' && fvg.type === 'BEARISH');
            if (fvgConfirms && !fvg.filled) { score += 5; confirms.push('FVG'); }
        }

        if (liquidityVoid?.detected) {
            // Voids are WARNING — price can snap back
            score -= 5;
        }

        return {
            absorption,
            fvg,
            liquidityVoid,
            score: clamp(score, -10, 15),
            confirmsDirection: confirms.length > 0,
            confirmations: confirms,
            details: confirms.length > 0
                ? `Microestrutura confirma ${direction}: ${confirms.join(', ')}`
                : liquidityVoid?.detected
                    ? `Atenção: void de liquidez detectado — possível snap-back`
                    : 'Sem sinais microestruturais significativos'
        };
    }

    // ═══════════════════════════════════════════════════════════════
    // MODULE 9: SQUEEZE EXPANSION DETECTOR
    // ═══════════════════════════════════════════════════════════════
    function detectSqueezeExpansion(volatilityMetrics, klines1h) {
        if (!volatilityMetrics) return { isSqueeze: false, expanding: false, direction: null };

        const regime = volatilityMetrics.regime || 'NORMAL';
        const isSqueeze = regime === 'SQUEEZE' || regime === 'LOW';
        const bbWidth = volatilityMetrics.bollingerBands?.bandwidthPercentile || 50;

        if (!isSqueeze) return { isSqueeze: false, expanding: false, direction: null, bbWidth, details: `Volatilidade normal (p${bbWidth})` };

        let expanding = false, direction = null;

        if (klines1h && klines1h.length >= 10) {
            const candles = klines1h.slice(-10).map(parseKline);
            const recentRange = Math.max(...candles.slice(-5).map(c => c.high)) - Math.min(...candles.slice(-5).map(c => c.low));
            const olderRange = Math.max(...candles.slice(0, 5).map(c => c.high)) - Math.min(...candles.slice(0, 5).map(c => c.low));

            expanding = recentRange > olderRange * 1.3;
            if (expanding) {
                const last = candles[candles.length - 1];
                direction = last.close > last.open ? 'LONG' : 'SHORT';
            }
        }

        return {
            isSqueeze, expanding, direction, bbWidth,
            details: expanding
                ? `🔥 Squeeze expandindo para ${direction} — BB p${bbWidth}`
                : `📦 Squeeze ativo (p${bbWidth}), aguardando expansão. NÃO OPERAR.`
        };
    }

    // ═══════════════════════════════════════════════════════════════
    // MODULE 9b: VOLATILITY REGIME SHIFT DETECTOR
    // ═══════════════════════════════════════════════════════════════
    /**
     * Detects structural changes in volatility using ATR EMA ratio.
     * ATR_EMA(20) vs ATR_EMA(100) — when fast diverges from slow,
     * it signals a regime transition:
     *   EXPLOSIVE: fast/slow > 1.5 — volatility expanding structurally
     *   COMPRESSED: fast/slow < 0.6 — coiled spring, breakout imminent
     *   TRANSITIONING: between thresholds, moving fast
     *   STABLE: normal equilibrium
     */
    function detectVolatilityRegimeShift(klines) {
        if (!klines || klines.length < VOL_SHIFT_ATR_SLOW + 5) {
            return { shift: 'UNKNOWN', ratio: 0, atrFast: 0, atrSlow: 0, details: 'Dados insuficientes', confidence: 0 };
        }

        // Calculate True Range for each candle
        const candles = klines.map(parseKline);
        const trueRanges = [];
        for (let i = 1; i < candles.length; i++) {
            const high = candles[i].high;
            const low = candles[i].low;
            const prevClose = candles[i - 1].close;
            const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
            trueRanges.push(tr);
        }

        if (trueRanges.length < VOL_SHIFT_ATR_SLOW) {
            return { shift: 'UNKNOWN', ratio: 0, atrFast: 0, atrSlow: 0, details: 'TR insuficiente', confidence: 0 };
        }

        // EMA of True Range (fast and slow)
        const atrFast = _ema(trueRanges, VOL_SHIFT_ATR_FAST);
        const atrSlow = _ema(trueRanges, VOL_SHIFT_ATR_SLOW);

        if (atrSlow <= 0) {
            return { shift: 'UNKNOWN', ratio: 0, atrFast, atrSlow, details: 'ATR slow = 0', confidence: 0 };
        }

        const ratio = atrFast / atrSlow;

        // Determine shift state
        let shift, details, confidence, icon;
        if (ratio >= VOL_SHIFT_EXPLOSIVE) {
            shift = 'EXPLOSIVE';
            confidence = clamp(Math.round((ratio - 1.0) * 80), 30, 100);
            icon = '🌋';
            details = `${icon} Volatilidade EXPLOSIVA (ratio ${ratio.toFixed(2)}) — estrutura mudando, SL mais amplo recomendado`;
        } else if (ratio <= VOL_SHIFT_COMPRESSED) {
            shift = 'COMPRESSED';
            confidence = clamp(Math.round((1.0 - ratio) * 80), 30, 100);
            icon = '🧊';
            details = `${icon} Volatilidade COMPRIMIDA (ratio ${ratio.toFixed(2)}) — breakout iminente, aguardar direção`;
        } else if (ratio > 1.2) {
            shift = 'TRANSITIONING_UP';
            confidence = clamp(Math.round((ratio - 1.0) * 50), 15, 60);
            icon = '📈';
            details = `${icon} Vol transitioning UP (${ratio.toFixed(2)}) — monitorar expansão`;
        } else if (ratio < 0.8) {
            shift = 'TRANSITIONING_DOWN';
            confidence = clamp(Math.round((1.0 - ratio) * 50), 15, 60);
            icon = '📉';
            details = `${icon} Vol transitioning DOWN (${ratio.toFixed(2)}) — contração em curso`;
        } else {
            shift = 'STABLE';
            confidence = 10;
            icon = '⚖️';
            details = `${icon} Volatilidade estável (ratio ${ratio.toFixed(2)})`;
        }

        // Rate of change (acceleration of shift)
        const recentTR = trueRanges.slice(-10);
        const olderTR = trueRanges.slice(-20, -10);
        const recentAvg = recentTR.reduce((a, b) => a + b, 0) / recentTR.length;
        const olderAvg = olderTR.length > 0 ? olderTR.reduce((a, b) => a + b, 0) / olderTR.length : recentAvg;
        const acceleration = olderAvg > 0 ? ((recentAvg - olderAvg) / olderAvg) * 100 : 0;

        return {
            shift,
            ratio: +ratio.toFixed(3),
            atrFast: +atrFast.toFixed(6),
            atrSlow: +atrSlow.toFixed(6),
            acceleration: +acceleration.toFixed(1),
            confidence,
            icon,
            details
        };
    }

    // ═══════════════════════════════════════════════════════════════
    // MODULE 9c: MARKET BREADTH (Cross-Asset Sentiment)
    // ═══════════════════════════════════════════════════════════════
    /**
     * Scans all recently analyzed symbols from the score history cache
     * to calculate market-wide breadth:
     *   breadth_long = % of assets showing LONG signals
     *   breadth_short = % of assets showing SHORT signals
     *   breadth_neutral = % neutral
     *
     * If > 65% of market is LONG → strong bullish breadth → boost LONG confidence
     * If < 35% LONG → bearish breadth → penalize LONG, boost SHORT
     */
    function calculateMarketBreadth(currentSymbol, currentDirection) {
        // Use score history from localStorage (updated by all analyses)
        const scoreHistory = safeGet(SCORE_HISTORY_KEY) || {};
        const signalHistory = safeGet(STORAGE_PREFIX + 'signal_directions') || {};
        const now = Date.now();
        const maxAge = 15 * 60 * 1000; // 15 min

        let totalAssets = 0, longCount = 0, shortCount = 0, neutralCount = 0;
        const assetDetails = [];

        for (const [sym, data] of Object.entries(scoreHistory)) {
            if (sym === currentSymbol) continue; // exclude self
            if (!data.ts || (now - data.ts) > maxAge) continue;

            totalAssets++;
            const direction = signalHistory[sym]?.direction || 'NEUTRAL';
            if (direction === 'LONG') { longCount++; }
            else if (direction === 'SHORT') { shortCount++; }
            else { neutralCount++; }
            assetDetails.push({ symbol: sym, direction, confidence: data.confidence });
        }

        if (totalAssets < 3) {
            return {
                available: false,
                longPct: 50,
                shortPct: 50,
                neutralPct: 0,
                totalAssets,
                alignment: 'INSUFFICIENT_DATA',
                boost: 0,
                details: 'Poucos ativos analisados para breadth (mín: 3)',
                assets: assetDetails
            };
        }

        const longPct = Math.round((longCount / totalAssets) * 100);
        const shortPct = Math.round((shortCount / totalAssets) * 100);
        const neutralPct = 100 - longPct - shortPct;

        // Determine alignment with current signal
        let alignment, boost, details, icon;
        if (currentDirection === 'LONG') {
            if (longPct >= BREADTH_STRONG_THRESHOLD) {
                alignment = 'STRONG_ALIGNED';
                boost = 8;
                icon = '🟢';
                details = `${icon} Breadth FORTE: ${longPct}% do mercado bullish — confirma LONG`;
            } else if (longPct <= BREADTH_WEAK_THRESHOLD) {
                alignment = 'DIVERGING';
                boost = -10;
                icon = '🔴';
                details = `${icon} Breadth CONTRA: apenas ${longPct}% bullish — LONG contra a maré`;
            } else {
                alignment = 'NEUTRAL';
                boost = 0;
                icon = '🟡';
                details = `${icon} Breadth misto: ${longPct}% bullish, ${shortPct}% bearish`;
            }
        } else if (currentDirection === 'SHORT') {
            if (shortPct >= BREADTH_STRONG_THRESHOLD) {
                alignment = 'STRONG_ALIGNED';
                boost = 8;
                icon = '🟢';
                details = `${icon} Breadth FORTE: ${shortPct}% do mercado bearish — confirma SHORT`;
            } else if (shortPct <= BREADTH_WEAK_THRESHOLD) {
                alignment = 'DIVERGING';
                boost = -10;
                icon = '🔴';
                details = `${icon} Breadth CONTRA: apenas ${shortPct}% bearish — SHORT contra a maré`;
            } else {
                alignment = 'NEUTRAL';
                boost = 0;
                icon = '🟡';
                details = `${icon} Breadth misto: ${longPct}% bullish, ${shortPct}% bearish`;
            }
        } else {
            alignment = 'NEUTRAL';
            boost = 0;
            icon = '🟡';
            details = `${icon} Breadth: ${longPct}% bullish, ${shortPct}% bearish, ${neutralPct}% neutro`;
        }

        // Cache for other consumers
        safeSet(BREADTH_CACHE_KEY, { longPct, shortPct, neutralPct, totalAssets, ts: now });

        return {
            available: true,
            longPct,
            shortPct,
            neutralPct,
            totalAssets,
            alignment,
            boost,
            icon,
            details,
            assets: assetDetails
        };
    }

    // ═══════════════════════════════════════════════════════════════
    // MODULE 27: MACRO LIQUIDITY INDEX
    // ═══════════════════════════════════════════════════════════════
    /**
     * V7: Measures macro-level market liquidity from:
     * - BTC dominance trend (rising = risk-off)
     * - Total market cap momentum
     * - Average funding rates across top assets
     * - Taker buy/sell pressure aggregated
     *
     * Does NOT veto signals — adjusts confidence by ±3-5%
     */
    const MACRO_LIQ_CACHE_KEY = STORAGE_PREFIX + 'macro_liquidity';
    const MACRO_LIQ_TTL = 5 * 60 * 1000; // 5 min

    async function calculateMacroLiquidity() {
        // Check cache
        const cached = safeGet(MACRO_LIQ_CACHE_KEY);
        if (cached && Date.now() - cached.ts < MACRO_LIQ_TTL) {
            return cached;
        }

        const result = {
            available: false,
            index: 50,  // 0-100 scale: 0=dry, 100=flush
            trend: 'STABLE',
            btcDominanceTrend: null,
            totalMcapTrend: null,
            avgFunding: null,
            adjustment: 0,
            icon: '💧',
            details: 'Liquidez macro indisponível'
        };

        try {
            // Fetch BTC dominance (CoinGecko global)
            const [globalResp, btcKlinesResp] = await Promise.all([
                fetch('https://api.coingecko.com/api/v3/global', { signal: AbortSignal.timeout(5000) })
                    .then(r => r.json()).catch(() => null),
                fetch('https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=14', { signal: AbortSignal.timeout(3000) })
                    .then(r => r.json()).catch(() => [])
            ]);

            if (!globalResp?.data) return result;
            result.available = true;

            const btcDominance = globalResp.data.market_cap_percentage?.btc || 50;
            const totalMcap = globalResp.data.total_market_cap?.usd || 0;
            const mcapChange24h = globalResp.data.market_cap_change_percentage_24h_usd || 0;

            // BTC dominance trend (7d EMA comparison)
            // Rising dominance = capital flowing to BTC = risk-off for alts
            let btcDomTrend = 'STABLE';
            if (btcDominance > 55) btcDomTrend = 'RISING';
            else if (btcDominance < 45) btcDomTrend = 'FALLING';
            result.btcDominanceTrend = { value: btcDominance, trend: btcDomTrend };

            // Total market cap momentum
            let mcapTrend = 'STABLE';
            if (mcapChange24h > 2) mcapTrend = 'EXPANDING';
            else if (mcapChange24h < -2) mcapTrend = 'CONTRACTING';
            result.totalMcapTrend = { value: totalMcap, change24h: mcapChange24h, trend: mcapTrend };

            // Compute index: higher = more liquid market
            let indexScore = 50;

            // Market cap momentum (+/-15)
            if (mcapTrend === 'EXPANDING') indexScore += 15;
            else if (mcapTrend === 'CONTRACTING') indexScore -= 15;

            // BTC dominance effect (+/-10)
            if (btcDomTrend === 'FALLING') indexScore += 10;  // alt season = high liq
            else if (btcDomTrend === 'RISING') indexScore -= 10; // BTC dominance = alts dry

            // BTC daily volume expansion
            if (btcKlinesResp && btcKlinesResp.length >= 7) {
                const volumes = btcKlinesResp.map(k => parseFloat(k[5]));
                const recent = mean(volumes.slice(-3));
                const older = mean(volumes.slice(0, -3));
                const volRatio = older > 0 ? recent / older : 1;
                if (volRatio > 1.3) indexScore += 10;
                else if (volRatio < 0.7) indexScore -= 10;
            }

            // Market cap magnitude bonus
            if (totalMcap > 3e12) indexScore += 10;       // >$3T
            else if (totalMcap > 2e12) indexScore += 5;     // >$2T
            else if (totalMcap < 1e12) indexScore -= 10;    // <$1T

            indexScore = clamp(indexScore, 0, 100);
            result.index = indexScore;

            // Trend classification
            if (indexScore >= 70) { result.trend = 'FLUSH'; result.icon = '🌊'; }
            else if (indexScore >= 55) { result.trend = 'HEALTHY'; result.icon = '💧'; }
            else if (indexScore >= 40) { result.trend = 'TIGHTENING'; result.icon = '🔻'; }
            else { result.trend = 'DRY'; result.icon = '🏜️'; }

            // Confidence adjustment
            if (indexScore >= 70) result.adjustment = 3;
            else if (indexScore >= 55) result.adjustment = 0;
            else if (indexScore >= 40) result.adjustment = -3;
            else result.adjustment = -5;

            const trendLabels = { FLUSH: 'Muito líquido', HEALTHY: 'Saudável', TIGHTENING: 'Apertando', DRY: 'Seco' };
            result.details = `Liquidez Macro: ${trendLabels[result.trend]} (${indexScore}/100) | BTC Dom: ${btcDominance.toFixed(1)}% (${btcDomTrend}) | MCap 24h: ${mcapChange24h > 0 ? '+' : ''}${mcapChange24h.toFixed(1)}%`;

            // Cache
            result.ts = Date.now();
            safeSet(MACRO_LIQ_CACHE_KEY, result);

        } catch (e) {
        }

        return result;
    }

    // ═══════════════════════════════════════════════════════════════
    // MODULE 10: DATA INTEGRITY GATE
    // ═══════════════════════════════════════════════════════════════
    /**
     * Validates all incoming data BEFORE analysis.
     * If critical data is missing → FORCE_NEUTRO, no fallback, no guesses.
     */
    function checkDataIntegrity(rawData) {
        const issues = [];
        let critical = false;
        let degraded = false;

        CRITICAL_DATA_KEYS.forEach(key => {
            const val = rawData[key];
            if (!val || (Array.isArray(val) && val.length === 0) || (typeof val === 'number' && val <= 0)) {
                issues.push(`❌ ${key}: ausente ou vazio`);
                critical = true;
            }
        });

        IMPORTANT_DATA_KEYS.forEach(key => {
            const val = rawData[key];
            if (!val || (Array.isArray(val) && val.length === 0) ||
                (typeof val === 'object' && !Array.isArray(val) && Object.keys(val).length === 0)) {
                issues.push(`⚠️ ${key}: indisponível`);
                degraded = true;
            }
        });

        if (rawData.klines1h && rawData.klines1h.length < 20) {
            issues.push('⚠️ klines1h: apenas ' + rawData.klines1h.length + ' candles (min: 20)');
            degraded = true;
        }
        if (rawData.klines4h && rawData.klines4h.length < 20) {
            issues.push('⚠️ klines4h: apenas ' + rawData.klines4h.length + ' candles (min: 20)');
            degraded = true;
        }

        return {
            valid: !critical,
            critical,
            degraded,
            issues,
            score: critical ? 0 : degraded ? 70 : 100,
            details: critical
                ? '🚨 DADOS CRÍTICOS AUSENTES — FORÇANDO NEUTRO'
                : degraded
                    ? '⚠️ Alguns dados indisponíveis — qualidade reduzida'
                    : '✅ Todos os dados validados'
        };
    }

    // ═══════════════════════════════════════════════════════════════
    // MODULE 11: OPEN INTEREST ANALYSIS (OI + OI Delta)
    // ═══════════════════════════════════════════════════════════════
    /**
     * MANDATORY for crypto futures. Detects:
     * - Short squeeze (OI falling + short liquidations + price up)
     * - Long squeeze (OI falling + long liquidations + price down)
     * - Position buildup (OI rising + aggressive taker)
     * - Fake breakout (price moves with no new OI = just liquidations)
     */
    function analyzeOpenInterest(rawData, intendedDirection) {
        const oi = rawData.openInterest;
        const oiHist = rawData.openInterestHist;
        const takerVol = rawData.takerBuySellVol;
        const forceOrders = rawData.forceOrders;

        if (!oi || !oi.openInterest) {
            return { available: false, confirmsDirection: true, signal: 'UNKNOWN', score: 0, details: 'OI indisponível' };
        }

        const currentOI = parseFloat(oi.openInterest);
        let oiDeltaPercent = 0;
        let oiTrend = 'STABLE';

        if (oiHist && oiHist.length >= 2) {
            const oldOI = parseFloat(oiHist[0].sumOpenInterest || oiHist[0].openInterest || 0);
            const newOI = parseFloat(oiHist[oiHist.length - 1].sumOpenInterest || oiHist[oiHist.length - 1].openInterest || 0);
            if (oldOI > 0) {
                oiDeltaPercent = ((newOI - oldOI) / oldOI) * 100;
                oiTrend = oiDeltaPercent > OI_BUILDUP_THRESHOLD ? 'RISING_FAST'
                    : oiDeltaPercent > 1 ? 'RISING'
                    : oiDeltaPercent < -OI_SQUEEZE_THRESHOLD ? 'FALLING_FAST'
                    : oiDeltaPercent < -1 ? 'FALLING' : 'STABLE';
            }
        }

        // Taker buy/sell bias
        let takerBias = 'NEUTRAL';
        let takerRatio = 1;
        if (takerVol && takerVol.length > 0) {
            const recent = takerVol.slice(-6);
            let totalBuyRatio = 0;
            recent.forEach(t => {
                const buy = parseFloat(t.buyVol || 0);
                const sell = parseFloat(t.sellVol || 1);
                totalBuyRatio += buy / (sell || 1);
            });
            takerRatio = totalBuyRatio / recent.length;
            takerBias = takerRatio > 1.1 ? 'BULLISH' : takerRatio < 0.9 ? 'BEARISH' : 'NEUTRAL';
        }

        // Liquidation analysis (last 1 hour)
        let liqLongs = 0, liqShorts = 0, liqTotalUSD = 0;
        if (forceOrders && forceOrders.length > 0) {
            const oneHourAgo = Date.now() - 3600000;
            forceOrders.forEach(order => {
                if (parseInt(order.time) > oneHourAgo) {
                    const usd = parseFloat(order.price) * parseFloat(order.origQty);
                    liqTotalUSD += usd;
                    if (order.side === 'SELL') liqLongs++;
                    else liqShorts++;
                }
            });
        }

        // Pattern detection
        let signal = 'NEUTRAL';
        let score = 0;
        let confirmsDirection = true;
        let description = '';

        if (oiTrend === 'FALLING_FAST' && liqShorts > liqLongs * 2) {
            signal = 'SHORT_SQUEEZE';
            score = 2;
            description = '🔥 Short Squeeze: OI caindo + shorts liquidados';
            confirmsDirection = intendedDirection === 'LONG';
        } else if (oiTrend === 'FALLING_FAST' && liqLongs > liqShorts * 2) {
            signal = 'LONG_SQUEEZE';
            score = -2;
            description = '🔥 Long Squeeze: OI caindo + longs liquidados';
            confirmsDirection = intendedDirection === 'SHORT';
        } else if ((oiTrend === 'RISING' || oiTrend === 'RISING_FAST') && takerBias === 'BULLISH') {
            signal = 'LONG_BUILDUP';
            score = 1.5;
            description = '📈 Acumulação LONG: OI subindo + compras agressivas';
            confirmsDirection = intendedDirection === 'LONG';
        } else if ((oiTrend === 'RISING' || oiTrend === 'RISING_FAST') && takerBias === 'BEARISH') {
            signal = 'SHORT_BUILDUP';
            score = -1.5;
            description = '📉 Acumulação SHORT: OI subindo + vendas agressivas';
            confirmsDirection = intendedDirection === 'SHORT';
        } else if (oiTrend === 'FALLING' && liqTotalUSD > 0) {
            signal = 'POSSIBLE_FAKE';
            score = 0;
            description = '⚠️ Possível falso breakout: OI caindo sem novas posições';
            confirmsDirection = false;
        } else {
            description = `OI estável (Δ${oiDeltaPercent.toFixed(1)}%)`;
            confirmsDirection = true;
        }

        return {
            available: true,
            currentOI,
            oiDeltaPercent: +oiDeltaPercent.toFixed(2),
            oiTrend,
            takerBias,
            takerRatio: +takerRatio.toFixed(3),
            liquidations: { longs: liqLongs, shorts: liqShorts, totalUSD: liqTotalUSD },
            signal,
            score,
            confirmsDirection,
            description,
            details: `OI: ${(currentOI / 1e6).toFixed(1)}M | Δ: ${oiDeltaPercent > 0 ? '+' : ''}${oiDeltaPercent.toFixed(1)}% | Taker: ${takerBias} | Liqs: ${liqLongs}L/${liqShorts}S`
        };
    }

    // ═══════════════════════════════════════════════════════════════
    // MODULE 12: ANTI-SPOOFING (Order Book Delta)
    // ═══════════════════════════════════════════════════════════════
    /**
     * v7.1: Detects market manipulation via order book analysis
     * with regime-adaptive thresholds:
     * - VOLATILE regimes = relaxed thresholds (natural skew)
     * - RANGING/COMPRESSION = tightened (spoofing more impactful)
     */
    function detectSpoofing(rawData, regimeKey) {
        const ob = rawData.orderBook;
        if (!ob || !ob.bids || !ob.asks || ob.bids.length === 0 || ob.asks.length === 0) {
            return { detected: false, risk: 'UNKNOWN', obBias: 'NEUTRAL', score: 0, details: 'Order book indisponível' };
        }

        // v7.1: Adaptive thresholds
        const mult = SPOOFING_REGIME_MULTIPLIERS[regimeKey] || { imbalance: 1.0, wall: 1.0, spread: 1.0 };
        const imbalanceThreshold = SPOOFING_IMBALANCE_THRESHOLD * mult.imbalance;
        const wallThreshold = SPOOFING_WALL_PERCENT * mult.wall;
        const spreadThreshold = SPOOFING_SPREAD_THRESHOLD * mult.spread;

        let totalBidVol = 0, totalAskVol = 0;
        let maxBidWall = 0, maxAskWall = 0;

        ob.bids.forEach(bid => {
            const vol = parseFloat(bid[0]) * parseFloat(bid[1]);
            totalBidVol += vol;
            if (vol > maxBidWall) maxBidWall = vol;
        });

        ob.asks.forEach(ask => {
            const vol = parseFloat(ask[0]) * parseFloat(ask[1]);
            totalAskVol += vol;
            if (vol > maxAskWall) maxAskWall = vol;
        });

        const bidAskRatio = totalAskVol > 0 ? totalBidVol / totalAskVol : 1;
        const bestBid = parseFloat(ob.bids[0][0]);
        const bestAsk = parseFloat(ob.asks[0][0]);
        const spreadPercent = bestBid > 0 ? ((bestAsk - bestBid) / bestBid) * 100 : 0;

        const maxBidPercent = totalBidVol > 0 ? (maxBidWall / totalBidVol) * 100 : 0;
        const maxAskPercent = totalAskVol > 0 ? (maxAskWall / totalAskVol) * 100 : 0;

        let spoofRisk = 'LOW';
        let detected = false;
        const issues = [];

        if (bidAskRatio > imbalanceThreshold || (1 / bidAskRatio) > imbalanceThreshold) {
            const dir = bidAskRatio > imbalanceThreshold ? 'compra' : 'venda';
            issues.push(`🚨 Muro de ${dir} suspeito: ${Math.max(bidAskRatio, 1 / bidAskRatio).toFixed(1)}:1`);
            spoofRisk = 'HIGH';
            detected = true;
        }

        if (maxBidPercent > wallThreshold || maxAskPercent > wallThreshold) {
            issues.push(`⚠️ Parede detectada: ${Math.max(maxBidPercent, maxAskPercent).toFixed(0)}% do depth em 1 nível`);
            if (spoofRisk === 'LOW') spoofRisk = 'MEDIUM';
        }

        if (spreadPercent > spreadThreshold) {
            issues.push(`⚠️ Spread alto: ${spreadPercent.toFixed(3)}%`);
            if (spoofRisk === 'LOW') spoofRisk = 'MEDIUM';
        }

        const obBias = bidAskRatio > 1.2 ? 'BULLISH' : bidAskRatio < 0.8 ? 'BEARISH' : 'NEUTRAL';

        return {
            detected,
            risk: spoofRisk,
            bidAskRatio: +bidAskRatio.toFixed(3),
            spreadPercent: +spreadPercent.toFixed(4),
            obBias,
            issues,
            score: spoofRisk === 'HIGH' ? -2 : spoofRisk === 'MEDIUM' ? -1 : 0,
            details: spoofRisk !== 'LOW'
                ? `🚨 ${issues[0]}`
                : `✅ Book normal (B/A: ${bidAskRatio.toFixed(2)}, spread: ${spreadPercent.toFixed(3)}%)`
        };
    }

    // ═══════════════════════════════════════════════════════════════
    // MODULE 13: ENHANCED 6-STATE REGIME
    // ═══════════════════════════════════════════════════════════════
    /**
     * 6 regime states that adapt indicator weights, signal criteria, and R:R:
     * TREND_UP, TREND_DOWN, RANGE, EXPANSION, COMPRESSION, HIGH_VOL
     */
    function computeEnhancedRegime(rawData, v3Regime, oiAnalysis) {
        const klines1h = rawData.klines1h;
        const klines4h = rawData.klines4h;

        if (!klines1h || klines1h.length < 30 || !klines4h || klines4h.length < 20) {
            return v3Regime || { regime: 'RANGE', regimeStrength: 0.3, regimeIcon: '⚖️', regimeColor: '#f59e0b', regimeDescription: 'Dados insuficientes para regime', falseBreakoutRisk: 'MEDIUM' };
        }

        // Calculate ATR percentile for volatility classification
        const closes1h = klines1h.map(k => parseFloat(k[4]));
        const atrValues = [];
        for (let i = 14; i < klines1h.length; i++) {
            let atr = 0;
            for (let j = i - 14; j < i; j++) {
                const h = parseFloat(klines1h[j][2]);
                const l = parseFloat(klines1h[j][3]);
                const pc = parseFloat(klines1h[j > 0 ? j - 1 : j][4]);
                atr += Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
            }
            atrValues.push(atr / 14);
        }
        const currentATR = atrValues[atrValues.length - 1] || 0;
        const sortedATR = atrValues.slice().sort((a, b) => a - b);
        const atrPercentile = sortedATR.length > 0 ? (sortedATR.findIndex(v => v >= currentATR) / sortedATR.length) * 100 : 50;

        // EMA trend detection
        const ema20 = _ema(closes1h, 20);
        const ema50 = _ema(closes1h, 50);
        const price = closes1h[closes1h.length - 1];
        const trendUp = price > ema20 && ema20 > ema50;
        const trendDown = price < ema20 && ema20 < ema50;

        // ADX-like "directional" strength from V3 regime
        const adxVal = v3Regime?.adx || 20;
        const isTrending = adxVal > 25;

        // OI context
        const oiRising = oiAnalysis?.oiTrend === 'RISING' || oiAnalysis?.oiTrend === 'RISING_FAST';
        const oiFalling = oiAnalysis?.oiTrend === 'FALLING' || oiAnalysis?.oiTrend === 'FALLING_FAST';

        let regime, regimeStrength, regimeIcon, regimeColor, regimeDescription;
        let falseBreakoutRisk = 'LOW';

        // COMPRESSION: Low vol, low ATR, squeeze incoming
        if (atrPercentile < 20) {
            regime = 'COMPRESSION';
            regimeStrength = 0.4;
            regimeIcon = '💎';
            regimeColor = '#8b5cf6';
            regimeDescription = 'Compressão de volatilidade — explosão iminente';
            falseBreakoutRisk = 'HIGH';
        }
        // HIGH_VOL: Extreme volatility, danger zone
        else if (atrPercentile > 85) {
            regime = 'HIGH_VOL';
            regimeStrength = 0.6;
            regimeIcon = '🌋';
            regimeColor = '#ef4444';
            regimeDescription = 'Volatilidade extrema — stops largos obrigatórios';
            falseBreakoutRisk = 'MEDIUM';
        }
        // EXPANSION: Strong trend with rising OI (new money entering)
        else if (isTrending && oiRising && atrPercentile > 60) {
            regime = trendUp ? 'EXPANSION_UP' : 'EXPANSION_DOWN';
            regimeStrength = 0.85;
            regimeIcon = trendUp ? '🚀' : '💀';
            regimeColor = trendUp ? '#22c55e' : '#ef4444';
            regimeDescription = `Expansão ${trendUp ? 'alta' : 'baixa'}: tendência + OI crescente + volatilidade`;
            falseBreakoutRisk = 'LOW';
        }
        // TREND_UP / TREND_DOWN
        else if (isTrending && trendUp) {
            regime = 'TREND_UP';
            regimeStrength = Math.min((adxVal - 20) / 30, 1);
            regimeIcon = '📈';
            regimeColor = '#4ade80';
            regimeDescription = 'Tendência de alta';
            falseBreakoutRisk = 'LOW';
        }
        else if (isTrending && trendDown) {
            regime = 'TREND_DOWN';
            regimeStrength = Math.min((adxVal - 20) / 30, 1);
            regimeIcon = '📉';
            regimeColor = '#f87171';
            regimeDescription = 'Tendência de baixa';
            falseBreakoutRisk = 'LOW';
        }
        // RANGE: Default
        else {
            regime = 'RANGE';
            regimeStrength = 0.3;
            regimeIcon = '⚖️';
            regimeColor = '#f59e0b';
            regimeDescription = 'Mercado lateral — osciladores mais confiáveis';
            falseBreakoutRisk = oiFalling ? 'HIGH' : 'MEDIUM';
        }

        return {
            regime,
            regimeStrength,
            regimeIcon,
            regimeColor,
            regimeDescription,
            atrPercentile: +atrPercentile.toFixed(0),
            falseBreakoutRisk,
            adx: adxVal
        };
    }

    function _ema(data, period) {
        if (!data || data.length < period) return data ? data[data.length - 1] : 0;
        const k = 2 / (period + 1);
        let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
        for (let i = period; i < data.length; i++) {
            ema = data[i] * k + ema * (1 - k);
        }
        return ema;
    }

    // ═══════════════════════════════════════════════════════════════
    // MODULE 10b: BOS SCORING (v7.2 — contínuo, não binário)
    // ═══════════════════════════════════════════════════════════════
    function scoreBosGate(bosValidation) {
        if (!bosValidation) return { score: 0, label: 'N/A' };
        if (bosValidation.bosType === 'REAL') return { score: 1.0, label: 'REAL' };
        if (bosValidation.bosType === 'WEAK_BOS' || bosValidation.bosType === 'WEAK') return { score: 0.5, label: 'WEAK' };
        if (bosValidation.bosType === 'FAKE_SWEEP') return { score: 0, label: 'FAKE' };
        return { score: 0, label: bosValidation.bosType || 'NONE' };
    }

    // ═══════════════════════════════════════════════════════════════
    // MODULE 10c: ACCEPTANCE TIMING (v7.2 — faster detection)
    // ═══════════════════════════════════════════════════════════════
    function detectAcceptance(rangePosition, rawData) {
        if (rangePosition?.breakoutAccepted) {
            return { accepted: true, timeframe: 'default', confidence: 1.0, details: 'Aceitação confirmada (candle fechou fora)' };
        }
        try {
            const klines15m = rawData?.klines15m;
            if (klines15m && klines15m.length >= 3) {
                const last3 = klines15m.slice(-3);
                const closes = last3.map(k => parseFloat(k[4]));
                const high = rangePosition?.rangeHigh || 0;
                const low = rangePosition?.rangeLow || 0;
                if (high > 0 && low > 0) {
                    const allAbove = closes.every(c => c > high);
                    const allBelow = closes.every(c => c < low);
                    if (allAbove || allBelow) {
                        return { accepted: true, timeframe: '15m', confidence: 0.8, direction: allAbove ? 'UP' : 'DOWN', details: `Aceitação rápida (3×15m ${allAbove ? 'acima' : 'abaixo'} do range)` };
                    }
                    const aboveCount = closes.filter(c => c > high).length;
                    const belowCount = closes.filter(c => c < low).length;
                    if (aboveCount >= 2 || belowCount >= 2) {
                        return { accepted: true, timeframe: '15m', confidence: 0.6, direction: aboveCount >= 2 ? 'UP' : 'DOWN', details: `Aceitação parcial (${Math.max(aboveCount, belowCount)}/3×15m fora)` };
                    }
                }
            }
        } catch (e) {}
        return { accepted: false, timeframe: null, confidence: 0, details: 'Sem aceitação detectada' };
    }

    // ═══════════════════════════════════════════════════════════════
    // MODULE 14: REGIME-ADAPTIVE CONFIRMATION GATE
    // ═══════════════════════════════════════════════════════════════
    /**
     * The heart of V4.1. Gates are the same, but REQUIREMENTS ADAPT:
     *
     * BULL TREND + LONG:  Only 4 gates needed (with the trend)
     * BULL TREND + SHORT: 6 gates needed (counter-trend is harder)
     * RANGING:            6 gates both ways (range is dangerous)
     * BEAR TREND + SHORT: 4 gates needed
     * BEAR TREND + LONG:  6 gates needed
     *
     * Plus: Session multiplier applied to gateScore
     * Plus: Microstructure bonus/penalty on confidence
     */
    function evaluateReactiveGates(params) {
        const {
            v3Signal, v3Confidence, v3Score,
            displacement1h, displacement4h,
            volumeExpansion1h, volumeExpansion4h,
            rangePosition, retest, fundingFilter,
            bosValidation, crashState, enhancedRegime, cvdAdvanced,
            sessionContext, microstructure,
            oiAnalysis, antiSpoof
        } = params;

        // Derive direction from V3 signal, or fallback to V3 compressedScore direction
        let intendedDirection = v3Signal === 'LONG' ? 'LONG' : v3Signal === 'SHORT' ? 'SHORT' : null;
        
        // If V3 was NEUTRO but the V3 compressedScore has a lean, use it as direction
        if (!intendedDirection && v3Score && v3Score.compressedScore) {
            if (v3Score.compressedScore > 0.5) intendedDirection = 'LONG';
            else if (v3Score.compressedScore < -0.5) intendedDirection = 'SHORT';
        }
        // Fallback: check rawScore
        if (!intendedDirection && v3Score && v3Score.rawScore) {
            if (v3Score.rawScore > 0.5) intendedDirection = 'LONG';
            else if (v3Score.rawScore < -0.5) intendedDirection = 'SHORT';
        }
        // Last resort: use displacement direction from V4 modules
        if (!intendedDirection && displacement?.detected) {
            intendedDirection = displacement.direction === 'UP' ? 'LONG' : displacement.direction === 'DOWN' ? 'SHORT' : null;
        }

        // ─── GATE EVALUATION (9 core gates, v7.2: BOS contínuo + acceptance rápida) ───
        const bosScore = scoreBosGate(bosValidation);
        const acceptanceResult = detectAcceptance(rangePosition, params.rawData);

        const gates = {
            bosConfirmed: {
                name: 'BOS Confirmado',
                passed: bosScore.score >= 0.5,  // v7.2: WEAK_BOS now passes (score 0.5+)
                bosScore: bosScore.score,        // continuous 0-1 for soft adjustments
                weight: 2.0,
                description: bosScore.score >= 1.0
                    ? '✅ Break of Structure confirmado (volume + close + CVD)'
                    : bosScore.score >= 0.5
                        ? '⚡ BOS fraco detectado — conta parcialmente'
                        : bosValidation?.bosType === 'FAKE_SWEEP'
                            ? '❌ BOS = FAKE SWEEP (caça de liquidez)'
                            : '⚠️ BOS não confirmado'
            },
            displacement: {
                name: 'Displacement Z-Score',
                passed: (displacement1h?.detected && displacement1h?.direction === intendedDirection) ||
                        (displacement4h?.detected && displacement4h?.direction === intendedDirection),
                weight: 2.0,
                description: displacement1h?.detected || displacement4h?.detected
                    ? `✅ Displacement z=${(displacement1h?.bodyZScore || displacement4h?.bodyZScore || 0).toFixed(1)} (${displacement1h?.detected ? '1h' : '4h'})`
                    : '❌ Sem displacement — candles no desvio padrão normal'
            },
            volumeExpansion: {
                name: 'Volume Z-Score',
                passed: (volumeExpansion1h?.expanding && volumeExpansion1h?.sustained) || (volumeExpansion4h?.expanding),
                weight: 1.5,
                description: volumeExpansion1h?.expanding || volumeExpansion4h?.expanding
                    ? `✅ Volume z=${(volumeExpansion1h?.zScore || volumeExpansion4h?.zScore || 0).toFixed(1)} (${volumeExpansion1h?.sustained ? 'sustentado' : 'pontual'})`
                    : '❌ Volume dentro do normal estatístico'
            },
            cvdConfirms: (() => {
                // Real CVD via WebSocket (preferido) ou fallback para kline-based
                const realCvd = window.RealtimeCVD ? window.RealtimeCVD.getFullCVDAnalysis(symbol) : null;
                const useRealCvd = realCvd && realCvd.available && realCvd.overallConfidence >= 30;
                
                const cvdPassed = useRealCvd
                    ? (intendedDirection === 'LONG' && realCvd.overallTrend === 'up') ||
                      (intendedDirection === 'SHORT' && realCvd.overallTrend === 'down')
                    : cvdAdvanced && (
                        (intendedDirection === 'LONG' && (cvdAdvanced.delta > 0 || cvdAdvanced.signal === 'bullish')) ||
                        (intendedDirection === 'SHORT' && (cvdAdvanced.delta < 0 || cvdAdvanced.signal === 'bearish'))
                    );
                
                const cvdSource = useRealCvd ? 'WebSocket' : 'kline';
                const cvdDelta = useRealCvd ? realCvd.windows['5m']?.delta : cvdAdvanced?.delta;
                const cvdDiv = useRealCvd ? realCvd.divergence : null;
                const icebergs = useRealCvd ? realCvd.icebergs : [];
                
                return {
                    name: 'CVD Confirma',
                    passed: cvdPassed,
                    cvdSource,
                    realCvdData: useRealCvd ? realCvd : null,
                    divergence: cvdDiv,
                    icebergs,
                    weight: 1.5,
                    description: useRealCvd
                        ? `${cvdPassed ? '✅' : '❌'} CVD Real (${cvdSource}) delta=${(cvdDelta||0).toFixed ? (cvdDelta||0).toFixed(0) : '?'}${cvdDiv ? ' [' + cvdDiv.type + ']' : ''}${icebergs.length > 0 ? ' (' + icebergs.length + ' icebergs)' : ''}`
                        : cvdAdvanced
                            ? `${(intendedDirection === 'LONG' && cvdAdvanced?.delta > 0) || (intendedDirection === 'SHORT' && cvdAdvanced?.delta < 0) ? '✅' : '❌'} CVD (kline) ${cvdAdvanced?.delta > 0 ? '+' : ''}${cvdAdvanced?.delta?.toFixed ? cvdAdvanced.delta.toFixed(0) : '?'}`
                            : '⚠️ CVD indisponível'
                };
            })(),
            outsideRange: {
                name: 'Fora do Range',
                passed: rangePosition?.tradeable === true,
                weight: 2.0,
                description: rangePosition?.tradeable
                    ? `✅ ${rangePosition.details}`
                    : `❌ ${rangePosition?.details || 'Mid-range'}`
            },
            fundingOk: {
                name: 'Funding OK',
                passed: !fundingFilter?.blocked,
                weight: 1.0,
                description: fundingFilter?.blocked
                    ? `❌ ${fundingFilter.reason}`
                    : `✅ ${fundingFilter?.reason || 'Funding neutro'}`
            },
            acceptance: {
                name: 'Aceitação Breakout',
                passed: acceptanceResult.accepted,
                acceptanceConfidence: acceptanceResult.confidence,
                acceptanceTimeframe: acceptanceResult.timeframe,
                weight: 1.5,
                description: acceptanceResult.accepted
                    ? `✅ ${acceptanceResult.details}`
                    : '❌ Sem aceitação (candle não fechou fora)'
            },
            oiConfirms: {
                name: 'OI Confirma',
                passed: oiAnalysis?.confirmsDirection === true,
                weight: 1.5,
                description: oiAnalysis?.available
                    ? oiAnalysis.confirmsDirection
                        ? `✅ ${oiAnalysis.description}`
                        : `❌ ${oiAnalysis.description}`
                    : '⚠️ OI indisponível'
            },
            antiSpoofOk: {
                name: 'Anti-Spoof OK',
                passed: !antiSpoof?.detected,
                weight: 1.0,
                description: antiSpoof?.detected
                    ? `❌ ${antiSpoof.details}`
                    : `✅ ${antiSpoof?.details || 'Sem manipulação detectada'}`
            }
        };

        // ─── SCORE CALCULATION (with regime-adaptive weights + redundancy penalization) ───
        let passedCount = 0, totalWeight = 0, passedWeight = 0;
        const gateResults = [];

        // Get regime-adaptive weights
        const regimeKey = enhancedRegime?.regime || 'DEFAULT';
        const regimeForWeights = regimeKey === 'TREND_UP' ? 'BULL_TREND'
            : regimeKey === 'EXPANSION_UP' ? 'STRONG_BULL'
            : regimeKey === 'TREND_DOWN' ? 'BEAR_TREND'
            : regimeKey === 'EXPANSION_DOWN' ? 'STRONG_BEAR'
            : regimeKey === 'RANGE' || regimeKey === 'RANGING' ? 'RANGING'
            : regimeKey === 'HIGH_VOL' || regimeKey.includes('VOLATILE') ? 'VOLATILE'
            : regimeKey === 'COMPRESSION' || regimeKey.includes('ACCUM') ? 'ACCUMULATION'
            : regimeKey.includes('BULL') ? (regimeKey.includes('STRONG') ? 'STRONG_BULL' : 'BULL_TREND')
            : regimeKey.includes('BEAR') ? (regimeKey.includes('STRONG') ? 'STRONG_BEAR' : 'BEAR_TREND')
            : null;
        let dynamicWeights = getGateWeightsForRegime(regimeForWeights);

        // Build gate passed/failed map for redundancy check
        const gatePassed = {};
        Object.entries(gates).forEach(([key, gate]) => { gatePassed[key] = gate.passed; });

        // Apply redundancy penalization
        dynamicWeights = applyRedundancyPenalty(gatePassed, dynamicWeights);

        Object.entries(gates).forEach(([key, gate]) => {
            const w = dynamicWeights[key] || gate.weight;
            gate.weight = w; // update gate with dynamic weight
            totalWeight += w;
            if (gate.passed) { passedCount++; passedWeight += w; }
            gateResults.push({ key, ...gate });
        });

        let gateScore = totalWeight > 0 ? (passedWeight / totalWeight) * 100 : 0;

        // ─── SESSION CONTEXT (v7.2: removed from gateScore — moved to soft adjustments) ───
        // Session influence is now applied via the centralized soft-adjustment system
        // in enhanceWithReactive, keeping gateScore purely gate-based.

        // ─── REGIME-ADAPTIVE REQUIREMENTS ───
        const regimeConfig = REGIME_GATES[regimeKey] || REGIME_GATES.DEFAULT;

        // Determine if we're trading WITH or AGAINST the trend
        let isWithTrend = true;
        const isBullRegime = regimeKey === 'TREND_UP' || regimeKey === 'EXPANSION_UP' || regimeKey.includes('BULL');
        const isBearRegime = regimeKey === 'TREND_DOWN' || regimeKey === 'EXPANSION_DOWN' || regimeKey.includes('BEAR');
        if (isBullRegime && intendedDirection === 'SHORT') isWithTrend = false;
        if (isBearRegime && intendedDirection === 'LONG') isWithTrend = false;

        const requirements = isWithTrend ? regimeConfig.withTrend : regimeConfig.counterTrend;
        const minGates = requirements.gates;
        const minScore = requirements.score;

        // ─── SIGNAL DETERMINATION ───
        let v4Signal, v4SignalType, v4Confidence, v4Probability;
        let actionMessage, actionIcon;

        // Crash override
        if (crashState?.isCrash && crashState.severity !== 'NONE' && crashState.severity !== 'MINOR') {
            v4Signal = 'NEUTRO';
            v4SignalType = 'aguardar';
            v4Confidence = 15;
            v4Probability = 50;
            actionMessage = `⛔ ${crashState.direction === 'down' ? 'CRASH' : 'PUMP'} (${crashState.severity}). NÃO OPERAR.`;
            actionIcon = '🚨';
        }
        // No direction at all (even after fallbacks)
        else if (!intendedDirection) {
            v4Signal = 'NEUTRO';
            v4SignalType = 'aguardar';
            v4Confidence = v3Confidence || 20;
            v4Probability = 50;
            actionMessage = 'Sem viés direcional claro. Aguardar.';
            actionIcon = '⏸️';
        }
        // Weekend cap: max AGUARDAR
        else if (sessionContext?.isWeekend) {
            v4Signal = 'AGUARDAR_' + intendedDirection;
            v4SignalType = 'aguardar';
            v4Confidence = clamp(Math.round(gateScore * 0.5), 10, 45);
            v4Probability = clamp(Math.round(50 + (gateScore - 50) * 0.3), 30, 60);
            actionMessage = `🌙 Weekend: liquidez muito baixa. Máximo = AGUARDAR. ${passedCount}/${Object.keys(gates).length} gates.`;
            actionIcon = '🔶';
        }
        // CONFIRMED: meets regime-adaptive requirements + requires at least 1 active gate
        else if (passedCount >= minGates && gateScore >= minScore) {
            // Quality gate: at least 1 "active" gate (BOS, Displacement, or Volume) must pass
            // Passive gates (funding, anti-spoof) alone are insufficient for a CONFIRMED signal
            const hasActiveGate = gates.bosConfirmed.passed || gates.displacement.passed || gates.volumeExpansion.passed;
            const hasFlowConfluence = gates.cvdConfirms.passed && gates.oiConfirms.passed;
            const hasStrongConfluence = passedCount >= 6;

            if (hasActiveGate || hasFlowConfluence || hasStrongConfluence) {
                v4Signal = intendedDirection + '_CONFIRMED';
                v4SignalType = intendedDirection.toLowerCase();
                v4Confidence = clamp(Math.round(gateScore * 0.85 + v3Confidence * 0.15), 40, 100);
                v4Probability = clamp(Math.round(50 + (gateScore - 50) * 0.8), 30, 100);

                const retestBonus = retest?.retested ? ' + reteste' : '';
                const sessionInfo = sessionContext?.isKillZone ? ' [KILL ZONE]' : '';
                const confirmType = hasActiveGate ? 'estrutural' : hasFlowConfluence ? 'flow confluence' : 'multi-gate';
                actionMessage = `🎯 ${intendedDirection} CONFIRMADO (${confirmType}) — ${passedCount}/${Object.keys(gates).length} gates (${gateScore.toFixed(0)}%, regime: ${regimeKey} requer ${minGates})${retestBonus}${sessionInfo}`;
                actionIcon = intendedDirection === 'LONG' ? '🟢' : '🔴';
            } else {
                // Downgrade to AGUARDAR — gates passed but no active confirmation
                v4Signal = 'AGUARDAR_' + intendedDirection;
                v4SignalType = 'aguardar';
                v4Confidence = clamp(Math.round(gateScore * 0.65), 15, 50);
                v4Probability = clamp(Math.round(50 + (gateScore - 50) * 0.35), 30, 65);
                actionMessage = `⏳ ${passedCount}/${Object.keys(gates).length} gates ok, mas sem confirmação ativa (BOS/Displacement/Volume ou CVD+OI). Aguardar.`;
                actionIcon = '🔶';
            }
        }
        // AGUARDAR
        else if (passedCount >= MIN_CONFIRMATIONS_AGUARDAR && intendedDirection) {
            v4Signal = 'AGUARDAR_' + intendedDirection;
            v4SignalType = 'aguardar';
            v4Confidence = clamp(Math.round(gateScore * 0.7), 15, 55);
            v4Probability = clamp(Math.round(50 + (gateScore - 50) * 0.4), 30, 70);

            const missing = gateResults.filter(g => !g.passed).map(g => g.name);
            actionMessage = `⏳ Estrutura ${intendedDirection} formando (${passedCount}/${Object.keys(gates).length}, precisa de ${minGates} para ${regimeKey}). Falta: ${missing.slice(0, 3).join(', ')}`;
            actionIcon = '🔶';
        }
        // Fallback — insufficient gates
        else {
            v4Signal = intendedDirection ? 'AGUARDAR_' + intendedDirection : 'NEUTRO';
            v4SignalType = 'aguardar';
            v4Confidence = clamp(Math.round(gateScore * 0.5), 10, 35);
            v4Probability = 50;
            actionMessage = `Apenas ${passedCount}/${Object.keys(gates).length} gates. Regime ${regimeKey} requer ${minGates}. Aguardar confirmações.`;
            actionIcon = '⏸️';
        }

        // ─── RETEST CONFIDENCE BOOST ───
        if (retest?.retested && v4Signal.includes('CONFIRMED')) {
            v4Confidence = clamp(v4Confidence + 8, 40, 100);
            if (retest.retestQuality === 'STRONG') v4Confidence = clamp(v4Confidence + 5, 40, 100);
        }

        // ─── MICROSTRUCTURE BONUS/PENALTY ───
        if (microstructure) {
            v4Confidence = clamp(v4Confidence + microstructure.score, 10, 100);
        }

        // ─── SESSION PENALTY FOR DEAD ZONES ───
        if (sessionContext?.isDeadZone && v4Signal.includes('CONFIRMED')) {
            v4Confidence = clamp(v4Confidence - 10, 10, 100);
            if (v4Confidence < 45) {
                v4Signal = 'AGUARDAR_' + intendedDirection;
                v4SignalType = 'aguardar';
                actionMessage += '\n💤 Sessão de baixa liquidez — rebaixado para AGUARDAR.';
            }
        }

        // ─── FALSE BREAKOUT RISK ───
        if (enhancedRegime?.falseBreakoutRisk === 'HIGH') {
            v4Confidence = clamp(v4Confidence - 15, 10, 100);
            if (v4Signal.includes('CONFIRMED') && v4Confidence < 45) {
                v4Signal = 'AGUARDAR_' + intendedDirection;
                v4SignalType = 'aguardar';
                actionMessage += '\n⚠️ Alto risco de falso breakout — AGUARDAR.';
            }
        }

        // ─── LOGISTIC CALIBRATION ───
        // Replace heuristic confidence with sigmoid-calibrated probability
        const regimeQuality = (enhancedRegime?.regimeStrength || 0.5) * 100;
        const satVal = params.saturation?.saturationPercent || 50;
        const btcAlignedVal = params.btcCorrelation?.aligned !== false;
        const sessWeight = sessionContext?.signalMultiplier || 1.0;
        const calibratedConfidence = calibrateConfidence(gateScore, regimeQuality, satVal, btcAlignedVal, sessWeight);

        // Use the higher of heuristic vs calibrated, but cap at 95
        // This prevents calibration from being too aggressive while we lack training data
        const finalConfidence = clamp(Math.round((v4Confidence * 0.6) + (calibratedConfidence * 0.4)), 10, 100);
        v4Confidence = finalConfidence;

        // ─── AGUARDAR CONFIDENCE HARD CAP ───
        // AGUARDAR signals must NEVER have 70%+ confidence — that would be a CONFIRMED signal.
        // If post-processing (calibration, microstructure) pushed confidence ≥ 70 for an AGUARDAR,
        // promote it to CONFIRMED (with direction) instead.
        if (v4SignalType === 'aguardar' && intendedDirection && v4Confidence >= 70) {
            v4Signal = intendedDirection + '_CONFIRMED';
            v4SignalType = intendedDirection.toLowerCase();
            actionMessage = `🎯 ${intendedDirection} CONFIRMADO — confiança alta (${v4Confidence}%) promoveu sinal. ${passedCount}/${Object.keys(gates).length} gates.`;
            actionIcon = intendedDirection === 'LONG' ? '🟢' : '🔴';
        } else if (v4SignalType === 'aguardar' && v4Confidence > 65) {
            // Hard cap AGUARDAR at 65% max
            v4Confidence = 65;
        }

        // ─── ENTRY vs TIMING separation (V7: Full EntryScore + ContinuationScore) ──
        // Engine A (Entry): Probability of immediate reaction from this level
        const entryGates = ['bosConfirmed', 'displacement', 'volumeExpansion', 'outsideRange', 'acceptance'];
        // Engine B (Continuation): Probability of expansion beyond 1R
        const continuationGates = ['oiConfirms', 'cvdConfirms', 'fundingOk', 'antiSpoofOk'];

        const entryPassed = gateResults.filter(g => entryGates.includes(g.key) && g.passed);
        const contPassed = gateResults.filter(g => continuationGates.includes(g.key) && g.passed);
        const entryWeight = entryPassed.reduce((s, g) => s + (dynamicWeights[g.key] || g.weight), 0);
        const entryTotalWeight = entryGates.reduce((s, k) => s + (dynamicWeights[k] || (gates[k]?.weight || 1.5)), 0);
        const contWeight = contPassed.reduce((s, g) => s + (dynamicWeights[g.key] || g.weight), 0);
        const contTotalWeight = continuationGates.reduce((s, k) => s + (dynamicWeights[k] || (gates[k]?.weight || 1.0)), 0);

        const entryScore = entryTotalWeight > 0 ? Math.round((entryWeight / entryTotalWeight) * 100) : 0;
        const continuationScore = contTotalWeight > 0 ? Math.round((contWeight / contTotalWeight) * 100) : 0;

        // Structural = entry gates, Timing = continuation gates (backward compat)
        const structurePct = entryScore;
        const timingPct = continuationScore;

        // Dynamic R:R suggestion based on score combination
        let suggestedRR = '1:2';
        let timingAdvice = null;
        if (entryScore >= 80 && continuationScore >= 75) {
            suggestedRR = '1:3';
            timingAdvice = `🎯 Entry forte (${entryScore}%) + continuação forte (${continuationScore}%) → R:R agressivo 1:3 viável.`;
        } else if (entryScore >= 70 && continuationScore < 50) {
            suggestedRR = '1:1.5';
            timingAdvice = `⏰ Entry bom (${entryScore}%) mas continuação fraca (${continuationScore}%) → R:R conservador 1:1.5 e TP parcial no 1R.`;
        } else if (entryScore < 50 && continuationScore >= 70) {
            suggestedRR = 'WAIT';
            timingAdvice = `⚠️ Continuação promissora (${continuationScore}%) mas entry fraco (${entryScore}%) → Aguardar pullback para entry melhor.`;
        } else if (entryScore < 40) {
            timingAdvice = `❌ Entry insuficiente (${entryScore}%) — sem estrutura para operar.`;
        }

        return {
            v4Signal, v4SignalType, v4Confidence, v4Probability,
            calibratedConfidence,
            actionMessage, actionIcon,
            gateScore: +gateScore.toFixed(1),
            passedCount, totalGates: Object.keys(gates).length,
            gates: gateResults,
            intendedDirection,
            regimeKey,
            minGatesRequired: minGates,
            minScoreRequired: minScore,
            isWithTrend,
            isCounterTrend: !isWithTrend,
            retest,
            structureScore: structurePct,
            timingScore: timingPct,
            entryScore,
            continuationScore,
            suggestedRR,
            timingAdvice,
            reasoning: gateResults.map(g => `${g.passed ? '✅' : '❌'} [${g.weight.toFixed(1)}] ${g.name}: ${g.description}`).join('\n')
        };
    }

    // ═══════════════════════════════════════════════════════════════
    // MODULE 11: RISK ENGINE
    // ═══════════════════════════════════════════════════════════════
    /**
     * Quem quebra conta não é sinal ruim. É sizing errado.
     *
     * Position sizing adaptativo por volatilidade
     * Kill switch após sequência de perdas
     * Stop dinâmico baseado em estrutura
     * Drawdown control
     */
    function calculateRisk(params) {
        const { currentPrice, limitOrder, atr, symbol } = params;

        // Load risk state from localStorage
        let riskState = safeGet(RISK_STATE_KEY) || {
            consecutiveLosses: 0,
            dailyPnl: 0,
            weeklyPnl: 0,
            lastResetDay: new Date().toDateString(),
            lastResetWeek: getWeekNumber(),
            totalTrades: 0,
            paused: false,
            pauseUntil: 0
        };

        // Reset daily/weekly counters if needed
        const today = new Date().toDateString();
        const thisWeek = getWeekNumber();
        if (riskState.lastResetDay !== today) {
            riskState.dailyPnl = 0;
            riskState.lastResetDay = today;
        }
        if (riskState.lastResetWeek !== thisWeek) {
            riskState.weeklyPnl = 0;
            riskState.lastResetWeek = thisWeek;
        }

        // Check kill switch
        let killSwitch = false;
        let killReason = null;

        if (riskState.paused && Date.now() < riskState.pauseUntil) {
            killSwitch = true;
            const remaining = Math.ceil((riskState.pauseUntil - Date.now()) / (60 * 1000));
            killReason = `Kill switch ativo: ${remaining}min restantes (${riskState.consecutiveLosses} perdas consecutivas)`;
        } else if (riskState.consecutiveLosses >= KILL_SWITCH_CONSECUTIVE) {
            killSwitch = true;
            riskState.paused = true;
            riskState.pauseUntil = Date.now() + KILL_SWITCH_PAUSE_HOURS * 60 * 60 * 1000;
            killReason = `Kill switch ativado: ${riskState.consecutiveLosses} perdas consecutivas. Pausa de ${KILL_SWITCH_PAUSE_HOURS}h.`;
        } else if (riskState.dailyPnl <= -MAX_DAILY_DRAWDOWN) {
            killSwitch = true;
            killReason = `Drawdown diário ${riskState.dailyPnl.toFixed(1)}% atingiu limite de -${MAX_DAILY_DRAWDOWN}%. STOP.`;
        }

        // Size multiplier based on edge state
        let sizeMultiplier = 1.0;
        if (riskState.weeklyPnl <= -MAX_WEEKLY_DRAWDOWN) {
            sizeMultiplier = 0.5;
        }
        if (riskState.consecutiveLosses >= 2) {
            sizeMultiplier *= 0.7; // reduce after 2 losses
        }

        // Position sizing
        const atrValue = atr || currentPrice * 0.015;
        const riskPerTrade = DEFAULT_RISK_PERCENT * sizeMultiplier;

        let stopDistance, suggestedStop;
        if (limitOrder && limitOrder.stopLoss) {
            stopDistance = Math.abs(limitOrder.entry - limitOrder.stopLoss);
            suggestedStop = limitOrder.stopLoss;
        } else {
            stopDistance = atrValue * 1.5;
            suggestedStop = limitOrder?.direction === 'LONG'
                ? currentPrice - stopDistance
                : currentPrice + stopDistance;
        }

        const riskPercent = currentPrice > 0 ? (stopDistance / currentPrice) * 100 : 2;
        const leverageSuggested = riskPerTrade / riskPercent;

        safeSet(RISK_STATE_KEY, riskState);

        return {
            riskPerTrade: +riskPerTrade.toFixed(2),
            sizeMultiplier: +sizeMultiplier.toFixed(2),
            suggestedStop: +suggestedStop.toFixed(2),
            stopDistance: +stopDistance.toFixed(2),
            stopPercent: +riskPercent.toFixed(2),
            leverageSuggested: +clamp(leverageSuggested, 1, 20).toFixed(1),
            killSwitch,
            killReason,
            consecutiveLosses: riskState.consecutiveLosses,
            dailyPnl: +riskState.dailyPnl.toFixed(2),
            weeklyPnl: +riskState.weeklyPnl.toFixed(2),
            details: killSwitch
                ? `🛑 ${killReason}`
                : `Risk: ${riskPerTrade.toFixed(1)}%/trade, Stop: $${suggestedStop.toFixed(0)} (${riskPercent.toFixed(1)}%), Lev: ${clamp(leverageSuggested, 1, 20).toFixed(1)}×${sizeMultiplier < 1 ? ` [size ${(sizeMultiplier * 100).toFixed(0)}%]` : ''}`
        };
    }

    function updateRiskState(outcome, pnlPercent) {
        const state = safeGet(RISK_STATE_KEY) || {
            consecutiveLosses: 0, dailyPnl: 0, weeklyPnl: 0,
            lastResetDay: new Date().toDateString(),
            lastResetWeek: getWeekNumber(), totalTrades: 0,
            paused: false, pauseUntil: 0
        };

        state.totalTrades++;
        state.dailyPnl += pnlPercent;
        state.weeklyPnl += pnlPercent;

        if (outcome === 'WIN') {
            state.consecutiveLosses = 0;
            if (state.paused && Date.now() >= state.pauseUntil) {
                state.paused = false;
            }
        } else if (outcome === 'LOSS') {
            state.consecutiveLosses++;
        }

        safeSet(RISK_STATE_KEY, state);
    }

    function getWeekNumber() {
        const d = new Date();
        const start = new Date(d.getFullYear(), 0, 1);
        return Math.ceil((((d - start) / 86400000) + start.getDay() + 1) / 7);
    }

    // ═══════════════════════════════════════════════════════════════
    // MODULE 12: MODEL STABILITY MONITOR
    // ═══════════════════════════════════════════════════════════════
    /**
     * Prevents overfitting and detects edge degradation.
     *
     * Tracks rolling 20-signal performance:
     *  - WR < 40% → reduce confidence by 15%
     *  - WR < 30% → force ALL signals to AGUARDAR
     *
     * Also applies temporal weight decay:
     * Signals from 14+ days ago worth 50% less in performance calc.
     */
    function checkModelStability(symbol) {
        const key = STABILITY_KEY + symbol;
        const stats = safeGet(REACTIVE_STATS_KEY + symbol);
        if (!stats || !stats.signals) return { stable: true, rollingWR: null, action: 'NONE', confidenceAdjust: 0, details: 'Dados insuficientes' };

        // Get signals with outcomes, apply temporal decay
        const withOutcomes = stats.signals.filter(s => s.outcome != null);

        // v7.2: Cold start guard — with fewer than 8 evaluated signals, assume stable
        // Prevents premature FORCE_AGUARDAR from a couple of random losses
        if (withOutcomes.length < 8) {
            return {
                stable: true, rollingWR: null, action: 'NONE', confidenceAdjust: 0,
                coldStart: true, signalsEvaluated: withOutcomes.length,
                details: `Cold start: ${withOutcomes.length}/8 sinais — estabilidade presumida.`
            };
        }

        if (withOutcomes.length < STABILITY_WINDOW) {
            return { stable: true, rollingWR: null, action: 'NONE', confidenceAdjust: 0, details: `Apenas ${withOutcomes.length}/${STABILITY_WINDOW} sinais avaliados` };
        }

        // Rolling window with temporal decay
        const recent = withOutcomes.slice(-STABILITY_WINDOW);
        let weightedWins = 0, totalWeight = 0;

        recent.forEach(s => {
            const ageDays = (Date.now() - s.timestamp) / (24 * 60 * 60 * 1000);
            const decayWeight = Math.pow(0.5, ageDays / WEIGHT_DECAY_HALFLIFE);
            totalWeight += decayWeight;
            if (s.outcome === 'WIN') weightedWins += decayWeight;
        });

        const rollingWR = totalWeight > 0 ? (weightedWins / totalWeight) * 100 : 50;

        // Compare with previous window for trend
        let edgeTrend = 'STABLE';
        if (withOutcomes.length >= STABILITY_WINDOW * 2) {
            const previous = withOutcomes.slice(-(STABILITY_WINDOW * 2), -STABILITY_WINDOW);
            const prevWins = previous.filter(s => s.outcome === 'WIN').length;
            const prevWR = (prevWins / previous.length) * 100;
            const diff = rollingWR - prevWR;

            if (diff < -10) edgeTrend = 'DEGRADING';
            else if (diff > 5) edgeTrend = 'IMPROVING';
        }

        // Determine action
        let action = 'NONE';
        let confidenceAdjust = 0;

        if (rollingWR < STABILITY_CRITICAL_WR) {
            action = 'FORCE_AGUARDAR';
            confidenceAdjust = -25;
        } else if (rollingWR < STABILITY_DEGRADE_WR) {
            action = 'REDUCE_CONFIDENCE';
            confidenceAdjust = -15;
        } else if (edgeTrend === 'DEGRADING') {
            action = 'WARN';
            confidenceAdjust = -8;
        }

        const result = {
            stable: action === 'NONE',
            rollingWR: +rollingWR.toFixed(1),
            edgeTrend,
            action,
            confidenceAdjust,
            windowSize: STABILITY_WINDOW,
            signalsEvaluated: withOutcomes.length,
            details: action === 'FORCE_AGUARDAR'
                ? `🚨 Edge crítico: WR ${rollingWR.toFixed(0)}% (últimos ${STABILITY_WINDOW}). TODOS sinais → AGUARDAR.`
                : action === 'REDUCE_CONFIDENCE'
                    ? `⚠️ Edge degradando: WR ${rollingWR.toFixed(0)}% (últimos ${STABILITY_WINDOW}). Confiança -15%.`
                    : edgeTrend === 'DEGRADING'
                        ? `📉 Tendência de queda: edge degradando. Monitorar.`
                        : `✅ Modelo estável: WR ${rollingWR.toFixed(0)}% (${edgeTrend})`
        };

        safeSet(key, result);
        return result;
    }

    // ═══════════════════════════════════════════════════════════════
    // MODULE 13: REACTIVE PERFORMANCE TRACKER
    // ═══════════════════════════════════════════════════════════════
    function trackReactiveSignal(symbol, v4Result, v3Analysis) {
        const key = REACTIVE_STATS_KEY + symbol;
        let stats = safeGet(key) || { signals: [], created: Date.now() };

        if (v4Result.v4Signal === 'NEUTRO') return;
        const last = stats.signals[stats.signals.length - 1];
        if (last && Date.now() - last.timestamp < 30 * 60 * 1000) return;

        stats.signals.push({
            timestamp: Date.now(),
            signal: v4Result.v4Signal,
            signalType: v4Result.v4SignalType,
            confidence: v4Result.v4Confidence,
            gateScore: v4Result.gateScore,
            passedGates: v4Result.passedCount,
            isConfirmed: v4Result.v4Signal.includes('CONFIRMED'),
            isAguardar: v4Result.v4Signal.includes('AGUARDAR'),
            entryPrice: v3Analysis.entry || v3Analysis.currentPrice,
            v3Signal: v3Analysis.v3Signal,
            v3Confidence: v3Analysis.v3Confidence,
            regime: v4Result.regimeKey,
            session: v4Result.sessionKey || 'UNKNOWN',
            outcome: null
        });

        if (stats.signals.length > 500) stats.signals = stats.signals.slice(-500);
        safeSet(key, stats);
    }

    function evaluateReactiveSignals(symbol, currentPrice) {
        const key = REACTIVE_STATS_KEY + symbol;
        const stats = safeGet(key);
        if (!stats || !stats.signals.length) return null;

        let updated = false;
        stats.signals.forEach(s => {
            if (s.outcome !== null) return;
            if (Date.now() - s.timestamp < 60 * 60 * 1000) return;

            const dir = s.signal.includes('LONG') ? 1 : s.signal.includes('SHORT') ? -1 : 0;
            if (dir === 0) return;

            const pnl = dir * ((currentPrice - s.entryPrice) / s.entryPrice) * 100;

            if (Date.now() - s.timestamp > 24 * 60 * 60 * 1000 || Math.abs(pnl) > 3) {
                s.outcome = pnl > 0.5 ? 'WIN' : pnl < -1 ? 'LOSS' : 'BREAKEVEN';
                s.exitPrice = currentPrice;
                s.pnlPercent = +pnl.toFixed(2);
                updated = true;

                // Update risk state
                if (s.outcome !== 'BREAKEVEN') {
                    updateRiskState(s.outcome, s.pnlPercent);
                }
            }
        });

        if (updated) safeSet(key, stats);

        const confirmed = stats.signals.filter(s => s.isConfirmed && s.outcome);
        const aguardar = stats.signals.filter(s => s.isAguardar && s.outcome);

        const calcStats = (arr) => {
            if (!arr.length) return { count: 0, winRate: 0, avgPnl: 0, profitFactor: 0 };
            const wins = arr.filter(s => s.outcome === 'WIN');
            const losses = arr.filter(s => s.outcome === 'LOSS');
            const winPnl = wins.reduce((s, t) => s + Math.abs(t.pnlPercent || 0), 0);
            const lossPnl = losses.reduce((s, t) => s + Math.abs(t.pnlPercent || 0), 0);
            return {
                count: arr.length,
                winRate: +(wins.length / arr.length * 100).toFixed(1),
                avgPnl: +mean(arr.map(t => t.pnlPercent || 0)).toFixed(2),
                profitFactor: lossPnl > 0 ? +(winPnl / lossPnl).toFixed(2) : winPnl > 0 ? 999 : 0
            };
        };

        // ─── Regime-specific performance ───
        const byRegime = {};
        const allWithOutcome = stats.signals.filter(s => s.outcome);
        const regimes = [...new Set(allWithOutcome.map(s => s.regime).filter(Boolean))];
        regimes.forEach(r => {
            const regSignals = allWithOutcome.filter(s => s.regime === r);
            if (regSignals.length >= 3) byRegime[r] = calcStats(regSignals);
        });

        // ─── Session performance ───
        const bySession = {};
        const sessions = [...new Set(allWithOutcome.map(s => s.session).filter(Boolean))];
        sessions.forEach(sess => {
            const sessSignals = allWithOutcome.filter(s => s.session === sess);
            if (sessSignals.length >= 3) bySession[sess] = calcStats(sessSignals);
        });

        return {
            confirmed: calcStats(confirmed),
            aguardar: calcStats(aguardar),
            total: calcStats([...confirmed, ...aguardar]),
            byRegime,
            bySession,
            advantage: confirmed.length >= 5 && aguardar.length >= 5
                ? +(calcStats(confirmed).winRate - calcStats(aguardar).winRate).toFixed(1)
                : null
        };
    }

    // ═══════════════════════════════════════════════════════════════
    // MODULE 14: COLLECTIVE LEARNING CLIENT (REPUTATION-WEIGHTED)
    // ═══════════════════════════════════════════════════════════════
    /**
     * V4.0: All users equal weight → learns from losers.
     * V4.1: Reputation scoring. Device with 65% WR weighs 10× more
     *        than device with 30% WR. Algorithm learns from Smart Money.
     *
     * Device hash is anonymous but persistent — backend builds
     * reputation profile without knowing who you are.
     */
    function queueTradeForBackend(symbol, v4Result, v3Analysis) {
        const queue = safeGet(COLLECTIVE_QUEUE_KEY) || [];
        const deviceHash = getDeviceHash();

        // Calculate local reputation score from reactive stats
        const stats = safeGet(REACTIVE_STATS_KEY + symbol);
        let localWinRate = 50;
        let localTradeCount = 0;
        if (stats && stats.signals) {
            const withOutcome = stats.signals.filter(s => s.outcome);
            localTradeCount = withOutcome.length;
            if (localTradeCount >= 5) {
                const wins = withOutcome.filter(s => s.outcome === 'WIN').length;
                localWinRate = (wins / localTradeCount) * 100;
            }
        }

        queue.push({
            ts: Date.now(),
            sym: symbol,
            sig: v4Result.v4Signal,
            conf: v4Result.v4Confidence,
            gs: v4Result.gateScore,
            gates: v4Result.passedCount,
            v3sig: v3Analysis.v3Signal,
            v3conf: v3Analysis.v3Confidence,
            score: v3Analysis.v3Score?.compressedScore || 0,
            regime: v3Analysis.marketRegime?.regime || v4Result.regimeKey || 'UNKNOWN',
            vol: v3Analysis.volatilityMetrics?.regime || 'NORMAL',
            session: v4Result.sessionKey || 'UNKNOWN',
            entry: v3Analysis.entry || 0,
            sl: v3Analysis.stopLoss || 0,
            tp1: v3Analysis.takeProfit?.tp1 || 0,
            outcome: null,
            // V4.1: Reputation data
            dh: deviceHash,
            lwr: +localWinRate.toFixed(1),
            ltc: localTradeCount
        });

        if (queue.length > 50) queue.splice(0, queue.length - 50);
        safeSet(COLLECTIVE_QUEUE_KEY, queue);
    }

    async function submitToBackend() {
        const queue = safeGet(COLLECTIVE_QUEUE_KEY);
        if (!queue || !queue.length) return { submitted: 0 };

        try {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), BACKEND_TIMEOUT);
            const resp = await fetch(`${BACKEND_URL}/collective/submit-trades`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ trades: queue, deviceHash: getDeviceHash() }),
                signal: ctrl.signal
            });
            clearTimeout(t);

            if (resp.ok) {
                safeSet(COLLECTIVE_QUEUE_KEY, []);
                return { submitted: queue.length, response: await resp.json() };
            }
        } catch (e) {
        }
        return { submitted: 0 };
    }

    async function fetchCollectiveStats(symbol) {
        const cached = safeGet(COLLECTIVE_CACHE_KEY);
        if (cached && cached.symbol === symbol && Date.now() - cached.ts < COLLECTIVE_SYNC_INTERVAL) {
            return cached.data;
        }

        try {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), BACKEND_TIMEOUT);
            const resp = await fetch(`${BACKEND_URL}/collective/global-stats?symbol=${symbol}`, { signal: ctrl.signal });
            clearTimeout(t);

            if (resp.ok) {
                const data = await resp.json();
                safeSet(COLLECTIVE_CACHE_KEY, { symbol, ts: Date.now(), data });
                return data;
            }
        } catch (e) {
        }
        return null;
    }

    async function fetchCollectiveWeights() {
        try {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), BACKEND_TIMEOUT);
            const resp = await fetch(`${BACKEND_URL}/collective/model-weights`, { signal: ctrl.signal });
            clearTimeout(t);
            if (resp.ok) return await resp.json();
        } catch (e) {
        }
        return null;
    }

    // ═══════════════════════════════════════════════════════════════
    // MODULE 15: BOT INTEGRATION LAYER
    // ═══════════════════════════════════════════════════════════════
    /**
     * Generates webhook-ready structured output for bot execution.
     * Compatible with Binance Futures API webhook receivers.
     *
     * Output format can be sent directly to:
     *  - 3Commas
     *  - Cornix
     *  - Custom Binance bot
     */
    function generateBotWebhook(v4Result, limitOrder, riskEngine, symbol) {
        if (!v4Result.v4Signal.includes('CONFIRMED') && !v4Result.v4Signal.includes('AGUARDAR')) {
            return { active: false, reason: 'No actionable signal' };
        }

        if (riskEngine?.killSwitch) {
            return { active: false, reason: riskEngine.killReason };
        }

        const direction = v4Result.intendedDirection;
        const isConfirmed = v4Result.v4Signal.includes('CONFIRMED');

        return {
            active: true,
            timestamp: Date.now(),
            symbol: symbol,
            side: direction === 'LONG' ? 'BUY' : 'SELL',
            signal: v4Result.v4Signal,
            // v7.1: Add action/type aliases for UI compatibility
            action: v4Result.v4Signal,
            type: limitOrder?.type || 'UNKNOWN',
            confidence: v4Result.v4Confidence,
            gateScore: v4Result.gateScore,
            execution: limitOrder?.type || 'UNKNOWN',
            entry: limitOrder?.entry || 0,
            stopLoss: limitOrder?.stopLoss || riskEngine?.suggestedStop || 0,
            takeProfit1: limitOrder?.tp1 || 0,
            takeProfit2: limitOrder?.tp2 || 0,
            invalidation: limitOrder?.invalidation || 0,
            riskReward: limitOrder?.riskReward1 || 0,
            riskPercent: riskEngine?.riskPerTrade || DEFAULT_RISK_PERCENT,
            leverageSuggested: riskEngine?.leverageSuggested || 1,
            sizeMultiplier: riskEngine?.sizeMultiplier || 1,
            regime: v4Result.regimeKey,
            session: v4Result.sessionKey,
            isCounterTrend: v4Result.isCounterTrend,
            isConfirmed,
            // Webhook format for common bots
            webhookMessage: `${direction} ${symbol} @ ${limitOrder?.entry || '?'} | SL: ${limitOrder?.stopLoss || '?'} | TP1: ${limitOrder?.tp1 || '?'} | TP2: ${limitOrder?.tp2 || '?'} | Risk: ${riskEngine?.riskPerTrade || '?'}% | Gate: ${v4Result.gateScore}%`
        };
    }

    // ═══════════════════════════════════════════════════════════════
    // MODULE 16: REACTIVE SUMMARY GENERATOR
    // ═══════════════════════════════════════════════════════════════
    function generateReactiveSummary(v4Result, squeezeState, collectiveStats, reactivePerf, sessionContext, limitOrder, riskEngine, microstructure, modelStability) {
        let lines = [];

        // Signal
        if (v4Result.v4Signal.includes('CONFIRMED')) {
            lines.push(`🎯 SINAL ${v4Result.v4Signal}: Confirmações atingidas para regime ${v4Result.regimeKey}.`);

            // Execution plan
            if (limitOrder?.type === 'LIMIT_ON_RETEST') {
                lines.push(`📋 EXECUÇÃO: Limit Order @ $${limitOrder.entry} (aguardar reteste)`);
                lines.push(`   SL: $${limitOrder.stopLoss} | TP1: $${limitOrder.tp1} (${limitOrder.riskReward1}R) | TP2: $${limitOrder.tp2} (${limitOrder.riskReward2}R)`);
            } else if (limitOrder?.type === 'MARKET_AFTER_RETEST') {
                lines.push(`📋 EXECUÇÃO: Market Order — reteste confirmado`);
                lines.push(`   SL: $${limitOrder.stopLoss} | TP1: $${limitOrder.tp1} | TP2: $${limitOrder.tp2}`);
            }
        } else if (v4Result.v4Signal.includes('AGUARDAR')) {
            const dir = v4Result.v4Signal.replace('AGUARDAR_', '');
            lines.push(`⏳ AGUARDAR ${dir}: ${v4Result.passedCount}/${v4Result.totalGates} gates (precisa ${v4Result.minGatesRequired} para ${v4Result.regimeKey}).`);
            lines.push(`"Perder 20% do início > tentar 100% e errar metade."`);
        } else {
            lines.push(`⏸️ NÃO OPERAR: Sem estrutura confirmada.`);
        }

        lines.push('');

        // Session context
        if (sessionContext) {
            lines.push(`${sessionContext.sessionEmoji} Sessão: ${sessionContext.sessionName} — Liquidez: ${sessionContext.liquidityLevel}, Fake breakout risk: ${sessionContext.fakeBreakoutRisk}`);
            if (sessionContext.isWeekend) lines.push(`⚠️ WEEKEND: Liquidez mínima. Sinais limitados a AGUARDAR.`);
        }

        // Gates
        lines.push('');
        lines.push(`📊 Gates: ${v4Result.passedCount}/${v4Result.totalGates} (Score: ${v4Result.gateScore}%, Regime: ${v4Result.regimeKey} requer ${v4Result.minGatesRequired})`);
        v4Result.gates.forEach(g => lines.push(`  ${g.passed ? '✅' : '❌'} ${g.name}`));

        // Risk
        if (riskEngine) {
            lines.push('');
            if (riskEngine.killSwitch) {
                lines.push(`🛑 KILL SWITCH: ${riskEngine.killReason}`);
            } else {
                lines.push(`💰 Risk: ${riskEngine.riskPerTrade}%/trade | Stop: $${riskEngine.suggestedStop} (${riskEngine.stopPercent}%) | Lev: ${riskEngine.leverageSuggested}×`);
            }
        }

        // Model stability
        if (modelStability && !modelStability.stable) {
            lines.push('');
            lines.push(`⚠️ ${modelStability.details}`);
        }

        // Microstructure
        if (microstructure?.confirmsDirection) {
            lines.push('');
            lines.push(`🔬 Microestrutura: ${microstructure.details}`);
        }

        // Squeeze
        if (squeezeState?.isSqueeze) {
            lines.push('');
            lines.push(squeezeState.expanding
                ? `🔥 SQUEEZE EXPANDINDO para ${squeezeState.direction}`
                : `📦 SQUEEZE sem expansão — alto risco de falso breakout`);
        }

        // Collective
        if (collectiveStats?.globalWinRate) {
            lines.push('');
            lines.push(`🌐 Coletivo (${collectiveStats.totalUsers || 0} devices): WR ${collectiveStats.globalWinRate}% | Consenso: ${collectiveStats.consensusSignal || '?'}`);
        }

        // Reactive perf
        if (reactivePerf && reactivePerf.confirmed.count >= 3) {
            lines.push('');
            lines.push(`📈 Local: CONFIRMED WR ${reactivePerf.confirmed.winRate}% (${reactivePerf.confirmed.count}) vs AGUARDAR WR ${reactivePerf.aguardar.winRate}% (${reactivePerf.aguardar.count})`);
            if (reactivePerf.advantage !== null) {
                lines.push(`   Vantagem reativa: ${reactivePerf.advantage > 0 ? '+' : ''}${reactivePerf.advantage}%`);
            }
        }

        return lines.join('\n');
    }

    // ═══════════════════════════════════════════════════════════════
    // MODULE 18: BTC ALIGNMENT (Market Context)
    // ═══════════════════════════════════════════════════════════════
    /**
     * Compares any altcoin's direction/momentum with BTC.
     * An altcoin breakout AGAINST BTC direction = high risk.
     * An altcoin breakout WITH BTC direction = high conviction.
     *
     * Uses live BTC klines stored by the app or fetches separately.
     */
    const BTC_CACHE_KEY = STORAGE_PREFIX + 'btc_klines_cache';
    const BTC_CACHE_TTL = 5 * 60 * 1000; // 5 min

    async function analyzeBtcAlignment(rawData, intendedDirection, symbol) {
        if (symbol === 'BTCUSDT') {
            return { available: true, alignment: 'SELF', correlation: 1, risk: 'NONE', details: 'BTC — auto-referenciado', btcTrend: null };
        }

        // Try to get BTC data from cache or fetch
        let btcKlines = null;
        const cached = safeGet(BTC_CACHE_KEY);
        if (cached && cached.ts && (Date.now() - cached.ts) < BTC_CACHE_TTL) {
            btcKlines = cached.data;
        } else {
            try {
                const resp = await fetch('https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=100');
                btcKlines = await resp.json();
                safeSet(BTC_CACHE_KEY, { data: btcKlines, ts: Date.now() });
            } catch (e) {
                return { available: false, alignment: 'UNKNOWN', correlation: 0, risk: 'UNKNOWN', details: 'Dados BTC indisponíveis' };
            }
        }

        if (!btcKlines || btcKlines.length < 30 || !rawData.klines1h || rawData.klines1h.length < 30) {
            return { available: false, alignment: 'UNKNOWN', correlation: 0, risk: 'UNKNOWN', details: 'Dados insuficientes para correlação' };
        }

        // Calculate BTC trend (EMA 20 vs EMA 50)
        const btcCloses = btcKlines.map(k => parseFloat(k[4]));
        const btcEma20 = _ema(btcCloses, 20);
        const btcEma50 = _ema(btcCloses, 50);
        const btcPrice = btcCloses[btcCloses.length - 1];
        const btcTrendUp = btcPrice > btcEma20 && btcEma20 > btcEma50;
        const btcTrendDown = btcPrice < btcEma20 && btcEma20 < btcEma50;
        const btcTrend = btcTrendUp ? 'UP' : btcTrendDown ? 'DOWN' : 'NEUTRAL';

        // BTC momentum (change last 24 candles)
        const btcMomentum = btcCloses.length >= 24 ? ((btcPrice - btcCloses[btcCloses.length - 24]) / btcCloses[btcCloses.length - 24]) * 100 : 0;

        // Calculate Pearson correlation between BTC returns and alt returns
        // MULTI-WINDOW: Use 12h, 24h, and 72h windows for more robust analysis
        const altCloses = rawData.klines1h.map(k => parseFloat(k[4]));

        function calcPearson(btcArr, altArr, windowSize) {
            const len = Math.min(btcArr.length, altArr.length, windowSize);
            if (len < 10) return { correlation: 0, valid: false };
            const bRet = [], aRet = [];
            for (let i = 1; i < len; i++) {
                bRet.push((btcArr[btcArr.length - len + i] - btcArr[btcArr.length - len + i - 1]) / btcArr[btcArr.length - len + i - 1]);
                aRet.push((altArr[altArr.length - len + i] - altArr[altArr.length - len + i - 1]) / altArr[altArr.length - len + i - 1]);
            }
            const nn = bRet.length;
            const sB = bRet.reduce((a, b) => a + b, 0), sA = aRet.reduce((a, b) => a + b, 0);
            const sBsq = bRet.reduce((a, b) => a + b * b, 0), sAsq = aRet.reduce((a, b) => a + b * b, 0);
            const sP = bRet.reduce((a, b, i) => a + b * aRet[i], 0);
            const num = nn * sP - sB * sA;
            const den = Math.sqrt((nn * sBsq - sB ** 2) * (nn * sAsq - sA ** 2));
            return { correlation: den > 0 ? num / den : 0, valid: true, samples: nn };
        }

        // Calculate correlations for all windows
        const correlations = {};
        let bestWindow = 48; // default fallback
        let bestCorrelation = 0;
        for (const w of BTC_CORR_WINDOWS) {
            const result = calcPearson(btcCloses, altCloses, w);
            correlations[`${w}h`] = result;
            if (result.valid && Math.abs(result.correlation) > Math.abs(bestCorrelation)) {
                bestCorrelation = result.correlation;
                bestWindow = w;
            }
        }

        // Weighted average correlation (recent windows weighted more)
        const weights = { 12: 0.5, 24: 0.3, 72: 0.2 };
        let weightedCorr = 0, totalWeight = 0;
        for (const w of BTC_CORR_WINDOWS) {
            const c = correlations[`${w}h`];
            if (c.valid) {
                weightedCorr += c.correlation * weights[w];
                totalWeight += weights[w];
            }
        }
        const correlation = totalWeight > 0 ? weightedCorr / totalWeight : 0;

        // Correlation trend: is it increasing or decreasing?
        const corr12 = correlations['12h']?.correlation || 0;
        const corr72 = correlations['72h']?.correlation || 0;
        const corrTrend = corr12 > corr72 + 0.1 ? 'INCREASING' : corr12 < corr72 - 0.1 ? 'DECREASING' : 'STABLE';

        // Alt relative strength
        const altMomentum = altCloses.length >= 24 ? ((altCloses[altCloses.length - 1] - altCloses[altCloses.length - 24]) / altCloses[altCloses.length - 24]) * 100 : 0;
        const relativeStrength = altMomentum - btcMomentum;

        // Alignment
        let alignment, risk, description;
        const aligned = (intendedDirection === 'LONG' && btcTrend === 'UP') || (intendedDirection === 'SHORT' && btcTrend === 'DOWN');
        const diverging = (intendedDirection === 'LONG' && btcTrend === 'DOWN') || (intendedDirection === 'SHORT' && btcTrend === 'UP');

        if (aligned) {
            alignment = 'ALIGNED';
            risk = 'LOW';
            description = `✅ Alinhado com BTC (${btcTrend})`;
        } else if (diverging) {
            alignment = 'DIVERGING';
            risk = correlation > 0.7 ? 'HIGH' : 'MEDIUM';
            description = `⚠️ Divergindo do BTC (${btcTrend}) — risco ${risk === 'HIGH' ? 'alto' : 'médio'}`;
        } else {
            alignment = 'NEUTRAL';
            risk = 'LOW';
            description = `BTC neutro — alt independente`;
        }

        return {
            available: true,
            alignment,
            correlation: +correlation.toFixed(3),
            correlations: {
                '12h': +(correlations['12h']?.correlation || 0).toFixed(3),
                '24h': +(correlations['24h']?.correlation || 0).toFixed(3),
                '72h': +(correlations['72h']?.correlation || 0).toFixed(3)
            },
            corrTrend,
            dominantWindow: bestWindow + 'h',
            btcTrend,
            btcMomentum: +btcMomentum.toFixed(2),
            altMomentum: +altMomentum.toFixed(2),
            relativeStrength: +relativeStrength.toFixed(2),
            risk,
            details: description + (corrTrend !== 'STABLE' ? ` | Corr ${corrTrend.toLowerCase()}` : ''),
            btcPrice: +btcPrice.toFixed(2)
        };
    }

    // ═══════════════════════════════════════════════════════════════
    // MODULE 19: SCORE PERCENTILE (Market-Wide Ranking)
    // ═══════════════════════════════════════════════════════════════
    /**
     * Stores scores for all analyzed symbols in localStorage.
     * When showing a single asset, calculates its percentile
     * relative to ALL other assets analyzed in the last cycle.
     */
    const SCORE_HISTORY_KEY = STORAGE_PREFIX + 'score_history';

    function updateScoreHistory(symbol, confidence, gateScore, passedGates, totalGates) {
        const history = safeGet(SCORE_HISTORY_KEY) || {};
        history[symbol] = {
            confidence,
            gateScore,
            passedGates,
            totalGates,
            ts: Date.now()
        };
        // Clean old entries (> 15 min)
        const cutoff = Date.now() - 15 * 60 * 1000;
        Object.keys(history).forEach(key => {
            if (history[key].ts < cutoff) delete history[key];
        });
        safeSet(SCORE_HISTORY_KEY, history);
    }

    function getScorePercentile(symbol, confidence) {
        const history = safeGet(SCORE_HISTORY_KEY) || {};
        const scores = Object.values(history).map(h => h.confidence).filter(c => typeof c === 'number');
        if (scores.length < 3) return { available: false, percentile: null, rank: null, total: scores.length, description: 'Poucos ativos analisados' };

        const sorted = [...scores].sort((a, b) => a - b);
        const idx = sorted.findIndex(s => s >= confidence);
        const pct = idx >= 0 ? Math.round((idx / sorted.length) * 100) : 100;
        const rank = sorted.length - (idx >= 0 ? idx : sorted.length) + 1;

        let description;
        if (pct >= 90) description = `🏆 Top ${100 - pct}% — entre os mais fortes agora`;
        else if (pct >= 70) description = `📈 Acima da média (p${pct})`;
        else if (pct >= 30) description = `➖ Na média do mercado (p${pct})`;
        else description = `📉 Abaixo da média (p${pct})`;

        return {
            available: true,
            percentile: pct,
            rank,
            total: scores.length,
            description,
            details: `Rank ${rank}/${scores.length} — Percentil ${pct}`
        };
    }

    // ═══════════════════════════════════════════════════════════════
    // MODULE 20: SETUP HISTORY STATISTICS
    // ═══════════════════════════════════════════════════════════════
    /**
     * Tracks every unique "setup fingerprint" combination:
     *   regime + oiSignal + cvdDirection + displacementDirection
     *
     * Over time, builds a statistical database of how each
     * combination has performed. Shows:
     *   - Win rate
     *   - Average R:R achieved
     *   - Sample size
     */
    const SETUP_HISTORY_KEY = STORAGE_PREFIX + 'setup_history';
    const MAX_SETUP_HISTORY = 500;

    function getSetupFingerprint(regime, oiSignal, cvdDirection, displacementDir) {
        return [
            regime || 'UNKNOWN',
            oiSignal || 'NEUTRAL',
            cvdDirection || 'NONE',
            displacementDir || 'NONE'
        ].join('+');
    }

    /**
     * V7: recordSetupOutcome agora envia ao backend (global DB) ao invés de localStorage.
     * LocalStorage mantido apenas como write-through cache de emergência.
     */
    function recordSetupOutcome(fingerprint, won, rMultiple) {
        // Send to backend (fire-and-forget)
        try {
            fetch(`${BACKEND_URL}/analysis/setup-outcome`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fingerprint,
                    won,
                    r_multiple: rMultiple || 0,
                    device_id: getDeviceHash(),
                    timestamp: Date.now()
                }),
                signal: AbortSignal.timeout(BACKEND_TIMEOUT)
            }).catch(() => {});
        } catch {}

        // Local cache (fallback only)
        const history = safeGet(SETUP_HISTORY_KEY) || {};
        if (!history[fingerprint]) {
            history[fingerprint] = { wins: 0, losses: 0, totalR: 0, count: 0 };
        }
        const h = history[fingerprint];
        h.count++;
        if (won) h.wins++;
        else h.losses++;
        h.totalR += (rMultiple || 0);

        const keys = Object.keys(history);
        if (keys.length > MAX_SETUP_HISTORY) {
            const sorted = keys.map(k => ({ k, count: history[k].count })).sort((a, b) => a.count - b.count);
            for (let i = 0; i < Math.min(50, sorted.length); i++) {
                delete history[sorted[i].k];
            }
        }
        safeSet(SETUP_HISTORY_KEY, history);
    }

    function getSetupStats(fingerprint) {
        const history = safeGet(SETUP_HISTORY_KEY) || {};
        const stats = history[fingerprint];
        if (!stats || stats.count < 3) {
            return {
                available: false,
                fingerprint,
                winRate: null,
                avgR: null,
                count: stats?.count || 0,
                description: stats ? `Setup com apenas ${stats.count} amostra(s) — insuficiente` : 'Setup nunca registrado — dados virão com o tempo'
            };
        }

        const wr = Math.round((stats.wins / stats.count) * 100);
        const avgR = +(stats.totalR / stats.count).toFixed(2);

        let quality;
        if (wr >= 60 && avgR >= 1.0) quality = 'EXCELENTE';
        else if (wr >= 50 && avgR >= 0.8) quality = 'BOM';
        else if (wr >= 40) quality = 'MÉDIO';
        else quality = 'FRACO';

        return {
            available: true,
            fingerprint,
            winRate: wr,
            avgR,
            count: stats.count,
            wins: stats.wins,
            losses: stats.losses,
            quality,
            description: `WR: ${wr}% | R médio: ${avgR} | ${stats.count} amostras — ${quality}`
        };
    }

    // ═══════════════════════════════════════════════════════════════
    // MODULE 21: REGIME QUALITY CLASSIFIER
    // ═══════════════════════════════════════════════════════════════
    /**
     * Not all TREND_UP are equal.
     * Classifies regime health/quality:
     *   WEAK     — ADX barely above 25, vol falling
     *   STABLE   — ADX steady, normal vol
     *   ACCELERATING — ADX rising, vol expanding
     *
     * Uses ADX slope (ADX now vs ADX 5candles ago)
     * + volume Z-Score trend
     * + ATR expansion/contraction
     */
    function classifyRegimeQuality(regimeData, volumeExpansion, klines1h) {
        if (!regimeData || !regimeData.regime) {
            return { quality: 'UNKNOWN', qualityScore: 0, details: 'Regime indisponível' };
        }

        const regime = regimeData.regime;
        const adx = regimeData.adx || 20;
        const atrPercentile = regimeData.atrPercentile || 50;

        // ADX slope approximation: check if ADX is rising or falling
        // We use adx value combined with atrPercentile as proxy
        let adxLevel;
        if (adx > 40) adxLevel = 'STRONG';
        else if (adx > 30) adxLevel = 'MODERATE';
        else if (adx > 25) adxLevel = 'WEAK';
        else adxLevel = 'NO_TREND';

        // Volume context
        const volExpanding = volumeExpansion?.expanding === true;
        const volSustained = volumeExpansion?.sustained === true;

        // ATR context
        const volHigh = atrPercentile > 60;
        const volLow = atrPercentile < 30;

        let quality, qualityEmoji, qualityScore;

        if (regime === 'RANGE' || regime === 'COMPRESSION') {
            // Range: quality is about stability
            if (volLow && adx < 20) {
                quality = 'Estável';
                qualityEmoji = '🔒';
                qualityScore = 50;
            } else if (volHigh) {
                quality = 'Instável';
                qualityEmoji = '⚡';
                qualityScore = 30;
            } else {
                quality = 'Normal';
                qualityEmoji = '➖';
                qualityScore = 40;
            }
        } else if (regime.includes('TREND') || regime.includes('EXPANSION')) {
            // Trend: quality is about strength + expansion
            if (adxLevel === 'STRONG' && volExpanding) {
                quality = 'Acelerando';
                qualityEmoji = '🔥';
                qualityScore = 95;
            } else if (adxLevel === 'STRONG' || (adxLevel === 'MODERATE' && volSustained)) {
                quality = 'Forte';
                qualityEmoji = '💪';
                qualityScore = 80;
            } else if (adxLevel === 'MODERATE') {
                quality = 'Estável';
                qualityEmoji = '✅';
                qualityScore = 65;
            } else if (adxLevel === 'WEAK') {
                quality = 'Fraco';
                qualityEmoji = '⚠️';
                qualityScore = 40;
            } else {
                quality = 'Enfraquecendo';
                qualityEmoji = '📉';
                qualityScore = 25;
            }
        } else if (regime === 'HIGH_VOL') {
            quality = 'Perigoso';
            qualityEmoji = '🌋';
            qualityScore = 20;
        } else {
            quality = 'Normal';
            qualityEmoji = '➖';
            qualityScore = 50;
        }

        return {
            quality,
            qualityEmoji,
            qualityScore,
            adxLevel,
            regime,
            details: `${qualityEmoji} ${regime} (${quality}) — ADX ${adx.toFixed(0)} (${adxLevel}), ATR p${atrPercentile}`
        };
    }

    // ═══════════════════════════════════════════════════════════════
    // MODULE 22: SATURATION / EXTENSION INDICATOR
    // ═══════════════════════════════════════════════════════════════
    /**
     * Measures how much of the "expected move" has already happened.
     * If price has already moved 80% of the avg 4h range → late entry risk.
     *
     * Uses:
     *   - ATR-based expected range for the current 4h candle
     *   - How far price has traveled from the 4h open
     *   - RSI as secondary exhaustion signal
     */
    function measureSaturation(rawData, currentPrice, direction) {
        const klines4h = rawData.klines4h;
        if (!klines4h || klines4h.length < 20) {
            return { available: false, saturationPercent: 0, risk: 'UNKNOWN', details: 'Dados 4h insuficientes' };
        }

        const candles = klines4h.map(parseKline);

        // ATR 14 of 4h candles
        let atrSum = 0;
        for (let i = Math.max(1, candles.length - 14); i < candles.length; i++) {
            const h = candles[i].high, l = candles[i].low, pc = candles[i - 1].close;
            atrSum += Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
        }
        const atr4h = atrSum / 14;

        // Current 4h candle movement
        const current4h = candles[candles.length - 1];
        const currentRange = current4h.high - current4h.low;
        const distanceFromOpen = Math.abs(currentPrice - current4h.open);

        // Saturation: how much of ATR is already used
        const saturationPercent = atr4h > 0 ? Math.min(100, Math.round((distanceFromOpen / atr4h) * 100)) : 0;
        const rangeUsedPercent = atr4h > 0 ? Math.min(100, Math.round((currentRange / atr4h) * 100)) : 0;

        // Direction check: is price moving in the intended direction?
        const movingWithDirection = (direction === 'LONG' && currentPrice > current4h.open) ||
                                     (direction === 'SHORT' && currentPrice < current4h.open);

        let risk, riskEmoji, description;
        if (saturationPercent >= 85) {
            risk = 'HIGH';
            riskEmoji = '🔴';
            description = `Movimento já estendido (${saturationPercent}% do ATR 4h) — risco de pullback ↑`;
        } else if (saturationPercent >= 60) {
            risk = 'MEDIUM';
            riskEmoji = '🟡';
            description = `Expansão moderada (${saturationPercent}% do ATR 4h) — cuidado com late entry`;
        } else if (saturationPercent >= 30) {
            risk = 'LOW';
            riskEmoji = '🟢';
            description = `Espaço disponível (${saturationPercent}% do ATR 4h) — entrada boa`;
        } else {
            risk = 'VERY_LOW';
            riskEmoji = '🟢';
            description = `Início do movimento (${saturationPercent}% do ATR 4h) — timing ótimo`;
        }

        return {
            available: true,
            saturationPercent,
            rangeUsedPercent,
            atr4h: +atr4h.toFixed(2),
            distanceFromOpen: +distanceFromOpen.toFixed(2),
            movingWithDirection,
            risk,
            riskEmoji,
            details: description
        };
    }

    // ═══════════════════════════════════════════════════════════════
    // MODULE 23: NOTIFICATION CONFIGURATION + FCM INTEGRATION
    // ═══════════════════════════════════════════════════════════════
    /**
     * V6: Dual notification system:
     * 1) Local Capacitor fallback for offline
     * 2) FCM server-side push for reliable delivery
     *
     * User can configure confidence threshold (70-100%).
     * Backend sends FCM push when signal meets threshold.
     */
    const NOTIF_CONFIG_KEY = STORAGE_PREFIX + 'notif_config';
    const FCM_TOKEN_KEY = STORAGE_PREFIX + 'fcm_token';

    function getNotificationConfig(symbol) {
        const all = safeGet(NOTIF_CONFIG_KEY) || {};
        const global = all['__global__'] || { enabled: false, conditions: {}, confidenceThreshold: NOTIF_DEFAULT_CONFIDENCE };
        const specific = all[symbol] || {};
        return { ...global, ...specific, symbol };
    }

    function setNotificationConfig(symbol, config) {
        const all = safeGet(NOTIF_CONFIG_KEY) || {};
        // Ensure confidence threshold is within bounds
        if (config.confidenceThreshold !== undefined) {
            config.confidenceThreshold = clamp(config.confidenceThreshold, NOTIF_MIN_CONFIDENCE, NOTIF_MAX_CONFIDENCE);
        }
        all[symbol || '__global__'] = { ...config, updatedAt: Date.now() };
        safeSet(NOTIF_CONFIG_KEY, all);

        // Sync to backend if FCM registered
        _syncNotificationPrefsToBackend(all);
    }

    function getConfidenceThreshold() {
        const config = getNotificationConfig('__global__');
        return clamp(config.confidenceThreshold || NOTIF_DEFAULT_CONFIDENCE, NOTIF_MIN_CONFIDENCE, NOTIF_MAX_CONFIDENCE);
    }

    function setConfidenceThreshold(threshold) {
        const t = clamp(threshold, NOTIF_MIN_CONFIDENCE, NOTIF_MAX_CONFIDENCE);
        const all = safeGet(NOTIF_CONFIG_KEY) || {};
        const global = all['__global__'] || { enabled: true, conditions: {} };
        global.confidenceThreshold = t;
        all['__global__'] = { ...global, updatedAt: Date.now() };
        safeSet(NOTIF_CONFIG_KEY, all);
        _syncNotificationPrefsToBackend(all);
        return t;
    }

    // ── FCM Token management ──
    async function registerFcmToken(token) {
        if (!token) return false;
        safeSet(FCM_TOKEN_KEY, token);
        try {
            const resp = await fetch(`${BACKEND_URL}/notifications/register-token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: getDeviceHash(),
                    fcm_token: token
                }),
                signal: AbortSignal.timeout(BACKEND_TIMEOUT)
            });
            return resp.ok;
        } catch { return false; }
    }

    async function unregisterFcmToken() {
        const token = safeGet(FCM_TOKEN_KEY);
        if (!token) return;
        try {
            await fetch(`${BACKEND_URL}/notifications/unregister-token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: getDeviceHash(),
                    fcm_token: token
                }),
                signal: AbortSignal.timeout(BACKEND_TIMEOUT)
            });
        } catch {}
        safeSet(FCM_TOKEN_KEY, null);
    }

    async function _syncNotificationPrefsToBackend(allPrefs) {
        const global = allPrefs['__global__'] || {};
        try {
            await fetch(`${BACKEND_URL}/notifications/prefs`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: getDeviceHash(),
                    enabled: global.enabled !== false,
                    confidence_threshold: global.confidenceThreshold || NOTIF_DEFAULT_CONFIDENCE,
                    symbols: Object.keys(allPrefs).filter(k => k !== '__global__' && allPrefs[k].enabled !== false)
                }),
                signal: AbortSignal.timeout(BACKEND_TIMEOUT)
            });
        } catch {}
    }

    // ═══════════════════════════════════════════════════════════════
    // MODULE 16b: NOTIFICATION COOLDOWN (v7.2 — #16)
    // ═══════════════════════════════════════════════════════════════
    const NOTIF_COOLDOWN_KEY = STORAGE_PREFIX + 'notif_cooldown_';
    const NOTIF_COOLDOWN_MS = {
        'SETUP_CONFIRMED': 30 * 60 * 1000,     // 30 min between same type
        'CONFIDENCE_THRESHOLD': 15 * 60 * 1000, // 15 min
        'REGIME_CHANGE': 60 * 60 * 1000,        // 1 hour
        'SCORE_JUMP': 10 * 60 * 1000            // 10 min
    };

    function isNotificationOnCooldown(symbol, triggerType) {
        const key = NOTIF_COOLDOWN_KEY + symbol;
        const cooldowns = safeGet(key) || {};
        const last = cooldowns[triggerType];
        if (!last) return false;
        const cooldownMs = NOTIF_COOLDOWN_MS[triggerType] || 15 * 60 * 1000;
        return (Date.now() - last) < cooldownMs;
    }

    function markNotificationSent(symbol, triggerType) {
        const key = NOTIF_COOLDOWN_KEY + symbol;
        const cooldowns = safeGet(key) || {};
        cooldowns[triggerType] = Date.now();
        safeSet(key, cooldowns);
    }

    function checkNotificationTriggers(symbol, analysis, prevAnalysis) {
        const config = getNotificationConfig(symbol);
        if (!config.enabled) return [];

        const triggers = [];
        const cond = config.conditions || {};
        const threshold = config.confidenceThreshold || NOTIF_DEFAULT_CONFIDENCE;

        // Setup confirmed (only if meets confidence threshold)
        if (cond.setupConfirmed && analysis.v4Signal?.includes('CONFIRMED') &&
            analysis.v4Confidence >= threshold &&
            !prevAnalysis?.v4Signal?.includes('CONFIRMED') &&
            !isNotificationOnCooldown(symbol, 'SETUP_CONFIRMED')) {
            triggers.push({
                type: 'SETUP_CONFIRMED',
                title: `${symbol} — ${analysis.v4Signal}`,
                body: `Setup confirmado com ${analysis.v4GatesPassed}/${analysis.v4GatesTotal} gates (${analysis.v4Confidence}% confiança, limite: ${threshold}%)`,
                priority: 'HIGH'
            });
            markNotificationSent(symbol, 'SETUP_CONFIRMED');
        }

        // Confidence threshold (calibrated)
        if (cond.minConfidence && analysis.v4Confidence >= threshold &&
            (!prevAnalysis || prevAnalysis.v4Confidence < threshold) &&
            !isNotificationOnCooldown(symbol, 'CONFIDENCE_THRESHOLD')) {
            triggers.push({
                type: 'CONFIDENCE_THRESHOLD',
                title: `${symbol} — Confiança ${analysis.v4Confidence}%`,
                body: `Confiança atingiu ${analysis.v4Confidence}% (limite configurado: ${threshold}%)`,
                priority: 'MEDIUM'
            });
            markNotificationSent(symbol, 'CONFIDENCE_THRESHOLD');
        }

        // Regime change
        if (cond.regimeChange && analysis.enhancedRegimeV4?.regime && prevAnalysis?.enhancedRegimeV4?.regime &&
            analysis.enhancedRegimeV4.regime !== prevAnalysis.enhancedRegimeV4.regime &&
            !isNotificationOnCooldown(symbol, 'REGIME_CHANGE')) {
            triggers.push({
                type: 'REGIME_CHANGE',
                title: `${symbol} — Regime mudou`,
                body: `${prevAnalysis.enhancedRegimeV4.regime} → ${analysis.enhancedRegimeV4.regime}`,
                priority: 'MEDIUM'
            });
            markNotificationSent(symbol, 'REGIME_CHANGE');
        }

        // Score jump
        if (cond.scoreJump && analysis.v4GateScore && prevAnalysis?.v4GateScore &&
            !isNotificationOnCooldown(symbol, 'SCORE_JUMP')) {
            const jump = analysis.v4GateScore - prevAnalysis.v4GateScore;
            if (jump >= (cond.scoreJumpPercent || 10)) {
                triggers.push({
                    type: 'SCORE_JUMP',
                    title: `${symbol} — Score subiu ${jump.toFixed(0)}%`,
                    body: `Gate score: ${prevAnalysis.v4GateScore.toFixed(0)}% → ${analysis.v4GateScore.toFixed(0)}%`,
                    priority: 'LOW'
                });
                markNotificationSent(symbol, 'SCORE_JUMP');
            }
        }

        return triggers;
    }

    // ═══════════════════════════════════════════════════════════════
    // MODULE 17: MASTER V5 ENHANCEMENT ORCHESTRATOR
    // ═══════════════════════════════════════════════════════════════
    /**
     * Main entry: V3 does the math. V5 decides WHETHER to act,
     * HOW to act (limit vs market), and HOW MUCH to risk.
     */
    async function enhanceWithReactive(v3Analysis, rawData, symbol) {
        const startTime = Date.now();

        // ─── [0] DATA INTEGRITY CHECK ───
        const dataIntegrity = checkDataIntegrity(rawData);
        if (!dataIntegrity.valid) {
            // FORCE NEUTRO — no fallback, no guesses
            return {
                ...v3Analysis,
                v4Signal: 'NEUTRO',
                v4SignalType: 'neutral',
                v4Confidence: 5,
                v4Probability: 50,
                v4ActionMessage: dataIntegrity.details + '\n' + dataIntegrity.issues.join('\n'),
                v4ActionIcon: '🚨',
                v4GateScore: 0,
                v4GatesTotal: 9,
                v4GatesPassed: 0,
                v4Gates: [],
                v4Reasoning: 'FORCE_NEUTRO: Dados críticos ausentes',
                v4ExecutionType: 'NONE',
                dataIntegrity,
                v4ProcessingTime: Date.now() - startTime
            };
        }

        // Connect Real CVD WebSocket (se disponível)
        if (window.RealtimeCVD) {
            try { window.RealtimeCVD.connect(symbol); } catch (e) {}
        }

        // Extract from V3
        const v3Signal = v3Analysis.v3Signal || v3Analysis.signal || 'NEUTRO';
        const v3Confidence = v3Analysis.v3Confidence || v3Analysis.confidence || 30;
        const v3Score = v3Analysis.v3Score || {};
        const currentPrice = rawData.currentPrice;
        const fundingRate = rawData.fundingRate?.fundingRate || (rawData.fundingRate?.length > 0 ? rawData.fundingRate[0]?.fundingRate : 0) || 0;
        const atr = v3Analysis.volatilityMetrics?.atr || v3Analysis.indicators?.atr14 || null;
        
        // Determine intended direction from V3 signal, or fallback to raw score bias
        let intendedDir = v3Signal === 'LONG' ? 'LONG' : v3Signal === 'SHORT' ? 'SHORT' : null;
        
        // If V3 said NEUTRO but has a directional bias in raw/compressed score, use it
        if (!intendedDir && v3Score) {
            const rawScoreVal = v3Score.compressedScore || v3Score.rawScore || 0;
            if (rawScoreVal >= 0.5) intendedDir = 'LONG';
            else if (rawScoreVal <= -0.5) intendedDir = 'SHORT';
        }
        // Last fallback: check V1/V2 original signal
        if (!intendedDir) {
            const origSignal = v3Analysis.signal;
            if (origSignal === 'LONG') intendedDir = 'LONG';
            else if (origSignal === 'SHORT') intendedDir = 'SHORT';
        }

        // ─── [1] SESSION CONTEXT ───
        const sessionContext = getSessionContext();

        // ─── [2] DISPLACEMENT (Z-Score) ───
        const displacement1h = detectDisplacement(rawData.klines1h, '1h');
        const displacement4h = detectDisplacement(rawData.klines4h, '4h');

        // ─── [3] VOLUME EXPANSION (Z-Score) ───
        const volumeExpansion1h = detectVolumeExpansion(rawData.klines1h, Z_SCORE_LOOKBACK);
        const volumeExpansion4h = detectVolumeExpansion(rawData.klines4h, Math.min(Z_SCORE_LOOKBACK, 50));

        // ─── [4] RANGE POSITION ───
        const rangePosition = detectRangePosition(
            currentPrice,
            v3Analysis.indicators?.volumeProfile || v3Analysis.volumeProfile,
            rawData.klines1h
        );

        // ─── [5] FUNDING FILTER ───
        const fundingFilter = checkFundingFilter(fundingRate, intendedDir);

        // ─── [6] MICROSTRUCTURE ───
        const microstructure = detectMicrostructure(rawData.klines1h, intendedDir);

        // ─── [7] RETEST + LIMIT ORDER ───
        let retestLevel = null;
        if (rangePosition.breakoutDirection === 'LONG') {
            retestLevel = v3Analysis.indicators?.volumeProfile?.vah;
        } else if (rangePosition.breakoutDirection === 'SHORT') {
            retestLevel = v3Analysis.indicators?.volumeProfile?.val;
        }
        const retest = detectRetestAndGenerateOrder(rawData.klines1h, retestLevel, rangePosition.breakoutDirection, currentPrice, atr);

        // ─── [8] SQUEEZE ───
        const squeezeState = detectSqueezeExpansion(v3Analysis.volatilityMetrics, rawData.klines1h);

        // ─── [8b] VOLATILITY REGIME SHIFT ───
        const volRegimeShift = detectVolatilityRegimeShift(rawData.klines1h);

        // ─── [8c] MARKET BREADTH ───
        const marketBreadth = calculateMarketBreadth(symbol, intendedDir);

        // ─── [8d] MULTI-TIMEFRAME ANALYSIS (v7.1) ───
        const mtfAnalysis = analyzeMultiTimeframe(rawData);

        // ─── [9] OI ANALYSIS (Open Interest + OI Delta) ───
        const oiAnalysis = analyzeOpenInterest(rawData, intendedDir);

        // ─── [11] ENHANCED 6-STATE REGIME (moved before anti-spoof for adaptive thresholds) ───
        const enhancedRegimeV4 = computeEnhancedRegime(rawData, v3Analysis.enhancedRegime || v3Analysis.marketRegime, oiAnalysis);

        // ─── [10] ANTI-SPOOFING (v7.1: Regime-Adaptive) ───
        const antiSpoof = detectSpoofing(rawData, enhancedRegimeV4?.regime);

        // ─── [12] MODEL STABILITY CHECK ───
        const modelStability = checkModelStability(symbol);

        // ─── [12b] REGIME QUALITY ───
        const regimeQuality = classifyRegimeQuality(enhancedRegimeV4, volumeExpansion1h, rawData.klines1h);

        // ─── [12c] SATURATION / EXTENSION ───
        const saturation = measureSaturation(rawData, currentPrice, intendedDir);

        // ─── [13] EVALUATE GATES (regime-adaptive, with OI + Anti-Spoof) ───
        const v4Result = evaluateReactiveGates({
            v3Signal, v3Confidence, v3Score,
            displacement1h, displacement4h,
            volumeExpansion1h, volumeExpansion4h,
            rangePosition, retest, fundingFilter,
            bosValidation: v3Analysis.bosValidation,
            crashState: v3Analysis.crashState,
            enhancedRegime: enhancedRegimeV4,
            cvdAdvanced: v3Analysis.cvdAdvanced,
            sessionContext, microstructure,
            oiAnalysis, antiSpoof,
            saturation,
            btcCorrelation: null, // filled later
            rawData  // v7.2: needed for detectAcceptance
        });

        // Store session key for tracking
        v4Result.sessionKey = sessionContext.session;

        // ─── v7.2 NEW MODULES ───
        const liquidityLevels = analyzeLiquidityLevels(rawData, currentPrice);
        const hiddenDivergence = detectHiddenDivergence(rawData);
        const signalTTL = checkSignalTTL(symbol, v4Result.v4Signal);
        const liquidationZones = estimateLiquidationZones(rawData, currentPrice);

        // Connect order flow WebSocket (first call only)
        connectOrderFlowWS(symbol);
        const orderFlow = getOrderFlowAnalysis(symbol);

        // ─── SOFT: Hidden divergence bonus ───
        // (added to soft adjustments array below)

        // ─── SOFT: Signal TTL decay ───
        // (applied after gates via soft adjustments)

        // ─── SOFT: Order flow confirmation ───
        // (added to soft adjustments array below)

        // ═══════════════════════════════════════════════════════════════
        // v7.2: CENTRALIZED SOFT-ADJUSTMENT SYSTEM (#2)
        // ═══════════════════════════════════════════════════════════════
        // All confidence adjustments are collected, then applied once with a cap.
        // Hard overrides (signal type changes) remain separate.
        const softAdjustments = [];

        // ─── HARD OVERRIDE: SQUEEZE BLOCK (signal demotion only) ───
        if (squeezeState.isSqueeze && !squeezeState.expanding && v4Result.v4Signal.includes('CONFIRMED')) {
            v4Result.v4Signal = 'AGUARDAR_' + (v4Result.intendedDirection || 'LONG');
            v4Result.v4SignalType = 'aguardar';
            softAdjustments.push({ source: 'squeeze', adj: -15, reason: '📦 Squeeze sem expansão' });
        }

        // ─── SOFT: Volatility Regime Shift ───
        if (volRegimeShift.shift === 'EXPLOSIVE') {
            softAdjustments.push({ source: 'volRegime', adj: -5, reason: `${volRegimeShift.icon} Vol EXPLOSIVO — SL mais amplo` });
        } else if (volRegimeShift.shift === 'COMPRESSED') {
            softAdjustments.push({ source: 'volRegime', adj: +5, reason: `${volRegimeShift.icon} Vol COMPRIMIDA — breakout favorável` });
        }

        // ─── SOFT: Market Breadth ───
        if (marketBreadth.available && marketBreadth.boost !== 0) {
            softAdjustments.push({ source: 'breadth', adj: marketBreadth.boost, reason: `${marketBreadth.icon} ${marketBreadth.details}` });
        }

        // ─── SOFT: MTF Alignment ───
        if (mtfAnalysis.available && mtfAnalysis.confidenceModifier !== 0) {
            softAdjustments.push({ source: 'mtf', adj: mtfAnalysis.confidenceModifier, reason: `${mtfAnalysis.icon} MTF: ${mtfAnalysis.summary}` });
        }

        // ─── SOFT: Session context (moved from gateScore for #3) ───
        if (sessionContext) {
            const sessMult = sessionContext.signalMultiplier || 1.0;
            const sessAdj = Math.round((sessMult - 1.0) * 15); // kill zone: ~+7, dead zone: ~-9
            if (sessAdj !== 0) {
                softAdjustments.push({ source: 'session', adj: sessAdj, reason: `${sessionContext.isKillZone ? '🔥' : '💤'} Sessão: ${sessionContext.session}` });
            }
        }

        // ─── SOFT: Funding penalty (gradual, from v7.2 funding filter) ───
        if (fundingFilter?.penalty && fundingFilter.penalty !== 0) {
            softAdjustments.push({ source: 'funding', adj: fundingFilter.penalty, reason: `💰 ${fundingFilter.reason}` });
        }

        // ─── SOFT: Hidden divergence (#10) ───
        if (hiddenDivergence.detected) {
            const divDir = hiddenDivergence.type === 'HIDDEN_BULL' ? 'LONG' : 'SHORT';
            const divAdj = divDir === v4Result.intendedDirection ? +4 : -4;
            softAdjustments.push({ source: 'hiddenDiv', adj: divAdj, reason: `🔍 ${hiddenDivergence.details}` });
        }

        // ─── SOFT: Signal TTL decay (#11) ───
        if (signalTTL.decayFactor < 1.0) {
            const ttlAdj = Math.round((signalTTL.decayFactor - 1.0) * 20); // e.g. 0.5 → -10
            softAdjustments.push({ source: 'signalTTL', adj: ttlAdj, reason: `⏳ ${signalTTL.details}` });
        }

        // ─── SOFT: Order flow pressure (#15) ───
        if (orderFlow.available) {
            const flowDir = orderFlow.pressure.includes('BUY') ? 'LONG' : orderFlow.pressure.includes('SELL') ? 'SHORT' : null;
            if (flowDir) {
                const flowAdj = flowDir === v4Result.intendedDirection ? +3 : -3;
                const strength = orderFlow.pressure.includes('STRONG') ? 2 : 1;
                softAdjustments.push({ source: 'orderFlow', adj: flowAdj * strength, reason: `${orderFlow.icon} Order flow: ${orderFlow.details}` });
            }
        }

        // ─── [11d] SAVE SIGNAL DIRECTION FOR BREADTH ───
        const signalDirs = safeGet(STORAGE_PREFIX + 'signal_directions') || {};
        signalDirs[symbol] = { direction: v4Result.intendedDirection || 'NEUTRAL', ts: Date.now() };
        safeSet(STORAGE_PREFIX + 'signal_directions', signalDirs);

        // ─── V3/V4 SIGNAL CONFLICT RESOLUTION ───
        const v3Dir = v3Signal === 'LONG' ? 'LONG' : v3Signal === 'SHORT' ? 'SHORT' : null;
        const v4Dir = v4Result.intendedDirection;
        let signalConflict = null;
        if (v3Dir && v4Dir && v3Dir !== v4Dir) {
            signalConflict = { type: 'DIRECTION_CONFLICT', v3: v3Dir, v4: v4Dir };
            if (v4Result.v4Signal.includes('CONFIRMED')) {
                // HARD: downgrade signal type
                v4Result.v4Signal = 'AGUARDAR_' + v4Dir;
                v4Result.v4SignalType = 'aguardar';
                softAdjustments.push({ source: 'v3v4_conflict', adj: -15, reason: `⚡ Conflito V3(${v3Dir})/V4(${v4Dir})` });
            } else {
                softAdjustments.push({ source: 'v3v4_conflict', adj: -8, reason: `⚡ Conflito direção V3/V4` });
            }
        } else if (v3Dir && v4Dir && v3Dir === v4Dir && v4Result.v4Signal.includes('CONFIRMED')) {
            signalConflict = { type: 'AGREEMENT', v3: v3Dir, v4: v4Dir };
            softAdjustments.push({ source: 'v3v4_agree', adj: +5, reason: '✅ V3/V4 concordam na direção' });
        }
        v4Result.signalConflict = signalConflict;

        // ─── HARD OVERRIDE: MODEL STABILITY ───
        if (modelStability.action === 'FORCE_AGUARDAR' && v4Result.v4Signal.includes('CONFIRMED')) {
            v4Result.v4Signal = 'AGUARDAR_' + (v4Result.intendedDirection || 'LONG');
            v4Result.v4SignalType = 'aguardar';
            v4Result.actionMessage += `\n🚨 Modelo instável (WR ${modelStability.rollingWR}%) — forçando AGUARDAR.`;
        }
        if (modelStability.confidenceAdjust && modelStability.confidenceAdjust !== 0) {
            softAdjustments.push({ source: 'modelStability', adj: modelStability.confidenceAdjust, reason: `📊 Estabilidade modelo: ${modelStability.details}` });
        }

        // ─── [13] RISK ENGINE ───
        const riskEngine = calculateRisk({
            currentPrice,
            limitOrder: retest.limitOrder,
            atr,
            symbol
        });

        // HARD: Kill switch override
        if (riskEngine.killSwitch && v4Result.v4Signal.includes('CONFIRMED')) {
            v4Result.v4Signal = 'NEUTRO';
            v4Result.v4SignalType = 'aguardar';
            v4Result.v4Confidence = 10;
            v4Result.actionMessage = `🛑 KILL SWITCH: ${riskEngine.killReason}`;
        }

        // ─── [14] EXECUTION TYPE ANNOTATION ───
        let v4ExecutionType = 'NONE';
        if (v4Result.v4Signal.includes('CONFIRMED')) {
            v4ExecutionType = retest.retested ? 'MARKET_AFTER_RETEST' : 'LIMIT_ON_RETEST';
        } else if (v4Result.v4Signal.includes('AGUARDAR')) {
            v4ExecutionType = 'WAIT';
        }

        // ─── [15] COLLECTIVE (async, non-blocking) ───
        let collectiveStats = null;
        try {
            const [stats] = await Promise.all([
                fetchCollectiveStats(symbol).catch(() => null),
                submitToBackend().catch(() => ({ submitted: 0 }))
            ]);
            collectiveStats = stats;
        } catch {}

        // SOFT: collective consensus
        if (collectiveStats?.consensusSignal === v4Result.v4Signal && collectiveStats?.consensusConfidence > 60) {
            softAdjustments.push({ source: 'collective', adj: +5, reason: '🤝 Consenso coletivo alinhado' });
        }

        // ─── [16] TRACK & EVALUATE ───
        trackReactiveSignal(symbol, v4Result, v3Analysis);
        const reactivePerf = evaluateReactiveSignals(symbol, currentPrice);

        if (v4Result.v4Signal !== 'NEUTRO') {
            queueTradeForBackend(symbol, v4Result, v3Analysis);
        }

        // ─── [17] BOT WEBHOOK ───
        const botWebhook = generateBotWebhook(v4Result, retest.limitOrder, riskEngine, symbol);

        // ─── [18] BTC ALIGNMENT (async) ───
        let btcAlignment = null;
        try {
            btcAlignment = await analyzeBtcAlignment(rawData, intendedDir, symbol);
        } catch (e) {
            btcAlignment = { available: false, alignment: 'UNKNOWN', correlation: 0, risk: 'UNKNOWN', details: 'Erro ao buscar BTC' };
        }

        // ─── [18b] MACRO REGIME + SYSTEMIC RISK + MACRO LIQUIDITY (async) ───
        let macroRegime = null;
        let systemicRisk = null;
        let macroLiquidity = null;
        try {
            const [mr, sr, ml] = await Promise.all([
                fetchMacroRegime().catch(() => null),
                fetchSystemicRisk().catch(() => null),
                calculateMacroLiquidity().catch(() => null)
            ]);
            macroRegime = mr;
            systemicRisk = sr;
            macroLiquidity = ml;
        } catch {}

        // HARD: Systemic risk CRITICAL blocks signals
        if (systemicRisk && systemicRisk.level === 'CRITICAL' && v4Result.v4Signal.includes('CONFIRMED')) {
            v4Result.v4Signal = 'AGUARDAR_' + (v4Result.intendedDirection || 'LONG');
            v4Result.v4SignalType = 'aguardar';
            v4Result.actionMessage += `\n🌊 RISCO SISTÊMICO CRÍTICO (corr: ${(systemicRisk.avg_correlation || 0).toFixed(2)}) — operações bloqueadas.`;
        }
        // SOFT: systemic risk penalty
        if (systemicRisk && systemicRisk.risk_multiplier && systemicRisk.risk_multiplier < 1.0) {
            const sysAdj = Math.round((systemicRisk.risk_multiplier - 1.0) * 30); // e.g. 0.8 → -6
            softAdjustments.push({ source: 'systemicRisk', adj: sysAdj, reason: `⚠️ Risco sistêmico ${systemicRisk.level} (×${systemicRisk.risk_multiplier.toFixed(2)})` });
        }

        // SOFT: macro regime
        if (macroRegime && macroRegime.regime === 'MACRO_RISK_OFF' && v4Result.v4Signal.includes('LONG')) {
            softAdjustments.push({ source: 'macroRegime', adj: -10, reason: '📉 Macro RISK OFF — longs penalizados' });
        }

        // SOFT: macro liquidity
        if (macroLiquidity?.available && macroLiquidity.adjustment !== 0) {
            softAdjustments.push({ source: 'macroLiquidity', adj: macroLiquidity.adjustment, reason: `${macroLiquidity.icon} Liquidez macro ${macroLiquidity.trend}` });
        }

        // ═══════ APPLY ALL SOFT ADJUSTMENTS WITH CAP ═══════
        const SOFT_ADJ_CAP = 25; // max ±25 total from all soft adjustments
        const totalPositive = softAdjustments.filter(a => a.adj > 0).reduce((s, a) => s + a.adj, 0);
        const totalNegative = softAdjustments.filter(a => a.adj < 0).reduce((s, a) => s + a.adj, 0);
        const rawSoftTotal = totalPositive + totalNegative;
        const cappedSoftTotal = clamp(rawSoftTotal, -SOFT_ADJ_CAP, SOFT_ADJ_CAP);

        if (cappedSoftTotal !== 0) {
            v4Result.v4Confidence = clamp(v4Result.v4Confidence + cappedSoftTotal, 10, 100);
        }

        // Build adjustment summary message
        const activeAdjs = softAdjustments.filter(a => a.adj !== 0);
        if (activeAdjs.length > 0) {
            const adjSummary = activeAdjs.map(a => `${a.adj > 0 ? '+' : ''}${a.adj} ${a.source}`).join(', ');
            v4Result.actionMessage += `\n📊 Ajustes (${cappedSoftTotal > 0 ? '+' : ''}${cappedSoftTotal}${rawSoftTotal !== cappedSoftTotal ? ' cap de ±' + SOFT_ADJ_CAP : ''}): ${adjSummary}`;
        }

        // Store soft adjustments in result for transparency
        v4Result.softAdjustments = {
            adjustments: softAdjustments,
            rawTotal: rawSoftTotal,
            cappedTotal: cappedSoftTotal,
            cap: SOFT_ADJ_CAP
        };

        // ─── [18c] DYNAMIC THRESHOLDS (async, non-blocking) ───
        let dynamicThresholds = null;
        try {
            dynamicThresholds = await fetchDynamicThresholds(symbol);
        } catch {}

        // ─── [18d] EXPECTANCY (async, non-blocking) ───
        let expectancy = null;
        const fingerprint = getSetupFingerprint(
            enhancedRegimeV4?.regime,
            oiAnalysis?.signal,
            v3Analysis.cvdAdvanced?.signal,
            displacement1h?.detected ? displacement1h.direction : (displacement4h?.detected ? displacement4h.direction : null)
        );
        try {
            expectancy = await fetchSetupExpectancy(symbol, fingerprint?.fingerprint || 'unknown');
        } catch {}

        // ─── [19] SCORE PERCENTILE ───
        updateScoreHistory(symbol, v4Result.v4Confidence, v4Result.gateScore, v4Result.passedCount, v4Result.totalGates);
        const scorePercentile = getScorePercentile(symbol, v4Result.v4Confidence);

        // ─── [20] SETUP FINGERPRINT (already computed above for expectancy) ───
        const setupFingerprint = fingerprint;
        const setupStats = getSetupStats(setupFingerprint);

        // ─── [21] SUMMARY ───
        const reactiveSummary = generateReactiveSummary(
            v4Result, squeezeState, collectiveStats, reactivePerf,
            sessionContext, retest.limitOrder, riskEngine, microstructure, modelStability
        );

        // ─── [22] v7.2: DYNAMIC EXIT PLAN (#12) ───
        const dynamicExitPlan = generateDynamicExitPlan({
            currentPrice,
            atr,
            direction: v4Result.intendedDirection,
            liquidityLevels,
            volRegime: volRegimeShift.shift,
            riskEngine
        });

        // ─── BUILD RESULT ───
        return {
            ...v3Analysis,

            // Real CVD data
            realtimeCVD: window.RealtimeCVD ? window.RealtimeCVD.getFullCVDAnalysis(symbol) : null,

            // V4 Signal (overrides V3)
            v4Signal: v4Result.v4Signal,
            v4SignalType: v4Result.v4SignalType,
            v4Confidence: v4Result.v4Confidence,
            v4Probability: v4Result.v4Probability,
            v4ActionMessage: v4Result.actionMessage,
            v4ActionIcon: v4Result.actionIcon,
            v4GateScore: v4Result.gateScore,
            v4GatesTotal: v4Result.totalGates,
            v4GatesPassed: v4Result.passedCount,
            v4Gates: v4Result.gates,
            v4Reasoning: v4Result.reasoning,
            v4ExecutionType,

            // Regime-adaptive info
            v4RegimeKey: v4Result.regimeKey,
            v4MinGatesRequired: v4Result.minGatesRequired,
            v4MinScoreRequired: v4Result.minScoreRequired,
            v4IsCounterTrend: v4Result.isCounterTrend,

            // Module results
            displacement: {
                '1h': displacement1h, '4h': displacement4h,
                detected: displacement1h.detected || displacement4h.detected,
                direction: displacement1h.detected ? displacement1h.direction : displacement4h.direction,
                strength: Math.max(displacement1h.strength, displacement4h.strength)
            },
            volumeExpansion: {
                '1h': volumeExpansion1h, '4h': volumeExpansion4h,
                expanding: volumeExpansion1h.expanding || volumeExpansion4h.expanding,
                sustained: volumeExpansion1h.sustained || volumeExpansion4h.sustained,
                direction: volumeExpansion1h.direction || volumeExpansion4h.direction
            },
            rangePosition,
            fundingFilter,
            retest: { retested: retest.retested, retestQuality: retest.retestQuality, retestPrice: retest.retestPrice, details: retest.details },
            limitOrder: retest.limitOrder,
            squeezeState,
            sessionContext,
            microstructure,
            riskEngine,
            modelStability,
            collectiveStats,
            reactivePerf,
            botWebhook,
            reactiveSummary,

            // New modules
            dataIntegrity,
            oiAnalysis,
            antiSpoof,
            enhancedRegimeV4,

            // V5 modules
            btcAlignment,
            scorePercentile,
            setupFingerprint,
            setupStats,
            regimeQuality,
            saturation,

            // V6 modules
            macroRegime,
            systemicRisk,
            dynamicThresholds,
            expectancy,
            calibratedConfidence: v4Result.calibratedConfidence,
            structureScore: v4Result.structureScore,
            timingScore: v4Result.timingScore,
            timingAdvice: v4Result.timingAdvice,
            entryScore: v4Result.entryScore,
            continuationScore: v4Result.continuationScore,
            suggestedRR: v4Result.suggestedRR,

            // V6.1 modules
            volRegimeShift,
            marketBreadth,
            macroLiquidity,

            // v7.1 modules
            signalConflict: v4Result.signalConflict,
            mtfAnalysis,

            // v7.2 modules
            liquidityLevels,
            hiddenDivergence,
            signalTTL,
            dynamicExitPlan,
            liquidationZones,
            orderFlow,
            softAdjustments: v4Result.softAdjustments,

            // Timing
            v4ProcessingTime: Date.now() - startTime
        };
    }

    // ═══════════════════════════════════════════════════════════════
    // MODULE 28: MULTI-TIMEFRAME ANALYSIS (v7.1 — TPE)
    // ═══════════════════════════════════════════════════════════════
    /**
     * Analyzes trend alignment across 4 timeframes (15m, 1h, 4h, 1d).
     * - Computes EMA trend direction per TF
     * - Measures RSI per TF
     * - Returns alignment score and per-TF breakdown
     * - Adds confidence modifier based on alignment quality
     */
    function analyzeMultiTimeframe(rawData) {
        // Calcular volatilidade por timeframe para pesos adaptativos
        function calcTfVolatility(klines) {
            if (!klines || klines.length < 20) return 0;
            const closes = klines.slice(-20).map(k => parseFloat(k[4]));
            const returns = [];
            for (let i = 1; i < closes.length; i++) {
                returns.push(Math.abs((closes[i] - closes[i-1]) / closes[i-1]));
            }
            return returns.reduce((s, r) => s + r, 0) / returns.length;
        }
        
        const vol15m = calcTfVolatility(rawData.klines15m);
        const vol1h = calcTfVolatility(rawData.klines1h);
        const vol4h = calcTfVolatility(rawData.klines4h);
        const vol1d = calcTfVolatility(rawData.klines1d);
        
        // Inverso normalizado: menos vol = mais confiável para trend
        const totalVol = (vol15m || 0.001) + (vol1h || 0.001) + (vol4h || 0.001) + (vol1d || 0.001);
        const invVol15m = totalVol / Math.max(vol15m, 0.0001);
        const invVol1h = totalVol / Math.max(vol1h, 0.0001);
        const invVol4h = totalVol / Math.max(vol4h, 0.0001);
        const invVol1d = totalVol / Math.max(vol1d, 0.0001);
        const totalInv = invVol15m + invVol1h + invVol4h + invVol1d;
        
        // 70% peso base + 30% adaptativo por volatilidade
        const baseW = { '15m': 0.15, '1h': 0.30, '4h': 0.30, '1d': 0.25 };
        const adaptW = {
            '15m': invVol15m / totalInv,
            '1h': invVol1h / totalInv,
            '4h': invVol4h / totalInv,
            '1d': invVol1d / totalInv
        };
        const fw = (k) => 0.7 * baseW[k] + 0.3 * adaptW[k];
        
        const timeframes = [
            { key: '15m', data: rawData.klines15m, weight: fw('15m') },
            { key: '1h',  data: rawData.klines1h,  weight: fw('1h') },
            { key: '4h',  data: rawData.klines4h,  weight: fw('4h') },
            { key: '1d',  data: rawData.klines1d,  weight: fw('1d') },
        ];

        const results = [];
        let totalWeight = 0;
        let bullishWeight = 0;
        let bearishWeight = 0;

        for (const tf of timeframes) {
            if (!tf.data || tf.data.length < 20) {
                results.push({ tf: tf.key, available: false, trend: 'NEUTRAL', rsi: 50, ema20: 0, ema50: 0, price: 0 });
                continue;
            }

            const closes = tf.data.map(k => parseFloat(k[4]));
            const price = closes[closes.length - 1];
            const ema20 = _ema(closes, 20);
            const ema50 = _ema(closes, Math.min(50, closes.length));

            // RSI 14
            let gains = 0, losses = 0;
            const rsiSlice = closes.slice(-15);
            for (let i = 1; i < rsiSlice.length; i++) {
                const d = rsiSlice[i] - rsiSlice[i - 1];
                if (d > 0) gains += d; else losses += Math.abs(d);
            }
            const avgGain = gains / 14;
            const avgLoss = losses / 14;
            const rsi = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));

            // Determine trend
            let trend = 'NEUTRAL';
            if (price > ema20 && ema20 > ema50) trend = 'BULLISH';
            else if (price < ema20 && ema20 < ema50) trend = 'BEARISH';
            else if (price > ema20) trend = 'WEAK_BULL';
            else if (price < ema20) trend = 'WEAK_BEAR';

            const isBullish = trend === 'BULLISH' || trend === 'WEAK_BULL';
            const isBearish = trend === 'BEARISH' || trend === 'WEAK_BEAR';
            const strength = trend.includes('WEAK') ? 0.5 : 1.0;

            totalWeight += tf.weight;
            if (isBullish) bullishWeight += tf.weight * strength;
            if (isBearish) bearishWeight += tf.weight * strength;

            results.push({
                tf: tf.key,
                available: true,
                trend,
                rsi: +rsi.toFixed(1),
                ema20: +ema20.toFixed(2),
                ema50: +ema50.toFixed(2),
                price: +price.toFixed(2)
            });
        }

        // Alignment score: 0 (fully conflicting) to 100 (fully aligned)
        const bullScore = totalWeight > 0 ? (bullishWeight / totalWeight) * 100 : 50;
        const bearScore = totalWeight > 0 ? (bearishWeight / totalWeight) * 100 : 50;
        const alignmentScore = Math.max(bullScore, bearScore);
        const dominantDirection = bullScore > bearScore ? 'BULLISH' : bearScore > bullScore ? 'BEARISH' : 'NEUTRAL';
        const alignedCount = results.filter(r => r.available && (
            (dominantDirection === 'BULLISH' && (r.trend === 'BULLISH' || r.trend === 'WEAK_BULL')) ||
            (dominantDirection === 'BEARISH' && (r.trend === 'BEARISH' || r.trend === 'WEAK_BEAR'))
        )).length;
        const totalAvailable = results.filter(r => r.available).length;

        // Confidence modifier: +5 if 4/4 aligned, -5 if 1/4 or 0/4
        let confidenceModifier = 0;
        if (alignedCount === totalAvailable && totalAvailable >= 3) confidenceModifier = 5;
        else if (alignedCount <= 1 && totalAvailable >= 3) confidenceModifier = -5;

        return {
            available: totalAvailable >= 2,
            timeframes: results,
            dominantDirection,
            alignmentScore: +alignmentScore.toFixed(0),
            alignedCount,
            totalAvailable,
            confidenceModifier,
            adaptiveWeights: { '15m': timeframes[0].weight.toFixed(2), '1h': timeframes[1].weight.toFixed(2), '4h': timeframes[2].weight.toFixed(2), '1d': timeframes[3].weight.toFixed(2) },
            summary: `${alignedCount}/${totalAvailable} TFs ${dominantDirection.toLowerCase()} (${alignmentScore.toFixed(0)}%)`,
            icon: alignedCount === totalAvailable ? '🎯' : alignedCount >= totalAvailable * 0.5 ? '⚡' : '⚠️'
        };
    }

    // ═══════════════════════════════════════════════════════════════
    // MODULE 29: LIQUIDITY LEVELS ANALYSIS (v7.2 — #9)
    // ═══════════════════════════════════════════════════════════════
    /**
     * Identifies price levels where liquidity is likely pooled
     * (clustering of swing highs/lows = stop losses = targets for MMs).
     */
    function analyzeLiquidityLevels(rawData, currentPrice) {
        const result = { available: false, levels: [], nearestAbove: null, nearestBelow: null, score: 0 };
        try {
            const klines = rawData?.klines1h || rawData?.klines4h;
            if (!klines || klines.length < 50) return result;

            const highs = klines.map(k => parseFloat(k[2]));
            const lows = klines.map(k => parseFloat(k[3]));

            // Find swing highs and lows (local extrema in 5-candle window)
            const swingHighs = [];
            const swingLows = [];
            for (let i = 2; i < highs.length - 2; i++) {
                if (highs[i] > highs[i-1] && highs[i] > highs[i-2] && highs[i] > highs[i+1] && highs[i] > highs[i+2]) {
                    swingHighs.push(highs[i]);
                }
                if (lows[i] < lows[i-1] && lows[i] < lows[i-2] && lows[i] < lows[i+1] && lows[i] < lows[i+2]) {
                    swingLows.push(lows[i]);
                }
            }

            // Cluster nearby levels (within 0.3% of each other)
            function clusterLevels(levels) {
                if (levels.length === 0) return [];
                const sorted = [...levels].sort((a, b) => a - b);
                const clusters = [];
                let current = [sorted[0]];
                for (let i = 1; i < sorted.length; i++) {
                    if ((sorted[i] - current[0]) / current[0] < 0.003) {
                        current.push(sorted[i]);
                    } else {
                        clusters.push({ price: current.reduce((a, b) => a + b, 0) / current.length, touches: current.length });
                        current = [sorted[i]];
                    }
                }
                clusters.push({ price: current.reduce((a, b) => a + b, 0) / current.length, touches: current.length });
                return clusters.filter(c => c.touches >= 2).sort((a, b) => b.touches - a.touches);
            }

            const highClusters = clusterLevels(swingHighs);
            const lowClusters = clusterLevels(swingLows);
            const allLevels = [
                ...highClusters.map(c => ({ ...c, type: 'RESISTANCE', side: 'ABOVE' })),
                ...lowClusters.map(c => ({ ...c, type: 'SUPPORT', side: 'BELOW' }))
            ].sort((a, b) => b.touches - a.touches).slice(0, 10);

            const above = allLevels.filter(l => l.price > currentPrice).sort((a, b) => a.price - b.price);
            const below = allLevels.filter(l => l.price < currentPrice).sort((a, b) => b.price - a.price);

            // Score: how close is price to a high-liquidity zone?
            let proximityScore = 0;
            const nearest = [...above.slice(0, 1), ...below.slice(0, 1)];
            for (const level of nearest) {
                const dist = Math.abs(level.price - currentPrice) / currentPrice;
                if (dist < 0.005) proximityScore += level.touches * 3; // very close
                else if (dist < 0.01) proximityScore += level.touches * 2;
                else if (dist < 0.02) proximityScore += level.touches;
            }

            result.available = allLevels.length > 0;
            result.levels = allLevels;
            result.nearestAbove = above[0] || null;
            result.nearestBelow = below[0] || null;
            result.score = clamp(proximityScore, 0, 20);
            result.details = allLevels.length > 0
                ? `${allLevels.length} níveis de liquidez. Mais próx: ${above[0] ? '$' + above[0].price.toFixed(0) + '↑' : '-'} / ${below[0] ? '$' + below[0].price.toFixed(0) + '↓' : '-'}`
                : 'Sem níveis de liquidez claros.';
        } catch (e) {
            result.details = 'Erro analisando liquidez.';
        }
        return result;
    }

    // ═══════════════════════════════════════════════════════════════
    // MODULE 30: HIDDEN DIVERGENCE DETECTION (v7.2 — #10)
    // ═══════════════════════════════════════════════════════════════
    /**
     * Detects hidden divergences between price and RSI/CVD.
     * Hidden bull div: price makes higher low, RSI/CVD makes lower low → continuation up
     * Hidden bear div: price makes lower high, RSI/CVD makes higher high → continuation down
     */
    function detectHiddenDivergence(rawData) {
        const result = { detected: false, type: null, strength: 0, details: 'Sem divergência oculta' };
        try {
            const klines = rawData?.klines1h;
            if (!klines || klines.length < 30) return result;

            const closes = klines.slice(-30).map(k => parseFloat(k[4]));
            const volumes = klines.slice(-30).map(k => parseFloat(k[5]));

            // Calculate RSI values for windows
            function calcRSI(data, period) {
                if (data.length < period + 1) return 50;
                let gains = 0, losses = 0;
                for (let i = data.length - period; i < data.length; i++) {
                    const d = data[i] - data[i - 1];
                    if (d > 0) gains += d; else losses += Math.abs(d);
                }
                const rs = (gains / period) / (Math.max(losses, 0.0001) / period);
                return 100 - 100 / (1 + rs);
            }

            // Use two windows: recent 10 vs previous 10
            const priceLow1 = Math.min(...closes.slice(5, 15));
            const priceLow2 = Math.min(...closes.slice(18, 28));
            const priceHigh1 = Math.max(...closes.slice(5, 15));
            const priceHigh2 = Math.max(...closes.slice(18, 28));

            const rsi1 = calcRSI(closes.slice(0, 15), 14);
            const rsi2 = calcRSI(closes.slice(13, 28), 14);

            // Hidden bullish: price HL, RSI LL
            if (priceLow2 > priceLow1 && rsi2 < rsi1) {
                result.detected = true;
                result.type = 'HIDDEN_BULL';
                result.strength = clamp(Math.round((priceLow2 - priceLow1) / priceLow1 * 1000), 1, 10);
                result.details = `Divergência oculta BULL: preço HL, RSI LL → continuação up`;
            }
            // Hidden bearish: price LH, RSI HH
            else if (priceHigh2 < priceHigh1 && rsi2 > rsi1) {
                result.detected = true;
                result.type = 'HIDDEN_BEAR';
                result.strength = clamp(Math.round((priceHigh1 - priceHigh2) / priceHigh1 * 1000), 1, 10);
                result.details = `Divergência oculta BEAR: preço LH, RSI HH → continuação down`;
            }
        } catch (e) {}
        return result;
    }

    // ═══════════════════════════════════════════════════════════════
    // MODULE 31: SIGNAL TTL (v7.2 — #11)
    // ═══════════════════════════════════════════════════════════════
    /**
     * Tracks signal "freshness". Confirmed signals have a TTL (time to live).
     * If the signal stays the same for too long without execution, it decays.
     * Returns remaining validity and confidence decay factor.
     */
    const SIGNAL_TTL_STORE = STORAGE_PREFIX + 'signal_ttl_';
    const SIGNAL_TTL_MAX_MS = 4 * 60 * 60 * 1000; // 4 hours max for a confirmed signal
    const SIGNAL_TTL_DECAY_START = 2 * 60 * 60 * 1000; // decay starts after 2h

    function checkSignalTTL(symbol, currentSignal) {
        const key = SIGNAL_TTL_STORE + symbol;
        const stored = safeGet(key);
        const now = Date.now();

        // If signal changed → reset TTL
        if (!stored || stored.signal !== currentSignal) {
            const entry = { signal: currentSignal, createdAt: now, lastChecked: now };
            safeSet(key, entry);
            return { expired: false, age: 0, decayFactor: 1.0, remaining: SIGNAL_TTL_MAX_MS, details: 'Sinal fresco' };
        }

        const age = now - stored.createdAt;
        stored.lastChecked = now;
        safeSet(key, stored);

        if (age > SIGNAL_TTL_MAX_MS) {
            return { expired: true, age, decayFactor: 0, remaining: 0, details: `Sinal expirado (${(age / 3600000).toFixed(1)}h). Reavaliar.` };
        }

        let decayFactor = 1.0;
        if (age > SIGNAL_TTL_DECAY_START) {
            // Linear decay from 1.0 to 0.3 between DECAY_START and MAX
            const decayProgress = (age - SIGNAL_TTL_DECAY_START) / (SIGNAL_TTL_MAX_MS - SIGNAL_TTL_DECAY_START);
            decayFactor = Math.max(0.3, 1.0 - decayProgress * 0.7);
        }

        return {
            expired: false,
            age,
            decayFactor: +decayFactor.toFixed(2),
            remaining: SIGNAL_TTL_MAX_MS - age,
            details: decayFactor < 1.0 ? `Sinal envelhecendo (${(age / 3600000).toFixed(1)}h, fator ${decayFactor.toFixed(2)})` : 'Sinal válido'
        };
    }

    // ═══════════════════════════════════════════════════════════════
    // MODULE 32: DYNAMIC EXIT PLAN (v7.2 — #12)
    // ═══════════════════════════════════════════════════════════════
    /**
     * Generates an exit plan based on market structure:
     * - TP1: nearest liquidity level or 1R
     * - TP2: next liquidity level or 2R
     * - TP3: structure target or 3R
     * - Trailing stop: ATR-based dynamic (tighter in low vol, wider in high vol)
     */
    function generateDynamicExitPlan(params) {
        const { currentPrice, atr, direction, liquidityLevels, volRegime, riskEngine } = params;
        if (!currentPrice || !atr || atr <= 0) {
            return { available: false, details: 'Dados insuficientes para exit plan' };
        }

        const isLong = direction === 'LONG';
        const stopLoss = isLong ? currentPrice - atr * 1.5 : currentPrice + atr * 1.5;
        const riskDistance = Math.abs(currentPrice - stopLoss);

        // TP targets
        const tp1 = isLong ? currentPrice + riskDistance * 1.0 : currentPrice - riskDistance * 1.0;
        const tp2 = isLong ? currentPrice + riskDistance * 2.0 : currentPrice - riskDistance * 2.0;
        const tp3 = isLong ? currentPrice + riskDistance * 3.0 : currentPrice - riskDistance * 3.0;

        // Adjust TPs to liquidity levels if available
        let structuredTp1 = tp1, structuredTp2 = tp2;
        if (liquidityLevels?.available) {
            const targets = isLong
                ? (liquidityLevels.levels || []).filter(l => l.price > currentPrice).sort((a, b) => a.price - b.price)
                : (liquidityLevels.levels || []).filter(l => l.price < currentPrice).sort((a, b) => b.price - a.price);

            if (targets[0] && Math.abs(targets[0].price - tp1) / currentPrice < 0.02) {
                structuredTp1 = targets[0].price;
            }
            if (targets[1] && Math.abs(targets[1].price - tp2) / currentPrice < 0.04) {
                structuredTp2 = targets[1].price;
            }
        }

        // Trailing stop multiplier based on vol regime
        let trailingMultiplier = 2.0;
        if (volRegime === 'EXPLOSIVE') trailingMultiplier = 3.0;
        else if (volRegime === 'COMPRESSED') trailingMultiplier = 1.5;

        return {
            available: true,
            stopLoss: +stopLoss.toFixed(2),
            tp1: +structuredTp1.toFixed(2),
            tp2: +structuredTp2.toFixed(2),
            tp3: +tp3.toFixed(2),
            riskDistance: +riskDistance.toFixed(2),
            trailingStop: {
                type: 'ATR_TRAILING',
                multiplier: trailingMultiplier,
                initialDistance: +(atr * trailingMultiplier).toFixed(2)
            },
            sizing: {
                tp1Pct: 40, // close 40% at TP1
                tp2Pct: 30, // close 30% at TP2
                tp3Pct: 30  // run 30% to TP3 with trailing
            },
            details: `SL $${stopLoss.toFixed(0)} | TP1 $${structuredTp1.toFixed(0)} (1R) | TP2 $${structuredTp2.toFixed(0)} (2R) | TP3 $${tp3.toFixed(0)} (3R) | Trail ${trailingMultiplier}×ATR`
        };
    }

    // ═══════════════════════════════════════════════════════════════
    // MODULE 33: LIQUIDATION ZONES ESTIMATION (v7.2 — #14)
    // ═══════════════════════════════════════════════════════════════
    /**
     * Estimates where leveraged liquidations are clustered based on
     * recent price extremes and common leverage levels (5x, 10x, 25x, 50x).
     */
    function estimateLiquidationZones(rawData, currentPrice) {
        const result = { available: false, zones: [], nearestLong: null, nearestShort: null };
        try {
            const klines = rawData?.klines4h || rawData?.klines1h;
            if (!klines || klines.length < 20 || !currentPrice) return result;

            const closes = klines.slice(-20).map(k => parseFloat(k[4]));
            const recentHigh = Math.max(...closes);
            const recentLow = Math.min(...closes);

            const leverages = [5, 10, 25, 50];
            const zones = [];

            // Long liquidation zones (below current price where longs opened at highs get liq'd)
            for (const lev of leverages) {
                const liqPrice = recentHigh * (1 - 1 / lev); // approximate liq price for long at peak
                if (liqPrice > 0 && liqPrice < currentPrice) {
                    zones.push({
                        price: +liqPrice.toFixed(2),
                        leverage: lev,
                        side: 'LONG_LIQ',
                        distance: +((currentPrice - liqPrice) / currentPrice * 100).toFixed(2),
                        details: `Liquidação de longs ${lev}× abertos em $${recentHigh.toFixed(0)}`
                    });
                }
            }

            // Short liquidation zones (above current price where shorts opened at lows get liq'd)
            for (const lev of leverages) {
                const liqPrice = recentLow * (1 + 1 / lev); // approximate
                if (liqPrice > currentPrice) {
                    zones.push({
                        price: +liqPrice.toFixed(2),
                        leverage: lev,
                        side: 'SHORT_LIQ',
                        distance: +((liqPrice - currentPrice) / currentPrice * 100).toFixed(2),
                        details: `Liquidação de shorts ${lev}× abertos em $${recentLow.toFixed(0)}`
                    });
                }
            }

            zones.sort((a, b) => a.distance - b.distance);
            const longLiqs = zones.filter(z => z.side === 'LONG_LIQ');
            const shortLiqs = zones.filter(z => z.side === 'SHORT_LIQ');

            result.available = zones.length > 0;
            result.zones = zones;
            result.nearestLong = longLiqs[0] || null;
            result.nearestShort = shortLiqs[0] || null;
            result.details = `${zones.length} zonas de liquidação mapeadas.`;
        } catch (e) {
            result.details = 'Erro estimando zonas de liquidação.';
        }
        return result;
    }

    // ═══════════════════════════════════════════════════════════════
    // MODULE 34: ORDER FLOW RING BUFFER (v7.2 — #15)
    // ═══════════════════════════════════════════════════════════════
    /**
     * WebSocket-based order flow aggregation using a fixed-size ring buffer.
     * Tracks aggressive buy/sell pressure imbalance in real-time.
     * buffer size = 500 trades, auto-connects via Binance aggTrade WS.
     */
    const ORDER_FLOW_BUFFERS = {};
    const ORDER_FLOW_BUFFER_SIZE = 500;

    function getOrderFlowBuffer(symbol) {
        if (!ORDER_FLOW_BUFFERS[symbol]) {
            ORDER_FLOW_BUFFERS[symbol] = {
                buffer: [],
                head: 0,
                count: 0,
                totalBuyVol: 0,
                totalSellVol: 0,
                wsConnected: false,
                lastUpdate: 0
            };
        }
        return ORDER_FLOW_BUFFERS[symbol];
    }

    function pushToOrderFlowBuffer(symbol, trade) {
        const buf = getOrderFlowBuffer(symbol);
        const vol = parseFloat(trade.q) || 0;
        const isBuy = !trade.m; // m=true means maker was buyer, so taker was seller

        // If buffer is full, remove the oldest entry's contribution
        if (buf.count >= ORDER_FLOW_BUFFER_SIZE) {
            const oldest = buf.buffer[buf.head];
            if (oldest) {
                if (oldest.isBuy) buf.totalBuyVol -= oldest.vol;
                else buf.totalSellVol -= oldest.vol;
            }
        }

        buf.buffer[buf.head] = { vol, isBuy, ts: Date.now() };
        buf.head = (buf.head + 1) % ORDER_FLOW_BUFFER_SIZE;
        buf.count = Math.min(buf.count + 1, ORDER_FLOW_BUFFER_SIZE);

        if (isBuy) buf.totalBuyVol += vol;
        else buf.totalSellVol += vol;
        buf.lastUpdate = Date.now();
    }

    function connectOrderFlowWS(symbol) {
        const buf = getOrderFlowBuffer(symbol);
        if (buf.wsConnected) return;

        try {
            const pair = symbol.toLowerCase().replace('/', '');
            const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${pair}@aggTrade`);
            ws.onmessage = (event) => {
                try {
                    const trade = JSON.parse(event.data);
                    pushToOrderFlowBuffer(symbol, trade);
                } catch (e) {}
            };
            ws.onopen = () => { buf.wsConnected = true; };
            ws.onclose = () => {
                buf.wsConnected = false;
                // Auto-reconnect after 5s
                setTimeout(() => connectOrderFlowWS(symbol), 5000);
            };
            ws.onerror = () => { ws.close(); };
        } catch (e) {
            console.warn('[V4] OrderFlow WS error:', e.message);
        }
    }

    function getOrderFlowAnalysis(symbol) {
        const buf = getOrderFlowBuffer(symbol);
        if (buf.count < 50) {
            return { available: false, imbalance: 0, pressure: 'NEUTRAL', details: 'Dados insuficientes (min 50 trades)' };
        }

        const totalVol = buf.totalBuyVol + buf.totalSellVol;
        if (totalVol <= 0) return { available: false, imbalance: 0, pressure: 'NEUTRAL', details: 'Volume zero' };

        const buyPct = (buf.totalBuyVol / totalVol) * 100;
        const sellPct = (buf.totalSellVol / totalVol) * 100;
        const imbalance = buyPct - sellPct; // positive = buy pressure

        let pressure = 'NEUTRAL';
        if (imbalance > 15) pressure = 'STRONG_BUY';
        else if (imbalance > 5) pressure = 'BUY';
        else if (imbalance < -15) pressure = 'STRONG_SELL';
        else if (imbalance < -5) pressure = 'SELL';

        const staleness = Date.now() - buf.lastUpdate;
        const isStale = staleness > 30000; // >30s without update

        return {
            available: !isStale,
            imbalance: +imbalance.toFixed(1),
            buyPct: +buyPct.toFixed(1),
            sellPct: +sellPct.toFixed(1),
            pressure,
            tradesInBuffer: buf.count,
            staleness,
            icon: pressure.includes('BUY') ? '🟢' : pressure.includes('SELL') ? '🔴' : '⚪',
            details: isStale
                ? `Order flow stale (${(staleness / 1000).toFixed(0)}s sem update)`
                : `Buy ${buyPct.toFixed(0)}% / Sell ${sellPct.toFixed(0)}% (${buf.count} trades, imb: ${imbalance > 0 ? '+' : ''}${imbalance.toFixed(1)}%)`
        };
    }

    // ═══════════════════════════════════════════════════════════════
    // EXPORT
    // ═══════════════════════════════════════════════════════════════
    window.TAEngineV4 = {
        // Core
        enhanceWithReactive,

        // Modules
        computeZScoreContext,
        getSessionContext,
        detectDisplacement,
        detectVolumeExpansion,
        detectRangePosition,
        detectRetestAndGenerateOrder,
        checkFundingFilter,
        detectMicrostructure,
        detectSqueezeExpansion,
        evaluateReactiveGates,
        calculateRisk,
        updateRiskState,
        checkModelStability,
        trackReactiveSignal,
        evaluateReactiveSignals,
        generateBotWebhook,
        generateReactiveSummary,

        // New modules
        checkDataIntegrity,
        analyzeOpenInterest,
        detectSpoofing,
        computeEnhancedRegime,

        // V5 modules
        analyzeBtcAlignment,
        updateScoreHistory,
        getScorePercentile,
        getSetupFingerprint,
        getSetupStats,
        recordSetupOutcome,
        classifyRegimeQuality,
        measureSaturation,
        getNotificationConfig,
        setNotificationConfig,
        checkNotificationTriggers,

        // V6 modules
        fetchDynamicThresholds,
        getDynamicThreshold,
        fetchMacroRegime,
        fetchSystemicRisk,
        fetchSetupExpectancy,
        getGateWeightsForRegime,
        applyRedundancyPenalty,
        calibrateConfidence,
        sigmoid,
        getConfidenceThreshold,
        setConfidenceThreshold,
        registerFcmToken,
        unregisterFcmToken,

        // V6.1 modules
        detectVolatilityRegimeShift,
        calculateMarketBreadth,
        calculateMacroLiquidity,

        // v7.1 modules
        analyzeMultiTimeframe,

        // v7.2 modules
        scoreBosGate,
        detectAcceptance,
        analyzeLiquidityLevels,
        detectHiddenDivergence,
        checkSignalTTL,
        generateDynamicExitPlan,
        estimateLiquidationZones,
        connectOrderFlowWS,
        getOrderFlowAnalysis,
        getOrderFlowBuffer,
        isNotificationOnCooldown,
        markNotificationSent,

        // Collective
        fetchCollectiveStats,
        fetchCollectiveWeights,
        submitToBackend,
        queueTradeForBackend,
        getDeviceHash,

        // Version
        VERSION
    };
})();
