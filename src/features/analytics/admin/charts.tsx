"use client";

/**
 * The analytics global's charts – plain SVG, colored only through the
 * `.boop-viz` variables (admin.scss), so light and dark mode both fit. Thin
 * marks, hairline grid, values in text colors beside the marks; every chart
 * answers pointer AND keyboard, and has a table to read it without.
 *
 * The parts, in charts/: what they are drawn with (plot.ts), the card and
 * the legend (card.tsx), the area chart (area.tsx), a figure's sparkline
 * and meter (figure.tsx), the ring (ring.tsx) and the bars (bars.tsx).
 */

export { AreaChart, type TimePoint, timeTable } from "./charts/area";
export { type BarEntry, BarList, barTable } from "./charts/bars";
export { ChartCard, Key } from "./charts/card";
export { Meter, Sparkline } from "./charts/figure";
export { axisTicks } from "./charts/plot";
export { deviceSlices, Ring, type Slice } from "./charts/ring";
