from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly 1 match, found {count}")
    p.write_text(text.replace(old, new, 1))


replace_once(
    "countryRules/US.js",
    '''    // 満額（FRA）受給額に対する倍率を、実際に受給を開始する年齢から計算する（月単位で正確に計算）。
    getClaimingFactor(claimAgeInYears) {
      const ss = this.socialSecurity;
      const fraMonths = ss.fullRetirementAge * 12;
      const claimMonths = Math.round(claimAgeInYears * 12);
      const diffMonths = claimMonths - fraMonths;
      if (diffMonths >= 0) {
        // 繰下げ受給（70歳＝FRA+36ヶ月で頭打ち）
        const cappedMonths = Math.min(diffMonths, (ss.latestClaimAge - ss.fullRetirementAge) * 12);
        return 1 + cappedMonths * ss.delayedCreditPerMonth;
      }
      // 早期受給
      const monthsEarly = Math.min(-diffMonths, (ss.fullRetirementAge - ss.earliestClaimAge) * 12);
      const first36 = Math.min(monthsEarly, 36);
      const beyond36 = Math.max(0, monthsEarly - 36);
      const reduction = first36 * ss.earlyReductionPerMonthFirst36 + beyond36 * ss.earlyReductionPerMonthBeyond36;
      return 1 - reduction;
    },
    // 月額の実受給額 = FRA時点の月額（PIA、ユーザー入力） × 受給開始年齢に応じた倍率
    getMonthlyBenefit(piaMonthly, claimAgeInYears) {
      const pia = Math.max(0, Number(piaMonthly) || 0);
      const age = Number.isFinite(Number(claimAgeInYears))
        ? Number(claimAgeInYears)
        : this.socialSecurity.fullRetirementAge;
      return pia * this.getClaimingFactor(age);
    },''',
    '''    // 生年ごとのFull Retirement Age（FRA）。SSAの法定表を月単位で保持する。
    // 1938〜1942年と1955〜1959年は2か月刻みで引き上げられる。
    getFullRetirementAgeMonths(birthDateOrYear) {
      const raw = String(birthDateOrYear ?? "").trim();
      const parsedYear = /^\\d{4}/.test(raw) ? Number(raw.slice(0, 4)) : Number(birthDateOrYear);
      if (!Number.isFinite(parsedYear) || parsedYear <= 0) return this.socialSecurity.fullRetirementAge * 12;
      const year = Math.floor(parsedYear);
      if (year <= 1937) return 65 * 12;
      if (year <= 1942) return 65 * 12 + (year - 1937) * 2;
      if (year <= 1954) return 66 * 12;
      if (year <= 1959) return 66 * 12 + (year - 1954) * 2;
      return 67 * 12;
    },
    getFullRetirementAge(birthDateOrYear) {
      return this.getFullRetirementAgeMonths(birthDateOrYear) / 12;
    },
    // 満額（FRA）受給額に対する倍率を、実際に受給を開始する年齢から計算する。
    // FRAは生年別に決まるため、固定67歳ではなく生年月日（または生年）を必ず考慮する。
    getClaimingFactor(claimAgeInYears, birthDateOrYear) {
      const ss = this.socialSecurity;
      const fraMonths = this.getFullRetirementAgeMonths(birthDateOrYear);
      const claimMonths = Math.round((Number(claimAgeInYears) || 0) * 12);
      const diffMonths = claimMonths - fraMonths;
      if (diffMonths >= 0) {
        const cappedMonths = Math.min(diffMonths, ss.latestClaimAge * 12 - fraMonths);
        return 1 + Math.max(0, cappedMonths) * ss.delayedCreditPerMonth;
      }
      const monthsEarly = Math.min(-diffMonths, Math.max(0, fraMonths - ss.earliestClaimAge * 12));
      const first36 = Math.min(monthsEarly, 36);
      const beyond36 = Math.max(0, monthsEarly - 36);
      const reduction = first36 * ss.earlyReductionPerMonthFirst36 + beyond36 * ss.earlyReductionPerMonthBeyond36;
      return 1 - reduction;
    },
    // 月額の実受給額 = FRA時点の月額（PIA、ユーザー入力） × 受給開始年齢に応じた倍率
    getMonthlyBenefit(piaMonthly, claimAgeInYears, birthDateOrYear) {
      const pia = Math.max(0, Number(piaMonthly) || 0);
      const defaultFra = this.getFullRetirementAge(birthDateOrYear);
      const age = Number.isFinite(Number(claimAgeInYears))
        ? Number(claimAgeInYears)
        : defaultFra;
      return pia * this.getClaimingFactor(age, birthDateOrYear);
    },'''
)

replace_once(
    "App.jsx",
    '''  const usClaimAge = Number(inputs.usInvestment.socialSecurity.claimAge) || 67;
  const usPiaMonthly = Number(inputs.usInvestment.socialSecurity.piaMonthly) || 0;
  const usSSMonthlyBenefit = (country === "US" && rules.retirement.implemented)
    ? rules.retirement.getMonthlyBenefit(usPiaMonthly, usClaimAge)
    : 0;''',
    '''  const usFullRetirementAge = (country === "US" && rules.retirement.implemented)
    ? rules.retirement.getFullRetirementAge(inputs.birthDate)
    : 67;
  const usClaimAge = Number(inputs.usInvestment.socialSecurity.claimAge) || usFullRetirementAge;
  const usPiaMonthly = Number(inputs.usInvestment.socialSecurity.piaMonthly) || 0;
  const usSSMonthlyBenefit = (country === "US" && rules.retirement.implemented)
    ? rules.retirement.getMonthlyBenefit(usPiaMonthly, usClaimAge, inputs.birthDate)
    : 0;'''
)

replace_once(
    "App.jsx",
    'function USRetirementPanel({ usInvestment, onUpdateSS, onUpdate, retirementRules, claimAge, ssMonthly, ssAnnual, expensesAnnual, healthcareAnnual, withdrawalNeeded, incomeSurplus }) {',
    'function USRetirementPanel({ usInvestment, onUpdateSS, onUpdate, retirementRules, claimAge, fullRetirementAge, ssMonthly, ssAnnual, expensesAnnual, healthcareAnnual, withdrawalNeeded, incomeSurplus }) {'
)

replace_once(
    "App.jsx",
    '      <div className="stat-sub">{t("usFraNote", { age: ss.fullRetirementAge })}</div>',
    '      <div className="stat-sub">{t("usFraNote", { age: fullRetirementAge })}</div>'
)

replace_once(
    "App.jsx",
    '''              claimAge={usClaimAge}
              ssMonthly={usSSMonthlyBenefit}''',
    '''              claimAge={usClaimAge}
              fullRetirementAge={usFullRetirementAge}
              ssMonthly={usSSMonthlyBenefit}'''
)
