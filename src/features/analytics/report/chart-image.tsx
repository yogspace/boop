import { ImageResponse } from "next/og";
import type { ReportBucket } from "./buckets";
import { C } from "./colors";

/**
 * The report's pictures – the admin's charts in the mail's colors. Mail
 * programs draw no SVG, but every one shows an embedded PNG; drawn at twice
 * the size, it stays sharp on every screen. Labels are text of their own,
 * not part of the drawing.
 */

/** How the mail refers to the views chart: `cid:<CHART_ID>`. */
export const CHART_ID = "views-chart";

/** Size as shown in the mail – drawn at twice it. */
export const CHART_W = 880;
const CHART_H = 220;
/** The phone's own, narrower one – the wide one would shrink to unreadable. */
export const PHONE_W = 360;
export const PHONE_H = 200;
const SCALE = 2;

const AXIS_W = 34;
const TOP = 26;
const BOTTOM = 24;

// The picture's own ground is the card it sits on.
const P = {
  ground: C.card,
  line: C.line,
  base: C.empty,
  data: C.data,
  before: C.before,
  muted: C.muted,
  ink: C.ink,
};

// next/og's built-in font.
const FONT = "Geist";

/** Round axis steps (1, 2, 5, 10 …) up to at least `max`. */
const axisTicks = (max: number) => {
  const raw = Math.max(1, max / 3);
  const power = 10 ** Math.floor(Math.log10(raw));
  const n = raw / power;
  const step = Math.max(1, (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * power);
  const top = Math.max(step, Math.ceil(max / step) * step);
  const ticks: number[] = [];
  for (let value = 0; value <= top; value += step) ticks.push(value);
  return { top, ticks };
};

type XY = [number, number];

/** A smooth line that never swings past its points (monotone cubic). */
const smooth = (points: XY[]) => {
  const n = points.length;
  if (n === 0) return "";
  if (n < 3) return `M${points.map(([x, y]) => `${x},${y}`).join("L")}`;
  const slopes: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    slopes.push(
      (points[i + 1][1] - points[i][1]) / (points[i + 1][0] - points[i][0] || 1)
    );
  }
  const t = points.map((_, i) => {
    if (i === 0) return slopes[0];
    if (i === n - 1) return slopes[n - 2];
    const [a, b] = [slopes[i - 1], slopes[i]];
    return a * b <= 0 ? 0 : (a + b) / 2;
  });
  for (let i = 0; i < n - 1; i++) {
    if (slopes[i] === 0) {
      t[i] = 0;
      t[i + 1] = 0;
      continue;
    }
    const a = t[i] / slopes[i];
    const b = t[i + 1] / slopes[i];
    const s = a * a + b * b;
    if (s > 9) {
      const k = 3 / Math.sqrt(s);
      t[i] = k * a * slopes[i];
      t[i + 1] = k * b * slopes[i];
    }
  }
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const h = (x1 - x0) / 3;
    d += `C${x0 + h},${y0 + h * t[i]} ${x1 - h},${y1 - h * t[i + 1]} ${x1},${y1}`;
  }
  return d;
};

const fmt = (n: number) => n.toLocaleString("de-DE");

