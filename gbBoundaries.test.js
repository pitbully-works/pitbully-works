// ============================================================================
// gbBoundaries.test.js
// 【GB段階2】英国版の境界値テスト。2026/27課税年度（2026年4月6日〜2027年4月5日）。
//
// 【出典】すべて GOV.UK / HMRC の公表値。
//   - Income Tax rates and Personal Allowances : https://www.gov.uk/income-tax-rates
//   - Personal Allowance の逓減            : https://www.gov.uk/income-tax-rates/income-over-100000
//   - Tax on dividends                     : https://www.gov.uk/tax-on-dividends
//   - Capital Gains Tax rates              : https://www.gov.uk/capital-gains-tax/rates
//   - ISAs                                 : https://www.gov.uk/individual-savings-accounts
//   - Pension Annual Allowance             : https://www.gov.uk/tax-on-your-private-pension/annual-allowance
//   配当税率は Autumn Budget 2025 / Finance Act 2026 により2026年4月6日から
//   基本・高税率が2ポイント引上げ（8.75→10.75%、33.75→35.75%）。
//
// 【適用地域】England / Wales / Northern Ireland のみ。
//   スコットランドの非貯蓄・非配当所得の税率は未実装（gbStatePensionAge.test.js で固定）。
//
// ルール定義そのものを検証するため、対象モジュールを直接読み込む。
// ============================================================================

import { describe, it, expect } from "vitest";
import { GB_COUNTRY_RULES } from "./countryRules/GB.js";

const inv = GB_COUNTRY_RULES.investment;
const tax = GB_COUNTRY_RULES.tax;
const ret = GB_COUNTRY_RULES.retirement;

const near = (actual, expected, tol = 1e-9) =>
  Math.abs(actual - expected) <= tol * Math.max(1, Math.abs(expected));

// 6口座ぶんの入力を組み立てるヘルパー
const accounts = (v = {}) => {
  const mk = (key) => ({
    currentValue: v[key] || 0,
    annualContribution: v[`${key}C`] || 0,
    expectedReturnPct: v.returnPct === undefined ? 0 : v.returnPct,
    contributionEndAge: v.contributionEndAge === undefined ? 65 : v.contributionEndAge,
  });
  return {
    stocksSharesIsa: mk("stocksSharesIsa"),
    cashIsa: mk("cashIsa"),
    sipp: mk("sipp"),
    workplacePension: mk("workplacePension"),
    gia: mk("gia"),
    cashSavings: mk("cashSavings"),
  };
};

// ---------------------------------------------------------------------------
// 制度上限そのもの
// ---------------------------------------------------------------------------
describe("GB境界：2026/27の制度上限が公表値どおり", () => {
  it("ISAの年間拠出上限は £20,000（Junior £9,000 / Lifetime £4,000）", () => {
    expect(inv.limits.isaAnnualAllowance).toBe(20000);
    expect(inv.limits.juniorIsaAnnual).toBe(9000);
    expect(inv.limits.lifetimeIsaAnnual).toBe(4000);
  });

  it("年金のAnnual Allowanceは £60,000、テーパ後の下限は £10,000", () => {
    expect(inv.limits.pensionAnnualAllowance).toBe(60000);
    expect(inv.limits.pensionAnnualAllowanceFloor).toBe(10000);
    expect(inv.limits.moneyPurchaseAnnualAllowance).toBe(10000);
  });

  it("テーパの閾値は threshold income £200,000 / adjusted income £260,000", () => {
    expect(inv.limits.pensionTaperThresholdIncome).toBe(200000);
    expect(inv.limits.pensionTaperAdjustedIncome).toBe(260000);
  });

  it("非課税一時金は年金資産の25%、Lump Sum Allowanceは £268,275", () => {
    expect(inv.taxFreeLumpSumRate).toBe(0.25);
    expect(inv.lumpSumAllowance).toBe(268275);
  });

  it("私的年金の受給可能最低年齢は55歳（2028年4月から57歳へ引上げ予定）", () => {
    expect(inv.pensionAccessAge).toBe(55);
    expect(inv.scheduled.pensionAccessAgeFrom2028).toBe(57);
    expect(inv.scheduled.pensionAccessAgeEffectiveDate).toBe("2028-04-06");
  });

  it("2027年4月からのCash ISA上限（65歳未満 £12,000）は予定として保持し、まだ適用しない", () => {
    expect(inv.scheduled.cashIsaLimitUnder65From2027).toBe(12000);
    expect(inv.scheduled.cashIsaLimitEffectiveDate).toBe("2027-04-06");
    // 2026/27の計算には反映されていない
    expect(inv.getIsaAnnualAllowance()).toBe(20000);
  });

  it("対象課税年度が 2026/27 と明示されている", () => {
    expect(inv.effectiveTaxYear).toBe("2026/27");
    expect(tax.effectiveTaxYear).toBe("2026/27");
    expect(ret.effectiveTaxYear).toBe("2026/27");
  });
});

