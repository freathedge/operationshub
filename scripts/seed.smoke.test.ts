import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// Regression guard for the `pnpm seed` / `server-only` import crash: `lib/domain/seed.test.ts`
// exercises `seedFoundationData()` directly, but vitest resolves the `server-only` package via
// the alias in vitest.config.ts (straight to its no-op `react-server` build), which is NOT how
// plain `tsx`/Node resolves it. That gap is exactly why the crash shipped undetected — every
// other test imports `lib/supabase/admin.ts` through vitest's module graph and never notices.
// This test instead shells out to the real `pnpm seed` command, so it resolves `server-only`
// the same way a human (or CI) running `pnpm seed` would.
describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)(
  "pnpm seed (regression guard)",
  () => {
    it("runs to completion under plain Node without the server-only import crashing", async () => {
      const { stdout, stderr } = await execFileAsync("pnpm", ["seed"], {
        cwd: process.cwd(),
        env: process.env,
      });

      expect(stderr).not.toMatch(/server-only/i);
      expect(stdout).toMatch(/Seeded AlpenTech Industries/);
    }, 30_000);
  }
);