const svgSrc = (svg: string) =>
  `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

/**
 * The page views as a soft indigo area under a smooth line, the period
 * before as a quiet line, the last value as a dot (a ring while still
 * running) – PNG bytes, null without anything to draw. Text and shapes are
 * laid out apart: the drawing as an SVG picture, the numbers on top.
 */
export const viewsChartPng = async (
  buckets: ReportBucket[],
  before?: number[],
  { width: CW, height: CH } = { width: CHART_W, height: CHART_H }
): Promise<Buffer | null> => {
  const n = buckets.length;
  if (n === 0) return null;
  const counts = buckets.map((b) => b.count);
  const max = Math.max(1, ...counts, ...(before ?? []));
  const { top, ticks } = axisTicks(max);
  const plotW = CW - AXIS_W - 8;
  const plotH = CH - TOP - BOTTOM;
  const xOf = (i: number) =>
    AXIS_W + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const yOf = (v: number) => TOP + plotH - (v / top) * plotH;

  const line = smooth(counts.map((v, i): XY => [xOf(i), yOf(v)]));
  const area =
    n > 1 ? `${line}L${xOf(n - 1)},${yOf(0)}L${xOf(0)},${yOf(0)}Z` : "";
  const beforeLine = before
    ? smooth(before.map((v, i): XY => [xOf(i), yOf(v)]))
    : null;
  // Where the labels would crowd (the phone), only every other one.
  const ticked = buckets.filter((b) => b.tick).length;
  const thin = ticked > 1 && plotW / ticked < 56;
  const shownTick = (b: ReportBucket, i: number) =>
    b.tick &&
    (!thin ||
      buckets.slice(0, i + 1).filter((other) => other.tick).length % 2 === 1);
  const peak = counts.indexOf(Math.max(...counts));
  const last = buckets[n - 1];

  // Drawn in the mail's size, scaled up by the viewBox.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CW * SCALE}" height="${CH * SCALE}" viewBox="0 0 ${CW} ${CH}">
    <defs><linearGradient id="wash" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${P.data}" stop-opacity="0.22"/>
      <stop offset="1" stop-color="${P.data}" stop-opacity="0.02"/>
    </linearGradient></defs>
    ${ticks
      .map(
        (v) =>
          `<line x1="${AXIS_W}" x2="${CW}" y1="${yOf(v)}" y2="${yOf(v)}" stroke="${v === 0 ? P.base : P.line}" stroke-width="1"/>`
      )
      .join("")}
    ${beforeLine ? `<path d="${beforeLine}" fill="none" stroke="${P.before}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` : ""}
    ${area ? `<path d="${area}" fill="url(#wash)"/>` : ""}
    <path d="${line}" fill="none" stroke="${P.data}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    ${
      peak >= 0 && counts[peak] > 0
        ? `<circle cx="${xOf(peak)}" cy="${yOf(counts[peak])}" r="4.5" fill="${P.data}" stroke="${P.ground}" stroke-width="2"/>`
        : ""
    }
    <circle cx="${xOf(n - 1)}" cy="${yOf(last.count)}" r="4.5" fill="${last.partial ? P.ground : P.data}" stroke="${last.partial ? P.data : P.ground}" stroke-width="2"/>
  </svg>`;

  // Text over the drawing, positioned like its marks – at twice the size.
  const label = (
    text: string,
    x: number,
    y: number,
    align: "left" | "right" | "center",
    strong = false
  ) => (
    <div
      key={`${text}-${x}-${y}`}
      style={{
        color: strong ? P.ink : P.muted,
        display: "flex",
        fontSize: 11 * SCALE,
        fontWeight: strong ? 700 : 400,
        justifyContent:
          align === "left"
            ? "flex-start"
            : align === "right"
              ? "flex-end"
              : "center",
        left:
          (align === "left" ? x : align === "right" ? x - 120 : x - 60) * SCALE,
        position: "absolute",
        top: y * SCALE,
        width: 120 * SCALE,
      }}
    >
      {text}
    </div>
  );

  const element = (
    <div
      style={{
        background: P.ground,
        display: "flex",
        fontFamily: FONT,
        height: CH * SCALE,
        position: "relative",
        width: CW * SCALE,
      }}
    >
      <img
        alt=""
        height={CH * SCALE}
        src={svgSrc(svg)}
        style={{ position: "absolute" }}
        width={CW * SCALE}
      />
      {ticks.map((v) => label(fmt(v), AXIS_W - 8, yOf(v) - 8, "right"))}
      {buckets.map((b, i) =>
        shownTick(b, i)
          ? label(
              b.label,
              xOf(i),
              CH - 17,
              i === 0 ? "left" : i === n - 1 ? "right" : "center"
            )
          : null
      )}
      {peak >= 0 && counts[peak] > 0
        ? label(
            fmt(counts[peak]),
            xOf(peak),
            yOf(counts[peak]) - 22,
            "center",
            true
          )
        : null}
    </div>
  );

  const response = new ImageResponse(element, {
    width: CW * SCALE,
    height: CH * SCALE,
  });
  return Buffer.from(await response.arrayBuffer());
};

/** An SVG drawing as a picture of `w` × `h` (drawn at twice it). */
const svgPng = async (svg: string, w: number, h: number) => {
  const response = new ImageResponse(
    <div style={{ display: "flex", height: h * SCALE, width: w * SCALE }}>
      <img alt="" height={h * SCALE} src={svgSrc(svg)} width={w * SCALE} />
    </div>,
    { width: w * SCALE, height: h * SCALE }
  );
  return Buffer.from(await response.arrayBuffer());
};

/** Size of a figure's course in its tile, as shown. */
export const SPARK_W = 260;
const SPARK_H = 34;

/**
 * A figure's course as the admin draws it: a quiet line, the last value as
 * the indigo dot – flat along the bottom when there was nothing. Null for
 * fewer than two points.
 */
export const sparkPng = async (values: number[]): Promise<Buffer | null> => {
  const n = values.length;
  if (n < 2) return null;
  const max = Math.max(1, ...values);
  const xOf = (i: number) => 5 + (i / (n - 1)) * (SPARK_W - 10);
  const yOf = (v: number) => 5 + (SPARK_H - 10) * (1 - v / max);
  const path = smooth(values.map((v, i): XY => [xOf(i), yOf(v)]));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SPARK_W * SCALE}" height="${SPARK_H * SCALE}" viewBox="0 0 ${SPARK_W} ${SPARK_H}">
    <path d="${path}" fill="none" stroke="${P.before}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${xOf(n - 1)}" cy="${yOf(values[n - 1])}" r="3.5" fill="${P.data}" stroke="${P.ground}" stroke-width="1.5"/>
  </svg>`;
  return svgPng(svg, SPARK_W, SPARK_H);
};

