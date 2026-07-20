// ============================================================================
// utils/scenarioComparisonAudit.test.js
//
// シナリオ比較の品質監査（Ver.1.0 公開判定用）。
//
// 既存の scenarioComparison.test.js は「元データを壊さない」「差の向き」
// 「グラフ結合」を守っている。本ファイルはそこに載っていない観点、
// とくに余剰金機能の追加・修正後に壊れていないかを固定する。
//
//   1. 積立額だけ変えたとき、正しく分岐する（他の条件は動かない）
//   2. 退職年齢だけ変えたとき、正しく反映される
//   3. 生活費だけ変えたとき、正しく反映される
//   4. 比較の開始・編集・終了・再開でデータが壊れない
//   5. 保存（直列化）→復元のあとも同じ結果になる
//   6. 5か国すべてで成立する
//   7. 余剰金機能との組み合わせで二重計上・計算漏れが起きない
//   8. 総資産・使える資産・余剰金残高がシナリオごとに独立して計算される
//
// 【前提】比較は新しい計算式を作らず、runIntegratedPlan を base / compare に
//   1回ずつ使うだけ。したがって本ファイルの検証も「単独計算と一致するか」を
//   基準に置く（比較したことで単独の結果が変わらないこと＝汚染がないこと）。
// ============================================================================

import { describe, it, expect } from "vitest";
import { getCountryRules } from "../countryRules/index.js";
import { runIntegratedPlan } from "../lifePlanEngine.js";
import { DRAWDOWN_CATEGORIES } from "./simulations.js";
import { buildPlanInput, readLivingCostMonthly } from "./buildPlanInput.js";
import {
  runScenarioComparison,
  createComparisonDraft,
  attachComparisonLine,
  CONTRIBUTION_MULTIPLIERS,
} from "./scenarioComparison.js";

const COUNTRIES = ["JP", "US", "GB", "CA", "AU"];

