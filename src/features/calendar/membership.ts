import type { PayloadRequest } from "payload";
import { localeOf } from "@/features/accounts/emails";
import { newId } from "@/lib/id";

/**
 * Which calendars an account belongs to – the base of every check in the
 * sync and the member endpoints. Always with full access: the callers decide
 * what the account may see.
 */

type CalendarRow = {
  id: string;
  owner: string;
  members: string[];
  deleted: boolean;
};

/** A relationship value as an id, whether populated or not. */
export const idOf = (value: unknown): string | null => {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value) {
    return String((value as { id: unknown }).id);
  }
  return null;
};

const toRow = (doc: Record<string, unknown>): CalendarRow => ({
  id: String(doc.id),
  owner: idOf(doc.owner) ?? "",
  members: Array.isArray(doc.members)
    ? doc.members.map(idOf).filter((id): id is string => Boolean(id))
    : [],
  deleted: Boolean(doc.deleted),
});

/** The (not deleted) calendars this account is a member of. */
export const calendarsOf = async (
  req: PayloadRequest,
  accountId: string
): Promise<CalendarRow[]> => {
  const { docs } = await req.payload.find({
    collection: "calendars",
    where: {
      and: [
        { members: { equals: accountId } },
        { deleted: { not_equals: true } },
      ],
    },
    select: { owner: true, members: true, deleted: true },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    req,
  });
  return docs.map((doc) => toRow(doc as Record<string, unknown>));
};

/** One calendar, or null when it doesn't exist or is deleted. */
export const calendarById = async (
  req: PayloadRequest,
  id: string
): Promise<CalendarRow | null> => {
  const doc = await req.payload.findByID({
    collection: "calendars",
    id,
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
    req,
  });
  if (!doc) return null;
  const row = toRow(doc as unknown as Record<string, unknown>);
  return row.deleted ? null : row;
};

/**
 * A first calendar for an account – at sign-up, and at a sync that finds it
 * in none any more (its last one deleted, or taken out of it by its owner):
 * nobody is without one. In the calendars' default color (color-field.ts).
 */
export const createFirstCalendar = async (
  req: PayloadRequest,
  account: { id: string | number; locale?: unknown }
) => {
  const id = String(account.id);
  await req.payload.create({
    collection: "calendars",
    data: {
      id: newId(),
      name: localeOf(account) === "de" ? "Mein Kalender" : "My calendar",
      owner: id,
      members: [id],
      deleted: false,
    } as never,
    overrideAccess: true,
    req,
  });
};
