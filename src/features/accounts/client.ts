import type { Locale } from "@/i18n/config";

/**
 * The account calls from the browser – Payload's auth endpoints for the
 * `accounts` collection. The login lives in an httpOnly cookie that Payload
 * sets; the page never sees a token.
 */

export type Me = { id: string; name: string; email: string; locale: string };

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
});

export const login = async (
  email: string,
  password: string
): Promise<Result<Me>> => {
  const response = await call("/login", { json: { email, password } });
  if (response.ok) {
    const { user } = (await response.json()) as {
      user: Record<string, unknown>;
    };
    return { ok: true, value: toMe(user) };
  }
  if (response.status === 403) return { ok: false, reason: "unverified" };
  const error = await firstError(response);
  // Payload says "locked" with the same status as a wrong password.
  if (/locked/i.test(error?.message ?? "")) {
    return { ok: false, reason: "locked" };
  }
  return { ok: false, reason: response.status === 401 ? "wrong" : "failed" };
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
  return Boolean(response?.ok);
};
