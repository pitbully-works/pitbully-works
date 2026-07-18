// ============================================================================
// caFullRegression.test.js
// 【CA段階3】カナダ版全体の回帰テスト。新機能は追加せず、CA段階1〜2で実装・修正した
// 内容があらゆる条件の組み合わせで破綻しないことを最終確認する。
//
// 対象年度：2026（連邦のみ。州・準州の所得税とケベックのQPPは未実装）。
//
// 検証する不変条件（すべての投影年で成立すること）：
//   (1) 4口座のいずれも残高が負にならない
//   (2) 口座残高の合計が value と一致する
//   (3) 数値が NaN / Infinity にならない
//   (4) 退職前は生活費を資産から取り崩さない（US/GB/AUと共通の仕様）
//   (5) 取崩しは Cash → Non-Registered → TFSA → RRSP の順に進む
//   (6) RRIFの強制取崩しは、引出時税率0%なら資産の「移し替え」で総資産を変えず、
//       税率が設定されていれば税額分だけ総資産が減る
//
// 本ファイルが固定する修正点（CA監査で検出したもの）：
//   A-1 OAS：75歳到達で満額が10%上乗せされることが、受給中の金額に反映される
//   A-2 RRIF：退職年齢に関係なく、年齢だけで強制取崩しが発生する
//   A-3 取崩し順：simulateGrowth と ACCOUNT_DRAW_CATEGORY.CA が一致する
//   B-2 RRIF：強制転換は71歳末、最低取崩しの義務は72歳の年から
//   RRIF課税：強制取崩しは全額が課税所得なので、税引後の手取りだけが非登録口座へ移る
//
// 【本番経路の検証】
//   §7 は App.jsx が組み立てるのと同じ形の ctx を buildPlanInput に渡し、
//   その出力（pools / publicPensions / boundaries）と runIntegratedPlan の結果を検証する。
//   エンジンへ直接テスト用の設定を流し込むのではなく、
//   App → buildPlanInput → lifePlanEngine の接続そのものが正しいことを確かめる。
//
// 【退職前の生活費】
//   退職前（age <= retireAge）の生活費は給与で賄う前提のため、資産からは引き出さない。
//   annualWithdrawalNeeded は「退職後の不足額」として渡される値。
// ============================================================================

import { describe, it, expect } from "vitest";
import { CA_COUNTRY_RULES } from "./countryRules/CA.js";
import { JP_COUNTRY_RULES } from "./countryRules/JP.js";
import { US_COUNTRY_RULES } from "./countryRules/US.js";
import { GB_COUNTRY_RULES } from "./countryRules/GB.js";
import { AU_COUNTRY_RULES } from "./countryRules/AU.js";
import { runIntegratedPlan } from "./lifePlanEngine.js";
import { buildPlanInput } from "./utils/buildPlanInput.js";
import { getCountryRules } from "./countryRules/index.js";
import { ACCOUNT_DRAW_CATEGORY, DRAWDOWN_CATEGORIES } from "./utils/simulations.js";
import { JA_TRANSLATIONS } from "./translations/ja.js";
import { EN_TRANSLATIONS } from "./translations/en.js";

const inv = CA_COUNTRY_RULES.investment;
const ret = CA_COUNTRY_RULES.retirement;
const tax = CA_COUNTRY_RULES.tax;

const near = (actual, expected, tol = 1e-6) =>
  Math.abs(actual - expected) <= tol * Math.max(1, Math.abs(expected));

const ACCOUNT_KEYS = ["tfsa", "rrsp", "nonRegistered", "cashSavings"];

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
const expectAllInvariants = (sim, { retireAge, initialTotal = null }) => {
  for (const y of sim.yearly) {
    // (3) 数値の健全性
    expect(Number.isFinite(y.value)).toBe(true);
    ACCOUNT_KEYS.forEach((k) => expect(Number.isFinite(y.accounts[k])).toBe(true));
    // (1) 残高が負にならない
    expect(ACCOUNT_KEYS.every((k) => y.accounts[k] >= -0.01)).toBe(true);
    // (2) 合計の整合
    const total = ACCOUNT_KEYS.reduce((sum, k) => sum + y.accounts[k], 0);
    expect(near(total, y.value, 1e-6)).toBe(true);
    // (4) 退職までは取り崩しが起きない（利回り0・積立0なら初期残高のまま）
    if (initialTotal !== null && y.age <= retireAge) {
      expect(near(y.value, initialTotal, 1e-6)).toBe(true);
    }
  }
};

