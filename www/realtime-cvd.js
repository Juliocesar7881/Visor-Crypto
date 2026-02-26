/**
 * ═══════════════════════════════════════════════════════════════════
 *  VISOR CRYPTO — REAL-TIME CVD ENGINE (Binance WebSocket aggTrade)
 * ═══════════════════════════════════════════════════════════════════
 *
 *  Calcula CVD real usando trades individuais via WebSocket,
 *  muito mais preciso que estimativa baseada em klines.
 *
 *  Features:
 *   - Conexão WebSocket aggTrade por símbolo
 *   - CVD acumulativo em tempo real (buy vs sell taker volume)
 *   - Detecção de icebergs (volume alto sem movimento de preço)
 *   - Delta de volume em janelas de 1min, 5min, 15min
 *   - Reconexão automática com backoff exponencial
 *   - Cache de dados para uso offline
 */
(function () {
    'use strict';

    // ═══════════════════════════════════════════════════
    // CONFIG
    // ═══════════════════════════════════════════════════
    const WS_BASE_URL = 'wss://stream.binance.com:9443/ws/';
    const MAX_TRADES_BUFFER = 10000;     // Máximo de trades armazenados
    const ICEBERG_VOLUME_MULT = 5;       // Volume > 5x média = potencial iceberg
    const ICEBERG_PRICE_THRESHOLD = 0.02; // Menos de 0.02% de movimento = absorção
    const RECONNECT_BASE_MS = 2000;
    const RECONNECT_MAX_MS = 60000;
    const CVD_STORAGE_KEY = 'vc_realtime_cvd';

    // ═══════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════
    const connections = {};  // symbol -> { ws, trades, stats, reconnectAttempts }

    // ═══════════════════════════════════════════════════
    // CORE: WebSocket Connection Manager
    // ═══════════════════════════════════════════════════

    function connect(symbol) {
        if (connections[symbol]?.ws?.readyState === WebSocket.OPEN) {
            return; // já conectado
        }

        const lowerSymbol = symbol.toLowerCase();
        const wsUrl = `${WS_BASE_URL}${lowerSymbol}@aggTrade`;

        const state = connections[symbol] || {
            ws: null,
            trades: [],
            stats: createEmptyStats(),
            reconnectAttempts: 0,
            lastUpdate: 0,
            icebergs: []
        };
        connections[symbol] = state;

        try {
            const ws = new WebSocket(wsUrl);
            state.ws = ws;

            ws.onopen = () => {
                state.reconnectAttempts = 0;
            };

            ws.onmessage = (event) => {
                try {
                    const trade = JSON.parse(event.data);
                    processTrade(symbol, trade);
                } catch (e) {
                    // ignore parse errors
                }
            };

            ws.onerror = (err) => {
            };

            ws.onclose = () => {
                // Auto-reconnect com backoff exponencial
                state.reconnectAttempts++;
                const delay = Math.min(
                    RECONNECT_BASE_MS * Math.pow(2, state.reconnectAttempts - 1),
                    RECONNECT_MAX_MS
                );
                setTimeout(() => {
                    // Só reconecta se ainda está na lista de conexões ativas
                    if (connections[symbol] && connections[symbol] === state) {
                        connect(symbol);
                    }
                }, delay);
            };
        } catch (e) {
        }
    }

    function disconnect(symbol) {
        const state = connections[symbol];
        if (state) {
            if (state.ws) {
                state.ws.onclose = null; // evita reconnect
                state.ws.close();
            }
            // Salvar stats antes de desconectar
            saveStats(symbol, state.stats);
            delete connections[symbol];
        }
    }

    function disconnectAll() {
        Object.keys(connections).forEach(sym => disconnect(sym));
    }

    // ═══════════════════════════════════════════════════
    // TRADE PROCESSING
    // ═══════════════════════════════════════════════════

    function processTrade(symbol, trade) {
        const state = connections[symbol];
        if (!state) return;

        const price = parseFloat(trade.p);
        const qty = parseFloat(trade.q);
        const usdVolume = price * qty;
        const isBuy = !trade.m; // m = true means buyer is maker → taker sold (sell)
        const timestamp = trade.T || trade.E || Date.now();

        // Armazenar trade processado
        const processed = {
            price,
            qty,
            usdVolume,
            isBuy,
            timestamp
        };

        state.trades.push(processed);
        state.lastUpdate = Date.now();

        // Limitar buffer
        if (state.trades.length > MAX_TRADES_BUFFER) {
            state.trades = state.trades.slice(-MAX_TRADES_BUFFER);
        }

        // Atualizar stats acumulativos
        if (isBuy) {
            state.stats.totalBuyVolume += usdVolume;
            state.stats.buyCount++;
        } else {
            state.stats.totalSellVolume += usdVolume;
            state.stats.sellCount++;
        }
        state.stats.totalTrades++;
        state.stats.lastPrice = price;

        // Detectar iceberg orders
        detectIceberg(state, processed);
    }

    function detectIceberg(state, trade) {
        // Calcular volume médio dos últimos 100 trades
        const recentTrades = state.trades.slice(-100);
        if (recentTrades.length < 50) return;

        const avgVolume = recentTrades.reduce((s, t) => s + t.usdVolume, 0) / recentTrades.length;

        // Iceberg: volume muito acima da média mas preço não se moveu
        if (trade.usdVolume > avgVolume * ICEBERG_VOLUME_MULT) {
            const pricesBefore = recentTrades.slice(-10, -1).map(t => t.price);
            if (pricesBefore.length > 0) {
                const avgPrice = pricesBefore.reduce((s, p) => s + p, 0) / pricesBefore.length;
                const priceChange = Math.abs((trade.price - avgPrice) / avgPrice) * 100;

                if (priceChange < ICEBERG_PRICE_THRESHOLD) {
                    const iceberg = {
                        timestamp: trade.timestamp,
                        price: trade.price,
                        volume: trade.usdVolume,
                        side: trade.isBuy ? 'BUY' : 'SELL',
                        priceImpact: priceChange,
                        volumeMultiple: (trade.usdVolume / avgVolume).toFixed(1)
                    };
                    state.icebergs.push(iceberg);
                    // Manter últimos 20 icebergs
                    if (state.icebergs.length > 20) {
                        state.icebergs = state.icebergs.slice(-20);
                    }
                }
            }
        }
    }

    // ═══════════════════════════════════════════════════
    // CVD ANALYSIS (Janelas Temporais)
    // ═══════════════════════════════════════════════════

    function createEmptyStats() {
        return {
            totalBuyVolume: 0,
            totalSellVolume: 0,
            buyCount: 0,
            sellCount: 0,
            totalTrades: 0,
            lastPrice: 0,
            connectedAt: Date.now()
        };
    }

    /**
     * Retorna CVD real para uma janela de tempo específica
     * @param {string} symbol
     * @param {number} windowMs - Janela em milissegundos (ex: 60000 = 1min)
     * @returns {{ delta, buyVolume, sellVolume, ratio, trades, trend, confidence }}
     */
    function getCVD(symbol, windowMs) {
        const state = connections[symbol];
        if (!state || state.trades.length === 0) {
            return {
                delta: 0, buyVolume: 0, sellVolume: 0,
                ratio: 0, trades: 0, trend: 'neutral',
                confidence: 0, available: false
            };
        }

        const cutoff = Date.now() - windowMs;
        const windowTrades = state.trades.filter(t => t.timestamp >= cutoff);

        if (windowTrades.length < 10) {
            return {
                delta: 0, buyVolume: 0, sellVolume: 0,
                ratio: 0, trades: windowTrades.length, trend: 'neutral',
                confidence: 0, available: false
            };
        }

        let buyVol = 0, sellVol = 0;
        windowTrades.forEach(t => {
            if (t.isBuy) buyVol += t.usdVolume;
            else sellVol += t.usdVolume;
        });

        const delta = buyVol - sellVol;
        const total = buyVol + sellVol;
        const ratio = total > 0 ? delta / total : 0;

        // Confiança baseada na quantidade de trades
        const confidence = Math.min(100, Math.round((windowTrades.length / 200) * 100));

        let trend = 'neutral';
        if (ratio > 0.05 && confidence > 30) trend = 'up';
        else if (ratio < -0.05 && confidence > 30) trend = 'down';

        return {
            delta: Math.round(delta),
            buyVolume: Math.round(buyVol),
            sellVolume: Math.round(sellVol),
            ratio: +ratio.toFixed(4),
            trades: windowTrades.length,
            trend,
            confidence,
            available: true
        };
    }

    /**
     * Análise completa de CVD multi-janela para uso no V4 engine
     * @param {string} symbol
     * @returns {object} Análise CVD real com múltiplas janelas
     */
    function getFullCVDAnalysis(symbol) {
        const state = connections[symbol];
        const isConnected = state?.ws?.readyState === WebSocket.OPEN;
        const hasSufficientData = state?.trades?.length >= 50;

        if (!isConnected || !hasSufficientData) {
            return {
                available: false,
                reason: !isConnected ? 'WebSocket desconectado' : 'Dados insuficientes',
                windows: {},
                icebergs: [],
                overallTrend: 'neutral',
                overallConfidence: 0,
                deltaAcceleration: 0
            };
        }

        // Múltiplas janelas
        const w1m = getCVD(symbol, 60 * 1000);        // 1 minuto
        const w5m = getCVD(symbol, 5 * 60 * 1000);    // 5 minutos
        const w15m = getCVD(symbol, 15 * 60 * 1000);   // 15 minutos
        const w30m = getCVD(symbol, 30 * 60 * 1000);   // 30 minutos
        const w1h = getCVD(symbol, 60 * 60 * 1000);    // 1 hora

        // Tendência geral: ponderada por recência (janelas curtas = mais peso)
        const weights = { w1m: 0.35, w5m: 0.30, w15m: 0.20, w30m: 0.10, w1h: 0.05 };
        const trendScore =
            (w1m.ratio * weights.w1m) +
            (w5m.ratio * weights.w5m) +
            (w15m.ratio * weights.w15m) +
            (w30m.ratio * weights.w30m) +
            (w1h.ratio * weights.w1h);

        let overallTrend = 'neutral';
        if (trendScore > 0.03) overallTrend = 'up';
        else if (trendScore < -0.03) overallTrend = 'down';

        // Aceleração do delta: w1m vs w5m
        const deltaAcceleration = w5m.ratio !== 0
            ? ((w1m.ratio - w5m.ratio) / Math.abs(w5m.ratio)) * 100
            : 0;

        // Confiança geral
        const avgConfidence = Math.round(
            (w1m.confidence * 0.3 + w5m.confidence * 0.3 + w15m.confidence * 0.2 + w1h.confidence * 0.2)
        );

        // Divergência: preço subiu mas CVD caiu (ou vice-versa)
        let divergence = null;
        if (state.trades.length >= 100) {
            const recentTrades = state.trades.slice(-100);
            const oldPrice = recentTrades[0].price;
            const newPrice = recentTrades[recentTrades.length - 1].price;
            const priceDir = newPrice > oldPrice ? 'up' : newPrice < oldPrice ? 'down' : 'flat';

            if (priceDir === 'up' && w5m.trend === 'down') {
                divergence = { type: 'BEARISH_DIVERGENCE', detail: 'Preço subindo mas CVD caindo — pressão vendedora oculta' };
            } else if (priceDir === 'down' && w5m.trend === 'up') {
                divergence = { type: 'BULLISH_DIVERGENCE', detail: 'Preço caindo mas CVD subindo — acumulação' };
            }
        }

        return {
            available: true,
            windows: {
                '1m': w1m,
                '5m': w5m,
                '15m': w15m,
                '30m': w30m,
                '1h': w1h
            },
            icebergs: state.icebergs.slice(-10),
            overallTrend,
            overallConfidence: avgConfidence,
            trendScore: +trendScore.toFixed(4),
            deltaAcceleration: +deltaAcceleration.toFixed(1),
            divergence,
            totalTrades: state.stats.totalTrades,
            connectionAge: Math.round((Date.now() - state.stats.connectedAt) / 1000)
        };
    }

    // ═══════════════════════════════════════════════════
    // PERSISTENCE (localStorage cache)
    // ═══════════════════════════════════════════════════

    function saveStats(symbol, stats) {
        try {
            const all = JSON.parse(localStorage.getItem(CVD_STORAGE_KEY) || '{}');
            all[symbol] = { ...stats, savedAt: Date.now() };
            localStorage.setItem(CVD_STORAGE_KEY, JSON.stringify(all));
        } catch {}
    }

    function loadStats(symbol) {
        try {
            const all = JSON.parse(localStorage.getItem(CVD_STORAGE_KEY) || '{}');
            return all[symbol] || null;
        } catch { return null; }
    }

    // ═══════════════════════════════════════════════════
    // CONNECTION STATUS
    // ═══════════════════════════════════════════════════

    function getStatus(symbol) {
        const state = connections[symbol];
        if (!state) return { connected: false, trades: 0, age: 0 };
        return {
            connected: state.ws?.readyState === WebSocket.OPEN,
            trades: state.trades.length,
            totalTrades: state.stats.totalTrades,
            age: Math.round((Date.now() - state.stats.connectedAt) / 1000),
            lastUpdate: state.lastUpdate,
            reconnectAttempts: state.reconnectAttempts,
            icebergs: state.icebergs.length
        };
    }

    function getActiveConnections() {
        return Object.keys(connections).filter(sym =>
            connections[sym]?.ws?.readyState === WebSocket.OPEN
        );
    }

    // ═══════════════════════════════════════════════════
    // EXPORT
    // ═══════════════════════════════════════════════════

    window.RealtimeCVD = {
        connect,
        disconnect,
        disconnectAll,
        getCVD,
        getFullCVDAnalysis,
        getStatus,
        getActiveConnections,
        saveStats,
        loadStats
    };
})();
