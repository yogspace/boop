/**
 * Moving what is drawn about, the way Figma and Illustrator do it: pick
 * things – what touches is one thing (`groupsOf`) – then move, turn, size,
 * copy or remove them. Plain functions on the drawing's lines and areas; the
 * editor's pointer and keys are in features/app/stamp-drawer/
 * (select-gestures.ts, use-draw-keys.ts).
 *
 * - **Sizing** moves the points – a line keeps its width, like Figma
 *   without “scale strokes”: a stamp's lines stay the pen's widths, and a
 *   doodle made smaller doesn't turn into hairlines.
 * - **The face's square** holds every point: nothing is moved, turned or
 *   sized past the unit square's edge – it stops there (a turn is pushed
 *   back in if it fits). What lies outside the outline but inside the
 *   square doesn't show, and comes back when moved in again.
 *
 * The parts, in arrange/: the selection (selection.ts), what a point or a
 * box picks (picking.ts), the drawing changed (edits.ts), matrices and the
 * selection's frame (transform.ts), moving, turning and sizing on the face
 * (gestures.ts), and the frame's handles (handles.ts).
 */

export {
  addCopies,
  pick,
  remove,
  restroke,
  transformArt,
  widthOf,
  withinLimits,
} from "./arrange/edits";
export {
  fits,
  furthest,
  moveWithin,
  pinching,
  sizing,
  TURN_STEP,
  turning,
} from "./arrange/gestures";
export { type Grip, grip, HANDLES, sizeCursor } from "./arrange/handles";
export {
  grouped,
  groupsOf,
  itemAt,
  thingAt,
  touching,
} from "./arrange/picking";
export {
  boxOf,
  everything,
  isNothing,
  join,
  NOTHING,
  pointsOf,
  type Selection,
  sameSelection,
  toggle,
} from "./arrange/selection";
export {
  apply,
  compose,
  type Frame,
  frameAfter,
  frameAround,
  intoFrame,
  type Matrix,
  outOfFrame,
  sizeIn,
  translate,
  turnAbout,
} from "./arrange/transform";
