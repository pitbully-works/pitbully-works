// ============================================================================
// surplusBalanceDisplay.test.js  — 第3段階（表示のみ）の表示データテスト
//
// 【このテストが守るもの】
// App.jsx の「余剰金残高」表示は、総資産グラフ・銀行残高と同一の integrated（統合エンジン
// runIntegratedPlan の結果）が各スナップショット行に持つ surplusBalance を、次の2つの
// 取り出し方だけで読む（別シミュレーションはしない）：
//   ・現在時点   = integrated.yearly[0].surplusBalance          （必ず 0＝積み上がりの起点）
//   ・選択年齢時点 = integratedRowAt(age).surplusBalance
//        integratedRowAt(age) = rows.find(y => y.age >= Math.round(age)) || 末尾行
//
// 旧実装は民間年金だけを対象にした別シミュレーション（surplusPrivateUpTo /
// surplusPlanInput / surplusIncomeStartAge）で余剰金カードを描いており、公的年金・iDeCo
// による余剰が総資産グラフには載るのにカードには載らない不一致があった。これを廃止し、
// カードと総資産グラフを同じ integrated から描くよう統一した。
// 本ファイルの「画面データ契約」テスト（A〜G）が、この単一計算源を固定する。
//
// React 描画テスト（5か国レンダー）は jsdom 依存のためこの環境では実行できないので、
// ここでは「表示が参照するデータ契約」を5か国形状で固定する：
//   (1) どの国の構成でも、全行に surplusBalance が finite で存在する（undefined を出さない）
//       → これが崩れると money(undefined) 等で表示側が壊れる（白画面クラスの不具合）。
//   (2) 現在時点セレクタは常に 0 を返す。
//   (3) 選択年齢セレクタは finite を返し、既知シナリオでは期待値と一致する。
//   (4) 表示に使う翻訳キーが ja / en の両辞書に存在し、{age} 補間トークンを含む。
//
// 併せて App.jsx 側は importIntegrity.test.js（静的参照チェック）が
// 「import も宣言もされていない識別子」ゼロを保証する。
// ============================================================================

import { describe, it, expect } from "vitest";
import { runIntegratedPlan, NOT_DRAWABLE } from "./lifePlanEngine.js";
import { JA_TRANSLATIONS } from "./translations/ja.js";
import { EN_TRANSLATIONS } from "./translations/en.js";

const assert = {
  ok: (cond, msg) => expect(cond, msg).toBeTruthy(),
  equal: (a, b, msg) => expect(a, msg).toBe(b),
};

// App.jsx の integratedRowAt と同じ照合（round して age>=target の最初の行、無ければ末尾）
function integratedRowAt(res, age) {
  const target = Math.round(age);
  const rows = res.yearly;
  return rows.find((y) => y.age >= target) || rows[rows.length - 1];
}
// App.jsx の表示セレクタと同じ2つの取り出し方
const surplusAtCurrent = (res) => res.yearly[0]?.surplusBalance ?? 0;
const surplusAtAge = (res, age) => integratedRowAt(res, age)?.surplusBalance ?? 0;

// 5か国を模した「口座形状」。国別ルールの実物（buildPlanInput / countryRules）ではなく、
// 各国で実際に現れる引出制限・強制取崩し・運用益課税のパターンを直接与えて、
// 表示が参照する surplusBalance の契約がどの形状でも崩れないことを確認する。
const base = {
  currentAge: 60, retireAge: 65, deathAge: 95,
  livingCostMonthly: 200000,
  publicPensions: [{ monthlyAmount: 220000, startAge: 65 }], // 生活費を上回る＝余剰が出る
  healthCostAnnual: () => 0,
  surplusTargetId: "bank",
};
const COUNTRY_SHAPES = {
  "JP": [
    { id: "nisa", group: "investment", balance: 5000000, annualReturnPct: 0, drawOrder: 1 },
    { id: "bank", group: "bank", balance: 3000000, annualReturnPct: 0, drawOrder: 2 },
    { id: "gold", group: "gold", balance: 1000000, annualReturnPct: 0, drawOrder: 90 },
  ],
  "US": [
    { id: "brokerage", group: "investment", balance: 2000000, annualReturnPct: 0, drawOrder: 1 },
    { id: "rothIra", group: "investment", balance: 2000000, annualReturnPct: 0, drawOrder: 4, accessAge: 59.5 },
    { id: "k401", group: "investment", balance: 3000000, annualReturnPct: 0, drawOrder: 3, accessAge: 59.5, withdrawalTaxPct: 22 },
    { id: "bank", group: "bank", balance: 2000000, annualReturnPct: 0, drawOrder: 2 },
  ],
  "GB": [
    { id: "gia", group: "investment", balance: 1500000, annualReturnPct: 0, drawOrder: 1 },
    { id: "stocksSharesIsa", group: "investment", balance: 1500000, annualReturnPct: 0, drawOrder: 3 },
    { id: "sipp", group: "investment", balance: 2000000, annualReturnPct: 0, drawOrder: 5, accessAge: 57 },
    { id: "bank", group: "bank", balance: 2000000, annualReturnPct: 0, drawOrder: 2 },
  ],
  "CA": [
    { id: "nonRegistered", group: "investment", balance: 1500000, annualReturnPct: 0, drawOrder: 1 },
    { id: "tfsa", group: "investment", balance: 1500000, annualReturnPct: 0, drawOrder: 2 },
    {
      id: "rrsp", group: "investment", balance: 3000000, annualReturnPct: 0, drawOrder: 3,
      minimumDrawdown: (age, bal) => (age >= 71 ? bal * 0.0528 : 0),
      minimumDrawdownTo: "nonRegistered",
    },
    { id: "bank", group: "bank", balance: 2000000, annualReturnPct: 0, drawOrder: 5 },
  ],
  "AU": [
    { id: "investmentAccount", group: "investment", balance: 2000000, annualReturnPct: 0, drawOrder: 1 },
    {
      id: "superannuation", group: "investment", balance: 4000000, annualReturnPct: 0, drawOrder: 3,
      accessAge: 60, earningsTaxPct: 15, contributionTaxPct: 15,
      minimumDrawdown: (age, bal) => (age >= 65 ? bal * 0.05 : 0),
      minimumDrawdownTo: "investmentAccount",
    },
    { id: "bank", group: "bank", balance: 2000000, annualReturnPct: 0, drawOrder: 2 },
  ],
};

