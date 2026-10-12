import type * as Three from "three";
import {
  COLORS,
  type ColorName,
  type StampShape,
} from "@/features/calendar/model";

/**
 * A stamp in 3D – a real rubber stamp: a block in the stamp's shape (a soft
 * tint of its color), a knob to hold it by (the full color), and underneath
 * the rubber with the doodle pressed into it – engraved, not stuck on. A
 * small plate on top carries “boop”, engraved the same way. One unit wide.
 *
 * Built lying on its back: the rubber face looks along +Z, the knob points
 * to −Z. `pose()` turns it for a picture. Every part is a closed solid, so
 * the same model goes to a 3D printer (export-stl.ts). `three` is passed in –
 * it loads only when a stamp is shown.
 */

export type StickerInput = {
  shape: StampShape;
  color: ColorName;
  drawing: {
    readonly strokes: readonly {
      readonly w: number;
      readonly p: readonly number[];
    }[];
  } | null;
};

const RUBBER = { size: 0.94, thickness: 0.07, groove: 0.04, color: "#c9c2e3" };
const BLOCK = { depth: 0.16, bevel: 0.04, scale: 1.04 };
const KNOB = { neck: 0.11, height: 0.24, ball: 0.2 };
const PLATE = { size: 0.78, thickness: 0.02, groove: 0.012 };
/** The doodle keeps a little distance from the rubber's edge. */
const INSET = 0.86;
/** Resolution of the engraved surfaces: rings × steps around. */
const RINGS = 110;
const STEPS = 240;
/** Resolution of the height maps the engravings are read from. */
const MAP = 384;

const outline = (THREE: typeof Three, shape: StampShape, size: number) => {
  const s = new THREE.Shape();
  const h = size / 2;
  if (shape === "circle") {
    s.absarc(0, 0, h, 0, Math.PI * 2, false);
    return s;
  }
  const r = size * 0.14;
  s.moveTo(-h + r, -h);
  s.lineTo(h - r, -h);
  s.quadraticCurveTo(h, -h, h, -h + r);
  s.lineTo(h, h - r);
  s.quadraticCurveTo(h, h, h - r, h);
  s.lineTo(-h + r, h);
  s.quadraticCurveTo(-h, h, -h, h - r);
  s.lineTo(-h, -h + r);
  s.quadraticCurveTo(-h, -h, -h + r, -h);
  return s;
};

/** How far the outline reaches in a direction – circle or rounded square. */
const reach = (shape: StampShape, size: number, angle: number) => {
  const h = size / 2;
  if (shape === "circle") return h;
  const c = Math.abs(Math.cos(angle));
  const s = Math.abs(Math.sin(angle));
  const rc = size * 0.14;
  let t = h / Math.max(c, s);
  // In a corner: on the rounding's circle instead.
  if (t * c > h - rc && t * s > h - rc) {
    const k = h - rc;
    const b = c * k + s * k;
    t = b + Math.sqrt(Math.max(0, b * b - (2 * k * k - rc * rc)));
  }
  return t;
};

/** The color mixed with white – the block's soft tint. */
const tint = (THREE: typeof Three, hex: string, amount: number) =>
  new THREE.Color(hex).lerp(new THREE.Color("#ffffff"), amount);

/** A drawn point (0–1, y down) on the rubber (centered, y up, kept inside). */
const place = (shape: StampShape, x: number, y: number): [number, number] => {
  let px = (x - 0.5) * INSET;
  let py = (0.5 - y) * INSET;
  const limit = 0.5 * INSET;
  if (shape === "circle") {
    const d = Math.hypot(px, py);
    if (d > limit) {
      px *= limit / d;
      py *= limit / d;
    }
  } else {
    px = Math.max(-limit, Math.min(limit, px));
    py = Math.max(-limit, Math.min(limit, py));
  }
  return [px, py];
};

type Line = { width: number; points: [number, number][] };

/**
 * Lines (in local units, −0.5…0.5) drawn into a height map: 1 where the
 * engraving is deepest, soft at its edges. Read back with `depthAt`.
 */
