/**
 * SVG paths as the CMS keeps them – a stamp's outline (shapes.ts), the
 * shapes to drag into a drawing (templates.ts): read into pieces (`readPath`),
 * then flattened into points to measure and draw with (`flattenPiece`), or
 * turned into anchors to edit like a line drawn with the line tool
 * (`anchorsOf`, bezier.ts).
 *
 * Every command of SVG's path syntax is understood – M, L, H, V, C, S, Q, T,
 * A and Z, absolute and relative. Quadratic curves and arcs become cubic
 * ones: a piece is lines and cubics only. Plain numbers, no browser.
 */

export type Point = [number, number];

/** A stretch of a piece: straight to `to` – or a cubic, bent by c1 and c2. */
export type Segment = { to: Point; c1?: Point; c2?: Point };

/** One piece of a path – from one M to the next: closed by a Z, or open. */
export type Piece = { start: Point; segments: Segment[]; closed: boolean };

/** A path this long (characters) is no outline any more – it is refused. */
export const PATH_LIMIT = 20_000;

/** At most this many stretches in a path. */
const SEGMENT_LIMIT = 4000;

/** How many numbers each command takes. */
const ARITY: Record<string, number> = {
  m: 2,
  l: 2,
  h: 1,
  v: 1,
  c: 6,
  s: 4,
  q: 4,
  t: 2,
  a: 7,
  z: 0,
};

const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/;

/**
 * The commands of a path with their numbers – null for anything that isn't
 * one. An arc's two flags may be written without a space between them, as
 * single digits.
 */
const tokenize = (d: string) => {
  const commands: { cmd: string; args: number[] }[] = [];
  let i = 0;
  let current: { cmd: string; args: number[] } | null = null;
  const skip = () => {
    while (i < d.length && /[\s,]/.test(d[i])) i++;
  };
  skip();
  while (i < d.length) {
    const ch = d[i];
    if (/[a-zA-Z]/.test(ch)) {
      if (!(ch.toLowerCase() in ARITY)) return null;
      current = { cmd: ch, args: [] };
      commands.push(current);
      i++;
    } else {
      if (!current) return null;
      const arity = ARITY[current.cmd.toLowerCase()];
      // A flag of an arc: a single 0 or 1.
      const at = current.args.length % 7;
      if (arity === 7 && (at === 3 || at === 4) && /[01]/.test(ch)) {
        current.args.push(Number(ch));
        i++;
      } else {
        const match = NUMBER.exec(d.slice(i, i + 64));
        if (!match) return null;
        current.args.push(Number(match[0]));
        i += match[0].length;
      }
    }
    skip();
  }
  for (const { cmd, args } of commands) {
    const arity = ARITY[cmd.toLowerCase()];
    if (arity === 0 ? args.length > 0 : !args.length || args.length % arity) {
      return null;
    }
  }
  return commands;
};

/** A quadratic curve as the cubic it is. */
const cubicOfQuad = (p0: Point, q: Point, p3: Point): Segment => ({
  c1: [p0[0] + (2 / 3) * (q[0] - p0[0]), p0[1] + (2 / 3) * (q[1] - p0[1])],
  c2: [p3[0] + (2 / 3) * (q[0] - p3[0]), p3[1] + (2 / 3) * (q[1] - p3[1])],
  to: p3,
});

/**
 * An elliptical arc (SVG's endpoint form) as cubics – a quarter turn at
 * most each. A radius of nothing is a straight line, a too small one grows
 * until the arc fits (as SVG does it).
 */
