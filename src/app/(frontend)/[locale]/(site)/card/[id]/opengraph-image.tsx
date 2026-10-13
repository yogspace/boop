import { ImageResponse } from "next/og";
import type { Drawing, StampShape } from "@/features/calendar/model";
import { outlinePath, rimLine } from "@/features/calendar/outline";
import { knownKey } from "@/features/calendar/palette";
import { strokePath } from "@/features/calendar/stamp-svg";
import { getSite } from "@/features/site/get-site";
import { demoStamp } from "@/features/stickers/demo";
import { getDictionary } from "@/features/translations/get-texts";
import { isLocale } from "@/i18n/config";
import { readCard } from "./read";

/**
 * The picture a messenger shows of a card's link: the stamp's print, big,
 * a few pale ones around it – the page's wallpaper in small – and “Anna is
 * sending you a stamp”, in the site's look ((site)/opengraph-image.tsx).
 * Rendered by Satori (next/og): flexbox and plain SVG only, no filters.
 */
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Boop";
// Like the page: a card can go any time, and its picture with it.
export const dynamic = "force-dynamic";

const INK = "#141414";
const MUTED = "#6b6b6b";
const PAPER = "#ffffff";

/** A frame drawn freehand round the picture – a little off true. */
const FRAME =
  "M36 42C320 30 880 46 1164 36C1170 210 1160 420 1166 592C880 602 310 588 34 596C40 418 28 214 36 42Z";
/** The logo's dot – the blob from the doodles (components/doodles.tsx). */
const DOT =
  "M12.2 3.4C17.3 3.2 20.9 7 20.6 12.1C20.3 17 16.8 20.7 11.8 20.6C6.9 20.5 3.3 16.9 3.4 11.9C3.5 7.2 7.3 3.6 12.2 3.4Z";

/** The prints: the card's own, big – and pale ones scattered about. */
const PRINTS = [
  { x: 716, y: 112, size: 400, turn: -7, opacity: 1 },
  { x: 596, y: 44, size: 112, turn: 14, opacity: 0.2 },
  { x: 1052, y: 20, size: 124, turn: -16, opacity: 0.2 },
  { x: 1070, y: 468, size: 132, turn: 10, opacity: 0.2 },
  { x: 604, y: 486, size: 104, turn: -11, opacity: 0.2 },
  { x: 480, y: 500, size: 84, turn: 18, opacity: 0.2 },
] as const;

type Look = { shape: StampShape; drawing: Drawing | null };

/** The SVG path of one filled area – each of its outlines, closed. */
const fillPath = (rings: readonly (readonly number[])[]) =>
  rings
    .filter((ring) => ring.length >= 6)
    .map((ring) => {
      let d = `M${ring[0]} ${ring[1]}`;
      for (let i = 2; i < ring.length - 1; i += 2) {
        d += `L${ring[i]} ${ring[i + 1]}`;
      }
      return `${d}Z`;
    })
    .join("");

/**
 * A stamp's print, flat in its ink (calendar/stamp-svg.tsx, without the
 * ink's blots): the rim – or its pattern – and the doodle; an inverted one
 * the other way round, its face in ink and the doodle in paper.
 */
const Print = ({
  look: { shape, drawing },
  hex,
  n,
  x,
  y,
  size: side,
  turn,
  opacity,
}: {
  look: Look;
  hex: string;
  /** Tells its clip path from the others'. */
  n: number;
  x: number;
  y: number;
  size: number;
  turn: number;
  opacity: number;
}) => {
  const inverted = Boolean(drawing?.inverted);
  const rim = drawing?.rim
    ? rimLine(shape, drawing.rim, { cut: inverted })
    : null;
  const ink = inverted ? PAPER : hex;
  return (
    <svg
      aria-hidden="true"
      height={side}
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: `rotate(${turn}deg)`,
        opacity,
      }}
      viewBox="-0.05 -0.05 1.1 1.1"
      width={side}
    >
      <defs>
        <clipPath id={`face-${n}`}>
          <path d={outlinePath(shape)} />
        </clipPath>
      </defs>
      <path
        d={outlinePath(shape)}
        fill={inverted ? hex : "none"}
        stroke={rim && !inverted ? "none" : hex}
        strokeWidth={0.04}
      />
      {rim && (
        <path
          d={rim.d}
          fill="none"
          stroke={ink}
          strokeLinecap={rim.cap}
          strokeLinejoin="round"
          strokeWidth={rim.width}
        />
      )}
      <g clipPath={`url(#face-${n})`}>
        {drawing?.fills?.map((fill, i) => (
          <path
            d={fillPath(fill.p)}
            fill={ink}
            fillRule={fill.rule ?? "nonzero"}
            key={`fill-${i}`}
          />
        ))}
        {drawing?.strokes.map((stroke, i) => (
          <path
            d={strokePath(stroke.p)}
            fill="none"
            key={`stroke-${i}`}
            stroke={ink}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={stroke.w}
          />
        ))}
      </g>
    </svg>
  );
};

const Image = async ({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) => {
  const { locale, id } = await params;
  const t = await getDictionary(isLocale(locale) ? locale : "de");
  const card = await readCard(id);
  // No such card (anymore): a stamp of Boop's own, and no name.
  const stamp = card?.stamp ?? { ...demoStamp("heart"), name: "" };
  // The CMS's colors – one it lacks shows in its first.
  const { stampColors } = await getSite();
  const hex =
    stampColors.find(
      (color) => color.key === knownKey(stamp.color, stampColors)
    )?.hex ?? INK;
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "0 96px",
        background: PAPER,
        color: INK,
        position: "relative",
      }}
    >
      <svg
        aria-hidden="true"
        height={630}
        style={{ position: "absolute", left: 0, top: 0 }}
        viewBox="0 0 1200 630"
        width={1200}
      >
        <path
          d={FRAME}
          fill="none"
          stroke={INK}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={7}
        />
      </svg>
      {PRINTS.map((print, n) => (
        <Print hex={hex} key={print.x} look={stamp} n={n} {...print} />
      ))}
      {/* The logo – drawn, as the image's default font has no black weight. */}
      <svg aria-hidden="true" height={94} viewBox="0 0 620 265" width={220}>
        <g fill="none" stroke={INK} strokeLinecap="round" strokeWidth={34}>
          <path d="M34 17V168" />
          <circle cx={78} cy={124} r={44} />
          <circle cx={214} cy={124} r={44} />
          <circle cx={350} cy={124} r={44} />
          <path d="M442 80V246" />
          <circle cx={486} cy={124} r={44} />
        </g>
        <path d={DOT} fill={INK} transform="translate(556 140) scale(2.6)" />
      </svg>
      <div
        style={{
          display: "flex",
          marginTop: 30,
          fontSize: 60,
          fontWeight: 700,
          lineHeight: 1.12,
          maxWidth: 560,
        }}
      >
        {t.card.title(card?.from.split(" ")[0] ?? "")}
      </div>
      {stamp.name && (
        <div
          style={{
            display: "flex",
            marginTop: 20,
            fontSize: 34,
            fontWeight: 700,
            color: MUTED,
            maxWidth: 560,
          }}
        >
          {stamp.name}
        </div>
      )}
    </div>,
    size
  );
};

export default Image;
