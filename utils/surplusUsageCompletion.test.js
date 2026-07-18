// ============================================================================
// utils/surplusUsageCompletion.test.js
//
// 余剰金機能の「完成条件」を固定する回帰テスト。
//
//   条件1：余剰金を使ったとき、残高から一度だけ差し引かれること
//   条件2：残高不足のときに「実際に使えた金額」と「不足額」を表示できること
//   条件3：使用履歴を削除したら、余剰金残高が自動で再計算されること
//   条件4：既存テストを壊さないこと（本ファイルは既存の値を書き換えず、追加だけ行う）
//
// 【前提（設計方針・変更なし）】
//   ・余剰金は銀行預金の内訳であり、別資産ではない（総資産に二重計上しない）。
//   ・シミュレーション開始後に発生した余剰金（＋初期入力分）だけを管理する。
//   ・一度使った余剰金は二重に使えない。
//   ・「NISAへ回す」「銀行へ戻す」は資金移動の記録ラベルで、総資産を増減させない。
// ============================================================================

import { describe, it, expect } from "vitest";
import { runIntegratedPlan } from "../lifePlanEngine.js";
import { getCountryRules } from "../countryRules/index.js";
import { DRAWDOWN_CATEGORIES } from "./simulations.js";
import { buildPlanInput } from "./buildPlanInput.js";
import { nearTermPlannedExpenses, NEAR_TERM_HORIZON_YEARS } from "./walletMetrics.js";
import {
  canonicalSurplusCategory,
  resolveSurplusKind,
  surplusKindForCategory,
  normalizeSurplusEntry,
  normalizeSurplusLedger,
  removeSurplusEntry,
  summarizeSurplusUsage,
  surplusSpentThroughAge,
  surplusBalanceNow,
  totalSurplusUsage,
  SURPLUS_USE_STATUS,
} from "./surplusLedger.js";
import { JA_TRANSLATIONS } from "../translations/ja.js";
import { EN_TRANSLATIONS } from "../translations/en.js";

// ----------------------------------------------------------------------------
// 検証用の最小プラン。
// 65歳から公的年金 月2万円（＝年24万円）だけが入り、生活費・医療費は0。
// つまり「毎年ちょうど24万円の余剰金が銀行に積み上がる」だけの、手計算できる形。
//   余剰金：65歳 0 → 66歳 24万 → 67歳 48万 → …
//   銀行  ：65歳 100万 → 66歳 124万 → …（余剰金は銀行の内数）
// ----------------------------------------------------------------------------
const plan = (over = {}) => ({
  currentAge: 65,
  retireAge: 65,
  deathAge: 70,
  livingCostMonthly: 0,
  healthCostAnnual: () => 0,
  surplusTargetId: "bank",
  pools: [{ id: "bank", group: "bank", balance: 1000000, annualReturnPct: 0, drawOrder: 1 }],
  publicPensions: [{ monthlyAmount: 20000, startAge: 65 }],
  ...over,
});

// 台帳から、buildPlanInput と同じ規則でエンジンへ渡す一時支出を作る。
// （consume だけを渡す。transfer は総資産不変のラベル移動なので渡さない。）
const toOneTimeExpenses = (ledger) =>
  normalizeSurplusLedger(ledger)
    .filter((e) => e.kind === "consume" && e.amount > 0 && Number.isFinite(e.age))
    .map((e) => ({ id: e.id, age: e.age, amount: e.amount }));

const runLedger = (ledger, over = {}) =>
  runIntegratedPlan(plan({ oneTimeExpenses: toOneTimeExpenses(ledger), ...over }));

const rowAt = (res, age) => res.yearly.find((y) => y.age === age);
const near = (a, b) => Math.abs(a - b) < 1;

// ============================================================================
// 条件1：余剰金を使ったとき、残高から一度だけ差し引かれること
// ============================================================================
describe("完成条件1：余剰金の使用は一度だけ差し引かれる", () => {
  const ledger = [{ id: "a", age: 66, kind: "consume", category: "travel", amount: 100000 }];

  it("66歳に10万使用 → 余剰金も銀行も10万だけ減る（両方から二重に引かれない）", () => {
    const base = runLedger([]);
    const used = runLedger(ledger);
    expect(near(rowAt(base, 66).surplusBalance, 240000)).toBe(true);
    expect(near(rowAt(used, 66).surplusBalance, 140000)).toBe(true);
    // 銀行残高の減り分も、ちょうど使用額と同じ1回分だけ。
    expect(near(rowAt(base, 66).bankValue - rowAt(used, 66).bankValue, 100000)).toBe(true);
    expect(near(rowAt(base, 66).totalAssets - rowAt(used, 66).totalAssets, 100000)).toBe(true);
  });

  it("翌年以降も差は10万のまま（毎ステップ引き直されない）", () => {
    const base = runLedger([]);
    const used = runLedger(ledger);
    [67, 68, 69, 70].forEach((age) => {
      expect(near(rowAt(base, age).surplusBalance - rowAt(used, age).surplusBalance, 100000)).toBe(true);
    });
    expect(near(used.cumulativeOneTimeSpent, 100000)).toBe(true);
  });

  it("結果は1件だけ返る（同じ使用が二重に記録されない）", () => {
    const used = runLedger(ledger);
    expect(used.oneTimeExpenseResults).toHaveLength(1);
    expect(used.oneTimeExpenseResults[0].actuallySpent).toBe(100000);
  });

  it("同じ台帳で何度シミュレーションしても結果が変わらない（再実行で二重に引かれない）", () => {
    const first = runLedger(ledger);
    const second = runLedger(ledger);
    const third = runLedger(ledger);
    const series = (r) => JSON.stringify(r.yearly.map((y) => [y.surplusBalance, y.totalAssets]));
    expect(series(second)).toBe(series(first));
    expect(series(third)).toBe(series(first));
    expect(second.cumulativeOneTimeSpent).toBe(first.cumulativeOneTimeSpent);
  });

  it("付け替え（NISAへ回す・銀行へ戻す）は総資産も余剰金も1円も動かさない", () => {
    const base = runLedger([]);
    const moved = runLedger([
      { id: "n", age: 66, category: "toNisa", amount: 200000 },
      { id: "b", age: 67, category: "toBank", amount: 300000 },
    ]);
    expect(JSON.stringify(moved.yearly.map((y) => [y.surplusBalance, y.totalAssets])))
      .toBe(JSON.stringify(base.yearly.map((y) => [y.surplusBalance, y.totalAssets])));
    expect(moved.cumulativeOneTimeSpent).toBe(0);
  });
});

