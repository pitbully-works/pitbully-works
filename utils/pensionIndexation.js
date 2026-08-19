const num = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// ライフプラン用の長期概算。実際の毎年の法定改定率を予測するものではない。
// JP: 物価・賃金改定＋マクロ経済スライドを簡略化し、インフレより0.5pt低い保守仮定。
// US: Social Security COLA は物価連動なので、長期計画では選択インフレ率を近似値に使う。
// GB: State Pension の Triple Lock を簡略化し、インフレ率と2.5%の大きい方を使う。
// CA: CPP/OAS はCPI連動なので、長期計画では選択インフレ率を近似値に使う。
// AU: Age Pension は定期的に指数改定されるため、長期計画では選択インフレ率を近似値に使う。
export const JP_PENSION_INDEXATION_AUTO_GAP_PCT = 0.5;
export const GB_PENSION_TRIPLE_LOCK_FLOOR_PCT = 2.5;

export function resolvePublicPensionIndexationPct(country, inflationPct, setting = {}) {
  const mode = setting?.mode || "auto";
  if (mode === "off") return 0;
  if (mode === "manual") return clamp(num(setting?.manualPct), -5, 10);
  const inflation = clamp(num(inflationPct), 0, 10);
  if (country === "JP") return clamp(inflation - JP_PENSION_INDEXATION_AUTO_GAP_PCT, 0, 10);
  if (country === "GB") return clamp(Math.max(inflation, GB_PENSION_TRIPLE_LOCK_FLOOR_PCT), 0, 10);
  if (country === "US" || country === "CA" || country === "AU") return inflation;
  return 0;
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
