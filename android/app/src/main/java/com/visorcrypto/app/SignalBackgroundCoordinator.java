package com.visorcrypto.app;

import android.content.Context;
import android.content.SharedPreferences;

import androidx.work.BackoffPolicy;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import com.google.android.gms.tasks.Task;
import com.google.android.gms.tasks.Tasks;
import com.google.firebase.messaging.FirebaseMessaging;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.TimeUnit;

final class SignalBackgroundCoordinator {
    static final String PREFS = "visor_scan";
    static final String PREF_SERVICE_ENABLED = "service_enabled";
    static final String PREF_SYMBOLS_CONFIG = "symbols_config";
    static final String PREF_SUBSCRIBED_TOPICS = "subscribed_topics_v1";
    static final String PREF_TOPIC_SYNC_AT = "topic_sync_at";
    static final String PREF_TOPIC_SYNC_OK = "topic_sync_ok";
    static final String PREF_TOPIC_SYNC_ERROR = "topic_sync_error";
    static final String TOPIC_PREFIX = "visor_s6_inv_";
    static final String TOPIC_SUFFIX = "_v1";
    static final String PERIODIC_WORK_NAME = "visor_signal_fallback_periodic_v1";
    static final String IMMEDIATE_WORK_NAME = "visor_signal_fallback_now_v1";

    private SignalBackgroundCoordinator() {}

    static String topicForSymbol(String rawSymbol) {
        String symbol = String.valueOf(rawSymbol == null ? "" : rawSymbol)
            .toLowerCase(Locale.US)
            .replaceAll("[^a-z0-9]", "");
        if (symbol.isEmpty()) return "";
        if (!symbol.endsWith("usdt")) symbol += "usdt";
        return TOPIC_PREFIX + symbol + TOPIC_SUFFIX;
    }

    static Set<String> desiredTopics(SharedPreferences prefs) {
        Set<String> topics = new HashSet<>();
        if (prefs == null || !prefs.getBoolean(PREF_SERVICE_ENABLED, false)) return topics;
        String raw = prefs.getString(PREF_SYMBOLS_CONFIG, "");
        try {
            JSONObject config = new JSONObject(raw == null || raw.trim().isEmpty() ? "{}" : raw);
            Iterator<String> keys = config.keys();
            while (keys.hasNext()) {
                String symbol = keys.next();
                JSONObject item = config.optJSONObject(symbol);
                if (item == null || !item.optBoolean("enabled", false)) continue;
                String topic = topicForSymbol(symbol);
                if (!topic.isEmpty()) topics.add(topic);
            }
        } catch (Exception ignored) {}
        return topics;
    }

    static Set<String> storedTopics(SharedPreferences prefs) {
        Set<String> topics = new HashSet<>();
        try {
            JSONArray array = new JSONArray(prefs.getString(PREF_SUBSCRIBED_TOPICS, "[]"));
            for (int i = 0; i < array.length(); i++) {
                String topic = array.optString(i, "").trim();
                if (!topic.isEmpty()) topics.add(topic);
            }
        } catch (Exception ignored) {}
        return topics;
    }

    static Task<Void> syncTopics(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        Set<String> desired = desiredTopics(prefs);
        Set<String> previous = storedTopics(prefs);
        List<Task<Void>> tasks = new ArrayList<>();
        FirebaseMessaging messaging = FirebaseMessaging.getInstance();

        for (String topic : previous) {
            if (!desired.contains(topic)) tasks.add(messaging.unsubscribeFromTopic(topic));
        }
        for (String topic : desired) {
            if (!previous.contains(topic)) tasks.add(messaging.subscribeToTopic(topic));
        }

        Task<Void> combined = tasks.isEmpty() ? Tasks.forResult(null) : Tasks.whenAll(tasks);
        combined.addOnCompleteListener(task -> {
            SharedPreferences.Editor editor = prefs.edit()
                .putLong(PREF_TOPIC_SYNC_AT, System.currentTimeMillis())
                .putBoolean(PREF_TOPIC_SYNC_OK, task.isSuccessful());
            if (task.isSuccessful()) {
                editor.putString(PREF_SUBSCRIBED_TOPICS, new JSONArray(desired).toString())
                    .remove(PREF_TOPIC_SYNC_ERROR);
            } else {
                editor.putString(PREF_TOPIC_SYNC_ERROR,
                    task.getException() != null ? String.valueOf(task.getException().getMessage()) : "topic_sync_failed");
            }
            editor.apply();
        });
        return combined;
    }

    static void schedulePeriodic(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (!prefs.getBoolean(PREF_SERVICE_ENABLED, false)) {
            cancel(context);
            return;
        }
        Constraints constraints = new Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build();
        PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(
            SignalSnapshotWorker.class,
            15,
            TimeUnit.MINUTES
        )
            .setConstraints(constraints)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build();
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            PERIODIC_WORK_NAME,
            ExistingPeriodicWorkPolicy.UPDATE,
            request
        );
    }

    static void requestImmediate(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (!prefs.getBoolean(PREF_SERVICE_ENABLED, false)) return;
        Constraints constraints = new Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build();
        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(SignalSnapshotWorker.class)
            .setConstraints(constraints)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build();
        WorkManager.getInstance(context).enqueueUniqueWork(
            IMMEDIATE_WORK_NAME,
            ExistingWorkPolicy.KEEP,
            request
        );
    }

    static void cancel(Context context) {
        WorkManager manager = WorkManager.getInstance(context);
        manager.cancelUniqueWork(PERIODIC_WORK_NAME);
        manager.cancelUniqueWork(IMMEDIATE_WORK_NAME);
        stopLegacyService(context);
    }

    static void stopLegacyService(Context context) {
        // The legacy foreground service is intentionally absent from version 136.
    }
}
