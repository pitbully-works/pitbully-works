import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const app = fs.readFileSync(path.resolve(process.cwd(), "App.jsx"), "utf8");
const watcher = fs.readFileSync(path.resolve(process.cwd(), "scripts/check-rule-sources.mjs"), "utf8");

describe("5-country rules update center UI", () => {
  it("filters rule history by selected country", () => {
    expect(app).toContain("entry.country === country");
    expect(app).toContain("countryRuleUpdateHistory");
  });

  it("keeps source statuses for all countries so country switching works", () => {
    expect(app).toContain("setRuleSourceStatuses(Array.isArray(sourcePayload?.sources) ? sourcePayload.sources : [])");
  });

  it("latches an official-source change until the baseline is reviewed", () => {
    expect(watcher).toContain("!!old?.changed || (!!old?.hash && old.hash !== hash)");
  });
});
