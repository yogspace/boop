import type { ColorName, Drawing, StampShape } from "@/features/calendar/model";

/**
 * A few stamps drawn by code – for the front page, the forms and cards, the
 * share images and the CMS's previews. Same format as drawn ones: strokes of
 * points in the unit square. Their colors and shapes are keys of those the
 * code knows (palette.ts, shapes.ts) – one the CMS no longer has shows as
 * its first, like any stamp's.
 */

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** A closed or open curve from a function of t (0–1). */
const curve = (
  f: (t: number) => [number, number],
  steps = 64,
  w = 0.06
): Drawing["strokes"][number] => {
  const p: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const [x, y] = f(i / steps);
    p.push(r3(x), r3(y));
  }
  return { w, p };
};

const heart: Drawing = {
  v: 1,
  strokes: [
    curve((t) => {
      const a = t * Math.PI * 2;
      const x = 16 * Math.sin(a) ** 3;
      const y =
        13 * Math.cos(a) -
        5 * Math.cos(2 * a) -
        2 * Math.cos(3 * a) -
        Math.cos(4 * a);
      return [0.5 + x / 42, 0.47 - y / 42];
    }, 90),
  ],
};

const star: Drawing = {
  v: 1,
  strokes: [
    (() => {
      const p: number[] = [];
      for (let i = 0; i <= 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 ? 0.15 : 0.33;
        p.push(r3(0.5 + Math.cos(a) * r), r3(0.53 + Math.sin(a) * r));
      }
      return { w: 0.06, p };
    })(),
  ],
};

const smile: Drawing = {
  v: 1,
  strokes: [
    { w: 0.08, p: [0.37, 0.38, 0.37, 0.4] },
    { w: 0.08, p: [0.63, 0.38, 0.63, 0.4] },
    curve((t) => {
      const a = Math.PI * (0.15 + 0.7 * t);
      return [0.5 + Math.cos(a) * 0.2, 0.5 + Math.sin(a) * 0.14];
    }, 24),
  ],
};

const flower: Drawing = {
  v: 1,
  strokes: [
    curve(
      (t) => {
        const a = t * Math.PI * 2;
        const r = 0.12 + 0.2 * Math.abs(Math.cos(2.5 * a));
        return [0.5 + Math.cos(a) * r, 0.5 + Math.sin(a) * r];
      },
      140,
      0.05
    ),
    curve(
      (t) => {
        const a = t * Math.PI * 2;
        return [0.5 + Math.cos(a) * 0.05, 0.5 + Math.sin(a) * 0.05];
      },
      20,
      0.05
    ),
  ],
};

const sun: Drawing = {
  v: 1,
  strokes: [
    curve((t) => {
      const a = t * Math.PI * 2;
      return [0.5 + Math.cos(a) * 0.14, 0.5 + Math.sin(a) * 0.14];
    }, 40),
    ...Array.from({ length: 8 }, (_, i) => {
      const a = (i * Math.PI) / 4;
      return {
        w: 0.06,
        p: [
          r3(0.5 + Math.cos(a) * 0.23),
          r3(0.5 + Math.sin(a) * 0.23),
          r3(0.5 + Math.cos(a) * 0.32),
          r3(0.5 + Math.sin(a) * 0.32),
        ],
      };
    }),
  ],
};

const cloud: Drawing = {
  v: 1,
  strokes: [
    curve((t) => {
      const a = t * Math.PI * 2;
      const bump = 1 + 0.18 * Math.max(0, Math.sin(a * 4 + 0.6));
      return [0.5 + Math.cos(a) * 0.3 * bump, 0.53 + Math.sin(a) * 0.17 * bump];
    }, 120),
  ],
};

export type DemoStamp = {
  key: string;
  shape: StampShape;
  color: ColorName;
  drawing: Drawing;
};

export const DEMO_STAMPS: DemoStamp[] = [
  { key: "heart", shape: "circle", color: "pink", drawing: heart },
  { key: "star", shape: "square", color: "sun", drawing: star },
  { key: "smile", shape: "circle", color: "sky", drawing: smile },
  { key: "flower", shape: "square", color: "grape", drawing: flower },
  { key: "sun", shape: "circle", color: "coral", drawing: sun },
  { key: "cloud", shape: "square", color: "mint", drawing: cloud },
];

export const demoStamp = (key: string) =>
  DEMO_STAMPS.find((stamp) => stamp.key === key) ?? DEMO_STAMPS[0];
