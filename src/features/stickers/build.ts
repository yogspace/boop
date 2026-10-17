import type * as Three from "three";
// Relative, not `@/…`: the unit tests import this without the app's aliases.
import { type ColorName, FACE, type RimPattern } from "../calendar/model";
import {
  outlineCount,
  outlineDistance,
  outlinePoints,
  rimLine,
  ringDistance,
} from "../calendar/outline";
import { type Finish, finishOf, hexOf } from "../calendar/palette";
import { corners } from "../calendar/path";
import { DEFAULT_SHAPES, outlineOf, type ShapeLike } from "../calendar/shapes";
import { inkRubber, type Rgb, rgb, setFinish, tint, toonMaterial } from "./ink";

/**
 * A stamp in 3D – a real rubber stamp: a block in the stamp's shape (a light
 * tint of its color), a knob to hold it by (the full color), and underneath
 * the rubber with the rim and the doodle standing out of it – inked, so the
 * face looks just like the drawing (FACE: the same outline, rim and lines).
 * A small plate on top carries “boop”, engraved. One unit wide. Drawn like
 * a cartoon – flat colors, ink lines (ink.ts); what is inked on the rubber in
 * a special color's finish, metal or glitter (palette.ts `finishOf`).
 *
 * Built lying on its back: the rubber face looks along +Z, its raised parts
 * at z = 0, the knob points to −Z. `pivot()` sets what it turns around,
 * `paintSticker()` dips it into another ink; render.ts turns it for a picture.
 * Every part is a closed solid, so the same model goes to a 3D printer
 * (export-stl.ts). `three` is passed in – it loads only when a stamp is shown.
 */

export type StickerInput = {
  /** Its shape's key – or, not saved yet (the CMS's preview), its outline. */
  shape: ShapeLike;
  color: ColorName;
  drawing: {
    readonly strokes: readonly {
      readonly w: number;
      readonly p: readonly number[];
    }[];
    readonly fills?: readonly {
      readonly p: readonly (readonly number[])[];
      readonly rule?: "evenodd";
    }[];
    readonly inverted?: boolean;
    /** The rim's pattern – none: plain (outline.ts `rimLine`). */
    readonly rim?: RimPattern;
    /** A stamp for the big days – it glitters. */
    readonly special?: boolean;
  } | null;
  /**
   * A literal hex's finish (the CMS's preview, palette.ts `wornFinish`) – a
   * color's key brings its own.
   */
  finish?: Finish;
};

/** The rubber: out to the rim's outer edge, its relief this high. */
const RUBBER = { grow: FACE.rim / 2, thickness: 0.08, relief: 0.035 };
/** The block is flush with the rubber – face-on, only the face shows. */
const BLOCK = { depth: 0.16, bevel: 0.04 };
/**
 * The knob, turned in one piece like on a lathe: a neck this high – wider at
 * the plate by `taper` – and a ball, flattened to `squash`, sunk into its
 * end. A cove of radius `foot` spreads the neck onto the plate; another runs
 * it into the ball, meeting it where the ball's underside leans out by
 * `lean` – nowhere more, so it prints standing up without supports.
 */
const KNOB = {
  neck: 0.11,
  taper: 1.35,
  height: 0.24,
  ball: 0.2,
  squash: 0.85,
  foot: 0.05,
  lean: Math.PI / 4,
  /** How far it reaches into the plate. */
  sunk: 0.015,
  /** Steps around, and along each of its curves. */
  steps: 64,
  curve: 12,
};
/**
 * The plate on the back: this size of the stamp – or, where that doesn't fit
 * on its back, this far in from its edge.
 */
const PLATE = { size: 0.78, inset: 0.11, thickness: 0.02, groove: 0.012 };
/** How much white the block's tint takes – a dark color more. */
const BLOCK_TINT = { light: 0.45, dark: 0.68 };
/** The rubber's ground: the ink with this much white – the drawing's. */
const GROUND = 0.86;
/** The grid the shaped surfaces are built on – cells per unit. */
const CELLS = 250;
/** Their edge rounds off over this far in (units). */
const EDGE = 0.015;
/** Points of the outlines in 3D – at least, and per point an outline needs. */
const OUTLINE = 360;
const OUTLINE_PER = 2;
/** Resolution of the height maps the surfaces are read from. */
const MAP = 512;
/** How far (map px) the face's `core` blurs: about half a line's width. */
const CORE = 6;

