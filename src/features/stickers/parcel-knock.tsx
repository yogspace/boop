"use client";

import { AnimatePresence, m, useAnimate } from "motion/react";
import { type ComponentType, useEffect, useRef, useState } from "react";
import { Dot, Sparkle, Star, Ticks } from "@/components/doodles";
import type { ColorName } from "@/features/calendar/model";
import { Parcel } from "./sticker";

/**
 * A parcel that wants a few taps before it opens (`tapsToOpen`) – a gift on
 * the shelf (features/app/stamp-shelf.tsx), a card's stamp on its page
 * (features/cards/ui/card-panel.tsx). Each tap it answers: a hop, a wiggle,
 * a rubbery squash, a spin – a little bolder every time – and a few ink
 * doodles fly off it. The tap that opens it is its page's (unwrap.tsx);
 * this one only gives a tremble, as if it were about to burst.
 */

/** How many taps a gift takes – a few, never quite the same. */
export const tapsToOpen = () => 3 + Math.floor(Math.random() * 3);

type Keyframes = Record<string, number[]>;

/**
 * Its answers to a tap, in turn – `bold` from a little over half to full.
 * Each ends just where it began.
 */
const MOVES: ((bold: number) => Keyframes)[] = [
  // A hop: down into a squash, up stretched, a little bounce.
  (bold) => ({
    y: [0, 2, -16 * bold, 0, -3 * bold, 0],
    scaleX: [1, 1.12, 0.92, 1.07, 0.98, 1],
    scaleY: [1, 0.86, 1.1, 0.93, 1.02, 1],
    rotate: [0, 0, -5 * bold, 2, 0, 0],
  }),
  // A wiggle – something rattles inside.
  (bold) => ({
    rotate: [0, -14 * bold, 12 * bold, -9 * bold, 6 * bold, -2, 0],
    x: [0, -2, 2, -1.5, 1, 0, 0],
  }),
  // Rubbery: squashed flat, then tall, wobbling out.
  (bold) => ({
    scaleX: [1, 1 + 0.2 * bold, 1 - 0.12 * bold, 1.07, 0.97, 1],
    scaleY: [1, 1 - 0.18 * bold, 1 + 0.14 * bold, 0.95, 1.02, 1],
  }),
  // A spin in the air.
  (bold) => ({
    y: [0, 3, -22 * bold, -14 * bold, 0, -2, 0],
    rotate: [0, -6, 120, 300, 360, 360, 360],
    scaleY: [1, 0.88, 1.06, 1.02, 0.92, 1.02, 1],
  }),
];

/** The tap that opens it: a short tremble. */
const TREMBLE: Keyframes = {
  rotate: [0, -3, 3, -2.5, 2, -1, 0],
  scaleY: [1, 0.97, 0.97, 0.97, 0.98, 0.99, 1],
};

/** What flies off: little marks of the ink – sparkles, stars, dots, ticks. */
const DOODLES: ComponentType<{ className?: string }>[] = [
  Sparkle,
  Star,
  Sparkle,
  Dot,
  Ticks,
];

type Fly = {
  key: string;
  Doodle: ComponentType<{ className?: string }>;
  x: number;
  y: number;
  turn: number;
  size: number;
};

/** A few doodles, flying up and out – more with every tap. */
const flight = (knock: number): Fly[] =>
  Array.from({ length: 2 + Math.min(knock, 4) }, (_, i) => {
    // Up and out – a fan over the parcel, never straight down.
    const angle = -Math.PI * (0.12 + 0.76 * Math.random());
    const far = 34 + Math.random() * 22;
    const Doodle = DOODLES[(knock + i) % DOODLES.length];
    return {
      key: `${knock}-${i}`,
      Doodle,
      x: Math.cos(angle) * far,
      y: Math.sin(angle) * far - 6,
      turn: (Math.random() - 0.5) * 140,
      size: Doodle === Dot ? 7 : Doodle === Ticks ? 20 : 12 + Math.random() * 6,
    };
  });

export const KnockedParcel = ({
  color,
  knocks,
  opening,
  className,
}: {
  color: ColorName;
  /** Taps so far – each new one is answered. */
  knocks: number;
  /** The last tap came: it is about to open. */
  opening: boolean;
  /** For the picture – hidden, once the live one lies over it. */
  className?: string;
}) => {
  const [scope, animate] = useAnimate<HTMLSpanElement>();
  const [flying, setFlying] = useState<Fly[]>([]);
  // The doodles' way out – each tap's go once they have flown.
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const all = timers.current;
    return () => {
      for (const timer of all) clearTimeout(timer);
    };
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: only a new tap moves it
  useEffect(() => {
    if (!scope.current || (!knocks && !opening)) return;
    if (opening) {
      animate(scope.current, TREMBLE, { duration: 0.32, ease: "easeInOut" });
      return;
    }
    const bold = Math.min(1, 0.55 + knocks * 0.15);
    animate(scope.current, MOVES[(knocks - 1) % MOVES.length](bold), {
      duration: 0.6,
      ease: "easeOut",
    });
    const fresh = flight(knocks);
    setFlying((all) => [...all, ...fresh]);
    const gone = setTimeout(() => {
      timers.current.delete(gone);
      setFlying((all) => all.filter((fly) => !fresh.includes(fly)));
    }, 750);
    timers.current.add(gone);
  }, [knocks, opening]);

  return (
    <span className="relative block w-full">
      <span
        className="block w-full"
        ref={scope}
        style={{ transformOrigin: "50% 88%" }}
      >
        <Parcel className={className} color={color} />
      </span>
      {/* The doodles fly from its middle, over everything round it. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-[40%] left-1/2 z-10 h-0 w-0 text-ink"
      >
        <AnimatePresence>
          {flying.map(({ key, Doodle, x, y, turn, size }) => (
            <m.span
              animate={{
                x,
                y,
                rotate: turn,
                scale: [0, 1.15, 0.9],
                opacity: [1, 1, 0],
              }}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              initial={{ x: 0, y: 0, rotate: 0, scale: 0, opacity: 1 }}
              key={key}
              style={{ width: size, height: size }}
              transition={{ duration: 0.7, ease: [0.2, 0.8, 0.3, 1] }}
            >
              <Doodle className="block h-full w-full" />
            </m.span>
          ))}
        </AnimatePresence>
      </span>
    </span>
  );
};
