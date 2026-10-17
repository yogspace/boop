"use client";

import { useEffect, useEffectEvent, useRef } from "react";
import { createPortal } from "react-dom";
import type * as Three from "three";
import type { ColorName } from "@/features/calendar/model";
import { disposeSticker, pivot, type StickerInput, stage } from "./build";
import { addGlitter, SPARKLE_FRAGMENT } from "./glitter";
import { createInk, inkState, OVER } from "./ink";
import { buildParcel, PARCEL } from "./parcel";
import { buildSoftly, lens, pose, stickerImage } from "./render";
import { VIEW_BOX } from "./sticker-view";

/**
 * A gift unwrapped, live in 3D: over the parcel's picture on the shelf
 * (parcel.ts) it starts exactly as that picture – then shivers, squashed
 * down a little, and the lid flies off, tumbling, as sparkles burst out of
 * the box; the stamp rises out of it with a twirl while the box drops away,
 * and lands just where – and just as – its own picture will be. Then the
 * page shows that picture (`onOpened`), and this fades.
 *
 * Drawn on a canvas WIDE times the picture's size, round the same middle and
 * with the same lens (render.ts `lens`): what flies has room, and nothing of
 * it is cut off – laid over the page, outside of everything (a portal,
 * fixed), following the picture's box (`anchor`) and its tilt. Nothing on
 * it takes the pointer.
 *
 * Without WebGL there is nothing to see: it says so at once – opened, done.
 */

/** The canvas, this many times the picture's size. */
const WIDE = 3;
/** Fading away at the end (ms). */
const FADE = 180;

/** When what happens (s from the first frame). */
const AT = {
  /** The parcel shivers, squashed, until the lid pops. */
  pop: 0.3,
  /** The sparkles burst a moment after. */
  burst: 0.32,
  /** The stamp rises out, and round to face you. */
  rise: [0.36, 1.3],
  turn: [0.44, 1.3],
  grow: [0.4, 1.3],
  /** Landing on a drawing, larger than its picture: it grows once out. */
  growFlat: [0.72, 1.3],
  /** The box drops away, shrinking. */
  fall: [0.66, 1.14],
  /** Landing on a drawing, its lines go from here (`landing`). */
  flat: 1.12,
  /** Its picture may take over from here. */
  land: 1.4,
} as const;

/** The lid's flight: off up and to the right, tumbling (units, s). */
const FLIGHT = {
  velocity: [2.1, 3.6, 0.5],
  gravity: 7,
  spin: 8,
  axis: [0.35, 0.25, -1],
  /** It shrinks away from this long after the pop, over `gone`. */
  shrink: 0.28,
  gone: 0.5,
} as const;

/** How high the stamp hops on its way up and round. */
const HOP = 0.75;
/** How far the box drops as it goes. */
const DROP = 0.9;

const clamp = (x: number) => Math.min(1, Math.max(0, x));
const span = (t: number, [from, to]: readonly [number, number]) =>
  clamp((t - from) / (to - from));
const easeInOut = (x: number) =>
  x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
/** Past the mark a little, then back – a landing. */
const backOut = (x: number, s = 1.5) =>
  1 + (s + 1) * (x - 1) ** 3 + s * (x - 1) ** 2;

/**
 * What an unwrapping needs, fetched ahead – as the parcel is first tapped:
 * by the last tap, it opens at once.
 */
export const prepareUnwrap = () => {
  void import("three").catch(() => undefined);
};

