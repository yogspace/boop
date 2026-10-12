import {
  type Endpoint,
  executeAuthStrategies,
  jwtSign,
  LockedAuth,
  logoutOperation,
  type PayloadRequest,
} from "payload";
import { joinInvitedCalendars } from "@/features/calendar/invites";
import { rateLimit } from "@/lib/rate-limit";
import {
  expired,
  loginCookies,
  logoutCookies,
  REMEMBER_SECONDS,
  SESSION_COOKIE,
  SESSION_ONLY_SECONDS,
} from "./cookie";
import { collectExport, exportName } from "./export";
import { noteSeen } from "./seen";

/**
 * The app's login – its own cookie, `boop-session`, apart from the admin's.
 *
 * Payload keeps every auth collection's login in ONE cookie (`boop-token`):
 * logging in to the app would log the admin out and lock /admin (“no access
 * to the admin panel”), and the other way round. So accounts never get that
 * cookie: their login, logout, “me” and new password go through the
 * endpoints below (they replace Payload's own for `accounts`), which keep the
 * token – Payload's own, with its sessions – in `boop-session`. Everything
 * the app calls finds its account with `sessionAccount(req)`.
 *
 * Here, too, are the account's ways out: its data as a file, and deleting
 * it – with the password, once more.
 */

const ADMIN_COOKIE = "boop-token";

// Guessing the password at the delete button, and reading everything out
// again and again – both per account, far above what anyone needs.
const tooManyDeletes = rateLimit({ limit: 5, windowMs: 15 * 60 * 1000 });
const tooManyExports = rateLimit({ limit: 10, windowMs: 60 * 60 * 1000 });

export type SessionAccount = {
  id: string | number;
  collection: "accounts";
  name?: string;
  email?: string;
  locale?: string;
  _sid?: string;
};

const readCookie = (headers: Headers, name: string) => {
  for (const part of (headers.get("cookie") ?? "").split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
};

/** No cookie-borne request from another site (CSRF) – Origin must be ours. */
const sameOrigin = (headers: Headers) => {
  const origin = headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === headers.get("host");
  } catch {
    return false;
  }
};

/** The account logged in to the app with this request – or null. */
export const sessionAccount = async (
  req: PayloadRequest
): Promise<SessionAccount | null> => {
  if (req.context.sessionAccount !== undefined) {
    return req.context.sessionAccount as SessionAccount | null;
  }
  const token = readCookie(req.headers, SESSION_COOKIE);
  let account: SessionAccount | null = null;
  if (token && sameOrigin(req.headers)) {
    // Payload checks the token as always (signature, expiry, session) – it
    // only comes from our cookie instead of its own.
    const { user } = await executeAuthStrategies({
      headers: new Headers({ Authorization: `JWT ${token}` }),
      payload: req.payload,
      canSetHeaders: false,
      isGraphQL: false,
    });
    account = user?.collection === "accounts" ? (user as SessionAccount) : null;
  }
  req.context.sessionAccount = account;
  return account;
};

/** When a login with “stay logged in” ends – the token's `exp`, or 30 days. */
const remembered = (exp?: number) =>
  new Date(exp ? exp * 1000 : Date.now() + REMEMBER_SECONDS * 1000);

/**
 * The token of a login for this browser session only (“stay logged in”
 * unticked). Payload signs every login for the collection's 30 days; this
 * one is signed again – the same fields, good for a day. The long one never
 * leaves the server.
 */
const shortToken = async (req: PayloadRequest, token: string) => {
  const {
    iat: _iat,
    exp: _exp,
    ...fields
  } = JSON.parse(
    Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")
  ) as Record<string, unknown>;
  const signed = await jwtSign({
    fieldsToSign: fields,
    secret: req.payload.secret,
    tokenExpiration: SESSION_ONLY_SECONDS,
  });
  return signed.token;
};

/**
 * Is this the account's password? Asked the way a login asks – Payload's
 * own check, with its count of wrong tries (the login it makes on the way
 * is never handed out). Null when it is – or the status to refuse with:
 * 403 for a wrong one, 429 once the wrong ones locked the account.
 */
const passwordRefused = async (
  req: PayloadRequest,
  account: SessionAccount,
  password: unknown
): Promise<403 | 429 | null> => {
  if (!(account.email && typeof password === "string" && password)) {
    return 403;
  }
  try {
    const { user } = await req.payload.login({
      collection: "accounts",
      data: { email: account.email, password },
    });
    return String(user?.id) === String(account.id) ? null : 403;
  } catch (error) {
    return error instanceof LockedAuth ? 429 : 403;
  }
};

/**
 * Responds – and clears an account's login from the admin cookie, where
 * earlier versions put it (the admin's own login there stays).
 */
const respond = (
  req: PayloadRequest,
  body: unknown,
  { status = 200, cookies = [] as string[] } = {}
) => {
  const headers = new Headers();
  for (const value of cookies) headers.append("Set-Cookie", value);
  if (req.user?.collection === "accounts") {
    headers.append("Set-Cookie", expired(ADMIN_COOKIE));
  }
  return Response.json(body, { status, headers });
};

/**
 * Payload's errors as Payload answers them – the app reads them the same.
 * Only a locked account gets a status of its own (429): its message comes
 * in the server's language, nothing to tell it by.
 */
const failure = (req: PayloadRequest, error: unknown) => {
  let status = 500;
  if (error instanceof LockedAuth) status = 429;
  else if (typeof (error as { status?: unknown })?.status === "number") {
    status = (error as { status: number }).status;
  }
  const message =
    error instanceof Error ? error.message : "Something went wrong.";
  return respond(req, { errors: [{ message }] }, { status });
};

