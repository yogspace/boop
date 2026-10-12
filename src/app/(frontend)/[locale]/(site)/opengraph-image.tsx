import { ImageResponse } from "next/og";
import { isLocale } from "@/i18n/config";
import { dictionaryOf } from "@/i18n/dictionaries";

/** The picture when a page is shared – logo, the promise, a few stamps. */
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Boop";

const Dot = ({
  color,
  x,
  y,
  r,
}: {
  color: string;
  x: number;
  y: number;
  r: number;
}) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      width: r * 2,
      height: r * 2,
      borderRadius: r,
      border: "8px solid #1d1b3a",
      background: color,
      display: "flex",
    }}
  />
);

const Image = async ({ params }: { params: Promise<{ locale: string }> }) => {
  const { locale } = await params;
  const t = dictionaryOf(isLocale(locale) ? locale : "de");
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: 80,
        background: "#f5f2ff",
        color: "#1d1b3a",
        position: "relative",
      }}
    >
      <Dot color="#ff5fae" r={70} x={900} y={70} />
      <Dot color="#ffc928" r={50} x={1010} y={260} />
      <Dot color="#22c993" r={60} x={860} y={400} />
      <div style={{ fontSize: 150, fontWeight: 800, display: "flex" }}>
        boop<span style={{ color: "#ff5fae" }}>.</span>
      </div>
      <div style={{ fontSize: 52, fontWeight: 700, maxWidth: 760 }}>
        {t.landing.title.join("")}
      </div>
    </div>,
    size
  );
};

export default Image;
