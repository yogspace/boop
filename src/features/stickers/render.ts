import type * as Three from "three";
import {
  buildSticker,
  disposeSticker,
  pose,
  type StickerInput,
  stage,
} from "./build";

/**
 * Stamps as pictures: one hidden WebGL canvas renders each stamp once per
 * pose into an image URL. Lists, trays and pages show those pictures; only
 * the stamp being made or looked at turns live (sticker-view.tsx). Kept per
 * stamp version, rendered one after another.
 */

const SIZE = 320;

/**
 * The pictures' angle – gentler than `pose()`'s: turned just enough to show
 * the block's side, the face (the drawing) still easy to read.
 */
const FACE_TURN = [0.38, 0.3, -0.06] as const;

export type Pose = "face" | "press";

type Studio = {
  THREE: typeof Three;
  renderer: Three.WebGLRenderer;
  scene: Three.Scene;
  camera: Three.PerspectiveCamera;
};

let studio: Promise<Studio> | null = null;

const open = () => {
  studio ??= (async () => {
    const THREE = await import("three");
    const canvas = document.createElement("canvas");
    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(1);
    renderer.setSize(SIZE, SIZE, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    const { scene, camera } = await stage(THREE, renderer);
    return { THREE, renderer, scene, camera };
  })();
  return studio;
};

const cache = new Map<string, Promise<string>>();
/** The pictures already there – to show them right away. */
const done = new Map<string, string>();
let queue: Promise<unknown> = Promise.resolve();

/**
 * A short fingerprint of what the stamp looks like – the whole drawing goes
 * in (strokes, filled areas, whatever it holds).
 */
export const stickerKey = (input: StickerInput, kind: Pose = "face") => {
  let hash = 0;
  const text = `${kind}|${input.shape}|${input.color}|${JSON.stringify(input.drawing)}`;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return `${kind}-${input.shape}-${input.color}-${text.length}-${hash}`;
};

/** The stamp's picture (an object URL) – rendered once, then kept. */
export const stickerImage = (
  input: StickerInput,
  kind: Pose = "face"
): Promise<string> => {
  const key = stickerKey(input, kind);
  const hit = cache.get(key);
  if (hit) return hit;
  const job = queue.then(async () => {
    const { THREE, renderer, scene, camera } = await open();
    const sticker = buildSticker(THREE, input);
    if (kind === "face") sticker.rotation.set(...FACE_TURN);
    else pose(sticker, kind);
    scene.add(sticker);
    renderer.render(scene, camera);
    scene.remove(sticker);
    disposeSticker(sticker);
    const blob = await new Promise<Blob | null>((resolve) =>
      renderer.domElement.toBlob(resolve, "image/png")
    );
    if (!blob) throw new Error("No picture");
    const url = URL.createObjectURL(blob);
    // Decoded up front – on the page it shows the moment it's put there.
    const image = new Image();
    image.src = url;
    await image.decode().catch(() => undefined);
    done.set(key, url);
    return url;
  });
  queue = job.catch(() => undefined);
  cache.set(key, job);
  job.catch(() => cache.delete(key));
  return job;
};

/** The stamp's picture if it's rendered already – null if not (yet). */
export const renderedStickerImage = (
  input: StickerInput,
  kind: Pose = "face"
) => done.get(stickerKey(input, kind)) ?? null;
