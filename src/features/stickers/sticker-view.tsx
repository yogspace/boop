"use client";

import { usePresence } from "motion/react";
import { useEffect, useEffectEvent, useRef } from "react";
import type * as Three from "three";
import { cn } from "@/lib/cn";
import { disposeSticker, pivot, type StickerInput, stage } from "./build";
import { addGlitter } from "./glitter";
import { createInk } from "./ink";
import { buildSoftly } from "./render";
import { createSwing, spring } from "./swing";

/**
 * The stamp being made, live in 3D. It starts exactly as the drawing –
 * face-on, its rubber right over the doodle, line for line – holds still for
 * a beat, then springs round to show itself as a stamp: the inked face, the
 * block, the knob. Drag to turn it (flicked, it spins on); let go and it
 * swings back, and sways gently while it waits. Drawn flat at first, like
 * the drawing; its ink lines come as it grows (ink.ts).
 *
 * Asked to (`flyBack`), it leaves the way it came: taken off the page – out
 * of an AnimatePresence – it turns face-on again and grows back onto the
 * drawing, its lines going, and fades as it lands. Only then is it gone.
 *
 * It takes a moment to come: its model is built a part at a time and its
 * programs compiled out of the way (render.ts, ink.ts) – the page goes on
 * meanwhile, the drawing under it shows.
 */

/**
 * The square box a stamp is drawn and shown in – dotted white paper, drawn
 * round with the marker. The frame is the box's ::before (styles.css): it
 * moves nothing inside, so the drawing and the 3D stamp sit where they did.
 */
export const STAGE =
  "scribble scribble-clear relative aspect-square w-full rounded-3xl bg-card bg-[radial-gradient(var(--color-line)_1.3px,transparent_1.3px)] bg-size-[18px_18px]";

/** The drawing's view box: the unit square and a little beyond (its rim). */
export const VIEW_BOX = 1.04;
/** How it shows itself: the face tilted towards you, block and knob behind. */
const SHOWCASE: [number, number, number] = [0.85, 0.55, -0.12];
/** How wide its face is then, of the box – with room to turn every way. */
const SIZE = 0.62;
/** Kept off the box's edge at any angle (radians of the view). */
const MARGIN = 0.02;
/** The face-on beat before it turns (ms). */
const HOLD = 200;
/** Once it has rested this long (s), it begins to sway. */
const REST = 1.6;
/** Turning by hand: radians per pixel dragged. */
const DRAG = 0.01;

/** Turning to show itself – it overshoots a little. */
const REVEAL = spring(8, 0.55);
/**
 * Growing out of the drawing: shrinking into the room, while what it turns
 * around moves from the face to its middle.
 */
const GROW = spring(10, 0.7);
/** Swinging back after it was turned by hand – softer. */
const BACK = spring(6, 0.65);
/** … and without swinging past, where less motion is asked for. */
const STILL = spring(6, 1);
/**
 * Flying back onto the drawing: quicker than it came, and never past it –
 * it lands flat.
 */
const LAND = spring(13, 1);
/** It fades over the last of the way: from this far out of the drawing. */
const FADE_FROM = 0.4;
/** Fading never takes less than this (s) – where nothing flies, just this. */
const FADE = 0.16;
/** Slowing down while spinning freely (per second). */
const FRICTION = 1.8;
/** Below this speed (rad/s) the spring takes hold again … */
const CATCH = 2.5;
/** … fully within this time (s). */
const CATCH_IN = 0.5;
/** No flick spins it faster (rad/s). */
const MAX_SPIN = 18;

