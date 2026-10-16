import { nameId } from "../../lib/id";
import type { DayKey, NoteContent, NoteRun } from "./model";

/**
 * A day's note as data – the same on the server (sync, collections/notes.ts)
 * and in the app (features/app/day-note.tsx). No server imports here.
 *
 * A note is never HTML: it is lines of runs, each run plain text that is
 * bold, italic, underlined, any of them or none (`NoteContent`). Whatever a
 * device sends goes through `cleanNote` on the server, and what the app
 * shows goes through it once more – the app draws it with text nodes and
 * three kinds of element (`b`, `i`, `u`), so nothing stored ever reaches a
 * page as markup.
 *
 * One note per day of a calendar: its id is made of the two (`noteId`).
 */

export const NOTE_LIMITS = {
  /** Characters – a line break counts as one. */
  chars: 2000,
  lines: 100,
} as const;

/** Line breaks of every kind – they part lines, never stay inside a run. */
const BREAK = /\r\n|[\n\r\u2028\u2029]/;

/**
 * A run's text without what no note keeps: control characters (a tab
 * becomes a space), the invisible marks editors leave behind (zero width
 * space, BOM) and halves of a character (an unpaired surrogate).
 */
const tidy = (text: string) => {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code === 9) out += " ";
    else if (code >= 0xd800 && code <= 0xdbff) {
      const low = text.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        out += text[i] + text[i + 1];
        i++;
      }
    } else if (
      !(
        code < 32 ||
        (code >= 0x7f && code <= 0x9f) ||
        (code >= 0xdc00 && code <= 0xdfff) ||
        code === 0x200b ||
        code === 0xfeff
      )
    ) {
      out += text[i];
    }
  }
  return out;
};

/** At most `room` characters – never half of one. */
const cut = (text: string, room: number) => {
  if (text.length <= room) return text;
  const high = text.charCodeAt(room - 1);
  return text.slice(0, high >= 0xd800 && high <= 0xdbff ? room - 1 : room);
};

const blank = (line: NoteRun[]) => line.every((run) => !run.text.trim());

/**
 * A note as it came – from a device, the database or the editor – checked
 * and trimmed, or null when nothing is left to say. Lines of runs only, and
 * in each run nothing but its text and `b`/`i`/`u` when they are `true`; runs
 * alike side by side become one, empty ones go, and so do blank lines at
 * the end. A break inside a run's text starts a new line. Past the limits
 * (`NOTE_LIMITS`) the rest is cut off.
 */
export const cleanNote = (value: unknown): NoteContent | null => {
  if (!value || typeof value !== "object") return null;
  const rows = (value as { lines?: unknown }).lines;
  if (!Array.isArray(rows)) return null;
  const lines: NoteRun[][] = [[]];
  let room = NOTE_LIMITS.chars;
  let full = false;
  /** The next line – unless there is no room for it. */
  const next = () => {
    if (room < 1 || lines.length >= NOTE_LIMITS.lines) full = true;
    else {
      room -= 1;
      lines.push([]);
    }
    return !full;
  };
  const add = (text: string, marks: Marks) => {
    const kept = cut(tidy(text), room);
    if (!kept) return;
    room -= kept.length;
    const line = lines[lines.length - 1];
    const last = line.at(-1);
    if (last && sameMarks(last, marks)) {
      last.text += kept;
    } else {
      line.push({ text: kept, ...marksOf(marks) });
    }
  };
  for (const [i, row] of rows.entries()) {
    if ((i > 0 && !next()) || full) break;
    if (!Array.isArray(row)) continue;
    for (const run of row) {
      if (full || room < 1) break;
      if (!run || typeof run !== "object") continue;
      const { text, b, i: it, u } = run as Record<string, unknown>;
      if (typeof text !== "string") continue;
      const marks = { b: b === true, i: it === true, u: u === true };
      const parts = text.split(BREAK);
      for (const [k, part] of parts.entries()) {
        if (k > 0 && !next()) break;
        add(part, marks);
      }
    }
  }
  while (lines.length > 1 && blank(lines[lines.length - 1])) lines.pop();
  return blank(lines[0]) && lines.length === 1 ? null : { v: 1, lines };
};

/** How a run is set: bold, italic, underlined – each on or off. */
type Marks = { b: boolean; i: boolean; u: boolean };

const sameMarks = (run: NoteRun, marks: Marks) =>
  Boolean(run.b) === marks.b &&
  Boolean(run.i) === marks.i &&
  Boolean(run.u) === marks.u;

/** The marks a run keeps – only those that are on. */
const marksOf = ({ b, i, u }: Marks) => ({
  ...(b && { b: true as const }),
  ...(i && { i: true as const }),
  ...(u && { u: true as const }),
});

/** A note as plain text – its lines, one under the other. */
export const noteText = (content: NoteContent | null | undefined) =>
  (content?.lines ?? [])
    .map((line) => line.map((run) => run.text).join(""))
    .join("\n");

