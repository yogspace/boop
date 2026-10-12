import type { GlobalConfig } from "payload";
import { adminOnly, anyone } from "@/access";
import { PLACEHOLDERS } from "@/i18n/dictionaries";
import { expireOnChange, TAGS } from "@/lib/cache";
import { TRANSLATION_DEFAULTS, TRANSLATION_KEYS } from "./defaults";
import { translationFields } from "./tree";

/**
 * The interface texts of the site and the app, in German and English
 * (locale at the top of the admin). The fields come from the keys in the
 * code (i18n/dictionaries.ts): “app.draw.title” is the field `title` in the
 * group `draw` of `app`. A new key in the code is a new field here; the
 * Seeds page fills it with its text from the code and deletes keys the code
 * no longer has (seed.ts). Until then – and wherever a field is empty – the
 * site shows the code's text. What is changed here wins.
 *
 * A text with placeholders keeps them – “Hallo {name}!”: one the code
 * doesn't fill, or one missing, is refused when saving (tree.ts).
 *
 * Saving renders the pages anew (lib/cache.ts): the next visitor gets the
 * texts, the app's static page included.
 */
export const Translations: GlobalConfig = {
  slug: "translations",
  label: "Translations",
  // Explicit: accounts are logged-in Payload users too, and Payload's
  // default would let any of them write here.
  access: { read: anyone, readVersions: adminOnly, update: adminOnly },
  hooks: expireOnChange(TAGS.texts),
  admin: {
    group: "Content",
    description:
      "Every text of the site and the app – switch the language at the top. An empty field shows the code's text (below each field). Keep the placeholders in braces, like {name}.",
  },
  fields: translationFields(
    TRANSLATION_KEYS,
    TRANSLATION_DEFAULTS,
    PLACEHOLDERS
  ),
};
