/**
 * MACRO SECTION - Dados Macroeconômicos
 * Versão 20.0 - DEBUG MÁXIMO
 * Container VERMELHO, Canvas VERDE, Desenho AZUL
 */

(function() {
    'use strict';

    const BACKEND_PROXY = 'https://visor-crypto-api.onrender.com/api/proxy';
    
    // API keys moved to backend proxy
    const FINNHUB_API_KEY = null; // Server-side
    const FINNHUB_WS_URL = null; // Finnhub WS disabled (use REST proxy);
    // Twelve Data - 3 chaves = 2400 créditos/dia (800 cada)
    const TWELVE_DATA_API_KEYS = []; // Keys moved to backend proxy
    let currentTwelveDataKeyIndex = 0;
    const FMP_API_KEY = null; // Key moved to backend proxy
    const FRED_API_KEY = null; // Key moved to backend proxy // FRED - Taxa do Fed
    const ALPHA_VANTAGE_KEY = null; // Key moved to backend proxy // Para histórico de eventos
    
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
        'CL=F': { name: 'Petróleo WTI', short: 'WTI', desc: 'WTI Crude Oil Futures', img: 'petroleo.png', color: '#795548', prefix: '$', decimals: 2 },
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
            <div id="indicator-modal-content" style="background: var(--bg-secondary, #1a1a2e); width: 100%; max-width: 500px; max-height: 90vh; border-radius: 20px 20px 0 0; overflow-y: auto; animation: slideUp 0.3s cubic-bezier(0.22, 1, 0.36, 1) forwards; will-change: transform; transform: translateZ(0);">
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
                    
                    <!-- Timeframe Dropdown + Chart Type -->
                    <div style="margin-bottom: 12px; display: flex; gap: 8px; align-items: center;">
                        <div class="macro-tf-dropdown" id="macro-tf-dropdown" style="flex: 1;">
                            <div class="macro-tf-selector" id="macro-tf-selector">
                                <span style="display: flex; align-items: center; gap: 6px;">
                                    <i class="fas fa-clock" style="color: #3b82f6; font-size: 12px;"></i>
                                    <span id="macro-tf-label">1 dia</span>
                                </span>
                                <i class="fas fa-chevron-down macro-tf-arrow"></i>
                            </div>
                            <div class="macro-tf-options" id="macro-tf-options">
                                <div class="macro-tf-option" data-period="15m"><span>15 minutos</span><i class="fas fa-check macro-tf-check"></i></div>
                                <div class="macro-tf-option" data-period="30m"><span>30 minutos</span><i class="fas fa-check macro-tf-check"></i></div>
                                <div class="macro-tf-option" data-period="4h"><span>4 horas</span><i class="fas fa-check macro-tf-check"></i></div>
                                <div class="macro-tf-option active" data-period="1d"><span>1 dia</span><i class="fas fa-check macro-tf-check"></i></div>
                                <div class="macro-tf-option" data-period="1w"><span>1 semana</span><i class="fas fa-check macro-tf-check"></i></div>
                                <div class="macro-tf-option" data-period="1M"><span>1 m\xEAs</span><i class="fas fa-check macro-tf-check"></i></div>
                                <div class="macro-tf-option" data-period="6M"><span>6 meses</span><i class="fas fa-check macro-tf-check"></i></div>
                                <div class="macro-tf-option" data-period="1Y"><span>1 ano</span><i class="fas fa-check macro-tf-check"></i></div>
                            </div>
                        </div>
                        <div style="display: flex; gap: 6px;">
                            <button class="ind-type-btn active" data-type="line" title="Linha"><i class="fas fa-chart-line"></i></button>
                            <button class="ind-type-btn" data-type="candle" title="Candles"><i class="fas fa-chart-bar"></i></button>
                        </div>
                    </div>
                    
                    <!-- Chart Container v22 - IDs ÚNICOS -->
                    <div id="macro-chart-container" style="background: #0d0d1a; border-radius: 12px; margin-bottom: 16px; width: 100%; height: 280px; position: relative; overflow: hidden;">
                        <canvas id="macro-chart-canvas" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;"></canvas>
                        <div id="macro-chart-loading" style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; display: flex; align-items: center; justify-content: center; background: rgba(13,13,26,0.95); z-index: 5;">
                            <i class="fas fa-spinner fa-spin" style="color: #3b82f6; font-size: 24px;"></i>
                        </div>
                        <button id="macro-maximize-btn" style="position: absolute; top: 8px; right: 8px; background: rgba(0,0,0,0.6); border: none; width: 32px; height: 32px; border-radius: 8px; color: white; cursor: pointer; display: flex; align-items: center; justify-content: center; z-index: 15;" title="Maximizar">
                            <i class="fas fa-expand"></i>
                        </button>
                    </div>
                    
                    <!-- Stats -->
                    <div id="indicator-stats" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;"></div>
                </div>
            </div>
            <style>
                @keyframes slideUp { from { transform: translate3d(0, 100%, 0); } to { transform: translate3d(0, 0, 0); } }
                @keyframes spin { to { transform: rotate(360deg); } }
                .macro-tf-dropdown { position: relative; }
                .macro-tf-selector {
                    display: flex; align-items: center; justify-content: space-between;
                    padding: 10px 14px; background: rgba(255,255,255,0.06);
                    border: 1px solid rgba(255,255,255,0.12); border-radius: 10px;
                    cursor: pointer; transition: all 0.3s; color: white; font-size: 13px; font-weight: 600;
                }
                .macro-tf-selector:hover { border-color: #3b82f6; }
                .macro-tf-arrow { color: #888; font-size: 10px; transition: transform 0.3s; }
                .macro-tf-dropdown.open .macro-tf-arrow { transform: rotate(180deg); }
                .macro-tf-options {
                    position: absolute; top: calc(100% + 4px); left: 0; right: 0;
                    background: #1a1a2e; border: 1px solid rgba(255,255,255,0.15);
                    border-radius: 10px; overflow: hidden; opacity: 0; visibility: hidden;
                    transform: translateY(-8px); transition: all 0.25s ease;
                    z-index: 9999; max-height: 300px; overflow-y: auto;
                    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
                }
                .macro-tf-dropdown.open .macro-tf-options { opacity: 1; visibility: visible; transform: translateY(0); }
                .macro-tf-option {
                    padding: 10px 14px; font-size: 13px; font-weight: 500; color: #a1a1aa;
                    cursor: pointer; transition: all 0.2s; display: flex;
                    align-items: center; justify-content: space-between;
                }
                .macro-tf-option:hover { background: rgba(99,102,241,0.15); color: white; }
                .macro-tf-option.active { background: #3b82f6; color: white; }
                .macro-tf-check { opacity: 0; font-size: 11px; }
                .macro-tf-option.active .macro-tf-check { opacity: 1; }
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
        
        // Timeframe dropdown
        const macroTfSelector = document.getElementById('macro-tf-selector');
        const macroTfDropdown = document.getElementById('macro-tf-dropdown');
        if (macroTfSelector) {
            macroTfSelector.addEventListener('click', () => macroTfDropdown.classList.toggle('open'));
        }
        document.querySelectorAll('.macro-tf-option').forEach(opt => {
            opt.addEventListener('click', function() {
                document.querySelectorAll('.macro-tf-option').forEach(o => o.classList.remove('active'));
                this.classList.add('active');
                const period = this.dataset.period;
                const label = this.querySelector('span').textContent;
                document.getElementById('macro-tf-label').textContent = label;
                macroTfDropdown.classList.remove('open');
                indicatorChartPeriod = period;
                const canvas = document.getElementById('macro-chart-canvas');
                const loadingEl = document.getElementById('macro-chart-loading');
                if (canvas) { const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height); }
                if (loadingEl) loadingEl.style.display = 'flex';
                indicatorCandleData = null;
                loadIndicatorChartData(symbol);
            });
        });
        // Close dropdown on outside click
        modal.addEventListener('click', function(e) {
            if (macroTfDropdown && !macroTfDropdown.contains(e.target)) macroTfDropdown.classList.remove('open');
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
        document.getElementById('macro-maximize-btn').addEventListener('click', () => openFullscreenChart(symbol));
        
        // Pre-fetch data durante animação, mas desenhar só depois
        let prefetchedData = null;
        const prefetchPromise = (async () => {
            try {
                const cacheKey = getChartCacheKey(symbol, indicatorChartPeriod);
                const cached = chartDataCache[cacheKey];
                if (cached && (Date.now() - cached.timestamp) < CHART_CACHE_TTL) {
                    prefetchedData = cached.data;
                    return;
                }
                const periodMap = {
                    '15m': { interval: '1m', range: '1d' },
                    '30m': { interval: '5m', range: '1d' },
                    '4h': { interval: '5m', range: '1d' },
                    '1d': { interval: '15m', range: '1d' },
                    '1w': { interval: '1h', range: '5d' },
                    '1M': { interval: '1d', range: '1mo' },
                    '6M': { interval: '1d', range: '6mo' },
                    '1Y': { interval: '1wk', range: '1y' },
                };
                const cfg = periodMap[indicatorChartPeriod] || periodMap['1d'];
                const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${cfg.interval}&range=${cfg.range}`;
                let data = null;
                try {
                    const controller = new AbortController();
                    const timeout = setTimeout(() => controller.abort(), 5000);
                    const resp = await fetch(yahooUrl, { signal: controller.signal });
                    clearTimeout(timeout);
                    if (resp.ok) { data = await resp.json(); if (!data?.chart?.result?.[0]) data = null; }
                } catch(e) {}
                if (!data) {
                    const proxies = [
                        `https://api.allorigins.win/raw?url=${encodeURIComponent(yahooUrl)}`,
                        `https://corsproxy.io/?${encodeURIComponent(yahooUrl)}`,
                    ];
                    for (const url of proxies) {
                        try {
                            const controller = new AbortController();
                            const timeout = setTimeout(() => controller.abort(), 6000);
                            const resp = await fetch(url, { signal: controller.signal });
                            clearTimeout(timeout);
                            if (resp.ok) { data = await resp.json(); if (data?.chart?.result?.[0]) break; }
                        } catch(e) { continue; }
                    }
                }
                if (data?.chart?.result?.[0]) {
                    const result = data.chart.result[0];
                    const ts = result.timestamp || [];
                    const q = result.indicators.quote[0];
                    prefetchedData = ts.map((t, i) => [
                        t * 1000, q.open?.[i]||0, q.high?.[i]||0, q.low?.[i]||0, q.close?.[i]||0, q.volume?.[i]||0
                    ]).filter(d => d[4] != null && !isNaN(d[4]) && d[4] > 0);
                    chartDataCache[getChartCacheKey(symbol, indicatorChartPeriod)] = { data: prefetchedData, timestamp: Date.now() };
                }
            } catch(e) { macroLog('Prefetch error: ' + e.message, 'warn'); }
        })();

        // Desenhar gráfico só quando animação terminar + dados prontos
        const modalContent = document.getElementById('indicator-modal-content');
        const onReady = async () => {
            await prefetchPromise;
            if (prefetchedData) {
                indicatorCandleData = prefetchedData;
                const loadingEl = document.getElementById('macro-chart-loading');
                if (loadingEl) loadingEl.style.display = 'none';
                if (indicatorChartType === 'candle') {
                    drawIndicatorCandleChart(indicatorCandleData);
                } else {
                    drawIndicatorLineChart(indicatorCandleData);
                }
            } else {
                loadIndicatorChartData(symbol);
            }
            loadIndicatorStats(symbol);
        };
        if (modalContent) {
            modalContent.addEventListener('animationend', onReady, { once: true });
            // Fallback se animationend não disparar (ex: browser quirk)
            setTimeout(() => {
                if (!indicatorCandleData && !prefetchedData) onReady();
            }, 500);
        } else {
            setTimeout(onReady, 350);
        }
    }

    // ============================================
    // GRÁFICO FULLSCREEN
    // ============================================
    async function openFullscreenChart(symbol) {
        const config = MARKET_INDICATORS[symbol];
        const price = indicatorPrices[symbol] || 0;
        const change = indicatorChanges[symbol] || 0;
        
        // Salvar símbolo para back button poder reabrir o modal do indicador
        window._lastFSSymbol = symbol;
        
        const oldFs = document.getElementById('indicator-fullscreen-modal');
        if (oldFs) oldFs.remove();
        
        // Rotacionar para landscape (igual ao HOME)
        try {
            if (window.lockLandscape) await window.lockLandscape();
            if (window.Capacitor && window.Capacitor.Plugins) {
                if (window.Capacitor.Plugins.StatusBar) await window.Capacitor.Plugins.StatusBar.hide();
                if (window.Capacitor.Plugins.Fullscreen) await window.Capacitor.Plugins.Fullscreen.enterFullscreen();
            }
        } catch (e) { /* console.log('Fullscreen API error:', e); */ }
        
        const fsModal = document.createElement('div');
        fsModal.id = 'indicator-fullscreen-modal';
        fsModal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: #0d0d1a; z-index: 10001; display: flex; flex-direction: column;';
        
        fsModal.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 12px; padding-top: max(6px, env(safe-area-inset-top, 6px)); padding-left: max(12px, env(safe-area-inset-left, 12px)); padding-right: max(12px, env(safe-area-inset-right, 12px)); background: rgba(20,20,30,0.95); border-bottom: 1px solid rgba(255,255,255,0.1); min-height: 50px; gap: 10px; overflow: visible;">
                <!-- Left: Back button -->
                <button id="close-fs-btn" style="width: 36px; height: 36px; border: none; background: rgba(255,255,255,0.1); border-radius: 10px; color: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 14px; flex-shrink: 0;">
                    <i class="fas fa-arrow-left"></i>
                </button>
                <!-- Center: Info -->
                <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
                    <img src="${config.img}" alt="${config.name}" style="width: 28px; height: 28px; border-radius: 8px; object-fit: cover;">
                    <div>
                        <div style="font-size: 14px; font-weight: 700; color: #fff;">${config.name}</div>
                        <div style="font-size: 13px; font-weight: 600; color: ${change >= 0 ? '#22c55e' : '#ef4444'};">${formatIndicatorPrice(symbol)} <span style="font-size: 11px;">${change >= 0 ? '+' : ''}${change.toFixed(2)}%</span></div>
                    </div>
                </div>
                <!-- Center-right: Timeframe dropdown -->
                    <div class="fs-macro-tf-dropdown" id="fs-macro-tf-dropdown" style="flex: 0 0 auto;">
                        <div class="fs-macro-tf-selector" id="fs-macro-tf-selector">
                            <span style="display: flex; align-items: center; gap: 5px;">
                                <i class="fas fa-clock" style="color: #3b82f6; font-size: 11px;"></i>
                                <span id="fs-macro-tf-label">${{'15m':'15m','30m':'30m','4h':'4H','1d':'1D','1w':'1S','1M':'1M','6M':'6M','1Y':'1A'}[indicatorChartPeriod] || '1D'}</span>
                            </span>
                            <i class="fas fa-chevron-down fs-macro-tf-arrow"></i>
                        </div>
                        <div class="fs-macro-tf-options" id="fs-macro-tf-options">
                            <div class="fs-macro-tf-option ${indicatorChartPeriod === '15m' ? 'active' : ''}" data-period="15m"><span>15 minutos</span><i class="fas fa-check fs-macro-tf-check"></i></div>
                            <div class="fs-macro-tf-option ${indicatorChartPeriod === '30m' ? 'active' : ''}" data-period="30m"><span>30 minutos</span><i class="fas fa-check fs-macro-tf-check"></i></div>
                            <div class="fs-macro-tf-option ${indicatorChartPeriod === '4h' ? 'active' : ''}" data-period="4h"><span>4 horas</span><i class="fas fa-check fs-macro-tf-check"></i></div>
                            <div class="fs-macro-tf-option ${indicatorChartPeriod === '1d' ? 'active' : ''}" data-period="1d"><span>1 dia</span><i class="fas fa-check fs-macro-tf-check"></i></div>
                            <div class="fs-macro-tf-option ${indicatorChartPeriod === '1w' ? 'active' : ''}" data-period="1w"><span>1 semana</span><i class="fas fa-check fs-macro-tf-check"></i></div>
                            <div class="fs-macro-tf-option ${indicatorChartPeriod === '1M' ? 'active' : ''}" data-period="1M"><span>1 m\xEAs</span><i class="fas fa-check fs-macro-tf-check"></i></div>
                            <div class="fs-macro-tf-option ${indicatorChartPeriod === '6M' ? 'active' : ''}" data-period="6M"><span>6 meses</span><i class="fas fa-check fs-macro-tf-check"></i></div>
                            <div class="fs-macro-tf-option ${indicatorChartPeriod === '1Y' ? 'active' : ''}" data-period="1Y"><span>1 ano</span><i class="fas fa-check fs-macro-tf-check"></i></div>
                        </div>
                    </div>
                <!-- Right: Controls -->
                <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
                    <button class="fs-type-btn ${indicatorChartType === 'line' ? 'active' : ''}" data-type="line"><i class="fas fa-chart-line"></i></button>
                    <button class="fs-type-btn ${indicatorChartType === 'candle' ? 'active' : ''}" data-type="candle"><i class="fas fa-chart-bar"></i></button>
                </div>
            </div>
            <div style="flex: 1; padding: 8px; padding-bottom: max(8px, env(safe-area-inset-bottom, 8px)); padding-left: max(8px, env(safe-area-inset-left, 8px)); padding-right: max(8px, env(safe-area-inset-right, 8px)); display: flex; flex-direction: column; overflow: hidden; min-height: 0;">
                <div id="fs-chart-container" style="flex: 1; background: rgba(20,20,30,0.6); border-radius: 8px; padding: 8px; border: 1px solid rgba(255,255,255,0.08); position: relative; overflow: hidden; min-height: 0; touch-action: none; width: 100%;">
                    <canvas id="fs-chart-canvas" style="width: 100%; height: 100%; display: block; touch-action: none;"></canvas>
                </div>
            </div>
            <style>
                .fs-macro-tf-dropdown { position: relative; }
                .fs-macro-tf-selector {
                    display: flex; align-items: center; gap: 6px;
                    padding: 6px 12px; background: rgba(255,255,255,0.1);
                    border: 1px solid rgba(255,255,255,0.15); border-radius: 8px;
                    cursor: pointer; transition: all 0.3s; color: white;
                    font-size: 12px; font-weight: 600; white-space: nowrap;
                }
                .fs-macro-tf-selector:hover { border-color: #3b82f6; background: rgba(99,102,241,0.15); }
                .fs-macro-tf-arrow { color: #a1a1aa; font-size: 10px; transition: transform 0.3s; }
                .fs-macro-tf-dropdown.open .fs-macro-tf-arrow { transform: rotate(180deg); }
                .fs-macro-tf-options {
                    position: absolute; top: calc(100% + 4px); left: 50%;
                    transform: translateX(-50%) translateY(-8px); min-width: 160px;
                    background: #1a1a2e; border: 1px solid rgba(255,255,255,0.15);
                    border-radius: 10px; overflow: hidden; opacity: 0; visibility: hidden;
                    transition: all 0.25s ease; z-index: 9999;
                    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
                }
                .fs-macro-tf-dropdown.open .fs-macro-tf-options { opacity: 1; visibility: visible; transform: translateX(-50%) translateY(0); }
                .fs-macro-tf-option {
                    padding: 10px 14px; font-size: 13px; font-weight: 500; color: #a1a1aa;
                    cursor: pointer; transition: all 0.2s; display: flex;
                    align-items: center; justify-content: space-between;
                }
                .fs-macro-tf-option:hover { background: rgba(99,102,241,0.15); color: white; }
                .fs-macro-tf-option.active { background: #3b82f6; color: white; }
                .fs-macro-tf-check { opacity: 0; font-size: 11px; }
                .fs-macro-tf-option.active .fs-macro-tf-check { opacity: 1; }
                .fs-type-btn {
                    padding: 6px 10px;
                    background: rgba(255,255,255,0.05);
                    border: 1px solid rgba(255,255,255,0.1);
                    border-radius: 8px;
                    color: #888;
                    font-size: 11px;
                    font-weight: 600;
                    cursor: pointer;
                }
                .fs-type-btn:hover { background: rgba(255,255,255,0.1); color: white; }
                .fs-type-btn.active { background: #3b82f6; border-color: #3b82f6; color: white; }
            </style>
        `;
        
        document.body.appendChild(fsModal);
        
        // Setup touch zoom/pan on fullscreen canvas
        const fsCanvas = document.getElementById('fs-chart-canvas');
        if (fsCanvas) setupFullscreenTouchHandlers(fsCanvas, symbol);
        
        // Aguardar a rotação landscape completar + modal renderizar (300ms)
        // Se não tem dados, carregar novamente
        setTimeout(async () => {
            resetFsZoom();
            if (indicatorCandleData && indicatorCandleData.length > 0) {
                if (indicatorChartType === 'candle') {
                    drawFullscreenCandleChart(indicatorCandleData, symbol);
                } else {
                    drawFullscreenLineChart(indicatorCandleData, symbol);
                }
            } else {
                // Carregar dados se não existem
                await loadFullscreenChartData(symbol);
            }
        }, 300);
        
        // Event listeners
        document.getElementById('close-fs-btn').addEventListener('click', async () => {
            const fsSymbol = window._lastFSSymbol || null;
            fsModal.remove();
            // Restaurar portrait (igual ao HOME)
            try {
                if (window.lockPortrait) await window.lockPortrait();
                if (window.Capacitor && window.Capacitor.Plugins) {
                    if (window.Capacitor.Plugins.Fullscreen) await window.Capacitor.Plugins.Fullscreen.exitFullscreen();
                    if (window.Capacitor.Plugins.StatusBar) await window.Capacitor.Plugins.StatusBar.show();
                }
            } catch (e) { /* console.log('Restore portrait error:', e); */ }
            // Reabrir modal do indicador após fechar fullscreen
            if (fsSymbol) {
                setTimeout(() => openIndicatorModal(fsSymbol), 100);
            }
        });
        
        // Fullscreen timeframe dropdown
        const fsMacroTfSelector = document.getElementById('fs-macro-tf-selector');
        const fsMacroTfDropdown = document.getElementById('fs-macro-tf-dropdown');
        if (fsMacroTfSelector) {
            fsMacroTfSelector.addEventListener('click', () => fsMacroTfDropdown.classList.toggle('open'));
        }
        document.querySelectorAll('.fs-macro-tf-option').forEach(opt => {
            opt.addEventListener('click', async function() {
                document.querySelectorAll('.fs-macro-tf-option').forEach(o => o.classList.remove('active'));
                this.classList.add('active');
                const period = this.dataset.period;
                const shortLabel = {'15m':'15m','30m':'30m','4h':'4H','1d':'1D','1w':'1S','1M':'1M','6M':'6M','1Y':'1A'}[period] || period;
                document.getElementById('fs-macro-tf-label').textContent = shortLabel;
                fsMacroTfDropdown.classList.remove('open');
                indicatorChartPeriod = period;
                // Force loading state
                const canvas = document.getElementById('fs-chart-canvas');
                if (canvas) {
                    const ctx = canvas.getContext('2d');
                    ctx.setTransform(1, 0, 0, 1, 0, 0);
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    ctx.fillStyle = '#0d0d1a';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    const rect = canvas.parentElement.getBoundingClientRect();
                    ctx.fillStyle = '#3b82f6';
                    ctx.font = '14px Inter, sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText('Carregando...', rect.width / 2, rect.height / 2);
                }
                indicatorCandleData = null;
                await loadFullscreenChartData(symbol);
            });
        });
        // Close dropdown on outside click
        fsModal.addEventListener('click', function(e) {
            if (fsMacroTfDropdown && !fsMacroTfDropdown.contains(e.target)) fsMacroTfDropdown.classList.remove('open');
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

    // ============================================
    // FULLSCREEN CHART ZOOM/PAN (Data-level, igual HOME)
    // ============================================
    let macroFsZoom = 1;
    let macroFsPanX = 0;
    let macroFsIsDragging = false;
    let macroFsLastX = 0;
    let macroFsPinchStartDist = 0;
    let macroFsPinchStartZoom = 1;
    let macroFsIsPinching = false;

    function resetFsZoom() {
        macroFsZoom = 1;
        macroFsPanX = 0;
        macroFsIsDragging = false;
        macroFsLastX = 0;
        macroFsPinchStartDist = 0;
        macroFsPinchStartZoom = 1;
        macroFsIsPinching = false;
    }

    function setupFullscreenTouchHandlers(canvas, symbol) {
        resetFsZoom();

        canvas.addEventListener('touchstart', function(e) {
            if (e.touches.length === 1) {
                macroFsIsDragging = true;
                macroFsLastX = e.touches[0].clientX;
            } else if (e.touches.length === 2) {
                macroFsIsPinching = true;
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                macroFsPinchStartDist = Math.sqrt(dx * dx + dy * dy);
                macroFsPinchStartZoom = macroFsZoom;
            }
            e.preventDefault();
        }, { passive: false });

        canvas.addEventListener('touchmove', function(e) {
            if (e.touches.length === 1 && macroFsIsDragging) {
                const deltaX = e.touches[0].clientX - macroFsLastX;
                macroFsPanX = Math.max(0, macroFsPanX - deltaX * macroFsZoom);
                macroFsLastX = e.touches[0].clientX;
                redrawFullscreenChart(symbol);
            } else if (e.touches.length === 2) {
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const scale = dist / macroFsPinchStartDist;
                macroFsZoom = Math.max(1, Math.min(10, macroFsPinchStartZoom * scale));
                redrawFullscreenChart(symbol);
            }
            e.preventDefault();
        }, { passive: false });

        canvas.addEventListener('touchend', function(e) {
            if (e.touches.length === 0) {
                setTimeout(() => { macroFsIsDragging = false; macroFsIsPinching = false; }, 50);
            } else if (e.touches.length === 1) {
                macroFsIsPinching = false;
            }
        });

        // Double tap to reset zoom
        let lastTap = 0, tapCount = 0;
        canvas.addEventListener('touchend', function(e) {
            if (macroFsIsPinching || e.touches.length > 0) return;
            const now = Date.now();
            if (now - lastTap < 300) {
                tapCount++;
                if (tapCount === 2) {
                    macroFsZoom = 1;
                    macroFsPanX = 0;
                    redrawFullscreenChart(symbol);
                    tapCount = 0;
                }
            } else {
                tapCount = 1;
            }
            lastTap = now;
        });
    }

    function redrawFullscreenChart(symbol) {
        if (!indicatorCandleData || indicatorCandleData.length === 0) return;
        if (indicatorChartType === 'candle') {
            drawFullscreenCandleChart(indicatorCandleData, symbol);
        } else {
            drawFullscreenLineChart(indicatorCandleData, symbol);
        }
    }

    async function loadFullscreenChartData(symbol) {
        const periodMap = {
            '15m': { interval: '1m', range: '1d' },
            '30m': { interval: '5m', range: '1d' },
            '4h': { interval: '5m', range: '1d' },
            '1d': { interval: '15m', range: '1d' },
            '1w': { interval: '1h', range: '5d' },
            '1M': { interval: '1d', range: '1mo' },
            '6M': { interval: '1d', range: '6mo' },
            '1Y': { interval: '1wk', range: '1y' }
        };
        
        const config = periodMap[indicatorChartPeriod] || periodMap['1d'];
        const encodedSymbol = encodeURIComponent(symbol);
        
        // Verificar cache
        const cacheKey = getChartCacheKey(symbol, indicatorChartPeriod);
        const cached = chartDataCache[cacheKey];
        if (cached && (Date.now() - cached.timestamp) < CHART_CACHE_TTL) {
            macroLog(`📦 Fullscreen ${symbol} (${indicatorChartPeriod}) do cache`, 'info');
            indicatorCandleData = cached.data;
            if (indicatorChartType === 'candle') {
                drawFullscreenCandleChart(indicatorCandleData, symbol);
            } else {
                drawFullscreenLineChart(indicatorCandleData, symbol);
            }
            return;
        }
        
        const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodedSymbol}?interval=${config.interval}&range=${config.range}`;
        
        try {
            let data = null;
            
            // Tentativa 1: Fetch direto (Android WebView não tem restrição CORS)
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 5000);
                const directResponse = await fetch(yahooUrl, { signal: controller.signal });
                clearTimeout(timeout);
                if (directResponse.ok) {
                    data = await directResponse.json();
                    if (!data?.chart?.result?.[0]) data = null;
                }
            } catch (e) { /* proxy fallback abaixo */ }
            
            // Tentativa 2: Proxies CORS
            if (!data || !data?.chart?.result?.[0]) {
                const proxyUrls = [
                    `https://api.allorigins.win/raw?url=${encodeURIComponent(yahooUrl)}`,
                    `https://corsproxy.io/?${encodeURIComponent(yahooUrl)}`,
                    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(yahooUrl)}`,
                ];
                for (const url of proxyUrls) {
                    try {
                        const controller = new AbortController();
                        const timeout = setTimeout(() => controller.abort(), 6000);
                        const response = await fetch(url, { signal: controller.signal });
                        clearTimeout(timeout);
                        if (response.ok) {
                            data = await response.json();
                            if (data?.chart?.result?.[0]) break;
                        }
                    } catch (e) {
                        continue;
                    }
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
                
                // Salvar no cache
                chartDataCache[cacheKey] = { data: indicatorCandleData, timestamp: Date.now() };
                
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
        if (!canvas) {
            macroLog('❌ Canvas fullscreen não encontrado', 'error');
            return;
        }
        
        const container = document.getElementById('fs-chart-container');
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const containerRect = (container || canvas.parentElement).getBoundingClientRect();
        const width = containerRect.width || window.innerWidth;
        const height = containerRect.height || (window.innerHeight - 100);
        
        if (width < 100 || height < 50) {
            macroLog(`⏳ Fullscreen aguardando dimensões: ${width}x${height}`, 'warn');
            setTimeout(() => drawFullscreenLineChart(candleData, symbol), 100);
            return;
        }
        
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
        
        ctx.fillStyle = '#0a0a0f';
        ctx.fillRect(0, 0, width, height);
        
        // Data-level zoom: show fewer data points when zoomed in
        const visibleCount = Math.floor(candleData.length / macroFsZoom);
        const startIdx = Math.max(0, Math.min(
            candleData.length - visibleCount,
            Math.floor(macroFsPanX / (width / candleData.length))
        ));
        const endIdx = Math.min(candleData.length, startIdx + visibleCount);
        const visibleData = candleData.slice(startIdx, endIdx);
        
        if (visibleData.length === 0) {
            ctx.fillStyle = '#888';
            ctx.font = '14px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Sem dados disponíveis', width / 2, height / 2);
            return;
        }
        
        const padding = { top: 15, right: 65, bottom: 35, left: 10 };
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;
        
        const closes = visibleData.map(c => c[4]);
        const minPrice = Math.min(...closes);
        const maxPrice = Math.max(...closes);
        const priceRange = (maxPrice - minPrice) || maxPrice * 0.01;
        const paddedMin = minPrice - priceRange * 0.05;
        const paddedMax = maxPrice + priceRange * 0.05;
        const paddedRange = paddedMax - paddedMin;
        
        const config = MARKET_INDICATORS[symbol];
        const color = config?.color || '#3b82f6';
        const isPositive = closes[closes.length - 1] >= closes[0];
        
        // Grid horizontal
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 5; i++) {
            const y = padding.top + (chartHeight * i / 5);
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(width - padding.right, y);
            ctx.stroke();
        }
        
        // Grid vertical
        const timeGridCount = Math.min(8, visibleData.length);
        const timeGridSpacing = Math.floor(visibleData.length / timeGridCount);
        for (let i = 0; i < visibleData.length; i += Math.max(1, timeGridSpacing)) {
            const x = padding.left + (i / Math.max(1, visibleData.length - 1)) * chartWidth;
            ctx.beginPath();
            ctx.moveTo(x, padding.top);
            ctx.lineTo(x, padding.top + chartHeight);
            ctx.stroke();
        }
        
        // Line chart
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        
        closes.forEach((close, i) => {
            const x = padding.left + (i / Math.max(1, closes.length - 1)) * chartWidth;
            const y = padding.top + ((paddedMax - close) / paddedRange) * chartHeight;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();
        
        // Gradient fill
        const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartHeight);
        gradient.addColorStop(0, color + '4D');
        gradient.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.lineTo(padding.left + chartWidth, padding.top + chartHeight);
        ctx.lineTo(padding.left, padding.top + chartHeight);
        ctx.closePath();
        ctx.fillStyle = gradient;
        ctx.fill();
        
        // Determine if dollar indicator
        const isDollarAsset = symbol.includes('=F') || symbol === '^GSPC' || symbol === '^DJI';
        
        // Price labels (right side)
        ctx.fillStyle = '#aaa';
        ctx.font = '9px -apple-system, sans-serif';
        ctx.textAlign = 'right';
        for (let i = 0; i <= 5; i++) {
            const price = paddedMax - (paddedRange * i / 5);
            const y = padding.top + (chartHeight * i / 5);
            let formatted;
            if (isDollarAsset) {
                formatted = price >= 1000 ? `$${(price/1000).toFixed(1)}k` : `$${price.toFixed(price < 1 ? 4 : 2)}`;
            } else {
                formatted = price >= 10000 ? price.toFixed(0) : price >= 100 ? price.toFixed(1) : price.toFixed(2);
            }
            ctx.fillText(formatted, width - 15, y + 3);
        }
        
        // Time labels
        ctx.fillStyle = '#666';
        ctx.font = '8px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        for (let i = 0; i < visibleData.length; i += Math.max(1, timeGridSpacing)) {
            const x = padding.left + (i / Math.max(1, visibleData.length - 1)) * chartWidth;
            const date = new Date(visibleData[i][0]);
            let label;
            if (['15m', '30m', '4h', '1d'].includes(indicatorChartPeriod)) {
                label = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            } else if (['1w', '1M'].includes(indicatorChartPeriod)) {
                label = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
            } else {
                label = date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
            }
            ctx.fillText(label, x, height - 20);
        }
        
        // Current price line
        const lastPrice = closes[closes.length - 1];
        const lastY = padding.top + ((paddedMax - lastPrice) / paddedRange) * chartHeight;
        ctx.strokeStyle = color;
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padding.left, lastY);
        ctx.lineTo(width - padding.right, lastY);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Current price badge
        ctx.fillStyle = color;
        ctx.fillRect(width - padding.right, lastY - 8, padding.right - 3, 16);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 8px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        let priceLabel;
        if (isDollarAsset) {
            priceLabel = lastPrice >= 1000 ? `$${(lastPrice/1000).toFixed(1)}k` : `$${lastPrice.toFixed(lastPrice < 1 ? 3 : 2)}`;
        } else {
            priceLabel = lastPrice >= 10000 ? lastPrice.toFixed(0) : lastPrice >= 100 ? lastPrice.toFixed(1) : lastPrice.toFixed(2);
        }
        ctx.fillText(priceLabel, width - padding.right/2 - 1, lastY + 3);
        
        // Zoom indicator
        if (macroFsZoom > 1) {
            ctx.fillStyle = 'rgba(99, 102, 241, 0.8)';
            ctx.fillRect(10, 10, 60, 24);
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 11px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`${macroFsZoom.toFixed(1)}x`, 40, 26);
        }
    }

    function drawFullscreenCandleChart(candleData, symbol) {
        const canvas = document.getElementById('fs-chart-canvas');
        if (!canvas) {
            macroLog('❌ Canvas fullscreen candle não encontrado', 'error');
            return;
        }
        
        const container = document.getElementById('fs-chart-container');
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const containerRect = (container || canvas.parentElement).getBoundingClientRect();
        const width = containerRect.width || window.innerWidth;
        const height = containerRect.height || (window.innerHeight - 100);
        
        if (width < 100 || height < 50) {
            setTimeout(() => drawFullscreenCandleChart(candleData, symbol), 100);
            return;
        }
        
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
        
        ctx.fillStyle = '#0a0a0f';
        ctx.fillRect(0, 0, width, height);
        
        // Data-level zoom
        const visibleCount = Math.floor(candleData.length / macroFsZoom);
        const startIdx = Math.max(0, Math.min(
            candleData.length - visibleCount,
            Math.floor(macroFsPanX / (width / candleData.length))
        ));
        const endIdx = Math.min(candleData.length, startIdx + visibleCount);
        const visibleData = candleData.slice(startIdx, endIdx);
        
        if (visibleData.length === 0) {
            ctx.fillStyle = '#888';
            ctx.font = '14px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Sem dados disponíveis', width / 2, height / 2);
            return;
        }
        
        const padding = { top: 15, right: 65, bottom: 35, left: 10 };
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;
        
        // Price range from visible data
        let minPrice = Infinity, maxPrice = -Infinity;
        visibleData.forEach(c => {
            minPrice = Math.min(minPrice, c[3]);
            maxPrice = Math.max(maxPrice, c[2]);
        });
        const priceRange = (maxPrice - minPrice) || maxPrice * 0.01;
        const paddedMin = minPrice - priceRange * 0.05;
        const paddedMax = maxPrice + priceRange * 0.05;
        const paddedRange = paddedMax - paddedMin;
        
        // Grid horizontal
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 5; i++) {
            const y = padding.top + (chartHeight * i / 5);
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(width - padding.right, y);
            ctx.stroke();
        }
        
        // Grid vertical
        const timeGridCount = Math.min(8, visibleData.length);
        const timeGridSpacing = Math.floor(visibleData.length / timeGridCount);
        for (let i = 0; i < visibleData.length; i += Math.max(1, timeGridSpacing)) {
            const x = padding.left + (i / Math.max(1, visibleData.length - 1)) * chartWidth;
            ctx.beginPath();
            ctx.moveTo(x, padding.top);
            ctx.lineTo(x, padding.top + chartHeight);
            ctx.stroke();
        }
        
        // Draw candles
        const spacing = chartWidth / visibleData.length;
        const candleW = Math.max(2, Math.min(12, spacing * 0.7));
        
        visibleData.forEach((candle, i) => {
            const [timestamp, open, high, low, close] = candle;
            if (isNaN(open) || isNaN(close)) return;
            const isGreen = close >= open;
            const color = isGreen ? '#22c55e' : '#ef4444';
            
            const x = padding.left + (i * spacing) + spacing / 2;
            const highY = padding.top + ((paddedMax - high) / paddedRange) * chartHeight;
            const lowY = padding.top + ((paddedMax - low) / paddedRange) * chartHeight;
            const openY = padding.top + ((paddedMax - open) / paddedRange) * chartHeight;
            const closeY = padding.top + ((paddedMax - close) / paddedRange) * chartHeight;
            
            // Wick
            ctx.strokeStyle = color;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, highY);
            ctx.lineTo(x, lowY);
            ctx.stroke();
            
            // Body
            ctx.fillStyle = color;
            ctx.fillRect(x - candleW / 2, Math.min(openY, closeY), candleW, Math.max(Math.abs(closeY - openY), 1));
        });
        
        // Determine if dollar indicator
        const isDollarAsset = symbol.includes('=F') || symbol === '^GSPC' || symbol === '^DJI';
        
        // Price labels (right side)
        ctx.fillStyle = '#aaa';
        ctx.font = '9px -apple-system, sans-serif';
        ctx.textAlign = 'right';
        for (let i = 0; i <= 5; i++) {
            const price = paddedMax - (paddedRange * i / 5);
            const y = padding.top + (chartHeight * i / 5);
            let formatted;
            if (isDollarAsset) {
                formatted = price >= 1000 ? `$${(price/1000).toFixed(1)}k` : `$${price.toFixed(price < 1 ? 4 : 2)}`;
            } else {
                formatted = price >= 10000 ? price.toFixed(0) : price >= 100 ? price.toFixed(1) : price.toFixed(2);
            }
            ctx.fillText(formatted, width - 15, y + 3);
        }
        
        // Time labels
        ctx.fillStyle = '#666';
        ctx.font = '8px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        for (let i = 0; i < visibleData.length; i += Math.max(1, timeGridSpacing)) {
            const x = padding.left + (i * spacing) + spacing / 2;
            const date = new Date(visibleData[i][0]);
            let label;
            if (['15m', '30m', '4h', '1d'].includes(indicatorChartPeriod)) {
                label = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            } else if (['1w', '1M'].includes(indicatorChartPeriod)) {
                label = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
            } else {
                label = date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
            }
            ctx.fillText(label, x, height - 20);
        }
        
        // Current price line
        const lastClose = visibleData[visibleData.length - 1][4];
        const lastY = padding.top + ((paddedMax - lastClose) / paddedRange) * chartHeight;
        const config = MARKET_INDICATORS[symbol];
        const lineColor = config?.color || '#3b82f6';
        ctx.strokeStyle = lineColor;
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padding.left, lastY);
        ctx.lineTo(width - padding.right, lastY);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Current price badge
        ctx.fillStyle = lineColor;
        ctx.fillRect(width - padding.right, lastY - 8, padding.right - 3, 16);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 8px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        let priceLabel;
        if (isDollarAsset) {
            priceLabel = lastClose >= 1000 ? `$${(lastClose/1000).toFixed(1)}k` : `$${lastClose.toFixed(lastClose < 1 ? 3 : 2)}`;
        } else {
            priceLabel = lastClose >= 10000 ? lastClose.toFixed(0) : lastClose >= 100 ? lastClose.toFixed(1) : lastClose.toFixed(2);
        }
        ctx.fillText(priceLabel, width - padding.right/2 - 1, lastY + 3);
        
        // Zoom indicator
        if (macroFsZoom > 1) {
            ctx.fillStyle = 'rgba(99, 102, 241, 0.8)';
            ctx.fillRect(10, 10, 60, 24);
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 11px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`${macroFsZoom.toFixed(1)}x`, 40, 26);
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
    
    // Cache de dados de gráfico para evitar re-fetch ao trocar timeframes
    const chartDataCache = {};
    const CHART_CACHE_TTL = 5 * 60 * 1000; // 5 minutos
    
    function getChartCacheKey(symbol, period) {
        return `${symbol}_${period}`;
    }
    
    async function loadIndicatorChartData(symbol) {
        macroLog('🚀 loadIndicatorChartData para: ' + symbol, 'info');
        
        const loadingEl = document.getElementById('macro-chart-loading');
        const canvas = document.getElementById('macro-chart-canvas');
        
        if (!canvas) {
            macroLog('❌ Canvas não encontrado', 'error');
            return;
        }
        
        if (loadingEl) loadingEl.style.display = 'flex';
        
        // Verificar cache
        const cacheKey = getChartCacheKey(symbol, indicatorChartPeriod);
        const cached = chartDataCache[cacheKey];
        if (cached && (Date.now() - cached.timestamp) < CHART_CACHE_TTL) {
            macroLog(`📦 Gráfico ${symbol} (${indicatorChartPeriod}) do cache`, 'info');
            indicatorCandleData = cached.data;
            loadingEl.style.display = 'none';
            if (indicatorChartType === 'candle') {
                drawIndicatorCandleChart(indicatorCandleData, symbol);
            } else {
                drawIndicatorLineChart(indicatorCandleData, symbol);
            }
            return;
        }
        
        loadingEl.style.display = 'flex';
        
        try {
            // Mapear período para Yahoo Finance
            const periodMap = {
                '15m': { interval: '1m', range: '1d' },    // 1min candles, último dia
                '30m': { interval: '5m', range: '1d' },    // 5min candles, último dia
                '4h': { interval: '5m', range: '1d' },     // 5min candles, último dia
                '1d': { interval: '15m', range: '1d' },    // 15min candles, último dia
                '1w': { interval: '1h', range: '5d' },     // 1h candles, 5 dias
                '1M': { interval: '1d', range: '1mo' },    // 1 dia candles, 1 mês
                '6M': { interval: '1d', range: '6mo' },    // 1 dia candles, 6 meses
                '1Y': { interval: '1wk', range: '1y' },    // 1 semana candles, 1 ano
            };
            
            const config = periodMap[indicatorChartPeriod] || periodMap['1d'];
            
            const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${config.interval}&range=${config.range}`;
            
            macroLog(`📊 Carregando gráfico: ${symbol} (${config.interval}/${config.range})`, 'info');
            
            let data = null;
            
            // Tentativa 1: Fetch direto (funciona em Android WebView sem restrição de CORS)
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 5000);
                const directResponse = await fetch(yahooUrl, { signal: controller.signal });
                clearTimeout(timeout);
                if (directResponse.ok) {
                    data = await directResponse.json();
                    if (data?.chart?.result?.[0]) {
                        macroLog('✅ Gráfico via fetch direto', 'success');
                    } else { data = null; }
                }
            } catch (e) {
                macroLog('⚠️ Fetch direto falhou, tentando proxies...', 'warn');
            }
            
            // Tentativa 2: Proxies CORS (para web/debug)
            if (!data || !data?.chart?.result?.[0]) {
                const proxyUrls = [
                    `https://api.allorigins.win/raw?url=${encodeURIComponent(yahooUrl)}`,
                    `https://corsproxy.io/?${encodeURIComponent(yahooUrl)}`,
                    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(yahooUrl)}`,
                ];
                for (const url of proxyUrls) {
                    try {
                        const controller = new AbortController();
                        const timeout = setTimeout(() => controller.abort(), 6000);
                        const response = await fetch(url, { signal: controller.signal });
                        clearTimeout(timeout);
                        if (response.ok) {
                            data = await response.json();
                            if (data?.chart?.result?.[0]) break;
                        }
                    } catch (e) {
                        continue;
                    }
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
                
                // Salvar no cache
                chartDataCache[cacheKey] = { data: indicatorCandleData, timestamp: Date.now() };
                
                macroLog('✅ Dados prontos! Candles: ' + indicatorCandleData.length, 'success');
                
                // Esconder loading ANTES de desenhar
                loadingEl.style.display = 'none';
                
                if (indicatorChartType === 'candle') {
                    macroLog('📊 Chamando drawIndicatorCandleChart...', 'info');
                    drawIndicatorCandleChart(indicatorCandleData);
                } else {
                    macroLog('📊 Chamando drawIndicatorLineChart...', 'info');
                    drawIndicatorLineChart(indicatorCandleData);
                }
                macroLog('✅ Desenho concluído!', 'success');
            } else {
                throw new Error('Sem dados disponíveis');
            }
        } catch (e) {
            macroLog('❌ Erro gráfico: ' + e.message, 'error');
            const container = document.getElementById('macro-chart-container');
            const loadingEl = document.getElementById('macro-chart-loading');
            if (loadingEl) loadingEl.style.display = 'none';
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
    }

    // ============================================
    // DESENHAR GRÁFICO DE LINHA - v22.0 (igual HOME)
    // ============================================
    function drawIndicatorLineChart(candleData) {
        const canvas = document.getElementById('macro-chart-canvas');
        const container = document.getElementById('macro-chart-container');
        const loadingEl = document.getElementById('macro-chart-loading');
        
        macroLog('🎨 Desenhando gráfico...', 'info');
        
        if (!canvas || !container) {
            macroLog('❌ Canvas/Container não encontrado', 'error');
            return;
        }
        
        // Esconder loading
        if (loadingEl) loadingEl.style.display = 'none';
        
        // Usar getBoundingClientRect como na HOME
        const rect = container.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height;
        
        if (width <= 0 || height <= 0) {
            macroLog('❌ Container sem dimensões', 'error');
            return;
        }
        
        // DPR para telas de alta resolução
        const dpr = window.devicePixelRatio || 1;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';
        
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        
        macroLog(`📐 Canvas: ${width}x${height} (DPR: ${dpr})`, 'info');
        
        // Fundo
        ctx.fillStyle = '#0d0d1a';
        ctx.fillRect(0, 0, width, height);
        
        const closes = candleData.map(c => c[4]);
        const timestamps = candleData.map(c => c[0]);
        
        const minPrice = Math.min(...closes) * 0.999;
        const maxPrice = Math.max(...closes) * 1.001;
        const priceRange = maxPrice - minPrice || 1;
        
        const padding = { top: 15, right: 10, bottom: 25, left: 50 };
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;
        
        // Grid
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
            ctx.font = '9px Inter, sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText('$' + price.toFixed(2), padding.left - 5, y + 3);
        }
        
        // Linha do gráfico
        const config = MARKET_INDICATORS[currentIndicatorSymbol];
        const color = config?.color || '#3b82f6';
        
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        
        closes.forEach((close, i) => {
            const x = padding.left + (i / Math.max(1, closes.length - 1)) * chartWidth;
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
        ctx.font = '9px Inter, sans-serif';
        ctx.textAlign = 'center';
        
        const numLabels = 5;
        const step = Math.max(1, Math.floor((timestamps.length - 1) / (numLabels - 1)));
        for (let i = 0; i < timestamps.length; i += step) {
            const x = padding.left + (i / Math.max(1, timestamps.length - 1)) * chartWidth;
            const date = new Date(timestamps[i]);
            let label;
            if (indicatorChartPeriod === '1d' || indicatorChartPeriod === '15m' || indicatorChartPeriod === '30m' || indicatorChartPeriod === '4h') {
                label = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            } else {
                label = date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
            }
            ctx.fillText(label, x, height - 8);
        }
        
        macroLog('✅ Gráfico desenhado!', 'success');
    }

    // ============================================
    // DESENHAR GRÁFICO DE CANDLES - v22.0 (igual HOME)
    // ============================================
    function drawIndicatorCandleChart(candleData) {
        const canvas = document.getElementById('macro-chart-canvas');
        const container = document.getElementById('macro-chart-container');
        const loadingEl = document.getElementById('macro-chart-loading');
        
        if (!canvas || !container) {
            macroLog('❌ Canvas/Container não encontrado', 'error');
            return;
        }
        
        // Esconder loading
        if (loadingEl) loadingEl.style.display = 'none';
        
        // Usar getBoundingClientRect como na HOME
        const rect = container.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height;
        
        if (width <= 0 || height <= 0) {
            macroLog('❌ Container sem dimensões', 'error');
            return;
        }
        
        // DPR para telas de alta resolução
        const dpr = window.devicePixelRatio || 1;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';
        
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        
        macroLog(`📐 Candles: ${width}x${height} (DPR: ${dpr})`, 'info');
        
        const padding = { top: 15, right: 10, bottom: 25, left: 50 };
        
        // Limpar canvas
        ctx.clearRect(0, 0, width, height);
        
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
        
        macroLog('✅ Gráfico de candles desenhado!', 'success');
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
        const prefix = config.prefix || '$';
        const decimals = config.decimals || 2;
        
        // Obter Máxima e Mínima REAIS dos candles (Yahoo Finance data)
        let high = null;
        let low = null;
        if (indicatorCandleData && indicatorCandleData.length > 0) {
            // indicatorCandleData format: [timestamp, open, high, low, close, volume]
            high = Math.max(...indicatorCandleData.map(c => c[2]).filter(v => v > 0));
            low = Math.min(...indicatorCandleData.filter(c => c[3] > 0).map(c => c[3]));
        }
        
        container.innerHTML = `
            <div style="background: rgba(255,255,255,0.05); padding: 12px; border-radius: 10px;">
                <div style="color: #888; font-size: 11px;">Abertura</div>
                <div style="font-weight: 600; color: white;">${prefix}${prevPrice.toFixed(decimals)}</div>
            </div>
            <div style="background: rgba(255,255,255,0.05); padding: 12px; border-radius: 10px;">
                <div style="color: #888; font-size: 11px;">Fech. Anterior</div>
                <div style="font-weight: 600; color: white;">${prefix}${prevPrice.toFixed(decimals)}</div>
            </div>
            <div style="background: rgba(255,255,255,0.05); padding: 12px; border-radius: 10px;">
                <div style="color: #888; font-size: 11px;">Máxima</div>
                <div style="font-weight: 600; color: #00ff88;">${high !== null ? prefix + high.toFixed(decimals) : '--'}</div>
            </div>
            <div style="background: rgba(255,255,255,0.05); padding: 12px; border-radius: 10px;">
                <div style="color: #888; font-size: 11px;">Mínima</div>
                <div style="font-weight: 600; color: #ff4444;">${low !== null ? prefix + low.toFixed(decimals) : '--'}</div>
            </div>
        `;
    }

    // ============================================
    // ANÁLISE TÉCNICA - DADOS REAIS VIA YAHOO FINANCE
    // ============================================
    async function openIndicatorTA(symbol) {
        const config = MARKET_INDICATORS[symbol];
        const price = indicatorPrices[symbol] || 0;
        const change = indicatorChanges[symbol] || 0;
        const imgSize = config.imgSize || 56;
        
        // Salvar símbolo para back button poder reabrir o modal do indicador
        window._lastTASymbol = symbol;
        
        // IMPORTANTE: Fechar o indicator-modal ao abrir TA para que o botão voltar funcione corretamente
        const indicatorModal = document.getElementById('indicator-modal');
        if (indicatorModal) {
            indicatorModal.remove();
            document.body.style.overflow = '';
        }
        
        const oldModal = document.getElementById('indicator-ta-modal');
        if (oldModal) oldModal.remove();
        
        const taModal = document.createElement('div');
        taModal.id = 'indicator-ta-modal';
        taModal.className = 'modal active';
        taModal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: var(--bg-primary, #0d0d1a); z-index: 10000; display: flex; flex-direction: column;';
        
        // Show loading first
        taModal.innerHTML = `
            <div style="background: var(--bg-secondary, #1a1a2e); padding: calc(env(safe-area-inset-top, 20px) + 16px) 16px 16px 16px; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; align-items: center; gap: 12px; flex-shrink: 0;">
                <button id="close-ta-btn" style="background: rgba(255,255,255,0.1); border: none; width: 40px; height: 40px; border-radius: 50%; color: white; font-size: 18px; cursor: pointer; display: flex; align-items: center; justify-content: center;">
                    <i class="fas fa-arrow-left"></i>
                </button>
                <h3 style="margin: 0; font-size: 18px; color: white; flex: 1;">Análise Técnica - ${config.short}</h3>
            </div>
            <div id="ta-content" style="flex: 1; overflow-y: auto; padding: 16px;">
                <div style="text-align: center; padding: 40px 0;">
                    <i class="fas fa-spinner fa-spin" style="font-size: 32px; color: ${config.color}; margin-bottom: 12px;"></i>
                    <p style="color: #888; margin: 0;">Buscando dados reais do mercado...</p>
                </div>
            </div>
        `;
        
        document.body.appendChild(taModal);
        
        document.getElementById('close-ta-btn').addEventListener('click', () => {
            taModal.remove();
            // Reabrir modal do indicador se existia
            if (symbol && !document.getElementById('indicator-modal')) {
                openIndicatorModal(symbol);
            }
        });
        taModal.addEventListener('click', function(e) {
            if (e.target === taModal) {
                taModal.remove();
                if (symbol) openIndicatorModal(symbol);
            }
        });
        
        try {
            // Fetch real data from Yahoo Finance
            const taData = await fetchRealTAData(symbol);
            
            const { rsi, macd, macdSignal, sma20, sma50, support, resistance, trend, trendColor, signal, signalColor, volatility } = taData;
            
            // Re-render with real data
            const contentDiv = document.getElementById('ta-content');
            if (!contentDiv) return;
            contentDiv.innerHTML = `
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
                            <i class="fas fa-chart-bar" style="color: ${config.color};"></i> Indicadores Técnicos
                        </h4>
                        <div style="display: flex; flex-direction: column; gap: 12px;">
                            <div style="display: flex; justify-content: space-between; color: white;">
                                <span style="color: #888;">MACD</span>
                                <span style="color: ${macd > 0 ? '#00ff88' : '#ff4444'};">${macd > 0 ? '+' : ''}${macd.toFixed(4)}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; color: white;">
                                <span style="color: #888;">MACD Signal</span>
                                <span style="color: ${macdSignal > 0 ? '#00ff88' : '#ff4444'};">${macdSignal > 0 ? '+' : ''}${macdSignal.toFixed(4)}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; color: white;">
                                <span style="color: #888;">SMA 20</span>
                                <span style="color: ${price > sma20 ? '#00ff88' : '#ff4444'};">${config.prefix || '$'}${sma20.toFixed(config.decimals || 2)}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; color: white;">
                                <span style="color: #888;">SMA 50</span>
                                <span style="color: ${price > sma50 ? '#00ff88' : '#ff4444'};">${config.prefix || '$'}${sma50.toFixed(config.decimals || 2)}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; color: white;">
                                <span style="color: #888;">Suporte (20d)</span>
                                <span style="color: #00ff88;">${config.prefix || '$'}${support.toFixed(config.decimals || 2)}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; color: white;">
                                <span style="color: #888;">Resistência (20d)</span>
                                <span style="color: #ff4444;">${config.prefix || '$'}${resistance.toFixed(config.decimals || 2)}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; color: white;">
                                <span style="color: #888;">Volatilidade (20d)</span>
                                <span style="color: ${volatility > 30 ? '#ff4444' : '#ffaa00'};">${volatility.toFixed(1)}%</span>
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
                            ${macd > macdSignal ? 'MACD acima da linha de sinal (bullish).' : 'MACD abaixo da linha de sinal (bearish).'}
                        </p>
                    </div>
                    
                    <p style="font-size: 10px; color: #555; text-align: center; margin-top: 12px;">
                        <i class="fas fa-info-circle"></i> Dados reais via Yahoo Finance. Não constitui recomendação de investimento.
                    </p>
            `;
            
        } catch (e) {
            const contentDiv = taModal.querySelector('div > div:last-child');
            contentDiv.innerHTML = `
                <div style="text-align: center; padding: 30px;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 32px; color: #ff4444; margin-bottom: 12px;"></i>
                    <p style="color: #aaa; margin: 0;">Não foi possível buscar dados técnicos reais.</p>
                    <p style="color: #666; font-size: 12px; margin-top: 8px;">${e.message || 'Erro desconhecido'}</p>
                    <button onclick="document.getElementById('indicator-ta-modal').remove(); openIndicatorTA('${symbol}')" style="margin-top: 16px; padding: 10px 20px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; color: white; cursor: pointer;">
                        <i class="fas fa-redo"></i> Tentar novamente
                    </button>
                </div>
            `;
        }
    }
    
    // Fetch real technical analysis data from Yahoo Finance
    async function fetchRealTAData(symbol) {
        // Try Yahoo Finance v8 chart API
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=3mo`;
        
        let data;
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`Yahoo API ${res.status}`);
            data = await res.json();
        } catch(e) {
            // Try with CORS proxy
            const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
            const res = await fetch(proxyUrl);
            if (!res.ok) throw new Error('Dados indisponíveis');
            data = await res.json();
        }
        
        const result = data?.chart?.result?.[0];
        if (!result?.indicators?.quote?.[0]) throw new Error('Sem dados de preço');
        
        const quotes = result.indicators.quote[0];
        const closes = (quotes.close || []).filter(c => c != null && !isNaN(c));
        const highs = (quotes.high || []).filter(h => h != null && !isNaN(h));
        const lows = (quotes.low || []).filter(l => l != null && !isNaN(l));
        
        if (closes.length < 14) throw new Error('Dados insuficientes para análise');
        
        const currentPrice = closes[closes.length - 1];
        const change = indicatorChanges[symbol] || 0;
        
        // Calculate RSI (14 periods) - REAL calculation
        const rsiPeriod = 14;
        let gains = 0, losses = 0;
        const rsiCloses = closes.slice(-rsiPeriod - 1);
        for (let i = 1; i < rsiCloses.length; i++) {
            const diff = rsiCloses[i] - rsiCloses[i - 1];
            if (diff > 0) gains += diff;
            else losses += Math.abs(diff);
        }
        const avgGain = gains / rsiPeriod;
        const avgLoss = losses / rsiPeriod;
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        const rsi = 100 - (100 / (1 + rs));
        
        // Calculate MACD (12, 26, 9) - REAL calculation
        function ema(arr, period) {
            const k = 2 / (period + 1);
            let result = [arr[0]];
            for (let i = 1; i < arr.length; i++) {
                result.push(arr[i] * k + result[i - 1] * (1 - k));
            }
            return result;
        }
        
        const ema12 = ema(closes, 12);
        const ema26 = ema(closes, 26);
        const macdLine = ema12.map((v, i) => v - ema26[i]);
        const signalLine = ema(macdLine, 9);
        const macd = macdLine[macdLine.length - 1];
        const macdSignal = signalLine[signalLine.length - 1];
        
        // Calculate SMA 20 and SMA 50 - REAL
        const sma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, closes.length);
        const sma50 = closes.slice(-50).reduce((a, b) => a + b, 0) / Math.min(50, closes.length);
        
        // Support & Resistance from actual 20-day highs/lows
        const recentHighs = highs.slice(-20);
        const recentLows = lows.slice(-20);
        const support = Math.min(...recentLows);
        const resistance = Math.max(...recentHighs);
        
        // Volatility (20-day annualized)
        const returns = [];
        const volCloses = closes.slice(-21);
        for (let i = 1; i < volCloses.length; i++) {
            returns.push((volCloses[i] - volCloses[i - 1]) / volCloses[i - 1]);
        }
        const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
        const variance = returns.reduce((a, b) => a + Math.pow(b - avgReturn, 2), 0) / returns.length;
        const volatility = Math.sqrt(variance) * Math.sqrt(252) * 100;
        
        // Determine trend and signal
        const trend = currentPrice > sma20 && sma20 > sma50 ? 'ALTA' : currentPrice < sma20 && sma20 < sma50 ? 'BAIXA' : 'LATERAL';
        const trendColor = trend === 'ALTA' ? '#00ff88' : trend === 'BAIXA' ? '#ff4444' : '#ffaa00';
        const signal = rsi < 30 ? 'COMPRA' : rsi > 70 ? 'VENDA' : macd > macdSignal ? 'COMPRA' : 'NEUTRO';
        const signalColor = signal === 'COMPRA' ? '#00ff88' : signal === 'VENDA' ? '#ff4444' : '#ffaa00';
        
        return { rsi, macd, macdSignal, sma20, sma50, support, resistance, trend, trendColor, signal, signalColor, volatility };
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
            
            // Se não conseguiu NENHUM dado da FRED, retornar null (sem dados fake)
            if (!effectiveRate && !targetUpper) {
                macroLog('⚠️ FRED indisponível, sem dados reais disponíveis', 'warn');
                return null; // Vai mostrar mensagem de erro real
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
            
            // Usar cache expirado se disponível, senão retornar null
            if (fedDataCache.effectiveRate) {
                macroLog('⚠️ Usando cache expirado', 'warn');
                return fedDataCache;
            }
            
            macroLog('❌ Sem dados disponíveis para Fed Watch', 'error');
            return null; // Sem dados fake - vai mostrar erro
        }
    }
    
    // ============================================
    // CÁLCULO DE PROBABILIDADES - MODELO CME FEDWATCH
    // Baseado em: taxa atual, inflação, desemprego e ciclo econômico
    // ============================================
    function calculateFedProbabilities(data) {
        const { effectiveRate, targetUpper, targetLower, cpi, unemployment } = data;
        
        if (!effectiveRate && !targetUpper) {
            return null; // Sem dados reais, não inventar probabilidades
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
            return null; // Sem dados suficientes para calcular - não inventar
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
            const lastDecisionEl = document.getElementById('last-fed-decision');
            if (lastDecisionEl) lastDecisionEl.innerHTML = `<span style="color: var(--text-muted);">--</span>`;
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
        
        // Atualizar "Taxa Efetiva" (midpoint) - substitui o antigo "Última Decisão"
        const lastDecisionEl = document.getElementById('last-fed-decision');
        if (lastDecisionEl) {
            // Taxa efetiva = DFF (effective federal funds rate) ou midpoint da banda
            const effectiveRate = fedData.effectiveRate || ((rate.lower + rate.upper) / 2);
            lastDecisionEl.innerHTML = `<span style="color: var(--accent-blue, #3b82f6); font-size: 16px; font-weight: 800;">${effectiveRate.toFixed(2)}%</span>`;
        }
        
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
        const dataSource = fedData.dataSource || 'FRED';
        
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
        'Emprego': 'PAYEMS',
        'Employment': 'PAYEMS',
        'Jobs': 'PAYEMS',
        'GDP': 'GDP',
        'PIB': 'GDP',
        'Retail': 'RSXFS',
        'Varejo': 'RSXFS',
        'ISM': 'NAPM',
        'PMI': 'NAPM',
        'Manufatura Filadélfia': 'GAFDISA066MSFRBPHI',
        'Filadélfia': 'GAFDISA066MSFRBPHI',
        'Philly': 'GAFDISA066MSFRBPHI',
        'Empire State': 'GAFDISA066MSFRBNY',
        'Jobless': 'ICSA',
        'Seguro': 'ICSA',
        'Consumer': 'UMCSENT',
        'Confiança': 'UMCSENT',
        'Sentimento': 'UMCSENT',
        'Michigan': 'UMCSENT',
        'PPI': 'PPIACO',
        'Produtor': 'PPIACO',
        'PCE': 'PCEPI',
        'Housing': 'HOUST',
        'Habitação': 'HOUST',
        'Construção': 'HOUST',
        'Durable': 'DGORDER',
        'Duráveis': 'DGORDER',
        'Industrial': 'INDPRO',
        'Produção Industrial': 'INDPRO',
        'Balança': 'BOPGSTB',
        'Trade': 'BOPGSTB'
    };
    
    // Histórico de decisões do FOMC - carregado dinamicamente via FRED API
    // NÃO usar dados hardcoded - buscar do FRED (DFEDTARU series)
    let FOMC_DECISIONS_HISTORY_CACHE = null;
    
    async function fetchFOMCDecisionsFromFRED() {
        if (FOMC_DECISIONS_HISTORY_CACHE) return FOMC_DECISIONS_HISTORY_CACHE;
        
        try {
            const url = `https://api.stlouisfed.org/fred/series/observations?series_id=DFEDTARU&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=500`;
            let data = null;
            
            const urls = [
                url,
                `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
                `https://corsproxy.io/?${encodeURIComponent(url)}`
            ];
            
            for (const u of urls) {
                try {
                    const resp = await fetch(u, { signal: AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined });
                    if (resp.ok) {
                        data = await resp.json();
                        if (data.observations) break;
                    }
                } catch(e) { continue; }
            }
            
            if (!data || !data.observations) return [];
            
            // Encontrar mudanças de taxa (dados em ordem DESC - mais recente primeiro)
            const decisions = [];
            let prevValue = null;
            
            for (const obs of data.observations) {
                const value = parseFloat(obs.value);
                if (isNaN(value) || String(obs.value).trim() === '.') continue;
                
                if (prevValue !== null && value !== prevValue) {
                    const realChange = prevValue - value; // novo - antigo
                    const changeBps = Math.abs(realChange * 100).toFixed(0);
                    let action = 'Manutenção';
                    if (realChange < 0) action = `Corte ${changeBps}bp`;
                    else if (realChange > 0) action = `Aumento ${changeBps}bp`;
                    
                    decisions.push({
                        date: obs.date,
                        rate: prevValue,
                        previous: value,
                        action: action
                    });
                    if (decisions.length >= 12) break;
                }
                prevValue = value;
            }
            
            FOMC_DECISIONS_HISTORY_CACHE = decisions;
            return decisions;
        } catch(e) {
            macroLog('❌ Erro ao buscar histórico FOMC: ' + e.message, 'error');
            return [];
        }
    }
    
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
            macroLog(`📊 Buscando histórico de decisões FOMC via FRED`, 'info');
            const fomcDecisions = await fetchFOMCDecisionsFromFRED();
            if (fomcDecisions.length > 0) {
                const history = fomcDecisions.slice(0, 6).map(d => ({
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
            return [];
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
        'Import Prices', 'Export Prices', 'Leading Indicators',
        'Philly Fed', 'Philadelphia Fed', 'Empire State', 'Chicago PMI',
        'Beige Book', 'Current Account'
    ];
    
    // Buscar calendário econômico - Fonte primária: Forex Factory (gratuito, dados reais)
    // Fallback: Datas oficiais publicadas pelo BLS/Federal Reserve
    async function fetchEconomicCalendarFromAPI() {
        try {
            // Verificar cache
            if (calendarCache.events && calendarCache.lastUpdate &&
                (Date.now() - calendarCache.lastUpdate) < CALENDAR_CACHE_TTL) {
                macroLog('📦 Usando cache do calendário', 'info');
                return calendarCache.events;
            }
            
            macroLog('🔄 Carregando calendário econômico...', 'info');
            
            // ====== FONTE 1: Forex Factory (dados reais, gratuito) ======
            let events = await fetchCalendarFromForexFactory();
            
            // ====== FONTE 2: FMP API (backup, se disponível) ======
            if (!events || events.length === 0) {
                events = await fetchCalendarFromFMP();
            }
            
            // ====== FONTE 3: Calendário oficial BLS/Fed (sempre funciona) ======
            if (!events || events.length === 0) {
                macroLog('⚠️ APIs indisponíveis, usando calendário oficial BLS/Fed', 'warn');
                return calculateFallbackEvents();
            }
            
            // Atualizar cache
            calendarCache = { events, lastUpdate: Date.now() };
            return events;
            
        } catch (e) {
            macroLog('❌ Erro Calendar: ' + e.message, 'error');
            return calculateFallbackEvents();
        }
    }
    
    // Forex Factory - API gratuita com dados reais de calendário econômico
    async function fetchCalendarFromForexFactory() {
        try {
            const ffUrl = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
            const urls = [
                ffUrl,
                `https://api.allorigins.win/raw?url=${encodeURIComponent(ffUrl)}`,
                `https://corsproxy.io/?${encodeURIComponent(ffUrl)}`
            ];
            
            let data = null;
            for (const url of urls) {
                try {
                    const response = await fetch(url, { signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined });
                    if (!response.ok) continue;
                    const result = await response.json();
                    if (Array.isArray(result) && result.length > 0) {
                        data = result;
                        break;
                    }
                } catch(e) {
                    continue;
                }
            }
            
            if (!data || data.length === 0) return null;
            
            // Filtrar apenas eventos dos EUA com impacto alto/médio
            const today = new Date();
            const usEvents = data.filter(e => {
                if (e.country !== 'USD') return false;
                if (e.impact !== 'High' && e.impact !== 'Medium') return false;
                const eventDate = new Date(e.date);
                return eventDate >= new Date(today.toDateString()); // Hoje ou futuro
            });
            
            if (usEvents.length === 0) return null;
            
            // Converter para nosso formato
            const mappedEvents = usEvents.map(e => {
                const eventDate = new Date(e.date);
                return {
                    day: eventDate.getDate(),
                    month: eventDate.toLocaleDateString('pt-BR', { month: 'short' }).toUpperCase(),
                    time: eventDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false }),
                    title: translateEventName(e.title),
                    fullDate: e.date.split('T')[0],
                    country: 'EUA',
                    impact: e.impact?.toLowerCase() || 'high',
                    hasHistory: true,
                    estimate: e.forecast || null,
                    previous: e.previous || null,
                    actual: null,
                    source: 'Forex Factory'
                };
            });
            
            // Remover duplicatas (mesmo título traduzido no mesmo dia)
            const seenEvents = new Set();
            const events = mappedEvents.filter(e => {
                const key = `${e.title}-${e.fullDate}`;
                if (seenEvents.has(key)) return false;
                seenEvents.add(key);
                return true;
            }).slice(0, 15);
            
            events.sort((a, b) => new Date(a.fullDate) - new Date(b.fullDate));
            macroLog(`✅ Calendário Forex Factory: ${events.length} eventos reais`, 'success');
            return events;
            
        } catch(e) {
            macroLog('⚠️ Forex Factory indisponível: ' + e.message, 'warn');
            return null;
        }
    }
    
    // FMP API - Backup (requer plano ativo)
    async function fetchCalendarFromFMP() {
        try {
            const today = new Date();
            const fromDate = today.toISOString().split('T')[0];
            const toDate = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            
            // Tentar endpoint novo (stable) e legado (v3)
            const urls = [
                `https://financialmodelingprep.com/stable/economic-calendar?from=${fromDate}&to=${toDate}&apikey=${FMP_API_KEY}`,
                `https://financialmodelingprep.com/api/v3/economic_calendar?from=${fromDate}&to=${toDate}&apikey=${FMP_API_KEY}`
            ];
            
            let data = null;
            for (const baseUrl of urls) {
                const proxyUrls = [
                    baseUrl,
                    `https://api.allorigins.win/raw?url=${encodeURIComponent(baseUrl)}`,
                    `https://corsproxy.io/?${encodeURIComponent(baseUrl)}`
                ];
                for (const url of proxyUrls) {
                    try {
                        const response = await fetch(url, { signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined });
                        if (!response.ok) continue;
                        const result = await response.json();
                        if (Array.isArray(result) && result.length > 0) {
                            data = result;
                            break;
                        }
                    } catch(e) {
                        continue;
                    }
                }
                if (data) break;
            }
            
            if (!data || data.length === 0) return null;
            
            // Filtrar apenas eventos de alto impacto dos EUA
            const usEvents = data.filter(e => {
                if (e.country !== 'US') return false;
                if (e.impact !== 'High' && e.impact !== 'Medium') return false;
                const eventName = e.event?.toLowerCase() || '';
                return HIGH_IMPACT_EVENTS.some(keyword => 
                    eventName.includes(keyword.toLowerCase())
                );
            });
            
            const mappedFMPEvents = usEvents.map(e => {
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
                    actual: e.actual,
                    source: 'FMP'
                };
            });
            
            // Remover duplicatas (mesmo título traduzido no mesmo dia)
            const seenFMPEvents = new Set();
            const events = mappedFMPEvents.filter(e => {
                const key = `${e.title}-${e.fullDate}`;
                if (seenFMPEvents.has(key)) return false;
                seenFMPEvents.add(key);
                return true;
            }).slice(0, 15);
            
            events.sort((a, b) => new Date(a.fullDate) - new Date(b.fullDate));
            macroLog(`✅ Calendário FMP: ${events.length} eventos`, 'success');
            return events;
            
        } catch(e) {
            macroLog('⚠️ FMP Calendar indisponível: ' + e.message, 'warn');
            return null;
        }
    }
    
    // Traduzir nomes de eventos para português (compatível com FMP e Forex Factory)
    function translateEventName(name) {
        const translations = {
            'Consumer Price Index': 'CPI (Inflação)',
            'CPI m/m': 'CPI (Inflação) m/m',
            'CPI y/y': 'CPI (Inflação) a/a',
            'Core CPI': 'CPI Core',
            'Non-Farm Payroll': 'Non-Farm Payrolls',
            'Non-Farm Employment Change': 'Non-Farm Payrolls',
            'ADP Non-Farm Employment': 'ADP Empregos Privados',
            'Nonfarm Payrolls': 'Non-Farm Payrolls',
            'Employment': 'Emprego',
            'Unemployment Rate': 'Taxa de Desemprego',
            'Unemployment Claims': 'Pedidos Seguro-Desemprego',
            'Initial Jobless Claims': 'Pedidos Seguro-Desemprego',
            'JOLTS Job Openings': 'JOLTS Vagas de Emprego',
            'GDP': 'PIB',
            'Advance GDP': 'PIB (Preliminar)',
            'Final GDP': 'PIB (Final)',
            'Prelim GDP': 'PIB (Revisão)',
            'Gross Domestic Product': 'PIB',
            'FOMC': 'Taxa de Juros FED',
            'Federal Funds Rate': 'Taxa de Juros FED',
            'FOMC Statement': 'Comunicado FOMC',
            'FOMC Press Conference': 'Coletiva FOMC',
            'FOMC Meeting Minutes': 'Ata do FOMC',
            'Federal Reserve': 'Fed',
            'Interest Rate Decision': 'Taxa de Juros FED',
            'Fed Interest Rate': 'Taxa de Juros FED',
            'Retail Sales': 'Vendas no Varejo',
            'Core Retail Sales': 'Vendas no Varejo Core',
            'Consumer Confidence': 'Confiança do Consumidor',
            'UoM Consumer Sentiment': 'Sentimento Michigan',
            'CB Consumer Confidence': 'Confiança CB',
            'Philly Fed Manufacturing Index': 'Índice de Manufatura Filadélfia',
            'Philadelphia Fed Manufacturing Index': 'Índice de Manufatura Filadélfia',
            'Philly Fed Manufacturing': 'Índice de Manufatura Filadélfia',
            'Philly Fed': 'Índice de Manufatura Filadélfia',
            'Empire State Manufacturing Index': 'Índice de Manufatura NY (Empire State)',
            'Empire State Manufacturing': 'Índice de Manufatura NY (Empire State)',
            'ISM Manufacturing PMI': 'ISM Manufatura',
            'ISM Manufacturing': 'ISM Manufatura',
            'ISM Services PMI': 'ISM Serviços',
            'ISM Services': 'ISM Serviços',
            'PMI': 'PMI',
            'PPI m/m': 'PPI m/m',
            'PPI y/y': 'PPI a/a',
            'PPI': 'PPI (Preços ao Produtor)',
            'Producer Price Index': 'PPI',
            'Housing Starts': 'Início de Construções',
            'Building Permits': 'Licenças de Construção',
            'New Home Sales': 'Vendas Casas Novas',
            'Existing Home Sales': 'Vendas Casas Existentes',
            'Trade Balance': 'Balança Comercial',
            'Durable Goods': 'Bens Duráveis',
            'Core Durable Goods': 'Bens Duráveis Core',
            'Personal Spending': 'Gastos Pessoais',
            'Personal Income': 'Renda Pessoal',
            'PCE Price Index': 'PCE (Inflação)',
            'Core PCE Price Index': 'PCE Core',
            'Core PCE': 'PCE Core',
            'President Trump Speaks': 'Discurso Trump',
            'Industrial Production': 'Produção Industrial',
            'Capacity Utilization': 'Utilização da Capacidade',
            'Factory Orders': 'Encomendas à Indústria',
            'UoM Inflation Expectations': 'Expectativas de Inflação Michigan',
            'Chicago PMI': 'PMI Chicago',
            'S&P Global Manufacturing PMI': 'PMI S&P Global Manufatura',
            'S&P Global Services PMI': 'PMI S&P Global Serviços',
            'Michigan Consumer Sentiment': 'Sentimento Michigan',
            'Continuing Jobless Claims': 'Continuidade Seguro-Desemprego',
            'Import Prices': 'Preços de Importação',
            'Export Prices': 'Preços de Exportação',
            'Treasury Budget': 'Orçamento do Tesouro',
            'Leading Indicators': 'Indicadores Antecedentes',
            'Current Account': 'Conta Corrente',
            'Beige Book': 'Livro Bege',
            'Crude Oil Inventories': 'Estoques de Petróleo'
        };
        
        for (const [eng, pt] of Object.entries(translations)) {
            if (name?.toLowerCase().includes(eng.toLowerCase())) {
                return pt;
            }
        }
        return name || 'Evento Econômico';
    }
    
    // Fallback: Calendário com datas OFICIAIS publicadas por agências do governo
    // Fontes: Federal Reserve (FOMC), Bureau of Labor Statistics (CPI, NFP, PPI), BEA (GDP/PCE)
    // Estas NÃO são estimativas - são datas reais dos calendários oficiais
    function calculateFallbackEvents() {
        const today = new Date();
        const maxDate = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000);
        const events = [];
        
        // ===== FOMC Meetings - Federal Reserve Official =====
        for (const meeting of ALL_FOMC_MEETINGS) {
            const d = new Date(meeting.date);
            if (d > today && d < maxDate) {
                events.push({
                    day: d.getDate(),
                    month: d.toLocaleDateString('pt-BR', { month: 'short' }).toUpperCase(),
                    time: '14:00',
                    title: 'Taxa de Juros FED',
                    fullDate: meeting.date,
                    country: 'EUA',
                    impact: 'high',
                    hasHistory: true,
                    description: meeting.label,
                    source: 'Federal Reserve'
                });
            }
        }
        
        // ===== CPI (Consumer Price Index) - BLS Official Schedule 2026 =====
        const CPI_RELEASES_2026 = [
            { date: '2026-02-13', ref: 'Janeiro 2026' },
            { date: '2026-03-11', ref: 'Fevereiro 2026' },
            { date: '2026-04-10', ref: 'Março 2026' },
            { date: '2026-05-12', ref: 'Abril 2026' },
            { date: '2026-06-10', ref: 'Maio 2026' },
            { date: '2026-07-14', ref: 'Junho 2026' },
            { date: '2026-08-12', ref: 'Julho 2026' },
            { date: '2026-09-11', ref: 'Agosto 2026' },
            { date: '2026-10-14', ref: 'Setembro 2026' },
            { date: '2026-11-10', ref: 'Outubro 2026' },
            { date: '2026-12-10', ref: 'Novembro 2026' }
        ];
        for (const rel of CPI_RELEASES_2026) {
            const d = new Date(rel.date);
            if (d > today && d < maxDate) {
                events.push({
                    day: d.getDate(),
                    month: d.toLocaleDateString('pt-BR', { month: 'short' }).toUpperCase(),
                    time: '08:30',
                    title: 'CPI (Inflação)',
                    fullDate: rel.date,
                    country: 'EUA',
                    impact: 'high',
                    hasHistory: true,
                    description: `Dados de ${rel.ref}`,
                    source: 'Bureau of Labor Statistics'
                });
            }
        }
        
        // ===== NFP (Employment Situation) - BLS Official Schedule 2026 =====
        const NFP_RELEASES_2026 = [
            { date: '2026-02-11', ref: 'Janeiro 2026' },
            { date: '2026-03-06', ref: 'Fevereiro 2026' },
            { date: '2026-04-03', ref: 'Março 2026' },
            { date: '2026-05-08', ref: 'Abril 2026' },
            { date: '2026-06-05', ref: 'Maio 2026' },
            { date: '2026-07-02', ref: 'Junho 2026' },
            { date: '2026-08-07', ref: 'Julho 2026' },
            { date: '2026-09-04', ref: 'Agosto 2026' },
            { date: '2026-10-02', ref: 'Setembro 2026' },
            { date: '2026-11-06', ref: 'Outubro 2026' },
            { date: '2026-12-04', ref: 'Novembro 2026' }
        ];
        for (const rel of NFP_RELEASES_2026) {
            const d = new Date(rel.date);
            if (d > today && d < maxDate) {
                events.push({
                    day: d.getDate(),
                    month: d.toLocaleDateString('pt-BR', { month: 'short' }).toUpperCase(),
                    time: '08:30',
                    title: 'Non-Farm Payrolls',
                    fullDate: rel.date,
                    country: 'EUA',
                    impact: 'high',
                    hasHistory: true,
                    description: `Dados de ${rel.ref}`,
                    source: 'Bureau of Labor Statistics'
                });
            }
        }
        
        // ===== PPI (Producer Price Index) - BLS Official Schedule 2026 =====
        const PPI_RELEASES_2026 = [
            { date: '2026-02-27', ref: 'Janeiro 2026' },
            { date: '2026-03-12', ref: 'Fevereiro 2026' },
            { date: '2026-04-14', ref: 'Março 2026' },
            { date: '2026-05-13', ref: 'Abril 2026' },
            { date: '2026-06-11', ref: 'Maio 2026' },
            { date: '2026-07-15', ref: 'Junho 2026' },
            { date: '2026-08-13', ref: 'Julho 2026' },
            { date: '2026-09-10', ref: 'Agosto 2026' },
            { date: '2026-10-15', ref: 'Setembro 2026' },
            { date: '2026-11-13', ref: 'Outubro 2026' },
            { date: '2026-12-15', ref: 'Novembro 2026' }
        ];
        for (const rel of PPI_RELEASES_2026) {
            const d = new Date(rel.date);
            if (d > today && d < maxDate) {
                events.push({
                    day: d.getDate(),
                    month: d.toLocaleDateString('pt-BR', { month: 'short' }).toUpperCase(),
                    time: '08:30',
                    title: 'PPI (Preços ao Produtor)',
                    fullDate: rel.date,
                    country: 'EUA',
                    impact: 'medium',
                    hasHistory: true,
                    description: `Dados de ${rel.ref}`,
                    source: 'Bureau of Labor Statistics'
                });
            }
        }
        
        if (events.length === 0) {
            macroLog('⚠️ Nenhum evento futuro encontrado no fallback', 'warn');
            return null;
        }
        
        // Ordenar por data
        events.sort((a, b) => new Date(a.fullDate) - new Date(b.fullDate));
        
        macroLog(`⚠️ Fallback: ${events.length} eventos de calendário oficial (BLS/Fed)`, 'warn');
        return events;
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
        
        container.innerHTML = events.slice(0, 10).map((e, idx) => {
            // Formatar data no estilo brasileiro DD/MM
            const fullDateObj = new Date(e.fullDate + 'T12:00:00');
            const dayStr = String(fullDateObj.getDate()).padStart(2, '0');
            const monthStr = String(fullDateObj.getMonth() + 1).padStart(2, '0');
            
            // Informação de resultado anterior
            let prevInfo = '';
            if (e.previous && e.previous !== 'null' && e.previous !== '') {
                prevInfo = ` • Ant: ${e.previous}`;
            }
            
            return `
            <div class="calendar-event" data-event-idx="${idx}" data-event-title="${e.title}" style="cursor: pointer; transition: background 0.2s;" onclick="window.MacroAPI.showEventDetails('${e.title}', '${e.fullDate}')">
                <div class="calendar-date">
                    <div class="calendar-day">${dayStr}</div>
                    <div class="calendar-month">${monthStr}</div>
                </div>
                <div class="calendar-info">
                    <div class="calendar-title">${e.title}</div>
                    <div class="calendar-country">${e.country} • ${e.time}${e.estimate ? ` • Est: ${e.estimate}` : ''}${prevInfo}</div>
                </div>
                <div class="calendar-impact ${e.impact}">${e.impact === 'high' ? 'ALTO' : 'MÉDIO'}</div>
                <i class="fas fa-chevron-right" style="color: var(--text-muted); font-size: 12px; margin-left: 8px;"></i>
            </div>
        `}).join('') || '<p style="color: var(--text-muted); text-align: center;">Nenhum evento</p>';
        
        // Adicionar hover effect
        container.querySelectorAll('.calendar-event').forEach(el => {
            el.addEventListener('mouseenter', () => el.style.background = 'rgba(255,255,255,0.05)');
            el.addEventListener('mouseleave', () => el.style.background = '');
        });
        
        // Mostrar última atualização
        const updateInfo = document.createElement('div');
        updateInfo.style.cssText = 'font-size: 10px; color: #555; text-align: right; margin-top: 8px; padding-right: 8px;';
        updateInfo.textContent = `Atualizado: ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} • Histórico: FRED API`;
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
        modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.85); z-index: 9999; display: flex; align-items: flex-end; justify-content: center;';
        
        const eventInfo = getEventInfo(eventTitle);
        
        modal.innerHTML = `
            <div style="background: var(--bg-secondary, #1a1a2e); width: 100%; max-width: 420px; border-radius: 20px 20px 0 0; overflow: hidden; animation: slideUp 0.3s ease; max-height: 85vh; display: flex; flex-direction: column;">
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
                    

                    
                    <!-- Histórico -->
                    <h4 style="margin: 0 0 12px; color: white; font-size: 14px; display: flex; align-items: center; gap: 8px;">
                        <i class="fas fa-history" style="color: #3b82f6;"></i>
                        Últimos Resultados
                    </h4>
                    
                    ${history.length > 0 ? `
                        <div style="display: flex; flex-direction: column; gap: 10px;">
                            ${history.map((h, idx) => {
                                // Calcular variação entre actual e previous
                                const actualStr = String(h.actual);
                                const prevStr = String(h.previous);
                                const actualNum = parseFloat(actualStr.replace(/[^0-9.-]/g, ''));
                                const prevNum = parseFloat(prevStr.replace(/[^0-9.-]/g, ''));
                                let variacao = '';
                                let varColor = '#888';
                                
                                // Detectar se actual é um valor delta (ex: +143K do NFP) - nestes casos previous é total e comparação não faz sentido
                                const isDeltaValue = (actualStr.startsWith('+') || actualStr.startsWith('-')) && (actualStr.includes('K') || actualStr.includes('M'));
                                const isPreviousTotal = prevStr.includes('(total)');
                                const skipVariation = isDeltaValue || isPreviousTotal;
                                
                                if (!skipVariation && !isNaN(actualNum) && !isNaN(prevNum) && h.previous !== '-') {
                                    const diff = actualNum - prevNum;
                                    // Se os valores são percentuais (contém % ou valor < 50), mostrar diferença em pp
                                    const isPercentageValue = actualStr.includes('%') || prevStr.includes('%') || 
                                        (Math.abs(actualNum) < 50 && Math.abs(prevNum) < 50 && !actualStr.includes('K') && !actualStr.includes('M'));
                                    
                                    if (isPercentageValue) {
                                        // Para valores em %, mostrar diferença em pontos percentuais
                                        variacao = diff >= 0 ? `+${diff.toFixed(1)}pp` : `${diff.toFixed(1)}pp`;
                                    } else if (prevNum !== 0) {
                                        // Para valores absolutos, mostrar variação %
                                        const diffPct = ((diff / Math.abs(prevNum)) * 100).toFixed(1);
                                        variacao = diff >= 0 ? `+${diffPct}%` : `${diffPct}%`;
                                    }
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
                        <div style="text-align: center; padding: 24px; color: #888; background: rgba(255,255,255,0.02); border-radius: 12px; border: 1px dashed rgba(255,255,255,0.1);">
                            <i class="fas fa-exclamation-circle" style="font-size: 28px; margin-bottom: 10px; opacity: 0.5; color: #f59e0b;"></i>
                            <p style="margin: 0; font-weight: 600; font-size: 14px; color: #ccc;">Histórico Indisponível</p>
                            <p style="margin: 6px 0 0; font-size: 11px; color: #666; line-height: 1.5;">Não foi possível obter dados históricos para este indicador.<br>Isso pode ocorrer por limitação da API ou falta de mapeamento.</p>
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
            'CPI (Inflação) m/m': {
                icon: 'fa-percentage',
                color: '#f59e0b',
                description: 'Variação mensal do CPI. Mede a inflação mês a mês. Valores acima do esperado indicam pressão inflacionária.',
                expectation: 'Variações mensais acima de 0.3% são preocupantes para o Fed.'
            },
            'CPI Core': {
                icon: 'fa-percentage',
                color: '#f59e0b',
                description: 'CPI sem alimentos e energia (mais voláteis). É o indicador de inflação mais observado pelo Fed por ser menos sujeito a choques temporários.',
                expectation: 'Core CPI persistentemente acima de 3% a/a pode adiar cortes de juros.'
            },
            'Taxa de Juros FED': {
                icon: 'fa-landmark',
                color: '#3b82f6',
                description: 'Reunião do FOMC (Comitê Federal de Mercado Aberto). O Fed decide a taxa de juros básica dos EUA. Além da decisão, o comunicado e coletiva do presidente são muito importantes para entender a direção futura.',
                expectation: 'Observe o "dot plot" (projeções dos membros) e qualquer mudança no tom do comunicado. Palavras como "paciente" ou "vigilante" impactam mercados.'
            },
            'Decisão FOMC': {
                icon: 'fa-landmark',
                color: '#3b82f6',
                description: 'Reunião do FOMC (Comitê Federal de Mercado Aberto). O Fed decide a taxa de juros básica dos EUA.',
                expectation: 'Observe o "dot plot" (projeções dos membros) e qualquer mudança no tom do comunicado.'
            },
            'PCE (Inflação)': {
                icon: 'fa-chart-pie',
                color: '#a855f7',
                description: 'Personal Consumption Expenditures - o indicador de inflação PREFERIDO do Federal Reserve. Mais amplo que o CPI e considerado mais preciso. Core PCE (excluindo alimentos e energia) é a métrica mais observada pelo Fed.',
                expectation: 'Meta do Fed é 2%. Core PCE é o principal termômetro para decisões de política monetária. Valores persistentemente acima de 2.5% podem adiar cortes de juros.'
            },
            'PCE Core': {
                icon: 'fa-chart-pie',
                color: '#a855f7',
                description: 'Core PCE exclui alimentos e energia. É o indicador preferido do Fed para medir inflação subjacente.',
                expectation: 'Meta do Fed é 2%. Valores acima indicam inflação persistente.'
            },
            'PIB': {
                icon: 'fa-chart-line',
                color: '#10b981',
                description: 'Produto Interno Bruto - a medida mais ampla de atividade econômica. Publicado trimestralmente com revisões. Crescimento saudável é geralmente entre 2-3% ao ano.',
                expectation: 'GDP forte demais pode pressionar inflação. GDP fraco pode aumentar expectativas de cortes de juros. Recessão técnica = 2 trimestres consecutivos de queda.'
            },
            'PIB (Preliminar)': {
                icon: 'fa-chart-line',
                color: '#10b981',
                description: 'Primeira leitura do PIB trimestral. Geralmente a que mais movimenta o mercado por ser a primeira estimativa disponível.',
                expectation: 'Crescimento abaixo de 1% pode indicar desaceleração. Acima de 3% pode pressionar inflação.'
            },
            'Índice de Manufatura Filadélfia': {
                icon: 'fa-industry',
                color: '#ef4444',
                description: 'Pesquisa do Federal Reserve da Filadélfia sobre a atividade manufatureira na região. Leitura acima de zero indica expansão, abaixo indica contração. É um dos primeiros indicadores regionais divulgados todo mês.',
                expectation: 'Valores acima de 0 indicam expansão. Correlação forte com ISM Manufatura nacional. Quedas acentuadas podem antecipar recessão.'
            },
            'Índice de Manufatura NY (Empire State)': {
                icon: 'fa-industry',
                color: '#06b6d4',
                description: 'Pesquisa do Federal Reserve de Nova York sobre a atividade manufatureira no estado. Primeiro indicador regional divulgado todo mês, servindo como prévia dos dados nacionais.',
                expectation: 'Valores acima de 0 indicam expansão. É o primeiro indicador regional do mês, antecipando tendências.'
            },
            'Taxa de Desemprego': {
                icon: 'fa-user-slash',
                color: '#ef4444',
                description: 'Percentual da força de trabalho dos EUA que está desempregada. Componente-chave do mandato duplo do Fed (pleno emprego + estabilidade de preços).',
                expectation: 'Desemprego abaixo de 4% é considerado pleno emprego. Alta rápida pode sinalizar recessão.'
            },
            'Pedidos Seguro-Desemprego': {
                icon: 'fa-file-alt',
                color: '#f97316',
                description: 'Pedidos iniciais de seguro-desemprego da semana. Indicador semanal de alta frequência que mostra a saúde do mercado de trabalho em tempo quase real.',
                expectation: 'Abaixo de 250K indica mercado de trabalho forte. Acima de 300K pode sinalizar fraqueza.'
            },
            'Vendas no Varejo': {
                icon: 'fa-shopping-cart',
                color: '#8b5cf6',
                description: 'Mede o total de vendas no comércio varejista dos EUA. O consumo representa ~70% do PIB americano, tornando este dado crucial.',
                expectation: 'Crescimento mensal acima de 0.5% é positivo. Queda pode indicar consumidor retraído.'
            },
            'ISM Manufatura': {
                icon: 'fa-industry',
                color: '#0ea5e9',
                description: 'Índice de Gerentes de Compras do setor industrial. Acima de 50 indica expansão, abaixo indica contração. Um dos principais indicadores antecedentes da economia.',
                expectation: 'Acima de 50 = expansão. Abaixo de 50 = contração. Abaixo de 45 historicamente associado a recessão.'
            },
            'ISM Serviços': {
                icon: 'fa-concierge-bell',
                color: '#0ea5e9',
                description: 'Índice de Gerentes de Compras do setor de serviços. Como serviços são ~80% da economia americana, este é extremamente importante.',
                expectation: 'Acima de 50 = expansão. Setor de serviços é o motor da economia americana.'
            },
            'PPI (Preços ao Produtor)': {
                icon: 'fa-boxes',
                color: '#eab308',
                description: 'Índice de Preços ao Produtor. Mede a inflação na porta da fábrica. Pressões no PPI costumam refletir no CPI 1-2 meses depois.',
                expectation: 'PPI é um indicador antecipado de inflação ao consumidor. Altas recorrentes pressionam margens.'
            },
            'ADP Empregos Privados': {
                icon: 'fa-briefcase',
                color: '#22c55e',
                description: 'Relatório de empregos privados da ADP. Divulgado 2 dias antes do NFP oficial, serve como prévia do mercado de trabalho.',
                expectation: 'Funciona como prévia do payroll oficial. Divergências grandes entre ADP e NFP geram volatilidade.'
            },
            'Confiança do Consumidor': {
                icon: 'fa-smile',
                color: '#14b8a6',
                description: 'Pesquisa da Conference Board sobre a confiança dos consumidores. Consumidor confiante gasta mais, impulsionando o PIB.',
                expectation: 'Acima de 100 é positivo. Quedas acentuadas podem antecipar desaceleração do consumo.'
            },
            'Sentimento Michigan': {
                icon: 'fa-brain',
                color: '#14b8a6',
                description: 'Índice de Sentimento do Consumidor da Universidade de Michigan. Pesquisa de longa data que mede expectativas dos consumidores.',
                expectation: 'Inclui expectativas de inflação muito observadas pelo Fed.'
            },
            'JOLTS Vagas de Emprego': {
                icon: 'fa-door-open',
                color: '#22c55e',
                description: 'Job Openings and Labor Turnover Survey. Mostra a quantidade de vagas abertas nos EUA. O Fed monitora de perto a relação vagas/desempregados.',
                expectation: 'Relação vagas/desempregados acima de 1.5 indica mercado apertado. Queda pode sinalizar desaceleração.'
            },
            'Bens Duráveis': {
                icon: 'fa-truck',
                color: '#78716c',
                description: 'Encomendas de bens duráveis (vida útil > 3 anos). Indicador importante de investimento empresarial e atividade industrial.',
                expectation: 'Core (excluindo transporte) é mais observado. Queda consecutiva pode indicar recessão industrial.'
            },
            'Início de Construções': {
                icon: 'fa-hard-hat',
                color: '#a16207',
                description: 'Número de novas construções residenciais iniciadas. Reflete a saúde do setor imobiliário, importante para a economia.',
                expectation: 'Sensível a taxas de juros. Queda indica impacto dos juros no setor habitacional.'
            },
            'Comunicado FOMC': {
                icon: 'fa-landmark',
                color: '#3b82f6',
                description: 'Comunicado oficial do FOMC após a decisão de juros. O tom e as palavras usadas são analisados minuciosamente pelo mercado.',
                expectation: 'Palavras-chave: "data-dependent", "restrictive", "accommodate". Mudanças no texto sinalizam tendências futuras.'
            },
            'Ata do FOMC': {
                icon: 'fa-file-alt',
                color: '#3b82f6',
                description: 'Minuta detalhada da reunião do FOMC, divulgada 3 semanas depois. Revela debates internos e opiniões divergentes dos membros.',
                expectation: 'Atenção ao número de membros a favor de corte vs manutenção e discussões sobre riscos.'
            },
            'Produção Industrial': {
                icon: 'fa-industry',
                color: '#64748b',
                description: 'Mede a produção das fábricas, minas e utilidades dos EUA. Indicador importante da atividade econômica no setor produtivo.',
                expectation: 'Queda consecutiva pode indicar contração industrial.'
            },
            'Balança Comercial': {
                icon: 'fa-ship',
                color: '#06b6d4',
                description: 'Diferença entre exportações e importações dos EUA. Déficit grande indica que os EUA importam mais do que exportam.',
                expectation: 'Déficits crescentes podem pressionar o dólar. Superávit é raro para os EUA.'
            },
            'Emprego': {
                icon: 'fa-users',
                color: '#22c55e',
                description: 'Dados de emprego dos EUA. O mercado de trabalho é um dos indicadores mais importantes para o Fed.',
                expectation: 'Mercado de trabalho forte pode manter juros altos por mais tempo.'
            },
            'Discurso Trump': {
                icon: 'fa-microphone',
                color: '#dc2626',
                description: 'Discurso ou declaração do Presidente. Pode impactar mercados dependendo de anúncios sobre tarifas, política fiscal ou regulação.',
                expectation: 'Fique atento a menções sobre tarifas comerciais, impostos ou regulação do setor financeiro.'
            }
        };
        // Busca por match parcial no título
        for (const [key, val] of Object.entries(info)) {
            if (title && title.toLowerCase().includes(key.toLowerCase())) return val;
        }
        return info[title] || { icon: 'fa-calendar', color: '#888', description: 'Evento econômico importante que pode impactar mercados financeiros e criptomoedas.', expectation: null };
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

    // Pre-fetch do calendário ao carregar script (antes do usuário abrir MACRO)
    // Isso preenche o cache para que quando o usuário abrir MACRO, o calendário apareça instantaneamente
    (function prefetchCalendar() {
        macroLog('🚀 Pre-fetching calendário econômico...', 'info');
        fetchEconomicCalendarFromAPI().then(events => {
            if (events && events.length > 0) {
                macroLog(`✅ Calendário pré-carregado: ${events.length} eventos`, 'success');
            }
        }).catch(() => {});
    })();

    macroLog('✓ macro-section.js v22.0 carregado! (IDs ÚNICOS)', 'success');
})();
