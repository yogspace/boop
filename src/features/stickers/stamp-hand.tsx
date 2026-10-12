"use client";

import { type Ref, useEffect, useImperativeHandle, useState } from "react";
import type * as Three from "three";
import type { ColorName } from "@/features/calendar/model";
import {
  buildSticker,
  disposeSticker,
  paintSticker,
  pivot,
  type StickerInput,
  stage,
} from "./build";

/**
 * The stamp in your hand, live in 3D. Carried, it is a small companion of
 * the pointer – upright, parked up-left of it, swinging a little as it goes;
 * the spot the pointer is on stays free. Pressed, it flies to that spot,
 * grows to its real size and tips over onto the page – seen from above now,
 * its back to you, its outline right where the print will be – touches,
 * squashes a little, and goes back to the pointer's side, small again.
 * Turned (`turn()`), it spins about its own axis: pressed, it lies exactly
 * as the print does.
 *
 * One small canvas that travels along – fixed, on the body itself, so no
 * sheet clips it – moved and drawn without React, through the ref:
 * `point()`, `hide()`, `press()`, `turn()`. It only draws while something
 * moves.
 */

export type StampHandle = {
  /** The pointer is here (client px) – the stamp keeps to its side. */
  point: (x: number, y: number) => void;
  /** The pointer went elsewhere – the stamp goes too. */
  hide: () => void;
  /**
   * Onto this spot and back – `contact` runs as it touches (at once without
   * WebGL or with reduced motion). It stays beside the spot until it is
   * pointed elsewhere. A press still on its way down when the next one
   * comes lands right away – every press touches.
   */
  press: (x: number, y: number, contact: () => void) => void;
  /**
   * Turned like a print with this `rotation` (degrees, clockwise) – it spins
   * there the shortest way round.
   */
  turn: (degrees: number) => void;
};

/** Carried: upright, knob up, seen from a little above. */
const HELD = Math.PI / 2 + 0.42;
/** Pressed: face down on the page, seen from straight above. */
const FLAT = Math.PI;
/**
 * Turned about its axis so the top of its doodle points up the page, like
 * its print's. (From above, the rubber is the print mirrored left to right –
 * as on any stamp.)
 */
const FACING = Math.PI;
/** Flat already when it is this far down (0–1) – the rest is the push. */
const FLAT_BY = 0.85;
/** Carried, it is this much of its real size … */
const SMALL = 0.42;
/**
 * … and its foot stands here from the pointer, in print widths: up-left, its
 * lower right corner just short of the pointer.
 */
const PARK = { x: -0.28, y: -0.15 };
/** How high it stands over its shadow while carried (of its own size). */
const LIFT = 0.1;
/** What it swings around: a point up its body, where the fingers are. */
const GRIP = 0.5;
/** The canvas: this many print widths square, the stamp's foot in the middle. */
const SPAN = 2.5;
/**
 * The camera: far off with a long lens – pressed, the stamp's outline is the
 * print's, not the wider one of whatever is nearest.
 */
const DISTANCE = 8;
/** A press (ms): to the page, on it, back to the pointer's side. */
const DOWN = 190;
const TOUCH = 70;
const UP = 270;
/** How much flatter – and wider – it gets while it touches. */
const SQUASH = 0.1;
/** Leaning into the way it is carried: radians per print width a second. */
const LEAN = 0.045;
const NOD = 0.02;
const MAX_LEAN = 0.4;
/** Following the pointer: quick, never past it (rad/s). */
const FOLLOW = 34;
/** Swinging back upright: looser – it sways past a little. */
const SWING = { pull: 16 * 16, damping: 2 * 0.38 * 16 };
/** Spinning to a new angle: the same feel, a bit firmer. */
const SPIN = { pull: 22 * 22, damping: 2 * 0.5 * 22 };
/** Carried, it also turns about itself – this much of its lean. */
const TWIST = 0.35;
/** Fading in and out (s), and how long it waits before it goes (ms). */
const FADE_IN = 0.12;
const FADE_OUT = 0.09;
const LINGER = 90;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const mix = (from: number, to: number, amount: number) =>
  from + (to - from) * amount;

/** A critically damped spring, exact for any step: where and how fast. */
const follow = (at: number, speed: number, to: number, dt: number) => {
  const off = at - to;
  const pull = speed + FOLLOW * off;
  const decay = Math.exp(-FOLLOW * dt);
  return [
    to + (off + pull * dt) * decay,
    (speed - FOLLOW * pull * dt) * decay,
  ] as const;
};

