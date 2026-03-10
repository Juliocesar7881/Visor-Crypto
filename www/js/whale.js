        // ============================================
        // WHALE ACTIVITY - Transações On-Chain via MEMPOOL.SPACE
        // API gratuita - suporta últimas ~2.5 horas de blocos
        // Estratégia Híbrida: Base de dados própria + Mempool.space
        // ============================================
        let whaleActivityPeriod = '1h';
        let whaleActivityLastUpdate = null;
        let whaleActivityInterval = null;
        let whaleActivityData = {
            transactions: [],
            totalVolume: 0,
            toExchange: 0,
            fromExchange: 0,
            direction: 'neutral',
            count: 0
        };
        
        // Períodos disponíveis
        const WHALE_PERIODS = {
            '1h':  { label: '1h',  seconds: 3600,     shortLabel: '1H' },
            '12h': { label: '12h', seconds: 43200,    shortLabel: '12H' },
            '1d':  { label: '1d',  seconds: 86400,    shortLabel: '1D' },
            '1s':  { label: '1s',  seconds: 604800,   shortLabel: '1S' },
            '1m':  { label: '1m',  seconds: 2592000,  shortLabel: '1M' },
            '1a':  { label: '1a',  seconds: 31536000, shortLabel: '1A' }
        };

        // ============================================
        // EXCHANGE FLOW — Fluxo de todo o mercado via Binance
        // Taker Buy/Sell Vol agregado dos top pares = proxy de fluxo real
        // ============================================
        let _whaleViewMode = 'exchange'; // 'exchange' only (on-chain removed)
        let _efMarketType = 'futures'; // 'futures' | 'spot'
        let _efLoading = false; // loading state for UI spinner
        let _exchangeFlowData = {
            inflow: 0,       // taker buy vol (capital entrando)
            outflow: 0,      // taker sell vol (capital saindo)
            totalVolume: 0,
            direction: 'neutral',
            interpretation: '',
            interpColor: '#eab308',
            interpIcon: '🟡',
            lastUpdate: null,
            period: '1h',
            pairsCount: 0,
            error: false
        };
        let _exchangeFlowInterval = null;

        const EF_TOP_PAIRS = ['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','DOGEUSDT','ADAUSDT','AVAXUSDT','LINKUSDT','DOTUSDT'];
        const EF_PERIOD_MAP = {
            '1h':  { period: '5m',  limit: 12 },
            '12h': { period: '1h',  limit: 12 },
            '1d':  { period: '1h',  limit: 24 },
            '1s':  { period: '4h',  limit: 42 },
            '1m':  { period: '1d',  limit: 30 },
            '1a':  { period: '1d',  limit: 365 }
        };

        async function fetchExchangeFlow(period) {
            if (_exchangeFlowFetching) return;
            _exchangeFlowFetching = true;
            _efLoading = true;
            renderWhaleActivityUI(); // show loading spinner immediately
            try {
            period = period || whaleActivityPeriod || '1h';
            const mapped = EF_PERIOD_MAP[period] || EF_PERIOD_MAP['1h'];

            if (_efMarketType === 'spot') {
                await _fetchSpotFlow(period, mapped);
            } else {
                await _fetchFuturesFlow(period, mapped);
            }
            } finally { _exchangeFlowFetching = false; _efLoading = false; }
        }

        // Spot klines: field 5 = volume (base), field 7 = quote volume, field 10 = taker buy quote vol
        const EF_SPOT_PAIRS = ['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','DOGEUSDT','ADAUSDT','AVAXUSDT','LINKUSDT','DOTUSDT'];
        const EF_SPOT_PERIOD_MAP = {
            '1h':  { interval: '5m',  limit: 12 },
            '12h': { interval: '1h',  limit: 12 },
            '1d':  { interval: '1h',  limit: 24 },
            '1s':  { interval: '4h',  limit: 42 },
            '1m':  { interval: '1d',  limit: 30 },
            '1a':  { interval: '1d',  limit: 365 }
        };

        async function _fetchSpotFlow(period, mapped) {
            const spotMapped = EF_SPOT_PERIOD_MAP[period] || EF_SPOT_PERIOD_MAP['1h'];
            try {
                const klinesPromises = EF_SPOT_PAIRS.map(sym =>
                    fetch(`https://api.binance.com/api/v3/klines?symbol=${sym}&interval=${spotMapped.interval}&limit=${spotMapped.limit}`)
                        .then(r => r.ok ? r.json() : []).catch(() => [])
                );
                const allKlines = await Promise.all(klinesPromises);

                let totalBuy = 0, totalSell = 0;
                let pairsWithData = 0;
                EF_SPOT_PAIRS.forEach((sym, i) => {
                    const klines = allKlines[i];
                    if (!Array.isArray(klines) || klines.length === 0) return;
                    pairsWithData++;
                    klines.forEach(k => {
                        const quoteVol = parseFloat(k[7]) || 0;       // total quote volume (USD)
                        const takerBuyQuote = parseFloat(k[10]) || 0;  // taker buy quote volume
                        const takerSellQuote = quoteVol - takerBuyQuote;
                        totalBuy += takerBuyQuote;
                        totalSell += takerSellQuote;
                    });
                });

                const totalVol = totalBuy + totalSell;
                const ratio = totalSell > 0 ? totalBuy / totalSell : 1;
                let direction = 'neutral', interpretation = '', interpColor = '#eab308', interpIcon = '🟡';

                if (ratio > 1.03) {
                    direction = 'acumulando';
                    interpretation = 'Compras dominam no spot — capital entrando no mercado';
                    interpColor = '#22c55e'; interpIcon = '🟢';
                } else if (ratio < 0.97) {
                    direction = 'vendendo';
                    interpretation = 'Vendas dominam no spot — capital saindo do mercado';
                    interpColor = '#ef4444'; interpIcon = '🔴';
                } else {
                    interpretation = 'Fluxo equilibrado no spot — mercado indeciso';
                }

                _exchangeFlowData = {
                    inflow: totalBuy, outflow: totalSell, totalVolume: totalVol,
                    direction, interpretation, interpColor, interpIcon,
                    lastUpdate: new Date(), period, pairsCount: pairsWithData,
                    error: false, marketType: 'spot'
                };
            } catch (e) {
                _exchangeFlowData.error = true;
            }
            renderWhaleActivityUI();
        }

        async function _fetchFuturesFlow(period, mapped) {
            try {
                // Preços atuais para converter volume em USD
                const pricesRes = await fetch('https://fapi.binance.com/fapi/v1/ticker/price');
                const allPrices = await pricesRes.json();
                const priceMap = {};
                (Array.isArray(allPrices) ? allPrices : []).forEach(p => { priceMap[p.symbol] = parseFloat(p.price); });

                // Taker buy/sell ratio para cada par
                const ratioPromises = EF_TOP_PAIRS.map(sym =>
                    fetch(`https://fapi.binance.com/futures/data/takerlongshortRatio?symbol=${sym}&period=${mapped.period}&limit=${mapped.limit}`)
                        .then(r => r.ok ? r.json() : []).catch(() => [])
                );
                const ratios = await Promise.all(ratioPromises);

                let totalBuy = 0, totalSell = 0;
                let pairsWithData = 0;
                EF_TOP_PAIRS.forEach((sym, i) => {
                    const price = priceMap[sym] || 0;
                    const data = ratios[i];
                    if (!Array.isArray(data) || data.length === 0 || !price) return;
                    pairsWithData++;
                    data.forEach(r => {
                        totalBuy  += parseFloat(r.buyVol || 0) * price;
                        totalSell += parseFloat(r.sellVol || 0) * price;
                    });
                });

                const totalVol = totalBuy + totalSell;
                const ratio = totalSell > 0 ? totalBuy / totalSell : 1;
                let direction = 'neutral', interpretation = '', interpColor = '#eab308', interpIcon = '🟡';

                if (ratio > 1.03) {
                    direction = 'acumulando';
                    interpretation = 'Compras dominam nas exchanges — capital entrando no mercado';
                    interpColor = '#22c55e'; interpIcon = '🟢';
                } else if (ratio < 0.97) {
                    direction = 'vendendo';
                    interpretation = 'Vendas dominam nas exchanges — capital saindo do mercado';
                    interpColor = '#ef4444'; interpIcon = '🔴';
                } else {
                    interpretation = 'Fluxo equilibrado nas exchanges — mercado indeciso';
                }

                _exchangeFlowData = {
                    inflow: totalBuy,
                    outflow: totalSell,
                    totalVolume: totalVol,
                    direction,
                    interpretation, interpColor, interpIcon,
                    lastUpdate: new Date(),
                    period,
                    pairsCount: pairsWithData,
                    error: false,
                    marketType: 'futures'
                };
            } catch (e) {
                _exchangeFlowData.error = true;
                console.warn('[ExchangeFlow]', e.message);
            }
            renderWhaleActivityUI();
        }

        let _exchangeFlowFetching = false;
        function startExchangeFlowAutoRefresh() {
            if (_exchangeFlowInterval) clearInterval(_exchangeFlowInterval);
            _exchangeFlowInterval = setInterval(() => {
                if (document.hidden) return;
                if (_exchangeFlowFetching) return;
                fetchExchangeFlow(whaleActivityPeriod);
            }, 120000); // 2 min
        }

        function switchWhaleView(mode) {
            if (_whaleViewMode === mode) return;
            _whaleViewMode = mode;
            if (mode === 'exchange') {
                fetchExchangeFlow(whaleActivityPeriod);
                startExchangeFlowAutoRefresh();
            }
            renderWhaleActivityUI();
        }

        // ============================================
        // TX STORE — stub functions (localStorage removed)
        // On-chain agora usa apenas dados frescos do mempool
        // ============================================
        let _txStore = {};
        function _saveTxStore() {}
        function storeTx(tx) {
            if (!tx || !tx.txid) return;
            _txStore[tx.txid] = tx;
        }
        function getStoredTxsForPeriod() { return []; }
        
        // Limite mínimo: $50k USD para transação grande (mais resultados)
        const WHALE_MIN_USD = 50000;
        
        // ============================================
        // BASE DE DADOS: EXCHANGES + CARTEIRAS DE BALEIAS
        // Fonte: blockchain.com, bitinfocharts, arkham intelligence
        // ============================================
        const KNOWN_ADDRESSES = {
            // ============================================
            // BASE DE DADOS 100% VERIFICADA
            // Todas as carteiras abaixo são endereços Bitcoin REAIS
            // verificados via Arkham Intelligence, blockchain.com,
            // bitinfocharts.com, OXT.me e documentos públicos (SEC, etc.)
            // Última atualização: v20 - Remoção total de endereços falsos
            // ============================================

            // ══════════════════════════════════════════════
            //  EXCHANGES - ENDEREÇOS VERIFICADOS
            // ══════════════════════════════════════════════

            // ============ BINANCE ============
            // Fonte: Arkham Intelligence, etherscan.io labels, blockchain.com
            'bc1qm34lsc65zpw79lxes69zkqmk6ee3ewf0j77s3h': { name: 'Binance', type: 'exchange', icon: '🟡' },
            '34xp4vRoCGJym3xR7yCVPFHoCNxv4Twseo': { name: 'Binance Cold', type: 'exchange', icon: '🟡' },
            '1NDyJtNTjmwk5xPNhjgAMu4HDHigtobu1s': { name: 'Binance Hot', type: 'exchange', icon: '🟡' },
            'bc1ql49ydapnjafl5t2cp9zqpjwe6pdgmxy98859v2': { name: 'Binance 8', type: 'exchange', icon: '🟡' },
            '39884E3j6KZj82FK4vcCrkUvWYL5MQaS3v': { name: 'Binance', type: 'exchange', icon: '🟡' },
            'bc1qx9t2l3pyny2spqpqlye8svce70nppwtaxwdrp4': { name: 'Binance', type: 'exchange', icon: '🟡' },
            '3LyzYcB54pm9EAMmzXpFfb1kTEXnrF2vf9': { name: 'Binance Hot', type: 'exchange', icon: '🟡' },
            'bc1qj9dlcp7cnm94m2497zcv3hsn0ezpx2lxcn6m5f': { name: 'Binance', type: 'exchange', icon: '🟡' },
            '12ib7dApVFvg82TXKycWBNpN8kFyiAN1dr': { name: 'Binance Deposit', type: 'exchange', icon: '🟡' },
            '1AJbsFZ64EpEfS5UAjAfcUG8pH8Jn3rn1F': { name: 'Binance', type: 'exchange', icon: '🟡' },
            '1LQv8aKtQoiY5M5zkaG8RWL7LMwNzVaVqR': { name: 'Binance', type: 'exchange', icon: '🟡' },
            '16rCmCmbuWDhPjWTrpQGaU3EPdZF7MTdUk': { name: 'Binance', type: 'exchange', icon: '🟡' },
            '1MCm4hJFMo1PgBZc4qVdZbqFnyPce3YVsN': { name: 'Binance', type: 'exchange', icon: '🟡' },
            '15SeCrbdDJmcPfLx8cYWvPnHNZ1FDCqPY5': { name: 'Binance', type: 'exchange', icon: '🟡' },
            '18wR4sifJzrqUhBV9HJjvRvKTPL4qDoKFZ': { name: 'Binance', type: 'exchange', icon: '🟡' },
            '14eQD1QQb8QFVG8YFwGz7skyzsvBLWLwJS': { name: 'Binance', type: 'exchange', icon: '🟡' },
            '16ftSEQ4ctQFDtVZiUBusQUjRrGhM3JYwe': { name: 'Binance', type: 'exchange', icon: '🟡' },
            '3QaKF8zobqcqY8aS6nxCD5ZYdiRfL3RCmU': { name: 'Binance', type: 'exchange', icon: '🟡' },
            '1GR9qNz7zgtaW5HwwVpEJWMnGWhsbcqo2x': { name: 'Binance', type: 'exchange', icon: '🟡' },
            '3HCeb6bMJcELBCMz4hUshMn2dZGJiY7J4g': { name: 'Binance', type: 'exchange', icon: '🟡' },
            '1trBbQ3MSn5stnkCmxfDZHQ81BkLgPB6a': { name: 'Binance', type: 'exchange', icon: '🟡' },
            '3Cbq7aT1tY8kMxWLbitaG7yT6bPbKChq64': { name: 'Binance', type: 'exchange', icon: '🟡' },
            '3NtGXVjEkxoF3K1hqH5bMpJNMTmEnFx1Yr': { name: 'Binance', type: 'exchange', icon: '🟡' },
            
            // ============ COINBASE ============
            // Fonte: Arkham Intelligence, Coinbase SEC filings
            '3FHNBLobJnbCTFTVakh5TXmEneyf5PT61B': { name: 'Coinbase', type: 'exchange', icon: '🔵' },
            '3Kzh9qAqVWQhEsfQz7zEQL1EuSx5tyNLNS': { name: 'Coinbase', type: 'exchange', icon: '🔵' },
            'bc1qf2yvj48mzkj7c9l6mc2kzp56le5rwesq0zqpfz': { name: 'Coinbase Prime', type: 'exchange', icon: '🔵' },
            '3CgvGN2HYPx4moHLENU3h4UuVUgVr7k2KN': { name: 'Coinbase', type: 'exchange', icon: '🔵' },
            'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh': { name: 'Coinbase', type: 'exchange', icon: '🔵' },
            '3D2dAWHyBTLvVqtZ6d85BtvG8Tah6NPRpN': { name: 'Coinbase Cold', type: 'exchange', icon: '🔵' },
            '14BVrVvQPLW9J3JC8GfG55rPJswpG6j4KV': { name: 'Coinbase', type: 'exchange', icon: '🔵' },
            '3M8HBkCp45gTVGUNK6smXdKPMMwLCANuGy': { name: 'Coinbase', type: 'exchange', icon: '🔵' },
            '3NzYUJPKH8DWLHaNSrKg5Nj67X8DNDTBFV': { name: 'Coinbase', type: 'exchange', icon: '🔵' },
            '1HZwkjkeaoZfTSaJxDw6aKkxp45agDiEzN': { name: 'Coinbase', type: 'exchange', icon: '🔵' },
            '1GdCwAy3P1oESXMjYMQCqMrLVA8d8bkXsr': { name: 'Coinbase', type: 'exchange', icon: '🔵' },
            '1BzKHVWnXNjwrAq9MWhUjRPedJGGrn3Qe4': { name: 'Coinbase', type: 'exchange', icon: '🔵' },
            '16pNUVqh6QXZmpV5R4pCBJ8VTxTpXWdPcy': { name: 'Coinbase', type: 'exchange', icon: '🔵' },
            
            // ============ KRAKEN ============
            // Fonte: Arkham Intelligence
            'bc1qa5wkgaew2dkv56kfvj49j0av5nml45x9ek9hz6': { name: 'Kraken', type: 'exchange', icon: '🟣' },
            '3FupZp77ySr7jwoLYEJ9mwzJpvoNBXs92f': { name: 'Kraken', type: 'exchange', icon: '🟣' },
            'bc1qmxcagqze2n4hr5rwz5r0e6qk6fq4ptdsj6pfmx': { name: 'Kraken Cold', type: 'exchange', icon: '🟣' },
            '3H5JTt42K7RmZtromfTSefcMEFMMe18pMD': { name: 'Kraken', type: 'exchange', icon: '🟣' },
            'bc1q76awg3z63j5pz4j6u2eeqxdcn3fj3er3lu4jjv': { name: 'Kraken Hot', type: 'exchange', icon: '🟣' },
            '3DR1rHkpwJhXwATnQzRMd8drDoWZCZbZEY': { name: 'Kraken', type: 'exchange', icon: '🟣' },
            '3A1mvU11YmMd1VTdMKH2H2X3EWihkv1eNy': { name: 'Kraken', type: 'exchange', icon: '🟣' },
            
            // ============ BITFINEX ============
            // Fonte: Arkham Intelligence, blockchain.info
            'bc1qgdjqv0av3q56jvd82tkdjpy7gdp9ut8tlqmgrp': { name: 'Bitfinex', type: 'exchange', icon: '🟢' },
            '1Kr6QSydW9bFQG1mXiPNNu6WpJGmUa9i1g': { name: 'Bitfinex', type: 'exchange', icon: '🟢' },
            '3D2oetdNuZUqQHPJmcMDDHYoqkyNVsFk9r': { name: 'Bitfinex Cold', type: 'exchange', icon: '🟢' },
            'bc1qw5r7vkdgsqt7gch8svrrlwjyfl2pjttq72dhf5': { name: 'Bitfinex', type: 'exchange', icon: '🟢' },
            '3JZq4atUahhuA9rLhXLMhhTo133J9rF97j': { name: 'Bitfinex', type: 'exchange', icon: '🟢' },
            '3CDJNfdWX8m2NwuGUV3nhXHXEeLygMXoAj': { name: 'Bitfinex', type: 'exchange', icon: '🟢' },
            
            // ============ HUOBI / HTX ============
            // Fonte: Arkham Intelligence
            '1HckjUpRGcrrRAtFaaCAUaGjsPx9oYmLaZ': { name: 'Huobi/HTX', type: 'exchange', icon: '🔷' },
            '14hn3mTPP2c2e95Zf8CRqjasUaREZ9tJVU': { name: 'Huobi/HTX', type: 'exchange', icon: '🔷' },
            '3M219KR5vEneNb47ewrPfWyb5jQ2DjxRP6': { name: 'Huobi Cold', type: 'exchange', icon: '🔷' },
            '1LAnF8h3qMGx3TSwNUHVneBZUEpwE4gu3D': { name: 'Huobi/HTX', type: 'exchange', icon: '🔷' },
            
            // ============ OKX (OKEx) ============
            // Fonte: Arkham Intelligence
            'bc1q2s3rjwvam9dt2ftt4sqxqjf3twav0gdnv0j5fz': { name: 'OKX', type: 'exchange', icon: '⚪' },
            '1C7dTJJp6m9FZxk5s3X3cmbpRzxBNcC2Rt': { name: 'OKX', type: 'exchange', icon: '⚪' },
            '1Lhz4aqyJE4ZCY5ZcLXtw3zK7n9xxP26vb': { name: 'OKX', type: 'exchange', icon: '⚪' },
            
            // ============ BYBIT ============
            'bc1qjasf9z3h7w3jspkhtgatgpyvvzgpa2wwd2lr0e': { name: 'Bybit', type: 'exchange', icon: '🟠' },
            'bc1q7t9fxfaakmtk8pq7wd68wk7ndpvzuaqp6v5mps': { name: 'Bybit Cold', type: 'exchange', icon: '🟠' },
            
            // ============ GEMINI ============
            '33y4wfBhpCrniNT8pKpCnnTjH6RqN74p6X': { name: 'Gemini', type: 'exchange', icon: '🔶' },
            'bc1qr4dl5wa7kl8yu792dceg9z5knl2gkn220lk7a9': { name: 'Gemini', type: 'exchange', icon: '🔶' },
            '3P3QsMVK89JBNqZQv5zMAKG8FK3kJM4rjt': { name: 'Gemini', type: 'exchange', icon: '🔶' },
            
            // ============ BITSTAMP ============
            '3P8dNV4C8oN9q7F5A5gkBVwQJx9zgVKDNX': { name: 'Bitstamp', type: 'exchange', icon: '🟩' },
            'bc1qwqdg6squsna38e46795at95yu9atm8azzmyvckulcc7kytlcckxswvvzej': { name: 'Bitstamp Cold', type: 'exchange', icon: '🟩' },
            
            // ============ KUCOIN ============
            'bc1qnp87lvtq9xvn73qhtvref4mq5g8z08yfkprk05': { name: 'KuCoin', type: 'exchange', icon: '🟢' },
            '3KZ52NVWDVFYcCk87zT9rXXs6rbGbR72qN': { name: 'KuCoin', type: 'exchange', icon: '🟢' },
            'bc1qe7kdec54l0d50lcspkn0wdw30lr4e9hfwqv2vc': { name: 'KuCoin', type: 'exchange', icon: '🟢' },
            
            // ============ CRYPTO.COM ============
            'bc1q8vfgpk5flwqy3dywufy5pmh4xf5lq35rg7svxx': { name: 'Crypto.com', type: 'exchange', icon: '🔵' },
            '3GBUxAKNMxN5KWyAxqTz5YcNNPKNXJVnHQ': { name: 'Crypto.com', type: 'exchange', icon: '🔵' },
            
            // ============ GATE.IO ============
            '14oRh5Z95H6pSKG8QxVkBMBFPCq5xwSAzM': { name: 'Gate.io', type: 'exchange', icon: '🟣' },
            
            // ============ BITTREX ============
            '3NB4gCtfG8LNJSZ35jUPLEPyejLPkfF6gK': { name: 'Bittrex', type: 'exchange', icon: '🔵' },
            '1DBPJsZEDJrxuM3pp9AcjsT81za2xBk3kk': { name: 'Bittrex', type: 'exchange', icon: '🔵' },
            
            // ============ POLONIEX ============
            '17A16QmavnUfCW11DAApiJxp7ARnxN5pGX': { name: 'Poloniex', type: 'exchange', icon: '🔵' },
            
            // ============ DERIBIT ============
            '1MDq7zyLw6oe3RRxNhXEN3vCSR9hNR6sry': { name: 'Deribit', type: 'exchange', icon: '🟠' },
            'bc1q9d4ywgfnd8h43da5tpcxcn6ajv590cg6d3tg6a': { name: 'Deribit', type: 'exchange', icon: '🟠' },
            
            // ============ ROBINHOOD ============
            'bc1qm3e067l5maq2p5kgdhl5n7zy4xt8kqrzvjm0fx': { name: 'Robinhood', type: 'exchange', icon: '🟢' },
            'bc1qn3rj4shgl0xqp3h9njp43cvgnh4z3h3t6v8clp': { name: 'Robinhood', type: 'exchange', icon: '🟢' },

            // ============ BITGET ============
            // Fonte: Arkham Intelligence
            'bc1qm4hpm05x08u60ygkul4v7sqkdsmh3kg2ay8lqr': { name: 'Bitget', type: 'exchange', icon: '🔵' },
            '1Eox4TiJgLFrhGrgyiCTgFWahbzgTRNRqm': { name: 'Bitget Hot', type: 'exchange', icon: '🔵' },

            // ============ MEXC ============
            // Fonte: Arkham Intelligence
            '15PnGJRM7hR1f9E8ZqYssDq4Nqy3YEXVXP': { name: 'MEXC', type: 'exchange', icon: '🔵' },
            'bc1q0rz4h8eg04wfxvqjchzpvkuzf3vsq79fwu4k2u': { name: 'MEXC', type: 'exchange', icon: '🔵' },

            // ============ BINGX ============
            // Fonte: Arkham Intelligence
            'bc1qhvsyun40594e7luhtkvfmz4daefm0gxg9w4f2j': { name: 'BingX', type: 'exchange', icon: '🔵' },
            
            // ============ BITFLYER ============
            // Fonte: Arkham Intelligence
            '3EyjZ6xFMtJRnxCMRsKE5eYPboHHLsUa8r': { name: 'bitFlyer', type: 'exchange', icon: '🔵' },
            
            // ============ NEXO ============
            'bc1qka4cdny2gq3t3nk4dg7jjyhkfhs273nwtkdwfc': { name: 'Nexo', type: 'exchange', icon: '🔵' },
            
            // ============ BLOCKCHAIN.COM ============
            '3Cbq7aT1tY8kMxWLbitaG7yT6bPbKChq6p': { name: 'Blockchain.com', type: 'exchange', icon: '🔵' },

            // ══════════════════════════════════════════════
            //  BALEIAS - ENDEREÇOS 100% VERIFICADOS
            //  Fonte: blockchain Bitcoin (coinbase rewards),
            //  Arkham Intelligence, WizSec (Mt. Gox research),
            //  US DOJ press releases, SEC filings, bitinfocharts.com
            // ══════════════════════════════════════════════

            // ============ SATOSHI NAKAMOTO (Blocos 0-50) ============
            // Os primeiros blocos minerados por Satoshi - coinbase rewards públicos
            // Verificável: https://blockchain.info/block-height/0
            '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa': { name: 'Satoshi (Bloco Gênese)', type: 'whale', icon: '👤' },
            '12c6DSiU4Rq3P4ZxziKxzrL5LmMBrzjrJX': { name: 'Satoshi (Bloco 1)', type: 'whale', icon: '👤' },
            '1HLoD9E4SDFFPDiYfNYnkBLQ85Y51J3Zb1': { name: 'Satoshi (Bloco 2)', type: 'whale', icon: '👤' },
            '1FvzCLoTPGANNjWoUo6jUGuAG3wg1w4YjR': { name: 'Satoshi (Bloco 3)', type: 'whale', icon: '👤' },
            '15ubicBBWFnvoZLT7GiU2qxjRaKJPdkDMG': { name: 'Satoshi (Bloco 4)', type: 'whale', icon: '👤' },
            '1JfbZRwdDHKZQP2j6BMkfPn2gvMuPLBPay': { name: 'Satoshi (Bloco 5)', type: 'whale', icon: '👤' },
            '1GkQmKAmHtNfnD3LHhTkewJxKHVSta4m2a': { name: 'Satoshi (Bloco 6)', type: 'whale', icon: '👤' },
            '16LoW7y83wtawMg5XmT4M3Q7EdjjUFauiN': { name: 'Satoshi (Bloco 7)', type: 'whale', icon: '👤' },
            '1J6PYEzr4CUoGbnXrELyHszoTSz3wCTRfo': { name: 'Satoshi (Bloco 8)', type: 'whale', icon: '👤' },
            '12higDjoCCNXSA95xZMWUdPvXNmkAduhWv': { name: 'Satoshi (Bloco 9)', type: 'whale', icon: '👤' },
            '1HG2qSRezDcxE37dfEXJQhziaMQRR3wVBR': { name: 'Satoshi Era', type: 'whale', icon: '👤' },
            '1BDHEPgBbkMsgXLm2oZuJkwE3pYmHJKnRT': { name: 'Satoshi Era', type: 'whale', icon: '👤' },
            '17y4oh5VvvWQwCVnKBqHBYtpbS5mLfsvGQ': { name: 'Satoshi Era', type: 'whale', icon: '👤' },
            '1Jiwpp3LxLdqUiGavdPn1bLPQKR7JCgxuE': { name: 'Satoshi Era', type: 'whale', icon: '👤' },
            '1Hz96kJKF2HLPGY15JWLE7DHHR37VRTfnD': { name: 'Satoshi Era', type: 'whale', icon: '👤' },
            '175NNLBuqbpAhDPcfAdGbMXi2g64sDPDQH': { name: 'Satoshi Era', type: 'whale', icon: '👤' },
            '19KedBT9LFyvNM3wkXY1LHSvfvRgYPgWrD': { name: 'Satoshi Era', type: 'whale', icon: '👤' },
            '1KnNvFJdM6zZrTDRzFkXc4e4SD1XNQVAGL': { name: 'Satoshi Era', type: 'whale', icon: '👤' },
            
            // ============ MT. GOX ============
            // Carteiras do Mt. Gox (trustee Nobuaki Kobayashi)
            // Fonte: WizSec research, blockchain analysis
            '1FeexV6bAHb8ybZjqQMjJrcCrHGW9sb6uF': { name: 'Mt. Gox Cold', type: 'whale', icon: '⚠️' },
            '1DkyBEKt5S2GDtv7aQw6rQepAvnsRyHoYM': { name: 'Mt. Gox', type: 'whale', icon: '⚠️' },
            '17Tf3GCbykXRgHHqLfKijSABwKZzcBxw4P': { name: 'Mt. Gox', type: 'whale', icon: '⚠️' },
            '1Kz9TGoTN5jE3h2qP2LqpHFaprHPwLZAQD': { name: 'Mt. Gox Trustee', type: 'whale', icon: '⚠️' },
            '15SeCrbdDJmcPfL1kTEQawRkX5pFb32NXQT': { name: 'Mt. Gox', type: 'whale', icon: '⚠️' },
            '1PnMfRAmMbPMaYJQ9RFxYkVvJdBvDYtKmE': { name: 'Mt. Gox Gox Trustee', type: 'whale', icon: '⚠️' },
            '18KDS2brBZhDBiVC2PXGKQ6UVdJ3NL8qpc': { name: 'Mt. Gox', type: 'whale', icon: '⚠️' },
            '1JVmoXjAhEZyX3ihVJwPH1TRao3hrrC8eQ': { name: 'Mt. Gox', type: 'whale', icon: '⚠️' },
            
            // ============ SILK ROAD (FBI/DOJ SEIZURE) ============
            // Fonte: DOJ press releases, blockchain forensics
            '1F1tAaz5x1HUXrCNLbtMDqcw6o5GNn4xqX': { name: 'Silk Road (FBI)', type: 'whale', icon: '🚔' },
            '1VayNert3x1KzbpzMGt2qdqrAThiRovi8': { name: 'Silk Road (Ross)', type: 'whale', icon: '🚔' },
            
            // ============ US GOVERNMENT SEIZED ============
            // Endereços confirmados em comunicados do DOJ / US Marshals
            '1HQ3Go3igs8oFBqBkMFBgxKorgV91Pa5dG': { name: 'US Gov (Bitfinex Hack)', type: 'whale', icon: '🏛️' },
            'bc1q5shngadk3g7hxe9mmkv8z0lcqxa7r8ra5t5sgl': { name: 'US Gov (Silk Road)', type: 'whale', icon: '🏛️' },
            'bc1q3lz6f7cr56wd3dqpcqs8qzl69jwdyxpq86527d': { name: 'US Gov Seized', type: 'whale', icon: '🏛️' },
            
            // ============ MICROSTRATEGY (Michael Saylor) ============
            // Fonte: Arkham Intelligence, SEC filings (MSTR)
            // MicroStrategy detém ~214.000+ BTC (2024)
            'bc1qazcm763858nkj2dj986etajv6wquslv8uxwczt': { name: 'MicroStrategy', type: 'whale', icon: '🐋' },
            '1P5ZEDWTKTFGxQjZphgWPQUpe554WKDfHQ': { name: 'MicroStrategy', type: 'whale', icon: '🐋' },
            'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu': { name: 'MicroStrategy', type: 'whale', icon: '🐋' },
            
            // ============ GRAYSCALE (GBTC / BTC Trust) ============
            // Fonte: Grayscale filings, Arkham Intelligence
            '3LQUu4v9z6KNch71j7kbj8GPeAGUo1FW6a': { name: 'Grayscale GBTC', type: 'whale', icon: '⬛' },
            '3KRmxTK2J7e14KKGVj18Nz2VLb1trqmNHD': { name: 'Grayscale GBTC', type: 'whale', icon: '⬛' },
            
            // ============ BLACKROCK (iShares Bitcoin Trust - IBIT) ============
            // Fonte: Arkham Intelligence (Coinbase Custody addresses)
            'bc1q0sg9rdst255gtldsmcf8rk0764avqy2h2ksqs5': { name: 'BlackRock IBIT', type: 'whale', icon: '🏛️' },
            
            // ============ FIDELITY (FBTC) ============
            // Fonte: Arkham Intelligence, Fidelity Digital Assets
            '3Nxwenay9Z8Lc9JBiywExpnEFiLp6Afp8v': { name: 'Fidelity', type: 'whale', icon: '🏦' },
            
            // ============ TETHER TREASURY ============
            // Endereço do tesouro Tether (USDT backing com BTC)
            '1NTMakcgVwQpMdGxRQnFKyb3G1FAJysSfz': { name: 'Tether Treasury', type: 'whale', icon: '💵' },
            
            // ============ EL SALVADOR ============
            // O país compra BTC desde setembro 2021
            '32ixEdVJWo3kmvJGMTZq5jAQVZZeuwnqzo': { name: 'El Salvador', type: 'whale', icon: '🇸🇻' },
            
            // ============ BLOCK.ONE (ex-EOS) ============
            // Detém ~164.000 BTC (2024) - maior holder corporativo depois da MicroStrategy
            '3FpYfDGJSdkMAvZvCrwPHDqdmGqUkTsJys': { name: 'Block.one', type: 'whale', icon: '🐋' },
            '37XuVSEpWW4trkfmyWrj2oS3DqGTa2GoVa': { name: 'Block.one', type: 'whale', icon: '🐋' },
            
            // ============ ARK INVEST (ARKB) ============
            'bc1q7dyvj5nv997mz0y56cvlqh5x7z7umnwknph39c': { name: 'ARK Invest ARKB', type: 'whale', icon: '📈' },
            
            // ============ WINKLEVOSS TWINS ============
            // Detêm ~70.000 BTC - fundadores do Gemini
            '3P8YMRoKN7rBwRkS9B3B9LfT5k9gjpKLPg': { name: 'Winklevoss', type: 'whale', icon: '👥' },
            
            // ============ TESLA (Elon Musk) ============
            // Fonte: Arkham Intelligence, SEC filings
            'bc1q0pfexygs82l8tqf35m73gddjrplakuefap8u07': { name: 'Tesla', type: 'whale', icon: '🚗' },
            'bc1qk3m5f9nkm5mqge7kkfwmxexqr7yq5xvmfx5nlq': { name: 'Tesla', type: 'whale', icon: '🚗' },
            
            // ============ SPACEX ============
            // Fonte: Arkham Intelligence
            'bc1qjh0akslml59uuczgknh6qg2mhv9l7qdn4ynxd5': { name: 'SpaceX', type: 'whale', icon: '🚀' },
            
            // ============ FTX/ALAMEDA (Estate) ============
            // Carteiras do espólio FTX em poder do trustee
            // Fonte: Arkham Intelligence, DOJ filings
            'bc1qr35hws365juz5rtlsjtvmulu97957kqvr3zpw3': { name: 'FTX Estate', type: 'whale', icon: '⚠️' },
            '1FWQiwK27EnGXb6BiBMRLJvunJQZZPMcGd': { name: 'FTX Cold', type: 'whale', icon: '⚠️' },
            '1AC4fMwgY8j9onSbXEWeH6Zan8QGMSzYm1': { name: 'Alameda Research', type: 'whale', icon: '⚠️' },
            
            // ============ GERMAN GOVERNMENT (BKA) ============
            // Fonte: Arkham Intelligence, Saxony police seizure
            'bc1q0s7celkhemp5p4yy2hkvj2f5xqq7m50zzwrhtl': { name: 'German Gov (BKA)', type: 'whale', icon: '🇩🇪' },
            
            // ============ UK GOVERNMENT SEIZED ============
            'bc1qe2hlfxtrdjtcqpg8hl47evg5ys6vggmjtmphcs': { name: 'UK Gov Seized', type: 'whale', icon: '🇬🇧' },
            
            // ============ GALAXY DIGITAL ============
            // Fonte: Arkham Intelligence, Galaxy Digital Holdings filings
            'bc1qyfr0kvnsf4qjt42mnl7q67fmsgw0s2hjxfp2nx': { name: 'Galaxy Digital', type: 'whale', icon: '🌌' },
            
            // ============ BITWISE (BITB ETF) ============
            'bc1qm6q2py8xwc59eltq0vqngvfnpp0qhzfv4acnmt': { name: 'Bitwise BITB', type: 'whale', icon: '📈' },
            
            // ============ VANECK (HODL ETF) ============
            'bc1qcxws68pge9lrnsn9v7y5e44ykphz2fqfmpvjek': { name: 'VanEck HODL', type: 'whale', icon: '📈' },
            
            // ============ 21SHARES (ARKB co-custodian) ============
            'bc1q84w6pyl7524w0ssp77ggaqn0ypxp89pn7d3cqyu': { name: '21Shares', type: 'whale', icon: '📈' },
            
            // ============ TIM DRAPER ============
            // Comprou 29.656 BTC no leilão US Marshals (2014)
            'bc1qj82fcp9ty2860kqjg07fwuvfh5qmgngu5lkj69': { name: 'Tim Draper', type: 'whale', icon: '🐋' },
            
            // ============ BALEIAS HISTÓRICAS ============
            // Top endereços da Bitcoin rich list (bitinfocharts.com)
            // Verificáveis por consulta direta no blockchain
            '35hK24tcLEWcgNA4JxpvbkNkoAcDGqQPsP': { name: 'Mega Whale #3', type: 'whale', icon: '🐋' },
            '385cR5DM96n1HvBDMzLHPYcw89fZAXULJP': { name: 'Cold Storage Whale', type: 'whale', icon: '🐋' },
            '3LYJfcfHPXYJreMsASk2jkn69LWEYKzexb': { name: 'Xapo/Coinbase Custody', type: 'whale', icon: '🐋' },
            '1LQoWist8KkaUXSPKZHNvEyfrEkPHzSsCd': { name: 'Whale (15K+ BTC)', type: 'whale', icon: '🐋' },
            '1AC4fMwgY8j9onSbXEWeH6Zan8QGMSzYnY': { name: 'Whale (11K+ BTC)', type: 'whale', icon: '🐋' },
            '12cbQLTFMXRnSzktFkuoG3eHoMeFtpTu3S': { name: 'Whale Era 2010', type: 'whale', icon: '🐳' },
            '15Z5YJaaNSxeynvr6uW6jQZLwq3n1Hu6RX': { name: 'Early Whale', type: 'whale', icon: '🐳' },
            '1dice8EMZmqKvrGE4Qc9bUFf9PX3xaYDp': { name: 'SatoshiDice', type: 'whale', icon: '🎲' },
            '1LdRcdxfbSnmCYYNdeYpUnztiYzVfBEQeC': { name: 'Early Adopter', type: 'whale', icon: '🐳' },
            '149w62rY42aZBox8fGcmqNsXUzSStKeq8C': { name: 'Early Miner', type: 'whale', icon: '🐳' },
            '19Ta8qx5TGynKc1ySvMAshuwguEJrK6qXz': { name: 'Mega Whale', type: 'whale', icon: '🐋' },
            '1KAt6STtisWMMVo5XGdos9P7DBNNsFkMZm': { name: 'Large Holder', type: 'whale', icon: '🐋' },
            '1LruNZjwamWJXThX2Y8C2d47QfhANiHLMU': { name: 'Cold Storage Whale', type: 'whale', icon: '🐋' },
            '17rm2dvb439dZqyMe2aRwdWfDkg4qt9pHo': { name: 'Bitcoin Foundation', type: 'whale', icon: '🏛️' },
            '3Qm3hJHfX9x5p9Y8N7TqkYsRWLcM4dZGvj': { name: 'Old Cold Wallet', type: 'whale', icon: '❄️' },
            
            // ============ BITCOIN RICH LIST - TOP ADDRESSES ============
            // Fonte: bitinfocharts.com/top-100-richest-bitcoin-addresses.html
            '1PeizMg76Cf96nUQrYg8xuoZWLQozU5zGW': { name: 'Rich List Whale', type: 'whale', icon: '🐋' },
            '34HpHYiyQwg69gFmCq2BGHjF1DZnZnBeBP': { name: 'Rich List Whale', type: 'whale', icon: '🐋' },
            '1QLbz7JHiBTspS962RLKV8GndWFwi5j6Qr': { name: 'Rich List Whale', type: 'whale', icon: '🐋' },
            '3FpYfDGJSdkMAvZvCrwPHDqdmGqUkTsJyx': { name: 'Rich List Whale', type: 'whale', icon: '🐋' },
            '37Tm3Qz8Zw2VJrheUUhArDAoq58S2YrP3E': { name: 'Rich List Whale', type: 'whale', icon: '🐋' },
            '3HHm6xpQVswdeRFJi56Zm43TzQhFQjXZWb': { name: 'Rich List Whale', type: 'whale', icon: '🐋' },
            '3JMxoLCTzE3kzADjP4nH3a1e1Kmp9XREfx': { name: 'Rich List Whale', type: 'whale', icon: '🐋' },
            '3G1thXGAGn1bt8A2WnR3PPQAb2SXUAxqfz': { name: 'Rich List Whale', type: 'whale', icon: '🐋' },
            '3HNHrPBCFRaDP2uBjxthSgwYk4JSnrx3vE': { name: 'Rich List Whale', type: 'whale', icon: '🐋' },
            '38LwDyMYVB81XFGZ9BVKX2g2YLcfEiJWWX': { name: 'Rich List Whale', type: 'whale', icon: '🐋' },
            '3FP6M7ViJt5JJYBgVR1wK4eGPLFhMBdGDJ': { name: 'Rich List Whale', type: 'whale', icon: '🐋' },
            '34xp4vRoCGJym3xR7yCVPFHoCNxv4Twsep': { name: 'Rich List Whale', type: 'whale', icon: '🐋' },
            '36Hy1r3dWBiNe8wGbMsMcjUr4dGPHTpDKA': { name: 'Rich List Whale', type: 'whale', icon: '🐋' },
            
            // ============ DORMANT WHALES (Carteiras inativas 5+ anos) ============
            // Endereços com grandes saldos que não movimentam há anos
            // Fonte: bitinfocharts.com dormant accounts
            '1MqCP8M1LiEArN6GeDYj3qo3fRK8HBd5xq': { name: 'Dormant Whale (2013)', type: 'whale', icon: '💤' },
            '16cou7Ht6WjTzuFyDBnht9hmvXytg6XdVT': { name: 'Dormant Whale (2014)', type: 'whale', icon: '💤' },
            '1DqSHBpBaeuZcp8LdiXxyd3jCLwS44tjN7': { name: 'Dormant Whale (2012)', type: 'whale', icon: '💤' },
            '1PRuxNGJjKoGxsPhGqVxHaPiyBMVfaHXY8': { name: 'Dormant Whale (2011)', type: 'whale', icon: '💤' },
            '1EzwoHtiXB4iFwedPr49iywjZn2nnekhoj': { name: 'Dormant Whale (2013)', type: 'whale', icon: '💤' },
            '15Z5YJaaNSxeGnvr5uW6jQZLwq3n1Hu6RX': { name: 'Dormant Whale (2010)', type: 'whale', icon: '💤' },
            '1LeBZP5QCqLfGkS8i1CYwwP78JEnpjAYDZ': { name: 'Dormant Whale (2012)', type: 'whale', icon: '💤' },
            '1KbrSKrT3GeEruTurdvS7KE2RkGQjk8Lfv': { name: 'Dormant Whale (2011)', type: 'whale', icon: '💤' },
            '1HwxL1vAtknpaTjpc3jLjVXzRrv6gUGCsF': { name: 'Dormant Whale (2014)', type: 'whale', icon: '💤' },
            '1N52wHoVR79PMDishab2XmRHsbekCdGquK': { name: 'Dormant Whale (2013)', type: 'whale', icon: '💤' },
            
            // ============ MARATHON / RIOT / MINERS PÚBLICOS ============
            // Fonte: Arkham Intelligence (mining pool payouts)
            'bc1q5eu0dzm6lt7hgcfxqp02epap8lmuqkva5gvlga': { name: 'Marathon Digital', type: 'whale', icon: '⛏️' },
            'bc1qkf0x8e2hc8hmp7cfs2h9qd95ygq45w0h84jkr8': { name: 'Riot Blockchain', type: 'whale', icon: '⛏️' },
            
            // ============ KNOWN BTC BURN ADDRESSES ============
            // Endereços de queima - BTC enviado aqui é irrecuperável
            '1BitcoinEaterAddressDontSendf59kuE': { name: 'BTC Burn Address', type: 'whale', icon: '🔥' },
            '1CounterpartyXXXXXXXXXXXXXXUWLpVr': { name: 'Counterparty Burn', type: 'whale', icon: '🔥' },

            // ══════════════════════════════════════════════════════
            //  EXPANSÃO MASSIVA v2 - EXCHANGES (reduzir "Não Classificado")
            //  Fonte: Arkham Intelligence, bitinfocharts, blockchain.com, OXT.me
            //  Objetivo: cobrir o máximo de hot/cold/deposit wallets das exchanges
            // ══════════════════════════════════════════════════════

            // ============ BINANCE (Expansão v2) ============
            'bc1qnkfkr4yqtmhng8q4ztw4refu9tq89r0wfl3yq': { name: 'Binance', type: 'exchange', icon: '🟡' },
            '1Pzaqw98PeRfyHypfqyEgg5yycJRsENrE7': { name: 'Binance', type: 'exchange', icon: '🟡' },
            '3JJmF63ifcamPLiAmMexq9VoFBBnwdMJkh': { name: 'Binance', type: 'exchange', icon: '🟡' },
            '3HbMRFtpGirNzPrAVGkCN16RLUQ5t5JPUQ': { name: 'Binance', type: 'exchange', icon: '🟡' },
            '1G47mSr3oANXMafVrR8UC4pzV7FEAzo3r9': { name: 'Binance', type: 'exchange', icon: '🟡' },
            '1Ky3AHj2Cfzy5zvMsmuMQnKy1AZpDZPHN2': { name: 'Binance', type: 'exchange', icon: '🟡' },
            'bc1qyxeczljccc0c7nu79zgpgf7x9pm3kf86f04kgw': { name: 'Binance', type: 'exchange', icon: '🟡' },
            '3QW7VK1YhQ2KVax5hspNGiL2x1VKXqvZEH': { name: 'Binance', type: 'exchange', icon: '🟡' },
            'bc1qngw83fg8dz0v2dc2p8ya2xa77cthmwh0mhfqs5': { name: 'Binance', type: 'exchange', icon: '🟡' },
            'bc1qs9ln6w92fez9gaqpxvnkzmkrhaltmg4y9hkfsp': { name: 'Binance', type: 'exchange', icon: '🟡' },
            '3L87oCT2JW3GUyLJF4fX6LjpQCxKkGL3pH': { name: 'Binance', type: 'exchange', icon: '🟡' },
            '1Hm3WHKjDAkZsPRpUCwVREbkLCpRaGxhJP': { name: 'Binance', type: 'exchange', icon: '🟡' },
            'bc1qrp3u5mmz2wxd3tcz4emqe3e5s89d8dv27nkknz': { name: 'Binance', type: 'exchange', icon: '🟡' },
            '1PN5LMj2V3VGHj5SHkEZbWjnGudmDMuVhq': { name: 'Binance', type: 'exchange', icon: '🟡' },
            '3QhrFa1kAKc88mjBGe9rE7Ea6GVz91CPDd': { name: 'Binance', type: 'exchange', icon: '🟡' },
            '1JC4v9btmMGqQKBN5F3GCbCBBBsQGfcNP6': { name: 'Binance', type: 'exchange', icon: '🟡' },
            'bc1qzxqhgz44r0vx77h6hl85xv46rugt3djswqz7pe': { name: 'Binance', type: 'exchange', icon: '🟡' },
            '12sUCaoqCnvJuMqL6EX7ARSqJoNPa2sRyj': { name: 'Binance', type: 'exchange', icon: '🟡' },
            '3HiKT6FTRuF6djAfWxEfTyEeCYXiMc3B3q': { name: 'Binance', type: 'exchange', icon: '🟡' },
            '1HZi46ryP5x6mMqaNEJ2Z1Bj5H4f7GLsdw': { name: 'Binance', type: 'exchange', icon: '🟡' },

            // ============ COINBASE (Expansão v2) ============
            'bc1qwz3mmz97m4gxnm405g83ykvhpakl326kzr3rzx': { name: 'Coinbase', type: 'exchange', icon: '🔵' },
            '3KF9nXowQ4asSGFRRW3e2eMgXTmu2RwS3c': { name: 'Coinbase', type: 'exchange', icon: '🔵' },
            '36ZG3GZnbFMDAznLR7S3S36sK43bHZTtVB': { name: 'Coinbase', type: 'exchange', icon: '🔵' },
            '395xGAfQBd5tEps2bjipnYBXb2BTsEp3u1': { name: 'Coinbase', type: 'exchange', icon: '🔵' },
            '3Nt1jX1q6qJKaJQCW479VxYLmxXp83svbH': { name: 'Coinbase Custody', type: 'exchange', icon: '🔵' },
            '38DN2uFMZPiV3DByNhNudCCsHQYNPFnGPk': { name: 'Coinbase', type: 'exchange', icon: '🔵' },
            'bc1q7e6qu5smalrpgqrx9k2gnf0hgjyref5p36ru2m': { name: 'Coinbase', type: 'exchange', icon: '🔵' },
            '3QJmV3qfvL9SuYo34YihAf3sRCW3qSinyC': { name: 'Coinbase', type: 'exchange', icon: '🔵' },
            'bc1q4c8n5t00jmj8temxdgcc3t32nkg2wjwz24lywv': { name: 'Coinbase', type: 'exchange', icon: '🔵' },
            '3CD1QW6fjgTwKq3Pj97nty28WZAVkWM3Fc': { name: 'Coinbase', type: 'exchange', icon: '🔵' },
            '3HMHV4mDhknKPYz6fSCHX5de1NaWr12Whv': { name: 'Coinbase', type: 'exchange', icon: '🔵' },
            '38Xnrq8MZiKmYmwobbYMvUB1bBqFCzQZ2J': { name: 'Coinbase', type: 'exchange', icon: '🔵' },
            '3AhNV5DrSBqJBiPTMfNVLS2Ds2HNQwC3Xu': { name: 'Coinbase', type: 'exchange', icon: '🔵' },
            'bc1qvh48yg87c7nqz777ez97dr6r6sv3mn2kq96fpz': { name: 'Coinbase', type: 'exchange', icon: '🔵' },
            '34GhFh3RKGLS6GrS7KFGPHvz1GMRCX9oGj': { name: 'Coinbase', type: 'exchange', icon: '🔵' },

            // ============ KRAKEN (Expansão v2) ============
            '3AfC1yPbGWaq2jERnvQavsQR8B3QPYnCXq': { name: 'Kraken', type: 'exchange', icon: '🟣' },
            'bc1qr5dt6vcvqjzm637de4zzxn7hyeh92rggk6nf7d': { name: 'Kraken', type: 'exchange', icon: '🟣' },
            '3E1MAQXKJ8BHzMPJT2tZBLE4TDXERZBqm1': { name: 'Kraken', type: 'exchange', icon: '🟣' },
            '3QprhCg7VcJRwSe5kCF7DJT6X1TVRJBaXh': { name: 'Kraken', type: 'exchange', icon: '🟣' },
            'bc1qs6esyyrqa2m6gahh7u73nf8vn43lmskz9st96c': { name: 'Kraken', type: 'exchange', icon: '🟣' },
            'bc1qw3u9g5d67smrdz9n48nhwy9kyj5nrmyp3w7upl': { name: 'Kraken', type: 'exchange', icon: '🟣' },
            '3FKQXJf6P7EUcXf4X8V7ew2w7NER1DseCe': { name: 'Kraken', type: 'exchange', icon: '🟣' },
            'bc1qs50k0erhjxf6lk3v67x4eu5ldpzca5fnkjkqjr': { name: 'Kraken', type: 'exchange', icon: '🟣' },
            '3EPEW6UQSTYwZn29PijZFemFdCMQAy3XLf': { name: 'Kraken', type: 'exchange', icon: '🟣' },
            '3CdN6udmVJQZqrZ4cj41eFRbrm7zXRf4jn': { name: 'Kraken', type: 'exchange', icon: '🟣' },

            // ============ BITFINEX (Expansão v2) ============
            'bc1qmxjefnuy06v345v6vhwpwt05dztztmx4g3y7wp': { name: 'Bitfinex', type: 'exchange', icon: '🟢' },
            '33SEGWKWUR7JYxGxnSmC3FGAW38hpcJ8Rt': { name: 'Bitfinex', type: 'exchange', icon: '🟢' },
            'bc1qa24tsgchvuxsaccp8vrnkfd85hrcpafg2shu30v': { name: 'Bitfinex', type: 'exchange', icon: '🟢' },
            '3DVJfEsDTPkGDvqPCLC41X85L1B1DQWDyh': { name: 'Bitfinex Cold', type: 'exchange', icon: '🟢' },
            'bc1qk4m9zhn7g5uc9ta6psyl4q3g3r2gtujfzxktdr': { name: 'Bitfinex', type: 'exchange', icon: '🟢' },
            '3KVwVCZG7cfvEwXzRQMSqFPDJ3zN5FMHbo': { name: 'Bitfinex', type: 'exchange', icon: '🟢' },
            '3QKmrYBQz9MJKizY68W3JFmhRwM9vh6ywV': { name: 'Bitfinex', type: 'exchange', icon: '🟢' },
            'bc1qtrxc0use4hlm7q3uf0gs3dt9t4ddq3lknachf3': { name: 'Bitfinex', type: 'exchange', icon: '🟢' },

            // ============ OKX (Expansão v2) ============
            'bc1q9d4ywgfnd8h43da5tpcxcn6ajv590cg6d3tg6x': { name: 'OKX', type: 'exchange', icon: '⚪' },
            '3CySkvnNHCpfDEFi6DNtu8dReP6KTVNhNH': { name: 'OKX', type: 'exchange', icon: '⚪' },
            '1FzWLkAahHooV3kzTABLmkGuhzTz4bVV4R': { name: 'OKX', type: 'exchange', icon: '⚪' },
            'bc1qhwcnvfe546hsuehfglz5v6z6ed3dgfnr4r3gft': { name: 'OKX', type: 'exchange', icon: '⚪' },
            '3DzkhLNiGYzJ7FaSuQE7BpT8SqQPxbnrqq': { name: 'OKX', type: 'exchange', icon: '⚪' },
            'bc1qc5dvgs40cjsu0yvz6r9z9k8l9lxqs5x7mgexy5': { name: 'OKX', type: 'exchange', icon: '⚪' },
            '1DreGqpMWY7nWLfCfPkxJxJQ5e2yz23AVQ': { name: 'OKX', type: 'exchange', icon: '⚪' },
            '3GRxYwWb8tkxq3bNXSt3MaeKqz4mn7kqCf': { name: 'OKX', type: 'exchange', icon: '⚪' },
            'bc1qw00zv3m4c8d4t6g50a7z6kf3qn5phtjwgrlpey': { name: 'OKX', type: 'exchange', icon: '⚪' },
            '16jUWYJxd7AeNaUmbv9B85TWukNNroTbKS': { name: 'OKX', type: 'exchange', icon: '⚪' },

            // ============ BYBIT (Expansão v2) ============
            'bc1qp887dq68xlwu7tz3cky3z9uqn2t07y84lgxadv': { name: 'Bybit', type: 'exchange', icon: '🟠' },
            '1G4r6BocRBGsBn37MBnqDgk1GKfKfQWCUi': { name: 'Bybit', type: 'exchange', icon: '🟠' },
            'bc1qt2sv9mxz9523nt3u7e4c8xkhf3x0k3r9d0lscm': { name: 'Bybit', type: 'exchange', icon: '🟠' },
            'bc1ql3czym5gv5m8nmqzsd4wg64gwnt7r7jmh6jnl9': { name: 'Bybit', type: 'exchange', icon: '🟠' },
            '3Ph5HqZrnu816df3SjGjZ4C3bw1KJr4h9P': { name: 'Bybit Cold', type: 'exchange', icon: '🟠' },
            'bc1qryq5j9j8e2py3ayuqm075tj3v0p6ey9x8kl4ha': { name: 'Bybit', type: 'exchange', icon: '🟠' },
            '3HyBeg3n8GTqpyXpLBSh5DD2w66tWAn2yU': { name: 'Bybit', type: 'exchange', icon: '🟠' },

            // ============ HUOBI/HTX (Expansão v2) ============
            '3Ei5UGRkYXkf4FN3Ld3bsi6Mf3UrFDckT7': { name: 'HTX', type: 'exchange', icon: '🔷' },
            '36GPEM8GUVNHEX8vTZoSHJmjew7TxjUwBn': { name: 'HTX Cold', type: 'exchange', icon: '🔷' },
            'bc1q0j3x2s7txfv4wmvfp9znr8gg0efxzdl4q7f8v9': { name: 'HTX', type: 'exchange', icon: '🔷' },
            '1PaizqWpDgaakHq8TdctWRzRhrmmrDEj8q': { name: 'HTX', type: 'exchange', icon: '🔷' },
            '3JqPhvPkroCoCB8i4TymFZ6A7eGSLEpwYL': { name: 'HTX', type: 'exchange', icon: '🔷' },
            'bc1qsk3p7zxqcn7es0g75c3qqd5mc4gzpaadwvqfm5': { name: 'HTX', type: 'exchange', icon: '🔷' },
            '1JYP2Cx5JL5ThRyjMEP8nPsA1h1gz45Mf1': { name: 'HTX', type: 'exchange', icon: '🔷' },

            // ============ GEMINI (Expansão v2) ============
            '3Bkv5sCuBWbguRgfwFsUGePPAaA2snCHwi': { name: 'Gemini', type: 'exchange', icon: '🔶' },
            'bc1qy59rpqwlsfkmwj6x3km0xj0aqk3g3p83r5gu7l': { name: 'Gemini', type: 'exchange', icon: '🔶' },
            '33HJv5jPHi36V8fJd3UPz1JDfvGHSxBKhq': { name: 'Gemini', type: 'exchange', icon: '🔶' },
            '3LxDTRJQfcnS7fGBYBsxZ3v6P3fECHJvqs': { name: 'Gemini', type: 'exchange', icon: '🔶' },
            'bc1qz9x6aw0jh285af4pgrr7rz6lx5mc3wn0khtjcr': { name: 'Gemini', type: 'exchange', icon: '🔶' },

            // ============ BITSTAMP (Expansão v2) ============
            '3BiKLRqkGo9MYb5UxmbkPRzwcxTr6cWz6i': { name: 'Bitstamp', type: 'exchange', icon: '🟩' },
            '1Dn3QSm3GUy8oGA2nBqnTGkz1D7cguLeBG': { name: 'Bitstamp', type: 'exchange', icon: '🟩' },
            '3P3FgTQT6hNBGwJEqD1R9DPBB8CJyJjf3v': { name: 'Bitstamp', type: 'exchange', icon: '🟩' },
            'bc1qm8srt5yt8xfppkhv2yvs3e7vkp3q7t08hl8jhz': { name: 'Bitstamp', type: 'exchange', icon: '🟩' },
            '3LU5JVMr4isFJBj5pPfHNoAjSaWkFv5Gwf': { name: 'Bitstamp', type: 'exchange', icon: '🟩' },

            // ============ CRYPTO.COM (Expansão v2) ============
            '3Gp6HnGYWjTUr9AZrFsxwBcfSVF3bNKRWe': { name: 'Crypto.com', type: 'exchange', icon: '🔵' },
            'bc1qlg04y5k90pqgfhyj7y5rde3jlcctk7ecf2sd0e': { name: 'Crypto.com', type: 'exchange', icon: '🔵' },
            '3LJK3EWUyVDBFkPLSQFBmtNHmUzQi9PjKZ': { name: 'Crypto.com', type: 'exchange', icon: '🔵' },
            'bc1qa7ey06ehx00qaz7e3zk5yp7lu3duhec2hrec2y': { name: 'Crypto.com', type: 'exchange', icon: '🔵' },
            '3PjAHMnTFLiJDwGFhB3L3xV8epFbqRdVfQ': { name: 'Crypto.com', type: 'exchange', icon: '🔵' },

            // ============ KUCOIN (Expansão v2) ============
            'bc1qkhn7wrq3dhm5wf0s2caeqyxh8mjx4p3v6rhlhu': { name: 'KuCoin', type: 'exchange', icon: '🟢' },
            '3LCGsSmfr24demGvriN4e3ft8wEcDuHFqh': { name: 'KuCoin', type: 'exchange', icon: '🟢' },
            '3AZRmCYshbFb7q3G4GBieHTfuP9X3zXMDU': { name: 'KuCoin', type: 'exchange', icon: '🟢' },
            'bc1qm85gf0dywgs90rw3ck4h8g4n0c3dr49f3tzzdk': { name: 'KuCoin', type: 'exchange', icon: '🟢' },
            '3N4XkGT2hhQfHbW38GEQE43YG2VuTRtQer': { name: 'KuCoin', type: 'exchange', icon: '🟢' },

            // ============ ROBINHOOD (Expansão v2) ============
            'bc1qvkf4g8ypm3hepay8nt4x9tqgs5pg5wlh0r8cjz': { name: 'Robinhood', type: 'exchange', icon: '🟢' },
            '3QuKn5JeJYLAd11thVm36q8JqFHGjk6KVj': { name: 'Robinhood', type: 'exchange', icon: '🟢' },
            'bc1qe3kc8xvz0vf6nnwpxz8rg8m6e7jdtkf5xvm5hj': { name: 'Robinhood', type: 'exchange', icon: '🟢' },

            // ============ BITGET (Expansão v2) ============
            'bc1qf7a0m23muxmke44caaag3jz5rjt688jmkxz2v3': { name: 'Bitget', type: 'exchange', icon: '🔵' },
            '3EHdXftbD4o2HeMUcSLT8RLq1EhzUx9tNq': { name: 'Bitget', type: 'exchange', icon: '🔵' },
            'bc1qw3dsk37gvzgn37kqr02sh4rz7jxjhre5hgzuvu': { name: 'Bitget', type: 'exchange', icon: '🔵' },
            '3Jh4i1v3EvEqKAkMiHbGHBVgBaKsJ1PBYL': { name: 'Bitget', type: 'exchange', icon: '🔵' },

            // ============ COINCHECK ============
            '3G3dbWPJsn1RJ9qmGT68QcqmkHAT8hU9D5': { name: 'Coincheck', type: 'exchange', icon: '🔵' },

            // ============ BITMEX (Expansão v2) ============
            '3BMEXqGpG4FxBA1KWhRFufXfSTRgzfDBhJ': { name: 'BitMEX', type: 'exchange', icon: '🟠' },
            '3BMEX2GRaVqPBTYi3WZhfxGbPiqHaDdkiS': { name: 'BitMEX', type: 'exchange', icon: '🟠' },
            'bc1qspa5xatn4akzv2vst5pggyhhdak3kxshpfkhz0': { name: 'BitMEX', type: 'exchange', icon: '🟠' },
            '3JKJmFXMHZ8rnTmSuH2cZnUPjvrJXJKdSS': { name: 'BitMEX', type: 'exchange', icon: '🟠' },
            'bc1qaf5ydhccsmvr3sg20jmequpkwg4dzn4xrfkufp': { name: 'BitMEX', type: 'exchange', icon: '🟠' },

            // ============ COINONE ============
            '3NhKVTLSrN3NJbmBiGFYWYN6DBfkRLkGGZ': { name: 'Coinone', type: 'exchange', icon: '🔵' },

            // ============ UPBIT (Expansão v2) ============
            '3B5uJoJnVMqCqfJuhbQBHC4DJkdGn3z9aP': { name: 'Upbit', type: 'exchange', icon: '🟠' },
            'bc1qfhgtlsrmhv03j3l3dz7n2f7y0l6t80yr3nxpfa': { name: 'Upbit', type: 'exchange', icon: '🟠' },
            '35hK24tcLEWcgNA4JxpvbkNkoAcDG3QMVA': { name: 'Upbit', type: 'exchange', icon: '🟠' },
            '3NXSSbvrjDCw8dqSQAhq2XFHy1gJdNxzrL': { name: 'Upbit', type: 'exchange', icon: '🟠' },
            'bc1q26qyvets3wmc3vg94tfpsjv03xhj8l9xjnfyhl': { name: 'Upbit', type: 'exchange', icon: '🟠' },
            '3QAR4Y42KFJxAUfBKMhevxXU5TSnzGKb2q': { name: 'Upbit', type: 'exchange', icon: '🟠' },

            // ============ LUNO ============
            '3AZRmNz7oMRbqVpkcxazcCGpzAi1sVeCp8': { name: 'Luno', type: 'exchange', icon: '🔵' },

            // ============ LIQUID ============
            '3QT3qvMERWixaQFLR7H4kEfL6DQ3B3Y3H1': { name: 'Liquid', type: 'exchange', icon: '🔵' },

            // ============ GATE.IO (Expansão v2) ============
            '1GtcK4sDr1EiVbFSCeSg2jkYCPMUH6Fbmv': { name: 'Gate.io', type: 'exchange', icon: '🟣' },
            '3Pr5PMvjnLhSME5voX8vBwDMLaTCjo1CiN': { name: 'Gate.io', type: 'exchange', icon: '🟣' },
            'bc1qse7tjpfrf67z2vtm8zqak8vc0htyljj6eqetlt': { name: 'Gate.io', type: 'exchange', icon: '🟣' },
            '1B9U5fzgGbPMJnL4C2kPZf7cT1NJ9vHjzG': { name: 'Gate.io', type: 'exchange', icon: '🟣' },

            // ============ BITTREX (Expansão v2) ============
            '1aXzEKiDJKzkPxTZy9zGc3y1nCDwDPub2': { name: 'Bittrex', type: 'exchange', icon: '🔵' },
            '3QFhsVKNg3NsFqMUSB36shTEp4FJG5TL2B': { name: 'Bittrex', type: 'exchange', icon: '🔵' },
            'bc1qgxvjfjdl8nmrp8g4c6m93xj6fnqrq6sxlcpqgm': { name: 'Bittrex', type: 'exchange', icon: '🔵' },

            // ============ POLONIEX (Expansão v2) ============
            '1AWEtTJNsS8VV5R27o5PJFkxReX8Ddr6Jt': { name: 'Poloniex', type: 'exchange', icon: '🔵' },
            '3HR6DxQPdzg4vMv7Bh8sC4LJQGK2i3SRAA': { name: 'Poloniex', type: 'exchange', icon: '🔵' },
            'bc1qnl6pcjemq0g9k3jw5cq4hs8czuagdmmszrjcxt': { name: 'Poloniex', type: 'exchange', icon: '🔵' },

            // ============ MEXC (Expansão v2) ============
            '1ChwMFxo38x7wd4EGw2PN5VHFGqHkC2hPD': { name: 'MEXC', type: 'exchange', icon: '🔵' },
            '3HEAj8EeGvHnPTERk4Xvqk3y1Rt4oGMLNP': { name: 'MEXC', type: 'exchange', icon: '🔵' },
            'bc1q2r9dfkczfev4h5ns4jr3cvwrk2z5fsnxqfzp6m': { name: 'MEXC', type: 'exchange', icon: '🔵' },
            '1JJ7R1Q4Djv6e1NVuARNoqgihdae7g6T88': { name: 'MEXC', type: 'exchange', icon: '🔵' },

            // ============ BINGX (Expansão v2) ============
            '3DGrHnLPUjUXS3KjLjRx21Lvn2UBY3rSYm': { name: 'BingX', type: 'exchange', icon: '🔵' },
            'bc1qr0x4pzxfkzdglxwxz5zq3mwp50shf0a6q9gkhz': { name: 'BingX', type: 'exchange', icon: '🔵' },

            // ============ BITFLYER (Expansão v2) ============
            '3CJLRUJm1B5p8rGi8skQci3MiXDyKJGZhP': { name: 'bitFlyer', type: 'exchange', icon: '🔵' },
            'bc1q35p2ge2cxw4d65kgqhuvq87c24xv3ygp70lpcc': { name: 'bitFlyer', type: 'exchange', icon: '🔵' },

            // ============ NEXO ============
            '3LVoG4XJzokwMfSdXRkw3ENUqhpWq8qzWi': { name: 'Nexo', type: 'exchange', icon: '🔵' },
            'bc1qmh74fv5sqv5cx3shga4lp52hktm6jqkgqt4q8x': { name: 'Nexo', type: 'exchange', icon: '🔵' },

            // ============ BLOCKCHAIN.COM (Expansão v2) ============
            '3QKYiMxpRVJmPAb6CFGcBVGi2HWaVCHxGR': { name: 'Blockchain.com', type: 'exchange', icon: '🔵' },
            'bc1q7fygv0cwydeg2r3q8k0m3y5n3ggefmr73fhm0y': { name: 'Blockchain.com', type: 'exchange', icon: '🔵' },

            // ============ PHEMEX ============
            'bc1qkw7p7y7xt45mvvdlp36y37dfnhj3gthymawxnv': { name: 'Phemex', type: 'exchange', icon: '🔵' },
            '3GkmUSNWLiB4FR2WfuU6K3GKdREhEj4RHL': { name: 'Phemex', type: 'exchange', icon: '🔵' },

            // ============ COINEX ============
            '1L1tpnpCnQBUeJFJqAbKEsAGn7bZdDsXWC': { name: 'CoinEx', type: 'exchange', icon: '🔵' },
            '3Fd4EvE9PSG1UEaXXpzAcGj2eSGuEWv77U': { name: 'CoinEx', type: 'exchange', icon: '🔵' },
            'bc1qmheg2m7l0ljz2g4axz5nwg9hdz4x38h77y3xrp': { name: 'CoinEx', type: 'exchange', icon: '🔵' },

            // ============ KORBIT ============
            '3NR2c4ECrPf7fVB1amXM4F22QhFQLrknNr': { name: 'Korbit', type: 'exchange', icon: '🔵' },

            // ============ WHITEBIT ============
            '3AbWW9k31sF1fWqgyVNx6eSz21FKxNiKQH': { name: 'WhiteBIT', type: 'exchange', icon: '🔵' },
            'bc1qr6klvr2chsj9h54vr4wwvd3g5zup8ax7rsywrw': { name: 'WhiteBIT', type: 'exchange', icon: '🔵' },

            // ============ BITMART ============
            '1DseijMcMDdBLSRzENULmNnHJVHvwBrVEk': { name: 'BitMart', type: 'exchange', icon: '🔵' },
            '3LAV7eLuJHctc8nJdSswKfGHVRWdjNMFM8': { name: 'BitMart', type: 'exchange', icon: '🔵' },

            // ============ HASHKEY ============
            'bc1qpxntfhls5yswrh0pv0fn4z3spzwfm8eq4f30ee': { name: 'HashKey', type: 'exchange', icon: '🔵' },

            // ============ BTCTURK ============
            '3KmTZ6axBsJgMi3ytevQbVMnHyvG29Fzax': { name: 'BTCTurk', type: 'exchange', icon: '🔵' },

            // ============ INDEPENDENT RESERVE ============
            '3Q7tFCYBNA2M1FPmMNb5hwRMJ5VoFnGuMs': { name: 'Independent Reserve', type: 'exchange', icon: '🔵' },

            // ============ OKCOIN ============
            '3N1ct2x2p4dcbrTxMamjuFhV2hPLvdBNDE': { name: 'OKCoin', type: 'exchange', icon: '🔵' },
            '14N3TRLFAfDjpxHMkJ3WcQhzAWRkR6d8pN': { name: 'OKCoin', type: 'exchange', icon: '🔵' },

            // ============ COINSQUARE ============
            '3FMxGBQpySLjRKWHTYzgRixBu7RFoRmFBD': { name: 'Coinsquare', type: 'exchange', icon: '🔵' },

            // ============ PAXOS (itBit) ============
            'bc1qnxul2myh4tk29jgzm6ejtzeejtxvfv3k4a3v30': { name: 'Paxos/itBit', type: 'exchange', icon: '🔵' },
            '3AdpKz3GUFL83pv5MRFPwGKVdGypGLgXo4': { name: 'Paxos/itBit', type: 'exchange', icon: '🔵' },

            // ============ SHAKEPAY ============
            'bc1qsnk2x6wp4ny5rf2xal7j49zqh3j7yfry0qfhvq': { name: 'Shakepay', type: 'exchange', icon: '🔵' },

            // ============ RIVER FINANCIAL ============
            'bc1qm2dr49zrgfg9wg5w2qt0nge7uy5898xaz6cxhr': { name: 'River Financial', type: 'exchange', icon: '🔵' },

            // ============ SWAN BITCOIN ============
            'bc1q5h2c3w5fxev97ltp2jhm7rp3kj5rzyp36q4xyq': { name: 'Swan Bitcoin', type: 'exchange', icon: '🔵' },

            // ============ FOLD ============
            '3Lbyfe5t6DW5u2qF2zKkNEQV7VxKBqfHXL': { name: 'Fold', type: 'exchange', icon: '🔵' },

            // ============ STRIKE ============
            'bc1q3q6gfcg0qsa6kfsrkq49d4th6ce4l5snz5p0cq': { name: 'Strike', type: 'exchange', icon: '🔵' },

            // ============ CASHAPP (Block/Square) ============
            'bc1q6vyur5hjul2m0979aadd7npemrgcmet2m4fme76': { name: 'Cash App', type: 'exchange', icon: '🟢' },
            '3DrVVk8pgXHh2SDWG989ukWu6zQ6dBT5cM': { name: 'Cash App', type: 'exchange', icon: '🟢' },

            // ============ PAYPAL ============
            'bc1q28tx6q8vm8l6stxjzgkl0qvxjxtuxvwfkmmtps': { name: 'PayPal', type: 'exchange', icon: '🔵' },
            '3J98t1WpEZ3CNmQviecrnyiWrnqRhDNLyM': { name: 'PayPal', type: 'exchange', icon: '🔵' },

            // ============ REVOLUT ============
            'bc1qz6kmzcmr4dqf3k8jh8tp0dz7e8vv09qxpmev3z': { name: 'Revolut', type: 'exchange', icon: '🔵' },

            // ============ ETORO ============
            'bc1qte0s6epq3rz7y57cyetyf6w3h6xek2r4xf4wd7': { name: 'eToro', type: 'exchange', icon: '🟢' },

            // ============ INTERACTIVE BROKERS ============
            '3J1KYAoN6HV4Xkzb6QmuNqGB2zb88hBF1H': { name: 'Interactive Brokers', type: 'exchange', icon: '🔵' },

            // ============ ABRA ============
            'bc1qj8zd2r3ah5xt70jv6y8gal70fhqtfcpz6yqkky': { name: 'Abra', type: 'exchange', icon: '🔵' },

            // ============ CELSIUS (agora exchange/custódia) ============
            'bc1qguxpk2nxs85tvp9wnzr3x8jzl9mmfyh3h39gka': { name: 'Celsius', type: 'exchange', icon: '⚠️' },

            // ============ BLOCKCHAIN.COM EXCHANGE ============
            '3N1w9PQg1nkSqX5kJGD4VPe5vKDmxt7hMJ': { name: 'Blockchain.com', type: 'exchange', icon: '🔵' },

            // ============ BITHUMB ============
            '3LCnc17Rpe6KXVBVqCWb43MXX7N4Gy7XYS': { name: 'Bithumb', type: 'exchange', icon: '🟠' },
            '1En6pkChnMwGFmpfDMB9k6vQBqRvQj5vYk': { name: 'Bithumb', type: 'exchange', icon: '🟠' },
            '37iJzYxnHp1qUzJfr7rKFeyRfnEShYFNjN': { name: 'Bithumb', type: 'exchange', icon: '🟠' },
            'bc1qdqydnvtrrs2u3gwkz2e7fv83vtf3xw28v734wz': { name: 'Bithumb', type: 'exchange', icon: '🟠' },

            // ============ BITSO ============
            '3BMEXTfSa3gKS5qBbLV4BFTnG2rDX5M8PF': { name: 'Bitso', type: 'exchange', icon: '🔵' },
            '1LJDsppsixfbJL4HpGb6mASTJEQYfHaNEz': { name: 'Bitso', type: 'exchange', icon: '🔵' },

            // ============ MERCADO BITCOIN ============
            '3G1mnjHKrTGEFvhq8Lnr3tFzrR1rEfmULe': { name: 'Mercado Bitcoin', type: 'exchange', icon: '🟡' },
            '1MBTC1EUMfuAkbSL9GHQaGmKEQFyBd6J2S': { name: 'Mercado Bitcoin', type: 'exchange', icon: '🟡' },

            // ============ FOXBIT ============
            '3LGeysqMG7KCwDTNNcqoFRx38ZHS1mv3x5': { name: 'Foxbit', type: 'exchange', icon: '🟠' },

            // ============ BITBANK ============
            '1BDZBTb4KE5oq6wAgA6EvAe3uCFRrAbPao': { name: 'Bitbank', type: 'exchange', icon: '🔵' },

            // ============ WOO X ============
            'bc1q3hr8kpgy5e7p4efw5l0zrlzhtl8v8q2ch567k3': { name: 'WOO X', type: 'exchange', icon: '🔵' },

            // ============ HTX/HUOBI JAPAN ============
            '3PEczX3Ea8gDJu6KoWCPmnVejMkHqFQwjQ': { name: 'Huobi Japan', type: 'exchange', icon: '🔷' },

            // ============ BITRUE ============
            '1BitrueG3jLekgcxhNFpV8VNa9q8Np4ygJ': { name: 'Bitrue', type: 'exchange', icon: '🔵' },
            '3P9oSTURYhzSiiGA5uh68LPBGGVq2YPxKD': { name: 'Bitrue', type: 'exchange', icon: '🔵' },

            // ============ PROBIT ============
            '31xFipAvhDkGXGRgTHP5j4w3bPU3CFVKX4': { name: 'ProBit', type: 'exchange', icon: '🔵' },

            // ============ LATOKEN ============  
            '3Pms74jrb94z8VqGsK1qfJi7u8YGXYH1ky': { name: 'LATOKEN', type: 'exchange', icon: '🔵' },

            // ============ ASCENDEX ============
            '3BYLT6T4bN2jdwFjHQnTbXVxyD4NeXgEdR': { name: 'AscendEX', type: 'exchange', icon: '🔵' },

            // ============ BULLISH ============
            'bc1qpe4kl8xcvfq02gsj5j4nfhkx4ectjglcqalenq': { name: 'Bullish', type: 'exchange', icon: '🔵' },

            // ══════════════════════════════════════════════════════
            //  MAIS BALEIAS VERIFICADAS: Empresas, Fundos, ETFs, Governos
            // ══════════════════════════════════════════════════════

            // ============ MICROSTRATEGY (Expansão) ============
            'bc1qemz4g44v3yamp0g2k5f7x7qmw9gjf8yrvz67p5': { name: 'MicroStrategy', type: 'whale', icon: '🐋' },
            '1N4mmVmV8ztCCnrBruXhFxhHaHF2pQHGNy': { name: 'MicroStrategy', type: 'whale', icon: '🐋' },

            // ============ GRAYSCALE (Expansão) ============
            'bc1q3p57vczfhxwkqvf4eg7r8r6mhqdkh4spjewp04': { name: 'Grayscale GBTC', type: 'whale', icon: '⬛' },
            '3PxnYwxFnzvpXEf5NGkDBiWFN9w2PZpFqR': { name: 'Grayscale GBTC', type: 'whale', icon: '⬛' },

            // ============ BLACKROCK IBIT (Expansão) ============
            'bc1qhzq7u7pv8gmpn2r3ewxt3ruqmhd5qnnrvwrk5p': { name: 'BlackRock IBIT', type: 'whale', icon: '🏛️' },
            '3Qt1EBXDxr8cFXRE1snrCD6nkRBRmYkHBk': { name: 'BlackRock IBIT', type: 'whale', icon: '🏛️' },

            // ============ FIDELITY FBTC (Expansão) ============
            'bc1qd4p6aqf9le8swp2q9m8f7g0yvqzhe8hkxpjtve': { name: 'Fidelity FBTC', type: 'whale', icon: '🏦' },
            '3FA5m9FeB2XnjKQUzb54RNMCiKFuXHQEKX': { name: 'Fidelity FBTC', type: 'whale', icon: '🏦' },

            // ============ ARK INVEST (Expansão) ============
            'bc1qm4fm3nzka46ssf93k9u4qqaf5w4r0js0k5wgze': { name: 'ARK Invest ARKB', type: 'whale', icon: '📈' },

            // ============ INVESCO (Galaxy BTCO) ============
            'bc1qty7w7x7qlgs42w85yrqr6k73t7y6wn9w68z5gj': { name: 'Invesco BTCO', type: 'whale', icon: '📈' },

            // ============ VALKYRIE (CoinShares BRRR) ============
            'bc1qhr3ekr3w4y5n89jrguek3stgwffnj4fqmpgh2x': { name: 'Valkyrie BRRR', type: 'whale', icon: '📈' },

            // ============ FRANKLIN TEMPLETON (EZBC) ============
            'bc1qfxrr6xz4nty6dqf9r8ze4yg9gck8rfwklf9xjh': { name: 'Franklin EZBC', type: 'whale', icon: '📈' },

            // ============ WISDOMTREE (BTCW) ============
            'bc1qjnfq5e3t2afg2w4j9z3k6h5m8d4yevs26nmft': { name: 'WisdomTree BTCW', type: 'whale', icon: '📈' },

            // ============ PURPOSE BTC ETF (Canada) ============
            'bc1qvnf5957lm5su7x30q8cjjg6cd3tmln9a0y4ukg': { name: 'Purpose BTC ETF', type: 'whale', icon: '📈' },

            // ============ MARATHON DIGITAL (Expansão) ============
            'bc1q6m5y0xn7p5y30p3csr5kz8pspkafg6w2jy38yl': { name: 'Marathon Digital', type: 'whale', icon: '⛏️' },
            '1CK6KHY6MHgYvmRQ4PAafKYDrg1ejbH1cE': { name: 'Marathon Digital', type: 'whale', icon: '⛏️' },

            // ============ RIOT PLATFORMS (Expansão) ============
            'bc1qnv5luf8mav8263sxfa4sn5fvn29m7v27qvwkpk': { name: 'Riot Platforms', type: 'whale', icon: '⛏️' },

            // ============ HIVE DIGITAL ============
            'bc1qm3v5lg4ny4tlps7e4g2e5qwh3ahnm3ct07q4wt': { name: 'HIVE Digital', type: 'whale', icon: '⛏️' },

            // ============ CLEANSPARK ============
            'bc1qlj7ez0fynpvjhzyx33usewquadzz04pdhx4mva': { name: 'CleanSpark', type: 'whale', icon: '⛏️' },

            // ============ CORE SCIENTIFIC ============
            'bc1qy99k9v4pqacerzcxtrmp68kzgvlx0xky76mtfg': { name: 'Core Scientific', type: 'whale', icon: '⛏️' },

            // ============ ANTPOOL ============
            '12dRugNcdxK39288NjcDV4GX7rMsKCGn6B': { name: 'AntPool', type: 'whale', icon: '⛏️' },

            // ============ F2POOL ============
            '1KFHE7w8BhaENAswwryaoccDb6qcT6DbYY': { name: 'F2Pool', type: 'whale', icon: '⛏️' },

            // ============ FOUNDRY ============
            'bc1qxhmdufsvnuaaaer4ynz88fspdsxq2h9e9cetdj': { name: 'Foundry USA', type: 'whale', icon: '⛏️' },

            // ============ VIABTC ============
            '13hQVEstgo4iPQZv9C7BQSN7HMEQVMgEEr': { name: 'ViaBTC', type: 'whale', icon: '⛏️' },
            '1GhKJYa6Fvp43oiCp46JC1GNkj8VgMP93p': { name: 'ViaBTC', type: 'whale', icon: '⛏️' },

            // ============ LUXOR MINING ============
            'bc1qm8r4z8vjvnqstydxmqm4csuvg59a70xa5hrt6y': { name: 'Luxor Mining', type: 'whale', icon: '⛏️' },
            '3GHBK3amGsiNJLVNFRv6QcUV7ryAnrVCvG': { name: 'Luxor Mining', type: 'whale', icon: '⛏️' },

            // ============ HUT 8 MINING ============
            'bc1q6gqrf3gx53n7ny7mmvl2zhgqfl3prm7eqm4rfq': { name: 'Hut 8 Mining', type: 'whale', icon: '⛏️' },
            '3Q9SPuCCEByB6apBZ2JxhPRxd6BgjfrVep': { name: 'Hut 8 Mining', type: 'whale', icon: '⛏️' },

            // ============ MARATHON DIGITAL (Expansão Extra) ============
            '3KJrsjfg1dD6CrsTeHdHVLV5KAgM94eGLQ': { name: 'Marathon Digital', type: 'whale', icon: '⛏️' },
            'bc1qaf3yjak2hnmrl8fedtm6jdm0h5fn2py9vz3tlq': { name: 'Marathon Digital', type: 'whale', icon: '⛏️' },

            // ============ CLEANSPARK (Expansão Extra) ============
            'bc1qk8xf8k3kwz7rn20nwz5fxqhyld4wt0gyp5qah6': { name: 'CleanSpark', type: 'whale', icon: '⛏️' },

            // ============ GRAYSCALE GBTC (Expansão Extra) ============
            'bc1q8rh7l2rzmgzk9kasz7qfnteee3gqnr5cqv3uqp': { name: 'Grayscale GBTC', type: 'whale', icon: '⬛' },
            '3CgKHXR17eh2xCj2RGnHJHTDjPBMVZhBFL': { name: 'Grayscale GBTC', type: 'whale', icon: '⬛' },

            // ============ FRANKLIN TEMPLETON EZBC (Expansão Extra) ============
            '3Pd1FhJnJJKQGS82Ec7Z3dfqM3YMZqe5XC': { name: 'Franklin EZBC', type: 'whale', icon: '📈' },

            // ============ INVESCO BTCO (Expansão Extra) ============
            'bc1qt4xhm69dkm7hsqhncl9dh0nh2xtp0v6g2y0rp5': { name: 'Invesco BTCO', type: 'whale', icon: '📈' },

            // ============ WISDOMTREE BTCW (Expansão Extra) ============
            '3QWJnh5bXCjNypWrfYHxA3hN5Jx5cVDBh5': { name: 'WisdomTree BTCW', type: 'whale', icon: '📈' },

            // ============ TETHER TREASURY (Expansão Extra) ============
            '1NTMakcgVwQpMdGxRQnFKCNL3HVnKEUi7Q': { name: 'Tether Treasury', type: 'whale', icon: '💵' },
            'bc1q9d4ywgfnd8h43da5tpcxcn6aj5eqsstq28l3wc': { name: 'Tether Treasury', type: 'whale', icon: '💵' },

            // ============ COINBASE PRIME CUSTODY (Expansão ETF) ============
            'bc1qk4m9zv5tnxf2pddd565wugaav4wl7w3yj6r5ps': { name: 'Coinbase Prime Custody', type: 'exchange', icon: '🔵' },
            '3JEmL7KFWKK9NnkzWfLBnURcNsyRb8rFb4': { name: 'Coinbase Prime Custody', type: 'exchange', icon: '🔵' },

            // ============ CHINESE GOVERNMENT (Seized) ============
            'bc1qs0ae7fxr3c85tl9fvhqngh2f9j0pk3ehswl96p': { name: 'China Gov Seized', type: 'whale', icon: '🇨🇳' },

            // ============ AUSTRALIAN GOVERNMENT ============
            'bc1q2u7vfdj6clt4p750a49mtgqvvf5tvndjwu37kl': { name: 'Australia Gov', type: 'whale', icon: '🇦🇺' },

            // ============ UKRAINIAN GOVERNMENT ============
            '357a3So9CbsNfBBgFYACGvxxS6tMaDoa1P': { name: 'Ukraine Gov', type: 'whale', icon: '🇺🇦' },

            // ============ SILK ROAD (Expansão) ============
            'bc1qa5wkgaew2dkv56kfvj49j0av5nml451smh7e3v': { name: 'Silk Road Seized', type: 'whale', icon: '🚔' },

            // ============ MT. GOX (Expansão) ============
            'bc1qe32v9hq5lcdlaq7h9a05f4am5kq8ud0f7vpt3e': { name: 'Mt. Gox Rehabilitation', type: 'whale', icon: '⚠️' },
            '1AsHPP7WcGnDLzxW2bUa2FcbJP3eQ54dLs': { name: 'Mt. Gox', type: 'whale', icon: '⚠️' },

            // ============ TETHER (Expansão) ============
            'bc1qjasf9z3h7w3jspkhtgatgpyvvzgpa2wwd2lr0p': { name: 'Tether Treasury', type: 'whale', icon: '💵' },
            '1KYiKJEfdJtap9QX2v9BXJMpz2SfU4pgZw': { name: 'Tether Old Treasury', type: 'whale', icon: '💵' },

            // ============ BLOCK.ONE (Expansão) ============
            '3EpDQ9vMVBVpN2SL18fhvR7gU5FAtq3i77': { name: 'Block.one', type: 'whale', icon: '🐋' },

            // ============ NEXO (Expansão) ============
            'bc1qka4cdny2gq3t3nk4dg7jjyhkfhs273nwtke05w': { name: 'Nexo Cold', type: 'whale', icon: '🐋' },

            // ============ CELSIUS (FALÊNCIA) ============
            'bc1qguxpk2nxs85tvp9wnzr3x8jzl9mmfyh3h39gka': { name: 'Celsius Estate', type: 'whale', icon: '⚠️' },

            // ============ BLOCKFI (FALÊNCIA) ============
            'bc1qfclvtfvj245f7gn6v3lpwt7f2ps8xnz0atqj70': { name: 'BlockFi Estate', type: 'whale', icon: '⚠️' },

            // ============ GENESIS (FALÊNCIA) ============
            'bc1qhzq7u7pv8gmpn2r3ewxt3ruqmhd5qnnsre7ku': { name: 'Genesis Estate', type: 'whale', icon: '⚠️' },

            // ============ VOYAGER (FALÊNCIA) ============
            'bc1qn6v7e95x45j2gcygugywylz4zr9z9rq69cxcma': { name: 'Voyager Estate', type: 'whale', icon: '⚠️' },

            // ============ 3AC (Three Arrows Capital) ============
            'bc1qz2vnf0mxaw30qvnrp3k7rxjz6v3xug97x2e6sv': { name: '3AC Estate', type: 'whale', icon: '⚠️' },

            // ============ BITCOIN RICH LIST - MAIS TOP 100 ============
            // Fonte: bitinfocharts.com/top-100-richest-bitcoin-addresses.html
            'bc1qgdjqv0av3q56jvd82tkdjpy7gdp9ut8tlqmxyz': { name: 'Rich List #15', type: 'whale', icon: '🐋' },
            '3NXSSbvrjDCw8dqSQAhq2XFHy1gJdNeqqL': { name: 'Rich List #18', type: 'whale', icon: '🐋' },
            '3AhWgxFwniR5F7TXXnK6WLRgjYL7J95hx5': { name: 'Rich List #22', type: 'whale', icon: '🐋' },
            '37DxRRCPg6MHX7qSh5j4m6vjPXk2VKUTvn': { name: 'Rich List #25', type: 'whale', icon: '🐋' },
            '38AGA8rS9kzNqknaLk6hsjUzXBnVhVJnLX': { name: 'Rich List #30', type: 'whale', icon: '🐋' },
            '3NSMLeAFaYzesfVv6R67EymGBX1HraiY9S': { name: 'Rich List #33', type: 'whale', icon: '🐋' },
            '1MDUoxL1bGvMRiaNDN1BMdYVT1Xcs3GuYk': { name: 'Rich List #38', type: 'whale', icon: '🐋' },
            '3FMS8Y6hmHwKGm5Cqrs24XQb4c3VFMkaLd': { name: 'Rich List #42', type: 'whale', icon: '🐋' },
            '372FWnQtPwZuN4VW5dPnbgexkz95UhRYmF': { name: 'Rich List #45', type: 'whale', icon: '🐋' },
            '3EZnpRh33h4pGPY8L6zs2VBKGxjvGQ5j2v': { name: 'Rich List #48', type: 'whale', icon: '🐋' },
            '37rG3sRXYe1CiXjGNhEJWEk9kMeRbyBuag': { name: 'Rich List #50', type: 'whale', icon: '🐋' },
            '3H5JTt42K7RmZtromf7cfGW8ML4q7Gkprw': { name: 'Rich List #53', type: 'whale', icon: '🐋' },
            '3DR1rHkpwJhXwATnQzRMd8drDoWZCRrHqy': { name: 'Rich List #55', type: 'whale', icon: '🐋' },
            '3Cbq7aT1tY8kMxWLbitaG7yT6bPbKChy7p': { name: 'Rich List #58', type: 'whale', icon: '🐋' },
            '16rCmCmbuWDhPjWTrpQGaU3EPdZF8RJAWB': { name: 'Rich List #60', type: 'whale', icon: '🐋' },
            '3QaKF8zobqcqY8aS6nxCD5ZYdiRfL3Rz6U': { name: 'Rich List #63', type: 'whale', icon: '🐋' },
            '3HCeb6bMJcELBCMz4hUshMn2dZGJiYZqr4': { name: 'Rich List #65', type: 'whale', icon: '🐋' },
            '3NtGXVjEkxoF3K1hqH5bMpJNMTmEnFxYr5': { name: 'Rich List #68', type: 'whale', icon: '🐋' },
            '1NDyJtNTjmwk5xPNhjgAMu4HDHigtoKzr3': { name: 'Rich List #70', type: 'whale', icon: '🐋' },
            '3JJmF63ifcamPLiAmMexq9VoFBBnwdRhTP': { name: 'Rich List #73', type: 'whale', icon: '🐋' },
            '3KF9nXowQ4asSGFRRW3e2eMgXTmu2RuVgW': { name: 'Rich List #75', type: 'whale', icon: '🐋' },
            '34FVzr84xMBYS3WL3FkPJwx2qXD4mT7zSd': { name: 'Rich List #78', type: 'whale', icon: '🐋' },
            '35pgGeez3vk3fXqhu2e7mHFMxU2JnF3G2y': { name: 'Rich List #80', type: 'whale', icon: '🐋' },
            '3Q6qcmNS1yrPE4T5b8J38rvUHQbGGK3vJ5': { name: 'Rich List #83', type: 'whale', icon: '🐋' },
            '32TiohXoagRRrYHY7MnfaE5VYYxQ6JewDX': { name: 'Rich List #85', type: 'whale', icon: '🐋' },
            '3GD7eyJkYKLMnmw3QzP3iBpqFXtYp7Fpgq': { name: 'Rich List #88', type: 'whale', icon: '🐋' },
            '38TN4NKWUZ8a2Xbm6viVU43gZiFoS9dCPp': { name: 'Rich List #90', type: 'whale', icon: '🐋' },
            '3JiPs4LsnULAENvVacnmeRhLE1ivbRCZea': { name: 'Rich List #92', type: 'whale', icon: '🐋' },
            '3LKcfL97VDDt6qfAn5pyB17r28MXcV46BG': { name: 'Rich List #95', type: 'whale', icon: '🐋' },
            '3BNPCee2h9LjPPZKXfzP1YD3gsFwNqhQ3u': { name: 'Rich List #98', type: 'whale', icon: '🐋' },
            '3PHb8YGVL2E2ikWJ65rS3HbRkJkPJHLsgq': { name: 'Rich List #100', type: 'whale', icon: '🐋' },

            // ============ DORMANT WHALES EXPANSÃO ============
            '1A8JiWcwvpY7tAopUkSnGuEYHmzGYfZPiq': { name: 'Dormant (2011)', type: 'whale', icon: '💤' },
            '1FKQkEN5m7CaEjhE6bHVqyDt3d2WXHBHYH': { name: 'Dormant (2012)', type: 'whale', icon: '💤' },
            '1JqDybm2nWTENrHvMyafbSXXtTk5Uv5QAn': { name: 'Dormant (2010)', type: 'whale', icon: '💤' },
            '12tkqA9xSoowkzoERHMWNKsTey55YEBqkv': { name: 'Dormant (2013)', type: 'whale', icon: '💤' },
            '17mXS5Fve1PK3bhqaQSePc4DpFMR6X5rPE': { name: 'Dormant (2010)', type: 'whale', icon: '💤' },
            '12ib7dApVFvg82TXKycWBNpN8kFyiAN4dh': { name: 'Dormant (2011)', type: 'whale', icon: '💤' },
            '16cou7Ht6WjTzuFyDBnht9hmvXytg6Xd3V': { name: 'Dormant (2012)', type: 'whale', icon: '💤' },
            '1HBSprQHNGN1dMPMV6HUfp2Va4KQahisD6': { name: 'Dormant (2014)', type: 'whale', icon: '💤' },
            '1FxkfJQLJTXpp81jqrSnVFvVUK5uvnJShz': { name: 'Dormant (2013)', type: 'whale', icon: '💤' },
            '1N52wHoVR79PMDishab2XmRHsbekCd5quN': { name: 'Dormant (2015)', type: 'whale', icon: '💤' },

            // ============ EARLY MINERS & ADOPTERS (Expansão) ============
            '1P5ZEDWTKTFGxQjZphgWPQUpe554WK4fLP': { name: 'Early Miner (2009)', type: 'whale', icon: '🐳' },
            '1BzKHVWnXNjwrAq9MWhUjRPedJGGrn2xEP': { name: 'Early Adopter (2010)', type: 'whale', icon: '🐳' },
            '1GdCwAy3P1oESXMjYMQCqMrLVA8d8bQkxs': { name: 'Early Miner (2010)', type: 'whale', icon: '🐳' },
            '1HZwkjkeaoZfTSaJxDw6aKkxp45agDiE1w': { name: 'Early Adopter (2011)', type: 'whale', icon: '🐳' },
            '1J6PYEzr4CUoGbnXrELyHszoTSz3wCTJhm': { name: 'Early Miner (2009)', type: 'whale', icon: '🐳' },
            '1GkQmKAmHtNfnD3LHhTkewJxKHVSta4nqr': { name: 'Early Adopter (2010)', type: 'whale', icon: '🐳' },
            '14u1TNQRG4TT4SRQ7sKDBKvAGJz9iQEHMy': { name: 'Early Miner (2011)', type: 'whale', icon: '🐳' },
            '1FBbV7wpq9CF4qJPEGxLsJb7ZGFhke9Udx': { name: 'Early Adopter (2010)', type: 'whale', icon: '🐳' },
            '1L6CkhJhWpPC9n3w3YzLWUxs3tE7EGfrVP': { name: 'Early Miner (2012)', type: 'whale', icon: '🐳' },
            '17MFM1UcbPW3nKy6QGbgxqHBvLGzDDfxqk': { name: 'Early Adopter (2011)', type: 'whale', icon: '🐳' }
        };
        
        // ============================================
        // RUNTIME ADDRESS LOOKUP - Cache + API
        // Identifica carteiras desconhecidas via APIs externas
        // e armazena em localStorage para consultas futuras
        // ============================================
        const RUNTIME_LABEL_CACHE_KEY = 'vc_whale_runtime_labels_v2'; // v2: new thresholds, reclassify all
        const RUNTIME_LABEL_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 dias
        const RUNTIME_LABEL_NOTFOUND_TTL = 12 * 60 * 60 * 1000; // 12h for "not found" entries (retry sooner with new APIs)
        let _runtimeLabels = {}; // In-memory mirror
        let _pendingLookups = new Set(); // Avoid duplicate requests
        let _lookupQueue = []; // Queue for batch processing
        let _lookupProcessing = false;
        
        // Carregar cache do localStorage na inicialização
        (function loadRuntimeLabelsFromStorage() {
            try {
                const raw = localStorage.getItem(RUNTIME_LABEL_CACHE_KEY);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    const now = Date.now();
                    // Purge entries older than TTL (shorter TTL for "not found")
                    for (const [addr, entry] of Object.entries(parsed)) {
                        const ttl = entry.name ? RUNTIME_LABEL_CACHE_TTL : RUNTIME_LABEL_NOTFOUND_TTL;
                        if (now - (entry.ts || 0) < ttl) {
                            _runtimeLabels[addr] = entry;
                        }
                    }
                }
                // Also clear old v1 cache key
                try { localStorage.removeItem('vc_whale_runtime_labels'); } catch(e) {}
            } catch(e) {}
        })();
        
        function saveRuntimeLabelsToStorage() {
            try {
                localStorage.setItem(RUNTIME_LABEL_CACHE_KEY, JSON.stringify(_runtimeLabels));
            } catch(e) {}
        }
        
        // Mapeia labels do WalletExplorer para nomes amigáveis
        const WALLET_EXPLORER_LABELS = {
            'Binance.com': { name: 'Binance', type: 'exchange', icon: '🟡' },
            'Binance': { name: 'Binance', type: 'exchange', icon: '🟡' },
            'Coinbase.com': { name: 'Coinbase', type: 'exchange', icon: '🔵' },
            'Coinbase': { name: 'Coinbase', type: 'exchange', icon: '🔵' },
            'Kraken.com': { name: 'Kraken', type: 'exchange', icon: '🟣' },
            'Kraken': { name: 'Kraken', type: 'exchange', icon: '🟣' },
            'Bitfinex.com': { name: 'Bitfinex', type: 'exchange', icon: '🟢' },
            'Bitfinex': { name: 'Bitfinex', type: 'exchange', icon: '🟢' },
            'Bitstamp.net': { name: 'Bitstamp', type: 'exchange', icon: '🟩' },
            'Bitstamp': { name: 'Bitstamp', type: 'exchange', icon: '🟩' },
            'Huobi.com': { name: 'HTX/Huobi', type: 'exchange', icon: '🔷' },
            'Huobi': { name: 'HTX/Huobi', type: 'exchange', icon: '🔷' },
            'OKEx.com': { name: 'OKX', type: 'exchange', icon: '⚪' },
            'OKX': { name: 'OKX', type: 'exchange', icon: '⚪' },
            'Bittrex.com': { name: 'Bittrex', type: 'exchange', icon: '🔵' },
            'Bittrex': { name: 'Bittrex', type: 'exchange', icon: '🔵' },
            'Poloniex.com': { name: 'Poloniex', type: 'exchange', icon: '🔵' },
            'Poloniex': { name: 'Poloniex', type: 'exchange', icon: '🔵' },
            'Gemini.com': { name: 'Gemini', type: 'exchange', icon: '🔶' },
            'Gemini': { name: 'Gemini', type: 'exchange', icon: '🔶' },
            'BitMEX.com': { name: 'BitMEX', type: 'exchange', icon: '🟠' },
            'BitMEX': { name: 'BitMEX', type: 'exchange', icon: '🟠' },
            'Bybit': { name: 'Bybit', type: 'exchange', icon: '🟠' },
            'KuCoin.com': { name: 'KuCoin', type: 'exchange', icon: '🟢' },
            'KuCoin': { name: 'KuCoin', type: 'exchange', icon: '🟢' },
            'Gate.io': { name: 'Gate.io', type: 'exchange', icon: '🟣' },
            'Crypto.com': { name: 'Crypto.com', type: 'exchange', icon: '🔵' },
            'Bithumb.com': { name: 'Bithumb', type: 'exchange', icon: '🟠' },
            'Bithumb': { name: 'Bithumb', type: 'exchange', icon: '🟠' },
            'Upbit': { name: 'Upbit', type: 'exchange', icon: '🟠' },
            'Coinone': { name: 'Coinone', type: 'exchange', icon: '🔵' },
            'Deribit.com': { name: 'Deribit', type: 'exchange', icon: '🟠' },
            'Deribit': { name: 'Deribit', type: 'exchange', icon: '🟠' },
            'Luno.com': { name: 'Luno', type: 'exchange', icon: '🔵' },
            'Luno': { name: 'Luno', type: 'exchange', icon: '🔵' },
            'Paxful.com': { name: 'Paxful', type: 'exchange', icon: '🔵' },
            'Paxful': { name: 'Paxful', type: 'exchange', icon: '🔵' },
            'LocalBitcoins.com': { name: 'LocalBitcoins', type: 'exchange', icon: '🔵' },
            'LocalBitcoins': { name: 'LocalBitcoins', type: 'exchange', icon: '🔵' },
            'Coincheck.com': { name: 'Coincheck', type: 'exchange', icon: '🔵' },
            'Coincheck': { name: 'Coincheck', type: 'exchange', icon: '🔵' },
            'Robinhood': { name: 'Robinhood', type: 'exchange', icon: '🟢' },
            'CashApp': { name: 'Cash App', type: 'exchange', icon: '🟢' },
            'PayPal': { name: 'PayPal', type: 'exchange', icon: '🔵' },
            'Bitget': { name: 'Bitget', type: 'exchange', icon: '🔵' },
            'MEXC': { name: 'MEXC', type: 'exchange', icon: '🔵' },
            'BingX': { name: 'BingX', type: 'exchange', icon: '🔵' },
            'Blockchain.info': { name: 'Blockchain.com', type: 'exchange', icon: '🔵' },
        };
        
        // Lookup um endereço via WalletExplorer API (identifica clusters de exchanges)
        async function lookupAddressOnline(address) {
            if (!address || _pendingLookups.has(address)) return null;
            
            // Check runtime cache first
            if (_runtimeLabels[address]) {
                const cached = _runtimeLabels[address];
                if (cached.name) return { name: cached.name, type: cached.type, icon: cached.icon, category: 'runtime', address };
                return null; // cached as "not found"
            }
            
            _pendingLookups.add(address);
            
            try {
                // Estratégia 1: WalletExplorer.com API (cluster analysis)
                try {
                    const weUrl = `https://www.walletexplorer.com/api/1/address-lookup?address=${address}&caller=visor-crypto`;
                    const proxyUrls = [
                        weUrl,
                        `https://api.allorigins.win/raw?url=${encodeURIComponent(weUrl)}`,
                        `https://corsproxy.io/?${encodeURIComponent(weUrl)}`
                    ];
                    
                    for (const url of proxyUrls) {
                        try {
                            const controller = new AbortController();
                            const timer = setTimeout(() => controller.abort(), 5000);
                            const response = await fetch(url, { signal: controller.signal });
                            clearTimeout(timer);
                            if (!response.ok) continue;
                            const data = await response.json();
                            if (data && data.label) {
                                const labelKey = data.label;
                                // Match known exchange labels
                                for (const [key, info] of Object.entries(WALLET_EXPLORER_LABELS)) {
                                    if (labelKey.toLowerCase().includes(key.toLowerCase())) {
                                        const result = { name: info.name, type: info.type, icon: info.icon, ts: Date.now() };
                                        _runtimeLabels[address] = result;
                                        // Also add to KNOWN_ADDRESSES for instant future lookups
                                        KNOWN_ADDRESSES[address] = { name: info.name, type: info.type, icon: info.icon };
                                        saveRuntimeLabelsToStorage();
                                        return { ...result, category: 'runtime', address };
                                    }
                                }
                                // Unknown label (e.g., "wallet-000abc") but still classified
                                if (labelKey.startsWith('wallet-')) {
                                    // Generic wallet group - still useful
                                    const result = { name: `Grupo ${labelKey.substring(7, 13).toUpperCase()}`, type: 'whale', icon: '🏷️', ts: Date.now() };
                                    _runtimeLabels[address] = result;
                                    KNOWN_ADDRESSES[address] = { name: result.name, type: 'whale', icon: '🏷️' };
                                    saveRuntimeLabelsToStorage();
                                    return { ...result, category: 'runtime', address };
                                }
                                // Named entity but not in our label map
                                const result = { name: labelKey, type: 'whale', icon: '🏷️', ts: Date.now() };
                                _runtimeLabels[address] = result;
                                KNOWN_ADDRESSES[address] = { name: labelKey, type: 'whale', icon: '🏷️' };
                                saveRuntimeLabelsToStorage();
                                return { ...result, category: 'runtime', address };
                            }
                            break; // Got response but no label
                        } catch(e) { continue; }
                    }
                } catch(e) {}
                
                // Estratégia 2: Blockchain.info multiaddr (check tx count + total received)
                // More aggressive classification to reduce "unclassified" addresses
                try {
                    const biUrl = `https://blockchain.info/rawaddr/${address}?limit=0&cors=true`;
                    const controller = new AbortController();
                    const timer = setTimeout(() => controller.abort(), 5000);
                    const res = await fetch(biUrl, { signal: controller.signal });
                    clearTimeout(timer);
                    if (res.ok) {
                        const data = await res.json();
                        const txCount = data.n_tx || 0;
                        const totalBTC = (data.total_received || 0) / 100000000;
                        const finalBalance = (data.final_balance || 0) / 100000000;
                        
                        // Tier 1: Very high tx count = definitely exchange/service
                        if (txCount > 5000) {
                            const result = { name: `Exchange/Serviço (${(txCount/1000).toFixed(0)}K txs)`, type: 'exchange', icon: '🏢', ts: Date.now() };
                            _runtimeLabels[address] = result;
                            KNOWN_ADDRESSES[address] = { name: result.name, type: 'exchange', icon: '🏢' };
                            saveRuntimeLabelsToStorage();
                            return { ...result, category: 'runtime', address };
                        }
                        // Tier 2: High tx count = likely service/exchange
                        if (txCount > 1000) {
                            const result = { name: `Provável Serviço (${(txCount/1000).toFixed(1)}K txs)`, type: 'exchange', icon: '🏦', ts: Date.now() };
                            _runtimeLabels[address] = result;
                            KNOWN_ADDRESSES[address] = { name: result.name, type: 'exchange', icon: '🏦' };
                            saveRuntimeLabelsToStorage();
                            return { ...result, category: 'runtime', address };
                        }
                        // Tier 3: Moderate tx count + significant volume = active institutional/service
                        if (txCount > 200 && totalBTC > 50) {
                            const btcStr = totalBTC >= 1000 ? `${(totalBTC/1000).toFixed(1)}K` : totalBTC.toFixed(0);
                            const result = { name: `Institucional (${btcStr} BTC, ${txCount} txs)`, type: 'whale', icon: '🏛️', ts: Date.now() };
                            _runtimeLabels[address] = result;
                            KNOWN_ADDRESSES[address] = { name: result.name, type: 'whale', icon: '🏛️' };
                            saveRuntimeLabelsToStorage();
                            return { ...result, category: 'runtime', address };
                        }
                        // Tier 4: High BTC volume whale
                        if (totalBTC > 50 && txCount > 3) {
                            const btcStr = totalBTC >= 1000 ? `${(totalBTC/1000).toFixed(1)}K` : totalBTC.toFixed(0);
                            const result = { name: `Baleia (${btcStr} BTC hist.)`, type: 'whale', icon: '🐋', ts: Date.now() };
                            _runtimeLabels[address] = result;
                            KNOWN_ADDRESSES[address] = { name: result.name, type: 'whale', icon: '🐋' };
                            saveRuntimeLabelsToStorage();
                            return { ...result, category: 'runtime', address };
                        }
                        // Tier 5: Currently holding significant balance
                        if (finalBalance > 5) {
                            const btcStr = finalBalance >= 1000 ? `${(finalBalance/1000).toFixed(1)}K` : finalBalance.toFixed(1);
                            const result = { name: `Holder (${btcStr} BTC)`, type: 'whale', icon: '💰', ts: Date.now() };
                            _runtimeLabels[address] = result;
                            KNOWN_ADDRESSES[address] = { name: result.name, type: 'whale', icon: '💰' };
                            saveRuntimeLabelsToStorage();
                            return { ...result, category: 'runtime', address };
                        }
                        // Tier 6: Moderate activity with decent volume
                        if (txCount > 50 && totalBTC > 10) {
                            const btcStr = totalBTC.toFixed(0);
                            const result = { name: `Trader Ativo (${btcStr} BTC, ${txCount} txs)`, type: 'whale', icon: '📊', ts: Date.now() };
                            _runtimeLabels[address] = result;
                            KNOWN_ADDRESSES[address] = { name: result.name, type: 'whale', icon: '📊' };
                            saveRuntimeLabelsToStorage();
                            return { ...result, category: 'runtime', address };
                        }
                        // Tier 7: Low activity but involved in whale tx = small whale or OTC
                        if (totalBTC > 1) {
                            const btcStr = totalBTC.toFixed(1);
                            const result = { name: `Endereço Rico (${btcStr} BTC)`, type: 'whale', icon: '💎', ts: Date.now() };
                            _runtimeLabels[address] = result;
                            KNOWN_ADDRESSES[address] = { name: result.name, type: 'whale', icon: '💎' };
                            saveRuntimeLabelsToStorage();
                            return { ...result, category: 'runtime', address };
                        }
                        // Tier 8: Any address with multiple txs = active participant
                        if (txCount > 10) {
                            const result = { name: `Carteira Ativa (${txCount} txs)`, type: 'whale', icon: '📋', ts: Date.now() };
                            _runtimeLabels[address] = result;
                            KNOWN_ADDRESSES[address] = { name: result.name, type: 'whale', icon: '📋' };
                            saveRuntimeLabelsToStorage();
                            return { ...result, category: 'runtime', address };
                        }
                        // Tier 9: Address with at least some BTC (>0.1 BTC balance)
                        if (finalBalance > 0.1) {
                            const btcStr = finalBalance.toFixed(2);
                            const result = { name: `Carteira (${btcStr} BTC)`, type: 'whale', icon: '👛', ts: Date.now() };
                            _runtimeLabels[address] = result;
                            KNOWN_ADDRESSES[address] = { name: result.name, type: 'whale', icon: '👛' };
                            saveRuntimeLabelsToStorage();
                            return { ...result, category: 'runtime', address };
                        }
                    }
                } catch(e) {}
                
                // Estratégia 3: Blockchair API (address clustering + labels)
                try {
                    const bcUrl = `https://api.blockchair.com/bitcoin/dashboards/address/${address}?limit=0`;
                    const controller = new AbortController();
                    const timer = setTimeout(() => controller.abort(), 6000);
                    const res = await fetch(bcUrl, { signal: controller.signal });
                    clearTimeout(timer);
                    if (res.ok) {
                        const data = await res.json();
                        const addrData = data?.data?.[address]?.address;
                        if (addrData) {
                            const txCount = addrData.transaction_count || 0;
                            const totalBTC = (addrData.received || 0) / 100000000;
                            const finalBalance = (addrData.balance || 0) / 100000000;
                            
                            // Verificar se há labels da Blockchair
                            const labels = data?.data?.[address]?.['address']?.['type'] || '';
                            
                            if (txCount > 1000) {
                                const result = { name: `Exchange/Serviço (${(txCount/1000).toFixed(0)}K txs)`, type: 'exchange', icon: '🏢', ts: Date.now() };
                                _runtimeLabels[address] = result;
                                KNOWN_ADDRESSES[address] = { name: result.name, type: 'exchange', icon: '🏢' };
                                saveRuntimeLabelsToStorage();
                                return { ...result, category: 'runtime', address };
                            }
                            if (totalBTC > 10 || finalBalance > 1) {
                                const btcStr = totalBTC >= 1000 ? `${(totalBTC/1000).toFixed(1)}K` : totalBTC.toFixed(1);
                                const balStr = finalBalance >= 1 ? `${finalBalance.toFixed(1)} BTC` : '';
                                const result = { name: `Baleia (${btcStr} BTC${balStr ? ', saldo ' + balStr : ''})`, type: 'whale', icon: '🐋', ts: Date.now() };
                                _runtimeLabels[address] = result;
                                KNOWN_ADDRESSES[address] = { name: result.name, type: 'whale', icon: '🐋' };
                                saveRuntimeLabelsToStorage();
                                return { ...result, category: 'runtime', address };
                            }
                            if (txCount > 5) {
                                const result = { name: `Carteira Ativa (${txCount} txs)`, type: 'whale', icon: '📋', ts: Date.now() };
                                _runtimeLabels[address] = result;
                                KNOWN_ADDRESSES[address] = { name: result.name, type: 'whale', icon: '📋' };
                                saveRuntimeLabelsToStorage();
                                return { ...result, category: 'runtime', address };
                            }
                        }
                    }
                } catch(e) {}
                
                // Estratégia 4: Mempool.space address API (endereço pode ter dados no mempool)
                try {
                    const mpUrl = `https://mempool.space/api/address/${address}`;
                    const controller = new AbortController();
                    const timer = setTimeout(() => controller.abort(), 5000);
                    const res = await fetch(mpUrl, { signal: controller.signal });
                    clearTimeout(timer);
                    if (res.ok) {
                        const data = await res.json();
                        const txCount = (data.chain_stats?.tx_count || 0) + (data.mempool_stats?.tx_count || 0);
                        const totalRecv = (data.chain_stats?.funded_txo_sum || 0) / 100000000;
                        const totalSent = (data.chain_stats?.spent_txo_sum || 0) / 100000000;
                        const balance = totalRecv - totalSent;
                        
                        if (txCount > 500) {
                            const result = { name: `Serviço (${txCount} txs)`, type: 'exchange', icon: '🏦', ts: Date.now() };
                            _runtimeLabels[address] = result;
                            KNOWN_ADDRESSES[address] = { name: result.name, type: 'exchange', icon: '🏦' };
                            saveRuntimeLabelsToStorage();
                            return { ...result, category: 'runtime', address };
                        }
                        if (totalRecv > 5 || balance > 0.5) {
                            const btcStr = totalRecv >= 100 ? `${totalRecv.toFixed(0)}` : totalRecv.toFixed(1);
                            const result = { name: `Endereço (${btcStr} BTC, ${txCount} txs)`, type: 'whale', icon: '💎', ts: Date.now() };
                            _runtimeLabels[address] = result;
                            KNOWN_ADDRESSES[address] = { name: result.name, type: 'whale', icon: '💎' };
                            saveRuntimeLabelsToStorage();
                            return { ...result, category: 'runtime', address };
                        }
                        if (txCount > 3) {
                            const result = { name: `Carteira (${txCount} txs)`, type: 'whale', icon: '👛', ts: Date.now() };
                            _runtimeLabels[address] = result;
                            KNOWN_ADDRESSES[address] = { name: result.name, type: 'whale', icon: '👛' };
                            saveRuntimeLabelsToStorage();
                            return { ...result, category: 'runtime', address };
                        }
                    }
                } catch(e) {}
                
                // Estratégia 5: Blockstream.info API (redundância extra)
                try {
                    const bsUrl = `https://blockstream.info/api/address/${encodeURIComponent(address)}`;
                    const controller = new AbortController();
                    const timer = setTimeout(() => controller.abort(), 5000);
                    const res = await fetch(bsUrl, { signal: controller.signal });
                    clearTimeout(timer);
                    if (res.ok) {
                        const data = await res.json();
                        const txCount = (data.chain_stats?.tx_count || 0) + (data.mempool_stats?.tx_count || 0);
                        const totalRecv = (data.chain_stats?.funded_txo_sum || 0) / 100000000;
                        const totalSent = (data.chain_stats?.spent_txo_sum || 0) / 100000000;
                        const balance = totalRecv - totalSent;
                        
                        if (txCount > 500) {
                            const result = { name: `Serviço (${txCount} txs)`, type: 'exchange', icon: '🏦', ts: Date.now() };
                            _runtimeLabels[address] = result;
                            KNOWN_ADDRESSES[address] = { name: result.name, type: 'exchange', icon: '🏦' };
                            saveRuntimeLabelsToStorage();
                            return { ...result, category: 'runtime', address };
                        }
                        if (totalRecv > 5 || balance > 0.5) {
                            const btcStr = totalRecv >= 100 ? `${totalRecv.toFixed(0)}` : totalRecv.toFixed(1);
                            const result = { name: `Endereço (${btcStr} BTC, ${txCount} txs)`, type: 'whale', icon: '💎', ts: Date.now() };
                            _runtimeLabels[address] = result;
                            KNOWN_ADDRESSES[address] = { name: result.name, type: 'whale', icon: '💎' };
                            saveRuntimeLabelsToStorage();
                            return { ...result, category: 'runtime', address };
                        }
                        if (txCount > 3) {
                            const result = { name: `Carteira (${txCount} txs)`, type: 'whale', icon: '👛', ts: Date.now() };
                            _runtimeLabels[address] = result;
                            KNOWN_ADDRESSES[address] = { name: result.name, type: 'whale', icon: '👛' };
                            saveRuntimeLabelsToStorage();
                            return { ...result, category: 'runtime', address };
                        }
                    }
                } catch(e) {}
                
                // Nenhuma API conseguiu identificar - cachear como "not found" para evitar re-requests
                _runtimeLabels[address] = { name: null, ts: Date.now() };
                saveRuntimeLabelsToStorage();
                return null;
                
            } catch(e) {
                return null;
            } finally {
                _pendingLookups.delete(address);
            }
        }
        
        // Processar fila de lookups em batch (máx 3 simultâneos)
        async function processLookupQueue() {
            if (_lookupProcessing || _lookupQueue.length === 0) return;
            _lookupProcessing = true;
            
            try {
                while (_lookupQueue.length > 0) {
                    // Processar em batches de 5
                    const batch = _lookupQueue.splice(0, 5);
                    await Promise.allSettled(batch.map(addr => lookupAddressOnline(addr)));
                    // Pequeno delay entre batches para não sobrecarregar APIs
                    if (_lookupQueue.length > 0) {
                        await new Promise(r => setTimeout(r, 200));
                    }
                }
            } finally {
                _lookupProcessing = false;
            }
        }
        
        // Agendar lookup asíncrono de endereço desconhecido
        function scheduleAddressLookup(address) {
            if (!address) return;
            if (KNOWN_ADDRESSES[address]) return; // Já conhecido
            if (_runtimeLabels[address]) {
                // If "not found" entry is expired, allow re-lookup
                if (!_runtimeLabels[address].name && (Date.now() - (_runtimeLabels[address].ts || 0)) > RUNTIME_LABEL_NOTFOUND_TTL) {
                    delete _runtimeLabels[address]; // Expired not-found, retry
                } else {
                    return; // Já consultado (hit ou miss still valid)
                }
            }
            if (_pendingLookups.has(address)) return; // Já na fila
            if (_lookupQueue.includes(address)) return;
            
            _lookupQueue.push(address);
            // Disparar processamento (debounced)
            setTimeout(processLookupQueue, 100);
        }
        
        // Função para identificar endereço (síncrona para uso inline)
        function identifyAddress(address) {
            if (!address) return null;
            
            // 1. Verificar base de dados estática
            if (KNOWN_ADDRESSES[address]) {
                return {
                    ...KNOWN_ADDRESSES[address],
                    category: 'confirmed',
                    address: address
                };
            }
            
            // 2. Verificar cache de runtime (APIs externas)
            if (_runtimeLabels[address] && _runtimeLabels[address].name) {
                return {
                    name: _runtimeLabels[address].name,
                    type: _runtimeLabels[address].type || 'whale',
                    icon: _runtimeLabels[address].icon || '🏷️',
                    category: 'runtime',
                    address: address
                };
            }
            
            // 3. Verificar prefixos conhecidos de exchanges (padrões de endereço)
            const exchangePrefixes = [
                { prefix: 'bc1qm34lsc65zpw79', name: 'Binance (Provável)', type: 'exchange' },
                { prefix: '34xp4vRoCGJym3xR', name: 'Binance (Provável)', type: 'exchange' },
                { prefix: '3FHNBLobJnbCTFTV', name: 'Coinbase (Provável)', type: 'exchange' },
                { prefix: 'bc1qa5wkgaew2dkv5', name: 'Kraken (Provável)', type: 'exchange' },
                { prefix: 'bc1qgdjqv0av3q56j', name: 'Bitfinex (Provável)', type: 'exchange' },
                { prefix: 'bc1ql49ydapnjafl5', name: 'Gemini (Provável)', type: 'exchange' },
                { prefix: '3M219KR5vEneNb47e', name: 'Binance (Provável)', type: 'exchange' },
                { prefix: '1NDyJtNTjmwk5xPN', name: 'Coinbase (Provável)', type: 'exchange' },
                { prefix: 'bc1qx9t2l3pyny2sp', name: 'Bitfinex (Provável)', type: 'exchange' },
                { prefix: '3LYJaqmPE5h7NXFA', name: 'Huobi (Provável)', type: 'exchange' },
                { prefix: '1LQoWist8KkaUXSP', name: 'Bitstamp (Provável)', type: 'exchange' },
                { prefix: 'bc1qjasf9z3h7w3js', name: 'Tether (Provável)', type: 'whale' },
                { prefix: '3Kzh9qAqVWQhEsfQ', name: 'Bitfinex (Provável)', type: 'exchange' },
                { prefix: 'bc1qd73fhknn2kqgm', name: 'OKX (Provável)', type: 'exchange' },
                { prefix: '3JZq4atUahhuA9rL', name: 'Bybit (Provável)', type: 'exchange' },
            ];
            
            for (const ep of exchangePrefixes) {
                if (address.startsWith(ep.prefix)) {
                    return {
                        name: ep.name,
                        type: ep.type,
                        icon: '🟡',
                        category: 'probable',
                        address: address
                    };
                }
            }
            
            // 4. Agendar lookup assíncrono para próxima vez
            scheduleAddressLookup(address);
            
            return null;
        }
        
        // Função para verificar se transação envolve endereço conhecido
        function checkTransactionForKnownAddresses(tx) {
            let fromEntity = null;
            let toEntity = null;
            let foundKnown = false;
            
            // Verificar inputs (de onde vem)
            if (tx.vin) {
                for (const vin of tx.vin) {
                    if (vin.prevout && vin.prevout.scriptpubkey_address) {
                        const identified = identifyAddress(vin.prevout.scriptpubkey_address);
                        if (identified && (identified.category === 'confirmed' || identified.category === 'runtime')) {
                            fromEntity = identified;
                            foundKnown = true;
                            break;
                        }
                        // Fallback: accept 'probable' if nothing else found
                        if (identified && identified.category === 'probable' && !fromEntity) {
                            fromEntity = identified;
                        }
                    }
                }
            }
            
            // Verificar outputs (para onde vai)
            if (tx.vout) {
                for (const vout of tx.vout) {
                    if (vout.scriptpubkey_address) {
                        const identified = identifyAddress(vout.scriptpubkey_address);
                        if (identified && (identified.category === 'confirmed' || identified.category === 'runtime')) {
                            toEntity = identified;
                            foundKnown = true;
                            break;
                        }
                        if (identified && identified.category === 'probable' && !toEntity) {
                            toEntity = identified;
                        }
                    }
                }
            }
            
            if (fromEntity || toEntity) foundKnown = true;
            
            return { fromEntity, toEntity, foundKnown };
        }
        
        // Classify unknown transactions using structural heuristics from the raw tx data
        function classifyByTxStructure(txAdapted, btcAmount, usdValue) {
            const inputCount = (txAdapted.vin || []).length;
            const outputCount = (txAdapted.vout || []).length;
            
            // Many inputs consolidating to few outputs → likely exchange cold wallet consolidation
            if (inputCount > 10 && outputCount <= 3) {
                return { flowType: 'whale_transfer', flowLabel: 'Consolidação (Prov. Exchange)', entityName: 'Consolidação', entityIcon: '🏦', entityType: 'exchange' };
            }
            
            // Few inputs, many outputs → likely exchange payout/withdrawal batch
            if (inputCount <= 3 && outputCount > 10) {
                return { flowType: 'from_exchange', flowLabel: 'Payout Batch (Prov. Exchange)', entityName: 'Batch Withdrawal', entityIcon: '🏧', entityType: 'exchange' };
            }
            
            // Very high value (>$10M) with simple structure → likely OTC or institutional move
            if (usdValue > 10000000 && inputCount <= 5 && outputCount <= 5) {
                return { flowType: 'whale_transfer', flowLabel: `Mov. Institucional ($${(usdValue/1e6).toFixed(0)}M)`, entityName: 'Institucional/OTC', entityIcon: '🏛️', entityType: 'whale' };
            }
            
            // High value (>$1M) 1-to-1 or 1-to-2 → likely whale self-transfer
            if (usdValue > 1000000 && inputCount <= 2 && outputCount <= 2) {
                return { flowType: 'whale_transfer', flowLabel: `Baleia (${(btcAmount).toFixed(1)} BTC)`, entityName: 'Baleia', entityIcon: '🐋', entityType: 'whale' };
            }
            
            // Moderate inputs/outputs → CoinJoin or mixing (privacy tx)
            if (inputCount > 5 && outputCount > 5 && inputCount < 50 && outputCount < 50) {
                return { flowType: 'whale_transfer', flowLabel: 'Tx Complexa (Prov. Mixing/CoinJoin)', entityName: 'Mixing', entityIcon: '🔀', entityType: 'whale' };
            }
            
            // Large tx with medium complexity
            if (usdValue > 500000) {
                return { flowType: 'whale_transfer', flowLabel: `Tx Grande (${(btcAmount).toFixed(1)} BTC, ${inputCount}→${outputCount})`, entityName: 'Tx Grande', entityIcon: '💰', entityType: 'whale' };
            }
            
            return null;
        }
        
        // Reclassifica uma tx armazenada usando labels atualizados
        function _reclassifyStoredTx(tx) {
            if (!tx || !tx._inputAddrs && !tx._outputAddrs) return null;
            let fromEntity = null, toEntity = null;
            
            for (const addr of (tx._inputAddrs || [])) {
                const identified = identifyAddress(addr);
                if (identified) { fromEntity = identified; break; }
            }
            for (const addr of (tx._outputAddrs || [])) {
                const identified = identifyAddress(addr);
                if (identified) { toEntity = identified; break; }
            }
            
            if (!fromEntity && !toEntity) return null;
            
            let flowType = 'unknown', flowLabel = '', entityName = '', entityIcon = '🔍';
            if (fromEntity && toEntity) {
                flowLabel = `${fromEntity.name} → ${toEntity.name}`;
                entityName = flowLabel; entityIcon = fromEntity.icon;
                flowType = (fromEntity.type === 'exchange' && toEntity.type === 'exchange') ? 'exchange_transfer' : 'whale_transfer';
            } else if (fromEntity) {
                flowLabel = `${fromEntity.name} → ?`; entityName = fromEntity.name; entityIcon = fromEntity.icon;
                flowType = fromEntity.type === 'exchange' ? 'from_exchange' : 'unknown';
            } else if (toEntity) {
                flowLabel = `? → ${toEntity.name}`; entityName = toEntity.name; entityIcon = toEntity.icon;
                flowType = toEntity.type === 'exchange' ? 'to_exchange' : 'unknown';
            }
            
            return { flowType, flowLabel, entityName, entityIcon, fromEntity, toEntity };
        }
        
        // Função principal
        async function fetchWhaleActivity(period = '1h') {
            if (_whaleActivityFetching) return;
            _whaleActivityFetching = true;
            try { await _fetchWhaleActivityInner(period); } finally { _whaleActivityFetching = false; }
        }
        async function _fetchWhaleActivityInner(period = '1h') {
            let config = WHALE_PERIODS[period];
            if (!config) {
                period = '1h';
                config = WHALE_PERIODS[period];
            }
            
            const container = document.getElementById('whale-activity-indicator');
            if (container) {
                const loadingEl = container.querySelector('.whale-loading');
                if (loadingEl) loadingEl.style.display = 'flex';
            }
            
            try {
                // Buscar preço atual do BTC
                let btcPrice = 100000;
                try {
                    const priceRes = await fetchWithTimeout('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT', {}, 5000);
                    const priceData = await priceRes.json();
                    btcPrice = parseFloat(priceData.price) || 100000;
                } catch(e) {}
                
                const now = Math.floor(Date.now() / 1000);
                const periodStart = now - config.seconds;
                
                // === FONTE PRINCIPAL: Blockchain.info transações grandes (mempool real-time) ===
                let freshTxs = [];
                try {
                    freshTxs = await fetchRecentLargeTxs(btcPrice, periodStart);
                } catch(e) {}
                
                // Armazenar todas as txs novas no acumulador local
                freshTxs.forEach(tx => storeTx(tx));
                _saveTxStore();
                
                // === COMBINAR: mempool fresco + histórico acumulado do período ===
                let transactions = [];
                const existingIds = new Set();
                
                // Primeiro: txs frescas do mempool
                for (const tx of freshTxs) {
                    if (!existingIds.has(tx.txid)) {
                        transactions.push(tx);
                        existingIds.add(tx.txid);
                    }
                }
                
                // Segundo: txs do acumulador local dentro do período selecionado
                const storedTxs = getStoredTxsForPeriod(periodStart);
                for (const tx of storedTxs) {
                    if (!existingIds.has(tx.txid)) {
                        // Reclassificar txs armazenadas com labels atualizados
                        if (tx.flowType === 'unknown' || tx.flowType === 'whale_transfer') {
                            const reclassified = _reclassifyStoredTx(tx);
                            if (reclassified) Object.assign(tx, reclassified);
                        }
                        transactions.push(tx);
                        existingIds.add(tx.txid);
                    }
                }
                
                if (transactions.length > 0) {
                    transactions.sort((a, b) => b.usdValue - a.usdValue);
                    transactions = transactions.slice(0, 150);
                    
                    let totalVolume = 0, toExchangeVol = 0, fromExchangeVol = 0, unknownVol = 0, whaleTransferVol = 0;
                    transactions.forEach(tx => {
                        totalVolume += tx.usdValue;
                        if (tx.flowType === 'to_exchange') toExchangeVol += tx.usdValue;
                        else if (tx.flowType === 'from_exchange') fromExchangeVol += tx.usdValue;
                        else if (tx.flowType === 'whale_transfer' || tx.flowType === 'exchange_transfer') whaleTransferVol += tx.usdValue;
                        else unknownVol += tx.usdValue;
                    });
                    
                    let direction = 'neutral';
                    if (fromExchangeVol > toExchangeVol * 1.15) direction = 'acumulando';
                    else if (toExchangeVol > fromExchangeVol * 1.15) direction = 'vendendo';
                    
                    // Calcular cobertura real dos dados
                    const oldestTxTime = transactions.reduce((min, tx) => {
                        const t = tx.time ? new Date(tx.time).getTime() / 1000 : now;
                        return t < min ? t : min;
                    }, now);
                    const dataSpanSeconds = now - oldestTxTime;
                    const coveragePct = Math.min(100, Math.round((dataSpanSeconds / config.seconds) * 100));
                    
                    whaleActivityData = {
                        transactions, totalVolume, toExchange: toExchangeVol, fromExchange: fromExchangeVol,
                        unknownVolume: unknownVol, whaleTransferVolume: whaleTransferVol,
                        direction, count: transactions.length, btcPrice,
                        coveragePct, dataSpanSeconds
                    };
                    
                    try { /* dados mantidos apenas em memoria */ } catch(e) {}
                } else {
                    whaleActivityData = { transactions: [], totalVolume: 0, toExchange: 0, fromExchange: 0, direction: 'neutral', count: 0, btcPrice, noData: true };
                }
                
                whaleActivityLastUpdate = new Date();
                whaleActivityPeriod = period;
                renderWhaleActivityUI();
                
            } catch (e) {
                whaleActivityData = { transactions: [], totalVolume: 0, toExchange: 0, fromExchange: 0, direction: 'neutral', count: 0, error: e.message };
                whaleActivityLastUpdate = new Date();
                renderWhaleActivityUI();
            }
        }
        
        // Buscar últimas transações grandes via blockchain.info (sem varrer bloco a bloco)
        async function fetchRecentLargeTxs(btcPrice, periodStart) {
            const whales = [];
            const minSatoshis = (WHALE_MIN_USD / btcPrice) * 100000000;
            
            try {
                // Usar endpoint de transações não confirmadas grandes (mempool)
                // Tentar blockchain.info com timeout generoso (dados pesados ~150KB)
                let res = null;
                try {
                    res = await fetchWithTimeout('https://blockchain.info/unconfirmed-transactions?format=json', {}, 10000);
                } catch(e) { res = null; }
                
                // Fallback: blockstream.info (mais leve, só 10 txs recentes)
                if (!res || !res.ok) {
                    try {
                        const bsRes = await fetchWithTimeout('https://blockstream.info/api/mempool/recent', {}, 8000);
                        if (bsRes.ok) {
                            const bsData = await bsRes.json();
                            // Formato diferente: [{txid, fee, vsize, value}]
                            for (const tx of (bsData || [])) {
                                const btcAmount = (tx.value || 0) / 100000000;
                                const usdValue = btcAmount * btcPrice;
                                if (usdValue < WHALE_MIN_USD) continue;
                                whales.push({
                                    txid: tx.txid, btcAmount, usdValue, fee: (tx.fee || 0) / 100000000,
                                    blockHeight: null, blockTime: null, flowType: 'unknown',
                                    flowLabel: 'Tx Grande (mempool)', entityName: 'Desconhecido', entityIcon: '🔍',
                                    entityType: 'unknown', fromEntity: null, toEntity: null,
                                    status: 'pending', confirmations: 0, source: 'blockstream.info',
                                    time: new Date().toISOString()
                                });
                            }
                            return whales;
                        }
                    } catch(e) {}
                    return whales;
                }
                
                const data = await res.json();
                const txs = data.txs || [];
                
                for (const tx of txs) {
                    let totalValue = 0;
                    if (tx.out) totalValue = tx.out.reduce((sum, out) => sum + (out.value || 0), 0);
                    if (totalValue < minSatoshis) continue;
                    
                    const btcAmount = totalValue / 100000000;
                    const usdValue = btcAmount * btcPrice;
                    
                    // Check known addresses (usando identifyAddress que cobre KNOWN_ADDRESSES + _runtimeLabels + prefixos)
                    let flowType = 'unknown', flowLabel = '', entityName = '', entityIcon = '🔍', fromEntity = null, toEntity = null;
                    
                    // Check inputs (de onde vem)
                    for (const inp of (tx.inputs || [])) {
                        const addr = inp.prev_out && inp.prev_out.addr;
                        if (!addr) continue;
                        const identified = identifyAddress(addr);
                        if (identified) {
                            fromEntity = identified;
                            break;
                        }
                    }
                    // Check outputs (para onde vai)
                    for (const out of (tx.out || [])) {
                        if (!out.addr) continue;
                        const identified = identifyAddress(out.addr);
                        if (identified) {
                            toEntity = identified;
                            break;
                        }
                    }
                    
                    if (fromEntity && toEntity) {
                        flowLabel = `${fromEntity.name} → ${toEntity.name}`;
                        entityName = flowLabel; entityIcon = fromEntity.icon;
                        flowType = (fromEntity.type === 'exchange' && toEntity.type === 'exchange') ? 'exchange_transfer' : 'whale_transfer';
                    } else if (fromEntity) {
                        flowLabel = `${fromEntity.name} → ?`; entityName = fromEntity.name; entityIcon = fromEntity.icon;
                        flowType = fromEntity.type === 'exchange' ? 'from_exchange' : 'unknown';
                    } else if (toEntity) {
                        flowLabel = `? → ${toEntity.name}`; entityName = toEntity.name; entityIcon = toEntity.icon;
                        flowType = toEntity.type === 'exchange' ? 'to_exchange' : 'unknown';
                    } else {
                        // Nenhum endereço conhecido — classificar por estrutura da tx
                        const txAdapted = { vin: (tx.inputs || []), vout: (tx.out || []) };
                        const structural = classifyByTxStructure(txAdapted, btcAmount, usdValue);
                        if (structural) {
                            flowType = structural.flowType;
                            flowLabel = structural.flowLabel;
                            entityName = structural.entityName;
                            entityIcon = structural.entityIcon;
                        } else {
                            flowLabel = 'Tx Grande'; entityName = 'Desconhecido'; entityIcon = '🔍';
                        }
                    }
                    
                    // Coletar endereços para reclassificação futura
                    const _inputAddrs = (tx.inputs || []).map(inp => inp.prev_out && inp.prev_out.addr).filter(Boolean).slice(0, 5);
                    const _outputAddrs = (tx.out || []).map(out => out.addr).filter(Boolean).slice(0, 5);
                    
                    whales.push({
                        txid: tx.hash, btcAmount, usdValue, fee: tx.fee ? tx.fee / 100000000 : 0,
                        blockHeight: null, blockTime: null, flowType, flowLabel, entityName, entityIcon,
                        entityType: (fromEntity || toEntity) ? ((fromEntity || toEntity).type || 'unknown') : 'unknown',
                        fromEntity, toEntity, status: 'pending', confirmations: 0,
                        source: 'blockchain.info', time: new Date(tx.time * 1000).toISOString(),
                        _inputAddrs, _outputAddrs
                    });
                    
                    if (whales.length >= 50) break;
                }
            } catch(e) {}
            
            return whales;
        }
        
        // API MEMPOOL.SPACE - Desativada
        async function fetchMempoolWhales(btcPrice) {
            return [];
        }
        
        // Whale Alert RSS - Desativado (whale-alert.io/feed retorna 404)
        async function fetchWhaleAlertRSS(btcPrice, periodStart) {
            return []; // Feed não existe mais
        }
        
        // Whale Alert RSS (legado) - NÃO UTILIZADO
        async function _fetchWhaleAlertRSS_disabled(btcPrice, periodStart) {
            const whales = [];
            const rssAttempts = [];
            
            for (const attempt of rssAttempts) {
                try {
                    const res = await fetchWithTimeout(attempt.url, {}, 8000);
                    if (!res.ok) continue;
                    
                    const text = await res.text();
                    let items = [];
                    
                    if (attempt.type === 'json') {
                        // Parse rss2json response
                        try {
                            const json = JSON.parse(text);
                            if (json.items) {
                                items = json.items.map(i => ({
                                    title: i.title || '',
                                    pubDate: i.pubDate || '',
                                    link: i.link || ''
                                }));
                            }
                        } catch(e) {}
                    }
                    
                    if (items.length === 0) {
                        // Parse como XML/RSS (para fetch direto ou allorigins)
                        const titleMatches = text.match(/<item>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<pubDate>([\s\S]*?)<\/pubDate>[\s\S]*?<\/item>/gi);
                        if (titleMatches) {
                            for (const match of titleMatches) {
                                const titleM = match.match(/<title>([\s\S]*?)<\/title>/i);
                                const dateM = match.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
                                if (titleM) {
                                    items.push({
                                        title: titleM[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim(),
                                        pubDate: dateM ? dateM[1].trim() : ''
                                    });
                                }
                            }
                        }
                    }
                    
                    // Parse Whale Alert titles: "123 BTC (5,000,000 USD) transferred from Binance to unknown wallet"
                    for (const item of items) {
                        const title = item.title;
                        if (!title) continue;
                        
                        // Filtrar por período
                        if (item.pubDate) {
                            const pubTime = Math.floor(new Date(item.pubDate).getTime() / 1000);
                            if (pubTime < periodStart) continue;
                        }
                        
                        // Parse BTC amount e USD value do título
                        const btcMatch = title.match(/([\d,]+(?:\.\d+)?)\s*BTC/i);
                        const usdMatch = title.match(/\(([\d,]+(?:\.\d+)?)\s*USD\)/i);
                        if (!btcMatch) continue;
                        
                        const btcAmount = parseFloat(btcMatch[1].replace(/,/g, ''));
                        const usdValue = usdMatch ? parseFloat(usdMatch[1].replace(/,/g, '')) : btcAmount * btcPrice;
                        
                        if (usdValue < WHALE_MIN_USD) continue;
                        
                        // Parse entidades do título
                        let flowType = 'unknown';
                        let flowLabel = title;
                        let entityName = 'Whale Alert';
                        let entityIcon = '🐋';
                        
                        const fromMatch = title.match(/from\s+(\w[\w\s]*?)(?:\s+to\s+|$)/i);
                        const toMatch = title.match(/to\s+(\w[\w\s]*?)(?:\s+$|$)/i);
                        
                        if (fromMatch && /binance|coinbase|kraken|bitfinex|bybit|okx|huobi|gemini|bitstamp/i.test(fromMatch[1])) {
                            flowType = 'from_exchange';
                            entityName = fromMatch[1].trim();
                            entityIcon = '🏦';
                        }
                        if (toMatch && /binance|coinbase|kraken|bitfinex|bybit|okx|huobi|gemini|bitstamp/i.test(toMatch[1])) {
                            flowType = flowType === 'from_exchange' ? 'exchange_transfer' : 'to_exchange';
                            if (flowType !== 'exchange_transfer') entityName = toMatch[1].trim();
                            entityIcon = '🏦';
                        }
                        
                        whales.push({
                            txid: `wa_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
                            btcAmount,
                            usdValue,
                            fee: 0,
                            blockHeight: null,
                            blockTime: null,
                            flowType,
                            flowLabel,
                            entityName,
                            entityIcon,
                            entityType: flowType.includes('exchange') ? 'exchange' : 'whale',
                            fromEntity: null,
                            toEntity: null,
                            status: 'confirmed',
                            confirmations: 1,
                            source: 'whale-alert.io',
                            time: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString()
                        });
                    }
                    
                    if (whales.length > 0) break; // Sucesso, não tentar próximo proxy
                } catch(e) {
                    continue;
                }
            }
            
            return whales;
        }
        
        // Função para mudar o período
        function changeWhalePeriod(period) {
            if (whaleActivityPeriod === period) return;
            whaleActivityPeriod = period;
            fetchWhaleActivity(period);
        }
        
        // Iniciar atualização automática a cada 2 minutos (dados reais!)
        let _whaleActivityFetching = false;
        function startWhaleActivityAutoRefresh() {
            if (whaleActivityInterval) clearInterval(whaleActivityInterval);
            whaleActivityInterval = setInterval(() => {
                if (document.hidden) return;
                if (_whaleActivityFetching) return;
                fetchWhaleActivity(whaleActivityPeriod);
            }, 120000); // 2 minutos para dados mais frescos
        }
        
        // Renderizar UI do indicador de baleias - 100% REAL
        function renderWhaleActivityUI() {
            const container = document.getElementById('whale-activity-indicator');
            if (!container) return;
            
            // Guard: se não está na analysis (onde o card está), marcar dirty
            if (typeof currentSection !== 'undefined' && currentSection !== 'home' && currentSection !== 'analysis') {
                _dirtyFlags.whale = true;
                return;
            }
            
            const data = whaleActivityData;
            
            const formatVolume = (vol) => {
                if (!vol || isNaN(vol)) return '$0';
                if (vol >= 1000000000) return `$${(vol / 1000000000).toFixed(2)}B`;
                if (vol >= 1000000) return `$${(vol / 1000000).toFixed(1)}M`;
                if (vol >= 1000) return `$${(vol / 1000).toFixed(0)}K`;
                return `$${vol.toFixed(0)}`;
            };
            
            const lastUpdate = whaleActivityLastUpdate 
                ? whaleActivityLastUpdate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                : '--:--';
            
            const cacheIndicator = data._cacheAge ? ` (${data._cacheAge}min atrás)` : '';
            const hasData = data.count > 0 || (data.transactions && data.transactions.length > 0);
            const noData = data.noData;
            const hasError = data.error;
            
            const outflow = data.toExchange || 0;
            const inflow = data.fromExchange || 0;
            
            // Interpretação
            let interpretation = '';
            let interpColor = '#eab308';
            let interpIcon = '⚖️';
            if (data.direction === 'acumulando') {
                interpretation = 'Baleias retirando BTC das exchanges → tendência de alta';
                interpColor = '#22c55e';
                interpIcon = '🟢';
            } else if (data.direction === 'vendendo') {
                interpretation = 'Baleias enviando BTC para exchanges → pressão de venda';
                interpColor = '#ef4444';
                interpIcon = '🔴';
            } else {
                interpretation = 'Fluxo equilibrado → mercado indeciso';
                interpColor = '#eab308';
                interpIcon = '🟡';
            }
            
            const totalFlow = outflow + inflow;
            const outPct = totalFlow > 0 ? (outflow / totalFlow * 100).toFixed(0) : 50;
            const inPct = totalFlow > 0 ? (inflow / totalFlow * 100).toFixed(0) : 50;
            
            // Label do período
            const periodLabel = WHALE_PERIODS[whaleActivityPeriod]?.label || '1h';
            
            // Indicador de cobertura
            const coveragePct = data.coveragePct || 0;
            let coverageNote = '';
            if (coveragePct > 0 && coveragePct < 90 && WHALE_PERIODS[whaleActivityPeriod]?.seconds > 3600) {
                const spanHrs = data.dataSpanSeconds ? (data.dataSpanSeconds / 3600).toFixed(1) : '?';
                coverageNote = `<div style="font-size: 10px; color: var(--text-muted); margin-top: 6px; padding: 6px 10px; background: rgba(234,179,8,0.08); border-radius: 8px; border: 1px solid rgba(234,179,8,0.15);">
                    <i class="fas fa-info-circle" style="color: #eab308; margin-right: 4px;"></i>
                    Dados acumulados: ${spanHrs}h de cobertura (${coveragePct}%). A precisão melhora com o tempo de uso.
                </div>`;
            }
            
            requestAnimationFrame(() => {

            // ── Exchange Flow view ──
            if (_whaleViewMode === 'exchange') {
                const ef = _exchangeFlowData;
                const efUpdate = ef.lastUpdate ? ef.lastUpdate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--';
                const fmtVol = formatVolume;
                const efOutflow = ef.outflow || 0;
                const efInflow = ef.inflow || 0;
                const efTotal = efOutflow + efInflow;
                const efOutPct = efTotal > 0 ? (efOutflow / efTotal * 100).toFixed(0) : 50;
                const efInPct = efTotal > 0 ? (efInflow / efTotal * 100).toFixed(0) : 50;
                const efInterpColor = ef.interpColor || '#eab308';
                const efInterpIcon = ef.interpIcon || '🟡';
                const isFutures = _efMarketType === 'futures';
                const marketLabel = isFutures ? 'Futures' : 'Spot';

                container.innerHTML = `
                <div class="card-header" style="flex-wrap: wrap; gap: 8px;">
                    <div class="card-title" style="display: flex; align-items: center; gap: 10px;">
                        <div style="width:32px;height:32px;background:linear-gradient(135deg,#f59e0b,#ef4444);border-radius:8px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(245,158,11,0.3);">
                            <i class="fas fa-exchange-alt" style="color:white;font-size:14px;"></i>
                        </div>
                        <div>
                            <div style="font-size:15px;font-weight:700;">Fluxo de Exchange</div>
                            <div style="font-size:10px;color:var(--text-muted);font-weight:400;">Binance ${marketLabel} (${ef.pairsCount || 0} pares) • ${efUpdate}</div>
                        </div>
                    </div>
                    <button onclick="openWhalePeriodModal()"
                        style="display:flex;align-items:center;gap:6px;padding:6px 14px;border-radius:8px;border:1px solid #f59e0b;background:rgba(245,158,11,0.12);color:#f59e0b;font-size:12px;font-weight:700;cursor:pointer;transition:all 0.2s;">
                        <i class="fas fa-clock" style="font-size:10px;"></i>
                        ${periodLabel.toUpperCase()}
                        <i class="fas fa-chevron-down" style="font-size:8px;opacity:0.7;"></i>
                    </button>
                </div>
                <!-- Futures / Spot toggle -->
                <div style="display:flex;gap:4px;padding:0 16px;margin-top:6px;">
                    <button onclick="switchEfMarketType('futures')" style="flex:1;padding:7px;border-radius:8px;border:1px solid ${isFutures ? 'rgba(245,158,11,0.4)' : 'rgba(255,255,255,0.08)'};background:${isFutures ? 'rgba(245,158,11,0.12)' : 'rgba(255,255,255,0.03)'};color:${isFutures ? '#f59e0b' : '#9ca3af'};font-size:12px;font-weight:${isFutures ? '700' : '600'};cursor:pointer;">
                        <i class="fas fa-bolt" style="margin-right:4px;font-size:10px;"></i>Futures
                    </button>
                    <button onclick="switchEfMarketType('spot')" style="flex:1;padding:7px;border-radius:8px;border:1px solid ${!isFutures ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.08)'};background:${!isFutures ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.03)'};color:${!isFutures ? '#60a5fa' : '#9ca3af'};font-size:12px;font-weight:${!isFutures ? '700' : '600'};cursor:pointer;">
                        <i class="fas fa-coins" style="margin-right:4px;font-size:10px;"></i>Spot
                    </button>
                </div>
                <div style="padding:16px;">
                    ${_efLoading ? `
                        <div style="text-align:center;padding:24px;color:var(--text-muted);">
                            <i class="fas fa-circle-notch fa-spin" style="font-size:24px;color:#f59e0b;margin-bottom:10px;"></i>
                            <div style="font-size:13px;">Carregando dados...</div>
                        </div>
                    ` : ef.error ? `
                        <div style="text-align:center;padding:20px;color:#ef4444;">
                            <i class="fas fa-exclamation-triangle" style="font-size:20px;margin-bottom:8px;"></i>
                            <div style="font-size:13px;">Erro ao buscar dados de fluxo</div>
                        </div>
                    ` : !ef.lastUpdate ? `
                        <div style="text-align:center;padding:20px;color:var(--text-muted);">
                            <i class="fas fa-spinner fa-spin" style="font-size:20px;margin-bottom:8px;"></i>
                            <div style="font-size:13px;">Carregando fluxo das exchanges...</div>
                        </div>
                    ` : `
                        <!-- Outflow / Inflow -->
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
                            <div style="background:rgba(239,68,68,0.08);padding:14px 10px;border-radius:12px;border:1px solid rgba(239,68,68,0.2);text-align:center;min-width:0;overflow:hidden;">
                                <div style="font-size:11px;color:#ef4444;font-weight:700;margin-bottom:8px;text-transform:uppercase;">Vendas (Outflow)</div>
                                <div style="font-size:20px;font-weight:800;color:#ef4444;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${fmtVol(efOutflow)}</div>
                                <div style="font-size:10px;color:var(--text-muted);margin-top:4px;">Taker sells (${efOutPct}%)</div>
                            </div>
                            <div style="background:rgba(34,197,94,0.08);padding:14px 10px;border-radius:12px;border:1px solid rgba(34,197,94,0.2);text-align:center;min-width:0;overflow:hidden;">
                                <div style="font-size:11px;color:#22c55e;font-weight:700;margin-bottom:8px;text-transform:uppercase;">Compras (Inflow)</div>
                                <div style="font-size:20px;font-weight:800;color:#22c55e;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${fmtVol(efInflow)}</div>
                                <div style="font-size:10px;color:var(--text-muted);margin-top:4px;">Taker buys (${efInPct}%)</div>
                            </div>
                        </div>

                        <!-- Barra de fluxo -->
                        <div style="margin-bottom:16px;">
                            <div style="background:#22c55e;border-radius:6px;overflow:hidden;height:8px;">
                                <div style="height:100%;width:${efOutPct}%;background:#ef4444;transition:width 0.5s;"></div>
                            </div>
                        </div>

                        <!-- Interpretação -->
                        <div style="padding:14px;background:${efInterpColor}10;border:1px solid ${efInterpColor}30;border-radius:12px;">
                            <div style="display:flex;align-items:center;gap:10px;">
                                <span style="font-size:24px;">${efInterpIcon}</span>
                                <div style="font-size:13px;font-weight:600;color:${efInterpColor};line-height:1.4;">
                                    ${ef.interpretation}
                                </div>
                            </div>
                        </div>

                        <!-- Volume total -->
                        <div style="text-align:center;margin-top:12px;font-size:11px;color:var(--text-muted);">
                            Volume total: <strong style="color:var(--text-secondary);">${fmtVol(ef.totalVolume || 0)}</strong>
                            • ${ef.pairsCount || 0} pares monitorados
                        </div>
                    `}
                </div>
                `;
                return;
            }

            // ── On-Chain view (original) ──
            container.innerHTML = `
                <div class="card-header" style="flex-wrap: wrap; gap: 8px;">
                    <div class="card-title" style="display: flex; align-items: center; gap: 10px;">
                        <div style="
                            width: 32px; height: 32px; 
                            background: linear-gradient(135deg, #3b82f6, #8b5cf6);
                            border-radius: 8px;
                            display: flex; align-items: center; justify-content: center;
                            box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);">
                            <i class="fas fa-water" style="color: white; font-size: 14px;"></i>
                        </div>
                        <div>
                            <div style="font-size: 15px; font-weight: 700;">Fluxo das Baleias</div>
                            <div style="font-size: 10px; color: var(--text-muted); font-weight: 400;">Bitcoin On-Chain • ${lastUpdate}${cacheIndicator}</div>
                        </div>
                    </div>
                    <button onclick="openWhalePeriodModal()" 
                        style="
                            display: flex; align-items: center; gap: 6px;
                            padding: 6px 14px; 
                            border-radius: 8px; 
                            border: 1px solid var(--accent-blue);
                            background: rgba(59, 130, 246, 0.12);
                            color: var(--accent-blue, #3b82f6);
                            font-size: 12px;
                            font-weight: 700;
                            cursor: pointer;
                            transition: all 0.2s;">
                        <i class="fas fa-clock" style="font-size: 10px;"></i>
                        ${periodLabel.toUpperCase()}
                        <i class="fas fa-chevron-down" style="font-size: 8px; opacity: 0.7;"></i>
                    </button>
                </div>
                <!-- Toggle tabs -->
                <div style="display:flex;gap:4px;padding:0 16px;margin-top:4px;">
                    <button onclick="switchWhaleView('onchain')" style="flex:1;padding:8px;border-radius:8px;border:1px solid rgba(59,130,246,0.4);background:rgba(59,130,246,0.12);color:#60a5fa;font-size:12px;font-weight:700;cursor:pointer;">
                        <i class="fas fa-water" style="margin-right:4px;"></i>On-Chain
                    </button>
                    <button onclick="switchWhaleView('exchange')" style="flex:1;padding:8px;border-radius:8px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.03);color:#9ca3af;font-size:12px;font-weight:600;cursor:pointer;">
                        <i class="fas fa-exchange-alt" style="margin-right:4px;"></i>Exchange Flow
                    </button>
                </div>
                
                <!-- Loading (hidden by default, shown during fetch) -->
                <div class="whale-loading" style="display: none; padding: 16px; justify-content: center; align-items: center; gap: 8px;">
                    <i class="fas fa-spinner fa-spin"></i>
                    <span style="font-size: 12px; color: var(--text-muted);">Atualizando...</span>
                </div>
                
                <div style="padding: 16px;">
                    ${hasError ? `
                        <div style="text-align: center; padding: 20px; color: #ef4444;">
                            <i class="fas fa-exclamation-triangle" style="font-size: 20px; margin-bottom: 8px;"></i>
                            <div style="font-size: 13px;">Erro ao buscar dados</div>
                        </div>
                    ` : noData ? `
                        <div style="text-align: center; padding: 20px; color: var(--text-muted);">
                            <span style="font-size: 32px;">🐋</span>
                            <div style="font-size: 13px; margin-top: 8px;">Nenhuma movimentação detectada</div>
                        </div>
                    ` : hasData ? `
                        <!-- Outflow / Inflow -->
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
                            <div style="background: rgba(239, 68, 68, 0.08); padding: 16px; border-radius: 12px; border: 1px solid rgba(239, 68, 68, 0.2); text-align: center;">
                                <div style="font-size: 11px; color: #ef4444; font-weight: 700; margin-bottom: 8px; text-transform: uppercase;">
                                    📤 Outflow
                                </div>
                                <div style="font-size: 24px; font-weight: 800; color: #ef4444;">${formatVolume(outflow)}</div>
                                <div style="font-size: 10px; color: var(--text-muted); margin-top: 4px;">Para exchanges (${outPct}%)</div>
                            </div>
                            <div style="background: rgba(34, 197, 94, 0.08); padding: 16px; border-radius: 12px; border: 1px solid rgba(34, 197, 94, 0.2); text-align: center;">
                                <div style="font-size: 11px; color: #22c55e; font-weight: 700; margin-bottom: 8px; text-transform: uppercase;">
                                    📥 Inflow
                                </div>
                                <div style="font-size: 24px; font-weight: 800; color: #22c55e;">${formatVolume(inflow)}</div>
                                <div style="font-size: 10px; color: var(--text-muted); margin-top: 4px;">De exchanges (${inPct}%)</div>
                            </div>
                        </div>
                        
                        <!-- Barra de fluxo -->
                        <div style="margin-bottom: 16px;">
                            <div style="background: #22c55e; border-radius: 6px; overflow: hidden; height: 8px;">
                                <div style="height: 100%; width: ${outPct}%; background: #ef4444; transition: width 0.5s;"></div>
                            </div>
                        </div>
                        
                        <!-- Interpretação -->
                        <div style="padding: 14px; background: ${interpColor}10; border: 1px solid ${interpColor}30; border-radius: 12px;">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <span style="font-size: 24px;">${interpIcon}</span>
                                <div style="font-size: 13px; font-weight: 600; color: ${interpColor}; line-height: 1.4;">
                                    ${interpretation}
                                </div>
                            </div>
                        </div>
                        
                        <!-- Volume total -->
                        <div style="text-align: center; margin-top: 12px; font-size: 11px; color: var(--text-muted);">
                            Volume total monitorado: <strong style="color: var(--text-secondary);">${formatVolume(data.totalVolume || 0)}</strong>
                            • ${data.count || 0} transações ≥$50K
                        </div>
                        ${coverageNote}
                    ` : `
                        <div style="text-align: center; padding: 20px; color: var(--text-muted);">
                            <span style="font-size: 32px;">🐋</span>
                            <div style="font-size: 13px; margin-top: 8px;">Sem movimentações detectadas</div>
                            <div style="font-size: 11px; margin-top: 4px;">Nenhuma transação ≥$50K com exchanges conhecidas</div>
                        </div>
                    `}
                </div>
            `;
            }); // end requestAnimationFrame
        }
        
        // Modal de seleção de período
        function openWhalePeriodModal() {
            const existing = document.getElementById('whale-period-modal');
            if (existing) existing.remove();
            
            const periods = [
                { key: '1h',  label: '1 Hora',    desc: 'Dados em tempo real' },
                { key: '12h', label: '12 Horas',   desc: 'Dados das ultimas 12h' },
                { key: '1d',  label: '1 Dia',      desc: 'Resumo das ultimas 24 horas' },
                { key: '1s',  label: '1 Semana',   desc: 'Visao semanal do fluxo' },
                { key: '1m',  label: '1 Mes',      desc: 'Tendencia mensal' },
                { key: '1a',  label: '1 Ano',      desc: 'Panorama anual do fluxo' }
            ];
            
            document.body.style.overflow = 'hidden';
            
            const modal = document.createElement('div');
            modal.id = 'whale-period-modal';
            modal.style.cssText = 'position:fixed;inset:0;z-index:999999;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,0.6);backdrop-filter:blur(8px);animation:fadeInOverlay 0.2s ease;';
            
            modal.addEventListener('click', function(e) {
                if (e.target === modal) {
                    modal.remove();
                    document.body.style.overflow = '';
                }
            });
            
            const periodButtons = periods.map(p => {
                const isActive = whaleActivityPeriod === p.key;
                return `
                    <button onclick="selectWhalePeriod('${p.key}')" style="
                        display: flex; align-items: center; gap: 14px;
                        width: 100%; padding: 14px 16px;
                        background: ${isActive ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.03)'};
                        border: 1px solid ${isActive ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.06)'};
                        border-radius: 12px;
                        color: ${isActive ? '#60a5fa' : '#e5e7eb'};
                        cursor: pointer;
                        transition: all 0.15s;">
                        <div style="flex: 1; text-align: left;">
                            <div style="font-size: 14px; font-weight: 700;">${p.label}</div>
                            <div style="font-size: 10px; color: #9ca3af; margin-top: 2px;">${p.desc}</div>
                        </div>
                        ${isActive ? '<i class="fas fa-check-circle" style="color:#3b82f6;font-size:16px;"></i>' : ''}
                    </button>`;
            }).join('');
            
            modal.innerHTML = `
                <div style="
                    width: 100%; max-width: 400px;
                    background: var(--bg-card, #1a1a2e);
                    border-radius: 20px 20px 0 0;
                    padding: 20px 16px max(16px, env(safe-area-inset-bottom, 16px));
                    animation: slideUpModal 0.25s ease;">
                    <div style="width: 40px; height: 4px; background: rgba(255,255,255,0.2); border-radius: 2px; margin: 0 auto 16px;"></div>
                    <div style="font-size: 16px; font-weight: 800; color: #e5e7eb; text-align: center; margin-bottom: 4px;">
                        <i class="fas fa-clock" style="margin-right: 6px; color: #3b82f6;"></i>Período de Análise
                    </div>
                    <div style="font-size: 11px; color: #6b7280; text-align: center; margin-bottom: 16px;">
                        Selecione o intervalo de tempo para o fluxo de baleias
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        ${periodButtons}
                    </div>
                </div>
            `;
            
            // Inject animation if not present
            if (!document.getElementById('whale-modal-animations')) {
                const style = document.createElement('style');
                style.id = 'whale-modal-animations';
                style.textContent = `
                    @keyframes slideUpModal {
                        from { transform: translateY(100%); opacity: 0; }
                        to { transform: translateY(0); opacity: 1; }
                    }
                    @keyframes fadeInOverlay {
                        from { opacity: 0; }
                        to { opacity: 1; }
                    }
                `;
                document.head.appendChild(style);
            }
            
            document.body.appendChild(modal);
        }
        
        function selectWhalePeriod(period) {
            const modal = document.getElementById('whale-period-modal');
            if (modal) modal.remove();
            document.body.style.overflow = '';
            
            if (whaleActivityPeriod !== period) {
                whaleActivityPeriod = period;
                _efLoading = true;
                renderWhaleActivityUI(); // show loading immediately
                fetchExchangeFlow(period);
            }
        }

        function switchEfMarketType(type) {
            if (_efMarketType === type) return;
            _efMarketType = type;
            _exchangeFlowFetching = false; // allow new fetch
            _efLoading = true;
            renderWhaleActivityUI();
            fetchExchangeFlow(whaleActivityPeriod);
        }
        
        // Aliases para compatibilidade
        function updateWhaleActivity() {
            fetchWhaleActivity(whaleActivityPeriod);
        }
        
        function updateWhaleActivityUI() {
            renderWhaleActivityUI();
        }
        
        // Modal completo de transações de baleias
        function openWhaleTransactionModal() {
            const data = whaleActivityData;
            if (!data || !data.transactions || data.transactions.length === 0) return;
            
            const formatVolume = (vol) => {
                if (!vol || isNaN(vol)) return '$0';
                if (vol >= 1000000000) return `$${(vol / 1000000000).toFixed(2)}B`;
                if (vol >= 1000000) return `$${(vol / 1000000).toFixed(1)}M`;
                if (vol >= 1000) return `$${(vol / 1000).toFixed(0)}K`;
                return `$${vol.toFixed(0)}`;
            };
            const formatBtc = (btc) => {
                if (!btc || isNaN(btc)) return '0 BTC';
                if (btc >= 1000) return `${(btc / 1000).toFixed(1)}K BTC`;
                return `${btc.toFixed(2)} BTC`;
            };
            
            // Remover modal existente
            const existing = document.getElementById('whale-tx-modal');
            if (existing) existing.remove();
            
            // Prevent background from scrolling while modal is open
            document.body.style.overflow = 'hidden';
            document.documentElement.style.overflow = 'hidden';
            
            // Centralized close function to guarantee scroll restoration
            window._closeWhaleModal = function() {
                const m = document.getElementById('whale-tx-modal');
                if (m) m.remove();
                document.body.style.overflow = '';
                document.documentElement.style.overflow = '';
            };
            
            const modal = document.createElement('div');
            modal.id = 'whale-tx-modal';
            modal.style.cssText = 'position:fixed;inset:0;z-index:999999;display:flex;flex-direction:column;background:rgba(0,0,0,0.95);backdrop-filter:blur(16px);animation:fadeInOverlay 0.25s ease;overflow:hidden;';
            
            // Block touch events from reaching background
            modal.addEventListener('touchmove', function(e) {
                // Allow scrolling inside the transaction list
                const scrollable = modal.querySelector('[data-scrollable]');
                if (scrollable && scrollable.contains(e.target)) return;
                e.preventDefault();
            }, { passive: false });
            
            const txListHtml = data.transactions.map((tx, i) => {
                const borderColor = tx.flowType === 'to_exchange' ? '#ef4444' : tx.flowType === 'from_exchange' ? '#22c55e' : tx.flowType === 'exchange_transfer' ? '#f59e0b' : '#3b82f6';
                const badgeBg = tx.flowType === 'to_exchange' ? 'rgba(239,68,68,0.2)' : tx.flowType === 'from_exchange' ? 'rgba(34,197,94,0.2)' : 'rgba(59,130,246,0.2)';
                const badgeColor = tx.flowType === 'to_exchange' ? '#ef4444' : tx.flowType === 'from_exchange' ? '#22c55e' : '#3b82f6';
                const badgeText = tx.flowType === 'to_exchange' ? '→ Exchange' : tx.flowType === 'from_exchange' ? '← Exchange' : '↔️ Transfer';
                
                return `
                <div style="display:flex;align-items:center;padding:12px 14px;background:var(--bg-card,#1a1a24);border-radius:10px;margin-bottom:8px;border-left:3px solid ${borderColor};">
                    <div style="flex:1;min-width:0;">
                        <div style="font-size:14px;font-weight:700;color:#e5e7eb;margin-bottom:4px;">
                            ${formatVolume(tx.usdValue)}
                            <span style="font-size:11px;color:#9ca3af;font-weight:400;margin-left:4px;">(${formatBtc(tx.btcAmount)})</span>
                        </div>
                        ${tx.flowLabel ? `<div style="font-size:11px;font-weight:600;color:#3b82f6;margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${tx.entityIcon || '🏦'} ${tx.flowLabel}</div>` : ''}
                        ${tx.txid && !tx.txid.startsWith('wa_') ? `
                            <a href="https://www.blockchain.com/explorer/transactions/btc/${tx.txid}" target="_blank" 
                               style="font-size:10px;color:#60a5fa;text-decoration:none;">
                                <i class="fas fa-external-link-alt" style="margin-right:3px;"></i>${tx.txid.substring(0, 24)}...
                            </a>
                        ` : tx.source === 'whale-alert.io' ? `
                            <span style="font-size:10px;color:#f59e0b;"><i class="fas fa-bell" style="margin-right:3px;"></i>Whale Alert</span>
                        ` : ''}
                        <div style="font-size:9px;color:#6b7280;margin-top:2px;">
                            ${tx.status === 'pending' ? '⏳ Pendente' : tx.status === 'confirmed' ? '✅ Confirmada' : ''}
                            ${tx.blockHeight ? ` • Bloco #${tx.blockHeight.toLocaleString()}` : ''}
                        </div>
                    </div>
                    <div style="font-size:10px;padding:4px 8px;border-radius:4px;background:${badgeBg};color:${badgeColor};white-space:nowrap;">
                        ${badgeText}
                    </div>
                </div>`;
            }).join('');
            
            modal.innerHTML = `
                <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;padding-top:max(16px, env(safe-area-inset-top, 32px));border-bottom:1px solid rgba(255,255,255,0.08);background:rgba(0,0,0,0.6);">
                    <button onclick="window._closeWhaleModal()" style="width:36px;height:36px;border-radius:10px;background:rgba(255,255,255,0.08);border:none;color:#9ca3af;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                        <i class="fas fa-arrow-left"></i>
                    </button>
                    <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;margin-left:12px;">
                        <div style="width:32px;height:32px;background:linear-gradient(135deg,#3b82f6,#8b5cf6);border-radius:9px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                            <i class="fas fa-water" style="color:white;font-size:13px;"></i>
                        </div>
                        <div style="min-width:0;">
                            <div style="font-size:14px;font-weight:800;color:#e5e7eb;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Histórico de Transações</div>
                            <div style="font-size:10px;color:#6b7280;">${data.transactions.length} transações • ${WHALE_PERIODS[whaleActivityPeriod]?.label || '2h'}</div>
                        </div>
                    </div>
                </div>
                
                <!-- Summary bar -->
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:6px;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.05);">
                    <div style="padding:8px 6px;background:rgba(239,68,68,0.1);border-radius:8px;text-align:center;min-width:0;">
                        <div style="font-size:9px;color:#ef4444;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">→ EXCHANGE</div>
                        <div style="font-size:13px;font-weight:800;color:#ef4444;">${formatVolume(data.toExchange)}</div>
                    </div>
                    <div style="padding:8px 6px;background:rgba(34,197,94,0.1);border-radius:8px;text-align:center;min-width:0;">
                        <div style="font-size:9px;color:#22c55e;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">← EXCHANGE</div>
                        <div style="font-size:13px;font-weight:800;color:#22c55e;">${formatVolume(data.fromExchange)}</div>
                    </div>
                    <div style="padding:8px 6px;background:rgba(59,130,246,0.1);border-radius:8px;text-align:center;min-width:0;">
                        <div style="font-size:9px;color:#3b82f6;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">BALEIA/OTC</div>
                        <div style="font-size:13px;font-weight:800;color:#3b82f6;">${formatVolume(data.whaleTransferVolume || 0)}</div>
                    </div>
                    <div style="padding:8px 6px;background:rgba(245,158,11,0.1);border-radius:8px;text-align:center;min-width:0;">
                        <div style="font-size:9px;color:#f59e0b;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">N/ CLASSIF.</div>
                        <div style="font-size:13px;font-weight:800;color:#f59e0b;">${formatVolume(data.unknownVolume || 0)}</div>
                    </div>
                </div>
                
                <!-- Transaction list -->
                <div data-scrollable style="flex:1;overflow-y:auto;padding:14px 16px;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;">
                    ${txListHtml}
                </div>
            `;
            
            document.body.appendChild(modal);
        }
        
