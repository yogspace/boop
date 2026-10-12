"use client";

import { useCallback } from "react";

/**
 * How far (px) what scrolls fades out at an edge it goes on beyond – no
 * scrollbar, the fade says there is more. It grows with what is hidden
 * there, so it comes and goes smoothly as one scrolls.
 */
const FADE = 32;

/** Which way a scroller goes: across (`x`) or down (`y`). */
type Axis = "x" | "y";

/**
 * The fades at a scroller's two edges (px): where it starts and where it
 * ends, from how far it is scrolled (`at`), how long what is in it is
 * (`all`) and how much of that shows (`seen`). Never less than nothing – a
 * phone lets a scroller be pulled past its ends.
 */
export const fadesOf = (at: number, all: number, seen: number) => {
  const fade = (hidden: number) =>
    Math.round(Math.min(FADE, Math.max(0, hidden)));
  return [fade(at), fade(all - seen - at)] as const;
};

/**
 * The fading edges of a scroller – as `--fade-top` / `--fade-bottom`, or
 * `--fade-left` / `--fade-right` for one that goes across. They follow as
 * it scrolls, as it or what is in it changes size (a form opening, a
 * picture loading), and as things in it come and go.
 *
 * What it returns is the scroller's `ref` – a function, so the edges are
 * watched from whenever the scroller is there (it may come later than what
 * it is in), and let go of when it goes.
 */
export const useFadingEdges = <T extends HTMLElement = HTMLDivElement>(
  axis: Axis = "y"
) =>
  useCallback(
    (box: T | null) => {
      if (!box) return;
      const edges =
        axis === "x"
          ? (["--fade-left", "--fade-right"] as const)
          : (["--fade-top", "--fade-bottom"] as const);
      // Written only when they change: in the middle of a long scroll both
      // stay as they are.
      const shown = [-1, -1];
      const fade = () => {
        const fades =
          axis === "x"
            ? fadesOf(box.scrollLeft, box.scrollWidth, box.clientWidth)
            : fadesOf(box.scrollTop, box.scrollHeight, box.clientHeight);
        fades.forEach((px, i) => {
          if (px === shown[i]) return;
          shown[i] = px;
          box.style.setProperty(edges[i], `${px}px`);
        });
      };
      const sizes = new ResizeObserver(fade);
      const watch = () => {
        sizes.disconnect();
        sizes.observe(box);
        for (const child of box.children) sizes.observe(child);
        fade();
      };
      watch();
      box.addEventListener("scroll", fade, { passive: true });
      const children = new MutationObserver(watch);
      children.observe(box, { childList: true });
      return () => {
        box.removeEventListener("scroll", fade);
        sizes.disconnect();
        children.disconnect();
      };
    },
    [axis]
  );

/**
 * Scrolls without a bar, fading at the edges (`useFadingEdges`) – down, or
 * across. A mask cuts at the box's edge like a scroller does: where one
 * stops scrolling at a breakpoint and lets its frames reach out again, the
 * mask goes too (`sm:[mask-image:none]`).
 */
export const FADING = {
  y: "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_bottom,transparent,#000_var(--fade-top,0px),#000_calc(100%_-_var(--fade-bottom,0px)),transparent)]",
  x: "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_right,transparent,#000_var(--fade-left,0px),#000_calc(100%_-_var(--fade-right,0px)),transparent)]",
} as const;
