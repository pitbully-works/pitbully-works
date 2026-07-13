import { describe, it, expect } from "vitest";
import {
  runSimulation,
  runGoldSimulation,
  runBankSimulation,
  runStockSim,
  runLoanSimulation,
  runInsuranceSimulation,
  runPrivatePensionSimulation,
  runIdecoSimulation,
  mergeSavedInputs,
  healthAnnualCost,
  JP_COUNTRY_RULES,
  US_COUNTRY_RULES,
  GB_COUNTRY_RULES,
  NISA_LIMITS,
} from "./App.jsx";

const closeTo = (actual, expected, tolerance = 1e-6) =>
  Math.abs(actual - expected) / Math.abs(expected || 1) < tolerance;

describe("BUG-1 stock: off-by-one month", () => {
  it("final value matches hand calculation", () => {
    const sim = runStockSim({ currentAge: 35, deathAge: 90, totalValue: 5_000_000, returnPct: 6 });
    const hand = 5_000_000 * Math.pow(1.06, 55);
    expect(closeTo(sim.finalValue, hand, 1e-4)).toBe(true);
  });

  it("value after 1 year has 12 months of compounding", () => {
    const sim = runStockSim({ currentAge: 40, deathAge: 41, totalValue: 1_000_000, returnPct: 12 });
    const oneYear = sim.yearly.find((y) => y.age === 41);
    expect(closeTo(oneYear.value, 1_000_000 * 1.12, 1e-6)).toBe(true);
  });

  it("zero return means unchanged value", () => {
    const sim = runStockSim({ currentAge: 30, deathAge: 90, totalValue: 1234, returnPct: 0 });
    expect(sim.finalValue).toBe(1234);
  });
});

describe("BUG-2 gold: price off-by-one month", () => {
  it("final value matches hand calculation without contributions", () => {
    const sim = runGoldSimulation({
      currentAge: 35, deathAge: 90,
      gold: { currentGrams: 100, pricePerGram: 15000, priceGrowthPct: 3, monthlyYen: 0, accumulateUntilAge: 65 },
    });
    const hand = 100 * 15000 * Math.pow(1.03, 55);
    expect(closeTo(sim.finalValue, hand, 1e-4)).toBe(true);
  });

  it("value after 1 year reflects 12 months of price growth", () => {
    const sim = runGoldSimulation({
      currentAge: 40, deathAge: 41,
      gold: { currentGrams: 10, pricePerGram: 10000, priceGrowthPct: 10, monthlyYen: 0, accumulateUntilAge: 40 },
    });
    const oneYear = sim.yearly.find((y) => y.age === 41);
    expect(closeTo(oneYear.value, 10 * 10000 * 1.1, 1e-6)).toBe(true);
  });

  it("no more grams after the contribution end age", () => {
    const sim = runGoldSimulation({
      currentAge: 35, deathAge: 90,
      gold: { currentGrams: 100, pricePerGram: 15000, priceGrowthPct: 3, monthlyYen: 10000, accumulateUntilAge: 65 },
    });
    const at65 = sim.yearly.find((y) => y.age === 65).grams;
    expect(closeTo(at65, sim.finalGrams, 1e-9)).toBe(true);
  });

  it("all zeros do not produce NaN", () => {
    const sim = runGoldSimulation({
      currentAge: 35, deathAge: 90,
      gold: { currentGrams: 0, pricePerGram: 0, priceGrowthPct: 0, monthlyYen: 0, accumulateUntilAge: 65 },
    });
    expect(Number.isNaN(sim.finalValue)).toBe(false);
    expect(sim.finalGrams).toBe(0);
  });
});
describe("BUG-3 saved data: shallow merge", () => {
  const defaults = {
    country: "JP",
    ideco: { currentValue: 0, payoutYears: 10, payoutReturnPct: 0 },
    gbInvestment: {
      sipp: { currentValue: 0, annualContribution: 0, expectedReturnPct: 5, contributionEndAge: 65 },
      statePension: { statePensionAge: 67, claimAge: 67, incomeOverlapYears: 0 },
    },
    banks: [],
  };

  it("missing nested fields fall back to defaults", () => {
    const oldSave = { ideco: { currentValue: 500000, payoutYears: 15 } };
    const merged = mergeSavedInputs(defaults, oldSave);
    expect(merged.ideco.currentValue).toBe(500000);
    expect(merged.ideco.payoutYears).toBe(15);
    expect(merged.ideco.payoutReturnPct).toBe(0);
  });

  it("deeply nested missing fields fall back to defaults", () => {
    const partial = { gbInvestment: { sipp: { currentValue: 1000 }, statePension: { claimAge: 68 } } };
    const merged = mergeSavedInputs(defaults, partial);
    expect(merged.gbInvestment.sipp.currentValue).toBe(1000);
    expect(merged.gbInvestment.sipp.expectedReturnPct).toBe(5);
    expect(merged.gbInvestment.sipp.contributionEndAge).toBe(65);
    expect(merged.gbInvestment.statePension.claimAge).toBe(68);
    expect(merged.gbInvestment.statePension.incomeOverlapYears).toBe(0);
  });

  it("keys absent from the save keep their defaults", () => {
    const merged = mergeSavedInputs(defaults, { country: "GB" });
    expect(merged.gbInvestment.statePension.statePensionAge).toBe(67);
  });

  it("arrays are replaced, not merged", () => {
    const merged = mergeSavedInputs(defaults, { banks: [{ name: "A", balance: 100 }] });
    expect(Array.isArray(merged.banks)).toBe(true);
    expect(merged.banks).toHaveLength(1);
    expect(merged.banks[0].name).toBe("A");
  });

  it("invalid data returns the defaults", () => {
    expect(mergeSavedInputs(defaults, null)).toBe(defaults);
    expect(mergeSavedInputs(defaults, "broken")).toBe(defaults);
  });
});

