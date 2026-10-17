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
 * - Next's files (/_next/static, named by their content): cached for good –
 *   those the app's pages load and those they load later (the editor, the
 *   sheets, the 3D stamps: chunks of their own, named in the ones before),
 *   when installing and behind each new script: all of the app opens
 *   offline, not only its start – after an update of the app too.
 * - Icons, fonts, the manifest: from the cache, refreshed behind – those
 *   the app's pages name kept since installing too.
 * - Never cached: /api, /admin, /next – data, the CMS, statistics.
 *
 * Bump VERSION when this file's logic changes; old caches go on activation.
 */
const VERSION = "boop-v3";
const PAGES = `${VERSION}-pages`;
const FILES = `${VERSION}-files`;
const SHELLS = ["/de/app", "/en/app"];
/** A file of this site a page names – a font, the manifest, an icon. */
const OWN_FILE =
  /(?:href|src)="(\/(?!_next\/)[^"?#]+\.(?:woff2?|webmanifest|svg|png|ico))"/g;
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
          await keep(files, assets);
          // And what the page names besides – the font, the manifest, the
          // icons: without them the first offline start has no letters.
          const named = [...html.matchAll(OWN_FILE)].map(([, path]) => path);
          await Promise.all(
            named.map((path) => files.add(path).catch(() => undefined))
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
    event.respondWith(cacheFirst(request, event));
  } else if (
    /\.(?:svg|png|ico|webmanifest|woff2?)$/.test(url.pathname) ||
    url.pathname.startsWith("/_next/image")
  ) {
    event.respondWith(refreshBehind(request));
  }
});

/**
 * A chunk's own chunks – loaded once something is wanted – as Turbopack
 * names them in it: "static/chunks/…", without /_next/ before.
 */
const CHUNK = /["'](?:\/_next\/)?(static\/chunks\/[^"'\s\\]+\.(?:js|css))["']/g;

/** Next's files followed while this worker runs – each once. */
const walked = new Set();

/**
 * Keeps Next's files – and, for a script, the chunks it may load later in
 * turn, and theirs. One that can't be fetched is left out: it comes from
 * the network when wanted.
 */
const keep = async (files, assets) => {
  const fresh = [...assets].filter((asset) => !walked.has(asset));
  for (const asset of fresh) walked.add(asset);
  await Promise.all(
    fresh.map(async (asset) => {
      try {
        let response = await files.match(asset);
        if (!response) {
          response = await fetch(asset);
          if (!response.ok) throw new Error(String(response.status));
          await files.put(asset, response.clone());
        }
        if (!asset.endsWith(".js")) return;
        const named = [...(await response.text()).matchAll(CHUNK)];
        await keep(files, new Set(named.map(([, path]) => `/_next/${path}`)));
      } catch {
        // Offline meanwhile – it comes from the network when wanted.
        walked.delete(asset);
      }
    })
  );
};

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

const cacheFirst = async (request, event) => {
  const cache = await caches.open(FILES);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
    // A script not kept yet – the app anew, after an update: the chunks it
    // may load later come too, behind, so they are there offline.
    const { pathname } = new URL(request.url);
    if (pathname.endsWith(".js")) event.waitUntil(keep(cache, [pathname]));
  }
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
    .catch(
      () =>
        hit ?? new Response("Offline", { status: 503, statusText: "Offline" })
    );
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
