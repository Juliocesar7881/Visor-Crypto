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
            
            // Carregar dados em background (não bloqueia UI)
            setTimeout(() => {
                try { fetchNews(); } catch(e) { /* console.error('News error:', e); */ }
                // NÃO chamar fetchHotNews aqui - ela interfere com o allNews
                // Hot news são identificadas automaticamente pelo mergeNews via isHotNews()
                try { fetchFearGreed(); } catch(e) { /* console.error('FearGreed error:', e); */ }
                try { fetchAltseasonIndex(); } catch(e) { /* console.error('Altseason error:', e); */ }
                try { fetchGlobalData(); } catch(e) { /* console.error('GlobalData error:', e); */ }
                try { fetchOrderBook(); } catch(e) { /* console.error('OrderBook error:', e); */ }
                try { fetchVolume(); } catch(e) { /* console.error('Volume error:', e); */ }
                try { fetchCryptoStats(); } catch(e) { /* console.error('CryptoStats error:', e); */ }
                try { fetchMovingAverages(); } catch(e) { /* console.error('MA error:', e); */ }
                try { 
                    fetchExchangeFlow('1h'); 
                    startExchangeFlowAutoRefresh(); 
                } catch(e) { /* console.error('ExchangeFlow error:', e); */ }
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
                window._autoRefreshIds = _autoRefreshConfigs.map(c => {
                    const offset = offsets[c.label] || 0;
                    let intervalId = null;
                    const timerId = setTimeout(() => {
                        intervalId = setInterval(() => { 
                            try { 
                                if (document.hidden) return;
                                const r = c.fn(); 
                                if (r && typeof r.catch === 'function') r.catch(e => {}); 
                            } catch(e) {} 
                        }, c.ms);
                        // Store the real interval id back
                        const idx = window._autoRefreshIds.indexOf(timerId);
                        if (idx !== -1) window._autoRefreshIds[idx] = intervalId;
                    }, offset);
                    return timerId;
                });
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
            document.addEventListener('visibilitychange', () => {
                if (document.hidden) {
                    _stopAllAutoRefresh();
                } else if (!window._autoRefreshPaused) {
                    _startAllAutoRefresh();
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

