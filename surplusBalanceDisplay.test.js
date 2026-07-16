// ============================================================================
// surplusBalanceDisplay.test.js  — 第3段階（表示のみ）の表示データテスト
//
// 【このテストが守るもの】
// App.jsx の「余剰金残高」表示は、エンジンが各スナップショット行に持つ
// surplusBalance を、次の2つの取り出し方だけで読む（新しい計算はしない）：
//   ・現在時点   = integrated.yearly[0].surplusBalance          （必ず 0＝積み上がりの起点）
//   ・選択年齢時点 = integratedRowAt(age).surplusBalance
//        integratedRowAt(age) = rows.find(y => y.age >= Math.round(age)) || 末尾行
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
