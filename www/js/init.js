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
                    fetchWhaleActivity('2h'); 
                    startWhaleActivityAutoRefresh(); 
                } catch(e) { /* console.error('WhaleActivity error:', e); */ }
            }, 1000);
            
            // AI update every 2s
            setInterval(updateAIRecommendation, 2000);
            
            // Whale Activity: 5 min auto-refresh configurado na função startWhaleActivityAutoRefresh
            
            // v7.1: Managed auto-refresh intervals (can be paused/resumed)
            const _autoRefreshConfigs = [
                { fn: fetchPricesViaREST, ms: 3000, label: 'prices' },
                { fn: fetchOrderBook, ms: 2000, label: 'orderbook' },
                { fn: fetchAltseasonIndex, ms: 30000, label: 'altseason' },
                { fn: fetchNews, ms: 300000, label: 'news' },
                { fn: fetchFearGreed, ms: 60000, label: 'feargreed' },
                { fn: fetchGlobalData, ms: 30000, label: 'globaldata' },
                { fn: fetchVolume, ms: 5000, label: 'volume' },
                { fn: fetchCryptoStats, ms: 30000, label: 'stats' },
                { fn: fetchMovingAverages, ms: 10000, label: 'ma' },
            ];
            window._autoRefreshIds = [];
            window._autoRefreshConfigs = _autoRefreshConfigs;
            window._autoRefreshPaused = localStorage.getItem('vc4_autorefresh_paused') === '1';
            
            function _startAllAutoRefresh() {
                _stopAllAutoRefresh();
                window._autoRefreshIds = _autoRefreshConfigs.map(c => setInterval(c.fn, c.ms));
                // Hot news auto-refresh
                window._hotNewsRefreshId = setInterval(async () => {
                    if (newsFilter === 'hot') {
                        const newHotNews = await fetchHotNews();
                        if (newHotNews.length > 0) renderHotNewsList(newHotNews);
                    }
                }, 120000);
            }
            
            function _stopAllAutoRefresh() {
                (window._autoRefreshIds || []).forEach(id => clearInterval(id));
                window._autoRefreshIds = [];
                if (window._hotNewsRefreshId) { clearInterval(window._hotNewsRefreshId); window._hotNewsRefreshId = null; }
            }
            
            window._startAllAutoRefresh = _startAllAutoRefresh;
            window._stopAllAutoRefresh = _stopAllAutoRefresh;
            
            // Start if not paused
            if (!window._autoRefreshPaused) {
                _startAllAutoRefresh();
            } else {
                _updateAutoRefreshUI(true);
            }
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
                icon.textContent = '◼';
                label.textContent = 'PAUSED';
            } else {
                btn.style.background = 'rgba(16,185,129,0.15)';
                btn.style.borderColor = 'rgba(16,185,129,0.3)';
                btn.style.color = '#10b981';
                icon.textContent = '●';
                label.textContent = 'LIVE';
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
