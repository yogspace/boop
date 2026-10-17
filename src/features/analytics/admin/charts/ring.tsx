"use client";

import { useState } from "react";
import { fmt, INK, MUTED, percent, TEXT } from "../parts";
import { Key } from "./card";

/** The ring: a whole in a few parts – the device classes, above all. */

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
