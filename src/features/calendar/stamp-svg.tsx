import { useId } from "react";
import { COLORS, type ColorName, FACE, type StampShape } from "./model";
import { outlinePath } from "./outline";

/**
 * A stamp flat, as SVG – the drawing while it is being made (its rim and the
 * doodle – lines and filled areas – in its color) and the print it leaves on
 * a day: what stands raised on the rubber – the rim and the doodle – in ink,
 * blotchy and a little frayed, like real ink.
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
};

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
  const ink = COLORS[color];
  const fade = { transition: "stroke 400ms, fill 400ms" };
  // Something drawn? Lines or filled areas – an empty drawing is none.
  const drawn =
    drawing && (drawing.strokes.length || drawing.fills?.length)
      ? drawing
      : null;
  // The doodle – filled areas below, the lines on top – kept inside the
  // outline.
  const doodle = drawn && (
    <g clipPath={`url(#${id}-clip)`}>
      {drawn.fills?.map((fill, i) => (
        <path
          d={fillPath(fill)}
          fill={ink}
          fillRule={fill.rule ?? "nonzero"}
          key={`fill-${i}`}
          style={fade}
        />
      ))}
      {drawn.strokes.map((stroke, i) => (
        <path
          d={strokePath(stroke.p)}
          fill="none"
          key={`stroke-${i}`}
          stroke={ink}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={stroke.w}
          style={fade}
        />
      ))}
    </g>
  );
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
        // doodle – in ink; the face around them stays bare.
        <g filter={`url(#${id}-ink)`} opacity={0.9}>
          <g transform="scale(100)">
            <ShapeOutline
              fill="none"
              shape={shape}
              stroke={ink}
              strokeDasharray={drawn ? undefined : "0.06 0.06"}
              strokeWidth={FACE.rim}
            />
            {doodle}
          </g>
        </g>
      ) : (
        <g transform="scale(100)">
          <ShapeOutline
            fill={filled ? `color-mix(in srgb, ${ink} 14%, white)` : "none"}
            shape={shape}
            stroke={ink}
            strokeDasharray={drawn || filled ? undefined : "0.06 0.06"}
            strokeWidth={FACE.rim}
          />
          {doodle}
        </g>
      )}
    </svg>
  );
};
