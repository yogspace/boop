"use client";

import {
  type CSSProperties,
  type FocusEvent,
  type PointerEvent,
  type ReactNode,
  useRef,
} from "react";

/** What to spread on the thing named. */
type Anchor = {
  style: CSSProperties;
  onPointerEnter: (event: PointerEvent) => void;
  onPointerLeave: () => void;
  onFocus: (event: FocusEvent<HTMLElement>) => void;
  onBlur: () => void;
  onClick: () => void;
};

/**
 * A name on a little tag, hung from what it names when the mouse points at
 * it or the keyboard comes to it – the stamps on the shelf. A popover in the
 * top layer, placed by anchor positioning (`.name-tag`, styles.css): the
 * shelf's stamps are tilted, and a tilted box would be the tag's whole world.
 * Nothing on touch – there the stamp's sheet shows its name.
 */
export const NameTag = ({
  id,
  text,
  children,
}: {
  id: string;
  text: string;
  children: (anchor: Anchor) => ReactNode;
}) => {
  const tag = useRef<HTMLSpanElement>(null);
  const name = `--name-${id}`;
  const show = (on: boolean) => {
    const el = tag.current;
    if (!el || !text) return;
    try {
      if (on) el.showPopover();
      else el.hidePopover();
    } catch {
      // Already in that state.
    }
  };
  const anchor: Anchor = {
    style: { anchorName: name } as CSSProperties,
    onPointerEnter: (event: PointerEvent) => {
      if (event.pointerType === "mouse") show(true);
    },
    onPointerLeave: () => show(false),
    onFocus: (event: FocusEvent<HTMLElement>) => {
      if (event.currentTarget.matches(":focus-visible")) show(true);
    },
    onBlur: () => show(false),
    onClick: () => show(false),
  };
  return (
    <>
      {children(anchor)}
      {text && (
        <span
          aria-hidden="true"
          className="name-tag scribble scribble-sm rounded-full bg-card px-3 py-1 font-bold text-sm"
          popover="manual"
          ref={tag}
          style={{ positionAnchor: name } as CSSProperties}
        >
          {text}
        </span>
      )}
    </>
  );
};
