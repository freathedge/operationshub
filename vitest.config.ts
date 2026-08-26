import path from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
  },
});
