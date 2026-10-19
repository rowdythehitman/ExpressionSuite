import { defineConfig } from "vitest/config";

// Kept apart from vite.config.ts, which starts the CEP and ExtendScript builds as a side effect.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
