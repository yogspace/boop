import type { PayloadRequest, Where } from "payload";
import { idOf } from "@/features/calendar/membership";
import {
  cleanDrawing,
  isDayKey,
  isShape,
  sharedWithOf,
  unit,
} from "@/features/calendar/model";
import { cleanNote, noteId } from "@/features/calendar/note";
import { isColorKey } from "@/features/calendar/palette";
import type { Change, SyncType } from "./protocol";

/**
 * Applies one change from a device – if the account may make it. Who may
 * do what:
 *
 * - calendar: anyone makes their own; only the owner renames or deletes it
 *   – the last one, too. Members change
 *   through members.ts.
 * - stamp: anyone makes their own; only its owner changes, shares or
 *   deletes it. Shared it is with calendars the owner belongs to – any other
 *   is left out.
 * - placement: every member of its calendar places, moves and removes – with
 *   a stamp they have: their own (in any calendar of theirs), or one shared
 *   with a calendar of theirs (in any of them, too).
 * - note: every member of its calendar writes, empties and writes it again.
 *   A new one's id must be its day's (`noteId`) – one note per day.
 *
 * A change older than the server's copy is no error: the later one wins,
 * and the device gets the server's copy back. So two people writing a day's
 * note at once: whoever wrote last has it – the other's words are gone.
 *
 * A color is a stamp color's key – taken by its form alone (`isColorKey`),
 * not by what the CMS has right now: a device may be ahead of or behind the
 * palette, and what is stored must outlive a color taken out of it. A new
 * calendar or stamp that names none gets its collection's default
 * (calendar/color-field.ts).
 *
 * Except a color that isn't public (`special`, palette.ts) – Boop's gifts'.
 * An account with the admin box wears it on whatever it likes; anyone else
 * only where it came with the thing: a stamp that has it already (a gift,
 * a card of a stamp in it – features/cards), and a print with a stamp in
 * it, as the stamp's own ink. Anywhere else it is left out, and the rest of
 * the change still counts: a new calendar or stamp gets the default, a new
 * print the stamp's own ink.
 */

const COLLECTION = {
  calendar: "calendars",
  stamp: "stamps",
  placement: "placements",
  note: "notes",
} as const satisfies Record<SyncType, string>;

export type ApplyContext = {
  req: PayloadRequest;
  me: string;
  /** The (not deleted) calendars the account is a member of. */
  mine: Set<string>;
  /** Calendars a stamp was shared with before a change – they hear of it. */
  unshared: Set<string>;
  /** The colors that aren't public, by key – none: all are. */
  special?: ReadonlySet<string>;
  /** The account has the admin box: it may wear those, too. */
  admin?: boolean;
};

type Outcome = { ok: true } | { ok: false; reason: string };

const OK: Outcome = { ok: true };
const no = (reason: string): Outcome => ({ ok: false, reason });

type Doc = Record<string, unknown>;

