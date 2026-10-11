// Client-safe: for the footer, the page's metadata, anywhere that links here.
import type { Locale } from "@/i18n/config";

/** The legal page's name – its heading, its title and the footer link. */
export const LEGAL_TITLE: Record<Locale, string> = {
  de: "Impressum & Datenschutz",
  en: "Imprint & privacy",
};

export const LEGAL_DESCRIPTION: Record<Locale, string> = {
  de: "Wer hinter Boop steht und welche Daten Boop wofür verarbeitet.",
  en: "Who is behind Boop and which data Boop processes, and why.",
};

/** The legal page in a language – /de/legal, /en/legal. */
export const legalPath = (locale: Locale) => `/${locale}/legal`;
