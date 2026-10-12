import type * as Three from "three";
import {
  type ColorName,
  FACE,
  type StampShape,
} from "@/features/calendar/model";
import { outlinePoints } from "@/features/calendar/outline";
import { hexOf } from "@/features/calendar/palette";

/**
 * A stamp in 3D – a real rubber stamp: a block in the stamp's shape (a soft
 * tint of its color), a knob to hold it by (the full color), and underneath
 * the rubber with the rim and the doodle standing out of it – inked, so the
 * face looks just like the drawing (FACE: the same outline, rim and lines).
 * A small plate on top carries “boop”, engraved. One unit wide.
 *
 * Built lying on its back: the rubber face looks along +Z, its raised parts
 * at z = 0, the knob points to −Z. `pose()` turns it for a picture, `pivot()`
 * sets what it turns around, `paintSticker()` dips it into another ink.
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
  } | null;
};

/** The rubber: out to the rim's outer edge, its relief this high. */
const RUBBER = { grow: FACE.rim / 2, thickness: 0.08, relief: 0.035 };
/** The block is flush with the rubber – face-on, only the face shows. */
const BLOCK = { depth: 0.16, bevel: 0.04 };
const KNOB = { neck: 0.11, height: 0.24, ball: 0.2 };
const PLATE = { size: 0.78, thickness: 0.02, groove: 0.012 };
/** Resolution of the shaped surfaces: rings × steps around. */
const RINGS = 150;
const STEPS = 420;
/** Points of the outlines in 3D. */
const OUTLINE = 360;
/** Resolution of the height maps the surfaces are read from. */
const MAP = 512;

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

/** The color mixed with white – a soft tint. */
const tint = (THREE: typeof Three, hex: string, amount: number) =>
  new THREE.Color(hex).lerp(new THREE.Color("#ffffff"), amount);

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
 * A height map drawn on a canvas in the unit square (0–1, y down, like the
 * drawing): white is 1. Read back in local units (−0.5…0.5, y up).
 */
const heightMap = (draw: (ctx: CanvasRenderingContext2D) => void) => {
  const canvas = document.createElement("canvas");
  canvas.width = MAP;
  canvas.height = MAP;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return () => 0;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, MAP, MAP);
  ctx.scale(MAP, MAP);
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#fff";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  draw(ctx);
  const pixels = ctx.getImageData(0, 0, MAP, MAP).data;
  const data = new Float32Array(MAP * MAP);
  for (let i = 0; i < data.length; i++) data[i] = pixels[i * 4] / 255;
  soften(data);
  const at = (x: number, y: number) =>
    data[
      Math.min(MAP - 1, Math.max(0, y)) * MAP +
        Math.min(MAP - 1, Math.max(0, x))
    ];
  // Bilinear, so the walls run smooth.
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
 * rim along the outline and the doodle – the same smoothing – clipped to
 * it. An inverted stamp is the other way round: the whole face stands, the
 * doodle is cut into it. Mirrored for printing: a real stamp's face reads
 * the other way round.
 */
