import { revalidatePath, revalidateTag } from "next/cache";

/**
 * What the pages take from the CMS, cached until it changes – one tag each.
 * Saving in the admin expires the tag (the `expireOnChange` hooks on the
 * globals and collections), so the next visitor gets the new version.
 */
export const TAGS = {
  site: "site",
  legal: "legal",
  /** The interface texts (features/translations). */
  texts: "texts",
  /** The stamp shapes and drawing templates (features/site/collections.ts). */
  shapes: "shapes",
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
const expireTags = (...tags: string[]) => {
  for (const tag of tags) revalidateTag(tag, { expire: 0 });
};

/**
 * Every page that takes something from the CMS, rendered anew on its next
 * request – after a deploy (next/refresh). The build has no database: its
 * pages carry the code's own colors and texts, and a page built ahead is
 * kept until a tag of it expires. Both ways, as a page whose CMS read failed
 * at build time may not carry its tag.
 */
export const expireAll = () => {
  expireTags(...Object.values(TAGS));
  revalidatePath("/", "layout");
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
