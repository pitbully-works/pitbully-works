// Retirement-tax estimates for life-plan projection only.
// Deliberately simplified: users can override every estimate manually.
const n = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
const max0 = (v) => Math.max(0, n(v));

export function estimatePublicPensionTax(country, annualPension, age = 65) {
  const income = max0(annualPension);
  if (!income) return 0;
  switch (country) {
    case 'JP': { // public-pension deduction + rough national/local tax after basic deduction
      const pensionDeduction = age >= 65 ? 1100000 : 600000;
      const taxable = max0(income - pensionDeduction - 580000);
      return taxable * 0.15;
    }
    case 'US': { // Social Security only: low-income recipients commonly owe no federal tax; rough upper-band proxy
      const provisionalExcess = max0(income * 0.5 - 25000);
      const taxableBenefits = Math.min(income * 0.85, provisionalExcess * 2);
      return taxableBenefits * 0.12;
    }
    case 'GB': { // 2026/27 Personal Allowance £12,570; basic-rate proxy
      return max0(income - 12570) * 0.20;
    }
    case 'CA': { // federal/provincial combined rough proxy after a basic allowance
      return max0(income - 16000) * 0.20;
    }
    case 'AU': { // tax-free threshold + SAPTO effects are not modelled; intentionally rough
      return max0(income - 18200) * 0.16;
    }
    default: return 0;
  }
}

export function estimatePrivatePensionTax(country, plans = []) {
  const rate = ({ JP: 0.15, US: 0.12, GB: 0.20, CA: 0.20, AU: 0.16 })[country] ?? 0.15;
  return (plans || []).reduce((sum, pl) => {
    const contribYears = max0(n(pl.contribToAge) - n(pl.contribFromAge));
    const payoutYears = max0(n(pl.payoutToAge) - n(pl.payoutFromAge));
    const paid = max0(pl.monthlyContribution) * 12 * contribYears;
    const received = max0(pl.monthlyPayout) * 12 * payoutYears;
    if (!received || !payoutYears) return sum;
    const gainRatio = Math.min(1, max0(received - paid) / received);
    const annualTaxableGain = max0(pl.monthlyPayout) * 12 * gainRatio;
    return sum + annualTaxableGain * rate;
  }, 0);
}

export const RETIREMENT_TAX_BASIS = Object.freeze({
  JP: '2026',
  US: '2026',
  GB: '2026/27',
  CA: '2026',
  AU: '2026/27',
});

// Japan Late-Stage Elderly Healthcare (75+) 2026/27 national-average medical portion.
// This is deliberately a planning estimate, not a prefecture-specific premium calculation.
export const JP_SENIOR_MEDICAL_75_AVG_ANNUAL_2026 = 95875;

export function estimateJapanSeniorMedicalAnnual(setting) {
  if (setting && setting.mode === 'off') return 0;
  if (setting && setting.mode === 'manual') return max0(setting.manualAnnual);
  return JP_SENIOR_MEDICAL_75_AVG_ANNUAL_2026;
}

export function resolveTaxAmount(setting, autoAmount) {
  if (setting && setting.mode === 'manual') return max0(setting.manualAnnual);
  return max0(autoAmount);
}
