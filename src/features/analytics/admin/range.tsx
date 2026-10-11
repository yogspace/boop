"use client";

import { rangeOptions, rangeWindow, setRange, useAnalytics } from "./data";
import { INK, LINE, MUTED } from "./parts";

const stamp = (t: number) =>
  new Date(t).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

/**
 * The time range for the whole analytics global – in the sidebar, so it
 * stays in sight while scrolling through the sections. A list rather than a
 * switch: the sidebar is narrow.
 */
export const AnalyticsRange = () => {
  const { data, range } = useAnalytics();
  const lastDigestAt = data?.lastDigestAt ?? null;
  const w = rangeWindow(range, lastDigestAt);

  return (
    <div className="field-type">
      <fieldset
        aria-label="Time range"
        style={{
          border: `1px solid ${LINE}`,
          borderRadius: "var(--style-radius-m)",
          display: "flex",
          flexDirection: "column",
          margin: 0,
          minInlineSize: 0,
          overflow: "hidden",
          padding: 0,
        }}
      >
        {rangeOptions(lastDigestAt).map((option, i) => {
          const on = option.value === range;
          return (
            <button
              aria-pressed={on}
              key={option.value}
              onClick={() => setRange(option.value)}
              style={{
                alignItems: "center",
                background: on ? "var(--theme-elevation-100)" : "transparent",
                border: "none",
                borderTop: i === 0 ? "none" : `1px solid ${LINE}`,
                color: on ? INK : "var(--theme-elevation-700)",
                cursor: "pointer",
                display: "flex",
                fontSize: 13,
                fontWeight: on ? 600 : 400,
                gap: 8,
                justifyContent: "space-between",
                padding: "8px 12px",
                textAlign: "left",
              }}
              type="button"
            >
              {option.label}
              {on && (
                <span aria-hidden style={{ fontSize: 14, fontWeight: 700 }}>
                  ✓
                </span>
              )}
            </button>
          );
        })}
      </fieldset>
      <p style={{ color: MUTED, fontSize: 12, margin: "8px 0 0" }}>
        {stamp(w.from)} – {w.open ? "now" : stamp(w.to)}
      </p>
    </div>
  );
};
