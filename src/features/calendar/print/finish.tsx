import { FINISHES, type Finish } from "../palette";
import { random } from "./random";

/**
 * A special color's finish on a print (palette.ts `finishOf`) – what the
 * stamp's ink wears in 3D (stickers/toon/finishes.ts), flat: a gradient or a pattern
 * the print's ink is painted with, in the face's unit square (so the same
 * whatever the print's size; `userSpaceOnUse` – a line has no box of its
 * own to fit one into). Calm enough for a month full of them: the ink's own
 * tones, pale light, a few colors only where the finish is made of them.
 */

/** A color as sRGB, 0–1 – and back, as #rrggbb. */
const channels = (hex: string) => {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => c / 255);
};
const toHex = (color: number[]) =>
  `#${color
    .map((c) =>
      Math.round(Math.min(1, Math.max(0, c)) * 255)
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`;

/** One color towards another, by `t`. */
const mixed = (from: string, to: string, t: number) => {
  const b = channels(to);
  return toHex(channels(from).map((c, i) => c + (b[i] - c) * t));
};

/** Paper white – a print's light. */
const PAPER = "#fffdf6";

/** With this much white. */
const lighter = (hex: string, white: number) => mixed(hex, PAPER, white);

/** Deeper and fuller – the ink's dark tone, as in 3D (`deeper` there). */
const deeper = (hex: string, amount = 1) =>
  toHex(
    channels(hex).map((c) => c + (c * (c * 0.75 + 0.25) * 0.85 - c) * amount)
  );

/** A color of the rainbow, 0–1 round. */
const rainbow = (h: number) =>
  toHex(
    [0, 2 / 3, 1 / 3].map((o) =>
      Math.min(1, Math.max(0, Math.abs(((h + o) % 1) * 6 - 3) - 1))
    )
  );

/** Confetti's colors – the paper's white among them. */
const CONFETTI = ["#f2403a", "#ffcc2e", "#28c794", "#45a6ff", "#ff6bb3", PAPER];

/** A five-pointed star round x, y – its points r out. */
const starPath = (x: number, y: number, r: number, turn: number) => {
  let d = "";
  for (let i = 0; i < 10; i++) {
    const a = turn - Math.PI / 2 + (i * Math.PI) / 5;
    const out = i % 2 ? r * 0.45 : r;
    d += `${i ? "L" : "M"}${(x + Math.cos(a) * out).toFixed(4)} ${(y + Math.sin(a) * out).toFixed(4)}`;
  }
  return `${d}Z`;
};

/** A four-pointed sparkle round x, y – its points r out. */
const sparklePath = (x: number, y: number, r: number) => {
  const k = r * 0.22;
  return `M${x} ${y - r}Q${x + k} ${y - k} ${x + r} ${y}Q${x + k} ${y + k} ${x} ${y + r}Q${x - k} ${y + k} ${x - r} ${y}Q${x - k} ${y - k} ${x} ${y - r}Z`;
};

type Spread = { x: number; y: number; r: number };

/**
 * Things spread over a tile at random, each `r` round – with their copies
 * over its edges, so the tile repeats without seams.
 */
const spread = <T extends Spread>(tile: number, make: () => T, count: number) =>
  Array.from({ length: count }, make).flatMap((item) =>
    [-tile, 0, tile].flatMap((dx) =>
      [-tile, 0, tile]
        .map((dy) => ({ ...item, x: item.x + dx, y: item.y + dy }))
        .filter(
          ({ x, y, r }) =>
            x + r > 0 && y + r > 0 && x - r < tile && y - r < tile
        )
    )
  );

/** A line across the face, from left to right – y of x (0–1). */
const wavy = (y: (x: number) => number) => {
  let d = "";
  for (let i = 0; i <= 32; i++) {
    const x = -0.05 + (i / 32) * 1.1;
    d += `${i ? "L" : "M"}${x.toFixed(4)} ${y(x).toFixed(4)}`;
  }
  return d;
};

type Stop = [offset: number, color: string];

const Stops = ({ stops }: { stops: Stop[] }) =>
  stops.map(([offset, color]) => (
    <stop key={`${offset}-${color}`} offset={offset} stopColor={color} />
  ));

/** One tile of a pattern, `size` square, on the ink's ground. */
const Tile = ({
  id,
  size,
  ground,
  children,
}: {
  id: string;
  size: number;
  ground: string;
  children: React.ReactNode;
}) => (
  <pattern height={size} id={id} patternUnits="userSpaceOnUse" width={size}>
    <rect fill={ground} height={size} width={size} />
    {children}
  </pattern>
);