export const StickerView = ({
  stamp,
  inset = 12,
  onShown,
  flyBack = false,
  className,
}: {
  stamp: StickerInput;
  /**
   * How far the drawing's box sits inside the view (px) – face-on, the first
   * frame covers that drawing exactly.
   */
  inset?: number;
  /** Once the first frame is on screen – face-on, just like the drawing. */
  onShown?: () => void;
  /**
   * Removed from an AnimatePresence, it flies back onto the drawing and
   * fades before it goes.
   */
  flyBack?: boolean;
  className?: string;
}) => {
  const host = useRef<HTMLDivElement>(null);
  const shown = useEffectEvent(() => onShown?.());
  const padding = useEffectEvent(() => inset);
  // Whoever doesn't fly back keeps out of the presence it is in – a sheet
  // closing never waits for it.
  const [present, safeToRemove] = usePresence(flyBack);
  const leaving = flyBack && !present;
  const gone = useEffectEvent(() => safeToRemove?.());
  // Sends the live stamp back – none yet (or no 3D at all): nothing to wait
  // for.
  const land = useRef<(() => void) | null>(null);
  const left = useRef(false);
  useEffect(() => {
    if (!leaving) return;
    left.current = true;
    if (land.current) land.current();
    else gone();
  }, [leaving]);

  useEffect(() => {
    // A new stamp while this one is leaving: there is nothing to fly back.
    if (left.current) {
      gone();
      return;
    }
    let off = false;
    let cleanup = () => {};
    (async () => {
      const THREE = await import("three");
      if (off || left.current) return;
      const sticker = await buildSoftly(THREE, stamp);
      const box = host.current;
      if (off || left.current || !box) {
        disposeSticker(sticker);
        return;
      }
      // Antialiased: the first frames, flat like the drawing, go straight
      // onto it.
      const renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      const { scene, camera } = stage(THREE);
      const ink = createInk(THREE, renderer);
      scene.add(sticker);
      const ball = ballOf(THREE, sticker);
      // After measuring – the sparkles may reach out of the ball.
      addGlitter(THREE, sticker, stamp);

      // Laid over its box, never stretching it – so the box can shrink.
      const canvas = renderer.domElement;
      canvas.style.position = "absolute";
      canvas.style.inset = "0";
      canvas.style.touchAction = "none";
      canvas.style.cursor = "grab";
      box.appendChild(canvas);

      // Sizes – as laid out, not as a sheet still rising may scale them:
      // face-on, one unit is as wide as in the drawing; shown, the whole
      // stamp – knob and all – fits at any angle.
      // What the camera sees of the plane the stamp turns in.
      const distance = camera.position.length();
      const fov = THREE.MathUtils.degToRad(camera.fov / 2);
      const view = 2 * distance * Math.tan(fov);
      let width = 1;
      let height = 1;
      const resize = (w: number, h: number) => {
        width = Math.max(1, w);
        height = Math.max(1, h || w);
        renderer.setSize(width, height);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      };
      resize(box.clientWidth, box.clientHeight);
      const flat = () => (view * (width - 2 * padding())) / VIEW_BOX / height;
      const fitted = () => {
        const narrow = Math.min(1, width / height);
        const half = Math.atan(Math.tan(fov) * narrow);
        return Math.min(
          SIZE * view * narrow,
          (distance * Math.sin(half - MARGIN)) / ball.radius
        );
      };

      const reduced = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;
      const showcase = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(...SHOWCASE)
      );
      // Its state: how it is turned and how fast, and how far it has grown
      // out of the drawing (0 – flat on the face, 1 – a stamp in the room).
      const turn = new THREE.Quaternion();
      const spin = new THREE.Vector3();
      let grow = 0;
      let growing = 0;
      // How firmly the spring holds it (0 – spinning freely after a flick).
      let grip = 1;
      let pull = reduced ? STILL : REVEAL;
      // A gentle sway once it rests (0–1).
      let calm = 0;
      if (reduced) {
        turn.copy(showcase);
        grow = 1;
      }
      // On its way back onto the drawing – and how much of it still shows.
      let landing = false;
      let fade = 1;

      // Turned by hand – the pointer, and how far it turned it and when (for
      // the flick).
      let drag: {
        id: number;
        x: number;
        y: number;
        ax: number;
        ay: number;
        trail: { t: number; x: number; y: number }[];
      } | null = null;

      const target = new THREE.Quaternion();
      const sway = new THREE.Quaternion();
      const step = new THREE.Quaternion();
      const nod = new THREE.Quaternion();
      const axis = new THREE.Vector3();
      const X = new THREE.Vector3(1, 0, 0);
      const Y = new THREE.Vector3(0, 1, 0);
      const swing = createSwing(THREE);
      // The spring as firmly as it holds right now.
      const held = { pull: 0, damping: 0 };

      /** One small step of the springs, `h` seconds. */
      const simulate = (h: number) => {
        // Out of the drawing – or back into it.
        const size = landing ? LAND : GROW;
        const to = landing ? 0 : 1;
        growing += (size.pull * (to - grow) - size.damping * growing) * h;
        grow += growing * h;
        if (drag) return;
        held.pull = pull.pull * grip;
        held.damping = FRICTION + (pull.damping - FRICTION) * grip;
        swing(turn, spin, target, held, h);
        // Slowed down, the spring catches it again.
        if (grip < 1 && spin.length() < CATCH) {
          grip = Math.min(1, grip + h / CATCH_IN);
        }
      };

      // Turning by hand – like a trackball, both ways; it follows the finger.
      const down = (event: PointerEvent) => {
        if (drag || landing || !event.isPrimary) return;
        canvas.setPointerCapture(event.pointerId);
        canvas.style.cursor = "grabbing";
        drag = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          ax: 0,
          ay: 0,
          trail: [{ t: event.timeStamp, x: 0, y: 0 }],
        };
        spin.set(0, 0, 0);
      };
      const move = (event: PointerEvent) => {
        if (!drag || event.pointerId !== drag.id) return;
        const dx = event.clientX - drag.x;
        const dy = event.clientY - drag.y;
        drag.x = event.clientX;
        drag.y = event.clientY;
        const angle = Math.hypot(dx, dy) * DRAG;
        if (!angle) return;
        step.setFromAxisAngle(axis.set(dy, dx, 0).normalize(), angle);
        turn.premultiply(step).normalize();
        drag.ax += dy * DRAG;
        drag.ay += dx * DRAG;
        // Only the last moments count for the flick.
        const { trail } = drag;
        trail.push({ t: event.timeStamp, x: drag.ax, y: drag.ay });
        while (trail.length > 2 && event.timeStamp - trail[0].t > 120) {
          trail.shift();
        }
      };
      const up = (event: PointerEvent) => {
        if (!drag || event.pointerId !== drag.id) return;
        // Let go: it keeps the speed of the last few moments.
        const from = drag.trail.find((at) => event.timeStamp - at.t <= 90);
        const time = from ? (event.timeStamp - from.t) / 1000 : 0;
        if (from && time > 0.008 && event.type === "pointerup") {
          spin.set((drag.ax - from.x) / time, (drag.ay - from.y) / time, 0);
          if (spin.length() > MAX_SPIN) spin.setLength(MAX_SPIN);
        } else spin.set(0, 0, 0);
        drag = null;
        grip = 0;
        if (!reduced) pull = BACK;
        canvas.style.cursor = "grab";
      };
      canvas.addEventListener("pointerdown", down);
      canvas.addEventListener("pointermove", move);
      canvas.addEventListener("pointerup", up);
      canvas.addEventListener("pointercancel", up);
      canvas.addEventListener("lostpointercapture", up);
      const observer = new ResizeObserver(([{ contentRect }]) =>
        resize(contentRect.width, contentRect.height)
      );
      observer.observe(box);

      let frame = 0;
      let first = -1;
      let last = -1;
      const tick = (now: number) => {
        frame = requestAnimationFrame(tick);
        const fresh = first < 0;
        if (fresh) first = now;
        // Seconds since the last frame – never a leap (a slow frame, a tab
        // coming back).
        const dt =
          last < 0 ? 0 : Math.min(0.05, Math.max(0, now - last) / 1000);
        last = now;
        const time = (now - first) / 1000;
        // Where less motion is asked for, nothing flies back: it just fades.
        const flying = landing && !reduced;
        if (flying || (now - first >= HOLD && !landing)) {
          // The sway: the target drifts a little, the spring follows.
          const resting =
            !reduced && !drag && !landing && grip === 1 && time > REST;
          calm +=
            ((resting ? 1 : 0) - calm) *
            (1 - Math.exp(-dt * (resting ? 0.9 : landing ? 16 : 4)));
          sway
            .setFromAxisAngle(Y, calm * 0.08 * Math.sin(time * 0.8))
            .multiply(
              nod.setFromAxisAngle(X, calm * 0.04 * Math.sin(time * 1.1 + 1))
            );
          // Face-on again, as the drawing lies – or showing itself.
          if (landing) target.identity();
          else target.copy(showcase).premultiply(sway);
          const n = Math.ceil(dt * 240);
          for (let i = 0; i < n; i++) simulate(dt / n);
        }
        if (landing) {
          // Still all there for most of the way; over the drawing it goes.
          const near = Math.min(1, Math.max(0, grow / FADE_FROM));
          const to = flying ? near * near * (3 - 2 * near) : 0;
          fade = Math.max(to, fade - dt / FADE);
          canvas.style.opacity = fade.toFixed(3);
          if (fade <= 0.004) {
            // Landed: nothing left to draw.
            cancelAnimationFrame(frame);
            frame = 0;
            gone();
            return;
          }
        }
        const s0 = flat();
        sticker.scale.setScalar(s0 + (fitted() - s0) * grow);
        pivot(sticker, grow * ball.pivot);
        sticker.quaternion.copy(turn);
        sticker.position.y = calm * 0.012 * Math.sin(time * 1.5);
        // The lines come as it grows out of the drawing.
        ink.render(scene, camera, {
          unit: (renderer.getPixelRatio() * height * sticker.scale.x) / view,
          amount: Math.min(1, Math.max(0, grow * 1.6)),
          time,
          twinkle: !reduced,
        });
        if (fresh) shown();
      };
      // Only while the page is looked at.
      const wake = () => {
        cancelAnimationFrame(frame);
        if (document.hidden) return;
        last = -1;
        frame = requestAnimationFrame(tick);
      };
      cleanup = () => {
        land.current = null;
        cancelAnimationFrame(frame);
        document.removeEventListener("visibilitychange", wake);
        observer.disconnect();
        canvas.removeEventListener("pointerdown", down);
        canvas.removeEventListener("pointermove", move);
        canvas.removeEventListener("pointerup", up);
        canvas.removeEventListener("pointercancel", up);
        canvas.removeEventListener("lostpointercapture", up);
        disposeSticker(sticker);
        ink.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        canvas.remove();
      };

      // Its programs compiled before the first frame, out of the way – the
      // drawing under it shows meanwhile. Until that frame there is nothing
      // to fly back.
      await ink.warm(scene, camera, { flat: true }).catch(() => undefined);
      // Gone meanwhile – or asked to leave, and let go (nothing flew).
      if (off || left.current) return;
      document.addEventListener("visibilitychange", wake);
      wake();

      land.current = () => {
        if (landing) return;
        landing = true;
        // Out of the hand, and held firmly all the way back.
        if (drag && canvas.hasPointerCapture(drag.id)) {
          canvas.releasePointerCapture(drag.id);
        }
        drag = null;
        grip = 1;
        pull = LAND;
        // What lies under it – the drawing – takes the pointer again.
        box.style.pointerEvents = "none";
      };
      // No WebGL, or three.js out of reach: no 3D – what lies under the view
      // (the drawing) simply stays.
    })().catch(() => undefined);
    return () => {
      off = true;
      cleanup();
    };
  }, [stamp]);

  return (
    <div
      className={cn("relative aspect-square w-full touch-none", className)}
      ref={host}
    />
  );
};

