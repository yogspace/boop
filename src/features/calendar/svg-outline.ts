// Relative, not `@/…`: the unit tests import this without the app's aliases.
import { thin } from "./import-svg";
import {
  boxOfPieces,
  corners,
  flattenPiece,
  PATH_LIMIT,
  type Piece,
  type Point,
  readPath,
  ringArea,
} from "./path";
import { isOutline } from "./shapes";

/**
 * An SVG file as a path for the CMS (Content → Stamp shapes, Drawing
 * templates): the shapes read from it (read-svg.ts) put together into one
 * path in the 100 × 100 box the CMS keeps them in – curves kept as curves,
 * fit in as large as it goes, centered, its numbers rounded to two places.
 *
 * A template takes all of it, and is guessed filled when most of its ink
 * lies in filled areas; a stamp shape takes one outline – its largest closed
 * piece. Only a path too long for the CMS is simplified: into straight
 * stretches, as few as keep its form. Plain numbers, no browser.
 */

/** An affine map, as SVG writes one: x′ = a·x + c·y + e, y′ = b·x + d·y + f. */
export type Matrix = readonly [number, number, number, number, number, number];

/**
 * A shape's own numbers, as the file gives them – a rectangle's radius
 * null where it is left to the other one (`auto`).
 */
export type ShapeGeometry =
  | { tag: "path"; d: string }
  | {
      tag: "rect";
      x: number;
      y: number;
      width: number;
      height: number;
      rx: number | null;
      ry: number | null;
    }
  | { tag: "circle"; cx: number; cy: number; r: number }
  | { tag: "ellipse"; cx: number; cy: number; rx: number; ry: number }
  | { tag: "line"; x1: number; y1: number; x2: number; y2: number }
  | { tag: "polyline" | "polygon"; points: readonly number[] };

/** A shape of the file that puts down ink – in the picture's own units. */
export type SvgPart = {
  pieces: Piece[];
  /** Its inside is painted. */
  filled: boolean;
  /** Its line is painted, this wide – 0: no line. */
  line: number;
  /** Only walked point by point (read-svg.ts): straight stretches, many. */
  walked?: boolean;
};

/** The CMS's box (shapes.ts, templates.ts) … */
const BOX = 100;
/** … and the air left to its sides: nearly full, like the code's own. */
const AIR = 2;
/** A walked outline keeps to itself within this (box units). */
const WALKED = 0.1;
/** A piece that ends this near its start (box units) ends there: closed. */
const MEET = 0.1;
/** A path too long is simplified, first within this (box units) … */
const SIMPLE = 0.05;
/** … then ever more coarsely, this many times at most. */
const SIMPLER = 10;

/** The pieces of a shape, from its own numbers – null where it draws none. */
export const piecesOf = (shape: ShapeGeometry): Piece[] | null => {
  switch (shape.tag) {
    case "path":
      return readPath(shape.d);
    case "rect": {
      const { x, y, width: w, height: h } = shape;
      if (!(w > 0 && h > 0)) return null;
      // A radius left open is the other one; neither given: sharp corners.
      const rx = Math.min(Math.max(shape.rx ?? shape.ry ?? 0, 0), w / 2);
      const ry = Math.min(Math.max(shape.ry ?? shape.rx ?? 0, 0), h / 2);
      if (!(rx > 0 && ry > 0)) {
        return readPath(`M${x} ${y}H${x + w}V${y + h}H${x}Z`);
      }
      const arc = `A${rx} ${ry} 0 0 1`;
      const right = x + w;
      const bottom = y + h;
      // Each side, and the corner after it – clockwise from the top left.
      return readPath(
        [
          `M${x + rx} ${y}H${right - rx}${arc} ${right} ${y + ry}`,
          `V${bottom - ry}${arc} ${right - rx} ${bottom}`,
          `H${x + rx}${arc} ${x} ${bottom - ry}`,
          `V${y + ry}${arc} ${x + rx} ${y}Z`,
        ].join("")
      );
    }
    case "circle":
    case "ellipse": {
      const { cx, cy } = shape;
      const [rx, ry] =
        shape.tag === "circle" ? [shape.r, shape.r] : [shape.rx, shape.ry];
      if (!(rx > 0 && ry > 0)) return null;
      const arc = `A${rx} ${ry} 0 0 1`;
      return readPath(
        `M${cx + rx} ${cy}${arc} ${cx - rx} ${cy}${arc} ${cx + rx} ${cy}Z`
      );
    }
    case "line": {
      const { x1, y1, x2, y2 } = shape;
      if (x1 === x2 && y1 === y2) return null;
      return [{ start: [x1, y1], segments: [{ to: [x2, y2] }], closed: false }];
    }
    case "polyline":
    case "polygon": {
      const points: Point[] = [];
      for (let i = 0; i + 1 < shape.points.length; i += 2) {
        points.push([shape.points[i], shape.points[i + 1]]);
      }
      if (points.length < 2) return null;
      return [lineOf(points, shape.tag === "polygon")];
    }
  }
};

