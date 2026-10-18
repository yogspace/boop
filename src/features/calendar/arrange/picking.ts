import {
  type Art,
  type Box,
  distanceSq,
  edgeDistanceSq,
  fillBox,
  insideFill,
  overlaps,
  ringsOf,
  samplesOf,
  spans,
  strokeBox,
} from "../art";
import { isNothing, type Selection } from "./selection";

/**
 * What a pointer or a dragged box picks – always whole things: what
 * touches is one thing (`groupsOf`).
 */

/** The grid on which touching is decided – 1/256 of the face. */
const GRID = 256;

type Groups = { strokes: Int32Array; fills: Int32Array };
const known = new WeakMap<Art, Groups>();

/**
 * Which thing each line and area belongs to – what touches, or touches
 * something that touches, is one thing: laid on a fine grid, a line as far
 * as its round edge reaches, an area inside and along its outline; two that
 * share a cell are one. Worked out once per
 * drawing (a drawing never changes – a change is a new one).
 */
export const groupsOf = (art: Art): Groups => {
  const hit = known.get(art);
  if (hit) return hit;
  const count = art.fills.length + art.strokes.length;
  const parent = Int32Array.from({ length: count }, (_, i) => i);
  const find = (item: number) => {
    let root = item;
    while (parent[root] !== root) {
      parent[root] = parent[parent[root]];
      root = parent[root];
    }
    return root;
  };
  const owner = new Int32Array(GRID * GRID).fill(-1);
  const mark = (cx: number, cy: number, item: number) => {
    if (cx < 0 || cy < 0 || cx >= GRID || cy >= GRID) return;
    const cell = cy * GRID + cx;
    const other = owner[cell];
    if (other < 0) owner[cell] = item;
    else if (other !== item) parent[find(other)] = find(item);
  };
  art.fills.forEach((fill, item) => {
    const box = fillBox(fill);
    // Inside: the cells whose middle it covers…
    const top = Math.max(0, Math.floor(box.y0 * GRID));
    const bottom = Math.min(GRID - 1, Math.floor(box.y1 * GRID));
    for (let cy = top; cy <= bottom; cy++) {
      for (const [a, b] of spans(fill, (cy + 0.5) / GRID)) {
        for (let cx = Math.ceil(a * GRID - 0.5); cx + 0.5 <= b * GRID; cx++) {
          mark(cx, cy, item);
        }
      }
    }
    // …and every cell its outline passes – thin bits too.
    for (const ring of ringsOf(fill)) {
      const n = Math.floor(ring.length / 2);
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const ax = ring[2 * j];
        const ay = ring[2 * j + 1];
        const bx = ring[2 * i];
        const by = ring[2 * i + 1];
        const parts = Math.max(
          1,
          Math.ceil(Math.hypot(bx - ax, by - ay) * GRID * 2)
        );
        for (let s = 0; s <= parts; s++) {
          mark(
            Math.floor((ax + ((bx - ax) * s) / parts) * GRID),
            Math.floor((ay + ((by - ay) * s) / parts) * GRID),
            item
          );
        }
      }
    }
  });
  art.strokes.forEach((stroke, index) => {
    const item = art.fills.length + index;
    const points = samplesOf(stroke);
    // A cell counts when the line's round edge reaches it.
    const reach = stroke.w / 2 + 0.71 / GRID;
    const spacing = Math.max(1 / GRID, stroke.w / 4);
    let ax = points[0];
    let ay = points[1];
    const band = (bx: number, by: number) => {
      const x0 = Math.floor((Math.min(ax, bx) - reach) * GRID);
      const x1 = Math.ceil((Math.max(ax, bx) + reach) * GRID);
      const y0 = Math.floor((Math.min(ay, by) - reach) * GRID);
      const y1 = Math.ceil((Math.max(ay, by) + reach) * GRID);
      for (let cy = Math.max(0, y0); cy <= Math.min(GRID - 1, y1); cy++) {
        for (let cx = Math.max(0, x0); cx <= Math.min(GRID - 1, x1); cx++) {
          const d = distanceSq(
            (cx + 0.5) / GRID,
            (cy + 0.5) / GRID,
            ax,
            ay,
            bx,
            by
          );
          if (d <= reach * reach) mark(cx, cy, item);
        }
      }
    };
    if (points.length <= 2) band(ax, ay);
    for (let k = 2; k < points.length; k += 2) {
      const bx = points[k];
      const by = points[k + 1];
      const end = k + 2 >= points.length;
      if (!end && (bx - ax) ** 2 + (by - ay) ** 2 < spacing * spacing) continue;
      band(bx, by);
      ax = bx;
      ay = by;
    }
  });
  const groups = {
    fills: Int32Array.from(art.fills, (_, i) => find(i)),
    strokes: Int32Array.from(art.strokes, (_, i) => find(art.fills.length + i)),
  };
  known.set(art, groups);
  return groups;
};

