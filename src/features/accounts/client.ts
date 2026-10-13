import type { Locale } from "@/i18n/config";
import { SESSION_ONLY_COOKIE, sessionOnlyOver } from "./cookie";

/**
 * The account calls from the browser – Payload's auth endpoints for the
 * `accounts` collection and the app's own (session.ts). The login lives in
 * an httpOnly cookie the server sets; the page never sees a token.
 */

export type Me = {
  id: string;
  name: string;
  email: string;
  locale: string;
  /**
   * A new address the account asked for, waiting for its confirmation –
   * `email` counts until then. None: null (or nothing, kept from before).
   */
  pendingEmail?: string | null;
};

type Result<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { value: T }))
  | { ok: false; reason: string };

const call = (path: string, init?: RequestInit & { json?: unknown }) =>
  fetch(`/api/accounts${path}`, {
    method: init?.json === undefined ? (init?.method ?? "GET") : "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...(init?.json !== undefined && { body: JSON.stringify(init.json) }),
  });

const firstError = async (response: Response) => {
  const body = (await response.json().catch(() => null)) as {
    errors?: { message?: string; data?: { errors?: { path?: string }[] } }[];
  } | null;
  return body?.errors?.[0] ?? null;
};

const toMe = (user: Record<string, unknown>): Me => ({
  id: String(user.id),
  name: String(user.name ?? ""),
  email: String(user.email ?? ""),
  locale: String(user.locale ?? "de"),
  pendingEmail: user.pendingEmail ? String(user.pendingEmail) : null,
});

/**
 * Logs in – to stay (`remember`, 30 days on this device) or only until the
 * browser closes.
 */
export const login = async (
  email: string,
  password: string,
  remember = true
): Promise<Result<Me>> => {
  const response = await call("/login", {
    json: { email, password, remember },
  });
  if (response.ok) {
    const { user } = (await response.json()) as {
      user: Record<string, unknown>;
    };
    noteLogin(remember);
    return { ok: true, value: toMe(user) };
  }
  if (response.status === 403) return { ok: false, reason: "unverified" };
  // Too many wrong tries – the account is locked for a while (session.ts).
  if (response.status === 429) return { ok: false, reason: "locked" };
  return { ok: false, reason: response.status === 401 ? "wrong" : "failed" };
};

/**
 * A login without “stay logged in” is for one browser session: its cookie
 * goes when the browser closes – and beside it one the page can see
 * (`SESSION_ONLY_COOKIE`; the login cookie itself is out of its reach). A
 * note of such a login, with its time, stays on the device. The note
 * without that cookie says: the session is over – and so does a note older
 * than such a login lasts. Told on the device alone: offline, too, where
 * nobody can ask the server.
 */
const SESSION_NOTE = "boop-session-only";

const signInSight = () =>
  document.cookie.split("; ").includes(`${SESSION_ONLY_COOKIE}=1`);

/** Notes on this device which kind of login it has – after each one. */
const noteLogin = (remember: boolean) => {
  try {
    // Only with the cookie in sight: could the page not read it, every
    // start would look like a session that is over.
    if (!remember && signInSight()) {
      localStorage.setItem(SESSION_NOTE, String(Date.now()));
    } else localStorage.removeItem(SESSION_NOTE);
  } catch {
    // No storage – the login still ends with the browser; the device's copy
    // then stays, as after any login that ran out.
  }
};

/**
 * True when this device's last login was for one browser session, and that
 * is over: what it left on the device has to go before anyone sees it.
 */
export const sessionOver = () => {
  try {
    const since = Number(localStorage.getItem(SESSION_NOTE));
    return since > 0 && sessionOnlyOver({ since, sign: signInSight() });
  } catch {
    return false;
  }
};

export const register = async (data: {
  name: string;
  email: string;
  password: string;
  locale: Locale;
}): Promise<Result> => {
  const response = await call("", { json: data });
  if (response.ok) return { ok: true };
  if (response.status === 429) return { ok: false, reason: "tooMany" };
  const error = await firstError(response);
  const taken = error?.data?.errors?.some((e) => e.path === "email");
  return { ok: false, reason: taken ? "taken" : "failed" };
};

export const forgotPassword = async (email: string): Promise<Result> => {
  const response = await call("/forgot-password", { json: { email } });
  return response.ok ? { ok: true } : { ok: false, reason: "failed" };
};

