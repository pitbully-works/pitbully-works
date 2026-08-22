import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CA_COUNTRY_RULES } from "./countryRules/CA.js";

describe("overseas 100 phase 4 — Canada QPP", () => {
  it("uses the official 2026 QPP maximum at age 65 and age-72 maximum factor", () => {
    const ret = CA_COUNTRY_RULES.retirement;
    expect(ret.getQppMaxAnnualAt65()).toBeCloseTo(1507.65 * 12, 8);
    expect(ret.getQppFactor(65)).toBe(1);
    expect(ret.getQppFactor(72)).toBeCloseTo(1.588, 8);
  });

  it("supports the official 0.5% to 0.6% monthly early-reduction range", () => {
    const ret = CA_COUNTRY_RULES.retirement;
    expect(ret.getQppFactor(60, 0.005)).toBeCloseTo(0.70, 8);
    expect(ret.getQppFactor(60, 0.006)).toBeCloseTo(0.64, 8);
    expect(ret.normalizeQppEarlyReductionPerMonth(0.001)).toBe(0.005);
    expect(ret.normalizeQppEarlyReductionPerMonth(0.010)).toBe(0.006);
  });

  it("selects CPP or QPP without changing the stored 65-age estimate contract", () => {
    const ret = CA_COUNTRY_RULES.retirement;
    const estimate = 12000;
    expect(ret.getPublicContributoryPensionAnnual({
      plan: "CPP", estimatedAnnualAt65: estimate, startAge: 65,
    })).toBe(12000);
    expect(ret.getPublicContributoryPensionAnnual({
      plan: "QPP", estimatedAnnualAt65: estimate, startAge: 72,
    })).toBeCloseTo(12000 * 1.588, 8);
  });

  it("exposes CPP/QPP selection and QPP early-rate input in the retirement UI", () => {
    const app = readFileSync(join(process.cwd(), "App.jsx"), "utf8");
    const panel = readFileSync(join(process.cwd(), "panels/CARetirementPanel.jsx"), "utf8");
    expect(app).toContain('plan: "CPP"');
    expect(panel).toContain('<option value="QPP">QPP — Québec Pension Plan</option>');
    expect(panel).toContain('"qppEarlyReductionPerMonth"');
  });

  it("does not list QPP claim-age modelling itself as unimplemented", () => {
    const all = CA_COUNTRY_RULES.retirement.notImplemented.join(" / ");
    expect(all).not.toMatch(/ケベック州のQPP（受給額・拠出率がCPPと異なる）/);
    expect(all).toMatch(/実際の拠出履歴/);
  });
});