// ---------------------------------------------------------------------------
// ISA枠
// ---------------------------------------------------------------------------
describe("GB境界：ISA枠の消化と残枠", () => {
  it("Stocks and Shares ISA と Cash ISA の拠出は合算される", () => {
    const a = accounts({ stocksSharesIsaC: 12000, cashIsaC: 5000 });
    expect(inv.getIsaContributed(a)).toBe(17000);
    expect(inv.getIsaRemaining(a)).toBe(3000);
  });

  it("上限ちょうどで残枠ゼロになる（境界）", () => {
    const a = accounts({ stocksSharesIsaC: 20000 });
    expect(inv.getIsaRemaining(a)).toBe(0);
  });

  it("上限を超えると残枠がマイナスで返る（超過を検知できる）", () => {
    const a = accounts({ stocksSharesIsaC: 15000, cashIsaC: 8000 });
    expect(inv.getIsaRemaining(a)).toBe(-3000);
  });

  it("口座が未定義でも0として扱い、壊れない", () => {
    expect(inv.getIsaContributed({})).toBe(0);
    expect(inv.getIsaRemaining({})).toBe(20000);
  });
});

// ---------------------------------------------------------------------------
// 年金Annual Allowanceのテーパ
// ---------------------------------------------------------------------------
describe("GB境界：年金Annual Allowanceのテーパリング", () => {
  it("threshold income が £200,000 以下なら満額（境界）", () => {
    expect(inv.getPensionAnnualAllowance(300000, 200000)).toBe(60000);
  });

  it("adjusted income が £260,000 以下なら満額（境界）", () => {
    expect(inv.getPensionAnnualAllowance(260000, 210000)).toBe(60000);
  });

  it("£260,000 超は £2 につき £1 ずつ減る", () => {
    // 280,000 → (280,000 − 260,000) / 2 = 10,000 減 → 50,000
    expect(inv.getPensionAnnualAllowance(280000, 240000)).toBe(50000);
    // 300,000 → 20,000 減 → 40,000
    expect(inv.getPensionAnnualAllowance(300000, 240000)).toBe(40000);
  });

  it("下限 £10,000 を下回らない", () => {
    expect(inv.getPensionAnnualAllowance(360000, 300000)).toBe(10000);
    expect(inv.getPensionAnnualAllowance(1000000, 900000)).toBe(10000);
  });

  it("thresholdIncome を省略した場合は adjustedIncome と同じとみなす", () => {
    expect(inv.getPensionAnnualAllowance(300000)).toBe(inv.getPensionAnnualAllowance(300000, 300000));
  });

  it("SIPPと職域年金の拠出は合算され、残枠が計算できる", () => {
    const a = accounts({ sippC: 20000, workplacePensionC: 15000 });
    expect(inv.getPensionContributed(a)).toBe(35000);
    expect(inv.getPensionRemaining(a, 100000)).toBe(25000);
  });
});

