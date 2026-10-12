import { useId } from "react";
import { COLORS, type ColorName, type StampShape } from "./model";

/**
 * A stamp as SVG: its body (circle or square) as a thin rim, the doodle
 * inside it in the same color – round ends, smoothed through the midpoints of
 * the drawn points. Scales with its box. The 3D stamp with the doodle
 * embossed comes later; this is its print.
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

/** The body's outline in the unit square – also what the doodle stays in. */
export const ShapeOutline = ({
  shape,
  ...props
}: { shape: StampShape } & React.SVGProps<
  SVGCircleElement & SVGRectElement
>) =>
  shape === "circle" ? (
    <circle cx="0.5" cy="0.5" r="0.48" {...props} />
  ) : (
    <rect height="0.96" rx="0.12" width="0.96" x="0.02" y="0.02" {...props} />
  );

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
}: {
  drawing: ReadonlyDrawing | null;
  color: ColorName;
  shape?: StampShape;
  className?: string;
  title?: string;
}) => {
  const clip = useId();
  const ink = COLORS[color];
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
        <clipPath id={clip}>
          <ShapeOutline shape={shape} />
        </clipPath>
      </defs>
      <ShapeOutline
        fill="none"
        shape={shape}
        stroke={ink}
        strokeDasharray={drawing ? undefined : "0.06 0.06"}
        strokeWidth="0.03"
      />
      {drawing && (
        <g clipPath={`url(#${clip})`}>
          {drawing.strokes.map((stroke, i) => (
            <path
              d={strokePath(stroke.p)}
              fill="none"
              key={i}
              stroke={ink}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={stroke.w}
            />
          ))}
        </g>
      )}
    </svg>
  );
};
