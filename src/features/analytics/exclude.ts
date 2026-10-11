import { randomBytes, timingSafeEqual } from "node:crypto";
import type { BasePayload } from "payload";

/**
 * “Don't count this device” – the owner's own devices out of the statistics,
 * even when not logged in (on the phone one rarely is).
 *
 * One token for ALL own devices: it lies in the analytics global. The admin
 * hands it to the device it is opened on, which keeps it in its local storage
 * (client.ts) and sends it along with every beacon; a beacon carrying the
 * valid token is not counted. A new token makes every old one worthless –
 * then each device counts again until excluded anew. The token says nothing
 * about a device: all own devices carry the same one, visitors none, and
 * nothing is ever stored on a visitor's device.
 */

/** The analytics global's field holding the current token. */
const TOKEN_FIELD = "analyticsExcludeToken";

export const readExcludeToken = async (
  payload: BasePayload
): Promise<string | null> => {
  const analytics = (await payload.findGlobal({
    slug: "analytics",
    depth: 0,
    overrideAccess: true,
  })) as unknown as Record<string, unknown>;
  const token = analytics[TOKEN_FIELD];
  return typeof token === "string" && token ? token : null;
};

/**
 * Straight at the model instead of `payload.updateGlobal()`: the analytics
 * global is open in the admin exactly when the button is pressed, and a
 * regular update would bump `updatedAt` and make the open form claim someone
 * else changed it. This writes the one field and nothing else.
 */
export const writeExcludeToken = async (
  payload: BasePayload,
  token: string
): Promise<void> => {
  const globals = (
    payload.db as unknown as {
      globals: {
        updateOne: (
          filter: unknown,
          update: unknown,
          options?: unknown
        ) => Promise<unknown>;
      };
    }
  ).globals;
  await globals.updateOne(
    { globalType: "analytics" },
    { $set: { [TOKEN_FIELD]: token } },
    // `strict: false`: the base model of all globals does not know the field,
    // only the analytics global's does – Mongoose would drop it silently.
    { upsert: true, strict: false }
  );
};

export const newExcludeToken = (): string =>
  randomBytes(24).toString("base64url");

/** Equal strings, compared in constant time. */
const sameToken = (a: string, b: string) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

/** Is this the VALID token? An outdated one does not count. */
export const isExcludedToken = async (
  payload: BasePayload,
  token: unknown
): Promise<boolean> => {
  if (typeof token !== "string" || !token || token.length > 100) return false;
  try {
    const current = await readExcludeToken(payload);
    return current !== null && sameToken(token, current);
  } catch {
    return false;
  }
};
