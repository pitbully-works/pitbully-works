import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const app = fs.readFileSync(path.resolve(process.cwd(), "App.jsx"), "utf8");
const rules = fs.readFileSync(path.resolve(process.cwd(), "utils/ruleUpdates.js"), "utf8");

describe("official rule-source trust boundary", () => {
  it("accepts status rows only through the atomic registry-bound validator", () => {
    expect(app).toContain("normalizeRuleSourceStatusFeed(sourcePayload, RULE_SOURCE_REGISTRY)");
    expect(rules).toContain("!registered || registered.country !== country || seen.has(id)");
  });

  it("never promotes a status-feed URL to an official link", () => {
    expect(rules).toContain("url: safeRuleSourceUrl(registered.url)");
    expect(app).toContain("const sourceHref = safeRuleSourceUrl(registered?.url)");
    expect(app).not.toContain("safeRuleSourceUrl(alert.url) ||");
    expect(app).not.toContain("url: safeRuleSourceUrl(item.url)");
  });
});
