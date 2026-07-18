// ============================================================================
// usRmd.test.js
// 米国版のRMD（Required Minimum Distribution：必須最低引出）の回帰テスト。
//
// 出典：
//   - 除数表：IRS Publication 590-B, Appendix B, Table III（Uniform Lifetime Table）
//             根拠規則 Treasury Regulation §1.401(a)(9)-9 / T.D. 9930（2022-01-01 適用）
//   - 開始年齢：SECURE 2.0 Act §107（1951〜1959年生まれ=73歳／1960年以降生まれ=75歳）
//   - 計算式：RMD = 前年末の口座残高 ÷ その年に到達する年齢の除数
//
// ルール定義そのものを検証するため、App.jsx 経由ではなく対象モジュールを直接読み込む。
// ============================================================================

import { describe, it, expect } from "vitest";
import { US_COUNTRY_RULES } from "./countryRules/US.js";

const inv = US_COUNTRY_RULES.investment;
const ret = US_COUNTRY_RULES.retirement;

const near = (actual, expected, tol = 1e-6) =>
  Math.abs(actual - expected) <= tol * Math.max(1, Math.abs(expected));

// テスト用に口座オブジェクトを組み立てる小さなヘルパー
const accounts = ({ k401 = 0, tira = 0, roth = 0, brk = 0 }) => ({
  k401: { currentValue: k401, annualContribution: 0 },
  traditionalIra: { currentValue: tira, annualContribution: 0 },
  rothIra: { currentValue: roth, annualContribution: 0 },
  brokerage: { currentValue: brk, annualContribution: 0 },
});

describe("US RMD start age (SECURE 2.0 §107)", () => {
  it("born 1951-1959 starts at 73", () => {
    expect(ret.getRmdStartAge(1951)).toBe(73);
    expect(ret.getRmdStartAge(1953)).toBe(73);
    expect(ret.getRmdStartAge(1959)).toBe(73);
  });

  it("born 1960 or later starts at 75 (boundary)", () => {
    expect(ret.getRmdStartAge(1960)).toBe(75);
    expect(ret.getRmdStartAge(1970)).toBe(75);
  });

  it("unknown birth year falls back to the earlier age 73 (safe side)", () => {
    expect(ret.getRmdStartAge(undefined)).toBe(73);
    expect(ret.getRmdStartAge(0)).toBe(73);
    expect(ret.getRmdStartAge("")).toBe(73);
  });
});

describe("US Uniform Lifetime Table divisors (IRS Pub 590-B Table III)", () => {
  it("matches the published divisors at key ages", () => {
    expect(ret.uniformLifetimeDivisor(73)).toBe(26.5);
    expect(ret.uniformLifetimeDivisor(74)).toBe(25.5);
    expect(ret.uniformLifetimeDivisor(75)).toBe(24.6);
    expect(ret.uniformLifetimeDivisor(80)).toBe(20.2);
    expect(ret.uniformLifetimeDivisor(85)).toBe(16.0);
    expect(ret.uniformLifetimeDivisor(90)).toBe(12.2);
    expect(ret.uniformLifetimeDivisor(95)).toBe(8.9);
    expect(ret.uniformLifetimeDivisor(100)).toBe(6.4);
  });

  it("includes the ages above 100 that the official table publishes", () => {
    expect(ret.uniformLifetimeDivisor(101)).toBe(6.0);
    expect(ret.uniformLifetimeDivisor(105)).toBe(4.6);
    expect(ret.uniformLifetimeDivisor(110)).toBe(3.5);
    expect(ret.uniformLifetimeDivisor(115)).toBe(2.9);
    expect(ret.uniformLifetimeDivisor(119)).toBe(2.3);
    expect(ret.uniformLifetimeDivisor(120)).toBe(2.0);
  });

  it("covers every age from 73 to 120 with no gaps", () => {
    for (let age = 73; age <= 120; age++) {
      expect(typeof ret.rmd.uniformLifetimeTable[age]).toBe("number");
    }
    expect(Object.keys(ret.rmd.uniformLifetimeTable)).toHaveLength(48);
  });

  it("returns null below the table (no RMD required)", () => {
    expect(ret.uniformLifetimeDivisor(72)).toBe(null);
    expect(ret.uniformLifetimeDivisor(60)).toBe(null);
  });

  it("uses the official final row (120 and over = 2.0) beyond age 120", () => {
    expect(ret.uniformLifetimeDivisor(121)).toBe(2.0);
    expect(ret.uniformLifetimeDivisor(130)).toBe(2.0);
  });

  it("divisors decrease monotonically with age", () => {
    const table = ret.rmd.uniformLifetimeTable;
    const ages = Object.keys(table).map(Number).sort((a, b) => a - b);
    for (let i = 1; i < ages.length; i++) {
      expect(table[ages[i]] < table[ages[i - 1]]).toBe(true);
    }
  });
});