/** A time from a device – none in the future (a clock running ahead). */
const deviceTime = (value: unknown, now = Date.now()): Date | null => {
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

/**
 * A color for something the account changes – one it may wear (see
 * above): its key, or undefined. `has`: the color it has already, or its
 * stamp's.
 */
const colorFor = (ctx: ApplyContext, value: unknown, has?: unknown) => {
  if (!isColorKey(value)) return undefined;
  const open = !ctx.special?.has(value) || ctx.admin === true;
  return open || value === has ? value : undefined;
};

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

  // `by`: whose change it is – the hooks tell the others (features/push).
  const write = (data: Doc) =>
    existing
      ? req.payload.update({
          collection,
          id: change.id,
          data: { ...data, changedAt: changedAt.toISOString() },
          context: { sync: true, by: ctx.me },
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
          context: { sync: true, by: ctx.me },
          depth: 0,
          overrideAccess: true,
          req,
        });

  const data = change.data ?? {};
  // Nothing to delete that was never here.
  if (!existing && change.deleted) return OK;
  // Gone is gone – but a day's note, emptied, may be written again: its id
  // is the day's, there is no other.
  if (existing?.deleted && change.type !== "note") return no("deleted");

  switch (change.type) {
    case "calendar":
      return applyCalendar(ctx, change, existing, data, write);
    case "stamp":
      return applyStamp(ctx, change, existing, data, write);
    case "placement":
      return applyPlacement(ctx, change, existing, data, write);
    case "note":
      return applyNote(ctx, change, existing, data, write);
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
    color: colorFor(ctx, data.color, existing?.color),
  };
  if (!existing) {
    await write({
      ...defined({ color: fields.color }),
      name: fields.name || "Boop",
      owner: ctx.me,
      members: [ctx.me],
      deleted: false,
    });
    ctx.mine.add(change.id);
    return OK;
  }
  if (idOf(existing.owner) !== ctx.me) return no("not the owner");
  if (change.deleted) {
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
  // Shared with calendars of theirs – any other is left out, the rest of the
  // change still counts. An app from before says `calendar`: that one, or
  // none.
  let shared: unknown[] | undefined;
  if ("sharedWith" in data) {
    shared = Array.isArray(data.sharedWith) ? data.sharedWith : [];
  } else if ("calendar" in data) {
    shared = data.calendar == null ? [] : [data.calendar];
  }
  const sharedWith = shared && [
    ...new Set(shared.map(String).filter((id) => ctx.mine.has(id))),
  ];
  const fields = {
    name: text(data.name, 40),
    color: colorFor(ctx, data.color, existing?.color),
    shape: isShape(data.shape) ? data.shape : undefined,
    drawing: "drawing" in data ? cleanDrawing(data.drawing) : undefined,
    sharedWith,
  };
  if (!existing) {
    await write({
      ...defined(fields),
      name: fields.name ?? "",
      shape: fields.shape ?? "circle",
      owner: ctx.me,
      deleted: false,
    });
    return OK;
  }
  if (idOf(existing.owner) !== ctx.me) return no("not the owner");
  if (change.deleted) {
    // The marker keeps nothing of the doodle – nor, of a stamp that came
    // from someone (features/cards), who that was and what they wrote:
    // only which card or gift, so it is known as taken. Its prints go too.
    const origin = existing.origin as Doc | null | undefined;
    await write({
      deleted: true,
      name: "",
      drawing: null,
      ...(origin?.kind
        ? { origin: { ...origin, from: null, name: "", message: "" } }
        : {}),
    });
    await ctx.req.payload.update({
      collection: "placements",
      where: {
        and: [
          { stamp: { equals: change.id } },
          { deleted: { not_equals: true } },
        ],
      },
      data: { deleted: true, changedAt: new Date().toISOString() },
      context: { sync: true, by: ctx.me },
      overrideAccess: true,
      req: ctx.req,
    });
    return OK;
  }
  // Its sharing is kept in `sharedWith` alone from here on.
  if (sharedWith) {
    for (const id of sharedWithOf(existing)) ctx.unshared.add(id);
  }
  await write({ ...defined(fields), ...(sharedWith && { calendar: null }) });
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
    ink: isColorKey(data.ink) ? data.ink : undefined,
  };
  // An ink that isn't public: only as its stamp's own (`colorFor`).
  const inkOf = async (stampId: unknown) =>
    fields.ink && ctx.special?.has(fields.ink) && ctx.admin !== true
      ? colorFor(ctx, fields.ink, (await stampOf(ctx, idOf(stampId)))?.color)
      : fields.ink;
  if (!existing) {
    const calendar = String(data.calendar ?? "");
    if (!ctx.mine.has(calendar)) return no("not a member");
    if (!fields.date) return no("no day");
    const stampId = String(data.stamp ?? "");
    if (!(await canUseStamp(ctx, stampId))) return no("unknown stamp");
    await write({
      ...defined({ ...fields, ink: await inkOf(stampId) }),
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
  await write(defined({ ...fields, ink: await inkOf(existing.stamp) }));
  return OK;
};

/**
 * A day's note: checked and trimmed (`cleanNote`) – nothing left of it, or
 * `deleted`, and it is a marker: no text, nobody's. It stays in its
 * calendar and on its day.
 */
const applyNote = async (
  ctx: ApplyContext,
  change: Change,
  existing: Doc | null,
  data: Doc,
  write: Write
): Promise<Outcome> => {
  const content = change.deleted ? null : cleanNote(data.content);
  const fields = content
    ? { content, editedBy: ctx.me, deleted: false }
    : { content: null, editedBy: null, deleted: true };
  if (!existing) {
    const calendar = String(data.calendar ?? "");
    if (!ctx.mine.has(calendar)) return no("not a member");
    if (!isDayKey(data.date)) return no("no day");
    if (change.id !== noteId(calendar, data.date)) return no("not its day's");
    // An empty one never was.
    if (!content) return OK;
    await write({ ...fields, calendar, date: data.date });
    return OK;
  }
  const calendar = idOf(existing.calendar);
  if (!(calendar && ctx.mine.has(calendar))) return no("not a member");
  // Emptied twice is still empty.
  if (!content && existing.deleted) return OK;
  await write(fields);
  return OK;
};

/** A stamp, as it is kept – none for no id. */
const stampOf = async (ctx: ApplyContext, id: string | null) =>
  id
    ? ((await ctx.req.payload.findByID({
        collection: "stamps",
        id,
        depth: 0,
        disableErrors: true,
        overrideAccess: true,
        req: ctx.req,
      })) as Doc | null)
    : null;

/** A stamp the account has: its own, or one shared with its calendars. */
const canUseStamp = async (ctx: ApplyContext, id: string) => {
  const stamp = await stampOf(ctx, id);
  if (!stamp || stamp.deleted) return false;
  return (
    idOf(stamp.owner) === ctx.me ||
    sharedWithOf(stamp).some((id) => ctx.mine.has(id))
  );
};

/**
 * Stamps shared with any of these calendars – by `sharedWith`, or by the
 * one `calendar` of before (collections/stamps.ts).
 */
export const sharedWithAny = (calendars: string[]): Where => ({
  or: [{ sharedWith: { in: calendars } }, { calendar: { in: calendars } }],
});

/**
 * Stamps stop being shared with a calendar: all of them (it is gone) or one
 * account's (it left). The stamps stay their owners' – also their prints in
 * other calendars. It counts as a change made now, so the devices take it
 * over.
 */
export const unshare = async (
  req: PayloadRequest,
  calendar: string,
  owner?: string
) => {
  const { docs } = await req.payload.find({
    collection: "stamps",
    where: {
      and: [
        sharedWithAny([calendar]),
        ...(owner ? [{ owner: { equals: owner } }] : []),
      ],
    },
    select: { sharedWith: true, calendar: true },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    req,
  });
  const changedAt = new Date().toISOString();
  for (const stamp of docs) {
    await req.payload.update({
      collection: "stamps",
      id: stamp.id,
      data: {
        sharedWith: sharedWithOf(stamp).filter((id) => id !== calendar),
        calendar: null,
        changedAt,
      },
      context: { sync: true },
      depth: 0,
      overrideAccess: true,
      req,
    });
  }
};

/**
 * A deleted calendar keeps only its marker: its placements, notes and open
 * invitations go for good, and no stamp is shared with it any more.
 */
export const purgeCalendar = async (req: PayloadRequest, id: string) => {
  for (const collection of ["placements", "notes", "invites"] as const) {
    await req.payload.delete({
      collection,
      where: { calendar: { equals: id } },
      overrideAccess: true,
      req,
    });
  }
  await unshare(req, id);
};
