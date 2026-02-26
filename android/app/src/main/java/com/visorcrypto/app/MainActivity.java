package com.visorcrypto.app;

import android.os.Bundle;
import android.os.Build;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Register custom plugins
        registerPlugin(BackgroundScanPlugin.class);
        
        super.onCreate(savedInstanceState);
        
        // WebView debugging desabilitado para produção (Play Store)
        // Descomente a linha abaixo apenas para desenvolvimento local:
        // WebView.setWebContentsDebuggingEnabled(true);
    }
    
    @Override
    public void onBackPressed() {
        // Enviar evento para o WebView JavaScript e ESPERAR resposta
        WebView webView = getBridge().getWebView();
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
