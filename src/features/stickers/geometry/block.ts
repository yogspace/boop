import type * as Three from "three";
// Relative, not `@/…`: the unit tests import this without the app's aliases.
import { corners } from "../../calendar/path";
import type { ShapeLike } from "../../calendar/shapes";
import { BLOCK, RUBBER } from "./measures";
import { localOutline, pointsOf, STRAIGHT } from "./outlines";

/**
 * The block: the shape's outline drawn up into a solid `depth` deep, its
 * edges rounded – `bevel` wide and deep each side, the outline `base` grown
 * at its faces and grown on by `bevel` round its middle. Every ring of it is
 * the outline grown exactly that far (outline.ts), so it never folds, round
 * a hollow either. Flat-shaded, like three.js' own extrusion.
 */
type Solid = { base: number; bevel: number; depth: number };

/** The block's solid: its bevel grows to the rubber's outline. */
export const BLOCK_SOLID: Solid = {
  base: RUBBER.grow - BLOCK.bevel,
  bevel: BLOCK.bevel,
  depth: BLOCK.depth,
};

/** The block's rings, from its back to its front: how far grown, and where. */
export const blockRings = ({ base, bevel, depth }: Solid) => {
  const SEGMENTS = 5;
  const rings: { grow: number; z: number }[] = [];
  for (let b = 0; b <= SEGMENTS; b++) {
    const t = (b / SEGMENTS) * (Math.PI / 2);
    rings.push({ grow: base + bevel * Math.sin(t), z: -bevel * Math.cos(t) });
  }
  for (let b = SEGMENTS; b >= 0; b--) {
    const t = (b / SEGMENTS) * (Math.PI / 2);
    rings.push({
      grow: base + bevel * Math.sin(t),
      z: depth + bevel * Math.cos(t),
    });
  }
  return rings;
};

export const blockSolid = (
  THREE: typeof Three,
  shape: ShapeLike,
  solid: Solid
) => {
  const rings = blockRings(solid);
  const outlines = rings.map(({ grow }) => localOutline(shape, grow));
  const n = pointsOf(shape);
  const positions: number[] = [];
  rings.forEach(({ z }, r) => {
    for (const [x, y] of outlines[r]) positions.push(x, y, z);
  });
  const index: number[] = [];
  for (let r = 0; r + 1 < rings.length; r++) {
    for (let k = 0; k < n; k++) {
      const a = r * n + k;
      const b = r * n + ((k + 1) % n);
      const a1 = a + n;
      const b1 = b + n;
      index.push(a, b, b1, a, b1, a1);
    }
  }
  // The faces: the back one looking down, the front one up – laid between
  // the outline's corners; where it runs straight on, flat fans close up to
  // its every point (no triangle-filler keeps points in a straight row).
  const ring = outlines[0];
  const kept = corners(ring, STRAIGHT);
  const flat = kept.map((k) => new THREE.Vector2(...ring[k]));
  const face: [number, number, number][] = [];
  kept.forEach((from, m) => {
    const to = kept[(m + 1) % kept.length];
    for (let k = (from + 1) % n; k !== to; k = (k + 1) % n) {
      face.push([from, k, (k + 1) % n]);
    }
  });
  for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(flat, [])) {
    const turn =
      (flat[b].x - flat[a].x) * (flat[c].y - flat[a].y) -
      (flat[b].y - flat[a].y) * (flat[c].x - flat[a].x);
    face.push(
      turn > 0 ? [kept[a], kept[b], kept[c]] : [kept[a], kept[c], kept[b]]
    );
  }
  const last = (rings.length - 1) * n;
  for (const [a, b, c] of face)
    index.push(a, c, b, last + a, last + b, last + c);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setIndex(index);
  const faceted = geometry.toNonIndexed();
  geometry.dispose();
  faceted.computeVertexNormals();
  return faceted;
};
