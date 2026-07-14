// ============================================================================
// buildPlanInput.test.js（既存テストと同じリポジトリ直下に置く）
//
// Step 0（純粋関数への切り出し）の安全網。
// 「移設によって計算結果が変わっていないこと」と「5か国で例外が出ないこと」を守る。
// ============================================================================

import { describe, it, expect } from "vitest";
import { getCountryRules } from "./countryRules/index.js";
import { runIntegratedPlan } from "./lifePlanEngine.js";
import { DRAWDOWN_CATEGORIES, NISA_LIMITS } from "./utils/simulations.js";
import { buildPlanInput, buildScaledNisaPlan, readLivingCostMonthly } from "./utils/buildPlanInput.js";

const COUNTRIES = ["JP", "US", "GB", "CA", "AU"];

// 各国とも「積立あり・生活費あり・資産あり」の現実的な入力を作る。
// 全部0だと差が出ず、比較のテストとして意味を持たないため。
function makeInputs(country) {
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
  };
}

function ctxFor(country) {
  const inputs = makeInputs(country);
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

export { ctxFor, makeInputs, COUNTRIES };

describe("buildPlanInput（App.jsx からの切り出し）", () => {
  it.each(COUNTRIES)("%s：例外なく計画を組み立て、シミュレーションが走る", (country) => {
    const ctx = ctxFor(country);
    const result = runIntegratedPlan(buildPlanInput(ctx));
    expect(result.yearly.length).toBeGreaterThan(0);
    expect(Number.isFinite(result.finalNetWorth)).toBe(true);
    // 最終行は必ず想定寿命ちょうど
    expect(result.yearly[result.yearly.length - 1].age).toBe(90);
  });

  it.each(COUNTRIES)("%s：元の inputs を1バイトも変更しない", (country) => {
    const ctx = ctxFor(country);
    const before = JSON.stringify(ctx.inputs);
    buildPlanInput(ctx, { retireAge: 60, livingCostMonthly: 999999, contributionMultiplier: 1.5 });
    expect(JSON.stringify(ctx.inputs)).toBe(before);
  });

  it.each(COUNTRIES)("%s：上書きなし＝現在の入力値がそのまま使われる", (country) => {
    const ctx = ctxFor(country);
    const plan = buildPlanInput(ctx);
    expect(plan.retireAge).toBe(ctx.inputs.retireAge);
    expect(plan.livingCostMonthly).toBe(readLivingCostMonthly(country, ctx.inputs));
    expect(plan.deathAge).toBe(ctx.inputs.deathAge);
  });

  it.each(COUNTRIES)("%s：倍率1.0は上書きなしと完全に同一の結果になる（恒等性）", (country) => {
    const ctx = ctxFor(country);
    const a = runIntegratedPlan(buildPlanInput(ctx));
    const b = runIntegratedPlan(buildPlanInput(ctx, { contributionMultiplier: 1 }));
    expect(b.finalNetWorth).toBeCloseTo(a.finalNetWorth, 6);
  });

});

// ============================================================================
// 第2段階：銀行積立にも倍率が掛かる。
// 銀行は「基準年齢からの遡及計算」を持たず、残高を入力値からそのまま使うため、
// 月々の入金に倍率を掛けても現在残高は絶対に変わらない。
// ============================================================================
describe("第2段階：銀行積立の倍率", () => {
  const bankPools = (plan) => plan.pools.filter((p) => p.group === "bank");

  it.each(COUNTRIES)("%s：これから入金する分にだけ倍率が掛かる", (country) => {
    const ctx = ctxFor(country);
    const base = bankPools(buildPlanInput(ctx))[0];
    const boosted = bankPools(buildPlanInput(ctx, { contributionMultiplier: 1.5 }))[0];
    const reduced = bankPools(buildPlanInput(ctx, { contributionMultiplier: 0.8 }))[0];

    expect(base.monthlyContribution).toBeCloseTo(20000, 6);
    expect(boosted.monthlyContribution).toBeCloseTo(30000, 6);
    expect(reduced.monthlyContribution).toBeCloseTo(16000, 6);
  });

  it.each(COUNTRIES)("%s：現在の預金残高は倍率をどう変えても1円も動かない", (country) => {
    const ctx = ctxFor(country);
    for (const m of [0.8, 1.0, 1.2, 1.5]) {
      const pool = bankPools(buildPlanInput(ctx, { contributionMultiplier: m }))[0];
      expect(pool.balance).toBe(5000000); // 入力値そのまま。遡及計算は存在しない
    }
  });

  it("銀行の入金だけがある構成でも、倍率を上げれば退職時の資産が増える", () => {
    // 銀行以外の積立をすべて止め、銀行の効果だけを取り出す
    const ctx = ctxFor("JP");
    ctx.inputs.tsumitateSchedule = [];
    ctx.inputs.growthSchedule = [];
    ctx.inputs.gold.monthlyYen = 0;
    ctx.inputs.ideco.monthlyContribution = 0;

    const at = (m) => {
      const r = runIntegratedPlan(buildPlanInput(ctx, { contributionMultiplier: m }));
      return r.yearly.find((y) => y.age >= 65).netWorth;
    };
    expect(at(1.5)).toBeGreaterThan(at(1.0));
    expect(at(0.8)).toBeLessThan(at(1.0));
  });

  it("銀行口座が複数あっても、すべての口座に倍率が掛かる", () => {
    const ctx = ctxFor("JP");
    ctx.inputs.banks = [
      { name: "A", balance: 3000000, monthlyDeposit: 30000, interestPct: 0.1 },
      { name: "B", balance: 1000000, monthlyDeposit: 10000, interestPct: 0.02 },
    ];
    const pools = bankPools(buildPlanInput(ctx, { contributionMultiplier: 1.5 }));
    expect(pools).toHaveLength(2);
    expect(pools[0].monthlyContribution).toBeCloseTo(45000, 6);
    expect(pools[1].monthlyContribution).toBeCloseTo(15000, 6);
    expect(pools[0].balance).toBe(3000000); // 残高は両方とも不変
    expect(pools[1].balance).toBe(1000000);
  });

  it("元の inputs.banks は書き換えられない", () => {
    const ctx = ctxFor("JP");
    const before = JSON.stringify(ctx.inputs.banks);
    buildPlanInput(ctx, { contributionMultiplier: 1.5 });
    expect(JSON.stringify(ctx.inputs.banks)).toBe(before);
  });

  it("iDeCoの積立には、まだ倍率が掛からない（第4段階で対応）", () => {
    // ここを守らないと、iDeCoの「現在残高の遡及計算」が壊れ、
    // 現在のiDeCo残高そのものが変わってしまう。段階を分けている理由そのもの。
    const ctx = ctxFor("JP");
    const plan = buildPlanInput(ctx, { contributionMultiplier: 1.5 });
    expect(plan.pools.find((p) => p.id === "ideco").monthlyContribution).toBe(23000);
  });
});

// ============================================================================
// 第3段階：金積立にも倍率が掛かる。
// 金の現在評価額は App 側が「倍率をかけていない入力」から算出して渡してくるため、
// buildPlanInput が月々の積立に倍率を掛けても、現在の保有量・評価額は動かない。
// ============================================================================
describe("第3段階：金積立の倍率", () => {
  const goldPool = (plan) => plan.pools.find((p) => p.id === "gold");

  it.each(COUNTRIES)("%s：これから積み立てる分にだけ倍率が掛かる", (country) => {
    const ctx = ctxFor(country);
    expect(goldPool(buildPlanInput(ctx)).monthlyContribution).toBeCloseTo(10000, 6);
    expect(goldPool(buildPlanInput(ctx, { contributionMultiplier: 1.5 })).monthlyContribution).toBeCloseTo(15000, 6);
    expect(goldPool(buildPlanInput(ctx, { contributionMultiplier: 0.8 })).monthlyContribution).toBeCloseTo(8000, 6);
  });

  it.each(COUNTRIES)("%s：現在の金の評価額は倍率をどう変えても1円も動かない", (country) => {
    const ctx = ctxFor(country);
    for (const m of [0.8, 1.0, 1.2, 1.5]) {
      // goldCurrentValue は ctx から渡された値そのまま。ここで再計算はしない。
      expect(goldPool(buildPlanInput(ctx, { contributionMultiplier: m })).balance).toBe(ctx.goldCurrentValue);
    }
  });

  it("金の積立終了年齢は退職年齢に引きずられない（accumulateUntilAge が優先）", () => {
    const ctx = ctxFor("JP");
    ctx.inputs.gold.accumulateUntilAge = 70; // 退職65歳より後まで積み立てる設定
    const plan = buildPlanInput(ctx, { retireAge: 55, contributionMultiplier: 1.5 });
    expect(goldPool(plan).contribEndAge).toBe(70); // 退職を55歳にしても70歳のまま
  });

  it("accumulateUntilAge が未設定なら退職年齢まで積み立てる", () => {
    const ctx = ctxFor("JP");
    ctx.inputs.gold.accumulateUntilAge = 0; // 未設定扱い
    const plan = buildPlanInput(ctx, { retireAge: 60 });
    expect(goldPool(plan).contribEndAge).toBe(60);
  });

  it("金の積立だけがある構成でも、倍率を上げれば退職時の資産が増える", () => {
    const ctx = ctxFor("JP");
    ctx.inputs.tsumitateSchedule = [];
    ctx.inputs.growthSchedule = [];
    ctx.inputs.banks = [{ name: "main", balance: 5000000, monthlyDeposit: 0, interestPct: 0.1 }];
    ctx.inputs.ideco.monthlyContribution = 0;

    const at = (m) => {
      const r = runIntegratedPlan(buildPlanInput(ctx, { contributionMultiplier: m }));
      return r.yearly.find((y) => y.age >= 65).netWorth;
    };
    expect(at(1.5)).toBeGreaterThan(at(1.0));
    expect(at(0.8)).toBeLessThan(at(1.0));
  });

  it("元の inputs.gold は書き換えられない", () => {
    const ctx = ctxFor("JP");
    const before = JSON.stringify(ctx.inputs.gold);
    buildPlanInput(ctx, { contributionMultiplier: 1.5 });
    expect(JSON.stringify(ctx.inputs.gold)).toBe(before);
  });
});

// ============================================================================
// 積立倍率は「これから積み立てる分」にだけ掛かること。
// 現在年齢より前の積立・既に使ったNISA枠・現在資産は絶対に変わってはいけない。
// ============================================================================
describe("buildScaledNisaPlan：倍率は現在年齢以降にだけ掛かる", () => {
  const AGE = 40;
  const boundariesFor = (retireAge) => [retireAge, 65];

  // 過去（30歳）から現在（40歳）をまたいで将来（65歳）まで続くスケジュール
  const straddling = () => ({
    deathAge: 90,
    tsumitateSchedule: [{ fromAge: 30, toAge: 65, monthlyYen: 30000 }],
    growthSchedule: [{ fromAge: 30, toAge: 65, monthlyYen: 20000 }],
    lumpSums: [],
    tsumitateUsed: 0,
    growthUsed: 0,
  });

  const planFor = (m, inputs = straddling(), retireAge = 65) =>
    buildScaledNisaPlan({
      inputs,
      effectiveCurrentAge: AGE,
      retireAge,
      contributionMultiplier: m,
      boundaries: boundariesFor(retireAge),
    });

  it("現在年齢をまたぐスケジュールが、過去区間と将来区間に正しく分かれる", () => {
    const p = planFor(1.5);
    // 将来区間は現在年齢から始まる（過去は切り落とされている）
    expect(p.tsumitateSchedule).toHaveLength(1);
    expect(p.tsumitateSchedule[0].fromAge).toBe(AGE);
    expect(p.tsumitateSchedule[0].toAge).toBe(65);
    // 将来分だけ1.5倍になっている
    expect(p.tsumitateSchedule[0].monthlyYen).toBeCloseTo(30000 * 1.5, 6);
    expect(p.growthSchedule[0].monthlyYen).toBeCloseTo(20000 * 1.5, 6);
  });

  it("倍率1.5でも、現在年齢より前に使ったNISA枠は変わらない", () => {
    // 30歳→40歳の10年 × 12ヶ月 の実績。倍率をどう変えてもこの額は一定。
    const expectedTsumitate = 10 * 12 * 30000;
    const expectedGrowth = 10 * 12 * 20000;

    for (const m of [0.8, 1.0, 1.2, 1.5]) {
      const p = planFor(m);
      expect(p.tsumitateUsedForPlan).toBeCloseTo(expectedTsumitate, 6);
      expect(p.growthUsedForPlan).toBeCloseTo(expectedGrowth, 6);
    }
  });

  it("倍率1.0は旧実装と同一（過去分は使用枠へ、将来分は等倍）", () => {
    const p = planFor(1.0);
    expect(p.tsumitateSchedule[0].monthlyYen).toBe(30000);
    expect(p.growthSchedule[0].monthlyYen).toBe(20000);
    // 将来区間の fromAge は必ず現在年齢以上 → 二重計上が起きない
    p.tsumitateSchedule.forEach((r) => expect(r.fromAge).toBeGreaterThanOrEqual(AGE));
    p.growthSchedule.forEach((r) => expect(r.fromAge).toBeGreaterThanOrEqual(AGE));
  });

  it("現在年齢以降の積立だけが1.5倍になる（上限に当たらない水準では拠出総額が1.5倍）", () => {
    // 上限に当たらない水準にする。straddling() の月5万では、
    // 過去10年ぶんの使用枠600万を差し引くと生涯上限1800万の残り1200万に
    // 基準プランの時点で張り付いてしまい、倍率を上げても増えない
    // （＝上限が正しく効いている。下の上限テストで別途固定する）。
    const light = {
      ...straddling(),
      tsumitateSchedule: [{ fromAge: 30, toAge: 65, monthlyYen: 10000 }],
      growthSchedule: [{ fromAge: 30, toAge: 65, monthlyYen: 5000 }],
    };
    const base = planFor(1.0, light);
    const boosted = planFor(1.5, light);
    const sum = (p) => p.nisaPlan.byStep.reduce((s, v) => s + v, 0);

    // 過去分は byStep に一切現れない（byStep は現在年齢以降のステップのみ）
    expect(sum(base)).toBeCloseTo(25 * 12 * 15000, 4); // 40→65歳 × 月1.5万
    // 将来分だけが1.5倍になる
    expect(sum(boosted)).toBeCloseTo(sum(base) * 1.5, 4);
    // 過去に使った枠は倍率に関係なく同じ
    expect(boosted.tsumitateUsedForPlan).toBeCloseTo(base.tsumitateUsedForPlan, 6);
    expect(boosted.growthUsedForPlan).toBeCloseTo(base.growthUsedForPlan, 6);
  });

  it("完全に過去のスケジュールは、倍率を上げても将来の拠出を生まない", () => {
    const inputs = { ...straddling(), tsumitateSchedule: [{ fromAge: 30, toAge: 38, monthlyYen: 30000 }] };
    const p = planFor(1.5, inputs);
    expect(p.tsumitateSchedule).toHaveLength(0);          // 将来分は無い
    expect(p.tsumitateUsedForPlan).toBeCloseTo(8 * 12 * 30000, 6); // 使用枠は等倍のまま
  });

  it("年間上限は倍率適用後も有効（つみたて枠は年120万を超えない）", () => {
    // 月10万＝年120万でちょうど年間上限。1.5倍しても上限で頭打ちになる。
    const inputs = {
      ...straddling(),
      tsumitateSchedule: [{ fromAge: 40, toAge: 65, monthlyYen: 100000 }],
      growthSchedule: [],
    };
    const base = planFor(1.0, inputs);
    const boosted = planFor(1.5, inputs);
    const sum = (p) => p.nisaPlan.byStep.reduce((s, v) => s + v, 0);
    // 上限に張り付いているので、1.5倍にしても拠出総額は増えない
    expect(sum(boosted)).toBeCloseTo(sum(base), 4);
  });

  it("生涯上限は倍率適用後も有効（総額1800万円を超えない）", () => {
    const inputs = {
      ...straddling(),
      tsumitateSchedule: [{ fromAge: 40, toAge: 65, monthlyYen: 100000 }],
      growthSchedule: [{ fromAge: 40, toAge: 65, monthlyYen: 200000 }],
    };
    const boosted = planFor(1.5, inputs);
    const total = boosted.nisaPlan.tsumitateCum + boosted.nisaPlan.growthCum;
    expect(total).toBeLessThanOrEqual(NISA_LIMITS.totalLifetime + 1e-6);
    expect(boosted.nisaPlan.growthCum).toBeLessThanOrEqual(NISA_LIMITS.growthLifetime + 1e-6);
  });
});
