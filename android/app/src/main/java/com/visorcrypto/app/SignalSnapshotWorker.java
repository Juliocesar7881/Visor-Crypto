package com.visorcrypto.app;

import android.content.Context;
import android.content.SharedPreferences;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;

public class SignalSnapshotWorker extends Worker {
    private static final String PREFS = SignalBackgroundCoordinator.PREFS;
    public SignalSnapshotWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context context = getApplicationContext();
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (!prefs.getBoolean(SignalBackgroundCoordinator.PREF_SERVICE_ENABLED, false)) return Result.success();

        long startedAt = System.currentTimeMillis();
        prefs.edit()
            .putBoolean("scan_in_progress", true)
            .putLong("last_scan_started_at", startedAt)
            .putString("background_status", "syncing")
            .remove("background_error")
            .apply();

        try {
            String workerUrl = normalizeWorkerUrl(prefs.getString("worker_url", ""));
            if (workerUrl.isEmpty()) throw new IllegalStateException("missing_worker_url");
            HttpResult response = request("GET", workerUrl + "/signals/snapshot", null, "", 12000);
            if (response.status < 200 || response.status >= 300) {
                throw new IllegalStateException("snapshot_http_" + response.status);
            }

            JSONObject payload = new JSONObject(response.body);
            JSONObject snapshot = payload.optJSONObject("snapshot");
            if (snapshot == null && payload.has("results")) snapshot = payload;
            if (snapshot == null) throw new IllegalStateException("invalid_snapshot");
            String strategyVersion = snapshot.optString("strategyVersion", "S6_INV");
            if (!"S6_INV".equals(strategyVersion)) throw new IllegalStateException("strategy_mismatch");
            JSONObject results = snapshot.optJSONObject("results");
            if (results == null || results.length() == 0) throw new IllegalStateException("empty_snapshot");

            long snapshotUpdatedAt = snapshot.optLong("updatedAt", System.currentTimeMillis());
            boolean snapshotStale = snapshot.optBoolean("stale", false)
                || snapshotUpdatedAt <= 0L
                || (System.currentTimeMillis() - snapshotUpdatedAt) > (10 * 60 * 1000L);
            Iterator<String> symbols = results.keys();
            while (symbols.hasNext()) {
                String symbol = symbols.next();
                JSONObject entry = results.optJSONObject(symbol);
                if (entry == null) continue;
                SignalNotificationHelper.persistAnalysisResult(context, symbol, entry, snapshotUpdatedAt, "workmanager_snapshot");

                String direction = entry.optString("finalDirection", entry.optString("direction", "NEUTRO"));
                int confidence = entry.optInt("finalConfidence", entry.optInt("confidence", 0));
                if (("LONG".equalsIgnoreCase(direction) || "SHORT".equalsIgnoreCase(direction)) && confidence >= 70) {
                    long eventTs = entry.optLong("lastScanAt", snapshotUpdatedAt);
                    long expiresAt = eventTs + (30 * 60 * 1000L);
                    Map<String, String> event = new HashMap<>();
                    event.put("type", "signal");
                    event.put("pushProtocol", "topic_v1");
                    event.put("strategyVersion", "S6_INV");
                    event.put("symbol", symbol);
                    event.put("short", entry.optString("short", symbol.replace("USDT", "")));
                    event.put("direction", direction);
                    event.put("finalDirection", direction);
                    event.put("confidence", String.valueOf(confidence));
                    event.put("finalConfidence", String.valueOf(confidence));
                    event.put("price", String.valueOf(entry.optDouble("price", entry.optDouble("entryPrice", 0d))));
                    event.put("reason", entry.optString("reason", ""));
                    event.put("ts", String.valueOf(eventTs));
                    event.put("notifiedAt", String.valueOf(eventTs));
                    event.put("expiresAt", String.valueOf(expiresAt));
                    event.put("snapshotId", entry.optString("snapshotId", symbol + "_" + direction + "_" + (eventTs / 1800000L)));
                    event.put("eventId", "topic_v1:" + symbol + ":" + direction.toUpperCase() + ":" + (eventTs / 1800000L));
                    SignalNotificationHelper.handle(context, event, "workmanager_fallback");
                }
            }

            long finishedAt = System.currentTimeMillis();
            prefs.edit()
                .putBoolean("scan_in_progress", false)
                .putLong("last_scan_finished_at", finishedAt)
                .putLong("last_results_updated_at", snapshotUpdatedAt)
                .putString("background_status", snapshotStale ? "offline" : "active")
                .putString("background_error", snapshotStale ? "stale_snapshot" : "")
                .apply();
            return snapshotStale && getRunAttemptCount() < 3 ? Result.retry() : Result.success();
        } catch (Exception e) {
            long now = System.currentTimeMillis();
            prefs.edit()
                .putBoolean("scan_in_progress", false)
                .putLong("last_scan_finished_at", now)
                .putString("background_status", "offline")
                .putString("background_error", String.valueOf(e.getMessage()))
                .apply();
            return getRunAttemptCount() < 5 ? Result.retry() : Result.failure();
        }
    }

    private HttpResult request(String method, String target, String body, String token, int timeoutMs) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(target).openConnection();
        connection.setRequestMethod(method);
        connection.setConnectTimeout(timeoutMs);
        connection.setReadTimeout(timeoutMs);
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("X-App-Client", "visor-android-workmanager");
        if (token != null && !token.isEmpty()) connection.setRequestProperty("Authorization", "Bearer " + token);
        if (body != null) {
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json");
            try (OutputStream output = connection.getOutputStream()) {
                output.write(body.getBytes(StandardCharsets.UTF_8));
            }
        }
        int status = connection.getResponseCode();
        InputStream stream = status >= 200 && status < 400 ? connection.getInputStream() : connection.getErrorStream();
        StringBuilder text = new StringBuilder();
        if (stream != null) {
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) text.append(line);
            }
        }
        connection.disconnect();
        return new HttpResult(status, text.toString());
    }

    private static String normalizeWorkerUrl(String raw) {
        String value = raw == null ? "" : raw.trim();
        while (value.endsWith("/")) value = value.substring(0, value.length() - 1);
        return value.startsWith("https://") ? value : "";
    }

    private static final class HttpResult {
        final int status;
        final String body;

        HttpResult(int status, String body) {
            this.status = status;
            this.body = body == null ? "" : body;
        }
    }
}
