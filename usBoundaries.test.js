// ============================================================================
// usBoundaries.test.js
// 米国版（US_COUNTRY_RULES）の「制度数値」と「境界値」を固定する回帰テスト。
//
// 目的：
//   1. 2026年の公式数値（IRS / CMS / SSA）が、将来のリファクタで壊れないよう固定する。
//   2. しきい値の“崖”や phase-out の端点など、間違えやすい境界を明示的に検証する。
//
// 出典（2026年）：
//   - 拠出上限・catch-up・phase-out : IRS Notice 2025-67
//   - 連邦所得税・標準控除・長期CG   : IRS Revenue Procedure 2025-32
//   - Medicare Part B / IRMAA        : CMS 2026 Parts A & B Premiums（2025-11-14発表）
//   - Social Security                : SSA（1960年以降生まれのFRAは67歳）
// ============================================================================

import { describe, it, expect } from "vitest";
// ルール定義そのものを検証するテストなので、対象モジュールを直接読み込む。
// App.jsx からも同じオブジェクトを取得できるが、そちらを経由すると
// React / recharts など画面側の依存まで巻き込み、UI側の不具合でこのテストまで
// 落ちてしまうため、countryRules/US.js を直接読む。
import { US_COUNTRY_RULES } from "./countryRules/US.js";

const inv = US_COUNTRY_RULES.investment;
const ret = US_COUNTRY_RULES.retirement;
const hc = US_COUNTRY_RULES.healthcare;
const tax = US_COUNTRY_RULES.tax;

const near = (actual, expected, tol = 1e-6) =>
  Math.abs(actual - expected) <= tol * Math.max(1, Math.abs(expected));

describe("US 2026 official figures (contribution limits)", () => {
  it("401(k) elective deferral / catch-up / §415(c) match IRS Notice 2025-67", () => {
    expect(inv.limits2026.k401.employeeDeferral).toBe(24500);
    expect(inv.limits2026.k401.catchUp50).toBe(8000);
    expect(inv.limits2026.k401.catchUp60to63).toBe(11250);
    expect(inv.limits2026.k401.combinedEmployerEmployee).toBe(72000);
  });

  it("IRA contribution / catch-up match IRS Notice 2025-67", () => {
    expect(inv.limits2026.ira.contribution).toBe(7500);
    expect(inv.limits2026.ira.catchUp50).toBe(1100);
  });
});

describe("US 401(k) limit boundaries by age", () => {
  it("under 50 gets no catch-up", () => {
    expect(inv.get401kEmployeeLimit(49)).toBe(24500);
  });

  it("turns 50 exactly -> standard catch-up applies (boundary)", () => {
    expect(inv.get401kEmployeeLimit(50)).toBe(24500 + 8000); // 32,500
  });

  it("ages 60-63 get the super catch-up, and 59 / 64 do not (both boundaries)", () => {
    expect(inv.get401kEmployeeLimit(59)).toBe(24500 + 8000);
    expect(inv.get401kEmployeeLimit(60)).toBe(24500 + 11250); // 35,750
    expect(inv.get401kEmployeeLimit(63)).toBe(24500 + 11250);
    expect(inv.get401kEmployeeLimit(64)).toBe(24500 + 8000); // 64歳で標準catch-upに戻る
  });

  it("combined employee+employer limit adds the age-appropriate catch-up", () => {
    expect(inv.get401kCombinedLimit(40)).toBe(72000);
    expect(inv.get401kCombinedLimit(55)).toBe(72000 + 8000); // 80,000
    expect(inv.get401kCombinedLimit(61)).toBe(72000 + 11250);
  });
});

describe("US IRA limit boundaries by age", () => {
  it("under 50 vs exactly 50 (boundary)", () => {
    expect(inv.getIraContributionLimit(49)).toBe(7500);
    expect(inv.getIraContributionLimit(50)).toBe(8600); // 7,500 + 1,100
  });
});

describe("US Roth IRA MAGI phase-out endpoints", () => {
  it("single: full below start, zero at/after end, half at midpoint", () => {
    const [start, end] = inv.rothPhaseOut2026.single; // 153,000 - 168,000
    expect(start).toBe(153000);
    expect(end).toBe(168000);
    expect(inv.getRothIraEligibleFraction("single", start)).toBe(1);
    expect(inv.getRothIraEligibleFraction("single", start - 1)).toBe(1);
    expect(inv.getRothIraEligibleFraction("single", end)).toBe(0);
    expect(inv.getRothIraEligibleFraction("single", end + 1)).toBe(0);
    expect(near(inv.getRothIraEligibleFraction("single", (start + end) / 2), 0.5)).toBe(true);
  });

  it("married filing jointly uses its own (higher) range", () => {
    const [start, end] = inv.rothPhaseOut2026.marriedJoint; // 242,000 - 252,000
    expect(start).toBe(242000);
    expect(end).toBe(252000);
    expect(inv.getRothIraEligibleFraction("marriedJoint", 241999)).toBe(1);
    expect(inv.getRothIraEligibleFraction("marriedJoint", 252000)).toBe(0);
  });

  it("married filing separately range is 0-10,000 and is not inflation adjusted", () => {
    expect(inv.rothPhaseOut2026.marriedSeparate).toEqual([0, 10000]);
    expect(inv.getRothIraEligibleFraction("marriedSeparate", 10000)).toBe(0);
  });
});

