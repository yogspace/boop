"use client";

import { ROUND_BUTTON } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";

/**
 * Right under a day's page (day-page.tsx), in one column as in two: the
 * steps back and forth together on the left – filled while there is one to
 * take, it should be seen; faint while there is none – and on the right
 * the bin for the print picked (`removable`). Its place is kept while there
 * is none: nothing moves as it comes and goes.
 */
export const StepBar = ({
  locale,
  can,
  undo,
  redo,
  removable,
  onRemove,
  className,
}: {
  locale: Locale;
  can: { undo: boolean; redo: boolean };
  undo: () => void;
  redo: () => void;
  removable: boolean;
  onRemove: () => void;
  className?: string;
}) => {
  const t = dictionaryOf(locale);
  return (
    <div className={cn("flex items-center justify-between gap-4", className)}>
      <div className="flex items-center gap-2">
        {(
          [
            [undo, can.undo, t.app.day.undo, "Meta+Z Control+Z", ""],
            // The same arrow, the other way round.
            [
              redo,
              can.redo,
              t.app.day.redo,
              "Meta+Shift+Z Control+Shift+Z Control+Y",
              "-scale-x-100",
            ],
          ] as const
        ).map(([go, able, label, keys, flip]) => (
          <button
            aria-keyshortcuts={keys}
            aria-label={label}
            className={cn(ROUND_BUTTON, "h-12 w-12", able && "scribble-ink")}
            disabled={!able}
            key={label}
            onClick={go}
            title={label}
            type="button"
          >
            <StepSign className={cn("h-6 w-6", flip)} />
          </button>
        ))}
      </div>
      <button
        aria-keyshortcuts="Delete Backspace"
        aria-label={t.app.day.remove}
        // Red, like every button that deletes something.
        className={cn(
          ROUND_BUTTON,
          "scribble-danger h-11 w-11",
          !removable && "invisible"
        )}
        onClick={onRemove}
        title={t.app.day.remove}
        type="button"
      >
        <BinSign className="h-5 w-5" />
      </button>
    </div>
  );
};

type Sign = { className?: string };

/** A hooked arrow – a step back. */
const StepSign = ({ className }: Sign) => (
  <svg
    aria-hidden="true"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="2.8"
    viewBox="0 0 24 24"
  >
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </svg>
);

/** A bin – off the page. */
const BinSign = ({ className }: Sign) => (
  <svg
    aria-hidden="true"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="2.4"
    viewBox="0 0 24 24"
  >
    <path d="M4 6.5h16" />
    <path d="M9 6.5V4h6v2.5" />
    <path d="M6 6.5 7 19a2 2 0 0 0 2 1.8h6A2 2 0 0 0 17 19l1-12.5" />
    <path d="M10 10.5v6M14 10.5v6" />
  </svg>
);
