/**
 * The marker's wobble – the SVG filters behind every scribbled frame and
 * line (the `scribble` utilities in styles.css). Each pushes what it is given
 * about by a little noise, so a plain border comes out as if drawn freely.
 * Mounted once per page (the language's layout); CSS points at them by id.
 *
 * Several wobbles of each kind – the same line, drawn again: siblings take
 * turns with them, and a “boiling” line swaps through them.
 *
 * - `scribble-1…3`: frames – buttons, fields, cards, sheets.
 * - `scribble-s1…3`: small things – under ~60px the frames' room is too
 *   tight and their wobble too strong.
 * - `scribble-h1…5`, `scribble-v1…5`: single lines, lying flat or standing –
 *   rules, underlines, a ruled table: long, and only a few pixels across.
 *
 * What they cost (measured in Safari's engine): the filter works on every
 * pixel of its room – the box and a margin, at the screen's resolution –
 * each time its box is painted. So the room is no bigger than each kind
 * needs, and the filter is just these two steps: any further one (it had a
 * color matrix once) is another pass over all the pixels. A noise tile
 * repeated with feTile would be far cheaper – Safari draws nothing with it.
 */

type Kind = {
  id: string;
  /** One wobble per seed. */
  seeds: number[];
  /** How far the noise pushes at most (px, both ways together). */
  scale: number;
  /** The room around the box, as parts of it. */
  x: string;
  y: string;
  width: string;
  height: string;
};

const THREE = [3, 11, 23];
const FIVE = [5, 13, 29, 41, 59];

const KINDS: Kind[] = [
  {
    id: "scribble-",
    seeds: THREE,
    scale: 7,
    x: "-6%",
    y: "-14%",
    width: "112%",
    height: "128%",
  },
  {
    id: "scribble-s",
    seeds: THREE,
    scale: 5,
    x: "-40%",
    y: "-40%",
    width: "180%",
    height: "180%",
  },
  {
    id: "scribble-h",
    seeds: FIVE,
    scale: 6,
    x: "-3%",
    y: "-80%",
    width: "106%",
    height: "260%",
  },
  {
    id: "scribble-v",
    seeds: FIVE,
    scale: 6,
    x: "-80%",
    y: "-3%",
    width: "260%",
    height: "106%",
  },
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
      {KINDS.flatMap(({ id, seeds, scale, ...room }) =>
        seeds.map((seed, i) => (
          <filter
            // sRGB: the noise as it is – in linear light it would lean one
            // way, and converting takes time.
            colorInterpolationFilters="sRGB"
            id={`${id}${i + 1}`}
            key={`${id}${seed}`}
            {...room}
          >
            <feTurbulence
              baseFrequency="0.022"
              numOctaves="2"
              result="noise"
              seed={seed}
              type="fractalNoise"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale={scale}
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        ))
      )}
    </defs>
  </svg>
);
