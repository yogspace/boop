import type { Payload, PayloadRequest } from "payload";
import { type SeenPatch, seenPatch } from "./retention";

/**
 * When an account was last there – what keeps it from being deleted as
 * unused (retention.ts). Noted at a login (session.ts) and at a sync
 * (sync/endpoint.ts).
 */

/** Writes a few fields of an account – no hooks, `updatedAt` left alone. */
export const patchAccount = (
  payload: Payload,
  id: string | number,
  patch: SeenPatch,
  req?: PayloadRequest
) =>
  payload.db.updateOne({
    collection: "accounts",
    id,
    data: { ...patch, updatedAt: null },
    returning: false,
    req,
  });

/**
 * The account is there: noted – once a day at most – and a warning that it
 * will go is taken back. Never in the way: a failure is only logged.
 */
export const noteSeen = async (
  req: PayloadRequest,
  account: {
    id: string | number;
    lastSeenAt?: unknown;
    deletionWarnedAt?: unknown;
  }
) => {
  const patch = seenPatch(account);
  if (!patch) return;
  await patchAccount(req.payload, account.id, patch, req).catch((error) =>
    req.payload.logger.warn({ err: error, msg: "[accounts] lastSeenAt" })
  );
};
