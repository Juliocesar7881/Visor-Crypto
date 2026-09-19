        // ============================================
        // ANDROID BACK BUTTON HANDLER
        // ============================================
        let currentSection = 'home'; // Guarda seção atual
        let lastBackPressTime = 0;
        let _lastModalCloseTime = 0; // Guard contra double-fire do back button
        let _lastBackEventAt = 0;

        // Dirty flags para renderização adiada de seções inativas
        const _dirtyFlags = { home: false, news: false, analysis: false, whale: false };

        function handleBackButton() {
            const now = Date.now();
            // Multiple Android back listeners can fire almost simultaneously.
            if (now - _lastBackEventAt < 250) {
                return true;
            }
            _lastBackEventAt = now;

            // ====== WHALE PERIOD MODAL ======
            const whalePeriodModal = document.getElementById('whale-period-modal');
            if (whalePeriodModal) {
                whalePeriodModal.remove();
                document.body.style.overflow = '';
                _lastModalCloseTime = Date.now();
                return true;
            }

            // ====== AVISO LEGAL MODAL ======
            const avisoLegalModal = document.getElementById('aviso-legal-modal');
            if (avisoLegalModal) {
                avisoLegalModal.remove();
                document.body.style.overflow = '';
                _lastModalCloseTime = Date.now();
                return true;
            }
            
            // ====== WHALE TX HISTORY MODAL ======
            const whaleTxModal = document.getElementById('whale-tx-modal');
            if (whaleTxModal) {
                if (window._closeWhaleModal) {
                    window._closeWhaleModal();
                } else {
                    whaleTxModal.remove();
                    document.body.style.overflow = '';
                    document.documentElement.style.overflow = '';
                }
                _lastModalCloseTime = Date.now();
                return true;
            }

            // ====== MACRO-SECTION.JS MODALS (created dynamically with .remove()) ======
            
            // Análise Técnica de indicador (macro-section.js)
            const indicatorTaModal = document.getElementById('indicator-ta-modal');
            if (indicatorTaModal) {
                const taSymbol = window._lastTASymbol || null;
                indicatorTaModal.remove();
                if (taSymbol && window.openIndicatorModal) {
                    window.openIndicatorModal(taSymbol);
                }
                _lastModalCloseTime = Date.now();
                return true;
            }
            
            // Gráfico fullscreen de indicador (macro-section.js)
            const indicatorFsModal = document.getElementById('indicator-fullscreen-modal');
            if (indicatorFsModal) {
                const fsSymbol = window._lastFSSymbol || null;
                indicatorFsModal.remove();
                (async () => {
                    try {
                        if (window.unlockOrientation) await window.unlockOrientation();
                        if (window.Capacitor && window.Capacitor.Plugins) {
                            if (window.Capacitor.Plugins.Fullscreen) await window.Capacitor.Plugins.Fullscreen.exitFullscreen();
                            if (window.Capacitor.Plugins.StatusBar) await window.Capacitor.Plugins.StatusBar.show();
                        }
                    } catch (e) {}
                })();
                if (fsSymbol && window.openIndicatorModal) {
                    setTimeout(() => window.openIndicatorModal(fsSymbol), 100);
                }
                _lastModalCloseTime = Date.now();
                return true;
            }
            
            // Modal de indicador de mercado (macro-section.js)
            const indicatorModal = document.getElementById('indicator-modal');
            if (indicatorModal) {
                indicatorModal.remove();
                document.body.style.overflow = '';
                _lastModalCloseTime = Date.now();
                return true;
            }
            
            // Modal de evento econômico do calendário (macro-section.js)
            // Só remove o modal dinâmico da macro-section (ele contém #event-modal-sheet).
            const eventDetailMacro = document.getElementById('event-detail-modal');
            if (eventDetailMacro && eventDetailMacro.querySelector('#event-modal-sheet')) {
                eventDetailMacro.remove();
                _lastModalCloseTime = Date.now();
                return true;
            }
            
            // ====== INDEX.HTML MODALS (toggled via .classList 'active') ======
            
            // Se modal de análise técnica está aberto, fechar e voltar para o gráfico
            const taModal = document.getElementById('ta-modal');
            if (taModal && taModal.classList.contains('active')) {
                closeTechnicalAnalysis();
                _lastModalCloseTime = Date.now();
                return true;
            }

            // Se modal de detalhe de call (Dashboard) está aberto, fechar
            const dashCallModal = document.getElementById('dash-call-detail-modal');
            if (dashCallModal) {
                if (window._closeDetailModal) {
                    window._closeDetailModal();
                } else {
                    dashCallModal.remove();
                    document.body.style.overflow = '';
                    document.documentElement.style.overflow = '';
                }
                _lastModalCloseTime = Date.now();
                return true;
            }
            
            // Se modal de indicador está aberto, fechar (volta para MACRO)
            const indicatorDetailModal = document.getElementById('indicator-detail-modal');
            if (indicatorDetailModal && indicatorDetailModal.classList.contains('active')) {
                closeIndicatorDetailModal();
                _lastModalCloseTime = Date.now();
                return true;
            }
            
            // Se gráfico fullscreen está aberto, fechar primeiro
            const fullscreenModal = document.getElementById('chart-fullscreen-modal');
            if (fullscreenModal && fullscreenModal.classList.contains('active')) {
                closeFullscreenChart();
                _lastModalCloseTime = Date.now();
                return true;
            }
            
            // Se modal de gráfico está aberto, fechar (volta para a seção atual)
            const chartModal = document.getElementById('chart-modal');
            if (chartModal && chartModal.classList.contains('active')) {
                closeChartModal();
                _lastModalCloseTime = Date.now();
                return true;
            }
            
            // Se modal de notícia está aberto, fechar (volta para NOTÍCIAS)
            const newsModal = document.getElementById('news-modal');
            if (newsModal && newsModal.classList.contains('active')) {
                const returnData = sessionStorage.getItem('returnToNewsModal');
                if (returnData) {
                    sessionStorage.removeItem('returnToNewsModal');
                    currentBrowserUrl = '';
                    browserReturnToNews = false;
                    return true;
                }
                closeNewsModal();
                _lastModalCloseTime = Date.now();
                return true;
            }
            
            // ====== NENHUM MODAL ABERTO - Tela principal da seção ======
            // Só navegar para HOME se estamos na tela raiz de uma seção
            // E se não acabamos de fechar um modal (guard contra double-fire)
            if (currentSection !== 'home') {
                if (Date.now() - _lastModalCloseTime < 600) {
                    return true;
                }
                showSection('home');
                return true;
            }
            
            // Já está na HOME - não fazer nada (não fechar o app)
            return true; // Sempre retorna true para NUNCA fechar o app
        }

        function showSectionDirect(sectionId) {
            document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            const sectionEl = document.getElementById(sectionId);
            if (sectionEl) sectionEl.classList.add('active');
            
            // Ativar nav item correspondente
            document.querySelectorAll('.nav-item').forEach(nav => {
                const navSection = nav.dataset ? nav.dataset.section : null;
                if (navSection === sectionId || nav.getAttribute('onclick')?.includes(sectionId)) {
                    nav.classList.add('active');
                }
            });
            
            if (sectionId === 'news') fetchNews();
            if (sectionId === 'macro' && window.loadMacroData) window.loadMacroData();
            if (sectionId !== 'macro' && window.stopMacroUpdates) {
                try { window.stopMacroUpdates(); } catch (e) {}
            }
            if (sectionId === 'analysis') {
                fetchOrderBook();
                fetchFearGreed();
                fetchVolume();
                fetchCryptoStats();
                fetchMovingAverages();
            }
            if (sectionId === 'dashboard' && typeof dashLoad === 'function') dashLoad();
        }

        // Back dispatcher único para evitar listeners duplicados de backbutton.
        let _cordovaBackListenerAttached = false;
        let _androidCustomBackListenerAttached = false;
        function _dispatchBackButton(e) {
            if (e && typeof e.preventDefault === 'function') e.preventDefault();
            if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
            window.backButtonHandled = handleBackButton();
            return window.backButtonHandled;
        }
        function _ensureCordovaBackListener() {
            if (_cordovaBackListenerAttached) return;
            document.addEventListener('backbutton', _dispatchBackButton, false);
            _cordovaBackListenerAttached = true;
        }
        function _ensureAndroidCustomBackListener() {
            if (_androidCustomBackListenerAttached) return;
            document.addEventListener('androidBackButton', _dispatchBackButton, false);
            _androidCustomBackListenerAttached = true;
        }

        // Listener para botão voltar do Android (Capacitor/Cordova)
        _ensureCordovaBackListener();
        document.addEventListener('deviceready', _ensureCordovaBackListener, false);
        // Listener para evento customizado do Android (MainActivity.java)
        _ensureAndroidCustomBackListener();
        
        // Integração com Capacitor App Plugin (método mais confiável)
        let _capacitorAppInitialized = false;
        async function initCapacitorApp() {
            if (_capacitorAppInitialized) return; // Prevent double init
            _capacitorAppInitialized = true;
            try {
                // TRAVAR orientação em PORTRAIT ao iniciar o app
                if (window.unlockOrientation) await window.unlockOrientation();
                
                // Verificar se o Capacitor está disponível para outros plugins
                if (window.Capacitor && window.Capacitor.Plugins) {
                    if (window.Capacitor.Plugins.App) {
                        const { App } = window.Capacitor.Plugins;
                        
                        // Registrar listener para back button
                        App.addListener('backButton', ({ canGoBack }) => {
                            const handled = handleBackButton();
                            // Nunca deixar fechar o app
                        });
                    }
                }
            } catch (e) {
            }
        }
        
        // Iniciar Capacitor App após DOM loaded (one listener only)
        document.addEventListener('DOMContentLoaded', initCapacitorApp);
        
        // ═══════════════════════════════════════
        // FIRST-LAUNCH DISCLAIMER (Aviso Legal obrigatório)
        // ═══════════════════════════════════════
        function showFirstLaunchDisclaimer() {
            if (localStorage.getItem('visor_disclaimer_accepted')) return;
            if (document.getElementById('first-launch-disclaimer')) return;
            const overlay = document.createElement('div');
            overlay.id = 'first-launch-disclaimer';
            overlay.style.cssText = 'position:fixed;inset:0;z-index:9999999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.92);backdrop-filter:blur(14px);padding:16px;animation:fadeInOverlay 0.3s ease;';
            overlay.innerHTML = `
                <style>
                    @keyframes fadeInOverlay { from{opacity:0} to{opacity:1} }
                    @keyframes scaleInCard { from{transform:scale(0.92);opacity:0} to{transform:scale(1);opacity:1} }
                    #disclaimer-card { animation:scaleInCard 0.35s cubic-bezier(0.22,1,0.36,1) forwards; }
                    #disclaimer-accept { transition:transform 0.12s,opacity 0.12s; }
                    #disclaimer-accept:active { transform:scale(0.97); opacity:0.8; }
                </style>
                <div id="disclaimer-card" style="background:linear-gradient(175deg,#1a1a2e 0%,#0f0f1e 100%);border:1px solid rgba(245,158,11,0.3);border-radius:24px;max-width:420px;width:100%;padding:28px 22px 28px;max-height:90vh;overflow-y:auto;box-shadow:0 16px 64px rgba(0,0,0,0.6);">

                    <!-- header -->
                    <div style="display:flex;align-items:center;gap:14px;margin-bottom:20px;">
                        <div style="width:48px;height:48px;background:linear-gradient(135deg,rgba(245,158,11,0.2),rgba(245,158,11,0.08));border:1.5px solid rgba(245,158,11,0.45);border-radius:14px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                            <i class="fas fa-exclamation-triangle" style="font-size:20px;color:#f59e0b;"></i>
                        </div>
                        <div>
                            <div style="font-size:16px;color:#f59e0b;font-weight:900;letter-spacing:0.3px;">AVISO LEGAL</div>
                            <div style="font-size:11px;color:#6b7280;margin-top:3px;">Leia com atenção antes de continuar</div>
                        </div>
                    </div>

                    <!-- cards -->
                    <div style="display:flex;flex-direction:column;gap:9px;margin-bottom:20px;">
                        <div style="display:flex;align-items:flex-start;gap:12px;background:rgba(245,158,11,0.07);border:1px solid rgba(245,158,11,0.18);border-radius:12px;padding:12px 14px;">
                            <i class="fas fa-chart-bar" style="font-size:15px;color:#f59e0b;flex-shrink:0;margin-top:2px;"></i>
                            <div style="font-size:12px;color:#d1d5db;line-height:1.65;"><strong style="color:#f59e0b;">Apenas informativo e educacional.</strong> Não constitui aconselhamento financeiro nem recomendação de compra ou venda de ativos.</div>
                        </div>
                        <div style="display:flex;align-items:flex-start;gap:12px;background:rgba(239,68,68,0.07);border:1px solid rgba(239,68,68,0.18);border-radius:12px;padding:12px 14px;">
                            <i class="fas fa-bolt" style="font-size:15px;color:#ef4444;flex-shrink:0;margin-top:2px;"></i>
                            <div style="font-size:12px;color:#d1d5db;line-height:1.65;">Criptomoedas envolvem <strong style="color:#ef4444;">alto risco de perda total</strong> do capital. O mercado é extremamente volátil e imprevisível.</div>
                        </div>
                        <div style="display:flex;align-items:flex-start;gap:12px;background:rgba(139,92,246,0.07);border:1px solid rgba(139,92,246,0.18);border-radius:12px;padding:12px 14px;">
                            <i class="fas fa-robot" style="font-size:15px;color:#c084fc;flex-shrink:0;margin-top:2px;"></i>
                            <div style="font-size:12px;color:#d1d5db;line-height:1.65;">Sinais e análises são gerados por algoritmos e <strong style="color:#c084fc;">podem conter erros</strong>. Resultados passados não garantem resultados futuros.</div>
                        </div>
                        <div style="display:flex;align-items:flex-start;gap:12px;background:rgba(59,130,246,0.07);border:1px solid rgba(59,130,246,0.18);border-radius:12px;padding:12px 14px;">
                            <i class="fas fa-search" style="font-size:15px;color:#60a5fa;flex-shrink:0;margin-top:2px;"></i>
                            <div style="font-size:12px;color:#d1d5db;line-height:1.65;">Faça sempre sua própria pesquisa (<strong style="color:#60a5fa;">DYOR</strong>) e consulte um profissional financeiro qualificado antes de investir.</div>
                        </div>
                    </div>

                    <p style="font-size:10px;color:#4b5563;line-height:1.7;text-align:center;margin-bottom:18px;padding:0 6px;">Ao continuar, você confirma que leu e compreendeu estes termos. Todas as decisões são de sua exclusiva responsabilidade.</p>

                    <button id="disclaimer-accept" style="display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:15px;background:linear-gradient(135deg,#3b82f6 0%,#2563eb 100%);border:none;border-radius:14px;color:#ffffff;font-weight:800;font-size:14px;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;letter-spacing:0.2px;box-shadow:0 4px 16px rgba(59,130,246,0.4);">
                        <i class="fas fa-check-circle"></i> Li e Aceito os Termos
                    </button>
                    <a href="privacy-policy.html" target="_blank" style="display:block;text-align:center;margin-top:14px;color:#374151;font-size:10px;text-decoration:underline;">Política de Privacidade</a>
                </div>
            `;
            // Block any interaction outside buttons (overlay tap must not dismiss)
            overlay.addEventListener('click', (e) => { if (e.target === overlay) e.stopPropagation(); });
            overlay.addEventListener('touchend', (e) => { if (e.target === overlay) e.preventDefault(); });
            // Block background scroll while overlay is open
            overlay.addEventListener('touchmove', (e) => {
                const card = overlay.querySelector('#disclaimer-card');
                if (card && card.contains(e.target)) return;
                e.preventDefault();
            }, { passive: false });
            document.body.style.overflow = 'hidden';
            document.documentElement.style.overflow = 'hidden';
            document.body.appendChild(overlay);
            let _disclaimerHandled = false;
            function acceptDisclaimer() {
                if (_disclaimerHandled) return;
                _disclaimerHandled = true;
                localStorage.setItem('visor_disclaimer_accepted', Date.now().toString());
                overlay.style.opacity = '0';
                overlay.style.transition = 'opacity 0.28s';
                setTimeout(() => {
                    overlay.remove();
                    // Only restore scroll if no other overlay is present
                    if (!document.getElementById('ad-consent-overlay')) {
                        document.body.style.overflow = '';
                        document.documentElement.style.overflow = '';
                    }
                }, 290);
            }
            const btn = overlay.querySelector('#disclaimer-accept');
            let _dTouchStart = 0;
            btn.addEventListener('pointerdown', () => { btn.style.transform = 'scale(0.97)'; btn.style.opacity = '0.8'; });
            btn.addEventListener('pointerup',   () => { btn.style.transform = ''; btn.style.opacity = ''; });
            btn.addEventListener('pointercancel', () => { btn.style.transform = ''; btn.style.opacity = ''; });
            btn.addEventListener('touchstart', () => { _dTouchStart = Date.now(); }, { passive: true });
            btn.addEventListener('touchend', (e) => {
                e.preventDefault();
                btn.style.transform = ''; btn.style.opacity = '';
                if (Date.now() - _dTouchStart < 400) acceptDisclaimer();
            });
            btn.addEventListener('click', (e) => { if (!_dTouchStart) acceptDisclaimer(); });
        }
        document.addEventListener('DOMContentLoaded', () => setTimeout(showFirstLaunchDisclaimer, 500));

       // ═══════════════════════════════════════
        window.backButtonHandled = true;

        // Fallback: popstate para navegadores (suporta swipe back)
        window.addEventListener('popstate', function(e) {
            if (window.__vcSkipNextLifecyclePopstate) {
                window.__vcSkipNextLifecyclePopstate = false;
                e.preventDefault();
                return;
            }
            e.preventDefault();
            const handled = handleBackButton();
            if (!handled) {
                // Se retornou false, re-adiciona o estado para não sair
                if (window.history && window.history.pushState) {
                    window.history.pushState({ page: 'home' }, '', '');
                }
            }
        });

        // Adicionar estado inicial ao histórico
        if (window.history && window.history.pushState) {
            // Limpar histórico e começar fresh
            window.history.replaceState({ page: 'home' }, '', '');
        }

        // Interceptar navegação para registrar histórico
        document.addEventListener('click', function(e) {
            // Ao clicar em links de navegação, adicionar ao histórico
            const navItem = e.target.closest('.nav-item');
            if (navItem && window.history && window.history.pushState) {
                window.history.pushState({ page: 'nav' }, '', '');
            }
            
            // Ao abrir gráfico, adicionar ao histórico
            const tickerItem = e.target.closest('.ticker-item');
            if (tickerItem && window.history && window.history.pushState) {
                window.history.pushState({ page: 'chart' }, '', '');
            }
            
            // Ao abrir notícia, adicionar ao histórico
            const newsItem = e.target.closest('.news-item');
            if (newsItem && window.history && window.history.pushState) {
                window.history.pushState({ page: 'news-detail' }, '', '');
            }
        });
        
        // Registrar Service Worker para PWA
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('./sw.js')
                    .then(registration => {
                    })
                    .catch(error => {
                    });
            });
        }
        
        // Detectar se é PWA instalado
        if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
        }
        
        // ═══════════════════════════════════════
        // OFFLINE / ONLINE INDICATOR
        // Mostra banner vermelho apenas se ficar sem conexão por 4+ segundos contínuos.
        // Esconde IMEDIATAMENTE ao detectar que a internet voltou.
        // ═══════════════════════════════════════
        (function() {
            const banner = document.createElement('div');
            banner.id = 'offline-banner';
            banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:999999;background:#ef4444;color:white;text-align:center;padding:calc(env(safe-area-inset-top, 28px) + 6px) 12px 8px 12px;font-size:12px;font-weight:600;transform:translateY(-100%);transition:transform 0.3s ease;display:flex;align-items:center;justify-content:center;gap:6px;';
            banner.innerHTML = '<i class="fas fa-wifi-slash" style="font-size:11px;"></i> Sem conexão — dados podem estar desatualizados';
            document.body.appendChild(banner);
            
            let isOffline = false;        // Current displayed state
            let offlineTimer = null;      // Timer ID for the 4-second delay
            let consecutiveFails = 0;     // Counter of consecutive ping failures
            let checkInProgress = false;  // Prevent concurrent checks
            
            async function pingConnectivity() {
                // Single lightweight endpoint to minimize network overhead
                try {
                    const controller = new AbortController();
                    const timeout = setTimeout(() => controller.abort(), 4000);
                    const resp = await fetch('https://api.binance.com/api/v3/ping', {
                        method: 'GET',
                        signal: controller.signal,
                        cache: 'no-store'
                    });
                    clearTimeout(timeout);
                    if (resp.ok) return true;
                } catch (e) {}
                return false;
            }
            
            function showBanner() {
                if (!isOffline) {
                    isOffline = true;
                    banner.style.transform = 'translateY(0)';
                }
            }
            
            function hideBanner() {
                if (isOffline) {
                    isOffline = false;
                    banner.style.transform = 'translateY(-100%)';
                }
                consecutiveFails = 0;
                if (offlineTimer) { clearTimeout(offlineTimer); offlineTimer = null; }
            }
            
            async function checkRealConnectivity() {
                if (checkInProgress) return;
                // Skip checks when app is minimized/hidden to avoid false offline detection
                if (document.visibilityState === 'hidden') return;
                checkInProgress = true;
                
                try {
                    const online = await pingConnectivity();
                    
                    if (online) {
                        hideBanner();
                    } else {
                        consecutiveFails++;
                        
                        if (!isOffline && !offlineTimer) {
                            offlineTimer = setTimeout(async () => {
                                offlineTimer = null;
                                // Re-verify before showing
                                const stillOffline = !(await pingConnectivity());
                                if (stillOffline) {
                                    showBanner();
                                } else {
                                    hideBanner();
                                }
                            }, 4000);
                        }
                    }
                } finally {
                    checkInProgress = false;
                }
            }
            
            // Check on load (com delay para não flashar) + every 60s
            setTimeout(checkRealConnectivity, 2000);
            setInterval(checkRealConnectivity, 60000);
            
            // Browser events como triggers rápidos (then verify com fetch)
            window.addEventListener('online', () => {
                // Online event: wait a moment for connection to stabilize then check
                setTimeout(checkRealConnectivity, 500);
            });
            window.addEventListener('offline', () => {
                // Offline event: check immediately
                checkRealConnectivity();
            });
            
            // When app returns from background, reset offline state and re-check
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') {
                    // App came back to foreground - clear any false offline state
                    consecutiveFails = 0;
                    if (offlineTimer) { clearTimeout(offlineTimer); offlineTimer = null; }
                    // Re-check connectivity after a brief delay
                    setTimeout(checkRealConnectivity, 1000);
                }
            });
        })();
