// Relative, not `@/…`: the unit tests import this without the app's aliases.
import type { Locale } from "../../i18n/config";
import type { ColorName, Drawing, StampShape } from "../calendar/model";

/**
 * Stamps that travel to people who share no calendar: a card – a link to a
 * page with the stamp on it, sent by a person – and a gift from Boop, sent
 * from the CMS to everyone (in colors nobody else can pick).
 *
 * Whoever takes one gets a stamp of their own – a copy, theirs to stamp
 * with anywhere – that keeps where it came from (`StampOrigin`): the tray
 * says “from Anna” or “from Boop”, and sorts by it. A copy, not the giver's
 * stamp itself: should the giver delete theirs, the prints made with the
 * copy stay.
 *
 * Plain data – shared by the server (cards.ts, gifts) and the app.
 *
 *   POST /api/cards              { stamp, message? } → { id }   (its owner)
 *   GET  /api/cards/:id          → CardView                     (anyone)
 *   POST /api/cards/:id/take     → { stamp }                    (logged in)
 *   GET  /api/cards              → { cards: CardSent[] }        (one's own)
 *   DELETE /api/cards/:id        → {}                           (its giver)
 *
 * Taking a card twice gives the same stamp back, not a second one. The
 * giver sees who took it – by display name, as members of a calendar see
 * each other – and can take a card back: its link is dead then, the copies
 * already taken stay.
 */

/** Where a stamp came from, when its owner didn't draw it. */
export type StampOrigin = {
  kind: "card" | "gift";
  /** The giver's account – null for Boop's gifts, or a giver who is gone. */
  from: string | null;
  /** The giver's display name as it was then – “Boop” for a gift. */
  name: string;
  /**
   * The giver's few words, if any: a card's message, or a gift's in the
   * language of the account it went to. Only on one's own stamps.
   */
  message?: string;
};

/** A card as anyone with its link sees it. */
export type CardView = {
  id: string;
  /** The stamp as it was when the card was made. */
  stamp: {
    name: string;
    color: ColorName;
    shape: StampShape;
    drawing: Drawing | null;
  };
  /** A few words from the giver – "" for none. */
  message: string;
  /** The giver's display name – "" once their account is gone. */
  from: string;
  createdAt: string;
  /** Logged in: whether the card is one's own, and taken already. */
  mine?: boolean;
  taken?: boolean;
};

/** A card as its giver sees it: where it went. */
export type CardSent = {
  id: string;
  /** The giver's stamp it was made of. */
  stamp: string;
  message: string;
  createdAt: string;
  /** Who took it, by display name, in the order they did. */
  takers: string[];
};

/** A card's few words at most. */
export const MESSAGE_MAX = 280;

/** A card's id: short, random, hard to guess – the link is all it takes. */
export const CARD_ID = /^[A-Za-z0-9]{12}$/;

/** A card's page – the same word in every language, like the invitation's. */
export const cardPath = (locale: Locale, id: string) => `/${locale}/card/${id}`;
