"use client";

import { type KeyboardEvent, type PointerEvent, useState } from "react";
import { fmt, MUTED } from "../parts";
import { Tip } from "./card";
import { axisTicks, smooth, useWidth, type XY } from "./plot";

/**
 * The area chart: a count over time, against the period before – and its
 * numbers as a table.
 */

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
