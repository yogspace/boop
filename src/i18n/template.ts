/**
 * Texts with placeholders – “Hallo {name}!” – for what would otherwise be a
 * function in the dictionary: the wording is plain text, so it can be edited
 * in the CMS (the “Translations” global stores it as it stands here, braces
 * and all), and the logic around it stays in the code.
 *
 * In German, the dictionary's shape (dictionaries.ts):
 *
 *   hello: template(
 *     { named: "Hallo {name}!", unnamed: "Hallo!" },
 *     (say) => (name: string) => (name ? say.named({ name }) : say.unnamed())
 *   ),
 *
 * First the wording – one, or several by name (one / many, with a name /
 * without), each a key of its own for the CMS: `app.hello.named`. Then what
 * the callers get, here a function of the name – `t.app.hello(name)`, as if
 * it were written by hand. `say` fills a wording's placeholders and takes
 * exactly those the German text names: a typo doesn't compile. A constant
 * (the days an invitation lasts) is a placeholder too, filled by the code –
 * with nothing left to pass, the entry is a plain string for its callers.
 *
 * The other languages bring the wordings only:
 *
 *   hello: { named: "Hi {name}!", unnamed: "Hi!" },
 *
 * A text from the CMS has to name the placeholders the German one does
 * (`checkPlaceholders`): one the code doesn't fill would show as it is,
 * braces and all, and a missing one drops what the sentence is about.
 */

/** What may go into a placeholder. */
type Value = string | number;

/** The placeholders a text names: "{name}, {when}" → "name" | "when". */
type Names<Text extends string> =
  Text extends `${string}{${infer Name}}${infer Rest}`
    ? Name | Names<Rest>
    : never;

/** Fills one wording – with exactly its placeholders, or nothing at all. */
type Say<Text extends string> = [Names<Text>] extends [never]
  ? () => string
  : (values: Record<Names<Text>, Value>) => string;

/** One wording, or several by name. */
export type Wordings = string | Readonly<Record<string, string>>;

type SayAll<W extends Wordings> = W extends string
  ? Say<W>
  : { [Variant in keyof W]: Say<W[Variant] & string> };

/** Every text of the wordings, to name their placeholders. */
type TextOf<W extends Wordings> = W extends string ? W : W[keyof W] & string;

/** What the callers get: a function giving the text, or the text itself. */
type Made = string | ((...args: never[]) => string);

export class Template<W extends Wordings = Wordings, R = unknown> {
  constructor(
    /** The code's own wording(s), in German. */
    readonly wordings: W,
    /** Builds what the callers get, around whatever wording is in use. */
    readonly make: (say: SayAll<W>) => R,
    /** Placeholders a text from the CMS may leave out. */
    readonly optional: readonly string[]
  ) {}
}

/** Any template, whatever it makes – for what only takes it apart. */
type SomeTemplate = Pick<Template, "wordings" | "optional"> & {
  make: (say: never) => unknown;
};

/**
 * A text with placeholders, for the German dictionary (see above).
 * `optional`: placeholders a text from the CMS may do without – the others
 * are needed.
 */
export const template = <const W extends Wordings, R extends Made>(
  wordings: W,
  make: (say: SayAll<W>) => R,
  { optional = [] }: { optional?: Names<TextOf<W>>[] } = {}
): Template<W, R> => new Template(wordings, make, optional);

const PLACEHOLDER = /\{(\w+)\}/g;

/** The placeholders a text names, each once. */
export const placeholdersOf = (text: string): string[] => [
  ...new Set(Array.from(text.matchAll(PLACEHOLDER), (match) => match[1])),
];

/** A text with its placeholders filled – one without a value stays. */
export const fill = (
  text: string,
  values: Readonly<Record<string, Value>> = {}
): string =>
  text.replace(PLACEHOLDER, (whole, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : whole
  );

/** Which placeholders a text has to do with. */
export type Placeholders = {
  /** The ones the code fills – any other would show as it is. */
  known: string[];
  /** The ones a text can't do without. */
  required: string[];
};

/** A template's wordings by key: its own for one, `key.variant` for several. */
const wordingsOf = (
  key: string,
  { wordings }: SomeTemplate
): [string, string][] =>
  typeof wordings === "string"
    ? [[key, wordings]]
    : Object.entries(wordings).map(([variant, text]) => [
        `${key}.${variant}`,
        text,
      ]);

/**
 * A template taken apart for the CMS: its wordings by key, and the
 * placeholders each has – those its own text names, all needed unless the
 * template says otherwise.
 */
export const partsOf = (
  key: string,
  made: SomeTemplate
): { key: string; text: string; placeholders: Placeholders }[] =>
  wordingsOf(key, made).map(([part, text]) => {
    const known = placeholdersOf(text);
    return {
      key: part,
      text,
      placeholders: {
        known,
        required: known.filter((name) => !made.optional.includes(name)),
      },
    };
  });

/**
 * What the callers get from a template, with the wordings in use – the
 * code's own, or the CMS's (`textOf` says which, by key).
 */
export const resolve = (
  key: string,
  made: SomeTemplate,
  textOf: (key: string) => string
): unknown => {
  const say = (part: string) => (values?: Record<string, Value>) =>
    fill(textOf(part), values);
  const { wordings } = made;
  return made.make(
    (typeof wordings === "string"
      ? say(key)
      : Object.fromEntries(
          Object.keys(wordings).map((variant) => [
            variant,
            say(`${key}.${variant}`),
          ])
        )) as never
  );
};

const braced = (names: string[]) => names.map((name) => `{${name}}`).join(", ");

/**
 * Whether a text can stand in for the code's: `true`, or what is wrong with
 * it – in words for the admin, where it is the field's validation. The same
 * check runs before a page uses a text from the CMS (dictionaries.ts).
 */
export const checkPlaceholders = (
  text: string,
  { known, required }: Placeholders
): true | string => {
  const named = placeholdersOf(text);
  const unknown = named.filter((name) => !known.includes(name));
  if (unknown.length) {
    return `${braced(unknown)} is not filled here – ${
      known.length
        ? `this text knows ${braced(known)}`
        : "this text has no placeholders"
    }.`;
  }
  // “{name” or “{ name }”: meant as a placeholder, but not one.
  if (/[{}]/.test(text.replace(PLACEHOLDER, ""))) {
    return "A placeholder is a name in braces, like {name} – here a brace is left over.";
  }
  const missing = required.filter((name) => !named.includes(name));
  if (missing.length) return `${braced(missing)} is missing.`;
  return true;
};
