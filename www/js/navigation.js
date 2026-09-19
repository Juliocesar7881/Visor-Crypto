        // ============================================
        // NAVIGATION
        // ============================================
        const _sectionOrder = { home: 0, dashboard: 1, news: 2, macro: 3, analysis: 4 };
        let _previousSection = 'home';
        let _sectionSwitchToken = 0;
        let _sectionWorkTimer = null;

        function _setActiveNavItem(sectionId) {
            document.querySelectorAll('.nav-item').forEach(nav => {
                const navSection = nav.dataset ? nav.dataset.section : null;
                const inlineHandler = nav.getAttribute('onclick') || '';
                if (navSection === sectionId || inlineHandler.includes(sectionId)) {
                    nav.classList.add('active');
                } else {
                    nav.classList.remove('active');
                }
            });
        }

        function _restoreScrollPosition(scrollY) {
            if (!Number.isFinite(scrollY) || scrollY < 0) return;
            const restore = () => {
                try { window.scrollTo(0, scrollY); } catch (_) {}
            };
            restore();
            requestAnimationFrame(restore);
            setTimeout(restore, 60);
        }

        function _runSectionWork(sectionId) {
            if (sectionId === 'home' && typeof _dirtyFlags !== 'undefined' && _dirtyFlags.home) {
                _dirtyFlags.home = false;
                try { renderAllPrices(); } catch(e) {}
            }
            if ((sectionId === 'home' || sectionId === 'analysis') && typeof _dirtyFlags !== 'undefined' && _dirtyFlags.whale) {
                _dirtyFlags.whale = false;
                try { renderWhaleActivityUI(); } catch(e) {}
            }
            if (sectionId === 'news' && typeof _dirtyFlags !== 'undefined' && _dirtyFlags.news) {
                _dirtyFlags.news = false;
            }
            if (sectionId === 'analysis' && typeof _dirtyFlags !== 'undefined' && _dirtyFlags.analysis) {
                _dirtyFlags.analysis = false;
            }

            if (sectionId === 'news') {
                try {
                    const now = Date.now();
                    const tenMinutes = 10 * 60 * 1000;
                    const hasFreshCache = newsLoaded && allNews.length > 0 && (now - newsLastFetch) < tenMinutes;
                    if (hasFreshCache) {
                        renderNews();
                    } else {
                        const newsContainer = document.getElementById('news-container');
                        if (newsContainer && allNews.length === 0) {
                            newsContainer.innerHTML = '<div class="loading"><div class="spinner"></div><p style="color: var(--text-secondary); margin-top: 12px; font-size: 13px;">Carregando noticias...</p></div>';
                        }
                        fetchNews();
                    }
                } catch(e) {}
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

            if (sectionId !== 'home' && !window._taScanContext) {
                try { if (window.TAEngineV4 && window.TAEngineV4.disconnectAllOrderFlowWS) window.TAEngineV4.disconnectAllOrderFlowWS(); } catch (e) {}
                try { if (window.RealtimeCVD && window.RealtimeCVD.disconnectAll) window.RealtimeCVD.disconnectAll(); } catch (e) {}
            }
            if (sectionId !== 'macro' && window.stopMacroUpdates) {
                try { window.stopMacroUpdates(); } catch (e) {}
            }

            if (sectionId === 'analysis') {
                try { fetchOrderBook(); } catch(e) {}
                try { fetchFearGreed(); } catch(e) {}
                try { fetchVolume(); } catch(e) {}
                try { fetchCryptoStats(); } catch(e) {}
                try { fetchMovingAverages(); } catch(e) {}
                try { fetchWhaleActivity(whaleActivityPeriod || '1h'); } catch(e) {}
            }

            if (sectionId === 'dashboard' && typeof dashLoad === 'function') {
                try { dashLoad(); } catch(e) {}
            }
        }

        function _scheduleSectionWork(sectionId, token, options = {}) {
            if (options.skipWork) return;
            if (_sectionWorkTimer) {
                clearTimeout(_sectionWorkTimer);
                _sectionWorkTimer = null;
            }
            requestAnimationFrame(() => {
                if (token !== _sectionSwitchToken) return;
                _sectionWorkTimer = setTimeout(() => {
                    _sectionWorkTimer = null;
                    if (token !== _sectionSwitchToken) return;
                    _runSectionWork(sectionId);
                }, Number.isFinite(options.workDelay) ? options.workDelay : 30);
            });
        }

        function showSection(sectionId, options = {}) {
            const sectionEl = document.getElementById(sectionId);
            if (!sectionEl) return;

            const token = ++_sectionSwitchToken;
            const isAlreadyActive = sectionEl.classList.contains('active');
            if (isAlreadyActive && !options.force) {
                currentSection = sectionId;
                _setActiveNavItem(sectionId);
                if (Number.isFinite(options.restoreScrollY)) {
                    _restoreScrollPosition(options.restoreScrollY);
                }
                _scheduleSectionWork(sectionId, token, options);
                return;
            }

            const direction = (_sectionOrder[sectionId] ?? 0) >= (_sectionOrder[_previousSection] ?? 0) ? 'right' : 'left';

            document.querySelectorAll('.section').forEach(s => {
                s.classList.remove('active', 'slide-in-right', 'slide-in-left');
            });
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

            sectionEl.classList.add('active');
            if (!options.skipTransition) {
                sectionEl.classList.add(direction === 'right' ? 'slide-in-right' : 'slide-in-left');
            }

            _previousSection = sectionId;
            _setActiveNavItem(sectionId);

            if (Number.isFinite(options.restoreScrollY)) {
                _restoreScrollPosition(options.restoreScrollY);
            } else if (!options.skipScroll) {
                if (!window._appSessionActive) window._appSessionActive = true;
                window.scrollTo(0, 0);
            } else {
                window._appSessionActive = true;
            }

            currentSection = sectionId;
            _scheduleSectionWork(sectionId, token, options);
        }

        document.addEventListener('DOMContentLoaded', () => {
            document.querySelectorAll('.nav-item[data-section]').forEach(nav => {
                if (nav.dataset.navBound === '1') return;
                nav.dataset.navBound = '1';
                nav.addEventListener('click', (event) => {
                    event.preventDefault();
                    const sectionId = nav.dataset.section;
                    if (!sectionId) return;
                    const changed = !document.getElementById(sectionId)?.classList.contains('active');
                    showSection(sectionId);
                    if (changed) window.VisorMonetization?.recordAction('section_change').catch(() => {});
                }, { passive: false });
                nav.addEventListener('keydown', (event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    const sectionId = nav.dataset.section;
                    if (sectionId) showSection(sectionId);
                });
            });
        });

        // Analysis Tab Switcher
        function switchAnalysisTab(tab) {
            document.querySelectorAll('.analysis-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.analysis-panel').forEach(p => p.classList.remove('active'));

            document.querySelectorAll('.analysis-tab').forEach(t => {
                if (t.getAttribute('onclick')?.includes(tab)) {
                    t.classList.add('active');
                }
            });
            const panelEl = document.getElementById(`panel-${tab}`);
            if (panelEl) panelEl.classList.add('active');
        }
