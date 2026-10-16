import { type ReactNode, type Ref, useImperativeHandle, useRef } from "react";

/**
 * A loupe over the finger – like the one iOS shows over a text's cursor: a
 * little round window above where the finger is, the drawing beneath it
 * twice as big, a cross on the very spot. Near the top it moves aside.
 * Only for a finger, which covers what it draws on; moved without a render
 * (`show`) – what it shows, `children`, is the drawing box's content as
 * laid out on the stage (the same size), drawn once more.
 */

/** How wide the loupe is (px), how much bigger it shows, how far above. */
const SIZE = 104;
const ZOOM = 2;
const ABOVE = 96;

export type LoupeHandle = {
  /**
   * Over the finger at (x, y) – px in the drawing box, whose top left lies
   * at (left, top) of the stage and which is `side` px wide.
   */
  show: (at: {
    x: number;
    y: number;
    left: number;
    top: number;
    side: number;
  }) => void;
  hide: () => void;
};

export const Loupe = ({
  ref,
  children,
}: {
  ref: Ref<LoupeHandle>;
  children: ReactNode;
}) => {
  const lens = useRef<HTMLDivElement>(null);
  const inside = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => ({
    show: ({ x, y, left, top, side }) => {
      const el = lens.current;
      const content = inside.current;
      if (!(el && content)) return;
      // Above the finger – beside it where there is no room above.
      let cx = left + x;
      let cy = top + y - ABOVE;
      if (cy < SIZE / 2 - 8) {
        cy = top + y;
        cx = left + x + (x > side / 2 ? -ABOVE : ABOVE);
      }
      el.style.transform = `translate(${(cx - SIZE / 2).toFixed(1)}px, ${(cy - SIZE / 2).toFixed(1)}px)`;
      el.style.opacity = "1";
      content.style.width = `${side}px`;
      content.style.height = `${side}px`;
      content.style.transform = `translate(${(SIZE / 2 - x * ZOOM).toFixed(1)}px, ${(SIZE / 2 - y * ZOOM).toFixed(1)}px) scale(${ZOOM})`;
    },
    hide: () => {
      if (lens.current) lens.current.style.opacity = "0";
    },
  }));
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute top-0 left-0 z-20 overflow-hidden rounded-full border-[2.5px] border-ink bg-card opacity-0 shadow-[0_6px_18px_rgb(20_20_20/0.22)] transition-opacity duration-100"
      ref={lens}
      style={{ width: SIZE, height: SIZE }}
    >
      <div className="absolute top-0 left-0 origin-top-left" ref={inside}>
        {children}
      </div>
      {/* The very spot. */}
      <svg
        aria-hidden="true"
        className="absolute inset-0 h-full w-full"
        fill="none"
        stroke="var(--color-ink)"
        strokeLinecap="round"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
      >
        <path
          d={`M${SIZE / 2} ${SIZE / 2 - 9}v5M${SIZE / 2} ${SIZE / 2 + 4}v5M${SIZE / 2 - 9} ${SIZE / 2}h5M${SIZE / 2 + 4} ${SIZE / 2}h5`}
          stroke="white"
          strokeWidth={3.5}
        />
        <path
          d={`M${SIZE / 2} ${SIZE / 2 - 9}v5M${SIZE / 2} ${SIZE / 2 + 4}v5M${SIZE / 2 - 9} ${SIZE / 2}h5M${SIZE / 2 + 4} ${SIZE / 2}h5`}
          strokeWidth={1.5}
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          fill="var(--color-ink)"
          r={1.2}
          stroke="none"
        />
      </svg>
    </div>
  );
};
