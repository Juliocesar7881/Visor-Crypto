package com.visorcrypto.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Persistent Foreground Service that runs independently of the WebView.
 * Performs its own HTTP-based market scans every 5 minutes and fires
 * local notifications when strong signals are detected.
 *
 * This works even when the app is in background or the screen is off.
 */
public class ScanForegroundService extends Service {

    private static final String TAG = "VisorScan";
    private static final String CHANNEL_ID = "visor_crypto_scan";
    private static final String SIGNAL_CHANNEL_ID = "visor_signals_v2";
    private static final String PREFS = "visor_scan";
    private static final String PREF_SERVICE_ENABLED = "service_enabled";
    private static final String PREF_SYMBOLS_CONFIG = "symbols_config";
    private static final String PREF_WORKER_URL = "worker_url";
    private static final String PREF_DEVICE_ID = "device_id";
    private static final String PREF_USER_ID = "user_id";
    private static final String PREF_SCAN_SEQUENCE = "scan_sequence";
    private static final String PREF_LAST_RESULTS_JSON = "last_results_json";
    private static final String PREF_LAST_RESULTS_UPDATED_AT = "last_results_updated_at";
    private static final String PREF_AUTHORITATIVE_RESULTS_JSON = "authoritative_results_json";
    private static final String PREF_AUTHORITATIVE_RESULTS_UPDATED_AT = "authoritative_results_updated_at";
    private static final String PREF_SIGNAL_STATE_RESET_VERSION = "signal_state_reset_version";
    private static final String SIGNAL_STATE_RESET_VERSION = "2026-04-30-clean-v3";
    private static final int DEFAULT_MIN_CONFIDENCE = 70;
    private static final int NOTIFICATION_ID = 1001;
    private static final long SCAN_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
    private static final long DEDUP_MS = 30 * 60 * 1000; // 30 min cooldown por simbolo
    private static final long DEDUP_SCANS = 6; // 6 ciclos de scan por simbolo
    private static final long CALL_SYNC_RETRY_WINDOW_MS = DEDUP_MS; // sync once per 30min window after success
    private static final int MAX_SYMBOLS_PER_SCAN = 120;
    private static final long SCAN_MAX_DURATION_MS = 2 * 60 * 1000; // guarda de ciclo para evitar travar por rede lenta
    private static final long SCAN_STUCK_RECOVERY_MS = SCAN_MAX_DURATION_MS + (2 * 60 * 1000L);
    private static final int MAX_CONSECUTIVE_HTTP_FAILURES = 12;
    private static final int HTTP_TIMEOUT_MS = 4500;
    private static final int HTTP_MAX_ATTEMPTS = 2;
    private static final long AUTHORITATIVE_SIGNAL_MAX_AGE_MS = 30 * 60 * 1000;

    private PowerManager.WakeLock wakeLock;
    private Handler handler;
    private boolean isRunning = false;
    private int scanCount = 0;
    private final AtomicBoolean scanInProgress = new AtomicBoolean(false);
    private final ExecutorService callSyncExecutor = Executors.newSingleThreadExecutor();
    private final Object authTokenLock = new Object();
    private String cachedAuthToken = null;
    private long cachedAuthTokenExpiresAt = 0L;
    private volatile long lastScanStartedAtMs = 0L;
    private volatile long lastScanFinishedAtMs = 0L;

    // Fallback symbols when per-crypto config is missing.
    private static final String[][] FALLBACK_SCAN_SYMBOLS = {
        {"BTCUSDT", "Bitcoin", "BTC"},
        {"ETHUSDT", "Ethereum", "ETH"},
        {"BNBUSDT", "BNB", "BNB"},
        {"SOLUSDT", "Solana", "SOL"},
        {"XRPUSDT", "Ripple", "XRP"},
        {"ADAUSDT", "Cardano", "ADA"},
        {"DOGEUSDT", "Dogecoin", "DOGE"},
        {"AVAXUSDT", "Avalanche", "AVAX"},
        {"DOTUSDT", "Polkadot", "DOT"},
        {"LINKUSDT", "Chainlink", "LINK"}
    };

