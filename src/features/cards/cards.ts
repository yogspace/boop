import type {
  CollectionAfterChangeHook,
  CollectionConfig,
  PayloadRequest,
  Where,
} from "payload";
import { hiddenUnlessSupport, sealed } from "@/access";
import { sessionAccount } from "@/features/accounts/session";
import { idOf } from "@/features/calendar/membership";
import { isShapeKey } from "@/features/calendar/shapes";
import { nudge } from "@/features/sync/live";
import { isId, newId } from "@/lib/id";
import { rateLimit } from "@/lib/rate-limit";
import { CARD_ID, type CardSent, type CardView, MESSAGE_MAX } from "./protocol";
import { cardStampOf, cleanMessage, newCardId } from "./rules";

/**
 * Cards (protocol.ts): someone sends a stamp of their own – a link to a
 * page with the stamp and a few words. Whoever opens it sees the stamp – its
 * name as when the card was made, its look as it is now (drawn anew, the
 * card follows: follow.ts) –, the giver's name and the words; logged in,
 * they can take it – a copy, theirs from then on (`takeCard`).
 *
 *   POST   /api/cards            { stamp, message? } → { id }
 *   GET    /api/cards/:id        → CardView
 *   POST   /api/cards/:id/take   → { stamp }
 *   GET    /api/cards            → { cards: CardSent[] }
 *   DELETE /api/cards/:id        → {}
 *
 * Only a stamp its owner drew makes a card – a stamp that came as a card
 * or a gift is not passed on. The giver sees where a card went – who took
 * it, by display name, nothing else of them (`sentBy`) – and can take it
 * back. A card also goes with its stamp (`dropCards`, on the stamps) and
 * with its giver's account (accounts/collection.ts). Either way the copies
 * taken stay: they are their owners' stamps.
 *
 * The app's through these endpoints alone; closed over REST, for admins
 * too – they read it in support mode (src/access). The id is the link's
 * secret: whoever has it sees the card.
 */

type Doc = Record<string, unknown>;

// Cards go one by one, to people one knows – far below this.
const tooMany = rateLimit({ limit: 30, windowMs: 60 * 60 * 1000 });

const notFound = () => Response.json({ error: "Not found." }, { status: 404 });

const notLoggedIn = () =>
  Response.json({ error: "Not logged in." }, { status: 401 });