export const resetPassword = async (
  token: string,
  password: string
): Promise<Result<Me>> => {
  const response = await call("/reset-password", {
    json: { token, password },
  });
  if (!response.ok) return { ok: false, reason: "invalid" };
  const { user } = (await response.json()) as {
    user: Record<string, unknown>;
  };
  // A new password logs in to stay.
  noteLogin(true);
  return { ok: true, value: toMe(user) };
};

export const verifyEmail = async (token: string): Promise<Result> => {
  const response = await call(`/verify/${encodeURIComponent(token)}`, {
    json: {},
  });
  return response.ok ? { ok: true } : { ok: false, reason: "failed" };
};

/** The logged-in account – null when nobody is (or the cookie expired). */
export const fetchMe = async (): Promise<Me | null> => {
  const response = await call("/me");
  if (!response.ok) return null;
  const { user } = (await response.json()) as {
    user: Record<string, unknown> | null;
  };
  return user && user.collection !== "users" ? toMe(user) : null;
};

export const logout = async (): Promise<boolean> => {
  const response = await call("/logout", { json: {} }).catch(() => null);
  if (response?.ok) noteLogin(true);
  return Boolean(response?.ok);
};

/** A new display name – 40 characters at most, never none. */
export const rename = async (name: string): Promise<Result<Me>> => {
  const response = await fetch("/api/accounts/me", {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: name.trim().slice(0, 40) }),
  }).catch(() => null);
  if (!response?.ok) return { ok: false, reason: "failed" };
  const { user } = (await response.json()) as {
    user: Record<string, unknown>;
  };
  return { ok: true, value: toMe(user) };
};

/**
 * Asks for a new address – only with the password. The server notes it and
 * sends it a mail; it is the account's once that mail's link was opened
 * (email-change.ts). The answer is the same for an address that is someone
 * else's: nobody learns that here.
 */
export const requestEmailChange = async (
  email: string,
  password: string
): Promise<Result<Me>> => {
  const response = await call("/me/email", {
    json: { email: email.trim(), password },
  }).catch(() => null);
  if (response?.ok) {
    const { user } = (await response.json()) as {
      user: Record<string, unknown>;
    };
    return { ok: true, value: toMe(user) };
  }
  if (response?.status === 403) return { ok: false, reason: "wrong" };
  if (response?.status === 429) return { ok: false, reason: "tooMany" };
  if (response?.status === 400) {
    const body = (await response.json().catch(() => null)) as {
      reason?: string;
    } | null;
    return { ok: false, reason: body?.reason === "same" ? "same" : "invalid" };
  }
  return { ok: false, reason: "failed" };
};

/** Not after all: the address asked for is dropped, its link dead. */
export const cancelEmailChange = async (): Promise<Result<Me>> => {
  const response = await call("/me/email", { method: "DELETE" }).catch(
    () => null
  );
  if (!response?.ok) return { ok: false, reason: "failed" };
  const { user } = (await response.json()) as {
    user: Record<string, unknown>;
  };
  return { ok: true, value: toMe(user) };
};

/**
 * Redeems the link in the mail to a new address. “invalid”: the link is
 * over, used or unknown; “taken”: the address is someone else's by now;
 * “failed”: the server couldn't be asked.
 */
export const confirmEmailChange = async (token: string): Promise<Result> => {
  const response = await call("/change-email", { json: { token } }).catch(
    () => null
  );
  if (response?.ok) return { ok: true };
  if (response?.status === 409) return { ok: false, reason: "taken" };
  const over = response?.status === 404 || response?.status === 410;
  return { ok: false, reason: over ? "invalid" : "failed" };
};

/**
 * Everything Boop keeps about the account, as a JSON file (export.ts) –
 * null when it couldn't be fetched.
 */
export const fetchExport = async (): Promise<File | null> => {
  const response = await call("/me/export", { method: "POST" }).catch(
    () => null
  );
  if (!response?.ok) return null;
  // Named by the server: boop-2026-10-12.json.
  const name = /filename="([^"]+)"/.exec(
    response.headers.get("content-disposition") ?? ""
  )?.[1];
  return new File([await response.blob()], name ?? "boop.json", {
    type: "application/json",
  });
};

/**
 * Deletes the account with everything in it – only with its password. The
 * server logs out on the way; the device's copy is the caller's to clear.
 */
export const deleteAccount = async (password: string): Promise<Result> => {
  const response = await fetch("/api/accounts/me", {
    method: "DELETE",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  }).catch(() => null);
  if (response?.ok) {
    noteLogin(true);
    return { ok: true };
  }
  if (response?.status === 403) return { ok: false, reason: "wrong" };
  if (response?.status === 429) return { ok: false, reason: "tooMany" };
  return { ok: false, reason: "failed" };
};
