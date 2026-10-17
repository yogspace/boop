// Relative, not `@/…`: the unit tests import this without the app's aliases.
import type { Locale } from "../../i18n/config";
import { type DayKey, isDayKey } from "../calendar/model";
import type { CalendarView } from "../offline/store";

/**
 * The app's address: /de/app/{calendar}/{view} – /de/app/familie/heute,
 * /en/app/family/today – and after it what lies open over the view: a day
 * of the month or the year (/de/app/familie/monat/2026-10-13), or one of
 * the sheets (/de/app/familie/heute/einstellungen). Or the shelf, the
 * account's stamps on a page of their own: /de/app/stempel, /en/app/stamps
 * – with a sheet over it too (/de/app/stempel/neuer-stempel). The server
 * has one page per language for all of them (the proxy hands every
 * /de/app/… the page of /de/app); the browser reads the rest and writes it
 * anew as the calendar, the view and what is open change (BoopApp).
 *
 * The calendar goes by its name, made into a slug. Names repeat – between
 * accounts, and within one: an own “Familie” and the one a friend shares –
 * so a slug only means something among the calendars of the account on
 * this device, and that is where it is looked up (`slugsOf`, `calendarOf`).
 * The shelf's word is never a calendar's (`SHELF_SLUGS`).
 * Plain functions of their arguments – tested in test/app/address.test.ts.
 */

/** The views' words in the address, in each language. */
export const VIEW_SLUGS = {
  de: { today: "heute", month: "monat", year: "jahr" },
  en: { today: "today", month: "month", year: "year" },
} as const satisfies Record<Locale, Record<CalendarView, string>>;

/** A view by its word – in either language (a link may come from the other). */
export const viewOf = (
  word: string | null | undefined
): CalendarView | null => {
  for (const words of Object.values(VIEW_SLUGS)) {
    for (const [view, slug] of Object.entries(words)) {
      if (slug === word) return view as CalendarView;
    }
  }
  return null;
};

/** The view a calendar opens in until another is picked for it. */
export const START_VIEW: CalendarView = "month";

/**
 * The view that shows: the one the address asks for – a link, a reload, a
 * view switched to – else the one the calendar opens in (its own settings,
 * `start`), else the month.
 */
export const viewShown = (
  asked: CalendarView | null | undefined,
  start: CalendarView | null | undefined
): CalendarView => asked ?? start ?? START_VIEW;

/**
 * The sheets that have an address – each over the calendar's view. `edit`
 * is the editor with a stamp of one's own in it: which one, the history
 * entry keeps (BoopApp) – the address says only that one is.
 */
export type Panel = "settings" | "share" | "account" | "draw" | "edit";

/** The sheets' words in the address, in each language. */
export const PANEL_SLUGS = {
  de: {
    settings: "einstellungen",
    share: "teilen",
    account: "konto",
    draw: "neuer-stempel",
    edit: "stempel-bearbeiten",
  },
  en: {
    settings: "settings",
    share: "share",
    account: "account",
    draw: "new-stamp",
    edit: "edit-stamp",
  },
} as const satisfies Record<Locale, Record<Panel, string>>;

/** A sheet by its word – in either language. */
export const panelOf = (word: string | null | undefined): Panel | null => {
  for (const words of Object.values(PANEL_SLUGS)) {
    for (const [panel, slug] of Object.entries(words)) {
      if (slug === word) return panel as Panel;
    }
  }
  return null;
};

/**
 * The shelf's word in the address, in each language – where a calendar's
 * slug would be. No calendar has either (`slugsOf`).
 */
export const SHELF_SLUGS = {
  de: "stempel",
  en: "stamps",
} as const satisfies Record<Locale, string>;

/**
 * The sheets that open over the shelf too: the account's, and the editor –
 * a new stamp, or one of one's own drawn anew. A calendar's settings and its
 * share sheet are the calendar's.
 */
const SHELF_PANELS: readonly Panel[] = ["account", "draw", "edit"];

/** The shelf's word – in either language, in any case. */
const isShelf = (word: string) =>
  Object.values(SHELF_SLUGS).some((slug) => slug === word.toLowerCase());

/** A slug is cut at this length – at a word's end, where there is one. */
const LONGEST = 40;

/** A calendar whose name leaves nothing for its slug. */
const UNNAMED: Record<Locale, string> = { de: "kalender", en: "calendar" };

/** Letters written out – the umlauts, and a few no accent can be taken off. */
const SPELLED: Record<string, string> = {
  ä: "ae",
  ö: "oe",
  ü: "ue",
  ß: "ss",
  æ: "ae",
  œ: "oe",
  ø: "o",
  ł: "l",
};

/**
 * A name as it goes into the address: small letters, the umlauts written
 * out (ä → ae, ß → ss), other accents dropped (é → e), anything else a
 * dash – “WG Küche” is wg-kueche. Nothing left (no name, only emoji):
 * “kalender”/“calendar”.
 */
