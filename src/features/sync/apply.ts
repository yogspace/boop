import type { PayloadRequest } from "payload";
import { idOf } from "@/features/calendar/membership";
import {
  cleanDrawing,
  isColorName,
  isDayKey,
  isShape,
  unit,
} from "@/features/calendar/model";
import type { Change, SyncType } from "./protocol";

/**
 * Applies one change from a device – if the account may make it. Who may
 * do what:
 *
 * - calendar: anyone makes their own; only the owner renames or deletes it
 *   (never the personal one). Members change through members.ts.
 * - stamp: anyone makes their own – personal, or shared with a calendar
 *   they belong to; only its owner changes or deletes it.
 * - placement: every member of its calendar places, moves and removes – with
 *   a stamp they can see (their own, or one shared with a calendar of
 *   theirs).
 *
 * A change older than the server's copy is no error: the later one wins,
 * and the device gets the server's copy back.
 */

export const COLLECTION = {
  calendar: "calendars",
  stamp: "stamps",
  placement: "placements",
} as const satisfies Record<SyncType, string>;

export type ApplyContext = {
  req: PayloadRequest;
  me: string;
  /** The (not deleted) calendars the account is a member of. */
  mine: Set<string>;
};

type Outcome = { ok: true } | { ok: false; reason: string };

const OK: Outcome = { ok: true };
const no = (reason: string): Outcome => ({ ok: false, reason });

type Doc = Record<string, unknown>;

/** A time from a device – none in the future (a clock running ahead). */
export const deviceTime = (value: unknown, now = Date.now()): Date | null => {
  if (typeof value !== "string") return null;
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) return null;
  return time.getTime() > now ? new Date(now) : time;
};

const text = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : undefined;

const number = (value: unknown, min: number, max: number) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.min(Math.max(value, min), max)
    : undefined;

/** Drops the keys that are undefined – only what changed is written. */
const defined = <T extends Doc>(doc: T): Partial<T> =>
  Object.fromEntries(
    Object.entries(doc).filter(([, value]) => value !== undefined)
  ) as Partial<T>;

export const applyChange = async (
  ctx: ApplyContext,
  change: Change
): Promise<Outcome> => {
  const changedAt = deviceTime(change.changedAt);
  if (!changedAt) return no("no time");
  const { req } = ctx;
  const collection = COLLECTION[change.type];
  const existing = (await req.payload.findByID({
    collection,
    id: change.id,
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
    req,
  })) as Doc | null;

  // The server's copy was changed later – it stays, the device gets it.
  if (
    existing?.changedAt &&
    new Date(String(existing.changedAt)).getTime() >= changedAt.getTime()
  ) {
    return OK;
  }

  const write = (data: Doc) =>
    existing
      ? req.payload.update({
          collection,
          id: change.id,
          data: { ...data, changedAt: changedAt.toISOString() },
          context: { sync: true },
          depth: 0,
          overrideAccess: true,
          req,
        })
      : req.payload.create({
          collection,
          data: {
            ...data,
            id: change.id,
            changedAt: changedAt.toISOString(),
          } as never,
          context: { sync: true },
          depth: 0,
          overrideAccess: true,
          req,
        });

  const data = change.data ?? {};
  // Nothing to delete that was never here.
  if (!existing && change.deleted) return OK;
  if (existing?.deleted) return no("deleted");

  switch (change.type) {
    case "calendar":
      return applyCalendar(ctx, change, existing, data, write);
    case "stamp":
      return applyStamp(ctx, change, existing, data, write);
    case "placement":
      return applyPlacement(ctx, change, existing, data, write);
  }
};

type Write = (data: Doc) => Promise<unknown>;

const applyCalendar = async (
  ctx: ApplyContext,
  change: Change,
  existing: Doc | null,
  data: Doc,
  write: Write
): Promise<Outcome> => {
  const fields = {
    name: text(data.name, 60),
    color: isColorName(data.color) ? data.color : undefined,
  };
  if (!existing) {
    await write({
      name: fields.name || "Boop",
      color: fields.color ?? "coral",
      owner: ctx.me,
      members: [ctx.me],
      personal: false,
      deleted: false,
    });
    ctx.mine.add(change.id);
    return OK;
  }
  if (idOf(existing.owner) !== ctx.me) return no("not the owner");
  if (change.deleted) {
    if (existing.personal) return no("personal calendar");
    await write({ deleted: true });
    await purgeCalendar(ctx.req, change.id);
    ctx.mine.delete(change.id);
    return OK;
  }
  await write(defined({ ...fields, name: fields.name || undefined }));
  return OK;
};

