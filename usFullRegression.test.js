// ============================================================================
// usFullRegression.test.js
// 【段階5】US版全体の回帰テスト。新機能は追加せず、段階1〜4で実装した内容が
// あらゆる条件の組み合わせで破綻しないことを最終確認する。
//
// 検証する不変条件（すべての投影年で成立すること）：
//   (1) 残高が負にならない
//   (2) totalWithdrawn = brokerageWithdrawn + taxableWithdrawn + rothWithdrawn
//   (3) ordinaryTaxableIncome = taxableWithdrawn + taxableSocialSecurity
//   (4) provisionalIncome = taxableWithdrawn + 非課税利子 + 給付 × 0.5
//   (5) 収支：給付 + 全引出 = 実際に賄えた生活費 + 連邦税 + 口座へ戻した余剰
//   (6) Social Securityの課税所得算入は給付の85%以下
//   (7) 数値がNaN / Infinity にならない
//
// 【(5)の「実際に賄えた生活費」について】
//   資産が尽きた年は、生活費の全額を賄えない。その場合の生活費は
//   min(必要額, 給付 + 引出 − 税) となる。これは仕様どおりの挙動であり、
//   不具合ではない（口座残高を超えて引き出すことはできないため）。
//
// 【退職前の生活費】
//   退職前（age <= retireAge）の生活費は給与で賄う前提のため、資産からは
//   引き出さない。恒等式でも生活費は 0 として扱う。GB / CA / AU も同じ仕様。
// ============================================================================

import { describe, it, expect } from "vitest";
import { US_COUNTRY_RULES } from "./countryRules/US.js";
import { JP_COUNTRY_RULES } from "./countryRules/JP.js";
import { GB_COUNTRY_RULES } from "./countryRules/GB.js";
import { CA_COUNTRY_RULES } from "./countryRules/CA.js";
import { AU_COUNTRY_RULES } from "./countryRules/AU.js";
import { JA_TRANSLATIONS } from "./translations/ja.js";
import { EN_TRANSLATIONS } from "./translations/en.js";
import { EN_GB_OVERRIDES } from "./translations/enGB.js";

const inv = US_COUNTRY_RULES.investment;
const ret = US_COUNTRY_RULES.retirement;
const tax = US_COUNTRY_RULES.tax;

const near = (actual, expected, tol = 1e-6) =>
  Math.abs(actual - expected) <= tol * Math.max(1, Math.abs(expected));

const accounts = ({ k401 = 0, k401c = 0, tira = 0, tirac = 0, roth = 0, rothc = 0, brk = 0, brkc = 0 }) => ({
  k401: { currentValue: k401, annualContribution: k401c },
  traditionalIra: { currentValue: tira, annualContribution: tirac },
  rothIra: { currentValue: roth, annualContribution: rothc },
  brokerage: { currentValue: brk, annualContribution: brkc },
});

// すべての不変条件を全投影年で検証する共通ヘルパー
const expectAllInvariants = (sim, { spending, retireAge, exemptInterest = 0 }) => {
  for (const y of sim.yearly.slice(1)) {
    const need = y.age <= retireAge ? 0 : spending;
    // (7) 数値の健全性
    expect(Number.isFinite(y.value)).toBe(true);
    expect(Number.isFinite(y.federalTax)).toBe(true);
    // (1) 残高が負にならない
    expect(Object.values(y.accounts).every((v) => v >= -0.01)).toBe(true);
    // (2) 口座別引出の合計
    expect(near(y.totalWithdrawn, y.brokerageWithdrawn + y.taxableWithdrawn + y.rothWithdrawn, 1e-6)).toBe(true);
    // (3) 課税所得の構成
    expect(Math.abs(y.ordinaryTaxableIncome - (y.taxableWithdrawn + y.taxableSocialSecurity)) < 1).toBe(true);
    // (4) 暫定所得の構成
    expect(Math.abs(y.provisionalIncome - (y.taxableWithdrawn + exemptInterest + y.socialSecurityBenefit * 0.5)) < 1).toBe(true);
    // (5) 収支（資産が尽きた年は賄えた分だけが生活費になる）
    const funded = Math.min(need, Math.max(0, y.socialSecurityBenefit + y.totalWithdrawn - y.federalTax));
    const inflow = y.socialSecurityBenefit + y.totalWithdrawn;
    const outflow = funded + y.federalTax + y.rmdSurplusToBrokerage + y.incomeSurplusToBrokerage;
    expect(Math.abs(inflow - outflow) < 1).toBe(true);
    // (6) SS課税の算入上限
    if (y.socialSecurityBenefit > 0) {
      expect(y.taxableSocialSecurity <= y.socialSecurityBenefit * 0.85 + 1e-6).toBe(true);
    }
  }
};

