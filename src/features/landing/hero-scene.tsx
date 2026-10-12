"use client";

import { Arrow, Sparkle } from "@/components/doodles";
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

/** Where the floating stickers hang around the card. */
const FLOATING = [
  {
    key: "heart",
    className: "-top-6 -left-4 w-24 sm:w-28",
    tilt: -12,
    delay: 0,
  },
  {
    key: "star",
    className: "-top-10 right-6 w-20 sm:w-24",
    tilt: 10,
    delay: 0.8,
  },
  {
    key: "flower",
    className: "-bottom-8 -left-6 w-20 sm:w-24",
    tilt: 8,
    delay: 1.6,
  },
  {
    key: "smile",
    className: "right-[-1.5rem] bottom-10 w-24 sm:w-28",
    tilt: -6,
    delay: 0.4,
  },
];

/**
 * The front page's picture: a month in a tilted 3D card, prints on its days,
 * glossy stamps floating around it.
 */
export const HeroScene = ({ locale }: { locale: Locale }) => {
  const t = dictionaryOf(locale);
  return (
    <div className="relative mx-auto w-full max-w-md py-10 [perspective:1400px]">
      <div
        className="relative rounded-[32px] border-2 border-ink bg-card p-5 shadow-sticker-lg"
        style={{ transform: "rotateX(14deg) rotateY(-16deg) rotateZ(2deg)" }}
      >
        <div className="mb-3 flex items-baseline justify-between">
          <p className="font-black text-2xl">{t.app.months[9]}</p>
          <p className="font-bold text-muted text-sm">2026</p>
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {t.app.weekdays.map((day) => (
            <p
              className="text-center font-black text-[10px] text-muted uppercase"
              key={day}
            >
              {day}
            </p>
          ))}
          {Array.from({ length: 3 }, (_, i) => (
            <span key={`gap-${i}`} />
          ))}
          {Array.from({ length: 31 }, (_, i) => {
            const day = i + 1;
            const prints = PRINTS[day] ?? [];
            const weekend = (3 + i) % 7 >= 5;
            return (
              <div
                className={cn(
                  "flex aspect-square flex-col rounded-xl p-0.5",
                  day === 12
                    ? "border-2 border-violet bg-violet-soft"
                    : weekend
                      ? "bg-pink-soft/70"
                      : "bg-soft"
                )}
                key={day}
              >
                <span className="pl-0.5 font-black text-[9px] leading-none">
                  {day}
                </span>
                <span className="grid flex-1 grid-cols-2 place-items-center">
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
          className={cn(
            "pointer-events-none absolute animate-float",
            item.className
          )}
          key={item.key}
          style={
            {
              "--tilt": `${item.tilt}deg`,
              animationDelay: `${item.delay}s`,
            } as React.CSSProperties
          }
        >
          <Sticker stamp={demoStamp(item.key)} />
        </div>
      ))}

      <div className="pointer-events-none absolute top-1/2 -left-2 hidden -translate-x-full flex-col items-end gap-1 lg:flex">
        <span className="-rotate-6 font-black text-2xl text-pink">boop!</span>
        <Arrow className="h-12 w-16 rotate-12 text-ink" />
      </div>
      <Sparkle className="absolute top-2 left-1/3 h-6 w-6 animate-wiggle text-sun" />
      <Sparkle className="absolute right-1/4 bottom-0 h-4 w-4 animate-wiggle text-sky" />
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
            "--tilt": `${(i % 2 ? 1 : -1) * (4 + i)}deg`,
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
