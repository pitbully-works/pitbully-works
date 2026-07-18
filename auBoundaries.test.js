// ============================================================================
// auBoundaries.test.js
// 【AU段階2】オーストラリア版の境界値テスト。2026-27会計年度（2026年7月1日〜2027年6月30日）。
//
// 【出典】ato.gov.au（税制・Superannuation）／ servicesaustralia.gov.au（Age Pension）
//   - Key superannuation rates and thresholds : https://www.ato.gov.au/tax-rates-and-codes/key-superannuation-rates-and-thresholds
//   - Contributions caps                      : https://www.ato.gov.au/tax-rates-and-codes/key-superannuation-rates-and-thresholds/contributions-caps
//   - Tax rates for Australian residents      : https://www.ato.gov.au/tax-rates-and-codes/tax-rates-australian-residents
//   - Age Pension                             : https://www.servicesaustralia.gov.au/age-pension
//   - Income test / Assets test               : https://www.servicesaustralia.gov.au/income-test-for-age-pension
//
// 【適用範囲】オーストラリア居住者。非居住者（foreign resident）の税率は未実装。
//   給付額は2026年3月20日改定値（次回改定は2026年9月20日）、資産・所得テストの
//   無影響枠は2026年7月1日改定値。
//
// ルール定義そのものを検証するため、対象モジュールを直接読み込む。
// ============================================================================

import { describe, it, expect } from "vitest";
import { AU_COUNTRY_RULES } from "./countryRules/AU.js";

const inv = AU_COUNTRY_RULES.investment;
const ret = AU_COUNTRY_RULES.retirement;
const tax = AU_COUNTRY_RULES.tax;
const health = AU_COUNTRY_RULES.healthcare;

const near = (actual, expected, tol = 1e-9) =>
  Math.abs(actual - expected) <= tol * Math.max(1, Math.abs(expected));

// 3口座ぶんの入力を組み立てるヘルパー
const accounts = (v = {}) => {
  const mk = (key) => ({
    currentValue: v[key] || 0,
    annualContribution: v[`${key}C`] || 0,
    expectedReturnPct: v.returnPct === undefined ? 0 : v.returnPct,
    contributionEndAge: v.endAge === undefined ? 65 : v.endAge,
    withdrawalTaxPct: v[`${key}Tax`] || 0,
  });
  return {
    superannuation: mk("superannuation"),
    investmentAccount: mk("investmentAccount"),
    cashSavings: mk("cashSavings"),
  };
};

// ---------------------------------------------------------------------------
// Superannuation：拠出上限
// ---------------------------------------------------------------------------
describe("AU境界：2026-27の拠出上限が公表値どおり", () => {
  it("税引前拠出（concessional）の上限は A$32,500（2025-26は $30,000）", () => {
    expect(inv.limits.concessionalCap).toBe(32500);
    expect(inv.getConcessionalCap()).toBe(32500);
  });

  it("税引後拠出（non-concessional）の上限は A$130,000、前倒しは3年分で A$390,000", () => {
    expect(inv.limits.nonConcessionalCap).toBe(130000);
    expect(inv.getNonConcessionalCap()).toBe(130000);
    expect(inv.limits.bringForwardMax).toBe(390000);
    expect(inv.limits.bringForwardMax).toBe(inv.limits.nonConcessionalCap * 3);
  });

  it("Transfer Balance Cap は A$2,100,000（2025-26は $2,000,000）", () => {
    expect(inv.limits.transferBalanceCap).toBe(2100000);
  });

  it("繰越拠出が使える総残高の上限 A$500,000 は指数化されない", () => {
    expect(inv.limits.carryForwardBalanceThreshold).toBe(500000);
  });

  it("対象年度・最終更新日が明示されている", () => {
    [inv, ret, tax, health].forEach((section) => {
      expect(section.effectiveTaxYear).toBe("2026-27");
      expect(typeof section.lastUpdated).toBe("string");
    });
  });
});

