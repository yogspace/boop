/*
 * Boop's notifications in the service worker – loaded by sw.js with
 * `importScripts("/sw-push.js")`. The server (src/features/push) sends
 * { title, body, url, tag } and nothing else; it is shown as it comes.
 *
 * - push: the notification. Every push shows one – Safari takes a browser's
 *   permission back after pushes that show nothing.
 * - notificationclick: to the calendar (a gift: the shelf) – in an open
 *   window of the app if there is one, else in a new one. One that names no calendar (an
 *   invitation) only asks for the app: open, it stays where it is.
 * - pushsubscriptionchange: the browser renewed the subscription – the
 *   server learns the new address (it keeps zone, language, account).
 */

const PUSH_ICON = "/icons/icon-192.png";

/** The app's addresses – /de/app, /en/app/family/today. */
const PUSH_APP = /^\/(de|en)\/app(\/|$)/;
/** The app itself, no calendar named. */
const PUSH_APP_ALONE = /^\/(de|en)\/app\/?$/;

/** Only an address of our own – a path, never another site. */
const pushPath = (url) =>
  typeof url === "string" && url.startsWith("/") && !url.startsWith("//")
    ? url
    : "/";

self.addEventListener("push", (event) => {
  let message = {};
  try {
    message = event.data ? event.data.json() : {};
  } catch {
    message = {};
  }
  const title =
    typeof message.title === "string" && message.title ? message.title : "Boop";
  const tag = typeof message.tag === "string" && message.tag ? message.tag : "";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof message.body === "string" ? message.body : "",
      icon: PUSH_ICON,
      // A newer one of the same kind takes the older one's place – and
      // still rings.
      ...(tag ? { tag, renotify: true } : {}),
      data: { url: pushPath(message.url) },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(
    pushPath(event.notification.data?.url),
    self.location.origin
  ).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // The app's window first, else any of ours.
      const open =
        windows.find((client) => PUSH_APP.test(new URL(client.url).pathname)) ??
        windows[0];
      if (!open) {
        await self.clients.openWindow(url);
        return;
      }
      const focused = (await open.focus().catch(() => null)) ?? open;
      if (focused.url === url) return;
      // Only the app is asked for, and here it is – on whatever calendar,
      // in whichever language: no need to load it anew.
      if (
        PUSH_APP_ALONE.test(new URL(url).pathname) &&
        PUSH_APP.test(new URL(focused.url).pathname)
      ) {
        return;
      }
      try {
        await focused.navigate(url);
      } catch {
        // Not ours to steer (a window from before this worker) – a new one.
        await self.clients.openWindow(url);
      }
    })()
  );
});

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const before = event.oldSubscription;
      const key = before?.options?.applicationServerKey;
      const after =
        event.newSubscription ??
        (key
          ? await self.registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: key,
            })
          : null);
      if (!after) return;
      await fetch("/api/push/subscribe", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription: after.toJSON(),
          previous: before?.endpoint,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
    })().catch(() => {})
  );
});
