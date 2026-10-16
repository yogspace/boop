"use client";

import { animate } from "motion/react";
import { type ReactNode, useLayoutEffect, useRef } from "react";
import { between, matched, ringPath } from "./morph";
import { outlineCount, outlinePath, outlinePoints } from "./outline";
import type { Point } from "./path";
import type { ShapeLike } from "./shapes";

/**
 * The face's outline (stamp-svg.tsx `ShapeOutline`) that morphs when its
 * shape changes – while a stamp is drawn on: the old outline turns into the
 * new one (morph.ts), a little past it and back. Every copy of it on screen
 * (the face, its clip, the line under way's, the loupe's) starts in the
 * same frame and keeps step.
 *
 * Moved without a render: each frame writes the path's `d` itself, and once
 * it has arrived, the shape's own path again – exact, with its corners.
 * Nothing moves for reduced motion.
 */

/**
 * At most this many points on the way: Safari strokes a path of 256
 * stretches and more in pieces – a fine light seam across the rim every 128.
 */
const MOST = 240;

/** How it moves – about a third of a second, a touch past the mark. */
const SPRING = { type: "spring", visualDuration: 0.34, bounce: 0.32 } as const;

const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export const MorphOutline = ({
  shape,
  style,
  ...props
}: { shape: ShapeLike } & React.SVGProps<SVGPathElement>) => {
  const d = outlinePath(shape);
  const path = useRef<SVGPathElement>(null);
  const latest = useRef(shape);
  latest.current = shape;
  // What shows: a shape's own outline – or, under way, the points between.
  const shown = useRef<{ shape: ShapeLike; points: Point[] | null }>({
    shape,
    points: null,
  });

  useLayoutEffect(() => {
    const was = shown.current;
    const next = latest.current;
    const el = path.current;
    shown.current = { shape: next, points: null };
    if (!el || outlinePath(was.shape) === d || still()) return;
    const from = was.points ?? outlinePoints(was.shape);
    const [a, b] = matched(
      from,
      outlinePoints(next),
      Math.min(MOST, Math.max(from.length, outlineCount(next)))
    );
    const now = shown.current;
    const show = (points: Point[]) => {
      now.points = points;
      el.setAttribute("d", ringPath(points));
    };
    show(a);
    const going = animate(0, 1, {
      ...SPRING,
      onUpdate: (t) => show(between(a, b, t)),
      onComplete: () => {
        now.points = null;
        el.setAttribute("d", d);
      },
    });
    // Picked anew on the way: it turns from where it is.
    return () => going.stop();
  }, [d]);

  return (
    <path
      d={d}
      ref={path}
      style={{ transition: "fill 400ms, stroke 400ms", ...style }}
      {...props}
    />
  );
};

/**
 * What lies along the outline but can't morph with it (a rim's pattern):
 * gone as the outline changes, back once it has arrived.
 */
export const AfterMorph = ({
  shape,
  children,
}: {
  shape: ShapeLike;
  children: ReactNode;
}) => {
  const group = useRef<SVGGElement>(null);
  const d = outlinePath(shape);
  const before = useRef(d);
  useLayoutEffect(() => {
    const el = group.current;
    if (before.current === d || !el) return;
    before.current = d;
    if (still()) return;
    el.style.transition = "none";
    el.style.opacity = "0";
    // Gone at once – then it fades back in as the outline lands.
    el.getBoundingClientRect();
    el.style.transition = "opacity 220ms ease-out 280ms";
    el.style.opacity = "1";
  }, [d]);
  return <g ref={group}>{children}</g>;
};