type Point = [number, number];

/** How many points an outline has in 3D. */
const pointsOf = (shape: ShapeLike) =>
  Math.max(OUTLINE, outlineCount(shape) * OUTLINE_PER);

/** The outlines in the model's units – each shape, grow and scale once. */
const locals = new Map<string, Point[]>();

/**
 * The shape's outline (outline.ts) in the model's units: centered, y up,
 * `scale`d about the middle – counter-clockwise, as three.js likes it.
 * Shared by every stamp of that shape: read, never changed.
 */
const localOutline = (shape: ShapeLike, grow: number, scale = 1) => {
  const key = `${outlineOf(shape)}|${grow}|${scale}`;
  let points = locals.get(key);
  if (!points) {
    points = outlinePoints(shape, grow, pointsOf(shape))
      .map(([x, y]): Point => [(x - 0.5) * scale, (0.5 - y) * scale])
      .reverse();
    locals.set(key, points);
  }
  return points;
};

/** Softens a height map a little – the walls slope like cut rubber. */
const soften = (data: Float32Array, passes = 2) => {
  const out = new Float32Array(data.length);
  for (let n = 0; n < passes; n++) {
    for (let y = 0; y < MAP; y++) {
      const row = y * MAP;
      for (let x = 0; x < MAP; x++) {
        const l = data[row + Math.max(0, x - 1)];
        const r = data[row + Math.min(MAP - 1, x + 1)];
        out[row + x] = (l + data[row + x] + r) / 3;
      }
    }
    for (let y = 0; y < MAP; y++) {
      const up = Math.max(0, y - 1) * MAP;
      const down = Math.min(MAP - 1, y + 1) * MAP;
      for (let x = 0; x < MAP; x++) {
        data[y * MAP + x] =
          (out[up + x] + out[y * MAP + x] + out[down + x]) / 3;
      }
    }
  }
  return data;
};

/**
 * Blurs a map far – a box `radius` px wide each way, three times over, the
 * sums running along. What stood raised fades towards its edges: deep inside
 * a line it is still 1, at its edge about half.
 */
const blur = (data: Float32Array, radius: number) => {
  const out = new Float32Array(data.length);
  const width = 2 * radius + 1;
  // Along a row or a column (`step` apart), from `from` on.
  const line = (
    from: Float32Array,
    to: Float32Array,
    at: number,
    step: number
  ) => {
    const read = (i: number) =>
      from[at + Math.min(MAP - 1, Math.max(0, i)) * step];
    let sum = 0;
    for (let i = -radius; i <= radius; i++) sum += read(i);
    for (let i = 0; i < MAP; i++) {
      to[at + i * step] = sum / width;
      sum += read(i + radius + 1) - read(i - radius);
    }
  };
  for (let n = 0; n < 3; n++) {
    for (let y = 0; y < MAP; y++) line(data, out, y * MAP, 1);
    for (let x = 0; x < MAP; x++) line(out, data, x, MAP);
  }
  return data;
};

/**
 * A map drawn on a canvas in the unit square (0–1, y down, like the
 * drawing): white is 1, black 0.
 */
const drawMap = (draw: (ctx: CanvasRenderingContext2D) => void) => {
  const canvas = document.createElement("canvas");
  canvas.width = MAP;
  canvas.height = MAP;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const data = new Float32Array(MAP * MAP);
  if (!ctx) return data;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, MAP, MAP);
  ctx.scale(MAP, MAP);
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#fff";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  draw(ctx);
  const pixels = ctx.getImageData(0, 0, MAP, MAP).data;
  for (let i = 0; i < data.length; i++) data[i] = pixels[i * 4] / 255;
  return data;
};

/** A map read back in local units (−0.5…0.5, y up) – bilinear, smooth. */
const sampler = (data: Float32Array) => {
  const at = (x: number, y: number) =>
    data[
      Math.min(MAP - 1, Math.max(0, y)) * MAP +
        Math.min(MAP - 1, Math.max(0, x))
    ];
  return (x: number, y: number) => {
    const fx = (x + 0.5) * MAP - 0.5;
    const fy = (0.5 - y) * MAP - 0.5;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const top = at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx;
    const bottom = at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx;
    return top * (1 - ty) + bottom * ty;
  };
};

