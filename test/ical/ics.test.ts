import { describe, expect, it } from "vitest";
import {
  dayAfter,
  escapeText,
  fold,
  type IcsEvent,
  icsOf,
} from "../../src/features/ical/ics";

const octets = (line: string) => new TextEncoder().encode(line).length;

/** The text as an app reads it: folded lines put together again. */
const unfold = (text: string) => text.replace(/\r\n /g, "");

const event = (more: Partial<IcsEvent> = {}): IcsEvent => ({
  uid: "2026-10-12-home@boop",
  date: "2026-10-12",
  summary: "Sport",
  changed: new Date("2026-10-12T18:30:00.000Z"),
  ...more,
});

describe("a text as a property's value", () => {
  it("escapes the backslash, the semicolon and the comma", () => {
    expect(escapeText("a\\b")).toBe("a\\\\b");
    expect(escapeText("eins; zwei")).toBe("eins\\; zwei");
    expect(escapeText("Sport, Lesen")).toBe("Sport\\, Lesen");
    expect(escapeText("\\;,")).toBe("\\\\\\;\\,");
  });

  it("writes a line break as \\n – of whatever kind", () => {
    expect(escapeText("eins\nzwei")).toBe("eins\\nzwei");
    expect(escapeText("eins\r\nzwei")).toBe("eins\\nzwei");
    expect(escapeText("eins\rzwei")).toBe("eins\\nzwei");
    expect(escapeText(`eins${String.fromCodePoint(0x2028)}zwei`)).toBe(
      "eins\\nzwei"
    );
    expect(escapeText("eins\n\nzwei")).toBe("eins\\n\\nzwei");
  });

  it("leaves colons, quotes, umlauts and emoji alone", () => {
    expect(escapeText('10:30 "Küche" 🎉')).toBe('10:30 "Küche" 🎉');
  });

  it("drops what no text has: control characters, half a character", () => {
    expect(escapeText("a\tb")).toBe("a b");
    expect(
      escapeText(`a${String.fromCodePoint(0)}b${String.fromCodePoint(7)}c`)
    ).toBe("abc");
    expect(escapeText(`a${String.fromCharCode(0xd83c)}b`)).toBe("ab");
  });
});

describe("folding a line at 75 octets", () => {
  it("leaves a line of 75 octets as it is", () => {
    const line = "x".repeat(75);
    expect(fold(line)).toBe(line);
  });

  it("goes on in a next line that starts with a space", () => {
    expect(fold("x".repeat(76))).toBe(`${"x".repeat(75)}\r\n x`);
  });

  it("counts the space into the next line's 75", () => {
    const lines = fold("x".repeat(300)).split("\r\n");
    expect(lines.map((line) => line.length)).toEqual([75, 75, 75, 75, 4]);
    expect(lines.slice(1).every((line) => line.startsWith(" "))).toBe(true);
    expect(unfold(fold("x".repeat(300)))).toBe("x".repeat(300));
  });

  it("counts octets, not letters – an umlaut takes two", () => {
    const line = `SUMMARY:${"ä".repeat(100)}`;
    const lines = fold(line).split("\r\n");
    expect(lines.length).toBeGreaterThan(2);
    for (const part of lines) expect(octets(part)).toBeLessThanOrEqual(75);
    expect(unfold(fold(line))).toBe(line);
  });

  it("never breaks inside a character: an umlaut at the edge moves on whole", () => {
    // 74 octets, then two more: the umlaut doesn't fit.
    const line = `${"x".repeat(74)}ä`;
    expect(fold(line)).toBe(`${"x".repeat(74)}\r\n ä`);
  });

  it("keeps an emoji's four octets together", () => {
    for (const before of [72, 73, 74]) {
      const line = `${"x".repeat(before)}🎉!`;
      const [first, second] = fold(line).split("\r\n");
      expect(first).toBe("x".repeat(before));
      expect(second).toBe(" 🎉!");
    }
    // Exactly to the edge: 71 + 4.
    expect(fold(`${"x".repeat(71)}🎉`)).toBe(`${"x".repeat(71)}🎉`);
  });

  it("holds for a long line of emoji and umlauts", () => {
    const line = `DESCRIPTION:${"Übung macht den Meister 🏋️‍♀️ – ".repeat(20)}`;
    const lines = fold(line).split("\r\n");
    for (const part of lines) {
      expect(octets(part)).toBeLessThanOrEqual(75);
      // No half of a pair at either end.
      expect(part).not.toMatch(/[\ud800-\udbff]$/);
      expect(part).not.toMatch(/^ ?[\udc00-\udfff]/);
    }
    expect(unfold(fold(line))).toBe(line);
  });
});