// ============================================================================
// 条件2：残高不足のときに「実際に使えた金額」と「不足額」を表示できること
// ============================================================================
describe("完成条件2：不足時は実際に使えた金額と不足額を返す", () => {
  it("余剰24万に対して50万を使用 → 実使用24万・不足26万（通常預金には波及しない）", () => {
    const ledger = [{ id: "a", age: 66, category: "car", amount: 500000 }];
    const res = runLedger(ledger);
    const r = res.oneTimeExpenseResults[0];
    expect(r.requestedAmount).toBe(500000);
    expect(near(r.actuallySpent, 240000)).toBe(true);
    expect(near(r.insufficientSurplusAmount, 260000)).toBe(true);
    // 余剰金は0になるが、余剰金以外の銀行預金（初期100万）は減らない。
    expect(near(rowAt(res, 66).surplusBalance, 0)).toBe(true);
    expect(near(rowAt(res, 66).bankValue, 1000000)).toBe(true);
  });

  it("summarizeSurplusUsage が行ごとに 状態・実使用額・不足額 を返す", () => {
    const ledger = [
      { id: "full", age: 66, category: "travel", amount: 100000 },   // 全額使える
      { id: "part", age: 67, category: "car", amount: 1000000 },     // 一部だけ使える
      { id: "move", age: 68, category: "toNisa", amount: 300000 },   // 付け替え
    ];
    const res = runLedger(ledger);
    const summary = summarizeSurplusUsage(ledger, res.oneTimeExpenseResults);
    const byId = Object.fromEntries(summary.map((s) => [s.id, s]));

    expect(byId.full.status).toBe(SURPLUS_USE_STATUS.FULL);
    expect(byId.full.actuallySpent).toBe(100000);
    expect(byId.full.insufficientSurplusAmount).toBe(0);

    expect(byId.part.status).toBe(SURPLUS_USE_STATUS.PARTIAL);
    expect(byId.part.actuallySpent).toBeGreaterThan(0);
    expect(byId.part.actuallySpent).toBeLessThan(1000000);
    // 実使用額 ＋ 不足額 ＝ 要求額（表示が辻褄の合う組になっている）
    expect(near(byId.part.actuallySpent + byId.part.insufficientSurplusAmount, 1000000)).toBe(true);

    // 付け替えは消費ではないので不足額という概念が無い。
    expect(byId.move.status).toBe(SURPLUS_USE_STATUS.TRANSFER);
    expect(byId.move.actuallySpent).toBe(0);
    expect(byId.move.insufficientSurplusAmount).toBe(0);
  });

  it("余剰金が0円のときは 実使用0・不足＝要求額 で status は none（通常預金は減らない）", () => {
    // 収入が無ければ余剰金は1円も積み上がらない（銀行に100万あっても使えない）。
    // ＝余剰金は銀行預金の内訳であって、預金そのものではない。
    const ledger = [{ id: "a", age: 66, category: "medical", amount: 100000 }];
    const res = runLedger(ledger, { publicPensions: [] });
    const s = summarizeSurplusUsage(ledger, res.oneTimeExpenseResults)[0];
    expect(s.status).toBe(SURPLUS_USE_STATUS.NONE);
    expect(s.actuallySpent).toBe(0);
    expect(s.insufficientSurplusAmount).toBe(100000);
    expect(near(rowAt(res, 66).bankValue, 1000000)).toBe(true);
  });

  it("計算対象外の年齢（過去・想定寿命より先）は notApplied として区別する", () => {
    const ledger = [
      { id: "past", age: 60, category: "living", amount: 100000 },   // 現在(65)より過去
      { id: "far", age: 99, category: "living", amount: 100000 },    // 想定寿命(70)より先
    ];
    const res = runLedger(ledger);
    expect(res.oneTimeExpenseResults).toHaveLength(0);
    const summary = summarizeSurplusUsage(ledger, res.oneTimeExpenseResults);
    summary.forEach((s) => {
      expect(s.status).toBe(SURPLUS_USE_STATUS.NOT_APPLIED);
      expect(s.actuallySpent).toBe(0);
      // 「余剰金が足りない」のではなく「反映されていない」ので不足額には数えない。
      expect(s.insufficientSurplusAmount).toBe(0);
    });
  });

  it("totalSurplusUsage は消費行だけを合計する（付け替え・未反映は除く）", () => {
    const ledger = [
      { id: "full", age: 66, category: "travel", amount: 100000 },
      { id: "move", age: 66, category: "toBank", amount: 300000 },
      { id: "far", age: 99, category: "living", amount: 500000 },
    ];
    const res = runLedger(ledger);
    const total = totalSurplusUsage(summarizeSurplusUsage(ledger, res.oneTimeExpenseResults));
    expect(total.requested).toBe(100000);
    expect(total.spent).toBe(100000);
    expect(total.shortfall).toBe(0);
  });

  it("id が重複していても、1つの結果を2行で使い回さない", () => {
    const ledger = [
      { id: "dup", age: 66, category: "travel", amount: 50000 },
      { id: "dup", age: 67, category: "travel", amount: 50000 },
    ];
    // 正規化で id が一意になるので、エンジンの結果も行ごとに1件ずつ対応する。
    const normalized = normalizeSurplusLedger(ledger);
    expect(new Set(normalized.map((e) => e.id)).size).toBe(2);
    const res = runLedger(ledger);
    const summary = summarizeSurplusUsage(ledger, res.oneTimeExpenseResults);
    expect(summary).toHaveLength(2);
    summary.forEach((s) => {
      expect(s.status).toBe(SURPLUS_USE_STATUS.FULL);
      expect(s.actuallySpent).toBe(50000);
    });
    expect(near(res.cumulativeOneTimeSpent, 100000)).toBe(true);
  });

  it("翻訳キー（要求額・実使用・不足額・未反映）が ja・en に存在する", () => {
    // 履歴行は「要求額 / 実使用 / 不足額」の3行で表示するため、ラベルが3つとも必要。
    [
      "surplusRequestedLabel", "surplusSpentLabel", "surplusShortfallLabel", "surplusNotApplied",
    ].forEach((k) => {
      expect(typeof JA_TRANSLATIONS[k]).toBe("string");
      expect(JA_TRANSLATIONS[k].length).toBeGreaterThan(0);
      expect(typeof EN_TRANSLATIONS[k]).toBe("string");
      expect(EN_TRANSLATIONS[k].length).toBeGreaterThan(0);
    });
  });

  it("全額使えた行でも3行表示に必要な値が揃う（要求額＝実使用・不足額0）", () => {
    // 実機：余剰24万に対して20万を要求 → 要求20万 / 実使用20万 / 不足0
    const ledger = [{ id: "a", age: 66, category: "living", amount: 200000 }];
    const res = runLedger(ledger);
    const s = summarizeSurplusUsage(ledger, res.oneTimeExpenseResults)[0];
    expect(s.status).toBe(SURPLUS_USE_STATUS.FULL);
    expect(near(s.requestedAmount, 200000)).toBe(true);
    expect(near(s.actuallySpent, 200000)).toBe(true);
    expect(s.insufficientSurplusAmount).toBe(0);
  });

  it("3行表示に必要な値（要求額・実使用・不足額）が要約に揃っている", () => {
    // 実機と同じ：余剰24万に対して50万を要求 → 要求50万 / 実使用24万 / 不足26万
    const ledger = [{ id: "a", age: 66, category: "living", amount: 500000 }];
    const res = runLedger(ledger);
    const s = summarizeSurplusUsage(ledger, res.oneTimeExpenseResults)[0];
    expect(near(s.requestedAmount, 500000)).toBe(true);
    expect(near(s.actuallySpent, 240000)).toBe(true);
    expect(near(s.insufficientSurplusAmount, 260000)).toBe(true);
    // 3つの値は互いに矛盾しない（要求額＝実使用＋不足額）。
    expect(near(s.actuallySpent + s.insufficientSurplusAmount, s.requestedAmount)).toBe(true);
  });
});

