import { useId, useMemo } from "react";
import { cn } from "@/lib/cn";
import {
  type ColorName,
  FACE,
  type RimPattern,
  type StampShape,
} from "./model";
import { outlinePath, outlinePoints, type RimLine, rimLine } from "./outline";
import { hexOf } from "./palette";

/**
 * A stamp flat, as SVG – the drawing while it is being made (its rim and the
 * doodle – lines and filled areas – in its color) and the print it leaves on
 * a day: what stands raised on the rubber – the rim and the doodle – in ink,
 * blotchy and a little frayed, like real ink. An inverted stamp is the other
 * way round: its whole face in ink, the doodle cut out of it – and a
 * patterned rim cut in along its edge, which stays solid.
 *
 * The face lives in the unit square (FACE) but is drawn 100× up: Safari
 * can't run the ink filter in a space one unit wide – the prints vanished.
 */

/** The SVG path of one stroke – quadratic curves through the midpoints. */
export const strokePath = (p: readonly number[]) => {
  if (p.length < 2) return "";
  if (p.length < 6) {
    // A dot or a short line.
    const [x0, y0] = p;
    const x1 = p[p.length - 2];
    const y1 = p[p.length - 1];
    return `M${x0} ${y0}L${x1 === x0 && y1 === y0 ? x1 + 0.0001 : x1} ${y1}`;
  }
  let d = `M${p[0]} ${p[1]}`;
  for (let i = 2; i < p.length - 2; i += 2) {
    const mx = (p[i] + p[i + 2]) / 2;
    const my = (p[i + 1] + p[i + 3]) / 2;
    d += `Q${p[i]} ${p[i + 1]} ${mx.toFixed(4)} ${my.toFixed(4)}`;
  }
  d += `L${p[p.length - 2]} ${p[p.length - 1]}`;
  return d;
};

/** The SVG path of one filled area – each of its outlines, closed. */
export const fillPath = (fill: ReadonlyFill) =>
  fill.p
    // Less than three points enclose nothing.
    .filter((ring) => ring.length >= 6)
    .map((ring) => {
      let d = `M${ring[0]} ${ring[1]}`;
      for (let i = 2; i < ring.length - 1; i += 2) {
        d += `L${ring[i]} ${ring[i + 1]}`;
      }
      return `${d}Z`;
    })
    .join("");

/**
 * The face's outline in the unit square (outline.ts): one path, with the same
 * points for every shape – so changing the shape morphs (CSS transition on
 * `d`; Safari ignores it and simply switches).
 */
const MORPH = "d 460ms cubic-bezier(.3,1.4,.5,1), fill 400ms, stroke 400ms";

