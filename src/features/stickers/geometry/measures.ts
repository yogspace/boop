// Relative, not `@/…`: the unit tests import this without the app's aliases.
import { FACE } from "../../calendar/model";

/**
 * A stamp's measures in 3D (build.ts) – one unit wide, lying on its back:
 * the rubber, the block behind it, the plate on its back and the knob.
 */

/** The rubber: out to the rim's outer edge, its relief this high. */
export const RUBBER = { grow: FACE.rim / 2, thickness: 0.08, relief: 0.035 };
/** The block is flush with the rubber – face-on, only the face shows. */
export const BLOCK = { depth: 0.16, bevel: 0.04 };
/**
 * The knob, turned in one piece like on a lathe: a neck this high – wider at
 * the plate by `taper` – and a ball, flattened to `squash`, sunk into its
 * end. A cove of radius `foot` spreads the neck onto the plate; another runs
 * it into the ball, meeting it where the ball's underside leans out by
 * `lean` – nowhere more, so it prints standing up without supports.
 */
export const KNOB = {
  neck: 0.11,
  taper: 1.35,
  height: 0.24,
  ball: 0.2,
  squash: 0.85,
  foot: 0.05,
  lean: Math.PI / 4,
  /** How far it reaches into the plate. */
  sunk: 0.015,
  /** Steps around, and along each of its curves. */
  steps: 64,
  curve: 12,
};
/**
 * The plate on the back: this size of the stamp – or, where that doesn't fit
 * on its back, this far in from its edge.
 */
export const PLATE = {
  size: 0.78,
  inset: 0.11,
  thickness: 0.02,
  groove: 0.012,
};
