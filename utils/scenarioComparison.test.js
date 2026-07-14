// ============================================================================
// scenarioComparison.test.js（既存テストと同じリポジトリ直下に置く）
//
// シナリオ比較（現在プラン vs 比較プラン）の検証。
// 新しい計算式は無く、既存の runIntegratedPlan を2回呼ぶだけなので、
// ここで守るのは「元データを壊さないこと」「差が正しい向きに出ること」
// 「グラフ結合で行が欠落・上書きされないこと」の3点。
// ============================================================================

import { describe, it, expect } from "vitest";
import { getCountryRules } from "./countryRules/index.js";
import { DRAWDOWN_CATEGORIES } from "./utils/simulations.js";
import { runScenarioComparison, createComparisonDraft } from "./utils/scenarioComparison.js";
import { readLivingCostMonthly } from "./utils/buildPlanInput.js";

const COUNTRIES = ["JP", "US", "GB", "CA", "AU"];

function makeInputs(country, over = {}) {
  const acct = (extra = {}) => ({
    currentValue: 100000, annualContribution: 6000,
    expectedReturnPct: 5, contributionEndAge: 65, withdrawalTaxPct: 0, ...extra,
  });
  return {
    country, baseCurrency: "JPY", language: "ja",
    currentAge: 40, retireAge: 65, deathAge: 90,
    livingCostMonthly: 250000,
    inheritanceTarget: 10000000, inheritancePlans: [],
    publicPensionStartAge: 65, pensionMonthly: 150000, pensionSources: [],
    healthBrackets: { b60: 100000, b70: 150000, b80: 200000 },
    tsumitateSchedule: [{ fromAge: 40, toAge: 65, monthlyYen: 50000 }],
    growthSchedule: [{ fromAge: 40, toAge: 65, monthlyYen: 50000 }],
    lumpSums: [], tsumitateUsed: 0, growthUsed: 0,
    banks: [{ name: "main", balance: 5000000, monthlyDeposit: 20000, interestPct: 0.1 }],
    loans: [], insurancePolicies: [], privatePensionPlans: [],
    gold: {
      currentGrams: 100, pricePerGram: 15000, priceGrowthPct: 3, priceGrowthPctAuto: false,
      monthlyYen: 10000, accumulateUntilAge: 65, asOfYears: "", asOfMonths: "",
    },
    ideco: {
      currentValue: 2000000, principalTotal: 1500000, monthlyContribution: 23000,
      startAge: 35, endAge: 60, productName: "", returnPct: 5, returnPctAuto: false,
      expectedReturnPct: 5, payoutStartAge: 60, payoutMethod: "lump", payoutYears: 10,
      lumpPortionPct: 50, payoutReturnPct: 0, annualIncome: 6000000,
      asOfYears: "", asOfMonths: "",
    },
    usInvestment: {
      k401: acct(), traditionalIra: acct(), rothIra: acct(), brokerage: acct(),
      socialSecurity: { claimAge: 67 }, expectedReturnPct: 5, expensesMonthly: 4000,
    },
    gbInvestment: {
      cashSavings: acct(), gia: acct(), cashIsa: acct(), stocksSharesIsa: acct(),
      workplacePension: acct(), sipp: acct(), expensesMonthly: 3000,
    },
    caInvestment: {
      cashSavings: acct(), nonRegistered: acct(), tfsa: acct(), rrsp: acct(),
      expensesMonthly: 4000,
    },
    auInvestment: {
      cashSavings: acct(), investmentAccount: acct(), superannuation: acct(),
      annualSalary: 100000, voluntaryConcessional: 5000, expensesMonthly: 4500,
    },
    ...over,
  };
}

function ctxFor(country, over = {}) {
  const inputs = makeInputs(country, over);
  return {
    country, rules: getCountryRules(country), inputs,
    effectiveCurrentAge: 40,
    effectiveCurrentAssets: 3000000,
    effectivePostRetireReturn: 3,
    dynamicFunds: [{ id: "全世界株式", pct: 100, returnPct: 5 }],
    stockTotalNow: 1000000,
    effectiveStockReturnPct: 6,
    goldCurrentValue: 1500000,
    effectiveGoldReturnPct: 3,
    effectivePensionMonthly: 150000,
    effectivePublicPensionStartAge: 65,
    drawdownOrder: DRAWDOWN_CATEGORIES,
    uncategorizedLabel: "未分類",
    countryDerived: {
      usSSMonthlyBenefit: 2500, usTotalHealthcareAnnual: 8000, usClaimAge: 67,
      gbStatePensionAnnual: 12000, gbAdditionalPensionAnnual: 3000,
      gbEffectiveClaimAge: 67, gbHealthcareAnnual: 1500,
      caCppAnnual: 15000, caCppStartAge: 65, caOasAnnual: 8000, caOasStartAge: 65,
      caAdditionalPensionAnnual: 2000, caHealthcareAnnual: 2500,
      auAgePensionAnnual: 26000, auAgePensionQualifyingAge: 67,
      auOtherAnnualIncome: 5000, auHealthcareAnnual: 3000,
    },
  };
}

