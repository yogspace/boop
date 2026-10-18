import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests in Node – the logic of the features, without the app.
export default defineConfig({
  // As in tsconfig.json – for the app's modules that import by it.
  resolve: {
    alias: { "@/": fileURLToPath(new URL("./src/", import.meta.url)) },
  },
  test: {
    include: ["test/**/*.test.ts"],
  },
});
