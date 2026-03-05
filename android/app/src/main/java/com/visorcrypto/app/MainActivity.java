package com.visorcrypto.app;

import android.content.Intent;
import android.os.Bundle;
import android.os.Build;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    
    private boolean pendingDashboardOpen = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Register custom plugins
        registerPlugin(BackgroundScanPlugin.class);
        
        super.onCreate(savedInstanceState);
        
        // WebView debugging habilitado temporariamente para diagnóstico AdMob
        // DESABILITAR antes de publicar na Play Store:
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            WebView.setWebContentsDebuggingEnabled(true);
        }

        // Check if launched from signal notification
        checkNotificationIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        // Only navigate to dashboard if the intent is from a signal notification
        if (isSignalNotificationIntent(intent)) {
            navigateToDashboard();
        }
    }

    private boolean isSignalNotificationIntent(Intent intent) {
        if (intent == null) return false;
        return intent.getBooleanExtra("FROM_SIGNAL_NOTIFICATION", false);
    }

    private void checkNotificationIntent(Intent intent) {
        if (!isSignalNotificationIntent(intent)) {
            return; // Normal launch or foreground service tap, not a signal notification
        }
        // Signal notification tap while app was cold — open dashboard once WebView is ready
        pendingDashboardOpen = true;
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView != null) {
            webView.postDelayed(this::navigateToDashboard, 3000);
        }
    }

    private void navigateToDashboard() {
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView != null) {
            webView.post(() -> {
                webView.evaluateJavascript(
                    "if(typeof showSection==='function'){showSection('dashboard');}",
                    null
                );
            });
        }
        pendingDashboardOpen = false;
    }
    
    @Override
    public void onBackPressed() {
        // Enviar evento para o WebView JavaScript e ESPERAR resposta
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
        // NUNCA chama super.onBackPressed() - o app não deve fechar
    }
}
