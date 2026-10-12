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
 * The stamp in your hand, live in 3D. It hovers where the pointer is – a
 * touch behind it, swinging as you carry it – and comes down where you tap:
 * it straightens, touches, squashes a little and lifts off again. Its soft
 * shadow on the paper shows where it will land; pressed, the middle of its
 * face is exactly at the pointer. Turned (`turn()`), it spins about its own
 * axis – its face lies just as the print will.
 *
 * One small canvas that travels along – fixed, on the body itself, so no
 * sheet clips it – moved and drawn without React, through the ref:
 * `point()`, `hide()`, `press()`, `turn()`. It only draws while something
 * moves.
 */

export type StampHandle = {
  /** The pointer is here (client px) – the stamp hovers over it. */
  point: (x: number, y: number) => void;
  /** The pointer went elsewhere – the stamp goes too. */
  hide: () => void;
  /**
   * Down onto this spot and up again – `contact` runs as it touches (at
   * once without WebGL or with reduced motion). It stays there, hovering,
   * until it is pointed elsewhere. A press still on its way down when the
   * next one comes lands right away – every press touches.
   */
  press: (x: number, y: number, contact: () => void) => void;
  /**
   * Turned like a print with this `rotation` (degrees, clockwise) – it spins
   * there the shortest way round.
   */
  turn: (degrees: number) => void;
};

/** Held upright: knob up, seen from a little above. */
const TIP = Math.PI / 2 + 0.42;
/**
 * Turned about its axis so the top of its doodle points up the page, like
 * its print's. (From above, the rubber is the print mirrored left to right –
 * as on any stamp.)
 */
const FACING = Math.PI;
/**
 * How high it hovers over the paper, along its axis – in print widths. Well
 * clear of it: what the pointer is on stays in view under the stamp – the
 * preview of the print on the page, an ink pad.
 */
const HOVER = 0.75;
/** Coming into view, it drops in from this much higher. */
const DROP = 0.22;
/** What it swings around: a point up its body, where the fingers are. */
const GRIP = 0.5;
/** The canvas: this many print widths square, the pointer this far down it. */
const SPAN = 3;
const ANCHOR = 0.62;
/** The camera's distance – the look of the other views. */
const DISTANCE = 3;
/** A press (ms): down, on the paper, up again. */
const DOWN = 140;
const TOUCH = 70;
const UP = 240;
/** How much shorter it gets while it touches. */
const SQUASH = 0.09;
/** Leaning into the way it is carried: radians per print width a second. */
const LEAN = 0.045;
const NOD = 0.02;
const MAX_LEAN = 0.42;
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

/** Up to 1 and a little beyond on the way – lifting off with a bounce. */
const bounce = (t: number) => 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2;

type View = {
  THREE: typeof Three;
  renderer: Three.WebGLRenderer;
  scene: Three.Scene;
  camera: Three.PerspectiveCamera;
  /** The canvas' box on the body – what travels with the pointer. */
  box: HTMLDivElement;
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
  /** How high it was when it set off. */
  from: number;
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
    fade.addColorStop(0, "rgba(29, 27, 58, 1)");
    fade.addColorStop(0.45, "rgba(29, 27, 58, 0.55)");
    fade.addColorStop(1, "rgba(29, 27, 58, 0)");
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, 128, 128);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

/**
 * The hand itself – no React in here. The scene: the paper (tipped, so the
 * stamp stands on it knob up), on it the shadow, over it the grip the stamp
 * swings from. The paper's middle is the pointer; the box follows it.
 */
