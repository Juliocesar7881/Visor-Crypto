package com.visorcrypto.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import android.os.LocaleList;
import android.app.LocaleManager;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.firebase.messaging.FirebaseMessaging;

import org.json.JSONObject;
import org.json.JSONArray;

import java.util.concurrent.atomic.AtomicBoolean;

@CapacitorPlugin(name = "BackgroundScan")
public class BackgroundScanPlugin extends Plugin {
    private static final String PREFS = SignalBackgroundCoordinator.PREFS;
    private static final String RESET_MARKER = "2026-06-15-inverse-long-short-v1";
    private static final long RESULT_MAX_AGE_MS = 10 * 60 * 1000L;
    private static final long SCAN_STUCK_MS = 10 * 60 * 1000L;

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private void resetSignalStateIfNeeded(SharedPreferences prefs) {
        if (RESET_MARKER.equals(prefs.getString("signal_state_reset_version", ""))) return;
        SharedPreferences.Editor editor = prefs.edit();
        for (String key : prefs.getAll().keySet()) {
            if (key != null && (key.startsWith("last_") || key.startsWith("sync_call_"))) editor.remove(key);
        }
        editor.putString("last_results_json", "{}")
            .putLong("last_results_updated_at", 0L)
            .putString("authoritative_results_json", "{}")
            .putLong("authoritative_results_updated_at", 0L)
            .putString("signal_state_reset_version", RESET_MARKER)
            .apply();
    }

    @PluginMethod
    public void resetSignalState(PluginCall call) {
        try {
            SharedPreferences prefs = prefs();
            prefs.edit().remove("signal_state_reset_version").apply();
            resetSignalStateIfNeeded(prefs);
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to reset signal state: " + e.getMessage());
        }
    }

