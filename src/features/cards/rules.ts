// Relative, not `@/…`: the unit tests import this without the app's aliases.
import type { StampShape } from "../calendar/model";
import { DEFAULT_PALETTE, isColorKey } from "../calendar/palette";
import { isShapeKey } from "../calendar/shapes";
import { CARD_ID, MESSAGE_MAX, type StampOrigin } from "./protocol";

/**
 * The plain parts of cards and gifts – no database, tested on their own.
 * The server's (cards.ts, gifts.ts) and the sync's (sync/pull.ts) build on
 * them.
 */

/** What a gift's origin says it came from. */
export const BOOP = "Boop";

const LETTERS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/**
 * A new card's id: twelve letters and digits, each as likely as any other –
 * a byte that would favour the first few is thrown away and drawn again.
 */
export const newCardId = (): string => {
  let id = "";
  while (id.length < 12) {
    for (const byte of crypto.getRandomValues(new Uint8Array(16))) {
      if (byte < 248 && id.length < 12) id += LETTERS[byte % 62];
    }
  }
  return id;
};

/**
 * A card's id from what someone pasted – the id itself, or the card's link
 * (protocol.ts, `cardPath`), with or without the site. Null for anything
 * else.
 */
export const cardIdOf = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (CARD_ID.test(text)) return text;
  const path = /\/card\/([A-Za-z0-9]{12})\/?(?:[?#].*)?$/.exec(text);
  return path ? path[1] : null;
};

/**
 * A card's few words as they are kept: trimmed, no control characters but
 * line breaks, at most one empty line in a row, and `MESSAGE_MAX` long at
 * most – counted as a text field counts (an emoji is two), and cut between
 * characters, never inside one.
 */
export const cleanMessage = (value: unknown): string => {
  if (typeof value !== "string") return "";
  const text = value
    .replace(/\r\n?/g, "\n")
    // biome-ignore lint/suspicious/noControlCharactersInRegex: that is the point.
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u2028\u2029]/g, " ")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  let kept = "";
  for (const character of text) {
    if (kept.length + character.length > MESSAGE_MAX) break;
    kept += character;
  }
  return kept.trim();
};

/** A relationship as an id, populated or not – null for none. */
const refOf = (value: unknown): string | null => {
  if (typeof value === "string" && value) return value;
  if (value && typeof value === "object" && "id" in value) {
    return refOf((value as { id: unknown }).id);
  }
  return null;
};

/**
 * A stamp's origin as the sync hands it out – none for a stamp its owner
 * drew. `own`: the account's own stamp. Someone else's – shared with a
 * calendar it is in – says only that it is a gift from Boop, or a card's
 * stamp: who gave it to its owner, and with what words, is the owner's.
 */
export const originOf = (
  stored: unknown,
  own = true
): StampOrigin | undefined => {
  if (!stored || typeof stored !== "object") return undefined;
  const { kind, from, name, message } = stored as Record<string, unknown>;
  if (kind !== "card" && kind !== "gift") return undefined;
  if (kind === "gift") {
    const words = own && typeof message === "string" ? message : "";
    return { kind, from: null, name: BOOP, ...(words && { message: words }) };
  }
  if (!own) return { kind, from: null, name: "" };
  const words = typeof message === "string" ? message : "";
  return {
    kind,
    from: refOf(from),
    name: typeof name === "string" ? name : "",
    ...(words && { message: words }),
  };
};

/** A stamp as a card keeps it – its look, nothing else. */
export type CardStamp = {
  name: string;
  color: string;
  shape: StampShape;
  drawing: unknown;
};

/** The look of a stamp as it is stored – checked, for a card or a copy. */
export const cardStampOf = (doc: Record<string, unknown>): CardStamp => ({
  name: typeof doc.name === "string" ? doc.name.slice(0, 40) : "",
  color: isColorKey(doc.color) ? doc.color : DEFAULT_PALETTE[0].key,
  // A shape the CMS has no more shows as its first – kept as it is.
  shape: isShapeKey(doc.shape) ? doc.shape : "circle",
  drawing: doc.drawing ?? null,
});
