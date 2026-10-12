"use client";

import {
  type KeyboardEvent,
  type PointerEvent,
  type PropsWithChildren,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { fmt, INK, LINE, MUTED, percent, TEXT } from "./parts";

/**
 * The analytics global's charts – plain SVG, colored only through the
 * `.boop-viz` variables (admin.scss), so light and dark mode both fit. Thin
 * marks, hairline grid, values in text colors beside the marks; every chart
 * answers pointer AND keyboard, and has a table to read it without.
 */

// ─── Basics ──────────────────────────────────────────────────────────────────

/** An element's width, followed as it changes. */
const useWidth = <T extends HTMLElement>() => {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width)
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
};

/** Round axis steps (1, 2, 5, 10 …) up to at least `max`. */
export const axisTicks = (max: number, count = 4) => {
  const raw = Math.max(1, max / count);
  const power = 10 ** Math.floor(Math.log10(raw));
  const n = raw / power;
  const step = Math.max(1, (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * power);
  const top = Math.max(step, Math.ceil(max / step) * step);
  const ticks: number[] = [];
  for (let value = 0; value <= top; value += step) ticks.push(value);
  return { top, ticks };
};

type XY = [number, number];

/**
 * A smooth line through points that never swings past them (monotone
 * cubic): between two hours with 3 and 5 views it stays between 3 and 5.
 */
const smooth = (points: XY[]) => {
  const n = points.length;
  if (n === 0) return "";
  if (n < 3) return `M${points.map(([x, y]) => `${x},${y}`).join("L")}`;
  const slopes: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    slopes.push((y1 - y0) / (x1 - x0 || 1));
  }
  const tangents = points.map((_, i) => {
    if (i === 0) return slopes[0];
    if (i === n - 1) return slopes[n - 2];
    const [a, b] = [slopes[i - 1], slopes[i]];
    return a * b <= 0 ? 0 : (a + b) / 2;
  });
  for (let i = 0; i < n - 1; i++) {
    if (slopes[i] === 0) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
      continue;
    }
    const a = tangents[i] / slopes[i];
    const b = tangents[i + 1] / slopes[i];
    const s = a * a + b * b;
    if (s > 9) {
      const k = 3 / Math.sqrt(s);
      tangents[i] = k * a * slopes[i];
      tangents[i + 1] = k * b * slopes[i];
    }
  }
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const h = (x1 - x0) / 3;
    d += `C${x0 + h},${y0 + h * tangents[i]} ${x1 - h},${y1 - h * tangents[i + 1]} ${x1},${y1}`;
  }
  return d;
};

// ─── Card, legend, table ─────────────────────────────────────────────────────

