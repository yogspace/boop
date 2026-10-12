import { type Placeholders, partsOf, resolve, Template } from "./template";

/**
 * The dictionary as a flat list of keys – what the CMS stores and edits –
 * and back into the nested thing the pages read.
 *
 * Every dot is a level: `app.draw.title`. A list counts its entries,
 * `app.months.0` … `app.months.11`, and stays as long as the code has it. A
 * template (template.ts) is its wording, or one key per variant:
 * `app.hello.named`. A function written by hand has no text to store – it
 * stays what the code says, listed in `codeOnly`.
 */

/** A dictionary as the pages read it: templates are what they make. */
export type Resolved<T> =
  T extends Template<infer _W, infer R>
    ? R
    : T extends (...args: never[]) => unknown
      ? T
      : T extends readonly (infer Item)[]
        ? Resolved<Item>[]
        : T extends object
          ? { [K in keyof T]: Resolved<T[K]> }
          : T;

/**
 * What another language has to bring: the same keys as German, with its own
 * texts – for a template only the wording(s).
 */
export type Shape<T> =
  T extends Template<infer W, infer _R>
    ? W extends string
      ? string
      : { [Variant in keyof W]: string }
    : T extends (...args: infer Args) => infer Result
      ? (...args: Args) => Result
      : T extends readonly (infer Item)[]
        ? Shape<Item>[]
        : T extends object
          ? { [K in keyof T]: Shape<T[K]> }
          : T extends string
            ? string
            : T;

export type Flat = {
  /** Every text by its key, in the dictionary's order. */
  texts: Record<string, string>;
  /** The placeholders of the texts that have a say in theirs. */
  placeholders: Record<string, Placeholders>;
  /** Functions written by hand – not in the CMS until they are templates. */
  codeOnly: string[];
};

const under = (key: string, name: string | number) =>
  key ? `${key}.${name}` : String(name);

const childOf = (node: unknown, name: string | number): unknown =>
  node && typeof node === "object"
    ? (node as Record<string | number, unknown>)[name]
    : undefined;

/** A dictionary – German's with its templates, or another's plain texts. */
export const flatten = (dictionary: unknown): Flat => {
  const flat: Flat = { texts: {}, placeholders: {}, codeOnly: [] };
  const walk = (node: unknown, key: string) => {
    if (typeof node === "string") {
      flat.texts[key] = node;
    } else if (node instanceof Template) {
      for (const part of partsOf(key, node)) {
        flat.texts[part.key] = part.text;
        flat.placeholders[part.key] = part.placeholders;
      }
    } else if (typeof node === "function") {
      flat.codeOnly.push(key);
    } else if (Array.isArray(node)) {
      node.forEach((item, index) => {
        walk(item, under(key, index));
      });
    } else if (node && typeof node === "object") {
      for (const [name, value] of Object.entries(node)) {
        walk(value, under(key, name));
      }
    }
  };
  walk(dictionary, "");
  return flat;
};

/**
 * The dictionary the pages read, in German's shape: every text is what
 * `textOf` says for its key, a template makes its function (or text) around
 * that, a list is as long as German's. `own` is the language's own
 * dictionary – for what has no key: a function written by hand is taken
 * from there.
 */
export const build = <T>(
  shape: T,
  own: unknown,
  textOf: (key: string) => string
): Resolved<T> => {
  const walk = (node: unknown, mine: unknown, key: string): unknown => {
    if (typeof node === "string") return textOf(key);
    if (node instanceof Template) return resolve(key, node, textOf);
    if (typeof node === "function") {
      return typeof mine === "function" ? mine : node;
    }
    if (Array.isArray(node)) {
      return node.map((item, index) =>
        walk(item, childOf(mine, index), under(key, index))
      );
    }
    if (node && typeof node === "object") {
      return Object.fromEntries(
        Object.entries(node).map(([name, value]) => [
          name,
          walk(value, childOf(mine, name), under(key, name)),
        ])
      );
    }
    return mine ?? node;
  };
  return walk(shape, own, "") as Resolved<T>;
};
