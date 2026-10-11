import type { ActionName } from "./actions";

/**
 * Anonymous statistics from the browser: a page view per page
 * (page-view-tracker.tsx) and the actions that matter (stamps, calendars,
 * exports …). Only the page and the referrer are sent – the server boils them
 * down to coarse groups (see collections/page-views.ts). Never a stamp, a
 * name or anything written in a calendar.
 *
 * sendBeacon survives leaving the page; fetch with keepalive is the fallback.
 * Offline (the installed app without a connection) nothing is sent and
 * nothing is queued for later: a view that cannot be counted now is simply
 * not counted. Statistics must never break the page.
 */

/**
 * Where an own device keeps the own-devices token (exclude.ts). Only the
 * admin writes it, and only on the owner's devices – visitors never carry
 * anything.
 */
const EXCLUDE_KEY = "boop-analytics-exclude";

/** The own-devices token on this device, if the admin put one here. */
export const deviceExcludeToken = (): string | null => {
  try {
    return localStorage.getItem(EXCLUDE_KEY) || null;
  } catch {
    // No storage (private window, blocked) – then the device counts.
    return null;
  }
};

/** Puts the token on this device – or, with null, takes it away. */
export const setDeviceExcludeToken = (token: string | null): void => {
  try {
    if (token) localStorage.setItem(EXCLUDE_KEY, token);
    else localStorage.removeItem(EXCLUDE_KEY);
  } catch {
    // Nothing to do – the admin shows the state the server reports.
  }
};

const send = (url: string, body: Record<string, unknown>) => {
  try {
    if (navigator.onLine === false) return;
    const token = deviceExcludeToken();
    const data = new Blob(
      [JSON.stringify(token ? { ...body, exclude: token } : body)],
      { type: "application/json" }
    );
    if (navigator.sendBeacon?.(url, data)) return;
    fetch(url, { method: "POST", body: data, keepalive: true }).catch(
      () => undefined
    );
  } catch {
    // Nothing to do – the page goes on.
  }
};

/**
 * A page view. `ref` is where the visitor came from – the real referrer on
 * the first page, the site itself after navigating within it.
 */
export const trackView = (
  path: string = window.location.pathname,
  ref: string = document.referrer
) => send("/next/track", { path, ref });

/** An action – the name must be one of actions.ts, others are ignored. */
export const trackEvent = (name: ActionName) =>
  send("/next/action", { name, path: window.location.pathname });
