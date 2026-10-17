"use client";

import { smooth, useWidth, type XY } from "./plot";

/** Under a figure in its tile: its course, or its share of a whole. */

/**
 * The course behind a figure, small and quiet: gray, the last value as the
 * accent dot.
 */
export const Sparkline = ({ values }: { values: number[] }) => {
  const [ref, width] = useWidth<HTMLDivElement>();
  const h = 30;
  const n = values.length;
  const max = Math.max(1, ...values);
  const xOf = (i: number) =>
    n <= 1 ? width / 2 : 3 + (i / (n - 1)) * (width - 6);
  const yOf = (v: number) => 4 + (h - 8) * (1 - v / max);
  return (
    <div aria-hidden ref={ref} style={{ height: h, marginTop: 8 }}>
      {width > 0 && n > 1 && (
        <svg
          aria-hidden
          height={h}
          style={{ display: "block", overflow: "visible" }}
          width={width}
        >
          <path
            d={smooth(values.map((v, i): XY => [xOf(i), yOf(v)]))}
            fill="none"
            stroke="var(--viz-other)"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
          />
          <circle
            cx={xOf(n - 1)}
            cy={yOf(values[n - 1])}
            fill="var(--viz-1)"
            r={3}
            stroke="var(--theme-elevation-50)"
            strokeWidth={1.5}
          />
        </svg>
      )}
    </div>
  );
};

/** A share of a whole as a thin track – for “63 of 223 views”. */
export const Meter = ({ part, whole }: { part: number; whole: number }) => (
  <div
    aria-hidden
    style={{
      background: "var(--theme-elevation-100)",
      borderRadius: 999,
      height: 6,
      marginTop: 12,
      overflow: "hidden",
    }}
  >
    <div
      style={{
        background: "var(--viz-1)",
        borderRadius: 999,
        height: "100%",
        width: `${whole > 0 ? Math.max(2, (part / whole) * 100) : 0}%`,
      }}
    />
  </div>
);