export const Unwrapping = ({
  stamp,
  color,
  anchor,
  tilt,
  landing,
  onShown,
  onOpened,
  onDone,
}: {
  /** The gift's stamp, as it comes out. */
  stamp: StickerInput;
  /** The parcel's color. */
  color: ColorName;
  /** The picture's box on the page – the canvas follows it. */
  anchor: () => HTMLElement | null;
  /** How the picture is turned there (degrees). */
  tilt: number;
  /**
   * Where the stamp lands. None: as its picture shows it (render.ts) – the
   * shelf. `inset`: face-on, flat – lines and all gone – on a drawing laid
   * that far (px) inside the box, as a live stamp starts out
   * (sticker-view.tsx): a card's page hands over to one there.
   */
  landing?: { inset: number };
  /** The first frame is on screen – the parcel's picture may go. */
  onShown: () => void;
  /** The stamp lies where its picture goes – that may show now. */
  onOpened: () => void;
  /** Faded, gone. */
  onDone: () => void;
}) => {
  const host = useRef<HTMLDivElement>(null);
  const shown = useEffectEvent(onShown);
  const opened = useEffectEvent(onOpened);
  const done = useEffectEvent(onDone);
  const anchored = useEffectEvent(anchor);
  const turned = useEffectEvent(() => tilt);
  const input = useRef(stamp).current;
  const paper = useRef(color).current;
  const flat = useRef(landing).current;

  useEffect(() => {
    let off = false;
    let cleanup = () => {};
    const skip = () => {
      if (off) return;
      opened();
      done();
    };
    (async () => {
      // Its picture is wanted at the end – on its way from now.
      const picture = flat
        ? Promise.resolve(null)
        : stickerImage(input, "face", { soon: true }).catch(() => null);
      const THREE = await import("three");
      if (off) return;
      const sticker = await buildSoftly(THREE, input);
      const box = host.current;
      if (off || !box) {
        disposeSticker(sticker);
        return;
      }
      addGlitter(THREE, sticker, input);
      const glitter = sticker.getObjectByName("glitter");
      const parcel = buildParcel(THREE, paper);
      // Its parts – the lid flies off on its own.
      const body = parcel.getObjectByName("body") as Three.Object3D;
      const lid = parcel.getObjectByName("lid") as Three.Object3D;
      const nest = parcel.getObjectByName("nest") as Three.Object3D;
      const renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: false,
      });
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      renderer.setPixelRatio(ratio);
      const { scene, camera } = stage(THREE);
      const view = lens(THREE, camera, WIDE);
      const ink = createInk(THREE, renderer, {
        supersample: ratio < 2 ? 2 : 1,
      });
      const burst = burstOf(THREE);
      scene.add(parcel, sticker, burst);
      // Inside, out of sight, until it rises.
      sticker.visible = false;
      burst.visible = false;
      const canvas = renderer.domElement;
      canvas.style.display = "block";
      box.appendChild(canvas);
      let frame = 0;
      cleanup = () => {
        cancelAnimationFrame(frame);
        for (const object of [parcel, lid, sticker, burst]) {
          disposeSticker(object);
        }
        ink.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        canvas.remove();
      };

      const posed = parcel.quaternion.clone();
      const around = new THREE.Vector3(0, 0, 1);
      const shiver = new THREE.Quaternion();
      // The stamp's way: where it starts (set at the rise) and ends – just
      // as its picture has it (render.ts `pose`), or face-on.
      const end = new THREE.Object3D();
      if (!flat) pose(end, "face");
      const from = {
        at: new THREE.Vector3(),
        turn: new THREE.Quaternion(),
        size: 1,
      };
      const twirl = new THREE.Quaternion();
      const up = new THREE.Vector3(0, 1, 0);
      const knobUp = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0),
        Math.PI / 2
      );
      // The lid's flight, from the pop.
      const flight = {
        at: new THREE.Vector3(),
        turn: new THREE.Quaternion(),
        size: new THREE.Vector3(1, 1, 1),
        axis: new THREE.Vector3(...FLIGHT.axis).normalize(),
        spin: new THREE.Quaternion(),
      };
      // The stamp's length, face to knob – it lies on the box's floor.
      const length = 2 * (sticker.userData.half ?? 0.35);
      const inside = Math.min(
        (2 * (PARCEL.box.half - PARCEL.box.wall) * 0.85) / 1,
        ((PARCEL.box.height - PARCEL.box.wall) * 0.9) / length
      );

      // Its programs compiled before the first frame, out of the way.
      await ink.warm(scene, camera).catch(() => undefined);
      if (off) return;

      let size = 0;
      let width = 1;
      // The picture's middle in the window (CSS px) – how much room there is
      // round it, for what flies.
      const middle = { x: 0, y: 0 };
      /** Laid over the picture's box, as large as WIDE of it, turned like it. */
      const follow = () => {
        const target = anchored();
        if (!target) return;
        width = target.offsetWidth || width;
        const rect = target.getBoundingClientRect();
        middle.x = rect.left + rect.width / 2;
        middle.y = rect.top + rect.height / 2;
        const next = Math.round(width * WIDE);
        if (next !== size && next > 0) {
          size = next;
          renderer.setSize(size, size);
        }
        box.style.left = `${rect.left + rect.width / 2 - size / 2}px`;
        box.style.top = `${rect.top + rect.height / 2 - size / 2}px`;
        box.style.width = `${size}px`;
        box.style.height = `${size}px`;
        box.style.transform = `rotate(${turned()}deg)`;
      };

      /** Room from the picture's middle to the window's edges (units). */
      const room = () => {
        const perUnit = width / view;
        return {
          up: middle.y / perUnit,
          left: middle.x / perUnit,
          right: (window.innerWidth - middle.x) / perUnit,
        };
      };
      // The lid's flight and the stamp's hop, fitted to that room at the pop:
      // up and towards the middle of the window, never out of it.
      const velocity = new THREE.Vector3(...FLIGHT.velocity);
      let hop = HOP;

      let start = -1;
      let popped = false;
      let rising = false;
      let ready = false;
      let landed = false;
      void picture.then(() => {
        ready = true;
      });
      const tick = (now: number) => {
        frame = requestAnimationFrame(tick);
        if (start < 0) start = now;
        const t = (now - start) / 1000;
        follow();

        // The parcel: a shiver, squashed down – then it springs back.
        const shake = clamp(t / AT.pop);
        const settle = Math.max(0, t - AT.pop);
        const squash =
          t < AT.pop
            ? 1 - 0.1 * shake * shake
            : 1 - 0.1 * Math.exp(-7 * settle) * Math.cos(14 * settle);
        shiver.setFromAxisAngle(
          around,
          t < AT.pop ? 0.07 * shake * Math.sin(shake * Math.PI * 6) : 0
        );
        parcel.quaternion.copy(posed).premultiply(shiver);
        const fall = span(t, AT.fall);
        const shrink = 1 - fall * fall * fall;
        parcel.scale.set(
          (1 + 0.6 * (1 - squash)) * shrink,
          squash * shrink,
          (1 + 0.6 * (1 - squash)) * shrink
        );
        parcel.position.y = -DROP * fall * fall;
        parcel.visible = shrink > 0.001;

        // How large it lands: as in its picture – or on the drawing, its
        // face as wide as the drawing's.
        const landsAt = flat
          ? (view * (width - 2 * flat.inset)) / (VIEW_BOX * width)
          : 1;

        // The lid flies off.
        if (t >= AT.pop && !popped) {
          popped = true;
          parcel.updateMatrixWorld(true);
          scene.attach(lid);
          flight.at.copy(lid.position);
          flight.turn.copy(lid.quaternion);
          // Off the squashed box, it springs back to its own shape.
          flight.size.set(1, 1, 1);
          burst.position.copy(
            body.localToWorld(new THREE.Vector3(0, PARCEL.box.height, 0))
          );
          const space = room();
          const left = space.left > space.right;
          const reach = PARCEL.lid.half * 1.2;
          const rise = space.up - flight.at.y - reach - 0.1;
          velocity.y = Math.min(
            FLIGHT.velocity[1],
            Math.sqrt(2 * FLIGHT.gravity * Math.max(0.1, rise))
          );
          velocity.x =
            (left ? -1 : 1) *
            Math.min(
              FLIGHT.velocity[0],
              Math.max(
                0.3,
                ((left ? space.left : space.right) - reach) /
                  (FLIGHT.shrink + FLIGHT.gone)
              )
            );
          // Mirrored, it tumbles the other way round.
          if (left)
            flight.axis
              .set(-FLIGHT.axis[0], FLIGHT.axis[1], -FLIGHT.axis[2])
              .normalize();
          // The stamp's hop, its whole size above it, inside the window too
          // – still no larger than its picture up there.
          hop = Math.min(
            HOP,
            Math.max(0.12, space.up - 0.62 * Math.min(landsAt, 1) - 0.1)
          );
        }
        if (popped) {
          const a = t - AT.pop;
          const { x: vx, y: vy, z: vz } = velocity;
          lid.position.set(
            flight.at.x + vx * a,
            flight.at.y + vy * a - (FLIGHT.gravity * a * a) / 2,
            flight.at.z + vz * a
          );
          flight.spin.setFromAxisAngle(flight.axis, FLIGHT.spin * a);
          lid.quaternion.copy(flight.turn).premultiply(flight.spin);
          const away = clamp((a - FLIGHT.shrink) / FLIGHT.gone);
          lid.scale.copy(flight.size).multiplyScalar(1 - away * away);
          lid.visible = away < 1;
        }

        // The sparkles.
        burst.visible = t >= AT.burst && t < AT.burst + 1;
        (burst.material as Three.ShaderMaterial).uniforms.age.value = Math.max(
          0,
          t - AT.burst
        );

        // The stamp: out of the box, round, to where its picture is.
        if (t >= AT.rise[0] && !rising) {
          rising = true;
          parcel.updateMatrixWorld(true);
          nest.getWorldPosition(from.at);
          const parcelTurn = parcel.getWorldQuaternion(new THREE.Quaternion());
          const lift = up.clone().applyQuaternion(parcelTurn);
          from.size = inside * parcel.scale.y;
          from.at.addScaledVector(lift, (length * from.size) / 2);
          from.turn.copy(parcelTurn).multiply(knobUp);
          sticker.visible = true;
        }
        if (rising) {
          const u = easeInOut(span(t, AT.rise));
          const above = hop * Math.sin(Math.PI * span(t, AT.rise));
          sticker.position.set(
            from.at.x * (1 - u),
            from.at.y * (1 - u) + above,
            from.at.z * (1 - u)
          );
          const w = easeInOut(span(t, AT.turn));
          sticker.quaternion.slerpQuaternions(from.turn, end.quaternion, w);
          sticker.quaternion.premultiply(
            twirl.setFromAxisAngle(up, 2 * Math.PI * w)
          );
          const g = backOut(span(t, flat ? AT.growFlat : AT.grow));
          sticker.scale.setScalar(from.size + (landsAt - from.size) * g);
          // Flat on the drawing, its face lies where the drawing does.
          if (flat) pivot(sticker, 1 - w);
          if (glitter) glitter.visible = t > 0.9 && !(flat && t > AT.flat);
        } else if (glitter) glitter.visible = false;

        ink.render(scene, camera, {
          unit: (size * ratio) / (WIDE * view),
          thinnest: 0,
          // Landing on a drawing, it turns into one: its lines go.
          amount: flat ? 1 - span(t, [AT.flat, AT.rise[1]]) : 1,
        });
        if (t === 0) shown();

        // Landed, its picture there: it takes over, and this fades.
        if (!landed && t >= AT.land && ready) {
          landed = true;
          opened();
          box.style.transition = `opacity ${FADE}ms ease-out`;
          box.style.opacity = "0";
          setTimeout(() => {
            if (!off) done();
          }, FADE + 20);
        }
      };
      frame = requestAnimationFrame(tick);
    })().catch(skip);
    return () => {
      off = true;
      cleanup();
    };
  }, [input, paper, flat]);

  return createPortal(
    <div
      aria-hidden="true"
      ref={host}
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        zIndex: 60,
        pointerEvents: "none",
        transformOrigin: "center",
      }}
    />,
    document.body
  );
};

