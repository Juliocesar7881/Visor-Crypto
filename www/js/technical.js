        // ============================================
        // TECHNICAL ANALYSIS - AUCTION MARKET THEORY
        // ============================================
        const TA_CACHE_KEY = 'technical_analysis_cache';
        const TA_CACHE_DURATION = 5 * 60 * 1000; // 5 minutos
        let taCurrentSymbol = null;
        let taNavigationStack = [];
        
        // Cache sistema para análise técnica
        function getTACache(symbol) {
            try {
                const cached = localStorage.getItem(`${TA_CACHE_KEY}_${symbol}`);
                if (cached) {
                    const data = JSON.parse(cached);
                    if (Date.now() - data.timestamp < TA_CACHE_DURATION) {
                        return data;
                    }
                }
            } catch (e) {}
            return null;
        }
        
        function setTACache(symbol, data) {
            try {
                localStorage.setItem(`${TA_CACHE_KEY}_${symbol}`, JSON.stringify({
                    ...data,
                    timestamp: Date.now()
                }));
            } catch (e) {
                // localStorage quota exceeded — clear old TA caches
                try {
                    const keysToRemove = [];
                    for (let i = 0; i < localStorage.length; i++) {
                        const key = localStorage.key(i);
                        if (key && key.startsWith(TA_CACHE_KEY + '_')) keysToRemove.push(key);
                    }
                    keysToRemove.forEach(k => localStorage.removeItem(k));
                    // Retry once
                    localStorage.setItem(`${TA_CACHE_KEY}_${symbol}`, JSON.stringify({ ...data, timestamp: Date.now() }));
                } catch (e2) {}
            }
        }
        
        // ═══════════════════════════════════════════════════
        // CALL HISTORY SYSTEM — Histórico real de calls
        // ═══════════════════════════════════════════════════
        const CALL_HISTORY_KEY = 'vc_call_history';
        const CALL_CHECK_INTERVALS = [
            { key: '1h', ms: 3600000, label: '1h' },
            { key: '4h', ms: 14400000, label: '4h' },
            { key: '12h', ms: 43200000, label: '12h' },
            { key: '24h', ms: 86400000, label: '24h' }
        ];
        
        function getCallHistory() {
            try { return JSON.parse(localStorage.getItem(CALL_HISTORY_KEY) || '[]'); }
            catch { return []; }
        }
        
        function saveCallHistory(history) {
            // Keep last 200 calls max (reduced to prevent localStorage overflow)
            localStorage.setItem(CALL_HISTORY_KEY, JSON.stringify(history.slice(-200)));
        }
        
        function recordCall(symbol, signal, confidence, entryPrice, crypto, fullAnalysis) {
            if (!entryPrice || entryPrice <= 0) return;
            if (confidence < 70) return;
            if (!signal.includes('CONFIRMED')) return;
            
            const history = getCallHistory();
            const direction = signal.includes('LONG') ? 'LONG' : 'SHORT';
            
            // Don't duplicate — skip if same symbol+direction within 30 min
            const thirtyMinAgo = Date.now() - 1800000;
            const duplicate = history.find(c => 
                c.symbol === symbol && c.direction === direction && c.timestamp > thirtyMinAgo
            );
            if (duplicate) return;
            
            // Extrair snapshot completo da análise para banco de dados
            const analytics = {};
            if (fullAnalysis) {
                try {
                    analytics.v4Signal = fullAnalysis.v4Signal || null;
                    analytics.v4Confidence = fullAnalysis.v4Confidence || null;
                    analytics.v4Probability = fullAnalysis.v4Probability || null;
                    analytics.v4GatesPassed = fullAnalysis.v4GatesPassed || null;
                    analytics.v4GatesTotal = fullAnalysis.v4GatesTotal || null;
                    analytics.v4GateScore = fullAnalysis.v4GateScore || null;
                    analytics.v4RegimeKey = fullAnalysis.v4RegimeKey || null;
                    analytics.v4ExecutionType = fullAnalysis.v4ExecutionType || null;
                    analytics.v4IsCounterTrend = fullAnalysis.v4IsCounterTrend || null;
                    analytics.v4ActionMessage = fullAnalysis.v4ActionMessage || null;
                    
                    // Gates individuais
                    if (fullAnalysis.v4Gates) {
                        analytics.gates = {};
                        Object.entries(fullAnalysis.v4Gates).forEach(([key, gate]) => {
                            analytics.gates[key] = {
                                passed: gate.passed,
                                name: gate.name,
                                cvdSource: gate.cvdSource || null
                            };
                        });
                    }
                    
                    // Regime e sessão
                    analytics.regime = fullAnalysis.enhancedRegime?.regime || fullAnalysis.v4RegimeKey || null;
                    analytics.session = fullAnalysis.sessionContext?.session || null;
                    analytics.isKillZone = fullAnalysis.sessionContext?.isKillZone || false;
                    
                    // Displacement e Volume
                    analytics.displacement = {
                        detected: fullAnalysis.displacement?.detected || false,
                        direction: fullAnalysis.displacement?.direction || null
                    };
                    analytics.volumeExpansion = fullAnalysis.volumeExpansion1h?.expanding || false;
                    
                    // Indicadores chave
                    const ind = fullAnalysis.indicators || {};
                    analytics.indicators = {
                        rsi1h: ind.rsi1h || null,
                        rsi4h: ind.rsi4h || null,
                        macd1h: ind.macd1hSignal || null,
                        adx1h: ind.adx1h || null,
                        atr14: ind.atr14 || null,
                        bookImbalance: ind.bookImbalance || null,
                        fundingRate: ind.fundingRate || null
                    };
                    
                    // Real CVD
                    if (fullAnalysis.realtimeCVD?.available) {
                        analytics.realtimeCVD = {
                            trend: fullAnalysis.realtimeCVD.overallTrend,
                            trendScore: fullAnalysis.realtimeCVD.trendScore,
                            deltaAcceleration: fullAnalysis.realtimeCVD.deltaAcceleration,
                            divergence: fullAnalysis.realtimeCVD.divergence?.type || null,
                            icebergs: fullAnalysis.realtimeCVD.icebergs?.length || 0
                        };
                    }
                    
                    // BTC Alignment
                    if (fullAnalysis.btcAlignment?.available) {
                        analytics.btcAlignment = {
                            correlation: fullAnalysis.btcAlignment.correlation,
                            aligned: fullAnalysis.btcAlignment.aligned,
                            risk: fullAnalysis.btcAlignment.risk
                        };
                    }
                    
                    // MTF
                    if (fullAnalysis.mtfAnalysis?.available) {
                        analytics.mtf = {
                            alignedCount: fullAnalysis.mtfAnalysis.alignedCount,
                            totalAvailable: fullAnalysis.mtfAnalysis.totalAvailable,
                            dominantDirection: fullAnalysis.mtfAnalysis.dominantDirection,
                            alignmentScore: fullAnalysis.mtfAnalysis.alignmentScore,
                            adaptiveWeights: fullAnalysis.mtfAnalysis.adaptiveWeights || null
                        };
                    }
                    
                    analytics.squeeze = fullAnalysis.squeezeState?.isSqueeze || false;
                    analytics.volRegime = fullAnalysis.volRegimeShift?.shift || null;
                    analytics.setupFingerprint = fullAnalysis.setupFingerprint?.fingerprint || null;
                    analytics.entry = fullAnalysis.entry || null;
                    analytics.stopLoss = fullAnalysis.stopLoss || null;
                    analytics.takeProfit1 = fullAnalysis.takeProfit1 || null;
                    analytics.takeProfit2 = fullAnalysis.takeProfit2 || null;
                    analytics.riskReward = fullAnalysis.riskReward || null;
                    analytics.marketBreadth = fullAnalysis.marketBreadth?.pctLong || null;
                    analytics.macroRegime = fullAnalysis.macroRegime?.regime || null;
                    analytics.systemicRisk = fullAnalysis.systemicRisk?.level || null;
                } catch (e) { /* console.warn('[CallHistory] Analytics capture error:', e); */ }
            }
            
            history.push({
                id: Date.now(),
                symbol: symbol,
                name: crypto?.short || symbol,
                direction: direction,
                confidence: confidence,
                entryPrice: entryPrice,
                timestamp: Date.now(),
                prices: { '1h': null, '4h': null, '12h': null, '24h': null },
                pnl: { '1h': null, '4h': null, '12h': null, '24h': null },
                checked: { '1h': false, '4h': false, '12h': false, '24h': false },
                analytics: analytics
            });
            
            saveCallHistory(history);
        }
        
        async function fetchCurrentPrice(symbol) {
            try {
                const pair = symbol.replace('/', '').replace('-', '') + (symbol.includes('USDT') ? '' : 'USDT');
                const resp = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${pair}`);
                const data = await resp.json();
                return parseFloat(data.price);
            } catch { return null; }
        }
        
        async function checkCallPrices() {
            const history = getCallHistory();
            let updated = false;
            const now = Date.now();
            
            for (const call of history) {
                // Ensure new fields exist for older records
                if (!call.pnl) call.pnl = { '1h': null, '4h': null, '12h': null, '24h': null };
                if (!call.checked['24h']) call.checked['24h'] = false;
                if (!call.prices['24h']) call.prices['24h'] = null;
                
                for (const interval of CALL_CHECK_INTERVALS) {
                    if (call.checked[interval.key]) continue;
                    const elapsed = now - call.timestamp;
                    if (elapsed >= interval.ms) {
                        const price = await fetchCurrentPrice(call.symbol);
                        if (price) {
                            call.prices[interval.key] = price;
                            call.checked[interval.key] = true;
                            // Calcular PnL %
                            const pnlPct = ((price - call.entryPrice) / call.entryPrice) * 100;
                            call.pnl[interval.key] = call.direction === 'LONG' ? +pnlPct.toFixed(3) : +(-pnlPct).toFixed(3);
                            updated = true;
                        }
                    }
                }
            }
            
            if (updated) saveCallHistory(history);
        }
        
        function getCallStats(history) {
            const stats = { total: 0, byInterval: {} };
            for (const iv of CALL_CHECK_INTERVALS) {
                stats.byInterval[iv.key] = { wins: 0, losses: 0, total: 0, pending: 0, avgPnl: 0, totalPnl: 0, winRate: 0 };
            }
            
            for (const call of history) {
                stats.total++;
                for (const iv of CALL_CHECK_INTERVALS) {
                    const price = call.prices?.[iv.key];
                    if (price !== null && price !== undefined) {
                        stats.byInterval[iv.key].total++;
                        const isWin = call.direction === 'LONG' ? price > call.entryPrice : price < call.entryPrice;
                        if (isWin) stats.byInterval[iv.key].wins++;
                        else stats.byInterval[iv.key].losses++;
                        const pnl = call.pnl?.[iv.key];
                        if (pnl !== null && pnl !== undefined) {
                            stats.byInterval[iv.key].totalPnl += pnl;
                        }
                    } else {
                        stats.byInterval[iv.key].pending++;
                    }
                }
            }
            
            for (const iv of CALL_CHECK_INTERVALS) {
                const s = stats.byInterval[iv.key];
                s.avgPnl = s.total > 0 ? +(s.totalPnl / s.total).toFixed(3) : 0;
                s.winRate = s.total > 0 ? +((s.wins / s.total) * 100).toFixed(1) : 0;
            }
            
            return stats;
        }
        

        // ═══════════════════════════════════════

        function openAvisoLegalModal() {
            const existing = document.getElementById('aviso-legal-modal');
            if (existing) { existing.remove(); return; }
            const m = document.createElement('div');
            m.id = 'aviso-legal-modal';
            m.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,0.75);backdrop-filter:blur(8px);padding:0;animation:fadeInOverlay 0.25s ease;';
            m.innerHTML = `
                <div style="background:linear-gradient(180deg,#1c1c35 0%,#141423 100%);border:1px solid rgba(245,158,11,0.3);border-radius:24px 24px 0 0;max-width:480px;width:100%;padding:24px 22px 36px;max-height:88vh;overflow-y:auto;box-shadow:0 -8px 40px rgba(0,0,0,0.5);animation:slideUpCard 0.3s cubic-bezier(0.22,1,0.36,1) forwards;">
                    <div style="width:40px;height:4px;background:rgba(255,255,255,0.15);border-radius:2px;margin:0 auto 18px;"></div>
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
                        <div style="display:flex;align-items:center;gap:10px;">
                            <div style="width:36px;height:36px;background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.35);border-radius:10px;display:inline-flex;align-items:center;justify-content:center;">
                                <span style="font-size:18px;">⚠️</span>
                            </div>
                            <div style="font-size:14px;color:#f59e0b;font-weight:800;letter-spacing:0.3px;">AVISO LEGAL</div>
                        </div>
                        <button id="aviso-close-btn" style="width:32px;height:32px;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.1);border-radius:50%;color:#8b949e;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;touch-action:manipulation;-webkit-tap-highlight-color:transparent;flex-shrink:0;">&times;</button>
                    </div>
                    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px;">
                        <div style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;background:rgba(245,158,11,0.07);border:1px solid rgba(245,158,11,0.18);border-radius:11px;">
                            <span style="color:#f59e0b;font-size:14px;flex-shrink:0;margin-top:1px;">📋</span>
                            <span style="font-size:12px;color:#c9d1d9;line-height:1.6;"><strong style="color:#f59e0b;">Informativo e educacional.</strong> Não constitui aconselhamento financeiro, recomendação de investimento ou solicitação de compra/venda de ativos.</span>
                        </div>
                        <div style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;background:rgba(239,68,68,0.07);border:1px solid rgba(239,68,68,0.18);border-radius:11px;">
                            <span style="color:#ef4444;font-size:14px;flex-shrink:0;margin-top:1px;">⚡</span>
                            <span style="font-size:12px;color:#c9d1d9;line-height:1.6;">Criptomoedas envolvem <strong style="color:#ef4444;">alto risco de perda total</strong> do capital. O mercado é extremamente volátil e imprevisível.</span>
                        </div>
                        <div style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;background:rgba(99,102,241,0.07);border:1px solid rgba(99,102,241,0.18);border-radius:11px;">
                            <span style="color:#a78bfa;font-size:14px;flex-shrink:0;margin-top:1px;">🤖</span>
                            <span style="font-size:12px;color:#c9d1d9;line-height:1.6;">Análises geradas por algoritmos, podendo conter erros. Resultados passados <strong style="color:#a78bfa;">não garantem</strong> resultados futuros.</span>
                        </div>
                        <div style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;background:rgba(88,166,255,0.07);border:1px solid rgba(88,166,255,0.18);border-radius:11px;">
                            <span style="color:#58a6ff;font-size:14px;flex-shrink:0;margin-top:1px;">🔍</span>
                            <span style="font-size:12px;color:#c9d1d9;line-height:1.6;">Faça sua própria pesquisa (<strong style="color:#58a6ff;">DYOR</strong>) e consulte um profissional financeiro antes de investir.</span>
                        </div>
                    </div>
                    <p style="font-size:10px;color:#6e7681;line-height:1.6;text-align:center;margin-bottom:16px;">Todas as decisões de investimento são de sua exclusiva responsabilidade. Os desenvolvedores não se responsabilizam por perdas financeiras.</p>
                    <div style="display:flex;align-items:center;justify-content:space-between;">
                        <a href="privacy-policy.html" target="_blank" style="color:#58a6ff;font-size:10px;text-decoration:underline;">Política de Privacidade</a>
                        <button id="aviso-ok-btn" style="padding:11px 28px;background:rgba(245,158,11,0.15);border:1.5px solid rgba(245,158,11,0.45);border-radius:12px;color:#f59e0b;font-weight:700;font-size:12px;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;">Entendi ✓</button>
                    </div>
                </div>
            `;
            m.addEventListener('click', (e) => { if (e.target === m) m.remove(); });
            m.querySelector('#aviso-close-btn').addEventListener('click', () => m.remove());
            m.querySelector('#aviso-close-btn').addEventListener('touchend', (e) => { e.preventDefault(); m.remove(); });
            m.querySelector('#aviso-ok-btn').addEventListener('click', () => m.remove());
            m.querySelector('#aviso-ok-btn').addEventListener('touchend', (e) => { e.preventDefault(); m.remove(); });
            document.body.appendChild(m);
        }

        function closeTechnicalAnalysis() {
            // Fechar panel de notificações se aberto
            const notifPanel = document.getElementById('ta-notif-panel');
            if (notifPanel) notifPanel.style.display = 'none';
            
            // Parar auto-refresh
            stopTAAutoRefresh();
            
            // Desconectar WebSockets de OrderFlow e CVD para evitar memory leak
            if (taCurrentSymbol) {
                if (window.TAEngineV4 && window.TAEngineV4.disconnectOrderFlowWS) {
                    try { window.TAEngineV4.disconnectOrderFlowWS(taCurrentSymbol); } catch(e) {}
                }
                if (window.RealtimeCVD && window.RealtimeCVD.disconnect) {
                    try { window.RealtimeCVD.disconnect(taCurrentSymbol); } catch(e) {}
                }
            }
            
            const modal = document.getElementById('ta-modal');
            if (!modal) return;
            modal.classList.remove('active');
            document.body.style.overflow = 'hidden'; // Manter scroll bloqueado para o modal do gráfico
            
            // Voltar para o modal do gráfico
            taNavigationStack.pop();
        }
        
        // Variável para controlar o auto-refresh da análise técnica
        let taAutoRefreshInterval = null;
        
        function startTAAutoRefresh(symbol) {
            // Limpar intervalo anterior se existir
            stopTAAutoRefresh();
            
            // Atualizar a cada 5 minutos (300000ms)
            taAutoRefreshInterval = setInterval(async () => {
                const modal = document.getElementById('ta-modal');
                if (!modal || !modal.classList.contains('active')) {
                    stopTAAutoRefresh();
                    return;
                }
                
                try {
                    const crypto = CRYPTO_DATABASE[symbol];
                    const [analysisData, macroNewsData, bigTechData] = await Promise.all([
                        fetchTechnicalAnalysisData(symbol),
                        (window.TAEngineV2 && window.TAEngineV2.fetchMacroNewsLayer) ?
                            window.TAEngineV2.fetchMacroNewsLayer(symbol) :
                            Promise.resolve(null),
                        (window.TAEngineV2 && window.TAEngineV2.fetchBigTechAndMacro) ?
                            window.TAEngineV2.fetchBigTechAndMacro() :
                            Promise.resolve(null)
                    ]);
                    const analysis = generateTechnicalAnalysis(analysisData, symbol);
                    analysis.macroNews = macroNewsData;
                    analysis.bigTechMacro = bigTechData;
                    if (macroNewsData && macroNewsData.totalImpact !== 0 && window.TAEngineV2) {
                        analysis.confluenceSummary.score = (parseFloat(analysis.confluenceSummary.score) + macroNewsData.totalImpact).toFixed(1);
                        // Re-apply contextual scoring with macro data
                        const V2 = window.TAEngineV2;
                        if (V2.applyContextualScoring && analysis.confluenceSummary?.details) {
                            const reScored = V2.applyContextualScoring(
                                analysis.confluenceSummary.details,
                                analysis.marketRegime,
                                analysis.marketStructure,
                                analysis.cvdAdvanced,
                                macroNewsData,
                                analysis.volatilityMetrics
                            );
                            analysis.contextualAdjustments = reScored.adjustments;
                        }
                    }
                    if (bigTechData && bigTechData.bigTechScore !== 0) {
                        analysis.confluenceSummary.score = (parseFloat(analysis.confluenceSummary.score) + bigTechData.bigTechScore).toFixed(1);
                    }
                    // Inject bigTechMacro into indicators for AI summary
                    if (bigTechData) {
                        analysis.indicators = analysis.indicators || {};
                        analysis.indicators.bigTechMacro = bigTechData;
                    }
                    
                    // V3 Enhancement on auto-refresh
                    if (window.TAEngineV3 && window.TAEngineV3.enhanceAnalysis) {
                        try {
                            const enhanced = await window.TAEngineV3.enhanceAnalysis(analysis, analysisData, symbol);
                            Object.assign(analysis, enhanced);
                            // Regenerate AI summary with V3 corrected signal/confidence
                            if (enhanced.v3Signal) {
                                analysis.aiSummary = generateAISummary(
                                    enhanced.v3SignalType || analysis.signalType,
                                    enhanced.v3Confidence || analysis.confidence,
                                    analysis.indicators,
                                    symbol
                                );
                            }
                        } catch (v3err) { /* console.warn('[V3] Refresh enhancement error:', v3err); */ }
                    }
                    
                    // V4 Enhancement on auto-refresh
                    if (window.TAEngineV4 && window.TAEngineV4.enhanceWithReactive) {
                        try {
                            const v4Enhanced = await window.TAEngineV4.enhanceWithReactive(analysis, analysisData, symbol);
                            Object.assign(analysis, v4Enhanced);
                            if (v4Enhanced.v4Signal) {
                                const v4Dir = v4Enhanced.v4Signal.includes('LONG') ? 'long' : v4Enhanced.v4Signal.includes('SHORT') ? 'short' : 'neutral';
                                analysis.aiSummary = generateAISummary(
                                    v4Dir,
                                    v4Enhanced.v4Confidence || analysis.confidence,
                                    analysis.indicators,
                                    symbol
                                );
                                if (v4Enhanced.reactiveSummary) {
                                    analysis.aiSummary += '\n\n━━━ ANÁLISE AVANÇADA ━━━\n' + v4Enhanced.reactiveSummary;
                                }
                            }
                        } catch (v4err) { /* console.warn('[V4] Refresh enhancement error:', v4err); */ }
                    }
                    
                    // Atualizar cache
                    setTACache(symbol, { analysis });
                    
                    // Re-renderizar se modal ainda estiver aberto
                    if (modal.classList.contains('active')) {
                        renderTechnicalAnalysis(analysis, crypto);
                    }
                } catch (e) {
                }
            }, 300000); // 5 minutos
        }
        
        function stopTAAutoRefresh() {
            if (taAutoRefreshInterval) {
                clearInterval(taAutoRefreshInterval);
                taAutoRefreshInterval = null;
            }
        }
        
        async function fetchTechnicalAnalysisData(symbol) {
            const baseSymbol = symbol.replace('USDT', '');
            
            const workerUrl = (window.APP_CONFIG && window.APP_CONFIG.CALENDAR_WORKER_URL) || '';
            
            // V7: Otimizado — removidos 1m/5m klines (ruído) e rácios defasados
            // Apenas timeframes estruturais: 15m, 1h, 4h, 1d
            const [
                klines15m,
                klines1h,
                klines4h,
                klines1d,
                ticker24h,
                orderBook,
                fundingRate,
                openInterest,
                trades,
                takerBuySellVol,
                forceOrders,
                openInterestHist,
                workerLiqRaw
            ] = await Promise.all([
                // Klines 15m (últimas 100 velas) - para RSI e indicadores de curto prazo
                fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=15m&limit=100`)
                    .then(r => r.json()).catch(() => []),
                // Klines 1h (últimas 500 velas) - para SMA200 e médias de longo prazo
                fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1h&limit=500`)
                    .then(r => r.json()).catch(() => []),
                // Klines 4h (últimas 250 velas) - estrutura superior + EMA 200
                fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=4h&limit=250`)
                    .then(r => r.json()).catch(() => []),
                // Klines 1d (últimas 250 velas) - para EMA 200 diário
                fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1d&limit=250`)
                    .then(r => r.json()).catch(() => []),
                // 24h Ticker
                fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`)
                    .then(r => r.json()).catch(() => ({})),
                // Order Book (profundidade)
                fetch(`https://api.binance.com/api/v3/depth?symbol=${symbol}&limit=100`)
                    .then(r => r.json()).catch(() => ({ bids: [], asks: [] })),
                // Funding Rate (Futures)
                fetch(`https://fapi.binance.com/fapi/v1/fundingRate?symbol=${symbol}&limit=1`)
                    .then(r => r.json()).catch(() => []),
                // Open Interest (Futures)
                fetch(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${symbol}`)
                    .then(r => r.json()).catch(() => ({})),
                // Recent trades para CVD (500 últimos)
                fetch(`https://api.binance.com/api/v3/trades?symbol=${symbol}&limit=500`)
                    .then(r => r.json()).catch(() => []),
                // Taker Buy/Sell Volume
                fetch(`https://fapi.binance.com/futures/data/takerlongshortRatio?symbol=${symbol}&period=1h&limit=24`)
                    .then(r => r.json()).catch(() => []),
                // LIQUIDAÇÕES FORÇADAS REAIS (últimas 100) - DADOS REAIS DA BINANCE
                fetch(`https://fapi.binance.com/fapi/v1/allForceOrders?symbol=${symbol}&limit=100`)
                    .then(r => r.json()).catch(() => []),
                // Open Interest Histórico (últimos 12 períodos de 5min) - para OI Delta
                fetch(`https://fapi.binance.com/futures/data/openInterestHist?symbol=${symbol}&period=5m&limit=12`)
                    .then(r => r.json()).catch(() => []),
                // Liquidações 12h do worker (em paralelo, timeout 3s)
                workerUrl ? fetch(`${workerUrl}/liquidations?symbol=${symbol}`, { signal: AbortSignal.timeout(3000) })
                    .then(r => r.ok ? r.json() : null).catch(() => null) : Promise.resolve(null)
            ]);
            
            let workerLiqData = null;
            if (workerLiqRaw && workerLiqRaw.success && (
                workerLiqRaw.totalCount > 0 ||
                workerLiqRaw.openInterestUSD > 0 ||
                (Array.isArray(workerLiqRaw.pendingLevels) && workerLiqRaw.pendingLevels.length > 0)
            )) {
                workerLiqData = workerLiqRaw;
            }

            return {
                klines15m,
                klines1h,
                klines4h,
                klines1d,
                ticker24h,
                orderBook,
                fundingRate: fundingRate[0] || {},
                openInterest,
                trades,
                takerBuySellVol: takerBuySellVol || [],
                forceOrders: forceOrders || [],  // LIQUIDAÇÕES REAIS
                openInterestHist: openInterestHist || [],  // OI Delta
                workerLiqData,  // Liquidações 12h do worker (ou null)
                currentPrice: prices[symbol] || parseFloat(ticker24h.lastPrice) || 0
            };
        }
        
        function generateTechnicalAnalysis(data, symbol) {
            const { klines15m, klines1h, klines4h, klines1d, ticker24h, orderBook, fundingRate, openInterest, trades, takerBuySellVol, forceOrders, openInterestHist, workerLiqData: _workerLiqRaw, currentPrice } = data;
            
            // ============================================
            // MULTI-TIMEFRAME TECHNICAL INDICATORS
            // Sistema de confluência profissional com pesos
            // ============================================
            
            // RSI em múltiplos timeframes (peso: 2 cada)
            const rsi15m = calculateRSI(klines15m);
            const rsi1h = calculateRSI(klines1h);
            const rsi4h = calculateRSI(klines4h);
            
            // EMA 200 em múltiplos timeframes (peso: 1.5 cada)
            const ema200_1h = calculateEMA(klines1h, 200);
            const ema200_4h = calculateEMA(klines4h, 200);
            
            // Médias Móveis para painel de MAs (cada MA no timeframe adequado)
            const ema9 = calculateEMA(klines15m, 9);    // EMA 9 de 15m (scalp)
            const ema21 = calculateEMA(klines1h, 21);   // EMA 21 de 1h (swing)
            const ema50 = calculateEMA(klines1h, 50);   // EMA 50 de 1h (tendência)
            const sma50 = calculateSMA(klines4h, 50);   // SMA 50 de 4h (macro)
            const sma99 = calculateSMA(klines4h, 99);   // SMA 99 de 4h (macro)
            const sma200 = calculateSMA(klines1d, 200); // SMA 200 de 1d (longo prazo)
            
            // ============================================
            // ANÁLISE GRÁFICA MULTI-TIMEFRAME (1m, 5m, 15m, 1h)
            // ============================================
            const chartAnalysis = analyzeChartPatterns(klines15m, klines1h, currentPrice);
            
            // ============================================
            // HEATMAP DE LIQUIDAÇÕES (estilo Coinglass)
            // ============================================
            const workerLiqData = data.workerLiqData || null;
            const fallbackLSRatio = (() => {
                if (!Array.isArray(takerBuySellVol) || takerBuySellVol.length === 0) return { longShortRatio: 1 };
                const buyVol = takerBuySellVol.reduce((s, v) => s + parseFloat(v.buyVol || 0), 0);
                const sellVol = takerBuySellVol.reduce((s, v) => s + parseFloat(v.sellVol || 0), 0);
                return { longShortRatio: buyVol / Math.max(sellVol, 1) };
            })();
            const realLiquidations = workerLiqData
                ? {
                    hasData: true, isRealData: true,
                    dataSource: `Binance Futures (${workerLiqData.totalCount} liquidações 12h)`,
                    longLiqVolume: workerLiqData.longVol, shortLiqVolume: workerLiqData.shortVol,
                    longLiqCount: workerLiqData.longCount, shortLiqCount: workerLiqData.shortCount,
                    riskRatio: workerLiqData.ratio,
                    dominantRisk: workerLiqData.ratio > 1.5 ? 'LONGS MAIS LIQUIDADOS' : workerLiqData.ratio < 0.67 ? 'SHORTS MAIS LIQUIDADOS' : 'EQUILIBRADO',
                    currentPrice, recentLiquidations: [],
                    liquidationLevels: (workerLiqData.topLevels || []).map(l => ({
                        type: l.side, price: l.price, volume: l.vol, distance: Math.abs((l.price - currentPrice) / currentPrice * 100),
                        side: l.price < currentPrice ? 'ABAIXO' : 'ACIMA', time: l.time, isRecent: true, intensity: Math.min(l.vol / 10000, 100)
                    })),
                    lastUpdate: new Date().toLocaleTimeString('pt-BR'),
                    // Enhanced: Real OI-based pending liquidation data
                    openInterestUSD: workerLiqData.openInterestUSD || 0,
                    longOI: workerLiqData.longOI || 0,
                    shortOI: workerLiqData.shortOI || 0,
                    longPct: workerLiqData.longPct || 50,
                    shortPct: workerLiqData.shortPct || 50,
                    pendingLevels: workerLiqData.pendingLevels || [],
                    totalPendingLong: workerLiqData.totalPendingLong || 0,
                    totalPendingShort: workerLiqData.totalPendingShort || 0
                  }
                                : analyzeRealLiquidations(forceOrders, currentPrice, openInterest, fallbackLSRatio);

                        const liquidationRiskMap = buildLiquidationRiskMap(realLiquidations, currentPrice);
            
            // Manter heatmap estimado para referência
            const liquidationHeatmap = calculateLiquidationHeatmap(currentPrice, openInterest, orderBook, takerBuySellVol);
            
            // VWAP (peso: 1.5)
            const vwap = calculateVWAP(klines1h);
            
            // MACD (peso: 1.5)
            const macd1h = calculateMACD(klines1h);
            const macd4h = calculateMACD(klines4h);
            
            // ADX - Força da tendência (peso: 1)
            const adx1h = calculateADX(klines1h);
            const adx4h = calculateADX(klines4h);
            
            // Stochastic (peso: 1)
            const stoch1h = calculateStochastic(klines1h);
            const stoch4h = calculateStochastic(klines4h);
            
            // Net Volume / Volume Delta (peso: 1.5)
            const netVolume1h = calculateNetVolume(klines1h);
            const netVolume4h = calculateNetVolume(klines4h);
            
            // ============================================
            // CONFLUENCE SCORING SYSTEM (Gradient — sem thresholds binários)
            // ============================================
            let confluenceScore = 0;
            const confluenceDetails = [];
            
            // Helper: smooth sigmoid for gradient scoring
            const _sig = (x) => 1 / (1 + Math.exp(-x));
            // Gradient RSI contribution: smooth transition instead of binary 30/70
            // Returns value from -maxW to +maxW, with 0 at RSI=50
            const gradientRSI = (rsi, maxW) => {
                const longPull = maxW * _sig((35 - rsi) / 5);   // strong below 35, fades above
                const shortPull = maxW * _sig((rsi - 65) / 5);  // strong above 65, fades below
                return longPull - shortPull; // net contribution
            };
            
            // RSI 15m (peso 2 — gradiente)
            const rsi15mContrib = gradientRSI(rsi15m, 2);
            confluenceScore += rsi15mContrib;
            const rsi15mSignal = rsi15mContrib > 0.3 ? 'LONG' : rsi15mContrib < -0.3 ? 'SHORT' : 'NEUTRO';
            confluenceDetails.push({ name: 'RSI 15m', value: rsi15m.toFixed(1), signal: rsi15mSignal, weight: +rsi15mContrib.toFixed(2), color: rsi15mSignal === 'LONG' ? '#22c55e' : rsi15mSignal === 'SHORT' ? '#ef4444' : '#94a3b8' });
            
            // RSI 1h (peso 2 — gradiente)
            const rsi1hContrib = gradientRSI(rsi1h, 2);
            confluenceScore += rsi1hContrib;
            const rsi1hSignal = rsi1hContrib > 0.3 ? 'LONG' : rsi1hContrib < -0.3 ? 'SHORT' : 'NEUTRO';
            confluenceDetails.push({ name: 'RSI 1h', value: rsi1h.toFixed(1), signal: rsi1hSignal, weight: +rsi1hContrib.toFixed(2), color: rsi1hSignal === 'LONG' ? '#22c55e' : rsi1hSignal === 'SHORT' ? '#ef4444' : '#94a3b8' });
            
            // RSI 4h (peso 2 — gradiente)
            const rsi4hContrib = gradientRSI(rsi4h, 2);
            confluenceScore += rsi4hContrib;
            const rsi4hSignal = rsi4hContrib > 0.3 ? 'LONG' : rsi4hContrib < -0.3 ? 'SHORT' : 'NEUTRO';
            confluenceDetails.push({ name: 'RSI 4h', value: rsi4h.toFixed(1), signal: rsi4hSignal, weight: +rsi4hContrib.toFixed(2), color: rsi4hSignal === 'LONG' ? '#22c55e' : rsi4hSignal === 'SHORT' ? '#ef4444' : '#94a3b8' });
            
            // EMA 200 1h (peso 1.5 — distância ponderada)
            const ema1hDist = ema200_1h !== 0 ? ((currentPrice - ema200_1h) / ema200_1h) * 100 : 0;
            const ema1hContrib = 1.5 * Math.tanh(ema1hDist / 3); // smooth -1.5 to +1.5, saturates at ~3% distance
            confluenceScore += ema1hContrib;
            const ema1hSignal = ema1hContrib > 0.2 ? 'LONG' : ema1hContrib < -0.2 ? 'SHORT' : 'NEUTRO';
            confluenceDetails.push({ name: 'EMA 200 (1h)', value: `${ema1hDist > 0 ? '+' : ''}${ema1hDist.toFixed(1)}%`, signal: ema1hSignal, weight: +ema1hContrib.toFixed(2), color: ema1hSignal === 'LONG' ? '#22c55e' : ema1hSignal === 'SHORT' ? '#ef4444' : '#94a3b8' });
            
            // EMA 200 4h (peso 1.5 — distância ponderada)
            const ema4hDist = ema200_4h !== 0 ? ((currentPrice - ema200_4h) / ema200_4h) * 100 : 0;
            const ema4hContrib = 1.5 * Math.tanh(ema4hDist / 3);
            confluenceScore += ema4hContrib;
            const ema4hSignal = ema4hContrib > 0.2 ? 'LONG' : ema4hContrib < -0.2 ? 'SHORT' : 'NEUTRO';
            confluenceDetails.push({ name: 'EMA 200 (4h)', value: `${ema4hDist > 0 ? '+' : ''}${ema4hDist.toFixed(1)}%`, signal: ema4hSignal, weight: +ema4hContrib.toFixed(2), color: ema4hSignal === 'LONG' ? '#22c55e' : ema4hSignal === 'SHORT' ? '#ef4444' : '#94a3b8' });
            
            // VWAP (peso 1.5)
            if (currentPrice > vwap) {
                confluenceScore += 1.5;
                confluenceDetails.push({ name: 'VWAP', value: `$${(vwap || 0).toFixed(2)}`, signal: 'LONG', weight: 1.5, color: '#22c55e' });
            } else {
                confluenceScore -= 1.5;
                confluenceDetails.push({ name: 'VWAP', value: `$${(vwap || 0).toFixed(2)}`, signal: 'SHORT', weight: 1.5, color: '#ef4444' });
            }
            
            // MACD 1h (peso 1.5)
            if (macd1h.histogram > 0 && macd1h.macd > macd1h.signal) {
                confluenceScore += 1.5;
                confluenceDetails.push({ name: 'MACD 1h', value: macd1h.histogram.toFixed(4), signal: 'LONG', weight: 1.5, color: '#22c55e' });
            } else if (macd1h.histogram < 0 && macd1h.macd < macd1h.signal) {
                confluenceScore -= 1.5;
                confluenceDetails.push({ name: 'MACD 1h', value: macd1h.histogram.toFixed(4), signal: 'SHORT', weight: 1.5, color: '#ef4444' });
            } else {
                confluenceDetails.push({ name: 'MACD 1h', value: macd1h.histogram.toFixed(4), signal: 'NEUTRO', weight: 0, color: '#94a3b8' });
            }
            
            // MACD 4h (peso 1.5)
            if (macd4h.histogram > 0 && macd4h.macd > macd4h.signal) {
                confluenceScore += 1.5;
                confluenceDetails.push({ name: 'MACD 4h', value: macd4h.histogram.toFixed(4), signal: 'LONG', weight: 1.5, color: '#22c55e' });
            } else if (macd4h.histogram < 0 && macd4h.macd < macd4h.signal) {
                confluenceScore -= 1.5;
                confluenceDetails.push({ name: 'MACD 4h', value: macd4h.histogram.toFixed(4), signal: 'SHORT', weight: 1.5, color: '#ef4444' });
            } else {
                confluenceDetails.push({ name: 'MACD 4h', value: macd4h.histogram.toFixed(4), signal: 'NEUTRO', weight: 0, color: '#94a3b8' });
            }
            
            // ADX 1h - Força da tendência (peso 1)
            const adxStrength = adx1h.adx > 25 ? 'Forte' : 'Fraca';
            if (adx1h.adx > 25 && adx1h.plusDI > adx1h.minusDI) {
                confluenceScore += 1;
                confluenceDetails.push({ name: 'ADX 1h', value: `${adx1h.adx.toFixed(1)} (${adxStrength})`, signal: 'LONG', weight: 1, color: '#22c55e' });
            } else if (adx1h.adx > 25 && adx1h.plusDI < adx1h.minusDI) {
                confluenceScore -= 1;
                confluenceDetails.push({ name: 'ADX 1h', value: `${adx1h.adx.toFixed(1)} (${adxStrength})`, signal: 'SHORT', weight: 1, color: '#ef4444' });
            } else {
                confluenceDetails.push({ name: 'ADX 1h', value: `${adx1h.adx.toFixed(1)} (${adxStrength})`, signal: 'NEUTRO', weight: 0, color: '#94a3b8' });
            }
            
            // Stochastic 1h (peso 1)
            if (stoch1h.k < 20 && stoch1h.k > stoch1h.d) {
                confluenceScore += 1;
                confluenceDetails.push({ name: 'Stochastic 1h', value: `K:${stoch1h.k.toFixed(1)} D:${stoch1h.d.toFixed(1)}`, signal: 'LONG', weight: 1, color: '#22c55e' });
            } else if (stoch1h.k > 80 && stoch1h.k < stoch1h.d) {
                confluenceScore -= 1;
                confluenceDetails.push({ name: 'Stochastic 1h', value: `K:${stoch1h.k.toFixed(1)} D:${stoch1h.d.toFixed(1)}`, signal: 'SHORT', weight: 1, color: '#ef4444' });
            } else {
                confluenceDetails.push({ name: 'Stochastic 1h', value: `K:${stoch1h.k.toFixed(1)} D:${stoch1h.d.toFixed(1)}`, signal: 'NEUTRO', weight: 0, color: '#94a3b8' });
            }
            
            // ADX 4h (peso 1 — confirma força da tendência em timeframe maior)
            const adx4hStrength = adx4h.adx > 25 ? 'Forte' : 'Fraca';
            if (adx4h.adx > 25 && adx4h.plusDI > adx4h.minusDI) {
                confluenceScore += 1;
                confluenceDetails.push({ name: 'ADX 4h', value: `${adx4h.adx.toFixed(1)} (${adx4hStrength})`, signal: 'LONG', weight: 1, color: '#22c55e' });
            } else if (adx4h.adx > 25 && adx4h.plusDI < adx4h.minusDI) {
                confluenceScore -= 1;
                confluenceDetails.push({ name: 'ADX 4h', value: `${adx4h.adx.toFixed(1)} (${adx4hStrength})`, signal: 'SHORT', weight: 1, color: '#ef4444' });
            } else {
                confluenceDetails.push({ name: 'ADX 4h', value: `${adx4h.adx.toFixed(1)} (${adx4hStrength})`, signal: 'NEUTRO', weight: 0, color: '#94a3b8' });
            }
            
            // Stochastic 4h (peso 1 — confirma momentum em timeframe maior)
            if (stoch4h.k < 20 && stoch4h.k > stoch4h.d) {
                confluenceScore += 1;
                confluenceDetails.push({ name: 'Stochastic 4h', value: `K:${stoch4h.k.toFixed(1)} D:${stoch4h.d.toFixed(1)}`, signal: 'LONG', weight: 1, color: '#22c55e' });
            } else if (stoch4h.k > 80 && stoch4h.k < stoch4h.d) {
                confluenceScore -= 1;
                confluenceDetails.push({ name: 'Stochastic 4h', value: `K:${stoch4h.k.toFixed(1)} D:${stoch4h.d.toFixed(1)}`, signal: 'SHORT', weight: 1, color: '#ef4444' });
            } else {
                confluenceDetails.push({ name: 'Stochastic 4h', value: `K:${stoch4h.k.toFixed(1)} D:${stoch4h.d.toFixed(1)}`, signal: 'NEUTRO', weight: 0, color: '#94a3b8' });
            }
            
            // Net Volume 1h (peso 1.5) — threshold significativo
            if (netVolume1h.delta > 0 && netVolume1h.ratio > 3) {
                confluenceScore += 1.5;
                confluenceDetails.push({ name: 'Net Volume 1h', value: `+${netVolume1h.ratio.toFixed(1)}%`, signal: 'LONG', weight: 1.5, color: '#22c55e' });
            } else if (netVolume1h.delta < 0 && netVolume1h.ratio < -3) {
                confluenceScore -= 1.5;
                confluenceDetails.push({ name: 'Net Volume 1h', value: `${netVolume1h.ratio.toFixed(1)}%`, signal: 'SHORT', weight: 1.5, color: '#ef4444' });
            } else {
                confluenceDetails.push({ name: 'Net Volume 1h', value: `${netVolume1h.ratio.toFixed(1)}%`, signal: 'NEUTRO', weight: 0, color: '#94a3b8' });
            }
            
            // Net Volume 4h (peso 1.5) — threshold significativo
            if (netVolume4h.delta > 0 && netVolume4h.ratio > 3) {
                confluenceScore += 1.5;
                confluenceDetails.push({ name: 'Net Volume 4h', value: `+${netVolume4h.ratio.toFixed(1)}%`, signal: 'LONG', weight: 1.5, color: '#22c55e' });
            } else if (netVolume4h.delta < 0 && netVolume4h.ratio < -3) {
                confluenceScore -= 1.5;
                confluenceDetails.push({ name: 'Net Volume 4h', value: `${netVolume4h.ratio.toFixed(1)}%`, signal: 'SHORT', weight: 1.5, color: '#ef4444' });
            } else {
                confluenceDetails.push({ name: 'Net Volume 4h', value: `${netVolume4h.ratio.toFixed(1)}%`, signal: 'NEUTRO', weight: 0, color: '#94a3b8' });
            }
            
            // ============================================
            // MAPA DE RISCO DE LIQUIDAÇÃO PENDENTE (peso variável até 2.2)
            // ============================================
            if (liquidationRiskMap.hasData) {
                const liqImpact = Math.abs(liquidationRiskMap.confluenceImpact || 0);
                const liqWeight = Math.max(0.8, Math.min(2.2, liqImpact));

                if (liquidationRiskMap.signal === 'LONG') {
                    confluenceScore += liqWeight;
                    confluenceDetails.push({
                        name: 'Mapa Liquidações',
                        value: `${liquidationRiskMap.shortPct.toFixed(0)}% shorts em risco`,
                        signal: 'LONG',
                        weight: liqWeight,
                        color: '#22c55e',
                        isEstimate: true
                    });
                } else if (liquidationRiskMap.signal === 'SHORT') {
                    confluenceScore -= liqWeight;
                    confluenceDetails.push({
                        name: 'Mapa Liquidações',
                        value: `${liquidationRiskMap.longPct.toFixed(0)}% longs em risco`,
                        signal: 'SHORT',
                        weight: liqWeight,
                        color: '#ef4444',
                        isEstimate: true
                    });
                } else {
                    confluenceDetails.push({
                        name: 'Mapa Liquidações',
                        value: `${liquidationRiskMap.shortPct.toFixed(0)}S / ${liquidationRiskMap.longPct.toFixed(0)}L`,
                        signal: 'NEUTRO',
                        weight: 0,
                        color: '#94a3b8',
                        isEstimate: true
                    });
                }

                // Concentração de risco próxima ao preço atual acelera o efeito de confluência
                if (liquidationRiskMap.nearPct >= 30 && liquidationRiskMap.signal !== 'NEUTRO') {
                    const nearWeight = Math.min(0.7, Math.max(0.25, liqWeight * 0.35));
                    confluenceScore += liquidationRiskMap.signal === 'LONG' ? nearWeight : -nearWeight;
                    confluenceDetails.push({
                        name: 'Concentração Próxima',
                        value: `${liquidationRiskMap.nearPct.toFixed(0)}% em até 3%`,
                        signal: liquidationRiskMap.signal,
                        weight: nearWeight,
                        color: liquidationRiskMap.signal === 'LONG' ? '#22c55e' : '#ef4444',
                        isEstimate: true
                    });
                }
            }
            
            // ============================================
            // 1. VOLUME PROFILE ANALYSIS
            // ============================================
            const volumeProfile = calculateVolumeProfile(klines1h);
            // v7.1: Guard against undefined/NaN volume profile values
            const poc = volumeProfile?.poc || currentPrice;
            const vah = volumeProfile?.vah || currentPrice * 1.02;
            const val = volumeProfile?.val || currentPrice * 0.98;
            
            // Localização do preço
            let priceLocation = 'neutral';
            let priceLocationScore = 0;
            if (currentPrice > vah) {
                priceLocation = 'above_value';
                priceLocationScore = -1; // Caro
            } else if (currentPrice < val) {
                priceLocation = 'below_value';
                priceLocationScore = 1; // Barato
            } else if (currentPrice > poc) {
                priceLocation = 'upper_value';
                priceLocationScore = -0.5;
            } else {
                priceLocation = 'lower_value';
                priceLocationScore = 0.5;
            }
            
            // ============================================
            // S/R BREAKOUT DETECTION → Confluence
            // ============================================
            const sr = calculateSupportResistance(klines1h, currentPrice, ema50, sma50, sma200, val, vah, klines4h, klines1d);
            const srSupport = sr.support || currentPrice * 0.98;
            const srResistance = sr.resistance || currentPrice * 1.02;
            
            // Check volume confirmation: recent 3 candles vs average
            const _srVolumes = klines1h.slice(-20).map(k => parseFloat(k[5]));
            const _srAvgVol = _srVolumes.slice(0, -3).reduce((a, b) => a + b, 0) / Math.max(_srVolumes.length - 3, 1);
            const _srRecentVol = _srVolumes.slice(-3).reduce((a, b) => a + b, 0) / 3;
            const _srVolRatio = _srRecentVol / Math.max(_srAvgVol, 1);
            const _srHasVolume = _srVolRatio > 1.3; // Volume acima da média = confirmação
            
            // Resistance breakout (price above resistance)
            const _srResBreakPct = srResistance > 0 ? ((currentPrice - srResistance) / srResistance * 100) : 0;
            if (_srResBreakPct > 0.1 && _srHasVolume) {
                // Strong breakout with volume
                const breakWeight = _srResBreakPct > 1 ? 2 : 1.5;
                confluenceScore += breakWeight;
                confluenceDetails.push({
                    name: 'Breakout Resistência',
                    value: `+${_srResBreakPct.toFixed(2)}% (Vol ${_srVolRatio.toFixed(1)}x)`,
                    signal: 'LONG',
                    weight: breakWeight,
                    color: '#22c55e'
                });
            } else if (_srResBreakPct > 0.1 && !_srHasVolume) {
                // Breakout without volume — weaker signal
                confluenceScore += 0.5;
                confluenceDetails.push({
                    name: 'Breakout Resistência',
                    value: `+${_srResBreakPct.toFixed(2)}% (s/ vol)`,
                    signal: 'LONG',
                    weight: 0.5,
                    color: '#86efac'
                });
            }
            
            // Support breakout (price below support)
            const _srSupBreakPct = srSupport > 0 ? ((srSupport - currentPrice) / srSupport * 100) : 0;
            if (_srSupBreakPct > 0.1 && _srHasVolume) {
                // Strong breakdown with volume
                const breakWeight = _srSupBreakPct > 1 ? 2 : 1.5;
                confluenceScore -= breakWeight;
                confluenceDetails.push({
                    name: 'Rompimento Suporte',
                    value: `-${_srSupBreakPct.toFixed(2)}% (Vol ${_srVolRatio.toFixed(1)}x)`,
                    signal: 'SHORT',
                    weight: breakWeight,
                    color: '#ef4444'
                });
            } else if (_srSupBreakPct > 0.1 && !_srHasVolume) {
                // Breakdown without volume — weaker signal
                confluenceScore -= 0.5;
                confluenceDetails.push({
                    name: 'Rompimento Suporte',
                    value: `-${_srSupBreakPct.toFixed(2)}% (s/ vol)`,
                    signal: 'SHORT',
                    weight: 0.5,
                    color: '#fca5a5'
                });
            }
            
            // ============================================
            // 2. ORDER FLOW ANALYSIS
            // ============================================
            // Funding Rate
            const fundingRateValue = parseFloat(fundingRate.fundingRate || 0) * 100;
            let fundingSignal = 'neutral';
            let fundingScore = 0;
            if (fundingRateValue > 0.05) {
                fundingSignal = 'bearish'; // Muito positivo = multidão comprada = short
                fundingScore = -1;
            } else if (fundingRateValue > 0.01) {
                fundingSignal = 'slightly_bearish';
                fundingScore = -0.5;
            } else if (fundingRateValue < -0.05) {
                fundingSignal = 'very_bullish'; // Extremamente negativo = short squeeze potencial
                fundingScore = 1.5;
            } else if (fundingRateValue < -0.01) {
                fundingSignal = 'bullish'; // Negativo = multidão vendida = long
                fundingScore = 1;
            }
            
            // Open Interest
            const oiValue = parseFloat(openInterest.openInterest || 0);
            const oiChange = calculateOIChange(klines1h, ticker24h);
            let oiSignal = 'neutral';
            if (oiChange > 5) {
                oiSignal = 'increasing'; // Dinheiro novo entrando
            } else if (oiChange < -5) {
                oiSignal = 'decreasing'; // Dinheiro saindo
            }
            
            // CVD (Cumulative Volume Delta)
            const cvd = calculateCVD(trades);
            let cvdSignal = 'neutral';
            let cvdScore = 0;
            if (cvd.delta > 0 && cvd.trend === 'up') {
                cvdSignal = 'bullish';
                cvdScore = 1;
            } else if (cvd.delta < 0 && cvd.trend === 'down') {
                cvdSignal = 'bearish';
                cvdScore = -1;
            } else if (cvd.delta > 0 && cvd.trend === 'down') {
                cvdSignal = 'absorption_bullish'; // Compradores absorvendo
                cvdScore = 1.5;
            } else if (cvd.delta < 0 && cvd.trend === 'up') {
                cvdSignal = 'absorption_bearish'; // Vendedores absorvendo
                cvdScore = -1.5;
            }
            
            // ============================================
            // 3. MICROSTRUCTURE ANALYSIS
            // ============================================
            // Order Book Imbalance
            const bookImbalance = calculateBookImbalance(orderBook);
            let bookSignal = 'neutral';
            let bookScore = 0;
            if (bookImbalance.ratio > 1.5) {
                bookSignal = 'bid_heavy'; // Mais bids = bullish
                bookScore = 1;
            } else if (bookImbalance.ratio < 0.67) {
                bookSignal = 'ask_heavy'; // Mais asks = bearish
                bookScore = -1;
            }
            
            // Liquidation Levels (estimados a partir do order book)
            const liquidityPools = findLiquidityPools(orderBook, currentPrice);
            
            // ============================================
            // 4. TECHNICAL INDICATORS
            // ============================================
            const rsi = calculateRSI(klines1h);
            let rsiSignal = 'neutral';
            let rsiScore = 0;
            if (rsi < 30) {
                rsiSignal = 'oversold';
                rsiScore = 1;
            } else if (rsi > 70) {
                rsiSignal = 'overbought';
                rsiScore = -1;
            }
            
            // Taker Buy/Sell como proxy de sentimento (substitui long/short ratio defasado)
            const takerRatio = takerBuySellVol?.length > 0 ?
                takerBuySellVol.reduce((s, v) => s + parseFloat(v.buyVol || 0), 0) /
                Math.max(takerBuySellVol.reduce((s, v) => s + parseFloat(v.sellVol || 0), 0), 1) : 1;
            let lsSignal = 'neutral';
            let lsScore = 0;
            if (takerRatio > 1.3) {
                lsSignal = 'bullish';
                lsScore = 1;
            } else if (takerRatio < 0.77) {
                lsSignal = 'bearish';
                lsScore = -1;
            }
            
            // ============================================
            // 5. V2 ENGINE: Regime, Structure, CVD Advanced, Volatility, Macro
            // ============================================
            const V2 = window.TAEngineV2 || {};
            
            // 5a. Market Regime Detection
            const marketRegime = V2.detectMarketRegime ? 
                V2.detectMarketRegime(klines1h, klines4h, adx1h, adx4h, volumeProfile, currentPrice) :
                { regime: 'RANGING', regimeStrength: 0, regimeIcon: '⚖️', regimeColor: '#f59e0b', regimeDescription: 'N/A', regimeImplication: '', isTrending: false, isRange: true };
            
            // 5b. Market Structure (BOS/CHoCH)
            const marketStructure = V2.detectMarketStructure ?
                V2.detectMarketStructure(klines1h, klines4h, currentPrice) :
                { overallStructure: 'NEUTRO', structureScore: 0, structureDescription: '', liquiditySweeps: { detected: false } };
            
            // 5c. CVD Advanced
            const cvdAdvanced = V2.calculateCVDAdvanced ?
                V2.calculateCVDAdvanced(trades, klines1h, currentPrice) :
                { delta: cvd.delta, trend: cvd.trend, signal: cvdSignal, score: cvdScore, divergence: null, absorption: null, breakout: null, description: '' };
            
            // 5d. Volatility Metrics
            const volatilityMetrics = V2.calculateVolatilityMetrics ?
                V2.calculateVolatilityMetrics(klines1h, klines4h, klines1d) :
                { atr1h: calculateATR(klines1h), volRegime: 'NORMAL', volColor: '#f59e0b', volIcon: '📊', volDescription: '' };
            
            // 5e. Contextual Scoring (regime-aware, non-linear)
            const contextual = V2.applyContextualScoring ?
                V2.applyContextualScoring(confluenceDetails, marketRegime, marketStructure, cvdAdvanced, null, volatilityMetrics) :
                { adjustedScore: confluenceScore, adjustedDetails: confluenceDetails, adjustments: [], originalScore: confluenceScore };
            
            // Combinar scores
            const orderFlowScore = priceLocationScore + fundingScore + cvdScore + bookScore + rsiScore + lsScore;
            const totalScore = contextual.adjustedScore + orderFlowScore;
            const maxScore = 37; // Updated: added ADX 4h (1) + Stochastic 4h (1)
            
            // Contar indicadores alinhados
            const longIndicators = confluenceDetails.filter(i => i.signal === 'LONG').length;
            const shortIndicators = confluenceDetails.filter(i => i.signal === 'SHORT').length;
            const neutralIndicators = confluenceDetails.filter(i => i.signal === 'NEUTRO').length;
            const totalIndicators = confluenceDetails.length;
            
            // Probabilidade baseada em confluência contextual
            let probability = 50;
            if (totalScore > 0) {
                probability = Math.min(50 + (totalScore / maxScore) * 45, 95);
            } else if (totalScore < 0) {
                probability = Math.max(50 + (totalScore / maxScore) * 45, 5);
            }
            
            // Confiança baseada em quantos indicadores concordam + regime alignment
            const alignedIndicators = Math.max(longIndicators, shortIndicators);
            const alignmentRatio = alignedIndicators / totalIndicators;
            let confidence = Math.round(Math.min(alignmentRatio * 100 + Math.abs(totalScore) * 2, 95));
            
            // Regime alignment bonus/penalty
            if (marketRegime.isTrending) {
                const trendDirection = marketRegime.regime === 'TRENDING_UP' ? 1 : -1;
                if ((totalScore > 0 && trendDirection > 0) || (totalScore < 0 && trendDirection < 0)) {
                    confidence = Math.min(confidence + 10, 95); // Aligned with trend
                } else {
                    confidence = Math.max(confidence - 10, 10); // Counter-trend
                }
            }
            
            let signal = 'NEUTRO';
            let signalType = 'neutral';
            if (totalScore >= 2) {
                signal = 'LONG';
                signalType = 'long';
            } else if (totalScore <= -2) {
                signal = 'SHORT';
                signalType = 'short';
            }
            
            // 5f. Dynamic Targets (ATR-based with multi-TP)
            const atr = calculateATR(klines1h);
            const dynamicTargets = V2.calculateDynamicTargets ?
                V2.calculateDynamicTargets(signalType, currentPrice, volatilityMetrics.atr1h || atr, volatilityMetrics.atr4h || atr, poc, vah, val) :
                null;
            
            let entry, stopLoss, takeProfit, riskReward;
            
            if (dynamicTargets && dynamicTargets.entry) {
                entry = dynamicTargets.entry;
                stopLoss = dynamicTargets.sl;
                takeProfit = dynamicTargets.tp2; // Use TP2 as primary
                riskReward = dynamicTargets.rr2 || '2.0';
            } else if (signalType === 'long') {
                entry = currentPrice;
                stopLoss = Math.max(val, currentPrice - (atr * 1.5));
                takeProfit = currentPrice + (atr * 3);
                riskReward = ((takeProfit - entry) / (entry - stopLoss)).toFixed(2);
            } else if (signalType === 'short') {
                entry = currentPrice;
                stopLoss = Math.min(vah, currentPrice + (atr * 1.5));
                takeProfit = currentPrice - (atr * 3);
                riskReward = ((entry - takeProfit) / (stopLoss - entry)).toFixed(2);
            } else {
                entry = null; stopLoss = null; takeProfit = null; riskReward = null;
            }
            
            // Generate AI Summary (enhanced)
            const aiSummary = generateAISummary(signalType, confidence, {
                priceLocation, fundingSignal, cvdSignal, bookSignal, rsiSignal, lsSignal, poc, vah, val,
                confluenceDetails, longIndicators, shortIndicators, totalIndicators,
                movingAverages: { ema9, ema21, ema50, sma50, sma99, sma200, currentPrice },
                bookImbalance: bookImbalance,
                whaleActivity: whaleActivity,
                // V2 data for enhanced summary
                marketRegime, marketStructure, cvdAdvanced, volatilityMetrics,
                bigTechMacro: null // Will be set post-generation when data arrives
            }, symbol);
            
            return {
                signal,
                signalType,
                confidence: Math.round(confidence),
                probability: Math.round(probability),
                entry,
                stopLoss,
                takeProfit,
                riskReward: riskReward !== null ? (typeof riskReward === 'string' ? riskReward : riskReward.toFixed(2)) : null,
                dynamicTargets,
                confluenceDetails: contextual.adjustedDetails || confluenceDetails,
                confluenceSummary: {
                    long: longIndicators,
                    short: shortIndicators,
                    neutral: neutralIndicators,
                    total: totalIndicators,
                    score: totalScore.toFixed(1),
                    originalScore: contextual.originalScore?.toFixed(1) || confluenceScore.toFixed(1)
                },
                // V2 additions
                marketRegime,
                marketStructure,
                cvdAdvanced,
                volatilityMetrics,
                contextualAdjustments: contextual.adjustments || [],
                indicators: {
                    volumeProfile: { poc, vah, val, vwap, priceLocation },
                    orderFlow: { 
                        fundingRate: (fundingRateValue || 0).toFixed(4),
                        fundingSignal,
                        oiChange: (oiChange || 0).toFixed(2),
                        oiSignal,
                        cvd: cvd.delta,
                        cvdSignal
                    },
                    microstructure: {
                        bookImbalance: ((bookImbalance?.ratio) || 0).toFixed(2),
                        bookSignal,
                        bidVolume: bookImbalance.bidVolume,
                        askVolume: bookImbalance.askVolume,
                        liquidityPools
                    },
                    sentiment: {
                        rsi: (rsi || 0).toFixed(1),
                        rsiSignal,
                        takerRatio: (takerRatio || 0).toFixed(2),
                        lsSignal
                    },
                    multiTimeframe: {
                        rsi15m: (rsi15m || 0).toFixed(1),
                        rsi1h: (rsi1h || 0).toFixed(1),
                        rsi4h: (rsi4h || 0).toFixed(1),
                        ema200_1h: (ema200_1h || 0).toFixed(2),
                        ema200_4h: (ema200_4h || 0).toFixed(2),
                        macd1h: macd1h,
                        macd4h: macd4h,
                        adx1h: adx1h,
                        stoch1h: stoch1h,
                        netVolume1h: netVolume1h,
                        netVolume4h: netVolume4h
                    },
                    movingAverages: {
                        ema9: (ema9 || 0).toFixed(2),
                        ema21: (ema21 || 0).toFixed(2),
                        ema50: (ema50 || 0).toFixed(2),
                        sma50: (sma50 || 0).toFixed(2),
                        sma99: (sma99 || 0).toFixed(2),
                        sma200: (sma200 || 0).toFixed(2),
                        currentPrice: currentPrice,
                        support: (srSupport || 0).toFixed(2),
                        resistance: (srResistance || 0).toFixed(2)
                    },
                    orderBookDetail: {
                        bids: orderBook.bids?.slice(0, 5) || [],
                        asks: orderBook.asks?.slice(0, 5) || []
                    },
                    chartAnalysis: chartAnalysis,
                    realLiquidations: realLiquidations,
                    liquidationRiskMap: liquidationRiskMap,
                    liquidationHeatmap: liquidationHeatmap
                },
                aiSummary,
                timestamp: Date.now()
            };
        }
        
        // ============================================
        // ANÁLISE DE PADRÕES GRÁFICOS MULTI-TIMEFRAME
        // ============================================
        function analyzeChartPatterns(klines15m, klines1h, currentPrice) {
            const result = {
                timeframes: {},
                overallSignal: 'NEUTRO',
                entryZones: { long: [], short: [] },
                confluenceScore: 0
            };
            
            // V7: Apenas timeframes estruturais (removido 1m/5m = ruído)
            const tfData = [
                { name: '15m', klines: klines15m, weight: 1.5 },
                { name: '1h', klines: klines1h, weight: 2.5 }
            ];
            
            let totalScore = 0;
            let totalWeight = 0;
            
            tfData.forEach(tf => {
                if (!tf.klines || tf.klines.length < 10) {
                    result.timeframes[tf.name] = { signal: 'N/A', trend: 'Sem dados' };
                    return;
                }
                
                const analysis = analyzeTimeframe(tf.klines, currentPrice);
                result.timeframes[tf.name] = analysis;
                
                // Calcular score ponderado
                if (analysis.signal === 'LONG') {
                    totalScore += tf.weight;
                } else if (analysis.signal === 'SHORT') {
                    totalScore -= tf.weight;
                }
                totalWeight += tf.weight;
            });
            
            // Calcular sinal geral
            const normalizedScore = totalWeight > 0 ? totalScore / totalWeight : 0;
            result.confluenceScore = normalizedScore * 2; // Peso 2 para confluência geral
            
            if (normalizedScore > 0.3) {
                result.overallSignal = 'LONG';
            } else if (normalizedScore < -0.3) {
                result.overallSignal = 'SHORT';
            }
            
            // Identificar zonas de entrada
            const levels = findKeyLevels(klines1h, currentPrice);
            if (result.overallSignal === 'LONG') {
                result.entryZones.long = levels.supports;
            } else if (result.overallSignal === 'SHORT') {
                result.entryZones.short = levels.resistances;
            }
            
            return result;
        }
        
        function analyzeTimeframe(klines, currentPrice) {
            if (!klines || klines.length < 5) return { signal: 'N/A', trend: 'Sem dados', patterns: [], hhCount: 0, llCount: 0
 };
            
            const data = klines.slice(-50);
            const opens = data.map(k => parseFloat(k[1]));
            const closes = data.map(k => parseFloat(k[4]));
            const highs = data.map(k => parseFloat(k[2]));
            const lows = data.map(k => parseFloat(k[3]));
            const volumes = data.map(k => parseFloat(k[5]));
            
            // Calcular múltiplas EMAs
            const ema8 = calculateEMAFromArray(closes, 8);
            const ema21 = calculateEMAFromArray(closes, 21);
            const ema50 = closes.length >= 50 ? calculateEMAFromArray(closes, 50) : null;
            
            // Tendência baseada em EMAs
            const emaTrend = ema8 > ema21 ? 'ALTA' : 'BAIXA';
            const emaCross = Math.abs(ema8 - ema21) / ema21 * 100;
            const emaCrossType = ema8 > ema21 ? (emaCross < 0.1 ? 'CRUZANDO_ALTA' : 'GOLDEN') : (emaCross < 0.1 ? 'CRUZANDO_BAIXA' : 'DEATH');
            
            // Momentum (últimas 5 velas)
            const recentCloses = closes.slice(-5);
            const momentum = (recentCloses[recentCloses.length - 1] - recentCloses[0]) / recentCloses[0] * 100;
            
            // Higher Highs / Lower Lows (últimas 10 velas)
            const analHighs = highs.slice(-10);
            const analLows = lows.slice(-10);
            const hhCount = analHighs.filter((h, i) => i > 0 && h > analHighs[i-1]).length;
            const llCount = analLows.filter((l, i) => i > 0 && l < analLows[i-1]).length;
            const hlCount = analLows.filter((l, i) => i > 0 && l > analLows[i-1]).length;
            const lhCount = analHighs.filter((h, i) => i > 0 && h < analHighs[i-1]).length;
            
            // Volume trend
            const avgVol = volumes.slice(0, -5).reduce((a,b) => a+b, 0) / Math.max(1, volumes.length - 5);
            const recentVol = volumes.slice(-5).reduce((a,b) => a+b, 0) / 5;
            const volRatio = avgVol > 0 ? ((recentVol / avgVol) * 100).toFixed(0) : 100;
            const volTrend = recentVol > avgVol * 1.2 ? 'AUMENTANDO' : recentVol < avgVol * 0.8 ? 'DIMINUINDO' : 'ESTÁVEL';
            
            // ===== DETECÇÃO DE PADRÕES DE CANDLESTICK =====
            const patterns = [];
            const len = opens.length;
            if (len >= 3) {
                const last = len - 1;
                const o = opens[last], c = closes[last], h = highs[last], l = lows[last];
                const prev_o = opens[last-1], prev_c = closes[last-1], prev_h = highs[last-1], prev_l = lows[last-1];
                const body = Math.abs(c - o);
                const fullRange = h - l;
                const upperWick = h - Math.max(o, c);
                const lowerWick = Math.min(o, c) - l;
                const prevBody = Math.abs(prev_c - prev_o);
                
                // Doji (corpo < 10% da range)
                if (fullRange > 0 && body / fullRange < 0.1) {
                    patterns.push({ name: 'Doji', icon: '✚', type: 'reversal', bias: 'neutro' });
                }
                // Hammer / Inverted Hammer
                if (fullRange > 0 && lowerWick > body * 2 && upperWick < body * 0.5) {
                    const isBull = c > o;
                    patterns.push({ name: 'Martelo', icon: '🔨', type: 'reversal', bias: isBull ? 'alta' : 'alta' });
                }
                if (fullRange > 0 && upperWick > body * 2 && lowerWick < body * 0.5) {
                    patterns.push({ name: 'Shooting Star', icon: '⭐', type: 'reversal', bias: 'baixa' });
                }
                // Engulfing
                if (c > o && prev_c < prev_o && c > prev_o && o < prev_c) {
                    patterns.push({ name: 'Engolfo Alta', icon: '🟢', type: 'reversal', bias: 'alta' });
                }
                if (c < o && prev_c > prev_o && c < prev_o && o > prev_c) {
                    patterns.push({ name: 'Engolfo Baixa', icon: '🔴', type: 'reversal', bias: 'baixa' });
                }
                // Pin Bar
                if (fullRange > 0 && lowerWick / fullRange > 0.6 && body / fullRange < 0.2) {
                    patterns.push({ name: 'Pin Bar Alta', icon: '📌', type: 'reversal', bias: 'alta' });
                }
                if (fullRange > 0 && upperWick / fullRange > 0.6 && body / fullRange < 0.2) {
                    patterns.push({ name: 'Pin Bar Baixa', icon: '📌', type: 'reversal', bias: 'baixa' });
                }
                // Marubozu (corpo > 90% da range)
                if (fullRange > 0 && body / fullRange > 0.9) {
                    const isBull = c > o;
                    patterns.push({ name: isBull ? 'Marubozu Alta' : 'Marubozu Baixa', icon: isBull ? '💪' : '💀', type: 'continuation', bias: isBull ? 'alta' : 'baixa' });
                }
                // Three White Soldiers / Three Black Crows (últimas 3 velas)
                if (len >= 4) {
                    const c3 = [closes[last-2], closes[last-1], closes[last]];
                    const o3 = [opens[last-2], opens[last-1], opens[last]];
                    if (c3[0] > o3[0] && c3[1] > o3[1] && c3[2] > o3[2] && c3[1] > c3[0] && c3[2] > c3[1]) {
                        patterns.push({ name: '3 Soldados', icon: '🟢🟢🟢', type: 'continuation', bias: 'alta' });
                    }
                    if (c3[0] < o3[0] && c3[1] < o3[1] && c3[2] < o3[2] && c3[1] < c3[0] && c3[2] < c3[1]) {
                        patterns.push({ name: '3 Corvos', icon: '🔴🔴🔴', type: 'continuation', bias: 'baixa' });
                    }
                }
                // Morning Star / Evening Star
                if (len >= 4) {
                    const pp = { o: opens[last-2], c: closes[last-2] };
                    const mid = { o: opens[last-1], c: closes[last-1], body: Math.abs(closes[last-1] - opens[last-1]) };
                    if (pp.c < pp.o && mid.body < prevBody * 0.3 && c > o && c > (pp.o + pp.c) / 2) {
                        patterns.push({ name: 'Morning Star', icon: '🌅', type: 'reversal', bias: 'alta' });
                    }
                    if (pp.c > pp.o && mid.body < prevBody * 0.3 && c < o && c < (pp.o + pp.c) / 2) {
                        patterns.push({ name: 'Evening Star', icon: '🌆', type: 'reversal', bias: 'baixa' });
                    }
                }
            }
            
            // Calcular sinal com mais critérios
            let signal = 'NEUTRO';
            let strength = 0;
            let bullPatterns = patterns.filter(p => p.bias === 'alta').length;
            let bearPatterns = patterns.filter(p => p.bias === 'baixa').length;
            
            if (emaTrend === 'ALTA' && momentum > 0.05) {
                signal = 'LONG';
                strength = Math.min(Math.abs(momentum) * 5 + hhCount * 8 + hlCount * 5 + bullPatterns * 12, 100);
            } else if (emaTrend === 'BAIXA' && momentum < -0.05) {
                signal = 'SHORT';
                strength = Math.min(Math.abs(momentum) * 5 + llCount * 8 + lhCount * 5 + bearPatterns * 12, 100);
            } else if (bullPatterns > bearPatterns && momentum > 0) {
                signal = 'LONG';
                strength = Math.min(30 + bullPatterns * 15, 80);
            } else if (bearPatterns > bullPatterns && momentum < 0) {
                signal = 'SHORT';
                strength = Math.min(30 + bearPatterns * 15, 80);
            }
            
            // Boost se volume confirma
            if (volTrend === 'AUMENTANDO' && signal !== 'NEUTRO') {
                strength = Math.min(strength + 15, 100);
            }
            
            // Estrutura de mercado
            let structure = 'Lateral';
            if (hhCount >= 3 && hlCount >= 2) structure = 'HH + HL (Alta)';
            else if (llCount >= 3 && lhCount >= 2) structure = 'LL + LH (Baixa)';
            else if (hhCount >= 2) structure = 'Higher Highs';
            else if (llCount >= 2) structure = 'Lower Lows';
            
            return {
                signal,
                trend: emaTrend,
                momentum: momentum.toFixed(2) + '%',
                volume: volTrend,
                volRatio: volRatio + '%',
                strength: Math.min(strength, 100),
                ema8: ema8.toFixed(2),
                ema21: ema21.toFixed(2),
                emaCross: emaCrossType,
                hhCount, llCount, hlCount, lhCount,
                structure,
                patterns: patterns.slice(0, 3),
                candlesAnalyzed: data.length
            };
        }
        
        function findKeyLevels(klines, currentPrice) {
            if (!klines || klines.length < 20) return { supports: [], resistances: [] };
            
            const pivots = [];
            for (let i = 2; i < klines.length - 2; i++) {
                const high = parseFloat(klines[i][2]);
                const low = parseFloat(klines[i][3]);
                const prevHigh = parseFloat(klines[i-1][2]);
                const nextHigh = parseFloat(klines[i+1][2]);
                const prevLow = parseFloat(klines[i-1][3]);
                const nextLow = parseFloat(klines[i+1][3]);
                
                // Pivot High
                if (high > prevHigh && high > nextHigh) {
                    pivots.push({ type: 'resistance', price: high });
                }
                // Pivot Low
                if (low < prevLow && low < nextLow) {
                    pivots.push({ type: 'support', price: low });
                }
            }
            
            // Filtrar níveis próximos ao preço atual (±10%)
            const supports = pivots
                .filter(p => p.type === 'support' && p.price < currentPrice && p.price > currentPrice * 0.9)
                .map(p => p.price)
                .sort((a, b) => b - a)
                .slice(0, 3);
            
            const resistances = pivots
                .filter(p => p.type === 'resistance' && p.price > currentPrice && p.price < currentPrice * 1.1)
                .map(p => p.price)
                .sort((a, b) => a - b)
                .slice(0, 3);
            
            return { supports, resistances };
        }
        
        function calculateEMAFromArray(data, period) {
            if (!data || data.length < period) return data[data.length - 1] || 0;
            const k = 2 / (period + 1);
            let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
            for (let i = period; i < data.length; i++) {
                ema = data[i] * k + ema * (1 - k);
            }
            return ema;
        }
        
        // ============================================
        // HEATMAP DE LIQUIDAÇÕES
        // ============================================
        function calculateLiquidationHeatmap(currentPrice, openInterest, orderBook, takerBuySellVol) {
            const result = {
                longLiquidations: [],
                shortLiquidations: [],
                totalLongLiqRisk: 0,
                totalShortLiqRisk: 0,
                dominantSide: 'NEUTRO',
                confluenceScore: 0
            };
            
            if (!currentPrice || currentPrice <= 0) return result;
            
            const oiValue = parseFloat(openInterest?.openInterest || 0);
            
            // Estimar níveis de liquidação baseado em alavancagem típica
            // Níveis comuns: 2x, 3x, 5x, 10x, 20x, 25x, 50x, 100x
            const leverages = [2, 3, 5, 10, 20, 25, 50, 100];
            
            // Para LONG: liquidação = entrada * (1 - 1/alavancagem)
            // Para SHORT: liquidação = entrada * (1 + 1/alavancagem)
            leverages.forEach(lev => {
                const longLiqPrice = currentPrice * (1 - (0.9 / lev)); // 90% do movimento para liq
                const shortLiqPrice = currentPrice * (1 + (0.9 / lev));
                
                // Estimar volume baseado em order book nas proximidades
                const longVolume = estimateVolumeAtLevel(orderBook, longLiqPrice, 'bid');
                const shortVolume = estimateVolumeAtLevel(orderBook, shortLiqPrice, 'ask');
                
                result.longLiquidations.push({
                    leverage: lev + 'x',
                    price: longLiqPrice,
                    distance: ((currentPrice - longLiqPrice) / currentPrice * 100).toFixed(2) + '%',
                    estimatedVolume: longVolume
                });
                
                result.shortLiquidations.push({
                    leverage: lev + 'x',
                    price: shortLiqPrice,
                    distance: ((shortLiqPrice - currentPrice) / currentPrice * 100).toFixed(2) + '%',
                    estimatedVolume: shortVolume
                });
            });
            
            // Calcular risco total de liquidação
            const bids = orderBook?.bids || [];
            const asks = orderBook?.asks || [];
            
            // Volume total em cada lado
            const totalBidVol = bids.slice(0, 50).reduce((sum, b) => sum + parseFloat(b[1]), 0);
            const totalAskVol = asks.slice(0, 50).reduce((sum, a) => sum + parseFloat(a[1]), 0);
            
            result.totalLongLiqRisk = totalBidVol;
            result.totalShortLiqRisk = totalAskVol;
            
            // Analisar Taker Buy/Sell para ver pressão
            let buyPressure = 0, sellPressure = 0;
            if (takerBuySellVol && takerBuySellVol.length > 0) {
                takerBuySellVol.forEach(vol => {
                    buyPressure += parseFloat(vol.buyVol || 0);
                    sellPressure += parseFloat(vol.sellVol || 0);
                });
            }
            
            // Determinar lado dominante
            const bidAskRatio = totalBidVol / Math.max(totalAskVol, 1);
            const buySellRatio = buyPressure / Math.max(sellPressure, 1);
            
            if (bidAskRatio > 1.3 && buySellRatio > 1.1) {
                result.dominantSide = 'SHORTS EM RISCO';
                result.confluenceScore = 1.5; // Favorece LONG
            } else if (bidAskRatio < 0.7 && buySellRatio < 0.9) {
                result.dominantSide = 'LONGS EM RISCO';
                result.confluenceScore = -1.5; // Favorece SHORT
            } else if (buyPressure > sellPressure * 1.2) {
                result.dominantSide = 'COMPRADORES DOMINAM';
                result.confluenceScore = 1;
            } else if (sellPressure > buyPressure * 1.2) {
                result.dominantSide = 'VENDEDORES DOMINAM';
                result.confluenceScore = -1;
            }
            
            return result;
        }
        
        function estimateVolumeAtLevel(orderBook, targetPrice, side) {
            const orders = side === 'bid' ? (orderBook?.bids || []) : (orderBook?.asks || []);
            let volume = 0;
            const tolerance = targetPrice * 0.005; // 0.5% de tolerância
            
            orders.forEach(order => {
                const price = parseFloat(order[0]);
                if (Math.abs(price - targetPrice) <= tolerance) {
                    volume += parseFloat(order[1]);
                }
            });
            
            return volume;
        }
        
        // ============================================
        // DETECÇÃO DE INÍCIO DE TENDÊNCIA (REAL)
        // Identifica quando uma nova tendência está começando
        // ============================================
        function detectTrendStart(klines1m, klines5m, klines15m, klines1h, currentPrice) {
            const result = {
                isStartingUp: false,
                isStartingDown: false,
                signal: 'NEUTRO',
                confidence: 0,
                triggers: [],
                dataSource: 'CALCULADO (Klines Binance)'
            };
            
            if (!klines1h || klines1h.length < 30) return result;
            
            // 1. CRUZAMENTO DE EMAs (Golden Cross / Death Cross)
            const closes1h = klines1h.slice(-30).map(k => parseFloat(k[4]));
            const ema8 = calculateEMAFromArray(closes1h, 8);
            const ema21 = calculateEMAFromArray(closes1h, 21);
            const ema8Prev = calculateEMAFromArray(closes1h.slice(0, -1), 8);
            const ema21Prev = calculateEMAFromArray(closes1h.slice(0, -1), 21);
            
            const goldenCross = ema8Prev < ema21Prev && ema8 > ema21;
            const deathCross = ema8Prev > ema21Prev && ema8 < ema21;
            
            if (goldenCross) {
                result.triggers.push({ trigger: 'Golden Cross (EMA8 cruzou EMA21)', direction: 'UP', weight: 3 });
            }
            if (deathCross) {
                result.triggers.push({ trigger: 'Death Cross (EMA8 cruzou EMA21)', direction: 'DOWN', weight: 3 });
            }
            
            // 2. BREAKOUT DE CONSOLIDAÇÃO
            const highs1h = klines1h.slice(-20).map(k => parseFloat(k[2]));
            const lows1h = klines1h.slice(-20).map(k => parseFloat(k[3]));
            const recentHigh = Math.max(...highs1h.slice(-10));
            const recentLow = Math.min(...lows1h.slice(-10));
            const rangeSize = (recentHigh - recentLow) / recentLow * 100;
            
            // Range apertado (< 3%) seguido de breakout
            if (rangeSize < 3) {
                if (currentPrice > recentHigh * 1.001) {
                    result.triggers.push({ trigger: 'Breakout de Alta (rompeu resistência)', direction: 'UP', weight: 2.5 });
                } else if (currentPrice < recentLow * 0.999) {
                    result.triggers.push({ trigger: 'Breakout de Baixa (rompeu suporte)', direction: 'DOWN', weight: 2.5 });
                }
            }
            
            // 3. VOLUME SPIKE - Volume anormal indica início de movimento
            const volumes1h = klines1h.slice(-20).map(k => parseFloat(k[5]));
            const avgVolume = volumes1h.slice(0, -3).reduce((a, b) => a + b, 0) / (volumes1h.length - 3);
            const recentVolume = volumes1h.slice(-3).reduce((a, b) => a + b, 0) / 3;
            const volumeRatio = recentVolume / Math.max(avgVolume, 1);
            
            if (volumeRatio > 2) {
                const lastClose = closes1h[closes1h.length - 1];
                const prevClose = closes1h[closes1h.length - 4];
                const direction = lastClose > prevClose ? 'UP' : 'DOWN';
                result.triggers.push({ 
                    trigger: `Volume Spike ${volumeRatio.toFixed(1)}x (${direction === 'UP' ? 'compradores' : 'vendedores'})`, 
                    direction, 
                    weight: 2 
                });
            }
            
            // 4. DIVERGÊNCIA RSI - Preço faz novo low, RSI não confirma
            const rsi = calculateRSIValues(closes1h);
            if (rsi.length >= 10) {
                const recentLows = lows1h.slice(-10);
                const recentRSI = rsi.slice(-10);
                const priceNewLow = recentLows[recentLows.length - 1] < Math.min(...recentLows.slice(0, -3));
                const rsiHigherLow = recentRSI[recentRSI.length - 1] > Math.min(...recentRSI.slice(0, -3));
                
                if (priceNewLow && rsiHigherLow) {
                    result.triggers.push({ trigger: 'Divergência Alta RSI (reversão provável)', direction: 'UP', weight: 2 });
                }
                
                const recentHighs = highs1h.slice(-10);
                const priceNewHigh = recentHighs[recentHighs.length - 1] > Math.max(...recentHighs.slice(0, -3));
                const rsiLowerHigh = recentRSI[recentRSI.length - 1] < Math.max(...recentRSI.slice(0, -3));
                
                if (priceNewHigh && rsiLowerHigh) {
                    result.triggers.push({ trigger: 'Divergência Baixa RSI (reversão provável)', direction: 'DOWN', weight: 2 });
                }
            }
            
            // 5. PADRÃO ENGULFING (Candlestick de reversão)
            if (klines1h.length >= 3) {
                const curr = klines1h[klines1h.length - 1];
                const prev = klines1h[klines1h.length - 2];
                const currOpen = parseFloat(curr[1]), currClose = parseFloat(curr[4]);
                const prevOpen = parseFloat(prev[1]), prevClose = parseFloat(prev[4]);
                
                // Bullish Engulfing
                if (prevClose < prevOpen && currClose > currOpen && 
                    currOpen <= prevClose && currClose >= prevOpen) {
                    result.triggers.push({ trigger: 'Bullish Engulfing (reversão de alta)', direction: 'UP', weight: 1.5 });
                }
                // Bearish Engulfing
                if (prevClose > prevOpen && currClose < currOpen && 
                    currOpen >= prevClose && currClose <= prevOpen) {
                    result.triggers.push({ trigger: 'Bearish Engulfing (reversão de baixa)', direction: 'DOWN', weight: 1.5 });
                }
            }
            
            // Calcular resultado final
            let upScore = 0, downScore = 0;
            result.triggers.forEach(t => {
                if (t.direction === 'UP') upScore += t.weight;
                else if (t.direction === 'DOWN') downScore += t.weight;
            });
            
            const totalScore = Math.max(upScore, downScore);
            if (upScore >= 3 && upScore > downScore * 1.5) {
                result.isStartingUp = true;
                result.signal = 'INÍCIO DE ALTA';
                result.confidence = Math.min(upScore / 10 * 100, 95);
            } else if (downScore >= 3 && downScore > upScore * 1.5) {
                result.isStartingDown = true;
                result.signal = 'INÍCIO DE QUEDA';
                result.confidence = Math.min(downScore / 10 * 100, 95);
            }
            
            return result;
        }
        
        function calculateRSIValues(closes) {
            if (closes.length < 15) return [];
            
            const rsiValues = [];
            for (let i = 14; i < closes.length; i++) {
                const slice = closes.slice(i - 14, i + 1);
                let gains = 0, losses = 0;
                for (let j = 1; j < slice.length; j++) {
                    const change = slice[j] - slice[j-1];
                    if (change > 0) gains += change;
                    else losses -= change;
                }
                const avgGain = gains / 14;
                const avgLoss = losses / 14;
                const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
                rsiValues.push(100 - (100 / (1 + rs)));
            }
            return rsiValues;
        }
        
        // ============================================
        // HEATMAP DE LIQUIDAÇÕES — DADOS REAIS
        // Baseado em ordens forçadas (allForceOrders) da Binance
        // + agregação via CoinGlass public endpoints
        // Dados acumulados server-side via Cloudflare KV (compartilhado entre todos os usuários)
        // ============================================

        async function fetchCoinglassLiquidations(symbol) {
            // CoinGlass public aggregated liquidation data (24h)
            const baseSymbol = symbol.replace('USDT', '');
            try {
                const resp = await fetch(`https://visor-crypto-api.onrender.com/api/proxy?url=${encodeURIComponent(
                    `https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=${symbol}&period=5m&limit=1`
                )}`);
                if (resp.ok) {
                    const data = await resp.json();
                    return data[0] || null;
                }
            } catch {}
            return null;
        }

        function analyzeRealLiquidations(forceOrders, currentPrice, openInterest, longShortRatio) {
            const result = {
                hasData: false,
                currentPrice: currentPrice || 0,
                isRealData: false,
                longLiqVolume: 0,
                shortLiqVolume: 0,
                longLiqCount: 0,
                shortLiqCount: 0,
                recentLiquidations: [],
                liquidationLevels: [],
                dominantRisk: 'NEUTRO',
                riskRatio: 1,
                lastUpdate: new Date().toLocaleTimeString('pt-BR'),
                dataSource: 'Sem dados'
            };
            
            if (!currentPrice || currentPrice <= 0) return result;
            
            // ─── FONTE PRIMÁRIA: Ordens forçadas reais da Binance ───
            const validForceOrders = Array.isArray(forceOrders) ? forceOrders.filter(o => 
                o && o.price && o.executedQty && o.side && o.time
            ) : [];

            if (validForceOrders.length > 0) {
                result.hasData = true;
                result.isRealData = true;
                result.dataSource = `Binance (${validForceOrders.length} liquidações)`;
                
                let longLiqVol = 0, shortLiqVol = 0;
                let longCount = 0, shortCount = 0;
                const levels = [];
                const now = Date.now();
                const recentWindow = 12 * 60 * 60 * 1000; // últimas 12h
                
                validForceOrders.forEach(order => {
                    const price = parseFloat(order.averagePrice || order.price);
                    const qty = parseFloat(order.executedQty || order.origQty);
                    const volumeUSD = price * qty;
                    const orderTime = parseInt(order.time);
                    const isRecent = (now - orderTime) < recentWindow;
                    
                    // side=BUY → SHORT foi liquidado (compra forçada p/ fechar short)
                    // side=SELL → LONG foi liquidado (venda forçada p/ fechar long)
                    const isSHORTLiq = order.side === 'BUY';
                    const isLONGLiq = order.side === 'SELL';
                    
                    if (isLONGLiq) {
                        longLiqVol += volumeUSD;
                        longCount++;
                    } else if (isSHORTLiq) {
                        shortLiqVol += volumeUSD;
                        shortCount++;
                    }
                    
                    const distance = ((price - currentPrice) / currentPrice * 100);
                    
                    levels.push({
                        type: isLONGLiq ? 'LONG' : 'SHORT',
                        price: price,
                        volume: volumeUSD,
                        distance: Math.abs(distance),
                        side: distance < 0 ? 'ABAIXO' : 'ACIMA',
                        time: orderTime,
                        isRecent: isRecent,
                        intensity: Math.min(volumeUSD / 10000, 100)
                    });
                });
                
                levels.sort((a, b) => a.distance - b.distance);
                result.liquidationLevels = levels.slice(0, 20); // top 20 mais próximos
                result.longLiqVolume = longLiqVol;
                result.shortLiqVolume = shortLiqVol;
                result.longLiqCount = longCount;
                result.shortLiqCount = shortCount;
                result.recentLiquidations = levels.filter(l => l.isRecent).slice(0, 10);
                
                const totalVol = longLiqVol + shortLiqVol;
                if (totalVol > 0) {
                    result.riskRatio = longLiqVol / Math.max(shortLiqVol, 1);
                    if (result.riskRatio > 1.5) {
                        result.dominantRisk = 'LONGS MAIS LIQUIDADOS';
                    } else if (result.riskRatio < 0.67) {
                        result.dominantRisk = 'SHORTS MAIS LIQUIDADOS';
                    } else {
                        result.dominantRisk = 'EQUILIBRADO';
                    }
                }
                
                return result;
            }
            
            // ─── FALLBACK: Estimativa via Open Interest ───
            const oiValue = parseFloat(openInterest?.openInterest || 0) * currentPrice;
            if (oiValue <= 0) return result;
            
            result.hasData = true;
            result.isRealData = false;
            result.dataSource = 'Estimativa (OI Real)';
            const lsRatio = parseFloat(longShortRatio?.longShortRatio || 1);
            
            const totalOI = oiValue;
            const longOI = totalOI * (lsRatio / (1 + lsRatio));
            const shortOI = totalOI * (1 / (1 + lsRatio));
            
            // Enhanced leverage distribution matching market reality
            const leverageDistribution = [
                { lev: 2, percent: 0.05 },
                { lev: 3, percent: 0.08 },
                { lev: 5, percent: 0.15 },
                { lev: 10, percent: 0.30 },
                { lev: 20, percent: 0.22 },
                { lev: 25, percent: 0.10 },
                { lev: 50, percent: 0.07 },
                { lev: 100, percent: 0.03 }
            ];
            
            const levels = [];
            const pendingLevels = [];
            leverageDistribution.forEach(({ lev, percent }) => {
                const longLiqPrice = currentPrice * (1 - (0.9 / lev));
                const shortLiqPrice = currentPrice * (1 + (0.9 / lev));
                const longAtRisk = longOI * percent;
                const shortAtRisk = shortOI * percent;
                
                levels.push({
                    type: 'LONG', leverage: lev, price: longLiqPrice,
                    volume: longAtRisk,
                    distance: ((currentPrice - longLiqPrice) / currentPrice * 100),
                    intensity: percent * 100
                });
                levels.push({
                    type: 'SHORT', leverage: lev, price: shortLiqPrice,
                    volume: shortAtRisk,
                    distance: ((shortLiqPrice - currentPrice) / currentPrice * 100),
                    intensity: percent * 100
                });
                pendingLevels.push({
                    leverage: lev, type: 'LONG',
                    liqPrice: Math.round(longLiqPrice * 100) / 100,
                    distPct: ((currentPrice - longLiqPrice) / currentPrice * 100).toFixed(2),
                    volumeUSD: Math.round(longAtRisk)
                });
                pendingLevels.push({
                    leverage: lev, type: 'SHORT',
                    liqPrice: Math.round(shortLiqPrice * 100) / 100,
                    distPct: ((shortLiqPrice - currentPrice) / currentPrice * 100).toFixed(2),
                    volumeUSD: Math.round(shortAtRisk)
                });
            });
            
            levels.sort((a, b) => a.distance - b.distance);
            result.liquidationLevels = levels;
            result.longLiqVolume = longOI;
            result.shortLiqVolume = shortOI;
            result.riskRatio = longOI / Math.max(shortOI, 1);
            result.openInterestUSD = Math.round(totalOI);
            result.longOI = Math.round(longOI);
            result.shortOI = Math.round(shortOI);
            result.longPct = Math.round((longOI / totalOI) * 1000) / 10;
            result.shortPct = Math.round((shortOI / totalOI) * 1000) / 10;
            result.pendingLevels = pendingLevels;
            result.totalPendingLong = Math.round(longOI);
            result.totalPendingShort = Math.round(shortOI);
            
            if (result.riskRatio > 1.3) {
                result.dominantRisk = 'LONGS EM RISCO';
            } else if (result.riskRatio < 0.77) {
                result.dominantRisk = 'SHORTS EM RISCO';
            } else {
                result.dominantRisk = 'EQUILIBRADO';
            }
            
            return result;
        }

        function buildLiquidationRiskMap(realLiquidations, currentPrice) {
            const empty = {
                hasData: false,
                pendingLongUSD: 0,
                pendingShortUSD: 0,
                longPct: 50,
                shortPct: 50,
                nearLongUSD: 0,
                nearShortUSD: 0,
                nearPct: 0,
                signal: 'NEUTRO',
                dominantRisk: 'NEUTRO',
                confluenceImpact: 0,
                bucketData: [],
                maxBucketUSD: 0,
                mode: 'none',
                insight: 'Sem dados suficientes'
            };

            if (!realLiquidations || !realLiquidations.hasData || !currentPrice || currentPrice <= 0) {
                return empty;
            }

            const bucketDefs = [
                { label: '0-1%', min: 0, max: 1 },
                { label: '1-2%', min: 1, max: 2 },
                { label: '2-3%', min: 2, max: 3 },
                { label: '3-5%', min: 3, max: 5 },
                { label: '5-8%', min: 5, max: 8 },
                { label: '8-12%', min: 8, max: 12 },
                { label: '12%+', min: 12, max: Number.POSITIVE_INFINITY }
            ];

            const normalizeType = (type) => String(type || '').toUpperCase();
            const pendingLevels = Array.isArray(realLiquidations.pendingLevels)
                ? realLiquidations.pendingLevels
                    .map(level => {
                        const type = normalizeType(level.type);
                        if (type !== 'LONG' && type !== 'SHORT') return null;

                        const volumeUSD = parseFloat(level.volumeUSD ?? level.volume ?? 0);
                        const liqPrice = parseFloat(level.liqPrice ?? level.price ?? 0);
                        const distFromPrice = level.distPct !== undefined && level.distPct !== null
                            ? parseFloat(level.distPct)
                            : (Number.isFinite(liqPrice) && liqPrice > 0
                                ? Math.abs(((liqPrice - currentPrice) / currentPrice) * 100)
                                : parseFloat(level.distance || 0));

                        if (!Number.isFinite(volumeUSD) || volumeUSD <= 0 || !Number.isFinite(distFromPrice)) return null;

                        return {
                            type,
                            volumeUSD,
                            distPct: Math.abs(distFromPrice),
                            liqPrice: Number.isFinite(liqPrice) && liqPrice > 0 ? liqPrice : null
                        };
                    })
                    .filter(Boolean)
                : [];

            let pendingLongUSD = parseFloat(realLiquidations.totalPendingLong || 0);
            let pendingShortUSD = parseFloat(realLiquidations.totalPendingShort || 0);

            if ((pendingLongUSD <= 0 || pendingShortUSD <= 0) && pendingLevels.length > 0) {
                const levelsLong = pendingLevels
                    .filter(level => level.type === 'LONG')
                    .reduce((sum, level) => sum + level.volumeUSD, 0);
                const levelsShort = pendingLevels
                    .filter(level => level.type === 'SHORT')
                    .reduce((sum, level) => sum + level.volumeUSD, 0);

                if (pendingLongUSD <= 0) pendingLongUSD = levelsLong;
                if (pendingShortUSD <= 0) pendingShortUSD = levelsShort;
            }

            if (pendingLongUSD <= 0) pendingLongUSD = parseFloat(realLiquidations.longOI || realLiquidations.longLiqVolume || 0);
            if (pendingShortUSD <= 0) pendingShortUSD = parseFloat(realLiquidations.shortOI || realLiquidations.shortLiqVolume || 0);

            const totalPendingUSD = Math.max(0, pendingLongUSD + pendingShortUSD);
            if (totalPendingUSD <= 0) return empty;

            const buckets = bucketDefs.map(def => ({
                label: def.label,
                longUSD: 0,
                shortUSD: 0,
                totalUSD: 0
            }));

            if (pendingLevels.length > 0) {
                pendingLevels.forEach(level => {
                    const bucketIndex = bucketDefs.findIndex(def => level.distPct >= def.min && level.distPct < def.max);
                    if (bucketIndex < 0) return;

                    if (level.type === 'LONG') buckets[bucketIndex].longUSD += level.volumeUSD;
                    if (level.type === 'SHORT') buckets[bucketIndex].shortUSD += level.volumeUSD;
                    buckets[bucketIndex].totalUSD += level.volumeUSD;
                });
            } else {
                // Distribuição sintética quando só temos agregados (sem níveis por distância)
                const syntheticDist = [0.06, 0.10, 0.14, 0.24, 0.22, 0.14, 0.10];
                buckets.forEach((bucket, idx) => {
                    bucket.longUSD = pendingLongUSD * syntheticDist[idx];
                    bucket.shortUSD = pendingShortUSD * syntheticDist[idx];
                    bucket.totalUSD = bucket.longUSD + bucket.shortUSD;
                });
            }

            const nearLongUSD = buckets.slice(0, 3).reduce((sum, bucket) => sum + bucket.longUSD, 0);
            const nearShortUSD = buckets.slice(0, 3).reduce((sum, bucket) => sum + bucket.shortUSD, 0);
            const nearTotalUSD = nearLongUSD + nearShortUSD;

            const longPct = (pendingLongUSD / totalPendingUSD) * 100;
            const shortPct = (pendingShortUSD / totalPendingUSD) * 100;
            const nearPct = (nearTotalUSD / totalPendingUSD) * 100;

            const pendingBias = (pendingShortUSD - pendingLongUSD) / totalPendingUSD;
            const nearBias = nearTotalUSD > 0 ? (nearShortUSD - nearLongUSD) / nearTotalUSD : 0;
            const proximityFactor = Math.max(0.55, Math.min(1.35, nearPct / 35));
            const rawImpact = (pendingBias * 1.3) + (nearBias * 0.9 * proximityFactor);
            const confluenceImpact = Math.max(-2.2, Math.min(2.2, rawImpact * 1.9));

            let signal = 'NEUTRO';
            if (confluenceImpact >= 0.35) signal = 'LONG';
            if (confluenceImpact <= -0.35) signal = 'SHORT';

            let dominantRisk = 'EQUILIBRADO';
            if (signal === 'LONG') dominantRisk = 'SHORTS EM RISCO (SQUEEZE ACIMA)';
            if (signal === 'SHORT') dominantRisk = 'LONGS EM RISCO (FLUSH ABAIXO)';

            const strongestCluster = buckets.reduce((best, bucket) =>
                bucket.totalUSD > best.totalUSD ? bucket : best,
                { label: '-', totalUSD: 0, longUSD: 0, shortUSD: 0 }
            );

            let insight = `Maior concentração em ${strongestCluster.label}`;
            if (signal === 'LONG') insight += ' com mais shorts vulneráveis';
            if (signal === 'SHORT') insight += ' com mais longs vulneráveis';
            if (signal === 'NEUTRO') insight += ' e distribuição equilibrada';

            const maxBucketUSD = Math.max(1, ...buckets.map(bucket => Math.max(bucket.longUSD, bucket.shortUSD)));

            return {
                hasData: true,
                mode: pendingLevels.length > 0 ? 'pending-levels' : 'aggregated',
                pendingLongUSD,
                pendingShortUSD,
                longPct,
                shortPct,
                nearLongUSD,
                nearShortUSD,
                nearPct,
                signal,
                dominantRisk,
                confluenceImpact,
                bucketData: buckets,
                maxBucketUSD,
                insight
            };
        }
        
        // Helper functions for calculations
        function calculateVolumeProfile(klines) {
            if (!klines || klines.length === 0) return { poc: 0, vah: 0, val: 0 };
            
            // First pass: find price range
            let totalVolume = 0;
            let minPrice = Infinity, maxPrice = 0;
            
            klines.forEach(k => {
                const high = parseFloat(k[2]);
                const low = parseFloat(k[3]);
                minPrice = Math.min(minPrice, low);
                maxPrice = Math.max(maxPrice, high);
            });
            
            // Use fixed-width buckets relative to price range (50 buckets)
            const priceRange = maxPrice - minPrice;
            if (priceRange <= 0) return { poc: maxPrice, vah: maxPrice, val: minPrice };
            const numBuckets = 50;
            const bucketSize = priceRange / numBuckets;
            
            const priceVolume = {};
            
            klines.forEach(k => {
                const high = parseFloat(k[2]);
                const low = parseFloat(k[3]);
                const volume = parseFloat(k[5]);
                const avgPrice = (high + low) / 2;
                const bucketIndex = Math.min(Math.floor((avgPrice - minPrice) / bucketSize), numBuckets - 1);
                const bucketCenter = minPrice + (bucketIndex + 0.5) * bucketSize;
                const bucketKey = bucketCenter.toFixed(2);
                
                priceVolume[bucketKey] = (priceVolume[bucketKey] || 0) + volume;
                totalVolume += volume;
            });
            
            // Find POC
            let poc = 0, pocVolume = 0;
            Object.entries(priceVolume).forEach(([price, volume]) => {
                if (volume > pocVolume) {
                    pocVolume = volume;
                    poc = parseFloat(price);
                }
            });
            
            // Calculate Value Area (70% of volume)
            const targetVolume = totalVolume * 0.7;
            let accVolume = pocVolume;
            let vah = poc, val = poc;
            
            const sortedPrices = Object.keys(priceVolume).map(p => parseFloat(p)).sort((a, b) => a - b);
            const pocIndex = sortedPrices.indexOf(poc);
            
            let upIndex = pocIndex + 1;
            let downIndex = pocIndex - 1;
            
            while (accVolume < targetVolume && (upIndex < sortedPrices.length || downIndex >= 0)) {
                const upVol = upIndex < sortedPrices.length ? priceVolume[sortedPrices[upIndex]] : 0;
                const downVol = downIndex >= 0 ? priceVolume[sortedPrices[downIndex]] : 0;
                
                if (upVol >= downVol && upIndex < sortedPrices.length) {
                    accVolume += upVol;
                    vah = sortedPrices[upIndex];
                    upIndex++;
                } else if (downIndex >= 0) {
                    accVolume += downVol;
                    val = sortedPrices[downIndex];
                    downIndex--;
                } else {
                    break;
                }
            }
            
            return { poc, vah, val };
        }
        
        function calculateVWAP(klines) {
            if (!klines || klines.length === 0) return 0;
            
            let cumulativeTPV = 0;
            let cumulativeVolume = 0;
            
            klines.forEach(k => {
                const high = parseFloat(k[2]);
                const low = parseFloat(k[3]);
                const close = parseFloat(k[4]);
                const volume = parseFloat(k[5]);
                const typicalPrice = (high + low + close) / 3;
                
                cumulativeTPV += typicalPrice * volume;
                cumulativeVolume += volume;
            });
            
            return cumulativeVolume > 0 ? cumulativeTPV / cumulativeVolume : 0;
        }
        
        function calculateOIChange(klines, ticker24h) {
            // Estimativa baseada em variação de volume
            const volume24h = parseFloat(ticker24h.volume || 0);
            const quoteVolume = parseFloat(ticker24h.quoteVolume || 0);
            if (klines.length < 2) return 0;
            
            const recentVolume = parseFloat(klines[klines.length - 1][5]);
            const prevVolume = parseFloat(klines[klines.length - 2][5]);
            
            return prevVolume > 0 ? ((recentVolume - prevVolume) / prevVolume) * 100 : 0;
        }
        
        function calculateCVD(trades) {
            if (!trades || trades.length === 0) return { delta: 0, trend: 'neutral', buyVolume: 0, sellVolume: 0 };
            
            let buyVolume = 0, sellVolume = 0;
            
            trades.forEach(t => {
                const qty = parseFloat(t.qty);
                const price = parseFloat(t.price);
                const usdVol = qty * price; // usar volume em USD para precisão
                if (t.isBuyerMaker) {
                    sellVolume += usdVol; // Maker é comprador, taker vendeu (sell market order)
                } else {
                    buyVolume += usdVol; // Maker é vendedor, taker comprou (buy market order)
                }
            });
            
            const delta = buyVolume - sellVolume;
            const total = buyVolume + sellVolume;
            const ratio = total > 0 ? delta / total : 0;
            
            let trend = 'neutral';
            if (ratio > 0.1) trend = 'up';
            else if (ratio < -0.1) trend = 'down';
            
            return { delta: Math.round(delta), trend, buyVolume, sellVolume };
        }
        

        function calculateBookImbalance(orderBook) {
            if (!orderBook.bids || !orderBook.asks) return { ratio: 1, bidVolume: 0, askVolume: 0 };
            
            let bidVolume = 0, askVolume = 0;
            
            orderBook.bids.slice(0, 20).forEach(b => bidVolume += parseFloat(b[1]));
            orderBook.asks.slice(0, 20).forEach(a => askVolume += parseFloat(a[1]));
            
            return {
                ratio: askVolume > 0 ? bidVolume / askVolume : 1,
                bidVolume: Math.round(bidVolume),
                askVolume: Math.round(askVolume)
            };
        }
        
        function findLiquidityPools(orderBook, currentPrice) {
            const pools = { above: [], below: [] };
            if (!orderBook.bids || !orderBook.asks) return pools;
            
            // Find large orders (potential liquidation pools)
            orderBook.asks.forEach(a => {
                const price = parseFloat(a[0]);
                const qty = parseFloat(a[1]);
                if (qty > orderBook.asks.reduce((sum, x) => sum + parseFloat(x[1]), 0) / orderBook.asks.length * 3) {
                    pools.above.push({ price, qty });
                }
            });
            
            orderBook.bids.forEach(b => {
                const price = parseFloat(b[0]);
                const qty = parseFloat(b[1]);
                if (qty > orderBook.bids.reduce((sum, x) => sum + parseFloat(x[1]), 0) / orderBook.bids.length * 3) {
                    pools.below.push({ price, qty });
                }
            });
            
            return pools;
        }
        
        function calculateRSI(klines, period = 14) {
            if (!klines || klines.length < period + 1) return 50;
            
            let gains = 0, losses = 0;
            
            for (let i = klines.length - period; i < klines.length; i++) {
                const change = parseFloat(klines[i][4]) - parseFloat(klines[i - 1]?.[4] || klines[i][1]);
                if (change > 0) gains += change;
                else losses -= change;
            }
            
            const avgGain = gains / period;
            const avgLoss = losses / period;
            const rs = avgLoss > 0 ? avgGain / avgLoss : 100;
            
            return 100 - (100 / (1 + rs));
        }
        
        function calculateATR(klines, period = 14) {
            if (!klines || klines.length < period) return 0;
            
            let atrSum = 0;
            for (let i = klines.length - period; i < klines.length; i++) {
                const high = parseFloat(klines[i][2]);
                const low = parseFloat(klines[i][3]);
                const prevClose = parseFloat(klines[i - 1]?.[4] || klines[i][1]);
                
                const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
                atrSum += tr;
            }
            
            return atrSum / period;
        }
        
        // Suporte e Resistência baseados em Swing Highs/Lows + Médias Móveis
        function calculateSupportResistance(klines, currentPrice, ema50, sma50, sma200, val, vah, klines4h, klines1d) {
            if (!klines || klines.length < 20) {
                return {
                    support: Math.min(ema50 || currentPrice * 0.98, sma50 || currentPrice * 0.98, val || currentPrice * 0.98),
                    resistance: Math.max(ema50 || currentPrice * 1.02, sma50 || currentPrice * 1.02, vah || currentPrice * 1.02)
                };
            }
            
            // Multi-timeframe swing detection with weighted clustering
            const clusterTolerance = 0.005; // 0.5%
            const rawLevels = [];
            
            // Helper: extract swing highs/lows from klines with weight
            function extractSwings(kl, weight) {
                if (!kl || kl.length < 5) return;
                const lookback = Math.min(kl.length, 250);
                const data = kl.slice(-lookback);
                for (let i = 2; i < data.length - 2; i++) {
                    const low = parseFloat(data[i][3]);
                    const high = parseFloat(data[i][2]);
                    const isSwingLow = low <= parseFloat(data[i-1][3]) && low <= parseFloat(data[i-2][3]) && 
                                       low <= parseFloat(data[i+1][3]) && low <= parseFloat(data[i+2][3]);
                    const isSwingHigh = high >= parseFloat(data[i-1][2]) && high >= parseFloat(data[i-2][2]) && 
                                        high >= parseFloat(data[i+1][2]) && high >= parseFloat(data[i+2][2]);
                    if (isSwingLow) rawLevels.push({ price: low, weight, type: 'low' });
                    if (isSwingHigh) rawLevels.push({ price: high, weight, type: 'high' });
                }
            }
            
            extractSwings(klines, 1);     // 1h weight=1
            extractSwings(klines4h, 2);   // 4h weight=2
            extractSwings(klines1d, 3);   // 1d weight=3
            
            // Cluster nearby levels (within 0.5% tolerance)
            const clusters = [];
            const sorted = rawLevels.sort((a, b) => a.price - b.price);
            for (const level of sorted) {
                const existing = clusters.find(c => Math.abs(c.price - level.price) / c.price < clusterTolerance);
                if (existing) {
                    existing.totalWeight += level.weight;
                    existing.price = (existing.price * (existing.totalWeight - level.weight) + level.price * level.weight) / existing.totalWeight;
                    existing.count++;
                } else {
                    clusters.push({ price: level.price, totalWeight: level.weight, count: 1 });
                }
            }
            
            // Add MA candidates with weight 1
            [ema50, sma50, sma200, val, vah].filter(Boolean).forEach(ma => {
                const existing = clusters.find(c => Math.abs(c.price - ma) / ma < clusterTolerance);
                if (existing) {
                    existing.totalWeight += 1;
                    existing.count++;
                } else {
                    clusters.push({ price: ma, totalWeight: 1, count: 1 });
                }
            });
            
            // Sort by weight descending
            clusters.sort((a, b) => b.totalWeight - a.totalWeight);
            
            // Support = strongest cluster below price
            const supportClusters = clusters.filter(c => c.price < currentPrice).sort((a, b) => b.totalWeight - a.totalWeight);
            const support = supportClusters.length > 0 ? supportClusters[0].price : currentPrice * 0.98;
            
            // Resistance = strongest cluster above price
            const resistanceClusters = clusters.filter(c => c.price > currentPrice).sort((a, b) => b.totalWeight - a.totalWeight);
            const resistance = resistanceClusters.length > 0 ? resistanceClusters[0].price : currentPrice * 1.02;
            
            return { support, resistance };
        }
        
        // EMA - Exponential Moving Average (seed correto via SMA dos primeiros N períodos)
        function calculateEMA(klines, period = 200) {
            if (!klines || klines.length < period) {
                // Se não temos dados suficientes, usar SMA com dados disponíveis
                const available = klines?.length || 0;
                if (available < 2) return 0;
                
                let sum = 0;
                klines.forEach(k => sum += parseFloat(k[4]));
                return sum / available;
            }
            
            const multiplier = 2 / (period + 1);
            
            // Seed: SMA dos primeiros 'period' candles (correto)
            let seedSum = 0;
            for (let i = 0; i < period; i++) {
                seedSum += parseFloat(klines[i][4]);
            }
            let ema = seedSum / period;
            
            // Aplicar EMA a partir do candle period em diante
            for (let i = period; i < klines.length; i++) {
                const close = parseFloat(klines[i][4]);
                ema = (close - ema) * multiplier + ema;
            }
            
            return ema;
        }
        
        // SMA - Simple Moving Average
        function calculateSMA(klines, period = 50) {
            if (!klines || klines.length < period) {
                const available = klines?.length || 0;
                if (available < 2) return 0;
                
                let sum = 0;
                klines.forEach(k => sum += parseFloat(k[4]));
                return sum / available;
            }
            
            const closes = klines.slice(-period).map(k => parseFloat(k[4]));
            const sum = closes.reduce((a, b) => a + b, 0);
            return sum / period;
        }
        
        // MACD - Moving Average Convergence Divergence
        function calculateMACD(klines, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
            if (!klines || klines.length < slowPeriod + signalPeriod) {
                return { macd: 0, signal: 0, histogram: 0 };
            }
            
            const closes = klines.map(k => parseFloat(k[4]));
            
            // Calculate fast EMA (12)
            let fastEMA = closes.slice(0, fastPeriod).reduce((a, b) => a + b, 0) / fastPeriod;
            const fastMult = 2 / (fastPeriod + 1);
            
            // Calculate slow EMA (26)
            let slowEMA = closes.slice(0, slowPeriod).reduce((a, b) => a + b, 0) / slowPeriod;
            const slowMult = 2 / (slowPeriod + 1);
            
            const macdLine = [];
            
            for (let i = slowPeriod; i < closes.length; i++) {
                fastEMA = (closes[i] - fastEMA) * fastMult + fastEMA;
                slowEMA = (closes[i] - slowEMA) * slowMult + slowEMA;
                macdLine.push(fastEMA - slowEMA);
            }
            
            // Calculate signal line (9 EMA of MACD)
            if (macdLine.length < signalPeriod) {
                return { macd: macdLine[macdLine.length - 1] || 0, signal: 0, histogram: 0 };
            }
            
            let signalEMA = macdLine.slice(0, signalPeriod).reduce((a, b) => a + b, 0) / signalPeriod;
            const signalMult = 2 / (signalPeriod + 1);
            
            for (let i = signalPeriod; i < macdLine.length; i++) {
                signalEMA = (macdLine[i] - signalEMA) * signalMult + signalEMA;
            }
            
            const macd = macdLine[macdLine.length - 1];
            const signal = signalEMA;
            const histogram = macd - signal;
            
            return { macd, signal, histogram };
        }
        
        // ADX - Average Directional Index
        function calculateADX(klines, period = 14) {
            if (!klines || klines.length < period * 2) {
                return { adx: 25, plusDI: 50, minusDI: 50 };
            }
            
            const trueRanges = [];
            const plusDMs = [];
            const minusDMs = [];
            
            for (let i = 1; i < klines.length; i++) {
                const high = parseFloat(klines[i][2]);
                const low = parseFloat(klines[i][3]);
                const prevHigh = parseFloat(klines[i - 1][2]);
                const prevLow = parseFloat(klines[i - 1][3]);
                const prevClose = parseFloat(klines[i - 1][4]);
                
                // True Range
                const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
                trueRanges.push(tr);
                
                // Directional Movement
                const plusDM = high - prevHigh > prevLow - low ? Math.max(high - prevHigh, 0) : 0;
                const minusDM = prevLow - low > high - prevHigh ? Math.max(prevLow - low, 0) : 0;
                plusDMs.push(plusDM);
                minusDMs.push(minusDM);
            }
            
            // Calculate smoothed values
            let atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0);
            let smoothedPlusDM = plusDMs.slice(0, period).reduce((a, b) => a + b, 0);
            let smoothedMinusDM = minusDMs.slice(0, period).reduce((a, b) => a + b, 0);
            
            const dxValues = [];
            
            for (let i = period; i < trueRanges.length; i++) {
                atr = atr - (atr / period) + trueRanges[i];
                smoothedPlusDM = smoothedPlusDM - (smoothedPlusDM / period) + plusDMs[i];
                smoothedMinusDM = smoothedMinusDM - (smoothedMinusDM / period) + minusDMs[i];
                
                const plusDI = atr > 0 ? (smoothedPlusDM / atr) * 100 : 0;
                const minusDI = atr > 0 ? (smoothedMinusDM / atr) * 100 : 0;
                const diSum = plusDI + minusDI;
                const dx = diSum > 0 ? Math.abs(plusDI - minusDI) / diSum * 100 : 0;
                dxValues.push({ dx, plusDI, minusDI });
            }
            
            // Calculate ADX (smoothed DX)
            if (dxValues.length < period) {
                const lastDX = dxValues[dxValues.length - 1] || { dx: 25, plusDI: 50, minusDI: 50 };
                return { adx: lastDX.dx, plusDI: lastDX.plusDI, minusDI: lastDX.minusDI };
            }
            
            let adx = dxValues.slice(0, period).reduce((sum, d) => sum + d.dx, 0) / period;
            
            for (let i = period; i < dxValues.length; i++) {
                adx = ((adx * (period - 1)) + dxValues[i].dx) / period;
            }
            
            const lastDX = dxValues[dxValues.length - 1];
            return { adx, plusDI: lastDX.plusDI, minusDI: lastDX.minusDI };
        }
        
        // Stochastic Oscillator
        function calculateStochastic(klines, kPeriod = 14, dPeriod = 3) {
            if (!klines || klines.length < kPeriod + dPeriod) {
                return { k: 50, d: 50 };
            }
            
            const kValues = [];
            
            for (let i = kPeriod - 1; i < klines.length; i++) {
                const periodKlines = klines.slice(i - kPeriod + 1, i + 1);
                const highs = periodKlines.map(k => parseFloat(k[2]));
                const lows = periodKlines.map(k => parseFloat(k[3]));
                const close = parseFloat(klines[i][4]);
                
                const highestHigh = Math.max(...highs);
                const lowestLow = Math.min(...lows);
                const range = highestHigh - lowestLow;
                
                const k = range > 0 ? ((close - lowestLow) / range) * 100 : 50;
                kValues.push(k);
            }
            
            // Calculate %D (SMA of %K)
            const recentK = kValues.slice(-dPeriod);
            const d = recentK.reduce((a, b) => a + b, 0) / recentK.length;
            const k = kValues[kValues.length - 1];
            
            return { k, d };
        }
        
        // Net Volume (Volume Delta)
        function calculateNetVolume(klines) {
            if (!klines || klines.length === 0) {
                return { delta: 0, ratio: 0, buyVolume: 0, sellVolume: 0 };
            }
            
            let buyVolume = 0;
            let sellVolume = 0;
            
            klines.forEach(k => {
                const open = parseFloat(k[1]);
                const close = parseFloat(k[4]);
                const volume = parseFloat(k[5]);
                
                // Se fechou acima da abertura, é volume de compra
                if (close > open) {
                    buyVolume += volume;
                } else if (close < open) {
                    sellVolume += volume;
                } else {
                    // Candle neutro - dividir 50/50
                    buyVolume += volume / 2;
                    sellVolume += volume / 2;
                }
            });
            
            const delta = buyVolume - sellVolume;
            const total = buyVolume + sellVolume;
            const ratio = total > 0 ? (delta / total) * 100 : 0;
            
            return { delta, ratio, buyVolume, sellVolume };
        }

        function generateLocalSummary(signalType, confidence, indicators, symbol) {
            const crypto = CRYPTO_DATABASE[symbol]?.name || symbol;
            
            // Análise de Médias Móveis
            let maAnalysis = '';
            if (indicators.movingAverages) {
                const ma = indicators.movingAverages;
                const aboveEmas = [ma.ema9, ma.ema21, ma.ema50].filter(v => ma.currentPrice > v).length;
                const aboveSmas = [ma.sma50, ma.sma99, ma.sma200].filter(v => ma.currentPrice > v).length;
                
                if (aboveEmas === 3 && aboveSmas >= 2) {
                    maAnalysis = '📊 Médias Móveis: FORTE tendência de alta - preço acima de todas as EMAs e principais SMAs.';
                } else if (aboveEmas === 0 && aboveSmas <= 1) {
                    maAnalysis = '📊 Médias Móveis: FORTE tendência de baixa - preço abaixo de todas as EMAs e principais SMAs.';
                } else if (aboveEmas >= 2) {
                    maAnalysis = '📊 Médias Móveis: Tendência de curto prazo BULLISH - preço acima das EMAs rápidas.';
                } else {
                    maAnalysis = '📊 Médias Móveis: Consolidação - preço entre médias indica indecisão.';
                }
            }
            
            // Análise de Atividade de Baleias
            let whaleAnalysis = '';
            if (indicators.whaleActivity) {
                const whale = indicators.whaleActivity;
                if (whale.level === 'muito_alta' || whale.level === 'alta') {
                    if (whale.direction === 'compra') {
                        whaleAnalysis = '🐋 Baleias: Atividade ALTA com predominância de COMPRA - institucionais acumulando.';
                    } else if (whale.direction === 'venda') {
                        whaleAnalysis = '🐋 Baleias: Atividade ALTA com predominância de VENDA - institucionais distribuindo.';
                    } else {
                        whaleAnalysis = '🐋 Baleias: Atividade ALTA detectada - monitorar direção.';
                    }
                } else if (whale.level === 'moderada') {
                    whaleAnalysis = '🐋 Baleias: Atividade moderada no mercado.';
                }
            }
            
            // Análise do Book Imbalance
            let bookAnalysis = '';
            if (indicators.bookImbalance) {
                const ratio = indicators.bookImbalance.ratio;
                if (ratio > 1.5) {
                    bookAnalysis = '📗 Order Book: Forte pressão compradora (${ratio.toFixed(2)}x mais bids que asks).';
                } else if (ratio < 0.67) {
                    bookAnalysis = '📕 Order Book: Forte pressão vendedora (${(1/ratio).toFixed(2)}x mais asks que bids).';
                }
            }
            
            // V2 Analysis strings
            let regimeAnalysis = '';
            let structureAnalysis = '';
            let cvdAdvAnalysis = '';
            let volatilityAnalysis = '';
            
            if (indicators.marketRegime) {
                const r = indicators.marketRegime;
                regimeAnalysis = `🌡️ Regime: ${r.regimeIcon} ${r.regimeDescription}. ${r.regimeImplication}`;
                if (r.squeezeDetected) {
                    regimeAnalysis += '\n💎 BOLLINGER SQUEEZE — explosão de volatilidade iminente!';
                }
            }
            if (indicators.marketStructure) {
                const s = indicators.marketStructure;
                if (s.structureDescription) {
                    structureAnalysis = `📐 Estrutura: ${s.structureDescription}`;
                }
                if (s.liquiditySweeps?.detected) {
                    structureAnalysis += `\n🎯 ${s.liquiditySweeps.description}`;
                }
            }
            if (indicators.cvdAdvanced) {
                const c = indicators.cvdAdvanced;
                if (c.divergence) cvdAdvAnalysis += `${c.divergence.icon} CVD: ${c.divergence.description}\n`;
                if (c.absorption) cvdAdvAnalysis += `🐋 CVD: ${c.absorption.description}\n`;
                if (c.breakout) cvdAdvAnalysis += `💥 CVD: ${c.breakout.description}\n`;
            }
            if (indicators.volatilityMetrics) {
                const v = indicators.volatilityMetrics;
                volatilityAnalysis = `${v.volIcon} Volatilidade: ${v.volDescription} (ATR 1h: ${v.atrPercent1h}%)`;
            }
            
            // Big Tech & Traditional Markets summary
            let bigTechAnalysis = '';
            if (indicators.bigTechMacro) {
                const bt = indicators.bigTechMacro;
                const techSummary = bt.bigTech?.map(t => `${t.symbol}: ${t.changePercent > 0 ? '+' : ''}${t.changePercent.toFixed(1)}%`).join(', ') || '';
                bigTechAnalysis = `🏢 Big Tech: ${bt.bigTechSentiment} (${techSummary})`;
                if (bt.fearGreed) {
                    bigTechAnalysis += `\n🎭 Fear & Greed: ${bt.fearGreed.value}/100 — ${bt.fearGreed.classification}`;
                }
                if (bt.indices?.length > 0) {
                    const sp = bt.indices.find(i => i.symbol === '^GSPC');
                    const vix = bt.indices.find(i => i.symbol === '^VIX');
                    if (sp) bigTechAnalysis += `\n📈 S&P 500: ${sp.changePercent > 0 ? '+' : ''}${sp.changePercent.toFixed(2)}%`;
                    if (vix) bigTechAnalysis += ` | 😱 VIX: ${vix.price.toFixed(1)}`;
                }
                if (bt.treasuryYields?.isInverted) {
                    bigTechAnalysis += '\n⚠️ CURVA DE JUROS INVERTIDA — sinal de recessão que pressiona risk assets';
                }
            }
            
            const v2Block = [regimeAnalysis, structureAnalysis, cvdAdvAnalysis, volatilityAnalysis, bigTechAnalysis].filter(Boolean).join('\n');
            
            if (signalType === 'long') {
                return `📈 SINAL LONG DETECTADO para ${crypto}

O preço está ${indicators.priceLocation === 'below_value' ? 'ABAIXO da área de valor (barato)' : 'na região inferior da área de valor'}. O Funding Rate ${indicators.fundingSignal === 'bullish' ? 'negativo indica que a multidão está vendida (oportunidade contrária)' : 'está neutro'}.

O CVD mostra ${indicators.cvdSignal === 'bullish' ? 'predominância de compras agressivas a mercado' : indicators.cvdSignal === 'absorption_bullish' ? 'ABSORÇÃO de vendas por compradores (baleias acumulando)' : 'fluxo equilibrado'}.

O Order Book revela ${indicators.bookSignal === 'bid_heavy' ? 'forte suporte de bids (compradores posicionados)' : 'equilíbrio entre bids e asks'}.

${maAnalysis}
${whaleAnalysis}

${indicators.rsiSignal === 'oversold' ? '⚠️ RSI em sobrevenda - momento ótimo para entrada!' : ''}
${indicators.lsSignal === 'bullish' ? '💡 Long/Short Ratio indica shorts excessivos - potencial short squeeze.' : ''}

${v2Block ? '--- Análise Detalhada ---\n' + v2Block + '\n' : ''}
Confiança: ${confidence}%`;
            } else if (signalType === 'short') {
                return `📉 SINAL SHORT DETECTADO para ${crypto}

O preço está ${indicators.priceLocation === 'above_value' ? 'ACIMA da área de valor (caro)' : 'na região superior da área de valor'}. O Funding Rate ${indicators.fundingSignal === 'bearish' ? 'muito positivo indica multidão excessivamente comprada (risco de liquidação)' : 'está elevado'}.

O CVD mostra ${indicators.cvdSignal === 'bearish' ? 'predominância de vendas agressivas' : indicators.cvdSignal === 'absorption_bearish' ? 'ABSORÇÃO de compras por vendedores (distribuição institucional)' : 'pressão vendedora crescente'}.

O Order Book revela ${indicators.bookSignal === 'ask_heavy' ? 'forte resistência de asks (vendedores posicionados)' : 'pressão de oferta'}.

${maAnalysis}
${whaleAnalysis}

${indicators.rsiSignal === 'overbought' ? '⚠️ RSI em sobrecompra - momento ótimo para short!' : ''}
${indicators.lsSignal === 'bearish' ? '💡 Long/Short Ratio indica longs excessivos - potencial long squeeze.' : ''}

${v2Block ? '--- Análise Detalhada ---\n' + v2Block + '\n' : ''}
Confiança: ${confidence}%`;
            } else {
                // Verificar posição do preço em relação ao VAH/VAL
                const currentPrice = indicators.movingAverages?.currentPrice || 0;
                let pricePositionMsg = '';
                let recommendationMsg = '';
                
                if (currentPrice > indicators.vah) {
                    pricePositionMsg = `O preço atual ($${currentPrice.toFixed(2)}) está ACIMA da VAH ($${indicators.vah?.toFixed(2)}), mas não há confluência suficiente para confirmar continuação de alta.`;
                    recommendationMsg = `🚫 Recomendação: NÃO OPERAR agora.
• O preço JÁ rompeu VAH - aguarde reteste da VAH ($${indicators.vah?.toFixed(2)}) como SUPORTE para LONG
• Ou aguarde retorno para dentro da área de valor para SHORT
• Evite comprar no topo sem confirmação de volume`;
                } else if (currentPrice < indicators.val) {
                    pricePositionMsg = `O preço atual ($${currentPrice.toFixed(2)}) está ABAIXO da VAL ($${indicators.val?.toFixed(2)}), mas não há confluência suficiente para confirmar continuação de baixa.`;
                    recommendationMsg = `🚫 Recomendação: NÃO OPERAR agora.
• O preço JÁ rompeu VAL - aguarde reteste da VAL ($${indicators.val?.toFixed(2)}) como RESISTÊNCIA para SHORT
• Ou aguarde retorno para dentro da área de valor para LONG
• Evite vender no fundo sem confirmação de volume`;
                } else {
                    pricePositionMsg = `O preço atual ($${currentPrice.toFixed(2)}) está DENTRO da área de valor (VAL: $${indicators.val?.toFixed(2)} | VAH: $${indicators.vah?.toFixed(2)}).`;
                    recommendationMsg = `🚫 Recomendação: NÃO OPERAR agora.
• Aguarde rompimento claro da VAH ($${indicators.vah?.toFixed(2)}) com volume para LONG
• Aguarde rompimento claro da VAL ($${indicators.val?.toFixed(2)}) com volume para SHORT`;
                }
                
                return `⏳ NEUTRO — ${crypto}

${pricePositionMsg}

Não há confluência suficiente entre os indicadores para recomendar operação.

${maAnalysis}
${whaleAnalysis}

${recommendationMsg}

${v2Block ? '--- Análise Detalhada ---\n' + v2Block + '\n\n' : ''}Indicadores atuais:
• Funding Rate: ${indicators.fundingSignal}
• CVD: ${indicators.cvdSignal}
• Order Book: ${indicators.bookSignal}

⚠️ Confiança para operação: BAIXA. Sem sinal direcional.`;
            }
        }

        // ═══════════════════════════════════════════════════════════
        // GROQ AI — Relatório de IA real via Llama 3.3 70B
        // ═══════════════════════════════════════════════════════════
        const GROQ_API_KEY = (window.APP_CONFIG && window.APP_CONFIG.GROQ_API_KEY) || '';
        const GROQ_REMOTE_ENABLED = !!(
            GROQ_API_KEY &&
            GROQ_API_KEY !== 'COLE_SUA_CHAVE_GROQ_AQUI' &&
            GROQ_API_KEY !== 'YOUR_GROQ_API_KEY'
        );
        const AI_WORKER_URL = String((window.APP_CONFIG && window.APP_CONFIG.CALENDAR_WORKER_URL) || '').trim().replace(/\/+$/, '');
        const GROQ_MODEL = 'llama-3.3-70b-versatile';
        const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
        const _aiSummaryCache = {};

        // Evitar acúmulo de memória no cache de AI summaries
        function _cleanAISummaryCache() {
            const keys = Object.keys(_aiSummaryCache);
            if (keys.length > 50) {
                // Remover entradas mais antigas (manter últimas 20)
                keys.slice(0, keys.length - 20).forEach(k => delete _aiSummaryCache[k]);
            }
        }

        // Sync wrapper — returns local fallback instantly
        function generateAISummary(signalType, confidence, indicators, symbol) {
            return generateLocalSummary(signalType, confidence, indicators, symbol);
        }

        async function fetchAISummary(analysis, symbol) {
            if (!GROQ_REMOTE_ENABLED && !AI_WORKER_URL) return null;
            _cleanAISummaryCache();
            const cacheKey = `${symbol}_${Math.floor(Date.now() / 300000)}`;
            if (_aiSummaryCache[cacheKey]) return _aiSummaryCache[cacheKey];

            const crypto = CRYPTO_DATABASE[symbol]?.name || symbol;
            const ind = analysis.indicators || {};
            const vp = ind.volumeProfile || {};
            const of_ = ind.orderFlow || {};
            const micro = ind.microstructure || {};
            const sent = ind.sentiment || {};
            const mtf = ind.multiTimeframe || {};
            const ma = ind.movingAverages || {};
            const mr = analysis.marketRegime || {};
            const ms = analysis.marketStructure || {};
            const cvdA = analysis.cvdAdvanced || {};
            const vol = analysis.volatilityMetrics || {};
            const bt = analysis.bigTechMacro || {};
            const v4 = analysis.v4Signal ? {
                signal: analysis.v4Signal,
                confidence: analysis.v4Confidence,
                probability: analysis.v4Probability,
                gatesPassed: analysis.v4GatesPassed,
                gatesTotal: analysis.v4GatesTotal,
                action: analysis.v4ActionMessage
            } : null;

            const dataPayload = {
                crypto, symbol,
                signal: analysis.v4Signal || analysis.v3Signal || analysis.signal,
                signalType: analysis._finalSignalType || analysis.signalType,
                confidence: analysis._finalConfidence || analysis.v4Confidence || analysis.v3Confidence || analysis.confidence,
                probability: analysis._finalProbability || analysis.v4Probability || analysis.v3Probability || analysis.probability || 50,
                entry: analysis.entry, stopLoss: analysis.stopLoss,
                targets: analysis.dynamicTargets,
                volumeProfile: { poc: vp.poc, vah: vp.vah, val: vp.val, vwap: vp.vwap, priceLocation: vp.priceLocation },
                orderFlow: of_,
                microstructure: { bookImbalance: micro.bookImbalance, bookSignal: micro.bookSignal },
                sentiment: sent, multiTimeframe: mtf, movingAverages: ma,
                regime: { regime: mr.regime, regimeDescription: mr.regimeDescription, regimeStrength: mr.regimeStrength, squeezeDetected: mr.squeezeDetected },
                structure: { structureDescription: ms.structureDescription },
                cvd: { divergence: cvdA.divergence?.description, absorption: cvdA.absorption?.description },
                volatility: { atr1h: vol.atrPercent1h, description: vol.volDescription },
                bigTech: bt.bigTechSentiment ? { sentiment: bt.bigTechSentiment, fearGreed: bt.fearGreed } : null,
                v4Engine: v4,
                confluenceScore: analysis.confluenceSummary?.score,
                contextualAdjustments: (analysis.contextualAdjustments || []).map(a => a.reason).slice(0, 5)
            };

            const systemPrompt = `Você é um analista quantitativo sênior de criptomoedas. Gere um relatório técnico conciso em português brasileiro (PT-BR) com base nos dados fornecidos.

Regras:
- Máximo 800 caracteres
- Não use markdown, apenas texto limpo com emojis para seções
- Comece com o sinal (📈 LONG / 📉 SHORT / ⏳ NEUTRO), a confiança e a probabilidade
- A confiança DEVE ser EXATAMENTE ${dataPayload.confidence}% — este valor já foi calculado pelo motor de confluência, NÃO calcule nem invente outro valor
- A probabilidade DEVE ser EXATAMENTE ${dataPayload.probability}% — este valor já foi calculado pelo motor de análise, NÃO calcule nem invente outro valor
- Analise: regime de mercado, volume profile, order flow (CVD, funding), microestrutura, sentimento
- Dê uma conclusão objetiva: operar ou não, e por quê
- Se NEUTRO, explique o que esperar para entrar
- Use linguagem direta de trader profissional
- NÃO invente dados, use APENAS os fornecidos`;

            try {
                const userPrompt = `Dados da análise técnica de ${crypto} (${symbol}):\n${JSON.stringify(dataPayload)}`;
                let aiText = null;

                if (GROQ_REMOTE_ENABLED) {
                    const resp = await fetch(GROQ_URL, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${GROQ_API_KEY}`
                        },
                        body: JSON.stringify({
                            model: GROQ_MODEL,
                            messages: [
                                { role: 'system', content: systemPrompt },
                                { role: 'user', content: userPrompt }
                            ],
                            temperature: 0.4,
                            max_tokens: 500,
                            stream: false
                        })
                    });
                    if (!resp.ok) throw new Error(`Groq API ${resp.status}`);
                    const data = await resp.json();
                    aiText = data.choices?.[0]?.message?.content?.trim();
                } else {
                    const proxyResp = await fetch(`${AI_WORKER_URL}/ai-summary`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            model: GROQ_MODEL,
                            systemPrompt,
                            userPrompt
                        }),
                        signal: AbortSignal.timeout(12000)
                    });
                    if (!proxyResp.ok) throw new Error(`AI proxy ${proxyResp.status}`);
                    const proxyData = await proxyResp.json();
                    if (!proxyData?.success) throw new Error(proxyData?.error || 'AI proxy failed');
                    aiText = String(proxyData.content || '').trim();
                }

                if (aiText) {
                    // Post-process: force the correct confidence % from the engine
                    // The LLM often invents its own %, so we replace any percentage
                    // that appears near confidence-related words with the real value
                    const realConf = dataPayload.confidence;
                    if (realConf != null) {
                        // Replace patterns like "confiança: 73%" or "Confiança de 73%" or just "73% de confiança"
                        aiText = aiText.replace(
                            /(confian[çc]a[:\s]+(?:de\s+)?)(\d{1,3})(%)/gi,
                            `$1${realConf}$3`
                        );
                        // Also replace the first standalone percentage at the start (e.g., "📈 LONG | 73%")
                        aiText = aiText.replace(
                            /^([^\n]{0,60}?)\b(\d{1,3})(%\s)/m,
                            (match, prefix, num, suffix) => {
                                // Only replace if it looks like the main signal line confidence
                                if (Math.abs(parseInt(num) - realConf) > 2) {
                                    return `${prefix}${realConf}${suffix}`;
                                }
                                return match;
                            }
                        );
                    }
                    const realProb = dataPayload.probability;
                    if (realProb != null) {
                        // Replace patterns like "probabilidade: 68%" and "68% de probabilidade"
                        aiText = aiText.replace(
                            /((?:probabilidade|probability|chance)[:\s]+(?:de\s+)?)(\d{1,3})(%)/gi,
                            `$1${realProb}$3`
                        );
                        aiText = aiText.replace(
                            /(\d{1,3})(%\s*(?:de\s+)?(?:probabilidade|probability|chance))/gi,
                            `${realProb}$2`
                        );
                    }
                    _aiSummaryCache[cacheKey] = aiText;
                    return aiText;
                }
                throw new Error('Empty response');
            } catch (e) {
                console.warn('[Groq AI]', e.message);
                return null;
            }
        }

        // Update the AI summary section in the rendered TA modal
        async function updateAISummaryInModal(analysis, symbol) {
            const textEl = document.querySelector('.ta-ai-text');
            if (!textEl) return;
            // Use final blended confidence for consistency with displayed bar/donut
            const finalConf = analysis._finalConfidence || analysis.v4Confidence || analysis.v3Confidence || analysis.confidence;
            const finalSigType = analysis._finalSignalType || analysis.signalType;
            const aiResult = await fetchAISummary(analysis, symbol);
            const modal = document.getElementById('ta-modal');
            if (!modal || !modal.classList.contains('active')) return;
            const currentTextEl = document.querySelector('.ta-ai-text');
            if (!currentTextEl) return;
            if (aiResult) {
                currentTextEl.textContent = aiResult;
            } else {
                // Groq failed — show local fallback with blended confidence
                const localText = generateLocalSummary(
                    finalSigType, finalConf,
                    analysis.indicators || {}, symbol
                );
                const noKey = !GROQ_REMOTE_ENABLED;
                const prefix = noKey
                    ? 'ℹ️ Relatório em modo local. Para IA remota via Groq, configure CALENDAR_WORKER_URL e GROQ_API_KEY no Worker.\n\n'
                    : '⚠️ IA indisponível — análise local:\n\n';
                currentTextEl.textContent = prefix + localText;
            }
        }

        function renderLiquidationMapSection(realLiquidations, liquidationRiskMap, formatBigNumber, formatPrice) {
            if (!realLiquidations?.hasData || !liquidationRiskMap?.hasData) {
                return `
                <div class="ta-section">
                    <div class="ta-section-header">
                        <div class="ta-section-icon" style="background: linear-gradient(135deg, #64748b 0%, #334155 100%);">
                            <i class="fas fa-bolt"></i>
                        </div>
                        <div>
                            <div class="ta-section-title">Mapa de Liquidações</div>
                            <div class="ta-section-subtitle">Aguardando dados de risco pendente</div>
                        </div>
                    </div>
                    <div style="margin-top: 12px; padding: 18px; background: var(--bg-tertiary); border-radius: 12px; text-align: center; color: var(--text-muted); font-size: 12px;">
                        Sem dados suficientes no momento. Atualiza a cada ciclo da análise técnica (5 min).
                    </div>
                </div>
                `;
            }

            const riskSignal = liquidationRiskMap.signal || 'NEUTRO';
            const signalColor = riskSignal === 'LONG' ? '#22c55e' : riskSignal === 'SHORT' ? '#ef4444' : '#f59e0b';
            const signalLabel = riskSignal === 'LONG'
                ? 'Viés de alta (short squeeze)'
                : riskSignal === 'SHORT'
                    ? 'Viés de baixa (flush de longs)'
                    : 'Sem dominância clara';

            const impact = liquidationRiskMap.confluenceImpact || 0;
            const impactLabel = `${impact >= 0 ? '+' : ''}${impact.toFixed(2)}`;
            const riskSource = realLiquidations.dataSource || 'Dados de risco';
            const modeLabel = liquidationRiskMap.mode === 'pending-levels'
                ? 'Níveis reais por distância do preço'
                : 'Distribuição agregada por Open Interest';

            const bucketRows = (liquidationRiskMap.bucketData || []).map((bucket) => {
                const maxBucket = Math.max(1, liquidationRiskMap.maxBucketUSD || 1);
                const shortWidth = bucket.shortUSD > 0 ? Math.max(3, (bucket.shortUSD / maxBucket) * 100) : 0;
                const longWidth = bucket.longUSD > 0 ? Math.max(3, (bucket.longUSD / maxBucket) * 100) : 0;

                return `
                <div style="display: grid; grid-template-columns: 56px 1fr 1fr; gap: 8px; align-items: center; margin-bottom: 8px;">
                    <div style="font-size: 10px; color: var(--text-muted); font-weight: 700;">${bucket.label}</div>
                    <div style="background: rgba(239, 68, 68, 0.08); border-radius: 6px; padding: 4px 6px; border: 1px solid rgba(239, 68, 68, 0.18);">
                        <div style="height: 8px; width: ${shortWidth.toFixed(1)}%; background: linear-gradient(90deg, #ef4444, #f87171); border-radius: 999px;"></div>
                        <div style="font-size: 9px; color: #fca5a5; margin-top: 3px; white-space: nowrap;">${formatBigNumber(bucket.shortUSD || 0)}</div>
                    </div>
                    <div style="background: rgba(34, 197, 94, 0.08); border-radius: 6px; padding: 4px 6px; border: 1px solid rgba(34, 197, 94, 0.18);">
                        <div style="height: 8px; width: ${longWidth.toFixed(1)}%; background: linear-gradient(90deg, #22c55e, #4ade80); border-radius: 999px;"></div>
                        <div style="font-size: 9px; color: #86efac; margin-top: 3px; white-space: nowrap;">${formatBigNumber(bucket.longUSD || 0)}</div>
                    </div>
                </div>
                `;
            }).join('');

            return `
                <div class="ta-section">
                    <div class="ta-section-header">
                        <div class="ta-section-icon" style="background: linear-gradient(135deg, ${signalColor} 0%, #0f172a 120%);">
                            <i class="fas fa-crosshairs"></i>
                        </div>
                        <div>
                            <div class="ta-section-title">Mapa de Liquidações (Risco Pendente)</div>
                            <div class="ta-section-subtitle">${riskSource} | ${modeLabel}</div>
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 12px;">
                        <div style="padding: 12px; border-radius: 12px; background: rgba(239, 68, 68, 0.10); border: 1px solid rgba(239, 68, 68, 0.25);">
                            <div style="font-size: 10px; color: #f87171; text-transform: uppercase; font-weight: 700;">Shorts em risco (se subir)</div>
                            <div style="font-size: 15px; font-weight: 800; color: #fecaca; margin-top: 4px;">${formatBigNumber(liquidationRiskMap.pendingShortUSD || 0)}</div>
                            <div style="font-size: 10px; color: var(--text-muted); margin-top: 4px;">${(liquidationRiskMap.shortPct || 0).toFixed(1)}% do risco total</div>
                        </div>
                        <div style="padding: 12px; border-radius: 12px; background: rgba(34, 197, 94, 0.10); border: 1px solid rgba(34, 197, 94, 0.25);">
                            <div style="font-size: 10px; color: #4ade80; text-transform: uppercase; font-weight: 700;">Longs em risco (se cair)</div>
                            <div style="font-size: 15px; font-weight: 800; color: #bbf7d0; margin-top: 4px;">${formatBigNumber(liquidationRiskMap.pendingLongUSD || 0)}</div>
                            <div style="font-size: 10px; color: var(--text-muted); margin-top: 4px;">${(liquidationRiskMap.longPct || 0).toFixed(1)}% do risco total</div>
                        </div>
                    </div>

                    <div style="margin-top: 10px; padding: 12px; border-radius: 10px; background: var(--bg-tertiary); border: 1px solid rgba(148, 163, 184, 0.18);">
                        <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px;">
                            <div>
                                <div style="font-size: 10px; color: var(--text-muted); text-transform: uppercase;">Leitura do Mapa</div>
                                <div style="font-size: 13px; font-weight: 700; color: ${signalColor}; white-space: nowrap;">${signalLabel}</div>
                            </div>
                            <div style="text-align: right;">
                                <div style="font-size: 10px; color: var(--text-muted); text-transform: uppercase;">Impacto Confluência</div>
                                <div style="font-size: 13px; font-weight: 800; color: ${signalColor};">${impactLabel}</div>
                            </div>
                        </div>
                        <div style="margin-top: 8px; font-size: 11px; color: var(--text-muted);">
                            ${liquidationRiskMap.insight || 'Sem insight adicional'} | Concentração em até 3%: ${(liquidationRiskMap.nearPct || 0).toFixed(1)}%
                        </div>
                    </div>

                    <div style="margin-top: 12px; padding: 12px; border-radius: 10px; background: var(--bg-tertiary); border: 1px solid rgba(148, 163, 184, 0.18);">
                        <div style="font-size: 11px; color: var(--text-muted); font-weight: 700; margin-bottom: 10px; text-transform: uppercase;">
                            Escada de risco por distância (% do preço atual: $${formatPrice(realLiquidations.currentPrice || 0)})
                        </div>
                        <div style="display: grid; grid-template-columns: 56px 1fr 1fr; gap: 8px; margin-bottom: 6px;">
                            <div></div>
                            <div style="font-size: 9px; color: #f87171; font-weight: 700; text-transform: uppercase;">Shorts</div>
                            <div style="font-size: 9px; color: #4ade80; font-weight: 700; text-transform: uppercase;">Longs</div>
                        </div>
                        ${bucketRows}
                    </div>

                    <div style="margin-top: 10px; font-size: 10px; color: var(--text-muted);">
                        Atualização: ${realLiquidations.lastUpdate || '-'} | Este mapa influencia confluência, confiança e probabilidade final.
                    </div>
                </div>
            `;
        }

        function renderTechnicalAnalysis(analysis, crypto) {
            const body = document.getElementById('ta-modal-body');
            if (!body) return;
            try {
            const { signal: origSignal, signalType: origSignalType, confidence: origConfidence, probability: origProbability, entry, stopLoss, takeProfit, riskReward, indicators, aiSummary, timestamp, dynamicTargets, marketRegime, marketStructure, cvdAdvanced, volatilityMetrics, macroNews, bigTechMacro, contextualAdjustments, v3Signal, v3SignalType, v3Confidence, v3Probability } = analysis;
            
            // V4 Reactive override (highest priority) > V3 override > V1 original
            const v4Signal = analysis.v4Signal;
            const v4Confidence = analysis.v4Confidence;
            const v4Probability = analysis.v4Probability;
            const isV4Active = !!v4Signal;
            
            // Display signal: V4 shows the readable signal
            let displaySignal, signal, signalType, confidence, probability;
            if (isV4Active) {
                // V4 signal types: LONG_CONFIRMED, SHORT_CONFIRMED, AGUARDAR_LONG, AGUARDAR_SHORT, NEUTRO
                if (v4Signal.includes('CONFIRMED')) {
                    displaySignal = v4Signal.replace('_', ' ');
                    signal = v4Signal;
                    signalType = v4Signal.includes('LONG') ? 'long' : 'short';
                    confidence = v4Confidence;
                    probability = v4Probability ?? v3Probability ?? origProbability ?? 50;
                } else if (v4Signal.includes('AGUARDAR')) {
                    displaySignal = 'NEUTRO';
                    signal = v4Signal;
                    signalType = 'aguardar';
                    confidence = v4Confidence;
                    probability = v4Probability ?? v3Probability ?? origProbability ?? 50;
                } else {
                    displaySignal = 'NEUTRO';
                    signal = 'NEUTRO';
                    signalType = 'aguardar';
                    confidence = v4Confidence || v3Confidence || origConfidence;
                    probability = v4Probability ?? v3Probability ?? origProbability ?? 50;
                }
            } else {
                signal = v3Signal || origSignal;
                signalType = v3SignalType || origSignalType;
                confidence = v3Confidence || origConfidence;
                probability = v3Probability ?? origProbability ?? 50;
                // Map NEUTRO to NEUTRO display
                if (signal === 'NEUTRO') {
                    signalType = 'aguardar';
                }
                displaySignal = (signal === 'AGUARDE' || signal === 'NEUTRO') ? 'NEUTRO' : signal;
            }
            
            // RULE: confidence < 50 = ALWAYS NEUTRO, no exceptions
            if (confidence < 50 && signalType !== 'long' && signalType !== 'short') {
                displaySignal = 'NEUTRO';
                signal = 'NEUTRO';
                signalType = 'aguardar';
            } else if (confidence < 50 && (signalType === 'long' || signalType === 'short')) {
                // Has directional bias but low confidence — show NEUTRO
                displaySignal = 'NEUTRO';
                signalType = 'aguardar';
            }
            
            // ═══ SYNC CONFIDENCE WITH MARKET REGIME ═══
            // Blend AI confidence with regime strength so both sections are coherent
            if (marketRegime && marketRegime.regimeStrength != null) {
                const regimeConf = Math.round((marketRegime.regimeStrength || 0) * 100);
                // Weighted blend: 70% engine confidence + 30% regime strength
                confidence = Math.round(confidence * 0.7 + regimeConf * 0.3);
                confidence = Math.max(10, Math.min(100, confidence));
                // Re-check NEUTRO rule after regime sync
                if (confidence < 50 && signalType === 'aguardar') {
                    displaySignal = 'NEUTRO';
                    signal = 'NEUTRO';
                }
            }
            probability = Math.max(5, Math.min(100, Math.round(probability || 50)));
            
            // AI summary will be loaded async from Groq — no local text
            // Store final blended confidence back into analysis for AI summary consistency
            analysis._finalConfidence = confidence;
            analysis._finalProbability = probability;
            analysis._finalSignalType = signalType;
            analysis._finalSignal = signal;
            
            // Regenerate local AI summary with blended confidence so it matches header bar
            analysis.aiSummary = generateLocalSummary(signalType, confidence, analysis.indicators || {}, taCurrentSymbol || 'BTCUSDT');
            
            const signalIcon = signalType === 'long' ? 'fa-arrow-trend-up' : signalType === 'short' ? 'fa-arrow-trend-down' : signalType === 'aguardar' ? 'fa-hourglass-half' : 'fa-hourglass-half';
            const confidenceLevel = confidence >= 70 ? 'high' : confidence >= 50 ? 'medium' : 'low';
            
            const formatPrice = (price) => {
                if (price == null || isNaN(price)) return '—';
                if (price >= 1000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                if (price >= 1) return price.toFixed(4);
                return price.toFixed(6);
            };
            
            const formatBigNumber = (value) => {
                if (!value || isNaN(value)) return '$0';
                const abs = Math.abs(value);
                if (abs >= 1e12) return '$' + (value / 1e12).toFixed(2) + 'T';
                if (abs >= 1e9) return '$' + (value / 1e9).toFixed(2) + 'B';
                if (abs >= 1e6) return '$' + (value / 1e6).toFixed(2) + 'M';
                if (abs >= 1e3) return '$' + (value / 1e3).toFixed(2) + 'K';
                return '$' + value.toFixed(2);
            };
            
            body.innerHTML = `
                <!-- Crypto Header -->
                <div style="display: flex; align-items: center; gap: 14px; margin-bottom: 18px; padding: 14px 16px; background: linear-gradient(135deg, var(--bg-card) 0%, var(--bg-elevated) 100%); border-radius: 16px; border: 1px solid var(--border-subtle); box-shadow: 0 2px 12px rgba(0,0,0,0.15);">
                    <img src="${crypto.img}" style="width: 46px; height: 46px; border-radius: 14px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);" onerror="this.style.background='${crypto.color}'; this.style.borderRadius='14px';">
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-size: 17px; font-weight: 800; color: var(--text-primary); letter-spacing: -0.3px;">${crypto.name}</div>
                        <div style="font-size: 12px; color: var(--text-muted); font-weight: 600; letter-spacing: 0.3px;">${crypto.short}/USDT</div>
                    </div>
                    <div style="padding: 6px 12px; background: rgba(99,102,241,0.12); border: 1px solid rgba(99,102,241,0.2); border-radius: 20px; font-size: 10px; font-weight: 700; color: #818cf8; letter-spacing: 0.5px; white-space: nowrap;">ANÁLISE</div>
                </div>
                
                <!-- Signal Card -->
                <div class="ta-signal-card ${signalType}">
                    <div class="ta-signal-header">
                        <div class="ta-signal-icon ${signalType}">
                            <i class="fas ${signalIcon}"></i>
                        </div>
                        <div class="ta-signal-info">
                            <h2 class="${signalType}" style="${signalType === 'aguardar' ? 'color: #f59e0b;' : ''}">${displaySignal}</h2>
                            <div class="ta-signal-confidence">
                                <span>Confiança:</span>
                                <div class="ta-confidence-bar">
                                    <div class="ta-confidence-fill ${confidenceLevel}" style="width: ${confidence}%; ${signalType === 'aguardar' ? 'background: linear-gradient(90deg, #f59e0b, #d97706);' : ''}"></div>
                                </div>
                                <span style="font-weight: 700; color: var(--text-primary);">${confidence}%</span>
                            </div>
                            ${isV4Active ? `<div style="display: flex; align-items: center; gap: 8px; margin-top: 4px; flex-wrap: wrap;">
                                ${analysis.sessionContext ? `<span style="font-size: 9px; padding: 2px 6px; border-radius: 4px; background: ${analysis.sessionContext.session === 'KILL_ZONE' ? 'rgba(239,68,68,0.2)' : analysis.sessionContext.session === 'LONDON_OPEN' ? 'rgba(59,130,246,0.2)' : 'rgba(100,116,139,0.15)'}; color: ${analysis.sessionContext.session === 'KILL_ZONE' ? '#f87171' : analysis.sessionContext.session === 'LONDON_OPEN' ? '#60a5fa' : 'var(--text-muted)'}; font-weight: 600; white-space: nowrap;">${analysis.sessionContext.session === 'KILL_ZONE' ? 'Zona Volátil' : analysis.sessionContext.session === 'LONDON_OPEN' ? 'Londres' : analysis.sessionContext.session === 'ASIAN' ? 'Ásia' : analysis.sessionContext.session === 'NY_OPEN' ? 'Nova York' : analysis.sessionContext.session || 'N/A'}</span>` : ''}
                                ${analysis.enhancedRegimeV4 ? `<span style="font-size: 9px; padding: 2px 6px; border-radius: 4px; background: rgba(139,92,246,0.15); color: #a78bfa; font-weight: 600; white-space: nowrap;">${analysis.enhancedRegimeV4.regimeIcon || ''} ${analysis.enhancedRegimeV4.regime || ''}</span>` : ''}
                                <span style="font-size: 10px; color: var(--text-muted); white-space: nowrap;">✅ ${analysis.v4GatesPassed || 0}/${analysis.v4GatesTotal || 9} confirmações</span>
                                ${analysis.dataIntegrity && !analysis.dataIntegrity.valid ? `<span style="font-size: 9px; padding: 2px 6px; border-radius: 4px; background: rgba(239,68,68,0.2); color: #f87171; font-weight: 700;">⚠️ DADOS</span>` : ''}
                            </div>
                            ${analysis.v4ActionMessage ? `<div style="margin-top: 6px; padding: 8px 10px; border-radius: 8px; background: ${signalType === 'long' ? 'rgba(34,197,94,0.1)' : signalType === 'short' ? 'rgba(239,68,68,0.1)' : signalType === 'aguardar' ? 'rgba(245,158,11,0.1)' : 'rgba(100,116,139,0.1)'}; border: 1px solid ${signalType === 'long' ? 'rgba(34,197,94,0.2)' : signalType === 'short' ? 'rgba(239,68,68,0.2)' : signalType === 'aguardar' ? 'rgba(245,158,11,0.2)' : 'rgba(100,116,139,0.2)'}; font-size: 11px; color: var(--text-secondary); line-height: 1.4; white-space: pre-line;">${analysis.v4ActionIcon || ''} ${analysis.v4ActionMessage}</div>` : ''}` : ''}
                        </div>
                    </div>
                    
                    <!-- Entry/Exit Levels (Dynamic Targets v2) -->
                    ${signalType === 'long' || signalType === 'short' ? `
                    <div class="ta-levels">
                        <div class="ta-level-item">
                            <div class="ta-level-label">Entrada</div>
                            <div class="ta-level-value entry">$${formatPrice(entry)}</div>
                        </div>
                        <div class="ta-level-item">
                            <div class="ta-level-label">Stop Loss</div>
                            <div class="ta-level-value stop">$${formatPrice(stopLoss)}</div>
                        </div>
                        <div class="ta-level-item">
                            <div class="ta-level-label">Risco</div>
                            <div class="ta-level-value stop">${dynamicTargets ? dynamicTargets.riskPercent + '%' : (entry ? (((Math.abs((stopLoss || entry) - entry)) / entry) * 100).toFixed(2) + '%' : '—')}</div>
                        </div>
                    </div>
                    ${dynamicTargets ? `
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 8px;">
                        <div style="background: rgba(34,197,94,0.1); padding: 10px; border-radius: 8px; text-align: center; border: 1px solid rgba(34,197,94,0.2);">
                            <div style="font-size: 9px; color: #4ade80; text-transform: uppercase; font-weight: 700; white-space: nowrap;">TP1 (POC)</div>
                            <div style="font-size: 13px; font-weight: 800; color: #22c55e; white-space: nowrap;">$${formatPrice(dynamicTargets.tp1)}</div>
                            <div style="font-size: 9px; color: var(--text-muted); white-space: nowrap;">R:R 1:${dynamicTargets.rr1}</div>
                        </div>
                        <div style="background: rgba(34,197,94,0.15); padding: 10px; border-radius: 8px; text-align: center; border: 1px solid rgba(34,197,94,0.3);">
                            <div style="font-size: 9px; color: #22c55e; text-transform: uppercase; font-weight: 700; white-space: nowrap;">TP2 (VAH/VAL)</div>
                            <div style="font-size: 13px; font-weight: 800; color: #22c55e; white-space: nowrap;">$${formatPrice(dynamicTargets.tp2)}</div>
                            <div style="font-size: 9px; color: var(--text-muted); white-space: nowrap;">R:R 1:${dynamicTargets.rr2}</div>
                        </div>
                        <div style="background: rgba(34,197,94,0.2); padding: 10px; border-radius: 8px; text-align: center; border: 1px solid rgba(34,197,94,0.4);">
                            <div style="font-size: 9px; color: #10b981; text-transform: uppercase; font-weight: 700; white-space: nowrap;">TP3 (ATR×4)</div>
                            <div style="font-size: 13px; font-weight: 800; color: #10b981; white-space: nowrap;">$${formatPrice(dynamicTargets.tp3)}</div>
                            <div style="font-size: 9px; color: var(--text-muted); white-space: nowrap;">R:R 1:${dynamicTargets.rr3}</div>
                        </div>
                    </div>
                    ` : `
                    <div class="ta-rr-card">
                        <div class="ta-rr-item">
                            <div class="ta-rr-label">Risk/Reward</div>
                            <div class="ta-rr-value">1:${riskReward}</div>
                        </div>
                        <div class="ta-rr-item">
                            <div class="ta-rr-label">Lucro Potencial</div>
                            <div class="ta-rr-value pnl-positive">${entry ? ((signalType === 'long' ? '+' : '') + ((((takeProfit || entry) - entry) / entry) * 100).toFixed(2) + '%') : '—'}</div>
                        </div>
                        <div class="ta-rr-item">
                            <div class="ta-rr-label">Risco</div>
                            <div class="ta-rr-value pnl-negative">${entry ? (((((stopLoss || entry) - entry) / entry) * 100).toFixed(2) + '%') : '—'}</div>
                        </div>
                    </div>
                    `}
                    ` : `
                    <div style="padding: 20px; background: var(--bg-tertiary); border-radius: 12px; text-align: center;">
                        <div style="font-size: 16px; font-weight: 700; color: #f59e0b; margin-bottom: 8px;">⚠️ NÃO RECOMENDADO OPERAR</div>
                        <div style="font-size: 12px; color: var(--text-muted);">Confluência insuficiente. Aguarde um sinal mais claro.</div>
                        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 16px;">
                            <div style="background: var(--bg-secondary); padding: 12px; border-radius: 8px;">
                                <div style="font-size: 10px; color: var(--text-muted); white-space: nowrap;">Entrada</div>
                                <div style="font-size: 16px; font-weight: 700; color: var(--text-muted);">--</div>
                            </div>
                            <div style="background: var(--bg-secondary); padding: 12px; border-radius: 8px;">
                                <div style="font-size: 10px; color: var(--text-muted); white-space: nowrap;">Take Profit</div>
                                <div style="font-size: 16px; font-weight: 700; color: var(--text-muted);">--</div>
                            </div>
                            <div style="background: var(--bg-secondary); padding: 12px; border-radius: 8px;">
                                <div style="font-size: 10px; color: var(--text-muted); white-space: nowrap;">Stop Loss</div>
                                <div style="font-size: 16px; font-weight: 700; color: var(--text-muted);">--</div>
                            </div>
                        </div>
                    </div>
                    `}
                </div>
                
                <!-- ====== V2 SECTIONS ====== -->
                
                <!-- ════════════════════════════════════ V5 NEW PANELS ════════════════════════════════════ -->
                
                <!-- V5: BTC ALIGNMENT (v7.1: hidden when analyzing BTC itself) -->
                ${analysis.btcAlignment && analysis.btcAlignment.alignment !== 'SELF' ? `
                <div class="ta-section" style="border: 1px solid ${analysis.btcAlignment.alignment === 'ALIGNED' ? 'rgba(34,197,94,0.3)' : analysis.btcAlignment.alignment === 'DIVERGING' ? 'rgba(239,68,68,0.3)' : 'rgba(100,116,139,0.2)'};">
                    <div class="ta-section-header">
                        <div class="ta-section-icon" style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);">
                            <span style="font-size: 18px;">₿</span>
                        </div>
                        <div>
                            <div class="ta-section-title">Alinhamento com BTC</div>
                            <div class="ta-section-subtitle">Correlação e direção relativa ao Bitcoin</div>
                        </div>
                    </div>
                    <div style="padding: 14px; background: ${analysis.btcAlignment.alignment === 'ALIGNED' ? 'rgba(34,197,94,0.06)' : analysis.btcAlignment.alignment === 'DIVERGING' ? 'rgba(239,68,68,0.06)' : 'var(--bg-tertiary)'}; border-radius: 12px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                            <div>
                                <div style="font-size: 16px; font-weight: 800; color: ${analysis.btcAlignment.alignment === 'ALIGNED' ? '#22c55e' : analysis.btcAlignment.alignment === 'DIVERGING' ? '#ef4444' : '#94a3b8'};">
                                    ${analysis.btcAlignment.alignment === 'ALIGNED' ? '✅ ALINHADO' : analysis.btcAlignment.alignment === 'DIVERGING' ? '⚠️ DIVERGENTE' : '⚖️ NEUTRO'}
                                </div>
                                <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">${analysis.btcAlignment.description || ''}</div>
                            </div>
                            <div style="text-align: right;">
                                <div style="font-size: 9px; color: var(--text-muted); white-space: nowrap;">Correlação</div>
                                <div style="font-size: 18px; font-weight: 800; color: ${Math.abs(analysis.btcAlignment.correlation || 0) > 0.7 ? '#22c55e' : Math.abs(analysis.btcAlignment.correlation || 0) > 0.4 ? '#f59e0b' : '#ef4444'};">${(analysis.btcAlignment.correlation || 0).toFixed(2)}</div>
                            </div>
                        </div>
                        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;">
                            <div style="background: var(--bg-card); padding: 8px; border-radius: 8px; text-align: center;">
                                <div style="font-size: 9px; color: var(--text-muted); white-space: nowrap;">BTC Trend</div>
                                <div style="font-size: 12px; font-weight: 700; color: ${analysis.btcAlignment.btcTrend === 'UP' ? '#22c55e' : analysis.btcAlignment.btcTrend === 'DOWN' ? '#ef4444' : '#f59e0b'};">${analysis.btcAlignment.btcTrend === 'UP' ? '▲ Alta' : analysis.btcAlignment.btcTrend === 'DOWN' ? '▼ Baixa' : '— Lateral'}</div>
                            </div>
                            <div style="background: var(--bg-card); padding: 8px; border-radius: 8px; text-align: center;">
                                <div style="font-size: 9px; color: var(--text-muted); white-space: nowrap;">Força Relativa</div>
                                <div style="font-size: 12px; font-weight: 700; color: ${(analysis.btcAlignment.relativeStrength || 0) > 0 ? '#22c55e' : '#ef4444'};">${(analysis.btcAlignment.relativeStrength || 0) > 0 ? '+' : ''}${(analysis.btcAlignment.relativeStrength || 0).toFixed(2)}%</div>
                            </div>
                            <div style="background: var(--bg-card); padding: 8px; border-radius: 8px; text-align: center;">
                                <div style="font-size: 9px; color: var(--text-muted); white-space: nowrap;">Risco</div>
                                <div style="font-size: 12px; font-weight: 700; color: ${analysis.btcAlignment.riskLevel === 'HIGH' ? '#ef4444' : analysis.btcAlignment.riskLevel === 'MEDIUM' ? '#f59e0b' : '#22c55e'};">${analysis.btcAlignment.riskLevel === 'HIGH' ? '🔴 Alto' : analysis.btcAlignment.riskLevel === 'MEDIUM' ? '🟡 Médio' : '🟢 Baixo'}</div>
                            </div>
                        </div>
                        ${analysis.btcAlignment.correlations ? `
                        <div style="margin-top: 8px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;">
                            <div style="background: var(--bg-card); padding: 6px; border-radius: 6px; text-align: center;">
                                <div style="font-size: 8px; color: var(--text-muted); white-space: nowrap;">Corr 12h</div>
                                <div style="font-size: 12px; font-weight: 700; color: ${Math.abs(analysis.btcAlignment.correlations['12h'] || 0) > 0.7 ? '#22c55e' : '#f59e0b'};">${(analysis.btcAlignment.correlations['12h'] || 0).toFixed(2)}</div>
                            </div>
                            <div style="background: var(--bg-card); padding: 6px; border-radius: 6px; text-align: center;">
                                <div style="font-size: 8px; color: var(--text-muted); white-space: nowrap;">Corr 24h</div>
                                <div style="font-size: 12px; font-weight: 700; color: ${Math.abs(analysis.btcAlignment.correlations['24h'] || 0) > 0.7 ? '#22c55e' : '#f59e0b'};">${(analysis.btcAlignment.correlations['24h'] || 0).toFixed(2)}</div>
                            </div>
                            <div style="background: var(--bg-card); padding: 6px; border-radius: 6px; text-align: center;">
                                <div style="font-size: 8px; color: var(--text-muted); white-space: nowrap;">Corr 72h</div>
                                <div style="font-size: 12px; font-weight: 700; color: ${Math.abs(analysis.btcAlignment.correlations['72h'] || 0) > 0.7 ? '#22c55e' : '#f59e0b'};">${(analysis.btcAlignment.correlations['72h'] || 0).toFixed(2)}</div>
                            </div>
                        </div>
                        <div style="margin-top: 4px; font-size: 9px; color: var(--text-muted); text-align: center;">
                            Janela dominante: ${analysis.btcAlignment.dominantWindow || '48h'} | Tendência corr: ${analysis.btcAlignment.corrTrend || 'STABLE'}
                        </div>
                        ` : ''}
                    </div>
                </div>
                ` : ''}

                <!-- V5: SCORE PERCENTILE + REGIME QUALITY + SATURATION -->
                ${analysis.scorePercentile || analysis.regimeQuality || analysis.saturation ? `
                <div class="ta-section" style="border: 1px solid rgba(139,92,246,0.2); background: linear-gradient(135deg, rgba(139,92,246,0.03) 0%, transparent 100%);">
                    <div class="ta-section-header">
                        <div class="ta-section-icon" style="background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%);">
                            <span style="font-size: 18px;">📊</span>
                        </div>
                        <div>
                            <div class="ta-section-title">Diagnóstico de Mercado</div>
                            <div class="ta-section-subtitle">Percentil, Qualidade e Saturação</div>
                        </div>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr; gap: 10px;">
                        ${analysis.scorePercentile ? `
                        <div style="padding: 12px; background: var(--bg-tertiary); border-radius: 10px; border-left: 3px solid #8b5cf6;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <div>
                                    <div style="font-size: 11px; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">Score Percentil</div>
                                    <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">${analysis.scorePercentile.description || ''}</div>
                                </div>
                                <div style="text-align: center; min-width: 60px;">
                                    <div style="font-size: 24px; font-weight: 800; color: ${(analysis.scorePercentile.percentile || 0) >= 80 ? '#22c55e' : (analysis.scorePercentile.percentile || 0) >= 50 ? '#f59e0b' : '#ef4444'};">P${(analysis.scorePercentile.percentile || 0).toFixed(0)}</div>
                                    <div style="font-size: 9px; color: var(--text-muted); white-space: nowrap;">${analysis.scorePercentile.rank || '?'}/${analysis.scorePercentile.total || '?'}</div>
                                </div>
                            </div>
                        </div>
                        ` : ''}
                        ${analysis.regimeQuality ? `
                        <div style="padding: 12px; background: var(--bg-tertiary); border-radius: 10px; border-left: 3px solid ${analysis.regimeQuality.quality === 'Acelerando' || analysis.regimeQuality.quality === 'Forte' ? '#22c55e' : analysis.regimeQuality.quality === 'Estável' ? '#3b82f6' : analysis.regimeQuality.quality === 'Fraco' || analysis.regimeQuality.quality === 'Enfraquecendo' ? '#f59e0b' : '#ef4444'};">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <div>
                                    <div style="font-size: 11px; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">Qualidade do Regime</div>
                                    <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">${analysis.regimeQuality.description || ''}</div>
                                </div>
                                <div style="font-size: 18px; font-weight: 800; color: var(--text-primary);">
                                    ${analysis.regimeQuality.icon || ''} ${analysis.regimeQuality.quality || 'N/A'}
                                </div>
                            </div>
                            ${analysis.regimeQuality.details ? `
                            <div style="margin-top: 8px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px;">
                                <div style="background: var(--bg-card); padding: 6px; border-radius: 6px; text-align: center;">
                                    <div style="font-size: 8px; color: var(--text-muted); white-space: nowrap;">ADX</div>
                                    <div style="font-size: 11px; font-weight: 700; color: var(--text-primary);">${analysis.regimeQuality.details.adxLevel || 'N/A'}</div>
                                </div>
                                <div style="background: var(--bg-card); padding: 6px; border-radius: 6px; text-align: center;">
                                    <div style="font-size: 8px; color: var(--text-muted); white-space: nowrap;">Volume</div>
                                    <div style="font-size: 11px; font-weight: 700; color: ${analysis.regimeQuality.details.volExpanding ? '#22c55e' : 'var(--text-muted)'};">${analysis.regimeQuality.details.volExpanding ? 'Expandindo' : 'Normal'}</div>
                                </div>
                                <div style="background: var(--bg-card); padding: 6px; border-radius: 6px; text-align: center;">
                                    <div style="font-size: 8px; color: var(--text-muted); white-space: nowrap;">ATR %ile</div>
                                    <div style="font-size: 11px; font-weight: 700; color: var(--text-primary);">${analysis.regimeQuality.details.atrPercentile != null ? analysis.regimeQuality.details.atrPercentile.toFixed(0) : 'N/A'}</div>
                                </div>
                            </div>
                            ` : ''}
                        </div>
                        ` : ''}
                        ${analysis.saturation ? `
                        <div style="padding: 12px; background: var(--bg-tertiary); border-radius: 10px; border-left: 3px solid ${(analysis.saturation.saturationPercent || 0) >= 80 ? '#ef4444' : (analysis.saturation.saturationPercent || 0) >= 50 ? '#f59e0b' : '#22c55e'};">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                <div>
                                    <div style="font-size: 11px; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">Saturação / Extensão</div>
                                    <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">${analysis.saturation.message || ''}</div>
                                </div>
                                <div style="font-size: 20px; font-weight: 800; color: ${(analysis.saturation.saturationPercent || 0) >= 80 ? '#ef4444' : (analysis.saturation.saturationPercent || 0) >= 50 ? '#f59e0b' : '#22c55e'};">
                                    ${(analysis.saturation.saturationPercent || 0).toFixed(0)}%
                                </div>
                            </div>
                            <div style="height: 8px; background: var(--bg-card); border-radius: 4px; overflow: hidden;">
                                <div style="height: 100%; width: ${Math.min(analysis.saturation.saturationPercent || 0, 100)}%; border-radius: 4px; background: linear-gradient(90deg, ${(analysis.saturation.saturationPercent || 0) >= 80 ? '#ef4444, #dc2626' : (analysis.saturation.saturationPercent || 0) >= 50 ? '#f59e0b, #d97706' : '#22c55e, #16a34a'}); transition: width 0.5s;"></div>
                            </div>
                            <div style="display: flex; justify-content: space-between; margin-top: 4px; font-size: 9px; color: var(--text-muted); white-space: nowrap;">
                                <span>0% — Início</span>
                                <span>Risco: ${analysis.saturation.risk || 'N/A'}</span>
                                <span>100% — Exausto</span>
                            </div>
                        </div>
                        ` : ''}
                    </div>
                </div>
                ` : ''}

                <!-- v7.1: MULTI-TIMEFRAME ANALYSIS -->
                ${analysis.mtfAnalysis && analysis.mtfAnalysis.available ? `
                <div class="ta-section" style="border: 1px solid rgba(99,102,241,0.2);">
                    <div class="ta-section-header">
                        <div class="ta-section-icon" style="background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);">
                            <span style="font-size: 18px;">${analysis.mtfAnalysis.icon}</span>
                        </div>
                        <div>
                            <div class="ta-section-title">Análise Multi-Período</div>
                            <div class="ta-section-subtitle">${analysis.mtfAnalysis.summary}</div>
                        </div>
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px;">
                        ${analysis.mtfAnalysis.timeframes.map(tf => `
                            <div style="background: var(--bg-tertiary); padding: 8px; border-radius: 8px; text-align: center; border-top: 2px solid ${tf.trend === 'BULLISH' ? '#22c55e' : tf.trend === 'BEARISH' ? '#ef4444' : tf.trend === 'WEAK_BULL' ? '#86efac' : tf.trend === 'WEAK_BEAR' ? '#fca5a5' : '#64748b'};">
                                <div style="font-size: 10px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">${tf.tf}</div>
                                <div style="font-size: 13px; font-weight: 800; margin: 4px 0; color: ${tf.trend.includes('BULL') ? '#22c55e' : tf.trend.includes('BEAR') ? '#ef4444' : 'var(--text-secondary)'};">
                                    ${tf.trend.includes('BULL') ? '▲' : tf.trend.includes('BEAR') ? '▼' : '─'}
                                </div>
                                ${tf.available ? `<div style="font-size: 9px; color: var(--text-muted); white-space: nowrap;">RSI ${tf.rsi}</div>` : `<div style="font-size: 9px; color: var(--text-muted); white-space: nowrap;">N/A</div>`}
                            </div>
                        `).join('')}
                    </div>
                    <div style="margin-top: 8px; display: flex; justify-content: space-between; align-items: center; padding: 6px 8px; background: rgba(99,102,241,0.06); border-radius: 8px;">
                        <span style="font-size: 10px; color: var(--text-muted);">Alinhamento</span>
                        <span style="font-size: 12px; font-weight: 700; color: ${analysis.mtfAnalysis.alignmentScore >= 75 ? '#22c55e' : analysis.mtfAnalysis.alignmentScore >= 50 ? '#f59e0b' : '#ef4444'};">
                            ${analysis.mtfAnalysis.alignmentScore}%
                        </span>
                    </div>
                </div>
                ` : ''}

                <!-- V5: SETUP HISTORY -->
                ${analysis.setupStats && analysis.setupStats.count > 0 ? `
                <div class="ta-section" style="border: 1px solid rgba(14,165,233,0.2);">
                    <div class="ta-section-header">
                        <div class="ta-section-icon" style="background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%);">
                            <span style="font-size: 18px;">📜</span>
                        </div>
                        <div>
                            <div class="ta-section-title">Histórico deste Setup</div>
                            <div class="ta-section-subtitle">${analysis.setupStats.count} ocorrências registradas</div>
                        </div>
                    </div>
                    <div style="padding: 14px; background: ${analysis.setupStats.quality === 'EXCELENTE' ? 'rgba(34,197,94,0.06)' : analysis.setupStats.quality === 'BOM' ? 'rgba(59,130,246,0.06)' : analysis.setupStats.quality === 'MÉDIO' ? 'rgba(245,158,11,0.06)' : 'rgba(239,68,68,0.06)'}; border-radius: 12px; border: 1px solid ${analysis.setupStats.quality === 'EXCELENTE' ? 'rgba(34,197,94,0.2)' : analysis.setupStats.quality === 'BOM' ? 'rgba(59,130,246,0.2)' : analysis.setupStats.quality === 'MÉDIO' ? 'rgba(245,158,11,0.2)' : 'rgba(239,68,68,0.2)'};">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                            <span style="font-size: 14px; font-weight: 800; color: ${analysis.setupStats.quality === 'EXCELENTE' ? '#22c55e' : analysis.setupStats.quality === 'BOM' ? '#3b82f6' : analysis.setupStats.quality === 'MÉDIO' ? '#f59e0b' : '#ef4444'};">
                                ${analysis.setupStats.quality === 'EXCELENTE' ? '🏆' : analysis.setupStats.quality === 'BOM' ? '👍' : analysis.setupStats.quality === 'MÉDIO' ? '🤔' : '⚠️'} ${analysis.setupStats.quality}
                            </span>
                            <span style="font-size: 10px; color: var(--text-muted);">${analysis.setupStats.count} ocorrências</span>
                        </div>
                        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;">
                            <div style="background: var(--bg-card); padding: 10px; border-radius: 8px; text-align: center;">
                                <div style="font-size: 9px; color: var(--text-muted); white-space: nowrap;">Win Rate</div>
                                <div style="font-size: 18px; font-weight: 800; color: ${(analysis.setupStats.winRate || 0) >= 55 ? '#22c55e' : (analysis.setupStats.winRate || 0) >= 45 ? '#f59e0b' : '#ef4444'};">${(analysis.setupStats.winRate || 0).toFixed(0)}%</div>
                            </div>
                            <div style="background: var(--bg-card); padding: 10px; border-radius: 8px; text-align: center;">
                                <div style="font-size: 9px; color: var(--text-muted); white-space: nowrap;">Avg R</div>
                                <div style="font-size: 18px; font-weight: 800; color: ${(analysis.setupStats.avgR || 0) >= 1 ? '#22c55e' : '#ef4444'};">${(analysis.setupStats.avgR || 0).toFixed(2)}R</div>
                            </div>
                            <div style="background: var(--bg-card); padding: 10px; border-radius: 8px; text-align: center;">
                                <div style="font-size: 9px; color: var(--text-muted); white-space: nowrap;">Amostra</div>
                                <div style="font-size: 18px; font-weight: 800; color: ${(analysis.setupStats.count || 0) >= 10 ? 'var(--text-primary)' : '#f59e0b'};">${analysis.setupStats.count}</div>
                            </div>
                        </div>
                        ${(analysis.setupStats.count || 0) < 5 ? `
                        <div style="margin-top: 8px; padding: 6px 10px; background: rgba(245,158,11,0.1); border-radius: 6px; font-size: 10px; color: #f59e0b; text-align: center;">
                            ⚠️ Amostra pequena — dados estatisticamente insuficientes
                        </div>
                        ` : ''}
                    </div>
                </div>
                ` : ''}


                
                                
                <!-- V6.1: MARKET BREADTH -->
                ${analysis.marketBreadth && analysis.marketBreadth.available ? `
                <div class="ta-section" style="border: 1px solid ${analysis.marketBreadth.alignment === 'STRONG_ALIGNED' ? 'rgba(34,197,94,0.3)' : analysis.marketBreadth.alignment === 'DIVERGING' ? 'rgba(239,68,68,0.3)' : 'rgba(100,116,139,0.2)'};">
                    <div class="ta-section-header">
                        <div class="ta-section-icon" style="background: linear-gradient(135deg, #06b6d4 0%, #0891b2 100%);">
                            <span style="font-size: 18px;">🌐</span>
                        </div>
                        <div>
                            <div class="ta-section-title">Sentimento do Mercado</div>
                            <div class="ta-section-subtitle">Análise geral do mercado — ${analysis.marketBreadth.totalAssets} ativos analisados</div>
                        </div>
                    </div>
                    <div style="padding: 14px; border-radius: 12px; background: var(--bg-tertiary);">
                        <!-- Breadth bar -->
                        <div style="display: flex; height: 24px; border-radius: 12px; overflow: hidden; margin-bottom: 10px; background: var(--bg-card);">
                            <div style="width: ${analysis.marketBreadth.longPct}%; background: linear-gradient(90deg, #22c55e, #4ade80); display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; color: #fff;">${analysis.marketBreadth.longPct > 10 ? analysis.marketBreadth.longPct + '% L' : ''}</div>
                            <div style="width: ${analysis.marketBreadth.neutralPct}%; background: #64748b; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; color: #fff;">${analysis.marketBreadth.neutralPct > 15 ? analysis.marketBreadth.neutralPct + '%' : ''}</div>
                            <div style="width: ${analysis.marketBreadth.shortPct}%; background: linear-gradient(90deg, #f87171, #ef4444); display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; color: #fff;">${analysis.marketBreadth.shortPct > 10 ? analysis.marketBreadth.shortPct + '% S' : ''}</div>
                        </div>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                            <span style="font-size: 11px; color: #22c55e; font-weight: 700;">🟢 Long ${analysis.marketBreadth.longPct}%</span>
                            <span style="font-size: 11px; color: #64748b; font-weight: 600;">Neutro ${analysis.marketBreadth.neutralPct}%</span>
                            <span style="font-size: 11px; color: #ef4444; font-weight: 700;">🔴 Short ${analysis.marketBreadth.shortPct}%</span>
                        </div>
                        <div style="padding: 8px 10px; background: ${analysis.marketBreadth.alignment === 'STRONG_ALIGNED' ? 'rgba(34,197,94,0.1)' : analysis.marketBreadth.alignment === 'DIVERGING' ? 'rgba(239,68,68,0.1)' : 'rgba(100,116,139,0.1)'}; border-radius: 8px; font-size: 11px; color: var(--text-secondary); line-height: 1.4;">
                            ${analysis.marketBreadth.details}
                        </div>
                    </div>
                </div>
                ` : ''}
                
                <!-- 1. MARKET REGIME SECTION -->
                ${marketRegime ? `
                <div class="ta-section">
                    <div class="ta-section-header">
                        <div class="ta-section-icon" style="background: linear-gradient(135deg, ${marketRegime.regimeColor} 0%, ${marketRegime.regimeColor}88 100%);">
                            <span style="font-size: 18px;">${marketRegime.regimeIcon}</span>
                        </div>
                        <div>
                            <div class="ta-section-title">Regime de Mercado</div>
                            <div class="ta-section-subtitle">Classificação baseada em ADX + Volume + Bollinger</div>
                        </div>
                    </div>
                    <div style="padding: 16px; background: linear-gradient(135deg, ${marketRegime.regimeColor}15 0%, transparent 100%); border-radius: 12px; border: 1px solid ${marketRegime.regimeColor}30;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                            <div>
                                <div style="font-size: 20px; font-weight: 800; color: ${marketRegime.regimeColor}; white-space: nowrap;">${marketRegime.regimeIcon} ${marketRegime.regime.replace('_', ' ')}</div>
                                <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">${marketRegime.regimeDescription}</div>
                            </div>
                            <div style="text-align: right;">
                                <div style="font-size: 10px; color: var(--text-muted);">Força</div>
                                <div style="font-size: 18px; font-weight: 800; color: ${marketRegime.regimeColor}; white-space: nowrap;">${((marketRegime.regimeStrength || 0) * 100).toFixed(0)}%</div>
                            </div>
                        </div>
                        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 12px;">
                            <div style="background: var(--bg-tertiary); padding: 8px; border-radius: 8px; text-align: center;">
                                <div style="font-size: 9px; color: var(--text-muted); white-space: nowrap;">ADX 1h</div>
                                <div style="font-size: 14px; font-weight: 700; color: ${marketRegime.adx > 25 ? '#22c55e' : '#94a3b8'}; white-space: nowrap;">${(marketRegime.adx || 0).toFixed(1)}</div>
                            </div>
                            <div style="background: var(--bg-tertiary); padding: 8px; border-radius: 8px; text-align: center;">
                                <div style="font-size: 9px; color: var(--text-muted); white-space: nowrap;">ADX 4h</div>
                                <div style="font-size: 14px; font-weight: 700; color: ${marketRegime.adx4h > 25 ? '#22c55e' : '#94a3b8'}; white-space: nowrap;">${(marketRegime.adx4h || 0).toFixed(1)}</div>
                            </div>
                            <div style="background: var(--bg-tertiary); padding: 8px; border-radius: 8px; text-align: center;">
                                <div style="font-size: 9px; color: var(--text-muted); white-space: nowrap;">BB %ile</div>
                                <div style="font-size: 14px; font-weight: 700; color: ${marketRegime.bbPercentile < 20 ? '#8b5cf6' : marketRegime.bbPercentile > 80 ? '#ef4444' : '#f59e0b'}; white-space: nowrap;">${(marketRegime.bbPercentile || 50)}</div>
                            </div>
                        </div>
                        ${marketRegime.squeezeDetected ? `
                        <div style="padding: 10px; background: rgba(139, 92, 246, 0.15); border: 1px solid rgba(139, 92, 246, 0.3); border-radius: 8px; margin-bottom: 8px;">
                            <div style="font-size: 12px; font-weight: 700; color: #8b5cf6;">💎 BOLLINGER SQUEEZE DETECTADO</div>
                            <div style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">Volatilidade comprimida — explosão de preço iminente</div>
                        </div>
                        ` : ''}
                        <div style="padding: 10px; background: var(--bg-tertiary); border-radius: 8px;">
                            <div style="font-size: 11px; color: var(--text-muted);">💡 Implicação:</div>
                            <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">${marketRegime.regimeImplication}</div>
                        </div>
                    </div>
                </div>
                ` : ''}
                
                <!-- 2. MARKET STRUCTURE (BOS/CHoCH) -->
                ${marketStructure ? `
                <div class="ta-section">
                    <div class="ta-section-header">
                        <div class="ta-section-icon" style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);">
                            <i class="fas fa-project-diagram"></i>
                        </div>
                        <div>
                            <div class="ta-section-title">Estrutura de Mercado</div>
                            <div class="ta-section-subtitle">BOS, CHoCH, Liquidity Sweeps</div>
                        </div>
                    </div>
                    <div style="padding: 16px; background: var(--bg-tertiary); border-radius: 12px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                            <div style="font-size: 16px; font-weight: 800; white-space: nowrap; color: ${marketStructure.overallStructure === 'BULLISH' ? '#22c55e' : marketStructure.overallStructure === 'BEARISH' ? '#ef4444' : '#94a3b8'};">
                                ${marketStructure.overallStructure === 'BULLISH' ? '▲' : marketStructure.overallStructure === 'BEARISH' ? '▼' : '⚖️'} ${marketStructure.overallStructure}
                            </div>
                            <div style="font-size: 12px; color: var(--text-muted); white-space: nowrap;">Score: ${(marketStructure.structureScore || 0) > 0 ? '+' : ''}${(marketStructure.structureScore || 0).toFixed(1)}</div>
                        </div>
                        ${marketStructure.structureDescription ? `
                        <div style="font-size: 12px; color: var(--text-secondary); white-space: pre-line; margin-bottom: 12px;">${marketStructure.structureDescription}</div>
                        ` : ''}
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                            <div style="padding: 10px; background: var(--bg-card); border-radius: 8px;">
                                <div style="font-size: 10px; color: var(--text-muted); margin-bottom: 4px;">Estrutura 1H</div>
                                <div style="font-size: 12px; font-weight: 700; white-space: nowrap; color: ${marketStructure.structure1h?.type?.includes('BULLISH') ? '#22c55e' : marketStructure.structure1h?.type?.includes('BEARISH') ? '#ef4444' : '#94a3b8'};">
                                    ${marketStructure.structure1h?.type?.replace('_', ' ') || 'N/A'}
                                </div>
                            </div>
                            <div style="padding: 10px; background: var(--bg-card); border-radius: 8px;">
                                <div style="font-size: 10px; color: var(--text-muted); margin-bottom: 4px;">Estrutura 4H</div>
                                <div style="font-size: 12px; font-weight: 700; white-space: nowrap; color: ${marketStructure.structure4h?.type?.includes('BULLISH') ? '#22c55e' : marketStructure.structure4h?.type?.includes('BEARISH') ? '#ef4444' : '#94a3b8'};">
                                    ${marketStructure.structure4h?.type?.replace('_', ' ') || 'N/A'}
                                </div>
                            </div>
                        </div>
                        ${marketStructure.liquiditySweeps?.detected ? `
                        <div style="margin-top: 10px; padding: 10px; background: ${marketStructure.liquiditySweeps.type === 'SWEEP_LOWS' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'}; border-radius: 8px; border: 1px solid ${marketStructure.liquiditySweeps.type === 'SWEEP_LOWS' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'};">
                            <div style="font-size: 12px; font-weight: 700; color: ${marketStructure.liquiditySweeps.type === 'SWEEP_LOWS' ? '#22c55e' : '#ef4444'};">
                                🎯 LIQUIDITY SWEEP DETECTADO
                            </div>
                            <div style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">${marketStructure.liquiditySweeps.description}</div>
                        </div>
                        ` : ''}
                    </div>
                </div>
                ` : ''}
                
                <!-- 3. CVD AVANÇADO -->
                ${cvdAdvanced ? `
                <div class="ta-section">
                    <div class="ta-section-header">
                        <div class="ta-section-icon" style="background: linear-gradient(135deg, #06b6d4 0%, #0891b2 100%);">
                            <i class="fas fa-wave-square"></i>
                        </div>
                        <div>
                            <div class="ta-section-title">CVD Avançado</div>
                            <div class="ta-section-subtitle">Divergências, Absorção, Breakouts</div>
                        </div>
                    </div>
                    <div style="padding: 16px; background: var(--bg-tertiary); border-radius: 12px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                            <div style="min-width: 0; flex: 1; overflow: hidden;">
                                <div style="font-size: 14px; color: var(--text-muted);">Delta Cumulativo</div>
                                <div style="font-size: 20px; font-weight: 800; white-space: nowrap; color: ${(cvdAdvanced.delta || 0) > 0 ? '#22c55e' : '#ef4444'};">
                                    ${(cvdAdvanced.delta || 0) > 0 ? '+' : ''}${(cvdAdvanced.delta || 0).toLocaleString()}
                                </div>
                            </div>
                            <div style="text-align: right;">
                                <div style="font-size: 10px; color: var(--text-muted);">Score</div>
                                <div style="font-size: 18px; font-weight: 800; white-space: nowrap; color: ${(cvdAdvanced.score || 0) > 0 ? '#22c55e' : (cvdAdvanced.score || 0) < 0 ? '#ef4444' : '#94a3b8'};">
                                    ${(cvdAdvanced.score || 0) > 0 ? '+' : ''}${(cvdAdvanced.score || 0).toFixed(1)}
                                </div>
                            </div>
                        </div>
                        <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 12px;">${cvdAdvanced.description || ''}</div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;">
                            <div style="padding: 8px; background: ${cvdAdvanced.divergence ? (cvdAdvanced.divergence.type.includes('BULLISH') ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)') : 'var(--bg-card)'}; border-radius: 8px; text-align: center;">
                                <div style="font-size: 9px; color: var(--text-muted); white-space: nowrap;">Divergência</div>
                                <div style="font-size: 14px;">${cvdAdvanced.divergence ? cvdAdvanced.divergence.icon : '—'}</div>
                                <div style="font-size: 9px; white-space: nowrap; color: ${cvdAdvanced.divergence ? (cvdAdvanced.divergence.type.includes('BULLISH') ? '#22c55e' : '#ef4444') : 'var(--text-muted)'};">
                                    ${cvdAdvanced.divergence ? cvdAdvanced.divergence.type.replace('_DIVERGENCE', '') : 'Nenhuma'}
                                </div>
                            </div>
                            <div style="padding: 8px; background: ${cvdAdvanced.absorption ? 'rgba(139,92,246,0.15)' : 'var(--bg-card)'}; border-radius: 8px; text-align: center;">
                                <div style="font-size: 9px; color: var(--text-muted); white-space: nowrap;">Absorção</div>
                                <div style="font-size: 14px;">${cvdAdvanced.absorption ? '🐋' : '—'}</div>
                                <div style="font-size: 9px; white-space: nowrap; color: ${cvdAdvanced.absorption ? '#8b5cf6' : 'var(--text-muted)'};">
                                    ${cvdAdvanced.absorption ? cvdAdvanced.absorption.type.replace('_ABSORPTION', '').replace('BULLISH', 'COMPRA').replace('BEARISH', 'VENDA') : 'Nenhuma'}
                                </div>
                            </div>
                            <div style="padding: 8px; background: ${cvdAdvanced.breakout ? 'rgba(249,115,22,0.15)' : 'var(--bg-card)'}; border-radius: 8px; text-align: center;">
                                <div style="font-size: 9px; color: var(--text-muted); white-space: nowrap;">Breakout</div>
                                <div style="font-size: 14px;">${cvdAdvanced.breakout ? '💥' : '—'}</div>
                                <div style="font-size: 9px; white-space: nowrap; color: ${cvdAdvanced.breakout ? '#f97316' : 'var(--text-muted)'};">
                                    ${cvdAdvanced.breakout ? (cvdAdvanced.breakout.type.includes('UP') ? 'COMPRA' : 'VENDA') : 'Nenhum'}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                ` : ''}
                
                                
                <!-- 5. MACRO + NEWS DE ALTO IMPACTO -->
                ${macroNews ? `
                <div class="ta-section">
                    <div class="ta-section-header">
                        <div class="ta-section-icon" style="background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);">
                            <i class="fas fa-globe"></i>
                        </div>
                        <div>
                            <div class="ta-section-title">Notícias Urgentes</div>
                            <div class="ta-section-subtitle">Alertas de alto impacto e notícias relevantes</div>
                        </div>
                    </div>
                    <div style="padding: 16px; background: var(--bg-tertiary); border-radius: 12px;">
                        <!-- Macro Sentiment -->
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                            <div>
                                <div style="font-size: 14px; font-weight: 700; color: ${macroNews.macroColor}; white-space: nowrap;">
                                    ${macroNews.macroSentiment === 'BULLISH' ? '🟢' : macroNews.macroSentiment === 'BEARISH' ? '🔴' : macroNews.macroSentiment === 'CAUTELA' ? '🟡' : '⚪'} 
                                    Sentimento Macro: ${macroNews.macroSentiment}
                                </div>
                            </div>
                            <div style="font-size: 12px; font-weight: 700; white-space: nowrap; color: ${macroNews.totalImpact > 0 ? '#22c55e' : macroNews.totalImpact < 0 ? '#ef4444' : '#94a3b8'};">
                                ${macroNews.totalImpact > 0 ? '+' : ''}${(macroNews.totalImpact || 0).toFixed(1)} pts
                            </div>
                        </div>
                        
                        ${macroNews.hasCriticalEvent ? `
                        <div style="padding: 12px; background: rgba(239,68,68,0.15); border: 1px solid rgba(239,68,68,0.3); border-radius: 8px; margin-bottom: 12px;">
                            <div style="font-size: 12px; font-weight: 700; color: #ef4444;">${macroNews.criticalEventDescription}</div>
                        </div>
                        ` : ''}
                        
                        ${macroNews.macroEvents && macroNews.macroEvents.length > 0 ? `
                        <div style="margin-bottom: 12px;">
                            <div style="font-size: 11px; color: var(--text-muted); font-weight: 700; margin-bottom: 8px; text-transform: uppercase;">📅 Próximos Eventos de Alto Impacto</div>
                            ${macroNews.macroEvents.slice(0, 5).map(e => `
                            <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; background: var(--bg-card); border-radius: 6px; margin-bottom: 4px; border-left: 3px solid ${e.isCritical ? '#ef4444' : '#f59e0b'}; gap: 6px;">
                                <div style="min-width: 0; flex: 1; overflow: hidden;">
                                    <div style="font-size: 11px; font-weight: 600; color: var(--text-primary); word-wrap: break-word;">${e.event?.substring(0, 40)}</div>
                                    <div style="font-size: 9px; color: var(--text-muted); white-space: nowrap;">${e.country || ''} • ${new Date(e.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
                                </div>
                                <span style="font-size: 9px; padding: 2px 6px; background: ${e.isCritical ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)'}; color: ${e.isCritical ? '#ef4444' : '#f59e0b'}; border-radius: 4px; font-weight: 600; white-space: nowrap; flex-shrink: 0;">${e.isCritical ? 'CRÍTICO' : 'ALTO'}</span>
                            </div>
                            `).join('')}
                        </div>
                        ` : ''}
                        
                        ${macroNews.urgentNews && macroNews.urgentNews.length > 0 ? `
                        <div>
                            <div style="font-size: 11px; color: var(--text-muted); font-weight: 700; margin-bottom: 8px; text-transform: uppercase;">📰 Notícias de Alto Impacto</div>
                            ${macroNews.urgentNews.slice(0, 5).map(n => `
                            <div style="padding: 8px; background: var(--bg-card); border-radius: 6px; margin-bottom: 4px; border-left: 3px solid ${n.sentiment > 0 ? '#22c55e' : n.sentiment < 0 ? '#ef4444' : '#94a3b8'};">
                                <div style="font-size: 11px; color: var(--text-primary); line-height: 1.3;">${n.isUrgent ? '🚨 ' : ''}${n.title?.substring(0, 80)}</div>
                                <div style="font-size: 9px; color: var(--text-muted); margin-top: 4px;">${n.source} • ${n.sentiment > 0 ? '🟢 Bullish' : n.sentiment < 0 ? '🔴 Bearish' : '⚪ Neutro'}</div>
                            </div>
                            `).join('')}
                        </div>
                        ` : `
                        <div style="text-align: center; padding: 12px; color: var(--text-muted); font-size: 11px;">
                            ✅ Nenhuma notícia urgente detectada
                        </div>
                        `}
                    </div>
                </div>
                ` : ''}
                
                <!-- 5B. BIG TECH & MACRO ECONOMIA EUA -->
                ${bigTechMacro ? `
                <div class="ta-section">
                    <div class="ta-section-header" style="flex-wrap: wrap;">
                        <div class="ta-section-icon" style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);">
                            <i class="fas fa-building"></i>
                        </div>
                        <div style="min-width: 0; flex: 1;">
                            <div class="ta-section-title">Big Tech & Macro EUA</div>
                            <div class="ta-section-subtitle">AAPL, MSFT, TSLA, META, NVDA + Macro</div>
                        </div>
                        <div style="flex-shrink: 0;">
                            <span style="padding: 3px 8px; border-radius: 10px; font-size: 10px; font-weight: 700; white-space: nowrap; background: ${bigTechMacro.bigTechSentiment === 'RISK-ON' ? 'rgba(34,197,94,0.15)' : bigTechMacro.bigTechSentiment === 'RISK-OFF' ? 'rgba(239,68,68,0.15)' : bigTechMacro.bigTechSentiment === 'POSITIVO' ? 'rgba(34,197,94,0.1)' : bigTechMacro.bigTechSentiment === 'NEGATIVO' ? 'rgba(239,68,68,0.1)' : 'rgba(148,163,184,0.15)'}; color: ${bigTechMacro.bigTechSentiment === 'RISK-ON' || bigTechMacro.bigTechSentiment === 'POSITIVO' ? '#22c55e' : bigTechMacro.bigTechSentiment === 'RISK-OFF' || bigTechMacro.bigTechSentiment === 'NEGATIVO' ? '#ef4444' : '#94a3b8'};">
                                ${bigTechMacro.bigTechSentiment}
                            </span>
                        </div>
                    </div>
                    
                    <div style="padding: 12px; background: var(--bg-tertiary); border-radius: 12px; overflow: hidden;">
                        <!-- Big Tech Stocks Grid -->
                        ${bigTechMacro.bigTech && bigTechMacro.bigTech.length > 0 ? `
                        <div style="font-size: 11px; color: var(--text-muted); font-weight: 700; margin-bottom: 10px; text-transform: uppercase;">🏢 Big Tech — Resultados em Tempo Real</div>
                        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-bottom: 16px;">
                            ${bigTechMacro.bigTech.map(t => `
                            <div style="background: var(--bg-card); border-radius: 10px; padding: 10px 6px; text-align: center; border: 1px solid ${t.changePercent > 0 ? 'rgba(34,197,94,0.2)' : t.changePercent < 0 ? 'rgba(239,68,68,0.2)' : 'var(--border-subtle)'};">
                                <div style="font-size: 16px; margin-bottom: 4px;">${t.icon}</div>
                                <div style="font-size: 10px; font-weight: 700; color: var(--text-primary);">${t.symbol}</div>
                                <div style="font-size: 12px; font-weight: 800; color: var(--text-primary); margin: 4px 0; white-space: nowrap;">$${(t.price || 0) >= 1000 ? (t.price || 0).toLocaleString('en-US', {maximumFractionDigits: 0}) : (t.price || 0).toFixed(2)}</div>
                                <div style="font-size: 11px; font-weight: 700; white-space: nowrap; color: ${t.changePercent > 0 ? '#22c55e' : t.changePercent < 0 ? '#ef4444' : '#94a3b8'};">
                                    ${t.changePercent > 0 ? '▲' : t.changePercent < 0 ? '▼' : '–'} ${Math.abs(t.changePercent || 0).toFixed(2)}%
                                </div>
                            </div>
                            `).join('')}
                        </div>
                        ` : ''}
                        
                        <!-- Market Indices -->
                        ${bigTechMacro.indices && bigTechMacro.indices.length > 0 ? `
                        <div style="font-size: 11px; color: var(--text-muted); font-weight: 700; margin-bottom: 10px; text-transform: uppercase;">📊 Índices de Mercado</div>
                        <div style="display: flex; gap: 6px; margin-bottom: 16px; flex-wrap: wrap;">
                            ${bigTechMacro.indices.map(idx => `
                            <div style="flex: 1 1 28%; min-width: 0; background: var(--bg-card); border-radius: 10px; padding: 8px; border-left: 3px solid ${idx.changePercent > 0 ? '#22c55e' : idx.changePercent < 0 ? '#ef4444' : '#94a3b8'};">
                                <div style="font-size: 9px; color: var(--text-muted); margin-bottom: 2px; white-space: normal; word-wrap: break-word;">${idx.icon} ${idx.name}</div>
                                <div style="font-size: 12px; font-weight: 800; color: var(--text-primary); white-space: nowrap;">${(idx.price || 0) >= 100 ? (idx.price || 0).toLocaleString('en-US', {maximumFractionDigits: 0}) : (idx.price || 0).toFixed(2)}</div>
                                <div style="font-size: 10px; font-weight: 700; white-space: nowrap; color: ${idx.changePercent > 0 ? '#22c55e' : idx.changePercent < 0 ? '#ef4444' : '#94a3b8'};">
                                    ${idx.changePercent > 0 ? '+' : ''}${(idx.changePercent || 0).toFixed(1)}%
                                </div>
                            </div>
                            `).join('')}
                        </div>
                        ` : ''}
                        
                        <!-- Fear & Greed Index -->
                        ${bigTechMacro.fearGreed ? `
                        <div style="font-size: 11px; color: var(--text-muted); font-weight: 700; margin-bottom: 10px; text-transform: uppercase;">🎭 Fear & Greed Index</div>
                        <div style="display: flex; align-items: center; gap: 12px; background: var(--bg-card); border-radius: 10px; padding: 12px; margin-bottom: 16px;">
                            <div style="width: 48px; height: 48px; border-radius: 50%; background: conic-gradient(${bigTechMacro.fearGreed.color} ${bigTechMacro.fearGreed.value}%, var(--border-subtle) ${bigTechMacro.fearGreed.value}%); display: flex; align-items: center; justify-content: center;">
                                <div style="width: 36px; height: 36px; border-radius: 50%; background: var(--bg-card); display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 800; color: ${bigTechMacro.fearGreed.color};">${bigTechMacro.fearGreed.value}</div>
                            </div>
                            <div style="min-width: 0; overflow: hidden;">
                                <div style="font-size: 13px; font-weight: 700; color: ${bigTechMacro.fearGreed.color}; white-space: nowrap;">${bigTechMacro.fearGreed.icon} ${bigTechMacro.fearGreed.classification}</div>
                                <div style="font-size: 11px; color: var(--text-muted); word-wrap: break-word;">${bigTechMacro.fearGreed.implication}</div>
                            </div>
                        </div>
                        ` : ''}
                        
                        <!-- Treasury Yields -->
                        ${bigTechMacro.treasuryYields ? `
                        <div style="font-size: 11px; color: var(--text-muted); font-weight: 700; margin-bottom: 10px; text-transform: uppercase;">🏛️ Treasury Yields (Títulos do Tesouro EUA)</div>
                        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: ${bigTechMacro.treasuryYields.isInverted ? '10px' : '16px'};">
                            <div style="background: var(--bg-card); border-radius: 8px; padding: 8px; text-align: center;">
                                <div style="font-size: 9px; color: var(--text-muted); white-space: nowrap;">3M</div>
                                <div style="font-size: 13px; font-weight: 800; color: var(--text-primary); white-space: nowrap;">${bigTechMacro.treasuryYields.month3 != null ? bigTechMacro.treasuryYields.month3.toFixed(2) + '%' : 'N/A'}</div>
                            </div>
                            <div style="background: var(--bg-card); border-radius: 8px; padding: 8px; text-align: center;">
                                <div style="font-size: 9px; color: var(--text-muted); white-space: nowrap;">5Y</div>
                                <div style="font-size: 13px; font-weight: 800; color: var(--text-primary); white-space: nowrap;">${bigTechMacro.treasuryYields.year5 != null ? bigTechMacro.treasuryYields.year5.toFixed(2) + '%' : 'N/A'}</div>
                            </div>
                            <div style="background: var(--bg-card); border-radius: 8px; padding: 8px; text-align: center;">
                                <div style="font-size: 9px; color: var(--text-muted); white-space: nowrap;">10Y</div>
                                <div style="font-size: 13px; font-weight: 800; color: var(--text-primary); white-space: nowrap;">${bigTechMacro.treasuryYields.year10 != null ? bigTechMacro.treasuryYields.year10.toFixed(2) + '%' : 'N/A'}</div>
                            </div>
                            <div style="background: var(--bg-card); border-radius: 8px; padding: 8px; text-align: center;">
                                <div style="font-size: 9px; color: var(--text-muted); white-space: nowrap;">30Y</div>
                                <div style="font-size: 13px; font-weight: 800; color: var(--text-primary); white-space: nowrap;">${bigTechMacro.treasuryYields.year30 != null ? bigTechMacro.treasuryYields.year30.toFixed(2) + '%' : 'N/A'}</div>
                            </div>
                        </div>
                        ${bigTechMacro.treasuryYields.isInverted ? `
                        <div style="padding: 8px 12px; background: rgba(239,68,68,0.12); border: 1px solid rgba(239,68,68,0.25); border-radius: 8px; margin-bottom: 16px;">
                            <div style="font-size: 11px; font-weight: 700; color: #ef4444;">⚠️ Curva de Juros INVERTIDA (3M-10Y: ${bigTechMacro.treasuryYields.yieldCurveSpread?.toFixed(2) || '?'}%) — Sinal de recessão</div>
                        </div>
                        ` : `
                        <div style="padding: 8px 12px; background: rgba(34,197,94,0.08); border-radius: 8px; margin-bottom: 16px;">
                            <div style="font-size: 11px; color: var(--text-muted);">✅ Spread 3M-10Y: ${bigTechMacro.treasuryYields.yieldCurveSpread != null ? bigTechMacro.treasuryYields.yieldCurveSpread.toFixed(2) + '%' : 'N/A'} — Curva normal</div>
                        </div>
                        `}
                        ` : ''}
                        
                        <!-- US Macro Indicators -->
                        ${bigTechMacro.macroIndicators && bigTechMacro.macroIndicators.length > 0 ? `
                        <div style="font-size: 11px; color: var(--text-muted); font-weight: 700; margin-bottom: 10px; text-transform: uppercase;">🇺🇸 Indicadores Macroeconômicos dos EUA</div>
                        <div style="display: flex; flex-direction: column; gap: 6px;">
                            ${bigTechMacro.macroIndicators.map(m => `
                            <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: var(--bg-card); border-radius: 8px; gap: 8px;">
                                <div style="display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1; overflow: hidden;">
                                    <span style="font-size: 16px; flex-shrink: 0;">${m.icon}</span>
                                    <div style="min-width: 0; overflow: hidden;">
                                        <div style="font-size: 12px; font-weight: 600; color: var(--text-primary); word-wrap: break-word;">${m.name}</div>
                                        <div style="font-size: 9px; color: var(--text-muted); white-space: nowrap;">${m.note || (m.date ? new Date(m.date).toLocaleDateString('pt-BR') : '')}</div>
                                    </div>
                                </div>
                                <div style="font-size: 14px; font-weight: 800; color: var(--text-primary); white-space: nowrap;">${m.value != null ? m.value + (m.unit || '') : 'N/A'}</div>
                            </div>
                            `).join('')}
                        </div>
                        ` : ''}
                        
                        <!-- Impact Score -->
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: var(--bg-card); border-radius: 10px; margin-top: 12px; border: 1px solid ${bigTechMacro.bigTechScore > 0 ? 'rgba(34,197,94,0.2)' : bigTechMacro.bigTechScore < 0 ? 'rgba(239,68,68,0.2)' : 'var(--border-subtle)'};">
                            <div style="font-size: 12px; font-weight: 700; color: var(--text-primary);">Impacto no Score Crypto</div>
                            <div style="font-size: 16px; font-weight: 800; white-space: nowrap; color: ${bigTechMacro.bigTechScore > 0 ? '#22c55e' : bigTechMacro.bigTechScore < 0 ? '#ef4444' : '#94a3b8'};">
                                ${bigTechMacro.bigTechScore > 0 ? '+' : ''}${(bigTechMacro.bigTechScore || 0).toFixed(1)} pts
                            </div>
                        </div>
                    </div>
                </div>
                ` : ''}
                
                                
                <!-- Order Flow Section -->
                <div class="ta-section">
                    <div class="ta-section-header">
                        <div class="ta-section-icon flow">
                            <i class="fas fa-water"></i>
                        </div>
                        <div>
                            <div class="ta-section-title">Order Flow</div>
                            <div class="ta-section-subtitle">Fluxo de ordens e intenção institucional</div>
                        </div>
                    </div>
                    
                    <!-- Funding Rate Gauge Visual -->
                    <div style="background: var(--bg-tertiary); border-radius: 12px; padding: 16px; margin-bottom: 16px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                            <div style="font-size: 14px; font-weight: 700; color: var(--text-primary);">📊 Funding Rate</div>
                            <div style="font-size: 18px; font-weight: 800; white-space: nowrap; color: ${parseFloat(indicators.orderFlow.fundingRate) > 0.01 ? '#ef4444' : parseFloat(indicators.orderFlow.fundingRate) < -0.01 ? '#22c55e' : '#f59e0b'};">
                                ${indicators.orderFlow.fundingRate}%
                            </div>
                        </div>
                        
                        <!-- Gauge Bar -->
                        <div style="position: relative; height: 32px; background: linear-gradient(90deg, #22c55e 0%, #22c55e 20%, #4ade80 20%, #4ade80 35%, #fbbf24 35%, #fbbf24 50%, #f59e0b 50%, #f59e0b 65%, #f87171 65%, #f87171 80%, #ef4444 80%, #ef4444 100%); border-radius: 8px; overflow: hidden;">
                            <!-- Marcador central (0%) -->
                            <div style="position: absolute; left: 50%; top: 0; width: 2px; height: 100%; background: white; transform: translateX(-50%); z-index: 2;"></div>
                            
                            <!-- Indicador de posição -->
                            <div style="position: absolute; left: ${Math.min(Math.max(50 + (parseFloat(indicators.orderFlow.fundingRate) * 500), 5), 95)}%; top: 50%; transform: translate(-50%, -50%); z-index: 3;">
                                <div style="width: 20px; height: 20px; background: white; border-radius: 50%; box-shadow: 0 2px 8px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center;">
                                    <div style="width: 8px; height: 8px; background: ${parseFloat(indicators.orderFlow.fundingRate) > 0.01 ? '#ef4444' : parseFloat(indicators.orderFlow.fundingRate) < -0.01 ? '#22c55e' : '#f59e0b'}; border-radius: 50%;"></div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Labels -->
                        <div style="display: flex; justify-content: space-between; margin-top: 8px; font-size: 9px; color: var(--text-muted); white-space: nowrap;">
                            <span style="color: #22c55e;">-0.1%<br/><span style="font-size: 8px;">SHORT paga</span></span>
                            <span style="text-align: center;">0%<br/><span style="font-size: 8px;">Neutro</span></span>
                            <span style="text-align: right; color: #ef4444;">+0.1%<br/><span style="font-size: 8px;">LONG paga</span></span>
                        </div>
                        
                        <!-- Interpretação -->
                        <div style="margin-top: 12px; padding: 10px; background: ${parseFloat(indicators.orderFlow.fundingRate) > 0.03 ? 'rgba(239, 68, 68, 0.15)' : parseFloat(indicators.orderFlow.fundingRate) < -0.01 ? 'rgba(34, 197, 94, 0.15)' : 'rgba(245, 158, 11, 0.15)'}; border-radius: 8px;">
                            <div style="font-size: 11px; font-weight: 600; color: ${parseFloat(indicators.orderFlow.fundingRate) > 0.03 ? '#ef4444' : parseFloat(indicators.orderFlow.fundingRate) < -0.01 ? '#22c55e' : '#f59e0b'};">
                                ${parseFloat(indicators.orderFlow.fundingRate) > 0.05 ? '⚠️ MUITO ALTO - Mercado sobrecomprado, pressão de venda iminente' : parseFloat(indicators.orderFlow.fundingRate) > 0.03 ? '▲ ALTO - Longs dominantes, risco de liquidação cascata' : parseFloat(indicators.orderFlow.fundingRate) > 0.01 ? '📊 LEVEMENTE ALTO - Longs pagando shorts' : parseFloat(indicators.orderFlow.fundingRate) < -0.03 ? '⚠️ MUITO NEGATIVO - Shorts dominantes, possível squeeze' : parseFloat(indicators.orderFlow.fundingRate) < -0.01 ? '▼ NEGATIVO - Shorts pagando longs' : '⚖️ NEUTRO - Mercado equilibrado'}
                            </div>
                        </div>
                    </div>
                    
                    <div class="ta-indicator-grid">
                        <div class="ta-indicator-item">
                            <div class="ta-indicator-header">
                                <span class="ta-indicator-name">CVD</span>
                                <span class="ta-indicator-signal ${indicators.orderFlow.cvdSignal.includes('bullish') ? 'bullish' : indicators.orderFlow.cvdSignal.includes('bearish') ? 'bearish' : 'neutral'}">
                                    ${indicators.orderFlow.cvdSignal.includes('bullish') ? 'COMPRA' : indicators.orderFlow.cvdSignal.includes('bearish') ? 'VENDA' : 'NEUTRO'}
                                </span>
                            </div>
                            <div class="ta-indicator-value">${indicators.orderFlow.cvd > 0 ? '+' : ''}${indicators.orderFlow.cvd.toLocaleString()}</div>
                            <div class="ta-indicator-change">${indicators.orderFlow.cvdSignal.includes('absorption') ? '⚡ Absorção detectada' : 'Delta de volume'}</div>
                        </div>
                        <div class="ta-indicator-item">
                            <div class="ta-indicator-header">
                                <span class="ta-indicator-name">Open Interest</span>
                                <span class="ta-indicator-signal ${indicators.orderFlow.oiSignal === 'increasing' ? 'bullish' : indicators.orderFlow.oiSignal === 'decreasing' ? 'bearish' : 'neutral'}">
                                    ${indicators.orderFlow.oiSignal === 'increasing' ? 'SUBINDO' : indicators.orderFlow.oiSignal === 'decreasing' ? 'CAINDO' : 'ESTÁVEL'}
                                </span>
                            </div>
                            <div class="ta-indicator-value">${indicators.orderFlow.oiChange > 0 ? '+' : ''}${indicators.orderFlow.oiChange}%</div>
                            <div class="ta-indicator-change">Variação de contratos</div>
                        </div>
                    </div>
                </div>
                
                <!-- Volume Profile Section -->
                <div class="ta-section">
                    <div class="ta-section-header">
                        <div class="ta-section-icon volume">
                            <i class="fas fa-chart-area"></i>
                        </div>
                        <div>
                            <div class="ta-section-title">Volume Profile</div>
                            <div class="ta-section-subtitle">Mapa de preço justo (Auction Market Theory)</div>
                        </div>
                    </div>
                    <div class="ta-indicator-grid">
                        <div class="ta-indicator-item">
                            <div class="ta-indicator-header">
                                <span class="ta-indicator-name">POC</span>
                                <span class="ta-indicator-signal neutral">PIVOT</span>
                            </div>
                            <div class="ta-indicator-value">$${formatPrice(indicators.volumeProfile.poc)}</div>
                            <div class="ta-indicator-change">Point of Control</div>
                        </div>
                        <div class="ta-indicator-item">
                            <div class="ta-indicator-header">
                                <span class="ta-indicator-name">VWAP</span>
                                <span class="ta-indicator-signal neutral">REF</span>
                            </div>
                            <div class="ta-indicator-value">$${formatPrice(indicators.volumeProfile.vwap)}</div>
                            <div class="ta-indicator-change">Média institucional</div>
                        </div>
                        <div class="ta-indicator-item">
                            <div class="ta-indicator-header">
                                <span class="ta-indicator-name">VAH</span>
                                <span class="ta-indicator-signal bearish">RES</span>
                            </div>
                            <div class="ta-indicator-value">$${formatPrice(indicators.volumeProfile.vah)}</div>
                            <div class="ta-indicator-change">Área de valor alta</div>
                        </div>
                        <div class="ta-indicator-item">
                            <div class="ta-indicator-header">
                                <span class="ta-indicator-name">VAL</span>
                                <span class="ta-indicator-signal bullish">SUP</span>
                            </div>
                            <div class="ta-indicator-value">$${formatPrice(indicators.volumeProfile.val)}</div>
                            <div class="ta-indicator-change">Área de valor baixa</div>
                        </div>
                    </div>
                </div>
                
                                
                <!-- Sentiment Section -->
                <div class="ta-section">
                    <div class="ta-section-header">
                        <div class="ta-section-icon sentiment">
                            <i class="fas fa-brain"></i>
                        </div>
                        <div>
                            <div class="ta-section-title">Sentimento & Indicadores</div>
                            <div class="ta-section-subtitle">Filtros de confluência técnica</div>
                        </div>
                    </div>
                    <div class="ta-indicator-grid">
                        <div class="ta-indicator-item">
                            <div class="ta-indicator-header">
                                <span class="ta-indicator-name">RSI (14)</span>
                                <span class="ta-indicator-signal ${indicators.sentiment.rsiSignal === 'oversold' ? 'bullish' : indicators.sentiment.rsiSignal === 'overbought' ? 'bearish' : 'neutral'}">
                                    ${indicators.sentiment.rsiSignal === 'oversold' ? 'SOBREVENDA' : indicators.sentiment.rsiSignal === 'overbought' ? 'SOBRECOMPRA' : 'NEUTRO'}
                                </span>
                            </div>
                            <div class="ta-indicator-value">${indicators.sentiment.rsi}</div>
                            <div class="ta-indicator-change">${parseFloat(indicators.sentiment.rsi) < 30 ? '⚡ Oportunidade' : parseFloat(indicators.sentiment.rsi) > 70 ? '⚠️ Cuidado' : 'Normal'}</div>
                        </div>
                        <div class="ta-indicator-item">
                            <div class="ta-indicator-header">
                                <span class="ta-indicator-name">Taker Buy/Sell</span>
                                <span class="ta-indicator-signal ${indicators.sentiment.lsSignal === 'bullish' ? 'bullish' : indicators.sentiment.lsSignal === 'bearish' ? 'bearish' : 'neutral'}">
                                    ${indicators.sentiment.lsSignal === 'bullish' ? 'COMPRADORES' : indicators.sentiment.lsSignal === 'bearish' ? 'VENDEDORES' : 'EQUILIBRIO'}
                                </span>
                            </div>
                            <div class="ta-indicator-value">${indicators.sentiment.takerRatio}</div>
                            <div class="ta-indicator-change">${parseFloat(indicators.sentiment.takerRatio) > 1 ? '🟢 Pressão compradora' : parseFloat(indicators.sentiment.takerRatio) < 1 ? '🔴 Pressão vendedora' : 'Equilibrado'}</div>
                        </div>
                    </div>
                </div>
                ${renderLiquidationMapSection(indicators.realLiquidations, indicators.liquidationRiskMap, formatBigNumber, formatPrice)}
                
                <!-- Moving Averages Section -->
                <div class="ta-section">
                    <div class="ta-section-header">
                        <div class="ta-section-icon" style="background: linear-gradient(135deg, #f59e0b 0%, #f97316 100%);">
                            <i class="fas fa-chart-line"></i>
                        </div>
                        <div>
                            <div class="ta-section-title">Médias Móveis</div>
                            <div class="ta-section-subtitle">EMAs e SMAs multi-timeframe (15m, 1h, 4h, 1d)</div>
                        </div>
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-top: 10px;">
                        <div style="background: linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, transparent 100%); padding: 10px 8px; border-radius: 10px; border: 1px solid rgba(59, 130, 246, 0.3); text-align: center; min-width: 0; overflow: hidden;">
                            <div style="font-size: 10px; color: #3b82f6; font-weight: 700;">EMA 9 <span style="font-size:8px;color:var(--text-muted);">(15m)</span></div>
                            <div style="font-size: 11px; font-weight: 700; color: var(--text-primary); margin-top: 2px; word-break: break-all;">$${formatPrice(parseFloat(indicators.movingAverages?.ema9 || 0))}</div>
                            <div style="font-size: 9px; color: ${parseFloat(indicators.movingAverages?.currentPrice || 0) > parseFloat(indicators.movingAverages?.ema9 || 0) ? '#22c55e' : '#ef4444'}; margin-top: 2px;">
                                ${parseFloat(indicators.movingAverages?.currentPrice || 0) > parseFloat(indicators.movingAverages?.ema9 || 0) ? '▲ Acima' : '▼ Abaixo'}
                            </div>
                        </div>
                        <div style="background: linear-gradient(135deg, rgba(34, 197, 94, 0.15) 0%, transparent 100%); padding: 10px 8px; border-radius: 10px; border: 1px solid rgba(34, 197, 94, 0.3); text-align: center; min-width: 0; overflow: hidden;">
                            <div style="font-size: 10px; color: #22c55e; font-weight: 700;">EMA 21 <span style="font-size:8px;color:var(--text-muted);">(1h)</span></div>
                            <div style="font-size: 11px; font-weight: 700; color: var(--text-primary); margin-top: 2px; word-break: break-all;">$${formatPrice(parseFloat(indicators.movingAverages?.ema21 || 0))}</div>
                            <div style="font-size: 9px; color: ${parseFloat(indicators.movingAverages?.currentPrice || 0) > parseFloat(indicators.movingAverages?.ema21 || 0) ? '#22c55e' : '#ef4444'}; margin-top: 2px;">
                                ${parseFloat(indicators.movingAverages?.currentPrice || 0) > parseFloat(indicators.movingAverages?.ema21 || 0) ? '▲ Acima' : '▼ Abaixo'}
                            </div>
                        </div>
                        <div style="background: linear-gradient(135deg, rgba(249, 115, 22, 0.15) 0%, transparent 100%); padding: 10px 8px; border-radius: 10px; border: 1px solid rgba(249, 115, 22, 0.3); text-align: center; min-width: 0; overflow: hidden;">
                            <div style="font-size: 10px; color: #f97316; font-weight: 700;">EMA 50 <span style="font-size:8px;color:var(--text-muted);">(1h)</span></div>
                            <div style="font-size: 11px; font-weight: 700; color: var(--text-primary); margin-top: 2px; word-break: break-all;">$${formatPrice(parseFloat(indicators.movingAverages?.ema50 || 0))}</div>
                            <div style="font-size: 9px; color: ${parseFloat(indicators.movingAverages?.currentPrice || 0) > parseFloat(indicators.movingAverages?.ema50 || 0) ? '#22c55e' : '#ef4444'}; margin-top: 2px;">
                                ${parseFloat(indicators.movingAverages?.currentPrice || 0) > parseFloat(indicators.movingAverages?.ema50 || 0) ? '▲ Acima' : '▼ Abaixo'}
                            </div>
                        </div>
                        <div style="background: var(--bg-tertiary); padding: 10px 8px; border-radius: 10px; text-align: center; min-width: 0; overflow: hidden;">
                            <div style="font-size: 10px; color: var(--text-muted); font-weight: 600;">SMA 50 <span style="font-size:8px;">(4h)</span></div>
                            <div style="font-size: 11px; font-weight: 700; color: var(--text-primary); margin-top: 2px; word-break: break-all;">$${formatPrice(parseFloat(indicators.movingAverages?.sma50 || 0))}</div>
                            <div style="font-size: 9px; color: ${parseFloat(indicators.movingAverages?.currentPrice || 0) > parseFloat(indicators.movingAverages?.sma50 || 0) ? '#22c55e' : '#ef4444'}; margin-top: 2px;">
                                ${parseFloat(indicators.movingAverages?.currentPrice || 0) > parseFloat(indicators.movingAverages?.sma50 || 0) ? '▲ Acima' : '▼ Abaixo'}
                            </div>
                        </div>
                        <div style="background: var(--bg-tertiary); padding: 10px 8px; border-radius: 10px; text-align: center; min-width: 0; overflow: hidden;">
                            <div style="font-size: 10px; color: var(--text-muted); font-weight: 600;">SMA 99 <span style="font-size:8px;">(4h)</span></div>
                            <div style="font-size: 11px; font-weight: 700; color: var(--text-primary); margin-top: 2px; word-break: break-all;">$${formatPrice(parseFloat(indicators.movingAverages?.sma99 || 0))}</div>
                            <div style="font-size: 9px; color: ${parseFloat(indicators.movingAverages?.currentPrice || 0) > parseFloat(indicators.movingAverages?.sma99 || 0) ? '#22c55e' : '#ef4444'}; margin-top: 2px;">
                                ${parseFloat(indicators.movingAverages?.currentPrice || 0) > parseFloat(indicators.movingAverages?.sma99 || 0) ? '▲ Acima' : '▼ Abaixo'}
                            </div>
                        </div>
                        <div style="background: var(--bg-tertiary); padding: 10px 8px; border-radius: 10px; text-align: center; min-width: 0; overflow: hidden;">
                            <div style="font-size: 10px; color: var(--text-muted); font-weight: 600;">SMA 200 <span style="font-size:8px;">(1d)</span></div>
                            <div style="font-size: 11px; font-weight: 700; color: var(--text-primary); margin-top: 2px; word-break: break-all;">$${formatPrice(parseFloat(indicators.movingAverages?.sma200 || 0))}</div>
                            <div style="font-size: 9px; color: ${parseFloat(indicators.movingAverages?.currentPrice || 0) > parseFloat(indicators.movingAverages?.sma200 || 0) ? '#22c55e' : '#ef4444'}; margin-top: 2px;">
                                ${parseFloat(indicators.movingAverages?.currentPrice || 0) > parseFloat(indicators.movingAverages?.sma200 || 0) ? '▲ Acima' : '▼ Abaixo'}
                            </div>
                        </div>
                    </div>
                    <!-- Support and Resistance -->
                    <div style="margin-top: 12px; padding: 12px; background: var(--bg-tertiary); border-radius: 10px;">
                        <div style="font-size: 11px; font-weight: 700; color: var(--accent-purple); margin-bottom: 8px;">
                            <i class="fas fa-layer-group" style="margin-right: 6px;"></i>Suporte & Resistência
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                            <div style="background: var(--bg-card); padding: 10px; border-radius: 8px; border-left: 3px solid #22c55e;">
                                <div style="font-size: 10px; color: var(--text-muted);">SUPORTE</div>
                                <div style="font-size: 14px; font-weight: 700; color: #22c55e; white-space: nowrap;">$${formatPrice(parseFloat(indicators.movingAverages?.support || 0))}</div>
                            </div>
                            <div style="background: var(--bg-card); padding: 10px; border-radius: 8px; border-left: 3px solid #ef4444;">
                                <div style="font-size: 10px; color: var(--text-muted);">RESISTÊNCIA</div>
                                <div style="font-size: 14px; font-weight: 700; color: #ef4444; white-space: nowrap;">$${formatPrice(parseFloat(indicators.movingAverages?.resistance || 0))}</div>
                            </div>
                        </div>
                    </div>
                </div>
                
                                
                <!-- ====== V3 SECTIONS ====== -->
                
                <!-- V3: WARNINGS / RISK ALERTS -->
                ${analysis.warnings && analysis.warnings.length > 0 ? `
                <div class="ta-section">
                    <div class="ta-section-header">
                        <div class="ta-section-icon" style="background: linear-gradient(135deg, #ef4444 0%, #f97316 100%);">
                            <span style="font-size: 18px;">⚠️</span>
                        </div>
                        <div>
                            <div class="ta-section-title">Alertas & Limitações</div>
                            <div class="ta-section-subtitle">Quando o sistema pode errar</div>
                        </div>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        ${analysis.warnings.map(w => `
                            <div style="padding: 12px; background: ${w.color}15; border-radius: 10px; border-left: 3px solid ${w.color};">
                                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                                    <span style="font-size: 16px;">${w.icon}</span>
                                    <span style="font-size: 12px; font-weight: 700; white-space: nowrap; color: ${w.color};">${w.title}</span>
                                    <span style="font-size: 9px; padding: 2px 6px; border-radius: 4px; white-space: nowrap; background: ${w.color}20; color: ${w.color}; font-weight: 600;">${w.severity}</span>
                                </div>
                                <div style="font-size: 11px; color: var(--text-secondary); line-height: 1.4;">${w.message}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                ` : ''}
                
                <!-- V3: CRASH / BLACK SWAN DETECTOR -->
                ${analysis.crashState && analysis.crashState.severity !== 'NONE' ? `
                <div class="ta-section">
                    <div class="ta-section-header">
                        <div class="ta-section-icon" style="background: linear-gradient(135deg, #ef4444 0%, #991b1b 100%);">
                            <span style="font-size: 18px;">${analysis.crashState.override.icon || '🚨'}</span>
                        </div>
                        <div>
                            <div class="ta-section-title">Detector de Crash/Pump</div>
                            <div class="ta-section-subtitle">Proteção contra Black Swan</div>
                        </div>
                    </div>
                    <div style="padding: 16px; background: ${analysis.crashState.isCrash || analysis.crashState.isRapidPump ? 'rgba(239,68,68,0.1)' : 'rgba(234,179,8,0.1)'}; border-radius: 12px; border: 1px solid ${analysis.crashState.isCrash || analysis.crashState.isRapidPump ? 'rgba(239,68,68,0.3)' : 'rgba(234,179,8,0.3)'};">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                            <span style="font-size: 16px; font-weight: 800; white-space: nowrap; color: ${analysis.crashState.isCrash ? '#ef4444' : analysis.crashState.isRapidPump ? '#22c55e' : '#eab308'};">${analysis.crashState.severity}</span>
                            <span style="font-size: 11px; white-space: nowrap; color: var(--text-muted);">Direção: ${analysis.crashState.direction === 'down' ? '↓ Queda' : '↑ Alta'}</span>
                        </div>
                        ${analysis.crashState.override.message ? `<div style="font-size: 11px; color: var(--text-secondary); line-height: 1.4; margin-bottom: 10px;">${analysis.crashState.override.message}</div>` : ''}
                        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;">
                            <div style="background: var(--bg-tertiary); padding: 8px; border-radius: 8px; text-align: center;">
                                <div style="font-size: 9px; color: var(--text-muted); white-space: nowrap;">RoC 5min</div>
                                <div style="font-size: 13px; font-weight: 700; color: ${(analysis.crashState.rateOfChange['5min'] || 0) < 0 ? '#ef4444' : '#22c55e'};">${(analysis.crashState.rateOfChange['5min'] || 0).toFixed(2)}%</div>
                            </div>
                            <div style="background: var(--bg-tertiary); padding: 8px; border-radius: 8px; text-align: center;">
                                <div style="font-size: 9px; color: var(--text-muted); white-space: nowrap;">RoC 30min</div>
                                <div style="font-size: 13px; font-weight: 700; color: ${(analysis.crashState.rateOfChange['30min'] || 0) < 0 ? '#ef4444' : '#22c55e'};">${(analysis.crashState.rateOfChange['30min'] || 0).toFixed(2)}%</div>
                            </div>
                            <div style="background: var(--bg-tertiary); padding: 8px; border-radius: 8px; text-align: center;">
                                <div style="font-size: 9px; color: var(--text-muted); white-space: nowrap;">Velas Vermelhas</div>
                                <div style="font-size: 13px; font-weight: 700; color: var(--text-primary);">${analysis.crashState.consecutiveRedCandles}</div>
                            </div>
                            <div style="background: var(--bg-tertiary); padding: 8px; border-radius: 8px; text-align: center;">
                                <div style="font-size: 9px; color: var(--text-muted); white-space: nowrap;">Spike de Volume</div>
                                <div style="font-size: 13px; font-weight: 700; color: ${analysis.crashState.volumeSpikeDetected ? '#ef4444' : '#94a3b8'};">${analysis.crashState.volumeSpikeDetected ? 'SIM' : 'NÃO'}</div>
                            </div>
                        </div>
                        ${analysis.crashState.override.suppressOscillatorBuy ? '<div style="margin-top: 10px; padding: 8px; background: rgba(239,68,68,0.15); border-radius: 8px; font-size: 10px; color: #ef4444; font-weight: 600; text-align: center;">OSCILADORES DE COMPRA DESATIVADOS</div>' : ''}
                        ${analysis.crashState.override.suppressOscillatorSell ? '<div style="margin-top: 10px; padding: 8px; background: rgba(34,197,94,0.15); border-radius: 8px; font-size: 10px; color: #22c55e; font-weight: 600; text-align: center;">OSCILADORES DE VENDA DESATIVADOS</div>' : ''}
                    </div>
                </div>
                ` : ''}
                
                                
                <!-- V3: POSITION SIZING -->
                ${analysis.positionSize && analysis.positionSize.sizePercent > 0 ? `
                <div class="ta-section">
                    <div class="ta-section-header">
                        <div class="ta-section-icon" style="background: linear-gradient(135deg, #0ea5e9 0%, #0369a1 100%);">
                            <span style="font-size: 18px;">💰</span>
                        </div>
                        <div>
                            <div class="ta-section-title">Gestão de Risco & Posição</div>
                            <div class="ta-section-subtitle">Quanto arriscar nesta operação</div>
                        </div>
                    </div>
                    <div style="padding: 16px; background: rgba(14,165,233,0.08); border-radius: 12px; border: 1px solid rgba(14,165,233,0.2);">
                        <!-- Tamanho sugerido -->
                        <div style="text-align: center; margin-bottom: 14px;">
                            <div style="font-size: 28px; font-weight: 800; color: #0ea5e9;">${analysis.positionSize.icon} ${analysis.positionSize.sizePercent}%</div>
                            <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px; word-wrap: break-word; overflow-wrap: break-word;">${analysis.positionSize.recommendation}</div>
                            <div style="display: inline-block; margin-top: 8px; padding: 4px 12px; border-radius: 8px; background: ${analysis.positionSize.riskLevel === 'CONSERVADOR' ? 'rgba(34,197,94,0.2)' : analysis.positionSize.riskLevel === 'MODERADO' ? 'rgba(234,179,8,0.2)' : 'rgba(239,68,68,0.2)'}; color: ${analysis.positionSize.riskLevel === 'CONSERVADOR' ? '#22c55e' : analysis.positionSize.riskLevel === 'MODERADO' ? '#eab308' : '#ef4444'}; font-size: 10px; font-weight: 700;">
                                ${analysis.positionSize.riskLevel === 'CONSERVADOR' ? '🛡️ Risco Baixo' : analysis.positionSize.riskLevel === 'MODERADO' ? '⚖️ Risco Médio' : analysis.positionSize.riskLevel === 'AGRESSIVO' ? '🔥 Risco Alto' : '⚠️ Risco Máximo'}
                            </div>
                        </div>
                        <!-- Explicação simples -->
                        <div style="display: flex; flex-direction: column; gap: 6px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: var(--bg-tertiary); border-radius: 8px;">
                                <span style="font-size: 11px; color: var(--text-muted);">📊 O que significa</span>
                                <span style="font-size: 11px; color: var(--text-primary); font-weight: 600; text-align: right; max-width: 55%; word-wrap: break-word;">Use ${analysis.positionSize.sizePercent}% do seu capital</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: var(--bg-tertiary); border-radius: 8px;">
                                <span style="font-size: 11px; color: var(--text-muted);">📈 Confiança do sinal</span>
                                <span style="font-size: 11px; color: var(--text-primary); font-weight: 600;">${((analysis.positionSize.breakdown?.confMultiplier || 1) * 100).toFixed(0)}%</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: var(--bg-tertiary); border-radius: 8px;">
                                <span style="font-size: 11px; color: var(--text-muted);">🌡️ Volatilidade (ATR)</span>
                                <span style="font-size: 11px; color: ${(analysis.positionSize.breakdown?.atrPercent || 0) > 5 ? '#ef4444' : '#22c55e'}; font-weight: 600;">${(analysis.positionSize.breakdown?.atrPercent || 0).toFixed(1)}% ${(analysis.positionSize.breakdown?.atrPercent || 0) > 5 ? '(alta)' : '(normal)'}</span>
                            </div>
                            ${(analysis.positionSize.breakdown?.crashMultiplier || 1) < 1 ? `
                            <div style="padding: 10px; background: rgba(239,68,68,0.1); border-radius: 8px; border: 1px solid rgba(239,68,68,0.2);">
                                <span style="font-size: 11px; color: #ef4444; font-weight: 600;">⚠️ Mercado em queda detectado — posição reduzida automaticamente</span>
                            </div>
                            ` : ''}
                        </div>
                        <div style="margin-top: 10px; padding: 10px; background: rgba(14,165,233,0.06); border-radius: 8px; border: 1px dashed rgba(14,165,233,0.2);">
                            <div style="font-size: 10px; color: var(--text-muted); text-align: center; line-height: 1.5;">
                                💡 <strong>Dica:</strong> Se você tem R$ 1.000, use no máximo R$ ${(10 * analysis.positionSize.sizePercent).toFixed(0)} nesta operação.
                            </div>
                        </div>
                    </div>
                </div>
                ` : ''}
                
                <!-- BOS Validation: hidden from UI, logic still runs -->
                ${''}
                
                
                <!-- V3: ON-CHAIN DATA -->
                ${analysis.onChainData && analysis.onChainData.available ? `
                <div class="ta-section">
                    <div class="ta-section-header">
                        <div class="ta-section-icon" style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);">
                            <span style="font-size: 18px;">⛓️</span>
                        </div>
                        <div>
                            <div class="ta-section-title">Análise On-Chain</div>
                            <div class="ta-section-subtitle">Blockchain + Stablecoins</div>
                        </div>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 6px;">
                        ${(analysis.onChainData.details || []).map(d => `
                            <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: var(--bg-tertiary); border-radius: 8px; border-left: 3px solid ${d.color || '#94a3b8'};">
                                <span style="font-size: 11px; color: var(--text-secondary);">${d.name}</span>
                                <div style="display: flex; align-items: center; gap: 6px;">
                                    <span style="font-size: 11px; color: var(--text-primary);">${d.value}</span>
                                    <span style="font-size: 9px; padding: 2px 6px; border-radius: 4px; white-space: nowrap; background: ${d.color || '#94a3b8'}20; color: ${d.color || '#94a3b8'}; font-weight: 600;">${d.signal}</span>
                                </div>
                            </div>
                        `).join('')}
                        <div style="text-align: center; padding: 6px; font-size: 10px; color: var(--text-muted);">
                            Score On-Chain: <span style="font-weight: 700; color: ${analysis.onChainData.onChainScore >= 0 ? '#22c55e' : '#ef4444'};">${analysis.onChainData.onChainScore > 0 ? '+' : ''}${analysis.onChainData.onChainScore}</span>
                        </div>
                    </div>
                </div>
                ` : ''}
                
                <!-- ════════════════════════════════════════════════════ -->
                <!-- CONFIRMAÇÕES DE ANÁLISE -->
                <!-- ════════════════════════════════════════════════════ -->
                ${analysis.v4Gates && analysis.v4Gates.length > 0 ? `
                <div class="ta-section" style="border: 1px solid rgba(249,115,22,0.3); background: linear-gradient(135deg, rgba(249,115,22,0.05) 0%, transparent 100%);">
                    <div class="ta-section-header">
                        <div class="ta-section-icon" style="background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);">
                            <span style="font-size: 18px;">🎯</span>
                        </div>
                        <div>
                            <div class="ta-section-title">Confirmações</div>
                            <div class="ta-section-subtitle">Reagir ao mercado, não antecipar — ${analysis.v4GatesPassed || 0}/${analysis.v4GatesTotal || 9} confirmações</div>
                        </div>
                    </div>
                    <div style="margin-bottom: 10px; padding: 10px; border-radius: 8px; background: rgba(249,115,22,0.08); border: 1px solid rgba(249,115,22,0.15);">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <span style="font-size: 12px; font-weight: 700; color: #fb923c; white-space: nowrap;">Score de Confirmação</span>
                            <span style="font-size: 16px; font-weight: 800; color: ${(analysis.v4GateScore || 0) >= 65 ? '#22c55e' : (analysis.v4GateScore || 0) >= 40 ? '#f59e0b' : '#ef4444'};">${(analysis.v4GateScore || 0).toFixed(0)}%</span>
                        </div>
                        <div style="height: 8px; background: var(--bg-tertiary); border-radius: 4px; overflow: hidden;">
                            <div style="height: 100%; width: ${analysis.v4GateScore || 0}%; border-radius: 4px; background: linear-gradient(90deg, ${(analysis.v4GateScore || 0) >= 65 ? '#22c55e, #16a34a' : (analysis.v4GateScore || 0) >= 40 ? '#f59e0b, #d97706' : '#ef4444, #dc2626'}); transition: width 0.5s;"></div>
                        </div>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 6px;">
                        ${analysis.v4Gates.map(g => `
                            <div style="display: flex; align-items: flex-start; gap: 8px; padding: 8px 10px; background: ${g.passed ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)'}; border-radius: 8px; border-left: 3px solid ${g.passed ? '#22c55e' : '#ef4444'};">
                                <span style="font-size: 14px; min-width: 20px;">${g.passed ? '✅' : '❌'}</span>
                                <div style="flex: 1;">
                                    <div style="font-size: 11px; font-weight: 700; color: var(--text-primary); white-space: nowrap;">${g.name}</div>
                                    <div style="font-size: 10px; color: var(--text-secondary); margin-top: 2px; line-height: 1.3;">${(g.description || '').replace(/^[✅❌⚠️]\s?/, '')}</div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                ` : ''}
                
                <!-- V4: DISPLACEMENT & VOLUME EXPANSION -->
                ${analysis.displacement ? `
                <div class="ta-section">
                    <div class="ta-section-header">
                        <div class="ta-section-icon" style="background: linear-gradient(135deg, #06b6d4 0%, #0891b2 100%);">
                            <span style="font-size: 18px;">⚡</span>
                        </div>
                        <div>
                            <div class="ta-section-title">Força do Movimento</div>
                            <div class="ta-section-subtitle">Intensidade e volume do último movimento</div>
                        </div>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px;">
                        <div style="padding: 10px; background: ${analysis.displacement.detected ? 'rgba(34,197,94,0.1)' : 'rgba(100,116,139,0.1)'}; border-radius: 8px; border: 1px solid ${analysis.displacement.detected ? 'rgba(34,197,94,0.2)' : 'rgba(100,116,139,0.15)'};">
                            <div style="font-size: 9px; color: var(--text-muted); text-transform: uppercase; font-weight: 700; white-space: nowrap;">Deslocamento</div>
                            <div style="font-size: 14px; font-weight: 800; color: ${analysis.displacement.detected ? '#22c55e' : 'var(--text-muted)'}; white-space: nowrap;">${analysis.displacement.detected ? analysis.displacement.direction : 'NENHUM'}</div>
                            <div style="font-size: 10px; color: var(--text-secondary); margin-top: 2px;">Intensidade: ${analysis.displacement?.bodyZScore != null ? analysis.displacement.bodyZScore.toFixed(2) : ((analysis.displacement?.strength || 0) * 100).toFixed(0) + '%'}</div>
                        </div>
                        <div style="padding: 10px; background: ${analysis.volumeExpansion?.expanding ? 'rgba(34,197,94,0.1)' : 'rgba(100,116,139,0.1)'}; border-radius: 8px; border: 1px solid ${analysis.volumeExpansion?.expanding ? 'rgba(34,197,94,0.2)' : 'rgba(100,116,139,0.15)'};">
                            <div style="font-size: 9px; color: var(--text-muted); text-transform: uppercase; font-weight: 700; white-space: nowrap;">Volume</div>
                            <div style="font-size: 14px; font-weight: 800; color: ${analysis.volumeExpansion?.expanding ? '#22c55e' : 'var(--text-muted)'}; white-space: nowrap;">${analysis.volumeExpansion?.expanding ? 'EXPANDINDO' : 'NORMAL'}</div>
                            <div style="font-size: 10px; color: var(--text-secondary); margin-top: 2px;">Intensidade: ${analysis.volumeExpansion?.volZScore != null ? analysis.volumeExpansion.volZScore.toFixed(2) : (analysis.volumeExpansion?.['1h']?.ratio || '?') + '× média'}${analysis.volumeExpansion?.sustained ? ' (sustentado)' : ''}</div>
                        </div>
                    </div>
                    ${analysis.displacement['1h']?.details ? `<div style="padding: 6px 10px; background: var(--bg-tertiary); border-radius: 6px; font-size: 10px; color: var(--text-secondary); margin-bottom: 4px;">${analysis.displacement['1h'].details}</div>` : ''}
                    ${analysis.volumeExpansion?.['1h']?.details ? `<div style="padding: 6px 10px; background: var(--bg-tertiary); border-radius: 6px; font-size: 10px; color: var(--text-secondary);">${analysis.volumeExpansion['1h'].details}</div>` : ''}
                </div>
                ` : ''}
                
                <!-- V4: RANGE POSITION & SQUEEZE -->
                ${analysis.rangePosition ? `
                <div class="ta-section">
                    <div class="ta-section-header">
                        <div class="ta-section-icon" style="background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%);">
                            <span style="font-size: 18px;">📊</span>
                        </div>
                        <div>
                            <div class="ta-section-title">Posição no Range</div>
                            <div class="ta-section-subtitle">Análise de posição relativa do preço</div>
                        </div>
                    </div>
                    <div style="padding: 12px; background: ${analysis.rangePosition.tradeable ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)'}; border-radius: 10px; border: 1px solid ${analysis.rangePosition.tradeable ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}; margin-bottom: 8px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                            <span style="font-size: 12px; font-weight: 700; color: var(--text-primary); white-space: nowrap;">${analysis.rangePosition.rangePosition || 'UNKNOWN'}</span>
                            <span style="font-size: 10px; padding: 3px 8px; border-radius: 4px; font-weight: 700; white-space: nowrap; background: ${analysis.rangePosition.tradeable ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}; color: ${analysis.rangePosition.tradeable ? '#22c55e' : '#ef4444'};">${analysis.rangePosition.tradeable ? 'OPERÁVEL' : 'BLOQUEADO'}</span>
                        </div>
                        <div style="font-size: 10px; color: var(--text-secondary); line-height: 1.4;">${analysis.rangePosition.details}</div>
                        ${analysis.rangePosition.blockReason ? `<div style="margin-top: 6px; font-size: 10px; font-weight: 600; color: #f59e0b;">Motivo: ${analysis.rangePosition.blockReason}</div>` : ''}
                    </div>
                    ${analysis.squeezeState ? `
                    <div style="padding: 10px; background: ${analysis.squeezeState.isSqueeze ? (analysis.squeezeState.expanding ? 'rgba(249,115,22,0.1)' : 'rgba(100,116,139,0.1)') : 'rgba(34,197,94,0.05)'}; border-radius: 8px; border: 1px solid ${analysis.squeezeState.isSqueeze ? 'rgba(249,115,22,0.2)' : 'rgba(34,197,94,0.1)'};">
                        <div style="font-size: 11px; color: var(--text-secondary); line-height: 1.4;">${analysis.squeezeState.details || ''}</div>
                    </div>
                    ` : ''}
                    ${analysis.fundingFilter ? `
                    <div style="padding: 8px 10px; background: var(--bg-tertiary); border-radius: 8px; margin-top: 6px; display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-size: 10px; color: var(--text-muted);">Funding Rate</span>
                        <span style="font-size: 11px; font-weight: 700; color: ${analysis.fundingFilter.blocked ? '#ef4444' : analysis.fundingFilter.riskLevel === 'HIGH' ? '#f59e0b' : 'var(--text-primary)'}; white-space: nowrap;">${analysis.fundingFilter.rate}% ${analysis.fundingFilter.blocked ? '(BLOQUEADO)' : ''}</span>
                    </div>
                    ` : ''}
                    ${analysis.retest?.retested ? `
                    <div style="padding: 8px 10px; background: rgba(34,197,94,0.1); border-radius: 8px; margin-top: 6px; border: 1px solid rgba(34,197,94,0.2);">
                        <div style="font-size: 11px; font-weight: 700; color: #22c55e;">✅ ${analysis.retest.details}</div>
                        <div style="font-size: 10px; color: var(--text-secondary); margin-top: 2px;">Qualidade: ${analysis.retest.retestQuality}</div>
                    </div>
                    ` : ''}
                </div>
                ` : ''}
                
                <!-- ════════════════════════════════════════════════════ -->
                <!-- V4.1: SESSION CONTEXT / KILL ZONE -->
                <!-- ════════════════════════════════════════════════════ -->
                ${analysis.sessionContext ? `
                <div class="ta-section" style="border: 1px solid ${analysis.sessionContext.session === 'KILL_ZONE' ? 'rgba(239,68,68,0.3)' : analysis.sessionContext.session === 'LONDON_OPEN' ? 'rgba(59,130,246,0.3)' : 'rgba(100,116,139,0.2)'}; background: linear-gradient(135deg, ${analysis.sessionContext.session === 'KILL_ZONE' ? 'rgba(239,68,68,0.05)' : analysis.sessionContext.session === 'LONDON_OPEN' ? 'rgba(59,130,246,0.05)' : 'rgba(100,116,139,0.03)'} 0%, transparent 100%);">
                    <div class="ta-section-header">
                        <div class="ta-section-icon" style="background: linear-gradient(135deg, ${analysis.sessionContext.session === 'KILL_ZONE' ? '#ef4444, #dc2626' : analysis.sessionContext.session === 'LONDON_OPEN' ? '#3b82f6, #2563eb' : '#64748b, #475569'});">
                            <span style="font-size: 18px;">${analysis.sessionContext.session === 'KILL_ZONE' ? '🔥' : analysis.sessionContext.session === 'LONDON_OPEN' ? '🇬🇧' : analysis.sessionContext.session === 'ASIAN' ? '🌏' : analysis.sessionContext.isWeekend ? '🚫' : '🕐'}</span>
                        </div>
                        <div>
                            <div class="ta-section-title">Sessão: ${analysis.sessionContext.session === 'KILL_ZONE' ? 'Zona de Volatilidade' : analysis.sessionContext.session === 'LONDON_OPEN' ? 'Abertura Londres' : analysis.sessionContext.session === 'ASIAN' ? 'Sessão Asiática' : analysis.sessionContext.session === 'NY_OPEN' ? 'Abertura Nova York' : analysis.sessionContext.session || 'N/A'}</div>
                            <div class="ta-section-subtitle">${analysis.sessionContext.description || 'Contexto de sessão'}</div>
                        </div>
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;">
                        <div style="padding: 8px; background: var(--bg-primary); border-radius: 8px; text-align: center;">
                            <div style="font-size: 9px; color: var(--text-muted); white-space: nowrap;">Multiplicador</div>
                            <div style="font-size: 14px; font-weight: 800; color: ${analysis.sessionContext.signalMultiplier >= 1.2 ? '#22c55e' : analysis.sessionContext.signalMultiplier >= 0.8 ? '#f59e0b' : '#ef4444'};">×${(analysis.sessionContext.signalMultiplier || 1).toFixed(1)}</div>
                        </div>
                        <div style="padding: 8px; background: var(--bg-primary); border-radius: 8px; text-align: center;">
                            <div style="font-size: 9px; color: var(--text-muted); white-space: nowrap;">Liquidez</div>
                            <div style="font-size: 12px; font-weight: 700; color: ${analysis.sessionContext.liquidityLevel === 'ALTA' || analysis.sessionContext.liquidityLevel === 'MÁXIMA' ? '#22c55e' : analysis.sessionContext.liquidityLevel === 'BAIXA' ? '#ef4444' : '#f59e0b'}; white-space: nowrap;">${analysis.sessionContext.liquidityLevel || 'N/A'}</div>
                        </div>
                        <div style="padding: 8px; background: var(--bg-primary); border-radius: 8px; text-align: center;">
                            <div style="font-size: 9px; color: var(--text-muted); white-space: nowrap;">Fake Breakout</div>
                            <div style="font-size: 12px; font-weight: 700; color: ${analysis.sessionContext.fakeBreakoutRisk === 'ALTO' ? '#ef4444' : analysis.sessionContext.fakeBreakoutRisk === 'MÉDIO' ? '#f59e0b' : '#22c55e'}; white-space: nowrap;">${analysis.sessionContext.fakeBreakoutRisk || 'N/A'}</div>
                        </div>
                    </div>
                    ${analysis.sessionContext.isWeekend ? `
                    <div style="margin-top: 8px; padding: 8px 10px; background: rgba(239,68,68,0.1); border-radius: 8px; border: 1px solid rgba(239,68,68,0.2);">
                        <div style="font-size: 11px; font-weight: 700; color: #f87171;">🚫 FIM DE SEMANA — Todos sinais limitados a AGUARDAR</div>
                    </div>
                    ` : ''}
                </div>
                ` : ''}
                
                <!-- ════════════════════════════════════════════════════ -->
                <!-- V4.1: LIMIT ORDER EXECUTION PLAN -->
                <!-- ════════════════════════════════════════════════════ -->
                ${analysis.limitOrder && analysis.limitOrder.type !== 'NONE' ? `
                <div class="ta-section" style="border: 1px solid rgba(168,85,247,0.3); background: linear-gradient(135deg, rgba(168,85,247,0.05) 0%, transparent 100%);">
                    <div class="ta-section-header">
                        <div class="ta-section-icon" style="background: linear-gradient(135deg, #a855f7 0%, #7c3aed 100%);">
                            <span style="font-size: 18px;">📋</span>
                        </div>
                        <div>
                            <div class="ta-section-title">Plano de Execução</div>
                            <div class="ta-section-subtitle">${analysis.limitOrder.type === 'LIMIT_ON_RETEST' ? 'Limit Order — aguardar reteste' : 'Market — reteste confirmado'}</div>
                        </div>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px;">
                        <div style="padding: 10px; background: rgba(168,85,247,0.08); border-radius: 8px;">
                            <div style="font-size: 9px; color: var(--text-muted); text-transform: uppercase; font-weight: 700; white-space: nowrap;">Entrada</div>
                            <div style="font-size: 14px; font-weight: 800; color: #a855f7;">${analysis.limitOrder.entry != null ? analysis.limitOrder.entry.toLocaleString('en-US', {maximumFractionDigits: 6}) : '—'}</div>
                            <div style="font-size: 9px; color: var(--text-muted); white-space: nowrap;">${analysis.limitOrder.direction || ''}</div>
                        </div>
                        <div style="padding: 10px; background: rgba(239,68,68,0.08); border-radius: 8px;">
                            <div style="font-size: 9px; color: var(--text-muted); text-transform: uppercase; font-weight: 700; white-space: nowrap;">Stop Loss</div>
                            <div style="font-size: 14px; font-weight: 800; color: #ef4444;">${analysis.limitOrder.stopLoss != null ? analysis.limitOrder.stopLoss.toLocaleString('en-US', {maximumFractionDigits: 6}) : '—'}</div>
                        </div>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                        <div style="padding: 10px; background: rgba(34,197,94,0.08); border-radius: 8px;">
                            <div style="font-size: 9px; color: var(--text-muted); text-transform: uppercase; font-weight: 700; white-space: nowrap;">TP1 (R:R ${analysis.limitOrder.rr1 || '1:2'})</div>
                            <div style="font-size: 14px; font-weight: 800; color: #22c55e;">${analysis.limitOrder.takeProfit1 != null ? analysis.limitOrder.takeProfit1.toLocaleString('en-US', {maximumFractionDigits: 6}) : '—'}</div>
                        </div>
                        <div style="padding: 10px; background: rgba(34,197,94,0.08); border-radius: 8px;">
                            <div style="font-size: 9px; color: var(--text-muted); text-transform: uppercase; font-weight: 700; white-space: nowrap;">TP2 (R:R ${analysis.limitOrder.rr2 || '1:3'})</div>
                            <div style="font-size: 14px; font-weight: 800; color: #16a34a;">${analysis.limitOrder.takeProfit2 != null ? analysis.limitOrder.takeProfit2.toLocaleString('en-US', {maximumFractionDigits: 6}) : '—'}</div>
                        </div>
                    </div>
                    ${analysis.limitOrder.details ? `
                    <div style="margin-top: 8px; padding: 6px 10px; background: var(--bg-tertiary); border-radius: 6px; font-size: 10px; color: var(--text-secondary); line-height: 1.4;">${analysis.limitOrder.details}</div>
                    ` : ''}
                </div>
                ` : ''}
                
                <!-- Microestrutura: hidden from UI, logic still runs -->
                ${''}
                
                
                <!-- ════════════════════════════════════════════════════ -->
                <!-- V4.1: RISK ENGINE -->
                <!-- ════════════════════════════════════════════════════ -->
                ${analysis.riskEngine ? `
                <div class="ta-section" style="border: 1px solid ${analysis.riskEngine.killSwitchActive ? 'rgba(239,68,68,0.4)' : 'rgba(245,158,11,0.2)'}; background: ${analysis.riskEngine.killSwitchActive ? 'linear-gradient(135deg, rgba(239,68,68,0.08) 0%, transparent 100%)' : 'none'};">
                    <div class="ta-section-header">
                        <div class="ta-section-icon" style="background: linear-gradient(135deg, ${analysis.riskEngine.killSwitchActive ? '#ef4444, #dc2626' : '#f59e0b, #d97706'});">
                            <span style="font-size: 18px;">${analysis.riskEngine.killSwitchActive ? '🛑' : '🛡️'}</span>
                        </div>
                        <div>
                            <div class="ta-section-title">Gestão de Risco</div>
                            <div class="ta-section-subtitle">${analysis.riskEngine.killSwitchActive ? '⚠️ Kill Switch ATIVO — ' + (analysis.riskEngine.killSwitchReason || 'pausa forçada') : 'Gestão dinâmica de risco'}</div>
                        </div>
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; min-width: 0;">
                        <div style="padding: 8px; background: var(--bg-primary); border-radius: 8px; text-align: center; min-width: 0;">
                            <div style="font-size: 9px; color: var(--text-muted);">Tamanho</div>
                            <div style="font-size: 14px; font-weight: 800; color: var(--text-primary);">${(analysis.riskEngine.positionSizePct || 0).toFixed(1)}%</div>
                        </div>
                        <div style="padding: 8px; background: var(--bg-primary); border-radius: 8px; text-align: center; min-width: 0;">
                            <div style="font-size: 9px; color: var(--text-muted);">Alavancagem</div>
                            <div style="font-size: 14px; font-weight: 800; color: ${(analysis.riskEngine.leverage || 1) > 5 ? '#ef4444' : '#f59e0b'};">${analysis.riskEngine.leverage || 1}×</div>
                        </div>
                        <div style="padding: 8px; background: var(--bg-primary); border-radius: 8px; text-align: center; min-width: 0;">
                            <div style="font-size: 9px; color: var(--text-muted);">Risco</div>
                            <div style="font-size: 12px; font-weight: 700; color: ${analysis.riskEngine.riskLevel === 'LOW' ? '#22c55e' : analysis.riskEngine.riskLevel === 'MEDIUM' ? '#f59e0b' : '#ef4444'};">${analysis.riskEngine.riskLevel === 'LOW' ? 'Baixo' : analysis.riskEngine.riskLevel === 'MEDIUM' ? 'Médio' : analysis.riskEngine.riskLevel === 'HIGH' ? 'Alto' : 'N/A'}</div>
                        </div>
                    </div>
                    <div style="margin-top: 8px; display: flex; gap: 8px; min-width: 0;">
                        <div style="flex: 1; padding: 6px 10px; background: var(--bg-tertiary); border-radius: 6px; min-width: 0;">
                            <div style="font-size: 9px; color: var(--text-muted);">DD Diário</div>
                            <div style="font-size: 11px; font-weight: 700; color: ${(analysis.riskEngine.dailyDrawdown || 0) > 2 ? '#ef4444' : 'var(--text-primary)'};">${(analysis.riskEngine.dailyDrawdown || 0).toFixed(1)}% / ${(analysis.riskEngine.maxDailyDrawdown || 3).toFixed(0)}%</div>
                        </div>
                        <div style="flex: 1; padding: 6px 10px; background: var(--bg-tertiary); border-radius: 6px; min-width: 0;">
                            <div style="font-size: 9px; color: var(--text-muted);">DD Semanal</div>
                            <div style="font-size: 11px; font-weight: 700; color: ${(analysis.riskEngine.weeklyDrawdown || 0) > 5 ? '#ef4444' : 'var(--text-primary)'};">${(analysis.riskEngine.weeklyDrawdown || 0).toFixed(1)}% / ${(analysis.riskEngine.maxWeeklyDrawdown || 7).toFixed(0)}%</div>
                        </div>
                    </div>
                </div>
                ` : ''}
                
                <!-- OI ANALYSIS (Open Interest + Delta) -->
                ${analysis.oiAnalysis?.available ? `
                <div class="ta-section" style="border: 1px solid rgba(168,85,247,0.2);">
                    <div class="ta-section-header">
                        <div class="ta-section-icon" style="background: linear-gradient(135deg, #a855f7 0%, #7c3aed 100%);">
                            <span style="font-size: 18px;">📊</span>
                        </div>
                        <div>
                            <div class="ta-section-title">Open Interest</div>
                            <div class="ta-section-subtitle">${analysis.oiAnalysis.details}</div>
                        </div>
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 8px;">
                        <div style="background: rgba(168,85,247,0.1); padding: 8px; border-radius: 8px; text-align: center;">
                            <div style="font-size: 9px; color: var(--text-muted); white-space: nowrap;">OI Delta</div>
                            <div style="font-size: 12px; font-weight: 700; color: ${analysis.oiAnalysis.oiDeltaPercent > 0 ? '#22c55e' : analysis.oiAnalysis.oiDeltaPercent < 0 ? '#ef4444' : '#f59e0b'};">${analysis.oiAnalysis.oiDeltaPercent > 0 ? '+' : ''}${analysis.oiAnalysis.oiDeltaPercent}%</div>
                        </div>
                        <div style="background: rgba(168,85,247,0.1); padding: 8px; border-radius: 8px; text-align: center;">
                            <div style="font-size: 9px; color: var(--text-muted); white-space: nowrap;">Trend</div>
                            <div style="font-size: 12px; font-weight: 700; color: var(--text-primary);">${analysis.oiAnalysis.oiTrend}</div>
                        </div>
                        <div style="background: rgba(168,85,247,0.1); padding: 8px; border-radius: 8px; text-align: center;">
                            <div style="font-size: 9px; color: var(--text-muted); white-space: nowrap;">Taker</div>
                            <div style="font-size: 12px; font-weight: 700; color: ${analysis.oiAnalysis.takerBias === 'BULLISH' ? '#22c55e' : analysis.oiAnalysis.takerBias === 'BEARISH' ? '#ef4444' : '#f59e0b'};">${analysis.oiAnalysis.takerBias}</div>
                        </div>
                        <div style="background: rgba(168,85,247,0.1); padding: 8px; border-radius: 8px; text-align: center;">
                            <div style="font-size: 9px; color: var(--text-muted); white-space: nowrap;">Liqs</div>
                            <div style="font-size: 12px; font-weight: 700; color: var(--text-primary);">${analysis.oiAnalysis.liquidations?.longs || 0}L/${analysis.oiAnalysis.liquidations?.shorts || 0}S</div>
                        </div>
                    </div>
                    <div style="padding: 8px 10px; background: rgba(168,85,247,0.08); border-radius: 8px; font-size: 11px; color: var(--text-secondary);">
                        ${analysis.oiAnalysis.signal !== 'NEUTRAL' ? `<strong>${analysis.oiAnalysis.description}</strong>` : analysis.oiAnalysis.description}
                    </div>
                </div>
                ` : ''}

                <!-- Anti-Spoofing: hidden from UI, logic still runs -->
                ${''}

                <!-- Signal Conflict: hidden from UI, logic still runs -->
                ${''}

                <!-- DATA INTEGRITY -->
                ${analysis.dataIntegrity ? `
                <div style="padding: 8px 12px; margin-bottom: 10px; border-radius: 8px; background: ${analysis.dataIntegrity.critical ? 'rgba(239,68,68,0.1)' : analysis.dataIntegrity.degraded ? 'rgba(245,158,11,0.08)' : 'rgba(34,197,94,0.08)'}; border: 1px solid ${analysis.dataIntegrity.critical ? 'rgba(239,68,68,0.2)' : analysis.dataIntegrity.degraded ? 'rgba(245,158,11,0.15)' : 'rgba(34,197,94,0.15)'};">
                    <div style="font-size: 11px; font-weight: 600; color: ${analysis.dataIntegrity.critical ? '#f87171' : analysis.dataIntegrity.degraded ? '#f59e0b' : '#4ade80'};">
                        ${analysis.dataIntegrity.details}
                    </div>
                    ${analysis.dataIntegrity.issues.length > 0 ? `<div style="font-size: 10px; color: var(--text-muted); margin-top: 4px;">${analysis.dataIntegrity.issues.slice(0, 3).join(' | ')}</div>` : ''}
                </div>
                ` : ''}
                
                <!-- CALL HISTORY SECTION -->
                ${renderCallHistorySection(taCurrentSymbol || '')}
                
                <!-- ════════════════════════════════════════════════════ -->
                <!-- Bot Webhook: hidden from UI, logic still runs -->
                ${''}
                
                <!-- ════════════════════════════════════════════════════ -->
                <!-- DADOS DE MERCADO ADICIONAIS                          -->
                <!-- ════════════════════════════════════════════════════ -->

                <!-- Market Data Grid -->
                <div class="ta-section" style="border: 1px solid rgba(100,116,139,0.15);">
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;">
                        ${analysis.oiAnalysis?.available ? `
                        <div style="padding: 10px; background: rgba(100,116,139,0.06); border-radius: 8px;">
                            <div style="font-size: 9px; color: var(--text-muted); text-transform: uppercase; white-space: nowrap;">Open Interest</div>
                            <div style="font-size: 14px; font-weight: 700; color: var(--text-primary);">${analysis.oiAnalysis.currentOI ? (() => { const oiUsd = analysis.oiAnalysis.currentOI * (analysis.currentPrice || 1); if (oiUsd >= 1e9) return '$' + (oiUsd / 1e9).toFixed(2) + 'B'; if (oiUsd >= 1e6) return '$' + (oiUsd / 1e6).toFixed(1) + 'M'; return '$' + (oiUsd / 1e3).toFixed(0) + 'K'; })() : 'N/A'}</div>
                        </div>` : ''}
                        ${indicators?.fundingRate !== undefined ? `
                        <div style="padding: 10px; background: rgba(100,116,139,0.06); border-radius: 8px;">
                            <div style="font-size: 9px; color: var(--text-muted); text-transform: uppercase; white-space: nowrap;">Funding Rate</div>
                            <div style="font-size: 14px; font-weight: 700; color: ${parseFloat(indicators.fundingRate) > 0.01 ? '#ef4444' : parseFloat(indicators.fundingRate) < -0.01 ? '#22c55e' : 'var(--text-primary)'};">${indicators.fundingRate || 'N/A'}%</div>
                        </div>` : ''}
                        ${indicators?.longShortRatio ? `
                        <div style="padding: 10px; background: rgba(100,116,139,0.06); border-radius: 8px;">
                            <div style="font-size: 9px; color: var(--text-muted); text-transform: uppercase; white-space: nowrap;">Long/Short Ratio</div>
                            <div style="font-size: 14px; font-weight: 700; color: var(--text-primary);">${indicators.longShortRatio}</div>
                        </div>` : ''}
                        ${analysis.antiSpoof ? `
                        <div style="padding: 10px; background: rgba(100,116,139,0.06); border-radius: 8px;">
                            <div style="font-size: 9px; color: var(--text-muted); text-transform: uppercase; white-space: nowrap;">Order Book Bias</div>
                            <div style="font-size: 14px; font-weight: 700; color: ${analysis.antiSpoof.obBias === 'BULLISH' ? '#22c55e' : analysis.antiSpoof.obBias === 'BEARISH' ? '#ef4444' : 'var(--text-primary)'};">${analysis.antiSpoof.obBias === 'BULLISH' ? 'Alta' : analysis.antiSpoof.obBias === 'BEARISH' ? 'Baixa' : 'Neutro'} (${analysis.antiSpoof.bidAskRatio})</div>
                        </div>` : ''}
                    </div>
                    ${analysis.oiAnalysis?.liquidations?.totalUSD > 0 ? `
                    <div style="margin-top: 8px; padding: 8px 10px; background: rgba(239,68,68,0.06); border-radius: 8px; font-size: 11px; color: var(--text-secondary);">
                        💥 Liquidações (1h): <strong>${analysis.oiAnalysis.liquidations.longs} longs</strong> / <strong>${analysis.oiAnalysis.liquidations.shorts} shorts</strong> — Total: <strong>$${(analysis.oiAnalysis.liquidations.totalUSD / 1000).toFixed(0)}K</strong>
                    </div>` : ''}
                </div>

                <!-- AI Summary -->
                <div class="ta-ai-summary">
                    <div class="ta-ai-header">
                        <div class="ta-ai-icon">
                            <i class="fas fa-robot"></i>
                        </div>
                        <div class="ta-ai-title">Relatório da IA <span style="font-size: 9px; color: var(--text-muted); font-weight: 400;">Llama 3.3 70B via Groq</span></div>
                    </div>
                    <div class="ta-ai-text" style="white-space: pre-line;"><span style="color: var(--accent-blue);"><i class="fas fa-spinner fa-spin"></i> Gerando relatório com IA (Llama 3.3 70B)...</span></div>
                </div>
                
                <!-- ⚠️ AVISO LEGAL - Botão que abre modal -->
                <div style="margin: 16px 0; text-align: center;">
                    <button onclick="openAvisoLegalModal()" style="background: rgba(245,158,11,0.1); border: 1px solid rgba(245,158,11,0.25); border-radius: 20px; padding: 6px 16px; color: #f59e0b; font-size: 10px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
                        <i class="fas fa-exclamation-triangle" style="font-size: 9px;"></i>
                        Aviso Legal
                    </button>
                </div>
                
                <!-- Last Update -->
                <div class="ta-last-update">
                    <i class="fas fa-sync-alt"></i>
                    <span>Última atualização: ${new Date(timestamp).toLocaleTimeString('pt-BR')}</span>
                    <span style="margin-left: 8px; color: var(--accent-blue);">• Atualiza a cada 5 min</span>
                    ${analysis.v3ProcessingTime ? `<span style="margin-left: 8px; font-size: 10px; color: var(--text-muted);">Processado em ${analysis.v3ProcessingTime}ms</span>` : ''}
                </div>
            `;
            
            // v7.1: Initialize collapsible panels after render
            setTimeout(() => initCollapsiblePanels(body), 50);
            
            // Trigger real AI summary (Groq Llama 3.3 70B) asynchronously
            setTimeout(() => updateAISummaryInModal(analysis, taCurrentSymbol), 100);
            } catch (renderErr) {
                console.error('[TA Render] Error:', renderErr);
                if (body) body.innerHTML = `
                    <div style="padding: 40px 20px; text-align: center;">
                        <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
                        <div style="font-size: 16px; font-weight: 700; color: var(--text-primary); margin-bottom: 8px;">Erro ao renderizar análise</div>
                        <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 16px;">Tente novamente em alguns segundos.</div>
                        <div style="font-size: 10px; color: var(--text-muted); background: var(--bg-secondary); padding: 8px; border-radius: 8px; word-break: break-all;">${renderErr?.message || 'Erro desconhecido'}</div>
                    </div>
                `;
            }
        }
        
        // Handle back button for Technical Analysis
        window.addEventListener('popstate', function(event) {
            const taModal = document.getElementById('ta-modal');
            if (taModal && taModal.classList.contains('active')) {
                closeTechnicalAnalysis();
                event.preventDefault();
            }
        });
        let fullscreenChartInstance = null;
        let fullscreenChartType = 'line';
        let fullscreenPeriod = '15m';
        let fullscreenRefreshInterval = null;
        let fullscreenCandleData = []; // Dados separados para fullscreen