// ============================================================================
// 条件3：使用履歴を削除したら余剰金残高が自動で再計算されること
// ============================================================================
describe("完成条件3：使用履歴の削除で余剰金残高が再計算される", () => {
  const A = { id: "a", age: 66, category: "travel", amount: 100000 };
  const B = { id: "b", age: 67, category: "car", amount: 50000 };

  it("2件のうち1件を削除すると、残り1件だけの結果と完全に一致する", () => {
    const both = runLedger([A, B]);
    const afterDelete = runLedger(removeSurplusEntry([A, B], "b"));
    const onlyA = runLedger([A]);
    expect(JSON.stringify(afterDelete.yearly.map((y) => y.surplusBalance)))
      .toBe(JSON.stringify(onlyA.yearly.map((y) => y.surplusBalance)));
    // 削除前は 67歳で 100000+50000 だけ少ない、削除後は 100000 だけ少ない。
    const base = runLedger([]);
    expect(near(rowAt(base, 67).surplusBalance - rowAt(both, 67).surplusBalance, 150000)).toBe(true);
    expect(near(rowAt(base, 67).surplusBalance - rowAt(afterDelete, 67).surplusBalance, 100000)).toBe(true);
  });

  it("全件削除すると、使用が一度も無かった状態に完全に戻る", () => {
    let ledger = [A, B];
    ledger = removeSurplusEntry(ledger, "a");
    ledger = removeSurplusEntry(ledger, "b");
    expect(ledger).toHaveLength(0);
    const restored = runLedger(ledger);
    const base = runLedger([]);
    expect(JSON.stringify(restored.yearly)).toBe(JSON.stringify(base.yearly));
    expect(restored.cumulativeOneTimeSpent).toBe(0);
  });

  it("削除は非破壊（元の配列を書き換えない）で、対象の1件だけを取り除く", () => {
    const ledger = [A, B];
    const before = JSON.stringify(ledger);
    const after = removeSurplusEntry(ledger, "a");
    expect(JSON.stringify(ledger)).toBe(before);
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe("b");
  });

  it("id を持たない古い保存データでも、1行だけを確実に削除できる", () => {
    const legacy = [
      { age: 66, category: "travel", amount: 100000 },
      { age: 67, category: "car", amount: 50000 },
    ];
    const normalized = normalizeSurplusLedger(legacy);
    expect(new Set(normalized.map((e) => e.id)).size).toBe(2);
    const after = removeSurplusEntry(legacy, normalized[0].id);
    expect(after).toHaveLength(1);
    expect(after[0].amount).toBe(50000);
  });

  it("存在しない id を削除しても台帳は減らない（誤削除しない）", () => {
    expect(removeSurplusEntry([A, B], "zzz")).toHaveLength(2);
    expect(removeSurplusEntry([A, B], undefined)).toHaveLength(2);
  });

  it("削除後は予定支出（近い将来）の合計も再計算される", () => {
    expect(nearTermPlannedExpenses([A, B], 65, NEAR_TERM_HORIZON_YEARS)).toBe(150000);
    expect(nearTermPlannedExpenses(removeSurplusEntry([A, B], "b"), 65, NEAR_TERM_HORIZON_YEARS)).toBe(100000);
  });
});

