import {
  type Art,
  type Box,
  boxOfPoints,
  crossings,
  distanceSq,
  fillBox,
  overlaps,
  roundPoints,
  samplesOf,
  strokeBox,
  thin,
} from "./art";
import type { Fill, Stroke } from "./model";

/**
 * The eraser really takes away – nothing of it is kept, the drawing stays
 * lines and areas:
 *
 * - A line it touches is cut short or in two, so far that the round ends
 *   left over stop at its edge – the line's width counts. What is gone
 *   entirely disappears.
 * - A filled area (from an uploaded picture) is drawn anew without what was
 *   erased: laid on a fine grid, the eraser taken out of it, its outline
 *   traced again (marching squares, even-odd – holes and pieces included).
 *
 * The rim is not the drawing's – the eraser never touches it. Erasing goes
 * along with the pointer (`startErasing`): each new bit of the eraser's way
 * looks only at what lies near it, and a line or area is worked out again
 * only when something of it went – quick with many lines, too.
 */

/** The grid an area is erased on – cells this wide (1/320 of the face). */
const CELL = 1 / 320;
/** Rows and columns sampled per cell, for smooth edges. */
const FINE = 4;
/** A remaining piece keeps its form to within this. */
const THIN_LINE = 0.0012;
const THIN_AREA = 0.0012;
/** Where the grid is this full, the area is. */
const ISO = 0.5;

/** A line on the way of the eraser: which of its points are gone. */
type Line = {
  stroke: Stroke;
  gone: Uint8Array | null;
  cut: boolean;
  pieces: Stroke[] | null;
};

/** An area on the way of the eraser: how much ink, how much erased. */
type Grid = {
  x0: number;
  y0: number;
  nx: number;
  ny: number;
  ink: Float32Array;
  erased: Float32Array;
};
type Area = {
  fill: Fill;
  grid: Grid | null;
  cut: boolean;
  dirty: boolean;
  traced: Fill | null;
};

/** What is left of a line: its stretches between the gone points. */
const piecesOf = ({ stroke, gone }: Line): Stroke[] => {
  const points = samplesOf(stroke);
  const pieces: Stroke[] = [];
  let run: number[] = [];
  const flush = () => {
    if (run.length) {
      // Plain lines – an anchored line cut is none any more (its anchors
      // go), as in Illustrator.
      pieces.push({ w: stroke.w, p: roundPoints(thin(run, THIN_LINE)) });
    }
    run = [];
  };
  for (let k = 0; k * 2 < points.length; k++) {
    if (gone?.[k]) flush();
    else run.push(points[2 * k], points[2 * k + 1]);
  }
  flush();
  return pieces;
};

/**
 * How much of each grid point's cell the area covers (0–1) – sampled in
 * FINE rows per cell, each row's stretches inside the area exactly.
 */
const inkOf = (fill: Fill, box: Box): Grid => {
  // Two empty cells all round – every traced outline closes.
  const x0 = Math.floor(box.x0 / CELL) * CELL - 2 * CELL;
  const y0 = Math.floor(box.y0 / CELL) * CELL - 2 * CELL;
  const nx = Math.ceil((box.x1 - x0) / CELL) + 3;
  const ny = Math.ceil((box.y1 - y0) / CELL) + 3;
  const ink = new Float32Array(nx * ny);
  const share = 1 / (CELL * FINE);
  for (let j = 0; j < ny; j++) {
    for (let s = 0; s < FINE; s++) {
      const y = y0 + (j - 0.5 + (s + 0.5) / FINE) * CELL;
      let winding = 0;
      let from = 0;
      for (const { x, dir } of crossings(fill, y)) {
        const was = winding;
        winding = fill.rule === "evenodd" ? winding ^ 1 : winding + dir;
        if (!was && winding) from = x;
        if (!was || winding) continue;
        // A stretch inside: shared out to the cells it runs through.
        const first = Math.max(0, Math.floor((from - x0) / CELL + 0.5));
        const last = Math.min(nx - 1, Math.floor((x - x0) / CELL + 0.5));
        for (let i = first; i <= last; i++) {
          const lo = x0 + (i - 0.5) * CELL;
          const covered = Math.min(lo + CELL, x) - Math.max(lo, from);
          if (covered > 0) ink[j * nx + i] += covered * share;
        }
      }
    }
  }
  return { x0, y0, nx, ny, ink, erased: new Float32Array(nx * ny) };
};

