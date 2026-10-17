import { describe, expect, it } from "vitest";
import {
  boxOfPieces,
  PATH_LIMIT,
  type Piece,
  readPath,
} from "../../src/features/calendar/path";
import { DEFAULT_SHAPES, isOutline } from "../../src/features/calendar/shapes";
import {
  fitPieces,
  lengthOf,
  type Matrix,
  mostlyFilled,
  piecesOf,
  type SvgPart,
  shapeOfSvg,
  templateOfSvg,
  transformPieces,
  writePath,
} from "../../src/features/calendar/svg-outline";

const box = (pieces: readonly Piece[] | null) => {
  const { x0, y0, x1, y1 } = boxOfPieces(pieces ?? []);
  return [x0, y0, x1, y1].map((n) => Math.round(n * 1000) / 1000);
};

const path = (d: string) => readPath(d) ?? [];

/** A part as read-svg.ts gives one: filled, or a line this wide. */
const part = (
  pieces: Piece[] | null,
  { filled = true, line = 0 } = {}
): SvgPart => ({ pieces: pieces ?? [], filled, line });

/** Matrices multiplied – the outer one first, as SVG nests them. */
const times = (
  [a1, b1, c1, d1, e1, f1]: Matrix,
  [a2, b2, c2, d2, e2, f2]: Matrix
): Matrix => [
  a1 * a2 + c1 * b2,
  b1 * a2 + d1 * b2,
  a1 * c2 + c1 * d2,
  b1 * c2 + d1 * d2,
  a1 * e2 + c1 * f2 + e1,
  b1 * e2 + d1 * f2 + f1,
];
const translate = (x: number, y: number): Matrix => [1, 0, 0, 1, x, y];
const scale = (s: number): Matrix => [s, 0, 0, s, 0, 0];
const rotate = (degrees: number): Matrix => {
  const r = (degrees * Math.PI) / 180;
  return [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0];
};

describe("an SVG's shapes as pieces", () => {
  it("a rectangle: four sides – its corners rounded when it has a radius", () => {
    const sharp = piecesOf({
      tag: "rect",
      x: 10,
      y: 20,
      width: 30,
      height: 40,
      rx: null,
      ry: null,
    });
    expect(sharp).toHaveLength(1);
    expect(sharp?.[0].closed).toBe(true);
    expect(sharp?.[0].segments.every((s) => !s.c1)).toBe(true);
    expect(box(sharp)).toEqual([10, 20, 40, 60]);
    expect(lengthOf(sharp ?? [])).toBeCloseTo(140, 6);

    // One radius given: the other is the same – a too big one is halved.
    const round = piecesOf({
      tag: "rect",
      x: 10,
      y: 20,
      width: 30,
      height: 40,
      rx: 5,
      ry: null,
    });
    expect(box(round)).toEqual([10, 20, 40, 60]);
    expect(round?.[0].segments.filter((s) => s.c1)).toHaveLength(4);
    expect(lengthOf(round ?? [])).toBeCloseTo(140 - 40 + 10 * Math.PI, 1);
    const pill = piecesOf({
      tag: "rect",
      x: 0,
      y: 0,
      width: 40,
      height: 10,
      rx: null,
      ry: 5,
    });
    expect(lengthOf(pill ?? [])).toBeCloseTo(60 + 10 * Math.PI, 1);
    // Each radius at most half the side: an ellipse, 40 × 10.
    const ellipse = piecesOf({
      tag: "rect",
      x: 0,
      y: 0,
      width: 40,
      height: 10,
      rx: 99,
      ry: null,
    });
    expect(box(ellipse)).toEqual([0, 0, 40, 10]);
    const h = (15 / 25) ** 2;
    expect(lengthOf(ellipse ?? [])).toBeCloseTo(
      Math.PI * 25 * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h))),
      1
    );

    expect(
      piecesOf({ tag: "rect", x: 0, y: 0, width: 0, height: 9, rx: 0, ry: 0 })
    ).toBeNull();
  });

  it("a circle and an ellipse: curves all round", () => {
    const circle = piecesOf({ tag: "circle", cx: 50, cy: 40, r: 10 });
    expect(circle?.[0].closed).toBe(true);
    expect(circle?.[0].segments.every((s) => s.c1 && s.c2)).toBe(true);
    expect(box(circle)).toEqual([40, 30, 60, 50]);
    expect(lengthOf(circle ?? [])).toBeCloseTo(20 * Math.PI, 1);
    const ellipse = piecesOf({ tag: "ellipse", cx: 0, cy: 0, rx: 20, ry: 5 });
    expect(box(ellipse)).toEqual([-20, -5, 20, 5]);
    expect(piecesOf({ tag: "circle", cx: 0, cy: 0, r: 0 })).toBeNull();
  });

  it("lines: a polygon closed, a polyline and a line open", () => {
    const polygon = piecesOf({ tag: "polygon", points: [0, 0, 10, 0, 5, 8] });
    expect(polygon?.[0].closed).toBe(true);
    expect(polygon?.[0].segments).toHaveLength(2);
    const polyline = piecesOf({ tag: "polyline", points: [0, 0, 10, 0, 5] });
    expect(polyline?.[0].closed).toBe(false);
    expect(polyline?.[0].segments.map((s) => s.to)).toEqual([[10, 0]]);
    const line = piecesOf({ tag: "line", x1: 1, y1: 2, x2: 3, y2: 4 });
    expect(line?.[0]).toEqual({
      start: [1, 2],
      segments: [{ to: [3, 4] }],
      closed: false,
    });
    expect(piecesOf({ tag: "polyline", points: [1, 1] })).toBeNull();
  });

  it("a path: as path.ts reads it – none where it isn't one", () => {
    expect(piecesOf({ tag: "path", d: "M0 0L10 10" })).toEqual(
      readPath("M0 0L10 10")
    );
    expect(piecesOf({ tag: "path", d: "M0 0 what" })).toBeNull();
  });
});

