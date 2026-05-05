/**
 * MACRO SECTION - Dados Macroeconômicos
 * Versão 20.0 - DEBUG MÁXIMO
 * Container VERMELHO, Canvas VERDE, Desenho AZUL
 */

(function() {
    'use strict';

    const BACKEND_PROXY = 'https://visor-crypto-api.onrender.com/api/proxy';
    
    // API keys from config (do not hardcode secrets in source)
    const APP_CONFIG = window.APP_CONFIG || {};
    const CALENDAR_WORKER_URL = String(APP_CONFIG.CALENDAR_WORKER_URL || '').trim().replace(/\/+$/, '');
    const FINNHUB_API_KEY = APP_CONFIG.FINNHUB_API_KEY || '';
    const FINNHUB_WS_URL = null; // Finnhub WS disabled (use REST proxy);
    // Twelve Data keys can be passed as array or comma-separated string in APP_CONFIG
    const TWELVE_DATA_API_KEYS = Array.isArray(APP_CONFIG.TWELVE_DATA_API_KEYS)
        ? APP_CONFIG.TWELVE_DATA_API_KEYS.filter(Boolean)
        : String(APP_CONFIG.TWELVE_DATA_API_KEYS || '')
            .split(',')
            .map(k => k.trim())
            .filter(Boolean);
    let currentTwelveDataKeyIndex = 0;
    
    // Função para alternar chaves Twelve Data
    function getTwelveDataKey() {
        if (TWELVE_DATA_API_KEYS.length === 0) return '';
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
    let indicatorUpdatedAt = {};
    let wsConnected = false;
    let currentIndicatorSymbol = null;
    let indicatorChartPeriod = '1d';
    let indicatorChartType = 'line';
    let indicatorCandleData = null;
    let indicatorChartStats = null;
    let _chartRequestId = 0; // Race condition guard
    let macroPriceFetchPromise = null;
    let macroPriceWarmupPromise = null;
    let macroChartWarmupPromise = null;
    let macroPriceFetchStartedAt = 0;
    let macroCalendarViewEvents = [];

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
        'SI=F': 'XAG/USD',         // Prata - Forex ✓
        'XLE': 'XLE',              // Energy ETF ✓
    };

    const PRIORITY_TWELVE_SYMBOLS = ['GC=F', 'SI=F'];
    
    // Timestamp da última atualização
    let lastPriceUpdate = 0;
    const PRICE_UPDATE_INTERVAL = 3 * 60 * 1000; // 3 minutos
    
    // ============================================
    // CACHE DE PREÇOS - localStorage para load instantâneo
    // ============================================
    const INDICATOR_CACHE_KEY = 'vc_macro_indicator_cache';
    const INDICATOR_CACHE_TTL = 10 * 60 * 1000; // startup cache válido só quando recente
    const INDICATOR_MAX_QUOTE_AGE_MS = 60 * 60 * 1000; // cotação passa a ser considerada "fresca" por 60 min
    const INDICATOR_STALE_CACHE_MAX_AGE = 3 * 60 * 60 * 1000; // no startup, aceitar cache real de até 3h enquanto revalida
    const INDICATOR_CHART_SYNC_SKEW_MS = 60 * 1000; // só sincronizar do gráfico se candle for pelo menos 1 min mais novo
    const INDICATOR_CHART_SYNC_PRICE_DELTA = 0.002; // troca quote fresco se o candle divergir mais de 0,2%
    const LEGACY_BOOTSTRAP_CACHE_PRICES = Object.freeze({
        'GC=F': 3095.2,
        'SI=F': 31.84,
        'CL=F': 70.58,
        'DX-Y.NYB': 103.92,
        '^GSPC': 5608.17,
        '^NDX': 19842.51,
        '^RUT': 2068.33,
        '^VIX': 19.47,
        'XLE': 89.16,
    });

    function isLegacyBootstrapCache(cache) {
        const prices = cache?.prices;
        if (!prices || typeof prices !== 'object') return false;

        const symbols = Object.keys(LEGACY_BOOTSTRAP_CACHE_PRICES);
        return symbols.every((symbol) => {
            const expected = Number(LEGACY_BOOTSTRAP_CACHE_PRICES[symbol] || 0);
            const current = Number(prices[symbol] || 0);
            return Number.isFinite(current) && Math.abs(current - expected) < 0.000001;
        });
    }

    function markIndicatorUpdated(symbol, timestamp) {
        if (!symbol) return;
        const ts = Number(timestamp || Date.now());
        indicatorUpdatedAt[symbol] = Number.isFinite(ts) && ts > 0 ? ts : Date.now();
    }

    function isIndicatorDataFresh(symbol) {
        const ts = Number(indicatorUpdatedAt[symbol] || 0);
        return ts > 0 && (Date.now() - ts) <= INDICATOR_MAX_QUOTE_AGE_MS;
    }

    function getFreshIndicatorPrice(symbol) {
        const value = Number(indicatorPrices[symbol] || 0);
        return Number.isFinite(value) && value > 0 ? value : 0;
    }

    function isIndicatorModalForSymbol(symbol, requestId = null) {
        const modal = document.getElementById('indicator-modal');
        if (!modal || !symbol) return false;
        if (requestId !== null && _chartRequestId !== requestId) return false;
        const modalSymbol = modal.dataset.symbol || currentIndicatorSymbol;
        return modalSymbol === symbol && currentIndicatorSymbol === symbol;
    }

    function updateIndicatorModalQuote(symbol, pctChangeOverride = null) {
        if (!isIndicatorModalForSymbol(symbol)) return false;

        const modalPrice = document.getElementById('indicator-modal-price');
        if (modalPrice) modalPrice.innerHTML = formatIndicatorPrice(symbol);

        const pctChange = pctChangeOverride !== null ? Number(pctChangeOverride) : Number(indicatorChanges[symbol]);
        const modalChange = document.getElementById('indicator-modal-change');
        if (modalChange && Number.isFinite(pctChange)) {
            modalChange.textContent = `${pctChange >= 0 ? '+' : ''}${pctChange.toFixed(2)}%`;
            modalChange.style.color = pctChange >= 0 ? '#00ff88' : '#ff4444';
        }
        return true;
    }

    function syncIndicatorFromChartData(symbol, candles, sourceLabel = 'gráfico') {
        if (!symbol || !Array.isArray(candles) || candles.length === 0) return false;

        const lastCandle = candles[candles.length - 1] || [];
        const latestClose = Number(lastCandle[4] || 0);
        if (!Number.isFinite(latestClose) || latestClose <= 0) return false;

        const latestTs = Number(lastCandle[0] || 0);
        const stats = candles._periodStats || null;
        const firstOpenRaw = Number((stats && stats.open) || (candles[0] || [])[1] || latestClose);
        const firstOpen = (Number.isFinite(firstOpenRaw) && firstOpenRaw > 0) ? firstOpenRaw : latestClose;

        const currentPrice = Number(indicatorPrices[symbol] || 0);
        const currentTs = Number(indicatorUpdatedAt[symbol] || 0);
        const hasCurrentPrice = Number.isFinite(currentPrice) && currentPrice > 0;
        const hasNewerCandle = latestTs > 0 && (currentTs <= 0 || (latestTs - currentTs) > INDICATOR_CHART_SYNC_SKEW_MS);
        const hasMeaningfulPriceDelta = hasCurrentPrice
            && Math.abs(latestClose - currentPrice) / currentPrice > INDICATOR_CHART_SYNC_PRICE_DELTA;

        // Regra: sincroniza somente se preço atual estiver ausente/stale, mais novo ou claramente divergente.
        if (hasCurrentPrice && isIndicatorDataFresh(symbol) && !hasNewerCandle && !hasMeaningfulPriceDelta) return false;

        indicatorPrices[symbol] = latestClose;
        previousIndicatorPrices[symbol] = firstOpen;
        markIndicatorUpdated(symbol, latestTs || Date.now());

        const pctChange = firstOpen > 0 ? ((latestClose - firstOpen) / firstOpen) * 100 : 0;
        indicatorChanges[symbol] = Number.isFinite(pctChange) ? pctChange : 0;

        updateIndicatorModalQuote(symbol, pctChange);

        updateSingleIndicator(symbol);
        savePriceCache();
        macroLog(`💰 ${symbol} sincronizado via ${sourceLabel}: ${latestClose}`, 'info');
        return true;
    }
    
    function loadCachedPrices(options = {}) {
        try {
            const { allowStale = false } = options;
            const raw = localStorage.getItem(INDICATOR_CACHE_KEY);
            if (!raw) return false;
            const cache = JSON.parse(raw);
            if (!cache.ts) return false;

            // Migração: remove cache antigo criado com snapshot sintético.
            if (isLegacyBootstrapCache(cache)) {
                localStorage.removeItem(INDICATOR_CACHE_KEY);
                macroLog('🧹 Cache legado com snapshot sintético removido', 'warn');
                return false;
            }

            const ageMs = Date.now() - cache.ts;
            const isFresh = ageMs <= INDICATOR_CACHE_TTL;
            const isStaleButAllowed = allowStale && ageMs <= INDICATOR_STALE_CACHE_MAX_AGE;
            if (!isFresh && !isStaleButAllowed) return false;
            if (cache.prices) Object.assign(indicatorPrices, cache.prices);
            if (cache.changes) Object.assign(indicatorChanges, cache.changes);
            if (cache.prev) Object.assign(previousIndicatorPrices, cache.prev);
            if (cache.updatedAt && typeof cache.updatedAt === 'object') Object.assign(indicatorUpdatedAt, cache.updatedAt);

            // Compatibilidade com cache legado sem updatedAt por símbolo:
            // usa o timestamp do cache como fallback para permitir render instantâneo.
            const fallbackTs = Number(cache.ts || Date.now());
            const loadedSymbols = Object.keys(cache.prices || {});
            loadedSymbols.forEach((symbol) => {
                const hasTs = Number(indicatorUpdatedAt[symbol] || 0) > 0;
                if (!hasTs) {
                    indicatorUpdatedAt[symbol] = fallbackTs;
                }
            });

            macroLog(isFresh
                ? '📦 Cache de preços reais carregado (fresco)'
                : '📦 Cache de preços reais carregado (stale temporário, atualizando em rede)', 'success');
            return true;
        } catch (e) { return false; }
    }
    
    function savePriceCache() {
        try {
            localStorage.setItem(INDICATOR_CACHE_KEY, JSON.stringify({
                schema: 2,
                realOnly: true,
                prices: indicatorPrices,
                changes: indicatorChanges,
                prev: previousIndicatorPrices,
                updatedAt: indicatorUpdatedAt,
                ts: Date.now()
            }));
        } catch (e) {}
    }

    function getMacroWorkerMarketUrl(path) {
        if (!CALENDAR_WORKER_URL) return '';
        return `${CALENDAR_WORKER_URL}${path}`;
    }

    function applyWorkerMacroQuotes(data, options = {}) {
        if (!data || data.success === false || !data.prices || typeof data.prices !== 'object') return 0;

        const updatedAtBySymbol = data.updatedAtBySymbol || {};
        const prev = data.prev || data.previousPrices || {};
        let loaded = 0;

        Object.keys(MARKET_INDICATORS).forEach((symbol) => {
            const price = Number(data.prices[symbol] || 0);
            if (!Number.isFinite(price) || price <= 0) return;

            const previous = Number(prev[symbol] || price) || price;
            let change = Number(data.changes?.[symbol]);
            if (!Number.isFinite(change)) {
                change = previous > 0 ? ((price - previous) / previous) * 100 : 0;
            }

            indicatorPrices[symbol] = price;
            previousIndicatorPrices[symbol] = previous;
            indicatorChanges[symbol] = change;
            markIndicatorUpdated(symbol, Number(updatedAtBySymbol[symbol] || data.updatedAt || Date.now()));
            loaded++;

            if (typeof options.onSymbolUpdate === 'function') {
                try { options.onSymbolUpdate(symbol); } catch (_) {}
            }
        });

        return loaded;
    }

    async function loadPricesViaWorkerMacroQuotes(options = {}) {
        const { timeoutMs = 1800, onSymbolUpdate = null } = options;
        const workerUrl = getMacroWorkerMarketUrl('/market/macro-quotes');
        if (!workerUrl) return 0;

        try {
            let data = null;
            try {
                data = await nativeHttpGet(workerUrl, {
                    connectTimeout: timeoutMs,
                    readTimeout: timeoutMs,
                    fetchTimeoutMs: timeoutMs
                });
            } catch (_) {
                const response = await _fetchWithTimeout(workerUrl, {}, timeoutMs + 300);
                if (!response.ok) return 0;
                data = await response.json();
            }
            return applyWorkerMacroQuotes(data, { onSymbolUpdate });
        } catch (_) {
            return 0;
        }
    }
     
    async function loadAllPricesInstant() {
        if (macroPriceFetchPromise) {
            macroLog('⏳ Atualização de preços já em andamento, aguardando resultado...', 'info');
            return macroPriceFetchPromise;
        }

        macroPriceFetchStartedAt = Date.now();
        macroPriceFetchPromise = (async () => {
            macroLog('⚡ Carregando preços...', 'info');
            const totalIndicators = Object.keys(MARKET_INDICATORS).length;

            // 1. Carregar cache imediatamente para UI instantânea
            const hadCache = loadCachedPrices({ allowStale: true });
            if (hadCache) {
                renderAllIndicators(); // Renderizar com cache enquanto busca novos
            } else {
                // Sem cache real ainda: manter loading até obter cotações reais.
                renderAllIndicators();
                macroLog('ℹ️ Sem cache real inicial; aguardando cotações reais da API...', 'info');
            }

            // Coalescer renders/cache para não travar o main-thread enquanto chegam respostas.
            let renderScheduled = false;
            let cacheSaveScheduled = false;
            const scheduleProgressRender = () => {
                if (renderScheduled) return;
                renderScheduled = true;
                setTimeout(() => {
                    renderScheduled = false;
                    try { renderAllIndicators(); } catch (_) {}
                }, 80);
            };
            const scheduleCacheSave = () => {
                if (cacheSaveScheduled) return;
                cacheSaveScheduled = true;
                setTimeout(() => {
                    cacheSaveScheduled = false;
                    savePriceCache();
                }, 250);
            };

            // 2. Buscar dados frescos em paralelo (mantém UI instantânea com cache)
            const forceRefresh = true;
            const priorityPromise = loadPricesViaTwelveData({ priorityOnly: true, fastMode: true, forceRefresh })
                .then((priorityLoaded) => {
                    if (priorityLoaded > 0) {
                        scheduleCacheSave();
                        scheduleProgressRender();
                    }
                })
                .catch(() => {});

            // Yahoo quote em lote reduz drasticamente o TTFD no primeiro boot sem cache.
            const batchLoaded = await loadPricesViaYahooQuoteBatch({
                forceRefresh,
                timeoutMs: hadCache ? 2600 : 1900,
                onSymbolUpdate: () => {
                    scheduleCacheSave();
                    scheduleProgressRender();
                }
            });

            macroLog('📊 Buscando via Yahoo Finance...', 'info');
            const yahooSuccess = await loadPricesViaYahooV8({
                // Após a carga em lote, buscar individualmente apenas o que faltou.
                forceRefresh: false,
                // No primeiro boot sem cache, aumentar paralelismo para reduzir TTFD.
                batchSize: hadCache ? 6 : 9,
                // Timeouts mais agressivos no warmup evitam travar em endpoints lentos.
                nativeTimeoutMs: hadCache ? 3200 : 2400,
                proxyTimeoutMs: hadCache ? 2200 : 1800,
                onSymbolUpdate: () => {
                    scheduleCacheSave();
                    scheduleProgressRender();
                }
            });
            await priorityPromise;

            // 4. Complementar com Twelve Data se necessário
            const loadedAfterYahoo = Object.values(indicatorPrices).filter(p => p > 0).length;
            if (loadedAfterYahoo < totalIndicators) {
                macroLog('📦 Complementando com Twelve Data...', 'info');
                const tdLoaded = await loadPricesViaTwelveData({ forceRefresh: false });
                if (tdLoaded > 0) {
                    scheduleCacheSave();
                    scheduleProgressRender();
                }
            }

            const total = Object.values(indicatorPrices).filter(p => p > 0).length;
            if (batchLoaded > 0) {
                macroLog(`⚡ Yahoo batch inicial carregou ${batchLoaded} indicadores`, 'success');
            }
            if (total >= 5) {
                macroLog(`✅ Total: ${total}/${totalIndicators} indicadores carregados`, 'success');
            } else {
                macroLog(`⚠️ Apenas ${total}/${totalIndicators} indicadores disponíveis`, 'warn');
            }

            lastPriceUpdate = Date.now();
            savePriceCache(); // Salvar no cache
            renderAllIndicators();
        })().finally(() => {
            const elapsedMs = Date.now() - macroPriceFetchStartedAt;
            macroLog(`🧹 Atualização finalizada (${Math.round(elapsedMs / 1000)}s)`, 'info');
            macroPriceFetchPromise = null;
        });

        return macroPriceFetchPromise;
    }

    function warmupMacroPrices() {
        if (macroPriceWarmupPromise) return macroPriceWarmupPromise;
        macroPriceWarmupPromise = loadAllPricesInstant()
            .then((ok) => {
                // Complementa preços com candles reais em background sem bloquear a UI.
                setTimeout(() => {
                    warmupIndicatorChartsInBackground().catch(() => {});
                }, 120);
                return ok;
            })
            .catch(() => false)
            .finally(() => { macroPriceWarmupPromise = null; });
        return macroPriceWarmupPromise;
    }

    function shouldWarmupIndicatorFromChart(symbol) {
        const currentPrice = Number(indicatorPrices[symbol] || 0);
        const updatedTs = Number(indicatorUpdatedAt[symbol] || 0);
        if (!(currentPrice > 0)) return true;
        if (updatedTs <= 0) return true;
        // Mesmo com quote disponível, revalida rápido via candle quando leitura está envelhecendo.
        return (Date.now() - updatedTs) > (2 * 60 * 1000);
    }

    async function warmupIndicatorChartsInBackground(options = {}) {
        const { force = false, period = '1d' } = options;
        if (macroChartWarmupPromise && !force) return macroChartWarmupPromise;

        const targetSymbols = Object.keys(MARKET_INDICATORS).filter((symbol) => force || shouldWarmupIndicatorFromChart(symbol));
        if (targetSymbols.length === 0) return false;

        macroLog(`📈 Pré-carregando gráficos em background (${targetSymbols.length})...`, 'info');

        macroChartWarmupPromise = (async () => {
            const queue = targetSymbols.slice();
            const concurrency = Math.min(3, queue.length);

            const worker = async () => {
                while (queue.length > 0) {
                    const symbol = queue.shift();
                    if (!symbol) break;

                    try {
                        const candles = await _fetchYahooChart(symbol, period);
                        if (!candles || candles.length === 0) continue;

                        chartDataCache[getChartCacheKey(symbol, period)] = {
                            data: candles,
                            timestamp: Date.now()
                        };
                        syncIndicatorFromChartData(symbol, candles, 'pré-carga de gráfico');
                    } catch (e) {
                        macroLog(`⚠️ Pré-carga chart falhou para ${symbol}: ${e.message}`, 'warn');
                    }
                }
            };

            await Promise.all(Array.from({ length: concurrency }, () => worker()));
            pruneChartCache();
            savePriceCache();
            renderAllIndicators();
            macroLog('✅ Pré-carga de gráficos concluída', 'success');
            return true;
        })()
            .catch((e) => {
                macroLog('⚠️ Pré-carga de gráficos interrompida: ' + (e?.message || e), 'warn');
                return false;
            })
            .finally(() => {
                macroChartWarmupPromise = null;
            });

        return macroChartWarmupPromise;
    }
    
    // ============================================
    // YAHOO FINANCE V8 - CHART ENDPOINT (mais confiável)
    // ============================================
    function applyYahooChartData(symbol, data) {
        const result = data?.chart?.result?.[0];
        if (!result) return false;

        const meta = result.meta;
        const price = meta?.regularMarketPrice || 0;
        const prevClose = meta?.previousClose || meta?.chartPreviousClose || price;
        if (!(price > 0)) return false;

        const change = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;
        indicatorPrices[symbol] = price;
        indicatorChanges[symbol] = change;
        previousIndicatorPrices[symbol] = prevClose;
        markIndicatorUpdated(symbol, (meta?.regularMarketTime || 0) * 1000 || Date.now());
        macroLog(`✅ ${MARKET_INDICATORS[symbol].name}: ${price.toFixed(2)} (${change >= 0 ? '+' : ''}${change.toFixed(2)}%)`, 'success');
        return true;
    }

    function _extractYahooBatchResults(data) {
        if (Array.isArray(data?.quoteResponse?.result)) return data.quoteResponse.result;
        if (Array.isArray(data?.result)) return data.result;
        if (Array.isArray(data?.data?.quoteResponse?.result)) return data.data.quoteResponse.result;
        return [];
    }

    function applyYahooBatchQuoteItem(item, options = {}) {
        const symbol = String(item?.symbol || '').trim();
        if (!symbol || !MARKET_INDICATORS[symbol]) return false;

        const price = Number(item?.regularMarketPrice || 0);
        if (!(price > 0)) return false;

        let prevClose = Number(item?.regularMarketPreviousClose || 0);
        if (!(prevClose > 0)) {
            prevClose = price;
        }

        let change = Number(item?.regularMarketChangePercent);
        if (!Number.isFinite(change)) {
            change = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;
        }

        indicatorPrices[symbol] = price;
        indicatorChanges[symbol] = change;
        previousIndicatorPrices[symbol] = prevClose;
        markIndicatorUpdated(symbol, (Number(item?.regularMarketTime || 0) * 1000) || Date.now());

        if (typeof options.onSymbolUpdate === 'function') {
            try { options.onSymbolUpdate(symbol); } catch (_) {}
        }

        return true;
    }

    async function loadPricesViaYahooQuoteBatch(options = {}) {
        const {
            forceRefresh = true,
            timeoutMs = 2200,
            onSymbolUpdate = null
        } = options;

        // Kept under the old function name for compatibility, but the v7 Yahoo
        // quote endpoint is no longer used in the critical path because it often
        // returns 401/timeout. The Worker serves real cached quotes and refreshes
        // them server-side.
        return loadPricesViaWorkerMacroQuotes({ timeoutMs, onSymbolUpdate });

        const symbols = Object.keys(MARKET_INDICATORS);
        const targetSymbols = forceRefresh
            ? symbols
            : symbols.filter((symbol) => !(indicatorPrices[symbol] > 0));

        if (targetSymbols.length === 0) return 0;

        const targetUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(targetSymbols.join(','))}`;
        const sourceUrls = [
            targetUrl,
            `${BACKEND_PROXY}?url=${encodeURIComponent(targetUrl)}`,
            `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
            `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`,
            `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`,
        ];

        for (let idx = 0; idx < sourceUrls.length; idx++) {
            const url = sourceUrls[idx];
            let data = null;

            try {
                data = await nativeHttpGet(url, {
                    connectTimeout: timeoutMs,
                    readTimeout: timeoutMs,
                    fetchTimeoutMs: timeoutMs + (idx * 250)
                });
            } catch (_) {
                try {
                    const response = await _fetchWithTimeout(url, {}, timeoutMs + 500 + (idx * 250));
                    if (!response.ok) continue;
                    data = await response.json();
                } catch (_) {
                    continue;
                }
            }

            const items = _extractYahooBatchResults(data);
            if (!items.length) continue;

            let loaded = 0;
            items.forEach((item) => {
                if (applyYahooBatchQuoteItem(item, { onSymbolUpdate })) {
                    loaded++;
                }
            });

            if (loaded > 0) {
                return loaded;
            }
        }

        return 0;
    }

    async function loadPricesViaYahooV8(options = {}) {
        const {
            forceRefresh = false,
            batchSize = 4,
            nativeTimeoutMs = 3200,
            proxyTimeoutMs = 2200,
            onSymbolUpdate = null
        } = options;
        let successCount = 0;
        const symbols = Object.keys(MARKET_INDICATORS);
        
        // Função para buscar um símbolo
        async function fetchSymbol(symbol) {
            // Pular se já temos preço
            if (!forceRefresh && indicatorPrices[symbol] && indicatorPrices[symbol] > 0) {
                return true;
            }
            
            const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;

            // 1) Native HTTP (Capacitor) primeiro para evitar CORS/proxy quando possível
            try {
                const nativeData = await nativeHttpGet(yahooUrl, {
                    connectTimeout: nativeTimeoutMs,
                    readTimeout: nativeTimeoutMs,
                    fetchTimeoutMs: nativeTimeoutMs
                });
                if (applyYahooChartData(symbol, nativeData)) {
                    if (typeof onSymbolUpdate === 'function') {
                        try { onSymbolUpdate(symbol); } catch (_) {}
                    }
                    return true;
                }
            } catch (_) {
                // fallback para proxy
            }

            const sourceUrls = [
                `https://api.allorigins.win/raw?url=${encodeURIComponent(yahooUrl)}`,
                `https://corsproxy.io/?${encodeURIComponent(yahooUrl)}`,
                `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(yahooUrl)}`,
            ];

            for (let idx = 0; idx < sourceUrls.length; idx++) {
                const url = sourceUrls[idx];
                try {
                    const controller = new AbortController();
                    const timeout = setTimeout(() => controller.abort(), proxyTimeoutMs + (idx * 250));

                    const response = await fetch(url, { signal: controller.signal });
                    clearTimeout(timeout);

                    if (!response.ok) continue;

                    const data = await response.json();
                    if (applyYahooChartData(symbol, data)) {
                        if (typeof onSymbolUpdate === 'function') {
                            try { onSymbolUpdate(symbol); } catch (_) {}
                        }
                        return true;
                    }
                } catch (e) {
                    // Silent fail, try next proxy
                }
            }
            return false;
        }

        // Buscar em lotes para reduzir pico de memória/requisições simultâneas
        const BATCH_SIZE = Math.max(1, Math.min(symbols.length, Math.floor(batchSize) || 4));
        for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
            const batch = symbols.slice(i, i + BATCH_SIZE);
            const results = await Promise.all(batch.map(s => fetchSymbol(s)));
            successCount += results.filter(r => r).length;
        }
        
        return successCount;
    }
    
    // ============================================
    // TWELVE DATA - OURO, XLE (3 chaves = 2400 créditos/dia)
    // ============================================
    async function loadPricesViaTwelveData(options = {}) {
        const { priorityOnly = false, fastMode = false, forceRefresh = false } = options;
        let successCount = 0;

        // Do not let Twelve Data priority warmup delay the first paint. It remains
        // available below as a missing-data complement after Worker/Yahoo chart.
        if (priorityOnly && fastMode) return 0;

        const entries = Object.entries(TWELVE_DATA_SYMBOLS).filter(([internalSymbol]) => {
            if (!priorityOnly) return true;
            return PRIORITY_TWELVE_SYMBOLS.includes(internalSymbol);
        });

        for (const [internalSymbol, tdSymbol] of entries) {
            // Pular se já temos preço do Yahoo
            if (!forceRefresh && indicatorPrices[internalSymbol] && indicatorPrices[internalSymbol] > 0) {
                continue;
            }

            // Tentar com cada chave até funcionar
            const maxAttempts = fastMode ? 2 : 3;
            for (let attempt = 0; attempt < maxAttempts; attempt++) {
                const apiKey = getTwelveDataKey();
                if (!apiKey) break;

                try {
                    const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(tdSymbol)}&apikey=${apiKey}`;
                    const response = await _fetchWithTimeout(url, {}, fastMode ? 4500 : 8000);
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
                        markIndicatorUpdated(internalSymbol, Date.now());
                        successCount++;

                        macroLog(`✅ ${MARKET_INDICATORS[internalSymbol].name}: ${price.toFixed(2)} (${change >= 0 ? '+' : ''}${change.toFixed(2)}%)`, 'success');
                        break; // Sucesso, não precisa tentar mais chaves
                    }
                } catch (e) {
                    // Continua tentando
                }
                
                await new Promise(r => setTimeout(r, fastMode ? 80 : 150));
            }
        }
        
        return successCount;
    }
    
    // ============================================
    // CARREGAR PREÇOS FALLBACK - NÃO USAR DADOS FALSOS
    // Quando não tiver dados reais, mostrar "--" 
    // ============================================
    function loadFallbackPrices() {
        renderAllIndicators();
        macroLog('⚠️ APIs de indicadores indisponíveis - sem dados artificiais', 'warn');
    }

    // ============================================
    // WEBSOCKET TWELVE DATA - DESATIVADO (limite de créditos)
    // Usando polling a cada 3 minutos
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
        const rawPrice = getFreshIndicatorPrice(symbol);
        if (!rawPrice) return '<i class="fas fa-spinner fa-spin" style="font-size:11px;opacity:0.4;"></i>';
        
        const decimals = config.decimals || 2;
        
        const value = rawPrice.toLocaleString('pt-BR', { 
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals 
        });
        
        return (config.prefix || '') + value;
    }

    function formatFullscreenIndicatorPrice(symbol, price) {
        const config = MARKET_INDICATORS[symbol] || {};
        const numeric = Number(price);
        if (!Number.isFinite(numeric)) return '--';
        const decimals = Math.max(2, Number(config.decimals || 2));
        return (config.prefix || '') + numeric.toLocaleString('en-US', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        });
    }

    function getFullscreenIndicatorRightPadding(ctx, symbol, minPrice, maxPrice) {
        const samples = [];
        const range = Math.max(0, Number(maxPrice) - Number(minPrice));
        for (let i = 0; i <= 5; i++) {
            samples.push(formatFullscreenIndicatorPrice(symbol, Number(maxPrice) - (range * i / 5)));
        }
        ctx.save();
        ctx.font = '9px -apple-system, sans-serif';
        const maxLabelWidth = samples.reduce((max, label) => Math.max(max, ctx.measureText(label).width), 0);
        ctx.restore();
        return Math.max(82, Math.min(132, Math.ceil(maxLabelWidth + 24)));
    }

    function formatIndicatorAge(symbol) {
        const ts = Number(indicatorUpdatedAt[symbol] || 0);
        if (!ts) return '';
        const ageMs = Math.max(0, Date.now() - ts);
        if (ageMs < 90 * 1000) return 'agora';
        const mins = Math.floor(ageMs / 60000);
        if (mins < 60) return `ha ${mins}m`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `ha ${hours}h`;
        return `ha ${Math.floor(hours / 24)}d`;
    }

    // ============================================
    // ATUALIZAR UM INDICADOR
    // ============================================
    function updateSingleIndicator(symbol) {
        const el = document.getElementById(`indicator-${symbol}`);
        if (!el) return;
        
        const price = getFreshIndicatorPrice(symbol);
        const prevPrice = previousIndicatorPrices[symbol];
        const change = indicatorChanges[symbol];
        const hasData = price && price > 0;
        
        const priceEl = el.querySelector('.ticker-current');
        if (priceEl) priceEl.innerHTML = formatIndicatorPrice(symbol);

        const pairEl = el.querySelector('.ticker-pair');
        if (pairEl && MARKET_INDICATORS[symbol]) {
            const ageLabel = hasData ? formatIndicatorAge(symbol) : '';
            pairEl.textContent = `${MARKET_INDICATORS[symbol].short}${ageLabel ? ' - ' + ageLabel : ''}`;
        }
        
        const changeEl = el.querySelector('.ticker-change');
        if (changeEl) {
            if (hasData && change !== undefined) {
                changeEl.textContent = (change >= 0 ? '+' : '') + change.toFixed(2) + '%';
                changeEl.className = `ticker-change ${change >= 0 ? 'pnl-positive' : 'pnl-negative'}`;
            } else {
                changeEl.textContent = '';
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
            const price = getFreshIndicatorPrice(symbol);
            const change = indicatorChanges[symbol];
            const displayPrice = formatIndicatorPrice(symbol);
            const imgSize = 42; // Tamanho fixo para todos os ícones
            const hasData = price > 0;
            const ageLabel = hasData ? formatIndicatorAge(symbol) : '';
            const changeDisplay = hasData && change !== undefined ? `${change >= 0 ? '+' : ''}${change.toFixed(2)}%` : '';
            const changeClass = hasData && change !== undefined ? (change >= 0 ? 'pnl-positive' : 'pnl-negative') : '';
            
            return `
                <div class="ticker-item" id="indicator-${symbol}" data-symbol="${symbol}" style="cursor: pointer;">
                    <div class="ticker-info">
                        <img src="${config.img}" alt="${config.name}" style="width: ${imgSize}px; height: ${imgSize}px; border-radius: 50%; object-fit: cover; flex-shrink: 0; background: ${config.color}20;" onerror="this.style.display='none'">
                        <div>
                            <div class="ticker-name">${config.name}</div>
                            <div class="ticker-pair">${config.short}${ageLabel ? ' - ' + ageLabel : ''}</div>
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
        _chartRequestId++; // Increment to invalidate any pending async callbacks
        const myRequestId = _chartRequestId;
        currentIndicatorSymbol = symbol;
        indicatorChartPeriod = '1d';
        indicatorChartType = 'line';
        indicatorCandleData = null;
        indicatorChartStats = null;
        
        const config = MARKET_INDICATORS[symbol];
        const price = getFreshIndicatorPrice(symbol);
        const hasData = price > 0;
        const change = hasData && Number.isFinite(indicatorChanges[symbol]) ? indicatorChanges[symbol] : null;
        const changeColor = change !== null ? (change >= 0 ? '#00ff88' : '#ff4444') : '#888';
        const changeText = change !== null ? `${change >= 0 ? '+' : ''}${change.toFixed(2)}%` : 'Sem cotação fresca';
        const imgSize = config.imgSize || 48;
        
        // Remover modal antigo se existir
        const oldModal = document.getElementById('indicator-modal');
        if (oldModal) oldModal.remove();
        
        // Criar modal
        const modal = document.createElement('div');
        modal.id = 'indicator-modal';
        modal.className = 'modal active';
        modal.dataset.symbol = symbol;
        modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.85); z-index: 9999; display: flex; align-items: flex-end; justify-content: center; padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 14px);';
        
        modal.innerHTML = `
            <div id="indicator-modal-content" style="background: var(--bg-secondary, #1a1a2e); width: 100%; max-width: 500px; max-height: calc(90vh - 14px); border-radius: 20px; overflow-y: auto; animation: slideUp 0.3s cubic-bezier(0.22, 1, 0.36, 1) forwards; will-change: transform; transform: translateZ(0);">
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
                <div style="padding: 16px; padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 20px);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                        <div>
                            <div id="indicator-modal-price" style="font-size: 28px; font-weight: bold; color: white;">${formatIndicatorPrice(symbol)}</div>
                            <div id="indicator-modal-change" style="font-size: 14px; color: ${changeColor};">
                                ${changeText}
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
                        <div id="macro-chart-loading" style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; display: flex; align-items: center; justify-content: center; background: rgba(13,13,26,0.95); z-index: 5; transition: opacity 0.3s ease;">
                            <i class="fas fa-spinner fa-spin" style="color: #3b82f6; font-size: 24px;"></i>
                        </div>
                        <button id="macro-maximize-btn" style="position: absolute; top: 8px; right: 8px; background: rgba(0,0,0,0.6); border: none; width: 32px; height: 32px; border-radius: 8px; color: white; cursor: pointer; display: flex; align-items: center; justify-content: center; z-index: 15;" title="Maximizar">
                            <i class="fas fa-expand"></i>
                        </button>
                    </div>
                    
                    <!-- Stats (skeleton placeholders to reserve height) -->
                    <div id="indicator-stats" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 8px;">
                        <div style="background: rgba(255,255,255,0.05); padding: 12px; border-radius: 10px;">
                            <div style="color: #888; font-size: 11px;">Abertura</div>
                            <div style="font-weight: 600; color: #555; height: 20px; background: rgba(255,255,255,0.04); border-radius: 4px; width: 70%; animation: macroPulse 1.5s infinite;"></div>
                        </div>
                        <div style="background: rgba(255,255,255,0.05); padding: 12px; border-radius: 10px;">
                            <div style="color: #888; font-size: 11px;">Fech. Anterior</div>
                            <div style="font-weight: 600; color: #555; height: 20px; background: rgba(255,255,255,0.04); border-radius: 4px; width: 70%; animation: macroPulse 1.5s infinite;"></div>
                        </div>
                        <div style="background: rgba(255,255,255,0.05); padding: 12px; border-radius: 10px;">
                            <div style="color: #888; font-size: 11px;">Máxima</div>
                            <div style="font-weight: 600; color: #555; height: 20px; background: rgba(255,255,255,0.04); border-radius: 4px; width: 70%; animation: macroPulse 1.5s infinite;"></div>
                        </div>
                        <div style="background: rgba(255,255,255,0.05); padding: 12px; border-radius: 10px;">
                            <div style="color: #888; font-size: 11px;">Mínima</div>
                            <div style="font-weight: 600; color: #555; height: 20px; background: rgba(255,255,255,0.04); border-radius: 4px; width: 70%; animation: macroPulse 1.5s infinite;"></div>
                        </div>
                    </div>
                </div>
            </div>
            <style>
                @keyframes slideUp { from { transform: translate3d(0, 100%, 0); } to { transform: translate3d(0, 0, 0); } }
                @keyframes spin { to { transform: rotate(360deg); } }
                @keyframes macroPulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 0.8; } }
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
                _chartRequestId++;
                const canvas = document.getElementById('macro-chart-canvas');
                const loadingEl = document.getElementById('macro-chart-loading');
                if (canvas) { const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height); }
                if (loadingEl) { loadingEl.style.opacity = '1'; loadingEl.style.display = 'flex'; }
                indicatorCandleData = null;
                indicatorChartStats = null;
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
                    if (!isIndicatorModalForSymbol(symbol)) return;
                    if (indicatorChartType === 'candle') {
                        drawIndicatorCandleChart(indicatorCandleData, symbol);
                    } else {
                        drawIndicatorLineChart(indicatorCandleData, symbol);
                    }
                }
            });
        });
        
        // Maximize button
        document.getElementById('macro-maximize-btn').addEventListener('click', () => openFullscreenChart(symbol));
        
        // Pre-fetch data durante animação, mas desenhar só depois
        let prefetchedData = null;
        const initialChartPeriod = indicatorChartPeriod;
        const prefetchPromise = (async () => {
            try {
                pruneChartCache();
                const cacheKey = getChartCacheKey(symbol, initialChartPeriod);
                const cached = chartDataCache[cacheKey];
                if (cached && (Date.now() - cached.timestamp) < CHART_CACHE_TTL) {
                    prefetchedData = cached.data;
                    return;
                }
                prefetchedData = await _fetchYahooChart(symbol, initialChartPeriod);
                if (prefetchedData.length > 0) {
                    chartDataCache[cacheKey] = { data: prefetchedData, timestamp: Date.now() };
                    pruneChartCache();
                }
            } catch(e) { macroLog('Prefetch error: ' + e.message, 'warn'); }
        })();

        // Desenhar gráfico só quando animação terminar + dados prontos
        const modalContent = document.getElementById('indicator-modal-content');
        let _onReadyCalled = false;
        const onReady = async () => {
            if (_onReadyCalled) return; // Prevent double-fire from animationend + fallback
            _onReadyCalled = true;
            // Guard: if user clicked another indicator, abort
            if (!isIndicatorModalForSymbol(symbol, myRequestId)) return;
            await prefetchPromise;
            // Double-check after async wait
            if (!isIndicatorModalForSymbol(symbol, myRequestId)) return;
            if (prefetchedData) {
                setIndicatorCandleData(prefetchedData);
                const loadingEl = document.getElementById('macro-chart-loading');
                if (loadingEl) {
                    loadingEl.style.opacity = '0';
                    setTimeout(() => { loadingEl.style.display = 'none'; }, 300);
                }
                if (indicatorChartType === 'candle') {
                    drawIndicatorCandleChart(indicatorCandleData, symbol);
                } else {
                    drawIndicatorLineChart(indicatorCandleData, symbol);
                }
                syncIndicatorFromChartData(symbol, indicatorCandleData, 'prefetch Yahoo');
            } else {
                loadIndicatorChartData(symbol);
            }
            if (isIndicatorModalForSymbol(symbol, myRequestId)) loadIndicatorStats(symbol);
        };
        if (modalContent) {
            modalContent.addEventListener('animationend', onReady, { once: true });
            // Fallback se animationend não disparar (ex: browser quirk)
            setTimeout(() => {
                if (!_onReadyCalled) onReady();
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
                    <div id="fs-chart-loading" style="position:absolute;top:0;left:0;right:0;bottom:0;display:none;align-items:center;justify-content:center;background:rgba(10,10,15,0.85);z-index:5;transition:opacity 0.3s ease;">
                        <i class="fas fa-spinner fa-spin" style="color:#3b82f6;font-size:28px;"></i>
                    </div>
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
                _chartRequestId++;
                const fsLoadingEl = document.getElementById('fs-chart-loading');
                if (fsLoadingEl) { fsLoadingEl.style.opacity = '1'; fsLoadingEl.style.display = 'flex'; }
                indicatorCandleData = null;
                indicatorChartStats = null;
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
    let macroFsPinchAnchorRatio = 0.5;

    function resetFsZoom() {
        macroFsZoom = 1;
        macroFsPanX = 0;
        macroFsIsDragging = false;
        macroFsLastX = 0;
        macroFsPinchStartDist = 0;
        macroFsPinchStartZoom = 1;
        macroFsIsPinching = false;
        macroFsPinchAnchorRatio = 0.5;
    }

    function getMacroFsCanvasWidth() {
        const container = document.getElementById('fs-chart-container');
        const canvas = document.getElementById('fs-chart-canvas');
        const rect = (container || canvas)?.getBoundingClientRect?.();
        return Math.max(1, rect?.width || canvas?.clientWidth || window.innerWidth || 1);
    }

    function getMacroFsVisibleCount(total, zoom = macroFsZoom) {
        if (!total || total <= 0) return 0;
        const safeZoom = Math.max(1, Math.min(10, Number(zoom) || 1));
        const minVisible = Math.min(total, 2);
        return Math.max(minVisible, Math.min(total, Math.floor(total / safeZoom) || minVisible));
    }

    function getMacroFsViewMeta(total, width, zoom = macroFsZoom, panX = macroFsPanX) {
        const visibleCount = getMacroFsVisibleCount(total, zoom);
        if (!total || visibleCount <= 0) return { visibleCount: 0, startIdx: 0, endIdx: 0, pxPerCandle: 1 };

        const pxPerCandle = Math.max(1, width / Math.max(1, total));
        const maxStart = Math.max(0, total - visibleCount);
        const rawStart = Math.floor(Math.max(0, Number(panX) || 0) / pxPerCandle);
        const startIdx = Math.max(0, Math.min(maxStart, rawStart));

        return {
            visibleCount,
            startIdx,
            endIdx: Math.min(total, startIdx + visibleCount),
            pxPerCandle
        };
    }

    function clampMacroFsPanX(width = getMacroFsCanvasWidth()) {
        const total = Array.isArray(indicatorCandleData) ? indicatorCandleData.length : 0;
        const view = getMacroFsViewMeta(total, width);
        if (!total || view.visibleCount <= 0) {
            macroFsPanX = 0;
            return;
        }

        const maxStart = Math.max(0, total - view.visibleCount);
        const maxPan = maxStart * view.pxPerCandle;
        macroFsPanX = Math.max(0, Math.min(Number(macroFsPanX) || 0, maxPan));
    }

    function setMacroFsZoom(nextZoom, anchorRatio = 0.5) {
        const total = Array.isArray(indicatorCandleData) ? indicatorCandleData.length : 0;
        const width = getMacroFsCanvasWidth();
        const safeAnchor = Math.max(0, Math.min(1, Number(anchorRatio) || 0.5));

        if (!total) {
            macroFsZoom = Math.max(1, Math.min(10, Number(nextZoom) || 1));
            macroFsPanX = 0;
            return;
        }

        const previousView = getMacroFsViewMeta(total, width, macroFsZoom, macroFsPanX);
        const anchorIndex = previousView.startIdx + previousView.visibleCount * safeAnchor;

        macroFsZoom = Math.max(1, Math.min(10, Number(nextZoom) || 1));

        const nextVisibleCount = getMacroFsVisibleCount(total, macroFsZoom);
        const maxStart = Math.max(0, total - nextVisibleCount);
        const nextStart = Math.max(0, Math.min(maxStart, Math.round(anchorIndex - nextVisibleCount * safeAnchor)));
        const pxPerCandle = Math.max(1, width / Math.max(1, total));

        macroFsPanX = nextStart * pxPerCandle;
        clampMacroFsPanX(width);
    }

    function panMacroFs(deltaX) {
        macroFsPanX = Math.max(0, (Number(macroFsPanX) || 0) - deltaX * Math.max(1, macroFsZoom));
        clampMacroFsPanX();
    }

    function getMacroFsVisibleData(candleData, width) {
        const total = Array.isArray(candleData) ? candleData.length : 0;
        const view = getMacroFsViewMeta(total, width);
        macroFsPanX = view.startIdx * view.pxPerCandle;
        return candleData.slice(view.startIdx, view.endIdx);
    }

    function setupFullscreenTouchHandlers(canvas, symbol) {
        resetFsZoom();
        canvas.tabIndex = 0;
        canvas.style.cursor = 'grab';

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
                const rect = canvas.getBoundingClientRect();
                const centerX = ((e.touches[0].clientX + e.touches[1].clientX) / 2) - rect.left;
                macroFsPinchAnchorRatio = rect.width > 0 ? centerX / rect.width : 0.5;
            }
            e.preventDefault();
        }, { passive: false });

        canvas.addEventListener('touchmove', function(e) {
            if (e.touches.length === 1 && macroFsIsDragging) {
                const deltaX = e.touches[0].clientX - macroFsLastX;
                panMacroFs(deltaX);
                macroFsLastX = e.touches[0].clientX;
                redrawFullscreenChart(symbol);
            } else if (e.touches.length === 2) {
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const scale = dist / Math.max(1, macroFsPinchStartDist);
                setMacroFsZoom(macroFsPinchStartZoom * scale, macroFsPinchAnchorRatio);
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

        canvas.addEventListener('wheel', function(e) {
            const rect = canvas.getBoundingClientRect();
            const anchorRatio = rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0.5;
            const zoomFactor = e.deltaY < 0 ? 1.18 : (1 / 1.18);
            setMacroFsZoom(macroFsZoom * zoomFactor, anchorRatio);
            redrawFullscreenChart(symbol);
            e.preventDefault();
        }, { passive: false });

        canvas.addEventListener('mousedown', function(e) {
            macroFsIsDragging = true;
            macroFsLastX = e.clientX;
            canvas.style.cursor = 'grabbing';
            e.preventDefault();
        });

        canvas.addEventListener('mousemove', function(e) {
            if (!macroFsIsDragging) return;
            const deltaX = e.clientX - macroFsLastX;
            panMacroFs(deltaX);
            macroFsLastX = e.clientX;
            redrawFullscreenChart(symbol);
        });

        ['mouseup', 'mouseleave'].forEach((eventName) => {
            canvas.addEventListener(eventName, function() {
                macroFsIsDragging = false;
                canvas.style.cursor = 'grab';
            });
        });

        canvas.addEventListener('dblclick', function() {
            macroFsZoom = 1;
            macroFsPanX = 0;
            redrawFullscreenChart(symbol);
        });

        canvas.addEventListener('keydown', function(e) {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                const direction = e.key === 'ArrowLeft' ? 1 : -1;
                panMacroFs(direction * getMacroFsCanvasWidth() * 0.12);
                redrawFullscreenChart(symbol);
                e.preventDefault();
            } else if (e.key === '+' || e.key === '=') {
                setMacroFsZoom(macroFsZoom * 1.18, 0.5);
                redrawFullscreenChart(symbol);
                e.preventDefault();
            } else if (e.key === '-' || e.key === '_') {
                setMacroFsZoom(macroFsZoom / 1.18, 0.5);
                redrawFullscreenChart(symbol);
                e.preventDefault();
            }
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
        const fsLoadingEl = document.getElementById('fs-chart-loading');
        if (fsLoadingEl) { fsLoadingEl.style.opacity = '1'; fsLoadingEl.style.display = 'flex'; }
        
        // Verificar cache
        const cacheKey = getChartCacheKey(symbol, indicatorChartPeriod);
        const cached = chartDataCache[cacheKey];
        if (cached && (Date.now() - cached.timestamp) < CHART_CACHE_TTL) {
            macroLog(`📦 Fullscreen ${symbol} (${indicatorChartPeriod}) do cache`, 'info');
            setIndicatorCandleData(cached.data);
            if (fsLoadingEl) { fsLoadingEl.style.opacity = '0'; setTimeout(() => { if (fsLoadingEl) fsLoadingEl.style.display = 'none'; }, 300); }
            if (indicatorChartType === 'candle') {
                drawFullscreenCandleChart(indicatorCandleData, symbol);
            } else {
                drawFullscreenLineChart(indicatorCandleData, symbol);
            }
            return;
        }
        
        try {
            setIndicatorCandleData(await _fetchYahooChart(symbol, indicatorChartPeriod));
            
            if (indicatorCandleData.length > 0) {
                chartDataCache[cacheKey] = { data: indicatorCandleData, timestamp: Date.now() };
            }
            
            if (fsLoadingEl) { fsLoadingEl.style.opacity = '0'; setTimeout(() => { if (fsLoadingEl) fsLoadingEl.style.display = 'none'; }, 300); }
            if (indicatorChartType === 'candle') {
                drawFullscreenCandleChart(indicatorCandleData, symbol);
            } else {
                drawFullscreenLineChart(indicatorCandleData, symbol);
            }
        } catch (e) {
            macroLog('Erro fullscreen chart: ' + e.message, 'error');
            if (fsLoadingEl) { fsLoadingEl.style.opacity = '0'; setTimeout(() => { if (fsLoadingEl) fsLoadingEl.style.display = 'none'; }, 300); }
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
        
        const visibleData = getMacroFsVisibleData(candleData, width);
        
        if (visibleData.length === 0) {
            ctx.fillStyle = '#888';
            ctx.font = '14px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Sem dados disponíveis', width / 2, height / 2);
            return;
        }
        
        const padding = { top: 15, right: 65, bottom: 35, left: 10 };
        
        const closes = visibleData.map(c => c[4]);
        const minPrice = Math.min(...closes);
        const maxPrice = Math.max(...closes);
        const priceRange = (maxPrice - minPrice) || maxPrice * 0.01;
        const paddedMin = minPrice - priceRange * 0.05;
        const paddedMax = maxPrice + priceRange * 0.05;
        const paddedRange = paddedMax - paddedMin;
        padding.right = getFullscreenIndicatorRightPadding(ctx, symbol, paddedMin, paddedMax);
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;
        
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
        
        // Price labels (right side)
        ctx.fillStyle = '#aaa';
        ctx.font = '9px -apple-system, sans-serif';
        ctx.textAlign = 'right';
        for (let i = 0; i <= 5; i++) {
            const price = paddedMax - (paddedRange * i / 5);
            const y = padding.top + (chartHeight * i / 5);
            ctx.fillText(formatFullscreenIndicatorPrice(symbol, price), width - 15, y + 3);
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
        const priceLabel = formatFullscreenIndicatorPrice(symbol, lastPrice);
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
        
        const visibleData = getMacroFsVisibleData(candleData, width);
        
        if (visibleData.length === 0) {
            ctx.fillStyle = '#888';
            ctx.font = '14px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Sem dados disponíveis', width / 2, height / 2);
            return;
        }
        
        const padding = { top: 15, right: 65, bottom: 35, left: 10 };
        
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
        padding.right = getFullscreenIndicatorRightPadding(ctx, symbol, paddedMin, paddedMax);
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;
        
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
        
        // Price labels (right side)
        ctx.fillStyle = '#aaa';
        ctx.font = '9px -apple-system, sans-serif';
        ctx.textAlign = 'right';
        for (let i = 0; i <= 5; i++) {
            const price = paddedMax - (paddedRange * i / 5);
            const y = padding.top + (chartHeight * i / 5);
            ctx.fillText(formatFullscreenIndicatorPrice(symbol, price), width - 15, y + 3);
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
        const priceLabel = formatFullscreenIndicatorPrice(symbol, lastClose);
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
        _chartRequestId++;
        const modal = document.getElementById('indicator-modal');
        if (modal) modal.remove();
        document.body.style.overflow = '';
        currentIndicatorSymbol = null;
        indicatorCandleData = null;
        indicatorChartStats = null;
    }

    // ============================================
    // CARREGAR DADOS DO GRÁFICO (YAHOO FINANCE - GRATUITO E ILIMITADO)
    // ============================================
    
    // Cache de dados de gráfico para evitar re-fetch ao trocar timeframes
    const chartDataCache = {};
    const CHART_CACHE_TTL = 5 * 60 * 1000; // 5 minutos
    const MAX_CHART_CACHE_ITEMS = 32;
    
    function getChartCacheKey(symbol, period) {
        return `${symbol}_${period}`;
    }

    function pruneChartCache() {
        const now = Date.now();

        Object.keys(chartDataCache).forEach((key) => {
            const entry = chartDataCache[key];
            if (!entry || !entry.timestamp || (now - entry.timestamp) > CHART_CACHE_TTL) {
                delete chartDataCache[key];
            }
        });

        const keys = Object.keys(chartDataCache);
        if (keys.length <= MAX_CHART_CACHE_ITEMS) return;

        keys
            .sort((a, b) => (chartDataCache[a].timestamp || 0) - (chartDataCache[b].timestamp || 0))
            .slice(0, keys.length - MAX_CHART_CACHE_ITEMS)
            .forEach((key) => delete chartDataCache[key]);
    }

    // Mapa de período → Yahoo Finance interval/range
    const MINUTE_MS = 60 * 1000;
    const HOUR_MS = 60 * MINUTE_MS;
    const DAY_MS = 24 * HOUR_MS;

    const YAHOO_PERIOD_WINDOW_MS = {
        '15m': 15 * MINUTE_MS,
        '30m': 30 * MINUTE_MS,
        '4h': 4 * HOUR_MS,
        '1d': DAY_MS,
        '1w': 7 * DAY_MS,
        '1M': 30 * DAY_MS,
        '6M': 183 * DAY_MS,
        '1Y': 366 * DAY_MS,
    };

    function _toFinitePositive(value, fallback = 0) {
        const n = Number(value);
        return Number.isFinite(n) && n > 0 ? n : fallback;
    }

    function _attachPeriodStats(candles, stats) {
        if (!Array.isArray(candles)) return [];
        try {
            Object.defineProperty(candles, '_periodStats', {
                value: stats || null,
                enumerable: false,
                configurable: true
            });
        } catch (_) {
            candles._periodStats = stats || null;
        }
        return candles;
    }

    function _calculateStatsFromCandles(candles) {
        if (!Array.isArray(candles) || candles.length === 0) return null;
        const valid = candles.filter(c => Array.isArray(c) && _toFinitePositive(c[4], 0) > 0);
        if (valid.length === 0) return null;
        const first = valid[0];
        const last = valid[valid.length - 1];
        const highs = valid.map(c => _toFinitePositive(c[2], _toFinitePositive(c[4], 0))).filter(v => v > 0);
        const lows = valid.map(c => _toFinitePositive(c[3], _toFinitePositive(c[4], 0))).filter(v => v > 0);
        return {
            open: _toFinitePositive(first[1], _toFinitePositive(first[4], 0)),
            previousClose: null,
            high: highs.length ? Math.max(...highs) : null,
            low: lows.length ? Math.min(...lows) : null,
            close: _toFinitePositive(last[4], 0),
            startTs: Number(first[0] || 0) || 0,
            endTs: Number(last[0] || 0) || 0,
            candles: valid.length
        };
    }

    function _selectVisiblePeriodCandles(rawCandles, period) {
        const all = Array.isArray(rawCandles)
            ? rawCandles.filter(c => Array.isArray(c) && _toFinitePositive(c[4], 0) > 0)
            : [];
        if (all.length === 0) return _attachPeriodStats([], null);

        const windowMs = YAHOO_PERIOD_WINDOW_MS[period] || YAHOO_PERIOD_WINDOW_MS['1d'];
        const anchorTs = Number(all[all.length - 1][0] || 0) || Date.now();
        const startTs = anchorTs - windowMs;
        let visible = all.filter(c => Number(c[0] || 0) >= startTs && Number(c[0] || 0) <= anchorTs);
        if (visible.length === 0) visible = all.slice(-1);

        const firstVisibleTs = Number(visible[0]?.[0] || 0) || 0;
        const previous = all.filter(c => Number(c[0] || 0) < firstVisibleTs).slice(-1)[0] || null;
        const stats = _calculateStatsFromCandles(visible);
        if (stats) {
            stats.previousClose = previous ? _toFinitePositive(previous[4], null) : null;
            stats.fullCandles = all.length;
        }
        return _attachPeriodStats(visible, stats);
    }

    function setIndicatorCandleData(candles) {
        indicatorCandleData = Array.isArray(candles) ? candles : [];
        indicatorChartStats = indicatorCandleData._periodStats || _calculateStatsFromCandles(indicatorCandleData);
        return indicatorCandleData;
    }

    const YAHOO_PERIOD_MAP = {
        '15m': { interval: '1m', range: '1d' },
        '30m': { interval: '1m', range: '1d' },
        '4h': { interval: '5m', range: '5d' },
        '1d': { interval: '15m', range: '5d' },
        '1w': { interval: '1h', range: '1mo' },
        '1M': { interval: '1d', range: '3mo' },
        '6M': { interval: '1d', range: '1y' },
        '1Y': { interval: '1d', range: '2y' },
    };

    // Ranges mais amplos para fallback (mercado fechado / fim de semana)
    const FALLBACK_RANGES = {
        '15m': [{ interval: '5m', range: '5d' }],
        '30m': [{ interval: '5m', range: '5d' }],
        '4h': [{ interval: '15m', range: '5d' }, { interval: '1h', range: '1mo' }],
        '1d': [{ interval: '1h', range: '1mo' }],
        '1w': [{ interval: '1d', range: '3mo' }],
        '1M': [{ interval: '1d', range: '6mo' }, { interval: '1h', range: '1mo' }],
        '6M': [{ interval: '1d', range: '2y' }],
        '1Y': [{ interval: '1wk', range: '2y' }, { interval: '1d', range: '5y' }],
    };

    // Buscar dados de gráfico do Yahoo com fallback automático para range mais amplo
    // Retorna array de candles [ts, open, high, low, close, volume] ou []
    async function _fetchYahooChart(symbol, period) {
        const cfg = YAHOO_PERIOD_MAP[period] || YAHOO_PERIOD_MAP['1d'];
        const attempts = [cfg, ...(FALLBACK_RANGES[period] || [])];

        for (const attempt of attempts) {
            const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${attempt.interval}&range=${attempt.range}`;
            let data = null;

            // Tentativa 1: Fetch direto (Android WebView sem CORS)
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 5000);
                const resp = await fetch(yahooUrl, { signal: controller.signal });
                clearTimeout(timeout);
                if (resp.ok) {
                    data = await resp.json();
                    if (!data?.chart?.result?.[0]) data = null;
                }
            } catch (e) { /* proxy abaixo */ }

            // Tentativa 2: Proxies CORS
            if (!data) {
                const proxies = [
                    `https://api.allorigins.win/raw?url=${encodeURIComponent(yahooUrl)}`,
                    `https://corsproxy.io/?${encodeURIComponent(yahooUrl)}`,
                    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(yahooUrl)}`,
                ];
                for (const url of proxies) {
                    try {
                        const controller = new AbortController();
                        const timeout = setTimeout(() => controller.abort(), 6000);
                        const resp = await fetch(url, { signal: controller.signal });
                        clearTimeout(timeout);
                        if (resp.ok) {
                            data = await resp.json();
                            if (data?.chart?.result?.[0]) break;
                            data = null;
                        }
                    } catch (e) { continue; }
                }
            }

            const result = data?.chart?.result?.[0];
            if (!result) continue;

            const timestamps = result.timestamp;
            if (!timestamps || timestamps.length === 0) {
                macroLog(`⚠️ Yahoo ${symbol} range=${attempt.range}: sem candles, tentando range mais amplo...`, 'warn');
                continue; // Mercado fechado — tentar range mais amplo
            }

            const q = result.indicators.quote[0];
            if (!q || !q.close) {
                macroLog(`⚠️ Yahoo ${symbol}: quote vazio, tentando range mais amplo...`, 'warn');
                continue;
            }

            const rawCandles = timestamps.map((ts, i) => [
                ts * 1000,
                _toFinitePositive(q.open?.[i], _toFinitePositive(q.close?.[i], 0)),
                _toFinitePositive(q.high?.[i], _toFinitePositive(q.close?.[i], 0)),
                _toFinitePositive(q.low?.[i], _toFinitePositive(q.close?.[i], 0)),
                _toFinitePositive(q.close?.[i], 0),
                Number(q.volume?.[i] || 0) || 0
            ]).filter(d => d[4] != null && !isNaN(d[4]) && d[4] > 0);
            const candles = _selectVisiblePeriodCandles(rawCandles, period);

            if (candles.length > 0) {
                macroLog(`✅ Yahoo ${symbol} range=${attempt.range}: ${candles.length} candles`, 'success');
                return candles;
            }
        }

        return []; // Nenhum dado disponível em nenhum range
    }
    
    async function loadIndicatorChartData(symbol) {
        macroLog('🚀 loadIndicatorChartData para: ' + symbol, 'info');
        const myRequestId = _chartRequestId;
        const requestPeriod = indicatorChartPeriod;
        
        const loadingEl = document.getElementById('macro-chart-loading');
        const canvas = document.getElementById('macro-chart-canvas');
        
        if (!canvas) {
            macroLog('❌ Canvas não encontrado', 'error');
            return;
        }

        if (!isIndicatorModalForSymbol(symbol, myRequestId)) {
            macroLog('⚠️ Chart request sem modal ativo para ' + symbol, 'warn');
            return;
        }
        
        if (loadingEl) { loadingEl.style.opacity = '1'; loadingEl.style.display = 'flex'; }
        
        // Verificar cache
        pruneChartCache();
        const cacheKey = getChartCacheKey(symbol, requestPeriod);
        const cached = chartDataCache[cacheKey];
        if (cached && (Date.now() - cached.timestamp) < CHART_CACHE_TTL) {
            macroLog(`📦 Gráfico ${symbol} (${requestPeriod}) do cache`, 'info');
            if (!isIndicatorModalForSymbol(symbol, myRequestId)) return;
            setIndicatorCandleData(cached.data);
            if (loadingEl) { loadingEl.style.opacity = '0'; setTimeout(() => { if (loadingEl) loadingEl.style.display = 'none'; }, 300); }
            if (indicatorChartType === 'candle') {
                drawIndicatorCandleChart(indicatorCandleData, symbol);
            } else {
                drawIndicatorLineChart(indicatorCandleData, symbol);
            }
            if (isIndicatorModalForSymbol(symbol, myRequestId)) loadIndicatorStats(symbol);
            return;
        }
        
        try {
            macroLog(`📊 Carregando gráfico: ${symbol} (${requestPeriod})`, 'info');
            
            const candles = await _fetchYahooChart(symbol, requestPeriod);
            
            // Guard: abort if user switched to another indicator
            if (!isIndicatorModalForSymbol(symbol, myRequestId)) {
                macroLog('⚠️ Chart request stale, ignoring result for ' + symbol, 'warn');
                return;
            }
            
            setIndicatorCandleData(candles);
            
            macroLog(`✅ Gráfico carregado: ${indicatorCandleData.length} candles`, 'success');
            
            syncIndicatorFromChartData(symbol, indicatorCandleData, 'gráfico Yahoo');
            
            // Salvar no cache somente quando ha dados reais.
            if (indicatorCandleData.length > 0) {
                chartDataCache[cacheKey] = { data: indicatorCandleData, timestamp: Date.now() };
                pruneChartCache();
            }
            
            // Esconder loading ANTES de desenhar (com fade)
            if (loadingEl) { loadingEl.style.opacity = '0'; setTimeout(() => { if (loadingEl) loadingEl.style.display = 'none'; }, 300); }
            
            if (indicatorChartType === 'candle') {
                drawIndicatorCandleChart(indicatorCandleData, symbol);
            } else {
                drawIndicatorLineChart(indicatorCandleData, symbol);
            }
            if (isIndicatorModalForSymbol(symbol, myRequestId)) loadIndicatorStats(symbol);
            macroLog('✅ Desenho concluído!', 'success');
        } catch (e) {
            if (!isIndicatorModalForSymbol(symbol, myRequestId)) return;
            macroLog('❌ Erro gráfico: ' + e.message, 'error');
            const container = document.getElementById('macro-chart-container');
            if (loadingEl) { loadingEl.style.opacity = '0'; setTimeout(() => { if (loadingEl) loadingEl.style.display = 'none'; }, 300); }
            if (container) {
                let errorOverlay = container.querySelector('.chart-error-overlay');
                if (!errorOverlay) {
                    errorOverlay = document.createElement('div');
                    errorOverlay.className = 'chart-error-overlay';
                    errorOverlay.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(13,13,26,0.95);z-index:6;color:#666;';
                    container.appendChild(errorOverlay);
                }
                errorOverlay.innerHTML = `
                    <i class="fas fa-chart-line" style="font-size: 40px; margin-bottom: 10px; opacity: 0.3;"></i>
                    <p style="margin: 0;">Gráfico indisponível</p>
                    <p style="margin: 4px 0 0; font-size: 11px; color: #555;">${e.message}</p>
                `;
            }
        }
    }

    // ============================================
    // DESENHAR GRÁFICO DE LINHA - v22.0 (igual HOME)
    // ============================================
    function drawIndicatorLineChart(candleData, symbol = currentIndicatorSymbol) {
        const canvas = document.getElementById('macro-chart-canvas');
        const container = document.getElementById('macro-chart-container');
        const loadingEl = document.getElementById('macro-chart-loading');
        
        macroLog('🎨 Desenhando gráfico...', 'info');
        
        if (!canvas || !container) {
            macroLog('❌ Canvas/Container não encontrado', 'error');
            return;
        }

        // Guard: sem dados = mostrar mensagem em vez de NaN
        if (!candleData || candleData.length === 0) {
            if (loadingEl) { loadingEl.style.opacity = '0'; setTimeout(() => { if (loadingEl) loadingEl.style.display = 'none'; }, 300); }
            const rect = container.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;
            canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
            canvas.style.width = rect.width + 'px'; canvas.style.height = rect.height + 'px';
            const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
            ctx.fillStyle = '#0d0d1a'; ctx.fillRect(0, 0, rect.width, rect.height);
            ctx.fillStyle = '#666'; ctx.font = '13px sans-serif'; ctx.textAlign = 'center';
            ctx.fillText('Mercado fechado — sem dados no período', rect.width / 2, rect.height / 2);
            return;
        }
        
        // Remove any error overlay from previous failed attempt
        const errOverlay = container.querySelector('.chart-error-overlay');
        if (errOverlay) errOverlay.remove();
        
        // Esconder loading com fade
        if (loadingEl) { loadingEl.style.opacity = '0'; setTimeout(() => { if (loadingEl) loadingEl.style.display = 'none'; }, 300); }
        
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
        const config = MARKET_INDICATORS[symbol];
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
    function drawIndicatorCandleChart(candleData, symbol = currentIndicatorSymbol) {
        const canvas = document.getElementById('macro-chart-canvas');
        const container = document.getElementById('macro-chart-container');
        const loadingEl = document.getElementById('macro-chart-loading');
        
        if (!canvas || !container) {
            macroLog('❌ Canvas/Container não encontrado', 'error');
            return;
        }

        // Guard: sem dados = mostrar mensagem em vez de NaN
        if (!candleData || candleData.length === 0) {
            if (loadingEl) { loadingEl.style.opacity = '0'; setTimeout(() => { if (loadingEl) loadingEl.style.display = 'none'; }, 300); }
            const rect = container.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;
            canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
            canvas.style.width = rect.width + 'px'; canvas.style.height = rect.height + 'px';
            const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
            ctx.fillStyle = '#0d0d1a'; ctx.fillRect(0, 0, rect.width, rect.height);
            ctx.fillStyle = '#666'; ctx.font = '13px sans-serif'; ctx.textAlign = 'center';
            ctx.fillText('Mercado fechado — sem dados no período', rect.width / 2, rect.height / 2);
            return;
        }
        
        // Remove any error overlay from previous failed attempt
        const errOverlay = container.querySelector('.chart-error-overlay');
        if (errOverlay) errOverlay.remove();
        
        // Esconder loading com fade
        if (loadingEl) { loadingEl.style.opacity = '0'; setTimeout(() => { if (loadingEl) loadingEl.style.display = 'none'; }, 300); }
        
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
        const stats = indicatorChartStats || _calculateStatsFromCandles(indicatorCandleData);
        const open = _toFinitePositive(stats?.open, prevPrice || price);
        const previousClose = _toFinitePositive(stats?.previousClose, null);
        const high = _toFinitePositive(stats?.high, null);
        const low = _toFinitePositive(stats?.low, null);
        const formatStat = (value) => _toFinitePositive(value, 0) > 0
            ? prefix + Number(value).toFixed(decimals)
            : '--';
        
        container.innerHTML = `
            <div style="background: rgba(255,255,255,0.05); padding: 12px; border-radius: 10px;">
                <div style="color: #888; font-size: 11px;">Abertura</div>
                <div style="font-weight: 600; color: white;">${formatStat(open)}</div>
            </div>
            <div style="background: rgba(255,255,255,0.05); padding: 12px; border-radius: 10px;">
                <div style="color: #888; font-size: 11px;">Fech. Anterior</div>
                <div style="font-weight: 600; color: white;">${formatStat(previousClose)}</div>
            </div>
            <div style="background: rgba(255,255,255,0.05); padding: 12px; border-radius: 10px;">
                <div style="color: #888; font-size: 11px;">Máxima</div>
                <div style="font-weight: 600; color: #00ff88;">${formatStat(high)}</div>
            </div>
            <div style="background: rgba(255,255,255,0.05); padding: 12px; border-radius: 10px;">
                <div style="color: #888; font-size: 11px;">Mínima</div>
                <div style="font-weight: 600; color: #ff4444;">${formatStat(low)}</div>
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
    
    // TwelveData symbol mapping for TA data
    const TD_TA_SYMBOL_MAP = {
        'GC=F': 'XAU/USD', 'SI=F': 'XAG/USD', 'CL=F': 'WTI/USD',
        'DX-Y.NYB': 'DXY', '^GSPC': 'SPX', '^NDX': 'NDX',
        '^RUT': 'RUT', '^VIX': 'VIX', 'XLE': 'XLE'
    };

    // Fetch real technical analysis data — TwelveData primary, Yahoo fallback
    async function fetchRealTAData(symbol) {
        let closes = null, highs = null, lows = null;
        
        // === Strategy 1: TwelveData time_series (reliable, CORS-friendly) ===
        const tdSymbol = TD_TA_SYMBOL_MAP[symbol];
        if (tdSymbol) {
            for (let attempt = 0; attempt < 3; attempt++) {
                const apiKey = getTwelveDataKey();
                try {
                    const tdUrl = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(tdSymbol)}&interval=1day&outputsize=90&apikey=${apiKey}`;
                    const res = await fetch(tdUrl, { signal: AbortSignal.timeout(8000) });
                    if (res.ok) {
                        const json = await res.json();
                        if (json.values && json.values.length >= 14) {
                            // TwelveData returns newest first — reverse for chronological order
                            const values = json.values.reverse();
                            closes = values.map(v => parseFloat(v.close)).filter(v => !isNaN(v));
                            highs = values.map(v => parseFloat(v.high)).filter(v => !isNaN(v));
                            lows = values.map(v => parseFloat(v.low)).filter(v => !isNaN(v));
                            break;
                        }
                        // If rate limited (code 429), try next key
                        if (json.code === 429) continue;
                    }
                } catch(e) { /* try next key */ }
            }
        }
        
        // === Strategy 2: Yahoo Finance via CORS proxies ===
        if (!closes || closes.length < 14) {
            const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=3mo`;
            const proxyUrls = [
                `https://api.allorigins.win/raw?url=${encodeURIComponent(yahooUrl)}`,
                `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(yahooUrl)}`,
                `https://corsproxy.io/?${encodeURIComponent(yahooUrl)}`
            ];
            
            for (const proxyUrl of proxyUrls) {
                try {
                    const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(6000) });
                    if (res.ok) {
                        const data = await res.json();
                        const result = data?.chart?.result?.[0];
                        if (result?.indicators?.quote?.[0]) {
                            const quotes = result.indicators.quote[0];
                            closes = (quotes.close || []).filter(c => c != null && !isNaN(c));
                            highs = (quotes.high || []).filter(h => h != null && !isNaN(h));
                            lows = (quotes.low || []).filter(l => l != null && !isNaN(l));
                            if (closes.length >= 14) break;
                        }
                    }
                } catch(e) { /* try next proxy */ }
            }
        }
        
        if (!closes || closes.length < 14) throw new Error('Dados insuficientes para análise');
        
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
    // FED WATCH - DADOS REAIS
    // FRED para taxa atual (DFF/target range) + Polymarket para probabilidades
    // ============================================
    
    // Cache para próximas reuniões FOMC (buscadas da API FMP)
    let _fomcMeetingsCache = { meetings: null, lastUpdate: 0 };
    const FOMC_CACHE_TTL = 24 * 60 * 60 * 1000; // 24h - datas FOMC não mudam frequentemente
    // FOMC rate decisions are restricted to the official schedule.
    async function fetchNextFOMCFromAPI() {
        const schedule = OFFICIAL_SCHEDULE?.FOMC || { agency: 'Federal Reserve', timeET: '14:00' };
        const dates = _mergeOfficialDateEntries('FOMC', [], schedule);
        return dates.map(d => ({ date: d.date, label: d.label || d.date, time: d.time }));
    }
    
    // Cache para dados do Fed
    const FED_CACHE_PERSIST_KEY = 'vc_macro_fed_cache_v2';
    const FED_PROB_CACHE_PERSIST_KEY = 'vc_macro_fed_prob_cache_v1';
    const FED_PROB_CACHE_MAX_AGE = 24 * 60 * 60 * 1000;

    function _loadFedPersistedCache() {
        try {
            const raw = localStorage.getItem(FED_CACHE_PERSIST_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed || !parsed.currentRate) return null;
            return parsed;
        } catch (_) {
            return null;
        }
    }

    function _saveFedPersistedCache(data) {
        try {
            localStorage.setItem(FED_CACHE_PERSIST_KEY, JSON.stringify(data));
        } catch (_) {}
    }

    function toFiniteNumber(value) {
        if (value === null || value === undefined || value === '') return null;
        const num = parseFloat(String(value).replace(',', '.'));
        return Number.isFinite(num) ? num : null;
    }

    function normalizeRateRange(currentRate, targetLower, targetUpper, effectiveRate) {
        if (currentRate && typeof currentRate === 'object') {
            const lower = toFiniteNumber(currentRate.lower);
            const upper = toFiniteNumber(currentRate.upper);
            if (lower !== null && upper !== null) {
                return {
                    lower: Math.min(lower, upper),
                    upper: Math.max(lower, upper)
                };
            }
        }

        if (typeof currentRate === 'string') {
            const nums = String(currentRate).match(/-?\d+(?:[.,]\d+)?/g);
            if (nums && nums.length >= 2) {
                const lower = toFiniteNumber(nums[0]);
                const upper = toFiniteNumber(nums[1]);
                if (lower !== null && upper !== null) {
                    return {
                        lower: Math.min(lower, upper),
                        upper: Math.max(lower, upper)
                    };
                }
            }
        }

        const parsedLower = toFiniteNumber(targetLower);
        const parsedUpper = toFiniteNumber(targetUpper);
        if (parsedLower !== null && parsedUpper !== null) {
            return {
                lower: Math.min(parsedLower, parsedUpper),
                upper: Math.max(parsedLower, parsedUpper)
            };
        }

        const parsedEffective = toFiniteNumber(effectiveRate);
        if (parsedEffective !== null) {
            return {
                lower: parsedEffective - 0.125,
                upper: parsedEffective + 0.125
            };
        }

        return null;
    }

    function normalizeFedProbabilities(probabilities) {
        if (!probabilities || typeof probabilities !== 'object') return null;

        const cutRaw = toFiniteNumber(probabilities.cut != null ? probabilities.cut : probabilities.cutProb);
        const holdRaw = toFiniteNumber(probabilities.hold != null ? probabilities.hold : probabilities.holdProb);
        const hikeRaw = toFiniteNumber(probabilities.hike != null ? probabilities.hike : probabilities.hikeProb);

        if (cutRaw === null || holdRaw === null || hikeRaw === null) return null;

        const cut = Math.max(0, cutRaw);
        const hold = Math.max(0, holdRaw);
        const hike = Math.max(0, hikeRaw);
        const total = cut + hold + hike;
        if (total <= 0) return null;

        const normalizedCut = Math.round((cut / total) * 1000) / 10;
        const normalizedHold = Math.round((hold / total) * 1000) / 10;
        const normalizedHike = Math.max(0, Math.round((100 - normalizedCut - normalizedHold) * 10) / 10);

        return {
            cut: normalizedCut,
            hold: normalizedHold,
            hike: normalizedHike
        };
    }

    function getFedProbabilityMeetingKey(nextMeeting) {
        const d = nextMeeting?.date instanceof Date ? nextMeeting.date : null;
        if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '';
        return d.toISOString().split('T')[0];
    }

    function normalizeFedProbabilityPayload(raw, nextMeeting, fallbackSource = 'Polymarket') {
        const normalized = normalizeFedProbabilities(raw);
        if (!normalized) return null;
        const fetchedAt = Number(raw?.fetchedAt || raw?.updatedAt || Date.now());
        return {
            ...normalized,
            source: raw?.source || fallbackSource,
            eventTitle: raw?.eventTitle || raw?.title || '',
            marketsUsed: Number(raw?.marketsUsed || 0) || null,
            fetchedAt: Number.isFinite(fetchedAt) ? fetchedAt : Date.now(),
            meetingDate: raw?.meetingDate || getFedProbabilityMeetingKey(nextMeeting),
            stale: !!raw?.stale
        };
    }

    function loadFedProbabilityCache(nextMeeting, maxAgeMs = FED_PROB_CACHE_MAX_AGE) {
        try {
            const raw = localStorage.getItem(FED_PROB_CACHE_PERSIST_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            const normalized = normalizeFedProbabilityPayload(parsed, nextMeeting, parsed?.source || 'cache local');
            if (!normalized) return null;

            const meetingKey = getFedProbabilityMeetingKey(nextMeeting);
            if (meetingKey && normalized.meetingDate && normalized.meetingDate !== meetingKey) return null;

            const age = Date.now() - Number(normalized.fetchedAt || 0);
            if (age < 0 || age > maxAgeMs) return null;
            return {
                ...normalized,
                stale: true,
                source: normalized.source || 'cache local'
            };
        } catch (_) {
            return null;
        }
    }

    function saveFedProbabilityCache(probs, nextMeeting) {
        try {
            const normalized = normalizeFedProbabilityPayload(probs, nextMeeting, probs?.source || 'Polymarket');
            if (!normalized) return;
            localStorage.setItem(FED_PROB_CACHE_PERSIST_KEY, JSON.stringify({
                ...normalized,
                stale: false,
                savedAt: Date.now()
            }));
        } catch (_) {}
    }

    function formatFedProbabilityTimestamp(timestamp) {
        const d = new Date(Number(timestamp || 0));
        if (Number.isNaN(d.getTime())) return '';
        return d.toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function normalizeFedData(raw) {
        if (!raw || typeof raw !== 'object') return null;

        const effectiveRate = toFiniteNumber(raw.effectiveRate);
        const targetUpper = toFiniteNumber(raw.targetUpper);
        const targetLower = toFiniteNumber(raw.targetLower);
        const currentRate = normalizeRateRange(raw.currentRate, targetLower, targetUpper, effectiveRate);

        if (!currentRate) return null;

        return {
            ...raw,
            effectiveRate,
            targetUpper,
            targetLower,
            cpi: toFiniteNumber(raw.cpi),
            unemployment: toFiniteNumber(raw.unemployment),
            currentRate,
            probabilities: normalizeFedProbabilities(raw.probabilities)
        };
    }

    function hasUsableFedRateData(data) {
        return !!(
            data &&
            data.currentRate &&
            Number.isFinite(data.currentRate.lower) &&
            Number.isFinite(data.currentRate.upper)
        );
    }

    function getUsableFedRateCache(maxAgeMs = 24 * 60 * 60 * 1000) {
        const cached = normalizeFedData(fedDataCache);
        const age = Date.now() - Number(cached?.lastUpdate || 0);
        if (hasUsableFedRateData(cached) && age >= 0 && age <= maxAgeMs) {
            return cached;
        }
        return null;
    }

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

    const _persistedFed = normalizeFedData(_loadFedPersistedCache());
    if (_persistedFed) {
        fedDataCache = { ...fedDataCache, ..._persistedFed };
    }
    
    // Cache TTL curto para manter Fed Watch próximo do tempo real
    const FED_CACHE_TTL = 5 * 60 * 1000;
    
    // Proxy CORS para contornar restrições do browser
    const CORS_PROXY = 'https://corsproxy.io/?';
    
    // Helper: fetch with AbortController timeout (used by non-FRED calls)
    function _fetchWithTimeout(url, opts = {}, ms = 10000) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), ms);
        return fetch(url, { ...opts, signal: controller.signal })
            .finally(() => clearTimeout(timer));
    }

    function withSoftTimeout(promise, ms, fallback = null) {
        let timer;
        return Promise.race([
            Promise.resolve(promise),
            new Promise(resolve => {
                timer = setTimeout(() => resolve(fallback), ms);
            })
        ]).finally(() => {
            if (timer) clearTimeout(timer);
        });
    }
    
    // Native HTTP request — Capacitor 8 patches fetch() to use native HTTP automatically
    // Multiple fallback strategies for maximum reliability
    async function nativeHttpText(url) { try { if (window.Capacitor?.Plugins?.CapacitorHttp) { const resp = await window.Capacitor.Plugins.CapacitorHttp.request({ url, method: 'GET', connectTimeout: 8000, readTimeout: 8000 }); if (resp.status >= 200 && resp.status < 300) { return typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data); } } } catch (_) {} try { if (window.CapacitorHttp?.request) { const resp = await window.CapacitorHttp.request({ url, method: 'GET', connectTimeout: 8000, readTimeout: 8000 }); if (resp.status >= 200 && resp.status < 300) { return typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data); } } } catch (_) {} const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 8000); try { const response = await fetch(url, { signal: controller.signal }); clearTimeout(timer); if (!response.ok) throw new Error('HTTP ' + response.status); return await response.text(); } catch (err) { clearTimeout(timer); throw err; } }
    async function nativeHttpTextWithHeaders(url, headers = {}, timeoutMs = 8000) {
        try {
            if (window.Capacitor?.Plugins?.CapacitorHttp) {
                const resp = await window.Capacitor.Plugins.CapacitorHttp.request({
                    url, method: 'GET', headers, connectTimeout: timeoutMs, readTimeout: timeoutMs
                });
                if (resp.status >= 200 && resp.status < 300) return typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);
            }
        } catch (_) {}
        try {
            if (window.CapacitorHttp?.request) {
                const resp = await window.CapacitorHttp.request({
                    url, method: 'GET', headers, connectTimeout: timeoutMs, readTimeout: timeoutMs
                });
                if (resp.status >= 200 && resp.status < 300) return typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);
            }
        } catch (_) {}

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(url, { headers, signal: controller.signal });
            clearTimeout(timer);
            if (!response.ok) throw new Error('HTTP ' + response.status);
            return await response.text();
        } catch (err) {
            clearTimeout(timer);
            throw err;
        }
    }
    async function nativeHttpGet(url, options = {}) {
        const connectTimeout = Number(options.connectTimeout) > 0 ? Number(options.connectTimeout) : 8000;
        const readTimeout = Number(options.readTimeout) > 0 ? Number(options.readTimeout) : 8000;
        const fetchTimeoutMs = Number(options.fetchTimeoutMs) > 0
            ? Number(options.fetchTimeoutMs)
            : Math.max(connectTimeout, readTimeout);

        // Strategy 1: Capacitor.Plugins.CapacitorHttp (Capacitor 5-6 style)
        try {
            if (window.Capacitor?.Plugins?.CapacitorHttp) {
                const resp = await window.Capacitor.Plugins.CapacitorHttp.request({
                    url, method: 'GET', connectTimeout, readTimeout
                });
                if (resp.status >= 200 && resp.status < 300) {
                    return typeof resp.data === 'string' ? JSON.parse(resp.data) : resp.data;
                }
            }
        } catch (_) {}

        // Strategy 2: CapacitorHttp global (Capacitor 6+ module style)
        try {
            if (window.CapacitorHttp?.request) {
                const resp = await window.CapacitorHttp.request({
                    url, method: 'GET', connectTimeout, readTimeout
                });
                if (resp.status >= 200 && resp.status < 300) {
                    return typeof resp.data === 'string' ? JSON.parse(resp.data) : resp.data;
                }
            }
        } catch (_) {}

        // Strategy 3: Standard fetch with timeout (Capacitor 8 patches this natively)
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), fetchTimeoutMs);
        try {
            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timer);
            if (!response.ok) throw new Error('HTTP ' + response.status);
            return await response.json();
        } catch (e) {
            clearTimeout(timer);
            throw e;
        }
    }

    function parseFredCsvObservations(csvText, sortOrder = 'desc', limit = 10) {
        if (!csvText || typeof csvText !== 'string') return [];
        const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        if (lines.length <= 1) return [];

        const obs = [];
        const dateRe = /^\d{4}-\d{2}-\d{2}$/;
        const numRe = /^-?\d+(?:\.\d+)?$/;
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            const comma = line.indexOf(',');
            if (comma <= 0) continue;
            const date = line.slice(0, comma).trim();
            const raw = line.slice(comma + 1).trim();
            if (!date || !raw || raw === '.') continue;
            if (!dateRe.test(date)) continue;
            if (!numRe.test(raw)) continue;
            const value = parseFloat(raw);
            if (!Number.isFinite(value)) continue;
            obs.push({ date, value: String(value) });
        }

        if (obs.length === 0) return [];
        if (sortOrder === 'desc') obs.reverse();
        return obs.slice(0, limit);
    }

    function applyFredUnitsTransform(observations, units) {
        if (!units || !Array.isArray(observations) || observations.length === 0) return observations;

        const descObs = observations.slice(); // newest -> oldest
        if (units === 'pch') {
            const out = [];
            for (let i = 0; i < descObs.length - 1; i++) {
                const curr = parseFloat(descObs[i].value);
                const prev = parseFloat(descObs[i + 1].value);
                if (!Number.isFinite(curr) || !Number.isFinite(prev) || prev === 0) continue;
                const pct = ((curr - prev) / Math.abs(prev)) * 100;
                if (!Number.isFinite(pct)) continue;
                out.push({ date: descObs[i].date, value: String(pct) });
            }
            return out;
        }

        if (units === 'pc1') {
            const byYearMonth = new Map();
            descObs.forEach((o) => {
                if (!o || !o.date || !o.value) return;
                byYearMonth.set(o.date.slice(0, 7), parseFloat(o.value));
            });

            const out = [];
            for (const row of descObs) {
                const curr = parseFloat(row.value);
                if (!Number.isFinite(curr)) continue;

                const year = parseInt(row.date.slice(0, 4), 10);
                const month = row.date.slice(5, 7);
                const prevKey = String(year - 1) + '-' + month;
                const prev = byYearMonth.get(prevKey);
                if (!Number.isFinite(prev) || prev === 0) continue;

                const pct = ((curr - prev) / Math.abs(prev)) * 100;
                if (!Number.isFinite(pct)) continue;
                out.push({ date: row.date, value: String(pct) });
            }
            return out;
        }

        return observations;
    }

    function isStrictFredObservation(obs) {
        if (!obs || typeof obs !== 'object') return false;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(obs.date || ''))) return false;
        if (String(obs.value || '') === '.') return false;
        const n = parseFloat(obs.value);
        return Number.isFinite(n);
    }

    async function fetchFredCsvFallback(seriesId, sortOrder = 'desc', limit = 10, units) {
        const csvUrl = 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=' + encodeURIComponent(seriesId);
        const urls = [
            csvUrl,
            CORS_PROXY + encodeURIComponent(csvUrl),
            'https://api.allorigins.win/raw?url=' + encodeURIComponent(csvUrl)
        ];

        const rawLimit = units ? Math.max(limit + 30, limit * 3) : limit;

        for (let i = 0; i < urls.length; i++) {
            try {
                const text = await nativeHttpText(urls[i]);
                if (!text || typeof text !== 'string') continue;

                // Parse em ordem DESC para transformar unidades corretamente.
                const baseObservations = parseFredCsvObservations(text, 'desc', rawLimit);
                if (baseObservations.length === 0) continue;

                let observations = applyFredUnitsTransform(baseObservations, units);
                observations = observations.filter(isStrictFredObservation);
                if (observations.length === 0) continue;

                if (sortOrder === 'asc') observations = observations.slice().reverse();
                return { observations: observations.slice(0, limit) };
            } catch(e) {}
        }

        return { observations: [] };
    }

    // Fetch FRED series data — tries direct first, then CORS proxy as fallback
    async function fetchFredSmart(seriesId, opts = {}) {
        const { sortOrder = 'desc', limit = 10, units } = opts;

        // Preferred path for scale/security: Worker with server-side FRED secret
        if (CALENDAR_WORKER_URL) {
            try {
                const workerHistoryUrl = new URL(CALENDAR_WORKER_URL + '/history');
                workerHistoryUrl.searchParams.set('series', seriesId);
                workerHistoryUrl.searchParams.set('limit', String(limit));
                workerHistoryUrl.searchParams.set('sort', sortOrder);
                if (units) workerHistoryUrl.searchParams.set('units', units);

                const workerRes = await _fetchWithTimeout(
                    workerHistoryUrl.toString(),
                    {},
                    8000
                );
                if (workerRes.ok) {
                    const workerJson = await workerRes.json();
                    if (workerJson && workerJson.success && Array.isArray(workerJson.data) && workerJson.data.length > 0) {
                        let observations = workerJson.data
                            .map((o) => ({ date: o.date, value: String(o.value) }))
                            .filter(isStrictFredObservation);

                        observations.sort((a, b) => {
                            const da = new Date(a.date + 'T00:00:00').getTime();
                            const db = new Date(b.date + 'T00:00:00').getTime();
                            return db - da;
                        });

                        if (sortOrder === 'asc') observations = observations.slice().reverse();
                        return { observations: observations.slice(0, limit) };
                    }
                }
            } catch (e) {
                macroLog('⚠️ Worker /history falhou (' + seriesId + '): ' + e.message, 'warn');
            }
        }

        // Public fallback without API key (fredgraph CSV)
        const csvFallback = await fetchFredCsvFallback(seriesId, sortOrder, limit, units);
        if (Array.isArray(csvFallback.observations) && csvFallback.observations.length > 0) {
            return csvFallback;
        }

        // Fallback: worker proxy (server-side key only)
        if (CALENDAR_WORKER_URL) {
            let url = CALENDAR_WORKER_URL + '/proxy/fred/fred/series/observations?series_id=' + seriesId + '&file_type=json&sort_order=' + sortOrder + '&limit=' + limit;
            if (units) url += '&units=' + units;

            // Tentativa 1: direto
            try {
                return await nativeHttpGet(url);
            } catch (e) {
                macroLog('⚠️ FRED direto falhou (' + seriesId + '): ' + e.message + ', tentando proxy...', 'warn');
            }

            // Tentativa 2: via CORS proxy
            try {
                return await nativeHttpGet(CORS_PROXY + encodeURIComponent(url));
            } catch (e2) {
                macroLog('❌ FRED proxy falhou (' + seriesId + '): ' + e2.message, 'error');
            }
        }

        return { observations: [] };
    }
    
    // ============================================
    // BUSCAR TAXA DO FED VIA FRED API
    // DFF = Effective Federal Funds Rate (mais preciso)
    // DFEDTARU = Target Upper, DFEDTARL = Target Lower
    // ============================================
    async function fetchFedRateFromAPI() {
        // Verificar cache
        const normalizedCache = normalizeFedData(fedDataCache);
        if (fedDataCache.lastUpdate && 
            (Date.now() - fedDataCache.lastUpdate) < FED_CACHE_TTL &&
            hasUsableFedRateData(normalizedCache)) {
            macroLog('📦 Usando cache Fed (válido)', 'info');
            fedDataCache = { ...fedDataCache, ...normalizedCache };
            return fedDataCache;
        }
        
        try {
            macroLog('🔄 Buscando taxa do Fed via FRED API (paralelo)...', 'info');
            
            let effectiveRate = null;
            let targetUpper = null, targetLower = null;
            let cpi = null;
            let unemployment = null;
            let dffDate = null, cpiDate = null, unrateDate = null;
            let dataSource = 'FRED';
            
            // Fetch all FRED series in parallel (instead of sequential)
            const [dffResult, upperResult, lowerResult, cpiResult, unResult] = await Promise.allSettled([
                fetchFredSmart('DFF', { limit: 5 }),
                fetchFredSmart('DFEDTARU', { limit: 5 }),
                fetchFredSmart('DFEDTARL', { limit: 5 }),
                fetchFredSmart('CPIAUCSL', { limit: 13, units: 'pc1' }),
                fetchFredSmart('UNRATE', { limit: 5 })
            ]);
            
            // Extract DFF
            if (dffResult.status === 'fulfilled' && dffResult.value.observations) {
                const obs = dffResult.value.observations.find(o => o.value !== '.');
                if (obs) { effectiveRate = parseFloat(obs.value); dffDate = obs.date; macroLog('✅ DFF: ' + effectiveRate + '%', 'success'); }
            } else if (dffResult.status === 'rejected') {
                macroLog('⚠️ DFF: ' + dffResult.reason.message, 'warn');
            }
            
            // Extract target range
            if (upperResult.status === 'fulfilled' && upperResult.value.observations) {
                const obs = upperResult.value.observations.find(o => o.value !== '.');
                if (obs) targetUpper = parseFloat(obs.value);
            }
            if (lowerResult.status === 'fulfilled' && lowerResult.value.observations) {
                const obs = lowerResult.value.observations.find(o => o.value !== '.');
                if (obs) targetLower = parseFloat(obs.value);
            }
            if (targetUpper && targetLower) macroLog('✅ Target: ' + targetLower + '%-' + targetUpper + '%', 'success');
            
            // Se não conseguiu target, calcular do DFF
            if (effectiveRate && (!targetUpper || !targetLower)) {
                targetUpper = Math.ceil(effectiveRate * 4) / 4;
                targetLower = targetUpper - 0.25;
                macroLog('📊 Target calculado do DFF: ' + targetLower + '%-' + targetUpper + '%', 'info');
            }
            
            // Extract CPI
            if (cpiResult.status === 'fulfilled' && cpiResult.value.observations) {
                const obs = cpiResult.value.observations.find(o => o.value !== '.');
                if (obs) { cpi = parseFloat(obs.value); cpiDate = obs.date; macroLog('✅ CPI: ' + cpi.toFixed(2) + '%', 'success'); }
            }
            
            // Extract unemployment
            if (unResult.status === 'fulfilled' && unResult.value.observations) {
                const obs = unResult.value.observations.find(o => o.value !== '.');
                if (obs) { unemployment = parseFloat(obs.value); unrateDate = obs.date; macroLog('✅ Desemprego: ' + unemployment + '%', 'success'); }
            }

            // Se não conseguiu NENHUM dado da FRED, retornar null (sem dados fake)
            if (!effectiveRate && !targetUpper) {
                macroLog('⚠️ FRED indisponível, sem dados reais disponíveis', 'warn');
                return null; // Vai mostrar mensagem de erro real
            }
            
            // Atualizar cache
            const freshFedData = normalizeFedData({
                effectiveRate,
                targetUpper,
                targetLower,
                currentRate: { lower: targetLower || (effectiveRate - 0.125), upper: targetUpper || (effectiveRate + 0.125) },
                cpi,
                unemployment,
                probabilities: null,
                lastUpdate: Date.now(),
                dataSource,
                obsDate: { dff: dffDate, cpi: cpiDate, unrate: unrateDate }
            });

            if (!hasUsableFedRateData(freshFedData)) {
                macroLog('⚠️ Dados do Fed vieram incompletos, sem faixa de juros válida', 'warn');
                return null;
            }

            fedDataCache = freshFedData;

            _saveFedPersistedCache(fedDataCache);
            
            return fedDataCache;
            
        } catch (e) {
            macroLog('❌ Erro FRED API: ' + e.message, 'error');
            macroLog('❌ Sem dados disponíveis para Fed Watch', 'error');
            return null; // Sem dados fake - vai mostrar erro
        }
    }
    
    // ============================================
    // FED WATCH - PROBABILIDADES REAIS (POLYMARKET)
    // ============================================
    function _parsePolymarketArray(raw) {
        if (Array.isArray(raw)) return raw;
        if (typeof raw !== 'string') return [];

        const trimmed = raw.trim();
        if (!trimmed) return [];

        try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) return parsed;
        } catch (_) {}

        return trimmed
            .split(',')
            .map((item) => item.replace(/^\s*"|"\s*$/g, '').trim())
            .filter(Boolean);
    }

    function _extractPolymarketYesProbability(market) {
        if (!market || typeof market !== 'object') return null;

        const outcomes = _parsePolymarketArray(market.outcomes);
        const prices = _parsePolymarketArray(market.outcomePrices);

        let yesIndex = outcomes.findIndex((item) => String(item || '').trim().toLowerCase() === 'yes');
        if (yesIndex < 0 && outcomes.length === 2) yesIndex = 0;

        let yesPrice = null;
        if (yesIndex >= 0 && yesIndex < prices.length) {
            yesPrice = toFiniteNumber(prices[yesIndex]);
        }

        if (yesPrice === null) {
            yesPrice = toFiniteNumber(
                market.yesPrice != null ? market.yesPrice :
                market.bestYesPrice != null ? market.bestYesPrice :
                market.lastTradePrice
            );
        }

        if (yesPrice === null) return null;
        if (yesPrice > 1) return Math.max(0, Math.min(100, yesPrice));
        return Math.max(0, Math.min(100, yesPrice * 100));
    }

    function _getPolymarketWeight(market) {
        const candidates = [
            market?.volume24hr,
            market?.volume24h,
            market?.oneDayVolume,
            market?.volumeNum,
            market?.volume,
            market?.liquidityNum,
            market?.liquidity
        ];

        for (const value of candidates) {
            const num = toFiniteNumber(value);
            if (num !== null && num > 0) {
                return num;
            }
        }

        return 1;
    }

    function _fedOutcomeFromQuestion(question) {
        const q = String(question || '').toLowerCase();
        if (!q) return null;

        const fedContext = /(fomc|federal reserve|fed funds|interest rate|policy rate|\bfed\b)/.test(q);
        if (!fedContext) return null;

        if (/(no change|hold|unchanged|maintain|pause|stay at)/.test(q)) return 'hold';
        if (/(cut|decrease|lower|drop|down|easing)/.test(q)) return 'cut';
        if (/(hike|increase|raise|higher|up|tightening)/.test(q)) return 'hike';
        return null;
    }

    function _isMarketNearMeetingDate(market, nextMeeting) {
        const meetingDate = nextMeeting?.date instanceof Date ? nextMeeting.date : null;
        if (!(meetingDate instanceof Date) || Number.isNaN(meetingDate.getTime())) return false;

        const rawEndDate = market?.endDate || market?.end_date || market?.closeTime || market?.close_date;
        if (!rawEndDate) return false;

        const endTs = Date.parse(String(rawEndDate));
        if (!Number.isFinite(endTs)) return false;

        const meetingTs = meetingDate.getTime();
        const diff = Math.abs(endTs - meetingTs);
        return diff <= (14 * 24 * 60 * 60 * 1000);
    }

    function _isQuestionForUpcomingMeeting(question, nextMeeting) {
        const q = String(question || '').toLowerCase();
        if (!q) return false;

        if (q.includes('next fed') || q.includes('next fomc')) {
            return true;
        }

        const meetingDate = nextMeeting?.date instanceof Date ? nextMeeting.date : null;
        if (!(meetingDate instanceof Date) || Number.isNaN(meetingDate.getTime())) {
            return true;
        }

        const months = [
            'january', 'february', 'march', 'april', 'may', 'june',
            'july', 'august', 'september', 'october', 'november', 'december'
        ];
        const monthShort = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

        const monthName = months[meetingDate.getMonth()];
        const monthAbbr = monthShort[meetingDate.getMonth()];
        const year = String(meetingDate.getFullYear());
        const monthNum = String(meetingDate.getMonth() + 1).padStart(2, '0');

        if (q.includes(`${year}-${monthNum}`) || q.includes(`${monthNum}/${year}`)) {
            return true;
        }

        const hasMonth = q.includes(monthName) || q.includes(`${monthAbbr}.`) || q.includes(`${monthAbbr} `) || q.endsWith(monthAbbr);
        const hasYear = q.includes(year);
        if (hasMonth && (hasYear || !/\b20\d{2}\b/.test(q))) {
            return true;
        }

        return false;
    }

    function _extractPolymarketEventsPayload(payload) {
        if (Array.isArray(payload)) return payload;
        if (Array.isArray(payload?.data)) return payload.data;
        return [];
    }

    async function _fetchPolymarketEventsPage(limit, offset) {
        const safeLimit = Math.max(50, Math.min(1000, Number(limit) || 200));
        const safeOffset = Math.max(0, Number(offset) || 0);
        const baseUrl = `https://gamma-api.polymarket.com/events?closed=false&limit=${safeLimit}&offset=${safeOffset}`;
        const endpoints = [
            baseUrl,
            CORS_PROXY + encodeURIComponent(baseUrl),
            'https://api.allorigins.win/raw?url=' + encodeURIComponent(baseUrl)
        ];

        for (const endpoint of endpoints) {
            try {
                const data = await nativeHttpGet(endpoint, {
                    connectTimeout: 5200,
                    readTimeout: 5200,
                    fetchTimeoutMs: 5200
                });
                const events = _extractPolymarketEventsPayload(data);
                if (events.length > 0) return events;
            } catch (_) {}
        }

        return [];
    }

    async function fetchFedProbabilitiesFromWorker(nextMeeting) {
        if (!CALENDAR_WORKER_URL) return null;
        const meetingKey = getFedProbabilityMeetingKey(nextMeeting);
        const url = `${CALENDAR_WORKER_URL}/market/fedwatch${meetingKey ? '?meetingDate=' + encodeURIComponent(meetingKey) : ''}`;
        try {
            const data = await nativeHttpGet(url, {
                connectTimeout: 5600,
                readTimeout: 5600,
                fetchTimeoutMs: 5600
            });
            if (!data || data.success === false) return null;
            const normalized = normalizeFedProbabilityPayload(data, nextMeeting, 'Polymarket (Worker)');
            if (!normalized) return null;
            return {
                ...normalized,
                source: data.source || 'Polymarket (Worker)',
                stale: !!data.stale
            };
        } catch (e) {
            macroLog('Worker Fed Watch indisponivel: ' + (e?.message || e), 'warn');
            return null;
        }
    }

    async function fetchFedProbabilitiesFromPolymarket(nextMeeting) {
        const workerProbs = await fetchFedProbabilitiesFromWorker(nextMeeting);
        if (workerProbs && !workerProbs.stale) return workerProbs;

        const directProbs = await fetchFedProbabilitiesDirectFromPolymarket(nextMeeting);
        return directProbs || workerProbs || null;
    }

    async function fetchFedProbabilitiesDirectFromPolymarket(nextMeeting) {
        const meetingDate = nextMeeting?.date instanceof Date ? nextMeeting.date : null;
        const selectFedCandidates = (eventList) => eventList.filter((event) => {
            const title = String(event?.title || event?.slug || '').trim();
            const lower = title.toLowerCase();
            const isFedContext = /(fomc|federal reserve|fed decision|fed decisions|fed rate|fed funds)/.test(lower);
            if (!isFedContext) return false;

            const eventDate = event?.endDate ? new Date(event.endDate) : null;
            const nearMeeting = (
                meetingDate instanceof Date &&
                eventDate instanceof Date &&
                Number.isFinite(eventDate.getTime()) &&
                Math.abs(eventDate.getTime() - meetingDate.getTime()) <= (16 * 24 * 60 * 60 * 1000)
            );

            return nearMeeting || _isQuestionForUpcomingMeeting(title, nextMeeting);
        });

        const events = [];
        const firstBatch = await _fetchPolymarketEventsPage(500, 0);
        if (firstBatch.length > 0) {
            events.push(...firstBatch);
        }

        let fedCandidates = selectFedCandidates(events);

        if (!fedCandidates.length) {
            const pageSize = 200;
            const maxExtraPages = 3;
            for (let page = 1; page <= maxExtraPages; page++) {
                const offset = page * pageSize;
                const pageEvents = await _fetchPolymarketEventsPage(pageSize, offset);
                if (!pageEvents.length) break;
                events.push(...pageEvents);
                fedCandidates = selectFedCandidates(events);
                if (fedCandidates.length) break;
            }
        }

        if (!events.length) {
            macroLog('⚠️ Polymarket não retornou eventos ativos', 'warn');
            return null;
        }

        if (!fedCandidates.length) {
            macroLog('⚠️ Polymarket sem evento de decisão do Fed para a próxima reunião', 'warn');
            return null;
        }

        const selectedEvent = fedCandidates.sort((a, b) => {
            const ad = a?.endDate ? new Date(a.endDate).getTime() : Number.MAX_SAFE_INTEGER;
            const bd = b?.endDate ? new Date(b.endDate).getTime() : Number.MAX_SAFE_INTEGER;
            const meetingTs = meetingDate instanceof Date ? meetingDate.getTime() : ad;
            const da = Math.abs(ad - meetingTs);
            const db = Math.abs(bd - meetingTs);
            if (da !== db) return da - db;

            const av = toFiniteNumber(a?.volume24hr) || 0;
            const bv = toFiniteNumber(b?.volume24hr) || 0;
            return bv - av;
        })[0];

        const eventMarkets = Array.isArray(selectedEvent?.markets) ? selectedEvent.markets : [];
        if (!eventMarkets.length) {
            macroLog('⚠️ Evento Fed da Polymarket veio sem mercados', 'warn');
            return null;
        }

        const totals = { cut: 0, hold: 0, hike: 0 };
        const counts = { cut: 0, hold: 0, hike: 0 };
        let marketsUsed = 0;

        eventMarkets.forEach((market) => {
            if (market?.active === false || market?.closed === true) return;

            const question = String(market?.question || market?.title || '').toLowerCase();
            if (!question) return;

            const yesProbability = _extractPolymarketYesProbability(market);
            if (yesProbability === null) return;

            let bucket = null;
            if (/(no change|unchanged|maintain|pause|stay at|no-change)/.test(question)) {
                bucket = 'hold';
            } else if (/(decrease|cut|lower|down|easing)/.test(question)) {
                bucket = 'cut';
            } else if (/(increase|hike|raise|higher|up|tightening)/.test(question)) {
                bucket = 'hike';
            }

            if (!bucket) return;

            totals[bucket] += yesProbability;
            counts[bucket] += 1;
            marketsUsed++;
        });

        if (marketsUsed === 0) {
            macroLog('⚠️ Mercados do evento Fed não puderam ser classificados em corte/manutenção/alta', 'warn');
            return null;
        }

        let rawCut = Math.max(0, totals.cut);
        let rawHold = Math.max(0, totals.hold);
        let rawHike = Math.max(0, totals.hike);

        if (rawHold <= 0 && (rawCut > 0 || rawHike > 0)) {
            rawHold = Math.max(0, 100 - rawCut - rawHike);
        }

        const normalized = normalizeFedProbabilities({
            cut: rawCut,
            hold: rawHold,
            hike: rawHike
        });

        if (!normalized) {
            macroLog('⚠️ Polymarket retornou dados inválidos para normalização', 'warn');
            return null;
        }

        macroLog(
            `✅ Polymarket Fed: corte ${normalized.cut.toFixed(1)}% | manutenção ${normalized.hold.toFixed(1)}% | alta ${normalized.hike.toFixed(1)}%`,
            'success'
        );

        return {
            ...normalized,
            source: 'Polymarket (Events API)',
            eventTitle: String(selectedEvent?.title || selectedEvent?.slug || 'Fed decision event'),
            marketsUsed,
            fetchedAt: Date.now()
        };
    }

    async function updateFedWatch() {
        const container = document.getElementById('fed-probabilities');
        const nextMeetingEl = document.getElementById('next-fomc-meeting');
        const currentRateEl = document.getElementById('current-fed-rate');
        
        if (!container) return;
        if (window.__vcFedWatchUpdating) return;
        window.__vcFedWatchUpdating = true;
        
        const hasRenderedData = !!container.querySelector('.fed-prob-item');
        if (!hasRenderedData) {
            // Mostrar loading apenas quando não há dados prévios renderizados
            container.innerHTML = `
                <div style="text-align: center; padding: 20px; color: #888;">
                    <i class="fas fa-spinner fa-spin" style="font-size: 20px; margin-bottom: 8px;"></i>
                    <p style="margin: 0;">Carregando dados do Fed...</p>
                </div>
            `;
        }
        
        try {
        const today = new Date();
        let nextMeeting = { label: 'A definir', daysUntil: '--', date: null };
        try {
            const fomcMeetings = await fetchNextFOMCFromAPI();
            for (const meeting of fomcMeetings) {
                const d = new Date(meeting.date + 'T12:00:00');
                if (d >= today) {
                    nextMeeting = { ...meeting, daysUntil: Math.ceil((d - today) / 86400000), date: d };
                    break;
                }
            }
        } catch(e) {
            macroLog('⚠️ Não foi possível buscar próxima reunião FOMC', 'warn');
        }
        
        // Formatar data da próxima reunião
        const meetingDateFormatted = nextMeeting.date ? nextMeeting.date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
        if (nextMeetingEl) nextMeetingEl.innerHTML = `Reunião: <strong>${meetingDateFormatted}</strong> (${nextMeeting.daysUntil} dias)`;

        // Buscar taxa e probabilidades em paralelo sem deixar Polymarket travar o primeiro boot.
        const [fedResult, probsResult] = await Promise.allSettled([
            withSoftTimeout(fetchFedRateFromAPI(), 18000, null),
            withSoftTimeout(fetchFedProbabilitiesFromPolymarket(nextMeeting), 8500, null)
        ]);

        if (fedResult.status === 'rejected') {
            macroLog('⚠️ Erro ao buscar taxa Fed: ' + (fedResult.reason?.message || fedResult.reason || 'desconhecido'), 'warn');
        }

        const fedData = normalizeFedData(fedResult.status === 'fulfilled' ? fedResult.value : null)
            || getUsableFedRateCache();
        
        // Se não há dados da API, mostrar erro
        if (!hasUsableFedRateData(fedData)) {
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
        let probs = normalizeFedProbabilityPayload(
            probsResult.status === 'fulfilled' ? probsResult.value : null,
            nextMeeting,
            'Polymarket'
        );
        if (probsResult.status === 'rejected') {
            macroLog('⚠️ Erro ao buscar probabilidades no Polymarket: ' + (probsResult.reason?.message || probsResult.reason || 'desconhecido'), 'warn');
        }
        
        if (probs) {
            saveFedProbabilityCache(probs, nextMeeting);
        } else {
            const cachedProbs = loadFedProbabilityCache(nextMeeting);
            if (cachedProbs) {
                probs = cachedProbs;
                macroLog('Usando cache local de probabilidades Fed Watch', 'warn');
            }
        }
        
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
                    <p style="margin: 8px 0 0; font-size: 12px; color: #888;">Probabilidades indisponíveis no Polymarket no momento.<br>Nenhum cache anterior válido foi encontrado.</p>
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
        const probabilitySource = probs.stale ? `${probs.source || 'cache local'} (cache)` : (probs.source || 'Polymarket');
        const probabilityFetchedAt = probs.fetchedAt ? formatFedProbabilityTimestamp(probs.fetchedAt) : '';
        
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
                    <span><i class="fas fa-database"></i> Taxa: ${dataSource}</span>
                </div>
                <div style="font-size: 9px; color: #444;">
                    Probabilidades: ${probabilitySource}${probs.eventTitle ? ' · ' + probs.eventTitle : ''}${probs.marketsUsed ? ' (' + probs.marketsUsed + ' mercados)' : ''}<br>
                    DFF: ${fedData.effectiveRate ? fedData.effectiveRate.toFixed(2) + '%' : '--'}${fedData.obsDate?.dff ? ' (' + new Date(fedData.obsDate.dff + 'T00:00:00').toLocaleDateString('pt-BR', {day:'2-digit',month:'2-digit'}) + ')' : ''} | CPI: ${fedData.cpi ? fedData.cpi.toFixed(1) + '%' : '--'}${fedData.obsDate?.cpi ? ' (' + new Date(fedData.obsDate.cpi + 'T00:00:00').toLocaleDateString('pt-BR', {day:'2-digit',month:'2-digit'}) + ')' : ''} | Desemp: ${fedData.unemployment ? fedData.unemployment.toFixed(1) + '%' : '--'}${fedData.obsDate?.unrate ? ' (' + new Date(fedData.obsDate.unrate + 'T00:00:00').toLocaleDateString('pt-BR', {day:'2-digit',month:'2-digit'}) + ')' : ''}
                </div>
                ${probs.stale ? `
                <div style="padding: 6px 8px; background: rgba(245,158,11,0.12); border-radius: 6px; font-size: 9px; color: #d6a540; line-height: 1.4;">
                    <i class="fas fa-history" style="margin-right: 3px;"></i>
                    Polymarket indisponivel agora; usando ultimo carregamento salvo${probabilityFetchedAt ? ' de ' + probabilityFetchedAt : ''}.
                </div>` : ''}
                <div style="margin-top: 6px; padding: 6px 8px; background: rgba(234,179,8,0.10); border-radius: 6px; font-size: 9px; color: #b89a00; line-height: 1.4;">
                    <i class="fas fa-info-circle" style="margin-right: 3px;"></i>
                    Probabilidades exibidas apenas de mercados ativos do Polymarket (Gamma API), sem modelo interno de estimativa.
                </div>
            </div>
        `;
        } catch(e) {
            if (currentRateEl) currentRateEl.textContent = '--';
            container.innerHTML = `
                <div style="text-align: center; padding: 30px; color: #ef4444;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 32px; margin-bottom: 12px; opacity: 0.7;"></i>
                    <p style="margin: 0; font-weight: 600;">Erro ao carregar dados</p>
                    <p style="margin: 8px 0 0; font-size: 12px; color: #888;">Erro: ${e.message || 'desconhecido'}</p>
                    <button onclick="window.updateFedWatch()" style="margin-top: 12px; padding: 8px 16px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; color: white; cursor: pointer; font-size: 12px;">
                        <i class="fas fa-sync-alt"></i> Tentar novamente
                    </button>
                </div>
            `;
        } finally {
            window.__vcFedWatchUpdating = false;
        }
    }

    // ============================================
    // CALENDÁRIO ECONÔMICO - FMP API
    // Eventos futuros via FMP, histórico via FRED API
    // ============================================
    
    // Cache para histórico de eventos
    let ECONOMIC_HISTORY_CACHE = {};
    const ECONOMIC_HISTORY_CACHE_TTL = 5 * 60 * 1000; // 5min para aproximar releases recentes sem martelar FRED
    const ECONOMIC_HISTORY_MAX_KEYS = 40;
    const ECONOMIC_HISTORY_LS_KEY = 'vc_macro_econ_history_cache';

    // Persistir cache no localStorage para sobreviver restarts
    function loadPersistedHistoryCache() {
        try {
            const raw = localStorage.getItem(ECONOMIC_HISTORY_LS_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (typeof parsed === 'object' && parsed !== null) {
                    ECONOMIC_HISTORY_CACHE = parsed;
                }
            }
        } catch (_) {}
    }
    function savePersistedHistoryCache() {
        try {
            localStorage.setItem(ECONOMIC_HISTORY_LS_KEY, JSON.stringify(ECONOMIC_HISTORY_CACHE));
        } catch (_) {}
    }
    // Load persisted cache on module init
    loadPersistedHistoryCache();

    function getEconomicHistoryFromCache(eventTitle) {
        const entry = ECONOMIC_HISTORY_CACHE[eventTitle];
        if (!entry) return [];

        // Compatibilidade com cache legado (array direto)
        if (Array.isArray(entry)) return entry;

        if (!entry.ts || !Array.isArray(entry.data)) {
            delete ECONOMIC_HISTORY_CACHE[eventTitle];
            return [];
        }

        if ((Date.now() - entry.ts) > ECONOMIC_HISTORY_CACHE_TTL) {
            delete ECONOMIC_HISTORY_CACHE[eventTitle];
            return [];
        }

        return entry.data;
    }

    function setEconomicHistoryCache(eventTitle, history) {
        ECONOMIC_HISTORY_CACHE[eventTitle] = {
            data: Array.isArray(history) ? history : [],
            ts: Date.now()
        };

        const keys = Object.keys(ECONOMIC_HISTORY_CACHE);
        if (keys.length > ECONOMIC_HISTORY_MAX_KEYS) {
            keys
                .sort((a, b) => {
                    const ta = ECONOMIC_HISTORY_CACHE[a]?.ts || 0;
                    const tb = ECONOMIC_HISTORY_CACHE[b]?.ts || 0;
                    return ta - tb;
                })
                .slice(0, keys.length - ECONOMIC_HISTORY_MAX_KEYS)
                .forEach((key) => delete ECONOMIC_HISTORY_CACHE[key]);
        }

        // Persist to localStorage for survival across restarts
        savePersistedHistoryCache();
    }
    
    // Mapeamento de eventos para séries FRED (mais confiável)
    // Ordem importa: chaves mais específicas primeiro para evitar match errado
    const FRED_SERIES = {
        // --- Inflação ---
        'Core CPI': 'CPILFESL',
        'CPI Core': 'CPILFESL',
        'CPI': 'CPIAUCSL',
        'Inflação': 'CPIAUCSL',
        'Core PCE': 'PCEPILFE',
        'PCE Core': 'PCEPILFE',
        'PCE': 'PCEPI',
        'PPI': 'PPIACO',
        'Produtor': 'PPIACO',
        'Preços de Importação': 'IR',
        'Import Prices': 'IR',
        'Preços de Exportação': 'IQ',
        'Export Prices': 'IQ',
        // --- Emprego ---
        'Non-Farm': 'PAYEMS',
        'NFP': 'PAYEMS',
        'Payroll': 'PAYEMS',
        'Folha de Pagamento': 'PAYEMS',
        'Relatório de Emprego': 'PAYEMS',
        'ADP': 'ADPWNUSNERSA',
        'Empregos Privados': 'ADPWNUSNERSA',
        'JOLTS': 'JTSJOL',
        'Vagas de Emprego': 'JTSJOL',
        'Job Openings': 'JTSJOL',
        'Unemployment': 'UNRATE',
        'Desemprego': 'UNRATE',
        'Taxa de Desemprego': 'UNRATE',
        'Continuidade Seguro': 'CCSA',
        'Continuing': 'CCSA',
        'Pedidos Seguro': 'ICSA',
        'Jobless': 'ICSA',
        'Seguro-Desemprego': 'ICSA',
        'Initial Claims': 'ICSA',
        'Salário Médio por Hora': 'CES0500000003',
        'Salário Médio': 'CES0500000003',
        'Average Hourly': 'CES0500000003',
        'Hourly Earnings': 'CES0500000003',
        'Emprego': 'PAYEMS',
        'Employment': 'PAYEMS',
        'Jobs': 'PAYEMS',
        // --- PIB ---
        'GDP': 'GDP',
        'PIB': 'GDP',
        // --- Varejo & Consumidor ---
        'Retail': 'RSXFS',
        'Varejo': 'RSXFS',
        'Vendas no Varejo': 'RSXFS',
        'Gastos Pessoais': 'PCE',
        'Personal Spending': 'PCE',
        'Renda Pessoal': 'PI',
        'Personal Income': 'PI',
        'Confiança CB': 'CSCICP03USM665S',
        'CB Consumer': 'CSCICP03USM665S',
        'Sentimento Michigan': 'UMCSENT',
        'Michigan': 'UMCSENT',
        'UoM Consumer': 'UMCSENT',
        'Confiança': 'UMCSENT',
        'Sentimento': 'UMCSENT',
        'Consumer Confidence': 'UMCSENT',
        // --- Manufatura & Indústria ---
        'ISM Manufatura': 'MANEMP',
        'ISM Manufacturing': 'MANEMP',
        'ISM Serviços': 'NMFCI',
        'ISM Services': 'NMFCI',
        'PMI Chicago': 'NAPM',
        'PMI': 'NAPM',
        'ISM': 'NAPM',
        'Manufatura Filadélfia': 'GAFDISA066MSFRBPHI',
        'Filadélfia': 'GAFDISA066MSFRBPHI',
        'Philly': 'GAFDISA066MSFRBPHI',
        'Empire State': 'GAFDISA066MSFRBNY',
        'Produção Industrial': 'INDPRO',
        'Industrial Production': 'INDPRO',
        'Utilização da Capacidade': 'TCU',
        'Capacity Utilization': 'TCU',
        'Encomendas à Indústria': 'AMTMNO',
        'Factory Orders': 'AMTMNO',
        'Bens Duráveis': 'DGORDER',
        'Durable': 'DGORDER',
        'Duráveis': 'DGORDER',
        // --- Habitação ---
        'Início de Construções': 'HOUST',
        'Housing Starts': 'HOUST',
        'Licenças de Construção': 'PERMIT',
        'Building Permits': 'PERMIT',
        'Vendas Casas Novas': 'HSN1F',
        'New Home Sales': 'HSN1F',
        'Vendas Casas Existentes': 'EXHOSLUSM495S',
        'Existing Home': 'EXHOSLUSM495S',
        'Housing': 'HOUST',
        'Habitação': 'HOUST',
        'Construção': 'HOUST',
        // --- Comércio ---
        'Balança Comercial': 'BOPGSTB',
        'Trade Balance': 'BOPGSTB',
        'Balança': 'BOPGSTB',
        'Trade': 'BOPGSTB',
        'Conta Corrente': 'NETFI',
        'Current Account': 'NETFI',
        // --- Outros ---
        'Indicadores Antecedentes': 'USSLIND',
        'Leading Indicators': 'USSLIND',
        'Expectativas de Inflação': 'MICH',
        'Inflation Expectations': 'MICH',
        'Estoques de Petróleo': 'WCOILWTICO',
        'Crude Oil': 'WCOILWTICO',
        'Orçamento do Tesouro': 'MTSDS133FMS',
        'Treasury Budget': 'MTSDS133FMS',
        'Industrial': 'INDPRO'
    };

    const FRED_SERIES_BY_CATEGORY = Object.freeze({
        NFP: 'PAYEMS',
        CPI: 'CPIAUCSL',
        PPI: 'PPIFID',
        GDP: 'A191RL1Q225SBEA',
        PCE: 'PCEPILFE',
        FOMC: 'DFEDTARU',
        FOMC_STMT: 'DFEDTARU',
        FOMC_MIN: 'DFEDTARU',
        FOMC_PRESS: 'DFEDTARU',
        UNEMP: 'UNRATE',
        CLAIMS: 'ICSA',
        RETAIL: 'RSAFS',
        JOLTS: 'JTSJOL',
        DURABLES: 'DGORDER'
    });

    const OFFICIAL_EVENT_SERIES_CONFIG = Object.freeze({
        NFP: { series: 'PAYEMS', format: 'changeK', decimals: 0 },
        CPI: { series: 'CPIAUCSL', units: 'pch', suffix: '%', decimals: 1 },
        CORE_CPI: { series: 'CPILFESL', units: 'pch', suffix: '%', decimals: 1 },
        PPI: { series: 'PPIFID', units: 'pch', suffix: '%', decimals: 1 },
        GDP: { series: 'A191RL1Q225SBEA', suffix: '%', decimals: 1 },
        PCE: { series: 'PCEPILFE', units: 'pch', suffix: '%', decimals: 1 },
        HEADLINE_PCE: { series: 'PCEPI', units: 'pch', suffix: '%', decimals: 1 },
        FOMC: { series: 'DFEDTARU', suffix: '%', decimals: 2, fomc: true },
        FOMC_STMT: { series: 'DFEDTARU', suffix: '%', decimals: 2, fomc: true },
        FOMC_MIN: { series: 'DFEDTARU', suffix: '%', decimals: 2, fomc: true },
        FOMC_PRESS: { series: 'DFEDTARU', suffix: '%', decimals: 2, fomc: true },
        UNEMP: { series: 'UNRATE', suffix: '%', decimals: 1 },
        CLAIMS: { series: 'ICSA', format: 'countK', decimals: 0 },
        RETAIL: { series: 'RSAFS', units: 'pch', suffix: '%', decimals: 1 },
        JOLTS: { series: 'JTSJOL', format: 'thousandToM', decimals: 2 },
        DURABLES: { series: 'DGORDER', units: 'pch', suffix: '%', decimals: 1 },
        MICHIGAN: { series: 'UMCSENT', decimals: 1 }
    });

    function normalizeEventText(raw) {
        return String(raw || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
    }

    function _getCalendarEventCategory(eventItem, fallbackTitle = '') {
        return eventItem?.category || _calEventCategory(eventItem?.title || fallbackTitle);
    }

    function _resolveOfficialSeriesConfig(eventInput, fallbackTitle = '') {
        const eventItem = (eventInput && typeof eventInput === 'object') ? eventInput : null;
        const title = String(eventItem?.title || eventInput || fallbackTitle || '');
        const normalizedTitle = normalizeEventText(title);

        let key = null;
        if (normalizedTitle.includes('core cpi') || normalizedTitle.includes('cpi core') || normalizedTitle.includes('nucleo cpi')) {
            key = 'CORE_CPI';
        } else if (normalizedTitle.includes('core pce') || normalizedTitle.includes('pce core') || normalizedTitle.includes('nucleo pce')) {
            key = 'PCE';
        } else if (normalizedTitle.includes('pce')) {
            key = 'HEADLINE_PCE';
        } else if (normalizedTitle.includes('michigan') || normalizedTitle.includes('uom consumer')) {
            key = 'MICHIGAN';
        } else {
            key = _getCalendarEventCategory(eventItem, title);
        }

        const config = key ? OFFICIAL_EVENT_SERIES_CONFIG[key] : null;
        if (!config || !config.series) return null;
        const adjustedConfig = { ...config };
        if (['CPI', 'CORE_CPI', 'PPI', 'PCE', 'HEADLINE_PCE'].includes(key)) {
            if (/\b(y\/y|yoy|a\/a|anual)\b/.test(normalizedTitle)) adjustedConfig.units = 'pc1';
            if (/\b(m\/m|mom|mensal)\b/.test(normalizedTitle)) adjustedConfig.units = 'pch';
        }

        return {
            ...adjustedConfig,
            key,
            cacheKey: `fred:${adjustedConfig.series}:${adjustedConfig.units || 'raw'}:${adjustedConfig.format || 'value'}`
        };
    }

    function _formatOfficialSeriesValue(config, actual, previous = null) {
        if (!config || !Number.isFinite(actual)) return '';

        if (config.format === 'changeK') {
            if (!Number.isFinite(previous)) return '';
            const change = actual - previous;
            return `${change >= 0 ? '+' : ''}${Math.round(change).toLocaleString('pt-BR')}K`;
        }

        if (config.format === 'countK') {
            return `${Math.round(actual / 1000).toLocaleString('pt-BR')}K`;
        }

        if (config.format === 'thousandToM') {
            return `${(actual / 1000).toLocaleString('pt-BR', {
                minimumFractionDigits: config.decimals ?? 2,
                maximumFractionDigits: config.decimals ?? 2
            })}M`;
        }

        const decimals = config.decimals ?? 1;
        return actual.toLocaleString('pt-BR', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        }) + (config.suffix || '');
    }
    
    // Histórico de decisões do FOMC - carregado dinamicamente via FRED API
    // NÃO usar dados hardcoded - buscar do FRED (DFEDTARU series)
    let FOMC_DECISIONS_HISTORY_CACHE = null;
    
    async function fetchFOMCDecisionsFromFRED() {
        if (FOMC_DECISIONS_HISTORY_CACHE) return FOMC_DECISIONS_HISTORY_CACHE;
        
        try {
            let data = null;
            
            try {
                data = await fetchFredSmart('DFEDTARU', { limit: 500 });
            } catch(e) { /* fallback below */ }
            
            if (!data || !data.observations) return [];

            const sortedObs = data.observations.slice().sort((a, b) => {
                const da = new Date((a.date || '') + 'T00:00:00').getTime();
                const db = new Date((b.date || '') + 'T00:00:00').getTime();
                return db - da;
            });
            
            // Encontrar mudanças de taxa (dados em ordem DESC - mais recente primeiro)
            const decisions = [];
            let prevValue = null;
            
            for (const obs of sortedObs) {
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
    async function fetchEconomicHistoryFromAI(eventTitleOrItem, options = {}) {
        const { forceRefresh = false } = options;
        const eventItem = (eventTitleOrItem && typeof eventTitleOrItem === 'object') ? eventTitleOrItem : null;
        const eventTitle = String(eventItem?.title || eventTitleOrItem || '');
        const seriesConfig = _resolveOfficialSeriesConfig(eventItem || eventTitle);
        const eventCategory = _getCalendarEventCategory(eventItem, eventTitle);
        const historyCacheKey = seriesConfig?.cacheKey || `title:${normalizeEventText(eventTitle)}`;

        // Verificar cache local primeiro (exceto em atualização forçada do modal aberto)
        if (!forceRefresh) {
            const cachedHistory = getEconomicHistoryFromCache(historyCacheKey);
            if (cachedHistory.length > 0) {
                macroLog(`📦 Histórico de ${eventTitle} do cache`, 'info');
                return cachedHistory;
            }
        }

        const titleLower = normalizeEventText(eventTitle);
        const unsupportedHistoryCategories = new Set(['ISM_MFG', 'ISM_SVC', 'CONF', 'ADP']);
        if (!seriesConfig && unsupportedHistoryCategories.has(eventCategory)) {
            macroLog(`⚠️ ${eventTitle}: sem série oficial confiável`, 'warn');
            return [];
        }
        
        // Para FOMC/Fed/Taxa/Juros - usar histórico de decisões pré-definido
        const hasFomcKeyword = [
            'fomc',
            'taxa de juros',
            'rate decision',
            'interest rate',
            'federal funds',
            'comunicado fomc',
            'ata do fomc',
            'coletiva fomc'
        ].some(k => titleLower.includes(k));
        const hasInflationContext = ['pce', 'cpi', 'ppi', 'infla'].some(k => titleLower.includes(k));
        const isFOMCEvent = !!seriesConfig?.fomc || (hasFomcKeyword && !hasInflationContext);
        
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
                setEconomicHistoryCache(historyCacheKey, history);
                return history;
            }
            return [];
        }
        
        try {
            // Encontrar a série FRED correspondente
            let fredSeries = seriesConfig?.series || null;
            let resolvedConfig = seriesConfig || null;
            
            if (!fredSeries) {
                for (const [key, series] of Object.entries(FRED_SERIES)) {
                    if (titleLower.includes(normalizeEventText(key))) {
                        fredSeries = series;
                        break;
                    }
                }
            }

            // Fallback robusto por categoria quando o título variar entre fontes.
            if (!fredSeries) {
                const category = _getCalendarEventCategory(eventItem, eventTitle);
                if (category && FRED_SERIES_BY_CATEGORY[category]) {
                    fredSeries = FRED_SERIES_BY_CATEGORY[category];
                    resolvedConfig = OFFICIAL_EVENT_SERIES_CONFIG[category] || null;
                }
            }
            
            if (!fredSeries) {
                macroLog(`⚠️ Indicador ${eventTitle} não mapeado para FRED`, 'warn');
                return [];
            }
            
            macroLog(`🔄 Buscando histórico de ${eventTitle} via FRED...`, 'info');
            
            // Usar FRED API com proxy CORS
            const isPercentage = ['UNRATE', 'DFF', 'DFEDTARU', 'DFEDTARL', 'TCU', 'MICH'].includes(fredSeries) || !!resolvedConfig?.suffix;
            const needsYoY = !resolvedConfig && ['CPIAUCSL', 'GDP', 'PCEPI', 'CPILFESL', 'PCEPILFE', 'PPIACO', 'PPIFID'].includes(fredSeries); // Variação YoY
            const needsMoM = !resolvedConfig && ['RSXFS', 'RSAFS', 'CES0500000003'].includes(fredSeries); // Variação m/m
            
            // Para FOMC/Fed Rate, buscar mais dados e filtrar apenas mudanças
            const limit = fredSeries === 'DFEDTARU' ? 50 : 12;
            
            const opts = { limit };
            if (resolvedConfig?.units) opts.units = resolvedConfig.units;
            else if (needsYoY) opts.units = 'pc1';
            else if (needsMoM) opts.units = 'pch';
            
            const data = await fetchFredSmart(fredSeries, opts);
            
            if (data.observations && data.observations.length > 0) {
                // Filtrar valores válidos
                let validObs = data.observations.filter((o) => {
                    if (!isStrictFredObservation(o)) return false;
                    const v = parseFloat(o.value);
                    if (!Number.isFinite(v)) return false;
                    // Remove outliers absurdos causados por respostas corrompidas/proxy.
                    if ((isPercentage || needsYoY || needsMoM) && Math.abs(v) > 200) return false;
                    if (fredSeries === 'UNRATE' && (v < 0 || v > 60)) return false;
                    if ((fredSeries === 'DFEDTARU' || fredSeries === 'DFF') && (v < -5 || v > 40)) return false;
                    return true;
                });

                // Normalizar ordenação para mais recente -> mais antigo
                validObs.sort((a, b) => {
                    const da = new Date((a.date || '') + 'T00:00:00').getTime();
                    const db = new Date((b.date || '') + 'T00:00:00').getTime();
                    return db - da;
                });

                // Garantir que o modal mostre sempre meses recentes (evitar dados muito antigos)
                const cutoff = new Date();
                cutoff.setMonth(cutoff.getMonth() - 6);
                const recentObs = validObs.filter((o) => {
                    const d = new Date((o.date || '') + 'T00:00:00');
                    return !isNaN(d.getTime()) && d >= cutoff;
                });
                if (recentObs.length >= 3) {
                    validObs = recentObs;
                }
                
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
                    
                    if (resolvedConfig) {
                        return {
                            date: item.date,
                            actual: _formatOfficialSeriesValue(resolvedConfig, actual, previous),
                            previous: Number.isFinite(previous) ? _formatOfficialSeriesValue(resolvedConfig, previous, validObs[index + 2] ? parseFloat(validObs[index + 2].value) : null) : '-',
                            forecast: '-',
                            impact: 'high'
                        };
                    }

                    // Formatar valores
                    const suffix = (isPercentage || needsYoY || needsMoM) ? '%' : '';
                    const decimals = isPercentage ? 2 : ((needsYoY || needsMoM) ? 1 : 0);
                    
                    // Para NFP mostrar variação em milhares
                    if (fredSeries === 'PAYEMS') {
                        const change = previous !== null && previous !== undefined ? (actual - previous) : 0;
                        return {
                            date: item.date,
                            actual: `${change >= 0 ? '+' : ''}${Math.round(change).toLocaleString('pt-BR')}K`,
                            previous: prev ? `${Math.round(previous).toLocaleString('pt-BR')}K (total)` : '-',
                            forecast: '-',
                            impact: 'high'
                        };
                    }

                    // ADP também deve ser mostrado como variação mensal em milhares (não valor absoluto gigante).
                    if (fredSeries === 'ADPWNUSNERSA') {
                        const change = previous !== null && previous !== undefined ? (actual - previous) : 0;
                        return {
                            date: item.date,
                            actual: `${change >= 0 ? '+' : ''}${Math.round(change).toLocaleString('pt-BR')}K`,
                            previous: prev ? `${Math.round(previous).toLocaleString('pt-BR')}K (total)` : '-',
                            forecast: '-',
                            impact: 'high'
                        };
                    }

                    const formattedActual = (isPercentage || needsYoY || needsMoM)
                        ? (actual.toFixed(decimals) + suffix)
                        : actual.toLocaleString('pt-BR', {
                            minimumFractionDigits: decimals,
                            maximumFractionDigits: decimals
                        });

                    const formattedPrevious = prev
                        ? ((isPercentage || needsYoY || needsMoM)
                            ? (previous.toFixed(decimals) + suffix)
                            : previous.toLocaleString('pt-BR', {
                                minimumFractionDigits: decimals,
                                maximumFractionDigits: decimals
                            }))
                        : '-';
                    
                    return {
                        date: item.date,
                        actual: formattedActual,
                        previous: formattedPrevious,
                        forecast: '-',
                        impact: 'high'
                    };
                });
                
                setEconomicHistoryCache(historyCacheKey, history);
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
    const CALENDAR_CACHE_TTL = 2 * 60 * 1000; // atualiza perto de tempo real sem refetch por clique
    const CALENDAR_REFRESH_INTERVAL = 2 * 60 * 1000;
    const CALENDAR_LOOKAHEAD_DAYS = 30;

    // Cache para datas FRED (renovado a cada 12h — datas de release mudam raramente)
    let fredDatesCache = { data: null, lastUpdate: null };
    const FRED_DATES_CACHE_TTL = 12 * 60 * 60 * 1000;
    
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

    const MEDIUM_IMPACT_EVENTS = [
        'Housing Starts', 'Building Permits', 'Existing Home Sales', 'New Home Sales',
        'Trade Balance', 'Factory Orders', 'Industrial Production', 'Capacity Utilization',
        'Philly Fed', 'Philadelphia Fed', 'Empire State', 'Chicago PMI',
        'Import Prices', 'Export Prices', 'Leading Indicators', 'Current Account',
        'Consumer Credit', 'Business Inventories', 'Wholesale Inventories',
        'Crude Oil Inventories', 'Treasury Auction'
    ];

    function _isFedSpeechTitle(title) {
        const t = normalizeEventText(title);
        if (!t) return false;
        const hasFedContext = (
            t.includes('fomc member') ||
            t.includes('membro do fomc') ||
            t.includes('fed chair') ||
            t.includes('presidente do fed') ||
            t.includes('fed governor') ||
            t.includes('federal reserve governor') ||
            t.includes('federal reserve bank') ||
            t.includes('federal reserve') ||
            t.includes('discurso fed') ||
            t.includes('discurso powell')
        );
        const hasSpeechAction = (
            t.includes('speaks') ||
            t.includes('speech') ||
            t.includes('remarks') ||
            t.includes('testifies') ||
            t.includes('testimony') ||
            t.includes('discurso') ||
            t.includes('fala')
        );
        const isDecisionEvent = (
            t.includes('taxa de juros') ||
            t.includes('interest rate decision') ||
            t.includes('federal funds rate') ||
            t.includes('fed interest rate') ||
            t.includes('fomc statement') ||
            t.includes('comunicado fomc') ||
            t.includes('fomc minutes') ||
            t.includes('ata do fomc') ||
            t.includes('press conference') ||
            t.includes('coletiva fomc')
        );
        return hasFedContext && hasSpeechAction && !isDecisionEvent;
    }

    function _isFomcRateDecisionTitle(title) {
        const t = normalizeEventText(title);
        if (!t || _isFedSpeechTitle(t)) return false;
        return (
            t.includes('taxa de juros fed') ||
            t.includes('taxa de juros') ||
            t.includes('interest rate decision') ||
            t.includes('federal funds rate') ||
            t.includes('fed interest rate') ||
            t.includes('fed rate decision') ||
            t.includes('fomc rate decision')
        );
    }

    function _apiFomcMatchesOfficial(apiEvent, officialEvents) {
        if (!_isFomcRateDecisionTitle(apiEvent?.title)) return false;
        const apiTime = new Date(apiEvent.fullDate + 'T12:00:00').getTime();
        if (!Number.isFinite(apiTime)) return false;
        return officialEvents.some((official) => {
            if (_calEventCategory(official.title) !== 'FOMC') return false;
            const officialTime = new Date(official.fullDate + 'T12:00:00').getTime();
            return Number.isFinite(officialTime) && Math.abs(apiTime - officialTime) <= (2 * 24 * 60 * 60 * 1000);
        });
    }

    function _isCalendarTitleRelevant(title) {
        const t = normalizeEventText(title);
        if (!t) return false;
        if (_isFedSpeechTitle(t)) return false;
        return [...HIGH_IMPACT_EVENTS, ...MEDIUM_IMPACT_EVENTS].some((name) => {
            const n = normalizeEventText(name);
            return n && (t.includes(n) || n.includes(t));
        });
    }
    
    // Categorizar evento para dedup inteligente
    function _calEventCategory(title) {
        const t = normalizeEventText(title);
        if (!t) return null;
        if (_isFedSpeechTitle(t)) return 'FED_SPEECH';

        // Eventos específicos do FOMC primeiro (evita colapsar tudo em FOMC genérico)
        if (t.includes('comunicado fomc') || t.includes('fomc statement')) return 'FOMC_STMT';
        if (t.includes('ata do fomc') || t.includes('fomc minutes') || t.includes('meeting minutes')) return 'FOMC_MIN';
        if (t.includes('coletiva fomc') || t.includes('press conference')) return 'FOMC_PRESS';

        if (t.includes('non-farm') || t.includes('nonfarm') || t.includes('payroll') || t.includes('folha de pagamento') || t.includes('relatorio de emprego') || (t.includes('emprego') && !t.includes('desemprego') && !t.includes('seguro') && !t.includes('vagas')) || t.includes('employment situation') || (t === 'emprego') || (t === 'employment')) return 'NFP';
        if (t.includes('cpi') || t.includes('ipc') || t.includes('inflacao') || t.includes('consumer price') || t.includes('precos ao consumidor') || t.includes('indice de precos ao consumidor')) return 'CPI';
        if (t.includes('ppi') || t.includes('ipp') || t.includes('precos ao produtor') || t.includes('producer price') || t.includes('indice de precos ao produtor')) return 'PPI';
        if (t.includes('pib') || t.includes('gdp') || t.includes('gross domestic')) return 'GDP';
        if (t.includes('pce') || t.includes('personal consumption')) return 'PCE';
        if (_isFomcRateDecisionTitle(t)) return 'FOMC';
        if (t.includes('desemprego') || t.includes('unemployment rate')) return 'UNEMP';
        if (t.includes('seguro-desemprego') || t.includes('seguro desemprego') || t.includes('pedidos iniciais') || t.includes('pedidos por seguro') || t.includes('jobless claims') || t.includes('initial claims')) return 'CLAIMS';
        if (t.includes('varejo') || t.includes('retail sales')) return 'RETAIL';
        if (t.includes('ism manufatura') || t.includes('ism manufacturing')) return 'ISM_MFG';
        if (t.includes('ism servicos') || t.includes('ism services')) return 'ISM_SVC';
        if (t.includes('confianca') || t.includes('confidence') || t.includes('sentimento') || t.includes('michigan') || t.includes('sentiment')) return 'CONF';
        if (t.includes('jolts') || t.includes('vagas de emprego')) return 'JOLTS';
        if (t.includes('adp') || t.includes('empregos privados')) return 'ADP';
        if (t.includes('bens duraveis') || t.includes('durable goods')) return 'DURABLES';
        return null; // unique, no category
    }

    // ═══════════════════════════════════════════════════════════════
    // FRED Release IDs — fonte autoritativa para datas de publicação
    // ISM, Conf Board, ADP: calculados algoritmicamente (sem FRED)
    // ═══════════════════════════════════════════════════════════════
    const FRED_RELEASE_IDS = {
        'CPI': 10,       // Consumer Price Index
        'PPI': 46,       // Producer Price Index
        'NFP': 50,       // Employment Situation
        'JOLTS': 192,    // Job Openings and Labor Turnover
        'RETAIL': 9,     // Advance Retail Sales
        'GDP': 53,       // Gross Domestic Product
        'PCE': 54,       // Personal Income and Outlays
        'DURABLES': 86   // Advance Report on Durable Goods
    };

    // ═══════════════════════════════════════════════════════════════
    // DATAS ALGORÍTMICAS — ISM, Conference Board, ADP
    // Calculadas com regras oficiais (não existem no FRED)
    // ═══════════════════════════════════════════════════════════════
    function _getNthWeekday(year, month, weekday, n) {
        // Retorna a N-ésima ocorrência de um dia da semana no mês
        // weekday: 0=dom, 1=seg, 2=ter, 3=qua, 4=qui, 5=sex, 6=sab
        let d = new Date(year, month, 1);
        let count = 0;
        while (count < n) {
            if (d.getDay() === weekday) count++;
            if (count < n) d.setDate(d.getDate() + 1);
        }
        return d;
    }

    function _getLastWeekdayOfMonth(year, month, weekday) {
        let d = new Date(year, month + 1, 0); // último dia do mês
        while (d.getDay() !== weekday) d.setDate(d.getDate() - 1);
        return d;
    }

    function _getUSHolidays(year) {
        return [
            new Date(year, 0, 1),                          // New Year
            _getNthWeekday(year, 0, 1, 3),                 // MLK Day (3rd Mon Jan)
            _getNthWeekday(year, 1, 1, 3),                 // Presidents Day (3rd Mon Feb)
            _getLastWeekdayOfMonth(year, 4, 1),             // Memorial Day (last Mon May)
            new Date(year, 5, 19),                         // Juneteenth
            new Date(year, 6, 4),                          // Independence Day
            _getNthWeekday(year, 8, 1, 1),                 // Labor Day (1st Mon Sep)
            _getNthWeekday(year, 9, 1, 2),                 // Columbus Day (2nd Mon Oct)
            new Date(year, 10, 11),                        // Veterans Day
            _getNthWeekday(year, 10, 4, 4),                // Thanksgiving (4th Thu Nov)
            new Date(year, 11, 25)                         // Christmas
        ].map(function(d) { return d.toISOString().split('T')[0]; });
    }

    function _isBusinessDay(date, holidays) {
        const day = date.getDay();
        if (day === 0 || day === 6) return false;
        return !holidays.includes(date.toISOString().split('T')[0]);
    }

    function _getNthBusinessDay(year, month, n, holidays) {
        let d = new Date(year, month, 1);
        let count = 0;
        while (count < n) {
            if (_isBusinessDay(d, holidays)) count++;
            if (count < n) d.setDate(d.getDate() + 1);
        }
        return d;
    }

    function _fmtDate(d) { return d.toISOString().split('T')[0]; }

    function _isEasternDstDate(dateStr) {
        const d = new Date(dateStr + 'T12:00:00');
        if (isNaN(d.getTime())) return true;
        const year = d.getFullYear();
        const dstStart = _getNthWeekday(year, 2, 0, 2);  // 2nd Sunday in March
        const dstEnd = _getNthWeekday(year, 10, 0, 1);   // 1st Sunday in November
        return d >= dstStart && d < dstEnd;
    }

    function _etToBrasiliaTime(dateStr, etTime) {
        const match = String(etTime || '').match(/^(\d{1,2}):(\d{2})$/);
        if (!match) return etTime || '--:--';
        const addHours = _isEasternDstDate(dateStr) ? 1 : 2;
        const h = (Number(match[1]) + addHours) % 24;
        return String(h).padStart(2, '0') + ':' + match[2];
    }

    function _normalizeOfficialDateEntry(entry, schedule) {
        if (!entry) return null;
        if (typeof entry === 'string') return { date: entry };
        if (typeof entry !== 'object' || !entry.date) return null;
        return {
            date: entry.date,
            label: entry.label || entry.date,
            sep: !!entry.sep,
            time: entry.time || (schedule?.timeET ? _etToBrasiliaTime(entry.date, schedule.timeET) : schedule?.time),
            source: entry.source || schedule?.agency || 'official'
        };
    }

    function _mergeOfficialDateEntries(catKey, dynamicDates, schedule) {
        const byDate = new Map();
        const knownDates = Array.isArray(OFFICIAL_KNOWN_DATES[catKey]) ? OFFICIAL_KNOWN_DATES[catKey] : [];

        knownDates.forEach((entry) => {
            const normalized = _normalizeOfficialDateEntry(entry, schedule);
            if (normalized?.date) byDate.set(normalized.date, normalized);
        });

        const dynamicList = Array.isArray(dynamicDates) ? dynamicDates : [];
        dynamicList.forEach((entry) => {
            const normalized = _normalizeOfficialDateEntry(entry, schedule);
            if (!normalized?.date) return;
            byDate.set(normalized.date, {
                ...(byDate.get(normalized.date) || {}),
                ...normalized,
                dynamic: true
            });
        });

        return [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    }

    // Gerar datas calculadas para indicadores sem FRED
    // Retorna { ISM_MFG: [...], ISM_SVC: [...], CONF: [...], ADP: [...] }
    function calculateAlgorithmicDates(nfpDates) {
        const result = { 'ISM_MFG': [], 'ISM_SVC': [], 'CONF': [], 'ADP': [] };
        const now = new Date();
        const years = [now.getFullYear(), now.getFullYear() + 1];

        for (const year of years) {
            const holidays = _getUSHolidays(year);
            for (let month = 0; month < 12; month++) {
                // ISM Manufacturing: 1º dia útil do mês
                result['ISM_MFG'].push(_fmtDate(_getNthBusinessDay(year, month, 1, holidays)));
                // ISM Services: 3º dia útil do mês
                result['ISM_SVC'].push(_fmtDate(_getNthBusinessDay(year, month, 3, holidays)));
                // Conference Board Consumer Confidence: última terça-feira do mês
                result['CONF'].push(_fmtDate(_getLastWeekdayOfMonth(year, month, 2)));
            }
        }

        // ADP: 2 dias antes do NFP (quarta antes da sexta do NFP)
        if (nfpDates && nfpDates.length > 0) {
            for (const nfpStr of nfpDates) {
                const nfpDate = new Date(nfpStr + 'T12:00:00');
                const adpDate = new Date(nfpDate);
                adpDate.setDate(adpDate.getDate() - 2);
                result['ADP'].push(_fmtDate(adpDate));
            }
        } else {
            // Fallback: 1ª quarta-feira do mês
            for (const year of years) {
                for (let month = 0; month < 12; month++) {
                    result['ADP'].push(_fmtDate(_getNthWeekday(year, month, 3, 1)));
                }
            }
        }

        // Ordenar todas
        for (const key of Object.keys(result)) {
            result[key].sort();
        }
        return result;
    }

    // ═══════════════════════════════════════════════════════════════
    // CALENDÁRIO OFICIAL — Metadados (título, horário, impacto)
    // Datas são SEMPRE sobrepostas por FRED API ou cálculo algorítmico
    // ═══════════════════════════════════════════════════════════════
    const OFFICIAL_SCHEDULE = {
        'NFP': {
            title: 'Relatório de Emprego (Payroll)',
            agency: 'BLS',
            time: '10:30',
            timeET: '08:30',
            impact: 'high',
        },
        'CPI': {
            title: 'CPI (Inflação)',
            agency: 'BLS',
            time: '10:30',
            timeET: '08:30',
            impact: 'high',
        },
        'PPI': {
            title: 'PPI (Preços ao Produtor)',
            agency: 'BLS',
            time: '10:30',
            timeET: '08:30',
            impact: 'high',
        },
        'FOMC': {
            title: 'Taxa de Juros FED',
            agency: 'Federal Reserve',
            time: '15:00',
            timeET: '14:00',
            impact: 'high',
        },
        'GDP': {
            title: 'PIB',
            agency: 'BEA',
            time: '10:30',
            timeET: '08:30',
            impact: 'high',
        },
        'PCE': {
            title: 'PCE Core (Inflação Fed)',
            agency: 'BEA',
            time: '10:30',
            timeET: '08:30',
            impact: 'high',
        },
        'RETAIL': {
            title: 'Vendas no Varejo',
            agency: 'Census Bureau',
            time: '10:30',
            timeET: '08:30',
            impact: 'high',
        },
        'ISM_MFG': {
            title: 'ISM Manufatura',
            agency: 'ISM',
            time: '12:00',
            timeET: '10:00',
            impact: 'high',
        },
        'ISM_SVC': {
            title: 'ISM Serviços',
            agency: 'ISM',
            time: '12:00',
            timeET: '10:00',
            impact: 'high',
        },
        'CONF': {
            title: 'Confiança do Consumidor',
            agency: 'Conference Board',
            time: '12:00',
            timeET: '10:00',
            impact: 'high',
        },
        'JOLTS': {
            title: 'JOLTS Vagas de Emprego',
            agency: 'BLS',
            time: '12:00',
            timeET: '10:00',
            impact: 'high',
        },
        'ADP': {
            title: 'ADP Empregos Privados',
            agency: 'ADP Research',
            time: '10:15',
            timeET: '08:15',
            impact: 'high',
        },
        'DURABLES': {
            title: 'Bens Duráveis',
            agency: 'Census Bureau',
            time: '10:30',
            timeET: '08:30',
            impact: 'medium',
        }
    };

    // Datas oficiais conhecidas. Mantidas como complemento auditavel as fontes dinamicas.
    // Revisado em 2026-04-27: Fed, BLS, BEA e U.S. Census.
    const OFFICIAL_KNOWN_DATES_REVIEWED_AT = '2026-04-27';
    const OFFICIAL_KNOWN_DATES_VALID_UNTIL = '2028-01-26';
    const OFFICIAL_KNOWN_DATES = {
        FOMC: [
            { date: '2026-04-29', label: '28-29 Abr 2026' },
            { date: '2026-06-17', label: '16-17 Jun 2026', sep: true },
            { date: '2026-07-29', label: '28-29 Jul 2026' },
            { date: '2026-09-16', label: '15-16 Set 2026', sep: true },
            { date: '2026-10-28', label: '27-28 Out 2026' },
            { date: '2026-12-09', label: '8-9 Dez 2026', sep: true },
            { date: '2027-01-27', label: '26-27 Jan 2027' },
            { date: '2027-03-17', label: '16-17 Mar 2027', sep: true },
            { date: '2027-04-28', label: '27-28 Abr 2027' },
            { date: '2027-06-09', label: '8-9 Jun 2027', sep: true },
            { date: '2027-07-28', label: '27-28 Jul 2027' },
            { date: '2027-09-15', label: '14-15 Set 2027', sep: true },
            { date: '2027-10-27', label: '26-27 Out 2027' },
            { date: '2027-12-08', label: '7-8 Dez 2027', sep: true },
            { date: '2028-01-26', label: '25-26 Jan 2028' }
        ],
        NFP: ['2026-05-08', '2026-06-05', '2026-07-02', '2026-08-07', '2026-09-04', '2026-10-02', '2026-11-06', '2026-12-04'],
        CPI: ['2026-05-12', '2026-06-10', '2026-07-14', '2026-08-12', '2026-09-11', '2026-10-14', '2026-11-10', '2026-12-10'],
        PPI: ['2026-05-13', '2026-06-11', '2026-07-15', '2026-08-13', '2026-09-10', '2026-10-15', '2026-11-13', '2026-12-15'],
        JOLTS: ['2026-05-05', '2026-06-02', '2026-06-30', '2026-08-04', '2026-09-01', '2026-09-29', '2026-11-03', '2026-12-01'],
        GDP: ['2026-04-30', '2026-05-28', '2026-06-25', '2026-07-30', '2026-08-26', '2026-09-30', '2026-10-29', '2026-11-25', '2026-12-23'],
        PCE: ['2026-04-30', '2026-05-28', '2026-06-25', '2026-07-30', '2026-08-26', '2026-09-30', '2026-10-29', '2026-11-25', '2026-12-23'],
        RETAIL: ['2026-05-14', '2026-06-17', '2026-07-16', '2026-08-14', '2026-09-16', '2026-10-15', '2026-11-17', '2026-12-16'],
        DURABLES: ['2026-04-29', '2026-05-28', '2026-06-25', '2026-07-27', '2026-08-26', '2026-09-25', '2026-10-27', '2026-11-25', '2026-12-23']
    };

    // Buscar datas de release do FRED API (fonte autoritativa)
    // Retorna { CPI: ['2025-06-11', ...], PPI: [...], ... }
    async function fetchFREDReleaseDates() {
        if (fredDatesCache.data && fredDatesCache.lastUpdate &&
            (Date.now() - fredDatesCache.lastUpdate) < FRED_DATES_CACHE_TTL) {
            macroLog('📦 FRED dates: usando cache', 'info');
            return fredDatesCache.data;
        }

        const result = {};
        const fetchPromises = Object.entries(FRED_RELEASE_IDS).map(async ([key, releaseId]) => {
            try {
                const url = ''+ APP_CONFIG.CALENDAR_WORKER_URL +'/proxy/fred/fred/release/dates?release_id=' + releaseId +
                    '&file_type=json&sort_order=desc&limit=30' +
                    '&include_release_dates_with_no_data=true';
                const response = await _fetchWithTimeout(url, {}, 10000);
                if (!response.ok) return;
                const data = await response.json();
                if (data.release_dates && data.release_dates.length > 0) {
                    result[key] = data.release_dates.map(function(rd) { return rd.date; }).sort();
                }
            } catch (e) {
                macroLog('⚠️ FRED dates failed for ' + key + ': ' + e.message, 'warn');
            }
        });

        await Promise.all(fetchPromises);

        if (Object.keys(result).length > 0) {
            fredDatesCache = { data: result, lastUpdate: Date.now() };
            macroLog('✅ FRED dates fetched: ' + Object.keys(result).join(', '), 'info');
        }

        return result;
    }

    // Gerar eventos para um intervalo de datas
    // dynamicDates: datas do FRED API + algorítmicas (prioridade total)
    function getOfficialCalendarEvents(fromStr, toStr, dynamicDates) {
        const from = new Date(fromStr + 'T00:00:00');
        const to = new Date(toStr + 'T23:59:59');
        const events = [];

        for (const [catKey, schedule] of Object.entries(OFFICIAL_SCHEDULE)) {
            // Ground truth: datas dinamicas + agenda oficial conhecida revisada.
            const dates = _mergeOfficialDateEntries(catKey, dynamicDates?.[catKey], schedule);
            if (dates.length === 0) continue;
            for (const dateEntry of dates) {
                const dateStr = dateEntry.date;
                const d = new Date(dateStr + 'T12:00:00');
                if (d >= from && d <= to) {
                    const eventTime = dateEntry.time || (schedule.timeET ? _etToBrasiliaTime(dateStr, schedule.timeET) : schedule.time);
                    events.push({
                        day: d.getDate(),
                        month: d.toLocaleDateString('pt-BR', { month: 'short' }).toUpperCase(),
                        time: eventTime,
                        title: schedule.title,
                        fullDate: dateStr,
                        country: 'EUA',
                        impact: schedule.impact,
                        hasHistory: true,
                        category: catKey,
                        fredSeries: _resolveOfficialSeriesConfig({ title: schedule.title, category: catKey })?.series || null,
                        estimate: null,
                        previous: null,
                        actual: null,
                        source: schedule.agency,
                        official: true,
                        officialDateLabel: dateEntry.label || dateStr,
                        officialScheduleReviewedAt: OFFICIAL_KNOWN_DATES_REVIEWED_AT
                    });
                }
            }
        }

        events.sort((a, b) => new Date(a.fullDate) - new Date(b.fullDate));
        return events;
    }

    // Buscar calendário econômico — Ground truth: datas oficiais
    // Enriquecido com previsões/valores reais de Forex Factory e FMP
    async function fetchEconomicCalendarFromAPI() {
        try {
            // Verificar cache
            if (calendarCache.events && calendarCache.lastUpdate &&
                (Date.now() - calendarCache.lastUpdate) < CALENDAR_CACHE_TTL) {
                macroLog('📦 Usando cache do calendário', 'info');
                return calendarCache.events;
            }

            macroLog('🔄 Carregando calendário econômico...', 'info');

            // 1. Buscar datas dinâmicas (FRED API + algoritmico) — ZERO datas estáticas
            const today = new Date();
            const todayStr = today.toISOString().split('T')[0];
            const futureStr = new Date(today.getTime() + CALENDAR_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            const fredDates = await fetchFREDReleaseDates().catch(function() { return {}; });

            // Calcular datas algorítmicas para ISM, Conf Board e ADP.
            // Para ADP, usar NFP oficial conhecido quando FRED nao trouxer a agenda.
            const knownNfpDates = _mergeOfficialDateEntries('NFP', fredDates['NFP'], OFFICIAL_SCHEDULE.NFP).map(d => d.date);
            const algoDates = calculateAlgorithmicDates(knownNfpDates.length ? knownNfpDates : null);

            // Mesclar: FRED tem prioridade, algoritmo cobre o restante
            const allDynamicDates = Object.assign({}, algoDates, fredDates);

            macroLog('📅 Datas dinâmicas: FRED=' + Object.keys(fredDates).join(',') + ' ALGO=' + Object.keys(algoDates).join(','), 'info');

            const officialEvents = getOfficialCalendarEvents(todayStr, futureStr, allDynamicDates);

            // 2. Buscar dados de APIs em paralelo (para forecast/actual)
            const [investingEvents, ffEvents, fmpEvents] = await Promise.all([
                fetchCalendarFromInvesting().catch(() => null),
                fetchCalendarFromForexFactory().catch(() => null),
                fetchCalendarFromFMP().catch(() => null)
            ]);

            // 3. Combinar dados de API
            let apiEvents = [];
            if (investingEvents && investingEvents.length > 0) apiEvents.push(...investingEvents);
            if (ffEvents && ffEvents.length > 0) apiEvents.push(...ffEvents);
            if (fmpEvents && fmpEvents.length > 0) apiEvents.push(...fmpEvents);

            // 4. Enriquecer eventos oficiais com dados da API (estimates, actuals)
            const MATCH_WINDOW = 2 * 24 * 60 * 60 * 1000; // ±2 dias
            const matchedApiIndices = new Set();

            officialEvents.forEach(official => {
                const officialCat = _calEventCategory(official.title);
                const officialTime = new Date(official.fullDate + 'T12:00:00').getTime();

                // Buscar melhor match na API
                let bestMatch = null;
                let bestDist = Infinity;
                apiEvents.forEach((api, idx) => {
                    if (matchedApiIndices.has(idx)) return;
                    const apiCat = _calEventCategory(api.title);
                    if (!officialCat || !apiCat || officialCat !== apiCat) return;
                    const apiTime = new Date(api.fullDate + 'T12:00:00').getTime();
                    const dist = Math.abs(apiTime - officialTime);
                    if (dist <= MATCH_WINDOW && dist < bestDist) {
                        bestMatch = { event: api, idx };
                        bestDist = dist;
                    }
                });

                if (bestMatch) {
                    matchedApiIndices.add(bestMatch.idx);
                    const api = bestMatch.event;
                    if (api.estimate) official.estimate = api.estimate;
                    if (api.previous) official.previous = api.previous;
                    if (api.actual) official.actual = api.actual;
                    official.enriched = true;
                }
            });

            // 5. Eventos da API que NÃO casaram com nenhum oficial (suplementares)
            const supplementary = [];
            apiEvents.forEach((api, idx) => {
                if (matchedApiIndices.has(idx)) return;
                const apiCat = _calEventCategory(api.title);
                if (apiCat === 'FED_SPEECH') return;
                if (apiCat === 'FOMC' && !_apiFomcMatchesOfficial(api, officialEvents)) return;
                // Pular se categoria já existe nos oficiais para a mesma janela
                const isDupOfOfficial = officialEvents.some(o => {
                    const oCat = _calEventCategory(o.title);
                    if (!apiCat || !oCat || apiCat !== oCat) return false;
                    const diff = Math.abs(new Date(o.fullDate + 'T12:00:00').getTime() - new Date(api.fullDate + 'T12:00:00').getTime());
                    return diff <= 3 * 24 * 60 * 60 * 1000;
                });
                if (!isDupOfOfficial) {
                    api.official = false;
                    supplementary.push(api);
                }
            });

            // 6. Dedup suplementares entre si
            const DEDUP_WINDOW = 3 * 24 * 60 * 60 * 1000;
            const uniqueSupp = [];
            for (const e of supplementary) {
                const cat = _calEventCategory(e.title);
                const eTime = new Date(e.fullDate + 'T12:00:00').getTime();
                const isDup = uniqueSupp.some(u => {
                    const uCat = _calEventCategory(u.title);
                    if (!cat || !uCat || cat !== uCat) return false;
                    return Math.abs(new Date(u.fullDate + 'T12:00:00').getTime() - eTime) <= DEDUP_WINDOW;
                });
                if (!isDup) uniqueSupp.push(e);
            }

            // 7. Combinar e ordenar
            let events = [...officialEvents, ...uniqueSupp];
            events.sort((a, b) => new Date(a.fullDate) - new Date(b.fullDate));

            // Para cada categoria, manter APENAS o próximo evento
            const seenCategories = new Set();
            events = events.filter(e => {
                const cat = _calEventCategory(e.title);
                if (cat === 'FED_SPEECH') return false;
                if (!cat) return true;
                if (seenCategories.has(cat)) return false;
                seenCategories.add(cat);
                return true;
            });

            events = events.slice(0, 40);

            macroLog(`📊 Calendário: ${events.length} eventos (${officialEvents.length} oficiais, ${uniqueSupp.length} extras da API)`, 'info');

            calendarCache = { events, lastUpdate: Date.now() };
            return events;

        } catch (e) {
            macroLog('❌ Erro Calendar: ' + e.message, 'error');
            return [];
        }
    }
    
    function _cleanInvestingField(node) {
        if (!node) return null;
        const text = String(node.textContent || '')
            .replace(/\u00a0/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        if (text) return text;
        const ownTitle = String(node.getAttribute?.('title') || '').trim();
        if (ownTitle) return ownTitle;
        const titled = node.querySelector?.('[title]');
        const nestedTitle = String(titled?.getAttribute?.('title') || '').trim();
        return nestedTitle || null;
    }

    function _parseInvestingCalendarHtml(html) {
        if (!html || typeof DOMParser === 'undefined') return [];

        const doc = new DOMParser().parseFromString(`<table><tbody>${html}</tbody></table>`, 'text/html');
        const rows = Array.from(doc.querySelectorAll('tr.js-event-item'));
        const events = [];

        rows.forEach((row) => {
            const dateTimeRaw = row.getAttribute('data-event-datetime') || '';
            const dateMatch = dateTimeRaw.match(/^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})/);
            if (!dateMatch) return;

            const currency = row.querySelector('.flagCur')?.textContent || '';
            if (!currency.includes('USD')) return;

            const rawTitle = _cleanInvestingField(row.querySelector('td.event')) || row.getAttribute('data-name') || '';
            const translatedTitle = translateEventName(rawTitle);
            const category = _calEventCategory(translatedTitle);
            if (!category && !_isCalendarTitleRelevant(translatedTitle || rawTitle)) return;

            const impactKey = row.querySelector('.sentiment')?.getAttribute('data-img_key') || '';
            const impact = impactKey === 'bull3' ? 'high' : 'medium';
            const fullDate = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
            const fullDateObj = new Date(fullDate + 'T12:00:00');

            events.push({
                day: fullDateObj.getDate(),
                month: fullDateObj.toLocaleDateString('pt-BR', { month: 'short' }).toUpperCase(),
                time: `${dateMatch[4]}:${dateMatch[5]}`,
                title: translatedTitle,
                fullDate,
                country: 'EUA',
                impact,
                hasHistory: true,
                category,
                fredSeries: _resolveOfficialSeriesConfig({ title: translatedTitle, category })?.series || null,
                estimate: _cleanInvestingField(row.querySelector('td.fore')),
                previous: _cleanInvestingField(row.querySelector('td.prev')),
                actual: _cleanInvestingField(row.querySelector('td.act')),
                source: 'Investing.com'
            });
        });

        return events;
    }

    async function fetchCalendarFromInvesting() {
        try {
            const headers = {
                'Accept': 'application/json, text/javascript, */*; q=0.01',
                'X-Requested-With': 'XMLHttpRequest',
                'Referer': 'https://br.investing.com/economic-calendar/'
            };
            const tabs = ['thisWeek', 'nextWeek'];
            const responses = await Promise.all(tabs.map(async (tab) => {
                const url = 'https://br.investing.com/economic-calendar/Service/getCalendarFilteredData?' +
                    'country%5B%5D=5&importance%5B%5D=2&importance%5B%5D=3&timeZone=12&timeFilter=timeRemain' +
                    '&currentTab=' + encodeURIComponent(tab) + '&limit_from=0';
                const text = await nativeHttpTextWithHeaders(url, headers, 3500);
                const json = JSON.parse(text);
                return _parseInvestingCalendarHtml(json?.data || '');
            }));

            const events = responses.flat();
            if (events.length === 0) return null;

            const seen = new Set();
            const unique = events.filter((eventItem) => {
                const key = `${eventItem.title}-${eventItem.fullDate}-${eventItem.time}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
            unique.sort((a, b) => new Date(a.fullDate) - new Date(b.fullDate));
            macroLog(`✅ Calendário Investing: ${unique.length} eventos reais`, 'success');
            return unique;
        } catch(e) {
            macroLog('⚠️ Investing calendário indisponível: ' + e.message, 'warn');
            return null;
        }
    }

    // Forex Factory - API gratuita com dados reais de calendário econômico
    async function fetchCalendarFromForexFactory() {
        try {
            // Capacitor Android: fetch direto funciona sem CORS
            const ffUrl = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
            
            let data = null;
            try {
                const response = await _fetchWithTimeout(ffUrl, {}, 8000);
                if (response.ok) {
                    const result = await response.json();
                    if (Array.isArray(result) && result.length > 0) {
                        data = result;
                    }
                }
            } catch(e) { /* direct fetch failed */ }
            
            if (!data || data.length === 0) return null;
            
            // Filtrar apenas eventos dos EUA com impacto alto/médio
            const today = new Date();
            const todayStr = today.toISOString().split('T')[0];
            const usEvents = data.filter(e => {
                if (e.country !== 'USD') return false;
                if (e.impact !== 'High' && e.impact !== 'Medium') return false;
                // Comparar apenas a parte da data (sem timezone shift)
                const dateStr = typeof e.date === 'string' ? e.date : '';
                const eventDateStr = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr.split(' ')[0];
                return eventDateStr >= todayStr;
            });
            
            if (usEvents.length === 0) return null;
            
            // Converter para nosso formato
            const mappedEvents = usEvents.map(e => {
                // Extrair data UTC segura (sem timezone shift)
                const dateStr = typeof e.date === 'string' ? e.date : '';
                const fullDate = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr.split(' ')[0];
                const fullDateObj = new Date(fullDate + 'T12:00:00');
                const translatedTitle = translateEventName(e.title);
                const category = _calEventCategory(translatedTitle);
                return {
                    day: fullDateObj.getDate(),
                    month: fullDateObj.toLocaleDateString('pt-BR', { month: 'short' }).toUpperCase(),
                    time: new Date(e.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false }),
                    title: translatedTitle,
                    fullDate: fullDate,
                    country: 'EUA',
                    impact: e.impact?.toLowerCase() || 'high',
                    hasHistory: true,
                    category,
                    fredSeries: _resolveOfficialSeriesConfig({ title: translatedTitle, category })?.series || null,
                    estimate: e.forecast || null,
                    previous: e.previous || null,
                    actual: e.actual || null,
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
            }).slice(0, 25);
            
            events.sort((a, b) => new Date(a.fullDate) - new Date(b.fullDate));
            macroLog(`✅ Calendário Forex Factory: ${events.length} eventos reais`, 'success');
            return events;
            
        } catch(e) {
            macroLog('⚠️ Forex Factory indisponível: ' + e.message, 'warn');
            return null;
        }
    }
    
    // FMP API - DESCONTINUADA (legacy endpoint desde agosto 2025)
    async function fetchCalendarFromFMP() {
        return null;
    }
    
    // Traduzir nomes de eventos para português (compatível com FMP e Forex Factory)
    function translateEventName(name) {
        if (_isFedSpeechTitle(name)) return 'Discurso Fed';
        const translations = {
            'Consumer Price Index': 'CPI (Inflação)',
            'CPI m/m': 'CPI (Inflação) m/m',
            'CPI y/y': 'CPI (Inflação) a/a',
            'Core CPI': 'CPI Core',
            'Non-Farm Payroll': 'Relatório de Emprego (Payroll)',
            'Non-Farm Employment Change': 'Relatório de Emprego (Payroll)',
            'ADP Non-Farm Employment': 'ADP Empregos Privados',
            'Nonfarm Payrolls': 'Relatório de Emprego (Payroll)',
            'Employment Situation': 'Relatório de Emprego (Payroll)',
            'Employment Change': 'Relatório de Emprego (Payroll)',
            'Employment': 'Relatório de Emprego (Payroll)',
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
            'Crude Oil Inventories': 'Estoques de Petróleo',
            'Average Hourly Earnings': 'Salário Médio por Hora',
            'Average Hourly Earnings m/m': 'Salário Médio por Hora m/m',
            'Average Hourly Earnings M/M': 'Salário Médio por Hora m/m',
            'Average Hourly Earnings y/y': 'Salário Médio por Hora a/a',
            'Nonfarm Payroll': 'Relatório de Emprego (Payroll)',
            'Non Farm Payrolls': 'Relatório de Emprego (Payroll)',
            'Wholesale Inventories': 'Estoques Atacadistas',
            'S&P/CS Composite-20 HPI': 'Índice Preços Imóveis S&P/CS',
            'Richmond Manufacturing Index': 'Índice Manufatura Richmond',
            'Dallas Fed Manufacturing': 'Índice Manufatura Dallas',
            'Kansas City Fed Manufacturing': 'Índice Manufatura Kansas City',
            'Pending Home Sales': 'Vendas Pendentes de Imóveis',
            'Personal Consumption Expenditure': 'Gastos de Consumo Pessoal',
            'Business Inventories': 'Estoques Empresariais',
            'Construction Spending': 'Gastos em Construção',
            'Consumer Credit': 'Crédito ao Consumidor',
            'Nonfarm Productivity': 'Produtividade Não-Agrícola',
            'Unit Labor Costs': 'Custo Unitário do Trabalho',
            'Fed Chair Powell Speaks': 'Discurso Powell (Fed)',
            'FOMC Member': 'Membro do FOMC'
        };
        
        for (const [eng, pt] of Object.entries(translations).sort((a, b) => b[0].length - a[0].length)) {
            if (name?.toLowerCase().includes(eng.toLowerCase())) {
                return pt;
            }
        }
        return name || 'Evento Econômico';
    }
    
    // Calendário: dados reais de APIs + datas oficiais (FRED) + regras oficiais para releases sem feed direto.
    // Sem placeholders sintéticos.
    
    // Helper para renderizar eventos no calendário
    function _renderCalendarEvents(container, events) {
        if (!events || events.length === 0) {
            macroCalendarViewEvents = [];
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

        const viewEvents = events.slice(0, 20);
        macroCalendarViewEvents = viewEvents;

        container.innerHTML = viewEvents.map((e, idx) => {
            const fullDateObj = new Date(e.fullDate + 'T12:00:00');
            const dayStr = String(fullDateObj.getDate()).padStart(2, '0');
            const monthStr = String(fullDateObj.getMonth() + 1).padStart(2, '0');
            const impactMeta = _impactVisual(e.impact);
            const impactBadge = `<span class="calendar-impact-badge" style="background: ${impactMeta.bg}; color: ${impactMeta.color}; border-color: ${impactMeta.color}44;">${impactMeta.label}</span>`;
            return `
            <div class="calendar-event" data-event-idx="${idx}" data-event-title="${e.title}" style="cursor: pointer; transition: background 0.2s; border-left: 2px solid ${impactMeta.color}99;" onclick="window.MacroAPI.showEventDetailsByIndex(${idx})">
                <div class="calendar-date">
                    <div class="calendar-day">${dayStr}</div>
                    <div class="calendar-month">${monthStr}</div>
                </div>
                <div class="calendar-info">
                    <div class="calendar-title-row">
                        <div class="calendar-title">${e.title}</div>
                        <div class="calendar-impact-slot">${impactBadge}</div>
                    </div>
                    <div class="calendar-country">${e.country} • ${e.time}</div>
                </div>
                <i class="fas fa-chevron-right" style="color: var(--text-muted); font-size: 12px; margin-left: 8px;"></i>
            </div>
        `}).join('') || '<p style="color: var(--text-muted); text-align: center;">Nenhum evento</p>';
        container.querySelectorAll('.calendar-event').forEach(el => {
            el.addEventListener('mouseenter', () => el.style.background = 'rgba(255,255,255,0.05)');
            el.addEventListener('mouseleave', () => el.style.background = '');
        });
        const officialCount = viewEvents.filter(e => e.official).length;
        const updateInfo = document.createElement('div');
        updateInfo.style.cssText = 'font-size: 10px; color: #555; text-align: right; margin-top: 8px; padding-right: 8px;';
        updateInfo.textContent = `Atualizado: ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} • ${officialCount} datas oficiais`;
        container.appendChild(updateInfo);
    }

    function _formatEventField(value, fallback = '—') {
        const txt = String(value ?? '').trim();
        if (!txt || txt.toLowerCase() === 'null' || txt === '-') return fallback;
        return txt;
    }

    function _parseMacroEventNumber(value) {
        const txt = _formatEventField(value, '');
        if (!txt) return null;

        const cleaned = txt
            .replace(/\s+/g, '')
            .replace(',', '.')
            .replace(/[^0-9.+-]/g, '');
        const parsed = Number(cleaned);
        return Number.isFinite(parsed) ? parsed : null;
    }

    function _impactVisual(impactRaw) {
        const impact = String(impactRaw || '').toLowerCase();
        if (impact === 'high') return { label: 'Alto Impacto', color: '#ef4444', bg: 'rgba(239,68,68,0.16)', icon: 'fa-bolt' };
        if (impact === 'medium') return { label: 'Médio Impacto', color: '#f59e0b', bg: 'rgba(245,158,11,0.16)', icon: 'fa-wave-square' };
        return { label: 'Baixo Impacto', color: '#94a3b8', bg: 'rgba(148,163,184,0.16)', icon: 'fa-minus' };
    }

    function _buildEventDateTime(fullDate, timeText) {
        const safeDate = String(fullDate || '').trim();
        if (!safeDate) return null;

        const timeMatch = String(timeText || '').trim().match(/^(\d{1,2}):(\d{2})$/);
        const hh = timeMatch ? String(timeMatch[1]).padStart(2, '0') : '12';
        const mm = timeMatch ? timeMatch[2] : '00';
        const dt = new Date(`${safeDate}T${hh}:${mm}:00`);
        return isNaN(dt.getTime()) ? null : dt;
    }

    function _formatRemainingTime(ms) {
        if (!Number.isFinite(ms)) return 'Horário indisponível';
        if (ms <= 0) return 'Evento já iniciado';

        const totalMinutes = Math.floor(ms / 60000);
        const days = Math.floor(totalMinutes / (60 * 24));
        const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
        const mins = totalMinutes % 60;

        if (days > 0) return `${days}d ${hours}h`;
        if (hours > 0) return `${hours}h ${mins}m`;
        return `${Math.max(1, mins)}m`;
    }

    function _buildEventTimingMeta(eventDateTime) {
        if (!eventDateTime || isNaN(eventDateTime.getTime())) {
            return {
                state: 'unknown',
                label: 'Agenda sem horário completo',
                detail: 'Acompanhe atualização oficial da fonte do evento.',
                remaining: '—',
                progress: 0,
                color: '#94a3b8'
            };
        }

        const now = Date.now();
        const eventTs = eventDateTime.getTime();
        const diff = eventTs - now;
        const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

        if (diff > 0) {
            const progress = Math.max(6, Math.min(100, ((sevenDaysMs - Math.min(diff, sevenDaysMs)) / sevenDaysMs) * 100));
            return {
                state: 'upcoming',
                label: 'Próxima divulgação',
                detail: 'Contagem regressiva com base na agenda oficial.',
                remaining: _formatRemainingTime(diff),
                progress,
                color: '#3b82f6'
            };
        }

        const elapsed = Math.abs(diff);
        const hoursElapsed = Math.floor(elapsed / (60 * 60 * 1000));
        return {
            state: 'past',
            label: 'Evento já ocorreu',
            detail: hoursElapsed < 24
                ? 'A atualização real pode levar algum tempo para refletir nas fontes.'
                : 'Acompanhe a próxima divulgação oficial deste indicador.',
            remaining: `há ${hoursElapsed < 1 ? 'menos de 1h' : `${hoursElapsed}h`}`,
            progress: 100,
            color: '#f59e0b'
        };
    }

    function _getEventFrequency(category) {
        const map = {
            NFP: 'Mensal',
            CPI: 'Mensal',
            PPI: 'Mensal',
            PCE: 'Mensal',
            GDP: 'Trimestral',
            FOMC: '8x ao ano',
            FOMC_STMT: '8x ao ano',
            FOMC_MIN: '8x ao ano',
            FOMC_PRESS: '8x ao ano',
            UNEMP: 'Mensal',
            CLAIMS: 'Semanal',
            RETAIL: 'Mensal',
            ISM_MFG: 'Mensal',
            ISM_SVC: 'Mensal',
            CONF: 'Mensal',
            JOLTS: 'Mensal',
            ADP: 'Mensal',
            DURABLES: 'Mensal'
        };
        return map[category] || 'Calendário oficial';
    }

    function _getCalendarEventByTitleAndDate(eventTitle, eventDate) {
        const normalizedTitle = normalizeEventText(eventTitle);
        const dateKey = String(eventDate || '');

        const exact = macroCalendarViewEvents.find((eventItem) => (
            normalizeEventText(eventItem?.title) === normalizedTitle &&
            String(eventItem?.fullDate || '') === dateKey
        ));
        if (exact) return exact;

        return macroCalendarViewEvents.find((eventItem) => normalizeEventText(eventItem?.title) === normalizedTitle) || null;
    }

    function showEventDetailsByIndex(index) {
        const idx = Number(index);
        if (!Number.isFinite(idx) || idx < 0 || idx >= macroCalendarViewEvents.length) return;

        const eventItem = macroCalendarViewEvents[idx];
        if (!eventItem) return;

        showEventDetails(eventItem.title, eventItem.fullDate, eventItem);
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
        
        // Safety timeout: show fallback after 20s if APIs hang
        let _calDone = false;
        const _calSafetyTimer = setTimeout(() => {
            if (_calDone) return;
            _calDone = true;
            macroLog('⚠️ Calendar timeout - APIs não responderam', 'warn');
            _renderCalendarEvents(container, null);
        }, 20000);
        
        // Tentar buscar dados reais
        let events = await fetchEconomicCalendarFromAPI();
        
        if (_calDone) return; // Safety timer already fired
        _calDone = true;
        clearTimeout(_calSafetyTimer);
        
        if (!events || events.length === 0) {
            _renderCalendarEvents(container, null);
            return;
        }
        
        _renderCalendarEvents(container, events);
    }
    
    async function showEventDetails(eventTitle, eventDate, eventData = null) {
        // Remover modal antigo
        const oldModal = document.getElementById('event-detail-modal');
        if (oldModal) oldModal.remove();

        const selectedEvent = eventData || _getCalendarEventByTitleAndDate(eventTitle, eventDate) || {};
        const safeTitle = String(eventTitle || selectedEvent.title || 'Evento Econômico');
        const safeDate = String(eventDate || selectedEvent.fullDate || '');
        const eventInfo = getEventInfo(safeTitle);
        const sourceRaw = _formatEventField(selectedEvent.source || (selectedEvent.official ? 'Fonte oficial' : ''), 'Não informado');
        const timeRaw = _formatEventField(selectedEvent.time, '--:--');
        const countryRaw = _formatEventField(selectedEvent.country, 'EUA');
        const impactMeta = _impactVisual(selectedEvent.impact);

        const eventDateTime = _buildEventDateTime(safeDate, timeRaw);
        const hasValidDate = !!(eventDateTime && !isNaN(eventDateTime.getTime()));
        const timing = _buildEventTimingMeta(eventDateTime);
        const category = _calEventCategory(safeTitle) || 'OUTROS';
        const frequency = _getEventFrequency(category);
        const dateLabel = hasValidDate
            ? eventDateTime.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
            : 'Data não informada';
        const timeLabel = hasValidDate
            ? eventDateTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
            : timeRaw;
        const lastCalendarSync = calendarCache?.lastUpdate
            ? new Date(calendarCache.lastUpdate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
            : 'indisponível';
        
        const modal = document.createElement('div');
        modal.id = 'event-detail-modal';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0); z-index: 9999; display: flex; align-items: flex-end; justify-content: center; transition: background 0.25s ease;';

        modal.innerHTML = `
            <div id="event-modal-sheet" style="background: var(--bg-secondary, #1a1a2e); width: calc(100% - 16px); max-width: 420px; border-radius: 20px; overflow: hidden; max-height: 85vh; display: flex; flex-direction: column; transform: translateY(100%); transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1); will-change: transform; margin-bottom: calc(env(safe-area-inset-bottom, 0px) + 12px);">
                <!-- Header -->
                <div style="padding: 20px; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between; align-items: center; flex-shrink: 0;">
                    <div>
                        <h3 style="margin: 0; font-size: 18px; color: white; display: flex; align-items: center; gap: 8px;">
                            <i class="fas ${eventInfo.icon}" style="color: ${eventInfo.color};"></i>
                            ${safeTitle}
                        </h3>
                        <p style="margin: 4px 0 0; font-size: 12px; color: #888;">Data: ${dateLabel} • ${timeLabel}</p>
                    </div>
                    <button id="close-event-modal" style="background: rgba(255,255,255,0.1); border: none; width: 36px; height: 36px; border-radius: 50%; color: white; font-size: 18px; cursor: pointer;">
                        <i class="fas fa-times"></i>
                    </button>
                </div>

                <div style="padding: 16px; padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 24px); overflow-y: auto; flex: 1; -webkit-overflow-scrolling: touch;">
                    <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom: 12px;">
                        <span style="font-size: 10px; color: ${impactMeta.color}; background: ${impactMeta.bg}; border: 1px solid ${impactMeta.color}3d; padding: 4px 8px; border-radius: 999px; font-weight: 700; display:flex; align-items:center; gap:6px;">
                            <i class="fas ${impactMeta.icon}"></i>
                            ${impactMeta.label}
                        </span>
                    </div>

                    <div style="background: linear-gradient(135deg, rgba(30,41,59,0.85) 0%, rgba(15,23,42,0.95) 100%); border-radius: 14px; border: 1px solid rgba(148,163,184,0.2); padding: 14px; margin-bottom: 12px;">
                        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
                            <div>
                                <div style="font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.4px; font-weight: 700;">${timing.label}</div>
                                <div style="font-size: 26px; font-weight: 900; color: ${timing.color}; margin-top: 4px; line-height: 1.1;">${timing.remaining}</div>
                            </div>
                            <div style="width: 54px; height: 54px; border-radius: 50%; background: ${timing.color}18; border: 1px solid ${timing.color}33; display:flex; align-items:center; justify-content:center; color:${timing.color};">
                                <i class="fas ${timing.state === 'upcoming' ? 'fa-hourglass-half' : timing.state === 'past' ? 'fa-calendar-check' : 'fa-circle-info'}"></i>
                            </div>
                        </div>
                    </div>

                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 14px;">
                        <div style="background: rgba(148,163,184,0.08); border-radius: 10px; padding: 10px; border: 1px solid rgba(148,163,184,0.14);">
                            <div style="font-size: 9px; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Frequência</div>
                            <div style="font-size: 13px; font-weight: 800; color: var(--text-primary); margin-top: 4px;">${frequency}</div>
                        </div>
                        <div style="background: rgba(148,163,184,0.08); border-radius: 10px; padding: 10px; border: 1px solid rgba(148,163,184,0.14);">
                            <div style="font-size: 9px; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Horário</div>
                            <div style="font-size: 14px; font-weight: 800; color: var(--text-primary); margin-top: 4px;">${timeLabel}</div>
                        </div>
                        <div style="grid-column: 1 / -1; background: rgba(148,163,184,0.08); border-radius: 10px; padding: 10px; border: 1px solid rgba(148,163,184,0.14);">
                            <div style="font-size: 9px; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Fonte</div>
                            <div style="font-size: 12px; font-weight: 800; color: var(--text-primary); margin-top: 4px;">${sourceRaw}</div>
                        </div>
                    </div>

                    <div style="margin-bottom: 10px; padding: 12px; background: rgba(59,130,246,0.08); border-radius: 10px; border: 1px solid rgba(59,130,246,0.22);">
                        <div style="font-size: 10px; color: #93c5fd; text-transform: uppercase; font-weight: 700; margin-bottom: 6px;">Contexto do Evento</div>
                        <div style="font-size: 12px; color: #dbeafe; line-height: 1.5;">${eventInfo.description}</div>
                        <div style="margin-top: 8px; font-size: 11px; color: #bfdbfe;">País: ${countryRaw} • Sync calendário: ${lastCalendarSync}</div>
                    </div>

                    <!-- Expectativa -->
                    ${eventInfo.expectation ? `
                        <div style="margin-top: 16px; padding: 12px; background: rgba(59, 130, 246, 0.1); border-radius: 10px; border-left: 3px solid #3b82f6;">
                            <h5 style="margin: 0 0 6px; color: #3b82f6; font-size: 12px;">💡 O que esperar?</h5>
                            <p style="margin: 0; color: #aaa; font-size: 12px; line-height: 1.5;">${eventInfo.expectation}</p>
                        </div>
                    ` : ''}
                </div>
            </div>
            <style>
                @keyframes spin { to { transform: rotate(360deg); } }
            </style>
        `;
        
        document.body.appendChild(modal);
        
        // Animate in (slide up + fade background)
        requestAnimationFrame(() => {
            modal.style.background = 'rgba(0,0,0,0.85)';
            const sheet = document.getElementById('event-modal-sheet');
            if (sheet) sheet.style.transform = 'translateY(0)';
        });

        const closeEventModal = () => {
            const sheet = document.getElementById('event-modal-sheet');
            if (sheet) sheet.style.transform = 'translateY(100%)';
            modal.style.background = 'rgba(0,0,0,0)';

            setTimeout(() => modal.remove(), 300);
        };

        document.getElementById('close-event-modal').addEventListener('click', () => {
            closeEventModal();
        });
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeEventModal();
            }
        });

    }
    
    function getEventInfo(title) {
        const info = {
            'Folha de Pagamento Não-Agrícola': {
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
    async function loadMacroData() {
        if (macroLoaded) {
            // Se dados estão velhos, forçar atualização em background
            if (Date.now() - lastPriceUpdate > PRICE_UPDATE_INTERVAL) {
                loadAllPricesInstant().catch(() => {});
            }
            return macroPriceFetchPromise || Promise.resolve(true);
        }
        
        macroLog('=== MACRO v14.0 - FED WATCH DINÂMICO + CALENDÁRIO INTERATIVO ===', 'success');
        macroLoaded = true;

        try { pruneChartCache(); } catch(e) {}
        
        try { loadCachedPrices({ allowStale: true }); } catch(e) {}
        try { renderAllIndicators(); } catch(e) { macroLog('Erro renderAllIndicators: ' + e.message, 'error'); }
        try { updateFedWatch(); } catch(e) { macroLog('Erro updateFedWatch: ' + e.message, 'error'); }
        try { updateEconomicCalendar(); } catch(e) { macroLog('Erro updateEconomicCalendar: ' + e.message, 'error'); }
        let preloadPromise = Promise.resolve(true);
        try { preloadPromise = warmupMacroPrices(); } catch(e) { macroLog('Erro loadAllPricesInstant: ' + e.message, 'error'); }
        
        setTimeout(() => connectMacroWebSocket(), 1000);
        
        macroIntervals.fedWatch = setInterval(updateFedWatch, 30 * 60 * 1000);
        macroIntervals.calendar = setInterval(updateEconomicCalendar, CALENDAR_REFRESH_INTERVAL);

        return preloadPromise;
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
        macroPriceFetchPromise = null;
        macroPriceFetchStartedAt = 0;
        _chartRequestId++;
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
    window.warmupMacroCharts = warmupIndicatorChartsInBackground;
    window.openIndicatorModal = openIndicatorModal;
    window.closeIndicatorModal = closeIndicatorModal;
    
    // API global para eventos do calendário
    window.MacroAPI = {
        showEventDetailsByIndex,
        showEventDetails,
        getEventInfo,
        updateFedWatch,
        updateEconomicCalendar
    };

    // Startup: renderiza apenas cache real (sem snapshot sintético).
    try {
        const hadCache = loadCachedPrices({ allowStale: true });
        if (hadCache) {
            renderAllIndicators();
        } else {
            renderAllIndicators();
        }
    } catch(_) {}

    // Preload em background para abrir a aba MACRO já com dados prontos.
    setTimeout(() => {
        try { warmupMacroPrices(); } catch(_) {}
        try { updateFedWatch(); } catch(_) {}
    }, 120);

    macroLog('✓ macro-section.js v23.0 carregado! (real-only market indicators)', 'success');
})();

// Eager preload for early rendering
setTimeout(() => {
    if (window.fetchMarketIndicators) {
        window.fetchMarketIndicators().catch(err => console.error('Early macro prices preload failed:', err));
    }
    if (window.warmupMacroCharts) {
        setTimeout(() => {
            window.warmupMacroCharts().catch(err => console.error('Early macro chart warmup failed:', err));
        }, 250);
    }
}, 120);