/** The selection grown to whole things – all that touches what is in it. */
export const grouped = (art: Art, selection: Selection): Selection => {
  const groups = groupsOf(art);
  const roots = new Set([
    ...selection.strokes.map((i) => groups.strokes[i]),
    ...selection.fills.map((i) => groups.fills[i]),
  ]);
  return {
    strokes: art.strokes.flatMap((_, i) =>
      roots.has(groups.strokes[i]) ? [i] : []
    ),
    fills: art.fills.flatMap((_, i) => (roots.has(groups.fills[i]) ? [i] : [])),
  };
};

/** Whether a point is within `reach` of a line's points as drawn. */
const nearLine = (points: number[], x: number, y: number, reach: number) => {
  const sq = reach * reach;
  if (points.length <= 2) {
    return (points[0] - x) ** 2 + (points[1] - y) ** 2 <= sq;
  }
  for (let k = 2; k < points.length; k += 2) {
    const d = distanceSq(
      x,
      y,
      points[k - 2],
      points[k - 1],
      points[k],
      points[k + 1]
    );
    if (d <= sq) return true;
  }
  return false;
};

/**
 * The line or area under a point – the topmost (lines lie over areas, the
 * later over the earlier), `tolerance` around it – or null.
 */
export const itemAt = (
  art: Art,
  x: number,
  y: number,
  tolerance: number
): Selection | null => {
  const spot = { x0: x, y0: y, x1: x, y1: y };
  for (let i = art.strokes.length - 1; i >= 0; i--) {
    const stroke = art.strokes[i];
    if (!overlaps(strokeBox(stroke), spot, tolerance)) continue;
    if (nearLine(samplesOf(stroke), x, y, stroke.w / 2 + tolerance)) {
      return { strokes: [i], fills: [] };
    }
  }
  for (let i = art.fills.length - 1; i >= 0; i--) {
    const fill = art.fills[i];
    if (!overlaps(fillBox(fill), spot, tolerance)) continue;
    if (
      insideFill(fill, x, y) ||
      edgeDistanceSq(fill, x, y) <= tolerance * tolerance
    ) {
      return { strokes: [], fills: [i] };
    }
  }
  return null;
};

/** The whole thing under a point – or null. */
export const thingAt = (art: Art, x: number, y: number, tolerance: number) => {
  const item = itemAt(art, x, y, tolerance);
  return item && grouped(art, item);
};

/** Whether the segment a–b runs through a box (Liang–Barsky). */
const crossesBox = (
  ax: number,
  ay: number,
  bx: number,
  by: number,
  box: Box
) => {
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dy = by - ay;
  for (const [p, q] of [
    [-dx, ax - box.x0],
    [dx, box.x1 - ax],
    [-dy, ay - box.y0],
    [dy, box.y1 - ay],
  ]) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return false;
  }
  return true;
};

/**
 * Everything a dragged box touches, as whole things – like Figma, touching
 * is enough – or null.
 */
export const touching = (art: Art, box: Box): Selection | null => {
  const strokes = art.strokes.flatMap((stroke, i) => {
    if (!overlaps(strokeBox(stroke), box)) return [];
    const r = stroke.w / 2;
    const points = samplesOf(stroke);
    for (let k = 0; k + 1 < points.length; k += 2) {
      const dx = Math.max(box.x0 - points[k], 0, points[k] - box.x1);
      const dy = Math.max(box.y0 - points[k + 1], 0, points[k + 1] - box.y1);
      if (dx * dx + dy * dy <= r * r) return [i];
    }
    return [];
  });
  const fills = art.fills.flatMap((fill, i) => {
    if (!overlaps(fillBox(fill), box)) return [];
    for (const ring of ringsOf(fill)) {
      const n = Math.floor(ring.length / 2);
      for (let a = 0, b = n - 1; a < n; b = a++) {
        if (
          crossesBox(
            ring[2 * b],
            ring[2 * b + 1],
            ring[2 * a],
            ring[2 * a + 1],
            box
          )
        ) {
          return [i];
        }
      }
    }
    // No outline in it – unless the box lies inside the area.
    return insideFill(fill, box.x0, box.y0) ? [i] : [];
  });
  const hit = { strokes, fills };
  return isNothing(hit) ? null : grouped(art, hit);
};
