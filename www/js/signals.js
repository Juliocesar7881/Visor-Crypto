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
                'price_1h','price_4h','price_12h','price_24h',
                'pnl_1h','pnl_4h','pnl_12h','pnl_24h',
                'win_1h','win_4h','win_12h','win_24h',
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
                    call.prices?.['1h']||'', call.prices?.['4h']||'', call.prices?.['12h']||'', call.prices?.['24h']||'',
                    call.pnl?.['1h']??'', call.pnl?.['4h']??'', call.pnl?.['12h']??'', call.pnl?.['24h']??'',
                    isWin('1h'), isWin('4h'), isWin('12h'), isWin('24h'),
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
            
            const checked12h = history.filter(c => c.checked?.['12h']);
            
            // Win rate por regime
            const byRegime = {};
            checked12h.forEach(c => {
                const regime = c.analytics?.regime || 'unknown';
                if (!byRegime[regime]) byRegime[regime] = { wins: 0, losses: 0, total: 0 };
                byRegime[regime].total++;
                const isWin = c.direction === 'LONG' ? c.prices?.['12h'] > c.entryPrice : c.prices?.['12h'] < c.entryPrice;
                if (isWin) byRegime[regime].wins++; else byRegime[regime].losses++;
            });
            
            // Win rate por sessão
            const bySession = {};
            checked12h.forEach(c => {
                const session = c.analytics?.session || 'unknown';
                if (!bySession[session]) bySession[session] = { wins: 0, losses: 0, total: 0 };
                bySession[session].total++;
                const isWin = c.direction === 'LONG' ? c.prices?.['12h'] > c.entryPrice : c.prices?.['12h'] < c.entryPrice;
                if (isWin) bySession[session].wins++; else bySession[session].losses++;
            });
            
            // Win rate por gate count
            const byGateCount = {};
            checked12h.forEach(c => {
                const gates = c.analytics?.v4GatesPassed || 0;
                const key = gates + ' gates';
                if (!byGateCount[key]) byGateCount[key] = { wins: 0, losses: 0, total: 0 };
                byGateCount[key].total++;
                const isWin = c.direction === 'LONG' ? c.prices?.['12h'] > c.entryPrice : c.prices?.['12h'] < c.entryPrice;
                if (isWin) byGateCount[key].wins++; else byGateCount[key].losses++;
            });
            
            return {
                totalCalls: history.length,
                checked12h: checked12h.length,
                byRegime, bySession, byGateCount
            };
        }
        
        function renderCallHistorySection(currentSymbol) {
            const history = getCallHistory();
            const symbolHistory = history.filter(c => c.symbol === currentSymbol);
            const allStats = getCallStats(history);
            
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
            
            const recentCalls = [...history].reverse().slice(0, 15);
            
            let html = `
                <!-- CALL HISTORY -->
                <div class="ta-section" style="border: 1px solid rgba(59,130,246,0.25); background: linear-gradient(135deg, rgba(59,130,246,0.04) 0%, transparent 100%);">
                    <div class="ta-section-header">
                        <div class="ta-section-icon" style="background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);">
                            <span style="font-size: 18px;">📋</span>
                        </div>
                        <div>
                            <div class="ta-section-title">Histórico de Calls</div>
                            <div class="ta-section-subtitle">${history.length} calls registradas • Verificação em 1h, 4h, 12h, 24h</div>
                        </div>
                    </div>`;
            
            // Stats summary
            if (history.length > 0) {
                html += `
                    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 12px;">`;
                
                for (const iv of CALL_CHECK_INTERVALS) {
                    const s = allStats.byInterval[iv.key];
                    const wr = s.total > 0 ? ((s.wins / s.total) * 100).toFixed(0) : '—';
                    const wrColor = s.total === 0 ? 'var(--text-muted)' : parseFloat(wr) >= 55 ? '#22c55e' : parseFloat(wr) >= 45 ? '#f59e0b' : '#ef4444';
                    html += `
                        <div style="background: var(--bg-tertiary); padding: 10px; border-radius: 10px; text-align: center;">
                            <div style="font-size: 9px; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Win Rate ${iv.label}</div>
                            <div style="font-size: 20px; font-weight: 800; color: ${wrColor};">${wr}${s.total > 0 ? '%' : ''}</div>
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
                    const isCurrent = call.symbol === currentSymbol;
                    
                    html += `
                        <div style="padding: 10px; background: ${isCurrent ? 'rgba(59,130,246,0.08)' : 'var(--bg-tertiary)'}; border-radius: 8px; border-left: 3px solid ${dirColor}; ${isCurrent ? 'border: 1px solid rgba(59,130,246,0.2);' : ''}">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                                <div style="display: flex; align-items: center; gap: 6px;">
                                    <span style="font-size: 12px; font-weight: 800; color: ${dirColor};">${dirIcon} ${call.direction}</span>
                                    <span style="font-size: 11px; font-weight: 600; color: var(--text-primary);">${call.name || call.symbol}</span>
                                    <span style="font-size: 9px; padding: 1px 5px; border-radius: 4px; background: rgba(139,92,246,0.15); color: #a78bfa; font-weight: 600;">${call.confidence}%</span>
                                </div>
                                <span style="font-size: 9px; color: var(--text-muted);">${dateStr}</span>
                            </div>
                            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px;">`;
                    
                    for (const iv of CALL_CHECK_INTERVALS) {
                        const p = call.prices[iv.key];
                        const isWin = p ? (isLong ? p > call.entryPrice : p < call.entryPrice) : null;
                        const resultColor = isWin === null ? 'var(--text-muted)' : isWin ? '#22c55e' : '#ef4444';
                        const resultIcon = isWin === null ? '⏳' : isWin ? '✅' : '❌';
                        const resultText = isWin === null ? 'Pendente' : isWin ? 'Win' : 'Loss';
                        const resultBg = isWin === null ? 'var(--bg-card)' : isWin ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)';
                        
                        html += `
                                <div style="text-align: center; padding: 8px 4px; background: ${resultBg}; border-radius: 8px;">
                                    <div style="font-size: 9px; color: var(--text-muted); font-weight: 600;">${iv.label}</div>
                                    <div style="font-size: 18px; margin: 2px 0;">${resultIcon}</div>
                                    <div style="font-size: 10px; font-weight: 700; color: ${resultColor};">${resultText}</div>
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
                        <div style="font-size: 12px; color: var(--text-muted);">Nenhuma call registrada ainda</div>
                        <div style="font-size: 10px; color: var(--text-muted); margin-top: 4px;">Calls com confiança ≥70% são salvas automaticamente</div>
                    </div>`;
            }
            
            html += `</div>`;
            return html;
        }
        
        // Background price checker — runs every 15 minutes
        setInterval(() => checkCallPrices(), 900000);
        // Also check on load
        setTimeout(() => checkCallPrices(), 5000);
        
        async function openTechnicalAnalysis() {
            if (!currentChartSymbol) return;
            
            taCurrentSymbol = currentChartSymbol;
            taNavigationStack.push({ type: 'chart', symbol: currentChartSymbol });
            
            const modal = document.getElementById('ta-modal');
            const body = document.getElementById('ta-modal-body');
            const crypto = CRYPTO_DATABASE[currentChartSymbol];
            if (!crypto || !modal || !body) return;
            
            // Atualizar título
            const titleEl = document.querySelector('.ta-modal-header-title');
            if (titleEl) titleEl.textContent = `Análise Técnica - ${crypto.short}`;
            
            // Mostrar loading
            body.innerHTML = `
                <div class="ta-loading">
                    <div class="ta-loading-spinner"></div>
                    <div class="ta-loading-text">Analisando ${crypto.name}...</div>
                </div>
            `;
            
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
            
            // 🎯 Show interstitial ad while analysis loads in background
            showInterstitialAd().catch(() => {});
            
            // Init notification bell state
            
            // Connect Real CVD WebSocket for this symbol
            if (window.RealtimeCVD) {
                try { window.RealtimeCVD.connect(currentChartSymbol); } catch(e) {}
            }
            initNotifBellState();
            
            // Adicionar ao histórico do navegador
            if (window.history && window.history.pushState) {
                window.history.pushState({ page: 'technical-analysis', symbol: currentChartSymbol }, '', '');
            }
            
            // Verificar cache
            const cachedData = getTACache(currentChartSymbol);
            if (cachedData && cachedData.analysis) {
                renderTechnicalAnalysis(cachedData.analysis, crypto);
                // Iniciar auto-refresh mesmo com cache
                startTAAutoRefresh(currentChartSymbol);
                return;
            }
            
            // Buscar dados em paralelo (incluindo Macro/News layer v2 + Big Tech & Macro)
            try {
                const [analysisData, macroNewsData, bigTechData] = await Promise.all([
                    fetchTechnicalAnalysisData(currentChartSymbol),
                    (window.TAEngineV2 && window.TAEngineV2.fetchMacroNewsLayer) ?
                        window.TAEngineV2.fetchMacroNewsLayer(currentChartSymbol) :
                        Promise.resolve(null),
                    (window.TAEngineV2 && window.TAEngineV2.fetchBigTechAndMacro) ?
                        window.TAEngineV2.fetchBigTechAndMacro() :
                        Promise.resolve(null)
                ]);
                
                const analysis = generateTechnicalAnalysis(analysisData, currentChartSymbol);
                
                // Inject macro/news data into analysis
                analysis.macroNews = macroNewsData;
                analysis.bigTechMacro = bigTechData;
                if (macroNewsData && macroNewsData.totalImpact !== 0 && window.TAEngineV2) {
                    // Re-apply contextual scoring with macro data
                    const V2 = window.TAEngineV2;
                    const reScored = V2.applyContextualScoring(
                        analysis.confluenceDetails, analysis.marketRegime, analysis.marketStructure,
                        analysis.cvdAdvanced, macroNewsData, analysis.volatilityMetrics
                    );
                    analysis.confluenceSummary.score = (parseFloat(analysis.confluenceSummary.score) + macroNewsData.totalImpact).toFixed(1);
                    analysis.contextualAdjustments = reScored.adjustments;
                }
                // Add Big Tech score to overall
                if (bigTechData && bigTechData.bigTechScore !== 0) {
                    analysis.confluenceSummary.score = (parseFloat(analysis.confluenceSummary.score) + bigTechData.bigTechScore).toFixed(1);
                }
                // Inject bigTechMacro into indicators for AI summary
                if (bigTechData) {
                    analysis.indicators = analysis.indicators || {};
                    analysis.indicators.bigTechMacro = bigTechData;
                }
                
                // V3 Enhancement — crash detection, decorrelation, position sizing, on-chain, edge
                if (window.TAEngineV3 && window.TAEngineV3.enhanceAnalysis) {
                    try {
                        const enhanced = await window.TAEngineV3.enhanceAnalysis(analysis, analysisData, currentChartSymbol);
                        Object.assign(analysis, enhanced);
                        // Regenerate AI summary with V3 corrected signal/confidence
                        if (enhanced.v3Signal) {
                            analysis.aiSummary = generateAISummary(
                                enhanced.v3SignalType || analysis.signalType,
                                enhanced.v3Confidence || analysis.confidence,
                                analysis.indicators,
                                currentChartSymbol
                            );
                        }
                    } catch (v3err) { /* console.warn('[V3] Enhancement error:', v3err); */ }
                }
                
                // V4 Enhancement — Reactive Trading Intelligence + Collective Learning
                if (window.TAEngineV4 && window.TAEngineV4.enhanceWithReactive) {
                    try {
                        const v4Enhanced = await window.TAEngineV4.enhanceWithReactive(analysis, analysisData, currentChartSymbol);
                        Object.assign(analysis, v4Enhanced);
                        // Regenerate AI summary with V4 reactive signal
                        if (v4Enhanced.v4Signal) {
                            const v4Dir = v4Enhanced.v4Signal.includes('LONG') ? 'long' : v4Enhanced.v4Signal.includes('SHORT') ? 'short' : 'neutral';
                            analysis.aiSummary = generateAISummary(
                                v4Dir,
                                v4Enhanced.v4Confidence || analysis.confidence,
                                analysis.indicators,
                                currentChartSymbol
                            );
                            // Append reactive summary to AI text
                            if (v4Enhanced.reactiveSummary) {
                                analysis.aiSummary += '\n\n━━━ ANÁLISE AVANÇADA ━━━\n' + v4Enhanced.reactiveSummary;
                            }
                        }
                    } catch (v4err) { /* console.warn('[V4] Enhancement error:', v4err); */ }
                }
                
                // Salvar no cache
                setTACache(currentChartSymbol, { analysis });
                
                // Renderizar
                renderTechnicalAnalysis(analysis, crypto);
                
                // Record call if signal is strong enough
                try {
                    const callSignal = analysis.v4Signal || analysis.v3Signal || analysis.signal;
                    const callConf = analysis.v4Confidence || analysis.v3Confidence || analysis.confidence;
                    const callEntry = parseFloat(analysis.entry) || parseFloat(analysis.indicators?.movingAverages?.currentPrice) || 0;
                    if (callSignal && callConf && callEntry > 0) {
                        recordCall(currentChartSymbol, callSignal, callConf, callEntry, crypto, analysis);
                    }
                } catch (e) { /* console.warn('[CallHistory] Record error:', e); */ }
                
                // Iniciar auto-refresh a cada 5 minutos
                startTAAutoRefresh(currentChartSymbol);
                
            } catch (e) {
                body.innerHTML = `
                    <div style="text-align: center; padding: 40px 20px;">
                        <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: var(--accent-red); margin-bottom: 16px;"></i>
                        <h3 style="color: var(--text-primary); margin-bottom: 8px;">Erro ao carregar análise</h3>
                        <p style="color: var(--text-secondary); font-size: 14px;">${e.message}</p>
                        <button onclick="openTechnicalAnalysis()" style="margin-top: 20px; padding: 12px 24px; background: var(--accent-blue); border: none; border-radius: 12px; color: white; font-weight: 600; cursor: pointer;">
                            <i class="fas fa-redo"></i> Tentar Novamente
                        </button>
                    </div>
                `;
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
                            <input type="range" min="70" max="100" value="${confidence}" step="5" 
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
                    confidenceThreshold: prefs.cryptos[symbol].confidence || prefs.globalConfidence || 60
                });
            }
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
        }

        function saveSignalSettings() {
            const prefs = getSignalPrefs();
            const slider = document.getElementById('ss-global-slider');
            if (slider) {
                const newGlobal = parseInt(slider.value);
                const oldGlobal = prefs.globalConfidence || 70;
                prefs.globalConfidence = newGlobal;
                // Only update cryptos that were using the OLD global (no custom override)
                Object.entries(CRYPTO_DATABASE).forEach(([symbol]) => {
                    if (!prefs.cryptos[symbol]) prefs.cryptos[symbol] = {};
                    const current = prefs.cryptos[symbol].confidence || oldGlobal;
                    if (current === oldGlobal || !prefs.cryptos[symbol].confidence) {
                        prefs.cryptos[symbol].confidence = newGlobal;
                    }
                    if (window.TAEngineV4) {
                        window.TAEngineV4.setNotificationConfig(symbol, {
                            enabled: prefs.cryptos[symbol]?.enabled === true,
                            confidenceThreshold: prefs.cryptos[symbol].confidence || newGlobal
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
        const SCAN_DEDUP_MS = 30 * 60 * 1000; // 30 min dedup por crypto
        let autoScanTimer = null;
        let isScanning = false;

        async function initLocalNotifications() {
            try {
                if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications) {
                    const { LocalNotifications } = window.Capacitor.Plugins;
                    // Request permission
                    const perm = await LocalNotifications.requestPermissions();
                    // Create notification channel for Android
                    try {
                        await LocalNotifications.createChannel({
                            id: 'visor_signals',
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
                if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications) {
                    const { LocalNotifications } = window.Capacitor.Plugins;
                    await LocalNotifications.schedule({
                        notifications: [{
                            id: id || Math.floor(Math.random() * 100000),
                            title: title,
                            body: body,
                            channelId: 'visor_signals',
                            schedule: { at: new Date(Date.now() + 500) },
                            sound: 'default',
                            smallIcon: 'ic_launcher',
                            largeIcon: 'ic_launcher'
                        }]
                    });
                }
            } catch (e) { /* console.warn('Notification fire error:', e); */ }
        }

        async function startBackgroundService() {
            try {
                if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.BackgroundScan) {
                    await window.Capacitor.Plugins.BackgroundScan.start();
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

        async function runAutoScan() {
            if (isScanning) return;
            const prefs = getSignalPrefs();
            if (!prefs.masterEnabled) return;

            isScanning = true;
            const lastResults = getScanLastResults();
            const now = Date.now();
            const enabledCryptos = Object.keys(CRYPTO_DATABASE).filter(sym => {
                // Default is DISABLED — must be explicitly enabled
                if (prefs.cryptos[sym]?.enabled !== true) return false;
                // Dedup: skip if we already notified this crypto recently
                if (lastResults[sym]?.notifiedAt && (now - lastResults[sym].notifiedAt) < SCAN_DEDUP_MS) return false;
                return true;
            });

            let scannedCount = 0;
            let signalsFound = 0;

            for (const symbol of enabledCryptos) {
                try {
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

                    // Check if signal is CONFIRMED
                    const signal = analysis.v4Signal || '';
                    const confidence = analysis.v4Confidence || 0;
                    const minConf = getCryptoMinConfidence(symbol);

                    if (signal.includes('CONFIRMED') && confidence >= minConf) {
                        signalsFound++;
                        const crypto = CRYPTO_DATABASE[symbol];
                        const direction = signal.includes('LONG') ? 'LONG 🟢' : 'SHORT 🔴';
                        const dirShort = signal.includes('LONG') ? 'LONG' : 'SHORT';
                        const title = `${crypto.short} — ${direction}`;
                        const gatesStr = `${analysis.v4GatesPassed || '?'}/${analysis.v4GatesTotal || '9'}`;
                        const body = `Sinal confirmado com ${confidence}% de confiança (${gatesStr} gates)`;

                        // Fire notification
                        await fireLocalNotification(title, body, symbol.hashCode || Math.floor(Math.random() * 100000));

                        // Record in dashboard history
                        dashRecordCall(symbol, dirShort, confidence, gatesStr, analysisData?.ticker?.lastPrice || '', '');

                        // Save so we don't re-notify for 30 min
                        lastResults[symbol] = {
                            signal: signal,
                            confidence: confidence,
                            notifiedAt: now,
                            price: analysisData?.ticker?.lastPrice || 0
                        };
                    } else {
                        // Always save confidence data for every scanned crypto
                        if (!lastResults[symbol]) lastResults[symbol] = {};
                        lastResults[symbol].signal = signal;
                        lastResults[symbol].confidence = confidence;
                        lastResults[symbol].price = analysisData?.ticker?.lastPrice || lastResults[symbol].price || 0;
                        lastResults[symbol].lastScanAt = now;
                    }

                    // Small delay between cryptos to avoid API rate limiting
                    await new Promise(r => setTimeout(r, 2000));

                } catch (scanErr) {
                }
            }

            saveScanLastResults(lastResults);
            isScanning = false;

            // Refresh dashboard confidence grid if it's visible
            if (typeof dashRenderConfidenceGrid === 'function') {
                try { dashRenderConfidenceGrid(); dashRenderActiveSignals(); dashUpdateStats(); } catch {}
            }
        }

        function startAutoScan() {
            if (autoScanTimer) return;
            const prefs = getSignalPrefs();
            if (!prefs.masterEnabled) return;
            // Run first scan after 30 seconds (let app load first)
            setTimeout(() => runAutoScan(), 30000);
            // Then repeat every 5 min
            autoScanTimer = setInterval(() => runAutoScan(), SCAN_INTERVAL_MS);
        }

        function stopAutoScan() {
            if (autoScanTimer) {
                clearInterval(autoScanTimer);
                autoScanTimer = null;
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
                });
            } else {
                stopAutoScan();
                stopBackgroundService();
            }
        };

        // Auto-start on page load if master was enabled
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(async () => {
                const prefs = getSignalPrefs();
                if (prefs.masterEnabled) {
                    await initLocalNotifications();
                    await startBackgroundService();
                    startAutoScan();
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
        // ═══════════════════════════════════════

        // ═══════════════════════════════════════
        // DASHBOARD — Sinais, Histórico, Config
        // ═══════════════════════════════════════
        const DASH_HISTORY_KEY = 'vc_call_history';
        const DASH_MAX_HISTORY = 100;
        let dashHistoryFilter = 'all';

        function dashGetHistory() {
            try { return JSON.parse(localStorage.getItem(DASH_HISTORY_KEY)) || []; } catch { return []; }
        }
        function dashSaveHistory(arr) {
            try { localStorage.setItem(DASH_HISTORY_KEY, JSON.stringify(arr.slice(0, DASH_MAX_HISTORY))); } catch {}
        }

        /**
         * Record a new call signal in the history.
         * Called from runAutoScan when a CONFIRMED signal fires.
         */
        function dashRecordCall(symbol, direction, confidence, gates, price, reason) {
            const history = dashGetHistory();
            const crypto = (typeof CRYPTO_DATABASE !== 'undefined' && CRYPTO_DATABASE[symbol]) || {};
            history.unshift({
                id: Date.now(),
                symbol: symbol,
                name: crypto.name || symbol,
                short: crypto.short || symbol.replace('USDT',''),
                img: crypto.img || '',
                direction: direction, // 'LONG' or 'SHORT'
                confidence: confidence,
                gates: gates || '',
                price: price || '',
                reason: reason || '',
                time: Date.now()
            });
            dashSaveHistory(history);
        }

        /**
         * Main load function called when entering Dashboard section.
         */
        function dashLoad() {
            dashSyncMasterToggle();
            dashRenderActiveSignals();
            dashRenderConfidenceGrid();
            dashRenderHistory();
            dashUpdateStats();
            dashRenderCryptoSettings();
            dashUpdateHomeSummary();
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
            // Sync bell panel toggle + icon
            const prefs = getSignalPrefs();
            _syncBellPanelFromPrefs(prefs);
        }

        function dashRenderActiveSignals() {
            const container = document.getElementById('dash-active-signals');
            const countEl = document.getElementById('dash-active-count');
            if (!container) return;

            const results = getScanLastResults();
            const now = Date.now();
            let activeHtml = '';
            let count = 0;

            Object.entries(results).forEach(([symbol, data]) => {
                if (!data.signal || !data.signal.includes('CONFIRMED')) return;
                if (data.notifiedAt && (now - data.notifiedAt) > 60 * 60 * 1000) return; // 1h expiry for display
                const crypto = (typeof CRYPTO_DATABASE !== 'undefined' && CRYPTO_DATABASE[symbol]) || {};
                const isLong = data.signal.includes('LONG');
                const dir = isLong ? 'long' : 'short';
                const dirLabel = isLong ? 'LONG' : 'SHORT';
                const dirEmoji = isLong ? '🟢' : '🔴';
                const conf = data.confidence || 0;
                const priceStr = data.price ? (parseFloat(data.price) >= 1 ? '$' + parseFloat(data.price).toLocaleString(undefined, {maximumFractionDigits: 2}) : '$' + parseFloat(data.price).toFixed(6)) : '';
                const timeAgo = dashGetTimeAgo(data.notifiedAt || 0);

                count++;
                activeHtml += `
                <div class="dash-signal-card ${dir}">
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                        <img src="${crypto.img || ''}" style="width: 32px; height: 32px; border-radius: 50%;" onerror="this.style.display='none'">
                        <div style="flex:1;">
                            <div style="font-size: 14px; font-weight: 800; color: var(--text-primary);">${crypto.short || symbol} <span class="signal-badge ${dir}">${dirEmoji} ${dirLabel}</span></div>
                            <div style="font-size: 11px; color: var(--text-muted);">${crypto.name || symbol} · ${timeAgo}</div>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-size: 18px; font-weight: 800; color: ${isLong ? '#22c55e' : '#ef4444'};">${conf}%</div>
                            <div style="font-size: 10px; color: var(--text-muted);">${priceStr}</div>
                        </div>
                    </div>
                </div>`;
            });

            if (count === 0) {
                container.innerHTML = `
                <div class="dash-empty-state">
                    <i class="fas fa-satellite-dish" style="font-size:32px;margin-bottom:12px;opacity:0.2;"></i>
                    <div style="font-size:14px;font-weight:700;color:var(--text-secondary);margin-bottom:4px;">Nenhum sinal ativo</div>
                    <div style="font-size:12px;">Os sinais aparecem quando um setup é confirmado pelo motor V4.</div>
                </div>`;
            } else {
                container.innerHTML = activeHtml;
            }
            if (countEl) countEl.textContent = count + (count === 1 ? ' sinal' : ' sinais');
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
            const conf = r.confidence || 0;
            const signal = r.signal || '';
            const direction = r.direction || '';
            const isLong = direction === 'LONG' || signal.includes('LONG');
            const isShort = direction === 'SHORT' || signal.includes('SHORT');
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

            // Merge: prefer dash TA results, fall back to scan results
            const dashResults = _getDashTAResults();
            const scanResults = getScanLastResults();
            let html = '';
            let latestScan = 0;
            let hasMissing = false;

            Object.entries(CRYPTO_DATABASE).forEach(([symbol, data]) => {
                const dr = dashResults[symbol] || {};
                const sr = scanResults[symbol] || {};
                // Use dash TA results (has exact same pipeline data) if available, else scan
                const r = dr.confidence ? dr : sr;
                const ts = r.lastScanAt || 0;
                if (ts > latestScan) latestScan = ts;
                if (!r.confidence) hasMissing = true;
                html += _confCellHtml(symbol, data, r);
            });

            grid.innerHTML = html;

            const updatedEl = document.getElementById('dash-conf-updated');
            if (updatedEl) {
                updatedEl.textContent = latestScan > 0 ? 'Atualizado ' + dashGetTimeAgo(latestScan) : 'Escaneando...';
            }

            // Auto-launch progressive scan if data is missing or stale
            const oldest = latestScan || 0;
            if (hasMissing || (Date.now() - oldest > DASH_SCAN_CACHE_TTL)) {
                dashProgressiveScan();
            }
        }

        /**
         * Progressive TA scan — runs the EXACT same analysis pipeline as the HOME technical analysis.
         * Processes one crypto at a time, updating each grid cell as results arrive.
         * Uses TA cache to avoid re-fetching if the user already opened that crypto recently.
         */
        async function dashProgressiveScan() {
            if (_dashScanRunning) return;
            _dashScanRunning = true;
            _dashScanAbort = false;

            const cryptos = Object.entries(typeof CRYPTO_DATABASE !== 'undefined' ? CRYPTO_DATABASE : {});
            const dashResults = _getDashTAResults();
            const scanResults = getScanLastResults();
            const now = Date.now();
            let scanned = 0;

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

                // Extract results
                const _v4Sig = analysis.v4Signal;
                const _v4Conf = analysis.v4Confidence;
                const _v3Sig = analysis.v3Signal;
                const _v3Conf = analysis.v3Confidence;
                const _origSig = analysis.signal || '';
                const _origConf = analysis.confidence || 0;

                let signal, confidence;
                if (_v4Sig) {
                    signal = _v4Sig;
                    confidence = (_v4Sig.includes('CONFIRMED') || _v4Sig.includes('AGUARDAR'))
                        ? (_v4Conf || 0)
                        : (_v4Conf || _v3Conf || _origConf);
                } else {
                    signal = _v3Sig || _origSig;
                    confidence = _v3Conf || _origConf;
                }

                if (confidence < 50) signal = 'NEUTRO';

                if (analysis.marketRegime && analysis.marketRegime.regimeStrength != null) {
                    const regimeConf = Math.round((analysis.marketRegime.regimeStrength || 0) * 100);
                    confidence = Math.round(confidence * 0.7 + regimeConf * 0.3);
                    confidence = Math.max(10, Math.min(100, confidence));
                }

                if (confidence < 50) signal = 'NEUTRO';

                return {
                    signal,
                    confidence,
                    direction: signal.includes('LONG') ? 'LONG' : signal.includes('SHORT') ? 'SHORT' : 'NEUTRO',
                    lastScanAt: Date.now(),
                    price: analysis.indicators?.movingAverages?.currentPrice || 0,
                    gates: analysis.v4GatesPassed ? `${analysis.v4GatesPassed}/${analysis.v4GatesTotal || 9}` : null
                };
            }

            // Filter cryptos that need scanning
            const toScan = cryptos.filter(([symbol]) => {
                const existing = dashResults[symbol];
                return !(existing && existing.lastScanAt && (now - existing.lastScanAt < DASH_SCAN_CACHE_TTL) && existing.confidence);
            });

            // Mark all cells as loading
            toScan.forEach(([symbol, data]) => {
                const cell = document.getElementById(`dash-conf-${symbol}`);
                if (cell) cell.outerHTML = _confCellHtml(symbol, data, { _loading: true });
            });

            // Process in batches of 3 for speed
            const BATCH_SIZE = 3;
            for (let i = 0; i < toScan.length; i += BATCH_SIZE) {
                if (_dashScanAbort) break;
                const dashSection = document.getElementById('dashboard');
                if (!dashSection || !dashSection.classList.contains('active')) { _dashScanAbort = true; break; }

                const batch = toScan.slice(i, i + BATCH_SIZE);
                if (updatedEl) {
                    const names = batch.map(([,d]) => d.short).join(', ');
                    updatedEl.innerHTML = `<i class="fas fa-circle-notch fa-spin" style="font-size:8px;margin-right:3px;"></i> ${names}... (${Math.min(i + BATCH_SIZE, toScan.length)}/${toScan.length})`;
                }

                const results = await Promise.allSettled(
                    batch.map(async ([symbol, data]) => {
                        try {
                            const result = await _scanOneCrypto(symbol, data);
                            dashResults[symbol] = result;

                            if (!scanResults[symbol]) scanResults[symbol] = {};
                            scanResults[symbol].signal = result.signal;
                            scanResults[symbol].confidence = result.confidence;
                            scanResults[symbol].price = result.price;
                            scanResults[symbol].lastScanAt = result.lastScanAt;

                            const updatedCell = document.getElementById(`dash-conf-${symbol}`);
                            if (updatedCell) updatedCell.outerHTML = _confCellHtml(symbol, data, result);
                        } catch (err) {
                            const errCell = document.getElementById(`dash-conf-${symbol}`);
                            if (errCell) errCell.outerHTML = _confCellHtml(symbol, data, {});
                        }
                    })
                );

                scanned += batch.length;
                _saveDashTAResults(dashResults);
                saveScanLastResults(scanResults);

                // Short delay between batches
                if (!_dashScanAbort && i + BATCH_SIZE < toScan.length) {
                    await new Promise(r => setTimeout(r, 800));
                }
            }

            _dashScanRunning = false;

            // Final update
            if (updatedEl) {
                updatedEl.textContent = 'Atualizado agora';
            }

            // Update active signals with new data
            try { dashRenderActiveSignals(); dashUpdateStats(); } catch {}
        }

        function dashRefreshConfidence() {
            // Force rescan: clear cached timestamps so all cryptos are re-scanned
            const dashResults = _getDashTAResults();
            Object.keys(dashResults).forEach(sym => { if (dashResults[sym]) dashResults[sym].lastScanAt = 0; });
            _saveDashTAResults(dashResults);
            _dashScanAbort = true; // abort current if running
            setTimeout(() => {
                _dashScanRunning = false;
                dashRenderConfidenceGrid();
                dashRenderActiveSignals();
            }, 200);
        }

        // Auto-refresh confidence every 5 min while dashboard is visible
        let _dashConfAutoRefreshId = null;
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
            _dashScanAbort = true;
            dashStopConfAutoRefresh();
        }

        function dashRenderHistory() {
            const container = document.getElementById('dash-history-list');
            if (!container) return;

            let history = dashGetHistory();
            if (dashHistoryFilter === 'long') history = history.filter(h => h.direction === 'LONG');
            else if (dashHistoryFilter === 'short') history = history.filter(h => h.direction === 'SHORT');

            if (history.length === 0) {
                container.innerHTML = `
                <div class="dash-empty-state">
                    <i class="fas fa-clock-rotate-left" style="font-size:32px;margin-bottom:12px;opacity:0.2;"></i>
                    <div style="font-size:14px;font-weight:700;color:var(--text-secondary);margin-bottom:4px;">Nenhum histórico ainda</div>
                    <div style="font-size:12px;">Calls confirmadas aparecerão aqui automaticamente.</div>
                </div>`;
                return;
            }

            let html = '';
            history.slice(0, 50).forEach(call => {
                const isLong = call.direction === 'LONG';
                const dir = isLong ? 'long' : 'short';
                const dirEmoji = isLong ? '↑' : '↓';
                const dirColor = isLong ? '#22c55e' : '#ef4444';
                const timeStr = formatCallTime(call.time);
                const priceStr = call.price ? (parseFloat(call.price) >= 1 ? '$' + parseFloat(call.price).toLocaleString(undefined, {maximumFractionDigits: 2}) : '$' + parseFloat(call.price).toFixed(6)) : '';

                html += `
                <div class="dash-history-card" onclick="dashShowCallDetail(${call.id})">
                    <div class="hist-icon ${dir}">
                        <i class="fas fa-arrow-${isLong ? 'up' : 'down'}" style="color: ${dirColor}; font-size: 14px;"></i>
                    </div>
                    <div style="flex:1; min-width:0;">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <span style="font-size: 13px; font-weight: 700; color: var(--text-primary);">${call.short || call.symbol}</span>
                            <span style="font-size: 10px; font-weight: 700; color: ${dirColor};">${call.direction}</span>
                        </div>
                        <div style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">${timeStr}${priceStr ? ' · ' + priceStr : ''}</div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 16px; font-weight: 800; color: ${dirColor};">${call.confidence}%</div>
                        ${call.gates ? `<div style="font-size: 9px; color: var(--text-muted);">${call.gates} gates</div>` : ''}
                    </div>
                </div>`;
            });

            container.innerHTML = html;
        }

        function dashFilterHistory(filter) {
            dashHistoryFilter = filter;
            document.querySelectorAll('.dash-hist-filter').forEach(f => {
                f.classList.toggle('active', f.getAttribute('data-filter') === filter);
            });
            dashRenderHistory();
        }

        function dashShowCallDetail(callId) {
            const history = dashGetHistory();
            const call = history.find(h => h.id === callId);
            if (!call) return;

            const isLong = call.direction === 'LONG';
            const dirColor = isLong ? '#22c55e' : '#ef4444';
            const dirEmoji = isLong ? '🟢' : '🔴';
            const timeStr = formatCallTime(call.time);
            const priceStr = call.price ? (parseFloat(call.price) >= 1 ? '$' + parseFloat(call.price).toLocaleString(undefined, {maximumFractionDigits: 2}) : '$' + parseFloat(call.price).toFixed(6)) : 'N/A';

            let modal = document.getElementById('dash-call-detail-modal');
            if (modal) modal.remove();

            modal = document.createElement('div');
            modal.id = 'dash-call-detail-modal';
            modal.style.cssText = 'position:fixed;inset:0;z-index:2000;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;padding:20px;animation:fadeIn 0.2s;';
            modal.innerHTML = `
            <div style="background: var(--bg-card); border-radius: 20px; width: 100%; max-width: 380px; padding: 24px; border: 1px solid var(--border-subtle); max-height: 80vh; overflow-y: auto;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
                    <div style="font-size: 16px; font-weight: 800; color: var(--text-primary);">Detalhe da Call</div>
                    <div onclick="document.getElementById('dash-call-detail-modal').remove()" style="width: 32px; height: 32px; background: var(--bg-tertiary); border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer;">
                        <i class="fas fa-times" style="color: var(--text-muted); font-size: 12px;"></i>
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
                ${call.reason ? `
                <div style="background: var(--bg-tertiary); border-radius: 10px; padding: 12px;">
                    <div style="font-size: 10px; color: var(--text-muted); text-transform: uppercase; font-weight: 600; margin-bottom: 4px;">Motivo</div>
                    <div style="font-size: 12px; color: var(--text-secondary); line-height: 1.5;">${call.reason}</div>
                </div>
                ` : ''}
            </div>`;
            modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
            document.body.appendChild(modal);
        }

        function dashUpdateStats() {
            const history = dashGetHistory();
            const now = Date.now();
            const today = new Date().setHours(0,0,0,0);

            const total = history.length;
            const longs = history.filter(h => h.direction === 'LONG').length;
            const shorts = history.filter(h => h.direction === 'SHORT').length;
            const todayCount = history.filter(h => h.time >= today).length;
            const avgConf = total > 0 ? Math.round(history.reduce((a, h) => a + (h.confidence || 0), 0) / total) : 0;

            const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
            el('dash-stat-total', total);
            el('dash-stat-long', longs);
            el('dash-stat-short', shorts);
            el('dash-stat-today', todayCount);
            el('dash-stat-avgconf', total > 0 ? avgConf + '%' : '--');
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
                            <input type="range" min="70" max="100" value="${confidence}" step="5"
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

        function dashToggleCrypto(symbol, enabled) {
            toggleCryptoSignal(symbol, enabled);
            dashRenderCryptoSettings();
            // Sync bell panel
            _syncBellPanelFromPrefs(getSignalPrefs());
        }

        function dashSetCryptoConf(symbol, confidence) {
            setCryptoConfidence(symbol, confidence);
            dashRenderCryptoSettings();
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
            const oldGlobal = prefs.globalConfidence || 70;
            prefs.globalConfidence = newGlobal;
            // Update cryptos that were using the old global (preserve custom overrides)
            Object.entries(typeof CRYPTO_DATABASE !== 'undefined' ? CRYPTO_DATABASE : {}).forEach(([symbol]) => {
                if (!prefs.cryptos[symbol]) prefs.cryptos[symbol] = {};
                const current = prefs.cryptos[symbol].confidence || oldGlobal;
                if (current === oldGlobal || !prefs.cryptos[symbol].confidence) {
                    prefs.cryptos[symbol].confidence = newGlobal;
                }
                // Sync each crypto to V4 engine
                if (window.TAEngineV4) {
                    window.TAEngineV4.setNotificationConfig(symbol, {
                        enabled: prefs.cryptos[symbol].enabled === true,
                        confidenceThreshold: prefs.cryptos[symbol].confidence || newGlobal
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

