import { cn } from "@/lib/cn";

/**
 * How far each line runs past the table's edge (px) – ruled freely, none
 * ends where the next does.
 */
const OVER = [6, 9, 4, 8, 5, 10, 7, 4, 9, 6];

/**
 * The lines of a table ruled with the marker, over a box of equal cells –
 * the month's days. Every line is drawn by itself (`scribble-rule`,
 * styles.css) and runs a little past the corners. With `shade`, the last
 * columns are hatched – the weekend.
 *
 * Put it into the box that holds the cells: `relative isolate`, and nothing
 * that clips. The lines lie over the cells, the hatching under them. Keep
 * the box in place when the cells change – then nothing here is drawn again.
 *
 * `--scribble-width` (2px) is the lines' width: `className="[--scribble-width:2.5px]"`.
 */
export const Ruling = ({
  cols = 7,
  rows,
  shade = 0,
  className,
}: {
  cols?: number;
  rows: number;
  /** How many columns at the end are hatched. */
  shade?: number;
  className?: string;
}) => (
  <>
    {shade > 0 && (
      <span
        aria-hidden="true"
        className="scribble-hatch pointer-events-none absolute inset-y-0 right-0 -z-10"
        style={{ width: `${(shade / cols) * 100}%` }}
      />
    )}
    <span
      aria-hidden="true"
      className={cn("pointer-events-none absolute inset-0 z-10", className)}
    >
      {Array.from({ length: cols + 1 }, (_, i) => (
        <span
          className="scribble-rule-y absolute -translate-x-1/2 will-change-transform"
          key={`v${i}`}
          style={{
            left: `${(i / cols) * 100}%`,
            top: -OVER[i % OVER.length],
            bottom: -OVER[(i + 3) % OVER.length],
          }}
        />
      ))}
      {Array.from({ length: rows + 1 }, (_, j) => (
        <span
          className="scribble-rule absolute -translate-y-1/2 will-change-transform"
          key={`h${j}`}
          style={{
            top: `${(j / rows) * 100}%`,
            left: -OVER[(j + 5) % OVER.length],
            right: -OVER[(j + 8) % OVER.length],
          }}
        />
      ))}
    </span>
  </>
);
