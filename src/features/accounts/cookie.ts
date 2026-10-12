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

/**
 * Beside every login, with its life: a cookie the page can see, holding
 * nothing but “someone is logged in here”. The public pages are the same
 * for everyone (built ahead, kept offline) – by it they show the way into
 * the app instead of the ways to log in, before the first paint
 * ([locale]/layout.tsx). Only a hint: whoever follows it and isn't logged
 * in after all lands at the login, as before.
 */
export const SIGNED_IN_COOKIE = "boop-in";

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
    ? [
        cookie(SESSION_COOKIE, token, { expires }),
        expired(SESSION_ONLY_COOKIE),
        signedIn(expires),
      ]
    : [
        cookie(SESSION_COOKIE, token),
        cookie(SESSION_ONLY_COOKIE, "1", { visible: true }),
        signedIn(null),
      ];

/** The hint that someone is logged in – as long as that login (or none). */
export const signedIn = (expires: Date | null) =>
  cookie(SIGNED_IN_COOKIE, "1", {
    visible: true,
    expires: expires ?? undefined,
  });

/** The cookies of a logout: all gone. */
export const logoutCookies = () => [
  expired(SESSION_COOKIE),
  expired(SESSION_ONLY_COOKIE),
  expired(SIGNED_IN_COOKIE),
];

/**
 * The hint for a login from before it existed – set by a sync that finds it
 * missing: for one browser session if the login is one (its sign is there),
 * else for a login's full life (it may end sooner – a hint only).
 */
export const missingSignedIn = (cookieHeader: string | null) => {
  const names = (cookieHeader ?? "")
    .split(";")
    .map((part) => part.trim().split("=")[0]);
  if (names.includes(SIGNED_IN_COOKIE)) return null;
  return signedIn(
    names.includes(SESSION_ONLY_COOKIE)
      ? null
      : new Date(Date.now() + REMEMBER_SECONDS * 1000)
  );
};
