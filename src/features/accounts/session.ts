import {
  type Endpoint,
  executeAuthStrategies,
  jwtSign,
  LockedAuth,
  logoutOperation,
  type PayloadRequest,
} from "payload";
import { joinInvitedCalendars } from "@/features/calendar/invites";
import { nudge } from "@/features/sync/live";
import { rateLimit } from "@/lib/rate-limit";
import {
  expired,
  loginCookies,
  logoutCookies,
  REMEMBER_SECONDS,
  SESSION_COOKIE,
  SESSION_ONLY_SECONDS,
} from "./cookie";
import {
  askEmailChange,
  confirmEmailChange,
  dropEmailChange,
} from "./email-change";
import { emailChangedMail, newEmailMail } from "./emails";
import { collectExport, exportName } from "./export";
import { pendingEmailOf } from "./retention";
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
 * it – with the password, once more. And its way to a new address
 * (email-change.ts): asked for with the password as well, noted, and its
 * own only once the link in a mail to it was opened.
 */

const ADMIN_COOKIE = "boop-token";

// Guessing the password where it is asked once more – at the delete button
// and at the new address, both from one count – and reading everything out
// again and again: per account, far above what anyone needs.
const tooManyPasswords = rateLimit({ limit: 5, windowMs: 15 * 60 * 1000 });
const tooManyExports = rateLimit({ limit: 10, windowMs: 60 * 60 * 1000 });
// A new address is one someone merely typed in, and it gets a mail: a few
// an hour per account, so nobody's inbox is filled from here.
const tooManyAddresses = rateLimit({ limit: 5, windowMs: 60 * 60 * 1000 });

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

/** What a token says – read, not checked: only of one Payload just signed. */
const claimsOf = (token: string) =>
  JSON.parse(
    Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")
  ) as Record<string, unknown>;

/**
 * The token of a login for this browser session only (“stay logged in”
 * unticked). Payload signs every login for the collection's 30 days; this
 * one is signed again – the same fields, good for a day. The long one never
 * leaves the server.
 */
const shortToken = async (req: PayloadRequest, token: string) => {
  const { iat: _iat, exp: _exp, ...fields } = claimsOf(token);
  const signed = await jwtSign({
    fieldsToSign: fields,
    secret: req.payload.secret,
    tokenExpiration: SESSION_ONLY_SECONDS,
  });
  return signed.token;
};

/**
 * Ends one login of an account, by its session's id – the others stay.
 * Never in the way: a failure is only logged.
 */
const endSession = async (
  req: PayloadRequest,
  id: string | number,
  sid: unknown
) => {
  if (typeof sid !== "string" || !sid) return;
  try {
    const doc = await req.payload.db.findOne<{
      sessions?: { id?: string }[] | null;
    }>({
      collection: "accounts",
      where: { id: { equals: id } },
      select: { sessions: true },
    });
    const sessions = doc?.sessions ?? [];
    const others = sessions.filter((session) => session.id !== sid);
    if (others.length === sessions.length) return;
    await req.payload.db.updateOne({
      collection: "accounts",
      id,
      data: { sessions: others, updatedAt: null },
      returning: false,
    });
  } catch (error) {
    req.payload.logger.warn({ err: error, msg: "[accounts] session" });
  }
};

/**
 * Is this the account's password? Asked the way a login asks – Payload's
 * own check, with its count of wrong tries. The login it makes on the way
 * is never handed out, and ended again at once: the account stays logged in
 * where it was, and nowhere else. Null when it is the password – or the
 * status to refuse with: 403 for a wrong one, 429 once the wrong ones
 * locked the account.
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
    const { user, token } = await req.payload.login({
      collection: "accounts",
      data: { email: account.email, password },
    });
    if (String(user?.id) !== String(account.id)) return 403;
    if (token) await endSession(req, account.id, claimsOf(token).sid);
    return null;
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
  // A new address still waiting for its confirmation – never its token.
  pendingEmail: pendingEmailOf(user),
  // The admin's box: the app shows a link to the CMS, nothing more
  // (collection.ts). No right hangs on it – here neither.
  admin: user.admin === true,
});

/**
 * Sends a mail behind the answer, which neither waits for it nor fails with
 * it – so how long an answer takes says nothing about whether one went out.
 * A mail that didn't is only logged.
 */
