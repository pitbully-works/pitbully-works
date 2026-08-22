import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runIntegratedPlan } from "./lifePlanEngine.js";

const app = readFileSync(join(process.cwd(), "App.jsx"), "utf8");

describe("exact retirement snapshot boundary", () => {
  it("returns a full retirement snapshot at a fractional retirement age", () => {
    const result = runIntegratedPlan({
      currentAge: 60,
      retireAge: 60.45,
      deathAge: 62,
      pools: [{
        id: "bank_0",
        group: "bank",
        balance: 100000,
        annualReturnPct: 0,
        retireReturnPct: 0,
        monthlyContribution: 10000,
        contribEndAge: 60.45,
        accessAge: 0,
        drawOrder: 1,
      }],
      loans: [{
        principal: 50000,
        balance: 50000,
        annualRatePct: 0,
        monthlyPayment: 1000,
        startAge: 60,
        endAge: 62,
      }],
      insurancePolicies: [],
      privatePensionPlans: [],
      publicPensions: [],
      livingCostMonthly: 0,
      inflationRatePct: 0,
      healthCostAnnual: () => 0,
      surplusTargetId: "bank_0",
      boundaries: [],
    });

    expect(result.retireSnapshot).toBeTruthy();
    expect(result.retireSnapshot.exactAge).toBeCloseTo(60.45, 8);
    expect(result.retireSnapshot).toHaveProperty("pool_bank_0");
    expect(result.retireSnapshot).toHaveProperty("loan_0");
    expect(result.netWorthAtRetire).toBe(result.retireSnapshot.netWorth);
  });

  it("uses the exact retirement snapshot for all App retirement breakdown lookups", () => {
    expect(app).toContain("integrated.retireSnapshot");
    expect(app).toContain("Math.abs(requestedAge - Number(inputs.retireAge)) < 1e-9");
    expect(app).toContain("return integrated.retireSnapshot;");
  });

  it("does not add the fractional retirement snapshot to yearly graph rows", () => {
    const result = runIntegratedPlan({
      currentAge: 60,
      retireAge: 60.45,
      deathAge: 61,
      pools: [],
      loans: [],
      insurancePolicies: [],
      privatePensionPlans: [],
      publicPensions: [],
      livingCostMonthly: 0,
      inflationRatePct: 0,
      healthCostAnnual: () => 0,
      boundaries: [],
    });

    expect(result.yearly.some((row) => Math.abs(row.exactAge - 60.45) < 1e-9)).toBe(false);
    expect(result.retireSnapshot.exactAge).toBeCloseTo(60.45, 8);
  });
});
