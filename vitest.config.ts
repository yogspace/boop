import { defineConfig } from "vitest/config";

// Unit tests in Node – the logic of the features, without the app.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
  },
});