describe("the pieces moved into the picture", () => {
  it("keep their curves under any transform – a skew too", () => {
    const [circle] = transformPieces(
      path("M10 0A10 10 0 0 1 -10 0Z"),
      [1, 0, 0.5, 1, 0, 0]
    );
    expect(circle.segments.filter((s) => s.c1 && s.c2)).toHaveLength(2);
    // The top of the half circle (0, 10) leans over to (5, 10).
    const top = circle.segments[0].to;
    expect(top[0]).toBeCloseTo(5, 9);
    expect(top[1]).toBeCloseTo(10, 9);
  });

  it("a path in a viewBox, turned: the same outline whatever the viewBox's size", () => {
    // A 10 × 5 bar, turned a quarter and doubled: 10 wide, 20 tall.
    const bar = path("M0 0H10V5H0Z");
    const turned = times(translate(5, 5), times(rotate(90), scale(2)));
    const inViewBox = (s: number) =>
      templateOfSvg([part(transformPieces(bar, times(scale(s), turned)))]);
    const small = inViewBox(1);
    const large = inViewBox(1000 / 24);
    expect(small?.d).toBe(large?.d);
    // Fit: 96 tall, its proportions kept, in the middle.
    expect(box(readPath(small?.d))).toEqual([26, 2, 74, 98]);
    expect(small?.d).toBe("M74 2V98H26V2Z");
  });
});

describe("the picture fit into the box", () => {
  it("as large as it goes, centered, its proportions kept", () => {
    const fitted = fitPieces(path("M-500 300H-300V400H-500Z"));
    expect(box(fitted)).toEqual([2, 26, 98, 74]);
    const curve = fitPieces(path("M0 0C0 -40 100 -40 100 0Z"));
    const [x0, y0, x1, y1] = box(curve);
    expect(x1 - x0).toBeCloseTo(96, 2);
    expect((y0 + y1) / 2).toBeCloseTo(50, 2);
    expect(fitPieces(path("M5 5L5 5"))).toEqual([]);
  });

  it("is written with two places at most, like the code's own", () => {
    const third = 1 / 3;
    expect(
      writePath(
        path(
          `M${third} ${-1e-9}L${10 + third} 0L${10 + third} 5C1 2 3 4 0.5 5Z`
        )
      )
    ).toBe("M0.33 0H10.33V5C1 2 3 4 0.5 5Z");
    // The last straight stretch back to the start: the Z draws it.
    expect(writePath(path("M0 0H10V10H0Z"))).toBe("M0 0H10V10H0Z");
    expect(writePath(path("M0 0H10V10H0V0Z"))).toBe("M0 0H10V10H0Z");
    // A curve that is straight after all, a stretch of nothing: lines.
    expect(writePath(path("M0 0C0 0 9 9 9 9L9.001 9.001L20 9"))).toBe(
      "M0 0L9 9H20"
    );
    expect(writePath(path("M0 0H10M20 20V30"))).toBe("M0 0H10M20 20V30");
  });

  it("a path too long for the CMS is simplified until it fits", () => {
    // Three hundred little circles of 64 stretches – far too long to keep.
    const many = Array.from({ length: 300 }, (_, k) => {
      const points: number[] = [];
      for (let i = 0; i < 64; i++) {
        const a = (i / 64) * 2 * Math.PI;
        points.push(
          (k % 20) * 7 + 3 * Math.cos(a) + 0.123,
          Math.floor(k / 20) * 7 + 3 * Math.sin(a) + 0.456
        );
      }
      return piecesOf({ tag: "polygon", points })?.[0] as Piece;
    });
    const template = templateOfSvg([part(many, { filled: false, line: 1 })]);
    expect(template?.simplified).toBe(true);
    expect(template?.d.length).toBeLessThanOrEqual(PATH_LIMIT);
    expect(readPath(template?.d)).toHaveLength(300);
  });
});

