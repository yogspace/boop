import { outlinePoints } from "@/features/calendar/outline";
import type { ShapeLike } from "@/features/calendar/shapes";

/**
 * How the stamp in hand moves (hand.ts): how it is held carried and pressed,
 * a press beat by beat, and the springs and easings it goes by.
 */

/** Carried: upright, knob up, seen from a little above. */
export const HELD = Math.PI / 2 + 0.42;
/** Pressed: face down on the page, seen from straight above. */
export const FLAT = Math.PI;
/** Flat already when it is this far down (0–1) – the rest is the push. */
export const FLAT_BY = 0.85;
/** Carried, it is this much of its real size … */
export const SMALL = 0.42;
/**
 * … and its foot stands here from the pointer, in print widths: up-left, its
 * lower right corner just short of the pointer.
 */
export const PARK = { x: -0.28, y: -0.15 };
/** How high it stands over its shadow while carried (of its own size). */
export const LIFT = 0.1;
/** What it swings around: a point up its body, where the fingers are. */
export const GRIP = 0.5;
/**
 * A press (ms), beat by beat: up over the spot (the wind-up), down onto the
 * page (the blow), on it, off it again, back to the pointer's side.
 */
export const BEAT = { rise: 200, slam: 90, touch: 80, off: 150, back: 260 };
/**
 * Lifted for the blow it is nearer to you: this much bigger than its print.
 * On the page it is exactly the print's size – that is what makes the blow.
 */
export const RAISE = 0.25;
/** Coming off the page again it rises this much of that. */
export const HOP = 0.5;
/** How much flatter – and wider – it gets while it touches. */
export const SQUASH = 0.1;
/** Leaning into the way it is carried: radians per print width a second. */
export const LEAN = 0.045;
export const NOD = 0.02;
export const MAX_LEAN = 0.4;
/** Following the pointer: quick, never past it (rad/s). */
const FOLLOW = 34;
/** Swinging back upright: looser – it sways past a little. */
export const SWING = { pull: 16 * 16, damping: 2 * 0.38 * 16 };
/** Spinning to a new angle: the same feel, a bit firmer. */
export const SPIN = { pull: 22 * 22, damping: 2 * 0.5 * 22 };
/** Carried, it also turns about itself – this much of its lean. */
export const TWIST = 0.35;
/** Fading in and out (s), and how long it waits before it goes (ms). */
export const FADE_IN = 0.12;
export const FADE_OUT = 0.09;
export const LINGER = 90;
/** Taken away after a press (s): slower – one sees it come off and go. */
export const FADE_AWAY = 0.16;

export const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export const mix = (from: number, to: number, amount: number) =>
  from + (to - from) * amount;

/** A critically damped spring, exact for any step: where and how fast. */
export const follow = (at: number, speed: number, to: number, dt: number) => {
  const off = at - to;
  const pull = speed + FOLLOW * off;
  const decay = Math.exp(-FOLLOW * dt);
  return [
    to + (off + pull * dt) * decay,
    (speed - FOLLOW * pull * dt) * decay,
  ] as const;
};

/** A loose spring – the swing, the spin – in small steps. */
export const sway = (
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

/** Up for the blow: quick at first, hanging at the top. */
export const rise = (t: number) => 1 - (1 - t) ** 3;
/** The blow: still hanging, then all at once. */
export const slam = (t: number) => t ** 3;
/** Off the page: quick at first, slowing. */
export const hop = (t: number) => 1 - (1 - t) ** 2;
/** Tipping over: slow, fast, slow. */
export const ease = (t: number) => t * t * (3 - 2 * t);
/** Back: quick at first, a touch past the end, settled. */
export const settle = (t: number) => 1 + 2 * (t - 1) ** 3 + (t - 1) ** 2;

/**
 * How a stamp is turned about its axis to go down as its print lies. Its
 * back carries “boop”, written to be read with the doodle's top towards
 * you – so that is how it is held wherever the outline is the same upside
 * down. A shape that isn't (a triangle) is held the other way round: its
 * outline over the print's comes first.
 */
export const facingOf = (shape: ShapeLike) => {
  // The points face evenly round, so each has its mirror image in the list.
  const points = outlinePoints(shape, 0, 48);
  const same = points.every(([px, py], i) => {
    const [qx, qy] = points[points.length - 1 - i];
    return Math.abs(px - qx) < 0.001 && Math.abs(py + qy - 1) < 0.001;
  });
  return same ? 0 : Math.PI;
};
