import type { Variants } from "motion/react";
import { SPRING } from "@/components/motion";

/**
 * A new month comes in like a page turned (month-grid.tsx): its days in a
 * wave from the side the months went (from the right when forward), each a
 * little tilted, settling with a spring – then their prints land, as if
 * stamped just now. The month before slides away the other way. The first
 * one comes up from below.
 */
export type Turn = { dir: number; order: number };

/** Where a day's wave starts: the side it comes from, top row first. */
export const orderOf = (cell: number, dir: number) =>
  (dir > 0 ? 6 - (cell % 7) : cell % 7) + Math.floor(cell / 7);

export const DAY_TURN: Variants = {
  hidden: ({ dir }: Turn) => ({
    opacity: 0,
    x: dir * 14,
    y: dir ? 0 : 8,
    rotate: dir * -4,
    scale: 0.88,
  }),
  shown: ({ order }: Turn) => ({
    opacity: 1,
    x: 0,
    y: 0,
    rotate: 0,
    scale: 1,
    transition: { ...SPRING.bouncy, delay: order * 0.022 },
  }),
};

export const PRINT_TURN: Variants = {
  hidden: { opacity: 0, scale: 1.35, rotate: -8 },
  shown: ({ order }: Turn) => ({
    opacity: 1,
    scale: 1,
    rotate: 0,
    transition: { ...SPRING.bouncy, delay: order * 0.022 + 0.18 },
  }),
};

/** A special day's frame – and a note's writing – show once the prints landed. */
export const FRAME_TURN: Variants = {
  hidden: { opacity: 0 },
  shown: ({ order }: Turn) => ({
    opacity: 1,
    transition: { duration: 0.3, delay: order * 0.022 + 0.3 },
  }),
};

export const MONTH_TURN: Variants = {
  hidden: {},
  shown: {},
  gone: (dir: number) => ({
    opacity: 0,
    x: dir * -24,
    transition: { duration: 0.16, ease: "easeIn" },
  }),
};
