"use client";

import {
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
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
  /** It came over the flat drawing, shown meanwhile – the two cross. */
  over: boolean;
};

/**
 * While a picture is on its way the flat drawing stands in – from this long
 * on (ms): one kept on the device is there sooner, and nothing blinks.
 */
const WAIT = 160;
/** The picture and the drawing cross over this long (ms) – `animate-fade`. */
const CROSS = 240;
/** On screen, or about to be (of the screen, round it): wanted first. */
const NEAR = "25%";

/**
 * The stamp's picture – null until rendered. One rendered before shows from
 * the first paint; a new one keeps the old in place until it's there. One
 * on screen (`box`) is rendered before those that aren't.
 */
const useStickerImage = (
  input: StickerInput | null,
  kind: Pose,
  box: RefObject<HTMLElement | null>
) => {
  const [picture, setPicture] = useState<Picture>({
    url: null,
    fresh: false,
    over: false,
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
      setPicture({ url: ready, fresh: false, over: false });
      return;
    }
    let live = true;
    const since = performance.now();
    const host = box.current;
    const watch = host && typeof IntersectionObserver === "function";
    // Seen on the page: it moves up.
    const observer = watch
      ? new IntersectionObserver(
          (entries) => {
            if (!entries.some((entry) => entry.isIntersecting)) return;
            observer?.disconnect();
            stickerImage(stamp, kind, { soon: true }).catch(() => undefined);
          },
          { rootMargin: NEAR }
        )
      : null;
    if (host) observer?.observe(host);
    stickerImage(stamp, kind, { soon: !observer })
      .then(
        (url) =>
          live &&
          setPicture((was) => ({
            url,
            fresh: true,
            over: !was.url && performance.now() - since > WAIT,
          }))
      )
      // No picture to be had (no WebGL): the drawing stays.
      .catch(() => live && setPicture({ url: null, fresh: true, over: false }));
    return () => {
      live = false;
      observer?.disconnect();
    };
  }, [shape, color, drawing, finish, kind, box]);
  // Crossed over: the drawing goes.
  useEffect(() => {
    if (!picture.over) return;
    const done = setTimeout(
      () => setPicture((was) => ({ ...was, over: false })),
      CROSS
    );
    return () => clearTimeout(done);
  }, [picture.over]);
  return picture;
};

/** Grows in softly with a little bounce – a plain fade for reduced motion. */
const POP = "animate-pop-in motion-reduce:animate-fade";

/**
 * A stamp as its 3D picture. While it is on its way the flat drawing stands
 * in – the box keeps its place – and the picture fades in over it; one that
 * comes quickly (kept on the device) pops in right away. Where WebGL is
 * missing, the drawing stays.
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
  const box = useRef<HTMLSpanElement>(null);
  const { url, fresh, over } = useStickerImage(stamp, pose, box);
  const { shape, color, drawing, finish } = stamp;
  // Only the face looks – and only once its picture is there.
  const looks = pose === "face" && look !== "never" ? look : null;
  useEffect(() => {
    const host = box.current;
    if (!(host && url && looks)) return;
    return watchLook(host, { shape, color, drawing, finish }, looks);
  }, [url, looks, shape, color, drawing, finish]);
  // The flat drawing: in a moment, while there's no picture (for good, if
  // there's none to be had); going, as the picture comes over it. Laid out
  // without classes – the CMS has none – under the picture.
  const flat = !url || over;
  return (
    <span
      className={cn("relative block aspect-square", className)}
      ref={box}
      {...(label && { role: "img", "aria-label": label })}
    >
      {flat && (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            padding: "14%",
            boxSizing: "border-box",
            animation: url
              ? `fade ${CROSS}ms ease-in reverse both`
              : `fade ${CROSS}ms ease-out ${WAIT}ms both`,
          }}
        >
          <StampSvg
            className="block h-full w-full"
            color={stamp.color}
            drawing={stamp.drawing}
            shape={stamp.shape}
          />
        </span>
      )}
      {url && (
        // The picture fills the box. Looking, the stamp is drawn live over
        // it, and it hides meanwhile (look.ts).
        <img
          alt=""
          className={cn(
            "h-full w-full object-contain",
            fresh && (over ? "animate-fade" : POP)
          )}
          draggable={false}
          // A new picture pops in afresh.
          key={url}
          src={url}
          style={{ position: "relative" }}
        />
      )}
    </span>
  );
};
