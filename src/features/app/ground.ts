"use client";

import { useEffect, useRef } from "react";

/** How long one ground takes to turn into the next (ms). */
const BLEND = 450;

/** A color's red, green and blue, 0–255 each. */
type Rgb = readonly [number, number, number];

/** #rgb or #rrggbb as its three parts – anything else is paper white. */
export const rgbOf = (hex: string): Rgb => {
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(hex);
  const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  const parts = short
    ? short.slice(1).map((part) => part + part)
    : (long?.slice(1) ?? ["ff", "ff", "ff"]);
  const [r, g, b] = parts.map((part) => Number.parseInt(part, 16));
  return [r, g, b];
};

/** The color `amount` (0–1) of the way from one to the other. */
export const mixOf = (from: Rgb, to: Rgb, amount: number): Rgb => {
  const part = (i: 0 | 1 | 2) =>
    Math.round(from[i] + (to[i] - from[i]) * amount);
  return [part(0), part(1), part(2)];
};

/** Setting off at once, arriving softly. */
const ease = (t: number) => 1 - (1 - t) ** 3;

/**
 * The ground the whole app lies on, in the chosen calendar's color (`color`:
 * its `bg` shade, tint.ts – null: paper white, as everywhere else). Not a
 * box: the page's own background (`--color-bg`, which `html` and `body`
 * wear – styles.css), so it also shows when scrolling past the ends and in
 * the safe areas of the installed app; the browser's bar follows
 * (`theme-color`). Only the veil behind a sheet uses `--color-bg` besides –
 * it lets the tone show through.
 *
 * Set on the root element while the app is there, and taken off again when
 * it goes – the other pages stay white:
 *
 *   --color-bg         the color, at once – for whatever reads the token
 *   background-color   on `html` and `body`, only while one ground turns
 *                      into the next (and white into the first): the colors
 *                      in between, written frame by frame
 *
 * Blended by hand: a transition would be less to write, but a phone's
 * Safari doesn't blend a variable a background reads – it jumps. Colors
 * written out one after the other blend everywhere. The veil, an element
 * like any other, blends by itself (sheet.tsx).
 *
 * Only another color sets it off: the first one to show comes in from
 * white, and a change of language – in place, nothing is built anew – leaves
 * the ground as it is. Whoever asked for less motion gets the color at once.
 */
export const useGround = (color: string | null) => {
  // The page as it was found, and the ground as it shows right now – a
  // blend under way hands over to the next one from there.
  const ground = useRef<{
    paper: string;
    theme: string;
    now: Rgb;
    frame: number;
  } | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    const theme = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]'
    );
    const paper =
      getComputedStyle(root).getPropertyValue("--color-bg").trim() || "#ffffff";
    const found = {
      paper,
      theme: theme?.content ?? paper,
      now: rgbOf(paper),
      frame: 0,
    };
    ground.current = found;
    return () => {
      cancelAnimationFrame(found.frame);
      ground.current = null;
      root.style.removeProperty("--color-bg");
      root.style.removeProperty("background-color");
      document.body.style.removeProperty("background-color");
      if (theme) theme.content = found.theme;
    };
  }, []);

  useEffect(() => {
    const found = ground.current;
    if (!found) return;
    const root = document.documentElement;
    const theme = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]'
    );
    if (color) root.style.setProperty("--color-bg", color);
    else root.style.removeProperty("--color-bg");
    if (theme) theme.content = color ?? found.theme;

    /** The ground in this color – or (null) in the token's again. */
    const wear = (rgb: Rgb | null) => {
      for (const { style } of [root, document.body]) {
        if (rgb) style.setProperty("background-color", `rgb(${rgb.join()})`);
        else style.removeProperty("background-color");
      }
    };
    cancelAnimationFrame(found.frame);
    found.frame = 0;
    const from = found.now;
    const to = rgbOf(color ?? found.paper);
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (still || from.every((part, i) => part === to[i])) {
      found.now = to;
      wear(null);
      return;
    }
    // The token has changed already – the ground sets off from where it is.
    wear(from);
    const start = performance.now();
    const step = (time: number) => {
      const t = Math.min(1, Math.max(0, time - start) / BLEND);
      found.now = mixOf(from, to, ease(t));
      // Arrived: the token's color is the ground's again.
      wear(t < 1 ? found.now : null);
      found.frame = t < 1 ? requestAnimationFrame(step) : 0;
    };
    found.frame = requestAnimationFrame(step);
  }, [color]);
};
