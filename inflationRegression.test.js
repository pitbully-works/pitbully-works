import { describe, it, expect } from "vitest";
import { runIntegratedPlan } from "./lifePlanEngine.js";
import { resolveInflationPct, INFLATION_REFERENCE_PCT } from "./utils/inflation.js";

const base = {
  currentAge: 65,
  retireAge: 65,
  deathAge: 67,
  livingCostMonthly: 1000,
  healthCostAnnual: () => 1200,
  publicPensions: [],
  pools: [{ id: "bank", group: "bank", balance: 100000, annualReturnPct: 0, drawOrder: 1 }],
  surplusTargetId: "bank",
};

describe("inflation planning regression", () => {
  it("keeps the previous cash-flow result when inflation is off", () => {
    const oldStyle = runIntegratedPlan({ ...base });
    const explicitOff = runIntegratedPlan({ ...base, inflationRatePct: 0 });
    expect(explicitOff.yearly).toEqual(oldStyle.yearly);
  });

  it("increases future living and healthcare costs when inflation is enabled", () => {
    const flat = runIntegratedPlan({ ...base, inflationRatePct: 0 });
    const inflated = runIntegratedPlan({ ...base, inflationRatePct: 10 });
    expect(inflated.yearly.at(-1).totalAssets).toBeLessThan(flat.yearly.at(-1).totalAssets);
  });

  it("inflates only recurring charges explicitly marked inflationIndexed", () => {
    const r = runIntegratedPlan({
      ...base,
      livingCostMonthly: 0,
      healthCostAnnual: () => 0,
      inflationRatePct: 10,
      recurringCharges: [
        { id: "indexed", annualAmount: 1000, fromAge: 65, toAge: 67, inflationIndexed: true },
        { id: "flatTax", annualAmount: 1000, fromAge: 65, toAge: 67 },
      ],
    });
    const last = r.yearly.at(-1);
    expect(last.charge_indexed).toBeGreaterThan(2000);
    expect(last.charge_flatTax).toBeCloseTo(2000, 6);
  });

  it("uses country reference rates and supports manual/off overrides", () => {
    expect(INFLATION_REFERENCE_PCT.JP).toBe(2);
    expect(INFLATION_REFERENCE_PCT.AU).toBe(2.5);
    expect(resolveInflationPct("US", { mode: "auto" })).toBe(2);
    expect(resolveInflationPct("US", { mode: "manual", manualPct: 3.2 })).toBe(3.2);
    expect(resolveInflationPct("US", { mode: "off" })).toBe(0);
    expect(resolveInflationPct("  au  ", { mode: "auto" })).toBe(2.5);
  });
});
