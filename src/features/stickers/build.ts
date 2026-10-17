import type * as Three from "three";
// Relative, not `@/…`: the unit tests import this without the app's aliases.
import { type ColorName, FACE, type RimPattern } from "../calendar/model";
import { outlinePoints } from "../calendar/outline";
import { type Finish, finishOf, hexOf } from "../calendar/palette";
import type { ShapeLike } from "../calendar/shapes";
import { BLOCK_SOLID, blockRings, blockSolid } from "./geometry/block";
import { knobProfile, turnedSolid } from "./geometry/knob";
import { faceMap } from "./geometry/maps";
import { BLOCK, KNOB, PLATE, RUBBER } from "./geometry/measures";
import { distanceTo, localOutline, pointsOf } from "./geometry/outlines";
import { markOf, plateOf, watermarkMap } from "./geometry/plate";
import { shapedSlab } from "./geometry/slab";
import {
  inkRubber,
  type Rgb,
  rgb,
  setFinish,
  tint,
  toonMaterial,
} from "./toon/material";

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
 * (export-stl.ts). The parts are shaped in geometry/ – here they come
 * together. `three` is passed in – it loads only when a stamp is shown.
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

/** How much white the block's tint takes – a dark color more. */
const BLOCK_TINT = { light: 0.45, dark: 0.68 };
/** The rubber's ground: the ink with this much white – the drawing's. */
const GROUND = 0.86;

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
 * their touch of shade comes from the materials (toon/material.ts).
 */
export const stage = (THREE: typeof Three) => {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  camera.position.set(0, 0, 3);
  return { scene, camera };
};