describe("余剰金残高の表示データ契約（第3段階・5か国形状）", () => {
  for (const [country, pools] of Object.entries(COUNTRY_SHAPES)) {
    it(`${country}: 全スナップショット行に surplusBalance が finite で存在する（undefinedを出さない）`, () => {
      const res = runIntegratedPlan({ ...base, pools });
      res.yearly.forEach((r) => {
        assert.ok(
          typeof r.surplusBalance === "number" && Number.isFinite(r.surplusBalance),
          `${country}: age ${r.age} の surplusBalance が数値でない (${r.surplusBalance})`
        );
        assert.ok(r.surplusBalance >= 0, `${country}: age ${r.age} の surplusBalance が負 (${r.surplusBalance})`);
      });
    });

    it(`${country}: 現在時点セレクタは 0、選択年齢セレクタは finite（表示が壊れない）`, () => {
      const res = runIntegratedPlan({ ...base, pools });
      // 現在時点は必ず 0（積み上がりの起点）
      assert.equal(surplusAtCurrent(res), 0, `${country}: 現在時点の余剰金は 0 のはず`);
      // 選択年齢（現在・退職・想定寿命のどれでも）で finite が返る＝money()が壊れない
      [base.currentAge, base.retireAge, base.deathAge].forEach((age) => {
        const v = surplusAtAge(res, age);
        assert.ok(Number.isFinite(v), `${country}: age ${age} の選択値が finite でない (${v})`);
      });
      // 生活費を上回る年金があるので、想定寿命時点では余剰が積み上がっている
      assert.ok(surplusAtAge(res, base.deathAge) > 0, `${country}: 想定寿命時点で余剰が出ているはず`);
    });
  }

  it("既知シナリオ：選択年齢セレクタが手計算値と一致する", () => {
    // 65→66歳の1年、退職済み。年金 月22万 − 生活費 月20万 = 月2万 × 12 = 24万。
    const res = runIntegratedPlan({
      ...base,
      currentAge: 65, retireAge: 65, deathAge: 66,
      pools: [{ id: "bank", group: "bank", balance: 1000000, annualReturnPct: 0, drawOrder: 1 }],
    });
    assert.equal(surplusAtCurrent(res), 0, "現在時点は 0");
    assert.ok(Math.abs(surplusAtAge(res, 66) - 240000) < 1e-6, `66歳時点=${surplusAtAge(res, 66)}（期待 240,000）`);
  });
});

describe("余剰金残高の翻訳キー（ja / en に存在し {age} 補間を含む）", () => {
  const KEYS = [
    "surplusBalanceTitle",
    "surplusBalanceCurrentLabel",
    "surplusBalanceCurrentSub",
    "surplusBalanceSelectLabel",
    "surplusBalanceAtAgeLabel",
    "surplusBalanceExplain",
  ];
  it("ja / en の両辞書に6キーがすべて存在する", () => {
    KEYS.forEach((k) => {
      assert.ok(typeof JA_TRANSLATIONS[k] === "string" && JA_TRANSLATIONS[k].length > 0, `ja に ${k} が無い`);
      assert.ok(typeof EN_TRANSLATIONS[k] === "string" && EN_TRANSLATIONS[k].length > 0, `en に ${k} が無い`);
    });
  });

  it("現在ラベル/説明が新仕様（銀行預金の内数・公的年金/iDeCo含む・二重加算しない）を表す", () => {
    const jaLabel = JA_TRANSLATIONS.surplusBalanceCurrentLabel;
    const jaSub = JA_TRANSLATIONS.surplusBalanceCurrentSub;
    // 新仕様の趣旨が入っている（銀行預金の内数／公的年金・iDeCoを含む／二重加算しない）。
    assert.ok(jaLabel.includes("現在の余剰金残高"), `ja ラベルが新仕様でない: ${jaLabel}`);
    ["余剰金", "内数", "二重加算", "公的年金", "iDeCo"].forEach((w) => {
      assert.ok(jaSub.includes(w), `ja 説明に「${w}」が無い`);
    });
    const enLabel = EN_TRANSLATIONS.surplusBalanceCurrentLabel.toLowerCase();
    const enSub = EN_TRANSLATIONS.surplusBalanceCurrentSub.toLowerCase();
    assert.ok(enLabel.includes("current surplus balance"), `en ラベルが新仕様でない: ${EN_TRANSLATIONS.surplusBalanceCurrentLabel}`);
    ["surplus", "double-counted", "total assets", "public pension", "ideco"].forEach((w) => {
      assert.ok(enSub.includes(w), `en 説明に「${w}」が無い`);
    });
  });

  it("旧仕様の誤解を招く文言（民間年金だけ／公的年金・iDeCoを含めない／銀行残高に反映しない）が残っていない", () => {
    const jaLabel = JA_TRANSLATIONS.surplusBalanceCurrentLabel;
    const jaSub = JA_TRANSLATIONS.surplusBalanceCurrentSub;
    // ja：旧説明の特徴語が消えていること。
    // 「余剰金の使用」は Ver.1.0 で廃止した機能なので、説明文に再登場させない。
    ["受給開始年齢", "反映していません", "銀行残高には加算されません", "概算", "参考", "受給余剰", "余剰金の使用"].forEach((w) => {
      assert.ok(!jaLabel.includes(w), `ja ラベルに旧文言「${w}」が残っている`);
      assert.ok(!jaSub.includes(w), `ja 説明に旧文言「${w}」が残っている`);
    });
    // en：旧説明（private pension だけ／public pension・iDeCo を含めない／銀行残高に反映しない）が消えていること。
    const enLabel = EN_TRANSLATIONS.surplusBalanceCurrentLabel.toLowerCase();
    const enSub = EN_TRANSLATIONS.surplusBalanceCurrentSub.toLowerCase();
    ["estimate", "reference", "re-simulate", "does not reflect", "private pension's start age", "not added on top", "past history", "spend surplus"].forEach((w) => {
      assert.ok(!enLabel.includes(w), `en ラベルに旧文言「${w}」が残っている`);
      assert.ok(!enSub.includes(w), `en 説明に旧文言「${w}」が残っている`);
    });
  });
  it("年齢入りラベルは {age} 補間トークンを含む", () => {
    assert.ok(JA_TRANSLATIONS.surplusBalanceAtAgeLabel.includes("{age}"), "ja の {age} が無い");
    assert.ok(EN_TRANSLATIONS.surplusBalanceAtAgeLabel.includes("{age}"), "en の {age} が無い");
  });
  it("説明文が『年金等を受け取った後、使われずに銀行預金へ積み上がった金額』の趣旨を明記している", () => {
    const ja = JA_TRANSLATIONS.surplusBalanceExplain;
    ["年金", "使われず", "銀行預金", "積み上がった", "金額"].forEach((w) => {
      assert.ok(ja.includes(w), `ja 説明文に「${w}」が含まれていない`);
    });
  });
});

