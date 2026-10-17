import type * as Three from "three";
// Relative, not `@/…`: the unit tests import this without the app's aliases.
import type { ColorName } from "../calendar/model";
import { hexOf } from "../calendar/palette";
import { type Part, type Rgb, rgb, tint, toonMaterial } from "./toon/material";

/**
 * The parcel a gift from Boop comes in (cards/gifts.ts, `wrapped`) – drawn
 * like the stamps (ink.ts): a box with its lid on, a ribbon round both and
 * a bow on top, in the gift's color: the paper a light tint of it, as a
 * stamp's block, the ribbon the full color, as its knob. The box is open
 * under the lid – lined inside, so a stamp can rise out of it once the lid
 * is off (unwrap.tsx).
 *
 * Built standing, y up, the box's floor at y = 0 – and then moved so the
 * whole parcel sits round the middle. Its parts by name: `body` (the box
 * and its ribbon), `lid` (lid, ribbon and bow, to fly off) and `nest` (the
 * box's floor, where the stamp lies). `three` is passed in, like build.ts.
 */

/** The parcel's measures, in stamp units (a stamp is one wide). */
export const PARCEL = {
  /** The box: half as wide as it is, how high, its walls and corners. */
  box: { half: 0.38, height: 0.48, wall: 0.026, radius: 0.06 },
  /**
   * The lid: a little wider than the box, reaching this far down over it,
   * its top edge rounded by `bevel`.
   */
  lid: { half: 0.415, height: 0.15, over: 0.11, radius: 0.075, bevel: 0.022 },
  /** The ribbon: half as wide as it is, and how far it stands off. */
  ribbon: { half: 0.062, lift: 0.012 },
  /** The bow: its loops, how thick, the knot in the middle. */
  bow: { loop: 0.115, tube: 0.03, knot: 0.058 },
};

/**
 * How the parcel's picture shows it: turned to show a corner, and seen
 * from a little above – its lid and bow in sight.
 */
const TURN = [0.44, -0.52, 0] as const;

/** How much white the paper takes – a dark color more (build.ts' block). */
const PAPER_TINT = { light: 0.5, dark: 0.7 };

/** A point of a rounded square's outline, and which way it faces out. */
type Rim = { x: number; z: number; nx: number; nz: number };

/** Steps round each of a rounded square's corners. */
const CORNER = 6;

/**
 * A rounded square round the y axis – `half` from the middle to each side,
 * its corners `radius` round – grown by `grow` (negative: shrunk).
 */
const outline = (half: number, radius: number, grow = 0): Rim[] => {
  const rims: Rim[] = [];
  const middle = half - radius;
  const corners = [
    [1, 1],
    [-1, 1],
    [-1, -1],
    [1, -1],
  ];
  corners.forEach(([sx, sz], corner) => {
    for (let i = 0; i <= CORNER; i++) {
      const a = ((corner + i / CORNER) * Math.PI) / 2;
      const nx = Math.cos(a);
      const nz = Math.sin(a);
      rims.push({
        x: sx * middle + (radius + grow) * nx,
        z: sz * middle + (radius + grow) * nz,
        nx,
        nz,
      });
    }
  });
  return rims;
};

/**
 * A ring of the profile swept round a rounded square: grown by `grow`, at
 * height `y` – or, `to: "middle"`, drawn in to the axis – its normal `n` as
 * (out, up).
 */
type Ring = { grow: number; y: number; n: readonly [number, number] } & {
  to?: "middle";
};

/**
 * A rounded square swept along a profile, like a lathe that turns square:
 * each strip of rings in a row is one surface – in its material
 * (`index`). Going up the outside, in over the top and down the inside,
 * its faces look out.
 */
