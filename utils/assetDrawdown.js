// 年齢別の資産取り崩し額を、統合エンジンが記録した累計値の差分から導く。
// 残高や取り崩し順序には触れない表示専用ユーティリティ。
export const ASSET_DRAWDOWN_CATEGORIES = ["cash", "taxable", "taxFree", "restricted", "physical", "other"];

const finite = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;

export function deriveAnnualAssetDrawdownRows(yearly = []) {
  if (!Array.isArray(yearly) || yearly.length < 2) return [];
  const out = [];
  for (let i = 1; i < yearly.length; i += 1) {
    const prev = yearly[i - 1] || {};
    const cur = yearly[i] || {};
    const row = {
      age: finite(cur.age),
      exactAge: finite(cur.exactAge ?? cur.age),
      periodYears: Math.max(0, finite(cur.exactAge ?? cur.age) - finite(prev.exactAge ?? prev.age)),
    };
    let total = 0;
    ASSET_DRAWDOWN_CATEGORIES.forEach((category) => {
      const key = `cumulativeDrawdown_${category}`;
      const value = Math.max(0, finite(cur[key]) - finite(prev[key]));
      row[`annualDrawdown_${category}`] = value;
      total += value;
    });
    row.annualDrawdownTotal = total;
    out.push(row);
  }
  return out;
}
