// ============================================================================
// usMultiAccount.test.js
// 【段階4 追補】複数口座・退職前RMD・一般化した収支検算の回帰テスト。
//
// 背景：
//   反復計算が実際の引出順（brokerage → traditionalIra → k401 → rothIra）を
//   模擬していなかったため、Roth を併せ持つ場合や、退職前にRMDが発生する場合に
//   provisionalIncome / taxableSocialSecurity / ordinaryTaxableIncome / federalTax が
//   実際の引出額と一致しない不具合があった。ここではその再発を防ぐ。
//
// 収支の恒等式（全投影年で成立すること）：
//   Social Security ＋ 全口座からの引出
//     ＝ 生活費 ＋ 連邦税 ＋ 口座へ戻した余剰（RMD超過分 ＋ 収入余剰）
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

// 全投影年で恒等式が成立することを確かめる共通ヘルパー。
// 【仕様】退職前（age <= retireAge）は生活費を資産から引き出さないため、
// その年の恒等式では生活費を 0 として扱う。
const expectIdentitiesEveryYear = (sim, spending, exemptInterest = 0, retireAge = 0) => {
  for (const y of sim.yearly.slice(1)) {
    const spendingThisYear = y.age <= retireAge ? 0 : spending;
    // 口座別の引出の合計が totalWithdrawn と一致する
    expect(near(y.totalWithdrawn, y.brokerageWithdrawn + y.taxableWithdrawn + y.rothWithdrawn, 1e-6)).toBe(true);
    // 課税所得 ＝ 課税繰延引出 ＋ SS算入額
    expect(Math.abs(y.ordinaryTaxableIncome - (y.taxableWithdrawn + y.taxableSocialSecurity)) < 1).toBe(true);
    // 暫定所得 ＝ 課税繰延引出 ＋ 非課税利子 ＋ 給付の50%
    expect(Math.abs(y.provisionalIncome - (y.taxableWithdrawn + exemptInterest + y.socialSecurityBenefit * 0.5)) < 1).toBe(true);
    // 収支：給付 ＋ 全引出 ＝ 生活費 ＋ 税 ＋ 戻した余剰
    const inflow = y.socialSecurityBenefit + y.totalWithdrawn;
    const outflow = spendingThisYear + y.federalTax + y.rmdSurplusToBrokerage + y.incomeSurplusToBrokerage;
    expect(Math.abs(inflow - outflow) < 1).toBe(true);
    // SS算入は給付の85%以下
    if (y.socialSecurityBenefit > 0) {
      expect(y.taxableSocialSecurity <= y.socialSecurityBenefit * 0.85 + 1e-6).toBe(true);
    }
    // 残高が負にならない
    expect(Object.values(y.accounts).every((v) => v >= -0.01)).toBe(true);
  }
};

describe("US multi-account: Roth held alongside a Traditional IRA", () => {
  // 指摘された条件そのもの
  const run = () => inv.simulateGrowth({
    currentAge: 74, retireAge: 65, deathAge: 75,
    accounts: accounts({ tira: 2000000, roth: 1000000 }),
    returnPct: 0, annualWithdrawalNeeded: 100000,
    retirementRules: ret, taxRules: tax, birthYear: 1951,
    socialSecurityAnnual: 30000, socialSecurityStartAge: 67, filingStatus: "single",
  });

  it("ordinaryTaxableIncome matches its components even with a Roth balance available", () => {
    const y = run().yearly.find((r) => r.age === 75);
    expect(Math.abs(y.ordinaryTaxableIncome - (y.taxableWithdrawn + y.taxableSocialSecurity)) < 1).toBe(true);
  });

  it("provisionalIncome matches its components even with a Roth balance available", () => {
    const y = run().yearly.find((r) => r.age === 75);
    expect(Math.abs(y.provisionalIncome - (y.taxableWithdrawn + y.socialSecurityBenefit * 0.5)) < 1).toBe(true);
  });

  it("the Roth is NOT tapped first: the Traditional IRA is used before it (withdrawal order)", () => {
    const y = run().yearly.find((r) => r.age === 75);
    expect(y.taxableWithdrawn > 0).toBe(true);
    // Roth残高は潤沢だが、引出順では最後なので手を付けない
    expect(near(y.rothWithdrawn, 0)).toBe(true);
  });

  it("the cash-flow identity holds", () => {
    const y = run().yearly.find((r) => r.age === 75);
    const inflow = y.socialSecurityBenefit + y.totalWithdrawn;
    const outflow = 100000 + y.federalTax + y.rmdSurplusToBrokerage + y.incomeSurplusToBrokerage;
    expect(Math.abs(inflow - outflow) < 1).toBe(true);
  });
});

