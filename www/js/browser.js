        // ============================================
        // IN-APP BROWSER
        // ============================================
        let currentBrowserUrl = '';
        let browserReturnToNews = false;
        let lastOpenedNewsIndex = null;
        let lastOpenedHotNewsUrl = null;
        let previousSectionBeforeExternalLink = null;
        let _browserRestoreTimer = null;
        let _browserRestoreInProgress = false;
        let _lastBrowserRestoreAt = 0;
        let _btcHeatmapOpening = false;

        async function getCapacitorBrowserPlugin() {
            try {
                const cap = window.Capacitor;
                if (!cap) return null;
                if (cap.Plugins && cap.Plugins.Browser && typeof cap.Plugins.Browser.open === 'function') {
                    return cap.Plugins.Browser;
                }
                if (typeof cap.registerPlugin === 'function') {
                    const Browser = cap.registerPlugin('Browser');
                    if (Browser && typeof Browser.open === 'function') return Browser;
                }
            } catch (_) {}
            return null;
        }

        async function openUrlWithNativeBrowser(url) {
            const Browser = await getCapacitorBrowserPlugin();
            if (Browser) {
                await Browser.open({
                    url: url,
                    presentationStyle: 'popover'
                });
                return;
            }
            window.open(url, '_blank', 'noopener,noreferrer');
        }

        async function openInAppBrowser(url, title, newsIndex = null, isHotNews = false, hotNewsUrl = null) {
            if (!isValidURL(url)) return;

            currentBrowserUrl = url;
            browserReturnToNews = true;
            lastOpenedNewsIndex = newsIndex;
            lastOpenedHotNewsUrl = hotNewsUrl;

            sessionStorage.setItem('returnToNewsModal', JSON.stringify({
                newsIndex: newsIndex,
                isHotNews: isHotNews,
                hotNewsUrl: hotNewsUrl,
                timestamp: Date.now()
            }));

            try {
                await openUrlWithNativeBrowser(url);
            } catch (e) {
                window.open(url, '_blank', 'noopener,noreferrer');
            }
        }

        async function openExternalLink(url, title, returnSectionOverride = null) {
            if (!isValidURL(url)) return;

            const activeSection = (typeof currentSection !== 'undefined' && currentSection) ? currentSection : 'home';
            const sectionToRestore = returnSectionOverride || activeSection;
            previousSectionBeforeExternalLink = sectionToRestore;
            currentBrowserUrl = url;

            const currentScrollY = Math.max(
                window.scrollY || 0,
                document.documentElement ? (document.documentElement.scrollTop || 0) : 0,
                document.body ? (document.body.scrollTop || 0) : 0
            );
            sessionStorage.setItem('returnToSection', JSON.stringify({
                section: sectionToRestore,
                scrollY: currentScrollY,
                ts: Date.now()
            }));

            try {
                await openUrlWithNativeBrowser(url);
            } catch (e) {
                window.open(url, '_blank', 'noopener,noreferrer');
            }
        }

        function _resetBtcHeatmapButton() {
            const button = document.querySelector('.btc-heatmap-button');
            if (button) {
                button.classList.remove('is-opening');
                button.disabled = false;
            }
            _btcHeatmapOpening = false;
        }

        function openBtcHeatmap() {
            if (_btcHeatmapOpening) return;
            _btcHeatmapOpening = true;

            const button = document.querySelector('.btc-heatmap-button');
            if (button) {
                button.disabled = true;
                button.classList.remove('is-opening');
                void button.offsetWidth;
                button.classList.add('is-opening');
            }

            const url = 'https://www.coinglass.com/pro/futures/LiquidationHeatMap?coin=BTC&type=symbol';
            setTimeout(() => {
                Promise.resolve(openExternalLink(url, 'Heatmap BTC', 'home'))
                    .catch(() => {})
                    .finally(() => setTimeout(_resetBtcHeatmapButton, 450));
            }, 220);
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

        function _scheduleBrowserRestore(delay = 90) {
            if (_browserRestoreTimer) clearTimeout(_browserRestoreTimer);
            _browserRestoreTimer = setTimeout(() => {
                _browserRestoreTimer = null;
                _restoreBrowserStateOnce();
            }, delay);
        }

        function _restoreBrowserStateOnce() {
            const hasSection = !!sessionStorage.getItem('returnToSection');
            const hasNews = !!sessionStorage.getItem('returnToNewsModal');
            if (!hasSection && !hasNews) return false;

            const now = Date.now();
            if (_browserRestoreInProgress || now - _lastBrowserRestoreAt < 250) return true;

            _browserRestoreInProgress = true;
            _lastBrowserRestoreAt = now;
            try {
                restoreSectionIfNeeded();
                restoreNewsModalIfNeeded();
            } finally {
                setTimeout(() => { _browserRestoreInProgress = false; }, 300);
            }
            return true;
        }

        async function initBrowserListener() {
            try {
                const Browser = await getCapacitorBrowserPlugin();
                if (Browser && typeof Browser.addListener === 'function') {
                    Browser.addListener('browserFinished', () => {
                        _scheduleBrowserRestore(30);
                    });
                }

                if (typeof Capacitor !== 'undefined' && Capacitor.Plugins && Capacitor.Plugins.App) {
                    const { App } = Capacitor.Plugins;
                    App.addListener('appStateChange', ({ isActive }) => {
                        if (isActive) _scheduleBrowserRestore(100);
                    });
                }
            } catch (e) {}
        }

        function restoreSectionIfNeeded() {
            const saved = sessionStorage.getItem('returnToSection');
            if (!saved) return false;

            sessionStorage.removeItem('returnToSection');

            let savedSection = null;
            let savedScrollY = 0;
            let ts = 0;
            try {
                const parsed = JSON.parse(saved);
                if (parsed && typeof parsed === 'object') {
                    savedSection = parsed.section || null;
                    savedScrollY = Number(parsed.scrollY || 0);
                    ts = Number(parsed.ts || 0);
                }
            } catch (_) {
                savedSection = saved;
            }

            if (!savedSection) return false;
            if (ts && Date.now() - ts > 15 * 60 * 1000) return false;

            const targetScroll = Number.isFinite(savedScrollY) ? Math.max(0, savedScrollY) : 0;
            if (typeof showSection === 'function') {
                showSection(savedSection, {
                    force: true,
                    skipTransition: true,
                    skipScroll: true,
                    restoreScrollY: targetScroll,
                    workDelay: 80
                });
            } else {
                try { window.scrollTo(0, targetScroll); } catch (_) {}
            }
            return true;
        }

        function restoreNewsModalIfNeeded() {
            try {
                const savedData = sessionStorage.getItem('returnToNewsModal');
                if (!savedData) return false;

                sessionStorage.removeItem('returnToNewsModal');
                const data = JSON.parse(savedData);

                if (Date.now() - Number(data.timestamp || 0) > 300000) {
                    currentBrowserUrl = '';
                    browserReturnToNews = false;
                    return false;
                }

                const modal = document.getElementById('news-modal');
                if (modal && modal.classList.contains('active')) {
                    currentBrowserUrl = '';
                    browserReturnToNews = false;
                    return true;
                }

                if (typeof showSection === 'function') {
                    showSection('news', { skipTransition: true, skipScroll: true, workDelay: 120 });
                }

                if (data.isHotNews && data.hotNewsUrl) {
                    openHotNewsModal(data.hotNewsUrl);
                } else if (data.isHotNews && data.newsIndex !== null && data.newsIndex !== undefined) {
                    openHotNewsModal(data.newsIndex);
                } else if (data.newsIndex !== null && data.newsIndex !== undefined) {
                    openNewsModal(data.newsIndex);
                }

                currentBrowserUrl = '';
                browserReturnToNews = false;
                return true;
            } catch (e) {
                return false;
            }
        }

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                _scheduleBrowserRestore(120);
            }
        });

        document.addEventListener('DOMContentLoaded', initBrowserListener);

        function openCurrentUrlExternal() {
            if (currentBrowserUrl) {
                openExternalLink(currentBrowserUrl);
            }
        }

        window.openInAppBrowser = openInAppBrowser;
        window.openExternalLink = openExternalLink;
        window.openBtcHeatmap = openBtcHeatmap;
        window.closeInAppBrowser = closeInAppBrowser;
        window.openCurrentUrlExternal = openCurrentUrlExternal;

        // Rate limiter para APIs
        const rateLimiter = {
            lastCall: {},
            minInterval: 1000,
            canCall: function(apiName) {
                const now = Date.now();
                if (!this.lastCall[apiName] || (now - this.lastCall[apiName]) > this.minInterval) {
                    this.lastCall[apiName] = now;
                    return true;
                }
                return false;
            }
        };
