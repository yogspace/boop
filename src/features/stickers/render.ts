import type * as Three from "three";
import { finishOf, hexOf } from "@/features/calendar/palette";
import { outlineOf } from "@/features/calendar/shapes";
import {
  disposeSticker,
  type StickerInput,
  sampleSticker,
  stage,
  stickerParts,
} from "./build";
import { addGlitter } from "./glitter";
import { createInk, type Ink } from "./ink";
import { keepPicture, pictureEra, readPicture } from "./keep";

/**
 * Stamps as pictures: one hidden WebGL canvas – the studio – renders each
 * stamp once per pose into an image URL. Lists, trays and pages show those
 * pictures; a stamp turning to the pointer is drawn in the same studio,
 * frame by frame (look.ts), and only the one being made or looked at up
 * close has a canvas of its own (sticker-view.tsx).
 *
 * A picture is kept – in memory for as long as the page is open, and on the
 * device (keep.ts): opened again, the page shows the stamps it has seen
 * without any WebGL. A new one is rendered one after another, those on
 * screen first, and never in one long go: its stamp is built a part at a
 * time, the page getting its turn between two – a frame, a tap – so nothing
 * stutters meanwhile.
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
 * Work on pictures goes on for about this long (ms) at a time – then the
 * page has its turn.
 */
const SLICE = 12;

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
  /** Its programs compiled – before that, drawing would wait for them. */
  ready: Promise<void>;
  /** What they were compiled with – kept, so they stay. */
  sample: Three.Object3D;
};

let studio: Promise<Studio> | null = null;

/** A special stamp – for the glitter's program. */
const SPECIAL: StickerInput = {
  shape: "circle",
  color: "",
  drawing: { strokes: [], special: true },
};

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
  // Every program a stamp is drawn with, compiled from the start – while
  // the first stamp is still being built.
  const sample = sampleSticker(THREE);
  addGlitter(THREE, sample, SPECIAL);
  const ready = ink.warm(sample, camera).catch(() => undefined);
  return {
    THREE,
    renderer,
    scene,
    camera,
    ink,
    unit: SIZE / view,
    ready,
    sample,
  };
};

/** The browser took the studio's WebGL context away – it draws nothing. */
export const studioLost = ({ renderer }: Studio) =>
  renderer.getContext().isContextLost();

/**
 * The studio – opened when the first picture is rendered (or ahead,
 * `warmStudio`). Whoever draws in it puts a stamp into its scene, draws and
 * takes it out again, all in one go: nothing stays in there between two
 * pictures.
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
    disposeSticker(open.sample);
    open.ink.dispose();
    open.renderer.dispose();
    studio = build();
  }
  return studio;
};

/**
 * The page's turn: right after the next frame – it is drawn, taps come
 * first. (`scheduler.yield` would go on sooner, but before the frame: in
 * Chrome the page then draws only every 60–120 ms while pictures are made.)
 * `idle` – for what nobody waits for: once nothing else is to be done
 * (`requestIdleCallback`, never more than a moment late).
 */
const breathe = (idle: boolean) => {
  if (idle && typeof requestIdleCallback === "function") {
    return new Promise<void>((resolve) =>
      requestIdleCallback(() => resolve(), { timeout: 400 })
    );
  }
  return new Promise<void>((resolve) => {
    // A hidden page draws no frames.
    if (document.hidden) setTimeout(resolve, 0);
    else requestAnimationFrame(() => setTimeout(resolve, 0));
  });
};

let slice = 0;

/** Goes on – or, the slice used up, first lets the page have its turn. */
const pace = async (idle = false) => {
  if (performance.now() - slice < SLICE) return;
  await breathe(idle);
  slice = performance.now();
};

/**
 * The stamp's model, built a part at a time (build.ts `stickerParts`) – the
 * page has its turn in between. `idle`: whether nobody waits for it (asked
 * again before each part).
 */
export const buildSoftly = async (
  THREE: typeof Three,
  input: StickerInput,
  idle: () => boolean = () => false
) => {
  const parts = stickerParts(THREE, input);
  for (;;) {
    await pace(idle());
    const part = parts.next();
    if (part.done) return part.value;
  }
};

let warming = false;

/**
 * Opens the studio ahead, in a quiet moment once the page is shown: where
 * stamps turn to the pointer (look.ts) and every picture may come from the
 * device, the first one to turn then doesn't wait for it.
 */
export const warmStudio = () => {
  if (studio || warming || typeof window === "undefined") return;
  warming = true;
  requestAnimationFrame(() =>
    setTimeout(() => {
      const open = () => void openStudio().catch(() => undefined);
      if (typeof requestIdleCallback === "function") {
        requestIdleCallback(open, { timeout: 3000 });
      } else setTimeout(open, 600);
    }, 0)
  );
};