/**
 * The smallest ball around a point on its axis that holds the whole stamp –
 * knob and all. Turning around its middle, the stamp stays inside the box at
 * every angle, as large as can be, and sits in the middle of it. Returns
 * that middle as a `pivot()` amount, and the radius (unscaled).
 */
const ballOf = (THREE: typeof Three, sticker: Three.Object3D) => {
  pivot(sticker, 0);
  sticker.updateMatrixWorld(true);
  // Its profile: how far it reaches sideways (squared), slice by slice from
  // the face (z = 0) back to the knob's end.
  const SLICE = 0.01;
  const wide = new Float32Array(256);
  let deep = 0;
  const point = new THREE.Vector3();
  sticker.traverse((child) => {
    const mesh = child as Three.Mesh;
    const position = mesh.isMesh && mesh.geometry.getAttribute("position");
    if (!position) return;
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
      const slice = Math.min(
        wide.length - 1,
        Math.max(0, Math.round(-point.z / SLICE))
      );
      wide[slice] = Math.max(wide[slice], point.x ** 2 + point.y ** 2);
      deep = Math.max(deep, slice);
    }
  });
  // Tried along the axis, from the face to the stamp's middle (`pivot()`).
  const half: number = sticker.userData.half ?? 0;
  let best = { pivot: 0, radius: Number.POSITIVE_INFINITY };
  for (let n = 0; n <= 100; n++) {
    const middle = (n / 100) * half;
    let radius = 0;
    for (let i = 0; i <= deep; i++) {
      radius = Math.max(radius, wide[i] + (i * SLICE - middle) ** 2);
    }
    if (radius < best.radius) best = { pivot: n / 100, radius };
  }
  // Half a slice on top – nothing sticks out.
  return { pivot: best.pivot, radius: Math.sqrt(best.radius) + SLICE / 2 };
};
