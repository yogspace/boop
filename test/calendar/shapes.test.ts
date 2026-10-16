import { describe, expect, it } from "vitest";
import { FACE } from "../../src/features/calendar/model";
import {
  outlineBox,
  outlineCount,
  outlineDistance,
  outlinePath,
  outlinePoints,
} from "../../src/features/calendar/outline";
import {
  anchorsOf,
  corners,
  flattenPiece,
  readPath,
  ringArea,
  ringOf,
} from "../../src/features/calendar/path";
import {
  cleanShapes,
  DEFAULT_SHAPES,
  getShapes,
  isOutline,
  knownShape,
  setShapes,
  shapeOf,
} from "../../src/features/calendar/shapes";

type Point = [number, number];

describe("an SVG path", () => {
  it("reads every command, absolute and relative", () => {
    const [piece] =
      readPath("M10 10 h10 v10 H10 V10 l5 5 L0 0 c1 1 2 2 3 3 s1 1 2 2") ?? [];
    expect(piece.start).toEqual([10, 10]);
    expect(piece.segments.map((s) => s.to)).toEqual([
      [20, 10],
      [20, 20],
      [10, 20],
      [10, 10],
      [15, 15],
      [0, 0],
      [3, 3],
      [5, 5],
    ]);
    // S mirrors the handle before it.
    expect(piece.segments[7].c1).toEqual([4, 4]);
    // Quadratics become cubics – the same curve.
    const [quad] = readPath("M0 0Q10 10 20 0T40 0") ?? [];
    expect(quad.segments[0].c1?.[0]).toBeCloseTo(20 / 3, 9);
    expect(quad.segments[1].c1?.[1]).toBeCloseTo(-20 / 3, 9);
  });

  it("keeps on after a Z where it closed, and in a new piece", () => {
    const pieces = readPath("M0 0L10 0L10 10Zl5 0") ?? [];
    expect(pieces).toHaveLength(2);
    expect(pieces[0].closed).toBe(true);
    expect(pieces[1].start).toEqual([0, 0]);
    expect(pieces[1].segments[0].to).toEqual([5, 0]);
  });

  it("draws arcs round – flags written together, too", () => {
    const [circle] = readPath("M98 50a48 48 0 1150 0A48 48 0 0 1 98 50z") ?? [];
    expect(circle).toBeTruthy();
    const ring = ringOf(readPath("M98 50A48 48 0 0 1 2 50A48 48 0 0 1 98 50Z"));
    expect(ring).not.toBeNull();
    for (const [x, y] of ring ?? []) {
      expect(Math.hypot(x - 50, y - 50)).toBeCloseTo(48, 1);
    }
  });

  it("refuses what isn't one", () => {
    for (const junk of ["", "hello", "L1 1", "M1", "M1 1 L2", "M0 0 X1 1", 7]) {
      expect(readPath(junk)).toBeNull();
    }
    expect(isOutline("M0 0L10 0")).toBe(false);
    expect(isOutline("M0 0L10 0L10 10Z")).toBe(true);
  });

  it("gives its outline clockwise on screen, whichever way it was drawn", () => {
    const one = ringOf(readPath("M0 0L10 0L10 10L0 10Z")) ?? [];
    const other = ringOf(readPath("M0 0L0 10L10 10L10 0Z")) ?? [];
    expect(ringArea(one)).toBeGreaterThan(0);
    expect(ringArea(other)).toBeGreaterThan(0);
  });

  it("becomes anchors to edit – handles where it bends, closed where it closes", () => {
    const [piece] = readPath("M0 0C0 5 5 10 10 10L10 0Z") ?? [];
    const { a, closed } = anchorsOf(piece);
    expect(closed).toBe(true);
    // Three anchors: the start (its handle out bent), the curve's end (its
    // handle in bent), and the line's end.
    expect(a).toEqual([
      0, 0, 0, 0, 0, 5, 10, 10, 5, 10, 10, 10, 10, 0, 10, 0, 10, 0,
    ]);
  });

  it("keeps only the corners a line needs", () => {
    const line: Point[] = [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
      [3, 1],
      [3, 2],
      [0, 2],
    ];
    expect(corners(line, 1e-6)).toEqual([0, 3, 5, 6]);
    // A curve flattened within its tolerance.
    const [arc] = readPath("M0 0A10 10 0 0 1 20 0") ?? [];
    const points = flattenPiece(arc, 0.01);
    for (const [x, y] of points) {
      expect(Math.abs(Math.hypot(x - 10, y) - 10)).toBeLessThan(0.011);
    }
  });
});

