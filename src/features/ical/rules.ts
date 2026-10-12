import { createHash, randomBytes } from "node:crypto";
// Relative, not `@/…`: the unit tests import this without the app's aliases.
import type { Locale } from "../../i18n/config";
import { slugOf } from "../app/address";
import { type DayKey, isDayKey } from "../calendar/model";
import { cleanNote, notePreview, noteText } from "../calendar/note";
import { type IcsEvent, icsOf } from "./ics";

/**
 * A calendar for a calendar app – the rules, as plain functions of their
 * arguments (the database is store.ts, the writing ics.ts):
 *
 * - what it says: every day with prints or a note is ONE event, all day –
 *   named by the stamps stamped on it, the note as its description;
 * - its address: a private one per account and calendar, the token in it
 *   the only key – calendar apps can't log in;
 * - who it is for: the account, while it is in the calendar.
 */

type Doc = Record<string, unknown>;

/** A relationship as an id, populated or not. */
export const refOf = (value: unknown): string => {
  if (value && typeof value === "object" && "id" in value) {
    return String(value.id);
  }
  return value == null ? "" : String(value);
};

// ── What it says ────────────────────────────────────────────────────────────

/** The feed's few words of its own, in the account's language (`app.ical`). */
export type FeedWords = {
  /** A stamp without a name. */
  stamp: string;
  /** Several of them: “3 stamps”. */
  stamps: string;
  /** A calendar without a name. */
  calendar: string;
};

/** A day's event by the same id at every fetch – made of calendar and day. */
export const uidOf = (calendar: string, date: DayKey) =>
  `${date}-${calendar}@boop`;

/**
 * A day's title: the names of the stamps stamped on it, each once – “Sport,
 * Lesen”. Those without a name are counted: “Stempel”, or “3 Stempel”. One
 * name per stamp goes in, an empty one for a stamp without.
 */
export const summaryOf = (names: readonly string[], words: FeedWords) => {
  const tidy = names.map((name) => name.replace(/\s+/g, " ").trim());
  const named = [...new Set(tidy.filter(Boolean))];
  const unnamed = tidy.length - tidy.filter(Boolean).length;
  if (unnamed === 1) named.push(words.stamp);
  if (unnamed > 1) named.push(`${unnamed} ${words.stamps}`);
  return named.join(", ");
};

/** When a document last changed – 0 when it doesn't say. */
const changedOf = (doc: Doc) => {
  const time = new Date(String(doc.changedAt ?? doc.updatedAt ?? "")).getTime();
  return Number.isNaN(time) ? 0 : time;
};

/** As they were stamped – the same order at every fetch. */
const inOrder = (a: Doc, b: Doc) =>
  String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")) ||
  String(a.id).localeCompare(String(b.id));

type Day = {
  /** The stamps stamped on it, each once, in the order they came. */
  stamps: Set<string>;
  note: ReturnType<typeof cleanNote>;
  changed: number;
};

/**
 * A calendar's days as events, the earliest first: one per day that has
 * prints or a note. Markers (`deleted`) show nothing – but they count for
 * when the day last changed, and so does a stamp's new name: an app that
 * looks at `LAST-MODIFIED` takes the event anew. A day left with markers
 * only is no event.
 *
 * A day with a note and no print is named by the note's first words.
 */
export const eventsOf = ({
  calendar,
  placements,
  notes,
  stamps,
  words,
}: {
  calendar: string;
  placements: readonly Doc[];
  notes: readonly Doc[];
  /** The stamps the prints were made with. */
  stamps: readonly Doc[];
  words: FeedWords;
}): IcsEvent[] => {
  const known = new Map(stamps.map((stamp) => [String(stamp.id), stamp]));
  const days = new Map<DayKey, Day>();
  const dayOf = (doc: Doc) => {
    if (refOf(doc.calendar) !== calendar || !isDayKey(doc.date)) return null;
    let day = days.get(doc.date);
    if (!day) {
      day = { stamps: new Set(), note: null, changed: 0 };
      days.set(doc.date, day);
    }
    day.changed = Math.max(day.changed, changedOf(doc));
    return day;
  };
  for (const print of [...placements].sort(inOrder)) {
    const day = dayOf(print);
    if (!day || print.deleted) continue;
    const stamp = refOf(print.stamp);
    day.stamps.add(stamp);
    day.changed = Math.max(day.changed, changedOf(known.get(stamp) ?? {}));
  }
  for (const note of notes) {
    const day = dayOf(note);
    if (day && !note.deleted) day.note = cleanNote(note.content);
  }
  return [...days]
    .filter(([, day]) => day.stamps.size > 0 || day.note)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, day]) => {
      const names = [...day.stamps].map((id) => {
        const stamp = known.get(id);
        return stamp && !stamp.deleted ? String(stamp.name ?? "") : "";
      });
      return {
        uid: uidOf(calendar, date),
        date,
        summary: summaryOf(names, words) || notePreview(day.note),
        ...(day.note && { description: noteText(day.note) }),
        changed: new Date(day.changed),
      };
    });
};