    private final Runnable scanRunnable = new Runnable() {
        @Override
        public void run() {
            if (!isRunning) return;
            try {
                long now = System.currentTimeMillis();
                if (scanInProgress.get()) {
                    long startedAt = lastScanStartedAtMs;
                    if (startedAt > 0 && (now - startedAt) > SCAN_STUCK_RECOVERY_MS) {
                        Log.w(TAG, "Detected stuck scan guard; forcing recovery");
                        scanInProgress.set(false);
                    }
                }

                performNativeScan();
            } catch (Throwable t) {
                Log.e(TAG, "Unhandled scan loop error: " + t.getMessage());
            } finally {
                if (isRunning) {
                    handler.removeCallbacks(this);
                    handler.postDelayed(this, SCAN_INTERVAL_MS);
                }
            }
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannels();
        handler = new Handler(Looper.getMainLooper());

        // WakeLock is held only while a scan is actively running.
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        if (pm != null) {
            wakeLock = pm.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                "VisorCrypto::ScanWakeLock"
            );
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && "STOP".equals(intent.getAction())) {
            getSharedPreferences(PREFS, MODE_PRIVATE)
                .edit()
                .putBoolean(PREF_SERVICE_ENABLED, false)
                .apply();

            isRunning = false;
            scanInProgress.set(false);
            handler.removeCallbacks(scanRunnable);
            if (wakeLock != null && wakeLock.isHeld()) {
                wakeLock.release();
            }
            stopForeground(true);
            stopSelf();
            return START_NOT_STICKY;
        }

        ensureSignalStateReset(getSharedPreferences(PREFS, MODE_PRIVATE));

        // Build persistent notification
        Intent notificationIntent = new Intent(this, MainActivity.class);
        notificationIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        notificationIntent.setAction("OPEN_SIGNALS");
        notificationIntent.putExtra("FROM_SIGNAL_NOTIFICATION", true);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this, 0, notificationIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        // Stop action
        Intent stopIntent = new Intent(this, ScanForegroundService.class);
        stopIntent.setAction("STOP");
        PendingIntent stopPendingIntent = PendingIntent.getService(
            this, 1, stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Visor Crypto — Ativo")
            .setContentText("Monitorando sinais de trading em background")
            .setSmallIcon(android.R.drawable.ic_popup_reminder)
            .setContentIntent(pendingIntent)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Parar", stopPendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build();

        startForeground(NOTIFICATION_ID, notification);

        // Start scanning loop
        if (!isRunning) {
            isRunning = true;
            long firstScanDelayMs = 30 * 1000L;
            try {
                long lastResultsAt = getSharedPreferences(PREFS, MODE_PRIVATE)
                    .getLong(PREF_LAST_RESULTS_UPDATED_AT, 0L);
                if (lastResultsAt <= 0 || (System.currentTimeMillis() - lastResultsAt) > (12 * 60 * 1000L)) {
                    firstScanDelayMs = 5 * 1000L;
                }
            } catch (Exception ignored) {}
            // First scan after startup delay, then every 5min
            handler.postDelayed(scanRunnable, firstScanDelayMs);
        }

        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        isRunning = false;
        scanInProgress.set(false);
        lastScanStartedAtMs = 0L;
        lastScanFinishedAtMs = 0L;
        handler.removeCallbacks(scanRunnable);
        try { callSyncExecutor.shutdownNow(); } catch (Exception ignored) {}
        synchronized (authTokenLock) {
            cachedAuthToken = null;
            cachedAuthTokenExpiresAt = 0L;
        }
        if (wakeLock != null && wakeLock.isHeld()) {
            try { wakeLock.release(); } catch (Exception e) {}
        }
        super.onDestroy();
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        // When user swipes app from recents, try to restart service
        try {
            boolean enabledByUser = getSharedPreferences(PREFS, MODE_PRIVATE)
                .getBoolean(PREF_SERVICE_ENABLED, false);
            if (!enabledByUser) {
                return;
            }

            Intent restartIntent = new Intent(getApplicationContext(), ScanForegroundService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                getApplicationContext().startForegroundService(restartIntent);
            } else {
                getApplicationContext().startService(restartIntent);
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to restart service on task removed: " + e.getMessage());
        }
        super.onTaskRemoved(rootIntent);
    }

    /**
     * Native HTTP-based market scan. Calls Binance API directly from Java,
     * evaluates a simplified signal logic, and fires notifications.
     */
    private void performNativeScan() {
        SharedPreferences prefsCheck = getSharedPreferences(PREFS, MODE_PRIVATE);
        ensureSignalStateReset(prefsCheck);
        final int userMinConf = clampMinConfidence(prefsCheck.getInt("min_confidence", DEFAULT_MIN_CONFIDENCE));
        final JSONObject symbolsConfig = parseSymbolsConfig(prefsCheck.getString(PREF_SYMBOLS_CONFIG, ""));
        final List<ScanTarget> scanTargets = buildScanTargets(symbolsConfig);
        if (!prefsCheck.getBoolean(PREF_SERVICE_ENABLED, false)) {
            Log.d(TAG, "Service is disabled by user. Stopping natively.");
            isRunning = false;
            scanInProgress.set(false);
            if (wakeLock != null && wakeLock.isHeld()) {
                try { wakeLock.release(); } catch(Exception ignored) {}
            }
            stopForeground(true);
            stopSelf();
            return;
        }

        if (scanTargets.isEmpty()) {
            Log.d(TAG, "No enabled symbols configured for native scan.");
            updatePersistentNotification("Sem criptos ativas para monitorar");
            return;
        }

        if (!scanInProgress.compareAndSet(false, true)) {
            Log.w(TAG, "Previous native scan still running, skipping this cycle");
            return;
        }

        lastScanStartedAtMs = System.currentTimeMillis();

        scanCount++;
        final long scanSequence = prefsCheck.getLong(PREF_SCAN_SEQUENCE, 0L) + 1L;
        prefsCheck.edit().putLong(PREF_SCAN_SEQUENCE, scanSequence).apply();
        Log.d(TAG, "Starting native scan #" + scanCount + " (seq " + scanSequence + ")");

        // Hold WakeLock only for the active scan budget.
        if (wakeLock != null) {
            try {
                if (wakeLock.isHeld()) wakeLock.release();
                wakeLock.acquire(SCAN_MAX_DURATION_MS + 60 * 1000L);
            } catch (Exception e) {
                Log.e(TAG, "WakeLock renewal failed: " + e.getMessage());
            }
        }

        // Update persistent notification with scan count
        updatePersistentNotification("Último scan: " + getCurrentTime() + " (#" + scanCount + ")");

        new Thread(() -> {
            SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
            JSONObject latestResults = loadLatestResults(prefs);
            JSONObject authoritativeResults = loadAuthoritativeResults(prefs);
            long authoritativeUpdatedAt = prefs.getLong(PREF_AUTHORITATIVE_RESULTS_UPDATED_AT, 0L);
            final long scanStartedAt = System.currentTimeMillis();
            int consecutiveHttpFailures = 0;
            try {
                for (ScanTarget target : scanTargets) {
                    if (!isRunning) break;
                    if ((System.currentTimeMillis() - scanStartedAt) > SCAN_MAX_DURATION_MS) {
                        Log.w(TAG, "Scan budget exceeded, finishing this cycle early to keep cadence");
                        break;
                    }
                    try {
                        String symbol = target.symbol;
                        String shortName = target.shortName;
                        SymbolConfig cfg = resolveSymbolConfig(symbol, symbolsConfig, userMinConf);
                        if (!cfg.enabled) {
                            continue;
                        }

                        JSONObject previousEntry = latestResults.optJSONObject(symbol);
                        long previousNotifiedAt = 0L;
                        if (previousEntry != null) {
                            previousNotifiedAt = Math.max(
                                0L,
                                previousEntry.optLong("lastNotifiedAt", previousEntry.optLong("notifiedAt", 0L))
                            );
                        }

                        long prefsNotifiedAt = Math.max(0L, prefs.getLong("last_" + symbol, 0L));
                        long freezeAnchor = Math.max(previousNotifiedAt, prefsNotifiedAt);
                        long nowForFreeze = System.currentTimeMillis();
                        if (freezeAnchor > 0L && (nowForFreeze - freezeAnchor) < DEDUP_MS) {
                            if (previousEntry != null) {
                                String frozenDirectionRaw = String.valueOf(
                                    previousEntry.optString(
                                        "lastNotifiedDirection",
                                        previousEntry.optString(
                                            "lastNotifiedSignal",
                                            previousEntry.optString("direction", previousEntry.optString("signal", "NEUTRO"))
                                        )
                                    )
                                ).toUpperCase(Locale.US);
                                String frozenDirection;
                                if (frozenDirectionRaw.contains("LONG")) {
                                    frozenDirection = "LONG";
                                } else if (frozenDirectionRaw.contains("SHORT")) {
                                    frozenDirection = "SHORT";
                                } else {
                                    frozenDirection = "NEUTRO";
                                }

                                int frozenConfidence = Math.max(
                                    0,
                                    Math.min(
                                        100,
                                        (int) Math.round(previousEntry.optDouble(
                                            "lastNotifiedConfidence",
                                            previousEntry.optDouble("confidence", 0)
                                        ))
                                    )
                                );
                                double frozenPrice = previousEntry.optDouble(
                                    "lastNotifiedPrice",
                                    previousEntry.optDouble("currentPrice", previousEntry.optDouble("price", 0))
                                );
                                String frozenReason = previousEntry.optString(
                                    "lastNotifiedReason",
                                    previousEntry.optString("reason", "Sinal em validade (30m)")
                                );

                                saveLatestResultEntry(
                                    latestResults,
                                    symbol,
                                    frozenDirection,
                                    frozenConfidence,
                                    frozenPrice,
                                    frozenReason,
                                    nowForFreeze,
                                    cfg.minConfidence,
                                    false,
                                    "native_frozen_30m"
                                );
                            }

                            Thread.sleep(80);
                            continue;
                        }

                        // Fetch klines (15m, last 120 candles) to capture intraday moves
                        // while keeping enough history for EMA/RSI calculations.
                        String klinesJson = httpGet("https://api.binance.com/api/v3/klines?symbol=" + symbol + "&interval=15m&limit=120");
                        if (klinesJson == null) {
                            consecutiveHttpFailures++;
                            if (consecutiveHttpFailures >= MAX_CONSECUTIVE_HTTP_FAILURES) {
                                Log.w(TAG, "Too many consecutive HTTP failures; closing cycle early");
                                break;
                            }
                            continue;
                        }

                        // Fetch ticker
                        String tickerJson = httpGet("https://api.binance.com/api/v3/ticker/24hr?symbol=" + symbol);
                        if (tickerJson == null) {
                            consecutiveHttpFailures++;
                            if (consecutiveHttpFailures >= MAX_CONSECUTIVE_HTTP_FAILURES) {
                                Log.w(TAG, "Too many consecutive HTTP failures; closing cycle early");
                                break;
                            }
                            continue;
                        }

                        consecutiveHttpFailures = 0;

                        double currentPrice = 0;
                        try {
                            currentPrice = new JSONObject(tickerJson).optDouble("lastPrice", 0);
                        } catch (Exception ignored) {}

                        // Fetch funding rate
                        String fundingJson = httpGet("https://fapi.binance.com/fapi/v1/fundingRate?symbol=" + symbol + "&limit=1");

                        // Simple analysis (fallback) + authoritative override when available.
                        SignalResult result = analyzeSimple(klinesJson, tickerJson, fundingJson);
                        long now = System.currentTimeMillis();

                        String signal = "NEUTRO";
                        int confidence = 0;
                        String reason = "Sem sinal forte";
                        String sourceTag = "native_background";
                        if (result != null) {
                            signal = result.isLong ? "LONG" : "SHORT";
                            confidence = result.confidence;
                            reason = result.reason;
                        }

                        AuthoritativeSignal authoritative = resolveAuthoritativeSignal(
                            authoritativeResults,
                            symbol,
                            now,
                            authoritativeUpdatedAt
                        );
                        if (authoritative != null) {
                            signal = authoritative.direction;
                            confidence = authoritative.confidence;
                            if (authoritative.reason != null && !authoritative.reason.trim().isEmpty()) {
                                reason = authoritative.reason;
                            }
                            if (authoritative.price > 0) {
                                currentPrice = authoritative.price;
                            }
                            sourceTag = "ta_authoritative_bridge";
                        }

                        boolean isDirectional = "LONG".equals(signal) || "SHORT".equals(signal);
                        boolean notified = false;
                        if (isDirectional && confidence >= cfg.minConfidence) {
                            String directionKey = signal;
                            long lastNotified = prefs.getLong("last_" + symbol, 0);
                            long lastNotifiedScan = prefs.getLong("last_scan_" + symbol, 0L);

                            // Se o relógio do dispositivo mudou e o timestamp ficou no futuro,
                            // não deixar o dedup travar notificações por horas/dias.
                            if (lastNotified > now + (5 * 60 * 1000L) || lastNotified < 0) {
                                lastNotified = 0;
                                prefs.edit()
                                    .remove("last_" + symbol)
                                    .remove("last_scan_" + symbol)
                                    .apply();
                                lastNotifiedScan = 0L;
                            }

                            boolean timeCooldownBlocked = lastNotified > 0 && (now - lastNotified) < DEDUP_MS;
                            boolean scanCooldownBlocked =
                                lastNotifiedScan > 0 &&
                                scanSequence >= lastNotifiedScan &&
                                (scanSequence - lastNotifiedScan) < DEDUP_SCANS;
                            // Permite novo sinal quando atingir 30 min OU 6 ciclos, o que vier primeiro.
                            boolean dedupBlocked = timeCooldownBlocked && scanCooldownBlocked;
                            if (!dedupBlocked) {
                                String direction = "LONG".equals(signal) ? "LONG 🟢" : "SHORT 🔴";
                                String title = shortName + " — " + direction;
                                String body = "Confiança: " + confidence + "% | " + reason;
                                int notificationId = Math.abs((symbol + "_" + directionKey + "_" + (now / DEDUP_MS)).hashCode());

                                fireSignalNotification(
                                    title,
                                    body,
                                    notificationId,
                                    symbol,
                                    directionKey,
                                    confidence,
                                    currentPrice,
                                    reason,
                                    now
                                );

                                // Save per-symbol cooldown timestamp
                                prefs.edit()
                                    .putLong("last_" + symbol, now)
                                    .putLong("last_scan_" + symbol, scanSequence)
                                    .apply();

                                Log.d(TAG, "Signal: " + title + " — " + body);
                                notified = true;
                            }

                            if (notified) {
                                enqueueSharedCallSync(
                                    symbol,
                                    shortName,
                                    directionKey,
                                    confidence,
                                    currentPrice,
                                    reason,
                                    now,
                                    cfg.minConfidence
                                );
                            }
                        }

                        saveLatestResultEntry(
                            latestResults,
                            symbol,
                            signal,
                            confidence,
                            currentPrice,
                            reason,
                            now,
                            cfg.minConfidence,
                            notified,
                            sourceTag
                        );

                        // Small delay between symbols to avoid rate limiting while keeping scan cadence.
                        Thread.sleep(180);

                    } catch (Exception e) {
                        Log.e(TAG, "Scan error for " + target.symbol + ": " + e.getMessage());
                    }
                }

                persistLatestResults(prefs, latestResults);
                Log.d(TAG, "Scan #" + scanCount + " complete");
            } catch (Exception e) {
                Log.e(TAG, "Scan thread error: " + e.getMessage());
            } finally {
                persistLatestResults(prefs, latestResults);
                scanInProgress.set(false);
                lastScanFinishedAtMs = System.currentTimeMillis();
                if (wakeLock != null && wakeLock.isHeld()) {
                    try { wakeLock.release(); } catch (Exception ignored) {}
                }
            }
        }).start();
    }

    /**
     * Simplified signal analysis using raw kline + ticker data.
     * This is a lightweight version of the full JS TA engine,
     * designed to catch strong signals from native code.
     */
    private SignalResult analyzeSimple(String klinesJson, String tickerJson, String fundingJson) {
        try {
            JSONArray klines = new JSONArray(klinesJson);
            JSONObject ticker = new JSONObject(tickerJson);

            if (klines.length() < 30) return null;

            double currentPrice = ticker.getDouble("lastPrice");
            double priceChange24h = ticker.getDouble("priceChangePercent");
            double volume24h = ticker.getDouble("quoteVolume");

            // Calculate EMAs
            double ema9 = calculateEMA(klines, 9);
            double ema21 = calculateEMA(klines, 21);
            double ema50 = calculateEMA(klines, 50);

            // Calculate RSI (14)
            double rsi = calculateRSI(klines, 14);

            // Volume analysis
            double avgVolume = calculateAvgVolume(klines, 20);
            double lastVolume = klines.getJSONArray(klines.length() - 1).getDouble(5);
            double volumeRatio = avgVolume > 0 ? lastVolume / avgVolume : 1.0;

            // Funding rate
            double fundingRate = 0;
            if (fundingJson != null) {
                try {
                    JSONArray fundingArr = new JSONArray(fundingJson);
                    if (fundingArr.length() > 0) {
                        fundingRate = fundingArr.getJSONObject(0).getDouble("fundingRate");
                    }
                } catch (Exception e) {}
            }

            // Signal scoring. Native background calls are shared, so only strong,
            // multi-confirmation setups should become active calls.
            int longScore = 0, shortScore = 0;
            int longConfirmations = 0, shortConfirmations = 0;
            StringBuilder reason = new StringBuilder();
            double lastOpen = klines.getJSONArray(klines.length() - 1).getDouble(1);
            boolean candleUp = currentPrice >= lastOpen;
            boolean candleDown = currentPrice <= lastOpen;
            boolean emaAlignedLong = currentPrice > ema9 && ema9 > ema21 && ema21 > ema50;
            boolean emaAlignedShort = currentPrice < ema9 && ema9 < ema21 && ema21 < ema50;
            boolean strongVolume = volumeRatio > 1.45;
            boolean alignedVolumeLong = strongVolume && candleUp && priceChange24h > -1.0;
            boolean alignedVolumeShort = strongVolume && candleDown && priceChange24h < 1.0;

            // EMA alignment
            if (currentPrice > ema9 && ema9 > ema21 && ema21 > ema50) {
                longScore += 25;
                reason.append("EMAs alinhadas↑ ");
            } else if (currentPrice < ema9 && ema9 < ema21 && ema21 < ema50) {
                shortScore += 25;
                reason.append("EMAs alinhadas↓ ");
            }

            // RSI
            if (rsi < 30) { longScore += 20; reason.append("RSI sobrevendido "); }
            else if (rsi < 40) { longScore += 10; }
            else if (rsi > 70) { shortScore += 20; reason.append("RSI sobrecomprado "); }
            else if (rsi > 60) { shortScore += 10; }

            // Price vs EMAs (trend strength)
            if (currentPrice > ema21) { longScore += 10; }
            else { shortScore += 10; }
            if (currentPrice > ema50) { longScore += 10; }
            else { shortScore += 10; }

            // Volume confirmation
            if (volumeRatio > 1.5) {
                if (priceChange24h > 0) { longScore += 15; reason.append("Vol+↑ "); }
                else { shortScore += 15; reason.append("Vol+↓ "); }
            }

            // 24h momentum
            if (priceChange24h > 3) { longScore += 15; reason.append("+"+String.format("%.1f", priceChange24h)+"% "); }
            else if (priceChange24h > 1) { longScore += 8; }
            else if (priceChange24h < -3) { shortScore += 15; reason.append(String.format("%.1f", priceChange24h)+"% "); }
            else if (priceChange24h < -1) { shortScore += 8; }

            // Funding rate (contrarian)
            if (fundingRate > 0.0003) { shortScore += 10; reason.append("Fund alto "); }
            else if (fundingRate < -0.0003) { longScore += 10; reason.append("Fund baixo "); }

            longScore = 0;
            shortScore = 0;
            longConfirmations = 0;
            shortConfirmations = 0;
            reason.setLength(0);

            if (emaAlignedLong) {
                longScore += 22;
                longConfirmations++;
                reason.append("EMAs alta ");
            } else if (emaAlignedShort) {
                shortScore += 22;
                shortConfirmations++;
                reason.append("EMAs baixa ");
            }

            if (rsi < 30) {
                longScore += 18;
                longConfirmations++;
                reason.append("RSI sobrevendido ");
            } else if (rsi < 38) {
                longScore += 8;
            } else if (rsi > 70) {
                shortScore += 18;
                shortConfirmations++;
                reason.append("RSI sobrecomprado ");
            } else if (rsi > 62) {
                shortScore += 8;
            }

            if (currentPrice > ema21) { longScore += 8; }
            else { shortScore += 8; }
            if (currentPrice > ema50) { longScore += 8; }
            else { shortScore += 8; }

            if (alignedVolumeLong) {
                longScore += 14;
                longConfirmations++;
                reason.append("Vol alta ");
            } else if (alignedVolumeShort) {
                shortScore += 14;
                shortConfirmations++;
                reason.append("Vol baixa ");
            } else if (strongVolume) {
                longScore += 4;
                shortScore += 4;
                reason.append("Vol neutro ");
            }

            if (priceChange24h > 3) {
                longScore += 12;
                longConfirmations++;
                reason.append("+").append(String.format(Locale.US, "%.1f", priceChange24h)).append("% ");
            } else if (priceChange24h > 1.5) {
                longScore += 6;
            } else if (priceChange24h < -3) {
                shortScore += 12;
                shortConfirmations++;
                reason.append(String.format(Locale.US, "%.1f", priceChange24h)).append("% ");
            } else if (priceChange24h < -1.5) {
                shortScore += 6;
            }

            if (fundingRate > 0.0005) {
                shortScore += 8;
                shortConfirmations++;
                reason.append("Fund alto ");
            } else if (fundingRate < -0.0005) {
                longScore += 8;
                longConfirmations++;
                reason.append("Fund baixo ");
            }

            // Determine signal
            boolean isLong = longScore > shortScore;
            int rawScore = Math.max(longScore, shortScore);
            int directionalSpread = Math.abs(longScore - shortScore);
            int confirmations = isLong ? longConfirmations : shortConfirmations;
            boolean hasAlignedVolume = isLong ? alignedVolumeLong : alignedVolumeShort;
            boolean hasAcceleration = hasAlignedVolume || Math.abs(priceChange24h) >= 3.0 || Math.abs(fundingRate) >= 0.0005 || (isLong ? rsi < 30 : rsi > 70);
            boolean rsiContradiction = (isLong && rsi > 68) || (!isLong && rsi < 32);
            boolean qualityOk = longScore != shortScore
                && rawScore >= 58
                && directionalSpread >= 16
                && confirmations >= 2
                && hasAcceleration
                && !rsiContradiction;

            // Calibração para uso em background:
            // - rawScore mede força absoluta do setup
            // - directionalSpread reduz sinais ambíguos (LONG e SHORT próximos)
            int confidence = (int) Math.round(rawScore * 0.86 + directionalSpread * 0.42 + confirmations * 4);
            confidence = Math.max(0, Math.min(confidence, 92));
            if (!hasAlignedVolume) {
                confidence = Math.min(confidence, 84);
            }
            if (confirmations < 3) {
                confidence = Math.min(confidence, 82);
            }
            if (!qualityOk) {
                confidence = Math.min(confidence, 64);
            }

            if (qualityOk && confidence >= 70) {
                return new SignalResult(isLong, confidence, reason.toString().trim());
            }

        } catch (Exception e) {
            Log.e(TAG, "Analysis error: " + e.getMessage());
        }
        return null;
    }

    private double calculateEMA(JSONArray klines, int period) {
        try {
            int len = klines.length();
            if (len < period) return 0;

            double multiplier = 2.0 / (period + 1);
            double ema = klines.getJSONArray(len - period).getDouble(4); // close

            for (int i = len - period + 1; i < len; i++) {
                double close = klines.getJSONArray(i).getDouble(4);
                ema = (close - ema) * multiplier + ema;
            }
            return ema;
        } catch (Exception e) { return 0; }
    }

    private double calculateRSI(JSONArray klines, int period) {
        try {
            int len = klines.length();
            if (len < period + 1) return 50;

            double gainSum = 0, lossSum = 0;
            for (int i = len - period; i < len; i++) {
                double close = klines.getJSONArray(i).getDouble(4);
                double prevClose = klines.getJSONArray(i - 1).getDouble(4);
                double change = close - prevClose;
                if (change > 0) gainSum += change;
                else lossSum += Math.abs(change);
            }

            double avgGain = gainSum / period;
            double avgLoss = lossSum / period;

            if (avgLoss == 0) return 100;
            double rs = avgGain / avgLoss;
            return 100 - (100 / (1 + rs));
        } catch (Exception e) { return 50; }
    }

    private double calculateAvgVolume(JSONArray klines, int period) {
        try {
            int len = klines.length();
            if (len < period) return 0;
            double sum = 0;
            for (int i = len - period; i < len; i++) {
                sum += klines.getJSONArray(i).getDouble(5);
            }
            return sum / period;
        } catch (Exception e) { return 0; }
    }

    private String httpGet(String urlStr) {
        for (int attempt = 1; attempt <= HTTP_MAX_ATTEMPTS; attempt++) {
            HttpURLConnection conn = null;
            try {
                URL url = new URL(urlStr);
                conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("GET");
                conn.setConnectTimeout(HTTP_TIMEOUT_MS);
                conn.setReadTimeout(HTTP_TIMEOUT_MS);
                conn.setRequestProperty("User-Agent", "VisorCrypto/1.0");

                int code = conn.getResponseCode();
                if (code == 200) {
                    BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
                    StringBuilder sb = new StringBuilder();
                    String line;
                    while ((line = reader.readLine()) != null) sb.append(line);
                    reader.close();
                    return sb.toString();
                }

                boolean retryable = code == 429 || code >= 500;
                if (!retryable || attempt >= HTTP_MAX_ATTEMPTS) {
                    return null;
                }
            } catch (Exception e) {
                if (attempt >= HTTP_MAX_ATTEMPTS) {
                    return null;
                }
            } finally {
                if (conn != null) conn.disconnect();
            }

            try {
                Thread.sleep(180L * attempt);
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                return null;
            }
        }
        return null;
    }

    private void ensureSignalStateReset(SharedPreferences prefs) {
        if (prefs == null) return;
        if (SIGNAL_STATE_RESET_VERSION.equals(prefs.getString(PREF_SIGNAL_STATE_RESET_VERSION, ""))) {
            return;
        }

        SharedPreferences.Editor editor = prefs.edit();
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

    private boolean isAppActuallyForeground() {
        // Use Activity lifecycle state only. Process importance can be reported as foreground
        // while this service is active, which would incorrectly suppress background alerts.
        return MainActivity.isAppInForeground();
    }

    private void fireSignalNotification(
        String title,
        String body,
        int id,
        String symbol,
        String direction,
        int confidence,
        double price,
        String reason,
        long notifiedAt
    ) {
        try {
            if (isAppActuallyForeground()) {
                Log.d(TAG, "Skipping signal notification while app is in foreground");
                return;
            }

            Intent intent = new Intent(this, MainActivity.class);
            intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            intent.setAction("OPEN_SIGNALS");
            intent.putExtra("FROM_SIGNAL_NOTIFICATION", true);
            intent.putExtra("NOTIF_SYMBOL", symbol != null ? symbol : "");
            intent.putExtra("NOTIF_DIRECTION", direction != null ? direction : "");
            intent.putExtra("NOTIF_CONFIDENCE", Math.max(0, Math.min(100, confidence)));
            intent.putExtra("NOTIF_PRICE", price);
            intent.putExtra("NOTIF_REASON", reason != null ? reason : "");
            intent.putExtra("NOTIF_TS", Math.max(0L, notifiedAt));
            long safeNotifiedAt = Math.max(0L, notifiedAt);
            long expiresAt = safeNotifiedAt + DEDUP_MS;
            String snapshotId = String.valueOf(symbol != null ? symbol : "") + "_" + String.valueOf(direction != null ? direction : "") + "_" + (safeNotifiedAt / DEDUP_MS);
            intent.putExtra("NOTIF_SNAPSHOT_ID", snapshotId);
            intent.putExtra("NOTIF_EXPIRES_AT", expiresAt);
            intent.putExtra("NOTIF_FINAL_DIRECTION", direction != null ? direction : "");
            intent.putExtra("NOTIF_FINAL_CONFIDENCE", Math.max(0, Math.min(100, confidence)));
            PendingIntent pendingIntent = PendingIntent.getActivity(
                this, id, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );

            Notification notification = new NotificationCompat.Builder(this, SIGNAL_CHANNEL_ID)
                .setContentTitle(title)
                .setContentText(body)
                .setSmallIcon(android.R.drawable.ic_popup_reminder)
                .setContentIntent(pendingIntent)
                .setAutoCancel(true)
                .setTimeoutAfter(DEDUP_MS)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setDefaults(NotificationCompat.DEFAULT_ALL)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .build();

            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) {
                nm.notify(id, notification);
            }
        } catch (Exception e) {
            Log.e(TAG, "Notification error: " + e.getMessage());
        }
    }

    private void enqueueSharedCallSync(
        String symbol,
        String shortName,
        String direction,
        int confidence,
        double currentPrice,
        String reason,
        long now,
        int minConfidence
    ) {
        try {
            final SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
            final String workerUrl = String.valueOf(prefs.getString(PREF_WORKER_URL, "")).trim();
            if (workerUrl.isEmpty()) {
                return;
            }

            final String syncKey = "last_call_sync_" + symbol;
            final long lastSyncAt = prefs.getLong(syncKey, 0L);
            if (lastSyncAt > 0 && (now - lastSyncAt) < CALL_SYNC_RETRY_WINDOW_MS) {
                return;
            }

            callSyncExecutor.submit(() -> {
                try {
                    boolean synced = syncCallToWorker(
                        symbol,
                        shortName,
                        direction,
                        confidence,
                        currentPrice,
                        reason,
                        now,
                        minConfidence
                    );
                    if (synced) {
                        prefs.edit().putLong(syncKey, System.currentTimeMillis()).apply();
                    }
                } catch (Exception e) {
                    Log.w(TAG, "Shared call sync enqueue failed: " + e.getMessage());
                }
            });
        } catch (Exception e) {
            Log.w(TAG, "Shared call sync skipped: " + e.getMessage());
        }
    }

    private boolean syncCallToWorker(
        String symbol,
        String shortName,
        String direction,
        int confidence,
        double currentPrice,
        String reason,
        long now,
        int minConfidence
    ) {
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        String workerUrl = String.valueOf(prefs.getString(PREF_WORKER_URL, "")).trim();
        if (workerUrl.isEmpty()) {
            return false;
        }

        String deviceId = getOrCreateWorkerDeviceId(prefs);
        if (deviceId.isEmpty()) {
            return false;
        }

        String userId = normalizeWorkerUserId(prefs.getString(PREF_USER_ID, ""));
        String token = getWorkerAuthToken(workerUrl, deviceId, userId, false);
        if (token == null || token.trim().isEmpty()) {
            return false;
        }

        String safeShort = String.valueOf(shortName == null ? symbol : shortName)
            .replaceAll("[^A-Za-z0-9]", "")
            .toUpperCase(Locale.US);
        if (safeShort.isEmpty()) {
            safeShort = symbol.replace("USDT", "");
        }
        if (safeShort.length() > 10) {
            safeShort = safeShort.substring(0, 10);
        }

        String safeReason = String.format(
            Locale.US,
            "%s %d%% (mín %d%%) · Native Background · %s",
            direction,
            Math.max(0, Math.min(100, confidence)),
            Math.max(DEFAULT_MIN_CONFIDENCE, Math.min(100, minConfidence)),
            reason == null ? "scan" : reason
        );
        safeReason = "S3 | " + safeReason;
        if (safeReason.length() > 180) {
            safeReason = safeReason.substring(0, 180);
        }

        JSONObject payload = new JSONObject();
        try {
            payload.put("symbol", symbol);
            payload.put("direction", direction);
            payload.put("confidence", Math.max(0, Math.min(100, confidence)));
            payload.put("gates", "NATIVE");
            payload.put("price", currentPrice > 0 ? String.format(Locale.US, "%.8f", currentPrice) : "");
            payload.put("name", safeShort);
            payload.put("short", safeShort);
            payload.put("img", "");
            payload.put("reason", safeReason);
            payload.put("time", now);
        } catch (Exception e) {
            return false;
        }

        String idempotencyKey = ("native:" + symbol + ":" + direction + ":" + (now / DEDUP_MS)).toLowerCase(Locale.US);
        if (idempotencyKey.length() > 120) {
            idempotencyKey = idempotencyKey.substring(0, 120);
        }

        Map<String, String> headers = new HashMap<>();
        headers.put("Content-Type", "application/json");
        headers.put("Authorization", "Bearer " + token);
        headers.put("X-Device-Id", deviceId);
        headers.put("X-App-Client", "visor-mobile-native");
        headers.put("Idempotency-Key", idempotencyKey);
        if (!userId.isEmpty()) {
            headers.put("X-User-Id", userId);
        }

        HttpResult postResult = httpPostJson(workerUrl + "/calls", payload.toString(), headers, 5000);
        if (postResult.status == 401 || postResult.status == 403) {
            String refreshed = getWorkerAuthToken(workerUrl, deviceId, userId, true);
            if (refreshed != null && !refreshed.trim().isEmpty()) {
                headers.put("Authorization", "Bearer " + refreshed);
                postResult = httpPostJson(workerUrl + "/calls", payload.toString(), headers, 5000);
            }
        }

        if (postResult.status < 200 || postResult.status >= 300) {
            Log.w(TAG, "Shared call sync failed HTTP " + postResult.status + " for " + symbol);
            return false;
        }

        try {
            JSONObject data = new JSONObject(postResult.body);
            return data.optBoolean("success", false);
        } catch (Exception ignored) {
            // Some proxies may strip response body; HTTP 2xx already indicates success.
            return true;
        }
    }

    private String getWorkerAuthToken(String workerUrl, String deviceId, String userId, boolean forceRefresh) {
        long now = System.currentTimeMillis();
        synchronized (authTokenLock) {
            if (!forceRefresh && cachedAuthToken != null && !cachedAuthToken.isEmpty() && cachedAuthTokenExpiresAt > (now + 10_000L)) {
                return cachedAuthToken;
            }
        }

        try {
            JSONObject body = new JSONObject();
            body.put("deviceId", deviceId);
            if (!userId.isEmpty()) {
                body.put("userId", userId);
            }

            Map<String, String> headers = new HashMap<>();
            headers.put("Content-Type", "application/json");
            headers.put("X-Device-Id", deviceId);
            headers.put("X-App-Client", "visor-mobile-native");
            if (!userId.isEmpty()) {
                headers.put("X-User-Id", userId);
            }

            HttpResult authResult = httpPostJson(workerUrl + "/auth/issue", body.toString(), headers, 5000);
            if (authResult.status < 200 || authResult.status >= 300) {
                return null;
            }

            JSONObject authData = new JSONObject(authResult.body);
            if (!authData.optBoolean("success", false)) {
                return null;
            }

            String token = authData.optString("token", "");
            if (token.isEmpty()) {
                return null;
            }

            long expiresInSec = Math.max(30L, authData.optLong("expiresIn", 120L));
            long expiresAt = System.currentTimeMillis() + (expiresInSec * 1000L);

            synchronized (authTokenLock) {
                cachedAuthToken = token;
                cachedAuthTokenExpiresAt = expiresAt;
            }

            return token;
        } catch (Exception e) {
            Log.w(TAG, "Worker auth token issue failed: " + e.getMessage());
            return null;
        }
    }

    private String getOrCreateWorkerDeviceId(SharedPreferences prefs) {
        String normalized = normalizeWorkerDeviceId(prefs.getString(PREF_DEVICE_ID, ""));
        if (!normalized.isEmpty()) {
            return normalized;
        }

        String androidId = "";
        try {
            androidId = Settings.Secure.getString(getContentResolver(), Settings.Secure.ANDROID_ID);
        } catch (Exception ignored) {}

        normalized = normalizeWorkerDeviceId("dev_" + String.valueOf(androidId));
        if (normalized.isEmpty()) {
            normalized = normalizeWorkerDeviceId("dev_" + UUID.randomUUID().toString().replace("-", ""));
        }

        if (!normalized.isEmpty()) {
            prefs.edit().putString(PREF_DEVICE_ID, normalized).apply();
        }

        return normalized;
    }

    private String normalizeWorkerDeviceId(String raw) {
        if (raw == null) return "";
        String normalized = raw.trim().toLowerCase(Locale.US).replaceAll("[^a-z0-9._:-]", "");
        if (normalized.length() > 128) {
            normalized = normalized.substring(0, 128);
        }
        if (normalized.length() < 8) {
            return "";
        }
        return normalized;
    }

    private String normalizeWorkerUserId(String raw) {
        if (raw == null) return "";
        String normalized = raw.trim().replaceAll("[^A-Za-z0-9._@:-]", "");
        if (normalized.length() > 64) {
            normalized = normalized.substring(0, 64);
        }
        return normalized;
    }

    private HttpResult httpPostJson(String urlStr, String jsonBody, Map<String, String> headers, int timeoutMs) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(urlStr);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setDoOutput(true);
            conn.setConnectTimeout(timeoutMs);
            conn.setReadTimeout(timeoutMs);
            conn.setRequestProperty("User-Agent", "VisorCrypto/1.0");

            if (headers != null) {
                for (Map.Entry<String, String> entry : headers.entrySet()) {
                    if (entry.getKey() == null) continue;
                    String value = entry.getValue();
                    if (value == null || value.isEmpty()) continue;
                    conn.setRequestProperty(entry.getKey(), value);
                }
            }

            byte[] bodyBytes = String.valueOf(jsonBody == null ? "{}" : jsonBody).getBytes("UTF-8");
            OutputStream os = conn.getOutputStream();
            os.write(bodyBytes);
            os.flush();
            os.close();

            int status = conn.getResponseCode();
            String responseBody = readHttpBody(conn, status);
            return new HttpResult(status, responseBody);
        } catch (Exception e) {
            return new HttpResult(0, "");
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private String readHttpBody(HttpURLConnection conn, int statusCode) {
        BufferedReader reader = null;
        try {
            InputStream stream = (statusCode >= 200 && statusCode < 400)
                ? conn.getInputStream()
                : conn.getErrorStream();
            if (stream == null) return "";

            reader = new BufferedReader(new InputStreamReader(stream));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) sb.append(line);
            return sb.toString();
        } catch (Exception e) {
            return "";
        } finally {
            if (reader != null) {
                try { reader.close(); } catch (Exception ignored) {}
            }
        }
    }

    private void updatePersistentNotification(String text) {
        try {
            Intent notificationIntent = new Intent(this, MainActivity.class);
            notificationIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            notificationIntent.setAction("OPEN_SIGNALS");
            notificationIntent.putExtra("FROM_SIGNAL_NOTIFICATION", true);
            PendingIntent pendingIntent = PendingIntent.getActivity(
                this, 0, notificationIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );

            Intent stopIntent = new Intent(this, ScanForegroundService.class);
            stopIntent.setAction("STOP");
            PendingIntent stopPendingIntent = PendingIntent.getService(
                this, 1, stopIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );

            Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("Visor Crypto — Ativo")
                .setContentText(text)
                .setSmallIcon(android.R.drawable.ic_popup_reminder)
                .setContentIntent(pendingIntent)
                .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Parar", stopPendingIntent)
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setCategory(NotificationCompat.CATEGORY_SERVICE)
                .build();

            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) {
                nm.notify(NOTIFICATION_ID, notification);
            }
        } catch (Exception e) {}
    }

