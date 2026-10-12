import { beforeAll, describe, expect, it, vi } from "vitest";
import { SHAPES, type StampShape } from "../../src/features/calendar/model";
import type { StickerInput } from "../../src/features/stickers/build";
import { PRINT_MM, stampStl } from "../../src/features/stickers/export-stl";

/**
 * A canvas good enough for the stamp's height maps without a browser: under
 * shifts and scales it fills rectangles and round dots – whatever else it is
 * asked to draw (outlines, lines) it leaves out.
 */
const canvas = () => {
  const size = { width: 0, height: 0 };
  let data = new Uint8ClampedArray(0);
  // A point on the canvas: scale · where it is drawn + shift.
  const at = { sx: 1, sy: 1, tx: 0, ty: 0 };
  let dots: { x: number; y: number; r: number }[] = [];
  const paint = (
    style: string,
    covers: (x: number, y: number) => boolean,
    box: [number, number, number, number]
  ) => {
    data = data.length ? data : new Uint8ClampedArray(size.width * size.height);
    const value = style === "#fff" ? 255 : 0;
    const [x0, y0, x1, y1] = box;
    for (let y = Math.max(0, Math.floor(y0)); y < size.height && y <= y1; y++) {
      for (
        let x = Math.max(0, Math.floor(x0));
        x < size.width && x <= x1;
        x++
      ) {
        if (covers(x + 0.5, y + 0.5)) data[y * size.width + x] = value;
      }
    }
  };
  const idle = () => undefined;
  const context = {
    fillStyle: "#000",
    strokeStyle: "#000",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    translate: (x: number, y: number) => {
      at.tx += at.sx * x;
      at.ty += at.sy * y;
    },
    scale: (x: number, y: number) => {
      at.sx *= x;
      at.sy *= y;
    },
    fillRect: (x: number, y: number, w: number, h: number) => {
      const xs = [at.sx * x + at.tx, at.sx * (x + w) + at.tx];
      const ys = [at.sy * y + at.ty, at.sy * (y + h) + at.ty];
      const box: [number, number, number, number] = [
        Math.min(...xs),
        Math.min(...ys),
        Math.max(...xs),
        Math.max(...ys),
      ];
      paint(
        context.fillStyle,
        (px, py) =>
          px >= box[0] && px <= box[2] && py >= box[1] && py <= box[3],
        box
      );
    },
    beginPath: () => {
      dots = [];
    },
    arc: (x: number, y: number, r: number) => {
      dots.push({
        x: at.sx * x + at.tx,
        y: at.sy * y + at.ty,
        r: Math.abs(at.sx) * r,
      });
    },
    fill: () => {
      for (const { x, y, r } of dots) {
        paint(context.fillStyle, (px, py) => Math.hypot(px - x, py - y) <= r, [
          x - r,
          y - r,
          x + r,
          y + r,
        ]);
      }
    },
    getImageData: () => ({
      // One value per pixel is kept – read as its red.
      data: Uint8ClampedArray.from(
        { length: data.length * 4 },
        (_, i) => data[i >> 2]
      ),
    }),
    moveTo: idle,
    lineTo: idle,
    quadraticCurveTo: idle,
    closePath: idle,
    clip: idle,
    stroke: idle,
    save: idle,
    restore: idle,
  };
  return {
    set width(value: number) {
      size.width = value;
    },
    set height(value: number) {
      size.height = value;
    },
    getContext: () => context,
  };
};

type Triangle = [number[], number[], number[]];

/** A binary STL's triangles. */
const triangles = async (file: Blob) => {
  const view = new DataView(await file.arrayBuffer());
  const count = view.getUint32(80, true);
  expect(view.byteLength).toBe(84 + count * 50);
  return Array.from({ length: count }, (_, n): Triangle => {
    const corner = (i: number) =>
      [0, 1, 2].map((axis) =>
        view.getFloat32(84 + n * 50 + 12 + (i * 3 + axis) * 4, true)
      );
    return [corner(0), corner(1), corner(2)];
  });
};

const stamp = (
  shape: StampShape,
  drawing: StickerInput["drawing"] = { strokes: [] }
): StickerInput => ({ shape, color: "red", drawing });

/** The knob stands on the stamp's back – this high over the ground (mm). */
const BACK = 13.4;

