// Relative, not `@/…`: the unit tests import this without the app's aliases.
import type { Locale } from "../../i18n/config";
import type { CalendarView } from "../offline/store";

/**
 * The app's address: /de/app/{calendar}/{view} – /de/app/familie/heute,
 * /en/app/family/today. The server has one page per language for all of
 * them (the proxy hands every /de/app/… the page of /de/app); the browser
 * reads the rest and writes it anew as the calendar and the view change
 * (BoopApp).
 *
 * The calendar goes by its name, made into a slug. Names repeat – between
 * accounts, and within one: an own “Familie” and the one a friend shares –
 * so a slug only means something among the calendars of the account on
 * this device, and that is where it is looked up (`slugsOf`, `calendarOf`).
 * Plain functions of their arguments – tested in test/app/address.test.ts.
 */

/** The views' words in the address, in each language. */
export const VIEW_SLUGS = {
  de: { today: "heute", month: "monat" },
  en: { today: "today", month: "month" },
} as const satisfies Record<Locale, Record<CalendarView, string>>;

/** A view by its word – in either language (a link may come from the other). */
export const viewOf = (word: string | null | undefined): CalendarView | null => {
  for (const words of Object.values(VIEW_SLUGS)) {
    for (const [view, slug] of Object.entries(words)) {
      if (slug === word) return view as CalendarView;
    }
  }
  return null;
};

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
  return (end > LONGEST / 2 ? cut.slice(0, end) : cut.slice(0, LONGEST))
    .replace(/-+$/, "");
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
  const taken = new Set<string>();
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

/** What an address asks for: a calendar (its slug, or an id), a view. */
export type Address = { calendar: string | null; view: CalendarView | null };

/** What an app address asks for – nothing, for any other path. */
export const readAddress = (pathname: string): Address => {
  const [, , app, calendar, view] = pathname.split("/");
  if (app !== "app") return { calendar: null, view: null };
  return { calendar: decoded(calendar) || null, view: viewOf(view) };
};

const decoded = (part: string | undefined) => {
  if (!part) return "";
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
};

/** The address of a calendar's view – no calendar: the app's own. */
export const addressOf = (
  locale: Locale,
  slug: string | null | undefined,
  view: CalendarView
) => (slug ? `/${locale}/app/${slug}/${VIEW_SLUGS[locale][view]}` : `/${locale}/app`);
