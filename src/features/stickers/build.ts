import type * as Three from "three";
// Relative, not `@/…`: the unit tests import this without the app's aliases.
import {
  type ColorName,
  FACE,
  type RimPattern,
  type StampShape,
} from "../calendar/model";
import { outlinePoints, rimLine } from "../calendar/outline";
import { finishOf, hexOf } from "../calendar/palette";
import { inkRubber, rgb, setFinish, tint, toonMaterial } from "./ink";

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
  shape: StampShape;
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
const PLATE = { size: 0.78, thickness: 0.02, groove: 0.012 };
/** How much white the block's tint takes – a dark color more. */
const BLOCK_TINT = { light: 0.45, dark: 0.68 };
/** The rubber's ground: the ink with this much white – the drawing's. */
const GROUND = 0.86;
/** Resolution of the shaped surfaces: rings × steps around. */
const RINGS = 150;
const STEPS = 420;
/** Points of the outlines in 3D. */
const OUTLINE = 360;
/** Resolution of the height maps the surfaces are read from. */
const MAP = 512;
/** How far (map px) the face's `core` blurs: about half a line's width. */
const CORE = 6;

type Point = [number, number];

/**
 * The shape's outline (outline.ts) in the model's units: centered, y up,
 * `scale`d about the middle.
 */
const localOutline = (shape: StampShape, grow: number, scale = 1) =>
  outlinePoints(shape, grow, OUTLINE).map(
    ([x, y]): Point => [(x - 0.5) * scale, (0.5 - y) * scale]
  );

const outline = (THREE: typeof Three, points: Point[]) =>
  new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));

