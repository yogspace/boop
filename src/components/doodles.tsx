import type { SVGProps } from "react";

/**
 * Marker doodles that decorate the pages – underlines, circles around
 * things, arrows, stars, little marks, and a bit of Boop's own world: the
 * ticks around a fresh print.
 *
 * All line art in `currentColor` with round ends, a little wobbly on
 * purpose, and hidden from screen readers – decoration, never the only way
 * something is said. Size and color them with classes (`h-6 w-6 text-ink`);
 * add `boil` (styles.css) to let one's line simmer. Each picture (viewBox)
 * holds its whole line, the marker's width included – an <svg> cuts at its
 * edges.
 */

type Props = SVGProps<SVGSVGElement>;

const base = (props: Props) => ({
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  ...props,
});

/**
 * For the ones that stretch over whatever they mark (a word, a box): the
 * picture fills its box, the line keeps its width – `strokeWidth` is then
 * in pixels.
 */
const STRETCH = { preserveAspectRatio: "none" } as const;
const LINE = { vectorEffect: "non-scaling-stroke" } as const;

// ── Under, around and behind things ─────────────────────────────────────────

/**
 * A wavy underline. Its picture holds the whole line, with the marker's width
 * (y 1.75–16.25) – 8 : 1, as it is used (`h-3 w-24`).
 */
export const Squiggle = (props: Props) => (
  <svg
    aria-hidden="true"
    viewBox="0 1.5 120 15"
    {...base({ strokeWidth: 4, ...props })}
  >
    <path d="M3 9c9-7 15-7 21 0s13 7 20 0 14-7 21 0 13 7 20 0 14-7 21 0 7 3 11 1" />
  </svg>
);

/** A quick underline, there and back – stretches under its word. */
export const Underline = (props: Props) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 120 14"
    {...STRETCH}
    {...base({ strokeWidth: 3.5, ...props })}
  >
    <path d="M3 5.5C34 2.5 78 2 117 4.5C88 5.5 52 7.5 22 11.5" {...LINE} />
  </svg>
);

/** A scribbled circle around something – stretches round its box. */
export const Circle = (props: Props) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 120 60"
    {...STRETCH}
    {...base({ strokeWidth: 3.5, ...props })}
  >
    <path
      d="M70 6C40 3 8 12 6 30c-2 17 30 25 58 24 28-1 52-10 50-26C112 12 88 5 62 7c-14 1-26 4-36 9"
      {...LINE}
    />
  </svg>
);

// ── Pointing ────────────────────────────────────────────────────────────────

/** A loopy arrow pointing right and down. */
export const Arrow = (props: Props) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 80 60"
    {...base({ strokeWidth: 3, ...props })}
  >
    <path d="M4 10c18-6 34-2 38 10 3 9-6 13-10 7-4-7 6-14 18-9 10 4 16 14 18 26" />
    <path d="M60 36l8 9 6-11" />
  </svg>
);

/** A short arrow to the right. */
export const ArrowRight = (props: Props) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    {...base({ strokeWidth: 2.6, ...props })}
  >
    <path d="M4 12.4C9.2 11.6 14.4 12.6 19.6 11.9" />
    <path d="M14.2 6.6C16.2 8.6 18 10.2 20.2 11.9C18 13.6 16.2 15.6 14.6 17.8" />
  </svg>
);

/** A short arrow to the left. */
export const ArrowLeft = (props: Props) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    {...base({ strokeWidth: 2.6, ...props })}
  >
    <path d="M20 12.4C14.8 11.6 9.6 12.6 4.4 11.9" />
    <path d="M9.8 6.6C7.8 8.6 6 10.2 3.8 11.9C6 13.6 7.8 15.6 9.4 17.8" />
  </svg>
);

// ── Little marks ────────────────────────────────────────────────────────────

/** A four-point sparkle, filled. */
export const Sparkle = (props: Props) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    {...base({ strokeWidth: 2.2, ...props })}
  >
    <path
      d="M12 2.5c.6 5.3 3.2 8.4 9.5 9.5-6.3 1.1-8.9 4.2-9.5 9.5-.6-5.3-3.2-8.4-9.5-9.5 6.3-1.1 8.9-4.2 9.5-9.5Z"
      fill="currentColor"
    />
  </svg>
);

/** A five-point star, outlined – a bit lopsided. */
export const Star = (props: Props) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    {...base({ strokeWidth: 2.2, ...props })}
  >
    <path
      d="M12.2 2.8L14.9 8.7L21.4 9.6L16.6 14.1L17.9 20.8L12 17.5L6.2 20.9L7.5 14.2L2.6 9.8L9.2 8.8Z"
      fill="var(--color-card)"
    />
  </svg>
);

/** A filled marker dot – not quite round. */
export const Dot = (props: Props) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    {...base({ strokeWidth: 1, ...props })}
  >
    <path
      d="M12.2 3.4C17.3 3.2 20.9 7 20.6 12.1C20.3 17 16.8 20.7 11.8 20.6C6.9 20.5 3.3 16.9 3.4 11.9C3.5 7.2 7.3 3.6 12.2 3.4Z"
      fill="currentColor"
    />
  </svg>
);

/** A tick – done, yes. */
export const Check = (props: Props) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    {...base({ strokeWidth: 2.8, ...props })}
  >
    <path d="M4.5 12.6C6.6 14.4 8.2 16.4 9.6 18.9C12.4 13.2 15.8 8.6 20 5.2" />
  </svg>
);

/** A cross – close, no. */
export const Cross = (props: Props) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    {...base({ strokeWidth: 2.8, ...props })}
  >
    <path d="M6 5.8C9.8 9.6 13.8 13.8 18.4 18.4M18.2 5.6C14.2 9.4 10 13.6 5.6 18.4" />
  </svg>
);

/** A plus – add one. */
export const Plus = (props: Props) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    {...base({ strokeWidth: 2.8, ...props })}
  >
    <path d="M12.1 4.6C11.7 9.4 12.3 14.6 11.9 19.4M4.6 12.2C9.4 11.7 14.6 12.4 19.4 11.9" />
  </svg>
);

/** An exclamation mark – watch out. */
export const Bang = (props: Props) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    {...base({ strokeWidth: 3, ...props })}
  >
    <path d="M12 4.4C12.3 7.8 11.8 11.2 12 14.4M12 19.3L12.05 19.4" />
  </svg>
);

/** An envelope – sent by mail. */
export const Mail = (props: Props) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    {...base({ strokeWidth: 2.2, ...props })}
  >
    <path d="M3.6 6.9C9.2 6.3 14.8 6.4 20.4 6.7C20.8 10.2 20.7 13.9 20.5 17.5C14.9 17.9 9.2 17.8 3.7 17.5C3.3 13.9 3.3 10.3 3.6 6.9Z" />
    <path d="M4.4 7.6C7 9.8 9.6 11.7 12 13.5C14.6 11.6 17.1 9.6 19.7 7.5" />
  </svg>
);

// ── Boop's own world ────────────────────────────────────────────────────────

/** The ticks around a fresh print – boop! Fanned upwards. */
export const Ticks = (props: Props) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 40 24"
    {...base({ strokeWidth: 2.8, ...props })}
  >
    <path d="M6 20L2.5 12.5M14 14.5L12.6 5.5M26 14.5L27.6 5.5M34 20L37.5 12.6" />
  </svg>
);
