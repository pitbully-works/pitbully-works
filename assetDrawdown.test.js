import { describe, expect, it } from "vitest";
import { runIntegratedPlan } from "./lifePlanEngine.js";
import { deriveAnnualAssetDrawdownRows } from "./utils/assetDrawdown.js";

const basePlan = {
  currentAge: 64,
  retireAge: 65,
  deathAge: 67,
  livingCostMonthly: 100000,
  pools: [
    { id: "bank", group: "bank", drawCategory: "cash", balance: 500000, annualReturnPct: 0, drawOrder: 0 },
    { id: "stock", group: "stock", drawCategory: "taxable", balance: 2000000, annualReturnPct: 0, drawOrder: 100 },
  ],
  loans: [], publicPensions: [], privatePensionPlans: [], insurancePolicies: [], recurringCharges: [],
};

describe("asset drawdown tracking", () => {
  it("records gross withdrawals by the pool category without changing the withdrawal result", () => {
    const result = runIntegratedPlan(basePlan);
    const rows = deriveAnnualAssetDrawdownRows(result.yearly);
    const age66 = rows.find((r) => r.age === 66);
    expect(age66).toBeTruthy();
    expect(age66.annualDrawdown_cash).toBeCloseTo(500000, 6);
    expect(age66.annualDrawdown_taxable).toBeCloseTo(700000, 6);
    expect(age66.annualDrawdownTotal).toBeCloseTo(1200000, 6);
  });

  it("does not count internal forced transfers as spending drawdown", () => {
    const result = runIntegratedPlan({
      ...basePlan,
      currentAge: 71,
      retireAge: 65,
      deathAge: 73,
      livingCostMonthly: 0,
      pools: [
        { id: "rrif", group: "investment", drawCategory: "restricted", balance: 1000000, annualReturnPct: 0, drawOrder: 300, accessAge: 0,
          minimumDrawdown: () => 100000, minimumDrawdownTo: "bank", minimumDrawdownRequiresRetirement: false },
        { id: "bank", group: "bank", drawCategory: "cash", balance: 0, annualReturnPct: 0, drawOrder: 0 },
      ],
    });
    const rows = deriveAnnualAssetDrawdownRows(result.yearly);
    expect(rows.reduce((s, r) => s + r.annualDrawdownTotal, 0)).toBeCloseTo(0, 6);
  });
});