describe("a stamp for the 3D printer", () => {
  beforeAll(() => {
    vi.stubGlobal("document", { createElement: canvas });
  });

  it("stands on its rubber, the knob up, 40 mm wide", async () => {
    const all = (await triangles(await stampStl(stamp("circle")))).flat();
    const span = (axis: number) =>
      all.reduce(
        ([min, max], corner) => [
          Math.min(min, corner[axis]),
          Math.max(max, corner[axis]),
        ],
        [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]
      );
    // On the ground with its face …
    expect(span(2)[0]).toBeCloseTo(0, 4);
    expect(span(2)[1]).toBeGreaterThan(30);
    expect(span(2)[1]).toBeLessThan(36);
    // … as wide as promised, around the middle.
    for (const axis of [0, 1]) {
      expect(span(axis)[0]).toBeCloseTo(-PRINT_MM / 2, 1);
      expect(span(axis)[1]).toBeCloseTo(PRINT_MM / 2, 1);
    }
    // Down there the whole face, up there just the knob.
    const wide = (from: number, to: number) =>
      all.reduce(
        (most, [x, y, z]) =>
          z >= from && z <= to ? Math.max(most, Math.hypot(x, y)) : most,
        0
      );
    expect(wide(0, 1)).toBeGreaterThan(19);
    expect(wide(BACK + 1, 40)).toBeLessThan(8.1);
    expect(wide(25, 40)).toBeCloseTo(8, 1);
  });

  it.each(SHAPES)("is closed all round – %s", async (shape) => {
    const all = await triangles(await stampStl(stamp(shape)));
    // Every edge is walked once each way: no hole, nothing inside out.
    const points = new Map<string, number>();
    const id = (corner: number[]) => {
      const key = corner.map((value) => Math.round(value * 1e4)).join(",");
      const known = points.get(key);
      if (known !== undefined) return known;
      points.set(key, points.size);
      return points.size - 1;
    };
    const edges = new Map<number, number>();
    const walk = (a: number, b: number) =>
      edges.set(a * 2 ** 24 + b, (edges.get(a * 2 ** 24 + b) ?? 0) + 1);
    let volume = 0;
    for (const [a, b, c] of all) {
      const [i, j, k] = [id(a), id(b), id(c)];
      // (A sliver thinner than the file's digits is no triangle.)
      if (i === j || j === k || k === i) continue;
      walk(i, j);
      walk(j, k);
      walk(k, i);
      volume +=
        (a[0] * (b[1] * c[2] - b[2] * c[1]) +
          a[1] * (b[2] * c[0] - b[0] * c[2]) +
          a[2] * (b[0] * c[1] - b[1] * c[0])) /
        6;
    }
    let open = 0;
    for (const [edge, times] of edges) {
      const back = (edge % 2 ** 24) * 2 ** 24 + Math.floor(edge / 2 ** 24);
      if (edges.get(back) !== times) open++;
    }
    expect(open).toBe(0);
    // Its faces look outwards: a volume, a few cubic centimeters of it.
    expect(volume).toBeGreaterThan(5000);
    expect(volume).toBeLessThan(25_000);
  });

  it("has a knob that prints without supports", async () => {
    const all = await triangles(await stampStl(stamp("circle")));
    // Above the back nothing leans out by more than 45°.
    let steepest = 0;
    for (const [a, b, c] of all) {
      if (Math.min(a[2], b[2], c[2]) < BACK + 0.2) continue;
      const u = b.map((value, i) => value - a[i]);
      const v = c.map((value, i) => value - a[i]);
      const normal = [
        u[1] * v[2] - u[2] * v[1],
        u[2] * v[0] - u[0] * v[2],
        u[0] * v[1] - u[1] * v[0],
      ];
      const length = Math.hypot(...normal);
      if (length > 0) steepest = Math.max(steepest, -normal[2] / length);
    }
    expect(steepest).toBeGreaterThan(0.5);
    expect(steepest).toBeLessThan(Math.sin(Math.PI / 4) + 0.02);
  });

  it("prints the doodle the right way round", async () => {
    // A face all in ink but for one dot, left of and above the middle.
    const dot = { x: 0.3, y: 0.35 };
    const all = await triangles(
      await stampStl(
        stamp("circle", {
          strokes: [{ w: 0.2, p: [dot.x, dot.y] }],
          inverted: true,
        })
      )
    );
    // The dot is a hollow in the rubber, a good millimeter over the ground.
    const hollow = all.flat().filter(([, , z]) => z > 1 && z < 1.45);
    expect(hollow.length).toBeGreaterThan(100);
    const middle = [0, 1].map(
      (axis) =>
        hollow.reduce((sum, corner) => sum + corner[axis], 0) / hollow.length
    );
    // Seen from above – as the print lies on the page – it is where it was
    // drawn: x to the right, the drawing's top towards +Y.
    expect(middle[0]).toBeCloseTo((dot.x - 0.5) * PRINT_MM, 0);
    expect(middle[1]).toBeCloseTo((0.5 - dot.y) * PRINT_MM, 0);
  });
});