const faceMap = (input: StickerInput, mirror: boolean) =>
  heightMap((ctx) => {
    if (mirror) {
      ctx.translate(1, 0);
      ctx.scale(-1, 1);
    }
    const inverted = Boolean(input.drawing?.inverted);
    // The rim: everything outside its inner edge – or all of it.
    ctx.fillRect(0, 0, 1, 1);
    if (!inverted) {
      ctx.fillStyle = "#000";
      tracePath(ctx, input.shape, -FACE.rim / 2);
      ctx.fill();
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

/**
 * A closed slab in a convex `outline` whose top (facing +Z) lies at
 * `surface(x, y)` (≤ 0), with a softly rounded edge; flat below at
 * z = −thickness. Rings around the middle, so the outline stays exact. Each
 * vertex keeps its `relief` (0–1) – what gets inked.
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
    /** Height of the top at a point – and how raised it is there (0–1). */
    surface: (x: number, y: number) => { z: number; relief: number };
  }
) => {
  const positions: number[] = [];
  const relief: number[] = [];
  const index: number[] = [];
  const edge = Math.min(0.008, thickness * 0.3);
  const top = (x: number, y: number, f: number) => {
    // The edge rounds off over the outer few percent.
    const t = Math.max(0, (f - 0.97) / 0.03);
    const at = surface(x, y);
    positions.push(x, y, at.z - edge * t * t);
    relief.push(at.relief);
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
  }
  for (let j = 0; j < STEPS; j++) {
    const k = (j + 1) % STEPS;
    index.push(rim + j, low + j, low + k, rim + j, low + k, rim + k);
  }
  // Bottom: a flat fan, facing down.
  const center = positions.length / 3;
  positions.push(0, 0, -thickness);
  relief.push(0);
  for (let j = 0; j < STEPS; j++) {
    index.push(center, low + ((j + 1) % STEPS), low + j);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setAttribute("relief", new THREE.Float32BufferAttribute(relief, 1));
  geometry.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(new Float32Array(relief.length * 3), 3)
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

  // A dark color takes more white, or its block turns out gloomy.
  const dark = new THREE.Color(hex).getHSL({ h: 0, s: 0, l: 0 }).l < 0.25;
  const blockMaterial = new THREE.MeshPhysicalMaterial({
    color: tint(THREE, hex, dark ? 0.55 : 0.45),
    roughness: 0.45,
    clearcoat: 0.8,
    clearcoatRoughness: 0.3,
  });
  const knobMaterial = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(hex),
    roughness: 0.3,
    clearcoat: 1,
    clearcoatRoughness: 0.15,
  });
  const rubberMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.7,
  });

  // The rubber: rim and doodle raised to z = 0, the ground below.
  const face = faceMap(input, mirror);
  const rubber = new THREE.Mesh(
    shapedSlab(THREE, {
      outline: localOutline(input.shape, RUBBER.grow),
      thickness: RUBBER.thickness,
      surface: (x, y) => {
        const relief = face(x, y);
        return { z: RUBBER.relief * (relief - 1), relief };
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
    blockMaterial
  );
  plate.rotation.y = Math.PI;
  plate.position.z = back - PLATE.thickness;
  stamp.add(plate);
  const top = back - PLATE.thickness;

  // The knob: a neck and a ball.
  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(KNOB.neck, KNOB.neck * 1.35, KNOB.height, 40),
    knobMaterial
  );
  neck.rotation.x = Math.PI / 2;
  neck.position.z = top - KNOB.height / 2 + 0.01;
  stamp.add(neck);
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(KNOB.ball, 40, 28),
    knobMaterial
  );
  ball.scale.z = 0.85;
  ball.position.z = top - KNOB.height - KNOB.ball * 0.6;
  stamp.add(ball);

  const holder = new THREE.Group();
  holder.add(stamp);
  // From the face to the middle of the whole stamp.
  holder.userData.half = -(top - KNOB.height - KNOB.ball * 1.4) / 2;
  pivot(holder, 1);
  paintSticker(THREE, holder, input.color);
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
 * like the drawing (stamp-svg.tsx). Quick – only the colors change.
 */
export const paintSticker = (
  THREE: typeof Three,
  sticker: Three.Object3D,
  ink: ColorName
) => {
  const rubber = sticker.getObjectByName("rubber") as Three.Mesh | undefined;
  if (!rubber) return;
  const relief = rubber.geometry.getAttribute("relief");
  const color = rubber.geometry.getAttribute("color") as Three.BufferAttribute;
  const full = new THREE.Color(hexOf(ink));
  const ground = tint(THREE, hexOf(ink), 0.84);
  const mixed = new THREE.Color();
  for (let i = 0; i < relief.count; i++) {
    const r = relief.getX(i);
    // Sharp, like ink on the raised parts only.
    const t = Math.min(1, Math.max(0, (r - 0.3) / 0.4));
    mixed.copy(ground).lerp(full, t * t * (3 - 2 * t));
    color.setXYZ(i, mixed.r, mixed.g, mixed.b);
  }
  color.needsUpdate = true;
};

/**
 * How a stamp is shown: `face` – lying on its back, the rubber with the
 * doodle towards you, the knob peeking out behind; `press` – upright, knob
 * up, seen from a little above – as it comes down on a day.
 */
export const pose = (
  sticker: Three.Object3D,
  kind: "face" | "press",
  amount = 1
) => {
  if (kind === "face") {
    sticker.rotation.set(0.62 * amount, 0.42 * amount, -0.08 * amount);
  } else {
    sticker.rotation.set(Math.PI / 2 + 0.42, 0.5, 0);
  }
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

/** Light and room reflections that make the gloss – shared by all views. */
export const stage = async (
  THREE: typeof Three,
  renderer: Three.WebGLRenderer
) => {
  const { RoomEnvironment } = await import(
    "three/examples/jsm/environments/RoomEnvironment.js"
  );
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;
  scene.add(new THREE.HemisphereLight("#ffffff", "#d9d0ff", 1.3));
  const key = new THREE.DirectionalLight("#ffffff", 2.4);
  key.position.set(-1.5, 2, 3);
  scene.add(key);
  const rim = new THREE.DirectionalLight("#ffd6ec", 0.9);
  rim.position.set(2, -1.2, 1);
  scene.add(rim);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  camera.position.set(0, 0, 3);
  return { scene, camera };
};
