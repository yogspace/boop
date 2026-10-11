// Client-safe: the admin page imports this – no seed code may come in here.

/**
 * The seeds: what the code brings along for the CMS. They run from their own
 * admin page (seeds-view.tsx), not at start or deploy. “Fill” only adds what
 * is missing; “Replace” – where offered, behind a confirmation – sets it back
 * to the code's version.
 */
export const SEEDS = ["legal"] as const;

export type SeedKey = (typeof SEEDS)[number];

export const isSeedKey = (value: unknown): value is SeedKey =>
  SEEDS.includes(value as SeedKey);

/** Seeds that can also reset what is there, behind a confirmation. */
export const seedCanReplace: Record<SeedKey, boolean> = {
  legal: true,
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
  legal: {
    title: "Imprint & privacy",
    description:
      "The imprint and privacy policy as written in the code, in German and English. Fill only sets a language that has no text yet.",
    replaceWarning:
      "The imprint and privacy policy go back to the code's version in both languages. Edits made to them are lost.",
  },
};
