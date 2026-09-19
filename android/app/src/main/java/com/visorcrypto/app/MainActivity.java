package com.visorcrypto.app;

import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.content.pm.ApplicationInfo;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
    
    private boolean pendingDashboardOpen = false;
    private static final int MAX_SIGNALS_OPEN_ATTEMPTS = 45;
    private static final long SIGNALS_OPEN_RETRY_MS = 250L;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private int signalsOpenAttempts = 0;
    private final Runnable openSignalsRunnable = this::attemptOpenSignals;
    private static volatile boolean appInForeground = false;
    private String pendingSignalPayloadJson = null;

    public static boolean isAppInForeground() {
        return appInForeground;
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Register custom plugins
        registerPlugin(BackgroundScanPlugin.class);
        registerPlugin(MonetizationPlugin.class);
        
        super.onCreate(savedInstanceState);
        
        // WebView debugging only in debug builds.
        boolean isDebuggable = (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        WebView.setWebContentsDebuggingEnabled(isDebuggable);

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                dispatchBackToWebView();
            }
        });

        // Check if launched from signal notification
        checkNotificationIntent(getIntent());
    }

    @Override
    public void onResume() {
        super.onResume();
        appInForeground = true;

        SharedPreferences signalPrefs = getSharedPreferences(SignalBackgroundCoordinator.PREFS, MODE_PRIVATE);
        if (signalPrefs.getBoolean(SignalBackgroundCoordinator.PREF_SERVICE_ENABLED, false)) {
            SignalBackgroundCoordinator.schedulePeriodic(this);
            long now = System.currentTimeMillis();
            long resultsAt = signalPrefs.getLong("last_results_updated_at", 0L);
            if (resultsAt <= 0L || (now - resultsAt) > 10 * 60 * 1000L) {
                SignalBackgroundCoordinator.requestImmediate(this);
            }
            long topicsAt = signalPrefs.getLong(SignalBackgroundCoordinator.PREF_TOPIC_SYNC_AT, 0L);
            if (topicsAt <= 0L || (now - topicsAt) > 24 * 60 * 60 * 1000L) {
                SignalBackgroundCoordinator.syncTopics(this);
            }
        }

        // Light repaint on resume without hiding the WebView.
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView != null) {
            webView.post(() -> {
                try {
                    webView.invalidate();
                    webView.requestLayout();
                    try {
                            // Notify JS layer that app resumed — cleans overflow locks
                            webView.evaluateJavascript(
                                "(function(){ try { " +
                                "document.body.style.overflow='';" +
                                "document.documentElement.style.overflow='';" +
                                "document.dispatchEvent(new Event('visor-foreground-resume'));" +
                                "} catch(e){} })()",
                                null
                            );
                    } catch (Exception ignored) {}
                } catch (Exception ignored) {}
            });
        }

        if (pendingDashboardOpen) {
            scheduleSignalsOpen(250);
        }
    }

    @Override
    public void onPause() {
        appInForeground = false;
        super.onPause();
    }

    @Override
    public void onStop() {
        appInForeground = false;
        super.onStop();
    }

    @Override
    public void onDestroy() {
        appInForeground = false;
        pendingDashboardOpen = false;
        pendingSignalPayloadJson = null;
        signalsOpenAttempts = 0;
        mainHandler.removeCallbacks(openSignalsRunnable);
        super.onDestroy();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        // Open SINAIS section when the intent comes from a signal notification.
        if (isSignalNotificationIntent(intent)) {
            pendingDashboardOpen = true;
            pendingSignalPayloadJson = buildSignalPayloadJson(intent);
            signalsOpenAttempts = 0;
            scheduleSignalsOpen(120);
        }
    }

    private boolean isSignalNotificationIntent(Intent intent) {
        if (intent == null) return false;
        return intent.getBooleanExtra("FROM_SIGNAL_NOTIFICATION", false)
            || "OPEN_SIGNALS".equals(intent.getAction());
    }

    private void checkNotificationIntent(Intent intent) {
        if (!isSignalNotificationIntent(intent)) {
            return; // Normal launch or foreground service tap, not a signal notification
        }
        // Signal notification tap while app was cold — open SINAIS once WebView is ready.
        pendingDashboardOpen = true;
        pendingSignalPayloadJson = buildSignalPayloadJson(intent);
        signalsOpenAttempts = 0;
        scheduleSignalsOpen(700);
    }

    private String buildSignalPayloadJson(Intent intent) {
        if (intent == null) return null;
        try {
            String symbol = intent.getStringExtra("NOTIF_SYMBOL");
            if (symbol == null || symbol.trim().isEmpty()) {
                return null;
            }

            JSONObject payload = new JSONObject();
            payload.put("symbol", symbol);
            payload.put("direction", intent.getStringExtra("NOTIF_DIRECTION") != null ? intent.getStringExtra("NOTIF_DIRECTION") : "");
            payload.put("confidence", intent.getIntExtra("NOTIF_CONFIDENCE", 0));
            payload.put("price", intent.getDoubleExtra("NOTIF_PRICE", 0d));
            payload.put("reason", intent.getStringExtra("NOTIF_REASON") != null ? intent.getStringExtra("NOTIF_REASON") : "");
            payload.put("notifiedAt", intent.getLongExtra("NOTIF_TS", System.currentTimeMillis()));
            payload.put("snapshotId", intent.getStringExtra("NOTIF_SNAPSHOT_ID") != null ? intent.getStringExtra("NOTIF_SNAPSHOT_ID") : "");
            payload.put("expiresAt", intent.getLongExtra("NOTIF_EXPIRES_AT", 0L));
            payload.put("finalDirection", intent.getStringExtra("NOTIF_FINAL_DIRECTION") != null ? intent.getStringExtra("NOTIF_FINAL_DIRECTION") : intent.getStringExtra("NOTIF_DIRECTION"));
            payload.put("finalConfidence", intent.getIntExtra("NOTIF_FINAL_CONFIDENCE", intent.getIntExtra("NOTIF_CONFIDENCE", 0)));
            return payload.toString();
        } catch (Exception e) {
            return null;
        }
    }

    private void scheduleSignalsOpen(long delayMs) {
        if (!pendingDashboardOpen) {
            return;
        }
        mainHandler.removeCallbacks(openSignalsRunnable);
        mainHandler.postDelayed(openSignalsRunnable, Math.max(0L, delayMs));
    }

    private void attemptOpenSignals() {
        if (!pendingDashboardOpen) {
            return;
        }

        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null) {
            scheduleNextSignalsOpenAttempt();
            return;
        }

        final String payloadLiteral = pendingSignalPayloadJson == null
            ? "null"
            : JSONObject.quote(pendingSignalPayloadJson);

        webView.evaluateJavascript(
            "(function(){" +
            "  try {" +
            "    if (" + payloadLiteral + " && typeof window.__visorApplyNativeNotificationPayload === 'function') {" +
            "      window.__visorApplyNativeNotificationPayload(" + payloadLiteral + ");" +
            "    }" +
            "    var dashReady = (typeof dashLoad === 'function');" +
            "    var canOpenDashboard = (typeof showSectionDirect === 'function') || (typeof showSection === 'function');" +
            "    if (dashReady && canOpenDashboard) {" +
            "      var dashEl = document.getElementById('dashboard');" +
            "      var alreadyActive = !!(dashEl && dashEl.classList && dashEl.classList.contains('active'));" +
            "      if (!alreadyActive) {" +
            "        if (typeof showSectionDirect === 'function') {" +
            "          showSectionDirect('dashboard');" +
            "        } else {" +
            "          showSection('dashboard');" +
            "        }" +
            "      } else {" +
            "        try { dashLoad(); } catch (e) {}" +
            "      }" +
            "      return 'opened';" +
            "    }" +
            "  } catch (e) {}" +
            "  return 'wait';" +
            "})();",
            value -> {
                if (!pendingDashboardOpen) {
                    return;
                }
                String normalized = value == null ? "" : value.replace("\"", "");
                if ("opened".equalsIgnoreCase(normalized)) {
                    pendingDashboardOpen = false;
                    pendingSignalPayloadJson = null;
                    signalsOpenAttempts = 0;
                    mainHandler.removeCallbacks(openSignalsRunnable);
                    return;
                }
                scheduleNextSignalsOpenAttempt();
            }
        );
    }

    private void scheduleNextSignalsOpenAttempt() {
        if (!pendingDashboardOpen) {
            return;
        }
        if (signalsOpenAttempts >= MAX_SIGNALS_OPEN_ATTEMPTS) {
            pendingDashboardOpen = false;
            signalsOpenAttempts = 0;
            mainHandler.removeCallbacks(openSignalsRunnable);
            return;
        }
        signalsOpenAttempts += 1;
        mainHandler.removeCallbacks(openSignalsRunnable);
        mainHandler.postDelayed(openSignalsRunnable, SIGNALS_OPEN_RETRY_MS);
    }
    
    private void dispatchBackToWebView() {
        // Let the WebView router decide how to handle Back without closing the app.
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView != null) {
            webView.post(() -> {
                webView.evaluateJavascript(
                    "(function() { " +
                    "  try { " +
                    "    if (typeof handleBackButton === 'function') { " +
                    "      var result = handleBackButton(); " +
                    "      return result ? 'true' : 'false'; " +
                    "    } " +
                    "    return 'false'; " +
                    "  } catch(e) { " +
                    "    console.error('Back button error:', e); " +
                    "    return 'false'; " +
                    "  } " +
                    "})();",
                    null
                );
            });
        }
    }
}