/** A height map, softened – the walls run smooth. */
const heightMap = (draw: (ctx: CanvasRenderingContext2D) => void) =>
  sampler(soften(drawMap(draw)));

/** The shape's outline as a canvas path, in the unit square. */
const tracePath = (
  ctx: CanvasRenderingContext2D,
  shape: ShapeLike,
  grow: number
) => {
  ctx.beginPath();
  outlinePoints(shape, grow, pointsOf(shape)).forEach(([x, y], i) => {
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  });
  ctx.closePath();
};

/**
 * The face's relief, exactly as the drawing shows it (stamp-svg.tsx): the
 * rim along the outline (or its pattern – the same lines, rimLine) and the
 * doodle – the same smoothing – clipped to it. An inverted stamp is the
 * other way round: the whole face stands, the doodle and the rim's pattern
 * are cut into it. Mirrored for printing: a real stamp's face reads
 * the other way round.
 *
 * And how deep inside what stands a spot lies (`core`): 1 well inside a line
 * or an area, about half at its edge – for a finish that follows the lines
 * (ink.ts).
 */
const faceMap = (input: StickerInput, mirror: boolean) => {
  const raw = drawMap((ctx) => {
    if (mirror) {
      ctx.translate(1, 0);
      ctx.scale(-1, 1);
    }
    const inverted = Boolean(input.drawing?.inverted);
    const pattern = input.drawing?.rim;
    // The rim: everything outside its inner edge – or all of it.
    if (inverted || !pattern) ctx.fillRect(0, 0, 1, 1);
    if (!(inverted || pattern)) {
      ctx.fillStyle = "#000";
      tracePath(ctx, input.shape, -FACE.rim / 2);
      ctx.fill();
    }
    if (pattern) {
      // A patterned one: just its pattern – or that cut into the face.
      const rim = rimLine(input.shape, pattern, { cut: inverted });
      ctx.save();
      ctx.strokeStyle = inverted ? "#000" : "#fff";
      ctx.lineWidth = rim.width;
      ctx.lineCap = rim.cap;
      ctx.stroke(new Path2D(rim.d));
      ctx.restore();
    }
    // The doodle stands out of the ground – or is cut into the face.
    ctx.fillStyle = inverted ? "#000" : "#fff";
    ctx.strokeStyle = ctx.fillStyle;
    tracePath(ctx, input.shape, 0);
    ctx.clip();
    for (const fill of input.drawing?.fills ?? []) {
      ctx.beginPath();
      for (const ring of fill.p) {
        for (let i = 0; i + 1 < ring.length; i += 2) {
          if (i) ctx.lineTo(ring[i], ring[i + 1]);
          else ctx.moveTo(ring[i], ring[i + 1]);
        }
        ctx.closePath();
      }
      ctx.fill(fill.rule ?? "nonzero");
    }
    for (const stroke of input.drawing?.strokes ?? []) {
      const p = stroke.p;
      if (p.length < 2) continue;
      ctx.lineWidth = stroke.w;
      const x1 = p[p.length - 2];
      const y1 = p[p.length - 1];
      if (p.length < 6) {
        // A dot or a short line.
        if (x1 === p[0] && y1 === p[1]) {
          ctx.beginPath();
          ctx.arc(x1, y1, stroke.w / 2, 0, Math.PI * 2);
          ctx.fill();
          continue;
        }
        ctx.beginPath();
        ctx.moveTo(p[0], p[1]);
        ctx.lineTo(x1, y1);
        ctx.stroke();
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(p[0], p[1]);
      for (let i = 2; i < p.length - 2; i += 2) {
        ctx.quadraticCurveTo(
          p[i],
          p[i + 1],
          (p[i] + p[i + 2]) / 2,
          (p[i + 1] + p[i + 3]) / 2
        );
      }
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
  });
  return {
    core: sampler(blur(raw.slice(), CORE)),
    relief: sampler(soften(raw)),
  };
};

/**
 * How far points are from a ring in the model's units – negative inside. A
 * distance is quick only round the unit square (outline.ts looks things up
 * in a grid there): the ring is moved there, by half a unit, and so is
 * every point asked about.
 */
const localDistance = (ring: readonly Point[]) => {
  const at = ringDistance(ring.map(([x, y]): Point => [x + 0.5, y + 0.5]));
  return (x: number, y: number) => at(x + 0.5, y + 0.5);
};

/** Points nearer than this to a straight line through their neighbours are on it. */
const STRAIGHT = 1e-5;

/** Twice the area a ring encloses – positive counter-clockwise (y up). */
const areaOf = (ring: readonly Point[]) => {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [ax, ay] = ring[i];
    const [bx, by] = ring[(i + 1) % ring.length];
    sum += ax * by - bx * ay;
  }
  return sum;
};

const distances = new WeakMap<
  readonly Point[],
  (x: number, y: number) => number
>();

/**
 * How far points are from an outline (localOutline's) – negative inside.
 * Worked out once per outline, which every stamp of its shape shares.
 */
const distanceTo = (outline: readonly Point[]) => {
  let distance = distances.get(outline);
  if (!distance) {
    distance = localDistance(
      areaOf(outline) < 0 ? [...outline].reverse() : outline
    );
    distances.set(outline, distance);
  }
  return distance;
};

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
const shapedSlab = (
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

/**
 * The block: the shape's outline drawn up into a solid `depth` deep, its
 * edges rounded – `bevel` wide and deep each side, the outline `base` grown
 * at its faces and grown on by `bevel` round its middle. Every ring of it is
 * the outline grown exactly that far (outline.ts), so it never folds, round
 * a hollow either. Flat-shaded, like three.js' own extrusion.
 */
type Solid = { base: number; bevel: number; depth: number };

/** The block's rings, from its back to its front: how far grown, and where. */
const blockRings = ({ base, bevel, depth }: Solid) => {
  const SEGMENTS = 5;
  const rings: { grow: number; z: number }[] = [];
  for (let b = 0; b <= SEGMENTS; b++) {
    const t = (b / SEGMENTS) * (Math.PI / 2);
    rings.push({ grow: base + bevel * Math.sin(t), z: -bevel * Math.cos(t) });
  }
  for (let b = SEGMENTS; b >= 0; b--) {
    const t = (b / SEGMENTS) * (Math.PI / 2);
    rings.push({
      grow: base + bevel * Math.sin(t),
      z: depth + bevel * Math.cos(t),
    });
  }
  return rings;
};

const blockSolid = (THREE: typeof Three, shape: ShapeLike, solid: Solid) => {
  const rings = blockRings(solid);
  const outlines = rings.map(({ grow }) => localOutline(shape, grow));
  const n = pointsOf(shape);
  const positions: number[] = [];
  rings.forEach(({ z }, r) => {
    for (const [x, y] of outlines[r]) positions.push(x, y, z);
  });
  const index: number[] = [];
  for (let r = 0; r + 1 < rings.length; r++) {
    for (let k = 0; k < n; k++) {
      const a = r * n + k;
      const b = r * n + ((k + 1) % n);
      const a1 = a + n;
      const b1 = b + n;
      index.push(a, b, b1, a, b1, a1);
    }
  }
  // The faces: the back one looking down, the front one up – laid between
  // the outline's corners; where it runs straight on, flat fans close up to
  // its every point (no triangle-filler keeps points in a straight row).
  const ring = outlines[0];
  const kept = corners(ring, STRAIGHT);
  const flat = kept.map((k) => new THREE.Vector2(...ring[k]));
  const face: [number, number, number][] = [];
  kept.forEach((from, m) => {
    const to = kept[(m + 1) % kept.length];
    for (let k = (from + 1) % n; k !== to; k = (k + 1) % n) {
      face.push([from, k, (k + 1) % n]);
    }
  });
  for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(flat, [])) {
    const turn =
      (flat[b].x - flat[a].x) * (flat[c].y - flat[a].y) -
      (flat[b].y - flat[a].y) * (flat[c].x - flat[a].x);
    face.push(
      turn > 0 ? [kept[a], kept[b], kept[c]] : [kept[a], kept[c], kept[b]]
    );
  }
  const last = (rings.length - 1) * n;
  for (const [a, b, c] of face)
    index.push(a, c, b, last + a, last + b, last + c);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setIndex(index);
  const faceted = geometry.toNonIndexed();
  geometry.dispose();
  faceted.computeVertexNormals();
  return faceted;
};

/** Points on a circle round `center`, from one angle to another – both in. */
const arc = (
  center: Point,
  radius: number,
  from: number,
  to: number,
  steps: number
) =>
  Array.from({ length: steps + 1 }, (_, i): Point => {
    const a = from + ((to - from) * i) / steps;
    return [center[0] + Math.cos(a) * radius, center[1] + Math.sin(a) * radius];
  });

/**
 * The knob's profile – [radius, height over the plate], from under the foot
 * up to the top of the ball – in pieces: along one the surface runs smooth,
 * between two it has an edge. Lines and arcs that touch each other: the cove
 * at the foot, the neck, the cove under the ball, the ball.
 */
const knobProfile = (): Point[][] => {
  const { neck, taper, height, ball, squash, foot, lean, sunk, curve } = KNOB;
  // The neck's line, from the plate up – and the way out of it.
  const wide = neck * taper;
  const length = Math.hypot(neck - wide, height);
  const up: Point = [(neck - wide) / length, height / length];
  const out: Point = [up[1], -up[0]];
  // From a cove's middle to where it touches the neck.
  const touch = Math.atan2(-out[1], -out[0]) + 2 * Math.PI;
  // The foot's cove touches the neck and the plate – a hair under its top,
  // so the two cross rather than graze.
  const low = -0.002;
  const along = (foot * (1 - out[1]) + low) / up[1];
  const footAt: Point = [wide + up[0] * along + out[0] * foot, low + foot];
  // The ball, and the way out of it where its underside leans by `lean` –
  // there the other cove meets it.
  const middle = height + ball * 0.6;
  const tall = ball * squash;
  const under = -Math.atan(squash * Math.tan(lean));
  const meet: Point = [ball * Math.cos(under), middle + tall * Math.sin(under)];
  const steep = Math.hypot(Math.cos(under) / ball, Math.sin(under) / tall);
  const off: Point = [
    Math.cos(under) / ball / steep,
    Math.sin(under) / tall / steep,
  ];
  const radius =
    ((meet[0] - wide) * out[0] + meet[1] * out[1]) /
    (1 - (off[0] * out[0] + off[1] * out[1]));
  const coveAt: Point = [meet[0] + off[0] * radius, meet[1] + off[1] * radius];
  return [
    // Inside the plate: its underside and a short wall.
    [
      [0, -sunk],
      [footAt[0], -sunk],
    ],
    [
      [footAt[0], -sunk],
      [footAt[0], low],
    ],
    [
      ...arc(footAt, foot, 1.5 * Math.PI, touch, curve),
      ...arc(coveAt, radius, touch, Math.atan2(-off[1], -off[0]), curve),
      // The ball from there to its top, on the axis.
      ...Array.from({ length: 2 * curve }, (_, i): Point => {
        const a = under + ((Math.PI / 2 - under) * (i + 1)) / (2 * curve);
        return [
          i + 1 < 2 * curve ? ball * Math.cos(a) : 0,
          middle + tall * Math.sin(a),
        ];
      }),
    ],
  ];
};

/**
 * A closed solid turned round the Z axis from the `pieces` of a profile
 * ([radius, height] – the height towards −Z, a stamp's back; a point on the
 * axis closes it). The pieces share no points, so an edge shows between
 * them.
 */
const turnedSolid = (THREE: typeof Three, pieces: Point[][], steps: number) => {
  const positions: number[] = [];
  const index: number[] = [];
  for (const piece of pieces) {
    // Each point a ring – on the axis, a single point.
    const rings = piece.map(([radius, height]) => {
      const start = positions.length / 3;
      const round = radius > 1e-9;
      for (let j = 0; j < (round ? steps : 1); j++) {
        const a = (j / steps) * Math.PI * 2;
        positions.push(Math.cos(a) * radius, Math.sin(a) * radius, -height);
      }
      return { start, round };
    });
    for (let i = 0; i + 1 < rings.length; i++) {
      const a = rings[i];
      const b = rings[i + 1];
      for (let j = 0; j < steps; j++) {
        const k = (j + 1) % steps;
        const a0 = a.start + (a.round ? j : 0);
        const a1 = a.start + (a.round ? k : 0);
        const b0 = b.start + (b.round ? j : 0);
        const b1 = b.start + (b.round ? k : 0);
        if (a.round) index.push(a0, b0, a1);
        if (b.round) index.push(a1, b0, b1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
};

/**
 * “boop” as single strokes – the watermark. Letters in a box with x-height
 * 0.55 and ascender 1; each is lines and a round bowl.
 */
const ring = (cx: number, cy: number, r: number, from = 0) =>
  Array.from({ length: 33 }, (_, i): [number, number] => {
    const a = from + (i / 32) * Math.PI * 2;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  });

const LETTERS: [number, number][][][] = [
  [
    [
      [0, 1],
      [0, 0.02],
    ],
    ring(0.27, 0.27, 0.26, Math.PI),
  ],
  [ring(0.27, 0.27, 0.26)],
  [ring(0.27, 0.27, 0.26)],
  [
    [
      [0, 0.53],
      [0, -0.42],
    ],
    ring(0.27, 0.27, 0.26, Math.PI),
  ],
];
const ADVANCE = 0.72;

/**
 * Where the watermark fits on a plate: its baseline (`at`, towards the
 * stamp's +Y edge when positive) and its size – none where there is no room.
 */
type Mark = { at: number; size: number } | null;

/** On the code's first shapes, as it always was. */
const MARKS: Record<string, Mark> = {
  circle: { at: 0.31, size: 0.12 },
  square: { at: 0.31, size: 0.12 },
  octagon: { at: 0.3, size: 0.12 },
  triangle: { at: -0.25, size: 0.1 },
  diamond: null,
};

/** The watermark's width, as a share of its size. */
const MARK_WIDTH = (LETTERS.length - 1) * ADVANCE + 0.54;

/** Where the knob's foot spreads onto the plate – nothing goes nearer. */
const footOf = () => {
  const [foot] = knobProfile();
  return foot[1][0];
};

const marks = new Map<string, Mark>();

/**
 * Where the watermark fits on a shape's plate (`plate`, its outline in the
 * model's units): the biggest it can be, between the knob's foot and the
 * plate's edge – above the knob if it can, else below.
 */
const markOf = (shape: ShapeLike, plate: Point[]): Mark => {
  const d = outlineOf(shape);
  const known = DEFAULT_SHAPES.find((own) => own.d === d);
  if (known && known.key in MARKS) return MARKS[known.key];
  const hit = marks.get(d);
  if (hit !== undefined) return hit;
  const distance = distanceTo(plate);
  const foot = footOf() + 0.02;
  let found: Mark = null;
  for (let size = 0.12; size >= 0.06 && !found; size -= 0.005) {
    for (const side of [1, -1]) {
      for (let at = 0.15; at <= 0.48 && !found; at += 0.005) {
        const a = side * at;
        const turn = a > 0 ? -1 : 1;
        const ys = [a + turn * -0.42 * size, a + turn * size];
        let fits = true;
        for (let i = 0; i <= 8 && fits; i++) {
          for (let j = 0; j <= 4 && fits; j++) {
            const x = (-MARK_WIDTH / 2 + (MARK_WIDTH * i) / 8) * size;
            const y = ys[0] + ((ys[1] - ys[0]) * j) / 4;
            if (distance(x, y) > -0.02 || Math.hypot(x, y) < foot) fits = false;
          }
        }
        if (fits) found = { at: a, size };
      }
      if (found) break;
    }
  }
  marks.set(d, found);
  return found;
};

/**
 * The watermark on the plate, drawn into its height map (unit square, y
 * down). The plate is turned to face −Z (the stamp's back), so the lettering
 * is read from outside: at the +Y edge it is laid out turned round – its
 * baseline towards the edge – at the −Y edge upright; either way it rises
 * towards the knob.
 */
const watermarkMap = (mark: Mark) =>
  heightMap((ctx) => {
    if (!mark) return;
    const { at, size } = mark;
    const turn = at > 0 ? -1 : 1;
    const width = MARK_WIDTH;
    ctx.lineWidth = 0.032;
    LETTERS.forEach((letter, n) => {
      for (const points of letter) {
        ctx.beginPath();
        points.forEach(([gx, gy], i) => {
          const x = turn * (n * ADVANCE + gx - width / 2) * size;
          const y = at + turn * gy * size;
          // Local (y up) to the map's unit square (y down).
          if (i) ctx.lineTo(x + 0.5, 0.5 - y);
          else ctx.moveTo(x + 0.5, 0.5 - y);
        });
        ctx.stroke();
      }
    });
  });

/**
 * The plate's outline: the stamp's, smaller round its middle – or, where
 * that would reach over the back's edge (a shape that bends round, a long
 * thin one), the back's own drawn in.
 */
const plateOf = (shape: ShapeLike): Point[] => {
  const scaled = localOutline(shape, RUBBER.grow, PLATE.size);
  const distance = outlineDistance(shape);
  const fits = scaled.every(
    ([x, y]) => distance(0.5 + x, 0.5 - y) < RUBBER.grow - BLOCK.bevel - 0.01
  );
  return fits ? scaled : localOutline(shape, RUBBER.grow - PLATE.inset);
};

/** The block's solid: its bevel grows to the rubber's outline. */
const BLOCK_SOLID: Solid = {
  base: RUBBER.grow - BLOCK.bevel,
  bevel: BLOCK.bevel,
  depth: BLOCK.depth,
};

/**
 * What all stamps of a shape share, worked out with the first one: its
 * outlines grown and shrunk (outline.ts – a while each), how far points
 * are from them, where “boop” goes on the plate. A part at a time; the
 * next stamp finds them done, and there is nothing left to wait for.
 */
function* shapeParts(shape: ShapeLike): Generator<undefined, void, undefined> {
  const count = pointsOf(shape);
  outlinePoints(shape, -FACE.rim / 2, count);
  yield;
  outlinePoints(shape, 0, count);
  yield;
  distanceTo(localOutline(shape, RUBBER.grow));
  yield;
  for (const { grow } of blockRings(BLOCK_SOLID)) {
    localOutline(shape, grow);
    yield;
  }
  const plate = plateOf(shape);
  distanceTo(plate);
  yield;
  markOf(shape, plate);
  yield;
}

/** The plate's material – one for a stamp, and one to compile ahead. */
const plateMaterial = (THREE: typeof Three, color: Rgb) =>
  toonMaterial(THREE, "plate", color, { GROOVE: PLATE.groove });

/**
 * The stamp, built a part at a time: between two (the face's map, the
 * rubber, the block, the plate …) it `yield`s – a moment the page may have,
 * so that building a stamp is no long hold-up (render.ts takes them). Each
 * part takes some milliseconds, the whole stamp some tens. `buildSticker`
 * builds it in one go.
 */
export function* stickerParts(
  THREE: typeof Three,
  input: StickerInput,
  { mirror = false } = {}
): Generator<undefined, Three.Group, undefined> {
  yield* shapeParts(input.shape);
  const stamp = new THREE.Group();
  const hex = hexOf(input.color);

  // Flat cartoon colors: the block a light tint – a dark color takes more
  // white, or its block turns out gloomy – the knob the full color.
  const dark = new THREE.Color(hex).getHSL({ h: 0, s: 0, l: 0 }).l < 0.25;
  const light = tint(hex, dark ? BLOCK_TINT.dark : BLOCK_TINT.light);
  const blockMaterial = toonMaterial(THREE, "block", light);
  const knob = rgb(hex);
  const rubberMaterial = toonMaterial(THREE, "rubber", knob);

  // The rubber: rim and doodle raised to z = 0, the ground below.
  const face = faceMap(input, mirror);
  yield;
  const rubber = new THREE.Mesh(
    shapedSlab(THREE, {
      outline: localOutline(input.shape, RUBBER.grow),
      thickness: RUBBER.thickness,
      surface: (x, y) => {
        const relief = face.relief(x, y);
        return {
          z: RUBBER.relief * (relief - 1),
          relief,
          core: face.core(x, y),
        };
      },
    }),
    rubberMaterial
  );
  rubber.name = "rubber";
  stamp.add(rubber);
  yield;

  // The block behind it.
  const blockFront = -RUBBER.thickness + 0.005;
  const block = new THREE.Mesh(
    blockSolid(THREE, input.shape, BLOCK_SOLID),
    blockMaterial
  );
  block.position.z = blockFront - BLOCK.depth - BLOCK.bevel;
  stamp.add(block);
  const back = blockFront - BLOCK.depth - 2 * BLOCK.bevel;
  yield;

  // The plate on the back with “boop” pressed in – turned to face −Z.
  const plateOutline = plateOf(input.shape);
  const watermark = watermarkMap(markOf(input.shape, plateOutline));
  yield;
  const plate = new THREE.Mesh(
    shapedSlab(THREE, {
      outline: plateOutline,
      thickness: PLATE.thickness + 0.01,
      surface: (x, y) => ({ z: -PLATE.groove * watermark(x, y), relief: 0 }),
    }),
    plateMaterial(THREE, light)
  );
  plate.rotation.y = Math.PI;
  plate.position.z = back - PLATE.thickness;
  stamp.add(plate);
  const top = back - PLATE.thickness;
  yield;

  // The knob: neck and ball in one piece, standing on the plate – in the
  // stamp's color, plain: a finish is the ink's, on the rubber only.
  const handle = new THREE.Mesh(
    turnedSolid(THREE, knobProfile(), KNOB.steps),
    toonMaterial(THREE, "knob", knob)
  );
  handle.position.z = top;
  stamp.add(handle);

  const holder = new THREE.Group();
  holder.add(stamp);
  // From the face to the middle of the whole stamp.
  holder.userData.half = -(top - KNOB.height - KNOB.ball * 1.4) / 2;
  pivot(holder, 1);
  paintSticker(holder, input.color, input.finish);
  return holder;
}

/** The stamp in 3D, built in one go (`stickerParts`). */
export const buildSticker = (
  THREE: typeof Three,
  input: StickerInput,
  options: { mirror?: boolean } = {}
) => {
  const parts = stickerParts(THREE, input, options);
  for (;;) {
    const part = parts.next();
    if (part.done) return part.value;
  }
};

/**
 * A stand-in with every material a stamp is drawn with, each on a speck –
 * no stamp to build, nothing to see: for compiling their programs ahead
 * (ink.ts `warm`), before a real stamp needs them.
 */
export const sampleSticker = (THREE: typeof Three) => {
  const stamp = new THREE.Group();
  const speck = new THREE.BufferGeometry();
  speck.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0], 3)
  );
  const white: Rgb = [1, 1, 1];
  for (const material of [
    toonMaterial(THREE, "rubber", white),
    toonMaterial(THREE, "block", white),
    plateMaterial(THREE, white),
    toonMaterial(THREE, "knob", white),
  ]) {
    stamp.add(new THREE.Mesh(speck, material));
  }
  const holder = new THREE.Group();
  holder.add(stamp);
  return holder;
};

/**
 * What the stamp turns around: 1 – the middle of the whole stamp (the
 * default), 0 – the middle of its face (z = 0 of the holder is then the
 * face's raised surface), or anything between.
 */
export const pivot = (sticker: Three.Object3D, amount: number) => {
  const stamp = sticker.children[0];
  if (stamp) stamp.position.z = (sticker.userData.half ?? 0) * amount;
};

/**
 * Inks the rubber: rim and doodle in the ink, the ground a pale tint of it –
 * exactly the drawing's (stamp-svg.tsx) – a special ink in its finish, on
 * the rim and doodle only. Quick – only a few values change.
 */
export const paintSticker = (
  sticker: Three.Object3D,
  ink: ColorName,
  finish = finishOf(ink)
) => {
  const rubber = sticker.getObjectByName("rubber") as Three.Mesh | undefined;
  if (!rubber) return;
  const hex = hexOf(ink);
  const material = rubber.material as Three.Material;
  inkRubber(material, rgb(hex), tint(hex, GROUND));
  setFinish(material, finish);
};

/** Frees what the stamp's meshes hold on the GPU. */
export const disposeSticker = (object: Three.Object3D) => {
  object.traverse((child) => {
    const mesh = child as Three.Mesh;
    mesh.geometry?.dispose();
    const material = mesh.material as
      | Three.Material
      | Three.Material[]
      | undefined;
    for (const m of Array.isArray(material)
      ? material
      : material
        ? [material]
        : []) {
      m.dispose();
    }
  });
};

/**
 * The scene and camera all views share – no lights: the colors are flat,
 * their touch of shade comes from the materials (ink.ts).
 */
export const stage = (THREE: typeof Three) => {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  camera.position.set(0, 0, 3);
  return { scene, camera };
};