    private String getCurrentTime() {
        SimpleDateFormat sdf = new SimpleDateFormat("HH:mm", Locale.getDefault());
        sdf.setTimeZone(TimeZone.getDefault());
        return sdf.format(new Date());
    }

    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm == null) return;

            // Scan monitoring channel (low priority, persistent)
            NotificationChannel scanChannel = new NotificationChannel(
                CHANNEL_ID,
                "Monitoramento de Sinais",
                NotificationManager.IMPORTANCE_LOW
            );
            scanChannel.setDescription("Notificação persistente enquanto o Visor Crypto monitora sinais");
            scanChannel.setShowBadge(false);
            nm.createNotificationChannel(scanChannel);

            // Signal alerts channel (high priority, with sound)
            NotificationChannel signalChannel = new NotificationChannel(
                SIGNAL_CHANNEL_ID,
                "Sinais de Trading",
                NotificationManager.IMPORTANCE_HIGH
            );
            signalChannel.setDescription("Alertas de sinais LONG/SHORT confirmados");
            signalChannel.enableVibration(true);
            signalChannel.setShowBadge(true);
            nm.createNotificationChannel(signalChannel);
        }
    }

    private JSONObject loadLatestResults(SharedPreferences prefs) {
        if (prefs == null) {
            return new JSONObject();
        }

        String raw = prefs.getString(PREF_LAST_RESULTS_JSON, "{}");
        if (raw == null || raw.trim().isEmpty()) {
            return new JSONObject();
        }

        try {
            return new JSONObject(raw);
        } catch (Exception e) {
            Log.w(TAG, "Failed to parse cached native results: " + e.getMessage());
            return new JSONObject();
        }
    }

    private JSONObject loadAuthoritativeResults(SharedPreferences prefs) {
        if (prefs == null) {
            return new JSONObject();
        }

        String raw = prefs.getString(PREF_AUTHORITATIVE_RESULTS_JSON, "{}");
        if (raw == null || raw.trim().isEmpty()) {
            return new JSONObject();
        }

        try {
            return new JSONObject(raw);
        } catch (Exception e) {
            Log.w(TAG, "Failed to parse authoritative results: " + e.getMessage());
            return new JSONObject();
        }
    }

    private AuthoritativeSignal resolveAuthoritativeSignal(
        JSONObject authoritativeResults,
        String symbol,
        long now,
        long authoritativeUpdatedAt
    ) {
        if (authoritativeResults == null || symbol == null || symbol.trim().isEmpty()) {
            return null;
        }

        try {
            JSONObject entry = authoritativeResults.optJSONObject(symbol);
            if (entry == null) {
                return null;
            }

            long ts = Math.max(
                0L,
                entry.optLong("lastScanAt", entry.optLong("timestamp", entry.optLong("time", authoritativeUpdatedAt)))
            );
            if (ts <= 0L) {
                ts = Math.max(0L, authoritativeUpdatedAt);
            }
            if (ts <= 0L || (now - ts) > AUTHORITATIVE_SIGNAL_MAX_AGE_MS) {
                return null;
            }

            String rawDirection = String.valueOf(entry.optString("finalDirection", entry.optString("direction", entry.optString("signal", "NEUTRO")))).toUpperCase(Locale.US);
            String direction;
            if (rawDirection.contains("LONG")) {
                direction = "LONG";
            } else if (rawDirection.contains("SHORT")) {
                direction = "SHORT";
            } else {
                direction = "NEUTRO";
            }

            int confidence = Math.max(0, Math.min(100, (int) Math.round(entry.optDouble("finalConfidence", entry.optDouble("confidence", 0)))));
            double price = entry.optDouble("price", entry.optDouble("currentPrice", 0));
            String reason = entry.optString("reason", "");

            return new AuthoritativeSignal(direction, confidence, price, reason, ts);
        } catch (Exception e) {
            return null;
        }
    }

    private void persistLatestResults(SharedPreferences prefs, JSONObject latestResults) {
        if (prefs == null || latestResults == null) {
            return;
        }

        try {
            prefs.edit()
                .putString(PREF_LAST_RESULTS_JSON, latestResults.toString())
                .putLong(PREF_LAST_RESULTS_UPDATED_AT, System.currentTimeMillis())
                .apply();
        } catch (Exception e) {
            Log.w(TAG, "Failed to persist native results: " + e.getMessage());
        }
    }

    private void saveLatestResultEntry(
        JSONObject latestResults,
        String symbol,
        String signal,
        int confidence,
        double currentPrice,
        String reason,
        long scanAt,
        int minConfidence,
        boolean notified,
        String source
    ) {
        if (latestResults == null || symbol == null || symbol.trim().isEmpty()) {
            return;
        }

        try {
            JSONObject previous = latestResults.optJSONObject(symbol);
            JSONObject entry = previous != null ? previous : new JSONObject();

            String normalizedSignal = "NEUTRO";
            if ("LONG".equalsIgnoreCase(signal)) {
                normalizedSignal = "LONG";
            } else if ("SHORT".equalsIgnoreCase(signal)) {
                normalizedSignal = "SHORT";
            }

            double safePrice = currentPrice > 0
                ? currentPrice
                : entry.optDouble("currentPrice", entry.optDouble("price", 0));

            entry.put("signal", normalizedSignal);
            entry.put("direction", normalizedSignal);
            entry.put("finalDirection", normalizedSignal);
            entry.put("confidence", Math.max(0, Math.min(100, confidence)));
            entry.put("finalConfidence", Math.max(0, Math.min(100, confidence)));
            entry.put("currentPrice", safePrice);
            entry.put("price", safePrice);
            entry.put("reason", reason != null ? reason : "");
            entry.put("lastScanAt", scanAt);
            entry.put("minConfidence", minConfidence);
            entry.put("source", source != null ? source : "native_background");
            if (notified) {
                entry.put("lastNotifiedAt", scanAt);
                entry.put("lastNotifiedSignal", normalizedSignal);
                entry.put("lastNotifiedDirection", normalizedSignal);
                entry.put("lastNotifiedConfidence", Math.max(0, Math.min(100, confidence)));
                entry.put("lastNotifiedPrice", safePrice);
                entry.put("lastNotifiedReason", reason != null ? reason : "");
                entry.put("snapshotId", symbol + "_" + normalizedSignal + "_" + (scanAt / DEDUP_MS));
                entry.put("expiresAt", scanAt + DEDUP_MS);
            }

            latestResults.put(symbol, entry);
        } catch (Exception e) {
            Log.w(TAG, "Failed to save native result entry for " + symbol + ": " + e.getMessage());
        }
    }

    private JSONObject parseSymbolsConfig(String raw) {
        if (raw == null || raw.trim().isEmpty()) {
            return null;
        }
        try {
            return new JSONObject(raw);
        } catch (Exception e) {
            Log.w(TAG, "Invalid symbols config: " + e.getMessage());
            return null;
        }
    }

    private String normalizeScanSymbol(String raw) {
        if (raw == null) return "";
        String clean = raw.toUpperCase().replaceAll("[^A-Z0-9]", "");
        if (clean.isEmpty()) return "";
        if (!clean.endsWith("USDT")) {
            clean = clean + "USDT";
        }
        return clean;
    }

    private List<ScanTarget> buildScanTargets(JSONObject symbolsConfig) {
        List<ScanTarget> targets = new ArrayList<>();
        HashSet<String> seen = new HashSet<>();

        boolean hasConfig = symbolsConfig != null && symbolsConfig.length() > 0;
        if (hasConfig) {
            Iterator<String> keys = symbolsConfig.keys();
            while (keys.hasNext()) {
                String rawKey = keys.next();
                JSONObject entry = symbolsConfig.optJSONObject(rawKey);
                if (entry == null || !entry.optBoolean("enabled", false)) {
                    continue;
                }

                String symbol = normalizeScanSymbol(rawKey);
                if (symbol.isEmpty() || !seen.add(symbol)) {
                    continue;
                }

                String shortName = symbol.endsWith("USDT")
                    ? symbol.substring(0, symbol.length() - 4)
                    : symbol;
                targets.add(new ScanTarget(symbol, shortName, shortName));

                if (targets.size() >= MAX_SYMBOLS_PER_SCAN) {
                    break;
                }
            }
            return targets;
        }

        for (String[] row : FALLBACK_SCAN_SYMBOLS) {
            String symbol = normalizeScanSymbol(row[0]);
            if (symbol.isEmpty() || !seen.add(symbol)) {
                continue;
            }
            String displayName = row[1];
            String shortName = row[2];
            targets.add(new ScanTarget(symbol, displayName, shortName));
            if (targets.size() >= MAX_SYMBOLS_PER_SCAN) {
                break;
            }
        }

        return targets;
    }

    private SymbolConfig resolveSymbolConfig(String symbol, JSONObject symbolsConfig, int globalMinConf) {
        int fallbackMin = clampMinConfidence(globalMinConf);

        // Backward compatibility for older app versions that only send global confidence.
        if (symbolsConfig == null || symbolsConfig.length() == 0) {
            return new SymbolConfig(true, fallbackMin);
        }

        JSONObject entry = symbolsConfig.optJSONObject(symbol);
        if (entry == null) {
            return new SymbolConfig(false, fallbackMin);
        }

        boolean enabled = entry.optBoolean("enabled", false);
        int minConfidence = clampMinConfidence(entry.optInt("minConfidence", fallbackMin));
        return new SymbolConfig(enabled, minConfidence);
    }

    private int clampMinConfidence(int value) {
        return Math.max(DEFAULT_MIN_CONFIDENCE, Math.min(100, value));
    }

    private static class ScanTarget {
        String symbol;
        String displayName;
        String shortName;

        ScanTarget(String symbol, String displayName, String shortName) {
            this.symbol = symbol;
            this.displayName = displayName;
            this.shortName = shortName;
        }
    }

    private static class HttpResult {
        int status;
        String body;

        HttpResult(int status, String body) {
            this.status = status;
            this.body = body;
        }
    }

    private static class AuthoritativeSignal {
        String direction;
        int confidence;
        double price;
        String reason;
        long timestamp;

        AuthoritativeSignal(String direction, int confidence, double price, String reason, long timestamp) {
            this.direction = direction;
            this.confidence = confidence;
            this.price = price;
            this.reason = reason;
            this.timestamp = timestamp;
        }
    }

    // Simple result holder
    private static class SymbolConfig {
        boolean enabled;
        int minConfidence;

        SymbolConfig(boolean enabled, int minConfidence) {
            this.enabled = enabled;
            this.minConfidence = minConfidence;
        }
    }

    private static class SignalResult {
        boolean isLong;
        int confidence;
        String reason;

        SignalResult(boolean isLong, int confidence, String reason) {
            this.isLong = isLong;
            this.confidence = confidence;
            this.reason = reason;
        }
    }
}
