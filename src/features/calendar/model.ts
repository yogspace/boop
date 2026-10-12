/**
 * What a calendar is made of – shared by the server (collections, sync) and
 * the app in the browser (offline store). No server imports here.
 *
 * - A **calendar** belongs to its owner; members see and stamp it too.
 * - A **stamp** is a doodle someone drew, in ONE color. It belongs to its
 *   owner – or, with `calendar` set, to that calendar, for all its members.
 * - A **placement** is a stamp put on a day of a calendar: where, turned and
 *   scaled how, stacked in which order. The day itself is no document – it is
 *   the placements with its date.
 *
 * Every one carries `changedAt` (when it was last changed, on the device that
 * changed it – the later change wins) and `deleted` (removed, kept as a
 * marker so other devices learn of it). See features/sync.
 */

/** The colors a stamp or calendar can have – one each, never mixed. */
export const COLORS = {
  ink: "#1d1b3a",
  coral: "#ff8159",
  sun: "#ffc928",
  mint: "#22c993",
  sky: "#3fa9ff",
  grape: "#7c5cff",
  pink: "#ff5fae",
} as const;

export type ColorName = keyof typeof COLORS;

export const COLOR_NAMES = Object.keys(COLORS) as ColorName[];

export const isColorName = (value: unknown): value is ColorName =>
  typeof value === "string" && value in COLORS;

/**
 * The stamp's body: a round or a square stamp. The doodle is drawn onto it
 * and stands out of it – embossed – when the stamp is shown in 3D.
 */
export const SHAPES = ["circle", "square"] as const;
export type StampShape = (typeof SHAPES)[number];

export const isShape = (value: unknown): value is StampShape =>
  typeof value === "string" && (SHAPES as readonly string[]).includes(value);

/**
 * A doodle: strokes of points in a unit square (0–1 both ways), so it draws
 * at any size. `w` is the line width relative to the square's side. Points
 * are flat pairs – [x0, y0, x1, y1, …] – rounded to 3 decimals.
 */
export type Stroke = { w: number; p: number[] };
export type Drawing = { v: 1; strokes: Stroke[] };

/** Limits that keep one stamp small (a few dozen KB at most). */
export const DRAWING_LIMITS = { strokes: 200, points: 4000 } as const;

/** A calendar day, as the date it shows: "2026-10-11" – no time, no zone. */
export type DayKey = string;

export const isDayKey = (value: unknown): value is DayKey => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
};

/** Today on this device, as a day key. */
export const todayKey = (now = new Date()): DayKey =>
  [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");

type Synced = { id: string; changedAt: string; deleted: boolean };

export type CalendarDoc = Synced & {
  name: string;
  color: ColorName;
  owner: string;
  members: string[];
  /** The one every account gets at sign-up – it can't be deleted. */
  personal: boolean;
};

export type StampDoc = Synced & {
  name: string;
  color: ColorName;
  shape: StampShape;
  drawing: Drawing | null;
  owner: string;
  /** Shared with this calendar's members – or null: the owner's own. */
  calendar: string | null;
};

export type PlacementDoc = Synced & {
  calendar: string;
  date: DayKey;
  stamp: string;
  /** Center, in the day's canvas (0–1 both ways). */
  x: number;
  y: number;
  /** Degrees. */
  rotation: number;
  scale: number;
  /** Stacking order – higher lies on top. */
  z: number;
  placedBy: string;
};

/** A drawing as it came from a device – checked and trimmed, or null. */
export const cleanDrawing = (value: unknown): Drawing | null => {
  if (!value || typeof value !== "object") return null;
  const strokes = (value as { strokes?: unknown }).strokes;
  if (!Array.isArray(strokes)) return null;
  const clean: Stroke[] = [];
  let points = 0;
  for (const stroke of strokes.slice(0, DRAWING_LIMITS.strokes)) {
    if (!stroke || typeof stroke !== "object") continue;
    const { w, p } = stroke as { w?: unknown; p?: unknown };
    if (typeof w !== "number" || !Array.isArray(p)) continue;
    const pairs = Math.floor(p.length / 2);
    const take = Math.min(pairs, DRAWING_LIMITS.points - points);
    if (take < 1) break;
    const coords = p.slice(0, take * 2).map((n) => unit(n));
    points += take;
    clean.push({ w: Math.min(Math.max(w, 0.005), 0.2), p: coords });
  }
  return clean.length ? { v: 1, strokes: clean } : null;
};

/** A number clamped into 0–1, rounded to 3 decimals; junk becomes 0.5. */
export const unit = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.round(Math.min(Math.max(value, 0), 1) * 1000) / 1000
    : 0.5;
