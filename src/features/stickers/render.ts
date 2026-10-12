import type * as Three from "three";
import {
  buildSticker,
  disposeSticker,
  type StickerInput,
  stage,
} from "./build";

/**
 * Stickers as pictures: one hidden WebGL canvas renders each stamp once – a
 * little tilted, so it reads as 3D – into an image URL. Lists, trays and
 * pages show those pictures; only the stamp being made spins live
 * (sticker-view.tsx). Kept per stamp version, rendered one after another.
 */

const SIZE = 320;

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
let queue: Promise<unknown> = Promise.resolve();

/** A short fingerprint of what the sticker looks like. */
export const stickerKey = (input: StickerInput) => {
  let hash = 0;
  const text = `${input.shape}|${input.color}|${JSON.stringify(input.drawing?.strokes ?? [])}`;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return `${input.shape}-${input.color}-${text.length}-${hash}`;
};

/** The sticker's picture (an object URL) – rendered once, then kept. */
export const stickerImage = (input: StickerInput): Promise<string> => {
  const key = stickerKey(input);
  const hit = cache.get(key);
  if (hit) return hit;
  const job = queue.then(async () => {
    const { THREE, renderer, scene, camera } = await open();
    const sticker = buildSticker(THREE, input);
    // Tilted back and turned a little – the angle all pictures share.
    sticker.rotation.set(-0.42, 0.28, -0.06);
    scene.add(sticker);
    renderer.render(scene, camera);
    scene.remove(sticker);
    disposeSticker(sticker);
    const blob = await new Promise<Blob | null>((resolve) =>
      renderer.domElement.toBlob(resolve, "image/png")
    );
    if (!blob) throw new Error("No picture");
    return URL.createObjectURL(blob);
  });
  queue = job.catch(() => undefined);
  cache.set(key, job);
  job.catch(() => cache.delete(key));
  return job;
};
