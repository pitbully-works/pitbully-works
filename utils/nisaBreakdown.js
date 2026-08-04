// ============================================================================
// utils/nisaBreakdown.js
//
// 現在のNISA資産を「どこから来たお金か」で4つに分けて並べる。
//
//   ① 最初の残高   … 基準年齢の時点で実際にいくらあったか（つみたて枠＋成長枠 合算）
//   ② つみたて積立 … 積立スケジュールで、これまでに引き落とされてきた分
//   ③ 成長投資積立 … 成長投資枠スケジュールで、これまでに引き落とされてきた分
//   ④ 一括投資     … 今日までに実行済みの一括投資
//
// それぞれ「元本（入れた金額）」と「年率」と「現在の評価額」を持つ。
// 元本と評価額を並べて見られるようにするのが目的で、
// 評価額の合計は画面上部の「現在のNISA資産：合計」と一致する。
//
// ここは純粋関数だけを置く。金額の計算そのものは呼び出し側（App.jsx）が済ませ、
// ここへは出来上がった数値だけを渡す。DOM も React も触らない。
//
// 【重要】表示のための整形だけで、シミュレーションの計算には一切関与しない。
// ============================================================================

// 4区分の並び順。画面でも、この順で左から並べる。
export const NISA_BREAKDOWN_KEYS = ["initial", "tsumitate", "growth", "lump"];

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * 4区分の一覧を作る。
 *
 * @param {object} parts 区分ごとの { principal, value, returnPct }
 * @param {object} labels 区分ごとの表示名（key → 文字列）
 * @param {object} [options] { includeEmpty: 中身が空の区分も残すか（既定 false） }
 * @returns {Array<{key,name,principal,value,returnPct,gain}>}
 */
export function buildNisaBreakdown(parts, labels, options = {}) {
  const p = parts || {};
  const l = labels || {};
  const includeEmpty = options.includeEmpty === true;

  return NISA_BREAKDOWN_KEYS.map((key) => {
    const row = p[key] || {};
    const principal = num(row.principal);
    const value = num(row.value);
    return {
      key,
      name: String(l[key] || key),
      principal,
      value,
      returnPct: num(row.returnPct),
      // 増減（評価額 − 元本）。マイナスにもなりうる。
      gain: value - principal,
    };
  }).filter((row) => includeEmpty || row.principal > 0 || row.value > 0);
}

/** 元本の円・棒グラフに渡す形（{ name, amount }）へ変換する。 */
export function breakdownPrincipalItems(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter((r) => r && num(r.principal) > 0)
    .map((r) => ({ name: r.name, amount: num(r.principal) }));
}

/**
 * 年率の棒グラフに渡す形。
 * 年率は「割合」ではなく「率そのもの」なので、円グラフにはしない。
 * いちばん高い区分を100%として、棒の長さの比だけを返す。
 */
export function breakdownReturnBars(rows) {
  const list = (Array.isArray(rows) ? rows : []).filter((r) => r && (num(r.principal) > 0 || num(r.value) > 0));
  const max = list.reduce((m, r) => Math.max(m, num(r.returnPct)), 0);
  return list.map((r) => ({
    key: r.key,
    name: r.name,
    returnPct: num(r.returnPct),
    // 年率0%のときに棒が消えてしまわないよう、最低でも少しは見せる
    widthPct: max > 0 ? Math.max(2, (num(r.returnPct) / max) * 100) : 0,
  }));
}

/** 合計（元本・評価額）。画面の突き合わせに使う。 */
export function breakdownTotals(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const principal = list.reduce((s, r) => s + num(r && r.principal), 0);
  const value = list.reduce((s, r) => s + num(r && r.value), 0);
  return { principal, value, gain: value - principal };
}
