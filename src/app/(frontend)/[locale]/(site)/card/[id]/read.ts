import config from "@payload-config";
import { createLocalReq, getPayload } from "payload";
import { cache } from "react";
import { liveCard } from "@/features/cards/cards";
import { CARD_ID, type CardView } from "@/features/cards/protocol";

/**
 * A card as everyone sees it, read on the server – for the page, its title
 * and the picture a messenger shows. The same as `GET /api/cards/:id`
 * (features/cards/cards.ts) gives someone not logged in: whose card it is
 * and whether it is taken, the browser asks (ui/card-panel.tsx).
 *
 * Null: no such card (anymore). Undefined: the server couldn't ask (no
 * database) – the browser tries itself. Once per request: the page and its
 * metadata share the answer.
 */
export const readCard = cache(
  async (id: string): Promise<CardView | null | undefined> => {
    if (!CARD_ID.test(id)) return null;
    try {
      const payload = await getPayload({ config });
      const req = await createLocalReq({}, payload);
      const card = await liveCard(req, id);
      if (!card) return null;
      const giver = (await payload.findByID({
        collection: "accounts",
        id: card.from,
        select: { name: true },
        depth: 0,
        disableErrors: true,
        overrideAccess: true,
        req,
      })) as { name?: unknown } | null;
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
    } catch (error) {
      console.error("[card] could not read the card:", error);
      return undefined;
    }
  }
);
