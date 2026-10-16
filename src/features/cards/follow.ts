import type {
  CollectionAfterChangeHook,
  Payload,
  PayloadRequest,
} from "payload";
import { idOf } from "@/features/calendar/membership";
import type { Drawing } from "@/features/calendar/model";
import { isColorKey } from "@/features/calendar/palette";
import { isShapeKey } from "@/features/calendar/shapes";
import { stampColorsNow } from "@/features/site/stamp-colors";
import { nudge } from "@/features/sync/live";

/**
 * A stamp drawn anew, and what was made of it follows: a copy (a card
 * taken, a gift from Boop – `origin.stamp`, cards.ts and gifts.ts) looks
 * like its original, always. When the look of a stamp its owner drew
 * changes – its drawing (rim and flags with it), its shape, its color –
 * the server passes it on: to the cards made of it (the look they keep for
 * their page), to the gifts made of it, and to every copy not deleted,
 * with a new `changedAt` and a nudge to its owner's open apps. Only what
 * changed goes: a copy's name stays its owner's, and so does what they
 * share it with.
 *
 * Its color goes too – but a gift may wear one of its own (picked in the
 * CMS, not the stamp's): that stays the gift's, and its copies'.
 *
 * In the background (`followSoon`), after the change that set it off: the
 * owner's sync doesn't wait for it. The copies go in portions, the server
 * breathing between them, like a gift's sending; the changes of one
 * original one after the other.
 */

type Doc = Record<string, unknown>;

/** What a stamp looks like – what its copies take over. */
export type Look = { drawing?: Drawing | null; shape?: string; color?: string };

/** A change of an original's look: the new look, and the color it had. */
export type LookChange = { look: Look; before: { color: unknown } };

/** Copies changed at a time – then the server breathes. */
export const FOLLOW_PORTION = 50;

/** Whether a stamp came from someone – a card taken, a gift. */
const isCopy = (stamp: Doc) => {
  const kind = (stamp.origin as Doc | null | undefined)?.kind;
  return kind === "card" || kind === "gift";
};

const same = (a: unknown, b: unknown) =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * What changed of a stamp's look, as it was (`before`) and is now – none
 * when nothing did, for a copy (it has no look of its own), and for a
 * stamp deleted.
 */
export const lookChange = (before: Doc, after: Doc): LookChange | null => {
  if (after.deleted || isCopy(after)) return null;
  const changed = (key: keyof Look) => !same(before[key], after[key]);
  const look: Look = {};
  if (changed("drawing")) {
    look.drawing = (after.drawing ?? null) as Drawing | null;
  }
  if (changed("shape") && isShapeKey(after.shape)) look.shape = after.shape;
  if (changed("color") && isColorKey(after.color)) look.color = after.color;
  return Object.keys(look).length
    ? { look, before: { color: before.color } }
    : null;
};

/**
 * The stamps' hook (collections/stamps.ts): an original changed in its
 * look – by the sync, or anywhere else – and its copies follow.
 */
export const followOriginal: CollectionAfterChangeHook = ({
  doc,
  previousDoc,
  operation,
  req,
}) => {
  if (operation !== "update" || !previousDoc) return doc;
  const change = lookChange(previousDoc, doc);
  if (change) void followSoon(req.payload, String(doc.id), change);
  return doc;
};

/** What is under way per original – the next change waits its turn. */
const queue = new Map<string, Promise<unknown>>();

/**
 * Passes an original's change on, in the background – after whatever
 * change of the same one is still on its way. Nothing here can fail: what
 * goes wrong goes to the log.
 */
export const followSoon = (
  payload: Payload,
  id: string,
  change: LookChange,
  options?: { portion?: number }
) => {
  const job = (queue.get(id) ?? Promise.resolve())
    .then(() => follow(payload, id, change, options))
    .catch((error) => {
      payload.logger.error({ err: error, msg: "[follow] not passed on" });
      return null;
    });
  queue.set(id, job);
  void job.then(() => {
    if (queue.get(id) === job) queue.delete(id);
  });
  return job;
};

/**
 * Passes an original's change on (see above) – to its cards, its gifts,
 * its copies. Returns how many of each took it.
 */
export const follow = async (
  payload: Payload,
  id: string,
  { look, before }: LookChange,
  { portion = FOLLOW_PORTION }: { portion?: number } = {}
) => {
  // The change that set it off goes first – its sync answers.
  await breathe();
  const wore = (doc: Doc) => doc.color === before.color;

  const { docs: cards } = await payload.update({
    collection: "cards",
    where: { stamp: { equals: id } },
    data: look,
    depth: 0,
    overrideAccess: true,
  });

  // A gift's color goes along where it was the stamp's – and where the CMS
  // has it: the gift's own field takes no other (gifts.ts).
  let gifts = 0;
  const { docs: made } = await payload.find({
    collection: "gifts",
    where: { stamp: { equals: id } },
    depth: 0,
    pagination: false,
    overrideAccess: true,
  });
  const known =
    look.color && made.length
      ? (await stampColorsNow({ payload } as PayloadRequest)).some(
          (color) => color.key === look.color
        )
      : false;
  for (const gift of made as unknown as Doc[]) {
    const { color, ...rest } = look;
    const data = {
      ...rest,
      ...(color && known && (!gift.color || wore(gift)) && { color }),
    };
    if (!Object.keys(data).length) continue;
    try {
      await payload.update({
        collection: "gifts",
        id: String(gift.id),
        data,
        depth: 0,
        overrideAccess: true,
      });
      gifts++;
    } catch (error) {
      payload.logger.warn({ err: error, msg: `[follow] gift ${gift.id}` });
    }
  }

  // The copies, a portion at a time – a deleted one keeps nothing to change.
  let copies = 0;
  for (let page = 1; ; page++) {
    const found = await payload.find({
      collection: "stamps",
      where: { "origin.stamp": { equals: id } },
      select: { owner: true, color: true, origin: true, deleted: true },
      sort: "createdAt",
      limit: portion,
      page,
      depth: 0,
      overrideAccess: true,
    });
    const owners: string[] = [];
    for (const copy of found.docs as unknown as Doc[]) {
      if (copy.deleted) continue;
      const { color, ...rest } = look;
      const kind = (copy.origin as Doc | null | undefined)?.kind;
      const data = {
        ...rest,
        ...(color && (kind !== "gift" || wore(copy)) && { color }),
      };
      if (!Object.keys(data).length) continue;
      await payload.update({
        collection: "stamps",
        id: String(copy.id),
        data: { ...data, changedAt: new Date().toISOString() },
        context: { sync: true },
        depth: 0,
        overrideAccess: true,
      });
      const owner = idOf(copy.owner);
      if (owner) owners.push(owner);
      copies++;
    }
    nudge(owners);
    if (!found.hasNextPage) break;
    await breathe();
  }
  return { cards: cards.length, gifts, copies };
};

/** Lets whatever else the server has to do go first. */
const breathe = () => new Promise((resolve) => setImmediate(resolve));
