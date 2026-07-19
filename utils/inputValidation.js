// ============================================================================
// utils/inputValidation.js
//
// 入力値の整合チェック（表示専用の純粋関数だけを置く）。
// React にも DOM にもエンジンにも依存しない。
//
// 【重要・計算には一切影響しない】
//   ここで返すのは「画面に出す警告の種類」だけで、シミュレーションの入力を
//   書き換えたり、計算を止めたりはしない。エンジンは矛盾した年齢を渡されても
//   例外を出さずに走るが、その結果（例：想定寿命が現在年齢より前だと行が1本しか
//   出ない）は利用者には理解できないため、入力欄の近くで理由を伝えるために使う。
// ============================================================================

// 警告の種類。翻訳キーは "validation" + 名前（ja.js / en.js 側）。
export const AGE_VALIDATION = {
  DEATH_BEFORE_CURRENT: "deathAgeTooLow",   // 想定寿命 ≤ 現在年齢
  RETIRE_BEFORE_CURRENT: "retireAgeTooLow", // 退職年齢 < 現在年齢
};

/**
 * 年齢入力の整合チェック。
 *
 * ・想定寿命 ≤ 現在年齢 … 将来が1行も無いグラフになるため、必ず知らせる。
 * ・退職年齢 < 現在年齢 … 「すでに退職済み」という意味になり得るが、
 *   積立の入力が無視されるなど結果が直感と食い違うため、注意として知らせる。
 *
 * 数値でない値（未入力・空欄）は判定しない（入力途中で警告を出さないため）。
 *
 * @param {object} args { currentAge, retireAge, deathAge }
 * @returns {string[]} 警告の種類（AGE_VALIDATION の値）。問題なければ空配列。
 */
export function validateAgeInputs({ currentAge, retireAge, deathAge } = {}) {
  // 空欄は「未入力」であって 0 ではない。Number("") は 0 かつ有限なので、
  // そのまま判定すると入力を消した瞬間に赤い警告が出てしまう（入力途中の誤警告）。
  const toAge = (v) => (v === undefined || v === null || v === "" ? NaN : Number(v));
  const cur = toAge(currentAge);
  const ret = toAge(retireAge);
  const death = toAge(deathAge);
  const warnings = [];
  if (Number.isFinite(cur) && Number.isFinite(death) && death <= cur) {
    warnings.push(AGE_VALIDATION.DEATH_BEFORE_CURRENT);
  }
  if (Number.isFinite(cur) && Number.isFinite(ret) && ret < cur) {
    warnings.push(AGE_VALIDATION.RETIRE_BEFORE_CURRENT);
  }
  return warnings;
}

/**
 * 診断（アドバイス）を出してよい状態か。
 *
 * 【なぜ必要か】
 *   初期状態は生活費も資産も 0 で、生活費が 0 なら資産は減らないため、
 *   何も入力していないのに「想定寿命まで資産が残ります」と緑の判定が出てしまう。
 *   お金の判断に使う画面で、未入力の人に安心を与えるのは最も避けたい誤りなので、
 *   最低限の入力（現在年齢・生活費・資産）が揃うまで診断そのものを出さない。
 *
 * @param {object} args { currentAge, livingCostMonthly, totalAssets }
 * @returns {boolean} 3つとも 0 より大きければ true
 */
export function hasEnoughInputForAdvice({ currentAge, livingCostMonthly, totalAssets } = {}) {
  // 空欄は 0 として扱ってよい（0 なら診断しない、という判定は同じ結論になる）。
  const cur = Number(currentAge);
  const cost = Number(livingCostMonthly);
  const assets = Number(totalAssets);
  return (
    Number.isFinite(cur) && cur > 0 &&
    Number.isFinite(cost) && cost > 0 &&
    Number.isFinite(assets) && assets > 0
  );
}
