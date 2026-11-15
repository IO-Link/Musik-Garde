// Service Worker - Musik Garde PWA
const CACHE_NAME = 'musik-garde-v2.0.1';
const urlsToCache = [
    './',
    './index.html',
    './styles.css',
    './app.js',
    './manifest.json',
    './logo.png',
    './jszip.min.js'
];

// Install event - cache all assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Cache opened');
                // Try to cache files, but don't fail if some are missing
                return Promise.allSettled(
                    urlsToCache.map(url => cache.add(url))
                );
            })
            .then(() => self.skipWaiting())
            .catch(err => {
                console.log('Cache error during install:', err);
                return self.skipWaiting();
            })
    );
});


// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Message event - handle skip waiting
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
    // Skip non-GET requests
    if (event.request.method !== 'GET') {
        return;
    }

    // Network-first: always try fresh files, fall back to cache when offline
    event.respondWith(
        fetch(event.request, { cache: 'no-cache' })
            .then((response) => {
                if (response && response.status === 200 &&
                    (response.type === 'basic' || response.type === 'cors')) {
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return response;
            })
            .catch(() => caches.match(event.request))
    );
});
