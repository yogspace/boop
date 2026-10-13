import {
  type Art,
  type Box,
  boxOfPoints,
  distanceSq,
  edgeDistanceSq,
  emptyBox,
  fillBox,
  grow,
  insideFill,
  overlaps,
  type Point,
  ringsOf,
  round,
  samplesOf,
  spans,
  strokeBox,
} from "./art";
import { DRAWING_LIMITS } from "./model";

/**
 * Moving what is drawn about, the way Figma and Illustrator do it: pick
 * things – what touches is one thing (`groupsOf`) – then move, turn, size,
 * copy or remove them. Plain functions on the drawing's lines and areas; the
 * editor's pointer and keys are in features/app/use-select.ts.
 *
 * - **Sizing** moves the points – a line keeps its width, like Figma
 *   without “scale strokes”: a stamp's lines stay the pen's three widths,
 *   and a doodle made smaller doesn't turn into hairlines.
 * - **The face's square** holds every point: nothing is moved, turned or
 *   sized past the unit square's edge – it stops there (a turn is pushed
 *   back in if it fits). What lies outside the outline but inside the
 *   square doesn't show, and comes back when moved in again.
 */

/** The lines and areas picked – their places in the drawing, in order. */
export type Selection = { strokes: number[]; fills: number[] };

export const NOTHING: Selection = { strokes: [], fills: [] };

export const isNothing = (selection: Selection) =>
  !(selection.strokes.length || selection.fills.length);

export const sameSelection = (a: Selection, b: Selection) =>
  a.strokes.join() === b.strokes.join() && a.fills.join() === b.fills.join();

const tidy = (list: number[]) => [...new Set(list)].sort((a, b) => a - b);

export const join = (a: Selection, b: Selection): Selection => ({
  strokes: tidy([...a.strokes, ...b.strokes]),
  fills: tidy([...a.fills, ...b.fills]),
});

/** `b` taken out of `a` if `a` holds all of it – else put in (⇧-click). */
export const toggle = (a: Selection, b: Selection): Selection => {
  const has =
    b.strokes.every((i) => a.strokes.includes(i)) &&
    b.fills.every((i) => a.fills.includes(i));
  return has
    ? {
        strokes: a.strokes.filter((i) => !b.strokes.includes(i)),
        fills: a.fills.filter((i) => !b.fills.includes(i)),
      }
    : join(a, b);
};

export const everything = (art: Art): Selection => ({
  strokes: art.strokes.map((_, i) => i),
  fills: art.fills.map((_, i) => i),
});

/** The grid on which touching is decided – 1/256 of the face. */
const GRID = 256;

type Groups = { strokes: Int32Array; fills: Int32Array };
const known = new WeakMap<Art, Groups>();

/**
 * Which thing each line and area belongs to – what touches, or touches
 * something that touches, is one thing (after ccm's objects): laid on a
 * fine grid, a line as far as its round edge reaches, an area inside and
 * along its outline; two that share a cell are one. Worked out once per
 * drawing (a drawing never changes – a change is a new one).
 */
