// Vitest config for /math, /agents and /lib unit tests. Owner: Lead.
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
  test: {
    environment: "node",
    include: ["math/**/*.test.ts", "agents/**/*.test.ts", "lib/**/*.test.ts"],
    testTimeout: 30000,
    coverage: { provider: "v8", include: ["math/**", "agents/**"] },
  },
});
