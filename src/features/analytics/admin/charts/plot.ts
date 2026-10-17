"use client";

import { useEffect, useRef, useState } from "react";

/**
 * What every chart is drawn with: the width it has, round axis steps, and
 * a smooth line through its points.
 */

/** An element's width, followed as it changes. */
export const useWidth = <T extends HTMLElement>() => {
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

export type XY = [number, number];

/**
 * A smooth line through points that never swings past them (monotone
 * cubic): between two hours with 3 and 5 views it stays between 3 and 5.
 */
export const smooth = (points: XY[]) => {
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
