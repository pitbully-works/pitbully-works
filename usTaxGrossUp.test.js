// ============================================================================
// usTaxGrossUp.test.js
// 【段階3】課税繰延口座からの引出に対する「税グロスアップ」の回帰テスト。
//
// 考え方：
//   生活費として必要なのは「税引後の手取り」。
//   Traditional IRA / 401(k) からの引出は全額が通常所得として課税されるため、
//   手取りを確保するには税額ぶん多く引き出す必要がある。
//       必要な引出額（グロス） = 必要な手取り ÷ (1 − 税率)
//   Brokerage（課税口座の元本）と Roth IRA（適格分配）はグロスアップしない。
//
// 値の分離（RMD達成判定と税計算を混同しないため）：
//   rmdRequired      … 法定の最低引出額（Uniform Lifetime Table の計算値そのもの）
//   taxableWithdrawn … Traditional IRA / 401(k) から実際に引き出した課税対象の総額
//   estimatedTax     … 上記に対する概算税額
//
// 税率は老後資産シミュレーション用の概算であり、確定申告の計算ではない。
// ============================================================================

import { describe, it, expect } from "vitest";
import { US_COUNTRY_RULES } from "./countryRules/US.js";

const inv = US_COUNTRY_RULES.investment;
const ret = US_COUNTRY_RULES.retirement;

const near = (actual, expected, tol = 1e-6) =>
  Math.abs(actual - expected) <= tol * Math.max(1, Math.abs(expected));

const accounts = ({ k401 = 0, tira = 0, roth = 0, brk = 0 }) => ({
  k401: { currentValue: k401, annualContribution: 0 },
  traditionalIra: { currentValue: tira, annualContribution: 0 },
  rothIra: { currentValue: roth, annualContribution: 0 },
  brokerage: { currentValue: brk, annualContribution: 0 },
});

describe("US tax gross-up: backward compatibility", () => {
  it("without a tax rate the projection behaves exactly as before", () => {
    const sim = inv.simulateGrowth({
      currentAge: 70, retireAge: 65, deathAge: 80,
      accounts: accounts({ tira: 500000 }),
      returnPct: 0, annualWithdrawalNeeded: 20000,
    });
    expect(near(sim.finalValue, 500000 - 20000 * 10)).toBe(true);
  });

  it("a zero tax rate withdraws exactly the amount needed (no gross-up)", () => {
    const sim = inv.simulateGrowth({
      currentAge: 70, retireAge: 65, deathAge: 71,
      accounts: accounts({ tira: 500000 }),
      returnPct: 0, annualWithdrawalNeeded: 10000, taxRatePct: 0,
    });
    const y = sim.yearly.find((r) => r.age === 71);
    expect(near(y.taxableWithdrawn, 10000)).toBe(true);
    expect(near(y.estimatedTax, 0)).toBe(true);
  });
});

