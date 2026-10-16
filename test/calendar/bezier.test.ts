import { describe, expect, it } from "vitest";
import {
  apply,
  transformArt,
  turnAbout,
} from "../../src/features/calendar/arrange";
import { type Art, sampleStroke } from "../../src/features/calendar/art";
import {
  ANCHOR,
  anchorCount,
  curvesOf,
  flatten,
  insertAnchor,
  isSmooth,
  lineStroke,
  moveAnchor,
  moveHandle,
  nearestOnPath,
  pathGrip,
  pointOn,
  pullHandles,
  removeAnchor,
  smoothen,
  snap45,
  toggleSmooth,
} from "../../src/features/calendar/bezier";
import { erase } from "../../src/features/calendar/eraser";
import { anchorGuides } from "../../src/features/calendar/guides";
import {
  cleanDrawing,
  DRAWING_LIMITS,
} from "../../src/features/calendar/model";

/** An anchor without handles – a corner. */
const corner = (x: number, y: number) => [x, y, x, y, x, y];
/** A smooth anchor: its handle out at (ox, oy), in mirrored. */
const smooth = (x: number, y: number, ox: number, oy: number) => [
  x,
  y,
  2 * x - ox,
  2 * y - oy,
  ox,
  oy,
];

/** How far a point lies from a line through flat pairs. */
const off = (x: number, y: number, p: number[]) => {
  let best = Infinity;
  for (let i = 0; i + 3 < p.length; i += 2) {
    const dx = p[i + 2] - p[i];
    const dy = p[i + 3] - p[i + 1];
    const length = dx * dx + dy * dy;
    const t = length
      ? Math.max(
          0,
          Math.min(1, ((x - p[i]) * dx + (y - p[i + 1]) * dy) / length)
        )
      : 0;
    best = Math.min(best, Math.hypot(x - p[i] - t * dx, y - p[i + 1] - t * dy));
  }
  return best;
};

// An arch: up from the left, over, down to the right.
const arch = [
  ...corner(0.2, 0.7),
  ...smooth(0.5, 0.3, 0.65, 0.3),
  ...corner(0.8, 0.7),
];

describe("an anchored line made flat", () => {
  it("keeps a straight line straight – a point near each end", () => {
    const p = flatten([...corner(0.2, 0.2), ...corner(0.8, 0.5)]);
    expect(p.slice(0, 2)).toEqual([0.2, 0.2]);
    expect(p.slice(-2)).toEqual([0.8, 0.5]);
    expect(p.length).toBe(8);
    for (let i = 0; i < p.length; i += 2) {
      // On the line y = 0.2 + (x − 0.2) / 2, to the rounding.
      expect(Math.abs(p[i + 1] - (0.2 + (p[i] - 0.2) / 2))).toBeLessThan(0.001);
    }
    // The near points: a few thousandths in from each end.
    expect(Math.hypot(p[2] - 0.2, p[3] - 0.2)).toBeLessThan(0.006);
    expect(Math.hypot(p[4] - 0.8, p[5] - 0.5)).toBeLessThan(0.006);
  });

  it("follows a curve within its tolerance – as it is drawn, too", () => {
    const p = flatten(arch);
    const drawn = sampleStroke(p, 0.002);
    for (const curve of curvesOf(arch, false)) {
      for (let s = 0; s <= 200; s++) {
        const [x, y] = pointOn(curve, s / 200);
        // The flat line, and the drawing's smoothing of it.
        expect(off(x, y, p)).toBeLessThan(0.002);
        expect(off(x, y, drawn)).toBeLessThan(0.003);
      }
    }
    // Far fewer points than a hand would leave.
    expect(p.length / 2).toBeLessThan(60);
    expect(p.every((n) => Math.round(n * 1000) / 1000 === n)).toBe(true);
  });

  it("keeps a corner a corner under the drawing's smoothing", () => {
    const p = flatten([
      ...corner(0.2, 0.2),
      ...corner(0.8, 0.2),
      ...corner(0.8, 0.8),
    ]);
    const drawn = sampleStroke(p, 0.001);
    expect(off(0.8, 0.2, drawn)).toBeLessThan(0.003);
    // And its sides stay on their lines.
    expect(off(0.5, 0.2, drawn)).toBeLessThan(0.0005);
    expect(off(0.8, 0.5, drawn)).toBeLessThan(0.0005);
  });

  it("runs a closed line back to its start", () => {
    const open = flatten(arch);
    const closed = flatten(arch, true);
    expect(closed.slice(0, 2)).toEqual([0.2, 0.7]);
    expect(closed.slice(-2)).toEqual([0.2, 0.7]);
    expect(closed.length).toBeGreaterThan(open.length);
    // The closing side: straight along the bottom.
    expect(off(0.5, 0.7, closed)).toBeLessThan(0.001);
    expect(off(0.5, 0.7, open)).toBeGreaterThan(0.1);
  });

  it("makes a dot of one anchor, nothing of none", () => {
    expect(flatten(corner(0.4, 0.6))).toEqual([0.4, 0.6]);
    expect(flatten([])).toEqual([]);
  });
});

