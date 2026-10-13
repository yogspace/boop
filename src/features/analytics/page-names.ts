// Relative, not `@/…`: the unit tests import this without the app's aliases.
import { isLocale } from "../../i18n/config";

/**
 * Names for the paths – for the admin and the mail report alike: “/en/app”
 * reads as “App (EN)”. Anything else (bots probing paths) keeps its path.
 */
export type PathName = { label: string; locale: string };

type Lang = "de" | "en";

/** The site's pages by their segment after the locale – "" is the start. */
const PAGES: Record<string, Record<Lang, string>> = {
  "": { en: "Home", de: "Start" },
  app: { en: "App", de: "App" },
  login: { en: "Login", de: "Anmelden" },
  register: { en: "Sign up", de: "Registrieren" },
  "forgot-password": { en: "Forgot password", de: "Passwort vergessen" },
  "reset-password": { en: "Reset password", de: "Passwort zurücksetzen" },
  verify: { en: "Verify", de: "Bestätigen" },
  "change-email": { en: "Change email", de: "Adresse ändern" },
  legal: { en: "Legal", de: "Rechtliches" },
};

export const pathName = (path: string, lang: Lang = "en"): PathName | null => {
  const match = path.match(/^\/([a-z]{2})(?:\/([a-z-]+))?\/?$/);
  if (!(match && isLocale(match[1]))) return null;
  const page = PAGES[match[2] ?? ""];
  return page ? { label: page[lang], locale: match[1] } : null;
};

/** “App (EN)” – for places that only take text. */
export const pathLabel = (path: string, lang: Lang = "en") => {
  const name = pathName(path, lang);
  return name ? `${name.label} (${name.locale.toUpperCase()})` : path;
};
