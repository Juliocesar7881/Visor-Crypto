        
        // ============================================
        // IN-APP BROWSER - Abrir sites dentro do app usando WebView
        // Como a maioria dos sites bloqueia iframe (X-Frame-Options),
        // usamos o Capacitor Browser para abrir dentro do app
        // ============================================
        let currentBrowserUrl = '';
        let browserReturnToNews = false;
        let lastOpenedNewsIndex = null; // Para reabrir o modal ao voltar
        let lastOpenedHotNewsUrl = null; // Para hot news
        
        async function openInAppBrowser(url, title, newsIndex = null, isHotNews = false, hotNewsUrl = null) {
            if (!isValidURL(url)) {
                return;
            }
            
            currentBrowserUrl = url;
            browserReturnToNews = true;
            lastOpenedNewsIndex = newsIndex;
            lastOpenedHotNewsUrl = hotNewsUrl;
            
            // Salvar no sessionStorage para recuperar ao voltar
            sessionStorage.setItem('returnToNewsModal', JSON.stringify({
                newsIndex: newsIndex,
                isHotNews: isHotNews,
                hotNewsUrl: hotNewsUrl,
                timestamp: Date.now()
            }));
            
            // Usar Capacitor Browser para abrir dentro do app
            try {
                if (typeof Capacitor !== 'undefined' && Capacitor.Plugins && Capacitor.Plugins.Browser) {
                    const { Browser } = Capacitor.Plugins;
                    await Browser.open({ 
                        url: url,
                        presentationStyle: 'popover' // Abre como overlay
                    });
                } else {
                    // Fallback para web
                    window.open(url, '_blank', 'noopener,noreferrer');
                }
            } catch (e) {
                window.open(url, '_blank', 'noopener,noreferrer');
            }
        }
        
        // Função para abrir links externos (Links Úteis) guardando a seção atual
        let previousSectionBeforeExternalLink = null;
        
        async function openExternalLink(url, title) {
            // Guardar a seção atual para retornar depois
            previousSectionBeforeExternalLink = currentSection;
            sessionStorage.setItem('returnToSection', currentSection);
            // Usar o browser do Capacitor
            try {
                if (typeof Capacitor !== 'undefined' && Capacitor.Plugins && Capacitor.Plugins.Browser) {
                    const { Browser } = Capacitor.Plugins;
                    await Browser.open({ 
                        url: url,
                        presentationStyle: 'popover'
                    });
                } else {
                    window.open(url, '_blank', 'noopener,noreferrer');
                }
            } catch (e) {
                window.open(url, '_blank', 'noopener,noreferrer');
            }
        }
        
        function closeInAppBrowser() {
            const browser = document.getElementById('in-app-browser');
            if (browser) {
                browser.classList.remove('active');
            }
            document.body.style.overflow = '';
            currentBrowserUrl = '';
            browserReturnToNews = false;
        }
        
        // Listener para quando o browser do Capacitor fecha
        // E também para quando o app volta ao foco após sair do browser
        async function initBrowserListener() {
            try {
                if (typeof Capacitor !== 'undefined' && Capacitor.Plugins && Capacitor.Plugins.Browser) {
                    const { Browser } = Capacitor.Plugins;
                    // Quando o browser fecha, o app volta ao estado anterior
                    Browser.addListener('browserFinished', () => {
                        // Restaurar seção se veio de link externo
                        restoreSectionIfNeeded();
                        // Restaurar modal se necessário
                        restoreNewsModalIfNeeded();
                    });
                }
                
                // Listener para App do Capacitor (quando app volta ao foco)
                if (typeof Capacitor !== 'undefined' && Capacitor.Plugins && Capacitor.Plugins.App) {
                    const { App } = Capacitor.Plugins;
                    App.addListener('appStateChange', ({ isActive }) => {
                        if (isActive) {
                            // App voltou ao foco - verificar se deve restaurar seção ou modal
                            setTimeout(() => {
                                restoreSectionIfNeeded();
                                restoreNewsModalIfNeeded();
                            }, 100);
                        }
                    });
                }
            } catch (e) {
            }
        }
        
        // Função para restaurar a seção após fechar link externo
        function restoreSectionIfNeeded() {
            const savedSection = sessionStorage.getItem('returnToSection');
            if (savedSection) {
                sessionStorage.removeItem('returnToSection');
                // Sempre restaurar a seção salva
                showSection(savedSection);
            }
        }
        
        // Função para restaurar modal da notícia se necessário
        function restoreNewsModalIfNeeded() {
            try {
                const savedData = sessionStorage.getItem('returnToNewsModal');
                if (!savedData) return;
                
                const data = JSON.parse(savedData);
                // Verificar se não passou muito tempo (5 minutos)
                if (Date.now() - data.timestamp > 300000) {
                    sessionStorage.removeItem('returnToNewsModal');
                    return;
                }
                
                // Verificar se modal já está aberto
                const modal = document.getElementById('news-modal');
                if (modal && modal.classList.contains('active')) {
                    sessionStorage.removeItem('returnToNewsModal');
                    return;
                }
                // Garantir que estamos na seção de notícias
                showSection('news');
                
                // Reabrir o modal correto usando índice (mais confiável)
                if (data.isHotNews && data.newsIndex !== null && data.newsIndex !== undefined) {
                    openHotNewsModal(data.newsIndex);
                } else if (data.isHotNews && data.hotNewsUrl) {
                    // Fallback para URL se não tiver índice
                    openHotNewsModal(data.hotNewsUrl);
                } else if (data.newsIndex !== null && data.newsIndex !== undefined) {
                    openNewsModal(data.newsIndex);
                }
                
                // Limpar dados salvos
                sessionStorage.removeItem('returnToNewsModal');
                currentBrowserUrl = '';
                browserReturnToNews = false;
            } catch (e) {
            }
        }
        
        // Também usar visibilitychange como fallback (mais confiável que browserFinished)
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                // Restaurar seção primeiro, depois modal
                setTimeout(() => {
                    restoreSectionIfNeeded();
                    restoreNewsModalIfNeeded();
                }, 100);
            }
        });
        
        // Inicializar listener quando o DOM estiver pronto
        document.addEventListener('DOMContentLoaded', initBrowserListener);
        
        function openCurrentUrlExternal() {
            if (currentBrowserUrl) {
                openExternalLink(currentBrowserUrl);
            }
        }
        
        // Rate limiter para APIs
        const rateLimiter = {
            lastCall: {},
            minInterval: 1000, // 1 segundo entre chamadas
            canCall: function(apiName) {
                const now = Date.now();
                if (!this.lastCall[apiName] || (now - this.lastCall[apiName]) > this.minInterval) {
                    this.lastCall[apiName] = now;
                    return true;
                }
                return false;
            }
        };
