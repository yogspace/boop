"use client";

import { sync } from "@/features/offline/store";
import { CARD_ID, type CardSent, type CardView } from "./protocol";

/**
 * Cards from the browser (protocol.ts): make one of a stamp of one's own,
 * look at one, take one – a copy of its stamp, one's own from then on –
 * and, for the giver, see where one's cards went and take one back. And,
 * for an account with the admin box, a gift from Boop: a stamp of its own
 * sent to everyone (gifts.ts). All of it needs a connection: cards and
 * gifts are on the server, nowhere else.
 */

const post = (path: string, body?: unknown) =>
  fetch(path, {
    method: "POST",
    credentials: "include",
    ...(body !== undefined && {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  }).catch(() => null);

/**
 * A card of a stamp of one's own, with a few words (protocol.ts:
 * `MESSAGE_MAX` – the server cuts what is longer). “tooMany”: enough cards
 * for now – the server lets an account make only so many an hour.
 */
export const createCard = async (
  stamp: string,
  message: string
): Promise<
  { ok: true; id: string } | { ok: false; reason: "failed" | "tooMany" }
> => {
  const response = await post("/api/cards", { stamp, message });
  if (response?.status === 429) return { ok: false, reason: "tooMany" };
  const body = (await response?.json().catch(() => null)) as {
    id?: unknown;
  } | null;
  return response?.ok && typeof body?.id === "string"
    ? { ok: true, id: body.id }
    : { ok: false, reason: "failed" };
};

/** A card as its link shows it – null when there is none (or no answer). */
export const loadCard = async (id: string): Promise<CardView | null> => {
  if (!CARD_ID.test(id)) return null;
  const response = await fetch(`/api/cards/${id}`, {
    credentials: "include",
  }).catch(() => null);
  if (!response?.ok) return null;
  return (await response.json().catch(() => null)) as CardView | null;
};

/**
 * Takes a card: its stamp – a copy – is the account's from now on, and on
 * this device once the sync has brought it. Taken before, the same stamp
 * comes back. “login”: not logged in; “gone”: no such card (anymore) – its
 * stamp was deleted, or the giver's account. One's own card can't be taken
 * (`CardView.mine`): “failed”.
 */
export const takeCard = async (
  id: string
): Promise<
  | { ok: true; stamp: string }
  | { ok: false; reason: "login" | "gone" | "failed" }
> => {
  if (!CARD_ID.test(id)) return { ok: false, reason: "gone" };
  const response = await post(`/api/cards/${id}/take`);
  if (response?.status === 401) return { ok: false, reason: "login" };
  if (response?.status === 404) return { ok: false, reason: "gone" };
  const body = (await response?.json().catch(() => null)) as {
    stamp?: unknown;
  } | null;
  if (!(response?.ok && typeof body?.stamp === "string")) {
    return { ok: false, reason: "failed" };
  }
  await sync();
  return { ok: true, stamp: body.stamp };
};

/**
 * The cards the account sent, the newest first – each with who took it, by
 * display name. None without an answer (offline, not logged in).
 */
export const myCards = async (): Promise<CardSent[]> => {
  const response = await fetch("/api/cards", {
    credentials: "include",
  }).catch(() => null);
  if (!response?.ok) return [];
  const body = (await response.json().catch(() => null)) as {
    cards?: unknown;
  } | null;
  return Array.isArray(body?.cards) ? (body.cards as CardSent[]) : [];
};

/**
 * Takes a card back: its link is dead from then on – the stamps already
 * taken from it stay their owners'. One that is gone already is as good as
 * taken back. False when the server couldn't be asked, or said no.
 */
export const deleteCard = async (id: string): Promise<boolean> => {
  if (!CARD_ID.test(id)) return false;
  const response = await fetch(`/api/cards/${id}`, {
    method: "DELETE",
    credentials: "include",
  }).catch(() => null);
  return Boolean(response && (response.ok || response.status === 404));
};

/**
 * Sends a stamp of one's own to everyone, as a gift from Boop – every
 * account with a confirmed address gets a copy, one's own too. It can't be
 * taken back. `sent`: to how many accounts it is on its way. “forbidden”:
 * the account may not (no admin box); “tooMany”: enough gifts for now –
 * the server lets only a few go out an hour.
 */
export const sendGiftOf = async (
  stamp: string,
  message: string
): Promise<
  | { ok: true; sent: number }
  | { ok: false; reason: "failed" | "tooMany" | "forbidden" }
> => {
  const response = await post("/api/gifts/from-stamp", { stamp, message });
  if (response?.status === 429) return { ok: false, reason: "tooMany" };
  if (response?.status === 403) return { ok: false, reason: "forbidden" };
  const body = (await response?.json().catch(() => null)) as {
    sent?: unknown;
  } | null;
  return response?.ok && typeof body?.sent === "number"
    ? { ok: true, sent: body.sent }
    : { ok: false, reason: "failed" };
};