/** The paint of a print in a finish – `id` is what the ink points at. */
export const FinishPaint = ({
  id,
  finish,
  hex,
}: {
  id: string;
  finish: Finish;
  hex: string;
}) => {
  // Every print of a color alike: its finish is the color's, not the print's.
  const next = random(FINISHES.indexOf(finish) * 101 + 3);
  switch (finish) {
    case "metal": {
      // Light, the color, its dark – a sharp pale glint – and back again.
      const light = lighter(hex, 0.35);
      const glint = lighter(hex, 0.78);
      const dark = deeper(hex);
      return (
        <linearGradient
          gradientUnits="userSpaceOnUse"
          id={id}
          x1={0.15}
          x2={0.85}
          y1={0}
          y2={1}
        >
          <Stops
            stops={[
              [0, light],
              [0.3, hex],
              [0.47, dark],
              [0.47, glint],
              [0.53, glint],
              [0.53, lighter(hex, 0.3)],
              [0.62, hex],
              [0.82, dark],
              [1, light],
            ]}
          />
        </linearGradient>
      );
    }
    case "holo": {
      // The rainbow, pale, over the color.
      const hues = [0, 0.12, 0.3, 0.5, 0.62, 0.8, 0.95];
      return (
        <linearGradient
          gradientUnits="userSpaceOnUse"
          id={id}
          x1={0}
          x2={1}
          y1={0.1}
          y2={0.9}
        >
          <Stops
            stops={hues.map((h, i) => [
              i / (hues.length - 1),
              mixed(hex, lighter(rainbow(h), 0.4), 0.6),
            ])}
          />
        </linearGradient>
      );
    }
    case "heat": {
      // White-hot in the middle, then yellow, orange – and red at the rim.
      const orange = mixed("#ff730f", hex, 0.12);
      const red = mixed("#d11f12", hex, 0.25);
      return (
        <radialGradient
          cx={0.5}
          cy={0.5}
          gradientUnits="userSpaceOnUse"
          id={id}
          r={0.52}
        >
          <Stops
            stops={[
              [0, "#fff7c7"],
              [0.22, "#fff7c7"],
              [0.22, "#ffd442"],
              [0.48, "#ffd442"],
              [0.48, orange],
              [0.74, orange],
              [0.74, red],
              [1, red],
            ]}
          />
        </radialGradient>
      );
    }
    case "wood": {
      // The grain as in 3D: rings round a middle far below, lighter and
      // darker in turn, bending round a knot.
      const rings = Array.from({ length: 18 }, (_, n) =>
        wavy((x) => {
          const r = (n + 17) / 15;
          const side = 0.5 * (x - 0.2);
          const y = -1.7 + Math.sqrt(Math.max(0, r * r - side * side));
          const knot = Math.hypot(x - 0.66, (y + 0.12) * 1.8);
          return (
            0.5 -
            y +
            0.1 * Math.exp(-knot * knot * 70) -
            0.008 * Math.sin(x * 9 + n * 1.7)
          );
        })
      );
      const dark = deeper(hex);
      return (
        <Tile ground={hex} id={id} size={1}>
          {rings.map(
            (d, n) =>
              n % 2 === 1 && (
                <path
                  d={d}
                  fill="none"
                  key={`band-${d}`}
                  stroke={lighter(hex, 0.18)}
                  strokeWidth={0.03}
                />
              )
          )}
          {rings.map((d) => (
            <path
              d={d}
              fill="none"
              key={`line-${d}`}
              stroke={dark}
              strokeWidth={0.009}
            />
          ))}
          <ellipse cx={0.66} cy={0.62} fill={dark} rx={0.016} ry={0.009} />
          <ellipse
            cx={0.66}
            cy={0.62}
            fill="none"
            rx={0.04}
            ry={0.022}
            stroke={dark}
            strokeWidth={0.008}
          />
        </Tile>
      );
    }
    case "marble": {
      // Soft clouds of its light, swirled, and veins winding through them –
      // fine dark ones, finer light ones – each its own way.
      const vein = ([from, tilt, wave, phase]: number[]) =>
        wavy(
          (x) =>
            from +
            x * tilt +
            wave * Math.sin(x * 5.3 + phase) +
            wave * 0.6 * Math.sin(x * 12.7 + phase * 1.7) +
            wave * 0.25 * Math.sin(x * 29 + phase)
        );
      const lines = (
        veins: number[][],
        kind: string,
        stroke: string,
        width: number,
        opacity = 1
      ) =>
        veins.map((at) => (
          <path
            d={vein(at)}
            fill="none"
            key={`${kind}-${at.join()}`}
            stroke={stroke}
            strokeLinecap="round"
            strokeOpacity={opacity}
            strokeWidth={width}
          />
        ));
      return (
        <Tile ground={hex} id={id} size={1}>
          {lines(
            [
              [-0.05, 0.4, 0.1, 0],
              [0.4, -0.2, 0.12, 2.3],
              [0.75, 0.3, 0.09, 4.1],
            ],
            "cloud",
            lighter(hex, 0.45),
            0.14,
            0.55
          )}
          {lines(
            [
              [0.1, 0.55, 0.07, 1],
              [0.55, -0.35, 0.08, 3.2],
              [0.85, 0.15, 0.06, 5.5],
            ],
            "dark",
            deeper(hex),
            0.011
          )}
          {lines(
            [
              [0.3, 0.45, 0.06, 2.2],
              [0.72, -0.25, 0.05, 0.7],
            ],
            "light",
            lighter(hex, 0.7),
            0.007
          )}
        </Tile>
      );
    }
    case "confetti": {
      // Dots and little strips, turned any way, in cheerful colors.
      const size = 0.25;
      const bits = spread(
        size,
        () => ({
          x: next() * size,
          y: next() * size,
          r: 0.03,
          turn: next() * 180,
          strip: next() < 0.55,
          fill: CONFETTI[Math.floor(next() * CONFETTI.length)],
        }),
        12
      );
      return (
        <Tile ground={hex} id={id} size={size}>
          {bits.map(({ x, y, turn, strip, fill }) =>
            strip ? (
              <rect
                fill={fill}
                height={0.009}
                key={`${x}-${y}`}
                rx={0.003}
                transform={`rotate(${turn.toFixed(1)} ${x} ${y})`}
                width={0.032}
                x={x - 0.016}
                y={y - 0.0045}
              />
            ) : (
              <circle cx={x} cy={y} fill={fill} key={`${x}-${y}`} r={0.008} />
            )
          )}
        </Tile>
      );
    }
    case "stars": {
      // Little stars, white and pale yellow, and a fine dust between them.
      const size = 0.22;
      const stars = spread(
        size,
        () => ({
          x: next() * size,
          y: next() * size,
          r: 0.016 + next() * 0.008,
          turn: (next() - 0.5) * 0.6,
          fill: next() < 0.5 ? PAPER : "#ffe98c",
        }),
        5
      );
      const dust = spread(
        size,
        () => ({ x: next() * size, y: next() * size, r: 0.004 }),
        6
      );
      return (
        <Tile ground={deeper(hex, 0.3)} id={id} size={size}>
          {dust.map(({ x, y, r }) => (
            <circle
              cx={x}
              cy={y}
              fill={lighter(hex, 0.6)}
              key={`${x}-${y}`}
              r={r}
            />
          ))}
          {stars.map(({ x, y, r, turn, fill }) => (
            <path d={starPath(x, y, r, turn)} fill={fill} key={`${x}-${y}`} />
          ))}
        </Tile>
      );
    }
    default: {
      // Glitter: fine dots in the ink's tones – dark, light, pale – a few
      // white, and a few little sparkles.
      const size = 0.2;
      const tones = [deeper(hex), lighter(hex, 0.45), lighter(hex, 0.72)];
      const dots = spread(
        size,
        () => {
          const x = next() * size;
          const y = next() * size;
          const r = 0.004 + next() * 0.007;
          const tone = next();
          return {
            x,
            y,
            r,
            fill:
              tone > 0.94
                ? PAPER
                : tones[tone < 0.38 ? 0 : tone < 0.76 ? 1 : 2],
          };
        },
        150
      );
      return (
        <Tile ground={deeper(hex, 0.18)} id={id} size={size}>
          {dots.map(({ x, y, r, fill }) => (
            <circle cx={x} cy={y} fill={fill} key={`${x}-${y}`} r={r} />
          ))}
          {[
            [0.04, 0.05, 0.016],
            [0.15, 0.12, 0.013],
            [0.09, 0.17, 0.011],
          ].map(([x, y, r]) => (
            <path d={sparklePath(x, y, r)} fill={PAPER} key={`${x}-${y}`} />
          ))}
        </Tile>
      );
    }
  }
};
