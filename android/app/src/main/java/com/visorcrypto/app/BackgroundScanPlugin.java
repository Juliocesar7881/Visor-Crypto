package com.visorcrypto.app;

import android.content.Intent;
import android.os.Build;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

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

    @PluginMethod()
    public void start(PluginCall call) {
        try {
            int minConfidence = 70;
            String symbolsConfig = null;
            try {
                Integer requested = call.getInt("minConfidence");
                if (requested != null) {
                    minConfidence = Math.max(70, Math.min(100, requested));
                }
            } catch (Exception ignored) {}

            try {
                symbolsConfig = call.getString("symbolsConfig");
            } catch (Exception ignored) {}

            getContext().getSharedPreferences(PREFS, android.content.Context.MODE_PRIVATE)
                .edit()
                .putBoolean(PREF_SERVICE_ENABLED, true)
                .putInt("min_confidence", minConfidence)
                .putString(PREF_SYMBOLS_CONFIG, symbolsConfig != null ? symbolsConfig : "")
                .apply();

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
}
