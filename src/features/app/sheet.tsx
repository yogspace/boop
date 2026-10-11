"use client";

import { type ReactNode, useEffect } from "react";
import { Card } from "@/components/ui";

/** A layer over the app – closes with Escape or a click beside it. */
export const Sheet = ({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) => {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        aria-label="Close"
        className="absolute inset-0 bg-ink/40"
        onClick={onClose}
        type="button"
      />
      <Card className="relative max-h-dvh w-full max-w-lg overflow-y-auto rounded-b-none p-5 sm:rounded-b-3xl">
        <div
          aria-label={title}
          aria-modal="true"
          className="flex flex-col gap-4"
          role="dialog"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-doodle font-bold text-2xl">{title}</h2>
            <button
              aria-label="Close"
              className="rounded-full border-2 border-ink px-3 py-1 font-bold"
              onClick={onClose}
              type="button"
            >
              ✕
            </button>
          </div>
          {children}
        </div>
      </Card>
    </div>
  );
};