describe("US tax gross-up by account type", () => {
  it("a Traditional IRA withdrawal is grossed up: net 10,000 at 22% -> 12,820.51", () => {
    const sim = inv.simulateGrowth({
      currentAge: 70, retireAge: 65, deathAge: 71,
      accounts: accounts({ tira: 500000 }),
      returnPct: 0, annualWithdrawalNeeded: 10000, taxRatePct: 22,
    });
    const y = sim.yearly.find((r) => r.age === 71);
    const gross = 10000 / 0.78;
    expect(near(y.taxableWithdrawn, gross)).toBe(true);
    expect(near(y.estimatedTax, gross * 0.22)).toBe(true);
    expect(near(y.accounts.traditionalIra, 500000 - gross)).toBe(true);
  });

  it("a 401(k) withdrawal is grossed up the same way", () => {
    const sim = inv.simulateGrowth({
      currentAge: 70, retireAge: 65, deathAge: 71,
      accounts: accounts({ k401: 500000 }),
      returnPct: 0, annualWithdrawalNeeded: 10000, taxRatePct: 22,
    });
    const y = sim.yearly.find((r) => r.age === 71);
    const gross = 10000 / 0.78;
    expect(near(y.taxableWithdrawn, gross)).toBe(true);
    expect(near(y.accounts.k401, 500000 - gross)).toBe(true);
  });

  it("a taxable brokerage withdrawal is NOT grossed up", () => {
    const sim = inv.simulateGrowth({
      currentAge: 70, retireAge: 65, deathAge: 71,
      accounts: accounts({ brk: 500000 }),
      returnPct: 0, annualWithdrawalNeeded: 10000, taxRatePct: 22,
    });
    const y = sim.yearly.find((r) => r.age === 71);
    expect(near(y.accounts.brokerage, 490000)).toBe(true);
    expect(near(y.taxableWithdrawn, 0)).toBe(true);
    expect(near(y.estimatedTax, 0)).toBe(true);
  });

  it("a Roth IRA withdrawal is NOT grossed up (qualified distributions are tax-free)", () => {
    const sim = inv.simulateGrowth({
      currentAge: 70, retireAge: 65, deathAge: 71,
      accounts: accounts({ roth: 500000 }),
      returnPct: 0, annualWithdrawalNeeded: 10000, taxRatePct: 22,
    });
    const y = sim.yearly.find((r) => r.age === 71);
    expect(near(y.accounts.rothIra, 490000)).toBe(true);
    expect(near(y.taxableWithdrawn, 0)).toBe(true);
  });

  it("the withdrawal order still spends the brokerage first, then tax-deferred", () => {
    // Brokerage 5,000 では手取り10,000に足りず、残り5,000をtIRAからグロスアップして引く
    const sim = inv.simulateGrowth({
      currentAge: 70, retireAge: 65, deathAge: 71,
      accounts: accounts({ brk: 5000, tira: 500000 }),
      returnPct: 0, annualWithdrawalNeeded: 10000, taxRatePct: 22,
    });
    const y = sim.yearly.find((r) => r.age === 71);
    expect(near(y.accounts.brokerage, 0)).toBe(true);
    expect(near(y.taxableWithdrawn, 5000 / 0.78)).toBe(true);
  });
});

describe("US tax gross-up: effect on the projection", () => {
  it("a higher tax rate depletes the tax-deferred balance faster", () => {
    const run = (taxRatePct) => inv.simulateGrowth({
      currentAge: 70, retireAge: 65, deathAge: 80,
      accounts: accounts({ tira: 500000 }),
      returnPct: 0, annualWithdrawalNeeded: 20000, taxRatePct,
    }).finalValue;
    const noTax = run(0);
    const midTax = run(22);
    const highTax = run(35);
    expect(midTax < noTax).toBe(true);
    expect(highTax < midTax).toBe(true);
  });

  it("total assets fall by the living expenses plus the estimated tax", () => {
    const sim = inv.simulateGrowth({
      currentAge: 70, retireAge: 65, deathAge: 71,
      accounts: accounts({ tira: 500000 }),
      returnPct: 0, annualWithdrawalNeeded: 10000, taxRatePct: 22,
    });
    const y = sim.yearly.find((r) => r.age === 71);
    // 500,000 − 手取り10,000 − 税 = 最終残高
    expect(near(sim.finalValue, 500000 - 10000 - y.estimatedTax)).toBe(true);
  });

  it("never produces negative balances even when the tax rate is very high", () => {
    const sim = inv.simulateGrowth({
      currentAge: 70, retireAge: 65, deathAge: 90,
      accounts: accounts({ tira: 100000 }),
      returnPct: 0, annualWithdrawalNeeded: 30000, taxRatePct: 90,
    });
    expect(sim.yearly.every((y) => Object.values(y.accounts).every((v) => v >= -0.01))).toBe(true);
  });
});

