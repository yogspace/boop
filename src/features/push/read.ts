import type { Payload } from "payload";
import {
  type PushSettingsDoc,
  refOf,
  rowOf,
  type Session,
  type SubscriptionRow,
} from "./rules";

/**
 * What the sending asks the database – always with full access, for the
 * server's own use. Never handed to an account as it is.
 */

type Doc = Record<string, unknown>;

/** These accounts' devices. */
export const devicesOf = async (
  payload: Payload,
  accounts: readonly string[]
): Promise<SubscriptionRow[]> => {
  if (!accounts.length) return [];
  const { docs } = await payload.find({
    collection: "push-subscriptions",
    where: { account: { in: [...accounts] } },
    depth: 0,
    pagination: false,
    overrideAccess: true,
  });
  return (docs as unknown as Doc[])
    .map(rowOf)
    .filter((row): row is SubscriptionRow => Boolean(row));
};

/** These accounts' settings, by account – none kept: not in it. */
export const settingsOf = async (
  payload: Payload,
  accounts: readonly string[]
): Promise<Record<string, PushSettingsDoc>> => {
  if (!accounts.length) return {};
  const { docs } = await payload.find({
    collection: "push-settings",
    where: { account: { in: [...accounts] } },
    depth: 0,
    pagination: false,
    overrideAccess: true,
  });
  return Object.fromEntries(
    (docs as unknown as Doc[]).map((doc) => [
      refOf(doc.account) ?? "",
      doc as PushSettingsDoc,
    ])
  );
};

/** These accounts' names and logins, by account. */
export const peopleOf = async (
  payload: Payload,
  accounts: readonly string[]
): Promise<Record<string, { name: string; sessions: Session[] }>> => {
  if (!accounts.length) return {};
  const { docs } = await payload.find({
    collection: "accounts",
    where: { id: { in: [...accounts] } },
    select: { name: true, sessions: true },
    depth: 0,
    pagination: false,
    overrideAccess: true,
  });
  return Object.fromEntries(
    (docs as unknown as Doc[]).map((doc) => [
      String(doc.id),
      {
        name: typeof doc.name === "string" ? doc.name : "",
        sessions: Array.isArray(doc.sessions)
          ? (doc.sessions as Session[])
          : [],
      },
    ])
  );
};
