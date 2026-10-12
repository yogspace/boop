import type * as Three from "three";
import { buildSticker, disposeSticker, type StickerInput } from "./build";
import { addGlitter } from "./glitter";
import {
  openStudio,
  pose,
  SIZE,
  type Studio,
  stickerKey,
  studioLost,
} from "./render";
import { createSwing, spring } from "./swing";

/**
 * A stamp's picture looking at the pointer. While the pointer is over it –
 * or over what it is a part of: a button, a link, a card – or the keyboard's
 * focus is there, the stamp turns its face to you, a little towards the
 * pointer, live in 3D, on a spring. Left alone it swings back to how its
 * picture shows it, and is that picture again.
 *
 * No WebGL canvas of its own for that: it is drawn in the studio (render.ts
 * – the one the pictures come from), frame by frame, and every frame copied
 * onto a plain canvas lying over the picture, which hides meanwhile
 * (`data-live` on the box). The two cross over in a blink, both ways – at
 * rest they show the same, but the browser scales them a touch differently.
 * A stamp's model is built when it first looks and kept a moment after.
 * Only for a mouse – nothing on touch, nothing where less motion is asked
 * for.
 */

/**
 * When a stamp looks: `hover` – while the pointer is over it or the focus on
 * it; `always` – wherever the pointer is on the page (for a few stamps of a
 * scene, not for a list: each keeps its model); `never`.
 */
export type Looks = "hover" | "always" | "never";

/**
 * How far it turns from you to the pointer at most (rad) – a nod, not a
 * turn away: the face never gets squeezed thin.
 */
const MOST = 0.3;
/**
 * The pointer this far from its middle – in widths of the stamp's box –
 * turns it 0.7 of the way; much further off, hardly more.
 */
const REACH: Record<Exclude<Looks, "never">, number> = {
  hover: 0.5,
  always: 2.2,
};
/** Turning to the pointer: a little past it, and back. */
const TO = spring(11, 0.5);
/** Swinging back to rest – softer. */
const BACK = spring(7.5, 0.62);
/** There, as good as: this close (rad) and this slow (rad/s). */
const CLOSE = 0.002;
const SLOW = 0.02;
/** The pointer stays this long (ms) before a stamp looks – not in passing. */
const NOTICE = 70;
/** The picture and the live stamp cross over (ms): in quickly, out softer. */
const CROSS = { in: 70, out: 140 };
/** After building a model the page gets this long (ms) before the next. */
const BREATH = 60;
/** The models of stamps that just looked: this many, this long (ms). */
const SPARE = 2;
const SPARE_FOR = 8000;
/** What a stamp is a part of – pointing at it, the stamp looks. */
const PART_OF = "a, button, [role='button'], .group";

type Aim = { x: number; y: number } | "ahead" | null;

type Live = {
  studio: Studio;
  sticker: Three.Object3D;
  canvas: HTMLCanvasElement;
  paper: CanvasRenderingContext2D;
  /** As its picture shows it – how it is turned, how fast, and where to. */
  rest: Three.Quaternion;
  turn: Three.Quaternion;
  spin: Three.Vector3;
  target: Three.Quaternion;
  /** Where it wants to be, not moving – nothing to draw. */
  still: boolean;
  /** Back at rest, fading into its picture. */
  leaving: boolean;
  /** The canvas fading in or out. */
  fade: Animation | null;
};

type Looker = {
  host: HTMLElement;
  input: StickerInput;
  reach: number;
  /** Its model stays for as long as it is on the page. */
  keeps: boolean;
  /** The point it looks at (client px), straight ahead, or nothing – rest. */
  aim: Aim;
  model: Promise<Three.Object3D> | null;
  notice: ReturnType<typeof setTimeout> | undefined;
  opening: boolean;
  live: Live | null;
  gone: boolean;
};

const media = (query: string) =>
  typeof matchMedia === "function" ? matchMedia(query) : null;
let fine: MediaQueryList | null | undefined;
let calm: MediaQueryList | null | undefined;
/** A mouse to look at, and nobody asking for less motion. */
const able = () => {
  fine ??= media("(hover: hover) and (pointer: fine)");
  calm ??= media("(prefers-reduced-motion: reduce)");
  return Boolean(fine?.matches) && !calm?.matches;
};

