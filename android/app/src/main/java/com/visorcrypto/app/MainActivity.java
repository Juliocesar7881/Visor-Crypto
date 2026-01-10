package com.visorcrypto.app;

import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
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