// ---------------------------------------------------------------------------
// Personal Allowance の逓減
// ---------------------------------------------------------------------------
describe("GB境界：Personal Allowanceの逓減（£100,000超）", () => {
  it("£100,000 以下は満額 £12,570（境界）", () => {
    expect(tax.getPersonalAllowance(50000)).toBe(12570);
    expect(tax.getPersonalAllowance(100000)).toBe(12570);
  });

  it("£100,000 超は £2 につき £1 ずつ減る", () => {
    expect(tax.getPersonalAllowance(100002)).toBe(12569);
    expect(tax.getPersonalAllowance(110000)).toBe(7570);
    expect(tax.getPersonalAllowance(120000)).toBe(2570);
  });

  it("£125,140 でゼロになり、それ以上でもマイナスにならない（境界）", () => {
    expect(tax.getPersonalAllowance(125140)).toBe(0);
    expect(tax.getPersonalAllowance(125142)).toBe(0);
    expect(tax.getPersonalAllowance(500000)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 所得税バンド
// ---------------------------------------------------------------------------
describe("GB境界：所得税のバンド（England, Wales & NI）", () => {
  it("Personal Allowance 以下は非課税（境界）", () => {
    expect(tax.calculateIncomeTax(12570).tax).toBe(0);
    expect(near(tax.calculateIncomeTax(12571).tax, 0.20)).toBe(true);
  });

  it("Basic rate の上限 £50,270 でちょうど £7,540（境界）", () => {
    // (50,270 − 12,570) × 20% = 37,700 × 20% = 7,540
    expect(near(tax.calculateIncomeTax(50270).tax, 7540)).toBe(true);
  });

  it("£50,270 を超えた分は40%になる（境界）", () => {
    expect(near(tax.calculateIncomeTax(50271).tax, 7540 + 0.40)).toBe(true);
  });

  it("£125,140 では Personal Allowance がゼロで全額が課税所得になる", () => {
    const r = tax.calculateIncomeTax(125140);
    expect(r.personalAllowance).toBe(0);
    expect(r.taxableIncome).toBe(125140);
  });

  it("£125,140 超は45%（Additional rate）が適用される", () => {
    const a = tax.calculateIncomeTax(125140).tax;
    const b = tax.calculateIncomeTax(125141).tax;
    expect(near(b - a, 0.45)).toBe(true);
  });

  it("税額は所得に対して単調増加する", () => {
    const incomes = [0, 12570, 20000, 50270, 80000, 100000, 125140, 200000];
    const taxes = incomes.map((g) => tax.calculateIncomeTax(g).tax);
    for (let i = 1; i < taxes.length; i++) {
      expect(taxes[i] >= taxes[i - 1]).toBe(true);
    }
  });

  it("所得0・負の入力でも壊れない", () => {
    expect(tax.calculateIncomeTax(0).tax).toBe(0);
    expect(tax.calculateIncomeTax(-1000).tax).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 限界税率（60%の罠を含む）
// ---------------------------------------------------------------------------
describe("GB境界：限界税率", () => {
  it("Personal Allowance の範囲内は0%", () => {
    expect(tax.getMarginalRate(10000)).toBe(0);
  });

  it("Basic rate 帯は20%、Higher rate 帯は40%", () => {
    expect(tax.getMarginalRate(30000)).toBe(0.20);
    expect(tax.getMarginalRate(60000)).toBe(0.40);
  });

  it("£100,000〜£125,140 は実効60%になる（Personal Allowanceの逓減による）", () => {
    expect(tax.getMarginalRate(110000)).toBe(0.60);
  });

  it("£125,140 超は45%に戻る", () => {
    expect(tax.getMarginalRate(130000)).toBe(0.45);
  });
});

// ---------------------------------------------------------------------------
// 配当課税
// ---------------------------------------------------------------------------
describe("GB境界：配当課税（2026/27で2ポイント引上げ後）", () => {
  it("税率は 10.75% / 35.75% / 39.35%、非課税枠は £500", () => {
    expect(tax.dividend.allowance).toBe(500);
    expect(tax.dividend.basicRate).toBe(0.1075);
    expect(tax.dividend.higherRate).toBe(0.3575);
    expect(tax.dividend.additionalRate).toBe(0.3935);
  });

  it("非課税枠 £500 までは課税されない（境界）", () => {
    expect(tax.calculateDividendTax(500, 20000)).toBe(0);
  });

  it("Basic rate 帯では超過分に10.75%", () => {
    // (1,000 − 500) × 10.75% = 53.75
    expect(near(tax.calculateDividendTax(1000, 20000), 53.75)).toBe(true);
  });

  it("Higher rate 帯では35.75%", () => {
    expect(near(tax.calculateDividendTax(1000, 60000), 178.75)).toBe(true);
  });

  it("Additional rate 帯では39.35%", () => {
    expect(near(tax.calculateDividendTax(1000, 150000), 196.75)).toBe(true);
  });

  it("配当ゼロなら課税もゼロ", () => {
    expect(tax.calculateDividendTax(0, 60000)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 譲渡益課税
// ---------------------------------------------------------------------------
describe("GB境界：譲渡益課税（Capital Gains Tax）", () => {
  it("年間非課税枠は £3,000、税率は18% / 24%", () => {
    expect(tax.capitalGains.annualExemptAmount).toBe(3000);
    expect(tax.capitalGains.basicRate).toBe(0.18);
    expect(tax.capitalGains.higherRate).toBe(0.24);
  });

  it("非課税枠 £3,000 までは課税されない（境界）", () => {
    expect(tax.calculateCapitalGainsTax(3000, 20000)).toBe(0);
    expect(near(tax.calculateCapitalGainsTax(3001, 20000), 0.18)).toBe(true);
  });

  it("Basic rate 帯に収まる利得は18%", () => {
    // (10,000 − 3,000) × 18% = 1,260
    expect(near(tax.calculateCapitalGainsTax(10000, 20000), 1260)).toBe(true);
  });

  it("Basic rate 帯を使い切っていれば24%", () => {
    // 収入60,000で基本税率帯は残っていない → (10,000 − 3,000) × 24% = 1,680
    expect(near(tax.calculateCapitalGainsTax(10000, 60000), 1680)).toBe(true);
  });

  it("利得が基本税率帯をまたぐ場合は18%と24%に分かれる", () => {
    // 収入40,000 → 基本税率帯の残り = 50,270 − 40,000 = 10,270
    const remaining = tax.getBasicRateBandRemaining(40000);
    const gain = 20000;
    const taxable = gain - 3000; // 17,000
    const expected = remaining * 0.18 + (taxable - remaining) * 0.24;
    expect(near(tax.calculateCapitalGainsTax(gain, 40000), expected)).toBe(true);
  });

  it("利得ゼロ・マイナスでも壊れない", () => {
    expect(tax.calculateCapitalGainsTax(0, 30000)).toBe(0);
    expect(tax.calculateCapitalGainsTax(-5000, 30000)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 年金拠出の税軽減
// ---------------------------------------------------------------------------
describe("GB境界：年金拠出による税軽減", () => {
  it("拠出額 × 限界税率で概算する", () => {
    expect(near(tax.calculatePensionTaxRelief(10000, 60000), 10000 * 0.40)).toBe(true);
    expect(near(tax.calculatePensionTaxRelief(10000, 30000), 10000 * 0.20)).toBe(true);
  });

  it("Annual Allowance を超える拠出分は軽減の対象にしない", () => {
    // 上限60,000に対し80,000拠出 → 60,000ぶんだけ軽減
    expect(near(tax.calculatePensionTaxRelief(80000, 60000, 60000), 60000 * 0.40)).toBe(true);
  });

  it("上限を指定しない場合は拠出全額が対象になる", () => {
    expect(near(tax.calculatePensionTaxRelief(80000, 60000), 80000 * 0.40)).toBe(true);
  });

  it("60%帯なら軽減額も60%で計算される", () => {
    expect(near(tax.calculatePensionTaxRelief(10000, 110000), 10000 * 0.60)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 貯蓄利子の非課税枠
// ---------------------------------------------------------------------------
describe("GB境界：Personal Savings Allowance", () => {
  it("Basic £1,000 / Higher £500 / Additional £0", () => {
    expect(tax.savings.personalSavingsAllowanceBasic).toBe(1000);
    expect(tax.savings.personalSavingsAllowanceHigher).toBe(500);
    expect(tax.savings.personalSavingsAllowanceAdditional).toBe(0);
  });

  it("2027年4月からの引上げ（22 / 42 / 47%）は予定として保持し、まだ適用しない", () => {
    expect(tax.savings.scheduledRatesFrom2027.basic).toBe(0.22);
    expect(tax.savings.scheduledRatesFrom2027.higher).toBe(0.42);
    expect(tax.savings.scheduledRatesFrom2027.additional).toBe(0.47);
  });

  it("貯蓄利子への課税額計算は未実装であることが明示されている", () => {
    const listed = tax.notImplemented.some((n) => n.includes("貯蓄利子"));
    expect(listed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ISA非課税
// ---------------------------------------------------------------------------
describe("GB境界：ISAは非課税", () => {
  it("ISA内の利子・配当・譲渡益は非課税として扱う", () => {
    expect(tax.isaTaxFree).toBe(true);
  });

  it("税制優遇口座にISAと年金が含まれている", () => {
    expect(inv.taxAdvantagedAccounts).toEqual(["stocksSharesIsa", "cashIsa", "sipp", "workplacePension"]);
    expect(inv.isaAccounts).toEqual(["stocksSharesIsa", "cashIsa"]);
    expect(inv.pensionAccounts).toEqual(["sipp", "workplacePension"]);
  });
});

// ---------------------------------------------------------------------------
// 投影：取崩し順序と年金アクセス年齢
// ---------------------------------------------------------------------------
describe("GB境界：投影での取崩し順序と年金アクセス年齢", () => {
  it("税制優遇の小さい口座から順に取り崩す（GIA → Cash → Cash ISA → S&S ISA → 職域年金 → SIPP）", () => {
    const sim = inv.simulateGrowth({
      currentAge: 64, retireAge: 65, deathAge: 70,
      accounts: accounts({ gia: 20000, cashSavings: 15000, cashIsa: 10000, stocksSharesIsa: 10000, workplacePension: 30000, sipp: 30000 }),
      annualWithdrawalNeeded: 30000, pensionAccessAge: 55,
    });
    const y66 = sim.yearly.find((y) => y.age === 66);
    // 1年目の30,000は GIA 20,000 → Cash 10,000 の順で賄われる
    expect(near(y66.accounts.gia, 0)).toBe(true);
    expect(near(y66.accounts.cashSavings, 5000)).toBe(true);
    expect(near(y66.accounts.cashIsa, 10000)).toBe(true);
    expect(near(y66.accounts.sipp, 30000)).toBe(true);
  });

  it("年金は最後に取り崩される（ISAより後）", () => {
    const sim = inv.simulateGrowth({
      currentAge: 64, retireAge: 65, deathAge: 70,
      accounts: accounts({ gia: 20000, cashSavings: 15000, cashIsa: 10000, stocksSharesIsa: 10000, workplacePension: 30000, sipp: 30000 }),
      annualWithdrawalNeeded: 30000, pensionAccessAge: 55,
    });
    const y67 = sim.yearly.find((y) => y.age === 67);
    // ISAまで使い切ってから職域年金に入る
    expect(near(y67.accounts.stocksSharesIsa, 0)).toBe(true);
    expect(y67.accounts.workplacePension < 30000).toBe(true);
    expect(near(y67.accounts.sipp, 30000)).toBe(true);
  });

  it("受給可能年齢（55歳）未満では年金資産に手を付けない（境界）", () => {
    const sim = inv.simulateGrowth({
      currentAge: 50, retireAge: 50, deathAge: 57,
      accounts: accounts({ gia: 10000, sipp: 200000 }),
      annualWithdrawalNeeded: 20000, pensionAccessAge: 55,
    });
    for (const y of sim.yearly) {
      if (y.age < 55) expect(near(y.accounts.sipp, 200000)).toBe(true);
    }
    // 55歳から取り崩しが始まる
    expect(sim.yearly.find((y) => y.age === 55).accounts.sipp < 200000).toBe(true);
  });

  it("どの年も残高が負にならない", () => {
    const sim = inv.simulateGrowth({
      currentAge: 55, retireAge: 60, deathAge: 95,
      accounts: accounts({ gia: 50000, cashSavings: 20000, cashIsa: 30000, stocksSharesIsa: 80000, workplacePension: 150000, sipp: 100000, returnPct: 3 }),
      annualWithdrawalNeeded: 45000, pensionAccessAge: 55,
    });
    expect(sim.yearly.every((y) => Object.values(y.accounts).every((v) => v >= -0.01))).toBe(true);
  });

  it("退職前は取り崩さない（GB/CA/AU/USと共通の仕様）", () => {
    const sim = inv.simulateGrowth({
      currentAge: 60, retireAge: 65, deathAge: 70,
      accounts: accounts({ gia: 100000 }),
      annualWithdrawalNeeded: 30000, pensionAccessAge: 55,
    });
    expect(near(sim.yearly.find((y) => y.age === 65).accounts.gia, 100000)).toBe(true);
    expect(sim.yearly.find((y) => y.age === 66).accounts.gia < 100000).toBe(true);
  });

  it("資産が尽きても NaN にならず、値も負にならない", () => {
    const sim = inv.simulateGrowth({
      currentAge: 65, retireAge: 65, deathAge: 90,
      accounts: accounts({ gia: 20000 }),
      annualWithdrawalNeeded: 40000, pensionAccessAge: 55,
    });
    expect(sim.yearly.every((y) => Number.isFinite(y.value) && y.value >= -0.01)).toBe(true);
    expect(Number.isFinite(sim.finalValue)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 未実装項目の明示
// ---------------------------------------------------------------------------
describe("GB境界：未実装項目が明示されている", () => {
  it("税セクションの未実装リストに主要項目が挙がっている", () => {
    const joined = tax.notImplemented.join(" ");
    expect(joined.includes("National Insurance")).toBe(true);
    expect(joined.includes("Inheritance Tax")).toBe(true);
  });

  it("年金セクションの未実装リストが存在する", () => {
    expect(Array.isArray(ret.notImplemented)).toBe(true);
    expect(ret.notImplemented.length > 0).toBe(true);
  });

  it("実装済み扱いのセクションはすべて implemented: true", () => {
    expect(inv.implemented).toBe(true);
    expect(ret.implemented).toBe(true);
    expect(tax.implemented).toBe(true);
    expect(GB_COUNTRY_RULES.healthcare.implemented).toBe(true);
  });

  it("labels は未実装ノートを指していない", () => {
    expect(GB_COUNTRY_RULES.labels.investmentNote).toBe(null);
    expect(GB_COUNTRY_RULES.labels.retirementNote).toBe(null);
    expect(GB_COUNTRY_RULES.labels.healthcareNote).toBe(null);
  });
});