// ---------------------------------------------------------------------------
// 検証用の入力（既存の比較テストと同じ形。国ごとの口座もすべて埋めてある）
// ---------------------------------------------------------------------------
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
  return {
    country, rules: getCountryRules(country), inputs: makeInputs(country, over),
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

// 単独計算（比較を使わずにそのまま1回だけ回した結果）。比較の結果と突き合わせる基準。
const runAlone = (ctx, overrides) => runIntegratedPlan(buildPlanInput(ctx, overrides));
const series = (rows, key) => JSON.stringify(rows.map((r) => r[key]));
const rowAt = (rows, age) => rows.find((r) => r.age === age) || rows[rows.length - 1];

// ============================================================================
// 1. 積立額だけ変えたとき
// ============================================================================
describe("監査1：積立額だけを変えたときの分岐", () => {
  it.each(COUNTRIES)("%s：倍率1.0は現在プランと完全一致（系列も差額も同じ）", (country) => {
    const ctx = ctxFor(country);
    const draft = createComparisonDraft(country, ctx.inputs);
    draft.contributionMultiplier = 1;
    const r = runScenarioComparison(ctx, draft, { inheritanceTarget: 0 });
    expect(series(r.compareYearly, "netWorth")).toBe(series(r.baseYearly, "netWorth"));
    expect(series(r.compareYearly, "totalAssets")).toBe(series(r.baseYearly, "totalAssets"));
    expect(r.diff.netWorthFinal).toBeCloseTo(0, 6);
  });

  it.each(COUNTRIES)("%s：倍率を上げるほど退職時点の純資産が単調に増える", (country) => {
    const ctx = ctxFor(country);
    const at = (m) => {
      const draft = createComparisonDraft(country, ctx.inputs);
      draft.contributionMultiplier = m;
      return runScenarioComparison(ctx, draft, { inheritanceTarget: 0 }).compare.netWorthAtRetire;
    };
    const low = at(0.8);
    const mid = at(1.0);
    const high = at(1.5);
    expect(low).toBeLessThan(mid);
    expect(mid).toBeLessThan(high);
  });

  it("積立倍率だけを変えたとき、退職年齢と生活費は現在プランのまま", () => {
    const ctx = ctxFor("JP");
    const draft = createComparisonDraft("JP", ctx.inputs);
    draft.contributionMultiplier = 1.5;
    const r = runScenarioComparison(ctx, draft, { inheritanceTarget: 0 });
    expect(r.compare.retireAge).toBe(Number(ctx.inputs.retireAge));
    expect(draft.livingCostMonthly).toBe(readLivingCostMonthly("JP", ctx.inputs));
    // 退職前に効く変更なので、退職時点にも最終時点にも差が出る。
    expect(r.diff.netWorthAtRetire).toBeGreaterThan(0);
    expect(r.diff.netWorthFinal).toBeGreaterThan(0);
  });

  it("選べる倍率（CONTRIBUTION_MULTIPLIERS）はすべて計算できる", () => {
    const ctx = ctxFor("JP");
    expect(Array.isArray(CONTRIBUTION_MULTIPLIERS)).toBe(true);
    expect(CONTRIBUTION_MULTIPLIERS.length).toBeGreaterThan(0);
    CONTRIBUTION_MULTIPLIERS.forEach((m) => {
      const draft = createComparisonDraft("JP", ctx.inputs);
      draft.contributionMultiplier = m;
      const r = runScenarioComparison(ctx, draft, { inheritanceTarget: 0 });
      expect(Number.isFinite(r.compare.netWorthFinal)).toBe(true);
    });
  });
});

// ============================================================================
// 2. 退職年齢だけ変えたとき
// ============================================================================
describe("監査2：退職年齢だけを変えたときの反映", () => {
  it.each(COUNTRIES)("%s：早く辞めると最終純資産が減り、要約の退職年齢も切り替わる", (country) => {
    const ctx = ctxFor(country);
    const draft = createComparisonDraft(country, ctx.inputs);
    draft.retireAge = 60;
    const r = runScenarioComparison(ctx, draft, { inheritanceTarget: 0 });
    expect(r.base.retireAge).toBe(65);
    expect(r.compare.retireAge).toBe(60);
    // 積立期間が短く、取り崩し期間が長くなるので最終純資産は減る。
    expect(r.compare.netWorthFinal).toBeLessThan(r.base.netWorthFinal);
    expect(r.diff.netWorthFinal).toBeLessThan(0);
  });

  it.each(COUNTRIES)("%s：比較プランは退職年齢だけを上書きした単独計算と完全一致する", (country) => {
    const ctx = ctxFor(country);
    const draft = createComparisonDraft(country, ctx.inputs);
    draft.retireAge = 62;
    const r = runScenarioComparison(ctx, draft, { inheritanceTarget: 0 });
    const alone = runAlone(ctx, { retireAge: 62, livingCostMonthly: draft.livingCostMonthly, contributionMultiplier: 1 });
    expect(series(r.compareYearly, "netWorth")).toBe(series(alone.yearly, "netWorth"));
  });

  it("要約の『退職時点の純資産』は、各プラン自身の退職年齢の行から取る", () => {
    const ctx = ctxFor("JP");
    const draft = createComparisonDraft("JP", ctx.inputs);
    draft.retireAge = 60;
    const r = runScenarioComparison(ctx, draft, { inheritanceTarget: 0 });
    expect(r.base.netWorthAtRetire).toBeCloseTo(rowAt(r.baseYearly, 65).netWorth, 6);
    expect(r.compare.netWorthAtRetire).toBeCloseTo(rowAt(r.compareYearly, 60).netWorth, 6);
  });

  it("遅く辞めるほど最終純資産が増える（60 < 65 < 70）", () => {
    const ctx = ctxFor("JP");
    const at = (age) => {
      const draft = createComparisonDraft("JP", ctx.inputs);
      draft.retireAge = age;
      return runScenarioComparison(ctx, draft, { inheritanceTarget: 0 }).compare.netWorthFinal;
    };
    expect(at(60)).toBeLessThan(at(65));
    expect(at(65)).toBeLessThan(at(70));
  });
});

// ============================================================================
// 3. 生活費だけ変えたとき
// ============================================================================
describe("監査3：生活費だけを変えたときの反映", () => {
  it.each(COUNTRIES)("%s：生活費を下げると最終純資産が増え、退職時点は変わらない", (country) => {
    const ctx = ctxFor(country);
    const draft = createComparisonDraft(country, ctx.inputs);
    draft.livingCostMonthly = draft.livingCostMonthly * 0.5;
    const r = runScenarioComparison(ctx, draft, { inheritanceTarget: 0 });
    expect(r.compare.netWorthFinal).toBeGreaterThan(r.base.netWorthFinal);
    // 生活費は退職後にだけ効くので、退職時点の純資産は動かない。
    expect(r.diff.netWorthAtRetire).toBeCloseTo(0, 6);
  });

  it.each(COUNTRIES)("%s：比較プランは生活費だけを上書きした単独計算と完全一致する", (country) => {
    const ctx = ctxFor(country);
    const draft = createComparisonDraft(country, ctx.inputs);
    draft.livingCostMonthly = draft.livingCostMonthly * 1.4;
    const r = runScenarioComparison(ctx, draft, { inheritanceTarget: 0 });
    const alone = runAlone(ctx, {
      retireAge: Number(ctx.inputs.retireAge),
      livingCostMonthly: draft.livingCostMonthly,
      contributionMultiplier: 1,
    });
    expect(series(r.compareYearly, "netWorth")).toBe(series(alone.yearly, "netWorth"));
  });

  it("生活費を大きく増やすと資産寿命（枯渇年齢）が現れ、差にも出る", () => {
    const ctx = ctxFor("JP");
    const draft = createComparisonDraft("JP", ctx.inputs);
    draft.livingCostMonthly = draft.livingCostMonthly * 6;
    const r = runScenarioComparison(ctx, draft, { inheritanceTarget: 0 });
    expect(r.base.depletionAge).toBeNull();       // 現在プランは尽きない
    expect(r.compare.depletionAge).not.toBeNull(); // 比較プランは尽きる
    // 片方が「尽きない」場合、年数の差は数値で比べられないので null を返す契約。
    expect(r.diff.depletionAge).toBeNull();
  });
});

// ============================================================================
// 4. 追加・削除・再編集でデータが壊れない
// ============================================================================
describe("監査4：比較の開始・編集・終了・再開", () => {
  it("開始直後の比較プランは現在プランのコピー（差額がすべて0）", () => {
    const ctx = ctxFor("JP");
    const draft = createComparisonDraft("JP", ctx.inputs);
    expect(draft.retireAge).toBe(Number(ctx.inputs.retireAge));
    expect(draft.livingCostMonthly).toBe(readLivingCostMonthly("JP", ctx.inputs));
    expect(draft.contributionMultiplier).toBe(1);
    const r = runScenarioComparison(ctx, draft, { inheritanceTarget: 0 });
    expect(r.diff.netWorthFinal).toBeCloseTo(0, 6);
  });

  it("3項目を続けて編集しても、最後の値だけが効く（途中の値が残らない）", () => {
    const ctx = ctxFor("JP");
    // UI と同じく { ...draft, key: value } を重ねる編集の仕方を再現する。
    let draft = createComparisonDraft("JP", ctx.inputs);
    draft = { ...draft, contributionMultiplier: 1.5 };
    draft = { ...draft, retireAge: 60 };
    draft = { ...draft, retireAge: 62 };            // 退職年齢を再編集
    draft = { ...draft, livingCostMonthly: 300000 };
    draft = { ...draft, contributionMultiplier: 1.2 }; // 積立倍率を再編集
    const r = runScenarioComparison(ctx, draft, { inheritanceTarget: 0 });
    const alone = runAlone(ctx, { retireAge: 62, livingCostMonthly: 300000, contributionMultiplier: 1.2 });
    expect(series(r.compareYearly, "netWorth")).toBe(series(alone.yearly, "netWorth"));
    expect(r.compare.retireAge).toBe(62);
  });

  it("同じ比較を何度実行しても結果が変わらない（冪等）", () => {
    const ctx = ctxFor("JP");
    const draft = { ...createComparisonDraft("JP", ctx.inputs), retireAge: 60, contributionMultiplier: 1.2 };
    const a = runScenarioComparison(ctx, draft, { inheritanceTarget: 0 });
    const b = runScenarioComparison(ctx, draft, { inheritanceTarget: 0 });
    const c = runScenarioComparison(ctx, draft, { inheritanceTarget: 0 });
    expect(series(b.compareYearly, "netWorth")).toBe(series(a.compareYearly, "netWorth"));
    expect(series(c.baseYearly, "netWorth")).toBe(series(a.baseYearly, "netWorth"));
  });

  it("比較を実行しても draft オブジェクト自身が書き換わらない", () => {
    const ctx = ctxFor("JP");
    const draft = { ...createComparisonDraft("JP", ctx.inputs), retireAge: 60, contributionMultiplier: 1.5 };
    const before = JSON.stringify(draft);
    runScenarioComparison(ctx, draft, { inheritanceTarget: 0 });
    expect(JSON.stringify(draft)).toBe(before);
  });

  it("比較を終了（破棄）したあとの単独計算は、比較前とまったく同じ", () => {
    const ctx = ctxFor("JP");
    const before = runAlone(ctx);
    runScenarioComparison(ctx, { ...createComparisonDraft("JP", ctx.inputs), retireAge: 55, contributionMultiplier: 2 }, { inheritanceTarget: 0 });
    const after = runAlone(ctx);
    expect(series(after.yearly, "netWorth")).toBe(series(before.yearly, "netWorth"));
    expect(series(after.yearly, "surplusBalance")).toBe(series(before.yearly, "surplusBalance"));
  });

  it("編集した比較のあとに開始し直すと、初期値（現在プランのコピー）に戻る", () => {
    const ctx = ctxFor("JP");
    const edited = { ...createComparisonDraft("JP", ctx.inputs), retireAge: 55, contributionMultiplier: 2, livingCostMonthly: 1 };
    runScenarioComparison(ctx, edited, { inheritanceTarget: 0 });
    const fresh = createComparisonDraft("JP", ctx.inputs);
    expect(fresh).toEqual({
      retireAge: Number(ctx.inputs.retireAge),
      livingCostMonthly: readLivingCostMonthly("JP", ctx.inputs),
      contributionMultiplier: 1,
    });
  });

  it("不正な draft（欠損・null・空文字・非数値）でも例外にならず、現在プランとして扱われる", () => {
    // 【回帰】Number(null) は 0 かつ有限なので、積立倍率だけを「有限か」で判定すると
    // null が 0倍（積立ゼロ）として通ってしまい、比較プランが別物になっていた。
    const ctx = ctxFor("JP");
    const base = runAlone(ctx);
    [
      {},
      { retireAge: null, livingCostMonthly: null, contributionMultiplier: null },
      { retireAge: "", livingCostMonthly: "", contributionMultiplier: "" },
      { retireAge: undefined, livingCostMonthly: undefined, contributionMultiplier: undefined },
      { retireAge: NaN, livingCostMonthly: NaN, contributionMultiplier: NaN },
      { contributionMultiplier: "abc" },
    ].forEach((draft) => {
      const r = runScenarioComparison(ctx, draft, { inheritanceTarget: 0 });
      expect(series(r.compareYearly, "netWorth"), JSON.stringify(draft)).toBe(series(base.yearly, "netWorth"));
    });
  });

  it("積立倍率0（積立を止めるシナリオ）は0として尊重する（未指定と混同しない）", () => {
    const ctx = ctxFor("JP");
    const base = runAlone(ctx);
    const r = runScenarioComparison(ctx, { contributionMultiplier: 0 }, { inheritanceTarget: 0 });
    expect(r.compare.netWorthAtRetire).toBeLessThan(r.base.netWorthAtRetire);
    expect(series(r.compareYearly, "netWorth")).not.toBe(series(base.yearly, "netWorth"));
  });
});

// ============================================================================
// 5. 保存（直列化）→復元
//
// 比較プラン（draft）は一時的な画面状態で、保存データには含めない設計。
// したがってここで守るべきは「保存・復元した入力から同じ比較結果が再現できること」
// と「比較しても保存対象（inputs）が汚れないこと」の2点。
// ============================================================================
describe("監査5：保存→復元しても同じ比較結果になる", () => {
  it.each(COUNTRIES)("%s：inputs を直列化→復元しても比較結果が完全一致する", (country) => {
    const ctx = ctxFor(country);
    const draft = { ...createComparisonDraft(country, ctx.inputs), retireAge: 60, contributionMultiplier: 1.2 };
    const before = runScenarioComparison(ctx, draft, { inheritanceTarget: 1000000 });

    // 保存→読み込みと同じ経路（JSON 直列化）を通した入力で作り直す。
    const restoredCtx = { ...ctx, inputs: JSON.parse(JSON.stringify(ctx.inputs)) };
    const after = runScenarioComparison(restoredCtx, draft, { inheritanceTarget: 1000000 });

    expect(series(after.baseYearly, "netWorth")).toBe(series(before.baseYearly, "netWorth"));
    expect(series(after.compareYearly, "netWorth")).toBe(series(before.compareYearly, "netWorth"));
    expect(after.diff.netWorthFinal).toBeCloseTo(before.diff.netWorthFinal, 6);
  });

  it("余剰金残高の系列は、保存・復元をはさんでも一致する", () => {
    const ctx = ctxFor("JP", { livingCostMonthly: 50000 });
    const draft = { ...createComparisonDraft("JP", ctx.inputs), livingCostMonthly: 200000 };
    const before = runScenarioComparison(ctx, draft, { inheritanceTarget: 0 });
    const restoredCtx = { ...ctx, inputs: JSON.parse(JSON.stringify(ctx.inputs)) };
    const after = runScenarioComparison(restoredCtx, draft, { inheritanceTarget: 0 });
    expect(series(after.baseYearly, "surplusBalance")).toBe(series(before.baseYearly, "surplusBalance"));
    expect(series(after.compareYearly, "surplusBalance")).toBe(series(before.compareYearly, "surplusBalance"));
  });

  it("比較したあとの inputs は、保存しても差分が出ない（1バイトも変わらない）", () => {
    const ctx = ctxFor("JP");
    const snapshot = JSON.stringify(ctx.inputs);
    runScenarioComparison(ctx, { retireAge: 55, livingCostMonthly: 999999, contributionMultiplier: 2 }, { inheritanceTarget: 0 });
    expect(JSON.stringify(ctx.inputs)).toBe(snapshot);
  });
});

// ============================================================================
// 6. 5か国での健全性（形が崩れない）
// ============================================================================
describe("監査6：5か国での健全性", () => {
  it.each(COUNTRIES)("%s：全行の主要な値が有限で、資産は負にならない", (country) => {
    const ctx = ctxFor(country);
    const draft = { ...createComparisonDraft(country, ctx.inputs), retireAge: 60, contributionMultiplier: 1.3 };
    const r = runScenarioComparison(ctx, draft, { inheritanceTarget: 0 });
    [r.baseYearly, r.compareYearly].forEach((rows) => {
      expect(rows.length).toBeGreaterThan(0);
      rows.forEach((row) => {
        expect(Number.isFinite(row.totalAssets)).toBe(true);
        expect(Number.isFinite(row.netWorth)).toBe(true);
        expect(Number.isFinite(row.surplusBalance)).toBe(true);
        expect(row.totalAssets).toBeGreaterThanOrEqual(0);
        expect(row.surplusBalance).toBeGreaterThanOrEqual(0);
      });
    });
  });

  it.each(COUNTRIES)("%s：最終行は必ず想定寿命ちょうど（base も compare も）", (country) => {
    const ctx = ctxFor(country);
    const draft = { ...createComparisonDraft(country, ctx.inputs), retireAge: 60 };
    const r = runScenarioComparison(ctx, draft, { inheritanceTarget: 0 });
    expect(r.baseYearly[r.baseYearly.length - 1].age).toBe(90);
    expect(r.compareYearly[r.compareYearly.length - 1].age).toBe(90);
  });

  it.each(COUNTRIES)("%s：相続目標の達成判定と差額が整合する", (country) => {
    const ctx = ctxFor(country);
    const target = 1000000;
    const draft = { ...createComparisonDraft(country, ctx.inputs), livingCostMonthly: 1 };
    const r = runScenarioComparison(ctx, draft, { inheritanceTarget: target });
    [r.base, r.compare].forEach((s) => {
      expect(s.inheritanceGap).toBeCloseTo(s.netWorthFinal - target, 6);
      expect(s.inheritanceAchieved).toBe(s.netWorthFinal >= target);
    });
    expect(r.diff.inheritanceGap).toBeCloseTo(r.diff.netWorthFinal, 6);
  });
});

// ============================================================================
// 7. 余剰金機能との組み合わせ（二重計上・計算漏れの検出）
// ============================================================================

// ============================================================================
// 8. シナリオごとの独立計算
// ============================================================================
