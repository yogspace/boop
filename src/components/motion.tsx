"use client";

import { domAnimation, LazyMotion, MotionConfig } from "motion/react";
import type { ReactNode } from "react";

/**
 * Motion (motion.dev) for what comes and goes – sheets, overlays, a month
 * turning in. Plain CSS stays for the small things (hover, the boiling
 * lines, a pulsing dot).
 *
 * Only `m.*` components, never `motion.*`: `LazyMotion` brings just the DOM
 * animation features, and `strict` makes a stray `motion.*` throw. Whoever
 * asked for less motion gets none of the transforms – opacity still fades.
 */
export const MotionProvider = ({ children }: { children: ReactNode }) => (
  <LazyMotion features={domAnimation} strict>
    <MotionConfig reducedMotion="user">{children}</MotionConfig>
  </LazyMotion>
);

/**
 * Boop's springs. `soft`: things that lie down (a sheet, a note). `bouncy`:
 * things that land (a day, a print) – a touch past the mark, then back.
 */
export const SPRING = {
  soft: { type: "spring", stiffness: 420, damping: 36, mass: 0.9 },
  bouncy: { type: "spring", stiffness: 520, damping: 24 },
} as const;
