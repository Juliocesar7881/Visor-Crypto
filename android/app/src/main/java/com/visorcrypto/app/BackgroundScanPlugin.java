package com.visorcrypto.app;

import android.content.Intent;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.firebase.messaging.FirebaseMessaging;

import org.json.JSONObject;

/**
 * Capacitor plugin bridge to start/stop the ScanForegroundService from JavaScript.
 * 
 * Usage from JS:
 *   import { Plugins } from '@capacitor/core';
 *   const { BackgroundScan } = Plugins;
 *   BackgroundScan.start();
 *   BackgroundScan.stop();
 */
@CapacitorPlugin(name = "BackgroundScan")
public class BackgroundScanPlugin extends Plugin {

    private static final String PREFS = "visor_scan";
    private static final String PREF_SERVICE_ENABLED = "service_enabled";
    private static final String PREF_SYMBOLS_CONFIG = "symbols_config";
    private static final String PREF_WORKER_URL = "worker_url";
    private static final String PREF_DEVICE_ID = "device_id";
    private static final String PREF_USER_ID = "user_id";
    private static final String PREF_LAST_RESULTS_JSON = "last_results_json";
    private static final String PREF_LAST_RESULTS_UPDATED_AT = "last_results_updated_at";
    private static final String PREF_AUTHORITATIVE_RESULTS_JSON = "authoritative_results_json";
    private static final String PREF_AUTHORITATIVE_RESULTS_UPDATED_AT = "authoritative_results_updated_at";
    private static final String PREF_FCM_TOKEN = "fcm_token";
    private static final String PREF_FCM_TOKEN_UPDATED_AT = "fcm_token_updated_at";
    private static final String PREF_SIGNAL_STATE_RESET_VERSION = "signal_state_reset_version";
    private static final String SIGNAL_STATE_RESET_VERSION = "2026-04-30-clean-v3";

    private void resetSignalStateIfNeeded(android.content.SharedPreferences prefs) {
        if (prefs == null) return;
        if (SIGNAL_STATE_RESET_VERSION.equals(prefs.getString(PREF_SIGNAL_STATE_RESET_VERSION, ""))) {
            return;
        }

        android.content.SharedPreferences.Editor editor = prefs.edit();
        try {
            for (String key : prefs.getAll().keySet()) {
                if (key == null) continue;
                if (key.startsWith("last_") || key.startsWith("last_scan_") || key.startsWith("sync_call_")) {
                    editor.remove(key);
                }
            }
        } catch (Exception ignored) {}

        editor
            .putString(PREF_LAST_RESULTS_JSON, "{}")
            .putLong(PREF_LAST_RESULTS_UPDATED_AT, 0L)
            .putString(PREF_AUTHORITATIVE_RESULTS_JSON, "{}")
            .putLong(PREF_AUTHORITATIVE_RESULTS_UPDATED_AT, 0L)
            .putString(PREF_SIGNAL_STATE_RESET_VERSION, SIGNAL_STATE_RESET_VERSION)
            .apply();
    }

    @PluginMethod()
    public void resetSignalState(PluginCall call) {
        try {
            android.content.SharedPreferences prefs =
                getContext().getSharedPreferences(PREFS, android.content.Context.MODE_PRIVATE);
            prefs.edit().remove(PREF_SIGNAL_STATE_RESET_VERSION).apply();
            resetSignalStateIfNeeded(prefs);
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to reset signal state: " + e.getMessage());
        }
    }