/**
 * Where the sparkles head (up and out, a fan across the top) and how big
 * each is – out of the box's opening (the mesh's place).
 */
const SPARKS: [number, number, number][] = [
  [-0.2, 3.0, 0.11],
  [0.45, 3.5, 0.09],
  [1.1, 2.6, 0.12],
  [1.55, 1.9, 0.08],
  [2.0, 3.2, 0.1],
  [2.5, 2.4, 0.07],
  [2.95, 2.9, 0.1],
  [-0.55, 2.2, 0.07],
  [3.3, 2.0, 0.08],
  [1.8, 4.0, 0.06],
];

const BURST_VERTEX = /* glsl */ `
attribute vec2 corner;
attribute vec3 heading;
attribute float size;
attribute float phase;
uniform float age;
varying vec2 vUv;
void main() {
  // Each a breath after the other – out fast, slowing down.
  float a = max(age - phase * 0.06, 0.0);
  vec3 at = position + heading * (1.0 - exp(-3.4 * a)) / 3.4;
  float x = clamp(a / (0.62 + phase * 0.25), 0.0, 1.0);
  float s = size * sin(3.14159 * x);
  vec4 seen = modelViewMatrix * vec4(at, 1.0);
  float r = phase * 6.2832 + a * 4.0;
  seen.xy += mat2(cos(r), sin(r), -sin(r), cos(r)) * corner * s;
  vUv = corner;
  gl_Position = projectionMatrix * seen;
}
`;

