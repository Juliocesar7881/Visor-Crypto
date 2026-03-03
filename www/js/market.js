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
            
            const trendIcon = avgChange > 0.5 ? '<i class="fas fa-arrow-trend-up"></i>' : avgChange < -0.5 ? '<i class="fas fa-arrow-trend-down"></i>' : '<i class="fas fa-minus"></i>';
            const trendText = avgChange > 0.5 ? 'Alta' : avgChange < -0.5 ? 'Baixa' : 'Lateral';
            document.getElementById('market-trend').innerHTML = `${trendIcon} ${trendText}`;
            
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
                        <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">Sentimento 24h</div>
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
                                <img src="${pick.info.img}" style="width: 40px; height: 40px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.3);" onerror="this.style.background='${pick.info.color}'; this.style.padding='8px';">
                                <div class="ai-pick-info">
                                    <div class="ai-pick-symbol">${pick.info.name}</div>
                                    <div class="ai-pick-price">$${pick.price.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                                </div>
                                <div class="ai-pick-allocation">
                                    <div class="ai-pick-change ${pick.change >= 0 ? 'pnl-positive' : 'pnl-negative'}" style="font-size: 18px; font-weight: 800;">
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
        async function fetchGlobalData() {
            try {
                const response = await fetchWithTimeout('https://api.coingecko.com/api/v3/global', {}, 10000);
                if (response.ok) {
                    const globalData = await response.json();
                    let btcDominance = globalData.data?.market_cap_percentage?.btc;
                    
                    if (btcDominance && btcDominance > 0) {
                        // Ajuste +2.1 para alinhar com TradingView/CMC
                        btcDominance = btcDominance + 2.1;
                        document.getElementById('btc-dominance').textContent = `${btcDominance.toFixed(2)}%`;
                        /* console.log('📊 BTC Dominância (CoinGecko+2.1):', btcDominance.toFixed(2) + '%'); */
                        return btcDominance;
                    }
                }
            } catch (e) {
            }
            
            // Se falhar, manter "--" até próxima tentativa (sem fallback falso)
            return null;
        }

        async function fetchCryptoStats() {
            // Buscar dados de BTC
            await fetchBTCStats();
            // Buscar dados de ETH
            await fetchETHStats();
        }

        async function fetchBTCStats() {
            try {
                const response = await fetch(`https://api.coingecko.com/api/v3/coins/bitcoin?localization=false&tickers=false&community_data=false&developer_data=false`);
                
                if (!response.ok) throw new Error('Rate limited');
                
                const data = await response.json();
                
                // Market Cap BTC
                const marketCap = data.market_data?.market_cap?.usd || 0;
                const mcapChange = data.market_data?.market_cap_change_percentage_24h || 0;
                
                if (marketCap > 1e12) {
                    document.getElementById('market-cap-btc').textContent = `$${(marketCap / 1e12).toFixed(2)}T`;
                } else if (marketCap > 1e9) {
                    document.getElementById('market-cap-btc').textContent = `$${(marketCap / 1e9).toFixed(2)}B`;
                } else {
                    document.getElementById('market-cap-btc').textContent = `$${(marketCap / 1e6).toFixed(2)}M`;
                }
                
                const mcapChangeEl = document.getElementById('mcap-change-btc');
                mcapChangeEl.textContent = `${mcapChange >= 0 ? '+' : ''}${mcapChange.toFixed(2)}%`;
                mcapChangeEl.className = `stat-change ${mcapChange >= 0 ? 'pnl-positive' : 'pnl-negative'}`;
                
            } catch (e) {
                const change = priceChanges['BTCUSDT'] || 0;
                document.getElementById('mcap-change-btc').textContent = `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`;
                document.getElementById('mcap-change-btc').className = `stat-change ${change >= 0 ? 'pnl-positive' : 'pnl-negative'}`;
            }
        }

        async function fetchETHStats() {
            try {
                const response = await fetch(`https://api.coingecko.com/api/v3/coins/ethereum?localization=false&tickers=false&community_data=false&developer_data=false`);
                
                if (!response.ok) throw new Error('Rate limited');
                
                const data = await response.json();
                
                // Market Cap ETH
                const marketCap = data.market_data?.market_cap?.usd || 0;
                const mcapChange = data.market_data?.market_cap_change_percentage_24h || 0;
                
                if (marketCap > 1e12) {
                    document.getElementById('market-cap').textContent = `$${(marketCap / 1e12).toFixed(2)}T`;
                } else if (marketCap > 1e9) {
                    document.getElementById('market-cap').textContent = `$${(marketCap / 1e9).toFixed(2)}B`;
                } else {
                    document.getElementById('market-cap').textContent = `$${(marketCap / 1e6).toFixed(2)}M`;
                }
                
                const mcapChangeEl = document.getElementById('mcap-change');
                mcapChangeEl.textContent = `${mcapChange >= 0 ? '+' : ''}${mcapChange.toFixed(2)}%`;
                mcapChangeEl.className = `stat-change ${mcapChange >= 0 ? 'pnl-positive' : 'pnl-negative'}`;
                
            } catch (e) {
                const change = priceChanges['ETHUSDT'] || 0;
                document.getElementById('mcap-change').textContent = `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`;
                document.getElementById('mcap-change').className = `stat-change ${change >= 0 ? 'pnl-positive' : 'pnl-negative'}`;
            }
        }

        async function fetchVolume() {
            // Volume BTC
            try {
                const response = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT`);
                const data = await response.json();
                const vol = parseFloat(data.quoteVolume);
                const priceChange = parseFloat(data.priceChangePercent);
                
                if (vol > 1e9) {
                    document.getElementById('live-volume-btc').textContent = `$${(vol / 1e9).toFixed(2)}B`;
                } else {
                    document.getElementById('live-volume-btc').textContent = `$${(vol / 1e6).toFixed(2)}M`;
                }
                
                const volChangeEl = document.getElementById('volume-change-btc');
                volChangeEl.textContent = `${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(2)}%`;
                volChangeEl.className = `stat-change ${priceChange >= 0 ? 'pnl-positive' : 'pnl-negative'}`;
                
            } catch (e) {
            }

            // Volume ETH
            try {
                const response = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=ETHUSDT`);
                const data = await response.json();
                const vol = parseFloat(data.quoteVolume);
                const priceChange = parseFloat(data.priceChangePercent);
                
                if (vol > 1e9) {
                    document.getElementById('live-volume').textContent = `$${(vol / 1e9).toFixed(2)}B`;
                } else {
                    document.getElementById('live-volume').textContent = `$${(vol / 1e6).toFixed(2)}M`;
                }
                
                const volChangeEl = document.getElementById('volume-change');
                volChangeEl.textContent = `${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(2)}%`;
                volChangeEl.className = `stat-change ${priceChange >= 0 ? 'pnl-positive' : 'pnl-negative'}`;
                
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
                
                // Atualizar UI - MAs
                document.getElementById('ema-9').textContent = formatMAPrice(ema9);
                document.getElementById('ema-20').textContent = formatMAPrice(ema20);
                document.getElementById('ema-50').textContent = formatMAPrice(ema50);
                document.getElementById('ma-50').textContent = formatMAPrice(ma50);
                document.getElementById('ma-99').textContent = formatMAPrice(ma99);
                document.getElementById('ma-200').textContent = formatMAPrice(ma200);
                
                const signalEma9 = getSignal(ema9);
                const signalEma20 = getSignal(ema20);
                const signalEma50 = getSignal(ema50);
                const signal50 = getSignal(ma50);
                const signal99 = getSignal(ma99);
                const signal200 = getSignal(ma200);
                
                document.getElementById('ema-9-signal').className = `ma-signal ${signalEma9.class}`;
                document.getElementById('ema-9-signal').textContent = signalEma9.text;
                document.getElementById('ema-20-signal').className = `ma-signal ${signalEma20.class}`;
                document.getElementById('ema-20-signal').textContent = signalEma20.text;
                document.getElementById('ema-50-signal').className = `ma-signal ${signalEma50.class}`;
                document.getElementById('ema-50-signal').textContent = signalEma50.text;
                document.getElementById('ma-50-signal').className = `ma-signal ${signal50.class}`;
                document.getElementById('ma-50-signal').textContent = signal50.text;
                document.getElementById('ma-99-signal').className = `ma-signal ${signal99.class}`;
                document.getElementById('ma-99-signal').textContent = signal99.text;
                document.getElementById('ma-200-signal').className = `ma-signal ${signal200.class}`;
                document.getElementById('ma-200-signal').textContent = signal200.text;
                
                // Atualizar UI - Suporte e Resistência
                document.getElementById('sr-support').textContent = formatMAPrice(support);
                document.getElementById('sr-resistance').textContent = formatMAPrice(resistance);
                
                // Resumo geral
                const signals = [signalEma9, signalEma20, signalEma50, signal50, signal99, signal200].filter(s => s.text !== '--');
                const buyCount = signals.filter(s => s.class === 'buy').length;
                const sellCount = signals.filter(s => s.class === 'sell').length;
                
                const summaryEl = document.getElementById('ma-summary');
                if (buyCount > sellCount) {
                    summaryEl.innerHTML = `<span style="color: var(--accent-green);"><i class="fas fa-arrow-trend-up"></i> TENDÊNCIA DE ALTA</span> - Preço acima de ${buyCount} de ${signals.length} MAs/EMAs`;
                } else if (sellCount > buyCount) {
                    summaryEl.innerHTML = `<span style="color: var(--accent-red);"><i class="fas fa-arrow-trend-down"></i> TENDÊNCIA DE BAIXA</span> - Preço abaixo de ${sellCount} de ${signals.length} MAs/EMAs`;
                } else {
                    summaryEl.innerHTML = `<span style="color: var(--accent-yellow);"><i class="fas fa-minus"></i> CONSOLIDAÇÃO</span> - Preço próximo das médias`;
                }
                
            } catch (e) {
                document.getElementById('ma-summary').innerHTML = '<span style="color: var(--text-muted);">Não foi possível calcular</span>';
            }
        }
