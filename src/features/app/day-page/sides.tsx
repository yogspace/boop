"use client";

import { m } from "motion/react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { SPRING } from "@/components/motion";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";

/**
 * A day's page and its note on a phone (day-page.tsx): side by side in a
 * row that snaps, a swipe or a tap on the switch over them apart.
 */

/** What a phone shows of a day: its page, or its note. */
export type Side = "page" | "note";

/**
 * The row the page and the note lie in (`sides`, the note's in `note`),
 * which one is in sight – followed as the row is swiped – and the way to
 * the other (`showSide`). With room for both, one under the other, nothing
 * scrolls: the page.
 */
export const useSides = () => {
  const sides = useRef<HTMLDivElement>(null);
  const note = useRef<HTMLDivElement>(null);
  const [side, setSide] = useState<Side>("page");
  useEffect(() => {
    const box = sides.current;
    if (!box) return;
    const follow = () => {
      const far = box.scrollWidth - box.clientWidth;
      setSide(far > 0 && box.scrollLeft > far / 2 ? "note" : "page");
    };
    const sizes = new ResizeObserver(follow);
    sizes.observe(box);
    box.addEventListener("scroll", follow, { passive: true });
    return () => {
      sizes.disconnect();
      box.removeEventListener("scroll", follow);
    };
  }, []);
  /** Glides to the page or the note – no focus in it: no keyboard comes up. */
  const showSide = useCallback((to: Side) => {
    const box = sides.current;
    box?.scrollTo({
      left: to === "note" ? box.scrollWidth : 0,
      behavior: "smooth",
    });
  }, []);
  /**
   * Back to the page, should the note be in sight – a stamp taken to stamp
   * with. The note lets go of the focus, so a phone's keyboard goes down.
   * One under the other, nothing happens.
   */
  const toPage = useCallback(() => {
    const box = sides.current;
    if (!box) return;
    const far = box.scrollWidth - box.clientWidth;
    if (!(far > 0 && box.scrollLeft > far / 2)) return;
    const at = document.activeElement;
    if (at instanceof HTMLElement && note.current?.contains(at)) at.blur();
    showSide("page");
  }, [showSide]);
  return { sides, note, side, showSide, toPage };
};

/**
 * Which of the two shows on a phone – a pill like the views'
 * (view-switch.tsx), smaller, the stroke behind the one in sight. A dot by
 * the note's word once something is written in it.
 */
export const SideSwitch = ({
  side,
  noted,
  locale,
  onPick,
  className,
}: {
  side: Side;
  noted: boolean;
  locale: Locale;
  onPick: (side: Side) => void;
  className?: string;
}) => {
  const t = dictionaryOf(locale).app.day;
  // Its own stroke – the today view's may lie under a day's sheet.
  const mark = useId();
  return (
    <fieldset
      className={cn(
        "scribble scribble-sm scribble-thin scribble-clear flex w-fit shrink-0 gap-0.5 rounded-full p-1",
        className
      )}
    >
      <legend className="sr-only">{t.sides}</legend>
      {(["page", "note"] as const).map((each) => (
        <button
          aria-label={each === "note" && noted ? t.noted : undefined}
          aria-pressed={side === each}
          className={cn(
            "relative isolate flex items-center gap-1 rounded-full px-3 py-1 font-bold text-sm transition-colors",
            side === each ? "text-ink" : "text-muted hover:text-ink"
          )}
          key={each}
          onClick={() => onPick(each)}
          type="button"
        >
          {side === each && (
            <m.span
              aria-hidden="true"
              className="scribble scribble-bare scribble-sm absolute inset-0 -z-10 -rotate-1 rounded-full [--scribble-fill:var(--cal-mark,var(--color-soft))]"
              layoutId={mark}
              transition={SPRING.soft}
            />
          )}
          {t[each]}
          {each === "note" && noted && (
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 rounded-full bg-current"
            />
          )}
        </button>
      ))}
    </fieldset>
  );
};