describe("US Traditional IRA deductibility", () => {
  it("neither spouse covered by a workplace plan -> always fully deductible", () => {
    const f = inv.getTraditionalIraDeductibleFraction({
      filingStatus: "single",
      magi: 5_000_000,
      coveredByWorkplacePlan: false,
      spouseCoveredByWorkplacePlan: false,
    });
    expect(f).toBe(1);
  });

  it("covered single: phases out across 81,000 - 91,000 (endpoints)", () => {
    const base = { filingStatus: "single", coveredByWorkplacePlan: true, spouseCoveredByWorkplacePlan: false };
    expect(inv.getTraditionalIraDeductibleFraction({ ...base, magi: 81000 })).toBe(1);
    expect(inv.getTraditionalIraDeductibleFraction({ ...base, magi: 91000 })).toBe(0);
    expect(near(inv.getTraditionalIraDeductibleFraction({ ...base, magi: 86000 }), 0.5)).toBe(true);
  });

  it("only the spouse is covered (joint): uses the higher 242,000 - 252,000 range", () => {
    const base = { filingStatus: "marriedJoint", coveredByWorkplacePlan: false, spouseCoveredByWorkplacePlan: true };
    expect(inv.getTraditionalIraDeductibleFraction({ ...base, magi: 242000 })).toBe(1);
    expect(inv.getTraditionalIraDeductibleFraction({ ...base, magi: 252000 })).toBe(0);
  });
});

describe("US Social Security claiming factors (SSA rules)", () => {
  it("FRA is 67 and yields exactly the full benefit", () => {
    expect(ret.socialSecurity.fullRetirementAge).toBe(67);
    expect(near(ret.getClaimingFactor(67), 1)).toBe(true);
  });

  it("claiming at 62 (earliest) reduces to 70% for an FRA of 67", () => {
    // 60ヶ月早期 = 最初の36ヶ月×5/9% + 残り24ヶ月×5/12% = 20% + 10% = 30%減
    expect(near(ret.getClaimingFactor(62), 0.70, 1e-9)).toBe(true);
  });

  it("claiming at 70 (latest) increases by 24% and is capped beyond 70", () => {
    // 36ヶ月繰下げ × 2/3%/月 = 24%
    expect(near(ret.getClaimingFactor(70), 1.24, 1e-9)).toBe(true);
    expect(near(ret.getClaimingFactor(72), 1.24, 1e-9)).toBe(true); // 70歳で頭打ち
  });

  it("monthly benefit scales the user-entered PIA by the claiming factor", () => {
    expect(near(ret.getMonthlyBenefit(2000, 62), 1400, 1e-9)).toBe(true);
    expect(near(ret.getMonthlyBenefit(2000, 70), 2480, 1e-9)).toBe(true);
  });
});

describe("US Medicare Part B / IRMAA cliffs (CMS 2026)", () => {
  it("standard premium is $202.90/month", () => {
    expect(hc.medicare2026.standardPartB).toBe(202.90);
    expect(near(hc.getAnnualMedicarePartB("single", 50000), 202.90 * 12)).toBe(true);
  });

  it("single: $109,000 is still standard, $109,001 jumps a full tier (cliff)", () => {
    expect(near(hc.getAnnualMedicarePartB("single", 109000), 202.90 * 12)).toBe(true);
    expect(near(hc.getAnnualMedicarePartB("single", 109001), 284.10 * 12)).toBe(true);
  });

  it("married joint thresholds are double the single ones at the first tier", () => {
    expect(near(hc.getAnnualMedicarePartB("marriedJoint", 218000), 202.90 * 12)).toBe(true);
    expect(near(hc.getAnnualMedicarePartB("marriedJoint", 218001), 284.10 * 12)).toBe(true);
  });

  it("top tier is $689.90/month for very high income", () => {
    expect(near(hc.getAnnualMedicarePartB("single", 1_000_000), 689.90 * 12)).toBe(true);
    expect(near(hc.getAnnualMedicarePartB("marriedJoint", 2_000_000), 689.90 * 12)).toBe(true);
  });

  it("married filing separately skips the middle tiers", () => {
    expect(near(hc.getAnnualMedicarePartB("marriedSeparate", 109000), 202.90 * 12)).toBe(true);
    expect(near(hc.getAnnualMedicarePartB("marriedSeparate", 200000), 649.20 * 12)).toBe(true);
    expect(near(hc.getAnnualMedicarePartB("marriedSeparate", 391000), 689.90 * 12)).toBe(true);
  });
});

