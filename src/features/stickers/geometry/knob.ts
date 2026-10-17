import type * as Three from "three";
import { KNOB } from "./measures";
import type { Point } from "./outlines";

/**
 * The knob, turned in one piece like on a lathe (measures.ts `KNOB`): its
 * profile, and the solid turned from it.
 */

/** Points on a circle round `center`, from one angle to another – both in. */
const arc = (
  center: Point,
  radius: number,
  from: number,
  to: number,
  steps: number
) =>
  Array.from({ length: steps + 1 }, (_, i): Point => {
    const a = from + ((to - from) * i) / steps;
    return [center[0] + Math.cos(a) * radius, center[1] + Math.sin(a) * radius];
  });

/**
 * The knob's profile – [radius, height over the plate], from under the foot
 * up to the top of the ball – in pieces: along one the surface runs smooth,
 * between two it has an edge. Lines and arcs that touch each other: the cove
 * at the foot, the neck, the cove under the ball, the ball.
 */
export const knobProfile = (): Point[][] => {
  const { neck, taper, height, ball, squash, foot, lean, sunk, curve } = KNOB;
  // The neck's line, from the plate up – and the way out of it.
  const wide = neck * taper;
  const length = Math.hypot(neck - wide, height);
  const up: Point = [(neck - wide) / length, height / length];
  const out: Point = [up[1], -up[0]];
  // From a cove's middle to where it touches the neck.
  const touch = Math.atan2(-out[1], -out[0]) + 2 * Math.PI;
  // The foot's cove touches the neck and the plate – a hair under its top,
  // so the two cross rather than graze.
  const low = -0.002;
  const along = (foot * (1 - out[1]) + low) / up[1];
  const footAt: Point = [wide + up[0] * along + out[0] * foot, low + foot];
  // The ball, and the way out of it where its underside leans by `lean` –
  // there the other cove meets it.
  const middle = height + ball * 0.6;
  const tall = ball * squash;
  const under = -Math.atan(squash * Math.tan(lean));
  const meet: Point = [ball * Math.cos(under), middle + tall * Math.sin(under)];
  const steep = Math.hypot(Math.cos(under) / ball, Math.sin(under) / tall);
  const off: Point = [
    Math.cos(under) / ball / steep,
    Math.sin(under) / tall / steep,
  ];
  const radius =
    ((meet[0] - wide) * out[0] + meet[1] * out[1]) /
    (1 - (off[0] * out[0] + off[1] * out[1]));
  const coveAt: Point = [meet[0] + off[0] * radius, meet[1] + off[1] * radius];
  return [
    // Inside the plate: its underside and a short wall.
    [
      [0, -sunk],
      [footAt[0], -sunk],
    ],
    [
      [footAt[0], -sunk],
      [footAt[0], low],
    ],
    [
      ...arc(footAt, foot, 1.5 * Math.PI, touch, curve),
      ...arc(coveAt, radius, touch, Math.atan2(-off[1], -off[0]), curve),
      // The ball from there to its top, on the axis.
      ...Array.from({ length: 2 * curve }, (_, i): Point => {
        const a = under + ((Math.PI / 2 - under) * (i + 1)) / (2 * curve);
        return [
          i + 1 < 2 * curve ? ball * Math.cos(a) : 0,
          middle + tall * Math.sin(a),
        ];
      }),
    ],
  ];
};

/**
 * A closed solid turned round the Z axis from the `pieces` of a profile
 * ([radius, height] – the height towards −Z, a stamp's back; a point on the
 * axis closes it). The pieces share no points, so an edge shows between
 * them.
 */
export const turnedSolid = (
  THREE: typeof Three,
  pieces: Point[][],
  steps: number
) => {
  const positions: number[] = [];
  const index: number[] = [];
  for (const piece of pieces) {
    // Each point a ring – on the axis, a single point.
    const rings = piece.map(([radius, height]) => {
      const start = positions.length / 3;
      const round = radius > 1e-9;
      for (let j = 0; j < (round ? steps : 1); j++) {
        const a = (j / steps) * Math.PI * 2;
        positions.push(Math.cos(a) * radius, Math.sin(a) * radius, -height);
      }
      return { start, round };
    });
    for (let i = 0; i + 1 < rings.length; i++) {
      const a = rings[i];
      const b = rings[i + 1];
      for (let j = 0; j < steps; j++) {
        const k = (j + 1) % steps;
        const a0 = a.start + (a.round ? j : 0);
        const a1 = a.start + (a.round ? k : 0);
        const b0 = b.start + (b.round ? j : 0);
        const b1 = b.start + (b.round ? k : 0);
        if (a.round) index.push(a0, b0, a1);
        if (b.round) index.push(a1, b0, b1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
};

/** Where the knob's foot spreads onto the plate – nothing goes nearer. */
export const footOf = () => {
  const [foot] = knobProfile();
  return foot[1][0];
};
