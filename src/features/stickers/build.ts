import type * as Three from "three";
import {
  COLORS,
  type ColorName,
  type StampShape,
} from "@/features/calendar/model";

/**
 * A stamp as a 3D sticker: a white die-cut rim, the body in the stamp's
 * shape (a soft tint of its color), and the doodle on top as raised relief
 * in the full color – glossy, like a puffy sticker. One unit wide, lying in
 * the XY plane, facing +Z.
 *
 * `three` is passed in – it is loaded only when a sticker is shown.
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

const RIM = { depth: 0.035, bevel: 0.02, scale: 1.1 };
const BODY = { depth: 0.06, bevel: 0.035 };
/** The doodle keeps a little distance from the body's edge. */
const INSET = 0.86;

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

/** The color mixed with white – the body's soft tint. */
const tint = (THREE: typeof Three, hex: string, amount: number) =>
  new THREE.Color(hex).lerp(new THREE.Color("#ffffff"), amount);

/** A drawn point (0–1, y down) on the body (centered, y up, kept inside). */
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

export const buildSticker = (THREE: typeof Three, input: StickerInput) => {
  const group = new THREE.Group();
  const hex = COLORS[input.color];

  const rimMaterial = new THREE.MeshPhysicalMaterial({
    color: "#ffffff",
    roughness: 0.55,
    clearcoat: 0.4,
  });
  const bodyMaterial = new THREE.MeshPhysicalMaterial({
    color: tint(THREE, hex, input.color === "ink" ? 0.78 : 0.62),
    roughness: 0.4,
    clearcoat: 1,
    clearcoatRoughness: 0.25,
  });
  const reliefMaterial = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(hex),
    roughness: 0.3,
    clearcoat: 1,
    clearcoatRoughness: 0.15,
  });

  const rim = new THREE.Mesh(
    new THREE.ExtrudeGeometry(outline(THREE, input.shape, RIM.scale), {
      depth: RIM.depth,
      bevelEnabled: true,
      bevelThickness: RIM.bevel,
      bevelSize: RIM.bevel,
      bevelSegments: 4,
      curveSegments: 72,
    }),
    rimMaterial
  );
  group.add(rim);

  const bodyZ = RIM.depth + RIM.bevel + BODY.bevel;
  const body = new THREE.Mesh(
    new THREE.ExtrudeGeometry(outline(THREE, input.shape, 1), {
      depth: BODY.depth,
      bevelEnabled: true,
      bevelThickness: BODY.bevel,
      bevelSize: BODY.bevel,
      bevelSegments: 6,
      curveSegments: 72,
    }),
    bodyMaterial
  );
  body.position.z = bodyZ;
  group.add(body);

  // The relief: a tube along every stroke, round at both ends.
  const top = bodyZ + BODY.depth + BODY.bevel;
  for (const stroke of input.drawing?.strokes ?? []) {
    const radius = Math.max(0.012, (stroke.w / 2) * INSET);
    const z = top + radius * 0.35;
    const points: Three.Vector3[] = [];
    for (let i = 0; i + 1 < stroke.p.length; i += 2) {
      const [x, y] = place(input.shape, stroke.p[i], stroke.p[i + 1]);
      const last = points.at(-1);
      if (last && Math.hypot(last.x - x, last.y - y) < 0.004) continue;
      points.push(new THREE.Vector3(x, y, z));
    }
    if (!points.length) continue;
    const cap = new THREE.SphereGeometry(radius, 16, 12);
    for (const end of points.length > 1
      ? [points[0], points.at(-1)]
      : [points[0]]) {
      const dot = new THREE.Mesh(cap, reliefMaterial);
      dot.position.copy(end as Three.Vector3);
      group.add(dot);
    }
    if (points.length > 1) {
      const curve = new THREE.CatmullRomCurve3(points, false, "centripetal");
      group.add(
        new THREE.Mesh(
          new THREE.TubeGeometry(
            curve,
            Math.min(600, points.length * 6),
            radius,
            12,
            false
          ),
          reliefMaterial
        )
      );
    }
  }

  // Centered in depth too, so it turns around its middle.
  group.position.z = -(top / 2);
  const holder = new THREE.Group();
  holder.add(group);
  return holder;
};

/** Frees what the sticker's meshes hold on the GPU. */
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
  const key = new THREE.DirectionalLight("#ffffff", 2.2);
  key.position.set(-1.5, 2, 3);
  scene.add(key);
  const rim = new THREE.DirectionalLight("#ffd6ec", 0.9);
  rim.position.set(2, -1.2, 1);
  scene.add(rim);
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 20);
  camera.position.set(0, 0, 2.7);
  return { scene, camera };
};
