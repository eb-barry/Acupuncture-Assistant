/**
 * sw.js — Service Worker for 針灸助理
 * Strategy:
 *   App Shell (HTML/CSS/JS) → Cache-First
 *   GLB + JSON → Cache-First after the page fetches the selected gender
 *   Narration MP3 → Network, then AUDIO_CACHE fallback when offline
 *   Other assets → Network with cache fallback
 */

const SHELL_CACHE   = 'acupuncture-shell-v106';
const SHELL_REV     = 'v106';
const ASSET_CACHE   = 'acupuncture-assets-v5';
const CONTENT_CACHE = 'acupuncture-content-v2';
const AUDIO_CACHE   = 'acupuncture-audio-v1';
const POINT_IMAGE_CACHE = 'acupuncture-point-images-v1';

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
  './js/meridian3d.js',
  './assets/main-menu.webp',
  './assets/icons/play-3d.png',
  './assets/icons/stop-3d.png',
  './assets/icons/menu-3d.png',
  './manifest.json',
  'https://cdn.jsdelivr.net/npm/lunar-javascript/lunar.js',
  'https://cdn.jsdelivr.net/npm/three@0.185.1/build/three.module.js',
  'https://cdn.jsdelivr.net/npm/three@0.185.1/examples/jsm/controls/OrbitControls.js',
  'https://cdn.jsdelivr.net/npm/three@0.185.1/examples/jsm/loaders/GLTFLoader.js',
  'https://cdn.jsdelivr.net/npm/three@0.185.1/examples/jsm/libs/meshopt_decoder.module.js',
  'https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@400;500;600;700&family=Noto+Sans+TC:wght@300;400;500&display=swap',
];

const ASSET_FILES = [
  './assets/points-data.json',
  './assets/acupuncture-data.json',
  './assets/rhymes-data.json',
];

const LIVE_CACHES = [SHELL_CACHE, ASSET_CACHE, CONTENT_CACHE, AUDIO_CACHE, POINT_IMAGE_CACHE];
let replaceOpenClients = false;

function toRequest(file) {
  return new Request(new URL(file, self.registration.scope).href, { cache: 'reload' });
}

async function precache(cacheName, files) {
  const cache = await caches.open(cacheName);
  await Promise.all(files.map(async (file) => {
    try {
      const request = toRequest(file);
      const res = await fetch(request);
      if (res.ok) await cache.put(request, res);
    } catch (err) {
      console.warn('precache failed', file, err);
    }
  }));
}

function isVersionedAsset(url) {
  return /\.(glb|gltf|json)$/i.test(url.pathname);
}

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    replaceOpenClients = !!self.registration.active;
    await precache(SHELL_CACHE, SHELL_FILES);
    await precache(ASSET_CACHE, ASSET_FILES);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => !LIVE_CACHES.includes(k))
        .map((k) => caches.delete(k)),
    );
    const windows = replaceOpenClients
      ? await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      : [];
    await self.clients.claim();
    if (!windows.length) return;
    setTimeout(() => {
      windows.forEach((client) => {
        if (!client.url || !client.url.startsWith(self.registration.scope)) return;
        let next;
        try { next = new URL(client.url); }
        catch { return; }
        if (next.searchParams.get('sw') === SHELL_REV) return;
        next.searchParams.set('sw', SHELL_REV);
        client.navigate(next.href).catch(() => {});
      });
    }, 50);
  })());
});

function isShellRequest(url) {
  return SHELL_FILES.some((file) => {
    if (file.startsWith('http')) {
      return url.href === file || url.href.startsWith(file.split('?')[0]);
    }
    const abs = new URL(file, self.registration.scope);
    return url.origin === abs.origin && url.pathname === abs.pathname;
  });
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  if (isShellRequest(url)) {
    e.respondWith(
      caches.match(e.request, { ignoreSearch: true }).then((cached) => {
        if (cached) return cached;
        return fetch(e.request).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(e.request, clone));
          }
          return res;
        }).catch(() => cached);
      }),
    );
    return;
  }

  if (/\.mp3$/i.test(url.pathname) && url.pathname.includes('/assets/audio/')) {
    e.respondWith(
      fetch(e.request).then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(AUDIO_CACHE).then((cache) => cache.put(e.request, clone));
        }
        return res;
      }).catch(() => caches.match(e.request)),
    );
    return;
  }

  if (/\/assets\/points\/.+\.webp$/i.test(url.pathname)) {
    e.respondWith((async () => {
      const cache = await caches.open(POINT_IMAGE_CACHE);
      const cached = await cache.match(e.request, { ignoreSearch: true });
      if (cached) return cached;
      const res = await fetch(e.request);
      if (res.ok) await cache.put(e.request, res.clone());
      return res;
    })());
    return;
  }

  if (isVersionedAsset(url)) {
    e.respondWith((async () => {
      const cached = await caches.match(e.request, { ignoreSearch: true });
      if (cached) return cached;
      const res = await fetch(e.request);
      if (res.ok) {
        const clone = res.clone();
        const cache = await caches.open(ASSET_CACHE);
        await cache.put(e.request, clone);
      }
      return res;
    })());
    return;
  }

  if (url.hostname === 'raw.githubusercontent.com') {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CONTENT_CACHE).then((c) => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(e.request)),
    );
    return;
  }

  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request)),
  );
});
