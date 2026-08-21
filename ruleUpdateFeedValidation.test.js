import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const app = fs.readFileSync(path.resolve(process.cwd(), "App.jsx"), "utf8");

describe("rule update feed validation", () => {
  it("accepts the manifest only when schemaVersion 1 and updates[] are both present", () => {
    expect(app).toContain("if (payload?.schemaVersion === 1 && Array.isArray(payload?.updates)) {");
    expect(app).toContain("setRuleUpdates(mergeRuleUpdateManifests(payload.updates));");
  });

  it("does not replace last-known-good remote rules with an empty fallback after a bad fetch", () => {
    expect(app).not.toContain("let remote = [];");
    expect(app).not.toContain("setRuleUpdates(mergeRuleUpdateManifests(remote));");
  });

  it("accepts source status only when schemaVersion 1 and sources[] are both present", () => {
    expect(app).toContain("if (sourcePayload?.schemaVersion === 1 && Array.isArray(sourcePayload?.sources)) {");
    expect(app).toContain("setRuleSourceStatuses(sourcePayload.sources");
  });

  it("cannot count malformed feeds as a successful full check", () => {
    const manifestValidation = app.indexOf("if (payload?.schemaVersion === 1 && Array.isArray(payload?.updates)) {");
    const manifestSuccess = app.indexOf("manifestChecked = true;", manifestValidation);
    const sourceValidation = app.indexOf("if (sourcePayload?.schemaVersion === 1 && Array.isArray(sourcePayload?.sources)) {");
    const sourceSuccess = app.indexOf("sourceStatusChecked = true;", sourceValidation);
    expect(manifestValidation).toBeGreaterThan(-1);
    expect(manifestSuccess).toBeGreaterThan(manifestValidation);
    expect(sourceValidation).toBeGreaterThan(-1);
    expect(sourceSuccess).toBeGreaterThan(sourceValidation);
  });
});
