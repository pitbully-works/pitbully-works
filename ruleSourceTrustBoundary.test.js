import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const app = fs.readFileSync(path.resolve(process.cwd(), "App.jsx"), "utf8");

describe("official rule-source trust boundary", () => {
  it("accepts status rows only for an ID and country pinned in the bundled registry", () => {
    expect(app).toContain("const registeredSource = RULE_SOURCE_REGISTRY.find((source) => source.id === id)");
    expect(app).toContain("!registeredSource || registeredSource.country !== normalizedCountry");
  });

  it("never promotes a status-feed URL to an official link", () => {
    expect(app).toContain("url: safeRuleSourceUrl(registeredSource.url)");
    expect(app).toContain("const sourceHref = safeRuleSourceUrl(registered?.url)");
    expect(app).not.toContain("safeRuleSourceUrl(alert.url) ||");
    expect(app).not.toContain("url: safeRuleSourceUrl(item.url)");
  });
});
