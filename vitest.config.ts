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
      // `server-only` throws when resolved via its default export condition (plain Node,
      // as vitest runs). Next.js only avoids this because its RSC bundler resolves the
      // package's "react-server" export condition to a no-op instead. Alias straight to
      // that same no-op file so tests can import server-only-guarded modules.
      "server-only": path.resolve(
        __dirname,
        "node_modules/server-only/empty.js"
      ),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
  },
});