/** The burst: a few sparkles flying out, as on a special stamp (glitter.ts). */
const burstOf = (THREE: typeof Three) => {
  const position: number[] = [];
  const corner: number[] = [];
  const heading: number[] = [];
  const size: number[] = [];
  const phase: number[] = [];
  const index: number[] = [];
  SPARKS.forEach(([angle, speed, s], n) => {
    const dx = Math.cos(angle) * speed;
    const dy = Math.abs(Math.sin(angle)) * speed + 0.4;
    const dz = ((n % 3) - 1) * 0.3;
    for (const [cx, cy] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      position.push(0, 0, 0);
      corner.push(cx, cy);
      heading.push(dx, dy, dz);
      size.push(s);
      phase.push((n * 0.618) % 1);
    }
    const i = n * 4;
    index.push(i, i + 1, i + 2, i, i + 2, i + 3);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(position, 3)
  );
  geometry.setAttribute("corner", new THREE.Float32BufferAttribute(corner, 2));
  geometry.setAttribute(
    "heading",
    new THREE.Float32BufferAttribute(heading, 3)
  );
  geometry.setAttribute("size", new THREE.Float32BufferAttribute(size, 1));
  geometry.setAttribute("phase", new THREE.Float32BufferAttribute(phase, 1));
  geometry.setIndex(index);
  const burst = new THREE.Mesh(
    geometry,
    new THREE.ShaderMaterial({
      vertexShader: BURST_VERTEX,
      fragmentShader: SPARKLE_FRAGMENT,
      // How long they have flown (s).
      uniforms: { age: { value: 0 }, line: inkState.line },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      // Premultiplied, like the ink pass' colors.
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    })
  );
  burst.frustumCulled = false;
  burst.renderOrder = 10;
  burst.layers.set(OVER);
  return burst;
};
