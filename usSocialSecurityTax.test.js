// ============================================================================
// usSocialSecurityTax.test.js
// 【段階4】Social Security給付の課税（IRC §86 / IRS Publication 915）の回帰テスト。
//
// 【最重要】「給付額の85%が税金になる」のではない。
//   「給付額のうち最大85%までが課税所得に算入される」であり、
//   その課税所得に通常の連邦所得税率が適用される。
//   したがって実際の税額は算入額より大幅に小さい。
//
// 計算手順（IRC §86）：
//   1. 暫定所得 = SS以外の所得 ＋ 非課税利子 ＋ 給付額の50%
//   2. 基準額以下                → 算入額 0
//   3. 基準額〜調整基準額        → min( 給付の50%, 超過額の50% )
//   4. 調整基準額 超             → min( 0.85×(暫定所得−調整基準額) ＋ 第1段階分, 給付の85% )
//
// しきい値（物価調整されない固定額）：
//   単身/HoH : 25,000 / 34,000     夫婦合算 : 32,000 / 44,000
// ============================================================================

import { describe, it, expect } from "vitest";
import { US_COUNTRY_RULES } from "./countryRules/US.js";

const inv = US_COUNTRY_RULES.investment;
const ret = US_COUNTRY_RULES.retirement;
const tax = US_COUNTRY_RULES.tax;

const near = (actual, expected, tol = 1e-6) =>
  Math.abs(actual - expected) <= tol * Math.max(1, Math.abs(expected));

const accounts = ({ k401 = 0, tira = 0, roth = 0, brk = 0 }) => ({
  k401: { currentValue: k401, annualContribution: 0 },
  traditionalIra: { currentValue: tira, annualContribution: 0 },
  rothIra: { currentValue: roth, annualContribution: 0 },
  brokerage: { currentValue: brk, annualContribution: 0 },
});

describe("US provisional income (IRC §86)", () => {
  it("equals other income + tax-exempt interest + half of the benefit", () => {
    const pi = ret.getProvisionalIncome({ otherIncome: 30000, taxExemptInterest: 5000, ssBenefit: 24000 });
    expect(near(pi, 30000 + 5000 + 12000)).toBe(true);
  });

  it("counts tax-exempt interest even though it is not itself taxed", () => {
    const withExempt = ret.getProvisionalIncome({ otherIncome: 20000, taxExemptInterest: 5000, ssBenefit: 20000 });
    const without = ret.getProvisionalIncome({ otherIncome: 20000, taxExemptInterest: 0, ssBenefit: 20000 });
    expect(near(withExempt - without, 5000)).toBe(true);
  });
});

describe("US taxable Social Security: statutory thresholds", () => {
  it("single/HoH use 25,000 and 34,000; married joint use 32,000 and 44,000", () => {
    const th = ret.socialSecurityTaxation.thresholds;
    expect(th.single.base).toBe(25000);
    expect(th.single.adjustedBase).toBe(34000);
    expect(th.headOfHousehold.base).toBe(25000);
    expect(th.marriedJoint.base).toBe(32000);
    expect(th.marriedJoint.adjustedBase).toBe(44000);
  });

  it("married filing separately while living together has a zero base amount", () => {
    const th = ret.socialSecurityTaxation.thresholds;
    expect(th.marriedSeparateLivingTogether.base).toBe(0);
  });

  it("the statutory maximum inclusion rate is 85%, never 100%", () => {
    expect(ret.socialSecurityTaxation.maxInclusionRate).toBe(0.85);
  });
});

describe("US taxable Social Security: tier 0 (nothing taxable)", () => {
  it("provisional income at or below the base amount includes nothing", () => {
    // 暫定所得 = 10,000 + 10,000 = 20,000 < 25,000
    const r = ret.getTaxableSocialSecurity({
      filingStatus: "single", otherIncome: 10000, taxExemptInterest: 0, ssBenefit: 20000,
    });
    expect(r.taxableSocialSecurity).toBe(0);
    expect(r.inclusionRate).toBe(0);
  });

  it("exactly at the base amount is still zero (boundary)", () => {
    // 暫定所得をちょうど25,000にする：15,000 + 20,000/2 = 25,000
    const r = ret.getTaxableSocialSecurity({
      filingStatus: "single", otherIncome: 15000, taxExemptInterest: 0, ssBenefit: 20000,
    });
    expect(near(r.provisionalIncome, 25000)).toBe(true);
    expect(r.taxableSocialSecurity).toBe(0);
  });
});

