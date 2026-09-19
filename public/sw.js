/* SmartCanteen offline worker: keep the installed cash book usable without data. */
const VERSION = "smartcanteen-offline-v3";
const APP_CACHE = `${VERSION}-app`;
const ASSET_CACHE = `${VERSION}-assets`;
const CORE = [
  "/",
  "/manifest.webmanifest",
  "/favicon.png",
  "/app-icon-192.png",
  "/app-icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_CACHE).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

const isServerCall = (url) =>
  url.pathname.startsWith("/api/") ||
  url.pathname.startsWith("/_serverFn/") ||
  url.pathname.startsWith("/~oauth/");

async function networkPage(request) {
  const cache = await caches.open(APP_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
      // The root response is the universal app shell used for unseen routes.
      if (new URL(request.url).pathname === "/") await cache.put("/", response.clone());
    }
    return response;
  } catch {
    return (
      (await cache.match(request)) ||
      (await cache.match("/")) ||
      new Response("SmartCanteen is not ready offline yet. Connect once, open the app, then try again.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      })
    );
  }
}

async function cachedAsset(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok || response.type === "opaque") await cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin === self.location.origin && isServerCall(url)) return;

  if (request.mode === "navigate") {
    event.respondWith(networkPage(request));
    return;
  }

  const localAsset =
    url.origin === self.location.origin &&
    ["script", "style", "font", "image"].includes(request.destination);
  const fontAsset =
    (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") &&
    ["style", "font"].includes(request.destination);
  if (localAsset || fontAsset) event.respondWith(cachedAsset(request));
});
