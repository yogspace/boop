import { useId, useMemo } from "react";
import { cn } from "@/lib/cn";
import {
  type ColorName,
  FACE,
  type RimPattern,
  type StampShape,
} from "./model";
import { outlinePath, outlinePoints, type RimLine, rimLine } from "./outline";
import { FINISHES, type Finish, finishOf, hexOf } from "./palette";

/**
 * A stamp flat, as SVG – the drawing while it is being made (its rim and the
 * doodle – lines and filled areas – in its color) and the print it leaves on
 * a day: what stands raised on the rubber – the rim and the doodle – in ink,
 * blotchy and a little frayed, like real ink; a special color's ink in its
 * finish (`FinishPaint`). An inverted stamp is the other way round: its
 * whole face in ink, the doodle cut out of it – and a patterned rim cut in
 * along its edge, which stays solid.
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
const fillPath = (fill: ReadonlyFill) =>
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
  // What the print is inked with: the color – or its finish, if it has one.
  const finish = print ? finishOf(color) : undefined;
  const paint = finish ? `url(#${id}-finish)` : ink;
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
          fill={inverted ? "black" : paint}
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
          stroke={inverted ? "black" : paint}
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
        {finish && (
          <FinishPaint finish={finish} hex={ink} id={`${id}-finish`} />
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
                fill={inverted ? paint : "none"}
                shape={shape}
                stroke={rim && !inverted ? "none" : paint}
                strokeDasharray={
                  drawn || inverted || rim ? undefined : "0.06 0.06"
                }
                strokeWidth={FACE.rim}
              />
              {rim && !inverted && <RimPath line={rim} stroke={paint} />}
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

/**
 * A special color's finish on a print (palette.ts `finishOf`) – what the
 * stamp's ink wears in 3D (stickers/ink.ts), flat: a gradient or a pattern
 * the print's ink is painted with, in the face's unit square (so the same
 * whatever the print's size; `userSpaceOnUse` – a line has no box of its
 * own to fit one into). Calm enough for a month full of them: the ink's own
 * tones, pale light, a few colors only where the finish is made of them.
 */

/** A color as sRGB, 0–1 – and back, as #rrggbb. */
const channels = (hex: string) => {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => c / 255);
};
const toHex = (color: number[]) =>
  `#${color
    .map((c) =>
      Math.round(Math.min(1, Math.max(0, c)) * 255)
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`;

/** One color towards another, by `t`. */
const mixed = (from: string, to: string, t: number) => {
  const b = channels(to);
  return toHex(channels(from).map((c, i) => c + (b[i] - c) * t));
};

/** Paper white – a print's light. */
const PAPER = "#fffdf6";

/** With this much white. */
const lighter = (hex: string, white: number) => mixed(hex, PAPER, white);

/** Deeper and fuller – the ink's dark tone, as in 3D (`deeper` there). */
const deeper = (hex: string, amount = 1) =>
  toHex(
    channels(hex).map((c) => c + (c * (c * 0.75 + 0.25) * 0.85 - c) * amount)
  );

/** A color of the rainbow, 0–1 round. */
const rainbow = (h: number) =>
  toHex(
    [0, 2 / 3, 1 / 3].map((o) =>
      Math.min(1, Math.max(0, Math.abs(((h + o) % 1) * 6 - 3) - 1))
    )
  );

/** Confetti's colors – the paper's white among them. */
const CONFETTI = ["#f2403a", "#ffcc2e", "#28c794", "#45a6ff", "#ff6bb3", PAPER];

/** A five-pointed star round x, y – its points r out. */
const starPath = (x: number, y: number, r: number, turn: number) => {
  let d = "";
  for (let i = 0; i < 10; i++) {
    const a = turn - Math.PI / 2 + (i * Math.PI) / 5;
    const out = i % 2 ? r * 0.45 : r;
    d += `${i ? "L" : "M"}${(x + Math.cos(a) * out).toFixed(4)} ${(y + Math.sin(a) * out).toFixed(4)}`;
  }
  return `${d}Z`;
};

/** A four-pointed sparkle round x, y – its points r out. */
const sparklePath = (x: number, y: number, r: number) => {
  const k = r * 0.22;
  return `M${x} ${y - r}Q${x + k} ${y - k} ${x + r} ${y}Q${x + k} ${y + k} ${x} ${y + r}Q${x - k} ${y + k} ${x - r} ${y}Q${x - k} ${y - k} ${x} ${y - r}Z`;
};

type Spread = { x: number; y: number; r: number };

/**
 * Things spread over a tile at random, each `r` round – with their copies
 * over its edges, so the tile repeats without seams.
 */
const spread = <T extends Spread>(tile: number, make: () => T, count: number) =>
  Array.from({ length: count }, make).flatMap((item) =>
    [-tile, 0, tile].flatMap((dx) =>
      [-tile, 0, tile]
        .map((dy) => ({ ...item, x: item.x + dx, y: item.y + dy }))
        .filter(
          ({ x, y, r }) =>
            x + r > 0 && y + r > 0 && x - r < tile && y - r < tile
        )
    )
  );

