// ============================================================================
// caBoundaries.test.js
// 【CA段階2】カナダ版の境界値テスト。2026課税年度（暦年）。
//
// 【出典】すべて canada.ca（CRA / Service Canada / ESDC）の公表値。
//   - MP/RRSP/DPSP/TFSA limits, YMPE : https://www.canada.ca/en/revenue-agency/services/tax/registered-plans-administrators/pspa/mp-rrsp-dpsp-tfsa-limits-ympe.html
//   - TFSA                           : https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/tax-free-savings-account.html
//   - RRSP / RRIF                    : https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/rrsps-related-plans.html
//   - Federal tax rates and brackets : https://www.canada.ca/en/revenue-agency/services/tax/individuals/tax-rates-brackets/current-year.html
//   - Basic Personal Amount          : https://www.canada.ca/en/revenue-agency/services/tax/individuals/frequently-asked-questions-individuals/basic-personal-amount.html
//   - CPP / OAS maximum amounts      : https://www.canada.ca/en/services/benefits/publicpensions.html
//   - OAS recovery tax               : https://www.canada.ca/en/services/benefits/publicpensions/cpp/old-age-security/recovery-tax.html
//
// 【適用範囲】連邦のみ。州・準州（13地域）の所得税・サータックス・QPP（ケベック）は未実装。
//   未実装項目は各セクションの notImplemented に列挙されており、本テストでも
//   「未実装であることが宣言されている」ことを検証する。
//
// ルール定義そのものを検証するため、対象モジュールを直接読み込む。
// ============================================================================

import { describe, it, expect } from "vitest";
import { CA_COUNTRY_RULES } from "./countryRules/CA.js";

const inv = CA_COUNTRY_RULES.investment;
const ret = CA_COUNTRY_RULES.retirement;
const tax = CA_COUNTRY_RULES.tax;
const health = CA_COUNTRY_RULES.healthcare;

// 浮動小数点の比較（相対誤差）
const near = (actual, expected, tol = 1e-9) =>
  Math.abs(actual - expected) <= tol * Math.max(1, Math.abs(expected));

// 4口座ぶんの入力を組み立てるヘルパー
const accounts = (v = {}) => {
  const mk = (key) => ({
    currentValue: v[key] || 0,
    annualContribution: v[`${key}C`] || 0,
    expectedReturnPct: v.returnPct === undefined ? 0 : v.returnPct,
    contributionEndAge: v.contributionEndAge === undefined ? 65 : v.contributionEndAge,
  });
  return {
    tfsa: mk("tfsa"),
    rrsp: mk("rrsp"),
    nonRegistered: mk("nonRegistered"),
    cashSavings: mk("cashSavings"),
  };
};