describe("an anchored line from a device", () => {
  const sent = (stroke: unknown) =>
    cleanDrawing({ v: 1, strokes: [stroke] })?.strokes[0];

  it("gets its points from its anchors – whatever points were sent", () => {
    const line = sent({ w: 0.05, p: [0, 0, 1, 1], a: arch });
    expect(line).toEqual(lineStroke(0.05, arch));
    expect(line?.p).toEqual(flatten(arch));
    expect(line?.closed).toBeUndefined();
    expect(sent({ w: 0.05, p: [], a: arch, closed: true })).toEqual(
      lineStroke(0.05, arch, true)
    );
    // Only `true` closes.
    expect(
      sent({ w: 0.05, p: [], a: arch, closed: 1 })?.closed
    ).toBeUndefined();
  });

  it("keeps anchors in the square, their handles within reach, rounded", () => {
    const wild = [...corner(-0.2, 0.33333), ...corner(1.4, 0.5)];
    expect(sent({ w: 0.05, p: [], a: wild })?.a).toEqual([
      0, 0.333, -0.2, 0.333, -0.2, 0.333, 1, 0.5, 1.4, 0.5, 1.4, 0.5,
    ]);
    // Handles out as far as HANDLE_REACH – the drawn line stays inside.
    const far = [0.1, 0.5, 0.1, 0.5, -3, 0.9, 0.9, 0.5, 0.9, 0.5, 0.9, 0.5];
    const line = sent({ w: 0.05, p: [], a: far });
    expect(line?.a?.slice(4, 6)).toEqual([-1, 0.9]);
    for (const v of line?.p ?? []) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("drops anchors that are none – the line stays an ordinary one", () => {
    const p = [0.1, 0.1, 0.9, 0.9];
    for (const a of [
      arch.slice(0, -1),
      corner(0.5, 0.5),
      [...corner(0.1, 0.1), 0.2, 0.2, "x", 0.2, 0.2, 0.2],
      [...corner(0.1, 0.1), 0.2, 0.2, Number.NaN, 0.2, 0.2, 0.2],
      Array.from({ length: (DRAWING_LIMITS.anchors + 1) * ANCHOR }, () => 0.5),
      "arch",
      { 0: 0.1 },
    ]) {
      expect(sent({ w: 0.05, p, a })).toEqual({ w: 0.05, p });
    }
  });

  it("counts anchors against what a stamp may hold", () => {
    // Lines of the most anchors, zigzag: each a few hundred points.
    const zigzag = Array.from({ length: DRAWING_LIMITS.anchors }, (_, i) =>
      corner(i / DRAWING_LIMITS.anchors, i % 2 ? 0.2 : 0.8)
    ).flat();
    const one = lineStroke(0.03, zigzag);
    const size = (one.p.length + one.a.length) / 2;
    const whole = Math.floor(DRAWING_LIMITS.points / size);
    const cleaned = cleanDrawing({
      v: 1,
      strokes: Array.from({ length: whole + 3 }, () => ({ ...one })),
    });
    const kept = cleaned?.strokes ?? [];
    const points = kept.reduce(
      (sum, s) => sum + (s.p.length + (s.a?.length ?? 0)) / 2,
      0
    );
    expect(points).toBeLessThanOrEqual(DRAWING_LIMITS.points);
    // Whole anchored lines as long as they fit; what comes after – its points
    // alone, or cut short – is an ordinary line.
    expect(kept.filter((s) => s.a).length).toBe(whole);
    expect(kept.length).toBeGreaterThan(whole);
    for (const s of kept.slice(whole)) expect(s.a).toBeUndefined();
    for (const s of kept) if (s.a) expect(s.p).toEqual(flatten(s.a));
  });
});

describe("moving an anchored line about", () => {
  const art: Art = { strokes: [lineStroke(0.05, arch)], fills: [] };

  it("turns its anchors – its points follow, it stays an anchored line", () => {
    const m = turnAbout(Math.PI / 2, 0.5, 0.5);
    const [turned] = transformArt(art, { strokes: [0], fills: [] }, m).strokes;
    expect(turned.a).toHaveLength(arch.length);
    for (let i = 0; i < arch.length; i += 2) {
      const [x, y] = apply(m, arch[i], arch[i + 1]);
      expect(turned.a?.[i]).toBeCloseTo(x, 3);
      expect(turned.a?.[i + 1]).toBeCloseTo(y, 3);
    }
    expect(turned.p).toEqual(flatten(turned.a ?? []));
    expect(turned.w).toBe(0.05);
    // What the server makes of it is what the device has.
    expect(cleanDrawing({ v: 1, strokes: [turned] })?.strokes[0]).toEqual(
      turned
    );
  });

  it("keeps a closed line closed", () => {
    const closed: Art = { strokes: [lineStroke(0.05, arch, true)], fills: [] };
    const [moved] = transformArt(
      closed,
      { strokes: [0], fills: [] },
      [1, 0, 0, 1, 0.1, 0.1]
    ).strokes;
    expect(moved.closed).toBe(true);
    expect(moved.p.slice(-2)).toEqual([0.3, 0.8]);
  });

  it("is cut into ordinary lines by the eraser", () => {
    const { strokes } = erase(art, { w: 0.05, p: [0.5, 0.1, 0.5, 0.9] });
    expect(strokes).toHaveLength(2);
    for (const piece of strokes) {
      expect(piece).toEqual({ w: 0.05, p: piece.p });
    }
    // Untouched, it stays what it was.
    expect(erase(art, { w: 0.05, p: [0.1, 0.1, 0.1, 0.2] }).strokes[0]).toBe(
      art.strokes[0]
    );
  });
});

describe("editing an anchored line's points", () => {
  it("makes a corner round again – its handles in one line, mirrored", () => {
    // A corner: its handle in straight up, its handle out to the right.
    const a = [0.2, 0.5, 0.2, 0.5, 0.2, 0.5, 0.5, 0.5, 0.5, 0.3, 0.7, 0.5];
    const round = smoothen(a, false, 1);
    expect(round.slice(6, 12)).toEqual([0.5, 0.5, 0.3, 0.5, 0.7, 0.5]);
    expect(isSmooth(round, 1)).toBe(true);
    // One without handles gets them, along the way from its neighbours.
    const bare = [
      0.2, 0.5, 0.2, 0.5, 0.2, 0.5, 0.5, 0.2, 0.5, 0.2, 0.5, 0.2, 0.8, 0.5, 0.8,
      0.5, 0.8, 0.5,
    ];
    expect(isSmooth(smoothen(bare, false, 1), 1)).toBe(true);
  });

  it("knows smooth points from corners", () => {
    expect(isSmooth(arch, 0)).toBe(false);
    expect(isSmooth(arch, 1)).toBe(true);
  });

  it("moves an anchor with its handles – the anchor up to the edge", () => {
    const moved = moveAnchor(arch, 1, 0.6, 0.4);
    expect(moved.slice(ANCHOR, 2 * ANCHOR)).toEqual([
      0.6, 0.4, 0.45, 0.4, 0.75, 0.4,
    ]);
    expect(moved.slice(0, ANCHOR)).toEqual(arch.slice(0, ANCHOR));
    // The anchor stops at the edge, its handle out goes on beyond it.
    const far = moveAnchor(arch, 1, 2, 0.3);
    expect(far.slice(ANCHOR, 2 * ANCHOR)).toEqual([
      1, 0.3, 0.85, 0.3, 1.15, 0.3,
    ]);
  });

  it("mirrors a smooth point's other handle – not with Alt", () => {
    const pulled = moveHandle(arch, 1, "out", 0.6, 0.2);
    expect(pulled.slice(ANCHOR, 2 * ANCHOR)).toEqual([
      0.5, 0.3, 0.4, 0.4, 0.6, 0.2,
    ]);
    const broken = moveHandle(arch, 1, "out", 0.6, 0.2, true);
    expect(broken.slice(ANCHOR, 2 * ANCHOR)).toEqual([
      0.5, 0.3, 0.35, 0.3, 0.6, 0.2,
    ]);
    expect(isSmooth(broken, 1)).toBe(false);
  });

  it("pulls a new anchor's handles out – Alt only the one", () => {
    const line = [...corner(0.2, 0.5), ...corner(0.5, 0.5)];
    expect(pullHandles(line, 1, 0.6, 0.4).slice(ANCHOR)).toEqual([
      0.5, 0.5, 0.4, 0.6, 0.6, 0.4,
    ]);
    expect(pullHandles(line, 1, 0.6, 0.4, true).slice(ANCHOR)).toEqual([
      0.5, 0.5, 0.5, 0.5, 0.6, 0.4,
    ]);
  });

  it("switches a point between smooth and corner", () => {
    const sharp = toggleSmooth(arch, false, 1);
    expect(sharp.slice(ANCHOR, 2 * ANCHOR)).toEqual(corner(0.5, 0.3));
    const round = toggleSmooth(sharp, false, 1);
    expect(isSmooth(round, 1)).toBe(true);
    // Along the way from the neighbor before to the one after: level.
    expect(round[ANCHOR + 5]).toBeCloseTo(0.3, 3);
    expect(round[ANCHOR + 4]).toBeGreaterThan(0.5);
  });

  it("puts a new anchor on the line without changing its form", () => {
    const before = flatten(arch);
    const on = nearestOnPath(arch, false, 0.3, 0.42);
    expect(on.curve).toBe(0);
    const added = insertAnchor(arch, on.curve, on.t);
    expect(anchorCount(added.a)).toBe(4);
    expect(added.index).toBe(1);
    const after = flatten(added.a);
    for (let i = 0; i < after.length; i += 2) {
      expect(off(after[i], after[i + 1], before)).toBeLessThan(0.0025);
    }
    // On a closed line's last curve it comes last.
    const closing = insertAnchor(arch, 2, 0.5);
    expect(closing.index).toBe(3);
    expect(closing.a.slice(-ANCHOR, -ANCHOR + 2)).toEqual([0.5, 0.7]);
    expect(removeAnchor(added.a, 1).length).toBe(arch.length);
  });

  it("grabs an anchor, a handle or the line", () => {
    expect(pathGrip(arch, false, 0.505, 0.3, 0.02)).toEqual({
      kind: "anchor",
      i: 1,
    });
    expect(pathGrip(arch, false, 0.65, 0.31, 0.02)).toEqual({
      kind: "out",
      i: 1,
    });
    expect(pathGrip(arch, false, 0.35, 0.29, 0.02)).toEqual({
      kind: "in",
      i: 1,
    });
    expect(pathGrip(arch, false, 0.28, 0.5, 0.03)?.kind).toBe("line");
    expect(pathGrip(arch, false, 0.5, 0.7, 0.02)).toBeNull();
    expect(pathGrip(arch, true, 0.5, 0.7, 0.02)).toMatchObject({
      kind: "line",
      curve: 2,
    });
  });

  it("grabs a short handle beside its anchor – the anchor when about as near", () => {
    const short = [...corner(0.2, 0.7), ...smooth(0.5, 0.3, 0.52, 0.3)];
    // A finger's reach covers both: the one clearly nearer wins.
    expect(pathGrip(short, false, 0.525, 0.3, 0.03)).toEqual({
      kind: "out",
      i: 1,
    });
    expect(pathGrip(short, false, 0.512, 0.3, 0.03)).toEqual({
      kind: "anchor",
      i: 1,
    });
    expect(pathGrip(short, false, 0.5, 0.31, 0.03)).toEqual({
      kind: "anchor",
      i: 1,
    });
  });

  it("snaps to 45° about a point", () => {
    const [x, y] = snap45(0.5, 0.5, 0.7, 0.52);
    expect(y).toBeCloseTo(0.5);
    expect(x).toBeCloseTo(0.7);
    const [dx, dy] = snap45(0.5, 0.5, 0.62, 0.6);
    expect(dx - 0.5).toBeCloseTo(dy - 0.5);
  });

  it("offers the face's lines and the other anchors' as guides", () => {
    const art: Art = { strokes: [lineStroke(0.05, arch)], fills: [] };
    const guides = anchorGuides(art, corner(0.33, 0.44), {
      stroke: 0,
      anchor: 1,
    });
    expect(guides.x).toEqual(expect.arrayContaining([0.5, 0.2, 0.8, 0.33]));
    expect(guides.y).toEqual(expect.arrayContaining([0.5, 0.7, 0.44]));
    // Not the anchor's own – 0.3 is only its y.
    expect(guides.y).not.toContain(0.3);
  });
});