describe("US taxable Social Security: tier 1 (up to 50%)", () => {
  it("matches the IRS worked example: provisional 30,000, benefit 18,000 -> 2,500 included", () => {
    // 超過 5,000 の50% = 2,500。給付の50%（9,000）より小さいので 2,500。
    const r = ret.getTaxableSocialSecurity({
      filingStatus: "single", otherIncome: 21000, taxExemptInterest: 0, ssBenefit: 18000,
    });
    expect(near(r.provisionalIncome, 30000)).toBe(true);
    expect(near(r.taxableSocialSecurity, 2500)).toBe(true);
  });

  it("never includes more than half the benefit in this tier", () => {
    const benefit = 4000;
    const r = ret.getTaxableSocialSecurity({
      filingStatus: "single", otherIncome: 31000, taxExemptInterest: 0, ssBenefit: benefit,
    });
    // 暫定所得 33,000（まだ34,000未満）。超過8,000の50%=4,000 だが、給付の50%=2,000 が上限。
    expect(near(r.taxableSocialSecurity, benefit * 0.5)).toBe(true);
  });
});

describe("US taxable Social Security: tier 2 (up to 85%)", () => {
  it("matches the IRS worked example: MFJ, benefit 24,000, provisional 60,000 -> 19,600", () => {
    // A) 0.85 × (60,000 − 44,000) = 13,600、＋ (44,000−32,000)/2 = 6,000 → 19,600
    // B) 24,000 × 0.85 = 20,400
    // 小さい方 → 19,600
    const r = ret.getTaxableSocialSecurity({
      filingStatus: "marriedJoint", otherIncome: 48000, taxExemptInterest: 0, ssBenefit: 24000,
    });
    expect(near(r.provisionalIncome, 60000)).toBe(true);
    expect(near(r.taxableSocialSecurity, 19600)).toBe(true);
  });

  it("caps the inclusion at 85% of the benefit no matter how high income goes", () => {
    const benefit = 30000;
    const r = ret.getTaxableSocialSecurity({
      filingStatus: "single", otherIncome: 5000000, taxExemptInterest: 0, ssBenefit: benefit,
    });
    expect(near(r.taxableSocialSecurity, benefit * 0.85)).toBe(true);
    expect(near(r.inclusionRate, 0.85)).toBe(true);
  });

  it("85% is an inclusion cap, NOT a tax rate: the tax owed is far smaller", () => {
    const benefit = 30000;
    const r = ret.getTaxableSocialSecurity({
      filingStatus: "single", otherIncome: 40000, taxExemptInterest: 0, ssBenefit: benefit,
    });
    const included = r.taxableSocialSecurity;          // 課税所得への算入額
    const owed = tax.calculateFederalTax(40000 + included, "single").tax; // 実際の税額
    // 算入額は給付の85%以下、かつ実際の税額は算入額よりずっと小さい
    expect(included <= benefit * 0.85).toBe(true);
    expect(owed < included).toBe(true);
  });

  it("the inclusion rate rises with income but never exceeds 0.85", () => {
    const benefit = 24000;
    const rates = [10000, 30000, 50000, 100000, 1000000].map((otherIncome) =>
      ret.getTaxableSocialSecurity({ filingStatus: "single", otherIncome, taxExemptInterest: 0, ssBenefit: benefit }).inclusionRate
    );
    for (let i = 1; i < rates.length; i++) {
      expect(rates[i] >= rates[i - 1]).toBe(true);
    }
    expect(rates[rates.length - 1] <= 0.85).toBe(true);
  });

  it("a zero benefit produces no inclusion and no divide-by-zero", () => {
    const r = ret.getTaxableSocialSecurity({
      filingStatus: "single", otherIncome: 100000, taxExemptInterest: 0, ssBenefit: 0,
    });
    expect(r.taxableSocialSecurity).toBe(0);
    expect(r.inclusionRate).toBe(0);
  });
});