describe("Japan (JP) core calculations", () => {
  const base = {
    currentAge: 35, retireAge: 65, deathAge: 90, currentAssets: 1_000_000,
    tsumitateSchedule: [{ fromAge: 35, toAge: 65, monthlyYen: 50_000 }],
    growthSchedule: [], lumpSums: [], tsumitateUsed: 0, growthUsed: 0,
    dynamicFunds: [{ id: "A", pct: 100, returnPct: 5 }],
    pensionMonthly: 150_000, livingCostMonthly: 250_000, postRetireReturn: 3,
    healthBrackets: { b60: 100_000, b70: 200_000, b80: 300_000 },
    inheritanceTarget: 0, privatePensionPlans: [],
  };

  it("assets at retirement match the hand calculation", () => {
    const sim = runSimulation(base, "x", "a", "d");
    const mr = Math.pow(1.05, 1 / 12) - 1;
    const hand = 1_000_000 * Math.pow(1.05, 30) + 50_000 * ((Math.pow(1 + mr, 360) - 1) / mr);
    expect(closeTo(sim.assetsAtRetire, hand, 0.01)).toBe(true);
  });

  it("NISA lifetime caps are never exceeded", () => {
    const sim = runSimulation(
      { ...base,
        tsumitateSchedule: [{ fromAge: 35, toAge: 65, monthlyYen: 100_000 }],
        growthSchedule: [{ fromAge: 35, toAge: 65, monthlyYen: 200_000 }] },
      "x", "a", "d"
    );
    expect(sim.growthCum).toBeLessThanOrEqual(NISA_LIMITS.growthLifetime + 1);
    expect(sim.tsumitateCum + sim.growthCum).toBeLessThanOrEqual(NISA_LIMITS.totalLifetime + 1);
    expect(sim.totalMaxedAge).not.toBeNull();
  });

  it("NISA limits match the current system", () => {
    expect(NISA_LIMITS.totalLifetime).toBe(18_000_000);
    expect(NISA_LIMITS.growthLifetime).toBe(12_000_000);
    expect(NISA_LIMITS.tsumitateAnnual).toBe(1_200_000);
    expect(NISA_LIMITS.growthAnnual).toBe(2_400_000);
  });

  it("depletion is detected and assets never go negative", () => {
    const sim = runSimulation(
      { ...base, currentAssets: 0, tsumitateSchedule: [], pensionMonthly: 0, livingCostMonthly: 300_000 },
      "x", "a", "d"
    );
    expect(sim.depletionAge).not.toBeNull();
    expect(sim.finalAssets).toBeGreaterThanOrEqual(0);
  });

  it("no depletion when pension income exceeds spending", () => {
    const sim = runSimulation(
      { ...base, pensionMonthly: 400_000, livingCostMonthly: 100_000, healthBrackets: { b60: 0, b70: 0, b80: 0 } },
      "x", "a", "d"
    );
    expect(sim.depletionAge).toBeNull();
    expect(sim.finalAssets).toBeGreaterThan(sim.assetsAtRetire);
  });

  it("healthcare cost brackets apply by age", () => {
    const b = { b60: 1, b70: 2, b80: 3 };
    expect(healthAnnualCost(50, b)).toBe(0);
    expect(healthAnnualCost(65, b)).toBe(1);
    expect(healthAnnualCost(75, b)).toBe(2);
    expect(healthAnnualCost(85, b)).toBe(3);
  });

  it("iDeCo lump sum empties the balance", () => {
    const sim = runIdecoSimulation({
      currentAge: 35, deathAge: 90,
      ideco: { currentValue: 1_000_000, monthlyContribution: 23_000, startAge: 35, endAge: 60,
        returnPct: 5, payoutStartAge: 60, payoutMethod: "lump", payoutYears: 10, lumpPortionPct: 50, payoutReturnPct: 0 },
    });
    expect(sim.valueAtPayout).toBeGreaterThan(0);
    expect(closeTo(sim.lumpAmount, sim.valueAtPayout, 1e-6)).toBe(true);
    expect(Math.abs(sim.finalValue)).toBeLessThan(1);
  });

  it("iDeCo annuity: annual payout times years equals the balance", () => {
    const sim = runIdecoSimulation({
      currentAge: 35, deathAge: 90,
      ideco: { currentValue: 1_000_000, monthlyContribution: 23_000, startAge: 35, endAge: 60,
        returnPct: 5, payoutStartAge: 60, payoutMethod: "pension", payoutYears: 10, lumpPortionPct: 50, payoutReturnPct: 0 },
    });
    expect(closeTo(sim.annualPayout * 10, sim.valueAtPayout, 1e-4)).toBe(true);
    expect(sim.payoutEndAge).toBe(70);
  });

  it("bank deposits stop at retirement (359 contributions, same rule as NISA)", () => {
    const sim = runBankSimulation({
      currentAge: 35, retireAge: 65, deathAge: 90,
      banks: [{ name: "X", balance: 1_000_000, monthlyDeposit: 20_000, interestPct: 0 }],
    });
    expect(sim.totalNow).toBe(1_000_000);
    const contributions = (sim.totalAtRetire - 1_000_000) / 20_000;
    expect(contributions).toBe(359);
    expect(closeTo(sim.totalFinal, sim.totalAtRetire, 1e-9)).toBe(true);
  });

  it("loan balance never goes negative and stalls if payment is below interest", () => {
    const ok = runLoanSimulation({
      currentAge: 35, deathAge: 90,
      loans: [{ name: "L", principal: 20_000_000, annualRatePct: 1.0, monthlyPayment: 60_000 }],
    });
    expect(ok.yearly.every((y) => y.total >= -0.01)).toBe(true);
    expect(ok.totalFinal).toBeLessThan(20_000_000);

    const bad = runLoanSimulation({
      currentAge: 35, deathAge: 90,
      loans: [{ name: "L", principal: 10_000_000, annualRatePct: 5, monthlyPayment: 1_000 }],
    });
    expect(bad.totalFinal).toBeGreaterThanOrEqual(10_000_000);
  });

  it("insurance premiums accumulate correctly", () => {
    const sim = runInsuranceSimulation({
      currentAge: 35, deathAge: 90,
      policies: [{ name: "I", premiumFromAge: 35, premiumToAge: 60, monthlyPremium: 10_000 }],
    });
    expect(closeTo(sim.totalFinal, 25 * 12 * 10_000, 1e-6)).toBe(true);
  });

  it("private pension builds up then drains", () => {
    const sim = runPrivatePensionSimulation({
      currentAge: 35, deathAge: 90,
      plans: [{ name: "P", contribFromAge: 35, contribToAge: 60, monthlyContribution: 20_000,
        payoutFromAge: 65, payoutToAge: 85, monthlyPayout: 30_000, currentBalance: 0 }],
    });
    expect(sim.yearly.find((y) => y.age === 60).total).toBeGreaterThan(0);
    expect(sim.totalFinal).toBeGreaterThanOrEqual(0);
  });
});
describe("United States (US) core calculations", () => {
  const inv = US_COUNTRY_RULES.investment;
  const ret = US_COUNTRY_RULES.retirement;
  const hc = US_COUNTRY_RULES.healthcare;
  const tax = US_COUNTRY_RULES.tax;

  it("401(k) employee limits including catch-up rules", () => {
    expect(inv.get401kEmployeeLimit(40)).toBe(24_500);
    expect(inv.get401kEmployeeLimit(55)).toBe(24_500 + 8_000);
    expect(inv.get401kEmployeeLimit(61)).toBe(24_500 + 11_250);
    expect(inv.get401kEmployeeLimit(64)).toBe(24_500 + 8_000);
  });

  it("IRA contribution limits", () => {
    expect(inv.getIraContributionLimit(40)).toBe(7_500);
    expect(inv.getIraContributionLimit(52)).toBe(7_500 + 1_100);
  });

  it("Roth IRA phase-out for single filers", () => {
    expect(inv.getRothIraEligibleFraction("single", 100_000)).toBe(1);
    expect(inv.getRothIraEligibleFraction("single", 160_500)).toBeCloseTo(0.5, 5);
    expect(inv.getRothIraEligibleFraction("single", 200_000)).toBe(0);
  });

  it("Social Security claiming factors", () => {
    expect(ret.getClaimingFactor(67)).toBe(1);
    expect(ret.getClaimingFactor(62)).toBeCloseTo(0.70, 4);
    expect(ret.getClaimingFactor(70)).toBeCloseTo(1.24, 4);
    expect(ret.getClaimingFactor(75)).toBe(ret.getClaimingFactor(70));
  });

  it("Medicare Part B standard premium and top IRMAA tier", () => {
    expect(hc.getAnnualMedicarePartB("single", 50_000)).toBeCloseTo(202.90 * 12, 4);
    expect(hc.getAnnualMedicarePartB("single", 600_000)).toBeCloseTo(689.90 * 12, 4);
  });

  it("federal income tax for a single filer on 100k", () => {
    const r = tax.calculateFederalTax(100_000, "single");
    expect(r.taxableIncome).toBe(83_900);
    expect(r.tax).toBeCloseTo(13_170, 2);
  });

  it("long-term capital gains and NIIT", () => {
    expect(tax.calculateLtcgTax(20_000, 20_000, "single")).toBe(0);
    expect(tax.calculateNiit(150_000, 50_000, "single")).toBe(0);
    expect(tax.calculateNiit(300_000, 50_000, "single")).toBeCloseTo(50_000 * 0.038, 6);
  });

  it("liquid vs restricted assets flip at 59 and a half", () => {
    const a = { k401: 100, traditionalIra: 100, rothIra: 100, brokerage: 100 };
    const under = inv.splitLiquidRestricted(45, a);
    expect(under.liquid).toBe(100);
    expect(under.restricted).toBe(300);
    const over = inv.splitLiquidRestricted(60, a);
    expect(over.liquid).toBe(300);
    expect(over.restricted).toBe(100);
  });

  it("balance projection has no negative account balances", () => {
    const sim = inv.simulateGrowth({
      currentAge: 40, retireAge: 65, deathAge: 90,
      accounts: {
        k401: { currentValue: 100_000, annualContribution: 20_000 },
        traditionalIra: { currentValue: 50_000, annualContribution: 5_000 },
        rothIra: { currentValue: 30_000, annualContribution: 2_000 },
        brokerage: { currentValue: 20_000, annualContribution: 10_000 },
      },
      returnPct: 6, annualWithdrawalNeeded: 60_000,
    });
    expect(sim.yearly).toHaveLength(51);
    expect(sim.yearly.every((y) => Object.values(y.accounts).every((v) => v >= -0.01))).toBe(true);
  });
});

