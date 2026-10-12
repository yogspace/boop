"use client";

import type { ReactNode } from "react";
import { setTexts, type Texts } from "@/i18n/dictionaries";

/**
 * Puts the CMS's texts in use for everything below – set right while
 * rendering, before any child reads one: the first render on the server and
 * the one in the browser already have them, so no text flashes, and the
 * static app page carries them – offline too, from the service worker's
 * copy. Setting the same texts again changes nothing (dictionaries.ts), so
 * rendering twice is fine. Like `PaletteProvider` for the stamp colors.
 *
 * Server components render before this: they `await getDictionary(locale)`
 * (get-texts.ts) instead.
 */
export const TextsProvider = ({
  texts,
  children,
}: {
  /** From the server: `getTexts()`. */
  texts: Texts;
  children: ReactNode;
}) => {
  setTexts(texts);
  return children;
};
