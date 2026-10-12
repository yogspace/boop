/*
 * Boop's service worker – keeps the app's pages and files, so Boop opens
 * without a connection. The data itself lives in IndexedDB on the device
 * (src/features/offline); this only keeps what the browser loads.
 *
 * - Pages: from the network, the last copy when offline (the app's page is
 *   the same for everyone, so its copy fits every account).
 * - The app's addresses (/de/app/familie/heute …) are all one page, the
 *   app's of that language (/de/app) – the server gives it for each of them
 *   (src/proxy.ts), and so does this: one copy per language, kept since
 *   installing, so even an address never opened before opens offline.
 * - Next's files (/_next/static, named by their content): cached for good.
 * - Icons, fonts, the manifest: from the cache, refreshed behind.
 * - Never cached: /api, /admin, /next – data, the CMS, statistics.
 *
 * Bump VERSION when this file's logic changes; old caches go on activation.
 */
const VERSION = "boop-v2";
const PAGES = `${VERSION}-pages`;
const FILES = `${VERSION}-files`;
const SHELLS = ["/de/app", "/en/app"];
/** A slow network counts as none after this long – the copy shows. */
const NETWORK_TIMEOUT_MS = 4000;

// Push notifications: shown, tapped, renewed (features/push).
importScripts("/sw-push.js");

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const pages = await caches.open(PAGES);
      const files = await caches.open(FILES);
      // The app's pages and the files they load, so the first offline start
      // works – not only the second.
      for (const url of SHELLS) {
        try {
          const response = await fetch(url, { credentials: "same-origin" });
          if (!response.ok) continue;
          await pages.put(url, response.clone());
          const html = await response.text();
          const assets = new Set(html.match(/\/_next\/static\/[^"'\s)\\]+/g));
          await Promise.all(
            [...assets].map((asset) => files.add(asset).catch(() => {}))
          );
        } catch {
          // Offline while installing – the next visit fills the cache.
        }
      }
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (!key.startsWith(VERSION)) await caches.delete(key);
      }
      await trim(FILES, 300);
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (/^\/(api|admin|next)(\/|$)/.test(url.pathname)) return;

  if (request.mode === "navigate") {
    event.respondWith(page(request, url));
  } else if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
  } else if (
    /\.(?:svg|png|ico|webmanifest|woff2?)$/.test(url.pathname) ||
    url.pathname.startsWith("/_next/image")
  ) {
    event.respondWith(refreshBehind(request));
  }
});

/** Where a page's copy is kept – for the app's addresses, the app's page. */
const keyOf = (pathname) => {
  const app = pathname.match(/^\/(de|en)\/app(?:\/|$)/);
  return app ? `/${app[1]}/app` : pathname;
};

/** A page: the network's answer – or, offline or slow, the last copy. */
const page = async (request, url) => {
  const cache = await caches.open(PAGES);
  const key = keyOf(url.pathname);
  try {
    const response = await withTimeout(fetch(request));
    if (response.ok && !response.redirected) {
      await cache.put(key, response.clone());
    }
    return response;
  } catch {
    const copy = await cache.match(key);
    if (copy) return copy;
    // Never visited: the app's page of that language is the best offer.
    const locale = url.pathname.startsWith("/en") ? "en" : "de";
    return (
      (await cache.match(`/${locale}/app`)) ??
      new Response("Offline", { status: 503, statusText: "Offline" })
    );
  }
};

const cacheFirst = async (request) => {
  const cache = await caches.open(FILES);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
};

const refreshBehind = async (request) => {
  const cache = await caches.open(FILES);
  const hit = await cache.match(request);
  const fresh = fetch(request)
    .then(async (response) => {
      if (response.ok) await cache.put(request, response.clone());
      return response;
    })
    .catch(() => hit);
  return hit ?? fresh;
};

const withTimeout = (promise) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("timeout")),
      NETWORK_TIMEOUT_MS
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });

/** Keeps a cache to its newest entries – old file versions pile up. */
const trim = async (name, max) => {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - max))) {
    await cache.delete(key);
  }
};
