"use client";

import { useEffect, useEffectEvent, useRef } from "react";
import type * as Three from "three";
import { cn } from "@/lib/cn";
import {
  buildSticker,
  disposeSticker,
  pivot,
  type StickerInput,
  stage,
} from "./build";

/**
 * The stamp being made, live in 3D. It starts exactly as the drawing –
 * face-on, its rubber right over the doodle, line for line – holds still for
 * a beat, then springs round to show itself as a stamp: the inked face, the
 * block, the knob. Drag to turn it (flicked, it spins on); let go and it
 * swings back, and sways gently while it waits.
 */

/** The square box a stamp is drawn and shown in – dotted paper. */
export const STAGE =
  "relative aspect-square w-full rounded-3xl bg-soft bg-[radial-gradient(var(--color-line)_1.3px,transparent_1.3px)] bg-size-[18px_18px]";

/** What the stage's camera sees of the plane through the middle (fov 30°, 3 away). */
const DISTANCE = 3;
const HALF_FOV = Math.PI / 12;
const VIEW = 2 * DISTANCE * Math.tan(HALF_FOV);
/** The drawing's view box: the unit square and a little beyond (its rim). */
const VIEW_BOX = 1.04;
/** How it shows itself: the face tilted towards you, block and knob behind. */
const SHOWCASE: [number, number, number] = [0.95, 0.55, -0.12];
/** Its width then, of the box's – it has room to turn every way. */
const SIZE = 0.58;
/** Kept off the box's edge at any angle (radians of the view). */
const MARGIN = 0.02;
/** The face-on beat before it turns (ms). */
const HOLD = 200;
/** Turning by hand: radians per pixel dragged. */
const DRAG = 0.01;

/** A spring's pull and damping, from its frequency (rad/s) and damping ratio. */
const spring = (frequency: number, ratio: number) => ({
  pull: frequency * frequency,
  damping: 2 * ratio * frequency,
});
/** Turning to show itself – it overshoots a little. */
const REVEAL = spring(8, 0.55);
/** Growing out of the drawing: shrinking into the room, the turn's center moving to the middle. */
const GROW = spring(10, 0.8);
/** Swinging back after it was turned by hand – softer. */
const BACK = spring(6, 0.65);
const STILL = spring(6, 1);
/** Slowing down while spinning freely (per second). */
const FRICTION = 1.8;
/** Below this speed (rad/s) the spring takes hold again. */
const CATCH = 2.5;
const MAX_SPIN = 18;

