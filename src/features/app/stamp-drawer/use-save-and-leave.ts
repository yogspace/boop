import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { Snapshot } from "valtio";
import { trackEvent } from "@/features/analytics/client";
import type { Art } from "@/features/calendar/art";
import type {
  Drawing,
  RimPattern,
  StampDoc,
  StampShape,
} from "@/features/calendar/model";
import {
  createStamp,
  type StampChange,
  updateStamp,
} from "@/features/offline/store";

/**
 * Saving the stamp – or leaving without: what changed, whether closing
 * would throw something away (then it asks first), and closing.
 */
export const useSaveAndLeave = ({
  stamp,
  calendar,
  art: { strokes, fills },
  inverted,
  rim,
  special,
  shape,
  color,
  name,
  shared,
  going,
  ask,
  onClose,
  onSaved,
  onDrawn,
}: {
  stamp?: Snapshot<StampDoc>;
  calendar: string | null;
  /** The drawing now. */
  art: Art;
  inverted: boolean;
  rim: RimPattern | undefined;
  special: boolean;
  shape: StampShape;
  color: string;
  name: string;
  shared: boolean;
  /** On its way out – Escape closes no more. */
  going: boolean;
  ask: number;
  onClose: () => void;
  onSaved?: (id: string) => void;
  onDrawn?: (drawn: boolean) => void;
}) => {
  const [error, setError] = useState(false);

  // The drawing as a stamp keeps it – and, for one drawn anew, what differs
  // from how it came in (as the editor first showed it): that is what saving
  // sends, and what closing would throw away.
  const drawingNow = useMemo(
    (): Drawing => ({
      v: 1,
      strokes,
      ...(fills.length > 0 && { fills }),
      ...(inverted && { inverted: true as const }),
      ...(rim && { rim }),
      ...(special && { special: true as const }),
    }),
    [strokes, fills, inverted, rim, special]
  );
  const anew = Boolean(stamp);
  const drawingText = useMemo(
    () => (anew ? JSON.stringify(drawingNow) : ""),
    [anew, drawingNow]
  );
  const [first] = useState(() => ({
    drawing: drawingText,
    shape,
    color,
    shared,
  }));
  const change: StampChange = {};
  if (stamp) {
    if (drawingText !== first.drawing) change.drawing = drawingNow;
    if (shape !== first.shape) change.shape = shape;
    if (color !== first.color) change.color = color;
    const named = name.trim().slice(0, 40);
    if (named !== stamp.name) change.name = named;
    if (calendar && shared !== first.shared) {
      const rest = stamp.sharedWith.filter((id) => id !== calendar);
      change.sharedWith = shared ? [...rest, calendar] : rest;
    }
  }

  // Something drawn – or changed: closing would throw it away, so it asks
  // first – the X, Escape, and the browser's back (`ask`). Asked, closing
  // once more is the answer: away with it.
  const drawn = stamp
    ? Object.keys(change).length > 0
    : strokes.length > 0 || fills.length > 0;
  const [leaving, setLeaving] = useState(false);
  // The browser's back asks only once: asked, it goes like the X.
  useEffect(() => onDrawn?.(drawn && !leaving), [drawn, leaving, onDrawn]);
  useEffect(() => () => onDrawn?.(false), [onDrawn]);
  /** Gone for good – saved, or thrown away. */
  const leave = () => {
    onDrawn?.(false);
    onClose();
  };
  const close = () => {
    if (drawn && !leaving) setLeaving(true);
    else leave();
  };
  // The browser's back is a close like the others – counted up while open
  // (not what it found at the start), it reaches the latest `close`.
  const closing = useRef(close);
  closing.current = close;
  const askedBefore = useRef(ask);
  useEffect(() => {
    if (ask === askedBefore.current) return;
    askedBefore.current = ask;
    closing.current();
  }, [ask]);
  // Escape closes – unless a tool took it first (use-draw-keys.ts, caught
  // earlier).
  useEffect(() => {
    if (going) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closing.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [going]);

  // Its button, or Enter in the name – with the keyboard up, the keyboard's
  // own key saves, whatever it covers.
  const onSave = async (event: FormEvent) => {
    event.preventDefault();
    setError(false);
    try {
      if (stamp) {
        await updateStamp(stamp.id, change);
        onSaved?.(stamp.id);
        leave();
        return;
      }
      const id = await createStamp({
        name: name.trim().slice(0, 40),
        color,
        shape,
        drawing: drawingNow,
        sharedWith: shared && calendar ? [calendar] : [],
      });
      trackEvent("stamp-created");
      onSaved?.(id);
      leave();
    } catch {
      setError(true);
    }
  };

  return { leaving, setLeaving, leave, close, onSave, error };
};
