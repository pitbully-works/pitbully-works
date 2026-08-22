import { describe, expect, it } from "vitest";
import { GB_COUNTRY_RULES } from "./countryRules/GB.js";
import { buildPlanInput } from "./utils/buildPlanInput.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("overseas 100 phase 3 — GB Lifetime ISA projection integration", () => {
  it("counts LISA payments inside the overall ISA allowance", () => {
    const inv = GB_COUNTRY_RULES.investment;
    expect(inv.getIsaContributed({
      stocksSharesIsa: { annualContribution: 10000 },
      cashIsa: { annualContribution: 5000 },
      lifetimeIsa: { annualContribution: 4000 },
    })).toBe(19000);
  });

  it("caps LISA payments at £4,000 and adds the 25% government bonus", () => {
    const inv = GB_COUNTRY_RULES.investment;
    const accounts = { lifetimeIsa: { annualContribution: 6000 } };
    expect(inv.getLifetimeIsaEligibleContribution(accounts, 40)).toBe(4000);
    expect(inv.getLifetimeIsaAnnualContributionWithBonus(accounts, 40)).toBe(5000);
    expect(inv.getLifetimeIsaAnnualContributionWithBonus(accounts, 50)).toBe(0);
  });

  it("treats LISA as restricted before 60 and accessible from 60", () => {
    const inv = GB_COUNTRY_RULES.investment;
    const accounts = Object.fromEntries(inv.accountTypes.map((k) => [k, { currentValue: 0 }]));
    accounts.lifetimeIsa.currentValue = 10000;
    expect(inv.splitAssets(59, accounts).restricted).toBe(10000);
    expect(inv.splitAssets(59, accounts).liquid).toBe(0);
    expect(inv.splitAssets(60, accounts).restricted).toBe(0);
    expect(inv.splitAssets(60, accounts).liquid).toBe(10000);
  });

  it("creates an integrated LISA pool with bonus, age-50 contribution stop and age-60 access", () => {
    const inputs = {
      retireAge: 65, deathAge: 90,
      gold: { accumulateUntilAge: 65 },
      ideco: { startAge: 40, endAge: 65, payoutStartAge: 65 },
      tsumitateSchedule: [],
      growthSchedule: [],
      lumpSums: [],
      gbInvestment: {
        expensesMonthly: 0,
        cashSavings: {}, gia: {}, cashIsa: {}, stocksSharesIsa: {},
        lifetimeIsa: { currentValue: 1000, annualContribution: 4000, expectedReturnPct: 5, contributionEndAge: 65, withdrawalTaxPct: 0 },
        workplacePension: {}, sipp: {},
      },
      insurancePolicies: [], privatePensionPlans: [],
    };
    const plan = buildPlanInput({
      country: "GB",
      rules: GB_COUNTRY_RULES,
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
      effectivePublicPensionStartAge: 67,
      drawdownOrder: [],
      uncategorizedLabel: "other",
      countryDerived: {},
    });
    const lisa = plan.pools.find((p) => p.id === "lifetimeIsa");
    expect(lisa).toBeTruthy();
    expect(lisa.monthlyContribution * 12).toBeCloseTo(5000, 8);
    expect(lisa.contribEndAge).toBe(50);
    expect(lisa.accessAge).toBe(60);
  });

  it("shows LISA as a real editable account and retirement-breakdown account", () => {
    const app = readFileSync(join(process.cwd(), "App.jsx"), "utf8");
    expect(app).toContain('accountKey="lifetimeIsa"');
    expect(app).toContain('{ key: "lifetimeIsa", label: t("gbLifetimeIsaLabel") }');
  });
});
