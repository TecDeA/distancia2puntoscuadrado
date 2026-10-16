// ============================================================
//  Service Worker — Geometría Estocástica (DosPuntos)
//  La versión de la app vive aquí (APP_VERSION) y se comunica
//  a la interfaz mediante mensajes { type: 'GET_VERSION' }.
// ============================================================

const APP_VERSION = '1.4';
const CACHE_NAME = `dospuntos-cache-v${APP_VERSION}`;

// CDNs permitidos para caché en tiempo de ejecución (incluye MathJax)
const CDN_ORIGINS = [
    'cdn.tailwindcss.com',
    'fonts.googleapis.com',
    'fonts.gstatic.com',
    'cdnjs.cloudflare.com',
    'cdn.jsdelivr.net'
];

// Precarga esencial (rutas relativas al propio SW)
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    'https://cdn.tailwindcss.com',
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js'
];

// Precachear assets uno a uno: si uno falla, el resto sí se guarda
async function precacheAsset(cache, asset) {
    try {
        const isExternal = new URL(asset, self.location.href).origin !== self.location.origin;
        const request = new Request(asset, isExternal ? { mode: 'no-cors', cache: 'reload' } : { cache: 'reload' });
        const response = await fetch(request);
        // 'opaque' (status 0) es válido para CDNs externos; en mismo origen exigimos 2xx
        if (response.type === 'opaque' || response.ok) {
            await cache.put(new Request(asset), response);
        } else {
            console.warn('[SW] Respuesta no cacheable:', asset, response.status);
        }
    } catch (err) {
        console.warn('[SW] No se pudo precachear:', asset, err);
    }
}

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) =>
            Promise.allSettled(ASSETS_TO_CACHE.map((asset) => precacheAsset(cache, asset)))
        )
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME && cacheName.startsWith('dospuntos-cache-')) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Estrategia: cache-first + caché en tiempo de ejecución para los CDNs
// (necesario para que MathJax, sus fuentes y los iconos funcionen offline)
self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;

    event.respondWith(
        caches.match(request).then((cached) => {
            if (cached) return cached;

            return fetch(request).then((response) => {
                try {
                    const url = new URL(request.url);
                    const isCacheable =
                        url.origin === self.location.origin ||
                        CDN_ORIGINS.includes(url.hostname);

                    if (isCacheable && (response.ok || response.type === 'opaque')) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME)
                            .then((cache) => cache.put(request, clone))
                            .catch(() => {});
                    }
                } catch (e) { /* respuesta no cacheable */ }
                return response;
            }).catch(() => null);
        }).then((response) => {
            if (response) return response;
            // Sin red y sin caché: servir la shell precacheada en navegaciones
            if (request.mode === 'navigate') {
                return caches.match('./').then((shell) => shell || Response.error());
            }
            return Response.error();
        })
    );
});

// Consulta de versión desde la página (chip dinámico)
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'GET_VERSION') {
        if (event.ports && event.ports[0]) {
            event.ports[0].postMessage({ version: APP_VERSION });
        }
    }
});
