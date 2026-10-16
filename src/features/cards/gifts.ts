import {
  APIError,
  type CollectionBeforeChangeHook,
  type CollectionConfig,
  type Endpoint,
  type Payload,
} from "payload";
import { adminOnly, isAdmin } from "@/access";
import { sessionAccount } from "@/features/accounts/session";
import { idOf } from "@/features/calendar/membership";
import { isShapeKey } from "@/features/calendar/shapes";
import { notifyGifted } from "@/features/push/gifted";
import { stampColorsNow } from "@/features/site/stamp-colors";
import { shapeKeysNow } from "@/features/site/stamp-shapes";
import { nudge } from "@/features/sync/live";
import { isLocale, LOCALES, type Locale } from "@/i18n/config";
import { isId, newId } from "@/lib/id";
import { rateLimit } from "@/lib/rate-limit";
import { MESSAGE_MAX } from "./protocol";
import { BOOP, cardIdOf, cardStampOf, cleanMessage } from "./rules";

/**
 * Gifts from Boop: a stamp the owner sends to everyone – in a color nobody
 * else can pick, if he likes (Site → Stamp colors, “Public” unticked).
 *
 * The stamp is drawn in the app – an account with the admin box picks those
 * colors there too. From there it goes one of two ways:
 *
 * - straight from the app: such an account sends a stamp it drew to
 *   everyone (POST /api/gifts/from-stamp, the stamp's sheet). The gift is
 *   made of the stamp as it is – its name and the few words typed with it,
 *   the same in every language – and goes out at once.
 * - by the CMS: the stamp is sent as a card, the card's link pasted into a
 *   gift made here, which takes the card's shape and drawing
 *   (`takeDrawing`); its name and words are the CMS's, per language. “Send”
 *   (send-gift.tsx → POST /api/gifts/:id/send) sends it.
 *
 * Either way every account with a confirmed address gets a copy of its own,
 * from Boop (`sendGift`) – the sender's too – once: sent again, only those
 * without one get it, and an account made later gets nothing until then.
 * The app shows it as it comes (a nudge, the sync), and the devices that
 * want to hear of it hear of it (push/gifted.ts). No mail: the privacy
 * policy promises none of that kind.
 */

type Doc = Record<string, unknown>;

/** Accounts given their copy at a time – then the server breathes. */
export const GIFT_PORTION = 50;

/** The gifts on their way right now – one sending at a time per gift. */
const sending = new Set<string>();

// A gift reaches everyone, and can't be taken back – a few an hour, should
// a finger slip or a login be in the wrong hands.
const tooMany = rateLimit({ limit: 3, windowMs: 60 * 60 * 1000 });

/** What a gift is called whose stamp has no name. */
const UNNAMED: Record<Locale, string> = { de: "Überraschung", en: "Surprise" };

/** A localized field read with locale "all" – a value per language. */
const perLocale = (value: unknown, clean = (text: unknown) => String(text)) => {
  const given = (
    value && typeof value === "object" ? value : { de: value }
  ) as Partial<Record<Locale, unknown>>;
  const texts = Object.fromEntries(
    LOCALES.map((locale) => [
      locale,
      given[locale] == null ? "" : clean(given[locale]).trim(),
    ])
  ) as Record<Locale, string>;
  const any = LOCALES.map((locale) => texts[locale]).find(Boolean) ?? "";
  return Object.fromEntries(
    LOCALES.map((locale) => [locale, texts[locale] || any])
  ) as Record<Locale, string>;
};

/**
 * The card's link turned into its id – and, when that is new, the card's
 * stamp taken over: its shape and drawing, and its color while the gift
 * has none of its own. A card gone after that changes nothing: the gift
 * keeps what it took.
 */
const takeDrawing: CollectionBeforeChangeHook = async ({
  data,
  originalDoc,
  req,
}) => {
  const card = cardIdOf(data.card);
  if (!card) return data;
  const next = { ...data, card };
  if (card === originalDoc?.card && originalDoc?.drawing) return next;
  const found = (await req.payload.findByID({
    collection: "cards",
    id: card,
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
    req,
  })) as Doc | null;
  if (!found) {
    throw new APIError(
      "No card with this link – make one in the app (a stamp's “Send as card”) and paste its link.",
      400,
      undefined,
      true
    );
  }
  const look = cardStampOf(found);
  return {
    ...next,
    // The stamp the card was made of – the copies keep it (`origin.stamp`).
    ...(found.stamp ? { stamp: idOf(found.stamp) } : {}),
    shape: look.shape,
    drawing: look.drawing,
    color: data.color || look.color,
  };
};