const cubicsOfArc = (
  from: Point,
  [rxIn, ryIn, turn, large, sweep]: number[],
  to: Point
): Segment[] => {
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (!(rx && ry) || (from[0] === to[0] && from[1] === to[1])) {
    return [{ to }];
  }
  const phi = (turn * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  // The middle between the ends, in the ellipse's own axes.
  const dx = (from[0] - to[0]) / 2;
  const dy = (from[1] - to[1]) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;
  const grow = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (grow > 1) {
    rx *= Math.sqrt(grow);
    ry *= Math.sqrt(grow);
  }
  const sign = Boolean(large) === Boolean(sweep) ? -1 : 1;
  const top = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const bottom = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const k = sign * Math.sqrt(Math.max(0, top / bottom));
  const cx1 = (k * rx * y1) / ry;
  const cy1 = (-k * ry * x1) / rx;
  const cx = cos * cx1 - sin * cy1 + (from[0] + to[0]) / 2;
  const cy = sin * cx1 + cos * cy1 + (from[1] + to[1]) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) =>
    Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const start = angle(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let span = angle(
    (x1 - cx1) / rx,
    (y1 - cy1) / ry,
    (-x1 - cx1) / rx,
    (-y1 - cy1) / ry
  );
  if (!sweep && span > 0) span -= 2 * Math.PI;
  if (sweep && span < 0) span += 2 * Math.PI;
  const parts = Math.max(1, Math.ceil(Math.abs(span) / (Math.PI / 2) - 1e-9));
  const step = span / parts;
  const handle = (4 / 3) * Math.tan(step / 4);
  // A point of the ellipse at an angle – and its direction there.
  const on = (a: number): Point => [
    cx + rx * Math.cos(a) * cos - ry * Math.sin(a) * sin,
    cy + rx * Math.cos(a) * sin + ry * Math.sin(a) * cos,
  ];
  const along = (a: number): Point => [
    -rx * Math.sin(a) * cos - ry * Math.cos(a) * sin,
    -rx * Math.sin(a) * sin + ry * Math.cos(a) * cos,
  ];
  const segments: Segment[] = [];
  for (let i = 0; i < parts; i++) {
    const a0 = start + i * step;
    const a1 = a0 + step;
    const p0 = on(a0);
    const p1 = i + 1 === parts ? to : on(a1);
    const d0 = along(a0);
    const d1 = along(a1);
    segments.push({
      c1: [p0[0] + handle * d0[0], p0[1] + handle * d0[1]],
      c2: [p1[0] - handle * d1[0], p1[1] - handle * d1[1]],
      to: p1,
    });
  }
  return segments;
};

/** A path's pieces – null when it isn't one (or is too much of one). */
export const readPath = (d: unknown): Piece[] | null => {
  if (typeof d !== "string" || !d.trim() || d.length > PATH_LIMIT) return null;
  const commands = tokenize(d);
  if (!commands?.length || !/^[mM]/.test(commands[0].cmd)) return null;
  const pieces: Piece[] = [];
  let piece: Piece | null = null;
  let at: Point = [0, 0];
  // The last command's control point – for S and T, which mirror it.
  let lastCubic: Point | null = null;
  let lastQuad: Point | null = null;
  let count = 0;
  const begin = (p: Point) => {
    piece = { start: p, segments: [], closed: false };
    pieces.push(piece);
  };
  const add = (segment: Segment) => {
    if (!piece) begin(at);
    (piece as Piece).segments.push(segment);
    at = segment.to;
    count++;
  };
  for (const { cmd, args } of commands) {
    const lower = cmd.toLowerCase();
    const relative = cmd !== cmd.toUpperCase();
    const arity = ARITY[lower];
    const groups = arity ? args.length / arity : 1;
    for (let g = 0; g < groups; g++) {
      const n = args.slice(g * arity, g * arity + arity);
      const pt = (x: number, y: number): Point =>
        relative ? [at[0] + x, at[1] + y] : [x, y];
      let cubic: Point | null = null;
      let quad: Point | null = null;
      if (lower === "m" && g === 0) {
        at = pt(n[0], n[1]);
        begin(at);
      } else if (lower === "m" || lower === "l") {
        add({ to: pt(n[0], n[1]) });
      } else if (lower === "h") {
        add({ to: [relative ? at[0] + n[0] : n[0], at[1]] });
      } else if (lower === "v") {
        add({ to: [at[0], relative ? at[1] + n[0] : n[0]] });
      } else if (lower === "c") {
        const c1 = pt(n[0], n[1]);
        const c2 = pt(n[2], n[3]);
        add({ c1, c2, to: pt(n[4], n[5]) });
        cubic = c2;
      } else if (lower === "s") {
        const c1: Point = lastCubic
          ? [2 * at[0] - lastCubic[0], 2 * at[1] - lastCubic[1]]
          : at;
        const c2 = pt(n[0], n[1]);
        add({ c1, c2, to: pt(n[2], n[3]) });
        cubic = c2;
      } else if (lower === "q") {
        const q = pt(n[0], n[1]);
        add(cubicOfQuad(at, q, pt(n[2], n[3])));
        quad = q;
      } else if (lower === "t") {
        const q: Point = lastQuad
          ? [2 * at[0] - lastQuad[0], 2 * at[1] - lastQuad[1]]
          : at;
        add(cubicOfQuad(at, q, pt(n[0], n[1])));
        quad = q;
      } else if (lower === "a") {
        for (const segment of cubicsOfArc(at, n, pt(n[5], n[6]))) add(segment);
      } else if (lower === "z") {
        const open = piece as Piece | null;
        if (open) {
          const [sx, sy] = open.start;
          if (Math.hypot(at[0] - sx, at[1] - sy) > 1e-9) add({ to: [sx, sy] });
          open.closed = true;
          at = open.start;
          piece = null;
        }
      }
      lastCubic = cubic;
      lastQuad = quad;
      if (count > SEGMENT_LIMIT) return null;
    }
  }
  const all = pieces.filter((p) => p.segments.length);
  if (
    !all.every((p) =>
      [p.start, ...p.segments.flatMap((s) => [s.to, s.c1, s.c2])].every(
        (q) => !q || (Number.isFinite(q[0]) && Number.isFinite(q[1]))
      )
    )
  ) {
    return null;
  }
  return all.length ? all : null;
};

/** How far a point lies from the line through a and b. */
const offLine = (p: Point, a: Point, b: Point) => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = Math.hypot(dx, dy);
  if (!length) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  return Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / length;
};

