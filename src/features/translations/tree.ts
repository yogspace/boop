import type { Field } from "payload";
// Relative, not `@/…`: the unit tests import this without the app's aliases.
import { LOCALES, type Locale } from "../../i18n/config";
import { checkPlaceholders, type Placeholders } from "../../i18n/template";

/**
 * The text keys as a tree – for the global's fields and back. Every dot is
 * a group level: `app.draw.title` is the field `title` in the group `draw`
 * in `app`. The keys in the code stay the same – stored nested, read flat
 * again.
 *
 * Without runtime imports from Payload: the config, the seed and the pages
 * all need this file.
 */
type Tree = { [segment: string]: Tree | string };

/**
 * Names a stored document can't have as its own: Mongoose's (a field
 * called `errors`, `on` or `remove` breaks validating and saving – its
 * documents have members of these names) and Payload's next to the data.
 * Such a segment is stored as `remove_`; the key in the code and the label
 * in the admin stay the same.
 */
const RESERVED = new Set([
  // Payload's and MongoDB's own
  "_id",
  "__v",
  "id",
  "globalType",
  "createdAt",
  "updatedAt",
  // Mongoose's, and the members of its (sub)documents
  "addListener",
  "collection",
  "constructor",
  "db",
  "deleteOne",
  "depopulate",
  "directModifiedPaths",
  "emit",
  "equals",
  "errors",
  "get",
  "getChanges",
  "init",
  "inspect",
  "invalidate",
  "isDirectModified",
  "isDirectSelected",
  "isInit",
  "isModified",
  "isNew",
  "isSelected",
  "listeners",
  "markModified",
  "modifiedPaths",
  "on",
  "once",
  "overwrite",
  "ownerDocument",
  "parent",
  "populate",
  "populated",
  "prototype",
  "remove",
  "removeAllListeners",
  "removeListener",
  "replaceOne",
  "save",
  "schema",
  "set",
  "setMaxListeners",
  "toBSON",
  "toJSON",
  "toObject",
  "toString",
  "unmarkModified",
  "updateOne",
  "validate",
  "validateSync",
]);

const INDEX = /^\d+$/;

/**
 * A segment's name in the database. A list's entries count – `months.0` –
 * and a bare number would turn the group into an array on its way through
 * Payload: stored as `_0`.
 */
const fieldName = (segment: string) => {
  if (INDEX.test(segment)) return `_${segment}`;
  return RESERVED.has(segment) ? `${segment}_` : segment;
};

/** What the admin calls a segment – a list's entries from 1, like people count. */
const labelOf = (segment: string) =>
  INDEX.test(segment) ? String(Number(segment) + 1) : segment;

/**
 * Builds the tree; a leaf carries the full key. A key that is also the
 * prefix of another (“a.b” next to “a.b.c”) would be a field AND a group in
 * the same place – that throws here, at start, instead of silently dropping
 * one of the texts later. So does a key whose stored name another one has
 * already (“on” next to “on_”).
 */
export const buildTree = (keys: readonly string[]): Tree => {
  const root: Tree = {};
  const stored = new Map<string, string>();
  for (const key of keys) {
    const path = storedPath(key);
    const other = stored.get(path);
    if (other !== undefined) {
      throw new Error(`Translation keys collide: ${other} and ${key}`);
    }
    stored.set(path, key);
    const segments = key.split(".");
    let node = root;
    segments.forEach((segment, index) => {
      const existing = node[segment];
      if (index === segments.length - 1) {
        if (existing !== undefined) {
          throw new Error(`Translation key collides with a group: ${key}`);
        }
        node[segment] = key;
        return;
      }
      if (typeof existing === "string") {
        throw new Error(`Translation key collides with a group: ${existing}`);
      }
      node[segment] = existing ?? {};
      node = node[segment] as Tree;
    });
  }
  return root;
};

const braced = (names: readonly string[]) =>
  names.map((name) => `{${name}}`).join(", ");

/**
 * A field's check, for the admin: the placeholders its text has to keep
 * (template.ts). A text stored before the code changed its placeholders
 * passes as long as it is not touched – saving another field must not fail
 * over it; the site shows the code's text for it meanwhile.
 */
const placeholderCheck =
  (placeholders: Placeholders) =>
  (value: unknown, { previousValue }: { previousValue?: unknown }) => {
    if (typeof value !== "string" || !value.trim()) return true;
    if (value === previousValue) return true;
    return checkPlaceholders(value, placeholders);
  };

