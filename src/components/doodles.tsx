import type { SVGProps } from "react";

/**
 * Hand-drawn bits that decorate the pages – squiggles, sparkles, arrows.
 * They draw in `currentColor` with round ends, a little wobbly on purpose.
 */

type Props = SVGProps<SVGSVGElement>;

const base = (props: Props) => ({
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  ...props,
});

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

/** A four-point sparkle. */
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

/** A scribbled circle around something. */
export const Circle = (props: Props) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 120 60"
    {...base({ strokeWidth: 3, ...props })}
  >
    <path d="M70 6C40 3 8 12 6 30c-2 17 30 25 58 24 28-1 52-10 50-26C112 12 88 5 62 7c-14 1-26 4-36 9" />
  </svg>
);