export const slugOf = (name: string, locale: Locale): string => {
  const slug = name
    .normalize("NFC")
    .toLowerCase()
    .replace(/[äöüßæœøł]/g, (letter) => SPELLED[letter])
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length <= LONGEST) return slug || UNNAMED[locale];
  // A dash right after the cut ends a word just there.
  const cut = slug.slice(0, LONGEST + 1);
  const end = cut.lastIndexOf("-");
  return (
    end > LONGEST / 2 ? cut.slice(0, end) : cut.slice(0, LONGEST)
  ).replace(/-+$/, "");
};

/** A calendar, as far as its slug goes. */
type Named = { id: string; name: string; owner: string };

/**
 * Each calendar's slug (by its id), none twice. When names come out the
 * same, the account's own calendars go first, then the shared ones, each
 * in the order of their ids: the first keeps the slug, the next get -2,
 * -3 … – unless another calendar's name is that already (“Familie 2”),
 * which goes ahead of any number given. The same calendars always come out
 * the same, whatever order they come in.
 *
 * The shelf's words are taken from the start, in both languages: a
 * calendar called “Stempel” is stempel-2 – /de/app/stempel is the shelf.
 */
export const slugsOf = (
  calendars: readonly Named[],
  me: string | undefined,
  locale: Locale
): Map<string, string> => {
  const ordered = [...calendars].sort(
    (a, b) =>
      Number(a.owner !== me) - Number(b.owner !== me) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
  const slugs = new Map<string, string>();
  const taken = new Set<string>(Object.values(SHELF_SLUGS));
  const later: [string, string][] = [];
  for (const calendar of ordered) {
    const slug = slugOf(calendar.name, locale);
    if (taken.has(slug)) later.push([calendar.id, slug]);
    else {
      taken.add(slug);
      slugs.set(calendar.id, slug);
    }
  }
  for (const [id, slug] of later) {
    let n = 2;
    while (taken.has(`${slug}-${n}`)) n++;
    taken.add(`${slug}-${n}`);
    slugs.set(id, `${slug}-${n}`);
  }
  return slugs;
};

/**
 * The calendar an address names (`slugs`: `slugsOf`'s) – by its id, as the
 * addresses before the slugs did (/de/app/{id}), else by its slug. None of
 * the account's: null.
 */
export const calendarOf = (
  named: string | null,
  slugs: ReadonlyMap<string, string>
): string | null => {
  if (!named) return null;
  if (slugs.has(named)) return named;
  const wanted = named.toLowerCase();
  for (const [id, slug] of slugs) if (slug === wanted) return id;
  return null;
};

/**
 * What an address asks for: the shelf, or a calendar (its slug, or an id)
 * and a view; and what lies open over it – a day (only after the month's or
 * the year's word, and only a real date) or a sheet (over the shelf, only
 * its own).
 */
export type Address = {
  shelf: boolean;
  calendar: string | null;
  view: CalendarView | null;
  day: DayKey | null;
  panel: Panel | null;
};

/** What lies open over a view – a day, or a sheet; one at a time. */
export type Open = { day?: DayKey | null; panel?: Panel | null };

/** An address that asks for nothing. */
export const NOTHING: Readonly<Address> = {
  shelf: false,
  calendar: null,
  view: null,
  day: null,
  panel: null,
};

/** What an app address asks for – nothing, for any other path. */
export const readAddress = (pathname: string): Address => {
  const [, , app, calendar, word, last] = pathname.split("/");
  if (app !== "app") return { ...NOTHING };
  const named = decoded(calendar);
  if (isShelf(named)) {
    const panel = panelOf(word);
    return {
      ...NOTHING,
      shelf: true,
      panel: panel && SHELF_PANELS.includes(panel) ? panel : null,
    };
  }
  const view = viewOf(word);
  return {
    shelf: false,
    calendar: named || null,
    view,
    day: view && view !== "today" && isDayKey(last) ? last : null,
    panel: view ? panelOf(last) : null,
  };
};

const decoded = (part: string | undefined) => {
  if (!part) return "";
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
};

/**
 * The address of a calendar's view, with what is open over it: a day (none
 * in the today view – that is a day of its own), else a sheet. No
 * calendar: the app's own.
 */
export const addressOf = (
  locale: Locale,
  slug: string | null | undefined,
  view: CalendarView,
  { day, panel }: Open = {}
) => {
  if (!slug) return `/${locale}/app`;
  const path = `/${locale}/app/${slug}/${VIEW_SLUGS[locale][view]}`;
  if (day && view !== "today") return `${path}/${day}`;
  return panel ? `${path}/${PANEL_SLUGS[locale][panel]}` : path;
};

/**
 * Whether a click on a link to an app address is the app's to follow, in
 * place (BoopApp) – not with a key held or another button: a new tab or
 * window gets the address itself.
 */
export const opensHere = (click: {
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  button: number;
}) =>
  !(click.metaKey || click.ctrlKey || click.shiftKey || click.altKey) &&
  click.button === 0;

/**
 * The shelf's address, with the sheet open over it – one of its own: the
 * calendar's sheets aren't said here.
 */
export const shelfAddressOf = (locale: Locale, panel?: Panel | null) => {
  const path = `/${locale}/app/${SHELF_SLUGS[locale]}`;
  return panel && SHELF_PANELS.includes(panel)
    ? `${path}/${PANEL_SLUGS[locale][panel]}`
    : path;
};
