import type * as Three from "three";
import { hexOf } from "@/features/calendar/palette";
import {
  buildSticker,
  disposeSticker,
  type StickerInput,
  stage,
} from "./build";
import { addGlitter } from "./glitter";
import { createInk, type Ink } from "./ink";

/**
 * Stamps as pictures: one hidden WebGL canvas – the studio – renders each
 * stamp once per pose into an image URL. Lists, trays and pages show those
 * pictures; a stamp turning to the pointer is drawn in the same studio,
 * frame by frame (look.ts), and only the one being made or looked at up
 * close has a canvas of its own (sticker-view.tsx). Kept per stamp version,
 * rendered one after another.
 */

/** The pictures' size (px) – square. */
export const SIZE = 320;
/** Drawn this many times finer and averaged down – smooth lines. */
const FINER = 2;
/**
 * The pictures are taken from far off, with a long lens: the face – nearest
 * to the camera – isn't blown up over what is behind it, the drawing keeps
 * its proportions.
 */
const DISTANCE = 8;

/**
 * The pictures' angle. The face – the drawing – comes first: it looks at
 * you, turned only a little (about 0.41 rad all in all), so the block's edge
 * and how thick it is still show. The knob peeks out behind a triangle only
 * – the others hide it, until the stamp turns to the pointer (look.ts).
 */
const FACE_TURN = [0.36, 0.2, -0.04] as const;
/** Upright, knob up, seen from a little above – as it comes down on a day. */
const PRESS_TURN = [Math.PI / 2 + 0.42, 0.5, 0] as const;

export type Pose = "face" | "press";

/** Turns a stamp as its picture shows it. */
export const pose = (sticker: Three.Object3D, kind: Pose) => {
  const [x, y, z] = kind === "face" ? FACE_TURN : PRESS_TURN;
  sticker.rotation.set(x, y, z);
};

export type Studio = {
  THREE: typeof Three;
  renderer: Three.WebGLRenderer;
  scene: Three.Scene;
  camera: Three.PerspectiveCamera;
  ink: Ink;
  /** Picture px per stamp unit, at the stamp. */
  unit: number;
};

let studio: Promise<Studio> | null = null;

const build = async (): Promise<Studio> => {
  const THREE = await import("three");
  const canvas = document.createElement("canvas");
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: false,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  renderer.setSize(SIZE, SIZE, false);
  const { scene, camera } = stage(THREE);
  const ink = createInk(THREE, renderer, { supersample: FINER });
  // What the stage's camera sees of the stamp's plane – the same from
  // further away.
  const view = 2 * camera.position.z * Math.tan((camera.fov * Math.PI) / 360);
  camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(view / 2 / DISTANCE));
  camera.position.z = DISTANCE;
  camera.updateProjectionMatrix();
  return { THREE, renderer, scene, camera, ink, unit: SIZE / view };
};

/** The browser took the studio's WebGL context away – it draws nothing. */
export const studioLost = ({ renderer }: Studio) =>
  renderer.getContext().isContextLost();

/**
 * The studio – opened when the first picture is asked for. Whoever draws in
 * it puts a stamp into its scene, draws and takes it out again, all in one
 * go: nothing stays in there between two pictures.
 *
 * A page gets only so many WebGL contexts, and the oldest – this one, most
 * likely – is the first to go when there are too many: then a new studio
 * opens.
 */
export const openStudio = async (): Promise<Studio> => {
  studio ??= build();
  const mine = studio;
  const open = await mine;
  if (!studioLost(open)) return open;
  if (studio === mine) {
    open.ink.dispose();
    open.renderer.dispose();
    studio = build();
  }
  return studio;
};

/**
 * Goes up whenever the pictures change (the pose, the lens, the model) – no
 * picture of before is shown for a stamp then. (They are kept in memory
 * only, for as long as the page is open.)
 */
const VERSION = 2;

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
  // By the color it shows in, not its name – the CMS may change it.
  const text = `${kind}|${input.shape}|${hexOf(input.color)}|${JSON.stringify(input.drawing)}`;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return `${VERSION}-${kind}-${input.shape}-${input.color}-${text.length}-${hash}`;
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
    let open = await openStudio();
    const sticker = buildSticker(open.THREE, input);
    addGlitter(open.THREE, sticker, input);
    pose(sticker, kind);
    const draw = ({ scene, camera, ink, unit }: Studio) => {
      scene.add(sticker);
      ink.render(scene, camera, { unit });
      scene.remove(sticker);
    };
    draw(open);
    if (studioLost(open)) {
      // Drawn into nothing: once more, in a new studio.
      open = await openStudio();
      draw(open);
    }
    disposeSticker(sticker);
    // An empty picture is none – better the flat drawing than a gap.
    if (studioLost(open)) throw new Error("No picture");
    const { renderer } = open;
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
