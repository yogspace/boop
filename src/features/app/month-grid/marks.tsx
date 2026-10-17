"use client";

import { m } from "motion/react";
import { Sparkle } from "@/components/doodles";
import { cn } from "@/lib/cn";
import { FRAME_TURN, type Turn } from "./turns";

/**
 * What the marker adds to a day of the month (month-grid.tsx) under its
 * prints: a frame round a special day, a line of writing on a day with a
 * note.
 */

/**
 * Once round a day by hand, in a box of 100 – the marker sets off and ends
 * in the corner the day's number sits in.
 */
const FRAME =
  "M17 3C38 1.2 62 4.2 83 2.6C92 2 97.8 7.5 97.4 17C99 39 96 61 97.6 83C98 92.5 92.5 97.8 83 97.5C61 99 39 96 17 97.6C7.5 98 2.2 92.5 2.6 83C1 61 4.2 39 2.4 17C2 7.5 7.5 2.4 17 3Z";

/**
 * All of a day's frame but the number's corner – in the number's own size
 * (em), so the gap fits it in the smallest day and the largest.
 */
const OPEN =
  "polygon(1.8em -50%, 150% -50%, 150% 150%, -50% 150%, -50% 1.6em, 1.8em 1.6em)";

/**
 * A day a special stamp was pressed on gets a frame of its own: the marker
 * went round it once more, inside the table's lines and in that print's ink
 * – open where the number is, a sparkle on the corner across and a small
 * one down left (where the number and, on a phone, the count aren't). It
 * lies under the day's prints: they are stamped over it, none is covered.
 * The keyboard's dashed ring runs along it, black on its line – further in
 * it would go through the number.
 */
export const Special = ({ hex, wave }: { hex: string; wave: Turn }) => (
  <m.span
    aria-hidden="true"
    // The number's size, for the gap.
    className="pointer-events-none absolute inset-[3px] -z-10 text-[11px] sm:inset-1 sm:text-sm"
    custom={wave}
    style={{ color: hex }}
    variants={FRAME_TURN}
  >
    <span className="absolute inset-0" style={{ clipPath: OPEN }}>
      <svg
        aria-hidden="true"
        className="h-full w-full overflow-visible stroke-2 sm:stroke-[2.5]"
        fill="none"
        preserveAspectRatio="none"
        stroke="currentColor"
        strokeLinejoin="round"
        viewBox="0 0 100 100"
      >
        <path d={FRAME} vectorEffect="non-scaling-stroke" />
      </svg>
    </span>
    {/* On the line, a little inside its corners – clear of the table's. */}
    <Sparkle className="absolute top-[10%] right-[10%] h-2.5 w-2.5 translate-x-1/2 -translate-y-1/2 rotate-12 sm:top-[9%] sm:right-[9%] sm:h-5 sm:w-5" />
    <Sparkle className="absolute bottom-[7%] left-[7%] h-2 w-2 -translate-x-1/2 translate-y-1/2 -rotate-12 sm:h-3 sm:w-3" />
  </m.span>
);

/**
 * Two words of scribbled writing – not letters, what handwriting looks like
 * from a little way off: humps, a loop, a gap. Drawn once, in a box of
 * 46 × 8.
 */
const WRITING = [
  "M1 6.5C2 6.5 2.4 3 3.4 3S4.3 6.5 5.3 6.5 6.4 2.6 7.4 2.6 8.2 6.5 9.2 6.5 10.3 3.6 11.2 3.6 11.8 6.5 12.8 6.5 14.4 0.8 15.3 0.8 15.6 4.6 14.6 5.6 15.6 6.6 16.8 6.6 17.8 3.6 18.8 3.6 19.3 6.5 20.4 6.4",
  "M25.2 6.5C26.2 6.5 26.6 3.2 27.6 3.2S28.4 6.5 29.4 6.5 30.4 3 31.4 3 32 6.5 33 6.5 34.6 1.2 35.5 1.2 35.7 5 34.8 5.8 35.8 6.6 37 6.6 38 3.4 39 3.4 39.6 6.5 40.6 6.5 42 4.4 43 4.6 43.4 6.2 45 6",
];

/**
 * A day with a note: a line of scribbled writing along its foot, in the
 * marker's ink – what is written shows on the day's sheet, this only says
 * that something is. It lies under the day's prints like the special frame:
 * they are stamped over it, none is covered. On the left, clear of the
 * frame's sparkle on a special day; on a phone one word only, clear of the
 * count in the other corner.
 */
export const Writing = ({
  special,
  wave,
}: {
  special: boolean;
  wave: Turn;
}) => (
  <m.svg
    aria-hidden="true"
    className={cn(
      "pointer-events-none absolute bottom-1 -z-10 aspect-46/8 h-1.5 overflow-visible stroke-[1.25] sm:bottom-2 sm:h-2.5 sm:stroke-[1.6]",
      special ? "left-2.5 sm:left-6" : "left-1 sm:left-2"
    )}
    custom={wave}
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    variants={FRAME_TURN}
    viewBox="0 0 46 8"
  >
    <path d={WRITING[0]} vectorEffect="non-scaling-stroke" />
    <path
      className="max-sm:hidden"
      d={WRITING[1]}
      vectorEffect="non-scaling-stroke"
    />
  </m.svg>
);
