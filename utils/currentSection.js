// ============================================================================
// utils/currentSection.js
//
// 画面を縦にスクロールしたとき、「いまどのセクションを見ているか」を決める。
//
// ここは純粋関数だけを置く。DOM も window も触らない。
// 実際の座標取り（getBoundingClientRect）は App.jsx 側が行い、
// 取れた数値だけをここへ渡す。判定の理屈をUIから切り離しておくと、
// ブラウザを立ち上げずにテストできる。
//
// 【重要】表示のためだけの判定であり、資産計算には一切関与しない。
// ============================================================================

// 画面の上端から何px下を「いま見ている位置」とみなすか。
// 0にすると、見出しが上端に触れた瞬間だけ切り替わって落ち着かない。
// 少し下に基準線を引くことで、見出しが画面上部に入った時点で切り替わる。
export const CURRENT_SECTION_OFFSET = 96;

/**
 * いま見ているセクションのアンカーidを返す。
 *
 * @param {Array<{anchor: string, top: number}>} sections
 *        top は「画面上端からの距離(px)」。上へ流れると負になる。
 * @param {{offset?: number, atBottom?: boolean}} [options]
 *        offset   … 基準線の位置（省略時 CURRENT_SECTION_OFFSET）
 *        atBottom … ページの一番下まで来ているか。
 *                   最後のセクションが短いと基準線まで届かないことがあるため、
 *                   下まで来たら最後のセクションを「いまここ」とする。
 * @returns {string|null} アンカーid。決められないときは null。
 */
export function pickCurrentAnchor(sections, options = {}) {
  const offset = Number.isFinite(options.offset) ? options.offset : CURRENT_SECTION_OFFSET;
  const atBottom = options.atBottom === true;

  if (!Array.isArray(sections)) return null;
  const valid = sections.filter(
    (s) => s && typeof s.anchor === "string" && s.anchor !== "" && Number.isFinite(s.top)
  );
  if (valid.length === 0) return null;

  // ページの一番下：いちばん下にあるセクションを見ているとみなす。
  if (atBottom) {
    return valid.reduce((a, b) => (b.top > a.top ? b : a)).anchor;
  }

  // 基準線をすでに通り過ぎたもののうち、いちばん下（＝直近に通過したもの）。
  let passed = null;
  valid.forEach((s) => {
    if (s.top <= offset && (passed === null || s.top > passed.top)) passed = s;
  });
  if (passed) return passed.anchor;

  // まだどれも基準線に届いていない（ページ先頭）＝いちばん上のもの。
  return valid.reduce((a, b) => (b.top < a.top ? b : a)).anchor;
}
