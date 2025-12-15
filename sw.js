// Service Worker para Visor Crypto PWA
const CACHE_NAME = 'visor-crypto-v1';
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 horas

// Recursos para cache inicial
const STATIC_ASSETS = [
    './tradebot-mobile.html',
    './manifest.json'
];

// URLs de CDN para cache
const CDN_ASSETS = [
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// Instalação do Service Worker
self.addEventListener('install', event => {
    console.log('[SW] Instalando Service Worker...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[SW] Cache aberto, adicionando arquivos...');
                return cache.addAll([...STATIC_ASSETS]);
            })
            .then(() => self.skipWaiting())
    );
});

// Ativação - limpa caches antigos
self.addEventListener('activate', event => {
    console.log('[SW] Service Worker ativado');
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames
                    .filter(name => name !== CACHE_NAME)
                    .map(name => {
                        console.log('[SW] Removendo cache antigo:', name);
                        return caches.delete(name);
                    })
            );
        }).then(() => self.clients.claim())
    );
});

// Estratégia de fetch: Network First para APIs, Cache First para assets
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    
    // APIs de tempo real - sempre buscar da rede
    if (url.hostname.includes('binance.com') ||
        url.hostname.includes('coingecko.com') ||
        url.hostname.includes('cryptopanic.com') ||
        url.hostname.includes('alternative.me') ||
        url.hostname.includes('microlink.io') ||
        url.hostname.includes('translate.googleapis.com')) {
        
        event.respondWith(
            fetch(event.request)
                .catch(() => {
                    return new Response(JSON.stringify({ error: 'Offline' }), {
                        headers: { 'Content-Type': 'application/json' }
                    });
                })
        );
        return;
    }
    
    // WebSocket - não interceptar
    if (event.request.url.startsWith('wss://')) {
        return;
    }
    
    // Assets estáticos - Cache First
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) {
                    // Atualiza cache em background
                    fetch(event.request)
                        .then(networkResponse => {
                            if (networkResponse.ok) {
                                caches.open(CACHE_NAME)
                                    .then(cache => cache.put(event.request, networkResponse));
                            }
                        })
                        .catch(() => {});
                    return response;
                }
                
                return fetch(event.request)
                    .then(networkResponse => {
                        if (networkResponse.ok && event.request.method === 'GET') {
                            const responseClone = networkResponse.clone();
                            caches.open(CACHE_NAME)
                                .then(cache => cache.put(event.request, responseClone));
                        }
                        return networkResponse;
                    });
            })
    );
});

// Sincronização em background (quando voltar online)
self.addEventListener('sync', event => {
    console.log('[SW] Sync event:', event.tag);
});

// Push notifications (preparado para futuro)
self.addEventListener('push', event => {
    if (event.data) {
        const data = event.data.json();
        self.registration.showNotification(data.title, {
            body: data.body,
            icon: './icon-192.png',
            badge: './icon-192.png',
            vibrate: [200, 100, 200]
        });
    }
});

console.log('[SW] Service Worker carregado');
