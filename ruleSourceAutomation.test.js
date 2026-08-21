import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const watcher = fs.readFileSync(path.resolve(process.cwd(), "scripts/check-rule-sources.mjs"), "utf8");
const workflow = fs.readFileSync(path.resolve(process.cwd(), ".github/workflows/rule-source-watch.yml"), "utf8");

describe("official rule-source automation", () => {
  it("runs the source watcher on a real scheduled GitHub Actions workflow", () => {
    expect(workflow).toContain("schedule:");
    expect(workflow).toContain('cron: "15 0 * * 1"');
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("node scripts/check-rule-sources.mjs");
    expect(workflow).toContain("contents: write");
  });

  it("publishes each successful watcher timestamp as an auditable check", () => {
    expect(workflow).toContain("git diff --quiet -- public/rules-source-status.json");
    expect(workflow).toContain('echo "changed=true" >> "$GITHUB_OUTPUT"');
    expect(workflow).not.toContain("map(({ checkedAt, ...source }) => source)");
    expect(workflow).toContain("steps.diff.outputs.changed == 'true'");
  });

  it("keeps a previously latched source alert even when a later fetch fails", () => {
    expect(watcher).toContain("changed: !!old?.changed");
    expect(watcher).not.toContain("checkedAt: now, changed: false, previousHash");
  });
});
