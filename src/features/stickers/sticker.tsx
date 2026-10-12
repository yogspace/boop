"use client";

import { useEffect, useState } from "react";
import { StampSvg } from "@/features/calendar/stamp-svg";
import { cn } from "@/lib/cn";
import type { StickerInput } from "./build";
import { type Pose, stickerImage } from "./render";

/** The stamp's picture once rendered – null until then (or without WebGL). */
export const useStickerImage = (
  input: StickerInput | null,
  kind: Pose = "face"
) => {
  const [url, setUrl] = useState<string | null>(null);
  const shape = input?.shape;
  const color = input?.color;
  const drawing = input?.drawing;
  useEffect(() => {
    if (!(shape && color)) return;
    let live = true;
    stickerImage({ shape, color, drawing: drawing ?? null }, kind)
      .then((next) => live && setUrl(next))
      .catch(() => live && setUrl(null));
    return () => {
      live = false;
    };
  }, [shape, color, drawing, kind]);
  return url;
};

/**
 * A stamp as its 3D picture – the flat drawing stands in while the picture
 * renders (and stays where WebGL is missing).
 */
export const Sticker = ({
  stamp,
  className,
  label,
  pose = "face",
}: {
  stamp: StickerInput;
  className?: string;
  label?: string;
  pose?: Pose;
}) => {
  const url = useStickerImage(stamp, pose);
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
          className="h-full w-full p-[14%]"
          color={stamp.color}
          drawing={stamp.drawing}
          shape={stamp.shape}
        />
      )}
    </span>
  );
};
