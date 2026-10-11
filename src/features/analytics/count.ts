import configPromise from "@payload-config";
import { getPayload, type Payload } from "payload";
import { isAdminRequest } from "./auth";
import { isBot } from "./device-class";
import { isExcludedToken } from "./exclude";

/**
 * Whether a beacon counts – and if so the Payload instance to write with.
 * Not counted:
 *   - machines (crawlers, link previews),
 *   - browsers sending Global Privacy Control (`Sec-GPC: 1`),
 *   - the owner: logged in to the admin, or a device carrying the valid
 *     own-devices token (exclude.ts) – building and checking one's own pages
 *     would skew the small numbers.
 */
export const counting = async (
  request: Request,
  excludeToken: unknown
): Promise<Payload | null> => {
  if (isBot(request.headers.get("user-agent") ?? "")) return null;
  if (request.headers.get("sec-gpc") === "1") return null;
  const payload = await getPayload({ config: configPromise });
  if (await isAdminRequest(payload, request.headers)) return null;
  if (await isExcludedToken(payload, excludeToken)) return null;
  return payload;
};

/** Only the pathname – never a query or hash. */
export const cleanPath = (value: unknown): string | null => {
  const path = typeof value === "string" ? value.trim().split(/[?#]/)[0] : "";
  return path.startsWith("/") && path.length <= 200 ? path : null;
};

/** Reads a beacon's JSON body – null when it is none. */
export const readBody = async (
  request: Request
): Promise<Record<string, unknown> | null> => {
  try {
    const body: unknown = await request.json();
    return body && typeof body === "object"
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};