const swept = (
  THREE: typeof Three,
  { half, radius }: { half: number; radius: number },
  strips: readonly { rings: readonly Ring[]; index: number }[]
) => {
  const position: number[] = [];
  const normal: number[] = [];
  const index: number[] = [];
  const geometry = new THREE.BufferGeometry();
  const base = outline(half, radius);
  const count = base.length;
  for (const strip of strips) {
    const start = index.length;
    const first = position.length / 3;
    for (const ring of strip.rings) {
      const rims = outline(half, radius, ring.grow);
      rims.forEach((rim, i) => {
        const middle = ring.to === "middle";
        position.push(middle ? 0 : rim.x, ring.y, middle ? 0 : rim.z);
        const [out, up] = ring.n;
        const length = Math.hypot(out, up) || 1;
        normal.push(
          (base[i].nx * out) / length,
          up / length,
          (base[i].nz * out) / length
        );
      });
    }
    for (let k = 0; k + 1 < strip.rings.length; k++) {
      for (let i = 0; i < count; i++) {
        const j = (i + 1) % count;
        const a = first + k * count + i;
        const b = first + k * count + j;
        const c = first + (k + 1) * count + j;
        const d = first + (k + 1) * count + i;
        index.push(a, d, c, a, c, b);
      }
    }
    geometry.addGroup(start, index.length - start, strip.index);
  }
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(position, 3)
  );
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normal, 3));
  geometry.setIndex(index);
  return geometry;
};

const UP = [0, 1] as const;
const DOWN = [0, -1] as const;
const OUT = [1, 0] as const;
const IN = [-1, 0] as const;

/** The box: open at the top, its walls `wall` thick – paper out, lined in. */
const boxGeometry = (THREE: typeof Three) => {
  const { half, height, wall, radius } = PARCEL.box;
  return swept(THREE, { half, radius }, [
    // Underneath.
    {
      index: 0,
      rings: [
        { grow: 0, y: 0, n: DOWN, to: "middle" },
        { grow: 0, y: 0, n: DOWN },
      ],
    },
    // Round the outside, and over its top edge.
    {
      index: 0,
      rings: [
        { grow: 0, y: 0, n: OUT },
        { grow: 0, y: height, n: OUT },
      ],
    },
    {
      index: 0,
      rings: [
        { grow: 0, y: height, n: UP },
        { grow: -wall, y: height, n: UP },
      ],
    },
    // Inside: down the walls, and the floor.
    {
      index: 1,
      rings: [
        { grow: -wall, y: height, n: IN },
        { grow: -wall, y: wall, n: IN },
      ],
    },
    {
      index: 1,
      rings: [
        { grow: -wall, y: wall, n: UP },
        { grow: -wall, y: wall, n: UP, to: "middle" },
      ],
    },
  ]);
};

/** The lid: closed, its top edge rounded. Its underside at y = 0. */
const lidGeometry = (THREE: typeof Three) => {
  const { half, height, radius, bevel } = PARCEL.lid;
  const round: Ring[] = [];
  for (let i = 0; i <= 4; i++) {
    const a = (i / 4) * (Math.PI / 2);
    round.push({
      grow: -bevel * (1 - Math.cos(a)),
      y: height - bevel + bevel * Math.sin(a),
      n: [Math.cos(a), Math.sin(a)],
    });
  }
  return swept(THREE, { half, radius }, [
    {
      index: 0,
      rings: [
        { grow: 0, y: 0, n: DOWN, to: "middle" },
        { grow: 0, y: 0, n: DOWN },
      ],
    },
    { index: 0, rings: [{ grow: 0, y: 0, n: OUT }, ...round] },
    {
      index: 0,
      rings: [
        { grow: -bevel, y: height, n: UP },
        { grow: -bevel, y: height, n: UP, to: "middle" },
      ],
    },
  ]);
};

/** A flat piece of ribbon – a box this size, here. */
const band = (
  THREE: typeof Three,
  material: Three.Material,
  [w, h, d]: readonly [number, number, number],
  [x, y, z]: readonly [number, number, number]
) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  return mesh;
};

/**
 * The ribbon round a square of `half`, from `bottom` up – `high` tall – on
 * all four sides, in the middle of each.
 */
const ribbonRound = (
  THREE: typeof Three,
  material: Three.Material,
  half: number,
  bottom: number,
  high: number
) => {
  const { half: width, lift } = PARCEL.ribbon;
  const out = half + lift / 2;
  const y = bottom + high / 2;
  return [
    band(THREE, material, [2 * width, high, lift], [0, y, out]),
    band(THREE, material, [2 * width, high, lift], [0, y, -out]),
    band(THREE, material, [lift, high, 2 * width], [out, y, 0]),
    band(THREE, material, [lift, high, 2 * width], [-out, y, 0]),
  ];
};