const createHand = () => {
  let view: View | null = null;
  let opening: Promise<View | null> | null = null;
  /** Counts the stamps taken – a slow build must not land in a later hand. */
  let turn = 0;
  let unit = 100;
  let ink: ColorName = "ink";
  let frame = 0;
  let last = 0;
  const still =
    typeof matchMedia === "function"
      ? matchMedia("(prefers-reduced-motion: reduce)")
      : null;

  // The pointer, and the stamp following it (client px, px/s).
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
  // How high it is right now.
  let lift = HOVER;
  // Wanted on screen, how much of it is there (0–1), when it is to go.
  let shown = false;
  let presence = 0;
  let hideAt = 0;
  let press: Press | null = null;

  const make = async (): Promise<View> => {
    const THREE = await import("three");
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.setSize(SPAN * unit, SPAN * unit);
    const { scene, camera } = await stage(THREE, renderer);
    // Wide enough for the whole box; the paper's middle at the anchor.
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(SPAN / 2 / DISTANCE));
    camera.position.set(0, (ANCHOR - 0.5) * SPAN, DISTANCE);
    camera.updateProjectionMatrix();

    const paper = new THREE.Group();
    paper.rotation.x = TIP;
    scene.add(paper);
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
    paper.add(shadow);
    const grip = new THREE.Group();
    const seat = new THREE.Group();
    seat.position.z = GRIP;
    grip.add(seat);
    paper.add(grip);

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
  const land = (stay: boolean) => {
    const contact = press?.contact;
    if (!(press && contact)) return;
    press.contact = null;
    if (stay) {
      // On the paper: exactly there, upright, not going anywhere.
      x = press.x;
      y = press.y;
      vx = 0;
      vy = 0;
      lean = 0;
      leanSpeed = 0;
      nod = 0;
      nodSpeed = 0;
    }
    contact();
  };

  /** Right at the pointer, upright, turned – no gliding in from before. */
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
  };

  const draw = (
    at: { x: number; y: number },
    pose: { lift: number; lean: number; nod: number; squash: number }
  ) => {
    if (!view) return;
    const { renderer, scene, camera, box, grip, seat, shadow, sticker } = view;
    if (!sticker || presence < 0.004) {
      box.style.opacity = "0";
      return;
    }
    const size = SPAN * unit;
    box.style.opacity = presence.toFixed(3);
    box.style.transform = `translate3d(${(at.x - size / 2).toFixed(2)}px, ${(at.y - size * ANCHOR).toFixed(2)}px, 0)`;
    // The stamp's axis is the paper's −Z: up is towards the knob.
    grip.position.z = -(pose.lift + GRIP);
    grip.rotation.set(pose.nod, pose.lean, 0);
    seat.scale.set(1 + pose.squash / 2, 1 + pose.squash / 2, 1 - pose.squash);
    // Turned as its print will lie – and, carried, a little with the lean.
    sticker.rotation.z = FACING + spin + pose.lean * TWIST;
    // The shadow tightens and darkens as the stamp comes down.
    const height = clamp(pose.lift / HOVER, 0, 1.2);
    shadow.scale.setScalar(0.78 + 0.42 * height);
    shadow.material.opacity = 0.55 - 0.36 * Math.min(height, 1);
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

    // A press: down (faster and faster, straightening), on the paper
    // (squashed), up again (a little too far, and back).
    let height = HOVER;
    let squash = 0;
    let straight = 0;
    let pull = 0;
    let onPaper = false;
    let tx = px;
    let ty = py;
    if (press) {
      const t = Math.max(0, now - press.start);
      const down = DOWN * clamp(press.from / HOVER, 0.4, 1.5);
      if (t < down) {
        const k = t / down;
        height = press.from * (1 - k * k);
        straight = k;
        pull = k * k;
        tx = press.x;
        ty = press.y;
      } else {
        land(true);
        if (t < down + TOUCH) {
          height = 0;
          squash = SQUASH * Math.sin((Math.PI * (t - down)) / TOUCH);
          onPaper = true;
        } else if (t < down + TOUCH + UP) {
          height = HOVER * bounce((t - down - TOUCH) / UP);
        } else press = null;
      }
    }
    lift = height;

    if (calm) {
      x = tx;
      y = ty;
      vx = 0;
      vy = 0;
    } else if (!onPaper) {
      [x, vx] = follow(x, vx, tx, dt);
      [y, vy] = follow(y, vy, ty, dt);
    }
    // Carried along, the knob leads and the face trails.
    const leanTo = calm ? 0 : clamp((-vx / unit) * LEAN, -MAX_LEAN, MAX_LEAN);
    const nodTo = calm ? 0 : clamp((vy / unit) * NOD, -MAX_LEAN, MAX_LEAN) / 2;
    [lean, leanSpeed] = sway(lean, leanSpeed, leanTo, dt);
    [nod, nodSpeed] = sway(nod, nodSpeed, nodTo, dt);
    [spin, spinSpeed] = sway(spin, spinSpeed, spinTo, dt, SPIN);
    if (calm) {
      lean = 0;
      leanSpeed = 0;
      nod = 0;
      nodSpeed = 0;
      spin = spinTo;
      spinSpeed = 0;
    }

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
    if (!moving) jump();

    draw(
      // Coming down, it is drawn in to the spot – there as it touches.
      press?.contact
        ? { x: x + (press.x - x) * pull, y: y + (press.y - y) * pull }
        : { x, y },
      {
        // Coming into view it drops in; a press is already on its way.
        lift: height + (press ? 0 : (1 - presence) * DROP),
        lean: lean * (1 - straight),
        nod: nod * (1 - straight),
        squash,
      }
    );
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
      land(false);
      const hidden = presence < 0.05;
      px = toX;
      py = toY;
      shown = true;
      hideAt = 0;
      if (still?.matches) {
        press = null;
        jump();
        contact();
        wake();
        return;
      }
      if (hidden) jump();
      press = {
        x: toX,
        y: toY,
        start: performance.now(),
        from: hidden ? HOVER + DROP : Math.max(lift, 0.02),
        contact,
      };
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
      const mine = ++turn;
      land(false);
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
        if (!made || mine !== turn) return;
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
      turn++;
      land(false);
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
  /** One print width where it stamps, in px – its face is that wide. */
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
