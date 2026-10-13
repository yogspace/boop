import { boxOf, groupsOf, type Selection } from "./arrange";
import type { Art, Box } from "./art";
import { FACE } from "./model";

/**
 * Smart guides, like Figma's: what is moved or sized snaps onto lines that
 * matter – the stamp's middle (centered, the case that counts most), the
 * inner edge of its rim, and the edges and middles of every other thing –
 * when it comes within a few px of one; the line shows while it is there.
 */

/** Lines across the face: upright ones at these x, level ones at these y. */
export type Guides = { x: number[]; y: number[] };

/** The face's own lines: its middle and the rim's inner edge. */
const FACE_LINES = [
  0.5,
  FACE.inset + FACE.rim / 2,
  1 - FACE.inset - FACE.rim / 2,
];

/** A box's lines: its edges and its middle. */
const linesOf = (box: Box) => ({
  x: [box.x0, (box.x0 + box.x1) / 2, box.x1],
  y: [box.y0, (box.y0 + box.y1) / 2, box.y1],
});

/**
 * The lines something picked may snap to: the face's, and those of each
 * other thing (what touches is one – arrange.ts `groupsOf`).
 */
export const guidesFor = (art: Art, picked: Selection): Guides => {
  const guides: Guides = { x: [...FACE_LINES], y: [...FACE_LINES] };
  const groups = groupsOf(art);
  const mine = new Set([
    ...picked.strokes.map((i) => groups.strokes[i]),
    ...picked.fills.map((i) => groups.fills[i]),
  ]);
  const others = new Map<number, Selection>();
  const add = (root: number, kind: "strokes" | "fills", i: number) => {
    if (mine.has(root)) return;
    const thing = others.get(root) ?? { strokes: [], fills: [] };
    thing[kind].push(i);
    others.set(root, thing);
  };
  groups.strokes.forEach((root, i) => {
    add(root, "strokes", i);
  });
  groups.fills.forEach((root, i) => {
    add(root, "fills", i);
  });
  for (const thing of others.values()) {
    const box = boxOf(art, thing);
    if (!box) continue;
    const lines = linesOf(box);
    guides.x.push(...lines.x);
    guides.y.push(...lines.y);
  }
  return guides;
};

/** The nearest pull onto a line within `reach` – what `values` need to move. */
const pull = (values: number[], lines: number[], reach: number) => {
  let best = 0;
  let near = reach;
  for (const value of values) {
    for (const line of lines) {
      const d = line - value;
      if (Math.abs(d) <= near) {
        near = Math.abs(d);
        best = d;
      }
    }
  }
  return best;
};

/** The guide lines a box lies on – edges or middle, to a hair. */
export const linesAt = (box: Box, guides: Guides): Guides => {
  const own = linesOf(box);
  const on = (values: number[], lines: number[]) => [
    ...new Set(
      lines.filter((line) => values.some((v) => Math.abs(v - line) < 1e-6))
    ),
  ];
  return { x: on(own.x, guides.x), y: on(own.y, guides.y) };
};

/**
 * A box moved by (dx, dy), snapped onto the nearest guide within `reach`
 * on each axis it may move along (`free`).
 */
export const snapMove = (
  box: Box,
  dx: number,
  dy: number,
  guides: Guides,
  reach: number,
  free = { x: true, y: true }
): [number, number] => {
  const moved = linesOf({
    x0: box.x0 + dx,
    y0: box.y0 + dy,
    x1: box.x1 + dx,
    y1: box.y1 + dy,
  });
  return [
    dx + (free.x ? pull(moved.x, guides.x, reach) : 0),
    dy + (free.y ? pull(moved.y, guides.y, reach) : 0),
  ];
};

/**
 * A point snapped onto the nearest guide within `reach` on each axis
 * asked for – and the lines it then lies on.
 */
export const snapPoint = (
  x: number,
  y: number,
  guides: Guides,
  reach: number,
  free = { x: true, y: true }
): { x: number; y: number; lines: Guides } => {
  const sx = x + (free.x ? pull([x], guides.x, reach) : 0);
  const sy = y + (free.y ? pull([y], guides.y, reach) : 0);
  return {
    x: sx,
    y: sy,
    lines: {
      x: free.x ? guides.x.filter((line) => Math.abs(line - sx) < 1e-6) : [],
      y: free.y ? guides.y.filter((line) => Math.abs(line - sy) < 1e-6) : [],
    },
  };
};