/**
 * POST /api/gifts/from-stamp { stamp, message? } → { gift, sent }
 *
 * An account with the admin box sends a stamp it drew to everyone: a gift
 * is made of the stamp as it is now, and sent at once (`sendSoon`). The box
 * is read from the database for this very request – what a login was told
 * of it once doesn't count. Not a stamp that came from someone: what was
 * given is not passed on, here neither (cards.ts).
 */
const giftFromStamp: Endpoint["handler"] = async (req) => {
  const account = await sessionAccount(req);
  if (!account) {
    return Response.json({ error: "Not logged in." }, { status: 401 });
  }
  const me = String(account.id);
  const { payload } = req;
  const self = (await payload.findByID({
    collection: "accounts",
    id: me,
    select: { admin: true },
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
    req,
  })) as Doc | null;
  if (self?.admin !== true) {
    return Response.json({ error: "Not for this account." }, { status: 403 });
  }
  const body = ((await req.json?.().catch(() => null)) ?? {}) as Doc;
  const stamp = isId(body.stamp)
    ? ((await payload.findByID({
        collection: "stamps",
        id: body.stamp,
        depth: 0,
        disableErrors: true,
        overrideAccess: true,
        req,
      })) as Doc | null)
    : null;
  if (!stamp || stamp.deleted || idOf(stamp.owner) !== me) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }
  if ((stamp.origin as Doc | null | undefined)?.kind || !stamp.drawing) {
    return Response.json({ error: "Not drawn by its owner." }, { status: 400 });
  }
  if (tooMany(me)) {
    return Response.json({ error: "Too many gifts." }, { status: 429 });
  }
  // Sent before: the same gift again – it reaches those without it (new
  // accounts since), no one twice.
  const { docs: before } = await payload.find({
    collection: "gifts",
    where: { stamp: { equals: String(stamp.id) } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  });
  if (before[0]) {
    const id = String(before[0].id);
    return Response.json(
      { gift: id, sent: await sendSoon(payload, id) },
      { status: 202 }
    );
  }
  const look = cardStampOf(stamp);
  const colors = await stampColorsNow(req);
  const message = cleanMessage(body.message);
  // The same in every language: its maker wrote it once.
  const texts = (locale: Locale) => ({
    name: look.name.trim() || UNNAMED[locale],
    message,
  });
  const [first, ...others] = LOCALES;
  const gift = await payload.create({
    collection: "gifts",
    locale: first,
    data: {
      ...texts(first),
      stamp: String(stamp.id),
      shape: look.shape,
      drawing: look.drawing,
      // A color the CMS no longer has shows as its first – there, too.
      ...(colors.some((color) => color.key === look.color) && {
        color: look.color,
      }),
    } as never,
    depth: 0,
    overrideAccess: true,
    req,
  });
  for (const locale of others) {
    await payload.update({
      collection: "gifts",
      id: gift.id,
      locale,
      data: texts(locale),
      depth: 0,
      overrideAccess: true,
      req,
    });
  }
  const id = String(gift.id);
  return Response.json(
    { gift: id, sent: await sendSoon(payload, id) },
    { status: 202 }
  );
};

/** The shape – one the CMS has, or the code's (shapes.ts). */
const knownShape = async (
  value: unknown,
  { req }: { req: Parameters<typeof shapeKeysNow>[0] }
) => {
  if (value == null || value === "") return true;
  return (
    (isShapeKey(value) && (await shapeKeysNow(req)).includes(value)) ||
    "A shape from Site → Stamp shapes."
  );
};

/** The color – one the CMS has, public or not. Empty: the card's. */
const knownColor = async (
  value: unknown,
  { req }: { req: Parameters<typeof stampColorsNow>[0] }
) => {
  if (value == null || value === "") return true;
  const colors = await stampColorsNow(req);
  return (
    colors.some((color) => color.key === value) ||
    "A color from Site → Stamp colors."
  );
};

