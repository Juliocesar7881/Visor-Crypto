package com.visorcrypto.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.util.Log;
import android.os.Handler;
import android.os.Looper;

import java.util.concurrent.atomic.AtomicBoolean;

public class BootReceiver extends BroadcastReceiver {
    private static final String TAG = "VisorBoot";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (!Intent.ACTION_BOOT_COMPLETED.equals(action)
            && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)
            && !"android.intent.action.QUICKBOOT_POWERON".equals(action)) return;

        SharedPreferences prefs = context.getSharedPreferences(SignalBackgroundCoordinator.PREFS, Context.MODE_PRIVATE);
        if (!prefs.getBoolean(SignalBackgroundCoordinator.PREF_SERVICE_ENABLED, false)) return;

        PendingResult pending = goAsync();
        AtomicBoolean finished = new AtomicBoolean(false);
        Handler handler = new Handler(Looper.getMainLooper());
        Runnable timeout = () -> {
            if (finished.compareAndSet(false, true)) pending.finish();
        };
        handler.postDelayed(timeout, 8000L);
        SignalBackgroundCoordinator.stopLegacyService(context);
        SignalBackgroundCoordinator.schedulePeriodic(context);
        SignalBackgroundCoordinator.requestImmediate(context);
        SignalBackgroundCoordinator.syncTopics(context).addOnCompleteListener(task -> {
            if (!task.isSuccessful()) Log.w(TAG, "Topic recovery failed after boot/update");
            if (finished.compareAndSet(false, true)) {
                handler.removeCallbacks(timeout);
                pending.finish();
            }
        });
    }
}
