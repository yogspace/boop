"use client";

import { useLayoutEffect, useState } from "react";
import { StampSvg } from "@/features/calendar/stamp-svg";
import { cn } from "@/lib/cn";
import type { StickerInput } from "./build";
import { type Pose, renderedStickerImage, stickerImage } from "./render";

type Picture = {
  /** The picture, once rendered. */
  url: string | null;
  /** It came in after the stamp was on the page – it pops in. */
  fresh: boolean;
  /** No picture to be had (no WebGL). */
  failed: boolean;
};

/**
 * The stamp's picture – null until rendered. One rendered before shows from
 * the first paint; a new one keeps the old in place until it's there.
 */
export const useStickerImage = (
  input: StickerInput | null,
  kind: Pose = "face"
) => {
  const [picture, setPicture] = useState<Picture>({
    url: null,
    fresh: false,
    failed: false,
  });
  const shape = input?.shape;
  const color = input?.color;
  const drawing = input?.drawing;
  // Before the paint, so a picture that's there never blinks.
  useLayoutEffect(() => {
    if (!(shape && color)) return;
    const stamp = { shape, color, drawing: drawing ?? null };
    const ready = renderedStickerImage(stamp, kind);
    if (ready) {
      setPicture({ url: ready, fresh: false, failed: false });
      return;
    }
    let live = true;
    stickerImage(stamp, kind)
      .then((url) => live && setPicture({ url, fresh: true, failed: false }))
      .catch(
        () => live && setPicture({ url: null, fresh: true, failed: true })
      );
    return () => {
      live = false;
    };
  }, [shape, color, drawing, kind]);
  return picture;
};

/** Grows in softly with a little bounce – a plain fade for reduced motion. */
const POP = "animate-pop-in motion-reduce:animate-fade";

/**
 * A stamp as its 3D picture. Nothing shows while it renders – the box keeps
 * its place – then it pops in; where WebGL is missing, the flat drawing
 * does.
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
  const { url, fresh, failed } = useStickerImage(stamp, pose);
  return (
    <span
      className={cn("relative block aspect-square", className)}
      {...(label && { role: "img", "aria-label": label })}
    >
      {url ? (
        <img
          alt=""
          className={cn(
            "h-full w-full object-contain drop-shadow-[0_6px_6px_rgba(29,27,58,0.18)]",
            fresh && POP
          )}
          draggable={false}
          // A new picture pops in afresh.
          key={url}
          src={url}
        />
      ) : (
        failed && (
          <StampSvg
            className={cn("h-full w-full p-[14%]", POP)}
            color={stamp.color}
            drawing={stamp.drawing}
            shape={stamp.shape}
          />
        )
      )}
    </span>
  );
};
