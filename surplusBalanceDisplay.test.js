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
// カード・使用可能額・未処理額・総資産グラフのすべてを同じ integrated から描くよう統一した。
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
import { nearTermPlannedExpenses, freeToSpendNow, availableToSpendAtAge, NEAR_TERM_HORIZON_YEARS } from "./utils/walletMetrics.js";
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

// ============================================================================
// 一時支出（consume）で余剰金残高が正しく減るかの回帰テスト（第4段階4dの修正）
//
// 【修正前の不具合】
//   surplusBalance は毎期の余剰 cash を足し込むだけで、consume（銀行から一度だけ
//   引く一時支出）を処理しても減っていなかった。そのため銀行残高・総資産は正しく
//   減るのに、画面の「余剰金残高」だけは減らず、実質「発生した余剰の累計額」に
//   なっていた。
//
// 【期待する挙動】
//   ・consume で実際に銀行から引けた額だけ surplusBalance も減る。
//   ・surplusBalance は 0 未満にならない。
//   ・使用額が余剰金残高を超えても、余剰金残高から引くのは残っている分まで。
//   ・同じ一時支出が二重に処理されない（e.paid フラグ）。
// ============================================================================
describe("一時支出(consume)による余剰金残高の減算（第4段階4d・回帰）", () => {
  // 65歳退職・年金 月22万・生活費 月20万 → 月2万 × 12 = 年24万の余剰。
  // 銀行は0%運用・十分な残高を持たせ、consume は必ず銀行から実際に引ける状態にする。
  const consumeBase = {
    ...base,
    currentAge: 65, retireAge: 65, deathAge: 70,
    pools: [{ id: "bank", group: "bank", balance: 10000000, annualReturnPct: 0, drawOrder: 1 }],
  };
  const rowAt = (res, age) => res.yearly.find((y) => y.age >= Math.round(age)) || res.yearly[res.yearly.length - 1];
  const nearYen = (a, b) => Math.abs(a - b) < 1; // 1円未満

  it("年間余剰24万・66歳で10万使用 → 66歳の余剰金残高は14万", () => {
    const res = runIntegratedPlan({ ...consumeBase, oneTimeExpenses: [{ age: 66, amount: 100000 }] });
    assert.ok(nearYen(rowAt(res, 66).surplusBalance, 140000), `66歳=${rowAt(res, 66).surplusBalance}（期待140,000）`);
  });

  it("67歳では余剰金残高は38万（14万＋翌年24万）", () => {
    const res = runIntegratedPlan({ ...consumeBase, oneTimeExpenses: [{ age: 66, amount: 100000 }] });
    assert.ok(nearYen(rowAt(res, 67).surplusBalance, 380000), `67歳=${rowAt(res, 67).surplusBalance}（期待380,000）`);
  });

  it("総資産も使用なしの場合より10万少ない（消費は恒久的に効く）", () => {
    const used = runIntegratedPlan({ ...consumeBase, oneTimeExpenses: [{ age: 66, amount: 100000 }] });
    const none = runIntegratedPlan({ ...consumeBase });
    const diff66 = rowAt(none, 66).totalAssets - rowAt(used, 66).totalAssets;
    const diffEnd = rowAt(none, 70).totalAssets - rowAt(used, 70).totalAssets;
    assert.ok(nearYen(diff66, 100000), `66歳の総資産差=${diff66}（期待100,000）`);
    assert.ok(nearYen(diffEnd, 100000), `最終の総資産差=${diffEnd}（期待100,000）`);
  });

  it("使用額が余剰金残高を超える場合は余剰金までに制限し、超過分は通常預金から引かない", () => {
    // 【新仕様】66歳時点の余剰は24万。50万を使用しても、実際に使えるのは余剰24万まで。
    // 超過分26万は通常の銀行預金からは引かない（＝総資産は24万しか減らない）。
    const res = runIntegratedPlan({ ...consumeBase, oneTimeExpenses: [{ age: 66, amount: 500000, id: "u" }] });
    res.yearly.forEach((r) => assert.ok(r.surplusBalance >= 0, `age ${r.age} が負 (${r.surplusBalance})`));
    assert.ok(nearYen(rowAt(res, 66).surplusBalance, 0), `66歳=${rowAt(res, 66).surplusBalance}（期待0）`);

    const r = res.oneTimeExpenseResults[0];
    assert.ok(nearYen(r.requestedAmount, 500000), `要求額=${r.requestedAmount}`);
    assert.ok(nearYen(r.actuallySpent, 240000), `実使用額=${r.actuallySpent}（期待240,000）`);
    assert.ok(nearYen(r.insufficientSurplusAmount, 260000), `未処理額=${r.insufficientSurplusAmount}（期待260,000）`);

    // 総資産は実際に使えた24万ぶんだけ減る（50万ではない）。
    const none = runIntegratedPlan({ ...consumeBase });
    const diff = rowAt(none, 66).totalAssets - rowAt(res, 66).totalAssets;
    assert.ok(nearYen(diff, 240000), `総資産差=${diff}（期待240,000＝超過分は引かれない）`);
    // 翌年は余剰が再び積み上がる（24万）。
    assert.ok(nearYen(rowAt(res, 67).surplusBalance, 240000), `67歳=${rowAt(res, 67).surplusBalance}（期待240,000）`);
  });

  it("同じ一時支出が二重処理されない（消費累計は1回分のみ）", () => {
    const res = runIntegratedPlan({ ...consumeBase, oneTimeExpenses: [{ age: 66, amount: 100000 }] });
    // 消費は一度きり。以降の年で cumulativeOneTimeSpent は増えない。
    assert.ok(nearYen(res.cumulativeOneTimeSpent, 100000), `消費累計=${res.cumulativeOneTimeSpent}（期待100,000）`);
    // 消費後の各年で余剰金残高は「毎年24万ずつ増え、10万は一度だけ減った」系列になる。
    assert.ok(nearYen(rowAt(res, 66).surplusBalance, 140000), `66歳=${rowAt(res, 66).surplusBalance}`);
    assert.ok(nearYen(rowAt(res, 67).surplusBalance, 380000), `67歳=${rowAt(res, 67).surplusBalance}`);
    assert.ok(nearYen(rowAt(res, 68).surplusBalance, 620000), `68歳=${rowAt(res, 68).surplusBalance}（二重に引かれていない）`);
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
    ["受給開始年齢", "反映していません", "銀行残高には加算されません", "概算", "参考", "受給余剰"].forEach((w) => {
      assert.ok(!jaLabel.includes(w), `ja ラベルに旧文言「${w}」が残っている`);
      assert.ok(!jaSub.includes(w), `ja 説明に旧文言「${w}」が残っている`);
    });
    // en：旧説明（private pension だけ／public pension・iDeCo を含めない／銀行残高に反映しない）が消えていること。
    const enLabel = EN_TRANSLATIONS.surplusBalanceCurrentLabel.toLowerCase();
    const enSub = EN_TRANSLATIONS.surplusBalanceCurrentSub.toLowerCase();
    ["estimate", "reference", "re-simulate", "does not reflect", "private pension's start age", "not added on top", "past history"].forEach((w) => {
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
  it("余剰金不足の案内文キーが ja / en に存在し、補間トークンを含む", () => {
    ["surplusInsufficientNote", "surplusInsufficientShort"].forEach((k) => {
      assert.ok(typeof JA_TRANSLATIONS[k] === "string" && JA_TRANSLATIONS[k].length > 0, `ja に ${k} が無い`);
      assert.ok(typeof EN_TRANSLATIONS[k] === "string" && EN_TRANSLATIONS[k].length > 0, `en に ${k} が無い`);
    });
    ["{requested}", "{spent}", "{shortfall}"].forEach((tok) => {
      assert.ok(JA_TRANSLATIONS.surplusInsufficientNote.includes(tok), `ja Note に ${tok} が無い`);
      assert.ok(EN_TRANSLATIONS.surplusInsufficientNote.includes(tok), `en Note に ${tok} が無い`);
    });
    assert.ok(JA_TRANSLATIONS.surplusInsufficientShort.includes("{shortfall}"), "ja Short に {shortfall} が無い");
    assert.ok(EN_TRANSLATIONS.surplusInsufficientShort.includes("{shortfall}"), "en Short に {shortfall} が無い");
  });
});

// ============================================================================
// 余剰金残高＝銀行内の実残高（通常支出・一時支出の銀行取り崩しを一元追跡）
//   ブロック1 A〜J：生活費/医療費/保険料/ローン返済など通常の銀行取り崩しでも
//                    surplusBalance が正しく減ること、および端の防御ケース。
//   ブロック2 2A〜2F：「余剰金を使う」は surplusBalance までに制限し、超過分を
//                    通常預金から引かないこと。
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
  it("G: 現在年齢より過去の一時支出は無視される（二重控除しない）", () => {
    const g = runIntegratedPlan({ ...B, pools: bankPool(1000000), oneTimeExpenses: [{ age: 60, amount: 500000 }] });
    const baseline = runIntegratedPlan({ ...B, pools: bankPool(1000000) });
    assert.ok(near(taOf(g, 70), taOf(baseline, 70)), `総資産不変: g=${taOf(g, 70)} base=${taOf(baseline, 70)}`);
    assert.equal((g.oneTimeExpenseResults || []).length, 0);
  });
  it("H: 同一年齢の複数支出（10万＋5万）が両方処理され余剰9万", () => {
    const r = runIntegratedPlan({ ...B, pools: bankPool(1000000),
      oneTimeExpenses: [{ age: 66, amount: 100000, id: "x1" }, { age: 66, amount: 50000, id: "x2" }] });
    assert.ok(near(surpOf(r, 66), 90000), `66歳=${surpOf(r, 66)}`);
    assert.ok(near(r.cumulativeOneTimeSpent, 150000), `累計=${r.cumulativeOneTimeSpent}`);
    assert.equal(r.oneTimeExpenseResults.length, 2);
  });
  it("I: 複数銀行プールでも余剰は drawOrder 順（bankAが先）に引かれる", () => {
    const twoBanks = [
      { id: "bankA", group: "bank", balance: 500000, annualReturnPct: 0, drawOrder: 1 },
      { id: "bankB", group: "bank", balance: 500000, annualReturnPct: 0, drawOrder: 2 },
    ];
    const r = runIntegratedPlan({ ...B, surplusTargetId: "bankA", pools: twoBanks, oneTimeExpenses: [{ age: 66, amount: 100000 }] });
    assert.ok(near(surpOf(r, 66), 140000), `66歳 余剰=${surpOf(r, 66)}`);
    assert.ok(near(rowAt(r, 66).pool_bankA, 640000), `bankA=${rowAt(r, 66).pool_bankA}`);
  });
  it("J: 赤字はまず余剰金から消費される（surplus-first・通常預金は温存）", () => {
    const r = runIntegratedPlan({ ...B, pools: bankPool(1000000), healthCostAnnual: (a) => (a >= 66 ? 480000 : 0) });
    assert.ok(near(surpOf(r, 67), 0), `67歳 余剰=${surpOf(r, 67)}`);
    assert.ok(near(bankOf(r, 67), 1000000), `通常預金100万は残る: 銀行=${bankOf(r, 67)}`);
  });

  // ---- ブロック2：余剰金使用は余剰金残高までに制限 ----
  it("2A: 余剰24万・使用50万 → 実使用24万/余剰0/銀行24万減/未処理26万", () => {
    const r = runIntegratedPlan({ ...B, pools: bankPool(1000000), oneTimeExpenses: [{ age: 66, amount: 500000, id: "u" }] });
    const baseline = runIntegratedPlan({ ...B, pools: bankPool(1000000) });
    const x = r.oneTimeExpenseResults[0];
    assert.ok(near(x.actuallySpent, 240000), `実使用=${x.actuallySpent}`);
    assert.ok(near(surpOf(r, 66), 0), `余剰=${surpOf(r, 66)}`);
    assert.ok(near(bankOf(baseline, 66) - bankOf(r, 66), 240000), `銀行差=${bankOf(baseline, 66) - bankOf(r, 66)}`);
    assert.ok(near(x.insufficientSurplusAmount, 260000), `未処理=${x.insufficientSurplusAmount}`);
  });
  it("2B: 余剰24万・使用10万 → 10万減・余剰14万・未処理0", () => {
    const r = runIntegratedPlan({ ...B, pools: bankPool(1000000), oneTimeExpenses: [{ age: 66, amount: 100000 }] });
    const x = r.oneTimeExpenseResults[0];
    assert.ok(near(x.actuallySpent, 100000) && near(surpOf(r, 66), 140000), `実使用=${x.actuallySpent} 余剰=${surpOf(r, 66)}`);
    assert.ok(near(x.insufficientSurplusAmount, 0), `未処理=${x.insufficientSurplusAmount}`);
  });
  it("2C: 余剰0・使用10万 → 銀行は減らない・未処理10万", () => {
    const noSurplus = { ...B, publicPensions: [{ monthlyAmount: 200000, startAge: 65 }] }; // 年金=生活費で余剰0
    const r = runIntegratedPlan({ ...noSurplus, pools: bankPool(1000000), oneTimeExpenses: [{ age: 66, amount: 100000, id: "c" }] });
    const baseline = runIntegratedPlan({ ...noSurplus, pools: bankPool(1000000) });
    const x = r.oneTimeExpenseResults[0];
    assert.ok(near(x.actuallySpent, 0), `実使用=${x.actuallySpent}`);
    assert.ok(near(bankOf(r, 66), bankOf(baseline, 66)), `銀行不変: r=${bankOf(r, 66)} base=${bankOf(baseline, 66)}`);
    assert.ok(near(x.insufficientSurplusAmount, 100000), `未処理=${x.insufficientSurplusAmount}`);
  });
  it("2D: 銀行残高＝余剰残高（初期0・余剰24万）でも使用は実残高24万まで", () => {
    const r = runIntegratedPlan({ ...B, pools: bankPool(0), oneTimeExpenses: [{ age: 66, amount: 500000, id: "d" }] });
    const x = r.oneTimeExpenseResults[0];
    assert.ok(near(x.actuallySpent, 240000) && near(bankOf(r, 66), 0), `実使用=${x.actuallySpent} 銀行=${bankOf(r, 66)}`);
    // 不変条件：余剰金残高 ≤ 銀行残高 が全行で成立。
    assert.ok(r.yearly.every((y) => y.surplusBalance <= y.bankValue + 1), "不変条件 surplus<=bank 破れ");
  });
  it("2E: 超過入力後も総資産は超過分まで減らない（24万のみ）", () => {
    const r = runIntegratedPlan({ ...B, pools: bankPool(1000000), oneTimeExpenses: [{ age: 66, amount: 500000 }] });
    const baseline = runIntegratedPlan({ ...B, pools: bankPool(1000000) });
    assert.ok(near(taOf(baseline, 66) - taOf(r, 66), 240000), `総資産差=${taOf(baseline, 66) - taOf(r, 66)}`);
  });
  it("2F: 同じ支出を二重処理しない（消費累計は1回分・翌々年も系列が正しい）", () => {
    const r = runIntegratedPlan({ ...B, pools: bankPool(1000000), oneTimeExpenses: [{ age: 66, amount: 100000 }] });
    assert.ok(near(r.cumulativeOneTimeSpent, 100000), `累計=${r.cumulativeOneTimeSpent}`);
    assert.ok(near(surpOf(r, 68), 620000), `68歳 余剰=${surpOf(r, 68)}（二重に引かれない）`);
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

  it("D: 余剰金を使用した後 → カードと integrated が一致（使用が反映される）", () => {
    const res = runIntegratedPlan({
      ...B, publicPensions: [{ monthlyAmount: 220000, startAge: 65 }], pools: [bankPool(1000000)],
      oneTimeExpenses: [{ age: 66, amount: 100000, id: "u" }],
    });
    assert.ok(near(surplusAtAge(res, 66), 140000), `66歳カード=${surplusAtAge(res, 66)}`);
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
// 初期余剰金（initialSurplusBalance）A〜G
//   利用者が「現在までに貯まっている余剰金」を入力できる。これは既存の銀行残高の
//   内数（ラベル）なので、総資産には加算しない。エンジンの surplusBalance は
//   0 ではなく initialSurplusBalance（銀行残高合計で頭打ち）から開始する。
//   カード現在値は integrated.yearly[0].surplusBalance（＝初期値）を読む。
// ============================================================================
describe("初期余剰金 initialSurplusBalance（A〜G）", () => {
  const near = (a, b, t = 1) => Math.abs(a - b) <= t;
  const bankPool = (b) => [{ id: "bank", group: "bank", balance: b, annualReturnPct: 0, drawOrder: 1 }];
  const rowAt = (r, a) => r.yearly.find((y) => y.age >= Math.round(a)) || r.yearly[r.yearly.length - 1];
  const bankOf = (r, a) => rowAt(r, a).bankValue;
  const taOf = (r, a) => rowAt(r, a).totalAssets;
  // 年金=生活費で余剰も赤字も出ない基準。初期余剰の挙動だけを見る。
  const flat = (over = {}) => ({
    currentAge: 65, retireAge: 65, deathAge: 70, livingCostMonthly: 200000,
    publicPensions: [{ monthlyAmount: 200000, startAge: 65 }], healthCostAnnual: () => 0,
    surplusTargetId: "bank", pools: bankPool(1000000), ...over,
  });

  it("A: 初期余剰50万 → 現在時点カード（yearly[0].surplusBalance）が50万", () => {
    const r = runIntegratedPlan(flat({ initialSurplusBalance: 500000 }));
    assert.ok(near(surplusAtCurrent(r), 500000), `現在=${surplusAtCurrent(r)}`);
    assert.ok(near(surplusAtAge(r, 68), 500000), `赤字なしなら維持: 68歳=${surplusAtAge(r, 68)}`);
  });

  it("B: 初期50万・30万使用 → 余剰20万・銀行残高も30万だけ減る", () => {
    const r = runIntegratedPlan(flat({ initialSurplusBalance: 500000, oneTimeExpenses: [{ age: 66, amount: 300000, id: "u" }] }));
    const base0 = runIntegratedPlan(flat({ initialSurplusBalance: 500000 }));
    assert.ok(near(surplusAtAge(r, 66), 200000), `余剰=${surplusAtAge(r, 66)}`);
    assert.ok(near(bankOf(base0, 66) - bankOf(r, 66), 300000), `銀行差=${bankOf(base0, 66) - bankOf(r, 66)}`);
  });

  it("C: 初期50万・70万使用 → 実使用50万・余剰0・未処理20万・通常預金に波及しない", () => {
    const r = runIntegratedPlan(flat({ initialSurplusBalance: 500000, oneTimeExpenses: [{ age: 66, amount: 700000, id: "u" }] }));
    const base0 = runIntegratedPlan(flat({ initialSurplusBalance: 500000 }));
    const x = r.oneTimeExpenseResults[0];
    assert.ok(near(x.actuallySpent, 500000), `実使用=${x.actuallySpent}`);
    assert.ok(near(surplusAtAge(r, 66), 0), `余剰=${surplusAtAge(r, 66)}`);
    assert.ok(near(x.insufficientSurplusAmount, 200000), `未処理=${x.insufficientSurplusAmount}`);
    assert.ok(near(bankOf(base0, 66) - bankOf(r, 66), 500000), `銀行は50万だけ減る=${bankOf(base0, 66) - bankOf(r, 66)}`);
  });

  it("D: 初期50万・翌年余剰24万 → 66歳で74万", () => {
    // 年金22万 > 生活費20万 → +24万/年。
    const r = runIntegratedPlan(flat({ initialSurplusBalance: 500000, publicPensions: [{ monthlyAmount: 220000, startAge: 65 }] }));
    assert.ok(near(surplusAtAge(r, 66), 740000), `66歳=${surplusAtAge(r, 66)}`);
  });

  it("E: 初期50万・生活赤字20万/年 → 66歳で30万", () => {
    // 年金20万＝生活費20万に、全年齢一律の医療費20万/年で 20万/年の赤字を作る。
    const r = runIntegratedPlan(flat({ initialSurplusBalance: 500000, healthCostAnnual: () => 200000 }));
    assert.ok(near(surplusAtAge(r, 66), 300000), `66歳=${surplusAtAge(r, 66)}`);
  });

  it("F: 初期余剰が銀行残高を超える場合は銀行残高までに制限する", () => {
    const r = runIntegratedPlan(flat({ initialSurplusBalance: 5000000, pools: bankPool(1000000) }));
    assert.ok(near(surplusAtCurrent(r), 1000000), `頭打ち後=${surplusAtCurrent(r)}`);
    assert.ok(r.yearly.every((y) => y.surplusBalance <= y.bankValue + 1), "不変条件 surplus<=bank");
  });

  it("G: 総資産は初期余剰入力の有無で増えない（銀行預金の内数）", () => {
    const withInit = runIntegratedPlan(flat({ initialSurplusBalance: 500000 }));
    const without = runIntegratedPlan(flat({ initialSurplusBalance: 0 }));
    withInit.yearly.forEach((y, i) => {
      assert.ok(near(taOf(withInit, y.age), taOf(without, without.yearly[i].age)), `age ${y.age}: 総資産が変化`);
    });
  });

  it("翻訳キー initialSurplusLabel / initialSurplusExplain が ja・en に存在する", () => {
    ["initialSurplusLabel", "initialSurplusExplain"].forEach((k) => {
      assert.ok(typeof JA_TRANSLATIONS[k] === "string" && JA_TRANSLATIONS[k].length > 0, `ja に ${k} が無い`);
      assert.ok(typeof EN_TRANSLATIONS[k] === "string" && EN_TRANSLATIONS[k].length > 0, `en に ${k} が無い`);
    });
    ["急な出費", "銀行預金", "区別"].forEach((w) => {
      assert.ok(JA_TRANSLATIONS.initialSurplusExplain.includes(w), `ja 説明に「${w}」が無い`);
    });
  });
});

// ============================================================================
// 画面データ契約：現在自由に使える金額（フェーズ2）
//   App のカードは、現在使える資産 = integrated.yearly[0].accessibleAssets（フェーズ1）を
//   単一計算源として使い、生活防衛資金（inputs.emergencyFund）と今後N年の予定支出を
//   純粋関数 freeToSpendNow / nearTermPlannedExpenses で差し引く。エンジンには渡さない。
// ============================================================================
describe("現在自由に使える金額（accessibleAssets × emergencyFund × 予定支出）", () => {
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

  it("自由に使える金額 = accessibleAssets − emergencyFund − 3年内予定支出（0未満にしない）", () => {
    const res = runIntegratedPlan(flat());
    const surplusLedger = [
      { id: "a", kind: "consume", age: 66, amount: 200000 }, // 1年後 → 含む
      { id: "b", kind: "consume", age: 72, amount: 500000 }, // 7年後 → 除外
    ];
    const near3 = nearTermPlannedExpenses(surplusLedger, 65, NEAR_TERM_HORIZON_YEARS);
    assert.ok(near(near3, 200000), `予定支出=${near3}`);
    const free = freeToSpendNow({
      accessibleAssets: res.yearly[0].accessibleAssets, // = 300万
      emergencyFund: 1000000,
      nearTermPlanned: near3,
    });
    // 300万 − 100万 − 20万 = 180万
    assert.ok(near(free, 1800000), `自由に使える=${free}`);
  });

  it("翻訳キー emergencyFund / freeToSpend が ja・en に存在し、freeToSpend は {years} を含む", () => {
    ["emergencyFundLabel", "emergencyFundExplain", "freeToSpendLabel", "freeToSpendExplain"].forEach((k) => {
      assert.ok(typeof JA_TRANSLATIONS[k] === "string" && JA_TRANSLATIONS[k].length > 0, `ja に ${k} が無い`);
      assert.ok(typeof EN_TRANSLATIONS[k] === "string" && EN_TRANSLATIONS[k].length > 0, `en に ${k} が無い`);
    });
    assert.ok(JA_TRANSLATIONS.freeToSpendExplain.includes("{years}"), "ja freeToSpend に {years} が無い");
    assert.ok(EN_TRANSLATIONS.freeToSpendExplain.includes("{years}"), "en freeToSpend に {years} が無い");
  });
});

// ============================================================================
// 画面データ契約：年齢別使用可能額（フェーズ3）＋ 表示専用ガードレール
//   availableAtAge(age) = max(0, integratedRowAt(age).spendableAssets − 最低残したい資産)
//   最低残したい資産は既存 inheritanceTarget を流用。単一 integrated から導出・0円フロア。
// ============================================================================
describe("年齢別使用可能額（accessibleAssets × 最低残したい資産）", () => {
  const near = (a, b, t = 1) => Math.abs(a - b) <= t;
  const integratedRowAt2 = (res, age) => res.yearly.find((y) => y.age >= Math.round(age)) || res.yearly[res.yearly.length - 1];
  const cfg = (over = {}) => ({
    currentAge: 60, retireAge: 65, deathAge: 95, livingCostMonthly: 150000,
    publicPensions: [{ monthlyAmount: 200000, startAge: 65 }], healthCostAnnual: () => 0,
    surplusTargetId: "bank",
    pools: [
      { id: "bank", group: "bank", balance: 5000000, annualReturnPct: 0, drawOrder: 2 },
      { id: "nisa", group: "investment", balance: 10000000, annualReturnPct: 0, drawOrder: 1 },
    ],
    ...over,
  });

  it("= max(0, spendableAssets(age) − inheritanceTarget)（単一 integrated 源）", () => {
    const res = runIntegratedPlan(cfg());
    const row = integratedRowAt2(res, 65);
    const floor = 3000000;
    const avail = availableToSpendAtAge({ spendableAssets: row.accessibleAssets, minimumResidual: floor });
    assert.ok(near(avail, Math.max(0, row.accessibleAssets - floor)), `avail=${avail} accessible=${row.accessibleAssets}`);
    assert.ok(avail >= 0, "0円未満にならない");
  });

  it("最低残したい資産が大きくても 0円未満にならない（ガードレール）", () => {
    const res = runIntegratedPlan(cfg());
    [65, 75, 95].forEach((age) => {
      const row = integratedRowAt2(res, age);
      const avail = availableToSpendAtAge({ spendableAssets: row.accessibleAssets, minimumResidual: 999999999 });
      assert.equal(avail, 0, `age ${age}: マイナスになっている`);
    });
  });

  it("最低残したい資産0なら accessibleAssets と一致（全年齢）", () => {
    const res = runIntegratedPlan(cfg());
    res.yearly.forEach((r) => {
      assert.ok(near(availableToSpendAtAge({ spendableAssets: r.accessibleAssets, minimumResidual: 0 }), r.accessibleAssets),
        `age ${r.age} で不一致`);
    });
  });

  it("翻訳キー availableAtAge が ja・en に存在し {age} を含む", () => {
    ["availableAtAgeLabel", "availableAtAgeExplain"].forEach((k) => {
      assert.ok(typeof JA_TRANSLATIONS[k] === "string" && JA_TRANSLATIONS[k].length > 0, `ja に ${k} が無い`);
      assert.ok(typeof EN_TRANSLATIONS[k] === "string" && EN_TRANSLATIONS[k].length > 0, `en に ${k} が無い`);
    });
    assert.ok(JA_TRANSLATIONS.availableAtAgeLabel.includes("{age}"), "ja availableAtAgeLabel に {age} が無い");
    assert.ok(EN_TRANSLATIONS.availableAtAgeLabel.includes("{age}"), "en availableAtAgeLabel に {age} が無い");
  });
});

// 表示専用ガードレール：freeToSpend / availableAtAge はどの入力でも負にならない。
describe("表示専用ガードレール（0円フロア・エンジン非依存）", () => {
  it("freeToSpendNow は生活防衛資金・予定支出が過大でも0円未満にならない", () => {
    expect(freeToSpendNow({ accessibleAssets: 1000000, emergencyFund: 9e9, nearTermPlanned: 9e9 })).toBe(0);
  });
  it("availableToSpendAtAge は最低残したい資産が過大でも0円未満にならない", () => {
    expect(availableToSpendAtAge({ spendableAssets: 1000000, minimumResidual: 9e9 })).toBe(0);
  });
});

// ============================================================================
// 修正1：年齢別使用可能額は accessibleAssets（accessAge到達済み）を使う
//   → 引出制限中の口座（401k 59.5歳 / SIPP 57歳 等）を「その年齢で使える金額」に含めない。
// ============================================================================
describe("修正1：availableAtAge は accessAge を尊重（引出制限口座を含めない）", () => {
  const near = (a, b, t = 1) => Math.abs(a - b) <= t;
  const rowAt = (res, age) => res.yearly.find((y) => y.age === age) || res.yearly[res.yearly.length - 1];
  const avail = (res, age, floor = 0) =>
    availableToSpendAtAge({ spendableAssets: rowAt(res, age).accessibleAssets, minimumResidual: floor });

  it("401k（accessAge 59.5）は55・59歳で含めず、60歳で含める", () => {
    const res = runIntegratedPlan({
      currentAge: 55, retireAge: 65, deathAge: 70, livingCostMonthly: 0, publicPensions: [],
      healthCostAnnual: () => 0, surplusTargetId: "bank",
      pools: [
        { id: "bank", group: "bank", balance: 1000000, annualReturnPct: 0, drawOrder: 1 },
        { id: "k401", group: "investment", balance: 3000000, annualReturnPct: 0, drawOrder: 3, accessAge: 59.5 },
      ],
    });
    assert.ok(near(avail(res, 55), 1000000), `55歳=${avail(res, 55)}`);
    assert.ok(near(avail(res, 59), 1000000), `59歳=${avail(res, 59)}`);
    assert.ok(near(avail(res, 60), 4000000), `60歳=${avail(res, 60)}`);
  });

  it("SIPP（accessAge 57）でも同様：56歳で含めず57歳で含める", () => {
    const res = runIntegratedPlan({
      currentAge: 55, retireAge: 65, deathAge: 70, livingCostMonthly: 0, publicPensions: [],
      healthCostAnnual: () => 0, surplusTargetId: "bank",
      pools: [
        { id: "bank", group: "bank", balance: 2000000, annualReturnPct: 0, drawOrder: 1 },
        { id: "sipp", group: "investment", balance: 5000000, annualReturnPct: 0, drawOrder: 3, accessAge: 57 },
      ],
    });
    assert.ok(near(avail(res, 56), 2000000), `56歳=${avail(res, 56)}`);
    assert.ok(near(avail(res, 57), 7000000), `57歳=${avail(res, 57)}`);
  });

  it("5か国：全年齢で availableAtAge ≤ accessibleAssets（過大表示しない）", () => {
    const base5 = {
      currentAge: 55, retireAge: 65, deathAge: 95, livingCostMonthly: 200000,
      publicPensions: [{ monthlyAmount: 220000, startAge: 65 }], healthCostAnnual: () => 0, surplusTargetId: "bank",
    };
    Object.entries(COUNTRY_SHAPES).forEach(([country, pools]) => {
      const res = runIntegratedPlan({ ...base5, pools });
      res.yearly.forEach((r) => {
        const a = availableToSpendAtAge({ spendableAssets: r.accessibleAssets, minimumResidual: 5000000 });
        assert.ok(a <= r.accessibleAssets + 1, `${country} age ${r.age}: available > accessible`);
        assert.ok(a >= 0, `${country} age ${r.age}: 負`);
      });
    });
  });
});

// ============================================================================
// 修正2：小数現在年齢での「現在の支出」正規化（end-to-end）
//   現在58.66歳（画面は58歳）で 58歳の支出を入力 → 現在時点の支出として処理される。
//   57歳（過去）は無視。余剰金・銀行残高・予定支出に正しく反映し、二重処理しない。
// ============================================================================
describe("修正2：小数現在年齢での現在支出の正規化（end-to-end）", () => {
  const near = (a, b, t = 1) => Math.abs(a - b) <= t;
  const rowAt = (res, age) => res.yearly.find((y) => y.age >= Math.round(age)) || res.yearly[res.yearly.length - 1];
  // 現在58.66歳・初期余剰50万・銀行100万。到達直後の支出を検証するため短期間。
  const cfg = (oneTime) => ({
    currentAge: 58.66, retireAge: 65, deathAge: 62, livingCostMonthly: 0, publicPensions: [],
    healthCostAnnual: () => 0, surplusTargetId: "bank", initialSurplusBalance: 500000,
    pools: [{ id: "bank", group: "bank", balance: 1000000, annualReturnPct: 0, drawOrder: 1 }],
    oneTimeExpenses: oneTime,
  });

  it("58歳（現在）の支出30万が処理され、余剰金・銀行残高が30万減る", () => {
    // buildPlanInput 相当：58 は現在(58.66)に正規化して渡す。
    const res = runIntegratedPlan(cfg([{ id: "u", age: 58.66, amount: 300000 }]));
    const base = runIntegratedPlan(cfg([]));
    assert.ok(near(res.cumulativeOneTimeSpent, 300000), `実使用=${res.cumulativeOneTimeSpent}`);
    assert.ok(near(rowAt(base, 59).bankValue - rowAt(res, 59).bankValue, 300000), "銀行30万減");
    assert.ok(near(rowAt(base, 59).surplusBalance - rowAt(res, 59).surplusBalance, 300000), "余剰30万減");
  });

  it("57歳（過去）の支出は無視される（実使用0・結果0件）", () => {
    // buildPlanInput は 57 を 57 のまま渡し、エンジンが過去として除外する。
    const res = runIntegratedPlan(cfg([{ id: "p", age: 57, amount: 300000 }]));
    assert.equal(res.cumulativeOneTimeSpent, 0);
    assert.equal(res.oneTimeExpenseResults.length, 0);
  });

  it("同じ現在支出を二重処理しない（結果は1件・累計は1回分）", () => {
    const res = runIntegratedPlan(cfg([{ id: "u", age: 58.66, amount: 300000 }]));
    assert.equal(res.oneTimeExpenseResults.length, 1);
    assert.ok(near(res.cumulativeOneTimeSpent, 300000), `累計=${res.cumulativeOneTimeSpent}`);
  });

  it("予定支出（nearTerm）も58歳を現在支出として含む", () => {
    const near3 = nearTermPlannedExpenses(
      [{ id: "a", kind: "consume", age: 58, amount: 100000 }, { id: "b", kind: "consume", age: 57, amount: 200000 }],
      58.66, NEAR_TERM_HORIZON_YEARS
    );
    assert.ok(near(near3, 100000), `予定支出=${near3}`);
  });
});
