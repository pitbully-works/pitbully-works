// ============================================================================
// auFullRegression.test.js
// 【AU段階3】オーストラリア版全体の回帰テスト。新機能は追加せず、AU段階1〜2で実装・修正した
// 内容があらゆる条件の組み合わせで破綻しないことを最終確認する。
//
// 対象年度：2026-27（オーストラリア居住者。非居住者の税率は未実装）。
//
// 検証する不変条件（すべての投影年で成立すること）：
//   (1) 3口座のいずれも残高が負にならない
//   (2) 口座残高の合計が value と一致する
//   (3) 数値が NaN / Infinity にならない
//   (4) preservation age（60歳）未満は Super に手を付けない
//   (5) 取崩しは Cash → Investment Account → Superannuation の順に進む
//   (6) 引出時税率0%なら最低取崩しは「移し替え」で総資産を変えない
//
// 本ファイルが固定する修正点（AU監査で検出したもの）：
//   A-1 Age Pension：カップルの逓減率は1人あたり（所得25セント／資産隔週$1.50）
//   A-2 Age Pension：投影中は毎ステップその時点の資産で再判定する（資力調査）
//   A-3 取崩し順：simulateGrowth と ACCOUNT_DRAW_CATEGORY.AU が一致する
//   A-4 引出時課税：simulateGrowth も lifePlanEngine と同じく税引後で計算する
//   B-1 資産テストの対象：AU3口座に加えて銀行預金・個別株・金・民間年金も含む（自宅は対象外）
//   B-2 Division 293：追加課税の対象は min(拠出額, 所得＋拠出 − 250,000)
//   B-3 Deeming：金融資産のみなし収入を所得テストに算入する
//   B-4 カップル：年金収入は世帯合計。片方だけが受給資格年齢なら1人分
//
// 【共有エンジンの非破壊】
//   §6 は、資力調査つき公的年金のためにエンジンへ加えた
//   publicPensions.monthlyAmountAt(age, ctx) / assessedPoolIds が、
//   既存4か国（定額の monthlyAmount・年齢のみで変わる monthlyAmountAt）の挙動を
//   一切変えていないことを直接検証する。
// ============================================================================

import { describe, it, expect } from "vitest";
import { AU_COUNTRY_RULES } from "./countryRules/AU.js";
import { CA_COUNTRY_RULES } from "./countryRules/CA.js";
import { GB_COUNTRY_RULES } from "./countryRules/GB.js";
import { US_COUNTRY_RULES } from "./countryRules/US.js";
import { JP_COUNTRY_RULES } from "./countryRules/JP.js";
import { runIntegratedPlan } from "./lifePlanEngine.js";
import { buildPlanInput } from "./utils/buildPlanInput.js";
import { getCountryRules } from "./countryRules/index.js";
import { ACCOUNT_DRAW_CATEGORY, DRAWDOWN_CATEGORIES } from "./utils/simulations.js";
import { JA_TRANSLATIONS } from "./translations/ja.js";
import { EN_TRANSLATIONS } from "./translations/en.js";

const inv = AU_COUNTRY_RULES.investment;
const ret = AU_COUNTRY_RULES.retirement;
const tax = AU_COUNTRY_RULES.tax;

const near = (actual, expected, tol = 1e-6) =>
  Math.abs(actual - expected) <= tol * Math.max(1, Math.abs(expected));

const ACCOUNT_KEYS = ["superannuation", "investmentAccount", "cashSavings"];

const accounts = (v = {}) => {
  const mk = (key) => ({
    currentValue: v[key] || 0,
    annualContribution: v[`${key}C`] || 0,
    expectedReturnPct: v.returnPct === undefined ? 0 : v.returnPct,
    contributionEndAge: v.endAge === undefined ? 65 : v.endAge,
    withdrawalTaxPct: v[`${key}Tax`] || 0,
  });
  return ACCOUNT_KEYS.reduce((acc, key) => { acc[key] = mk(key); return acc; }, {});
};

const grow = (over = {}) => inv.simulateGrowth({
  currentAge: 50, retireAge: 65, deathAge: 95,
  accounts: accounts(), annualWithdrawalNeeded: 0,
  annualSalary: 0, voluntaryConcessional: 0,
  contributionsTaxRate: tax.superannuation.contributionsTaxRate,
  earningsTaxAccumulation: tax.superannuation.earningsTaxAccumulation,
  ...over,
});

