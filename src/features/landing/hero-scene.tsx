"use client";

import { useEffect, useRef } from "react";
import { Arrow, Star, Ticks } from "@/components/doodles";
import { Ruling } from "@/components/ruling";
import { StampSvg } from "@/features/calendar/stamp-svg";
import { DEMO_STAMPS, demoStamp } from "@/features/stickers/demo";
import { Sticker } from "@/features/stickers/sticker";
import type { Locale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";

/** Which demo prints sit on which day of the little month. */
const PRINTS: Record<number, string[]> = {
  2: ["heart"],
  5: ["sun", "smile"],
  9: ["star"],
  11: ["flower"],
  14: ["cloud", "heart"],
  17: ["smile"],
  20: ["star", "sun", "heart"],
  23: ["flower"],
  26: ["heart", "cloud"],
  28: ["sun"],
};

/**
 * Where the floating stickers hang around the card – `depth`: how near they
 * are, so how much they follow the pointer.
 */
const FLOATING = [
  {
    key: "heart",
    className: "-top-6 -left-2 w-24 sm:-left-4 sm:w-28",
    tilt: -8,
    delay: 0,
    depth: 1,
  },
  {
    key: "star",
    className: "-top-10 right-6 w-20 sm:w-24",
    tilt: 7,
    delay: 0.8,
    depth: 0.6,
  },
  {
    key: "flower",
    className: "-bottom-8 -left-2 w-20 sm:-left-6 sm:w-24",
    tilt: 5,
    delay: 1.6,
    depth: 0.75,
  },
  {
    key: "smile",
    className: "-right-2 bottom-10 w-24 sm:-right-6 sm:w-28",
    tilt: -5,
    delay: 0.4,
    depth: 0.9,
  },
];

/** How far off the pointer still turns a sticker all the way (px). */
const REACH = 420;
/** The most a sticker leans (deg) and drifts (px) – times its depth. */
const LEAN = 16;
const DRIFT = 8;

/** The card's turn – a touch towards the pointer (x, y: −1…1). */
const cardTurn = (x = 0, y = 0) =>
  `rotateX(${14 - y * 2.5}deg) rotateY(${-16 + x * 3}deg) rotateZ(2deg)`;

/** A sticker leaning towards the pointer and drifting to it a little. */
const lean = (x: number, y: number, depth: number) =>
  `translate3d(${x * DRIFT * depth}px, ${y * DRIFT * depth}px, 0) perspective(500px) rotateX(${-y * LEAN * depth}deg) rotateY(${x * LEAN * depth}deg)`;

/**
 * The scene follows the pointer: the stickers (`data-depth`) lean towards it
 * and drift a little, the card (`data-card`) turns a touch. Each on a soft
 * spring, the nearer ones quicker. Written straight to the elements – no
 * renders; off for touch and reduced motion.
 */
const useFollow = (scene: React.RefObject<HTMLDivElement | null>) => {
  useEffect(() => {
    const root = scene.current;
    if (
      !root ||
      !matchMedia("(hover: hover) and (pointer: fine)").matches ||
      matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    const followers = [
      ...root.querySelectorAll<HTMLElement>("[data-card], [data-depth]"),
    ].map((el) => {
      const depth = Number(el.dataset.depth ?? 0.6);
      const stiffness = 50 + 50 * depth;
      return {
        el,
        turn: el.dataset.card
          ? cardTurn
          : (x: number, y: number) => lean(x, y, depth),
        stiffness,
        // A little under critical – it settles with a soft bounce.
        damping: 2 * Math.sqrt(stiffness) * 0.62,
        // Its middle in the scene, unturned.
        mx: 0,
        my: 0,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
      };
    });
    const measure = () => {
      for (const f of followers) {
        f.mx = f.el.offsetLeft + f.el.offsetWidth / 2;
        f.my = f.el.offsetTop + f.el.offsetHeight / 2;
      }
    };
    measure();

    let pointer: { x: number; y: number } | null = null;
    let seen = false;
    let frame = 0;
    let last = 0;
    const tick = (now: number) => {
      const dt = Math.min(1 / 30, (now - last) / 1000);
      last = now;
      const box = root.getBoundingClientRect();
      let moving = false;
      for (const f of followers) {
        // Where the pointer is, seen from it: −1…1, easing off far away.
        let tx = 0;
        let ty = 0;
        if (pointer) {
          const dx = (pointer.x - box.left - f.mx) / REACH;
          const dy = (pointer.y - box.top - f.my) / REACH;
          const ease = 1 / Math.hypot(1, dx, dy);
          tx = dx * ease;
          ty = dy * ease;
        }
        f.vx += (f.stiffness * (tx - f.x) - f.damping * f.vx) * dt;
        f.vy += (f.stiffness * (ty - f.y) - f.damping * f.vy) * dt;
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        const still =
          Math.abs(tx - f.x) + Math.abs(ty - f.y) < 1e-3 &&
          Math.abs(f.vx) + Math.abs(f.vy) < 1e-3;
        if (still) {
          f.x = tx;
          f.y = ty;
          f.vx = 0;
          f.vy = 0;
        } else {
          moving = true;
        }
        f.el.style.transform = f.turn(f.x, f.y);
      }
      frame = moving ? requestAnimationFrame(tick) : 0;
    };
    const wake = () => {
      if (frame || !seen) return;
      last = performance.now();
      frame = requestAnimationFrame(tick);
    };

    const move = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      pointer = { x: event.clientX, y: event.clientY };
      wake();
    };
    // Off the page: back to rest.
    const out = (event: PointerEvent) => {
      if (event.relatedTarget) return;
      pointer = null;
      wake();
    };
    const visible = new IntersectionObserver(([entry]) => {
      seen = entry.isIntersecting;
      wake();
    });
    visible.observe(root);
    const resized = new ResizeObserver(measure);
    resized.observe(root);
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerout", out);
    window.addEventListener("scroll", wake, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      visible.disconnect();
      resized.disconnect();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerout", out);
      window.removeEventListener("scroll", wake);
    };
  }, [scene]);
};

/**
 * The front page's picture: a month in a tilted 3D card, prints on its days,
 * glossy stamps floating around it – turning to the pointer. The card is
 * drawn with the marker (a scribbled sheet, a ruled table, the weekend
 * hatched, today's number in an ink blob); the stamps and their prints are
 * the color.
 */
export const HeroScene = ({ locale }: { locale: Locale }) => {
  const t = dictionaryOf(locale);
  const scene = useRef<HTMLDivElement>(null);
  useFollow(scene);
  return (
    <div
      className="relative mx-auto w-full max-w-md py-10 [perspective:1400px]"
      ref={scene}
    >
      <div
        className="scribble rounded-[32px] p-5"
        data-card
        style={{ transform: cardTurn() }}
      >
        <div className="mb-3 flex items-baseline justify-between">
          <p className="font-black text-2xl">{t.app.months[9]}</p>
          <p className="font-bold text-muted text-sm">2026</p>
        </div>
        <div className="grid grid-cols-7 pb-1">
          {t.app.weekdays.map((day) => (
            <p
              className="text-center font-black text-[10px] text-muted uppercase"
              key={day}
            >
              {day}
            </p>
          ))}
        </div>
        <div className="relative isolate grid grid-cols-7">
          <Ruling rows={5} shade={2} />
          {Array.from({ length: 3 }, (_, i) => (
            <span key={`gap-${i}`} />
          ))}
          {Array.from({ length: 31 }, (_, i) => {
            const day = i + 1;
            const prints = PRINTS[day] ?? [];
            return (
              <div
                className="flex aspect-square min-h-0 flex-col p-1"
                key={day}
              >
                <span
                  className={cn(
                    "self-start font-black text-[9px] leading-none",
                    day === 12 &&
                      "scribble scribble-sm scribble-ink -m-0.5 flex h-[1.8em] w-[1.8em] items-center justify-center rounded-full"
                  )}
                >
                  {day}
                </span>
                <span
                  className={cn(
                    "grid min-h-0 flex-1 auto-rows-fr place-items-center",
                    prints.length === 1 ? "grid-cols-1" : "grid-cols-2"
                  )}
                >
                  {prints.slice(0, 4).map((key) => {
                    const stamp = demoStamp(key);
                    return (
                      <StampSvg
                        className="h-[95%] w-[95%] mix-blend-multiply"
                        color={stamp.color}
                        drawing={stamp.drawing}
                        key={key}
                        print
                        shape={stamp.shape}
                      />
                    );
                  })}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {FLOATING.map((item) => (
        <div
          className={cn("pointer-events-none absolute", item.className)}
          data-depth={item.depth}
          key={item.key}
        >
          <div
            className="animate-float"
            style={
              {
                "--tilt": `${item.tilt}deg`,
                animationDelay: `${item.delay}s`,
              } as React.CSSProperties
            }
          >
            <Sticker stamp={demoStamp(item.key)} />
          </div>
        </div>
      ))}

      <div className="pointer-events-none absolute top-1/2 -left-2 hidden -translate-x-full flex-col items-end gap-1 lg:flex">
        <span className="-rotate-6 font-black text-2xl">boop!</span>
        <Arrow className="h-12 w-16 rotate-12" />
      </div>
      <Star className="pointer-events-none absolute top-1 left-1/3 h-6 w-6 -rotate-12" />
      <Ticks className="pointer-events-none absolute right-[22%] bottom-1 h-5 w-8 rotate-[150deg]" />
    </div>
  );
};

/** A row of the demo stickers – for empty states and the closing band. */
export const StickerRow = ({ className }: { className?: string }) => (
  <div className={cn("flex items-center justify-center gap-2", className)}>
    {DEMO_STAMPS.map((stamp, i) => (
      <div
        className="w-14 animate-float sm:w-16"
        key={stamp.key}
        style={
          {
            "--tilt": `${(i % 2 ? 1 : -1) * (3 + i * 0.7)}deg`,
            animationDelay: `${i * 0.35}s`,
          } as React.CSSProperties
        }
      >
        <Sticker stamp={stamp} />
      </div>
    ))}
  </div>
);

/** One demo sticker – the features' pictures. */
export const DemoSticker = ({
  name,
  className,
}: {
  name: string;
  className?: string;
}) => <Sticker className={className} stamp={demoStamp(name)} />;