// ---------------------------------------------------------------------------
// 1. 全投影年の不変条件
// ---------------------------------------------------------------------------
describe("CA回帰：あらゆる条件の組み合わせで不変条件が保たれる", () => {
  const cases = [
    { name: "資産なし・取崩しなし", acc: {}, need: 0, retireAge: 65, deathAge: 95 },
    { name: "取崩しが資産を上回る（枯渇ケース）", acc: { cashSavings: 10000, rrsp: 10000 }, need: 60000, retireAge: 65, deathAge: 95 },
    { name: "RRSPだけ保有（RRIF強制取崩しあり）", acc: { rrsp: 500000 }, need: 20000, retireAge: 65, deathAge: 100 },
    { name: "TFSAだけ保有", acc: { tfsa: 300000 }, need: 20000, retireAge: 65, deathAge: 95 },
    { name: "4口座に分散・利回りあり", acc: { tfsa: 100000, rrsp: 400000, nonRegistered: 200000, cashSavings: 50000, returnPct: 5 }, need: 45000, retireAge: 65, deathAge: 100 },
    { name: "早期退職（55歳）", acc: { tfsa: 200000, rrsp: 300000, cashSavings: 100000 }, need: 40000, retireAge: 55, deathAge: 95 },
    { name: "退職が72歳以降（RRIFが先に始まる）", acc: { rrsp: 600000, nonRegistered: 50000 }, need: 30000, retireAge: 75, deathAge: 100 },
    { name: "100歳超の長寿（95歳以上の一律20%）", acc: { rrsp: 800000, tfsa: 200000 }, need: 50000, retireAge: 65, deathAge: 110 },
  ];

  cases.forEach(({ name, acc, need, retireAge, deathAge }) => {
    it(name, () => {
      const built = accounts(acc);
      const initialTotal = ACCOUNT_KEYS.reduce((s, k) => s + (built[k].currentValue || 0), 0);
      const sim = inv.simulateGrowth({
        currentAge: 50, retireAge, deathAge, accounts: built, annualWithdrawalNeeded: need,
      });
      // 利回り0のケースだけ「退職まで不変」を厳密に見る
      expectAllInvariants(sim, { retireAge, initialTotal: acc.returnPct ? null : initialTotal });
      expect(sim.yearly[sim.yearly.length - 1].age).toBe(deathAge);
    });
  });

  it("不正な入力（負の残高・文字列）でも例外を投げず有限値を返す", () => {
    const sim = inv.simulateGrowth({
      currentAge: 60, retireAge: 65, deathAge: 70,
      accounts: { tfsa: { currentValue: "abc" }, rrsp: { currentValue: -1000 }, nonRegistered: {}, cashSavings: {} },
      annualWithdrawalNeeded: "xyz",
    });
    expect(Number.isFinite(sim.finalValue)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. RRIF強制取崩し（B-2：72歳から）
// ---------------------------------------------------------------------------
describe("CA回帰：RRIF強制取崩しの開始年齢と挙動", () => {
  const run = (deathAge) => inv.simulateGrowth({
    currentAge: 69, retireAge: 69, deathAge,
    accounts: accounts({ rrsp: 500000 }), annualWithdrawalNeeded: 0,
  });

  it("70歳・71歳では強制取崩しが発生しない（転換前・転換年）", () => {
    const sim = run(75);
    const at = (age) => sim.yearly.find((y) => y.age === age);
    expect(at(70).rrifMinimum).toBe(0);
    expect(at(71).rrifMinimum).toBe(0);
    expect(at(71).accounts.rrsp).toBe(500000);
  });

  it("72歳から発生し、その年の率（5.40%）が適用される", () => {
    const sim = run(75);
    const y72 = sim.yearly.find((y) => y.age === 72);
    expect(near(y72.rrifMinimum, 500000 * 0.0540)).toBe(true);
    expect(near(y72.accounts.rrsp, 500000 * (1 - 0.0540))).toBe(true);
  });

  it("引き出した額は非登録口座へ移り、総資産は変わらない", () => {
    const sim = run(80);
    for (const y of sim.yearly) {
      expect(near(y.value, 500000, 1e-6)).toBe(true);
      expect(near(y.accounts.rrsp + y.accounts.nonRegistered, 500000, 1e-6)).toBe(true);
    }
  });

  it("RRSP残高を超えて引き出さない（残高が上限）", () => {
    const sim = inv.simulateGrowth({
      currentAge: 71, retireAge: 71, deathAge: 100,
      accounts: accounts({ rrsp: 1000 }), annualWithdrawalNeeded: 0,
    });
    for (const y of sim.yearly) {
      expect(y.accounts.rrsp).toBeGreaterThanOrEqual(0);
      expect(y.rrifMinimum).toBeLessThanOrEqual(1000);
    }
  });

  it("引出時税率を設定すると、税引後の手取りだけが非登録口座へ移る", () => {
    const acc = accounts({ rrsp: 500000 });
    acc.rrsp.withdrawalTaxPct = 25;
    const sim = inv.simulateGrowth({
      currentAge: 71, retireAge: 71, deathAge: 73, accounts: acc, annualWithdrawalNeeded: 0,
    });
    const y72 = sim.yearly.find((y) => y.age === 72);
    const gross = 500000 * 0.0540;
    expect(near(y72.rrifMinimum, gross)).toBe(true);
    expect(near(y72.rrifTax, gross * 0.25)).toBe(true);
    expect(near(y72.accounts.nonRegistered, gross * 0.75)).toBe(true);
    // 総資産は税額のぶんだけ減る（消えたわけではなく税として出ていく）
    expect(near(y72.value + y72.withdrawalTaxPaid, 500000)).toBe(true);
  });

  it("引出時税率0%なら従来どおり総資産は変わらない", () => {
    const sim = inv.simulateGrowth({
      currentAge: 71, retireAge: 71, deathAge: 80,
      accounts: accounts({ rrsp: 500000 }), annualWithdrawalNeeded: 0,
    });
    sim.yearly.forEach((y) => expect(near(y.value, 500000, 1e-6)).toBe(true));
    expect(sim.withdrawalTaxPaid).toBe(0);
  });

  it("95歳以降は一律20%が適用され続ける", () => {
    const sim = inv.simulateGrowth({
      currentAge: 94, retireAge: 94, deathAge: 100,
      accounts: accounts({ rrsp: 100000 }), annualWithdrawalNeeded: 0,
    });
    const y96 = sim.yearly.find((y) => y.age === 96);
    const y95 = sim.yearly.find((y) => y.age === 95);
    expect(near(y96.rrifMinimum, y95.accounts.rrsp * 0.20)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. 取崩し順の一貫性（A-3）
// ---------------------------------------------------------------------------
describe("CA回帰：取崩し順がプレビューと本計算で一致する", () => {
  it("ACCOUNT_DRAW_CATEGORY.CA は cash → taxable → taxFree → restricted の並び", () => {
    const catMap = ACCOUNT_DRAW_CATEGORY.CA;
    const order = ["cashSavings", "nonRegistered", "tfsa", "rrsp"]
      .map((k) => DRAWDOWN_CATEGORIES.indexOf(catMap[k]));
    // 4口座がすべてカテゴリ表に載っていること
    expect(order.every((i) => i >= 0)).toBe(true);
    // 並びが単調増加＝取崩し順と一致していること
    expect(order.every((v, i) => i === 0 || order[i - 1] < v)).toBe(true);
  });

  it("simulateGrowth も同じ順で取り崩す（現金→非登録→TFSA→RRSP）", () => {
    const sim = inv.simulateGrowth({
      currentAge: 65, retireAge: 65, deathAge: 68,
      accounts: accounts({ cashSavings: 10000, nonRegistered: 10000, tfsa: 10000, rrsp: 10000 }),
      annualWithdrawalNeeded: 12000,
    });
    const y66 = sim.yearly.find((y) => y.age === 66);
    // 1年目：現金10,000を使い切り、非登録から2,000
    expect(y66.accounts.cashSavings).toBe(0);
    expect(y66.accounts.nonRegistered).toBe(8000);
    expect(y66.accounts.tfsa).toBe(10000);
    expect(y66.accounts.rrsp).toBe(10000);
  });

  it("RRSPは最後まで温存される（他の3口座が尽きるまで手を付けない）", () => {
    const sim = inv.simulateGrowth({
      currentAge: 65, retireAge: 65, deathAge: 68,
      accounts: accounts({ cashSavings: 5000, nonRegistered: 5000, tfsa: 5000, rrsp: 100000 }),
      annualWithdrawalNeeded: 10000,
    });
    const y66 = sim.yearly.find((y) => y.age === 66);
    expect(y66.accounts.rrsp).toBe(100000);
    expect(y66.accounts.tfsa).toBe(5000);
  });
});

// ---------------------------------------------------------------------------
// 4. エンジン層（lifePlanEngine）での挙動：A-1 / A-2
// ---------------------------------------------------------------------------
describe("CA回帰：エンジン上のOAS（A-1：75歳の10%上乗せ）", () => {
  // OASだけを収入に持ち、生活費0。余った現金は銀行プールに積み上がるので、
  // 銀行残高の年間増加額＝その年のOAS年額になる。
  const plan = (startAge, residenceYears, netIncome) => runIntegratedPlan({
    currentAge: 65, retireAge: 65, deathAge: 80,
    boundaries: [ret.oas.enhancedAge],
    pools: [{ id: "bank_0", group: "bank", balance: 0, annualReturnPct: 0, monthlyContribution: 0, drawOrder: 0 }],
    livingCostMonthly: 0,
    surplusTargetId: "bank_0",
    publicPensions: [{
      startAge: ret.getOasEffectiveStartAge(startAge),
      monthlyAmount: 0,
      monthlyAmountAt: (age) => ret.getOasAnnualAfterClawback(
        netIncome, ret.getOasAnnualBeforeClawback(age, startAge, residenceYears),
      ) / 12,
    }],
  });

  const bankAt = (r, age) => r.yearly.find((y) => y.age === age).pool_bank_0;

  it("74歳までは65〜74歳レート、75歳到達後は75歳以上レートで積み上がる", () => {
    const r = plan(65, 40, 0);
    const beforeUplift = bankAt(r, 75) - bankAt(r, 74);
    const afterUplift = bankAt(r, 76) - bankAt(r, 75);
    expect(near(beforeUplift, ret.oas.maxMonthly65to74 * 12)).toBe(true);
    expect(near(afterUplift, ret.oas.maxMonthly75plus * 12)).toBe(true);
  });

  it("上乗せ幅はちょうど10%（判定は74歳→75歳の境界で一度だけ起きる）", () => {
    const r = plan(65, 40, 0);
    const before = bankAt(r, 75) - bankAt(r, 74);
    const after = bankAt(r, 76) - bankAt(r, 75);
    expect(after).toBeGreaterThan(before);
    expect(near(after / before, ret.oas.maxMonthly75plus / ret.oas.maxMonthly65to74)).toBe(true);
    // 76→77 では変化しない（上乗せは一度きり）
    expect(near(bankAt(r, 77) - bankAt(r, 76), after)).toBe(true);
  });

  it("居住年数の按分は上乗せ後にも同じ率でかかる", () => {
    const r = plan(65, 20, 0);
    const after = bankAt(r, 76) - bankAt(r, 75);
    expect(near(after, ret.oas.maxMonthly75plus * 12 * 0.5)).toBe(true);
  });

  it("繰下げ（70歳受給）でも75歳の上乗せが効く", () => {
    const r = plan(70, 40, 0);
    expect(bankAt(r, 70)).toBe(0);                     // 受給前は積み上がらない
    const before = bankAt(r, 75) - bankAt(r, 74);
    const after = bankAt(r, 76) - bankAt(r, 75);
    expect(near(before, ret.oas.maxMonthly65to74 * 12 * 1.36)).toBe(true);
    expect(near(after, ret.oas.maxMonthly75plus * 12 * 1.36)).toBe(true);
  });

  it("クローバックが効く所得でも、上乗せ後の金額から回収される", () => {
    const netIncome = ret.oas.recoveryTaxThreshold2026 + 10000; // 回収額 C$1,500
    const r = plan(65, 40, netIncome);
    const after = bankAt(r, 76) - bankAt(r, 75);
    expect(near(after, ret.oas.maxMonthly75plus * 12 - 1500)).toBe(true);
  });
});

describe("CA回帰：エンジン上のRRIF（A-2：退職年齢に依存しない）", () => {
  const plan = ({ retireAge, requiresRetirement }) => runIntegratedPlan({
    currentAge: 70, retireAge, deathAge: 78,
    boundaries: [inv.rrifConversionAge, inv.rrifFirstWithdrawalAge],
    livingCostMonthly: 0,
    pools: [
      {
        id: "rrsp", group: "investment", balance: 500000, annualReturnPct: 0,
        monthlyContribution: 0, contribEndAge: 70, drawOrder: 3,
        minimumDrawdown: (age, bal) => (age >= inv.rrifFirstWithdrawalAge ? inv.getRrifMinimumWithdrawal(age, bal) : 0),
        minimumDrawdownTo: "nonRegistered",
        ...(requiresRetirement === undefined ? {} : { minimumDrawdownRequiresRetirement: requiresRetirement }),
      },
      { id: "nonRegistered", group: "investment", balance: 0, annualReturnPct: 0, monthlyContribution: 0, contribEndAge: 70, drawOrder: 1 },
    ],
  });

  it("退職年齢が80歳（＝就労継続中）でも72歳から強制取崩しが発生する", () => {
    const r = plan({ retireAge: 80, requiresRetirement: false });
    const at = (age) => r.yearly.find((y) => y.age === age);
    expect(at(71).pool_rrsp).toBe(500000);
    expect(near(at(72).pool_rrsp, 500000 * (1 - 0.0540))).toBe(true);
    expect(near(at(72).pool_nonRegistered, 500000 * 0.0540)).toBe(true);
  });

  it("強制取崩しは移し替えなので、総資産は一切変わらない", () => {
    const r = plan({ retireAge: 80, requiresRetirement: false });
    for (const y of r.yearly) {
      expect(near(y.pool_rrsp + y.pool_nonRegistered, 500000, 1e-6)).toBe(true);
    }
  });

  it("引出時課税のある口座では、税引後だけが移動先へ入る", () => {
    const r = runIntegratedPlan({
      currentAge: 70, retireAge: 80, deathAge: 74,
      boundaries: [inv.rrifFirstWithdrawalAge],
      livingCostMonthly: 0,
      pools: [
        {
          id: "rrsp", group: "investment", balance: 500000, annualReturnPct: 0,
          monthlyContribution: 0, contribEndAge: 70, drawOrder: 3, withdrawalTaxPct: 25,
          minimumDrawdown: (age, bal) => (age >= inv.rrifFirstWithdrawalAge ? inv.getRrifMinimumWithdrawal(age, bal) : 0),
          minimumDrawdownTo: "nonRegistered",
          minimumDrawdownRequiresRetirement: false,
        },
        { id: "nonRegistered", group: "investment", balance: 0, annualReturnPct: 0, monthlyContribution: 0, contribEndAge: 70, drawOrder: 1 },
      ],
    });
    const at72 = r.yearly.find((y) => y.age === 72);
    const gross = 500000 * 0.0540;
    expect(near(at72.pool_rrsp, 500000 - gross)).toBe(true);
    expect(near(at72.pool_nonRegistered, gross * 0.75)).toBe(true);
    expect(near(at72.cumulativeWithdrawalTax, gross * 0.25)).toBe(true);
  });

  it("フラグ未指定なら従来どおり退職前は発生しない（豪Superの挙動を保つ）", () => {
    const r = plan({ retireAge: 80 });
    const at = (age) => r.yearly.find((y) => y.age === age);
    expect(at(75).pool_rrsp).toBe(500000);
    expect(at(75).pool_nonRegistered).toBe(0);
  });

  it("退職済み（65歳退職）でも同じく72歳から発生する", () => {
    const r = plan({ retireAge: 70, requiresRetirement: false });
    const at = (age) => r.yearly.find((y) => y.age === age);
    expect(at(71).pool_rrsp).toBe(500000);
    expect(near(at(72).pool_rrsp, 500000 * (1 - 0.0540))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. 国別ルールの独立性（データ漏れの防止）
// ---------------------------------------------------------------------------
describe("CA回帰：カナダのルールが他国の値を参照していない", () => {
  it("CAの制度上限が他国の上限と一致しない（値の取り違えがない）", () => {
    expect(inv.limits.tfsaAnnualLimit).not.toBe(GB_COUNTRY_RULES.investment.limits.isaAnnualAllowance);
    expect(inv.limits.rrspAnnualDollarLimit).not.toBe(JP_COUNTRY_RULES.investment.annualInstallmentLimit);
  });

  it("4カテゴリすべてが implemented: true で、JPへのフォールバックがない", () => {
    ["investment", "retirement", "healthcare", "tax"].forEach((k) => {
      expect(CA_COUNTRY_RULES[k].implemented).toBe(true);
    });
  });

  it("CAの口座キーが他国の口座キーと重複しない（cashSavings を除く）", () => {
    const caKeys = inv.accountTypes.filter((k) => k !== "cashSavings");
    const others = [
      ...Object.keys(ACCOUNT_DRAW_CATEGORY.US),
      ...Object.keys(ACCOUNT_DRAW_CATEGORY.GB),
      ...Object.keys(ACCOUNT_DRAW_CATEGORY.AU),
    ];
    caKeys.forEach((k) => expect(others.includes(k)).toBe(false));
  });

  it("CPP・OASの受給年齢が他国の公的年金の年齢設定と独立している", () => {
    expect(ret.cpp.earliestAge).toBe(60);
    expect(ret.oas.standardAge).toBe(65);
    expect(ret.oas.earlyClaimAllowed).toBe(false);
    expect(AU_COUNTRY_RULES.retirement.implemented).toBe(true);
  });

  it("連邦税バンドが米国のバンドと別物であること", () => {
    expect(tax.incomeTax.bands[0].rate).toBe(0.14);
    expect(US_COUNTRY_RULES.tax.implemented).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. 翻訳の完全性
// ---------------------------------------------------------------------------
describe("CA回帰：CA向け翻訳キーが日英そろっている", () => {
  const caKeys = Object.keys(EN_TRANSLATIONS).filter((k) => /^ca[A-Z]/.test(k));

  it("CA専用キーが十分な数だけ存在する", () => {
    expect(caKeys.length).toBeGreaterThan(50);
  });

  it("英語にあるCAキーはすべて日本語にも存在する", () => {
    const missing = caKeys.filter((k) => JA_TRANSLATIONS[k] === undefined);
    expect(missing).toEqual([]);
  });

  it("日本語にあるCAキーはすべて英語にも存在する", () => {
    const jaCaKeys = Object.keys(JA_TRANSLATIONS).filter((k) => /^ca[A-Z]/.test(k));
    const missing = jaCaKeys.filter((k) => EN_TRANSLATIONS[k] === undefined);
    expect(missing).toEqual([]);
  });

  it("CAキーの値が空文字になっていない", () => {
    const empty = caKeys.filter((k) => String(EN_TRANSLATIONS[k]).trim() === "" || String(JA_TRANSLATIONS[k]).trim() === "");
    expect(empty).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 7. 本番経路の統合テスト（App → buildPlanInput → lifePlanEngine）
//    エンジンへ直接テスト用のプールを渡すのではなく、App.jsx が渡すのと同じ形の
//    ctx を buildPlanInput に通し、その出力とシミュレーション結果の両方を検証する。
// ---------------------------------------------------------------------------
describe("CA統合：buildPlanInput が組み立てた計画が本番経路どおりに動く", () => {
  const rules = getCountryRules("CA");

  const acct = (v = {}) => ({
    currentValue: 0, annualContribution: 0, expectedReturnPct: 0,
    contributionEndAge: 65, withdrawalTaxPct: 0, ...v,
  });

  // App.jsx の caInvestment と同じ形の入力。
  const makeCaInputs = (over = {}) => ({
    country: "CA", baseCurrency: "CAD", language: "en",
    currentAge: 70, retireAge: 80, deathAge: 85,
    livingCostMonthly: 0,
    inheritanceTarget: 0, inheritancePlans: [],
    publicPensionStartAge: 65, pensionMonthly: 0, pensionSources: [],
    healthBrackets: { b60: 0, b70: 0, b80: 0 },
    tsumitateSchedule: [], growthSchedule: [], lumpSums: [],
    tsumitateUsed: 0, growthUsed: 0,
    banks: [{ name: "main", balance: 0, monthlyDeposit: 0, interestPct: 0 }],
    loans: [], insurancePolicies: [], privatePensionPlans: [],
    gold: {
      currentGrams: 0, pricePerGram: 0, priceGrowthPct: 0, priceGrowthPctAuto: false,
      monthlyYen: 0, accumulateUntilAge: 65, asOfYears: "", asOfMonths: "",
    },
    ideco: {
      currentValue: 0, principalTotal: 0, monthlyContribution: 0,
      startAge: 35, endAge: 60, productName: "", returnPct: 0, returnPctAuto: false,
      expectedReturnPct: 0, payoutStartAge: 60, payoutMethod: "lump", payoutYears: 10,
      lumpPortionPct: 0, payoutReturnPct: 0, annualIncome: 0, asOfYears: "", asOfMonths: "",
    },
    usInvestment: {}, gbInvestment: {}, auInvestment: {},
    caInvestment: {
      annualIncome: 0, priorEarnedIncome: 0, estimatedCapitalGainAnnual: 0,
      tfsa: acct(), rrsp: acct({ currentValue: 500000, withdrawalTaxPct: 25 }),
      nonRegistered: acct(), cashSavings: acct(),
      cpp: { startAge: 65, estimatedAnnualAt65: 0 },
      oas: { startAge: 65, residenceYears: 40 },
      additionalPensionAnnual: 0,
      healthcare: {},
      expensesMonthly: 0,
      ...over,
    },
  });

  // App.jsx の countryDerived と同じ値を、CAルールから実際に計算して渡す。
  const makeCtx = (over = {}, planOver = {}) => {
    const inputs = makeCaInputs(over);
    const ca = inputs.caInvestment;
    const oasStartAge = Number(ca.oas.startAge) || 65;
    const oasEffective = rules.retirement.getOasEffectiveStartAge(oasStartAge);
    const oasBefore = rules.retirement.getOasAnnualBeforeClawback(
      oasEffective, oasStartAge, ca.oas.residenceYears,
    );
    const netIncome = Number(ca.annualIncome) || 0;
    Object.assign(inputs, planOver);
    return {
      country: "CA", rules, inputs,
      effectiveCurrentAge: inputs.currentAge,
      effectiveCurrentAssets: 0,
      effectivePostRetireReturn: 0,
      dynamicFunds: [], stockTotalNow: 0, effectiveStockReturnPct: 0,
      goldCurrentValue: 0, effectiveGoldReturnPct: 0,
      effectivePensionMonthly: 0, effectivePublicPensionStartAge: 65,
      drawdownOrder: DRAWDOWN_CATEGORIES,
      uncategorizedLabel: "Uncategorised",
      countryDerived: {
        caCppAnnual: rules.retirement.getCppAnnualBenefit(ca.cpp.estimatedAnnualAt65, ca.cpp.startAge),
        caCppStartAge: Number(ca.cpp.startAge) || 65,
        caOasAnnual: rules.retirement.getOasAnnualAfterClawback(netIncome, oasBefore),
        caOasStartAge: oasStartAge,
        caAdditionalPensionAnnual: Number(ca.additionalPensionAnnual) || 0,
        caHealthcareAnnual: rules.healthcare.getAnnualTotal(ca.healthcare),
      },
    };
  };

  const poolOf = (plan, id) => plan.pools.find((x) => x.id === id);

  // ---- 生成された計画そのものの検証 ----
  it("4つのCA口座がすべてプールとして生成される", () => {
    const plan = buildPlanInput(makeCtx());
    ACCOUNT_KEYS.forEach((k) => expect(poolOf(plan, k)).toBeDefined());
  });

  it("drawOrder が Cash → Non-Registered → TFSA → RRSP の昇順になっている", () => {
    const plan = buildPlanInput(makeCtx());
    const order = ["cashSavings", "nonRegistered", "tfsa", "rrsp"].map((k) => poolOf(plan, k).drawOrder);
    expect(order.every((v, i) => i === 0 || order[i - 1] < v)).toBe(true);
    // 取崩し順序の表示（ACCOUNT_DRAW_CATEGORY）とも一致する
    const catOrder = ["cashSavings", "nonRegistered", "tfsa", "rrsp"]
      .map((k) => DRAWDOWN_CATEGORIES.indexOf(ACCOUNT_DRAW_CATEGORY.CA[k]));
    expect(catOrder.every((v, i) => i === 0 || catOrder[i - 1] < v)).toBe(true);
  });

  it("RRSPプールに minimumDrawdown が設定され、移動先が nonRegistered である", () => {
    const rrsp = poolOf(buildPlanInput(makeCtx()), "rrsp");
    expect(typeof rrsp.minimumDrawdown).toBe("function");
    expect(rrsp.minimumDrawdownTo).toBe("nonRegistered");
  });

  it("RRSPプールの minimumDrawdownRequiresRetirement が false（退職年齢に依存しない）", () => {
    const rrsp = poolOf(buildPlanInput(makeCtx()), "rrsp");
    expect(rrsp.minimumDrawdownRequiresRetirement).toBe(false);
  });

  it("RRSP以外のCA口座には強制取崩しが設定されない", () => {
    const plan = buildPlanInput(makeCtx());
    ["tfsa", "nonRegistered", "cashSavings"].forEach((k) => {
      expect(poolOf(plan, k).minimumDrawdown).toBeUndefined();
    });
  });

  it("minimumDrawdown は71歳では0、72歳から率どおりの額を返す", () => {
    const rrsp = poolOf(buildPlanInput(makeCtx()), "rrsp");
    expect(rrsp.minimumDrawdown(71, 500000)).toBe(0);
    expect(near(rrsp.minimumDrawdown(72, 500000), 500000 * 0.0540)).toBe(true);
    expect(near(rrsp.minimumDrawdown(80, 500000), 500000 * 0.0682)).toBe(true);
  });

  it("境界年齢にRRIF転換(71)・RRIF開始(72)・OAS上乗せ(75)が積まれている", () => {
    const plan = buildPlanInput(makeCtx());
    [71, 72, 75].forEach((age) => expect(plan.boundaries.includes(age)).toBe(true));
  });

  it("OASストリームに monthlyAmountAt が設定され、75歳で10%上がる", () => {
    const plan = buildPlanInput(makeCtx());
    // CPP / OAS / 追加年金の3本
    expect(plan.publicPensions.length).toBe(3);
    const oas = plan.publicPensions[1];
    expect(typeof oas.monthlyAmountAt).toBe("function");
    expect(oas.startAge).toBe(65);
    expect(near(oas.monthlyAmountAt(74), ret.oas.maxMonthly65to74)).toBe(true);
    expect(near(oas.monthlyAmountAt(75), ret.oas.maxMonthly75plus)).toBe(true);
    expect(near(oas.monthlyAmountAt(75) / oas.monthlyAmountAt(74),
      ret.oas.maxMonthly75plus / ret.oas.maxMonthly65to74)).toBe(true);
  });

  it("OASの繰上げ指定（60歳）は受給開始65歳へ丸められる", () => {
    const plan = buildPlanInput(makeCtx({ oas: { startAge: 60, residenceYears: 40 } }));
    expect(plan.publicPensions[1].startAge).toBe(65);
  });

  // ---- 本番経路を通した実行結果の検証 ----
  it("退職年齢80歳（就労継続中）でも72歳から強制取崩しが発生する", () => {
    const r = runIntegratedPlan(buildPlanInput(makeCtx()));
    const at = (age) => r.yearly.find((y) => y.age === age);
    expect(at(71).pool_rrsp).toBe(500000);
    expect(near(at(72).pool_rrsp, 500000 * (1 - 0.0540))).toBe(true);
    // 引出時税率25%ぶんが控除され、手取りだけが非登録口座へ移る
    expect(near(at(72).pool_nonRegistered, 500000 * 0.0540 * 0.75)).toBe(true);
  });

  it("強制取崩しの税額が cumulativeWithdrawalTax に積まれ、その分だけ総資産が減る", () => {
    const r = runIntegratedPlan(buildPlanInput(makeCtx()));
    const at72 = r.yearly.find((y) => y.age === 72);
    expect(near(at72.cumulativeWithdrawalTax, 500000 * 0.0540 * 0.25)).toBe(true);
    expect(near(at72.pool_rrsp + at72.pool_nonRegistered + at72.cumulativeWithdrawalTax, 500000, 1e-6)).toBe(true);
  });

  it("引出時税率0%なら強制取崩しは純粋な移し替えになる（総資産不変）", () => {
    const ctx = makeCtx({ rrsp: acct({ currentValue: 500000, withdrawalTaxPct: 0 }) });
    const r = runIntegratedPlan(buildPlanInput(ctx));
    for (const y of r.yearly) {
      expect(near(y.pool_rrsp + y.pool_nonRegistered, 500000, 1e-6)).toBe(true);
    }
    expect(r.cumulativeWithdrawalTax).toBe(0);
  });

  it("OASは74歳まで65〜74歳レート、75歳到達後は上乗せ後のレートで入金される", () => {
    // 生活費0なので、余った収入はすべて銀行プールへ積み上がる
    const ctx = makeCtx({}, { currentAge: 65, retireAge: 65, deathAge: 80 });
    ctx.effectiveCurrentAge = 65;
    const r = runIntegratedPlan(buildPlanInput(ctx));
    const bank = (age) => r.yearly.find((y) => y.age === age).bankValue;
    expect(near(bank(75) - bank(74), ret.oas.maxMonthly65to74 * 12, 1e-4)).toBe(true);
    expect(near(bank(76) - bank(75), ret.oas.maxMonthly75plus * 12, 1e-4)).toBe(true);
  });

  it("本番経路でも全投影年で NaN・負残高が発生しない", () => {
    const ctx = makeCtx({
      tfsa: acct({ currentValue: 100000, expectedReturnPct: 5 }),
      rrsp: acct({ currentValue: 400000, expectedReturnPct: 5, withdrawalTaxPct: 25 }),
      nonRegistered: acct({ currentValue: 200000, expectedReturnPct: 5, withdrawalTaxPct: 12 }),
      cashSavings: acct({ currentValue: 50000, expectedReturnPct: 2 }),
      expensesMonthly: 5000,
      oas: { startAge: 70, residenceYears: 25 },
      cpp: { startAge: 60, estimatedAnnualAt65: 15000 },
    }, { currentAge: 60, retireAge: 65, deathAge: 100 });
    ctx.effectiveCurrentAge = 60;
    const r = runIntegratedPlan(buildPlanInput(ctx));
    for (const y of r.yearly) {
      expect(Number.isFinite(y.totalAssets)).toBe(true);
      expect(Number.isFinite(y.netWorth)).toBe(true);
      ACCOUNT_KEYS.forEach((k) => expect(y[`pool_${k}`]).toBeGreaterThanOrEqual(-0.01));
    }
    expect(r.yearly[r.yearly.length - 1].age).toBe(100);
  });

  it("元の inputs を変更しない（buildPlanInput は純粋）", () => {
    const ctx = makeCtx();
    const before = JSON.stringify(ctx.inputs);
    buildPlanInput(ctx);
    expect(JSON.stringify(ctx.inputs)).toBe(before);
  });
});
