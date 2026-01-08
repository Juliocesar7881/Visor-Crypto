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
        // Enviar evento para o WebView JavaScript
        WebView webView = getBridge().getWebView();
        if (webView != null) {
            webView.evaluateJavascript(
                "(function() { " +
                "  var event = new CustomEvent('androidBackButton', { detail: {} }); " +
                "  document.dispatchEvent(event); " +
                "  return window.backButtonHandled || false; " +
                "})();",
                result -> {
                    // Se o JavaScript não tratou o evento, deixa o comportamento padrão
                    if (result == null || result.equals("false") || result.equals("null")) {
                        // Não fazer nada - deixa o JavaScript decidir
                    }
                }
            );
        }
        // Não chama super.onBackPressed() para evitar fechar o app
        // O JavaScript vai controlar quando permitir sair
    }
}
