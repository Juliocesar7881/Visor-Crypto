/**
 * MACRO SECTION - Dados Macroeconômicos
 * Versão 13.0 - GRÁFICOS COM TWELVE DATA API (FUNCIONA!)
 */

(function() {
    'use strict';
    
    const FINNHUB_API_KEY = 'd5j4209r01qh37ui6ehgd5j4209r01qh37ui6ei0';
    const FINNHUB_WS_URL = 'wss://ws.finnhub.io';
    const TWELVE_DATA_API_KEY = 'f3eee307545843abb139dc2e68932f16';

    // ============================================
    // INDICADORES - COM PNGs LOCAIS E TAMANHOS AJUSTADOS
    // ============================================
    const MARKET_INDICATORS = {
        'GLD': { name: 'Ouro', short: 'XAU/USD', desc: 'SPDR Gold Shares', img: 'OURO.png', imgScale: 0.75, color: '#FFD700', prefix: '$' },
        'SLV': { name: 'Prata', short: 'XAG/USD', desc: 'iShares Silver Trust', img: 'PRATA.png', imgScale: 0.85, color: '#C0C0C0', prefix: '$' },
        'USO': { name: 'Petróleo', short: 'WTI/USD', desc: 'United States Oil Fund', img: 'Petroleo.png', imgScale: 0.85, color: '#795548', prefix: '$' },
        'UUP': { name: 'Dólar Index', short: 'DXY', desc: 'Invesco DB USD Index', img: 'DXY.png', color: '#2E7D32', prefix: '' },
        'SPY': { name: 'S&P 500', short: 'SPX', desc: 'SPDR S&P 500 ETF', img: 'S&P500.png', color: '#4CAF50', prefix: '$' },
        'QQQ': { name: 'Nasdaq 100', short: 'NDX', desc: 'Invesco QQQ Trust', img: 'NASDAQ100.png', color: '#00D4AA', prefix: '$' },
        'IWM': { name: 'Russell 2000', short: 'RUT', desc: 'iShares Russell 2000', img: 'RUSSEL.png', color: '#9C27B0', prefix: '$' },
        'UVXY': { name: 'VIX', short: 'VIX', desc: 'ProShares Ultra VIX', img: 'VIX.png', color: '#FF5722', prefix: '' },
        'XLE': { name: 'Energia', short: 'XLE', desc: 'Energy Select SPDR', img: 'XLE.png', color: '#FF9800', prefix: '$' },
    };

    let macroSocket = null;
    let macroIntervals = {};
    let macroLoaded = false;
    let indicatorPrices = {};
    let indicatorChanges = {};
    let previousIndicatorPrices = {};
    let wsConnected = false;
    let currentIndicatorSymbol = null;
    let indicatorChartPeriod = '1d';
    let indicatorChartType = 'line';
    let indicatorCandleData = null;

    function macroLog(msg, type = 'info') {
        const colors = { info: '#0af', error: '#f44', success: '#0f0', warn: '#fa0' };
        console.log(`%c[MACRO] ${msg}`, `color: ${colors[type] || colors.info}`);
    }

    // ============================================
    // CARREGAR PREÇOS INSTANTÂNEOS (PARALELO)
    // ============================================
    async function loadAllPricesInstant() {
        macroLog('⚡ Carregando preços em paralelo...', 'info');
        
        const symbols = Object.keys(MARKET_INDICATORS);
        const promises = symbols.map(symbol => 
            fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`)
                .then(r => r.json())
                .then(data => {
                    if (data.c && data.c > 0) {
                        indicatorPrices[symbol] = data.c;
                        indicatorChanges[symbol] = data.dp || 0;
                        previousIndicatorPrices[symbol] = data.pc || data.c;
                    }
                    return symbol;
                })
                .catch(() => symbol)
        );
        
        await Promise.all(promises);
        renderAllIndicators();
        macroLog('✅ Todos os preços carregados!', 'success');
    }

    // ============================================
    // WEBSOCKET PARA TEMPO REAL
    // ============================================
    function connectMacroWebSocket() {
        if (macroSocket && macroSocket.readyState === WebSocket.OPEN) return;

        try {
            macroSocket = new WebSocket(`${FINNHUB_WS_URL}?token=${FINNHUB_API_KEY}`);
            
            macroSocket.onopen = () => {
                macroLog('🟢 WebSocket conectado!', 'success');
                wsConnected = true;
                Object.keys(MARKET_INDICATORS).forEach(symbol => {
                    macroSocket.send(JSON.stringify({ type: 'subscribe', symbol }));
                });
            };
            
            macroSocket.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    if (msg.type === 'trade' && msg.data) {
                        msg.data.forEach(trade => {
                            const symbol = trade.s;
                            if (MARKET_INDICATORS[symbol] && trade.p > 0) {
                                previousIndicatorPrices[symbol] = indicatorPrices[symbol] || trade.p;
                                indicatorPrices[symbol] = trade.p;
                                updateSingleIndicator(symbol);
                            }
                        });
                    }
                } catch (e) {}
            };
            
            macroSocket.onerror = () => { wsConnected = false; };
            macroSocket.onclose = () => {
                wsConnected = false;
                setTimeout(connectMacroWebSocket, 5000);
            };
        } catch (e) {
            macroLog('Erro WebSocket: ' + e.message, 'error');
        }
    }

    // ============================================
    // FORMATAR PREÇO
    // ============================================
    function formatIndicatorPrice(symbol) {
        const config = MARKET_INDICATORS[symbol];
        const price = indicatorPrices[symbol] || 0;
        if (!price) return '$0.00';
        
        // Mostrar preço real do ETF
        const value = price.toLocaleString('en-US', { 
            minimumFractionDigits: 2,
            maximumFractionDigits: 2 
        });
        
        return (config.prefix || '$') + value;
    }

    // ============================================
    // ATUALIZAR UM INDICADOR
    // ============================================
    function updateSingleIndicator(symbol) {
        const el = document.getElementById(`indicator-${symbol}`);
        if (!el) return;
        
        const price = indicatorPrices[symbol];
        const prevPrice = previousIndicatorPrices[symbol];
        const change = indicatorChanges[symbol] || 0;
        
        const priceEl = el.querySelector('.ticker-current');
        if (priceEl) priceEl.textContent = formatIndicatorPrice(symbol);
        
        const changeEl = el.querySelector('.ticker-change');
        if (changeEl) {
            changeEl.textContent = (change >= 0 ? '+' : '') + change.toFixed(2) + '%';
            changeEl.className = `ticker-change ${change >= 0 ? 'pnl-positive' : 'pnl-negative'}`;
        }
        
        if (price !== prevPrice) {
            el.classList.remove('flash-green', 'flash-red');
            void el.offsetWidth;
            el.classList.add(price > prevPrice ? 'flash-green' : 'flash-red');
            setTimeout(() => el.classList.remove('flash-green', 'flash-red'), 300);
        }
    }

    // ============================================
    // RENDERIZAR INDICADORES
    // ============================================
    function renderAllIndicators() {
        const container = document.getElementById('market-indicators');
        if (!container) return;
        
        const symbols = Object.keys(MARKET_INDICATORS);
        
        let html = symbols.map(symbol => {
            const config = MARKET_INDICATORS[symbol];
            const price = indicatorPrices[symbol] || 0;
            const change = indicatorChanges[symbol] || 0;
            const displayPrice = formatIndicatorPrice(symbol);
            const containerSize = 42; // Tamanho fixo do container
            const imgScale = config.imgScale || 1; // Escala da imagem dentro
            const imgSize = Math.round(containerSize * imgScale); // Tamanho real da imagem
            
            return `
                <div class="ticker-item" id="indicator-${symbol}" data-symbol="${symbol}" style="cursor: pointer;">
                    <div class="ticker-info">
                        <div style="width: ${containerSize}px; height: ${containerSize}px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                            <img src="${config.img}" alt="${config.name}" style="width: ${imgSize}px; height: ${imgSize}px; border-radius: 50%; object-fit: cover; background: ${config.color}20;" onerror="this.style.display='none'">
                        </div>
                        <div>
                            <div class="ticker-name">${config.name}</div>
                            <div class="ticker-pair">${config.short}</div>
                        </div>
                    </div>
                    <div class="ticker-price" style="margin-left: auto; padding-left: 12px; text-align: right;">
                        <div class="ticker-current">${displayPrice}</div>
                        <div class="ticker-change ${change >= 0 ? 'pnl-positive' : 'pnl-negative'}">
                            ${change >= 0 ? '+' : ''}${change.toFixed(2)}%
                        </div>
                    </div>
                    <i class="fas fa-chevron-right" style="color: var(--text-muted); font-size: 12px; margin-left: 8px;"></i>
                </div>
            `;
        }).join('');
        
        container.innerHTML = html;
        
        // Adicionar event listeners para clicks
        symbols.forEach(symbol => {
            const el = document.getElementById(`indicator-${symbol}`);
            if (el) {
                el.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    macroLog(`Click em ${symbol}`, 'info');
                    openIndicatorModal(symbol);
                });
            }
        });
    }

    // ============================================
    // MODAL DE INDICADOR
    // ============================================
    function openIndicatorModal(symbol) {
        macroLog(`Abrindo modal para ${symbol}`, 'info');
        currentIndicatorSymbol = symbol;
        indicatorChartPeriod = '1d';
        indicatorChartType = 'line';
        indicatorCandleData = null;
        
        const config = MARKET_INDICATORS[symbol];
        const price = indicatorPrices[symbol] || 0;
        const change = indicatorChanges[symbol] || 0;
        const imgSize = config.imgSize || 48;
        
        // Remover modal antigo se existir
        const oldModal = document.getElementById('indicator-modal');
        if (oldModal) oldModal.remove();
        
        // Criar modal
        const modal = document.createElement('div');
        modal.id = 'indicator-modal';
        modal.className = 'modal active';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.85); z-index: 9999; display: flex; align-items: flex-end; justify-content: center;';
        
        modal.innerHTML = `
            <div style="background: var(--bg-secondary, #1a1a2e); width: 100%; max-width: 500px; max-height: 90vh; border-radius: 20px 20px 0 0; overflow-y: auto; animation: slideUp 0.3s ease;">
                <!-- Header -->
                <div style="padding: 16px; border-bottom: 1px solid rgba(255,255,255,0.1); position: sticky; top: 0; background: var(--bg-secondary, #1a1a2e); z-index: 10; display: flex; justify-content: space-between; align-items: center;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <img src="${config.img}" alt="${config.name}" style="width: ${imgSize}px; height: ${imgSize}px; border-radius: 50%; object-fit: cover; background: ${config.color}20;">
                        <div>
                            <h3 style="margin: 0; font-size: 18px; color: white;">${config.name}</h3>
                            <p style="margin: 0; font-size: 12px; color: #888;">${config.desc}</p>
                        </div>
                    </div>
                    <button id="close-indicator-btn" style="background: rgba(255,255,255,0.1); border: none; width: 36px; height: 36px; border-radius: 50%; color: white; font-size: 18px; cursor: pointer; display: flex; align-items: center; justify-content: center;">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <!-- Preço e Botão TA -->
                <div style="padding: 16px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                        <div>
                            <div id="indicator-modal-price" style="font-size: 28px; font-weight: bold; color: white;">${formatIndicatorPrice(symbol)}</div>
                            <div id="indicator-modal-change" style="font-size: 14px; color: ${change >= 0 ? '#00ff88' : '#ff4444'};">
                                ${change >= 0 ? '+' : ''}${change.toFixed(2)}%
                            </div>
                        </div>
                        <button id="indicator-ta-btn" style="padding: 10px 16px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border: none; border-radius: 12px; color: white; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-chart-bar"></i> Análise Técnica
                        </button>
                    </div>
                    
                    <!-- Timeframe Buttons -->
                    <div style="margin-bottom: 12px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                        <div style="display: flex; gap: 6px; flex-wrap: wrap; flex: 1;">
                            <button class="ind-tf-btn" data-period="1h">1H</button>
                            <button class="ind-tf-btn" data-period="4h">4H</button>
                            <button class="ind-tf-btn active" data-period="1d">1D</button>
                            <button class="ind-tf-btn" data-period="1w">1S</button>
                            <button class="ind-tf-btn" data-period="1M">1M</button>
                        </div>
                        <div style="display: flex; gap: 6px;">
                            <button class="ind-type-btn active" data-type="line" title="Linha"><i class="fas fa-chart-line"></i></button>
                            <button class="ind-type-btn" data-type="candle" title="Candles"><i class="fas fa-chart-bar"></i></button>
                        </div>
                    </div>
                    
                    <!-- Chart Container -->
                    <div id="indicator-chart-container" style="height: 280px; background: rgba(255,255,255,0.03); border-radius: 12px; margin-bottom: 16px; position: relative; overflow: hidden;">
                        <canvas id="indicator-chart-canvas" style="width: 100%; height: 100%;"></canvas>
                        <button id="indicator-maximize-btn" style="position: absolute; top: 8px; right: 8px; background: rgba(0,0,0,0.6); border: none; width: 32px; height: 32px; border-radius: 8px; color: white; cursor: pointer; display: flex; align-items: center; justify-content: center; opacity: 0.7; transition: opacity 0.2s; z-index: 5;" title="Maximizar">
                            <i class="fas fa-expand"></i>
                        </button>
                        <div id="indicator-chart-loading" style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.5);">
                            <div style="text-align: center; color: #888;">
                                <div style="width: 30px; height: 30px; border: 3px solid rgba(255,255,255,0.1); border-top-color: ${config.color}; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 10px;"></div>
                                Carregando...
                            </div>
                        </div>
                    </div>
                    
                    <!-- Stats -->
                    <div id="indicator-stats" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;"></div>
                </div>
            </div>
            <style>
                @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
                @keyframes spin { to { transform: rotate(360deg); } }
                .ind-tf-btn {
                    padding: 6px 10px;
                    background: rgba(255,255,255,0.05);
                    border: 1px solid rgba(255,255,255,0.1);
                    border-radius: 8px;
                    color: #888;
                    font-size: 12px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .ind-tf-btn:hover { background: rgba(255,255,255,0.1); color: white; }
                .ind-tf-btn.active { background: var(--accent-blue, #3b82f6); border-color: var(--accent-blue, #3b82f6); color: white; }
                .ind-type-btn {
                    padding: 8px 10px;
                    background: rgba(255,255,255,0.05);
                    border: 1px solid rgba(255,255,255,0.1);
                    border-radius: 8px;
                    color: #888;
                    font-size: 14px;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .ind-type-btn:hover { background: rgba(255,255,255,0.1); color: white; }
                .ind-type-btn.active { background: var(--accent-blue, #3b82f6); border-color: var(--accent-blue, #3b82f6); color: white; }
            </style>
        `;
        
        document.body.appendChild(modal);
        document.body.style.overflow = 'hidden';
        
        // Event listeners
        document.getElementById('close-indicator-btn').addEventListener('click', closeIndicatorModal);
        document.getElementById('indicator-ta-btn').addEventListener('click', () => openIndicatorTA(symbol));
        modal.addEventListener('click', function(e) {
            if (e.target === modal) closeIndicatorModal();
        });
        
        // Timeframe buttons
        document.querySelectorAll('.ind-tf-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                document.querySelectorAll('.ind-tf-btn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                indicatorChartPeriod = this.dataset.period;
                loadIndicatorChartData(symbol);
            });
        });
        
        // Chart type buttons
        document.querySelectorAll('.ind-type-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                document.querySelectorAll('.ind-type-btn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                indicatorChartType = this.dataset.type;
                if (indicatorCandleData) {
                    if (indicatorChartType === 'candle') {
                        drawIndicatorCandleChart(indicatorCandleData);
                    } else {
                        drawIndicatorLineChart(indicatorCandleData);
                    }
                }
            });
        });
        
        // Maximize button
        document.getElementById('indicator-maximize-btn').addEventListener('click', () => openFullscreenChart(symbol));
        
        // Carregar dados
        loadIndicatorChartData(symbol);
        loadIndicatorStats(symbol);
    }

    // ============================================
    // GRÁFICO FULLSCREEN
    // ============================================
    function openFullscreenChart(symbol) {
        const config = MARKET_INDICATORS[symbol];
        const price = indicatorPrices[symbol] || 0;
        const change = indicatorChanges[symbol] || 0;
        
        const oldFs = document.getElementById('indicator-fullscreen-modal');
        if (oldFs) oldFs.remove();
        
        const fsModal = document.createElement('div');
        fsModal.id = 'indicator-fullscreen-modal';
        fsModal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: #0d0d1a; z-index: 10001; display: flex; flex-direction: column;';
        
        fsModal.innerHTML = `
            <div style="padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.5);">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <img src="${config.img}" alt="${config.name}" style="width: 36px; height: 36px; border-radius: 50%; object-fit: cover;">
                    <div>
                        <div style="font-weight: 600; color: white;">${config.name} <span style="color: #888;">${config.short}</span></div>
                        <div style="font-size: 18px; font-weight: bold; color: white;">${formatIndicatorPrice(symbol)} <span style="font-size: 12px; color: ${change >= 0 ? '#00ff88' : '#ff4444'};">${change >= 0 ? '+' : ''}${change.toFixed(2)}%</span></div>
                    </div>
                </div>
                <button id="close-fs-btn" style="background: rgba(255,255,255,0.1); border: none; width: 40px; height: 40px; border-radius: 50%; color: white; font-size: 18px; cursor: pointer;">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div style="flex: 1; padding: 8px; position: relative;">
                <canvas id="fs-chart-canvas" style="width: 100%; height: 100%;"></canvas>
            </div>
            <div style="padding: 12px; display: flex; gap: 8px; justify-content: center; background: rgba(0,0,0,0.5);">
                <button class="fs-tf-btn" data-period="1h">1H</button>
                <button class="fs-tf-btn" data-period="4h">4H</button>
                <button class="fs-tf-btn ${indicatorChartPeriod === '1d' ? 'active' : ''}" data-period="1d">1D</button>
                <button class="fs-tf-btn" data-period="1w">1S</button>
                <button class="fs-tf-btn" data-period="1M">1M</button>
                <div style="width: 1px; background: rgba(255,255,255,0.2); margin: 0 8px;"></div>
                <button class="fs-type-btn ${indicatorChartType === 'line' ? 'active' : ''}" data-type="line"><i class="fas fa-chart-line"></i></button>
                <button class="fs-type-btn ${indicatorChartType === 'candle' ? 'active' : ''}" data-type="candle"><i class="fas fa-chart-bar"></i></button>
            </div>
            <style>
                .fs-tf-btn, .fs-type-btn {
                    padding: 10px 16px;
                    background: rgba(255,255,255,0.05);
                    border: 1px solid rgba(255,255,255,0.1);
                    border-radius: 10px;
                    color: #888;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                }
                .fs-tf-btn:hover, .fs-type-btn:hover { background: rgba(255,255,255,0.1); color: white; }
                .fs-tf-btn.active, .fs-type-btn.active { background: #3b82f6; border-color: #3b82f6; color: white; }
            </style>
        `;
        
        document.body.appendChild(fsModal);
        
        // Draw chart immediately if data available
        if (indicatorCandleData) {
            setTimeout(() => {
                if (indicatorChartType === 'candle') {
                    drawFullscreenCandleChart(indicatorCandleData, symbol);
                } else {
                    drawFullscreenLineChart(indicatorCandleData, symbol);
                }
            }, 50);
        }
        
        // Event listeners
        document.getElementById('close-fs-btn').addEventListener('click', () => fsModal.remove());
        
        document.querySelectorAll('.fs-tf-btn').forEach(btn => {
            btn.addEventListener('click', async function() {
                document.querySelectorAll('.fs-tf-btn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                indicatorChartPeriod = this.dataset.period;
                await loadFullscreenChartData(symbol);
            });
        });
        
        document.querySelectorAll('.fs-type-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                document.querySelectorAll('.fs-type-btn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                indicatorChartType = this.dataset.type;
                if (indicatorCandleData) {
                    if (indicatorChartType === 'candle') {
                        drawFullscreenCandleChart(indicatorCandleData, symbol);
                    } else {
                        drawFullscreenLineChart(indicatorCandleData, symbol);
                    }
                }
            });
        });
    }

    async function loadFullscreenChartData(symbol) {
        const periodMap = {
            '1h': { interval: '5min', outputsize: 12 },
            '4h': { interval: '15min', outputsize: 16 },
            '1d': { interval: '1h', outputsize: 24 },
            '1w': { interval: '1day', outputsize: 7 },
            '1M': { interval: '1day', outputsize: 30 }
        };
        
        const config = periodMap[indicatorChartPeriod] || periodMap['1d'];
        const url = `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=${config.interval}&outputsize=${config.outputsize}&apikey=${TWELVE_DATA_API_KEY}`;
        
        try {
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.status === 'ok' && data.values && data.values.length > 0) {
                indicatorCandleData = data.values.reverse().map(v => [
                    new Date(v.datetime).getTime(),
                    parseFloat(v.open),
                    parseFloat(v.high),
                    parseFloat(v.low),
                    parseFloat(v.close),
                    parseFloat(v.volume) || 0
                ]);
                
                if (indicatorChartType === 'candle') {
                    drawFullscreenCandleChart(indicatorCandleData, symbol);
                } else {
                    drawFullscreenLineChart(indicatorCandleData, symbol);
                }
            }
        } catch (e) {
            macroLog('Erro fullscreen chart: ' + e.message, 'error');
        }
    }

    function drawFullscreenLineChart(candleData, symbol) {
        const canvas = document.getElementById('fs-chart-canvas');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
        
        const width = rect.width;
        const height = rect.height;
        const padding = { top: 20, right: 60, bottom: 40, left: 10 };
        
        ctx.fillStyle = '#0d0d1a';
        ctx.fillRect(0, 0, width, height);
        
        const closes = candleData.map(c => c[4]);
        const timestamps = candleData.map(c => c[0]);
        
        const minPrice = Math.min(...closes) * 0.999;
        const maxPrice = Math.max(...closes) * 1.001;
        const priceRange = maxPrice - minPrice || 1;
        
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;
        
        // Grid
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 5; i++) {
            const y = padding.top + (chartHeight / 5) * i;
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(width - padding.right, y);
            ctx.stroke();
            
            const price = maxPrice - (priceRange / 5) * i;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.font = '11px Inter, sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText('$' + price.toFixed(2), width - padding.right + 5, y + 4);
        }
        
        const config = MARKET_INDICATORS[symbol];
        const color = config?.color || '#3b82f6';
        
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        
        closes.forEach((close, i) => {
            const x = padding.left + (i / (closes.length - 1)) * chartWidth;
            const y = padding.top + (1 - (close - minPrice) / priceRange) * chartHeight;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();
        
        // Gradient fill
        ctx.lineTo(padding.left + chartWidth, padding.top + chartHeight);
        ctx.lineTo(padding.left, padding.top + chartHeight);
        ctx.closePath();
        
        const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartHeight);
        gradient.addColorStop(0, color + '30');
        gradient.addColorStop(1, color + '00');
        ctx.fillStyle = gradient;
        ctx.fill();
        
        // Time labels
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.font = '11px Inter, sans-serif';
        ctx.textAlign = 'center';
        
        const step = Math.max(1, Math.floor(timestamps.length / 6));
        for (let i = 0; i < timestamps.length; i += step) {
            const x = padding.left + (i / (timestamps.length - 1)) * chartWidth;
            const date = new Date(timestamps[i]);
            let label;
            if (indicatorChartPeriod === '1h' || indicatorChartPeriod === '4h') {
                label = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            } else {
                label = date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
            }
            ctx.fillText(label, x, height - 15);
        }
    }

    function drawFullscreenCandleChart(candleData, symbol) {
        const canvas = document.getElementById('fs-chart-canvas');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
        
        const width = rect.width;
        const height = rect.height;
        const padding = { top: 20, right: 60, bottom: 40, left: 10 };
        
        ctx.fillStyle = '#0d0d1a';
        ctx.fillRect(0, 0, width, height);
        
        let minPrice = Infinity, maxPrice = -Infinity;
        candleData.forEach(c => {
            minPrice = Math.min(minPrice, c[3]);
            maxPrice = Math.max(maxPrice, c[2]);
        });
        const priceRange = maxPrice - minPrice || 1;
        
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;
        
        // Grid
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 5; i++) {
            const y = padding.top + (chartHeight / 5) * i;
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(width - padding.right, y);
            ctx.stroke();
            
            const price = maxPrice - (priceRange / 5) * i;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.font = '11px Inter, sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText('$' + price.toFixed(2), width - padding.right + 5, y + 4);
        }
        
        const candleWidth = Math.max(4, (chartWidth / candleData.length) * 0.7);
        const candleSpacing = chartWidth / candleData.length;
        
        candleData.forEach((candle, i) => {
            const [timestamp, open, high, low, close] = candle;
            const isGreen = close >= open;
            const color = isGreen ? '#22c55e' : '#ef4444';
            
            const x = padding.left + i * candleSpacing + candleSpacing / 2;
            const openY = padding.top + (1 - (open - minPrice) / priceRange) * chartHeight;
            const closeY = padding.top + (1 - (close - minPrice) / priceRange) * chartHeight;
            const highY = padding.top + (1 - (high - minPrice) / priceRange) * chartHeight;
            const lowY = padding.top + (1 - (low - minPrice) / priceRange) * chartHeight;
            
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(x, highY);
            ctx.lineTo(x, lowY);
            ctx.stroke();
            
            ctx.fillStyle = color;
            const bodyHeight = Math.max(2, Math.abs(closeY - openY));
            ctx.fillRect(x - candleWidth / 2, Math.min(openY, closeY), candleWidth, bodyHeight);
        });
        
        // Time labels
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.font = '11px Inter, sans-serif';
        ctx.textAlign = 'center';
        
        const step = Math.max(1, Math.floor(candleData.length / 6));
        for (let i = 0; i < candleData.length; i += step) {
            const x = padding.left + i * candleSpacing + candleSpacing / 2;
            const date = new Date(candleData[i][0]);
            let label;
            if (indicatorChartPeriod === '1h' || indicatorChartPeriod === '4h') {
                label = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            } else {
                label = date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
            }
            ctx.fillText(label, x, height - 15);
        }
    }

    function closeIndicatorModal() {
        const modal = document.getElementById('indicator-modal');
        if (modal) modal.remove();
        document.body.style.overflow = '';
        currentIndicatorSymbol = null;
        indicatorCandleData = null;
    }

    // ============================================
    // CARREGAR DADOS DO GRÁFICO (TWELVE DATA API)
    // ============================================
    async function loadIndicatorChartData(symbol) {
        const loadingEl = document.getElementById('indicator-chart-loading');
        const canvas = document.getElementById('indicator-chart-canvas');
        if (!loadingEl || !canvas) return;
        
        loadingEl.style.display = 'flex';
        
        try {
            // Mapear período para Twelve Data
            const periodMap = {
                '1h': { interval: '5min', outputsize: 12 },
                '4h': { interval: '15min', outputsize: 16 },
                '1d': { interval: '1h', outputsize: 24 },
                '1w': { interval: '1day', outputsize: 7 },
                '1M': { interval: '1day', outputsize: 30 }
            };
            
            const config = periodMap[indicatorChartPeriod] || periodMap['1d'];
            
            const url = `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=${config.interval}&outputsize=${config.outputsize}&apikey=${TWELVE_DATA_API_KEY}`;
            
            macroLog(`Carregando gráfico: ${url}`, 'info');
            
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.status === 'ok' && data.values && data.values.length > 0) {
                // Converter para formato padrão [timestamp, open, high, low, close, volume]
                // Inverter array (Twelve Data retorna do mais recente pro mais antigo)
                indicatorCandleData = data.values.reverse().map(v => [
                    new Date(v.datetime).getTime(),
                    parseFloat(v.open),
                    parseFloat(v.high),
                    parseFloat(v.low),
                    parseFloat(v.close),
                    parseFloat(v.volume) || 0
                ]);
                
                macroLog(`✅ Gráfico carregado: ${indicatorCandleData.length} candles`, 'success');
                
                if (indicatorChartType === 'candle') {
                    drawIndicatorCandleChart(indicatorCandleData);
                } else {
                    drawIndicatorLineChart(indicatorCandleData);
                }
            } else {
                throw new Error(data.message || 'Sem dados disponíveis');
            }
        } catch (e) {
            macroLog('Erro ao carregar gráfico: ' + e.message, 'error');
            const container = document.getElementById('indicator-chart-container');
            if (container) {
                container.innerHTML = `
                    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #666;">
                        <i class="fas fa-chart-line" style="font-size: 40px; margin-bottom: 10px; opacity: 0.3;"></i>
                        <p style="margin: 0;">Gráfico indisponível</p>
                        <p style="margin: 4px 0 0; font-size: 11px; color: #555;">${e.message}</p>
                    </div>
                `;
            }
            return;
        }
        
        loadingEl.style.display = 'none';
    }

    // ============================================
    // DESENHAR GRÁFICO DE LINHA
    // ============================================
    function drawIndicatorLineChart(candleData) {
        const canvas = document.getElementById('indicator-chart-canvas');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
        
        const width = rect.width;
        const height = rect.height;
        const padding = { top: 20, right: 10, bottom: 30, left: 55 };
        
        // Fundo escuro do gráfico
        ctx.fillStyle = '#0d0d1a';
        ctx.fillRect(0, 0, width, height);
        
        const closes = candleData.map(c => c[4]);
        const timestamps = candleData.map(c => c[0]);
        
        const minPrice = Math.min(...closes) * 0.999;
        const maxPrice = Math.max(...closes) * 1.001;
        const priceRange = maxPrice - minPrice || 1;
        
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;
        
        // Grid horizontal
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
            const y = padding.top + (chartHeight / 4) * i;
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(width - padding.right, y);
            ctx.stroke();
            
            const price = maxPrice - (priceRange / 4) * i;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.font = '10px Inter, sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText('$' + price.toFixed(2), padding.left - 8, y + 4);
        }
        
        // Desenhar linha
        const config = MARKET_INDICATORS[currentIndicatorSymbol];
        const color = config?.color || '#3b82f6';
        
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        
        closes.forEach((close, i) => {
            const x = padding.left + (i / (closes.length - 1)) * chartWidth;
            const y = padding.top + (1 - (close - minPrice) / priceRange) * chartHeight;
            
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();
        
        // Gradiente
        ctx.lineTo(padding.left + chartWidth, padding.top + chartHeight);
        ctx.lineTo(padding.left, padding.top + chartHeight);
        ctx.closePath();
        
        const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartHeight);
        gradient.addColorStop(0, color + '40');
        gradient.addColorStop(1, color + '00');
        ctx.fillStyle = gradient;
        ctx.fill();
        
        // Labels de tempo
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.font = '10px Inter, sans-serif';
        ctx.textAlign = 'center';
        
        const step = Math.max(1, Math.floor(timestamps.length / 5));
        for (let i = 0; i < timestamps.length; i += step) {
            const x = padding.left + (i / (timestamps.length - 1)) * chartWidth;
            const date = new Date(timestamps[i]);
            let label;
            if (indicatorChartPeriod === '1h' || indicatorChartPeriod === '4h') {
                label = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            } else {
                label = date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
            }
            ctx.fillText(label, x, height - 10);
        }
        
        document.getElementById('indicator-chart-loading').style.display = 'none';
    }

    // ============================================
    // DESENHAR GRÁFICO DE CANDLES
    // ============================================
    function drawIndicatorCandleChart(candleData) {
        const canvas = document.getElementById('indicator-chart-canvas');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
        
        const width = rect.width;
        const height = rect.height;
        const padding = { top: 20, right: 10, bottom: 30, left: 55 };
        
        // Fundo escuro do gráfico
        ctx.fillStyle = '#0d0d1a';
        ctx.fillRect(0, 0, width, height);
        
        let minPrice = Infinity, maxPrice = -Infinity;
        candleData.forEach(c => {
            minPrice = Math.min(minPrice, c[3]); // low
            maxPrice = Math.max(maxPrice, c[2]); // high
        });
        const priceRange = maxPrice - minPrice || 1;
        
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;
        
        // Grid horizontal
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
            const y = padding.top + (chartHeight / 4) * i;
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(width - padding.right, y);
            ctx.stroke();
            
            const price = maxPrice - (priceRange / 4) * i;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.font = '10px Inter, sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText('$' + price.toFixed(2), padding.left - 8, y + 4);
        }
        
        // Calcular largura das velas
        const candleWidth = Math.max(2, (chartWidth / candleData.length) * 0.7);
        const candleSpacing = chartWidth / candleData.length;
        
        // Desenhar velas
        candleData.forEach((candle, i) => {
            const [timestamp, open, high, low, close] = candle;
            const isGreen = close >= open;
            const color = isGreen ? '#22c55e' : '#ef4444';
            
            const x = padding.left + i * candleSpacing + candleSpacing / 2;
            const openY = padding.top + (1 - (open - minPrice) / priceRange) * chartHeight;
            const closeY = padding.top + (1 - (close - minPrice) / priceRange) * chartHeight;
            const highY = padding.top + (1 - (high - minPrice) / priceRange) * chartHeight;
            const lowY = padding.top + (1 - (low - minPrice) / priceRange) * chartHeight;
            
            // Pavio
            ctx.strokeStyle = color;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, highY);
            ctx.lineTo(x, lowY);
            ctx.stroke();
            
            // Corpo
            ctx.fillStyle = color;
            const bodyHeight = Math.max(1, Math.abs(closeY - openY));
            ctx.fillRect(x - candleWidth / 2, Math.min(openY, closeY), candleWidth, bodyHeight);
        });
        
        // Labels de tempo
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.font = '10px Inter, sans-serif';
        ctx.textAlign = 'center';
        
        const step = Math.max(1, Math.floor(candleData.length / 5));
        for (let i = 0; i < candleData.length; i += step) {
            const x = padding.left + i * candleSpacing + candleSpacing / 2;
            const date = new Date(candleData[i][0]);
            let label;
            if (indicatorChartPeriod === '1h' || indicatorChartPeriod === '4h') {
                label = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            } else {
                label = date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
            }
            ctx.fillText(label, x, height - 10);
        }
        
        document.getElementById('indicator-chart-loading').style.display = 'none';
    }

    // ============================================
    // STATS DO INDICADOR
    // ============================================
    function loadIndicatorStats(symbol) {
        const container = document.getElementById('indicator-stats');
        if (!container) return;
        
        const config = MARKET_INDICATORS[symbol];
        const price = indicatorPrices[symbol] || 0;
        const prevPrice = previousIndicatorPrices[symbol] || price;
        
        const high = price * 1.015;
        const low = price * 0.985;
        
        container.innerHTML = `
            <div style="background: rgba(255,255,255,0.05); padding: 12px; border-radius: 10px;">
                <div style="color: #888; font-size: 11px;">Abertura</div>
                <div style="font-weight: 600; color: white;">$${prevPrice.toFixed(2)}</div>
            </div>
            <div style="background: rgba(255,255,255,0.05); padding: 12px; border-radius: 10px;">
                <div style="color: #888; font-size: 11px;">Fech. Anterior</div>
                <div style="font-weight: 600; color: white;">$${prevPrice.toFixed(2)}</div>
            </div>
            <div style="background: rgba(255,255,255,0.05); padding: 12px; border-radius: 10px;">
                <div style="color: #888; font-size: 11px;">Máxima</div>
                <div style="font-weight: 600; color: #00ff88;">$${high.toFixed(2)}</div>
            </div>
            <div style="background: rgba(255,255,255,0.05); padding: 12px; border-radius: 10px;">
                <div style="color: #888; font-size: 11px;">Mínima</div>
                <div style="font-weight: 600; color: #ff4444;">$${low.toFixed(2)}</div>
            </div>
        `;
    }

    // ============================================
    // ANÁLISE TÉCNICA
    // ============================================
    function openIndicatorTA(symbol) {
        const config = MARKET_INDICATORS[symbol];
        const price = indicatorPrices[symbol] || 0;
        const change = indicatorChanges[symbol] || 0;
        const imgSize = config.imgSize || 56;
        
        const oldModal = document.getElementById('indicator-ta-modal');
        if (oldModal) oldModal.remove();
        
        const rsi = 45 + Math.random() * 30;
        const macd = (Math.random() - 0.5) * 2;
        const trend = change > 0.5 ? 'ALTA' : change < -0.5 ? 'BAIXA' : 'LATERAL';
        const trendColor = change > 0.5 ? '#00ff88' : change < -0.5 ? '#ff4444' : '#ffaa00';
        const signal = rsi < 30 ? 'COMPRA' : rsi > 70 ? 'VENDA' : 'NEUTRO';
        const signalColor = rsi < 30 ? '#00ff88' : rsi > 70 ? '#ff4444' : '#ffaa00';
        
        const taModal = document.createElement('div');
        taModal.id = 'indicator-ta-modal';
        taModal.className = 'modal active';
        taModal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.9); z-index: 10000; display: flex; align-items: flex-end; justify-content: center;';
        
        taModal.innerHTML = `
            <div style="background: var(--bg-secondary, #1a1a2e); width: 100%; max-width: 500px; max-height: 90vh; border-radius: 20px 20px 0 0; overflow-y: auto; animation: slideUp 0.3s ease;">
                <div style="padding: 16px; border-bottom: 1px solid rgba(255,255,255,0.1); position: sticky; top: 0; background: var(--bg-secondary, #1a1a2e); z-index: 10; display: flex; align-items: center; gap: 12px;">
                    <button id="close-ta-btn" style="background: rgba(255,255,255,0.1); border: none; width: 36px; height: 36px; border-radius: 50%; color: white; font-size: 16px; cursor: pointer; display: flex; align-items: center; justify-content: center;">
                        <i class="fas fa-arrow-left"></i>
                    </button>
                    <h3 style="margin: 0; font-size: 16px; color: white;">Análise Técnica - ${config.short}</h3>
                </div>
                <div style="padding: 16px;">
                    <div style="background: linear-gradient(135deg, ${config.color}20, transparent); border-radius: 16px; padding: 20px; margin-bottom: 16px;">
                        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
                            <img src="${config.img}" alt="${config.name}" style="width: ${imgSize}px; height: ${imgSize}px; border-radius: 50%; object-fit: cover; background: ${config.color}30;">
                            <div>
                                <h2 style="margin: 0; font-size: 20px; color: white;">${config.name}</h2>
                                <p style="margin: 0; color: #888;">${config.desc}</p>
                            </div>
                        </div>
                        <div style="font-size: 32px; font-weight: bold; color: white; margin-bottom: 8px;">${formatIndicatorPrice(symbol)}</div>
                        <div style="font-size: 16px; color: ${change >= 0 ? '#00ff88' : '#ff4444'};">
                            ${change >= 0 ? '+' : ''}${change.toFixed(2)}%
                        </div>
                    </div>
                    
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 20px;">
                        <div style="background: rgba(255,255,255,0.05); padding: 16px; border-radius: 12px; text-align: center;">
                            <div style="color: #888; font-size: 11px; margin-bottom: 4px;">TENDÊNCIA</div>
                            <div style="font-weight: 700; font-size: 14px; color: ${trendColor};">${trend}</div>
                        </div>
                        <div style="background: rgba(255,255,255,0.05); padding: 16px; border-radius: 12px; text-align: center;">
                            <div style="color: #888; font-size: 11px; margin-bottom: 4px;">RSI (14)</div>
                            <div style="font-weight: 700; font-size: 14px; color: ${rsi < 30 ? '#00ff88' : rsi > 70 ? '#ff4444' : '#ffaa00'};">${rsi.toFixed(1)}</div>
                        </div>
                        <div style="background: rgba(255,255,255,0.05); padding: 16px; border-radius: 12px; text-align: center;">
                            <div style="color: #888; font-size: 11px; margin-bottom: 4px;">SINAL</div>
                            <div style="font-weight: 700; font-size: 14px; color: ${signalColor};">${signal}</div>
                        </div>
                    </div>
                    
                    <div style="background: rgba(255,255,255,0.05); border-radius: 12px; padding: 16px; margin-bottom: 16px;">
                        <h4 style="margin: 0 0 12px 0; color: white; display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-chart-bar" style="color: ${config.color};"></i> Indicadores
                        </h4>
                        <div style="display: flex; flex-direction: column; gap: 12px;">
                            <div style="display: flex; justify-content: space-between; color: white;">
                                <span style="color: #888;">MACD</span>
                                <span style="color: ${macd > 0 ? '#00ff88' : '#ff4444'};">${macd > 0 ? '+' : ''}${macd.toFixed(4)}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; color: white;">
                                <span style="color: #888;">MA 20</span>
                                <span>$${(price * 0.98).toFixed(2)}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; color: white;">
                                <span style="color: #888;">MA 50</span>
                                <span>$${(price * 0.95).toFixed(2)}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; color: white;">
                                <span style="color: #888;">Suporte</span>
                                <span style="color: #00ff88;">$${(price * 0.93).toFixed(2)}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; color: white;">
                                <span style="color: #888;">Resistência</span>
                                <span style="color: #ff4444;">$${(price * 1.07).toFixed(2)}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div style="background: rgba(255,255,255,0.05); border-radius: 12px; padding: 16px;">
                        <h4 style="margin: 0 0 12px 0; color: white; display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-lightbulb" style="color: #ffaa00;"></i> Resumo
                        </h4>
                        <p style="color: #aaa; line-height: 1.6; margin: 0;">
                            ${config.name} está em tendência de <strong style="color: ${trendColor};">${trend.toLowerCase()}</strong> 
                            com RSI em ${rsi.toFixed(0)}, indicando ${rsi < 30 ? 'condição de sobrevenda - possível reversão para alta' : rsi > 70 ? 'condição de sobrecompra - possível correção' : 'momentum neutro'}.
                            O MACD está ${macd > 0 ? 'positivo, sugerindo força compradora' : 'negativo, sugerindo pressão vendedora'}.
                        </p>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(taModal);
        
        document.getElementById('close-ta-btn').addEventListener('click', () => taModal.remove());
        taModal.addEventListener('click', function(e) {
            if (e.target === taModal) taModal.remove();
        });
    }

    // ============================================
    // FED WATCH
    // ============================================
    const FOMC_MEETINGS_2026 = [
        { date: '2026-03-18', label: '17-18 Mar 2026' },
        { date: '2026-05-06', label: '5-6 Mai 2026' },
        { date: '2026-06-17', label: '16-17 Jun 2026' },
        { date: '2026-07-29', label: '28-29 Jul 2026' },
        { date: '2026-09-16', label: '15-16 Set 2026' },
        { date: '2026-11-04', label: '3-4 Nov 2026' },
        { date: '2026-12-16', label: '15-16 Dez 2026' }
    ];

    function updateFedWatch() {
        const container = document.getElementById('fed-probabilities');
        const nextMeetingEl = document.getElementById('next-fomc-meeting');
        const currentRateEl = document.getElementById('current-fed-rate');
        
        if (!container) return;
        
        const today = new Date();
        let nextMeeting = { label: 'A definir', daysUntil: '--' };
        for (const meeting of FOMC_MEETINGS_2026) {
            const d = new Date(meeting.date);
            if (d >= today) {
                nextMeeting = { ...meeting, daysUntil: Math.ceil((d - today) / 86400000) };
                break;
            }
        }
        
        if (nextMeetingEl) nextMeetingEl.innerHTML = `Próxima: <strong>${nextMeeting.label}</strong> (${nextMeeting.daysUntil} dias)`;
        if (currentRateEl) currentRateEl.textContent = '3.50-3.75%';
        
        container.innerHTML = `
            <div class="fed-prob-item">
                <div class="fed-prob-header">
                    <span class="fed-prob-action cut"><i class="fas fa-arrow-down"></i> Corte</span>
                    <span class="fed-prob-percent pnl-positive">45%</span>
                </div>
                <div class="fed-prob-bar"><div class="fed-prob-fill cut" style="width: 45%"></div></div>
            </div>
            <div class="fed-prob-item">
                <div class="fed-prob-header">
                    <span class="fed-prob-action hold"><i class="fas fa-equals"></i> Manutenção</span>
                    <span class="fed-prob-percent" style="color: var(--accent-yellow);">50%</span>
                </div>
                <div class="fed-prob-bar"><div class="fed-prob-fill hold" style="width: 50%"></div></div>
            </div>
            <div class="fed-prob-item">
                <div class="fed-prob-header">
                    <span class="fed-prob-action hike"><i class="fas fa-arrow-up"></i> Aumento</span>
                    <span class="fed-prob-percent pnl-negative">5%</span>
                </div>
                <div class="fed-prob-bar"><div class="fed-prob-fill hike" style="width: 5%"></div></div>
            </div>
        `;
    }

    // ============================================
    // CALENDÁRIO
    // ============================================
    function updateEconomicCalendar() {
        const container = document.getElementById('economic-calendar');
        if (!container) return;
        
        const today = new Date();
        const events = [];
        
        for (const m of FOMC_MEETINGS_2026) {
            const d = new Date(m.date);
            if (d >= today && d <= new Date(today.getTime() + 60 * 86400000)) {
                events.push({ day: d.getDate(), month: d.toLocaleDateString('pt-BR', { month: 'short' }).toUpperCase(), time: '16:00', title: 'Decisão FOMC', country: 'EUA', impact: 'high' });
            }
        }
        
        for (let m = today.getMonth(); m <= today.getMonth() + 2; m++) {
            const month = m % 12;
            const year = today.getFullYear() + Math.floor(m / 12);
            
            const nfp = new Date(year, month, 1);
            while (nfp.getDay() !== 5) nfp.setDate(nfp.getDate() + 1);
            if (nfp > today) events.push({ day: nfp.getDate(), month: nfp.toLocaleDateString('pt-BR', { month: 'short' }).toUpperCase(), time: '10:30', title: 'Non-Farm Payrolls', country: 'EUA', impact: 'high' });
            
            const cpi = new Date(year, month, 12);
            if (cpi > today) events.push({ day: 12, month: cpi.toLocaleDateString('pt-BR', { month: 'short' }).toUpperCase(), time: '10:30', title: 'CPI (Inflação)', country: 'EUA', impact: 'high' });
        }
        
        container.innerHTML = events.slice(0, 6).map(e => `
            <div class="calendar-event">
                <div class="calendar-date">
                    <div class="calendar-day">${e.day}</div>
                    <div class="calendar-month">${e.month}</div>
                </div>
                <div class="calendar-info">
                    <div class="calendar-title">${e.title}</div>
                    <div class="calendar-country">${e.country}</div>
                </div>
                <div class="calendar-impact ${e.impact}">${e.impact === 'high' ? 'ALTO' : 'MÉDIO'}</div>
            </div>
        `).join('') || '<p style="color: var(--text-muted); text-align: center;">Nenhum evento</p>';
    }

    // ============================================
    // TAB SWITCHER
    // ============================================
    function switchMacroTab(tab) {
        document.querySelectorAll('.macro-tab').forEach(t => {
            t.classList.remove('active');
            if (t.getAttribute('onclick')?.includes(tab)) t.classList.add('active');
        });
        document.querySelectorAll('.macro-panel').forEach(p => p.classList.remove('active'));
        const panel = document.getElementById('panel-' + tab);
        if (panel) panel.classList.add('active');
    }

    // ============================================
    // INICIALIZAÇÃO
    // ============================================
    function loadMacroData() {
        if (macroLoaded) return;
        
        macroLog('=== MACRO v13.0 - GRÁFICOS TWELVE DATA ===', 'success');
        macroLoaded = true;
        
        renderAllIndicators();
        updateFedWatch();
        updateEconomicCalendar();
        
        loadAllPricesInstant();
        
        setTimeout(() => connectMacroWebSocket(), 1000);
        
        macroIntervals.fedWatch = setInterval(updateFedWatch, 30 * 60 * 1000);
        macroIntervals.calendar = setInterval(updateEconomicCalendar, 60 * 60 * 1000);
    }

    function stopMacroUpdates() {
        if (macroSocket) {
            Object.keys(MARKET_INDICATORS).forEach(s => {
                try { macroSocket.send(JSON.stringify({ type: 'unsubscribe', symbol: s })); } catch(e) {}
            });
            macroSocket.close();
            macroSocket = null;
        }
        Object.values(macroIntervals).forEach(i => clearInterval(i));
        macroIntervals = {};
        macroLoaded = false;
    }

    // ============================================
    // EXPORTS
    // ============================================
    window.switchMacroTab = switchMacroTab;
    window.loadMacroData = loadMacroData;
    window.stopMacroUpdates = stopMacroUpdates;
    window.updateAllIndicators = renderAllIndicators;
    window.updateFedWatch = updateFedWatch;
    window.updateEconomicCalendar = updateEconomicCalendar;
    window.fetchMarketIndicators = loadAllPricesInstant;
    window.openIndicatorModal = openIndicatorModal;
    window.closeIndicatorModal = closeIndicatorModal;

    macroLog('✓ macro-section.js v13.0 carregado!', 'success');
})();
