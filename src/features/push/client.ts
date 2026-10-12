import type { Locale } from "@/i18n/config";
import type { PushState } from "./endpoints";
import type { Switches } from "./rules";

/**
 * Notifications, on the device: can it, did it say yes, and the account's
 * settings (endpoints.ts). The browser's subscription is made by the
 * service worker's registration and handed to the server; the worker shows
 * what comes (public/sw-push.js).
 *
 * Nothing here asks by itself – only `turnOn`, from a tap, asks for the
 * permission (Safari asks from a gesture only, and nobody likes being asked
 * on arrival).
 */

/** Where this device stands. */
export type Device =
  /** No push here: an old browser – or no service worker (development). */
  | "unsupported"
  /** An iPhone or iPad in the browser: only an app on the Home Screen may. */
  | "install"
  /** Said no – only the browser's settings change that now. */
  | "denied"
  | "off"
  | "on";

/** An iPhone or iPad – Safari on a Mac pushes from the browser, these don't. */
const isIos = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  // iPads say they're Macs – but Macs have no touch screen.
  (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1);

const installed = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as { standalone?: boolean }).standalone === true;

const supported = () =>
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;

/** The worker the pushes go to – none in development (pwa/service-worker.tsx). */
const worker = () =>
  navigator.serviceWorker.getRegistration().catch(() => undefined);

const subscriptionOf = async () =>
  (await (await worker())?.pushManager.getSubscription().catch(() => null)) ??
  null;

export const deviceState = async (): Promise<Device> => {
  if (typeof window === "undefined") return "unsupported";
  if (isIos() && !installed()) return "install";
  if (!(supported() && (await worker()))) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  return Notification.permission === "granted" && (await subscriptionOf())
    ? "on"
    : "off";
};

// ── The account's settings ──────────────────────────────────────────────────

/** The last answer – shown (not changed) when the connection goes. */
let known: PushState | null = null;

export const knownPush = () => known;

const api = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`/api/push${path}`, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!response.ok) throw new Error(`push ${response.status}`);
  return (await response.json()) as T;
};

export const loadPush = async () => {
  known = await api<PushState>("");
  return known;
};

export const savePush = async (
  patch: { reminderAt: string } | ({ calendar: string } & Partial<Switches>)
) => {
  known = await api<PushState>("/settings", {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return known;
};

// ── This device ─────────────────────────────────────────────────────────────

/** A VAPID key as the browser takes it – from base64url. */
const keyBytes = (key: string) => {
  const base64 = key.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
};

const sameKey = (subscription: PushSubscription, key: Uint8Array) => {
  const own = subscription.options?.applicationServerKey;
  if (!own) return false;
  const bytes = new Uint8Array(own);
  return bytes.length === key.length && bytes.every((b, i) => b === key[i]);
};

/** Tells the server about this device – its zone and language with it. */
const tell = (subscription: PushSubscription, locale: Locale) =>
  api("/subscribe", {
    method: "POST",
    body: JSON.stringify({
      subscription: subscription.toJSON(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      locale,
    }),
  });

/**
 * Turns them on for this device – call it straight from a tap: the
 * permission is asked first thing, while the tap still counts.
 */
export const turnOn = async (
  publicKey: string,
  locale: Locale
): Promise<Device> => {
  const permission = await Notification.requestPermission();
  if (permission === "denied") return "denied";
  if (permission !== "granted") return "off";
  if (!(await worker())) return "unsupported";
  const registration = await navigator.serviceWorker.ready;
  const key = keyBytes(publicKey);
  let subscription = await registration.pushManager.getSubscription();
  // Made with a key the server no longer has – of no use.
  if (subscription && !sameKey(subscription, key)) {
    await subscription.unsubscribe().catch(() => false);
    subscription = null;
  }
  subscription ??= await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: key,
  });
  await tell(subscription, locale);
  return "on";
};

/** Turns them off for this device – the server first, then the browser. */
export const turnOff = async (): Promise<Device> => {
  const subscription = await subscriptionOf();
  if (!subscription) return "off";
  await api("/unsubscribe", {
    method: "POST",
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  });
  await subscription.unsubscribe().catch(() => false);
  return "off";
};

/** For which account this page load said it already – none yet. */
let refreshed: string | null = null;

/**
 * Says once per page load and account that this device still wants them:
 * it ties the device to the login it's in now (a new login, another account
 * – also one logged into in the same tab), its zone (travelling) and the
 * app's language. Quiet – nothing asked, nothing shown. Off when the
 * server's key changed since: the device is off then.
 */
export const refreshPush = async (
  locale: Locale,
  publicKey: string,
  account: string
): Promise<Device | null> => {
  if (
    refreshed === account ||
    !supported() ||
    Notification.permission !== "granted"
  ) {
    return null;
  }
  const subscription = await subscriptionOf();
  if (!subscription) return null;
  refreshed = account;
  if (!sameKey(subscription, keyBytes(publicKey))) {
    await subscription.unsubscribe().catch(() => false);
    return "off";
  }
  await tell(subscription, locale).catch(() => {
    refreshed = null;
  });
  return null;
};