// ============================================================================
// 余剰金残高＝銀行内の実残高（銀行預金の取り崩しを一元追跡）
//   A〜J：生活費/医療費/保険料/ローン返済など銀行預金の取り崩しに応じて
//         surplusBalance が正しく減ること、および端の防御ケース。
//   併せて「既存の総資産計算を変えない」ことを比較テストで保証する。
// ============================================================================
describe("余剰金残高＝銀行内の実残高（通常取り崩しの一元追跡）", () => {
  const near = (a, b, t = 1) => Math.abs(a - b) <= t;
  const rowAt = (res, age) => res.yearly.find((y) => y.age >= Math.round(age)) || res.yearly[res.yearly.length - 1];
  const bankOf = (res, age) => rowAt(res, age).bankValue;
  const surpOf = (res, age) => rowAt(res, age).surplusBalance;
  const taOf = (res, age) => rowAt(res, age).totalAssets;
  // 退職済み・年金 月22万・生活費 月20万 → 年24万の余剰。銀行0%運用。
  const B = {
    currentAge: 65, retireAge: 65, deathAge: 70, livingCostMonthly: 200000,
    publicPensions: [{ monthlyAmount: 220000, startAge: 65 }], healthCostAnnual: () => 0,
    surplusTargetId: "bank",
  };
  const bankPool = (bal) => [{ id: "bank", group: "bank", balance: bal, annualReturnPct: 0, drawOrder: 1 }];

  // ---- ブロック1 ----
  it("A: 生活費＋医療費の赤字が過去の余剰24万を使い切る → 67歳で余剰0", () => {
    const A = runIntegratedPlan({ ...B, pools: bankPool(1000000), healthCostAnnual: (a) => (a >= 66 ? 480000 : 0) });
    assert.ok(near(surpOf(A, 66), 240000) && near(bankOf(A, 66), 1240000), `66歳 余剰${surpOf(A, 66)}/銀行${bankOf(A, 66)}`);
    assert.ok(near(surpOf(A, 67), 0) && near(bankOf(A, 67), 1000000), `67歳 余剰${surpOf(A, 67)}/銀行${bankOf(A, 67)}`);
    assert.ok(near(surpOf(A, 68), 0) && near(bankOf(A, 68), 760000), `68歳 余剰${surpOf(A, 68)}/銀行${bankOf(A, 68)}`);
  });
  it("B: 医療費が余剰を段階的に消費（36万/年 → 24→12→0）", () => {
    const r = runIntegratedPlan({ ...B, pools: bankPool(1000000), healthCostAnnual: (a) => (a >= 66 ? 360000 : 0) });
    assert.ok(near(surpOf(r, 66), 240000), `66歳=${surpOf(r, 66)}`);
    assert.ok(near(surpOf(r, 67), 120000), `67歳=${surpOf(r, 67)}`);
    assert.ok(near(surpOf(r, 68), 0), `68歳=${surpOf(r, 68)}`);
  });
  it("C: 保険料（48万/年・66歳から）が余剰を消費 → 67歳で余剰0", () => {
    const r = runIntegratedPlan({ ...B, pools: bankPool(1000000),
      insurancePolicies: [{ monthlyPremium: 40000, premiumFromAge: 66, premiumToAge: 200 }] });
    assert.ok(near(surpOf(r, 66), 240000), `66歳=${surpOf(r, 66)}`);
    assert.ok(near(surpOf(r, 67), 0), `67歳=${surpOf(r, 67)}`);
  });
  it("D: ローン返済が余剰を消費（退職前年金で作った余剰を退職後の返済赤字で使う）", () => {
    const r = runIntegratedPlan({
      currentAge: 64, retireAge: 65, deathAge: 67, livingCostMonthly: 0,
      publicPensions: [{ monthlyAmount: 20000, startAge: 64 }], healthCostAnnual: () => 0,
      surplusTargetId: "bank", pools: bankPool(0),
      loans: [{ principal: 10000000, annualRatePct: 0, monthlyPayment: 40000 }],
    });
    assert.ok(near(surpOf(r, 65), 240000), `65歳 余剰=${surpOf(r, 65)}`);
    assert.ok(near(surpOf(r, 66), 0), `66歳 余剰=${surpOf(r, 66)}`);
  });
  it("E: surplusTargetId 不存在なら余剰金残高は常に0（表示だけ増えない）＆総資産は保存", () => {
    const noTgt = runIntegratedPlan({ ...B, surplusTargetId: undefined, pools: bankPool(1000000) });
    const withTgt = runIntegratedPlan({ ...B, pools: bankPool(1000000) });
    assert.ok(noTgt.yearly.every((r) => r.surplusBalance === 0), `末尾=${surpOf(noTgt, 70)}`);
    assert.ok(near(taOf(noTgt, 70), taOf(withTgt, 70)), `cashは失われない: noTgt=${taOf(noTgt, 70)} tgt=${taOf(withTgt, 70)}`);
  });
  it("F: 銀行プールが無くても cash は消失しない（総資産に保存）", () => {
    const invOnly = [{ id: "inv", group: "investment", balance: 1000000, annualReturnPct: 0, drawOrder: 1 }];
    const r = runIntegratedPlan({ ...B, pools: invOnly }); // surplusTargetId "bank" 不存在 → 投資へフォールバック
    assert.ok(near(taOf(r, 70), 2200000), `総資産=${taOf(r, 70)}（初期100万＋余剰120万）`);
    assert.ok(r.yearly.every((x) => x.surplusBalance === 0), "銀行でないので台帳は非計上");
  });
  it("J: 銀行預金の減少時は表示上の余剰金内訳から先に減少したものとして記録する", () => {
    const r = runIntegratedPlan({ ...B, pools: bankPool(1000000), healthCostAnnual: (a) => (a >= 66 ? 480000 : 0) });
    assert.ok(near(surpOf(r, 67), 0), `67歳 余剰=${surpOf(r, 67)}`);
    assert.ok(near(bankOf(r, 67), 1000000), `銀行残高は記録の付け替えでは変わらない: 銀行=${bankOf(r, 67)}`);
  });

  // ---- 既存の総資産計算を変えないことの比較テスト ----
  it("比較: 銀行取り崩しが起きるシナリオでも総資産・純資産は手計算の基準値と一致", () => {
    // 収入源なし・生活費だけ銀行から取り崩す（surplusBalance は 0 のまま）。
    // reduceSurplusByBankDraw を挿入しても、資産・純資産系列は一切変わらないことを固定する。
    const r = runIntegratedPlan({ ...B, livingCostMonthly: 200000, publicPensions: [], pools: bankPool(12000000) });
    // 5年 × 生活費240万 = 1200万 取り崩し。総資産 1200万 → 0。
    assert.ok(near(taOf(r, 70), 0), `総資産=${taOf(r, 70)}`);
    r.yearly.forEach((y) => {
      assert.ok(near(y.netWorth, y.totalAssets - y.loanBalance), `age ${y.age}: netWorth不一致`);
      assert.ok(near(y.totalAssets, y.bankValue), `age ${y.age}: surplusが総資産に混入`);
      assert.equal(y.surplusBalance, 0, `age ${y.age}: 余剰0のはず`);
    });
  });
});

