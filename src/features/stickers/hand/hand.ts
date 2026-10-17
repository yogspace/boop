import type { ColorName } from "@/features/calendar/model";
import { colorKeys } from "@/features/calendar/palette";
import {
  disposeSticker,
  paintSticker,
  pivot,
  type StickerInput,
} from "../build";
import { addGlitter } from "../glitter";
import { buildSoftly } from "../render";
import {
  BEAT,
  clamp,
  ease,
  FADE_AWAY,
  FADE_IN,
  FADE_OUT,
  FLAT,
  FLAT_BY,
  facingOf,
  follow,
  GRIP,
  HELD,
  HOP,
  hop,
  LEAN,
  LIFT,
  LINGER,
  MAX_LEAN,
  mix,
  NOD,
  PARK,
  RAISE,
  rise,
  SMALL,
  SPIN,
  SQUASH,
  settle,
  slam,
  sway,
  TWIST,
} from "./motion";
import { closeView, openView, SPAN, type View } from "./view";

/**
 * The stamp in hand (stamp-hand.tsx), a frame at a time while something
 * moves: where it is, how far pressed, how it leans and spins, and the
 * stamp it holds – built softly, inked as the hand is.
 */

/** A press under way: onto this spot (client px), since `start`. */
type Press = {
  x: number;
  y: number;
  start: number;
  /** Where it was, and how far pressed (0–1), when it set off. */
  from: { x: number; y: number; pressed: number };
  /** What happens as it touches – null once it has. */
  contact: (() => void) | null;
  /** Back beside the spot afterwards – else it goes as it comes off. */
  stay: boolean;
};

/**
 * The hand itself – no React in here. The scene: the stamp standing on its
 * shadow, tipped as it is held (`tilt`) – or right over, onto the page, which
 * is the screen then. Its foot is the middle of the box; the box goes where
 * the stamp is: beside the pointer, or on its way to the spot and back.
 */