// ============================================================================
// 台帳の正規化（保存データ由来の欠損に対する回帰防止）
// ============================================================================
describe("種別（kind）の決定ルール：明示された kind が最優先", () => {
  // ① 明示された kind は、用途と矛盾していても維持する（正規化で上書きしない）
  it('kind="transfer" × category="car" → transfer を維持する', () => {
    const entry = { id: "a", age: 66, kind: "transfer", category: "car", amount: 500000 };
    expect(resolveSurplusKind(entry)).toBe("transfer");
    expect(normalizeSurplusEntry(entry).kind).toBe("transfer");
    // 用途は正規化されても（car のまま）、種別は書き換わらない。
    expect(normalizeSurplusEntry(entry).category).toBe("car");
  });

  it('kind="consume" × category="nisa"（付け替え用途）→ consume を維持する', () => {
    const entry = { id: "b", age: 66, kind: "consume", category: "nisa", amount: 300000 };
    expect(resolveSurplusKind(entry)).toBe("consume");
    expect(normalizeSurplusEntry(entry).kind).toBe("consume");
  });

  // ② kind が無いときだけ用途から推定する
  it('kind なし × category="car" → consume と推定する', () => {
    expect(resolveSurplusKind({ category: "car" })).toBe("consume");
    expect(normalizeSurplusEntry({ category: "car" }).kind).toBe("consume");
  });

  it('kind なし × category="nisa"（旧名）→ transfer と推定する', () => {
    expect(resolveSurplusKind({ category: "nisa" })).toBe("transfer");
    expect(normalizeSurplusEntry({ category: "nisa" }).kind).toBe("transfer");
    // 旧名は現行の用途名へ読み替える（表示ラベルも既存の翻訳キーで引ける）。
    expect(canonicalSurplusCategory("nisa")).toBe("toNisa");
    expect(canonicalSurplusCategory("bank")).toBe("toBank");
  });

  it("kind なし × 現行の付け替え用途（toNisa / toBank）→ transfer と推定する", () => {
    expect(normalizeSurplusEntry({ category: "toNisa" }).kind).toBe("transfer");
    expect(normalizeSurplusEntry({ category: "toBank" }).kind).toBe("transfer");
  });

  it("kind が不正値・空文字のときは用途から推定する", () => {
    expect(resolveSurplusKind({ kind: "", category: "toNisa" })).toBe("transfer");
    expect(resolveSurplusKind({ kind: "   ", category: "car" })).toBe("consume");
    expect(resolveSurplusKind({ kind: "spend", category: "toBank" })).toBe("transfer");
    expect(resolveSurplusKind({ kind: 123, category: "car" })).toBe("consume");
    expect(resolveSurplusKind({ kind: null, category: "toNisa" })).toBe("transfer");
    expect(resolveSurplusKind({ kind: true, category: "car" })).toBe("consume");
  });

  it("kind も用途も無い行は安全側（consume）に倒す", () => {
    expect(resolveSurplusKind({})).toBe("consume");
    expect(resolveSurplusKind(null)).toBe("consume");
    expect(surplusKindForCategory("something-unknown")).toBe("consume");
  });

  it("矛盾した kind を持つ行は、計算でもその kind のとおりに扱われる", () => {
    // kind="transfer" なら用途が car でも資金移動 → 総資産も余剰金も動かない。
    const base = runLedger([]);
    const moved = runLedger([{ id: "a", age: 66, kind: "transfer", category: "car", amount: 200000 }]);
    expect(JSON.stringify(moved.yearly.map((y) => [y.surplusBalance, y.totalAssets])))
      .toBe(JSON.stringify(base.yearly.map((y) => [y.surplusBalance, y.totalAssets])));
    // kind="consume" なら用途が toNisa でも消費 → 余剰金から引かれる。
    const spent = runLedger([{ id: "b", age: 66, kind: "consume", category: "toNisa", amount: 100000 }]);
    expect(near(spent.cumulativeOneTimeSpent, 100000)).toBe(true);
  });

  it("何度正規化しても種別が変わらない（読み込みのたびに解釈が揺れない）", () => {
    const entries = [
      { kind: "transfer", category: "car", age: 66, amount: 100000 },
      { kind: "consume", category: "toNisa", age: 67, amount: 100000 },
      { category: "nisa", age: 68, amount: 100000 },
      { kind: "bogus", category: "medical", age: 69, amount: 100000 },
    ];
    const once = normalizeSurplusLedger(entries);
    const twice = normalizeSurplusLedger(once);
    expect(JSON.stringify(twice.map((e) => e.kind))).toBe(JSON.stringify(once.map((e) => e.kind)));
    expect(once.map((e) => e.kind)).toEqual(["transfer", "consume", "transfer", "consume"]);
  });
});