/** Points as a piece: straight from one to the next. */
export const lineOf = (points: readonly Point[], closed: boolean): Piece => ({
  start: points[0],
  segments: points.slice(1).map((to) => ({ to })),
  closed,
});

/** Pieces moved, turned, sized, skewed – curves stay curves under it. */
export const transformPieces = (
  pieces: readonly Piece[],
  [a, b, c, d, e, f]: Matrix
): Piece[] => {
  const map = ([x, y]: Point): Point => [a * x + c * y + e, b * x + d * y + f];
  return pieces.map((piece) => ({
    start: map(piece.start),
    segments: piece.segments.map(({ to, c1, c2 }) => ({
      to: map(to),
      ...(c1 && { c1: map(c1) }),
      ...(c2 && { c2: map(c2) }),
    })),
    closed: piece.closed,
  }));
};

/** How far pieces reach each way – the longer one. */
const spanOf = (pieces: readonly Piece[]) => {
  const { x0, y0, x1, y1 } = boxOfPieces(pieces);
  return Math.max(x1 - x0, y1 - y0);
};

/** How finely pieces are flattened to be measured: this share of their span. */
const fineFor = (pieces: readonly Piece[]) =>
  Math.max(spanOf(pieces) * 1e-4, 1e-9);

/** A piece's points – a closed one's first again at the end. */
const pointsOf = (piece: Piece, tolerance: number) => {
  const points = flattenPiece(piece, tolerance);
  return piece.closed ? [...points, points[0]] : points;
};

/** How long pieces are, all together – a closed one round to its start. */
export const lengthOf = (pieces: readonly Piece[]) => {
  const tolerance = fineFor(pieces);
  let sum = 0;
  for (const piece of pieces) {
    const points = pointsOf(piece, tolerance);
    for (let i = 1; i < points.length; i++) {
      sum += Math.hypot(
        points[i][0] - points[i - 1][0],
        points[i][1] - points[i - 1][1]
      );
    }
  }
  return sum;
};

/** The area a piece encloses – an open one as if it were closed. */
const areaOf = (piece: Piece, tolerance: number) =>
  Math.abs(ringArea(flattenPiece(piece, tolerance))) / 2;

/**
 * Whether a picture is drawn mostly filled: more of its ink in filled areas
 * than along its lines (their length times their width).
 */
export const mostlyFilled = (parts: readonly SvgPart[]) => {
  const tolerance = fineFor(parts.flatMap((part) => part.pieces));
  let areas = 0;
  let lines = 0;
  for (const part of parts) {
    if (part.filled) {
      for (const piece of part.pieces) areas += areaOf(piece, tolerance);
    }
    if (part.line) lines += lengthOf(part.pieces) * part.line;
  }
  return areas > lines;
};

/**
 * Pieces fit into the box: as large as they go, their proportions kept,
 * centered. Nothing for pieces that span nothing.
 */
export const fitPieces = (pieces: readonly Piece[]): Piece[] => {
  const { x0, y0, x1, y1 } = boxOfPieces(pieces);
  const span = Math.max(x1 - x0, y1 - y0);
  if (!(span > 0 && Number.isFinite(span))) return [];
  const scale = (BOX - 2 * AIR) / span;
  return transformPieces(pieces, [
    scale,
    0,
    0,
    scale,
    BOX / 2 - ((x0 + x1) / 2) * scale,
    BOX / 2 - ((y0 + y1) / 2) * scale,
  ]);
};

/**
 * A piece closed: one that ends (nearly) at its start ends there – and,
 * `close`, any other one is closed with a straight stretch, as a fill
 * closes it.
 */
const closedUp = (piece: Piece, close: boolean): Piece => {
  if (piece.closed) return piece;
  const last = piece.segments[piece.segments.length - 1];
  const [sx, sy] = piece.start;
  if (last && Math.hypot(last.to[0] - sx, last.to[1] - sy) <= MEET) {
    const segments = [...piece.segments];
    segments[segments.length - 1] = { ...last, to: piece.start };
    return { ...piece, segments, closed: true };
  }
  return close
    ? {
        ...piece,
        segments: [...piece.segments, { to: piece.start }],
        closed: true,
      }
    : piece;
};

/**
 * A piece as straight stretches – only between the points it needs to keep
 * within `tolerance` of itself.
 */
const straight = (piece: Piece, tolerance: number): Piece => {
  const points = flattenPiece(piece, tolerance);
  return lineOf(
    piece.closed
      ? corners(points, tolerance).map((k) => points[k])
      : thin(points, tolerance),
    piece.closed
  );
};

/**
 * Pieces as an SVG path, written like the code's own: absolute commands,
 * numbers rounded to `places`, a stretch that comes to nothing left out.
 */
