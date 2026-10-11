import { COLORS, type ColorName, type Drawing } from "./model";

/**
 * A stamp as SVG: its strokes in its one color, round ends, smoothed through
 * the midpoints of the drawn points. Scales with its box.
 */

/** The SVG path of one stroke – quadratic curves through the midpoints. */
export const strokePath = (p: number[]) => {
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

export const StampSvg = ({
  drawing,
  color,
  className,
  title,
}: {
  drawing: Drawing | null;
  color: ColorName;
  className?: string;
  title?: string;
}) => (
  <svg
    aria-hidden={title ? undefined : true}
    className={className}
    role={title ? "img" : undefined}
    viewBox="-0.05 -0.05 1.1 1.1"
  >
    {title && <title>{title}</title>}
    {drawing ? (
      drawing.strokes.map((stroke, i) => (
        <path
          d={strokePath(stroke.p)}
          fill="none"
          // biome-ignore lint/suspicious/noArrayIndexKey: strokes never reorder
          key={i}
          stroke={COLORS[color]}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={stroke.w}
        />
      ))
    ) : (
      // Not (yet) on this device – a dashed placeholder.
      <circle
        cx="0.5"
        cy="0.5"
        fill="none"
        r="0.4"
        stroke={COLORS[color]}
        strokeDasharray="0.06 0.06"
        strokeWidth="0.04"
      />
    )}
  </svg>
);
