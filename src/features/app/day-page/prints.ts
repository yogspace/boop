import type { Snapshot } from "valtio";
import {
  type PlacementDoc,
  SPECIAL_SIZE,
  type StampDoc,
} from "@/features/calendar/model";

/**
 * A print on a day's page (day-page.tsx), as numbers: how wide it comes
 * out, how far it is turned and how that reads, its own imperfections – and
 * where on the page a point of the screen lies, and back.
 */

export type Stamp = Snapshot<StampDoc>;
export type Print = Snapshot<PlacementDoc>;

/** How far a finger moves before a tap becomes a drag. */
export const DRAG = 8;

/**
 * A print's width on the page, and how much of the unit square its picture
 * spans (stamp-svg.tsx) – so one unit, the stamp's width, is a quarter page.
 */
export const PRINT = 0.26;
export const VIEW_BOX = 1.04;

/** A stamp's print width on the page – a special stamp's is bigger. */
export const printOf = (stamp: Stamp | null | undefined) =>
  stamp?.drawing?.special ? PRINT * SPECIAL_SIZE : PRINT;

/** How much of the next print's preview shows. */
export const GHOST = 0.4;

/** Turning the stamp in hand: degrees per tap on a button or key. */
export const STEP = 15;

/** A print's own imperfections, from its id. */
export const seedOf = (id: string) =>
  (Number.parseInt(id.slice(0, 6), 16) || 7) % 997;

/** Where a print lies – what moving it changes. */
export type Spot = Pick<PlacementDoc, "x" | "y" | "z">;

export const within = (value: number) => Math.min(Math.max(value, 0), 1);

/** An angle as a print keeps it: whole degrees, −180…180. */
export const tidy = (degrees: number) => {
  const turned = Math.round(degrees) % 360;
  if (turned > 180) return turned - 360;
  return turned < -180 ? turned + 360 : turned;
};

/** An angle as it reads: “15°”, “−30°” – a real minus. */
export const angleOf = (degrees: number) =>
  `${degrees < 0 ? "−" : ""}${Math.abs(degrees)}°`;

/**
 * How far a wheel event turns the stamp, in degrees: a notch (about 100 px)
 * is 6°. Small steps count a little more than their share – a trackpad turns
 * it smoothly, a slow wheel still visibly – and none is more than 12°.
 */
export const wheelTurn = (event: WheelEvent) => {
  const delta = event.deltaY || event.deltaX;
  // Lines (Firefox) are about 33 px each.
  const px = Math.abs(delta) * (event.deltaMode === 1 ? 33 : 1);
  return Math.sign(delta) * Math.min(12, 0.38 * px ** 0.6);
};

/**
 * A point of the screen on the page (0–1) – also beyond it, for whoever
 * clamps. Inside its border, where the prints are placed: a print lands
 * right under the pointer.
 */
export const onPage = (
  sheet: HTMLElement | null,
  clientX: number,
  clientY: number
) => {
  if (!sheet) return null;
  const box = sheet.getBoundingClientRect();
  return {
    x: (clientX - box.left - sheet.clientLeft) / sheet.clientWidth,
    y: (clientY - box.top - sheet.clientTop) / sheet.clientHeight,
  };
};

/** Back from the page to the screen – where a spot on it is now. */
export const onScreen = (
  sheet: HTMLElement | null,
  spot: { x: number; y: number }
) => {
  if (!sheet) return null;
  const box = sheet.getBoundingClientRect();
  return {
    x: box.left + sheet.clientLeft + spot.x * sheet.clientWidth,
    y: box.top + sheet.clientTop + spot.y * sheet.clientHeight,
  };
};
