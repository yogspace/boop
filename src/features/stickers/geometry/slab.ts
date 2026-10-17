import type * as Three from "three";
// Relative, not `@/…`: the unit tests import this without the app's aliases.
import { corners } from "../../calendar/path";
import { areaOf, distanceTo, type Point, STRAIGHT } from "./outlines";

/**
 * The rubber and the plate: slabs in any outline whose top follows a height
 * map (maps.ts) – a fine grid inside, cut exactly where it meets the
 * outline, a rounded edge, a wall and a flat bottom.
 */

/** The grid the shaped surfaces are built on – cells per unit. */
const CELLS = 250;
/** Their edge rounds off over this far in (units). */
const EDGE = 0.015;

/**
 * Smooth normals for an indexed mesh – each vertex the sum of its faces'
 * (unnormalized: by their size), as three.js' `computeVertexNormals`, to
 * the last bit, only without its vectors: a stamp's surfaces have tens of
 * thousands of points.
 */
const vertexNormals = (THREE: typeof Three, geometry: Three.BufferGeometry) => {
  const p = geometry.getAttribute("position").array;
  const index = geometry.index?.array ?? [];
  const n = new Float32Array(p.length);
  for (let i = 0; i + 2 < index.length; i += 3) {
    const a = index[i] * 3;
    const b = index[i + 1] * 3;
    const c = index[i + 2] * 3;
    const cbx = p[c] - p[b];
    const cby = p[c + 1] - p[b + 1];
    const cbz = p[c + 2] - p[b + 2];
    const abx = p[a] - p[b];
    const aby = p[a + 1] - p[b + 1];
    const abz = p[a + 2] - p[b + 2];
    const x = cby * abz - cbz * aby;
    const y = cbz * abx - cbx * abz;
    const z = cbx * aby - cby * abx;
    // All three read before any is written – as three.js does, should two
    // corners be one point.
    const ax = n[a] + x;
    const ay = n[a + 1] + y;
    const az = n[a + 2] + z;
    const bx = n[b] + x;
    const by = n[b + 1] + y;
    const bz = n[b + 2] + z;
    const cx = n[c] + x;
    const cy = n[c + 1] + y;
    const cz = n[c + 2] + z;
    n[a] = ax;
    n[a + 1] = ay;
    n[a + 2] = az;
    n[b] = bx;
    n[b + 1] = by;
    n[b + 2] = bz;
    n[c] = cx;
    n[c + 1] = cy;
    n[c + 2] = cz;
  }
  for (let i = 0; i < n.length; i += 3) {
    const x = n[i];
    const y = n[i + 1];
    const z = n[i + 2];
    const scale = 1 / (Math.sqrt(x * x + y * y + z * z) || 1);
    n[i] = x * scale;
    n[i + 1] = y * scale;
    n[i + 2] = z * scale;
  }
  geometry.setAttribute("normal", new THREE.BufferAttribute(n, 3));
};

/**
 * A closed slab in an `outline` (counter-clockwise, any shape) whose top
 * (facing +Z) lies at `surface(x, y)` (≤ 0), with a softly rounded edge;
 * flat below at z = −thickness. The top is a fine grid – its points inside
 * the outline, and where its lines cross the outline – so the outline stays
 * exact, whatever its shape. Each vertex keeps its `relief` (0–1) – what
 * gets inked – and its `core`.
 */
