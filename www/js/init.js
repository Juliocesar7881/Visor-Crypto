        // ============================================
        // INIT
        // ============================================
        document.addEventListener('DOMContentLoaded', () => {
            // Renderizar UI imediatamente com placeholders
            try {
                renderAllPrices();
                updateAIRecommendation();
                renderDropdownMenu();
                startTopOpportunitiesRefresh();
                initSignalSettingsSummary();
            } catch (e) {
            }
            
            // Buscar preços imediatamente via REST (garantido)
            try {
                fetchPricesViaREST();
            } catch (e) {
            }
            
            // Depois tentar WebSocket para updates em tempo real
            setTimeout(() => {
                try {
                    connectPriceStream();
                } catch (e) {
                }
            }, 2000);
            
            // Carregar dados em background sem pico de carga (stagger por etapas)
            setTimeout(() => {
                const startupTasks = [
                    { delay: 0, fn: () => fetchFearGreed() },
                    { delay: 500, fn: () => fetchAltseasonIndex() },
                    { delay: 900, fn: () => fetchGlobalData() },
                    { delay: 1300, fn: () => fetchVolume() },
                    { delay: 1700, fn: () => fetchCryptoStats() },
                    { delay: 2100, fn: () => fetchMovingAverages() },
                    { delay: 2500, fn: () => fetchOrderBook() },
                    { delay: 2900, fn: () => { fetchExchangeFlow('1h'); startExchangeFlowAutoRefresh(); } },
                    { delay: 3600, fn: () => fetchNews() }
                ];

                startupTasks.forEach(task => {
                    setTimeout(() => {
                        try {
                            if (document.hidden) return;
                            task.fn();
                        } catch (e) {}
                    }, task.delay);
                });
            }, 1000);
            
            // AI update every 30s (was 10s — reduces CPU & network load on mobile)
            window._aiRefreshId = setInterval(() => { try { if (document.hidden) return; const r = updateAIRecommendation(); if (r && r.catch) r.catch(()=>{}); } catch(e) {} }, 30000);
            
            // Whale Activity: 5 min auto-refresh configurado na função startWhaleActivityAutoRefresh
            
            // v7.1: Managed auto-refresh intervals (can be paused/resumed)
            // v8: Reduced intervals to prevent crash on low-end devices
            const _autoRefreshConfigs = [
                { fn: fetchPricesViaREST, ms: 10000, label: 'prices' },
                { fn: fetchOrderBook, ms: 30000, label: 'orderbook' },
                { fn: fetchAltseasonIndex, ms: 300000, label: 'altseason' },
                { fn: fetchNews, ms: 300000, label: 'news' },
                { fn: fetchFearGreed, ms: 300000, label: 'feargreed' },
                { fn: fetchGlobalData, ms: 120000, label: 'globaldata' },
                { fn: fetchVolume, ms: 30000, label: 'volume' },
                { fn: fetchCryptoStats, ms: 120000, label: 'stats' },
                { fn: fetchMovingAverages, ms: 60000, label: 'ma' },
            ];
            window._autoRefreshIds = [];
            window._autoRefreshConfigs = _autoRefreshConfigs;
            window._autoRefreshPaused = localStorage.getItem('vc4_autorefresh_paused') === '1';
            
            function _startAllAutoRefresh() {
                _stopAllAutoRefresh();
                // Escalonar intervalos para evitar picos simultâneos
                const offsets = {
                    'prices': 0, 'orderbook': 400, 'volume': 800,
                    'altseason': 1200, 'news': 1600, 'feargreed': 2000,
                    'globaldata': 2400, 'stats': 2800, 'ma': 3200
                };
                // Use an object array to safely track both timers and intervals
                window._autoRefreshEntries = _autoRefreshConfigs.map(c => {
                    const entry = { timerId: null, intervalId: null };
                    const offset = offsets[c.label] || 0;
                    entry.timerId = setTimeout(() => {
                        entry.timerId = null;
                        entry.intervalId = setInterval(() => { 
                            try { 
                                if (document.hidden) return;
                                const r = c.fn(); 
                                if (r && typeof r.catch === 'function') r.catch(e => {}); 
                            } catch(e) {} 
                        }, c.ms);
                    }, offset);
                    return entry;
                });
                window._autoRefreshIds = []; // keep for compat
                window._hotNewsRefreshId = setInterval(async () => {
                    try {
                        if (newsFilter === 'hot') {
                            const newHotNews = await fetchHotNews();
                            if (newHotNews && newHotNews.length > 0) renderHotNewsList(newHotNews);
                        }
                    } catch(e) {}
                }, 120000);
            }
            
            function _stopAllAutoRefresh() {
                // Clear using the new safe entry objects
                (window._autoRefreshEntries || []).forEach(entry => {
                    if (entry.timerId) { clearTimeout(entry.timerId); entry.timerId = null; }
                    if (entry.intervalId) { clearInterval(entry.intervalId); entry.intervalId = null; }
                });
                window._autoRefreshEntries = [];
                // Legacy cleanup
                (window._autoRefreshIds || []).forEach(id => { clearInterval(id); clearTimeout(id); });
                window._autoRefreshIds = [];
                if (window._hotNewsRefreshId) { clearInterval(window._hotNewsRefreshId); window._hotNewsRefreshId = null; }
                if (window._aiRefreshId) { clearInterval(window._aiRefreshId); window._aiRefreshId = null; }
            }
            
            window._startAllAutoRefresh = _startAllAutoRefresh;
            window._stopAllAutoRefresh = _stopAllAutoRefresh;
            
            // Start if not paused
            if (!window._autoRefreshPaused) {
                _startAllAutoRefresh();
            } else {
                _updateAutoRefreshUI(true);
            }
            
            // Pause auto-refresh when app/tab is hidden to save CPU & network
            let _visibilityDebounce = null;
            document.addEventListener('visibilitychange', () => {
                if (_visibilityDebounce) { clearTimeout(_visibilityDebounce); _visibilityDebounce = null; }
                if (document.hidden) {
                    // Stop immediately when going to background
                    _stopAllAutoRefresh();
                    // Disconnect all OrderFlow and CVD WebSockets when backgrounded
                    if (window.TAEngineV4 && window.TAEngineV4.disconnectAllOrderFlowWS) {
                        try { window.TAEngineV4.disconnectAllOrderFlowWS(); } catch(e) {}
                    }
                    if (window.RealtimeCVD && window.RealtimeCVD.disconnectAll) {
                        try { window.RealtimeCVD.disconnectAll(); } catch(e) {}
                    }
                } else if (!window._autoRefreshPaused) {
                    // Debounce resume — prevent rapid minimize/restore from stacking
                    _visibilityDebounce = setTimeout(() => {
                        _visibilityDebounce = null;
                        if (!document.hidden && !window._autoRefreshPaused) {
                            _startAllAutoRefresh();
                        }
                    }, 1500);
                }
            });
        });
        // v7.1: Auto-Refresh Toggle
        function _updateAutoRefreshUI(paused) {
            const btn = document.getElementById('auto-refresh-toggle');
            const icon = document.getElementById('auto-refresh-icon');
            const label = document.getElementById('auto-refresh-label');
            if (!btn) return;
            if (paused) {
                btn.style.background = 'rgba(239,68,68,0.15)';
                btn.style.borderColor = 'rgba(239,68,68,0.3)';
                btn.style.color = '#ef4444';
                if (icon) icon.textContent = '◼';
                if (label) label.textContent = 'PAUSED';
            } else {
                btn.style.background = 'rgba(16,185,129,0.15)';
                btn.style.borderColor = 'rgba(16,185,129,0.3)';
                btn.style.color = '#10b981';
                if (icon) icon.textContent = '●';
                if (label) label.textContent = 'LIVE';
            }
        }
        
        function toggleAutoRefresh() {
            window._autoRefreshPaused = !window._autoRefreshPaused;
            localStorage.setItem('vc4_autorefresh_paused', window._autoRefreshPaused ? '1' : '0');
            if (window._autoRefreshPaused) {
                window._stopAllAutoRefresh();
            } else {
                window._startAllAutoRefresh();
            }
            _updateAutoRefreshUI(window._autoRefreshPaused);
        }

