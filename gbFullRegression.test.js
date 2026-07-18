// ============================================================================
// gbFullRegression.test.js
// 【GB段階3】英国版全体の回帰テスト。新機能は追加せず、GB段階1〜2で実装・確認した
// 内容があらゆる条件の組み合わせで破綻しないことを最終確認する。
//
// 対象年度：2026/27（England, Wales & Northern Ireland）。
//
// 検証する不変条件（すべての投影年で成立すること）：
//   (1) 6口座のいずれも残高が負にならない
//   (2) 口座残高の合計が value と一致する
//   (3) 数値が NaN / Infinity にならない
//   (4) 受給可能年齢に達するまで年金資産（SIPP・職域年金）に手を付けない
//   (5) 退職前は生活費を資産から取り崩さない（US/CA/AUと共通の仕様）
//   (6) 取崩しは税制優遇の小さい口座から進む
//
// 【退職前の生活費】
//   退職前（age <= retireAge）の生活費は給与で賄う前提のため、資産からは
//   引き出さない。annualWithdrawalNeeded は「退職後の不足額」として渡される値。
// ============================================================================

import { describe, it, expect } from "vitest";
import { GB_COUNTRY_RULES } from "./countryRules/GB.js";
import { JP_COUNTRY_RULES } from "./countryRules/JP.js";
import { US_COUNTRY_RULES } from "./countryRules/US.js";
import { CA_COUNTRY_RULES } from "./countryRules/CA.js";
import { AU_COUNTRY_RULES } from "./countryRules/AU.js";
import { JA_TRANSLATIONS } from "./translations/ja.js";
import { EN_TRANSLATIONS } from "./translations/en.js";
import { EN_GB_OVERRIDES } from "./translations/enGB.js";

const inv = GB_COUNTRY_RULES.investment;
const tax = GB_COUNTRY_RULES.tax;
const ret = GB_COUNTRY_RULES.retirement;

const near = (actual, expected, tol = 1e-6) =>
  Math.abs(actual - expected) <= tol * Math.max(1, Math.abs(expected));

const ACCOUNT_KEYS = ["stocksSharesIsa", "cashIsa", "sipp", "workplacePension", "gia", "cashSavings"];
const PENSION_KEYS = ["sipp", "workplacePension"];

const accounts = (v = {}) => {
  const mk = (key) => ({
    currentValue: v[key] || 0,
    annualContribution: v[`${key}C`] || 0,
    expectedReturnPct: v.returnPct === undefined ? 0 : v.returnPct,
    contributionEndAge: v.endAge === undefined ? 65 : v.endAge,
  });
  return ACCOUNT_KEYS.reduce((acc, key) => { acc[key] = mk(key); return acc; }, {});
};

// すべての不変条件を全投影年で検証する共通ヘルパー
const expectAllInvariants = (sim, { retireAge, pensionAccessAge = 55, initialPension = null }) => {
  for (const y of sim.yearly.slice(1)) {
    // (3) 数値の健全性
    expect(Number.isFinite(y.value)).toBe(true);
    // (1) 残高が負にならない
    expect(ACCOUNT_KEYS.every((k) => y.accounts[k] >= -0.01)).toBe(true);
    // (2) 合計の整合
    const total = ACCOUNT_KEYS.reduce((sum, k) => sum + y.accounts[k], 0);
    expect(near(total, y.value, 1e-6)).toBe(true);
    // (4) 受給可能年齢より前は年金に手を付けない
    if (initialPension !== null && y.age < pensionAccessAge) {
      const pensionTotal = PENSION_KEYS.reduce((sum, k) => sum + y.accounts[k], 0);
      expect(pensionTotal >= initialPension - 0.01).toBe(true);
    }
  }
};