    @PluginMethod()
    public void start(PluginCall call) {
        try {
            android.content.SharedPreferences prefs =
                getContext().getSharedPreferences(PREFS, android.content.Context.MODE_PRIVATE);
            resetSignalStateIfNeeded(prefs);

            int minConfidence = 70;
            String symbolsConfig = null;
            String workerUrl = null;
            String deviceId = null;
            String userId = null;
            try {
                Integer requested = call.getInt("minConfidence");
                if (requested != null) {
                    minConfidence = Math.max(70, Math.min(100, requested));
                }
            } catch (Exception ignored) {}

            try {
                symbolsConfig = call.getString("symbolsConfig");
            } catch (Exception ignored) {}

            try {
                workerUrl = call.getString("workerUrl");
            } catch (Exception ignored) {}

            try {
                deviceId = call.getString("deviceId");
            } catch (Exception ignored) {}

            try {
                userId = call.getString("userId");
            } catch (Exception ignored) {}

            android.content.SharedPreferences.Editor editor = prefs.edit()
                .putBoolean(PREF_SERVICE_ENABLED, true)
                .putInt("min_confidence", minConfidence)
                .putString(PREF_SYMBOLS_CONFIG, symbolsConfig != null ? symbolsConfig : "");

            if (workerUrl != null && !workerUrl.trim().isEmpty()) {
                editor.putString(PREF_WORKER_URL, workerUrl.trim());
            }
            if (deviceId != null && !deviceId.trim().isEmpty()) {
                editor.putString(PREF_DEVICE_ID, deviceId.trim());
            }
            if (userId != null) {
                editor.putString(PREF_USER_ID, userId.trim());
            }

            editor.apply();

            Intent serviceIntent = new Intent(getContext(), ScanForegroundService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                getContext().startForegroundService(serviceIntent);
            } else {
                getContext().startService(serviceIntent);
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to start background scan: " + e.getMessage());
        }
    }

    @PluginMethod()
    public void stop(PluginCall call) {
        try {
            getContext().getSharedPreferences(PREFS, android.content.Context.MODE_PRIVATE)
                .edit()
                .putBoolean(PREF_SERVICE_ENABLED, false)
                .apply();

            Intent serviceIntent = new Intent(getContext(), ScanForegroundService.class);
            serviceIntent.setAction("STOP");
            getContext().startService(serviceIntent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to stop background scan: " + e.getMessage());
        }
    }

    @PluginMethod()
    public void getPushToken(PluginCall call) {
        try {
            android.content.SharedPreferences prefs =
                getContext().getSharedPreferences(PREFS, android.content.Context.MODE_PRIVATE);
            resetSignalStateIfNeeded(prefs);
            String cached = prefs.getString(PREF_FCM_TOKEN, "");
            long cachedAt = prefs.getLong(PREF_FCM_TOKEN_UPDATED_AT, 0L);

            FirebaseMessaging.getInstance().getToken()
                .addOnCompleteListener(task -> {
                    try {
                        if (!task.isSuccessful()) {
                            JSObject response = new JSObject();
                            response.put("token", cached != null ? cached : "");
                            response.put("updatedAt", cachedAt);
                            response.put("source", "cache");
                            call.resolve(response);
                            return;
                        }

                        String token = task.getResult();
                        long now = System.currentTimeMillis();
                        if (token != null && !token.trim().isEmpty()) {
                            prefs.edit()
                                .putString(PREF_FCM_TOKEN, token.trim())
                                .putLong(PREF_FCM_TOKEN_UPDATED_AT, now)
                                .apply();
                        }

                        JSObject response = new JSObject();
                        response.put("token", token != null ? token : "");
                        response.put("updatedAt", now);
                        response.put("source", "firebase");
                        call.resolve(response);
                    } catch (Exception e) {
                        call.reject("Failed to read push token: " + e.getMessage());
                    }
                });
        } catch (Exception e) {
            call.reject("Failed to request push token: " + e.getMessage());
        }
    }

    @PluginMethod()
    public void getLatestResults(PluginCall call) {
        try {
            android.content.SharedPreferences prefs =
                getContext().getSharedPreferences(PREFS, android.content.Context.MODE_PRIVATE);
            resetSignalStateIfNeeded(prefs);

            String raw = prefs.getString(PREF_LAST_RESULTS_JSON, "{}");
            long updatedAt = prefs.getLong(PREF_LAST_RESULTS_UPDATED_AT, 0L);

            JSObject response = new JSObject();
            response.put("updatedAt", updatedAt);

            try {
                response.put("results", new JSObject(raw != null ? raw : "{}"));
            } catch (Exception ignored) {
                response.put("results", new JSObject());
            }

            call.resolve(response);
        } catch (Exception e) {
            call.reject("Failed to read latest background results: " + e.getMessage());
        }
    }

    @PluginMethod()
    public void setAuthoritativeResults(PluginCall call) {
        try {
            String rawResults = "{}";
            Long updatedAt = null;

            try {
                String fromCall = call.getString("results");
                if (fromCall != null && !fromCall.trim().isEmpty()) {
                    rawResults = fromCall;
                }
            } catch (Exception ignored) {}

            try {
                updatedAt = call.getLong("updatedAt");
            } catch (Exception ignored) {}

            JSONObject parsed = new JSONObject(rawResults);
            long safeUpdatedAt = (updatedAt != null && updatedAt > 0)
                ? updatedAt
                : System.currentTimeMillis();

            android.content.SharedPreferences prefs =
                getContext().getSharedPreferences(PREFS, android.content.Context.MODE_PRIVATE);
            resetSignalStateIfNeeded(prefs);

            prefs.edit()
                .putString(PREF_AUTHORITATIVE_RESULTS_JSON, parsed.toString())
                .putLong(PREF_AUTHORITATIVE_RESULTS_UPDATED_AT, safeUpdatedAt)
                .apply();

            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to set authoritative results: " + e.getMessage());
        }
    }
}