describe("United Kingdom (GB) core calculations", () => {
  const inv = GB_COUNTRY_RULES.investment;
  const ret = GB_COUNTRY_RULES.retirement;
  const tax = GB_COUNTRY_RULES.tax;

  it("every rule carries its tax year and source", () => {
    [inv, ret, tax, GB_COUNTRY_RULES.healthcare].forEach((rule) => {
      expect(rule.effectiveTaxYear).toBe("2026/27");
      expect(rule.lastUpdated).toBeTruthy();
      expect(rule.sourceName).toBeTruthy();
      expect(rule.sourceUrl).toBeTruthy();
    });
  });

  it("income tax for England, Wales and Northern Ireland", () => {
    expect(tax.calculateIncomeTax(12_570).tax).toBe(0);
    expect(tax.calculateIncomeTax(30_000).tax).toBe(3_486);
    expect(tax.calculateIncomeTax(60_000).tax).toBe(11_432);
  });

  it("personal allowance taper and the 60 percent trap", () => {
    expect(tax.getPersonalAllowance(50_000)).toBe(12_570);
    expect(tax.getPersonalAllowance(110_000)).toBe(7_570);
    expect(tax.getPersonalAllowance(125_140)).toBe(0);
    expect(tax.getMarginalRate(110_000)).toBe(0.60);
  });

  it("dividend tax at the rates effective from April 2026", () => {
    expect(tax.dividend.basicRate).toBe(0.1075);
    expect(tax.dividend.higherRate).toBe(0.3575);
    expect(tax.dividend.additionalRate).toBe(0.3935);
    expect(tax.calculateDividendTax(500, 30_000)).toBe(0);
    expect(tax.calculateDividendTax(1_500, 20_000)).toBeCloseTo(1_000 * 0.1075, 6);
    expect(tax.calculateDividendTax(10_000, 60_000)).toBeCloseTo(9_500 * 0.3575, 6);
  });

  it("capital gains tax with the annual exempt amount", () => {
    expect(tax.capitalGains.annualExemptAmount).toBe(3_000);
    expect(tax.calculateCapitalGainsTax(3_000, 30_000)).toBe(0);
    expect(tax.calculateCapitalGainsTax(20_000, 80_000)).toBeCloseTo(17_000 * 0.24, 6);
  });

  it("pension annual allowance taper with a 10k floor", () => {
    expect(inv.getPensionAnnualAllowance(250_000)).toBe(60_000);
    expect(inv.getPensionAnnualAllowance(300_000)).toBe(40_000);
    expect(inv.getPensionAnnualAllowance(500_000)).toBe(10_000);
  });

  it("pension tax relief at the marginal rate, capped at the allowance", () => {
    expect(tax.calculatePensionTaxRelief(10_000, 60_000, 60_000)).toBe(4_000);
    expect(tax.calculatePensionTaxRelief(100_000, 60_000, 60_000)).toBe(60_000 * 0.4);
  });

  it("ISA annual allowance is 20k across both ISAs", () => {
    expect(inv.getIsaAnnualAllowance()).toBe(20_000);
    const a = { stocksSharesIsa: { annualContribution: 5_000 }, cashIsa: { annualContribution: 2_000 } };
    expect(inv.getIsaRemaining(a)).toBe(13_000);
  });

  it("State Pension deferral is 1 percent per 9 weeks, about 5.78 percent per year", () => {
    expect(ret.getDeferralFactorFromWeeks(9)).toBeCloseTo(1.01, 6);
    expect(ret.getDeferralFactorFromWeeks(18)).toBeCloseTo(1.02, 6);
    expect((ret.getDeferralFactorFromWeeks(52) - 1) * 100).toBeCloseTo(5.78, 2);
    expect(ret.getDeferralFactorFromWeeks(8)).toBe(1);
  });

  it("State Pension cannot be claimed early", () => {
    expect(ret.getDeferralFactor(65, 67)).toBe(1);
    expect(ret.getEffectiveClaimAge(65, 67)).toBe(67);
    expect(ret.getFullAnnualRate()).toBeCloseTo(12_547.60, 2);
  });

  it("liquid plus restricted equals total across all ages", () => {
    const a = {
      stocksSharesIsa: { currentValue: 11_111 }, cashIsa: { currentValue: 2_222 },
      sipp: { currentValue: 33_333 }, workplacePension: { currentValue: 4_444 },
      gia: { currentValue: 5_555 }, cashSavings: { currentValue: 6_666 },
    };
    const total = 11_111 + 2_222 + 33_333 + 4_444 + 5_555 + 6_666;
    [30, 54, 55, 56, 70, 95].forEach((age) => {
      const s = inv.splitAssets(age, a);
      expect(s.liquid + s.restricted).toBe(s.total);
      expect(s.total).toBe(total);
    });
    expect(inv.splitAssets(54, a).restricted).toBe(33_333 + 4_444);
    expect(inv.splitAssets(55, a).restricted).toBe(0);
    expect(inv.splitAssets(40, a).taxAdvantaged).toBe(11_111 + 2_222 + 33_333 + 4_444);
  });

  it("per-account contribution end ages are respected", () => {
    const accounts = {
      stocksSharesIsa: { currentValue: 10_000, annualContribution: 5_000, expectedReturnPct: 5, contributionEndAge: 65 },
      cashIsa: { currentValue: 5_000, annualContribution: 2_000, expectedReturnPct: 3, contributionEndAge: 65 },
      sipp: { currentValue: 20_000, annualContribution: 6_000, expectedReturnPct: 5, contributionEndAge: 65 },
      workplacePension: { currentValue: 30_000, annualContribution: 4_000, expectedReturnPct: 5, contributionEndAge: 65 },
      gia: { currentValue: 8_000, annualContribution: 1_000, expectedReturnPct: 5, contributionEndAge: 60 },
      cashSavings: { currentValue: 12_000, annualContribution: 500, expectedReturnPct: 2, contributionEndAge: 65 },
    };
    const sim = inv.simulateGrowth({ currentAge: 40, retireAge: 65, deathAge: 90, accounts, annualWithdrawalNeeded: 30_000 });
    expect(sim.yearly).toHaveLength(51);
    expect(sim.yearly.every((y) => Object.values(y.accounts).every((v) => v >= -0.01))).toBe(true);
  });

  it("healthcare model multiplies monthly private cover by 12", () => {
    const total = GB_COUNTRY_RULES.healthcare.getAnnualTotal({
      nhsBasicAnnual: 100, privateHealthInsuranceMonthly: 50, dentalAnnual: 200,
      prescriptionAnnual: 120, longTermCareAnnual: 0, otherOutOfPocketAnnual: 80,
    });
    expect(total).toBe(100 + 600 + 200 + 120 + 0 + 80);
  });

  it("Scottish rates are explicitly not implemented", () => {
    expect(tax.scotland.implemented).toBe(false);
    expect(tax.scotland.bands).toBeNull();
    expect(tax.scotland.rates).toBeNull();
    expect(tax.region).toBe("England, Wales & Northern Ireland");
  });
});

describe("country rules stay independent", () => {
  it("Japan has no US or UK methods", () => {
    expect(JP_COUNTRY_RULES.investment.simulateGrowth).toBeUndefined();
    expect(JP_COUNTRY_RULES.investment.splitAssets).toBeUndefined();
    expect(JP_COUNTRY_RULES.investment.get401kEmployeeLimit).toBeUndefined();
  });

  it("the UK has no US methods", () => {
    expect(GB_COUNTRY_RULES.investment.get401kEmployeeLimit).toBeUndefined();
    expect(GB_COUNTRY_RULES.retirement.getClaimingFactor).toBeUndefined();
  });

  it("all three countries implement investment, retirement, healthcare and tax", () => {
    [JP_COUNTRY_RULES, US_COUNTRY_RULES, GB_COUNTRY_RULES].forEach((rules) => {
      expect(rules.investment.implemented).toBe(true);
      expect(rules.retirement.implemented).toBe(true);
      expect(rules.healthcare.implemented).toBe(true);
      expect(rules.tax.implemented).toBe(true);
    });
  });
});
