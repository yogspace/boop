import type {
  ButtonHTMLAttributes,
  ComponentProps,
  InputHTMLAttributes,
  ReactNode,
} from "react";
import { Link } from "@/features/transitions/link";
import { cn } from "@/lib/cn";

/**
 * Boop's building blocks – stickers on paper: an ink outline, a hard offset
 * shadow that grows on hover and disappears when pressed.
 */

const BUTTON =
  "inline-flex select-none items-center justify-center gap-2 rounded-full border-2 border-ink font-bold transition-[transform,box-shadow,background-color] duration-150 hover:-translate-x-px hover:-translate-y-px active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:pointer-events-none disabled:opacity-45";

const VARIANTS = {
  primary: "bg-violet text-white shadow-sticker-sm hover:shadow-sticker",
  pink: "bg-pink text-white shadow-sticker-sm hover:shadow-sticker",
  plain: "bg-card text-ink shadow-sticker-sm hover:shadow-sticker",
  ghost:
    "border-transparent bg-transparent text-ink hover:translate-0 hover:bg-ink/5",
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

export const Card = ({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) => (
  <div
    className={cn(
      "rounded-[28px] border-2 border-ink bg-card p-6 shadow-sticker",
      className
    )}
  >
    {children}
  </div>
);

/** A field's box – for inputs, and anything that should look like one. */
export const FIELD_INPUT =
  "rounded-2xl border-2 border-ink bg-card px-4 py-3 text-base outline-none transition-shadow placeholder:text-muted/60 focus:shadow-[0_0_0_4px_var(--color-violet-soft)]";

export const Field = ({
  label,
  hint,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
}) => (
  <label className={cn("flex flex-col gap-1.5", className)}>
    <span className="font-bold text-sm">{label}</span>
    <input className={FIELD_INPUT} {...props} />
    {hint && <span className="text-muted text-xs">{hint}</span>}
  </label>
);

/** A message under a form – success or trouble. */
export const Notice = ({
  tone = "info",
  children,
}: {
  tone?: "info" | "error" | "success";
  children: ReactNode;
}) => (
  <p
    className={cn(
      "animate-fade rounded-2xl border-2 px-4 py-3 font-medium text-sm",
      tone === "error" && "border-pink bg-pink-soft",
      tone === "success" && "border-mint bg-mint-soft",
      tone === "info" && "border-line bg-soft"
    )}
    role={tone === "error" ? "alert" : "status"}
  >
    {children}
  </p>
);

/** The word mark: “boop” with a candy dot. */
export const Logo = ({ className }: { className?: string }) => (
  <span
    className={cn(
      "inline-flex items-baseline font-black text-[28px] leading-none tracking-[-0.06em]",
      className
    )}
    style={{ viewTransitionName: "logo" }}
  >
    boop
    <span className="ml-0.5 inline-block h-[0.32em] w-[0.32em] rounded-full border-2 border-ink bg-pink" />
  </span>
);
