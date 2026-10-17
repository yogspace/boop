import { type Doc, refOf } from "./settings";

/**
 * What someone else changed in a calendar – read from the writes – and
 * bundled per person and calendar, so a sync is one message.
 */

/**
 * Changes of one person in one calendar: at most one notification per
 * window – and the first waits this long for the rest of its sync.
 */
export const CHANGED_WINDOW_MS = 10 * 60 * 1000;
export const CHANGED_GATHER_MS = 5 * 1000;

/**
 * What someone else did in a calendar – the third switch's news. A print
 * placed is not among them: that has a switch of its own.
 */
export type CalendarChange =
  /** A day's note written, rewritten – or emptied (`noteDeleted`). */
  | { kind: "note" | "noteDeleted" }
  /** Prints moved, turned, resized – or taken off (`unstamped`). */
  | { kind: "moved" | "unstamped" }
  /** The calendar's name, and what it was. */
  | { kind: "renamed"; from: string }
  /** Someone came in, went by themselves, or was taken out by the owner. */
  | { kind: "joined" | "left" | "removed"; who: string };

export type ChangeKind = CalendarChange["kind"];

/** One write, as a hook sees it – and who made it. */
export type Written = {
  operation: "create" | "update";
  doc: Doc;
  /** The document before – none (or empty) when new. */
  previous: Doc | null | undefined;
  by: string;
};

/** The same, whatever its shape – a note's lines, a number. */
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** A note written, rewritten or emptied. */
export const noteChanges = ({
  operation,
  doc,
  previous,
}: Written): CalendarChange[] => {
  const was = operation === "update" && Boolean(previous && !previous.deleted);
  if (doc.deleted) return was ? [{ kind: "noteDeleted" }] : [];
  return was && same(doc.content, previous?.content) ? [] : [{ kind: "note" }];
};

/** Where and how a print lies – its ink is no move. */
const PRINT_PLACE = ["date", "x", "y", "rotation", "scale", "z"] as const;

/** A print moved or taken off – placed is `stampedTargets`' news. */
export const placementChanges = ({
  operation,
  doc,
  previous,
}: Written): CalendarChange[] => {
  if (operation !== "update" || !previous || previous.deleted) return [];
  if (doc.deleted) return [{ kind: "unstamped" }];
  return PRINT_PLACE.some((key) => !same(doc[key], previous[key]))
    ? [{ kind: "moved" }]
    : [];
};

const membersOf = (doc: Doc) =>
  (Array.isArray(doc.members) ? doc.members : [])
    .map(refOf)
    .filter((id): id is string => Boolean(id));

/**
 * A calendar renamed, someone in or out. Its color is no news: it is
 * everyone's own, the calendar's only where it starts.
 */
export const calendarChanges = ({
  operation,
  doc,
  previous,
  by,
}: Written): CalendarChange[] => {
  if (operation !== "update" || !previous || previous.deleted || doc.deleted) {
    return [];
  }
  const changes: CalendarChange[] = [];
  const name = String(doc.name ?? "");
  const before = String(previous.name ?? "");
  if (name !== before) changes.push({ kind: "renamed", from: before });
  const now = membersOf(doc);
  const then = membersOf(previous);
  for (const who of now) {
    if (!then.includes(who)) changes.push({ kind: "joined", who });
  }
  for (const who of then) {
    if (!now.includes(who)) {
      changes.push({ kind: who === by ? "left" : "removed", who });
    }
  }
  return changes;
};

/** What a change tells – the same twice is no news. */
const newsOf = (change: CalendarChange) =>
  "who" in change ? `${change.kind}:${change.who}` : change.kind;

/** Each news once – a name changed twice keeps the first one's before. */
export const distinctChanges = (changes: readonly CalendarChange[]) => {
  const byNews = new Map<string, CalendarChange>();
  for (const change of changes) {
    const news = newsOf(change);
    if (!byNews.has(news)) byNews.set(news, change);
  }
  return [...byNews.values()];
};

/** Whom changes are about – they don't hear of them. */
export const aboutOf = (changes: readonly CalendarChange[]) => [
  ...new Set(
    changes.flatMap((change) => ("who" in change ? [change.who] : []))
  ),
];

/**
 * Someone's changes in one calendar, bundled – a key per calendar and
 * person, kept in memory like the throttle:
 *
 * - The first opens a window and goes out a moment later (`gatherMs`) with
 *   whatever came meanwhile – the rest of its sync.
 * - Within the window (`windowMs` from that message), more of what was
 *   told is no news. Something new waits for the window's end and goes as
 *   one more message, naming all of it – which opens the next window.
 * - A window without news ends; the next change opens a new one.
 *
 * So each member hears from one person in one calendar once per window at
 * most. `add` says when to `take` – or null: one is due already, or it's no
 * news. `take` gives what to tell, or null.
 */
export const createBundle = (windowMs: number, gatherMs: number) => {
  type Window = {
    /** Its start: the last message – or the first change, before one. */
    since: number;
    changes: CalendarChange[];
    /** The news told. */
    told: Set<string>;
    /** When it is to be told – null: nothing waits. */
    due: number | null;
  };
  const windows = new Map<string, Window>();
  return {
    add: (key: string, change: CalendarChange, now = Date.now()) => {
      // Windows over go as new changes come – the map stays small.
      for (const [k, w] of windows) {
        if (w.due === null && now - w.since >= windowMs) windows.delete(k);
      }
      const window = windows.get(key);
      if (!window) {
        const due = now + gatherMs;
        windows.set(key, {
          since: now,
          changes: [change],
          told: new Set(),
          due,
        });
        return due;
      }
      window.changes = distinctChanges([...window.changes, change]);
      if (window.due !== null || window.told.has(newsOf(change))) return null;
      window.due = window.since + windowMs;
      return window.due;
    },
    take: (key: string, now = Date.now()): CalendarChange[] | null => {
      const window = windows.get(key);
      if (!window) return null;
      window.due = null;
      const fresh = window.changes.filter((c) => !window.told.has(newsOf(c)));
      if (!fresh.length) return null;
      for (const change of fresh) window.told.add(newsOf(change));
      window.since = now;
      return [...window.changes];
    },
  };
};