export const Gifts: CollectionConfig = {
  slug: "gifts",
  labels: { singular: "Gift", plural: "Gifts" },
  // The owner's own content – nothing of anyone's in it.
  access: {
    read: adminOnly,
    create: adminOnly,
    update: adminOnly,
    delete: adminOnly,
    readVersions: adminOnly,
  },
  admin: {
    group: "Content",
    useAsTitle: "name",
    defaultColumns: ["name", "color", "sentAt", "sentTo"],
    description:
      "Stamps from Boop for everyone – each account with a confirmed address gets a copy of its own, sees it in the app and, if it wants, as a notification. No mail. The short way: in the app, an account with the “Admin” box opens a stamp it drew and sends it to everyone; it then shows up here. From here: draw the stamp in the app, send it as a card, paste the card's link into a new gift – then “Send to everyone”.",
    components: {
      edit: {
        beforeDocumentControls: ["@/features/cards/send-gift#SendGift"],
      },
    },
  },
  fields: [
    {
      name: "name",
      type: "text",
      required: true,
      localized: true,
      maxLength: 40,
      admin: {
        description:
          "The stamp's name – each account gets it in its language (switch at the top).",
      },
    },
    {
      name: "message",
      type: "textarea",
      localized: true,
      maxLength: MESSAGE_MAX,
      admin: {
        description: "A few words with it, shown in the app – optional.",
      },
    },
    {
      name: "card",
      type: "text",
      admin: {
        description:
          "The card's link (or its id) – the stamp's shape and drawing come from it, once, when saved. Empty only for a gift sent straight from the app: that one brought its drawing along.",
      },
      // A card to take the stamp from – or the stamp is there already.
      validate: (value: unknown, { data }: { data?: unknown }) => {
        if (cardIdOf(value)) return true;
        const empty = value == null || value === "";
        return empty && (data as Doc | undefined)?.drawing
          ? true
          : "A card's link, like https://…/de/card/AbCd1234EfGh";
      },
    },
    {
      name: "color",
      type: "text",
      admin: {
        description: "Empty: the card's color.",
        components: { Field: "@/features/cards/gift-admin#GiftColorField" },
      },
      validate: knownColor,
    },
    {
      // A look at it, as the app shows it.
      name: "preview",
      type: "ui",
      admin: {
        components: { Field: "@/features/cards/gift-admin#GiftPreview" },
      },
    },
    // Taken from the card (`takeDrawing`).
    {
      // A shape's key (Site → Stamp shapes).
      name: "shape",
      type: "text",
      admin: { hidden: true },
      validate: knownShape,
    },
    { name: "drawing", type: "json", admin: { hidden: true } },
    // The stamp it was made of – in the app, or the card's in the CMS.
    // Sent from the app again, it is this gift again; its copies keep it.
    { name: "stamp", type: "text", index: true, admin: { hidden: true } },
    {
      name: "sentAt",
      type: "date",
      access: { create: () => false, update: () => false },
      admin: {
        readOnly: true,
        position: "sidebar",
        date: { pickerAppearance: "dayAndTime" },
        description: "When it last went out.",
      },
    },
    {
      name: "sentTo",
      label: "Sent to",
      type: "number",
      access: { create: () => false, update: () => false },
      admin: {
        readOnly: true,
        position: "sidebar",
        description: "How many accounts got it – all sendings together.",
      },
    },
  ],
  hooks: { beforeChange: [takeDrawing] },
  endpoints: [
    {
      // Straight from the app: a stamp of one's own, to everyone.
      path: "/from-stamp",
      method: "post",
      handler: giftFromStamp,
    },
    {
      // “Send to everyone” – in the background: the answer says to how many
      // it goes, `sentAt` and `sentTo` once it is done.
      path: "/:id/send",
      method: "post",
      handler: async (req) => {
        if (!isAdmin(req)) {
          return Response.json(
            { error: "Admins only – please log in." },
            { status: 401 }
          );
        }
        const id = String(req.routeParams?.id ?? "");
        const gift = await giftById(req.payload, id);
        if (!gift) {
          return Response.json({ error: "Not found." }, { status: 404 });
        }
        if (!(gift.drawing && gift.shape)) {
          return Response.json(
            { error: "No stamp yet – paste a card's link and save." },
            { status: 400 }
          );
        }
        if (sending.has(id)) {
          return Response.json(
            { error: "On its way already." },
            { status: 409 }
          );
        }
        return Response.json(
          { accounts: await sendSoon(req.payload, id) },
          { status: 202 }
        );
      },
    },
  ],
  timestamps: true,
};