describe("a drawing template from an SVG", () => {
  it("takes all of it, curves kept – and says how many pieces", () => {
    const heart = DEFAULT_SHAPES.find((s) => s.key === "heart")?.d ?? "";
    const template = templateOfSvg([
      part(path(heart), { filled: false, line: 2 }),
      part(piecesOf({ tag: "circle", cx: 50, cy: 50, r: 5 }), {
        filled: false,
        line: 2,
      }),
    ]);
    expect(template?.count).toBe(2);
    expect(template?.filled).toBe(false);
    expect(template?.d).toMatch(/^M[\d. ]+C/);
    expect(readPath(template?.d)?.[0].segments.length).toBe(
      readPath(heart)?.[0].segments.length
    );
    expect(template?.d).not.toMatch(/\.\d{3}/);
  });

  it("is guessed filled when most of its ink is – filled pieces closed", () => {
    const blob = path("M0 0H40V40H0");
    const lines = path("M0 50H40M0 60H40");
    expect(
      mostlyFilled([part(blob), part(lines, { filled: false, line: 1 })])
    ).toBe(true);
    expect(
      mostlyFilled([part(blob), part(lines, { filled: false, line: 30 })])
    ).toBe(false);
    const filled = templateOfSvg([part(blob)]);
    expect(filled?.filled).toBe(true);
    // Open as written, closed by its fill.
    expect(filled?.d.endsWith("Z")).toBe(true);
    const outlined = templateOfSvg([part(blob, { filled: false, line: 1 })]);
    expect(outlined?.filled).toBe(false);
    expect(outlined?.d.endsWith("Z")).toBe(false);
  });

  it("closes a piece that ends where it began", () => {
    const template = templateOfSvg([
      part(path("M0 0H40V40H0V0.001"), { filled: false, line: 1 }),
    ]);
    expect(template?.d).toBe("M2 2H98V98H2Z");
  });

  it("is nothing for nothing", () => {
    expect(templateOfSvg([])).toBeNull();
    expect(templateOfSvg([part([])])).toBeNull();
  });
});

describe("a stamp shape from an SVG", () => {
  it("takes the largest closed outline alone – and counts the others", () => {
    const shape = shapeOfSvg([
      part(piecesOf({ tag: "circle", cx: 0, cy: 0, r: 3 })),
      part(
        piecesOf({
          tag: "rect",
          x: 10,
          y: 0,
          width: 50,
          height: 25,
          rx: 4,
          ry: null,
        })
      ),
      part(path("M0 40L70 40"), { filled: false, line: 2 }),
    ]);
    expect(shape?.others).toBe(2);
    expect(shape?.line).toBe(false);
    expect(shape && isOutline(shape.d)).toBe(true);
    // The rectangle alone, fit: 96 wide, 48 tall, in the middle.
    expect(box(readPath(shape?.d))).toEqual([2, 26, 98, 74]);
    expect(shape?.d.match(/C/g)).toHaveLength(4);
  });

  it("an outline drawn as a line: its middle", () => {
    const shape = shapeOfSvg([
      part(piecesOf({ tag: "circle", cx: 12, cy: 12, r: 10 }), {
        filled: false,
        line: 2,
      }),
    ]);
    expect(shape?.line).toBe(true);
    expect(shape?.others).toBe(0);
    expect(box(readPath(shape?.d))).toEqual([2, 2, 98, 98]);
  });

  it("a filled piece left open is closed by its fill", () => {
    const shape = shapeOfSvg([part(path("M0 0L10 0L5 8"))]);
    expect(shape && isOutline(shape.d)).toBe(true);
  });

  it("none without a closed outline that encloses something", () => {
    expect(
      shapeOfSvg([part(path("M0 0L10 0L5 8"), { filled: false, line: 1 })])
    ).toBeNull();
    expect(shapeOfSvg([part(path("M0 0L10 0L20 0Z"))])).toBeNull();
    expect(shapeOfSvg([])).toBeNull();
  });

  it("a walked outline is thinned to the points it needs", () => {
    const points: number[] = [];
    for (let i = 0; i < 400; i++) points.push(i / 4, 0);
    for (let i = 0; i < 400; i++) points.push(100, i / 4);
    for (let i = 0; i < 400; i++) points.push(100 - i / 4, 100);
    for (let i = 0; i < 400; i++) points.push(0, 100 - i / 4);
    const walked = piecesOf({ tag: "polygon", points });
    const shape = shapeOfSvg([{ ...part(walked), walked: true }]);
    expect(shape?.walked).toBe(true);
    expect(shape?.d).toBe("M2 2H98V98H2Z");
  });
});