/** Renders the stamp's picture in the studio – a PNG. */
const paint = async (
  input: StickerInput,
  kind: Pose,
  idle: () => boolean
): Promise<Blob> => {
  let open = await openStudio();
  const sticker = await buildSoftly(open.THREE, input, idle);
  addGlitter(open.THREE, sticker, input);
  pose(sticker, kind);
  // Compiled while the stamp was built – most likely.
  await open.ready;
  await pace(idle());
  const draw = ({ scene, camera, ink, unit }: Studio) => {
    scene.add(sticker);
    ink.render(scene, camera, { unit });
    scene.remove(sticker);
  };
  try {
    // Lost while the stamp was built: a new studio.
    if (studioLost(open)) {
      open = await openStudio();
      await open.ready;
    }
    draw(open);
    if (studioLost(open)) {
      // Drawn into nothing: once more, in a new studio.
      open = await openStudio();
      await open.ready;
      draw(open);
    }
  } finally {
    disposeSticker(sticker);
  }
  // An empty picture is none – better the flat drawing than a gap.
  if (studioLost(open)) throw new Error("No picture");
  const { renderer } = open;
  const blob = await new Promise<Blob | null>((resolve) =>
    renderer.domElement.toBlob(resolve, "image/png")
  );
  if (!blob) throw new Error("No picture");
  return blob;
};

/**
 * Goes up whenever the pictures change (the pose, the lens, the model) – no
 * picture of before is shown for a stamp then, and those kept on the device
 * go (keep.ts).
 */
const VERSION = 2;

const fresh = (key: string) => key.startsWith(`${VERSION}-`);

/** Whether someone waits for a picture – one on screen. */
type Wanted = { soon: boolean };

type Job = {
  input: StickerInput;
  kind: Pose;
  wanted: Wanted;
  resolve: (blob: Blob) => void;
  reject: (error: unknown) => void;
};

const cache = new Map<string, Promise<string>>();
/** The pictures already there – to show them right away. */
const done = new Map<string, string>();
/** Those on their way – how soon they're wanted. */
const wanted = new Map<string, Wanted>();
/** The pictures to render, in the order asked for. */
const jobs: Job[] = [];
let working = false;

/** One picture after the other – those wanted soon first. */
const work = async () => {
  if (working) return;
  working = true;
  try {
    while (jobs.length) {
      // Before the first one too: the page shows first.
      await pace(!jobs.some((job) => job.wanted.soon));
      const first = jobs.findIndex((job) => job.wanted.soon);
      const [job] = jobs.splice(Math.max(0, first), 1);
      await paint(job.input, job.kind, () => !job.wanted.soon).then(
        job.resolve,
        job.reject
      );
    }
  } finally {
    working = false;
  }
};

/** Renders a picture – queued behind the others (`work`). */
const render = (input: StickerInput, kind: Pose, want: Wanted) =>
  new Promise<Blob>((resolve, reject) => {
    jobs.push({ input, kind, wanted: want, resolve, reject });
    void work();
  });

/**
 * A short fingerprint of what the stamp looks like – the whole drawing goes
 * in (strokes, filled areas, whatever it holds).
 */
export const stickerKey = (input: StickerInput, kind: Pose = "face") => {
  let hash = 0;
  // By the color it shows in, not its name – the CMS may change it, and a
  // special one's finish with it; by the outline its shape has, likewise.
  const outline = outlineOf(input.shape);
  const text = `${kind}|${outline}|${hexOf(input.color)}|${input.finish ?? finishOf(input.color) ?? ""}|${JSON.stringify(input.drawing)}`;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  const name = typeof input.shape === "string" ? input.shape : "outline";
  return `${VERSION}-${kind}-${name}-${input.color}-${text.length}-${hash}`;
};

/**
 * The stamp's picture (an object URL) – from the device, or rendered once,
 * then kept. `soon`: it is on screen, someone waits for it – rendered
 * before those that aren't (asked again with `soon`, it moves up).
 */
export const stickerImage = (
  input: StickerInput,
  kind: Pose = "face",
  { soon = true }: { soon?: boolean } = {}
): Promise<string> => {
  const key = stickerKey(input, kind);
  const hit = cache.get(key);
  if (hit) {
    const want = wanted.get(key);
    if (want && soon) want.soon = true;
    return hit;
  }
  const want: Wanted = { soon };
  wanted.set(key, want);
  const job = (async () => {
    try {
      let blob = await readPicture(key);
      if (!blob) {
        const since = pictureEra();
        blob = await render(input, kind, want);
        keepPicture(key, blob, fresh, since);
      }
      const url = URL.createObjectURL(blob);
      // Decoded up front – on the page it shows the moment it's put there.
      const image = new Image();
      image.src = url;
      await image.decode().catch(() => undefined);
      done.set(key, url);
      return url;
    } finally {
      wanted.delete(key);
    }
  })();
  cache.set(key, job);
  job.catch(() => cache.delete(key));
  return job;
};

/** The stamp's picture if it's there already – null if not (yet). */
export const renderedStickerImage = (
  input: StickerInput,
  kind: Pose = "face"
) => done.get(stickerKey(input, kind)) ?? null;