const toggleStyle = {
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
const Tip = ({
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

// ─── Area chart: a count over time ───────────────────────────────────────────

export type TimePoint = {
  /** Axis label, shown where `tick` is set. */
  label: string;
  /** Long name for the readout and the table. */
  title: string;
  count: number;
  /** The same moment of the period before, if there is one. */
  before?: number;
  /** Still running (this hour, today). */
  partial?: boolean;
  tick?: boolean;
  from: number;
  to: number;
};

const PLOT_H = 170;
const PAD_TOP = 14;
const AXIS_W = 34;
const AXIS_H = 24;

/**
 * A count over time as a soft area under a 2 px line, the period before as
 * a quiet gray line on the same axis. A cursor line follows the pointer to
 * the nearest hour or day and reads out both; a click (or Enter) chooses
 * that hour or day, once more lifts it. The running period ends in a ring.
 */
export const AreaChart = ({
  points,
  unit,
  selectedFrom = null,
  onSelect,
}: {
  points: TimePoint[];
  unit: string;
  selectedFrom?: number | null;
  onSelect?: (point: TimePoint) => void;
}) => {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const n = points.length;
  const hasBefore = points.some((point) => point.before !== undefined);
  const max = Math.max(
    1,
    ...points.map((point) => Math.max(point.count, point.before ?? 0))
  );
  const { top, ticks } = axisTicks(max);
  const plotW = Math.max(0, width - AXIS_W - 6);
  const xOf = (i: number) =>
    AXIS_W + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const yOf = (value: number) => PAD_TOP + PLOT_H - (value / top) * PLOT_H;
  const step = n <= 1 ? plotW : plotW / (n - 1);

  const line = points.map((point, i): XY => [xOf(i), yOf(point.count)]);
  const path = smooth(line);
  const area =
    n > 1 ? `${path}L${xOf(n - 1)},${yOf(0)}L${xOf(0)},${yOf(0)}Z` : "";
  const beforePath = hasBefore
    ? smooth(points.map((point, i): XY => [xOf(i), yOf(point.before ?? 0)]))
    : null;
  const selected = points.findIndex((point) => point.from === selectedFrom);

  const indexAt = (clientX: number) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box || n === 0) return null;
    const x = clientX - box.left - AXIS_W;
    return Math.min(n - 1, Math.max(0, Math.round(x / (step || 1))));
  };
  const onPointer = (event: PointerEvent) => setActive(indexAt(event.clientX));
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const from = active ?? (selected >= 0 ? selected : n - 1);
      const next = from + (event.key === "ArrowRight" ? 1 : -1);
      setActive(Math.min(n - 1, Math.max(0, next)));
    } else if (
      (event.key === "Enter" || event.key === " ") &&
      active !== null
    ) {
      event.preventDefault();
      onSelect?.(points[active]);
    }
  };

  const current = active === null ? null : points[active];
  const last = points[n - 1];

  // For the keyboard a slider over the hours or days: arrows move the
  // cursor, Enter chooses.
  const at = active ?? (selected >= 0 ? selected : n - 1);
  return (
    <div
      aria-label={`${unit} over time – arrow keys move the cursor${onSelect ? ", Enter chooses the hour or day" : ""}`}
      aria-valuemax={Math.max(0, n - 1)}
      aria-valuemin={0}
      aria-valuenow={Math.max(0, at)}
      aria-valuetext={
        points[at]
          ? `${points[at].title}: ${fmt(points[at].count)} ${unit}`
          : undefined
      }
      className="boop-viz__focusable"
      onBlur={() => setActive(null)}
      onClick={() =>
        active !== null && onSelect ? onSelect(points[active]) : undefined
      }
      onKeyDown={onKey}
      onPointerLeave={() => setActive(null)}
      onPointerMove={onPointer}
      ref={ref}
      role="slider"
      style={{
        cursor: onSelect ? "pointer" : "default",
        height: PAD_TOP + PLOT_H + AXIS_H,
        position: "relative",
        touchAction: "pan-y",
      }}
      tabIndex={0}
    >
      {width > 0 && (
        <svg
          aria-hidden
          height={PAD_TOP + PLOT_H + AXIS_H}
          style={{ display: "block", overflow: "visible" }}
          width={width}
        >
          {ticks.map((value) => (
            <g key={value}>
              <line
                stroke={
                  value === 0
                    ? "var(--theme-elevation-250)"
                    : "var(--theme-elevation-100)"
                }
                strokeWidth={1}
                x1={AXIS_W}
                x2={width}
                y1={yOf(value)}
                y2={yOf(value)}
              />
              <text
                dominantBaseline="middle"
                fill={MUTED}
                fontSize={11}
                style={{ fontVariantNumeric: "tabular-nums" }}
                textAnchor="end"
                x={AXIS_W - 8}
                y={yOf(value)}
              >
                {fmt(value)}
              </text>
            </g>
          ))}

          {selected >= 0 && (
            <rect
              fill="var(--viz-select)"
              height={PLOT_H}
              rx={4}
              width={Math.max(6, step)}
              x={xOf(selected) - Math.max(6, step) / 2}
              y={PAD_TOP}
            />
          )}

          {beforePath && (
            <path
              d={beforePath}
              fill="none"
              stroke="var(--viz-before)"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeOpacity={0.7}
              strokeWidth={2}
            />
          )}
          {area && <path d={area} fill="var(--viz-wash)" />}
          <path
            d={path}
            fill="none"
            stroke="var(--viz-1)"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
          />

          {points.map((point, i) =>
            point.tick === false ? null : (
              <text
                fill={MUTED}
                fontSize={11}
                key={`${point.from}`}
                textAnchor={
                  i === 0 && n > 1
                    ? "start"
                    : i === n - 1 && n > 1
                      ? "end"
                      : "middle"
                }
                x={xOf(i)}
                y={PAD_TOP + PLOT_H + 17}
              >
                {point.label}
              </text>
            )
          )}

          {/* The last value: an end dot – a ring while still running. */}
          {last && (
            <circle
              cx={xOf(n - 1)}
              cy={yOf(last.count)}
              fill={last.partial ? "var(--theme-elevation-0)" : "var(--viz-1)"}
              r={4}
              stroke={
                last.partial ? "var(--viz-1)" : "var(--theme-elevation-0)"
              }
              strokeWidth={2}
            />
          )}

          {current && active !== null && (
            <g>
              <line
                stroke="var(--theme-elevation-400)"
                strokeWidth={1}
                x1={xOf(active)}
                x2={xOf(active)}
                y1={PAD_TOP}
                y2={PAD_TOP + PLOT_H}
              />
              {current.before !== undefined && (
                <circle
                  cx={xOf(active)}
                  cy={yOf(current.before)}
                  fill="var(--viz-before)"
                  r={4}
                  stroke="var(--theme-elevation-0)"
                  strokeWidth={2}
                />
              )}
              <circle
                cx={xOf(active)}
                cy={yOf(current.count)}
                fill="var(--viz-1)"
                r={5}
                stroke="var(--theme-elevation-0)"
                strokeWidth={2}
              />
            </g>
          )}
        </svg>
      )}

      {current && active !== null && (
        <Tip width={width} x={xOf(active)} y={PAD_TOP}>
          <strong style={{ fontSize: 13 }}>{fmt(current.count)}</strong> {unit}
          {current.partial ? " so far" : ""}
          {current.before !== undefined && (
            <span style={{ display: "block", opacity: 0.75 }}>
              {fmt(current.before)} before
            </span>
          )}
          <span style={{ display: "block", opacity: 0.75 }}>
            {current.title}
          </span>
          {onSelect && (
            <span style={{ display: "block", fontSize: 11, opacity: 0.6 }}>
              {current.from === selectedFrom
                ? "Click: the whole range again"
                : "Click: only this in Visitors & Actions"}
            </span>
          )}
        </Tip>
      )}
    </div>
  );
};

