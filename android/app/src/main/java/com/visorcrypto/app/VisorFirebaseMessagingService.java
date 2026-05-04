package com.visorcrypto.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Locale;
import java.util.Map;

public class VisorFirebaseMessagingService extends FirebaseMessagingService {

    private static final String TAG = "VisorFCM";
    private static final String PREFS = "visor_scan";
    private static final String PREF_FCM_TOKEN = "fcm_token";
    private static final String PREF_FCM_TOKEN_UPDATED_AT = "fcm_token_updated_at";
    private static final String SIGNAL_CHANNEL_ID = "visor_signals_v2";

    @Override
    public void onNewToken(String token) {
        super.onNewToken(token);
        if (token == null || token.trim().isEmpty()) return;
        getSharedPreferences(PREFS, MODE_PRIVATE)
            .edit()
            .putString(PREF_FCM_TOKEN, token.trim())
            .putLong(PREF_FCM_TOKEN_UPDATED_AT, System.currentTimeMillis())
            .apply();
    }

    @Override
    public void onMessageReceived(RemoteMessage message) {
        super.onMessageReceived(message);
        try {
            Map<String, String> data = message.getData();
            if (data == null || data.isEmpty()) return;

            String type = data.get("type");
            if (!"signal".equals(type)) return;

            String symbol = safe(data.get("symbol"));
            String direction = normalizeDirection(data.get("direction"));
            int confidence = parseInt(data.get("confidence"), 0);
            double price = parseDouble(data.get("price"), 0d);
            long ts = parseLong(data.get("ts"), System.currentTimeMillis());
            long expiresAt = parseLong(data.get("expiresAt"), ts + (30 * 60 * 1000L));
            String snapshotId = safe(data.get("snapshotId"));
            String finalDirection = normalizeDirection(data.get("finalDirection"));
            int finalConfidence = parseInt(data.get("finalConfidence"), confidence);
            String reason = safe(data.get("reason"));
            String shortName = safe(data.get("short"));
            if (shortName.isEmpty()) shortName = symbol.replace("USDT", "");
            if ("NEUTRO".equals(direction) && !"NEUTRO".equals(finalDirection)) direction = finalDirection;
            if (symbol.isEmpty() || "NEUTRO".equals(direction) || confidence <= 0) return;
            if ("NEUTRO".equals(finalDirection)) finalDirection = direction;
            finalConfidence = Math.max(0, Math.min(100, finalConfidence > 0 ? finalConfidence : confidence));
            if (snapshotId.isEmpty()) {
                snapshotId = symbol + "_" + finalDirection + "_" + (ts / (30 * 60 * 1000L));
            }

            createSignalChannel();

            Intent intent = new Intent(this, MainActivity.class);
            intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            intent.setAction("OPEN_SIGNALS");
            intent.putExtra("FROM_SIGNAL_NOTIFICATION", true);
            intent.putExtra("NOTIF_SYMBOL", symbol);
            intent.putExtra("NOTIF_DIRECTION", direction);
            intent.putExtra("NOTIF_CONFIDENCE", Math.max(0, Math.min(100, confidence)));
            intent.putExtra("NOTIF_PRICE", price);
            intent.putExtra("NOTIF_REASON", reason);
            intent.putExtra("NOTIF_TS", ts);
            intent.putExtra("NOTIF_SNAPSHOT_ID", snapshotId);
            intent.putExtra("NOTIF_EXPIRES_AT", expiresAt);
            intent.putExtra("NOTIF_FINAL_DIRECTION", finalDirection);
            intent.putExtra("NOTIF_FINAL_CONFIDENCE", finalConfidence);

            int notificationId = parseInt(data.get("notificationId"), Math.abs((symbol + direction + (ts / 1800000L)).hashCode()));
            PendingIntent pendingIntent = PendingIntent.getActivity(
                this,
                notificationId,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );

            String title = shortName + " - " + direction;
            String body = "Confianca: " + confidence + "%";
            if (!reason.isEmpty()) body += " | " + reason;

            NotificationCompat.Builder builder = new NotificationCompat.Builder(this, SIGNAL_CHANNEL_ID)
                .setContentTitle(title)
                .setContentText(body)
                .setSmallIcon(android.R.drawable.ic_popup_reminder)
                .setContentIntent(pendingIntent)
                .setAutoCancel(true)
                .setTimeoutAfter(Math.max(1000L, expiresAt - System.currentTimeMillis()))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setDefaults(NotificationCompat.DEFAULT_ALL)
                .setCategory(NotificationCompat.CATEGORY_ALARM);

            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) {
                nm.notify(notificationId, builder.build());
            }
        } catch (Exception e) {
            Log.e(TAG, "FCM signal notification failed: " + e.getMessage());
        }
    }

    private void createSignalChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm == null || nm.getNotificationChannel(SIGNAL_CHANNEL_ID) != null) return;
        NotificationChannel channel = new NotificationChannel(
            SIGNAL_CHANNEL_ID,
            "Sinais de Trading",
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Alertas de sinais LONG/SHORT confirmados");
        channel.enableVibration(true);
        nm.createNotificationChannel(channel);
    }

    private static String safe(String raw) {
        return raw == null ? "" : raw.trim();
    }

    private static String normalizeDirection(String raw) {
        String value = safe(raw).toUpperCase(Locale.US);
        if (value.contains("LONG")) return "LONG";
        if (value.contains("SHORT")) return "SHORT";
        return "NEUTRO";
    }

    private static int parseInt(String raw, int fallback) {
        try { return Integer.parseInt(safe(raw)); } catch (Exception ignored) { return fallback; }
    }

    private static long parseLong(String raw, long fallback) {
        try { return Long.parseLong(safe(raw)); } catch (Exception ignored) { return fallback; }
    }

    private static double parseDouble(String raw, double fallback) {
        try { return Double.parseDouble(safe(raw)); } catch (Exception ignored) { return fallback; }
    }
}
