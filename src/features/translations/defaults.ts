// Relative, not `@/…`: the unit tests import this without the app's aliases.
import { LOCALES, type Locale } from "../../i18n/config";
import { CODE_TEXTS } from "../../i18n/dictionaries";

/**
 * The texts as the code writes them (i18n/dictionaries.ts) – the SEED of the
 * Translations global, flat by key: “app.draw.title”, a list's entries
 * `app.months.0`, a template's wordings `app.hello.named` (i18n/flat.ts).
 *
 * The keys are also the global's FIELDS (tree.ts): a new key in the code is
 * a field in the admin right away; the Seeds page fills it with its text
 * from here and deletes keys that are gone (seed.ts). What is written in the
 * admin is never overwritten.
 */
export const TRANSLATION_KEYS: readonly string[] = Object.keys(CODE_TEXTS.de);

/** Each key's text in every language. */
export const TRANSLATION_DEFAULTS: Record<
  string,
  Record<Locale, string>
> = Object.fromEntries(
  TRANSLATION_KEYS.map((key) => [
    key,
    Object.fromEntries(
      LOCALES.map((locale) => [
        locale,
        CODE_TEXTS[locale][key] ?? CODE_TEXTS.de[key],
      ])
    ) as Record<Locale, string>,
  ])
);