describe("台帳の正規化：保存データの欠損があっても計算・表示がズレない", () => {
  it("kind が無い古い行も、用途から consume と判定して計算に載る", () => {
    const legacy = [{ id: "a", age: 66, category: "travel", amount: 100000 }]; // kind 無し
    expect(normalizeSurplusEntry(legacy[0]).kind).toBe("consume");
    const res = runLedger(legacy);
    expect(near(res.cumulativeOneTimeSpent, 100000)).toBe(true);
  });

  it("用途が不明な行は other 扱いにする（種別の判定には影響しない）", () => {
    expect(normalizeSurplusEntry({ category: "unknown" }).category).toBe("other");
    expect(normalizeSurplusEntry({ category: "unknown" }).kind).toBe("consume");
    expect(normalizeSurplusEntry({ category: "unknown", kind: "transfer" }).kind).toBe("transfer");
  });

  it("金額は負にならず、メモは常に文字列（表示が壊れない）", () => {
    expect(normalizeSurplusEntry({ amount: -500 }).amount).toBe(0);
    expect(normalizeSurplusEntry({ amount: "300000" }).amount).toBe(300000);
    expect(normalizeSurplusEntry({}).memo).toBe("");
  });

  it("正規化は非破壊（元の配列も要素も書き換えない）", () => {
    const ledger = [{ age: 66, category: "travel", amount: 100000 }];
    const before = JSON.stringify(ledger);
    normalizeSurplusLedger(ledger);
    expect(JSON.stringify(ledger)).toBe(before);
  });

  it("同じ台帳を何度正規化しても同じ結果になる（id が毎回ブレない）", () => {
    const ledger = [{ age: 66, category: "travel", amount: 100000 }, { age: 67, category: "car", amount: 50000 }];
    expect(JSON.stringify(normalizeSurplusLedger(ledger)))
      .toBe(JSON.stringify(normalizeSurplusLedger(normalizeSurplusLedger(ledger))));
  });
});