/** A cubic as points within `tolerance` of it – its end, not its start. */
const flattenCubic = (
  p0: Point,
  { c1, c2, to }: Required<Segment>,
  tolerance: number,
  out: Point[],
  depth = 0
) => {
  if (
    depth > 16 ||
    Math.max(offLine(c1, p0, to), offLine(c2, p0, to)) <= tolerance
  ) {
    out.push(to);
    return;
  }
  const mid = (a: Point, b: Point): Point => [
    (a[0] + b[0]) / 2,
    (a[1] + b[1]) / 2,
  ];
  const ab = mid(p0, c1);
  const bc = mid(c1, c2);
  const cd = mid(c2, to);
  const abc = mid(ab, bc);
  const bcd = mid(bc, cd);
  const m = mid(abc, bcd);
  flattenCubic(p0, { c1: ab, c2: abc, to: m }, tolerance, out, depth + 1);
  flattenCubic(m, { c1: bcd, c2: cd, to }, tolerance, out, depth + 1);
};

/**
 * A piece as points along it, within `tolerance` – a closed one without its
 * start again at the end.
 */
export const flattenPiece = (piece: Piece, tolerance: number): Point[] => {
  const out: Point[] = [piece.start];
  let at = piece.start;
  for (const segment of piece.segments) {
    if (segment.c1 && segment.c2) {
      flattenCubic(at, segment as Required<Segment>, tolerance, out);
    } else out.push(segment.to);
    at = segment.to;
  }
  if (piece.closed && out.length > 1) {
    const [sx, sy] = out[0];
    const [ex, ey] = out[out.length - 1];
    if (Math.hypot(ex - sx, ey - sy) < 1e-9) out.pop();
  }
  return out;
};

/** How far a path reaches each way – from its ends and handles (rough). */
const extentOf = (pieces: readonly Piece[]) => {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const piece of pieces) {
    for (const segment of [{ to: piece.start }, ...piece.segments]) {
      for (const p of [segment.to, segment.c1, segment.c2]) {
        if (!p) continue;
        x0 = Math.min(x0, p[0]);
        y0 = Math.min(y0, p[1]);
        x1 = Math.max(x1, p[0]);
        y1 = Math.max(y1, p[1]);
      }
    }
  }
  return Math.max(x1 - x0, y1 - y0);
};

/**
 * The corners of a closed line of points – which of them it needs to stay
 * within `tolerance` of itself (Ramer–Douglas–Peucker, round): their
 * indices, in order.
 */
