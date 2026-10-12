import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { NoteContent } from "../../src/features/calendar/model";
import {
  cleanNote,
  NOTE_LIMITS,
  type NoteNode,
  noteId,
  noteOf,
  notePreview,
  noteText,
  sameNote,
} from "../../src/features/calendar/note";
import { isId } from "../../src/lib/id";

const lines = (...rows: NoteContent["lines"]): NoteContent => ({
  v: 1,
  lines: rows,
});

describe("a note as it comes in", () => {
  it("keeps lines of runs – text, bold, underlined", () => {
    const note = lines(
      [{ text: "Zoo " }, { text: "mit Oma", b: true }],
      [],
      [
        { text: "Eis", b: true, u: true },
        { text: "!", u: true },
      ]
    );
    expect(cleanNote(note)).toEqual(note);
  });

  it("is nothing without lines of runs", () => {
    for (const junk of [
      null,
      undefined,
      "<b>hi</b>",
      42,
      [],
      {},
      { lines: "hi" },
      { lines: {} },
      { lines: [] },
      { lines: [[]] },
      { lines: [["hi"]] },
      { lines: [[{ text: 42 }]] },
    ]) {
      expect(cleanNote(junk)).toBeNull();
    }
  });

  it("keeps nothing of a run but its text and b/u when they are true", () => {
    const run = JSON.parse(
      '{"text":"x","b":"true","u":1,"html":"<img src=x onerror=alert(1)>","style":"color:red","__proto__":{"b":true}}'
    );
    expect(cleanNote({ lines: [[run]] })).toEqual(lines([{ text: "x" }]));
  });

  it("keeps markup as the text it is – never as markup", () => {
    const text = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
    expect(noteText(cleanNote({ lines: [[{ text }]] }))).toBe(text);
  });

  it("joins runs alike and drops empty ones", () => {
    expect(
      cleanNote({
        lines: [
          [
            { text: "a", b: true },
            { text: "" },
            { text: "b", b: true },
            { text: "c" },
            { text: "d", u: false },
          ],
        ],
      })
    ).toEqual(lines([{ text: "ab", b: true }, { text: "cd" }]));
  });

  it("starts a new line at a break inside a run, of whatever kind", () => {
    const text = `a\nb\r\nc\rd${String.fromCharCode(0x2028)}e`;
    expect(noteText(cleanNote({ lines: [[{ text, b: true }]] }))).toBe(
      "a\nb\nc\nd\ne"
    );
    expect(cleanNote({ lines: [[{ text: "a\nb", b: true }]] })).toEqual(
      lines([{ text: "a", b: true }], [{ text: "b", b: true }])
    );
  });

  it("drops control characters and invisible marks, keeps emoji whole", () => {
    const [zwsp, bom] = [0x200b, 0xfeff].map((code) =>
      String.fromCharCode(code)
    );
    const text = `a\u0000b\u0007c\td${zwsp}e${bom}\u007ff 👩‍👩‍👧 é`;
    expect(noteText(cleanNote({ lines: [[{ text }]] }))).toBe(
      "abc def 👩‍👩‍👧 é"
    );
  });

  it("drops half a character", () => {
    const lone = `a${String.fromCharCode(0xd83d)}b${String.fromCharCode(0xde00)}c`;
    expect(noteText(cleanNote({ lines: [[{ text: lone }]] }))).toBe("abc");
  });

  it("leaves blank lines at the end out – and a blank note is none", () => {
    expect(
      cleanNote({ lines: [[{ text: "hi" }], [], [{ text: "  " }], []] })
    ).toEqual(lines([{ text: "hi" }]));
    expect(
      cleanNote({ lines: [[{ text: "   " }], [], [{ text: "\n" }]] })
    ).toBe(null);
    // Blank lines before the text stay – they are what was written.
    expect(noteText(cleanNote({ lines: [[], [{ text: "hi" }]] }))).toBe("\nhi");
  });

  it("is cut off at its length – a break counts, a character stays whole", () => {
    const long = "x".repeat(NOTE_LIMITS.chars + 500);
    expect(noteText(cleanNote({ lines: [[{ text: long }]] })).length).toBe(
      NOTE_LIMITS.chars
    );
    const two = cleanNote({
      lines: [[{ text: "x".repeat(1000) }], [{ text: "y".repeat(1500) }]],
    });
    expect(noteText(two).length).toBe(NOTE_LIMITS.chars);
    expect(two?.lines[1][0].text.length).toBe(NOTE_LIMITS.chars - 1001);
    // An emoji (two code units) right at the edge goes rather than halves.
    const edge = cleanNote({
      lines: [[{ text: `${"x".repeat(NOTE_LIMITS.chars - 1)}😀` }]],
    });
    expect(noteText(edge)).toBe("x".repeat(NOTE_LIMITS.chars - 1));
  });

  it("has so many lines at most – quickly, however many come", () => {
    const many = Array.from({ length: 200_000 }, () => [{ text: "a" }]);
    const started = performance.now();
    const note = cleanNote({ lines: many });
    expect(performance.now() - started).toBeLessThan(500);
    expect(note?.lines).toHaveLength(NOTE_LIMITS.lines);
    const breaks = cleanNote({ lines: [[{ text: "a\n".repeat(10_000) }]] });
    expect(breaks?.lines).toHaveLength(NOTE_LIMITS.lines);
  });

  it("checks what it made again to the same", () => {
    const note = cleanNote({
      lines: [[{ text: "a\tb", b: true }, { text: "c" }], [{ text: "d\ne" }]],
    });
    expect(cleanNote(note)).toEqual(note);
    expect(sameNote(cleanNote(note), note)).toBe(true);
  });
});

