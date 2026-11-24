/* ARISE // offline app shell. Works from a GitHub Pages subfolder. */
"use strict";

const CACHE = "arise-hunter-v13";
const SCOPE = self.registration.scope;
const abs = (path) => new URL(path, SCOPE).href;

const PRECACHE = [
  "./",
  "./index.html",
  "./styles.css?v=13",
  "./manifest.webmanifest",
  "./firebase-config.js?v=13",
  "./assets/fonts.css",
  "./assets/fonts/Orbitron-500.woff2",
  "./assets/fonts/Rajdhani-400.woff2",
  "./assets/fonts/Rajdhani-500.woff2",
  "./assets/fonts/Rajdhani-600.woff2",
  "./assets/fonts/Rajdhani-700.woff2",
  "./assets/fonts/ShareTechMono-400.woff2",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/apple-touch-icon.png",
  "./assets/icons/favicon-32.png",
  "./js/data.js?v=13",
  "./js/ui.js?v=13",
  "./js/training.js?v=13",
  "./js/body.js?v=13",
  "./js/cloud.js?v=13",
  "./js/health.js?v=13",
  "./js/app.js?v=13",
  "https://www.gstatic.com/firebasejs/11.6.0/firebase-app-compat.js",
  "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth-compat.js",
  "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore-compat.js"
].map(abs);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (url.origin === "https://www.gstatic.com" && url.pathname.indexOf("/firebasejs/") === 0) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((response) => {
            if (response && response.ok) {
              const copy = response.clone();
              event.waitUntil(caches.open(CACHE).then((cache) => cache.put(request, copy)));
            }
            return response;
          })
          .catch(() => cached || Response.error());
        if (cached) {
          event.waitUntil(network);
          return cached;
        }
        return network;
      })
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  const indexUrl = abs("./index.html");

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            event.waitUntil(caches.open(CACHE).then((cache) => cache.put(indexUrl, copy)));
          }
          return response;
        })
        .catch(() => caches.match(indexUrl).then((cached) => cached || Response.error()))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            event.waitUntil(caches.open(CACHE).then((cache) => cache.put(request, copy)));
          }
          return response;
        })
        .catch(() => cached || Response.error());

      if (cached) {
        event.waitUntil(network);
        return cached;
      }
      return network;
    })
  );
});
