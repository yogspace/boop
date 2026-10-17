import { type RefObject, useLayoutEffect, useState } from "react";
import type { Locate } from "../use-select";
import { toBox, toFace, type View } from "../use-zoom";

/**
 * The drawing box on the stage: its size, and where on the face a pointer
 * is – zoomed in or not.
 */

/** The drawing's distance from the stage's edge (px) – `inset-3` (stage.tsx). */
export const INSET = 12;

export const useDrawingBox = (
  paper: RefObject<HTMLDivElement | null>,
  /** The view as it is – ahead of the render (use-zoom.ts `latest`). */
  latest: RefObject<View>
) => {
  const [boxSize, setBoxSize] = useState(300);

  // The drawing box's size – for the pen's tip and the widths' dots.
  useLayoutEffect(() => {
    const el = paper.current;
    if (!el) return;
    const watch = new ResizeObserver(() => setBoxSize(el.clientWidth));
    watch.observe(el);
    setBoxSize(el.clientWidth);
    return () => watch.disconnect();
  }, [paper]);

  /** Px per face unit on screen – the view zoomed in, more. */
  const unitNow = () =>
    ((paper.current?.clientWidth ?? boxSize) * latest.current.s) / 1.04;

  // The drawing box sits a little inside the stage, its view box reaching a
  // little beyond the unit square (its rim) – and zoomed, a part of it fills
  // the box: where on the face a pointer is, beyond it too, and how many px
  // a face unit is.
  const locate: Locate = (event) => {
    const box = paper.current?.getBoundingClientRect();
    if (!box?.width) return null;
    const v = latest.current;
    const [fx, fy] = toFace(
      v,
      (event.clientX - box.left) / box.width,
      (event.clientY - box.top) / box.height
    );
    return {
      x: -0.02 + 1.04 * fx,
      y: -0.02 + 1.04 * fy,
      unit: (box.width * v.s) / 1.04,
    };
  };

  /** Where in the drawing box (0–1) a client point lies. */
  const inBox = (clientX: number, clientY: number) => {
    const box = paper.current?.getBoundingClientRect();
    if (!box?.width) return [0, 0] as const;
    return [
      (clientX - box.left) / box.width,
      (clientY - box.top) / box.height,
    ] as const;
  };

  // Where the pen is on the face – kept on it.
  const point = (event: { clientX: number; clientY: number }) => {
    const at = locate(event);
    if (!at) return null;
    const unit = (n: number) => Math.min(Math.max(n, 0), 1);
    return [unit(at.x), unit(at.y)] as const;
  };

  /** A point of the face as px of the stage. */
  const onStage = (u: number, v: number) => {
    const box = paper.current;
    const size = box?.clientWidth ?? boxSize;
    const [bx, by] = toBox(
      latest.current,
      (u + 0.02) / 1.04,
      (v + 0.02) / 1.04
    );
    return [INSET + bx * size, INSET + by * size] as const;
  };

  return { boxSize, unitNow, locate, inBox, point, onStage };
};