export const writePath = (pieces: readonly Piece[], places = 2) => {
  const factor = 10 ** places;
  const round = (n: number) => Math.round(n * factor) / factor || 0;
  const at = ([x, y]: Point): Point => [round(x), round(y)];
  const same = (p: Point, q: Point) => p[0] === q[0] && p[1] === q[1];
  const text = (...points: Point[]) => points.flat().join(" ");
  let d = "";
  for (const piece of pieces) {
    const start = at(piece.start);
    const segments = [...piece.segments];
    // Straight back to the start at the end: the Z draws that.
    const last = segments[segments.length - 1];
    if (piece.closed && last && !last.c1 && same(at(last.to), start)) {
      segments.pop();
    }
    let now = start;
    let drawn = "";
    for (const segment of segments) {
      const to = at(segment.to);
      const c1 = segment.c1 && at(segment.c1);
      const c2 = segment.c2 && at(segment.c2);
      if (c1 && c2 && !(same(c1, now) && same(c2, to))) {
        drawn += `C${text(c1, c2, to)}`;
      } else if (same(to, now)) {
        continue;
      } else if (to[1] === now[1]) {
        drawn += `H${to[0]}`;
      } else if (to[0] === now[0]) {
        drawn += `V${to[1]}`;
      } else {
        drawn += `L${text(to)}`;
      }
      now = to;
    }
    if (drawn) d += `M${text(start)}${drawn}${piece.closed ? "Z" : ""}`;
  }
  return d;
};

/** Whether the CMS takes a path: read as it is, not too long. */
const fits = (d: string) => d.length <= PATH_LIMIT && readPath(d) !== null;

/**
 * Pieces (in the box) as the path to keep – walked ones thinned first. Too
 * long, it is simplified until it fits; null if it never does.
 */
const written = (pieces: readonly Piece[]) => {
  const d = writePath(pieces);
  if (fits(d)) return { d, simplified: false };
  let tolerance = SIMPLE;
  for (let attempt = 0; attempt < SIMPLER; attempt++) {
    const simple = writePath(pieces.map((piece) => straight(piece, tolerance)));
    if (fits(simple)) return { d: simple, simplified: true };
    tolerance *= 1.7;
  }
  return null;
};

/** The parts, their pieces fit into the box together – walked ones thinned. */
const placed = (parts: readonly SvgPart[]) => {
  const fitted = fitPieces(parts.flatMap((part) => part.pieces));
  let next = 0;
  return parts.map((part) => {
    const pieces = fitted.slice(next, next + part.pieces.length);
    next += part.pieces.length;
    return {
      ...part,
      pieces: part.walked
        ? pieces.map((piece) => straight(piece, WALKED))
        : pieces,
    };
  });
};

export type TemplateFromSvg = {
  /** Its lines: the path, in the box. */
  d: string;
  /** How many pieces it has. */
  count: number;
  /** Whether it is drawn mostly filled – to drop it in filled. */
  filled: boolean;
  /** Some of it could only be walked: no curves there. */
  walked: boolean;
  /** It had to be simplified to fit. */
  simplified: boolean;
};

/**
 * A drawing template from a file's shapes: all of them, in the box – null
 * when they draw nothing. Guessed filled when most of the ink is; then what
 * is filled is closed, as its fill is.
 */
export const templateOfSvg = (
  parts: readonly SvgPart[]
): TemplateFromSvg | null => {
  if (!parts.some((part) => part.pieces.length)) return null;
  const filled = mostlyFilled(parts);
  const pieces = placed(parts).flatMap((part) =>
    part.pieces.map((piece) =>
      // A filled shape's open piece is closed by its fill – unless it is a
      // line as well, and lines are what the template is.
      closedUp(piece, part.filled && (filled || !part.line))
    )
  );
  const path = written(pieces);
  if (!path) return null;
  return {
    d: path.d,
    count: readPath(path.d)?.length ?? 0,
    filled,
    walked: parts.some((part) => part.walked),
    simplified: path.simplified,
  };
};

export type ShapeFromSvg = {
  /** Its outline: the path, in the box. */
  d: string;
  /** How many other pieces the file had – left out. */
  others: number;
  /** The outline is a line's (its middle), not a filled area's. */
  line: boolean;
  /** It could only be walked: no curves. */
  walked: boolean;
  /** It had to be simplified to fit. */
  simplified: boolean;
};

/**
 * A stamp shape from a file's shapes: one outline – the largest closed
 * piece (a filled shape's pieces are closed by their fill), alone in the
 * box. Null when there is none, or it encloses nothing (shapes.ts
 * `isOutline`).
 */
export const shapeOfSvg = (parts: readonly SvgPart[]): ShapeFromSvg | null => {
  const all = placed(parts).flatMap((part) =>
    part.pieces.map((piece) => ({
      piece: closedUp(piece, part.filled),
      part,
    }))
  );
  if (!all.length) return null;
  const tolerance = fineFor(all.map(({ piece }) => piece));
  let best: (typeof all)[number] | null = null;
  let most = 0;
  for (const one of all) {
    if (!one.piece.closed) continue;
    const area = areaOf(one.piece, tolerance);
    if (area > most) {
      most = area;
      best = one;
    }
  }
  if (!best) return null;
  const path = written(fitPieces([best.piece]));
  if (!(path && isOutline(path.d))) return null;
  return {
    d: path.d,
    others: all.length - 1,
    line: !best.part.filled,
    walked: Boolean(best.part.walked),
    simplified: path.simplified,
  };
};
