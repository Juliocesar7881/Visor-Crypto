        // ============================================
        // ANDROID BACK BUTTON HANDLER
        // ============================================
        let currentSection = 'home'; // Guarda seção atual
        let lastBackPressTime = 0;
        let _lastModalCloseTime = 0; // Guard contra double-fire do back button

        // Dirty flags para renderização adiada de seções inativas
        const _dirtyFlags = { home: false, news: false, analysis: false, whale: false };

        function handleBackButton() {
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
                        if (window.lockPortrait) await window.lockPortrait();
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
            const eventDetailMacro = document.getElementById('event-detail-modal');
            if (eventDetailMacro) {
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
                dashCallModal.remove();
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
                if (nav.getAttribute('onclick')?.includes(sectionId)) {
                    nav.classList.add('active');
                }
            });
            
            if (sectionId === 'news') fetchNews();
            if (sectionId === 'macro' && window.loadMacroData) window.loadMacroData();
            if (sectionId === 'analysis') {
                fetchOrderBook();
                fetchFearGreed();
                fetchVolume();
                fetchCryptoStats();
                fetchMovingAverages();
            }
            if (sectionId === 'dashboard') dashLoad();
            if (sectionId !== 'dashboard' && typeof dashAbortScan === 'function') dashAbortScan();
        }

        // Listener para botão voltar do Android (Capacitor)
        document.addEventListener('backbutton', function(e) {
            e.preventDefault();
            e.stopPropagation();
            window.backButtonHandled = handleBackButton();
        }, false);

        // Listener para o evento deviceready do Capacitor/Cordova
        document.addEventListener('deviceready', function() {
            document.addEventListener('backbutton', function(e) {
                e.preventDefault();
                e.stopPropagation();
                window.backButtonHandled = handleBackButton();
            }, false);
        }, false);
        
        // Integração com Capacitor App Plugin (método mais confiável)
        let _capacitorAppInitialized = false;
        async function initCapacitorApp() {
            if (_capacitorAppInitialized) return; // Prevent double init
            _capacitorAppInitialized = true;
            try {
                // TRAVAR orientação em PORTRAIT ao iniciar o app
                await lockPortrait();
                
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
        // GDPR / LGPD CONSENT + ADMOB (Banner + Interstitial + App Open)
        // ═══════════════════════════════════════
        const ADMOB_INTERSTITIAL_ID = 'ca-app-pub-6014128977421637/9331870850';
        const ADMOB_BANNER_ID = 'ca-app-pub-6014128977421637/9331870850';
        let admobReady = false;
        let admobLoaded = false;
        let _admobInitStarted = false;
        let _admobConsentGranted = false;
        let userAdConsent = localStorage.getItem('visor_ad_consent'); // 'granted' | 'denied' | null

        // ── Timed interstitial config ──
        let _lastInterstitialTime = 0;
        const AD_TIMED_INTERVAL_MS = 600000;  // Intersticial a cada 10 minutos
        const AD_FIRST_DELAY_MS = 10000;      // Primeiro ad 10s após abrir o app
        
        // AdMob logging (production: console only, no visible badge)
        let _admobDebugEl = null;
        function _admobDebug(msg, color) {
            console.log('[AdMob]', msg);
            // Debug badge disabled in production — uncomment below for debugging
            // if (!_admobDebugEl) {
            //     _admobDebugEl = document.createElement('div');
            //     _admobDebugEl.style.cssText = 'position:fixed;bottom:70px;left:8px;z-index:999999;font-size:9px;padding:3px 8px;border-radius:12px;color:#fff;opacity:0.85;pointer-events:none;max-width:280px;word-break:break-all;';
            //     document.body.appendChild(_admobDebugEl);
            // }
            // _admobDebugEl.style.background = color || '#333';
            // _admobDebugEl.textContent = 'Ad: ' + msg;
            // clearTimeout(_admobDebugEl._timer);
            // _admobDebugEl._timer = setTimeout(() => { if (_admobDebugEl) _admobDebugEl.style.display = 'none'; }, 15000);
            // _admobDebugEl.style.display = 'block';
        }

        // Show consent dialog on first launch (LGPD/GDPR compliance)
        function showAdConsentDialog() {
            return new Promise((resolve) => {
                // Fast path: consent already given
                if (userAdConsent === 'granted' || userAdConsent === 'denied') {
                    return resolve(userAdConsent === 'granted');
                }
                // If dialog already on screen, queue this resolve so when the user
                // finally taps a button ALL callers (incl. the 8s retry) are notified.
                const existing = document.getElementById('ad-consent-overlay');
                if (existing) {
                    existing._pendingResolves = existing._pendingResolves || [];
                    existing._pendingResolves.push(resolve);
                    return;
                }
                const overlay = document.createElement('div');
                overlay.id = 'ad-consent-overlay';
                overlay._pendingResolves = [resolve];
                overlay.style.cssText = 'position:fixed;inset:0;z-index:9999998;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.88);backdrop-filter:blur(14px);padding:16px;animation:fadeInOverlay 0.3s ease;';
                overlay.innerHTML = `
                    <div id="consent-card" style="background:linear-gradient(175deg,#1a1a2e 0%,#0f0f1e 100%);border:1px solid rgba(59,130,246,0.32);border-radius:24px;max-width:420px;width:100%;padding:28px 22px 28px;box-shadow:0 16px 64px rgba(0,0,0,0.6);animation:scaleInCard 0.35s cubic-bezier(0.22,1,0.36,1) forwards;">

                        <!-- header -->
                        <div style="display:flex;align-items:center;gap:14px;margin-bottom:20px;">
                            <div style="width:52px;height:52px;background:linear-gradient(135deg,rgba(59,130,246,0.2),rgba(59,130,246,0.06));border:1.5px solid rgba(59,130,246,0.45);border-radius:16px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                                <span style="font-size:24px;">🔒</span>
                            </div>
                            <div>
                                <div style="font-size:16px;color:#60a5fa;font-weight:900;letter-spacing:0.3px;">Privacidade & Anúncios</div>
                                <div style="font-size:11px;color:#6b7280;margin-top:3px;">Escolha como preferir</div>
                            </div>
                        </div>

                        <!-- explanation card -->
                        <div style="background:rgba(59,130,246,0.07);border:1px solid rgba(59,130,246,0.2);border-radius:14px;padding:14px 16px;margin-bottom:16px;">
                            <div style="font-size:12px;color:#d1d5db;line-height:1.75;">
                                <div style="display:flex;align-items:flex-start;gap:9px;margin-bottom:10px;">
                                    <span style="color:#34d399;flex-shrink:0;margin-top:2px;">✦</span>
                                    <span>O <strong style="color:#e5e7eb;">Visor Crypto</strong> usa <strong>Google AdMob</strong> para manter o app completamente gratuito.</span>
                                </div>
                                <div style="display:flex;align-items:flex-start;gap:9px;margin-bottom:10px;">
                                    <span style="color:#60a5fa;flex-shrink:0;margin-top:2px;">✦</span>
                                    <span><strong style="color:#93c5fd;">Aceitar:</strong> anúncios personalizados (mais relevantes para você).</span>
                                </div>
                                <div style="display:flex;align-items:flex-start;gap:9px;">
                                    <span style="color:#6b7280;flex-shrink:0;margin-top:2px;">✦</span>
                                    <span><strong style="color:#9ca3af;">Recusar:</strong> anúncios genéricos, sem rastreamento adicional.</span>
                                </div>
                            </div>
                        </div>

                        <p style="font-size:10px;color:#4b5563;line-height:1.7;text-align:center;margin-bottom:20px;padding:0 4px;">Você pode alterar essa escolha nas configurações do dispositivo a qualquer momento.</p>

                        <!-- buttons -->
                        <div style="display:flex;gap:12px;margin-bottom:14px;">
                            <button id="consent-deny"
                                style="flex:1;height:54px;padding:0 10px;background:rgba(255,255,255,0.04);border:1.5px solid rgba(255,255,255,0.1);border-radius:15px;color:#9ca3af;font-weight:700;font-size:13px;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;transition:transform 0.12s,opacity 0.12s;display:flex;align-items:center;justify-content:center;gap:6px;">
                                <i class="fas fa-times"></i> Recusar
                            </button>
                            <button id="consent-accept"
                                style="flex:2;height:54px;padding:0 10px;background:linear-gradient(135deg,rgba(59,130,246,0.28) 0%,rgba(59,130,246,0.14) 100%);border:1.5px solid rgba(59,130,246,0.65);border-radius:15px;color:#60a5fa;font-weight:800;font-size:14px;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;transition:transform 0.12s,opacity 0.12s;display:flex;align-items:center;justify-content:center;gap:7px;">
                                <i class="fas fa-check-circle"></i> Aceitar e Continuar
                            </button>
                        </div>
                        <a href="privacy-policy.html" target="_blank" style="display:block;text-align:center;color:#374151;font-size:10px;text-decoration:underline;">Política de Privacidade</a>
                    </div>
                `;
                // Block any interaction outside buttons (overlay tap must not dismiss)
                overlay.addEventListener('click', (e) => { if (e.target === overlay) e.stopPropagation(); });
                overlay.addEventListener('touchend', (e) => { if (e.target === overlay) e.preventDefault(); });
                // Block background scroll while overlay is open
                overlay.addEventListener('touchmove', (e) => {
                    const card = overlay.querySelector('#consent-card');
                    if (card && card.contains(e.target)) return;
                    e.preventDefault();
                }, { passive: false });
                document.body.style.overflow = 'hidden';
                document.documentElement.style.overflow = 'hidden';
                document.body.appendChild(overlay);

                // ── Single-tap guard: prevents double-fire from click+touchend on WebView ──
                let _consentHandled = false;
                function handleConsent(granted) {
                    if (_consentHandled) return;
                    _consentHandled = true;
                    const val = granted ? 'granted' : 'denied';
                    localStorage.setItem('visor_ad_consent', val);
                    userAdConsent = val;
                    overlay.style.opacity = '0';
                    overlay.style.transition = 'opacity 0.28s';
                    setTimeout(() => {
                        overlay.remove();
                        document.body.style.overflow = '';
                        document.documentElement.style.overflow = '';
                    }, 295);
                    // Resolve ALL pending callers (incl. the 8-second initAdMob retry)
                    (overlay._pendingResolves || []).forEach(r => r(granted));
                }

                const btnAccept = overlay.querySelector('#consent-accept');
                const btnDeny   = overlay.querySelector('#consent-deny');
                [btnAccept, btnDeny].forEach(btn => {
                    const isAccept = btn.id === 'consent-accept';
                    let _cTouchStart = 0;
                    // Visual feedback
                    btn.addEventListener('pointerdown', () => { btn.style.transform = 'scale(0.96)'; btn.style.opacity = '0.8'; });
                    btn.addEventListener('pointerup',   () => { btn.style.transform = ''; btn.style.opacity = ''; });
                    btn.addEventListener('pointercancel', () => { btn.style.transform = ''; btn.style.opacity = ''; });
                    // Tap guard: only fire on quick taps (<400ms), not press-and-hold
                    btn.addEventListener('touchstart', () => { _cTouchStart = Date.now(); }, { passive: true });
                    btn.addEventListener('touchend', (e) => {
                        e.preventDefault();
                        // Always reset visual state (pointerup may not fire after preventDefault)
                        btn.style.transform = ''; btn.style.opacity = '';
                        if (Date.now() - _cTouchStart < 400) handleConsent(isAccept);
                    });
                    // Fallback for desktop / mouse (only if no touch was used)
                    btn.addEventListener('click', () => { if (!_cTouchStart) handleConsent(isAccept); });
                });
            });
        }

        async function initAdMob() {
            if (_admobInitStarted) return; // Guard against double initialization
            _admobInitStarted = true;
            
            _admobDebug('Iniciando...', '#2563eb');
            try {
                if (!window.Capacitor) {
                    _admobDebug('Capacitor ausente', '#ef4444');
                    _admobInitStarted = false;
                    return;
                }
                
                // Try multiple ways to access the AdMob plugin
                let AdMob = null;
                if (window.Capacitor.Plugins && window.Capacitor.Plugins.AdMob) {
                    AdMob = window.Capacitor.Plugins.AdMob;
                    _admobDebug('Plugin encontrado em Plugins', '#2563eb');
                } else if (window.Capacitor.registerPlugin) {
                    AdMob = window.Capacitor.registerPlugin('AdMob');
                    _admobDebug('Plugin registrado via registerPlugin', '#2563eb');
                }
                
                if (!AdMob) {
                    _admobDebug('Plugin NAO disponivel!', '#ef4444');
                    _admobInitStarted = false;
                    return;
                }
                
                // Ask for consent before initializing
                const consentGranted = await showAdConsentDialog();
                _admobConsentGranted = consentGranted;
                
                window._AdMob = AdMob;
                
                // Register listeners with error handling
                try {
                    AdMob.addListener('interstitialAdLoaded', () => { 
                        admobLoaded = true; 
                        _admobDebug('Ad carregado! Pronto.', '#22c55e');
                    });
                    AdMob.addListener('interstitialAdFailedToLoad', (info) => {
                        admobLoaded = false;
                        _admobDebug('Falha ao carregar: ' + JSON.stringify(info), '#ef4444');
                        setTimeout(() => prepareInterstitial(), 15000);
                    });
                    AdMob.addListener('interstitialAdDismissed', () => {
                        admobLoaded = false;
                        setTimeout(() => prepareInterstitial(), 3000);
                    });
                    AdMob.addListener('interstitialAdFailedToShow', (info) => {
                        admobLoaded = false;
                        console.warn('[AdMob] Failed to show:', JSON.stringify(info));
                        setTimeout(() => prepareInterstitial(), 5000);
                    });
                } catch (listenerErr) {
                    console.warn('[AdMob] Listener setup error:', listenerErr?.message || listenerErr);
                }
                
                await AdMob.initialize({
                    initializeForTesting: false,
                    tagForChildDirectedTreatment: false,
                    tagForUnderAgeOfConsent: false,
                    maxAdContentRating: 'General'
                });
                admobReady = true;
                _admobDebug('Inicializado! Carregando ad...', '#f59e0b');
                
                await prepareInterstitial();
                
                // Rapid follow-up retries if first prepare didn't load
                if (!admobLoaded) {
                    setTimeout(() => { if (!admobLoaded) prepareInterstitial(); }, 10000);
                    setTimeout(() => { if (!admobLoaded) prepareInterstitial(); }, 25000);
                }
                
                // Periodic retry: ensure an ad is always pre-loaded (60s, skip when hidden)
                setInterval(() => {
                    if (admobReady && !admobLoaded && document.visibilityState !== 'hidden') {
                        prepareInterstitial();
                    }
                }, 60000);

                // ── Banner Ad ──
                showBannerAd();


            } catch (e) {
                _admobDebug('Erro init: ' + (e?.message || e), '#ef4444');
                _admobInitStarted = false;
            }
        }
        
        async function prepareInterstitial() {
            if (!admobReady || !window._AdMob) return;
            try {
                await window._AdMob.prepareInterstitial({
                    adId: ADMOB_INTERSTITIAL_ID,
                    isTesting: false,
                    npa: !_admobConsentGranted
                });
                admobLoaded = true;
                _admobDebug('Ad preparado OK', '#22c55e');
            } catch (e) {
                admobLoaded = false;
                const errMsg = e?.message || String(e);
                // "Publisher data not found" = AdMob account not yet approved; retry silently later
                if (errMsg.includes('Publisher') || errMsg.includes('No fill') || errMsg.includes('network')) {
                    _admobDebug('Ad indisponível, tentando depois...', '#f59e0b');
                } else {
                    _admobDebug('Erro prepare: ' + errMsg, '#ef4444');
                }
            }
        }
        
        async function showInterstitialAd() {
            if (!admobReady || !window._AdMob) {
                _admobDebug('showAd: nao inicializado', '#f59e0b');
                if (!_admobInitStarted) initAdMob();
                return false;
            }
            
            // If ad not loaded yet, try to prepare and wait briefly
            if (!admobLoaded) {
                console.log('[AdMob] Ad not loaded, attempting quick prepare...');
                try {
                    await prepareInterstitial();
                    // Wait up to 5 seconds for the ad to be ready
                    for (let i = 0; i < 10; i++) {
                        if (admobLoaded) break;
                        await new Promise(r => setTimeout(r, 500));
                    }
                } catch(e) {}
            }
            
            if (!admobLoaded) {
                console.log('[AdMob] Ad still not loaded after retry, skipping');
                return false;
            }
            
            try {
                await window._AdMob.showInterstitial();
                console.log('[AdMob] Ad shown successfully');
                admobLoaded = false;
                _lastInterstitialTime = Date.now();
                setTimeout(() => prepareInterstitial(), 3000);
                return true;
            } catch (e) {
                console.warn('[AdMob] Show error:', e?.message || e);
                admobLoaded = false;
                setTimeout(() => prepareInterstitial(), 5000);
                return false;
            }
        }



        // ═══════════════════════════════════════
        // BANNER AD (persistent bottom, above nav)
        // ═══════════════════════════════════════
        async function showBannerAd() {
            if (!admobReady || !window._AdMob) return;
            try {
                // Listen for banner events to only adjust layout when banner is truly visible
                try {
                    window._AdMob.addListener('bannerAdSizeChanged', (info) => {
                        if (info && info.height > 0) {
                            document.body.classList.add('has-banner-ad');
                        }
                    });
                    window._AdMob.addListener('bannerAdFailedToLoad', () => {
                        document.body.classList.remove('has-banner-ad');
                        setTimeout(() => showBannerAd(), 30000);
                    });
                } catch(e) {}

                await window._AdMob.showBanner({
                    adId: ADMOB_BANNER_ID,
                    adSize: 'ADAPTIVE_BANNER',
                    position: 'BOTTOM_CENTER',
                    margin: 0,
                    isTesting: false,
                    npa: !_admobConsentGranted
                });
                _admobDebug('Banner solicitado', '#f59e0b');
            } catch (e) {
                _admobDebug('Banner erro: ' + (e?.message || e), '#ef4444');
                document.body.classList.remove('has-banner-ad');
                setTimeout(() => showBannerAd(), 30000);
            }
        }

        // Track when app goes to background / foreground (pause/resume timer)
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                if (window._timedAdInterval) { clearInterval(window._timedAdInterval); window._timedAdInterval = null; }
            } else if (document.visibilityState === 'visible') {
                _startTimedInterstitial();
            }
        });

        // ── Timed interstitial (every 10 min, first at 10s) ──
        function _startTimedInterstitial() {
            if (window._timedAdInterval) return; // already running
            window._timedAdInterval = setInterval(() => {
                if (document.visibilityState !== 'visible') return;
                _admobDebug('Timed interstitial (10min)', '#6366f1');
                showInterstitialAd().catch(() => {});
            }, AD_TIMED_INTERVAL_MS);
        }
        // First ad: 10s AFTER both initial screens are dismissed, then start 10-min cycle
        function _waitForScreensThenStartAds() {
            const check = setInterval(() => {
                // Wait until both disclaimer and consent overlay are gone
                if (document.getElementById('first-launch-disclaimer')) return;
                if (document.getElementById('ad-consent-overlay')) return;
                clearInterval(check);
                // Both screens dismissed — start the 10s countdown
                setTimeout(() => {
                    if (admobReady) {
                        _admobDebug('Primeiro ad (10s após telas iniciais)', '#6366f1');
                        showInterstitialAd().catch(() => {});
                    }
                    _startTimedInterstitial();
                }, AD_FIRST_DELAY_MS);
            }, 500);
        }
        _waitForScreensThenStartAds();
        
        // Initialize AdMob when Capacitor is ready (with retry cascade)
        document.addEventListener('DOMContentLoaded', () => setTimeout(initAdMob, 1000));
        window.addEventListener('load', () => setTimeout(initAdMob, 3000));
        // Third retry: if still not ready after 8s, reset guard and try again
        // Skip if consent dialog is still on screen (user may still be reading it)
        setTimeout(() => { 
            if (!admobReady && !document.getElementById('ad-consent-overlay')) { 
                _admobInitStarted = false; 
                initAdMob(); 
            } 
        }, 8000);
        
        // Listener para evento customizado do Android (MainActivity.java)
        document.addEventListener('androidBackButton', function(e) {
            e.preventDefault();
            window.backButtonHandled = handleBackButton();
        }, false);
        
        // Inicializar variável global
        window.backButtonHandled = true;

        // Fallback: popstate para navegadores (suporta swipe back)
        window.addEventListener('popstate', function(e) {
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
