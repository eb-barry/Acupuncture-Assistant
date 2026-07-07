/**
 * sw.js — Service Worker for 針灸助理
 * Strategy:
 *   App Shell (HTML/CSS/JS) → Cache-First
 *   Data files & assets     → Network-First with cache fallback
 */

const SHELL_CACHE   = 'acupuncture-shell-v4';
const CONTENT_CACHE = 'acupuncture-content-v1';

const SHELL_FILES = [
  './',
  './index.html',
  './css/style.css',
  './js/settings.js',
  './js/consent.js',
  './js/cache.js',
  './js/ganzhi.js',
  './js/ui.js',
  './js/lingui.js',
  './js/meridian.js',
  './js/rhymes.js',
  './manifest.json',
  'https://cdn.jsdelivr.net/npm/lunar-javascript/lunar.js',
  'https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@400;500;600;700&family=Noto+Sans+TC:wght@300;400;500&display=swap',
];

// Install: pre-cache app shell
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys
        .filter(k => k !== SHELL_CACHE && k !== CONTENT_CACHE)
        .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch strategy
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // App shell → cache first
  if (SHELL_FILES.includes(e.request.url) || SHELL_FILES.includes(url.pathname)) {
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request))
    );
    return;
  }

  // GitHub raw assets & data → network first, cache on success
  if (url.hostname === 'raw.githubusercontent.com') {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CONTENT_CACHE).then(c => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Default: network with cache fallback
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
