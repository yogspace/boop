"use client";

import {
  type ReactNode,
  type RefObject,
  startTransition,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ColorName } from "@/features/calendar/model";
import { hexOf } from "@/features/calendar/palette";
import { StampSvg } from "@/features/calendar/stamp-svg";
import { cn } from "@/lib/cn";
import type { StickerInput } from "./build";
import { type Looks, watchLook } from "./look";
import {
  type Pose,
  parcelImage,
  parcelKey,
  renderedParcelImage,
  renderedStickerImage,
  stickerImage,
  stickerKey,
} from "./render";

type Picture = {
  /** The picture, once rendered. */
  url: string | null;
  /** It came in after the stamp was on the page – it pops in. */
  fresh: boolean;
  /**
   * The flat drawing stands in – there's no picture yet (or none to be had,
   * no WebGL).
   */
  flat: boolean;
  /** It came over the flat drawing – the two cross. */
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

/** A picture to show: what it is by, and how to have it (render.ts). */
type Source = {
  key: string;
  /** The picture, if it's there already. */
  ready: () => string | null;
  /** The picture – `soon`: it's on screen, someone waits for it. */
  load: (soon: boolean) => Promise<string>;
};

/**
 * The picture – null until rendered. One rendered before shows from the
 * first paint; a new one keeps the old in place until it's there. One on
 * screen (`box`) is rendered before those that aren't.
 */
const usePicture = (
  source: Source | null,
  box: RefObject<HTMLElement | null>
) => {
  const [picture, setPicture] = useState<Picture>({
    url: null,
    fresh: false,
    flat: false,
    over: false,
  });
  const key = source?.key;
  // Before the paint, so a picture that's there never blinks.
  // biome-ignore lint/correctness/useExhaustiveDependencies: a source is its key
  useLayoutEffect(() => {
    if (!source) return;
    const ready = source.ready();
    if (ready) {
      setPicture({ url: ready, fresh: false, flat: false, over: false });
      return;
    }
    let live = true;
    // Once it has waited a moment and is on screen, still without a picture
    // (nor an old one), the drawing comes – as a transition, which React
    // draws a few at a time when many come together.
    let seen = false;
    let waited = false;
    const stand = () => {
      if (!(live && seen && waited)) return;
      startTransition(() =>
        setPicture((was) => (was.url ? was : { ...was, flat: true }))
      );
    };
    const wait = setTimeout(() => {
      waited = true;
      stand();
    }, WAIT);
    const host = box.current;
    const watch = host && typeof IntersectionObserver === "function";
    // Seen on the page: it moves up.
    const observer = watch
      ? new IntersectionObserver(
          (entries) => {
            if (!entries.some((entry) => entry.isIntersecting)) return;
            observer?.disconnect();
            seen = true;
            stand();
            source.load(true).catch(() => undefined);
          },
          { rootMargin: NEAR }
        )
      : null;
    if (host) observer?.observe(host);
    seen = !observer;
    source
      .load(!observer)
      .then(
        (url) =>
          live &&
          setPicture((was) => ({
            url,
            fresh: true,
            flat: false,
            over: !was.url && was.flat,
          }))
      )
      // No picture to be had (no WebGL): the drawing stays.
      .catch(
        () =>
          live &&
          setPicture({ url: null, fresh: true, flat: true, over: false })
      )
      .finally(() => clearTimeout(wait));
    return () => {
      live = false;
      clearTimeout(wait);
      observer?.disconnect();
    };
  }, [key, box]);
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
 * A picture's box: the picture once it's there, and the flat drawing
 * (`drawing`) while there's none – for good, if there's none to be had –
 * going as the picture comes over it. Laid out without classes – the CMS
 * has none – under the picture.
 */
const Framed = ({
  picture: { url, fresh, flat, over },
  drawing,
  box,
  className,
  label,
}: {
  picture: Picture;
  drawing: ReactNode;
  box: RefObject<HTMLSpanElement | null>;
  className?: string;
  label?: string;
}) => (
  <span
    className={cn("relative block aspect-square", className)}
    ref={box}
    {...(label && { role: "img", "aria-label": label })}
  >
    {((flat && !url) || over) && (
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          padding: "14%",
          boxSizing: "border-box",
          animation: `fade ${CROSS}ms ${url ? "ease-in reverse" : "ease-out"} both`,
        }}
      >
        {drawing}
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
  const { shape, color, drawing, finish } = stamp;
  const source = useMemo((): Source | null => {
    if (!(shape && color)) return null;
    const input = { shape, color, drawing: drawing ?? null, finish };
    return {
      key: stickerKey(input, pose),
      ready: () => renderedStickerImage(input, pose),
      load: (soon) => stickerImage(input, pose, { soon }),
    };
  }, [shape, color, drawing, finish, pose]);
  const picture = usePicture(source, box);
  const { url } = picture;
  // Only the face looks – and only once its picture is there.
  const looks = pose === "face" && look !== "never" ? look : null;
  useEffect(() => {
    const host = box.current;
    if (!(host && url && looks)) return;
    return watchLook(host, { shape, color, drawing, finish }, looks);
  }, [url, looks, shape, color, drawing, finish]);
  return (
    <Framed
      box={box}
      className={className}
      drawing={
        <StampSvg
          className="block h-full w-full"
          color={stamp.color}
          drawing={stamp.drawing}
          shape={stamp.shape}
        />
      }
      label={label}
      picture={picture}
    />
  );
};

/**
 * A gift's parcel as its 3D picture (parcel.ts) – in the gift's color, as
 * the shelf and the pile show one still wrapped. It comes like a stamp's
 * picture, a flat parcel standing in.
 */
export const Parcel = ({
  color,
  className,
  label,
}: {
  color: ColorName;
  className?: string;
  label?: string;
}) => {
  const box = useRef<HTMLSpanElement>(null);
  const source = useMemo(
    (): Source => ({
      key: parcelKey(color),
      ready: () => renderedParcelImage(color),
      load: (soon) => parcelImage(color, { soon }),
    }),
    [color]
  );
  return (
    <Framed
      box={box}
      className={className}
      drawing={<ParcelSvg color={color} />}
      label={label}
      picture={usePicture(source, box)}
    />
  );
};

/**
 * A parcel drawn flat – box, lid, ribbon and bow, in the colors of its
 * picture: the paper a light tint, the ribbon the full color.
 */
const ParcelSvg = ({ color }: { color: ColorName }) => {
  const hex = hexOf(color);
  const paper = `color-mix(in srgb, ${hex} 50%, white)`;
  const line = {
    stroke: "#111014",
    strokeWidth: 3,
    strokeLinejoin: "round",
    strokeLinecap: "round",
  } as const;
  return (
    <svg
      aria-hidden="true"
      style={{ display: "block", width: "100%", height: "100%" }}
      viewBox="0 0 100 100"
    >
      <rect
        height="46"
        rx="6"
        style={{ fill: paper }}
        width="64"
        x="18"
        y="44"
        {...line}
      />
      <rect
        height="46"
        style={{ fill: hex }}
        width="12"
        x="44"
        y="44"
        {...line}
      />
      <rect
        height="17"
        rx="6"
        style={{ fill: paper }}
        width="76"
        x="12"
        y="32"
        {...line}
      />
      <rect
        height="17"
        style={{ fill: hex }}
        width="12"
        x="44"
        y="32"
        {...line}
      />
      <path
        d="M50 31 C40 14 25 18 31 28 C34 33 44 32 50 31 Z M50 31 C60 14 75 18 69 28 C66 33 56 32 50 31 Z"
        style={{ fill: hex }}
        {...line}
      />
      <ellipse cx="50" cy="30" rx="6" ry="5" style={{ fill: hex }} {...line} />
    </svg>
  );
};
