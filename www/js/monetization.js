(function () {
    'use strict';

    let plugin = null;
    let initialized = false;

    function getPlugin() {
        if (plugin) return plugin;
        const cap = window.Capacitor;
        if (!cap) return null;
        // No @capacitor/core bundle is loaded in the WebView, so registerPlugin is usually
        // missing; the native bridge still exposes registered plugins on Capacitor.Plugins.
        if (cap.Plugins && cap.Plugins.Monetization) {
            plugin = cap.Plugins.Monetization;
        } else if (typeof cap.registerPlugin === 'function') {
            plugin = cap.registerPlugin('Monetization');
        }
        return plugin;
    }

    function setPrivacyButtonVisible(visible) {
        const button = document.getElementById('ad-privacy-options-button');
        if (button) button.hidden = !visible;
    }

    async function initialize() {
        if (initialized) return;
        const nativePlugin = getPlugin();
        if (!nativePlugin) return;
        try {
            const result = await nativePlugin.initialize();
            initialized = result?.initialized === true;
            setPrivacyButtonVisible(result?.privacyOptionsAvailable === true);
        } catch (error) {
            console.warn('[Monetization] Initialization unavailable:', error?.message || error);
        }
    }

    async function refreshPrivacyOptions() {
        const nativePlugin = getPlugin();
        if (!nativePlugin || !initialized) return;
        try {
            const result = await nativePlugin.getStatus();
            setPrivacyButtonVisible(result?.privacyOptionsAvailable === true);
        } catch (error) {
            console.warn('[Monetization] Privacy status unavailable:', error?.message || error);
        }
    }

    async function recordAction(placement) {
        const nativePlugin = getPlugin();
        if (!nativePlugin) return false;
        if (!initialized) await initialize();
        if (!initialized) return false;
        try {
            const result = await nativePlugin.recordAction({ placement: String(placement || '') });
            return result?.shown === true;
        } catch (error) {
            console.warn('[Monetization] Ad request skipped:', error?.message || error);
            return false;
        }
    }

    async function showPrivacyOptions() {
        const nativePlugin = getPlugin();
        if (!nativePlugin) return false;
        try {
            const result = await nativePlugin.showPrivacyOptions();
            return result?.shown === true;
        } catch (error) {
            console.warn('[Monetization] Privacy options unavailable:', error?.message || error);
            return false;
        }
    }

    function updateAnimationState() {
        document.documentElement.classList.toggle('app-backgrounded', document.visibilityState === 'hidden');
    }

    window.VisorMonetization = { initialize, recordAction, showPrivacyOptions };
    window.showAdPrivacyOptions = showPrivacyOptions;

    document.addEventListener('visibilitychange', () => {
        updateAnimationState();
        if (document.visibilityState === 'visible') refreshPrivacyOptions();
    }, { passive: true });
    document.addEventListener('DOMContentLoaded', () => {
        updateAnimationState();
        setTimeout(initialize, 4000);
        setTimeout(refreshPrivacyOptions, 15000);
    });
})();
