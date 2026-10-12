import type { MongooseAdapter } from "@payloadcms/db-mongodb";
import type { Payload } from "payload";
// Relative, not `@/…`: the unit tests import this without the app's aliases.
import { LOCALES } from "../../i18n/config";
import { CODE_ONLY, CODE_TEXTS, fits } from "../../i18n/dictionaries";
import { TRANSLATION_KEYS } from "./defaults";
import { setValueAt, storedPath, textAt } from "./tree";

/** What the database keeps beside the texts. */
const META = new Set([
  "_id",
  "id",
  "globalType",
  "createdAt",
  "updatedAt",
  "__v",
]);

/**
 * The paths in a stored Translations document that no key in the code
 * leads to any more – a whole group at once where none of it is used.
 */
export const unusedIn = (
  doc: Record<string, unknown>,
  keys: readonly string[]
): string[] => {
  const leaves = new Set(keys.map(storedPath));
  const groups = new Set(
    [...leaves].flatMap((path) => {
      const segments = path.split(".");
      return segments
        .slice(0, -1)
        .map((_, i) => segments.slice(0, i + 1).join("."));
    })
  );
  const unused: string[] = [];
  const walk = (node: Record<string, unknown>, prefix: string) => {
    for (const [name, value] of Object.entries(node)) {
      if (!prefix && META.has(name)) continue;
      const path = prefix ? `${prefix}.${name}` : name;
      if (leaves.has(path)) continue;
      if (groups.has(path) && value && typeof value === "object") {
        walk(value as Record<string, unknown>, path);
      } else unused.push(path);
    }
  };
  walk(doc, "");
  return unused;
};

/**
 * The stored texts the code no longer has. Payload no longer shows them
 * (the fields come from the code) – but they stay in the database until
 * deleted. Read raw: a removed key is no field any more.
 */
const unusedPaths = async (payload: Payload): Promise<string[]> => {
  const { globals } = payload.db as unknown as MongooseAdapter;
  const doc = await globals.collection.findOne({ globalType: "translations" });
  return doc ? unusedIn(doc as Record<string, unknown>, TRANSLATION_KEYS) : [];
};

export type TranslationSeedResult = {
  /** “de:app.hello.named” – filled with the code's text. */
  added: string[];
  /** Stored paths the code no longer has – deleted. */
  removed: string[];
  /** Texts that were there – left as they are. */
  kept: number;
  /** Of those, the ones that don't fit the code's placeholders (any more). */
  misfits: string[];
  /** Functions written by hand in the dictionary – not in the CMS. */
  codeOnly: string[];
};

/**
 * Aligns the Translations global with the code: a new key gets the code's
 * text, per language; a key the code no longer has is deleted, in both
 * languages. Existing texts are NEVER overwritten – what is written in the
 * admin is the deliberate choice and beats the code's text. One that no
 * longer fits the code's placeholders stays too, and is named: the site
 * shows the code's text for it until it is fixed in the admin.
 */
export const syncTranslations = async (
  payload: Payload
): Promise<TranslationSeedResult> => {
  const added: string[] = [];
  const misfits: string[] = [];
  let kept = 0;

  for (const locale of LOCALES) {
    // Without language fallback: otherwise an empty English field would
    // come back with the German text, look filled and never be filled.
    const doc = await payload.findGlobal({
      slug: "translations",
      locale,
      fallbackLocale: false,
      depth: 0,
      overrideAccess: true,
    });

    const missing = TRANSLATION_KEYS.filter((key) => !textAt(doc, key)?.trim());
    kept += TRANSLATION_KEYS.length - missing.length;
    added.push(...missing.map((key) => `${locale}:${key}`));
    misfits.push(
      ...TRANSLATION_KEYS.filter((key) => {
        const text = textAt(doc, key);
        return text?.trim() && !fits(key, text);
      }).map((key) => `${locale}:${key}`)
    );
    if (!missing.length) continue;

    // Every text, as stored or the code's – untouched ones pass the
    // placeholder check as they are (tree.ts).
    const data: Record<string, unknown> = {};
    for (const key of TRANSLATION_KEYS) {
      const stored = textAt(doc, key);
      setValueAt(data, key, stored?.trim() ? stored : CODE_TEXTS[locale][key]);
    }
    await payload.updateGlobal({
      slug: "translations",
      locale,
      data,
      depth: 0,
      overrideAccess: true,
    });
  }

  const removed = await unusedPaths(payload);
  if (removed.length) {
    const { globals } = payload.db as unknown as MongooseAdapter;
    await globals.collection.updateOne(
      { globalType: "translations" },
      { $unset: Object.fromEntries(removed.map((path) => [path, ""])) }
    );
  }
  return { added, removed, kept, misfits, codeOnly: CODE_ONLY };
};
