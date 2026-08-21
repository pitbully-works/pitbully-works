import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const app = fs.readFileSync(path.resolve(process.cwd(), "App.jsx"), "utf8");

describe("rule update feed validation", () => {
  it("accepts the manifest only after atomic manifest normalization", () => {
    expect(app).toContain("const normalizedManifestUpdates = normalizeRuleUpdateManifestFeed(payload);");
    expect(app).toContain("if (normalizedManifestUpdates) {");
    expect(app).toContain("setRuleUpdates(mergeRuleUpdateManifests(normalizedManifestUpdates));");
  });

  it("does not replace last-known-good remote rules with an empty fallback after a bad fetch", () => {
    expect(app).not.toContain("let remote = [];");
    expect(app).not.toContain("setRuleUpdates(mergeRuleUpdateManifests(remote));");
  });

  it("accepts source status only after atomic registry-bound normalization", () => {
    expect(app).toContain("const normalizedSourceStatuses = normalizeRuleSourceStatusFeed(sourcePayload, RULE_SOURCE_REGISTRY);");
    expect(app).toContain("if (normalizedSourceStatuses) {");
    expect(app).toContain("setRuleSourceStatuses(normalizedSourceStatuses);");
  });

  it("cannot count malformed feeds as a successful full check", () => {
    const sourceValidation = app.indexOf("const normalizedSourceStatuses = normalizeRuleSourceStatusFeed(sourcePayload, RULE_SOURCE_REGISTRY);");
    const sourceSuccess = app.indexOf("sourceStatusChecked = !!sourceCheckedAt;", sourceValidation);
    expect(sourceValidation).toBeGreaterThan(-1);
    expect(sourceSuccess).toBeGreaterThan(sourceValidation);
    expect(app).toContain("if (manifestChecked && sourceStatusChecked) {");
  });
});
