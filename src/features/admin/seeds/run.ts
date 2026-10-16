import type { Payload } from "payload";
import { seedLegal } from "@/features/legal/seed";
import { seedDrawingTemplates, seedStampShapes } from "@/features/site/seed";
import { syncTranslations } from "@/features/translations/seed";
import type { SeedKey } from "./definitions";

/** Each seed, run – its summary for the admin. */
const runners: Record<
  SeedKey,
  (payload: Payload, replace: boolean) => Promise<string>
> = {
  translations: async (payload) => {
    const { added, removed, kept, misfits, codeOnly } =
      await syncTranslations(payload);
    return [
      `${added.length} added, ${removed.length} removed, ${kept} kept`,
      ...(misfits.length
        ? [
            `${misfits.length} don't fit the code's placeholders and show the code's text: ${misfits.join(", ")}`,
          ]
        : []),
      ...(codeOnly.length
        ? [`${codeOnly.length} only in the code: ${codeOnly.join(", ")}`]
        : []),
    ].join(" · ");
  },
  legal: async (payload, replace) => {
    const results = await seedLegal(payload, replace ? "replace" : "fill");
    return Object.entries(results)
      .map(([locale, result]) => `${locale.toUpperCase()} ${result}`)
      .join(", ");
  },
  shapes: (payload, replace) =>
    seedStampShapes(payload, replace ? "replace" : "fill"),
  templates: (payload, replace) =>
    seedDrawingTemplates(payload, replace ? "replace" : "fill"),
};

export const runSeed = (key: SeedKey, payload: Payload, replace: boolean) =>
  runners[key](payload, replace);