export const Cards: CollectionConfig = {
  slug: "cards",
  labels: { singular: "Card", plural: "Cards" },
  access: sealed,
  admin: {
    hidden: hiddenUnlessSupport,
    group: "Calendars",
    useAsTitle: "name",
    defaultColumns: ["name", "color", "from", "createdAt"],
    description:
      "Stamps sent as a card – a link with the stamp as it was then and a few words. Gone with the stamp or the giver's account; the copies taken stay.",
  },
  fields: [
    {
      // The link's – random, not a database id (rules.ts, `newCardId`).
      name: "id",
      type: "text",
      required: true,
      defaultValue: () => newCardId(),
      admin: { readOnly: true },
    },
    {
      // The stamp it was made of – the card goes with it.
      name: "stamp",
      type: "relationship",
      relationTo: "stamps",
      required: true,
      index: true,
    },
    {
      name: "from",
      type: "relationship",
      relationTo: "accounts",
      required: true,
      index: true,
    },
    // The stamp as it was when the card was made – its look as it is now
    // (follow.ts).
    { name: "name", type: "text", maxLength: 40 },
    { name: "color", type: "text", required: true },
    {
      // A shape's key (Content → Stamp shapes).
      name: "shape",
      type: "text",
      required: true,
      defaultValue: "circle",
      validate: (value: unknown) => isShapeKey(value) || "A shape's key",
    },
    { name: "drawing", type: "json" },
    { name: "message", type: "textarea", maxLength: MESSAGE_MAX },
  ],
  endpoints: [
    {
      // The account's own cards, and who took them.
      path: "/",
      method: "get",
      handler: async (req) => {
        const account = await sessionAccount(req);
        if (!account) return notLoggedIn();
        return Response.json(
          { cards: await sentBy(req, String(account.id)) },
          { headers: { "Cache-Control": "private, no-store" } }
        );
      },
    },
    {
      // Taken back: the link is dead from here on. Its giver's call alone;
      // the stamps taken from it stay where they are.
      path: "/:id",
      method: "delete",
      handler: async (req) => {
        const account = await sessionAccount(req);
        if (!account) return notLoggedIn();
        const id = String(req.routeParams?.id);
        const card = CARD_ID.test(id) ? await cardById(req, id) : null;
        if (!card) return notFound();
        if (idOf(card.from) !== String(account.id)) {
          return Response.json({ error: "Not your card." }, { status: 403 });
        }
        await req.payload.delete({
          collection: "cards",
          id,
          overrideAccess: true,
          req,
        });
        return Response.json({});
      },
    },
    {
      path: "/",
      method: "post",
      handler: async (req) => {
        const account = await sessionAccount(req);
        if (!account) return notLoggedIn();
        const me = String(account.id);
        const body = ((await req.json?.().catch(() => null)) ?? {}) as Doc;
        const stamp = isId(body.stamp)
          ? await stampById(req, body.stamp)
          : null;
        if (!stamp || stamp.deleted || idOf(stamp.owner) !== me) {
          return notFound();
        }
        if (isCopy(stamp)) {
          return Response.json(
            { error: "Not drawn by its owner." },
            { status: 403 }
          );
        }
        if (tooMany(me)) {
          return Response.json({ error: "Too many cards." }, { status: 429 });
        }
        const look = cardStampOf(stamp);
        const data = {
          stamp: String(stamp.id),
          from: me,
          ...look,
          message: cleanMessage(body.message),
        };
        // Twelve random letters meet an old id hardly ever – but should
        // they, the next try is another.
        for (let attempt = 0; attempt < 3; attempt++) {
          const id = newCardId();
          if (await cardById(req, id)) continue;
          await req.payload.create({
            collection: "cards",
            data: { ...data, id } as never,
            depth: 0,
            overrideAccess: true,
            req,
          });
          return Response.json({ id });
        }
        return Response.json({ error: "No id." }, { status: 500 });
      },
    },
    {
      path: "/:id",
      method: "get",
      handler: async (req) => {
        const card = await liveCard(req, String(req.routeParams?.id));
        if (!card) return notFound();
        const account = await sessionAccount(req);
        const view: CardView = {
          ...(await cardView(req, card)),
          ...(account && {
            mine: card.from === String(account.id),
            taken: Boolean(await copyOf(req, card.id, String(account.id))),
          }),
        };
        return Response.json(view, {
          headers: { "Cache-Control": "private, no-store" },
        });
      },
    },
    {
      path: "/:id/take",
      method: "post",
      handler: async (req) => {
        const account = await sessionAccount(req);
        if (!account) return notLoggedIn();
        const card = await liveCard(req, String(req.routeParams?.id));
        if (!card) return notFound();
        const me = String(account.id);
        if (card.from === me) {
          return Response.json({ error: "One's own card." }, { status: 403 });
        }
        return Response.json({ stamp: await takeCard(req, card, me) });
      },
    },
  ],
  timestamps: true,
};

/** A card as the endpoints use it. */
export type CardRow = {
  id: string;
  stamp: string;
  from: string;
  look: ReturnType<typeof cardStampOf>;
  message: string;
  createdAt: string;
};

const stampById = async (req: PayloadRequest, id: string) =>
  (await req.payload.findByID({
    collection: "stamps",
    id,
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
    req,
  })) as Doc | null;

const cardById = async (req: PayloadRequest, id: string) =>
  (await req.payload.findByID({
    collection: "cards",
    id,
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
    req,
  })) as Doc | null;

/** Whether a stamp came from someone – a card taken, a gift. */
const isCopy = (stamp: Doc) => {
  const kind = (stamp.origin as Doc | null | undefined)?.kind;
  return kind === "card" || kind === "gift";
};

/**
 * The card behind a link – none for an id that is no card's, nor for one
 * whose stamp is gone: it goes with it (`dropCards`), and should that ever
 * have failed, it is gone all the same.
 */
export const liveCard = async (
  req: PayloadRequest,
  id: string
): Promise<CardRow | null> => {
  if (!CARD_ID.test(id)) return null;
  const card = await cardById(req, id);
  const from = idOf(card?.from);
  const stamp = idOf(card?.stamp);
  if (!(card && from && stamp)) return null;
  const original = await stampById(req, stamp);
  if (!original || original.deleted) return null;
  return {
    id,
    stamp,
    from,
    look: cardStampOf(card),
    message: typeof card.message === "string" ? card.message : "",
    createdAt: new Date(String(card.createdAt ?? Date.now())).toISOString(),
  };
};

/**
 * A card as anyone with its link sees it – the giver by the name they have
 * now. For the endpoint, and for the card's page read on the server.
 */
