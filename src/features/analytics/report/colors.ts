/**
 * The mail report's colors – fixed values, mail programs know no variables.
 * A light, friendly look: warm paper behind white cards, ink text, indigo for
 * the data, a quiet gray for the period before.
 */
export const C = {
  /** The page behind the cards – warm paper. */
  bg: "#fff4e8",
  card: "#ffffff",
  /** A hairline around the cards, so white stands off the paper. */
  cardEdge: "#f4e4d2",
  line: "#ece6f2",
  ink: "#1f1d2b",
  text: "#1f1d2b",
  muted: "#6b6878",
  data: "#5b5bd6",
  // The running bar: held back, but clearly data – not gray.
  dataSoft: "#a9a9ec",
  // What went down, as text (4.96:1 on white).
  down: "#c93a5a",
  empty: "#d9d3e3",
  // The period before and a figure's course: quiet, beside the data.
  before: "#c9c4d4",
  track: "#f3eff8",
} as const;

/**
 * Device classes in fixed colors – checked with the dataviz validator on
 * white (all pass; the names and numbers always stand beside them).
 */
export const DEVICES: Record<string, { name: string; color: string }> = {
  desktop: { name: "Desktop", color: "#5b5bd6" },
  mobile: { name: "Mobil", color: "#ff7a59" },
  tablet: { name: "Tablet", color: "#1baf7a" },
};

/**
 * Heatmap steps on white, one indigo from light to dark – dark = many. From
 * the fifth step on the number is white.
 */
export const RAMP = [
  "#ececfb",
  "#d5d5f6",
  "#b6b6ef",
  "#8f8fe5",
  "#5b5bd6",
  "#4343b0",
  "#2e2e80",
] as const;

/** The first ramp step that carries white text. */
export const RAMP_LIGHT_INK_FROM = 4;
