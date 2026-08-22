import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AU_COUNTRY_RULES } from "./countryRules/AU.js";

describe("overseas 100 phase 5 — AU younger-partner Super projection", () => {
  it("projects partner age in lockstep with claimant age", () => {
    const ret = AU_COUNTRY_RULES.retirement;
    expect(ret.getProjectedPartnerAge(60, 67, 67)).toBe(60);
    expect(ret.getProjectedPartnerAge(60, 67, 74)).toBe(67);
  });

  it("projects partner Super and stops contributions at the configured age", () => {
    const ret = AU_COUNTRY_RULES.retirement;
    expect(ret.projectPartnerSuperBalance({
      currentAge: 60, targetAge: 62, currentBalance: 100000,
      annualContribution: 10000, expectedReturnPct: 0, contributionEndAge: 61,
    })).toBe(110000);
  });

  it("excludes younger-partner accumulation Super until age 67 unless an income stream has started", () => {
    const ret = AU_COUNTRY_RULES.retirement;
    expect(ret.isSuperAssessableForAgePension(66, false)).toBe(false);
    expect(ret.isSuperAssessableForAgePension(67, false)).toBe(true);
    expect(ret.isSuperAssessableForAgePension(60, true)).toBe(true);
  });

  it("integrates partner-Super means testing into the dynamic AU pension callback", () => {
    const src = readFileSync(join(process.cwd(), "utils/buildPlanInput.js"), "utf8");
    expect(src).toContain("partnerSuperForMeansTest");
    expect(src).toContain("getProjectedPartnerAge");
    expect(src).toContain("projectPartnerSuperBalance");
    expect(src).toContain("dynamicBothQualified");
  });

  it("provides partner age, Super and income-stream controls in the AU retirement panel", () => {
    const app = readFileSync(join(process.cwd(), "App.jsx"), "utf8");
    const panel = readFileSync(join(process.cwd(), "panels/AURetirementPanel.jsx"), "utf8");
    expect(app).toContain("partnerSuperCurrentValue");
    expect(panel).toContain('"partnerCurrentAge"');
    expect(panel).toContain('"partnerSuperCurrentValue"');
    expect(panel).toContain('"partnerReceivingSuperPension"');
  });
});