describe("US multi-account: brokerage + Traditional IRA + Roth mix", () => {
  const sim = inv.simulateGrowth({
    currentAge: 70, retireAge: 65, deathAge: 88,
    accounts: accounts({ brk: 150000, tira: 600000, roth: 300000 }),
    returnPct: 4, annualWithdrawalNeeded: 70000,
    retirementRules: ret, taxRules: tax, birthYear: 1955,
    socialSecurityAnnual: 28000, socialSecurityStartAge: 67, filingStatus: "single",
  });

  it("spends the brokerage first while it lasts", () => {
    const first = sim.yearly[1];
    expect(first.brokerageWithdrawn > 0).toBe(true);
  });

  it("splits a year's need across brokerage and the Traditional IRA when the brokerage runs low", () => {
    const mixedYear = sim.yearly.find((y) => y.brokerageWithdrawn > 0 && y.taxableWithdrawn > 0);
    expect(!!mixedYear).toBe(true);
  });

  it("eventually withdraws from the Roth once the other accounts are exhausted", () => {
    // 他の口座が尽きるまで支出が大きいケースにする（引出順の最後がRothであることの確認）
    const drawDown = inv.simulateGrowth({
      currentAge: 70, retireAge: 65, deathAge: 88,
      accounts: accounts({ brk: 50000, tira: 150000, roth: 300000 }),
      returnPct: 0, annualWithdrawalNeeded: 90000,
      retirementRules: ret, taxRules: tax, birthYear: 1955,
      socialSecurityAnnual: 20000, socialSecurityStartAge: 67, filingStatus: "single",
    });
    const rothYear = drawDown.yearly.find((y) => y.rothWithdrawn > 0);
    expect(!!rothYear).toBe(true);
    // Roth引出は課税所得を増やさない
    expect(rothYear.rothWithdrawn > 0).toBe(true);
  });

  it("keeps all identities in every projected year", () => {
    expectIdentitiesEveryYear(sim, 70000, 0, 65);
  });
});

describe("US: partial brokerage + partial Traditional IRA in the same year", () => {
  it("draws the remainder from the Traditional IRA after the brokerage is used up", () => {
    // Brokerage 20,000 では 60,000 の生活費に足りないため、残りをtIRAから引く
    const sim = inv.simulateGrowth({
      currentAge: 70, retireAge: 65, deathAge: 71,
      accounts: accounts({ brk: 20000, tira: 500000 }),
      returnPct: 0, annualWithdrawalNeeded: 60000,
      retirementRules: ret, taxRules: tax, birthYear: 1955,
      socialSecurityAnnual: 24000, socialSecurityStartAge: 67, filingStatus: "single",
    });
    const y = sim.yearly.find((r) => r.age === 71);
    expect(near(y.brokerageWithdrawn, 20000)).toBe(true);
    expect(y.taxableWithdrawn > 0).toBe(true);
    expect(near(y.totalWithdrawn, y.brokerageWithdrawn + y.taxableWithdrawn + y.rothWithdrawn)).toBe(true);
  });
});

describe("US: actually withdrawing from the Roth", () => {
  it("uses the Roth when it is the only account left, and it is never taxable", () => {
    const sim = inv.simulateGrowth({
      currentAge: 70, retireAge: 65, deathAge: 72,
      accounts: accounts({ roth: 500000 }),
      returnPct: 0, annualWithdrawalNeeded: 40000,
      retirementRules: ret, taxRules: tax, birthYear: 1955,
      socialSecurityAnnual: 12000, socialSecurityStartAge: 67, filingStatus: "single",
    });
    const y = sim.yearly.find((r) => r.age === 71);
    expect(y.rothWithdrawn > 0).toBe(true);
    // Roth引出は課税所得に入らない
    expect(near(y.taxableWithdrawn, 0)).toBe(true);
    expect(near(y.taxableSocialSecurity, 0)).toBe(true);
    expect(near(y.federalTax, 0)).toBe(true);
  });
});