/** The start of a note on one line – for a name tag. */
export const notePreview = (
  content: NoteContent | null | undefined,
  max = 60
) => {
  const text = noteText(content).replace(/\s+/g, " ").trim();
  return text.length > max ? `${cut(text, max - 1).trimEnd()}…` : text;
};

/** Two notes that say the same, in the same way. */
export const sameNote = (
  a: NoteContent | null | undefined,
  b: NoteContent | null | undefined
) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// ── Reading the editor ──────────────────────────────────────────────────────

/**
 * What reading a note needs of a DOM node – the editor's (an `HTMLElement`
 * is one), or a stand-in in tests.
 */
export type NoteNode = {
  nodeType: number;
  nodeName: string;
  nodeValue: string | null;
  childNodes: ArrayLike<NoteNode>;
  style?: {
    fontWeight?: string;
    fontStyle?: string;
    textDecoration?: string;
    textDecorationLine?: string;
  };
};

const TEXT = 3;
const ELEMENT = 1;

/** Each starts a line of its own – what browsers wrap typed lines in. */
const BLOCKS = new Set([
  "BLOCKQUOTE",
  "DIV",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "LI",
  "OL",
  "P",
  "PRE",
  "TR",
  "UL",
]);

/** Never shown – nothing in them counts. */
const HIDDEN = new Set(["NOSCRIPT", "SCRIPT", "STYLE", "TEMPLATE"]);

const boldOf = (weight: string | undefined): boolean | undefined => {
  if (!weight) return undefined;
  if (weight === "bold" || weight === "bolder") return true;
  if (weight === "normal" || weight === "lighter") return false;
  const n = Number(weight);
  return Number.isFinite(n) ? n >= 600 : undefined;
};

/**
 * What an editable box says, as a note (checked and trimmed – `cleanNote`).
 * Read the way it shows: a `<br>` ends a line, a block (a `<div>`, as
 * Safari and Chrome make for a new line) stands on lines of its own, a
 * break in a text node breaks it (the box keeps white space, `pre-wrap`).
 * A `<br>` that only ends a line – the last thing in it – adds none. Bold is
 * `<b>`, `<strong>` or a font weight from 600; italic `<i>`, `<em>` or a
 * font style; underlined `<u>`, `<ins>` or a text decoration – whatever the
 * browser made of a ⌘B, ⌘I or ⌘U.
 */
export const noteOf = (root: NoteNode): NoteContent | null => {
  const lines: NoteRun[][] = [];
  // The line being written – none right after a break.
  let line: NoteRun[] | null = null;
  const breakLine = () => {
    if (!line) lines.push([]);
    line = null;
  };
  const text = (value: string, marks: Marks) => {
    for (const [n, part] of value.split(BREAK).entries()) {
      if (n > 0) breakLine();
      if (!part) continue;
      if (!line) {
        line = [];
        lines.push(line);
      }
      line.push({ text: part, ...marksOf(marks) });
    }
  };
  const walk = (node: NoteNode, { b, i, u }: Marks) => {
    if (node.nodeType === TEXT) {
      text(node.nodeValue ?? "", { b, i, u });
      return;
    }
    if (node.nodeType !== ELEMENT) return;
    const name = node.nodeName.toUpperCase();
    if (HIDDEN.has(name)) return;
    if (name === "BR") {
      breakLine();
      return;
    }
    const block = BLOCKS.has(name);
    if (block) line = null;
    const bold =
      boldOf(node.style?.fontWeight) ??
      (b || name === "B" || name === "STRONG");
    const slant = node.style?.fontStyle;
    const italic = slant
      ? slant !== "normal"
      : i || name === "I" || name === "EM";
    const decoration = `${node.style?.textDecorationLine ?? ""} ${node.style?.textDecoration ?? ""}`;
    const under =
      u || name === "U" || name === "INS" || decoration.includes("underline");
    const marks = { b: bold, i: italic, u: under };
    for (const child of Array.from(node.childNodes)) walk(child, marks);
    if (block) line = null;
  };
  const none = { b: false, i: false, u: false };
  for (const child of Array.from(root.childNodes)) walk(child, none);
  return cleanNote({ v: 1, lines });
};

// ── Its id ──────────────────────────────────────────────────────────────────

/**
 * The id of a calendar's note for a day – the same on every device: a
 * name-based UUID (version 5, RFC 9562 – `nameId`, lib/id.ts) of the day, in
 * the calendar's id as its namespace.
 *
 * Why not a random one, like everything else: two people – or one, on phone
 * and laptop – may start the same day's note offline. With random ids that
 * would make two notes for one day, and someone would have to merge them or
 * pick one. Made of the day, both are the same note: the server keeps one,
 * and the later change wins, as everywhere. The server makes sure a new
 * note's id is its day's (sync/apply.ts), so there is never a second.
 */
export const noteId = (calendar: string, date: DayKey): string =>
  nameId(calendar, date);
