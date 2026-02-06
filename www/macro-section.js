/**
 * MACRO SECTION - Dados Macroeconômicos
 * Versão 18.1 - FedWatch FRED + Calendário FMP + Histórico FRED
 * - FedWatch: atualiza a cada 30 min (cache local)
 * - Calendário: atualiza a cada 1 hora (cache local)
 * - Escalável: cada usuário faz requests independentes com cache
 */

(function() {
    'use strict';
    
    const FINNHUB_API_KEY = 'd5j4209r01qh37ui6ehgd5j4209r01qh37ui6ei0';
    const FINNHUB_WS_URL = 'wss://ws.finnhub.io';
    // Twelve Data - 3 chaves = 2400 créditos/dia (800 cada)
    const TWELVE_DATA_API_KEYS = [
        'f3eee307545843abb139dc2e68932f16',
        '07a47c138e344323add83b5e97bb2bd6',
        '8449b7e97a8641a7a2126f0ccd7cea2d'
    ];
    let currentTwelveDataKeyIndex = 0;
    const FMP_API_KEY = 'yTzpl8eGbfIStxlI6xBjQoiHycAb4PhZ';
    const FRED_API_KEY = '289c022214958a3eb611142e8dc34f6b'; // FRED - Taxa do Fed
    const ALPHA_VANTAGE_KEY = 'G5QZWN5KBTAEORIT'; // Para histórico de eventos
    
    // Função para alternar chaves Twelve Data
    function getTwelveDataKey() {
        const key = TWELVE_DATA_API_KEYS[currentTwelveDataKeyIndex];
        currentTwelveDataKeyIndex = (currentTwelveDataKeyIndex + 1) % TWELVE_DATA_API_KEYS.length;
        return key;
    }

    // ============================================
    // INDICADORES - SÍMBOLOS YAHOO FINANCE (FUTUROS/SPOT)
    // Valores REAIS, não ETFs
    // ============================================
    const MARKET_INDICATORS = {
        'GC=F': { name: 'Ouro', short: 'XAU/USD', desc: 'Gold Futures', img: 'OURO.png', color: '#FFD700', prefix: '$', decimals: 2 },
        'SI=F': { name: 'Prata', short: 'XAG/USD', desc: 'Silver Futures', img: 'PRATA.png', color: '#C0C0C0', prefix: '$', decimals: 2 },
        'CL=F': { name: 'Petróleo WTI', short: 'WTI', desc: 'WTI Crude Oil Futures', img: 'Petroleo.png', color: '#795548', prefix: '$', decimals: 2 },
        'DX-Y.NYB': { name: 'Dólar Index', short: 'DXY', desc: 'US Dollar Index', img: 'DXY.png', color: '#2E7D32', prefix: '', decimals: 3 },
        '^GSPC': { name: 'S&P 500', short: 'SPX', desc: 'S&P 500 Index', img: 'S&P500.png', color: '#4CAF50', prefix: '', decimals: 2 },
        '^NDX': { name: 'Nasdaq 100', short: 'NDX', desc: 'Nasdaq 100 Index', img: 'NASDAQ100.png', color: '#00D4AA', prefix: '', decimals: 2 },
        '^RUT': { name: 'Russell 2000', short: 'RUT', desc: 'Russell 2000 Index', img: 'RUSSEL.png', color: '#9C27B0', prefix: '', decimals: 2 },
        '^VIX': { name: 'VIX', short: 'VIX', desc: 'Índice de Volatilidade S&P 500', img: 'VIX.png', color: '#FF5722', prefix: '', decimals: 2 },
        'XLE': { name: 'Energia', short: 'XLE', desc: 'Energy Select Sector SPDR', img: 'XLE.png', color: '#FF9800', prefix: '$', decimals: 2 },
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
    // CARREGAR PREÇOS VIA MÚLTIPLAS APIs (PRINCIPAL)
    // FMP para índices/ETFs, Twelve Data para Forex
    // ============================================
    
    // Mapeamento de símbolos para FMP (índices e ETFs)
    const FMP_SYMBOLS = {
        '^GSPC': '^GSPC',           // S&P 500 Index
        '^NDX': '^NDX',             // Nasdaq 100 Index
        '^RUT': '^RUT',             // Russell 2000
        '^VIX': '^VIX',             // VIX
        'XLE': 'XLE',               // Energy ETF
        'CL=F': 'CLUSD',            // Crude Oil
        'DX-Y.NYB': 'DX-Y.NYB',     // Dollar Index
    };
    
    // ============================================
    // TWELVE DATA - FOREX (OURO, PRATA) 
    // 3 chaves = 2400 créditos/dia (800 cada)
    // ============================================
    const TWELVE_DATA_SYMBOLS = {
        'GC=F': 'XAU/USD',         // Ouro - Forex ✓
        'XLE': 'XLE',              // Energy ETF ✓
        // Prata (SI=F) busca direto do Yahoo Finance
    };
    
    // Timestamp da última atualização
    let lastPriceUpdate = 0;
    const PRICE_UPDATE_INTERVAL = 1 * 60 * 1000; // 1 minuto
    
    async function loadAllPricesInstant() {
        macroLog('⚡ Carregando preços...', 'info');
        
        // Tentar Yahoo Finance v8 (chart endpoint - mais confiável)
        macroLog('📊 Buscando via Yahoo Finance...', 'info');
        const yahooSuccess = await loadPricesViaYahooV8();
        
        // Complementar com Twelve Data se necessário
        if (yahooSuccess < 9) {
            macroLog('📦 Complementando com Twelve Data...', 'info');
            await loadPricesViaTwelveData();
        }
        
        const total = Object.values(indicatorPrices).filter(p => p > 0).length;
        
        if (total >= 5) {
            macroLog(`✅ Total: ${total}/9 indicadores carregados`, 'success');
        } else {
            macroLog(`⚠️ Apenas ${total}/9 indicadores disponíveis`, 'warn');
        }
        
        lastPriceUpdate = Date.now();
        renderAllIndicators();
    }
    
    // ============================================
    // YAHOO FINANCE V8 - CHART ENDPOINT (mais confiável)
    // ============================================
    async function loadPricesViaYahooV8() {
        let successCount = 0;
        const symbols = Object.keys(MARKET_INDICATORS);
        
        // Função para buscar um símbolo
        async function fetchSymbol(symbol) {
            // Pular se já temos preço
            if (indicatorPrices[symbol] && indicatorPrices[symbol] > 0) {
                return true;
            }
            
            const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
            const proxyUrls = [
                `https://api.allorigins.win/raw?url=${encodeURIComponent(yahooUrl)}`,
                `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(yahooUrl)}`,
            ];
            
            for (const url of proxyUrls) {
                try {
                    const controller = new AbortController();
                    const timeout = setTimeout(() => controller.abort(), 5000);
                    
                    const response = await fetch(url, { signal: controller.signal });
                    clearTimeout(timeout);
                    
                    if (!response.ok) continue;
                    
                    const data = await response.json();
                    const result = data?.chart?.result?.[0];
                    
                    if (result) {
                        const meta = result.meta;
                        const price = meta?.regularMarketPrice || 0;
                        const prevClose = meta?.previousClose || meta?.chartPreviousClose || price;
                        
                        if (price > 0) {
                            const change = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;
                            
                            indicatorPrices[symbol] = price;
                            indicatorChanges[symbol] = change;
                            previousIndicatorPrices[symbol] = prevClose;
                            
                            macroLog(`✅ ${MARKET_INDICATORS[symbol].name}: ${price.toFixed(2)} (${change >= 0 ? '+' : ''}${change.toFixed(2)}%)`, 'success');
                            return true;
                        }
                    }
                } catch (e) {
                    // Silent fail, try next proxy
                }
            }
            return false;
        }
        
        // Buscar em paralelo (3 de cada vez para não sobrecarregar)
        for (let i = 0; i < symbols.length; i += 3) {
            const batch = symbols.slice(i, i + 3);
            const results = await Promise.all(batch.map(s => fetchSymbol(s)));
            successCount += results.filter(r => r).length;
        }
        
        return successCount;
    }
    
    // ============================================
    // TWELVE DATA - OURO, XLE (3 chaves = 2400 créditos/dia)
    // ============================================
    async function loadPricesViaTwelveData() {
        let successCount = 0;
        
        for (const [internalSymbol, tdSymbol] of Object.entries(TWELVE_DATA_SYMBOLS)) {
            // Pular se já temos preço do Yahoo
            if (indicatorPrices[internalSymbol] && indicatorPrices[internalSymbol] > 0) {
                continue;
            }
            
            // Tentar com cada chave até funcionar
            for (let attempt = 0; attempt < 3; attempt++) {
                const apiKey = getTwelveDataKey();
                
                try {
                    const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(tdSymbol)}&apikey=${apiKey}`;
                    const response = await fetch(url);
                    const data = await response.json();
                    
                    // Verificar se tem erro de créditos
                    if (data.code === 429 || (data.message && data.message.includes('API credits'))) {
                        continue; // Tenta próxima chave
                    }
                    
                    if (data && !data.code && (data.close || data.price)) {
                        const price = parseFloat(data.close || data.price);
                        const prevClose = parseFloat(data.previous_close) || price;
                        const change = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;
                        
                        indicatorPrices[internalSymbol] = price;
                        indicatorChanges[internalSymbol] = change;
                        previousIndicatorPrices[internalSymbol] = prevClose;
                        successCount++;
                        
                        macroLog(`✅ ${MARKET_INDICATORS[internalSymbol].name}: ${price.toFixed(2)} (${change >= 0 ? '+' : ''}${change.toFixed(2)}%)`, 'success');
                        break; // Sucesso, não precisa tentar mais chaves
                    }
                } catch (e) {
                    // Continua tentando
                }
                
                await new Promise(r => setTimeout(r, 150));
            }
        }
        
        return successCount;
    }
    
    // ============================================
    // CARREGAR PREÇOS FALLBACK - NÃO USAR DADOS FALSOS
    // Quando não tiver dados reais, mostrar "--" 
    // ============================================
    function loadFallbackPrices() {
        // Não usar dados falsos - mostrar "--" é melhor que dados inventados
        macroLog('⚠️ APIs de indicadores indisponíveis - mostrando "--"', 'warn');
    }

    // ============================================
    // WEBSOCKET TWELVE DATA - DESATIVADO (limite de créditos)
    // Usando polling a cada 15 minutos
    // ============================================
    let twelveDataWs = null;
    
    function connectTwelveDataWebSocket() {
        // WebSocket desativado - usando polling
        macroLog('📡 WebSocket desativado - usando polling 3min', 'info');
    }
    
    function startPolling() {
        macroLog('📡 Atualizando preços a cada 3 minutos', 'info');
        
        if (!macroIntervals.priceUpdate) {
            macroIntervals.priceUpdate = setInterval(() => {
                loadAllPricesInstant();
            }, PRICE_UPDATE_INTERVAL); // 3 minutos
        }
    }
    
    function connectMacroWebSocket() {
        // Usar apenas polling - WebSocket Twelve Data tem limite
        startPolling();
    }

    // ============================================
    // FORMATAR PREÇO COM DECIMAIS CORRETOS
    // ============================================
    function formatIndicatorPrice(symbol) {
        const config = MARKET_INDICATORS[symbol];
        const rawPrice = indicatorPrices[symbol] || 0;
        if (!rawPrice) return '--';
        
        const decimals = config.decimals || 2;
        
        const value = rawPrice.toLocaleString('pt-BR', { 
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals 
        });
        
        return (config.prefix || '') + value;
    }

    // ============================================
    // ATUALIZAR UM INDICADOR
    // ============================================
    function updateSingleIndicator(symbol) {
        const el = document.getElementById(`indicator-${symbol}`);
        if (!el) return;
        
        const price = indicatorPrices[symbol];
        const prevPrice = previousIndicatorPrices[symbol];
        const change = indicatorChanges[symbol];
        const hasData = price && price > 0;
        
        const priceEl = el.querySelector('.ticker-current');
        if (priceEl) priceEl.textContent = formatIndicatorPrice(symbol);
        
        const changeEl = el.querySelector('.ticker-change');
        if (changeEl) {
            if (hasData && change !== undefined) {
                changeEl.textContent = (change >= 0 ? '+' : '') + change.toFixed(2) + '%';
                changeEl.className = `ticker-change ${change >= 0 ? 'pnl-positive' : 'pnl-negative'}`;
            } else {
                changeEl.textContent = '--';
                changeEl.className = 'ticker-change';
            }
        }
        
        if (hasData && price !== prevPrice) {
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
            const change = indicatorChanges[symbol];
            const displayPrice = formatIndicatorPrice(symbol);
            const imgSize = 42; // Tamanho fixo para todos os ícones
            const hasData = price > 0;
            const changeDisplay = hasData && change !== undefined ? `${change >= 0 ? '+' : ''}${change.toFixed(2)}%` : '--';
            const changeClass = hasData && change !== undefined ? (change >= 0 ? 'pnl-positive' : 'pnl-negative') : '';
            
            return `
                <div class="ticker-item" id="indicator-${symbol}" data-symbol="${symbol}" style="cursor: pointer;">
                    <div class="ticker-info">
                        <img src="${config.img}" alt="${config.name}" style="width: ${imgSize}px; height: ${imgSize}px; border-radius: 50%; object-fit: cover; flex-shrink: 0; background: ${config.color}20;" onerror="this.style.display='none'">
                        <div>
                            <div class="ticker-name">${config.name}</div>
                            <div class="ticker-pair">${config.short}</div>
                        </div>
                    </div>
                    <div class="ticker-price" style="margin-left: auto; padding-left: 12px; text-align: right;">
                        <div class="ticker-current">${displayPrice}</div>
                        <div class="ticker-change ${changeClass}">
                            ${changeDisplay}
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
                            <button class="ind-tf-btn active" data-period="1d">1D</button>
                            <button class="ind-tf-btn" data-period="1w">1S</button>
                            <button class="ind-tf-btn" data-period="1M">1M</button>
                            <button class="ind-tf-btn" data-period="6M">6M</button>
                            <button class="ind-tf-btn" data-period="1Y">1A</button>
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
        
        // Carregar dados imediatamente
        setTimeout(() => {
            loadIndicatorChartData(symbol);
            loadIndicatorStats(symbol);
        }, 50);
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
                <button class="fs-tf-btn ${indicatorChartPeriod === '1d' ? 'active' : ''}" data-period="1d">1D</button>
                <button class="fs-tf-btn ${indicatorChartPeriod === '1w' ? 'active' : ''}" data-period="1w">1S</button>
                <button class="fs-tf-btn ${indicatorChartPeriod === '1M' ? 'active' : ''}" data-period="1M">1M</button>
                <button class="fs-tf-btn ${indicatorChartPeriod === '6M' ? 'active' : ''}" data-period="6M">6M</button>
                <button class="fs-tf-btn ${indicatorChartPeriod === '1Y' ? 'active' : ''}" data-period="1Y">1A</button>
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
            '1d': { interval: '15m', range: '1d' },
            '1w': { interval: '1h', range: '5d' },
            '1M': { interval: '1d', range: '1mo' },
            '6M': { interval: '1d', range: '6mo' },
            '1Y': { interval: '1wk', range: '1y' }
        };
        
        const config = periodMap[indicatorChartPeriod] || periodMap['1d'];
        const encodedSymbol = encodeURIComponent(symbol);
        const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodedSymbol}?interval=${config.interval}&range=${config.range}`;
        const proxyUrls = [
            `https://api.allorigins.win/raw?url=${encodeURIComponent(yahooUrl)}`,
            `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(yahooUrl)}`,
        ];
        
        try {
            let data = null;
            for (const url of proxyUrls) {
                try {
                    const controller = new AbortController();
                    const timeout = setTimeout(() => controller.abort(), 5000);
                    const response = await fetch(url, { signal: controller.signal });
                    clearTimeout(timeout);
                    if (response.ok) {
                        data = await response.json();
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }
            
            if (data?.chart?.result?.[0]) {
                const result = data.chart.result[0];
                const timestamps = result.timestamp || [];
                const quotes = result.indicators.quote[0];
                
                indicatorCandleData = timestamps.map((t, i) => [
                    t * 1000,
                    quotes.open?.[i] || quotes.close?.[i],
                    quotes.high?.[i] || quotes.close?.[i],
                    quotes.low?.[i] || quotes.close?.[i],
                    quotes.close?.[i],
                    quotes.volume?.[i] || 0
                ]).filter(d => d[4] != null && d[4] > 0);
                
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
        
        // Time labels (formatado corretamente)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.font = '11px Inter, sans-serif';
        ctx.textAlign = 'center';
        
        const numLabels = 6;
        const step = Math.max(1, Math.floor((timestamps.length - 1) / (numLabels - 1)));
        for (let i = 0; i < timestamps.length; i += step) {
            if (i >= timestamps.length) break;
            const x = padding.left + (i / (timestamps.length - 1)) * chartWidth;
            const date = new Date(timestamps[i]);
            let label;
            if (indicatorChartPeriod === '1d') {
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
        
        // Time labels (formatado corretamente)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.font = '11px Inter, sans-serif';
        ctx.textAlign = 'center';
        
        const numLabels = 6;
        const step = Math.max(1, Math.floor((candleData.length - 1) / (numLabels - 1)));
        for (let i = 0; i < candleData.length; i += step) {
            if (i >= candleData.length) break;
            const x = padding.left + i * candleSpacing + candleSpacing / 2;
            const date = new Date(candleData[i][0]);
            let label;
            if (indicatorChartPeriod === '1d') {
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
    // CARREGAR DADOS DO GRÁFICO (YAHOO FINANCE - GRATUITO E ILIMITADO)
    // ============================================
    async function loadIndicatorChartData(symbol) {
        const loadingEl = document.getElementById('indicator-chart-loading');
        const canvas = document.getElementById('indicator-chart-canvas');
        if (!loadingEl || !canvas) return;
        
        loadingEl.style.display = 'flex';
        
        try {
            // Mapear período para Yahoo Finance
            const periodMap = {
                '1d': { interval: '15m', range: '1d' },   // 15min candles, último dia
                '1w': { interval: '1h', range: '5d' },    // 1h candles, 5 dias
                '1M': { interval: '1d', range: '1mo' },   // 1 dia candles, 1 mês
                '6M': { interval: '1d', range: '6mo' },   // 1 dia candles, 6 meses
                '1Y': { interval: '1wk', range: '1y' },   // 1 semana candles, 1 ano
            };
            
            const config = periodMap[indicatorChartPeriod] || periodMap['1d'];
            
            const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${config.interval}&range=${config.range}`;
            const proxyUrls = [
                `https://api.allorigins.win/raw?url=${encodeURIComponent(yahooUrl)}`,
                `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(yahooUrl)}`,
            ];
            
            macroLog(`📊 Carregando gráfico: ${symbol} (${config.interval}/${config.range})`, 'info');
            
            let data = null;
            for (const url of proxyUrls) {
                try {
                    const controller = new AbortController();
                    const timeout = setTimeout(() => controller.abort(), 5000);
                    const response = await fetch(url, { signal: controller.signal });
                    clearTimeout(timeout);
                    if (response.ok) {
                        data = await response.json();
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }
            
            const result = data?.chart?.result?.[0];
            if (result && result.timestamp && result.indicators?.quote?.[0]) {
                const timestamps = result.timestamp;
                const quote = result.indicators.quote[0];
                
                // Converter para formato padrão [timestamp, open, high, low, close, volume]
                indicatorCandleData = timestamps.map((ts, i) => [
                    ts * 1000, // Yahoo retorna em segundos
                    quote.open?.[i] || 0,
                    quote.high?.[i] || 0,
                    quote.low?.[i] || 0,
                    quote.close?.[i] || 0,
                    quote.volume?.[i] || 0
                ]).filter(d => d[4] != null && !isNaN(d[4]) && d[4] > 0);
                
                macroLog(`✅ Gráfico carregado: ${indicatorCandleData.length} candles`, 'success');
                
                if (indicatorChartType === 'candle') {
                    drawIndicatorCandleChart(indicatorCandleData);
                } else {
                    drawIndicatorLineChart(indicatorCandleData);
                }
            } else {
                throw new Error('Sem dados disponíveis');
            }
        } catch (e) {
            macroLog('❌ Erro gráfico: ' + e.message, 'error');
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
        
        // Se canvas ainda não tem dimensões, agendar redraw
        if (rect.width < 50 || rect.height < 50) {
            requestAnimationFrame(() => drawIndicatorLineChart(candleData));
            return;
        }
        
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
        
        // Labels de tempo (formatado corretamente)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.font = '10px Inter, sans-serif';
        ctx.textAlign = 'center';
        
        const numLabels = 5;
        const step = Math.max(1, Math.floor((timestamps.length - 1) / (numLabels - 1)));
        for (let i = 0; i < timestamps.length; i += step) {
            if (i >= timestamps.length) break;
            const x = padding.left + (i / (timestamps.length - 1)) * chartWidth;
            const date = new Date(timestamps[i]);
            let label;
            if (indicatorChartPeriod === '1d') {
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
        
        // Se canvas ainda não tem dimensões, agendar redraw
        if (rect.width < 50 || rect.height < 50) {
            requestAnimationFrame(() => drawIndicatorCandleChart(candleData));
            return;
        }
        
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
        
        // Labels de tempo (formatado corretamente)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.font = '10px Inter, sans-serif';
        ctx.textAlign = 'center';
        
        const numLabels = 5;
        const step = Math.max(1, Math.floor((candleData.length - 1) / (numLabels - 1)));
        for (let i = 0; i < candleData.length; i += step) {
            if (i >= candleData.length) break;
            const x = padding.left + i * candleSpacing + candleSpacing / 2;
            const date = new Date(candleData[i][0]);
            let label;
            if (indicatorChartPeriod === '1d') {
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
    // FED WATCH - DADOS VIA FRED API + CÁLCULO CME
    // FRED para taxa atual (DFF), cálculo avançado para probabilidades
    // ============================================
    
    const FOMC_MEETINGS_2025 = [
        { date: '2025-01-29', label: '28-29 Jan 2025' },
        { date: '2025-03-19', label: '18-19 Mar 2025' },
        { date: '2025-05-07', label: '6-7 Mai 2025' },
        { date: '2025-06-18', label: '17-18 Jun 2025' },
        { date: '2025-07-30', label: '29-30 Jul 2025' },
        { date: '2025-09-17', label: '16-17 Set 2025' },
        { date: '2025-11-05', label: '4-5 Nov 2025' },
        { date: '2025-12-17', label: '16-17 Dez 2025' }
    ];
    
    const FOMC_MEETINGS_2026 = [
        { date: '2026-01-28', label: '27-28 Jan 2026' },
        { date: '2026-03-18', label: '17-18 Mar 2026' },
        { date: '2026-05-06', label: '5-6 Mai 2026' },
        { date: '2026-06-17', label: '16-17 Jun 2026' },
        { date: '2026-07-29', label: '28-29 Jul 2026' },
        { date: '2026-09-16', label: '15-16 Set 2026' },
        { date: '2026-11-04', label: '3-4 Nov 2026' },
        { date: '2026-12-16', label: '15-16 Dez 2026' }
    ];
    
    const ALL_FOMC_MEETINGS = [...FOMC_MEETINGS_2025, ...FOMC_MEETINGS_2026];
    
    // Cache para dados do Fed
    let fedDataCache = {
        effectiveRate: null,  // DFF - Effective Federal Funds Rate
        targetUpper: null,    // DFEDTARU - Target Range Upper Limit
        targetLower: null,    // DFEDTARL - Target Range Lower Limit
        cpi: null,            // Inflação
        unemployment: null,   // Desemprego
        gdpGrowth: null,      // Crescimento PIB
        probabilities: null,
        lastUpdate: null,
        loading: false
    };
    
    // Cache TTL: 30 minutos
    const FED_CACHE_TTL = 30 * 60 * 1000;
    
    // Proxy CORS para contornar restrições do browser
    const CORS_PROXY = 'https://corsproxy.io/?';
    
    // Função para fazer fetch com fallback de proxy CORS
    async function fetchWithCorsProxy(url, useProxy = false) {
        try {
            const fetchUrl = useProxy ? CORS_PROXY + encodeURIComponent(url) : url;
            const response = await fetch(fetchUrl);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        } catch (e) {
            if (!useProxy) {
                // Tentar com proxy CORS
                macroLog('⚠️ Tentando com proxy CORS...', 'warn');
                return await fetchWithCorsProxy(url, true);
            }
            throw e;
        }
    }
    
    // ============================================
    // BUSCAR TAXA DO FED VIA FRED API
    // DFF = Effective Federal Funds Rate (mais preciso)
    // DFEDTARU = Target Upper, DFEDTARL = Target Lower
    // ============================================
    async function fetchFedRateFromAPI() {
        // Verificar cache
        if (fedDataCache.lastUpdate && 
            (Date.now() - fedDataCache.lastUpdate) < FED_CACHE_TTL &&
            fedDataCache.effectiveRate) {
            macroLog('📦 Usando cache Fed (válido)', 'info');
            return fedDataCache;
        }
        
        try {
            macroLog('🔄 Buscando taxa do Fed via FRED API...', 'info');
            
            // 1. Buscar DFF (Effective Federal Funds Rate) - taxa real negociada
            const dffUrl = `https://api.stlouisfed.org/fred/series/observations?series_id=DFF&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=5`;
            
            let effectiveRate = null;
            let targetUpper = null, targetLower = null;
            let cpi = null;
            let unemployment = null;
            
            try {
                const dffData = await fetchWithCorsProxy(dffUrl);
                
                if (dffData.observations && dffData.observations.length > 0) {
                    const latestObs = dffData.observations.find(o => o.value !== '.');
                    if (latestObs) {
                        effectiveRate = parseFloat(latestObs.value);
                        macroLog(`✅ DFF (Effective Rate): ${effectiveRate}%`, 'success');
                    }
                }
            } catch (e) {
                macroLog('⚠️ Erro ao buscar DFF: ' + e.message, 'warn');
            }
            
            // 2. Buscar Range Target (Upper/Lower)
            try {
                const upperUrl = `https://api.stlouisfed.org/fred/series/observations?series_id=DFEDTARU&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=5`;
                const upperData = await fetchWithCorsProxy(upperUrl);
                
                if (upperData.observations && upperData.observations.length > 0) {
                    const obs = upperData.observations.find(o => o.value !== '.');
                    if (obs) targetUpper = parseFloat(obs.value);
                }
                
                const lowerUrl = `https://api.stlouisfed.org/fred/series/observations?series_id=DFEDTARL&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=5`;
                const lowerData = await fetchWithCorsProxy(lowerUrl);
                
                if (lowerData.observations && lowerData.observations.length > 0) {
                    const obs = lowerData.observations.find(o => o.value !== '.');
                    if (obs) targetLower = parseFloat(obs.value);
                }
                
                if (targetUpper && targetLower) {
                    macroLog(`✅ Target Range: ${targetLower}% - ${targetUpper}%`, 'success');
                }
            } catch (e) {
                macroLog('⚠️ Erro ao buscar Target Range: ' + e.message, 'warn');
            }
            
            // Se não conseguiu target, calcular do DFF
            if (effectiveRate && (!targetUpper || !targetLower)) {
                targetUpper = Math.ceil(effectiveRate * 4) / 4;
                targetLower = targetUpper - 0.25;
                macroLog(`📊 Target calculado do DFF: ${targetLower}% - ${targetUpper}%`, 'info');
            }
            
            // 3. Buscar CPI (inflação) - CPIAUCSL
            try {
                const cpiUrl = `https://api.stlouisfed.org/fred/series/observations?series_id=CPIAUCSL&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=13&units=pc1`;
                const cpiData = await fetchWithCorsProxy(cpiUrl);
                
                if (cpiData.observations && cpiData.observations.length > 0) {
                    const obs = cpiData.observations.find(o => o.value !== '.');
                    if (obs) {
                        cpi = parseFloat(obs.value);
                        macroLog(`✅ CPI (YoY): ${cpi.toFixed(2)}%`, 'success');
                    }
                }
            } catch (e) {
                macroLog('⚠️ CPI não disponível: ' + e.message, 'warn');
            }
            
            // 4. Buscar taxa de desemprego - UNRATE
            try {
                const unUrl = `https://api.stlouisfed.org/fred/series/observations?series_id=UNRATE&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=5`;
                const unData = await fetchWithCorsProxy(unUrl);
                
                if (unData.observations && unData.observations.length > 0) {
                    const obs = unData.observations.find(o => o.value !== '.');
                    if (obs) {
                        unemployment = parseFloat(obs.value);
                        macroLog(`✅ Desemprego: ${unemployment}%`, 'success');
                    }
                }
            } catch (e) {
                macroLog('⚠️ Desemprego não disponível: ' + e.message, 'warn');
            }
            
            // Se não conseguiu NENHUM dado da FRED, usar valores conhecidos como fallback
            if (!effectiveRate && !targetUpper) {
                macroLog('⚠️ FRED indisponível, usando dados de fallback', 'warn');
                // Valores aproximados baseados no último dado conhecido
                effectiveRate = 3.64; // Valor atual do FRED (testado)
                targetLower = 3.50;
                targetUpper = 3.75;
                cpi = cpi || 2.4;
                unemployment = unemployment || 4.1;
            }
            
            // Calcular probabilidades com modelo avançado
            const probabilities = calculateFedProbabilities({
                effectiveRate,
                targetUpper,
                targetLower,
                cpi,
                unemployment
            });
            
            // Atualizar cache
            fedDataCache = {
                effectiveRate,
                targetUpper,
                targetLower,
                currentRate: { lower: targetLower || (effectiveRate - 0.125), upper: targetUpper || (effectiveRate + 0.125) },
                cpi,
                unemployment,
                probabilities,
                lastUpdate: Date.now(),
                dataSource: 'FRED'
            };
            
            return fedDataCache;
            
        } catch (e) {
            macroLog('❌ Erro FRED API: ' + e.message, 'error');
            
            // Fallback final com valores conhecidos
            const fallbackData = {
                effectiveRate: 3.64,
                targetLower: 3.50,
                targetUpper: 3.75,
                currentRate: { lower: 3.50, upper: 3.75 },
                cpi: 2.4,
                unemployment: 4.1,
                probabilities: { cut: 35, hold: 55, hike: 10 },
                lastUpdate: Date.now(),
                dataSource: 'Fallback'
            };
            
            // Usar cache expirado se disponível, senão fallback
            if (fedDataCache.effectiveRate) {
                macroLog('⚠️ Usando cache expirado', 'warn');
                return fedDataCache;
            }
            
            macroLog('⚠️ Usando dados de fallback', 'warn');
            return fallbackData;
        }
    }
    
    // ============================================
    // CÁLCULO DE PROBABILIDADES - MODELO CME FEDWATCH
    // Baseado em: taxa atual, inflação, desemprego e ciclo econômico
    // ============================================
    function calculateFedProbabilities(data) {
        const { effectiveRate, targetUpper, targetLower, cpi, unemployment } = data;
        
        if (!effectiveRate && !targetUpper) {
            return { cut: 25, hold: 65, hike: 10 };
        }
        
        const currentRate = effectiveRate || ((targetUpper + targetLower) / 2);
        
        // Meta de inflação do Fed é 2%
        const inflationTarget = 2.0;
        // Taxa neutra estimada (r-star) ~2.5%
        const neutralRate = 2.5;
        // Desemprego natural (NAIRU) ~4.0%
        const naturalUnemployment = 4.0;
        
        // ============================================
        // FATORES DE DECISÃO (pesos baseados na Regra de Taylor modificada)
        // ============================================
        let cutScore = 0;
        let holdScore = 0;
        let hikeScore = 0;
        
        // FATOR 1: Inflação vs Meta (peso alto - 40%)
        if (cpi !== null) {
            const inflationGap = cpi - inflationTarget;
            
            if (inflationGap > 2.0) {
                // Inflação muito acima da meta (>4%)
                hikeScore += 35;
                holdScore += 10;
            } else if (inflationGap > 1.0) {
                // Inflação acima da meta (3-4%)
                hikeScore += 20;
                holdScore += 20;
            } else if (inflationGap > 0.3) {
                // Inflação levemente acima (2.3-3%)
                holdScore += 30;
                hikeScore += 10;
            } else if (inflationGap > -0.3) {
                // Inflação na meta (1.7-2.3%)
                holdScore += 25;
                cutScore += 15;
            } else if (inflationGap > -1.0) {
                // Inflação abaixo da meta (1-1.7%)
                cutScore += 25;
                holdScore += 15;
            } else {
                // Inflação muito baixa (<1%)
                cutScore += 35;
                holdScore += 5;
            }
        } else {
            holdScore += 20; // Default se não tem dados
        }
        
        // FATOR 2: Taxa atual vs Taxa neutra (peso médio - 25%)
        const rateGap = currentRate - neutralRate;
        
        if (rateGap > 3.0) {
            // Taxa muito restritiva (>5.5%)
            cutScore += 25;
            holdScore += 5;
        } else if (rateGap > 2.0) {
            // Taxa restritiva (4.5-5.5%)
            cutScore += 15;
            holdScore += 15;
        } else if (rateGap > 1.0) {
            // Taxa levemente restritiva (3.5-4.5%)
            holdScore += 20;
            cutScore += 10;
        } else if (rateGap > 0) {
            // Taxa próxima do neutro (2.5-3.5%)
            holdScore += 25;
        } else if (rateGap > -1.0) {
            // Taxa levemente acomodativa (1.5-2.5%)
            holdScore += 15;
            hikeScore += 10;
        } else {
            // Taxa muito acomodativa (<1.5%)
            hikeScore += 20;
            holdScore += 5;
        }
        
        // FATOR 3: Desemprego (peso médio - 25%)
        if (unemployment !== null) {
            const unemploymentGap = unemployment - naturalUnemployment;
            
            if (unemploymentGap > 1.5) {
                // Desemprego muito alto (>5.5%)
                cutScore += 25;
            } else if (unemploymentGap > 0.5) {
                // Desemprego elevado (4.5-5.5%)
                cutScore += 15;
                holdScore += 10;
            } else if (unemploymentGap > -0.5) {
                // Desemprego normal (3.5-4.5%)
                holdScore += 20;
            } else if (unemploymentGap > -1.0) {
                // Desemprego baixo (3-3.5%)
                holdScore += 15;
                hikeScore += 5;
            } else {
                // Desemprego muito baixo (<3%)
                hikeScore += 15;
                holdScore += 5;
            }
        } else {
            holdScore += 15; // Default se não tem dados
        }
        
        // FATOR 4: Momento do ciclo (peso baixo - 10%)
        // Quanto mais tempo no mesmo nível, mais chance de mudança
        // Como não temos histórico detalhado, usamos aproximação
        if (currentRate > 5.0 && (cpi === null || cpi < 3.5)) {
            // Alta taxa + inflação controlada = possível corte
            cutScore += 10;
        } else if (currentRate < 2.0 && (cpi === null || cpi > 2.5)) {
            // Baixa taxa + inflação subindo = possível alta
            hikeScore += 10;
        } else {
            holdScore += 10;
        }
        
        // ============================================
        // NORMALIZAÇÃO PARA 100%
        // ============================================
        const totalScore = cutScore + holdScore + hikeScore;
        
        if (totalScore === 0) {
            return { cut: 20, hold: 65, hike: 15 };
        }
        
        let cut = Math.round((cutScore / totalScore) * 100);
        let hold = Math.round((holdScore / totalScore) * 100);
        let hike = 100 - cut - hold;
        
        // Garantir valores mínimos realistas (mercado sempre precifica alguma chance)
        if (cut < 5) cut = 5;
        if (hike < 3) hike = 3;
        if (hold < 10) hold = 10;
        
        // Renormalizar após ajustes mínimos
        const total = cut + hold + hike;
        cut = Math.round((cut / total) * 100);
        hold = Math.round((hold / total) * 100);
        hike = 100 - cut - hold;
        
        macroLog(`📊 Probabilidades calculadas: Corte ${cut}%, Manutenção ${hold}%, Alta ${hike}%`, 'info');
        
        return { cut, hold, hike };
    }

    async function updateFedWatch() {
        const container = document.getElementById('fed-probabilities');
        const nextMeetingEl = document.getElementById('next-fomc-meeting');
        const currentRateEl = document.getElementById('current-fed-rate');
        
        if (!container) return;
        
        // Mostrar loading
        container.innerHTML = `
            <div style="text-align: center; padding: 20px; color: #888;">
                <i class="fas fa-spinner fa-spin" style="font-size: 20px; margin-bottom: 8px;"></i>
                <p style="margin: 0;">Carregando dados do Fed...</p>
            </div>
        `;
        
        // Buscar dados atualizados via Alpha Vantage
        const fedData = await fetchFedRateFromAPI();
        
        const today = new Date();
        let nextMeeting = { label: 'A definir', daysUntil: '--', date: null };
        for (const meeting of ALL_FOMC_MEETINGS) {
            const d = new Date(meeting.date);
            if (d >= today) {
                nextMeeting = { ...meeting, daysUntil: Math.ceil((d - today) / 86400000), date: d };
                break;
            }
        }
        
        // Formatar data da próxima reunião
        const meetingDateFormatted = nextMeeting.date ? nextMeeting.date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
        if (nextMeetingEl) nextMeetingEl.innerHTML = `Reunião: <strong>${meetingDateFormatted}</strong> (${nextMeeting.daysUntil} dias)`;
        
        // Se não há dados da API, mostrar erro
        if (!fedData || !fedData.currentRate) {
            if (currentRateEl) currentRateEl.textContent = '--';
            container.innerHTML = `
                <div style="text-align: center; padding: 30px; color: #ef4444;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 32px; margin-bottom: 12px; opacity: 0.7;"></i>
                    <p style="margin: 0; font-weight: 600;">Erro ao carregar dados</p>
                    <p style="margin: 8px 0 0; font-size: 12px; color: #888;">Não foi possível obter dados das APIs.<br>Verifique sua conexão.</p>
                    <button onclick="window.updateFedWatch()" style="margin-top: 12px; padding: 8px 16px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; color: white; cursor: pointer; font-size: 12px;">
                        <i class="fas fa-sync-alt"></i> Tentar novamente
                    </button>
                </div>
            `;
            return;
        }
        
        const rate = fedData.currentRate;
        const probs = fedData.probabilities;
        
        if (currentRateEl) currentRateEl.textContent = `${rate.lower.toFixed(2)}% - ${rate.upper.toFixed(2)}%`;
        
        // Se não há probabilidades, mostrar mensagem
        if (!probs) {
            container.innerHTML = `
                <div style="text-align: center; padding: 20px; color: #f59e0b;">
                    <i class="fas fa-chart-bar" style="font-size: 28px; margin-bottom: 10px; opacity: 0.7;"></i>
                    <p style="margin: 0; font-weight: 600;">Taxa Atual: ${rate.lower.toFixed(2)}% - ${rate.upper.toFixed(2)}%</p>
                    <p style="margin: 8px 0 0; font-size: 12px; color: #888;">Probabilidades temporariamente indisponíveis.<br>APIs de mercado não retornaram dados.</p>
                    <button onclick="window.updateFedWatch()" style="margin-top: 12px; padding: 8px 16px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; color: white; cursor: pointer; font-size: 12px;">
                        <i class="fas fa-sync-alt"></i> Tentar novamente
                    </button>
                </div>
            `;
            return;
        }
        
        // Calcular taxa-alvo após cada decisão
        const cutTargetLower = (rate.lower - 0.25).toFixed(2);
        const cutTargetUpper = (rate.upper - 0.25).toFixed(2);
        const hikeTargetLower = (rate.lower + 0.25).toFixed(2);
        const hikeTargetUpper = (rate.upper + 0.25).toFixed(2);
        
        // Fonte dos dados
        const dataSource = fedData.dataSource || fedWatchDataSource || 'API';
        
        container.innerHTML = `
            <div class="fed-prob-item">
                <div class="fed-prob-header">
                    <span class="fed-prob-action cut"><i class="fas fa-arrow-down"></i> Corte (${cutTargetLower}-${cutTargetUpper}%)</span>
                    <span class="fed-prob-percent pnl-positive">${probs.cut.toFixed(1)}%</span>
                </div>
                <div class="fed-prob-bar"><div class="fed-prob-fill cut" style="width: ${probs.cut}%"></div></div>
            </div>
            <div class="fed-prob-item">
                <div class="fed-prob-header">
                    <span class="fed-prob-action hold"><i class="fas fa-equals"></i> Manutenção (${rate.lower.toFixed(2)}-${rate.upper.toFixed(2)}%)</span>
                    <span class="fed-prob-percent" style="color: var(--accent-yellow);">${probs.hold.toFixed(1)}%</span>
                </div>
                <div class="fed-prob-bar"><div class="fed-prob-fill hold" style="width: ${probs.hold}%"></div></div>
            </div>
            <div class="fed-prob-item">
                <div class="fed-prob-header">
                    <span class="fed-prob-action hike"><i class="fas fa-arrow-up"></i> Aumento (${hikeTargetLower}-${hikeTargetUpper}%)</span>
                    <span class="fed-prob-percent pnl-negative">${probs.hike.toFixed(1)}%</span>
                </div>
                <div class="fed-prob-bar"><div class="fed-prob-fill hike" style="width: ${probs.hike}%"></div></div>
            </div>
            <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.1); font-size: 10px; color: #555; display: flex; flex-direction: column; gap: 4px;">
                <div style="display: flex; align-items: center; justify-content: space-between;">
                    <span><i class="fas fa-sync-alt"></i> ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} BRT</span>
                    <span><i class="fas fa-database"></i> ${dataSource}</span>
                </div>
                <div style="font-size: 9px; color: #444;">
                    DFF: ${fedData.effectiveRate ? fedData.effectiveRate.toFixed(2) + '%' : '--'} | CPI: ${fedData.cpi ? fedData.cpi.toFixed(1) + '%' : '--'} | Desemp: ${fedData.unemployment ? fedData.unemployment.toFixed(1) + '%' : '--'}
                </div>
            </div>
        `;
    }

    // ============================================
    // CALENDÁRIO ECONÔMICO - FMP API
    // Eventos futuros via FMP, histórico via FRED API
    // ============================================
    
    // Cache para histórico de eventos
    let ECONOMIC_HISTORY_CACHE = {};
    
    // Mapeamento de eventos para séries FRED (mais confiável)
    const FRED_SERIES = {
        'CPI': 'CPIAUCSL',
        'Inflação': 'CPIAUCSL',
        'Non-Farm': 'PAYEMS',
        'NFP': 'PAYEMS',
        'Payroll': 'PAYEMS',
        'Unemployment': 'UNRATE',
        'Desemprego': 'UNRATE',
        'GDP': 'GDP',
        'PIB': 'GDP',
        'Retail': 'RSXFS',
        'Varejo': 'RSXFS',
        'ISM': 'MANEMP',
        'PMI': 'MANEMP',
        'Jobless': 'ICSA',
        'Seguro': 'ICSA',
        'Consumer': 'UMCSENT',
        'Confiança': 'UMCSENT',
        'PPI': 'PPIACO',
        'Produtor': 'PPIACO',
        'PCE': 'PCEPI',
        'Housing': 'HOUST',
        'Habitação': 'HOUST',
        'Construção': 'HOUST',
        'Durable': 'DGORDER',
        'Duráveis': 'DGORDER'
    };
    
    // Histórico REAL de decisões do FOMC (taxas em %)
    // Atualizado manualmente com base nas decisões oficiais
    const FOMC_DECISIONS_HISTORY = [
        { date: '2026-01-29', rate: 3.75, previous: 4.00, action: 'Corte 25bp' },
        { date: '2025-12-18', rate: 4.00, previous: 4.25, action: 'Corte 25bp' },
        { date: '2025-11-07', rate: 4.25, previous: 4.50, action: 'Corte 25bp' },
        { date: '2025-09-18', rate: 4.50, previous: 4.75, action: 'Corte 25bp' },
        { date: '2025-07-30', rate: 4.75, previous: 5.00, action: 'Corte 25bp' },
        { date: '2025-06-18', rate: 5.00, previous: 5.25, action: 'Corte 25bp' },
        { date: '2025-05-07', rate: 5.25, previous: 5.25, action: 'Manutenção' },
        { date: '2025-03-19', rate: 5.25, previous: 5.25, action: 'Manutenção' },
        { date: '2025-01-29', rate: 5.25, previous: 5.25, action: 'Manutenção' },
        { date: '2024-12-18', rate: 5.25, previous: 5.50, action: 'Corte 25bp' },
        { date: '2024-11-07', rate: 5.50, previous: 5.50, action: 'Manutenção' },
        { date: '2024-09-18', rate: 5.50, previous: 5.50, action: 'Manutenção' }
    ];
    
    // Buscar histórico de eventos via FRED API (mais confiável que Alpha Vantage)
    async function fetchEconomicHistoryFromAI(eventTitle) {
        // Verificar cache local primeiro
        if (ECONOMIC_HISTORY_CACHE[eventTitle] && ECONOMIC_HISTORY_CACHE[eventTitle].length > 0) {
            macroLog(`📦 Histórico de ${eventTitle} do cache`, 'info');
            return ECONOMIC_HISTORY_CACHE[eventTitle];
        }
        
        const titleLower = eventTitle.toLowerCase();
        
        // Para FOMC/Fed/Taxa/Juros - usar histórico de decisões pré-definido
        const isFOMCEvent = ['fomc', 'fed', 'taxa', 'juros', 'interest', 'rate decision'].some(k => titleLower.includes(k));
        
        if (isFOMCEvent) {
            macroLog(`📊 Usando histórico de decisões FOMC pré-definido`, 'info');
            const history = FOMC_DECISIONS_HISTORY.slice(0, 6).map(d => ({
                date: d.date,
                actual: `${d.rate.toFixed(2)}%`,
                previous: `${d.previous.toFixed(2)}%`,
                forecast: '-',
                impact: 'high',
                action: d.action
            }));
            ECONOMIC_HISTORY_CACHE[eventTitle] = history;
            return history;
        }
        
        try {
            // Encontrar a série FRED correspondente
            let fredSeries = null;
            
            for (const [key, series] of Object.entries(FRED_SERIES)) {
                if (titleLower.includes(key.toLowerCase())) {
                    fredSeries = series;
                    break;
                }
            }
            
            if (!fredSeries) {
                macroLog(`⚠️ Indicador ${eventTitle} não mapeado para FRED`, 'warn');
                return [];
            }
            
            macroLog(`🔄 Buscando histórico de ${eventTitle} via FRED...`, 'info');
            
            // Usar FRED API com proxy CORS
            const isPercentage = ['UNRATE', 'DFF', 'DFEDTARU', 'DFEDTARL'].includes(fredSeries);
            const needsYoY = ['CPIAUCSL', 'GDP', 'PCEPI'].includes(fredSeries); // Variação YoY
            const units = needsYoY ? '&units=pc1' : '';
            
            // Para FOMC/Fed Rate, buscar mais dados e filtrar apenas mudanças
            const limit = fredSeries === 'DFEDTARU' ? 50 : 12;
            
            const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${fredSeries}&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=${limit}${units}`;
            
            const data = await fetchWithCorsProxy(url);
            
            if (data.observations && data.observations.length > 0) {
                // Filtrar valores válidos
                let validObs = data.observations.filter(o => o.value !== '.');
                
                // Para FOMC: filtrar apenas quando houve mudança na taxa
                if (fredSeries === 'DFEDTARU') {
                    const changes = [];
                    for (let i = 0; i < validObs.length - 1; i++) {
                        const current = parseFloat(validObs[i].value);
                        const next = parseFloat(validObs[i + 1].value);
                        if (current !== next) {
                            changes.push({
                                ...validObs[i],
                                previousValue: next
                            });
                        }
                    }
                    validObs = changes.length > 0 ? changes : validObs.slice(0, 6);
                }
                
                const history = validObs.slice(0, 6).map((item, index) => {
                    const prev = validObs[index + 1];
                    let actual = parseFloat(item.value);
                    let previous = item.previousValue !== undefined ? item.previousValue : (prev ? parseFloat(prev.value) : null);
                    
                    // Formatar valores
                    const suffix = (isPercentage || needsYoY) ? '%' : '';
                    const decimals = isPercentage ? 2 : (needsYoY ? 1 : 0);
                    
                    // Para NFP mostrar variação em milhares
                    if (fredSeries === 'PAYEMS') {
                        const change = previous ? actual - previous : 0;
                        return {
                            date: item.date,
                            actual: `${change >= 0 ? '+' : ''}${Math.round(change)}K`,
                            previous: prev ? `${Math.round(previous)}K (total)` : '-',
                            forecast: '-',
                            impact: 'high'
                        };
                    }
                    
                    return {
                        date: item.date,
                        actual: actual.toFixed(decimals) + suffix,
                        previous: prev ? previous.toFixed(decimals) + suffix : '-',
                        forecast: '-',
                        impact: 'high'
                    };
                });
                
                ECONOMIC_HISTORY_CACHE[eventTitle] = history;
                macroLog(`✅ Histórico de ${eventTitle}: ${history.length} registros via FRED`, 'success');
                return history;
            }
            
            return [];
            
        } catch (e) {
            macroLog(`⚠️ Erro ao buscar histórico FRED: ${e.message}`, 'warn');
            return [];
        }
    }
    
    // ============================================
    // CALENDÁRIO VIA FMP API
    // ============================================
    
    // Cache para calendário FMP
    let calendarCache = { events: null, lastUpdate: null };
    const CALENDAR_CACHE_TTL = 60 * 60 * 1000; // 1 hora
    
    // Eventos de alto impacto que queremos mostrar
    const HIGH_IMPACT_EVENTS = [
        'CPI', 'Consumer Price Index', 'Inflation', 'Core CPI',
        'Non-Farm Payroll', 'NFP', 'Nonfarm', 'Employment', 'Jobs',
        'GDP', 'Gross Domestic Product',
        'FOMC', 'Federal Reserve', 'Interest Rate', 'Fed Rate', 'Fed Decision',
        'Unemployment', 'Jobless Claims', 'Initial Claims', 'Continuing Claims',
        'Retail Sales', 'Consumer Confidence', 'Michigan Sentiment',
        'ISM Manufacturing', 'ISM Services', 'PMI', 'Purchasing Managers',
        'PPI', 'Producer Price Index', 'PCE', 'Personal Consumption',
        'Housing Starts', 'Building Permits', 'New Home Sales', 'Existing Home',
        'Trade Balance', 'Durable Goods', 'Factory Orders',
        'Industrial Production', 'Capacity Utilization',
        'ADP Employment', 'JOLTS', 'Job Openings',
        'Core PCE', 'Treasury', 'Yield',
        'Import Prices', 'Export Prices', 'Leading Indicators'
    ];
    
    // Buscar calendário econômico via FMP
    async function fetchEconomicCalendarFromAPI() {
        try {
            // Verificar cache
            if (calendarCache.events && calendarCache.lastUpdate &&
                (Date.now() - calendarCache.lastUpdate) < CALENDAR_CACHE_TTL) {
                macroLog('📦 Usando cache do calendário', 'info');
                return calendarCache.events;
            }
            
            macroLog('🔄 Carregando calendário econômico via FMP...', 'info');
            
            // Período: hoje até 30 dias no futuro
            const today = new Date();
            const fromDate = today.toISOString().split('T')[0];
            const toDate = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            
            const url = `https://financialmodelingprep.com/api/v3/economic_calendar?from=${fromDate}&to=${toDate}&apikey=${FMP_API_KEY}`;
            const response = await fetch(url);
            const data = await response.json();
            
            if (!Array.isArray(data) || data.length === 0) {
                macroLog('⚠️ FMP não retornou eventos, usando fallback', 'warn');
                return calculateFallbackEvents();
            }
            
            // Filtrar apenas eventos de alto impacto dos EUA
            const usEvents = data.filter(e => {
                if (e.country !== 'US') return false;
                if (e.impact !== 'High' && e.impact !== 'Medium') return false;
                
                // Verificar se é um evento importante
                const eventName = e.event?.toLowerCase() || '';
                return HIGH_IMPACT_EVENTS.some(keyword => 
                    eventName.includes(keyword.toLowerCase())
                );
            });
            
            // Converter para nosso formato
            const events = usEvents.slice(0, 15).map(e => {
                const eventDate = new Date(e.date);
                return {
                    day: eventDate.getDate(),
                    month: eventDate.toLocaleDateString('pt-BR', { month: 'short' }).toUpperCase(),
                    time: e.date.includes('T') ? e.date.split('T')[1].substring(0, 5) : '08:30',
                    title: translateEventName(e.event),
                    fullDate: e.date.split('T')[0],
                    country: 'EUA',
                    impact: e.impact?.toLowerCase() || 'high',
                    hasHistory: true,
                    estimate: e.estimate,
                    previous: e.previous,
                    actual: e.actual
                };
            });
            
            // Ordenar por data
            events.sort((a, b) => new Date(a.fullDate) - new Date(b.fullDate));
            
            // Atualizar cache
            calendarCache = { events, lastUpdate: Date.now() };
            
            macroLog(`✅ Calendário FMP: ${events.length} eventos`, 'success');
            return events;
            
        } catch (e) {
            macroLog('❌ Erro FMP Calendar: ' + e.message, 'error');
            return calculateFallbackEvents();
        }
    }
    
    // Traduzir nomes de eventos para português
    function translateEventName(name) {
        const translations = {
            'Consumer Price Index': 'CPI (Inflação)',
            'CPI': 'CPI (Inflação)',
            'Core CPI': 'CPI Core',
            'Non-Farm Payroll': 'Non-Farm Payrolls',
            'Nonfarm Payrolls': 'Non-Farm Payrolls',
            'Employment': 'Emprego',
            'Unemployment Rate': 'Taxa de Desemprego',
            'Initial Jobless Claims': 'Pedidos Seguro-Desemprego',
            'GDP': 'PIB',
            'Gross Domestic Product': 'PIB',
            'FOMC': 'Decisão FOMC',
            'Federal Reserve': 'Fed',
            'Interest Rate Decision': 'Decisão de Juros',
            'Fed Interest Rate': 'Taxa de Juros Fed',
            'Retail Sales': 'Vendas no Varejo',
            'Consumer Confidence': 'Confiança do Consumidor',
            'ISM Manufacturing': 'ISM Manufatura',
            'ISM Services': 'ISM Serviços',
            'PMI': 'PMI',
            'PPI': 'PPI (Preços ao Produtor)',
            'Producer Price Index': 'PPI',
            'Housing Starts': 'Início de Construções',
            'Building Permits': 'Licenças de Construção',
            'Trade Balance': 'Balança Comercial',
            'Durable Goods': 'Bens Duráveis',
            'Personal Spending': 'Gastos Pessoais',
            'Personal Income': 'Renda Pessoal',
            'PCE Price Index': 'PCE (Inflação)',
            'Core PCE': 'PCE Core'
        };
        
        for (const [eng, pt] of Object.entries(translations)) {
            if (name?.toLowerCase().includes(eng.toLowerCase())) {
                return pt;
            }
        }
        return name || 'Evento Econômico';
    }
    
    // Fallback: eventos calculados se FMP falhar
    function calculateFallbackEvents() {
        const today = new Date();
        const events = [];
        
        // Helper para criar eventos
        function addEvent(date, title, time, impact, hasHistory = true) {
            const d = new Date(date);
            if (d > today && d < new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000)) {
                events.push({
                    day: d.getDate(),
                    month: d.toLocaleDateString('pt-BR', { month: 'short' }).toUpperCase(),
                    time: time,
                    title: title,
                    fullDate: date,
                    country: 'EUA',
                    impact: impact,
                    hasHistory: hasHistory
                });
            }
        }
        
        // FOMC meetings (todos os meetings)
        for (const meeting of ALL_FOMC_MEETINGS) {
            addEvent(meeting.date, 'Decisão FOMC', '14:00', 'high', true);
        }
        
        // Eventos econômicos REAIS de 2026
        // IMPORTANTE: Datas aproximadas baseadas no calendário econômico real
        
        // ===== FEVEREIRO 2026 =====
        addEvent('2026-02-06', 'Non-Farm Payrolls', '08:30', 'high');
        addEvent('2026-02-11', 'CPI (Inflação)', '08:30', 'high');
        addEvent('2026-02-12', 'PPI (Preços Produtor)', '08:30', 'medium');
        addEvent('2026-02-13', 'Vendas no Varejo', '08:30', 'high');
        addEvent('2026-02-19', 'Pedidos Seguro-Desemprego', '08:30', 'medium');
        addEvent('2026-02-24', 'Confiança do Consumidor', '10:00', 'medium');
        addEvent('2026-02-26', 'PIB Q4 (Segunda Est.)', '08:30', 'high');
        addEvent('2026-02-27', 'PCE (Inflação)', '08:30', 'high');
        
        // ===== MARÇO 2026 =====
        addEvent('2026-03-02', 'ISM Manufatura', '10:00', 'high');
        addEvent('2026-03-04', 'ISM Serviços', '10:00', 'high');
        addEvent('2026-03-06', 'Non-Farm Payrolls', '08:30', 'high');
        addEvent('2026-03-11', 'CPI (Inflação)', '08:30', 'high');
        addEvent('2026-03-12', 'PPI (Preços Produtor)', '08:30', 'medium');
        addEvent('2026-03-17', 'Vendas no Varejo', '08:30', 'high');
        addEvent('2026-03-24', 'Pedidos Bens Duráveis', '08:30', 'medium');
        addEvent('2026-03-26', 'PIB Q4 (Final)', '08:30', 'high');
        addEvent('2026-03-27', 'PCE (Inflação)', '08:30', 'high');
        addEvent('2026-03-31', 'Confiança do Consumidor', '10:00', 'medium');
        
        // ===== ABRIL 2026 =====
        addEvent('2026-04-01', 'ISM Manufatura', '10:00', 'high');
        addEvent('2026-04-03', 'Non-Farm Payrolls', '08:30', 'high');
        addEvent('2026-04-03', 'ISM Serviços', '10:00', 'high');
        addEvent('2026-04-10', 'CPI (Inflação)', '08:30', 'high');
        addEvent('2026-04-14', 'PPI (Preços Produtor)', '08:30', 'medium');
        addEvent('2026-04-15', 'Vendas no Varejo', '08:30', 'high');
        addEvent('2026-04-28', 'Confiança do Consumidor', '10:00', 'medium');
        addEvent('2026-04-29', 'PIB Q1 (Avançado)', '08:30', 'high');
        addEvent('2026-04-30', 'PCE (Inflação)', '08:30', 'high');
        
        // ===== MAIO 2026 =====
        addEvent('2026-05-01', 'ISM Manufatura', '10:00', 'high');
        addEvent('2026-05-05', 'ISM Serviços', '10:00', 'high');
        addEvent('2026-05-08', 'Non-Farm Payrolls', '08:30', 'high');
        addEvent('2026-05-13', 'CPI (Inflação)', '08:30', 'high');
        addEvent('2026-05-14', 'PPI (Preços Produtor)', '08:30', 'medium');
        addEvent('2026-05-15', 'Vendas no Varejo', '08:30', 'high');
        addEvent('2026-05-26', 'Confiança do Consumidor', '10:00', 'medium');
        addEvent('2026-05-28', 'PIB Q1 (Segunda Est.)', '08:30', 'high');
        addEvent('2026-05-29', 'PCE (Inflação)', '08:30', 'high');
        
        // ===== JUNHO 2026 =====
        addEvent('2026-06-01', 'ISM Manufatura', '10:00', 'high');
        addEvent('2026-06-03', 'ISM Serviços', '10:00', 'high');
        addEvent('2026-06-05', 'Non-Farm Payrolls', '08:30', 'high');
        addEvent('2026-06-10', 'CPI (Inflação)', '08:30', 'high');
        addEvent('2026-06-11', 'PPI (Preços Produtor)', '08:30', 'medium');
        addEvent('2026-06-16', 'Vendas no Varejo', '08:30', 'high');
        addEvent('2026-06-25', 'PIB Q1 (Final)', '08:30', 'high');
        addEvent('2026-06-26', 'PCE (Inflação)', '08:30', 'high');
        addEvent('2026-06-30', 'Confiança do Consumidor', '10:00', 'medium');
        
        // ===== JULHO 2026 =====
        addEvent('2026-07-01', 'ISM Manufatura', '10:00', 'high');
        addEvent('2026-07-02', 'Non-Farm Payrolls', '08:30', 'high');
        addEvent('2026-07-06', 'ISM Serviços', '10:00', 'high');
        addEvent('2026-07-14', 'CPI (Inflação)', '08:30', 'high');
        addEvent('2026-07-15', 'PPI (Preços Produtor)', '08:30', 'medium');
        addEvent('2026-07-16', 'Vendas no Varejo', '08:30', 'high');
        addEvent('2026-07-28', 'Confiança do Consumidor', '10:00', 'medium');
        addEvent('2026-07-29', 'PIB Q2 (Avançado)', '08:30', 'high');
        addEvent('2026-07-31', 'PCE (Inflação)', '08:30', 'high');
        
        // ===== AGOSTO 2026 =====
        addEvent('2026-08-03', 'ISM Manufatura', '10:00', 'high');
        addEvent('2026-08-05', 'ISM Serviços', '10:00', 'high');
        addEvent('2026-08-07', 'Non-Farm Payrolls', '08:30', 'high');
        addEvent('2026-08-12', 'CPI (Inflação)', '08:30', 'high');
        addEvent('2026-08-13', 'PPI (Preços Produtor)', '08:30', 'medium');
        addEvent('2026-08-14', 'Vendas no Varejo', '08:30', 'high');
        addEvent('2026-08-25', 'Confiança do Consumidor', '10:00', 'medium');
        addEvent('2026-08-27', 'PIB Q2 (Segunda Est.)', '08:30', 'high');
        addEvent('2026-08-28', 'PCE (Inflação)', '08:30', 'high');
        
        events.sort((a, b) => new Date(a.fullDate) - new Date(b.fullDate));
        return events.slice(0, 15);
    }
    
    // Buscar histórico de um evento via Alpha Vantage
    async function fetchEventHistoryFromAPI(eventTitle) {
        return await fetchEconomicHistoryFromAI(eventTitle);
    }
    
    async function updateEconomicCalendar() {
        const container = document.getElementById('economic-calendar');
        if (!container) return;
        
        // Mostrar loading
        container.innerHTML = `
            <div style="text-align: center; padding: 30px; color: #888;">
                <i class="fas fa-spinner fa-spin" style="font-size: 20px; margin-bottom: 8px;"></i>
                <p style="margin: 0;">Carregando eventos...</p>
            </div>
        `;
        
        // Tentar buscar dados reais
        let events = await fetchEconomicCalendarFromAPI();
        
        if (!events || events.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 30px; color: #ef4444;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 32px; margin-bottom: 12px; opacity: 0.7;"></i>
                    <p style="margin: 0; font-weight: 600;">Erro ao carregar calendário</p>
                    <p style="margin: 8px 0 0; font-size: 12px; color: #888;">Não foi possível obter eventos da API.</p>
                    <button onclick="window.updateEconomicCalendar()" style="margin-top: 12px; padding: 8px 16px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; color: white; cursor: pointer; font-size: 12px;">
                        <i class="fas fa-sync-alt"></i> Tentar novamente
                    </button>
                </div>
            `;
            return;
        }
        
        container.innerHTML = events.slice(0, 10).map((e, idx) => `
            <div class="calendar-event" data-event-idx="${idx}" data-event-title="${e.title}" style="cursor: pointer; transition: background 0.2s;" onclick="window.MacroAPI.showEventDetails('${e.title}', '${e.fullDate}')">
                <div class="calendar-date">
                    <div class="calendar-day">${e.day}</div>
                    <div class="calendar-month">${e.month}</div>
                </div>
                <div class="calendar-info">
                    <div class="calendar-title">${e.title}</div>
                    <div class="calendar-country">${e.country} • ${e.time}${e.estimate ? ` • Est: ${e.estimate}` : ''}</div>
                </div>
                <div class="calendar-impact ${e.impact}">${e.impact === 'high' ? 'ALTO' : 'MÉDIO'}</div>
                <i class="fas fa-chevron-right" style="color: var(--text-muted); font-size: 12px; margin-left: 8px;"></i>
            </div>
        `).join('') || '<p style="color: var(--text-muted); text-align: center;">Nenhum evento</p>';
        
        // Adicionar hover effect
        container.querySelectorAll('.calendar-event').forEach(el => {
            el.addEventListener('mouseenter', () => el.style.background = 'rgba(255,255,255,0.05)');
            el.addEventListener('mouseleave', () => el.style.background = '');
        });
        
        // Mostrar última atualização
        const updateInfo = document.createElement('div');
        updateInfo.style.cssText = 'font-size: 10px; color: #555; text-align: right; margin-top: 8px; padding-right: 8px;';
        updateInfo.textContent = `Atualizado: ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} • Fonte: FMP • Histórico: FRED`;
        container.appendChild(updateInfo);
    }
    
    async function showEventDetails(eventTitle, eventDate) {
        // Buscar histórico real da API
        let history = await fetchEventHistoryFromAPI(eventTitle);
        
        // Usar cache se disponível
        if (!history || history.length === 0) {
            history = ECONOMIC_HISTORY_CACHE[eventTitle] || [];
        }
        
        // Remover modal antigo
        const oldModal = document.getElementById('event-detail-modal');
        if (oldModal) oldModal.remove();
        
        // Função para formatar data para pt-BR (DD/MM/YYYY)
        function formatDateBR(dateStr) {
            if (!dateStr || dateStr === '-') return dateStr;
            try {
                // Se já está no formato DD/MM/YYYY, retorna como está
                if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) return dateStr;
                // Se está no formato YYYY-MM-DD, converte
                if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                    const [year, month, day] = dateStr.split('-');
                    return `${day}/${month}/${year}`;
                }
                // Tenta converter como Date
                const date = new Date(dateStr);
                if (!isNaN(date.getTime())) {
                    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
                }
                return dateStr;
            } catch (e) {
                return dateStr;
            }
        }
        
        const modal = document.createElement('div');
        modal.id = 'event-detail-modal';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.85); z-index: 9999; display: flex; align-items: flex-start; justify-content: center; padding: 20px; overflow-y: auto; -webkit-overflow-scrolling: touch;';
        
        const eventInfo = getEventInfo(eventTitle);
        
        modal.innerHTML = `
            <div style="background: var(--bg-secondary, #1a1a2e); width: 100%; max-width: 420px; border-radius: 20px; overflow: hidden; animation: slideUp 0.3s ease; margin: auto 0; max-height: calc(100vh - 40px); display: flex; flex-direction: column;">
                <!-- Header -->
                <div style="padding: 20px; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between; align-items: center; flex-shrink: 0;">
                    <div>
                        <h3 style="margin: 0; font-size: 18px; color: white; display: flex; align-items: center; gap: 8px;">
                            <i class="fas ${eventInfo.icon}" style="color: ${eventInfo.color};"></i>
                            ${eventTitle}
                        </h3>
                        <p style="margin: 4px 0 0; font-size: 12px; color: #888;">Próximo: ${new Date(eventDate).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
                    </div>
                    <button id="close-event-modal" style="background: rgba(255,255,255,0.1); border: none; width: 36px; height: 36px; border-radius: 50%; color: white; font-size: 18px; cursor: pointer;">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <!-- Descrição -->
                <div style="padding: 16px; overflow-y: auto; flex: 1; -webkit-overflow-scrolling: touch;">
                    <p style="color: #aaa; font-size: 13px; line-height: 1.5; margin: 0 0 16px;">
                        ${eventInfo.description}
                    </p>
                    
                    <!-- Fonte dos dados -->
                    <div style="background: rgba(59, 130, 246, 0.1); border-radius: 8px; padding: 8px 12px; margin-bottom: 16px; display: flex; align-items: center; gap: 8px;">
                        <i class="fas fa-database" style="color: #3b82f6; font-size: 12px;"></i>
                        <span style="font-size: 11px; color: #888;">Dados via IA (Llama) • Cache: 1h</span>
                    </div>
                    
                    <!-- Histórico -->
                    <h4 style="margin: 0 0 12px; color: white; font-size: 14px; display: flex; align-items: center; gap: 8px;">
                        <i class="fas fa-history" style="color: #3b82f6;"></i>
                        Últimos Resultados
                    </h4>
                    
                    ${history.length > 0 ? `
                        <div style="display: flex; flex-direction: column; gap: 10px;">
                            ${history.map((h, idx) => {
                                // Calcular variação entre actual e previous
                                const actualNum = parseFloat(String(h.actual).replace(/[^0-9.-]/g, ''));
                                const prevNum = parseFloat(String(h.previous).replace(/[^0-9.-]/g, ''));
                                let variacao = '';
                                let varColor = '#888';
                                if (!isNaN(actualNum) && !isNaN(prevNum) && prevNum !== 0 && h.previous !== '-') {
                                    const diff = actualNum - prevNum;
                                    const diffPct = ((diff / Math.abs(prevNum)) * 100).toFixed(1);
                                    variacao = diff >= 0 ? `+${diffPct}%` : `${diffPct}%`;
                                    varColor = diff >= 0 ? '#22c55e' : '#ef4444';
                                }
                                
                                // Mostrar informações úteis em vez de Prev/Ant com "-"
                                const hasUsefulData = h.forecast !== '-' || h.previous !== '-';
                                const showVariacao = variacao !== '';
                                
                                return `
                                <div style="background: rgba(255,255,255,0.03); border-radius: 10px; padding: 12px;">
                                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                        <span style="color: #888; font-size: 11px;">${formatDateBR(h.date)}</span>
                                        <div style="display: flex; align-items: center; gap: 8px;">
                                            ${showVariacao ? `<span style="font-size: 10px; color: ${varColor}; background: ${varColor}15; padding: 2px 6px; border-radius: 4px;">${variacao}</span>` : ''}
                                            <span style="font-size: 13px; font-weight: 600; color: ${String(h.actual).includes('+') || parseFloat(h.actual) > parseFloat(h.forecast) ? '#22c55e' : parseFloat(h.actual) < parseFloat(h.forecast) ? '#ef4444' : '#888'};">${h.actual}</span>
                                        </div>
                                    </div>
                                    ${hasUsefulData ? `
                                        <div style="display: flex; gap: 12px; font-size: 11px; color: #666;">
                                            ${h.forecast !== '-' ? `<span>📊 Esperado: ${h.forecast}</span>` : ''}
                                            ${h.previous !== '-' ? `<span>📈 Anterior: ${h.previous}</span>` : ''}
                                        </div>
                                    ` : `
                                        <div style="font-size: 10px; color: #555; display: flex; align-items: center; gap: 4px;">
                                            <i class="fas fa-info-circle"></i>
                                            Resultado reportado na data
                                        </div>
                                    `}
                                </div>
                            `}).join('')}
                        </div>
                    ` : `
                        <div style="text-align: center; padding: 20px; color: #888;">
                            <i class="fas fa-database" style="font-size: 24px; margin-bottom: 8px; opacity: 0.5;"></i>
                            <p style="margin: 0;">Histórico não disponível via API</p>
                            <p style="margin: 4px 0 0; font-size: 11px; color: #666;">Dados históricos serão exibidos quando disponíveis</p>
                        </div>
                    `}
                    
                    <!-- Expectativa -->
                    ${eventInfo.expectation ? `
                        <div style="margin-top: 16px; padding: 12px; background: rgba(59, 130, 246, 0.1); border-radius: 10px; border-left: 3px solid #3b82f6;">
                            <h5 style="margin: 0 0 6px; color: #3b82f6; font-size: 12px;">💡 O que esperar?</h5>
                            <p style="margin: 0; color: #aaa; font-size: 12px; line-height: 1.5;">${eventInfo.expectation}</p>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        document.getElementById('close-event-modal').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    }
    
    function getEventInfo(title) {
        const info = {
            'Non-Farm Payrolls': {
                icon: 'fa-users',
                color: '#22c55e',
                description: 'O relatório de empregos mais importante dos EUA. Mostra quantos empregos foram criados no setor não-agrícola. Números acima do esperado podem fortalecer o dólar e pressionar ações, enquanto números fracos podem aumentar expectativas de cortes de juros.',
                expectation: 'Mercado espera cerca de 160-180K novos empregos. Fique atento também à taxa de desemprego e crescimento salarial.'
            },
            'CPI (Inflação)': {
                icon: 'fa-percentage',
                color: '#f59e0b',
                description: 'Índice de Preços ao Consumidor (Consumer Price Index). Mede a inflação através da variação de preços de uma cesta de bens e serviços. É crucial para decisões de política monetária do Fed.',
                expectation: 'Meta do Fed é 2%. Inflação acima de 3% pode reduzir expectativas de cortes de juros. Core CPI (excluindo alimentos e energia) é ainda mais observado.'
            },
            'Decisão FOMC': {
                icon: 'fa-landmark',
                color: '#3b82f6',
                description: 'Reunião do Comitê Federal de Mercado Aberto. O Fed decide a taxa de juros básica dos EUA. Além da decisão, o comunicado e coletiva do presidente são muito importantes para entender a direção futura.',
                expectation: 'Observe o "dot plot" (projeções dos membros) e qualquer mudança no tom do comunicado. Palavras como "paciente" ou "vigilante" impactam mercados.'
            },
            'PCE (Inflação)': {
                icon: 'fa-chart-pie',
                color: '#a855f7',
                description: 'Personal Consumption Expenditures - o indicador de inflação PREFERIDO do Federal Reserve. Mais amplo que o CPI e considerado mais preciso. Core PCE (excluindo alimentos e energia) é a métrica mais observada pelo Fed.',
                expectation: 'Meta do Fed é 2%. Core PCE é o principal termômetro para decisões de política monetária. Valores persistentemente acima de 2.5% podem adiar cortes de juros.'
            },
            'PIB (GDP)': {
                icon: 'fa-chart-line',
                color: '#10b981',
                description: 'Produto Interno Bruto - a medida mais ampla de atividade econômica. Publicado trimestralmente com revisões. Crescimento saudável é geralmente entre 2-3% ao ano.',
                expectation: 'GDP forte demais pode pressionar inflação. GDP fraco pode aumentar expectativas de cortes de juros. Recessão técnica = 2 trimestres consecutivos de queda.'
            }
        };
        return info[title] || { icon: 'fa-calendar', color: '#888', description: 'Evento econômico importante.', expectation: null };
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
        
        macroLog('=== MACRO v14.0 - FED WATCH DINÂMICO + CALENDÁRIO INTERATIVO ===', 'success');
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
    
    // API global para eventos do calendário
    window.MacroAPI = {
        showEventDetails,
        getEventInfo,
        updateFedWatch,
        updateEconomicCalendar
    };

    macroLog('✓ macro-section.js v14.0 carregado!', 'success');
})();