/**
 * Starts a gift on its way, in the background – and says to how many
 * accounts it goes: all with a confirmed address.
 */
const sendSoon = async (payload: Payload, id: string) => {
  const [accounts, copies] = await Promise.all([
    payload.count({
      collection: "accounts",
      where: { _verified: { equals: true } },
      overrideAccess: true,
    }),
    // Those who have it – or had it: a copy deleted stays a marker, and
    // isn't given again.
    payload.count({
      collection: "stamps",
      where: { "origin.gift": { equals: id } },
      overrideAccess: true,
    }),
  ]);
  void sendGift(payload, id).catch((error) =>
    payload.logger.error({ err: error, msg: "[gifts] not sent" })
  );
  return Math.max(0, accounts.totalDocs - copies.totalDocs);
};

const giftById = async (payload: Payload, id: string) =>
  /^[0-9a-f]{24}$/.test(id)
    ? ((await payload.findByID({
        collection: "gifts",
        id,
        locale: "all",
        depth: 0,
        disableErrors: true,
        overrideAccess: true,
      })) as Doc | null)
    : null;

/**
 * Gives a gift to every account with a confirmed address that hasn't got
 * it yet – deleted it, too: it had it. In portions (`portion`), one after
 * the other: each portion's devices hear of it at once, the next waits its
 * turn behind whatever else the server has to do. Notes when and to how
 * many it went. Returns how many got it now, and how many had it.
 */
export const sendGift = async (
  payload: Payload,
  id: string,
  { portion = GIFT_PORTION }: { portion?: number } = {}
) => {
  const gift = await giftById(payload, id);
  if (!gift || sending.has(id)) return { sent: 0, had: 0 };
  sending.add(id);
  try {
    const names = perLocale(gift.name);
    const messages = perLocale(gift.message, cleanMessage);
    const look = cardStampOf({ ...gift, name: "" });
    let sent = 0;
    let had = 0;
    for (let page = 1; ; page++) {
      const accounts = await payload.find({
        collection: "accounts",
        where: { _verified: { equals: true } },
        select: { locale: true },
        sort: "createdAt",
        limit: portion,
        page,
        depth: 0,
        overrideAccess: true,
      });
      const ids = accounts.docs.map((doc) => String(doc.id));
      const { docs: copies } = ids.length
        ? await payload.find({
            collection: "stamps",
            where: {
              and: [{ "origin.gift": { equals: id } }, { owner: { in: ids } }],
            },
            select: { owner: true },
            depth: 0,
            pagination: false,
            overrideAccess: true,
          })
        : { docs: [] };
      const having = new Set(copies.map((copy) => idOf(copy.owner)));
      const given: string[] = [];
      for (const account of accounts.docs as unknown as Doc[]) {
        const owner = String(account.id);
        if (having.has(owner)) {
          had++;
          continue;
        }
        const locale = isLocale(account.locale) ? account.locale : "de";
        await payload.create({
          collection: "stamps",
          data: {
            id: newId(),
            ...look,
            name: names[locale].slice(0, 40),
            owner,
            sharedWith: [],
            origin: {
              kind: "gift",
              from: null,
              name: BOOP,
              message: messages[locale],
              gift: id,
              // The stamp it was made of, when there is one (`stamp` below).
              ...(gift.stamp ? { stamp: String(gift.stamp) } : {}),
            },
            changedAt: new Date().toISOString(),
            deleted: false,
          } as never,
          context: { sync: true },
          depth: 0,
          overrideAccess: true,
        });
        given.push(owner);
        sent++;
      }
      nudge(given);
      await notifyGifted(payload, { gift: id, name: names, accounts: given });
      if (!accounts.hasNextPage) break;
      await new Promise((resolve) => setImmediate(resolve));
    }
    await payload.update({
      collection: "gifts",
      id,
      data: {
        sentAt: new Date().toISOString(),
        sentTo: Number(gift.sentTo ?? 0) + sent,
      },
      depth: 0,
      overrideAccess: true,
    });
    payload.logger.info(`[gifts] ${id}: ${sent} sent, ${had} had it`);
    return { sent, had };
  } finally {
    sending.delete(id);
  }
};