// ============================================================================
// buildPlanInput の結線（正規化した台帳がエンジンへ正しく渡る）
// ============================================================================
describe("buildPlanInput：正規化した台帳が一時支出として渡る", () => {
  const acct = (extra = {}) => ({
    currentValue: 100000, annualContribution: 6000,
    expectedReturnPct: 5, contributionEndAge: 65, withdrawalTaxPct: 0, ...extra,
  });
  const ctxJP = () => ({
    country: "JP", rules: getCountryRules("JP"),
    inputs: {
      country: "JP", baseCurrency: "JPY", language: "ja",
      currentAge: 40, retireAge: 65, deathAge: 90,
      livingCostMonthly: 250000,
      inheritanceTarget: 10000000, inheritancePlans: [],
      publicPensionStartAge: 65, pensionMonthly: 150000, pensionSources: [],
      healthBrackets: { b60: 100000, b70: 150000, b80: 200000 },
      tsumitateSchedule: [{ fromAge: 40, toAge: 65, monthlyYen: 50000 }],
      growthSchedule: [{ fromAge: 40, toAge: 65, monthlyYen: 50000 }],
      lumpSums: [], tsumitateUsed: 0, growthUsed: 0,
      banks: [{ name: "main", balance: 5000000, monthlyDeposit: 20000, interestPct: 0.1 }],
      loans: [], insurancePolicies: [], privatePensionPlans: [],
      gold: {
        currentGrams: 100, pricePerGram: 15000, priceGrowthPct: 3, priceGrowthPctAuto: false,
        monthlyYen: 10000, accumulateUntilAge: 65, asOfYears: "", asOfMonths: "",
      },
      ideco: {
        currentValue: 2000000, principalTotal: 1500000, monthlyContribution: 23000,
        startAge: 35, endAge: 60, productName: "", returnPct: 5, returnPctAuto: false,
        expectedReturnPct: 5, payoutStartAge: 60, payoutMethod: "lump", payoutYears: 10,
        lumpPortionPct: 50, payoutReturnPct: 0, annualIncome: 6000000,
        asOfYears: "", asOfMonths: "",
      },
      usInvestment: {
        k401: acct(), traditionalIra: acct(), rothIra: acct(), brokerage: acct(),
        socialSecurity: { claimAge: 67 }, expectedReturnPct: 5, expensesMonthly: 4000,
      },
      gbInvestment: {
        cashSavings: acct(), gia: acct(), cashIsa: acct(), stocksSharesIsa: acct(),
        workplacePension: acct(), sipp: acct(), expensesMonthly: 3000,
      },
      caInvestment: {
        cashSavings: acct(), nonRegistered: acct(), tfsa: acct(), rrsp: acct(),
        expensesMonthly: 4000,
      },
      auInvestment: {
        cashSavings: acct(), investmentAccount: acct(), superannuation: acct(),
        annualSalary: 100000, voluntaryConcessional: 5000, expensesMonthly: 4500,
      },
    },
    effectiveCurrentAge: 40,
    effectiveCurrentAssets: 3000000,
    effectivePostRetireReturn: 3,
    dynamicFunds: [{ id: "全世界株式", pct: 100, returnPct: 5 }],
    stockTotalNow: 1000000,
    effectiveStockReturnPct: 6,
    goldCurrentValue: 1500000,
    effectiveGoldReturnPct: 3,
    effectivePensionMonthly: 150000,
    effectivePublicPensionStartAge: 65,
    drawdownOrder: DRAWDOWN_CATEGORIES,
    uncategorizedLabel: "未分類",
    countryDerived: {
      usSSMonthlyBenefit: 2500, usTotalHealthcareAnnual: 8000, usClaimAge: 67,
      gbStatePensionAnnual: 12000, gbAdditionalPensionAnnual: 3000,
      gbEffectiveClaimAge: 67, gbHealthcareAnnual: 1500,
      caCppAnnual: 15000, caCppStartAge: 65, caOasAnnual: 8000, caOasStartAge: 65,
      caAdditionalPensionAnnual: 2000, caHealthcareAnnual: 2500,
      auAgePensionAnnual: 26000, auAgePensionQualifyingAge: 67,
      auOtherAnnualIncome: 5000, auHealthcareAnnual: 3000,
    },
  });

  it("kind が無い古い行も consume として oneTimeExpenses に渡る", () => {
    const ctx = ctxJP();
    ctx.inputs.surplusLedger = [{ id: "legacy", age: 70, category: "travel", amount: 300000 }];
    const built = buildPlanInput(ctx);
    expect(built.oneTimeExpenses).toEqual([{ id: "legacy", age: 70, amount: 300000 }]);
  });

  it("id が無い行にも決定的な id が付き、エンジン結果と突き合わせられる", () => {
    const ctx = ctxJP();
    ctx.inputs.surplusLedger = [{ age: 70, category: "car", amount: 200000 }];
    const built = buildPlanInput(ctx);
    expect(built.oneTimeExpenses).toHaveLength(1);
    expect(typeof built.oneTimeExpenses[0].id).toBe("string");
    expect(built.oneTimeExpenses[0].id.length).toBeGreaterThan(0);
    const res = runIntegratedPlan(built);
    const summary = summarizeSurplusUsage(ctx.inputs.surplusLedger, res.oneTimeExpenseResults);
    expect(summary).toHaveLength(1);
    expect(summary[0].requestedAmount).toBe(200000);
  });

  it("付け替え（toNisa / toBank）は oneTimeExpenses に渡らない", () => {
    const ctx = ctxJP();
    ctx.inputs.surplusLedger = [
      { id: "1", age: 70, category: "toNisa", amount: 300000 },
      { id: "2", age: 72, category: "toBank", amount: 400000 },
    ];
    expect(buildPlanInput(ctx).oneTimeExpenses).toHaveLength(0);
  });

  it("元の inputs.surplusLedger を1バイトも変更しない（正規化しても読み取り専用）", () => {
    const ctx = ctxJP();
    ctx.inputs.surplusLedger = [{ age: 70, category: "travel", amount: 300000 }];
    const before = JSON.stringify(ctx.inputs.surplusLedger);
    buildPlanInput(ctx);
    expect(JSON.stringify(ctx.inputs.surplusLedger)).toBe(before);
  });

  it("台帳から1件削除して組み直すと、一時支出も減る（再計算の入口が1本）", () => {
    const ctx = ctxJP();
    const ledger = [
      { id: "a", age: 70, category: "travel", amount: 300000 },
      { id: "b", age: 72, category: "car", amount: 400000 },
    ];
    ctx.inputs.surplusLedger = ledger;
    expect(buildPlanInput(ctx).oneTimeExpenses).toHaveLength(2);
    ctx.inputs.surplusLedger = removeSurplusEntry(ledger, "a");
    const after = buildPlanInput(ctx);
    expect(after.oneTimeExpenses).toEqual([{ id: "b", age: 72, amount: 400000 }]);
  });
});

