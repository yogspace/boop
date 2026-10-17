import { ROUND_BUTTON } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";
import { Sign } from "./sign";

/** The bar under the drawing: steps back and forth, clearing it all. */

/** An arrow turning back – a step back. */
const UNDO = "M8.5 5.5 4 10l4.5 4.5M4 10h10.5a5 5 0 0 1 0 10H11";
/** The same arrow the other way – a step forward again. */
const REDO = "M15.5 5.5 20 10l-4.5 4.5M20 10H9.5a5 5 0 0 0 0 10H13";
/** A little bin – clearing the drawing. */
const BIN =
  "M4 6.5h16M9.5 6.5V4h5v2.5M6.5 6.5l1 13.5h9l1-13.5M10.5 10.5v6M13.5 10.5v6";

/**
 * Right under the drawing, as wide as it, like under the day's page
 * (day-page/step-bar.tsx): the steps back and forth in its middle – three
 * columns, the outer two alike, so they sit under the drawing's middle
 * whatever is beside them –, clearing on the right. On a phone it stays
 * there with the drawing as the page scrolls. Made 3D, there is nothing to
 * take back: on a phone it goes – it lies under the stage, which stays
 * where it is; side by side it fades with the drawing's controls and keeps
 * its room, so the sheet keeps its size.
 */
export const HistoryBar = ({
  locale,
  side,
  draws,
  canBack,
  canForward,
  onBack,
  onForward,
  empty,
  onClear,
}: {
  locale: Locale;
  side: boolean;
  draws: boolean;
  canBack: boolean;
  canForward: boolean;
  onBack: () => void;
  onForward: () => void;
  /** Nothing drawn – nothing to clear. */
  empty: boolean;
  onClear: () => void;
}) => {
  const t = dictionaryOf(locale);
  return (
    <div
      className={cn(
        "grid grid-cols-[1fr_auto_1fr] items-center gap-2 pt-2",
        side
          ? cn(
              "transition-[opacity,visibility] duration-200",
              draws ? "delay-150" : "invisible opacity-0"
            )
          : draws
            ? "animate-fade"
            : "hidden"
      )}
    >
      <div className="col-start-2 flex items-center gap-4">
        {(
          [
            [t.app.draw.undo, UNDO, canBack, onBack, "Meta+Z Control+Z"],
            [
              t.app.draw.redo,
              REDO,
              canForward,
              onForward,
              "Meta+Shift+Z Control+Shift+Z Control+Y",
            ],
          ] as const
        ).map(([label, sign, able, go, keys]) => (
          <button
            aria-keyshortcuts={keys}
            aria-label={label}
            // Filled while there is a step to take – it should be seen;
            // faint while there is none (like the day's, day-page/step-bar.tsx).
            className={cn(ROUND_BUTTON, "h-11 w-11", able && "scribble-ink")}
            disabled={!able}
            key={label}
            onClick={go}
            title={label}
            type="button"
          >
            <Sign className="h-6 w-6" d={sign} />
          </button>
        ))}
      </div>
      {/* Red, like every button that deletes something. */}
      <button
        aria-label={t.app.draw.clear}
        className={cn(
          ROUND_BUTTON,
          "scribble-danger h-11 w-11 justify-self-end"
        )}
        disabled={empty}
        onClick={onClear}
        title={t.app.draw.clear}
        type="button"
      >
        <Sign className="h-5 w-5" d={BIN} />
      </button>
    </div>
  );
};
