const num = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// ライフプラン用の保守的な自動仮定。
// 日本の公的年金は物価・賃金に応じて改定される一方、マクロ経済スライドで
// 伸びが抑えられることがあるため、インフレ率より0.5pt低い率を長期概算に使う。
// これは法定の将来改定率ではなく、利用者が上書きできる計画上の仮定。
export const JP_PENSION_INDEXATION_AUTO_GAP_PCT = 0.5;

export function resolvePublicPensionIndexationPct(country, inflationPct, setting = {}) {
  const mode = setting?.mode || "auto";
  if (mode === "off") return 0;
  if (mode === "manual") return clamp(num(setting?.manualPct), -5, 10);
  if (country !== "JP") return 0;
  return clamp(num(inflationPct) - JP_PENSION_INDEXATION_AUTO_GAP_PCT, 0, 10);
}

export function indexedPensionMonthly(baseMonthly, startAge, age, annualPct) {
  const base = Math.max(0, num(baseMonthly));
  const start = num(startAge);
  const target = num(age);
  const rate = clamp(num(annualPct), -5, 10) / 100;
  if (base <= 0 || target < start || rate === 0) return base;
  // 受給開始年齢の1年間は入力額を基準額として扱い、満1年ごとに改定する。
  const years = Math.max(0, Math.floor(target + 1e-9) - Math.floor(start + 1e-9));
  return base * Math.pow(1 + rate, years);
}

export function realValueAt(nominalValue, currentAge, targetAge, inflationPct) {
  const nominal = num(nominalValue);
  const rate = Math.max(0, num(inflationPct)) / 100;
  if (rate <= 0) return nominal;
  const years = Math.max(0, num(targetAge) - num(currentAge));
  return nominal / Math.pow(1 + rate, years);
}
