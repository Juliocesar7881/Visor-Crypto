        // ═══════════════════════════════════════════════════
        // BANCO DE DADOS DE CALLS — Export (JSON / CSV)
        // ═══════════════════════════════════════════════════
        
        window.VISOR_SIGNAL_MIN_CONFIDENCE = 70;
        const SIGNAL_MIN_CONFIDENCE = window.VISOR_SIGNAL_MIN_CONFIDENCE;
        window.VISOR_DIRECTION_POLICY_VERSION = window.VISOR_DIRECTION_POLICY_VERSION || 'inverse-long-short-v1';
        window.applyVisorDirectionPolicy = window.applyVisorDirectionPolicy || function applyVisorDirectionPolicy(rawDirection, options = {}) {
            const normalized = String(rawDirection || '').toUpperCase().includes('LONG')
                ? 'LONG'
                : String(rawDirection || '').toUpperCase().includes('SHORT')
                    ? 'SHORT'
                    : 'NEUTRO';
            if (options && options.alreadyFinal === true) return normalized;
            if (normalized === 'LONG') return 'SHORT';
            if (normalized === 'SHORT') return 'LONG';
            return 'NEUTRO';
        };
        function clampSignalConfidenceThreshold(value, fallback = SIGNAL_MIN_CONFIDENCE) {
            const n = Number(value);
            const resolved = Number.isFinite(n) ? Math.round(n) : fallback;
            return Math.max(SIGNAL_MIN_CONFIDENCE, Math.min(100, resolved));
        }

        function exportCallHistoryJSON() {
            const history = getCallHistory();
            const stats = getCallStats(history);
            const exportData = {
                exportDate: new Date().toISOString(),
                appVersion: window.TAEngineV4?.VERSION || 'unknown',
                totalCalls: history.length,
                stats: stats,
                calls: history
            };
            
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'visor_crypto_calls_' + new Date().toISOString().slice(0,10) + '.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
        
        function exportCallHistoryCSV() {
            const history = getCallHistory();
            const headers = [
                'id','symbol','name','direction','confidence','entryPrice',
                'timestamp','date',
                'price_1h','price_2h','price_4h',
                'pnl_1h','pnl_2h','pnl_4h',
                'win_1h','win_2h','win_4h',
                'regime','session','gatesPassed','gatesTotal','gateScore',
                'displacement','volumeExpansion','setupFingerprint',
                'btcAligned','mtfAligned','squeeze','volRegime',
                'macroRegime','systemicRisk','cvdSource'
            ];
            
            const rows = history.map(call => {
                const a = call.analytics || {};
                const isWin = (iv) => {
                    const p = call.prices?.[iv];
                    if (p === null || p === undefined) return '';
                    return call.direction === 'LONG' ? (p > call.entryPrice ? 'WIN' : 'LOSS') : (p < call.entryPrice ? 'WIN' : 'LOSS');
                };
                return [
                    call.id, call.symbol, call.name, call.direction, call.confidence, call.entryPrice,
                    call.timestamp, new Date(call.timestamp).toISOString(),
                    call.prices?.['1h']||'', call.prices?.['2h']||'', call.prices?.['4h']||'',
                    call.pnl?.['1h']??'', call.pnl?.['2h']??'', call.pnl?.['4h']??'',
                    isWin('1h'), isWin('2h'), isWin('4h'),
                    a.regime||'', a.session||'', a.v4GatesPassed||'', a.v4GatesTotal||'', a.v4GateScore||'',
                    a.displacement?.detected||'', a.volumeExpansion||'', a.setupFingerprint||'',
                    a.btcAlignment?.aligned??'', a.mtf ? a.mtf.alignedCount+'/'+a.mtf.totalAvailable : '',
                    a.squeeze||'', a.volRegime||'', a.macroRegime||'', a.systemicRisk||'',
                    a.gates?.cvdConfirms?.cvdSource||''
                ].map(v => {
                    const str = String(v).replace(/"/g, '""');
                    return str.includes(',') || str.includes('"') || str.includes('\n') ? '"'+str+'"' : str;
                }).join(',');
            });
            
            const csv = headers.join(',') + '\n' + rows.join('\n');
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'visor_crypto_calls_' + new Date().toISOString().slice(0,10) + '.csv';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
        
        function getCallAnalyticsSummary() {
            const history = getCallHistory();
            if (history.length === 0) return null;
            
            const checked4h = history.filter(c => c.checked?.['4h']);
            
            // Win rate por regime
            const byRegime = {};
            checked4h.forEach(c => {
                const regime = c.analytics?.regime || 'unknown';
                if (!byRegime[regime]) byRegime[regime] = { wins: 0, losses: 0, total: 0 };
                byRegime[regime].total++;
                const isWin = c.direction === 'LONG' ? c.prices?.['4h'] > c.entryPrice : c.prices?.['4h'] < c.entryPrice;
                if (isWin) byRegime[regime].wins++; else byRegime[regime].losses++;
            });
            
            // Win rate por sessão
            const bySession = {};
            checked4h.forEach(c => {
                const session = c.analytics?.session || 'unknown';
                if (!bySession[session]) bySession[session] = { wins: 0, losses: 0, total: 0 };
                bySession[session].total++;
                const isWin = c.direction === 'LONG' ? c.prices?.['4h'] > c.entryPrice : c.prices?.['4h'] < c.entryPrice;
                if (isWin) bySession[session].wins++; else bySession[session].losses++;
            });
            
            // Win rate por gate count
            const byGateCount = {};
            checked4h.forEach(c => {
                const gates = c.analytics?.v4GatesPassed || 0;
                const key = gates + ' gates';
                if (!byGateCount[key]) byGateCount[key] = { wins: 0, losses: 0, total: 0 };
                byGateCount[key].total++;
                const isWin = c.direction === 'LONG' ? c.prices?.['4h'] > c.entryPrice : c.prices?.['4h'] < c.entryPrice;
                if (isWin) byGateCount[key].wins++; else byGateCount[key].losses++;
            });
            
            return {
                totalCalls: history.length,
                checked4h: checked4h.length,
                byRegime, bySession, byGateCount
            };
        }
        
        function renderCallHistorySection(currentSymbol) {
            const normalizeSymbol = (raw) => {
                const clean = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
                if (!clean) return '';
                return clean.endsWith('USDT') ? clean : `${clean}USDT`;
            };

            const fallbackSymbol = (typeof taCurrentSymbol !== 'undefined' && taCurrentSymbol) ? taCurrentSymbol : '';
            const effectiveSymbolRaw = currentSymbol || fallbackSymbol;
            const targetSymbol = normalizeSymbol(effectiveSymbolRaw);
            const history = (typeof getCallHistoryForDisplay === 'function')
                ? getCallHistoryForDisplay(effectiveSymbolRaw)
                : getCallHistory();
            const symbolHistory = targetSymbol
                ? history.filter(c => normalizeSymbol(c.symbol) === targetSymbol)
                : history;
            const scopedHistory = targetSymbol ? symbolHistory : history;
            const scopedStats = getCallStats(scopedHistory);
            const currentLabel = (typeof CRYPTO_DATABASE !== 'undefined' && CRYPTO_DATABASE[targetSymbol])
                ? CRYPTO_DATABASE[targetSymbol].short
                : (targetSymbol ? targetSymbol.replace(/USDT$/, '') : 'todos ativos');
            
            const formatP = (p) => {
                if (!p) return '—';
                if (p >= 1000) return '$' + p.toLocaleString('en-US', { maximumFractionDigits: 2 });
                if (p >= 1) return '$' + p.toFixed(4);
                return '$' + p.toFixed(6);
            };
            
            const pctChange = (entry, current) => {
                if (!current || !entry) return '';
                const pct = ((current - entry) / entry * 100).toFixed(2);
                return (pct >= 0 ? '+' : '') + pct + '%';
            };
            
            const getCallTs = (call) => Number(call?.timestamp || call?.time || call?.id || 0) || 0;
            const recentCalls = [...scopedHistory]
                .sort((a, b) => getCallTs(b) - getCallTs(a))
                .slice(0, 15)
                .sort((a, b) => getCallTs(a) - getCallTs(b));
            
            let html = `
                <!-- CALL HISTORY -->
                <div class="ta-section" style="border: 1px solid rgba(59,130,246,0.25); background: linear-gradient(135deg, rgba(59,130,246,0.04) 0%, transparent 100%);">
                    <div class="ta-section-header">
                        <div class="ta-section-icon" style="background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);">
                            <span style="font-size: 18px;">📋</span>
                        </div>
                        <div>
                            <div class="ta-section-title">Histórico de Calls</div>
                            <div class="ta-section-subtitle">${scopedHistory.length} calls de ${currentLabel} • Verificação em 1h, 2h e 4h</div>
                        </div>
                    </div>`;
            
            // Stats summary
            if (scopedHistory.length > 0) {
                html += `
                    <div style="display: grid; grid-template-columns: repeat(${CALL_CHECK_INTERVALS.length}, 1fr); gap: 6px; margin-bottom: 12px;">`;
                
                for (const iv of CALL_CHECK_INTERVALS) {
                    const s = scopedStats.byInterval[iv.key];
                    const wr = s.total > 0 ? (Number(s.winRate || ((s.wins / s.total) * 100))).toFixed(0) : '—';
                    const wrColor = s.total === 0 ? 'var(--text-muted)' : parseFloat(wr) >= 55 ? '#22c55e' : parseFloat(wr) >= 45 ? '#f59e0b' : '#ef4444';
                    html += `
                        <div style="background: var(--bg-tertiary); padding: 8px; border-radius: 10px; text-align: center;">
                            <div style="font-size: 9px; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Win Rate ${iv.label}</div>
                            <div style="font-size: 17px; font-weight: 800; color: ${wrColor};">${wr}${s.total > 0 ? '%' : ''}</div>
                            <div style="font-size: 10px; color: var(--text-muted);">${s.wins}W / ${s.losses}L / ${s.flat || 0}F${s.pending > 0 ? ' / ' + s.pending + ' pend.' : ''}</div>
                        </div>`;
                }
                html += `</div>`;
            }
            
            // Recent calls table
            if (recentCalls.length > 0) {
                html += `
                    <div style="font-size: 10px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 8px; padding: 0 4px;">
                        Últimas Calls
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 6px; max-height: 400px; overflow-y: auto;">`;
                
                for (const call of recentCalls) {
                    const isLong = call.direction === 'LONG';
                    const dirColor = isLong ? '#22c55e' : '#ef4444';
                    const dirIcon = isLong ? '▲' : '▼';
                    const date = new Date(call.timestamp);
                    const dateStr = date.toLocaleDateString(window.VisorI18n?.getLocale?.() || 'en-US', { day: '2-digit', month: '2-digit' }) + ' ' + date.toLocaleTimeString(window.VisorI18n?.getLocale?.() || 'en-US', { hour: '2-digit', minute: '2-digit' });
                    const isCurrent = targetSymbol ? (normalizeSymbol(call.symbol) === targetSymbol) : false;
                    
                    html += `
                        <div style="padding: 8px 9px; background: ${isCurrent ? 'rgba(59,130,246,0.08)' : 'var(--bg-tertiary)'}; border-radius: 8px; border-left: 3px solid ${dirColor}; ${isCurrent ? 'border: 1px solid rgba(59,130,246,0.2);' : ''}">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                                <div style="display: flex; align-items: center; gap: 6px;">
                                    <span style="font-size: 11px; font-weight: 800; color: ${dirColor};">${dirIcon} ${call.direction}</span>
                                    <span style="font-size: 10px; font-weight: 700; color: var(--text-primary);">${call.name || call.symbol}</span>
                                    <span style="font-size: 9px; padding: 1px 5px; border-radius: 4px; background: rgba(139,92,246,0.15); color: #a78bfa; font-weight: 600;">${call.confidence}%</span>
                                </div>
                                <span style="font-size: 9px; color: var(--text-muted);">${dateStr}</span>
                            </div>
                            <div style="display: grid; grid-template-columns: repeat(${CALL_CHECK_INTERVALS.length}, 1fr); gap: 5px;">`;
                    
                    for (const iv of CALL_CHECK_INTERVALS) {
                        const outcome = (typeof getCallOutcome === 'function')
                            ? getCallOutcome(call, iv.key)
                            : { status: 'pending', label: 'Pendente', icon: '<i class="fas fa-hourglass-half"></i>', color: 'var(--text-muted)', bg: 'var(--bg-card)', pnl: null };
                        const pnlText = Number.isFinite(outcome.pnl) ? `${outcome.pnl > 0 ? '+' : ''}${outcome.pnl.toFixed(2)}%` : '';
                        
                        html += `
                                <div style="text-align: center; padding: 6px 4px; background: ${outcome.bg}; border-radius: 8px;">
                                    <div style="font-size: 9px; color: var(--text-muted); font-weight: 600;">${iv.label}</div>
                                    <div style="font-size: 15px; margin: 1px 0; color: ${outcome.color};">${outcome.icon}</div>
                                    <div style="font-size: 9px; font-weight: 700; color: ${outcome.color};">${outcome.label}</div>
                                    ${pnlText ? `<div style="font-size: 8px; color: ${outcome.color}; margin-top: 1px;">${pnlText}</div>` : ''}
                                </div>`;
                    }
                    
                    html += `
                            </div>
                        </div>`;
                }
                
                html += `</div>`;
            } else {
                html += `
                    <div style="padding: 20px; text-align: center; background: var(--bg-tertiary); border-radius: 10px;">
                        <div style="font-size: 24px; margin-bottom: 8px;">📋</div>
                        <div style="font-size: 12px; color: var(--text-muted);">Nenhuma call registrada para ${currentLabel}</div>
                        <div style="font-size: 10px; color: var(--text-muted); margin-top: 4px;">Calls com confiança ≥${SIGNAL_MIN_CONFIDENCE}% são salvas automaticamente</div>
                    </div>`;
            }
            
            html += `</div>`;
            return html;
        }
        
        // Background price checker — runs every 5 minutes to reduce 1h/2h/4h settlement lag.
        setInterval(() => checkCallPrices(), 300000);
        // Also check on load
        setTimeout(() => checkCallPrices(), 5000);
        
        async function openTechnicalAnalysis(options = {}) {
            try {
                if (!currentChartSymbol) {
                    console.warn('No chart symbol');
                    return;
                }

                const skipChartStack = !!(options && options.skipChartStack);
                
                if (typeof taCurrentSymbol !== 'undefined') {
                    taCurrentSymbol = currentChartSymbol;
                }
                if (!skipChartStack && typeof taNavigationStack !== 'undefined') {
                    taNavigationStack.push({ type: 'chart', symbol: currentChartSymbol });
                }

                // Crash Prevention & Memory Management: cleanup active subscriptions
                if (window.RealtimeCVD && typeof window.RealtimeCVD.disconnect === 'function') {
                    try { window.RealtimeCVD.disconnect(); } catch(e) { console.warn('CVD disconnect error:', e); }
                }

                const modal = document.getElementById('ta-modal');
                const body = document.getElementById('ta-modal-body');
                const crypto = (typeof CRYPTO_DATABASE !== 'undefined') ? CRYPTO_DATABASE[currentChartSymbol] : null;
                
                if (!crypto || !modal || !body) {
                    console.warn('Missing DOM or crypto:', currentChartSymbol);
                    return;
                }

                // Atualizar título
                const titleEl = document.querySelector('.ta-modal-header-title');
                if (titleEl) titleEl.textContent = `Análise Técnica - ${crypto.name}`;
                
                // Mostrar loading
                body.innerHTML = `
                    <div class="ta-loading">
                        <div class="ta-loading-spinner"></div>
                        <div class="ta-loading-text">Analisando ${crypto.name}...</div>
                    </div>
                `;

                if (typeof cancelPendingTAModalClose === 'function') {
                    try { cancelPendingTAModalClose(); } catch (_) {}
                }
                modal.classList.remove('closing');
                const wasOpen = modal.classList.contains('active');
                if (!wasOpen) {
                    // Keep modal state synchronous so Android back closes on first press.
                    modal.classList.add('active');
                } else {
                    modal.classList.add('active');
                }
                document.body.style.overflow = 'hidden';

                // 🎯 Show interstitial ad while analysis loads in background
                // Native frequency limits keep monetization away from core signal flows.
                window.VisorMonetization?.recordAction('technical_analysis_transition').catch(() => {});

                // Init notification bell state
                if (window.RealtimeCVD && typeof window.RealtimeCVD.connect === 'function') {
                    try { window.RealtimeCVD.connect(currentChartSymbol); } catch(e) {}
                }
                if (typeof initNotifBellState === 'function') {
                    try { initNotifBellState(); } catch(e){}
                }

                // Adicionar ao histórico do navegador
                if (window.history && window.history.pushState) {
                    try { window.history.pushState({ page: 'technical-analysis', symbol: currentChartSymbol }, '', ''); } catch(e){}
                }

                // Verificar cache
                let cachedData = null;
                if (typeof getTACache === 'function') {
                    try { cachedData = getTACache(currentChartSymbol); } catch(e){}
                }
                if (cachedData && cachedData.analysis && cachedData.analysis._snapshotFrozen === true) {
                    cachedData = null;
                }
                
                if (cachedData && cachedData.analysis) {
                    _cacheAuthoritativeFromAnalysis(currentChartSymbol, cachedData.analysis, 'TA Cache');
                    if (typeof renderTechnicalAnalysis === 'function') {
                        renderTechnicalAnalysis(cachedData.analysis, crypto);
                    }
                    if (typeof startTAAutoRefresh === 'function') {
                        startTAAutoRefresh(currentChartSymbol);
                    }
                    return;
                }

                // Buscar dados em paralelo — FAST RENDER: Binance primeiro, extras em background
                try {
                    // 1. Fetch Binance data (rápido ~1-2s) e renderizar imediatamente
                    let analysisData = null;
                    if (typeof fetchTechnicalAnalysisData === 'function') {
                        analysisData = await fetchTechnicalAnalysisData(currentChartSymbol);
                    }
                    if (!analysisData) throw new Error("Falha ao buscar dados técnicos.");
                    
                    let analysis = null;
                    if (typeof generateTechnicalAnalysis === 'function') {
                        analysis = generateTechnicalAnalysis(analysisData, currentChartSymbol);
                    }
                    
                    // Evaluate enhancements sequentially before rendering to avoid flicker
                    try {

                            const [macroNewsData, bigTechData] = await Promise.all([
                                (window.TAEngineV2 && window.TAEngineV2.fetchMacroNewsLayer) ?
                                    window.TAEngineV2.fetchMacroNewsLayer(currentChartSymbol) :
                                    Promise.resolve(null),
                                (window.TAEngineV2 && window.TAEngineV2.fetchBigTechAndMacro) ?
                                    window.TAEngineV2.fetchBigTechAndMacro() :
                                    Promise.resolve(null)
                            ]);

                            // Inject macro/news data
                            if (analysis) {
                                analysis.macroNews = macroNewsData;
                                analysis.bigTechMacro = bigTechData;
                                if (macroNewsData && macroNewsData.totalImpact !== 0 && window.TAEngineV2) {
                                    const V2 = window.TAEngineV2;
                                    const reScored = V2.applyContextualScoring(
                                        analysis.confluenceDetails, analysis.marketRegime, analysis.marketStructure,
                                        analysis.cvdAdvanced, macroNewsData, analysis.volatilityMetrics
                                    );
                                    analysis.confluenceSummary.score = (parseFloat(analysis.confluenceSummary.score) + macroNewsData.totalImpact).toFixed(1);
                                    analysis.contextualAdjustments = reScored.adjustments;
                                }
                                if (bigTechData && bigTechData.bigTechScore !== 0) {
                                    analysis.confluenceSummary.score = (parseFloat(analysis.confluenceSummary.score) + bigTechData.bigTechScore).toFixed(1);
                                }
                                if (bigTechData) {
                                    analysis.indicators = analysis.indicators || {};
                                    analysis.indicators.bigTechMacro = bigTechData;
                                }
                            }
                            
                            // V3 Enhancement
                            if (window.TAEngineV3 && window.TAEngineV3.enhanceAnalysis && analysis) {
                                try {
                                    const enhanced = await window.TAEngineV3.enhanceAnalysis(analysis, analysisData, currentChartSymbol);
                                    Object.assign(analysis, enhanced);
                                    if (enhanced.v3Signal) {
                                        analysis.aiSummary = generateAISummary(
                                            enhanced.v3SignalType || analysis.signalType,
                                            enhanced.v3Confidence || analysis.confidence,
                                            analysis.indicators,
                                            currentChartSymbol
                                        );
                                    }
                                } catch (v3err) {}
                            }
                            
                            // V4 Enhancement
                            if (window.TAEngineV4 && window.TAEngineV4.enhanceWithReactive && analysis) {
                                try {
                                    const v4Enhanced = await window.TAEngineV4.enhanceWithReactive(analysis, analysisData, currentChartSymbol);
                                    Object.assign(analysis, v4Enhanced);
                                    if (v4Enhanced.v4Signal) {
                                        const v4Dir = v4Enhanced.v4Signal.includes('LONG') ? 'long' : v4Enhanced.v4Signal.includes('SHORT') ? 'short' : 'neutral';
                                        analysis.aiSummary = generateAISummary(
                                            v4Dir,
                                            v4Enhanced.v4Confidence || analysis.confidence,
                                            analysis.indicators,
                                            currentChartSymbol
                                        );
                                        if (v4Enhanced.reactiveSummary) {
                                            analysis.aiSummary += '\n\n━━━ ANÁLISE AVANÇADA ━━━\n' + v4Enhanced.reactiveSummary;
                                        }
                                    }
                                } catch (v4err) {}
                            }
                            
                            // Atualizar cache com dados completos
                            if (typeof setTACache === 'function' && analysis) setTACache(currentChartSymbol, { analysis });

                            if (analysis) {
                                _cacheAuthoritativeFromAnalysis(currentChartSymbol, analysis, 'TA Modal');
                            }
                            

                            
                            // Record call
                            try {
                                if (analysis) {
                                    const callSignal = analysis.v4Signal || analysis.v3Signal || analysis.signal;
                                    const callConf = analysis.v4Confidence || analysis.v3Confidence || analysis.confidence;
                                    const callEntry = parseFloat(analysis.entry) || parseFloat(analysis.indicators?.movingAverages?.currentPrice) || 0;
                                    if (callSignal && callConf && callEntry > 0 && typeof recordCall === 'function') {
                                        recordCall(currentChartSymbol, callSignal, callConf, callEntry, crypto, analysis);
                                    }
                                }
                            } catch (e) {}
                                                if (typeof renderTechnicalAnalysis === 'function' && analysis) {
                            renderTechnicalAnalysis(analysis, crypto);
                        }
                    } catch (bgErr) { console.error(bgErr); }
                    // Iniciar auto-refresh
                    if (typeof startTAAutoRefresh === 'function') startTAAutoRefresh(currentChartSymbol);
                    
                } catch (e) {
                    body.innerHTML = `
                        <div style="text-align: center; padding: 40px 20px;">
                            <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: var(--accent-red); margin-bottom: 16px;"></i>
                            <h3 style="color: var(--text-primary); margin-bottom: 8px;">Erro ao carregar análise</h3>
                            <p style="color: var(--text-secondary); font-size: 14px;">${e.message || String(e)}</p>
                            <button onclick="openTechnicalAnalysis()" style="margin-top: 20px; padding: 12px 24px; background: var(--accent-blue); border: none; border-radius: 12px; color: white; font-weight: 600; cursor: pointer;">
                                <i class="fas fa-redo"></i> Tentar Novamente
                            </button>
                        </div>
                    `;
                    console.error('[TA Engine] Error loading analysis:', e); // Added log for debugging
                }
            } catch (fatalError) {
                console.error("Fatal error in openTechnicalAnalysis:", fatalError);
                if (document.getElementById('ta-modal-body')) {
                    const taModal = document.getElementById('ta-modal');
                    if (typeof cancelPendingTAModalClose === 'function') {
                        try { cancelPendingTAModalClose(); } catch (_) {}
                    }
                    if (taModal) {
                        taModal.classList.remove('closing');
                        taModal.classList.add('active');
                    }
                    document.getElementById('ta-modal-body').innerHTML = '<div style="padding:40px 20px; text-align:center;"><i class="fas fa-bug" style="font-size:48px; color:var(--accent-red); margin-bottom:16px;"></i><h3 style="color:var(--text-primary); margin-bottom:8px;">Erro Crítico</h3><p style="color:var(--text-secondary); font-size:12px; margin-bottom:20px;">' + (fatalError.message || 'Erro inesperado') + '</p><button onclick="closeTechnicalAnalysis()" style="padding:12px 24px; border-radius:12px; background:var(--bg-secondary); color:var(--text-primary); border:none; font-weight:600; cursor:pointer;">Voltar ao Início</button></div>';
                } else {
                    console.error("Erro interno Crítico:", fatalError.message);
                }
            }
        }
        
        // v7.1: Aviso Legal Modal
        // ═══════════════════════════════════════
        // NOTIFICATION BELL — Config & Toggle
        // ═══════════════════════════════════════
        function toggleNotificationPanel() {
            const panel = document.getElementById('ta-notif-panel');
            if (!panel) return;
            const isOpen = panel.style.display !== 'none';
            panel.style.display = isOpen ? 'none' : 'block';
            if (!isOpen) loadNotifConfig();
        }

        function loadNotifConfig() {
            // Read from vc_signal_prefs — use PER-CRYPTO confidence for the current TA symbol
            const prefs = getSignalPrefs();
            const symbol = typeof taCurrentSymbol !== 'undefined' ? taCurrentSymbol : null;
            const cryptoPrefs = symbol ? (prefs.cryptos[symbol] || {}) : {};
            
            // Per-crypto enabled state, fallback to master
            const enabled = symbol ? (cryptoPrefs.enabled === true) : !!prefs.masterEnabled;
            // Per-crypto confidence, fallback to global
            const confThreshold = cryptoPrefs.confidence || prefs.globalConfidence || SIGNAL_MIN_CONFIDENCE;
            
            const toggle = document.getElementById('notif-toggle');
            const details = document.getElementById('notif-config-details');
            const slider = document.getElementById('notif-confidence-slider');
            
            if (toggle) toggle.checked = enabled;
            if (details) details.style.display = enabled ? 'block' : 'none';
            if (slider) {
                slider.value = clampSignalConfidenceThreshold(confThreshold);
                updateNotifConfLabel(slider.value);
            }
            
            // Update bell icon
            updateBellIcon(enabled);
        }

        function updateBellIcon(enabled) {
            const bell = document.getElementById('ta-notif-bell');
            const icon = document.getElementById('ta-notif-bell-icon');
            if (!bell || !icon) return;
            // Remove old dot
            const oldDot = bell.querySelector('.notif-dot');
            if (oldDot) oldDot.remove();
            
            if (enabled) {
                icon.className = 'fas fa-bell';
                icon.style.color = '#6366f1';
                const dot = document.createElement('div');
                dot.className = 'notif-dot';
                bell.appendChild(dot);
            } else {
                icon.className = 'fas fa-bell-slash';
                icon.style.color = '';
            }
        }

        function handleNotifToggle(checked) {
            const details = document.getElementById('notif-config-details');
            if (details) details.style.display = checked ? 'block' : 'none';
            updateBellIcon(checked);
            
            if (checked) {
                // Ao ativar o sino, ativa sempre o monitoramento global e todas as criptos!
                // Usa handleMasterSignalToggle para garantir que liga o background service e auto-scan
                handleMasterSignalToggle(true);

                const prefs = getSignalPrefs();
                dashRenderCryptoSettings();
                dashSyncMasterToggle();
                _syncBellPanelFromPrefs(prefs);

                try {
                    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications) {
                        window.Capacitor.Plugins.LocalNotifications.requestPermissions().catch(() => {});
                    }
                } catch(e) {}
            }
            
            // Salva a configuração de confiança escolhida (seja global ou da cripto atual)
            saveNotifConfig();
        }

        function updateNotifConfLabel(val) {
            const label = document.getElementById('notif-confidence-label');
            if (label) label.textContent = val + '%';
        }

        function saveNotifConfig() {
            if (!window.TAEngineV4) return;
            const enabled = document.getElementById('notif-toggle')?.checked || false;
            const confidence = clampSignalConfidenceThreshold(parseInt(document.getElementById('notif-confidence-slider')?.value || String(SIGNAL_MIN_CONFIDENCE)));
            const symbol = typeof taCurrentSymbol !== 'undefined' ? taCurrentSymbol : null;
            
            // Save to vc_signal_prefs — ALWAYS update the current crypto's per-crypto entry
            try {
                const prefs = getSignalPrefs();
                if (symbol) {
                    // Per-crypto save
                    if (!prefs.cryptos[symbol]) prefs.cryptos[symbol] = {};
                    prefs.cryptos[symbol].enabled = enabled;
                    prefs.cryptos[symbol].confidence = confidence;
                    // Also sync to V4 per-crypto
                    window.TAEngineV4.setNotificationConfig(symbol, {
                        enabled: enabled,
                        confidenceThreshold: confidence
                    });
                } else {
                    // No specific symbol: save as global
                    prefs.masterEnabled = enabled;
                    prefs.globalConfidence = confidence;
                }
                saveSignalPrefs(prefs);
                // Refresh SINAIS dashboard if it exists in DOM
                dashRenderCryptoSettings();
                dashSyncMasterToggle();
            } catch (e) { /* ignore sync errors */ }
        }

        // Initialize bell state on modal open — use per-crypto state
        function initNotifBellState() {
            const prefs = getSignalPrefs();
            const symbol = typeof taCurrentSymbol !== 'undefined' ? taCurrentSymbol : null;
            const cp = symbol ? (prefs.cryptos[symbol] || {}) : {};
            const enabled = symbol ? (cp.enabled === true) : !!prefs.masterEnabled;
            updateBellIcon(enabled);
        }

        // ═══════════════════════════════════════
        // BIDIRECTIONAL SYNC HELPER
        // Updates the bell panel (TA modal) UI from vc_signal_prefs
        // ═══════════════════════════════════════
        function _syncBellPanelFromPrefs(prefs) {
            try {
                const symbol = typeof taCurrentSymbol !== 'undefined' ? taCurrentSymbol : null;
                const cp = symbol ? (prefs.cryptos[symbol] || {}) : {};
                // Use per-crypto values when a symbol is active, otherwise global
                const enabled = symbol ? (cp.enabled === true) : !!prefs.masterEnabled;
                const conf = cp.confidence || prefs.globalConfidence || SIGNAL_MIN_CONFIDENCE;
                
                const bellToggle = document.getElementById('notif-toggle');
                const bellSlider = document.getElementById('notif-confidence-slider');
                const bellLabel = document.getElementById('notif-confidence-label');
                const bellDetails = document.getElementById('notif-config-details');
                if (bellToggle) bellToggle.checked = enabled;
                if (bellSlider) bellSlider.value = clampSignalConfidenceThreshold(conf);
                if (bellLabel) bellLabel.textContent = clampSignalConfidenceThreshold(conf) + '%';
                if (bellDetails) bellDetails.style.display = enabled ? 'block' : 'none';
                updateBellIcon(enabled);
            } catch(e) { /* bell panel may not be in DOM */ }
        }

        // ═══════════════════════════════════════
        // SIGNAL SETTINGS — HOME Panel (Per-Crypto)
        // ═══════════════════════════════════════
        const SS_STORAGE_KEY = 'vc_signal_prefs';

        function getSignalPrefs() {
            try {
                const p = JSON.parse(localStorage.getItem(SS_STORAGE_KEY)) || { masterEnabled: false, globalConfidence: SIGNAL_MIN_CONFIDENCE, cryptos: {} };
                if (p.globalConfidence < SIGNAL_MIN_CONFIDENCE) p.globalConfidence = SIGNAL_MIN_CONFIDENCE;
                return p;
            } catch { return { masterEnabled: false, globalConfidence: SIGNAL_MIN_CONFIDENCE, cryptos: {} }; }
        }

        function saveSignalPrefs(prefs) {
            try { localStorage.setItem(SS_STORAGE_KEY, JSON.stringify(prefs)); } catch {}
            try { syncRemoteNotificationPrefs(prefs).catch(() => {}); } catch {}
        }

        const _rangeGestureState = new WeakMap();
        function initConfidenceSliderGuards() {
            if (window._vcConfidenceGuardsInit) return;
            window._vcConfidenceGuardsInit = true;

            const isGuardedSlider = (el) => {
                if (!el || el.tagName !== 'INPUT' || el.type !== 'range') return false;
                return el.classList.contains('signal-conf-slider') ||
                    !!el.closest('#dash-signal-settings-card') ||
                    !!el.closest('#signal-settings-body') ||
                    el.id === 'ss-global-slider' ||
                    el.id === 'dash-global-slider' ||
                    el.id === 'notif-confidence-slider';
            };

            const getPoint = (evt) => {
                const t = evt.touches && evt.touches[0] ? evt.touches[0] : evt;
                return { x: t.clientX || 0, y: t.clientY || 0 };
            };

            const onStart = (evt) => {
                const el = evt.target;
                if (!isGuardedSlider(el)) return;
                const p = getPoint(evt);
                _rangeGestureState.set(el, {
                    startX: p.x,
                    startY: p.y,
                    startValue: el.value,
                    horizontalIntent: false,
                    verticalIntent: false
                });
            };

            const onMove = (evt) => {
                const el = evt.target;
                if (!isGuardedSlider(el)) return;
                const st = _rangeGestureState.get(el);
                if (!st) return;

                const p = getPoint(evt);
                const dx = Math.abs(p.x - st.startX);
                const dy = Math.abs(p.y - st.startY);

                if (!st.horizontalIntent && !st.verticalIntent) {
                    if (dx >= dy + 8) st.horizontalIntent = true;
                    else if (dy >= dx + 8) st.verticalIntent = true;
                }

                if (st.verticalIntent && !st.horizontalIntent) {
                    if (el.value !== st.startValue) {
                        el.value = st.startValue;
                        try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {}
                    }
                }
            };

            const onEnd = (evt) => {
                const el = evt.target;
                if (!isGuardedSlider(el)) return;
                const st = _rangeGestureState.get(el);
                if (!st) return;

                if (st.verticalIntent && !st.horizontalIntent) {
                    if (el.value !== st.startValue) {
                        el.value = st.startValue;
                        try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {}
                    }
                }
                _rangeGestureState.delete(el);
            };

            const onChangeCapture = (evt) => {
                const el = evt.target;
                if (!isGuardedSlider(el)) return;
                const st = _rangeGestureState.get(el);
                if (!st) return;
                if (st.verticalIntent && !st.horizontalIntent) {
                    el.value = st.startValue;
                    evt.stopPropagation();
                }
            };

            document.addEventListener('pointerdown', onStart, { passive: true });
            document.addEventListener('pointermove', onMove, { passive: true });
            document.addEventListener('pointerup', onEnd, { passive: true });
            document.addEventListener('touchstart', onStart, { passive: true });
            document.addEventListener('touchmove', onMove, { passive: true });
            document.addEventListener('touchend', onEnd, { passive: true });
            document.addEventListener('change', onChangeCapture, true);
        }

        function _enableAllCryptoSignals(prefs) {
            if (typeof CRYPTO_DATABASE === 'undefined') return;
            Object.keys(CRYPTO_DATABASE).forEach(symbol => {
                if (!prefs.cryptos[symbol]) prefs.cryptos[symbol] = {};
                prefs.cryptos[symbol].enabled = true;
                if (!prefs.cryptos[symbol].confidence) {
                    prefs.cryptos[symbol].confidence = clampSignalConfidenceThreshold(prefs.globalConfidence);
                }
            });
        }

        // Sync ALL per-crypto configs from vc_signal_prefs to V4 engine
        // This ensures disabled cryptos are explicitly disabled in V4 (not inheriting global enabled: true)
        function _syncAllCryptosToV4(prefs) {
            if (!window.TAEngineV4 || typeof CRYPTO_DATABASE === 'undefined') return;
            Object.keys(CRYPTO_DATABASE).forEach(symbol => {
                const cp = prefs.cryptos[symbol] || {};
                const enabled = cp.enabled === true;
                const confidence = clampSignalConfidenceThreshold(cp.confidence || prefs.globalConfidence);
                window.TAEngineV4.setNotificationConfig(symbol, {
                    enabled: enabled,
                    confidenceThreshold: confidence
                });
            });
        }

        function toggleSignalSettingsPanel() {
            const body = document.getElementById('signal-settings-body');
            const chevron = document.getElementById('signal-settings-chevron');
            if (!body) return;
            const isOpen = body.getAttribute('data-open') === '1';
            if (isOpen) {
                body.style.maxHeight = '0';
                body.style.padding = '0 16px';
                body.setAttribute('data-open', '0');
            } else {
                loadSignalSettings();
                body.style.padding = '0 16px 16px 16px';
                body.style.maxHeight = body.scrollHeight + 500 + 'px';
                body.setAttribute('data-open', '1');
            }
            if (chevron) chevron.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
        }

        function loadSignalSettings() {
            const prefs = getSignalPrefs();
            const masterToggle = document.getElementById('ss-master-toggle');
            const masterTrack = document.getElementById('ss-master-track');
            const masterThumb = document.getElementById('ss-master-thumb');
            const globalConf = document.getElementById('ss-global-conf');
            const cryptoList = document.getElementById('ss-crypto-list');
            const slider = document.getElementById('ss-global-slider');

            if (masterToggle) masterToggle.checked = prefs.masterEnabled;
            if (masterTrack) { masterTrack.style.background = prefs.masterEnabled ? '#6366f1' : '#2a2a3a'; masterTrack.style.border = '1px solid ' + (prefs.masterEnabled ? '#6366f1' : '#666'); }
            if (masterThumb) masterThumb.style.transform = prefs.masterEnabled ? 'translateX(22px)' : 'translateX(0)';
            if (globalConf) globalConf.style.display = prefs.masterEnabled ? 'block' : 'none';
            if (cryptoList) cryptoList.style.display = prefs.masterEnabled ? 'block' : 'none';
            if (slider) {
                slider.value = clampSignalConfidenceThreshold(prefs.globalConfidence);
                updateSSGlobalLabel(slider.value);
            }

            renderCryptoItems(prefs);
            updateSignalSettingsSummary(prefs);

            // Update max-height after rendering content
            const body = document.getElementById('signal-settings-body');
            if (body && body.getAttribute('data-open') === '1') {
                requestAnimationFrame(() => { body.style.maxHeight = body.scrollHeight + 500 + 'px'; });
            }

            // Sync global config to V4 engine
            if (window.TAEngineV4) {
                window.TAEngineV4.setNotificationConfig(null, {
                    enabled: prefs.masterEnabled,
                    confidenceThreshold: clampSignalConfidenceThreshold(prefs.globalConfidence),
                    conditions: { setupConfirmed: true, minConfidence: true, regimeChange: false }
                });
                // Sync ALL per-crypto configs to V4 engine (ensure disabled cryptos are explicitly disabled)
                _syncAllCryptosToV4(prefs);
            }
        }

        function handleMasterSignalToggle(checked) {
            const prefs = getSignalPrefs();
            prefs.masterEnabled = checked;

            // Ao ativar monitoramento, liga todas as criptos nas configurações abaixo.
            if (checked) {
                _enableAllCryptoSignals(prefs);
            }
            saveSignalPrefs(prefs);

            const masterTrack = document.getElementById('ss-master-track');
            const masterThumb = document.getElementById('ss-master-thumb');
            const globalConf = document.getElementById('ss-global-conf');
            const cryptoList = document.getElementById('ss-crypto-list');

            if (masterTrack) { masterTrack.style.background = checked ? '#6366f1' : '#2a2a3a'; masterTrack.style.border = '1px solid ' + (checked ? '#6366f1' : '#666'); }
            if (masterThumb) masterThumb.style.transform = checked ? 'translateX(22px)' : 'translateX(0)';
            if (globalConf) globalConf.style.display = checked ? 'block' : 'none';
            if (cryptoList) cryptoList.style.display = checked ? 'block' : 'none';

            updateSignalSettingsSummary(prefs);
            renderCryptoItems(prefs);

            // Smoothly update max-height when toggling master (no teleport)
            const body = document.getElementById('signal-settings-body');
            if (body && body.getAttribute('data-open') === '1') {
                requestAnimationFrame(() => { body.style.maxHeight = body.scrollHeight + 500 + 'px'; });
            }

            // Sync to V4 engine
            if (window.TAEngineV4) {
                window.TAEngineV4.setNotificationConfig(null, {
                    enabled: checked,
                    confidenceThreshold: clampSignalConfidenceThreshold(prefs.globalConfidence),
                    conditions: { setupConfirmed: true, minConfidence: true, regimeChange: false }
                });
                // Sync all per-crypto to V4
                if (typeof CRYPTO_DATABASE !== 'undefined') {
                    Object.keys(CRYPTO_DATABASE).forEach(symbol => {
                        const cp = prefs.cryptos[symbol] || {};
                        window.TAEngineV4.setNotificationConfig(symbol, {
                            enabled: cp.enabled === true,
                            confidenceThreshold: clampSignalConfidenceThreshold(cp.confidence || prefs.globalConfidence)
                        });
                    });
                }
            }
        }

        function updateSSGlobalLabel(val) {
            const label = document.getElementById('ss-global-label');
            if (label) label.textContent = val + '%';
        }

        function renderCryptoItems(prefs) {
            const container = document.getElementById('ss-crypto-items');
            if (!container || typeof CRYPTO_DATABASE === 'undefined') return;

            let html = '';
            Object.entries(CRYPTO_DATABASE).forEach(([symbol, data]) => {
                const cp = prefs.cryptos[symbol] || {};
                const enabled = cp.enabled === true;
                const confidence = clampSignalConfidenceThreshold(cp.confidence || prefs.globalConfidence);

                html += `
                <div style="display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: var(--bg-tertiary); border-radius: 10px; border: 1px solid ${enabled ? 'rgba(99,102,241,0.2)' : 'transparent'};">
                    <img src="${data.img}" style="width: 28px; height: 28px; border-radius: 50%;" onerror="this.style.display='none'">
                    <div style="flex: 1; min-width: 0;">
                        <div style="display: flex; align-items: center; justify-content: space-between;">
                            <div style="font-size: 12px; font-weight: 700; color: var(--text-primary);">${data.short}</div>
                            <label style="position: relative; width: 40px; height: 22px; cursor: pointer; flex-shrink: 0;">
                                <input type="checkbox" ${enabled ? 'checked' : ''} onchange="toggleCryptoSignal('${symbol}', this.checked)" style="display: none;">
                                <div style="width: 40px; height: 22px; background: ${enabled ? '#6366f1' : '#2a2a3e'}; border-radius: 11px; transition: background 0.3s; border: 1px solid ${enabled ? '#6366f1' : '#666688'};"></div>
                                <div style="position: absolute; top: 2px; left: ${enabled ? '20px' : '2px'}; width: 18px; height: 18px; background: ${enabled ? '#fff' : '#888'}; border-radius: 50%; transition: left 0.3s; box-shadow: 0 1px 3px rgba(0,0,0,0.3);"></div>
                            </label>
                        </div>
                        <div style="display: flex; align-items: center; gap: 6px; margin-top: 4px; ${enabled ? '' : 'opacity: 0.4; pointer-events: none;'}">
                            <span style="font-size: 9px; color: var(--text-muted); white-space: nowrap;">Mín:</span>
                            <input type="range" class="signal-conf-slider" min="${SIGNAL_MIN_CONFIDENCE}" max="100" value="${confidence}" step="1"
                                   oninput="this.nextElementSibling.textContent=this.value+'%'" 
                                   onchange="setCryptoConfidence('${symbol}', parseInt(this.value))"
                                   style="flex: 1; height: 4px; accent-color: #6366f1;">
                            <span style="font-size: 11px; font-weight: 700; color: #6366f1; min-width: 30px; text-align: right;">${confidence}%</span>
                        </div>
                    </div>
                </div>`;
            });

            container.innerHTML = html;
        }

        function toggleCryptoSignal(symbol, enabled) {
            const prefs = getSignalPrefs();
            if (!prefs.cryptos[symbol]) prefs.cryptos[symbol] = {};
            prefs.cryptos[symbol].enabled = enabled;
            saveSignalPrefs(prefs);
            renderCryptoItems(prefs);
            updateSignalSettingsSummary(prefs);

            // Sync per-crypto to V4 engine
            if (window.TAEngineV4) {
                window.TAEngineV4.setNotificationConfig(symbol, {
                    enabled: enabled,
                    confidenceThreshold: clampSignalConfidenceThreshold(prefs.cryptos[symbol].confidence || prefs.globalConfidence)
                });
            }

            if (prefs.masterEnabled) startBackgroundService();
        }

        function setCryptoConfidence(symbol, confidence) {
            confidence = clampSignalConfidenceThreshold(confidence);
            const prefs = getSignalPrefs();
            if (!prefs.cryptos[symbol]) prefs.cryptos[symbol] = {};
            prefs.cryptos[symbol].confidence = confidence;
            saveSignalPrefs(prefs);

            // Sync per-crypto to V4 engine
            if (window.TAEngineV4) {
                window.TAEngineV4.setNotificationConfig(symbol, {
                    enabled: prefs.cryptos[symbol].enabled === true,
                    confidenceThreshold: confidence
                });
            }

            if (prefs.masterEnabled) startBackgroundService();
        }

        function saveSignalSettings() {
            const prefs = getSignalPrefs();
            const slider = document.getElementById('ss-global-slider');
            if (slider) {
                const newGlobal = clampSignalConfidenceThreshold(parseInt(slider.value));
                prefs.globalConfidence = newGlobal;
                // Regra solicitada: alteração global sempre força todas as criptos.
                Object.entries(CRYPTO_DATABASE).forEach(([symbol]) => {
                    if (!prefs.cryptos[symbol]) prefs.cryptos[symbol] = {};
                    prefs.cryptos[symbol].confidence = newGlobal;
                    if (window.TAEngineV4) {
                        window.TAEngineV4.setNotificationConfig(symbol, {
                            enabled: prefs.cryptos[symbol]?.enabled === true,
                            confidenceThreshold: newGlobal
                        });
                    }
                });
                saveSignalPrefs(prefs);
                // Re-render crypto items to reflect updated slider values
                renderCryptoItems(prefs);
                // Sync global to V4
                if (window.TAEngineV4) {
                    window.TAEngineV4.setNotificationConfig(null, {
                        enabled: prefs.masterEnabled,
                        confidenceThreshold: prefs.globalConfidence,
                        conditions: { setupConfirmed: true, minConfidence: true, regimeChange: false }
                    });
                }

                if (prefs.masterEnabled) startBackgroundService();
            }
            updateSignalSettingsSummary(prefs);
        }

        function updateSignalSettingsSummary(prefs) {
            const summary = document.getElementById('signal-settings-summary');
            if (!summary) return;
            if (!prefs.masterEnabled) {
                summary.textContent = 'Alertas desativados';
                summary.style.color = 'var(--text-muted)';
                return;
            }
            const total = Object.keys(CRYPTO_DATABASE || {}).length;
            let enabled = 0;
            Object.keys(CRYPTO_DATABASE || {}).forEach(sym => {
                if (prefs.cryptos[sym]?.enabled === true) enabled++;
            });
            summary.textContent = `${enabled}/${total} ativos · Mín ${clampSignalConfidenceThreshold(prefs.globalConfidence)}%`;
            summary.style.color = '#6366f1';
        }

        function isCryptoNotificationEnabled(symbol) {
            const prefs = getSignalPrefs();
            if (!prefs.masterEnabled) return false;
            // Default is DISABLED — must be explicitly enabled
            if (prefs.cryptos[symbol]?.enabled !== true) return false;
            return true;
        }

        function getCryptoMinConfidence(symbol) {
            const prefs = getSignalPrefs();
            if (prefs.cryptos[symbol]?.confidence) return clampSignalConfidenceThreshold(prefs.cryptos[symbol].confidence);
            return clampSignalConfidenceThreshold(prefs.globalConfidence);
        }

        // Initialize signal settings summary on load
        function initSignalSettingsSummary() {
            const prefs = getSignalPrefs();
            updateSignalSettingsSummary(prefs);
        }

        // ═══════════════════════════════════════
        // AUTO-SCAN + LOCAL NOTIFICATIONS + BACKGROUND SERVICE
        // ═══════════════════════════════════════
        const SCAN_INTERVAL_MS = 5 * 60 * 1000; // 5 minutos
        const SCAN_LAST_RESULTS_KEY = 'vc_scan_last_results';
        const SCAN_DEDUP_MS = 30 * 60 * 1000; // 30 min cooldown por cripto
        const ACTIVE_SIGNAL_VALIDITY_MS = SCAN_DEDUP_MS;
        const SIGNAL_ALERT_CHANNEL_ID = 'visor_signals_v2';
        const SIGNALS_REMOTE_SNAPSHOT_KEY = 'vc_signals_remote_snapshot_v1';
        const SIGNALS_REMOTE_SNAPSHOT_TTL = 5 * 60 * 1000;
        const SIGNALS_PUSH_TOKEN_KEY = 'vc_fcm_push_token_v1';
        const SIGNALS_PUSH_REGISTERED_AT_KEY = 'vc_fcm_push_registered_at_v1';
        const SIGNAL_ANALYSIS_SNAPSHOT_KEY = 'vc_signal_analysis_snapshots_v1';
        const SIGNAL_ANALYSIS_SNAPSHOT_MAX_ITEMS = 40;
        const SIGNAL_ANALYSIS_SNAPSHOT_KEEP_ANALYSIS = 16;
        let autoScanTimer = null;
        let autoScanBootTimeout = null;
        let isScanning = false;
        let _signalSnapshotFetchPromise = null;
        let _remotePushRegistrationPromise = null;
        let _lastRemotePrefsHash = localStorage.getItem('vc_remote_prefs_hash_v1') || '';
        let _lastRemotePrefsSyncAt = Number(localStorage.getItem('vc_remote_prefs_synced_at_v1') || 0) || 0;
        const _localNotificationCleanupTimers = Object.create(null);

        function _buildSignalSnapshotId(symbol, direction, notifiedAt) {
            const ts = Math.max(0, Number(notifiedAt || Date.now()) || Date.now());
            const bucket = Math.floor(ts / SCAN_DEDUP_MS);
            return `${_normalizeScanSymbol(symbol)}_${_normalizeSignalDirection(direction)}_${bucket}`;
        }

        function _readSignalSnapshotStore(now = Date.now()) {
            let store = { version: 1, items: {}, latestBySymbol: {} };
            try {
                const raw = localStorage.getItem(SIGNAL_ANALYSIS_SNAPSHOT_KEY);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (parsed && typeof parsed === 'object') {
                        store.items = parsed.items && typeof parsed.items === 'object' ? parsed.items : {};
                        store.latestBySymbol = parsed.latestBySymbol && typeof parsed.latestBySymbol === 'object' ? parsed.latestBySymbol : {};
                    }
                }
            } catch (_) {}

            Object.entries(store.items).forEach(([id, item]) => {
                if (!item || Number(item.expiresAt || 0) <= now) {
                    delete store.items[id];
                }
            });
            Object.entries(store.latestBySymbol).forEach(([symbol, id]) => {
                if (!store.items[id]) delete store.latestBySymbol[symbol];
            });
            return store;
        }

        function _writeSignalSnapshotStore(store) {
            const items = Object.values(store.items || {})
                .sort((a, b) => Number(b.createdAt || b.notifiedAt || 0) - Number(a.createdAt || a.notifiedAt || 0));
            let limitedItems = items.slice(0, SIGNAL_ANALYSIS_SNAPSHOT_MAX_ITEMS);

            const buildPayload = (entries, keepAnalysisCount) => {
                const trimmedItems = {};
                const latestBySymbol = {};
                entries.forEach((item, idx) => {
                    if (!item || !item.id) return;
                    const copy = { ...item };
                    if (idx >= keepAnalysisCount && copy.analysisSnapshot) {
                        delete copy.analysisSnapshot;
                    }
                    trimmedItems[copy.id] = copy;
                    const symbol = _normalizeScanSymbol(copy.symbol);
                    if (symbol && !latestBySymbol[symbol]) latestBySymbol[symbol] = copy.id;
                });
                return {
                    version: 1,
                    items: trimmedItems,
                    latestBySymbol,
                    savedAt: Date.now()
                };
            };

            const keepCount = Math.min(SIGNAL_ANALYSIS_SNAPSHOT_KEEP_ANALYSIS, limitedItems.length);
            const attempts = [
                { keep: keepCount, limit: limitedItems.length },
                { keep: 0, limit: limitedItems.length },
                { keep: 0, limit: Math.min(10, limitedItems.length) }
            ];

            for (const attempt of attempts) {
                try {
                    const payload = buildPayload(limitedItems.slice(0, attempt.limit), attempt.keep);
                    localStorage.setItem(SIGNAL_ANALYSIS_SNAPSHOT_KEY, JSON.stringify(payload));
                    return;
                } catch (_) {}
            }
        }

        function _cloneAnalysisForSignalSnapshot(analysis, direction, confidence, notifiedAt) {
            if (!analysis) return null;
            try {
                const clone = JSON.parse(JSON.stringify(analysis));
                const normalizedDirection = _normalizeSignalDirection(direction);
                const signalType = normalizedDirection === 'LONG' ? 'long' : normalizedDirection === 'SHORT' ? 'short' : 'aguardar';
                clone._snapshotFrozen = true;
                clone._snapshotNotifiedAt = notifiedAt;
                clone._finalSignal = normalizedDirection;
                clone._finalDirection = normalizedDirection;
                clone._finalSignalType = signalType;
                clone._finalConfidence = confidence;
                clone.signal = normalizedDirection;
                clone.signalType = signalType;
                clone.confidence = confidence;
                if (clone.confidencePoints && typeof clone.confidencePoints === 'object') {
                    clone.confidencePoints.finalConfidence = confidence;
                    clone.confidencePoints.confidence = confidence;
                    clone.confidencePoints.dominantDirection = normalizedDirection;
                }
                return clone;
            } catch (_) {
                return null;
            }
        }

        function cacheSignalAnalysisSnapshot(symbol, options = {}) {
            try {
                const normalizedSymbol = _normalizeScanSymbol(symbol);
                const direction = _normalizeSignalDirection(options.direction || options.signal || '');
                const confidence = Math.max(0, Math.min(100, Math.round(Number(options.confidence || 0) || 0)));
                if (!normalizedSymbol || direction === 'NEUTRO' || confidence <= 0) return null;

                const notifiedAt = Math.max(0, Number(options.notifiedAt || options.time || options.timestamp || Date.now()) || Date.now());
                const id = String(options.snapshotId || _buildSignalSnapshotId(normalizedSymbol, direction, notifiedAt));
                const store = _readSignalSnapshotStore();
                const existingSnapshot = store.items[id] || null;
                const expiresAt = Math.max(
                    Number(options.expiresAt || 0) || 0,
                    Number(existingSnapshot?.expiresAt || 0) || 0,
                    notifiedAt + ACTIVE_SIGNAL_VALIDITY_MS
                );
                const analysisSnapshot = _cloneAnalysisForSignalSnapshot(options.analysis || options.analysisSnapshot, direction, confidence, notifiedAt)
                    || existingSnapshot?.analysisSnapshot
                    || null;
                const snapshot = {
                    ...(existingSnapshot || {}),
                    id,
                    snapshotId: id,
                    symbol: normalizedSymbol,
                    direction,
                    finalDirection: direction,
                    confidence,
                    finalConfidence: confidence,
                    price: Number(options.price || options.entryPrice || existingSnapshot?.price || 0) || 0,
                    reason: String(options.reason || existingSnapshot?.reason || '').trim(),
                    gates: String(options.gates || existingSnapshot?.gates || ''),
                    minConfidence: clampSignalConfidenceThreshold(options.minConfidence || getCryptoMinConfidence(normalizedSymbol)),
                    notifiedAt,
                    expiresAt,
                    createdAt: Number(existingSnapshot?.createdAt || 0) || Date.now(),
                    updatedAt: Date.now(),
                    source: String(options.source || 'signal_snapshot'),
                    analysisSnapshot
                };

                store.items[id] = snapshot;
                store.latestBySymbol[normalizedSymbol] = id;
                _writeSignalSnapshotStore(store);
                return snapshot;
            } catch (_) {
                return null;
            }
        }

        function getActiveSignalAnalysisSnapshot(symbol, candidate = {}) {
            const normalizedSymbol = _normalizeScanSymbol(symbol);
            if (!normalizedSymbol) return null;
            const now = Date.now();
            const store = _readSignalSnapshotStore(now);
            const ids = [
                candidate.snapshotId,
                candidate.id,
                _buildSignalSnapshotId(normalizedSymbol, candidate.direction || candidate.signal, candidate.notifiedAt || candidate.lastNotifiedAt || candidate._eventTs),
                store.latestBySymbol[normalizedSymbol]
            ].filter(Boolean).map(String);

            for (const id of ids) {
                const item = store.items[id];
                if (!item || Number(item.expiresAt || 0) <= now) continue;
                if (_normalizeScanSymbol(item.symbol) !== normalizedSymbol) continue;
                return item;
            }

            let notifiedAt = Number(candidate.notifiedAt || candidate.lastNotifiedAt || candidate._eventTs || 0) || 0;
            const direction = _normalizeSignalDirection(candidate.lastNotifiedDirection || candidate.direction || candidate.signal);
            const confidence = Math.max(0, Math.min(100, Math.round(Number(candidate.lastNotifiedConfidence || candidate.confidence || 0) || 0)));
            const candidateExpiresAt = Number(candidate.expiresAt || 0) || 0;
            if (!notifiedAt && candidateExpiresAt > now) {
                notifiedAt = Math.max(0, candidateExpiresAt - ACTIVE_SIGNAL_VALIDITY_MS);
            }
            if (notifiedAt > 0 && (now - notifiedAt) < ACTIVE_SIGNAL_VALIDITY_MS && direction !== 'NEUTRO' && confidence > 0) {
                return cacheSignalAnalysisSnapshot(normalizedSymbol, {
                    direction,
                    confidence,
                    price: candidate.lastNotifiedPrice || candidate.price || candidate.currentPrice || 0,
                    reason: candidate.lastNotifiedReason || candidate.reason || 'Snapshot do sinal ativo',
                    notifiedAt,
                    expiresAt: candidateExpiresAt || 0,
                    source: candidate.source || 'active_signal_fallback'
                });
            }
            _writeSignalSnapshotStore(store);
            return null;
        }

        let _lastSignalSnapshotPruneAt = 0;
        function pruneSignalAnalysisSnapshots(now = Date.now()) {
            if ((now - _lastSignalSnapshotPruneAt) < 60000) return;
            _lastSignalSnapshotPruneAt = now;
            const store = _readSignalSnapshotStore(now);
            _writeSignalSnapshotStore(store);
        }

        function renderSignalSnapshotAnalysis(snapshot, crypto) {
            const modal = document.getElementById('ta-modal');
            const body = document.getElementById('ta-modal-body');
            if (!modal || !body || !snapshot) return false;
            try { if (typeof stopTAAutoRefresh === 'function') stopTAAutoRefresh(); } catch (_) {}
            try { if (window.RealtimeCVD?.disconnect) window.RealtimeCVD.disconnect(); } catch (_) {}
            try { taCurrentSymbol = snapshot.symbol; } catch (_) {}

            const titleEl = document.querySelector('.ta-modal-header-title');
            if (titleEl) titleEl.textContent = `Analise do Sinal - ${(crypto && crypto.name) || snapshot.symbol}`;
            modal.classList.remove('closing');
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';

            if (snapshot.analysisSnapshot && typeof renderTechnicalAnalysis === 'function') {
                renderTechnicalAnalysis(snapshot.analysisSnapshot, crypto || {});
                const banner = document.createElement('div');
                banner.style.cssText = 'margin:0 0 12px 0;padding:10px 12px;border-radius:10px;background:rgba(99,102,241,0.12);border:1px solid rgba(99,102,241,0.25);color:var(--text-secondary);font-size:11px;line-height:1.35;';
                banner.innerHTML = `<strong style="color:var(--text-primary);">Snapshot do sinal</strong> · ${snapshot.finalDirection} ${snapshot.finalConfidence}% · valido ate ${new Date(snapshot.expiresAt).toLocaleTimeString(window.VisorI18n?.getLocale?.() || 'en-US', { hour: '2-digit', minute: '2-digit' })}`;
                body.prepend(banner);
                return true;
            }

            const isLong = snapshot.finalDirection === 'LONG';
            const color = isLong ? '#22c55e' : '#ef4444';
            const price = Number(snapshot.price || 0);
            const priceStr = price > 0 ? (price >= 1 ? '$' + price.toLocaleString(undefined, { maximumFractionDigits: 4 }) : '$' + price.toFixed(8)) : '--';
            body.innerHTML = `
                <div class="ta-section" style="border:1px solid ${isLong ? 'rgba(34,197,94,0.28)' : 'rgba(239,68,68,0.28)'};">
                    <div class="ta-section-header">
                        <div class="ta-section-icon" style="background:${isLong ? 'rgba(34,197,94,0.14)' : 'rgba(239,68,68,0.14)'};">
                            <i class="fas ${isLong ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'}" style="color:${color};"></i>
                        </div>
                        <div>
                            <div class="ta-section-title">Snapshot do Sinal</div>
                            <div class="ta-section-subtitle">Retrato congelado do alerta por 30 minutos</div>
                        </div>
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px;">
                        <div style="padding:12px;border-radius:10px;background:rgba(255,255,255,0.04);">
                            <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;font-weight:700;">Direcao</div>
                            <div style="font-size:20px;font-weight:900;color:${color};">${snapshot.finalDirection}</div>
                        </div>
                        <div style="padding:12px;border-radius:10px;background:rgba(255,255,255,0.04);">
                            <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;font-weight:700;">Confianca</div>
                            <div style="font-size:20px;font-weight:900;color:var(--text-primary);">${snapshot.finalConfidence}%</div>
                        </div>
                        <div style="padding:12px;border-radius:10px;background:rgba(255,255,255,0.04);">
                            <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;font-weight:700;">Entrada</div>
                            <div style="font-size:16px;font-weight:800;color:var(--text-primary);">${priceStr}</div>
                        </div>
                        <div style="padding:12px;border-radius:10px;background:rgba(255,255,255,0.04);">
                            <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;font-weight:700;">Validade</div>
                            <div style="font-size:16px;font-weight:800;color:var(--text-primary);">${new Date(snapshot.expiresAt).toLocaleTimeString(window.VisorI18n?.getLocale?.() || 'en-US', { hour: '2-digit', minute: '2-digit' })}</div>
                        </div>
                    </div>
                    ${snapshot.reason ? `<div style="margin-top:12px;padding:12px;border-radius:10px;background:rgba(255,255,255,0.04);font-size:12px;color:var(--text-secondary);line-height:1.45;">${String(snapshot.reason).replace(/</g, '&lt;')}</div>` : ''}
                </div>`;
            return true;
        }

        function _scheduleLocalNotificationCleanup(notificationId, ttlMs = SCAN_DEDUP_MS) {
            try {
                const idNum = Number(notificationId || 0);
                if (!Number.isFinite(idNum) || idNum <= 0) return;

                if (_localNotificationCleanupTimers[idNum]) {
                    clearTimeout(_localNotificationCleanupTimers[idNum]);
                    delete _localNotificationCleanupTimers[idNum];
                }

                _localNotificationCleanupTimers[idNum] = setTimeout(async () => {
                    try {
                        const local = window?.Capacitor?.Plugins?.LocalNotifications;
                        if (!local) return;

                        try {
                            if (typeof local.removeDeliveredNotifications === 'function') {
                                await local.removeDeliveredNotifications({ notifications: [{ id: idNum }] });
                            }
                        } catch (_) {}

                        try {
                            if (typeof local.cancel === 'function') {
                                await local.cancel({ notifications: [{ id: idNum }] });
                            }
                        } catch (_) {}
                    } finally {
                        delete _localNotificationCleanupTimers[idNum];
                    }
                }, Math.max(1000, Number(ttlMs || SCAN_DEDUP_MS) || SCAN_DEDUP_MS));
            } catch (_) {}
        }

        async function initLocalNotifications() {
            try {
                if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications) {
                    const { LocalNotifications } = window.Capacitor.Plugins;
                    // Request permission
                    const perm = await LocalNotifications.requestPermissions();
                    // Create notification channel for Android
                    try {
                        await LocalNotifications.createChannel({
                            id: SIGNAL_ALERT_CHANNEL_ID,
                            name: 'Sinais de Trading',
                            description: 'Alertas de sinais LONG/SHORT confirmados',
                            importance: 5,
                            visibility: 1,
                            vibration: true,
                            sound: 'default'
                        });
                    } catch (chErr) { /* console.warn('Channel creation:', chErr); */ }
                    return true;
                }
            } catch (e) { /* console.warn('Local notifications init:', e); */ }
            return false;
        }

        async function fireLocalNotification(title, body, id) {
            try {
                // Do not show local notifications while the app is in foreground.
                if (typeof document !== 'undefined' && document.hidden === false) {
                    return;
                }
                if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications) {
                    const { LocalNotifications } = window.Capacitor.Plugins;
                    const notificationId = id || Math.floor(Math.random() * 100000);
                    await LocalNotifications.schedule({
                        notifications: [{
                            id: notificationId,
                            title: title,
                            body: body,
                            channelId: SIGNAL_ALERT_CHANNEL_ID,
                            schedule: { at: new Date(Date.now() + 500) },
                            sound: 'default',
                            smallIcon: 'ic_launcher',
                            largeIcon: 'ic_launcher'
                        }]
                    });
                    _scheduleLocalNotificationCleanup(notificationId, SCAN_DEDUP_MS);
                }
            } catch (e) { /* console.warn('Notification fire error:', e); */ }
        }

        function buildNativeSymbolsConfig(prefs) {
            const config = {};
            const cryptos = (typeof CRYPTO_DATABASE !== 'undefined') ? CRYPTO_DATABASE : {};
            Object.keys(cryptos).forEach((symbol) => {
                const cp = prefs?.cryptos?.[symbol] || {};
                config[symbol] = {
                    enabled: cp.enabled === true,
                    minConfidence: clampSignalConfidenceThreshold(cp.confidence || prefs?.globalConfidence)
                };
            });
            return config;
        }

        function buildRemoteNotificationPrefs(prefs = getSignalPrefs()) {
            const enabledSymbols = [];
            const cryptos = (typeof CRYPTO_DATABASE !== 'undefined') ? CRYPTO_DATABASE : {};
            Object.keys(cryptos).forEach((symbol) => {
                if (prefs?.cryptos?.[symbol]?.enabled === true) enabledSymbols.push(symbol);
            });
            return {
                enabled: !!prefs.masterEnabled,
                confidenceThreshold: clampSignalConfidenceThreshold(prefs.globalConfidence),
                symbols: enabledSymbols,
                perSymbol: buildNativeSymbolsConfig(prefs)
            };
        }

        async function getWorkerAuthHeadersForSignals(forceRefresh = false, workerUrl = '') {
            if (!window.AuthClient || typeof window.AuthClient.getWriteAuthHeaders !== 'function') {
                return {};
            }
            return window.AuthClient.getWriteAuthHeaders({ forceRefresh, workerUrl, requireScope: 'signals:read' });
        }

        function getRemoteNotificationPrefsHash(prefs) {
            try {
                return JSON.stringify(buildRemoteNotificationPrefs(prefs || getSignalPrefs()));
            } catch (_) {
                return String(Date.now());
            }
        }

        async function syncRemoteNotificationPrefs(prefs = getSignalPrefs(), options = {}) {
            try {
                const workerUrl = await _resolveHealthyWorkerUrl();
                if (!workerUrl) return false;
                const prefsHash = getRemoteNotificationPrefsHash(prefs);
                if (!options.force && prefsHash === _lastRemotePrefsHash && (Date.now() - _lastRemotePrefsSyncAt) < (10 * 60 * 1000)) {
                    return true;
                }
                const headers = await getWorkerAuthHeadersForSignals(false, workerUrl);
                const resp = await fetch(`${workerUrl}/notifications/prefs`, {
                    method: 'POST',
                    headers: { ...headers, 'Content-Type': 'application/json' },
                    body: JSON.stringify(buildRemoteNotificationPrefs(prefs)),
                    signal: AbortSignal.timeout(6000)
                });
                if (resp.ok) {
                    _lastRemotePrefsHash = prefsHash;
                    _lastRemotePrefsSyncAt = Date.now();
                    try {
                        localStorage.setItem('vc_remote_prefs_hash_v1', _lastRemotePrefsHash);
                        localStorage.setItem('vc_remote_prefs_synced_at_v1', String(_lastRemotePrefsSyncAt));
                    } catch (_) {}
                }
                return resp.ok;
            } catch (_) {
                return false;
            }
        }

        async function registerRemotePushNotifications(force = false) {
            if (_remotePushRegistrationPromise) return _remotePushRegistrationPromise;
            _remotePushRegistrationPromise = (async () => {
                try {
                    const workerUrl = await _resolveHealthyWorkerUrl({ force });
                    const plugin = window?.Capacitor?.Plugins?.BackgroundScan;
                    if (!workerUrl || !plugin || typeof plugin.getPushToken !== 'function') return false;

                    const cachedToken = String(localStorage.getItem(SIGNALS_PUSH_TOKEN_KEY) || '');
                    const registeredAt = Number(localStorage.getItem(SIGNALS_PUSH_REGISTERED_AT_KEY) || 0) || 0;
                    if (!force && cachedToken && (Date.now() - registeredAt) < (12 * 60 * 60 * 1000)) {
                        syncRemoteNotificationPrefs().catch(() => {});
                        return true;
                    }

                    const tokenResult = await plugin.getPushToken();
                    const token = String(tokenResult?.token || '').trim();
                    if (!token) return false;

                    const headers = await getWorkerAuthHeadersForSignals(force, workerUrl);
                    const prefs = getSignalPrefs();
                    const resp = await fetch(`${workerUrl}/notifications/register-token`, {
                        method: 'POST',
                        headers: { ...headers, 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            token,
                            platform: 'android',
                            appVersion: window.TAEngineV4?.VERSION || 'app',
                            prefs: buildRemoteNotificationPrefs(prefs)
                        }),
                        signal: AbortSignal.timeout(8000)
                    });
                    if (!resp.ok) return false;

                    localStorage.setItem(SIGNALS_PUSH_TOKEN_KEY, token);
                    localStorage.setItem(SIGNALS_PUSH_REGISTERED_AT_KEY, String(Date.now()));
                    _lastRemotePrefsHash = getRemoteNotificationPrefsHash(prefs);
                    _lastRemotePrefsSyncAt = Date.now();
                    try {
                        localStorage.setItem('vc_remote_prefs_hash_v1', _lastRemotePrefsHash);
                        localStorage.setItem('vc_remote_prefs_synced_at_v1', String(_lastRemotePrefsSyncAt));
                    } catch (_) {}
                    return true;
                } catch (_) {
                    return false;
                } finally {
                    _remotePushRegistrationPromise = null;
                }
            })();
            return _remotePushRegistrationPromise;
        }

        async function unregisterRemotePushNotifications() {
            try {
                const workerUrl = await _resolveHealthyWorkerUrl();
                if (!workerUrl) return false;
                const headers = await getWorkerAuthHeadersForSignals(false, workerUrl);
                const resp = await fetch(`${workerUrl}/notifications/unregister-token`, {
                    method: 'POST',
                    headers: { ...headers, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: localStorage.getItem(SIGNALS_PUSH_TOKEN_KEY) || '' }),
                    signal: AbortSignal.timeout(6000)
                });
                if (resp.ok) {
                    localStorage.removeItem(SIGNALS_PUSH_TOKEN_KEY);
                    localStorage.removeItem(SIGNALS_PUSH_REGISTERED_AT_KEY);
                }
                return resp.ok;
            } catch (_) {
                return false;
            }
        }

        function isRemoteSignalSnapshotComplete(snapshot) {
            try {
                const results = snapshot && snapshot.results && typeof snapshot.results === 'object' ? snapshot.results : {};
                const expectedSymbols = Object.keys(typeof CRYPTO_DATABASE !== 'undefined' ? CRYPTO_DATABASE : {});
                if (expectedSymbols.length === 0) {
                    const expectedCount = Number(snapshot?.expectedSymbols || 0) || Object.keys(results).length;
                    return Object.keys(results).length >= expectedCount;
                }
                return expectedSymbols.every((symbol) => !!results[symbol]);
            } catch (_) {
                return false;
            }
        }

        function isRemoteSignalSnapshotUsable(snapshot) {
            try {
                if (!isRemoteSignalSnapshotComplete(snapshot)) return false;
                const results = snapshot && snapshot.results && typeof snapshot.results === 'object' ? snapshot.results : {};
                const keys = Object.keys(results);
                if (!keys.length) return false;
                const usable = keys.filter((symbol) => {
                    const item = results[symbol];
                    return item && item.status !== 'unavailable' && item.unavailable !== true && Number(item.finalConfidence || item.confidence || 0) > 0;
                }).length;
                return (usable / keys.length) >= 0.55;
            } catch (_) {
                return false;
            }
        }

        function mergeSignalSnapshot(snapshot) {
            try {
                const payload = snapshot && snapshot.results ? snapshot : null;
                if (!payload || typeof payload.results !== 'object') return false;
                const usableSnapshot = isRemoteSignalSnapshotUsable(payload);
                if (!usableSnapshot) {
                    const cached = (() => {
                        try { return JSON.parse(localStorage.getItem(SIGNALS_REMOTE_SNAPSHOT_KEY) || 'null'); } catch (_) { return null; }
                    })();
                    if (isRemoteSignalSnapshotUsable(cached)) return mergeSignalSnapshot({ ...cached, stale: true });
                    return false;
                }

                localStorage.setItem(SIGNALS_REMOTE_SNAPSHOT_KEY, JSON.stringify({
                    ...payload,
                    cachedAt: Date.now()
                }));

                const dashResults = _getDashTAResults();
                const scanResults = getScanLastResults();
                const updatedAt = Number(payload.updatedAt || Date.now()) || Date.now();
                const resultKeys = Object.keys(payload.results || {});
                const expectedSymbols = Math.max(
                    1,
                    Number(payload.expectedSymbols || 0) ||
                    Object.keys(typeof CRYPTO_DATABASE !== 'undefined' ? CRYPTO_DATABASE : {}).length ||
                    resultKeys.length
                );
                _lastRemoteSnapshotFetchedAt = Date.now();
                _lastRemoteSnapshotReturnedSymbols = resultKeys.length;
                _lastRemoteSnapshotComplete = resultKeys.length >= expectedSymbols && isRemoteSignalSnapshotComplete(payload);
                let changed = false;

                Object.entries(payload.results).forEach(([rawSymbol, item]) => {
                    const symbol = _normalizeScanSymbol(rawSymbol);
                    if (!symbol || !item || typeof item !== 'object') return;
                    const isUnavailable = item.status === 'unavailable' || item.unavailable === true;
                    const previous = dashResults[symbol] || scanResults[symbol] || {};
                    const prevScan = scanResults[symbol] || {};
                    if (isUnavailable && Number(previous.confidence || previous.finalConfidence || 0) > 0) return;
                    const confidence = isUnavailable ? 0 : Math.max(0, Math.min(100, Math.round(Number(item.finalConfidence || item.confidence || 0) || 0)));
                    const direction = !isUnavailable && confidence >= 50 ? _normalizeSignalDirection(item.finalDirection || item.direction || item.signal) : 'NEUTRO';
                    const price = isUnavailable ? 0 : (Number(item.price || item.currentPrice || 0) || 0);
                    const lastScanAt = Number(item.lastScanAt || item.timestamp || updatedAt) || updatedAt;
                    const reason = String(item.reason || item.source || (isUnavailable ? 'Dados indisponiveis' : 'Remote snapshot')).trim();
                    const notifiedAt = Number(item.notifiedAt || item.lastNotifiedAt || 0) || 0;
                    const notifiedDirection = _normalizeSignalDirection(item.lastNotifiedDirection || item.notifiedDirection || direction);
                    const notifiedConfidence = Math.max(0, Math.min(100, Math.round(Number(item.lastNotifiedConfidence || item.notifiedConfidence || confidence || 0) || 0)));
                    const notifiedPrice = Number(item.lastNotifiedPrice || item.notifiedPrice || price || 0) || 0;
                    const notifiedReason = String(item.lastNotifiedReason || item.notifiedReason || reason || '').trim();
                    const hasNotified = notifiedAt > 0 && notifiedDirection !== 'NEUTRO' && notifiedConfidence > 0;
                    const minConf = getCryptoMinConfidence(symbol);
                    const eligibleRemoteSignal = !isUnavailable && isCryptoNotificationEnabled(symbol) && direction !== 'NEUTRO' && confidence >= minConf;
                    const sourceEventAt = Math.max(0, Number(lastScanAt || updatedAt || Date.now()) || Date.now());
                    const sourceIsFresh = sourceEventAt > 0 && (Date.now() - sourceEventAt) <= ACTIVE_SIGNAL_VALIDITY_MS;
                    const prevNotifiedAt = Number(prevScan.lastNotifiedAt || prevScan.notifiedAt || previous.lastNotifiedAt || previous.notifiedAt || 0) || 0;
                    const dedupBlocked = prevNotifiedAt > 0 && (Date.now() - prevNotifiedAt) < SCAN_DEDUP_MS;
                    const shouldCreateLocalReceipt = !hasNotified && eligibleRemoteSignal && sourceIsFresh;
                    const effectiveNotifiedAt = hasNotified ? notifiedAt : (shouldCreateLocalReceipt ? (dedupBlocked ? prevNotifiedAt : sourceEventAt) : 0);
                    const effectiveDirection = hasNotified ? notifiedDirection : direction;
                    const effectiveConfidence = hasNotified ? notifiedConfidence : confidence;
                    const effectivePrice = hasNotified ? notifiedPrice : price;
                    const effectiveReason = hasNotified ? (notifiedReason || reason) : reason;
                    const hasActiveReceipt = effectiveNotifiedAt > 0 && effectiveDirection !== 'NEUTRO' && effectiveConfidence > 0;
                    const expiresAt = Number(item.expiresAt || 0) || (hasActiveReceipt ? (effectiveNotifiedAt + ACTIVE_SIGNAL_VALIDITY_MS) : 0);
                    const snapshot = (hasActiveReceipt && (Date.now() - effectiveNotifiedAt) <= ACTIVE_SIGNAL_VALIDITY_MS)
                        ? cacheSignalAnalysisSnapshot(symbol, {
                            snapshotId: item.snapshotId,
                            direction: effectiveDirection,
                            confidence: effectiveConfidence,
                            price: effectivePrice,
                            reason: effectiveReason || reason,
                            gates: item.gates || 'SNAPSHOT',
                            notifiedAt: effectiveNotifiedAt,
                            expiresAt,
                            source: 'remote_snapshot'
                        })
                        : null;
                    if (shouldCreateLocalReceipt && !dedupBlocked) {
                        dashRecordCall(symbol, direction, confidence, item.gates || 'SNAPSHOT', price, `${direction} ${confidence}% (min ${minConf}%) - Remote Snapshot`, {
                            snapshotId: snapshot?.id || item.snapshotId || '',
                            notifiedAt: effectiveNotifiedAt,
                            expiresAt: snapshot?.expiresAt || expiresAt || (effectiveNotifiedAt + ACTIVE_SIGNAL_VALIDITY_MS),
                            source: 'remote_snapshot'
                        });
                    }
                    const entry = {
                        ...(dashResults[symbol] || {}),
                        signal: direction,
                        direction,
                        finalDirection: direction,
                        confidence,
                        finalConfidence: confidence,
                        price,
                        currentPrice: price,
                        reason,
                        gates: String(item.gates || 'SNAPSHOT'),
                        lastScanAt,
                        snapshotId: snapshot?.id || item.snapshotId || dashResults[symbol]?.snapshotId || '',
                        notifiedAt: hasActiveReceipt ? effectiveNotifiedAt : (dashResults[symbol]?.notifiedAt || 0),
                        expiresAt: snapshot?.expiresAt || expiresAt || dashResults[symbol]?.expiresAt || 0,
                        source: 'remote_snapshot',
                        status: isUnavailable ? 'unavailable' : (item.status || 'ok'),
                        unavailable: isUnavailable
                    };
                    const before = JSON.stringify(dashResults[symbol] || {});
                    dashResults[symbol] = entry;
                    const shouldUpdateNotified = hasActiveReceipt && effectiveNotifiedAt >= prevNotifiedAt;
                    scanResults[symbol] = {
                        ...prevScan,
                        ...entry,
                        notifiedAt: shouldUpdateNotified ? effectiveNotifiedAt : (prevScan.notifiedAt || entry.notifiedAt || 0),
                        expiresAt: snapshot?.expiresAt || expiresAt || prevScan.expiresAt || entry.expiresAt || 0,
                        lastNotifiedAt: shouldUpdateNotified ? effectiveNotifiedAt : prevNotifiedAt,
                        lastNotifiedSignal: shouldUpdateNotified ? effectiveDirection : (prevScan.lastNotifiedSignal || prevScan.notifiedSignal || ''),
                        lastNotifiedDirection: shouldUpdateNotified ? effectiveDirection : (prevScan.lastNotifiedDirection || prevScan.notifiedDirection || ''),
                        lastNotifiedConfidence: shouldUpdateNotified ? effectiveConfidence : (prevScan.lastNotifiedConfidence || prevScan.notifiedConfidence || 0),
                        lastNotifiedPrice: shouldUpdateNotified ? effectivePrice : (prevScan.lastNotifiedPrice || prevScan.notifiedPrice || 0),
                        lastNotifiedReason: shouldUpdateNotified ? (effectiveReason || reason) : (prevScan.lastNotifiedReason || prevScan.notifiedReason || '')
                    };
                    if (before !== JSON.stringify(entry)) changed = true;
                });

                if (changed) {
                    _saveDashTAResults(dashResults);
                    saveScanLastResults(scanResults);
                    pushAuthoritativeResultsToNative(true).catch(() => {});
                }
                return changed;
            } catch (_) {
                return false;
            }
        }

        function hydrateSignalSnapshotCache() {
            try {
                const raw = localStorage.getItem(SIGNALS_REMOTE_SNAPSHOT_KEY);
                if (!raw) return false;
                const cached = JSON.parse(raw);
                const cachedAt = Number(cached?.cachedAt || cached?.updatedAt || 0) || 0;
                if (!cachedAt || (Date.now() - cachedAt) > (30 * 60 * 1000)) return false;
                if (!isRemoteSignalSnapshotUsable(cached)) return false;
                return mergeSignalSnapshot(cached);
            } catch (_) {
                return false;
            }
        }

        async function dashFetchSignalSnapshot(options = {}) {
            if (!options.force && !options.forceAuth) {
                try {
                    const raw = localStorage.getItem(SIGNALS_REMOTE_SNAPSHOT_KEY);
                    const cached = raw ? JSON.parse(raw) : null;
                    const cachedAt = Number(cached?.cachedAt || cached?.updatedAt || 0) || 0;
                    if (cached && cachedAt && isRemoteSignalSnapshotUsable(cached) && (Date.now() - cachedAt) < SIGNALS_REMOTE_SNAPSHOT_TTL) {
                        const changed = mergeSignalSnapshot(cached);
                        if (changed || options.render !== false) {
                            try { dashRenderConfidenceGrid(); dashRenderActiveSignals(); dashUpdateStats(); } catch (_) {}
                        }
                        return true;
                    }
                } catch (_) {}
            }
            if (_signalSnapshotFetchPromise) return _signalSnapshotFetchPromise;
            _signalSnapshotFetchPromise = (async () => {
                try {
                    const workerUrls = await _getHealthyWorkerUrls({ force: !!options.forceAuth });
                    if (!workerUrls.length) return false;
                    let data = null;
                    for (const workerUrl of workerUrls) {
                        try {
                            const headers = await getWorkerAuthHeadersForSignals(!!options.forceAuth, workerUrl);
                            const resp = await fetch(`${workerUrl}/signals/snapshot`, {
                                headers,
                                signal: AbortSignal.timeout(7000)
                            });
                            if (!resp.ok) continue;
                            const candidate = await resp.json();
                            if (candidate && candidate.success) {
                                _setActiveWorkerUrl(workerUrl);
                                data = candidate;
                                break;
                            }
                        } catch (_) {}
                    }
                    if (!data || !data.success) return false;
                    const changed = mergeSignalSnapshot(data.snapshot || data);
                    if (changed || options.render !== false) {
                        try { dashRenderConfidenceGrid(); dashRenderActiveSignals(); dashUpdateStats(); } catch (_) {}
                    }
                    return true;
                } catch (_) {
                    return false;
                } finally {
                    _signalSnapshotFetchPromise = null;
                }
            })();
            return _signalSnapshotFetchPromise;
        }

        async function startBackgroundService() {
            try {
                if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.BackgroundScan) {
                    const prefs = getSignalPrefs();
                    const symbolsConfig = buildNativeSymbolsConfig(prefs);
                    const workerUrl = await _resolveHealthyWorkerUrl()
                        || _getWorkerUrls()[0]
                        || _getWorkerUrl();
                    if (!workerUrl) return false;
                    const deviceId = (window.AuthClient && typeof window.AuthClient.getDeviceId === 'function')
                        ? String(window.AuthClient.getDeviceId() || '')
                        : '';
                    const deviceSecret = (window.AuthClient && typeof window.AuthClient.getDeviceSecret === 'function')
                        ? String(window.AuthClient.getDeviceSecret() || '')
                        : '';
                    const userId = (window.AuthClient && typeof window.AuthClient.getUserId === 'function')
                        ? String(window.AuthClient.getUserId() || '')
                        : '';
                    const nativeResult = await window.Capacitor.Plugins.BackgroundScan.start({
                        minConfidence: clampSignalConfidenceThreshold(prefs.globalConfidence),
                        symbolsConfig: JSON.stringify(symbolsConfig),
                        workerUrl,
                        deviceId,
                        deviceSecret,
                        userId,
                        locale: 'system'
                    });

                    const topicsReady = nativeResult?.topicsReady === true;
                    if (topicsReady) {
                        // Version 136 receives one broadcast per symbol. Remove the legacy
                        // per-device registration only after Firebase confirms topic sync.
                        if (localStorage.getItem(SIGNALS_PUSH_TOKEN_KEY)) {
                            unregisterRemotePushNotifications().catch(() => {});
                        }
                    } else {
                        // Transitional fallback for a device that has not completed topic sync yet.
                        registerRemotePushNotifications().catch(() => false);
                    }
                    dashFetchSignalSnapshot({ render: false }).catch(() => {});
                    syncNativeBackgroundResults({
                        force: true,
                        requestScanNow: true,
                        maxAgeMs: 10 * 60 * 1000
                    }).catch(() => {});
                    return true;
                }
                const remotePushReady = await registerRemotePushNotifications().catch(() => false);
                if (remotePushReady) dashFetchSignalSnapshot({ render: false }).catch(() => {});
                return !!remotePushReady;
            } catch (e) { /* console.warn('Background service start error:', e); */ }
            return false;
        }

        async function stopBackgroundService() {
            try {
                if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.BackgroundScan) {
                    await window.Capacitor.Plugins.BackgroundScan.stop();
                }
            } catch (e) { /* console.warn('Background service stop error:', e); */ }
        }

        function getScanLastResults() {
            try { return JSON.parse(localStorage.getItem(SCAN_LAST_RESULTS_KEY)) || {}; } catch { return {}; }
        }
        function saveScanLastResults(results) {
            try { localStorage.setItem(SCAN_LAST_RESULTS_KEY, JSON.stringify(results)); } catch {}
        }

        function _getSymbolLastNotifiedAt(symbol, sourceResults = null) {
            const results = sourceResults || getScanLastResults();
            const entry = (results && results[symbol]) || {};
            return Math.max(0, Number(entry.lastNotifiedAt || entry.notifiedAt || 0) || 0);
        }

        function _getSymbolFreezeRemainingMs(symbol, sourceResults = null, nowTs = Date.now()) {
            const notifiedAt = _getSymbolLastNotifiedAt(symbol, sourceResults);
            if (!notifiedAt) return 0;
            return Math.max(0, SCAN_DEDUP_MS - (nowTs - notifiedAt));
        }

        function _isSymbolConfidenceFrozen(symbol, sourceResults = null, nowTs = Date.now()) {
            return _getSymbolFreezeRemainingMs(symbol, sourceResults, nowTs) > 0;
        }

        const AUTHORITATIVE_SIGNAL_MAX_AGE_MS = 30 * 60 * 1000;
        const AUTHORITATIVE_PUSH_MIN_INTERVAL_MS = 45 * 1000;
        let _lastAuthoritativePushAt = 0;
        let _authoritativePushPromise = null;

        function _normalizeSignalDirection(rawDirection) {
            const raw = String(rawDirection || '').toUpperCase();
            if (raw.includes('AGUARDAR') || raw.includes('AGUARDE') || raw.includes('WAIT')) return 'NEUTRO';
            if (raw.includes('LONG')) return 'LONG';
            if (raw.includes('SHORT')) return 'SHORT';
            return 'NEUTRO';
        }

        function _isDirectionalSignal(direction) {
            return direction === 'LONG' || direction === 'SHORT';
        }

        function _buildAuthoritativeEntryFromSource(symbol, sourceEntry, fallbackEntry = {}) {
            const source = sourceEntry || {};
            const fallback = fallbackEntry || {};
            const rawDirection = _normalizeSignalDirection(source.finalDirection || source.direction || source.signal || fallback.finalDirection || fallback.direction || fallback.signal);
            const confidence = Math.max(0, Math.min(100, Math.round(Number(source.finalConfidence || source.confidence || fallback.finalConfidence || fallback.confidence || 0) || 0)));
            const direction = confidence >= 50 ? rawDirection : 'NEUTRO';
            const lastScanAt = Number(source.lastScanAt || source.timestamp || source.time || fallback.lastScanAt || fallback.timestamp || fallback.time || 0) || 0;
            if (!lastScanAt || (Date.now() - lastScanAt) > AUTHORITATIVE_SIGNAL_MAX_AGE_MS) return null;

            const price = Number(source.price || source.currentPrice || fallback.price || fallback.currentPrice || 0) || 0;
            const reason = String(source.reason || fallback.reason || '').trim();
            const snapshotId = String(source.snapshotId || fallback.snapshotId || '').trim();
            const notifiedAt = Math.max(0, Number(source.notifiedAt || source.lastNotifiedAt || fallback.notifiedAt || fallback.lastNotifiedAt || 0) || 0);
            const expiresAt = Math.max(0, Number(source.expiresAt || fallback.expiresAt || 0) || 0);

            return {
                symbol,
                signal: direction,
                direction,
                finalDirection: direction,
                confidence,
                finalConfidence: confidence,
                price,
                reason,
                lastScanAt,
                snapshotId,
                notifiedAt,
                expiresAt,
                source: 'ta_authoritative_js'
            };
        }

        function _collectAuthoritativeResultsPayload() {
            const scanResults = getScanLastResults();
            const dashResults = _getDashTAResults();
            const symbols = new Set([
                ...Object.keys(typeof CRYPTO_DATABASE !== 'undefined' ? CRYPTO_DATABASE : {}),
                ...Object.keys(scanResults || {}),
                ...Object.keys(dashResults || {})
            ]);

            const payload = {};
            symbols.forEach((rawSymbol) => {
                const symbol = _normalizeScanSymbol(rawSymbol);
                if (!symbol) return;

                const dr = (dashResults && dashResults[symbol]) || {};
                const sr = (scanResults && scanResults[symbol]) || {};

                const drDirection = _normalizeSignalDirection(dr.direction || dr.signal);
                const hasDashAuthoritative = (Number(dr.confidence || 0) > 0 || _isDirectionalSignal(drDirection));
                const entry = _buildAuthoritativeEntryFromSource(symbol, hasDashAuthoritative ? dr : sr, sr);
                if (entry) {
                    payload[symbol] = entry;
                }
            });

            return payload;
        }

        async function pushAuthoritativeResultsToNative(force = false) {
            try {
                const plugin = window?.Capacitor?.Plugins?.BackgroundScan;
                if (!plugin || typeof plugin.setAuthoritativeResults !== 'function') return false;

                const now = Date.now();
                if (!force && _lastAuthoritativePushAt > 0 && (now - _lastAuthoritativePushAt) < AUTHORITATIVE_PUSH_MIN_INTERVAL_MS) {
                    return false;
                }
                if (_authoritativePushPromise) return _authoritativePushPromise;

                const payload = _collectAuthoritativeResultsPayload();
                if (!payload || Object.keys(payload).length === 0) return false;

                _authoritativePushPromise = (async () => {
                    try {
                        await plugin.setAuthoritativeResults({
                            results: JSON.stringify(payload),
                            updatedAt: now
                        });
                        _lastAuthoritativePushAt = Date.now();
                        return true;
                    } catch {
                        return false;
                    } finally {
                        _authoritativePushPromise = null;
                    }
                })();

                return _authoritativePushPromise;
            } catch {
                return false;
            }
        }

        function _cacheAuthoritativeFromAnalysis(symbol, analysis, contextTag = 'TA Avançada') {
            try {
                const normalizedSymbol = _normalizeScanSymbol(symbol);
                if (!normalizedSymbol || !analysis) return;

                const resolved = _resolveScanSignal(analysis);
                const confidence = Math.max(0, Math.min(100, Math.round(Number(resolved.confidence || analysis.v4Confidence || analysis.v3Confidence || analysis.confidence || 0) || 0)));
                const rawDirection = _normalizeSignalDirection(resolved.direction || resolved.signal || analysis.v4Signal || analysis.v3Signal || analysis.signal);
                const direction = confidence >= 50 ? rawDirection : 'NEUTRO';
                const price = Number(analysis.indicators?.movingAverages?.currentPrice || analysis.entry || 0) || 0;
                const gates = analysis.v4GatesPassed ? `${analysis.v4GatesPassed}/${analysis.v4GatesTotal || 9}` : '';
                const reason = _isDirectionalSignal(direction)
                    ? `${direction} ${confidence}%${gates ? ` · ${gates} gates` : ''} · ${contextTag}`
                    : `${contextTag} · Sem sinal direcional`;
                const now = Date.now();

                const dashResults = _getDashTAResults();
                const scanResults = getScanLastResults();

                dashResults[normalizedSymbol] = {
                    ...(dashResults[normalizedSymbol] || {}),
                    signal: direction,
                    direction,
                    confidence,
                    price,
                    reason,
                    gates,
                    lastScanAt: now,
                    source: 'ta_authoritative_js'
                };

                scanResults[normalizedSymbol] = {
                    ...(scanResults[normalizedSymbol] || {}),
                    signal: direction,
                    direction,
                    confidence,
                    price,
                    currentPrice: price,
                    reason,
                    lastScanAt: now,
                    source: 'ta_authoritative_js'
                };

                _saveDashTAResults(dashResults);
                saveScanLastResults(scanResults);
                pushAuthoritativeResultsToNative().catch(() => {});
            } catch (_) {}
        }

        function maybeCacheActiveSignalFromAnalysis(symbol, analysis, contextTag = 'TA Manual') {
            try {
                const normalizedSymbol = _normalizeScanSymbol(symbol);
                if (!normalizedSymbol || !analysis || !isCryptoNotificationEnabled(normalizedSymbol)) return null;

                const resolved = _resolveScanSignal(analysis);
                const direction = _normalizeSignalDirection(resolved.direction || resolved.signal);
                const confidence = Math.max(0, Math.min(100, Math.round(Number(resolved.confidence || 0) || 0)));
                const minConf = getCryptoMinConfidence(normalizedSymbol);
                const price = Number(
                    analysis.indicators?.movingAverages?.currentPrice ||
                    analysis.entry ||
                    analysis.currentPrice ||
                    0
                ) || 0;
                const quality = _isReliableSignalForNotification(analysis, minConf, resolved, normalizedSymbol, price);
                if (direction === 'NEUTRO' || confidence < minConf || !quality.ok) return null;

                const now = Date.now();
                const gates = analysis.v4GatesPassed ? `${analysis.v4GatesPassed}/${analysis.v4GatesTotal || 9}` : '';
                const reason = `${direction} ${confidence}% (min ${minConf}%)${gates ? ` - ${gates} gates` : ''} - ${contextTag}`;
                const snapshot = cacheSignalAnalysisSnapshot(normalizedSymbol, {
                    analysis,
                    direction,
                    confidence,
                    price,
                    reason,
                    gates,
                    minConfidence: minConf,
                    notifiedAt: now,
                    source: 'home_manual_snapshot'
                });
                if (!snapshot) return null;

                const dashResults = _getDashTAResults();
                const scanResults = getScanLastResults();
                dashResults[normalizedSymbol] = {
                    ...(dashResults[normalizedSymbol] || {}),
                    signal: direction,
                    direction,
                    finalDirection: direction,
                    confidence,
                    finalConfidence: confidence,
                    price,
                    gates,
                    reason,
                    lastScanAt: now,
                    snapshotId: snapshot.id,
                    notifiedAt: now,
                    expiresAt: snapshot.expiresAt,
                    source: 'home_manual_snapshot'
                };
                scanResults[normalizedSymbol] = {
                    ...(scanResults[normalizedSymbol] || {}),
                    signal: direction,
                    direction,
                    finalDirection: direction,
                    confidence,
                    finalConfidence: confidence,
                    price,
                    currentPrice: price,
                    gates,
                    reason,
                    lastScanAt: now,
                    snapshotId: snapshot.id,
                    notifiedAt: now,
                    expiresAt: snapshot.expiresAt,
                    lastNotifiedAt: now,
                    lastNotifiedSignal: direction,
                    lastNotifiedDirection: direction,
                    lastNotifiedConfidence: confidence,
                    lastNotifiedPrice: price,
                    lastNotifiedReason: reason,
                    source: 'home_manual_snapshot'
                };
                _saveDashTAResults(dashResults);
                saveScanLastResults(scanResults);
                dashRecordCall(normalizedSymbol, direction, confidence, gates, price, reason, {
                    snapshotId: snapshot.id,
                    notifiedAt: now,
                    expiresAt: snapshot.expiresAt,
                    source: 'home_manual_snapshot'
                });
                pushAuthoritativeResultsToNative(true).catch(() => {});
                try { dashRenderActiveSignals(); dashRenderConfidenceGrid(); dashUpdateStats(); } catch (_) {}
                return snapshot;
            } catch (_) {
                return null;
            }
        }

        const NATIVE_NOTIFICATION_OVERRIDE_MS = 3 * 60 * 1000;
        const nativeNotificationOverrides = Object.create(null);

        function pruneNativeNotificationOverrides(now = Date.now()) {
            Object.keys(nativeNotificationOverrides).forEach((symbol) => {
                const item = nativeNotificationOverrides[symbol];
                if (!item || Number(item.expiresAt || 0) <= now) {
                    delete nativeNotificationOverrides[symbol];
                }
            });
        }

        function applyNativeNotificationPayload(payloadRaw) {
            try {
                const payload = (typeof payloadRaw === 'string')
                    ? JSON.parse(payloadRaw)
                    : payloadRaw;
                if (!payload || typeof payload !== 'object') return false;

                const symbol = _normalizeScanSymbol(payload.symbol || payload.sym || '');
                if (!symbol) return false;

                const rawDirection = String(payload.direction || payload.signal || '').toUpperCase();
                const direction = rawDirection.includes('LONG')
                    ? 'LONG'
                    : rawDirection.includes('SHORT')
                        ? 'SHORT'
                        : 'NEUTRO';

                const confidence = Math.max(0, Math.min(100, Math.round(Number(payload.confidence || 0) || 0)));
                const price = Number(payload.price || payload.currentPrice || 0) || 0;
                const notifiedAt = Math.max(0, Number(payload.notifiedAt || payload.time || payload.ts || Date.now()) || Date.now());
                const expiresAt = Math.max(0, Number(payload.expiresAt || 0) || 0);
                const reason = String(payload.reason || '').trim();

                if (direction === 'NEUTRO' || confidence <= 0) return false;

                const results = getScanLastResults();
                const current = results[symbol] || {};
                const currentNotifiedAt = Number(current.lastNotifiedAt || current.notifiedAt || 0) || 0;
                const effectiveNotifiedAt = Math.max(notifiedAt, currentNotifiedAt) || Date.now();
                const effectivePrice = price > 0
                    ? price
                    : Number(current.lastNotifiedPrice || current.notifiedPrice || current.currentPrice || current.price || 0) || 0;
                const snapshot = cacheSignalAnalysisSnapshot(symbol, {
                    snapshotId: payload.snapshotId || current.snapshotId,
                    direction,
                    confidence,
                    price: effectivePrice,
                    reason: reason || String(current.lastNotifiedReason || current.reason || 'Sinal recebido por notificacao'),
                    notifiedAt: effectiveNotifiedAt,
                    expiresAt,
                    minConfidence: Math.min(getCryptoMinConfidence(symbol), confidence),
                    source: 'native_notification_tap'
                });

                results[symbol] = {
                    ...current,
                    signal: direction,
                    direction,
                    finalDirection: direction,
                    confidence,
                    finalConfidence: confidence,
                    price: effectivePrice,
                    currentPrice: effectivePrice,
                    reason: reason || String(current.reason || ''),
                    source: 'native_notification_tap',
                    lastScanAt: Math.max(Number(current.lastScanAt || 0) || 0, effectiveNotifiedAt),
                    minConfidence: Math.min(getCryptoMinConfidence(symbol), confidence),
                    notifiedAt: effectiveNotifiedAt,
                    expiresAt: snapshot?.expiresAt || expiresAt || current.expiresAt || (effectiveNotifiedAt + ACTIVE_SIGNAL_VALIDITY_MS),
                    snapshotId: snapshot?.id || payload.snapshotId || current.snapshotId || '',
                    lastNotifiedAt: effectiveNotifiedAt,
                    lastNotifiedSignal: direction,
                    lastNotifiedDirection: direction,
                    lastNotifiedConfidence: confidence,
                    lastNotifiedPrice: effectivePrice,
                    lastNotifiedReason: reason || String(current.lastNotifiedReason || current.reason || '')
                };

                saveScanLastResults(results);

                dashRecordCall(
                    symbol,
                    direction,
                    confidence,
                    String(payload.gates || current.gates || 'NATIVE'),
                    effectivePrice,
                    reason || String(current.lastNotifiedReason || current.reason || 'Sinal recebido por notificacao'),
                    {
                        notifiedAt: effectiveNotifiedAt,
                        snapshotId: snapshot?.id || payload.snapshotId || current.snapshotId || '',
                        source: 'native_notification_tap',
                        forceRecord: true
                    }
                );

                nativeNotificationOverrides[symbol] = {
                    direction,
                    confidence,
                    price: effectivePrice,
                    reason: reason || String(current.lastNotifiedReason || ''),
                    notifiedAt: effectiveNotifiedAt,
                    snapshotId: snapshot?.id || payload.snapshotId || current.snapshotId || '',
                    expiresAt: Date.now() + NATIVE_NOTIFICATION_OVERRIDE_MS
                };
                window.__visorNativeNotifOpenedAt = Date.now();

                try {
                    if (typeof dashRenderActiveSignals === 'function') dashRenderActiveSignals();
                    if (typeof dashRenderConfidenceGrid === 'function') dashRenderConfidenceGrid();
                    if (typeof dashUpdateStats === 'function') dashUpdateStats();
                } catch (_) {}

                setTimeout(() => {
                    try {
                        if (typeof dashRefreshConfidence === 'function') {
                            dashRefreshConfidence();
                        }
                    } catch (_) {}
                }, 1200);

                return true;
            } catch (e) {
                console.warn('[applyNativeNotificationPayload]', e);
                return false;
            }
        }
        window.__visorApplyNativeNotificationPayload = applyNativeNotificationPayload;

        function _normalizeScanSymbol(rawSymbol) {
            const clean = String(rawSymbol || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
            if (!clean) return '';
            return clean.endsWith('USDT') ? clean : `${clean}USDT`;
        }

        function _mergeNativeBackgroundResults(nativeResults) {
            if (!nativeResults || typeof nativeResults !== 'object') return false;

            const merged = getScanLastResults();
            const authoritativeResults = _getDashTAResults();
            const nowTs = Date.now();
            let changed = false;
            const callsToPersist = [];

            Object.entries(nativeResults).forEach(([rawSymbol, rawEntry]) => {
                if (!rawEntry || typeof rawEntry !== 'object') return;

                const symbol = _normalizeScanSymbol(rawSymbol);
                if (!symbol) return;

                const current = merged[symbol] || {};
                const incomingTs = Number(rawEntry.lastScanAt || rawEntry.timestamp || 0);
                const currentTs = Number(current.lastScanAt || current.timestamp || 0);
                const incomingNotifiedAt = Number(rawEntry.lastNotifiedAt || rawEntry.notifiedAt || 0) || 0;
                const currentNotifiedAt = Number(current.notifiedAt || current.lastNotifiedAt || 0) || 0;
                const hasNewerNotifiedSnapshot = incomingNotifiedAt > 0 && incomingNotifiedAt > currentNotifiedAt;
                if (incomingTs > 0 && currentTs > incomingTs && !hasNewerNotifiedSnapshot) return;

                const rawSignal = String(rawEntry.direction || rawEntry.signal || '').toUpperCase();
                const direction = rawSignal.includes('LONG')
                    ? 'LONG'
                    : rawSignal.includes('SHORT')
                        ? 'SHORT'
                        : 'NEUTRO';

                const confidence = Math.max(0, Math.min(100, Math.round(Number(rawEntry.confidence || 0) || 0)));
                const nextPrice = Number(rawEntry.currentPrice || rawEntry.price || current.price || 0) || 0;
                const prevNotifiedAt = currentNotifiedAt;
                const nextNotifiedAt = Math.max(incomingNotifiedAt, currentNotifiedAt, 0);
                const nextLastScanAt = incomingTs || Number(current.lastScanAt || 0) || Date.now();
                const minConfidence = clampSignalConfidenceThreshold(rawEntry.minConfidence || getCryptoMinConfidence(symbol));

                const persistedNotifiedDirection = String(
                    rawEntry.lastNotifiedDirection ||
                    rawEntry.notifiedDirection ||
                    current.lastNotifiedDirection ||
                    ''
                ).toUpperCase();
                const persistedNotifiedSignal = String(
                    rawEntry.lastNotifiedSignal ||
                    rawEntry.notifiedSignal ||
                    current.lastNotifiedSignal ||
                    persistedNotifiedDirection ||
                    ''
                ).toUpperCase();
                const persistedNotifiedConfidence = Math.max(
                    0,
                    Math.min(
                        100,
                        Math.round(Number(rawEntry.lastNotifiedConfidence ?? rawEntry.notifiedConfidence ?? current.lastNotifiedConfidence ?? 0) || 0)
                    )
                );
                const persistedNotifiedPrice = Number(rawEntry.lastNotifiedPrice ?? rawEntry.notifiedPrice ?? current.lastNotifiedPrice ?? 0) || 0;
                const persistedNotifiedReason = String(
                    rawEntry.lastNotifiedReason ||
                    rawEntry.notifiedReason ||
                    current.lastNotifiedReason ||
                    ''
                );

                const authEntry = (authoritativeResults && authoritativeResults[symbol]) || {};
                const authDirection = _normalizeSignalDirection(authEntry.direction || authEntry.signal);
                const authConfidence = Math.max(0, Math.min(100, Math.round(Number(authEntry.confidence || 0) || 0)));
                const authPrice = Number(authEntry.price || authEntry.currentPrice || 0) || 0;
                const authReason = String(authEntry.reason || '').trim();
                const authTs = Number(authEntry.lastScanAt || authEntry.timestamp || authEntry.time || 0) || 0;
                const hasFreshAuthoritative = authTs > 0 && (nowTs - authTs) <= AUTHORITATIVE_SIGNAL_MAX_AGE_MS && authConfidence > 0;

                const effectiveDirection = hasFreshAuthoritative ? authDirection : direction;
                const effectiveConfidence = hasFreshAuthoritative ? authConfidence : confidence;
                const effectivePrice = (hasFreshAuthoritative && authPrice > 0) ? authPrice : nextPrice;
                const effectiveReason = hasFreshAuthoritative
                    ? (authReason || String(rawEntry.reason || current.reason || ''))
                    : String(rawEntry.reason || current.reason || '');
                const effectiveNotifiedDirection = _normalizeSignalDirection(persistedNotifiedDirection || effectiveDirection || direction || '');
                const effectiveNotifiedConfidence = persistedNotifiedConfidence > 0 ? persistedNotifiedConfidence : effectiveConfidence;
                const nativeSnapshot = (
                    nextNotifiedAt > 0 &&
                    (nowTs - nextNotifiedAt) <= ACTIVE_SIGNAL_VALIDITY_MS &&
                    effectiveNotifiedDirection !== 'NEUTRO' &&
                    effectiveNotifiedConfidence > 0
                ) ? cacheSignalAnalysisSnapshot(symbol, {
                    snapshotId: rawEntry.snapshotId || current.snapshotId,
                    direction: effectiveNotifiedDirection,
                    confidence: effectiveNotifiedConfidence,
                    price: persistedNotifiedPrice > 0 ? persistedNotifiedPrice : effectivePrice,
                    reason: persistedNotifiedReason || effectiveReason,
                    gates: String(rawEntry.gates || current.gates || 'NATIVE'),
                    minConfidence,
                    notifiedAt: nextNotifiedAt,
                    expiresAt: rawEntry.expiresAt || current.expiresAt,
                    source: String(rawEntry.source || current.source || 'native_background')
                }) : null;
                const hasHistoryCall = _hasDashHistoryCall(symbol, effectiveNotifiedDirection, nextNotifiedAt);

                const before = `${current.signal || ''}|${current.direction || ''}|${Number(current.confidence || 0)}|${Number(current.price || 0)}|${Number(current.lastScanAt || 0)}|${Number(current.notifiedAt || 0)}|${Number(current.lastNotifiedConfidence || 0)}|${Number(current.lastNotifiedPrice || 0)}|${String(current.lastNotifiedDirection || '')}|${String(current.snapshotId || '')}|${Number(current.expiresAt || 0)}`;

                merged[symbol] = {
                    ...current,
                    signal: effectiveDirection,
                    direction: effectiveDirection,
                    finalDirection: effectiveDirection,
                    confidence: effectiveConfidence,
                    finalConfidence: effectiveConfidence,
                    price: effectivePrice,
                    currentPrice: effectivePrice,
                    reason: effectiveReason,
                    lastScanAt: nextLastScanAt,
                    notifiedAt: nextNotifiedAt,
                    expiresAt: nativeSnapshot?.expiresAt || Number(rawEntry.expiresAt || current.expiresAt || 0) || (nextNotifiedAt > 0 ? nextNotifiedAt + ACTIVE_SIGNAL_VALIDITY_MS : 0),
                    snapshotId: nativeSnapshot?.id || String(rawEntry.snapshotId || current.snapshotId || ''),
                    lastNotifiedAt: nextNotifiedAt,
                    lastNotifiedSignal: persistedNotifiedSignal || effectiveNotifiedDirection,
                    lastNotifiedDirection: persistedNotifiedDirection || effectiveNotifiedDirection,
                    lastNotifiedConfidence: effectiveNotifiedConfidence,
                    lastNotifiedPrice: persistedNotifiedPrice > 0 ? persistedNotifiedPrice : effectivePrice,
                    lastNotifiedReason: persistedNotifiedReason || effectiveReason,
                    source: String(rawEntry.source || current.source || 'native_background')
                };

                // Fallback de persistência: se o nativo notificou em background, registrar call no banco
                // ao sincronizar no app (caso o envio nativo tenha falhado por rede/token).
                if (
                    nextNotifiedAt > 0 &&
                    (nextNotifiedAt > prevNotifiedAt || !hasHistoryCall) &&
                    (_normalizeSignalDirection(persistedNotifiedDirection || effectiveDirection) !== 'NEUTRO') &&
                    effectiveNotifiedConfidence > 0
                ) {
                    callsToPersist.push({
                        symbol,
                        direction: effectiveNotifiedDirection,
                        confidence: effectiveNotifiedConfidence,
                        gates: String(rawEntry.gates || 'NATIVE'),
                        price: persistedNotifiedPrice > 0 ? persistedNotifiedPrice : effectivePrice,
                        reason: hasFreshAuthoritative
                            ? (authReason || persistedNotifiedReason || String(rawEntry.reason || ''))
                            : (persistedNotifiedReason || String(rawEntry.reason || '')),
                        minConfidence,
                        notifiedAt: nextNotifiedAt,
                        snapshotId: nativeSnapshot?.id || String(rawEntry.snapshotId || current.snapshotId || ''),
                        source: String(rawEntry.source || current.source || 'native_background')
                    });
                }

                const afterEntry = merged[symbol];
                const after = `${afterEntry.signal || ''}|${afterEntry.direction || ''}|${Number(afterEntry.confidence || 0)}|${Number(afterEntry.price || 0)}|${Number(afterEntry.lastScanAt || 0)}|${Number(afterEntry.notifiedAt || 0)}|${Number(afterEntry.lastNotifiedConfidence || 0)}|${Number(afterEntry.lastNotifiedPrice || 0)}|${String(afterEntry.lastNotifiedDirection || '')}|${String(afterEntry.snapshotId || '')}|${Number(afterEntry.expiresAt || 0)}`;
                if (before !== after) {
                    changed = true;
                }
            });

            if (changed) {
                saveScanLastResults(merged);
            }

            if (callsToPersist.length > 0) {
                callsToPersist.forEach((call) => {
                    try {
                        const reason = call.reason
                            ? String(call.reason)
                            : `${call.direction} ${call.confidence}% (mín ${call.minConfidence}%) · Native Background`;
                        const recorded = dashRecordCall(call.symbol, call.direction, call.confidence, call.gates, call.price, reason, {
                            notifiedAt: call.notifiedAt,
                            snapshotId: call.snapshotId,
                            source: call.source || 'native_background_sync',
                            forceRecord: true
                        });
                        if (recorded) changed = true;
                    } catch (_) {}
                });
            }

            return changed;
        }

        let _nativeResultsSyncPromise = null;
        async function syncNativeBackgroundResults(options = {}) {
            if (_nativeResultsSyncPromise) return _nativeResultsSyncPromise;

            const force = !!options.force;
            const requestScanNow = !!options.requestScanNow;
            const maxAgeMs = Math.max(60 * 1000, Number(options.maxAgeMs || 0) || (10 * 60 * 1000));
            const now = Date.now();
            const lastSync = Number(syncNativeBackgroundResults._lastSyncAt || 0);
            if (!force && lastSync > 0 && (now - lastSync) < 15000) {
                return false;
            }

            _nativeResultsSyncPromise = (async () => {
                try {
                    const plugin = window?.Capacitor?.Plugins?.BackgroundScan;
                    if (!plugin || typeof plugin.getLatestResults !== 'function') return false;

                    const payload = await plugin.getLatestResults();
                    const meta = {
                        lastResultsUpdatedAt: Number(payload?.lastResultsUpdatedAt || payload?.updatedAt || 0) || 0,
                        lastScanStartedAt: Number(payload?.lastScanStartedAt || 0) || 0,
                        lastScanFinishedAt: Number(payload?.lastScanFinishedAt || 0) || 0,
                        ageMs: Number(payload?.ageMs || 0) || 0,
                        status: String(payload?.status || '').toLowerCase(),
                        monitorStatus: String(payload?.monitorStatus || payload?.status || '').toLowerCase(),
                        stale: payload?.stale === true,
                        stuck: payload?.stuck === true,
                        scanInProgress: payload?.scanInProgress === true,
                        serviceEnabled: payload?.serviceEnabled === true,
                        topicsReady: payload?.topicsReady === true,
                        notificationPermission: payload?.notificationPermission !== false,
                        lastPushReceivedAt: Number(payload?.lastPushReceivedAt || 0) || 0
                    };
                    syncNativeBackgroundResults._lastNativeMeta = meta;
                    let changed = _mergeNativeBackgroundResults(payload?.results || {});
                    if (Array.isArray(payload?.calls) && payload.calls.length > 0) {
                        const mergedNativeCalls = _mergeDashHistorySources(dashGetLocalHistory(), payload.calls);
                        const beforeNativeCalls = JSON.stringify(dashGetLocalHistory());
                        dashSaveHistory(mergedNativeCalls);
                        if (JSON.stringify(mergedNativeCalls) !== beforeNativeCalls) changed = true;
                    }
                    syncNativeBackgroundResults._lastSyncAt = Date.now();

                    if (requestScanNow && meta.serviceEnabled && !meta.scanInProgress && typeof plugin.requestScanNow === 'function') {
                        const nativeStale = meta.lastResultsUpdatedAt <= 0 || (Date.now() - meta.lastResultsUpdatedAt) > maxAgeMs;
                        const dashboardStale = (typeof _isDashboardConfidenceStale === 'function')
                            ? _isDashboardConfidenceStale()
                            : nativeStale;
                        if (nativeStale || dashboardStale) {
                            try {
                                const requested = await plugin.requestScanNow({ maxAgeMs });
                                syncNativeBackgroundResults._lastNativeMeta = {
                                    ...meta,
                                    scanInProgress: requested?.scanInProgress === true || requested?.requested === true,
                                    serviceEnabled: requested?.serviceEnabled !== false,
                                    lastResultsUpdatedAt: Number(requested?.lastResultsUpdatedAt || meta.lastResultsUpdatedAt || 0) || 0,
                                    ageMs: Number(requested?.ageMs || meta.ageMs || 0) || 0,
                                    status: String(requested?.status || meta.status || '').toLowerCase(),
                                    stale: requested?.stale === true || meta.stale === true,
                                    stuck: requested?.stuck === true || meta.stuck === true
                                };
                                if (requested?.requested === true) {
                                    syncNativeBackgroundResults._lastScanNowRequestedAt = Date.now();
                                }
                                if (requested?.requested === true && typeof dashScheduleNativeWarmupSync === 'function') {
                                    dashScheduleNativeWarmupSync();
                                }
                            } catch (_) {}
                        }
                    }

                    if (changed) {
                        try { dashRenderConfidenceGrid(); dashRenderActiveSignals(); dashRenderHistory(); dashUpdateStats(); } catch {}
                    }
                    try { dashSyncMasterToggle(); } catch (_) {}

                    return changed;
                } catch (_) {
                    return false;
                } finally {
                    _nativeResultsSyncPromise = null;
                }
            })();

            return _nativeResultsSyncPromise;
        }
        syncNativeBackgroundResults._lastSyncAt = 0;
        syncNativeBackgroundResults._lastNativeMeta = null;
        syncNativeBackgroundResults._lastScanNowRequestedAt = 0;

        const DASH_HIGH_BETA_CALL_SYMBOLS = new Set([
            'DOGEUSDT', 'SHIBUSDT', 'PEPEUSDT', 'FETUSDT', 'RENDERUSDT',
            'SUIUSDT', 'NEARUSDT', 'AVAXUSDT', 'SOLUSDT'
        ]);

        function _dashCallMinMovePct(symbol, intervalKey = '4h') {
            if (typeof getCallMinMovePct === 'function') {
                try { return getCallMinMovePct(symbol, intervalKey); } catch (_) {}
            }
            const normalized = _normalizeScanSymbol(symbol || '');
            const base4h = (normalized === 'BTCUSDT' || normalized === 'ETHUSDT')
                ? 0.20
                : DASH_HIGH_BETA_CALL_SYMBOLS.has(normalized)
                    ? 0.60
                    : 0.35;
            const ratio = intervalKey === '1h' ? 0.60 : intervalKey === '2h' ? 0.78 : 1;
            const floor = intervalKey === '1h' ? 0.12 : intervalKey === '2h' ? 0.16 : 0.20;
            return +Math.max(base4h * ratio, floor).toFixed(3);
        }

        function _dashExpectedMovePct(analysis, direction, entryPrice) {
            if (typeof getExpectedMovePctFromAnalysis === 'function') {
                try { return getExpectedMovePctFromAnalysis(analysis, direction, entryPrice); } catch (_) {}
            }
            const entry = Number(entryPrice || analysis?.entry || analysis?.currentPrice || analysis?.indicators?.movingAverages?.currentPrice || 0);
            if (!entry || entry <= 0) return 0;
            const normalizedDirection = _normalizeSignalDirection(direction);
            const targetCandidates = [
                analysis?.takeProfit2,
                analysis?.takeProfit1,
                analysis?.takeProfit,
                analysis?.dynamicTargets?.tp2,
                analysis?.dynamicTargets?.tp1,
                analysis?.limitOrder?.takeProfit2,
                analysis?.limitOrder?.takeProfit1,
                analysis?.limitOrder?.tp2,
                analysis?.limitOrder?.tp1
            ].map(Number).filter((value) => Number.isFinite(value) && value > 0);
            const directionalTargets = targetCandidates.filter((target) =>
                normalizedDirection === 'SHORT' ? target < entry : target > entry
            );
            const target = directionalTargets[0] || targetCandidates[0];
            if (target) return +(Math.abs((target - entry) / entry) * 100).toFixed(3);
            const atr = Number(analysis?.indicators?.atr14 || analysis?.atr14 || analysis?.atr || 0);
            return atr > 0 ? +(((atr * 1.2) / entry) * 100).toFixed(3) : 0;
        }

        function _dashHasActiveConfirmation(analysis, direction) {
            const normalizedDirection = _normalizeSignalDirection(direction);
            const displacementDirection = _normalizeSignalDirection(analysis?.displacement?.direction || analysis?.displacement?.['1h']?.direction);
            const displacementOk = analysis?.displacement?.detected === true && (!displacementDirection || displacementDirection === 'NEUTRO' || displacementDirection === normalizedDirection);
            const volumeOk = analysis?.volumeExpansion?.expanding === true || analysis?.volumeExpansion1h?.expanding === true || analysis?.volumeExpansion === true;
            const gates = analysis?.v4Gates || {};
            const gateList = Array.isArray(gates) ? gates : Object.values(gates || {});
            const bosOk = analysis?.bosValidation?.valid === true || gateList.some((gate) => {
                const text = String(gate?.name || gate?.key || '').toUpperCase();
                return gate?.passed === true && text.includes('BOS');
            });
            const flowOk = gateList.some((gate) => {
                const text = String(gate?.name || gate?.key || gate?.description || '').toUpperCase();
                return gate?.passed === true && (text.includes('CVD') || text.includes('OI') || text.includes('FLUXO') || text.includes('DELTA'));
            }) || analysis?.oiAnalysis?.confirmsDirection === true || analysis?.realtimeCVD?.available === true;
            return displacementOk || volumeOk || bosOk || flowOk;
        }

        function _getBalancedSignalQuality(analysis, finalSignal, minRequiredConfidence, symbol, entryPrice) {
            const direction = _normalizeSignalDirection(finalSignal?.direction || finalSignal?.signal);
            const confidence = Number(finalSignal?.confidence || 0) || 0;
            if (direction === 'NEUTRO' || confidence < minRequiredConfidence) {
                return { ok: true, reason: '' };
            }

            const expectedMovePct = _dashExpectedMovePct(analysis, direction, entryPrice);
            const minMovePct = _dashCallMinMovePct(symbol, '4h');
            if (expectedMovePct < minMovePct) {
                return { ok: false, reason: `movimento esperado baixo (${expectedMovePct.toFixed(2)}%)` };
            }

            const safeNumber = (value) => {
                const n = Number(value);
                return Number.isFinite(n) ? n : null;
            };
            const indicators = analysis?.indicators || {};
            const rsiValues = [
                indicators?.sentiment?.rsi,
                indicators?.multiTimeframe?.rsi15m,
                indicators?.multiTimeframe?.rsi1h,
                indicators?.multiTimeframe?.rsi4h,
                analysis?.rsi,
                analysis?.rsi1h,
                analysis?.rsi4h
            ].map(safeNumber).filter((value) => value !== null && value > 0 && value <= 100);

            if (direction === 'LONG' && rsiValues.some((value) => value >= 72)) {
                return { ok: false, reason: 'RSI extremo contra LONG' };
            }
            if (direction === 'SHORT' && rsiValues.some((value) => value <= 28)) {
                return { ok: false, reason: 'RSI extremo contra SHORT' };
            }
            if (analysis?.rangePosition?.tradeable === false) {
                return { ok: false, reason: analysis.rangePosition.blockReason || 'range bloqueado' };
            }
            if (analysis?.fundingFilter?.blocked === true) {
                return { ok: false, reason: 'funding bloqueou o setup' };
            }
            if (analysis?.sessionContext?.isWeekend && confidence < 88) {
                return { ok: false, reason: 'liquidez de fim de semana' };
            }
            if (String(analysis?.sessionContext?.fakeBreakoutRisk || '').toUpperCase().includes('ALTO') && confidence < 88) {
                return { ok: false, reason: 'risco alto de fake breakout' };
            }

            const points = analysis?.confidencePoints || {};
            const longPoints = Number(points.longPoints || 0);
            const shortPoints = Number(points.shortPoints || 0);
            const hasPoints = Number.isFinite(longPoints) && Number.isFinite(shortPoints) && (longPoints > 0 || shortPoints > 0);
            if (!hasPoints) {
                if (confidence < 88 && !_dashHasActiveConfirmation(analysis, direction)) {
                    return { ok: false, reason: 'sem confirmacao ativa' };
                }
                return { ok: true, reason: '' };
            }

            const dominantPoints = direction === 'LONG' ? longPoints : shortPoints;
            const oppositePoints = direction === 'LONG' ? shortPoints : longPoints;
            const spread = dominantPoints - oppositePoints;
            const alignedCore = Number(points.alignedCore || 0) || 0;

            if (spread < 14) {
                return { ok: false, reason: 'spread baixo entre LONG e SHORT' };
            }
            if (confidence < 82 && alignedCore < 4) {
                return { ok: false, reason: 'consenso tecnico insuficiente' };
            }
            if (confidence < 88 && !_dashHasActiveConfirmation(analysis, direction)) {
                return { ok: false, reason: 'sem confirmacao ativa' };
            }

            return { ok: true, reason: '' };
        }

        function _isReliableSignalForNotification(analysis, minConf, resolved, symbol, entryPrice) {
            const finalSignal = resolved || _resolveScanSignal(analysis);
            const direction = _normalizeSignalDirection(finalSignal?.direction || finalSignal?.signal);
            const confidence = Number(finalSignal?.confidence || analysis?.v4Confidence || 0);
            const minRequiredConfidence = clampSignalConfidenceThreshold(minConf);
            const balanced = _getBalancedSignalQuality(analysis, finalSignal, minRequiredConfidence, symbol, entryPrice);
            const eligible = direction !== 'NEUTRO' && confidence >= minRequiredConfidence;
            return {
                ok: eligible,
                eligible,
                qualityOk: eligible && balanced.ok,
                confidence,
                direction,
                minRequiredConfidence,
                qualityReason: eligible && !balanced.ok ? (balanced.reason || '') : ''
            };
        }

        // Resolve sinal final para dashboard (compatível com modelo legado e points model)
        function _resolveScanSignal(analysis) {
            if (window.resolveAndStampVisorFinalTAState && analysis) {
                const resolved = window.resolveAndStampVisorFinalTAState(analysis);
                return {
                    signal: resolved.signal,
                    confidence: resolved.confidence,
                    direction: resolved.direction,
                    displaySignal: resolved.displaySignal,
                    finalConfidence: resolved.finalConfidence,
                    finalDirection: resolved.finalDirection,
                    minDirectionalConfidence: resolved.minDirectionalConfidence || 50
                };
            }

            if (window.resolveVisorFinalTASignal && analysis) {
                const resolved = window.resolveVisorFinalTASignal(analysis);
                return {
                    signal: resolved.signal,
                    confidence: resolved.confidence,
                    direction: resolved.direction,
                    minDirectionalConfidence: resolved.minDirectionalConfidence || 50
                };
            }

            const usePointsModel = analysis?.confidenceModel?.name === 'weighted-points-v1';
            const minDirectionalConfidence = 50;

            const v4Signal = String(analysis?.v4Signal || '');
            const v4Confidence = Number(analysis?.v4Confidence || 0);
            const v3Signal = String(analysis?.v3Signal || '');
            const v3Confidence = Number(analysis?.v3Confidence || 0);
            const baseSignal = String(analysis?.signal || 'NEUTRO');
            const baseConfidence = Number(analysis?.confidence || 0);

            let signal = 'NEUTRO';
            let confidence = 0;

            if (v4Signal && !usePointsModel) {
                if (v4Signal.includes('CONFIRMED')) {
                    signal = v4Signal;
                    confidence = v4Confidence;
                } else if (v4Signal.includes('AGUARDAR') || v4Signal.includes('AGUARDE') || v4Signal.includes('WAIT')) {
                    signal = 'NEUTRO';
                    confidence = v4Confidence || v3Confidence || baseConfidence;
                } else if (v4Signal.includes('LONG')) {
                    signal = 'LONG';
                    confidence = v4Confidence || v3Confidence || baseConfidence;
                } else if (v4Signal.includes('SHORT')) {
                    signal = 'SHORT';
                    confidence = v4Confidence || v3Confidence || baseConfidence;
                } else {
                    signal = 'NEUTRO';
                    confidence = v4Confidence || v3Confidence || baseConfidence;
                }
            } else {
                signal = v3Signal || baseSignal;
                confidence = v3Confidence || baseConfidence;
            }

            if (signal === 'AGUARDE' || signal === 'AGUARDAR' || signal.includes('AGUARDAR')) {
                signal = 'NEUTRO';
            }

            if (!usePointsModel && analysis?.marketRegime && analysis.marketRegime.regimeStrength != null) {
                const regimeConf = Math.round((analysis.marketRegime.regimeStrength || 0) * 100);
                confidence = Math.round(confidence * 0.7 + regimeConf * 0.3);
            }

            confidence = Math.max(0, Math.min(100, Math.round(confidence || 0)));
            const direction = signal.includes('LONG') ? 'LONG' : signal.includes('SHORT') ? 'SHORT' : 'NEUTRO';

            if (confidence < minDirectionalConfidence || direction === 'NEUTRO') {
                return {
                    signal: 'NEUTRO',
                    confidence,
                    direction: 'NEUTRO',
                    minDirectionalConfidence
                };
            }

            const finalDirection = window.applyVisorDirectionPolicy
                ? window.applyVisorDirectionPolicy(direction)
                : direction;
            return {
                signal: finalDirection,
                confidence,
                direction: finalDirection,
                minDirectionalConfidence,
                prePolicyDirection: direction,
                directionPolicy: window.VISOR_DIRECTION_POLICY_VERSION || 'inverse-long-short-v1'
            };
        }

        async function runAutoScan() {
            if (isScanning) return;
            if (document.hidden) return;
            const prefs = getSignalPrefs();
            if (!prefs.masterEnabled) return;

            isScanning = true;
            window._taScanContext = true;
            const lastResults = getScanLastResults();
            const dashResults = _getDashTAResults();
            const now = Date.now();
            const enabledCryptos = Object.keys(CRYPTO_DATABASE).filter(sym => {
                // Default is DISABLED — must be explicitly enabled
                return prefs.cryptos[sym]?.enabled === true;
            });

            let scannedCount = 0;
            let signalsFound = 0;

            try {
                for (const symbol of enabledCryptos) {
                    try {
                        // If this symbol already has an active notified signal, freeze confidence updates
                        // for its 30-minute validity window. Other symbols continue updating normally.
                        if (_isSymbolConfidenceFrozen(symbol, lastResults, Date.now())) {
                            const frozenEntry = lastResults[symbol] || {};
                            const frozenDirection = _normalizeSignalDirection(
                                frozenEntry.lastNotifiedDirection ||
                                frozenEntry.lastNotifiedSignal ||
                                frozenEntry.direction ||
                                frozenEntry.signal ||
                                ''
                            );
                            const frozenConfidence = Math.max(
                                0,
                                Math.min(
                                    100,
                                    Math.round(Number(frozenEntry.lastNotifiedConfidence || frozenEntry.confidence || 0) || 0)
                                )
                            );
                            const frozenPrice = Number(
                                frozenEntry.lastNotifiedPrice ||
                                frozenEntry.notifiedPrice ||
                                frozenEntry.price ||
                                frozenEntry.currentPrice ||
                                0
                            ) || 0;
                            const frozenReason = String(
                                frozenEntry.lastNotifiedReason ||
                                frozenEntry.reason ||
                                'Sinal em validade (30m)'
                            );

                            if (frozenDirection !== 'NEUTRO' && frozenConfidence > 0) {
                                dashResults[symbol] = {
                                    ...(dashResults[symbol] || {}),
                                    signal: frozenDirection,
                                    direction: frozenDirection,
                                    finalDirection: frozenDirection,
                                    confidence: frozenConfidence,
                                    finalConfidence: frozenConfidence,
                                    price: frozenPrice,
                                    reason: frozenReason,
                                    lastScanAt: Number(frozenEntry.lastScanAt || frozenEntry.lastNotifiedAt || Date.now()) || Date.now(),
                                    snapshotId: frozenEntry.snapshotId || dashResults[symbol]?.snapshotId || '',
                                    expiresAt: frozenEntry.expiresAt || dashResults[symbol]?.expiresAt || 0,
                                    source: 'ta_frozen_30m'
                                };
                            }
                            continue;
                        }

                        // Fetch data
                        const [analysisData, macroNewsData] = await Promise.all([
                            fetchTechnicalAnalysisData(symbol),
                            (window.TAEngineV2 && window.TAEngineV2.fetchMacroNewsLayer) ?
                                window.TAEngineV2.fetchMacroNewsLayer(symbol).catch(() => null) :
                                Promise.resolve(null)
                        ]);

                        if (!analysisData) continue;

                        // Generate V3 analysis
                        const analysis = generateTechnicalAnalysis(analysisData, symbol);
                        if (macroNewsData) {
                            analysis.macroNews = macroNewsData;
                            if (macroNewsData.totalImpact !== 0 && window.TAEngineV2) {
                                analysis.confluenceSummary.score = (parseFloat(analysis.confluenceSummary.score) + macroNewsData.totalImpact).toFixed(1);
                            }
                        }

                        // V3 Enhancement
                        if (window.TAEngineV3 && window.TAEngineV3.enhanceAnalysis) {
                            try {
                                const enhanced = await window.TAEngineV3.enhanceAnalysis(analysis, analysisData, symbol);
                                Object.assign(analysis, enhanced);
                            } catch {}
                        }

                        // V4 Enhancement
                        if (window.TAEngineV4 && window.TAEngineV4.enhanceWithReactive) {
                            try {
                                const v4Enhanced = await window.TAEngineV4.enhanceWithReactive(analysis, analysisData, symbol);
                                Object.assign(analysis, v4Enhanced);
                            } catch {}
                        }

                        scannedCount++;

                        // Resolve direção/confiança final para dashboard
                        const resolved = _resolveScanSignal(analysis);
                        const signal = resolved.signal;
                        const confidence = resolved.confidence;
                        const direction = resolved.direction;
                        if (typeof setTACache === 'function') {
                            try { setTACache(symbol, { analysis }); } catch (_) {}
                        }
                        const gatesStr = `${analysis.v4GatesPassed || '?'}/${analysis.v4GatesTotal || '9'}`;
                        const entryPrice = Number(analysisData?.ticker?.lastPrice || analysis.indicators?.movingAverages?.currentPrice || 0);
                        const advancedReason = _isDirectionalSignal(direction)
                            ? `${direction} ${confidence}% (mín ${getCryptoMinConfidence(symbol)}%) · ${gatesStr} gates · TA Avançada`
                            : 'TA Avançada · Sem sinal direcional';

                        const minConf = getCryptoMinConfidence(symbol);
                        const quality = _isReliableSignalForNotification(analysis, minConf, resolved, symbol, entryPrice);
                        const lastNotifiedAt = Number(lastResults[symbol]?.lastNotifiedAt || lastResults[symbol]?.notifiedAt || 0);
                        const dedupBlocked = (
                            quality.ok &&
                            direction !== 'NEUTRO' &&
                            lastNotifiedAt > 0 &&
                            (now - lastNotifiedAt) < SCAN_DEDUP_MS
                        );
                        const signalSnapshot = quality.ok ? cacheSignalAnalysisSnapshot(symbol, {
                            analysis,
                            direction,
                            confidence,
                            price: entryPrice,
                            reason: advancedReason,
                            gates: gatesStr,
                            minConfidence: minConf,
                            notifiedAt: dedupBlocked ? (lastNotifiedAt || now) : now,
                            source: 'auto_scan'
                        }) : null;

                        dashResults[symbol] = {
                            ...(dashResults[symbol] || {}),
                            signal,
                            direction,
                            finalDirection: direction,
                            confidence,
                            finalConfidence: confidence,
                            price: entryPrice || Number(dashResults[symbol]?.price || 0) || 0,
                            gates: gatesStr,
                            reason: advancedReason,
                            qualityRejected: quality.ok && !quality.qualityOk,
                            qualityReason: quality.qualityReason || '',
                            lastScanAt: now,
                            snapshotId: signalSnapshot?.id || dashResults[symbol]?.snapshotId || '',
                            expiresAt: signalSnapshot?.expiresAt || dashResults[symbol]?.expiresAt || 0,
                            source: 'ta_authoritative_js'
                        };

                        // Registrar call no banco somente quando respeita o mínimo configurado.
                        if (quality.ok && !dedupBlocked) {
                            const reason = `${direction} ${confidence}% (mín ${minConf}%) · Auto Scan`;
                            dashRecordCall(symbol, direction, confidence, gatesStr, entryPrice, reason, {
                                snapshotId: signalSnapshot?.id || '',
                                notifiedAt: signalSnapshot?.notifiedAt || now,
                                expiresAt: signalSnapshot?.expiresAt || (now + ACTIVE_SIGNAL_VALIDITY_MS),
                                source: 'auto_scan'
                            });
                        }

                        if (quality.ok && !dedupBlocked) {
                            signalsFound++;
                            const crypto = CRYPTO_DATABASE[symbol];
                            const directionText = direction === 'LONG' ? 'LONG 🟢' : 'SHORT 🔴';
                            const title = `${crypto.short} — ${directionText}`;
                            const body = `Confiança ${confidence}% (mín ${minConf}%) · ${gatesStr} gates`;

                            // Fire notification
                            await fireLocalNotification(title, body, symbol.hashCode || Math.floor(Math.random() * 100000));
                        }

                        // Sempre salvar estado para painel de SINAIS ativos
                        if (!lastResults[symbol]) lastResults[symbol] = {};
                        lastResults[symbol].signal = signal;
                        lastResults[symbol].direction = direction;
                        lastResults[symbol].finalDirection = direction;
                        lastResults[symbol].confidence = confidence;
                        lastResults[symbol].finalConfidence = confidence;
                        lastResults[symbol].qualityRejected = quality.ok && !quality.qualityOk;
                        lastResults[symbol].qualityReason = quality.qualityReason || '';
                        lastResults[symbol].price = entryPrice || lastResults[symbol].price || 0;
                        lastResults[symbol].lastScanAt = now;
                        if (signalSnapshot) {
                            lastResults[symbol].snapshotId = signalSnapshot.id;
                            lastResults[symbol].expiresAt = signalSnapshot.expiresAt;
                        }
                        if (quality.ok && !dedupBlocked) {
                            lastResults[symbol].notifiedAt = now;
                            lastResults[symbol].lastNotifiedAt = now;
                            lastResults[symbol].lastNotifiedSignal = direction;
                            lastResults[symbol].lastNotifiedDirection = direction;
                            lastResults[symbol].lastNotifiedConfidence = confidence;
                            lastResults[symbol].lastNotifiedPrice = entryPrice || lastResults[symbol].price || 0;
                            lastResults[symbol].snapshotId = signalSnapshot?.id || lastResults[symbol].snapshotId || '';
                            lastResults[symbol].expiresAt = signalSnapshot?.expiresAt || (now + ACTIVE_SIGNAL_VALIDITY_MS);
                            lastResults[symbol].lastNotifiedReason = `${direction} ${confidence}% (mín ${minConf}%) · ${gatesStr} gates`;
                        }

                        // Small delay between cryptos to avoid API rate limiting
                        await new Promise(r => setTimeout(r, 2000));

                    } catch (scanErr) {
                    }
                }

                _saveDashTAResults(dashResults);
                saveScanLastResults(lastResults);
                pushAuthoritativeResultsToNative().catch(() => {});

                // Refresh dashboard confidence grid if it's visible
                if (typeof dashRenderConfidenceGrid === 'function') {
                    try { dashRenderConfidenceGrid(); dashRenderActiveSignals(); dashUpdateStats(); } catch {}
                }
            } finally {
                isScanning = false;
                window._taScanContext = false;

                // Disconnect all WebSockets opened during scan to prevent memory leak
                try { if (window.TAEngineV4 && window.TAEngineV4.disconnectAllOrderFlowWS) window.TAEngineV4.disconnectAllOrderFlowWS(); } catch(e) {}
                try { if (window.RealtimeCVD && window.RealtimeCVD.disconnectAll) window.RealtimeCVD.disconnectAll(); } catch(e) {}
            }
        }

        function startAutoScan() {
            if (autoScanTimer) return;
            const prefs = getSignalPrefs();
            if (!prefs.masterEnabled) return;
            // Run first scan after 30 seconds (let app load first)
            if (autoScanBootTimeout) {
                clearTimeout(autoScanBootTimeout);
                autoScanBootTimeout = null;
            }
            autoScanBootTimeout = setTimeout(() => {
                autoScanBootTimeout = null;
                runAutoScan();
            }, 30000);
            // Then repeat every 5 min
            autoScanTimer = setInterval(() => runAutoScan(), SCAN_INTERVAL_MS);
        }

        function stopAutoScan() {
            if (autoScanTimer) {
                clearInterval(autoScanTimer);
                autoScanTimer = null;
            }
            if (autoScanBootTimeout) {
                clearTimeout(autoScanBootTimeout);
                autoScanBootTimeout = null;
            }
        }

        // Override handleMasterSignalToggle to also control background service
        const _originalMasterToggle = handleMasterSignalToggle;
        handleMasterSignalToggle = function(checked) {
            _originalMasterToggle(checked);
            if (checked) {
                initLocalNotifications().then(async () => {
                    const backgroundReady = await startBackgroundService();
                    if (!backgroundReady) {
                        startAutoScan();
                        // First scan immediately so active signals appear without section switching.
                        runAutoScan();
                    } else {
                        hydrateSignalSnapshotCache();
                        dashFetchSignalSnapshot({ render: false }).catch(() => {});
                    }
                    if (typeof dashRefreshConfidence === 'function') {
                        try { dashRefreshConfidence(); } catch (_) {}
                    }
                });
            } else {
                stopAutoScan();
                stopBackgroundService();
                unregisterRemotePushNotifications().catch(() => {});
            }
        };

        // Auto-start on page load when user left monitor enabled.
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(async () => {
                initConfidenceSliderGuards();
                const prefs = getSignalPrefs();
                if (prefs.masterEnabled) {
                    await initLocalNotifications();
                    const backgroundReady = await startBackgroundService();
                    if (!backgroundReady) startAutoScan();
                    syncNativeBackgroundResults({ force: true, requestScanNow: true, maxAgeMs: 10 * 60 * 1000 }).catch(() => {});
                    hydrateSignalSnapshotCache();
                    forceSignalsFreshness('startup_monitoring', {
                        force: true,
                        render: false,
                        statusText: 'Atualizando sinais...'
                    }).catch(() => {});
                    if (!backgroundReady) runAutoScan().catch(() => {});
                }

                // Listen for notification taps → go to Dashboard
                try {
                    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications) {
                        window.Capacitor.Plugins.LocalNotifications.addListener('localNotificationActionPerformed', (notification) => {
                            showSection('dashboard');
                        });
                    }
                } catch (e) {}

                // Init dashboard home summary
                if (typeof dashUpdateHomeSummary === 'function') dashUpdateHomeSummary();
            }, 5000);
        });

        document.addEventListener('visibilitychange', () => {
            try {
                const prefs = getSignalPrefs();
                if (!prefs.masterEnabled || document.visibilityState !== 'visible') return;

                // Reconcile native/topic state when the user returns. Hiding the app
                // must not cancel or recreate the already scheduled background work.
                startBackgroundService().then((backgroundReady) => {
                    forceSignalsFreshness('foreground_visible', {
                        force: false,
                        render: _isDashboardVisible(),
                        statusText: 'Atualizando sinais...'
                    }).catch(() => {});
                    if (!backgroundReady) runAutoScan();
                }).catch(() => {
                    runAutoScan();
                });
            } catch (e) {}
        });
        // ═══════════════════════════════════════

        // ═══════════════════════════════════════
        // DASHBOARD — Sinais, Histórico, Config
        // ═══════════════════════════════════════
        const DASH_HISTORY_KEY = 'vc_call_history';
        const DASH_MAX_HISTORY = 100;
        const DASH_CALLS_CLEAN_VERSION = '2026-06-15-inverse-long-short-v1';
        const DASH_CALLS_CLEAN_MARKER = 'vc_calls_clean_version';
        const DASH_CALLS_CLEAN_EPOCH_MS = Date.parse('2026-05-30T21:10:00Z');
        const DASH_CALL_STRATEGY_VERSION = 'S6_INV';
        const DASH_FEEDBACK_STRATEGY_VERSIONS = ['S6_INV'];
        const DASH_TRUSTED_SETTLEMENT_PREFIX = 'worker_settlement_v3_usdm';
        const DASH_LOCAL_SETTLEMENT_VERSION = 'local_usdm_1m_close_v1';
        const DASH_LOCAL_SETTLEMENT_SOURCE = 'binance_usdm_1m_close_local';
        const DASH_SHARED_CALLS_FETCH_TTL = 30 * 1000;
        const DASH_HISTORY_WARMUP_TTL = 5 * 60 * 1000;
        const DASH_WORKER_HEALTH_CACHE_KEY = 'vc_worker_health_cache_v1';
        const DASH_WORKER_HEALTH_TTL = 10 * 60 * 1000;
        let dashHistoryFilter = 'all';
        let _sharedCallsCache = null;
        let _sharedCallsCacheTs = 0;
        let _sharedCallsFetchPromise = null;
        let _workerHealthCache = (() => {
            try { return JSON.parse(localStorage.getItem(DASH_WORKER_HEALTH_CACHE_KEY) || '{}'); }
            catch (_) { return {}; }
        })();
        let _workerHealthPromises = {};
        let _lastRemoteSnapshotFetchedAt = 0;
        let _lastRemoteSnapshotComplete = false;
        let _lastRemoteSnapshotReturnedSymbols = 0;
        let _dashLoadLastStartedAt = 0;
        let _dashHistoryWarmupPromise = null;
        let _dashHistoryWarmupLastAt = 0;
        let _dashHistorySyncing = false;

        function dashScheduleStorageCleanup(keysToRemove, prefixesToRemove) {
            const keys = Array.isArray(keysToRemove) ? [...keysToRemove] : [];
            const prefixes = Array.isArray(prefixesToRemove) ? prefixesToRemove : [];
            let keyIndex = 0;
            let scanIndex = -1;
            const schedule = (fn) => {
                try {
                    if (window.requestIdleCallback) {
                        window.requestIdleCallback(fn, { timeout: 750 });
                        return;
                    }
                } catch (_) {}
                setTimeout(fn, 0);
            };
            const step = () => {
                let ops = 0;
                try {
                    while (keyIndex < keys.length && ops < 16) {
                        try { localStorage.removeItem(keys[keyIndex]); } catch (_) {}
                        keyIndex += 1;
                        ops += 1;
                    }
                    if (keyIndex >= keys.length && scanIndex < 0) {
                        scanIndex = localStorage.length - 1;
                    }
                    while (keyIndex >= keys.length && scanIndex >= 0 && ops < 32) {
                        const key = localStorage.key(scanIndex);
                        scanIndex -= 1;
                        ops += 1;
                        if (!key) continue;
                        if (prefixes.some((prefix) => key.startsWith(prefix))) {
                            try { localStorage.removeItem(key); } catch (_) {}
                        }
                    }
                } catch (_) {}
                if (keyIndex < keys.length || scanIndex >= 0) schedule(step);
            };
            schedule(step);
        }

        function dashResetCallStateOnce() {
            let didReset = false;
            try {
                if (localStorage.getItem(DASH_CALLS_CLEAN_MARKER) !== DASH_CALLS_CLEAN_VERSION) {
                    didReset = true;
                    dashScheduleStorageCleanup([
                        DASH_HISTORY_KEY,
                        SCAN_LAST_RESULTS_KEY,
                        SIGNALS_REMOTE_SNAPSHOT_KEY,
                        SIGNAL_ANALYSIS_SNAPSHOT_KEY,
                        'vc_shared_call_history_v2',
                        'vc_shared_call_history_v3',
                        'vc_shared_call_history_v4',
                        'vc_shared_call_history_v5',
                        'vc_dash_ta_results',
                        'VISOR_CALL_OUTCOME_CACHE_V3',
                        'VISOR_CALL_OUTCOME_CACHE_V2',
                        DASH_WORKER_HEALTH_CACHE_KEY
                    ], [
                        'vc_shared_call_history_',
                        'ta_points_history_',
                        'technical_analysis_cache_'
                    ]);
                    localStorage.setItem(DASH_CALLS_CLEAN_MARKER, DASH_CALLS_CLEAN_VERSION);
                }
            } catch (_) {}

            _sharedCallsCache = null;
            _sharedCallsCacheTs = 0;
            _sharedCallsFetchPromise = null;

            if (!didReset) return;
            _workerHealthCache = {};
            _workerHealthPromises = {};
            try {
                const plugin = window?.Capacitor?.Plugins?.BackgroundScan;
                if (plugin && typeof plugin.resetSignalState === 'function') {
                    plugin.resetSignalState().catch(() => {});
                }
            } catch (_) {}
        }

        dashResetCallStateOnce();

        function _getConfiguredWorkerUrls() {
            let urls = [];
            try {
                if (window.AuthClient && typeof window.AuthClient.getWorkerUrls === 'function') {
                    urls = window.AuthClient.getWorkerUrls();
                } else if (typeof window.getVisorWorkerUrls === 'function') {
                    urls = window.getVisorWorkerUrls();
                } else {
                    const cfg = window.APP_CONFIG || {};
                    urls = [cfg.CALENDAR_WORKER_URL, cfg.CALENDAR_WORKER_FALLBACK_URL];
                }
            } catch (_) {
                const cfg = window.APP_CONFIG || {};
                urls = [cfg.CALENDAR_WORKER_URL, cfg.CALENDAR_WORKER_FALLBACK_URL];
            }
            return [...new Set((urls || [])
                .map(url => String(url || '').trim().replace(/\/+$/, ''))
                .filter(Boolean))];
        }

        function _getWorkerUrl() {
            try {
                const active = String(localStorage.getItem('vc_active_worker_url_v1') || '').trim().replace(/\/+$/, '');
                const cached = _workerHealthCache?.[active];
                if (active && cached?.ok === true && (Date.now() - Number(cached.checkedAt || 0)) < DASH_WORKER_HEALTH_TTL) return active;
            } catch (_) {}
            return _getConfiguredWorkerUrls()[0] || '';
        }

        function _getWorkerUrls() {
            const active = (() => {
                try { return String(localStorage.getItem('vc_active_worker_url_v1') || '').trim().replace(/\/+$/, ''); }
                catch (_) { return ''; }
            })();
            return [...new Set([active, ..._getConfiguredWorkerUrls()].filter(Boolean))];
        }

        function _setActiveWorkerUrl(workerUrl) {
            try {
                const safe = String(workerUrl || '').trim().replace(/\/+$/, '');
                if (safe) localStorage.setItem('vc_active_worker_url_v1', safe);
            } catch (_) {}
        }

        function _isHealthyWorkerPayload(data) {
            const health = data && typeof data === 'object' ? data : {};
            const settlement = String(health.callSettlementVersion || '');
            const storage = String(health.callHistoryStorageVersion || '');
            const backendStorage = String(health.storageVersion || '');
            const strategy = String(health.signalStrategyVersion || '');
            return !!health.version &&
                settlement.startsWith(DASH_TRUSTED_SETTLEMENT_PREFIX) &&
                (storage === 'v5' || storage === 'v6' || backendStorage === 'd1_v1') &&
                DASH_FEEDBACK_STRATEGY_VERSIONS.includes(strategy);
        }

        function _persistWorkerHealthCache() {
            try { localStorage.setItem(DASH_WORKER_HEALTH_CACHE_KEY, JSON.stringify(_workerHealthCache || {})); } catch (_) {}
        }

        async function _checkWorkerHealth(workerUrl, options = {}) {
            const safeUrl = String(workerUrl || '').trim().replace(/\/+$/, '');
            if (!safeUrl) return null;
            const cached = _workerHealthCache?.[safeUrl];
            const now = Date.now();
            if (!options.force && cached && (now - Number(cached.checkedAt || 0)) < DASH_WORKER_HEALTH_TTL) {
                return cached.ok ? safeUrl : null;
            }
            if (_workerHealthPromises[safeUrl]) return _workerHealthPromises[safeUrl];

            _workerHealthPromises[safeUrl] = (async () => {
                try {
                    const resp = await fetch(`${safeUrl}/health`, { signal: AbortSignal.timeout(3500) });
                    const data = resp.ok ? await resp.json().catch(() => null) : null;
                    const ok = resp.ok && _isHealthyWorkerPayload(data);
                    _workerHealthCache[safeUrl] = {
                        ok,
                        checkedAt: Date.now(),
                        version: data?.version || '',
                        signalStrategyVersion: data?.signalStrategyVersion || '',
                        callHistoryStorageVersion: data?.callHistoryStorageVersion || '',
                        storageVersion: data?.storageVersion || '',
                        callHistoryBackend: data?.callHistoryBackend || '',
                        callSettlementVersion: data?.callSettlementVersion || ''
                    };
                    _persistWorkerHealthCache();
                    if (ok) {
                        _setActiveWorkerUrl(safeUrl);
                        return safeUrl;
                    }
                } catch (_) {
                    _workerHealthCache[safeUrl] = { ok: false, checkedAt: Date.now() };
                    _persistWorkerHealthCache();
                } finally {
                    delete _workerHealthPromises[safeUrl];
                }
                return null;
            })();

            return _workerHealthPromises[safeUrl];
        }

        async function _resolveHealthyWorkerUrl(options = {}) {
            const urls = _getWorkerUrls();
            for (const workerUrl of urls) {
                const healthy = await _checkWorkerHealth(workerUrl, options);
                if (healthy) return healthy;
            }
            return '';
        }

        async function _getHealthyWorkerUrls(options = {}) {
            const out = [];
            for (const workerUrl of _getWorkerUrls()) {
                const healthy = await _checkWorkerHealth(workerUrl, options);
                if (healthy) out.push(healthy);
            }
            return [...new Set(out)];
        }

        function _hasTrustedDashSettlement(call) {
            return String(call?.settlementVersion || '').startsWith(DASH_TRUSTED_SETTLEMENT_PREFIX);
        }

        function _hasLocalDashSettlement(call) {
            return String(call?.localSettlementVersion || '').startsWith(DASH_LOCAL_SETTLEMENT_VERSION);
        }

        function _getDashSettlementRank(call) {
            if (_hasTrustedDashSettlement(call)) return 2;
            if (_hasLocalDashSettlement(call)) return 1;
            return 0;
        }

        function _normalizeOfficialDashOutcomes(call, trustedSettlement = _hasTrustedDashSettlement(call)) {
            const prices = { '1h': null, '2h': null, '4h': null };
            const pnl = { '1h': null, '2h': null, '4h': null };
            const checked = { '1h': false, '2h': false, '4h': false };
            if (!trustedSettlement) return { prices, pnl, checked };

            ['1h', '2h', '4h'].forEach((key) => {
                const price = Number(call?.prices?.[key]);
                const pct = Number(call?.pnl?.[key]);
                if (call?.checked?.[key] === true && Number.isFinite(price) && price > 0 && Number.isFinite(pct)) {
                    prices[key] = price;
                    pnl[key] = pct;
                    checked[key] = true;
                }
            });
            return { prices, pnl, checked };
        }

        function _getDashCallKey(call) {
            const symbol = _resolveKnownCallSymbol(call) || _normalizeScanSymbol(call?.symbol || '');
            const direction = String(call?.direction || call?.signal || '').toUpperCase();
            const timestamp = Number(call?.time || call?.timestamp || call?.id || 0) || 0;
            if (!symbol || (direction !== 'LONG' && direction !== 'SHORT') || !timestamp) return '';
            return `${symbol}:${direction}:${Math.floor(timestamp / SCAN_DEDUP_MS)}`;
        }

        function _resolveKnownCallSymbol(call) {
            const db = (typeof CRYPTO_DATABASE !== 'undefined') ? CRYPTO_DATABASE : {};
            if (!call || typeof call !== 'object') return '';

            const directCandidates = [
                call.symbol,
                call.pair,
                call.ticker,
                call.market
            ];

            for (const candidate of directCandidates) {
                const normalized = _normalizeScanSymbol(candidate);
                if (normalized && db[normalized]) return normalized;
            }

            const textCandidates = [
                call.short,
                call.base,
                call.baseAsset,
                call.asset,
                call.name
            ]
                .map(value => String(value || '').trim().toUpperCase())
                .filter(Boolean);

            for (const text of textCandidates) {
                const direct = _normalizeScanSymbol(text);
                if (direct && db[direct]) return direct;

                const matched = Object.entries(db).find(([, crypto]) => {
                    const short = String(crypto?.short || '').toUpperCase();
                    const name = String(crypto?.name || '').toUpperCase();
                    return text === short || text === name;
                });
                if (matched) return matched[0];
            }

            return '';
        }

        function _normalizeDashCall(call) {
            const db = (typeof CRYPTO_DATABASE !== 'undefined') ? CRYPTO_DATABASE : {};
            const symbol = _resolveKnownCallSymbol(call);
            if (!symbol || !db[symbol]) return null;

            const crypto = db[symbol];
            const entryPrice = Number(call?.entryPrice ?? call?.price ?? 0) || 0;
            const timestamp = Number(call?.time || call?.timestamp || call?.id || Date.now()) || Date.now();
            if (Number.isFinite(DASH_CALLS_CLEAN_EPOCH_MS) && timestamp < DASH_CALLS_CLEAN_EPOCH_MS) return null;
            const strategyText = String(call?.strategyVersion || call?.strategy || call?.reason || call?.source || call?.gates || '');
            if (
                Number.isFinite(DASH_CALLS_CLEAN_EPOCH_MS) &&
                timestamp >= DASH_CALLS_CLEAN_EPOCH_MS &&
                !DASH_FEEDBACK_STRATEGY_VERSIONS.some((version) => strategyText.includes(version))
            ) return null;
            const numericId = Number(call?.id);
            const id = Number.isFinite(numericId) && numericId > 0 ? numericId : timestamp;
            const trustedSettlement = _hasTrustedDashSettlement(call);
            const localSettlement = !trustedSettlement && _hasLocalDashSettlement(call);
            const callKey = _getDashCallKey({ ...call, symbol, direction: String(call?.direction || '').toUpperCase(), time: timestamp, timestamp });
            const officialOutcomes = _normalizeOfficialDashOutcomes(call, trustedSettlement || localSettlement);

            return {
                ...call,
                id,
                callKey,
                symbol,
                name: crypto.name || symbol,
                short: crypto.short || symbol.replace('USDT', ''),
                img: crypto.img || call?.img || '',
                price: entryPrice > 0 ? String(entryPrice) : '',
                entryPrice: entryPrice > 0 ? entryPrice : null,
                timestamp,
                time: timestamp,
                prices: officialOutcomes.prices,
                pnl: officialOutcomes.pnl,
                checked: officialOutcomes.checked,
                settlementVersion: trustedSettlement ? call.settlementVersion : undefined,
                settlementSource: trustedSettlement ? call.settlementSource : undefined,
                settlementCandles: trustedSettlement ? call.settlementCandles : undefined,
                settledAt: trustedSettlement ? call.settledAt : undefined,
                localSettlementVersion: localSettlement ? call.localSettlementVersion : undefined,
                localSettlementSource: localSettlement ? call.localSettlementSource : undefined,
                localSettlementCandles: localSettlement ? call.localSettlementCandles : undefined,
                localSettledAt: localSettlement ? call.localSettledAt : undefined
            };
        }

        function _normalizeDashHistory(rawHistory) {
            return Array.isArray(rawHistory)
                ? rawHistory.map(_normalizeDashCall).filter(Boolean)
                : [];
        }

        function _mergeDashCallRecords(existing, incoming) {
            const current = _normalizeDashCall(existing) || existing;
            const next = _normalizeDashCall(incoming) || incoming;
            if (!current) return next;
            if (!next) return current;

            const incomingRank = _getDashSettlementRank(next);
            const existingRank = _getDashSettlementRank(current);
            const merged = incomingRank >= existingRank
                ? { ...current, ...next }
                : { ...next, ...current };
            return _normalizeDashCall(merged) || merged;
        }

        function _mergeDashHistorySources(...sources) {
            const merged = [];
            sources.forEach((source) => {
                const list = Array.isArray(source) ? source : [];
                list.forEach((rawCall) => {
                    const call = _normalizeDashCall(rawCall);
                    if (!call) return;

                    const callKey = _getDashCallKey(call);
                    const callTs = Number(call.time || call.timestamp || 0) || 0;
                    const existingIndex = merged.findIndex((item) => {
                        const itemKey = _getDashCallKey(item);
                        const itemTs = Number(item.time || item.timestamp || 0) || 0;
                        return (
                            (callKey && itemKey === callKey) ||
                            (
                                item.symbol === call.symbol &&
                                item.direction === call.direction &&
                                callTs > 0 &&
                                itemTs > 0 &&
                                Math.abs(itemTs - callTs) <= 5000
                            )
                        );
                    });

                    if (existingIndex >= 0) {
                        merged[existingIndex] = _mergeDashCallRecords(merged[existingIndex], call);
                    } else {
                        merged.push(call);
                    }
                });
            });

            return merged
                .sort((a, b) => Number(b?.time || b?.timestamp || 0) - Number(a?.time || a?.timestamp || 0))
                .slice(0, DASH_MAX_HISTORY);
        }

        function dashGetLocalHistory() {
            try { return _normalizeDashHistory(JSON.parse(localStorage.getItem(DASH_HISTORY_KEY)) || []); } catch { return []; }
        }

        function _hasDashHistoryCall(symbol, direction, timestamp) {
            const normalizedSymbol = _normalizeScanSymbol(symbol);
            const normalizedDirection = _normalizeSignalDirection(direction);
            const ts = Number(timestamp || 0) || 0;
            if (!normalizedSymbol || normalizedDirection === 'NEUTRO' || !ts) return false;
            return dashGetHistory().some((call) => {
                const callTs = Number(call.time || call.timestamp || 0) || 0;
                return call.symbol === normalizedSymbol &&
                    call.direction === normalizedDirection &&
                    callTs > 0 &&
                    Math.abs(callTs - ts) < SCAN_DEDUP_MS;
            });
        }

        function dashGetHistory() {
            const localHistory = dashGetLocalHistory();
            if (Array.isArray(_sharedCallsCache) && _sharedCallsCache.length > 0) {
                return _mergeDashHistorySources(localHistory, _sharedCallsCache);
            }
            return localHistory;
        }
        function dashSaveHistory(arr) {
            try { localStorage.setItem(DASH_HISTORY_KEY, JSON.stringify(_mergeDashHistorySources(arr))); } catch {}
        }

        /**
         * Fetch shared call history from server.
         * Updates local cache and localStorage fallback.
         */
        async function dashFetchSharedHistory(options = {}) {
            const force = options && options.force === true;
            if (!force && _sharedCallsCache && (Date.now() - _sharedCallsCacheTs < DASH_SHARED_CALLS_FETCH_TTL)) {
                return dashGetHistory();
            }
            if (!force && _sharedCallsFetchPromise) return _sharedCallsFetchPromise;

            const workerUrls = await _getHealthyWorkerUrls({ force });
            if (!workerUrls.length) return dashGetHistory();

            _sharedCallsFetchPromise = (async () => {
                try {
                    for (const workerUrl of workerUrls) {
                        try {
                            const resp = await fetch(`${workerUrl}/calls?limit=200`, { signal: AbortSignal.timeout(5000) });
                            if (!resp.ok) continue;
                            const data = await resp.json();
                            if (data.success && Array.isArray(data.calls)) {
                                _setActiveWorkerUrl(workerUrl);
                                const normalizedCalls = _mergeDashHistorySources(dashGetLocalHistory(), data.calls);
                                _sharedCallsCache = normalizedCalls;
                                _sharedCallsCacheTs = Date.now();
                                dashSaveHistory(normalizedCalls);
                                return normalizedCalls;
                            }
                        } catch (_) {}
                    }
                    throw new Error('all call history endpoints failed');
                } catch (e) {
                    console.warn('[Calls] Failed to fetch shared history:', e.message);
                } finally {
                    _sharedCallsFetchPromise = null;
                }
                return dashGetHistory();
            })();

            return _sharedCallsFetchPromise;
        }

        function dashWarmupCallHistory(options = {}) {
            const force = options && options.force === true;
            const forceNative = force || (options && options.forceNative === true);
            const forceRemote = force || (options && options.forceRemote === true);
            const allowRemote = !options || options.remote !== false;
            const now = Date.now();
            const renderLocal = () => {
                if (_isDashboardVisible()) {
                    try { _dashRenderHistoryFromData(dashGetHistory()); } catch (_) {}
                    try { dashUpdateStats(); } catch (_) {}
                }
            };
            const syncNativeFirst = () => syncNativeBackgroundResults({ force: forceNative })
                .catch(() => false)
                .then(() => {
                    const calls = dashGetHistory();
                    try { dashHydrateActiveSignalsFromCalls(calls); } catch (_) {}
                    renderLocal();
                    return calls;
                });

            renderLocal();

            if (!allowRemote) {
                return syncNativeFirst();
            }

            if (!forceRemote && _dashHistoryWarmupPromise) {
                const pendingWarmup = _dashHistoryWarmupPromise;
                return syncNativeFirst().then(() => pendingWarmup).catch(() => dashGetHistory());
            }

            if (!forceRemote && _dashHistoryWarmupLastAt && (now - _dashHistoryWarmupLastAt) < DASH_HISTORY_WARMUP_TTL) {
                return syncNativeFirst();
            }

            _dashHistoryWarmupLastAt = now;
            _dashHistorySyncing = true;
            renderLocal();

            _dashHistoryWarmupPromise = syncNativeFirst().then(() => dashFetchSharedHistory({ force: forceRemote })).then((calls) => {
                try { dashHydrateActiveSignalsFromCalls(calls); } catch (_) {}
                if (_isDashboardVisible()) {
                    try { _dashRenderHistoryFromData(calls); } catch (_) {}
                    try { dashUpdateStats(); } catch (_) {}
                }
                return calls;
            }).catch((err) => {
                console.warn('[Calls] Warmup failed:', err?.message || err);
                return dashGetHistory();
            }).finally(() => {
                _dashHistorySyncing = false;
                renderLocal();
                _dashHistoryWarmupPromise = null;
            });

            return _dashHistoryWarmupPromise;
        }

        function dashScheduleCallHistoryWarmup(delayMs = 1200, options = {}) {
            setTimeout(() => {
                try { dashWarmupCallHistory(options); } catch (_) {}
            }, Math.max(0, Number(delayMs || 0) || 0));
        }

        function dashHydrateActiveSignalsFromCalls(calls) {
            if (!Array.isArray(calls) || calls.length === 0 || typeof CRYPTO_DATABASE === 'undefined') return false;

            const now = Date.now();
            const scanResults = getScanLastResults();
            let changed = false;

            _normalizeDashHistory(calls).forEach((call) => {
                const symbol = _normalizeScanSymbol(call?.symbol || '');
                if (!symbol || !CRYPTO_DATABASE[symbol]) return;

                const direction = _normalizeSignalDirection(call?.direction || call?.signal || '');
                const confidence = Math.max(0, Math.min(100, Math.round(Number(call?.confidence || 0) || 0)));
                const notifiedAt = Number(call?.time || call?.timestamp || call?.id || 0) || 0;
                const price = Number(call?.entryPrice || call?.price || 0) || 0;
                if (direction !== 'LONG' && direction !== 'SHORT') return;
                if (confidence < getCryptoMinConfidence(symbol) || !notifiedAt || (now - notifiedAt) > ACTIVE_SIGNAL_VALIDITY_MS) return;

                const existing = scanResults[symbol] || {};
                const existingTs = Number(existing.lastNotifiedAt || existing.notifiedAt || 0) || 0;
                if (existingTs >= notifiedAt) return;
                const reason = String(call?.reason || call?.source || `${direction} ${confidence}% - Backend`).trim();
                const snapshot = cacheSignalAnalysisSnapshot(symbol, {
                    snapshotId: call?.snapshotId || existing.snapshotId,
                    direction,
                    confidence,
                    price,
                    reason,
                    notifiedAt,
                    source: 'shared_calls_backend'
                });

                scanResults[symbol] = {
                    ...existing,
                    signal: direction,
                    direction,
                    finalDirection: direction,
                    confidence,
                    finalConfidence: confidence,
                    price,
                    currentPrice: price,
                    reason,
                    lastScanAt: notifiedAt,
                    notifiedAt,
                    expiresAt: snapshot?.expiresAt || (notifiedAt + ACTIVE_SIGNAL_VALIDITY_MS),
                    snapshotId: snapshot?.id || existing.snapshotId || '',
                    lastNotifiedAt: notifiedAt,
                    lastNotifiedSignal: direction,
                    lastNotifiedDirection: direction,
                    lastNotifiedConfidence: confidence,
                    lastNotifiedPrice: price,
                    lastNotifiedReason: reason,
                    source: 'shared_calls_backend'
                };
                changed = true;
            });

            if (changed) {
                saveScanLastResults(scanResults);
                pushAuthoritativeResultsToNative(true).catch(() => {});
            }
            return changed;
        }

        /**
         * Record a new call signal in the history.
         * Called from scanners when a directional signal reaches the configured minimum.
         * Sends to shared database and also saves locally as fallback.
         */
        function dashRecordCall(symbol, direction, confidence, gates, price, reason, options = {}) {
            const opts = (options && typeof options === 'object') ? options : {};
            const normalizedSymbol = _resolveKnownCallSymbol({ symbol }) || _normalizeScanSymbol(symbol);
            const normalizedDirection = String(direction || '').toUpperCase();
            const normalizedConfidence = Math.max(0, Math.min(100, Math.round(Number(confidence) || 0)));
            const normalizedPrice = Number(price) || 0;
            const forceRecord = opts.forceRecord === true || opts.force === true;
            if (!normalizedSymbol) return false;
            if (typeof CRYPTO_DATABASE !== 'undefined' && !CRYPTO_DATABASE[normalizedSymbol]) return false;
            if (normalizedDirection !== 'LONG' && normalizedDirection !== 'SHORT') return false;
            if (!forceRecord && normalizedConfidence < SIGNAL_MIN_CONFIDENCE) return false;

            const history = dashGetHistory();
            const now = Math.max(0, Number(opts.notifiedAt || opts.timestamp || opts.time || 0) || 0) || Date.now();
            const normalizedReason = String(reason || `${normalizedDirection} ${normalizedConfidence}%`).trim();
            const versionedReason = normalizedReason.includes(DASH_CALL_STRATEGY_VERSION)
                ? normalizedReason
                : `${DASH_CALL_STRATEGY_VERSION} | ${normalizedReason}`;
            const duplicate = history.find(c =>
                c.symbol === normalizedSymbol &&
                c.direction === normalizedDirection &&
                Math.abs(now - Number(c.time || c.timestamp || 0)) < SCAN_DEDUP_MS
            );
            if (duplicate) return false;

            const crypto = (typeof CRYPTO_DATABASE !== 'undefined' && CRYPTO_DATABASE[normalizedSymbol]) || {};
            const callKey = `${normalizedSymbol}:${normalizedDirection}:${Math.floor(now / SCAN_DEDUP_MS)}`;
            const callData = {
                id: now,
                callKey,
                symbol: normalizedSymbol,
                name: crypto.name || normalizedSymbol,
                short: crypto.short || normalizedSymbol.replace('USDT',''),
                img: crypto.img || '',
                direction: normalizedDirection,
                confidence: normalizedConfidence,
                gates: gates || '',
                price: normalizedPrice > 0 ? String(normalizedPrice) : '',
                entryPrice: normalizedPrice > 0 ? normalizedPrice : null,
                reason: versionedReason,
                source: opts.source ? `${DASH_CALL_STRATEGY_VERSION} | ${String(opts.source)}` : (versionedReason || 'AUTO_SCAN'),
                strategyVersion: DASH_CALL_STRATEGY_VERSION,
                timestamp: now,
                time: now,
                snapshotId: opts.snapshotId || '',
                prices: { '1h': null, '2h': null, '4h': null },
                pnl: { '1h': null, '2h': null, '4h': null },
                checked: { '1h': false, '2h': false, '4h': false },
                features: {
                    reasonFingerprint: normalizedReason.toLowerCase().includes('ema') ? 'ema' : 'generic'
                }
            };

            const saveLocalCall = (payload) => {
                const localHistory = dashGetHistory();
                const normalizedPayload = _normalizeDashCall(payload) || payload;
                const payloadKey = _getDashCallKey(normalizedPayload);
                const localDupIndex = localHistory.findIndex(c =>
                    c.symbol === normalizedSymbol &&
                    c.direction === normalizedDirection &&
                    (
                        (payloadKey && _getDashCallKey(c) === payloadKey) ||
                        Math.abs(Number(normalizedPayload.time || normalizedPayload.timestamp || 0) - Number(c.time || c.timestamp || 0)) < SCAN_DEDUP_MS
                    )
                );
                if (localDupIndex >= 0) {
                    const existing = localHistory[localDupIndex];
                    const incomingTrusted = _hasTrustedDashSettlement(normalizedPayload);
                    const existingTrusted = _hasTrustedDashSettlement(existing);
                    if (incomingTrusted || !existingTrusted) {
                        localHistory[localDupIndex] = _mergeDashCallRecords(existing, normalizedPayload);
                        dashSaveHistory(localHistory);
                        return true;
                    }
                    return false;
                }
                localHistory.unshift(normalizedPayload);
                dashSaveHistory(localHistory);
                return true;
            };

            saveLocalCall(callData);
            _sharedCallsCache = _mergeDashHistorySources(_sharedCallsCache || [], [callData]);
            _sharedCallsCacheTs = Date.now();
            try { dashRenderHistory(); dashUpdateStats(); } catch (_) {}

            // Send to shared database (fire and forget). Local history is already the
            // durable fallback; a healthy backend response is merged back in later.
            _getHealthyWorkerUrls().then((workerUrls) => {
                if (!workerUrls.length) throw new Error('No healthy calls endpoint');
                return (async () => {
                    const body = JSON.stringify(callData);
                    let lastErr = null;
                    for (const workerUrl of workerUrls) {
                        const headers = { 'Content-Type': 'application/json' };
                        if (window.AuthClient && typeof window.AuthClient.getWriteAuthHeaders === 'function') {
                            try {
                                Object.assign(headers, await window.AuthClient.getWriteAuthHeaders({ workerUrl }));
                            } catch (authErr) {
                                lastErr = authErr;
                                continue;
                            }
                        }
                        let idempotencyKey = `call:${normalizedSymbol}:${normalizedDirection}:${Date.now().toString(36)}`;
                        if (window.AuthClient && typeof window.AuthClient.createIdempotencyKey === 'function') {
                            idempotencyKey = window.AuthClient.createIdempotencyKey(`call:${normalizedSymbol}:${normalizedDirection}`);
                        }
                        headers['Idempotency-Key'] = idempotencyKey;

                        for (let attempt = 1; attempt <= 3; attempt++) {
                            try {
                                const resp = await fetch(`${workerUrl}/calls`, {
                                    method: 'POST',
                                    headers,
                                    body,
                                    signal: AbortSignal.timeout(5000)
                                });

                                if (resp.status === 503 && attempt < 3) {
                                    await new Promise(resolve => setTimeout(resolve, 150 * attempt));
                                    continue;
                                }

                                if (!resp.ok) {
                                    throw new Error(`HTTP ${resp.status}`);
                                }

                                const payload = await resp.json();
                                if (payload && payload.success) _setActiveWorkerUrl(workerUrl);
                                return payload;
                            } catch (err) {
                                lastErr = err;
                                if (attempt < 3) {
                                    await new Promise(resolve => setTimeout(resolve, 150 * attempt));
                                }
                            }
                        }
                    }

                    throw (lastErr || new Error('Calls sync failed'));

                })();
            }).then(data => {
                    if (data.success && data.call) {
                        const persisted = {
                            ...callData,
                            ...(data.call || {})
                            // Mantém metadados locais necessários para avaliação 1h/2h/4h
                        };
                        saveLocalCall(persisted);
                        _sharedCallsCache = _mergeDashHistorySources(dashGetLocalHistory(), _sharedCallsCache || [], [persisted]);
                        _sharedCallsCacheTs = Date.now();
                    }
                }).catch(e => {
                    console.warn('[Calls] Failed to sync call:', e.message);
                });

            return true;
        }

        /**
         * Main load function called when entering Dashboard section.
         */
        function dashLoad(options = {}) {
            const nowTs = Date.now();
            if (!options.force && _dashLoadLastStartedAt && (nowTs - _dashLoadLastStartedAt) < 900) {
                return;
            }
            _dashLoadLastStartedAt = nowTs;
            _dashHydrating = true;
            hydrateSignalSnapshotCache();
            dashSyncMasterToggle();
            dashRenderActiveSignals();
            dashRenderConfidenceGrid();
            dashRenderHistory();
            dashUpdateStats();
            dashRenderCryptoSettings();
            dashUpdateHomeSummary();
            if (_isDashboardConfidenceStale()) {
                _setDashConfidenceUpdating('Atualizando sinais...');
            }
            dashWarmupCallHistory({ forceNative: true })
                .then((calls) => {
                    if (dashHydrateActiveSignalsFromCalls(calls)) {
                        dashRenderActiveSignals();
                        dashUpdateStats();
                    }
                })
                .catch(() => {});
            const openedFromNativeNotification = Number(window.__visorNativeNotifOpenedAt || 0) > 0
                && (Date.now() - Number(window.__visorNativeNotifOpenedAt || 0)) < 15000;
            forceSignalsFreshness('dash_load', {
                force: true,
                render: true,
                statusText: 'Atualizando sinais...'
            })
                .finally(() => {
                    _dashHydrating = false;
                    try {
                        dashRenderActiveSignals();
                        dashRenderConfidenceGrid();
                        dashUpdateStats();
                        pushAuthoritativeResultsToNative().catch(() => {});
                        const coverage = _getDashboardConfidenceCoverage();
                        const stale = _isDashboardConfidenceStale(coverage);
                        if (stale || coverage.withConfidence === 0 || coverage.missing > 0) {
                            const nativeMeta = syncNativeBackgroundResults._lastNativeMeta || {};
                            const recentNativeRequest = Date.now() - Number(syncNativeBackgroundResults._lastScanNowRequestedAt || 0) < 5000;
                            if (nativeMeta.scanInProgress === true || recentNativeRequest) {
                                _setDashConfidenceUpdating('Atualizando sinais...');
                                setTimeout(() => {
                                    try { forceSignalsFreshness('native_scan_followup', { force: true, render: true }); } catch (_) {}
                                }, 3500);
                            } else {
                                ensureDashboardConfidenceScan('native_sync_low_coverage', {
                                    force: stale || coverage.withConfidence === 0 || coverage.missing > 0,
                                    statusText: 'Atualizando sinais...'
                                });
                            }
                        }
                        if (typeof _scheduleDashOutcomeQueue === 'function') {
                            _scheduleDashOutcomeQueue(1200);
                        }
                    } catch (_) {}
                });

            if (openedFromNativeNotification) {
                dashScheduleNativeWarmupSync();
            } else {
                dashClearNativeWarmupSync();
            }

            dashStartConfAutoRefresh();
        }

        function dashSyncMasterToggle() {
            const prefs = getSignalPrefs();
            const toggle = document.getElementById('dash-master-toggle');
            const track = document.getElementById('dash-master-track');
            const thumb = document.getElementById('dash-master-thumb');
            const status = document.getElementById('dash-monitor-status');
            const detail = document.getElementById('dash-monitor-detail');

            if (toggle) toggle.checked = prefs.masterEnabled;
            if (track) { track.style.background = prefs.masterEnabled ? '#6366f1' : '#2a2a3a'; track.style.borderColor = prefs.masterEnabled ? '#6366f1' : '#666'; }
            if (thumb) thumb.style.transform = prefs.masterEnabled ? 'translateX(22px)' : 'translateX(0)';
            const nativeMeta = syncNativeBackgroundResults._lastNativeMeta || {};
            const nativeStatus = String(nativeMeta.monitorStatus || nativeMeta.status || '').toLowerCase();
            const tr = (key, params, fallback) => {
                try { return window.VisorI18n?.t?.(key, params) || fallback; } catch (_) { return fallback; }
            };
            const statusLabel = !prefs.masterEnabled
                ? tr('monitorInactive', null, 'Inativo')
                : nativeStatus === 'no_permission'
                    ? tr('monitorNoPermission', null, 'Sem permissao')
                    : nativeStatus === 'syncing' || nativeMeta.scanInProgress === true
                        ? tr('monitorSyncing', null, 'Sincronizando')
                        : nativeStatus === 'offline'
                            ? tr('monitorOffline', null, 'Conexao indisponivel')
                            : tr('monitorActive', null, 'Ativo');
            if (status) status.textContent = statusLabel;
            if (detail) {
                const total = Object.keys(typeof CRYPTO_DATABASE !== 'undefined' ? CRYPTO_DATABASE : {}).length;
                let enabled = 0;
                Object.keys(typeof CRYPTO_DATABASE !== 'undefined' ? CRYPTO_DATABASE : {}).forEach(sym => {
                    if (prefs.cryptos[sym]?.enabled === true) enabled++;
                });
                detail.textContent = prefs.masterEnabled
                    ? tr('monitorDetail', { count: enabled }, `${enabled} criptos · alertas FCM + verificacao a cada 15 min`)
                    : tr('monitorEnableHint', null, 'Ative para receber sinais de trading');
            }
        }

        function dashHandleMasterToggle(checked) {
            handleMasterSignalToggle(checked);
            dashSyncMasterToggle();
            dashRenderCryptoSettings(); // Auto-update na lista do painel dashboard
            // Sync bell panel toggle + icon
            const prefs = getSignalPrefs();
            _syncBellPanelFromPrefs(prefs);
            if (checked) {
                try { dashRenderActiveSignals(); } catch (_) {}
                if (typeof dashRefreshConfidence === 'function') {
                    try { dashRefreshConfidence(); } catch (_) {}
                }
            } else {
                try { dashRenderActiveSignals(); } catch (_) {}
            }
        }

        let _dashActiveSnapshot = [];
        let _dashActiveSnapshotTs = 0;
        const DASH_NOTIFIED_SNAPSHOT_TTL = 30 * 60 * 1000;
        let _dashActiveLastRenderKey = '';
        let _dashHydrating = false;

        function _resolveDashboardSignalData(symbol, scanResults, dashResults) {
            const sr = (scanResults && scanResults[symbol]) || {};
            const dr = (dashResults && dashResults[symbol]) || {};
            const now = Date.now();

            {
                const notifiedAtEarly = Number(sr.lastNotifiedAt || sr.notifiedAt || 0) || 0;
                const snapshotConfidenceEarly = Number(sr.lastNotifiedConfidence || sr.notifiedConfidence || 0) || 0;
                const snapshotDirectionRawEarly = String(
                    sr.lastNotifiedDirection ||
                    sr.notifiedDirection ||
                    sr.lastNotifiedSignal ||
                    sr.notifiedSignal ||
                    ''
                ).toUpperCase();
                const snapshotDirectionEarly = snapshotDirectionRawEarly.includes('LONG')
                    ? 'LONG'
                    : snapshotDirectionRawEarly.includes('SHORT')
                        ? 'SHORT'
                        : 'NEUTRO';

                if (
                    notifiedAtEarly > 0 &&
                    snapshotDirectionEarly !== 'NEUTRO' &&
                    snapshotConfidenceEarly > 0 &&
                    (now - notifiedAtEarly) <= DASH_NOTIFIED_SNAPSHOT_TTL
                ) {
                    return {
                        ...dr,
                        ...sr,
                        signal: snapshotDirectionEarly,
                        direction: snapshotDirectionEarly,
                        confidence: snapshotConfidenceEarly,
                        price: Number(sr.lastNotifiedPrice || sr.notifiedPrice || sr.price || dr.price || 0),
                        reason: String(sr.lastNotifiedReason || sr.notifiedReason || sr.reason || dr.reason || ''),
                        _fromAuthoritative: false,
                        _fromNotified: true,
                        _eventTs: notifiedAtEarly
                    };
                }
            }

            const advancedConfidence = Math.max(0, Math.min(100, Math.round(Number(dr.confidence || 0) || 0)));
            const advancedRawDirection = _normalizeSignalDirection(dr.direction || dr.signal);
            const advancedDirection = advancedConfidence >= 50 ? advancedRawDirection : 'NEUTRO';
            const advancedTs = Number(dr.lastScanAt || dr.timestamp || dr.time || 0) || 0;
            const hasFreshAdvanced =
                advancedTs > 0 &&
                (now - advancedTs) <= AUTHORITATIVE_SIGNAL_MAX_AGE_MS &&
                (advancedDirection === 'NEUTRO' || advancedConfidence > 0);

            if (hasFreshAdvanced) {
                return {
                    ...sr,
                    ...dr,
                    signal: advancedDirection,
                    direction: advancedDirection,
                    confidence: advancedConfidence,
                    price: Number(dr.price || dr.currentPrice || sr.price || sr.currentPrice || sr.lastNotifiedPrice || 0),
                    reason: String(dr.reason || sr.reason || sr.lastNotifiedReason || ''),
                    _fromAuthoritative: true,
                    _fromNotified: false,
                    _eventTs: advancedTs
                };
            }

            pruneNativeNotificationOverrides(now);
            const override = nativeNotificationOverrides[symbol];
            if (override && Number(override.expiresAt || 0) > now) {
                return {
                    ...dr,
                    ...sr,
                    signal: override.direction,
                    direction: override.direction,
                    confidence: Number(override.confidence || 0),
                    price: Number(override.price || sr.lastNotifiedPrice || sr.price || dr.price || 0),
                    reason: String(override.reason || sr.lastNotifiedReason || sr.reason || dr.reason || ''),
                    _fromAuthoritative: false,
                    _fromNotified: true,
                    _eventTs: Number(override.notifiedAt || now)
                };
            }

            const notifiedAt = Number(sr.lastNotifiedAt || sr.notifiedAt || 0) || 0;
            const snapshotConfidence = Number(sr.lastNotifiedConfidence || sr.notifiedConfidence || 0) || 0;
            const snapshotDirectionRaw = String(
                sr.lastNotifiedDirection ||
                sr.notifiedDirection ||
                sr.lastNotifiedSignal ||
                sr.notifiedSignal ||
                ''
            ).toUpperCase();
            const snapshotDirection = snapshotDirectionRaw.includes('LONG')
                ? 'LONG'
                : snapshotDirectionRaw.includes('SHORT')
                    ? 'SHORT'
                    : 'NEUTRO';

            const hasSnapshot = notifiedAt > 0 && snapshotDirection !== 'NEUTRO' && snapshotConfidence > 0;
            const isSnapshotFresh = hasSnapshot && (now - notifiedAt) <= DASH_NOTIFIED_SNAPSHOT_TTL;

            if (isSnapshotFresh) {
                return {
                    ...dr,
                    ...sr,
                    signal: snapshotDirection,
                    direction: snapshotDirection,
                    confidence: snapshotConfidence,
                    price: Number(sr.lastNotifiedPrice || sr.notifiedPrice || sr.price || dr.price || 0),
                    reason: String(sr.lastNotifiedReason || sr.notifiedReason || sr.reason || dr.reason || ''),
                    _fromAuthoritative: false,
                    _fromNotified: true,
                    _eventTs: notifiedAt
                };
            }

            const merged = (dr && Number(dr.confidence || 0) > 0)
                ? { ...sr, ...dr }
                : { ...dr, ...sr };
            merged._fromAuthoritative = false;
            merged._fromNotified = false;
            merged._eventTs = Number(merged.lastScanAt || merged.notifiedAt || merged.time || merged.timestamp || 0);
            return merged;
        }

        function getVisorFinalTAStateForSymbol(symbol, options = {}) {
            const safeSymbol = _normalizeScanSymbol(symbol);
            if (!safeSymbol) return null;
            const liveOnly = options.liveOnly === true || options.ignoreNotifiedSnapshots === true;
            const scanResults = getScanLastResults();
            const dashResults = _getDashTAResults();
            const data = liveOnly
                ? (() => {
                    const sr = (scanResults && scanResults[safeSymbol]) || {};
                    const dr = (dashResults && dashResults[safeSymbol]) || {};
                    const preferred = (Number(dr.finalConfidence || dr.confidence || 0) > 0 || Number(dr.lastScanAt || dr.finalUpdatedAt || 0) > 0)
                        ? dr
                        : sr;
                    const confidence = Math.max(0, Math.min(100, Math.round(Number(preferred.finalConfidence || preferred.confidence || 0) || 0)));
                    const direction = confidence >= 50 ? _normalizeSignalDirection(preferred.finalDirection || preferred.direction || preferred.signal) : 'NEUTRO';
                    const ts = Number(preferred.finalUpdatedAt || preferred.lastScanAt || preferred.lastGoodAt || preferred.timestamp || preferred.time || 0) || 0;
                    return {
                        ...preferred,
                        signal: direction,
                        direction,
                        finalDirection: direction,
                        confidence,
                        finalConfidence: confidence,
                        _fromNotified: false,
                        _eventTs: ts
                    };
                })()
                : (_resolveDashboardSignalData(safeSymbol, scanResults, dashResults) || {});

            const snapshot = liveOnly ? null : getActiveSignalAnalysisSnapshot(safeSymbol, {
                ...(dashResults[safeSymbol] || {}),
                ...(scanResults[safeSymbol] || {}),
                ...data,
                symbol: safeSymbol
            });

            if (snapshot) {
                const direction = _normalizeSignalDirection(snapshot.finalDirection || snapshot.direction || snapshot.signal);
                const confidence = Math.max(0, Math.min(100, Math.round(Number(snapshot.finalConfidence || snapshot.confidence || 0) || 0)));
                if (direction !== 'NEUTRO' && confidence > 0) {
                    return {
                        ...snapshot,
                        symbol: safeSymbol,
                        signal: direction,
                        direction,
                        finalDirection: direction,
                        confidence,
                        finalConfidence: confidence,
                        finalProbability: Math.max(5, Math.min(100, Math.round(Number(snapshot.finalProbability || snapshot.probability || confidence || 50) || 50))),
                        finalUpdatedAt: Number(snapshot.notifiedAt || snapshot.updatedAt || snapshot.createdAt || Date.now()) || Date.now(),
                        source: snapshot.source || 'signal_snapshot',
                        frozen: true,
                        _fromNotified: true,
                        _eventTs: Number(snapshot.notifiedAt || Date.now()) || Date.now()
                    };
                }
            }

            const confidence = Math.max(0, Math.min(100, Math.round(Number(data.finalConfidence || data.confidence || 0) || 0)));
            const direction = confidence >= 50 ? _normalizeSignalDirection(data.finalDirection || data.direction || data.signal) : 'NEUTRO';
            const ts = Number(data.finalUpdatedAt || data.lastScanAt || data.lastGoodAt || data.timestamp || data.time || data._eventTs || 0) || 0;
            const maxAgeMs = Math.max(60 * 1000, Number(options.maxAgeMs || AUTHORITATIVE_SIGNAL_MAX_AGE_MS) || AUTHORITATIVE_SIGNAL_MAX_AGE_MS);
            const isFresh = ts > 0 && (Date.now() - ts) <= maxAgeMs;
            if (!isFresh || confidence <= 0) return null;

            return {
                ...data,
                symbol: safeSymbol,
                signal: direction,
                direction,
                finalDirection: direction,
                confidence,
                finalConfidence: confidence,
                finalProbability: Math.max(5, Math.min(100, Math.round(Number(data.finalProbability || data.probability || confidence || 50) || 50))),
                finalUpdatedAt: ts,
                source: data.source || 'dashboard_final_state',
                frozen: !liveOnly,
                _eventTs: ts
            };
        }
        window.getVisorFinalTAStateForSymbol = getVisorFinalTAStateForSymbol;

        function setVisorFinalTAStateForSymbol(symbol, state = {}) {
            const safeSymbol = _normalizeScanSymbol(symbol);
            if (!safeSymbol || !state || typeof state !== 'object') return null;
            const now = Date.now();
            const scanResults = getScanLastResults();
            const dashResults = _getDashTAResults();
            if (_isSymbolConfidenceFrozen(safeSymbol, scanResults, now)) {
                return getVisorFinalTAStateForSymbol(safeSymbol);
            }

            const confidence = Math.max(0, Math.min(100, Math.round(Number(state.finalConfidence || state.confidence || 0) || 0)));
            const direction = confidence >= 50 ? _normalizeSignalDirection(state.finalDirection || state.direction || state.signal) : 'NEUTRO';
            const finalUpdatedAt = Number(state.finalUpdatedAt || state.lastScanAt || state.updatedAt || now) || now;
            const price = Number(state.price || state.entryPrice || state.currentPrice || dashResults[safeSymbol]?.price || scanResults[safeSymbol]?.price || 0) || 0;
            const entry = {
                ...(dashResults[safeSymbol] || {}),
                symbol: safeSymbol,
                signal: direction,
                direction,
                finalDirection: direction,
                confidence,
                finalConfidence: confidence,
                probability: Math.max(5, Math.min(100, Math.round(Number(state.finalProbability || state.probability || confidence || 50) || 50))),
                finalProbability: Math.max(5, Math.min(100, Math.round(Number(state.finalProbability || state.probability || confidence || 50) || 50))),
                price,
                currentPrice: price,
                reason: String(state.reason || dashResults[safeSymbol]?.reason || 'HOME TA final').trim(),
                gates: String(state.gates || dashResults[safeSymbol]?.gates || ''),
                lastScanAt: finalUpdatedAt,
                lastGoodAt: finalUpdatedAt,
                finalUpdatedAt,
                status: 'ready',
                source: String(state.source || 'home_ta_final')
            };

            dashResults[safeSymbol] = entry;
            scanResults[safeSymbol] = {
                ...(scanResults[safeSymbol] || {}),
                ...entry
            };
            _saveDashTAResults(dashResults);
            saveScanLastResults(scanResults);
            return entry;
        }
        window.setVisorFinalTAStateForSymbol = setVisorFinalTAStateForSymbol;

        async function dashOpenSignalTechnical(symbol) {
            const safeSymbol = String(symbol || '').trim().toUpperCase();
            if (!safeSymbol || typeof CRYPTO_DATABASE === 'undefined' || !CRYPTO_DATABASE[safeSymbol]) return;

            try { currentChartSymbol = safeSymbol; } catch (_) {}

            const scanResults = getScanLastResults();
            const dashResults = _getDashTAResults();
            const data = _resolveDashboardSignalData(safeSymbol, scanResults, dashResults);
            const snapshot = getActiveSignalAnalysisSnapshot(safeSymbol, {
                ...(dashResults[safeSymbol] || {}),
                ...(scanResults[safeSymbol] || {}),
                ...data,
            });
            if (snapshot && renderSignalSnapshotAnalysis(snapshot, CRYPTO_DATABASE[safeSymbol])) {
                return;
            }

            if (typeof openTechnicalAnalysis === 'function') {
                try {
                    await openTechnicalAnalysis({ skipChartStack: true, source: 'dashboard-active' });
                } catch (err) {
                    console.warn('[dashOpenSignalTechnical][ta]', err);
                }
            }
        }
        window.dashOpenSignalTechnical = dashOpenSignalTechnical;

        function dashRenderActiveSignals() {
            const container = document.getElementById('dash-active-signals');
            const countEl = document.getElementById('dash-active-count');
            if (!container) return;

            const scanResults = getScanLastResults();
            const dashResults = _getDashTAResults();
            const now = Date.now();
            pruneSignalAnalysisSnapshots(now);
            const activeSignals = [];
            let activeHtml = '';

            const getRemainingValidityMs = (notifiedAt) => {
                const ts = Number(notifiedAt || 0) || 0;
                if (!ts) return 0;
                return Math.max(0, ACTIVE_SIGNAL_VALIDITY_MS - (now - ts));
            };

            const formatValidityLabel = (remainingMs) => {
                const mins = Math.max(1, Math.ceil(Number(remainingMs || 0) / 60000));
                if (mins >= 60) {
                    const h = Math.floor(mins / 60);
                    const m = mins % 60;
                    return m > 0 ? `valido por ${h}h ${m}m` : `valido por ${h}h`;
                }
                return `valido por ${mins}m`;
            };

            Object.entries(typeof CRYPTO_DATABASE !== 'undefined' ? CRYPTO_DATABASE : {}).forEach(([symbol, crypto]) => {
                const sr = (scanResults && scanResults[symbol]) || {};
                const data = _resolveDashboardSignalData(symbol, scanResults, dashResults);

                const signal = String(data.signal || '');
                const direction = (data.direction === 'LONG' || data.direction === 'SHORT')
                    ? data.direction
                    : signal.includes('LONG')
                        ? 'LONG'
                        : signal.includes('SHORT')
                            ? 'SHORT'
                            : 'NEUTRO';
                const confidence = Number(data.confidence || 0);
                const snapshot = getActiveSignalAnalysisSnapshot(symbol, {
                    ...(sr || {}),
                    ...(data || {}),
                    symbol
                });

                const snapshotDirection = snapshot
                    ? _normalizeSignalDirection(snapshot.finalDirection || snapshot.direction || snapshot.signal)
                    : direction;
                const snapshotConfidence = snapshot
                    ? Math.max(0, Math.min(100, Math.round(Number(snapshot.finalConfidence || snapshot.confidence || confidence || 0) || 0)))
                    : confidence;
                const snapshotPrice = snapshot
                    ? Number(snapshot.price || snapshot.entryPrice || data.price || data.currentPrice || 0) || 0
                    : Number(data.price || data.entryPrice || 0) || 0;
                const baseMinConf = getCryptoMinConfidence(symbol);
                const minConf = snapshot
                    ? clampSignalConfidenceThreshold(snapshot.minConfidence || baseMinConf)
                    : baseMinConf;

                if (!isCryptoNotificationEnabled(symbol) || snapshotDirection === 'NEUTRO' || snapshotConfidence < minConf) return;

                const fallbackActiveAt = Number(data.lastScanAt || data.lastGoodAt || data.timestamp || data.time || 0) || 0;
                const notifiedAt = Number(
                    snapshot?.notifiedAt ||
                    (data._fromNotified ? (data._eventTs || sr.lastNotifiedAt || sr.notifiedAt || 0) : (sr.lastNotifiedAt || sr.notifiedAt || 0)) ||
                    fallbackActiveAt
                ) || 0;
                const expiresAt = Number(snapshot?.expiresAt || data.expiresAt || sr.expiresAt || 0) || 0;
                const remainingValidityMs = expiresAt > 0
                    ? Math.max(0, expiresAt - now)
                    : getRemainingValidityMs(notifiedAt);
                if (remainingValidityMs <= 0) return;

                const lastEventTs = Number(snapshot?.notifiedAt || data._eventTs || data.lastScanAt || data.notifiedAt || data.time || data.timestamp || 0);
                activeSignals.push({
                    symbol,
                    crypto,
                    direction: snapshotDirection,
                    confidence: snapshotConfidence,
                    price: snapshotPrice,
                    ts: lastEventTs,
                    fromNotified: !!data._fromNotified || !!snapshot,
                    notifiedAt,
                    snapshotId: snapshot?.id || snapshot?.snapshotId || data.snapshotId || sr.snapshotId || '',
                    remainingValidityMs,
                    validityLabel: formatValidityLabel(remainingValidityMs)
                });
            });

            activeSignals.sort((a, b) => (b.confidence - a.confidence) || (b.ts - a.ts));

            if (activeSignals.length > 0) {
                _dashActiveSnapshot = activeSignals.slice(0, 20);
                _dashActiveSnapshotTs = Date.now();
            }

            const isRefreshing = _dashScanRunning || isScanning;
            const validSnapshot = _dashActiveSnapshot.filter((item) => {
                const snapNotifiedAt = Number(item.notifiedAt || item.ts || 0) || 0;
                return getRemainingValidityMs(snapNotifiedAt) > 0;
            });
            const canUseSnapshot = isRefreshing && validSnapshot.length > 0 && (Date.now() - _dashActiveSnapshotTs) < (15 * 60 * 1000);
            const usingSnapshot = activeSignals.length === 0 && canUseSnapshot;
            const renderSignals = usingSnapshot ? validSnapshot : activeSignals;
            const minuteBucket = Math.floor(Date.now() / 60000);
            const renderKey = `${usingSnapshot ? 'snapshot' : 'live'}|${minuteBucket}|${renderSignals.map((item) => {
                const safePrice = Number(item.price || 0);
                const safeTs = Number(item.ts || 0);
                return `${item.symbol}:${item.direction}:${Number(item.confidence || 0)}:${safePrice.toFixed(8)}:${safeTs}:${item.fromNotified ? 1 : 0}:${item.snapshotId || ''}`;
            }).join('|')}`;
            const keepPreviousDuringHydration =
                _dashHydrating &&
                _dashActiveLastRenderKey &&
                _dashActiveLastRenderKey !== '__empty__' &&
                _dashActiveLastRenderKey !== '__hydrating__';

            if (renderSignals.length === 0) {
                if (keepPreviousDuringHydration) {
                    if (countEl) {
                        countEl.textContent = 'Atualizando sinais...';
                    }
                    return;
                }

                if (_dashHydrating) {
                    if (_dashActiveLastRenderKey !== '__hydrating__') {
                        container.innerHTML = `
                        <div class="dash-empty-state">
                            <i class="fas fa-circle-notch fa-spin" style="font-size:20px;margin-bottom:10px;opacity:0.8;"></i>
                            <div style="font-size:13px;font-weight:700;color:var(--text-secondary);margin-bottom:4px;">Sincronizando sinais...</div>
                            <div style="font-size:11px;">Carregando os dados sem piscar a tela.</div>
                        </div>`;
                        _dashActiveLastRenderKey = '__hydrating__';
                    }
                } else if (_dashActiveLastRenderKey !== '__empty__') {
                    container.innerHTML = `
                    <div class="dash-empty-state">
                        <i class="fas fa-satellite-dish" style="font-size:32px;margin-bottom:12px;opacity:0.2;"></i>
                        <div style="font-size:14px;font-weight:700;color:var(--text-secondary);margin-bottom:4px;">Nenhum sinal ativo</div>
                        <div style="font-size:12px;">Aparecem aqui os sinais notificados ainda validos (janela de 30 minutos).</div>
                    </div>`;
                    _dashActiveLastRenderKey = '__empty__';
                }
            } else if (_dashActiveLastRenderKey !== renderKey) {
                renderSignals.forEach((item) => {
                    const { symbol, crypto, direction, confidence, price, ts, validityLabel } = item;
                    const isLong = direction === 'LONG';
                    const dir = isLong ? 'long' : 'short';
                    const dirLabel = isLong ? 'LONG' : 'SHORT';
                    const dirEmoji = isLong ? '🟢' : '🔴';
                    const conf = confidence;
                    const priceStr = price ? (price >= 1 ? '$' + price.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '$' + price.toFixed(6)) : '';
                    const timeAgo = dashGetTimeAgo(ts || 0);
                    const clickSymbol = String(symbol || '').replace(/'/g, "\\'");

                    activeHtml += `
                    <div class="dash-signal-card ${dir}" role="button" tabindex="0" onclick="dashOpenSignalTechnical('${clickSymbol}')" onkeydown="if(event.key==='Enter'||event.key===' '||event.key==='Spacebar'){event.preventDefault();dashOpenSignalTechnical('${clickSymbol}');}">
                        <div class="dash-signal-head">
                            <img class="dash-signal-coin" src="${crypto.img || ''}" onerror="this.style.display='none'">
                            <div class="dash-signal-main">
                                <div class="dash-signal-title">${crypto.short || symbol} <span class="signal-badge ${dir}">${dirEmoji} ${dirLabel}</span></div>
                                <div class="dash-signal-sub">${crypto.name || symbol} · ${validityLabel || timeAgo}</div>
                            </div>
                            <div class="dash-signal-right">
                                <div class="dash-signal-conf" style="color: ${isLong ? '#22c55e' : '#ef4444'};">${conf}%</div>
                                <div class="dash-signal-price">${priceStr}</div>
                            </div>
                        </div>
                    </div>`;
                });

                container.innerHTML = usingSnapshot
                    ? `<div style="font-size:10px;color:var(--text-muted);display:flex;align-items:center;gap:6px;margin-bottom:8px;"><i class="fas fa-sync fa-spin" style="font-size:9px;color:#6366f1;"></i>Atualizando sinais...</div>${activeHtml}`
                    : activeHtml;
                _dashActiveLastRenderKey = renderKey;
            }
            if (countEl) {
                if (_dashHydrating && renderSignals.length === 0) {
                    countEl.textContent = 'Sincronizando sinais...';
                } else {
                    const totalShown = renderSignals.length;
                    countEl.textContent = totalShown + (totalShown === 1 ? ' sinal' : ' sinais') + ' · validos por 30m' + (usingSnapshot ? ' · atualizando' : '');
                }
            }
        }

        // ── Progressive TA scan state ──
        let _dashScanAbort = false;
        let _dashScanRunning = false;
        let _dashScanPromise = null;
        let _dashScanStartTimer = null;
        let _dashScanQueuedForce = false;
        let _dashScanQueuedReason = '';
        const DASH_SCAN_CACHE_KEY = 'vc_dash_ta_results';
        const DASH_SCAN_CACHE_TTL = 5 * 60 * 1000; // 5 min stale threshold for auto-rescan
        const DASH_CONFIDENCE_STALE_MS = 10 * 60 * 1000;
        const DASH_SYMBOL_SCAN_TIMEOUT_MS = 30000;

        function _getDashTAResults() {
            try { return JSON.parse(localStorage.getItem(DASH_SCAN_CACHE_KEY)) || {}; } catch { return {}; }
        }
        function _saveDashTAResults(data) {
            try { localStorage.setItem(DASH_SCAN_CACHE_KEY, JSON.stringify(data)); } catch {}
        }

        function _getDashboardConfidenceCoverage() {
            const dashResults = _getDashTAResults();
            const scanResults = getScanLastResults();
            const entries = Object.entries(typeof CRYPTO_DATABASE !== 'undefined' ? CRYPTO_DATABASE : {});
            let withConfidence = 0;
            let resolved = 0;
            let latestScan = 0;
            const now = Date.now();
            entries.forEach(([symbol]) => {
                const r = _resolveDashboardSignalData(symbol, scanResults, dashResults) || {};
                const conf = Number(r.confidence || r.finalConfidence || 0) || 0;
                const status = String(r.status || '').toLowerCase();
                const ts = Number(r.lastScanAt || r.lastAttemptAt || r.lastGoodAt || r.timestamp || r.time || 0) || 0;
                const isTerminal = conf > 0 || ts > 0 || status === 'ready' || status === 'unavailable' || r.unavailable === true;
                if (conf > 0) withConfidence++;
                if (isTerminal) resolved++;
                if (ts > latestScan) latestScan = ts;
            });
            const ageMs = latestScan > 0 ? Math.max(0, now - latestScan) : Number.POSITIVE_INFINITY;
            return {
                total: entries.length,
                withConfidence,
                resolved,
                missing: Math.max(0, entries.length - resolved),
                latestScan,
                ageMs,
                stale: entries.length > 0 && (latestScan <= 0 || ageMs > DASH_CONFIDENCE_STALE_MS),
                ratio: entries.length ? withConfidence / entries.length : 0
            };
        }

        function _isDashboardConfidenceStale(coverage = null) {
            const c = coverage || _getDashboardConfidenceCoverage();
            if (!c || !c.total) return false;
            return c.stale === true || c.latestScan <= 0 || (Date.now() - c.latestScan) > DASH_CONFIDENCE_STALE_MS;
        }

        function _setDashConfidenceUpdating(text = 'Atualizando sinais...') {
            const updatedEl = document.getElementById('dash-conf-updated');
            if (updatedEl) {
                updatedEl.innerHTML = `<i class="fas fa-circle-notch fa-spin" style="font-size:8px;margin-right:3px;"></i> ${text}`;
            }
        }

        function _dashRecoverStaleConfidence(reason = 'stale_confidence', options = {}) {
            const coverage = _getDashboardConfidenceCoverage();
            const stale = _isDashboardConfidenceStale(coverage);
            const lowCoverage = coverage.withConfidence === 0 || coverage.missing > 0;
            if (!stale && !lowCoverage) return false;

            _setDashConfidenceUpdating(options.statusText || 'Atualizando sinais...');
            syncNativeBackgroundResults({
                force: true,
                requestScanNow: true,
                maxAgeMs: DASH_CONFIDENCE_STALE_MS
            }).catch(() => false).finally(() => {
                const recentNativeRequest = Date.now() - Number(syncNativeBackgroundResults._lastScanNowRequestedAt || 0) < 5000;
                const nativeMeta = syncNativeBackgroundResults._lastNativeMeta || {};
                const delayMs = (recentNativeRequest || nativeMeta.scanInProgress === true)
                    ? Math.max(3500, Number(options.delayMs || 900) || 900)
                    : Math.max(250, Number(options.delayMs || 900) || 900);
                setTimeout(() => {
                    try {
                        const next = _getDashboardConfidenceCoverage();
                        const stillStale = _isDashboardConfidenceStale(next);
                        const stillLow = next.withConfidence === 0 || next.missing > 0;
                        if (stillStale || stillLow) {
                            _dashMaybeStartProgressiveScan(reason, {
                                force: stillStale || next.withConfidence === 0 || next.missing > 0,
                                delayMs: 0
                            });
                        }
                    } catch (_) {}
                }, delayMs);
            });
            return true;
        }

        function _hasUsableDashboardConfidence() {
            const coverage = _getDashboardConfidenceCoverage();
            return coverage.total > 0 && coverage.withConfidence > 0 && coverage.ratio >= 0.55;
        }

        function _isDashboardVisible() {
            const dashSection = document.getElementById('dashboard');
            return !!(dashSection && dashSection.classList.contains('active'));
        }

        let _signalsFreshnessPromise = null;
        let _signalsFreshnessLastStartedAt = 0;
        let _signalsRestrictionHintCount = 0;

        function _maybeShowSignalMonitorRestrictionHint(meta = {}) {
            try {
                const prefs = getSignalPrefs();
                if (!prefs.masterEnabled) return;
                const status = String(meta.status || '').toLowerCase();
                const ageMs = Number(meta.ageMs || 0) || 0;
                const suspicious = status === 'stuck' || status === 'offline' || (status === 'stale' && ageMs > 30 * 60 * 1000);
                if (!suspicious) {
                    _signalsRestrictionHintCount = 0;
                    return;
                }
                _signalsRestrictionHintCount++;
                if (_signalsRestrictionHintCount < 2) return;
                const detail = document.getElementById('dash-monitor-detail');
                if (detail) {
                    detail.textContent = (window.VisorI18n && typeof window.VisorI18n.t === 'function')
                        ? window.VisorI18n.t('monitorAndroidRestricted')
                        : 'Monitoramento pode estar restrito pelo Android';
                }
            } catch (_) {}
        }

        async function forceSignalsFreshness(reason = 'freshness', options = {}) {
            const force = options.force === true;
            const render = options.render !== false;
            const now = Date.now();
            if (_signalsFreshnessPromise) return _signalsFreshnessPromise;
            if (!force && _signalsFreshnessLastStartedAt && (now - _signalsFreshnessLastStartedAt) < 15000) {
                const coverage = _getDashboardConfidenceCoverage();
                if (!_isDashboardConfidenceStale(coverage) && coverage.missing === 0 && coverage.withConfidence > 0) {
                    return Promise.resolve(true);
                }
            }

            const initialCoverage = _getDashboardConfidenceCoverage();
            const needsRefresh = force ||
                _isDashboardConfidenceStale(initialCoverage) ||
                initialCoverage.missing > 0 ||
                initialCoverage.withConfidence === 0;
            if (!needsRefresh) return Promise.resolve(true);

            _signalsFreshnessLastStartedAt = now;
            _setDashConfidenceUpdating(options.statusText || 'Atualizando sinais...');

            _signalsFreshnessPromise = (async () => {
                let nativeChanged = false;
                try {
                    nativeChanged = await syncNativeBackgroundResults({
                        force: true,
                        requestScanNow: true,
                        maxAgeMs: DASH_CONFIDENCE_STALE_MS
                    });
                    _maybeShowSignalMonitorRestrictionHint(syncNativeBackgroundResults._lastNativeMeta || {});
                    if (nativeChanged && render) {
                        try { dashRenderActiveSignals(); dashRenderConfidenceGrid(); dashUpdateStats(); } catch (_) {}
                    }
                } catch (_) {}

                let snapshotOk = false;
                try {
                    snapshotOk = await dashFetchSignalSnapshot({
                        render: false,
                        forceAuth: force === true
                    });
                    if (snapshotOk && render) {
                        try { dashRenderActiveSignals(); dashRenderConfidenceGrid(); dashUpdateStats(); } catch (_) {}
                    }
                } catch (_) {}

                const coverage = _getDashboardConfidenceCoverage();
                const stale = _isDashboardConfidenceStale(coverage);
                const incomplete = coverage.missing > 0 || coverage.withConfidence === 0;
                if (stale || incomplete || !snapshotOk) {
                    const nativeMeta = syncNativeBackgroundResults._lastNativeMeta || {};
                    const recentNativeRequest = Date.now() - Number(syncNativeBackgroundResults._lastScanNowRequestedAt || 0) < 6500;
                    const shouldWaitNative = nativeMeta.scanInProgress === true || recentNativeRequest;
                    if (shouldWaitNative) {
                        setTimeout(() => {
                            try {
                                const next = _getDashboardConfidenceCoverage();
                                if (_isDashboardConfidenceStale(next) || next.missing > 0 || next.withConfidence === 0) {
                                    ensureDashboardConfidenceScan(`${reason}_native_followup`, {
                                        force: true,
                                        statusText: 'Atualizando sinais...'
                                    });
                                }
                            } catch (_) {}
                        }, Math.max(3500, Number(options.followupDelayMs || 3500) || 3500));
                    } else {
                        ensureDashboardConfidenceScan(reason || 'freshness_scan', {
                            force: true,
                            statusText: 'Atualizando sinais...'
                        });
                    }
                } else {
                    const updatedEl = document.getElementById('dash-conf-updated');
                    if (updatedEl && render) {
                        updatedEl.textContent = coverage.latestScan > 0 ? 'Atualizado ' + dashGetTimeAgo(coverage.latestScan) : 'Atualizado agora';
                    }
                }
                return true;
            })().catch((err) => {
                try {
                    ensureDashboardConfidenceScan(`${reason}_error`, {
                        force: true,
                        statusText: 'Atualizando sinais...'
                    });
                } catch (_) {}
                console.warn('[SignalsFreshness] failed:', err?.message || err);
                return false;
            }).finally(() => {
                _signalsFreshnessPromise = null;
            });

            return _signalsFreshnessPromise;
        }

        function ensureDashboardConfidenceScan(reason = 'fallback', options = {}) {
            _dashScanAbort = false;
            const updatedEl = document.getElementById('dash-conf-updated');
            if (updatedEl) {
                updatedEl.innerHTML = `<i class="fas fa-circle-notch fa-spin" style="font-size:8px;margin-right:3px;"></i> ${options.statusText || 'Analisando sinais...'}`;
            }

            if (_dashScanRunning || _dashScanPromise) {
                if (options.force === true) {
                    _dashScanQueuedForce = true;
                    _dashScanQueuedReason = reason || _dashScanQueuedReason || 'queued_refresh';
                }
                return _dashScanPromise || Promise.resolve(true);
            }

            _dashScanPromise = Promise.resolve()
                .then(() => dashProgressiveScan({ ...options, reason }))
                .catch((err) => {
                    console.warn('[DashboardScan] scan failed:', err?.message || err);
                    return false;
                })
                .finally(() => {
                    _dashScanPromise = null;
                    if (_dashScanQueuedForce) {
                        const nextReason = _dashScanQueuedReason || 'queued_refresh';
                        _dashScanQueuedForce = false;
                        _dashScanQueuedReason = '';
                        return ensureDashboardConfidenceScan(nextReason, { force: true, delayMs: 0 });
                    }
                });
            return _dashScanPromise;
        }

        function _dashMaybeStartProgressiveScan(reason = 'fallback', options = {}) {
            const coverage = _getDashboardConfidenceCoverage();
            const force = options.force === true || coverage.withConfidence === 0 || coverage.missing > 0;
            const delayMs = Math.max(0, Number(options.delayMs ?? 250) || 0);
            _dashScanAbort = false;

            if (_dashScanRunning || _dashScanPromise) {
                if (force) {
                    _dashScanQueuedForce = true;
                    _dashScanQueuedReason = reason || _dashScanQueuedReason || 'queued_refresh';
                }
                _setDashConfidenceUpdating(options.statusText || 'Analisando sinais...');
                return true;
            }

            if (_dashScanStartTimer) {
                clearTimeout(_dashScanStartTimer);
                _dashScanStartTimer = null;
            }
            _setDashConfidenceUpdating(options.statusText || 'Analisando sinais...');
            _dashScanStartTimer = setTimeout(() => {
                _dashScanStartTimer = null;
                try {
                    ensureDashboardConfidenceScan(reason, { ...options, force });
                } catch (_) {}
            }, delayMs);
            return true;
        }

        function _buildDashboardScanFallback(previous, error) {
            const prev = (previous && typeof previous === 'object') ? previous : {};
            const confidence = Math.max(0, Math.min(100, Math.round(Number(prev.finalConfidence || prev.confidence || 0) || 0)));
            const direction = confidence >= 50
                ? _normalizeSignalDirection(prev.finalDirection || prev.direction || prev.signal)
                : 'NEUTRO';
            const lastGoodAt = Number(prev.lastGoodAt || prev.finalUpdatedAt || prev.lastScanAt || prev._eventTs || prev.notifiedAt || prev.lastNotifiedAt || prev.timestamp || prev.time || 0) || 0;
            const hasPreviousGood = confidence > 0 && lastGoodAt > 0;
            const now = Date.now();

            if (hasPreviousGood) {
                return {
                    ...prev,
                    signal: direction,
                    direction,
                    finalDirection: direction,
                    confidence,
                    finalConfidence: confidence,
                    status: 'ready',
                    unavailable: false,
                    _updating: false,
                    _staleWhileRefreshing: true,
                    errorReason: String(error?.message || 'falha temporaria'),
                    lastAttemptAt: now,
                    lastScanAt: Number(prev.lastScanAt || lastGoodAt) || lastGoodAt,
                    lastGoodAt
                };
            }

            return {
                ...prev,
                signal: 'NEUTRO',
                direction: 'NEUTRO',
                finalDirection: 'NEUTRO',
                confidence: 0,
                finalConfidence: 0,
                status: 'unavailable',
                unavailable: true,
                _updating: false,
                errorReason: String(error?.message || 'falha temporaria'),
                lastAttemptAt: now,
                lastScanAt: now
            };
        }

        function _storeDashboardFallback(symbol, data, dashResults, scanResults, error) {
            const previous = _resolveDashboardSignalData(symbol, scanResults, dashResults) || {};
            const fallbackData = _buildDashboardScanFallback(previous, error);
            dashResults[symbol] = fallbackData;

            if (!scanResults[symbol]) scanResults[symbol] = {};
            scanResults[symbol].signal = fallbackData.signal;
            scanResults[symbol].direction = fallbackData.direction;
            scanResults[symbol].finalDirection = fallbackData.finalDirection;
            scanResults[symbol].confidence = fallbackData.confidence;
            scanResults[symbol].finalConfidence = fallbackData.finalConfidence;
            scanResults[symbol].price = fallbackData.price || scanResults[symbol].price || 0;
            scanResults[symbol].status = fallbackData.status;
            scanResults[symbol].unavailable = fallbackData.unavailable === true;
            scanResults[symbol]._updating = false;
            scanResults[symbol]._loading = false;
            scanResults[symbol].errorReason = fallbackData.errorReason || '';
            scanResults[symbol].lastScanAt = fallbackData.lastScanAt;
            scanResults[symbol].lastAttemptAt = fallbackData.lastAttemptAt || fallbackData.lastScanAt;
            if (fallbackData.lastGoodAt) scanResults[symbol].lastGoodAt = fallbackData.lastGoodAt;

            const cell = document.getElementById(`dash-conf-${symbol}`);
            if (cell && data) {
                cell.outerHTML = _confCellHtml(symbol, data, fallbackData);
            }
            return fallbackData;
        }

        function _finalizePendingDashboardCells(dashResults, scanResults, reason = 'scan_finalized') {
            if (typeof CRYPTO_DATABASE === 'undefined') return 0;
            let fixed = 0;
            Object.entries(CRYPTO_DATABASE).forEach(([symbol, data]) => {
                const current = _resolveDashboardSignalData(symbol, scanResults, dashResults) || {};
                const status = String(current.status || '').toLowerCase();
                const conf = Number(current.confidence || current.finalConfidence || 0) || 0;
                const ts = Number(current.lastScanAt || current.lastAttemptAt || current.lastGoodAt || current.timestamp || current.time || 0) || 0;
                const unresolved = (
                    current._loading === true ||
                    current._updating === true ||
                    status === 'updating' ||
                    (!conf && !ts && status !== 'unavailable' && current.unavailable !== true)
                );
                if (!unresolved) return;
                _storeDashboardFallback(symbol, data, dashResults, scanResults, new Error(reason));
                fixed++;
            });
            return fixed;
        }

        // Render a single cell's HTML
        function _confCellHtml(symbol, data, r) {
            r = r || {};
            const status = String(r.status || '').toLowerCase();
            const unavailable = status === 'unavailable' || r.unavailable === true;
            const conf = Math.max(0, Math.min(100, Math.round(Number(r.confidence || 0) || 0)));
            const signal = String(r.signal || '').toUpperCase();
            const direction = String(r.direction || r.finalDirection || '').toUpperCase();
            const isLong = !unavailable && conf >= 50 && (direction === 'LONG' || signal.includes('LONG'));
            const isShort = !unavailable && conf >= 50 && (direction === 'SHORT' || signal.includes('SHORT'));
            const hasData = !unavailable && conf > 0;
            const canShowTransient = _dashScanRunning || _dashHydrating;
            const updating = canShowTransient && (status === 'updating' || r._updating === true) && !hasData;
            const loading = canShowTransient && r._loading === true;

            let confColor = 'var(--text-muted)';
            if (unavailable) confColor = 'var(--text-muted)';
            else if (conf >= 80) confColor = '#22c55e';
            else if (conf >= 65) confColor = '#f59e0b';
            else if (conf >= 40) confColor = '#6366f1';

            let signalText, signalColor;
            if (loading) {
                signalText = '<i class="fas fa-circle-notch fa-spin" style="font-size:8px;margin-right:3px;"></i>Analisando...';
                signalColor = '#6366f1';
            } else if (updating) {
                signalText = '<i class="fas fa-circle-notch fa-spin" style="font-size:8px;margin-right:3px;"></i>Atualizando...';
                signalColor = '#6366f1';
            } else if (unavailable) {
                signalText = 'Carregando...';
                signalColor = 'var(--text-muted)';
            } else if (hasData && (isLong || isShort)) {
                signalText = isLong ? '▲ LONG' : '▼ SHORT';
                signalColor = isLong ? '#22c55e' : '#ef4444';
            } else if (hasData) {
                signalText = '● NEUTRO';
                signalColor = '#f59e0b';
            } else {
                signalText = 'Carregando...';
                signalColor = 'var(--text-muted)';
            }

            return `
            <div class="dash-conf-cell" id="dash-conf-${symbol}">
                <img src="${data.img}" style="width:26px;height:26px;border-radius:50%;flex-shrink:0;" onerror="this.style.display='none'">
                <div style="flex:1;min-width:0;">
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:3px;">
                        <span style="font-size:11px;font-weight:700;color:var(--text-primary);">${data.short}</span>
                        <span style="font-size:11px;font-weight:800;color:${confColor};">${hasData ? conf + '%' : '...'}</span>
                    </div>
                    <div class="conf-bar-track"><div class="conf-bar-fill" style="width:${conf}%;background:${confColor};transition:width 0.6s ease;"></div></div>
                    <div style="font-size:9px;color:${signalColor};font-weight:700;margin-top:3px;">${signalText}</div>
                </div>
            </div>`;
        }

        function dashRenderConfidenceGrid() {
            const grid = document.getElementById('dash-confidence-grid');
            if (!grid || typeof CRYPTO_DATABASE === 'undefined') return;

            // Merge: use same source logic as active signals, preserving notified snapshots.
            const dashResults = _getDashTAResults();
            const scanResults = getScanLastResults();
            let html = '';
            let latestScan = 0;
            let hasMissing = false;
            let withConfidence = 0;
            const totalSymbols = Object.keys(CRYPTO_DATABASE).length;

            Object.entries(CRYPTO_DATABASE).forEach(([symbol, data]) => {
                const r = _resolveDashboardSignalData(symbol, scanResults, dashResults);
                const ts = r.lastScanAt || 0;
                const conf = Number(r.confidence || r.finalConfidence || 0) || 0;
                if (ts > latestScan) latestScan = ts;
                if (conf > 0) withConfidence++;
                if (!conf && !ts) hasMissing = true;
                html += _confCellHtml(symbol, data, r);
            });

            grid.innerHTML = html;

            const updatedEl = document.getElementById('dash-conf-updated');
            if (updatedEl) {
                if (_dashScanRunning) {
                    updatedEl.innerHTML = '<i class="fas fa-circle-notch fa-spin" style="font-size:8px;margin-right:3px;"></i> Analisando sinais...';
                } else if (_dashHydrating || (totalSymbols > 0 && (latestScan <= 0 || (Date.now() - latestScan) > DASH_CONFIDENCE_STALE_MS))) {
                    updatedEl.innerHTML = '<i class="fas fa-circle-notch fa-spin" style="font-size:8px;margin-right:3px;"></i> Atualizando sinais...';
                } else {
                    updatedEl.textContent = latestScan > 0 ? 'Atualizado ' + dashGetTimeAgo(latestScan) : 'Sincronizando...';
                }
            }

            if (_dashScanRunning) return;

            // Prefer the all-symbol remote snapshot so SINAIS opens instantly.
            const oldest = latestScan || 0;
            const confidenceStale = totalSymbols > 0 && (oldest <= 0 || (Date.now() - oldest) > DASH_CONFIDENCE_STALE_MS);
            const remoteSnapshotFresh = _lastRemoteSnapshotFetchedAt > 0 && (Date.now() - _lastRemoteSnapshotFetchedAt) < SIGNALS_REMOTE_SNAPSHOT_TTL;
            const shouldFetchRemote = (hasMissing || confidenceStale || (Date.now() - oldest > DASH_SCAN_CACHE_TTL))
                && !(remoteSnapshotFresh && _lastRemoteSnapshotComplete);
            if (shouldFetchRemote) {
                const hadCachedSnapshot = hydrateSignalSnapshotCache();
                dashFetchSignalSnapshot({ render: false })
                    .then((ok) => {
                        const coverage = _getDashboardConfidenceCoverage();
                        const usable = coverage.total > 0 && coverage.missing === 0 && (coverage.withConfidence > 0 || coverage.resolved === coverage.total);
                        const stale = _isDashboardConfidenceStale(coverage);
                        if (!ok || stale || !usable || coverage.missing > 0) {
                            const reason = ok ? 'snapshot_incomplete' : 'snapshot_failed';
                            if (stale) {
                                _dashRecoverStaleConfidence(reason, { delayMs: ok && hadCachedSnapshot ? 900 : 250 });
                            } else {
                                _dashMaybeStartProgressiveScan(reason, {
                                    force: coverage.missing > 0 || coverage.withConfidence === 0,
                                    delayMs: ok && hadCachedSnapshot ? 900 : 250
                                });
                            }
                        } else if (updatedEl) {
                            updatedEl.textContent = coverage.latestScan > 0 ? 'Atualizado ' + dashGetTimeAgo(coverage.latestScan) : 'Atualizado agora';
                        }
                    })
                    .catch(() => {
                        if (confidenceStale) {
                            _dashRecoverStaleConfidence('snapshot_error', { delayMs: hadCachedSnapshot ? 900 : 250 });
                        } else {
                            _dashMaybeStartProgressiveScan('snapshot_error', {
                                force: withConfidence === 0,
                                delayMs: hadCachedSnapshot ? 900 : 250
                            });
                        }
                    });
            } else if (totalSymbols > 0 && withConfidence === 0) {
                _dashMaybeStartProgressiveScan('empty_grid', { force: true, delayMs: 250 });
            } else if (confidenceStale) {
                _dashRecoverStaleConfidence('stale_grid_render', { delayMs: 900 });
            }
        }

        /**
         * Progressive TA scan — runs the EXACT same analysis pipeline as the HOME technical analysis.
         * Processes one crypto at a time, updating each grid cell as results arrive.
         * Uses TA cache to avoid re-fetching if the user already opened that crypto recently.
         */
        async function dashProgressiveScan(options = {}) {
            if (_dashScanRunning) {
                if (options && options.force === true) _dashScanQueuedForce = true;
                return _dashScanPromise || true;
            }
            _dashScanRunning = true;
            _dashScanAbort = false;
            window._taScanContext = true;
            const forceRescan = options && options.force === true;

            const cryptos = Object.entries(typeof CRYPTO_DATABASE !== 'undefined' ? CRYPTO_DATABASE : {});
            const dashResults = _getDashTAResults();
            const scanResults = getScanLastResults();
            const now = Date.now();

            const updatedEl = document.getElementById('dash-conf-updated');
            const failedScans = new Map();
            let analyzedCount = 0;
            const totalSymbols = cryptos.length;

            function _withSymbolScanTimeout(symbol, taskPromise) {
                let timeoutId = null;
                const timeoutPromise = new Promise((_, reject) => {
                    timeoutId = setTimeout(() => {
                        reject(new Error(`timeout scanning ${symbol}`));
                    }, DASH_SYMBOL_SCAN_TIMEOUT_MS);
                });
                return Promise.race([taskPromise, timeoutPromise])
                    .finally(() => {
                        if (timeoutId) clearTimeout(timeoutId);
                    });
            }

            // Helper to process a single crypto
            async function _scanOneCrypto(symbol, data) {
                let analysis = null;

                // 1. Check TA cache first
                const cached = typeof getTACache === 'function' ? getTACache(symbol) : null;
                if (cached && cached.analysis) {
                    analysis = cached.analysis;
                } else {
                    // 2. Run TA pipeline (skip expensive V2 macro layer for speed)
                    const analysisData = await fetchTechnicalAnalysisData(symbol);
                    if (!analysisData) throw new Error('no data');

                    analysis = generateTechnicalAnalysis(analysisData, symbol);

                    // V3 Enhancement
                    if (window.TAEngineV3 && window.TAEngineV3.enhanceAnalysis) {
                        try {
                            const enhanced = await window.TAEngineV3.enhanceAnalysis(analysis, analysisData, symbol);
                            Object.assign(analysis, enhanced);
                        } catch {}
                    }

                    // V4 Enhancement
                    if (window.TAEngineV4 && window.TAEngineV4.enhanceWithReactive) {
                        try {
                            const v4Enhanced = await window.TAEngineV4.enhanceWithReactive(analysis, analysisData, symbol);
                            Object.assign(analysis, v4Enhanced);
                        } catch {}
                    }

                    // Cache for future use
                    if (typeof setTACache === 'function') setTACache(symbol, { analysis });
                }

                const resolved = _resolveScanSignal(analysis);
                if (typeof setTACache === 'function') {
                    try { setTACache(symbol, { analysis }); } catch (_) {}
                }

                return {
                    signal: resolved.signal,
                    confidence: resolved.confidence,
                    direction: resolved.direction,
                    finalDirection: resolved.direction,
                    finalConfidence: resolved.confidence,
                    lastScanAt: Date.now(),
                    price: analysis.indicators?.movingAverages?.currentPrice || 0,
                    gates: analysis.v4GatesPassed ? `${analysis.v4GatesPassed}/${analysis.v4GatesTotal || 9}` : null,
                    analysisSnapshot: analysis
                };
            }

            async function _applyScanResult(symbol, data, result) {
                const resultAnalysis = result.analysisSnapshot;
                delete result.analysisSnapshot;
                const minConf = getCryptoMinConfidence(symbol);
                const quality = _isReliableSignalForNotification(resultAnalysis, minConf, result, symbol, result.price || 0);
                let signalSnapshot = null;
                if (isCryptoNotificationEnabled(symbol) && quality.ok) {
                    const reason = `${result.direction} ${result.confidence}% (min ${minConf}%) - Scan Dashboard`;
                    signalSnapshot = cacheSignalAnalysisSnapshot(symbol, {
                        analysis: resultAnalysis,
                        direction: result.direction,
                        confidence: result.confidence,
                        price: result.price || 0,
                        reason,
                        gates: result.gates || '',
                        minConfidence: minConf,
                        notifiedAt: result.lastScanAt,
                        source: 'dashboard_scan'
                    });
                    result.snapshotId = signalSnapshot?.id || '';
                    result.expiresAt = signalSnapshot?.expiresAt || 0;
                    dashRecordCall(symbol, result.direction, result.confidence, result.gates || '', result.price || 0, reason, {
                        snapshotId: signalSnapshot?.id || '',
                        notifiedAt: signalSnapshot?.notifiedAt || result.lastScanAt,
                        expiresAt: signalSnapshot?.expiresAt || (result.lastScanAt + ACTIVE_SIGNAL_VALIDITY_MS),
                        source: 'dashboard_scan'
                    });
                }

                result.status = 'ready';
                result.lastGoodAt = result.lastScanAt;
                result.qualityRejected = quality.ok && !quality.qualityOk;
                result.qualityReason = quality.qualityReason || '';
                dashResults[symbol] = result;

                if (!scanResults[symbol]) scanResults[symbol] = {};
                scanResults[symbol].signal = result.signal;
                scanResults[symbol].direction = result.direction;
                scanResults[symbol].finalDirection = result.direction;
                scanResults[symbol].confidence = result.confidence;
                scanResults[symbol].finalConfidence = result.confidence;
                scanResults[symbol].price = result.price;
                scanResults[symbol].lastScanAt = result.lastScanAt;
                scanResults[symbol].lastGoodAt = result.lastGoodAt;
                scanResults[symbol].status = 'ready';
                scanResults[symbol].qualityRejected = quality.ok && !quality.qualityOk;
                scanResults[symbol].qualityReason = quality.qualityReason || '';
                if (signalSnapshot) {
                    scanResults[symbol].snapshotId = signalSnapshot.id;
                    scanResults[symbol].expiresAt = signalSnapshot.expiresAt;
                    scanResults[symbol].notifiedAt = result.lastScanAt;
                    scanResults[symbol].lastNotifiedAt = result.lastScanAt;
                    scanResults[symbol].lastNotifiedSignal = result.direction;
                    scanResults[symbol].lastNotifiedDirection = result.direction;
                    scanResults[symbol].lastNotifiedConfidence = result.confidence;
                    scanResults[symbol].lastNotifiedPrice = result.price || 0;
                    scanResults[symbol].lastNotifiedReason = `${result.direction} ${result.confidence}% (min ${minConf}%) - Scan Dashboard`;
                }

                const updatedCell = document.getElementById(`dash-conf-${symbol}`);
                if (updatedCell) {
                    const renderData = _resolveDashboardSignalData(symbol, scanResults, dashResults);
                    updatedCell.outerHTML = _confCellHtml(symbol, data, renderData);
                }
            }

            try {
            // Filter cryptos that need scanning
            const toScan = cryptos.filter(([symbol]) => {
                if (_isSymbolConfidenceFrozen(symbol, scanResults, now)) {
                    return false;
                }
                if (forceRescan) return true;
                const existing = dashResults[symbol];
                const existingTs = Number(existing?.lastScanAt || existing?.lastAttemptAt || 0) || 0;
                const existingTerminal = Number(existing?.confidence || existing?.finalConfidence || 0) > 0 ||
                    existing?.status === 'ready' ||
                    existing?.status === 'unavailable' ||
                    existing?.unavailable === true;
                return !(existingTerminal && existingTs && (now - existingTs < DASH_SCAN_CACHE_TTL));
            });

            if (toScan.length === 0) {
                _dashScanRunning = false;
                window._taScanContext = false;
                if (updatedEl) updatedEl.textContent = 'Atualizado agora';
                return;
            }

            // Mostra loading apenas para itens sem dado previo (evita piscar seco a cada refresh).
            toScan.forEach(([symbol, data]) => {
                const cell = document.getElementById(`dash-conf-${symbol}`);
                const previous = (dashResults[symbol] && dashResults[symbol].confidence) ? dashResults[symbol] : (scanResults[symbol] || {});
                if (cell && !Number(previous.confidence || 0)) {
                    cell.outerHTML = _confCellHtml(symbol, data, { _loading: true });
                }
            });

            // Process in small batches so mobile/network throttling does not leave cells stuck.
            const BATCH_SIZE = 2;
            for (let i = 0; i < toScan.length; i += BATCH_SIZE) {
                if (_dashScanAbort) break;

                const batch = toScan.slice(i, i + BATCH_SIZE);
                if (updatedEl) {
                    const names = batch.map(([,d]) => d.short).join(', ');
                    updatedEl.innerHTML = `<i class="fas fa-circle-notch fa-spin" style="font-size:8px;margin-right:3px;"></i> Analisando ${analyzedCount}/${totalSymbols} (${names})`;
                }

                await Promise.allSettled(
                    batch.map(async ([symbol, data]) => {
                        try {
                            const result = await _withSymbolScanTimeout(symbol, _scanOneCrypto(symbol, data));
                            await _applyScanResult(symbol, data, result);
                            analyzedCount++;
                        } catch (err) {
                            failedScans.set(symbol, data);
                            _storeDashboardFallback(symbol, data, dashResults, scanResults, err);
                        }
                    })
                );

                _saveDashTAResults(dashResults);
                saveScanLastResults(scanResults);
                pushAuthoritativeResultsToNative().catch(() => {});
                try { dashRenderActiveSignals(); } catch {}
                if (updatedEl) {
                    updatedEl.innerHTML = `<i class="fas fa-circle-notch fa-spin" style="font-size:8px;margin-right:3px;"></i> Analisando ${Math.min(analyzedCount, totalSymbols)}/${totalSymbols}`;
                }

                // Short delay between batches
                if (!_dashScanAbort && i + BATCH_SIZE < toScan.length) {
                    await new Promise(r => setTimeout(r, 800));
                }
            }

            if (!_dashScanAbort && failedScans.size > 0) {
                if (updatedEl) {
                    updatedEl.innerHTML = `<i class="fas fa-circle-notch fa-spin" style="font-size:8px;margin-right:3px;"></i> Rechecando ${failedScans.size} criptos...`;
                }
                for (const [symbol, data] of failedScans) {
                    try {
                        const result = await _withSymbolScanTimeout(symbol, _scanOneCrypto(symbol, data));
                        await _applyScanResult(symbol, data, result);
                        analyzedCount++;
                        failedScans.delete(symbol);
                    } catch (retryErr) {
                        _storeDashboardFallback(symbol, data, dashResults, scanResults, retryErr);
                    }
                }
                _saveDashTAResults(dashResults);
                saveScanLastResults(scanResults);
            }

            } finally {
            _dashScanRunning = false;
            window._taScanContext = false;
            const fixedPending = _finalizePendingDashboardCells(dashResults, scanResults, 'scan_finished_without_result');
            if (fixedPending > 0) {
                _saveDashTAResults(dashResults);
                saveScanLastResults(scanResults);
            }
            pushAuthoritativeResultsToNative(true).catch(() => {});

            // Disconnect all WebSockets opened during scan to prevent memory leak
            try { if (window.TAEngineV4 && window.TAEngineV4.disconnectAllOrderFlowWS) window.TAEngineV4.disconnectAllOrderFlowWS(); } catch(e) {}
            try { if (window.RealtimeCVD && window.RealtimeCVD.disconnectAll) window.RealtimeCVD.disconnectAll(); } catch(e) {}

            // Final update
            if (updatedEl) {
                updatedEl.textContent = 'Atualizado agora';
            }

            // Update active signals with new data
            try { dashRenderConfidenceGrid(); dashRenderActiveSignals(); dashUpdateStats(); } catch {}
            try { if (typeof _scheduleDashOutcomeQueue === 'function') _scheduleDashOutcomeQueue(1200); } catch {}
            }
        }

        function dashRefreshConfidence() {
            const updatedEl = document.getElementById('dash-conf-updated');
            if (updatedEl) {
                updatedEl.innerHTML = '<i class="fas fa-circle-notch fa-spin" style="font-size:8px;margin-right:3px;"></i> Atualizando sinais...';
            }
            forceSignalsFreshness('manual_refresh', {
                force: true,
                render: true,
                statusText: 'Atualizando sinais...'
            });
            try { dashRenderHistory(); } catch {}
        }

        // Auto-refresh confidence every 5 min while the app is open.
        let _dashConfAutoRefreshId = null;
        let _dashNativeWarmupTimers = [];

        function dashClearNativeWarmupSync() {
            _dashNativeWarmupTimers.forEach((id) => {
                try { clearTimeout(id); } catch (_) {}
            });
            _dashNativeWarmupTimers = [];
        }

        function dashScheduleNativeWarmupSync() {
            dashClearNativeWarmupSync();
            [650, 1700, 3000].forEach((delayMs) => {
                const t = setTimeout(() => {
                    try {
                        const dashSection = document.getElementById('dashboard');
                        const isDashActive = !!(dashSection && dashSection.classList.contains('active'));

                        syncNativeBackgroundResults({ force: true, requestScanNow: true, maxAgeMs: DASH_CONFIDENCE_STALE_MS })
                            .catch(() => false)
                            .finally(() => {
                                if (!isDashActive) return;
                                try {
                                    dashRenderActiveSignals();
                                    dashRenderConfidenceGrid();
                                    dashUpdateStats();
                                } catch (_) {}
                            });
                    } catch (_) {}
                }, delayMs);
                _dashNativeWarmupTimers.push(t);
            });
        }

        function dashStartConfAutoRefresh() {
            dashStopConfAutoRefresh();
            _dashConfAutoRefreshId = setInterval(() => {
                if (document.hidden) return;
                forceSignalsFreshness('visible_auto_refresh', {
                    force: false,
                    render: _isDashboardVisible(),
                    statusText: 'Atualizando sinais...'
                });
            }, 5 * 60 * 1000); // 5 min
        }
        function dashStopConfAutoRefresh() {
            if (_dashConfAutoRefreshId) {
                clearInterval(_dashConfAutoRefreshId);
                _dashConfAutoRefreshId = null;
            }
        }

        // Keep normal navigation from canceling the confidence job. Use { force: true } only for shutdown/reload.
        function dashAbortScan(options = {}) {
            if (!options || options.force !== true) {
                dashClearNativeWarmupSync();
                return;
            }
            _dashScanAbort = true;
            if (_dashScanStartTimer) {
                clearTimeout(_dashScanStartTimer);
                _dashScanStartTimer = null;
            }
            window._taScanContext = false;
            dashStopConfAutoRefresh();
            dashClearNativeWarmupSync();
            // Cleanup any WebSockets opened during scan
            try { if (window.TAEngineV4 && window.TAEngineV4.disconnectAllOrderFlowWS) window.TAEngineV4.disconnectAllOrderFlowWS(); } catch(e) {}
            try { if (window.RealtimeCVD && window.RealtimeCVD.disconnectAll) window.RealtimeCVD.disconnectAll(); } catch(e) {}
        }

        function dashRenderHistory() {
            const container = document.getElementById('dash-history-list');
            if (!container) return;

            document.querySelectorAll('.dash-hist-filter').forEach((el) => {
                const isActive = String(el.dataset.filter || '').toLowerCase() === dashHistoryFilter;
                el.classList.toggle('active', isActive);
            });

            // Show local data immediately. Warmup/sync is scheduled explicitly by app events.
            _dashRenderHistoryFromData(dashGetHistory());
        }

          const DASH_OUTCOME_CACHE_KEY = 'VISOR_CALL_OUTCOME_CACHE_V3';
          const DASH_OUTCOME_LEGACY_CACHE_KEY = 'VISOR_CALL_OUTCOME_CACHE_V2';
          try { localStorage.removeItem(DASH_OUTCOME_LEGACY_CACHE_KEY); } catch (_) {}
          const DASH_OUTCOME_HORIZONS = [
              { key: '1h', label: '1H', ms: 60 * 60 * 1000 },
              { key: '2h', label: '2H', ms: 2 * 60 * 60 * 1000 },
              { key: '4h', label: '4H', ms: 4 * 60 * 60 * 1000 }
          ];
          const DASH_OUTCOME_RETRY_MS = 2 * 60 * 1000;
          const DASH_USDM_HOSTS = [
              'https://fapi.binance.com',
              'https://fapi1.binance.com',
              'https://fapi2.binance.com',
              'https://fapi3.binance.com'
          ];
          const DASH_USDM_CONTRACT_ALIASES = {
              SHIBUSDT: { contractSymbol: '1000SHIBUSDT', priceScale: 1000 },
              PEPEUSDT: { contractSymbol: '1000PEPEUSDT', priceScale: 1000 }
          };
          const _pnlCache = (() => {
              try { return JSON.parse(localStorage.getItem(DASH_OUTCOME_CACHE_KEY) || '{}'); }
              catch { return {}; }
          })();
          const DASH_OUTCOME_QUEUE_IDLE_DELAY_MS = 1800;
          const DASH_OUTCOME_QUEUE_BUSY_DELAY_MS = 5000;
          const DASH_OUTCOME_QUEUE_MAX_CALLS_PER_DRAIN = 2;
          let _dashOutcomeQueue = [];
          let _dashOutcomeQueuedKeys = new Set();
          let _dashOutcomeRunning = false;
          let _dashOutcomeTimer = null;

          function _normalizeBinanceSymbol(raw) {
              const cleaned = String(raw || '').toUpperCase().replace(/[\/-]/g, '');
              if (!cleaned) return '';
              return cleaned.endsWith('USDT') ? cleaned : `${cleaned}USDT`;
          }

          function _getDashUsdmContractSpec(rawSymbol) {
              const appSymbol = _normalizeBinanceSymbol(rawSymbol);
              if (!appSymbol) return null;
              const alias = DASH_USDM_CONTRACT_ALIASES[appSymbol] || {};
              return {
                  appSymbol,
                  contractSymbol: alias.contractSymbol || appSymbol,
                  priceScale: Number(alias.priceScale || 1) || 1
              };
          }

          function _normalizeDashUsdmPrice(rawSymbol, rawPrice) {
              const spec = _getDashUsdmContractSpec(rawSymbol);
              const price = Number(rawPrice);
              if (!spec || !Number.isFinite(price) || price <= 0) return 0;
              return price / spec.priceScale;
          }

          function _formatUsdCompact(value) {
              const n = Number(value);
              if (!Number.isFinite(n) || n <= 0) return '--';
              if (n >= 1000) return '$' + n.toLocaleString(undefined, { maximumFractionDigits: 2 });
              if (n >= 1) return '$' + n.toFixed(4);
              return '$' + n.toFixed(6);
          }

          function _getCallHistoryDomId(call) {
              const raw = _getDashCallKey(call) || call?.callKey || (
                  call?.id != null
                      ? String(call.id)
                      : `${call?.symbol || 'call'}-${Number(call?.time || call?.timestamp || 0)}`
              );
              return raw.replace(/[^a-zA-Z0-9_-]/g, '_');
          }

          function _sanitizeText(value) {
              return String(value || '')
                  .replace(/&/g, '&amp;')
                  .replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;')
                  .replace(/"/g, '&quot;')
                  .replace(/'/g, '&#39;');
          }

          function _persistOutcomeCache() {
              try { localStorage.setItem(DASH_OUTCOME_CACHE_KEY, JSON.stringify(_pnlCache)); } catch (e) {}
          }

          function _persistDashOutcomeToHistory(call, cacheEntry) {
              try {
                  const callTime = Number(call?.time || call?.timestamp || 0);
                  const entryPrice = Number(call?.price || call?.entryPrice || 0);
                  const direction = String(call?.direction || '').toUpperCase();
                  const symbol = _normalizeBinanceSymbol(call?.symbol);
                  if (!callTime || !entryPrice || !symbol || (direction !== 'LONG' && direction !== 'SHORT')) return;

                  const localHistory = dashGetHistory();
                  const target = localHistory.find((item) => {
                      const itemTime = Number(item?.time || item?.timestamp || 0);
                      return _normalizeBinanceSymbol(item?.symbol) === symbol &&
                          String(item?.direction || '').toUpperCase() === direction &&
                          Math.abs(itemTime - callTime) <= 5000;
                  });
                  if (!target) return;
                  if (_hasTrustedDashSettlement(target)) return;

                  target.prices = target.prices || { '1h': null, '2h': null, '4h': null };
                  target.pnl = target.pnl || { '1h': null, '2h': null, '4h': null };
                  target.checked = target.checked || { '1h': false, '2h': false, '4h': false };

                  let changed = false;
                  DASH_OUTCOME_HORIZONS.forEach((h) => {
                      const cachedHorizon = cacheEntry?.horizons?.[h.key] || {};
                      const horizonPrice = Number(cachedHorizon.price);
                      if (!Number.isFinite(horizonPrice) || horizonPrice <= 0) return;
                      const pnl = _calculateDashDirectionalPnl(direction, entryPrice, horizonPrice);
                      if (!Number.isFinite(pnl)) return;
                      if (target.prices[h.key] !== horizonPrice || target.checked[h.key] !== true) {
                          target.prices[h.key] = horizonPrice;
                          target.pnl[h.key] = pnl;
                          target.checked[h.key] = true;
                          target.localSettlementVersion = DASH_LOCAL_SETTLEMENT_VERSION;
                          target.localSettlementSource = DASH_LOCAL_SETTLEMENT_SOURCE;
                          target.localSettledAt = Date.now();
                          target.localSettlementCandles = {
                              ...(target.localSettlementCandles && typeof target.localSettlementCandles === 'object' ? target.localSettlementCandles : {}),
                              [h.key]: {
                                  targetTs: Number(cachedHorizon.targetTs || 0) || null,
                                  openTime: Number(cachedHorizon.openTime || 0) || null,
                                  closeTime: Number(cachedHorizon.closeTime || 0) || null,
                                  market: String(cachedHorizon.market || 'BINANCE_USDM'),
                                  contractSymbol: String(cachedHorizon.contractSymbol || symbol),
                                  priceScale: Number(cachedHorizon.priceScale || 1) || 1,
                                  rawPrice: Number(cachedHorizon.rawPrice || horizonPrice) || horizonPrice,
                                  host: String(cachedHorizon.host || '')
                              }
                          };
                          changed = true;
                      }
                  });

                  if (changed) dashSaveHistory(localHistory);
              } catch (_) {}
          }

          function _getOutcomeCacheEntry(call) {
              const domId = _getCallHistoryDomId(call);
              const cacheKey = _getDashCallKey(call) || call?.callKey || domId;
              if (!_pnlCache[cacheKey] || typeof _pnlCache[cacheKey] !== 'object') {
                  _pnlCache[cacheKey] = { horizons: {}, updatedAt: 0 };
              }
              return _pnlCache[cacheKey];
          }

          function _getDashOutcomeQueueKey(call) {
              return _getDashCallKey(call) || call?.callKey || _getCallHistoryDomId(call);
          }

          function _scheduleDashOutcomeQueue(delayMs = DASH_OUTCOME_QUEUE_IDLE_DELAY_MS) {
              if (!_dashOutcomeQueue.length || _dashOutcomeRunning || _dashOutcomeTimer) return;
              _dashOutcomeTimer = setTimeout(() => {
                  _dashOutcomeTimer = null;
                  _drainDashOutcomeQueue().catch(() => {});
              }, Math.max(250, Number(delayMs || DASH_OUTCOME_QUEUE_IDLE_DELAY_MS) || DASH_OUTCOME_QUEUE_IDLE_DELAY_MS));
          }

          function _queueDashOutcomeEvaluations(calls) {
              if (!Array.isArray(calls) || !calls.length) return;
              calls.forEach((call) => {
                  const key = _getDashOutcomeQueueKey(call);
                  if (!key || _dashOutcomeQueuedKeys.has(key)) return;
                  _dashOutcomeQueuedKeys.add(key);
                  _dashOutcomeQueue.push(call);
              });
              _scheduleDashOutcomeQueue((_dashScanRunning || _dashHydrating) ? DASH_OUTCOME_QUEUE_BUSY_DELAY_MS : DASH_OUTCOME_QUEUE_IDLE_DELAY_MS);
          }

          async function _drainDashOutcomeQueue() {
              if (_dashOutcomeRunning || !_dashOutcomeQueue.length) return;
              if (!_isDashboardVisible()) return;
              if (_dashScanRunning || _dashHydrating) {
                  _scheduleDashOutcomeQueue(DASH_OUTCOME_QUEUE_BUSY_DELAY_MS);
                  return;
              }

              _dashOutcomeRunning = true;
              let processed = 0;
              try {
                  while (
                      _dashOutcomeQueue.length &&
                      processed < DASH_OUTCOME_QUEUE_MAX_CALLS_PER_DRAIN &&
                      !_dashScanRunning &&
                      !_dashHydrating &&
                      _isDashboardVisible()
                  ) {
                      const call = _dashOutcomeQueue.shift();
                      const key = _getDashOutcomeQueueKey(call);
                      if (key) _dashOutcomeQueuedKeys.delete(key);
                      await evaluateCallOutcomes(call);
                      processed++;
                  }
              } finally {
                  _dashOutcomeRunning = false;
                  try { dashUpdateStats(); } catch (_) {}
                  if (_dashOutcomeQueue.length) {
                      _scheduleDashOutcomeQueue((_dashScanRunning || _dashHydrating) ? DASH_OUTCOME_QUEUE_BUSY_DELAY_MS : DASH_OUTCOME_QUEUE_IDLE_DELAY_MS);
                  }
              }
          }

          function _findCloseAtOrAfter(klines, targetTs) {
              if (!Array.isArray(klines) || klines.length === 0) return null;
              for (let i = 0; i < klines.length; i++) {
                  const row = klines[i];
                  const candleTs = Number(row?.[0] || 0);
                  const candleCloseTs = Number(row?.[6] || 0);
                  if ((candleCloseTs || candleTs) >= targetTs) {
                      const close = Number(row?.[4]);
                      if (Number.isFinite(close) && close > 0) return close;
                      return null;
                  }
              }
              return null;
          }

          function _findFuturesCandleAtOrAfter(klines, targetTs) {
              if (!Array.isArray(klines) || klines.length === 0) return null;
              for (const row of klines) {
                  const openTime = Number(row?.[0] || 0);
                  const closeTime = Number(row?.[6] || 0);
                  if ((closeTime || openTime) >= targetTs) {
                      const price = Number(row?.[4]);
                      if (!Number.isFinite(price) || price <= 0) return null;
                      return { price, openTime: openTime || null, closeTime: closeTime || null };
                  }
              }
              return null;
          }

          async function _dashFetchFuturesCloseAtOrAfter(symbol, targetTs) {
              const spec = _getDashUsdmContractSpec(symbol);
              const safeTargetTs = Number(targetTs || 0);
              if (!spec || !safeTargetTs) return null;

              const startTime = Math.max(0, safeTargetTs - (2 * 60 * 1000));
              const endTime = safeTargetTs + (12 * 60 * 1000);
              const query = `symbol=${encodeURIComponent(spec.contractSymbol)}&interval=1m&startTime=${startTime}&endTime=${endTime}&limit=20`;

              for (const host of DASH_USDM_HOSTS) {
                  try {
                      const requestOptions = {};
                      if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
                          requestOptions.signal = AbortSignal.timeout(6500);
                      }
                      const resp = await fetch(`${host}/fapi/v1/klines?${query}`, requestOptions);
                      if (!resp.ok) continue;
                      const klines = await resp.json().catch(() => null);
                      const candle = _findFuturesCandleAtOrAfter(klines, safeTargetTs);
                      if (!candle) continue;
                      const rawPrice = Number(candle.price);
                      const price = _normalizeDashUsdmPrice(spec.appSymbol, rawPrice);
                      if (!Number.isFinite(price) || price <= 0) continue;
                      return {
                          price,
                          rawPrice,
                          openTime: candle.openTime,
                          closeTime: candle.closeTime,
                          targetTs: safeTargetTs,
                          market: 'BINANCE_USDM',
                          contractSymbol: spec.contractSymbol,
                          priceScale: spec.priceScale,
                          host: host.replace(/^https?:\/\//, '')
                      };
                  } catch (_) {}
              }

              return null;
          }

          function _calculateDashDirectionalPnl(direction, entryPrice, horizonPrice) {
              const entry = Number(entryPrice);
              const price = Number(horizonPrice);
              if (!Number.isFinite(entry) || entry <= 0 || !Number.isFinite(price) || price <= 0) return null;
              const rawPct = ((price - entry) / entry) * 100;
              return String(direction || '').toUpperCase() === 'SHORT'
                  ? +(-rawPct).toFixed(3)
                  : +rawPct.toFixed(3);
          }

          function _getDashOutcome(call, h, cacheEntry, now = Date.now()) {
              const callTime = Number(call?.time || call?.timestamp || 0);
              const horizonTs = callTime + Number(h?.ms || 0);
              if (!callTime || !horizonTs || now < horizonTs) {
                  return { status: 'pending', pct: null, price: null, source: '', horizonTs };
              }

              const officialPnl = Number(call?.pnl?.[h.key]);
              const officialPrice = Number(call?.prices?.[h.key]);
              if (
                  _hasTrustedDashSettlement(call) &&
                  call?.checked?.[h.key] === true &&
                  Number.isFinite(officialPnl)
              ) {
                  return {
                      status: 'settled',
                      pct: officialPnl,
                      price: Number.isFinite(officialPrice) && officialPrice > 0 ? officialPrice : null,
                      source: 'worker',
                      horizonTs
                  };
              }

              const localPnl = Number(call?.pnl?.[h.key]);
              const localPrice = Number(call?.prices?.[h.key]);
              if (
                  _hasLocalDashSettlement(call) &&
                  call?.checked?.[h.key] === true &&
                  Number.isFinite(localPnl)
              ) {
                  return {
                      status: 'settled',
                      pct: localPnl,
                      price: Number.isFinite(localPrice) && localPrice > 0 ? localPrice : null,
                      source: 'local',
                      horizonTs
                  };
              }

              const cached = cacheEntry?.horizons?.[h.key];
              const cachedPnl = Number(cached?.pnl);
              const cachedPrice = Number(cached?.price);
              if (cached?.checked === true && Number.isFinite(cachedPnl)) {
                  return {
                      status: 'settled',
                      pct: cachedPnl,
                      price: Number.isFinite(cachedPrice) && cachedPrice > 0 ? cachedPrice : null,
                      source: 'local-cache',
                      horizonTs
                  };
              }

              return { status: 'searching', pct: null, price: null, source: '', horizonTs };
          }

          function _buildOutcomeBadgesHtml(call, cacheEntry, now) {
              const callTime = Number(call?.time || call?.timestamp || 0);

              return DASH_OUTCOME_HORIZONS.map((h) => {
                  const horizonTs = callTime + h.ms;
                  if (!callTime || now < horizonTs) {
                      return `<span class="dash-outcome-badge pending">${h.label}</span>`;
                  }

                  const outcome = _getDashOutcome(call, h, cacheEntry, now);
                  if (outcome.status !== 'settled') {
                      return `<span class="dash-outcome-badge pending">${h.label} buscando</span>`;
                  }

                  const pct = outcome.pct;
                  const isWin = pct > 0;
                  const cssClass = isWin ? 'win' : pct < 0 ? 'loss' : 'neutral';
                  const icon = isWin ? '&#9989;' : pct < 0 ? '&#10060;' : '&#10134;';
                  const pctText = `${pct > 0 ? '+' : ''}${pct.toFixed(2)}%`;
                  return `<span class="dash-outcome-badge ${cssClass}">${h.label} ${icon} ${pctText}</span>`;
              }).join('');
          }

          function _computeAssertiveness(history) {
              const now = Date.now();
              const makeBucket = () => ({ wins: 0, losses: 0, flats: 0, pending: 0, evaluated: 0, decisions: 0, assertiveness: null });
              const stats = {
                  all: makeBucket(),
                  long: makeBucket(),
                  short: makeBucket(),
                  '1h': makeBucket(),
                  '2h': makeBucket(),
                  '4h': makeBucket()
              };
              const add = (call, h, pct) => {
                  const direction = String(call?.direction || '').toUpperCase();
                  const buckets = [stats.all, stats[h.key]];
                  if (direction === 'LONG') buckets.push(stats.long);
                  if (direction === 'SHORT') buckets.push(stats.short);
                  buckets.filter(Boolean).forEach((bucket) => {
                      if (!Number.isFinite(pct)) bucket.pending++;
                      else if (pct > 0) bucket.wins++;
                      else if (pct < 0) bucket.losses++;
                      else bucket.flats++;
                  });
              };

              history.forEach((call) => {
                  const callTime = Number(call?.time || call?.timestamp || 0);
                  if (!callTime) return;
                  const cacheEntry = _getOutcomeCacheEntry(call);
                  DASH_OUTCOME_HORIZONS.forEach((h) => {
                      if (now < callTime + h.ms) return;
                      const outcome = _getDashOutcome(call, h, cacheEntry, now);
                      if (outcome.status === 'settled' && Number.isFinite(outcome.pct)) {
                          add(call, h, outcome.pct);
                          return;
                      }
                      add(call, h, NaN);
                  });
              });

              Object.values(stats).forEach((bucket) => {
                  bucket.evaluated = bucket.wins + bucket.losses + bucket.flats;
                  bucket.decisions = bucket.wins + bucket.losses;
                  bucket.assertiveness = bucket.decisions > 0
                      ? Math.round((bucket.wins / bucket.decisions) * 100)
                      : null;
              });

              return {
                  evaluated: stats.all.evaluated,
                  decisions: stats.all.decisions,
                  assertiveness: stats.all.assertiveness,
                  assertivenessAllHorizons: stats.all.assertiveness,
                  wins: stats.all.wins,
                  losses: stats.all.losses,
                  flats: stats.all.flats,
                  pending: stats.all.pending,
                  stats
              };
          }

          async function evaluateCallOutcomes(call) {
              const callTime = Number(call?.time || call?.timestamp || 0);
              if (!callTime) return;

              const now = Date.now();
              const cacheEntry = _getOutcomeCacheEntry(call);
              const domId = _getCallHistoryDomId(call);
              const rowEl = document.getElementById(`call-outcomes-${domId}`);
              if (rowEl) {
                  rowEl.innerHTML = _buildOutcomeBadgesHtml(call, cacheEntry, now);
              }

              const maturedHorizons = DASH_OUTCOME_HORIZONS.filter((h) => now >= (callTime + h.ms));
              if (maturedHorizons.length === 0) return;

              const missingHorizons = maturedHorizons.filter((h) => {
                  const outcome = _getDashOutcome(call, h, cacheEntry, now);
                  if (outcome.status === 'settled') return false;
                  const cached = cacheEntry?.horizons?.[h.key];
                  const attemptedAt = Number(cached?.attemptedAt || 0);
                  return !attemptedAt || (now - attemptedAt) >= DASH_OUTCOME_RETRY_MS;
              });
              if (missingHorizons.length === 0) return;

              const entryPrice = Number(call?.price || call?.entryPrice || 0);
              const direction = String(call?.direction || '').toUpperCase();
              const symbol = _normalizeBinanceSymbol(call?.symbol);
              if (!entryPrice || !symbol || (direction !== 'LONG' && direction !== 'SHORT')) return;

              cacheEntry.horizons = cacheEntry.horizons || {};
              let changed = false;
              for (const h of missingHorizons) {
                  const targetTs = callTime + h.ms;
                  cacheEntry.horizons[h.key] = {
                      ...(cacheEntry.horizons[h.key] && typeof cacheEntry.horizons[h.key] === 'object' ? cacheEntry.horizons[h.key] : {}),
                      attemptedAt: Date.now(),
                      targetTs
                  };

                  const candle = await _dashFetchFuturesCloseAtOrAfter(symbol, targetTs);
                  const horizonPrice = Number(candle?.price);
                  const pnl = _calculateDashDirectionalPnl(direction, entryPrice, horizonPrice);
                  if (!Number.isFinite(horizonPrice) || horizonPrice <= 0 || !Number.isFinite(pnl)) {
                      cacheEntry.horizons[h.key].error = 'futures_close_unavailable';
                      changed = true;
                      continue;
                  }

                  cacheEntry.horizons[h.key] = {
                      checked: true,
                      price: horizonPrice,
                      pnl,
                      targetTs,
                      settledAt: Date.now(),
                      version: DASH_LOCAL_SETTLEMENT_VERSION,
                      source: DASH_LOCAL_SETTLEMENT_SOURCE,
                      openTime: Number(candle?.openTime || 0) || null,
                      closeTime: Number(candle?.closeTime || 0) || null,
                      market: String(candle?.market || 'BINANCE_USDM'),
                      contractSymbol: String(candle?.contractSymbol || symbol),
                      priceScale: Number(candle?.priceScale || 1) || 1,
                      rawPrice: Number(candle?.rawPrice || horizonPrice) || horizonPrice,
                      host: String(candle?.host || '')
                  };

                  if (!_hasTrustedDashSettlement(call)) {
                      call.prices = call.prices || { '1h': null, '2h': null, '4h': null };
                      call.pnl = call.pnl || { '1h': null, '2h': null, '4h': null };
                      call.checked = call.checked || { '1h': false, '2h': false, '4h': false };
                      call.prices[h.key] = horizonPrice;
                      call.pnl[h.key] = pnl;
                      call.checked[h.key] = true;
                      call.localSettlementVersion = DASH_LOCAL_SETTLEMENT_VERSION;
                      call.localSettlementSource = DASH_LOCAL_SETTLEMENT_SOURCE;
                      call.localSettledAt = Date.now();
                  }
                  changed = true;
              }

              if (changed) {
                  cacheEntry.updatedAt = Date.now();
                  _persistOutcomeCache();
                  _persistDashOutcomeToHistory(call, cacheEntry);
              }

              if (rowEl) rowEl.innerHTML = _buildOutcomeBadgesHtml(call, cacheEntry, Date.now());
          }

          function dashFilterHistory(filter) {
              const normalized = (filter === 'long' || filter === 'short') ? filter : 'all';
              dashHistoryFilter = normalized;
              document.querySelectorAll('.dash-hist-filter').forEach((el) => {
                  const isActive = String(el.dataset.filter || '').toLowerCase() === normalized;
                  el.classList.toggle('active', isActive);
              });
              dashRenderHistory();
          }

          function _dashRenderHistoryFromData(rawHistory) {
              const container = document.getElementById('dash-history-list');
              if (!container) return;

              let history = _normalizeDashHistory(rawHistory);
              history.sort((a, b) => Number(b?.time || b?.timestamp || 0) - Number(a?.time || a?.timestamp || 0));
              if (dashHistoryFilter === 'long') history = history.filter(h => String(h?.direction || '').toUpperCase() === 'LONG');
              else if (dashHistoryFilter === 'short') history = history.filter(h => String(h?.direction || '').toUpperCase() === 'SHORT');
              history = history.slice(0, 30);
              const syncHtml = _dashHistorySyncing ? `
                  <div style="display:flex;align-items:center;gap:6px;margin:0 0 10px;padding:8px 10px;border:1px solid rgba(99,102,241,0.16);border-radius:10px;background:rgba(99,102,241,0.07);color:var(--text-muted);font-size:11px;font-weight:700;">
                      <i class="fas fa-rotate" style="font-size:10px;color:#818cf8;"></i>
                      Sincronizando historico...
                  </div>` : '';

              if (history.length === 0) {
                  container.innerHTML = `
                  ${syncHtml}
                  <div class="dash-empty-state">
                      <i class="fas fa-clock-rotate-left" style="font-size:32px;margin-bottom:12px;opacity:0.2;"></i>
                      <div style="font-size:14px;font-weight:700;color:var(--text-secondary);margin-bottom:4px;">Nenhum histórico ainda</div>
                      <div style="font-size:12px;">As últimas 30 calls registradas aparecem aqui automaticamente.</div>
                  </div>`;
                  return;
              }

              let html = syncHtml;
              const callsToEval = history.slice(0, 30);
              callsToEval.forEach(call => {
                  const isLong = call.direction === 'LONG';
                  const dir = isLong ? 'long' : 'short';
                  const dirColor = isLong ? '#22c55e' : '#ef4444';
                  const domId = _getCallHistoryDomId(call);
                  const callTime = Number(call.time || call.timestamp || 0);
                  const timeStr = formatCallTime(callTime);
                  const entryPrice = Number(call.price || call.entryPrice || 0);
                  const priceStr = entryPrice ? _formatUsdCompact(entryPrice) : '';
                  const reasonText = _sanitizeText(call.reason || '');

                  const cacheEntry = _getOutcomeCacheEntry(call);
                  const outcomeBadges = _buildOutcomeBadgesHtml(call, cacheEntry, Date.now());

                  html += `
                  <div class="dash-history-card" onclick="dashShowCallDetail('${domId}')">
                      <div class="hist-icon ${dir}">
                          <i class="fas fa-arrow-${isLong ? 'up' : 'down'}" style="color: ${dirColor}; font-size: 12px;"></i>
                      </div>
                      <div class="dash-history-body">
                          <div class="dash-history-top">
                              <div class="dash-history-token-wrap">
                                  <span class="dash-history-symbol">${call.short || call.symbol}</span>
                                  <span class="dash-history-direction ${dir}">${call.direction}</span>
                              </div>
                              <span class="dash-history-time">${timeStr}</span>
                          </div>
                          <div class="dash-history-meta">${priceStr ? 'Entrada: ' + priceStr + ' · ' : ''}${call.gates ? call.gates + ' gates' : 'sem gates'}</div>
                          ${reasonText ? `<div class="dash-history-reason">${reasonText}</div>` : ''}
                          <div class="dash-outcome-badges" id="call-outcomes-${domId}">${outcomeBadges}</div>
                      </div>
                      <div class="dash-history-conf ${dir}">${Number(call.confidence || 0)}%</div>
                  </div>`;
              });

              container.innerHTML = html;

              _queueDashOutcomeEvaluations(callsToEval);
          }

        function dashShowCallDetail(callId) {
            const history = dashGetHistory();
            const ref = String(callId || '');
            const call = history.find(h =>
                _getCallHistoryDomId(h) === ref ||
                _getDashCallKey(h) === ref ||
                String(h.id) === ref
            );
            if (!call) return;

            const isLong = call.direction === 'LONG';
            const dirColor = isLong ? '#22c55e' : '#ef4444';
            const dirEmoji = isLong ? '🟢' : '🔴';
            const callTs = Number(call.time || call.timestamp || 0);
            const timeStr = formatCallTime(callTs);
            const entryPrice = Number(call.price || call.entryPrice || 0);
            const priceStr = entryPrice ? _formatUsdCompact(entryPrice) : 'N/A';
            const cacheEntry = _getOutcomeCacheEntry(call);
            const outcomesHtml = _buildOutcomeBadgesHtml(call, cacheEntry, Date.now());
            const safeReason = _sanitizeText(call.reason || '');

            let modal = document.getElementById('dash-call-detail-modal');
            if (modal) modal.remove();

            // === BACKGROUND LOCK: prevent scroll passthrough ===
            document.body.style.overflow = 'hidden';
            document.documentElement.style.overflow = 'hidden';

            const _closeDetailModal = () => {
                const m = document.getElementById('dash-call-detail-modal');
                if (m) m.remove();
                // === RESTORE SCROLL ===
                document.body.style.overflow = '';
                document.documentElement.style.overflow = '';
            };
            // Expose globally for onclick
            window._closeDetailModal = _closeDetailModal;

            modal = document.createElement('div');
            modal.id = 'dash-call-detail-modal';
            modal.style.cssText = 'position:fixed;inset:0;z-index:2000;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;padding:20px;animation:fadeIn 0.2s;touch-action:none;overscroll-behavior:contain;-webkit-overflow-scrolling:auto;';
            modal.innerHTML = `
            <div style="background: var(--bg-card); border-radius: 20px; width: 100%; max-width: 380px; padding: 24px; border: 1px solid var(--border-subtle); max-height: 80vh; overflow-y: auto; overscroll-behavior: contain;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
                    <div style="font-size: 16px; font-weight: 800; color: var(--text-primary);">Detalhe da Call</div>
                    <div onclick="window._closeDetailModal()" aria-label="Fechar" role="button" tabindex="0" style="width: 44px; height: 44px; background: rgba(255,255,255,0.12); border: 1.5px solid rgba(255,255,255,0.2); border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.15s ease; -webkit-tap-highlight-color: transparent;" onmouseenter="this.style.background='rgba(255,255,255,0.25)'" onmouseleave="this.style.background='rgba(255,255,255,0.12)'" ontouchstart="this.style.background='rgba(255,255,255,0.25)'" ontouchend="this.style.background='rgba(255,255,255,0.12)'">
                        <i class="fas fa-xmark" style="color: #f1f5f9; font-size: 18px;"></i>
                    </div>
                </div>
                <div style="text-align: center; margin-bottom: 16px;">
                    <img src="${call.img || ''}" style="width: 48px; height: 48px; border-radius: 50%; margin-bottom: 8px;" onerror="this.style.display='none'">
                    <div style="font-size: 20px; font-weight: 800; color: var(--text-primary);">${call.short || call.symbol}</div>
                    <div style="font-size: 12px; color: var(--text-muted);">${call.name || call.symbol}</div>
                </div>
                <div style="background: ${isLong ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)'}; border: 1px solid ${isLong ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}; border-radius: 12px; padding: 16px; text-align: center; margin-bottom: 16px;">
                    <div style="font-size: 28px; font-weight: 900; color: ${dirColor};">${dirEmoji} ${call.direction}</div>
                    <div style="font-size: 36px; font-weight: 900; color: ${dirColor}; margin: 4px 0;">${call.confidence}%</div>
                    <div style="font-size: 11px; color: var(--text-muted);">confiança</div>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px;">
                    <div style="background: var(--bg-tertiary); border-radius: 10px; padding: 12px; text-align: center;">
                        <div style="font-size: 10px; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">Preço</div>
                        <div style="font-size: 14px; font-weight: 700; color: var(--text-primary); margin-top: 4px;">${priceStr}</div>
                    </div>
                    <div style="background: var(--bg-tertiary); border-radius: 10px; padding: 12px; text-align: center;">
                        <div style="font-size: 10px; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">Gates</div>
                        <div style="font-size: 14px; font-weight: 700; color: var(--text-primary); margin-top: 4px;">${call.gates || 'N/A'}</div>
                    </div>
                </div>
                <div style="background: var(--bg-tertiary); border-radius: 10px; padding: 12px; margin-bottom: 12px;">
                    <div style="font-size: 10px; color: var(--text-muted); text-transform: uppercase; font-weight: 600; margin-bottom: 4px;">Horário</div>
                    <div style="font-size: 13px; color: var(--text-primary);">${timeStr}</div>
                </div>
                <div style="background: var(--bg-tertiary); border-radius: 10px; padding: 12px; margin-bottom: 12px;">
                    <div style="font-size: 10px; color: var(--text-muted); text-transform: uppercase; font-weight: 600; margin-bottom: 6px;">Resultado 1H/2H/4H</div>
                    <div class="dash-outcome-badges">${outcomesHtml}</div>
                </div>
                ${safeReason ? `
                <div style="background: var(--bg-tertiary); border-radius: 10px; padding: 12px;">
                    <div style="font-size: 10px; color: var(--text-muted); text-transform: uppercase; font-weight: 600; margin-bottom: 4px;">Motivo</div>
                    <div style="font-size: 12px; color: var(--text-secondary); line-height: 1.5;">${safeReason}</div>
                </div>
                ` : ''}
            </div>`;
            modal.onclick = (e) => { if (e.target === modal) _closeDetailModal(); };
            document.body.appendChild(modal);
        }

        function dashUpdateStats() {
            const history = dashGetHistory();
            const today = new Date().setHours(0,0,0,0);
            const getTs = (h) => Number(h?.time || h?.timestamp || 0);

            const total = history.length;
            const longs = history.filter(h => h.direction === 'LONG').length;
            const shorts = history.filter(h => h.direction === 'SHORT').length;
            const todayCount = history.filter(h => getTs(h) >= today).length;
            const assertiveness = _computeAssertiveness(history);
            const assertivenessText = (assertiveness.assertivenessAllHorizons != null && assertiveness.decisions >= 3)
                ? `${assertiveness.assertivenessAllHorizons}%`
                : '--';

            const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
            el('dash-stat-total', total);
            el('dash-stat-long', longs);
            el('dash-stat-short', shorts);
            el('dash-stat-today', todayCount);
            el('dash-stat-avgconf', assertivenessText);
        }

        function dashRenderCryptoSettings() {
            const prefs = getSignalPrefs();
            const slider = document.getElementById('dash-global-slider');
            const label = document.getElementById('dash-global-label');
            if (slider) slider.value = clampSignalConfidenceThreshold(prefs.globalConfidence);
            if (label) label.textContent = clampSignalConfidenceThreshold(prefs.globalConfidence) + '%';

            const container = document.getElementById('dash-crypto-items');
            if (!container || typeof CRYPTO_DATABASE === 'undefined') return;

            // Count enabled for the toggle-all button
            const totalCryptos = Object.keys(CRYPTO_DATABASE).length;
            let enabledCount = 0;
            Object.keys(CRYPTO_DATABASE).forEach(s => { if (prefs.cryptos[s]?.enabled === true) enabledCount++; });
            const allEnabled = enabledCount === totalCryptos;

            let html = `
            <div style="display:flex;gap:8px;margin-bottom:10px;">
                <button onclick="dashToggleAllCryptos(true)" style="flex:1;padding:10px;border-radius:10px;border:1px solid rgba(99,102,241,0.3);background:${allEnabled ? 'rgba(99,102,241,0.2)' : 'var(--bg-tertiary)'};color:${allEnabled ? '#a5b4fc' : 'var(--text-secondary)'};font-size:11px;font-weight:700;cursor:pointer;transition:all 0.3s;">
                    <i class="fas fa-toggle-on" style="margin-right:4px;"></i> Ativar Todos
                </button>
                <button onclick="dashToggleAllCryptos(false)" style="flex:1;padding:10px;border-radius:10px;border:1px solid rgba(239,68,68,0.2);background:${!allEnabled && enabledCount === 0 ? 'rgba(239,68,68,0.1)' : 'var(--bg-tertiary)'};color:${!allEnabled && enabledCount === 0 ? '#fca5a5' : 'var(--text-secondary)'};font-size:11px;font-weight:700;cursor:pointer;transition:all 0.3s;">
                    <i class="fas fa-toggle-off" style="margin-right:4px;"></i> Desativar Todos
                </button>
            </div>
            <div style="font-size:10px;color:var(--text-muted);text-align:center;margin-bottom:10px;">
                <i class="fas fa-info-circle" style="margin-right:3px;color:#6366f1;"></i>
                ${enabledCount}/${totalCryptos} ativos · Por padrão todos iniciam desativados
            </div>`;

            Object.entries(CRYPTO_DATABASE).forEach(([symbol, data]) => {
                const cp = prefs.cryptos[symbol] || {};
                const enabled = cp.enabled === true;
                const confidence = clampSignalConfidenceThreshold(cp.confidence || prefs.globalConfidence);

                html += `
                <div style="display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: var(--bg-tertiary); border-radius: 10px; border: 1px solid ${enabled ? 'rgba(99,102,241,0.2)' : 'transparent'};">
                    <img src="${data.img}" style="width: 28px; height: 28px; border-radius: 50%;" onerror="this.style.display='none'">
                    <div style="flex: 1; min-width: 0;">
                        <div style="display: flex; align-items: center; justify-content: space-between;">
                            <div style="font-size: 12px; font-weight: 700; color: var(--text-primary);">${data.short}</div>
                            <label style="position: relative; width: 40px; height: 22px; cursor: pointer; flex-shrink: 0;">
                                <input type="checkbox" ${enabled ? 'checked' : ''} onchange="dashToggleCrypto('${symbol}', this.checked)" style="display: none;">
                                <div style="width: 40px; height: 22px; background: ${enabled ? '#6366f1' : '#2a2a3e'}; border-radius: 11px; transition: background 0.3s; border: 1px solid ${enabled ? '#6366f1' : '#666688'};"></div>
                                <div style="position: absolute; top: 2px; left: ${enabled ? '20px' : '2px'}; width: 18px; height: 18px; background: ${enabled ? '#fff' : '#888'}; border-radius: 50%; transition: left 0.3s; box-shadow: 0 1px 3px rgba(0,0,0,0.3);"></div>
                            </label>
                        </div>
                        <div style="display: flex; align-items: center; gap: 6px; margin-top: 4px; ${enabled ? '' : 'opacity: 0.4; pointer-events: none;'}">
                            <span style="font-size: 9px; color: var(--text-muted); white-space: nowrap;">Mín:</span>
                            <input type="range" class="signal-conf-slider" min="${SIGNAL_MIN_CONFIDENCE}" max="100" value="${confidence}" step="1"
                                   oninput="this.nextElementSibling.textContent=this.value+'%'"
                                   onchange="dashSetCryptoConf('${symbol}', parseInt(this.value))"
                                   style="flex: 1; height: 4px; accent-color: #6366f1;">
                            <span style="font-size: 11px; font-weight: 700; color: #6366f1; min-width: 30px; text-align: right;">${confidence}%</span>
                        </div>
                    </div>
                </div>`;
            });
            container.innerHTML = html;
        }

        function dashSyncNativeBackgroundConfig() {
            const prefs = getSignalPrefs();
            if (prefs.masterEnabled) {
                startBackgroundService();
            }
        }

        function dashToggleCrypto(symbol, enabled) {
            toggleCryptoSignal(symbol, enabled);
            dashRenderCryptoSettings();
            dashSyncNativeBackgroundConfig();
            // Sync bell panel
            _syncBellPanelFromPrefs(getSignalPrefs());
        }

        function dashSetCryptoConf(symbol, confidence) {
            setCryptoConfidence(symbol, confidence);
            dashRenderCryptoSettings();
            dashSyncNativeBackgroundConfig();
        }

        function dashUpdateGlobalLabel(val) {
            const label = document.getElementById('dash-global-label');
            if (label) label.textContent = val + '%';
        }

        function dashSaveGlobalConf() {
            const slider = document.getElementById('dash-global-slider');
            if (!slider) return;
            const prefs = getSignalPrefs();
            const newGlobal = clampSignalConfidenceThreshold(parseInt(slider.value));
            prefs.globalConfidence = newGlobal;
            // Regra solicitada: alteração global sempre força todas as criptos.
            Object.entries(typeof CRYPTO_DATABASE !== 'undefined' ? CRYPTO_DATABASE : {}).forEach(([symbol]) => {
                if (!prefs.cryptos[symbol]) prefs.cryptos[symbol] = {};
                prefs.cryptos[symbol].confidence = newGlobal;
                // Sync each crypto to V4 engine
                if (window.TAEngineV4) {
                    window.TAEngineV4.setNotificationConfig(symbol, {
                        enabled: prefs.cryptos[symbol].enabled === true,
                        confidenceThreshold: newGlobal
                    });
                }
            });
            saveSignalPrefs(prefs);
            dashRenderCryptoSettings();
            if (window.TAEngineV4) {
                window.TAEngineV4.setNotificationConfig(null, {
                    enabled: prefs.masterEnabled,
                    confidenceThreshold: prefs.globalConfidence,
                    conditions: { setupConfirmed: true, minConfidence: true, regimeChange: false }
                });
            }
            // Sync bell panel slider + toggle
            _syncBellPanelFromPrefs(prefs);
            dashSyncNativeBackgroundConfig();
        }

        function dashToggleAllCryptos(enable) {
            const prefs = getSignalPrefs();
            Object.keys(typeof CRYPTO_DATABASE !== 'undefined' ? CRYPTO_DATABASE : {}).forEach(symbol => {
                if (!prefs.cryptos[symbol]) prefs.cryptos[symbol] = {};
                prefs.cryptos[symbol].enabled = enable;
                // Sync per-crypto to V4 engine
                if (window.TAEngineV4) {
                    window.TAEngineV4.setNotificationConfig(symbol, {
                        enabled: enable,
                        confidenceThreshold: clampSignalConfidenceThreshold(prefs.cryptos[symbol].confidence || prefs.globalConfidence)
                    });
                }
            });
            saveSignalPrefs(prefs);
            dashRenderCryptoSettings();
            dashSyncMasterToggle();
            _syncBellPanelFromPrefs(prefs);
            dashSyncNativeBackgroundConfig();
        }

        function dashUpdateHomeSummary() {
            // no-op: HOME card removed
        }

        // Helper: time ago (Dashboard version, takes timestamp number)
        function dashGetTimeAgo(ts) {
            if (!ts) return '';
            const diff = Date.now() - ts;
            const mins = Math.floor(diff / 60000);
            if (mins < 1) return 'agora';
            if (mins < 60) return `${mins}min atrás`;
            const hours = Math.floor(mins / 60);
            if (hours < 24) return `${hours}h atrás`;
            const days = Math.floor(hours / 24);
            return `${days}d atrás`;
        }

        function formatCallTime(ts) {
            if (!ts) return '';
            const d = new Date(ts);
            const day = d.getDate().toString().padStart(2, '0');
            const mon = (d.getMonth() + 1).toString().padStart(2, '0');
            const h = d.getHours().toString().padStart(2, '0');
            const m = d.getMinutes().toString().padStart(2, '0');
            return `${day}/${mon} ${h}:${m}`;
        }

        window.dashWarmupCallHistory = dashWarmupCallHistory;

        document.addEventListener('DOMContentLoaded', () => {
            dashScheduleCallHistoryWarmup(500, { forceNative: true });
            dashStartConfAutoRefresh();
            setTimeout(() => {
                try {
                    forceSignalsFreshness('app_start_visible', {
                        force: false,
                        render: _isDashboardVisible(),
                        statusText: 'Atualizando sinais...'
                    });
                } catch (_) {}
            }, 2500);
        });

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                dashStartConfAutoRefresh();
                dashScheduleCallHistoryWarmup(300, { forceNative: true });
                try {
                    forceSignalsFreshness('app_foreground_visible', {
                        force: false,
                        render: _isDashboardVisible(),
                        statusText: 'Atualizando sinais...'
                    });
                } catch (_) {}
            }
        });
