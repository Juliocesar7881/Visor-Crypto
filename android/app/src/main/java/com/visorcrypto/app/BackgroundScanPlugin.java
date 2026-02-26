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

    @PluginMethod()
    public void start(PluginCall call) {
        try {
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
            Intent serviceIntent = new Intent(getContext(), ScanForegroundService.class);
            serviceIntent.setAction("STOP");
            getContext().startService(serviceIntent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to stop background scan: " + e.getMessage());
        }
    }
}