// ============================================================================
// 画面データ契約 A〜G（App.jsx の単一計算源の固定）
//   App の余剰金カードは、総資産グラフ・銀行残高と同じ integrated から
//     現在時点   = integrated.yearly[0].surplusBalance
//     選択年齢時点 = integratedRowAt(age).surplusBalance
//   を読むだけ。ここでは同名の2セレクタ（このファイル上部の surplusAtCurrent /
//   surplusAtAge / integratedRowAt）を使い、公的年金・民間年金・iDeCo いずれの余剰も
//   同じ計算源に載ること、使用後も一致すること、全年齢・5か国で一致することを固定する。
// ============================================================================
describe("画面データ契約：余剰金カードは integrated と同一計算源（A〜G）", () => {
  const near = (a, b, t = 1) => Math.abs(a - b) <= t;
  const bankPool = (b) => ({ id: "bank", group: "bank", balance: b, annualReturnPct: 0, drawOrder: 1 });
  const B = {
    currentAge: 65, retireAge: 65, deathAge: 70, livingCostMonthly: 200000,
    healthCostAnnual: () => 0, surplusTargetId: "bank",
  };

  it("A: 公的年金だけで余剰24万 → カードも24万（公的年金の余剰が反映される）", () => {
    const res = runIntegratedPlan({ ...B, publicPensions: [{ monthlyAmount: 220000, startAge: 65 }], pools: [bankPool(1000000)] });
    assert.ok(near(surplusAtAge(res, 66), 240000), `66歳カード=${surplusAtAge(res, 66)}`);
    assert.equal(surplusAtAge(res, 66), integratedRowAt(res, 66).surplusBalance);
    assert.equal(surplusAtCurrent(res), 0); // 現在時点は積み上がりの起点＝0
  });

  it("B: 民間年金だけで余剰 → カードと integrated が一致（民間年金の余剰も反映）", () => {
    const res = runIntegratedPlan({
      ...B, publicPensions: [],
      privatePensionPlans: [{ poolId: "priv", monthlyPayout: 220000, payoutFromAge: 65, payoutToAge: 90 }],
      pools: [bankPool(1000000), { id: "priv", group: "privatePension", balance: 5000000, annualReturnPct: 0, drawOrder: 80 }],
    });
    assert.ok(near(surplusAtAge(res, 66), 240000), `66歳カード=${surplusAtAge(res, 66)}`);
    assert.equal(surplusAtAge(res, 66), integratedRowAt(res, 66).surplusBalance);
  });

  it("C: iDeCo年金による余剰 → カードと integrated が一致（iDeCoの余剰も反映）", () => {
    const res = runIntegratedPlan({
      ...B, publicPensions: [],
      idecoPoolId: "ideco", idecoAnnuityMonthly: () => 220000,
      pools: [bankPool(1000000), { id: "ideco", group: "ideco", balance: 5000000, annualReturnPct: 0, accessAge: NOT_DRAWABLE }],
    });
    assert.ok(near(surplusAtAge(res, 66), 240000), `66歳カード=${surplusAtAge(res, 66)}`);
    assert.equal(surplusAtAge(res, 66), integratedRowAt(res, 66).surplusBalance);
  });

  it("E: 生活赤字で余剰金を使い切った後 → カードが0円になる", () => {
    // 年金22万・生活費20万で+24万/年、66歳から医療費48万/年の赤字 → 67歳で余剰0。
    const res = runIntegratedPlan({
      ...B, publicPensions: [{ monthlyAmount: 220000, startAge: 65 }],
      healthCostAnnual: (a) => (a >= 66 ? 480000 : 0), pools: [bankPool(1000000)],
    });
    assert.ok(near(surplusAtAge(res, 67), 0), `67歳カード=${surplusAtAge(res, 67)}`);
    assert.equal(surplusAtAge(res, 67), integratedRowAt(res, 67).surplusBalance);
  });

  it("F: 各年齢でカード値が integratedRowAt(age).surplusBalance と完全一致", () => {
    const res = runIntegratedPlan({
      ...B, currentAge: 60, deathAge: 95,
      publicPensions: [{ monthlyAmount: 220000, startAge: 65 }],
      pools: [bankPool(3000000), { id: "nisa", group: "investment", balance: 5000000, annualReturnPct: 0, drawOrder: 1 }],
    });
    res.yearly.forEach((r) => {
      assert.equal(surplusAtAge(res, r.age), integratedRowAt(res, r.age).surplusBalance, `age ${r.age} で不一致`);
    });
  });

  it("G: 5か国すべてで同じ計算源（selector が全年齢で integrated と一致）", () => {
    const base5 = {
      currentAge: 60, retireAge: 65, deathAge: 95, livingCostMonthly: 200000,
      publicPensions: [{ monthlyAmount: 220000, startAge: 65 }], healthCostAnnual: () => 0, surplusTargetId: "bank",
    };
    Object.entries(COUNTRY_SHAPES).forEach(([country, pools]) => {
      const res = runIntegratedPlan({ ...base5, pools });
      res.yearly.forEach((r) => {
        assert.equal(surplusAtAge(res, r.age), integratedRowAt(res, r.age).surplusBalance, `${country} age ${r.age} で不一致`);
      });
    });
  });
});

