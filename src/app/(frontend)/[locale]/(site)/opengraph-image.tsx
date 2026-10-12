import { ImageResponse } from "next/og";
import { outlinePath } from "@/features/calendar/outline";
import { knownKey } from "@/features/calendar/palette";
import { strokePath } from "@/features/calendar/stamp-svg";
import { getSite } from "@/features/site/get-site";
import { demoStamp } from "@/features/stickers/demo";
import { getDictionary } from "@/features/translations/get-texts";
import { isLocale } from "@/i18n/config";

/**
 * The picture when a page is shared – the site's look: black marker on white
 * paper, the logo, the promise, and a few stamp prints as the only color.
 * Rendered by Satori (next/og): flexbox and plain SVG only, no filters.
 */
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Boop";

const INK = "#141414";
const PAPER = "#ffffff";

/** A frame drawn freehand round the picture – a little off true. */
const FRAME =
  "M36 42C320 30 880 46 1164 36C1170 210 1160 420 1166 592C880 602 310 588 34 596C40 418 28 214 36 42Z";
/** A marker wave under the promise. */
const WAVE = "M4 14C22 2 40 2 58 14S94 26 112 14S148 2 166 14S202 26 220 14";
/** The logo's dot – the blob from the doodles (components/doodles.tsx). */
const DOT =
  "M12.2 3.4C17.3 3.2 20.9 7 20.6 12.1C20.3 17 16.8 20.7 11.8 20.6C6.9 20.5 3.3 16.9 3.4 11.9C3.5 7.2 7.3 3.6 12.2 3.4Z";

/** The prints: which demo stamp, where, how big, turned how far. */
const PRINTS = [
  { stamp: "heart", x: 790, y: 70, size: 250, turn: -9 },
  { stamp: "star", x: 900, y: 300, size: 220, turn: 7 },
  { stamp: "smile", x: 690, y: 330, size: 190, turn: -4 },
] as const;

/** A stamp's print, flat in its ink: the rim and the doodle. */
const Print = ({
  stamp,
  hex,
  x,
  y,
  size: side,
  turn,
}: {
  stamp: string;
  hex: string;
  x: number;
  y: number;
  size: number;
  turn: number;
}) => {
  const { shape, drawing } = demoStamp(stamp);
  return (
    <svg
      aria-hidden="true"
      height={side}
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: `rotate(${turn}deg)`,
      }}
      viewBox="-0.05 -0.05 1.1 1.1"
      width={side}
    >
      <path
        d={outlinePath(shape)}
        fill="none"
        stroke={hex}
        strokeWidth={0.055}
      />
      {drawing.strokes.map((stroke, i) => (
        <path
          d={strokePath(stroke.p)}
          fill="none"
          key={`stroke-${i}`}
          stroke={hex}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={stroke.w}
        />
      ))}
    </svg>
  );
};

const Image = async ({ params }: { params: Promise<{ locale: string }> }) => {
  const { locale } = await params;
  const t = await getDictionary(isLocale(locale) ? locale : "de");
  // The CMS's colors – a demo stamp's color it lacks shows in its first.
  const { stampColors } = await getSite();
  const hexOf = (key: string) =>
    stampColors.find((color) => color.key === knownKey(key, stampColors))
      ?.hex ?? INK;
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
      {PRINTS.map((print) => (
        <Print
          hex={hexOf(demoStamp(print.stamp).color)}
          key={print.stamp}
          {...print}
        />
      ))}
      {/* The logo – drawn, as the image's default font has no black weight. */}
      <svg aria-hidden="true" height={226} viewBox="0 0 620 265" width={529}>
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
          marginTop: 28,
          fontSize: 50,
          fontWeight: 700,
          lineHeight: 1.15,
          maxWidth: 560,
        }}
      >
        {t.landing.title.join("")}
      </div>
      <svg
        aria-hidden="true"
        height={30}
        style={{ marginTop: 18 }}
        viewBox="0 0 224 28"
        width={240}
      >
        <path
          d={WAVE}
          fill="none"
          stroke={INK}
          strokeLinecap="round"
          strokeWidth={6}
        />
      </svg>
    </div>,
    size
  );
};

export default Image;
