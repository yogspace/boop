import { revalidateTag } from "next/cache";

/**
 * What the pages take from the CMS, cached until it changes – one tag each.
 * Saving in the admin expires the tag (the `expireOnChange` hooks on the
 * globals), so the next visitor gets the new version.
 */
export const TAGS = {
  site: "site",
  legal: "legal",
} as const;

export type CacheTag = (typeof TAGS)[keyof typeof TAGS];

/**
 * Expires cache tags AT ONCE. In Next 16 a plain `revalidateTag(tag)` is
 * stale-while-revalidate: the next visitor still gets the old content and
 * only starts the rebuild – after saving one had to reload twice. `{ expire:
 * 0 }` renders anew on the next request. (`updateTag` would be the instant
 * one, but throws outside server actions – Payload's hooks run in its REST
 * route handler.)
 */
export const expireTags = (...tags: string[]) => {
  for (const tag of tags) revalidateTag(tag, { expire: 0 });
};

type HookArgs = { doc: unknown; context?: Record<string, unknown> };

/**
 * Hooks that expire a tag when a document changes or goes – skipped when the
 * change comes with `context.disableRevalidate` (e.g. a script outside of a
 * request, where revalidateTag throws). Fits collections and globals alike
 * (a global can't be deleted, so it only ever runs `afterChange`).
 */
export const expireOnChange = (tag: CacheTag) => ({
  afterChange: [
    ({ doc, context }: HookArgs) => {
      if (!context?.disableRevalidate) expireTags(tag);
      return doc;
    },
  ],
  afterDelete: [
    ({ doc, context }: HookArgs) => {
      if (!context?.disableRevalidate) expireTags(tag);
      return doc;
    },
  ],
});
