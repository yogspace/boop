import type { ReactNode, SVGProps } from "react";
import { Arrow, Sparkle, Ticks } from "@/components/doodles";
import type { Drawing } from "@/features/calendar/model";
import { StampSvg } from "@/features/calendar/stamp-svg";
import { demoStamp } from "@/features/stickers/demo";
import { Sticker } from "@/features/stickers/sticker";
import { cn } from "@/lib/cn";

/**
 * “How it works” on the front page – three steps as a little picture story,
 * each on a slip of paper set down freely: the mail that confirms the
 * account (with a tick stamped on it), the first stamp being drawn, and the
 * stamp coming down on a day – boop! The marker draws the pictures; the
 * only color is, as everywhere, the stamps and their prints.
 *
 * The pictures only decorate (hidden from screen readers) – the words under
 * them say the step.
 */

/**
 * How each slip lies – none straight; pointed at, it straightens. Only side
 * by side: on a phone a slip is as wide as the screen, and tilted its frame
 * would reach past the edge (the page would scroll sideways a little).
 */
const SLIP_TILTS = ["sm:-rotate-2", "sm:rotate-1", "sm:-rotate-1"];
/** … and its number, set on its corner with a bit of a swing. */
const NUMBER_TILTS = ["-rotate-12", "rotate-6", "-rotate-6"];

/** The marker's line – like the doodles' (components/doodles.tsx). */
const line = (props: SVGProps<SVGSVGElement>) => ({
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  strokeWidth: 3,
  ...props,
});

/** A tick, as a stamp's doodle – the print on the confirming mail. */
const TICK: Drawing = {
  v: 1,
  strokes: [{ w: 0.11, p: [0.27, 0.53, 0.43, 0.69, 0.74, 0.33] }],
};

const HEART = demoStamp("heart");
const SMILE = demoStamp("smile");

/** 1 – a letter, and “confirmed” stamped on its corner. */
const MailScene = () => (
  <span className="relative block w-32 -rotate-3">
    <svg aria-hidden="true" {...line({ viewBox: "0 0 120 84" })}>
      <path d="M8 14C42 11 80 11 112 13C114 34 114 54 112 72C78 75 42 75 8 72C5 52 5 34 8 14Z" />
      <path d="M10 17C28 32 44 46 60 56C77 45 94 31 110 16" />
    </svg>
    <StampSvg
      className="absolute -right-4 -bottom-4 w-14 rotate-12 mix-blend-multiply"
      color="mint"
      drawing={TICK}
      print
      seed={3}
      shape="circle"
    />
    <Ticks className="absolute -top-1 -right-7 h-4 w-7 rotate-[38deg]" />
  </span>
);

/** 2 – a stamp's face, and the pencil just lifting off its doodle. */
const DrawScene = () => (
  <span className="relative block w-28">
    <StampSvg
      className="w-full rotate-3"
      color={HEART.color}
      drawing={HEART.drawing}
      filled
      shape={HEART.shape}
    />
    <svg
      aria-hidden="true"
      {...line({ viewBox: "0 0 64 64" })}
      className="absolute -right-9 -bottom-3 w-16 rotate-6"
    >
      <path d="M45 7C49 10 53 14 57 19C46 31 34 42 23 53C18 55 13 56 8 57C9 52 10 47 12 42C23 30 34 19 45 7Z" />
      <path d="M38 15C42 18 46 22 49 26" />
      <path d="M12 42C16 45 20 49 23 53" />
    </svg>
    <Sparkle className="absolute -top-2 -left-5 h-6 w-6 -rotate-12" />
  </span>
);

/** 3 – three days of a calendar, the stamp just off the middle one: boop! */
const BoopScene = () => (
  <span className="relative mt-12 block w-52">
    <svg aria-hidden="true" {...line({ viewBox: "0 0 150 56" })}>
      <path d="M4 6C50 4 100 4 146 6C148 20 148 36 146 50C100 52 50 52 4 50C2 36 2 20 4 6Z" />
      <path d="M52 5C51 20 53 36 52 51M99 5C100 20 98 36 99 51" />
    </svg>
    {/* The days' numbers, as in the month. */}
    {[11, 12, 13].map((day, n) => (
      <span
        className="absolute top-[14%] font-black text-[10px] leading-none"
        key={day}
        style={{ left: `${7 + n * 31.5}%` }}
      >
        {day}
      </span>
    ))}
    {/* The print it leaves, in its day … */}
    <StampSvg
      className="absolute top-[54%] left-1/2 w-12 -translate-x-1/2 -translate-y-1/2 mix-blend-multiply"
      color={SMILE.color}
      drawing={SMILE.drawing}
      print
      seed={11}
      shape={SMILE.shape}
    />
    <Ticks className="absolute -top-5 left-[39%] h-5 w-9" />
    {/* … and the stamp itself, lifted off again. */}
    <span className="absolute -top-20 left-[52%] w-24 rotate-12">
      <Sticker stamp={SMILE} />
    </span>
  </span>
);

const SCENES: ReactNode[] = [
  <MailScene key="mail" />,
  <DrawScene key="draw" />,
  <BoopScene key="boop" />,
];

export const Steps = ({ steps }: { steps: readonly string[] }) => (
  <ol className="grid gap-x-12 gap-y-14 pt-4 sm:grid-cols-3">
    {steps.map((step, i) => (
      // A `group`: its stamp looks at the pointer anywhere on the slip
      // (stickers/look.ts).
      <li className="group relative" key={step}>
        <div
          className={cn(
            "scribble relative flex h-full flex-col gap-5 rounded-[28px] px-5 pt-8 pb-6 transition-transform duration-200 ease-out hover:-translate-y-1 hover:rotate-0 hover:scribble-boil",
            SLIP_TILTS[i % SLIP_TILTS.length]
          )}
        >
          <span
            className={cn(
              "scribble scribble-sm scribble-ink absolute -top-5 -left-3 flex h-12 w-12 items-center justify-center rounded-full font-black text-xl",
              NUMBER_TILTS[i % NUMBER_TILTS.length]
            )}
          >
            {i + 1}
          </span>
          <span
            aria-hidden="true"
            className="flex h-36 items-center justify-center"
          >
            {SCENES[i % SCENES.length]}
          </span>
          <p className="text-pretty text-center font-bold text-lg leading-snug">
            {step}
          </p>
        </div>
        {/* On to the next: a loop of an arrow – beside the slip, or below
            it where they stand one under the other. */}
        {i < steps.length - 1 && (
          <Arrow
            className={cn(
              "pointer-events-none absolute z-10 h-9 w-12",
              "max-sm:-bottom-12 max-sm:left-1/2 max-sm:-translate-x-1/2 max-sm:rotate-[70deg]",
              "sm:top-10 sm:-right-12 sm:-rotate-12"
            )}
          />
        )}
      </li>
    ))}
  </ol>
);
