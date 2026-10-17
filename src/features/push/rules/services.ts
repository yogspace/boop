/**
 * A device's subscription: its push service's address and its keys,
 * checked before it is kept – and the service's name for the export.
 */

/**
 * The browsers' push services – the server only ever posts there. Any other
 * address a device names is refused: the server would post to it.
 */
const PUSH_HOSTS = [
  "fcm.googleapis.com", // Chrome, Edge on Android, Opera, Samsung
  "android.googleapis.com",
  "push.services.mozilla.com", // Firefox (updates.push.services.mozilla.com)
  "push.apple.com", // Safari (web.push.apple.com)
  "notify.windows.com", // Edge (wns2-….notify.windows.com)
];

/** A push service's address, from a browser that's one of them. */
export const isPushEndpoint = (value: unknown): value is string => {
  if (typeof value !== "string" || value.length > 1024) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      (url.port === "" || url.port === "443") &&
      PUSH_HOSTS.some(
        (host) => url.hostname === host || url.hostname.endsWith(`.${host}`)
      )
    );
  } catch {
    return false;
  }
};

/** The push service's name – what the export shows instead of the address. */
export const pushServiceOf = (endpoint: unknown) => {
  try {
    return new URL(String(endpoint)).hostname;
  } catch {
    return "";
  }
};

/** A subscription's key as browsers write it: base64url, short. */
export const isPushKey = (value: unknown, max: number): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= max &&
  /^[A-Za-z0-9_-]+=*$/.test(value);
