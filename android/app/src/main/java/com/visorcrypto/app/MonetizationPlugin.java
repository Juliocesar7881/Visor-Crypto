package com.visorcrypto.app;

import android.content.Context;
import android.content.SharedPreferences;

import com.appodeal.ads.Appodeal;
import com.appodeal.ads.InterstitialCallbacks;
import com.appodeal.ads.initializing.ApdInitializationCallback;
import com.appodeal.ads.initializing.ApdInitializationError;
import com.appodeal.consent.ConsentManager;
import com.appodeal.consent.PrivacyOptionsRequirementStatus;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.TimeUnit;

@CapacitorPlugin(name = "Monetization")
public class MonetizationPlugin extends Plugin implements InterstitialCallbacks {
    private static final String PREFS = "visor_monetization_v1";
    // Interstitials only appear at natural user transitions, gated by a running timer:
    // no ad in the first minutes of a session, a cooldown between ads, a few real
    // actions in between and a daily cap so the experience never feels abusive.
    private static final long SESSION_GRACE_MS = TimeUnit.SECONDS.toMillis(90);
    private static final long MIN_INTERVAL_MS = TimeUnit.MINUTES.toMillis(4);
    private static final int ACTION_POINTS_BEFORE_AD = 3;
    private static final int MAX_ADS_PER_DAY = 12;

    private long sessionStartedAt;

    private boolean initializing;
    private boolean initialized;
    private boolean showInFlight;

    private String appKey() {
        return getContext().getString(R.string.appodeal_app_key).trim();
    }

