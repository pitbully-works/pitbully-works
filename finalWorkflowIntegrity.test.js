import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const main = readFileSync(join(process.cwd(), ".github/workflows/test.yml"), "utf8");
const watcher = readFileSync(join(process.cwd(), ".github/workflows/rule-source-watch.yml"), "utf8");
const deprecated = readFileSync(join(process.cwd(), ".github/workflows/rule-source-watch-fixed.yml"), "utf8");

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
    expect(deprecated).not.toContain("cron:");
    expect(deprecated).toContain("workflow_dispatch:");
  });

  it("does not leave write permission on the deprecated duplicate", () => {
    expect(deprecated).toContain("contents: read");
    expect(deprecated).not.toContain("contents: write");
    expect(deprecated).not.toContain("git push");
  });
});
