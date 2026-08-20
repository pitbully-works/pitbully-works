import { describe, expect, it } from "vitest";
import { JP_COUNTRY_RULES, US_COUNTRY_RULES, GB_COUNTRY_RULES, CA_COUNTRY_RULES, AU_COUNTRY_RULES } from "./countryRules/index.js";
import fs from "node:fs";
import path from "node:path";

const countries = [JP_COUNTRY_RULES, US_COUNTRY_RULES, GB_COUNTRY_RULES, CA_COUNTRY_RULES, AU_COUNTRY_RULES];
const requiredKeys = ["investment", "retirement", "healthcare", "tax", "estate"];

describe("5-country rule coverage metadata", () => {
  it("gives all five countries the same five coverage categories", () => {
    for (const rules of countries) {
      expect(Array.isArray(rules.meta.coverage)).toBe(true);
      expect(rules.meta.coverage.map((x) => x.key)).toEqual(requiredKeys);
    }
  });

  it("records effective period, last review, status and update summary for every category", () => {
    for (const rules of countries) {
      for (const item of rules.meta.coverage) {
        expect(["implemented", "partial"]).toContain(item.status);
        expect(item.effective).toBeTruthy();
        expect(item.lastUpdated).toMatch(/^2026-/);
        expect(item.updateJa).toBeTruthy();
        expect(item.updateEn).toBeTruthy();
      }
    }
  });

  it("renders the unified coverage panel in App", () => {
    const app = fs.readFileSync(path.resolve(process.cwd(), "App.jsx"), "utf8");
    expect(app).toContain("5か国制度の対応状況");
    expect(app).toContain("rules.meta.coverage.map");
    expect(app).toContain("最終確認");
    expect(app).toContain("一部対応");
  });
});
