import { describe, it, expect } from "vitest";
import { runIntegratedPlan } from "./lifePlanEngine.js";
import { estimateJapanSeniorMedicalAnnual, estimatePrivatePensionTax, estimatePublicPensionTax, JP_SENIOR_MEDICAL_75_AVG_ANNUAL_2026, RETIREMENT_TAX_BASIS } from "./utils/retirementTax.js";

describe("retirement taxes/fixed costs regression", () => {

  it.each(["JP", "US", "GB", "CA", "AU"])("%s: retirement-tax helpers normalize lowercase and surrounding whitespace", (country) => {
    const noisy = `  ${country.toLowerCase()}  `;
    expect(estimatePublicPensionTax(noisy, 3000000, 70)).toBe(estimatePublicPensionTax(country, 3000000, 70));
    const plans = [{ contribFromAge: 40, contribToAge: 60, payoutFromAge: 65, payoutToAge: 75, monthlyContribution: 10000, monthlyPayout: 30000 }];
    expect(estimatePrivatePensionTax(noisy, plans)).toBe(estimatePrivatePensionTax(country, plans));
  });

  it("does not silently apply the JP private-pension proxy to an unknown country", () => {
    const plans = [{ contribFromAge: 40, contribToAge: 60, payoutFromAge: 65, payoutToAge: 75, monthlyContribution: 10000, monthlyPayout: 30000 }];
    expect(estimatePrivatePensionTax("XX", plans)).toBe(0);
  });
  it("uses 2026/27 national-average Japan 75+ medical premium only when enabled", () => {
    expect(estimateJapanSeniorMedicalAnnual({ mode: "auto" })).toBe(JP_SENIOR_MEDICAL_75_AVG_ANNUAL_2026);
    expect(estimateJapanSeniorMedicalAnnual({ mode: "manual", manualAnnual: 123456 })).toBe(123456);
    expect(estimateJapanSeniorMedicalAnnual({ mode: "off" })).toBe(0);
    expect(RETIREMENT_TAX_BASIS.GB).toBe("2026/27");
  });
  it("tracks recurring-charge categories without double charging", () => {
    const result = runIntegratedPlan({
      currentAge: 65, retireAge: 65, deathAge: 67,
      pools: [{ id: "bank_0", group: "bank", balance: 1000000, annualReturnPct: 0, drawOrder: 0, accessAge: 0 }],
      loans: [], insurancePolicies: [], privatePensionPlans: [], publicPensions: [],
      livingCostMonthly: 0, healthCostAnnual: () => 0,
      recurringCharges: [
        { id: "publicPensionTax", annualAmount: 10000, fromAge: 65, toAge: 67 },
        { id: "fixedCost_0", annualAmount: 20000, fromAge: 65, toAge: 67 },
      ],
      boundaries: [], drawdownOrder: ["bank"], surplusTargetId: "bank_0",
    });
    const last = result.yearly[result.yearly.length - 1];
    expect(last.charge_publicPensionTax).toBeCloseTo(20000, 4);
    expect(last.charge_fixedCost_0).toBeCloseTo(40000, 4);
    expect(last.cumulativeRecurringCharges).toBeCloseTo(60000, 4);
    expect(last.totalAssets).toBeCloseTo(940000, 4);
  });
});