export const corners = (
  points: readonly Point[],
  tolerance: number
): number[] => {
  const n = points.length;
  if (n < 4) return points.map((_, k) => k);
  // Split at the point furthest from the first.
  let far = 0;
  let most = -1;
  for (let k = 1; k < n; k++) {
    const d = Math.hypot(
      points[k][0] - points[0][0],
      points[k][1] - points[0][1]
    );
    if (d > most) {
      most = d;
      far = k;
    }
  }
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[far] = 1;
  const stack: [number, number][] = [
    [0, far],
    [far, n],
  ];
  while (stack.length) {
    const [a, b] = stack.pop() as [number, number];
    const [ax, ay] = points[a];
    const [bx, by] = points[b % n];
    const dx = bx - ax;
    const dy = by - ay;
    const length = Math.hypot(dx, dy) || 1;
    let worst = -1;
    let at = -1;
    for (let k = a + 1; k < b; k++) {
      const off =
        Math.abs((points[k][0] - ax) * dy - (points[k][1] - ay) * dx) / length;
      if (off > worst) {
        worst = off;
        at = k;
      }
    }
    if (at >= 0 && worst > tolerance) {
      keep[at] = 1;
      stack.push([a, at], [at, b]);
    }
  }
  return Array.from(keep.keys()).filter((k) => keep[k]);
};

/** Twice the area a ring of points encloses – positive clockwise on screen. */
export const ringArea = (ring: readonly Point[]) => {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [ax, ay] = ring[i];
    const [bx, by] = ring[(i + 1) % ring.length];
    sum += ax * by - bx * ay;
  }
  return sum;
};

/**
 * The outline a path draws: its largest closed piece, flattened finely
 * (this share of its size), clockwise on screen (y down) – null when it has
 * none that encloses anything. Other pieces – holes, specks – are no
 * outline's.
 */
export const ringOf = (
  pieces: readonly Piece[] | null,
  fineness = 4e-5
): Point[] | null => {
  if (!pieces) return null;
  const tolerance = Math.max(extentOf(pieces) * fineness, 1e-9);
  let best: Point[] | null = null;
  let most = 0;
  for (const piece of pieces) {
    if (!piece.closed) continue;
    const ring = flattenPiece(piece, tolerance);
    const area = ringArea(ring);
    if (ring.length >= 3 && Math.abs(area) > most) {
      most = Math.abs(area);
      best = area < 0 ? ring.reverse() : ring;
    }
  }
  return best && most > extentOf(pieces) ** 2 * 0.01 ? best : null;
};

/** The box round some pieces – flattened finely. */
export const boxOfPieces = (pieces: readonly Piece[]) => {
  const tolerance = Math.max(extentOf(pieces) * 1e-4, 1e-9);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const piece of pieces) {
    for (const p of flattenPiece(piece, tolerance)) {
      x0 = Math.min(x0, p[0]);
      y0 = Math.min(y0, p[1]);
      x1 = Math.max(x1, p[0]);
      y1 = Math.max(y1, p[1]);
    }
  }
  return { x0, y0, x1, y1 };
};

/**
 * A piece as anchors for a line to edit (bezier.ts: six numbers each – the
 * anchor, its handle in, its handle out), moved by `place`. A straight
 * stretch leaves the handles on their anchors; a closed piece that runs back
 * to its start ends there, not in an anchor of its own.
 */
export const anchorsOf = (
  piece: Piece,
  place: (p: Point) => Point = (p) => p
): { a: number[]; closed: boolean } => {
  const anchors: { at: Point; in: Point; out: Point }[] = [
    { at: piece.start, in: piece.start, out: piece.start },
  ];
  for (const segment of piece.segments) {
    const last = anchors[anchors.length - 1];
    if (segment.c1) last.out = segment.c1;
    anchors.push({
      at: segment.to,
      in: segment.c2 ?? segment.to,
      out: segment.to,
    });
  }
  if (piece.closed && anchors.length > 2) {
    // Back at the start: the last anchor is the first.
    const end = anchors.pop() as (typeof anchors)[number];
    anchors[0].in = end.in;
  }
  const a: number[] = [];
  for (const anchor of anchors) {
    for (const p of [anchor.at, anchor.in, anchor.out]) a.push(...place(p));
  }
  return { a, closed: piece.closed };
};
