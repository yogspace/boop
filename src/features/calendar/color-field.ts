import type { Field } from "payload";
import { defaultColor } from "@/features/site/stamp-colors";
import { isColorKey } from "./palette";

/**
 * The color of a stamp, a calendar or a print: a stamp color's KEY, as
 * plain text – no select: which colors there are is the CMS's to say
 * (“Site” → Stamp colors), and a key outlives its color (palette.ts). So
 * only its form is checked, never whether the CMS has it right now.
 *
 * `wished`: the color a new one starts in – if the CMS has it, else its
 * first (stamp-colors.ts). Without one the field may stay empty.
 */
export const colorField = (name: string, wished?: string): Field => ({
  name,
  type: "text",
  ...(wished && {
    required: true,
    defaultValue: ({ req }) => defaultColor(req, wished),
  }),
  admin: {
    description: "A stamp color's key (“Site” → Stamp colors), e.g. “mint”.",
    // Its swatch beside the key in the lists.
    components: { Cell: "@/features/site/stamp-color-cell#StampColorCell" },
  },
  // Its own check takes the place of Payload's – `required` included.
  validate: (value: unknown) => {
    if (value == null || value === "") {
      return wished ? "A stamp color's key, e.g. “mint”." : true;
    }
    return (
      isColorKey(value) ||
      "A stamp color's key: lowercase letters, digits and dashes, e.g. “mint”."
    );
  },
});