describe("runScenarioComparison", () => {
  // ---- ① 5か国すべてで完走する ----
  it.each(COUNTRIES)("%s：比較計算が例外なく完走する", (country) => {
    const ctx = ctxFor(country);
    const draft = createComparisonDraft(country, ctx.inputs);
    draft.retireAge = 60;
    draft.contributionMultiplier = 1.2;
    draft.livingCostMonthly = draft.livingCostMonthly * 1.1;

    const r = runScenarioComparison(ctx, draft, { inheritanceTarget: ctx.inputs.inheritanceTarget });

    expect(Number.isFinite(r.base.netWorthFinal)).toBe(true);
    expect(Number.isFinite(r.compare.netWorthFinal)).toBe(true);
    expect(r.chartData.length).toBe(r.baseYearly.length);
    expect(r.compare.retireAge).toBe(60);
  });

  // ---- ② 同一条件なら全差額が0 ----
  it.each(COUNTRIES)("%s：現在プランのコピーをそのまま比較すると差額はすべて0", (country) => {
    const ctx = ctxFor(country);
    const draft = createComparisonDraft(country, ctx.inputs); // 何も変えない
    const r = runScenarioComparison(ctx, draft, { inheritanceTarget: ctx.inputs.inheritanceTarget });

    expect(r.diff.netWorthAtRetire).toBeCloseTo(0, 6);
    expect(r.diff.netWorthFinal).toBeCloseTo(0, 6);
    expect(r.diff.inheritanceGap).toBeCloseTo(0, 6);
    expect(r.base.depletionAge).toBe(r.compare.depletionAge);
  });

  // ---- ③ 元の inputs を変更しない ----
  it.each(COUNTRIES)("%s：元の inputs を1バイトも変更しない", (country) => {
    const ctx = ctxFor(country);
    const before = JSON.stringify(ctx.inputs);

    runScenarioComparison(ctx, {
      retireAge: 55,
      livingCostMonthly: readLivingCostMonthly(country, ctx.inputs) * 3,
      contributionMultiplier: 1.5,
    }, { inheritanceTarget: 0 });

    expect(JSON.stringify(ctx.inputs)).toBe(before);
  });

  // ---- ④ 生活費が増えれば最終純資産は減る ----
  it.each(COUNTRIES)("%s：退職後の生活費を増やすと想定寿命時点の純資産が減る", (country) => {
    const ctx = ctxFor(country);
    const draft = createComparisonDraft(country, ctx.inputs);
    draft.livingCostMonthly = draft.livingCostMonthly * 1.5;

    const r = runScenarioComparison(ctx, draft, { inheritanceTarget: 0 });
    expect(r.compare.netWorthFinal).toBeLessThan(r.base.netWorthFinal);
    expect(r.diff.netWorthFinal).toBeLessThan(0);
    // 退職時点の資産は生活費と無関係なので変わらない
    expect(r.diff.netWorthAtRetire).toBeCloseTo(0, 6);
  });

  // ---- ⑤ 積立倍率を上げれば退職時資産は増える ----
  it.each(COUNTRIES)("%s：積立倍率を上げると退職時点の総資産が増える", (country) => {
    const ctx = ctxFor(country);
    const draft = createComparisonDraft(country, ctx.inputs);
    draft.contributionMultiplier = 1.5;

    const r = runScenarioComparison(ctx, draft, { inheritanceTarget: 0 });
    expect(r.compare.netWorthAtRetire).toBeGreaterThan(r.base.netWorthAtRetire);
    expect(r.diff.netWorthAtRetire).toBeGreaterThan(0);
  });

  it.each(COUNTRIES)("%s：積立倍率を下げると退職時点の総資産が減る", (country) => {
    const ctx = ctxFor(country);
    const draft = createComparisonDraft(country, ctx.inputs);
    draft.contributionMultiplier = 0.8;

    const r = runScenarioComparison(ctx, draft, { inheritanceTarget: 0 });
    expect(r.compare.netWorthAtRetire).toBeLessThan(r.base.netWorthAtRetire);
  });

  // ---- ⑥ 小数年齢のグラフデータが欠落・上書きされない ----
  it("小数の想定寿命（90.5歳）でも、同じ整数ageの行が上書きされず比較線が全行に入る", () => {
    // deathAge が 90.5 だと、90歳の誕生日の行と 90.5歳（最終行）の行が
    // どちらも age = 90（Math.floor）になる。整数 age をキーにすると衝突して
    // 片方が上書きされ、比較線が欠ける。exactAge をキーにすればこれを防げる。
    const ctx = ctxFor("JP", { deathAge: 90.5 });
    const draft = createComparisonDraft("JP", ctx.inputs);
    draft.retireAge = 60;

    const r = runScenarioComparison(ctx, draft, { inheritanceTarget: 0 });

    // 同じ整数 age を持つ行が実際に複数ある（この前提が崩れたらテストの意味が無い）
    const ageCounts = r.chartData.reduce((acc, row) => {
      acc[row.age] = (acc[row.age] || 0) + 1;
      return acc;
    }, {});
    expect(Math.max(...Object.values(ageCounts))).toBeGreaterThan(1);

    // 全行に比較線の値が入っており、欠落（null）が無い
    expect(r.chartData.length).toBe(r.baseYearly.length);
    expect(r.chartData.every((row) => row.comparisonNetWorth !== null)).toBe(true);

    // 同じ整数 age の2行が、別々の（＝上書きされていない）値を持っている
    const dupAge = Object.keys(ageCounts).find((a) => ageCounts[a] > 1);
    const dupRows = r.chartData.filter((row) => String(row.age) === dupAge);
    const exactAges = dupRows.map((row) => row.exactAge);
    expect(new Set(exactAges).size).toBe(dupRows.length); // exactAge は重複しない

    // 現在プランの資産内訳キー（面グラフ）は一切壊れていない
    r.chartData.forEach((row) => {
      expect(row).toHaveProperty("investmentValue");
      expect(row).toHaveProperty("netWorth");
      expect(row.netWorth).toBeCloseTo(row.totalAssets - row.loanBalance, 6);
    });
  });
});
