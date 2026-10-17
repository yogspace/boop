import { LOCALES, type Locale } from "./config";
import { appTexts } from "./dictionaries/app";
import { authTexts } from "./dictionaries/auth";
import { cardTexts } from "./dictionaries/card";
import { contactTexts } from "./dictionaries/contact";
import { mailTexts } from "./dictionaries/mail";
import { siteTexts } from "./dictionaries/site";
import { build, type Flat, flatten, type Resolved, type Shape } from "./flat";
import { checkPlaceholders, type Placeholders } from "./template";

/**
 * Every text of the site and the app, per language – as the code writes
 * them. German is the shape; English must have the same keys (checked by
 * its type, `Shape`). Not here: the stamp colors' names – they come with
 * the colors, from the CMS (features/calendar/palette.ts).
 *
 * The texts are in dictionaries/, by area – site, auth, app (its sections
 * in app-*.ts), card, contact, mail – German and English side by side;
 * here they are put together, in that order, which is the CMS's too.
 *
 * What the pages show comes from the CMS: the “Translations” global
 * (features/translations) has a field per key here and wins where it is
 * filled; a new key, an emptied field or no database show the code's.
 *
 * HOW TO READ A TEXT
 *
 * - In a client component: `dictionaryOf(locale)`. The layout hands the
 *   CMS's texts to `TextsProvider`, which puts them in use while rendering,
 *   on the server and in the browser (features/translations/
 *   texts-provider.tsx) – they are part of the page, so it also opens
 *   offline.
 * - On the server – a server component, a layout, `generateMetadata`, a
 *   route, a mail, a notification: `await getDictionary(locale)`
 *   (features/translations/get-texts.ts). No provider renders there first –
 *   `dictionaryOf` alone could still give the code's.
 * - A component drawn on both sides (components/site-footer.tsx) calls
 *   `dictionaryOf` – on the server under a component that awaited
 *   `getDictionary` for that language, which puts them in use there too.
 *
 * HOW TO WRITE ONE
 *
 * - A plain text is a string. A list is an array; the CMS has one field per
 *   entry, as many as here.
 * - A text with something in it – a name, a number, one wording for one and
 *   another for many – is a `template` (template.ts): written with
 *   placeholders, “Hallo {name}!”, so it can be edited in the CMS. In
 *   English it is only the wording(s).
 * - A function written by hand still works, but stays out of the CMS.
 */

const de = {
  ...siteTexts.de,
  ...authTexts.de,
  ...appTexts.de,
  ...cardTexts.de,
  ...contactTexts.de,
  ...mailTexts.de,
};

/** The texts as the pages read them – a template is what it makes. */
export type Dictionary = Resolved<typeof de>;

/** Same keys as German, its own texts – of a template only the wording(s). */
const en: Shape<typeof de> = {
  ...siteTexts.en,
  ...authTexts.en,
  ...appTexts.en,
  ...cardTexts.en,
  ...contactTexts.en,
  ...mailTexts.en,
};

// ── The texts in use ────────────────────────────────────────────────────────

const flat = { de: flatten(de), en: flatten(en) } satisfies Record<
  Locale,
  Flat
>;

/** The code's own texts by key (flat.ts), per language. */
export const CODE_TEXTS: Record<Locale, Record<string, string>> = {
  de: flat.de.texts,
  en: flat.en.texts,
};

/** The placeholders of the texts that have some – German's: the code fills them. */
export const PLACEHOLDERS: Record<string, Placeholders> = flat.de.placeholders;

/**
 * Functions written by hand – they have no text to store, so they stay as
 * the code has them, outside the CMS, until they are templates.
 */
export const CODE_ONLY: string[] = [
  ...new Set([...flat.de.codeOnly, ...flat.en.codeOnly]),
];

/** Texts from the CMS, per language and key. */
export type Texts = Partial<Record<Locale, Record<string, string>>>;

const NO_PLACEHOLDERS: Placeholders = { known: [], required: [] };

/**
 * Whether a text from the CMS may stand in for the code's: a key the code
 * has, something in it, and the placeholders the code fills – no other, and
 * none missing (template.ts). Checked when saving in the admin, and again
 * here: a text that doesn't fit shows the code's instead.
 */
export const fits = (key: string, text: unknown): text is string =>
  typeof text === "string" &&
  Boolean(text.trim()) &&
  Object.hasOwn(CODE_TEXTS.de, key) &&
  checkPlaceholders(text, PLACEHOLDERS[key] ?? NO_PLACEHOLDERS) === true;

/**
 * Of the CMS's texts, those to show: the ones that fit and say something
 * else than the code – all a page has to carry, as the code's are in it
 * anyway.
 */
export const usableTexts = (texts: unknown): Texts => {
  const given = (texts ?? {}) as Partial<Record<Locale, unknown>>;
  const usable: Texts = {};
  for (const locale of LOCALES) {
    const own = given[locale];
    if (!own || typeof own !== "object") continue;
    const kept = Object.entries(own).filter(
      ([key, text]) => fits(key, text) && text !== CODE_TEXTS[locale][key]
    );
    if (kept.length) usable[locale] = Object.fromEntries(kept);
  }
  return usable;
};

/**
 * The CMS's texts in use – one set for everybody, like the stamp colors
 * (features/calendar/palette.ts). Set while rendering: in the browser and
 * for client components on the server by `TextsProvider`, for server
 * components by `getDictionary` (features/translations).
 */
let inUse: Texts = {};
let given = "{}";
const built = new Map<Locale, Dictionary>();

/**
 * Puts the CMS's texts in use. The same again changes nothing – not even
 * the dictionaries handed out, so rendering twice is fine.
 */
export const setTexts = (texts: unknown) => {
  const next = JSON.stringify(texts ?? {});
  if (next === given) return;
  given = next;
  inUse = usableTexts(texts);
  built.clear();
};

const own: Record<Locale, unknown> = { de, en };

/**
 * A language's texts, as the pages read them: the CMS's where it has one
 * that fits, the code's for the rest. Synchronous – the texts in use, see
 * the top of this file for when that is the CMS's. One object per language
 * until the texts change.
 */
export const dictionaryOf = (locale: Locale): Dictionary => {
  const known = built.get(locale);
  if (known) return known;
  const cms = inUse[locale] ?? {};
  const code = CODE_TEXTS[locale];
  const dictionary = build(
    de,
    own[locale],
    (key) => cms[key] ?? code[key] ?? CODE_TEXTS.de[key] ?? ""
  );
  built.set(locale, dictionary);
  return dictionary;
};
