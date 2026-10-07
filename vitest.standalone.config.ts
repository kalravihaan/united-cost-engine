import { defineConfig, type Plugin } from "vitest/config";
import path from "node:path";

/**
 * Runs the PostgreSQL integration tests against the in-memory store used by the single-file build:
 *   npx vitest run -c vitest.standalone.config.ts
 * Proves the browser store behaves like the database for everything the app does.
 */
const root = import.meta.dirname;
const swap: Record<string, string> = {
  [path.join(root, "src/server/db.ts")]: path.join(root, "standalone/shims/db.ts"),
  [path.join(root, "src/server/fileStore.ts")]: path.join(root, "standalone/shims/fileStore.ts"),
};
const plugin: Plugin = {
  name: "standalone-swap",
  enforce: "pre",
  async resolveId(source, importer, opts) {
    if (!/server\/(db|fileStore)$|^\.\.?\/(db|fileStore)$/.test(source)) return null;
    const r = await this.resolve(source, importer, { ...opts, skipSelf: true });
    return r && swap[r.id] ? swap[r.id] : null;
  },
};
export default defineConfig({
  plugins: [plugin],
  resolve: { alias: { "@": path.resolve(root, "src") } },
  test: { environment: "node", include: ["tests/db-integration.test.ts"], testTimeout: 60_000, env: { TEST_DATABASE_URL: "postgresql://memory/test" } },
});