describe("US projection: Social Security integration", () => {
  it("records the five values separately", () => {
    const sim = inv.simulateGrowth({
      currentAge: 69, retireAge: 65, deathAge: 70,
      accounts: accounts({ tira: 800000 }),
      returnPct: 0, annualWithdrawalNeeded: 40000,
      retirementRules: ret, taxRules: tax, birthYear: 1956,
      socialSecurityAnnual: 24000, socialSecurityStartAge: 67, filingStatus: "single",
    });
    const y = sim.yearly.find((r) => r.age === 70);
    expect(near(y.socialSecurityBenefit, 24000)).toBe(true);
    expect(y.provisionalIncome > 0).toBe(true);
    expect(y.taxableSocialSecurity > 0).toBe(true);
    expect(y.ordinaryTaxableIncome > 0).toBe(true);
    expect(y.federalTax > 0).toBe(true);
    // 算入額と税額は別物であり、税額の方が小さい
    expect(y.federalTax < y.taxableSocialSecurity + y.taxableWithdrawn).toBe(true);
  });

  it("converges so that withdrawals + benefit = living expenses + tax", () => {
    const spending = 40000;
    const sim = inv.simulateGrowth({
      currentAge: 69, retireAge: 65, deathAge: 70,
      accounts: accounts({ tira: 800000 }),
      returnPct: 0, annualWithdrawalNeeded: spending,
      retirementRules: ret, taxRules: tax, birthYear: 1956,
      socialSecurityAnnual: 24000, socialSecurityStartAge: 67, filingStatus: "single",
    });
    const y = sim.yearly.find((r) => r.age === 70);
    // 給付 ＋ 全口座からの引出 ＝ 生活費 ＋ 税額 ＋ 口座へ戻した余剰（1ドル以内で収束）
    const inflow = y.socialSecurityBenefit + y.totalWithdrawn;
    const outflow = spending + y.federalTax + y.rmdSurplusToBrokerage + y.incomeSurplusToBrokerage;
    expect(Math.abs(inflow - outflow) < 1).toBe(true);
  });

  it("no benefit is counted before the claiming age", () => {
    const sim = inv.simulateGrowth({
      currentAge: 63, retireAge: 62, deathAge: 66,
      accounts: accounts({ tira: 800000 }),
      returnPct: 0, annualWithdrawalNeeded: 30000,
      retirementRules: ret, taxRules: tax, birthYear: 1962,
      socialSecurityAnnual: 24000, socialSecurityStartAge: 67, filingStatus: "single",
    });
    expect(sim.yearly.every((y) => y.socialSecurityBenefit === 0)).toBe(true);
  });

  it("the benefit starts exactly at the claiming age (boundary)", () => {
    const sim = inv.simulateGrowth({
      currentAge: 65, retireAge: 64, deathAge: 68,
      accounts: accounts({ tira: 800000 }),
      returnPct: 0, annualWithdrawalNeeded: 30000,
      retirementRules: ret, taxRules: tax, birthYear: 1960,
      socialSecurityAnnual: 24000, socialSecurityStartAge: 67, filingStatus: "single",
    });
    expect(sim.yearly.find((y) => y.age === 66).socialSecurityBenefit).toBe(0);
    expect(near(sim.yearly.find((y) => y.age === 67).socialSecurityBenefit, 24000)).toBe(true);
  });

  it("a Roth-funded retiree keeps provisional income low and pays little or no tax", () => {
    const roth = inv.simulateGrowth({
      currentAge: 69, retireAge: 65, deathAge: 70,
      accounts: accounts({ roth: 800000 }),
      returnPct: 0, annualWithdrawalNeeded: 40000,
      retirementRules: ret, taxRules: tax, birthYear: 1956,
      socialSecurityAnnual: 24000, socialSecurityStartAge: 67, filingStatus: "single",
    }).yearly.find((r) => r.age === 70);
    const tira = inv.simulateGrowth({
      currentAge: 69, retireAge: 65, deathAge: 70,
      accounts: accounts({ tira: 800000 }),
      returnPct: 0, annualWithdrawalNeeded: 40000,
      retirementRules: ret, taxRules: tax, birthYear: 1956,
      socialSecurityAnnual: 24000, socialSecurityStartAge: 67, filingStatus: "single",
    }).yearly.find((r) => r.age === 70);
    // Roth引出は課税所得に入らないため、暫定所得もSS課税も小さくなる
    expect(roth.provisionalIncome < tira.provisionalIncome).toBe(true);
    expect(roth.taxableSocialSecurity <= tira.taxableSocialSecurity).toBe(true);
    expect(roth.federalTax <= tira.federalTax).toBe(true);
  });

  it("the taxable inclusion never exceeds 85% of the benefit in any projected year", () => {
    const sim = inv.simulateGrowth({
      currentAge: 66, retireAge: 65, deathAge: 90,
      accounts: accounts({ tira: 2000000 }),
      returnPct: 5, annualWithdrawalNeeded: 120000,
      retirementRules: ret, taxRules: tax, birthYear: 1959,
      socialSecurityAnnual: 36000, socialSecurityStartAge: 67, filingStatus: "single",
    });
    for (const y of sim.yearly) {
      if (y.socialSecurityBenefit > 0) {
        expect(y.taxableSocialSecurity <= y.socialSecurityBenefit * 0.85 + 1e-6).toBe(true);
      }
    }
  });

  it("never produces negative balances with Social Security enabled", () => {
    const sim = inv.simulateGrowth({
      currentAge: 66, retireAge: 65, deathAge: 95,
      accounts: accounts({ tira: 300000 }),
      returnPct: 2, annualWithdrawalNeeded: 60000,
      retirementRules: ret, taxRules: tax, birthYear: 1959,
      socialSecurityAnnual: 24000, socialSecurityStartAge: 67, filingStatus: "single",
    });
    expect(sim.yearly.every((y) => Object.values(y.accounts).every((v) => v >= -0.01))).toBe(true);
  });
});

