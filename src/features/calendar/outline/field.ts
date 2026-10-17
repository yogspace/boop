import type { Point } from "../path";

/**
 * How far points are from an outline (outline.ts) – a distance field over
 * the face, quick near the line: a grid's cells each know the stretches
 * within reach of them; further off, every stretch is measured.
 */

/**
 * How far a point lies from an outline – negative inside, unit lengths. Its
 * slope is the way out.
 */
export type Distance = (x: number, y: number) => number;

/**
 * A distance with its slope: `probe` writes the distance and the way out
 * there (a unit vector) into `out` – one look instead of five.
 */
export type Field = {
  at: Distance;
  probe: (x: number, y: number, out: Float64Array) => void;
};

/** How far the quick distance looks: further, it measures everything. */
const NEAR = 0.12;
/** The grid it looks it up in – cells across, and where it lies. */
const GRID = 96;
const GRID_FROM = -0.3;
const GRID_SIZE = 1.6;

/**
 * The distance to a ring of points (clockwise on screen) – quick near it:
 * each cell of a grid knows the stretches within reach of it. Inside or out
 * is told by the nearest stretch – or, at a corner, by both of its sides.
 */
export const ringField = (ring: readonly Point[]): Field => {
  const n = ring.length;
  const ax = new Float64Array(n);
  const ay = new Float64Array(n);
  const dx = new Float64Array(n);
  const dy = new Float64Array(n);
  const ll = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % n];
    ax[i] = x0;
    ay[i] = y0;
    dx[i] = x1 - x0;
    dy[i] = y1 - y0;
    ll[i] = dx[i] * dx[i] + dy[i] * dy[i];
  }
  // Each corner's way in – between its two stretches' (clockwise: the
  // inside is to the right of a stretch).
  const inX = new Float64Array(n);
  const inY = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const p = (i + n - 1) % n;
    const lp = Math.sqrt(ll[p]) || 1;
    const li = Math.sqrt(ll[i]) || 1;
    inX[i] = -dy[p] / lp - dy[i] / li;
    inY[i] = dx[p] / lp + dx[i] / li;
  }
  /** Where along stretch i the nearest point to (x, y) is (0–1). */
  const along = (i: number, x: number, y: number) =>
    ll[i]
      ? Math.max(
          0,
          Math.min(1, ((x - ax[i]) * dx[i] + (y - ay[i]) * dy[i]) / ll[i])
        )
      : 0;
  const cell = GRID_SIZE / GRID;
  const reach = NEAR + cell * Math.SQRT1_2;
  const lists: number[][] = Array.from({ length: GRID * GRID }, () => []);
  for (let i = 0; i < n; i++) {
    const gx0 = Math.max(
      0,
      Math.floor((Math.min(ax[i], ax[i] + dx[i]) - reach - GRID_FROM) / cell)
    );
    const gx1 = Math.min(
      GRID - 1,
      Math.floor((Math.max(ax[i], ax[i] + dx[i]) + reach - GRID_FROM) / cell)
    );
    const gy0 = Math.max(
      0,
      Math.floor((Math.min(ay[i], ay[i] + dy[i]) - reach - GRID_FROM) / cell)
    );
    const gy1 = Math.min(
      GRID - 1,
      Math.floor((Math.max(ay[i], ay[i] + dy[i]) + reach - GRID_FROM) / cell)
    );
    for (let gy = gy0; gy <= gy1; gy++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const px = GRID_FROM + (gx + 0.5) * cell;
        const py = GRID_FROM + (gy + 0.5) * cell;
        const t = along(i, px, py);
        const ex = px - ax[i] - t * dx[i];
        const ey = py - ay[i] - t * dy[i];
        if (ex * ex + ey * ey <= reach * reach) lists[gy * GRID + gx].push(i);
      }
    }
  }
  // Only those that can be nearest somewhere in a cell: none further from
  // its middle than the nearest one, and the cell's width.
  const half = cell * Math.SQRT1_2;
  const cells = lists.map((list, k) => {
    if (list.length < 2) return Int32Array.from(list);
    const px = GRID_FROM + ((k % GRID) + 0.5) * cell;
    const py = GRID_FROM + (Math.floor(k / GRID) + 0.5) * cell;
    const far = list.map((i) => {
      const t = along(i, px, py);
      return Math.hypot(px - ax[i] - t * dx[i], py - ay[i] - t * dy[i]);
    });
    const least = Math.min(...far);
    return Int32Array.from(list.filter((_, n) => far[n] <= least + 2 * half));
  });
  const all = Int32Array.from({ length: n }, (_, i) => i);
  /** The nearest among some stretches: [squared distance, which, where]. */
  const found = new Float64Array(3);
  const nearest = (x: number, y: number, among: Int32Array) => {
    let best = Infinity;
    let at = 0;
    let where = 0;
    for (let k = 0; k < among.length; k++) {
      const i = among[k];
      const t = along(i, x, y);
      const ex = x - ax[i] - t * dx[i];
      const ey = y - ay[i] - t * dy[i];
      const d = ex * ex + ey * ey;
      if (d < best) {
        best = d;
        at = i;
        where = t;
      }
    }
    found[0] = best;
    found[1] = at;
    found[2] = where;
  };
  const probe = (x: number, y: number, out: Float64Array) => {
    const gx = Math.floor((x - GRID_FROM) / cell);
    const gy = Math.floor((y - GRID_FROM) / cell);
    const near =
      gx >= 0 && gy >= 0 && gx < GRID && gy < GRID
        ? cells[gy * GRID + gx]
        : null;
    if (near?.length) nearest(x, y, near);
    if (!near?.length || found[0] > NEAR * NEAR) nearest(x, y, all);
    const i = found[1];
    const t = found[2];
    const qx = ax[i] + t * dx[i];
    const qy = ay[i] + t * dy[i];
    let inside: boolean;
    if (t > 1e-9 && t < 1 - 1e-9) {
      inside = dx[i] * (y - ay[i]) - dy[i] * (x - ax[i]) > 0;
    } else {
      const corner = t <= 1e-9 ? i : (i + 1) % n;
      inside =
        (x - ax[corner]) * inX[corner] + (y - ay[corner]) * inY[corner] > 0;
    }
    const d = Math.sqrt(found[0]);
    const sign = inside ? -1 : 1;
    out[0] = sign * d;
    if (d > 1e-12) {
      out[1] = (sign * (x - qx)) / d;
      out[2] = (sign * (y - qy)) / d;
    } else {
      // On the line: its own way out.
      const l = Math.sqrt(ll[i]) || 1;
      out[1] = dy[i] / l;
      out[2] = -dx[i] / l;
    }
  };
  const scratch = new Float64Array(3);
  return {
    probe,
    at: (x, y) => {
      probe(x, y, scratch);
      return scratch[0];
    },
  };
};

/** How far points are from a ring (clockwise on screen) – negative inside. */
export const ringDistance = (ring: readonly Point[]): Distance =>
  ringField(ring).at;
