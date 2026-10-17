/** What the editor's buttons show: small line drawings, scribbled tiles. */

/** A small line drawing on a button – `d` is what it shows. */
export const Sign = ({ d, className }: { d: string; className?: string }) => (
  <svg
    aria-hidden="true"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="2.2"
    viewBox="0 0 24 24"
  >
    <path d={d} />
  </svg>
);

/**
 * Something to pick – a tool, a width, a shape, a template, a rim: a small
 * scribbled tile, filled with ink when it is the one (`aria-pressed`).
 */
export const TILE =
  "scribble scribble-sm flex aspect-square w-full items-center justify-center rounded-xl transition-transform duration-150 ease-out hover:-rotate-6 active:scale-90 aria-pressed:scribble-ink aria-pressed:hover:rotate-0";
