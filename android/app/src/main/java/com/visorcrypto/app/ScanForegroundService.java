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
import android.util.Log;

import androidx.core.app.NotificationCompat;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

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
    private static final String SIGNAL_CHANNEL_ID = "visor_signals";
    private static final int NOTIFICATION_ID = 1001;
    private static final long SCAN_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
    private static final long DEDUP_MS = 30 * 60 * 1000; // 30 min dedup

    private PowerManager.WakeLock wakeLock;
    private Handler handler;
    private boolean isRunning = false;
    private int scanCount = 0;

    // Symbols to scan
    private static final String[][] SCAN_SYMBOLS = {
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
            performNativeScan();
            handler.postDelayed(this, SCAN_INTERVAL_MS);
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannels();
        handler = new Handler(Looper.getMainLooper());

        // Acquire WakeLock to prevent CPU sleep
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        if (pm != null) {
            wakeLock = pm.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                "VisorCrypto::ScanWakeLock"
            );
            wakeLock.acquire(10 * 60 * 1000L); // 10min, renewed each scan cycle
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && "STOP".equals(intent.getAction())) {
            isRunning = false;
            handler.removeCallbacks(scanRunnable);
            if (wakeLock != null && wakeLock.isHeld()) {
                wakeLock.release();
            }
            stopForeground(true);
            stopSelf();
            return START_NOT_STICKY;
        }

        // Build persistent notification
        Intent notificationIntent = new Intent(this, MainActivity.class);
        notificationIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
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
            // First scan after 30s, then every 5min
            handler.postDelayed(scanRunnable, 30 * 1000);
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
        handler.removeCallbacks(scanRunnable);
        if (wakeLock != null && wakeLock.isHeld()) {
            try { wakeLock.release(); } catch (Exception e) {}
        }
        super.onDestroy();
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        // When user swipes app from recents, try to restart service
        try {
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
        scanCount++;
        Log.d(TAG, "Starting native scan #" + scanCount);

        // Renew WakeLock each scan cycle (10min lease)
        if (wakeLock != null) {
            try {
                if (wakeLock.isHeld()) wakeLock.release();
                wakeLock.acquire(10 * 60 * 1000L);
            } catch (Exception e) {
                Log.e(TAG, "WakeLock renewal failed: " + e.getMessage());
            }
        }

        // Update persistent notification with scan count
        updatePersistentNotification("Último scan: " + getCurrentTime() + " (#" + scanCount + ")");

        new Thread(() -> {
            try {
            SharedPreferences prefs = getSharedPreferences("visor_scan", MODE_PRIVATE);
            
            for (String[] sym : SCAN_SYMBOLS) {
                if (!isRunning) break;
                try {
                    String symbol = sym[0];
                    String name = sym[1];
                    String shortName = sym[2];

                    // Check dedup
                    long lastNotified = prefs.getLong("last_" + symbol, 0);
                    if (System.currentTimeMillis() - lastNotified < DEDUP_MS) continue;

                    // Fetch klines (1h, last 50 candles)
                    String klinesJson = httpGet("https://api.binance.com/api/v3/klines?symbol=" + symbol + "&interval=1h&limit=50");
                    if (klinesJson == null) continue;

                    // Fetch ticker
                    String tickerJson = httpGet("https://api.binance.com/api/v3/ticker/24hr?symbol=" + symbol);
                    if (tickerJson == null) continue;

                    // Fetch funding rate
                    String fundingJson = httpGet("https://fapi.binance.com/fapi/v1/fundingRate?symbol=" + symbol + "&limit=1");

                    // Simple analysis
                    SignalResult result = analyzeSimple(klinesJson, tickerJson, fundingJson);
                    
                    if (result != null && result.confidence >= 60) {
                        String direction = result.isLong ? "LONG 🟢" : "SHORT 🔴";
                        String title = shortName + " — " + direction;
                        String body = "Confiança: " + result.confidence + "% | " + result.reason;

                        fireSignalNotification(title, body, symbol.hashCode());

                        // Save dedup timestamp
                        prefs.edit().putLong("last_" + symbol, System.currentTimeMillis()).apply();
                        
                        Log.d(TAG, "Signal: " + title + " — " + body);
                    }

                    // Small delay between symbols to avoid rate limiting
                    Thread.sleep(500);

                } catch (Exception e) {
                    Log.e(TAG, "Scan error for " + sym[0] + ": " + e.getMessage());
                }
            }
            Log.d(TAG, "Scan #" + scanCount + " complete");
            } catch (Exception e) {
                Log.e(TAG, "Scan thread error: " + e.getMessage());
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

            // Signal scoring
            int longScore = 0, shortScore = 0;
            StringBuilder reason = new StringBuilder();

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

            // Determine signal
            boolean isLong = longScore > shortScore;
            int confidence = Math.max(longScore, shortScore);
            confidence = Math.min(confidence, 95);

            if (confidence >= 55) {
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
        HttpURLConnection conn = null;
        try {
            URL url = new URL(urlStr);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(10000);
            conn.setRequestProperty("User-Agent", "VisorCrypto/1.0");

            int code = conn.getResponseCode();
            if (code != 200) return null;

            BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) sb.append(line);
            reader.close();
            return sb.toString();
        } catch (Exception e) {
            return null;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private void fireSignalNotification(String title, String body, int id) {
        try {
            Intent intent = new Intent(this, MainActivity.class);
            intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
            intent.putExtra("FROM_SIGNAL_NOTIFICATION", true);
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

    private void updatePersistentNotification(String text) {
        try {
            Intent notificationIntent = new Intent(this, MainActivity.class);
            notificationIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
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

    // Simple result holder
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