describe("a note as text", () => {
  const note = lines(
    [{ text: "Zoo mit " }, { text: "Oma", b: true }],
    [{ text: "  Eis  " }]
  );

  it("is its lines, one under the other", () => {
    expect(noteText(note)).toBe("Zoo mit Oma\n  Eis  ");
    expect(noteText(null)).toBe("");
  });

  it("starts on one line, cut short", () => {
    expect(notePreview(note)).toBe("Zoo mit Oma Eis");
    expect(notePreview(note, 8)).toBe("Zoo mit…");
    expect(notePreview(null)).toBe("");
  });
});

// ── Reading the editor ──────────────────────────────────────────────────────

type Style = NoteNode["style"];
const text = (value: string): NoteNode => ({
  nodeType: 3,
  nodeName: "#text",
  nodeValue: value,
  childNodes: [],
});
const el = (
  name: string,
  children: (NoteNode | string)[] = [],
  style?: Style
): NoteNode => ({
  nodeType: 1,
  nodeName: name.toUpperCase(),
  nodeValue: null,
  childNodes: children.map((child) =>
    typeof child === "string" ? text(child) : child
  ),
  style,
});
const br = () => el("br");
const page = (...children: (NoteNode | string)[]) => el("div", children);
const read = (...children: (NoteNode | string)[]) =>
  noteText(noteOf(page(...children)));

describe("reading what was typed", () => {
  it("takes <br> as a line break – a last one only ends its line", () => {
    expect(read("a", br(), "b")).toBe("a\nb");
    expect(read("a", br(), br(), "b")).toBe("a\n\nb");
    expect(read("a", br())).toBe("a");
    expect(read(br(), "a")).toBe("\na");
  });

  it("takes blocks as lines, the way Safari and Chrome make them", () => {
    expect(
      read("a", el("div", ["b"]), el("div", [br()]), el("div", ["c"]))
    ).toBe("a\nb\n\nc");
    expect(read(el("div", ["a"]), el("div", ["b"]))).toBe("a\nb");
    expect(read(el("p", ["a", br()]), el("p", ["b"]))).toBe("a\nb");
  });

  it("takes breaks in the text as lines (the page keeps white space)", () => {
    expect(read("a\nb")).toBe("a\nb");
  });

  it("is nothing on an empty page", () => {
    expect(noteOf(page())).toBeNull();
    expect(noteOf(page(br()))).toBeNull();
    expect(noteOf(page(el("div", [br()])))).toBeNull();
  });

  it("knows bold and underline by tag and by style", () => {
    expect(
      noteOf(
        page(
          el("b", ["b", el("u", ["bu"])]),
          "plain",
          el("strong", ["s"]),
          el("span", ["w"], { fontWeight: "700" }),
          el("b", [el("span", ["n"], { fontWeight: "normal" })]),
          el("span", ["d"], { textDecorationLine: "underline" }),
          el("ins", ["i"])
        )
      )
    ).toEqual(
      lines([
        { text: "b", b: true },
        { text: "bu", b: true, u: true },
        { text: "plain" },
        { text: "sw", b: true },
        { text: "n" },
        { text: "di", u: true },
      ])
    );
  });

  it("leaves out what never shows – and every other markup", () => {
    expect(
      read(
        el("script", ["alert(1)"]),
        el("style", ["b{}"]),
        el("i", ["it"]),
        el("a", ["link"]),
        el("img"),
        "!"
      )
    ).toBe("itlink!");
  });
});

// ── Its id ──────────────────────────────────────────────────────────────────

/** UUID v5 the long way – with Node's SHA-1. */
const v5 = (space: string, name: string) => {
  const bytes = createHash("sha1")
    .update(Buffer.from(space.replace(/-/g, ""), "hex"))
    .update(name)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

describe("a note's id", () => {
  const CALENDAR = "0b1c2d3e-4f50-4617-8899-aabbccddeeff";

  it("is the RFC's name-based UUID (v5)", () => {
    // RFC 9562's example: www.example.com in the DNS namespace.
    expect(
      noteId("6ba7b810-9dad-11d1-80b4-00c04fd430c8", "www.example.com")
    ).toBe("2ed6657d-e927-568b-95e1-2665a8aea6a2");
    // Every length around SHA-1's blocks.
    for (const length of [0, 1, 39, 40, 47, 48, 55, 56, 63, 64, 120, 200]) {
      const name = "d".repeat(length);
      expect(noteId(CALENDAR, name)).toBe(v5(CALENDAR, name));
    }
  });

  it("is the same for the same day, on any device – an id the sync takes", () => {
    const id = noteId(CALENDAR, "2026-10-12");
    expect(noteId(CALENDAR, "2026-10-12")).toBe(id);
    expect(isId(id)).toBe(true);
    expect(id[14]).toBe("5");
  });

  it("differs for another day or another calendar", () => {
    const id = noteId(CALENDAR, "2026-10-12");
    expect(noteId(CALENDAR, "2026-10-13")).not.toBe(id);
    expect(
      noteId("0b1c2d3e-4f50-4617-8899-aabbccddeef0", "2026-10-12")
    ).not.toBe(id);
  });
});
