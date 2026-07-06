// Service Worker — גרסה חדשה נטענת מיד, המטמון משמש רק במצב לא מקוון
// APP_VERSION מוגדר גם ב-data.js — לעדכן את שניהם יחד בכל שינוי!
const VERSION = "1.3.2";
const CACHE_NAME = `fishing-israel-${VERSION}`;
const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./data.js",
  "./config.js",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", event => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);

  // בקשות חיצוניות (מזג אוויר, Supabase, AI) — ישירות לרשת
  if (url.origin !== self.location.origin) return;
  if (event.request.method !== "GET") return;

  // קבצי האפליקציה — רשת קודם (תמיד טרי), מטמון רק כשאין אינטרנט
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() =>
        caches.match(event.request).then(cached =>
          cached || (event.request.mode === "navigate" ? caches.match("./index.html") : undefined)
        )
      )
  );
});