const json = async (req: PayloadRequest) =>
  ((await req.json?.().catch(() => null)) ?? {}) as Record<string, unknown>;

const publicAccount = (user: Record<string, unknown>) => ({
  id: String(user.id),
  collection: "accounts",
  name: user.name ?? "",
  email: user.email ?? "",
  locale: user.locale ?? "de",
});

export const sessionEndpoints: Endpoint[] = [
  {
    path: "/login",
    method: "post",
    handler: async (req) => {
      const { email, password, remember } = await json(req);
      try {
        const result = await req.payload.login({
          collection: "accounts",
          data: {
            email: String(email ?? ""),
            password: String(password ?? ""),
          },
        });
        if (!result.token) throw new Error("No token.");
        if (result.user) {
          // There – not unused (retention.ts).
          await noteSeen(req, result.user);
          // Invitations to this address become memberships now.
          await joinInvitedCalendars(req, result.user).catch(() => undefined);
        }
        // “Stay logged in” – unless the form says no (a page from before
        // says nothing): then only until the browser closes.
        const cookies =
          remember === false
            ? loginCookies(await shortToken(req, result.token), null)
            : loginCookies(result.token, remembered(result.exp));
        return respond(
          req,
          {
            user: publicAccount(
              result.user as unknown as Record<string, unknown>
            ),
          },
          { cookies }
        );
      } catch (error) {
        return failure(req, error);
      }
    },
  },
  {
    path: "/logout",
    method: "post",
    handler: async (req) => {
      const account = await sessionAccount(req);
      if (account) {
        // Ends this device's session on the server too.
        await logoutOperation({
          collection: req.payload.collections.accounts,
          req: Object.assign(req, { user: account }) as PayloadRequest,
        }).catch(() => false);
      }
      return respond(req, { ok: true }, { cookies: logoutCookies() });
    },
  },
  {
    path: "/me",
    method: "get",
    handler: async (req) => {
      const account = await sessionAccount(req);
      return respond(req, {
        user: account
          ? publicAccount(account as unknown as Record<string, unknown>)
          : null,
      });
    },
  },
  {
    // Name and language – the address stays (see the collection's hook).
    path: "/me",
    method: "patch",
    handler: async (req) => {
      const account = await sessionAccount(req);
      if (!account)
        return respond(req, { error: "Not logged in." }, { status: 401 });
      const { name, locale } = await json(req);
      // A name it has to have – the others see it in shared calendars.
      if (typeof name === "string" && !name.trim()) {
        return respond(req, { error: "No name." }, { status: 400 });
      }
      try {
        const doc = await req.payload.update({
          collection: "accounts",
          id: account.id,
          data: {
            ...(typeof name === "string" && { name: name.trim().slice(0, 40) }),
            ...((locale === "de" || locale === "en") && { locale }),
          },
          overrideAccess: true,
        });
        return respond(req, {
          user: publicAccount(doc as unknown as Record<string, unknown>),
        });
      } catch (error) {
        return failure(req, error);
      }
    },
  },
  {
    // Deleting the own account – with everything in it (collection hook).
    // Being logged in is not enough: the password, once more.
    path: "/me",
    method: "delete",
    handler: async (req) => {
      const account = await sessionAccount(req);
      if (!account)
        return respond(req, { error: "Not logged in." }, { status: 401 });
      if (tooManyDeletes(String(account.id))) {
        return respond(req, { error: "Too many tries." }, { status: 429 });
      }
      const { password } = await json(req);
      const refused = await passwordRefused(req, account, password);
      if (refused) {
        const error = refused === 429 ? "Too many tries." : "Wrong password.";
        return respond(req, { error }, { status: refused });
      }
      try {
        await req.payload.delete({
          collection: "accounts",
          id: account.id,
          overrideAccess: true,
        });
      } catch (error) {
        return failure(req, error);
      }
      return respond(req, { ok: true }, { cookies: logoutCookies() });
    },
  },
  {
    // Everything Boop keeps about the account, as a file (export.ts). A
    // POST: no link from elsewhere can start it.
    path: "/me/export",
    method: "post",
    handler: async (req) => {
      const account = await sessionAccount(req);
      if (!account)
        return respond(req, { error: "Not logged in." }, { status: 401 });
      if (tooManyExports(String(account.id))) {
        return respond(req, { error: "Too many tries." }, { status: 429 });
      }
      try {
        const data = await collectExport(req, String(account.id));
        return new Response(JSON.stringify(data, null, 2), {
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Content-Disposition": `attachment; filename="${exportName()}"`,
            "Cache-Control": "no-store",
          },
        });
      } catch (error) {
        return failure(req, error);
      }
    },
  },
  {
    // A new password logs in – into the app's cookie.
    path: "/reset-password",
    method: "post",
    handler: async (req) => {
      const { token, password } = await json(req);
      try {
        const result = await req.payload.resetPassword({
          collection: "accounts",
          data: {
            token: String(token ?? ""),
            password: String(password ?? ""),
          },
          overrideAccess: true,
        });
        if (!(result.token && result.user)) throw new Error("No token.");
        await noteSeen(req, {
          ...result.user,
          id: String(result.user.id),
        });
        return respond(
          req,
          {
            user: publicAccount(
              result.user as unknown as Record<string, unknown>
            ),
          },
          { cookies: loginCookies(result.token, remembered()) }
        );
      } catch (error) {
        return failure(req, error);
      }
    },
  },
  // Payload's own ways to a token in the admin cookie – closed for accounts.
  ...(["/refresh-token", "/first-register"] as const).map(
    (path): Endpoint => ({
      path,
      method: "post",
      handler: () => Response.json({ error: "Not found." }, { status: 404 }),
    })
  ),
];
