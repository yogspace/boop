import config from "@payload-config";
import { createLocalReq, getPayload } from "payload";
import { cache } from "react";
import { cardView, liveCard } from "@/features/cards/cards";
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
      return card ? await cardView(req, card) : null;
    } catch (error) {
      console.error("[card] could not read the card:", error);
      return undefined;
    }
  }
);