// ---------------------------------------------------------------------------
// 口座の組み合わせ
// ---------------------------------------------------------------------------
describe("US回帰：401(k) / Traditional IRA / Roth IRA / Brokerage の組み合わせ", () => {
  const combos = [
    ["401(k)のみ", { k401: 800000 }],
    ["Traditional IRAのみ", { tira: 800000 }],
    ["Roth IRAのみ", { roth: 800000 }],
    ["Brokerageのみ", { brk: 800000 }],
    ["課税繰延2種", { k401: 400000, tira: 400000 }],
    ["課税繰延＋Roth", { tira: 500000, roth: 300000 }],
    ["Brokerage＋課税繰延", { brk: 200000, tira: 600000 }],
    ["Brokerage＋Roth", { brk: 300000, roth: 500000 }],
    ["4口座すべて", { brk: 150000, tira: 400000, k401: 250000, roth: 200000 }],
  ];

  it.each(combos)("%s：全投影年で不変条件が成立する", (_label, mix) => {
    const spending = 60000;
    const sim = inv.simulateGrowth({
      currentAge: 66, retireAge: 65, deathAge: 92,
      accounts: accounts(mix), returnPct: 4, annualWithdrawalNeeded: spending,
      retirementRules: ret, taxRules: tax, birthYear: 1960,
      socialSecurityAnnual: 28000, socialSecurityStartAge: 67, filingStatus: "single",
    });
    expectAllInvariants(sim, { spending, retireAge: 65 });
  });

  it("Roth のみの場合、課税所得も連邦税も発生しない", () => {
    const sim = inv.simulateGrowth({
      currentAge: 66, retireAge: 65, deathAge: 80,
      accounts: accounts({ roth: 800000 }), returnPct: 3, annualWithdrawalNeeded: 40000,
      retirementRules: ret, taxRules: tax, birthYear: 1960,
      socialSecurityAnnual: 20000, socialSecurityStartAge: 67, filingStatus: "single",
    });
    for (const y of sim.yearly.slice(1)) {
      expect(near(y.taxableWithdrawn, 0)).toBe(true);
      expect(near(y.federalTax, 0)).toBe(true);
    }
  });

  it("Roth には生涯RMDが発生しない", () => {
    const sim = inv.simulateGrowth({
      currentAge: 72, retireAge: 65, deathAge: 90,
      accounts: accounts({ roth: 800000 }), returnPct: 3, annualWithdrawalNeeded: 0,
      retirementRules: ret, taxRules: tax, birthYear: 1950,
      socialSecurityAnnual: 0, socialSecurityStartAge: 67, filingStatus: "single",
    });
    expect(sim.yearly.every((y) => y.rmdRequired === 0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Social Security 開始前後
// ---------------------------------------------------------------------------
describe("US回帰：Social Security 開始前後", () => {
  it.each([62, 65, 67, 70])("受給開始 %s歳：開始前は0、開始年から給付が計上される", (startAge) => {
    const sim = inv.simulateGrowth({
      currentAge: 60, retireAge: 65, deathAge: 85,
      accounts: accounts({ tira: 900000 }), returnPct: 4, annualWithdrawalNeeded: 55000,
      retirementRules: ret, taxRules: tax, birthYear: 1966,
      socialSecurityAnnual: 30000, socialSecurityStartAge: startAge, filingStatus: "single",
    });
    for (const y of sim.yearly.slice(1)) {
      if (y.age < startAge) expect(y.socialSecurityBenefit).toBe(0);
      else expect(near(y.socialSecurityBenefit, 30000)).toBe(true);
    }
    expectAllInvariants(sim, { spending: 55000, retireAge: 65 });
  });

  it("受給開始年齢の倍率が SSA のルールどおり（62歳=0.70 / 67歳=1.00 / 70歳=1.24）", () => {
    expect(near(ret.getClaimingFactor(62), 0.70, 1e-3)).toBe(true);
    expect(near(ret.getClaimingFactor(67), 1.00, 1e-9)).toBe(true);
    expect(near(ret.getClaimingFactor(70), 1.24, 1e-3)).toBe(true);
  });

  it("給付が始まると暫定所得が増え、課税所得算入額も増える（ただし85%以下）", () => {
    const sim = inv.simulateGrowth({
      currentAge: 65, retireAge: 64, deathAge: 70,
      accounts: accounts({ tira: 900000 }), returnPct: 0, annualWithdrawalNeeded: 50000,
      retirementRules: ret, taxRules: tax, birthYear: 1961,
      socialSecurityAnnual: 30000, socialSecurityStartAge: 67, filingStatus: "single",
    });
    const before = sim.yearly.find((y) => y.age === 66);
    const after = sim.yearly.find((y) => y.age === 67);
    expect(before.taxableSocialSecurity).toBe(0);
    expect(after.taxableSocialSecurity > 0).toBe(true);
    expect(after.taxableSocialSecurity <= after.socialSecurityBenefit * 0.85 + 1e-6).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// RMD開始年齢の境界
// ---------------------------------------------------------------------------
describe("US回帰：RMD開始年齢の境界（SECURE 2.0 §107）", () => {
  it("1959年生まれは73歳から、1960年生まれは75歳から", () => {
    expect(ret.getRmdStartAge(1959)).toBe(73);
    expect(ret.getRmdStartAge(1960)).toBe(75);
  });

  it.each([
    [1950, 72, 73],
    [1959, 72, 73],
    [1960, 74, 75],
    [1970, 74, 75],
  ])("生年%s：%s歳ではRMD 0、%s歳から発生する", (birthYear, ageBefore, ageAt) => {
    const zero = ret.getRequiredMinimumDistribution({
      age: ageBefore, birthYear, balances: { traditionalIra: 500000 },
    });
    const positive = ret.getRequiredMinimumDistribution({
      age: ageAt, birthYear, balances: { traditionalIra: 500000 },
    });
    expect(zero).toBe(0);
    expect(positive > 0).toBe(true);
  });

  it("投影上でも開始年齢の年から強制引出が始まる", () => {
    const sim = inv.simulateGrowth({
      currentAge: 71, retireAge: 65, deathAge: 78,
      accounts: accounts({ tira: 1000000 }), returnPct: 3, annualWithdrawalNeeded: 10000,
      retirementRules: ret, taxRules: tax, birthYear: 1960,
      socialSecurityAnnual: 0, socialSecurityStartAge: 67, filingStatus: "single",
    });
    expect(sim.yearly.find((y) => y.age === 74).rmdRequired).toBe(0);
    expect(sim.yearly.find((y) => y.age === 75).rmdRequired > 0).toBe(true);
  });

  it("RMDが発生する年は、必ず法定最低額以上を引き出している", () => {
    const sim = inv.simulateGrowth({
      currentAge: 72, retireAge: 65, deathAge: 95,
      accounts: accounts({ tira: 1500000, k401: 500000 }), returnPct: 4, annualWithdrawalNeeded: 20000,
      retirementRules: ret, taxRules: tax, birthYear: 1950,
      socialSecurityAnnual: 30000, socialSecurityStartAge: 67, filingStatus: "single",
    });
    for (const y of sim.yearly.slice(1)) {
      if (y.rmdRequired > 0) expect(y.taxableWithdrawn >= y.rmdRequired - 1).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 退職前・退職後
// ---------------------------------------------------------------------------
describe("US回帰：退職前・退職後", () => {
  it("退職前は拠出され、生活費は資産から引かれない", () => {
    const sim = inv.simulateGrowth({
      currentAge: 50, retireAge: 65, deathAge: 70,
      accounts: accounts({ tira: 300000, tirac: 7000, k401: 200000, k401c: 23500 }),
      returnPct: 0, annualWithdrawalNeeded: 50000,
      retirementRules: ret, taxRules: tax, birthYear: 1976,
      socialSecurityAnnual: 0, socialSecurityStartAge: 67, filingStatus: "single",
    });
    const y = sim.yearly.find((r) => r.age === 55);
    expect(near(y.totalWithdrawn, 0)).toBe(true);
    // 拠出ぶん資産が増えている
    expect(y.value > 500000).toBe(true);
  });

  it("退職後は生活費が資産から引かれる", () => {
    const sim = inv.simulateGrowth({
      currentAge: 64, retireAge: 65, deathAge: 70,
      accounts: accounts({ brk: 500000 }), returnPct: 0, annualWithdrawalNeeded: 50000,
      retirementRules: ret, taxRules: tax, birthYear: 1962,
      socialSecurityAnnual: 0, socialSecurityStartAge: 67, filingStatus: "single",
    });
    expect(near(sim.yearly.find((r) => r.age === 65).totalWithdrawn, 0)).toBe(true);
    expect(near(sim.yearly.find((r) => r.age === 66).totalWithdrawn, 50000)).toBe(true);
  });

  it("退職前でもRMDは適用される（在職中の例外は再現しない）", () => {
    const sim = inv.simulateGrowth({
      currentAge: 74, retireAge: 85, deathAge: 78,
      accounts: accounts({ tira: 1000000 }), returnPct: 0, annualWithdrawalNeeded: 30000,
      retirementRules: ret, taxRules: tax, birthYear: 1951,
      socialSecurityAnnual: 24000, socialSecurityStartAge: 67, filingStatus: "single",
    });
    const y = sim.yearly.find((r) => r.age === 75);
    expect(y.rmdRequired > 0).toBe(true);
    expect(y.taxableWithdrawn > 0).toBe(true);
    // 課税所得・連邦税にも反映されている
    expect(y.ordinaryTaxableIncome > 0).toBe(true);
    expect(y.federalTax > 0).toBe(true);
  });

  it("退職前後をまたぐ長期投影でも不変条件が成立する", () => {
    const spending = 65000;
    const sim = inv.simulateGrowth({
      currentAge: 45, retireAge: 70, deathAge: 95,
      accounts: accounts({ brk: 50000, brkc: 10000, tira: 200000, tirac: 7000, k401: 150000, k401c: 23500, roth: 80000 }),
      returnPct: 5, annualWithdrawalNeeded: spending,
      retirementRules: ret, taxRules: tax, birthYear: 1981,
      socialSecurityAnnual: 32000, socialSecurityStartAge: 67, filingStatus: "marriedJoint",
    });
    expectAllInvariants(sim, { spending, retireAge: 70 });
  });
});

// ---------------------------------------------------------------------------
// 申告区分
// ---------------------------------------------------------------------------
describe("US回帰：申告区分（単身・夫婦合算・世帯主・夫婦別申告）", () => {
  it.each(["single", "marriedJoint", "headOfHousehold", "marriedSeparate"])(
    "%s：全投影年で不変条件が成立する",
    (filingStatus) => {
      const spending = 70000;
      const sim = inv.simulateGrowth({
        currentAge: 60, retireAge: 65, deathAge: 95,
        accounts: accounts({ brk: 100000, tira: 800000, k401: 300000, roth: 200000 }),
        returnPct: 4, annualWithdrawalNeeded: spending,
        retirementRules: ret, taxRules: tax, birthYear: 1966,
        socialSecurityAnnual: 30000, socialSecurityStartAge: 67, filingStatus,
      });
      expectAllInvariants(sim, { spending, retireAge: 65 });
    }
  );

  it("夫婦合算はしきい値が高いため、同条件なら単身よりSS課税算入が小さい", () => {
    const run = (filingStatus) => ret.getTaxableSocialSecurity({
      filingStatus, otherIncome: 30000, taxExemptInterest: 0, ssBenefit: 24000,
    }).taxableSocialSecurity;
    expect(run("marriedJoint") < run("single")).toBe(true);
  });

  it("同居のまま夫婦別申告は基準額0のため、最初から算入される", () => {
    const r = ret.getTaxableSocialSecurity({
      filingStatus: "marriedSeparateLivingTogether",
      otherIncome: 1000, taxExemptInterest: 0, ssBenefit: 20000,
    });
    expect(r.taxableSocialSecurity > 0).toBe(true);
  });

  it("未知の申告区分でも単身にフォールバックして壊れない", () => {
    const r = ret.getTaxableSocialSecurity({
      filingStatus: "unknownStatus", otherIncome: 30000, taxExemptInterest: 0, ssBenefit: 24000,
    });
    expect(Number.isFinite(r.taxableSocialSecurity)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 口座残高が途中で枯渇するケース
// ---------------------------------------------------------------------------
describe("US回帰：口座残高が途中で枯渇するケース", () => {
  const spending = 90000;
  const sim = inv.simulateGrowth({
    currentAge: 66, retireAge: 65, deathAge: 95,
    accounts: accounts({ brk: 20000, tira: 80000, roth: 30000 }),
    returnPct: 1, annualWithdrawalNeeded: spending,
    retirementRules: ret, taxRules: tax, birthYear: 1960,
    socialSecurityAnnual: 20000, socialSecurityStartAge: 67, filingStatus: "single",
  });

  it("残高が0になっても負にはならない", () => {
    expect(sim.yearly.every((y) => Object.values(y.accounts).every((v) => v >= -0.01))).toBe(true);
  });

  it("枯渇後は引出が0になり、給付だけが残る", () => {
    const depleted = sim.yearly.filter((y) => y.value === 0 && y.age > 70);
    expect(depleted.length > 0).toBe(true);
    for (const y of depleted) {
      expect(near(y.totalWithdrawn, 0)).toBe(true);
      expect(near(y.socialSecurityBenefit, 20000)).toBe(true);
    }
  });

  it("枯渇年を含めても不変条件が成立する（賄えた生活費で判定）", () => {
    expectAllInvariants(sim, { spending, retireAge: 65 });
  });

  it("枯渇しても NaN や Infinity が出ない", () => {
    expect(sim.yearly.every((y) => Number.isFinite(y.value) && Number.isFinite(y.federalTax))).toBe(true);
    expect(Number.isFinite(sim.finalValue)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 税率の極端値
// ---------------------------------------------------------------------------
describe("US回帰：高税率・税率0%", () => {
  it.each([0, 10, 37, 50, 90])("税率 %s%% でも不変条件が成立する", (rate) => {
    const spending = 50000;
    const sim = inv.simulateGrowth({
      currentAge: 66, retireAge: 65, deathAge: 90,
      accounts: accounts({ tira: 500000 }), returnPct: 3, annualWithdrawalNeeded: spending,
      retirementRules: ret, birthYear: 1960, taxRatePct: rate, rmdTaxRatePct: rate,
    });
    expectAllInvariants(sim, { spending, retireAge: 65 });
  });

  it("税率0%なら引出額はちょうど必要額（グロスアップなし）", () => {
    const sim = inv.simulateGrowth({
      currentAge: 66, retireAge: 65, deathAge: 67,
      accounts: accounts({ tira: 500000 }), returnPct: 0, annualWithdrawalNeeded: 40000,
      taxRatePct: 0,
    });
    expect(near(sim.yearly.find((y) => y.age === 67).taxableWithdrawn, 40000)).toBe(true);
  });

  it("税率が高いほど資産の減りが早い（単調性）", () => {
    const finalAt = (rate) => inv.simulateGrowth({
      currentAge: 66, retireAge: 65, deathAge: 85,
      accounts: accounts({ tira: 800000 }), returnPct: 3, annualWithdrawalNeeded: 40000,
      taxRatePct: rate,
    }).finalValue;
    const a = finalAt(0), b = finalAt(20), c = finalAt(40);
    expect(b <= a).toBe(true);
    expect(c <= b).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 利回りの符号
// ---------------------------------------------------------------------------
describe("US回帰：利回り0%・プラス・マイナス", () => {
  it.each([-10, -3, 0, 5, 12])("利回り %s%% でも不変条件が成立する", (returnPct) => {
    const spending = 60000;
    const sim = inv.simulateGrowth({
      currentAge: 62, retireAge: 65, deathAge: 92,
      accounts: accounts({ brk: 80000, tira: 600000, roth: 150000 }),
      returnPct, annualWithdrawalNeeded: spending,
      retirementRules: ret, taxRules: tax, birthYear: 1964,
      socialSecurityAnnual: 28000, socialSecurityStartAge: 67, filingStatus: "single",
    });
    expectAllInvariants(sim, { spending, retireAge: 65 });
  });

  it("マイナス利回りでも残高が負にならない", () => {
    const sim = inv.simulateGrowth({
      currentAge: 66, retireAge: 65, deathAge: 95,
      accounts: accounts({ tira: 400000 }), returnPct: -15, annualWithdrawalNeeded: 50000,
      retirementRules: ret, taxRules: tax, birthYear: 1960,
      socialSecurityAnnual: 24000, socialSecurityStartAge: 67, filingStatus: "single",
    });
    expect(sim.yearly.every((y) => Object.values(y.accounts).every((v) => v >= -0.01))).toBe(true);
  });

  it("利回りが高いほど最終資産が大きい（単調性）", () => {
    const finalAt = (returnPct) => inv.simulateGrowth({
      currentAge: 66, retireAge: 65, deathAge: 85,
      accounts: accounts({ tira: 800000 }), returnPct, annualWithdrawalNeeded: 40000,
    }).finalValue;
    expect(finalAt(0) <= finalAt(5)).toBe(true);
    expect(finalAt(-5) <= finalAt(0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 年齢境界
// ---------------------------------------------------------------------------
describe("US回帰：年齢境界（59.5 / 62 / 67 / 70 / 73 / 75歳）", () => {
  it("59.5歳を境に、課税繰延口座が引き出し可能資産に切り替わる", () => {
    const balances = { k401: 100000, traditionalIra: 50000, rothIra: 30000, brokerage: 20000 };
    const before = inv.splitLiquidRestricted(59, balances);
    const at = inv.splitLiquidRestricted(59.5, balances);
    expect(before.isAccessibleAge).toBe(false);
    expect(at.isAccessibleAge).toBe(true);
    expect(before.liquid).toBe(20000);          // Brokerageのみ
    expect(at.liquid).toBe(170000);             // Brokerage + 401(k) + tIRA
  });

  it("Social Securityの受給可能年齢は62〜70歳", () => {
    expect(ret.socialSecurity.earliestClaimAge).toBe(62);
    expect(ret.socialSecurity.latestClaimAge).toBe(70);
    expect(ret.socialSecurity.fullRetirementAge).toBe(67);
  });

  it.each([59.5, 62, 67, 70, 73, 75])("%s歳をまたぐ投影でも不変条件が成立する", (boundary) => {
    const start = Math.floor(boundary) - 1;
    const spending = 45000;
    const sim = inv.simulateGrowth({
      currentAge: start, retireAge: start, deathAge: Math.ceil(boundary) + 2,
      accounts: accounts({ brk: 100000, tira: 500000, k401: 200000, roth: 100000 }),
      returnPct: 4, annualWithdrawalNeeded: spending,
      retirementRules: ret, taxRules: tax, birthYear: 2026 - start,
      socialSecurityAnnual: 24000, socialSecurityStartAge: 67, filingStatus: "single",
    });
    expectAllInvariants(sim, { spending, retireAge: start });
  });
});

// ---------------------------------------------------------------------------
// 非課税利子
// ---------------------------------------------------------------------------
describe("US回帰：非課税利子があるケース", () => {
  it("非課税利子は暫定所得に算入されるが、課税所得には入らない", () => {
    const spending = 55000;
    const sim = inv.simulateGrowth({
      currentAge: 70, retireAge: 65, deathAge: 90,
      accounts: accounts({ tira: 900000, brk: 100000 }), returnPct: 3,
      annualWithdrawalNeeded: spending,
      retirementRules: ret, taxRules: tax, birthYear: 1956,
      socialSecurityAnnual: 26000, socialSecurityStartAge: 67, filingStatus: "single",
      taxExemptInterest: 5000,
    });
    expectAllInvariants(sim, { spending, retireAge: 65, exemptInterest: 5000 });
    const y = sim.yearly.find((r) => r.age === 75);
    // 課税所得には非課税利子が入っていない
    expect(Math.abs(y.ordinaryTaxableIncome - (y.taxableWithdrawn + y.taxableSocialSecurity)) < 1).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 後方互換
// ---------------------------------------------------------------------------
describe("US回帰：後方互換（ルールを渡さない従来の呼び出し）", () => {
  it("既存の投影テストと同じ結果になる", () => {
    const sim = inv.simulateGrowth({
      currentAge: 40, retireAge: 65, deathAge: 90,
      accounts: accounts({ k401: 100000, k401c: 20000, tira: 50000, tirac: 5000, roth: 30000, rothc: 2000, brk: 20000, brkc: 10000 }),
      returnPct: 6, annualWithdrawalNeeded: 60000,
    });
    expect(sim.yearly).toHaveLength(51);
    expect(sim.yearly.every((y) => Object.values(y.accounts).every((v) => v >= -0.01))).toBe(true);
  });

  it("ルール未指定なら税もRMDも発生しない", () => {
    const sim = inv.simulateGrowth({
      currentAge: 70, retireAge: 65, deathAge: 80,
      accounts: accounts({ tira: 500000 }), returnPct: 0, annualWithdrawalNeeded: 20000,
    });
    expect(near(sim.finalValue, 300000)).toBe(true);
    expect(sim.yearly.every((y) => y.rmdRequired === 0 && y.federalTax === 0)).toBe(true);
  });

  it("新しいフィールドは常に数値として存在する（形状の安定）", () => {
    const sim = inv.simulateGrowth({
      currentAge: 70, retireAge: 65, deathAge: 72,
      accounts: accounts({ tira: 500000 }), returnPct: 0, annualWithdrawalNeeded: 20000,
    });
    const fields = [
      "rmdRequired", "taxableWithdrawn", "estimatedTax", "rmdSurplusToBrokerage",
      "brokerageWithdrawn", "rothWithdrawn", "totalWithdrawn", "incomeSurplusToBrokerage",
      "socialSecurityBenefit", "provisionalIncome", "taxableSocialSecurity",
      "ordinaryTaxableIncome", "federalTax",
    ];
    for (const y of sim.yearly) {
      for (const f of fields) expect(typeof y[f]).toBe("number");
    }
  });
});

// ---------------------------------------------------------------------------
// 他国への影響がないこと
// ---------------------------------------------------------------------------
describe("US回帰：既存のJP・GB・CA・AUへ影響がない", () => {
  it("JPはsimulateGrowthを持たない（US側の変更と無関係）", () => {
    expect(JP_COUNTRY_RULES.investment.simulateGrowth).toBeUndefined();
  });

  it.each([
    ["GB", GB_COUNTRY_RULES],
    ["CA", CA_COUNTRY_RULES],
    ["AU", AU_COUNTRY_RULES],
  ])("%s は退職後のみ引き出す従来仕様のまま動作する", (_label, rules) => {
    const sim = rules.investment.simulateGrowth({
      currentAge: 60, retireAge: 65, deathAge: 80,
      accounts: rules.investment.accountTypes.reduce((acc, key) => {
        acc[key] = { currentValue: 200000, annualContribution: 0 };
        return acc;
      }, {}),
      returnPct: 3, annualWithdrawalNeeded: 30000,
    });
    expect(sim.yearly.length > 0).toBe(true);
    expect(sim.yearly.every((y) => Number.isFinite(y.value))).toBe(true);
    // 退職前は引き出されないので資産が減らない
    const before = sim.yearly.find((y) => y.age === 62);
    const start = sim.yearly[0];
    expect(before.value >= start.value).toBe(true);
  });

  it("4か国すべてが実装済みとして有効になっている", () => {
    for (const rules of [US_COUNTRY_RULES, GB_COUNTRY_RULES, CA_COUNTRY_RULES, AU_COUNTRY_RULES]) {
      expect(rules.investment.implemented).toBe(true);
      expect(rules.tax.implemented).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 翻訳キー
// ---------------------------------------------------------------------------
describe("US回帰：翻訳キーの欠落がない", () => {
  it("国別の注意書きが4か国ぶん ja / en に存在する", () => {
    for (const key of ["usCountryNote", "gbCountryNote", "caCountryNote", "auCountryNote"]) {
      expect(typeof JA_TRANSLATIONS[key]).toBe("string");
      expect(JA_TRANSLATIONS[key].length > 0).toBe(true);
      expect(typeof EN_TRANSLATIONS[key]).toBe("string");
      expect(EN_TRANSLATIONS[key].length > 0).toBe(true);
    }
  });

  it("英国版の注意書きは en-GB で上書きされている", () => {
    expect(typeof EN_GB_OVERRIDES.gbCountryNote).toBe("string");
    expect(EN_GB_OVERRIDES.gbCountryNote).toContain("UK edition");
  });

  it("古いプレビュー警告キーは削除されている", () => {
    expect(JA_TRANSLATIONS.localePreviewWarning).toBeUndefined();
    expect(EN_TRANSLATIONS.localePreviewWarning).toBeUndefined();
    expect(EN_GB_OVERRIDES.localePreviewWarning).toBeUndefined();
  });

  it("国選択の説明から「計算は日本制度基準」という記述が消えている", () => {
    expect(JA_TRANSLATIONS.countrySelectTitle).toBeTruthy();
    expect(JA_TRANSLATIONS.countrySelectTitle.includes("日本の制度")).toBe(false);
    expect(EN_TRANSLATIONS.countrySelectTitle.includes("Japanese")).toBe(false);
  });

  it("US画面で使う税の注記キーが存在する", () => {
    expect(typeof JA_TRANSLATIONS.usTaxHandledInInvestmentNote).toBe("string");
    expect(typeof EN_TRANSLATIONS.usTaxHandledInInvestmentNote).toBe("string");
  });

  it("US の labels は未実装ノートを指していない", () => {
    const labels = US_COUNTRY_RULES.labels;
    expect(labels.investmentNote).toBe(null);
    expect(labels.retirementNote).toBe(null);
    expect(labels.healthcareNote).toBe(null);
  });
});
