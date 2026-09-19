package com.visorcrypto.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.os.Build;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONObject;
import org.json.JSONArray;

import java.util.Locale;
import java.util.Map;

final class SignalNotificationHelper {
    private static final String TAG = "VisorSignal";
    private static final String PREFS = SignalBackgroundCoordinator.PREFS;
    private static final String STRATEGY_VERSION = "S6_INV";
    private static final String SIGNAL_CHANNEL_ID = "visor_signals_v3";
    static final String PREF_NATIVE_CALLS = "native_call_history_v1";
    private static final int MAX_NATIVE_CALLS = 200;
    private static final long DEDUP_MS = 30 * 60 * 1000L;
    private static final long FUTURE_CLOCK_TOLERANCE_MS = 5 * 60 * 1000L;

    private SignalNotificationHelper() {}

    static synchronized boolean handle(Context context, Map<String, String> data, String source) {
        if (context == null || data == null || data.isEmpty()) return false;
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            if (!prefs.getBoolean(SignalBackgroundCoordinator.PREF_SERVICE_ENABLED, false)) return false;

            String type = safe(data.get("type"));
            if (!type.isEmpty() && !"signal".equals(type)) return false;

            String strategy = safe(data.get("strategyVersion"));
            if (!STRATEGY_VERSION.equals(strategy)) return false;

            String symbol = normalizeSymbol(data.get("symbol"));
            String direction = normalizeDirection(firstNonEmpty(data.get("finalDirection"), data.get("direction")));
            int confidence = clamp(parseInt(firstNonEmpty(data.get("finalConfidence"), data.get("confidence")), 0));
            double price = parseDouble(data.get("price"), 0d);
            long now = System.currentTimeMillis();
            long notifiedAt = parseLong(firstNonEmpty(data.get("notifiedAt"), data.get("ts")), now);
            long expiresAt = parseLong(data.get("expiresAt"), notifiedAt + DEDUP_MS);
            String reason = safe(data.get("reason"));
            String snapshotId = safe(data.get("snapshotId"));
            String eventId = safe(data.get("eventId"));

            if (symbol.isEmpty() || "NEUTRO".equals(direction)) return false;
            if (notifiedAt > now + FUTURE_CLOCK_TOLERANCE_MS || expiresAt <= now) return false;

            JSONObject symbolPrefs = readSymbolPrefs(prefs, symbol);
            if (symbolPrefs == null || !symbolPrefs.optBoolean("enabled", false)) return false;
            int globalMin = Math.max(70, Math.min(100, prefs.getInt("min_confidence", 70)));
            int symbolMin = Math.max(70, Math.min(100, symbolPrefs.optInt("minConfidence", globalMin)));
            if (confidence < symbolMin) return false;

            if (snapshotId.isEmpty()) snapshotId = symbol + "_" + direction + "_" + (notifiedAt / DEDUP_MS);
            if (eventId.isEmpty()) eventId = "topic_v1:" + symbol + ":" + direction + ":" + (notifiedAt / DEDUP_MS);

            String eventKey = "delivered_event_" + Integer.toHexString(eventId.hashCode());
            String directionKey = "last_direction_" + symbol + "_" + direction;
            long previousEventAt = prefs.getLong(eventKey, 0L);
            long previousDirectionAt = prefs.getLong(directionKey, 0L);
            boolean duplicate = (previousEventAt > 0L && (now - previousEventAt) < DEDUP_MS)
                || (previousDirectionAt > 0L && (now - previousDirectionAt) < DEDUP_MS);

            persistSignalResult(
                prefs,
                symbol,
                direction,
                confidence,
                price,
                reason,
                notifiedAt,
                snapshotId,
                expiresAt,
                eventId,
                source,
                !duplicate
            );

            if (duplicate) return false;

            prefs.edit()
                .putLong(eventKey, notifiedAt)
                .putLong(directionKey, notifiedAt)
                .putLong("last_" + symbol, notifiedAt)
                .putLong("last_notification_at", now)
                .apply();

            if (MainActivity.isAppInForeground() || !hasNotificationPermission(context)) {
                return true;
            }

            showNotification(context, data, symbol, direction, confidence, price, reason, notifiedAt, snapshotId, expiresAt);
            return true;
        } catch (Exception e) {
            Log.e(TAG, "Signal handling failed: " + e.getMessage());
            return false;
        }
    }

    static void persistAnalysisResult(Context context, String symbol, JSONObject raw, long snapshotUpdatedAt, String source) {
        if (context == null || raw == null) return;
        try {
            String normalizedSymbol = normalizeSymbol(symbol);
            if (normalizedSymbol.isEmpty()) return;
            SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            JSONObject results;
            try {
                results = new JSONObject(prefs.getString("last_results_json", "{}"));
            } catch (Exception ignored) {
                results = new JSONObject();
            }
            JSONObject previous = results.optJSONObject(normalizedSymbol);
            JSONObject entry = previous != null ? new JSONObject(previous.toString()) : new JSONObject();
            String direction = normalizeDirection(firstNonEmpty(
                raw.optString("finalDirection", ""),
                raw.optString("direction", raw.optString("signal", ""))
            ));
            int confidence = clamp(raw.optInt("finalConfidence", raw.optInt("confidence", 0)));
            long lastScanAt = raw.optLong("lastScanAt", snapshotUpdatedAt > 0L ? snapshotUpdatedAt : System.currentTimeMillis());
            double price = raw.optDouble("price", raw.optDouble("currentPrice", 0d));

            entry.put("signal", direction);
            entry.put("direction", direction);
            entry.put("finalDirection", direction);
            entry.put("confidence", confidence);
            entry.put("finalConfidence", confidence);
            entry.put("price", price);
            entry.put("currentPrice", price);
            entry.put("reason", raw.optString("reason", ""));
            entry.put("gates", raw.optString("gates", "SNAPSHOT"));
            entry.put("status", raw.optString("status", "ok"));
            entry.put("unavailable", raw.optBoolean("unavailable", false));
            entry.put("lastScanAt", lastScanAt);
            entry.put("source", source);
            entry.put("strategyVersion", STRATEGY_VERSION);
            results.put(normalizedSymbol, entry);
            prefs.edit()
                .putString("last_results_json", results.toString())
                .putLong("last_results_updated_at", snapshotUpdatedAt > 0L ? snapshotUpdatedAt : System.currentTimeMillis())
                .apply();
        } catch (Exception e) {
            Log.w(TAG, "Failed to persist snapshot result: " + e.getMessage());
        }
    }

    private static void persistSignalResult(
        SharedPreferences prefs,
        String symbol,
        String direction,
        int confidence,
        double price,
        String reason,
        long notifiedAt,
        String snapshotId,
        long expiresAt,
        String eventId,
        String source,
        boolean markNotified
    ) throws Exception {
        JSONObject results;
        try {
            results = new JSONObject(prefs.getString("last_results_json", "{}"));
        } catch (Exception ignored) {
            results = new JSONObject();
        }
        JSONObject previous = results.optJSONObject(symbol);
        JSONObject entry = previous != null ? new JSONObject(previous.toString()) : new JSONObject();
        double safePrice = price > 0d ? price : entry.optDouble("price", entry.optDouble("currentPrice", 0d));

        entry.put("signal", direction);
        entry.put("direction", direction);
        entry.put("finalDirection", direction);
        entry.put("confidence", confidence);
        entry.put("finalConfidence", confidence);
        entry.put("price", safePrice);
        entry.put("currentPrice", safePrice);
        entry.put("reason", reason);
        entry.put("lastScanAt", notifiedAt);
        entry.put("source", source);
        entry.put("strategyVersion", STRATEGY_VERSION);
        entry.put("eventId", eventId);
        entry.put("snapshotId", snapshotId);
        entry.put("expiresAt", expiresAt);
        if (markNotified) {
            entry.put("notifiedAt", notifiedAt);
            entry.put("lastNotifiedAt", notifiedAt);
            entry.put("lastNotifiedSignal", direction);
            entry.put("lastNotifiedDirection", direction);
            entry.put("lastNotifiedConfidence", confidence);
            entry.put("lastNotifiedPrice", safePrice);
            entry.put("lastNotifiedReason", reason);
        }
        results.put(symbol, entry);
        SharedPreferences.Editor editor = prefs.edit()
            .putString("last_results_json", results.toString())
            .putLong("last_results_updated_at", System.currentTimeMillis());
        if (markNotified) {
            editor.putString(PREF_NATIVE_CALLS, appendNativeCall(
                prefs,
                symbol,
                direction,
                confidence,
                safePrice,
                reason,
                notifiedAt,
                snapshotId,
                expiresAt,
                eventId,
                source
            ).toString());
            // The call receipt must be durable before Android displays the alert.
            editor.commit();
        } else {
            editor.apply();
        }
    }

    private static JSONArray appendNativeCall(
        SharedPreferences prefs,
        String symbol,
        String direction,
        int confidence,
        double price,
        String reason,
        long notifiedAt,
        String snapshotId,
        long expiresAt,
        String eventId,
        String source
    ) throws Exception {
        JSONArray stored;
        try {
            stored = new JSONArray(prefs.getString(PREF_NATIVE_CALLS, "[]"));
        } catch (Exception ignored) {
            stored = new JSONArray();
        }

        JSONArray next = new JSONArray();
        JSONObject call = new JSONObject();
        call.put("id", notifiedAt);
        call.put("eventId", eventId);
        call.put("symbol", symbol);
        call.put("short", symbol.replace("USDT", ""));
        call.put("direction", direction);
        call.put("signal", direction);
        call.put("confidence", confidence);
        call.put("price", price);
        call.put("entryPrice", price);
        call.put("reason", reason);
        call.put("time", notifiedAt);
        call.put("timestamp", notifiedAt);
        call.put("notifiedAt", notifiedAt);
        call.put("snapshotId", snapshotId);
        call.put("expiresAt", expiresAt);
        call.put("strategyVersion", STRATEGY_VERSION);
        call.put("source", source);
        next.put(call);

        for (int i = 0; i < stored.length() && next.length() < MAX_NATIVE_CALLS; i++) {
            JSONObject previous = stored.optJSONObject(i);
            if (previous == null) continue;
            String previousEventId = previous.optString("eventId", "");
            if (!eventId.isEmpty() && eventId.equals(previousEventId)) continue;
            next.put(previous);
        }
        return next;
    }

    private static void showNotification(
        Context context,
        Map<String, String> data,
        String symbol,
        String direction,
        int confidence,
        double price,
        String reason,
        long notifiedAt,
        String snapshotId,
        long expiresAt
    ) {
        createSignalChannel(context);
        String shortName = safe(data.get("short"));
        if (shortName.isEmpty()) shortName = symbol.replace("USDT", "");
        int notificationId = parseInt(data.get("notificationId"), Math.abs((symbol + direction + (notifiedAt / DEDUP_MS)).hashCode()));

        Intent intent = new Intent(context, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        intent.setAction("OPEN_SIGNALS");
        intent.putExtra("FROM_SIGNAL_NOTIFICATION", true);
        intent.putExtra("NOTIF_SYMBOL", symbol);
        intent.putExtra("NOTIF_DIRECTION", direction);
        intent.putExtra("NOTIF_CONFIDENCE", confidence);
        intent.putExtra("NOTIF_PRICE", price);
        intent.putExtra("NOTIF_REASON", reason);
        intent.putExtra("NOTIF_TS", notifiedAt);
        intent.putExtra("NOTIF_SNAPSHOT_ID", snapshotId);
        intent.putExtra("NOTIF_EXPIRES_AT", expiresAt);
        intent.putExtra("NOTIF_FINAL_DIRECTION", direction);
        intent.putExtra("NOTIF_FINAL_CONFIDENCE", confidence);

        PendingIntent pendingIntent = PendingIntent.getActivity(
            context,
            notificationId,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Context localized = localizedContext(context);
        String title = localized.getString(R.string.signal_notification_title, shortName, direction);
        String body = localized.getString(R.string.signal_notification_body, confidence);
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, SIGNAL_CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setSmallIcon(android.R.drawable.ic_popup_reminder)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .setTimeoutAfter(Math.max(1000L, expiresAt - System.currentTimeMillis()))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setCategory(NotificationCompat.CATEGORY_ALARM);

        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager != null) manager.notify(notificationId, builder.build());
    }

    private static void createSignalChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null || manager.getNotificationChannel(SIGNAL_CHANNEL_ID) != null) return;
        Context localized = localizedContext(context);
        NotificationChannel channel = new NotificationChannel(
            SIGNAL_CHANNEL_ID,
            localized.getString(R.string.signal_channel_name),
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription(localized.getString(R.string.signal_channel_description));
        channel.enableVibration(true);
        manager.createNotificationChannel(channel);
    }

    static boolean hasNotificationPermission(Context context) {
        return Build.VERSION.SDK_INT < 33
            || ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
    }

    private static JSONObject readSymbolPrefs(SharedPreferences prefs, String symbol) {
        try {
            JSONObject all = new JSONObject(prefs.getString(SignalBackgroundCoordinator.PREF_SYMBOLS_CONFIG, "{}"));
            return all.optJSONObject(symbol);
        } catch (Exception ignored) {
            return null;
        }
    }

    private static Context localizedContext(Context context) {
        String tag = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("selected_locale", "system");
        if (tag == null || tag.trim().isEmpty() || "system".equalsIgnoreCase(tag)) return context;
        Locale locale = Locale.forLanguageTag(tag);
        if (locale.getLanguage().isEmpty()) return context;
        Configuration config = new Configuration(context.getResources().getConfiguration());
        config.setLocale(locale);
        return context.createConfigurationContext(config);
    }

    private static String normalizeSymbol(String raw) {
        String symbol = safe(raw).toUpperCase(Locale.US).replaceAll("[^A-Z0-9]", "");
        if (symbol.isEmpty()) return "";
        return symbol.endsWith("USDT") ? symbol : symbol + "USDT";
    }

    private static String normalizeDirection(String raw) {
        String value = safe(raw).toUpperCase(Locale.US);
        if (value.contains("LONG")) return "LONG";
        if (value.contains("SHORT")) return "SHORT";
        return "NEUTRO";
    }

    private static String firstNonEmpty(String first, String second) {
        String value = safe(first);
        return value.isEmpty() ? safe(second) : value;
    }

    private static String safe(String raw) {
        return raw == null ? "" : raw.trim();
    }

    private static int clamp(int value) {
        return Math.max(0, Math.min(100, value));
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