/** Size of the devices' ring, as shown. */
export const RING_SIZE = 132;

/**
 * The device classes as a ring – the admin's – with the total in the
 * middle. The parts in their colors, a gap of the card's color between.
 */
export const ringPng = async (
  parts: { count: number; color: string }[],
  total: number,
  unit: string
): Promise<Buffer | null> => {
  if (total <= 0) return null;
  const S = RING_SIZE;
  const stroke = 16;
  const r = (S - stroke) / 2;
  const c = 2 * Math.PI * r;
  const gap = parts.length > 1 ? 3 : 0;
  let at = 0;
  const arcs = parts
    .map((part) => {
      const length = (part.count / total) * c;
      const arc = `<circle cx="${S / 2}" cy="${S / 2}" r="${r}" fill="none" stroke="${part.color}" stroke-width="${stroke}" stroke-dasharray="${Math.max(0.5, length - gap)} ${c}" stroke-dashoffset="${-at}" transform="rotate(-90 ${S / 2} ${S / 2})"/>`;
      at += length;
      return arc;
    })
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S * SCALE}" height="${S * SCALE}" viewBox="0 0 ${S} ${S}">${arcs}</svg>`;
  // The total as text in the middle.
  const response = new ImageResponse(
    <div
      style={{
        alignItems: "center",
        background: P.ground,
        display: "flex",
        flexDirection: "column",
        fontFamily: FONT,
        height: S * SCALE,
        justifyContent: "center",
        position: "relative",
        width: S * SCALE,
      }}
    >
      <img
        alt=""
        height={S * SCALE}
        src={svgSrc(svg)}
        style={{ left: 0, position: "absolute", top: 0 }}
        width={S * SCALE}
      />
      <div
        style={{
          color: P.ink,
          display: "flex",
          fontSize: 26 * SCALE,
          lineHeight: 1,
        }}
      >
        {fmt(total)}
      </div>
      <div
        style={{
          color: P.muted,
          display: "flex",
          fontSize: 11 * SCALE,
          marginTop: 4 * SCALE,
        }}
      >
        {unit}
      </div>
    </div>,
    { width: S * SCALE, height: S * SCALE }
  );
  return Buffer.from(await response.arrayBuffer());
};