describe("US tax gross-up: values are kept separate from the RMD requirement", () => {
  it("rmdRequired stays the statutory minimum even when more is withdrawn", () => {
    // 73歳・前年末50万 → 法定最低額 18,867.92
    // 生活費 手取り30,000・税22% → グロス 38,461.54（最低額を超える）
    const sim = inv.simulateGrowth({
      currentAge: 72, retireAge: 65, deathAge: 73,
      accounts: accounts({ tira: 500000 }),
      returnPct: 0, annualWithdrawalNeeded: 30000,
      retirementRules: ret, birthYear: 1950, taxRatePct: 22,
    });
    const y = sim.yearly.find((r) => r.age === 73);
    expect(near(y.rmdRequired, 500000 / 26.5)).toBe(true);
    expect(near(y.taxableWithdrawn, 30000 / 0.78)).toBe(true);
    // 実引出が法定最低額を上回っている＝RMDは満たされている
    expect(y.taxableWithdrawn > y.rmdRequired).toBe(true);
    expect(near(y.rmdSurplusToBrokerage, 0)).toBe(true);
  });

  it("when the RMD exceeds the grossed-up living expenses, the shortfall is topped up", () => {
    // 生活費 手取り5,000 → グロス 6,410.26 < 法定最低額 18,867.92
    const required = 500000 / 26.5;
    const gross = 5000 / 0.78;
    const sim = inv.simulateGrowth({
      currentAge: 72, retireAge: 65, deathAge: 73,
      accounts: accounts({ tira: 500000 }),
      returnPct: 0, annualWithdrawalNeeded: 5000,
      retirementRules: ret, birthYear: 1950, taxRatePct: 22,
    });
    const y = sim.yearly.find((r) => r.age === 73);
    expect(near(y.rmdRequired, required)).toBe(true);
    expect(near(y.taxableWithdrawn, required)).toBe(true); // 最低額まで引き上げられる
    expect(near(y.rmdSurplusToBrokerage, (required - gross) * 0.78)).toBe(true);
  });

  it("estimatedTax is always the actual taxable withdrawal times the rate", () => {
    const sim = inv.simulateGrowth({
      currentAge: 72, retireAge: 65, deathAge: 78,
      accounts: accounts({ tira: 500000 }),
      returnPct: 3, annualWithdrawalNeeded: 8000,
      retirementRules: ret, birthYear: 1950, taxRatePct: 24,
    });
    for (const y of sim.yearly.slice(1)) {
      expect(near(y.estimatedTax, y.taxableWithdrawn * 0.24)).toBe(true);
    }
  });

  it("before the RMD start age, rmdRequired is 0 while taxable withdrawals are still recorded", () => {
    const sim = inv.simulateGrowth({
      currentAge: 70, retireAge: 65, deathAge: 71,
      accounts: accounts({ tira: 500000 }),
      returnPct: 0, annualWithdrawalNeeded: 10000,
      retirementRules: ret, birthYear: 1950, taxRatePct: 22,
    });
    const y = sim.yearly.find((r) => r.age === 71);
    expect(y.rmdRequired).toBe(0);
    expect(near(y.taxableWithdrawn, 10000 / 0.78)).toBe(true);
  });

  it("a Roth-only portfolio records no taxable withdrawal and no tax", () => {
    const sim = inv.simulateGrowth({
      currentAge: 72, retireAge: 65, deathAge: 80,
      accounts: accounts({ roth: 500000 }),
      returnPct: 0, annualWithdrawalNeeded: 10000,
      retirementRules: ret, birthYear: 1950, taxRatePct: 22,
    });
    expect(sim.yearly.every((y) => y.taxableWithdrawn === 0)).toBe(true);
    expect(sim.yearly.every((y) => y.estimatedTax === 0)).toBe(true);
  });

  it("the legacy `rmd` field still reports the actual taxable withdrawal", () => {
    const sim = inv.simulateGrowth({
      currentAge: 72, retireAge: 65, deathAge: 73,
      accounts: accounts({ tira: 500000 }),
      returnPct: 0, annualWithdrawalNeeded: 5000,
      retirementRules: ret, birthYear: 1950, taxRatePct: 22,
    });
    const y = sim.yearly.find((r) => r.age === 73);
    expect(near(y.rmd, y.taxableWithdrawn)).toBe(true);
  });
});
