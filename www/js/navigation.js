        // ============================================
        // NAVIGATION
        // ============================================
        const _sectionOrder = { home: 0, dashboard: 1, news: 2, macro: 3, analysis: 4 };
        let _previousSection = 'home';

        function showSection(sectionId) {
            const direction = (_sectionOrder[sectionId] ?? 0) >= (_sectionOrder[_previousSection] ?? 0) ? 'right' : 'left';
            
            document.querySelectorAll('.section').forEach(s => {
                s.classList.remove('active', 'slide-in-right', 'slide-in-left');
            });
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            const sectionEl = document.getElementById(sectionId);
            if (sectionEl) {
                sectionEl.classList.add('active');
                sectionEl.classList.add(direction === 'right' ? 'slide-in-right' : 'slide-in-left');
            }
            
            _previousSection = sectionId;
            
            // Ativar nav item correspondente (compatível com Android/Capacitor)
            document.querySelectorAll('.nav-item').forEach(nav => {
                if (nav.getAttribute('onclick')?.includes(sectionId)) {
                    nav.classList.add('active');
                }
            });
            
            // Scroll to top on fresh app start (not when returning from background)
            if (!window._appSessionActive) {
                window._appSessionActive = true;
                window.scrollTo(0, 0);
            } else {
                // Always scroll top when switching sections
                window.scrollTo(0, 0);
            }

            // Guardar seção atual para o botão voltar
            currentSection = sectionId;

            // Renderizar seções marcadas como "dirty" ao navegar para elas
            if (sectionId === 'home' && _dirtyFlags.home) {
                _dirtyFlags.home = false;
                try { renderAllPrices(); } catch(e) {}
            }
            if ((sectionId === 'home' || sectionId === 'analysis') && _dirtyFlags.whale) {
                _dirtyFlags.whale = false;
                try { renderWhaleActivityUI(); } catch(e) {}
            }
            if (sectionId === 'news' && _dirtyFlags.news) {
                _dirtyFlags.news = false;
            }
            if (sectionId === 'analysis' && _dirtyFlags.analysis) {
                _dirtyFlags.analysis = false;
            }

            // News: usar cache se já carregou e não passou 5 minutos
            if (sectionId === 'news') {
                const now = Date.now();
                const tenMinutes = 10 * 60 * 1000;
                const hasFreshCache = newsLoaded && allNews.length > 0 && (now - newsLastFetch) < tenMinutes;
                if (hasFreshCache) {
                    // Usar cache - apenas renderizar o que já tem
                    renderNews();
                } else {
                    const newsContainer = document.getElementById('news-container');
                    if (newsContainer && allNews.length === 0) {
                        newsContainer.innerHTML = '<div class="loading"><div class="spinner"></div><p style="color: var(--text-secondary); margin-top: 12px; font-size: 13px;">Carregando notícias...</p></div>';
                    }
                    // Recarregar notícias
                    fetchNews();
                }
            }
            if (sectionId === 'macro') {
                if (window.loadMacroData) {
                    Promise.resolve(window.loadMacroData()).then(() => {
                        if (window.updateAllIndicators) {
                            setTimeout(() => window.updateAllIndicators(), 50);
                        }
                    }).catch(() => {});
                }
            }
            if (sectionId !== 'home') {
                try { if (window.TAEngineV4 && window.TAEngineV4.disconnectAllOrderFlowWS) window.TAEngineV4.disconnectAllOrderFlowWS(); } catch (e) {}
                try { if (window.RealtimeCVD && window.RealtimeCVD.disconnectAll) window.RealtimeCVD.disconnectAll(); } catch (e) {}
            }
            if (sectionId !== 'macro' && window.stopMacroUpdates) {
                try { window.stopMacroUpdates(); } catch (e) {}
            }
            if (sectionId === 'analysis') {
                fetchOrderBook();
                fetchFearGreed();
                fetchVolume();
                fetchCryptoStats();
                fetchMovingAverages();
                try { fetchWhaleActivity(whaleActivityPeriod || '1h'); } catch(e) {}
            }
            if (sectionId === 'dashboard') {
                dashLoad();
            }
            if (sectionId !== 'dashboard' && typeof dashAbortScan === 'function') dashAbortScan();
        }

        // Analysis Tab Switcher
        function switchAnalysisTab(tab) {
            document.querySelectorAll('.analysis-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.analysis-panel').forEach(p => p.classList.remove('active'));
            
            // Ativar tab correspondente (compatível com Android/Capacitor)
            document.querySelectorAll('.analysis-tab').forEach(t => {
                if (t.getAttribute('onclick')?.includes(tab)) {
                    t.classList.add('active');
                }
            });
            const panelEl = document.getElementById(`panel-${tab}`);
            if (panelEl) panelEl.classList.add('active');
        }