// ---------------------------------------------------------------------------
// Superannuation Guarantee（雇用主の義務拠出）
// ---------------------------------------------------------------------------
describe("AU境界：Superannuation Guarantee", () => {
  it("SG率は12%（2025年7月1日に到達し、以降据置）", () => {
    expect(inv.limits.superGuaranteeRate).toBe(0.12);
    expect(inv.getSuperGuaranteeRate()).toBe(0.12);
  });

  it("maximum contribution base は年額 A$270,830（2026年7月1日に四半期制から変更）", () => {
    expect(inv.limits.maximumContributionBase).toBe(270830);
  });

  it("上限未満の給与はそのまま12%が拠出される", () => {
    expect(near(inv.getEmployerSgContribution(100000), 12000)).toBe(true);
    expect(inv.getEmployerSgContribution(0)).toBe(0);
  });

  it("maximum contribution base ちょうどで頭打ちに切り替わる", () => {
    const base = 270830;
    expect(near(inv.getEmployerSgContribution(base), base * 0.12)).toBe(true);
    expect(near(inv.getEmployerSgContribution(base + 100000), base * 0.12)).toBe(true);
    expect(near(inv.getEmployerSgContribution(base - 1), (base - 1) * 0.12)).toBe(true);
  });

  it("税引前拠出の合計＝雇用主SG＋任意拠出。残枠は上限との差", () => {
    expect(near(inv.getTotalConcessional(100000, 5000), 17000)).toBe(true);
    expect(near(inv.getConcessionalRemaining(100000, 5000), 32500 - 17000)).toBe(true);
    // 上限ちょうど・超過
    expect(near(inv.getConcessionalRemaining(100000, 20500), 0)).toBe(true);
    expect(near(inv.getConcessionalRemaining(100000, 21500), -1000)).toBe(true);
  });

  it("税引後拠出の残枠も上限との差（超過はマイナス）", () => {
    expect(inv.getNonConcessionalRemaining(0)).toBe(130000);
    expect(inv.getNonConcessionalRemaining(130000)).toBe(0);
    expect(inv.getNonConcessionalRemaining(131000)).toBe(-1000);
  });
});

// ---------------------------------------------------------------------------
// Preservation age と最低取崩し率
// ---------------------------------------------------------------------------
describe("AU境界：Superへのアクセス年齢", () => {
  it("preservation age は60歳、無条件アクセスは65歳", () => {
    expect(inv.preservationAge).toBe(60);
    expect(inv.unrestrictedAccessAge).toBe(65);
  });

  it("60歳ちょうどでアクセス可能に切り替わる", () => {
    expect(inv.canAccessSuper(59)).toBe(false);
    expect(inv.canAccessSuper(59.99)).toBe(false);
    expect(inv.canAccessSuper(60)).toBe(true);
    expect(inv.canAccessSuper(65)).toBe(true);
  });
});

