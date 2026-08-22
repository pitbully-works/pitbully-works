import { describe, expect, it } from "vitest";
import { runIntegratedPlan } from "./lifePlanEngine.js";
import { readLivingCostMonthly, buildPlanInput } from "./utils/buildPlanInput.js";
import { runScenarioComparison } from "./utils/scenarioComparison.js";

const COUNTRIES = ["JP", "US", "GB", "CA", "AU"];

function minimalEnginePlan(overrides = {}) {
  return {
    currentAge: 60,
    retireAge: 60.45,
    deathAge: 62,
    pools: [{
      id: "bank",
      group: "bank",
      balance: 120000,
      annualReturnPct: 0,
      retireReturnPct: 0,
      monthlyContribution: 0,
      contribEndAge: 60,
      accessAge: 0,
      drawOrder: 1,
    }],
    loans: [],
    insurancePolicies: [],
    privatePensionPlans: [],
    publicPensions: [],
    livingCostMonthly: 10000,
    inflationRatePct: 0,
    healthCostAnnual: () => 0,
    surplusTargetId: "bank",
    boundaries: [],
    ...overrides,
  };
}

describe("final five-country calculation boundaries", () => {
  it("always splits the engine exactly at a fractional retirement age", () => {
    const r = runIntegratedPlan(minimalEnginePlan());
    // 60.45 is deliberately off the normal monthly grid. The engine must insert
    // retirement as an explicit boundary; otherwise this exact value cannot be captured.
    expect(r.netWorthAtRetire).toBeCloseTo(120000, 6);
    // After retirement, living costs start only from 60.45 onward.
    expect(r.finalNetWorth).toBeLessThan(r.netWorthAtRetire);
  });

  it("reports retirement net worth at the exact boundary rather than the next birthday", () => {
    const r = runIntegratedPlan(minimalEnginePlan());
    const age61 = r.yearly.find((row) => row.exactAge === 61);
    expect(age61).toBeTruthy();
    expect(r.netWorthAtRetire).toBeGreaterThan(age61.netWorth);
  });

  it("scenario summary explicitly prefers the engine's exact retirement-boundary value", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const source = readFileSync(join(process.cwd(), "utils/scenarioComparison.js"), "utf8");
    expect(source).toContain("Number.isFinite(result.netWorthAtRetire)");
    expect(source).toContain("? result.netWorthAtRetire");
  });

  it.each(COUNTRIES)("%s clamps negative retirement living cost to zero", (country) => {
    const inputs = {
      livingCostMonthly: -100,
      usInvestment: { expensesMonthly: -100 },
      gbInvestment: { expensesMonthly: -100 },
      caInvestment: { expensesMonthly: -100 },
      auInvestment: { expensesMonthly: -100 },
    };
    expect(readLivingCostMonthly(country, inputs)).toBe(0);
  });

  it("buildPlanInput never allows a negative comparison multiplier or living cost", () => {
    const inputs = {
      retireAge: 65, deathAge: 90, livingCostMonthly: 100000,
      insurancePolicies: [], privatePensionPlans: [], tsumitateSchedule: [], growthSchedule: [],
      lumpSums: [], banks: [], stocks: [], gold: { accumulateUntilAge: 65, monthlyYen: 0 },
      ideco: { startAge: 20, endAge: 60, payoutStartAge: 60, monthlyContribution: 0, returnPct: 0, returnPctAuto: false },
      nisa: {}, jpInvestment: {},
    };
    const ctx = {
      country: "JP",
      rules: { investment: {} },
      inputs,
      effectiveCurrentAge: 40,
      effectiveCurrentAssets: 0,
      effectivePostRetireReturn: 0,
      dynamicFunds: [],
      stockTotalNow: 0,
      effectiveStockReturnPct: 0,
      goldCurrentValue: 0,
      effectiveGoldReturnPct: 0,
      effectivePensionMonthly: 0,
      effectivePublicPensionStartAge: 65,
      drawdownOrder: [],
      uncategorizedLabel: "other",
      countryDerived: {},
    };
    const plan = buildPlanInput(ctx, { contributionMultiplier: -2, livingCostMonthly: -50000 });
    expect(plan.livingCostMonthly).toBe(0);
    expect(plan.pools.every((p) => (p.monthlyContribution || 0) >= 0)).toBe(true);
  });
});
