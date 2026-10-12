"use client";

import { useEffect, useState } from "react";
import { StampSvg } from "@/features/calendar/stamp-svg";
import { cn } from "@/lib/cn";
import type { StickerInput } from "./build";
import { stickerImage } from "./render";

/** The sticker's picture once it is rendered – null until then (or without WebGL). */
export const useStickerImage = (input: StickerInput | null) => {
  const [url, setUrl] = useState<string | null>(null);
  const shape = input?.shape;
  const color = input?.color;
  const drawing = input?.drawing;
  useEffect(() => {
    if (!(shape && color)) return;
    let live = true;
    stickerImage({ shape, color, drawing: drawing ?? null })
      .then((next) => live && setUrl(next))
      .catch(() => live && setUrl(null));
    return () => {
      live = false;
    };
  }, [shape, color, drawing]);
  return url;
};

/**
 * A stamp as its 3D sticker – the flat drawing stands in while the picture
 * renders (and stays where WebGL is missing).
 */
export const Sticker = ({
  stamp,
  className,
  label,
}: {
  stamp: StickerInput;
  className?: string;
  label?: string;
}) => {
  const url = useStickerImage(stamp);
  return (
    <span
      className={cn("relative block aspect-square", className)}
      {...(label && { role: "img", "aria-label": label })}
    >
      {url ? (
        <img
          alt=""
          className="h-full w-full object-contain drop-shadow-[0_6px_6px_rgba(29,27,58,0.18)]"
          draggable={false}
          src={url}
        />
      ) : (
        <StampSvg
          className="h-full w-full p-[12%]"
          color={stamp.color}
          drawing={stamp.drawing}
          shape={stamp.shape}
        />
      )}
    </span>
  );
};