/** The calendar as a calendar app reads it – feed and file say the same. */
export const calendarText = ({
  calendar,
  words,
  ...docs
}: {
  calendar: { id: string; name: string };
  placements: readonly Doc[];
  notes: readonly Doc[];
  stamps: readonly Doc[];
  words: FeedWords;
}) =>
  icsOf({
    name: calendar.name.trim() || words.calendar,
    events: eventsOf({ calendar: calendar.id, words, ...docs }),
  });

// ── Unchanged? ──────────────────────────────────────────────────────────────

/**
 * A text's tag (`ETag`). The text holds no time of its making, so it is the
 * same until the calendar changes – and an app that has it gets a 304.
 */
export const etagOf = (text: string) =>
  `"${createHash("sha256").update(text).digest("base64url").slice(0, 22)}"`;

/**
 * Does `If-None-Match` name this tag? Compared weakly: a proxy that
 * compresses the answer may hand the tag on as `W/"…"`.
 */
export const sameEtag = (header: string | null | undefined, etag: string) =>
  (header ?? "")
    .split(",")
    .map((tag) => tag.trim().replace(/^W\//, ""))
    .some((tag) => tag === "*" || tag === etag);

// ── The address ─────────────────────────────────────────────────────────────

/**
 * A new address's key: 192 random bits, in letters an address takes as they
 * are (base64url, 32 of them).
 */
export const newToken = () => randomBytes(24).toString("base64url");

/** Shaped like a key – anything else never reaches the database. */
export const isToken = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{32}$/.test(value);

/** Where a feed is fetched – with the server's address before it. */
export const feedPath = (token: string) => `/api/ical/${token}.ics`;

/**
 * Is this account in this calendar – one that is still there? A feed is
 * good exactly that long: asked again at every fetch.
 */
export const memberOf = (calendar: Doc | null | undefined, account: string) =>
  Boolean(
    calendar &&
      account &&
      !calendar.deleted &&
      Array.isArray(calendar.members) &&
      calendar.members.map(refOf).includes(account)
  );

// ── As a file ───────────────────────────────────────────────────────────────

/** What no file's name may have, on one system or another. */
const UNFIT = /[\\/:*?"<>|]/g;

/** A character a name keeps: no control character, no half of one. */
const fit = (char: string) => {
  const code = char.codePointAt(0) ?? 0;
  return !(
    code < 32 ||
    (code >= 0x7f && code <= 0x9f) ||
    (code >= 0xd800 && code <= 0xdfff)
  );
};

/** The file's name: the calendar's own – “Familie.ics”. */
export const fileName = (name: string, words: FeedWords) => {
  const clean = Array.from(
    name
      .replace(UNFIT, " ")
      .replace(/\s+/g, " ")
      .replace(/^[. ]+/, "")
  )
    .filter(fit)
    .slice(0, 60)
    .join("")
    .trim();
  return `${clean || words.calendar}.ics`;
};

/**
 * `Content-Disposition` for the calendar's file. A header takes plain
 * letters only: the name goes twice – as the calendar's slug
 * (“wg-kueche.ics”), and in full for browsers that read `filename*`
 * (RFC 6266).
 */
export const dispositionOf = (
  kind: "attachment" | "inline",
  name: string,
  { locale, words }: { locale: Locale; words: FeedWords }
) => {
  const full = encodeURIComponent(fileName(name, words)).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
  return `${kind}; filename="${slugOf(name, locale)}.ics"; filename*=UTF-8''${full}`;
};
