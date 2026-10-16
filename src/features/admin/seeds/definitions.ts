// Client-safe: the admin page imports this – no seed code may come in here.

/**
 * The seeds: what the code brings along for the CMS. They run from their own
 * admin page (seeds-view.tsx), not at start or deploy. “Fill” only adds what
 * is missing; “Replace” – where offered, behind a confirmation – sets it back
 * to the code's version.
 */
export const SEEDS = ["translations", "legal", "shapes", "templates"] as const;

export type SeedKey = (typeof SEEDS)[number];

export const isSeedKey = (value: unknown): value is SeedKey =>
  SEEDS.includes(value as SeedKey);

/** Seeds that can also reset what is there, behind a confirmation. */
export const seedCanReplace: Record<SeedKey, boolean> = {
  // Never: what is written in the admin wins (features/translations/seed.ts).
  translations: false,
  legal: true,
  shapes: true,
  templates: true,
};

/** The page's path in the admin. */
export const SEEDS_PATH = "/seeds";

export type SeedResponse = {
  summary?: string;
  error?: string;
};

export const SEED_TEXTS: Record<
  SeedKey,
  { title: string; description: string; replaceWarning?: string }
> = {
  translations: {
    title: "Translations",
    description:
      "Adds the texts the code has new, in German and English, and removes the ones it no longer has. Texts already there stay as they are.",
  },
  legal: {
    title: "Imprint & privacy",
    description:
      "The imprint and privacy policy as written in the code, in German and English. Fill only sets a language that has no text yet.",
    replaceWarning:
      "The imprint and privacy policy go back to the code's version in both languages. Edits made to them are lost.",
  },
  shapes: {
    title: "Stamp shapes",
    description:
      "The shapes a stamp can have, as the code draws them (Content → Stamp shapes). Fill adds the ones the list hasn't got – by key – at its end; the others stay as they are. While the list is empty, Fill first takes over the one Site had before – as it was; the next Fill adds the code's.",
    replaceWarning:
      "Content → Stamp shapes becomes the code's list again. Shapes added or changed in the admin are lost – stamps in a shape no longer there show in the first one.",
  },
  templates: {
    title: "Drawing templates",
    description:
      "The shapes to drag into a drawing, as the code draws them (Content → Drawing templates). Fill adds the ones the list hasn't got – by key – at its end; the others stay as they are. While the list is empty, Fill first takes over the one Site had before – as it was; the next Fill adds the code's.",
    replaceWarning:
      "Content → Drawing templates becomes the code's list again. Templates added or changed in the admin are lost.",
  },
};
