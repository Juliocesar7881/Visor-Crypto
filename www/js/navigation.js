        // ============================================
        // NAVIGATION
        // ============================================
        function showSection(sectionId) {
            document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            document.getElementById(sectionId).classList.add('active');
            
            // Ativar nav item correspondente (compatível com Android/Capacitor)
            document.querySelectorAll('.nav-item').forEach(nav => {
                if (nav.getAttribute('onclick')?.includes(sectionId)) {
                    nav.classList.add('active');
                }
            });
            
            // Guardar seção atual para o botão voltar
            currentSection = sectionId;
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
            }
            if (sectionId === 'dashboard') {
                dashLoad();
            }
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
            document.getElementById(`panel-${tab}`).classList.add('active');
        }
