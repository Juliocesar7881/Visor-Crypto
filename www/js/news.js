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

        // fetchSingleNewsImage — generate a fallback image based on title keywords
        async function fetchSingleNewsImage(news) {
            if (!news || news.image) return;
            // Use getNewsImageFallback to create an icon-based thumbnail
            // We store a marker so renderHotNewsList can use it
            news._fallbackImage = true;
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
            if (news.image && isValidURL(news.image)) {
                const safeImageUrl = sanitizeHTML(news.image);
                return `<img src="${safeImageUrl}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                        <div style="display: none; flex-direction: column; align-items: center; justify-content: center; width: 100%; height: 100%; position: absolute; top: 0; left: 0; background: linear-gradient(135deg, var(--bg-card), var(--bg-elevated));">
                            <i class="fas fa-newspaper" style="font-size: 60px; color: var(--accent-blue); margin-bottom: 12px;"></i>
                            <span style="font-size: 14px; font-weight: 600; color: var(--text-secondary);">Crypto News</span>
                        </div>`;
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
            
            // Guardar URL da notícia atual para reabrir após voltar do browser
            window.currentNewsUrl = newsUrl;
            
            const modal = document.getElementById('news-modal');
            const sentimentIcon = news.sentiment === 'positive' ? '<i class="fas fa-arrow-trend-up"></i>' : 
                                  '<i class="fas fa-arrow-trend-down"></i>';
            const sentimentText = news.sentiment === 'positive' ? 'Positiva' : 'Negativa';
            
            // Traduzir título se ainda não foi traduzido
            if (!news.translatedTitle) {
                news.translatedTitle = await translateText(news.title);
            }
            const translatedTitle = news.translatedTitle;
            
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
            modal.classList.remove('active');
            document.body.style.overflow = '';
            document.removeEventListener('keydown', handleModalEsc);
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
        
        function mergeNews(newItems) {
            // Criar um Set de URLs existentes para evitar duplicatas
            const existingUrls = new Set(allNews.map(n => n.url));
            
            // Filtrar apenas notícias novas
            const uniqueNew = newItems.filter(item => !existingUrls.has(item.url));

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
            const cleanNew = uniqueNew.filter(item => !_isAdNews(item.title) && !_isAdNews(item.translatedTitle));
            
            // DEDUPLICAR POR SIMILARIDADE DE TÍTULO — mesma notícia de fontes diferentes
            // Mantém a que foi publicada primeiro (mais antiga)
            const dedupedNew = cleanNew.filter(item => {
                const itemTitle = item.translatedTitle || item.title || '';
                // Checar contra notícias já existentes em allNews
                const hasSimilarExisting = allNews.some(existing => {
                    const existingTitle = existing.translatedTitle || existing.title || '';
                    return titleSimilarity(itemTitle, existingTitle) > 0.5;
                });
                return !hasSimilarExisting;
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
            allNews = allNews.sort((a, b) => new Date(b.published) - new Date(a.published)).slice(0, 150);
            
            // DEDUP FINAL: remover duplicatas por similaridade de título
            // Manter a publicada primeiro (mais antiga) removendo as mais recentes que são parecidas
            // allNews já está newest-first, então ao iterar, o mais recente é visto antes
            // Precisamos inverter a lógica: marcar duplicatas para remoção
            const _keepIndices = new Set();
            const _titleIndex = []; // {title, pubTime, idx}
            allNews.forEach((news, idx) => {
                const title = news.translatedTitle || news.title || '';
                const pubTime = new Date(news.published).getTime();
                // Checar se já existe similar no _titleIndex
                const similar = _titleIndex.find(t => titleSimilarity(title, t.title) > 0.5);
                if (!similar) {
                    // Primeira vez vendo este tema
                    _titleIndex.push({ title, pubTime, idx });
                    _keepIndices.add(idx);
                } else if (pubTime < similar.pubTime) {
                    // Este artigo é MAIS ANTIGO que o similar já registrado — trocar
                    _keepIndices.delete(similar.idx);
                    _keepIndices.add(idx);
                    similar.pubTime = pubTime;
                    similar.idx = idx;
                    similar.title = title;
                }
                // Se pubTime >= similar.pubTime, é mais recente = duplicata, descartamos
            });
            allNews = allNews.filter((_, idx) => _keepIndices.has(idx));
        }

        // ──────────────────────────────────────────────
        // V7: Try backend AI-filtered news first
        // ──────────────────────────────────────────────
        async function fetchAINews(category, minScore) {
            try {
                let url = `${NEWS_BACKEND_URL}/news/filtered?limit=100&min_score=${minScore || 0}`;
                if (category) url += `&category=${category}`;
                const resp = await fetchWithTimeout(url, {}, 12000);
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
                        aiCategory: a.category || 'RUIDO',
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
            const container = document.getElementById('news-container');
            
            // Se estiver no filtro "hot", não mexer no container (hot news tem seu próprio sistema)
            const isHotFilter = newsFilter === 'hot';
            
            // v8: Global timeout 20s (RSS feeds em paralelo são rápidos)
            const fetchTimeout = setTimeout(() => {
                if (!newsLoaded && allNews.length === 0) {
                    try {
                        const cached = localStorage.getItem('vc4_news_cache');
                        if (cached) {
                            const parsed = JSON.parse(cached);
                            if (parsed.articles && parsed.articles.length > 0) {
                                allNews = parsed.articles;
                                newsLoaded = true;
                                renderNews();
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
            }, 20000);
            
            try {
            
            // Se já tem notícias carregadas, manter conteúdo atual enquanto atualiza em background
            if (newsLoaded && allNews.length > 0) {
                // Background refresh silencioso
            } else if (!isHotFilter) {
                container.innerHTML = Array.from({length: 6}, () => `
                    <div class="news-skeleton">
                        <div class="news-skeleton-thumb"></div>
                        <div class="news-skeleton-content">
                            <div class="news-skeleton-line"></div>
                            <div class="news-skeleton-line"></div>
                            <div class="news-skeleton-line"></div>
                        </div>
                    </div>
                `).join('');
            }
            
            // ==========================================
            // V8: RSS DIRETO como fonte PRIMÁRIA
            // Capacitor 8 native HTTP = sem CORS, sem proxy
            // ==========================================
            const rssFeeds = [
                { url: 'https://cointelegraph.com/rss', source: 'Cointelegraph' },
                { url: 'https://cryptoslate.com/feed/', source: 'CryptoSlate' },
                { url: 'https://decrypt.co/feed', source: 'Decrypt' },
                { url: 'https://cryptonews.com/news/feed/', source: 'CryptoNews' },
                { url: 'https://bitcoinmagazine.com/.rss/full/', source: 'Bitcoin Magazine' },
                { url: 'https://thedefiant.io/feed', source: 'The Defiant' },
                { url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', source: 'CoinDesk' },
                { url: 'https://beincrypto.com/feed/', source: 'BeInCrypto' }
            ];
            
            const rssResults = await Promise.allSettled(
                rssFeeds.map(async (feed) => {
                    try {
                        const response = await fetchWithTimeout(feed.url, {}, 10000);
                        if (response.ok) {
                            const text = await response.text();
                            const items = parseRSSText(text, feed.source);
                            return items.filter(item => !isTrashNews(item.title)).map(item => {
                                const hotCheck = isHotNews(item.title);
                                item.sentiment = analyzeSentiment(item.title);
                                item.relevance = categorizeRelevance(item.title);
                                item.isHotNews = hotCheck.isHot;
                                if (hotCheck.isHot) {
                                    item.hotCategory = hotCheck.category;
                                    item.hotKeyword = hotCheck.keyword;
                                }
                                return item;
                            });
                        }
                    } catch(e) {}
                    return [];
                })
            );
            
            let totalFetched = 0;
            rssResults.forEach(result => {
                if (result.status === 'fulfilled' && result.value && result.value.length > 0) {
                    mergeNews(result.value);
                    totalFetched += result.value.length;
                }
            });
            
            // Backend AI-filtered como bônus em background (não bloqueia)
            fetchAINews(null, 0).then(ok => {
                if (ok && newsFilter !== 'hot') renderNews();
            }).catch(() => {});

            if (allNews.length > 0) {
                newsRetryCount = 0;
                newsLastFetch = Date.now();
                newsLoaded = true;
                
                // TRADUZIR PRIMEIRO as notícias antes de renderizar
                if (newsFilter !== 'hot') {
                    container.innerHTML = Array.from({length: 6}, () => `
                        <div class="news-skeleton">
                            <div class="news-skeleton-thumb"></div>
                            <div class="news-skeleton-content">
                                <div class="news-skeleton-line"></div>
                                <div class="news-skeleton-line"></div>
                                <div class="news-skeleton-line"></div>
                            </div>
                        </div>
                    `).join('');
                    
                    await translateNewsBeforeRender(30);
                    renderNews();
                }
                
                // Merge hot RSS news em background
                fetchHotNewsRSS().then(hotRssNews => {
                    if (hotRssNews.length > 0) {
                        let merged = 0;
                        for (const hot of hotRssNews) {
                            const isDuplicate = allNews.some(existing => 
                                titleSimilarity(existing.title, hot.title) > 0.6 ||
                                (existing.url && hot.url && existing.url === hot.url)
                            );
                            if (!isDuplicate) {
                                hot.isHotNews = true;
                                allNews.push(hot);
                                merged++;
                            }
                        }
                        if (merged > 0 && newsFilter === 'hot') {
                            renderNews();
                        }
                    }
                }).catch(() => {});
            } else {
                newsRetryCount++;
                if (newsRetryCount <= MAX_NEWS_RETRIES) {
                    container.innerHTML = `
                        <div style="text-align: center; padding: 30px;">
                            <i class="fas fa-sync fa-spin" style="font-size: 40px; color: var(--accent-blue); margin-bottom: 16px;"></i>
                            <p style="color: var(--text-secondary);">Carregando notícias...</p>
                            <p style="color: var(--text-muted); font-size: 12px; margin-top: 8px;">Tentativa ${newsRetryCount}/${MAX_NEWS_RETRIES} - Conectando às fontes</p>
                        </div>
                    `;
                    setTimeout(fetchNews, 2000 * newsRetryCount);
                } else {
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

            // Cache news para fallback offline
            if (allNews.length > 0) {
                try {
                    localStorage.setItem('vc4_news_cache', JSON.stringify({
                        articles: allNews.slice(0, 50),
                        timestamp: Date.now()
                    }));
                } catch(e) {}
            }

            } catch (fetchErr) {
                try {
                    const cached = localStorage.getItem('vc4_news_cache');
                    if (cached) {
                        const parsed = JSON.parse(cached);
                        if (parsed.articles && parsed.articles.length > 0) {
                            allNews = parsed.articles;
                            newsLoaded = true;
                            renderNews();
                        }
                    }
                } catch(e) {}
            } finally {
                clearTimeout(fetchTimeout);
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
            'trade war', 'embargo', 'export ban'
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
            if (hasCritical || matchCount >= 2) {
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
                    // Capacitor 8 native HTTP = sem CORS, fetch direto
                    const response = await fetchWithTimeout(feed.url, {}, 6000);
                    
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
                    // Capacitor 8 native HTTP = sem CORS, fetch direto
                    const response = await fetchWithTimeout(feed.url, {}, 6000);
                    
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
                            // Capacitor 8 native HTTP = sem CORS
                            const proxyUrl = `https://${instance}/${account}/rss`;
                            const response = await fetchWithTimeout(proxyUrl, {}, 2500);
                            
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
                    // Fallback: buscar <img src="..."> dentro do description CDATA
                    if (!imageUrl && descMatch && descMatch[1]) {
                        const imgInDesc = descMatch[1].match(/<img[^>]+src=["']([^"']+)["']/i);
                        if (imgInDesc) imageUrl = imgInDesc[1];
                    }
                    
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
            const untranslatedHot = hotNews.filter(n => !n.translatedTitle);
            if (untranslatedHot.length > 0) {
                const CHUNK = 10;
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
                                chunk[j].translatedTitle = translated[j] || chunk[j].title;
                            }
                        })),
                        new Promise(resolve => setTimeout(resolve, 12000))
                    ]);
                    persistTranslationCache();
                } catch(e) {}
            }
            
            // Filtrar notícias que não foram traduzidas (não mostrar em inglês)
            hotNews = hotNews.filter(n => !!n.translatedTitle);
            
            if (hotNews.length === 0) {
                container.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 20px;">Traduzindo notícias relevantes...</p>';
                return;
            }
            
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
                let thumbHtml;
                if (news.image) {
                    thumbHtml = `<div class="news-item-thumb"><img src="${news.image}" alt="" loading="lazy" onerror="this.parentElement.innerHTML='<i class=\\'fas fa-newspaper\\' style=\\'color:var(--accent-blue)\\'></i>'"></div>`;
                } else {
                    // Generate icon-based thumbnail from title keywords
                    const lowerTitle = (news.title || '').toLowerCase();
                    let thumbIcon = 'fa-fire';
                    let thumbColor = '#f97316';
                    if (/bitcoin|btc/i.test(lowerTitle)) { thumbIcon = 'fa-bitcoin-sign'; thumbColor = '#F7931A'; }
                    else if (/ethereum|eth\b/i.test(lowerTitle)) { thumbIcon = 'fa-ethereum'; thumbColor = '#627EEA'; }
                    else if (/etf|sec|regulation|government|federal|law|congress/i.test(lowerTitle)) { thumbIcon = 'fa-landmark'; thumbColor = '#63b3ed'; }
                    else if (/market|trading|price|rally|crash|bull|bear/i.test(lowerTitle)) { thumbIcon = 'fa-chart-line'; thumbColor = 'var(--accent-blue)'; }
                    else if (/exchange|coinbase|binance|kraken/i.test(lowerTitle)) { thumbIcon = 'fa-exchange-alt'; thumbColor = 'var(--accent-purple)'; }
                    else if (/war|conflict|tariff|sanctions|missile|invasion/i.test(lowerTitle)) { thumbIcon = 'fa-globe'; thumbColor = '#ef4444'; }
                    else if (/trump|biden|president|election/i.test(lowerTitle)) { thumbIcon = 'fa-landmark-dome'; thumbColor = '#eab308'; }
                    else if (/inflation|cpi|rate|fed|interest/i.test(lowerTitle)) { thumbIcon = 'fa-percent'; thumbColor = '#f59e0b'; }
                    thumbHtml = `<div class="news-item-thumb" style="background: linear-gradient(135deg, ${thumbColor}15, ${thumbColor}25);"><i class="fas ${thumbIcon}" style="color:${thumbColor}; font-size: 18px;"></i></div>`;
                }
                
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
                if (!news.translatedTitle) {
                    news.translatedTitle = await translateText(news.title);
                }
                const translatedTitle = news.translatedTitle;
                
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
            
            // Se já tem imagem, usar
            if (news.image) {
                imageContainer.innerHTML = `<img src="${news.image}" alt="Imagem da notícia" onerror="this.parentElement.innerHTML='<div style=\\'display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; height: 100%; background: linear-gradient(135deg, #f97316, #ea580c);\\' ><i class=\\'fas ${iconClass}\\' style=\\'font-size: 60px; color: white; margin-bottom: 12px;\\'></i><span style=\\'font-size: 14px; font-weight: 600; color: white;\\'>🔥 Notícia Urgente</span></div>'">`;
            } else {
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
                        imageContainer.innerHTML = `<img src="${news.image}" alt="Imagem da notícia" onerror="this.parentElement.innerHTML='<div style=\\'display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; height: 100%; background: linear-gradient(135deg, #f97316, #ea580c);\\' ><i class=\\'fas ${iconClass}\\' style=\\'font-size: 60px; color: white; margin-bottom: 12px;\\'></i><span style=\\'font-size: 14px; font-weight: 600; color: white;\\'>🔥 Notícia Urgente</span></div>'">`;
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

        async function renderNews() {
            // Evitar renderizações simultâneas que causam "piscar"
            if (isRenderingNews) {
                return;
            }
            isRenderingNews = true;
            
            try {
                const container = document.getElementById('news-container');
                
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
                        container.innerHTML = '<div class="loading"><div class="spinner"></div><p style="color: var(--text-secondary); margin-top: 12px; font-size: 13px;">Buscando notícias relevantes...</p></div>';
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
            let sorted = [...filtered].sort((a, b) => new Date(b.published) - new Date(a.published)).slice(0, 200);
            
            // Ocultar notícias não traduzidas (só mostrar em português)
            sorted = sorted.filter(n => !!n.translatedTitle);
            
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
                container.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 20px;">Nenhuma notícia nesta categoria</p>';
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
                const displayTitle = sanitizeHTML(news.translatedTitle);
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
                const thumbHtml = news.image 
                    ? `<div class="news-item-thumb"><img src="${news.image}" alt="" loading="lazy" onerror="this.parentElement.innerHTML='<i class=\\'fas fa-newspaper\\'></i>'"></div>`
                    : `<div class="news-item-thumb"><i class="fas fa-newspaper"></i></div>`;
                
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
            
            // Traduzir restante em background APÓS renderizar (não bloqueia)
            // Re-renderizar UMA VEZ quando traduções ficarem prontas
            if (!window._newsTranslationScheduled) {
                window._newsTranslationScheduled = true;
                setTimeout(() => {
                    preTranslateNews().then(() => {
                        window._newsTranslationScheduled = false;
                        renderNews();
                    }).catch(() => { window._newsTranslationScheduled = false; });
                }, 5000);
            }
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
                    renderNews();
                });
            });
            
            // On resume: retry translation for any untranslated news
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible' && allNews.length > 0) {
                    const untranslated = allNews.filter(n => !n.translatedTitle);
                    if (untranslated.length > 0) {
                        translateNewsBeforeRender(20).then(() => renderNews()).catch(() => {});
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
        const FEAR_GREED_CACHE_KEY = 'fear_greed_cache';
        
        function getFearGreedCache() {
            try {
                const cached = localStorage.getItem(FEAR_GREED_CACHE_KEY);
                if (cached) {
                    const data = JSON.parse(cached);
                    // Accept any cached data for initial display (will be refreshed)
                    return data.value;
                }
            } catch (e) {}
            return null;
        }
        
        function setFearGreedCache(value) {
            try {
                localStorage.setItem(FEAR_GREED_CACHE_KEY, JSON.stringify({
                    value: value,
                    timestamp: Date.now()
                }));
            } catch (e) {}
        }
        
        function updateFearGreedUI(value) {
            const valEl = document.getElementById('fear-greed-value');
            const indEl = document.getElementById('fear-greed-indicator');
            if (!valEl || !indEl) return;
            valEl.textContent = value;
            valEl.className = `meter-value ${value > 50 ? 'pnl-positive' : 'pnl-negative'}`;
            indEl.style.left = `${value}%`;
        }
        
        async function fetchFearGreed() {
            try {
                // Show cached value immediately (from memory or localStorage)
                if (lastFearGreedValue === null) {
                    const cached = getFearGreedCache();
                    if (cached !== null) {
                        lastFearGreedValue = cached;
                        lastFearGreedTime = Date.now();
                        updateFearGreedUI(cached);
                    } else {
                        const fgInit = document.getElementById('fear-greed-value');
                        if (fgInit) fgInit.textContent = '--';
                    }
                }
                
                // API Alternative.me - gratuita e confiável
                const response = await fetchWithTimeout('https://api.alternative.me/fng/', {}, 10000);
                
                if (response.ok) {
                    const data = await response.json();
                    if (data && data.data && data.data[0]) {
                        const value = parseInt(data.data[0].value);
                        
                        // Save to memory + localStorage
                        lastFearGreedValue = value;
                        lastFearGreedTime = Date.now();
                        setFearGreedCache(value);
                        
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
        // ALTSEASON INDEX - Com cache para evitar rate limit
        // ============================================
        const ALTSEASON_CACHE_KEY = 'altseason_cache_v2';
        const ALTSEASON_CACHE_DURATION = 10 * 60 * 1000; // 10 minutos
        const ALTSEASON_ERROR_CACHE_WINDOW = 30 * 60 * 1000; // 30 minutos - manter cache em caso de erro de API
        
        function getAltseasonCache(forDisplay) {
            try {
                const cached = localStorage.getItem(ALTSEASON_CACHE_KEY);
                if (cached) {
                    const data = JSON.parse(cached);
                    // For display on load, accept any cached data (will be refreshed)
                    // For normal use, respect the cache duration
                    if (forDisplay || Date.now() - data.timestamp < ALTSEASON_CACHE_DURATION) {
                        return data;
                    }
                }
            } catch (e) {}
            return null;
        }
        
        function setAltseasonCache(value, btcDom) {
            try {
                localStorage.setItem(ALTSEASON_CACHE_KEY, JSON.stringify({
                    value: value,
                    btcDom: btcDom,
                    timestamp: Date.now()
                }));
            } catch (e) {}
        }
        
        // Cache em memória do Altseason (para não mostrar -- ao falhar após já ter carregado)
        let lastAltseasonValue = null;
        let lastAltseasonBtcDom = null;
        let lastAltseasonTime = 0;
        
        async function fetchAltseasonIndex() {
            const valueEl = document.getElementById('altseason-value');
            const statusEl = document.getElementById('altseason-status');
            
            // Show cached value immediately (from memory or localStorage)
            if (!lastAltseasonValue) {
                const cached = getAltseasonCache(true);
                if (cached) {
                    lastAltseasonValue = cached.value;
                    lastAltseasonBtcDom = cached.btcDom || 58;
                    lastAltseasonTime = cached.timestamp;
                    updateAltseasonUI(cached.value, cached.btcDom || 58);
                } else {
                    if (valueEl) valueEl.textContent = '--';
                    if (statusEl) statusEl.innerHTML = '<span style="color: var(--text-muted);"><i class="fas fa-spinner fa-spin"></i> Carregando...</span>';
                }
            }
            try {
                // Buscar dados do CoinGecko
                let btcDom = 58;
                let topCoins = null;
                
                // Buscar global data (para BTC dominance)
                try {
                    const globalRes = await fetchWithTimeout('https://api.coingecko.com/api/v3/global', {}, 10000);
                    if (globalRes.ok) {
                        const globalData = await globalRes.json();
                        btcDom = globalData.data?.market_cap_percentage?.btc || 58;
                    }
                } catch (e) {
                }
                
                // Buscar top coins para calcular altseason
                try {
                    // v7.1: Buscar top 50 (excluindo stablecoins) para cálculo mais preciso
                    const topCoinsRes = await fetchWithTimeout(
                        'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=75&page=1&sparkline=false&price_change_percentage=7d,14d,30d',
                        {}, 15000
                    );
                    if (topCoinsRes.ok) {
                        topCoins = await topCoinsRes.json();
                    }
                } catch (e) {
                }
                
                let altValue = null;
                
                if (topCoins && topCoins.length > 0) {
                    const excludeTerms = ['tether', 'usd-coin', 'binance-usd', 'dai', 'true-usd', 
                        'wrapped', 'staked', 'bridged', 'paxos', 'frax', 'usdd', 'first-digital',
                        'ethena', 'maker', 'paypal', 'gemini', 'huobi', 'wbtc', 'weth', 'lido'];
                    
                    const btcCoin = topCoins.find(c => c.id === 'bitcoin');
                    const btc7d = btcCoin?.price_change_percentage_7d_in_currency || 0;
                    const btc14d = btcCoin?.price_change_percentage_14d_in_currency || 0;
                    const btc30d = btcCoin?.price_change_percentage_30d_in_currency || 0;
                    
                    // v7.1: Filter to top 50 non-stablecoin alts only (Blockchaincenter methodology)
                    const altcoins = topCoins.filter(c => 
                        c.id !== 'bitcoin' && 
                        !excludeTerms.some(term => c.id.toLowerCase().includes(term)) &&
                        !c.name.toLowerCase().includes('usd') &&
                        c.market_cap_rank && c.market_cap_rank <= 100
                    ).slice(0, 50);
                    
                    // v7.1: Blockchaincenter-style calculation
                    // They use 90-day performance; CoinGecko free API max is 30d
                    // We use 30d as primary (heaviest weight) since it's closest to 90d
                    let outperform30d = 0;
                    let valid30d = 0;
                    
                    altcoins.forEach(coin => {
                        const change30d = coin.price_change_percentage_30d_in_currency;
                        if (change30d !== null && change30d !== undefined) {
                            valid30d++;
                            if (change30d > btc30d) outperform30d++;
                        }
                    });
                    
                    // Primary: % of top 50 alts outperforming BTC over 30d
                    // Blockchaincenter defines: > 75% = Altseason, < 25% = Bitcoin Season
                    let pctOutperforming = valid30d > 0 ? (outperform30d / valid30d) * 100 : 50;
                    
                    // v7.1.1: Calibration to approximate Blockchaincenter 90d methodology
                    // Since CoinGecko free API only provides 30d, we blend raw outperformance
                    // with BTC dominance signal (which captures longer-term macro flow)
                    // BTC dominance score: higher dom → lower altseason environment
                    // At 40% dom → domScore 70, at 55% dom → domScore 40, at 65% dom → domScore 20
                    const domScore = Math.max(0, Math.min(100, 150 - 2 * btcDom));
                    
                    // Blend: 35% raw 30d outperformance + 65% dominance signal
                    // This approximates 90d behavior where BTC dominance trends are the
                    // primary driver of sustained altseason vs bitcoin season
                    altValue = Math.round(pctOutperforming * 0.35 + domScore * 0.65);
                    
                    altValue = Math.max(1, Math.min(100, altValue));
                    
                    /* console.log(`📊 Altseason v7.1.1: ${outperform30d}/${valid30d} alts outperform BTC (30d) = ${Math.round(pctOutperforming)}%, domScore=${domScore}, BTC Dom=${btcDom.toFixed(1)}%, Final: ${altValue}`); */
                }
                
                // Se não conseguiu calcular, usar último valor se existir (dentro de 30 min)
                if (altValue === null) {
                    if (lastAltseasonValue && (Date.now() - lastAltseasonTime) < ALTSEASON_ERROR_CACHE_WINDOW) {
                        updateAltseasonUI(lastAltseasonValue, lastAltseasonBtcDom || 58);
                    } else {
                        if (valueEl) valueEl.textContent = '--';
                        if (statusEl) statusEl.innerHTML = '<span style="color: var(--text-muted);">Erro na API</span>';
                    }
                    return;
                }
                
                // Salvar em cache de memória + localStorage
                lastAltseasonValue = altValue;
                lastAltseasonBtcDom = btcDom;
                lastAltseasonTime = Date.now();
                setAltseasonCache(altValue, btcDom);
                
                // Atualizar UI
                updateAltseasonUI(altValue, btcDom);
                
            } catch (e) {
                // Usar último valor se existir (dentro de 30 min)
                if (lastAltseasonValue && (Date.now() - lastAltseasonTime) < ALTSEASON_ERROR_CACHE_WINDOW) {
                    updateAltseasonUI(lastAltseasonValue, lastAltseasonBtcDom || 58);
                } else {
                    if (valueEl) valueEl.textContent = '--';
                    if (statusEl) statusEl.innerHTML = '<span style="color: var(--text-muted);">Indisponível</span>';
                }
            }
        }
        
        // Função auxiliar para atualizar UI do Altseason
        function updateAltseasonUI(altValue, btcDom) {
            const valEl = document.getElementById('altseason-value');
            const indEl = document.getElementById('altseason-indicator');
            const statEl = document.getElementById('altseason-status');
            if (!valEl || !indEl || !statEl) return;
            valEl.textContent = altValue;
            indEl.style.left = `${altValue}%`;
            
            let status = '';
            if (altValue < 25) {
                status = '<span style="color: #6366f1;"><i class="fas fa-bitcoin"></i> Bitcoin Season</span> - BTC dominando (' + btcDom.toFixed(1) + '%)';
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
        
