import { useId } from "react";
import { COLORS, type ColorName, type StampShape } from "./model";

/**
 * A stamp flat, as SVG – the drawing (while it is being made) and the print
 * it leaves on a day: its rim in the shape and the doodle inside, in its one
 * color. As a `print`, the ink is speckled like a real rubber stamp's.
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

/**
 * The body's outline in the unit square: one rounded rectangle whose corner
 * radius makes it a circle or a square – so changing the shape morphs
 * (CSS transition on `rx`).
 */
const MORPH =
  "rx 460ms cubic-bezier(.3,1.4,.5,1), ry 460ms cubic-bezier(.3,1.4,.5,1), fill 400ms, stroke 400ms";

export const ShapeOutline = ({
  shape,
  style,
  ...props
}: { shape: StampShape } & React.SVGProps<SVGRectElement>) => {
  const r = shape === "circle" ? 0.48 : 0.13;
  return (
    <rect
      height="0.96"
      rx={r}
      style={
        { rx: r, ry: r, transition: MORPH, ...style } as React.CSSProperties
      }
      width="0.96"
      x="0.02"
      y="0.02"
      {...props}
    />
  );
};

type ReadonlyDrawing = {
  readonly strokes: readonly {
    readonly w: number;
    readonly p: readonly number[];
  }[];
};

export const StampSvg = ({
  drawing,
  color,
  shape = "circle",
  className,
  title,
  print = false,
  filled = false,
}: {
  drawing: ReadonlyDrawing | null;
  color: ColorName;
  shape?: StampShape;
  className?: string;
  title?: string;
  /** Speckled like ink from a rubber stamp. */
  print?: boolean;
  /** The body tinted in its color – the drawing surface. */
  filled?: boolean;
}) => {
  const id = useId();
  const ink = COLORS[color];
  const fade = { transition: "stroke 400ms, fill 400ms" };
  return (
    // Named when given a title (role img), otherwise hidden – decoration.
    // biome-ignore lint/a11y/noSvgWithoutTitle: the title is conditional
    <svg
      aria-hidden={title ? undefined : true}
      className={className}
      role={title ? "img" : undefined}
      viewBox="-0.02 -0.02 1.04 1.04"
    >
      {title && <title>{title}</title>}
      <defs>
        <clipPath id={`${id}-clip`}>
          <ShapeOutline shape={shape} />
        </clipPath>
        {print && (
          <filter height="120%" id={`${id}-ink`} width="120%" x="-10%" y="-10%">
            <feTurbulence
              baseFrequency="38"
              numOctaves="2"
              result="noise"
              seed="7"
              type="fractalNoise"
            />
            <feColorMatrix
              in="noise"
              result="speckle"
              type="matrix"
              values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.2 1.7"
            />
            <feComposite in="SourceGraphic" in2="speckle" operator="in" />
          </filter>
        )}
      </defs>
      <g
        filter={print ? `url(#${id}-ink)` : undefined}
        opacity={print ? 0.92 : 1}
      >
        <ShapeOutline
          fill={filled ? `color-mix(in srgb, ${ink} 14%, white)` : "none"}
          shape={shape}
          stroke={ink}
          strokeDasharray={drawing || filled ? undefined : "0.06 0.06"}
          strokeWidth="0.035"
        />
        {drawing && (
          <g clipPath={`url(#${id}-clip)`}>
            {drawing.strokes.map((stroke, i) => (
              <path
                d={strokePath(stroke.p)}
                fill="none"
                key={i}
                stroke={ink}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={stroke.w}
                style={fade}
              />
            ))}
          </g>
        )}
      </g>
    </svg>
  );
};
