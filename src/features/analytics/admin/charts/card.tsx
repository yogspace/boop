"use client";

import { type PropsWithChildren, type ReactNode, useState } from "react";
import { fmt, INK, LINE, MUTED, TEXT } from "../parts";

/**
 * Around and beside the charts: the card with its switch to a table, the
 * legend's entries, and the readout by the pointer.
 */

/** The quiet pill of a switch – table or chart, more or less. */
export const toggleStyle = {
  background: "none",
  border: `1px solid ${LINE}`,
  borderRadius: 999,
  color: TEXT,
  cursor: "pointer",
  font: "inherit",
  fontSize: 11,
  padding: "2px 10px",
} as const;

/**
 * A chart in a card: its title, what it shows beside it, and a switch to
 * the same numbers as a table – readable without pointing at anything.
 */
export const ChartCard = ({
  title,
  aside,
  table,
  children,
}: PropsWithChildren<{
  title: string;
  aside?: ReactNode;
  /** The same numbers as rows – without it, no switch. */
  table?: { head: string[]; rows: (string | number)[][] };
}>) => {
  const [asTable, setAsTable] = useState(false);
  return (
    <section className="boop-viz__card">
      <header
        style={{
          alignItems: "baseline",
          display: "flex",
          flexWrap: "wrap",
          gap: "6px 12px",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <h4 style={{ color: INK, fontSize: 14, fontWeight: 600, margin: 0 }}>
          {title}
        </h4>
        <span
          style={{
            alignItems: "center",
            color: MUTED,
            display: "inline-flex",
            flexWrap: "wrap",
            fontSize: 12,
            gap: 10,
          }}
        >
          {aside}
          {table && (
            <button
              aria-pressed={asTable}
              onClick={() => setAsTable((on) => !on)}
              style={toggleStyle}
              type="button"
            >
              {asTable ? "Chart" : "Table"}
            </button>
          )}
        </span>
      </header>
      {asTable && table ? <DataTable {...table} /> : children}
    </section>
  );
};

const DataTable = ({
  head,
  rows,
}: {
  head: string[];
  rows: (string | number)[][];
}) => (
  <div style={{ maxHeight: 320, overflow: "auto" }}>
    <table style={{ borderCollapse: "collapse", fontSize: 12, width: "100%" }}>
      <thead>
        <tr>
          {head.map((cell, i) => (
            <th
              key={cell}
              style={{
                borderBottom: `1px solid ${LINE}`,
                color: MUTED,
                fontWeight: 500,
                padding: "4px 6px",
                textAlign: i === 0 ? "left" : "right",
              }}
            >
              {cell}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.join("|")}>
            {row.map((cell, i) => (
              <td
                key={`${i}-${cell}`}
                style={{
                  borderBottom: "1px solid var(--theme-elevation-50)",
                  color: i === 0 ? TEXT : INK,
                  fontVariantNumeric: "tabular-nums",
                  padding: "4px 6px",
                  textAlign: i === 0 ? "left" : "right",
                }}
              >
                {typeof cell === "number" ? fmt(cell) : cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

/** A legend entry: its mark (a dot, or a short line for lines) and name. */
export const Key = ({
  color,
  line = false,
  children,
}: PropsWithChildren<{ color: string; line?: boolean }>) => (
  <span style={{ alignItems: "center", display: "inline-flex", gap: 6 }}>
    <i
      aria-hidden
      style={{
        background: color,
        borderRadius: line ? 1 : "50%",
        display: "inline-block",
        height: line ? 2 : 8,
        width: line ? 14 : 8,
      }}
    />
    {children}
  </span>
);

/**
 * The readout by the pointer: values first, then what they are – next to a
 * cursor line at the plot's top, on whichever side has room.
 */
export const Tip = ({
  x,
  y,
  width,
  children,
}: PropsWithChildren<{ x: number; y: number; width: number }>) => (
  <div
    role="status"
    style={{
      background: "var(--theme-elevation-900)",
      borderRadius: "var(--style-radius-s)",
      boxShadow: "0 6px 20px -8px rgb(0 0 0 / 0.45)",
      color: "var(--theme-elevation-0)",
      fontSize: 12,
      left: Math.min(Math.max(x, 0), width),
      lineHeight: 1.35,
      padding: "6px 9px",
      pointerEvents: "none",
      position: "absolute",
      top: y,
      transform: `translate(${x > width / 2 ? "calc(-100% - 12px)" : "12px"}, 0)`,
      whiteSpace: "nowrap",
      zIndex: 2,
    }}
  >
    {children}
  </div>
);
