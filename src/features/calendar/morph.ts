import { type Point, ringArea } from "./path";

/**
 * One outline turning into another – a stamp's shape picked anew while it
 * is drawn on (morph-outline.tsx). Both become rings of as many points,
 * evenly along their length; the second is turned round until its points
 * lie as near as they can to the first's, so each point has a short way to
 * go and the outline doesn't twist on its way. Then every point goes its
 * own way, all at once (`between`).
 *
 * Plain numbers, no browser – any rings, closed, either way round.
 */

/** A closed ring of points, `count` evenly along its length from its first. */
export const evenly = (ring: readonly Point[], count: number): Point[] => {
  const n = ring.length;
  if (!n) return [];
  const lengths = [0];
  for (let i = 1; i <= n; i++) {
    const [ax, ay] = ring[i - 1];
    const [bx, by] = ring[i % n];
    lengths.push(lengths[i - 1] + Math.hypot(bx - ax, by - ay));
  }
  const total = lengths[n];
  if (!total) return Array.from({ length: count }, () => [...ring[0]] as Point);
  const points: Point[] = [];
  let j = 0;
  for (let i = 0; i < count; i++) {
    const s = (i / count) * total;
    while (j < n - 1 && lengths[j + 1] < s) j++;
    const t = (s - lengths[j]) / (lengths[j + 1] - lengths[j] || 1);
    const [ax, ay] = ring[j];
    const [bx, by] = ring[(j + 1) % n];
    points.push([ax + (bx - ax) * t, ay + (by - ay) * t]);
  }
  return points;
};

/**
 * Two rings made ready to morph: `count` points each, evenly along them,
 * the same way round as the first – the second started at the point that
 * puts all its points nearest to the first's (the least squared distance
 * summed over every pair).
 */
export const matched = (
  from: readonly Point[],
  to: readonly Point[],
  count: number
): [Point[], Point[]] => {
  const a = evenly(from, count);
  // The other way round: turned, or its points would cross over.
  const same = ringArea(from) * ringArea(to) >= 0;
  const b = evenly(same ? to : [...to].reverse(), count);
  let best = 0;
  let least = Infinity;
  for (let k = 0; k < count; k++) {
    let sum = 0;
    for (let i = 0; i < count && sum < least; i++) {
      const [bx, by] = b[(i + k) % count];
      sum += (a[i][0] - bx) ** 2 + (a[i][1] - by) ** 2;
    }
    if (sum < least) {
      least = sum;
      best = k;
    }
  }
  return [a, [...b.slice(best), ...b.slice(0, best)]];
};

/**
 * The way from one matched ring to the other at `t` (0: the first, 1: the
 * second) – beyond 1 too, where a spring overshoots.
 */
export const between = (
  a: readonly Point[],
  b: readonly Point[],
  t: number
): Point[] =>
  a.map(([ax, ay], i) => [ax + (b[i][0] - ax) * t, ay + (b[i][1] - ay) * t]);

/** A ring as an SVG path – straight from point to point, closed. */
export const ringPath = (ring: readonly Point[]) =>
  ring.length
    ? `M${ring.map(([x, y]) => `${x.toFixed(4)} ${y.toFixed(4)}`).join("L")}Z`
    : "";
