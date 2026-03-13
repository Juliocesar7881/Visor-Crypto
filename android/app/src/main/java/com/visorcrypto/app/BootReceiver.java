package com.visorcrypto.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;

/**
 * Receiver that restarts the ScanForegroundService when the device boots.
 * Declared in AndroidManifest.xml with BOOT_COMPLETED intent-filter.
 */
public class BootReceiver extends BroadcastReceiver {

    private static final String TAG = "VisorBoot";
    private static final String PREFS = "visor_scan";
    private static final String PREF_SERVICE_ENABLED = "service_enabled";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;

        String action = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(action) ||
            Intent.ACTION_MY_PACKAGE_REPLACED.equals(action) ||
            "android.intent.action.QUICKBOOT_POWERON".equals(action)) {

            SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            boolean enabledByUser = prefs.getBoolean(PREF_SERVICE_ENABLED, false);
            if (!enabledByUser) {
                Log.d(TAG, "Service disabled by user, skipping boot start");
                return;
            }

            Log.d(TAG, "Boot/update detected, restarting scan service");

            Intent serviceIntent = new Intent(context, ScanForegroundService.class);
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(serviceIntent);
                } else {
                    context.startService(serviceIntent);
                }
            } catch (Exception e) {
                Log.e(TAG, "Failed to start service on boot: " + e.getMessage());
            }
        }
    }
}