    @PluginMethod
    public void start(PluginCall call) {
        try {
            SharedPreferences prefs = prefs();
            resetSignalStateIfNeeded(prefs);
            int minConfidence = Math.max(70, Math.min(100, valueOr(call.getInt("minConfidence"), 70)));
            String symbolsConfig = stringOrEmpty(call.getString("symbolsConfig"));
            String workerUrl = stringOrEmpty(call.getString("workerUrl"));
            String deviceId = stringOrEmpty(call.getString("deviceId"));
            String deviceSecret = stringOrEmpty(call.getString("deviceSecret"));
            String userId = stringOrEmpty(call.getString("userId"));

            SharedPreferences.Editor editor = prefs.edit()
                .putBoolean(SignalBackgroundCoordinator.PREF_SERVICE_ENABLED, true)
                .putInt("min_confidence", minConfidence)
                .putString(SignalBackgroundCoordinator.PREF_SYMBOLS_CONFIG, symbolsConfig)
                .putString("selected_locale", "system")
                .putString("background_status", "syncing");
            if (!workerUrl.isEmpty()) editor.putString("worker_url", workerUrl);
            if (!deviceId.isEmpty()) editor.putString("device_id", deviceId);
            if (!deviceSecret.isEmpty()) editor.putString("device_secret", deviceSecret);
            if (!userId.isEmpty()) editor.putString("user_id", userId);
            editor.apply();

            SignalBackgroundCoordinator.stopLegacyService(getContext());
            SignalBackgroundCoordinator.schedulePeriodic(getContext());
            SignalBackgroundCoordinator.requestImmediate(getContext());

            AtomicBoolean resolved = new AtomicBoolean(false);
            Handler handler = new Handler(Looper.getMainLooper());
            Runnable timeout = () -> {
                if (!resolved.compareAndSet(false, true)) return;
                JSObject response = monitorResponse(prefs);
                response.put("topicsReady", false);
                response.put("topicSyncPending", true);
                call.resolve(response);
            };
            handler.postDelayed(timeout, 8000L);
            SignalBackgroundCoordinator.syncTopics(getContext()).addOnCompleteListener(task -> {
                if (!resolved.compareAndSet(false, true)) return;
                handler.removeCallbacks(timeout);
                JSObject response = monitorResponse(prefs);
                response.put("topicsReady", task.isSuccessful());
                response.put("topicSyncPending", false);
                call.resolve(response);
            });
        } catch (Exception e) {
            call.reject("Failed to start background monitoring: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        try {
            SharedPreferences prefs = prefs();
            prefs.edit()
                .putBoolean(SignalBackgroundCoordinator.PREF_SERVICE_ENABLED, false)
                .putString("background_status", "disabled")
                .apply();
            SignalBackgroundCoordinator.cancel(getContext());
            SignalBackgroundCoordinator.syncTopics(getContext());
            call.resolve(monitorResponse(prefs));
        } catch (Exception e) {
            call.reject("Failed to stop background monitoring: " + e.getMessage());
        }
    }

    @PluginMethod
    public void syncTopics(PluginCall call) {
        try {
            SignalBackgroundCoordinator.syncTopics(getContext()).addOnCompleteListener(task -> {
                JSObject response = monitorResponse(prefs());
                response.put("topicsReady", task.isSuccessful());
                call.resolve(response);
            });
        } catch (Exception e) {
            call.reject("Failed to sync signal topics: " + e.getMessage());
        }
    }

    @PluginMethod
    public void setLocale(PluginCall call) {
        prefs().edit().putString("selected_locale", "system").apply();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            LocaleManager localeManager = getContext().getSystemService(LocaleManager.class);
            if (localeManager != null) {
                localeManager.setApplicationLocales(LocaleList.getEmptyLocaleList());
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void getPushToken(PluginCall call) {
        SharedPreferences prefs = prefs();
        FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
            JSObject response = new JSObject();
            if (!task.isSuccessful() || task.getResult() == null) {
                response.put("token", prefs.getString("fcm_token", ""));
                response.put("updatedAt", prefs.getLong("fcm_token_updated_at", 0L));
                response.put("source", "cache");
                call.resolve(response);
                return;
            }
            String token = task.getResult().trim();
            long now = System.currentTimeMillis();
            prefs.edit().putString("fcm_token", token).putLong("fcm_token_updated_at", now).apply();
            response.put("token", token);
            response.put("updatedAt", now);
            response.put("source", "firebase");
            call.resolve(response);
        });
    }

    @PluginMethod
    public void getLatestResults(PluginCall call) {
        try {
            SharedPreferences prefs = prefs();
            resetSignalStateIfNeeded(prefs);
            JSObject response = monitorResponse(prefs);
            try {
                response.put("results", new JSObject(prefs.getString("last_results_json", "{}")));
            } catch (Exception ignored) {
                response.put("results", new JSObject());
            }
            try {
                response.put("calls", new JSONArray(prefs.getString(SignalNotificationHelper.PREF_NATIVE_CALLS, "[]")));
            } catch (Exception ignored) {
                response.put("calls", new JSONArray());
            }
            call.resolve(response);
        } catch (Exception e) {
            call.reject("Failed to read latest background results: " + e.getMessage());
        }
    }

    @PluginMethod
    public void requestScanNow(PluginCall call) {
        try {
            SharedPreferences prefs = prefs();
            boolean enabled = prefs.getBoolean(SignalBackgroundCoordinator.PREF_SERVICE_ENABLED, false);
            long maxAgeMs = Math.max(60_000L, Math.min(60 * 60_000L, valueOr(call.getLong("maxAgeMs"), RESULT_MAX_AGE_MS)));
            long updatedAt = prefs.getLong("last_results_updated_at", 0L);
            boolean stale = updatedAt <= 0L || (System.currentTimeMillis() - updatedAt) > maxAgeMs;
            if (enabled && stale) SignalBackgroundCoordinator.requestImmediate(getContext());
            JSObject response = monitorResponse(prefs);
            response.put("requested", enabled && stale);
            call.resolve(response);
        } catch (Exception e) {
            call.reject("Failed to request background refresh: " + e.getMessage());
        }
    }

    @PluginMethod
    public void setAuthoritativeResults(PluginCall call) {
        try {
            String raw = stringOrEmpty(call.getString("results"));
            if (raw.isEmpty()) raw = "{}";
            JSONObject parsed = new JSONObject(raw);
            long updatedAt = valueOr(call.getLong("updatedAt"), System.currentTimeMillis());
            prefs().edit()
                .putString("authoritative_results_json", parsed.toString())
                .putLong("authoritative_results_updated_at", updatedAt)
                .apply();
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to set authoritative results: " + e.getMessage());
        }
    }

    private JSObject monitorResponse(SharedPreferences prefs) {
        long now = System.currentTimeMillis();
        long updatedAt = prefs.getLong("last_results_updated_at", 0L);
        long startedAt = prefs.getLong("last_scan_started_at", 0L);
        long finishedAt = prefs.getLong("last_scan_finished_at", 0L);
        boolean enabled = prefs.getBoolean(SignalBackgroundCoordinator.PREF_SERVICE_ENABLED, false);
        boolean running = prefs.getBoolean("scan_in_progress", false);
        long ageMs = updatedAt > 0L ? Math.max(0L, now - updatedAt) : -1L;
        boolean stale = updatedAt <= 0L || ageMs > RESULT_MAX_AGE_MS;
        boolean stuck = running && startedAt > 0L && (now - startedAt) > SCAN_STUCK_MS && finishedAt < startedAt;
        if (stuck) {
            running = false;
            prefs.edit().putBoolean("scan_in_progress", false).putString("background_status", "offline").apply();
            SignalBackgroundCoordinator.requestImmediate(getContext());
        }
        boolean permission = SignalNotificationHelper.hasNotificationPermission(getContext());
        boolean topicsReady = prefs.getBoolean(SignalBackgroundCoordinator.PREF_TOPIC_SYNC_OK, false)
            && !SignalBackgroundCoordinator.storedTopics(prefs).isEmpty();
        String monitorStatus = !enabled ? "disabled"
            : !permission ? "no_permission"
            : running ? "syncing"
            : stale ? "offline"
            : "active";

        JSObject response = new JSObject();
        response.put("updatedAt", updatedAt);
        response.put("lastResultsUpdatedAt", updatedAt);
        response.put("lastScanStartedAt", startedAt);
        response.put("lastScanFinishedAt", finishedAt);
        response.put("lastPushReceivedAt", prefs.getLong("last_push_received_at", 0L));
        response.put("lastNotificationAt", prefs.getLong("last_notification_at", 0L));
        response.put("scanInProgress", running);
        response.put("serviceEnabled", enabled);
        response.put("workManagerEnabled", enabled);
        response.put("notificationPermission", permission);
        response.put("topicsReady", topicsReady);
        response.put("topicSyncAt", prefs.getLong(SignalBackgroundCoordinator.PREF_TOPIC_SYNC_AT, 0L));
        response.put("ageMs", ageMs);
        response.put("stale", stale);
        response.put("stuck", stuck);
        response.put("status", monitorStatus);
        response.put("monitorStatus", monitorStatus);
        response.put("error", prefs.getString("background_error", ""));
        return response;
    }

    private static String stringOrEmpty(String value) {
        return value == null ? "" : value.trim();
    }

    private static int valueOr(Integer value, int fallback) {
        return value == null ? fallback : value;
    }

    private static long valueOr(Long value, long fallback) {
        return value == null ? fallback : value;
    }
}
