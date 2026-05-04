        // ═══════════════════════════════════════════════════
        // BANCO DE DADOS DE CALLS — Export (JSON / CSV)
        // ═══════════════════════════════════════════════════
        
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
            const historyReader = (typeof getCallHistoryForDisplay === 'function') ? getCallHistoryForDisplay : getCallHistory;
            const history = historyReader();
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
            
            const recentCalls = [...scopedHistory].reverse().slice(0, 15);
            
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
                    const wr = s.total > 0 ? ((s.wins / s.total) * 100).toFixed(0) : '—';
                    const wrColor = s.total === 0 ? 'var(--text-muted)' : parseFloat(wr) >= 55 ? '#22c55e' : parseFloat(wr) >= 45 ? '#f59e0b' : '#ef4444';
                    html += `
                        <div style="background: var(--bg-tertiary); padding: 8px; border-radius: 10px; text-align: center;">
                            <div style="font-size: 9px; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Win Rate ${iv.label}</div>
                            <div style="font-size: 17px; font-weight: 800; color: ${wrColor};">${wr}${s.total > 0 ? '%' : ''}</div>
                            <div style="font-size: 10px; color: var(--text-muted);">${s.wins}W / ${s.losses}L${s.pending > 0 ? ' / ' + s.pending + '⏳' : ''}</div>
                        </div>`;
                }
                html += `</div>`;
            }
            
            // Recent calls table
            if (recentCalls.length > 0) {
                html += `
                    <div style="display: flex; gap: 6px; margin-bottom: 12px;">
                        <button onclick="exportCallHistoryJSON()" style="flex: 1; padding: 8px; background: rgba(59,130,246,0.12); border: 1px solid rgba(59,130,246,0.25); border-radius: 8px; color: #3b82f6; font-size: 10px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px;">
                            📁 Exportar JSON
                        </button>
                        <button onclick="exportCallHistoryCSV()" style="flex: 1; padding: 8px; background: rgba(34,197,94,0.12); border: 1px solid rgba(34,197,94,0.25); border-radius: 8px; color: #22c55e; font-size: 10px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px;">
                            📊 Exportar CSV
                        </button>
                    </div>
                    <div style="font-size: 10px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 8px; padding: 0 4px;">
                        Últimas Calls
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 6px; max-height: 400px; overflow-y: auto;">`;
                
                for (const call of recentCalls) {
                    const isLong = call.direction === 'LONG';
                    const dirColor = isLong ? '#22c55e' : '#ef4444';
                    const dirIcon = isLong ? '▲' : '▼';
                    const date = new Date(call.timestamp);
                    const dateStr = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
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
                        const p = call.prices[iv.key];
                        const isWin = p ? (isLong ? p > call.entryPrice : p < call.entryPrice) : null;
                        const resultColor = isWin === null ? 'var(--text-muted)' : isWin ? '#22c55e' : '#ef4444';
                        const resultIcon = isWin === null ? '⏳' : isWin ? '✅' : '❌';
                        const resultText = isWin === null ? 'Pendente' : isWin ? 'Win' : 'Loss';
                        const resultBg = isWin === null ? 'var(--bg-card)' : isWin ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)';
                        
                        html += `
                                <div style="text-align: center; padding: 6px 4px; background: ${resultBg}; border-radius: 8px;">
                                    <div style="font-size: 9px; color: var(--text-muted); font-weight: 600;">${iv.label}</div>
                                    <div style="font-size: 15px; margin: 1px 0;">${resultIcon}</div>
                                    <div style="font-size: 9px; font-weight: 700; color: ${resultColor};">${resultText}</div>
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
                        <div style="font-size: 10px; color: var(--text-muted); margin-top: 4px;">Calls com confiança ≥70% são salvas automaticamente</div>
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
                if (typeof showInterstitialAd === 'function') {
                    showInterstitialAd().catch(() => {});
                }

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
            const confThreshold = cryptoPrefs.confidence || prefs.globalConfidence || 75;
            
            const toggle = document.getElementById('notif-toggle');
            const details = document.getElementById('notif-config-details');
            const slider = document.getElementById('notif-confidence-slider');
            
            if (toggle) toggle.checked = enabled;
            if (details) details.style.display = enabled ? 'block' : 'none';
            if (slider) {
                slider.value = Math.max(70, confThreshold);
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
            const confidence = Math.max(70, parseInt(document.getElementById('notif-confidence-slider')?.value || '75'));
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
                const conf = cp.confidence || prefs.globalConfidence || 70;
                
                const bellToggle = document.getElementById('notif-toggle');
                const bellSlider = document.getElementById('notif-confidence-slider');
                const bellLabel = document.getElementById('notif-confidence-label');
                const bellDetails = document.getElementById('notif-config-details');
                if (bellToggle) bellToggle.checked = enabled;
                if (bellSlider) bellSlider.value = Math.max(70, conf);
                if (bellLabel) bellLabel.textContent = Math.max(70, conf) + '%';
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
                const p = JSON.parse(localStorage.getItem(SS_STORAGE_KEY)) || { masterEnabled: false, globalConfidence: 70, cryptos: {} };
                if (p.globalConfidence < 70) p.globalConfidence = 70;
                return p;
            } catch { return { masterEnabled: false, globalConfidence: 70, cryptos: {} }; }
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
                    prefs.cryptos[symbol].confidence = Math.max(70, prefs.globalConfidence || 70);
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
                const confidence = Math.max(70, cp.confidence || prefs.globalConfidence || 70);
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
                slider.value = Math.max(70, prefs.globalConfidence || 70);
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
                    confidenceThreshold: prefs.globalConfidence || 70,
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
                    confidenceThreshold: prefs.globalConfidence || 70,
                    conditions: { setupConfirmed: true, minConfidence: true, regimeChange: false }
                });
                // Sync all per-crypto to V4
                if (typeof CRYPTO_DATABASE !== 'undefined') {
                    Object.keys(CRYPTO_DATABASE).forEach(symbol => {
                        const cp = prefs.cryptos[symbol] || {};
                        window.TAEngineV4.setNotificationConfig(symbol, {
                            enabled: cp.enabled === true,
                            confidenceThreshold: cp.confidence || prefs.globalConfidence || 70
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
                const confidence = Math.max(70, cp.confidence || prefs.globalConfidence || 70);

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
                            <input type="range" class="signal-conf-slider" min="70" max="100" value="${confidence}" step="5" 
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
                    confidenceThreshold: prefs.cryptos[symbol].confidence || prefs.globalConfidence || 70
                });
            }

            if (prefs.masterEnabled) startBackgroundService();
        }

        function setCryptoConfidence(symbol, confidence) {
            confidence = Math.max(70, confidence);
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
                const newGlobal = parseInt(slider.value);
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
            summary.textContent = `${enabled}/${total} ativos · Mín ${Math.max(70, prefs.globalConfidence || 70)}%`;
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
            if (prefs.cryptos[symbol]?.confidence) return Math.max(70, prefs.cryptos[symbol].confidence);
            return Math.max(70, prefs.globalConfidence || 70);
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
                const expiresAt = Math.max(Number(options.expiresAt || 0) || 0, notifiedAt + ACTIVE_SIGNAL_VALIDITY_MS);
                const id = String(options.snapshotId || _buildSignalSnapshotId(normalizedSymbol, direction, notifiedAt));
                const store = _readSignalSnapshotStore();
                const analysisSnapshot = _cloneAnalysisForSignalSnapshot(options.analysis || options.analysisSnapshot, direction, confidence, notifiedAt);
                const snapshot = {
                    id,
                    snapshotId: id,
                    symbol: normalizedSymbol,
                    direction,
                    finalDirection: direction,
                    confidence,
                    finalConfidence: confidence,
                    price: Number(options.price || options.entryPrice || 0) || 0,
                    reason: String(options.reason || '').trim(),
                    gates: String(options.gates || ''),
                    minConfidence: Math.max(70, Number(options.minConfidence || getCryptoMinConfidence(normalizedSymbol) || 70) || 70),
                    notifiedAt,
                    expiresAt,
                    createdAt: Date.now(),
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
                banner.innerHTML = `<strong style="color:var(--text-primary);">Snapshot do sinal</strong> · ${snapshot.finalDirection} ${snapshot.finalConfidence}% · valido ate ${new Date(snapshot.expiresAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
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
                            <div style="font-size:16px;font-weight:800;color:var(--text-primary);">${new Date(snapshot.expiresAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
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
                    minConfidence: Math.max(70, Number(cp.confidence || prefs?.globalConfidence || 70) || 70)
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
                confidenceThreshold: Math.max(70, Number(prefs.globalConfidence || 70) || 70),
                symbols: enabledSymbols,
                perSymbol: buildNativeSymbolsConfig(prefs)
            };
        }

        async function getWorkerAuthHeadersForSignals(forceRefresh = false) {
            if (!window.AuthClient || typeof window.AuthClient.getWriteAuthHeaders !== 'function') {
                return {};
            }
            return window.AuthClient.getWriteAuthHeaders({ forceRefresh });
        }

        async function syncRemoteNotificationPrefs(prefs = getSignalPrefs()) {
            try {
                const workerUrl = _getWorkerUrl();
                if (!workerUrl) return false;
                const headers = await getWorkerAuthHeadersForSignals();
                const resp = await fetch(`${workerUrl}/notifications/prefs`, {
                    method: 'POST',
                    headers: { ...headers, 'Content-Type': 'application/json' },
                    body: JSON.stringify(buildRemoteNotificationPrefs(prefs)),
                    signal: AbortSignal.timeout(6000)
                });
                return resp.ok;
            } catch (_) {
                return false;
            }
        }

        async function registerRemotePushNotifications(force = false) {
            if (_remotePushRegistrationPromise) return _remotePushRegistrationPromise;
            _remotePushRegistrationPromise = (async () => {
                try {
                    const workerUrl = _getWorkerUrl();
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

                    const headers = await getWorkerAuthHeadersForSignals(force);
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
                    syncRemoteNotificationPrefs(prefs).catch(() => {});
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
                const workerUrl = _getWorkerUrl();
                if (!workerUrl) return false;
                const headers = await getWorkerAuthHeadersForSignals();
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

        function mergeSignalSnapshot(snapshot) {
            try {
                const payload = snapshot && snapshot.results ? snapshot : null;
                if (!payload || typeof payload.results !== 'object') return false;

                localStorage.setItem(SIGNALS_REMOTE_SNAPSHOT_KEY, JSON.stringify({
                    ...payload,
                    cachedAt: Date.now()
                }));

                const dashResults = _getDashTAResults();
                const scanResults = getScanLastResults();
                const updatedAt = Number(payload.updatedAt || Date.now()) || Date.now();
                let changed = false;

                Object.entries(payload.results).forEach(([rawSymbol, item]) => {
                    const symbol = _normalizeScanSymbol(rawSymbol);
                    if (!symbol || !item || typeof item !== 'object') return;
                    const confidence = Math.max(0, Math.min(100, Math.round(Number(item.finalConfidence || item.confidence || 0) || 0)));
                    const direction = confidence >= 50 ? _normalizeSignalDirection(item.finalDirection || item.direction || item.signal) : 'NEUTRO';
                    const price = Number(item.price || item.currentPrice || 0) || 0;
                    const lastScanAt = Number(item.lastScanAt || item.timestamp || updatedAt) || updatedAt;
                    const reason = String(item.reason || item.source || 'Remote snapshot').trim();
                    const notifiedAt = Number(item.notifiedAt || item.lastNotifiedAt || 0) || 0;
                    const notifiedDirection = _normalizeSignalDirection(item.lastNotifiedDirection || item.notifiedDirection || direction);
                    const notifiedConfidence = Math.max(0, Math.min(100, Math.round(Number(item.lastNotifiedConfidence || item.notifiedConfidence || confidence || 0) || 0)));
                    const notifiedPrice = Number(item.lastNotifiedPrice || item.notifiedPrice || price || 0) || 0;
                    const notifiedReason = String(item.lastNotifiedReason || item.notifiedReason || reason || '').trim();
                    const hasNotified = notifiedAt > 0 && notifiedDirection !== 'NEUTRO' && notifiedConfidence > 0;
                    const expiresAt = Number(item.expiresAt || 0) || (hasNotified ? (notifiedAt + ACTIVE_SIGNAL_VALIDITY_MS) : 0);
                    const snapshot = (hasNotified && (Date.now() - notifiedAt) <= ACTIVE_SIGNAL_VALIDITY_MS)
                        ? cacheSignalAnalysisSnapshot(symbol, {
                            snapshotId: item.snapshotId,
                            direction: notifiedDirection,
                            confidence: notifiedConfidence,
                            price: notifiedPrice,
                            reason: notifiedReason || reason,
                            gates: item.gates || 'SNAPSHOT',
                            notifiedAt,
                            expiresAt,
                            source: 'remote_snapshot'
                        })
                        : null;
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
                        notifiedAt: hasNotified ? notifiedAt : (dashResults[symbol]?.notifiedAt || 0),
                        expiresAt: snapshot?.expiresAt || expiresAt || dashResults[symbol]?.expiresAt || 0,
                        source: 'remote_snapshot'
                    };
                    const before = JSON.stringify(dashResults[symbol] || {});
                    dashResults[symbol] = entry;
                    const prevScan = scanResults[symbol] || {};
                    const prevNotifiedAt = Number(prevScan.lastNotifiedAt || prevScan.notifiedAt || 0) || 0;
                    const shouldUpdateNotified = hasNotified && notifiedAt >= prevNotifiedAt;
                    scanResults[symbol] = {
                        ...prevScan,
                        ...entry,
                        notifiedAt: shouldUpdateNotified ? notifiedAt : (prevScan.notifiedAt || entry.notifiedAt || 0),
                        expiresAt: snapshot?.expiresAt || expiresAt || prevScan.expiresAt || entry.expiresAt || 0,
                        lastNotifiedAt: shouldUpdateNotified ? notifiedAt : prevNotifiedAt,
                        lastNotifiedSignal: shouldUpdateNotified ? notifiedDirection : (prevScan.lastNotifiedSignal || prevScan.notifiedSignal || ''),
                        lastNotifiedDirection: shouldUpdateNotified ? notifiedDirection : (prevScan.lastNotifiedDirection || prevScan.notifiedDirection || ''),
                        lastNotifiedConfidence: shouldUpdateNotified ? notifiedConfidence : (prevScan.lastNotifiedConfidence || prevScan.notifiedConfidence || 0),
                        lastNotifiedPrice: shouldUpdateNotified ? notifiedPrice : (prevScan.lastNotifiedPrice || prevScan.notifiedPrice || 0),
                        lastNotifiedReason: shouldUpdateNotified ? (notifiedReason || reason) : (prevScan.lastNotifiedReason || prevScan.notifiedReason || '')
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
                return mergeSignalSnapshot(cached);
            } catch (_) {
                return false;
            }
        }

        async function dashFetchSignalSnapshot(options = {}) {
            if (_signalSnapshotFetchPromise) return _signalSnapshotFetchPromise;
            _signalSnapshotFetchPromise = (async () => {
                try {
                    const workerUrl = _getWorkerUrl();
                    if (!workerUrl) return false;
                    const headers = await getWorkerAuthHeadersForSignals(!!options.forceAuth);
                    const resp = await fetch(`${workerUrl}/signals/snapshot`, {
                        headers,
                        signal: AbortSignal.timeout(7000)
                    });
                    if (!resp.ok) return false;
                    const data = await resp.json();
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
                const remotePushReady = await registerRemotePushNotifications();
                if (remotePushReady) {
                    await stopBackgroundService();
                    dashFetchSignalSnapshot({ render: false }).catch(() => {});
                    return true;
                }

                if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.BackgroundScan) {
                    const prefs = getSignalPrefs();
                    const symbolsConfig = buildNativeSymbolsConfig(prefs);
                    const workerUrl = _getWorkerUrl();
                    const deviceId = (window.AuthClient && typeof window.AuthClient.getDeviceId === 'function')
                        ? String(window.AuthClient.getDeviceId() || '')
                        : '';
                    const userId = (window.AuthClient && typeof window.AuthClient.getUserId === 'function')
                        ? String(window.AuthClient.getUserId() || '')
                        : '';
                    await window.Capacitor.Plugins.BackgroundScan.start({
                        minConfidence: Math.max(70, Number(prefs.globalConfidence || 70) || 70),
                        symbolsConfig: JSON.stringify(symbolsConfig),
                        workerUrl,
                        deviceId,
                        userId
                    });
                    syncNativeBackgroundResults().catch(() => {});
                    return true;
                }
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
                        const dashSection = document.getElementById('dashboard');
                        const isDashActive = !!(dashSection && dashSection.classList.contains('active'));
                        if (isDashActive && typeof dashRefreshConfidence === 'function') {
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
                const minConfidence = Math.max(70, Number(rawEntry.minConfidence || getCryptoMinConfidence(symbol) || 70) || 70);

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
                const effectiveNotifiedConfidence = Math.max(persistedNotifiedConfidence, effectiveConfidence);
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
                    nextNotifiedAt > prevNotifiedAt &&
                    (_normalizeSignalDirection(persistedNotifiedDirection || effectiveDirection) !== 'NEUTRO') &&
                    effectiveNotifiedConfidence >= minConfidence
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
                        dashRecordCall(call.symbol, call.direction, call.confidence, call.gates, call.price, reason);
                    } catch (_) {}
                });
            }

            return changed;
        }

        let _nativeResultsSyncPromise = null;
        async function syncNativeBackgroundResults(options = {}) {
            if (_nativeResultsSyncPromise) return _nativeResultsSyncPromise;

            const force = !!options.force;
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
                    const changed = _mergeNativeBackgroundResults(payload?.results || {});
                    syncNativeBackgroundResults._lastSyncAt = Date.now();

                    if (changed) {
                        try { dashRenderConfidenceGrid(); dashRenderActiveSignals(); dashUpdateStats(); } catch {}
                    }

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

        function _getBalancedSignalQuality(analysis, finalSignal, minRequiredConfidence) {
            const direction = _normalizeSignalDirection(finalSignal?.direction || finalSignal?.signal);
            const confidence = Number(finalSignal?.confidence || 0) || 0;
            if (direction === 'NEUTRO' || confidence < minRequiredConfidence) {
                return { ok: true, reason: '' };
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
                const displacementDirection = _normalizeSignalDirection(analysis?.displacement?.direction || analysis?.displacement?.['1h']?.direction);
                const displacementOk = analysis?.displacement?.detected === true && (!displacementDirection || displacementDirection === 'NEUTRO' || displacementDirection === direction);
                const volumeOk = analysis?.volumeExpansion?.expanding === true || analysis?.volumeExpansion1h?.expanding === true || analysis?.volumeExpansion === true;
                if (confidence < 82 && !displacementOk && !volumeOk) {
                    return { ok: false, reason: 'sem deslocamento ou volume forte' };
                }
                return { ok: true, reason: '' };
            }

            const dominantPoints = direction === 'LONG' ? longPoints : shortPoints;
            const oppositePoints = direction === 'LONG' ? shortPoints : longPoints;
            const spread = dominantPoints - oppositePoints;
            const alignedCore = Number(points.alignedCore || 0) || 0;
            const displacementDirection = _normalizeSignalDirection(analysis?.displacement?.direction || analysis?.displacement?.['1h']?.direction);
            const displacementOk = analysis?.displacement?.detected === true && (!displacementDirection || displacementDirection === 'NEUTRO' || displacementDirection === direction);
            const volumeOk = analysis?.volumeExpansion?.expanding === true || analysis?.volumeExpansion1h?.expanding === true || analysis?.volumeExpansion === true;

            if (spread < 12) {
                return { ok: false, reason: 'spread baixo entre LONG e SHORT' };
            }
            if (confidence < 82 && alignedCore < 4) {
                return { ok: false, reason: 'consenso tecnico insuficiente' };
            }
            if (confidence < 82 && !displacementOk && !volumeOk) {
                return { ok: false, reason: 'sem deslocamento ou volume forte' };
            }

            return { ok: true, reason: '' };
        }

        function _isReliableSignalForNotification(analysis, minConf, resolved) {
            const finalSignal = resolved || _resolveScanSignal(analysis);
            const direction = finalSignal?.direction || 'NEUTRO';
            const confidence = Number(finalSignal?.confidence || analysis?.v4Confidence || 0);
            const minRequiredConfidence = Math.max(70, Number(minConf || 70) || 70);
            const balanced = _getBalancedSignalQuality(analysis, finalSignal, minRequiredConfidence);
            return {
                ok: direction !== 'NEUTRO' && confidence >= minRequiredConfidence && balanced.ok,
                confidence,
                direction,
                minRequiredConfidence,
                qualityReason: balanced.reason || ''
            };
        }

        // Resolve sinal final para dashboard (compatível com modelo legado e points model)
        function _resolveScanSignal(analysis) {
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

            return {
                signal,
                confidence,
                direction,
                minDirectionalConfidence
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
                        const gatesStr = `${analysis.v4GatesPassed || '?'}/${analysis.v4GatesTotal || '9'}`;
                        const entryPrice = Number(analysisData?.ticker?.lastPrice || analysis.indicators?.movingAverages?.currentPrice || 0);
                        const advancedReason = _isDirectionalSignal(direction)
                            ? `${direction} ${confidence}% (mín ${getCryptoMinConfidence(symbol)}%) · ${gatesStr} gates · TA Avançada`
                            : 'TA Avançada · Sem sinal direcional';

                        const minConf = getCryptoMinConfidence(symbol);
                        const quality = _isReliableSignalForNotification(analysis, minConf, resolved);
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
                            lastScanAt: now,
                            snapshotId: signalSnapshot?.id || dashResults[symbol]?.snapshotId || '',
                            expiresAt: signalSnapshot?.expiresAt || dashResults[symbol]?.expiresAt || 0,
                            source: 'ta_authoritative_js'
                        };

                        // Registrar call no banco somente quando respeita o mínimo configurado.
                        if (quality.ok && !dedupBlocked) {
                            const reason = `${direction} ${confidence}% (mín ${minConf}%) · Auto Scan`;
                            dashRecordCall(symbol, direction, confidence, gatesStr, entryPrice, reason);
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
                        lastResults[symbol].qualityRejected = !!(analysis.v4Signal || '').includes('CONFIRMED') && !quality.ok;
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
                initLocalNotifications().then(() => {
                    startBackgroundService();
                    startAutoScan();
                    // First scan immediately so active signals appear without section switching.
                    runAutoScan();
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
                    startBackgroundService();
                    startAutoScan();
                    syncNativeBackgroundResults({ force: true }).catch(() => {});
                    hydrateSignalSnapshotCache();
                    dashFetchSignalSnapshot({ render: false }).catch(() => {});
                    runAutoScan().catch(() => {});
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
                if (!prefs.masterEnabled) return;

                // Keep native background monitor alive across app hide/show transitions.
                startBackgroundService();

                if (document.visibilityState === 'visible') {
                    syncNativeBackgroundResults({ force: true }).catch(() => {});
                    runAutoScan();
                }
            } catch (e) {}
        });
        // ═══════════════════════════════════════

        // ═══════════════════════════════════════
        // DASHBOARD — Sinais, Histórico, Config
        // ═══════════════════════════════════════
        const DASH_HISTORY_KEY = 'vc_call_history';
        const DASH_MAX_HISTORY = 100;
        const DASH_CALLS_CLEAN_VERSION = '2026-04-30-clean-v3';
        const DASH_CALLS_CLEAN_MARKER = 'vc_calls_clean_version';
        const DASH_CALLS_CLEAN_EPOCH_MS = Date.parse('2026-04-30T14:50:00Z');
        const DASH_CALL_STRATEGY_VERSION = 'S3';
        let dashHistoryFilter = 'all';
        let _sharedCallsCache = null;
        let _sharedCallsCacheTs = 0;

        function dashResetCallStateOnce() {
            let didReset = false;
            try {
                if (localStorage.getItem(DASH_CALLS_CLEAN_MARKER) !== DASH_CALLS_CLEAN_VERSION) {
                    didReset = true;
                    [
                        DASH_HISTORY_KEY,
                        SCAN_LAST_RESULTS_KEY,
                        SIGNALS_REMOTE_SNAPSHOT_KEY,
                        SIGNAL_ANALYSIS_SNAPSHOT_KEY,
                        'vc_shared_call_history_v2',
                        'vc_shared_call_history_v3',
                        'vc_dash_ta_results'
                    ].forEach((key) => {
                        try { localStorage.removeItem(key); } catch (_) {}
                    });

                    for (let i = localStorage.length - 1; i >= 0; i--) {
                        const key = localStorage.key(i);
                        if (!key) continue;
                        if (key.startsWith('vc_shared_call_history_')) {
                            try { localStorage.removeItem(key); } catch (_) {}
                        }
                    }

                    localStorage.setItem(DASH_CALLS_CLEAN_MARKER, DASH_CALLS_CLEAN_VERSION);
                }
            } catch (_) {}

            _sharedCallsCache = null;
            _sharedCallsCacheTs = 0;

            if (!didReset) return;
            try {
                const plugin = window?.Capacitor?.Plugins?.BackgroundScan;
                if (plugin && typeof plugin.resetSignalState === 'function') {
                    plugin.resetSignalState().catch(() => {});
                }
            } catch (_) {}
        }

        dashResetCallStateOnce();

        function _getWorkerUrl() {
            return (window.APP_CONFIG && window.APP_CONFIG.CALENDAR_WORKER_URL) || '';
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
            if (Number.isFinite(DASH_CALLS_CLEAN_EPOCH_MS) && timestamp >= DASH_CALLS_CLEAN_EPOCH_MS && !strategyText.includes(DASH_CALL_STRATEGY_VERSION)) return null;
            const numericId = Number(call?.id);
            const id = Number.isFinite(numericId) && numericId > 0 ? numericId : timestamp;

            return {
                ...call,
                id,
                symbol,
                name: crypto.name || symbol,
                short: crypto.short || symbol.replace('USDT', ''),
                img: crypto.img || call?.img || '',
                price: entryPrice > 0 ? String(entryPrice) : '',
                entryPrice: entryPrice > 0 ? entryPrice : null,
                timestamp,
                time: timestamp,
                prices: call?.prices || { '1h': null, '2h': null, '4h': null },
                pnl: call?.pnl || { '1h': null, '2h': null, '4h': null },
                checked: call?.checked || { '1h': false, '2h': false, '4h': false }
            };
        }

        function _normalizeDashHistory(rawHistory) {
            return Array.isArray(rawHistory)
                ? rawHistory.map(_normalizeDashCall).filter(Boolean)
                : [];
        }

        function dashGetHistory() {
            // Return cached shared calls if available, otherwise fallback to localStorage
            if (_sharedCallsCache && (Date.now() - _sharedCallsCacheTs < 60000)) {
                return _normalizeDashHistory(_sharedCallsCache);
            }
            try { return _normalizeDashHistory(JSON.parse(localStorage.getItem(DASH_HISTORY_KEY)) || []); } catch { return []; }
        }
        function dashSaveHistory(arr) {
            try { localStorage.setItem(DASH_HISTORY_KEY, JSON.stringify(_normalizeDashHistory(arr).slice(0, DASH_MAX_HISTORY))); } catch {}
        }

        /**
         * Fetch shared call history from server.
         * Updates local cache and localStorage fallback.
         */
        async function dashFetchSharedHistory() {
            const workerUrl = _getWorkerUrl();
            if (!workerUrl) return dashGetHistory();
            try {
                const resp = await fetch(`${workerUrl}/calls?limit=200`, { signal: AbortSignal.timeout(5000) });
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                const data = await resp.json();
                if (data.success && Array.isArray(data.calls)) {
                    const normalizedCalls = _normalizeDashHistory(data.calls);
                    _sharedCallsCache = normalizedCalls;
                    _sharedCallsCacheTs = Date.now();
                    // Also save to localStorage as fallback
                    dashSaveHistory(normalizedCalls);
                    return normalizedCalls;
                }
            } catch (e) {
                console.warn('[Calls] Failed to fetch shared history:', e.message);
            }
            return dashGetHistory();
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
                if (confidence < 50 || !notifiedAt || (now - notifiedAt) > ACTIVE_SIGNAL_VALIDITY_MS) return;

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
         * Called from scanners when a directional signal >=70% fires.
         * Sends to shared database and also saves locally as fallback.
         */
        function dashRecordCall(symbol, direction, confidence, gates, price, reason) {
            const normalizedSymbol = _resolveKnownCallSymbol({ symbol }) || _normalizeScanSymbol(symbol);
            const normalizedDirection = String(direction || '').toUpperCase();
            const normalizedConfidence = Math.max(0, Math.min(100, Math.round(Number(confidence) || 0)));
            const normalizedPrice = Number(price) || 0;
            if (!normalizedSymbol) return false;
            if (typeof CRYPTO_DATABASE !== 'undefined' && !CRYPTO_DATABASE[normalizedSymbol]) return false;
            if (normalizedDirection !== 'LONG' && normalizedDirection !== 'SHORT') return false;
            if (normalizedConfidence < 50) return false;

            const history = dashGetHistory();
            const now = Date.now();
            const normalizedReason = String(reason || `${normalizedDirection} ${normalizedConfidence}%`).trim();
            const versionedReason = normalizedReason.includes(DASH_CALL_STRATEGY_VERSION)
                ? normalizedReason
                : `${DASH_CALL_STRATEGY_VERSION} | ${normalizedReason}`;
            const duplicate = history.find(c =>
                c.symbol === normalizedSymbol &&
                c.direction === normalizedDirection &&
                (now - Number(c.time || c.timestamp || 0)) < (30 * 60 * 1000)
            );
            if (duplicate) return false;

            const crypto = (typeof CRYPTO_DATABASE !== 'undefined' && CRYPTO_DATABASE[normalizedSymbol]) || {};
            const callData = {
                id: now,
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
                source: versionedReason || 'AUTO_SCAN',
                strategyVersion: DASH_CALL_STRATEGY_VERSION,
                timestamp: now,
                time: now,
                prices: { '1h': null, '2h': null, '4h': null },
                pnl: { '1h': null, '2h': null, '4h': null },
                checked: { '1h': false, '2h': false, '4h': false }
            };

            const saveLocalCall = (payload) => {
                const localHistory = dashGetHistory();
                const localDup = localHistory.find(c =>
                    c.symbol === normalizedSymbol &&
                    c.direction === normalizedDirection &&
                    (Date.now() - Number(c.time || c.timestamp || 0)) < (30 * 60 * 1000)
                );
                if (localDup) return false;
                localHistory.unshift(payload);
                dashSaveHistory(localHistory);
                return true;
            };

            // Send to shared database (fire and forget)
            const workerUrl = _getWorkerUrl();
            if (workerUrl) {
                (async () => {
                    const headers = { 'Content-Type': 'application/json' };
                    if (window.AuthClient && typeof window.AuthClient.getWriteAuthHeaders === 'function') {
                        try {
                            Object.assign(headers, await window.AuthClient.getWriteAuthHeaders());
                        } catch (authErr) {
                            console.warn('[Calls] Auth unavailable:', authErr.message);
                        }
                    }
                    let idempotencyKey = `call:${normalizedSymbol}:${normalizedDirection}:${Date.now().toString(36)}`;
                    if (window.AuthClient && typeof window.AuthClient.createIdempotencyKey === 'function') {
                        idempotencyKey = window.AuthClient.createIdempotencyKey(`call:${normalizedSymbol}:${normalizedDirection}`);
                    }
                    headers['Idempotency-Key'] = idempotencyKey;

                    const body = JSON.stringify(callData);
                    let lastErr = null;
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

                            return await resp.json();
                        } catch (err) {
                            lastErr = err;
                            if (attempt < 3) {
                                await new Promise(resolve => setTimeout(resolve, 150 * attempt));
                            }
                        }
                    }

                    throw (lastErr || new Error('Calls sync failed'));

                })().then(data => {
                    if (data.success && !data.duplicate) {
                        const persisted = {
                            ...callData,
                            ...(data.call || {}),
                            // Mantém metadados locais necessários para avaliação 1h/2h/4h
                            entryPrice: callData.entryPrice,
                            timestamp: callData.timestamp,
                            prices: callData.prices,
                            pnl: callData.pnl,
                            checked: callData.checked
                        };
                        saveLocalCall(persisted);
                        // Invalidate cache so next render fetches fresh
                        _sharedCallsCacheTs = 0;
                    }
                }).catch(e => {
                    console.warn('[Calls] Failed to sync call:', e.message);
                    // Fallback local when worker is unavailable
                    saveLocalCall(callData);
                });
            } else {
                // No worker configured: local-only fallback
                saveLocalCall(callData);
            }

            return true;
        }

        /**
         * Main load function called when entering Dashboard section.
         */
        function dashLoad() {
            _dashHydrating = true;
            hydrateSignalSnapshotCache();
            dashSyncMasterToggle();
            dashRenderActiveSignals();
            dashRenderConfidenceGrid();
            dashRenderHistory();
            dashUpdateStats();
            dashRenderCryptoSettings();
            dashUpdateHomeSummary();
            dashFetchSharedHistory()
                .then((calls) => {
                    if (dashHydrateActiveSignalsFromCalls(calls)) {
                        dashRenderActiveSignals();
                        dashUpdateStats();
                    }
                })
                .catch(() => {});
            dashFetchSignalSnapshot()
                .then((ok) => {
                    if (ok) {
                        dashRenderActiveSignals();
                        dashRenderConfidenceGrid();
                        dashUpdateStats();
                    }
                })
                .catch(() => {});
            const openedFromNativeNotification = Number(window.__visorNativeNotifOpenedAt || 0) > 0
                && (Date.now() - Number(window.__visorNativeNotifOpenedAt || 0)) < 15000;
            syncNativeBackgroundResults({ force: true })
                .catch(() => {})
                .finally(() => {
                    _dashHydrating = false;
                    try {
                        dashRenderActiveSignals();
                        dashRenderConfidenceGrid();
                        dashUpdateStats();
                        pushAuthoritativeResultsToNative().catch(() => {});
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
            if (status) status.textContent = prefs.masterEnabled ? 'Monitoramento Ativo' : 'Monitoramento Inativo';
            if (detail) {
                const total = Object.keys(typeof CRYPTO_DATABASE !== 'undefined' ? CRYPTO_DATABASE : {}).length;
                let enabled = 0;
                Object.keys(typeof CRYPTO_DATABASE !== 'undefined' ? CRYPTO_DATABASE : {}).forEach(sym => {
                    if (prefs.cryptos[sym]?.enabled === true) enabled++;
                });
                detail.textContent = prefs.masterEnabled
                    ? `Escaneando ${enabled} criptos a cada 5 min`
                    : 'Ative para receber sinais de trading';
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
                    ? Math.max(70, Number(snapshot.minConfidence || baseMinConf || 70) || 70)
                    : baseMinConf;

                if (!isCryptoNotificationEnabled(symbol) || snapshotDirection === 'NEUTRO' || snapshotConfidence < minConf) return;

                const notifiedAt = Number(
                    snapshot?.notifiedAt ||
                    (data._fromNotified ? (data._eventTs || sr.lastNotifiedAt || sr.notifiedAt || 0) : (sr.lastNotifiedAt || sr.notifiedAt || 0))
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
        const DASH_SCAN_CACHE_KEY = 'vc_dash_ta_results';
        const DASH_SCAN_CACHE_TTL = 5 * 60 * 1000; // 5 min stale threshold for auto-rescan

        function _getDashTAResults() {
            try { return JSON.parse(localStorage.getItem(DASH_SCAN_CACHE_KEY)) || {}; } catch { return {}; }
        }
        function _saveDashTAResults(data) {
            try { localStorage.setItem(DASH_SCAN_CACHE_KEY, JSON.stringify(data)); } catch {}
        }

        // Render a single cell's HTML
        function _confCellHtml(symbol, data, r) {
            const conf = Math.max(0, Math.min(100, Math.round(Number(r.confidence || 0) || 0)));
            const signal = r.signal || '';
            const direction = r.direction || '';
            const isLong = conf >= 50 && (direction === 'LONG' || signal.includes('LONG'));
            const isShort = conf >= 50 && (direction === 'SHORT' || signal.includes('SHORT'));
            const hasData = conf > 0;
            const loading = r._loading;

            let confColor = 'var(--text-muted)';
            if (conf >= 80) confColor = '#22c55e';
            else if (conf >= 65) confColor = '#f59e0b';
            else if (conf >= 40) confColor = '#6366f1';

            let signalText, signalColor;
            if (loading) {
                signalText = '<i class="fas fa-circle-notch fa-spin" style="font-size:8px;margin-right:3px;"></i>Analisando...';
                signalColor = '#6366f1';
            } else if (hasData && (isLong || isShort)) {
                signalText = isLong ? '▲ LONG' : '▼ SHORT';
                signalColor = isLong ? '#22c55e' : '#ef4444';
            } else if (hasData) {
                signalText = '● NEUTRO';
                signalColor = '#f59e0b';
            } else {
                signalText = 'Aguardando...';
                signalColor = 'var(--text-muted)';
            }

            return `
            <div class="dash-conf-cell" id="dash-conf-${symbol}">
                <img src="${data.img}" style="width:26px;height:26px;border-radius:50%;flex-shrink:0;" onerror="this.style.display='none'">
                <div style="flex:1;min-width:0;">
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:3px;">
                        <span style="font-size:11px;font-weight:700;color:var(--text-primary);">${data.short}</span>
                        <span style="font-size:11px;font-weight:800;color:${confColor};">${hasData ? conf + '%' : '--'}</span>
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

            Object.entries(CRYPTO_DATABASE).forEach(([symbol, data]) => {
                const r = _resolveDashboardSignalData(symbol, scanResults, dashResults);
                const ts = r.lastScanAt || 0;
                if (ts > latestScan) latestScan = ts;
                if (!r.confidence && !ts) hasMissing = true;
                html += _confCellHtml(symbol, data, r);
            });

            grid.innerHTML = html;

            const updatedEl = document.getElementById('dash-conf-updated');
            if (updatedEl) {
                updatedEl.textContent = latestScan > 0 ? 'Atualizado ' + dashGetTimeAgo(latestScan) : 'Escaneando...';
            }

            // Prefer the all-symbol remote snapshot so SINAIS opens instantly.
            const oldest = latestScan || 0;
            if (hasMissing || (Date.now() - oldest > DASH_SCAN_CACHE_TTL)) {
                const hadCachedSnapshot = hydrateSignalSnapshotCache();
                dashFetchSignalSnapshot()
                    .then((ok) => {
                        if (!ok && !hadCachedSnapshot) {
                            dashProgressiveScan();
                        }
                    })
                    .catch(() => {
                        if (!hadCachedSnapshot) dashProgressiveScan();
                    });
            }
        }

        /**
         * Progressive TA scan — runs the EXACT same analysis pipeline as the HOME technical analysis.
         * Processes one crypto at a time, updating each grid cell as results arrive.
         * Uses TA cache to avoid re-fetching if the user already opened that crypto recently.
         */
        async function dashProgressiveScan(options = {}) {
            if (_dashScanRunning) return;
            _dashScanRunning = true;
            _dashScanAbort = false;
            window._taScanContext = true;
            const forceRescan = options && options.force === true;

            const cryptos = Object.entries(typeof CRYPTO_DATABASE !== 'undefined' ? CRYPTO_DATABASE : {});
            const dashResults = _getDashTAResults();
            const scanResults = getScanLastResults();
            const now = Date.now();

            const updatedEl = document.getElementById('dash-conf-updated');

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

            // Filter cryptos that need scanning
            const toScan = cryptos.filter(([symbol]) => {
                if (_isSymbolConfidenceFrozen(symbol, scanResults, now)) {
                    return false;
                }
                if (forceRescan) return true;
                const existing = dashResults[symbol];
                return !(existing && existing.lastScanAt && (now - existing.lastScanAt < DASH_SCAN_CACHE_TTL) && existing.confidence);
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

            // Process in batches of 3 for speed
            const BATCH_SIZE = 3;
            for (let i = 0; i < toScan.length; i += BATCH_SIZE) {
                if (_dashScanAbort) break;

                const batch = toScan.slice(i, i + BATCH_SIZE);
                if (updatedEl) {
                    const names = batch.map(([,d]) => d.short).join(', ');
                    updatedEl.innerHTML = `<i class="fas fa-circle-notch fa-spin" style="font-size:8px;margin-right:3px;"></i> ${names}... (${Math.min(i + BATCH_SIZE, toScan.length)}/${toScan.length})`;
                }

                await Promise.allSettled(
                    batch.map(async ([symbol, data]) => {
                        try {
                            const result = await _scanOneCrypto(symbol, data);
                            const resultAnalysis = result.analysisSnapshot;
                            delete result.analysisSnapshot;
                            const minConf = getCryptoMinConfidence(symbol);
                            const quality = _isReliableSignalForNotification(resultAnalysis, minConf, result);
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
                                dashRecordCall(symbol, result.direction, result.confidence, result.gates || '', result.price || 0, reason);
                            }
                            dashResults[symbol] = result;

                            if (!scanResults[symbol]) scanResults[symbol] = {};
                            scanResults[symbol].signal = result.signal;
                            scanResults[symbol].direction = result.direction;
                            scanResults[symbol].finalDirection = result.direction;
                            scanResults[symbol].confidence = result.confidence;
                            scanResults[symbol].finalConfidence = result.confidence;
                            scanResults[symbol].price = result.price;
                            scanResults[symbol].lastScanAt = result.lastScanAt;
                            scanResults[symbol].qualityRejected = result.direction !== 'NEUTRO' && !quality.ok;
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
                        } catch (err) {
                            const errCell = document.getElementById(`dash-conf-${symbol}`);
                            if (errCell) {
                                const fallbackData = _resolveDashboardSignalData(symbol, scanResults, dashResults);
                                errCell.outerHTML = _confCellHtml(symbol, data, fallbackData || {});
                            }
                        }
                    })
                );

                _saveDashTAResults(dashResults);
                saveScanLastResults(scanResults);
                pushAuthoritativeResultsToNative().catch(() => {});
                try { dashRenderActiveSignals(); } catch {}

                // Short delay between batches
                if (!_dashScanAbort && i + BATCH_SIZE < toScan.length) {
                    await new Promise(r => setTimeout(r, 800));
                }
            }

            _dashScanRunning = false;
            window._taScanContext = false;
            pushAuthoritativeResultsToNative(true).catch(() => {});

            // Disconnect all WebSockets opened during scan to prevent memory leak
            try { if (window.TAEngineV4 && window.TAEngineV4.disconnectAllOrderFlowWS) window.TAEngineV4.disconnectAllOrderFlowWS(); } catch(e) {}
            try { if (window.RealtimeCVD && window.RealtimeCVD.disconnectAll) window.RealtimeCVD.disconnectAll(); } catch(e) {}

            // Final update
            if (updatedEl) {
                updatedEl.textContent = 'Atualizado agora';
            }

            // Update active signals with new data
            try { dashRenderActiveSignals(); dashUpdateStats(); } catch {}
        }

        function dashRefreshConfidence() {
            if (_dashScanRunning) return;
            syncNativeBackgroundResults({ force: true }).catch(() => {});
            const updatedEl = document.getElementById('dash-conf-updated');
            if (updatedEl) {
                updatedEl.innerHTML = '<i class="fas fa-circle-notch fa-spin" style="font-size:8px;margin-right:3px;"></i> Atualizando sinais...';
            }
            dashFetchSignalSnapshot({ forceAuth: true })
                .then((ok) => { if (!ok) dashProgressiveScan({ force: true }); })
                .catch(() => dashProgressiveScan({ force: true }));
            try { dashRenderHistory(); } catch {}
        }

        // Auto-refresh confidence every 5 min while dashboard is visible
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
                        if (!isDashActive) return;

                        syncNativeBackgroundResults({ force: true })
                            .catch(() => false)
                            .finally(() => {
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
                const dashSection = document.getElementById('dashboard');
                if (dashSection && dashSection.classList.contains('active')) {
                    dashRefreshConfidence();
                } else {
                    dashStopConfAutoRefresh();
                }
            }, 5 * 60 * 1000); // 5 min
        }
        function dashStopConfAutoRefresh() {
            if (_dashConfAutoRefreshId) {
                clearInterval(_dashConfAutoRefreshId);
                _dashConfAutoRefreshId = null;
            }
        }

        // Abort scan when leaving dashboard section
        function dashAbortScan() {
            if (!_dashScanRunning) {
                _dashScanAbort = true;
                window._taScanContext = false;
            }
            dashStopConfAutoRefresh();
            dashClearNativeWarmupSync();
            // Cleanup any WebSockets opened during scan
            if (!_dashScanRunning) {
                try { if (window.TAEngineV4 && window.TAEngineV4.disconnectAllOrderFlowWS) window.TAEngineV4.disconnectAllOrderFlowWS(); } catch(e) {}
                try { if (window.RealtimeCVD && window.RealtimeCVD.disconnectAll) window.RealtimeCVD.disconnectAll(); } catch(e) {}
            }
        }

        function dashRenderHistory() {
            const container = document.getElementById('dash-history-list');
            if (!container) return;

            document.querySelectorAll('.dash-hist-filter').forEach((el) => {
                const isActive = String(el.dataset.filter || '').toLowerCase() === dashHistoryFilter;
                el.classList.toggle('active', isActive);
            });

            // Show local data immediately, then refresh from server
            _dashRenderHistoryFromData(dashGetHistory());

            // Fetch shared history async and re-render
            dashFetchSharedHistory().then(calls => {
                _dashRenderHistoryFromData(calls);
            });
        }

          const DASH_OUTCOME_CACHE_KEY = 'VISOR_CALL_OUTCOME_CACHE_V2';
          const DASH_OUTCOME_HORIZONS = [
              { key: '1h', label: '1H', ms: 60 * 60 * 1000 },
              { key: '2h', label: '2H', ms: 2 * 60 * 60 * 1000 },
              { key: '4h', label: '4H', ms: 4 * 60 * 60 * 1000 }
          ];
          const _pnlCache = (() => {
              try { return JSON.parse(localStorage.getItem(DASH_OUTCOME_CACHE_KEY) || '{}'); }
              catch { return {}; }
          })();

          function _normalizeBinanceSymbol(raw) {
              const cleaned = String(raw || '').toUpperCase().replace(/[\/-]/g, '');
              if (!cleaned) return '';
              return cleaned.endsWith('USDT') ? cleaned : `${cleaned}USDT`;
          }

          function _formatUsdCompact(value) {
              const n = Number(value);
              if (!Number.isFinite(n) || n <= 0) return '--';
              if (n >= 1000) return '$' + n.toLocaleString(undefined, { maximumFractionDigits: 2 });
              if (n >= 1) return '$' + n.toFixed(4);
              return '$' + n.toFixed(6);
          }

          function _getCallHistoryDomId(call) {
              const raw = call?.id != null
                  ? String(call.id)
                  : `${call?.symbol || 'call'}-${Number(call?.time || call?.timestamp || 0)}`;
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

          function _getOutcomeCacheEntry(call) {
              const domId = _getCallHistoryDomId(call);
              const cacheKey = call?.id != null ? String(call.id) : domId;
              if (!_pnlCache[cacheKey] || typeof _pnlCache[cacheKey] !== 'object') {
                  _pnlCache[cacheKey] = { horizons: {}, updatedAt: 0 };
              }
              return _pnlCache[cacheKey];
          }

          function _findCloseAtOrAfter(klines, targetTs) {
              if (!Array.isArray(klines) || klines.length === 0) return null;
              for (let i = 0; i < klines.length; i++) {
                  const row = klines[i];
                  const candleTs = Number(row?.[0] || 0);
                  if (candleTs >= targetTs) {
                      const close = Number(row?.[4]);
                      if (Number.isFinite(close) && close > 0) return close;
                      return null;
                  }
              }
              return null;
          }

          function _buildOutcomeBadgesHtml(call, cacheEntry, now) {
              const callTime = Number(call?.time || call?.timestamp || 0);
              const entryPrice = Number(call?.price || call?.entryPrice || 0);
              const isLong = String(call?.direction || '').toUpperCase() === 'LONG';

              return DASH_OUTCOME_HORIZONS.map((h) => {
                  const horizonTs = callTime + h.ms;
                  if (!callTime || now < horizonTs) {
                      return `<span class="dash-outcome-badge pending">${h.label}</span>`;
                  }

                  const horizonData = cacheEntry?.horizons?.[h.key] || {};
                  const horizonPrice = Number(horizonData.price);
                  if (!Number.isFinite(horizonPrice) || horizonPrice <= 0 || entryPrice <= 0) {
                      return `<span class="dash-outcome-badge neutral">${h.label} --</span>`;
                  }

                  const pct = isLong
                      ? ((horizonPrice - entryPrice) / entryPrice) * 100
                      : ((entryPrice - horizonPrice) / entryPrice) * 100;
                  const isWin = pct > 0;
                  const cssClass = isWin ? 'win' : pct < 0 ? 'loss' : 'neutral';
                  const icon = isWin ? '✅' : pct < 0 ? '❌' : '➖';
                  const pctText = `${pct > 0 ? '+' : ''}${pct.toFixed(2)}%`;
                  return `<span class="dash-outcome-badge ${cssClass}">${h.label} ${icon} ${pctText}</span>`;
              }).join('');
          }

          function _computeAssertiveness(history) {
              const now = Date.now();
              let evaluated = 0;
              let wins = 0;

              history.forEach((call) => {
                  const callTime = Number(call?.time || call?.timestamp || 0);
                  const entryPrice = Number(call?.price || call?.entryPrice || 0);
                  const isLong = String(call?.direction || '').toUpperCase() === 'LONG';
                  if (!callTime || entryPrice <= 0) return;

                  const cacheEntry = _getOutcomeCacheEntry(call);
                  DASH_OUTCOME_HORIZONS.forEach((h) => {
                      if (now < callTime + h.ms) return;
                      const horizonData = cacheEntry?.horizons?.[h.key] || {};
                      const horizonPrice = Number(horizonData.price);
                      if (!Number.isFinite(horizonPrice) || horizonPrice <= 0) return;

                      evaluated++;
                      const pnl = isLong
                          ? ((horizonPrice - entryPrice) / entryPrice) * 100
                          : ((entryPrice - horizonPrice) / entryPrice) * 100;
                      if (pnl > 0) wins++;
                  });
              });

              if (evaluated === 0) return { evaluated: 0, assertiveness: null };
              return {
                  evaluated,
                  assertiveness: Math.round((wins / evaluated) * 100)
              };
          }

          async function evaluateCallOutcomes(call) {
              const callTime = Number(call?.time || call?.timestamp || 0);
              const symbol = _normalizeBinanceSymbol(call?.symbol);
              if (!callTime || !symbol) return;

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
                  const price = Number(cacheEntry?.horizons?.[h.key]?.price);
                  return !Number.isFinite(price) || price <= 0;
              });
              if (missingHorizons.length === 0) return;

              try {
                  const maxHorizonMs = Math.max(...missingHorizons.map((h) => h.ms));
                  const endTs = Math.min(now, callTime + maxHorizonMs + (5 * 60 * 1000));
                  const limit = Math.min(500, Math.max(5, Math.ceil((endTs - callTime) / 60000) + 3));
                  const resp = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1m&startTime=${callTime}&limit=${limit}`);
                  const klines = await resp.json();
                  if (!Array.isArray(klines) || klines.length === 0) return;

                  missingHorizons.forEach((h) => {
                      const targetTs = callTime + h.ms;
                      const close = _findCloseAtOrAfter(klines, targetTs);
                      cacheEntry.horizons[h.key] = {
                          price: Number.isFinite(close) && close > 0 ? close : null,
                          ts: targetTs
                      };
                  });
                  cacheEntry.updatedAt = Date.now();
                  _persistOutcomeCache();

                  if (rowEl) {
                      rowEl.innerHTML = _buildOutcomeBadgesHtml(call, cacheEntry, Date.now());
                  }
                  dashUpdateStats();
              } catch (e) {
                  if (rowEl) {
                      rowEl.innerHTML = _buildOutcomeBadgesHtml(call, cacheEntry, Date.now());
                  }
              }
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

              if (history.length === 0) {
                  container.innerHTML = `
                  <div class="dash-empty-state">
                      <i class="fas fa-clock-rotate-left" style="font-size:32px;margin-bottom:12px;opacity:0.2;"></i>
                      <div style="font-size:14px;font-weight:700;color:var(--text-secondary);margin-bottom:4px;">Nenhum histórico ainda</div>
                      <div style="font-size:12px;">As últimas 30 calls registradas aparecem aqui automaticamente.</div>
                  </div>`;
                  return;
              }

              let html = '';
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
                  <div class="dash-history-card" onclick="dashShowCallDetail(${call.id})">
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

              setTimeout(() => {
                  const queue = [...callsToEval];
                  const workers = Array.from({ length: 4 }, async () => {
                      while (queue.length > 0) {
                          const nextCall = queue.shift();
                          if (!nextCall) break;
                          await evaluateCallOutcomes(nextCall);
                      }
                  });
                  Promise.allSettled(workers).then(() => {
                      dashUpdateStats();
                  });
              }, 50);
          }

        function dashShowCallDetail(callId) {
            const history = dashGetHistory();
            const call = history.find(h => h.id === callId);
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
            const assertivenessText = (assertiveness.assertiveness != null && assertiveness.evaluated >= 3)
                ? `${assertiveness.assertiveness}%`
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
            if (slider) slider.value = Math.max(70, prefs.globalConfidence || 70);
            if (label) label.textContent = (prefs.globalConfidence || 70) + '%';

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
                const confidence = Math.max(70, cp.confidence || prefs.globalConfidence || 70);

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
                            <input type="range" class="signal-conf-slider" min="70" max="100" value="${confidence}" step="5"
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
            const newGlobal = parseInt(slider.value);
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
                        confidenceThreshold: prefs.cryptos[symbol].confidence || prefs.globalConfidence || 70
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

