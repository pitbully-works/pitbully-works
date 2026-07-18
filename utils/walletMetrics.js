// ============================================================================
// utils/walletMetrics.js
//
// 「未来現在統合財布」の表示専用メトリクスを計算する純粋関数だけを置く。
// React にも DOM にもエンジンにも依存しない（テストしやすさと一貫性のため）。
//
// 【重要・すべて表示専用】ここで計算する値は画面表示のためだけのもので、
//   統合エンジン（runIntegratedPlan）のキャッシュフロー計算には一切渡さない。
//   したがって totalAssets / netWorth / surplusBalance などの資産計算は 1 円も変わらない。
//
// 入力の出どころ（すべて単一の integrated 結果 or 既存 inputs）：
//   ・accessibleAssets … integrated.yearly[0].accessibleAssets（フェーズ1で追加済み）
//   ・emergencyFund   … inputs.emergencyFund（フェーズ2で追加・表示専用・円単位）
//   ・surplusLedger   … inputs.surplusLedger（既存の「使う」台帳）
// ============================================================================

import { normalizeSurplusEntry } from "./surplusLedger.js";

// 「近い将来」の既定の年数。将来、設定で 3 年 / 5 年を選べるようにする余地を残す。
export const NEAR_TERM_HORIZON_YEARS = 3;

/**
 * 支出年齢の正規化。
 * 画面は現在年齢を Math.floor(effectiveCurrentAge) で表示する（例：58.66歳→「58歳」）。
 * 利用者が「58歳で使う」と入力したとき、内部の判定を素の 58 で行うと
 * `58 >= 58.66` が false になり、現在時点の支出が過去扱いで無視されてしまう。
 * そこで、画面表示上の現在年齢（floor）で入力された支出は、内部では現在時点
 * （effectiveCurrentAge＝小数）の支出として正規化する。
 * これにより buildPlanInput（エンジンへ渡す一時支出）と nearTermPlannedExpenses が
 * 同じ基準で「現在の支出」を扱える。
 *
 * @param {number} age         入力された支出年齢
 * @param {number} currentAge  現在年齢（小数・effectiveCurrentAge）
 * @returns {number} 正規化後の年齢
 */
export function normalizeExpenseAge(age, currentAge) {
  const a = Number(age);
  const cur = Number(currentAge);
  if (!Number.isFinite(a) || !Number.isFinite(cur)) return a;
  return a === Math.floor(cur) ? cur : a;
}

/**
 * 近い将来（現在〜現在+horizonYears）の予定支出の合計。
 * surplusLedger の consume（実消費）だけを対象にする。transfer（付け替え）は
 * 総資産不変のラベル移動なので予定支出に数えない。
 * 支出年齢は normalizeExpenseAge で正規化してから期間判定する（現在年齢が小数でも、
 * 画面表示上の現在年齢で入力した支出を「現在の支出」として正しく含める）。
 *
 * @param {Array}  surplusLedger  inputs.surplusLedger
 * @param {number} currentAge     現在年齢（小数可）
 * @param {number} horizonYears   何年先までを「近い将来」とみなすか（既定 3 年）
 * @returns {number} 予定支出の合計（円）。0 以上。
 */
export function nearTermPlannedExpenses(surplusLedger, currentAge, horizonYears = NEAR_TERM_HORIZON_YEARS) {
  const list = Array.isArray(surplusLedger) ? surplusLedger : [];
  const from = Number(currentAge);
  const to = Number(currentAge) + Number(horizonYears);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return list.reduce((sum, e) => {
    if (!e) return sum;
    // 種別は台帳の正規化と同じ判定を使う（保存データに kind が無い古い行も、
    // 用途から consume と判定して予定支出に正しく数える）。
    const entry = normalizeSurplusEntry(e);
    if (entry.kind !== "consume") return sum;
    const age = normalizeExpenseAge(entry.age, currentAge);
    const amount = Number(entry.amount);
    if (!Number.isFinite(age) || !(amount > 0)) return sum;
    if (age < from - 1e-9 || age > to + 1e-9) return sum;
    return sum + amount;
  }, 0);
}

/**
 * 現在自由に使える金額。
 *   freeToSpendNow = max(0, accessibleAssets − emergencyFund − nearTermPlanned)
 * ＝「今すぐ使える資産」から「生活防衛資金（残しておきたい最低現金）」と
 *   「近い将来の予定支出」を差し引いた、当面自由に使える金額。0 未満にはしない。
 *
 * @param {object} args { accessibleAssets, emergencyFund, nearTermPlanned }
 * @returns {number} 円。0 以上。
 */
export function freeToSpendNow({ accessibleAssets, emergencyFund = 0, nearTermPlanned = 0 }) {
  const acc = Number(accessibleAssets) || 0;
  const ef = Number(emergencyFund) || 0;
  const near = Number(nearTermPlanned) || 0;
  return Math.max(0, acc - ef - near);
}