export const ShapeOutline = ({
  shape,
  style,
  ...props
}: { shape: StampShape } & React.SVGProps<SVGPathElement>) => {
  const d = outlinePath(shape);
  return (
    <path
      d={d}
      style={
        // `d` as CSS is what transitions – React's types don't know it.
        {
          d: `path("${d}")`,
          transition: MORPH,
          ...style,
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

type ReadonlyFill = {
  readonly p: readonly (readonly number[])[];
  readonly rule?: "evenodd";
};

type ReadonlyDrawing = {
  readonly strokes: readonly {
    readonly w: number;
    readonly p: readonly number[];
  }[];
  readonly fills?: readonly ReadonlyFill[];
  readonly inverted?: boolean;
  readonly rim?: RimPattern;
  readonly special?: boolean;
};

/** The rim's pattern as SVG – one source with the 3D rubber (rimLine). */
const RimPath = ({
  line,
  ...props
}: { line: RimLine } & React.SVGProps<SVGPathElement>) => (
  <path
    d={line.d}
    fill="none"
    strokeLinecap={line.cap}
    strokeLinejoin="round"
    strokeWidth={line.width}
    {...props}
  />
);

export const StampSvg = ({
  drawing,
  color,
  shape = "circle",
  className,
  title,
  print = false,
  seed = 7,
  filled = false,
}: {
  drawing: ReadonlyDrawing | null;
  color: ColorName;
  shape?: StampShape;
  className?: string;
  title?: string;
  /** Inked like a rubber stamp's print – a little imperfect. */
  print?: boolean;
  /** Makes each print's imperfections its own. */
  seed?: number;
  /** The body tinted in its color – the drawing surface. */
  filled?: boolean;
}) => {
  const id = useId();
  const ink = hexOf(color);
  const fade = { transition: "stroke 400ms, fill 400ms" };
  // Something drawn? Lines or filled areas – an empty drawing is none.
  const drawn =
    drawing && (drawing.strokes.length || drawing.fills?.length)
      ? drawing
      : null;
  const inverted = Boolean(drawing?.inverted);
  // A patterned rim – cut into an inverted face. None: the plain outline.
  const rim = drawing?.rim
    ? rimLine(shape, drawing.rim, { cut: inverted })
    : null;
  const pale = `color-mix(in srgb, ${ink} 14%, white)`;
  // The doodle – filled areas below, the lines on top – kept inside the
  // outline. In ink – or, cut out of an inverted face, as the mask's black.
  const doodle = drawn && (
    <g clipPath={`url(#${id}-clip)`}>
      {drawn.fills?.map((fill, i) => (
        <path
          d={fillPath(fill)}
          fill={inverted ? "black" : ink}
          fillRule={fill.rule ?? "nonzero"}
          key={`fill-${i}`}
          style={inverted ? undefined : fade}
        />
      ))}
      {drawn.strokes.map((stroke, i) => (
        <path
          d={strokePath(stroke.p)}
          fill="none"
          key={`stroke-${i}`}
          stroke={inverted ? "black" : ink}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={stroke.w}
          style={inverted ? undefined : fade}
        />
      ))}
    </g>
  );
  const cut = inverted ? `url(#${id}-cut)` : undefined;
  return (
    // Named when given a title (role img), otherwise hidden – decoration.
    // biome-ignore lint/a11y/noSvgWithoutTitle: the title is conditional
    <svg
      aria-hidden={title ? undefined : true}
      className={className}
      role={title ? "img" : undefined}
      viewBox="-2 -2 104 104"
    >
      {title && <title>{title}</title>}
      <defs>
        <clipPath id={`${id}-clip`}>
          <ShapeOutline shape={shape} />
        </clipPath>
        {inverted && (
          // What is left of an inverted face: all but the doodle. In the
          // 100× space, like the filter.
          <mask
            height="116"
            id={`${id}-cut`}
            maskUnits="userSpaceOnUse"
            width="116"
            x="-8"
            y="-8"
          >
            <rect fill="white" height="116" width="116" x="-8" y="-8" />
            <g transform="scale(100)">
              {doodle}
              {rim && <RimPath line={rim} stroke="black" />}
            </g>
          </mask>
        )}
        {print && (
          // Like a real rubber stamp: blotchy coverage, fine grain, frayed
          // edges – and never twice the same (seed). In the 100× space.
          <filter
            colorInterpolationFilters="sRGB"
            filterUnits="userSpaceOnUse"
            height="116"
            id={`${id}-ink`}
            width="116"
            x="-8"
            y="-8"
          >
            <feTurbulence
              baseFrequency="0.026"
              numOctaves="2"
              result="blot"
              seed={seed}
              type="fractalNoise"
            />
            <feTurbulence
              baseFrequency="0.42"
              numOctaves="2"
              result="grain"
              seed={seed + 11}
              type="fractalNoise"
            />
            <feComposite
              in="blot"
              in2="grain"
              k2="0.6"
              k3="0.55"
              operator="arithmetic"
              result="mix"
            />
            <feColorMatrix
              in="mix"
              result="mask"
              type="matrix"
              values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -3.6 3.45"
            />
            <feTurbulence
              baseFrequency="0.11"
              numOctaves="1"
              result="warp"
              seed={seed + 23}
              type="fractalNoise"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="warp"
              result="rough"
              scale="3.5"
              xChannelSelector="R"
              yChannelSelector="G"
            />
            <feComposite in="rough" in2="mask" operator="in" />
          </filter>
        )}
      </defs>
      {print ? (
        // The print: what stands raised on the rubber – the rim and the
        // doodle – in ink; the face around them stays bare. Inverted: the
        // whole face, less the doodle (and the rim's pattern).
        <g filter={`url(#${id}-ink)`} opacity={0.9}>
          <g mask={cut}>
            <g transform="scale(100)">
              <ShapeOutline
                fill={inverted ? ink : "none"}
                shape={shape}
                stroke={rim && !inverted ? "none" : ink}
                strokeDasharray={
                  drawn || inverted || rim ? undefined : "0.06 0.06"
                }
                strokeWidth={FACE.rim}
              />
              {rim && !inverted && <RimPath line={rim} stroke={ink} />}
              {!inverted && doodle}
            </g>
          </g>
        </g>
      ) : (
        <>
          {inverted && filled && (
            // The ground showing through where the doodle is cut out.
            <g transform="scale(100)">
              <ShapeOutline fill={pale} shape={shape} />
            </g>
          )}
          <g mask={cut}>
            <g transform="scale(100)">
              <ShapeOutline
                fill={inverted ? ink : filled ? pale : "none"}
                shape={shape}
                // Under a patterned rim the ground reaches as far as the
                // plain one would – the rubber's edge.
                stroke={rim && !inverted ? (filled ? pale : "none") : ink}
                strokeDasharray={
                  drawn || filled || inverted || rim ? undefined : "0.06 0.06"
                }
                strokeWidth={FACE.rim}
              />
              {rim && !inverted && (
                <RimPath line={rim} stroke={ink} style={fade} />
              )}
              {!inverted && doodle}
            </g>
          </g>
        </>
      )}
    </svg>
  );
};

/** Numbers that look random but come again for the same seed. */
const random = (seed: number) => {
  let state = Math.imul(seed + 1, 2654435761) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

type Spot = { x: number; y: number; size: number; delay: number };

/**
 * Where a print glitters: on its ink – the doodle's lines and areas, the rim,
 * an inverted face anywhere – a few sparkles kept apart, glints between
 * them. Every print its own (seed).
 */
const glitterOf = (
  drawing: ReadonlyDrawing,
  shape: StampShape,
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
  const sparkles = Array.from({ length: still ? 2 : 4 }, (_, i) =>
    pick(0.2 - i * 0.025 - next() * 0.02, 0.3)
  );
  const glints = Array.from({ length: still ? 0 : 5 }, () =>
    pick(0.03 + next() * 0.015, 0.14)
  );
  return { sparkles, glints, sheen: next() };
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
 * shade of the ink, twinkle out of step – white on the ink, a drawn spark
 * on the paper – with small glints between them, and now and then a sheen
 * runs over the ink. `still`: a few sparkles, nothing moving (small prints
 * by the dozen – the month). Nothing moves for reduced motion either.
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
  className,
}: {
  drawing: ReadonlyDrawing;
  color: ColorName;
  shape?: StampShape;
  seed?: number;
  still?: boolean;
  className?: string;
}) => {
  const { sparkles, glints, sheen } = useMemo(
    () => glitterOf(drawing, shape, seed, still),
    [drawing, shape, seed, still]
  );
  const line = `color-mix(in srgb, ${hexOf(color)} 40%, #141414)`;
  const twinkle = still ? "" : "animate-twinkle motion-reduce:animate-none";
  const place = (spot: Spot, duration: number) => ({
    left: share(spot.x - spot.size / 2),
    top: share(spot.y - spot.size / 2),
    width: across(spot.size),
    height: across(spot.size),
    animationDelay: `${(-spot.delay * duration).toFixed(2)}s`,
    animationDuration: `${duration.toFixed(2)}s`,
  });
  return (
    <span
      aria-hidden="true"
      className={cn("pointer-events-none absolute inset-0", className)}
    >
      {!still && (
        <span className="absolute inset-0 overflow-hidden motion-reduce:hidden">
          <span
            className="absolute inset-0 animate-sheen bg-[linear-gradient(105deg,transparent_32%,rgb(255_255_255/0.55)_50%,transparent_68%)]"
            style={{ animationDelay: `${(-sheen * 5).toFixed(2)}s` }}
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
          className={cn("absolute overflow-visible", twinkle)}
          key={`sparkle-${i}`}
          style={place(spot, 2.4 + spot.delay)}
          viewBox="0 0 24 24"
        >
          <path
            d={SPARKLE}
            fill="white"
            stroke={line}
            strokeLinejoin="round"
            strokeWidth={1.4}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      ))}
    </span>
  );
};