const mailLater = (
  req: PayloadRequest,
  to: string,
  mail: Promise<{ subject: string; html: string }>
) => {
  void mail
    .then((made) => req.payload.sendEmail({ to, ...made }))
    .catch((error) =>
      req.payload.logger.warn({ err: error, msg: "[accounts] mail" })
    );
};

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
    // Name and language – the address has a way of its own (/me/email).
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
      if (tooManyPasswords(String(account.id))) {
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
    // A new address (email-change.ts). Being logged in is not enough here
    // either: the password, once more. The answer is the same whether the
    // address is free or someone else's – for that one no mail goes out.
    path: "/me/email",
    method: "post",
    handler: async (req) => {
      const account = await sessionAccount(req);
      if (!account)
        return respond(req, { error: "Not logged in." }, { status: 401 });
      if (tooManyPasswords(String(account.id))) {
        return respond(req, { error: "Too many tries." }, { status: 429 });
      }
      const { email, password } = await json(req);
      const refused = await passwordRefused(req, account, password);
      if (refused) {
        const error = refused === 429 ? "Too many tries." : "Wrong password.";
        return respond(req, { error }, { status: refused });
      }
      if (tooManyAddresses(String(account.id))) {
        return respond(req, { error: "Too many tries." }, { status: 429 });
      }
      try {
        const asked = await askEmailChange(req.payload, account, email);
        if (!asked.ok) {
          const error =
            asked.reason === "same" ? "Same address." : "No email address.";
          return respond(req, { error, reason: asked.reason }, { status: 400 });
        }
        if (asked.token) {
          mailLater(
            req,
            asked.pendingEmail,
            newEmailMail({ token: asked.token, user: account })
          );
        }
        // The account's other devices show it waiting, too (sync/live.ts).
        nudge([String(account.id)]);
        return respond(req, {
          user: {
            ...publicAccount(account as unknown as Record<string, unknown>),
            pendingEmail: asked.pendingEmail,
          },
        });
      } catch (error) {
        return failure(req, error);
      }
    },
  },
  {
    // Not after all: what was noted goes, and its link is dead.
    path: "/me/email",
    method: "delete",
    handler: async (req) => {
      const account = await sessionAccount(req);
      if (!account)
        return respond(req, { error: "Not logged in." }, { status: 401 });
      try {
        await dropEmailChange(req.payload, account.id);
        nudge([String(account.id)]);
        return respond(req, {
          user: {
            ...publicAccount(account as unknown as Record<string, unknown>),
            pendingEmail: null,
          },
        });
      } catch (error) {
        return failure(req, error);
      }
    },
  },
  {
    // The link in the mail to a new address (/[locale]/change-email passes
    // its token on). No login asked: the token is the key, and whoever has
    // it has the mailbox. It logs nobody in – a login here stays as it is,
    // on every device: the token names the account, not the address.
    path: "/change-email",
    method: "post",
    handler: async (req) => {
      const { token } = await json(req);
      try {
        const confirmed = await confirmEmailChange(req.payload, token);
        if (!confirmed.ok) {
          const status = { invalid: 404, expired: 410, taken: 409 } as const;
          return respond(
            req,
            { error: "Not confirmed.", reason: confirmed.reason },
            { status: status[confirmed.reason] }
          );
        }
        // Invitations to the new address become memberships now, as at a
        // login.
        await joinInvitedCalendars(req, confirmed.account).catch(
          () => undefined
        );
        // The address it had hears of it – should this not have been the
        // account's own doing.
        if (confirmed.was) {
          mailLater(
            req,
            confirmed.was,
            emailChangedMail({ user: confirmed.account })
          );
        }
        // Every open app of the account syncs – and shows the new address.
        nudge([confirmed.account.id]);
        return respond(req, { ok: true });
      } catch (error) {
        return failure(req, error);
      }
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
        // A new address still waiting goes with the old password: whoever
        // asked for it knew that one.
        await dropEmailChange(req.payload, String(result.user.id)).catch(
          (error) =>
            req.payload.logger.warn({
              err: error,
              msg: "[accounts] new address",
            })
        );
        return respond(
          req,
          {
            user: {
              ...publicAccount(
                result.user as unknown as Record<string, unknown>
              ),
              pendingEmail: null,
            },
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