export const groupsOf = (art: Art): Groups => {
  const hit = known.get(art);
  if (hit) return hit;
  const count = art.fills.length + art.strokes.length;
  const parent = Int32Array.from({ length: count }, (_, i) => i);
  const find = (item: number) => {
    let root = item;
    while (parent[root] !== root) {
      parent[root] = parent[parent[root]];
      root = parent[root];
    }
    return root;
  };
  const owner = new Int32Array(GRID * GRID).fill(-1);
  const mark = (cx: number, cy: number, item: number) => {
    if (cx < 0 || cy < 0 || cx >= GRID || cy >= GRID) return;
    const cell = cy * GRID + cx;
    const other = owner[cell];
    if (other < 0) owner[cell] = item;
    else if (other !== item) parent[find(other)] = find(item);
  };
  art.fills.forEach((fill, item) => {
    const box = fillBox(fill);
    // Inside: the cells whose middle it covers…
    const top = Math.max(0, Math.floor(box.y0 * GRID));
    const bottom = Math.min(GRID - 1, Math.floor(box.y1 * GRID));
    for (let cy = top; cy <= bottom; cy++) {
      for (const [a, b] of spans(fill, (cy + 0.5) / GRID)) {
        for (let cx = Math.ceil(a * GRID - 0.5); cx + 0.5 <= b * GRID; cx++) {
          mark(cx, cy, item);
        }
      }
    }
    // …and every cell its outline passes – thin bits too.
    for (const ring of ringsOf(fill)) {
      const n = Math.floor(ring.length / 2);
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const ax = ring[2 * j];
        const ay = ring[2 * j + 1];
        const bx = ring[2 * i];
        const by = ring[2 * i + 1];
        const parts = Math.max(
          1,
          Math.ceil(Math.hypot(bx - ax, by - ay) * GRID * 2)
        );
        for (let s = 0; s <= parts; s++) {
          mark(
            Math.floor((ax + ((bx - ax) * s) / parts) * GRID),
            Math.floor((ay + ((by - ay) * s) / parts) * GRID),
            item
          );
        }
      }
    }
  });
  art.strokes.forEach((stroke, index) => {
    const item = art.fills.length + index;
    const points = samplesOf(stroke);
    // A cell counts when the line's round edge reaches it.
    const reach = stroke.w / 2 + 0.71 / GRID;
    const spacing = Math.max(1 / GRID, stroke.w / 4);
    let ax = points[0];
    let ay = points[1];
    const band = (bx: number, by: number) => {
      const x0 = Math.floor((Math.min(ax, bx) - reach) * GRID);
      const x1 = Math.ceil((Math.max(ax, bx) + reach) * GRID);
      const y0 = Math.floor((Math.min(ay, by) - reach) * GRID);
      const y1 = Math.ceil((Math.max(ay, by) + reach) * GRID);
      for (let cy = Math.max(0, y0); cy <= Math.min(GRID - 1, y1); cy++) {
        for (let cx = Math.max(0, x0); cx <= Math.min(GRID - 1, x1); cx++) {
          const d = distanceSq(
            (cx + 0.5) / GRID,
            (cy + 0.5) / GRID,
            ax,
            ay,
            bx,
            by
          );
          if (d <= reach * reach) mark(cx, cy, item);
        }
      }
    };
    if (points.length <= 2) band(ax, ay);
    for (let k = 2; k < points.length; k += 2) {
      const bx = points[k];
      const by = points[k + 1];
      const end = k + 2 >= points.length;
      if (!end && (bx - ax) ** 2 + (by - ay) ** 2 < spacing * spacing) continue;
      band(bx, by);
      ax = bx;
      ay = by;
    }
  });
  const groups = {
    fills: Int32Array.from(art.fills, (_, i) => find(i)),
    strokes: Int32Array.from(art.strokes, (_, i) => find(art.fills.length + i)),
  };
  known.set(art, groups);
  return groups;
};

/** The selection grown to whole things – all that touches what is in it. */
export const grouped = (art: Art, selection: Selection): Selection => {
  const groups = groupsOf(art);
  const roots = new Set([
    ...selection.strokes.map((i) => groups.strokes[i]),
    ...selection.fills.map((i) => groups.fills[i]),
  ]);
  return {
    strokes: art.strokes.flatMap((_, i) =>
      roots.has(groups.strokes[i]) ? [i] : []
    ),
    fills: art.fills.flatMap((_, i) => (roots.has(groups.fills[i]) ? [i] : [])),
  };
};

/** Whether a point is within `reach` of a line's points as drawn. */
const nearLine = (points: number[], x: number, y: number, reach: number) => {
  const sq = reach * reach;
  if (points.length <= 2) {
    return (points[0] - x) ** 2 + (points[1] - y) ** 2 <= sq;
  }
  for (let k = 2; k < points.length; k += 2) {
    const d = distanceSq(
      x,
      y,
      points[k - 2],
      points[k - 1],
      points[k],
      points[k + 1]
    );
    if (d <= sq) return true;
  }
  return false;
};

/**
 * The line or area under a point – the topmost (lines lie over areas, the
 * later over the earlier), `tolerance` around it – or null.
 */
