import { type Art, round } from "../art";
import { lineStroke } from "../bezier";
import { DRAWING_LIMITS } from "../model";
import { moveWithin } from "./gestures";
import { everything, isNothing, pointsOf, type Selection } from "./selection";
import { apply, type Matrix, translate } from "./transform";

/**
 * The drawing anew, with the picked lines and areas taken out, drawn
 * wider or thinner, moved, or copied – and whether it still fits a stamp.
 */

/** The selection's lines and areas on their own. */
export const pick = (art: Art, selection: Selection): Art => ({
  strokes: selection.strokes.flatMap((i) => art.strokes[i] ?? []),
  fills: selection.fills.flatMap((i) => art.fills[i] ?? []),
});

export const remove = (art: Art, selection: Selection): Art => {
  const lines = new Set(selection.strokes);
  const areas = new Set(selection.fills);
  return {
    strokes: art.strokes.filter((_, i) => !lines.has(i)),
    fills: art.fills.filter((_, i) => !areas.has(i)),
  };
};

/** The width all picked lines share – null when they differ, or none. */
export const widthOf = (art: Art, selection: Selection) => {
  const widths = new Set(selection.strokes.map((i) => art.strokes[i]?.w));
  const [only] = widths;
  return widths.size === 1 && only !== undefined ? only : null;
};

/** The picked lines drawn this wide – areas have no width. */
export const restroke = (art: Art, selection: Selection, w: number): Art => {
  const lines = new Set(selection.strokes);
  return {
    strokes: art.strokes.map((s, i) =>
      lines.has(i) && s.w !== w ? { ...s, w } : s
    ),
    fills: art.fills,
  };
};

/** Whether a drawing keeps within what one stamp may hold. */
export const withinLimits = (art: Art) => {
  const points =
    art.strokes.reduce(
      (sum, s) => sum + (s.p.length + (s.a?.length ?? 0)) / 2,
      0
    ) +
    art.fills.reduce(
      (sum, f) => sum + f.p.reduce((n, ring) => n + ring.length / 2, 0),
      0
    );
  return (
    art.strokes.length <= DRAWING_LIMITS.strokes &&
    art.fills.length <= DRAWING_LIMITS.fills &&
    points <= DRAWING_LIMITS.points
  );
};

/**
 * The selection's points moved – lines keep their width. An anchored line's
 * anchors move, and its points follow from them: it stays an anchored line.
 */
export const transformArt = (
  art: Art,
  selection: Selection,
  m: Matrix
): Art => {
  const lines = new Set(selection.strokes);
  const areas = new Set(selection.fills);
  const move = (p: readonly number[]) => {
    const out: number[] = [];
    for (let i = 0; i + 1 < p.length; i += 2) {
      const [x, y] = apply(m, p[i], p[i + 1]);
      out.push(round(x), round(y));
    }
    return out;
  };
  return {
    strokes: art.strokes.map((s, i) =>
      lines.has(i)
        ? s.a
          ? lineStroke(s.w, move(s.a), s.closed)
          : { ...s, p: move(s.p) }
        : s
    ),
    fills: art.fills.map((f, i) =>
      areas.has(i) ? { ...f, p: f.p.map(move) } : f
    ),
  };
};

/**
 * Copies of some lines and areas laid on top of the drawing, moved by
 * (dx, dy) as far as the face allows, and picked – or null when the
 * drawing would hold more than a stamp may.
 */
export const addCopies = (
  art: Art,
  copies: Art,
  dx: number,
  dy: number
): { art: Art; selection: Selection } | null => {
  const all = everything(copies);
  const [mx, my] = moveWithin(pointsOf(copies, all), dx, dy);
  const moved = transformArt(copies, all, translate(mx, my));
  const next = {
    strokes: [...art.strokes, ...moved.strokes],
    fills: [...art.fills, ...moved.fills],
  };
  if (!withinLimits(next) || isNothing(all)) return null;
  return {
    art: next,
    selection: {
      strokes: moved.strokes.map((_, i) => art.strokes.length + i),
      fills: moved.fills.map((_, i) => art.fills.length + i),
    },
  };
};
