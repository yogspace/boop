/**
 * The marker's wobble – the SVG filters behind every scribbled frame and
 * line (the `scribble` utilities in styles.css). Each pushes what it is given
 * about by a little noise, so a plain border comes out as if drawn freely.
 * Mounted once per page (the language's layout); CSS points at them by id.
 *
 * Three wobbles each – the same line, drawn three times: siblings take turns with
 * them, and a “boiling” line swaps through them.
 *
 * - `scribble-1…3`: frames – buttons, fields, cards, sheets. Little room
 *   around the box (the filter works on every pixel of it).
 * - `scribble-s1…3`: small things and lines – under ~60px the frames' room
 *   is too tight and their wobble too strong.
 */

const SEEDS = [3, 11, 23];

/** How far the noise pushes at most (px, either way) – and the room for it. */
const KINDS = [
  { id: "scribble-", scale: 7, x: "-6%", y: "-14%", w: "112%", h: "128%" },
  { id: "scribble-s", scale: 5, x: "-40%", y: "-40%", w: "180%", h: "180%" },
];

export const ScribbleDefs = () => (
  <svg
    aria-hidden="true"
    className="pointer-events-none absolute"
    focusable="false"
    height="0"
    width="0"
  >
    <defs>
      {KINDS.flatMap((kind) =>
        SEEDS.map((seed, i) => (
          <filter
            // sRGB: the noise as it is – in linear light it would lean one way.
            colorInterpolationFilters="sRGB"
            height={kind.h}
            id={`${kind.id}${i + 1}`}
            key={`${kind.id}${seed}`}
            width={kind.w}
            x={kind.x}
            y={kind.y}
          >
            <feTurbulence
              baseFrequency="0.022"
              numOctaves="2"
              seed={seed}
              type="fractalNoise"
            />
            {/* The noise's own alpha is noise too – opaque, so every pixel
                is pushed by its color alone. */}
            <feColorMatrix
              result="noise"
              type="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0 1"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale={kind.scale}
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        ))
      )}
    </defs>
  </svg>
);