export const itemAt = (
  art: Art,
  x: number,
  y: number,
  tolerance: number
): Selection | null => {
  const spot = { x0: x, y0: y, x1: x, y1: y };
  for (let i = art.strokes.length - 1; i >= 0; i--) {
    const stroke = art.strokes[i];
    if (!overlaps(strokeBox(stroke), spot, tolerance)) continue;
    if (nearLine(samplesOf(stroke), x, y, stroke.w / 2 + tolerance)) {
      return { strokes: [i], fills: [] };
    }
  }
  for (let i = art.fills.length - 1; i >= 0; i--) {
    const fill = art.fills[i];
    if (!overlaps(fillBox(fill), spot, tolerance)) continue;
    if (
      insideFill(fill, x, y) ||
      edgeDistanceSq(fill, x, y) <= tolerance * tolerance
    ) {
      return { strokes: [], fills: [i] };
    }
  }
  return null;
};

/** The whole thing under a point – or null. */
export const thingAt = (art: Art, x: number, y: number, tolerance: number) => {
  const item = itemAt(art, x, y, tolerance);
  return item && grouped(art, item);
};

/** Whether the segment a–b runs through a box (Liang–Barsky). */
const crossesBox = (
  ax: number,
  ay: number,
  bx: number,
  by: number,
  box: Box
) => {
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dy = by - ay;
  for (const [p, q] of [
    [-dx, ax - box.x0],
    [dx, box.x1 - ax],
    [-dy, ay - box.y0],
    [dy, box.y1 - ay],
  ]) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return false;
  }
  return true;
};

/**
 * Everything a dragged box touches, as whole things – like Figma, touching
 * is enough – or null.
 */
export const touching = (art: Art, box: Box): Selection | null => {
  const strokes = art.strokes.flatMap((stroke, i) => {
    if (!overlaps(strokeBox(stroke), box)) return [];
    const r = stroke.w / 2;
    const points = samplesOf(stroke);
    for (let k = 0; k + 1 < points.length; k += 2) {
      const dx = Math.max(box.x0 - points[k], 0, points[k] - box.x1);
      const dy = Math.max(box.y0 - points[k + 1], 0, points[k + 1] - box.y1);
      if (dx * dx + dy * dy <= r * r) return [i];
    }
    return [];
  });
  const fills = art.fills.flatMap((fill, i) => {
    if (!overlaps(fillBox(fill), box)) return [];
    for (const ring of ringsOf(fill)) {
      const n = Math.floor(ring.length / 2);
      for (let a = 0, b = n - 1; a < n; b = a++) {
        if (
          crossesBox(
            ring[2 * b],
            ring[2 * b + 1],
            ring[2 * a],
            ring[2 * a + 1],
            box
          )
        ) {
          return [i];
        }
      }
    }
    // No outline in it – unless the box lies inside the area.
    return insideFill(fill, box.x0, box.y0) ? [i] : [];
  });
  const hit = { strokes, fills };
  return isNothing(hit) ? null : grouped(art, hit);
};

/** The selection's points, flat pairs – what must stay on the face. */
export const pointsOf = (art: Art, selection: Selection) => {
  const out: number[] = [];
  for (const i of selection.strokes) out.push(...(art.strokes[i]?.p ?? []));
  for (const i of selection.fills) {
    for (const ring of art.fills[i]?.p ?? []) out.push(...ring);
  }
  return out;
};

/** The box round the selection – lines as wide as they are drawn. */
export const boxOf = (art: Art, selection: Selection): Box | null => {
  const box = emptyBox();
  for (const i of selection.strokes) {
    const stroke = art.strokes[i];
    if (!stroke) continue;
    const { p, w } = stroke;
    for (let k = 0; k + 1 < p.length; k += 2) grow(box, p[k], p[k + 1], w / 2);
  }
  for (const i of selection.fills) {
    for (const ring of art.fills[i]?.p ?? []) {
      for (let k = 0; k + 1 < ring.length; k += 2)
        grow(box, ring[k], ring[k + 1]);
    }
  }
  return Number.isFinite(box.x0) ? box : null;
};

