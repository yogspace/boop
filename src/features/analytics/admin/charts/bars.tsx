"use client";

import { useState } from "react";
import { fmt, INK, MUTED, TEXT } from "../parts";
import { Key, toggleStyle } from "./card";

/**
 * The bars: a ranking, optionally against the period before – and its
 * numbers as a table.
 */

export type BarEntry = {
  name: string;
  value: number;
  /** The same in the period before – a gray tick on the bar's track. */
  before?: number;
  /** Full name for the tooltip. */
  title?: string;
};

const ARROWS = { up: "▲", down: "▼", same: "=" } as const;

/**
 * A ranking as thin bars from one baseline, the number at the tip. With
 * `before`, a gray tick marks the period before on the same scale, and the
 * change stands as a number with an arrow – readable without color.
 * Collapsed: the first `limit`.
 */
export const BarList = ({
  entries,
  limit = 8,
  color = "var(--viz-1)",
  max: scale,
  legend = true,
}: {
  entries: BarEntry[];
  limit?: number;
  color?: string;
  /** A scale shared with other lists – else this list's largest value. */
  max?: number;
  /** The “before” key below – off where the card shows it once. */
  legend?: boolean;
}) => {
  const [expanded, setExpanded] = useState(false);
  if (!entries.length) {
    return (
      <p style={{ color: MUTED, fontSize: 13, margin: 0 }}>Nothing yet.</p>
    );
  }
  const shown = expanded ? entries : entries.slice(0, limit);
  const max =
    scale ??
    Math.max(
      1,
      ...entries.map((entry) => Math.max(entry.value, entry.before ?? 0))
    );
  const withBefore =
    legend && entries.some((entry) => entry.before !== undefined);

  return (
    <>
      <ul
        style={{
          display: "grid",
          gap: 10,
          listStyle: "none",
          margin: 0,
          padding: 0,
        }}
      >
        {shown.map((entry) => {
          const change =
            entry.before === undefined
              ? null
              : entry.value > entry.before
                ? "up"
                : entry.value < entry.before
                  ? "down"
                  : "same";
          const diff =
            entry.before === undefined ? 0 : entry.value - entry.before;
          return (
            <li
              key={entry.name}
              title={
                entry.before === undefined
                  ? `${entry.title ?? entry.name}: ${fmt(entry.value)}`
                  : `${entry.title ?? entry.name}: ${fmt(entry.value)} (before: ${fmt(entry.before)})`
              }
            >
              <div
                style={{
                  alignItems: "baseline",
                  display: "flex",
                  fontSize: 13,
                  gap: 8,
                  marginBottom: 4,
                }}
              >
                <span
                  style={{
                    color: TEXT,
                    flex: 1,
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {entry.name}
                </span>
                {change && (
                  <span
                    style={{
                      color: MUTED,
                      fontSize: 11,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    <span aria-hidden style={{ fontSize: 8, marginRight: 3 }}>
                      {ARROWS[change]}
                    </span>
                    {change === "same"
                      ? "same as before"
                      : `${diff > 0 ? "+" : "−"}${fmt(Math.abs(diff))}`}
                  </span>
                )}
                <strong
                  style={{
                    color: INK,
                    fontVariantNumeric: "tabular-nums",
                    minWidth: 28,
                    textAlign: "right",
                  }}
                >
                  {fmt(entry.value)}
                </strong>
              </div>
              <div
                aria-hidden
                style={{
                  background: "var(--theme-elevation-50)",
                  borderRadius: "0 4px 4px 0",
                  height: 8,
                  position: "relative",
                }}
              >
                <div
                  style={{
                    background: color,
                    borderRadius: "0 4px 4px 0",
                    height: "100%",
                    minWidth: entry.value > 0 ? 3 : 0,
                    width: `${(entry.value / max) * 100}%`,
                  }}
                />
                {entry.before !== undefined && (
                  <div
                    style={{
                      background: "var(--viz-before)",
                      borderRadius: 1,
                      boxShadow: "0 0 0 1.5px var(--theme-elevation-0)",
                      height: 14,
                      left: `calc(${(entry.before / max) * 100}% - 1px)`,
                      position: "absolute",
                      top: -3,
                      width: 2,
                    }}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {(entries.length > limit || withBefore) && (
        <div
          style={{
            alignItems: "center",
            color: MUTED,
            display: "flex",
            flexWrap: "wrap",
            fontSize: 12,
            gap: 12,
            justifyContent: "space-between",
            marginTop: 12,
          }}
        >
          {withBefore ? (
            <Key color="var(--viz-before)" line>
              before
            </Key>
          ) : (
            <span />
          )}
          {entries.length > limit && (
            <button
              onClick={() => setExpanded((on) => !on)}
              style={toggleStyle}
              type="button"
            >
              {expanded ? "Show less" : `Show all (${entries.length})`}
            </button>
          )}
        </div>
      )}
    </>
  );
};

/** A ranking's numbers as table rows. */
export const barTable = (entries: BarEntry[], what: string) => {
  const before = entries.some((entry) => entry.before !== undefined);
  return {
    head: [what, "Count", ...(before ? ["Before"] : [])],
    rows: entries.map((entry) => [
      entry.title ?? entry.name,
      entry.value,
      ...(before ? [entry.before ?? 0] : []),
    ]),
  };
};
