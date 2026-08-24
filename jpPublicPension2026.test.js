import { describe, it, expect } from "vitest";
import { calculateJapanPublicPension, japanPublicPensionRulesForBirthDate } from "./utils/jpPublicPension.js";
import { getCountryRules } from "./countryRules/index.js";
import { buildPlanInput } from "./utils/buildPlanInput.js";
import { runIntegratedPlan } from "./lifePlanEngine.js";
import { DRAWDOWN_CATEGORIES } from "./utils/simulations.js";

describe("日本の公的年金：繰上げ・繰下げ（2026-08制度）", () => {
  it("1962-04-02以降生まれは繰上げ月0.4%減、70歳は42%増", () => {
    expect(calculateJapanPublicPension({ monthlyAt65: 160000, claimAge: 60, birthDate: "1968-01-01" }).monthlyAmount).toBe(121600);
    expect(calculateJapanPublicPension({ monthlyAt65: 160000, claimAge: 70, birthDate: "1968-01-01" }).monthlyAmount).toBe(227200);
  });

  it("月単位で計算する（67歳6か月＝21%増）", () => {
    const r = calculateJapanPublicPension({ monthlyAt65: 160000, claimAge: 67.5, birthDate: "1968-01-01" });
    expect(r.adjustmentRate).toBeCloseTo(0.21, 12);
    expect(r.monthlyAmount).toBe(193600);
  });

  it("1962-04-01以前生まれは繰上げ月0.5%減", () => {
    const r = calculateJapanPublicPension({ monthlyAt65: 160000, claimAge: 60, birthDate: "1962-04-01" });
    expect(r.adjustmentRate).toBeCloseTo(-0.30, 12);
    expect(r.monthlyAmount).toBe(112000);
  });

  it("1952-04-01以前生まれは繰下げ上限70歳", () => {
    const rules = japanPublicPensionRulesForBirthDate("1950-01-01");
    expect(rules.latestClaimAge).toBe(70);
    const r = calculateJapanPublicPension({ monthlyAt65: 160000, claimAge: 75, birthDate: "1950-01-01" });
    expect(r.claimAge).toBe(70);
    expect(r.adjustmentRate).toBeCloseTo(0.42, 12);
  });
});

describe("日本：公的年金と企業年金基金等を分離", () => {
  it("公的年金70歳繰下げでも、その他年金は65歳から元の月額で始まる", () => {
    const inputs = {
      country: "JP", currentAge: 64, retireAge: 65, deathAge: 71,
      livingCostMonthly: 0, inheritanceTarget: 0, inheritancePlans: [],
      publicPensionStartAge: 70, pensionMonthly: 0,
      pensionSources: [
        { name: "企業年金基金", monthlyAmount: 23000, startAge: 65 },
        { name: "国民年金基金", monthlyAmount: 23000, startAge: 65 },
      ],
      healthBrackets: { b60: 0, b70: 0, b80: 0 },
      tsumitateSchedule: [], growthSchedule: [], lumpSums: [], tsumitateHoldings: [], growthHoldings: [],
      banks: [], loans: [], insurancePolicies: [], privatePensionPlans: [],
      gold: { currentGrams: 0, pricePerGram: 0, monthlyYen: 0, accumulateUntilAge: 65 },
      ideco: { currentValue: 0, principalTotal: 0, monthlyContribution: 0, startAge: 58, endAge: 60, payoutStartAge: 60, payoutMethod: "lump", payoutYears: 10, lumpPortionPct: 50, expectedReturnPct: 0 },
      retirementTax: { publicPension: { mode: "manual", manualAnnual: 0 }, publicPensionIndexation: { mode: "off", manualPct: 0 }, privatePension: { mode: "manual", manualAnnual: 0 }, fixedCosts: [], otherAnnualTaxes: 0, jpSeniorMedical75: { mode: "manual", manualAnnual: 0 } },
      inflation: { mode: "off", manualPct: 0 },
    };
    const plan = buildPlanInput({
      country: "JP", rules: getCountryRules("JP"), inputs,
      effectiveCurrentAge: 64, effectiveCurrentAssets: 0, effectivePostRetireReturn: 0,
      dynamicFunds: [], stockTotalNow: 0, effectiveStockReturnPct: 0,
      goldCurrentValue: 0, effectiveGoldReturnPct: 0,
      effectivePensionMonthly: 273820, effectivePublicPensionStartAge: 70,
      jpPublicPensionMonthly: 227820, jpOtherPensionSources: inputs.pensionSources,
      drawdownOrder: DRAWDOWN_CATEGORIES, uncategorizedLabel: "未分類",
    });
    const out = runIntegratedPlan(plan);
    const year65to66 = out.yearly.find((r) => Math.abs(r.age - 66) < 1e-9);
    const year70to71 = out.yearly.find((r) => Math.abs(r.age - 71) < 1e-9);
    expect(Math.round(year65to66.publicPensionAnnual)).toBe(46000 * 12);
    expect(Math.round(year70to71.publicPensionAnnual)).toBe((227820 + 46000) * 12);
  });
});
