        // ============================================
        // AI RECOMMENDATION
        // ============================================
        function updateAIRecommendation() {
            const container = document.getElementById('ai-recommendation');
            let bullishCount = 0, totalChange = 0;
            
            selectedCryptos.forEach(symbol => {
                const change = priceChanges[symbol] || 0;
                totalChange += change;
                if (change > 1) bullishCount++;
            });
            
            const avgChange = totalChange / selectedCryptos.length;
            let sentiment, sentimentClass, sentimentIconClass, recommendation;
            
            if (avgChange > 2) {
                sentiment = 'MUITO BULLISH'; sentimentClass = 'bullish'; sentimentIconClass = 'fa-rocket';
                recommendation = `Mercado em <strong style="color: var(--accent-green);">forte alta</strong>! Momento favorável para posições long.`;
            } else if (avgChange > 0.5) {
                sentiment = 'BULLISH'; sentimentClass = 'bullish'; sentimentIconClass = 'fa-arrow-trend-up';
                recommendation = `Mercado em <strong style="color: var(--accent-green);">tendência de alta</strong>. Bom momento para DCA.`;
            } else if (avgChange < -2) {
                sentiment = 'MUITO BEARISH'; sentimentClass = 'bearish'; sentimentIconClass = 'fa-arrow-trend-down';
                recommendation = `Mercado em <strong style="color: var(--accent-red);">forte queda</strong>! Cautela máxima.`;
            } else if (avgChange < -0.5) {
                sentiment = 'BEARISH'; sentimentClass = 'bearish'; sentimentIconClass = 'fa-chart-line-down';
                recommendation = `Mercado em <strong style="color: var(--accent-red);">correção</strong>. Oportunidade para DCA de longo prazo.`;
            } else {
                sentiment = 'AGUARDE'; sentimentClass = 'neutral'; sentimentIconClass = 'fa-hourglass-half';
                recommendation = `Mercado <strong style="color: var(--accent-yellow);">lateral</strong>. Aguarde breakout.`;
            }
            
            const trendIcon = avgChange > 0.5 ? '<i class="fas fa-arrow-trend-up" style="font-size:22px;color:#22c55e;"></i>' : avgChange < -0.5 ? '<i class="fas fa-arrow-trend-down" style="font-size:22px;color:#ef4444;"></i>' : '<i class="fas fa-minus" style="font-size:22px;color:var(--text-muted);"></i>';
            const trendText = avgChange > 0.5 ? 'Alta' : avgChange < -0.5 ? 'Baixa' : 'Lateral';
            const trendColor = avgChange > 0.5 ? '#22c55e' : avgChange < -0.5 ? '#ef4444' : 'var(--text-secondary)';
            
            // Update trend arrow visual
            const trendArrow = document.getElementById('trend-arrow');
            if (trendArrow) {
                trendArrow.innerHTML = trendIcon;
                trendArrow.className = 'trend-arrow' + (avgChange > 0.5 ? ' up' : avgChange < -0.5 ? ' down' : '');
            }
            const trendLabel = document.getElementById('market-trend');
            if (trendLabel) {
                trendLabel.textContent = trendText;
                trendLabel.style.color = trendColor;
            }
            
            // Filtrar apenas criptos com dados de preço carregados e ordenar por mudança
            const cryptosWithData = selectedCryptos
                .filter(symbol => prices[symbol] && priceChanges[symbol] !== undefined)
                .sort((a, b) => Math.abs(priceChanges[b]) - Math.abs(priceChanges[a]));
            
            const picks = cryptosWithData.slice(0, 4).map(symbol => {
                const info = CRYPTO_DATABASE[symbol];
                const price = prices[symbol] || 0;
                const change = priceChanges[symbol] || 0;
                let action, actionClass, allocation;
                
                if (change > 3) { 
                    action = 'Strong Buy'; 
                    actionClass = 'strong-buy';
                    allocation = symbol === 'BTCUSDT' ? 40 : symbol === 'ETHUSDT' ? 30 : 20;
                } else if (change > 0.5) { 
                    action = 'Buy'; 
                    actionClass = 'buy';
                    allocation = symbol === 'BTCUSDT' ? 35 : symbol === 'ETHUSDT' ? 25 : 15;
                } else if (change < -3) { 
                    action = 'Sell'; 
                    actionClass = 'sell';
                    allocation = 0;
                } else { 
                    action = 'Hold'; 
                    actionClass = 'hold';
                    allocation = 10;
                }
                
                return { symbol, info, price, change, action, actionClass, allocation };
            }).sort((a, b) => b.allocation - a.allocation);
            
            container.innerHTML = `
                <div class="ai-sentiment">
                    <div class="ai-sentiment-icon ${sentimentClass}">
                        <i class="fas ${sentimentClass === 'bullish' ? 'fa-arrow-trend-up' : sentimentClass === 'bearish' ? 'fa-arrow-trend-down' : 'fa-minus'}"></i>
                    </div>
                    <div>
                        <div class="ai-sentiment-label">Sentimento 24h</div>
                        <div class="ai-sentiment-value" style="color: var(--accent-${sentimentClass === 'bullish' ? 'green' : sentimentClass === 'bearish' ? 'red' : 'yellow'});">${sentiment}</div>
                    </div>
                </div>
                <div class="ai-recommendation">
                    <div class="ai-rec-title"><i class="fas fa-brain"></i> Análise</div>
                    <div class="ai-rec-content">${recommendation}</div>
                </div>
                <div class="ai-recommendation">
                    <div class="ai-rec-title"><i class="fas fa-lightbulb"></i> Sugestões</div>
                    <div class="ai-picks">
                        ${picks.map(pick => `
                            <div class="ai-pick ${pick.actionClass}">
                                <img src="${pick.info.img}" style="width: 24px; height: 24px; border-radius: 7px; box-shadow: 0 2px 6px rgba(0,0,0,0.3); flex-shrink: 0;" onerror="this.style.background='${pick.info.color}'; this.style.padding='4px';">
                                <div class="ai-pick-info">
                                    <div class="ai-pick-symbol">${pick.info.name}</div>
                                    <div class="ai-pick-price">$${pick.price.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                                </div>
                                <div class="ai-pick-allocation">
                                    <div class="ai-pick-change ${pick.change >= 0 ? 'pnl-positive' : 'pnl-negative'}" style="font-size: 13px; font-weight: 700;">
                                        ${pick.change >= 0 ? '+' : ''}${pick.change.toFixed(2)}%
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }


        // BTC Dominância - APENAS CoinGecko com ajuste +2.1
        const BTC_DOM_CACHE_KEY = 'btc_dom_cache';
        const BTC_DOM_CACHE_TTL = 30 * 60 * 1000; // 30 min
        
        async function fetchGlobalData() {
            // Restaurar cache imediatamente
            try {
                const raw = localStorage.getItem(BTC_DOM_CACHE_KEY);
                if (raw) {
                    const c = JSON.parse(raw);
                    if (c.val && c.ts && (Date.now() - c.ts) < BTC_DOM_CACHE_TTL) {
                        const domEl = document.getElementById('btc-dominance');
                        if (domEl) domEl.textContent = `${c.val.toFixed(2)}%`;
                        const arc = document.getElementById('btc-dom-arc');
                        if (arc) {
                            const circumference = 213.6;
                            const offset = circumference * (1 - c.val / 100);
                            arc.setAttribute('stroke-dashoffset', Math.max(0, offset));
                        }
                    }
                }
            } catch(e) {}
            
            try {
                const response = await fetchWithTimeout('https://api.coingecko.com/api/v3/global', {}, 10000);
                if (response.ok) {
                    const globalData = await response.json();
                    let btcDominance = globalData.data?.market_cap_percentage?.btc;
                    
                    if (btcDominance && btcDominance > 0) {
                        // Ajuste +2.1 para alinhar com TradingView/CMC
                        btcDominance = btcDominance + 2.1;
                        const domEl = document.getElementById('btc-dominance');
                        if (domEl) domEl.textContent = `${btcDominance.toFixed(2)}%`;
                        // Preencher arco SVG proporcionalmente à %
                        const arc = document.getElementById('btc-dom-arc');
                        if (arc) {
                            const circumference = 213.6;
                            const offset = circumference * (1 - btcDominance / 100);
                            arc.setAttribute('stroke-dashoffset', Math.max(0, offset));
                        }
                        // Salvar no cache
                        try { localStorage.setItem(BTC_DOM_CACHE_KEY, JSON.stringify({ val: btcDominance, ts: Date.now() })); } catch(e) {}
                        return btcDominance;
                    }
                }
            } catch (e) {
            }
            
            // Se falhar, manter cache anterior ou "--" até próxima tentativa
            return null;
        }

        async function fetchCryptoStats() {
            // Buscar dados de BTC
            await fetchBTCStats();
            // Buscar dados de ETH
            await fetchETHStats();
        }

        // Utility: update mini performance bar visual
        function updateMiniPerfBar(barId, pct) {
            const bar = document.getElementById(barId);
            if (!bar) return;
            const clamped = Math.max(-15, Math.min(15, pct));
            const width = (Math.abs(clamped) / 15) * 50; // max 50% width (one side)
            bar.innerHTML = `<div class="bar-center"></div><div class="bar-fill ${pct >= 0 ? 'positive' : 'negative'}" style="width:${width}%"></div>`;
        }

        // Helper: format market cap value
        function formatMcap(val) {
            if (val > 1e12) return `$${(val / 1e12).toFixed(2)}T`;
            if (val > 1e9) return `$${(val / 1e9).toFixed(2)}B`;
            return `$${(val / 1e6).toFixed(2)}M`;
        }

        // Cache keys for market cap and volume
        const MCAP_CACHE_KEY_BTC = 'mcap_btc_cache';
        const MCAP_CACHE_KEY_ETH = 'mcap_eth_cache';
        const VOL_CACHE_KEY_BTC = 'vol_btc_cache';
        const VOL_CACHE_KEY_ETH = 'vol_eth_cache';
        const MCAP_CACHE_TTL = 30 * 60 * 1000; // 30 min

        function getMcapCache(key) {
            try {
                const raw = localStorage.getItem(key);
                if (raw) return JSON.parse(raw);
            } catch(e) {}
            return null;
        }
        function setMcapCache(key, mcap, change) {
            try { localStorage.setItem(key, JSON.stringify({ mcap, change, ts: Date.now() })); } catch(e) {}
        }
        function setVolCache(key, vol, change) {
            try { localStorage.setItem(key, JSON.stringify({ vol, change, ts: Date.now() })); } catch(e) {}
        }

        async function fetchBTCStats() {
            // Show cached value immediately while loading
            const cached = getMcapCache(MCAP_CACHE_KEY_BTC);
            if (cached && cached.mcap) {
                const mcEl = document.getElementById('market-cap-btc');
                if (mcEl) mcEl.textContent = formatMcap(cached.mcap);
                const ch = cached.change || priceChanges['BTCUSDT'] || 0;
                const el = document.getElementById('mcap-change-btc');
                if (el) {
                    el.textContent = `${ch >= 0 ? '+' : ''}${ch.toFixed(2)}%`;
                    el.className = `stat-change ${ch >= 0 ? 'pnl-positive' : 'pnl-negative'}`;
                }
                updateMiniPerfBar('mini-bar-mcap-btc', ch);
            }
            try {
                const response = await fetch(`https://api.coingecko.com/api/v3/coins/bitcoin?localization=false&tickers=false&community_data=false&developer_data=false`);
                
                if (!response.ok) throw new Error('Rate limited');
                
                const data = await response.json();
                
                // Market Cap BTC
                const marketCap = data.market_data?.market_cap?.usd || 0;
                const mcapChange = data.market_data?.market_cap_change_percentage_24h || priceChanges['BTCUSDT'] || 0;
                
                if (marketCap > 0) {
                    const mcEl = document.getElementById('market-cap-btc');
                    if (mcEl) mcEl.textContent = formatMcap(marketCap);
                    // Only cache non-zero change to avoid overwriting good data
                    const changeToCache = mcapChange !== 0 ? mcapChange : (cached?.change || 0);
                    setMcapCache(MCAP_CACHE_KEY_BTC, marketCap, changeToCache);
                }
                
                const mcapChangeEl = document.getElementById('mcap-change-btc');
                if (mcapChangeEl) {
                    mcapChangeEl.textContent = `${mcapChange >= 0 ? '+' : ''}${mcapChange.toFixed(2)}%`;
                    mcapChangeEl.className = `stat-change ${mcapChange >= 0 ? 'pnl-positive' : 'pnl-negative'}`;
                }
                updateMiniPerfBar('mini-bar-mcap-btc', mcapChange);
                
            } catch (e) {
                // Use cached change or Binance priceChange as fallback
                const fallbackChange = (cached?.change) || priceChanges['BTCUSDT'] || 0;
                if (fallbackChange !== 0) {
                    const el = document.getElementById('mcap-change-btc');
                    if (el) {
                        el.textContent = `${fallbackChange >= 0 ? '+' : ''}${fallbackChange.toFixed(2)}%`;
                        el.className = `stat-change ${fallbackChange >= 0 ? 'pnl-positive' : 'pnl-negative'}`;
                    }
                    updateMiniPerfBar('mini-bar-mcap-btc', fallbackChange);
                }
            }
        }

        async function fetchETHStats() {
            // Show cached value immediately while loading
            const cached = getMcapCache(MCAP_CACHE_KEY_ETH);
            if (cached && cached.mcap) {
                const mcEl = document.getElementById('market-cap');
                if (mcEl) mcEl.textContent = formatMcap(cached.mcap);
                const ch = cached.change || priceChanges['ETHUSDT'] || 0;
                const el = document.getElementById('mcap-change');
                if (el) {
                    el.textContent = `${ch >= 0 ? '+' : ''}${ch.toFixed(2)}%`;
                    el.className = `stat-change ${ch >= 0 ? 'pnl-positive' : 'pnl-negative'}`;
                }
                updateMiniPerfBar('mini-bar-mcap-eth', ch);
            }
            try {
                const response = await fetch(`https://api.coingecko.com/api/v3/coins/ethereum?localization=false&tickers=false&community_data=false&developer_data=false`);
                
                if (!response.ok) throw new Error('Rate limited');
                
                const data = await response.json();
                
                // Market Cap ETH
                const marketCap = data.market_data?.market_cap?.usd || 0;
                const mcapChange = data.market_data?.market_cap_change_percentage_24h || priceChanges['ETHUSDT'] || 0;
                
                if (marketCap > 0) {
                    const mcEl = document.getElementById('market-cap');
                    if (mcEl) mcEl.textContent = formatMcap(marketCap);
                    const changeToCache = mcapChange !== 0 ? mcapChange : (cached?.change || 0);
                    setMcapCache(MCAP_CACHE_KEY_ETH, marketCap, changeToCache);
                }
                
                const mcapChangeEl = document.getElementById('mcap-change');
                if (mcapChangeEl) {
                    mcapChangeEl.textContent = `${mcapChange >= 0 ? '+' : ''}${mcapChange.toFixed(2)}%`;
                    mcapChangeEl.className = `stat-change ${mcapChange >= 0 ? 'pnl-positive' : 'pnl-negative'}`;
                }
                updateMiniPerfBar('mini-bar-mcap-eth', mcapChange);
                
            } catch (e) {
                // Use cached change or Binance priceChange as fallback
                const fallbackChange = (cached?.change) || priceChanges['ETHUSDT'] || 0;
                if (fallbackChange !== 0) {
                    const el = document.getElementById('mcap-change');
                    if (el) {
                        el.textContent = `${fallbackChange >= 0 ? '+' : ''}${fallbackChange.toFixed(2)}%`;
                        el.className = `stat-change ${fallbackChange >= 0 ? 'pnl-positive' : 'pnl-negative'}`;
                    }
                    updateMiniPerfBar('mini-bar-mcap-eth', fallbackChange);
                }
            }
        }

        async function fetchVolume() {
            // Volume BTC
            const cachedVolBtc = getMcapCache(VOL_CACHE_KEY_BTC);
            if (cachedVolBtc && cachedVolBtc.vol) {
                const fv = cachedVolBtc.vol;
                const vbEl = document.getElementById('live-volume-btc');
                if (vbEl) vbEl.textContent = fv > 1e9 ? `$${(fv / 1e9).toFixed(2)}B` : `$${(fv / 1e6).toFixed(2)}M`;
                const ch = cachedVolBtc.change || 0;
                const el = document.getElementById('volume-change-btc');
                if (el) {
                    el.textContent = `${ch >= 0 ? '+' : ''}${ch.toFixed(2)}%`;
                    el.className = `stat-change ${ch >= 0 ? 'pnl-positive' : 'pnl-negative'}`;
                }
                updateMiniPerfBar('mini-bar-vol-btc', ch);
            }
            try {
                const response = await fetchWithTimeout(`https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT`, {}, 8000);
                const data = await response.json();
                const vol = parseFloat(data.quoteVolume);
                const priceChange = parseFloat(data.priceChangePercent);
                
                const vbEl = document.getElementById('live-volume-btc');
                if (vbEl) vbEl.textContent = vol > 1e9 ? `$${(vol / 1e9).toFixed(2)}B` : `$${(vol / 1e6).toFixed(2)}M`;
                
                setVolCache(VOL_CACHE_KEY_BTC, vol, priceChange);
                
                const volChangeEl = document.getElementById('volume-change-btc');
                if (volChangeEl) {
                    volChangeEl.textContent = `${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(2)}%`;
                    volChangeEl.className = `stat-change ${priceChange >= 0 ? 'pnl-positive' : 'pnl-negative'}`;
                }
                updateMiniPerfBar('mini-bar-vol-btc', priceChange);
                
            } catch (e) {
            }

            // Volume ETH
            const cachedVolEth = getMcapCache(VOL_CACHE_KEY_ETH);
            if (cachedVolEth && cachedVolEth.vol) {
                const fv = cachedVolEth.vol;
                const veEl = document.getElementById('live-volume');
                if (veEl) veEl.textContent = fv > 1e9 ? `$${(fv / 1e9).toFixed(2)}B` : `$${(fv / 1e6).toFixed(2)}M`;
                const ch = cachedVolEth.change || 0;
                const el = document.getElementById('volume-change');
                if (el) {
                    el.textContent = `${ch >= 0 ? '+' : ''}${ch.toFixed(2)}%`;
                    el.className = `stat-change ${ch >= 0 ? 'pnl-positive' : 'pnl-negative'}`;
                }
                updateMiniPerfBar('mini-bar-vol-eth', ch);
            }
            try {
                const response = await fetchWithTimeout(`https://api.binance.com/api/v3/ticker/24hr?symbol=ETHUSDT`, {}, 8000);
                const data = await response.json();
                const vol = parseFloat(data.quoteVolume);
                const priceChange = parseFloat(data.priceChangePercent);
                
                const veEl = document.getElementById('live-volume');
                if (veEl) veEl.textContent = vol > 1e9 ? `$${(vol / 1e9).toFixed(2)}B` : `$${(vol / 1e6).toFixed(2)}M`;
                
                setVolCache(VOL_CACHE_KEY_ETH, vol, priceChange);
                
                const volChangeEl = document.getElementById('volume-change');
                if (volChangeEl) {
                    volChangeEl.textContent = `${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(2)}%`;
                    volChangeEl.className = `stat-change ${priceChange >= 0 ? 'pnl-positive' : 'pnl-negative'}`;
                }
                updateMiniPerfBar('mini-bar-vol-eth', priceChange);
                
            } catch (e) {
            }
        }

        // ============================================
        // MOVING AVERAGES - Médias Móveis
        // ============================================
        async function fetchMovingAverages() {
            const symbol = currentOrderbookSymbol;
            const crypto = CRYPTO_DATABASE[symbol];
            
            try {
                // Buscar dados de klines (candlesticks) - 200 dias para calcular MA200
                const response = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1d&limit=200`);
                const klines = await response.json();
                
                if (!klines || klines.length < 7) {
                    throw new Error('Dados insuficientes');
                }
                
                // Extrair preços
                const closePrices = klines.map(k => parseFloat(k[4]));
                const highPrices = klines.map(k => parseFloat(k[2]));
                const lowPrices = klines.map(k => parseFloat(k[3]));
                const currentPrice = closePrices[closePrices.length - 1];
                
                // Calcular MAs (Média Móvel Simples)
                const calculateMA = (prices, period) => {
                    if (prices.length < period) return null;
                    const slice = prices.slice(-period);
                    return slice.reduce((a, b) => a + b, 0) / period;
                };
                
                // Calcular EMA (Média Móvel Exponencial)
                const calculateEMAFromPrices = (prices, period) => {
                    if (prices.length < period) return null;
                    const multiplier = 2 / (period + 1);
                    let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
                    for (let i = period; i < prices.length; i++) {
                        ema = (prices[i] - ema) * multiplier + ema;
                    }
                    return ema;
                };
                
                const ema9 = calculateEMAFromPrices(closePrices, 9);
                const ema20 = calculateEMAFromPrices(closePrices, 20);
                const ema50 = calculateEMAFromPrices(closePrices, 50);
                const ma50 = calculateMA(closePrices, 50);
                const ma99 = calculateMA(closePrices, 99);
                const ma200 = closePrices.length >= 200 ? calculateMA(closePrices, 200) : null;
                
                // Calcular Suporte e Resistência por Confluência
                const recentPeriod = 20; // Últimos 20 dias
                const recentHighs = highPrices.slice(-recentPeriod);
                const recentLows = lowPrices.slice(-recentPeriod);
                
                // Encontrar níveis de pivô
                const resistance = Math.max(...recentHighs);
                const support = Math.min(...recentLows);
                
                // Calcular confluência (quantas MAs estão próximas do suporte/resistência)
                const allMAs = [ema9, ema20, ema50, ma50, ma99, ma200].filter(m => m !== null);
                
                // Formatar preço
                const formatMAPrice = (price) => {
                    if (!price) return '--';
                    if (price >= 1000) return `$${price.toLocaleString(undefined, {maximumFractionDigits: 0})}`;
                    if (price >= 1) return `$${price.toFixed(2)}`;
                    return `$${price.toFixed(6)}`;
                };
                
                // Determinar sinal (buy/sell/neutral)
                const getSignal = (ma) => {
                    if (!ma) return { class: 'neutral', text: '--' };
                    const diff = ((currentPrice - ma) / ma) * 100;
                    if (diff > 2) return { class: 'buy', text: '↑ ACIMA' };
                    if (diff < -2) return { class: 'sell', text: '↓ ABAIXO' };
                    return { class: 'neutral', text: '→ AGUARDE' };
                };
                
                // Helper seguro para setar DOM
                const _s = (id, prop, val) => { const el = document.getElementById(id); if (el) el[prop] = val; };
                
                // Atualizar UI - MAs
                _s('ema-9', 'textContent', formatMAPrice(ema9));
                _s('ema-20', 'textContent', formatMAPrice(ema20));
                _s('ema-50', 'textContent', formatMAPrice(ema50));
                _s('ma-50', 'textContent', formatMAPrice(ma50));
                _s('ma-99', 'textContent', formatMAPrice(ma99));
                _s('ma-200', 'textContent', formatMAPrice(ma200));
                
                const signalEma9 = getSignal(ema9);
                const signalEma20 = getSignal(ema20);
                const signalEma50 = getSignal(ema50);
                const signal50 = getSignal(ma50);
                const signal99 = getSignal(ma99);
                const signal200 = getSignal(ma200);
                
                const _ss = (id, sig) => { const el = document.getElementById(id); if (el) { el.className = `ma-signal ${sig.class}`; el.textContent = sig.text; } };
                _ss('ema-9-signal', signalEma9);
                _ss('ema-20-signal', signalEma20);
                _ss('ema-50-signal', signalEma50);
                _ss('ma-50-signal', signal50);
                _ss('ma-99-signal', signal99);
                _ss('ma-200-signal', signal200);
                
                // Atualizar UI - Suporte e Resistência
                _s('sr-support', 'textContent', formatMAPrice(support));
                _s('sr-resistance', 'textContent', formatMAPrice(resistance));
                
                // Resumo geral
                const signals = [signalEma9, signalEma20, signalEma50, signal50, signal99, signal200].filter(s => s.text !== '--');
                const buyCount = signals.filter(s => s.class === 'buy').length;
                const sellCount = signals.filter(s => s.class === 'sell').length;
                
                const summaryEl = document.getElementById('ma-summary');
                if (!summaryEl) return;
                if (buyCount > sellCount) {
                    summaryEl.innerHTML = `<span style="color: var(--accent-green);"><i class="fas fa-arrow-trend-up"></i> TENDÊNCIA DE ALTA</span> - Preço acima de ${buyCount} de ${signals.length} MAs/EMAs`;
                } else if (sellCount > buyCount) {
                    summaryEl.innerHTML = `<span style="color: var(--accent-red);"><i class="fas fa-arrow-trend-down"></i> TENDÊNCIA DE BAIXA</span> - Preço abaixo de ${sellCount} de ${signals.length} MAs/EMAs`;
                } else {
                    summaryEl.innerHTML = `<span style="color: var(--accent-yellow);"><i class="fas fa-minus"></i> CONSOLIDAÇÃO</span> - Preço próximo das médias`;
                }
                
            } catch (e) {
                const summaryEl = document.getElementById('ma-summary');
                if (summaryEl) summaryEl.innerHTML = '<span style="color: var(--text-muted);">Não foi possível calcular</span>';
            }
        }

