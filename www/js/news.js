        // ============================================
        // NEWS MODAL FUNCTIONS
        // ============================================
        
        // Shorten verbose source names to just the domain/brand
        function shortenSource(source) {
            if (!source) return '';
            // Try to extract domain-like name (e.g. "investing.com Crypto opinion and analysis" → "investing.com")
            const domainMatch = source.match(/^([\w.-]+\.(?:com|io|co|org|net|news|xyz))/i);
            if (domainMatch) return domainMatch[1];
            // For multi-word names, keep first 2-3 words max
            const words = source.split(/\s+/);
            if (words.length > 3) return words.slice(0, 2).join(' ');
            return source;
        }

        const NEWS_SOURCE_DOMAIN_MAP = Object.freeze({
            'cointelegraph': 'cointelegraph.com',
            'coindesk': 'coindesk.com',
            'decrypt': 'decrypt.co',
            'cryptoslate': 'cryptoslate.com',
            'bitcoin magazine': 'bitcoinmagazine.com',
            'the block': 'theblock.co',
            'the defiant': 'thedefiant.io',
            'beincrypto': 'beincrypto.com',
            'cryptonews': 'cryptonews.com',
            'cryptocompare': 'cryptocompare.com',
            'cryptopanic': 'cryptopanic.com',
            'reuters': 'reuters.com',
            'bbc': 'bbc.com'
        });

        const NEWS_SOURCE_DIRECT_LOGO_MAP = Object.freeze({
            'cointelegraph.com': 'https://cointelegraph.com/favicon.svg'
        });

        function _extractDomainFromUrl(rawUrl) {
            const url = String(rawUrl || '').trim();
            if (!url) return '';
            try {
                const withScheme = /^https?:\/\//i.test(url) ? url : `https://${url}`;
                const parsed = new URL(withScheme);
                return parsed.hostname.replace(/^www\./i, '').toLowerCase();
            } catch (_) {
                return '';
            }
        }

        function _resolveDomainFromSource(sourceText) {
            const source = String(sourceText || '').trim().toLowerCase();
            if (!source) return '';

            for (const [key, domain] of Object.entries(NEWS_SOURCE_DOMAIN_MAP)) {
                if (source.includes(key)) return domain;
            }

            const domainLike = source.match(/([a-z0-9.-]+\.(?:com|io|co|org|net|news|xyz))/i);
            return domainLike ? domainLike[1].toLowerCase() : '';
        }

        function _isUsableNewsImageUrl(rawUrl) {
            const url = String(rawUrl || '').trim();
            if (!url) return false;
            if (typeof isValidURL === 'function') return isValidURL(url);
            return /^https?:\/\//i.test(url);
        }

        function _normalizeNewsUrl(rawUrl) {
            const url = String(rawUrl || '').trim();
            if (!url) return '';
            try {
                const parsed = new URL(url);
                parsed.hash = '';
                Array.from(parsed.searchParams.keys()).forEach((key) => {
                    const lowerKey = key.toLowerCase();
                    if (
                        lowerKey.startsWith('utm_') ||
                        ['fbclid', 'gclid', 'mc_cid', 'mc_eid', 'ref', 'ref_src'].includes(lowerKey)
                    ) {
                        parsed.searchParams.delete(key);
                    }
                });
                parsed.searchParams.sort();
                return parsed.toString().replace(/\/$/, '').toLowerCase();
            } catch (_) {
                return url.split('#')[0].replace(/\/$/, '').toLowerCase();
            }
        }

        function _copyBestNewsImage(target, source) {
            if (!target || !source) return false;
            const candidateImage = String(source.image || '').trim().replace(/&amp;/g, '&');
            if (!_isUsableNewsImageUrl(candidateImage)) return false;
            if (_isUsableNewsImageUrl(target.image)) return false;
            target.image = candidateImage;
            return true;
        }

        function getSourceLogoUrl(news) {
            const fromUrl = _extractDomainFromUrl(news?.url || '');
            const fromSource = _resolveDomainFromSource(news?.source || '');
            const domain = fromUrl || fromSource;
            if (!domain) return '';

            const directLogo = NEWS_SOURCE_DIRECT_LOGO_MAP[domain] || NEWS_SOURCE_DIRECT_LOGO_MAP[fromSource];
            if (directLogo) return directLogo;

            return `https://www.google.com/s2/favicons?sz=256&domain_url=${encodeURIComponent(`https://${domain}`)}`;
        }

        function _isCointelegraphNews(news) {
            const sourceText = `${news?.source || ''} ${news?.url || ''}`.toLowerCase();
            return sourceText.includes('cointelegraph');
        }

        function getNewsSourceFallbackHtml(news, options = {}) {
            const {
                display = 'flex',
                compact = true,
                iconClass = 'fa-newspaper'
            } = options;
            const sourceLogoUrl = getSourceLogoUrl(news);
            const isCointelegraph = _isCointelegraphNews(news);
            const sourceLabel = sanitizeHTML(shortenSource(news?.source || (isCointelegraph ? 'Cointelegraph' : 'Fonte')));
            const badgeText = isCointelegraph ? 'CT' : 'NEWS';
            const gap = compact ? '4px' : '12px';
            const logoSize = compact ? '56px' : '96px';
            const badgeSize = compact ? '52px' : '82px';
            const badgeFont = compact ? '17px' : '28px';
            const badgeBg = isCointelegraph
                ? 'linear-gradient(135deg, #facc15, #f59e0b)'
                : 'linear-gradient(135deg, #2563eb, #7c3aed)';
            const logoWidth = isCointelegraph && compact ? '100%' : logoSize;
            const logoHeight = isCointelegraph && compact ? '100%' : logoSize;
            const logoMax = isCointelegraph && compact ? '100%' : '72%';
            const logoFit = isCointelegraph && compact ? 'cover' : 'contain';
            const logoRadius = isCointelegraph && compact ? '0' : '12px';

            if (sourceLogoUrl) {
                return `
                    <div style="display:${display}; flex-direction: column; align-items: center; justify-content: center; width: 100%; height: 100%; gap: ${gap}; background: linear-gradient(135deg, rgba(15,23,42,0.94), rgba(30,41,59,0.96));">
                        <img src="${sanitizeHTML(sourceLogoUrl)}" alt="" loading="lazy" decoding="async" style="width: ${logoWidth}; height: ${logoHeight}; max-width: ${logoMax}; max-height: ${logoMax}; object-fit: ${logoFit}; border-radius: ${logoRadius}; background: transparent; padding: 0;" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                        <div style="display:none; align-items:center; justify-content:center; width:${badgeSize}; height:${badgeSize}; max-width:72%; max-height:72%; border-radius: 14px; background:${badgeBg}; color: #111827; font-weight: 900; font-size: ${badgeFont}; letter-spacing: 0;">${badgeText}</div>
                        ${compact ? '' : `<span style="font-size: 13px; font-weight: 700; color: #dbeafe;">${sourceLabel}</span>`}
                    </div>
                `;
            }

            return `
                <div style="display:${display}; flex-direction: column; align-items: center; justify-content: center; width: 100%; height: 100%; background: linear-gradient(135deg, rgba(15,23,42,0.94), rgba(30,41,59,0.96));">
                    <i class="fas ${iconClass}" style="font-size: ${compact ? '20px' : '54px'}; color: var(--accent-blue); opacity: 0.75;"></i>
                    ${compact ? '' : `<span style="margin-top: 12px; font-size: 13px; font-weight: 700; color: #dbeafe;">${sourceLabel}</span>`}
                </div>
            `;
        }

        function getNewsThumbHtml(news, thumbLoading = 'lazy', thumbPriority = 'low', iconClass = 'fa-newspaper') {
            const safeImageUrl = String(news?.image || '').trim().replace(/&amp;/g, '&');
            if (_isUsableNewsImageUrl(safeImageUrl)) {
                return `<div class="news-item-thumb"><img src="${sanitizeHTML(safeImageUrl)}" alt="" loading="${thumbLoading}" fetchpriority="${thumbPriority}" decoding="async" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">${getNewsSourceFallbackHtml(news, { display: 'none', compact: true, iconClass })}</div>`;
            }
            return `<div class="news-item-thumb">${getNewsSourceFallbackHtml(news, { compact: true, iconClass })}</div>`;
        }

        function getNewsModalImageHtml(news, iconClass = 'fa-newspaper') {
            const safeImageUrl = String(news?.image || '').trim().replace(/&amp;/g, '&');
            if (_isUsableNewsImageUrl(safeImageUrl)) {
                return `<img src="${sanitizeHTML(safeImageUrl)}" alt="Imagem da notícia" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">${getNewsSourceFallbackHtml(news, { display: 'none', compact: false, iconClass })}`;
            }
            return getNewsSourceFallbackHtml(news, { compact: false, iconClass });
        }

        // fetchSingleNewsImage — generate a fallback image based on title keywords
        async function fetchSingleNewsImage(news) {
            if (!news || news.image) return;
            // Keep marker for deferred fallback rendering on hot modal flow
            // We store a marker so renderHotNewsList can use it
            news._fallbackImage = true;
        }

        const _newsImageWarmCache = new Set();

        function warmNewsImageCache(items, limit = 12) {
            if (!Array.isArray(items) || typeof Image === 'undefined') return;

            const candidates = items
                .map((item) => String(item?.image || '').trim())
                .filter((url) => !!url && isValidURL(url))
                .slice(0, Math.max(1, limit));

            if (_newsImageWarmCache.size > 400) {
                _newsImageWarmCache.clear();
            }

            candidates.forEach((url) => {
                if (_newsImageWarmCache.has(url)) return;
                _newsImageWarmCache.add(url);
                try {
                    const img = new Image();
                    img.decoding = 'async';
                    img.src = url;
                } catch (_) {}
            });
        }
        
        // Mapa de criptomoedas para imagens
        const cryptoImages = {
            'bitcoin': { img: 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png', name: 'Bitcoin', color: '#F7931A' },
            'btc': { img: 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png', name: 'Bitcoin', color: '#F7931A' },
            'ethereum': { img: 'https://assets.coingecko.com/coins/images/279/large/ethereum.png', name: 'Ethereum', color: '#627EEA' },
            'eth': { img: 'https://assets.coingecko.com/coins/images/279/large/ethereum.png', name: 'Ethereum', color: '#627EEA' },
            'solana': { img: 'https://assets.coingecko.com/coins/images/4128/large/solana.png', name: 'Solana', color: '#9945FF' },
            'sol': { img: 'https://assets.coingecko.com/coins/images/4128/large/solana.png', name: 'Solana', color: '#9945FF' },
            'xrp': { img: 'https://assets.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png', name: 'XRP', color: '#23292F' },
            'ripple': { img: 'https://assets.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png', name: 'XRP', color: '#23292F' },
            'cardano': { img: 'https://assets.coingecko.com/coins/images/975/large/cardano.png', name: 'Cardano', color: '#0033AD' },
            'ada': { img: 'https://assets.coingecko.com/coins/images/975/large/cardano.png', name: 'Cardano', color: '#0033AD' },
            'dogecoin': { img: 'https://assets.coingecko.com/coins/images/5/large/dogecoin.png', name: 'Dogecoin', color: '#C2A633' },
            'doge': { img: 'https://assets.coingecko.com/coins/images/5/large/dogecoin.png', name: 'Dogecoin', color: '#C2A633' },
            'bnb': { img: 'https://assets.coingecko.com/coins/images/825/large/bnb-icon2_2x.png', name: 'BNB', color: '#F3BA2F' },
            'binance': { img: 'https://assets.coingecko.com/coins/images/825/large/bnb-icon2_2x.png', name: 'BNB', color: '#F3BA2F' },
            'polkadot': { img: 'https://assets.coingecko.com/coins/images/12171/large/polkadot.png', name: 'Polkadot', color: '#E6007A' },
            'dot': { img: 'https://assets.coingecko.com/coins/images/12171/large/polkadot.png', name: 'Polkadot', color: '#E6007A' },
            'avalanche': { img: 'https://assets.coingecko.com/coins/images/12559/large/Avalanche_Circle_RedWhite_Trans.png', name: 'Avalanche', color: '#E84142' },
            'avax': { img: 'https://assets.coingecko.com/coins/images/12559/large/Avalanche_Circle_RedWhite_Trans.png', name: 'Avalanche', color: '#E84142' },
            'chainlink': { img: 'https://assets.coingecko.com/coins/images/877/large/chainlink-new-logo.png', name: 'Chainlink', color: '#2A5ADA' },
            'link': { img: 'https://assets.coingecko.com/coins/images/877/large/chainlink-new-logo.png', name: 'Chainlink', color: '#2A5ADA' },
            'litecoin': { img: 'https://assets.coingecko.com/coins/images/2/large/litecoin.png', name: 'Litecoin', color: '#345D9D' },
            'ltc': { img: 'https://assets.coingecko.com/coins/images/2/large/litecoin.png', name: 'Litecoin', color: '#345D9D' },
            'shiba': { img: 'https://assets.coingecko.com/coins/images/11939/large/shiba.png', name: 'Shiba Inu', color: '#FFA409' },
            'shib': { img: 'https://assets.coingecko.com/coins/images/11939/large/shiba.png', name: 'Shiba Inu', color: '#FFA409' },
            'tron': { img: 'https://assets.coingecko.com/coins/images/1094/large/tron-logo.png', name: 'TRON', color: '#FF0013' },
            'trx': { img: 'https://assets.coingecko.com/coins/images/1094/large/tron-logo.png', name: 'TRON', color: '#FF0013' },
            'uniswap': { img: 'https://assets.coingecko.com/coins/images/12504/large/uniswap.png', name: 'Uniswap', color: '#FF007A' },
            'uni': { img: 'https://assets.coingecko.com/coins/images/12504/large/uniswap.png', name: 'Uniswap', color: '#FF007A' },
            'stellar': { img: 'https://assets.coingecko.com/coins/images/100/large/Stellar_symbol_black_RGB.png', name: 'Stellar', color: '#14B6E7' },
            'xlm': { img: 'https://assets.coingecko.com/coins/images/100/large/Stellar_symbol_black_RGB.png', name: 'Stellar', color: '#14B6E7' },
            'cosmos': { img: 'https://assets.coingecko.com/coins/images/1481/large/cosmos_hub.png', name: 'Cosmos', color: '#2E3148' },
            'atom': { img: 'https://assets.coingecko.com/coins/images/1481/large/cosmos_hub.png', name: 'Cosmos', color: '#2E3148' },
            'near': { img: 'https://assets.coingecko.com/coins/images/10365/large/near.jpg', name: 'NEAR', color: '#00C08B' },
            'pepe': { img: 'https://assets.coingecko.com/coins/images/29850/large/pepe-token.jpeg', name: 'Pepe', color: '#3E7A3E' },
            'sui': { img: 'https://assets.coingecko.com/coins/images/26375/large/sui-ocean-square.png', name: 'SUI', color: '#4DA2FF' },
            'aptos': { img: 'https://assets.coingecko.com/coins/images/26455/large/aptos_round.png', name: 'Aptos', color: '#4FDBCA' },
            'apt': { img: 'https://assets.coingecko.com/coins/images/26455/large/aptos_round.png', name: 'Aptos', color: '#4FDBCA' }
        };

        function getNewsImage(news) {
            // Se tem imagem real da notícia, usar ela - VALIDAR URL
            if (news.image && _isUsableNewsImageUrl(news.image)) {
                return getNewsModalImageHtml(news, 'fa-newspaper');
            }
            if (getSourceLogoUrl(news)) {
                return getNewsModalImageHtml(news, 'fa-newspaper');
            }
            
            return getNewsImageFallback(news.title);
        }
        
        function getNewsImageFallback(title) {
            const lowerTitle = title.toLowerCase();
            const foundCryptos = [];
            
            // Buscar criptomoedas mencionadas no título
            for (const [key, data] of Object.entries(cryptoImages)) {
                // Usar regex para encontrar palavra exata
                const regex = new RegExp(`\\b${key}\\b`, 'i');
                if (regex.test(lowerTitle) && !foundCryptos.find(c => c.name === data.name)) {
                    foundCryptos.push(data);
                }
            }
            
            // Se encontrou criptomoedas, mostrar as imagens delas
            if (foundCryptos.length > 0) {
                if (foundCryptos.length === 1) {
                    // Uma cripto: imagem grande centralizada
                    return `
                        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; height: 100%; background: linear-gradient(135deg, ${foundCryptos[0].color}22, ${foundCryptos[0].color}44);">
                            <img src="${foundCryptos[0].img}" style="width: 100px; height: 100px; border-radius: 50%; box-shadow: 0 8px 30px rgba(0,0,0,0.3);" onerror="this.style.display='none'">
                            <span style="margin-top: 12px; font-size: 16px; font-weight: 700; color: var(--text-primary);">${foundCryptos[0].name}</span>
                        </div>
                    `;
                } else {
                    // Múltiplas criptos: grid de imagens
                    const displayCryptos = foundCryptos.slice(0, 4);
                    return `
                        <div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 16px; width: 100%; height: 100%; padding: 20px; background: linear-gradient(135deg, var(--bg-elevated), var(--bg-card));">
                            ${displayCryptos.map(c => `
                                <div style="display: flex; flex-direction: column; align-items: center;">
                                    <img src="${c.img}" style="width: 60px; height: 60px; border-radius: 50%; box-shadow: 0 4px 15px rgba(0,0,0,0.3);" onerror="this.style.display='none'">
                                    <span style="margin-top: 8px; font-size: 11px; font-weight: 600; color: var(--text-secondary);">${c.name}</span>
                                </div>
                            `).join('')}
                        </div>
                    `;
                }
            }
            
            // Se é sobre ETF, SEC, regulamentação
            if (lowerTitle.includes('etf') || lowerTitle.includes('sec') || lowerTitle.includes('regulation') || lowerTitle.includes('government') || lowerTitle.includes('federal')) {
                return `
                    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; height: 100%; background: linear-gradient(135deg, #1a365d, #2d3748);">
                        <i class="fas fa-landmark" style="font-size: 60px; color: #63b3ed; margin-bottom: 12px;"></i>
                        <span style="font-size: 14px; font-weight: 600; color: #a0aec0;">Regulamentação</span>
                    </div>
                `;
            }
            
            // Se é sobre mercado em geral
            if (lowerTitle.includes('market') || lowerTitle.includes('trading') || lowerTitle.includes('price') || lowerTitle.includes('rally') || lowerTitle.includes('crash')) {
                return `
                    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; height: 100%; background: linear-gradient(135deg, #1a202c, #2d3748);">
                        <i class="fas fa-chart-line" style="font-size: 60px; color: var(--accent-blue); margin-bottom: 12px;"></i>
                        <span style="font-size: 14px; font-weight: 600; color: var(--text-secondary);">Mercado Cripto</span>
                    </div>
                `;
            }
            
            // Se é sobre exchange/corretora
            if (lowerTitle.includes('exchange') || lowerTitle.includes('coinbase') || lowerTitle.includes('kraken') || lowerTitle.includes('bybit')) {
                return `
                    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; height: 100%; background: linear-gradient(135deg, #1a202c, #2d3748);">
                        <i class="fas fa-exchange-alt" style="font-size: 60px; color: var(--accent-purple); margin-bottom: 12px;"></i>
                        <span style="font-size: 14px; font-weight: 600; color: var(--text-secondary);">Exchange</span>
                    </div>
                `;
            }
            
            // Default: ícone genérico de notícia
            return `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; height: 100%; background: linear-gradient(135deg, var(--bg-card), var(--bg-elevated));">
                    <i class="fas fa-newspaper" style="font-size: 60px; color: var(--accent-blue); margin-bottom: 12px;"></i>
                    <span style="font-size: 14px; font-weight: 600; color: var(--text-secondary);">Crypto News</span>
                </div>
            `;
        }

        function getNewsTitleForDisplay(news) {
            const translated = String(news?.translatedTitle || '').trim();
            if (translated) return translated;
            if (news?.translationFailed && !shouldRetryNewsTranslation(news)) return 'Titulo indisponivel em portugues';
            return '';
        }

        function shouldRetryNewsTranslation(news) {
            const failedAt = Number(news?.translationFailedAt || 0);
            return !failedAt || (Date.now() - failedAt) > 120000;
        }

        async function openNewsModal(newsUrl) {
            // Decode URL encoded in onclick handler
            try { newsUrl = decodeURIComponent(newsUrl); } catch(e) {}
            newsUrl = newsUrl.replace(/%27/g, "'");
            let news = allNews.find(n => n.url === newsUrl);
            // Fallback: buscar por URL normalizada
            if (!news) {
                const baseUrl = newsUrl.split('?')[0].split('#')[0].toLowerCase();
                news = allNews.find(n => n.url?.split('?')[0].split('#')[0].toLowerCase() === baseUrl);
            }
            if (!news) return;
            window.VisorMonetization?.recordAction('news_open').catch(() => {});
            
            // Guardar URL da notícia atual para reabrir após voltar do browser
            window.currentNewsUrl = newsUrl;
            
            const modal = document.getElementById('news-modal');
            const sentimentIcon = news.sentiment === 'positive' ? '<i class="fas fa-arrow-trend-up"></i>' : 
                                  '<i class="fas fa-arrow-trend-down"></i>';
            const sentimentText = news.sentiment === 'positive' ? 'Positiva' : 'Negativa';
            
            // Traduzir título se ainda não foi traduzido
            if (!news.translatedTitle && shouldRetryNewsTranslation(news)) {
                const translatedTitle = await translateText(news.title);
                if (translatedTitle) {
                    news.translatedTitle = translatedTitle;
                    news.translationFailed = false;
                    news.translationFailedAt = 0;
                } else {
                    news.translationFailed = false;
                    news.translationFailedAt = Date.now();
                }
            }
            const translatedTitle = getNewsTitleForDisplay(news) || 'Titulo indisponivel em portugues';
            
            // Gerar resumo em português
            const summary = generateNewsSummary(news, translatedTitle);
            
            // Calcular tempo
            const timeAgo = getTimeAgo(news.published);
            const publishedDate = new Date(news.published);
            const _m = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
            const shortDate = `${publishedDate.getDate()} ${_m[publishedDate.getMonth()]} ${String(publishedDate.getHours()).padStart(2,'0')}:${String(publishedDate.getMinutes()).padStart(2,'0')}`;
            
            // Atualizar modal
            document.getElementById('news-modal-source').textContent = news.source;
            document.getElementById('news-modal-sentiment').className = `news-modal-sentiment ${news.sentiment}`;
            document.getElementById('news-modal-sentiment').innerHTML = `${sentimentIcon} ${sentimentText}`;
            document.getElementById('news-modal-title').textContent = translatedTitle;
            document.getElementById('news-modal-summary').textContent = summary;
            document.getElementById('news-modal-time-text').textContent = `${timeAgo} \u2022 ${shortDate}`;
            document.getElementById('news-modal-button').onclick = () => {
                // NÃO fechar o modal - manter aberto para quando voltar
                openInAppBrowser(news.url, translatedTitle, newsUrl, false, null);
            };
            
            // Gerar imagem - usar imagem real se disponível
            const imageContainer = document.getElementById('news-modal-image');
            const newsImage = getNewsImage(news);
            imageContainer.innerHTML = newsImage;
            
            // Se não tem imagem, tentar buscar em background
            if (!news.image) {
                fetchSingleNewsImage(news).then(() => {
                    if (news.image) {
                        imageContainer.innerHTML = getNewsImage(news);
                    }
                });
            }
            
            // Mostrar modal
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
            
            // Fechar modal com ESC
            document.addEventListener('keydown', handleModalEsc);
        }

        function handleModalEsc(e) {
            if (e.key === 'Escape') {
                closeNewsModal();
            }
        }

        function closeNewsModal() {
            const modal = document.getElementById('news-modal');
            if (!modal) return;
            if (modal.classList.contains('closing')) return;

            modal.classList.add('closing');
            setTimeout(() => {
                modal.classList.remove('active', 'closing');
                document.body.style.overflow = '';
                document.removeEventListener('keydown', handleModalEsc);
            }, 260);
        }

        function generateNewsSummary(news, translatedTitle) {
            const sentiment = news.sentiment;
            const source = news.source;
            const title = translatedTitle.toLowerCase();
            
            // Detectar criptomoedas mencionadas
            const cryptos = [];
            if (title.includes('bitcoin') || title.includes('btc')) cryptos.push('Bitcoin');
            if (title.includes('ethereum') || title.includes('eth')) cryptos.push('Ethereum');
            if (title.includes('solana') || title.includes('sol')) cryptos.push('Solana');
            if (title.includes('bnb') || title.includes('binance')) cryptos.push('BNB');
            if (title.includes('xrp') || title.includes('ripple')) cryptos.push('XRP');
            if (title.includes('cardano') || title.includes('ada')) cryptos.push('Cardano');
            
            // Detectar temas
            const themes = [];
            if (title.includes('etf')) themes.push('ETF');
            if (title.includes('sec') || title.includes('regulação') || title.includes('regulation')) themes.push('regulamentação');
            if (title.includes('preço') || title.includes('price')) themes.push('movimento de preço');
            if (title.includes('mercado') || title.includes('market')) themes.push('tendência de mercado');
            if (title.includes('whale') || title.includes('baleia')) themes.push('movimentação de baleias');
            
            // Construir resumo dinâmico
            let intro = '';
            if (sentiment === 'positive') {
                intro = 'Notícia com viés positivo para o mercado cripto.';
            } else if (sentiment === 'negative') {
                intro = 'Notícia que requer atenção dos investidores.';
            } else {
                intro = 'Informação relevante sobre o mercado de criptomoedas.';
            }
            
            let cryptoMention = cryptos.length > 0 
                ? ` Criptomoedas mencionadas: ${cryptos.join(', ')}.`
                : '';
            
            let themeMention = themes.length > 0
                ? ` Temas abordados: ${themes.join(', ')}.`
                : '';
            
            const sourceInfo = `\n\nFonte: ${source}. Recomendamos verificar a notícia original para detalhes completos e tomar decisões de investimento com cautela.`;
            
            return `${intro}${cryptoMention}${themeMention}${sourceInfo}`;
        }

        // ============================================
        // NEWS - Múltiplas APIs com fallback robusto
        // ============================================
        let newsRetryCount = 0;
        const MAX_NEWS_RETRIES = 5;
        let newsFetchInProgress = false;
        let newsFetchState = 'idle'; // idle | fetching | ready | error
        const NEWS_INITIAL_TRANSLATE_COUNT = 48;
        const NEWS_INITIAL_RENDER_LIMIT = 80;
        const NEWS_FULL_RENDER_LIMIT = 200;
        let newsFullRenderTimer = null;

        function runNewsWhenIdle(fn, timeout = 2500) {
            if (typeof requestIdleCallback === 'function') {
                requestIdleCallback(() => fn(), { timeout });
                return;
            }
            setTimeout(fn, 300);
        }

        function scheduleNewsFullRender() {
            if (newsFullRenderTimer || newsFilter === 'hot') return;
            newsFullRenderTimer = setTimeout(() => {
                newsFullRenderTimer = null;
                try { renderNews({ full: true, skipBackgroundTranslation: true }); } catch (_) {}
            }, 350);
        }

        function scheduleNewsBackgroundTranslation() {
            if (window._newsTranslationScheduled || newsFilter === 'hot') return;
            const hasPending = allNews.some(n => !n.translatedTitle && shouldRetryNewsTranslation(n));
            if (!hasPending) return;

            window._newsTranslationScheduled = true;
            runNewsWhenIdle(() => {
                preTranslateNews()
                    .then(() => {
                        window._newsTranslationScheduled = false;
                        if (newsFilter !== 'hot') renderNews({ full: true, skipBackgroundTranslation: true });
                    })
                    .catch(() => { window._newsTranslationScheduled = false; });
            }, 5000);
        }

        const COINTELEGRAPH_MAX_GENERAL_ITEMS = 16;
        const COINTELEGRAPH_IMPORTANT_KEYWORDS = [
            'sec', 'cftc', 'doj', 'court', 'lawsuit', 'sues', 'charges', 'charged',
            'sentence', 'sentenced', 'prison', 'fraud', 'scam', 'hack', 'exploit',
            'freeze', 'frozen', 'seize', 'sanction', 'sanctions', 'regulation',
            'regulator', 'ban', 'banned', 'approval', 'approved', 'etf', 'inflow',
            'outflow', 'blackrock', 'fidelity', 'grayscale', 'microstrategy',
            'fed', 'fomc', 'rate cut', 'rate hike', 'stablecoin', 'tether', 'circle',
            'treasury', 'senate', 'congress', 'bill', 'lawmakers', 'authorities',
            'government', 'bankruptcy', 'prediction market', 'prediction markets',
            'polymarket', 'kalshi', 'brazil', 'iran', 'china', 'russia'
        ];
        const COINTELEGRAPH_NOISE_PATTERNS = [
            /\b(trader|traders|analyst|analysts)\b.{0,40}\b(eye|eyes|target|predict|forecast|seek|watch)\b/i,
            /\bmay\s+(rise|fall|drop|gain|rally|surge|jump)\b/i,
            /\bcould\s+(rise|fall|drop|gain|rally|surge|jump|hit|reach)\b/i,
            /\bprice\s+(prediction|analysis|target|forecast)\b/i,
            /\bnext\s+\$?\d/i,
            /\b\$\d[\d,.]*\s*(next|target|price)\b/i,
            /\bholds?\s+price\s+hostage\b/i,
            /\bwhat happened in crypto today\b/i,
            /\bhere'?s what happened\b/i
        ];

        function _isImportantCointelegraphNews(news) {
            if (!_isCointelegraphNews(news)) return true;
            const title = String(news?.title || news?.translatedTitle || '');
            if (!title.trim()) return false;
            if (COINTELEGRAPH_NOISE_PATTERNS.some((pattern) => pattern.test(title))) return false;
            return true;
        }

        function _applyCointelegraphVolumeLimit(items) {
            let cointelegraphCount = 0;
            return items.filter((news) => {
                if (!_isCointelegraphNews(news)) return true;
                if (!_isImportantCointelegraphNews(news)) return false;
                const alwaysKeep = news?.isHotNews === true || Number(news?.aiScore || 0) >= 70;
                if (alwaysKeep) return true;
                if (cointelegraphCount >= COINTELEGRAPH_MAX_GENERAL_ITEMS) return false;
                cointelegraphCount++;
                return true;
            });
        }

        function _newsTitleWords(title) {
            return String(title || '')
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .toLowerCase()
                .replace(/[^a-z0-9\s]/g, ' ')
                .split(/\s+/)
                .filter(word => word.length > 3)
                .slice(0, 10);
        }

        function _newsTitleBucketKeys(title) {
            const words = _newsTitleWords(title);
            if (!words.length) return [];
            const keys = new Set();
            keys.add(words.slice(0, 2).join('|'));
            keys.add(words[0]);
            if (words[1]) keys.add(words[1]);
            return Array.from(keys).filter(Boolean);
        }

        function _addNewsTitleBucket(buckets, title, entry) {
            _newsTitleBucketKeys(title).forEach(key => {
                if (!buckets.has(key)) buckets.set(key, []);
                buckets.get(key).push(entry);
            });
        }

        function _findSimilarNewsInBuckets(buckets, title, threshold = 0.5) {
            const seen = new Set();
            for (const key of _newsTitleBucketKeys(title)) {
                const candidates = buckets.get(key) || [];
                for (const candidate of candidates) {
                    if (!candidate || seen.has(candidate)) continue;
                    seen.add(candidate);
                    if (titleSimilarity(title, candidate.title) > threshold) return candidate;
                }
            }
            return null;
        }
        
        function mergeNews(newItems) {
            const incomingItems = Array.isArray(newItems) ? newItems.filter(Boolean) : [];
            const existingUrlMap = new Map();
            allNews.forEach(news => {
                const key = _normalizeNewsUrl(news.url) || news.url;
                if (key) existingUrlMap.set(key, news);
            });

            // Antes de descartar duplicatas, aproveitar imagens reais que chegam depois via RSS/backend.
            incomingItems.forEach(item => {
                const itemUrlKey = _normalizeNewsUrl(item.url);
                if (!itemUrlKey) return;
                const existing = existingUrlMap.get(itemUrlKey);
                if (existing) _copyBestNewsImage(existing, item);
            });

            // Criar um Set de URLs existentes para evitar duplicatas
            const existingUrls = new Set(existingUrlMap.keys());
            
            // Filtrar apenas notícias novas
            const uniqueNew = incomingItems.filter(item => {
                const itemUrl = _normalizeNewsUrl(item.url) || item.url;
                return !existingUrls.has(itemUrl);
            });

            // Filtrar propagandas de corretoras e plataformas de investimento
            const _adPatterns = [
                /investimento.{0,10}inteligente/i,
                /investimento.{0,10}come[cç]a/i,
                /abra\s+sua\s+conta/i,
                /open\s+your\s+account/i,
                /cadastre[- ]se/i,
                /sign\s+up\s+(now|today|free)/i,
                /comece\s+a\s+investir/i,
                /start\s+trading/i,
                /start\s+investing/i,
                /promo(tion|\u00e7[aã]o|\b)/i,
                /b[oô]nus\s+(de\s+)?\$?\d/i,
                /bonus.*deposit/i,
                /deposit.*bonus/i,
                /ganhe\s+(at[eé]|r\$|\$)/i,
                /earn\s+up\s+to/i,
                /zero\s+(taxa|fee)/i,
                /taxa\s+zero/i,
                /patrocinado/i,
                /sponsored/i,
                /parceiro|partner(ship)?/i,
                /cupom|coupon|voucher/i,
                /desconto.*%/i,
                /\d+%.*off/i,
                /refer(ral|ência|\s+a\s+friend)/i,
                /convide.*ganhe/i,
                /invite.*earn/i,
                /baixe\s+o\s+app/i,
                /download.*(app|now)/i,
                /best\s+(crypto\s+)?exchange/i,
                /melhor\s+(corretora|exchange)/i,
                /ganhar\s+(juros|renda|rendimento)/i,
                /earn\s+(interest|yield|passive)/i,
                /put\s+your\s+(crypto|money)\s+to\s+work/i,
                /colocar\s+(sua\s+)?(cripto|criptografia)\s+para\s+funcionar/i,
                /passive\s+income/i,
                /renda\s+passiva/i,
                /staking.*reward/i,
                /reward.*stak/i,
                /lending.*platform/i,
                /plataforma.*(empr[eé]stimo|lending)/i,
                /how\s+to\s+(buy|invest|earn|stake|start)/i,
                /como\s+(comprar|investir|ganhar|come[cç]ar)/i,
                /melhores.{0,15}(plataforma|corretora|app|carteira)/i,
                /best.{0,15}(platform|broker|wallet|app)/i,
                /top\s+\d+.{0,10}(exchange|platform|broker|wallet)/i,
                /apy|apr.*%/i,
                /\d+\.?\d*%\s*(apy|apr|yield|juros|interest)/i,
                /high.{0,5}yield/i,
                /alto.{0,5}rendimento/i,
                /free\s+(crypto|bitcoin|token|coin)/i,
                /cripto\s+gr[aá]tis/i,
                /bitcoin\s+gr[aá]tis/i,
                /copy\s*trad/i,
                /rob[oô]\s*(trader|trad)/i,
                /auto.*trad/i,
                /social\s+trading/i,
                /margin.*trad/i,
                /alavancagem.*\dx/i,
                /leverage.*\dx/i,
                /taxa.{0,5}(mais\s+)?baix/i,
                /low(est)?\s+fee/i
            ];
            function _isAdNews(title) {
                if (!title) return false;
                return _adPatterns.some(p => p.test(title));
            }
            const cleanNew = uniqueNew.filter(item => (
                !_isAdNews(item.title) &&
                !_isAdNews(item.translatedTitle) &&
                _isImportantCointelegraphNews(item)
            ));

            const existingTitleBuckets = new Map();
            allNews.forEach(news => {
                const title = news.translatedTitle || news.title || '';
                if (title) _addNewsTitleBucket(existingTitleBuckets, title, { news, title });
            });
            
            // DEDUPLICAR POR SIMILARIDADE DE TÍTULO — mesma notícia de fontes diferentes
            // Mantém a que foi publicada primeiro (mais antiga)
            const dedupedNew = cleanNew.filter(item => {
                const itemTitle = item.translatedTitle || item.title || '';
                // Checar contra notícias já existentes em allNews
                const similarExisting = _findSimilarNewsInBuckets(existingTitleBuckets, itemTitle, 0.5);
                if (similarExisting) {
                    _copyBestNewsImage(similarExisting.news, item);
                    return false;
                }
                if (itemTitle) _addNewsTitleBucket(existingTitleBuckets, itemTitle, { news: item, title: itemTitle });
                return true;
            });
            
            // MARCAR NOTÍCIAS IMPORTANTES IMEDIATAMENTE ao adicionar
            dedupedNew.forEach(news => {
                const hotCheck = isHotNews(news.title);
                if (hotCheck.isHot) {
                    news.isHotNews = true;
                    news.hotCategory = hotCheck.category;
                    news.hotKeyword = hotCheck.keyword;
                }
            });
            
            // Filtro Bitcoin World: remover notícias de baixa relevância desta fonte
            const _bwHighRelevanceKW = [
                'SEC', 'ETF', 'Fed', 'FOMC', 'regulation', 'regulação', 'ban', 'approval',
                'aprovação', 'institutional', 'hack', 'exploit', 'exchange', 'bankruptcy',
                'falência', 'lawsuit', 'processo', 'treasury', 'legislation', 'lei', 'CBDC',
                'stablecoin', 'BlackRock', 'Fidelity', 'Grayscale', 'MicroStrategy',
                'government', 'governo', 'sanction', 'sanção'
            ];
            const _filteredClean = dedupedNew.filter(news => {
                const src = (news.source || '').toLowerCase();
                if (!src.includes('bitcoin world')) return true; // outras fontes passam
                if (news.isHotNews) return true; // relevantes sempre passam
                if (news.sentiment === 'neutral') return true; // neutras passam
                // Positivas/negativas da Bitcoin World: exigir keyword de alta relevância
                const title = (news.title || '') + ' ' + (news.translatedTitle || '');
                return _bwHighRelevanceKW.some(kw => title.toLowerCase().includes(kw.toLowerCase()));
            });
            
            // Adicionar novas notícias ao início
            if (_filteredClean.length > 0) {
                allNews = [..._filteredClean, ...allNews];
            }
            
            // Limpar notícias com mais de 15 dias
            const now = new Date();
            const fifteenDaysMs = 15 * 24 * 60 * 60 * 1000;
            allNews = allNews.filter(news => {
                const published = new Date(news.published);
                return (now - published) <= fifteenDaysMs;
            });
            
            // GARANTIR que TODAS as notícias tenham a flag isHotNews verificada
            // Isso é necessário caso alguma notícia tenha sido adicionada sem a verificação
            allNews.forEach(news => {
                if (news.isHotNews === undefined) {
                    const hotCheck = isHotNews(news.title);
                    if (hotCheck.isHot) {
                        news.isHotNews = true;
                        news.hotCategory = hotCheck.category;
                        news.hotKeyword = hotCheck.keyword;
                    } else {
                        news.isHotNews = false;
                    }
                }
            });
            
            // Limitar a 150 notícias mais recentes
            allNews = allNews.sort((a, b) => new Date(b.published) - new Date(a.published)).slice(0, 250);
            
            // DEDUP FINAL: remover duplicatas por similaridade de título
            // Manter a publicada primeiro (mais antiga) removendo as mais recentes que são parecidas
            // allNews já está newest-first, então ao iterar, o mais recente é visto antes
            // Precisamos inverter a lógica: marcar duplicatas para remoção
            const _keepIndices = new Set();
            const _titleIndex = new Map(); // bucket -> {title, pubTime, idx}
            allNews.forEach((news, idx) => {
                const title = news.translatedTitle || news.title || '';
                const pubTime = new Date(news.published).getTime();
                // Checar se já existe similar no _titleIndex
                const similar = _findSimilarNewsInBuckets(_titleIndex, title, 0.5);
                if (!similar) {
                    // Primeira vez vendo este tema
                    _addNewsTitleBucket(_titleIndex, title, { title, pubTime, idx });
                    _keepIndices.add(idx);
                } else if (pubTime < similar.pubTime) {
                    // Este artigo é MAIS ANTIGO que o similar já registrado — trocar
                    _copyBestNewsImage(news, allNews[similar.idx]);
                    _keepIndices.delete(similar.idx);
                    _keepIndices.add(idx);
                    similar.pubTime = pubTime;
                    similar.idx = idx;
                    similar.title = title;
                    _addNewsTitleBucket(_titleIndex, title, similar);
                } else {
                    _copyBestNewsImage(allNews[similar.idx], news);
                }
                // Se pubTime >= similar.pubTime, é mais recente = duplicata, descartamos
            });
            allNews = allNews.filter((_, idx) => _keepIndices.has(idx));
            allNews = _applyCointelegraphVolumeLimit(allNews);
        }

        // ──────────────────────────────────────────────
        // V7: Try backend AI-filtered news first
        // ──────────────────────────────────────────────
        async function fetchAINews(category, minScore) {
            const workerItems = await fetchWorkerNewsItems(160, { merge: true });
            if (workerItems.length > 0) {
                aiClassifiedNews = workerItems;
                aiNewsLoaded = true;
                return true;
            }

            try {
                let url = `${NEWS_BACKEND_URL}/news?limit=160`;
                if (category) url += `&category=${encodeURIComponent(category)}`;
                const resp = await fetchWithTimeout(url, {}, 3500);
                if (!resp.ok) throw new Error('Backend returned ' + resp.status);
                const data = await resp.json();
                if (data.articles && data.articles.length > 0) {
                    aiClassifiedNews = data.articles;
                    aiNewsLoaded = true;
                    // Also merge into allNews for modal lookups
                    const mapped = data.articles.map(a => ({
                        title: a.title || '',
                        url: a.url || '',
                        source: a.source || 'Backend',
                        published: a.published || new Date().toISOString(),
                        sentiment: a.score >= 70 ? 'positive' : a.score < 40 ? 'negative' : 'neutral',
                        relevance: a.score >= 70 ? 'high' : a.score >= 40 ? 'medium' : 'low',
                        image: a.image || null,
                        body: a.summary_pt || a.body || '',
                        aiCategory: a.category || '',
                        aiScore: a.score || 0,
                        aiSummary: a.summary_pt || '',
                        isHotNews: false
                    }));
                    mergeNews(mapped);
                    return true;
                }
            } catch (e) {
            }
            return false;
        }

        const GENERAL_RSS_FEEDS = [
            { url: 'https://cointelegraph.com/rss', source: 'Cointelegraph' },
            { url: 'https://cryptoslate.com/feed/', source: 'CryptoSlate' },
            { url: 'https://decrypt.co/feed', source: 'Decrypt' },
            { url: 'https://cryptonews.com/news/feed/', source: 'CryptoNews' },
            { url: 'https://bitcoinmagazine.com/.rss/full/', source: 'Bitcoin Magazine' },
            { url: 'https://thedefiant.io/feed', source: 'The Defiant' },
            { url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', source: 'CoinDesk' },
            { url: 'https://beincrypto.com/feed/', source: 'BeInCrypto' }
        ];

        function _decorateGeneralNewsItems(items) {
            return items
                .filter(item => item?.title && item?.url && !isTrashNews(item.title))
                .map(item => {
                    const hotCheck = isHotNews(item.title);
                    return {
                        ...item,
                        sentiment: analyzeSentiment(item.title),
                        relevance: categorizeRelevance(item.title),
                        isHotNews: hotCheck.isHot,
                        hotCategory: hotCheck.isHot ? hotCheck.category : null,
                        hotKeyword: hotCheck.isHot ? hotCheck.keyword : null
                    };
                });
        }

        function mapWorkerNewsArticle(article) {
            return {
                title: article?.title || '',
                url: article?.url || article?.link || '',
                source: article?.source || article?.sourceName || 'Worker',
                published: article?.published || article?.publishedAt || article?.pubDate || new Date().toISOString(),
                image: article?.image || article?.imageUrl || null,
                body: article?.body || article?.summary || article?.description || null
            };
        }

        async function fetchWorkerNewsItems(limit = 160, options = {}) {
            const { merge = false } = options;
            try {
                const data = await fetchMarketWorkerJson('/news?limit=' + encodeURIComponent(String(limit)), 5500);
                const articles = Array.isArray(data?.articles)
                    ? data.articles
                    : (Array.isArray(data?.data?.articles) ? data.data.articles : []);
                const mapped = _decorateGeneralNewsItems(articles.map(mapWorkerNewsArticle)).slice(0, limit);
                if (merge && mapped.length > 0) mergeNews(mapped);
                return mapped;
            } catch (_) {
                return [];
            }
        }

        async function fetchGeneralNewsFromRSS(limit = 120) {
            const workerItems = await fetchWorkerNewsItems(limit, { merge: true });
            if (workerItems.length > 0) return workerItems.length;

            const rssPromises = GENERAL_RSS_FEEDS.map(async (feed) => {
                const xmlCandidates = [
                    { url: feed.url, timeout: 4000 }
                ];

                // Try direct/proxy XML first (fastest on Capacitor native fetch)
                for (const candidate of xmlCandidates) {
                    try {
                        const response = await fetchWithTimeout(candidate.url, {}, candidate.timeout);
                        if (!response.ok) continue;
                        const text = await response.text();
                        const items = parseRSSText(text, feed.source);
                        if (items.length > 0) {
                            return _decorateGeneralNewsItems(items);
                        }
                    } catch (_) {}
                }

                // Fallback: rss2json (some feeds may reject direct XML)
                try {
                    const rss2jsonUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feed.url)}&count=40`;
                    const response = await fetchWithTimeout(rss2jsonUrl, {}, 4500);
                    if (!response.ok) return [];
                    const data = await response.json();
                    if (!Array.isArray(data?.items) || data.items.length === 0) return [];

                    const mapped = data.items.map(item => ({
                        title: item.title || '',
                        url: item.link || '',
                        source: feed.source,
                        published: item.pubDate || new Date().toISOString(),
                        image: item.thumbnail || null,
                        body: item.description || null
                    }));

                    return _decorateGeneralNewsItems(mapped);
                } catch (_) {
                    return [];
                }
            });

            const results = await Promise.allSettled(rssPromises);
            const collected = [];
            results.forEach(result => {
                if (result.status === 'fulfilled' && Array.isArray(result.value)) {
                    collected.push(...result.value);
                }
            });

            if (collected.length > 0) {
                mergeNews(collected.slice(0, limit));
            }
            return collected.length;
        }

        // ============================================
        // FILTRO DE NOTÍCIAS IRRELEVANTES (aplicado a TODAS as fontes)
        // Remove previsões de preço, clickbait, spam, etc.
        // ============================================
        const GLOBAL_TRASH_KEYWORDS = [
            // Price predictions / forecasts
            'price prediction', 'price forecast', 'price target',
            'could reach', 'will reach', 'may reach', 'might reach',
            'could hit', 'will hit', 'may hit', 'might hit',
            'to $', 'towards $', 'target $', 'eyes $',
            'breakout to', 'surge to', 'rally to', 'pump to',
            'prediction:', 'forecast:', 'price analysis',
            'technical analysis', 'price outlook',
            'bull run', 'moon', 'moonshot', 'skyrocket',
            'previsão de preço', 'preço alvo',
            'can reach', 'set to reach', 'poised to',
            '% up', '% down', '% gain', '% drop',
            'breaks above', 'breaks below', 'on track to',
            'heads for', 'heading for', 'heading towards',
            // Price movement noise (user request: don't show "price went up/down")
            'price rose', 'price drops', 'price fell', 'price surges',
            'price crashes', 'price pumps', 'price dumps', 'price soars',
            'price plunges', 'price spikes', 'price tanks', 'price slumps',
            'price rallies', 'price rebounds', 'price recovers',
            'new all-time high', 'new ath', 'hits new high', 'hits new low',
            'x sobe', 'x cai', 'subiu para', 'caiu para',
            'preço de', 'preço do', 'cotação de', 'cotação do',
            'valorização de', 'desvalorização de',
            'pumping', 'dumping', 'is surging', 'is crashing',
            'gains today', 'drops today', 'up today', 'down today',
            'weekly gain', 'weekly loss', 'daily gain', 'daily loss',
            'jumped', 'tumbled', 'skyrocketed', 'nosedived',
            'outperforms', 'underperforms', 'outperforming',
            // Clickbait forte
            'you won\'t believe', 'shocking', 'must see', 'huge news',
            'game changer', 'this is why', 'here\'s why', 'find out',
            'breaking:', 'just in:', 'alert:', 'massive', 'huge', 'insane',
            'crazy', 'unbelievable', 'incredible', 'historic',
            'until you see', 'what it means',
            // Filler / useless
            'best crypto to buy', 'top 10', 'top 5', 'top 3',
            'best altcoin', 'next 100x', 'next big',
            'should you buy', 'worth buying', 'hidden gem',
            'undervalued', 'underrated', 'meme coin', 'memecoin', 'shitcoin',
            'airdrop', 'free token', 'free crypto', 'presale', 'ico', 'ieo', 'ido',
            'nft drop', 'nft mint', 'free mint', 'giveaway', 'win $', 'free $',
            'how to buy', 'how to stake', 'how to mine', 'how to earn',
            'passive income', 'earn daily',
            'beginner', 'explained', 'what is', 'step by step', 'tutorial',
            'best exchange', 'best wallet', 'best platform',
            // Opinion filler
            'expert says', 'expert believes', 'trader says',
            'analyst believes', 'community thinks',
            'bullish signal', 'bearish signal', 'buy signal', 'sell signal',
            'optimistic about', 'pessimistic about',
            'crypto twitter', 'crypto community', 'market sentiment',
            'fear and greed', 'he thinks', 'she thinks', 'they think',
            // Sponsored
            'sponsored', 'press release', 'advertorial', 'paid content',
            'partner content', 'promo code', 'discount', 'bonus', 'referral',
            // Low-cap noise
            'shib', 'doge', 'pepe', 'floki', 'bonk', 'wif', 'mog', 'brett',
            'new token', 'new coin', 'token launch', 'dex listing',
            // Whale alert spam (generic)
            'whale alert', 'whale moves', 'whale buys', 'whale sells',
            'whale transaction', 'whale deposit', 'whale withdrawal',
            // Trivial
            'today\'s top', 'today\'s biggest', 'market wrap',
            'daily recap', 'weekly recap', 'market summary',
            'what happened', 'crypto news today',
            // Opinion disfarçada de notícia
            'we asked ai', 'perguntamos à ia', 'perguntamos a ia',
            'ouça o que', 'ouca o que', 'hear what',
            'listen to what', 'what he said', 'what she said',
            'o que ele disse', 'o que ela disse',
            'if you are bearish', 'if you are bullish',
            'if you\'re bearish', 'if you\'re bullish',
            'se você está pessimista', 'se você está otimista',
            'here\'s what to know', 'here is what to know',
            'according to analyst', 'according to expert'
        ];
        
        function isTrashNews(title) {
            if (!title) return false;
            const titleLower = title.toLowerCase();
            return GLOBAL_TRASH_KEYWORDS.some(keyword => titleLower.includes(keyword.toLowerCase()));
        }

        async function fetchNews() {
            if (newsFetchInProgress) {
                if (allNews.length > 0) {
                    try { renderNews({ full: false }); } catch (e) {}
                } else {
                    const container = document.getElementById('news-container');
                    if (container) {
                        container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
                    }
                }
                return;
            }
            newsFetchInProgress = true;
            newsFetchState = 'fetching';

            const container = document.getElementById('news-container');
            if (!container) {
                newsFetchInProgress = false;
                newsFetchState = 'idle';
                return;
            }
            
            // Se estiver no filtro "hot", não mexer no container (hot news tem seu próprio sistema)
            const isHotFilter = newsFilter === 'hot';

            // Renderizar cache local imediatamente para reduzir tempo de tela vazia
            if (!newsLoaded && allNews.length === 0) {
                try {
                    const cached = localStorage.getItem('vc4_news_cache');
                    if (cached) {
                        const parsed = JSON.parse(cached);
                        if (Array.isArray(parsed?.articles) && parsed.articles.length > 0) {
                            allNews = parsed.articles;
                            newsLoaded = true;
                            if (!isHotFilter) await renderNews({ full: false });
                        }
                    }
                } catch (_) {}
            }
            
            // v7.1: Global timeout for entire fetch cycle (15s)
            const fetchTimeout = setTimeout(() => {
                if (!newsLoaded && allNews.length === 0) {
                    // Try localStorage cache fallback
                    try {
                        const cached = localStorage.getItem('vc4_news_cache');
                        if (cached) {
                            const parsed = JSON.parse(cached);
                            if (parsed.articles && parsed.articles.length > 0) {
                                allNews = parsed.articles;
                                newsLoaded = true;
                                renderNews({ full: false });
                                return;
                            }
                        }
                    } catch(e) {}
                    container.innerHTML = `
                        <div style="text-align: center; padding: 30px;">
                            <i class="fas fa-exclamation-triangle" style="font-size: 40px; color: var(--accent-yellow); margin-bottom: 16px;"></i>
                            <p style="color: var(--text-secondary);">Tempo esgotado ao buscar notícias</p>
                            <button onclick="newsRetryCount=0; fetchNews();" style="margin-top: 16px; padding: 10px 20px; background: var(--accent-blue); color: white; border: none; border-radius: 10px; cursor: pointer; font-weight: 600;">
                                <i class="fas fa-redo"></i> Tentar Novamente
                            </button>
                        </div>
                    `;
                }
            }, 15000);
            
            try {
            
            // Se já tem notícias carregadas, manter conteúdo atual enquanto atualiza.
            if (newsLoaded && allNews.length > 0) {
                // Não mostrar loading, manter conteúdo atual enquanto atualiza em background
            } else if (!isHotFilter) {
                // Primeira vez: usar apenas spinner (nunca mostrar cards vazios/skeleton).
                container.innerHTML = '<div class="loading"><div class="spinner"></div><p style="color: var(--text-secondary); margin-top: 12px; font-size: 13px;">Carregando notícias...</p></div>';
            }
            
            let totalFetched = 0;
            let successfulSources = 0;
            
            // ==========================================
            // V7: PRIORITY SOURCES IN PARALLEL (backend + RSS)
            // ==========================================
            const backendResult = await Promise.resolve(fetchAINews(null, 0))
                .then(value => ({ status: 'fulfilled', value }))
                .catch(reason => ({ status: 'rejected', reason }));

            const backendOk = backendResult.status === 'fulfilled' && backendResult.value === true;
            if (backendOk) {
                successfulSources++;
                totalFetched += aiClassifiedNews.length;
            }

            let rssResult = { status: 'fulfilled', value: 0 };
            if (!backendOk || allNews.length < 60) {
                rssResult = await Promise.resolve(fetchGeneralNewsFromRSS(120))
                    .then(value => ({ status: 'fulfilled', value }))
                    .catch(reason => ({ status: 'rejected', reason }));
            }

            if (rssResult.status === 'fulfilled' && rssResult.value > 0) {
                successfulSources++;
                totalFetched += rssResult.value;
            }

            // ==========================================
            // FALLBACK: CryptoCompare (if backend unavailable)
            // ==========================================
            if (!backendOk && allNews.length < 20) {
            try {
                const ccResponse = await fetchWithTimeout(
                    'https://min-api.cryptocompare.com/data/v2/news/?lang=EN&sortOrder=latest',
                    {},
                    6000
                );
                
                if (ccResponse.ok) {
                    const ccData = await ccResponse.json();
                    if (ccData.Data && ccData.Data.length > 0) {
                        // Usar filtro global de notícias irrelevantes (só título, body é muito agressivo)
                        const filteredData = ccData.Data.filter(item => {
                            return !isTrashNews(item.title);
                        });
                        const newItems = filteredData.slice(0, 100).map(item => {
                            // MARCAR HOT IMEDIATAMENTE ao criar a notícia
                            const hotCheck = isHotNews(item.title);
                            const newsItem = {
                                title: item.title,
                                url: item.url,
                                source: item.source_info?.name || item.source || 'CryptoCompare',
                                published: new Date(item.published_on * 1000).toISOString(),
                                sentiment: analyzeSentiment(item.title + ' ' + (item.body || '')),
                                relevance: categorizeRelevance(item.title),
                                image: item.imageurl || null,
                                body: item.body ? item.body.substring(0, 300) : null,
                                categories: item.categories || '',
                                isHotNews: hotCheck.isHot,
                                hotCategory: hotCheck.isHot ? hotCheck.category : null,
                                hotKeyword: hotCheck.isHot ? hotCheck.keyword : null
                            };
                            return newsItem;
                        });
                        mergeNews(newItems);
                        totalFetched += newItems.length;
                        successfulSources++;
                    }
                }
            } catch (e) {
            }
            
            // ==========================================
            // FONTE 2: CryptoPanic via Proxy (backup)
            // ==========================================
            if (allNews.length < 20) {
                const corsProxies = [
                    (url) => url
                ];
                
                const cryptoUrl = 'https://cryptopanic.com/api/free/v1/posts/?public=true&kind=news';
                
                for (const proxyFn of corsProxies) {
                    try {
                        const url = proxyFn(cryptoUrl);
                        const response = await fetchWithTimeout(url, {}, 4000);
                        if (response.ok) {
                            const data = await response.json();
                            if (data.results && data.results.length > 0) {
                                // Apply trash filter to CryptoPanic results
                                const filteredResults = data.results.filter(item => !isTrashNews(item.title));
                                const newItems = filteredResults.map(item => {
                                    // MARCAR HOT IMEDIATAMENTE ao criar a notícia
                                    const hotCheck = isHotNews(item.title);
                                    return {
                                        title: item.title,
                                        url: item.url,
                                        source: item.source?.title || 'CryptoPanic',
                                        published: item.published_at || new Date().toISOString(),
                                        sentiment: item.votes?.positive > item.votes?.negative ? 'positive' : 
                                                   item.votes?.negative > item.votes?.positive ? 'negative' : 'neutral',
                                        relevance: categorizeRelevance(item.title),
                                        image: null,
                                        isHotNews: hotCheck.isHot,
                                        hotCategory: hotCheck.isHot ? hotCheck.category : null,
                                        hotKeyword: hotCheck.isHot ? hotCheck.keyword : null
                                    };
                                });
                                mergeNews(newItems);
                                totalFetched += newItems.length;
                                successfulSources++;
                                break;
                            }
                        }
                    } catch (e) {
                        // Tentar próximo proxy
                    }
                }
            }
            } // end if (!backendOk)

            // ==========================================
            // FALLBACK FINAL: RSS feeds via proxy
            // ==========================================
            if (allNews.length < 10) {
                try {
                    const rssFetched = await fetchGeneralNewsFromRSS(120);
                    if (rssFetched > 0) {
                        totalFetched += rssFetched;
                        successfulSources++;
                    }
                } catch (e) {
                }
            }

            if (allNews.length > 0) {
                newsRetryCount = 0; // Reset contador de retentativas
                newsLastFetch = Date.now(); // Marcar timestamp da última busca
                newsLoaded = true; // Marcar que notícias foram carregadas
                newsFetchState = 'ready';
                
                // TRADUZIR PRIMEIRO as notícias antes de renderizar
                // Isso evita que apareçam em inglês e depois mudem
                if (newsFilter !== 'hot') {
                    const initialTranslateCount = Math.min(NEWS_INITIAL_TRANSLATE_COUNT, Math.max(24, allNews.length));
                    await translateNewsBeforeRender(initialTranslateCount);
                    await renderNews({ full: false });

                    // Traduz restante em background após o primeiro render.
                    scheduleNewsBackgroundTranslation();
                }
                
                // BLOCO 4: Merge hot RSS news into allNews em background
                // Isso unifica "Todas" e "Relevantes" no mesmo array
                fetchHotNewsRSS().then(hotRssNews => {
                    if (hotRssNews.length > 0) {
                        let merged = 0;
                        const hotUrlSet = new Set();
                        const hotTitleBuckets = new Map();
                        allNews.forEach(existing => {
                            const urlKey = _normalizeNewsUrl(existing.url) || existing.url;
                            if (urlKey) hotUrlSet.add(urlKey);
                            const title = existing.translatedTitle || existing.title || '';
                            if (title) _addNewsTitleBucket(hotTitleBuckets, title, { news: existing, title });
                        });
                        for (const hot of hotRssNews) {
                            const hotUrlKey = _normalizeNewsUrl(hot.url) || hot.url;
                            const hotTitle = hot.translatedTitle || hot.title || '';
                            // Deduplicar: não adicionar se título muito similar já existe
                            const isDuplicate =
                                (hotUrlKey && hotUrlSet.has(hotUrlKey)) ||
                                !!_findSimilarNewsInBuckets(hotTitleBuckets, hotTitle, 0.6);
                            if (!isDuplicate) {
                                hot.isHotNews = true;
                                allNews.push(hot);
                                if (hotUrlKey) hotUrlSet.add(hotUrlKey);
                                if (hotTitle) _addNewsTitleBucket(hotTitleBuckets, hotTitle, { news: hot, title: hotTitle });
                                merged++;
                            }
                        }
                        if (merged > 0 && newsFilter === 'hot') {
                            renderNews(); // Re-renderizar se o usuário está na aba Relevantes
                        }
                    }
                }).catch(() => {});
            } else {
                newsFetchState = 'error';
                newsFetchState = 'error';
                newsRetryCount++;
                if (newsRetryCount <= MAX_NEWS_RETRIES) {
                    // Tentar novamente com delay progressivo
                    container.innerHTML = `
                        <div style="text-align: center; padding: 30px;">
                            <i class="fas fa-sync fa-spin" style="font-size: 40px; color: var(--accent-blue); margin-bottom: 16px;"></i>
                            
                            
                        </div>
                    `;
                    setTimeout(fetchNews, 2000 * newsRetryCount); // Delay progressivo
                } else {
                    // Mostrar erro após várias tentativas
                    container.innerHTML = `
                        <div style="text-align: center; padding: 30px;">
                            <i class="fas fa-exclamation-triangle" style="font-size: 40px; color: var(--accent-yellow); margin-bottom: 16px;"></i>
                            <p style="color: var(--text-secondary);">Não foi possível carregar notícias</p>
                            <p style="color: var(--text-muted); font-size: 12px; margin-top: 8px;">Verifique sua conexão com a internet</p>
                            <button onclick="newsRetryCount=0; fetchNews();" style="margin-top: 16px; padding: 10px 20px; background: var(--accent-blue); color: white; border: none; border-radius: 10px; cursor: pointer; font-weight: 600;">
                                <i class="fas fa-redo"></i> Tentar Novamente
                            </button>
                        </div>
                    `;
                }
            }

            // v7.1: Cache news to localStorage for offline fallback
            if (allNews.length > 0) {
                try {
                    localStorage.setItem('vc4_news_cache', JSON.stringify({
                        articles: allNews.slice(0, 180),
                        timestamp: Date.now()
                    }));
                } catch(e) {}
            }

            } catch (fetchErr) {
                // Try cache fallback
                try {
                    const cached = localStorage.getItem('vc4_news_cache');
                    if (cached) {
                        const parsed = JSON.parse(cached);
                        if (parsed.articles && parsed.articles.length > 0) {
                            allNews = parsed.articles;
                            newsLoaded = true;
                            renderNews({ full: false });
                        }
                    }
                } catch(e) {}
            } finally {
                clearTimeout(fetchTimeout);
                newsFetchInProgress = false;
            }
        }
        
        // Buscar de RSS feeds adicionais (chamado separadamente se precisar de mais)
        async function fetchMoreNews() {
            const extraFeeds = [
                { url: 'https://beincrypto.com/feed/', source: 'BeInCrypto' },
                { url: 'https://cryptonews.com/news/feed/', source: 'CryptoNews' }
            ];
            
            for (const feed of extraFeeds) {
                try {
                    const response = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feed.url)}&count=50`);
                    if (response.ok) {
                        const data = await response.json();
                        if (data.items && data.items.length > 0) {
                            // Apply trash filter to RSS feed results
                            const filteredItems = data.items.filter(item => !isTrashNews(item.title));
                            const newItems = filteredItems.map(item => ({
                                title: item.title,
                                url: item.link,
                                source: data.feed?.title || 'Crypto News',
                                published: item.pubDate || new Date().toISOString(),
                                sentiment: analyzeSentiment(item.title),
                                relevance: categorizeRelevance(item.title),
                                image: item.thumbnail || null
                            }));
                            mergeNews(newItems);
                        }
                    }
                } catch (e) {
                }
            }
        }

        // Extrair imagem de HTML description
        function extractImageFromDescription(description) {
            if (!description) return null;
            const imgMatch = description.match(/<img[^>]+src="([^">]+)"/);
            return imgMatch ? imgMatch[1] : null;
        }

        function analyzeSentiment(title) {
            if (!title) return 'neutral';
            const lower = title.toLowerCase();
            // Lista focada em EVENTOS reais, não movimentos de preço
            // === POSITIVO: Adoção, regulação favorável, institucional, segurança OK ===
            const positive = [
                // Exchanges - positivo
                'listing', 'proof of reserves',
                // Institucional / Big Money
                'blackrock', 'fidelity', 'grayscale', 'microstrategy', 'institutional adoption',
                'fund inflows', 'inflows', 'inflow', 'otc desk',
                // Regulação favorável
                'etf', 'approval', 'approved', 'approves', 'etf approved', 'regulatory clarity', 'mica',
                'rate cut', 'cut rate',
                // Adoção & desenvolvimento
                'adoption', 'partnership', 'integration', 'upgrade', 'launch', 'launches',
                'recovery', 'accumulate', 'accumulating',
                'record', 'milestone'
            ];
            // === NEGATIVO: Segurança, regulação contra, problemas reais ===
            const negative = [
                // Segurança (impacto rápido)
                'hack', 'hacks', 'hacked', 'exploit', 'exploited', 'security breach', 'funds stolen',
                'phishing', 'wallet risk', 'smart contract bug',
                // Exchanges - negativo
                'delisting', 'delisted', 'suspension', 'suspended', 'withdrawals paused',
                // Regulação contra
                'sec', 'rejection', 'rejected', 'rejects', 'ban', 'bans', 'banned',
                'lawsuit', 'sue', 'sues', 'sued', 'suing', 'investigation', 'fine', 'fines', 'fined',
                'penalty', 'penalties', 'cbdc',
                // Eventos negativos reais
                'scam', 'scams', 'fraud',
                'collapse', 'collapses', 'collapsing',
                'outflows', 'outflow',
                'layoff', 'layoffs', 'failure',
                'fund outflows', 'rate hike', 'interest rate increase',
                // Movimentos negativos
                'drop', 'drops', 'dropping', 'decline', 'declines', 'declining',
                'plunge', 'plunges', 'plunging', 'tumble', 'tumbles',
                'slump', 'slumps', 'slide', 'slides', 'sliding',
                'crash', 'crashes', 'crashing', 'dump', 'dumps', 'dumping',
                'loss', 'losses', 'sell-off', 'selloff', 'selling',
                'fear', 'fears', 'panic', 'warning', 'warns', 'warned',
                'risk', 'risks', 'threat', 'threatens', 'concern', 'concerns',
                'bearish', 'downturn', 'recession', 'crisis', 'uncertainty',
                'volatile', 'volatility', 'pressure', 'weak', 'weakens'
            ];
            
            let positiveScore = 0;
            let negativeScore = 0;
            
            // Contar ocorrências com peso
            for (const word of positive) {
                if (lower.includes(word)) positiveScore++;
            }
            for (const word of negative) {
                if (lower.includes(word)) negativeScore++;
            }
            
            // Classificar por diferença de score
            if (positiveScore > negativeScore) return 'positive';
            if (negativeScore > positiveScore) return 'negative';
            // Empate com indicadores dos dois lados = classificar pelo contexto
            if (positiveScore > 0 && negativeScore > 0) {
                // Palavras negativas de alto impacto (hack, scam, crash) têm prioridade
                const highImpactNeg = ['hack', 'hacked', 'exploit', 'scam', 'fraud', 'collapse', 'crash', 'ban', 'banned'];
                if (highImpactNeg.some(w => lower.includes(w))) return 'negative';
                return 'positive';
            }
            // Sem indicadores = positiva (notícia informativa/neutra sobre crypto é geralmente positiva)
            return 'positive';
        }

        function categorizeRelevance(title) {
            if (!title) return 'curious';
            const lower = title.toLowerCase();
            const high = ['bitcoin', 'btc', 'ethereum', 'eth', 'sec', 'etf', 'blackrock', 'regulation', 'fed', 'institutional', 'government', 'us', 'china'];
            const medium = ['solana', 'bnb', 'altcoin', 'defi', 'nft', 'exchange', 'binance', 'coinbase', 'trading'];
            
            if (high.some(w => lower.includes(w))) return 'relevant';
            if (medium.some(w => lower.includes(w))) return 'moderate';
            return 'curious';
        }

        function getTimeAgo(dateStr) {
            // Se não há data, retorna recente
            if (!dateStr) return 'recente';
            
            let published;
            
            try {
                // Parse da data - a API retorna em formato ISO 8601
                // Exemplos: "2025-12-15T10:30:00Z" ou "2025-12-15 10:30:00"
                
                // Normalizar o formato
                let normalizedDate = dateStr;
                
                // Se não tem timezone, assumir UTC
                if (!dateStr.includes('Z') && !dateStr.includes('+') && !dateStr.includes('-', 10)) {
                    normalizedDate = dateStr.replace(' ', 'T') + 'Z';
                }
                
                published = new Date(normalizedDate);
                
                // Se ainda é inválido, tentar outro parse
                if (isNaN(published.getTime())) {
                    published = new Date(dateStr);
                }
                
                // Se ainda é inválido
                if (isNaN(published.getTime())) {
                    return 'recente';
                }
            } catch (e) {
                return 'recente';
            }
            
            // Usar timestamp UTC para comparação correta
            const nowUTC = Date.now();
            const publishedUTC = published.getTime();
            
            // Calcular diferença em milissegundos
            const diffMs = nowUTC - publishedUTC;
            
            // Se for muito negativo (mais de 1 hora no futuro), ajustar
            if (diffMs < -3600000) {
                return 'recente';
            }
            
            // Se for levemente negativo, considerar como "agora"
            if (diffMs < 0) {
                return 'agora';
            }
            
            const diffSecs = Math.floor(diffMs / 1000);
            const diffMins = Math.floor(diffSecs / 60);
            const diffHours = Math.floor(diffMins / 60);
            const diffDays = Math.floor(diffHours / 24);
            const diffWeeks = Math.floor(diffDays / 7);
            
            if (diffSecs < 60) return 'agora';
            if (diffMins === 1) return '1 min atrás';
            if (diffMins < 60) return `${diffMins} min atrás`;
            if (diffHours === 1) return '1 hora atrás';
            if (diffHours < 24) return `${diffHours} horas atrás`;
            if (diffDays === 1) return 'ontem';
            if (diffDays < 7) return `${diffDays} dias atrás`;
            if (diffWeeks === 1) return '1 semana atrás';
            return `${diffWeeks} semanas atrás`;
        }
        
        // ============================================
        // HOT NEWS - Notícias Quentes do Twitter/X
        // ============================================
        let hotNewsCache = [];
        let hotNewsLastFetch = 0;
        let hotNewsFetchInProgress = null; // Promise para evitar múltiplas requisições simultâneas
        
        // PALAVRAS-CHAVE IMPORTANTES - Eventos geopolíticos, crises e macro que movem mercados
        const HOT_KEYWORDS = {
            // 🌍 Guerra / Conflitos Geopolíticos
            geopolitical: [
                'war', 'conflict', 'invasion', 'airstrike', 'missile', 'ceasefire',
                'escalation', 'military action', 'nato', 'middle east', 'ukraine',
                'israel', 'iran', 'taiwan', 'china tensions', 'red sea',
                'oil supply disruption'
            ],
            // 🏛️ Política extrema / Poder
            politics: [
                'biden', 'us election', 'presidential election',
                'impeachment', 'coup', 'martial law', 'state of emergency',
                'government shutdown'
            ],
            // 💣 Tarifas / Guerra Comercial
            trade_war: [
                'tariffs', 'tariff', 'trade war', 'sanctions', 'embargo', 'export ban',
                'china-us trade', 'china us trade', 'retaliation', 'restrictions',
                'supply chain disruption'
            ],
            // 🏦 Colapso financeiro / Sistema
            financial_collapse: [
                'bank collapse', 'bank collapses', 'liquidity crisis', 'credit crunch',
                'debt default', 'sovereign default', 'emergency bailout', 'capital controls',
                'bank run', 'systemic risk'
            ],
            // 📉 Macroeconomia de choque
            macro_shock: [
                'recession', 'depression', 'inflation spike', 'hyperinflation',
                'rate shock', 'emergency rate cut', 'emergency rate hike',
                'yield curve inversion', 'unemployment surge'
            ],
            // 🛢️ Commodities estratégicas
            commodities: [
                'oil shock', 'gas supply', 'opec', 'production cut',
                'energy crisis'
            ],
            crypto_security: [
                'hack', 'hacked', 'exploit', 'exploited', 'security breach',
                'funds stolen', 'wallet drain', 'phishing', 'bridge exploit'
            ],
            crypto_regulation: [
                'sec', 'cftc', 'lawsuit', 'sues', 'charges', 'charged',
                'settlement', 'fine', 'ban', 'approval', 'approved',
                'etf', 'stablecoin bill', 'crypto bill', 'regulation'
            ],
            institutional: [
                'blackrock', 'fidelity', 'grayscale', 'microstrategy',
                'spot bitcoin etf', 'spot ethereum etf', 'etf inflow',
                'etf outflow', 'institutional'
            ],
            crypto_systemic: [
                'bankruptcy', 'withdrawals paused', 'insolvency', 'depeg',
                'exchange outage', 'proof of reserves', 'liquidation cascade'
            ]
        };
        
        // Anti-patterns: rejeitar opinião/especulação/clickbait mesmo que contenha keywords quentes
        const HOT_REJECT_PATTERNS = [
            // Opinião / "perguntamos ao X"
            'we asked', 'asked ai', 'perguntamos',
            'hear what', 'listen to what', 'ouça o que', 'ouca o que',
            'here\'s what', 'here is what', 'here\'s why', 'this is why',
            'what does it mean', 'what it means', 'what could it mean',
            // Bearish/Bullish opinion
            'if you are bearish', 'if you are bullish', 'if you\'re bearish', 'if you\'re bullish',
            'se você está pessimista', 'se voce esta pessimista',
            'se você está otimista', 'se voce esta otimista',
            // Price predictions disfarçadas de geopolítica
            'price prediction', 'price forecast', 'price target',
            'will rise or fall', 'increase or fall', 'increase or decrease',
            'aumentará ou cairá', 'subira ou caira',
            'surge or crash', 'pump or dump',
            'should you buy', 'should you sell',
            'could reach', 'will reach', 'may reach', 'set to reach',
            // Análise de impacto no preço (opinião, não fato)
            'affect the price', 'impact the price', 'impact on price',
            'what to expect', 'investors need to know',
            // Opinião de "expert"
            'expert says', 'analyst says', 'analyst believes',
            'said about', 'says about', 'believes about', 'thinks about',
            'opinion on', 'prediction:', 'forecast:',
            // Clickbait patterns
            'you won\'t believe', 'must see', 'find out',
            'shocking truth', 'secret', 'revealed',
            // "Amid" com crypto = opinião sobre preço durante evento
            // Detectar padrão: [crypto] + amid/em meio
        ];

        // Nomes de crypto comuns para detectar padrão "crypto amid event" = opinião
        const HOT_CRYPTO_NAMES = [
            'bitcoin', 'btc', 'ethereum', 'eth', 'xrp', 'ripple', 'solana', 'sol',
            'bnb', 'cardano', 'ada', 'dogecoin', 'doge', 'avalanche', 'avax',
            'polygon', 'matic', 'polkadot', 'dot', 'chainlink', 'link',
            'litecoin', 'ltc', 'shib', 'pepe', 'crypto market', 'altcoin'
        ];

        // Keywords de alto impacto — um match basta
        const HOT_CRITICAL_KEYWORDS = new Set([
            'war', 'invasion', 'airstrike', 'missile', 'ceasefire', 'military action',
            'coup', 'martial law', 'state of emergency', 'government shutdown', 'impeachment',
            'bank collapse', 'bank collapses', 'liquidity crisis', 'debt default', 'sovereign default',
            'emergency bailout', 'capital controls', 'bank run', 'systemic risk',
            'depression', 'hyperinflation', 'emergency rate cut', 'emergency rate hike',
            'oil shock', 'energy crisis',
            'trade war', 'embargo', 'export ban',
            'hack', 'hacked', 'exploit', 'exploited', 'security breach',
            'withdrawals paused', 'bankruptcy', 'depeg'
        ]);
        const HOT_SINGLE_MATCH_CATEGORIES = new Set([
            'crypto_security',
            'crypto_regulation',
            'institutional',
            'crypto_systemic',
            'financial_collapse',
            'macro_shock'
        ]);

        function isHotNews(title) {
            if (!title) return { isHot: false };
            const lowerTitle = title.toLowerCase();
            
            // 1. Rejeitar se contém padrão de opinião/clickbait
            if (HOT_REJECT_PATTERNS.some(p => lowerTitle.includes(p))) {
                return { isHot: false };
            }
            
            // 2. Rejeitar padrão "crypto amid event" (opinião sobre preço durante evento)
            const hasCrypto = HOT_CRYPTO_NAMES.some(c => lowerTitle.includes(c));
            const hasAmid = lowerTitle.includes(' amid ') || lowerTitle.includes(' em meio ');
            if (hasCrypto && hasAmid) {
                return { isHot: false };
            }
            
            // 3. Verificar keywords — acumular matches
            let matchCount = 0;
            let firstCategory = null;
            let firstKeyword = null;
            let hasCritical = false;
            for (const [category, keywords] of Object.entries(HOT_KEYWORDS)) {
                for (const keyword of keywords) {
                    if (lowerTitle.includes(keyword)) {
                        matchCount++;
                        if (!firstCategory) { firstCategory = category; firstKeyword = keyword; }
                        if (HOT_CRITICAL_KEYWORDS.has(keyword)) hasCritical = true;
                    }
                }
            }
            // Um keyword crítico basta; keywords normais precisam de 2+ matches
            if (hasCritical || matchCount >= 2 || (matchCount >= 1 && HOT_SINGLE_MATCH_CATEGORIES.has(firstCategory))) {
                return { isHot: true, category: firstCategory, keyword: firstKeyword };
            }
            return { isHot: false };
        }
        
        // Similaridade de títulos para deduplicação (Jaccard simples)
        // Suporta EN e PT-BR com normalização de acentos
        function titleSimilarity(a, b) {
            if (!a || !b) return 0;
            // Normalizar: remover acentos, lowercase, só alfanuméricos
            const normalize = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\s]/g, '');
            const wordsA = new Set(normalize(a).split(/\s+/).filter(w => w.length > 2));
            const wordsB = new Set(normalize(b).split(/\s+/).filter(w => w.length > 2));
            if (wordsA.size === 0 || wordsB.size === 0) return 0;
            let intersection = 0;
            for (const w of wordsA) { if (wordsB.has(w)) intersection++; }
            return intersection / (wordsA.size + wordsB.size - intersection);
        }
        
        // Buscar notícias "quentes" de RSS feeds (extraído de fetchHotNews para reutilização)
        // Retorna array de notícias hot com flags já aplicadas
        async function fetchHotNewsRSS() {
            const hotNews = [];
            const workerItems = await fetchWorkerNewsItems(160, { merge: false });
            workerItems.forEach((item) => {
                const hotCheck = isHotNews(item.title);
                if (hotCheck.isHot) {
                    hotNews.push({
                        ...item,
                        hotCategory: hotCheck.category,
                        hotKeyword: hotCheck.keyword,
                        sentiment: analyzeSentimentForHot(item.title, hotCheck.category),
                        isHotNews: true
                    });
                }
            });
            
            const rssFeeds = [
                { url: 'https://feeds.reuters.com/reuters/businessNews', source: 'Reuters' },
                { url: 'https://feeds.bbci.co.uk/news/business/rss.xml', source: 'BBC' },
                { url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', source: 'CoinDesk' },
                { url: 'https://cointelegraph.com/rss', source: 'Cointelegraph' },
                { url: 'https://decrypt.co/feed', source: 'Decrypt' },
                { url: 'https://thedefiant.io/feed', source: 'The Defiant' },
                { url: 'https://www.theblock.co/rss.xml', source: 'The Block' },
                { url: 'https://bitcoinmagazine.com/.rss/full/', source: 'Bitcoin Magazine' },
                { url: 'https://cryptoslate.com/feed/', source: 'CryptoSlate' },
                { url: 'https://cryptonews.com/news/feed/', source: 'CryptoNews' }
            ];
            
            const rssFetchPromises = rssFeeds.map(async (feed) => {
                try {
                    const response = await fetchWithTimeout(feed.url, {}, 4000);
                    
                    if (response.ok) {
                        const text = await response.text();
                        const items = parseRSSText(text, feed.source);
                        const hotItems = [];
                        
                        for (const item of items) {
                            const hotCheck = isHotNews(item.title);
                            if (hotCheck.isHot) {
                                item.hotCategory = hotCheck.category;
                                item.hotKeyword = hotCheck.keyword;
                                item.sentiment = analyzeSentimentForHot(item.title, hotCheck.category);
                                item.isHotNews = true;
                                hotItems.push(item);
                            }
                        }
                        return hotItems;
                    }
                } catch (e) {}
                return [];
            });
            
            const rssResults = await Promise.allSettled(rssFetchPromises);
            rssResults.forEach(result => {
                if (result.status === 'fulfilled' && result.value) {
                    hotNews.push(...result.value);
                }
            });
            
            // Filtrar notícias com mais de 14 dias
            const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
            return hotNews.filter(news => {
                const published = new Date(news.published).getTime();
                return (Date.now() - published) <= fourteenDaysMs;
            });
        }
        
        async function fetchHotNews() {
            const now = Date.now();
            // Cache por 2 minutos
            if (hotNewsCache.length > 0 && (now - hotNewsLastFetch) < 120000) {
                return hotNewsCache;
            }
            
            // Se já há uma requisição em andamento, aguardar ela
            if (hotNewsFetchInProgress) {
                return await hotNewsFetchInProgress;
            }
            
            // Criar promise para esta requisição
            hotNewsFetchInProgress = (async () => {
                const hotNews = [];
                
                // 1. RSS Feeds de notícias globais via proxy - PARALELO para velocidade
                // EXPANDIDO: mais feeds para capturar mais notícias importantes
                const rssFeeds = [
                    { url: 'https://feeds.reuters.com/reuters/businessNews', source: 'Reuters' },
                    { url: 'https://feeds.bbci.co.uk/news/business/rss.xml', source: 'BBC' },
                    { url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', source: 'CoinDesk' },
                    { url: 'https://cointelegraph.com/rss', source: 'Cointelegraph' },
                    { url: 'https://decrypt.co/feed', source: 'Decrypt' },
                    { url: 'https://thedefiant.io/feed', source: 'The Defiant' },
                    { url: 'https://www.theblock.co/rss.xml', source: 'The Block' },
                    { url: 'https://bitcoinmagazine.com/.rss/full/', source: 'Bitcoin Magazine' },
                    { url: 'https://cryptoslate.com/feed/', source: 'CryptoSlate' },
                    { url: 'https://cryptonews.com/news/feed/', source: 'CryptoNews' }
                ];
            
            // Executar todas as requisições RSS em paralelo para maior velocidade
            const rssFetchPromises = rssFeeds.map(async (feed) => {
                try {
                    const response = await fetchWithTimeout(feed.url, {}, 4000);
                    
                    if (response.ok) {
                        const text = await response.text();
                        const items = parseRSSText(text, feed.source);
                        const hotItems = [];
                        
                        for (const item of items) {
                            const hotCheck = isHotNews(item.title);
                            if (hotCheck.isHot) {
                                item.hotCategory = hotCheck.category;
                                item.hotKeyword = hotCheck.keyword;
                                item.sentiment = analyzeSentimentForHot(item.title, hotCheck.category);
                                hotItems.push(item);
                            }
                        }
                        return hotItems;
                    }
                } catch (e) {
                }
                return [];
            });
            
            // Aguardar todas as requisições RSS em paralelo
            const rssResults = await Promise.allSettled(rssFetchPromises);
            rssResults.forEach(result => {
                if (result.status === 'fulfilled' && result.value) {
                    hotNews.push(...result.value);
                }
            });
            
            // 2. Buscar de Nitter (proxy de Twitter) - instâncias públicas - PARALELO
            const nitterInstances = [
                'nitter.privacydev.net',
                'nitter.poast.org'
            ];
            
            const twitterAccounts = [
                'elonmusk',
                'WhiteHouse',
                'unusual_whales',
                'zaborka',
                'WatcherGuru'
            ];
            
            // Criar lista de todas as combinações instance + account para executar em paralelo
            const nitterPromises = [];
            for (const instance of nitterInstances) {
                for (const account of twitterAccounts) {
                    nitterPromises.push((async () => {
                        try {
                            const response = await fetchWithTimeout(`https://${instance}/${account}/rss`, {}, 2500);
                            
                            if (response.ok) {
                                const text = await response.text();
                                const items = parseRSSText(text, `@${account}`);
                                const hotItems = [];
                                
                                for (const item of items) {
                                    const hotCheck = isHotNews(item.title);
                                    if (hotCheck.isHot) {
                                        item.hotCategory = hotCheck.category;
                                        item.hotKeyword = hotCheck.keyword;
                                        item.sentiment = analyzeSentimentForHot(item.title, hotCheck.category);
                                        item.isTwitter = true;
                                        hotItems.push(item);
                                    }
                                }
                                return hotItems;
                            }
                        } catch (e) {
                            // Skip silently
                        }
                        return [];
                    })());
                }
            }
            
            // Aguardar todos os feeds Nitter em paralelo
            const nitterResults = await Promise.allSettled(nitterPromises);
            nitterResults.forEach(result => {
                if (result.status === 'fulfilled' && result.value) {
                    hotNews.push(...result.value);
                }
            });
            
            // 3. Também filtrar notícias existentes (até 14 dias atrás)
            const fourteenDaysAgo = Date.now() - (14 * 24 * 60 * 60 * 1000);
            allNews.forEach(news => {
                // Verificar se a notícia é de até 14 dias atrás
                const newsDate = new Date(news.published).getTime();
                if (newsDate < fourteenDaysAgo) return; // Pular notícias muito antigas
                
                const hotCheck = isHotNews(news.title);
                if (hotCheck.isHot) {
                    const existing = hotNews.find(h => h.url === news.url);
                    if (!existing) {
                        hotNews.push({
                            ...news,
                            hotCategory: hotCheck.category,
                            hotKeyword: hotCheck.keyword,
                            sentiment: news.sentiment
                        });
                    }
                }
            });
            
            // Filtrar notícias com mais de 14 dias e ordenar por data
            const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
            let recentHotNews = hotNews.filter(news => {
                const published = new Date(news.published).getTime();
                return (Date.now() - published) <= fourteenDaysMs;
            });
            
            // Ordenar por data e limitar a 100 notícias importantes
                recentHotNews.sort((a, b) => new Date(b.published) - new Date(a.published));
                hotNewsCache = recentHotNews.slice(0, 100);
                hotNewsLastFetch = now;
                return hotNewsCache;
            })();
            
            // Aguardar e limpar a promise
            try {
                const result = await hotNewsFetchInProgress;
                return result;
            } finally {
                hotNewsFetchInProgress = null;
            }
        }
        
        function parseRSSText(text, source) {
            const items = [];
            
            try {
                // Parse simples de RSS/XML
                const itemMatches = text.match(/<item[^>]*>[\s\S]*?<\/item>/gi) || [];
                
                // Aumentado de 20 para 50 itens por feed para capturar mais notícias
                for (const itemXml of itemMatches.slice(0, 50)) {
                    const titleMatch = itemXml.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
                    const linkMatch = itemXml.match(/<link[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i);
                    const pubDateMatch = itemXml.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i);
                    const descMatch = itemXml.match(/<description[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i);
                    
                    // Extrair imagem do RSS: <media:content>, <media:thumbnail>, <enclosure>, ou <img> no description
                    let imageUrl = '';
                    const mediaContentMatch = itemXml.match(/<media:content[^>]+url=["']([^"']+)["']/i);
                    const mediaThumbnailMatch = itemXml.match(/<media:thumbnail[^>]+url=["']([^"']+)["']/i);
                    const enclosureMatch = itemXml.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]*type=["']image/i) ||
                                           itemXml.match(/<enclosure[^>]+type=["']image[^"']*["'][^>]+url=["']([^"']+)["']/i);
                    if (mediaContentMatch) imageUrl = mediaContentMatch[1];
                    else if (mediaThumbnailMatch) imageUrl = mediaThumbnailMatch[1];
                    else if (enclosureMatch) imageUrl = enclosureMatch[1] || enclosureMatch[2] || '';
                    imageUrl = String(imageUrl || '').trim().replace(/&amp;/g, '&');
                    // Fallback: buscar <img src="..."> dentro do description CDATA
                    if (!imageUrl && descMatch && descMatch[1]) {
                        const imgInDesc = descMatch[1].match(/<img[^>]+src=["']([^"']+)["']/i);
                        if (imgInDesc) imageUrl = imgInDesc[1];
                    }
                    imageUrl = String(imageUrl || '').trim().replace(/&amp;/g, '&');
                    
                    if (titleMatch && titleMatch[1]) {
                        const title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
                        const link = linkMatch ? linkMatch[1].trim() : '';
                        const pubDate = pubDateMatch ? pubDateMatch[1].trim() : new Date().toISOString();
                        
                        const item = {
                            title: title,
                            url: link,
                            source: source,
                            published: pubDate,
                            sentiment: 'neutral'
                        };
                        if (imageUrl) item.image = imageUrl;
                        items.push(item);
                    }
                }
            } catch (e) {
            }
            
            return items;
        }
        
        function analyzeSentimentForHot(title, category) {
            if (!title) return 'neutral';
            const lower = title.toLowerCase();
            
            // Palavras positivas - notícias importantes
            const positive = ['peace', 'ceasefire', 'deal', 'agreement', 'stimulus', 'rate cut', 'cut rate',
                'approval', 'approved', 'rally', 'surge', 'recovery', 'growth', 'boom', 'bullish',
                'inflow', 'inflows', 'adoption', 'breakthrough', 'milestone'];
            // Palavras negativas - notícias importantes
            const negative = ['war', 'conflict', 'invasion', 'airstrike', 'missile', 'escalation',
                'tariff', 'tariffs', 'sanctions', 'embargo', 'trade war', 'retaliation',
                'crash', 'collapse', 'crisis', 'default', 'recession', 'depression',
                'bank run', 'liquidity crisis', 'inflation spike', 'hyperinflation',
                'rate hike', 'rate shock', 'oil shock', 'energy crisis',
                'coup', 'martial law', 'government shutdown', 'impeachment',
                'capitulation', 'liquidation', 'wipeout', 'panic', 'selloff', 'sell-off',
                'bearish', 'fear', 'dump', 'plunge'];
            
            let score = 0;
            positive.forEach(word => { if (lower.includes(word)) score += 1; });
            negative.forEach(word => { if (lower.includes(word)) score -= 1; });
            
            // Categorias inerentemente negativas para mercado
            if (['geopolitical', 'market_crisis'].includes(category)) score -= 1;
            
            if (score > 0) return 'positive';
            if (score < 0) return 'negative';
            return 'neutral';
        }
        
        async function renderHotNewsList(hotNews) {
            const container = document.getElementById('news-container');
            
            // Salvar notícias urgentes globalmente para acesso no modal
            window.hotNewsData = hotNews;
            
            if (hotNews.length === 0) {
                container.innerHTML = `
                    <div style="text-align: center; padding: 40px 20px;">
                        <i class="fas fa-fire" style="font-size: 48px; color: var(--accent-yellow); margin-bottom: 16px;"></i>
                        <h3 style="color: var(--text-primary); margin-bottom: 8px;">Nenhuma notícia relevante no momento</h3>
                        <p style="color: var(--text-secondary); font-size: 14px;">Notícias de alto impacto sobre tarifas, guerras, decisões políticas e eventos que movem o mercado aparecerão aqui.</p>
                    </div>
                `;
                return;
            }
            
            // Traduzir títulos em bulk (muito mais rápido — 1 request por ~10 títulos)
            const untranslatedHot = hotNews.filter(n => !n.translatedTitle && shouldRetryNewsTranslation(n));
            if (untranslatedHot.length > 0) {
                const CHUNK = 20;
                const chunks = [];
                for (let i = 0; i < untranslatedHot.length; i += CHUNK) {
                    chunks.push(untranslatedHot.slice(i, i + CHUNK));
                }
                try {
                    await Promise.race([
                        Promise.all(chunks.map(async (chunk) => {
                            const titles = chunk.map(n => n.title);
                            const translated = await translateBulk(titles);
                            for (let j = 0; j < chunk.length; j++) {
                                const translatedTitle = translated[j];
                                if (translatedTitle) {
                                    chunk[j].translatedTitle = translatedTitle;
                                    chunk[j].translationFailed = false;
                                    chunk[j].translationFailedAt = 0;
                                } else {
                                    chunk[j].translationFailed = false;
                                    chunk[j].translationFailedAt = Date.now();
                                }
                            }
                        })),
                        new Promise(resolve => setTimeout(resolve, 12000))
                    ]);
                    persistTranslationCache();
                } catch(e) {}
            }
            
            // Never render English fallback in hot news cards.
            hotNews = hotNews.map((item) => {
                if (!item.translatedTitle && item.translationFailed && !shouldRetryNewsTranslation(item)) {
                    item.translatedTitle = 'Titulo indisponivel em portugues';
                }
                return item;
            }).filter(n => !!n.translatedTitle);
            
            if (hotNews.length === 0) {
                container.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 20px;">Traduzindo notícias relevantes...</p>';
                return;
            }

            warmNewsImageCache(hotNews, 12);
            
            container.innerHTML = hotNews.map((news, index) => {
                const categoryIcons = {
                    politics: '🏛️',
                    economic: '📊',
                    geopolitical: '🌍',
                    crypto_major: '₿',
                    market_crisis: '⚠️'
                };
                
                const categoryNames = {
                    politics: 'Política',
                    economic: 'Economia',
                    geopolitical: 'Geopolítica',
                    crypto_major: 'Crypto',
                    market_crisis: 'Crise'
                };
                
                const icon = categoryIcons[news.hotCategory] || '🔥';
                const categoryName = categoryNames[news.hotCategory] || 'Importante';
                const timeAgo = getTimeAgo(news.published);
                const twitterBadge = news.isTwitter ? '<span style="background: #1DA1F2; color: white; padding: 2px 6px; border-radius: 4px; font-size: 9px; margin-left: 6px;"><i class="fab fa-twitter"></i></span>' : '';
                
                const encodedUrl = encodeURIComponent(news.url || '').replace(/'/g, '%27');
                const shortSource = shortenSource(news.source);
                
                // Thumbnail image
                const thumbLoading = index < 6 ? 'eager' : 'lazy';
                const thumbPriority = index < 3 ? 'high' : 'low';
                const thumbHtml = getNewsThumbHtml(news, thumbLoading, thumbPriority, 'fa-fire');
                
                return `
                    <div class="news-item hot" onclick="openHotNewsModal('${encodedUrl}')" style="border-left: 3px solid #f97316;">
                        ${thumbHtml}
                        <div class="news-item-content">
                            <div class="news-header">
                                <div class="news-title">
                                    <span style="font-size: 14px; margin-right: 4px;">${icon}</span>
                                    ${sanitizeHTML(news.translatedTitle)}
                                </div>
                                <span class="news-sentiment hot" style="background: linear-gradient(135deg, #f97316, #ea580c); color: white; pointer-events: none;"><i class="fas fa-fire"></i> Relevante</span>
                            </div>
                            <div class="news-meta">
                                <span class="news-source">
                                    <span style="background: rgba(249, 115, 22, 0.2); color: #f97316; padding: 2px 5px; border-radius: 4px; font-size: 9px; margin-right: 4px;">${categoryName}</span>
                                    ${sanitizeHTML(shortSource)}${twitterBadge}
                                </span>
                                <span class="news-meta-dot"></span>
                                <span class="news-time"><i class="far fa-clock"></i> ${timeAgo}</span>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }
        
        // Função para abrir modal de notícia importante
        // Aceita índice numérico OU URL da notícia para maior confiabilidade
        async function openHotNewsModal(newsUrl) {
            try {
                // Decode URL encoded in onclick handler
                try { newsUrl = decodeURIComponent(newsUrl); } catch(e) {}
                // Also handle double-encoded %27 → '
                newsUrl = newsUrl.replace(/%27/g, "'");
                let news;
                
                // V7: Sempre buscar por URL (identificador estável)
                const _findByUrl = (arr, url) => arr?.find(n => n.url === url);
                const _findByBase = (arr, base) => arr?.find(n => n.url?.split('?')[0].split('#')[0].toLowerCase() === base);
                news = _findByUrl(allNews, newsUrl) || _findByUrl(window.hotNewsData, newsUrl) || _findByUrl(hotNewsCache, newsUrl);
                
                // Fallback: buscar por URL normalizada (sem query params/fragment)
                if (!news) {
                    const baseUrl = newsUrl.split('?')[0].split('#')[0].toLowerCase();
                    news = _findByBase(allNews, baseUrl) || _findByBase(window.hotNewsData, baseUrl) || _findByBase(hotNewsCache, baseUrl);
                }
                
                // Fallback final: tentar openNewsModal (que usa a mesma lógica)
                if (!news) {
                    return openNewsModal(newsUrl);
                }
                
                // Verificar se é hot e preencher campos se necessário
                const hotCheck = isHotNews(news.title);
                if (hotCheck.isHot) {
                    news.hotCategory = news.hotCategory || hotCheck.category;
                    news.hotKeyword = news.hotKeyword || hotCheck.keyword;
                }
                
                const modal = document.getElementById('news-modal');
                const sentimentIcon = news.sentiment === 'positive' ? '<i class="fas fa-arrow-trend-up"></i>' : 
                                      '<i class="fas fa-arrow-trend-down"></i>';
                const sentimentText = news.sentiment === 'positive' ? 'Positiva' : 'Negativa';
                
                // Traduzir título se ainda não foi traduzido
                if (!news.translatedTitle && shouldRetryNewsTranslation(news)) {
                    const translatedTitle = await translateText(news.title);
                    if (translatedTitle) {
                        news.translatedTitle = translatedTitle;
                        news.translationFailed = false;
                        news.translationFailedAt = 0;
                    } else {
                        news.translationFailed = false;
                        news.translationFailedAt = Date.now();
                    }
                }
                const translatedTitle = getNewsTitleForDisplay(news) || 'Titulo indisponivel em portugues';
                
                // Gerar resumo para notícia importante
                const categoryNames = {
                    politics: 'Política',
                    economic: 'Economia', 
                    geopolitical: 'Geopolítica',
                    crypto_major: 'Crypto',
                    market_crisis: 'Crise de Mercado'
                };
            const categoryName = categoryNames[news.hotCategory] || 'Relevante';
            const summary = `🔥 NOTÍCIA RELEVANTE (${categoryName})\n\n${translatedTitle}\n\nEsta notícia foi identificada como de alto impacto para o mercado de criptomoedas. Palavra-chave detectada: "${news.hotKeyword || 'N/A'}". Sentimento: ${sentimentText}.\n\nFonte: ${news.source}`;
            
            // Calcular tempo
            const timeAgo = getTimeAgo(news.published);
            const publishedDate = new Date(news.published);
            const _mh = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
            const shortDateH = `${publishedDate.getDate()} ${_mh[publishedDate.getMonth()]} ${String(publishedDate.getHours()).padStart(2,'0')}:${String(publishedDate.getMinutes()).padStart(2,'0')}`;
            
            // Atualizar modal
            document.getElementById('news-modal-source').textContent = `🔥 ${news.source}`;
            document.getElementById('news-modal-sentiment').className = `news-modal-sentiment hot`;
            document.getElementById('news-modal-sentiment').innerHTML = `<i class="fas fa-fire"></i> Relevante • ${sentimentText}`;
            document.getElementById('news-modal-title').textContent = translatedTitle;
            document.getElementById('news-modal-summary').textContent = summary;
            document.getElementById('news-modal-time-text').textContent = `${timeAgo} \u2022 ${shortDateH}`;
            
            // Guardar info para reabrir após voltar do browser
            window.currentHotNewsUrl = news.url;
            window.currentHotNewsIndex = news.originalIndex;
            
            document.getElementById('news-modal-button').onclick = () => {
                // NÃO fechar o modal - manter aberto para quando voltar
                // Passar índice para que o restore funcione corretamente
                openInAppBrowser(news.url, translatedTitle, news.originalIndex, true, news.url);
            };
            
            // Gerar imagem - tentar buscar imagem real primeiro, fallback para ícone urgente
            const imageContainer = document.getElementById('news-modal-image');
            
            // Primeiro mostrar loading
            const categoryIcons = {
                politics: 'fa-landmark',
                economic: 'fa-chart-line',
                geopolitical: 'fa-globe',
                crypto_major: 'fa-bitcoin',
                market_crisis: 'fa-triangle-exclamation'
            };
            const iconClass = categoryIcons[news.hotCategory] || 'fa-fire';
            imageContainer.innerHTML = getNewsModalImageHtml(news, iconClass);

            if (!news.image && !getSourceLogoUrl(news)) {
                // Mostrar ícone enquanto busca imagem
                imageContainer.innerHTML = `
                    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; height: 100%; background: linear-gradient(135deg, #f97316, #ea580c);">
                        <i class="fas ${iconClass}" style="font-size: 60px; color: white; margin-bottom: 12px;"></i>
                        <span style="font-size: 14px; font-weight: 600; color: white;">🔥 Notícia Relevante</span>
                    </div>
                `;
                
                // Tentar buscar imagem em background
                fetchSingleNewsImage(news).then(() => {
                    if (news.image) {
                        imageContainer.innerHTML = getNewsModalImageHtml(news, iconClass);
                    }
                });
            }
            
            // Mostrar modal
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
            
            // Fechar modal com ESC
            document.addEventListener('keydown', handleModalEsc);
            } catch (e) {
            }
        }

        async function renderNews(options = {}) {
            // Evitar renderizações simultâneas que causam "piscar"
            if (isRenderingNews) {
                return;
            }
            const container = document.getElementById('news-container');
            if (!container) return;
            isRenderingNews = true;

            if (newsFetchState === 'fetching' && allNews.length === 0 && newsFilter !== 'hot') {
                container.innerHTML = '<div class="loading"><div class="spinner"></div><p style="color: var(--text-secondary); margin-top: 12px; font-size: 13px;">Carregando notícias...</p></div>';
                isRenderingNews = false;
                return;
            }
            
            try {
                // Se filtro é "hot", filtrar do allNews unificado (sem fetch separado)
                if (newsFilter === 'hot') {
                    // Filtrar hot news do array unificado allNews
                    let hotFromAll = allNews.filter(news => {
                        if (news.isHotNews) return true;
                        const hotCheck = isHotNews(news.title);
                        if (hotCheck.isHot) {
                            news.isHotNews = true;
                            news.hotCategory = hotCheck.category;
                            news.hotKeyword = hotCheck.keyword;
                            return true;
                        }
                        return false;
                    });
                    
                    // Filtrar por data (14 dias)
                    const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
                    hotFromAll = hotFromAll.filter(n => {
                        const published = new Date(n.published).getTime();
                        return (Date.now() - published) <= fourteenDaysMs;
                    });
                    
                    // Ordenar por data e limitar
                    hotFromAll.sort((a, b) => new Date(b.published) - new Date(a.published));
                    hotFromAll = hotFromAll.slice(0, 100);
                    
                    if (hotFromAll.length === 0) {
                        // Se não tem hot news no allNews, fazer fetch RSS como fallback
                        container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
                        let hotNews = await fetchHotNews();
                        if (hotNews.length === 0) {
                            container.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 20px;">Nenhuma notícia relevante encontrada</p>';
                            isRenderingNews = false;
                            return;
                        }
                        await renderHotNewsList(hotNews);
                        isRenderingNews = false;
                        return;
                    }
                    
                    // Renderizar hot news do array unificado
                    hotNewsCache = hotFromAll;
                    await renderHotNewsList(hotFromAll);
                    isRenderingNews = false;
                    return;
                }
            
            const now = new Date();
            const fifteenDaysMs = 15 * 24 * 60 * 60 * 1000; // 15 dias em milissegundos
            
            // Filtrar notícias com mais de 15 dias
            // Revalidar hot news aqui para garantir consistência
            let filtered = allNews.filter(news => {
                const published = new Date(news.published);
                const isRecent = (now - published) <= fifteenDaysMs;
                
                // Revalidar se é hot usando a função atual
                const hotCheck = isHotNews(news.title);
                const isHot = hotCheck.isHot;
                
                // Atualizar flags da notícia
                if (isHot) {
                    news.isHotNews = true;
                    news.hotCategory = hotCheck.category;
                    news.hotKeyword = hotCheck.keyword;
                }
                
                // Na aba "Todas" mostrar TODAS as notícias recentes (incluindo neutras)
                // Nas outras abas, filtrar por sentimento depois
                return isRecent;
            });
            
            // Ordenar por mais recente primeiro e limitar a 200 notícias
            const renderLimit = options.full ? NEWS_FULL_RENDER_LIMIT : NEWS_INITIAL_RENDER_LIMIT;
            const hasMoreNewsForFullRender = !options.full && filtered.length > renderLimit;
            let sorted = [...filtered].sort((a, b) => new Date(b.published) - new Date(a.published)).slice(0, renderLimit);
            
            // Render only Portuguese-ready titles to avoid showing English cards.
            sorted = sorted.map((news) => {
                if (!news.translatedTitle && news.translationFailed && !shouldRetryNewsTranslation(news)) {
                    news.translatedTitle = 'Titulo indisponivel em portugues';
                }
                return news;
            }).filter(n => !!getNewsTitleForDisplay(n));
            
            // NÃO re-marcar notícias como hot aqui - elas já vêm marcadas do mergeNews()
            // Isso evita o problema de piscar/sumir
            
            // Filter by sentiment tab (4 tabs: all, positive, negative, hot/relevant)
            if (newsFilter !== 'all') {
                sorted = sorted.filter(n => {
                    // Hot/Relevant tab: show only hot news
                    if (newsFilter === 'hot') return n.isHotNews === true;
                    // Positive/Negative: include all matching sentiment (including hot)
                    return n.sentiment === newsFilter;
                });
            }
            
            if (sorted.length === 0) {
                const hasPendingTranslations = allNews.some(n => !n.translatedTitle && shouldRetryNewsTranslation(n));
                if (hasPendingTranslations) {
                    container.innerHTML = '<div class="loading"><div class="spinner"></div><p style="color: var(--text-secondary); margin-top: 12px; font-size: 13px;">Traduzindo noticias...</p></div>';
                    if (!window._newsTranslationScheduled) {
                        window._newsTranslationScheduled = true;
                        translateNewsBeforeRender(NEWS_INITIAL_TRANSLATE_COUNT)
                            .then(() => { window._newsTranslationScheduled = false; renderNews({ full: false }); })
                            .catch(() => { window._newsTranslationScheduled = false; });
                    }
                    isRenderingNews = false;
                    return;
                }
                const isInitialLoading = newsFetchState === 'fetching' && allNews.length === 0;
                if (isInitialLoading) {
                    container.innerHTML = '<div class="loading"><div class="spinner"></div><p style="color: var(--text-secondary); margin-top: 12px; font-size: 13px;">Carregando notícias...</p></div>';
                } else {
                    container.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 20px;">Nenhuma notícia nesta categoria</p>';
                }
                isRenderingNews = false;
                return;
            }
            
            // V7: Usar URL como identificador estável (não muda com re-sort)
            const CATEGORY_DISPLAY = {
                'REGULACAO': {icon: '🏛️', label: 'Regulação', color: '#8b5cf6'},
                'FLUXO_CAPITAL': {icon: '🐋', label: 'Fluxo', color: '#06b6d4'},
                'INSTITUCIONAL': {icon: '🏦', label: 'Institucional', color: '#10b981'},
                'RISCO_SISTEMICO': {icon: '⚠️', label: 'Risco', color: '#ef4444'},
                'MACRO': {icon: '📊', label: 'Macro', color: '#f59e0b'},
                'RUIDO': {icon: '📰', label: 'News', color: '#6b7280'},
            };

            warmNewsImageCache(sorted, 14);

            const _newsHtml = sorted.map((news, index) => {
              try {
                // Verificar se é notícia importante - REVALIDAR aqui para garantir
                const recheck = isHotNews(news.title);
                const isHot = recheck.isHot === true;
                
                let sentimentIcon, sentimentText, sentimentClass;
                if (isHot) {
                    sentimentIcon = '<i class="fas fa-fire"></i>';
                    sentimentText = 'Relevante';
                    sentimentClass = 'hot';
                } else if (news.sentiment === 'positive') {
                    sentimentIcon = '';
                    sentimentText = 'Positiva';
                    sentimentClass = 'positive';
                } else if (news.sentiment === 'negative') {
                    sentimentIcon = '';
                    sentimentText = 'Negativa';
                    sentimentClass = 'negative';
                } else {
                    sentimentIcon = '';
                    sentimentText = 'Positiva';
                    sentimentClass = 'positive';
                }
                
                const timeAgo = getTimeAgo(news.published);
                const displayTitle = sanitizeHTML(getNewsTitleForDisplay(news) || 'Titulo indisponivel em portugues');
                const shortSource = shortenSource(news.source);
                const safeSource = sanitizeHTML(shortSource);
                
                const safeUrl = encodeURIComponent(news.url || '').replace(/'/g, '%27');
                let onclickHandler;
                if (!news.url) {
                    onclickHandler = '';
                } else if (isHot) {
                    onclickHandler = `openHotNewsModal('${safeUrl}')`;
                } else {
                    onclickHandler = `openNewsModal('${safeUrl}')`;
                }
                
                const catDisplay = news.aiCategory ? CATEGORY_DISPLAY[news.aiCategory] : null;
                let catBadge = '';
                if (catDisplay && news.aiScore) {
                    catBadge = `<span style="font-size:9px;padding:2px 5px;border-radius:6px;background:${catDisplay.color}22;color:${catDisplay.color};font-weight:600;">${catDisplay.icon} ${catDisplay.label}</span>`;
                }
                
                // Thumbnail image
                const thumbLoading = index < 8 ? 'eager' : 'lazy';
                const thumbPriority = index < 4 ? 'high' : 'low';
                const thumbHtml = getNewsThumbHtml(news, thumbLoading, thumbPriority, 'fa-newspaper');
                
                return `
                    <div class="news-item ${sentimentClass}" onclick="${onclickHandler}" style="${isHot ? 'border-left: 3px solid #f97316;' : news.aiScore >= 70 ? 'border-left: 3px solid ' + (catDisplay ? catDisplay.color : '#10b981') + ';' : ''}">
                        ${thumbHtml}
                        <div class="news-item-content">
                            <div class="news-header">
                                <div class="news-title">${isHot ? '<span style="color: #f97316;">🔥</span> ' : ''}${displayTitle}</div>
                                <span class="news-sentiment ${sentimentClass}" style="${isHot ? 'background: linear-gradient(135deg, #f97316, #ea580c); color: white;' : ''}">${sentimentIcon} ${sentimentText}</span>
                            </div>
                            <div class="news-meta">
                                <span class="news-source">${safeSource}</span>
                                ${catBadge}
                                <span class="news-meta-dot"></span>
                                <span class="news-time"><i class="far fa-clock"></i> ${timeAgo}</span>
                            </div>
                        </div>
                    </div>
                `;
              } catch(e) { return ''; }
            }).join('');
            requestAnimationFrame(() => { container.innerHTML = _newsHtml; });
            if (hasMoreNewsForFullRender) scheduleNewsFullRender();
            
            // Traduzir restante em background APÓS renderizar (não bloqueia)
            // Re-renderizar UMA VEZ quando traduções ficarem prontas
            if (!options.skipBackgroundTranslation) scheduleNewsBackgroundTranslation();
            } finally {
                isRenderingNews = false;
            }
        }

        // News filters
        document.addEventListener('DOMContentLoaded', () => {
            document.querySelectorAll('.news-filter').forEach(filter => {
                filter.addEventListener('click', function() {
                    document.querySelectorAll('.news-filter').forEach(f => f.classList.remove('active'));
                    this.classList.add('active');
                    newsFilter = this.dataset.filter;
                    renderNews({ full: false });
                });
            });
            
            // On resume: retry translation for any untranslated news
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible' && allNews.length > 0) {
                    const untranslated = allNews.filter(n => !n.translatedTitle);
                    if (untranslated.length > 0) {
                        translateNewsBeforeRender(20).then(() => renderNews({ full: false })).catch(() => {});
                    }
                }
            });
        });

        // ============================================
        // FEAR & GREED INDEX - API Alternative.me (gratuita, sem limite)
        // ============================================
        let lastFearGreedValue = null;
        let lastFearGreedTime = 0;
        const FEAR_GREED_CACHE_WINDOW = 30 * 60 * 1000; // 30 minutos
        const FEAR_GREED_CACHE_KEY = 'fear_greed_cache_v2';
        const FEAR_GREED_DISPLAY_ADJUSTMENT = 1;

        function clampIndexValue(value) {
            const numeric = Number(value);
            if (!Number.isFinite(numeric)) return null;
            return Math.max(0, Math.min(100, Math.round(numeric)));
        }

        function normalizeFearGreedDisplayValue(rawValue) {
            return clampIndexValue(Number(rawValue) + FEAR_GREED_DISPLAY_ADJUSTMENT);
        }

        function getWorkerFearGreedDisplayValue(workerData) {
            const value = Number(workerData?.value);
            if (!Number.isFinite(value)) return null;
            const workerAlreadyAdjusted = Number(workerData?.displayAdjustment || 0) === FEAR_GREED_DISPLAY_ADJUSTMENT;
            return workerAlreadyAdjusted ? clampIndexValue(value) : normalizeFearGreedDisplayValue(value);
        }
        
        function getFearGreedCache() {
            try {
                const cached = localStorage.getItem(FEAR_GREED_CACHE_KEY);
                if (cached) {
                    const data = JSON.parse(cached);
                    const value = Number(data?.value);
                    if (Number.isFinite(value)) {
                        return { ...data, value: clampIndexValue(value) };
                    }
                }
            } catch (e) {}
            try {
                const market = JSON.parse(localStorage.getItem('vc_last_valid_market_v1') || 'null');
                const value = clampIndexValue(market?.altseasonIndex ?? market?.altseasonValue);
                const ts = Number(market?.altseasonTs || market?.updatedAt || 0) || 0;
                const age = Date.now() - ts;
                if (value !== null && ts > 0 && ((forDisplay && age < ALTSEASON_ERROR_CACHE_WINDOW) || age < ALTSEASON_CACHE_DURATION)) {
                    return {
                        value,
                        btcDom: Number(market?.altseasonBtcDom || market?.btcDominance || 0) || 0,
                        source: ALTSEASON_SOURCE,
                        timestamp: ts,
                        stale: !!market?.altseasonStale
                    };
                }
            } catch (e) {}
            return null;
        }
        
        function setFearGreedCache(value, meta = {}) {
            try {
                localStorage.setItem(FEAR_GREED_CACHE_KEY, JSON.stringify({
                    ...meta,
                    value,
                    displayAdjustment: FEAR_GREED_DISPLAY_ADJUSTMENT,
                    timestamp: Date.now()
                }));
            } catch (e) {}
        }
        
        function updateFearGreedUI(value) {
            const valEl = document.getElementById('fear-greed-value');
            const indEl = document.getElementById('fear-greed-indicator');
            if (!valEl || !indEl) return;
            const displayValue = clampIndexValue(value);
            if (displayValue === null) return;
            valEl.textContent = displayValue;
            valEl.className = `meter-value ${displayValue > 50 ? 'pnl-positive' : 'pnl-negative'}`;
            indEl.style.left = `${displayValue}%`;
        }
        
        async function fetchFearGreed() {
            try {
                // Show cached value immediately (from memory or localStorage)
                if (lastFearGreedValue === null) {
                    const cached = getFearGreedCache();
                    if (cached !== null) {
                        lastFearGreedValue = cached.value;
                        lastFearGreedTime = Number(cached.timestamp || Date.now()) || Date.now();
                        updateFearGreedUI(cached.value);
                    } else {
                        const fgInit = document.getElementById('fear-greed-value');
                        if (fgInit) fgInit.textContent = '--';
                    }
                }
                
                // API Alternative.me - gratuita e confiável
                const workerUrl = getMarketWorkerUrl('/market/fear-greed');
                if (workerUrl) {
                    try {
                        const workerRes = await fetchWithTimeout(workerUrl, {}, 3000);
                        if (workerRes.ok) {
                            const workerData = await workerRes.json();
                            const workerValue = getWorkerFearGreedDisplayValue(workerData);
                            if (workerData?.success !== false && workerValue !== null && workerValue >= 0 && workerValue <= 100) {
                                lastFearGreedValue = workerValue;
                                lastFearGreedTime = Number(workerData.updatedAt || Date.now()) || Date.now();
                                const rawWorkerValue = Number(workerData.rawValue);
                                setFearGreedCache(workerValue, {
                                    source: workerData.source || 'worker',
                                    rawValue: Number.isFinite(rawWorkerValue) ? Math.round(rawWorkerValue) : null,
                                    dataTimestamp: workerData.dataTimestamp || null,
                                    nextUpdateAt: workerData.nextUpdateAt || null,
                                    classification: workerData.classification || null,
                                    stale: !!workerData.stale
                                });
                                updateFearGreedUI(workerValue);
                                return;
                            }
                        }
                    } catch (_) {}
                }

                const response = await fetchWithTimeout('https://api.alternative.me/fng/', {}, 10000);
                
                if (response.ok) {
                    const data = await response.json();
                    if (data && data.data && data.data[0]) {
                        const rawValue = parseInt(data.data[0].value, 10);
                        const value = normalizeFearGreedDisplayValue(rawValue);
                        if (value === null) throw new Error('Invalid Fear & Greed value');
                        
                        // Save to memory + localStorage
                        lastFearGreedValue = value;
                        lastFearGreedTime = Date.now();
                        setFearGreedCache(value, {
                            source: 'alternative_me_direct',
                            rawValue,
                            dataTimestamp: Number(data.data[0].timestamp || 0) * 1000 || null,
                            nextUpdateAt: Number(data.data[0].time_until_update || 0) > 0 ? Date.now() + Number(data.data[0].time_until_update) * 1000 : null,
                            classification: data.data[0].value_classification || null
                        });
                        
                        updateFearGreedUI(value);
                        return;
                    }
                }
                
                // API failed - use cached value if available
                if (lastFearGreedValue !== null) {
                    updateFearGreedUI(lastFearGreedValue);
                    return;
                }
                
                const fgVal = document.getElementById('fear-greed-value');
                const fgInd = document.getElementById('fear-greed-indicator');
                if (fgVal) fgVal.textContent = '--';
                if (fgInd) fgInd.style.left = '50%';
                
            } catch (e) {
                if (lastFearGreedValue !== null) {
                    updateFearGreedUI(lastFearGreedValue);
                    return;
                }
                const fgVal2 = document.getElementById('fear-greed-value');
                const fgInd2 = document.getElementById('fear-greed-indicator');
                if (fgVal2) fgVal2.textContent = '--';
                if (fgInd2) fgInd2.style.left = '50%';
            }
        }

        // ============================================
        // ALTSEASON INDEX - somente Worker/BlockchainCenter
        // ============================================
        const ALTSEASON_CACHE_KEY = 'altseason_cache_v4';
        const ALTSEASON_CACHE_DURATION = 60 * 60 * 1000; // 1 hora
        const ALTSEASON_ERROR_CACHE_WINDOW = 7 * 24 * 60 * 60 * 1000; // manter ultimo dado real em falha
        const ALTSEASON_SOURCE = 'blockchaincenter';

        function isBlockchainCenterAltseasonPayload(data) {
            return String(data?.source || '').toLowerCase() === ALTSEASON_SOURCE;
        }
        
        function getAltseasonCache(forDisplay) {
            try {
                const cached = localStorage.getItem(ALTSEASON_CACHE_KEY);
                if (cached) {
                    const data = JSON.parse(cached);
                    const value = clampIndexValue(data.value);
                    if (value === null || !isBlockchainCenterAltseasonPayload(data)) return null;
                    // For display on load, accept any cached data (will be refreshed)
                    // For normal use, respect the cache duration
                    const age = Date.now() - Number(data.timestamp || 0);
                    if ((forDisplay && age < ALTSEASON_ERROR_CACHE_WINDOW) || age < ALTSEASON_CACHE_DURATION) {
                        return { ...data, value };
                    }
                }
            } catch (e) {}
            return null;
        }
        
        function setAltseasonCache(value, btcDom, meta = {}) {
            try {
                localStorage.setItem(ALTSEASON_CACHE_KEY, JSON.stringify({
                    ...meta,
                    source: ALTSEASON_SOURCE,
                    value: value,
                    btcDom: btcDom,
                    timestamp: Date.now()
                }));
            } catch (e) {}
            try {
                if (typeof writeLastValidMarketCache === 'function') {
                    writeLastValidMarketCache({
                        altseasonIndex: value,
                        altseasonValue: value,
                        altseasonBtcDom: btcDom,
                        altseasonTs: Number(meta.updatedAt || Date.now()) || Date.now(),
                        altseasonSource: ALTSEASON_SOURCE,
                        altseasonStale: !!meta.stale
                    });
                }
            } catch (e) {}
        }
        
        // Cache em memória do Altseason (para não mostrar -- ao falhar após já ter carregado)
        let lastAltseasonValue = null;
        let lastAltseasonBtcDom = null;
        let lastAltseasonTime = 0;
        let lastAltseasonSource = '';

        function hasDisplayAltseasonCache() {
            return lastAltseasonSource === ALTSEASON_SOURCE &&
                Number.isFinite(Number(lastAltseasonValue)) &&
                (Date.now() - Number(lastAltseasonTime || 0)) < ALTSEASON_ERROR_CACHE_WINDOW;
        }

        function getMarketWorkerUrl(path) {
            const urls = getMarketWorkerUrls(path);
            return urls[0] || '';
        }

        function getMarketWorkerUrls(path) {
            const cfg = window.APP_CONFIG || {};
            const configured = typeof window.getVisorWorkerUrls === 'function'
                ? window.getVisorWorkerUrls()
                : [
                    cfg.CALENDAR_WORKER_URL,
                    ...(Array.isArray(cfg.CALENDAR_WORKER_URLS) ? cfg.CALENDAR_WORKER_URLS : []),
                    cfg.CALENDAR_WORKER_FALLBACK_URL
                ];
            return [...new Set(
                configured
                    .map(url => String(url || '').trim().replace(/\/+$/, ''))
                    .filter(Boolean)
                    .map(url => `${url}${path}`)
            )];
        }

        async function fetchMarketWorkerJson(path, timeoutMs = 7000) {
            const urls = getMarketWorkerUrls(path);
            for (const url of urls) {
                try {
                    const response = await fetchWithTimeout(url, {
                        cache: 'no-store',
                        headers: { 'Accept': 'application/json' }
                    }, timeoutMs);
                    if (!response.ok) continue;
                    const data = await response.json();
                    if (data && typeof data === 'object' && data.success !== false) {
                        return { data, url };
                    }
                } catch (_) {}
            }
            return null;
        }

        function normalizeAltseasonSnapshotBlock(data) {
            const block = data?.altseasonIndex && typeof data.altseasonIndex === 'object'
                ? data.altseasonIndex
                : data;
            const value = clampIndexValue(block?.value);
            if (value === null) return null;
            return {
                value,
                btcDom: Number(block?.btcDom || block?.btcDominance || data?.btcDominance?.value || data?.btcDominance || 0) || 0,
                updatedAt: Number(block?.updatedAt || data?.updatedAt || Date.now()) || Date.now(),
                stale: !!(block?.stale || data?.stale),
                source: String(block?.source || data?.source || ALTSEASON_SOURCE),
                methodology: block?.methodology || data?.methodology || 'top50_vs_btc_90d',
                lookbackDays: block?.lookbackDays || data?.lookbackDays || 90,
                label: block?.label || ''
            };
        }

        function applyAltseasonSnapshot(block, fallbackBtcDom = 0) {
            const normalized = normalizeAltseasonSnapshotBlock({ altseasonIndex: block, btcDominance: { value: fallbackBtcDom } });
            if (!normalized || String(normalized.source).toLowerCase() !== ALTSEASON_SOURCE) return null;
            lastAltseasonValue = normalized.value;
            lastAltseasonBtcDom = normalized.btcDom || Number(fallbackBtcDom || 0) || lastAltseasonBtcDom || 0;
            lastAltseasonTime = normalized.updatedAt || Date.now();
            lastAltseasonSource = ALTSEASON_SOURCE;
            setAltseasonCache(normalized.value, lastAltseasonBtcDom || 0, {
                methodology: normalized.methodology,
                lookbackDays: normalized.lookbackDays,
                label: normalized.label,
                stale: normalized.stale,
                updatedAt: normalized.updatedAt
            });
            updateAltseasonUI(normalized.value, lastAltseasonBtcDom || 0);
            return normalized.value;
        }
        window.applyAltseasonSnapshot = applyAltseasonSnapshot;

        function setAltseasonLoading() {
            const valueEl = document.getElementById('altseason-value');
            const statusEl = document.getElementById('altseason-status');
            const indicatorEl = document.getElementById('altseason-indicator');
            if (valueEl) {
                valueEl.className = 'meter-value';
                valueEl.style.color = '';
                valueEl.innerHTML = '<i class="fas fa-spinner fa-spin" style="font-size:14px;opacity:0.45;"></i>';
            }
            if (indicatorEl) indicatorEl.style.left = '50%';
            if (statusEl) {
                statusEl.innerHTML = '<span style="color: var(--text-muted);"><i class="fas fa-spinner fa-spin"></i> Carregando dados...</span>';
            }
        }

        function setAltseasonUnavailable() {
            const valueEl = document.getElementById('altseason-value');
            const statusEl = document.getElementById('altseason-status');
            const indicatorEl = document.getElementById('altseason-indicator');
            if (valueEl) {
                valueEl.className = 'meter-value';
                valueEl.style.color = 'var(--text-muted)';
                valueEl.textContent = '--';
            }
            if (indicatorEl) indicatorEl.style.left = '50%';
            if (statusEl) {
                statusEl.innerHTML = '<span style="color: var(--text-muted);">Altseason indisponivel no momento</span>';
            }
        }

        async function fetchAltseasonIndex() {
            const valueEl = document.getElementById('altseason-value');
            const statusEl = document.getElementById('altseason-status');
            
            // Show cached value immediately (from memory or localStorage)
            if (lastAltseasonValue === null) {
                const cached = getAltseasonCache(true);
                if (cached) {
                    lastAltseasonValue = Number(cached.value);
                    lastAltseasonBtcDom = Number(cached.btcDom || 0);
                    lastAltseasonTime = cached.timestamp;
                    lastAltseasonSource = ALTSEASON_SOURCE;
                    updateAltseasonUI(lastAltseasonValue, lastAltseasonBtcDom || 0);
                } else {
                    setAltseasonLoading();
                }
            }

            try {
                const snapshot = await fetchMarketWorkerJson('/market/global-snapshot', 7000);
                if (snapshot?.data?.altseasonIndex) {
                    const btcDom = Number(snapshot.data?.btcDominance?.value || snapshot.data?.btcDominance || 0) || 0;
                    const applied = applyAltseasonSnapshot(snapshot.data.altseasonIndex, btcDom);
                    if (applied !== null) return;
                }
            } catch (e) {}

            try {
                const worker = await fetchMarketWorkerJson('/market/altseason', 7000);
                const workerData = worker?.data;
                const workerValue = clampIndexValue(workerData?.value);
                const workerBtcDom = Number(workerData?.btcDom || workerData?.btcDominance || 0);
                if (workerData?.success !== false && isBlockchainCenterAltseasonPayload(workerData) && workerValue !== null) {
                    lastAltseasonValue = workerValue;
                    lastAltseasonBtcDom = workerBtcDom || lastAltseasonBtcDom || 0;
                    lastAltseasonTime = Number(workerData.updatedAt || Date.now()) || Date.now();
                    lastAltseasonSource = ALTSEASON_SOURCE;
                    setAltseasonCache(workerValue, workerBtcDom || 0, {
                        methodology: workerData.methodology || 'top50_vs_btc_90d',
                        lookbackDays: workerData.lookbackDays || 90,
                        label: workerData.label || '',
                        updatedAt: lastAltseasonTime,
                        stale: !!workerData.stale
                    });
                    updateAltseasonUI(workerValue, workerBtcDom || 0);
                    return;
                }
            } catch (e) {}

            if (hasDisplayAltseasonCache()) {
                updateAltseasonUI(lastAltseasonValue, lastAltseasonBtcDom || 0);
            } else {
                setAltseasonUnavailable();
            }
            return;
        }
        
        // Função auxiliar para atualizar UI do Altseason
        function updateAltseasonUI(altValue, btcDom) {
            const valEl = document.getElementById('altseason-value');
            const indEl = document.getElementById('altseason-indicator');
            const statEl = document.getElementById('altseason-status');
            if (!valEl || !indEl || !statEl) return;
            altValue = clampIndexValue(altValue);
            if (altValue === null) return;
            valEl.textContent = altValue;
            indEl.style.left = `${altValue}%`;
            
            let status = '';
            const btcDomText = Number(btcDom) > 0 ? ` (${Number(btcDom).toFixed(1)}%)` : '';
            if (altValue < 25) {
                status = '<span style="color: #6366f1;"><i class="fas fa-bitcoin"></i> Bitcoin Season</span> - BTC dominando' + btcDomText;
                valEl.style.color = '#6366f1';
            } else if (altValue < 45) {
                status = '<span style="color: #a855f7;">BTC Favorecido</span> - Leve vantagem BTC';
                valEl.style.color = '#a855f7';
            } else if (altValue < 55) {
                status = '<span style="color: #f97316;">Mercado Neutro</span> - Equilíbrio';
                valEl.style.color = '#f97316';
            } else if (altValue < 75) {
                status = '<span style="color: #84cc16;">Altcoins Favorecidas</span> - Leve vantagem alts';
                valEl.style.color = '#84cc16';
            } else {
                status = '<span style="color: #22c55e;"><i class="fas fa-rocket"></i> ALTSEASON!</span> - Altcoins disparando';
                valEl.style.color = '#22c55e';
            }
            statEl.innerHTML = status;
        }

        // ============================================
        // OTHER DATA
        // ============================================
        
