"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { StampSvg } from "@/features/calendar/stamp-svg";
import { cn } from "@/lib/cn";
import type { StickerInput } from "./build";
import { type Looks, watchLook } from "./look";
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
const useStickerImage = (input: StickerInput | null, kind: Pose = "face") => {
  const [picture, setPicture] = useState<Picture>({
    url: null,
    fresh: false,
    failed: false,
  });
  const shape = input?.shape;
  const color = input?.color;
  const drawing = input?.drawing;
  const finish = input?.finish;
  // Before the paint, so a picture that's there never blinks.
  useLayoutEffect(() => {
    if (!(shape && color)) return;
    const stamp = { shape, color, drawing: drawing ?? null, finish };
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
  }, [shape, color, drawing, finish, kind]);
  return picture;
};

/** Grows in softly with a little bounce – a plain fade for reduced motion. */
const POP = "animate-pop-in motion-reduce:animate-fade";

/**
 * A stamp as its 3D picture. Nothing shows while it renders – the box keeps
 * its place – then it pops in; where WebGL is missing, the flat drawing
 * does.
 *
 * It looks at you, a little towards the pointer (look.ts) – `look`: while
 * that is over it, or over the button, link or card (`group`) it is a part
 * of, or the focus is there (`hover`, the default); wherever the pointer is
 * on the page (`always` – for a few stamps in a scene); or not at all
 * (`never`).
 */
export const Sticker = ({
  stamp,
  className,
  label,
  pose = "face",
  look = "hover",
}: {
  stamp: StickerInput;
  className?: string;
  label?: string;
  pose?: Pose;
  look?: Looks;
}) => {
  const { url, fresh, failed } = useStickerImage(stamp, pose);
  const box = useRef<HTMLSpanElement>(null);
  const { shape, color, drawing, finish } = stamp;
  // Only the face looks – and only once its picture is there.
  const looks = pose === "face" && look !== "never" ? look : null;
  useEffect(() => {
    const host = box.current;
    if (!(host && url && looks)) return;
    return watchLook(host, { shape, color, drawing, finish }, looks);
  }, [url, looks, shape, color, drawing, finish]);
  return (
    <span
      className={cn("relative block aspect-square", className)}
      ref={box}
      {...(label && { role: "img", "aria-label": label })}
    >
      {url ? (
        // The picture gives the box its size. Looking, the stamp is drawn
        // live over it, and it hides meanwhile (look.ts).
        <img
          alt=""
          className={cn("h-full w-full object-contain", fresh && POP)}
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
