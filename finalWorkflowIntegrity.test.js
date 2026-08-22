import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const main = readFileSync(join(process.cwd(), ".github/workflows/test.yml"), "utf8");
const watcherPath = join(process.cwd(), ".github/workflows/rule-source-watch.yml");
const deprecatedPath = join(process.cwd(), ".github/workflows/rule-source-watch-fixed.yml");
const watcher = readFileSync(watcherPath, "utf8");

describe("final workflow integrity", () => {
  it("verifies the production build before regression and mutation tests", () => {
    const build = main.indexOf("run: npm run build");
    const regression = main.indexOf("run: npx vitest run --reporter=verbose");
    const mutation = main.indexOf("run: node scripts/run-mutation-smoke.mjs");
    expect(build).toBeGreaterThan(-1);
    expect(regression).toBeGreaterThan(build);
    expect(mutation).toBeGreaterThan(regression);
  });

  it("keeps exactly one scheduled rule-source watcher", () => {
    expect(watcher).toContain('cron: "15 0 * * 1"');
    expect(existsSync(deprecatedPath)).toBe(false);
  });

  it("has no deprecated duplicate workflow left behind", () => {
    expect(existsSync(watcherPath)).toBe(true);
    expect(existsSync(deprecatedPath)).toBe(false);
  });
});