// ============================================================================
// 二重計上が起きないことの確認（残高・不足額・予定支出・資金移動・削除）
//
// 余剰金は銀行預金の内訳なので、「余剰金からも引き、銀行からも引く」が起きると
// 総資産が二重に減る。逆に資金移動を消費として数えると資産が不当に減る。
// ここでは4系統すべてについて、合計が1回分にしかならないことを固定する。
// ============================================================================
describe("二重計上の防止：使用額・不足額・予定支出・資金移動・削除", () => {
  it("使用額：余剰金の減少・銀行の減少・総資産の減少がすべて同じ1回分", () => {
    const ledger = [{ id: "a", age: 66, category: "travel", amount: 100000 }];
    const base = runLedger([]);
    const used = runLedger(ledger);
    const dSurplus = rowAt(base, 66).surplusBalance - rowAt(used, 66).surplusBalance;
    const dBank = rowAt(base, 66).bankValue - rowAt(used, 66).bankValue;
    const dTotal = rowAt(base, 66).totalAssets - rowAt(used, 66).totalAssets;
    expect(near(dSurplus, 100000)).toBe(true);
    expect(near(dBank, 100000)).toBe(true);
    expect(near(dTotal, 100000)).toBe(true);
    // 余剰金は銀行の内数なので、合算して20万減るようなことは起きない。
    expect(near(dBank, dSurplus)).toBe(true);
    expect(near(used.cumulativeOneTimeSpent, 100000)).toBe(true);
  });

  it("使用額：複数件でも合計は各行の1回分の和にしかならない", () => {
    const ledger = [
      { id: "a", age: 66, category: "travel", amount: 100000 },
      { id: "b", age: 67, category: "car", amount: 50000 },
      { id: "c", age: 68, category: "reform", amount: 30000 },
    ];
    const res = runLedger(ledger);
    expect(res.oneTimeExpenseResults).toHaveLength(3);
    expect(near(res.cumulativeOneTimeSpent, 180000)).toBe(true);
    const base = runLedger([]);
    expect(near(rowAt(base, 70).totalAssets - rowAt(res, 70).totalAssets, 180000)).toBe(true);
  });

  it("不足額：実使用額と不足額の合計が要求額を超えない（両方に計上されない）", () => {
    const ledger = [
      { id: "a", age: 66, category: "car", amount: 1000000 },
      { id: "b", age: 67, category: "travel", amount: 1000000 },
    ];
    const res = runLedger(ledger);
    const summary = summarizeSurplusUsage(ledger, res.oneTimeExpenseResults);
    summary.forEach((r) => {
      expect(near(r.actuallySpent + r.insufficientSurplusAmount, r.requestedAmount)).toBe(true);
    });
    const total = totalSurplusUsage(summary);
    expect(near(total.spent + total.shortfall, total.requested)).toBe(true);
    // 実際に引かれた合計は、エンジンの累計とも一致する（表示と計算が別勘定にならない）。
    expect(near(total.spent, res.cumulativeOneTimeSpent)).toBe(true);
  });

  it("予定支出：同じ行を2回数えない・付け替えは数えない", () => {
    const ledger = [
      { id: "a", age: 66, kind: "consume", category: "travel", amount: 100000 },
      { id: "b", age: 66, kind: "transfer", category: "car", amount: 500000 },   // 矛盾＋付け替え
      { id: "c", age: 67, category: "nisa", amount: 700000 },                    // 旧名の付け替え
      { id: "d", age: 67, category: "medical", amount: 50000 },
    ];
    // consume の2件（10万＋5万）だけが数えられる。
    expect(nearTermPlannedExpenses(ledger, 65, NEAR_TERM_HORIZON_YEARS)).toBe(150000);
    // 正規化を通しても合計は変わらない（正規化が行を増やさない）。
    expect(nearTermPlannedExpenses(normalizeSurplusLedger(ledger), 65, NEAR_TERM_HORIZON_YEARS)).toBe(150000);
  });

  it("資金移動：付け替えは何件あっても総資産・余剰金を1円も動かさない", () => {
    const base = runLedger([]);
    const moved = runLedger([
      { id: "a", age: 66, category: "toNisa", amount: 500000 },
      { id: "b", age: 66, category: "nisa", amount: 500000 },
      { id: "c", age: 67, category: "toBank", amount: 500000 },
      { id: "d", age: 67, kind: "transfer", category: "car", amount: 500000 },
    ]);
    expect(moved.cumulativeOneTimeSpent).toBe(0);
    expect(moved.oneTimeExpenseResults).toHaveLength(0);
    expect(JSON.stringify(moved.yearly)).toBe(JSON.stringify(base.yearly));
    // 表示側でも消費として合計されない。
    const total = totalSurplusUsage(summarizeSurplusUsage(moved === base ? [] : [
      { id: "a", age: 66, category: "toNisa", amount: 500000 },
    ], moved.oneTimeExpenseResults));
    expect(total.spent).toBe(0);
    expect(total.shortfall).toBe(0);
  });

  it("削除：id なしの旧データでも1件だけ消え、残りの計算は二重に戻らない", () => {
    const legacy = [
      { age: 66, category: "travel", amount: 100000 },
      { age: 67, category: "car", amount: 50000 },
    ];
    const normalized = normalizeSurplusLedger(legacy);
    const after = removeSurplusEntry(legacy, normalized[0].id);
    expect(after).toHaveLength(1);
    expect(after[0].amount).toBe(50000);
    // 残った1件は1回だけ引かれる（削除した分が戻り、残した分が二重に引かれない）。
    const res = runLedger(after);
    expect(near(res.cumulativeOneTimeSpent, 50000)).toBe(true);
    const base = runLedger([]);
    expect(near(rowAt(base, 70).totalAssets - rowAt(res, 70).totalAssets, 50000)).toBe(true);
  });

  it("削除を繰り返しても、残高が削除件数以上に戻ることはない", () => {
    let ledger = [
      { id: "a", age: 66, category: "travel", amount: 100000 },
      { id: "b", age: 67, category: "car", amount: 50000 },
    ];
    const base = runLedger([]);
    ledger = removeSurplusEntry(ledger, "a");
    ledger = removeSurplusEntry(ledger, "a"); // 同じidを二度削除しても影響なし
    expect(ledger).toHaveLength(1);
    const res = runLedger(ledger);
    expect(near(rowAt(base, 70).surplusBalance - rowAt(res, 70).surplusBalance, 50000)).toBe(true);
  });
});