/** A cell's corners clockwise – top left, top right, bottom right, bottom left. */
const CORNERS = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
] as const;

/**
 * The area's outline traced again where ink is left (marching squares on
 * the grid, the edges where it is half full) – even-odd, so islands and
 * holes come out right whichever way they run. Null: nothing left.
 */
const traceArea = ({ x0, y0, nx, ny, ink, erased }: Grid): Fill | null => {
  const level = new Float32Array(nx * ny);
  for (let k = 0; k < level.length; k++) level[k] = ink[k] * (1 - erased[k]);
  // Each crossed grid edge: where the outline crosses it, and the edge it
  // goes on to – every edge is left once and reached once.
  const next = new Map<number, number>();
  const at = new Map<number, [number, number]>();
  const values = [0, 0, 0, 0];
  for (let j = 0; j + 1 < ny; j++) {
    for (let i = 0; i + 1 < nx; i++) {
      const k = j * nx + i;
      values[0] = level[k];
      values[1] = level[k + 1];
      values[2] = level[k + nx + 1];
      values[3] = level[k + nx];
      const first = values[0] > ISO;
      if (
        values[1] > ISO === first &&
        values[2] > ISO === first &&
        values[3] > ISO === first
      ) {
        continue;
      }
      // The edges from each corner to the next: along the top, down the
      // right, back along the bottom, up the left.
      const ids = [k * 2, (k + 1) * 2 + 1, (k + nx) * 2, k * 2 + 1];
      const found: { id: number; leaves: boolean }[] = [];
      for (let c = 0; c < 4; c++) {
        const a = values[c];
        const b = values[(c + 1) % 4];
        if (a > ISO === b > ISO) continue;
        const t = (ISO - a) / (b - a);
        const [ai, aj] = CORNERS[c];
        const [bi, bj] = CORNERS[(c + 1) % 4];
        at.set(ids[c], [
          x0 + (i + ai + (bi - ai) * t) * CELL,
          y0 + (j + aj + (bj - aj) * t) * CELL,
        ]);
        found.push({ id: ids[c], leaves: a > ISO });
      }
      // Two crossings: from where the outline leaves to where it enters.
      // Four (a saddle): the middle decides whether the inside corners
      // join – then each leaving goes to the next entering, else to the one
      // before.
      const joined = values.reduce((sum, v) => sum + v, 0) / 4 > ISO;
      for (let m = 0; m < found.length; m++) {
        if (!found[m].leaves) continue;
        const to =
          found.length === 2 ? found[1 - m] : found[(m + (joined ? 1 : 3)) % 4];
        next.set(found[m].id, to.id);
      }
    }
  }
  const rings: number[][] = [];
  const seen = new Set<number>();
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const ring: number[] = [];
    for (
      let id: number | undefined = start;
      id !== undefined && !seen.has(id);
      id = next.get(id)
    ) {
      seen.add(id);
      const point = at.get(id);
      if (point) ring.push(point[0], point[1]);
    }
    const kept = closedThin(ring, THIN_AREA);
    if (kept.length >= 6 && Math.abs(area(kept)) > CELL * CELL) {
      rings.push(kept);
    }
  }
  return rings.length ? { p: rings, rule: "evenodd" } : null;
};

/** A closed outline thinned – split at the point farthest from its start. */
const closedThin = (ring: number[], tolerance: number) => {
  const n = ring.length / 2;
  if (n < 4) return roundPoints(ring);
  let far = 0;
  let index = 0;
  for (let i = 1; i < n; i++) {
    const d = (ring[2 * i] - ring[0]) ** 2 + (ring[2 * i + 1] - ring[1]) ** 2;
    if (d > far) {
      far = d;
      index = i;
    }
  }
  const first = thin(ring.slice(0, index * 2 + 2), tolerance);
  const second = thin([...ring.slice(index * 2), ring[0], ring[1]], tolerance);
  const out = roundPoints([...first, ...second.slice(2, -2)]);
  // Closed: the last point the same as the first adds nothing.
  if (out[0] === out[out.length - 2] && out[1] === out[out.length - 1]) {
    out.length -= 2;
  }
  return out;
};

/** The signed area an outline encloses (shoelace). */
const area = (ring: number[]) => {
  let sum = 0;
  const n = ring.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    sum += ring[2 * j] * ring[2 * i + 1] - ring[2 * i] * ring[2 * j + 1];
  }
  return sum / 2;
};

