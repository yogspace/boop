import type {
  ButtonHTMLAttributes,
  ComponentProps,
  InputHTMLAttributes,
  ReactNode,
} from "react";
import { Link } from "@/features/transitions/link";
import { cn } from "@/lib/cn";
import { Bang, Check, Dot } from "./doodles";

/**
 * Boop's building blocks – marker on paper: every box is a scribbled frame
 * (the `scribble` utilities, styles.css), black on white. What is “on” or
 * the main thing to do is filled with ink; hovering makes a frame's line
 * boil and lifts it a little, pressing squashes it. No color here – color is
 * for the stamps.
 */

/** How a frame answers the pointer: it lifts and tilts a touch, boils, squashes when pressed. */
const LIVELY =
  "transition-transform duration-150 ease-out hover:-translate-y-0.5 hover:-rotate-1 hover:scribble-boil active:translate-y-px active:rotate-0 active:scale-x-[1.02] active:scale-y-[0.94]";

const BUTTON = cn(
  "scribble inline-flex select-none items-center justify-center gap-2 rounded-full font-bold disabled:pointer-events-none disabled:opacity-40",
  LIVELY
);

const VARIANTS = {
  /** The main thing to do: filled with ink. */
  primary: "scribble-ink",
  /** Anything else: just the frame. */
  plain: "",
  /** The quiet one: bare words, a soft blob behind them when hovered. */
  ghost:
    "scribble-bare scribble-clear hover:scribble-soft hover:translate-y-0 hover:rotate-0",
  /** Something goes for good – filled like the main thing; the words say it. */
  danger: "scribble-ink",
  /** @deprecated the candy look's name for `danger`. */
  pink: "scribble-ink",
} as const;

const SIZES = {
  sm: "px-3.5 py-1.5 text-sm",
  md: "px-5 py-2.5 text-base",
  lg: "px-7 py-3.5 text-lg",
} as const;

type Look = { variant?: keyof typeof VARIANTS; size?: keyof typeof SIZES };

export const buttonClass = ({ variant = "primary", size = "md" }: Look = {}) =>
  cn(BUTTON, VARIANTS[variant], SIZES[size]);

export const Button = ({
  variant,
  size,
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & Look) => (
  <button
    className={cn(buttonClass({ variant, size }), className)}
    type={type}
    {...props}
  />
);

export const LinkButton = ({
  variant,
  size,
  className,
  ...props
}: ComponentProps<typeof Link> & Look) => (
  <Link className={cn(buttonClass({ variant, size }), className)} {...props} />
);

/**
 * A round button for one sign (an arrow, a cross, an initial) – 40px. Put a
 * doodle or a letter in it and give it an `aria-label`.
 */
export const ROUND_BUTTON = cn(
  "scribble scribble-sm flex h-10 w-10 shrink-0 select-none items-center justify-center rounded-full font-black disabled:pointer-events-none disabled:opacity-40",
  LIVELY
);

/**
 * A pill to pick one of several (a calendar, a tab): the frame, filled with
 * ink when it is the one – `aria-pressed` or `aria-current` says so.
 */
export const PILL = cn(
  "scribble flex shrink-0 select-none items-center gap-2 rounded-full px-4 py-2 font-bold text-sm aria-pressed:scribble-ink aria-[current=page]:scribble-ink",
  LIVELY
);

/** A small label on something: “today”, a count. */
export const BADGE =
  "scribble scribble-sm scribble-thin inline-flex items-center rounded-full px-2 py-0.5 font-black text-xs leading-4";

export const Card = ({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) => (
  <div className={cn("scribble rounded-[28px] p-6", className)}>{children}</div>
);

/**
 * A field's box – the frame around a control (an input can't draw one
 * itself). The control's focus shows on it.
 */
export const FIELD_BOX = "scribble scribble-field flex rounded-2xl";

/** The control inside a `FIELD_BOX` – an input, a textarea. */
export const FIELD_INPUT =
  "w-full min-w-0 rounded-[inherit] bg-transparent px-4 py-3 text-base outline-none placeholder:text-muted/70";

export const Field = ({
  label,
  hint,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
}) => (
  <label className={cn("flex flex-col gap-2", className)}>
    <span className="font-bold text-sm">{label}</span>
    <span className={FIELD_BOX}>
      <input className={FIELD_INPUT} {...props} />
    </span>
    {hint && <span className="text-muted text-xs">{hint}</span>}
  </label>
);

/**
 * A box to tick – a little scribbled square, the tick drawn into it with the
 * marker, reaching out of it. The browser's own checkbox stays underneath,
 * see-through, for the keyboard, screen readers and the label around it.
 */
export const Checkbox = ({
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) => (
  <span className={cn("relative flex h-5 w-5 shrink-0", className)}>
    <input
      className="peer absolute -inset-1 m-0 cursor-pointer appearance-none rounded-md outline-none disabled:cursor-default"
      type="checkbox"
      {...props}
    />
    <span
      aria-hidden="true"
      className="scribble scribble-sm scribble-thin pointer-events-none h-full w-full rounded-md transition-transform duration-150 peer-hover:-rotate-6 peer-active:scale-90 peer-disabled:opacity-40 peer-focus-visible:outline-3 peer-focus-visible:outline-ink peer-focus-visible:outline-offset-4 peer-focus-visible:outline-dashed"
    />
    <Check className="pointer-events-none absolute -top-1.5 -right-1.5 h-7 w-7 scale-50 opacity-0 transition duration-150 peer-checked:scale-100 peer-checked:opacity-100" />
  </span>
);

/**
 * A message under a form. Trouble gets a thick frame and an exclamation
 * mark, success a tick, anything else a soft grey note – told apart without
 * color.
 */
export const Notice = ({
  tone = "info",
  children,
}: {
  tone?: "info" | "error" | "success";
  children: ReactNode;
}) => (
  <p
    className={cn(
      "scribble flex animate-fade items-start gap-2.5 rounded-2xl px-4 py-3 font-medium text-sm",
      tone === "error" && "scribble-bold font-bold",
      tone === "info" && "scribble-soft scribble-thin"
    )}
    role={tone === "error" ? "alert" : "status"}
  >
    {tone === "error" && <Bang className="h-5 w-5 shrink-0" />}
    {tone === "success" && <Check className="h-5 w-5 shrink-0" />}
    <span className="min-w-0">{children}</span>
  </p>
);

/** The word mark: “boop” and a marker dot. */
export const Logo = ({ className }: { className?: string }) => (
  <span
    className={cn(
      "inline-flex items-baseline font-black text-[28px] leading-none tracking-[-0.06em]",
      className
    )}
    style={{ viewTransitionName: "logo" }}
  >
    boop
    <Dot className="ml-[0.06em] h-[0.3em] w-[0.3em]" />
  </span>
);
