import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { runIntegratedPlan } from "./lifePlanEngine.js";
import {
  resolvePublicPensionIndexationPct,
  indexedPensionMonthly,
  realValueAt,
} from "./utils/pensionIndexation.js";

describe("public pension indexation", () => {
  it("JP auto uses inflation minus 0.5pt, floored at zero", () => {
    expect(resolvePublicPensionIndexationPct("JP", 2, { mode: "auto" })).toBeCloseTo(1.5, 10);
    expect(resolvePublicPensionIndexationPct("JP", 0.3, { mode: "auto" })).toBe(0);
  });

  it("manual and off modes override auto", () => {
    expect(resolvePublicPensionIndexationPct("JP", 2, { mode: "manual", manualPct: 1.2 })).toBeCloseTo(1.2, 10);
    expect(resolvePublicPensionIndexationPct("JP", 2, { mode: "off" })).toBe(0);
  });

  it("uses country-specific automatic assumptions for all five countries", () => {
    expect(resolvePublicPensionIndexationPct("JP", 2, { mode: "auto" })).toBeCloseTo(1.5, 10);
    expect(resolvePublicPensionIndexationPct("US", 2, { mode: "auto" })).toBeCloseTo(2, 10);
    expect(resolvePublicPensionIndexationPct("GB", 2, { mode: "auto" })).toBeCloseTo(2.5, 10);
    expect(resolvePublicPensionIndexationPct("GB", 3.2, { mode: "auto" })).toBeCloseTo(3.2, 10);
    expect(resolvePublicPensionIndexationPct("CA", 2, { mode: "auto" })).toBeCloseTo(2, 10);
    expect(resolvePublicPensionIndexationPct("AU", 2.5, { mode: "auto" })).toBeCloseTo(2.5, 10);
  });

  it("manual and off override the country-specific auto rule in every country", () => {
    for (const country of ["JP", "US", "GB", "CA", "AU"]) {
      expect(resolvePublicPensionIndexationPct(country, 4, { mode: "manual", manualPct: 1.1 })).toBeCloseTo(1.1, 10);
      expect(resolvePublicPensionIndexationPct(country, 4, { mode: "off" })).toBe(0);
    }
  });

  it("keeps the start-age pension as the base and indexes once per full year", () => {
    const base = 167106;
    expect(indexedPensionMonthly(base, 65, 65, 1.5)).toBeCloseTo(base, 6);
    expect(indexedPensionMonthly(base, 65, 66, 1.5)).toBeCloseTo(base * 1.015, 6);
    expect(indexedPensionMonthly(base, 65, 75, 1.5)).toBeCloseTo(base * Math.pow(1.015, 10), 6);
  });

  it("converts nominal assets to today's purchasing power without changing nominal values", () => {
    expect(realValueAt(1000000, 58, 68, 2)).toBeCloseTo(1000000 / Math.pow(1.02, 10), 6);
    expect(realValueAt(1000000, 58, 68, 0)).toBe(1000000);
  });

  it("runIntegratedPlan applies indexed public pension amounts to yearly projection", () => {
    const base = 100000;
    const result = runIntegratedPlan({
      currentAge: 65,
      retireAge: 65,
      deathAge: 67,
      pools: [{ id: "bank", group: "bank", balance: 0, annualReturnPct: 0, accessAge: 0, drawOrder: 1 }],
      livingCostMonthly: 0,
      inflationRatePct: 0,
      publicPensions: [{
        monthlyAmount: base,
        startAge: 65,
        monthlyAmountAt: (age) => indexedPensionMonthly(base, 65, age, 1.5),
      }],
      privatePensionPlans: [],
      insurancePolicies: [],
      loans: [],
      recurringCharges: [],
      healthCostAnnual: () => 0,
      surplusTargetId: "bank",
    });
    const at66 = result.yearly.find((row) => Math.floor(row.exactAge + 1e-9) === 66);
    const at67 = result.yearly.find((row) => Math.floor(row.exactAge + 1e-9) === 67);
    // yearly snapshot at 66 represents the 65→66 period, so it still uses the base amount.
    expect(at66.publicPensionAnnual).toBeCloseTo(base * 12, 4);
    expect(at67.publicPensionAnnual).toBeCloseTo(base * 1.015 * 12, 4);
  });

  it("supports age-dependent recurring charges such as auto-estimated pension tax", () => {
    const result = runIntegratedPlan({
      currentAge: 65,
      retireAge: 65,
      deathAge: 67,
      pools: [{ id: "bank", group: "bank", balance: 1000000, annualReturnPct: 0, accessAge: 0, drawOrder: 1 }],
      livingCostMonthly: 0,
      inflationRatePct: 0,
      publicPensions: [],
      privatePensionPlans: [],
      insurancePolicies: [],
      loans: [],
      recurringCharges: [{ id: "dynamic", annualAmount: 0, annualAmountAt: (age) => age < 66 ? 10000 : 20000, fromAge: 65, toAge: 67 }],
      healthCostAnnual: () => 0,
      surplusTargetId: "bank",
    });
    expect(result.yearly.at(-1).cumulativeRecurringCharges).toBeCloseTo(30000, 6);
  });

  it("UI exposes auto/manual/off pension indexation and nominal/real asset view", () => {
    const app = fs.readFileSync(path.resolve(process.cwd(), "App.jsx"), "utf8");
    expect(app).toContain('publicPensionIndexation');
    expect(app).toContain('["JP", "US", "GB", "CA", "AU"].includes(country)');
    expect(app).toContain('assetValueMode === "real"');
    expect(app).toContain('displayNetWorthChartData');
  });
});


describe("country normalization for pension indexation", () => {
  it.each(["JP", "US", "GB", "CA", "AU"])("%s：小文字・前後空白でも改定率が一致する", (country) => {
    const canonical = resolvePublicPensionIndexationPct(country, 3, { mode: "auto" });
    const noisy = resolvePublicPensionIndexationPct(`  ${country.toLowerCase()}  `, 3, { mode: "auto" });
    expect(noisy).toBeCloseTo(canonical, 10);
  });
});
