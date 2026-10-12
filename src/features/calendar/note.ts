import { isId } from "../../lib/id";
import type { DayKey, NoteContent, NoteRun } from "./model";

/**
 * A day's note as data – the same on the server (sync, collections/notes.ts)
 * and in the app (features/app/day-note.tsx). No server imports here.
 *
 * A note is never HTML: it is lines of runs, each run plain text that is
 * bold, underlined, both or neither (`NoteContent`). Whatever a device sends
 * goes through `cleanNote` on the server, and what the app shows goes
 * through it once more – the app draws it with text nodes and two kinds of
 * element (`b`, `u`), so nothing stored ever reaches a page as markup.
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
 * in each run nothing but its text and `b`/`u` when they are `true`; runs
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
  const add = (text: string, b: boolean, u: boolean) => {
    const kept = cut(tidy(text), room);
    if (!kept) return;
    room -= kept.length;
    const line = lines[lines.length - 1];
    const last = line.at(-1);
    if (last && Boolean(last.b) === b && Boolean(last.u) === u) {
      last.text += kept;
    } else {
      line.push({
        text: kept,
        ...(b && { b: true as const }),
        ...(u && { u: true as const }),
      });
    }
  };
  for (const [i, row] of rows.entries()) {
    if ((i > 0 && !next()) || full) break;
    if (!Array.isArray(row)) continue;
    for (const run of row) {
      if (full || room < 1) break;
      if (!run || typeof run !== "object") continue;
      const { text, b, u } = run as Record<string, unknown>;
      if (typeof text !== "string") continue;
      const parts = text.split(BREAK);
      for (const [k, part] of parts.entries()) {
        if (k > 0 && !next()) break;
        add(part, b === true, u === true);
      }
    }
  }
  while (lines.length > 1 && blank(lines[lines.length - 1])) lines.pop();
  return blank(lines[0]) && lines.length === 1 ? null : { v: 1, lines };
};

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
 * `<b>`, `<strong>` or a font weight from 600; underlined `<u>`, `<ins>` or
 * a text decoration – whatever the browser made of a ⌘B or ⌘U.
 */
export const noteOf = (root: NoteNode): NoteContent | null => {
  const lines: NoteRun[][] = [];
  // The line being written – none right after a break.
  let line: NoteRun[] | null = null;
  const breakLine = () => {
    if (!line) lines.push([]);
    line = null;
  };
  const text = (value: string, b: boolean, u: boolean) => {
    for (const [i, part] of value.split(BREAK).entries()) {
      if (i > 0) breakLine();
      if (!part) continue;
      if (!line) {
        line = [];
        lines.push(line);
      }
      line.push({
        text: part,
        ...(b && { b: true as const }),
        ...(u && { u: true as const }),
      });
    }
  };
  const walk = (node: NoteNode, b: boolean, u: boolean) => {
    if (node.nodeType === TEXT) {
      text(node.nodeValue ?? "", b, u);
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
    const decoration = `${node.style?.textDecorationLine ?? ""} ${node.style?.textDecoration ?? ""}`;
    const under =
      u || name === "U" || name === "INS" || decoration.includes("underline");
    for (const child of Array.from(node.childNodes)) walk(child, bold, under);
    if (block) line = null;
  };
  for (const child of Array.from(root.childNodes)) walk(child, false, false);
  return cleanNote({ v: 1, lines });
};

// ── Its id ──────────────────────────────────────────────────────────────────

const rotl = (x: number, n: number) => (x << n) | (x >>> (32 - n));

/** SHA-1 – for `noteId` alone: nothing secret goes in, it only mixes. */
const sha1 = (data: Uint8Array): Uint8Array => {
  const words = new Uint32Array((((data.length + 8) >> 6) + 1) * 16);
  for (let i = 0; i < data.length; i++) {
    words[i >> 2] |= data[i] << (24 - (i % 4) * 8);
  }
  words[data.length >> 2] |= 0x80 << (24 - (data.length % 4) * 8);
  // The length in bits – a note's names are far too short for the high word.
  words[words.length - 1] = data.length * 8;
  const h = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
  const w = new Uint32Array(80);
  for (let block = 0; block < words.length; block += 16) {
    for (let i = 0; i < 16; i++) w[i] = words[block + i];
    for (let i = 16; i < 80; i++) {
      w[i] = rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    }
    let [a, b, c, d, e] = h;
    for (let i = 0; i < 80; i++) {
      const [f, k] =
        i < 20
          ? [(b & c) | (~b & d), 0x5a827999]
          : i < 40
            ? [b ^ c ^ d, 0x6ed9eba1]
            : i < 60
              ? [(b & c) | (b & d) | (c & d), 0x8f1bbcdc]
              : [b ^ c ^ d, 0xca62c1d6];
      const t = (rotl(a, 5) + f + e + k + w[i]) >>> 0;
      e = d;
      d = c;
      c = rotl(b, 30) >>> 0;
      b = a;
      a = t;
    }
    h[0] = (h[0] + a) >>> 0;
    h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0;
    h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0;
  }
  const out = new Uint8Array(20);
  for (const [i, v] of h.entries()) {
    out[i * 4] = v >>> 24;
    out[i * 4 + 1] = (v >>> 16) & 255;
    out[i * 4 + 2] = (v >>> 8) & 255;
    out[i * 4 + 3] = v & 255;
  }
  return out;
};

/** A UUID's 16 bytes. */
const uuidBytes = (id: string) =>
  Uint8Array.from(id.replace(/-/g, "").match(/../g) ?? [], (pair) =>
    Number.parseInt(pair, 16)
  );

/**
 * The id of a calendar's note for a day – the same on every device: a
 * name-based UUID (version 5, RFC 9562) of the day, in the calendar's id as
 * its namespace.
 *
 * Why not a random one, like everything else: two people – or one, on phone
 * and laptop – may start the same day's note offline. With random ids that
 * would make two notes for one day, and someone would have to merge them or
 * pick one. Made of the day, both are the same note: the server keeps one,
 * and the later change wins, as everywhere. The server makes sure a new
 * note's id is its day's (sync/apply.ts), so there is never a second.
 */
export const noteId = (calendar: string, date: DayKey): string => {
  const encoder = new TextEncoder();
  // Calendar ids are UUIDs (lib/id.ts) – anything else, as its text.
  const space = isId(calendar) ? uuidBytes(calendar) : encoder.encode(calendar);
  const name = encoder.encode(date);
  const data = new Uint8Array(space.length + name.length);
  data.set(space);
  data.set(name, space.length);
  const bytes = sha1(data).slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10).join(""),
  ].join("-");
};
