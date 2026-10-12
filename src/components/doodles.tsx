import type { SVGProps } from "react";

/**
 * Marker doodles that decorate the pages – underlines, circles around
 * things, arrows, stars, little marks, and bits of Boop's own world: a
 * stamp's print ring, an ink splat, the ticks around a fresh print.
 *
 * All line art in `currentColor` with round ends, a little wobbly on
 * purpose, and hidden from screen readers – decoration, never the only way
 * something is said. Size and color them with classes (`h-6 w-6 text-ink`);
 * add `boil` (styles.css) to let one's line simmer.
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

/** A wavy underline. */
export const Squiggle = (props: Props) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 120 14"
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

/** A marker scribbled back and forth behind a word – a highlight. */
export const Highlight = (props: Props) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 100 40"
    {...STRETCH}
    {...base({ strokeWidth: 7, ...props })}
  >
    <path
      d="M3 31L13 9L17 32L29 7L33 33L45 8L49 32L61 8L65 33L77 7L81 31L92 10L97 27"
      {...LINE}
    />
  </svg>
);

/** The strokes of the hatching, bottom left to top right – none quite alike. */
const HATCH = Array.from({ length: 14 }, (_, i) => {
  const x = i * 14 - 62;
  return `M${x} ${103 - (i % 2)}L${x + 60 + (i % 3) * 2.5} ${-3 + (i % 4)}`;
}).join("");

/** Pencil hatching – shades the box it stretches over. */
export const Hatching = (props: Props) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 100 100"
    {...STRETCH}
    {...base({ strokeWidth: 1.5, ...props })}
  >
    <path d={HATCH} {...LINE} />
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

/** A little heart. */
export const Heart = (props: Props) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    {...base({ strokeWidth: 2.4, ...props })}
  >
    <path d="M12 20s-7.5-4.6-8.9-9.2C2 7 5.6 4.3 8.6 5.5c1.6.6 2.6 1.9 3.4 3.2.8-1.3 1.8-2.6 3.4-3.2 3-1.2 6.6 1.5 5.5 5.3C19.5 15.4 12 20 12 20Z" />
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

/** The ring a stamp's rim leaves – the ink didn't take everywhere. */
export const PrintRing = (props: Props) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 48 48"
    {...base({ strokeWidth: 3, ...props })}
  >
    <path d="M24 5.5C34.5 5.2 42.6 13.4 42.5 24M41.6 29.5C39.2 37.6 32 43 23.4 42.5C14.6 42 7.6 36 5.9 27.6M5.6 21.4C6.6 14.2 11.4 8.4 18.2 6.3" />
  </svg>
);

/** An ink splat, with a few drops gone astray. */
export const Splat = (props: Props) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 48 48"
    {...base({ strokeWidth: 1.5, ...props })}
  >
    <path
      d="M23.5 11C25.3 11 26.5 15.1 29.2 16.1C32 17 36.4 14 37.1 15.7C37.9 17.4 33.4 21.7 33 24.5C32.6 27.4 36.1 28.4 35.1 29.8C34 31.2 29.9 29.6 27.8 31.6C25.7 33.6 26.4 39.9 24.6 40C22.8 40.1 21.2 33.7 18.8 31.9C16.4 30.2 13.3 32.9 12.6 31.2C11.8 29.5 15.3 26.3 15 23.5C14.7 20.7 10.2 18.7 11.2 17.3C12.2 15.8 17.6 17.4 20.1 16.1C22.5 14.9 21.6 11 23.5 11Z"
      fill="currentColor"
    />
    <path
      d="M40.5 10.5L40.6 10.6M8 37.5L8.1 37.6M41 36L41.1 36.1"
      strokeWidth={3.4}
    />
    <path d="M6.5 9.5L6.6 9.6M34 43L34.1 43.1" strokeWidth={2.2} />
  </svg>
);
