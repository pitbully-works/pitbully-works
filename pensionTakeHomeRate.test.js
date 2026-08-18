import { describe, it, expect } from "vitest";
import { runIntegratedPlan } from "./lifePlanEngine.js";
import { derivePensionTakeHomeRows } from "./utils/pensionTakeHome.js";

describe("pension take-home rate regression", () => {
  it("calculates combined take-home rate from pension-related deductions only", () => {
    const rows = derivePensionTakeHomeRows([
      { age: 65, exactAge: 65, publicPensionAnnual: 0, privatePensionAnnual: 0, charge_publicPensionTax: 0, charge_privatePensionTax_0: 0, charge_jpSeniorMedical75: 0 },
      { age: 66, exactAge: 66, publicPensionAnnual: 2000000, privatePensionAnnual: 500000, charge_publicPensionTax: 50000, charge_privatePensionTax_0: 10000, charge_jpSeniorMedical75: 0 },
      { age: 76, exactAge: 76, publicPensionAnnual: 2000000, privatePensionAnnual: 500000, charge_publicPensionTax: 100000, charge_privatePensionTax_0: 20000, charge_jpSeniorMedical75: 100000 },
    ]);
    expect(rows[1].pensionAge).toBe(65);
    expect(rows[1].pensionTakeHomeAnnual).toBe(2440000);
    expect(rows[1].pensionTakeHomeRate).toBeCloseTo(97.6, 6);
    expect(rows[2].pensionMedicalAnnual).toBe(100000);
    expect(rows[2].pensionTakeHomeAnnual).toBe(2340000);
    expect(rows[2].pensionTakeHomeRate).toBeCloseTo(93.6, 6);
  });

  it("records the private pension actually paid by the integrated engine", () => {
    const res = runIntegratedPlan({
      currentAge: 65,
      retireAge: 65,
      deathAge: 67,
      livingCostMonthly: 0,
      publicPensions: [{ monthlyAmount: 100000, startAge: 65 }],
      healthCostAnnual: () => 0,
      pools: [
        { id: "bank", group: "bank", balance: 1000000, annualReturnPct: 0, drawOrder: 1 },
        { id: "private", group: "privatePension", balance: 1200000, annualReturnPct: 0, drawOrder: 99 },
      ],
      privatePensionPlans: [{ poolId: "private", monthlyPayout: 50000, payoutFromAge: 65, payoutToAge: 67 }],
      recurringCharges: [],
      surplusTargetId: "bank",
    });
    const at66 = res.yearly.find((r) => r.age === 66);
    expect(at66.publicPensionAnnual).toBeCloseTo(1200000, 4);
    expect(at66.privatePensionAnnual).toBeCloseTo(600000, 4);
  });
});