/** The selection's lines and areas on their own. */
export const pick = (art: Art, selection: Selection): Art => ({
  strokes: selection.strokes.flatMap((i) => art.strokes[i] ?? []),
  fills: selection.fills.flatMap((i) => art.fills[i] ?? []),
});

export const remove = (art: Art, selection: Selection): Art => {
  const lines = new Set(selection.strokes);
  const areas = new Set(selection.fills);
  return {
    strokes: art.strokes.filter((_, i) => !lines.has(i)),
    fills: art.fills.filter((_, i) => !areas.has(i)),
  };
};

/** The width all picked lines share – null when they differ, or none. */
export const widthOf = (art: Art, selection: Selection) => {
  const widths = new Set(selection.strokes.map((i) => art.strokes[i]?.w));
  const [only] = widths;
  return widths.size === 1 && only !== undefined ? only : null;
};

/** The picked lines drawn this wide – areas have no width. */
export const restroke = (art: Art, selection: Selection, w: number): Art => {
  const lines = new Set(selection.strokes);
  return {
    strokes: art.strokes.map((s, i) =>
      lines.has(i) && s.w !== w ? { ...s, w } : s
    ),
    fills: art.fills,
  };
};

/** Whether a drawing keeps within what one stamp may hold. */
export const withinLimits = (art: Art) => {
  const points =
    art.strokes.reduce((sum, s) => sum + s.p.length / 2, 0) +
    art.fills.reduce(
      (sum, f) => sum + f.p.reduce((n, ring) => n + ring.length / 2, 0),
      0
    );
  return (
    art.strokes.length <= DRAWING_LIMITS.strokes &&
    art.fills.length <= DRAWING_LIMITS.fills &&
    points <= DRAWING_LIMITS.points
  );
};

/**
 * A change of place: x' = a·x + c·y + e, y' = b·x + d·y + f – as
 * [a, b, c, d, e, f], like SVG's `matrix()`.
 */
export type Matrix = [number, number, number, number, number, number];

export const apply = (m: Matrix, x: number, y: number): Point => [
  m[0] * x + m[2] * y + m[4],
  m[1] * x + m[3] * y + m[5],
];

/** `n` first, then `m`. */
export const compose = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

export const translate = (dx: number, dy: number): Matrix => [
  1,
  0,
  0,
  1,
  dx,
  dy,
];

/** Turned by `angle` (radians, clockwise on screen) about a point. */
export const turnAbout = (angle: number, cx: number, cy: number): Matrix => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy];
};

/** The selection's points moved – lines keep their width. */
export const transformArt = (
  art: Art,
  selection: Selection,
  m: Matrix
): Art => {
  const lines = new Set(selection.strokes);
  const areas = new Set(selection.fills);
  const move = (p: readonly number[]) => {
    const out: number[] = [];
    for (let i = 0; i + 1 < p.length; i += 2) {
      const [x, y] = apply(m, p[i], p[i + 1]);
      out.push(round(x), round(y));
    }
    return out;
  };
  return {
    strokes: art.strokes.map((s, i) =>
      lines.has(i) ? { ...s, p: move(s.p) } : s
    ),
    fills: art.fills.map((f, i) =>
      areas.has(i) ? { ...f, p: f.p.map(move) } : f
    ),
  };
};

/**
 * The selection's frame: its middle, size and how far it is turned. A new
 * selection's hugs it, upright; moving, turning and sizing carry it along
 * (`frameAfter`) – turned, it stays turned, like Figma's.
 */
export type Frame = {
  cx: number;
  cy: number;
  w: number;
  h: number;
  angle: number;
};

export const frameAround = (box: Box): Frame => ({
  cx: (box.x0 + box.x1) / 2,
  cy: (box.y0 + box.y1) / 2,
  w: box.x1 - box.x0,
  h: box.y1 - box.y0,
  angle: 0,
});

/** A point in the frame's own terms – from its middle, along its sides. */
export const intoFrame = (f: Frame, x: number, y: number): Point => {
  const c = Math.cos(f.angle);
  const s = Math.sin(f.angle);
  const dx = x - f.cx;
  const dy = y - f.cy;
  return [c * dx + s * dy, -s * dx + c * dy];
};