export const cardView = async (
  req: PayloadRequest,
  card: CardRow
): Promise<CardView> => {
  const giver = (await req.payload.findByID({
    collection: "accounts",
    id: card.from,
    select: { name: true },
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
    req,
  })) as Doc | null;
  return {
    id: card.id,
    stamp: {
      name: card.look.name,
      color: card.look.color,
      shape: card.look.shape,
      drawing: (card.look.drawing ?? null) as CardView["stamp"]["drawing"],
    },
    message: card.message,
    from: typeof giver?.name === "string" ? giver.name : "",
    createdAt: card.createdAt,
  };
};

/** The account's copy of a card's stamp – if it took the card, and kept it. */
const copyOf = async (req: PayloadRequest, card: string, account: string) => {
  const { docs } = await req.payload.find({
    collection: "stamps",
    where: {
      and: [
        { "origin.card": { equals: card } },
        { owner: { equals: account } },
        { deleted: { not_equals: true } },
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  });
  return docs[0] ? String(docs[0].id) : null;
};

/**
 * The cards an account sent, the newest first – each with who took it: the
 * owners of the copies kept, by display name, in the order they took it.
 * Names only – as members of a calendar see each other. Whoever deleted
 * their copy, or their account, is none of them any more.
 */
const sentBy = async (
  req: PayloadRequest,
  account: string
): Promise<CardSent[]> => {
  const find = async (
    collection: "cards" | "stamps" | "accounts",
    where: Where
  ) =>
    (
      await req.payload.find({
        collection,
        where,
        depth: 0,
        pagination: false,
        overrideAccess: true,
        req,
      })
    ).docs as unknown as Doc[];
  const cards = await find("cards", { from: { equals: account } });
  if (!cards.length) return [];
  const ids = cards.map((card) => String(card.id));
  const [originals, copies] = await Promise.all([
    find("stamps", {
      and: [
        { id: { in: cards.map((card) => idOf(card.stamp) ?? "") } },
        { deleted: { not_equals: true } },
      ],
    }),
    find("stamps", {
      and: [{ "origin.card": { in: ids } }, { deleted: { not_equals: true } }],
    }),
  ]);
  const owners = [...new Set(copies.map((copy) => idOf(copy.owner) ?? ""))];
  const names = new Map(
    (owners.length ? await find("accounts", { id: { in: owners } }) : []).map(
      (owner) => [String(owner.id), String(owner.name ?? "")] as const
    )
  );
  const time = (doc: Doc) => new Date(String(doc.createdAt ?? 0)).getTime();
  const alive = new Set(originals.map((stamp) => String(stamp.id)));
  return cards
    .filter((card) => alive.has(idOf(card.stamp) ?? ""))
    .sort((a, b) => time(b) - time(a))
    .map((card) => ({
      id: String(card.id),
      stamp: idOf(card.stamp) ?? "",
      message: typeof card.message === "string" ? card.message : "",
      createdAt: new Date(time(card)).toISOString(),
      takers: copies
        .filter((copy) => (copy.origin as Doc | null)?.card === card.id)
        .sort((a, b) => time(a) - time(b))
        .map((copy) => names.get(idOf(copy.owner) ?? ""))
        .filter((name): name is string => name !== undefined),
    }));
};

/**
 * Takes a card: a copy of its stamp, the account's own – with where it came
 * from, the giver by name as they are called now. Taken before (and kept),
 * that one comes back. Every open app of the account syncs.
 */
const takeCard = async (req: PayloadRequest, card: CardRow, me: string) => {
  const kept = await copyOf(req, card.id, me);
  if (kept) return kept;
  const giver = (await req.payload.findByID({
    collection: "accounts",
    id: card.from,
    select: { name: true },
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
    req,
  })) as Doc | null;
  const id = newId();
  await req.payload.create({
    collection: "stamps",
    data: {
      id,
      ...card.look,
      owner: me,
      sharedWith: [],
      origin: {
        kind: "card",
        from: card.from,
        name: String(giver?.name ?? ""),
        message: card.message,
        card: card.id,
        stamp: card.stamp,
      },
      changedAt: new Date().toISOString(),
      deleted: false,
    } as never,
    context: { sync: true, by: me },
    depth: 0,
    overrideAccess: true,
    req,
  });
  nudge([me]);
  return id;
};

/**
 * A stamp deleted – its cards go: nobody takes it any more. (The stamps'
 * hook, collections/stamps.ts: a stamp is deleted as a marker, by the sync
 * and with its owner's account.)
 */
export const dropCards: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  req,
}) => {
  if (doc.deleted && !previousDoc?.deleted) {
    await req.payload.delete({
      collection: "cards",
      where: { stamp: { equals: String(doc.id) } },
      overrideAccess: true,
      req,
    });
  }
  return doc;
};
