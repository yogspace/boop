"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { StampSvg } from "@/features/calendar/stamp-svg";
import type { StickerInput } from "@/features/stickers/build";
import { seedOf, TILE, tileOf, withWraps } from "./tile";

/** Prints of this many kinds – each its own blots – take turns on a tile. */
const KINDS = 3;

/**
 * A card's page papered with its stamp: prints of it all over, scattered,
 * each its own size, a little turned (tile.ts) – pale, so what lies on top
 * reads well.
 *
 * The prints are drawn once, into one tile – a picture the browser repeats
 * over the screen, and never draws again: dozens of inked prints, each with
 * its filter, would make a page that stutters. The tile is drawn here,
 * hidden, and taken as it is (`XMLSerializer`); each kind of print is in it
 * once, the places only point at it (`<use>`). The paper stays where it is
 * while the page scrolls over it.
 *
 * It lies under everything – the page's header and footer too – so the
 * page's own white steps aside while it is there. One stamp, one tile:
 * another card is another page.
 */
export const Wallpaper = ({
  stamp: { shape, color, drawing },
  seed,
}: {
  stamp: StickerInput;
  /** The same seed, the same tile – the card's id. */
  seed: string;
}) => {
  const tile = useMemo(
    () => withWraps(tileOf(seedOf(seed)), TILE.width, TILE.height),
    [seed]
  );
  const drawn = useRef<SVGSVGElement>(null);
  const [picture, setPicture] = useState<string | null>(null);

  // Drawn – into a picture. In the browser only: the colors are the
  // palette's, set while rendering (palette-provider.tsx).
  useEffect(() => {
    const svg = drawn.current;
    if (!svg) return;
    const text = new XMLSerializer().serializeToString(svg);
    setPicture(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`);
  }, []);

  // The page's white steps aside – back when the paper goes.
  useEffect(() => {
    if (!picture) return;
    const { body } = document;
    const before = body.style.background;
    body.style.background = "transparent";
    return () => {
      body.style.background = before;
    };
  }, [picture]);

  return (
    <>
      {/* The tile, while it is drawn – never shown. */}
      {!picture && (
        <div hidden>
          <svg
            aria-hidden="true"
            height={TILE.height}
            ref={drawn}
            viewBox={`0 0 ${TILE.width} ${TILE.height}`}
            width={TILE.width}
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              {Array.from({ length: KINDS }, (_, kind) => (
                <svg
                  aria-hidden="true"
                  id={`print-${kind}`}
                  key={kind}
                  viewBox="0 0 1 1"
                >
                  <StampSvg
                    color={color}
                    drawing={drawing}
                    print
                    seed={7 + kind * 31}
                    shape={shape}
                  />
                </svg>
              ))}
            </defs>
            {tile.map((print) => (
              // A print and its copies over the edges are one kind – the
              // next tile goes on with the same blots.
              <use
                height={print.size}
                href={`#print-${print.seed % KINDS}`}
                key={`${print.seed}-${print.x}-${print.y}`}
                transform={`translate(${print.x.toFixed(1)} ${print.y.toFixed(1)}) rotate(${print.turn.toFixed(1)})`}
                width={print.size}
                x={-print.size / 2}
                y={-print.size / 2}
              />
            ))}
          </svg>
        </div>
      )}
      {/* Pale, and in softly once it is there. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10 opacity-35"
      >
        {picture && (
          <div
            className="h-full w-full animate-fade"
            style={{
              backgroundImage: `url("${picture}")`,
              backgroundSize: `${TILE.width}px ${TILE.height}px`,
              backgroundPosition: "center top",
            }}
          />
        )}
      </div>
    </>
  );
};
