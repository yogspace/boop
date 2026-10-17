"use client";

import type { RefObject } from "react";
import { ROUND_BUTTON } from "@/components/ui";
import type { ColorName } from "@/features/calendar/model";
import type { StampColor } from "@/features/calendar/palette";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";
import { FADING, useFadingEdges } from "../fading-edges";
import { InkBlot } from "../ink-blot";
import { angleOf, type Print, STEP, type Stamp } from "./prints";
import type { Hand } from "./use-hand";

/**
 * A day's tools (day-page.tsx), each under its word: the inks, and under
 * them the stamp in hand – or the print picked, which the same two buttons
 * turn.
 */

/** The word over a group of buttons – and over the inks, the stamps. */
export const CAPTION = "font-bold text-muted text-sm";

/**
 * How far the stamp in hand (or the print picked) is turned – a button that
 * sets it straight, looking like the words it is: a soft blot behind them
 * when pointed at. As wide for any angle – nothing beside it moves.
 */
const ANGLE =
  "scribble scribble-bare scribble-clear scribble-sm w-12 rounded-full py-1 text-center font-black text-sm tabular-nums transition-transform duration-150 ease-out enabled:hover:scribble-soft enabled:active:scale-90";

/**
 * The inks: flat blots of ink, the one in use ringed. Over them the stamp
 * in hand shows, as over the page (`showHand`).
 */
export const Inks = ({
  locale,
  pads,
  ink,
  onInk,
  showHand,
}: {
  locale: Locale;
  pads: readonly StampColor[];
  ink: ColorName;
  /** An ink picked – by a pointer, or by the keyboard. */
  onInk: (ink: ColorName, byPointer: boolean) => void;
  showHand: Hand["showHand"];
}) => {
  const t = dictionaryOf(locale);
  // The inks' row on a phone, where it scrolls sideways: it fades where it
  // goes on – once there are more than fit.
  const inkRow = useFadingEdges("x");
  return (
    <fieldset className="min-w-0" {...showHand}>
      <legend className={cn(CAPTION, "mb-1.5")}>{t.app.day.ink}</legend>
      {/* On a phone in one row: more than there is room for, it scrolls
        sideways (only – up and down the swipe is the page's) and fades
        where it goes on (fading-edges.ts), with room all round inside the
        scroller, so the marker ring round the one in use, lifted, isn't
        cut. Wider, closer together – one set of pads – they wrap: nothing
        scrolls, cuts or fades. Beside the page a little smaller and right
        against each other: eight to a row – a gift's own ink, come with
        its stamp, still finds room in the first; in a large day's sheet
        all in one. */}
      <div
        className={cn(
          "-m-4 flex gap-1.5 overflow-x-auto overflow-y-hidden overscroll-x-contain p-4 sm:m-0 sm:flex-wrap sm:gap-0.5 sm:overflow-visible sm:mask-none sm:p-0 @2xl:gap-0",
          FADING.x
        )}
        ref={inkRow}
      >
        {pads.map(({ key: c, hex, name: names }, i) => (
          <button
            aria-label={names[locale]}
            aria-pressed={ink === c}
            className={cn(
              "relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-transform @2xl:h-10 @2xl:w-10",
              ink === c ? "scale-110" : "hover:-rotate-6 hover:scale-110"
            )}
            key={c}
            onClick={(event) => onInk(c, event.detail !== 0)}
            type="button"
          >
            <InkBlot hex={hex} index={i} on={ink === c} />
          </button>
        ))}
      </div>
    </fieldset>
  );
};

/**
 * Under the inks, a row of its own: the stamp's group – the stamp in hand,
 * or the print picked (`marked`). Faint while there is nothing to turn,
 * like the steps – there all along: nothing moves as it comes and goes.
 */
export const Turning = ({
  locale,
  inHand,
  marked,
  angle,
  showAngle,
  turnBy,
  straighten,
  turnPrint,
}: {
  locale: Locale;
  inHand: Stamp | null;
  marked: Print | null;
  /** How far the stamp in hand is turned – written by `showAngle`. */
  angle: RefObject<HTMLButtonElement | null>;
  showAngle: () => void;
  turnBy: (degrees: number) => void;
  straighten: () => void;
  turnPrint: (print: Print, degrees: number) => void;
}) => {
  const t = dictionaryOf(locale);

  /** A button that turns the stamp in hand – or, with none, the print picked. */
  const turnButton = (degrees: number, label: string, keys: string) => (
    <button
      aria-keyshortcuts={keys}
      aria-label={label}
      className={cn(ROUND_BUTTON, "h-11 w-11")}
      onClick={() => {
        if (inHand) turnBy(degrees);
        else if (marked) turnPrint(marked, degrees);
      }}
      title={label}
      type="button"
    >
      {/* The same arrow, the other way round. */}
      <TurnSign className={cn("h-5 w-5", degrees > 0 && "-scale-x-100")} />
    </button>
  );

  return (
    <fieldset className="min-w-0" disabled={!(inHand || marked)}>
      <legend className={cn(CAPTION, "mb-1.5")}>
        {marked && !inHand ? t.app.day.print : t.app.day.inHand}
      </legend>
      <div className="flex items-center gap-1">
        {turnButton(-STEP, t.app.day.turnLeft, "ArrowLeft [")}
        {/* How far it is turned – pressed, straight again: the print as
          the buttons turn it, a step to take back. */}
        {inHand ? (
          <button
            aria-label={t.app.day.straighten}
            className={ANGLE}
            key="hand"
            onClick={straighten}
            ref={(box) => {
              angle.current = box;
              showAngle();
            }}
            title={t.app.day.straighten}
            type="button"
          />
        ) : (
          <button
            aria-label={t.app.day.straighten}
            className={cn(ANGLE, !marked && "opacity-40")}
            disabled={!marked?.rotation}
            key="print"
            onClick={() => {
              if (marked) turnPrint(marked, -marked.rotation);
            }}
            title={t.app.day.straighten}
            type="button"
          >
            {angleOf(marked?.rotation ?? 0)}
          </button>
        )}
        {turnButton(STEP, t.app.day.turnRight, "ArrowRight ]")}
      </div>
    </fieldset>
  );
};

/** A stamp, a little askew, and an arrow over it – turned to the left. */
const TurnSign = ({ className }: { className?: string }) => (
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
    <rect
      height="9"
      rx="2"
      transform="rotate(-12 15 15)"
      width="9"
      x="10.5"
      y="10.5"
    />
    <path d="M15 4.5A10.5 10.5 0 0 0 4.5 15" />
    <path d="m1.8 12.4 2.7 3 2.7-3" />
  </svg>
);