// The models put aside, the oldest first.
const spare = new Map<string, Three.Object3D>();
let clearing: ReturnType<typeof setTimeout> | undefined;

const putAside = (key: string, sticker: Three.Object3D) => {
  if (spare.has(key)) {
    disposeSticker(sticker);
    return;
  }
  spare.set(key, sticker);
  for (const [oldest, old] of spare) {
    if (spare.size <= SPARE) break;
    spare.delete(oldest);
    disposeSticker(old);
  }
  clearTimeout(clearing);
  clearing = setTimeout(() => {
    for (const old of spare.values()) disposeSticker(old);
    spare.clear();
  }, SPARE_FOR);
};

// One model after the other, a breath between them.
let bench: Promise<unknown> = Promise.resolve();

/** The stamp's model, posed like its picture – one put aside, or a new one. */
const modelOf = ({ THREE }: Studio, input: StickerInput) => {
  const key = stickerKey(input);
  let built = false;
  const made = bench.then(() => {
    const kept = spare.get(key);
    if (kept) {
      spare.delete(key);
      return kept;
    }
    built = true;
    const sticker = buildSticker(THREE, input);
    addGlitter(THREE, sticker, input);
    pose(sticker, "face");
    return sticker;
  });
  bench = made.then(
    () => built && new Promise((done) => setTimeout(done, BREATH)),
    () => undefined
  );
  return made;
};

/** Gives the looker's model back – unless it keeps it. */
const release = (looker: Looker) => {
  const { model } = looker;
  if (!model || (looker.keeps && !looker.gone)) return;
  looker.model = null;
  const key = stickerKey(looker.input);
  void model.then(
    (sticker) => putAside(key, sticker),
    () => undefined
  );
};

// Those turning right now – one loop for all of them.
const looking = new Set<Looker>();
let swing: ReturnType<typeof createSwing> | null = null;
let across: Three.Vector3 | null = null;
let frame = 0;
let last = 0;

/**
 * Where it is to face: you – face-on – and from there a little towards the
 * pointer; left alone, as in its picture.
 */
const face = ({ aim, host, reach }: Looker, live: Live) => {
  const { target } = live;
  if (!aim) return target.copy(live.rest);
  target.identity();
  if (aim === "ahead" || !across) return target;
  const box = host.getBoundingClientRect();
  const dx = aim.x - (box.left + box.width / 2);
  const dy = aim.y - (box.top + box.height / 2);
  const far = Math.hypot(dx, dy);
  const size = host.offsetWidth * reach;
  if (far < 0.01 || !(size > 0)) return target;
  // Tipped about the line across the way to the pointer.
  const off = far / size;
  return target.setFromAxisAngle(
    across.set(dy / far, dx / far, 0),
    (MOST * off) / Math.hypot(1, off)
  );
};

/** Draws it in the studio, as it is turned, and copies that onto its canvas. */
const draw = ({ studio, sticker, turn, canvas, paper }: Live) => {
  const { renderer, scene, camera, ink, unit } = studio;
  sticker.quaternion.copy(turn);
  scene.add(sticker);
  // Like its picture: no twinkling – nothing changes as the two swap.
  ink.render(scene, camera, { unit });
  scene.remove(sticker);
  paper.clearRect(0, 0, canvas.width, canvas.height);
  paper.drawImage(renderer.domElement, 0, 0, canvas.width, canvas.height);
};

/** The live canvas fades in (1) or out (0) – from wherever it is. */
const crossFade = (live: Live, to: 0 | 1, then: () => void) => {
  const { canvas } = live;
  const from = Number(getComputedStyle(canvas).opacity);
  live.fade?.cancel();
  canvas.style.opacity = String(to);
  const fade = canvas.animate([{ opacity: from }, { opacity: to }], {
    duration: (to ? CROSS.in : CROSS.out) * Math.abs(to - from),
    easing: "ease-out",
  });
  live.fade = fade;
  // Cut short – by the other way, or by the end – it doesn't call.
  fade.finished.then(then, () => undefined);
};