/** A line across the face, from left to right – y of x (0–1). */
const wavy = (y: (x: number) => number) => {
  let d = "";
  for (let i = 0; i <= 32; i++) {
    const x = -0.05 + (i / 32) * 1.1;
    d += `${i ? "L" : "M"}${x.toFixed(4)} ${y(x).toFixed(4)}`;
  }
  return d;
};

type Stop = [offset: number, color: string];

const Stops = ({ stops }: { stops: Stop[] }) =>
  stops.map(([offset, color]) => (
    <stop key={`${offset}-${color}`} offset={offset} stopColor={color} />
  ));

/** One tile of a pattern, `size` square, on the ink's ground. */
const Tile = ({
  id,
  size,
  ground,
  children,
}: {
  id: string;
  size: number;
  ground: string;
  children: React.ReactNode;
}) => (
  <pattern height={size} id={id} patternUnits="userSpaceOnUse" width={size}>
    <rect fill={ground} height={size} width={size} />
    {children}
  </pattern>
);

/** The paint of a print in a finish – `id` is what the ink points at. */
const FinishPaint = ({
  id,
  finish,
  hex,
}: {
  id: string;
  finish: Finish;
  hex: string;
}) => {
  // Every print of a color alike: its finish is the color's, not the print's.
  const next = random(FINISHES.indexOf(finish) * 101 + 3);
  switch (finish) {
    case "metal": {
      // Light, the color, its dark – a sharp pale glint – and back again.
      const light = lighter(hex, 0.5);
      const glint = lighter(hex, 0.82);
      const dark = deeper(hex);
      return (
        <linearGradient
          gradientUnits="userSpaceOnUse"
          id={id}
          x1={0.15}
          x2={0.85}
          y1={0}
          y2={1}
        >
          <Stops
            stops={[
              [0, light],
              [0.3, hex],
              [0.47, dark],
              [0.47, glint],
              [0.53, glint],
              [0.53, lighter(hex, 0.3)],
              [0.62, hex],
              [0.82, dark],
              [1, light],
            ]}
          />
        </linearGradient>
      );
    }
    case "holo": {
      // The rainbow, pale, over the color.
      const hues = [0, 0.12, 0.3, 0.5, 0.62, 0.8, 0.95];
      return (
        <linearGradient
          gradientUnits="userSpaceOnUse"
          id={id}
          x1={0}
          x2={1}
          y1={0.1}
          y2={0.9}
        >
          <Stops
            stops={hues.map((h, i) => [
              i / (hues.length - 1),
              mixed(hex, lighter(rainbow(h), 0.4), 0.6),
            ])}
          />
        </linearGradient>
      );
    }
    case "heat": {
      // White-hot in the middle, then yellow, orange – and red at the rim.
      const orange = mixed("#ff730f", hex, 0.12);
      const red = mixed("#d11f12", hex, 0.25);
      return (
        <radialGradient
          cx={0.5}
          cy={0.5}
          gradientUnits="userSpaceOnUse"
          id={id}
          r={0.52}
        >
          <Stops
            stops={[
              [0, "#fff7c7"],
              [0.22, "#fff7c7"],
              [0.22, "#ffd442"],
              [0.48, "#ffd442"],
              [0.48, orange],
              [0.74, orange],
              [0.74, red],
              [1, red],
            ]}
          />
        </radialGradient>
      );
    }
    case "wood": {
      // The grain as in 3D: rings round a middle far below, lighter and
      // darker in turn, bending round a knot.
      const rings = Array.from({ length: 18 }, (_, n) =>
        wavy((x) => {
          const r = (n + 17) / 15;
          const side = 0.5 * (x - 0.2);
          const y = -1.7 + Math.sqrt(Math.max(0, r * r - side * side));
          const knot = Math.hypot(x - 0.66, (y + 0.12) * 1.8);
          return (
            0.5 -
            y +
            0.1 * Math.exp(-knot * knot * 70) -
            0.008 * Math.sin(x * 9 + n * 1.7)
          );
        })
      );
      const dark = deeper(hex);
      return (
        <Tile ground={hex} id={id} size={1}>
          {rings.map(
            (d, n) =>
              n % 2 === 1 && (
                <path
                  d={d}
                  fill="none"
                  key={`band-${d}`}
                  stroke={lighter(hex, 0.18)}
                  strokeWidth={0.03}
                />
              )
          )}
          {rings.map((d) => (
            <path
              d={d}
              fill="none"
              key={`line-${d}`}
              stroke={dark}
              strokeWidth={0.009}
            />
          ))}
          <ellipse cx={0.66} cy={0.62} fill={dark} rx={0.016} ry={0.009} />
          <ellipse
            cx={0.66}
            cy={0.62}
            fill="none"
            rx={0.04}
            ry={0.022}
            stroke={dark}
            strokeWidth={0.008}
          />
        </Tile>
      );
    }
    case "marble": {
      // Soft swirls of its light, fine veins of its dark and light.
      const vein = (from: number, wave: number, phase: number) =>
        wavy(
          (x) =>
            from +
            x * 0.55 +
            wave * Math.sin(x * 7 + phase) +
            wave * 0.5 * Math.sin(x * 17 + phase * 2)
        );
      return (
        <Tile ground={hex} id={id} size={1}>
          {[-0.2, 0.15, 0.48].map((from, i) => (
            <path
              d={vein(from, 0.05, i * 2.1)}
              fill="none"
              key={`swirl-${from}`}
              stroke={lighter(hex, 0.45)}
              strokeLinecap="round"
              strokeOpacity={0.8}
              strokeWidth={0.09}
            />
          ))}
          {[-0.05, 0.3, 0.62].map((from, i) => (
            <path
              d={vein(from, 0.04, i * 1.3 + 1)}
              fill="none"
              key={`dark-${from}`}
              stroke={deeper(hex)}
              strokeWidth={0.012}
            />
          ))}
          {[0.05, 0.4].map((from, i) => (
            <path
              d={vein(from, 0.03, i * 2.7 + 2)}
              fill="none"
              key={`light-${from}`}
              stroke={lighter(hex, 0.7)}
              strokeWidth={0.008}
            />
          ))}
        </Tile>
      );
    }
    case "confetti": {
      // Dots and little strips, turned any way, in cheerful colors.
      const size = 0.25;
      const bits = spread(
        size,
        () => ({
          x: next() * size,
          y: next() * size,
          r: 0.03,
          turn: next() * 180,
          strip: next() < 0.55,
          fill: CONFETTI[Math.floor(next() * CONFETTI.length)],
        }),
        12
      );
      return (
        <Tile ground={hex} id={id} size={size}>
          {bits.map(({ x, y, turn, strip, fill }) =>
            strip ? (
              <rect
                fill={fill}
                height={0.009}
                key={`${x}-${y}`}
                rx={0.003}
                transform={`rotate(${turn.toFixed(1)} ${x} ${y})`}
                width={0.032}
                x={x - 0.016}
                y={y - 0.0045}
              />
            ) : (
              <circle cx={x} cy={y} fill={fill} key={`${x}-${y}`} r={0.008} />
            )
          )}
        </Tile>
      );
    }
    case "stars": {
      // Little stars, white and pale yellow, and a fine dust between them.
      const size = 0.22;
      const stars = spread(
        size,
        () => ({
          x: next() * size,
          y: next() * size,
          r: 0.016 + next() * 0.008,
          turn: (next() - 0.5) * 0.6,
          fill: next() < 0.5 ? PAPER : "#ffe98c",
        }),
        5
      );
      const dust = spread(
        size,
        () => ({ x: next() * size, y: next() * size, r: 0.004 }),
        6
      );
      return (
        <Tile ground={deeper(hex, 0.3)} id={id} size={size}>
          {dust.map(({ x, y, r }) => (
            <circle
              cx={x}
              cy={y}
              fill={lighter(hex, 0.6)}
              key={`${x}-${y}`}
              r={r}
            />
          ))}
          {stars.map(({ x, y, r, turn, fill }) => (
            <path d={starPath(x, y, r, turn)} fill={fill} key={`${x}-${y}`} />
          ))}
        </Tile>
      );
    }
    default: {
      // Glitter: fine dots in the ink's tones – dark, light, pale – a few
      // white, and a few little sparkles.
      const size = 0.2;
      const tones = [deeper(hex), lighter(hex, 0.45), lighter(hex, 0.72)];
      const dots = spread(
        size,
        () => {
          const x = next() * size;
          const y = next() * size;
          const r = 0.004 + next() * 0.007;
          const tone = next();
          return {
            x,
            y,
            r,
            fill:
              tone > 0.94
                ? PAPER
                : tones[tone < 0.38 ? 0 : tone < 0.76 ? 1 : 2],
          };
        },
        150
      );
      return (
        <Tile ground={deeper(hex, 0.18)} id={id} size={size}>
          {dots.map(({ x, y, r, fill }) => (
            <circle cx={x} cy={y} fill={fill} key={`${x}-${y}`} r={r} />
          ))}
          {[
            [0.04, 0.05, 0.016],
            [0.15, 0.12, 0.013],
            [0.09, 0.17, 0.011],
          ].map(([x, y, r]) => (
            <path d={sparklePath(x, y, r)} fill={PAPER} key={`${x}-${y}`} />
          ))}
        </Tile>
      );
    }
  }
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
 * them, and now and then a sheen runs over the ink. `still`: a few sparkles, nothing moving (small prints
 * by the dozen – the month). Nothing moves for reduced motion either.
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
  shape?: StampShape;
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