export const outOfFrame = (f: Frame, u: number, v: number): Point => {
  const c = Math.cos(f.angle);
  const s = Math.sin(f.angle);
  return [f.cx + c * u - s * v, f.cy + s * u + c * v];
};

/** The frame carried along by a change. */
export const frameAfter = (f: Frame, m: Matrix): Frame => {
  const [cx, cy] = apply(m, f.cx, f.cy);
  const c = Math.cos(f.angle);
  const s = Math.sin(f.angle);
  const ux = m[0] * c + m[2] * s;
  const uy = m[1] * c + m[3] * s;
  const vx = -m[0] * s + m[2] * c;
  const vy = -m[1] * s + m[3] * c;
  return {
    cx,
    cy,
    w: f.w * Math.hypot(ux, uy),
    h: f.h * Math.hypot(vx, vy),
    angle: Math.atan2(uy, ux),
  };
};

/** Sized along the frame's sides about a point of it (frame terms). */
export const sizeIn = (
  f: Frame,
  sx: number,
  sy: number,
  ax: number,
  ay: number
): Matrix => {
  const toFrame = compose(turnAbout(-f.angle, 0, 0), translate(-f.cx, -f.cy));
  const size = compose(
    translate(ax, ay),
    compose([sx, 0, 0, sy, 0, 0], translate(-ax, -ay))
  );
  const back = compose(translate(f.cx, f.cy), turnAbout(f.angle, 0, 0));
  return compose(back, compose(size, toFrame));
};

/** A hair over the edge still counts as on it. */
const EPS = 1e-6;

/** Whether the points, changed, stay in the unit square. */
export const fits = (points: readonly number[], m: Matrix) => {
  for (let i = 0; i + 1 < points.length; i += 2) {
    const [x, y] = apply(m, points[i], points[i + 1]);
    if (x < -EPS || y < -EPS || x > 1 + EPS || y > 1 + EPS) return false;
  }
  return true;
};

/**
 * How much of a change (0–1) can be made with the points staying in the
 * square – `make(t)` the change made that far.
 */
export const furthest = (
  points: readonly number[],
  make: (t: number) => Matrix
) => {
  if (fits(points, make(1))) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    if (fits(points, make(mid))) lo = mid;
    else hi = mid;
  }
  return lo;
};

/** A move kept on the face: the points stop at the square's edge. */
export const moveWithin = (
  points: readonly number[],
  dx: number,
  dy: number
): Point => {
  if (!points.length) return [dx, dy];
  const box = boxOfPoints(points);
  return [
    Math.min(Math.max(dx, Math.min(0, -box.x0)), Math.max(0, 1 - box.x1)),
    Math.min(Math.max(dy, Math.min(0, -box.y0)), Math.max(0, 1 - box.y1)),
  ];
};

/** Turning snaps to these steps with ⇧ – 15°, like Figma. */
export const TURN_STEP = Math.PI / 12;
/** A frame is never sized smaller than this (a share of the face). */
const LEAST = 0.02;

/**
 * Turning the frame about its middle, from where it was grabbed to where
 * the pointer is – in 15° steps with `snap`. Turned past the edge, it is
 * pushed back onto the face if it fits there; else it stops.
 */
export const turning = (
  f: Frame,
  points: readonly number[],
  from: Point,
  to: Point,
  snap: boolean
): Matrix => {
  let delta =
    Math.atan2(to[1] - f.cy, to[0] - f.cx) -
    Math.atan2(from[1] - f.cy, from[0] - f.cx);
  if (snap)
    delta = Math.round((f.angle + delta) / TURN_STEP) * TURN_STEP - f.angle;
  const m = turnAbout(delta, f.cx, f.cy);
  if (fits(points, m)) return m;
  const box = emptyBox();
  for (let i = 0; i + 1 < points.length; i += 2) {
    const [x, y] = apply(m, points[i], points[i + 1]);
    grow(box, x, y);
  }
  if (box.x1 - box.x0 <= 1 && box.y1 - box.y0 <= 1) {
    const dx = box.x0 < 0 ? -box.x0 : Math.min(0, 1 - box.x1);
    const dy = box.y0 < 0 ? -box.y0 : Math.min(0, 1 - box.y1);
    return compose(translate(dx, dy), m);
  }
  const t = furthest(points, (t) => turnAbout(delta * t, f.cx, f.cy));
  return turnAbout(delta * t, f.cx, f.cy);
};

