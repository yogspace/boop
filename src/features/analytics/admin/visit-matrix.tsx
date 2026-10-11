"use client";

import type { CSSProperties } from "react";
import { useState } from "react";
import { pathName } from "../page-names";
import {
  buildVisitMatrix,
  OTHER,
  type Visit,
  type VisitAxis,
  visitShade,
} from "../visit-matrix";

type Hover =
  | { kind: "cell"; row: string; col: string }
  | { kind: "col"; col: string };

/** Rows visible while collapsed. */
const MAX_ROWS = 10;

/**
 * The shading as the seven steps of the charts' blue ramp (admin.scss,
 * `--viz-seq-*`), turned round in dark mode – “more views = further from
 * the ground” holds in both – with a text color that reads on each step.
 */
const RAMP = [1, 2, 3, 4, 5, 6, 7] as const;

const muted = { color: "var(--theme-elevation-400)" } as const;

// The totals row apart from the grid: it is the sum below, not one more page.
const footCell: CSSProperties = {
  borderTop: "1px solid var(--theme-elevation-150)",
  paddingTop: 6,
  fontSize: 11,
};

const stamp = (at: number) =>
  new Date(at).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

/** A small trash can, drawn in the text color. */
const TrashIcon = ({ size }: { size: number }) => (
  <svg
    aria-hidden
    fill="none"
    height={size}
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={2}
    viewBox="0 0 24 24"
    width={size}
  >
    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
  </svg>
);

/**
 * Pages × devices as ONE grid: a ROW reads “which devices were on this page”,
 * a COLUMN “which pages did this device open”. The switch turns the axes.
 *
 * A click on a column header chooses that column: rows order by it, rows
 * without a view there disappear, and under each name stands this one cell's
 * state (“5 of 36 · last 13.09. 21:44”). The calculation lives in
 * ../visit-matrix.ts – the mail report shows the same grid.
 */