describe("the stamp shapes", () => {
  it("are checked as they come from the CMS", () => {
    const clean = cleanShapes([
      { key: "blob", name: { de: "Klecks" }, d: "M0 0L10 0L5 10Z" },
      { key: "blob", name: "Twice", d: "M0 0L10 0L5 10Z" },
      { key: "Bad Key", name: "x", d: "M0 0L10 0L5 10Z" },
      { key: "open", name: "x", d: "M0 0L10 0" },
      { key: "heart", d: " M0 0L10 0L5 10Z " },
      null,
    ]);
    expect(clean.map((shape) => shape.key)).toEqual(["blob", "heart"]);
    // A missing name: the other language's – or the code's for its key.
    expect(clean[0].name).toEqual({ de: "Klecks", en: "Klecks" });
    expect(clean[1].name).toEqual({ de: "Herz", en: "Heart" });
    expect(clean[1].d).toBe("M0 0L10 0L5 10Z");
    expect(cleanShapes("nope")).toEqual([]);
  });

  it("show an unknown key as the first – and keep the code's without any", () => {
    setShapes([{ key: "tri", name: "Tri", d: "M0 0L10 0L5 10Z" }]);
    expect(getShapes().map((shape) => shape.key)).toEqual(["tri"]);
    expect(shapeOf("circle").key).toBe("tri");
    expect(knownShape("circle")).toBe("tri");
    setShapes([]);
    expect(getShapes().map((shape) => shape.key)).toEqual(["tri"]);
    setShapes(DEFAULT_SHAPES);
    expect(knownShape("heart")).toBe("heart");
  });
});

/** Today's convex shapes as outline.ts drew them before shapes were paths. */
const BEFORE: Record<string, { points: Point[]; corner: number }> = {
  circle: { points: [[0, 0]], corner: 1 },
  square: {
    points: [
      [-0.48, -0.48],
      [0.48, -0.48],
      [0.48, 0.48],
      [-0.48, 0.48],
    ],
    corner: 0.13,
  },
  octagon: {
    points: Array.from({ length: 8 }, (_, i): Point => {
      const a = ((i + 0.5) / 8) * Math.PI * 2;
      const r = 0.48 / Math.cos(Math.PI / 8);
      return [Math.cos(a) * r, Math.sin(a) * r];
    }),
    corner: 0.06,
  },
  triangle: {
    points: [0, 1, 2].map((i): Point => {
      const a = -Math.PI / 2 + (i / 3) * Math.PI * 2;
      return [Math.cos(a), Math.sin(a)];
    }),
    corner: 0.15,
  },
  diamond: {
    points: [
      [0, -1],
      [0.86, 0],
      [0, 1],
      [-0.86, 0],
    ],
    corner: 0.13,
  },
};

const before = (shape: string, count = 720): Point[] => {
  const { points, corner } = BEFORE[shape];
  const n = points.length;
  let core = points;
  if (n >= 3) {
    const lines = points.map(([x0, y0], i) => {
      const [x1, y1] = points[(i + 1) % n];
      const l = Math.hypot(x1 - x0, y1 - y0);
      return {
        x: x0 + (-(y1 - y0) / l) * corner,
        y: y0 + ((x1 - x0) / l) * corner,
        dx: x1 - x0,
        dy: y1 - y0,
      };
    });
    core = lines.map((b, i) => {
      const a = lines[(i + n - 1) % n];
      const t =
        ((b.x - a.x) * b.dy - (b.y - a.y) * b.dx) / (a.dx * b.dy - a.dy * b.dx);
      return [a.x + a.dx * t, a.y + a.dy * t];
    });
  }
  const facing = (angle: number): Point => {
    const cx = Math.cos(angle);
    const cy = Math.sin(angle);
    let best = core[0];
    let reach = -Infinity;
    for (const p of core) {
      if (p[0] * cx + p[1] * cy > reach) {
        reach = p[0] * cx + p[1] * cy;
        best = p;
      }
    }
    return [best[0] + cx * corner, best[1] + cy * corner];
  };
  const all = Array.from({ length: 360 }, (_, i) =>
    facing((i / 360) * Math.PI * 2)
  );
  const xs = all.map(([x]) => x);
  const ys = all.map(([, y]) => y);
  const scale =
    (1 - 2 * FACE.inset) /
    Math.max(
      Math.max(...xs) - Math.min(...xs),
      Math.max(...ys) - Math.min(...ys)
    );
  const mx = (Math.max(...xs) + Math.min(...xs)) / 2;
  const my = (Math.max(...ys) + Math.min(...ys)) / 2;
  return Array.from({ length: count }, (_, i) => {
    const [x, y] = facing(((i + 0.5) / count) * Math.PI * 2);
    return [0.5 + (x - mx) * scale, 0.5 + (y - my) * scale];
  });
};

