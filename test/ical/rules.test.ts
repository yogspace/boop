import { describe, expect, it } from "vitest";
import {
  calendarText,
  dispositionOf,
  etagOf,
  eventsOf,
  type FeedWords,
  feedPath,
  fileName,
  isToken,
  memberOf,
  newToken,
  sameEtag,
  summaryOf,
  uidOf,
} from "../../src/features/ical/rules";

const HOME = "0b1c2d3e-4f50-4617-8899-aabbccddeeff";
const ELSEWHERE = "9a8b7c6d-5e4f-4321-8765-0fedcba98765";
const ME = "acc-me";
const ANNA = "acc-anna";

const DE: FeedWords = {
  stamp: "Stempel",
  stamps: "Stempel",
  calendar: "Kalender",
};
const EN: FeedWords = {
  stamp: "Stamp",
  stamps: "stamps",
  calendar: "Calendar",
};

type Doc = Record<string, unknown>;

const stamps: Doc[] = [
  { id: "sport", name: "Sport", changedAt: "2026-01-01T00:00:00.000Z" },
  { id: "read", name: "Lesen", changedAt: "2026-01-01T00:00:00.000Z" },
  { id: "blank-1", name: "", changedAt: "2026-01-01T00:00:00.000Z" },
  { id: "blank-2", name: "  ", changedAt: "2026-01-01T00:00:00.000Z" },
  { id: "blank-3", name: "", changedAt: "2026-01-01T00:00:00.000Z" },
];

let counter = 0;
const print = (date: string, stamp: string, more: Doc = {}): Doc => ({
  id: `print-${++counter}`,
  calendar: HOME,
  date,
  stamp,
  deleted: false,
  createdAt: `2026-10-12T08:00:${String(counter).padStart(2, "0")}.000Z`,
  changedAt: "2026-10-12T08:00:00.000Z",
  ...more,
});

const note = (date: string, text: string, more: Doc = {}): Doc => ({
  id: `note-${date}`,
  calendar: HOME,
  date,
  content: { v: 1, lines: text.split("\n").map((line) => [{ text: line }]) },
  deleted: false,
  changedAt: "2026-10-12T09:00:00.000Z",
  ...more,
});

const events = (placements: Doc[], notes: Doc[] = [], words = DE) =>
  eventsOf({ calendar: HOME, placements, notes, stamps, words });

describe("a day's title", () => {
  it("names the stamps stamped on it, each once", () => {
    expect(summaryOf(["Sport", "Lesen", "Sport"], DE)).toBe("Sport, Lesen");
  });

  it("counts the ones without a name", () => {
    expect(summaryOf([""], DE)).toBe("Stempel");
    expect(summaryOf(["", " ", ""], DE)).toBe("3 Stempel");
    expect(summaryOf(["", ""], EN)).toBe("2 stamps");
    expect(summaryOf([""], EN)).toBe("Stamp");
    expect(summaryOf(["Sport", ""], DE)).toBe("Sport, Stempel");
  });

  it("tidies names – blanks inside one count as one", () => {
    expect(summaryOf(["  Spazieren   gehen ", "Spazieren gehen"], DE)).toBe(
      "Spazieren gehen"
    );
  });

  it("is empty without any stamp", () => {
    expect(summaryOf([], DE)).toBe("");
  });
});