// ---------------------------------------------------------------------------
// 制度上限そのもの
// ---------------------------------------------------------------------------
describe("CA境界：2026年の制度上限が公表値どおり", () => {
  it("TFSAの年間拠出上限は C$7,000（2024・2025年と同額）", () => {
    expect(inv.limits.tfsaAnnualLimit).toBe(7000);
    expect(inv.getTfsaAnnualLimit()).toBe(7000);
  });

  it("2009年から未拠出の場合のTFSA累積枠は C$109,000（2026年1月1日時点）", () => {
    expect(inv.limits.tfsaCumulativeRoom2026).toBe(109000);
  });

  it("RRSPの年間上限額は C$33,810、稼得所得に対する率は18%", () => {
    expect(inv.limits.rrspAnnualDollarLimit).toBe(33810);
    expect(inv.limits.rrspIncomePercent).toBe(0.18);
  });

  it("RRIFへの強制転換は71歳末、最低取崩しの義務は72歳の年から", () => {
    expect(inv.rrifConversionAge).toBe(71);
    expect(inv.rrifFirstWithdrawalAge).toBe(72);
  });

  it("対象年度・最終更新日が明示されている", () => {
    expect(inv.effectiveTaxYear).toBe("2026");
    expect(ret.effectiveTaxYear).toBe("2026");
    expect(tax.effectiveTaxYear).toBe("2026");
    expect(typeof inv.lastUpdated).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// TFSA / RRSP の拠出枠（境界値）
// ---------------------------------------------------------------------------
describe("CA境界：TFSAの残枠", () => {
  it("未拠出なら残枠は年間上限そのもの", () => {
    expect(inv.getTfsaRemaining(accounts())).toBe(7000);
  });

  it("上限ちょうどを拠出したら残枠は0", () => {
    expect(inv.getTfsaRemaining(accounts({ tfsaC: 7000 }))).toBe(0);
  });

  it("上限を1ドル超えたら残枠は -1（過剰拠出をマイナスで表す）", () => {
    expect(inv.getTfsaRemaining(accounts({ tfsaC: 7001 }))).toBe(-1);
  });

  it("口座が未定義でも例外を投げず年間上限を返す", () => {
    expect(inv.getTfsaRemaining({})).toBe(7000);
  });
});

describe("CA境界：RRSPの拠出枠（18% と C$33,810 の低い方）", () => {
  it("稼得所得0なら枠も0", () => {
    expect(inv.getRrspRoom(0)).toBe(0);
  });

  it("稼得所得 C$100,000 → 18% の C$18,000（上限未満なので率が効く）", () => {
    expect(inv.getRrspRoom(100000)).toBe(18000);
  });

  it("18%が上限ちょうどになる所得（C$187,833.33…）で切り替わる", () => {
    const crossover = 33810 / 0.18; // = 187,833.33…
    expect(near(inv.getRrspRoom(crossover), 33810)).toBe(true);
    expect(near(inv.getRrspRoom(crossover - 1000), (crossover - 1000) * 0.18)).toBe(true);
    expect(inv.getRrspRoom(crossover + 1000)).toBe(33810);
  });

  it("高所得でも年間上限額で頭打ちになる", () => {
    expect(inv.getRrspRoom(1000000)).toBe(33810);
  });

  it("数値以外の入力は0として扱う", () => {
    expect(inv.getRrspRoom(undefined)).toBe(0);
    expect(inv.getRrspRoom("abc")).toBe(0);
  });

  it("残枠＝枠 − 拠出額（超過はマイナス）", () => {
    expect(inv.getRrspRemaining(accounts({ rrspC: 5000 }), 100000)).toBe(13000);
    expect(inv.getRrspRemaining(accounts({ rrspC: 18000 }), 100000)).toBe(0);
    expect(inv.getRrspRemaining(accounts({ rrspC: 19000 }), 100000)).toBe(-1000);
  });
});

// ---------------------------------------------------------------------------
// RRIF最低取崩し率（CRA公表テーブルの境界）
// ---------------------------------------------------------------------------
describe("CA境界：RRIF最低取崩し率", () => {
  it("65〜70歳は 1/(90−年齢) の公表値と一致する", () => {
    expect(inv.getRrifMinimumFactor(65)).toBe(0.04);
    expect(inv.getRrifMinimumFactor(70)).toBe(0.05);
    expect(near(inv.getRrifMinimumFactor(66), 0.0417, 1e-3)).toBe(true);
    expect(near(inv.getRrifMinimumFactor(69), 0.0476, 1e-3)).toBe(true);
  });

  it("71歳は 5.28%、72歳は 5.40%（強制転換後の初年度前後）", () => {
    expect(inv.getRrifMinimumFactor(71)).toBe(0.0528);
    expect(inv.getRrifMinimumFactor(72)).toBe(0.0540);
  });

  it("94歳は 18.79%、95歳以上は一律 20%", () => {
    expect(inv.getRrifMinimumFactor(94)).toBe(0.1879);
    expect(inv.getRrifMinimumFactor(95)).toBe(0.20);
    expect(inv.getRrifMinimumFactor(120)).toBe(0.20);
  });

  it("64歳以下はテーブル外なので0（強制取崩しは発生しない）", () => {
    expect(inv.getRrifMinimumFactor(64)).toBe(0);
    expect(inv.getRrifMinimumFactor(0)).toBe(0);
  });

  it("年齢は切り捨てて判定する（71.9歳は71歳の率）", () => {
    expect(inv.getRrifMinimumFactor(71.9)).toBe(0.0528);
    expect(inv.getRrifMinimumFactor(94.99)).toBe(0.1879);
  });

  it("最低取崩し額＝残高 × 率。残高0なら0", () => {
    expect(near(inv.getRrifMinimumWithdrawal(71, 500000), 500000 * 0.0528)).toBe(true);
    expect(inv.getRrifMinimumWithdrawal(71, 0)).toBe(0);
    expect(inv.getRrifMinimumWithdrawal(70, 500000)).toBe(500000 * 0.05);
  });
});

// ---------------------------------------------------------------------------
// CPP：受給開始年齢による増減
// ---------------------------------------------------------------------------
describe("CA境界：CPPの受給開始年齢", () => {
  it("受給可能年齢は60〜70歳、基準は65歳", () => {
    expect(ret.cpp.earliestAge).toBe(60);
    expect(ret.cpp.standardAge).toBe(65);
    expect(ret.cpp.latestAge).toBe(70);
  });

  it("65歳は増減なし（係数1.0）", () => {
    expect(ret.getCppFactor(65)).toBe(1);
  });

  it("60歳は −36%（月0.6% × 60か月）", () => {
    expect(near(ret.getCppFactor(60), 0.64)).toBe(true);
  });

  it("70歳は +42%（月0.7% × 60か月）", () => {
    expect(near(ret.getCppFactor(70), 1.42)).toBe(true);
  });

  it("60歳未満・70歳超は範囲内へ丸められる", () => {
    expect(near(ret.getCppFactor(55), 0.64)).toBe(true);
    expect(near(ret.getCppFactor(75), 1.42)).toBe(true);
  });

  it("年額＝入力した65歳時点の見込額 × 係数", () => {
    expect(near(ret.getCppAnnualBenefit(12000, 65), 12000)).toBe(true);
    expect(near(ret.getCppAnnualBenefit(12000, 60), 7680)).toBe(true);
    expect(near(ret.getCppAnnualBenefit(12000, 70), 17040)).toBe(true);
    expect(ret.getCppAnnualBenefit(0, 70)).toBe(0);
  });

  it("2026年の65歳満額は月 C$1,507.65（年 C$18,091.80）", () => {
    expect(ret.cpp.maxMonthlyAt65).toBe(1507.65);
    expect(near(ret.getCppMaxAnnualAt65(), 1507.65 * 12)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// OAS：繰下げ・居住年数・75歳上乗せ
// ---------------------------------------------------------------------------
describe("CA境界：OASの受給開始年齢", () => {
  it("繰上げ受給は不可。65歳未満を指定しても65歳に丸められる", () => {
    expect(ret.oas.earlyClaimAllowed).toBe(false);
    expect(ret.getOasEffectiveStartAge(60)).toBe(65);
    expect(ret.getOasEffectiveStartAge(64)).toBe(65);
    expect(ret.getOasFactor(60)).toBe(1);
  });

  it("65歳は係数1.0、70歳は +36%（月0.6% × 60か月）", () => {
    expect(ret.getOasFactor(65)).toBe(1);
    expect(near(ret.getOasFactor(70), 1.36)).toBe(true);
  });

  it("70歳超は70歳に丸められる（繰下げ上限）", () => {
    expect(ret.getOasEffectiveStartAge(75)).toBe(70);
    expect(near(ret.getOasFactor(75), 1.36)).toBe(true);
  });
});

describe("CA境界：OASの居住年数按分", () => {
  it("10年未満は受給資格なし（0）", () => {
    expect(ret.getOasResidenceFraction(9)).toBe(0);
    expect(ret.getOasResidenceFraction(9.9)).toBe(0);
  });

  it("10年ちょうどで資格が発生し 10/40 = 25%", () => {
    expect(ret.getOasResidenceFraction(10)).toBe(0.25);
  });

  it("40年で満額、40年超も満額で頭打ち", () => {
    expect(ret.getOasResidenceFraction(40)).toBe(1);
    expect(ret.getOasResidenceFraction(50)).toBe(1);
  });
});

describe("CA境界：OASの満額（75歳の上乗せ）", () => {
  it("65〜74歳は月 C$751.97、75歳以降は月 C$827.17（10%上乗せ／2026年7〜9月期）", () => {
    expect(ret.oas.maxMonthly65to74).toBe(751.97);
    expect(ret.oas.maxMonthly75plus).toBe(827.17);
    expect(ret.oas.enhancedAge).toBe(75);
  });

  it("74歳と75歳で年額が切り替わる", () => {
    expect(near(ret.getOasMaxAnnual(74), 751.97 * 12)).toBe(true);
    expect(near(ret.getOasMaxAnnual(75), 827.17 * 12)).toBe(true);
    expect(ret.getOasMaxAnnual(75)).toBeGreaterThan(ret.getOasMaxAnnual(74));
  });

  it("クローバック前の年額＝満額 × 繰下げ係数 × 居住按分", () => {
    const expected = 751.97 * 12 * 1.36 * 0.5;
    expect(near(ret.getOasAnnualBeforeClawback(70, 70, 20), expected)).toBe(true);
  });

  it("居住10年未満なら繰下げしても0", () => {
    expect(ret.getOasAnnualBeforeClawback(70, 70, 5)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// OAS回収税（クローバック）
// ---------------------------------------------------------------------------
describe("CA境界：OAS回収税（recovery tax）", () => {
  const full = 751.97 * 12; // 65〜74歳の満額年額
  const threshold = 95323;

  it("2026課税年度の閾値は C$95,323、回収率は15%", () => {
    expect(ret.oas.recoveryTaxThreshold2026).toBe(95323);
    expect(ret.oas.recoveryTaxRate).toBe(0.15);
  });

  it("閾値ちょうどでは回収されない", () => {
    expect(ret.getOasClawback(threshold, full)).toBe(0);
    expect(near(ret.getOasAnnualAfterClawback(threshold, full), full)).toBe(true);
  });

  it("閾値未満でも回収されない", () => {
    expect(ret.getOasClawback(0, full)).toBe(0);
    expect(ret.getOasClawback(threshold - 1, full)).toBe(0);
  });

  it("閾値を C$10,000 超えたら 15% の C$1,500 が回収される", () => {
    expect(near(ret.getOasClawback(threshold + 10000, full), 1500)).toBe(true);
  });

  it("回収額はOAS年額を上限とする（マイナス受給にならない）", () => {
    expect(near(ret.getOasClawback(1000000, full), full)).toBe(true);
    expect(ret.getOasAnnualAfterClawback(1000000, full)).toBe(0);
  });

  // 全額回収点：ESDC公表値は2026課税年度・65〜74歳で C$154,708 だが、これは四半期ごとに
  // 改定されるOAS月額を年間で合算した額に基づく。本アプリは7〜9月期の月額を12倍した
  // 単一レートで年額を出すモデルのため、C$155,481 とややずれる（モデル上の想定内）。
  it("全額回収となる所得は 閾値 + 年額/0.15（65〜74歳で約 C$155,000）", () => {
    const wipeout = threshold + full / 0.15;
    expect(near(ret.getOasClawback(wipeout, full), full)).toBe(true);
    expect(ret.getOasClawback(wipeout - 1000, full)).toBeLessThan(full);
    expect(Math.round(wipeout)).toBe(155481);
  });

  it("OAS年額が0なら回収額も0", () => {
    expect(ret.getOasClawback(1000000, 0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 連邦所得税（バンド境界とBPAの逓減）
// ---------------------------------------------------------------------------
describe("CA境界：2026年の連邦税バンド", () => {
  it("バンドの上限額と税率が公表値どおり", () => {
    const b = tax.incomeTax.bands;
    expect(b[0]).toEqual({ upTo: 58523, rate: 0.14 });
    expect(b[1]).toEqual({ upTo: 117045, rate: 0.205 });
    expect(b[2]).toEqual({ upTo: 181440, rate: 0.26 });
    expect(b[3]).toEqual({ upTo: 258482, rate: 0.29 });
    expect(b[4].rate).toBe(0.33);
    expect(b[4].upTo).toBe(Infinity);
  });

  it("限界税率がバンド境界ちょうどで切り替わる", () => {
    expect(tax.getMarginalRate(58523)).toBe(0.14);
    expect(tax.getMarginalRate(58524)).toBe(0.205);
    expect(tax.getMarginalRate(117045)).toBe(0.205);
    expect(tax.getMarginalRate(117046)).toBe(0.26);
    expect(tax.getMarginalRate(181440)).toBe(0.26);
    expect(tax.getMarginalRate(181441)).toBe(0.29);
    expect(tax.getMarginalRate(258482)).toBe(0.29);
    expect(tax.getMarginalRate(258483)).toBe(0.33);
    expect(tax.getMarginalRate(0)).toBe(0.14);
  });

  it("州・準州の所得税は未実装であることが宣言されている", () => {
    expect(tax.province.implemented).toBe(false);
    expect(tax.region).toMatch(/Federal only/);
  });

  it("第1バンド上限ちょうどの総額税＝58,523 × 14%", () => {
    const r = tax.calculateFederalTax(58523);
    expect(near(r.grossTax, 58523 * 0.14)).toBe(true);
  });

  it("第2バンドは超過分にだけ 20.5% がかかる", () => {
    const r = tax.calculateFederalTax(100000);
    const expected = 58523 * 0.14 + (100000 - 58523) * 0.205;
    expect(near(r.grossTax, expected)).toBe(true);
  });

  it("最上位バンドは超過分に 33%", () => {
    const r = tax.calculateFederalTax(300000);
    const expected = 58523 * 0.14
      + (117045 - 58523) * 0.205
      + (181440 - 117045) * 0.26
      + (258482 - 181440) * 0.29
      + (300000 - 258482) * 0.33;
    expect(near(r.grossTax, expected)).toBe(true);
  });

  it("所得0・マイナスでも税額は0（例外を投げない）", () => {
    expect(tax.calculateFederalTax(0).tax).toBe(0);
    expect(tax.calculateFederalTax(-5000).tax).toBe(0);
    expect(tax.calculateFederalTax(undefined).tax).toBe(0);
  });

  it("BPA控除により低所得では税額が0になる（税額はマイナスにならない）", () => {
    expect(tax.calculateFederalTax(10000).tax).toBe(0);
    expect(tax.calculateFederalTax(16452).tax).toBe(0);
  });
});

describe("CA境界：Basic Personal Amount の逓減", () => {
  it("逓減開始（C$181,440）以下は満額 C$16,452", () => {
    expect(tax.getBasicPersonalAmount(0)).toBe(16452);
    expect(tax.getBasicPersonalAmount(181440)).toBe(16452);
  });

  it("逓減終了（C$258,482）以上は下限 C$14,829", () => {
    expect(tax.getBasicPersonalAmount(258482)).toBe(14829);
    expect(tax.getBasicPersonalAmount(500000)).toBe(14829);
  });

  it("中間では直線的に逓減する（中点でちょうど半分）", () => {
    const mid = (181440 + 258482) / 2;
    expect(near(tax.getBasicPersonalAmount(mid), (16452 + 14829) / 2)).toBe(true);
  });

  it("BPAは最低税率（14%）で税額控除される", () => {
    expect(tax.incomeTax.bpaCreditRate).toBe(0.14);
    const r = tax.calculateFederalTax(100000);
    expect(near(r.bpaCredit, 16452 * 0.14)).toBe(true);
    expect(near(r.tax, r.grossTax - r.bpaCredit)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 譲渡益課税・RRSP拠出による税軽減
// ---------------------------------------------------------------------------
describe("CA境界：譲渡益課税", () => {
  it("課税所得への算入率は50%", () => {
    expect(tax.capitalGains.inclusionRate).toBe(0.5);
  });

  it("利益0・マイナスなら税額0", () => {
    expect(tax.calculateCapitalGainsTax(0, 100000)).toBe(0);
    expect(tax.calculateCapitalGainsTax(-10000, 100000)).toBe(0);
  });

  it("バンド内に収まる利益は 利益 × 50% × 限界税率", () => {
    const t = tax.calculateCapitalGainsTax(10000, 100000);
    expect(near(t, 10000 * 0.5 * 0.205)).toBe(true);
  });

  it("バンドをまたぐ利益は分割して課税される", () => {
    // 他の所得 C$110,000、利益 C$40,000 → 算入 C$20,000（うち 7,045 が 20.5%、残りが 26%）
    const t = tax.calculateCapitalGainsTax(40000, 110000);
    const expected = (117045 - 110000) * 0.205 + (130000 - 117045) * 0.26;
    expect(near(t, expected)).toBe(true);
  });
});

describe("CA境界：RRSP拠出による所得税の軽減", () => {
  it("拠出0なら軽減0", () => {
    expect(tax.calculateRrspTaxSaving(0, 100000, 18000)).toBe(0);
  });

  it("枠内の拠出は 拠出額 × 限界税率ぶん軽減される", () => {
    const s = tax.calculateRrspTaxSaving(10000, 100000, 18000);
    expect(near(s, 10000 * 0.205)).toBe(true);
  });

  it("枠を超えた分は軽減対象にならない（枠で頭打ち）", () => {
    const capped = tax.calculateRrspTaxSaving(30000, 100000, 18000);
    const atCap = tax.calculateRrspTaxSaving(18000, 100000, 18000);
    expect(near(capped, atCap)).toBe(true);
  });

  it("枠を渡さない場合は上限なしとして扱う", () => {
    const s = tax.calculateRrspTaxSaving(10000, 100000, undefined);
    expect(near(s, 10000 * 0.205)).toBe(true);
  });

  it("軽減額は元の税額を超えない（マイナスにならない）", () => {
    const s = tax.calculateRrspTaxSaving(100000, 20000, 100000);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(tax.calculateFederalTax(20000).tax);
  });
});

// ---------------------------------------------------------------------------
// 資産区分・医療費
// ---------------------------------------------------------------------------
describe("CA境界：資産区分（splitAssets）", () => {
  const acc = accounts({ tfsa: 50000, rrsp: 300000, nonRegistered: 80000, cashSavings: 20000 });

  it("Liquid＝TFSA＋非登録＋現金、Restricted＝RRSP", () => {
    const s = inv.splitAssets(60, acc);
    expect(s.liquid).toBe(150000);
    expect(s.restricted).toBe(300000);
  });

  it("Tax-Advantaged＝TFSA＋RRSP（横断的な内訳）", () => {
    expect(inv.splitAssets(60, acc).taxAdvantaged).toBe(350000);
  });

  it("総資産＝Liquid＋Restricted＝4口座の単純合計", () => {
    const s = inv.splitAssets(60, acc);
    expect(s.total).toBe(450000);
    expect(s.total).toBe(s.liquid + s.restricted);
  });

  it("RRIFフェーズの判定は71歳ちょうどで切り替わる", () => {
    expect(inv.splitAssets(70, acc).isRrifPhase).toBe(false);
    expect(inv.splitAssets(71, acc).isRrifPhase).toBe(true);
  });
});

describe("CA境界：取崩し順がACCOUNT_DRAW_CATEGORY.CAと一致する", () => {
  // パネルのプレビュー（simulateGrowth）と本計算（lifePlanEngine）で順序が食い違うと、
  // 同じ入力でもグラフと結果が一致しなくなる。順序そのものを固定する。
  it("Cash → Non-Registered → TFSA → RRSP の順に取り崩す", () => {
    const acc = accounts({ cashSavings: 10000, nonRegistered: 10000, tfsa: 10000, rrsp: 10000 });
    // 65歳退職・66歳で1年分だけ 15,000 を取り崩す（現金を使い切り、非登録から5,000）
    const sim = inv.simulateGrowth({
      currentAge: 65, retireAge: 65, deathAge: 66, accounts: acc, annualWithdrawalNeeded: 15000,
    });
    const a = sim.finalAccounts;
    expect(a.cashSavings).toBe(0);
    expect(a.nonRegistered).toBe(5000);
    expect(a.tfsa).toBe(10000);
    expect(a.rrsp).toBe(10000);
  });
});

describe("CA境界：医療費（自己負担の合計）", () => {
  it("民間保険だけ月額入力で、他は年額として合算される", () => {
    const total = health.getAnnualTotal({
      basicAnnual: 100, privateHealthInsuranceMonthly: 50, prescriptionAnnual: 200,
      dentalAnnual: 300, visionAnnual: 150, longTermCareAnnual: 400, otherOutOfPocketAnnual: 50,
    });
    expect(total).toBe(100 + 600 + 200 + 300 + 150 + 400 + 50);
  });

  it("未入力・undefined でも0を返す", () => {
    expect(health.getAnnualTotal({})).toBe(0);
    expect(health.getAnnualTotal(undefined)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 未実装項目の宣言（推測値を混入させないための宣言テスト）
// ---------------------------------------------------------------------------
describe("CA境界：未実装項目が明示されている", () => {
  it("投資・年金・医療・税制それぞれに notImplemented がある", () => {
    [inv, ret, health, tax].forEach((section) => {
      expect(Array.isArray(section.notImplemented)).toBe(true);
      expect(section.notImplemented.length).toBeGreaterThan(0);
    });
  });

  it("RRIF最低取崩し率への配偶者年齢の選択が未実装として列挙されている", () => {
    const all = inv.notImplemented.join(" / ");
    expect(all).toMatch(/spousal age election/);
    expect(all).toMatch(/配偶者/);
  });

  it("引出時課税が単一税率による近似であることが明記されている", () => {
    expect(inv.notImplemented.join(" / ")).toMatch(/withdrawalTaxPct/);
  });

  it("州税・QPP・PAは未実装として列挙されている", () => {
    const all = [...inv.notImplemented, ...ret.notImplemented, ...tax.notImplemented].join(" / ");
    expect(all).toMatch(/州・準州の所得税/);
    expect(all).toMatch(/QPP/);
    expect(all).toMatch(/Pension Adjustment|PA）/);
  });
});