describe("US RMD amount", () => {
  it("matches the IRS worked example: $100,000 at age 75 -> $4,065", () => {
    const rmd = ret.getRequiredMinimumDistribution({
      age: 75,
      birthYear: 1951,
      balances: { traditionalIra: 100000, k401: 0 },
    });
    expect(Math.round(rmd)).toBe(4065); // 100,000 / 24.6
  });

  it("sums Traditional IRA and 401(k) balances", () => {
    const rmd = ret.getRequiredMinimumDistribution({
      age: 73,
      birthYear: 1950,
      balances: { traditionalIra: 300000, k401: 200000 },
    });
    expect(near(rmd, 500000 / 26.5)).toBe(true);
  });

  it("excludes Roth IRA (no lifetime RMD for the original owner)", () => {
    const rmd = ret.getRequiredMinimumDistribution({
      age: 80,
      birthYear: 1945,
      balances: { traditionalIra: 0, k401: 0, rothIra: 500000 },
    });
    expect(rmd).toBe(0);
  });

  it("excludes taxable brokerage balances", () => {
    const rmd = ret.getRequiredMinimumDistribution({
      age: 80,
      birthYear: 1945,
      balances: { traditionalIra: 0, k401: 0, brokerage: 500000 },
    });
    expect(rmd).toBe(0);
  });

  it("is zero before the start age, and positive at it (boundary, born 1960)", () => {
    const before = ret.getRequiredMinimumDistribution({
      age: 74, birthYear: 1960, balances: { traditionalIra: 500000 },
    });
    const at = ret.getRequiredMinimumDistribution({
      age: 75, birthYear: 1960, balances: { traditionalIra: 500000 },
    });
    expect(before).toBe(0);
    expect(at > 0).toBe(true);
  });

  it("is zero before the start age, and positive at it (boundary, born 1953)", () => {
    const before = ret.getRequiredMinimumDistribution({
      age: 72, birthYear: 1953, balances: { traditionalIra: 500000 },
    });
    const at = ret.getRequiredMinimumDistribution({
      age: 73, birthYear: 1953, balances: { traditionalIra: 500000 },
    });
    expect(before).toBe(0);
    expect(near(at, 500000 / 26.5)).toBe(true);
  });
});

describe("US projection: backward compatibility", () => {
  it("without retirementRules the projection behaves exactly as before (no RMD)", () => {
    const sim = inv.simulateGrowth({
      currentAge: 70, retireAge: 65, deathAge: 80,
      accounts: accounts({ tira: 500000 }),
      returnPct: 0, annualWithdrawalNeeded: 20000,
    });
    // 10年 × 20,000 の引出のみ
    expect(near(sim.finalValue, 500000 - 20000 * 10)).toBe(true);
  });
});

