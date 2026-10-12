import type { DefaultServerCellComponentProps, Payload } from "payload";
import { cache } from "react";
import { stampColorsOf } from "./stamp-colors";

/** The CMS's colors, by key – read once for all the cells of a list. */
const hexes = cache(async (payload: Payload) => {
  const site = (await payload
    .findGlobal({ slug: "site", depth: 0, overrideAccess: true })
    .catch(() => null)) as { stampColors?: unknown } | null;
  return new Map(
    stampColorsOf(site?.stampColors).map((color) => [color.key, color.hex])
  );
});

/**
 * A stamp, calendar or print's color in the admin's lists
 * (calendar/color-field.ts): the swatch as the CMS has it now, and the key –
 * a key without a swatch is one the CMS no longer has (in the app it shows
 * in the first color). Looks like a color's row in “Site” (admin.scss).
 */
export const StampColorCell = async ({
  cellData,
  payload,
}: DefaultServerCellComponentProps) => {
  const key = typeof cellData === "string" ? cellData : "";
  if (!key) return null;
  const hex = (await hexes(payload)).get(key);
  return (
    <span className="stamp-color-row">
      <i style={{ background: hex ?? "transparent" }} />
      <span>{key}</span>
    </span>
  );
};