/** Live – over its picture, which hides once it is. */
const enter = (looker: Looker, live: Live) => {
  live.leaving = false;
  crossFade(live, 1, () => {
    looker.host.dataset.live = "";
  });
};

/** At rest again: it fades into its picture, then that is all there is. */
const leave = (looker: Looker, live: Live) => {
  if (live.leaving) return;
  live.leaving = true;
  delete looker.host.dataset.live;
  crossFade(live, 0, () => close(looker));
};

/** Back to the picture – at once. */
const close = (looker: Looker) => {
  const { live } = looker;
  if (!live) return;
  looker.live = null;
  looking.delete(looker);
  delete looker.host.dataset.live;
  live.fade?.cancel();
  live.canvas.remove();
  // Posed like the picture again, for whoever takes it next.
  live.sticker.quaternion.copy(live.rest);
  release(looker);
};

const tick = (now: number) => {
  frame = 0;
  // Seconds since the last frame – never a leap.
  const dt = last ? Math.min(0.05, Math.max(0, now - last) / 1000) : 1 / 60;
  last = now;
  let moving = false;
  for (const looker of looking) {
    const { live } = looker;
    if (!(live && swing) || live.still) continue;
    // The studio is gone: the picture is there – and with the next move of
    // the pointer, a new studio.
    if (studioLost(live.studio)) {
      close(looker);
      continue;
    }
    face(looker, live);
    const pull = looker.aim ? TO : BACK;
    const n = Math.ceil(dt * 240);
    let off = 0;
    for (let i = 0; i < n; i++) {
      off = swing(live.turn, live.spin, live.target, pull, dt / n);
    }
    if (off < CLOSE && live.spin.length() < SLOW) {
      live.turn.copy(live.target);
      live.spin.set(0, 0, 0);
      live.still = true;
    } else moving = true;
    draw(live);
    // At rest, exactly as its picture: that takes over.
    if (live.still && !looker.aim) leave(looker, live);
  }
  if (moving) frame = requestAnimationFrame(tick);
  else last = 0;
};

const wake = () => {
  if (!frame) frame = requestAnimationFrame(tick);
};

/** Its model built, it comes alive – if it still has something to look at. */
const open = async (looker: Looker) => {
  looker.opening = true;
  try {
    const studio = await openStudio();
    looker.model ??= modelOf(studio, looker.input);
    const sticker = await looker.model;
    const { host } = looker;
    // A picture just arrived still pops in: it lands first.
    await Promise.all(
      (host.querySelector("img")?.getAnimations?.() ?? []).map((popping) =>
        popping.finished.catch(() => undefined)
      )
    );
    if (looker.gone || looker.live) return;
    // The box may be stretched (a flex row's height): the picture is
    // contained in it, square and centered – and so is the canvas.
    const size = Math.min(
      SIZE,
      Math.round(
        Math.min(host.clientWidth, host.clientHeight) * window.devicePixelRatio
      )
    );
    const canvas = document.createElement("canvas");
    const paper = canvas.getContext("2d");
    if (!(looker.aim && paper && size > 0)) {
      release(looker);
      return;
    }
    // As big as it shows on screen – the browser has nothing to scale.
    canvas.width = size;
    canvas.height = size;
    paper.imageSmoothingQuality = "high";
    canvas.setAttribute("aria-hidden", "true");
    Object.assign(canvas.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      objectFit: "contain",
      pointerEvents: "none",
      opacity: "0",
    });
    const { THREE } = studio;
    swing ??= createSwing(THREE);
    across ??= new THREE.Vector3();
    const rest = sticker.quaternion.clone();
    const live: Live = {
      studio,
      sticker,
      canvas,
      paper,
      rest,
      turn: rest.clone(),
      spin: new THREE.Vector3(),
      target: rest.clone(),
      still: false,
      leaving: false,
      fade: null,
    };
    // Its first frame is the picture's.
    draw(live);
    host.append(canvas);
    enter(looker, live);
    looker.live = live;
    looking.add(looker);
    wake();
  } catch {
    // No WebGL (anymore): the picture stays as it is.
  } finally {
    looker.opening = false;
  }
};