describe("US projection: RMD uses the prior year-end balance", () => {
  it("with a 10% return, the RMD is 500,000/26.5 — not 550,000/26.5", () => {
    // IRSのRMDは「前年12月31日残高 ÷ 当年年齢の除数」。
    // 当年の運用益（10%）を加算した後の残高で割ってはいけない。
    const sim = inv.simulateGrowth({
      currentAge: 72, retireAge: 65, deathAge: 73,
      accounts: accounts({ tira: 500000 }),
      returnPct: 10, annualWithdrawalNeeded: 0,
      retirementRules: ret, birthYear: 1950, rmdTaxRatePct: 0,
    });
    const y = sim.yearly.find((r) => r.age === 73);
    expect(near(y.rmd, 500000 / 26.5)).toBe(true);   // 18,867.92
    expect(near(y.rmd, 550000 / 26.5)).toBe(false);  // 20,754.72 にはならない
  });

  it("the same rule holds in a later year (balance grows, RMD lags one year behind)", () => {
    // 73歳の前年末残高 = 500,000、74歳の前年末残高 = 73歳末の残高
    const sim = inv.simulateGrowth({
      currentAge: 72, retireAge: 65, deathAge: 74,
      accounts: accounts({ tira: 500000 }),
      returnPct: 10, annualWithdrawalNeeded: 0,
      retirementRules: ret, birthYear: 1950, rmdTaxRatePct: 0,
    });
    const y73 = sim.yearly.find((r) => r.age === 73);
    const y74 = sim.yearly.find((r) => r.age === 74);
    // 73歳末のtIRA残高 = 500,000×1.10 − RMD
    const tiraEnd73 = 500000 * 1.1 - 500000 / 26.5;
    expect(near(y73.accounts.traditionalIra, tiraEnd73)).toBe(true);
    // 74歳のRMDは「73歳末の残高 ÷ 25.5」
    expect(near(y74.rmd, tiraEnd73 / 25.5)).toBe(true);
  });
});

