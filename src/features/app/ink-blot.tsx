import { Circle } from "@/components/doodles";

/**
 * An ink blot, drawn by hand a few times over (40 × 40) – the inks take
 * turns, so no two neighbors are the same blot.
 */
const BLOTS = [
  "M20 3c6-1 12 2 15 8 3 5 3 12-1 17-4 6-10 9-17 8-6-1-11-5-13-11C2 18 4 10 9 6c3-2 7-3 11-3Z",
  "M18 4c7-2 15 1 18 7 2 5 1 9-1 14-2 6-6 11-13 12-7 1-14-2-17-8C2 23 3 15 6 10c3-4 7-5 12-6Z",
  "M21 4c5 0 10 2 13 6 4 5 4 11 2 16-2 5-6 9-11 10-3 1-5 0-8 0-6-1-11-4-13-10-2-5-1-12 3-16 4-4 9-6 14-6Z",
  "M19 3c6 0 11 3 14 7 3 5 5 10 3 16-2 6-8 10-14 11-6 0-12-2-15-7C4 25 3 19 5 13 7 7 13 3 19 3Z",
];

/**
 * A flat blot of a stamp color – what the inks and the colors to pick from
 * look like (the day's stamp pads, a new stamp's color). It fills the button
 * it is in (that one `relative`, a little bigger than the blot); the one in
 * use – `on` – is ringed with a marker, a little beyond the button.
 */
export const InkBlot = ({
  hex,
  index,
  on,
}: {
  hex: string;
  /** Its place in the row: which blot, and how it lies. */
  index: number;
  on: boolean;
}) => (
  <>
    <svg
      aria-hidden="true"
      className="h-[82%] w-[82%]"
      fill={hex}
      // Each lies a little differently.
      style={{ rotate: `${(index * 67) % 360}deg` }}
      viewBox="0 0 40 40"
    >
      <path d={BLOTS[index % BLOTS.length]} />
    </svg>
    {on && (
      <Circle
        className="pointer-events-none absolute -inset-1 h-[calc(100%+0.5rem)] w-[calc(100%+0.5rem)] animate-fade text-ink"
        strokeWidth={2.5}
      />
    )}
  </>
);