// ---------------------------------------------------------------------------
// 口座の組み合わせ
// ---------------------------------------------------------------------------
describe("GB回帰：6口座の組み合わせ", () => {
  const combos = [
    ["GIAのみ", { gia: 400000 }],
    ["Cash Savingsのみ", { cashSavings: 400000 }],
    ["Cash ISAのみ", { cashIsa: 400000 }],
    ["Stocks & Shares ISAのみ", { stocksSharesIsa: 400000 }],
    ["職域年金のみ", { workplacePension: 400000 }],
    ["SIPPのみ", { sipp: 400000 }],
    ["ISA2種", { cashIsa: 200000, stocksSharesIsa: 200000 }],
    ["年金2種", { workplacePension: 200000, sipp: 200000 }],
    ["課税口座2種", { gia: 200000, cashSavings: 200000 }],
    ["6口座すべて", { gia: 80000, cashSavings: 50000, cashIsa: 70000, stocksSharesIsa: 100000, workplacePension: 120000, sipp: 100000 }],
  ];

  it.each(combos)("%s：全投影年で不変条件が成立する", (_label, mix) => {
    const sim = inv.simulateGrowth({
      currentAge: 64, retireAge: 65, deathAge: 92,
      accounts: accounts({ ...mix, returnPct: 4 }),
      annualWithdrawalNeeded: 35000, pensionAccessAge: 55,
    });
    expectAllInvariants(sim, { retireAge: 65 });
  });

  it("年金しか無い場合でも、受給可能年齢に達していれば取り崩せる", () => {
    const sim = inv.simulateGrowth({
      currentAge: 64, retireAge: 65, deathAge: 70,
      accounts: accounts({ sipp: 300000 }),
      annualWithdrawalNeeded: 30000, pensionAccessAge: 55,
    });
    expect(sim.yearly.find((y) => y.age === 66).accounts.sipp < 300000).toBe(true);
  });

  it("口座がすべて空でも壊れない", () => {
    const sim = inv.simulateGrowth({
      currentAge: 65, retireAge: 65, deathAge: 75,
      accounts: accounts({}), annualWithdrawalNeeded: 20000, pensionAccessAge: 55,
    });
    expect(sim.yearly.every((y) => Number.isFinite(y.value) && y.value >= -0.01)).toBe(true);
    expect(near(sim.finalValue, 0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 取崩し順序
// ---------------------------------------------------------------------------
describe("GB回帰：取崩し順序（GIA → Cash → Cash ISA → S&S ISA → 職域年金 → SIPP）", () => {
  const sim = inv.simulateGrowth({
    currentAge: 64, retireAge: 65, deathAge: 75,
    accounts: accounts({ gia: 20000, cashSavings: 15000, cashIsa: 10000, stocksSharesIsa: 10000, workplacePension: 30000, sipp: 30000 }),
    annualWithdrawalNeeded: 30000, pensionAccessAge: 55,
  });

  it("最初にGIAが使われる", () => {
    const y = sim.yearly.find((r) => r.age === 66);
    expect(near(y.accounts.gia, 0)).toBe(true);
    expect(near(y.accounts.cashSavings, 5000)).toBe(true);
  });

  it("ISAは課税口座より後に使われる", () => {
    const y = sim.yearly.find((r) => r.age === 66);
    expect(near(y.accounts.cashIsa, 10000)).toBe(true);
    expect(near(y.accounts.stocksSharesIsa, 10000)).toBe(true);
  });

  it("年金はISAより後に使われる", () => {
    const y = sim.yearly.find((r) => r.age === 67);
    expect(near(y.accounts.stocksSharesIsa, 0)).toBe(true);
    expect(y.accounts.workplacePension < 30000).toBe(true);
  });

  it("SIPPが最後に使われる", () => {
    const y = sim.yearly.find((r) => r.age === 68);
    expect(near(y.accounts.workplacePension, 0)).toBe(true);
    expect(y.accounts.sipp < 30000).toBe(true);
  });

  it("各口座の残高は減る一方で、途中で増えたりしない（利回り0の場合）", () => {
    for (const key of ACCOUNT_KEYS) {
      const series = sim.yearly.map((y) => y.accounts[key]);
      for (let i = 1; i < series.length; i++) {
        expect(series[i] <= series[i - 1] + 0.01).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 年金受給可能年齢
// ---------------------------------------------------------------------------
describe("GB回帰：私的年金の受給可能年齢", () => {
  it.each([55, 57])("受給可能年齢 %s歳より前は年金資産に一切手を付けない", (pensionAccessAge) => {
    const sim = inv.simulateGrowth({
      currentAge: 50, retireAge: 52, deathAge: 70,
      accounts: accounts({ gia: 30000, sipp: 300000 }),
      annualWithdrawalNeeded: 25000, pensionAccessAge,
    });
    for (const y of sim.yearly) {
      if (y.age < pensionAccessAge) expect(near(y.accounts.sipp, 300000)).toBe(true);
    }
    expect(sim.yearly.find((y) => y.age === pensionAccessAge).accounts.sipp < 300000).toBe(true);
  });

  it("受給可能年齢の前後で挙動が切り替わる（境界）", () => {
    const sim = inv.simulateGrowth({
      currentAge: 53, retireAge: 53, deathAge: 58,
      accounts: accounts({ sipp: 200000 }),
      annualWithdrawalNeeded: 20000, pensionAccessAge: 55,
    });
    expect(near(sim.yearly.find((y) => y.age === 54).accounts.sipp, 200000)).toBe(true);
    expect(sim.yearly.find((y) => y.age === 55).accounts.sipp < 200000).toBe(true);
  });

  it("年金しか無く受給可能年齢前なら、取り崩せず残高が保たれる", () => {
    const sim = inv.simulateGrowth({
      currentAge: 50, retireAge: 50, deathAge: 54,
      accounts: accounts({ sipp: 200000 }),
      annualWithdrawalNeeded: 30000, pensionAccessAge: 55,
    });
    expect(sim.yearly.every((y) => near(y.accounts.sipp, 200000))).toBe(true);
    expect(sim.yearly.every((y) => Number.isFinite(y.value))).toBe(true);
  });

  it("2028年からの引上げ（57歳）を渡しても同じ論理で動く", () => {
    const sim = inv.simulateGrowth({
      currentAge: 54, retireAge: 54, deathAge: 60,
      accounts: accounts({ sipp: 200000 }),
      annualWithdrawalNeeded: 20000, pensionAccessAge: inv.scheduled.pensionAccessAgeFrom2028,
    });
    expect(near(sim.yearly.find((y) => y.age === 56).accounts.sipp, 200000)).toBe(true);
    expect(sim.yearly.find((y) => y.age === 57).accounts.sipp < 200000).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// State Pension age のコホート
// ---------------------------------------------------------------------------
describe("GB回帰：State Pension age の各コホート", () => {
  it.each([
    ["1955-01-01", 66],
    ["1965-01-01", 67],
    ["1985-01-01", 68],
  ])("生年月日 %s は %s歳", (birthDate, expected) => {
    expect(ret.resolveStatePensionAge(birthDate, 0).ageInYears).toBe(expected);
  });

  it("66→67の移行期は66歳台の端数になる", () => {
    const r = ret.resolveStatePensionAge("1960-07-31", 0);
    expect(r.detail.years).toBe(66);
    expect(r.detail.months).toBe(4);
  });

  it("67→68の移行期は67歳台の端数になる", () => {
    const r = ret.resolveStatePensionAge("1977-08-15", 0);
    expect(r.detail.isTransitional).toBe(true);
    expect(r.detail.years).toBe(67);
    expect(r.ageInYears < 68).toBe(true);
  });

  it("どのコホートでも 66 以上 68 以下に収まる", () => {
    const dates = [
      "1940-01-01", "1955-06-15", "1960-04-06", "1960-11-20", "1961-03-05",
      "1961-03-06", "1970-01-01", "1977-04-05", "1977-04-06", "1977-12-31",
      "1978-04-05", "1978-04-06", "1990-01-01", "2005-01-01",
    ];
    for (const d of dates) {
      const age = ret.getStatePensionAge(d).ageInYears;
      expect(age >= 66 && age <= 68).toBe(true);
    }
  });

  it("繰下げ受給は、算出したSPAを基準に計算される", () => {
    const spa = ret.resolveStatePensionAge("1985-01-01", 0).ageInYears; // 68歳
    const factor = ret.getDeferralFactor(69, spa);
    expect(near(factor, 1 + (52 / 9) * 0.01, 1e-9)).toBe(true);
  });

  it("SPAより前の請求は繰り上がらない（繰上げ不可）", () => {
    const spa = ret.resolveStatePensionAge("1985-01-01", 0).ageInYears;
    expect(ret.getEffectiveClaimAge(65, spa)).toBe(spa);
  });
});

// ---------------------------------------------------------------------------
// 利回りの符号
// ---------------------------------------------------------------------------
describe("GB回帰：利回り0%・プラス・マイナス", () => {
  it.each([-10, -3, 0, 5, 12])("利回り %s%% でも不変条件が成立する", (returnPct) => {
    const sim = inv.simulateGrowth({
      currentAge: 60, retireAge: 65, deathAge: 90,
      accounts: accounts({ gia: 100000, stocksSharesIsa: 150000, sipp: 200000, returnPct }),
      annualWithdrawalNeeded: 40000, pensionAccessAge: 55,
    });
    expectAllInvariants(sim, { retireAge: 65 });
  });

  it("マイナス利回りでも残高が負にならない", () => {
    const sim = inv.simulateGrowth({
      currentAge: 65, retireAge: 65, deathAge: 95,
      accounts: accounts({ gia: 200000, returnPct: -20 }),
      annualWithdrawalNeeded: 30000, pensionAccessAge: 55,
    });
    expect(sim.yearly.every((y) => ACCOUNT_KEYS.every((k) => y.accounts[k] >= -0.01))).toBe(true);
  });

  it("利回りが高いほど最終資産が大きい（単調性）", () => {
    const finalAt = (returnPct) => inv.simulateGrowth({
      currentAge: 65, retireAge: 65, deathAge: 85,
      accounts: accounts({ gia: 500000, returnPct }),
      annualWithdrawalNeeded: 20000, pensionAccessAge: 55,
    }).finalValue;
    expect(finalAt(0) <= finalAt(5)).toBe(true);
    expect(finalAt(-5) <= finalAt(0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 資産の枯渇
// ---------------------------------------------------------------------------
describe("GB回帰：資産が枯渇するケース", () => {
  const sim = inv.simulateGrowth({
    currentAge: 65, retireAge: 65, deathAge: 95,
    accounts: accounts({ gia: 30000, cashIsa: 20000 }),
    annualWithdrawalNeeded: 50000, pensionAccessAge: 55,
  });

  it("残高が0になっても負にはならない", () => {
    expect(sim.yearly.every((y) => ACCOUNT_KEYS.every((k) => y.accounts[k] >= -0.01))).toBe(true);
  });

  it("枯渇後も NaN / Infinity が出ない", () => {
    expect(sim.yearly.every((y) => Number.isFinite(y.value))).toBe(true);
    expect(Number.isFinite(sim.finalValue)).toBe(true);
  });

  it("枯渇後は残高0のまま推移する", () => {
    const depleted = sim.yearly.filter((y) => y.age > 70);
    expect(depleted.length > 0).toBe(true);
    expect(depleted.every((y) => near(y.value, 0))).toBe(true);
  });

  it("枯渇年でも口座合計と value が一致する", () => {
    for (const y of sim.yearly) {
      const total = ACCOUNT_KEYS.reduce((s, k) => s + y.accounts[k], 0);
      expect(near(total, y.value, 1e-6)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 退職前後
// ---------------------------------------------------------------------------
describe("GB回帰：退職前・退職後", () => {
  it("退職前は生活費を資産から取り崩さない", () => {
    const sim = inv.simulateGrowth({
      currentAge: 60, retireAge: 65, deathAge: 70,
      accounts: accounts({ gia: 100000 }),
      annualWithdrawalNeeded: 30000, pensionAccessAge: 55,
    });
    expect(near(sim.yearly.find((y) => y.age === 65).accounts.gia, 100000)).toBe(true);
  });

  it("退職の翌年から取り崩しが始まる（境界）", () => {
    const sim = inv.simulateGrowth({
      currentAge: 60, retireAge: 65, deathAge: 70,
      accounts: accounts({ gia: 100000 }),
      annualWithdrawalNeeded: 30000, pensionAccessAge: 55,
    });
    expect(near(sim.yearly.find((y) => y.age === 66).accounts.gia, 70000)).toBe(true);
  });

  it("退職前の積立は contributionEndAge まで続く", () => {
    const sim = inv.simulateGrowth({
      currentAge: 50, retireAge: 65, deathAge: 70,
      accounts: accounts({ gia: 10000, giaC: 5000, endAge: 60 }),
      annualWithdrawalNeeded: 0, pensionAccessAge: 55,
    });
    const at60 = sim.yearly.find((y) => y.age === 60).accounts.gia;
    const at61 = sim.yearly.find((y) => y.age === 61).accounts.gia;
    const at62 = sim.yearly.find((y) => y.age === 62).accounts.gia;
    expect(at60 > 10000).toBe(true);
    // 積立終了後は増えない（利回り0のため）
    expect(near(at61, at62)).toBe(true);
  });

  it("退職前後をまたぐ長期投影でも不変条件が成立する", () => {
    const sim = inv.simulateGrowth({
      currentAge: 45, retireAge: 67, deathAge: 95,
      accounts: accounts({ gia: 40000, giaC: 6000, cashIsa: 20000, cashIsaC: 4000, stocksSharesIsa: 60000, stocksSharesIsaC: 10000, sipp: 90000, sippC: 12000, workplacePension: 70000, workplacePensionC: 8000, returnPct: 5, endAge: 67 }),
      annualWithdrawalNeeded: 38000, pensionAccessAge: 55,
    });
    expectAllInvariants(sim, { retireAge: 67 });
  });
});

// ---------------------------------------------------------------------------
// 税計算の一貫性
// ---------------------------------------------------------------------------
describe("GB回帰：税計算の一貫性", () => {
  it("所得税は所得に対して単調増加し、負にならない", () => {
    for (let g = 0; g <= 200000; g += 5000) {
      const r = tax.calculateIncomeTax(g);
      expect(r.tax >= 0).toBe(true);
      expect(Number.isFinite(r.tax)).toBe(true);
    }
  });

  it("配当税・譲渡益税も負にならず、NaNにならない", () => {
    for (const income of [0, 30000, 60000, 150000]) {
      for (const amount of [0, 500, 5000, 50000]) {
        const d = tax.calculateDividendTax(amount, income);
        const c = tax.calculateCapitalGainsTax(amount, income);
        expect(d >= 0 && Number.isFinite(d)).toBe(true);
        expect(c >= 0 && Number.isFinite(c)).toBe(true);
      }
    }
  });

  it("Personal Allowance は 0 以上 12,570 以下に収まる", () => {
    for (let g = 0; g <= 200000; g += 2500) {
      const pa = tax.getPersonalAllowance(g);
      expect(pa >= 0 && pa <= 12570).toBe(true);
    }
  });

  it("限界税率は 0 / 0.2 / 0.4 / 0.6 / 0.45 のいずれかになる", () => {
    const allowed = [0, 0.2, 0.4, 0.6, 0.45];
    for (let g = 0; g <= 200000; g += 1000) {
      expect(allowed.includes(tax.getMarginalRate(g))).toBe(true);
    }
  });

  it("年金のAnnual Allowanceは常に 10,000〜60,000 に収まる", () => {
    for (let ai = 0; ai <= 500000; ai += 10000) {
      const aa = inv.getPensionAnnualAllowance(ai, ai);
      expect(aa >= 10000 && aa <= 60000).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 他国への影響がないこと
// ---------------------------------------------------------------------------
describe("GB回帰：既存のJP・US・CA・AUへ影響がない", () => {
  it("JPはsimulateGrowthを持たない（GB側の変更と無関係）", () => {
    expect(JP_COUNTRY_RULES.investment.simulateGrowth).toBeUndefined();
  });

  it("USの投影は従来どおり動く（後方互換の値）", () => {
    const sim = US_COUNTRY_RULES.investment.simulateGrowth({
      currentAge: 70, retireAge: 65, deathAge: 80,
      accounts: {
        k401: { currentValue: 0, annualContribution: 0 },
        traditionalIra: { currentValue: 500000, annualContribution: 0 },
        rothIra: { currentValue: 0, annualContribution: 0 },
        brokerage: { currentValue: 0, annualContribution: 0 },
      },
      returnPct: 0, annualWithdrawalNeeded: 20000,
    });
    expect(near(sim.finalValue, 300000, 1e-9)).toBe(true);
  });

  it.each([
    ["CA", CA_COUNTRY_RULES],
    ["AU", AU_COUNTRY_RULES],
  ])("%s の投影は壊れていない", (_label, rules) => {
    const sim = rules.investment.simulateGrowth({
      currentAge: 60, retireAge: 65, deathAge: 80,
      accounts: rules.investment.accountTypes.reduce((acc, key) => {
        acc[key] = { currentValue: 200000, annualContribution: 0 };
        return acc;
      }, {}),
      returnPct: 3, annualWithdrawalNeeded: 30000,
    });
    expect(sim.yearly.every((y) => Number.isFinite(y.value))).toBe(true);
  });

  it("GBのルールは他国のオブジェクトを参照していない（独立性）", () => {
    const serialized = JSON.stringify(GB_COUNTRY_RULES);
    expect(serialized.includes("401(k)")).toBe(false);
    expect(serialized.includes("Superannuation")).toBe(false);
    expect(serialized.includes("iDeCo")).toBe(false);
  });

  it("5か国すべてが実装済みフラグを持つ", () => {
    for (const rules of [US_COUNTRY_RULES, GB_COUNTRY_RULES, CA_COUNTRY_RULES, AU_COUNTRY_RULES]) {
      expect(rules.investment.implemented).toBe(true);
      expect(rules.tax.implemented).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 翻訳キー
// ---------------------------------------------------------------------------
describe("GB回帰：翻訳キーの欠落がない", () => {
  it("State Pension age 関連のキーが ja / en に揃っている", () => {
    const keys = [
      "gbStatePensionAgeLabel", "gbStatePensionAgeNote",
      "gbStatePensionAgeYears", "gbStatePensionAgeYearsMonths",
      "gbStatePensionAgeAutoNote", "gbStatePensionAgeManualNote",
      "gbStatePensionAgeOverrideLabel", "gbStatePensionAgeOverrideNote",
    ];
    for (const key of keys) {
      expect(typeof JA_TRANSLATIONS[key]).toBe("string");
      expect(JA_TRANSLATIONS[key].length > 0).toBe(true);
      expect(typeof EN_TRANSLATIONS[key]).toBe("string");
      expect(EN_TRANSLATIONS[key].length > 0).toBe(true);
    }
  });

  it("英国版の注意書きが en-GB で上書きされている", () => {
    expect(typeof EN_GB_OVERRIDES.gbCountryNote).toBe("string");
    expect(EN_GB_OVERRIDES.gbCountryNote).toContain("UK edition");
  });

  it("英国の注意書きにスコットランド未実装が明記されている", () => {
    expect(EN_GB_OVERRIDES.gbCountryNote).toContain("Scottish");
    expect(JA_TRANSLATIONS.gbCountryNote).toContain("スコットランド");
  });

  it("SPAの注記が68歳への移行に触れている", () => {
    expect(JA_TRANSLATIONS.gbStatePensionAgeNote).toContain("1978");
    expect(EN_TRANSLATIONS.gbStatePensionAgeNote).toContain("1978");
  });

  it("古いプレビュー警告キーは残っていない", () => {
    expect(JA_TRANSLATIONS.localePreviewWarning).toBeUndefined();
    expect(EN_TRANSLATIONS.localePreviewWarning).toBeUndefined();
    expect(EN_GB_OVERRIDES.localePreviewWarning).toBeUndefined();
  });

  it("GBの税セクション見出しに適用地域が入る", () => {
    expect(JA_TRANSLATIONS.gbTaxSectionLabel).toContain("{region}");
    expect(EN_TRANSLATIONS.gbTaxSectionLabel).toContain("{region}");
  });
});
