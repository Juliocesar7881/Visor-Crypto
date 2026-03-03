        // ============================================
        // CAPACITOR PLUGINS SETUP
        // ============================================
        // Função para obter o plugin ScreenOrientation de forma robusta
        async function getScreenOrientationPlugin() {
            // Método 1: Via Capacitor.Plugins (Capacitor 3+)
            if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.ScreenOrientation) {
                return window.Capacitor.Plugins.ScreenOrientation;
            }
            // Método 2: Registrar o plugin manualmente
            if (window.Capacitor && window.Capacitor.registerPlugin) {
                const ScreenOrientation = window.Capacitor.registerPlugin('ScreenOrientation');
                return ScreenOrientation;
            }
            return null;
        }
        
        // Função para travar orientação em landscape
        async function lockLandscape() {
            try {
                const plugin = await getScreenOrientationPlugin();
                if (plugin) {
                    await plugin.lock({ orientation: 'landscape' });
                    return true;
                }
            } catch (e) {
            }
            return false;
        }
        
        // Função para travar orientação em portrait
        async function lockPortrait() {
            try {
                const plugin = await getScreenOrientationPlugin();
                if (plugin) {
                    await plugin.lock({ orientation: 'portrait' });
                    return true;
                }
            } catch (e) {
            }
            return false;
        }
        
        // ============================================
        // POLYFILL - AbortSignal.timeout para Android WebView
        // ============================================
        if (!AbortSignal.timeout) {
            AbortSignal.timeout = function(ms) {
                const controller = new AbortController();
                setTimeout(() => controller.abort(), ms);
                return controller.signal;
            };
        }
        
        // Helper function para fetch com timeout (mais compatível)
        function fetchWithTimeout(url, options = {}, timeout = 5000) {
            return new Promise((resolve, reject) => {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => {
                    controller.abort();
                    reject(new Error('Timeout'));
                }, timeout);
                
                fetch(url, { ...options, signal: controller.signal })
                    .then(response => {
                        clearTimeout(timeoutId);
                        resolve(response);
                    })
                    .catch(err => {
                        clearTimeout(timeoutId);
                        reject(err);
                    });
            });
        }

        // ============================================
        // CRYPTO DEFINITIONS
        // ============================================
        const CRYPTO_DATABASE = {
            'BTCUSDT': { name: 'Bitcoin', short: 'BTC', img: 'https://assets.coingecko.com/coins/images/1/small/bitcoin.png', category: 'layer1', color: '#F7931A', cgId: 'bitcoin' },
            'ETHUSDT': { name: 'Ethereum', short: 'ETH', img: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png', category: 'layer1', color: '#627EEA', cgId: 'ethereum' },
            'SOLUSDT': { name: 'Solana', short: 'SOL', img: 'https://assets.coingecko.com/coins/images/4128/small/solana.png', category: 'layer1', color: '#00FFA3', cgId: 'solana' },
            'BNBUSDT': { name: 'BNB', short: 'BNB', img: 'https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png', category: 'layer1', color: '#F0B90B', cgId: 'binancecoin' },
            'XRPUSDT': { name: 'XRP', short: 'XRP', img: 'https://assets.coingecko.com/coins/images/44/small/xrp-symbol-white-128.png', category: 'layer1', color: '#23292F', cgId: 'ripple' },
            'ADAUSDT': { name: 'Cardano', short: 'ADA', img: 'https://assets.coingecko.com/coins/images/975/small/cardano.png', category: 'layer1', color: '#0033AD', cgId: 'cardano' },
            'AVAXUSDT': { name: 'Avalanche', short: 'AVAX', img: 'https://assets.coingecko.com/coins/images/12559/small/Avalanche_Circle_RedWhite_Trans.png', category: 'layer1', color: '#E84142', cgId: 'avalanche-2' },
            'DOGEUSDT': { name: 'Dogecoin', short: 'DOGE', img: 'https://assets.coingecko.com/coins/images/5/small/dogecoin.png', category: 'meme', color: '#C2A633', cgId: 'dogecoin' },
            'SHIBUSDT': { name: 'Shiba Inu', short: 'SHIB', img: 'https://assets.coingecko.com/coins/images/11939/small/shiba.png', category: 'meme', color: '#FFA409', cgId: 'shiba-inu' },
            'PEPEUSDT': { name: 'Pepe', short: 'PEPE', img: 'https://assets.coingecko.com/coins/images/29850/small/pepe-token.jpeg', category: 'meme', color: '#4DAF50', cgId: 'pepe' },
            'LINKUSDT': { name: 'Chainlink', short: 'LINK', img: 'https://assets.coingecko.com/coins/images/877/small/chainlink-new-logo.png', category: 'defi', color: '#2A5ADA', cgId: 'chainlink' },
            'UNIUSDT': { name: 'Uniswap', short: 'UNI', img: 'https://assets.coingecko.com/coins/images/12504/small/uni.jpg', category: 'defi', color: '#FF007A', cgId: 'uniswap' },
            'AAVEUSDT': { name: 'Aave', short: 'AAVE', img: 'https://assets.coingecko.com/coins/images/12645/small/AAVE.png', category: 'defi', color: '#B6509E', cgId: 'aave' },
            'DOTUSDT': { name: 'Polkadot', short: 'DOT', img: 'https://assets.coingecko.com/coins/images/12171/small/polkadot.png', category: 'layer1', color: '#E6007A', cgId: 'polkadot' },
            'LTCUSDT': { name: 'Litecoin', short: 'LTC', img: 'https://assets.coingecko.com/coins/images/2/small/litecoin.png', category: 'layer1', color: '#345D9D', cgId: 'litecoin' },
            'ATOMUSDT': { name: 'Cosmos', short: 'ATOM', img: 'https://assets.coingecko.com/coins/images/1481/small/cosmos_hub.png', category: 'layer1', color: '#2E3148', cgId: 'cosmos' },
            'NEARUSDT': { name: 'NEAR', short: 'NEAR', img: 'https://assets.coingecko.com/coins/images/10365/small/near.jpg', category: 'layer1', color: '#00C08B', cgId: 'near' },
            'RENDERUSDT': { name: 'Render', short: 'RNDR', img: 'https://assets.coingecko.com/coins/images/11636/small/rndr.png', category: 'ai', color: '#FF6B6B', cgId: 'render-token' },
            'FETUSDT': { name: 'Fetch.ai', short: 'FET', img: 'https://assets.coingecko.com/coins/images/5681/small/Fetch.jpg', category: 'ai', color: '#3DD598', cgId: 'fetch-ai' },
            'ZECUSDT': { name: 'Zcash', short: 'ZEC', img: 'https://assets.coingecko.com/coins/images/486/small/circle-zcash-color.png', category: 'privacy', color: '#F4B728', cgId: 'zcash' },
            'BCHUSDT': { name: 'Bitcoin Cash', short: 'BCH', img: 'https://assets.coingecko.com/coins/images/780/small/bitcoin-cash-circle.png', category: 'layer1', color: '#8DC351', cgId: 'bitcoin-cash' },
            'SUIUSDT': { name: 'SUI', short: 'SUI', img: 'https://assets.coingecko.com/coins/images/26375/small/sui-ocean-square.png', category: 'layer1', color: '#4DA2FF', cgId: 'sui' }
        };

        let selectedCryptos = Object.keys(CRYPTO_DATABASE); // Todas as criptos
        let priceSocket = null;
        let prices = {};
        let priceChanges = {};
        let previousPrices = {};
        let currentOrderbookSymbol = 'BTCUSDT';
        let newsFilter = 'all';
        let allNews = [];
        let aiClassifiedNews = []; // AI-classified news from backend
        let aiNewsLoaded = false;  // Whether backend AI news was successfully loaded
        const NEWS_BACKEND_URL = 'https://visor-crypto-api.onrender.com/api';
        let translationCache = {}; // Cache de traduções
        let translationQueue = []; // Fila de traduções
        let isTranslating = false;
        let newsLastFetch = 0; // Timestamp da última busca de notícias
        let newsLoaded = false; // Flag para saber se notícias já foram carregadas
        let macroUpdateInterval = null; // Intervalo para atualização em tempo real do MACRO
        let isRenderingNews = false; // Flag para evitar renderizações simultâneas
        let whaleActivity = { level: 'neutral', percentage: 0, largeTrades: 0, totalTrades: 0 }; // Atividade de baleias



        // ============================================
        // SECURITY FUNCTIONS
        // ============================================
        
        // Sanitizar texto para prevenir XSS
        function sanitizeHTML(str) {
            if (!str) return '';
            const div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        }
        
        // v7.1: Safe display utility — prevents "undefined", "NaN", "null" from showing in UI
        function safeDisplay(value, fallback = '—', decimals = null) {
            if (value === undefined || value === null || value === '' || (typeof value === 'number' && isNaN(value))) {
                return fallback;
            }
            if (decimals !== null && typeof value === 'number') {
                return value.toFixed(decimals);
            }
            return String(value);
        }

        // v7.1: Safe number display with unit
        function safeNum(value, decimals = 2, prefix = '', suffix = '') {
            if (value === undefined || value === null || isNaN(value)) return '—';
            return prefix + Number(value).toFixed(decimals) + suffix;
        }

        // v7.1: Collapsible panel toggle
        function togglePanel(panelId) {
            const header = document.querySelector(`[data-panel="${panelId}"]`);
            if (!header) return;
            const body = header.nextElementSibling;
            if (!body) return;
            const isCollapsed = header.classList.toggle('collapsed');
            body.classList.toggle('collapsed', isCollapsed);
            // Save state to localStorage
            try {
                const states = JSON.parse(localStorage.getItem('vc4_panel_states') || '{}');
                states[panelId] = isCollapsed;
                localStorage.setItem('vc4_panel_states', JSON.stringify(states));
            } catch(e) {}
        }

        // v7.1: Restore panel states on load
        function restorePanelStates() {
            try {
                const states = JSON.parse(localStorage.getItem('vc4_panel_states') || '{}');
                Object.entries(states).forEach(([panelId, isCollapsed]) => {
                    if (isCollapsed) {
                        const header = document.querySelector(`[data-panel="${panelId}"]`);
                        if (header) {
                            header.classList.add('collapsed');
                            const body = header.nextElementSibling;
                            if (body) body.classList.add('collapsed');
                        }
                    }
                });
            } catch(e) {}
        }

        // v7.1: Auto-initialize collapsible panels after analysis render
        function initCollapsiblePanels(container) {
            if (!container) return;
            const headers = container.querySelectorAll('.ta-section-header');
            headers.forEach((header, idx) => {
                // Skip if already initialized
                if (header.dataset.panel) return;
                // Get panel title for stable ID
                const titleEl = header.querySelector('.ta-section-title');
                const title = titleEl ? titleEl.textContent.trim().toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 30) : `panel_${idx}`;
                header.dataset.panel = title;
                header.classList.add('collapsible');
                // Wrap content after header in a body div
                const section = header.closest('.ta-section');
                if (section) {
                    const siblings = [];
                    let next = header.nextElementSibling;
                    while (next) {
                        siblings.push(next);
                        next = next.nextElementSibling;
                    }
                    if (siblings.length > 0) {
                        const body = document.createElement('div');
                        body.className = 'ta-section-body';
                        siblings.forEach(s => body.appendChild(s));
                        section.appendChild(body);
                    }
                }
                // Click handler
                header.addEventListener('click', (e) => {
                    e.stopPropagation();
                    togglePanel(title);
                });
            });
            // Restore saved states
            restorePanelStates();
        }
        
        // Validar URL para prevenir javascript: e outros esquemas maliciosos
        function isValidURL(url) {
            if (!url) return false;
            try {
                const parsed = new URL(url);
                return ['http:', 'https:'].includes(parsed.protocol);
            } catch (e) {
                return false;
            }
        }
        
        // Abrir link externo de forma segura
        function openExternalLink(url) {
            if (!isValidURL(url)) {
                return;
            }
            // Usar noopener e noreferrer para segurança
            window.open(url, '_blank', 'noopener,noreferrer');
        }