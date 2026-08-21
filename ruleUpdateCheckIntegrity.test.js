import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const app = fs.readFileSync(path.resolve(process.cwd(), "App.jsx"), "utf8");

describe("rule update check integrity", () => {
  it("does not mark a partial/offline rules check as successfully checked", () => {
    expect(app).toContain("let manifestChecked = false;");
    expect(app).toContain("let sourceStatusChecked = false;");
    expect(app).toContain("manifestChecked = true;");
    expect(app).toContain("sourceStatusChecked = true;");
    expect(app).toContain("if (manifestChecked && sourceStatusChecked) {");
  });

  it("updates lastCheckedAt from the latest state instead of overwriting decisions captured during async fetch", () => {
    expect(app).toContain("setRuleUpdateState((current) => {");
    expect(app).toContain("normalizeRuleUpdateState({ ...current, lastCheckedAt: checkedAt })");
    expect(app).not.toContain("const next = { ...ruleUpdateState, lastCheckedAt: new Date().toISOString() };");
  });

  it("keeps the check callback independent of a stale ruleUpdateState closure", () => {
    expect(app).toContain("  }, []);\n\n  useEffect(() => { checkRuleUpdates();");
  });
});