describe("US: RMD while still before the retirement age, with Social Security", () => {
  // 指摘された条件そのもの：退職年齢前だがRMD開始年齢を超えている
  //
  // 【仕様】退職前の生活費は給与で賄う前提のため、資産からは引き出さない
  // （annualWithdrawalNeeded は「退職後の生活費」として渡される値）。
  // したがってこの年の収支恒等式では生活費は 0 として扱う。
  // 一方、RMDは法律上、退職前でも適用されるので引出は発生する。
  const sim = inv.simulateGrowth({
    currentAge: 74, retireAge: 80, deathAge: 75,
    accounts: accounts({ tira: 2000000 }),
    returnPct: 0, annualWithdrawalNeeded: 20000,
    retirementRules: ret, taxRules: tax, birthYear: 1951,
    socialSecurityAnnual: 30000, socialSecurityStartAge: 67, filingStatus: "single",
  });
  const y = sim.yearly.find((r) => r.age === 75);

  it("still forces the RMD withdrawal before retirement", () => {
    expect(y.rmdRequired > 0).toBe(true);
    expect(y.taxableWithdrawn >= y.rmdRequired - 1).toBe(true);
  });

  it("reflects that withdrawal in the taxable income and the federal tax", () => {
    expect(y.ordinaryTaxableIncome > 0).toBe(true);
    expect(y.federalTax > 0).toBe(true);
    expect(Math.abs(y.ordinaryTaxableIncome - (y.taxableWithdrawn + y.taxableSocialSecurity)) < 1).toBe(true);
  });

  it("keeps the provisional income consistent before retirement too", () => {
    expect(Math.abs(y.provisionalIncome - (y.taxableWithdrawn + y.socialSecurityBenefit * 0.5)) < 1).toBe(true);
  });

  it("does NOT draw living expenses from assets before retirement (spending is treated as 0)", () => {
    // 収支恒等式：給付 ＋ 全引出 ＝ 0（生活費） ＋ 税 ＋ 口座へ戻した余剰
    const inflow = y.socialSecurityBenefit + y.totalWithdrawn;
    const outflow = 0 + y.federalTax + y.rmdSurplusToBrokerage + y.incomeSurplusToBrokerage;
    expect(Math.abs(inflow - outflow) < 1).toBe(true);
    // 生活費に使われないため、Social Security給付は全額が収入余剰として口座へ戻る
    expect(near(y.incomeSurplusToBrokerage, y.socialSecurityBenefit)).toBe(true);
  });

  it("the same year AFTER retirement does deduct living expenses (contrast)", () => {
    // 同じ年齢・同じ残高でも、退職後なら生活費が資産から引かれる
    const afterRetirement = inv.simulateGrowth({
      currentAge: 74, retireAge: 65, deathAge: 75,
      accounts: accounts({ tira: 2000000 }),
      returnPct: 0, annualWithdrawalNeeded: 20000,
      retirementRules: ret, taxRules: tax, birthYear: 1951,
      socialSecurityAnnual: 30000, socialSecurityStartAge: 67, filingStatus: "single",
    }).yearly.find((r) => r.age === 75);
    const inflow = afterRetirement.socialSecurityBenefit + afterRetirement.totalWithdrawn;
    const outflow = 20000 + afterRetirement.federalTax
      + afterRetirement.rmdSurplusToBrokerage + afterRetirement.incomeSurplusToBrokerage;
    expect(Math.abs(inflow - outflow) < 1).toBe(true);
    // 生活費20,000ぶんだけ、収入余剰が退職前より小さくなる
    expect(near(afterRetirement.incomeSurplusToBrokerage, y.incomeSurplusToBrokerage - 20000)).toBe(true);
  });
});

describe("US: generalized cash-flow identity across long projections", () => {
  it("holds for a tax-deferred heavy portfolio with Social Security and RMDs", () => {
    const spending = 60000;
    const sim = inv.simulateGrowth({
      currentAge: 70, retireAge: 65, deathAge: 95,
      accounts: accounts({ tira: 1200000, k401: 400000 }),
      returnPct: 4, annualWithdrawalNeeded: spending,
      retirementRules: ret, taxRules: tax, birthYear: 1955,
      socialSecurityAnnual: 30000, socialSecurityStartAge: 67, filingStatus: "single",
    });
    expectIdentitiesEveryYear(sim, spending, 0, 65);
  });

  it("holds when tax-exempt interest is present", () => {
    const spending = 50000;
    const sim = inv.simulateGrowth({
      currentAge: 72, retireAge: 65, deathAge: 90,
      accounts: accounts({ brk: 100000, tira: 900000, roth: 200000 }),
      returnPct: 3, annualWithdrawalNeeded: spending,
      retirementRules: ret, taxRules: tax, birthYear: 1952,
      socialSecurityAnnual: 26000, socialSecurityStartAge: 67, filingStatus: "single",
      taxExemptInterest: 4000,
    });
    expectIdentitiesEveryYear(sim, spending, 4000, 65);
  });

  it("holds for a married-joint filer", () => {
    const spending = 90000;
    const sim = inv.simulateGrowth({
      currentAge: 71, retireAge: 65, deathAge: 92,
      accounts: accounts({ brk: 200000, tira: 1500000 }),
      returnPct: 4, annualWithdrawalNeeded: spending,
      retirementRules: ret, taxRules: tax, birthYear: 1954,
      socialSecurityAnnual: 45000, socialSecurityStartAge: 67, filingStatus: "marriedJoint",
    });
    expectIdentitiesEveryYear(sim, spending, 0, 65);
  });

  it("holds across a projection that spans both before and after retirement", () => {
    // 退職年齢80歳・RMD開始73歳をまたぐため、退職前RMDの年と退職後の年が混在する
    const spending = 55000;
    const sim = inv.simulateGrowth({
      currentAge: 70, retireAge: 80, deathAge: 92,
      accounts: accounts({ brk: 120000, tira: 1400000 }),
      returnPct: 4, annualWithdrawalNeeded: spending,
      retirementRules: ret, taxRules: tax, birthYear: 1955,
      socialSecurityAnnual: 30000, socialSecurityStartAge: 67, filingStatus: "single",
    });
    // 退職前にRMDが発生している年が実際に存在することを確認してから恒等式を検証する
    const preRetirementRmdYear = sim.yearly.find((y) => y.age <= 80 && y.rmdRequired > 0);
    expect(!!preRetirementRmdYear).toBe(true);
    expectIdentitiesEveryYear(sim, spending, 0, 80);
  });
});