export const shapedSlab = (
  THREE: typeof Three,
  {
    outline,
    thickness,
    surface,
  }: {
    outline: Point[];
    thickness: number;
    /**
     * Height of the top at a point – how raised it is there (0–1), and how
     * deep inside what is raised.
     */
    surface: (
      x: number,
      y: number
    ) => { z: number; relief: number; core?: number };
  }
) => {
  const ring = areaOf(outline) < 0 ? [...outline].reverse() : outline;
  const distance = distanceTo(outline);
  const positions: number[] = [];
  const relief: number[] = [];
  const core: number[] = [];
  const index: number[] = [];
  const edge = Math.min(0.008, thickness * 0.3);
  // `near`: within EDGE of the outline, maybe – only there does the edge
  // round off; further in the top is flat, and the distance isn't asked.
  const top = (x: number, y: number, near: boolean) => {
    // The edge rounds off over the outer bit.
    const t = near ? Math.max(0, 1 + distance(x, y) / EDGE) : 0;
    const at = surface(x, y);
    positions.push(x, y, at.z - edge * t * t);
    relief.push(at.relief);
    core.push(at.core ?? 0);
    return positions.length / 3 - 1;
  };
  // The grid – a little off any round number, so no corner of the outline
  // lies right on one of its lines.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of ring) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const h = 1 / CELLS;
  const x0 = minX - h * 0.737;
  const y0 = minY - h * 0.613;
  const nx = Math.ceil((maxX - x0) / h) + 1;
  const ny = Math.ceil((maxY - y0) / h) + 1;
  const xOf = (i: number) => x0 + i * h;
  const yOf = (j: number) => y0 + j * h;
  // Where the outline crosses each row and each column – sorted.
  const crossings = (count: number, at: (k: number) => number, across: 0 | 1) =>
    Array.from({ length: count }, (_, k) => {
      const line = at(k);
      const hits: number[] = [];
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        if (a[across] > line === b[across] > line) continue;
        const t = (line - a[across]) / (b[across] - a[across]);
        hits.push(a[1 - across] + t * (b[1 - across] - a[1 - across]));
      }
      return hits.sort((p, q) => p - q);
    });
  const rows = crossings(ny, yOf, 1);
  const columns = crossings(nx, xOf, 0);
  const isIn = (i: number, j: number) => {
    const x = xOf(i);
    let n = 0;
    for (const c of rows[j]) if (c < x) n++;
    return n % 2 === 1;
  };
  const inside = Array.from({ length: ny }, (_, j) =>
    Array.from({ length: nx }, (_, i) => isIn(i, j))
  );
  // The grid's points within EDGE of the outline – every one in the box
  // round each of its stretches, grown by EDGE: a thin band along it. A
  // distance takes a while far from the outline, and most points are.
  const near = new Uint8Array(nx * ny);
  for (let k = 0; k < ring.length; k++) {
    const [ax, ay] = ring[k];
    const [bx, by] = ring[(k + 1) % ring.length];
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - EDGE - x0) / h));
    const i1 = Math.min(nx - 1, Math.ceil((Math.max(ax, bx) + EDGE - x0) / h));
    const j0 = Math.max(0, Math.floor((Math.min(ay, by) - EDGE - y0) / h));
    const j1 = Math.min(ny - 1, Math.ceil((Math.max(ay, by) + EDGE - y0) / h));
    for (let j = j0; j <= j1; j++) near.fill(1, j * nx + i0, j * nx + i1 + 1);
  }
  // The grid's points inside, and where its lines cross the outline – one
  // vertex each, shared by the cells around it (−1: none yet).
  const corner = new Int32Array(nx * ny).fill(-1);
  const cross = new Map<number, number>();
  const cornerAt = (i: number, j: number) => {
    const key = j * nx + i;
    let v = corner[key];
    if (v < 0) {
      v = top(xOf(i), yOf(j), near[key] === 1);
      corner[key] = v;
    }
    return v;
  };
  // Along row j from column i (`across`), or along column i from row j.
  const crossAt = (i: number, j: number, along: "row" | "column") => {
    const key = (j * nx + i) * 2 + (along === "row" ? 0 : 1);
    let v = cross.get(key);
    if (v === undefined) {
      const fromIn = inside[j][i];
      const lo = along === "row" ? xOf(i) : yOf(j);
      const hits = (along === "row" ? rows[j] : columns[i]).filter(
        (c) => c >= lo && c < lo + h
      );
      // The one nearest the inside end – or, should the two ways of
      // looking disagree right at a corner, found by halving.
      let c = fromIn ? hits[0] : hits[hits.length - 1];
      if (c === undefined) {
        let a = lo;
        let b = lo + h;
        const at = (u: number) =>
          along === "row" ? distance(u, yOf(j)) : distance(xOf(i), u);
        for (let n = 0; n < 30; n++) {
          const m = (a + b) / 2;
          if (at(m) < 0 === fromIn) a = m;
          else b = m;
        }
        c = (a + b) / 2;
      }
      const [x, y] = along === "row" ? [c, yOf(j)] : [xOf(i), c];
      const at = surface(x, y);
      positions.push(x, y, at.z - edge);
      relief.push(at.relief);
      core.push(at.core ?? 0);
      v = positions.length / 3 - 1;
      cross.set(key, v);
    }
    return v;
  };
  /** The outline's pieces through the cells: from one crossing to the next. */
  const next = new Map<number, number>();
  for (let j = 0; j + 1 < ny; j++) {
    for (let i = 0; i + 1 < nx; i++) {
      // Corners counter-clockwise (y up): bottom left, bottom right, top
      // right, top left – each followed by the edge to the next.
      const ins = [
        inside[j][i],
        inside[j][i + 1],
        inside[j + 1][i + 1],
        inside[j + 1][i],
      ];
      if (!ins.some(Boolean)) continue;
      // Most lie wholly inside: two triangles, straight away.
      if (ins.every(Boolean)) {
        const a = cornerAt(i, j);
        const b = cornerAt(i + 1, j);
        const c = cornerAt(i + 1, j + 1);
        const d = cornerAt(i, j + 1);
        index.push(a, b, c, a, c, d);
        continue;
      }
      const cornerV = [
        () => cornerAt(i, j),
        () => cornerAt(i + 1, j),
        () => cornerAt(i + 1, j + 1),
        () => cornerAt(i, j + 1),
      ];
      const edgeV = [
        () => crossAt(i, j, "row"),
        () => crossAt(i + 1, j, "column"),
        () => crossAt(i, j + 1, "row"),
        () => crossAt(i, j, "column"),
      ];
      const polygon: { v: number; edge: boolean }[] = [];
      for (let k = 0; k < 4; k++) {
        if (ins[k]) polygon.push({ v: cornerV[k](), edge: false });
        if (ins[k] !== ins[(k + 1) % 4]) {
          polygon.push({ v: edgeV[k](), edge: true });
        }
      }
      const saddle =
        ins[0] === ins[2] && ins[1] === ins[3] && ins[0] !== ins[1];
      const parts =
        saddle && distance(xOf(i) + h / 2, yOf(j) + h / 2) >= 0
          ? // Apart: each inside corner with the crossings beside it.
            polygon.flatMap((point, k) =>
              point.edge
                ? []
                : [
                    [
                      polygon[(k + polygon.length - 1) % polygon.length],
                      point,
                      polygon[(k + 1) % polygon.length],
                    ],
                  ]
            )
          : [polygon];
      for (const part of parts) {
        for (let k = 1; k + 1 < part.length; k++) {
          index.push(part[0].v, part[k].v, part[k + 1].v);
        }
        for (let k = 0; k < part.length; k++) {
          const a = part[k];
          const b = part[(k + 1) % part.length];
          if (a.edge && b.edge) next.set(a.v, b.v);
        }
      }
    }
  }
  // Side and bottom, round each loop of the edge: the bottom needs only the
  // edge's corners – where it runs straight on, the wall fans down to them.
  const seen = new Set<number>();
  const xyOf = (v: number): Point => [positions[v * 3], positions[v * 3 + 1]];
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const loop: number[] = [];
    for (let v = start; !seen.has(v); v = next.get(v) ?? start) {
      seen.add(v);
      loop.push(v);
    }
    const kept = corners(loop.map(xyOf), STRAIGHT);
    // Below each corner kept, a vertex of the bottom – inked as far as the
    // rim is.
    const low = kept.map((k) => {
      const v = loop[k];
      positions.push(positions[v * 3], positions[v * 3 + 1], -thickness);
      relief.push(relief[v]);
      core.push(core[v]);
      return positions.length / 3 - 1;
    });
    kept.forEach((from, m) => {
      const to = kept[(m + 1) % kept.length];
      const below = low[m];
      // The top edge from this corner on to the next, fanned to the one below.
      for (let k = from; k !== to; k = (k + 1) % loop.length) {
        index.push(loop[k], below, loop[(k + 1) % loop.length]);
      }
      index.push(loop[to], below, low[(m + 1) % low.length]);
    });
    const flat = low.map((v) => new THREE.Vector2(...xyOf(v)));
    for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(flat, [])) {
      const turn =
        (flat[b].x - flat[a].x) * (flat[c].y - flat[a].y) -
        (flat[b].y - flat[a].y) * (flat[c].x - flat[a].x);
      // Facing down.
      if (turn > 0) index.push(low[a], low[c], low[b]);
      else index.push(low[a], low[b], low[c]);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setAttribute("relief", new THREE.Float32BufferAttribute(relief, 1));
  geometry.setAttribute("core", new THREE.Float32BufferAttribute(core, 1));
  geometry.setIndex(index);
  vertexNormals(THREE, geometry);
  return geometry;
};
