// ============================================================================
// utils/scenarioComparison.js
//
// シナリオ比較（現在プラン vs 比較プラン）の純粋関数。
//
// 【設計方針】
// ・新しい資産計算式は1つも作らない。既存の runIntegratedPlan を、
//   現在プランと比較プランに1回ずつ使うだけ。
// ・React も翻訳辞書も知らない。5か国とも同じコードが走る。
// ・元の入力（ctx.inputs）は絶対に書き換えない。上書きは buildPlanInput の
//   overrides として渡すだけで、inputs 自体には触れない。
// ============================================================================

import { runIntegratedPlan } from "../lifePlanEngine.js";
import { buildPlanInput, readLivingCostMonthly, CONTRIBUTION_MULTIPLIERS } from "./buildPlanInput.js";

export { CONTRIBUTION_MULTIPLIERS };

/**
 * 現在の入力から「比較プランの初期値」を作る（＝現在プランのコピー）。
 * 返すのは3項目だけの小さなオブジェクトで、inputs のコピーではない。
 * これにより、比較プランをいじっても保存データ・自動保存・入力履歴に一切触れない。
 */
export function createComparisonDraft(country, inputs) {
  return {
    retireAge: Number(inputs.retireAge),
    livingCostMonthly: readLivingCostMonthly(country, inputs),
    contributionMultiplier: 1,
  };
}

/**
 * 想定寿命時点の純資産（＝最終行の netWorth）。
 * finalNetWorth は runIntegratedPlan がすでに返しているのでそれを使う。
 */
function netWorthAt(result, age) {
  const target = Math.round(age);
  const rows = result.yearly;
  const row = rows.find((y) => y.age >= target) || rows[rows.length - 1];
  return row ? row.netWorth : 0;
}

/**
 * 1プラン分の主要指標を取り出す。新しい計算は一切していない。
 */
function summarize(result, { retireAge, deathAge, inheritanceTarget }) {
  const netWorthAtRetire = netWorthAt(result, retireAge);
  const netWorthFinal = result.finalNetWorth;
  return {
    retireAge,
    netWorthAtRetire,
    netWorthFinal,
    depletionAge: result.depletionAge, // 尽きなければ null
    inheritanceTarget,
    inheritanceGap: netWorthFinal - inheritanceTarget,
    inheritanceAchieved: inheritanceTarget > 0 ? netWorthFinal >= inheritanceTarget : null,
  };
}

// 行を突き合わせるキー。
//
// 【なぜ age をそのまま使わないか】
// 行の age は Math.floor された整数（先頭行は 58.66歳 → 58）。想定寿命が 90.5歳のような
// 小数だと、90歳の誕生日の行と 90.5歳の最終行がどちらも age = 90 になり、
// Map で片方が上書きされて比較線が欠落・混線する。
// exactAge は各行が計算に実際に使った小数年齢なので衝突しない。
// exactAge を持たない行だけ age で照合する。
function rowKey(r) {
  return (r.exactAge !== undefined && r.exactAge !== null) ? `e:${r.exactAge}` : `a:${r.age}`;
}

/**
 * 既存のグラフ行に、比較プランの純資産（comparisonNetWorth）を1キーだけ足して返す。
 * 元の行のキー（investmentValue / goldValue / netWorth / phase など）は一切変更しない。
 * ＝ 資産内訳の面グラフは比較中でも完全に同じものが描かれる。
 */
export function attachComparisonLine(rows, compareYearly) {
  const byKey = new Map((compareYearly || []).map((r) => [rowKey(r), r.netWorth]));
  return (rows || []).map((r) => {
    const k = rowKey(r);
    // 対応する時点が比較プランに無ければ null（recharts は connectNulls で繋ぐ）
    return { ...r, comparisonNetWorth: byKey.has(k) ? byKey.get(k) : null };
  });
}

/**
 * 現在プランと比較プランを計算し、両方の要約と差額を返す。
 *
 * @param {object} ctx    buildPlanInput に渡すのと同じコンテキスト
 * @param {object} draft  { retireAge, livingCostMonthly, contributionMultiplier }
 * @param {object} opts   { inheritanceTarget }
 *
 * @returns {{
 *   base: object, compare: object, diff: object,
 *   baseYearly: Array, compareYearly: Array, chartData: Array
 * }}
 */
export function runScenarioComparison(ctx, draft, opts = {}) {
  const inheritanceTarget = Number(opts.inheritanceTarget) || 0;
  const deathAge = Number(ctx.inputs.deathAge);

  // 現在プラン：上書きなしで既存エンジンをそのまま呼ぶ。
  const baseResult = runIntegratedPlan(buildPlanInput(ctx));
  // 比較プラン：3項目だけを上書きして、同じエンジンをもう一度呼ぶ。
  const compareResult = runIntegratedPlan(buildPlanInput(ctx, draft));

  const base = summarize(baseResult, {
    retireAge: Number(ctx.inputs.retireAge), deathAge, inheritanceTarget,
  });
  const compare = summarize(compareResult, {
    retireAge: Number(draft.retireAge), deathAge, inheritanceTarget,
  });

  // 差額（比較プラン − 現在プラン）。プラスなら比較プランのほうが良い。
  const diff = {
    netWorthAtRetire: compare.netWorthAtRetire - base.netWorthAtRetire,
    netWorthFinal: compare.netWorthFinal - base.netWorthFinal,
    inheritanceGap: compare.inheritanceGap - base.inheritanceGap,
    // 資産寿命の差（年）。どちらかが「尽きない」場合は null（数値で比べられないため）。
    depletionAge: (base.depletionAge !== null && compare.depletionAge !== null)
      ? compare.depletionAge - base.depletionAge
      : null,
  };

  const chartData = attachComparisonLine(baseResult.yearly, compareResult.yearly);

  return {
    base,
    compare,
    diff,
    baseYearly: baseResult.yearly,
    compareYearly: compareResult.yearly,
    chartData,
  };
}