/** How far a convex outline reaches from the middle, towards `angle`. */
const reach = (points: Point[], angle: number) => {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let best = 0;
  for (let i = 0; i < points.length; i++) {
    const [px, py] = points[i];
    const [qx, qy] = points[(i + 1) % points.length];
    const ex = qx - px;
    const ey = qy - py;
    const det = dx * -ey + dy * ex;
    if (Math.abs(det) < 1e-12) continue;
    // middle + t·d = p + s·e
    const t = (px * -ey + py * ex) / det;
    const s = (dx * py - dy * px) / det;
    if (t > 0 && s >= -1e-9 && s <= 1 + 1e-9) best = Math.max(best, t);
  }
  return best;
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
  shape: StampShape,
  grow: number
) => {
  ctx.beginPath();
  outlinePoints(shape, grow, OUTLINE).forEach(([x, y], i) => {
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
 * A closed slab in a convex `outline` whose top (facing +Z) lies at
 * `surface(x, y)` (≤ 0), with a softly rounded edge; flat below at
 * z = −thickness. Rings around the middle, so the outline stays exact. Each
 * vertex keeps its `relief` (0–1) – what gets inked – and its `core`.
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
  const positions: number[] = [];
  const relief: number[] = [];
  const core: number[] = [];
  const index: number[] = [];
  const edge = Math.min(0.008, thickness * 0.3);
  const top = (x: number, y: number, f: number) => {
    // The edge rounds off over the outer few percent.
    const t = Math.max(0, (f - 0.97) / 0.03);
    const at = surface(x, y);
    positions.push(x, y, at.z - edge * t * t);
    relief.push(at.relief);
    core.push(at.core ?? 0);
  };
  // Top: the middle, then rings outwards.
  const reaches = Array.from({ length: STEPS }, (_, j) =>
    reach(outline, (j / STEPS) * Math.PI * 2)
  );
  top(0, 0, 0);
  for (let i = 1; i <= RINGS; i++) {
    const f = i / RINGS;
    for (let j = 0; j < STEPS; j++) {
      const a = (j / STEPS) * Math.PI * 2;
      const r = f * reaches[j];
      top(Math.cos(a) * r, Math.sin(a) * r, f);
    }
  }
  const ringStart = (i: number) => 1 + (i - 1) * STEPS;
  for (let j = 0; j < STEPS; j++) {
    index.push(0, ringStart(1) + j, ringStart(1) + ((j + 1) % STEPS));
  }
  for (let i = 1; i < RINGS; i++) {
    const a = ringStart(i);
    const b = ringStart(i + 1);
    for (let j = 0; j < STEPS; j++) {
      const k = (j + 1) % STEPS;
      index.push(a + j, b + j, b + k, a + j, b + k, a + k);
    }
  }
  // Side: the outer ring down to the bottom – inked as far as the rim is.
  const rim = ringStart(RINGS);
  const low = positions.length / 3;
  for (let j = 0; j < STEPS; j++) {
    const v = (rim + j) * 3;
    positions.push(positions[v], positions[v + 1], -thickness);
    relief.push(relief[rim + j]);
    core.push(core[rim + j]);
  }
  for (let j = 0; j < STEPS; j++) {
    const k = (j + 1) % STEPS;
    index.push(rim + j, low + j, low + k, rim + j, low + k, rim + k);
  }
  // Bottom: a flat fan, facing down.
  const center = positions.length / 3;
  positions.push(0, 0, -thickness);
  relief.push(0);
  core.push(0);
  for (let j = 0; j < STEPS; j++) {
    index.push(center, low + ((j + 1) % STEPS), low + j);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setAttribute("relief", new THREE.Float32BufferAttribute(relief, 1));
  geometry.setAttribute("core", new THREE.Float32BufferAttribute(core, 1));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
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
 * Where the watermark fits on a shape's plate: its baseline (`at`, towards
 * the stamp's +Y edge when positive) and its size. No room on the diamond.
 */
const MARK: Record<StampShape, { at: number; size: number } | null> = {
  circle: { at: 0.31, size: 0.12 },
  square: { at: 0.31, size: 0.12 },
  octagon: { at: 0.3, size: 0.12 },
  triangle: { at: -0.25, size: 0.1 },
  diamond: null,
};

/**
 * The watermark on the plate, drawn into its height map (unit square, y
 * down). The plate is turned to face −Z (the stamp's back), so the lettering
 * is read from outside: at the +Y edge it is laid out turned round – its
 * baseline towards the edge – at the −Y edge upright; either way it rises
 * towards the knob.
 */
const watermarkMap = (shape: StampShape) =>
  heightMap((ctx) => {
    const mark = MARK[shape];
    if (!mark) return;
    const { at, size } = mark;
    const turn = at > 0 ? -1 : 1;
    const width = (LETTERS.length - 1) * ADVANCE + 0.54;
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

export const buildSticker = (
  THREE: typeof Three,
  input: StickerInput,
  { mirror = false } = {}
) => {
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

  // The block behind it – its bevel grows to the rubber's outline.
  const blockFront = -RUBBER.thickness + 0.005;
  const block = new THREE.Mesh(
    new THREE.ExtrudeGeometry(
      outline(THREE, localOutline(input.shape, RUBBER.grow - BLOCK.bevel)),
      {
        depth: BLOCK.depth,
        bevelEnabled: true,
        bevelThickness: BLOCK.bevel,
        bevelSize: BLOCK.bevel,
        bevelSegments: 5,
      }
    ),
    blockMaterial
  );
  block.position.z = blockFront - BLOCK.depth - BLOCK.bevel;
  stamp.add(block);
  const back = blockFront - BLOCK.depth - 2 * BLOCK.bevel;

  // The plate on the back with “boop” pressed in – turned to face −Z.
  const watermark = watermarkMap(input.shape);
  const plate = new THREE.Mesh(
    shapedSlab(THREE, {
      outline: localOutline(input.shape, RUBBER.grow, PLATE.size),
      thickness: PLATE.thickness + 0.01,
      surface: (x, y) => ({ z: -PLATE.groove * watermark(x, y), relief: 0 }),
    }),
    toonMaterial(THREE, "plate", light, { GROOVE: PLATE.groove })
  );
  plate.rotation.y = Math.PI;
  plate.position.z = back - PLATE.thickness;
  stamp.add(plate);
  const top = back - PLATE.thickness;

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
  paintSticker(holder, input.color);
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
export const paintSticker = (sticker: Three.Object3D, ink: ColorName) => {
  const rubber = sticker.getObjectByName("rubber") as Three.Mesh | undefined;
  if (!rubber) return;
  const hex = hexOf(ink);
  const material = rubber.material as Three.Material;
  inkRubber(material, rgb(hex), tint(hex, GROUND));
  setFinish(material, finishOf(ink));
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