export const createHand = () => {
  let view: View | null = null;
  let opening: Promise<View | null> | null = null;
  /** Counts the stamps taken – a slow build must not land in a later hand. */
  let taken = 0;
  let unit = 100;
  // Until it is dipped (`paint`): the default ink.
  let ink: ColorName = colorKeys()[0];
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
  // How it is held to match its print (facingOf), spun about its axis
  // (radians) – and where that is heading.
  let facing = 0;
  let spin = 0;
  let spinSpeed = 0;
  let spinTo = 0;
  // Where its foot is right now, how far pressed (0 carried – 1 flat over
  // the page), and how high over the page (0 on it – 1 lifted for the blow).
  let at = { x: 0, y: 0 };
  let pressed = 0;
  let high = 0;
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
    return openView(THREE, unit);
  };

  /** A press on its way down touches now. */
  const land = () => {
    const contact = press?.contact;
    if (!(press && contact)) return;
    press.contact = null;
    contact();
  };

  /**
   * Something scrolled – the page, a sheet: the canvas is fixed and stays,
   * what it was beside or over went on. So the stamp lets go: a press on
   * its way still leaves its print, and it is gone – until it is pointed
   * somewhere again.
   */
  const drop = () => {
    if (!(shown || press)) return;
    land();
    press = null;
    shown = false;
    hideAt = 0;
    wake();
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
      // Whatever scrolls, wherever: scrolling doesn't bubble, but it can be
      // caught on its way down.
      window.addEventListener("scroll", drop, { capture: true, passive: true });
    }
    return opening;
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
    high = 0;
  };

  const draw = (squash: number) => {
    if (!view) return;
    const { renderer, scene, camera, ink, box, sticker } = view;
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
    // Lifted it is nearer – bigger; on the page exactly its print's size.
    view.body.scale.setScalar(mix(SMALL, 1, pressed) * (1 + RAISE * high));
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
      facing + mix(spin, spinTo, down) + lean * (1 - down) * TWIST;
    // The shadow tightens under the stamp as it comes down – and spreads,
    // paler, while it is lifted for the blow.
    view.shadow.scale.setScalar((0.9 - 0.18 * down) * (1 + 0.5 * high));
    view.shadow.material.opacity = (0.3 + 0.06 * down) * (1 - 0.5 * high);
    // Lines as wide as on a picture of a stamp this big; glitter twinkles
    // while it moves.
    ink.render(scene, camera, {
      unit: renderer.getPixelRatio() * unit * view.body.scale.x,
      time: performance.now() / 1000,
      twinkle: !still?.matches,
    });
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
    // Going while still at a press: taken away after it, not sent off.
    const out = press ? FADE_AWAY : FADE_OUT;
    if (calm) presence = goal;
    else if (presence < goal) presence = Math.min(1, presence + dt / FADE_IN);
    else if (presence > goal) presence = Math.max(0, presence - dt / out);

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

    // A press, beat by beat: lifted over the spot (bigger, tipping flat),
    // the blow (down to the print's size), on the page (squashed), off it
    // (bigger again), back beside the pointer – wherever that is by now.
    // Where no pointer is to go back to (`stay`), it fades on that last
    // way: come off the page, it is taken away.
    let squash = 0;
    if (press) {
      const { from } = press;
      const spot = { x: press.x, y: press.y };
      let t = Math.max(0, now - press.start);
      if (t < BEAT.rise) {
        const e = rise(t / BEAT.rise);
        pressed = mix(from.pressed, 1, e);
        high = e;
        at = { x: mix(from.x, spot.x, e), y: mix(from.y, spot.y, e) };
      } else if (t < BEAT.rise + BEAT.slam) {
        pressed = 1;
        high = 1 - slam((t - BEAT.rise) / BEAT.slam);
        at = spot;
      } else {
        land();
        t -= BEAT.rise + BEAT.slam;
        if (t < BEAT.touch) {
          pressed = 1;
          high = 0;
          squash = SQUASH * Math.sin((Math.PI * t) / BEAT.touch);
          at = spot;
        } else if (t < BEAT.touch + BEAT.off) {
          pressed = 1;
          high = HOP * hop((t - BEAT.touch) / BEAT.off);
          at = spot;
        } else if (t < BEAT.touch + BEAT.off + BEAT.back) {
          if (!press.stay) shown = false;
          const u = (t - BEAT.touch - BEAT.off) / BEAT.back;
          const e = settle(u);
          pressed = 1 - e;
          high = HOP * (1 - u) ** 2;
          at = { x: mix(spot.x, parked.x, e), y: mix(spot.y, parked.y, e) };
        } else press = null;
      }
    }
    if (!press) {
      pressed = 0;
      high = 0;
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
    // A press runs to its end, seen or not – only then is the next one let.
    if (moving && (press || presence + goal > 0)) {
      frame = requestAnimationFrame(tick);
    } else last = 0;
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
      // A pointer after all – a press under way has somewhere to go back to.
      if (press) press.stay = true;
      wake();
    },

    hide: () => {
      if (!shown || hideAt) return;
      hideAt = performance.now() + LINGER;
      wake();
    },

    press: (toX: number, toY: number, contact: () => void, stay = true) => {
      if (!view?.sticker) {
        contact();
        return true;
      }
      // Still at the last one – this one doesn't happen.
      if (press) return false;
      // It sets off from beside this spot, and comes back there – a finger
      // doesn't point first, and then the stamp is simply there as it taps.
      px = toX;
      py = toY;
      if (presence < 0.05 || still?.matches) jump();
      hideAt = 0;
      if (still?.matches) {
        // No flight: the print is simply there – and the stamp beside it,
        // where it stays.
        shown = stay;
        press = null;
        contact();
      } else {
        shown = true;
        press = {
          x: toX,
          y: toY,
          start: performance.now(),
          from: { ...at, pressed: clamp(pressed, 0, 1) },
          contact,
          stay,
        };
      }
      wake();
      return true;
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
      void open().then(async (made) => {
        if (!made || mine !== taken) return;
        const sticker = await buildSoftly(made.THREE, stamp);
        // Turning – and squashing – around the middle of its face.
        pivot(sticker, 0);
        addGlitter(made.THREE, sticker, stamp);
        await made.ink.warm(sticker, made.camera).catch(() => undefined);
        // Another stamp taken meanwhile, or the hand gone.
        if (mine !== taken || view !== made) {
          disposeSticker(sticker);
          return;
        }
        paintSticker(sticker, ink);
        facing = facingOf(stamp.shape);
        made.seat.add(sticker);
        made.sticker = sticker;
        wake();
      });
    },

    /** Dips the rubber into this ink. */
    paint: (next: ColorName) => {
      ink = next;
      if (!view?.sticker) return;
      paintSticker(view.sticker, next);
      wake();
    },

    /** One print width on the page, in px. */
    resize: (next: number) => {
      if (!(next > 0) || next === unit) return;
      unit = next;
      view?.renderer.setSize(SPAN * unit, SPAN * unit);
      wake();
    },

    /** Gone for good: off the page, its canvas and its WebGL given back. */
    dispose: () => {
      taken++;
      land();
      press = null;
      shown = false;
      presence = 0;
      cancelAnimationFrame(frame);
      frame = 0;
      last = 0;
      window.removeEventListener("scroll", drop, { capture: true });
      const old = opening;
      opening = null;
      view = null;
      void old?.then((made) => made && closeView(made));
    },
  };
};