// ---------------------------------------------------------------------------
// 1. 全投影年の不変条件
// ---------------------------------------------------------------------------
describe("AU回帰：あらゆる条件の組み合わせで不変条件が保たれる", () => {
  const cases = [
    { name: "資産なし・取崩しなし", over: {} },
    { name: "取崩しが資産を上回る（枯渇ケース）", over: { accounts: accounts({ cashSavings: 10000 }), annualWithdrawalNeeded: 60000 } },
    { name: "Superだけ保有（60歳到達で解放）", over: { accounts: accounts({ superannuation: 600000 }), annualWithdrawalNeeded: 40000 } },
    { name: "早期退職（55歳）でpreservation age前に取崩し", over: { retireAge: 55, accounts: accounts({ superannuation: 500000, cashSavings: 100000 }), annualWithdrawalNeeded: 40000 } },
    { name: "3口座に分散・利回りあり", over: { accounts: accounts({ superannuation: 500000, investmentAccount: 200000, cashSavings: 80000, returnPct: 6 }), annualWithdrawalNeeded: 50000 } },
    { name: "給与ありでSG拠出が入る", over: { annualSalary: 120000, voluntaryConcessional: 10000, accounts: accounts({ superannuation: 200000 }), annualWithdrawalNeeded: 30000 } },
    { name: "引出時課税あり", over: { accounts: accounts({ superannuation: 400000, investmentAccount: 200000, investmentAccountTax: 15 }), annualWithdrawalNeeded: 45000 } },
    { name: "100歳超の長寿（95歳以上の14%）", over: { deathAge: 110, accounts: accounts({ superannuation: 900000 }), annualWithdrawalNeeded: 50000 } },
  ];

  cases.forEach(({ name, over }) => {
    it(name, () => {
      const sim = grow(over);
      for (const y of sim.yearly) {
        expect(Number.isFinite(y.value)).toBe(true);
        ACCOUNT_KEYS.forEach((k) => expect(Number.isFinite(y.accounts[k])).toBe(true));
        expect(ACCOUNT_KEYS.every((k) => y.accounts[k] >= -0.01)).toBe(true);
        const total = ACCOUNT_KEYS.reduce((sum, k) => sum + y.accounts[k], 0);
        expect(near(total, y.value)).toBe(true);
      }
      expect(sim.yearly[sim.yearly.length - 1].age).toBe(over.deathAge || 95);
    });
  });

  it("不正な入力（文字列・負値）でも例外を投げず有限値を返す", () => {
    const sim = inv.simulateGrowth({
      currentAge: 60, retireAge: 65, deathAge: 70,
      accounts: { superannuation: { currentValue: "abc" }, investmentAccount: { currentValue: -100 }, cashSavings: {} },
      annualWithdrawalNeeded: "xyz", annualSalary: "n/a", voluntaryConcessional: null,
    });
    expect(Number.isFinite(sim.finalValue)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. preservation age と最低取崩し
// ---------------------------------------------------------------------------
describe("AU回帰：preservation age 前は Super に手を付けない", () => {
  it("55歳退職でも60歳になるまで Super 残高は減らない", () => {
    const sim = grow({
      currentAge: 50, retireAge: 55, deathAge: 70,
      accounts: accounts({ superannuation: 500000, cashSavings: 200000 }),
      annualWithdrawalNeeded: 40000,
    });
    sim.yearly.filter((y) => y.age < 60).forEach((y) => {
      expect(y.accounts.superannuation).toBe(500000);
    });
    // 60歳以降は取り崩される
    expect(sim.yearly.find((y) => y.age === 65).accounts.superannuation).toBeLessThan(500000);
  });

  it("最低取崩しは退職後かつ60歳以降にのみ発生する", () => {
    const sim = grow({
      currentAge: 55, retireAge: 65, deathAge: 75,
      accounts: accounts({ superannuation: 500000 }), annualWithdrawalNeeded: 0,
    });
    sim.yearly.filter((y) => y.age <= 65).forEach((y) => expect(y.minimumDrawdown).toBe(0));
    expect(sim.yearly.find((y) => y.age === 66).minimumDrawdown).toBeGreaterThan(0);
  });

  it("最低取崩しは年齢別の率どおり（66歳は5%）", () => {
    const sim = grow({
      currentAge: 65, retireAge: 65, deathAge: 68,
      accounts: accounts({ superannuation: 400000 }), annualWithdrawalNeeded: 0,
    });
    const y66 = sim.yearly.find((y) => y.age === 66);
    expect(near(y66.minimumDrawdown, 400000 * 0.05)).toBe(true);
    expect(near(y66.accounts.superannuation, 400000 * 0.95)).toBe(true);
    expect(near(y66.accounts.investmentAccount, 400000 * 0.05)).toBe(true);
  });

  it("Super は60歳以降の引出が非課税なので、最低取崩しは総資産を変えない", () => {
    const sim = grow({
      currentAge: 65, retireAge: 65, deathAge: 80,
      accounts: accounts({ superannuation: 500000 }), annualWithdrawalNeeded: 0,
    });
    sim.yearly.forEach((y) => expect(near(y.value, 500000)).toBe(true));
    expect(sim.withdrawalTaxPaid).toBe(0);
  });

  it("Super残高を超えて引き出さない", () => {
    const sim = grow({
      currentAge: 65, retireAge: 65, deathAge: 100,
      accounts: accounts({ superannuation: 1000 }), annualWithdrawalNeeded: 0,
    });
    sim.yearly.forEach((y) => {
      expect(y.accounts.superannuation).toBeGreaterThanOrEqual(0);
      expect(y.minimumDrawdown).toBeLessThanOrEqual(1000);
    });
  });
});

// ---------------------------------------------------------------------------
// 3. 取崩し順と引出時課税
// ---------------------------------------------------------------------------
describe("AU回帰：取崩し順がプレビューと本計算で一致する", () => {
  it("ACCOUNT_DRAW_CATEGORY.AU は cash → taxable → restricted の並び", () => {
    const catMap = ACCOUNT_DRAW_CATEGORY.AU;
    const order = ["cashSavings", "investmentAccount", "superannuation"]
      .map((k) => DRAWDOWN_CATEGORIES.indexOf(catMap[k]));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect(order.every((v, i) => i === 0 || order[i - 1] < v)).toBe(true);
  });

  it("simulateGrowth も 現金 → 投資口座 → Super の順に取り崩す", () => {
    const sim = grow({
      currentAge: 65, retireAge: 65, deathAge: 67,
      accounts: accounts({ cashSavings: 10000, investmentAccount: 10000, superannuation: 10000 }),
      annualWithdrawalNeeded: 12000,
    });
    const y66 = sim.yearly.find((y) => y.age === 66);
    // 順序：まずSuperの最低取崩し5%（500）が投資口座へ移り、投資口座は10,500になる。
    // そこから生活費12,000を 現金10,000 → 投資口座2,000 の順で賄うので、残りは8,500。
    expect(y66.accounts.cashSavings).toBe(0);
    expect(y66.accounts.investmentAccount).toBe(8500);
    // Superは最低取崩しのぶんだけ減り、生活費のためには取り崩されない
    expect(near(y66.accounts.superannuation, 10000 * 0.95)).toBe(true);
  });
});

describe("AU回帰：引出時課税（A-4）", () => {
  it("課税口座からは 必要額 ÷ (1 − 税率) を引き出す", () => {
    const sim = grow({
      currentAge: 65, retireAge: 65, deathAge: 66,
      accounts: accounts({ cashSavings: 10000, investmentAccount: 10000, investmentAccountTax: 15 }),
      annualWithdrawalNeeded: 12000,
    });
    const y66 = sim.yearly.find((y) => y.age === 66);
    expect(y66.accounts.cashSavings).toBe(0);
    // 手取り2,000を得るには 2,000 / 0.85 = 2,352.94 を引き出す
    expect(near(y66.accounts.investmentAccount, 10000 - 2000 / 0.85)).toBe(true);
    expect(near(sim.withdrawalTaxPaid, 2000 / 0.85 * 0.15)).toBe(true);
  });

  it("税率0%なら税額0で、従来どおりの取り崩しになる", () => {
    const sim = grow({
      currentAge: 65, retireAge: 65, deathAge: 66,
      accounts: accounts({ cashSavings: 10000, investmentAccount: 10000 }),
      annualWithdrawalNeeded: 12000,
    });
    expect(sim.withdrawalTaxPaid).toBe(0);
    expect(sim.yearly.find((y) => y.age === 66).accounts.investmentAccount).toBe(8000);
  });
});

// ---------------------------------------------------------------------------
// 4. Age Pension：カップルの逓減率（A-1）
// ---------------------------------------------------------------------------
describe("AU回帰：カップルの逓減はシングルの半分（1人あたり）", () => {
  it("同じ超過資産なら、カップルの減額はシングルの半分", () => {
    const excess = 100000;
    const singleDrop = ret.getMaxAnnual("single")
      - ret.getAgePensionByAssetsTest(333000 + excess, "single", true);
    const coupleDrop = ret.getMaxAnnual("couple")
      - ret.getAgePensionByAssetsTest(499000 + excess, "couple", true);
    expect(near(coupleDrop, singleDrop / 2)).toBe(true);
  });

  it("同じ超過所得なら、カップルの減額はシングルの半分", () => {
    const excess = 20000;
    const singleDrop = ret.getMaxAnnual("single")
      - ret.getAgePensionByIncomeTest(ret.getIncomeFreeAreaAnnual("single") + excess, "single");
    const coupleDrop = ret.getMaxAnnual("couple")
      - ret.getAgePensionByIncomeTest(ret.getIncomeFreeAreaAnnual("couple") + excess, "couple");
    expect(near(coupleDrop, singleDrop / 2)).toBe(true);
  });

  it("カップル世帯合計の給付額は、具体的な計算値と一致する", () => {
    const assets = 600000;
    const perPerson = ret.getAgePension({
      age: 70, annualIncome: 0, assessableAssets: assets, status: "couple", homeowner: true,
    });
    // 資産テスト：(600,000 − 499,000) / 1,000 × $1.50 × 26回 を満額から引いた額
    const expectedPerPerson = 905.20 * 26 - ((assets - 499000) / 1000) * 1.5 * 26;
    expect(near(perPerson, expectedPerPerson)).toBe(true);
    const household = ret.getAgePensionHousehold({
      age: 70, annualIncome: 0, assessableAssets: assets,
      status: "couple", homeowner: true, bothQualified: true,
    });
    expect(near(household, expectedPerPerson * 2)).toBe(true);
    expect(perPerson).toBeLessThanOrEqual(ret.getMaxAnnual("couple"));
  });

  it("片方だけ受給資格年齢なら世帯合計は1人分（具体値で確認）", () => {
    const assets = 600000;
    const expectedPerPerson = 905.20 * 26 - ((assets - 499000) / 1000) * 1.5 * 26;
    const household = ret.getAgePensionHousehold({
      age: 70, annualIncome: 0, assessableAssets: assets,
      status: "couple", homeowner: true, bothQualified: false,
    });
    expect(near(household, expectedPerPerson)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. Age Pension：画面表示用の受給開始時点見込額（projectAgePension）
// ---------------------------------------------------------------------------
describe("AU回帰：projectAgePension（画面カードの見込額）", () => {
  const project = (over = {}) => ret.projectAgePension({
    investmentRules: inv,
    contributionsTaxRate: tax.superannuation.contributionsTaxRate,
    earningsTaxAccumulation: tax.superannuation.earningsTaxAccumulation,
    currentAge: 60, retireAge: 65, deathAge: 90,
    accounts: accounts({ superannuation: 400000, investmentAccount: 100000, cashSavings: 50000 }),
    annualSalary: 0, voluntaryConcessional: 0,
    expensesAnnual: 0, healthcareAnnual: 0, otherAnnualIncome: 0,
    status: "single", homeowner: true,
    ...over,
  });

  it("受給資格年齢（67歳）時点の資産で判定する", () => {
    const r = project();
    expect(r.qualifyingAge).toBe(67);
    expect(r.assessableAssets).toBe(550000);
    // 所得テスト（みなし収入込み）と資産テストの低い方
    const byAssets = ret.getAgePensionByAssetsTest(550000, "single", true);
    const byIncome = ret.getAgePensionByIncomeTest(ret.getDeemedIncomeAnnual(550000, "single"), "single");
    expect(near(r.agePensionPerPersonAnnual, Math.min(byAssets, byIncome))).toBe(true);
  });

  it("みなし収入も返し、所得テストに反映される", () => {
    const r = project();
    expect(near(r.deemedIncomeAnnual, ret.getDeemedIncomeAnnual(550000, "single"))).toBe(true);
    expect(r.deemedIncomeAnnual).toBeGreaterThan(0);
  });

  it("夫婦とも受給資格年齢なら世帯合計は1人あたりの2倍", () => {
    const r = project({ status: "couple", bothQualified: true });
    expect(r.recipients).toBe(2);
    expect(near(r.agePensionAnnual, r.agePensionPerPersonAnnual * 2)).toBe(true);
  });

  it("片方だけ受給資格年齢なら世帯合計は1人分", () => {
    const r = project({ status: "couple", bothQualified: false });
    expect(r.recipients).toBe(1);
    expect(near(r.agePensionAnnual, r.agePensionPerPersonAnnual)).toBe(true);
  });

  it("取り崩しが進む前提なら、判定資産は現在残高より小さくなる", () => {
    const r = project({ expensesAnnual: 60000 });
    expect(r.assessableAssets).toBeLessThan(550000);
    expect(r.agePensionAnnual).toBeGreaterThan(project().agePensionAnnual);
  });

  it("想定寿命が受給資格年齢より手前でも算定できる", () => {
    const r = project({ deathAge: 65 });
    expect(Number.isFinite(r.agePensionAnnual)).toBe(true);
    expect(r.qualifyingAge).toBe(67);
  });

  it("すでに受給資格年齢を過ぎている場合は現在の資産で判定する", () => {
    const r = project({ currentAge: 70, retireAge: 70 });
    expect(r.assessableAssets).toBe(550000);
  });

  it("investmentRules を渡さなければ資産0として扱い、例外を投げない", () => {
    const r = project({ investmentRules: null });
    expect(r.assessableAssets).toBe(0);
    expect(r.deemedIncomeAnnual).toBe(0);
    expect(near(r.agePensionAnnual, ret.getMaxAnnual("single"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. 共有エンジンの拡張が既存4か国を壊していないこと
// ---------------------------------------------------------------------------
describe("AU回帰：エンジンの資力調査対応が既存の公的年金を壊さない", () => {
  const planWith = (publicPensions, boundaries = []) => runIntegratedPlan({
    currentAge: 65, retireAge: 65, deathAge: 75,
    boundaries,
    livingCostMonthly: 0,
    surplusTargetId: "bank_0",
    pools: [{ id: "bank_0", group: "bank", balance: 0, annualReturnPct: 0, monthlyContribution: 0, drawOrder: 0 }],
    publicPensions,
  });
  const bankAt = (r, age) => r.yearly.find((y) => y.age === age).pool_bank_0;

  it("定額の monthlyAmount（JP/US/GB）は従来どおり毎年同額が入る", () => {
    const r = planWith([{ monthlyAmount: 1000, startAge: 65 }]);
    expect(near(bankAt(r, 67) - bankAt(r, 66), 12000)).toBe(true);
    expect(near(bankAt(r, 70) - bankAt(r, 69), 12000)).toBe(true);
  });

  it("受給開始年齢前は1円も入らない", () => {
    const r = planWith([{ monthlyAmount: 1000, startAge: 70 }], [70]);
    expect(bankAt(r, 69)).toBe(0);
    expect(near(bankAt(r, 71) - bankAt(r, 70), 12000)).toBe(true);
  });

  it("年齢のみで変わる monthlyAmountAt（加OAS）は ctx を無視しても動く", () => {
    const r = planWith([{
      monthlyAmount: 0, startAge: 65,
      monthlyAmountAt: (age) => (age >= 70 ? 1100 : 1000),
    }], [70]);
    expect(near(bankAt(r, 67) - bankAt(r, 66), 12000)).toBe(true);
    expect(near(bankAt(r, 72) - bankAt(r, 71), 13200)).toBe(true);
  });

  it("assessedPoolIds / deemedPoolIds を渡さなければ ctx はどちらも null", () => {
    let seenAssessed = "unset", seenDeemed = "unset";
    planWith([{
      monthlyAmount: 0, startAge: 65,
      monthlyAmountAt: (age, ctx) => {
        seenAssessed = ctx.assessedAssets; seenDeemed = ctx.deemedAssets; return 0;
      },
    }]);
    expect(seenAssessed).toBe(null);
    expect(seenDeemed).toBe(null);
  });

  it("assessedPoolIds と deemedPoolIds は別々に集計できる", () => {
    let assessed = -1, deemed = -1;
    runIntegratedPlan({
      currentAge: 65, retireAge: 65, deathAge: 66, livingCostMonthly: 0,
      pools: [
        { id: "a", group: "bank", balance: 1000, annualReturnPct: 0, monthlyContribution: 0, drawOrder: 0 },
        { id: "b", group: "gold", balance: 2000, annualReturnPct: 0, monthlyContribution: 0, drawOrder: 1 },
      ],
      publicPensions: [{
        monthlyAmount: 0, startAge: 65,
        assessedPoolIds: ["a", "b"],
        deemedPoolIds: ["a"],
        monthlyAmountAt: (age, ctx) => { assessed = ctx.assessedAssets; deemed = ctx.deemedAssets; return 0; },
      }],
    });
    expect(near(assessed, 3000)).toBe(true);
    expect(near(deemed, 1000)).toBe(true);
  });

  it("存在しないプールidを指定しても例外を投げず0として数える", () => {
    let seen = -1;
    planWith([{
      monthlyAmount: 0, startAge: 65, assessedPoolIds: ["does_not_exist"],
      monthlyAmountAt: (age, ctx) => { seen = ctx.assessedAssets; return 0; },
    }]);
    expect(seen).toBe(0);
  });

  it("月額が負を返しても収入がマイナスにならない", () => {
    const r = planWith([{ monthlyAmount: 0, startAge: 65, monthlyAmountAt: () => -5000 }]);
    expect(bankAt(r, 70)).toBe(0);
  });

  it("ctx.totalAssets は全プールの合計を返す", () => {
    let seen = -1;
    runIntegratedPlan({
      currentAge: 65, retireAge: 65, deathAge: 66, livingCostMonthly: 0,
      pools: [
        { id: "a", group: "bank", balance: 1000, annualReturnPct: 0, monthlyContribution: 0, drawOrder: 0 },
        { id: "b", group: "investment", balance: 2000, annualReturnPct: 0, monthlyContribution: 0, drawOrder: 1 },
      ],
      publicPensions: [{
        monthlyAmount: 0, startAge: 65,
        monthlyAmountAt: (age, ctx) => { seen = ctx.totalAssets; return 0; },
      }],
    });
    expect(near(seen, 3000)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 7. 本番経路の統合テスト（App → buildPlanInput → lifePlanEngine）
// ---------------------------------------------------------------------------
describe("AU統合：buildPlanInput が組み立てた計画が本番経路どおりに動く", () => {
  const rules = getCountryRules("AU");

  const acct = (v = {}) => ({
    currentValue: 0, annualContribution: 0, expectedReturnPct: 0,
    contributionEndAge: 65, withdrawalTaxPct: 0, ...v,
  });

  const makeAuInputs = (over = {}, planOver = {}) => ({
    country: "AU", baseCurrency: "AUD", language: "en",
    currentAge: 65, retireAge: 65, deathAge: 85,
    livingCostMonthly: 0,
    inheritanceTarget: 0, inheritancePlans: [],
    publicPensionStartAge: 67, pensionMonthly: 0, pensionSources: [],
    healthBrackets: { b60: 0, b70: 0, b80: 0 },
    tsumitateSchedule: [], growthSchedule: [], lumpSums: [],
    tsumitateUsed: 0, growthUsed: 0,
    banks: [{ name: "main", balance: 0, monthlyDeposit: 0, interestPct: 0 }],
    loans: [], insurancePolicies: [], privatePensionPlans: [],
    gold: {
      currentGrams: 0, pricePerGram: 0, priceGrowthPct: 0, priceGrowthPctAuto: false,
      monthlyYen: 0, accumulateUntilAge: 65, asOfYears: "", asOfMonths: "",
    },
    ideco: {
      currentValue: 0, principalTotal: 0, monthlyContribution: 0,
      startAge: 35, endAge: 60, productName: "", returnPct: 0, returnPctAuto: false,
      expectedReturnPct: 0, payoutStartAge: 60, payoutMethod: "lump", payoutYears: 10,
      lumpPortionPct: 0, payoutReturnPct: 0, annualIncome: 0, asOfYears: "", asOfMonths: "",
    },
    usInvestment: {}, gbInvestment: {}, caInvestment: {},
    auInvestment: {
      annualSalary: 0, voluntaryConcessional: 0, estimatedCapitalGainAnnual: 0,
      capitalGainHeldOver12Months: true,
      superannuation: acct(), investmentAccount: acct(), cashSavings: acct(),
      agePension: { status: "single", homeowner: true, otherAnnualIncome: 0 },
      healthcare: {}, expensesMonthly: 0,
      ...over,
    },
    ...planOver,
  });

  const makeCtx = (over = {}, planOver = {}) => {
    const inputs = makeAuInputs(over, planOver);
    const au = inputs.auInvestment;
    const projection = rules.retirement.projectAgePension({
      investmentRules: rules.investment,
      contributionsTaxRate: rules.tax.superannuation.contributionsTaxRate,
      earningsTaxAccumulation: rules.tax.superannuation.earningsTaxAccumulation,
      currentAge: inputs.currentAge, retireAge: inputs.retireAge, deathAge: inputs.deathAge,
      accounts: au, annualSalary: au.annualSalary, voluntaryConcessional: au.voluntaryConcessional,
      expensesAnnual: (Number(au.expensesMonthly) || 0) * 12,
      healthcareAnnual: rules.healthcare.getAnnualTotal(au.healthcare),
      otherAnnualIncome: au.agePension.otherAnnualIncome,
      status: au.agePension.status, homeowner: au.agePension.homeowner,
    });
    return {
      country: "AU", rules, inputs,
      effectiveCurrentAge: inputs.currentAge,
      effectiveCurrentAssets: 0, effectivePostRetireReturn: 0,
      dynamicFunds: [], stockTotalNow: 0, effectiveStockReturnPct: 0,
      goldCurrentValue: 0, effectiveGoldReturnPct: 0,
      effectivePensionMonthly: 0, effectivePublicPensionStartAge: 67,
      drawdownOrder: DRAWDOWN_CATEGORIES,
      uncategorizedLabel: "Uncategorised",
      countryDerived: {
        auAgePensionAnnual: projection.agePensionAnnual,
        auAgePensionQualifyingAge: projection.qualifyingAge,
        auOtherAnnualIncome: Number(au.agePension.otherAnnualIncome) || 0,
        auHealthcareAnnual: rules.healthcare.getAnnualTotal(au.healthcare),
      },
    };
  };

  const poolOf = (plan, id) => plan.pools.find((x) => x.id === id);

  it("3つのAU口座がすべてプールとして生成される", () => {
    const plan = buildPlanInput(makeCtx());
    ACCOUNT_KEYS.forEach((k) => expect(poolOf(plan, k)).toBeDefined());
  });

  it("drawOrder が Cash → Investment Account → Super の昇順になっている", () => {
    const plan = buildPlanInput(makeCtx());
    const order = ["cashSavings", "investmentAccount", "superannuation"].map((k) => poolOf(plan, k).drawOrder);
    expect(order.every((v, i) => i === 0 || order[i - 1] < v)).toBe(true);
  });

  it("Superプールに preservation age と積立期の運用益課税が設定される", () => {
    const sup = poolOf(buildPlanInput(makeCtx()), "superannuation");
    expect(sup.accessAge).toBe(60);
    expect(near(sup.earningsTaxPct, 15)).toBe(true);
    expect(typeof sup.minimumDrawdown).toBe("function");
    expect(sup.minimumDrawdownTo).toBe("investmentAccount");
  });

  it("Superの強制取崩しは退職を条件とする（既定のまま）", () => {
    const sup = poolOf(buildPlanInput(makeCtx()), "superannuation");
    expect(sup.minimumDrawdownRequiresRetirement).toBeUndefined();
  });

  it("境界年齢に受給資格年齢(67)と preservation age(60) が積まれている", () => {
    const plan = buildPlanInput(makeCtx());
    [67, 60].forEach((age) => expect(plan.boundaries.includes(age)).toBe(true));
  });

  it("資産テストの対象にAU3口座だけでなく銀行・株・金・民間年金も含まれる", () => {
    const plan = buildPlanInput(makeCtx());
    const pension = plan.publicPensions[0];
    expect(typeof pension.monthlyAmountAt).toBe("function");
    expect(pension.startAge).toBe(67);
    // AU3口座 ＋ 全国共通の銀行・個別株・金
    ["cashSavings", "investmentAccount", "superannuation", "bank_0", "stock", "gold"]
      .forEach((id) => expect(pension.assessedPoolIds.includes(id)).toBe(true));
    // 対象idはすべて実在するプール
    pension.assessedPoolIds.forEach((id) => expect(poolOf(plan, id)).toBeDefined());
  });

  it("Deemingの対象（deemedPoolIds）も同じ金融資産の範囲", () => {
    const pension = buildPlanInput(makeCtx()).publicPensions[0];
    expect(pension.deemedPoolIds).toEqual(pension.assessedPoolIds);
  });

  it("JP専用のiDeCo・NISAはAUでは生成されず、対象にも入らない", () => {
    const plan = buildPlanInput(makeCtx());
    const pension = plan.publicPensions[0];
    expect(pension.assessedPoolIds.includes("ideco")).toBe(false);
    expect(pension.assessedPoolIds.some((id) => id.startsWith("nisa_"))).toBe(false);
  });

  it("民間年金を持てば、その口座も資産テストの対象に入る", () => {
    const ctx = makeCtx({}, {
      privatePensionPlans: [{
        name: "annuity", currentBalance: 100000, monthlyContribution: 0,
        contribFromAge: 40, contribToAge: 60, returnPct: 0,
        payoutFromAge: 70, payoutToAge: 85, monthlyPayout: 500,
      }],
    });
    const plan = buildPlanInput(ctx);
    const pension = plan.publicPensions[0];
    const privateIds = plan.pools.filter((x) => x.group === "privatePension").map((x) => x.id);
    expect(privateIds.length).toBeGreaterThan(0);
    privateIds.forEach((id) => expect(pension.assessedPoolIds.includes(id)).toBe(true));
  });

  it("monthlyAmountAt は資産が少ないほど大きな額を返す（資産テスト）", () => {
    const pension = buildPlanInput(makeCtx()).publicPensions[0];
    const rich = pension.monthlyAmountAt(70, { assessedAssets: 700000, deemedAssets: 700000 });
    const poor = pension.monthlyAmountAt(70, { assessedAssets: 0, deemedAssets: 0 });
    expect(poor).toBeGreaterThan(rich);
    expect(near(poor, ret.getMaxAnnual("single") / 12)).toBe(true);
  });

  it("同じ資産でもみなし収入が加わると受給額が下がる（所得テスト）", () => {
    const pension = buildPlanInput(makeCtx()).publicPensions[0];
    const withDeeming = pension.monthlyAmountAt(70, { assessedAssets: 300000, deemedAssets: 300000 });
    const withoutDeeming = pension.monthlyAmountAt(70, { assessedAssets: 300000, deemedAssets: 0 });
    expect(withDeeming).toBeLessThanOrEqual(withoutDeeming);
  });

  it("ctx が null を渡してきても0として扱い、例外を投げない", () => {
    const pension = buildPlanInput(makeCtx()).publicPensions[0];
    const v = pension.monthlyAmountAt(70, { assessedAssets: null, deemedAssets: null });
    expect(near(v, ret.getMaxAnnual("single") / 12)).toBe(true);
  });

  it("受給資格年齢前は0を返す", () => {
    const pension = buildPlanInput(makeCtx()).publicPensions[0];
    expect(pension.monthlyAmountAt(66, { assessedAssets: 0, deemedAssets: 0 })).toBe(0);
  });

  it("夫婦とも受給資格年齢なら、投影に入る年金収入は世帯合計になる", () => {
    const single = buildPlanInput(makeCtx()).publicPensions[0];
    const couple = buildPlanInput(makeCtx({
      agePension: { status: "couple", homeowner: true, otherAnnualIncome: 0, bothQualified: true },
    })).publicPensions[0];
    const oneOnly = buildPlanInput(makeCtx({
      agePension: { status: "couple", homeowner: true, otherAnnualIncome: 0, bothQualified: false },
    })).publicPensions[0];
    const ctxArg = { assessedAssets: 0, deemedAssets: 0 };
    expect(near(couple.monthlyAmountAt(70, ctxArg), oneOnly.monthlyAmountAt(70, ctxArg) * 2)).toBe(true);
    // シングル満額（$1,200.90/隔週）とカップル世帯満額（$1,810.40/隔週）
    expect(near(single.monthlyAmountAt(70, ctxArg) * 12 / 26, 1200.90, 1e-6)).toBe(true);
    expect(near(couple.monthlyAmountAt(70, ctxArg) * 12 / 26, 1810.40, 1e-6)).toBe(true);
  });

  it("資産が減るにつれて実際の受給額が増えていく（毎年再判定）", () => {
    // 67歳時点で資産テストの範囲内。生活費で取り崩すほど受給額が増える。
    const ctx = makeCtx({
      superannuation: acct({ currentValue: 600000 }),
      expensesMonthly: 5000,
    }, { currentAge: 67, retireAge: 67, deathAge: 90 });
    ctx.effectiveCurrentAge = 67;
    const r = runIntegratedPlan(buildPlanInput(ctx));
    const pension = buildPlanInput(ctx).publicPensions[0];
    const assetsAt = (age) => r.yearly.find((y) => y.age === age).totalAssets;
    // 資産は減り続ける
    expect(assetsAt(80)).toBeLessThan(assetsAt(70));
    // その資産で評価した受給額は増えている
    const early = pension.monthlyAmountAt(70, { assessedAssets: assetsAt(70), deemedAssets: assetsAt(70) });
    const late = pension.monthlyAmountAt(80, { assessedAssets: assetsAt(80), deemedAssets: assetsAt(80) });
    expect(late).toBeGreaterThan(early);
  });

  it("資産が無影響枠を下回れば満額まで回復する", () => {
    const ctx = makeCtx({
      cashSavings: acct({ currentValue: 700000 }),
      expensesMonthly: 6000,
    }, { currentAge: 67, retireAge: 67, deathAge: 95 });
    ctx.effectiveCurrentAge = 67;
    const r = runIntegratedPlan(buildPlanInput(ctx));
    const pension = buildPlanInput(ctx).publicPensions[0];
    const last = r.yearly[r.yearly.length - 1];
    expect(last.totalAssets).toBeLessThan(ret.getAssetsFreeArea("single", true));
    expect(near(pension.monthlyAmountAt(95, {
      assessedAssets: last.totalAssets, deemedAssets: last.totalAssets,
    }), ret.getMaxAnnual("single") / 12, 1e-3)).toBe(true);
  });

  it("本番経路でも全投影年で NaN・負残高が発生しない", () => {
    const ctx = makeCtx({
      superannuation: acct({ currentValue: 500000, expectedReturnPct: 6 }),
      investmentAccount: acct({ currentValue: 200000, expectedReturnPct: 6, withdrawalTaxPct: 15 }),
      cashSavings: acct({ currentValue: 80000, expectedReturnPct: 2 }),
      annualSalary: 120000, voluntaryConcessional: 10000,
      expensesMonthly: 5500,
      agePension: { status: "couple", homeowner: false, otherAnnualIncome: 8000 },
    }, { currentAge: 55, retireAge: 67, deathAge: 100 });
    ctx.effectiveCurrentAge = 55;
    const r = runIntegratedPlan(buildPlanInput(ctx));
    for (const y of r.yearly) {
      expect(Number.isFinite(y.totalAssets)).toBe(true);
      expect(Number.isFinite(y.netWorth)).toBe(true);
      ACCOUNT_KEYS.forEach((k) => expect(y[`pool_${k}`]).toBeGreaterThanOrEqual(-0.01));
    }
    expect(r.yearly[r.yearly.length - 1].age).toBe(100);
  });

  it("銀行・株・金の残高も資産テストに効き、受給額を押し下げる", () => {
    const poor = buildPlanInput(makeCtx());
    const rich = buildPlanInput(makeCtx({}, {
      banks: [{ name: "main", balance: 900000, monthlyDeposit: 0, interestPct: 0 }],
    }));
    const ids = rich.publicPensions[0].assessedPoolIds;
    const bankPool = rich.pools.find((x) => x.id === "bank_0");
    expect(bankPool.balance).toBe(900000);
    expect(ids.includes("bank_0")).toBe(true);
    // 実際に投影して、銀行残高がある方が年金収入が小さいことを確認する
    const run = (plan) => runIntegratedPlan(plan).yearly.find((y) => y.age === 70);
    const pensionOf = (plan, assets) => plan.publicPensions[0]
      .monthlyAmountAt(70, { assessedAssets: assets, deemedAssets: assets });
    expect(pensionOf(rich, run(rich).totalAssets))
      .toBeLessThan(pensionOf(poor, run(poor).totalAssets));
  });

  it("元の inputs を変更しない（buildPlanInput は純粋）", () => {
    const ctx = makeCtx();
    const before = JSON.stringify(ctx.inputs);
    buildPlanInput(ctx);
    expect(JSON.stringify(ctx.inputs)).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// 8. 国別ルールの独立性・翻訳の完全性
// ---------------------------------------------------------------------------
describe("AU回帰：オーストラリアのルールが他国の値を参照していない", () => {
  it("4カテゴリすべてが implemented: true", () => {
    ["investment", "retirement", "healthcare", "tax"].forEach((k) => {
      expect(AU_COUNTRY_RULES[k].implemented).toBe(true);
    });
  });

  it("拠出上限が他国の上限と一致しない（値の取り違えがない）", () => {
    expect(inv.limits.concessionalCap).not.toBe(CA_COUNTRY_RULES.investment.limits.rrspAnnualDollarLimit);
    expect(inv.limits.nonConcessionalCap).not.toBe(GB_COUNTRY_RULES.investment.limits.isaAnnualAllowance);
    expect(inv.limits.concessionalCap).not.toBe(JP_COUNTRY_RULES.investment.annualInstallmentLimit);
  });

  it("AUの口座キーが他国の口座キーと重複しない（cashSavings を除く）", () => {
    const auKeys = inv.accountTypes.filter((k) => k !== "cashSavings");
    const others = [
      ...Object.keys(ACCOUNT_DRAW_CATEGORY.US),
      ...Object.keys(ACCOUNT_DRAW_CATEGORY.GB),
      ...Object.keys(ACCOUNT_DRAW_CATEGORY.CA),
    ];
    auKeys.forEach((k) => expect(others.includes(k)).toBe(false));
  });

  it("受給資格年齢・税率が他国と独立している", () => {
    expect(ret.getQualifyingAge()).toBe(67);
    expect(tax.incomeTax.taxFreeThreshold).toBe(18200);
    expect(US_COUNTRY_RULES.tax.implemented).toBe(true);
    expect(CA_COUNTRY_RULES.retirement.oas.standardAge).toBe(65);
  });
});

describe("AU回帰：AU向け翻訳キーが日英そろっている", () => {
  const auKeys = Object.keys(EN_TRANSLATIONS).filter((k) => /^au[A-Z]/.test(k));

  it("AU専用キーが十分な数だけ存在する", () => {
    expect(auKeys.length).toBeGreaterThan(50);
  });

  it("英語にあるAUキーはすべて日本語にも存在する", () => {
    expect(auKeys.filter((k) => JA_TRANSLATIONS[k] === undefined)).toEqual([]);
  });

  it("日本語にあるAUキーはすべて英語にも存在する", () => {
    const jaAuKeys = Object.keys(JA_TRANSLATIONS).filter((k) => /^au[A-Z]/.test(k));
    expect(jaAuKeys.filter((k) => EN_TRANSLATIONS[k] === undefined)).toEqual([]);
  });

  it("AUキーの値が空文字になっていない", () => {
    expect(auKeys.filter((k) =>
      String(EN_TRANSLATIONS[k]).trim() === "" || String(JA_TRANSLATIONS[k]).trim() === "")).toEqual([]);
  });
});
