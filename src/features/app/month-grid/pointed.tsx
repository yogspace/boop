"use client";

import { AnimatePresence, m } from "motion/react";
import { type RefObject, useEffect, useState } from "react";
import { SPRING } from "@/components/motion";
import { WEEK } from "./days";

/**
 * The soft blob under the pointer – one for the whole table of the month
 * (month-grid.tsx), lying under its days: it comes up where the pointer
 * comes in, glides along from day to day and fades once the pointer is
 * gone; pressed, it gives a little. A finger doesn't hover: there it shows
 * only while a day is pressed.
 *
 * A thin wash of the pencil's tone rather than paper grey itself: on the
 * paper it comes out as that grey, and on the weekend's wash – nearly that
 * grey already – a shade darker. On a calendar's own paper (`PAPER`,
 * calendar/tint.ts) the pencil is in its color, and so is the blob.
 *
 * It keeps the pointer's place to itself, so a month's days and prints
 * aren't drawn again as the pointer wanders, and listens on the table it
 * lies in. Days are told by where the pointer is, not by which one it
 * entered: the blob stays put while a month turns in under it.
 */
export const Pointed = ({
  rows,
  table,
}: {
  rows: number;
  table: RefObject<HTMLElement | null>;
}) => {
  const [cell, setCell] = useState<number | null>(null);
  const [pressed, setPressed] = useState(false);

  useEffect(() => {
    const box = table.current;
    if (!box) return;
    /** The cell under the pointer – they are all the same size. */
    const cellAt = (event: PointerEvent) => {
      const { left, top, width, height } = box.getBoundingClientRect();
      const col = Math.floor(((event.clientX - left) / width) * WEEK);
      const row = Math.floor(((event.clientY - top) / height) * rows);
      const inside = col >= 0 && col < WEEK && row >= 0 && row < rows;
      return inside ? row * WEEK + col : null;
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType !== "touch") setCell(cellAt(event));
    };
    const down = (event: PointerEvent) => {
      setCell(cellAt(event));
      setPressed(true);
    };
    const up = (event: PointerEvent) => {
      setPressed(false);
      if (event.pointerType === "touch") setCell(null);
    };
    const leave = () => {
      setPressed(false);
      setCell(null);
    };
    box.addEventListener("pointermove", move);
    box.addEventListener("pointerdown", down);
    box.addEventListener("pointerup", up);
    box.addEventListener("pointercancel", leave);
    box.addEventListener("pointerleave", leave);
    return () => {
      box.removeEventListener("pointermove", move);
      box.removeEventListener("pointerdown", down);
      box.removeEventListener("pointerup", up);
      box.removeEventListener("pointercancel", leave);
      box.removeEventListener("pointerleave", leave);
    };
  }, [rows, table]);

  // A shorter month may have turned in – its table ends sooner.
  const at = cell !== null && cell < rows * WEEK ? cell : null;
  // In its own widths: a day is one wide, one high.
  const place = at !== null && {
    x: `${(at % WEEK) * 100}%`,
    y: `${Math.floor(at / WEEK) * 100}%`,
  };

  return (
    <AnimatePresence>
      {place && (
        <m.span
          animate={{ ...place, opacity: 1, scale: pressed ? 0.9 : 1 }}
          aria-hidden="true"
          className="pointer-events-none absolute top-0 left-0 flex aspect-square w-1/7 will-change-transform"
          exit={{
            opacity: 0,
            scale: 0.8,
            transition: { duration: 0.16, ease: "easeIn" },
          }}
          // Where the pointer came in – it doesn't glide there from afar.
          initial={{ ...place, opacity: 0, scale: 0.8 }}
          key="blob"
          transition={{ ...SPRING.soft, opacity: { duration: 0.14 } }}
        >
          <span className="scribble scribble-bare scribble-sm flex-1 rounded-xl [--scribble-fill:color-mix(in_oklab,var(--color-line)_40%,transparent)] [--scribble-inset:4px]" />
        </m.span>
      )}
    </AnimatePresence>
  );
};