export const StickerView = ({
  stamp,
  inset = 12,
  onShown,
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
  className?: string;
}) => {
  const host = useRef<HTMLDivElement>(null);
  const shown = useEffectEvent(() => onShown?.());
  const padding = useEffectEvent(() => inset);

  useEffect(() => {
    let gone = false;
    let cleanup = () => {};
    void (async () => {
      const THREE = await import("three");
      const box = host.current;
      if (gone || !box) return;
      const renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.NeutralToneMapping;
      const { scene, camera } = await stage(THREE, renderer);
      if (gone) {
        scene.environment?.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        return;
      }
      const sticker = buildSticker(THREE, stamp);
      scene.add(sticker);
      const reach = reachOf(THREE, sticker);

      const canvas = renderer.domElement;
      canvas.style.display = "block";
      canvas.style.touchAction = "none";
      canvas.style.cursor = "grab";
      box.appendChild(canvas);

      // Sizes: face-on, one unit is as wide as in the drawing; shown, the
      // whole stamp – knob and all – fits at any angle.
      let width = 1;
      let height = 1;
      const resize = () => {
        const rect = box.getBoundingClientRect();
        width = Math.max(1, rect.width);
        height = Math.max(1, rect.height || rect.width);
        renderer.setSize(width, height);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      };
      resize();
      const flat = () => (VIEW * (width - 2 * padding())) / VIEW_BOX / height;
      const fitted = () => {
        const narrow = Math.min(1, width / height);
        const half = Math.atan(Math.tan(HALF_FOV) * narrow);
        return Math.min(
          SIZE * VIEW * narrow,
          (DISTANCE * Math.sin(half - MARGIN)) / reach
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
      const error = new THREE.Quaternion();
      const step = new THREE.Quaternion();
      const axis = new THREE.Vector3();
      const X = new THREE.Vector3(1, 0, 0);
      const Y = new THREE.Vector3(0, 1, 0);

      /** One small step of the springs, `h` seconds. */
      const simulate = (h: number) => {
        growing += (GROW.pull * (1 - grow) - GROW.damping * growing) * h;
        grow += growing * h;
        if (drag) return;
        // The shortest way to the target – never unwinding whole turns.
        error.copy(turn).invert().premultiply(target);
        if (error.w < 0) error.set(-error.x, -error.y, -error.z, -error.w);
        const sin = Math.hypot(error.x, error.y, error.z);
        const angle = 2 * Math.atan2(sin, error.w);
        const force = sin > 1e-6 ? (pull.pull * grip * angle) / sin : 0;
        const damping = FRICTION + (pull.damping - FRICTION) * grip;
        spin.x += (error.x * force - damping * spin.x) * h;
        spin.y += (error.y * force - damping * spin.y) * h;
        spin.z += (error.z * force - damping * spin.z) * h;
        const speed = spin.length();
        if (speed > 1e-6) {
          step.setFromAxisAngle(axis.copy(spin).divideScalar(speed), speed * h);
          turn.premultiply(step).normalize();
        }
        // Slowed down, the spring catches it again.
        if (grip < 1 && speed < CATCH) grip = Math.min(1, grip + h / 0.5);
      };

      // Turning by hand – like a trackball, both ways; it follows the finger.
      const down = (event: PointerEvent) => {
        if (drag || !event.isPrimary) return;
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
        drag.trail.push({ t: event.timeStamp, x: drag.ax, y: drag.ay });
        while (drag.trail.length > 2 && event.timeStamp - drag.trail[0].t > 120)
          drag.trail.shift();
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
      const observer = new ResizeObserver(resize);
      observer.observe(box);

      let frame = 0;
      let first = 0;
      let last = 0;
      const tick = (now: number) => {
        frame = requestAnimationFrame(tick);
        first ||= now;
        const dt = Math.min(0.05, Math.max(0, (now - (last || now)) / 1000));
        last = now;
        const time = (now - first) / 1000;
        if (now - first >= HOLD) {
          // The sway: the target drifts a little, the spring follows.
          const resting = !reduced && !drag && grip === 1 && time > 1.6;
          calm +=
            ((resting ? 1 : 0) - calm) *
            (1 - Math.exp(-dt * (resting ? 0.9 : 4)));
          sway
            .setFromAxisAngle(Y, calm * 0.08 * Math.sin(time * 0.8))
            .multiply(
              step.setFromAxisAngle(X, calm * 0.04 * Math.sin(time * 1.1 + 1))
            );
          target.copy(showcase).premultiply(sway);
          const n = Math.ceil(dt * 240);
          for (let i = 0; i < n; i++) simulate(dt / n);
        }
        const s0 = flat();
        sticker.scale.setScalar(s0 + (fitted() - s0) * grow);
        pivot(sticker, grow);
        sticker.quaternion.copy(turn);
        sticker.position.y = calm * 0.012 * Math.sin(time * 1.5);
        renderer.render(scene, camera);
        if (now === first) shown();
      };
      const wake = () => {
        cancelAnimationFrame(frame);
        if (document.hidden) return;
        last = 0;
        frame = requestAnimationFrame(tick);
      };
      document.addEventListener("visibilitychange", wake);
      wake();

      cleanup = () => {
        cancelAnimationFrame(frame);
        document.removeEventListener("visibilitychange", wake);
        observer.disconnect();
        canvas.removeEventListener("pointerdown", down);
        canvas.removeEventListener("pointermove", move);
        canvas.removeEventListener("pointerup", up);
        canvas.removeEventListener("pointercancel", up);
        canvas.removeEventListener("lostpointercapture", up);
        disposeSticker(sticker);
        scene.environment?.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        canvas.remove();
      };
    })();
    return () => {
      gone = true;
      cleanup();
    };
  }, [stamp]);

  return (
    <div
      className={cn("aspect-square w-full touch-none", className)}
      ref={host}
    />
  );
};

/** How far the stamp reaches from what it turns around (at pivot 1, unscaled). */
const reachOf = (THREE: typeof Three, sticker: Three.Object3D) => {
  pivot(sticker, 1);
  sticker.updateMatrixWorld(true);
  const point = new THREE.Vector3();
  let reach = 0.5;
  sticker.traverse((child) => {
    const mesh = child as Three.Mesh;
    const position = mesh.isMesh && mesh.geometry.getAttribute("position");
    if (!position) return;
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
      reach = Math.max(reach, point.length());
    }
  });
  return reach;
};