/** A loose spring – the swing, the spin – in small steps. */
const sway = (
  at: number,
  speed: number,
  to: number,
  dt: number,
  spring = SWING
) => {
  let a = at;
  let v = speed;
  for (let left = dt; left > 1e-5; left -= 1 / 240) {
    const step = Math.min(left, 1 / 240);
    v += (spring.pull * (to - a) - spring.damping * v) * step;
    a += v * step;
  }
  return [a, v] as const;
};

/** Down: it picks up speed and is still moving as it arrives. */
const drive = (t: number) => t * t * (2.2 - 1.2 * t);
/** Tipping over: slow, fast, slow. */
const ease = (t: number) => t * t * (3 - 2 * t);
/** Back: quick at first, a touch past the end, settled. */
const settle = (t: number) => 1 + 2 * (t - 1) ** 3 + (t - 1) ** 2;

type View = {
  THREE: typeof Three;
  renderer: Three.WebGLRenderer;
  scene: Three.Scene;
  camera: Three.PerspectiveCamera;
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

type Press = {
  x: number;
  y: number;
  start: number;
  /** Where it was, and how far pressed (0–1), when it set off. */
  from: { x: number; y: number; pressed: number };
  /** What happens as it touches – null once it has. */
  contact: (() => void) | null;
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
 * The hand itself – no React in here. The scene: the stamp standing on its
 * shadow, tipped as it is held (`tilt`) – or right over, onto the page, which
 * is the screen then. Its foot is the middle of the box; the box goes where
 * the stamp is: beside the pointer, or on its way to the spot and back.
 */
const createHand = () => {
  let view: View | null = null;
  let opening: Promise<View | null> | null = null;
  /** Counts the stamps taken – a slow build must not land in a later hand. */
  let taken = 0;
  let unit = 100;
  let ink: ColorName = "ink";
  let frame = 0;
  let last = 0;
  const still =
    typeof matchMedia === "function"
      ? matchMedia("(prefers-reduced-motion: reduce)")
      : null;

  // The pointer, and what follows it (client px, px/s) – the stamp is
  // parked beside that.
  let px = 0;
  let py = 0;
  let x = 0;
  let y = 0;
  let vx = 0;
  let vy = 0;
  // Leaning sideways and nodding, with their speeds.
  let lean = 0;
  let leanSpeed = 0;
  let nod = 0;
  let nodSpeed = 0;
  // Spun about its axis (radians) – and where that is heading.
  let spin = 0;
  let spinSpeed = 0;
  let spinTo = 0;
  // Where its foot is right now, and how far pressed (0 carried – 1 down).
  let at = { x: 0, y: 0 };
  let pressed = 0;
  // Wanted on screen, how much of it is there (0–1), when it is to go.
  let shown = false;
  let presence = 0;
  let hideAt = 0;
  let press: Press | null = null;

  /** Where the stamp is parked when the pointer is here. */
  const beside = (toX: number, toY: number) => ({
    x: toX + PARK.x * unit,
    y: toY + PARK.y * unit,
  });

  const make = async (): Promise<View> => {
    const THREE = await import("three");
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.setSize(SPAN * unit, SPAN * unit);
    const { scene, camera } = await stage(THREE, renderer);
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
    // Just under the face when it touches.
    shadow.position.z = 0.004;
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
    return {
      THREE,
      renderer,
      scene,
      camera,
      box,
      body,
      tilt,
      grip,
      seat,
      shadow,
      sticker: null,
    };
  };

  /** The one canvas – made when the first stamp is taken. */
  const open = () => {
    if (!opening) {
      // No WebGL: no hand – the prints still appear (press()).
      const mine = make().catch(() => null);
      opening = mine;
      void mine.then((made) => {
        if (opening === mine) view = made;
      });
    }
    return opening;
  };

  const close = (old: View) => {
    if (old.sticker) disposeSticker(old.sticker);
    old.shadow.geometry.dispose();
    old.shadow.material.map?.dispose();
    old.shadow.material.dispose();
    old.scene.environment?.dispose();
    old.renderer.dispose();
    old.renderer.forceContextLoss();
    old.box.remove();
  };

  /** A press on its way down touches now. */
  const land = () => {
    const contact = press?.contact;
    if (!(press && contact)) return;
    press.contact = null;
    contact();
  };

  /** Right beside the pointer, upright, turned – no gliding in from before. */
  const jump = () => {
    x = px;
    y = py;
    vx = 0;
    vy = 0;
    lean = 0;
    leanSpeed = 0;
    nod = 0;
    nodSpeed = 0;
    spin = spinTo;
    spinSpeed = 0;
    at = beside(x, y);
    pressed = 0;
  };

  const draw = (squash: number) => {
    if (!view) return;
    const { renderer, scene, camera, box, sticker } = view;
    if (!sticker || presence < 0.004) {
      box.style.opacity = "0";
      return;
    }
    const size = SPAN * unit;
    box.style.opacity = presence.toFixed(3);
    box.style.transform = `translate3d(${(at.x - size / 2).toFixed(2)}px, ${(at.y - size / 2).toFixed(2)}px, 0)`;
    // How far down, for what must be exact as it touches (a springy way
    // back may run a touch past carried).
    const down = clamp(pressed, 0, 1);
    view.body.scale.setScalar(mix(SMALL, 1, pressed));
    // It tips over a little ahead of the rest – it comes down flat.
    view.tilt.rotation.x = mix(
      HELD,
      FLAT,
      pressed < 0 ? pressed : ease(Math.min(1, down / FLAT_BY))
    );
    // The stamp's axis is the tilt's −Z: up is towards the knob.
    view.grip.position.z = -(LIFT * (1 - down) + GRIP);
    view.grip.rotation.set(nod * (1 - down), lean * (1 - down), 0);
    view.seat.scale.set(1 + squash / 2, 1 + squash / 2, 1 - squash);
    // Turned as its print lies – exactly so once it is down; carried, a
    // little with the lean too.
    sticker.rotation.z =
      FACING + mix(spin, spinTo, down) + lean * (1 - down) * TWIST;
    // The shadow tightens and darkens as the stamp comes down.
    view.shadow.scale.setScalar(0.9 - 0.12 * down);
    view.shadow.material.opacity = 0.3 + 0.22 * down;
    renderer.render(scene, camera);
  };

  const tick = (now: number) => {
    frame = 0;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    const calm = Boolean(still?.matches);

    if (hideAt && now >= hideAt && !press) {
      shown = false;
      hideAt = 0;
    }
    const goal = shown && view?.sticker ? 1 : 0;
    if (calm) presence = goal;
    else if (presence < goal) presence = Math.min(1, presence + dt / FADE_IN);
    else if (presence > goal) presence = Math.max(0, presence - dt / FADE_OUT);

    // What follows the pointer – the stamp is parked beside it.
    if (calm) {
      x = px;
      y = py;
      vx = 0;
      vy = 0;
    } else {
      [x, vx] = follow(x, vx, px, dt);
      [y, vy] = follow(y, vy, py, dt);
    }
    const parked = beside(x, y);

    // A press: to the spot (growing, tipping over), on the page (squashed),
    // back beside the pointer – wherever that is by now.
    let squash = 0;
    if (press) {
      const t = Math.max(0, now - press.start);
      const { from } = press;
      const down = DOWN * clamp(1 - from.pressed, 0.35, 1);
      if (t < down) {
        const e = drive(t / down);
        pressed = mix(from.pressed, 1, e);
        at = { x: mix(from.x, press.x, e), y: mix(from.y, press.y, e) };
      } else {
        land();
        if (t < down + TOUCH) {
          pressed = 1;
          squash = SQUASH * Math.sin((Math.PI * (t - down)) / TOUCH);
          at = { x: press.x, y: press.y };
        } else if (t < down + TOUCH + UP) {
          const e = settle((t - down - TOUCH) / UP);
          pressed = 1 - e;
          at = { x: mix(press.x, parked.x, e), y: mix(press.y, parked.y, e) };
        } else press = null;
      }
    }
    if (!press) {
      pressed = 0;
      at = parked;
    }

    // Carried along, the knob leads and the face trails.
    const leanTo = clamp((-vx / unit) * LEAN, -MAX_LEAN, MAX_LEAN);
    const nodTo = clamp((vy / unit) * NOD, -MAX_LEAN, MAX_LEAN) / 2;
    [lean, leanSpeed] = sway(lean, leanSpeed, leanTo, dt);
    [nod, nodSpeed] = sway(nod, nodSpeed, nodTo, dt);
    [spin, spinSpeed] = sway(spin, spinSpeed, spinTo, dt, SPIN);

    const moving =
      Boolean(press) ||
      hideAt > 0 ||
      presence !== goal ||
      Math.abs(x - px) + Math.abs(y - py) > 0.3 ||
      Math.abs(vx) + Math.abs(vy) > 2 ||
      Math.abs(lean) + Math.abs(nod) > 0.001 ||
      Math.abs(leanSpeed) + Math.abs(nodSpeed) > 0.01 ||
      Math.abs(spin - spinTo) > 0.001 ||
      Math.abs(spinSpeed) > 0.01;
    if (calm || !moving) jump();

    draw(squash);
    if (moving && presence + goal > 0) frame = requestAnimationFrame(tick);
    else last = 0;
  };

  const wake = () => {
    if (!frame) frame = requestAnimationFrame(tick);
  };

  return {
    point: (toX: number, toY: number) => {
      px = toX;
      py = toY;
      hideAt = 0;
      if (!shown && presence < 0.05 && !press) jump();
      shown = true;
      wake();
    },

    hide: () => {
      if (!shown || hideAt) return;
      hideAt = performance.now() + LINGER;
      wake();
    },

    press: (toX: number, toY: number, contact: () => void) => {
      if (!view?.sticker) {
        contact();
        return;
      }
      land();
      // Afterwards it is beside this spot – a finger doesn't point first,
      // and then the stamp is simply there as it taps.
      px = toX;
      py = toY;
      if (presence < 0.05 || still?.matches) jump();
      shown = true;
      hideAt = 0;
      if (still?.matches) {
        // No flight: the print is simply there.
        press = null;
        contact();
      } else {
        press = {
          x: toX,
          y: toY,
          start: performance.now(),
          from: { ...at, pressed: clamp(pressed, 0, 1) },
          contact,
        };
      }
      wake();
    },

    turn: (degrees: number) => {
      const to = (degrees * Math.PI) / 180;
      // The shortest way round from where it is heading.
      spinTo += Math.atan2(Math.sin(to - spinTo), Math.cos(to - spinTo));
      if (presence < 0.05) {
        spin = spinTo;
        spinSpeed = 0;
      }
      wake();
    },

    /** Takes this stamp (or none) – built once, inked as the hand is. */
    hold: (stamp: StickerInput | null) => {
      const mine = ++taken;
      land();
      press = null;
      if (view?.sticker) {
        view.seat.remove(view.sticker);
        disposeSticker(view.sticker);
        view.sticker = null;
      }
      if (!stamp) {
        shown = false;
        hideAt = 0;
        presence = 0;
        if (view) view.box.style.opacity = "0";
        return;
      }
      void open().then((made) => {
        if (!made || mine !== taken) return;
        const sticker = buildSticker(made.THREE, stamp);
        // Turning – and squashing – around the middle of its face.
        pivot(sticker, 0);
        paintSticker(made.THREE, sticker, ink);
        made.seat.add(sticker);
        made.sticker = sticker;
        wake();
      });
    },

    /** Dips the rubber into this ink. */
    paint: (next: ColorName) => {
      ink = next;
      if (!view?.sticker) return;
      paintSticker(view.THREE, view.sticker, next);
      wake();
    },

    /** One print width on the page, in px. */
    resize: (next: number) => {
      if (!(next > 0) || next === unit) return;
      unit = next;
      view?.renderer.setSize(SPAN * unit, SPAN * unit);
      wake();
    },

    dispose: () => {
      taken++;
      land();
      press = null;
      shown = false;
      presence = 0;
      cancelAnimationFrame(frame);
      frame = 0;
      last = 0;
      const old = opening;
      opening = null;
      view = null;
      void old?.then((made) => made && close(made));
    },
  };
};

export const StampHand = ({
  stamp,
  ink,
  unit,
  ref,
}: {
  /** The stamp in hand – null: none, nothing shows. */
  stamp: StickerInput | null;
  /** The ink its rubber carries. */
  ink: ColorName;
  /** One print width where it stamps, in px – pressed, its face is that wide. */
  unit: number;
  ref?: Ref<StampHandle>;
}) => {
  const [hand] = useState(createHand);
  useImperativeHandle(
    ref,
    () => ({
      point: hand.point,
      hide: hand.hide,
      press: hand.press,
      turn: hand.turn,
    }),
    [hand]
  );

  useEffect(() => () => hand.dispose(), [hand]);
  useEffect(() => hand.resize(unit), [hand, unit]);
  useEffect(() => hand.paint(ink), [hand, ink]);

  const shape = stamp?.shape;
  const color = stamp?.color;
  const drawing = stamp?.drawing;
  useEffect(() => {
    hand.hold(
      shape && color ? { shape, color, drawing: drawing ?? null } : null
    );
  }, [hand, shape, color, drawing]);

  return null;
};