describe("US federal income tax (IRS Rev. Proc. 2025-32)", () => {
  it("standard deductions match the official 2026 amounts", () => {
    expect(tax.standardDeduction2026.single).toBe(16100);
    expect(tax.standardDeduction2026.marriedJoint).toBe(32200);
    expect(tax.standardDeduction2026.headOfHousehold).toBe(24150);
    expect(tax.standardDeduction2026.marriedSeparate).toBe(16100);
  });

  it("income at or below the standard deduction owes no tax (boundary)", () => {
    const r = tax.calculateFederalTax(16100, "single");
    expect(r.taxableIncome).toBe(0);
    expect(r.tax).toBe(0);
  });

  it("single filer with $85,000 gross matches a hand calculation", () => {
    // 課税所得 = 85,000 - 16,100 = 68,900
    // 12,400×10% + (50,400-12,400)×12% + (68,900-50,400)×22% = 1,240 + 4,560 + 4,070 = 9,870
    const r = tax.calculateFederalTax(85000, "single");
    expect(r.taxableIncome).toBe(68900);
    expect(near(r.tax, 9870, 1e-9)).toBe(true);
  });

  it("the 37% bracket starts above 640,600 (single) / 768,700 (joint)", () => {
    const single = tax.federalBrackets2026.single;
    const joint = tax.federalBrackets2026.marriedJoint;
    expect(single[single.length - 2].upTo).toBe(640600);
    expect(joint[joint.length - 2].upTo).toBe(768700);
    expect(single[single.length - 1].rate).toBe(0.37);
  });
});

describe("US long-term capital gains (stacked on ordinary income)", () => {
  it("0% bracket tops out at 49,450 single / 98,900 joint", () => {
    expect(tax.ltcgBrackets2026.single[0].upTo).toBe(49450);
    expect(tax.ltcgBrackets2026.marriedJoint[0].upTo).toBe(98900);
    expect(tax.ltcgBrackets2026.headOfHousehold[0].upTo).toBe(66200);
  });

  it("a gain entirely inside the 0% band is untaxed", () => {
    expect(tax.calculateLtcgTax(0, 49450, "single")).toBe(0);
  });

  it("a gain straddling the 0%/15% boundary is split correctly", () => {
    // 通常所得 40,000 の上に 20,000 の利益を積む。
    // 0%帯は 49,450 まで → 9,450 が0%、残り 10,550 が15% = 1,582.5
    const t = tax.calculateLtcgTax(40000, 20000, "single");
    expect(near(t, 1582.5, 1e-9)).toBe(true);
  });

  it("a gain fully above the 0% band is taxed at 15%", () => {
    const t = tax.calculateLtcgTax(100000, 10000, "single");
    expect(near(t, 1500, 1e-9)).toBe(true);
  });
});

describe("US Net Investment Income Tax (NIIT)", () => {
  it("rate is 3.8% and thresholds are the unindexed statutory amounts", () => {
    expect(tax.niitRate).toBe(0.038);
    expect(tax.niitThreshold.single).toBe(200000);
    expect(tax.niitThreshold.marriedJoint).toBe(250000);
    expect(tax.niitThreshold.marriedSeparate).toBe(125000);
  });

  it("no NIIT at or below the threshold (boundary)", () => {
    expect(tax.calculateNiit(200000, 50000, "single")).toBe(0);
  });

  it("applies to the lesser of the excess MAGI and the investment income", () => {
    // 超過 = 210,000 - 200,000 = 10,000、投資所得 50,000 → 小さい方 10,000 に 3.8%
    expect(near(tax.calculateNiit(210000, 50000, "single"), 380, 1e-9)).toBe(true);
    // 超過 100,000、投資所得 5,000 → 小さい方 5,000 に 3.8%
    expect(near(tax.calculateNiit(300000, 5000, "single"), 190, 1e-9)).toBe(true);
  });
});

describe("US early withdrawal split (59.5 boundary)", () => {
  const accounts = { k401: 100000, traditionalIra: 50000, rothIra: 30000, brokerage: 20000 };

  it("below 59.5: tax-deferred accounts count as restricted", () => {
    const s = inv.splitLiquidRestricted(59, accounts);
    expect(s.isAccessibleAge).toBe(false);
    expect(s.liquid).toBe(20000);              // brokerage のみ
    expect(s.restricted).toBe(180000);         // 401k + trad IRA + roth
  });

  it("at exactly 59.5: 401(k) and Traditional IRA become liquid (boundary)", () => {
    const s = inv.splitLiquidRestricted(59.5, accounts);
    expect(s.isAccessibleAge).toBe(true);
    expect(s.liquid).toBe(170000);             // brokerage + 401k + trad IRA
    expect(s.restricted).toBe(30000);          // roth のみ（現データ構造の簡易扱い）
  });
});

describe("US labels do not claim 'not implemented'", () => {
  it("all four categories are implemented", () => {
    expect(inv.implemented).toBe(true);
    expect(ret.implemented).toBe(true);
    expect(hc.implemented).toBe(true);
    expect(tax.implemented).toBe(true);
  });

  it("labels never point at a *NotImplementedNote* translation key", () => {
    const values = Object.values(US_COUNTRY_RULES.labels);
    for (const v of values) {
      if (typeof v === "string") {
        expect(v.includes("NotImplemented")).toBe(false);
      }
    }
  });
});