const applyStamp = async (
  ctx: ApplyContext,
  change: Change,
  existing: Doc | null,
  data: Doc,
  write: Write
): Promise<Outcome> => {
  // Shared with a calendar of theirs – or personal (null).
  let calendar: string | null | undefined;
  if ("calendar" in data) {
    calendar = data.calendar == null ? null : String(data.calendar);
    if (calendar && !ctx.mine.has(calendar)) return no("not a member");
  }
  const fields = {
    name: text(data.name, 40),
    color: isColorName(data.color) ? data.color : undefined,
    shape: isShape(data.shape) ? data.shape : undefined,
    drawing: "drawing" in data ? cleanDrawing(data.drawing) : undefined,
    calendar,
  };
  if (!existing) {
    await write({
      ...defined(fields),
      name: fields.name ?? "",
      color: fields.color ?? "ink",
      shape: fields.shape ?? "circle",
      owner: ctx.me,
      deleted: false,
    });
    return OK;
  }
  if (idOf(existing.owner) !== ctx.me) return no("not the owner");
  if (change.deleted) {
    // The marker keeps nothing of the doodle – and its prints go too.
    await write({ deleted: true, name: "", drawing: null });
    await ctx.req.payload.update({
      collection: "placements",
      where: {
        and: [
          { stamp: { equals: change.id } },
          { deleted: { not_equals: true } },
        ],
      },
      data: { deleted: true, changedAt: new Date().toISOString() },
      context: { sync: true },
      overrideAccess: true,
      req: ctx.req,
    });
    return OK;
  }
  await write(defined(fields));
  return OK;
};

const applyPlacement = async (
  ctx: ApplyContext,
  change: Change,
  existing: Doc | null,
  data: Doc,
  write: Write
): Promise<Outcome> => {
  const fields = {
    date: isDayKey(data.date) ? data.date : undefined,
    x: "x" in data ? unit(data.x) : undefined,
    y: "y" in data ? unit(data.y) : undefined,
    rotation: number(data.rotation, -3600, 3600),
    scale: number(data.scale, 0.2, 4),
    z: number(data.z, 0, 1_000_000),
    ink: isColorName(data.ink) ? data.ink : undefined,
  };
  if (!existing) {
    const calendar = String(data.calendar ?? "");
    if (!ctx.mine.has(calendar)) return no("not a member");
    if (!fields.date) return no("no day");
    const stampId = String(data.stamp ?? "");
    if (!(await canUseStamp(ctx, stampId))) return no("unknown stamp");
    await write({
      ...defined(fields),
      calendar,
      stamp: stampId,
      x: fields.x ?? 0.5,
      y: fields.y ?? 0.5,
      placedBy: ctx.me,
      deleted: false,
    });
    return OK;
  }
  // Stays in its calendar – and only its members touch it.
  const calendar = idOf(existing.calendar);
  if (!(calendar && ctx.mine.has(calendar))) return no("not a member");
  if (change.deleted) {
    await write({ deleted: true });
    return OK;
  }
  await write(defined(fields));
  return OK;
};

/** A stamp the account can see: its own, or one shared with its calendars. */
const canUseStamp = async (ctx: ApplyContext, id: string) => {
  const stamp = (await ctx.req.payload.findByID({
    collection: "stamps",
    id,
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
    req: ctx.req,
  })) as Doc | null;
  if (!stamp || stamp.deleted) return false;
  const shared = idOf(stamp.calendar);
  return (
    idOf(stamp.owner) === ctx.me || Boolean(shared && ctx.mine.has(shared))
  );
};

/**
 * A deleted calendar keeps only its marker: its placements and the stamps
 * shared with it go for good.
 */
export const purgeCalendar = async (req: PayloadRequest, id: string) => {
  for (const collection of ["placements", "stamps"] as const) {
    await req.payload.delete({
      collection,
      where: { calendar: { equals: id } },
      overrideAccess: true,
      req,
    });
  }
};
