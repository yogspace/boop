/**
 * What a calendar is made of – shared by the server (collections, sync) and
 * the app in the browser (offline store). No server imports here.
 *
 * - A **calendar** belongs to its owner; members see and stamp it too.
 *   Every account is in one at least (`mayLetGo`).
 * - A **stamp** is a doodle someone drew, in ONE color. It is its owner's,
 *   always: they have it in every calendar they are in. Shared with
 *   calendars (`sharedWith`), those calendars' members have it too – in
 *   every calendar of theirs.
 * - A **placement** is a stamp put on a day of a calendar: where, turned and
 *   scaled how, stacked in which order. The day itself is no document – it is
 *   the placements with its date.
 *
 * Every one carries `changedAt` (when it was last changed, on the device that
 * changed it – the later change wins) and `deleted` (removed, kept as a
 * marker so other devices learn of it). See features/sync.
 */

/**
 * The color a stamp, a calendar or a print has – one each, never mixed: the
 * KEY of a stamp color, e.g. “mint”. Which colors there are, their hex and
 * their names come from the CMS – see palette.ts (`hexOf`, `colorName`,
 * `usePalette`). A key the palette doesn't have (anymore) is no error: it
 * shows in the palette's first color.
 */
export type ColorName = string;

/**
 * The stamp's body – its outline (outline.ts). The doodle is drawn onto it
 * and stands out of it – embossed – when the stamp is shown in 3D.
 */
export const SHAPES = [
  "circle",
  "square",
  "octagon",
  "triangle",
  "diamond",
] as const;
export type StampShape = (typeof SHAPES)[number];

export const isShape = (value: unknown): value is StampShape =>
  typeof value === "string" && (SHAPES as readonly string[]).includes(value);

/**
 * The stamp's face in the unit square – the same in the drawing, in its print
 * and on the 3D rubber: an outline (outline.ts), a rim along it, and the
 * doodle inside. Rim and doodle are what prints – raised on the rubber, in
 * ink on the day.
 */
export const FACE = {
  /** The outline's distance from the unit square's edge. */
  inset: 0.02,
  /** The rim's width, centered on the outline. */
  rim: 0.04,
} as const;

/**
 * A doodle: strokes of points in a unit square (0–1 both ways), so it draws
 * at any size. `w` is the line width relative to the square's side. Points
 * are flat pairs – [x0, y0, x1, y1, …] – rounded to 3 decimals.
 */
export type Stroke = { w: number; p: number[] };

/**
 * A filled area – from an uploaded picture (import-svg.ts): closed outlines,
 * each flat pairs like a stroke's points. Where they overlap they make holes
 * by SVG's rules: non-zero winding, or even-odd when `rule` says so.
 */
export type Fill = { p: number[][]; rule?: "evenodd" };

/**
 * The patterns a stamp's rim can have, like a border on a cake – none of
 * them: a plain line. Drawn by outline.ts (`rimLine`).
 */
export const RIMS = [
  "dashed",
  "dotted",
  "wave",
  "zigzag",
  "scallop",
  "double",
] as const;
export type RimPattern = (typeof RIMS)[number];

export const isRim = (value: unknown): value is RimPattern =>
  typeof value === "string" && (RIMS as readonly string[]).includes(value);

/**
 * Drawings made before pictures could be uploaded have no `fills`. With
 * `inverted` the stamp prints the other way round: its whole face in ink,
 * the doodle cut out of it. `rim` is its rim's pattern (none: plain). A
 * `special` stamp is for the big days: its prints come out bigger and
 * glitter.
 */
export type Drawing = {
  v: 1;
  strokes: Stroke[];
  fills?: Fill[];
  inverted?: true;
  rim?: RimPattern;
  special?: true;
};

/** How much bigger a special stamp's print is than a normal one's. */
export const SPECIAL_SIZE = 1.3;

/**
 * Limits that keep one stamp small (a few dozen KB at most) – the points of
 * strokes and fills counted together.
 */
export const DRAWING_LIMITS = {
  strokes: 200,
  fills: 100,
  points: 4000,
} as const;

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
  /**
   * Made at sign-up – from when that one couldn't be deleted. Kept, but
   * nothing goes by it any more: it is a calendar like any other.
   */
  personal: boolean;
};

/**
 * Whether an account may let go of a calendar – delete it or leave it: only
 * while it is in another one, too. Nobody is without a calendar.
 */