describe("AU境界：Account-based pension の最低取崩し率（ATOテーブル）", () => {
  it("年齢帯ごとの率が公表値どおり", () => {
    expect(inv.getMinimumDrawdownFactor(60)).toBe(0.04);
    expect(inv.getMinimumDrawdownFactor(65)).toBe(0.05);
    expect(inv.getMinimumDrawdownFactor(75)).toBe(0.06);
    expect(inv.getMinimumDrawdownFactor(80)).toBe(0.07);
    expect(inv.getMinimumDrawdownFactor(85)).toBe(0.09);
    expect(inv.getMinimumDrawdownFactor(90)).toBe(0.11);
    expect(inv.getMinimumDrawdownFactor(95)).toBe(0.14);
  });

  it("各年齢帯の直前は1段下の率のまま", () => {
    expect(inv.getMinimumDrawdownFactor(64)).toBe(0.04);
    expect(inv.getMinimumDrawdownFactor(74)).toBe(0.05);
    expect(inv.getMinimumDrawdownFactor(79)).toBe(0.06);
    expect(inv.getMinimumDrawdownFactor(84)).toBe(0.07);
    expect(inv.getMinimumDrawdownFactor(89)).toBe(0.09);
    expect(inv.getMinimumDrawdownFactor(94)).toBe(0.11);
  });

  it("95歳超も一律14%", () => {
    expect(inv.getMinimumDrawdownFactor(120)).toBe(0.14);
  });

  it("最低取崩し額＝残高 × 率。残高0なら0", () => {
    expect(near(inv.getMinimumDrawdown(65, 500000), 25000)).toBe(true);
    expect(inv.getMinimumDrawdown(65, 0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Age Pension：受給資格年齢と満額
// ---------------------------------------------------------------------------
describe("AU境界：Age Pension の受給資格と満額", () => {
  it("受給資格年齢は67歳（引き上げは2023年7月に完了）", () => {
    expect(ret.agePension.qualifyingAge).toBe(67);
    expect(ret.getQualifyingAge()).toBe(67);
  });

  it("満額は隔週 A$1,200.90（シングル）／ A$905.20（カップル1人あたり）", () => {
    expect(ret.agePension.maxFortnightlySingle).toBe(1200.90);
    expect(ret.agePension.maxFortnightlyCoupleEach).toBe(905.20);
    expect(near(ret.getMaxAnnual("single"), 1200.90 * 26)).toBe(true);
    expect(near(ret.getMaxAnnual("couple"), 905.20 * 26)).toBe(true);
  });

  it("年額は隔週額×26（年26回支給）", () => {
    expect(ret.agePension.fortnightsPerYear).toBe(26);
  });

  it("受給資格年齢未満は0", () => {
    const args = { annualIncome: 0, assessableAssets: 0, status: "single", homeowner: true };
    expect(ret.getAgePension({ ...args, age: 66 })).toBe(0);
    expect(ret.getAgePension({ ...args, age: 67 })).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Age Pension：所得テスト（1人あたりの逓減率）
// ---------------------------------------------------------------------------
describe("AU境界：Age Pension の所得テスト", () => {
  it("無影響枠は隔週 A$226（シングル）／ A$396（カップル世帯合計）", () => {
    expect(ret.agePension.incomeFreeAreaFortnightlySingle).toBe(226);
    expect(ret.agePension.incomeFreeAreaFortnightlyCoupleCombined).toBe(396);
    expect(near(ret.getIncomeFreeAreaAnnual("single"), 226 * 26)).toBe(true);
    expect(near(ret.getIncomeFreeAreaAnnual("couple"), 396 * 26)).toBe(true);
  });

  it("逓減率は1人あたり：シングル50セント、カップル25セント（世帯合計で50セント）", () => {
    expect(ret.getIncomeTaperPerDollar("single")).toBe(0.50);
    expect(ret.getIncomeTaperPerDollar("couple")).toBe(0.25);
  });

  it("無影響枠ちょうどまでは満額", () => {
    const free = ret.getIncomeFreeAreaAnnual("single");
    expect(near(ret.getAgePensionByIncomeTest(free, "single"), ret.getMaxAnnual("single"))).toBe(true);
    expect(near(ret.getAgePensionByIncomeTest(0, "single"), ret.getMaxAnnual("single"))).toBe(true);
  });

  it("シングルの打ち切り所得は隔週 A$2,627.80（公表値と一致）", () => {
    expect(near(ret.getIncomeCutOffAnnual("single") / 26, 2627.80, 1e-6)).toBe(true);
    expect(near(ret.getAgePensionByIncomeTest(2627.80 * 26, "single"), 0, 1e-6)).toBe(true);
  });

  it("カップルの打ち切り所得は隔週 A$4,016.80（世帯合計・公表値と一致）", () => {
    expect(near(ret.getIncomeCutOffAnnual("couple") / 26, 4016.80, 1e-6)).toBe(true);
    expect(near(ret.getAgePensionByIncomeTest(4016.80 * 26, "couple"), 0, 1e-6)).toBe(true);
  });

  it("打ち切りを超えても給付がマイナスにならない", () => {
    expect(ret.getAgePensionByIncomeTest(1000000, "single")).toBe(0);
    expect(ret.getAgePensionByIncomeTest(1000000, "couple")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Age Pension：資産テスト（1人あたりの逓減率）
// ---------------------------------------------------------------------------
describe("AU境界：Age Pension の資産テスト", () => {
  it("無影響枠が4区分とも公表値どおり", () => {
    expect(ret.getAssetsFreeArea("single", true)).toBe(333000);
    expect(ret.getAssetsFreeArea("single", false)).toBe(600000);
    expect(ret.getAssetsFreeArea("couple", true)).toBe(499000);
    expect(ret.getAssetsFreeArea("couple", false)).toBe(766000);
  });

  it("逓減率は1人あたり：シングル隔週$3、カップル隔週$1.50（世帯合計で$3）", () => {
    expect(ret.getAssetsTaperPerThousandFortnightly("single")).toBe(3);
    expect(ret.getAssetsTaperPerThousandFortnightly("couple")).toBe(1.5);
  });

  it("無影響枠ちょうどまでは満額、1,000ドル超過で隔週$3減る（シングル）", () => {
    const free = 333000;
    expect(near(ret.getAgePensionByAssetsTest(free, "single", true), ret.getMaxAnnual("single"))).toBe(true);
    const at1k = ret.getAgePensionByAssetsTest(free + 1000, "single", true);
    expect(near(ret.getMaxAnnual("single") - at1k, 3 * 26)).toBe(true);
  });

  it("カップルは1,000ドル超過につき1人あたり隔週$1.50しか減らない", () => {
    const free = 499000;
    const at1k = ret.getAgePensionByAssetsTest(free + 1000, "couple", true);
    expect(near(ret.getMaxAnnual("couple") - at1k, 1.5 * 26)).toBe(true);
  });

  it("シングル持家の打ち切り資産は公表値 A$733,500 とほぼ一致", () => {
    const cutoff = ret.getAssetsCutOff("single", true);
    expect(Math.abs(cutoff - 733500)).toBeLessThan(500);
    expect(near(ret.getAgePensionByAssetsTest(cutoff, "single", true), 0, 1e-6)).toBe(true);
  });

  it("カップル持家の打ち切り資産は公表値 A$1,102,500 とほぼ一致（世帯合計）", () => {
    const cutoff = ret.getAssetsCutOff("couple", true);
    expect(Math.abs(cutoff - 1102500)).toBeLessThan(500);
    expect(near(ret.getAgePensionByAssetsTest(cutoff, "couple", true), 0, 1e-6)).toBe(true);
  });

  it("非持家の打ち切り資産も公表値とほぼ一致（$1,000,500 / $1,369,500）", () => {
    expect(Math.abs(ret.getAssetsCutOff("single", false) - 1000500)).toBeLessThan(500);
    expect(Math.abs(ret.getAssetsCutOff("couple", false) - 1369500)).toBeLessThan(500);
  });

  it("打ち切りを超えても給付がマイナスにならない", () => {
    expect(ret.getAgePensionByAssetsTest(5000000, "single", true)).toBe(0);
    expect(ret.getAgePensionByAssetsTest(5000000, "couple", false)).toBe(0);
  });
});

describe("AU境界：Deeming（金融資産のみなし収入）", () => {
  it("レートは下限1.25%・上限3.25%（2026年3月20日から）", () => {
    expect(ret.deeming.lowerRate).toBe(0.0125);
    expect(ret.deeming.upperRate).toBe(0.0325);
  });

  it("しきい値はシングル A$66,800／カップル合算 A$110,600（2026年7月1日から）", () => {
    expect(ret.deeming.thresholdSingle).toBe(66800);
    expect(ret.deeming.thresholdCoupleCombined).toBe(110600);
    expect(ret.getDeemingThreshold("single")).toBe(66800);
    expect(ret.getDeemingThreshold("couple")).toBe(110600);
  });

  it("資産0ならみなし収入も0", () => {
    expect(ret.getDeemedIncomeAnnual(0, "single")).toBe(0);
    expect(ret.getDeemedIncomeAnnual(-1000, "single")).toBe(0);
    expect(ret.getDeemedIncomeAnnual(undefined, "single")).toBe(0);
  });

  it("しきい値ちょうどまでは全額が下限レート", () => {
    expect(near(ret.getDeemedIncomeAnnual(66800, "single"), 66800 * 0.0125)).toBe(true);
    expect(near(ret.getDeemedIncomeAnnual(66800, "single"), 835)).toBe(true);
    expect(near(ret.getDeemedIncomeAnnual(110600, "couple"), 110600 * 0.0125)).toBe(true);
  });

  it("しきい値を超えた分だけ上限レートになる", () => {
    // シングル 166,800 → 66,800×1.25% + 100,000×3.25% = 835 + 3,250
    expect(near(ret.getDeemedIncomeAnnual(166800, "single"), 4085)).toBe(true);
    // 1ドル超過でも跳ね上がらない
    const a = ret.getDeemedIncomeAnnual(66800, "single");
    const b = ret.getDeemedIncomeAnnual(66801, "single");
    expect(near(b - a, 0.0325, 1e-6)).toBe(true);
  });

  it("同じ資産額ならカップルの方がみなし収入が小さい（しきい値が大きいため）", () => {
    expect(ret.getDeemedIncomeAnnual(200000, "couple"))
      .toBeLessThan(ret.getDeemedIncomeAnnual(200000, "single"));
  });

  it("所得テストの判定所得＝その他の年収＋みなし収入", () => {
    const assessable = ret.getAssessableIncomeAnnual(10000, 166800, "single");
    expect(near(assessable, 10000 + 4085)).toBe(true);
  });

  it("financialAssets を渡さなければみなし収入0として扱う（従来の呼び出しと互換）", () => {
    expect(near(ret.getAssessableIncomeAnnual(10000, undefined, "single"), 10000)).toBe(true);
    const withoutDeeming = ret.getAgePension({
      age: 70, annualIncome: 0, assessableAssets: 0, status: "single", homeowner: true,
    });
    expect(near(withoutDeeming, ret.getMaxAnnual("single"))).toBe(true);
  });

  it("みなし収入が所得テストに反映され、給付額が下がる", () => {
    const args = { age: 70, annualIncome: 0, assessableAssets: 0, status: "single", homeowner: true };
    const plain = ret.getAgePension(args);
    const deemed = ret.getAgePension({ ...args, financialAssets: 1000000 });
    expect(deemed).toBeLessThan(plain);
  });
});

describe("AU境界：世帯合計の給付額（getAgePensionHousehold）", () => {
  const args = {
    age: 70, annualIncome: 0, assessableAssets: 200000, homeowner: true,
  };

  it("シングルは1人分のまま", () => {
    const perPerson = ret.getAgePension({ ...args, status: "single" });
    const household = ret.getAgePensionHousehold({ ...args, status: "single" });
    expect(near(household, perPerson)).toBe(true);
    expect(ret.getHouseholdRecipients("single", true)).toBe(1);
  });

  it("夫婦とも受給資格年齢なら1人あたりの2倍", () => {
    const perPerson = ret.getAgePension({ ...args, status: "couple" });
    const household = ret.getAgePensionHousehold({ ...args, status: "couple", bothQualified: true });
    expect(near(household, perPerson * 2)).toBe(true);
    expect(ret.getHouseholdRecipients("couple", true)).toBe(2);
  });

  it("片方だけ受給資格年齢なら1人分だけ", () => {
    const perPerson = ret.getAgePension({ ...args, status: "couple" });
    const household = ret.getAgePensionHousehold({ ...args, status: "couple", bothQualified: false });
    expect(near(household, perPerson)).toBe(true);
    expect(ret.getHouseholdRecipients("couple", false)).toBe(1);
  });

  it("bothQualified 未指定は「双方が受給資格あり」として扱う", () => {
    const household = ret.getAgePensionHousehold({ ...args, status: "couple" });
    const perPerson = ret.getAgePension({ ...args, status: "couple" });
    expect(near(household, perPerson * 2)).toBe(true);
  });

  it("受給資格年齢未満なら世帯合計も0", () => {
    expect(ret.getAgePensionHousehold({ ...args, age: 66, status: "couple", bothQualified: true })).toBe(0);
  });

  it("満額のカップル世帯合計は隔週 A$1,810.40 相当", () => {
    const household = ret.getAgePensionHousehold({
      age: 70, annualIncome: 0, assessableAssets: 0, status: "couple", homeowner: true, bothQualified: true,
    });
    expect(near(household / 26, 1810.40, 1e-6)).toBe(true);
  });
});

describe("AU境界：Age Pension は所得テストと資産テストの低い方", () => {
  const base = { age: 70, status: "single", homeowner: true };

  it("両テストとも無影響枠内なら満額", () => {
    const p = ret.getAgePension({ ...base, annualIncome: 0, assessableAssets: 300000 });
    expect(near(p, ret.getMaxAnnual("single"))).toBe(true);
  });

  it("資産テストの方が厳しければ資産テストの額になる", () => {
    const p = ret.getAgePension({ ...base, annualIncome: 0, assessableAssets: 600000 });
    expect(near(p, ret.getAgePensionByAssetsTest(600000, "single", true))).toBe(true);
  });

  it("所得テストの方が厳しければ所得テストの額になる", () => {
    const income = 50000;
    const p = ret.getAgePension({ ...base, annualIncome: income, assessableAssets: 300000 });
    expect(near(p, ret.getAgePensionByIncomeTest(income, "single"))).toBe(true);
  });

  it("Work Bonus の年額は A$11,800（所得テストからの除外枠・適用は未実装）", () => {
    expect(ret.agePension.workBonusAnnual).toBe(11800);
    expect(ret.notImplemented.join(" / ")).toMatch(/Work Bonus/);
  });
});

// ---------------------------------------------------------------------------
// 所得税・Medicare levy
// ---------------------------------------------------------------------------
describe("AU境界：2026-27の所得税バンド", () => {
  it("バンドの上限額と税率が公表値どおり（第2バンドは16%→15%）", () => {
    const b = tax.incomeTax.bands;
    expect(b[0]).toEqual({ upTo: 18200, rate: 0.00 });
    expect(b[1]).toEqual({ upTo: 45000, rate: 0.15 });
    expect(b[2]).toEqual({ upTo: 135000, rate: 0.30 });
    expect(b[3]).toEqual({ upTo: 190000, rate: 0.37 });
    expect(b[4].rate).toBe(0.45);
    expect(b[4].upTo).toBe(Infinity);
    expect(tax.incomeTax.taxFreeThreshold).toBe(18200);
  });

  it("2027年7月からの14%は今年度に適用されない", () => {
    expect(tax.incomeTax.scheduledSecondBandRateFrom2027).toBe(0.14);
    expect(tax.incomeTax.bands[1].rate).toBe(0.15);
  });

  it("非課税枠ちょうどまでは所得税0", () => {
    expect(tax.calculateIncomeTax(18200)).toBe(0);
    expect(near(tax.calculateIncomeTax(18201), 0.15)).toBe(true);
  });

  it("バンド境界の税額が積み上げどおり", () => {
    expect(near(tax.calculateIncomeTax(45000), (45000 - 18200) * 0.15)).toBe(true);
    const at135k = (45000 - 18200) * 0.15 + (135000 - 45000) * 0.30;
    expect(near(tax.calculateIncomeTax(135000), at135k)).toBe(true);
    const at190k = at135k + (190000 - 135000) * 0.37;
    expect(near(tax.calculateIncomeTax(190000), at190k)).toBe(true);
    expect(near(tax.calculateIncomeTax(250000), at190k + (250000 - 190000) * 0.45)).toBe(true);
  });

  it("限界税率がバンド境界ちょうどで切り替わる", () => {
    expect(tax.getMarginalRate(18200)).toBe(0.00);
    expect(tax.getMarginalRate(18201)).toBe(0.15);
    expect(tax.getMarginalRate(45000)).toBe(0.15);
    expect(tax.getMarginalRate(45001)).toBe(0.30);
    expect(tax.getMarginalRate(135000)).toBe(0.30);
    expect(tax.getMarginalRate(135001)).toBe(0.37);
    expect(tax.getMarginalRate(190000)).toBe(0.37);
    expect(tax.getMarginalRate(190001)).toBe(0.45);
  });

  it("所得0・マイナスでも例外を投げず0", () => {
    expect(tax.calculateIncomeTax(0)).toBe(0);
    expect(tax.calculateIncomeTax(-1000)).toBe(0);
    expect(tax.calculateIncomeTax(undefined)).toBe(0);
  });

  it("Medicare levy は2%。合計税額は所得税＋levy", () => {
    expect(tax.medicareLevy.rate).toBe(0.02);
    expect(near(tax.calculateMedicareLevy(100000), 2000)).toBe(true);
    const r = tax.calculateTotalTax(100000);
    expect(near(r.total, r.incomeTax + r.medicareLevy)).toBe(true);
    expect(near(tax.getMarginalRateWithLevy(100000), 0.32)).toBe(true);
  });

  it("非居住者は未実装であることが宣言されている", () => {
    expect(tax.region).toMatch(/foreign residents not implemented/);
  });
});

// ---------------------------------------------------------------------------
// Superannuation の税制
// ---------------------------------------------------------------------------
describe("AU境界：Superannuation の税率", () => {
  it("拠出時15%、積立期の運用益15%、退職フェーズ0%、60歳以降の引出0%", () => {
    const s = tax.superannuation;
    expect(s.contributionsTaxRate).toBe(0.15);
    expect(s.earningsTaxAccumulation).toBe(0.15);
    expect(s.earningsTaxRetirementPhase).toBe(0.00);
    expect(s.withdrawalTaxAfter60).toBe(0.00);
  });

  it("Division 293 の閾値は A$250,000、追加税率15%", () => {
    expect(tax.superannuation.div293Threshold).toBe(250000);
    expect(tax.superannuation.div293AdditionalRate).toBe(0.15);
  });

  it("閾値ちょうどでは Division 293 は発生しない", () => {
    const c = 30000;
    const income = 250000 - c; // 所得＋拠出 = ちょうど 250,000
    const r = tax.calculateSuperContributionTax(c, income);
    expect(r.div293Applies).toBe(false);
    expect(r.div293Base).toBe(0);
    expect(r.div293Tax).toBe(0);
    expect(near(r.effectiveRate, 0.15)).toBe(true);
  });

  it("追加課税の対象額は min(拠出額, 所得＋拠出 − 250,000)", () => {
    const c = 30000;
    // 超過1ドル → 対象は拠出全額ではなく1ドルだけ
    const justOver = tax.calculateSuperContributionTax(c, 250001 - c);
    expect(justOver.div293Applies).toBe(true);
    expect(near(justOver.div293Base, 1)).toBe(true);
    expect(near(justOver.div293Tax, 0.15)).toBe(true);

    // 超過10,000ドル → 対象は10,000ドル
    const partial = tax.calculateSuperContributionTax(c, 260000 - c);
    expect(near(partial.div293Base, 10000)).toBe(true);
    expect(near(partial.div293Tax, 1500)).toBe(true);

    // 超過が拠出額を上回る → 対象は拠出額で頭打ち（実効30%）
    const full = tax.calculateSuperContributionTax(c, 300000);
    expect(near(full.div293Base, c)).toBe(true);
    expect(near(full.div293Tax, c * 0.15)).toBe(true);
    expect(near(full.effectiveRate, 0.30)).toBe(true);
  });

  it("閾値の前後で税額が連続している（不連続な跳ね上がりがない）", () => {
    const c = 30000;
    const at = (income) => tax.calculateSuperContributionTax(c, income - c).total;
    expect(near(at(250000), 4500)).toBe(true);
    expect(near(at(250001), 4500.15)).toBe(true);
    expect(Math.abs(at(250001) - at(250000))).toBeLessThan(1);
  });

  it("実効税率は15%から30%へ滑らかに上がる", () => {
    const c = 30000;
    const rate = (income) => tax.calculateSuperContributionTax(c, income - c).effectiveRate;
    expect(near(rate(250000), 0.15)).toBe(true);
    expect(near(rate(265000), 0.225)).toBe(true); // 超過15,000＝拠出の半分
    expect(near(rate(280000), 0.30)).toBe(true);  // 超過30,000＝拠出全額
    expect(near(rate(500000), 0.30)).toBe(true);  // 以降は30%で頭打ち
  });

  it("拠出0なら税額も実効税率も0", () => {
    const r = tax.calculateSuperContributionTax(0, 300000);
    expect(r.total).toBe(0);
    expect(r.effectiveRate).toBe(0);
  });

  it("給与犠牲の節税額は限界税率＋levy と拠出課税15%の差ぶん", () => {
    const saving = tax.calculateSalarySacrificeSaving(10000, 100000);
    // 限界税率30% + levy2% = 32% で課税所得が減り、拠出には15%かかる
    expect(near(saving, 10000 * (0.32 - 0.15), 1e-6)).toBe(true);
  });

  it("節税額はマイナスにならない（拠出課税の方が高い低所得帯）", () => {
    expect(tax.calculateSalarySacrificeSaving(5000, 20000)).toBeGreaterThanOrEqual(0);
    expect(tax.calculateSalarySacrificeSaving(0, 100000)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 譲渡益課税
// ---------------------------------------------------------------------------
describe("AU境界：譲渡益課税（12か月超で50%割引）", () => {
  it("割引率は50%、保有期間の基準は12か月", () => {
    expect(tax.capitalGains.discountRate).toBe(0.50);
    expect(tax.capitalGains.minimumHoldingMonths).toBe(12);
  });

  it("12か月超なら利益の50%だけが課税所得に算入される", () => {
    const t = tax.calculateCapitalGainsTax(20000, 100000, true);
    expect(near(t, 20000 * 0.5 * 0.32)).toBe(true);
  });

  it("12か月以内なら割引なしで全額が算入される", () => {
    const t = tax.calculateCapitalGainsTax(20000, 100000, false);
    expect(near(t, 20000 * 0.32)).toBe(true);
  });

  it("保有期間を渡さない場合は割引ありとして扱う", () => {
    const a = tax.calculateCapitalGainsTax(20000, 100000);
    const b = tax.calculateCapitalGainsTax(20000, 100000, true);
    expect(near(a, b)).toBe(true);
  });

  it("利益0・マイナスなら税額0", () => {
    expect(tax.calculateCapitalGainsTax(0, 100000, true)).toBe(0);
    expect(tax.calculateCapitalGainsTax(-5000, 100000, true)).toBe(0);
  });

  it("バンドをまたぐ利益は分割して課税される", () => {
    // 他の所得 A$130,000、利益 A$40,000（50%割引で算入 A$20,000）
    const t = tax.calculateCapitalGainsTax(40000, 130000, true);
    const expected = (135000 - 130000) * 0.32 + (150000 - 135000) * 0.39;
    expect(near(t, expected, 1e-6)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 資産区分・医療費
// ---------------------------------------------------------------------------
describe("AU境界：資産区分（splitAssets）", () => {
  const acc = accounts({ superannuation: 400000, investmentAccount: 100000, cashSavings: 50000 });

  it("preservation age 未満は Super が Restricted", () => {
    const s = inv.splitAssets(59, acc);
    expect(s.liquid).toBe(150000);
    expect(s.restricted).toBe(400000);
    expect(s.isAccessibleAge).toBe(false);
  });

  it("60歳ちょうどで Super が Liquid に移る", () => {
    const s = inv.splitAssets(60, acc);
    expect(s.liquid).toBe(550000);
    expect(s.restricted).toBe(0);
    expect(s.isAccessibleAge).toBe(true);
  });

  it("Tax-Advantaged は Super、総資産は年齢に関係なく一定", () => {
    [30, 59, 60, 90].forEach((age) => {
      const s = inv.splitAssets(age, acc);
      expect(s.taxAdvantaged).toBe(400000);
      expect(s.total).toBe(550000);
      expect(s.liquid + s.restricted).toBe(s.total);
    });
  });
});

describe("AU境界：医療費（自己負担の合計）", () => {
  it("民間保険だけ月額入力で、他は年額として合算される", () => {
    const total = health.getAnnualTotal({
      gapAnnual: 200, privateHealthInsuranceMonthly: 150, pharmaceuticalAnnual: 300,
      dentalAnnual: 400, opticalAnnual: 100, agedCareAnnual: 500, otherOutOfPocketAnnual: 50,
    });
    expect(total).toBe(200 + 1800 + 300 + 400 + 100 + 500 + 50);
  });

  it("未入力・undefined でも0を返す", () => {
    expect(health.getAnnualTotal({})).toBe(0);
    expect(health.getAnnualTotal(undefined)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 未実装項目の宣言（推測値を混入させないための宣言テスト）
// ---------------------------------------------------------------------------
describe("AU境界：未実装項目が明示されている", () => {
  it("投資・年金・医療・税制それぞれに notImplemented がある", () => {
    [inv, ret, health, tax].forEach((section) => {
      expect(Array.isArray(section.notImplemented)).toBe(true);
      expect(section.notImplemented.length).toBeGreaterThan(0);
    });
  });

  it("繰越拠出・非居住者税率が未実装として列挙されている", () => {
    const all = [...inv.notImplemented, ...ret.notImplemented, ...tax.notImplemented].join(" / ");
    expect(all).toMatch(/carry-forward/);
    expect(all).toMatch(/非居住者/);
  });

  it("Deemingは実装済みなので未実装リストから外れている", () => {
    expect(ret.notImplemented.join(" / ")).not.toMatch(/Deeming（金融資産のみなし収入）—/);
    expect(typeof ret.getDeemedIncomeAnnual).toBe("function");
  });

  it("片方だけ受給資格年齢の場合の配偶者Super除外が未実装として明記されている", () => {
    expect(ret.notImplemented.join(" / ")).toMatch(/受給資格年齢未満の配偶者の積立フェーズSuper/);
  });
});