/** Tells a stamp where to look – or to let go (null). */
const look = (looker: Looker, aim: Aim) => {
  looker.aim = aim;
  const { live } = looker;
  if (live) {
    // Called back on its way into the picture.
    if (aim && live.leaving) enter(looker, live);
    live.still = false;
    wake();
  } else if (!aim) {
    clearTimeout(looker.notice);
    looker.notice = undefined;
  } else if (looker.notice === undefined && !looker.opening) {
    looker.notice = setTimeout(
      () => {
        looker.notice = undefined;
        void open(looker);
      },
      looker.keeps ? 0 : NOTICE
    );
  }
};

// Those that look wherever the pointer is – one listener for all of them.
const everywhere = new Set<Looker>();

const onScreen = ({ host }: Looker) => {
  const box = host.getBoundingClientRect();
  return box.bottom > 0 && box.top < window.innerHeight;
};

const onMove = (event: PointerEvent) => {
  if (event.pointerType === "touch") return;
  const aim = able() ? { x: event.clientX, y: event.clientY } : null;
  for (const looker of everywhere) look(looker, onScreen(looker) ? aim : null);
};

/** Off the page: back to rest. */
const onOut = (event: PointerEvent) => {
  if (event.relatedTarget) return;
  for (const looker of everywhere) look(looker, null);
};

/** The page moved under the pointer. */
const onScroll = () => {
  for (const looker of everywhere) {
    if (looker.aim) look(looker, onScreen(looker) ? looker.aim : null);
  }
};

const watchEverywhere = (looker: Looker) => {
  if (!everywhere.size) {
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerout", onOut);
    window.addEventListener("scroll", onScroll, { passive: true });
  }
  everywhere.add(looker);
  return () => {
    everywhere.delete(looker);
    if (everywhere.size) return;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerout", onOut);
    window.removeEventListener("scroll", onScroll);
  };
};

/** While the pointer is over what the stamp is a part of, or the focus there. */
const watchHover = (looker: Looker) => {
  const zone = looker.host.closest<HTMLElement>(PART_OF) ?? looker.host;
  let over: { x: number; y: number } | null = null;
  let focused = false;
  const update = () => look(looker, over ?? (focused ? "ahead" : null));
  const move = (event: PointerEvent) => {
    if (event.pointerType === "touch" || !able()) return;
    over = { x: event.clientX, y: event.clientY };
    update();
  };
  const leave = () => {
    over = null;
    update();
  };
  // By keyboard there is no pointer: it looks at you.
  const focus = (event: FocusEvent) => {
    focused = able() && (event.target as Element).matches(":focus-visible");
    update();
  };
  const blur = (event: FocusEvent) => {
    focused = focused && zone.contains(event.relatedTarget as Node | null);
    update();
  };
  zone.addEventListener("pointerenter", move);
  zone.addEventListener("pointermove", move, { passive: true });
  zone.addEventListener("pointerleave", leave);
  zone.addEventListener("pointercancel", leave);
  zone.addEventListener("focusin", focus);
  zone.addEventListener("focusout", blur);
  return () => {
    zone.removeEventListener("pointerenter", move);
    zone.removeEventListener("pointermove", move);
    zone.removeEventListener("pointerleave", leave);
    zone.removeEventListener("pointercancel", leave);
    zone.removeEventListener("focusin", focus);
    zone.removeEventListener("focusout", blur);
  };
};

/**
 * Lets the stamp in `host` – the box its picture (an `img`) fills – look.
 * Returns what ends it: at once back to the picture.
 */
export const watchLook = (
  host: HTMLElement,
  input: StickerInput,
  looks: Exclude<Looks, "never">
) => {
  const looker: Looker = {
    host,
    input,
    reach: REACH[looks],
    keeps: looks === "always",
    aim: null,
    model: null,
    notice: undefined,
    opening: false,
    live: null,
    gone: false,
  };
  const unwatch =
    looks === "always" ? watchEverywhere(looker) : watchHover(looker);
  return () => {
    unwatch();
    clearTimeout(looker.notice);
    looker.gone = true;
    looker.aim = null;
    close(looker);
    release(looker);
  };
};
