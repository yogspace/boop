import {
  APIError,
  type CollectionBeforeChangeHook,
  type CollectionConfig,
  type Payload,
} from "payload";
import { adminOnly, isAdmin } from "@/access";
import { idOf } from "@/features/calendar/membership";
import { SHAPES } from "@/features/calendar/model";
import { notifyGifted } from "@/features/push/gifted";
import { stampColorsNow } from "@/features/site/stamp-colors";
import { nudge } from "@/features/sync/live";
import { isLocale, LOCALES, type Locale } from "@/i18n/config";
import { newId } from "@/lib/id";
import { MESSAGE_MAX } from "./protocol";
import { BOOP, cardIdOf, cardStampOf, cleanMessage } from "./rules";

/**
 * Gifts from Boop: a stamp the owner sends from the CMS to everyone – in a
 * color nobody else can pick, if he likes (Site → Stamp colors, “Public”
 * unticked).
 *
 * The stamp is drawn in the app – an account with the admin box picks those
 * colors there too – and sent as a card; its link goes here, and the gift
 * takes the card's shape and drawing (`takeDrawing`). Its name and its few
 * words are the CMS's, per language.
 *
 * “Send” (send-gift.tsx → POST /api/gifts/:id/send) gives every account
 * with a confirmed address a copy of its own, from Boop (`sendGift`) – once:
 * sent again, only those without one get it, and an account made later
 * gets nothing until then. The app shows it as it comes (a nudge, the
 * sync), and the devices that want to hear of it hear of it (push/
 * gifted.ts). No mail: the privacy policy promises none of that kind.
 */

type Doc = Record<string, unknown>;

/** Accounts given their copy at a time – then the server breathes. */
export const GIFT_PORTION = 50;

/** The gifts on their way right now – one sending at a time per gift. */
const sending = new Set<string>();

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
    shape: look.shape,
    drawing: look.drawing,
    color: data.color || look.color,
  };
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
      "Stamps from Boop for everyone. Draw it in the app (an account with the “Admin” box can pick the colors that aren't public), send it as a card, paste the card's link here – then “Send to everyone”. Everyone with a confirmed address gets a copy of their own, sees it in the app and – if they want – as a notification. No mail.",
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
      required: true,
      admin: {
        description:
          "The card's link (or its id) – the stamp's shape and drawing come from it, once, when saved.",
      },
      validate: (value: unknown) =>
        cardIdOf(value)
          ? true
          : "A card's link, like https://…/de/card/AbCd1234EfGh",
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
      name: "shape",
      type: "select",
      options: [...SHAPES],
      admin: { hidden: true },
    },
    { name: "drawing", type: "json", admin: { hidden: true } },
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
        const { totalDocs } = await req.payload.count({
          collection: "accounts",
          where: { _verified: { equals: true } },
          overrideAccess: true,
        });
        const { payload } = req;
        void sendGift(payload, id).catch((error) =>
          payload.logger.error({ err: error, msg: "[gifts] not sent" })
        );
        return Response.json({ accounts: totalDocs }, { status: 202 });
      },
    },
  ],
  timestamps: true,
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