/** Whether a point lies inside an outline – any shape (even-odd). */
const inside = ([x, y]: Point, outline: Point[]) => {
  let crossings = 0;
  outline.forEach(([ax, ay], i) => {
    const [bx, by] = outline[(i + 1) % outline.length];
    if (ay > y !== by > y && x < ax + ((y - ay) / (by - ay)) * (bx - ax)) {
      crossings++;
    }
  });
  return crossings % 2 === 1;
};

const SHAPES = DEFAULT_SHAPES.map((shape) => shape.key);

describe("a shape's outline", () => {
  it("is today's for the shapes stamps had before – to a hair", () => {
    for (const shape of Object.keys(BEFORE)) {
      const distance = outlineDistance(shape);
      for (const [x, y] of before(shape)) {
        expect(Math.abs(distance(x, y)), shape).toBeLessThan(2e-4);
      }
    }
  });

  it("fills the face's box, centered", () => {
    for (const shape of SHAPES) {
      const box = outlineBox(shape);
      const wide = box.x1 - box.x0;
      const tall = box.y1 - box.y0;
      expect(Math.max(wide, tall), shape).toBeCloseTo(1 - 2 * FACE.inset, 3);
      expect((box.x0 + box.x1) / 2, shape).toBeCloseTo(0.5, 3);
      expect((box.y0 + box.y1) / 2, shape).toBeCloseTo(0.5, 3);
    }
  });

  it("goes round once, clockwise on screen, from the right", () => {
    for (const shape of SHAPES) {
      const points = outlinePoints(shape);
      expect(ringArea(points), shape).toBeGreaterThan(0);
      expect(points[0][0], shape).toBeGreaterThan(0.5);
      expect(Math.abs(points[0][1] - 0.5), shape).toBeLessThan(0.05);
      // Closed: the last point lies as near the first as any two do.
      const steps = points.map(([x, y], i) => {
        const [nx, ny] = points[(i + 1) % points.length];
        return Math.hypot(nx - x, ny - y);
      });
      expect(Math.max(...steps), shape).toBeLessThan(Math.min(...steps) * 3);
    }
  });

  it("grows and shrinks parallel – inside stays inside", () => {
    for (const shape of SHAPES) {
      const outline = outlinePoints(shape, 0, 1440);
      const distance = outlineDistance(shape);
      for (const grow of [-0.08, -0.02, 0.02]) {
        for (const point of outlinePoints(shape, grow, 360)) {
          expect(distance(...point), `${shape} ${grow}`).toBeCloseTo(grow, 3);
          expect(inside(point, outline), `${shape} ${grow}`).toBe(grow < 0);
        }
      }
    }
  });

  it("has as many points as its detail needs – an SVG path of it, too", () => {
    expect(outlineCount("circle")).toBe(96);
    expect(outlineCount("postage")).toBeGreaterThan(outlineCount("circle"));
    // A straight side is two points.
    const square = outlinePath("square").split("L").length;
    expect(square).toBeLessThan(outlinePath("circle").split("L").length);
  });

  it("is drawn from any path given – the CMS's preview, too", () => {
    const d = "M0 0L100 0L50 80Z";
    const box = outlineBox({ d });
    expect(box.x1 - box.x0).toBeCloseTo(0.96, 3);
    expect(box.y1 - box.y0).toBeCloseTo(0.96 * 0.8, 3);
  });
});
