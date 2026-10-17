import type { SVGProps } from "react";

/**
 * The two signs beside a calendar's name – drawn like the ones in
 * components/doodles.tsx (round ends, a little wobbly, `currentColor`), where
 * they belong: to move there. With more in them than an arrow, they want a
 * little more room: `h-6 w-6` in a round button. A file of their own: the
 * calendar's page shows them from the start, its settings load later
 * (boop-app/lazy-sheets.ts).
 */

const doodle = (props: SVGProps<SVGSVGElement>) => ({
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  strokeWidth: 2.2,
  ...props,
});

/** Three sliders, each knob somewhere else – settings. */
export const Sliders = (props: SVGProps<SVGSVGElement>) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" {...doodle(props)}>
    <path d="M3.6 6.7C8.9 6.2 14.6 6.9 20.4 6.4M3.7 12.2C9.2 11.7 14.9 12.4 20.3 11.9M3.6 17.6C9 17.1 14.7 17.9 20.4 17.4" />
    <path
      d="M9 4.1C10.4 4 11.5 5.3 11.4 6.6C11.3 8 10.2 8.9 8.9 8.9C7.5 8.8 6.6 7.8 6.6 6.5C6.6 5.1 7.7 4.1 9 4.1ZM15.3 9.7C16.7 9.6 17.8 10.9 17.7 12.2C17.6 13.6 16.5 14.5 15.2 14.5C13.8 14.4 12.9 13.4 12.9 12.1C12.9 10.7 14 9.7 15.3 9.7ZM7.6 15.1C9 15 10.1 16.3 10 17.6C9.9 19 8.8 19.9 7.5 19.9C6.1 19.8 5.2 18.8 5.2 17.5C5.2 16.1 6.3 15.1 7.6 15.1Z"
      fill="currentColor"
      strokeWidth="1"
    />
  </svg>
);

/** Someone, and a plus – one more in: sharing. */
export const PersonPlus = (props: SVGProps<SVGSVGElement>) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" {...doodle(props)}>
    <path d="M9.4 3.6C11.6 3.5 13.3 5.3 13.2 7.5C13.1 9.6 11.4 11.3 9.2 11.2C7.1 11.1 5.4 9.5 5.5 7.3C5.6 5.2 7.2 3.7 9.4 3.6Z" />
    <path d="M2.7 20.3C2.9 16.8 5.6 14.6 9.4 14.6C13.1 14.7 15.8 16.9 16.1 20.2" />
    <path d="M19.2 5.1C19.1 7.2 19.3 9.2 19.2 11.3M16.2 8.3C18.2 8.1 20.2 8.4 22.2 8.2" />
  </svg>
);
