"use client";

import type { PropsWithChildren } from "react";

/**
 * Building blocks of the analytics global.
 *
 * Text and lines through Payload's theme variables, data colors through the
 * `.boop-viz` ones (admin.scss) – light and dark mode both fit without asking
 * which one is on. The charts themselves are in charts.tsx.
 */

export const INK = "var(--theme-elevation-1000)";
export const TEXT = "var(--theme-elevation-800)";
export const MUTED = "var(--theme-elevation-500)";
export const LINE = "var(--theme-elevation-150)";

export const fmt = (n: number) => n.toLocaleString("de-DE");

export const Note = ({ children }: PropsWithChildren) => (
  <p
    style={{ color: MUTED, fontSize: 13, lineHeight: 1.45, margin: "0 0 16px" }}
  >
    {children}
  </p>
);

export const Loading = () => <Note>Loading …</Note>;

// ─── Key figures ─────────────────────────────────────────────────────────────

export const StatGrid = ({ children }: PropsWithChildren) => (
  <div
    style={{
      display: "grid",
      gap: 12,
      // Five in a row where there is room – the figures of a section.
      gridTemplateColumns: "repeat(auto-fit, minmax(136px, 1fr))",
      marginBottom: 8,
    }}
  >
    {children}
  </div>
);

export type Trend = "up" | "down" | "flat";

const TREND_ICON: Record<Trend, string> = { up: "▲", down: "▼", flat: "■" };
// More is good – the direction carries the color, and the sign before it
// says the same again without color.
const TREND_COLOR: Record<Trend, string> = {
  up: "var(--viz-up-text)",
  down: "var(--viz-down-text)",
  flat: MUTED,
};

/**
 * A key figure: label, value, below it optionally a comparison – and, as
 * `children`, its course or share, small and quiet. The number leads: a
 * single number is read fastest as a number.
 */
export const StatTile = ({
  label,
  value,
  detail,
  trend,
  detailTitle,
  children,
}: PropsWithChildren<{
  label: string;
  value: number;
  /** Comparison or context, e.g. “+12 % vs. the 7 days before”. */
  detail?: string;
  trend?: Trend;
  /** Tooltip of the detail line. */
  detailTitle?: string;
}>) => (
  <div
    style={{
      background: "var(--theme-elevation-50)",
      border: "1px solid var(--theme-elevation-100)",
      borderRadius: "var(--style-radius-m)",
      padding: "14px 16px",
    }}
  >
    <div
      style={{
        color: MUTED,
        fontSize: 12,
        marginBottom: 6,
        overflow: "hidden",
        textOverflow: "ellipsis",
        // One line, so the numbers of a row stand level.
        whiteSpace: "nowrap",
      }}
      title={label}
    >
      {label}
    </div>
    <div
      style={{
        color: INK,
        fontSize: 28,
        fontWeight: 600,
        letterSpacing: "-0.01em",
        lineHeight: 1.1,
      }}
    >
      {fmt(value)}
    </div>
    {detail && (
      <div
        style={{
          color: trend ? TREND_COLOR[trend] : MUTED,
          display: "-webkit-box",
          fontSize: 12,
          lineHeight: 1.35,
          marginTop: 6,
          overflow: "hidden",
          WebkitBoxOrient: "vertical",
          // Two lines at most – the whole in the tooltip.
          WebkitLineClamp: 2,
        }}
        title={detailTitle ?? detail}
      >
        {trend && (
          <span aria-hidden style={{ fontSize: 9, marginRight: 4 }}>
            {TREND_ICON[trend]}
          </span>
        )}
        {detail}
      </div>
    )}
    {children}
  </div>
);

/**
 * Two periods compared, as a tile's detail line. Without a previous value
 * there is no percentage – then it says what it started from.
 */
export const compare = (
  now: number,
  before: number,
  against: string
): { detail: string; trend: Trend; detailTitle: string } => {
  if (before === 0) {
    return now > 0
      ? {
          detail: "up from 0",
          trend: "up",
          detailTitle: `up from 0 ${against}`,
        }
      : {
          detail: "0 before too",
          trend: "flat",
          detailTitle: `0 ${against} as well`,
        };
  }
  const change = Math.round(((now - before) / before) * 100);
  return {
    detail: `${change > 0 ? "+" : ""}${change} % (${fmt(before)} before)`,
    trend: change > 0 ? "up" : change < 0 ? "down" : "flat",
    detailTitle: `${change > 0 ? "+" : ""}${change} % vs. ${against}`,
  };
};

/** A share as a whole percentage – “–” of nothing. */
export const percent = (part: number, whole: number) =>
  whole > 0 ? `${Math.round((part / whole) * 100)} %` : "–";

// ─── Controls ────────────────────────────────────────────────────────────────

/** An active restriction with a button to lift it – like “✕ Reset” in the heatmap. */
export const ResetChip = ({
  onReset,
  title,
}: {
  onReset: () => void;
  title: string;
}) => (
  <button
    onClick={onReset}
    style={{
      background: "var(--viz-1)",
      border: "none",
      borderRadius: 999,
      color: "var(--theme-elevation-0)",
      cursor: "pointer",
      font: "inherit",
      fontSize: 12,
      fontWeight: 600,
      padding: "3px 10px",
      whiteSpace: "nowrap",
    }}
    title={title}
    type="button"
  >
    ✕ Reset
  </button>
);

/** A row of equal buttons at the end of a section. */
export const ButtonRow = ({ children }: PropsWithChildren) => (
  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
    {children}
  </div>
);
