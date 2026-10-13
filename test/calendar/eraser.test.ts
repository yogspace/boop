import { describe, expect, it } from "vitest";
import {
  type Art,
  insideFill,
  sampleStroke,
} from "../../src/features/calendar/art";
import { erase, startErasing } from "../../src/features/calendar/eraser";
import type { Fill, Stroke } from "../../src/features/calendar/model";

const line = (w: number, ...p: number[]): Stroke => ({ w, p });
const art = (strokes: Stroke[], fills: Fill[] = []): Art => ({
  strokes,
  fills,
});
/** An eraser straight down through x, top to bottom. */
const down = (x: number, w = 0.05) => ({ w, p: [x, 0.1, x, 0.9] });

const xs = (stroke: Stroke) => stroke.p.filter((_, i) => i % 2 === 0);
const area = (ring: number[]) => {
  let sum = 0;
  const n = ring.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    sum += ring[2 * j] * ring[2 * i + 1] - ring[2 * i] * ring[2 * j + 1];
  }
  return Math.abs(sum / 2);
};

describe("the eraser on lines", () => {
  const across = line(0.05, 0.2, 0.5, 0.8, 0.5);

  it("cuts a line in two where it crosses – the round ends stop at its edge", () => {
    const { strokes } = erase(art([across]), down(0.5));
    expect(strokes).toHaveLength(2);
    const [left, right] = strokes;
    // Eraser half 0.025, line half 0.025: nothing nearer than 0.05.
    expect(Math.max(...xs(left))).toBeLessThanOrEqual(0.45 + 1e-9);
    expect(Math.max(...xs(left))).toBeGreaterThan(0.44);
    expect(Math.min(...xs(right))).toBeGreaterThanOrEqual(0.55 - 1e-9);
    expect(Math.min(...xs(right))).toBeLessThan(0.56);
    // The rest stays where it was, as wide as it was.
    expect(Math.min(...xs(left))).toBe(0.2);
    expect(Math.max(...xs(right))).toBe(0.8);
    expect(left.w).toBe(0.05);
    expect(right.w).toBe(0.05);
  });

  it("takes the line's width into account", () => {
    const thick = line(0.085, 0.2, 0.5, 0.8, 0.5);
    const [left] = erase(art([thick]), down(0.5)).strokes;
    expect(Math.max(...xs(left))).toBeLessThanOrEqual(0.5 - 0.025 - 0.0425);
  });

  it("shortens a line at its end", () => {
    const { strokes } = erase(art([across]), down(0.78));
    expect(strokes).toHaveLength(1);
    expect(Math.max(...xs(strokes[0]))).toBeLessThanOrEqual(0.73 + 1e-9);
    expect(Math.min(...xs(strokes[0]))).toBe(0.2);
  });

  it("takes away a line it covers entirely", () => {
    const along = { w: 0.08, p: [0.15, 0.5, 0.85, 0.5] };
    expect(erase(art([across]), along).strokes).toEqual([]);
  });

  it("leaves what it doesn't reach as it was – the very same drawing", () => {
    const drawing = art([across]);
    expect(erase(drawing, { w: 0.05, p: [0.5, 0.1, 0.6, 0.2] })).toBe(drawing);
    // A line nearby but out of reach stays the same object.
    const other = line(0.03, 0.1, 0.9, 0.3, 0.9);
    const { strokes } = erase(art([across, other]), down(0.5, 0.05));
    expect(strokes).toContain(other);
  });

  it("keeps what is left of a curve on the curve", () => {
    const curve = line(
      0.04,
      0.2,
      0.7,
      0.35,
      0.3,
      0.5,
      0.25,
      0.65,
      0.3,
      0.8,
      0.7
    );
    const drawn = sampleStroke(curve.p, 0.001);
    const { strokes } = erase(art([curve]), down(0.5));
    expect(strokes.length).toBe(2);
    for (const piece of strokes) {
      // Each piece as it is drawn lies on the original as it was drawn.
      const again = sampleStroke(piece.p, 0.004);
      for (let i = 0; i < again.length; i += 2) {
        let near = Infinity;
        for (let k = 0; k < drawn.length; k += 2) {
          near = Math.min(
            near,
            Math.hypot(drawn[k] - again[i], drawn[k + 1] - again[i + 1])
          );
        }
        expect(near).toBeLessThan(0.003);
      }
    }
  });

  it("goes along with the pointer – the same as all at once", () => {
    const eraser = startErasing(art([across]), 0.05);
    const drawing = art([across]);
    eraser.add(0.5, 0.1);
    expect(eraser.art()).toEqual(drawing);
    eraser.add(0.5, 0.45);
    // Not yet at the line: nothing gone.
    expect(eraser.art().strokes).toEqual([across]);
    eraser.add(0.5, 0.9);
    expect(eraser.art()).toEqual(erase(drawing, down(0.5)));
  });
});

describe("the eraser on an uploaded picture's areas", () => {
  const square: Fill = { p: [[0.2, 0.2, 0.8, 0.2, 0.8, 0.8, 0.2, 0.8]] };

  it("parts an area in two, even-odd, with the eraser's way gone", () => {
    const [cut] = erase(art([], [square]), down(0.5)).fills;
    expect(cut.rule).toBe("evenodd");
    expect(cut.p).toHaveLength(2);
    expect(insideFill(cut, 0.3, 0.5)).toBe(true);
    expect(insideFill(cut, 0.7, 0.5)).toBe(true);
    expect(insideFill(cut, 0.5, 0.5)).toBe(false);
    expect(insideFill(cut, 0.5, 0.3)).toBe(false);
    // The rest keeps its size: 0.6 × 0.6 less a band 0.05 wide.
    const left = cut.p.reduce((sum, ring) => sum + area(ring), 0);
    expect(left).toBeCloseTo(0.36 - 0.6 * 0.05, 2);
    // Its edges where they were.
    for (const ring of cut.p) {
      for (let i = 0; i < ring.length; i += 2) {
        expect(ring[i]).toBeGreaterThanOrEqual(0.198);
        expect(ring[i]).toBeLessThanOrEqual(0.802);
        expect(Math.abs(ring[i] - 0.5)).toBeGreaterThan(0.023);
      }
    }
  });

  it("keeps a hole a hole", () => {
    const ring: Fill = {
      p: [
        [0.2, 0.2, 0.8, 0.2, 0.8, 0.8, 0.2, 0.8],
        [0.4, 0.4, 0.6, 0.4, 0.6, 0.6, 0.4, 0.6],
      ],
      rule: "evenodd",
    };
    const [cut] = erase(art([], [ring]), {
      w: 0.04,
      p: [0.3, 0.1, 0.3, 0.9],
    }).fills;
    expect(insideFill(cut, 0.5, 0.5)).toBe(false);
    expect(insideFill(cut, 0.7, 0.5)).toBe(true);
    expect(insideFill(cut, 0.5, 0.3)).toBe(true);
    expect(insideFill(cut, 0.3, 0.5)).toBe(false);
  });

  it("takes away an area it covers entirely – and leaves others alone", () => {
    const dot: Fill = { p: [[0.48, 0.48, 0.52, 0.48, 0.52, 0.52, 0.48, 0.52]] };
    const far: Fill = { p: [[0.1, 0.1, 0.15, 0.1, 0.15, 0.15]] };
    const { fills } = erase(art([], [dot, far]), down(0.5, 0.1));
    expect(fills).toEqual([far]);
    expect(fills[0]).toBe(far);
  });
});
