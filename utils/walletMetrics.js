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
    if (!e || e.kind !== "consume") return sum;
    const age = normalizeExpenseAge(e.age, currentAge);
    const amount = Number(e.amount);
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
