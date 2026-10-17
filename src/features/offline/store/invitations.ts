import type { InvitationDoc } from "@/features/sync/protocol";
import { write } from "../db";
import { plain } from "./changes";
import type { Local } from "./local";
import { sync } from "./sync";

/**
 * Invitations to the account come with every sync, all of them (sync/
 * protocol.ts), and are kept on the device like the rest – in the store's
 * `invitations` and in IndexedDB (`meta`, under `INVITATIONS`): offline they
 * still show. Saying yes or no needs a connection – the server decides
 * (calendar/endpoints/invitations.ts) – and a sync follows.
 */
export const INVITATIONS = "invitations";

/**
 * The server's invitations, less those answered here meanwhile
 * (`answered`, store/local.ts).
 */
export const openInvitations = (local: Local, incoming: InvitationDoc[]) => {
  const { answered } = local;
  for (const id of answered) {
    if (!incoming.some((invitation) => invitation.id === id)) {
      answered.delete(id);
    }
  }
  return incoming.filter((invitation) => !answered.has(invitation.id));
};

/** An invitation off the device – answered, or gone on the server. */
const dropInvitation = async (local: Local, id: string) => {
  const { boop } = local;
  local.answered.add(id);
  boop.invitations = boop.invitations.filter(
    (invitation) => invitation.id !== id
  );
  await write([
    { store: "meta", put: plain(boop.invitations), key: INVITATIONS },
  ]);
};

/** The server's answer – none without a connection. */
const answer = (id: string, what: "accept" | "decline") =>
  fetch(`/api/invitations/${encodeURIComponent(id)}/${what}`, {
    method: "POST",
    credentials: "include",
  }).catch(() => null);

/** Not found, or over: the invitation is no more – taken back, perhaps. */
const isGone = (response: Response) =>
  response.status === 404 || response.status === 410;

/**
 * Says yes to an invitation – a member of its calendar from now on. The
 * calendar comes with the sync: once it is on the device, its id comes
 * back. “gone”: the invitation is no more (taken back, over, the calendar
 * deleted) – the sync takes it off the device, while whoever asked says so.
 */
export const acceptInvitation = async (
  local: Local,
  id: string
): Promise<
  { ok: true; calendar: string } | { ok: false; reason: "gone" | "failed" }
> => {
  const response = await answer(id, "accept");
  if (response && isGone(response)) {
    void sync(local);
    return { ok: false, reason: "gone" };
  }
  const body = (await response?.json().catch(() => null)) as {
    calendar?: unknown;
  } | null;
  if (!(response?.ok && typeof body?.calendar === "string")) {
    return { ok: false, reason: "failed" };
  }
  const { calendar } = body;
  await dropInvitation(local, id);
  // A sync under way may have been asked for before the calendar was the
  // account's – then the next one brings it.
  for (let round = 0; round < 3 && !local.boop.calendars[calendar]; round++) {
    await sync(local);
  }
  return { ok: true, calendar };
};

/**
 * Says no to an invitation: it goes, and nothing else happens. One that is
 * no more is as good as turned down. False when the server couldn't be
 * asked.
 */
export const declineInvitation = async (local: Local, id: string) => {
  const response = await answer(id, "decline");
  if (!(response && (response.ok || isGone(response)))) return false;
  await dropInvitation(local, id);
  void sync(local);
  return true;
};
