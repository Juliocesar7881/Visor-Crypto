// Service Worker para Visor Crypto PWA
const CACHE_NAME = 'visor-crypto-v4';

// Recursos estáticos para cache (somente assets locais)
const STATIC_ASSETS = [
    './index.html',
    './manifest.json',
    './css/styles.css'
];

// Instalação do Service Worker
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(STATIC_ASSETS))
            .then(() => self.skipWaiting())
    );
});

// Ativação - limpa TODOS os caches antigos
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames
                    .filter(name => name !== CACHE_NAME)
                    .map(name => caches.delete(name))
            );
        }).then(() => self.clients.claim())
    );
});

// Estratégia de fetch: Network First para tudo, Cache First somente para assets estáticos locais
self.addEventListener('fetch', event => {
    // Não interceptar WebSockets
    if (event.request.url.startsWith('wss://')) return;
    
    // Não interceptar URLs reescritas pelo CapacitorHttp (/_capacitor_http_interceptor_)
    if (event.request.url.includes('_capacitor_http_interceptor_')) return;
    
    // Não interceptar requests que NÃO são GET
    if (event.request.method !== 'GET') return;
    
    const url = new URL(event.request.url);
    
    // APIs externas e dados dinâmicos - SEMPRE rede, NUNCA cache
    if (url.hostname !== 'localhost' && !url.hostname.startsWith('192.168')) {
        event.respondWith(
            fetch(event.request).catch(() => {
                return new Response(JSON.stringify({ error: 'Offline' }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            })
        );
        return;
    }
    
    // Assets locais - Network First com fallback para cache
    event.respondWith(
        fetch(event.request)
            .then(networkResponse => {
                if (networkResponse.ok) {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
                }
                return networkResponse;
            })
            .catch(() => caches.match(event.request))
    );
});

// Sincronização em background (quando voltar online)
self.addEventListener('sync', event => {
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