export const VisitMatrix = ({
  visits,
  onResetDevice,
  busy = false,
}: {
  visits: Visit[];
  /** Deletes all views of a device profile; without it there is no button. */
  onResetDevice?: (device: string) => void;
  busy?: boolean;
}) => {
  const [rowAxis, setRowAxis] = useState<VisitAxis>("page");
  const [expanded, setExpanded] = useState(false);
  const [hover, setHover] = useState<Hover | null>(null);
  const [sortCol, setSortCol] = useState<string | null>(null);

  if (!visits.length) return null;

  const colAxis: VisitAxis = rowAxis === "page" ? "device" : "page";
  const { columns, rows, cell, columnTotal, max, activeCol } = buildVisitMatrix(
    visits,
    { rowAxis, sortCol }
  );
  const shown = expanded ? rows : rows.slice(0, MAX_ROWS);

  const shade = (count: number): CSSProperties => {
    const index = Math.ceil(visitShade(count, max) * RAMP.length) - 1;
    const step = RAMP[Math.max(0, Math.min(RAMP.length - 1, index))];
    return {
      background: `var(--viz-seq-${step})`,
      color: `var(--viz-seq-ink-${step})`,
    };
  };

  const nameOf = (key: string) => {
    if (key === OTHER) return "Other";
    const name = pathName(key);
    return name ? `${name.label} (${name.locale.toUpperCase()})` : key;
  };

  const noun = (axis: VisitAxis) => (axis === "device" ? "devices" : "pages");

  // Deleting as an action of its own, outlined red – apart from the blue
  // “Reset” that only resets the view.
  const deleteButton = (device: string, compact: boolean) =>
    onResetDevice && device !== OTHER ? (
      <button
        aria-label={`Delete all views of "${device}"`}
        disabled={busy}
        onClick={(event) => {
          event.stopPropagation();
          onResetDevice(device);
        }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          flexShrink: 0,
          border: "1px solid var(--theme-error-500)",
          borderRadius: 999,
          background: "transparent",
          color: "var(--theme-error-500)",
          font: "inherit",
          fontSize: 12,
          fontWeight: 600,
          padding: compact ? 4 : "4px 12px",
          cursor: busy ? "wait" : "pointer",
          opacity: busy ? 0.5 : 1,
        }}
        title={`Delete all views of "${device}"`}
        type="button"
      >
        <TrashIcon size={compact ? 12 : 13} />
        {compact ? null : "Delete this device's views"}
      </button>
    ) : null;

  // The line below the grid: what is under the pointer.
  const readout = (() => {
    if (!hover) return null;
    const { col } = hover;
    if (hover.kind === "cell") {
      const value = cell(hover.row, col);
      if (!value) return `${nameOf(hover.row)} × ${nameOf(col)}: no views`;
      return `${nameOf(hover.row)} × ${nameOf(col)}: ${value.count} views · last ${stamp(value.lastAt)}`;
    }
    const total = columnTotal(col);
    const reach = rows.filter(([row]) => cell(row, col));
    return total
      ? `${nameOf(col)}: ${total.count} views on ${reach.length} ${noun(rowAxis)} · last ${stamp(total.lastAt)}`
      : null;
  })();

  // A name as column header or row label. Devices in the HEADER stacked
  // (class, then system, then browser) – in one line three times as wide as
  // the number below. In the ROW on two lines: there is width, not height.
  const label = (key: string, axis: VisitAxis, inHeader: boolean) => {
    if (axis === "device" && key !== OTHER) {
      const [head, ...rest] = key.split(" · ");
      return (
        <span style={{ display: "block" }} title={key}>
          <span style={{ display: "block" }}>{head}</span>
          {inHeader ? (
            rest.map((part) => (
              <span
                key={part}
                style={{ ...muted, display: "block", fontSize: 11 }}
              >
                {part}
              </span>
            ))
          ) : rest.length > 0 ? (
            <span style={{ ...muted, display: "block", fontSize: 11 }}>
              {rest.join(" · ")}
            </span>
          ) : null}
        </span>
      );
    }

    const page = axis === "page" ? pathName(key) : null;
    if (page) {
      const tag = (
        <span
          style={{
            ...muted,
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.04em",
          }}
        >
          {page.locale.toUpperCase()}
        </span>
      );
      return inHeader ? (
        <span style={{ display: "block" }} title={key}>
          <span style={{ display: "block" }}>{page.label}</span>
          <span style={{ display: "block" }}>{tag}</span>
        </span>
      ) : (
        <span style={{ display: "block", whiteSpace: "nowrap" }} title={key}>
          {page.label} {tag}
        </span>
      );
    }

    return (
      <span
        style={{
          display: "block",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          maxWidth: inHeader ? 96 : undefined,
          margin: inHeader ? "0 auto" : undefined,
        }}
        title={key}
      >
        {key === OTHER ? "Other" : key}
      </span>
    );
  };

  const toggle = (axis: VisitAxis, text: string) => {
    const active = rowAxis === axis;
    return (
      <button
        aria-pressed={active}
        onClick={() => {
          setRowAxis(axis);
          setExpanded(false);
          setHover(null);
          // After turning, the columns are others – a remembered one is moot.
          setSortCol(null);
        }}
        style={{
          border: "1px solid var(--theme-elevation-400)",
          background: active ? "var(--theme-text)" : "transparent",
          color: active ? "var(--theme-elevation-0)" : "var(--theme-text)",
          font: "inherit",
          fontSize: 12,
          fontWeight: active ? 600 : 400,
          padding: "4px 12px",
          cursor: "pointer",
          borderRadius: axis === "page" ? "4px 0 0 4px" : "0 4px 4px 0",
          marginLeft: axis === "page" ? 0 : -1,
        }}
        type="button"
      >
        {text}
      </button>
    );
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 12,
          marginBottom: 8,
        }}
      >
        <div style={{ display: "flex" }}>
          {toggle("page", "By page")}
          {toggle("device", "By device")}
        </div>
        {activeCol && colAxis === "device" && deleteButton(activeCol, false)}
        {activeCol && (
          <button
            onClick={() => {
              setSortCol(null);
              setExpanded(false);
            }}
            style={{
              border: "none",
              borderRadius: 999,
              background: "var(--viz-1)",
              color: "#ffffff",
              font: "inherit",
              fontSize: 12,
              fontWeight: 600,
              padding: "4px 12px",
              cursor: "pointer",
            }}
            title={`Clear the selection "${nameOf(activeCol)}"`}
            type="button"
          >
            ✕ Reset
          </button>
        )}
      </div>

      <div style={{ overflowX: "auto" }}>
        <table
          onMouseLeave={() => setHover(null)}
          style={{
            borderCollapse: "separate",
            borderSpacing: 2,
            fontSize: 12,
            width: "100%",
          }}
        >
          <thead>
            <tr>
              <th style={{ minWidth: 160 }} />
              {columns.map((col) => {
                const active = activeCol === col;
                return (
                  <th
                    aria-sort={active ? "descending" : undefined}
                    key={col}
                    onMouseEnter={() => setHover({ kind: "col", col })}
                    style={{
                      padding: 0,
                      // The mark on the CELL, not the button: headers differ
                      // in height, the cell is always as high as the row.
                      background: active ? "var(--viz-select)" : "none",
                      borderBottom: active
                        ? "3px solid var(--viz-1)"
                        : "3px solid transparent",
                      borderRadius: "4px 4px 0 0",
                      fontWeight: active ? 600 : 400,
                      verticalAlign: "bottom",
                      textAlign: "center",
                      minWidth: 64,
                      height: 1,
                    }}
                  >
                    <button
                      onClick={() =>
                        setSortCol((current) => (current === col ? null : col))
                      }
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "flex-end",
                        width: "100%",
                        height: "100%",
                        padding: "6px 6px 4px",
                        border: "none",
                        background: "none",
                        color: "inherit",
                        font: "inherit",
                        cursor: "pointer",
                      }}
                      title={
                        active
                          ? "Clear the selection"
                          : "Only rows with views here, sorted by them"
                      }
                      type="button"
                    >
                      {label(col, colAxis, true)}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {shown.map(([row, total]) => {
              const focus = activeCol ? cell(row, activeCol) : undefined;
              return (
                <tr key={row}>
                  <td
                    style={{
                      padding: "4px 6px",
                      maxWidth: 260,
                      borderTop: "1px solid var(--theme-elevation-100)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        gap: 8,
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        {label(row, rowAxis, false)}
                        <span
                          style={{
                            ...muted,
                            display: "block",
                            fontSize: 11,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {focus ? (
                            <>
                              <strong style={{ color: "var(--theme-text)" }}>
                                {focus.count}
                              </strong>{" "}
                              of {total.count} · last{" "}
                              <strong style={{ color: "var(--theme-text)" }}>
                                {stamp(focus.lastAt)}
                              </strong>
                            </>
                          ) : (
                            <>
                              {total.count} · last {stamp(total.lastAt)}
                            </>
                          )}
                        </span>
                      </div>
                      {rowAxis === "device" && deleteButton(row, true)}
                    </div>
                  </td>
                  {columns.map((col) => {
                    const value = cell(row, col);
                    const isHovered =
                      hover?.kind === "cell" &&
                      hover.row === row &&
                      hover.col === col;
                    return (
                      <td
                        key={col}
                        onMouseEnter={() =>
                          setHover({ kind: "cell", row, col })
                        }
                        style={{
                          textAlign: "center",
                          padding: "6px 4px",
                          borderRadius: 6,
                          fontWeight: 600,
                          fontVariantNumeric: "tabular-nums",
                          outline: isHovered
                            ? "2px solid var(--theme-text)"
                            : undefined,
                          outlineOffset: -1,
                          ...(value ? shade(value.count) : {}),
                        }}
                      >
                        {value ? (
                          value.count
                        ) : (
                          <span style={{ color: "var(--theme-elevation-150)" }}>
                            ·
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td style={{ ...muted, ...footCell, padding: "6px 6px 4px" }}>
                {visits.length} in total
                <br />
                per column · last
              </td>
              {columns.map((col) => {
                const total = columnTotal(col);
                return (
                  <td
                    key={col}
                    style={{
                      ...muted,
                      ...footCell,
                      textAlign: "center",
                      lineHeight: 1.2,
                    }}
                  >
                    {total ? (
                      <>
                        <strong style={{ color: "var(--theme-text)" }}>
                          {total.count}
                        </strong>
                        <br />
                        {stamp(total.lastAt)}
                      </>
                    ) : null}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>

      {/* A line kept free: appearing only on hover, it would make the grid
          below jump with every move. */}
      <p style={{ ...muted, fontSize: 12, margin: "6px 0 0", minHeight: 18 }}>
        {readout ??
          (activeCol
            ? "Under each name: views and last view in the selected column."
            : "Point at a cell for count and last view – click a column header to see only that column.")}
      </p>

      {rows.length > MAX_ROWS && (
        <button
          onClick={() => setExpanded((e) => !e)}
          style={{
            marginTop: 6,
            border: "none",
            background: "none",
            color: "var(--theme-elevation-500)",
            font: "inherit",
            fontSize: 12,
            padding: 0,
            cursor: "pointer",
            textDecoration: "underline",
          }}
          type="button"
        >
          {expanded
            ? "Show less"
            : `Show all ${noun(rowAxis)} (${rows.length})`}
        </button>
      )}
    </div>
  );
};
