import type { Payload } from "payload";
import { seedLegal } from "@/features/legal/seed";
import type { SeedKey } from "./definitions";

/** Each seed, run – its summary for the admin. */
const runners: Record<
  SeedKey,
  (payload: Payload, replace: boolean) => Promise<string>
> = {
  legal: async (payload, replace) => {
    const results = await seedLegal(payload, replace ? "replace" : "fill");
    return Object.entries(results)
      .map(([locale, result]) => `${locale.toUpperCase()} ${result}`)
      .join(", ");
  },
};

export const runSeed = (key: SeedKey, payload: Payload, replace: boolean) =>
  runners[key](payload, replace);
