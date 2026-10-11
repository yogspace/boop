import Link from "next/link";
import type {
  ButtonHTMLAttributes,
  ComponentProps,
  InputHTMLAttributes,
  ReactNode,
} from "react";
import { cn } from "@/lib/cn";

/**
 * The few building blocks every page uses – ink outline, a hard shadow,
 * round corners. Simple on purpose: the look is still to come.
 */

const BUTTON =
  "inline-flex items-center justify-center gap-2 rounded-full border-2 border-ink px-5 py-2.5 font-bold shadow-sticker-sm transition active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:pointer-events-none disabled:opacity-50";

const VARIANTS = {
  primary: "bg-coral text-ink",
  plain: "bg-card text-ink",
  quiet: "border-transparent bg-transparent shadow-none underline-offset-4 hover:underline",
} as const;

type Variant = keyof typeof VARIANTS;

export const Button = ({
  variant = "primary",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) => (
  <button
    className={cn(BUTTON, VARIANTS[variant], className)}
    type={type}
    {...props}
  />
);

export const LinkButton = ({
  variant = "primary",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant }) => (
  <Link className={cn(BUTTON, VARIANTS[variant], className)} {...props} />
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
      "rounded-3xl border-2 border-ink bg-card p-6 shadow-sticker",
      className
    )}
  >
    {children}
  </div>
);

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
    <input
      className="rounded-2xl border-2 border-ink bg-paper px-4 py-2.5 text-base outline-none focus:bg-card"
      {...props}
    />
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
      "rounded-2xl border-2 px-4 py-3 text-sm",
      tone === "error" && "border-coral bg-coral/10",
      tone === "success" && "border-mint bg-mint/10",
      tone === "info" && "border-line bg-paper"
    )}
    role={tone === "error" ? "alert" : "status"}
  >
    {children}
  </p>
);
