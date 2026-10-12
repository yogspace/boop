// Relative, not `@/…`: the unit tests import this without the app's aliases.
import type { DayKey } from "../calendar/model";

/**
 * A calendar as iCalendar text (RFC 5545) – what a calendar app reads, from
 * a feed or a file. Only the writing: which days there are and what they
 * say is rules.ts. Plain functions of their arguments, no server imports.
 *
 * What the format asks for, and calendar apps hold to:
 * - lines end with CRLF;
 * - no line is longer than 75 octets – a longer one goes on in the next,
 *   which starts with a space (`fold`);
 * - in a text `\`, `;` and `,` are escaped and a line break is `\n`
 *   (`escapeText`).
 */

/** A day's event – all day, on that one day. */
export type IcsEvent = {
  /** The same at every fetch: an app knows the event by it. */
  uid: string;
  date: DayKey;
  summary: string;
  /** None: the event has no description. */
  description?: string;
  /** When it last changed. */
  changed: Date;
};

export type IcsCalendar = {
  /** As the calendar app lists it. */
  name: string;
  events: readonly IcsEvent[];
};

/** How often an app should ask again – an hour (an ISO 8601 duration). */
export const REFRESH = "PT1H";

/** Line breaks of every kind – one `\n` each. */
const BREAK = /\r\n|[\n\r\u2028\u2029]/g;

/**
 * A text as a property's value: `\`, `;` and `,` escaped, a line break as
 * `\n` (RFC 5545, 3.3.11). What no text has goes: control characters (a tab
 * becomes a space) and halves of a character (an unpaired surrogate).
 */
export const escapeText = (value: string) => {
  let out = "";
  for (const char of value.replace(BREAK, "\n")) {
    const code = char.codePointAt(0) ?? 0;
    if (char === "\n") out += "\\n";
    else if (char === "\\" || char === ";" || char === ",") out += `\\${char}`;
    else if (code === 9) out += " ";
    else if (
      !(
        code < 32 ||
        (code >= 0x7f && code <= 0x9f) ||
        (code >= 0xd800 && code <= 0xdfff)
      )
    ) {
      out += char;
    }
  }
  return out;
};

/** The octets a character takes in UTF-8. */
const octets = (char: string) => {
  const code = char.codePointAt(0) ?? 0;
  if (code < 0x80) return 1;
  if (code < 0x800) return 2;
  return code < 0x10000 ? 3 : 4;
};

/** The longest a line may be – in octets, its CRLF not counted. */
const LONGEST = 75;

/**
 * A content line, folded: past 75 octets it goes on in the next line, which
 * starts with a space (counted in that line's 75). Never inside a
 * character – an umlaut's two octets and an emoji's four stay together.
 */
export const fold = (line: string) => {
  const lines: string[] = [];
  let current = "";
  let size = 0;
  for (const char of line) {
    const more = octets(char);
    if (size + more > LONGEST) {
      lines.push(current);
      current = " ";
      size = 1;
    }
    current += char;
    size += more;
  }
  lines.push(current);
  return lines.join("\r\n");
};

/** A day as the format writes it: 20261012. */
const dateOf = (day: DayKey) => day.replace(/-/g, "");

/** The day after – where an all-day event ends (`DTEND` is not part of it). */
export const dayAfter = (day: DayKey): DayKey => {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
};

/** A moment, in UTC: 20261012T183000Z. */
const momentOf = (time: Date) =>
  time.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");

const eventLines = (event: IcsEvent) => [
  "BEGIN:VEVENT",
  `UID:${escapeText(event.uid)}`,
  `DTSTAMP:${momentOf(event.changed)}`,
  `LAST-MODIFIED:${momentOf(event.changed)}`,
  `DTSTART;VALUE=DATE:${dateOf(event.date)}`,
  `DTEND;VALUE=DATE:${dateOf(dayAfter(event.date))}`,
  `SUMMARY:${escapeText(event.summary)}`,
  ...(event.description
    ? [`DESCRIPTION:${escapeText(event.description)}`]
    : []),
  // A day's stamps keep nobody busy.
  "TRANSP:TRANSPARENT",
  "END:VEVENT",
];

/**
 * The calendar's text, its events in the order they came. `METHOD:PUBLISH`:
 * something to read – no invitation, nothing to answer.
 */
export const icsOf = ({ name, events }: IcsCalendar) =>
  `${[
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Boop//Stamp calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(name)}`,
    // The same wish twice: the standard's (RFC 7986), and the one older
    // apps read.
    `REFRESH-INTERVAL;VALUE=DURATION:${REFRESH}`,
    `X-PUBLISHED-TTL:${REFRESH}`,
    ...events.flatMap(eventLines),
    "END:VCALENDAR",
  ]
    .map(fold)
    .join("\r\n")}\r\n`;
