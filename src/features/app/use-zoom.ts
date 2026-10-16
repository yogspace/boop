import {
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

/**
 * Zooming into a drawing and moving about in it – for fine details. The
 * view says how far in (`s`: 1 is the whole face, never less, at most
 * MAX_ZOOM) and where: the drawing box's top left corner (`x`, `y`) in widths
 * of that box, 0 to 1 − s – the face always fills it.
 *
 * Two fingers pinch and move it; on a trackpad the pinch (⌘/Ctrl with the
 * wheel – Safari's own gesture, too) zooms and two fingers move it; with a
 * mouse ⌘/Ctrl and the wheel zoom, the space bar or the wheel's button held
 * moves it. The drawing goes on in the face's own units: the pen draws
 * where it is, whatever the view (`toFace`).
 */
export type View = { s: number; x: number; y: number };

export const WHOLE: View = { s: 1, x: 0, y: 0 };

/** How far in it goes. */
export const MAX_ZOOM = 6;

/** A view kept on the face: zoomed in no less than all of it, no further than MAX_ZOOM, never beside it. */
export const keptView = ({ s, x, y }: View): View => {
  const zoom = Math.min(MAX_ZOOM, Math.max(1, s));
  return {
    s: zoom,
    x: Math.min(0, Math.max(1 - zoom, x)),
    y: Math.min(0, Math.max(1 - zoom, y)),
  };
};

/**
 * The view zoomed by `factor` about a point of the box (0–1 each way) –
 * what is under it stays under it.
 */
export const zoomedAbout = (
  view: View,
  factor: number,
  px: number,
  py: number
): View => {
  const s = Math.min(MAX_ZOOM, Math.max(1, view.s * factor));
  const k = s / view.s;
  return keptView({ s, x: px - (px - view.x) * k, y: py - (py - view.y) * k });
};

/** The view moved by (dx, dy) – shares of the box. */
export const movedBy = (view: View, dx: number, dy: number): View =>
  keptView({ ...view, x: view.x + dx, y: view.y + dy });

/**
 * Two fingers from where they were (a0, b0, with the view then) to where
 * they are: zoomed by how much further apart, moved along with their middle.
 */
export const pinched = (
  from: View,
  [a0, b0]: [readonly [number, number], readonly [number, number]],
  [a1, b1]: [readonly [number, number], readonly [number, number]]
): View => {
  const d0 = Math.hypot(b0[0] - a0[0], b0[1] - a0[1]) || 1e-6;
  const d1 = Math.hypot(b1[0] - a1[0], b1[1] - a1[1]);
  const m0 = [(a0[0] + b0[0]) / 2, (a0[1] + b0[1]) / 2];
  const m1 = [(a1[0] + b1[0]) / 2, (a1[1] + b1[1]) / 2];
  const s = Math.min(MAX_ZOOM, Math.max(1, (from.s * d1) / d0));
  // The face's point under the first middle goes under the new one.
  const u = (m0[0] - from.x) / from.s;
  const v = (m0[1] - from.y) / from.s;
  return keptView({ s, x: m1[0] - u * s, y: m1[1] - v * s });
};

/** A point of the box (0–1 each way) as a point of the face's box. */
export const toFace = (view: View, bx: number, by: number) =>
  [(bx - view.x) / view.s, (by - view.y) / view.s] as const;

/** A point of the face's box (0–1) as one of the box on screen. */
export const toBox = (view: View, fx: number, fy: number) =>
  [view.x + fx * view.s, view.y + fy * view.s] as const;

/**
 * The view of a drawing box (`box`, the element its 0–1 is) – and what
 * zooms it there besides fingers: the wheel and the trackpad, and Safari's
 * own pinch on a Mac. `on`: listening at all.
 */
export const useZoom = (box: RefObject<HTMLElement | null>, on: boolean) => {
  const [view, setView] = useState<View>(WHOLE);
  // The latest – ahead of the render, for the pointer's handlers.
  const latest = useRef(view);
  const frame = useRef(0);
  const pending = useRef<View | null>(null);
  /** Shown at the next frame – many moves, one render. */
  const show = useCallback((next: View) => {
    latest.current = next;
    pending.current = next;
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      if (pending.current) setView(pending.current);
      pending.current = null;
    });
  }, []);
  const set = (next: View) => show(keptView(next));
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  useEffect(() => {
    const el = box.current;
    if (!(el && on)) return;
    /** Where a client point lies in the box (0–1). */
    const inBox = (clientX: number, clientY: number) => {
      const r = el.getBoundingClientRect();
      return [
        (clientX - r.left) / (r.width || 1),
        (clientY - r.top) / (r.height || 1),
      ] as const;
    };
    const onWheel = (event: WheelEvent) => {
      const v = latest.current;
      const r = el.getBoundingClientRect();
      const unit =
        event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? r.height : 1;
      if (event.ctrlKey || event.metaKey) {
        // A trackpad's pinch, or ⌘/Ctrl with the wheel.
        event.preventDefault();
        const [px, py] = inBox(event.clientX, event.clientY);
        show(zoomedAbout(v, Math.exp(-event.deltaY * unit * 0.01), px, py));
        return;
      }
      // Zoomed in: the wheel and two fingers on a trackpad move about.
      if (v.s <= 1) return;
      event.preventDefault();
      show(
        movedBy(
          v,
          (-event.deltaX * unit) / (r.width || 1),
          (-event.deltaY * unit) / (r.height || 1)
        )
      );
    };
    // Safari on a Mac pinches with its own gesture events – no wheel.
    let gestureFrom: View | null = null;
    const onGestureStart = (event: Event) => {
      event.preventDefault();
      gestureFrom = latest.current;
    };
    const onGestureChange = (event: Event) => {
      event.preventDefault();
      const gesture = event as Event & {
        scale: number;
        clientX: number;
        clientY: number;
      };
      // Fingers on a touch screen zoom through the pointers instead.
      if (!gestureFrom || !Number.isFinite(gesture.clientX)) return;
      const from = gestureFrom;
      const [px, py] = inBox(gesture.clientX, gesture.clientY);
      const s = Math.min(MAX_ZOOM, Math.max(1, from.s * gesture.scale));
      show(zoomedAbout(from, s / from.s, px, py));
    };
    const onGestureEnd = (event: Event) => {
      event.preventDefault();
      gestureFrom = null;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("gesturestart", onGestureStart);
    el.addEventListener("gesturechange", onGestureChange);
    el.addEventListener("gestureend", onGestureEnd);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("gesturestart", onGestureStart);
      el.removeEventListener("gesturechange", onGestureChange);
      el.removeEventListener("gestureend", onGestureEnd);
    };
  }, [box, on, show]);

  return {
    view,
    latest,
    set,
    /** Back to the whole face – at once. */
    reset: () => {
      cancelAnimationFrame(frame.current);
      frame.current = 0;
      pending.current = null;
      latest.current = WHOLE;
      setView(WHOLE);
    },
    zoomBy: (factor: number) => {
      show(zoomedAbout(latest.current, factor, 0.5, 0.5));
    },
  };
};
