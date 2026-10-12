import {
  type Endpoint,
  executeAuthStrategies,
  logoutOperation,
  type PayloadRequest,
} from "payload";
import { joinInvitedCalendars } from "@/features/calendar/invites";

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
 */

const SESSION_COOKIE = "boop-session";
const ADMIN_COOKIE = "boop-token";

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

const cookie = (name: string, value: string, expires: Date) =>
  [
    `${name}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Expires=${expires.toUTCString()}`,
    ...(process.env.NODE_ENV === "production" ? ["Secure"] : []),
  ].join("; ");

const sessionCookie = (token: string, exp?: number) =>
  cookie(
    SESSION_COOKIE,
    token,
    new Date(exp ? exp * 1000 : Date.now() + 30 * 24 * 60 * 60 * 1000)
  );

const expired = (name: string) => cookie(name, "", new Date(0));

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

/** Payload's errors as Payload answers them – the app reads them the same. */
const failure = (req: PayloadRequest, error: unknown) => {
  const status =
    typeof (error as { status?: unknown })?.status === "number"
      ? (error as { status: number }).status
      : 500;
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
      const { email, password } = await json(req);
      try {
        const result = await req.payload.login({
          collection: "accounts",
          data: {
            email: String(email ?? ""),
            password: String(password ?? ""),
          },
        });
        if (!result.token) throw new Error("No token.");
        // Invitations to this address become memberships now.
        if (result.user) {
          await joinInvitedCalendars(req, result.user).catch(() => undefined);
        }
        return respond(
          req,
          {
            user: publicAccount(
              result.user as unknown as Record<string, unknown>
            ),
          },
          { cookies: [sessionCookie(result.token, result.exp)] }
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
      return respond(req, { ok: true }, { cookies: [expired(SESSION_COOKIE)] });
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
    path: "/me",
    method: "delete",
    handler: async (req) => {
      const account = await sessionAccount(req);
      if (!account)
        return respond(req, { error: "Not logged in." }, { status: 401 });
      await req.payload.delete({
        collection: "accounts",
        id: account.id,
        overrideAccess: true,
      });
      return respond(req, { ok: true }, { cookies: [expired(SESSION_COOKIE)] });
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
        return respond(
          req,
          {
            user: publicAccount(
              result.user as unknown as Record<string, unknown>
            ),
          },
          { cookies: [sessionCookie(result.token)] }
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