/**
 * Sizing by a handle – [hx, hy], −1/0/1 along the frame's sides: a corner
 * or the middle of a side – dragged from `from` to `to`. The opposite
 * corner or side stays (the middle, `centered` – Alt); a corner sizes
 * freely (in proportion with `even` – ⇧), a side along its axis (both with
 * `even`). Never flipped, never below a least size, never off the face.
 */
export const sizing = (
  f: Frame,
  points: readonly number[],
  [hx, hy]: Point,
  from: Point,
  to: Point,
  { even = false, centered = false } = {}
): Matrix => {
  const [fu, fv] = intoFrame(f, from[0], from[1]);
  const [tu, tv] = intoFrame(f, to[0], to[1]);
  // Where the handle is dragged to, and what stays.
  const hu = (hx * f.w) / 2 + tu - fu;
  const hv = (hy * f.h) / 2 + tv - fv;
  const ax = centered ? 0 : (-hx * f.w) / 2;
  const ay = centered ? 0 : (-hy * f.h) / 2;
  const reachX = (hx * f.w) / 2 - ax;
  const reachY = (hy * f.h) / 2 - ay;
  let sx = hx && reachX ? (hu - ax) / reachX : 1;
  let sy = hy && reachY ? (hv - ay) / reachY : 1;
  const leastX = Math.min(1, LEAST / Math.max(f.w, 1e-9));
  const leastY = Math.min(1, LEAST / Math.max(f.h, 1e-9));
  if (even) {
    let s = hx ? sx : sy;
    if (hx && hy) {
      // Along the diagonal – how far the pointer got along it.
      s =
        ((hu - ax) * reachX + (hv - ay) * reachY) / (reachX ** 2 + reachY ** 2);
    }
    s = Math.max(s, leastX, leastY);
    sx = s;
    sy = s;
  } else {
    sx = Math.max(sx, leastX);
    sy = Math.max(sy, leastY);
  }
  const make = (tx: number, ty: number) =>
    sizeIn(f, 1 + tx * (sx - 1), 1 + ty * (sy - 1), ax, ay);
  if (fits(points, make(1, 1))) return make(1, 1);
  if (even) {
    const t = furthest(points, (t) => make(t, t));
    return make(t, t);
  }
  // Each axis as far as it goes – one stopped at the edge, the other on.
  const tx = furthest(points, (t) => make(t, 0));
  const ty = furthest(points, (t) => make(tx, t));
  return make(tx, ty);
};

/**
 * Two fingers: turned and sized (evenly) about where they began, moved
 * along with their middle – as far as the face allows.
 */
export const pinching = (
  f: Frame,
  points: readonly number[],
  from: [Point, Point],
  to: [Point, Point]
): Matrix => {
  const [a0, b0] = from;
  const [a1, b1] = to;
  const mid0: Point = [(a0[0] + b0[0]) / 2, (a0[1] + b0[1]) / 2];
  const mid1: Point = [(a1[0] + b1[0]) / 2, (a1[1] + b1[1]) / 2];
  const least = Math.min(1, LEAST / Math.max(Math.min(f.w, f.h), 1e-9));
  const scale = Math.max(
    least,
    Math.hypot(b1[0] - a1[0], b1[1] - a1[1]) /
      Math.max(Math.hypot(b0[0] - a0[0], b0[1] - a0[1]), 1e-6)
  );
  const delta =
    Math.atan2(b1[1] - a1[1], b1[0] - a1[0]) -
    Math.atan2(b0[1] - a0[1], b0[0] - a0[0]);
  const make = (t: number): Matrix => {
    const s = 1 + t * (scale - 1);
    const c = Math.cos(delta * t) * s;
    const n = Math.sin(delta * t) * s;
    return compose(
      translate(
        mid0[0] + t * (mid1[0] - mid0[0]),
        mid0[1] + t * (mid1[1] - mid0[1])
      ),
      compose([c, n, -n, c, 0, 0], translate(-mid0[0], -mid0[1]))
    );
  };
  return make(furthest(points, make));
};

