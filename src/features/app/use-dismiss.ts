"use client";

import { type RefObject, useEffect, useEffectEvent } from "react";

/**
 * Light dismiss for what opens over the page – a menu, a note: while `open`,
 * a press anywhere but on `inside` (what opened it first, then what opened)
 * or Escape closes it. Escape takes the focus back to the opener if it was
 * in there.
 */
export const useDismiss = (
  open: boolean,
  close: () => void,
  ...inside: RefObject<HTMLElement | null>[]
) => {
  const within = useEffectEvent((target: Node | null) =>
    inside.some((ref) => target && ref.current?.contains(target))
  );
  const done = useEffectEvent(close);
  const opener = useEffectEvent(() => inside[0]?.current);
  useEffect(() => {
    if (!open) return;
    const onPress = (event: PointerEvent) => {
      if (!within(event.target as Node | null)) done();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (within(document.activeElement)) opener()?.focus();
      done();
    };
    document.addEventListener("pointerdown", onPress);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPress);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
};
