import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const app = fs.readFileSync(path.resolve(process.cwd(), "App.jsx"), "utf8");
const watcher = fs.readFileSync(path.resolve(process.cwd(), "scripts/check-rule-sources.mjs"), "utf8");

describe("5-country rules update center UI", () => {
  it("filters rule history by selected country", () => {
    expect(app).toContain("normalizeRuleCountry(entry?.country) === country");
    expect(app).toContain("normalizeRuleCountry(item.country)");
    expect(app).toContain("countryRuleUpdateHistory");
  });

  it("keeps validated source statuses for all countries so country switching works", () => {
    expect(app).toContain("normalizeRuleSourceStatusFeed(sourcePayload, RULE_SOURCE_REGISTRY)");
    expect(app).toContain("setRuleSourceStatuses(normalizedSourceStatuses)");
    expect(app).toContain("changed: item.changed === true");
  });

  it("defensively renders only array-shaped change rows", () => {
    expect(app).toContain("Array.isArray(update.changes) ? update.changes : []");
  });

  it("latches an official-source change until the baseline is reviewed", () => {
    expect(watcher).toContain("!!old?.changed || (!!old?.hash && old.hash !== hash)");
  });
  it("sanitizes watcher-provided source URLs before rendering links", () => {
    expect(app).toContain("const sourceHref = safeRuleSourceUrl(registered?.url)");
    expect(app).toContain("if (!sourceHref) return null");
    expect(app).toContain('href={sourceHref}');
    expect(app).not.toContain('href={alert.url || registered?.url}');
  });
  it("shows country-specific verified labels and compact notification status", () => {
    expect(app).toContain('US: "2026 rules verified"');
    expect(app).toContain('GB: "2026/27 rules verified"');
    expect(app).toContain('CA: "2026 rules verified"');
    expect(app).toContain('AU: "2026/27 rules verified"');
    expect(app).toContain("New rule updates:");
    expect(app).toContain("Next review");
    expect(app).toContain('CA: "en-CA"');
    expect(app).toContain('AU: "en-AU"');
    expect(app).toContain("Scheduled changes");
  });

  it("uses a cleaner missing birth-date display and clearer history label", () => {
    expect(app).toContain('Enter your date of birth in the You section.');
    expect(app).toContain('Change history (');
  });

  it("normalizes and validates rule-update decisions before persisting them", () => {
    expect(app).toContain("const updateId = normalizeRuleUpdateId(update?.id)");
    expect(app).toContain("const updateCountry = normalizeRuleCountry(update?.country)");
    expect(app).toContain('const safeAction = action === "approved" || action === "deferred" ? action : null');
    expect(app).toContain("if (!updateId || !updateCountry || !safeAction) return");
  });

  it("applies bounded ID/country normalization through the shared status validator", () => {
    const rules = fs.readFileSync(path.resolve(process.cwd(), "utils/ruleUpdates.js"), "utf8");
    expect(rules).toContain("const id = normalizeRuleUpdateId(item.id)");
    expect(rules).toContain("const country = normalizeRuleCountry(item.country)");
  });

});

describe("rule source status ingress hardening", () => {
  it("whitelists status fields and pins links to the bundled registry", () => {
    const rules = fs.readFileSync(path.resolve(process.cwd(), "utils/ruleUpdates.js"), "utf8");
    expect(rules).toContain("url: safeRuleSourceUrl(registered.url)");
    expect(rules).toContain("changed: item.changed === true");
    expect(rules).toContain("seen.has(id)");
    expect(app).not.toContain("url: safeRuleSourceUrl(item.url)");
  });
});
