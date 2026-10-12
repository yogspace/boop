"use client";

import { createContext, type ReactNode, use } from "react";
import {
  DEFAULT_PALETTE,
  getPalette,
  type StampColor,
  setPalette,
} from "./palette";

const PaletteContext = createContext<readonly StampColor[]>(DEFAULT_PALETTE);

/**
 * Puts the CMS's stamp colors in use for everything below – set right while
 * rendering, before any child draws: the first render on the server and the
 * one in the browser already have them, so no color flashes. Setting the
 * same colors again changes nothing (palette.ts), so rendering twice is fine.
 */
export const PaletteProvider = ({
  colors,
  children,
}: {
  /** From the server: `getSite().stampColors`. */
  colors: readonly StampColor[];
  children: ReactNode;
}) => {
  setPalette(colors);
  return <PaletteContext value={getPalette()}>{children}</PaletteContext>;
};

/**
 * The colors to pick from – for what lists them (pickers, ink pads), so it
 * draws anew when they change. A single color's hex or name needs no hook:
 * `hexOf`, `colorName` (palette.ts).
 */
export const usePalette = () => use(PaletteContext);