/**
 * Copies of some lines and areas laid on top of the drawing, moved by
 * (dx, dy) as far as the face allows, and picked – or null when the
 * drawing would hold more than a stamp may.
 */
export const addCopies = (
  art: Art,
  copies: Art,
  dx: number,
  dy: number
): { art: Art; selection: Selection } | null => {
  const all = everything(copies);
  const [mx, my] = moveWithin(pointsOf(copies, all), dx, dy);
  const moved = transformArt(copies, all, translate(mx, my));
  const next = {
    strokes: [...art.strokes, ...moved.strokes],
    fills: [...art.fills, ...moved.fills],
  };
  if (!withinLimits(next) || isNothing(all)) return null;
  return {
    art: next,
    selection: {
      strokes: moved.strokes.map((_, i) => art.strokes.length + i),
      fills: moved.fills.map((_, i) => art.fills.length + i),
    },
  };
};

/** The cursor for a handle – pointing the way it sizes, the frame turned. */
export const sizeCursor = (f: Frame, [hx, hy]: Point) => {
  const turned = (Math.atan2(hy, hx) + f.angle) * (180 / Math.PI);
  const way = (((turned % 180) + 180) % 180) / 45;
  return ["ew-resize", "nwse-resize", "ns-resize", "nesw-resize"][
    Math.round(way) % 4
  ];
};

/** The frame's handles: its corners and the middles of its sides. */
export const HANDLES: Point[] = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
];

export type Grip =
  | { kind: "size"; handle: Point }
  | { kind: "turn" }
  | { kind: "move" };

/**
 * What a point on the selection grabs (lengths on the face): a handle
 * within `reach` – a corner, or a side anywhere along it; just outside a
 * corner (up to `turn` from it) the turn; the knob above the frame (`knob`
 * up, touch); the frame's inside moves. On a frame too small for its
 * handles, inside it moves – the handles are reached from outside.
 */
export const grip = (
  f: Frame,
  x: number,
  y: number,
  { reach, turn = 0, knob = 0 }: { reach: number; turn?: number; knob?: number }
): Grip | null => {
  const [u, v] = intoFrame(f, x, y);
  const hw = f.w / 2;
  const hh = f.h / 2;
  const inside = Math.abs(u) <= hw && Math.abs(v) <= hh;
  if (knob && Math.hypot(u, v + hh + knob) <= reach) return { kind: "turn" };
  const small = Math.min(f.w, f.h) < reach * 3;
  if (!(inside && small)) {
    for (const [hx, hy] of HANDLES) {
      if (!(hx && hy)) continue;
      if (Math.hypot(u - hx * hw, v - hy * hh) <= reach) {
        return { kind: "size", handle: [hx, hy] };
      }
    }
    // A side: within reach outside it, less far in on a narrow frame.
    const inX = Math.min(reach, f.w / 4);
    const inY = Math.min(reach, f.h / 4);
    if (Math.abs(u) <= hw) {
      if (v >= -hh - reach && v <= -hh + inY)
        return { kind: "size", handle: [0, -1] };
      if (v <= hh + reach && v >= hh - inY)
        return { kind: "size", handle: [0, 1] };
    }
    if (Math.abs(v) <= hh) {
      if (u >= -hw - reach && u <= -hw + inX)
        return { kind: "size", handle: [-1, 0] };
      if (u <= hw + reach && u >= hw - inX)
        return { kind: "size", handle: [1, 0] };
    }
  }
  if (inside) return { kind: "move" };
  if (turn) {
    for (const [hx, hy] of HANDLES) {
      if (hx && hy && Math.hypot(u - hx * hw, v - hy * hh) <= turn) {
        return { kind: "turn" };
      }
    }
  }
  return null;
};