/**
 * ある年齢で使用可能な金額（静的版）。
 *   availableToSpendAtAge = max(0, spendableAssets(age) − minimumResidual)
 * ＝その年齢の「使える資産（恒久ロックを除く）」から「最低残したい資産（相続で残す額など）」を
 *   差し引いた金額。0 未満にはしない。
 *
 * 【表示専用】この値はエンジンのキャッシュフロー計算には一切渡さない。minimumResidual には
 *   既存の inheritanceTarget（残したい額）を流用する想定。将来、資産を枯渇させない最大額を
 *   探索する「持続可能版」を別途足す余地を残す（その場合も本関数の静的版は据え置く）。
 *
 * @param {object} args { spendableAssets, minimumResidual }
 * @returns {number} 円。0 以上。
 */
export function availableToSpendAtAge({ spendableAssets, minimumResidual = 0 }) {
  const spend = Number(spendableAssets) || 0;
  const floor = Number(minimumResidual) || 0;
  return Math.max(0, spend - floor);
}

// What-if（急な出費シミュレーション）で追加する一時支出の識別子。
// 基の余剰金台帳（surplusLedger）とは別の、その場限りの試算用。
export const WHATIF_EXPENSE_ID = "__whatif__";

/**
 * What-if：基のプランに「余剰金の使用」を1件だけ一時的に加えたプランを返す。
 * 【非破壊】basePlan も inputs も一切書き換えず、クローンを返す（表示専用の試算）。
 * amount<=0 のときは基のプランをそのまま返す（何も足さない）。
 * 一時支出は既存の「余剰金を使う」経路をそのまま通るので、余剰金の範囲でだけ使われ、
 * 通常預金には波及しない（エンジンの計算は変更しない）。
 *
 * @param {object} basePlan  buildPlanInput の結果
 * @param {object} args { amount, age }
 * @returns {object} クローンされたプラン（oneTimeExpenses に1件追加）
 */
export function withWhatIfExpense(basePlan, { amount, age }) {
  const amt = Number(amount) || 0;
  if (!(amt > 0) || !basePlan) return basePlan;
  const extra = { id: WHATIF_EXPENSE_ID, age: Number(age), amount: amt };
  return { ...basePlan, oneTimeExpenses: [...(basePlan.oneTimeExpenses || []), extra] };
}

/**
 * What-if の影響を before/after/delta で要約する（純粋・表示専用）。
 * すべて integrated の行から読み出す（現在値＝yearly[0]、将来値＝年齢で解決した行の netWorth）。
 * 基の integrated は読み取るだけで変更しない。
 *
 * @param {object} baseInt   基の integrated
 * @param {object} whatIfInt What-if の integrated
 * @param {number[]} ages    将来資産（純資産）を比較する年齢（既定 [65,75,95]）
 * @returns {object} { surplus, bank, totalAssets, byAge[], depletionAge,
 *                     requestedAmount, actuallySpent, insufficientSurplusAmount }
 */
export function summarizeWhatIfImpact(baseInt, whatIfInt, ages = [65, 75, 95]) {
  const rowAt = (res, age) => {
    const t = Math.round(age);
    const rows = res.yearly;
    return rows.find((y) => y.age >= t) || rows[rows.length - 1];
  };
  const b0 = baseInt.yearly[0];
  const wResult = (whatIfInt.oneTimeExpenseResults || []).find((r) => r.id === WHATIF_EXPENSE_ID) || null;
  const spent = wResult ? wResult.actuallySpent : 0;
  // 現在の余剰金・銀行・総資産は「使うと同額だけ即時に減る」。実使用額は必ず
  //   spent ≤ 余剰金 ≤ 銀行 ≤ 総資産 なので before − spent は 0 未満にならない。
  // （engine の yearly[0] は支出適用前のスナップショットなので、直後の値はここで求める。）
  const immediate = (beforeVal) => ({ before: beforeVal, after: beforeVal - spent, delta: -spent });
  return {
    surplus: immediate(b0.surplusBalance),
    bank: immediate(b0.bankValue),
    totalAssets: immediate(b0.totalAssets),
    // 将来（65/75/95歳）の純資産は運用機会損失や取り崩し動学を含むため、engine の
    // What-if 実行結果の行から読む（表示専用だが、ここは engine の再実行が必要な部分）。
    byAge: ages.map((age) => {
      const bA = rowAt(baseInt, age).netWorth;
      const wA = rowAt(whatIfInt, age).netWorth;
      return { age, before: bA, after: wA, delta: wA - bA };
    }),
    depletionAge: { before: baseInt.depletionAge ?? null, after: whatIfInt.depletionAge ?? null },
    requestedAmount: wResult ? wResult.requestedAmount : 0,
    actuallySpent: spent,
    insufficientSurplusAmount: wResult ? wResult.insufficientSurplusAmount : 0,
  };
}
