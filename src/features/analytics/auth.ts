import { NextResponse } from "next/server";
import type { BasePayload } from "payload";
import { isAdmin } from "@/access";

/**
 * An admin session on this request? Someone logged in with a site account is
 * a visitor like any other – only the admins (`users`) are the owner.
 */
export const isAdminRequest = async (
  payload: BasePayload,
  headers: Headers
): Promise<boolean> => {
  try {
    const { user } = await payload.auth({ headers });
    return isAdmin({ user });
  } catch {
    return false;
  }
};

/**
 * Does the given secret match? `Boolean(expected)` is the point: without it
 * an unset environment variable would let `?secret=` (empty) in.
 */
const secretMatches = (
  provided: string | null,
  expected: string | undefined
): boolean => Boolean(expected) && provided === expected;

/**
 * Guard of the internal routes under /next/*: `null` if the caller may, the
 * finished 401 otherwise. Allowed is the matching `?secret=` – or, when a
 * Payload instance is given, a logged-in admin.
 *
 *   const denied = await denyUnlessAuthorized(request, { payload, secret });
 *   if (denied) return denied;
 */
export const denyUnlessAuthorized = async (
  request: Request,
  { secret, payload }: { secret?: string; payload?: BasePayload }
): Promise<NextResponse | null> => {
  const provided = new URL(request.url).searchParams.get("secret");
  if (secretMatches(provided, secret)) return null;
  if (payload && (await isAdminRequest(payload, request.headers))) return null;
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
};