/**
 * Erasing with an eraser `width` wide, as it moves: `add` each point of its
 * way, `art` is what is left – the very `art` it began with as long as it
 * took nothing away.
 */
export const startErasing = (art: Art, width: number) => {
  const r = width / 2;
  const lines: Line[] = art.strokes.map((stroke) => ({
    stroke,
    gone: null,
    cut: false,
    pieces: null,
  }));
  const areas: Area[] = art.fills.map((fill) => ({
    fill,
    grid: null,
    cut: false,
    dirty: false,
    traced: null,
  }));
  let last: [number, number] | null = null;
  let changed = false;
  let current = art;

  /** The eraser's way from a to b – a round-ended band 2r wide. */
  const sweep = (ax: number, ay: number, bx: number, by: number) => {
    const way = boxOfPoints([ax, ay, bx, by]);
    for (const line of lines) {
      const { stroke } = line;
      const reach = r + stroke.w / 2;
      if (!overlaps(strokeBox(stroke), way, r)) continue;
      const points = samplesOf(stroke);
      const reachSq = reach * reach;
      let took = false;
      for (let k = 0; k * 2 < points.length; k++) {
        if (line.gone?.[k]) continue;
        const x = points[2 * k];
        const y = points[2 * k + 1];
        if (
          x < way.x0 - reach ||
          x > way.x1 + reach ||
          y < way.y0 - reach ||
          y > way.y1 + reach
        ) {
          continue;
        }
        if (distanceSq(x, y, ax, ay, bx, by) > reachSq) continue;
        line.gone ??= new Uint8Array(points.length / 2);
        line.gone[k] = 1;
        took = true;
      }
      if (took) {
        line.cut = true;
        line.pieces = null;
        changed = true;
      }
    }
    for (const spot of areas) {
      const box = fillBox(spot.fill);
      if (!overlaps(box, way, r)) continue;
      spot.grid ??= inkOf(spot.fill, box);
      const { x0, y0, nx, ny, ink, erased } = spot.grid;
      const pad = r + CELL;
      const i0 = Math.max(0, Math.floor((way.x0 - pad - x0) / CELL));
      const i1 = Math.min(nx - 1, Math.ceil((way.x1 + pad - x0) / CELL));
      const j0 = Math.max(0, Math.floor((way.y0 - pad - y0) / CELL));
      const j1 = Math.min(ny - 1, Math.ceil((way.y1 + pad - y0) / CELL));
      let took = false;
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const k = j * nx + i;
          if (ink[k] < 0.001 || erased[k] >= 1) continue;
          const d = Math.sqrt(
            distanceSq(x0 + i * CELL, y0 + j * CELL, ax, ay, bx, by)
          );
          // Soft by one cell at the eraser's edge, like the area's own.
          const share = Math.min(1, Math.max(0, (r - d) / CELL + 0.5));
          if (share > erased[k] + 0.001) {
            erased[k] = share;
            took = true;
          }
        }
      }
      if (took) {
        spot.cut = true;
        spot.dirty = true;
        changed = true;
      }
    }
  };

  return {
    add(x: number, y: number) {
      const [ax, ay] = last ?? [x, y];
      sweep(ax, ay, x, y);
      last = [x, y];
    },
    art(): Art {
      if (!changed) return current;
      changed = false;
      const strokes: Stroke[] = [];
      for (const line of lines) {
        if (!line.cut) strokes.push(line.stroke);
        else {
          line.pieces ??= piecesOf(line);
          strokes.push(...line.pieces);
        }
      }
      const fills: Fill[] = [];
      for (const spot of areas) {
        if (spot.dirty && spot.grid) {
          spot.traced = traceArea(spot.grid);
          spot.dirty = false;
        }
        if (!spot.cut) fills.push(spot.fill);
        else if (spot.traced) fills.push(spot.traced);
      }
      current = { strokes, fills };
      return current;
    },
  };
};

/** A drawing with an eraser's whole way taken out of it. */
export const erase = (
  art: Art,
  eraser: { w: number; p: readonly number[] }
): Art => {
  const erasing = startErasing(art, eraser.w);
  for (let i = 0; i + 1 < eraser.p.length; i += 2) {
    erasing.add(eraser.p[i], eraser.p[i + 1]);
  }
  return erasing.art();
};