    private boolean isConfigured() {
        return appKey().matches("[0-9a-fA-F]{48}");
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    @PluginMethod
    public void initialize(PluginCall call) {
        if (!isConfigured()) {
            call.resolve(status(false, "not_configured"));
            return;
        }
        if (initialized) {
            call.resolve(status(true, "ready"));
            return;
        }
        if (initializing) {
            call.resolve(status(true, "initializing"));
            return;
        }

        initializing = true;
        sessionStartedAt = System.currentTimeMillis();
        getActivity().runOnUiThread(() -> {
            try {
                if ((getContext().getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
                    Appodeal.setLogLevel(com.appodeal.ads.utils.Log.LogLevel.verbose);
                }
                Appodeal.setInterstitialCallbacks(this);
                Appodeal.muteVideosIfCallsMuted(true);
                Appodeal.initialize(
                    getActivity(),
                    appKey(),
                    Appodeal.INTERSTITIAL,
                    new ApdInitializationCallback() {
                        @Override
                        public void onInitializationFinished(List<ApdInitializationError> errors) {
                            initializing = false;
                            initialized = Appodeal.isInitialized(Appodeal.INTERSTITIAL);
                            JSObject response = status(true, initialized ? "ready" : "initialization_failed");
                            response.put("adapterErrors", errors == null ? 0 : errors.size());
                            response.put("privacyOptionsAvailable", privacyOptionsRequired());
                            call.resolve(response);
                        }
                    }
                );
            } catch (Exception error) {
                initializing = false;
                call.resolve(status(true, "initialization_failed"));
            }
        });
    }

    @PluginMethod
    public void recordAction(PluginCall call) {
        String placement = safe(call.getString("placement"));
        int points = placementPoints(placement);
        if (points <= 0) {
            call.resolve(status(isConfigured(), "placement_ignored"));
            return;
        }
        if (!initialized) {
            call.resolve(status(isConfigured(), "not_ready"));
            return;
        }

        SharedPreferences preferences = prefs();
        resetDailyCounterIfNeeded(preferences);
        int actions = preferences.getInt("eligible_actions", 0) + points;
        preferences.edit().putInt("eligible_actions", actions).apply();

        long now = System.currentTimeMillis();
        long elapsed = now - preferences.getLong("last_shown_at", 0L);
        int shownToday = preferences.getInt("shown_today", 0);
        boolean frequencyAllowed = now - sessionStartedAt >= SESSION_GRACE_MS
            && elapsed >= MIN_INTERVAL_MS
            && shownToday < MAX_ADS_PER_DAY
            && actions >= ACTION_POINTS_BEFORE_AD;

        if (!frequencyAllowed || showInFlight || !Appodeal.isLoaded(Appodeal.INTERSTITIAL)) {
            JSObject response = status(true, frequencyAllowed ? "loading" : "frequency_limited");
            response.put("shown", false);
            call.resolve(response);
            return;
        }

        showInFlight = true;
        getActivity().runOnUiThread(() -> {
            try {
                boolean accepted = Appodeal.show(getActivity(), Appodeal.INTERSTITIAL);
                if (!accepted) {
                    showInFlight = false;
                }
                JSObject response = status(true, accepted ? "showing" : "show_failed");
                response.put("shown", accepted);
                call.resolve(response);
            } catch (Exception error) {
                showInFlight = false;
                JSObject response = status(true, "show_failed");
                response.put("shown", false);
                call.resolve(response);
            }
        });
    }

    @PluginMethod
    public void showPrivacyOptions(PluginCall call) {
        if (!initialized) {
            call.resolve(status(isConfigured(), "not_ready"));
            return;
        }
        getActivity().runOnUiThread(() -> ConsentManager.showPrivacyOptionsForm(
            getActivity(),
            error -> {
                JSObject response = status(true, error == null ? "privacy_shown" : "privacy_unavailable");
                response.put("shown", error == null);
                call.resolve(response);
            }
        ));
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        JSObject response = status(isConfigured(), initialized ? "ready" : "not_ready");
        response.put("privacyOptionsAvailable", initialized && privacyOptionsRequired());
        call.resolve(response);
    }

    private boolean privacyOptionsRequired() {
        return ConsentManager.getPrivacyOptionsRequirementStatus()
            == PrivacyOptionsRequirementStatus.Required;
    }

    private JSObject status(boolean configured, String state) {
        JSObject result = new JSObject();
        result.put("configured", configured);
        result.put("initialized", initialized);
        result.put("ready", initialized && Appodeal.isLoaded(Appodeal.INTERSTITIAL));
        result.put("provider", "appodeal");
        result.put("state", state);
        return result;
    }

    private void resetDailyCounterIfNeeded(SharedPreferences preferences) {
        String today = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
        if (today.equals(preferences.getString("counter_date", ""))) return;
        preferences.edit()
            .putString("counter_date", today)
            .putInt("shown_today", 0)
            .putInt("eligible_actions", 0)
            .apply();
    }

    private int placementPoints(String placement) {
        switch (placement) {
            case "technical_analysis_transition":
                return 2;
            case "section_change":
            case "news_open":
            case "macro_indicator_open":
            case "macro_event_open":
                return 1;
            default:
                return 0;
        }
    }

    private String safe(String value) {
        return value == null ? "" : value.trim();
    }

    @Override
    public void onInterstitialLoaded(boolean isPrecache) {
        // Appodeal auto-caches the next impression.
    }

    @Override
    public void onInterstitialFailedToLoad() {
        showInFlight = false;
    }

    @Override
    public void onInterstitialShown() {
        SharedPreferences preferences = prefs();
        resetDailyCounterIfNeeded(preferences);
        preferences.edit()
            .putLong("last_shown_at", System.currentTimeMillis())
            .putInt("shown_today", preferences.getInt("shown_today", 0) + 1)
            .putInt("eligible_actions", 0)
            .apply();
    }

    @Override
    public void onInterstitialShowFailed() {
        showInFlight = false;
    }

    @Override
    public void onInterstitialClicked() {
        // No app state changes are tied to ad clicks.
    }

    @Override
    public void onInterstitialClosed() {
        showInFlight = false;
    }

    @Override
    public void onInterstitialExpired() {
        showInFlight = false;
    }
}
