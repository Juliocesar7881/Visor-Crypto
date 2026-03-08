        // ============================================
        // NAVIGATION
        // ============================================
        function showSection(sectionId) {
            document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            const sectionEl = document.getElementById(sectionId);
            if (sectionEl) sectionEl.classList.add('active');
            
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
                const fiveMinutes = 5 * 60 * 1000;
                if (newsLoaded && allNews.length > 0 && (now - newsLastFetch) < fiveMinutes) {
                    // Usar cache - apenas renderizar o que já tem
                    renderNews();
                } else {
                    // Recarregar notícias
                    fetchNews();
                }
            }
            if (sectionId === 'macro' && window.loadMacroData) window.loadMacroData();
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