const heightMap = (lines: Line[]) => {
  const canvas = document.createElement("canvas");
  canvas.width = MAP;
  canvas.height = MAP;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return () => 0;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, MAP, MAP);
  ctx.filter = `blur(${MAP / 260}px)`;
  ctx.strokeStyle = "#fff";
  ctx.fillStyle = "#fff";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const px = ([x, y]: [number, number]) =>
    [(x + 0.5) * MAP, (0.5 - y) * MAP] as const;
  for (const line of lines) {
    ctx.lineWidth = line.width * MAP;
    const [first, ...rest] = line.points.map(px);
    if (!first) continue;
    ctx.beginPath();
    if (!rest.length) {
      ctx.arc(first[0], first[1], ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.moveTo(first[0], first[1]);
    for (const p of rest) ctx.lineTo(p[0], p[1]);
    ctx.stroke();
  }
  const data = ctx.getImageData(0, 0, MAP, MAP).data;
  const at = (x: number, y: number) =>
    data[
      (Math.min(MAP - 1, Math.max(0, y)) * MAP +
        Math.min(MAP - 1, Math.max(0, x))) *
        4
    ] / 255;
  // Bilinear, so the grooves' walls run smooth.
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

/**
 * A closed slab in the stamp's shape whose top (z = 0, facing +Z) is
 * engraved where `depthAt` says, with a softly rounded rim; flat below at
 * z = −thickness. Rings around the middle, so the outline stays exact.
 */
const engravedSlab = (
  THREE: typeof Three,
  {
    shape,
    size,
    thickness,
    groove,
    depthAt,
  }: {
    shape: StampShape;
    size: number;
    thickness: number;
    groove: number;
    depthAt: (x: number, y: number) => number;
  }
) => {
  const positions: number[] = [];
  const index: number[] = [];
  const edge = Math.min(0.012, thickness * 0.3);
  const top = (x: number, y: number, f: number) => {
    // The rim rounds off over the outer few percent.
    const t = Math.max(0, (f - 0.94) / 0.06);
    return -groove * depthAt(x, y) - edge * t * t;
  };
  // Top: the middle, then rings outwards.
  positions.push(0, 0, top(0, 0, 0));
  for (let i = 1; i <= RINGS; i++) {
    const f = i / RINGS;
    for (let j = 0; j < STEPS; j++) {
      const a = (j / STEPS) * Math.PI * 2;
      const r = f * reach(shape, size, a);
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      positions.push(x, y, top(x, y, f));
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
  // Side: the outer ring down to the bottom.
  const rim = ringStart(RINGS);
  const low = positions.length / 3;
  for (let j = 0; j < STEPS; j++) {
    const v = (rim + j) * 3;
    positions.push(positions[v], positions[v + 1], -thickness);
  }
  for (let j = 0; j < STEPS; j++) {
    const k = (j + 1) % STEPS;
    index.push(rim + j, low + j, low + k, rim + j, low + k, rim + k);
  }
  // Bottom: a flat fan, facing down.
  const center = positions.length / 3;
  positions.push(0, 0, -thickness);
  for (let j = 0; j < STEPS; j++) {
    index.push(center, low + ((j + 1) % STEPS), low + j);
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
 * The watermark's lines on the plate. The plate is turned to face −Z (the
 * stamp's back), so the lettering is laid out turned round: read from
 * outside, its baseline lies towards the stamp's +Y edge and it rises
 * towards the knob.
 */
const watermark = (): Line[] => {
  const size = 0.12;
  const width = (LETTERS.length - 1) * ADVANCE + 0.54;
  return LETTERS.flatMap((letter, n) =>
    letter.map((points) => ({
      width: 0.032,
      points: points.map(([gx, gy]): [number, number] => [
        -(n * ADVANCE + gx - width / 2) * size,
        0.31 - gy * size,
      ]),
    }))
  );
};

export const buildSticker = (
  THREE: typeof Three,
  input: StickerInput,
  { mirror = false } = {}
) => {
  const stamp = new THREE.Group();
  const hex = COLORS[input.color];

  const blockMaterial = new THREE.MeshPhysicalMaterial({
    color: tint(THREE, hex, input.color === "ink" ? 0.55 : 0.45),
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
    color: RUBBER.color,
    roughness: 0.85,
  });

  // The rubber: its face at z = 0, the doodle pressed in. A real stamp's
  // engraving is mirrored – its print reads the right way (for printing).
  const lines: Line[] = (input.drawing?.strokes ?? []).map((stroke) => {
    const points: [number, number][] = [];
    for (let i = 0; i + 1 < stroke.p.length; i += 2) {
      points.push(
        place(
          input.shape,
          mirror ? 1 - stroke.p[i] : stroke.p[i],
          stroke.p[i + 1]
        )
      );
    }
    return { width: stroke.w * INSET, points };
  });
  const rubber = new THREE.Mesh(
    engravedSlab(THREE, {
      shape: input.shape,
      size: RUBBER.size,
      thickness: RUBBER.thickness,
      groove: RUBBER.groove,
      depthAt: heightMap(lines),
    }),
    rubberMaterial
  );
  stamp.add(rubber);

  // The block behind it.
  const blockFront = -RUBBER.thickness + 0.005;
  const block = new THREE.Mesh(
    new THREE.ExtrudeGeometry(outline(THREE, input.shape, BLOCK.scale), {
      depth: BLOCK.depth,
      bevelEnabled: true,
      bevelThickness: BLOCK.bevel,
      bevelSize: BLOCK.bevel,
      bevelSegments: 5,
      curveSegments: 72,
    }),
    blockMaterial
  );
  block.position.z = blockFront - BLOCK.depth - BLOCK.bevel;
  stamp.add(block);
  const back = blockFront - BLOCK.depth - 2 * BLOCK.bevel;

  // The plate on the back with “boop” pressed in – turned to face −Z.
  const plate = new THREE.Mesh(
    engravedSlab(THREE, {
      shape: input.shape,
      size: PLATE.size,
      thickness: PLATE.thickness + 0.01,
      groove: PLATE.groove,
      depthAt: heightMap(watermark()),
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

  // Turning around the middle of the whole stamp.
  const middle = (top - KNOB.height - KNOB.ball * 1.4) / 2;
  stamp.position.z = -middle;
  const holder = new THREE.Group();
  holder.add(stamp);
  return holder;
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
