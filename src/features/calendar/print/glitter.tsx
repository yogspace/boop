import { useMemo } from "react";
import { cn } from "@/lib/cn";
import type { ColorName } from "../model";
import { outlinePoints } from "../outline";
import { hexOf } from "../palette";
import type { ShapeLike } from "../shapes";
import type { ReadonlyDrawing } from "../stamp-svg";
import { random } from "./random";

/**
 * A special stamp's glitter (stamp-svg.tsx): where on its print it sparkles,
 * and the sparkles and glints laid over it.
 */

type Spot = { x: number; y: number; size: number; delay: number };

/**
 * Where a print glitters: on its ink – the doodle's lines and areas, the rim,
 * an inverted face anywhere – a few sparkles kept apart, glints between
 * them. Every print its own (seed).
 */
const glitterOf = (
  drawing: ReadonlyDrawing,
  shape: ShapeLike,
  seed: number,
  still: boolean
) => {
  const next = random(seed);
  const rim = outlinePoints(shape, 0, 48);
  const doodle: [number, number][] = [];
  if (drawing.inverted) {
    // Anywhere on the face – most of it is ink.
    for (let i = 0; i < 48; i++) {
      const [x, y] = rim[Math.floor(next() * rim.length)];
      const f = 0.9 * Math.sqrt(next());
      doodle.push([0.5 + (x - 0.5) * f, 0.5 + (y - 0.5) * f]);
    }
  } else {
    const rings = [
      ...drawing.strokes.map((stroke) => stroke.p),
      ...(drawing.fills ?? []).flatMap((fill) => fill.p),
    ];
    for (const p of rings) {
      for (let i = 0; i + 1 < p.length; i += 2) doodle.push([p[i], p[i + 1]]);
    }
  }
  const taken: Spot[] = [];
  /** A spot on the ink this far from the others – or the farthest tried. */
  const pick = (size: number, apart: number) => {
    let best: [number, number] = [0.5, 0.5];
    let room = -1;
    for (let i = 0; i < 16; i++) {
      const pool = doodle.length && next() < 0.7 ? doodle : rim;
      const [x, y] = pool[Math.floor(next() * pool.length)];
      const near = Math.min(
        Infinity,
        ...taken.map((s) => Math.hypot(s.x - x, s.y - y))
      );
      if (near > room) {
        best = [x, y];
        room = near;
      }
      if (near >= apart) break;
    }
    const spot = { x: best[0], y: best[1], size, delay: next() };
    taken.push(spot);
    return spot;
  };
  const sparkles = Array.from({ length: still ? 2 : 5 }, (_, i) =>
    pick(0.24 - i * 0.025 - next() * 0.02, 0.28)
  );
  const glints = Array.from({ length: still ? 0 : 5 }, () =>
    pick(0.03 + next() * 0.015, 0.14)
  );
  return { sparkles, glints, phase: next() };
};

/** A four-point sparkle, slim – in a 24 × 24 box. */
const SPARKLE =
  "M12 1.5c.8 6.3 3.4 9.7 10.5 10.5-7.1.8-9.7 4.2-10.5 10.5-.8-6.3-3.4-9.7-10.5-10.5 7.1-.8 9.7-4.2 10.5-10.5Z";

/** A unit length on the face as a share of the print's box (its view box). */
const share = (unit: number) => `${((unit * 100 + 2) / 1.04).toFixed(2)}%`;
const across = (unit: number) => `${((unit * 100) / 1.04).toFixed(2)}%`;

/**
 * The glitter on a special stamp's print – laid over it (StampSvg print) in
 * the same square box, inside whatever multiplies the print onto the page:
 * then white shows only where there is ink. Sparkles, outlined in a dark
 * shade of the ink and filled with a pale one, twinkle out of step – light
 * on the ink, a drawn spark on the paper – with small white glints between
 * them, and now and then a sheen runs over the ink. `still`: a few
 * sparkles, nothing moving (small prints by the dozen – the month). Nothing
 * moves for reduced motion either.
 * Without `sheen` (on a drawing, where nothing multiplies) no light runs.
 *
 * Plain HTML that only changes opacity and transform: the browser moves it
 * on its own, and the print below (its ink filter) is never drawn again.
 */
export const Glitter = ({
  drawing,
  color,
  shape = "circle",
  seed = 7,
  still = false,
  sheen = !still,
  className,
}: {
  drawing: ReadonlyDrawing;
  color: ColorName;
  shape?: ShapeLike;
  seed?: number;
  still?: boolean;
  sheen?: boolean;
  className?: string;
}) => {
  const { sparkles, glints, phase } = useMemo(
    () => glitterOf(drawing, shape, seed, still),
    [drawing, shape, seed, still]
  );
  const hex = hexOf(color);
  const line = `color-mix(in srgb, ${hex} 40%, #141414)`;
  // Light – on the ink a glint, on the paper a pale spark.
  const light = `color-mix(in srgb, ${hex} 22%, white)`;
  const twinkle = still ? "" : "animate-twinkle motion-reduce:animate-none";
  const place = (spot: Spot, duration: number) => ({
    left: share(spot.x - spot.size / 2),
    top: share(spot.y - spot.size / 2),
    width: across(spot.size),
    height: across(spot.size),
    animationDelay: `${(-spot.delay * duration).toFixed(2)}s`,
    animationDuration: `${duration.toFixed(2)}s`,
  });
  const spark = (
    <path
      d={SPARKLE}
      fill={light}
      stroke={line}
      strokeLinejoin="round"
      // Thinner on the small, still ones – or they are all line.
      strokeWidth={still ? 0.9 : 1.6}
      vectorEffect="non-scaling-stroke"
    />
  );
  if (still) {
    // Nothing moves: drawn like the print – the same view box, so it fits
    // over it in any box, square or not.
    return (
      <svg
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 h-full w-full overflow-visible",
          className
        )}
        viewBox="-2 -2 104 104"
      >
        {sparkles.map((spot, i) => (
          <g
            key={`sparkle-${i}`}
            transform={`translate(${(spot.x - spot.size / 2) * 100} ${(spot.y - spot.size / 2) * 100}) scale(${(spot.size * 100) / 24})`}
          >
            {spark}
          </g>
        ))}
      </svg>
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn("pointer-events-none absolute inset-0", className)}
    >
      {sheen && (
        <span className="absolute inset-0 overflow-hidden motion-reduce:hidden">
          <span
            className="absolute inset-0 animate-sheen bg-[linear-gradient(105deg,transparent_32%,rgb(255_255_255/0.55)_50%,transparent_68%)]"
            style={{ animationDelay: `${(-phase * 5).toFixed(2)}s` }}
          />
        </span>
      )}
      {glints.map((spot, i) => (
        <span
          className={cn("absolute rounded-full bg-white", twinkle)}
          key={`glint-${i}`}
          style={place(spot, 1.9 + spot.delay)}
        />
      ))}
      {sparkles.map((spot, i) => (
        <svg
          aria-hidden="true"
          className={cn("absolute overflow-visible", twinkle)}
          key={`sparkle-${i}`}
          style={place(spot, 2.4 + spot.delay)}
          viewBox="0 0 24 24"
        >
          {spark}
        </svg>
      ))}
    </span>
  );
};
