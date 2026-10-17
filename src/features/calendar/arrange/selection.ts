import { type Art, type Box, emptyBox, grow } from "../art";
import { ANCHOR } from "../bezier";

/**
 * A selection as data: put together, toggled with ⇧, and read – its
 * points and the box round them.
 */

/** The lines and areas picked – their places in the drawing, in order. */
export type Selection = { strokes: number[]; fills: number[] };

export const NOTHING: Selection = { strokes: [], fills: [] };

export const isNothing = (selection: Selection) =>
  !(selection.strokes.length || selection.fills.length);

export const sameSelection = (a: Selection, b: Selection) =>
  a.strokes.join() === b.strokes.join() && a.fills.join() === b.fills.join();

const tidy = (list: number[]) => [...new Set(list)].sort((a, b) => a - b);

export const join = (a: Selection, b: Selection): Selection => ({
  strokes: tidy([...a.strokes, ...b.strokes]),
  fills: tidy([...a.fills, ...b.fills]),
});

/** `b` taken out of `a` if `a` holds all of it – else put in (⇧-click). */
export const toggle = (a: Selection, b: Selection): Selection => {
  const has =
    b.strokes.every((i) => a.strokes.includes(i)) &&
    b.fills.every((i) => a.fills.includes(i));
  return has
    ? {
        strokes: a.strokes.filter((i) => !b.strokes.includes(i)),
        fills: a.fills.filter((i) => !b.fills.includes(i)),
      }
    : join(a, b);
};

export const everything = (art: Art): Selection => ({
  strokes: art.strokes.map((_, i) => i),
  fills: art.fills.map((_, i) => i),
});

/**
 * The selection's points, flat pairs – what must stay on the face: of an
 * anchored line its curve and its anchors (its handles may reach beyond,
 * calendar/bezier.ts).
 */
export const pointsOf = (art: Art, selection: Selection) => {
  const out: number[] = [];
  for (const i of selection.strokes) {
    const stroke = art.strokes[i];
    if (!stroke) continue;
    out.push(...stroke.p);
    const a = stroke.a ?? [];
    for (let k = 0; k + 1 < a.length; k += ANCHOR) out.push(a[k], a[k + 1]);
  }
  for (const i of selection.fills) {
    for (const ring of art.fills[i]?.p ?? []) out.push(...ring);
  }
  return out;
};

/** The box round the selection – lines as wide as they are drawn. */
export const boxOf = (art: Art, selection: Selection): Box | null => {
  const box = emptyBox();
  for (const i of selection.strokes) {
    const stroke = art.strokes[i];
    if (!stroke) continue;
    const { p, w } = stroke;
    for (let k = 0; k + 1 < p.length; k += 2) grow(box, p[k], p[k + 1], w / 2);
  }
  for (const i of selection.fills) {
    for (const ring of art.fills[i]?.p ?? []) {
      for (let k = 0; k + 1 < ring.length; k += 2)
        grow(box, ring[k], ring[k + 1]);
    }
  }
  return Number.isFinite(box.x0) ? box : null;
};