/** The area chart's numbers as table rows. */
export const timeTable = (points: TimePoint[], unit: string) => {
  const before = points.some((point) => point.before !== undefined);
  return {
    head: ["When", unit, ...(before ? ["Before"] : [])],
    rows: points.map((point) => [
      `${point.title}${point.partial ? " (so far)" : ""}`,
      point.count,
      ...(before ? [point.before ?? 0] : []),
    ]),
  };
};

// ─── Sparkline: a figure's course ────────────────────────────────────────────

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

// ─── Ring: a whole in a few parts ────────────────────────────────────────────

export type Slice = { name: string; value: number; color: string };

/**
 * A whole in up to four parts – desktop, mobile, tablet, other – as a ring
 * with the total in the middle (the part's own, while pointed at), and a
 * legend with every number and share beside it.
 */
export const Ring = ({ slices, unit }: { slices: Slice[]; unit: string }) => {
  const [active, setActive] = useState<number | null>(null);
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const size = 132;
  const stroke = 16;
  // Room for the hovered part, which grows by 4 px.
  const r = (size - stroke - 4) / 2;
  const c = 2 * Math.PI * r;
  const gap = slices.length > 1 ? 2.5 : 0;
  let at = 0;
  const arcs = slices.map((slice) => {
    const length = total > 0 ? (slice.value / total) * c : 0;
    const arc = { ...slice, start: at, length };
    at += length;
    return arc;
  });
  const shown = active === null ? null : slices[active];

  return (
    <div
      style={{
        alignItems: "center",
        display: "flex",
        flexWrap: "wrap",
        gap: "12px 24px",
      }}
    >
      <div style={{ height: size, position: "relative", width: size }}>
        <svg
          aria-hidden
          height={size}
          style={{ transform: "rotate(-90deg)" }}
          width={size}
        >
          {total === 0 && (
            <circle
              cx={size / 2}
              cy={size / 2}
              fill="none"
              r={r}
              stroke="var(--theme-elevation-100)"
              strokeWidth={stroke}
            />
          )}
          {arcs.map((arc, i) =>
            arc.length <= 0 ? null : (
              <circle
                cx={size / 2}
                cy={size / 2}
                fill="none"
                key={arc.name}
                onPointerEnter={() => setActive(i)}
                onPointerLeave={() => setActive(null)}
                opacity={active === null || active === i ? 1 : 0.35}
                r={r}
                stroke={arc.color}
                strokeDasharray={`${Math.max(0.5, arc.length - gap)} ${c}`}
                strokeDashoffset={-arc.start}
                strokeWidth={active === i ? stroke + 4 : stroke}
                style={{
                  transition: "opacity 120ms ease, stroke-width 120ms ease",
                }}
              />
            )
          )}
        </svg>
        <div
          style={{
            alignItems: "center",
            display: "flex",
            flexDirection: "column",
            inset: 0,
            justifyContent: "center",
            pointerEvents: "none",
            position: "absolute",
          }}
        >
          <strong style={{ color: INK, fontSize: 22, lineHeight: 1.1 }}>
            {fmt(shown ? shown.value : total)}
          </strong>
          <span style={{ color: MUTED, fontSize: 11 }}>
            {shown ? shown.name : unit}
          </span>
        </div>
      </div>
      <ul
        style={{
          display: "grid",
          flex: "1 1 160px",
          gap: 4,
          listStyle: "none",
          margin: 0,
          padding: 0,
        }}
      >
        {slices.map((slice, i) => (
          <li key={slice.name}>
            <button
              onBlur={() => setActive(null)}
              onFocus={() => setActive(i)}
              onPointerEnter={() => setActive(i)}
              onPointerLeave={() => setActive(null)}
              style={{
                alignItems: "center",
                background: active === i ? "var(--theme-elevation-50)" : "none",
                border: "none",
                borderRadius: 6,
                color: TEXT,
                cursor: "default",
                display: "flex",
                font: "inherit",
                fontSize: 13,
                gap: 8,
                padding: "4px 6px",
                textAlign: "left",
                width: "100%",
              }}
              type="button"
            >
              <Key color={slice.color}>{slice.name}</Key>
              <span style={{ flex: 1 }} />
              <strong
                style={{ color: INK, fontVariantNumeric: "tabular-nums" }}
              >
                {fmt(slice.value)}
              </strong>
              <span
                style={{
                  color: MUTED,
                  fontSize: 12,
                  fontVariantNumeric: "tabular-nums",
                  minWidth: 40,
                  textAlign: "right",
                }}
              >
                {percent(slice.value, total)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

/** The three device classes – their colors stay put, whatever is filtered. */
const CLASS_COLORS: Record<string, string> = {
  desktop: "var(--viz-1)",
  mobile: "var(--viz-2)",
  tablet: "var(--viz-3)",
};

/**
 * Counts by device class as ring slices – desktop, mobile, tablet in fixed
 * colors, anything else folded into “Other”.
 */
export const deviceSlices = (classes: (string | null | undefined)[]) => {
  const counts = new Map<string, number>();
  for (const value of classes) {
    const key = value && value in CLASS_COLORS ? value : "Other";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...Object.keys(CLASS_COLORS), "Other"]
    .filter((name) => counts.has(name))
    .map((name) => ({
      name,
      value: counts.get(name) ?? 0,
      color: CLASS_COLORS[name] ?? "var(--viz-other)",
    }));
};

// ─── Bars: a ranking, optionally against before ──────────────────────────────

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
