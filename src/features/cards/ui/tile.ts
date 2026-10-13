/**
 * Where the prints lie on a card's wallpaper (wallpaper.tsx): one tile,
 * worked out ahead and repeated over the page – scattered, each its own
 * size and a little turned, none on another. The same card always gets the
 * same tile (`seed`: its id). The tile repeats without a seam: a print over
 * its edge comes again on the other side (`withWraps`).
 */

export type TilePrint = {
  /** Its middle in the tile (px). */
  x: number;
  y: number;
  /** How wide it is (px). */
  size: number;
  /** Degrees. */
  turn: number;
  /** Its ink's own blots – a different print every time (stamp-svg.tsx). */
  seed: number;
};

export type TileOptions = {
  /** The tile (px). */
  width: number;
  height: number;
  /** How many prints it tries to hold. */
  count: number;
  /** The smallest and the largest print (px). */
  min: number;
  max: number;
  /** Turned at most this far either way (degrees). */
  turn: number;
  /** Paper between two prints, at least (px). */
  gap: number;
};

export const TILE: TileOptions = {
  width: 600,
  height: 600,
  count: 15,
  min: 56,
  max: 124,
  turn: 22,
  gap: 14,
};

/** A number for a string – the same string, the same number. */
export const seedOf = (text: string) => {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  }
  return hash >>> 0;
};

/** Numbers that look random, 0–1 – the same ones again for the same seed. */
const randomOf = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** How far apart two points are on a tile that repeats – the short way. */
export const wrappedDistance = (
  a: { x: number; y: number },
  b: { x: number; y: number },
  width: number,
  height: number
) => {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return Math.hypot(Math.min(dx, width - dx), Math.min(dy, height - dy));
};

/**
 * The reach of a print from its middle, turned any way – its box's corner,
 * and a little for the ink's frayed edge.
 */
const reachOf = (size: number) => size * 0.55;

/**
 * The prints of one tile: thrown at random, kept where they leave room
 * enough to the others (the tile repeating) – the larger ones first, so
 * the small ones fill in between. Fewer than `count` when no more fit.
 */
export const tileOf = (seed: number, options: TileOptions = TILE) => {
  const { width, height, count, min, max, turn, gap } = options;
  const random = randomOf(seed);
  const sizes = Array.from(
    { length: count },
    () => min + (max - min) * random() ** 1.4
  ).sort((a, b) => b - a);
  const prints: TilePrint[] = [];
  for (const size of sizes) {
    for (let tries = 0; tries < 200; tries++) {
      const at = { x: random() * width, y: random() * height };
      const free = prints.every(
        (other) =>
          wrappedDistance(at, other, width, height) >=
          (size + other.size) / 2 + gap
      );
      if (!free) continue;
      prints.push({
        ...at,
        size,
        turn: (random() * 2 - 1) * turn,
        seed: 1 + Math.floor(random() * 997),
      });
      break;
    }
  }
  return prints;
};

/**
 * The prints to draw on the tile: each one – and again, a tile's width or
 * height away, wherever it reaches over an edge, so the next tile goes on
 * with it.
 */
export const withWraps = (
  prints: readonly TilePrint[],
  width: number,
  height: number
) =>
  prints.flatMap((print) => {
    const reach = reachOf(print.size);
    const copies: TilePrint[] = [];
    for (const dx of [0, -width, width]) {
      for (const dy of [0, -height, height]) {
        const x = print.x + dx;
        const y = print.y + dy;
        if (
          x + reach > 0 &&
          x - reach < width &&
          y + reach > 0 &&
          y - reach < height
        ) {
          copies.push({ ...print, x, y });
        }
      }
    }
    return copies;
  });