/**
 * The bow, standing on the lid at y = 0: two loops leaning out and a little
 * back, a knot between them, two ends lying forward on the lid.
 */
const bowOf = (THREE: typeof Three, material: Three.Material) => {
  const { loop, tube, knot } = PARCEL.bow;
  const { lift } = PARCEL.ribbon;
  const bow = new THREE.Group();
  const middle = new THREE.Mesh(
    new THREE.SphereGeometry(knot, 18, 12),
    material
  );
  middle.scale.set(1.2, 0.8, 1);
  middle.position.y = knot * 0.6;
  bow.add(middle);
  for (const side of [1, -1]) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(loop, tube, 10, 36),
      material
    );
    // A band, not a cord: flat across.
    ring.scale.set(1.3, 0.85, 1.7);
    ring.rotation.set(0, side * 0.42, side * 0.5);
    ring.position.set(side * (loop * 1.12 + knot * 0.35), loop * 0.62, 0);
    bow.add(ring);
    const end = band(
      THREE,
      material,
      [0.07, lift, 0.2],
      [side * 0.07, lift * 1.6, 0.11]
    );
    end.rotation.y = side * 0.55;
    bow.add(end);
  }
  return bow;
};

/** The paper's color and the ribbon's, for a stamp color. */
const colorsOf = (THREE: typeof Three, color: ColorName) => {
  const hex = hexOf(color);
  const dark = new THREE.Color(hex).getHSL({ h: 0, s: 0, l: 0 }).l < 0.25;
  const paper = tint(hex, dark ? PAPER_TINT.dark : PAPER_TINT.light);
  const lining = paper.map((c) => c * 0.8) as unknown as Rgb;
  return { paper, lining, ribbon: rgb(hex) };
};

/** The parcel for a gift in this color – standing, round the middle. */
export const buildParcel = (THREE: typeof Three, color: ColorName) => {
  const colors = colorsOf(THREE, color);
  const material = (part: Part, rgbColor: Rgb) =>
    toonMaterial(THREE, part, rgbColor);
  const { box, lid: lidSize } = PARCEL;

  const body = new THREE.Group();
  body.name = "body";
  body.add(
    new THREE.Mesh(boxGeometry(THREE), [
      material("paper", colors.paper),
      material("lining", colors.lining),
    ])
  );
  body.add(
    ...ribbonRound(
      THREE,
      material("ribbon", colors.ribbon),
      box.half,
      0,
      box.height
    )
  );
  // Where a stamp lies in it – on the floor, in the middle.
  const nest = new THREE.Object3D();
  nest.name = "nest";
  nest.position.y = box.wall;
  body.add(nest);

  const lid = new THREE.Group();
  lid.name = "lid";
  const bottom = box.height - lidSize.over;
  const lidRibbon = material("lidRibbon", colors.ribbon);
  lid.add(new THREE.Mesh(lidGeometry(THREE), [material("lid", colors.paper)]));
  const { half: width, lift } = PARCEL.ribbon;
  const across = 2 * (lidSize.half + lift);
  lid.add(
    ...ribbonRound(THREE, lidRibbon, lidSize.half, 0, lidSize.height + lift),
    band(
      THREE,
      lidRibbon,
      [across, lift, 2 * width],
      [0, lidSize.height + lift / 2, 0]
    ),
    band(
      THREE,
      lidRibbon,
      [2 * width, lift, across],
      [0, lidSize.height + lift / 2, 0]
    )
  );
  const bow = bowOf(THREE, material("bow", colors.ribbon));
  bow.position.y = lidSize.height + lift;
  lid.add(bow);
  lid.position.y = bottom;

  // All of it round the middle – so it turns about that.
  const parcel = new THREE.Group();
  parcel.add(body, lid);
  const bounds = new THREE.Box3().setFromObject(parcel);
  const centre = bounds.getCenter(new THREE.Vector3());
  parcel.position.set(-centre.x, -centre.y, -centre.z);
  const holder = new THREE.Group();
  holder.add(parcel);
  poseParcel(holder);
  return holder;
};

/** Turns a parcel as its picture shows it. */
export const poseParcel = (holder: Three.Object3D) => {
  const [x, y, z] = TURN;
  holder.rotation.set(x, y, z);
};
