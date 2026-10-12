"use client";

import { m } from "motion/react";
import { SPRING } from "@/components/motion";
import type { CalendarView } from "@/features/offline/store";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";

/** The views, in the switch's order – today first. */
const VIEWS = ["today", "month"] as const satisfies readonly CalendarView[];

/**
 * A calendar's two views side by side in a drawn pill: today's page and the
 * month. The one showing is marked with the highlighter, in the calendar's
 * color (`--cal-mark`, like its name beside it) – picked, the stroke slides
 * over to the other.
 */
export const ViewSwitch = ({
  view,
  locale,
  onPick,
  className,
}: {
  view: CalendarView;
  locale: Locale;
  onPick: (view: CalendarView) => void;
  className?: string;
}) => {
  const t = dictionaryOf(locale);
  return (
    <div
      aria-label={t.app.view.label}
      className={cn(
        "scribble scribble-sm scribble-thin scribble-clear flex w-fit shrink-0 gap-0.5 rounded-full p-1",
        className
      )}
      role="group"
    >
      {VIEWS.map((v) => (
        <button
          aria-pressed={view === v}
          className={cn(
            "relative isolate rounded-full px-3.5 py-1.5 font-bold text-sm transition-colors",
            view === v ? "text-ink" : "text-muted hover:text-ink"
          )}
          key={v}
          onClick={() => onPick(v)}
          type="button"
        >
          {view === v && (
            // The stroke lies a little askew behind the word, as drawn by
            // hand – where none is set, paper grey.
            <m.span
              aria-hidden="true"
              className="scribble scribble-bare scribble-sm absolute inset-0 -z-10 -rotate-1 rounded-full [--scribble-fill:var(--cal-mark,var(--color-soft))]"
              layoutId="view-mark"
              transition={SPRING.soft}
            />
          )}
          {t.app.view[v]}
        </button>
      ))}
    </div>
  );
};
