import { useId } from "react";
import { type ColorName, FACE, type RimPattern } from "./model";
import { AfterMorph, MorphOutline } from "./morph-outline";
import { outlinePath, type RimLine, rimLine } from "./outline";
import { type Finish, finishOf, hexOf } from "./palette";
import { FinishPaint } from "./print/finish";
import type { ShapeLike } from "./shapes";

/**
 * A stamp flat, as SVG – the drawing while it is being made (its rim and the
 * doodle – lines and filled areas – in its color) and the print it leaves on
 * a day: what stands raised on the rubber – the rim and the doodle – in ink,
 * blotchy and a little frayed, like real ink; a special color's ink in its
 * finish (print/finish.tsx) – and a special stamp's glitter over it
 * (print/glitter.tsx). An inverted stamp is the other way round: its
 * whole face in ink, the doodle cut out of it – and a patterned rim cut in
 * along its edge, which stays solid.
 *
 * The face lives in the unit square (FACE) but is drawn 100× up: Safari
 * can't run the ink filter in a space one unit wide – the prints vanished.
 */

export { Glitter } from "./print/glitter";

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
 * The face's outline in the unit square (outline.ts): one path – changing
 * the shape morphs where two have as many points (CSS transition on `d`;
 * elsewhere, and in Safari, it simply switches). The drawing being made
 * morphs from any shape to any other (`morph`, morph-outline.tsx).
 */
const MORPH = "d 460ms cubic-bezier(.3,1.4,.5,1), fill 400ms, stroke 400ms";

export const ShapeOutline = ({
  shape,
  style,
  ...props
}: { shape: ShapeLike } & React.SVGProps<SVGPathElement>) => {
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

export type ReadonlyDrawing = {
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
  finish: own,
  morph = false,
}: {
  drawing: ReadonlyDrawing | null;
  color: ColorName;
  /** Its shape's key – or, not saved yet (the CMS's preview), its outline. */
  shape?: ShapeLike;
  className?: string;
  title?: string;
  /** Inked like a rubber stamp's print – a little imperfect. */
  print?: boolean;
  /** Makes each print's imperfections its own. */
  seed?: number;
  /** The body tinted in its color – the drawing surface. */
  filled?: boolean;
  /**
   * A literal hex's finish (the CMS's preview, palette.ts `wornFinish`) – a
   * color's key brings its own.
   */
  finish?: Finish;
  /**
   * A new shape morphs in (morph-outline.tsx) – the drawing being made; a
   * rim's pattern comes back once it has.
   */
  morph?: boolean;
}) => {
  const id = useId();
  const Outline = morph ? MorphOutline : ShapeOutline;
  const ink = hexOf(color);
  // What the print is inked with: the color – or its finish, if it has one.
  const finish = print ? (own ?? finishOf(color)) : undefined;
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
  const along = (pattern: React.ReactNode) =>
    morph ? <AfterMorph shape={shape}>{pattern}</AfterMorph> : pattern;
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
          <Outline shape={shape} />
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
              {rim && along(<RimPath line={rim} stroke="black" />)}
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
              <Outline
                fill={inverted ? paint : "none"}
                shape={shape}
                stroke={rim && !inverted ? "none" : paint}
                strokeDasharray={
                  drawn || inverted || rim ? undefined : "0.06 0.06"
                }
                strokeWidth={FACE.rim}
              />
              {rim && !inverted && along(<RimPath line={rim} stroke={paint} />)}
              {!inverted && doodle}
            </g>
          </g>
        </g>
      ) : (
        <>
          {inverted && filled && (
            // The ground showing through where the doodle is cut out.
            <g transform="scale(100)">
              <Outline fill={pale} shape={shape} />
            </g>
          )}
          <g mask={cut}>
            <g transform="scale(100)">
              <Outline
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
              {rim &&
                !inverted &&
                along(<RimPath line={rim} stroke={ink} style={fade} />)}
              {!inverted && doodle}
            </g>
          </g>
        </>
      )}
    </svg>
  );
};
