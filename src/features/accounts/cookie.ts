/**
 * The app's login cookie as `Set-Cookie` lines (session.ts sends them) –
 * and how long a login lasts. No imports: the unit tests read this too.
 *
 * With “stay logged in” (the login form's box, ticked to begin with) a
 * login lasts 30 days on a device. Without it the cookie has no date: the
 * browser drops it when it closes – and the token ends after a day, should
 * the browser never close.
 */

export const SESSION_COOKIE = "boop-session";

/**
 * Set beside a login for one browser session, and gone with it: a cookie
 * the page can see (the login cookie it can't). It holds nothing – by it
 * the app tells, also offline, whether that session is still on
 * (client.ts, `sessionOver`).
 */
export const SESSION_ONLY_COOKIE = "boop-session-only";

/** “Stay logged in” – the collection's `tokenExpiration`. */
export const REMEMBER_SECONDS = 60 * 60 * 24 * 30;

/** A login for one browser session: its token's life at most. */
export const SESSION_ONLY_SECONDS = 60 * 60 * 24;

/**
 * Is a login for one browser session over? Yes once its sign is gone (the
 * browser was closed) – or its token has run out, in a browser that brings
 * its cookies back when it opens again.
 */
export const sessionOnlyOver = ({
  since,
  sign,
  now = Date.now(),
}: {
  /** When it was made, on this device (ms). */
  since: number;
  /** Is `SESSION_ONLY_COOKIE` still there? */
  sign: boolean;
  now?: number;
}) => !sign || now - since >= SESSION_ONLY_SECONDS * 1000;

/**
 * One cookie – without `expires` it lives as long as the browser is open.
 * Out of the page's reach unless `visible`.
 */
const cookie = (
  name: string,
  value: string,
  { expires, visible = false }: { expires?: Date; visible?: boolean } = {}
) =>
  [
    `${name}=${value}`,
    "Path=/",
    ...(visible ? [] : ["HttpOnly"]),
    "SameSite=Lax",
    ...(expires ? [`Expires=${expires.toUTCString()}`] : []),
    ...(process.env.NODE_ENV === "production" ? ["Secure"] : []),
  ].join("; ");

/** Takes a cookie away. */
export const expired = (name: string) =>
  cookie(name, "", { expires: new Date(0) });

/**
 * The cookies of a login: until `expires` – or, for one without “stay
 * logged in” (null), until the browser closes, with the cookie that says
 * so to the page.
 */
export const loginCookies = (token: string, expires: Date | null) =>
  expires
    ? [cookie(SESSION_COOKIE, token, { expires }), expired(SESSION_ONLY_COOKIE)]
    : [
        cookie(SESSION_COOKIE, token),
        cookie(SESSION_ONLY_COOKIE, "1", { visible: true }),
      ];

/** The cookies of a logout: both gone. */
export const logoutCookies = () => [
  expired(SESSION_COOKIE),
  expired(SESSION_ONLY_COOKIE),
];
