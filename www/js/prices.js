
        // ============================================
        // CRYPTO DROPDOWN (Order Book)
        // ============================================
        function renderDropdownMenu() {
            const menu = document.getElementById('crypto-dropdown-menu');
            if (!menu) return;
            menu.innerHTML = Object.keys(CRYPTO_DATABASE).map(symbol => {
                const crypto = CRYPTO_DATABASE[symbol];
                const isSelected = symbol === currentOrderbookSymbol;
                return `
                    <div class="dropdown-item ${isSelected ? 'selected' : ''}" onclick="selectOrderbookCrypto('${symbol}')">
                        <img src="${crypto.img}" style="width: 24px; height: 24px; border-radius: 50%;" onerror="this.style.display='none'">
                        <div class="dropdown-item-info">
                            <div class="dropdown-item-name">${crypto.name}</div>
                            <div class="dropdown-item-symbol">${crypto.short}/USDT</div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        function toggleDropdown() {
            const menu = document.getElementById('crypto-dropdown-menu');
            if (menu) menu.classList.toggle('active');
        }

        function selectOrderbookCrypto(symbol) {
            currentOrderbookSymbol = symbol;
            const crypto = CRYPTO_DATABASE[symbol];
            const iconEl = document.getElementById('dropdown-icon');
            const labelEl = document.getElementById('dropdown-label');
            if (iconEl) iconEl.innerHTML = `<img src="${crypto.img}" style="width: 20px; height: 20px; border-radius: 50%;">`;
            if (labelEl) labelEl.textContent = crypto.short;
            toggleDropdown();
            renderDropdownMenu();
            fetchOrderBook();
            fetchVolume();
            fetchCryptoStats();
            fetchMovingAverages();
        }

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            const dropdown = document.querySelector('.crypto-dropdown');
            if (dropdown && !dropdown.contains(e.target)) {
                const ddMenu = document.getElementById('crypto-dropdown-menu');
                if (ddMenu) ddMenu.classList.remove('active');
            }
        });

        // ============================================
        // BINANCE WEBSOCKET - PREÇOS EM TEMPO REAL
        // ============================================
        let wsRetryCount = 0;
        const MAX_WS_RETRIES = 3;
        const CORS_PROXY = 'https://corsproxy.io/?';
        let _wsFallbackIntervalId = null;
        
        // Verificar se WebSocket está disponível e funcionando
        function isWebSocketSupported() {
            return typeof WebSocket !== 'undefined';
        }
        
        function connectPriceStream() {
            try {
                const streams = selectedCryptos.map(s => `${s.toLowerCase()}@ticker`).join('/');
                priceSocket = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`);
                
                priceSocket.onopen = () => {
                    wsRetryCount = 0; // Reset retry count on successful connection
                };
                
                priceSocket.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        if (data.data) {
                            const ticker = data.data;
                            const symbol = ticker.s;
                            previousPrices[symbol] = prices[symbol] || parseFloat(ticker.c);
                            prices[symbol] = parseFloat(ticker.c);
                            priceChanges[symbol] = parseFloat(ticker.P);
                            updatePriceDisplay(symbol);
                        }
                    } catch (e) {
                    }
                };
                
                priceSocket.onerror = (error) => {
                    // Usar fallback REST API
                    fetchPricesViaREST();
                };
                
                priceSocket.onclose = () => {
                    wsRetryCount++;
                    if (wsRetryCount <= MAX_WS_RETRIES) {
                        setTimeout(connectPriceStream, 2000);
                    } else if (!_wsFallbackIntervalId) {
                        // Usar REST API como fallback (apenas uma vez)
                        fetchPricesViaREST();
                        _wsFallbackIntervalId = setInterval(fetchPricesViaREST, 5000);
                    }
                };
            } catch (e) {
                fetchPricesViaREST();
            }
        }
        
        // Fallback: Buscar preços via REST API com múltiplos proxies
        async function fetchPricesViaREST() {
            const symbols = selectedCryptos.map(s => `"${s}"`).join(',');
            const binanceUrl = `https://api.binance.com/api/v3/ticker/24hr?symbols=[${symbols}]`;
            
            // Lista de proxies CORS para tentar
            const proxies = [
                '', // Direto primeiro
                'https://corsproxy.io/?',
                'https://api.allorigins.win/raw?url=',
                'https://cors-anywhere.herokuapp.com/'
            ];
            
            for (const proxy of proxies) {
                try {
                    const url = proxy ? `${proxy}${encodeURIComponent(binanceUrl)}` : binanceUrl;
                    const response = await fetch(url, { 
                        timeout: 5000,
                        headers: proxy.includes('herokuapp') ? { 'X-Requested-With': 'XMLHttpRequest' } : {}
                    });
                    
                    if (!response.ok) continue;
                    
                    const data = await response.json();
                    
                    if (Array.isArray(data) && data.length > 0) {
                        data.forEach(ticker => {
                            const symbol = ticker.symbol;
                            previousPrices[symbol] = prices[symbol] || parseFloat(ticker.lastPrice);
                            prices[symbol] = parseFloat(ticker.lastPrice);
                            priceChanges[symbol] = parseFloat(ticker.priceChangePercent);
                            updatePriceDisplay(symbol);
                        });
                        
                        renderAllPrices();
                        updateAIRecommendation();
                        return; // Sucesso!
                    }
                } catch (e) {
                }
            }
            
            // Se todos falharam, tentar CoinGecko como último recurso
            try {
                await fetchPricesViaCoinGecko();
            } catch (e) {
            }
        }
        
        // Fallback secundário: CoinGecko API
        async function fetchPricesViaCoinGecko() {
            const cgIds = selectedCryptos.map(s => CRYPTO_DATABASE[s]?.cgId).filter(id => id).join(',');
            
            try {
                const url = `https://api.coingecko.com/api/v3/simple/price?ids=${cgIds}&vs_currencies=usd&include_24hr_change=true`;
                const response = await fetch(url);
                const data = await response.json();
                
                selectedCryptos.forEach(symbol => {
                    const info = CRYPTO_DATABASE[symbol];
                    if (info?.cgId && data[info.cgId]) {
                        const cgData = data[info.cgId];
                        previousPrices[symbol] = prices[symbol] || cgData.usd;
                        prices[symbol] = cgData.usd;
                        priceChanges[symbol] = cgData.usd_24h_change || 0;
                        updatePriceDisplay(symbol);
                    }
                });
                
                renderAllPrices();
                updateAIRecommendation();
            } catch (e) {
            }
        }

        function reconnectPriceStream() {
            if (priceSocket) priceSocket.close();
            wsRetryCount = 0;
            connectPriceStream();
        }

        // ============================================
        // ORDER BOOK - Atualiza a cada 2 segundos
        // ============================================
        async function fetchOrderBook() {
            try {
                const response = await fetchWithTimeout(`https://api.binance.com/api/v3/depth?symbol=${currentOrderbookSymbol}&limit=10`, {}, 5000);
                const data = await response.json();
                updateOrderbookDisplay(data);
            } catch (e) {
            }
        }

        function updateOrderbookDisplay(data) {
            const container = document.getElementById('orderbook-container');
            if (!container) return;
            const symbolInfo = CRYPTO_DATABASE[currentOrderbookSymbol];
            
            const bids = data.bids || [];
            const asks = data.asks || [];
            
            const html = `
                <div class="orderbook-side orderbook-bids">
                    <div class="orderbook-title">Bids (Compra)</div>
                    ${bids.slice(0, 8).map(bid => `
                        <div class="orderbook-row">
                            <span>$${parseFloat(bid[0]).toLocaleString()}</span>
                            <span>${parseFloat(bid[1]).toFixed(4)}</span>
                        </div>
                    `).join('')}
                </div>
                <div class="orderbook-side orderbook-asks">
                    <div class="orderbook-title">Asks (Venda)</div>
                    ${asks.slice(0, 8).map(ask => `
                        <div class="orderbook-row">
                            <span>$${parseFloat(ask[0]).toLocaleString()}</span>
                            <span>${parseFloat(ask[1]).toFixed(4)}</span>
                        </div>
                    `).join('')}
                </div>
            `;
            requestAnimationFrame(() => { container.innerHTML = html; });
        }

        // ============================================
        // PRICES DISPLAY
        // ============================================
        function formatPrice(price) {
            if (price > 0 && price < 0.0001) {
                return { display: `$${price.toFixed(8)}`, multiplier: '' };
            }
            if (price > 0 && price < 0.01) {
                return { display: `$${price.toFixed(6)}`, multiplier: '' };
            }
            if (price > 0 && price < 1) {
                return { display: `$${price.toFixed(4)}`, multiplier: '' };
            }
            return { display: `$${price.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`, multiplier: '' };
        }

        function updatePriceDisplay(symbol) {
            let item = document.getElementById(`ticker-${symbol}`);
            if (!item) { renderAllPrices(); return; }
            
            const price = prices[symbol];
            const change = priceChanges[symbol];
            const prevPrice = previousPrices[symbol];
            const formatted = formatPrice(price);
            
            const currentEl = item.querySelector('.ticker-current');
            if (currentEl) currentEl.innerHTML = formatted.display;
            
            const changeEl = item.querySelector('.ticker-change');
            if (changeEl) {
                changeEl.textContent = `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`;
                changeEl.className = `ticker-change ${change >= 0 ? 'pnl-positive' : 'pnl-negative'}`;
            }
            
            if (price > prevPrice) {
                item.classList.add('flash-green');
                setTimeout(() => item.classList.remove('flash-green'), 300);
            } else if (price < prevPrice) {
                item.classList.add('flash-red');
                setTimeout(() => item.classList.remove('flash-red'), 300);
            }
        }

        function renderAllPrices() {
            // Guard: se não está na home, marcar dirty e pular DOM update
            if (typeof currentSection !== 'undefined' && currentSection !== 'home') {
                _dirtyFlags.home = true;
                return;
            }
            const container = document.getElementById('live-prices');
            const html = selectedCryptos.map(symbol => {
                const info = CRYPTO_DATABASE[symbol];
                const price = prices[symbol] || 0;
                const change = priceChanges[symbol] || 0;
                const formatted = formatPrice(price);
                return `
                    <div class="ticker-item" id="ticker-${symbol}" onclick="openChartModal('${symbol}')">
                        <div class="ticker-info">
                            <img src="${info.img}" class="ticker-icon-img" onerror="this.style.background='${info.color}'; this.style.padding='8px';">
                            <div>
                                <div class="ticker-name">${info.name}</div>
                                <div class="ticker-pair">${info.short}/USDT</div>
                            </div>
                        </div>
                        <div class="ticker-price" style="margin-left: auto; padding-left: 12px;">
                            <div class="ticker-current">${formatted.display}</div>
                            <div class="ticker-change ${change >= 0 ? 'pnl-positive' : 'pnl-negative'}">
                                ${change >= 0 ? '+' : ''}${change.toFixed(2)}%
                            </div>
                        </div>
                        <i class="fas fa-chevron-right" style="color: var(--text-muted); font-size: 12px; margin-left: 8px;"></i>
                    </div>
                `;
            }).join('');
            requestAnimationFrame(() => { if (container) container.innerHTML = html; });
        }

        // ============================================
        // TOP OPORTUNIDADES V6.1
        // ============================================
        let _topOpportunitiesTimer = null;

        async function loadTopOpportunities() {
            const card = document.getElementById('top-oportunidades-card');
            const content = document.getElementById('top-oportunidades-content');
            if (!card || !content) return;

            // Build opportunities from cached analysis data (localStorage)
            let scoreHistory = {}, signalDirs = {};
            try { scoreHistory = JSON.parse(localStorage.getItem('vc4_score_history') || '{}'); } catch(e) {}
            try { signalDirs = JSON.parse(localStorage.getItem('vc4_signal_directions') || '{}'); } catch(e) {}
            const now = Date.now();
            const maxAge = 15 * 60 * 1000; // 15 min

            const opportunities = [];
            for (const [sym, data] of Object.entries(scoreHistory)) {
                if (!data.ts || (now - data.ts) > maxAge) continue;
                const dir = signalDirs[sym]?.direction || 'NEUTRAL';
                if (dir === 'NEUTRAL') continue; // skip neutral
                const confidence = data.confidence || 0;
                if (confidence < 50) continue; // minimum threshold
                const gateScore = data.gateScore || 0;
                const passedGates = data.passedGates || 0;
                const totalGates = data.totalGates || 9;
                const info = typeof CRYPTO_DATABASE !== 'undefined' ? CRYPTO_DATABASE[sym] : null;
                
                opportunities.push({
                    symbol: sym,
                    name: info?.name || sym.replace('USDT', ''),
                    short: info?.short || sym.replace('USDT', ''),
                    img: info?.img || '',
                    color: info?.color || '#64748b',
                    direction: dir,
                    confidence,
                    gateScore,
                    passedGates,
                    totalGates,
                    compositeScore: confidence * 0.6 + gateScore * 0.4
                });
            }

            // Sort by composite score descending
            opportunities.sort((a, b) => b.compositeScore - a.compositeScore);
            const top = opportunities.slice(0, 5);

            if (top.length === 0) {
                card.style.display = 'none';
                return;
            }

            card.style.display = 'block';
            content.innerHTML = top.map((opp, idx) => `
                <div style="display: flex; align-items: center; padding: 10px 14px; border-bottom: 1px solid var(--border-subtle); cursor: pointer;" onclick="openChartModal('${opp.symbol}')">
                    <div style="width: 20px; font-size: 14px; font-weight: 800; color: ${idx === 0 ? '#f59e0b' : idx <= 2 ? '#94a3b8' : 'var(--text-muted)'};">${idx + 1}</div>
                    <img src="${opp.img}" style="width: 28px; height: 28px; border-radius: 50%; margin-right: 10px;" onerror="this.style.background='${opp.color}'; this.style.padding='4px';">
                    <div style="flex: 1;">
                        <div style="font-size: 13px; font-weight: 700; color: var(--text-primary);">${opp.short}</div>
                        <div style="font-size: 10px; color: var(--text-muted);">${opp.passedGates}/${opp.totalGates} gates</div>
                    </div>
                    <div style="text-align: right; margin-right: 8px;">
                        <div style="font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 6px; background: ${opp.direction === 'LONG' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'}; color: ${opp.direction === 'LONG' ? '#22c55e' : '#ef4444'};">
                            ${opp.direction === 'LONG' ? '▲ LONG' : '▼ SHORT'}
                        </div>
                    </div>
                    <div style="text-align: right; min-width: 44px;">
                        <div style="font-size: 16px; font-weight: 800; color: ${opp.confidence >= 70 ? '#22c55e' : opp.confidence >= 55 ? '#f59e0b' : '#94a3b8'};">${opp.confidence}%</div>
                        <div style="font-size: 8px; color: var(--text-muted);">confiança</div>
                    </div>
                </div>
            `).join('');
        }

        function startTopOpportunitiesRefresh() {
            if (_topOpportunitiesTimer) clearInterval(_topOpportunitiesTimer);
            loadTopOpportunities();
            _topOpportunitiesTimer = setInterval(() => { try { if (!document.hidden) loadTopOpportunities(); } catch(e) {} }, 30000);
        }