// ============================================================================
// 余剰金の積み上がり A〜G（Ver.1.0 仕様）
//   初期余剰金の手入力は無い。余剰金は必ず 0 から始まり、収入から生活費・医療費・
//   保険料・ローン返済を引いて実際に余った分だけ積み上がる。銀行預金の内数なので、
//   総資産には二重加算しない。
// ============================================================================
describe("余剰金の積み上がり（A〜G）", () => {
  const near = (a, b, t = 1) => Math.abs(a - b) <= t;
  const bankPool = (b) => [{ id: "bank", group: "bank", balance: b, annualReturnPct: 0, drawOrder: 1 }];
  const rowAt = (r, a) => r.yearly.find((y) => y.age >= Math.round(a)) || r.yearly[r.yearly.length - 1];
  const bankOf = (r, a) => rowAt(r, a).bankValue;
  // 年金22万/月 − 生活費20万/月 ＝ 年24万の余剰が積み上がる基準。
  const flat = (over = {}) => ({
    currentAge: 65, retireAge: 65, deathAge: 70, livingCostMonthly: 200000,
    publicPensions: [{ monthlyAmount: 220000, startAge: 65 }], healthCostAnnual: () => 0,
    surplusTargetId: "bank", pools: bankPool(1000000), ...over,
  });

  it("A: 現在時点カード（yearly[0].surplusBalance）は必ず0から始まる", () => {
    const r = runIntegratedPlan(flat());
    assert.ok(near(surplusAtCurrent(r), 0), `現在=${surplusAtCurrent(r)}`);
  });

  it("B: 収入が支出を上回った分だけ積み上がる（66歳で24万・67歳で48万）", () => {
    const r = runIntegratedPlan(flat());
    assert.ok(near(surplusAtAge(r, 66), 240000), `66歳=${surplusAtAge(r, 66)}`);
    assert.ok(near(surplusAtAge(r, 67), 480000), `67歳=${surplusAtAge(r, 67)}`);
  });

  it("E: 生活赤字なら積み上がらない（医療費20万/年で収支ゼロ）", () => {
    const r = runIntegratedPlan(flat({ healthCostAnnual: () => 240000 }));
    assert.ok(near(surplusAtAge(r, 66), 0), `66歳=${surplusAtAge(r, 66)}`);
  });

  it("F: 不変条件 — 余剰金は常に銀行残高以下", () => {
    const r = runIntegratedPlan(flat());
    assert.ok(r.yearly.every((y) => y.surplusBalance <= y.bankValue + 1), "不変条件 surplus<=bank");
  });

  it("G: 余剰金は総資産へ二重加算されない（銀行のみの構成で総資産＝銀行残高）", () => {
    const r = runIntegratedPlan(flat());
    r.yearly.forEach((y) => {
      assert.ok(near(y.totalAssets, y.bankValue), `age ${y.age}: 総資産(${y.totalAssets}) != 銀行(${y.bankValue})`);
      assert.ok(y.surplusBalance <= y.totalAssets + 1, `age ${y.age}: 余剰が総資産を超える`);
    });
  });

  it("初期余剰金の入力欄は廃止：翻訳キーが ja・en の両方から消えている", () => {
    ["initialSurplusLabel", "initialSurplusExplain"].forEach((k) => {
      assert.equal(JA_TRANSLATIONS[k], undefined, `ja に廃止済みキー ${k} が残っている`);
      assert.equal(EN_TRANSLATIONS[k], undefined, `en に廃止済みキー ${k} が残っている`);
    });
  });

  it("将来年齢の使用予約は廃止：関連キーが ja・en の両方から消えている", () => {
    ["surplusLegacyScheduled", "surplusUseAgePlaceholder"].forEach((k) => {
      assert.equal(JA_TRANSLATIONS[k], undefined, `ja に廃止済みキー ${k} が残っている`);
      assert.equal(EN_TRANSLATIONS[k], undefined, `en に廃止済みキー ${k} が残っている`);
    });
  });
});

