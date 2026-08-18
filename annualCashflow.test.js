import { describe, it, expect } from "vitest";
import { runIntegratedPlan } from "./lifePlanEngine.js";
import { deriveAnnualCashflowRows } from "./utils/annualCashflow.js";

const base = {
  currentAge: 65, retireAge: 65, deathAge: 67,
  livingCostMonthly: 100000,
  inflationRatePct: 0,
  healthCostAnnual: () => 120000,
  pools: [{ id: "bank", group: "bank", balance: 10000000, annualReturnPct: 5, retireReturnPct: 5, drawOrder: 1 }],
  publicPensions: [{ monthlyAmount: 50000, startAge: 65 }],
  privatePensionPlans: [], loans: [], insurancePolicies: [], recurringCharges: [],
};

describe("annual cashflow audit trail", () => {
  it("65〜66歳の実際の運用益・年金・生活費・医療費・資産増減を年次化できる", () => {
    const res = runIntegratedPlan(base);
    const rows = deriveAnnualCashflowRows(res.yearly);
    const r = rows.find((x) => x.age === 65);
    expect(r).toBeTruthy();
    expect(r.publicPension).toBeCloseTo(600000, 1);
    expect(r.livingCost).toBeCloseTo(1200000, 1);
    expect(r.healthCost).toBeCloseTo(120000, 1);
    expect(r.investmentReturn).toBeGreaterThan(0);
    expect(r.closingAssets - r.openingAssets).toBeCloseTo(r.assetChange, 6);
  });

  it("民間年金は元本を超える契約でも終了年齢まで受給額を記録する", () => {
    const res = runIntegratedPlan({
      ...base, deathAge: 68, livingCostMonthly: 0, healthCostAnnual: () => 0,
      pools: [
        { id: "bank", group: "bank", balance: 0, annualReturnPct: 0, retireReturnPct: 0, drawOrder: 1 },
        { id: "pp", group: "privatePension", balance: 100000, annualReturnPct: 0, retireReturnPct: 0 },
      ],
      publicPensions: [],
      privatePensionPlans: [{ poolId: "pp", monthlyPayout: 100000, payoutFromAge: 65, payoutToAge: 68 }],
    });
    const rows = deriveAnnualCashflowRows(res.yearly).filter((x) => x.age >= 65);
    expect(rows.map((x) => Math.round(x.privatePension))).toEqual([1200000, 1200000, 1200000]);
  });
});
