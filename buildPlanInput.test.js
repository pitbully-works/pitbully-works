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
import { surplusKindForCategory, SURPLUS_CATEGORIES } from "./utils/surplusLedger.js";
import { TRANSLATIONS } from "./translations/index.js";

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

});

// ============================================================================
// 第4段階：iDeCo積立にも倍率が掛かる。
//
// runIdecoSimulation は同じ monthlyContribution を「基準年齢→今日の遡及計算」と
// 「将来の積立」の両方に使っている。素直に倍率を掛けると現在のiDeCo残高そのものが
// 書き換わり、一時金・受取額まで狂う。そこで2回呼び、1回目で今日の残高を確定させ、
// 2回目で将来の掛金にだけ倍率を掛ける。ここではその境界を厳密に守らせる。
// ============================================================================
describe("第4段階：iDeCo積立の倍率", () => {
  const idecoPool = (plan) => plan.pools.find((p) => p.id === "ideco");

  // 基準年齢30歳（＝過去10年ぶんの遡及計算が発生する）iDeCo
  const withPastContributions = (ctx) => {
    ctx.inputs.ideco.asOfYears = 30;
    ctx.inputs.ideco.asOfMonths = 0;
    ctx.inputs.ideco.currentValue = 2000000; // 30歳時点の評価額
    ctx.inputs.ideco.startAge = 30;
    ctx.inputs.ideco.endAge = 60;
    ctx.inputs.ideco.monthlyContribution = 23000;
    return ctx;
  };

  it("これから拠出する分にだけ倍率が掛かる", () => {
    const ctx = ctxFor("JP");
    expect(idecoPool(buildPlanInput(ctx)).monthlyContribution).toBeCloseTo(23000, 6);
    expect(idecoPool(buildPlanInput(ctx, { contributionMultiplier: 1.5 })).monthlyContribution).toBeCloseTo(34500, 6);
    expect(idecoPool(buildPlanInput(ctx, { contributionMultiplier: 0.8 })).monthlyContribution).toBeCloseTo(18400, 6);
  });

  it("【最重要】基準年齢からの遡及計算で求めた「今日のiDeCo残高」が、倍率で1円も動かない", () => {
    // 30歳→40歳の10年ぶんを遡及計算した結果が、そのまま現在残高になる。
    // 倍率を掛けてしまうと、この過去10年の拠出まで1.5倍になって残高が跳ね上がる。
    const ctx = withPastContributions(ctxFor("JP"));
    const baseline = idecoPool(buildPlanInput(ctx)).balance;

    // 遡及計算が実際に効いていること（＝このテストが意味を持つこと）を先に確認する
    expect(baseline).toBeGreaterThan(2000000);

    for (const m of [0.8, 1.0, 1.2, 1.5]) {
      const balance = idecoPool(buildPlanInput(ctx, { contributionMultiplier: m })).balance;
      expect(balance).toBeCloseTo(baseline, 6);
    }
  });

  it("倍率1.0は、2回目を呼ばない1回目そのものと完全に一致する（恒等性）", () => {
    const ctx = withPastContributions(ctxFor("JP"));
    const a = runIntegratedPlan(buildPlanInput(ctx));
    const b = runIntegratedPlan(buildPlanInput(ctx, { contributionMultiplier: 1 }));
    expect(b.finalNetWorth).toBeCloseTo(a.finalNetWorth, 6);

    const pa = buildPlanInput(ctx);
    const pb = buildPlanInput(ctx, { contributionMultiplier: 1 });
    expect(pb.idecoLumpAmount).toBeCloseTo(pa.idecoLumpAmount, 6);
    expect(pb.idecoLumpAge).toBe(pa.idecoLumpAge);
  });

  it("将来の拠出が増えるので、一時金（受取額）は倍率を上げると増える", () => {
    const ctx = withPastContributions(ctxFor("JP"));
    ctx.inputs.ideco.payoutMethod = "lump";
    const lumpAt = (m) => buildPlanInput(ctx, { contributionMultiplier: m }).idecoLumpAmount;

    expect(lumpAt(1.5)).toBeGreaterThan(lumpAt(1.0));
    expect(lumpAt(0.8)).toBeLessThan(lumpAt(1.0));
    // 受取開始年齢は倍率で動かない（制度で決まる年齢のため）
    expect(buildPlanInput(ctx, { contributionMultiplier: 1.5 }).idecoLumpAge)
      .toBe(buildPlanInput(ctx).idecoLumpAge);
  });

  it("過去分が無い（基準年齢が未設定の）iDeCoでも、現在残高は倍率で動かない", () => {
    const ctx = ctxFor("JP");
    ctx.inputs.ideco.asOfYears = "";  // 遡及計算なし
    ctx.inputs.ideco.asOfMonths = "";
    ctx.inputs.ideco.currentValue = 2000000;
    for (const m of [0.8, 1.0, 1.5]) {
      expect(idecoPool(buildPlanInput(ctx, { contributionMultiplier: m })).balance).toBeCloseTo(2000000, 6);
    }
  });

  it("iDeCoの拠出終了年齢は、比較プランで退職年齢を変えても動かない", () => {
    // iDeCoは制度上、自身の endAge に従う。退職を早めても掛金の終了は早まらない。
    const ctx = withPastContributions(ctxFor("JP"));
    const plan = buildPlanInput(ctx, { retireAge: 55, contributionMultiplier: 1.5 });
    expect(idecoPool(plan).contribEndAge).toBe(60);
  });

  it("iDeCoの積立だけがある構成でも、倍率を上げれば想定寿命時点の資産が増える", () => {
    const ctx = withPastContributions(ctxFor("JP"));
    ctx.inputs.tsumitateSchedule = [];
    ctx.inputs.growthSchedule = [];
    ctx.inputs.gold.monthlyYen = 0;
    ctx.inputs.banks = [{ name: "main", balance: 5000000, monthlyDeposit: 0, interestPct: 0.1 }];

    const at = (m) => runIntegratedPlan(buildPlanInput(ctx, { contributionMultiplier: m })).finalNetWorth;
    expect(at(1.5)).toBeGreaterThan(at(1.0));
    expect(at(0.8)).toBeLessThan(at(1.0));
  });

  it("元の inputs.ideco は書き換えられない", () => {
    const ctx = withPastContributions(ctxFor("JP"));
    const before = JSON.stringify(ctx.inputs.ideco);
    buildPlanInput(ctx, { contributionMultiplier: 1.5 });
    expect(JSON.stringify(ctx.inputs.ideco)).toBe(before);
  });

  it.each(["US", "GB", "CA", "AU"])("%s：iDeCoプールは作られない（日本専用）", (country) => {
    const ctx = ctxFor(country);
    const plan = buildPlanInput(ctx, { contributionMultiplier: 1.5 });
    expect(idecoPool(plan)).toBe(undefined);
    expect(plan.idecoPoolId).toBe(null);
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

// ============================================================================
// 余剰金の「使う」台帳 → 一時支出の結線（第4段階4b）
//
// A案：余剰金は銀行預金プールの内訳ラベル。使う操作は surplusLedger（inputs の一部）に
// 記録し、buildPlanInput が consume だけをエンジンの oneTimeExpenses へ写す。
//   ・consume … 実消費。銀行プールから一度だけ引く＝総資産がその分だけ減る。
//   ・transfer … 預金へ回す/銀行へ戻す等。総資産不変のラベル移動なのでエンジンへ渡さない。
// UI（「使う」ボタン・使用履歴）は 4c。ここでは結線とデータ契約だけを固定する。
// ============================================================================
describe("余剰金の『使う』台帳 → 一時支出の結線（第4段階4b）", () => {
  const led = (over) => ({
    id: "x", age: 70, kind: "consume", category: "travel",
    amount: 300000, memo: "", source: "privatePension", ...over,
  });

  it("surplusLedger が無ければ oneTimeExpenses は空（後方互換）", () => {
    const plan = buildPlanInput(ctxFor("JP"));
    expect(Array.isArray(plan.oneTimeExpenses)).toBe(true);
    expect(plan.oneTimeExpenses).toHaveLength(0);
  });

  it("consume だけが oneTimeExpenses に写る（transfer は写らない）", () => {
    const ctx = ctxFor("JP");
    ctx.inputs.surplusLedger = [
      led({ id: "1", age: 70, kind: "consume", category: "travel", amount: 300000 }),
      led({ id: "2", age: 72, kind: "transfer", category: "toBank", amount: 500000 }),
      led({ id: "3", age: 75, kind: "consume", category: "car", amount: 1000000 }),
    ];
    const plan = buildPlanInput(ctx);
    expect(plan.oneTimeExpenses).toEqual([
      { age: 70, amount: 300000 },
      { age: 75, amount: 1000000 },
    ]);
  });

  it("consume は総資産を減らし（全年齢で base 以下）、transfer は総資産を1円も変えない", () => {
    const base = runIntegratedPlan(buildPlanInput(ctxFor("JP")));

    const ctxC = ctxFor("JP");
    ctxC.inputs.surplusLedger = [led({ id: "c", age: 66, kind: "consume", category: "car", amount: 100000 })];
    const withConsume = runIntegratedPlan(buildPlanInput(ctxC));

    const ctxT = ctxFor("JP");
    ctxT.inputs.surplusLedger = [led({ id: "t", age: 66, kind: "transfer", category: "toBank", amount: 100000 })];
    const withTransfer = runIntegratedPlan(buildPlanInput(ctxT));

    // consume：エンジンへ届いて銀行から引かれる。総資産は全年齢で base 以下（増えることはない）。
    expect(base.cumulativeOneTimeSpent).toBe(0);
    expect(withConsume.cumulativeOneTimeSpent).toBe(100000);
    withConsume.yearly.forEach((r, i) => {
      expect(r.totalAssets).toBeLessThanOrEqual(base.yearly[i].totalAssets + 1e-6);
    });
    // transfer：エンジンへ渡さないので総資産の系列は base と完全一致。
    expect(withTransfer.cumulativeOneTimeSpent).toBe(0);
    expect(JSON.stringify(withTransfer.yearly.map((r) => r.totalAssets)))
      .toBe(JSON.stringify(base.yearly.map((r) => r.totalAssets)));
  });

  it("category / memo / source はエンジンに渡らない（age・amount だけが使われる）", () => {
    const ctxA = ctxFor("JP");
    ctxA.inputs.surplusLedger = [led({ id: "a", age: 70, category: "travel", memo: "X", source: "idecoLump", amount: 200000 })];
    const ctxB = ctxFor("JP");
    ctxB.inputs.surplusLedger = [led({ id: "b", age: 70, category: "medical", memo: "Y", source: "publicPension", amount: 200000 })];
    const a = runIntegratedPlan(buildPlanInput(ctxA));
    const b = runIntegratedPlan(buildPlanInput(ctxB));
    // age・amount が同じなら、用途や発生源が違っても結果は完全一致。
    expect(JSON.stringify(a.yearly)).toBe(JSON.stringify(b.yearly));
  });

  it.each(COUNTRIES)("%s：台帳（consume＋transfer）があっても例外なく走り、不変条件が保たれる", (country) => {
    const ctx = ctxFor(country);
    ctx.inputs.surplusLedger = [
      led({ id: "1", age: 70, kind: "consume", category: "reform", amount: 500000 }),
      led({ id: "2", age: 72, kind: "transfer", category: "toNisa", amount: 300000 }),
    ];
    const res = runIntegratedPlan(buildPlanInput(ctx));
    expect(res.yearly.length).toBeGreaterThan(0);
    expect(Number.isFinite(res.finalNetWorth)).toBe(true);
    res.yearly.forEach((r) => {
      expect(Number.isFinite(r.totalAssets)).toBe(true);
      expect(r.totalAssets).toBeGreaterThanOrEqual(0);
    });
  });

  it("元の inputs.surplusLedger を1バイトも変更しない（読み取り専用）", () => {
    const ctx = ctxFor("JP");
    ctx.inputs.surplusLedger = [led({ id: "1", age: 70, kind: "consume", category: "travel", amount: 300000, memo: "旅行" })];
    const before = JSON.stringify(ctx.inputs.surplusLedger);
    buildPlanInput(ctx);
    expect(JSON.stringify(ctx.inputs.surplusLedger)).toBe(before);
  });
});

// ============================================================================
// 4c-1：余剰金を「使う」UI の土台（用途→種別の判定 ＋ 翻訳キー）
//
// 利用者は用途（category）だけを選び、種別（kind）は自動判定する。
// UI・buildPlanInput・テストが utils/surplusLedger.js の 1 つの判定を共有するので、
// 表示と計算がズレない。ここでは判定と翻訳キーの契約を固定する（UI 描画は 4c-2）。
// ============================================================================
describe("余剰金を使う：用途→種別の判定と翻訳キー（第4段階4c-1）", () => {
  it("用途 → 種別：toNisa / toBank は transfer、それ以外は consume", () => {
    expect(surplusKindForCategory("toNisa")).toBe("transfer");
    expect(surplusKindForCategory("toBank")).toBe("transfer");
    for (const c of ["living", "medical", "travel", "car", "reform", "other"]) {
      expect(surplusKindForCategory(c)).toBe("consume");
    }
    // 未知の用途は安全側（consume）に倒す
    expect(surplusKindForCategory("something-unknown")).toBe("consume");
  });

  it("用途の一覧は 8 種で、順序も期待どおり", () => {
    expect(SURPLUS_CATEGORIES).toEqual([
      "living", "medical", "travel", "car", "reform", "toNisa", "toBank", "other",
    ]);
  });

  it("全用途のラベルが ja / en に存在し、空でない", () => {
    for (const c of SURPLUS_CATEGORIES) {
      const key = "surplusCategory_" + c;
      expect(typeof TRANSLATIONS.ja[key]).toBe("string");
      expect(TRANSLATIONS.ja[key].length).toBeGreaterThan(0);
      expect(typeof TRANSLATIONS.en[key]).toBe("string");
      expect(TRANSLATIONS.en[key].length).toBeGreaterThan(0);
    }
  });

  it("使う UI のラベルが ja / en に存在し、空でない", () => {
    const keys = [
      "surplusUseTitle", "surplusUseAmountPlaceholder", "surplusUseAgePlaceholder",
      "surplusUseCategoryLabel", "surplusUseMemoPlaceholder", "surplusUseAddButton",
      "surplusHistoryTitle", "surplusHistoryEmpty", "surplusTransferNote",
      "surplusConsumeTag", "surplusTransferTag",
    ];
    for (const k of keys) {
      expect(typeof TRANSLATIONS.ja[k]).toBe("string");
      expect(TRANSLATIONS.ja[k].length).toBeGreaterThan(0);
      expect(typeof TRANSLATIONS.en[k]).toBe("string");
      expect(TRANSLATIONS.en[k].length).toBeGreaterThan(0);
    }
  });

  it("en-GB は NISA→ISA を上書きし、それ以外の用途は en を継承する", () => {
    expect(TRANSLATIONS["en-GB"].surplusCategory_toNisa).toBe("Move to ISA");
    // 上書きしていない用途は en の値をそのまま継承
    expect(TRANSLATIONS["en-GB"].surplusCategory_toBank).toBe(TRANSLATIONS.en.surplusCategory_toBank);
    expect(TRANSLATIONS["en-GB"].surplusCategory_living).toBe(TRANSLATIONS.en.surplusCategory_living);
  });
});