// ============================================================================
// 現在時点の余剰金残高カード（実機で見つかった不具合の回帰テスト）
//
// エンジンの yearly[0] は「現在年齢の処理を行う前」のスナップショットなので、
// 現在年齢で余剰金を使ってもそのままでは減って見えない。
//   例）初期余剰24万・現在57歳で20万使用 → カードが24万のままだった（期待は4万）
// surplusBalanceNow で実使用額を差し引き、利用者の感覚と一致させる。
// ============================================================================
describe("現在時点の余剰金残高カード：現在年齢で使った分が即座に反映される", () => {
  // 実機と同じ形：初期余剰24万、現在57歳、収入なし（積み上がりはしない）
  const nowPlan = (expenses) => runIntegratedPlan(plan({
    currentAge: 57, retireAge: 65, deathAge: 90,
    publicPensions: [],
    initialSurplusBalance: 240000,
    pools: [{ id: "bank", group: "bank", balance: 3000000, annualReturnPct: 0, drawOrder: 1 }],
    oneTimeExpenses: expenses,
  }));

  it("初期余剰24万・現在57歳で20万使用 → 実使用20万・不足0・現在残高は4万", () => {
    const res = nowPlan([{ id: "a", age: 57, amount: 200000 }]);
    const r = res.oneTimeExpenseResults[0];
    expect(near(r.actuallySpent, 200000)).toBe(true);
    expect(near(r.insufficientSurplusAmount, 0)).toBe(true);
    const shown = surplusBalanceNow({
      snapshotBalance: res.yearly[0].surplusBalance,
      oneTimeExpenseResults: res.oneTimeExpenseResults,
      currentAge: 57,
    });
    expect(near(shown, 40000)).toBe(true);
  });

  it("初期余剰24万・現在57歳で50万使用 → 実使用24万・不足26万・現在残高は0", () => {
    const res = nowPlan([{ id: "a", age: 57, amount: 500000 }]);
    const r = res.oneTimeExpenseResults[0];
    expect(near(r.actuallySpent, 240000)).toBe(true);
    expect(near(r.insufficientSurplusAmount, 260000)).toBe(true);
    const shown = surplusBalanceNow({
      snapshotBalance: res.yearly[0].surplusBalance,
      oneTimeExpenseResults: res.oneTimeExpenseResults,
      currentAge: 57,
    });
    expect(near(shown, 0)).toBe(true);
  });

  it("同じ年齢に複数件あるときは、先に登録した分から順に使われる（合計は余剰金まで）", () => {
    // 実機で「20万が0円」に見えた状態の再現：先の50万が24万を使い切る。
    const res = nowPlan([
      { id: "first", age: 57, amount: 500000 },
      { id: "second", age: 57, amount: 200000 },
    ]);
    const byId = Object.fromEntries(res.oneTimeExpenseResults.map((r) => [r.id, r]));
    expect(near(byId.first.actuallySpent, 240000)).toBe(true);
    expect(near(byId.second.actuallySpent, 0)).toBe(true);
    expect(near(byId.second.insufficientSurplusAmount, 200000)).toBe(true);
    // 合計の実使用額は余剰金残高を超えない（二重に使えない）。
    expect(near(res.cumulativeOneTimeSpent, 240000)).toBe(true);
  });

  it("将来の年齢で使った分は、現在時点のカードから引かない", () => {
    const res = nowPlan([{ id: "a", age: 70, amount: 100000 }]);
    const shown = surplusBalanceNow({
      snapshotBalance: res.yearly[0].surplusBalance,
      oneTimeExpenseResults: res.oneTimeExpenseResults,
      currentAge: 57,
    });
    expect(near(shown, 240000)).toBe(true);
  });

  it("surplusSpentThroughAge は基準年齢までの実使用額だけを合計する", () => {
    const results = [
      { id: "a", age: 57, actuallySpent: 200000 },
      { id: "b", age: 60, actuallySpent: 100000 },
      { id: "c", age: 70, actuallySpent: 300000 },
    ];
    expect(surplusSpentThroughAge(results, 57)).toBe(200000);
    expect(surplusSpentThroughAge(results, 60)).toBe(300000);
    expect(surplusSpentThroughAge(results, 90)).toBe(600000);
    expect(surplusSpentThroughAge(results, 50)).toBe(0);
    expect(surplusSpentThroughAge(null, 57)).toBe(0);
  });

  it("表示は0円未満にならず、使用が無ければスナップショットのまま", () => {
    expect(surplusBalanceNow({ snapshotBalance: 100000, oneTimeExpenseResults: [{ age: 57, actuallySpent: 500000 }], currentAge: 57 })).toBe(0);
    expect(surplusBalanceNow({ snapshotBalance: 240000, oneTimeExpenseResults: [], currentAge: 57 })).toBe(240000);
  });

  it("小数の現在年齢（57.66歳）でも、現在時点の使用が反映される", () => {
    const res = runIntegratedPlan(plan({
      currentAge: 57.66, retireAge: 65, deathAge: 90,
      publicPensions: [], initialSurplusBalance: 240000,
      pools: [{ id: "bank", group: "bank", balance: 3000000, annualReturnPct: 0, drawOrder: 1 }],
      oneTimeExpenses: [{ id: "a", age: 57.66, amount: 200000 }],
    }));
    const shown = surplusBalanceNow({
      snapshotBalance: res.yearly[0].surplusBalance,
      oneTimeExpenseResults: res.oneTimeExpenseResults,
      currentAge: 57.66,
    });
    expect(near(shown, 40000)).toBe(true);
  });
});
