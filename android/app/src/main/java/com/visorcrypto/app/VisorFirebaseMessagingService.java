package com.visorcrypto.app;

import android.content.SharedPreferences;
import android.util.Log;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

public class VisorFirebaseMessagingService extends FirebaseMessagingService {
    private static final String TAG = "VisorFCM";

    @Override
    public void onNewToken(String token) {
        super.onNewToken(token);
        if (token == null || token.trim().isEmpty()) return;
        SharedPreferences prefs = getSharedPreferences(SignalBackgroundCoordinator.PREFS, MODE_PRIVATE);
        prefs.edit()
            .putString("fcm_token", token.trim())
            .putLong("fcm_token_updated_at", System.currentTimeMillis())
            .apply();
        if (prefs.getBoolean(SignalBackgroundCoordinator.PREF_SERVICE_ENABLED, false)) {
            SignalBackgroundCoordinator.syncTopics(this);
            SignalBackgroundCoordinator.schedulePeriodic(this);
        }
    }

    @Override
    public void onMessageReceived(RemoteMessage message) {
        super.onMessageReceived(message);
        try {
            Map<String, String> data = message.getData();
            if (data == null || data.isEmpty()) return;
            getSharedPreferences(SignalBackgroundCoordinator.PREFS, MODE_PRIVATE)
                .edit()
                .putLong("last_push_received_at", System.currentTimeMillis())
                .apply();
            SignalNotificationHelper.handle(this, data, "fcm_topic");
        } catch (Exception e) {
            Log.e(TAG, "FCM signal handling failed: " + e.getMessage());
        }
    }
}