describe("a calendar's days as events", () => {
  it("makes one event of a day with several stamps", () => {
    const list = events([
      print("2026-10-12", "sport"),
      print("2026-10-12", "read"),
      print("2026-10-12", "sport"),
    ]);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      date: "2026-10-12",
      summary: "Sport, Lesen",
      uid: uidOf(HOME, "2026-10-12"),
    });
    expect(list[0].description).toBeUndefined();
  });

  it("names the stamps in the order they were stamped", () => {
    const list = events([
      print("2026-10-12", "read", { createdAt: "2026-10-12T10:00:00.000Z" }),
      print("2026-10-12", "sport", { createdAt: "2026-10-12T09:00:00.000Z" }),
    ]);
    expect(list[0].summary).toBe("Sport, Lesen");
  });

  it("counts stamps without a name – and ones it doesn't know", () => {
    const list = events([
      print("2026-10-12", "blank-1"),
      print("2026-10-12", "blank-2"),
      print("2026-10-12", "blank-1"),
      print("2026-10-12", "unknown"),
      print("2026-10-12", "sport"),
    ]);
    expect(list[0].summary).toBe("Sport, 3 Stempel");
  });

  it("speaks the account's language", () => {
    const list = events([print("2026-10-12", "blank-1")], [], EN);
    expect(list[0].summary).toBe("Stamp");
  });

  it("has the note as plain text for its description", () => {
    const list = events(
      [print("2026-10-12", "sport")],
      [
        {
          ...note("2026-10-12", ""),
          content: {
            v: 1,
            lines: [
              [
                { text: "Kuchen", b: true },
                { text: " bei Anna", u: true },
              ],
              [{ text: "Schön war's" }],
            ],
          },
        },
      ]
    );
    expect(list[0]).toMatchObject({
      summary: "Sport",
      description: "Kuchen bei Anna\nSchön war's",
    });
  });

  it("makes an event of a day with only a note – named by its first words", () => {
    const list = events([], [note("2026-10-13", "Zahnarzt um 10\nDanach Eis")]);
    expect(list).toEqual([
      {
        uid: uidOf(HOME, "2026-10-13"),
        date: "2026-10-13",
        summary: "Zahnarzt um 10 Danach Eis",
        description: "Zahnarzt um 10\nDanach Eis",
        changed: new Date("2026-10-12T09:00:00.000Z"),
      },
    ]);
  });

  it("leaves out what was removed: markers show nothing", () => {
    const list = events(
      [
        print("2026-10-12", "sport", { deleted: true }),
        print("2026-10-14", "read"),
      ],
      [note("2026-10-13", "", { content: null, deleted: true })]
    );
    expect(list.map((event) => event.date)).toEqual(["2026-10-14"]);
  });

  it("drops a removed print's name – the day keeps the others", () => {
    const list = events([
      print("2026-10-12", "sport", { deleted: true }),
      print("2026-10-12", "read"),
    ]);
    expect(list[0].summary).toBe("Lesen");
  });

  it("takes only its own calendar's days, and only real days", () => {
    const list = events([
      print("2026-10-12", "sport", { calendar: ELSEWHERE }),
      print("2026-13-01", "sport"),
      print("2026-10-12", "read", { calendar: { id: HOME } }),
    ]);
    expect(list.map((event) => [event.date, event.summary])).toEqual([
      ["2026-10-12", "Lesen"],
    ]);
  });

  it("puts the days in order, the earliest first", () => {
    const list = events(
      [print("2026-12-24", "sport"), print("2026-01-01", "read")],
      [note("2026-06-15", "Sommer")]
    );
    expect(list.map((event) => event.date)).toEqual([
      "2026-01-01",
      "2026-06-15",
      "2026-12-24",
    ]);
  });

  it("is no event at all for an empty calendar", () => {
    expect(events([], [])).toEqual([]);
  });

  it("dates a day by its latest change – markers and stamp names too", () => {
    const list = eventsOf({
      calendar: HOME,
      placements: [
        print("2026-10-12", "sport", { changedAt: "2026-10-12T08:00:00.000Z" }),
        print("2026-10-12", "read", {
          deleted: true,
          changedAt: "2026-10-12T20:00:00.000Z",
        }),
      ],
      notes: [],
      stamps: [
        { id: "sport", name: "Sport", changedAt: "2026-10-12T12:00:00.000Z" },
      ],
      words: DE,
    });
    expect(list[0].changed.toISOString()).toBe("2026-10-12T20:00:00.000Z");
  });
});

describe("an event's id", () => {
  it("is the same at every fetch – made of calendar and day", () => {
    const first = events([print("2026-10-12", "sport")]);
    const again = events([
      print("2026-10-12", "read"),
      print("2026-10-12", "sport"),
    ]);
    expect(first[0].uid).toBe(again[0].uid);
    expect(first[0].uid).toBe(`2026-10-12-${HOME}@boop`);
  });

  it("differs between days and between calendars", () => {
    expect(uidOf(HOME, "2026-10-12")).not.toBe(uidOf(HOME, "2026-10-13"));
    expect(uidOf(HOME, "2026-10-12")).not.toBe(uidOf(ELSEWHERE, "2026-10-12"));
  });
});

describe("the calendar's text", () => {
  it("is a valid, empty calendar when nothing is in it", () => {
    const text = calendarText({
      calendar: { id: HOME, name: "Familie" },
      placements: [],
      notes: [],
      stamps,
      words: DE,
    });
    expect(text).toContain("X-WR-CALNAME:Familie\r\n");
    expect(text).not.toContain("BEGIN:VEVENT");
  });

  it("is named for its calendar – or “Kalender” without a name", () => {
    const text = calendarText({
      calendar: { id: HOME, name: "  " },
      placements: [],
      notes: [],
      stamps,
      words: DE,
    });
    expect(text).toContain("X-WR-CALNAME:Kalender\r\n");
  });

  it("writes stamps and note, escaped", () => {
    const text = calendarText({
      calendar: { id: HOME, name: "Familie" },
      placements: [print("2026-10-12", "sport"), print("2026-10-12", "read")],
      notes: [note("2026-10-12", "Kuchen, Kaffee; alles da")],
      stamps,
      words: DE,
    });
    expect(text).toContain("SUMMARY:Sport\\, Lesen\r\n");
    expect(text).toContain("DESCRIPTION:Kuchen\\, Kaffee\\; alles da\r\n");
    expect(text).toContain("DTSTART;VALUE=DATE:20261012\r\n");
    expect(text).toContain("DTEND;VALUE=DATE:20261013\r\n");
  });

  it("is the same text for the same calendar – so its tag is too", () => {
    const make = () =>
      calendarText({
        calendar: { id: HOME, name: "Familie" },
        placements: [print("2026-10-12", "sport", { id: "p1" })],
        notes: [],
        stamps,
        words: DE,
      });
    expect(make()).toBe(make());
    expect(etagOf(make())).toBe(etagOf(make()));
  });
});