describe("US projection: Social Security AND RMD together (consistency)", () => {
  // RMDが生活費引出を上回る典型ケース：大きなtIRA・低い生活費・SS受給中
  const runBoth = (overrides = {}) => inv.simulateGrowth({
    currentAge: 74, retireAge: 65, deathAge: 75,
    accounts: accounts({ tira: 2000000 }),
    returnPct: 0, annualWithdrawalNeeded: 20000,
    retirementRules: ret, taxRules: tax, birthYear: 1951,
    socialSecurityAnnual: 30000, socialSecurityStartAge: 67,
    filingStatus: "single", rmdTaxRatePct: 22,
    ...overrides,
  });

  it("(1) covers the case where the RMD exceeds the living-expense withdrawal", () => {
    const y = runBoth().yearly.find((r) => r.age === 75);
    expect(y.socialSecurityBenefit > 0).toBe(true);
    expect(y.rmdRequired > 20000).toBe(true);
    // RMDが強制されるので、実引出は法定最低額まで引き上げられる
    expect(near(y.taxableWithdrawn, y.rmdRequired, 1e-6)).toBe(true);
  });

  it("(2) ordinaryTaxableIncome equals taxableWithdrawn + taxableSocialSecurity", () => {
    const y = runBoth().yearly.find((r) => r.age === 75);
    expect(Math.abs(y.ordinaryTaxableIncome - (y.taxableWithdrawn + y.taxableSocialSecurity)) < 1).toBe(true);
  });

  it("(3) provisionalIncome equals taxableWithdrawn + tax-exempt interest + half the benefit", () => {
    const y = runBoth({ taxExemptInterest: 3000 }).yearly.find((r) => r.age === 75);
    const expected = y.taxableWithdrawn + 3000 + y.socialSecurityBenefit * 0.5;
    expect(Math.abs(y.provisionalIncome - expected) < 1).toBe(true);
  });

  it("(4) the federal tax after the RMD top-up is not unduly smaller than before it", () => {
    // 同条件で、RMD開始前（1960年生まれ＝75歳開始なので73歳時点では非適用）と比較する
    const withRmd = inv.simulateGrowth({
      currentAge: 74, retireAge: 65, deathAge: 75,
      accounts: accounts({ tira: 2000000 }),
      returnPct: 0, annualWithdrawalNeeded: 20000,
      retirementRules: ret, taxRules: tax, birthYear: 1951,
      socialSecurityAnnual: 30000, socialSecurityStartAge: 67, filingStatus: "single",
    }).yearly.find((r) => r.age === 75);
    const beforeRmd = inv.simulateGrowth({
      currentAge: 72, retireAge: 65, deathAge: 73,
      accounts: accounts({ tira: 2000000 }),
      returnPct: 0, annualWithdrawalNeeded: 20000,
      retirementRules: ret, taxRules: tax, birthYear: 1960, // 75歳開始なので73歳では非適用
      socialSecurityAnnual: 30000, socialSecurityStartAge: 67, filingStatus: "single",
    }).yearly.find((r) => r.age === 73);
    // RMDにより課税所得が増えるため、税額は減らない（むしろ増える）
    expect(withRmd.taxableWithdrawn > beforeRmd.taxableWithdrawn).toBe(true);
    expect(withRmd.federalTax >= beforeRmd.federalTax).toBe(true);
  });

  it("(5) cash flow balances: benefit + all withdrawals = expenses + tax + everything reinvested", () => {
    const spending = 20000;
    const y = runBoth().yearly.find((r) => r.age === 75);
    const inflow = y.socialSecurityBenefit + y.totalWithdrawn;
    const outflow = spending + y.federalTax + y.rmdSurplusToBrokerage + y.incomeSurplusToBrokerage;
    expect(Math.abs(inflow - outflow) < 1).toBe(true);
  });

  it("(5b) the identity also holds when the RMD is smaller than living expenses", () => {
    const spending = 60000;
    const y = inv.simulateGrowth({
      currentAge: 74, retireAge: 65, deathAge: 75,
      accounts: accounts({ tira: 400000 }),
      returnPct: 0, annualWithdrawalNeeded: spending,
      retirementRules: ret, taxRules: tax, birthYear: 1951,
      socialSecurityAnnual: 24000, socialSecurityStartAge: 67, filingStatus: "single",
    }).yearly.find((r) => r.age === 75);
    expect(y.rmdRequired < spending).toBe(true);
    expect(near(y.rmdSurplusToBrokerage, 0)).toBe(true);
    const inflow = y.socialSecurityBenefit + y.totalWithdrawn;
    const outflow = spending + y.federalTax + y.rmdSurplusToBrokerage + y.incomeSurplusToBrokerage;
    expect(Math.abs(inflow - outflow) < 1).toBe(true);
  });

  it("(6) over a long projection no balance goes negative and inclusion stays within 85%", () => {
    const sim = inv.simulateGrowth({
      currentAge: 70, retireAge: 65, deathAge: 95,
      accounts: accounts({ tira: 1500000 }),
      returnPct: 4, annualWithdrawalNeeded: 70000,
      retirementRules: ret, taxRules: tax, birthYear: 1955,
      socialSecurityAnnual: 30000, socialSecurityStartAge: 67, filingStatus: "single",
    });
    expect(sim.yearly.every((y) => Object.values(y.accounts).every((v) => v >= -0.01))).toBe(true);
    for (const y of sim.yearly) {
      if (y.socialSecurityBenefit > 0) {
        expect(y.taxableSocialSecurity <= y.socialSecurityBenefit * 0.85 + 1e-6).toBe(true);
      }
    }
  });

  it("(6b) the two identities hold in every projected year, not just one", () => {
    const sim = inv.simulateGrowth({
      currentAge: 70, retireAge: 65, deathAge: 95,
      accounts: accounts({ tira: 1500000 }),
      returnPct: 4, annualWithdrawalNeeded: 70000,
      retirementRules: ret, taxRules: tax, birthYear: 1955,
      socialSecurityAnnual: 30000, socialSecurityStartAge: 67, filingStatus: "single",
    });
    for (const y of sim.yearly.slice(1)) {
      expect(Math.abs(y.ordinaryTaxableIncome - (y.taxableWithdrawn + y.taxableSocialSecurity)) < 1).toBe(true);
      expect(Math.abs(y.provisionalIncome - (y.taxableWithdrawn + y.socialSecurityBenefit * 0.5)) < 1).toBe(true);
    }
  });

  it("(6c) the RMD is still actually satisfied while Social Security is active", () => {
    const sim = inv.simulateGrowth({
      currentAge: 74, retireAge: 65, deathAge: 85,
      accounts: accounts({ tira: 1200000 }),
      returnPct: 3, annualWithdrawalNeeded: 20000,
      retirementRules: ret, taxRules: tax, birthYear: 1951,
      socialSecurityAnnual: 30000, socialSecurityStartAge: 67, filingStatus: "single",
    });
    for (const y of sim.yearly.slice(1)) {
      if (y.rmdRequired > 0) {
        expect(y.taxableWithdrawn >= y.rmdRequired - 1).toBe(true);
      }
    }
  });
});

describe("US projection: Social Security backward compatibility", () => {
  it("without a benefit the projection behaves exactly as in stage 3", () => {
    const sim = inv.simulateGrowth({
      currentAge: 70, retireAge: 65, deathAge: 80,
      accounts: accounts({ tira: 500000 }),
      returnPct: 0, annualWithdrawalNeeded: 20000,
    });
    expect(near(sim.finalValue, 300000)).toBe(true);
    expect(sim.yearly.every((y) => y.socialSecurityBenefit === 0)).toBe(true);
  });

  it("the new fields are always present so callers can rely on the shape", () => {
    const sim = inv.simulateGrowth({
      currentAge: 70, retireAge: 65, deathAge: 72,
      accounts: accounts({ tira: 500000 }),
      returnPct: 0, annualWithdrawalNeeded: 20000,
    });
    for (const y of sim.yearly) {
      expect(typeof y.socialSecurityBenefit).toBe("number");
      expect(typeof y.provisionalIncome).toBe("number");
      expect(typeof y.taxableSocialSecurity).toBe("number");
      expect(typeof y.ordinaryTaxableIncome).toBe("number");
      expect(typeof y.federalTax).toBe("number");
    }
  });
});