describe("the day after", () => {
  it("is the next day – over a month's, a year's and a leap day's end", () => {
    expect(dayAfter("2026-10-12")).toBe("2026-10-13");
    expect(dayAfter("2026-10-31")).toBe("2026-11-01");
    expect(dayAfter("2026-12-31")).toBe("2027-01-01");
    expect(dayAfter("2028-02-28")).toBe("2028-02-29");
    expect(dayAfter("2027-02-28")).toBe("2027-03-01");
  });
});

describe("a calendar as iCalendar text", () => {
  it("ends every line with CRLF – no other line break in it", () => {
    const text = icsOf({
      name: "Familie",
      events: [event({ description: "eins\nzwei" })],
    });
    expect(text.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(text.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });

  it("says what it is, whose it is and how often to ask again", () => {
    const lines = icsOf({ name: "Familie", events: [] }).split("\r\n");
    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(lines).toContain("VERSION:2.0");
    expect(lines).toContain("PRODID:-//Boop//Stamp calendar//EN");
    expect(lines).toContain("CALSCALE:GREGORIAN");
    expect(lines).toContain("X-WR-CALNAME:Familie");
    expect(lines).toContain("REFRESH-INTERVAL;VALUE=DURATION:PT1H");
    expect(lines).toContain("X-PUBLISHED-TTL:PT1H");
    expect(lines.at(-2)).toBe("END:VCALENDAR");
  });

  it("is a calendar without events when there is nothing in it", () => {
    const text = icsOf({ name: "Leer", events: [] });
    expect(text).not.toContain("VEVENT");
    expect(text.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(text.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("escapes the calendar's name", () => {
    expect(icsOf({ name: "Sport; Spiel, Spaß", events: [] })).toContain(
      "X-WR-CALNAME:Sport\\; Spiel\\, Spaß\r\n"
    );
  });

  it("writes a day as one all-day event, ending the day after", () => {
    const text = icsOf({ name: "Familie", events: [event()] });
    expect(text).toContain(
      [
        "BEGIN:VEVENT",
        "UID:2026-10-12-home@boop",
        "DTSTAMP:20261012T183000Z",
        "LAST-MODIFIED:20261012T183000Z",
        "DTSTART;VALUE=DATE:20261012",
        "DTEND;VALUE=DATE:20261013",
        "SUMMARY:Sport",
        "TRANSP:TRANSPARENT",
        "END:VEVENT",
      ].join("\r\n")
    );
  });

  it("ends an event on a month's last day in the next month", () => {
    const text = icsOf({
      name: "Familie",
      events: [event({ date: "2026-12-31" })],
    });
    expect(text).toContain("DTSTART;VALUE=DATE:20261231\r\n");
    expect(text).toContain("DTEND;VALUE=DATE:20270101\r\n");
  });

  it("has a description only when there is one – escaped, on one line", () => {
    expect(icsOf({ name: "Familie", events: [event()] })).not.toContain(
      "DESCRIPTION"
    );
    const text = icsOf({
      name: "Familie",
      events: [event({ description: "Kuchen, Kaffee; alle da\nSchön war's" })],
    });
    expect(text).toContain(
      "DESCRIPTION:Kuchen\\, Kaffee\\; alle da\\nSchön war's\r\n"
    );
  });

  it("folds long lines – and unfolded, nothing is lost", () => {
    const summary = "Geburtstag 🎂, Übernachtung & Frühstück ".repeat(6);
    const text = icsOf({ name: "Familie", events: [event({ summary })] });
    for (const line of text.split("\r\n")) {
      expect(octets(line)).toBeLessThanOrEqual(75);
    }
    expect(unfold(text)).toContain(`SUMMARY:${escapeText(summary)}\r\n`);
  });

  it("keeps the events in the order they came", () => {
    const text = icsOf({
      name: "Familie",
      events: [
        event({ uid: "a", date: "2026-10-01" }),
        event({ uid: "b", date: "2026-10-02" }),
      ],
    });
    expect(text.indexOf("UID:a")).toBeLessThan(text.indexOf("UID:b"));
    expect(text.match(/BEGIN:VEVENT/g)).toHaveLength(2);
  });
});