describe("US projection: RMD integration", () => {
  it("when the RMD is smaller than living expenses, no extra withdrawal happens", () => {
    // 73歳: 500,000 / 26.5 = 18,868 < 生活費 30,000 → 追加引出なし
    const sim = inv.simulateGrowth({
      currentAge: 72, retireAge: 65, deathAge: 73,
      accounts: accounts({ tira: 500000 }),
      returnPct: 0, annualWithdrawalNeeded: 30000,
      retirementRules: ret, birthYear: 1950, rmdTaxRatePct: 20,
    });
    const y = sim.yearly.find((r) => r.age === 73);
    expect(near(y.rmdSurplusToBrokerage, 0)).toBe(true);
    expect(near(sim.finalValue, 470000)).toBe(true); // 500,000 - 30,000
  });

  it("when the RMD exceeds living expenses, only the shortfall is withdrawn and moved net of tax", () => {
    // 73歳: 必要RMD = 500,000 / 26.5 = 18,867.92、生活費 10,000
    // → 追加引出 8,867.92、税20%後の 7,094.34 が Brokerage へ
    const required = 500000 / 26.5;
    const extra = required - 10000;
    const sim = inv.simulateGrowth({
      currentAge: 72, retireAge: 65, deathAge: 73,
      accounts: accounts({ tira: 500000 }),
      returnPct: 0, annualWithdrawalNeeded: 10000,
      retirementRules: ret, birthYear: 1950, rmdTaxRatePct: 20,
    });
    const y = sim.yearly.find((r) => r.age === 73);
    expect(near(y.rmd, required)).toBe(true);
    expect(near(y.rmdSurplusToBrokerage, extra * 0.8)).toBe(true);
    expect(near(y.accounts.traditionalIra, 500000 - required)).toBe(true);
    expect(near(y.accounts.brokerage, extra * 0.8)).toBe(true);
  });

  it("the RMD surplus is not consumed: total assets only fall by the tax on it", () => {
    const required = 500000 / 26.5;
    const extra = required - 10000;
    const sim = inv.simulateGrowth({
      currentAge: 72, retireAge: 65, deathAge: 73,
      accounts: accounts({ tira: 500000 }),
      returnPct: 0, annualWithdrawalNeeded: 10000,
      retirementRules: ret, birthYear: 1950, rmdTaxRatePct: 20,
    });
    // 総資産 = 元本 - 生活費 - 超過分にかかった税
    expect(near(sim.finalValue, 500000 - 10000 - extra * 0.2)).toBe(true);
  });

  it("a zero tax rate moves the entire surplus into the brokerage account", () => {
    const required = 500000 / 26.5;
    const sim = inv.simulateGrowth({
      currentAge: 72, retireAge: 65, deathAge: 73,
      accounts: accounts({ tira: 500000 }),
      returnPct: 0, annualWithdrawalNeeded: 0,
      retirementRules: ret, birthYear: 1950, rmdTaxRatePct: 0,
    });
    const y = sim.yearly.find((r) => r.age === 73);
    expect(near(y.rmdSurplusToBrokerage, required)).toBe(true);
    expect(near(sim.finalValue, 500000)).toBe(true); // 税ゼロなら総資産は減らない
  });

  it("a Roth-only portfolio is never touched by RMD", () => {
    const sim = inv.simulateGrowth({
      currentAge: 72, retireAge: 65, deathAge: 80,
      accounts: accounts({ roth: 500000 }),
      returnPct: 0, annualWithdrawalNeeded: 0,
      retirementRules: ret, birthYear: 1950, rmdTaxRatePct: 20,
    });
    expect(near(sim.finalValue, 500000)).toBe(true);
    expect(sim.yearly.every((r) => r.rmd === 0)).toBe(true);
  });

  it("no RMD is taken before the start age (born 1960 -> nothing at 73 or 74)", () => {
    const sim = inv.simulateGrowth({
      currentAge: 72, retireAge: 65, deathAge: 74,
      accounts: accounts({ tira: 500000 }),
      returnPct: 0, annualWithdrawalNeeded: 0,
      retirementRules: ret, birthYear: 1960, rmdTaxRatePct: 20,
    });
    expect(sim.yearly.filter((r) => r.age >= 73).every((r) => r.rmd === 0)).toBe(true);
    expect(near(sim.finalValue, 500000)).toBe(true);
  });

  it("the simple model applies RMD even before the retirement age (still-working exception is not modelled)", () => {
    // 法律上、IRAのRMDは在職中でも適用される（401(k)の在職中例外のみ本モデルでは再現しない）。
    // そのため、退職前（age <= retireAge）でもRMD開始年齢に達していれば引き出しが発生する。
    const sim = inv.simulateGrowth({
      currentAge: 72, retireAge: 80, deathAge: 74,
      accounts: accounts({ tira: 500000 }),
      returnPct: 0, annualWithdrawalNeeded: 0,
      retirementRules: ret, birthYear: 1950, rmdTaxRatePct: 20,
    });
    const y73 = sim.yearly.find((r) => r.age === 73);
    expect(y73.rmd > 0).toBe(true);
  });

  it("RMD keeps shrinking the tax-deferred balance year over year", () => {
    const sim = inv.simulateGrowth({
      currentAge: 72, retireAge: 65, deathAge: 78,
      accounts: accounts({ tira: 500000 }),
      returnPct: 0, annualWithdrawalNeeded: 0,
      retirementRules: ret, birthYear: 1950, rmdTaxRatePct: 20,
    });
    const balances = sim.yearly.filter((r) => r.age >= 73).map((r) => r.accounts.traditionalIra);
    for (let i = 1; i < balances.length; i++) {
      expect(balances[i] < balances[i - 1]).toBe(true);
    }
  });
});

describe("US RMD rule metadata is documented", () => {
  it("declares which accounts are subject to RMD", () => {
    expect(ret.rmd.applicableAccounts).toEqual(["traditionalIra", "k401"]);
  });

  it("declares the SECURE 2.0 start ages and birth-year threshold", () => {
    expect(ret.rmd.startAgeBornBefore1960).toBe(73);
    expect(ret.rmd.startAgeBorn1960OrLater).toBe(75);
    expect(ret.rmd.birthYearThreshold).toBe(1960);
  });
});
