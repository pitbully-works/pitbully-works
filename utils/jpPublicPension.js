const MONTHS_PER_YEAR = 12;
const STANDARD_AGE_MONTHS = 65 * MONTHS_PER_YEAR;
const EARLIEST_AGE_MONTHS = 60 * MONTHS_PER_YEAR;
const MODERN_EARLY_CUTOFF = "1962-04-02";
const EXTENDED_DEFERRAL_CUTOFF = "1952-04-02";

function validIsoDate(value) {
  const s = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : s;
}

export function japanPublicPensionRulesForBirthDate(birthDate) {
  const iso = validIsoDate(birthDate);
  return {
    birthDateKnown: !!iso,
    earlyReductionPerMonth: iso && iso < MODERN_EARLY_CUTOFF ? 0.005 : 0.004,
    latestClaimAge: iso && iso < EXTENDED_DEFERRAL_CUTOFF ? 70 : 75,
  };
}

export function ageToWholeMonths(age, fallback = 65) {
  const raw = Number(age);
  const safe = Number.isFinite(raw) ? raw : Number(fallback);
  return Math.round(Math.max(0, safe) * MONTHS_PER_YEAR);
}

export function calculateJapanPublicPension({ monthlyAt65 = 0, claimAge = 65, birthDate = "" } = {}) {
  const rules = japanPublicPensionRulesForBirthDate(birthDate);
  const latestMonths = rules.latestClaimAge * MONTHS_PER_YEAR;
  const requestedMonths = ageToWholeMonths(claimAge, 65);
  const claimMonths = Math.min(latestMonths, Math.max(EARLIEST_AGE_MONTHS, requestedMonths));
  const monthDelta = claimMonths - STANDARD_AGE_MONTHS;
  const rate = monthDelta < 0
    ? monthDelta * rules.earlyReductionPerMonth
    : monthDelta * 0.007;
  const factor = Math.max(0, 1 + rate);
  const base = Math.max(0, Number(monthlyAt65) || 0);

  return {
    ...rules,
    requestedClaimAge: requestedMonths / MONTHS_PER_YEAR,
    claimAge: claimMonths / MONTHS_PER_YEAR,
    claimYears: Math.floor(claimMonths / MONTHS_PER_YEAR),
    claimMonths: claimMonths % MONTHS_PER_YEAR,
    adjustmentRate: rate,
    factor,
    monthlyAmount: base * factor,
  };
}

export function isLegacyJapanPublicPensionName(name) {
  const s = String(name || "").trim().replace(/[\s　]/g, "");
  return [
    "公的年金",
    "老齢年金",
    "老齢基礎年金+老齢厚生年金",
    "老齢基礎年金＋老齢厚生年金",
    "国民年金+厚生年金",
    "国民年金＋厚生年金",
  ].includes(s);
}