describe("unchanged?", () => {
  it("tags a text by its content", () => {
    expect(etagOf("a")).toBe(etagOf("a"));
    expect(etagOf("a")).not.toBe(etagOf("b"));
    expect(etagOf("a")).toMatch(/^"[A-Za-z0-9_-]{22}"$/);
  });

  it("reads If-None-Match – one tag, several, weak, or any", () => {
    const tag = etagOf("a");
    expect(sameEtag(tag, tag)).toBe(true);
    expect(sameEtag(`W/${tag}`, tag)).toBe(true);
    expect(sameEtag(`"other", ${tag}`, tag)).toBe(true);
    expect(sameEtag("*", tag)).toBe(true);
    expect(sameEtag('"other"', tag)).toBe(false);
    expect(sameEtag(null, tag)).toBe(false);
    expect(sameEtag("", tag)).toBe(false);
  });
});

describe("the address", () => {
  it("has a long random key that fits in an address as it is", () => {
    const tokens = new Set(Array.from({ length: 200 }, newToken));
    expect(tokens.size).toBe(200);
    for (const token of tokens) {
      expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);
      expect(isToken(token)).toBe(true);
      expect(encodeURIComponent(token)).toBe(token);
      // 24 random bytes: 192 bits.
      expect(Buffer.from(token, "base64url")).toHaveLength(24);
    }
  });

  it("takes nothing that isn't shaped like a key", () => {
    for (const value of [
      "",
      "short",
      `${newToken()}x`,
      "a".repeat(31),
      "a/".repeat(16),
      "a.".repeat(16),
      null,
      undefined,
      42,
      { token: newToken() },
    ]) {
      expect(isToken(value)).toBe(false);
    }
  });

  it("is fetched at /api/ical/{token}.ics", () => {
    expect(feedPath("abc")).toBe("/api/ical/abc.ics");
  });
});

describe("who a feed is for", () => {
  const calendar = { id: HOME, members: [ME, ANNA], deleted: false };

  it("is good for the calendar's members", () => {
    expect(memberOf(calendar, ME)).toBe(true);
    expect(memberOf(calendar, ANNA)).toBe(true);
    expect(memberOf({ ...calendar, members: [{ id: ME }] }, ME)).toBe(true);
  });

  it("is dead for anyone else – left, taken out, or never in it", () => {
    expect(memberOf({ ...calendar, members: [ANNA] }, ME)).toBe(false);
    expect(memberOf(calendar, "acc-ben")).toBe(false);
    expect(memberOf(calendar, "")).toBe(false);
  });

  it("is dead with its calendar", () => {
    expect(memberOf({ ...calendar, deleted: true }, ME)).toBe(false);
    expect(memberOf(null, ME)).toBe(false);
    expect(memberOf(undefined, ME)).toBe(false);
    expect(memberOf({ id: HOME }, ME)).toBe(false);
  });
});

describe("as a file", () => {
  it("is named for the calendar", () => {
    expect(fileName("Familie", DE)).toBe("Familie.ics");
    expect(fileName("WG Küche 🍳", DE)).toBe("WG Küche 🍳.ics");
  });

  it("leaves out what no file's name may have", () => {
    expect(fileName('a/b\\c:d*e?f"g<h>i|j', DE)).toBe(
      "a b c d e f g h i j.ics"
    );
    expect(fileName("..versteckt", DE)).toBe("versteckt.ics");
    expect(fileName("  ", DE)).toBe("Kalender.ics");
    expect(fileName("", EN)).toBe("Calendar.ics");
  });

  it("says so in a header of plain letters – the full name for who reads it", () => {
    const header = dispositionOf("attachment", "WG Küche", {
      locale: "de",
      words: DE,
    });
    expect(header).toBe(
      "attachment; filename=\"wg-kueche.ics\"; filename*=UTF-8''WG%20K%C3%BCche.ics"
    );
    // Nothing a header can't carry.
    expect(header).toMatch(/^[\x20-\x7e]+$/);
    const quoted = dispositionOf("inline", 'Ein "Test"; (eins)', {
      locale: "en",
      words: EN,
    });
    expect(quoted).toMatch(/^[\x20-\x7e]+$/);
    expect(quoted.split('"')).toHaveLength(3);
  });
});