const NO_PLACEHOLDERS: Placeholders = { known: [], required: [] };

/**
 * The global's fields from the keys. The top level as a collapsible section
 * (closed when opening – otherwise hundreds of fields would stand one below
 * the other), in it an unnamed-looking group that nests the data. Deeper
 * levels as ordinary groups with a title.
 *
 * Under every field the code's text in both languages – whoever changes a
 * text sees what it started from and can restore it after a mistake – and
 * the placeholders it may use.
 */
export const translationFields = (
  keys: readonly string[],
  defaults: Record<string, Partial<Record<Locale, string>>>,
  placeholders: Record<string, Placeholders> = {}
): Field[] => {
  const leaf = (segment: string, key: string): Field => {
    const texts = defaults[key] ?? {};
    const own = placeholders[key] ?? NO_PLACEHOLDERS;
    const optional = own.known.filter((name) => !own.required.includes(name));
    const description = [
      ...LOCALES.flatMap((locale) =>
        texts[locale] === undefined
          ? []
          : [`${locale.toUpperCase()}: ${texts[locale]}`]
      ),
      ...(own.required.length ? [`Keeps ${braced(own.required)}`] : []),
      ...(optional.length ? [`May use ${braced(optional)}`] : []),
    ].join("  ·  ");
    const field = {
      name: fieldName(segment),
      label: labelOf(segment),
      localized: true,
      validate: placeholderCheck(own),
      admin: { description: description || undefined },
    } as const;
    // Longer texts get room for more than one line.
    return Object.values(texts).some((text) => (text?.length ?? 0) > 80)
      ? { ...field, type: "textarea" }
      : { ...field, type: "text" };
  };

  const children = (tree: Tree, depth: number): Field[] =>
    Object.entries(tree).map(([segment, value]) => {
      if (typeof value === "string") return leaf(segment, value);
      const group: Field = {
        name: fieldName(segment),
        type: "group",
        label: depth === 0 ? false : labelOf(segment),
        admin: depth === 0 ? { hideGutter: true } : undefined,
        fields: children(value, depth + 1),
      };
      if (depth > 0) return group;
      return {
        type: "collapsible",
        label: segment,
        admin: { initCollapsed: true },
        fields: [group],
      };
    });

  return children(buildTree(keys), 0);
};

/** Where a key is stored: “app.draw.title”; `app.months._0`, `app.save_`. */
export const storedPath = (key: string) =>
  key.split(".").map(fieldName).join(".");

/** What is stored at a key – a text, or with every language `{ de, en }`. */
export const valueAt = (data: unknown, key: string): unknown => {
  let node: unknown = data;
  for (const segment of key.split(".")) {
    if (!node || typeof node !== "object") return;
    node = (node as Record<string, unknown>)[fieldName(segment)];
  }
  return node;
};

/** The text at a key, in one language's document. */
export const textAt = (data: unknown, key: string): string | undefined => {
  const value = valueAt(data, key);
  return typeof value === "string" ? value : undefined;
};

/** Sets a value at a key, creating missing levels. */
export const setValueAt = (
  data: Record<string, unknown>,
  key: string,
  value: string
): void => {
  const segments = key.split(".").map(fieldName);
  let node = data;
  for (const segment of segments.slice(0, -1)) {
    const next = node[segment];
    if (!next || typeof next !== "object") node[segment] = {};
    node = node[segment] as Record<string, unknown>;
  }
  node[segments[segments.length - 1]] = value;
};

/**
 * The stored texts, flat again as the code reads them, per language – from
 * the document with every language (`locale: "all"`). Only the known keys
 * (not `id`, `updatedAt` …), and without empty ones, so the page falls back
 * to the code's text instead of showing nothing. Not trimmed: a text may end
 * in a space on purpose (“Jeder Tag verdient einen ”).
 */
export const storedTexts = (
  data: unknown,
  keys: readonly string[]
): Record<Locale, Record<string, string>> => {
  const texts = Object.fromEntries(
    LOCALES.map((locale) => [locale, {} as Record<string, string>])
  ) as Record<Locale, Record<string, string>>;
  for (const key of keys) {
    const value = valueAt(data, key);
    if (!value || typeof value !== "object") continue;
    for (const locale of LOCALES) {
      const text = (value as Partial<Record<Locale, unknown>>)[locale];
      if (typeof text === "string" && text.trim()) texts[locale][key] = text;
    }
  }
  return texts;
};