// ============================================================================
// 画面データ契約：現在使える資産（フェーズ1）
//   ダッシュボードの「現在使える資産」カードは integrated.yearly[0].accessibleAssets を
//   単一計算源として読み出すだけ。エンジンには渡さない。
//   【Ver.1.0】生活防衛資金の入力と「現在自由に使える金額」カードは廃止した。
// ============================================================================
describe("現在使える資産（accessibleAssets の単一計算源）", () => {
  const near = (a, b, t = 1) => Math.abs(a - b) <= t;
  const bankPool = (b) => [{ id: "bank", group: "bank", balance: b, annualReturnPct: 0, drawOrder: 1 }];
  const flat = (over = {}) => ({
    currentAge: 65, retireAge: 65, deathAge: 70, livingCostMonthly: 200000,
    publicPensions: [{ monthlyAmount: 200000, startAge: 65 }], healthCostAnnual: () => 0,
    surplusTargetId: "bank", pools: bankPool(3000000), ...over,
  });

  it("現在使える資産は integrated.yearly[0].accessibleAssets を用いる（単一計算源）", () => {
    const res = runIntegratedPlan(flat());
    // 銀行のみ・即時アクセス → accessibleAssets = 300万
    assert.ok(near(res.yearly[0].accessibleAssets, 3000000), `accessible=${res.yearly[0].accessibleAssets}`);
  });

  it("生活防衛資金・現在自由に使える金額の翻訳キーは Ver.1.0 で廃止済み（残存しない）", () => {
    ["emergencyFundLabel", "emergencyFundExplain", "freeToSpendLabel", "freeToSpendExplain",
     "dashEmergencyLabel", "dashEmergencyHint", "dashFreeToSpendLabel", "dashFreeToSpendHint"].forEach((k) => {
      assert.ok(JA_TRANSLATIONS[k] === undefined, `ja に廃止済みキー ${k} が残っている`);
      assert.ok(EN_TRANSLATIONS[k] === undefined, `en に廃止済みキー ${k} が残っている`);
    });
  });
});

// ============================================================================
// フェーズ4：トップ統合ダッシュボードの画面データ契約
//   8項目すべてが単一の integrated（＋表示専用 inputs）から導出されることを固定する。
//   現在値＝yearly[0]、将来値＝integratedRowAt(age).netWorth、表示専用値は0円フロア・
//   総資産に二重加算しない。
// ============================================================================
describe("トップ統合ダッシュボードのデータ契約（単一 integrated 源）", () => {
  const near = (a, b, t = 1) => Math.abs(a - b) <= t;
  const rowAt = (res, age) => res.yearly.find((y) => y.age >= Math.round(age)) || res.yearly[res.yearly.length - 1];
  // 現在55歳・複数資産（銀行・NISA・401k(59.5)）＋借入。将来65/75/95を含む。
  const res = runIntegratedPlan({
    currentAge: 55, retireAge: 65, deathAge: 95, livingCostMonthly: 200000,
    publicPensions: [{ monthlyAmount: 220000, startAge: 65 }], healthCostAnnual: () => 0,
    surplusTargetId: "bank",
    pools: [
      { id: "bank", group: "bank", balance: 5000000, annualReturnPct: 0, drawOrder: 2 },
      { id: "nisa", group: "investment", balance: 8000000, annualReturnPct: 0, drawOrder: 1 },
      { id: "k401", group: "investment", balance: 3000000, annualReturnPct: 0, drawOrder: 3, accessAge: 59.5 },
    ],
    loans: [{ principal: 4000000, annualRatePct: 0, monthlyPayment: 30000 }],
  });
  it("現在の総資産カード = integrated.yearly[0].totalAssets", () => {
    assert.ok(near(res.yearly[0].totalAssets, rowAt(res, 55).totalAssets));
    assert.ok(res.yearly[0].totalAssets > 0);
  });

  it("現在使える資産カード = integrated.yearly[0].accessibleAssets（401kは55歳で除外）", () => {
    // 銀行500万＋NISA800万＝1300万（401k 300万は59.5歳まで除外）。
    assert.ok(near(res.yearly[0].accessibleAssets, 13000000), `accessible=${res.yearly[0].accessibleAssets}`);
  });

  it("現在の余剰金カード = integrated.yearly[0].surplusBalance（起点は0）", () => {
    assert.ok(near(surplusAtCurrent(res), 0), `surplus=${surplusAtCurrent(res)}`);
  });

  it("65・75・95歳の資産カード = integratedRowAt(age).netWorth", () => {
    [65, 75, 95].forEach((age) => {
      const v = rowAt(res, age).netWorth;
      assert.ok(Number.isFinite(v), `age ${age}: netWorth が有限でない`);
      // 純資産 = 総資産 − 借入（同じ行から）。
      assert.ok(near(v, rowAt(res, age).totalAssets - rowAt(res, age).loanBalance), `age ${age}: netWorth 不一致`);
    });
  });

  it("表示専用値は総資産に二重加算されない（totalAssets は帯の合計のまま）", () => {
    res.yearly.forEach((r) => {
      const band = r.investmentValue + r.goldValue + r.bankValue + r.stockValue + r.pensionValue + r.idecoLockedValue;
      assert.ok(near(band, r.totalAssets), `age ${r.age}: 総資産に余剰金等が混入`);
    });
  });

  it("翻訳キー（dashboard）が ja・en に存在し {age} 補間を含む", () => {
    const KEYS = ["walletDashboardTitle", "dashTotalAssetsLabel", "dashAccessibleLabel", "dashSurplusLabel",
      "dashAssetsAtAgeLabel", "walletDashboardNote"];
    KEYS.forEach((k) => {
      assert.ok(typeof JA_TRANSLATIONS[k] === "string" && JA_TRANSLATIONS[k].length > 0, `ja に ${k} が無い`);
      assert.ok(typeof EN_TRANSLATIONS[k] === "string" && EN_TRANSLATIONS[k].length > 0, `en に ${k} が無い`);
    });
    assert.ok(JA_TRANSLATIONS.dashAssetsAtAgeLabel.includes("{age}"), "ja dashAssetsAtAgeLabel に {age} が無い");
    assert.ok(EN_TRANSLATIONS.dashAssetsAtAgeLabel.includes("{age}"), "en dashAssetsAtAgeLabel に {age} が無い");
  });
});

