import { describe, expect, it } from "vitest";
import { sampleStroke } from "../../src/features/calendar/art";
import { keepLine, steady } from "../../src/features/calendar/freehand";

type Point = [number, number];

/** Numbers that look random but come again – a hand's tremor. */
const shaky = (seed: number) => {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648 - 0.5;
  };
};

/** A circle drawn by a shaky finger – its points, every few px. */
const drawn = (jitter: number) => {
  const noise = shaky(7);
  return Array.from({ length: 240 }, (_, i): Point => {
    const a = (i / 239) * Math.PI * 1.8;
    return [
      0.5 + Math.cos(a) * 0.3 + noise() * jitter,
      0.5 + Math.sin(a) * 0.3 + noise() * jitter,
    ];
  });
};

/** How far a line strays from the circle it was meant to be. */
const stray = (p: readonly number[]) => {
  const off = [];
  for (let i = 0; i + 1 < p.length; i += 2) {
    off.push(Math.abs(Math.hypot(p[i] - 0.5, p[i + 1] - 0.5) - 0.3));
  }
  return {
    mean: off.reduce((a, b) => a + b, 0) / off.length,
    most: Math.max(...off),
  };
};

/** How much a line turns back and forth – its wobble. */
const wobble = (p: readonly number[]) => {
  let sum = 0;
  let n = 0;
  for (let i = 2; i + 3 < p.length; i += 2) {
    const a = Math.atan2(p[i + 1] - p[i - 1], p[i] - p[i - 2]);
    const b = Math.atan2(p[i + 3] - p[i + 1], p[i + 2] - p[i]);
    let d = b - a;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    sum += d * d;
    n++;
  }
  return sum / n;
};

const through = (points: Point[], reach: number) => {
  const brush = steady(points[0][0], points[0][1], { reach });
  const line: Point[] = [points[0]];
  for (const [x, y] of points.slice(1, -1)) line.push(...brush.to(x, y));
  const [ex, ey] = points[points.length - 1];
  line.push(...brush.end(ex, ey));
  return line;
};

describe("a freehand line", () => {
  it("leaves a shaky hand's tremor behind", () => {
    const raw = drawn(0.012);
    const calm = through(raw, 0.012);
    const rawLine = raw.flat();
    const calmLine = calm.flat();
    expect(wobble(sampleStroke(calmLine, 0.01))).toBeLessThan(
      wobble(sampleStroke(rawLine, 0.01)) / 3
    );
    // … and still runs where it was drawn.
    expect(stray(calmLine).mean).toBeLessThan(0.008);
  });

  it("begins where it was put down, ends where it was let go", () => {
    const raw = drawn(0.01);
    const calm = through(raw, 0.012);
    expect(calm[0]).toEqual(raw[0]);
    expect(calm[calm.length - 1]).toEqual(raw[raw.length - 1]);
  });

  it("stays put while the pointer trembles within reach", () => {
    const brush = steady(0.5, 0.5, { reach: 0.01 });
    const noise = shaky(3);
    for (let i = 0; i < 50; i++) {
      expect(brush.to(0.5 + noise() * 0.015, 0.5 + noise() * 0.015)).toEqual(
        []
      );
    }
  });

  it("keeps only the points it needs – a corner sharp, a dot a dot", () => {
    // Along two sides of a square, a point every 0.002.
    const side: Point[] = [
      ...Array.from({ length: 200 }, (_, i): Point => [0.1 + i * 0.002, 0.1]),
      ...Array.from({ length: 200 }, (_, i): Point => [0.5, 0.1 + i * 0.002]),
    ];
    const kept = keepLine(side, { tolerance: 0.001, near: 0.004 });
    expect(kept.length / 2).toBeLessThan(10);
    // Drawn through the middles of its points, it still reaches the corner.
    const curve = sampleStroke(kept, 0.001);
    let nearest = Infinity;
    for (let i = 0; i + 1 < curve.length; i += 2) {
      nearest = Math.min(
        nearest,
        Math.hypot(curve[i] - 0.5, curve[i + 1] - 0.1)
      );
    }
    expect(nearest).toBeLessThan(0.003);
    expect(keepLine([[0.3, 0.3]], { tolerance: 0.001, near: 0.004 })).toEqual([
      0.3, 0.3,
    ]);
  });

  it("keeps a small wiggle bigger than its tolerance", () => {
    const wiggle: Point[] = Array.from({ length: 100 }, (_, i) => [
      0.2 + i * 0.004,
      0.5 + (i % 20 < 10 ? 0 : 0.01),
    ]);
    const kept = keepLine(wiggle, { tolerance: 0.002, near: 0.004 });
    const ys = kept.filter((_, i) => i % 2 === 1);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(0.01, 3);
  });
});