export const mayLetGo = (id: string, mine: Iterable<string>) => {
  for (const other of mine) if (other !== id) return true;
  return false;
};

export type StampDoc = Synced & {
  name: string;
  color: ColorName;
  shape: StampShape;
  drawing: Drawing | null;
  owner: string;
  /**
   * The calendars whose members may stamp with it too – none: only its
   * owner. Anyone but the owner learns only of the calendars they are in.
   */
  sharedWith: string[];
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
  /** The ink it was stamped with – null on old prints: the stamp's color. */
  ink: ColorName | null;
  placedBy: string;
};

/**
 * The calendars a stamp is shared with, whatever shape it is in: its
 * `sharedWith` and – from before a stamp could be shared with several – the
 * one `calendar`. Ids or the documents themselves; none twice.
 */
export const sharedWithOf = (stamp: {
  sharedWith?: unknown;
  calendar?: unknown;
}): string[] => {
  const refs = [
    ...(Array.isArray(stamp.sharedWith) ? stamp.sharedWith : []),
    stamp.calendar,
  ];
  const ids = refs.map((ref) => {
    if (typeof ref === "string") return ref;
    return ref && typeof ref === "object" && "id" in ref ? String(ref.id) : "";
  });
  return [...new Set(ids.filter(Boolean))];
};

/**
 * A stamp as a device may have kept it: in today's shape, or – by an app
 * from before – with the one `calendar` instead of `sharedWith`.
 */
export type KeptStampDoc = Omit<StampDoc, "sharedWith"> & {
  sharedWith?: string[];
  calendar?: string | null;
};

/** A stamp in today's shape, whichever it was kept in. */
export const stampDoc = (doc: KeptStampDoc): StampDoc => {
  const { calendar: _, ...stamp } = doc;
  return { ...stamp, sharedWith: sharedWithOf(doc) };
};

/**
 * The stamps an account stamps with – the same in every calendar: its own
 * first, then those shared with a calendar it is in. A stamp someone only
 * placed there (it is on the device so its prints show) is none of them.
 */
export const stampsOf = <
  T extends { owner: string; sharedWith: readonly string[] },
>(
  stamps: readonly T[],
  me: string | undefined,
  calendars: Iterable<string>
): T[] => {
  const mine = new Set(calendars);
  return [
    ...stamps.filter((stamp) => stamp.owner === me),
    ...stamps.filter(
      (stamp) =>
        stamp.owner !== me && stamp.sharedWith.some((id) => mine.has(id))
    ),
  ];
};

/** A drawing as it came from a device – checked and trimmed, or null. */
export const cleanDrawing = (value: unknown): Drawing | null => {
  if (!value || typeof value !== "object") return null;
  const { strokes, fills } = value as { strokes?: unknown; fills?: unknown };
  if (!Array.isArray(strokes)) return null;
  let points = 0;
  // Fills first – an outline cut short would be another shape, so one that
  // doesn't fit whole is left out.
  const areas: Fill[] = [];
  for (const fill of Array.isArray(fills)
    ? fills.slice(0, DRAWING_LIMITS.fills)
    : []) {
    if (!fill || typeof fill !== "object") continue;
    const { p, rule } = fill as { p?: unknown; rule?: unknown };
    if (!Array.isArray(p)) continue;
    const rings: number[][] = [];
    for (const ring of p) {
      if (!Array.isArray(ring)) continue;
      const pairs = Math.floor(ring.length / 2);
      if (pairs < 3 || points + pairs > DRAWING_LIMITS.points) continue;
      points += pairs;
      rings.push(ring.slice(0, pairs * 2).map((n) => unit(n)));
    }
    if (rings.length) {
      areas.push({ p: rings, ...(rule === "evenodd" && { rule }) });
    }
  }
  const clean: Stroke[] = [];
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
  if (!(clean.length || areas.length)) return null;
  const { inverted, rim, special } = value as {
    inverted?: unknown;
    rim?: unknown;
    special?: unknown;
  };
  return {
    v: 1,
    strokes: clean,
    ...(areas.length && { fills: areas }),
    ...(inverted === true && { inverted: true }),
    ...(isRim(rim) && { rim }),
    ...(special === true && { special: true }),
  };
};

/** A number clamped into 0–1, rounded to 3 decimals; junk becomes 0.5. */
export const unit = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.round(Math.min(Math.max(value, 0), 1) * 1000) / 1000
    : 0.5;
