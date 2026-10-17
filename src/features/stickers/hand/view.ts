import type * as Three from "three";
import { disposeSticker, stage } from "../build";
import { createInk, type Ink, UNDER } from "../ink";
import { GRIP } from "./motion";

/**
 * The hand's scene and its canvas (hand.ts): the stamp standing on its
 * shadow, tipped as it is held, in a small box fixed on the body that
 * travels with it – made when the first stamp is taken, given back with it.
 */

/** The canvas: this many print widths square, the stamp's foot in the middle. */
export const SPAN = 2.5;
/**
 * The camera: far off with a long lens – pressed, the stamp's outline is the
 * print's, not the wider one of whatever is nearest.
 */
const DISTANCE = 8;

export type View = {
  THREE: typeof Three;
  renderer: Three.WebGLRenderer;
  scene: Three.Scene;
  camera: Three.PerspectiveCamera;
  ink: Ink;
  /** The canvas' box on the body – what travels with the stamp. */
  box: HTMLDivElement;
  /** Its size; `tilt` tips it between carried and pressed. */
  body: Three.Group;
  tilt: Three.Group;
  /** Swings around the grip; `seat` holds the stamp below it. */
  grip: Three.Group;
  seat: Three.Group;
  shadow: Three.Mesh<Three.PlaneGeometry, Three.MeshBasicMaterial>;
  sticker: Three.Object3D | null;
};

/** A soft round shadow – dark in the middle, gone at the edge. */
const shadowTexture = (THREE: typeof Three) => {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const fade = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    fade.addColorStop(0, "rgba(20, 20, 20, 1)");
    fade.addColorStop(0.45, "rgba(20, 20, 20, 0.55)");
    fade.addColorStop(1, "rgba(20, 20, 20, 0)");
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, 128, 128);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

/**
 * The scene, its renderer and the box its canvas sits in – `unit`: one print
 * width on the page, in px. Its programs compiled before it is handed over.
 */
export const openView = async (
  THREE: typeof Three,
  unit: number
): Promise<View> => {
  // Not antialiased itself – the ink pass smooths what it draws.
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(SPAN * unit, SPAN * unit);
  const { scene, camera } = stage(THREE);
  const ink = createInk(THREE, renderer);
  // The whole box, one print width a unit, from far away.
  camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(SPAN / 2 / DISTANCE));
  camera.position.set(0, 0, DISTANCE);
  camera.updateProjectionMatrix();

  const body = new THREE.Group();
  const tilt = new THREE.Group();
  body.add(tilt);
  scene.add(body);
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 1.5),
    new THREE.MeshBasicMaterial({
      map: shadowTexture(THREE),
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    })
  );
  // Just under the face when it touches – drawn first, without lines.
  shadow.position.z = 0.004;
  shadow.layers.set(UNDER);
  tilt.add(shadow);
  const grip = new THREE.Group();
  const seat = new THREE.Group();
  seat.position.z = GRIP;
  grip.add(seat);
  tilt.add(grip);

  const box = document.createElement("div");
  box.setAttribute("aria-hidden", "true");
  Object.assign(box.style, {
    position: "fixed",
    left: "0",
    top: "0",
    zIndex: "60",
    pointerEvents: "none",
    opacity: "0",
    willChange: "transform, opacity",
  });
  renderer.domElement.style.display = "block";
  box.append(renderer.domElement);
  document.body.append(box);
  // The shadow's program, and the ink pass' – a stamp's come with it.
  await ink.warm(scene, camera).catch(() => undefined);
  return {
    THREE,
    renderer,
    scene,
    camera,
    ink,
    box,
    body,
    tilt,
    grip,
    seat,
    shadow,
    sticker: null,
  };
};

/** Gives a view back: off the page first – then what it was made of. */
export const closeView = (old: View) => {
  old.box.remove();
  if (old.sticker) disposeSticker(old.sticker);
  old.shadow.geometry.dispose();
  old.shadow.material.map?.dispose();
  old.shadow.material.dispose();
  old.ink.dispose();
  old.renderer.dispose();
  old.renderer.forceContextLoss();
};