// ============================================================================
// UX改善 A〜F：ダッシュボードの追加要素のデータ契約（すべて単一 integrated 源・表示専用）
// ============================================================================
describe("ダッシュボードUX改善（A空状態・C結論・E内訳・翻訳）", () => {
  const near = (a, b, t = 1) => Math.abs(a - b) <= t;
  const bankPool = (b) => [{ id: "bank", group: "bank", balance: b, annualReturnPct: 0, drawOrder: 1 }];

  it("A: 総資産0のとき yearly[0].totalAssets<=0（空状態の案内を出すゲート）", () => {
    const res = runIntegratedPlan({
      currentAge: 40, retireAge: 65, deathAge: 90, livingCostMonthly: 0, publicPensions: [],
      healthCostAnnual: () => 0, surplusTargetId: "bank", pools: bankPool(0),
    });
    assert.ok((res.yearly[0]?.totalAssets ?? 0) <= 0, `total=${res.yearly[0]?.totalAssets}`);
  });

  it("C: 資産寿命カード＝depletionAge（枯渇するシナリオでは年齢、しないシナリオでは null）", () => {
    // 収入なし・生活費だけ → 枯渇する。
    const deplete = runIntegratedPlan({
      currentAge: 65, retireAge: 65, deathAge: 95, livingCostMonthly: 200000, publicPensions: [],
      healthCostAnnual: () => 0, surplusTargetId: "bank", pools: bankPool(5000000),
    });
    assert.ok(deplete.depletionAge !== null && deplete.depletionAge > 65, `depletion=${deplete.depletionAge}`);
    // 年金≥生活費 → 枯渇しない。
    const sustain = runIntegratedPlan({
      currentAge: 65, retireAge: 65, deathAge: 95, livingCostMonthly: 150000,
      publicPensions: [{ monthlyAmount: 200000, startAge: 65 }], healthCostAnnual: () => 0,
      surplusTargetId: "bank", pools: bankPool(5000000),
    });
    assert.equal(sustain.depletionAge, null);
  });

  it("C: 生涯の最終純資産カード＝integrated.finalNetWorth＝末尾行の netWorth", () => {
    const res = runIntegratedPlan({
      currentAge: 65, retireAge: 65, deathAge: 80, livingCostMonthly: 150000,
      publicPensions: [{ monthlyAmount: 200000, startAge: 65 }], healthCostAnnual: () => 0,
      surplusTargetId: "bank", pools: bankPool(5000000),
    });
    assert.ok(near(res.finalNetWorth, res.yearly[res.yearly.length - 1].netWorth), `final=${res.finalNetWorth}`);
  });

  it("E: 使える資産の内訳（銀行・投資・金・株）は accessible* から取り、合計が accessibleAssets に一致", () => {
    const res = runIntegratedPlan({
      currentAge: 55, retireAge: 65, deathAge: 70, livingCostMonthly: 0, publicPensions: [],
      healthCostAnnual: () => 0, surplusTargetId: "bank",
      pools: [
        { id: "bank", group: "bank", balance: 1000000, annualReturnPct: 0, drawOrder: 1 },
        { id: "nisa", group: "investment", balance: 2000000, annualReturnPct: 0, drawOrder: 2 },
        { id: "gold", group: "gold", balance: 500000, annualReturnPct: 0, drawOrder: 90 },
        { id: "stock", group: "stock", balance: 800000, annualReturnPct: 0, drawOrder: 4 },
      ],
    });
    const r = res.yearly[0];
    // 内訳の表示に使う4値が存在し、合計が accessibleAssets に一致（0の項目は表示しない前提）。
    assert.ok(near(r.accessibleBank, 1000000) && near(r.accessibleInvestment, 2000000) && near(r.accessibleGold, 500000) && near(r.accessibleStock, 800000));
    assert.ok(near(r.accessibleBank + r.accessibleInvestment + r.accessibleGold + r.accessibleStock, r.accessibleAssets));
  });

  it("翻訳キー（UX改善）が ja・en に存在する", () => {
    const KEYS = ["dashEmptyHint", "dashTotalAssetsHint", "dashAccessibleHint", "dashSurplusHint",
      "dashAssetsAtAgeHint", "dashLifespanLabel",
      "dashLifespanHint", "dashFinalNetWorthLabel", "dashFinalNetWorthHint", "dashGroupBank",
      "dashGroupInvestment", "dashGroupGold", "dashGroupStock", "dashOpenSurplus"];
    KEYS.forEach((k) => {
      assert.ok(typeof JA_TRANSLATIONS[k] === "string" && JA_TRANSLATIONS[k].length > 0, `ja に ${k} が無い`);
      assert.ok(typeof EN_TRANSLATIONS[k] === "string" && EN_TRANSLATIONS[k].length > 0, `en に ${k} が無い`);
    });
  });
});

// ============================================================================
// 初回利用者の誤解防止（Ver.1.0）。文言そのものが仕様なので、翻訳キーで固定する。
// ============================================================================
describe("初回利用者向けの説明文言", () => {
  it("余剰金の説明に「現在は0円から始まる」ことが書かれている", () => {
    assert.ok(typeof JA_TRANSLATIONS.surplusWhyStartsAtZero === "string" && JA_TRANSLATIONS.surplusWhyStartsAtZero.length > 0, "ja に surplusWhyStartsAtZero が無い");
    assert.ok(typeof EN_TRANSLATIONS.surplusWhyStartsAtZero === "string" && EN_TRANSLATIONS.surplusWhyStartsAtZero.length > 0, "en に surplusWhyStartsAtZero が無い");
    ["0円", "銀行預金"].forEach((w) => {
      assert.ok(JA_TRANSLATIONS.surplusWhyStartsAtZero.includes(w), `ja 説明に「${w}」が無い`);
    });
    assert.ok(EN_TRANSLATIONS.surplusWhyStartsAtZero.toLowerCase().includes("zero"), "en 説明に zero が無い");
  });

  it("銀行カードのサブ文言が、余剰金を含まないこととグラフとの違いを説明している", () => {
    const ja = JA_TRANSLATIONS.statBankAtRetireSub;
    const en = EN_TRANSLATIONS.statBankAtRetireSub.toLowerCase();
    ["余剰金", "含まれていません", "総資産推移グラフ"].forEach((w) => {
      assert.ok(ja.includes(w), `ja サブ文言に「${w}」が無い`);
    });
    ["surplus", "not included", "chart"].forEach((w) => {
      assert.ok(en.includes(w), `en サブ文言に「${w}」が無い`);
    });
  });

  it("総財布の余剰金ヒントが、現在0円の理由と二重加算しないことを説明している", () => {
    const ja = JA_TRANSLATIONS.dashSurplusHint;
    const en = EN_TRANSLATIONS.dashSurplusHint.toLowerCase();
    ["0円", "二重加算"].forEach((w) => {
      assert.ok(ja.includes(w), `ja ヒントに「${w}」が無い`);
    });
    ["zero", "double-counted"].forEach((w) => {
      assert.ok(en.includes(w), `en ヒントに「${w}」が無い`);
    });
  });

  it("「累計」ではなく「残っている金額」で説明している（取り崩しで減る計算との混同を避ける）", () => {
    [JA_TRANSLATIONS.surplusWhyFormulaIntro, JA_TRANSLATIONS.surplusBalanceAtAgeExplain].forEach((txt) => {
      assert.ok(!txt.includes("累計"), `「累計」が残っている: ${txt}`);
      assert.ok(txt.includes("残っている金額"), `「残っている金額」で説明していない: ${txt}`);
    });
    [EN_TRANSLATIONS.surplusWhyFormulaIntro, EN_TRANSLATIONS.surplusBalanceAtAgeExplain].forEach((txt) => {
      assert.ok(!txt.toLowerCase().includes("running total"), `running total が残っている: ${txt}`);
    });
  });
});