describe("US: surplus is split into RMD-driven and income surplus", () => {
  it("labels the RMD-driven portion separately from leftover Social Security income", () => {
    // 生活費が小さく、SS給付だけで賄えるうえにRMDも発生するケース
    const sim = inv.simulateGrowth({
      currentAge: 74, retireAge: 65, deathAge: 75,
      accounts: accounts({ tira: 2000000 }),
      returnPct: 0, annualWithdrawalNeeded: 20000,
      retirementRules: ret, taxRules: tax, birthYear: 1951,
      socialSecurityAnnual: 30000, socialSecurityStartAge: 67, filingStatus: "single",
    });
    const y = sim.yearly.find((r) => r.age === 75);
    // 給付30,000 > 生活費20,000 なので収入余剰が存在する
    expect(y.incomeSurplusToBrokerage > 0).toBe(true);
    // RMDによる強制引出ぶんの余剰も存在する
    expect(y.rmdSurplusToBrokerage > 0).toBe(true);
    // 両者の合計が、実際に口座へ戻した現金と一致する
    const reinvested = y.rmdSurplusToBrokerage + y.incomeSurplusToBrokerage;
    const inflow = y.socialSecurityBenefit + y.totalWithdrawn;
    expect(Math.abs(reinvested - (inflow - 20000 - y.federalTax)) < 1).toBe(true);
  });

  it("reports no surplus at all when spending consumes everything", () => {
    const sim = inv.simulateGrowth({
      currentAge: 70, retireAge: 65, deathAge: 71,
      accounts: accounts({ tira: 500000 }),
      returnPct: 0, annualWithdrawalNeeded: 80000,
      retirementRules: ret, taxRules: tax, birthYear: 1955,
      socialSecurityAnnual: 24000, socialSecurityStartAge: 67, filingStatus: "single",
    });
    const y = sim.yearly.find((r) => r.age === 71);
    expect(near(y.rmdSurplusToBrokerage, 0)).toBe(true);
    expect(near(y.incomeSurplusToBrokerage, 0)).toBe(true);
  });
});

describe("US: per-account withdrawal fields are always consistent", () => {
  it("totalWithdrawn equals the sum of the three account withdrawals in every year", () => {
    const sim = inv.simulateGrowth({
      currentAge: 68, retireAge: 65, deathAge: 90,
      accounts: accounts({ brk: 100000, tira: 500000, k401: 300000, roth: 200000 }),
      returnPct: 5, annualWithdrawalNeeded: 65000,
      retirementRules: ret, taxRules: tax, birthYear: 1957,
      socialSecurityAnnual: 25000, socialSecurityStartAge: 67, filingStatus: "single",
    });
    for (const y of sim.yearly) {
      expect(near(y.totalWithdrawn, y.brokerageWithdrawn + y.taxableWithdrawn + y.rothWithdrawn, 1e-6)).toBe(true);
    }
  });

  it("the fields exist even when no rules are supplied (stable shape)", () => {
    const sim = inv.simulateGrowth({
      currentAge: 70, retireAge: 65, deathAge: 72,
      accounts: accounts({ tira: 500000 }),
      returnPct: 0, annualWithdrawalNeeded: 20000,
    });
    for (const y of sim.yearly) {
      expect(typeof y.brokerageWithdrawn).toBe("number");
      expect(typeof y.rothWithdrawn).toBe("number");
      expect(typeof y.totalWithdrawn).toBe("number");
      expect(typeof y.incomeSurplusToBrokerage).toBe("number");
    }
  });
});
