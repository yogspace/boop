import { twMerge } from "tailwind-merge";

/** Class names joined, later Tailwind classes winning over earlier ones. */
export const cn = (...classes: (string | false | null | undefined)[]) =>
  twMerge(classes.filter(Boolean).join(" "));