// ============================================================================
// Ver.1.0：余剰金は「表示上の銀行預金の内訳」であって別財布ではない。
//   ・余剰金残高は支出できるかどうかを決めない。
//   ・余剰金残高は取り崩せる上限にならない（超過分も通常の銀行預金から引かれる）。
//   ・余剰金の範囲でだけ引く支出機能（旧 oneTimeExpenses）は廃止済みで、
//     旧い保存データが渡してきても結果は1円も変わらない。
//   ・通常の取り崩し・総資産計算は従来どおり（このテストはそれも同時に固定する）。
// ============================================================================
describe("Ver.1.0：余剰金は表示上の内訳であり、支出可否・使用上限を決めない", () => {
  const near = (a, b, t = 1) => Math.abs(a - b) <= t;
  const bankPool = (b) => [{ id: "bank", group: "bank", balance: b, annualReturnPct: 0, drawOrder: 1 }];
  const rowAt = (r, a) => r.yearly.find((y) => y.age >= Math.round(a)) || r.yearly[r.yearly.length - 1];
  const surpOf = (r, a) => rowAt(r, a).surplusBalance;
  const bankOf = (r, a) => rowAt(r, a).bankValue;
  const taOf = (r, a) => rowAt(r, a).totalAssets;
  // 年金22万/月 − 生活費20万/月 ＝ 年24万の余剰が積み上がる基準。
  const flat = (over = {}) => ({
    currentAge: 65, retireAge: 65, deathAge: 70, livingCostMonthly: 200000,
    publicPensions: [{ monthlyAmount: 220000, startAge: 65 }], healthCostAnnual: () => 0,
    surplusTargetId: "bank", pools: bankPool(1000000), ...over,
  });

  it("旧 oneTimeExpenses を渡しても結果は完全に同一（廃止済み・旧保存データ互換）", () => {
    const baseline = runIntegratedPlan(flat());
    const legacy = runIntegratedPlan(flat({
      oneTimeExpenses: [{ age: 66, amount: 100000, id: "u" }, { age: 67, amount: 700000, id: "v" }],
    }));
    assert.equal(JSON.stringify(legacy.yearly), JSON.stringify(baseline.yearly), "系列が変わってはいけない");
    assert.equal(legacy.finalSurplusBalance, baseline.finalSurplusBalance);
  });

  it("余剰金の使用に関する結果項目をエンジンが返さない（actuallySpent / 不足額 / 累計）", () => {
    const r = runIntegratedPlan(flat());
    assert.equal(r.oneTimeExpenseResults, undefined, "oneTimeExpenseResults が残っている");
    assert.equal(r.cumulativeOneTimeSpent, undefined, "cumulativeOneTimeSpent が残っている");
  });

  it("余剰金残高0でも赤字は通常の銀行預金から取り崩される（余剰金は上限にならない）", () => {
    // 収入なし・生活費20万/月＝年240万。余剰金は最初から最後まで0。
    const r = runIntegratedPlan(flat({ publicPensions: [], pools: bankPool(12000000) }));
    r.yearly.forEach((y) => assert.equal(y.surplusBalance, 0, `age ${y.age}: 余剰は0のはず`));
    // 5年で1200万を取り崩し、銀行＝総資産は0になる（余剰金0でも引けている）。
    assert.ok(near(bankOf(r, 70), 0), `銀行=${bankOf(r, 70)}`);
    assert.ok(near(taOf(r, 70), 0), `総資産=${taOf(r, 70)}`);
  });

  it("赤字が余剰金残高を超えても、超過分は通常の銀行預金から引かれる（別財布ではない）", () => {
    // 66歳から医療費48万/年。年24万の余剰を超える赤字も銀行預金から引かれる。
    const r = runIntegratedPlan(flat({ healthCostAnnual: (a) => (a >= 66 ? 480000 : 0) }));
    assert.ok(near(surpOf(r, 67), 0), `67歳 余剰=${surpOf(r, 67)}`);
    // 68歳では余剰0のうえ、初期の銀行預金100万からさらに24万が引かれている。
    assert.ok(near(bankOf(r, 68), 760000), `68歳 銀行=${bankOf(r, 68)}（余剰を超えて引けている）`);
    assert.ok(bankOf(r, 68) < 1000000, "余剰金を超えた赤字が通常の銀行預金から引かれていない");
  });

  it("不変条件：余剰金は0以上かつ銀行残高以下で、総資産へ二重加算されない", () => {
    const r = runIntegratedPlan(flat({ healthCostAnnual: (a) => (a >= 67 ? 600000 : 0) }));
    r.yearly.forEach((y) => {
      assert.ok(y.surplusBalance >= -1e-6, `age ${y.age}: 余剰が負`);
      assert.ok(y.surplusBalance <= y.bankValue + 1, `age ${y.age}: 余剰 > 銀行`);
      assert.ok(near(y.totalAssets, y.bankValue), `age ${y.age}: 総資産に余剰が二重加算されている`);
    });
  });
});
