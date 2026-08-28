from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly 1 match, found {count}")
    p.write_text(text.replace(old, new, 1))


replace_once(
    "countryRules/AU.js",
    '''    // Preservation age：Superにアクセスできる最低年齢。1964年7月1日以降生まれは60歳。\n    // 60歳＋「条件を満たす退職」で引き出し可能。65歳になれば就労状況に関わらず無条件で引き出せる。\n    preservationAge: 60,\n    unrestrictedAccessAge: 65,''',
    '''    // Preservation age は生年月日で55〜60歳に分かれる。\n    // 1964年7月1日以降生まれは60歳。古い生年はATOの移行表を使う。\n    preservationAge: 60,\n    unrestrictedAccessAge: 65,\n    getPreservationAge(birthDate) {\n      const raw = String(birthDate || "").trim();\n      const m = /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(raw);\n      if (!m) return this.preservationAge;\n      const key = Number(`${m[1]}${m[2]}${m[3]}`);\n      if (!Number.isFinite(key)) return this.preservationAge;\n      if (key < 19600701) return 55;\n      if (key < 19610701) return 56;\n      if (key < 19620701) return 57;\n      if (key < 19630701) return 58;\n      if (key < 19640701) return 59;\n      return 60;\n    },'''
)

replace_once(
    "countryRules/AU.js",
    '''    canAccessSuper(age) {\n      return (Number(age) || 0) >= this.preservationAge;\n    },''',
    '''    canAccessSuper(age, birthDate = null) {\n      return (Number(age) || 0) >= this.getPreservationAge(birthDate);\n    },'''
)

replace_once(
    "countryRules/AU.js",
    '''    canAccessSuperAt(age, retired) {\n      const a = Number(age) || 0;\n      if (a >= this.unrestrictedAccessAge) return true;\n      return a >= this.preservationAge && !!retired;\n    },''',
    '''    canAccessSuperAt(age, retired, birthDate = null) {\n      const a = Number(age) || 0;\n      if (a >= this.unrestrictedAccessAge) return true;\n      return a >= this.getPreservationAge(birthDate) && !!retired;\n    },'''
)

replace_once(
    "countryRules/AU.js",
    '''      downsizerEligible, downsizerContribution,\n    }) {''',
    '''      downsizerEligible, downsizerContribution, birthDate,\n    }) {'''
)

replace_once(
    "countryRules/AU.js",
    '''        const inRetirementPhase = retired && this.canAccessSuper(age);\n        // 実際に取り崩せるか：60〜64歳は退職が条件、65歳以降は無条件。\n        const superAccessible = this.canAccessSuperAt(age, retired);''',
    '''        const inRetirementPhase = retired && this.canAccessSuper(age, birthDate);\n        // 実際に取り崩せるか：preservation age〜64歳は退職が条件、65歳以降は無条件。\n        const superAccessible = this.canAccessSuperAt(age, retired, birthDate);'''
)

replace_once(
    "countryRules/AU.js",
    '''    splitAssets(age, accounts) {\n      const v = {};\n      this.accountTypes.forEach((k) => { v[k] = Number((accounts[k] || {}).currentValue) || 0; });\n      const accessible = this.canAccessSuper(age);''',
    '''    splitAssets(age, accounts, birthDate = null) {\n      const v = {};\n      this.accountTypes.forEach((k) => { v[k] = Number((accounts[k] || {}).currentValue) || 0; });\n      const accessible = this.canAccessSuper(age, birthDate);'''
)

replace_once(
    "App.jsx",
    '''      accounts: inputs.auInvestment,\n      annualWithdrawalNeeded: auWithdrawalNeeded,\n      annualSalary: inputs.auInvestment.annualSalary,''',
    '''      accounts: inputs.auInvestment,\n      annualWithdrawalNeeded: auWithdrawalNeeded,\n      birthDate: inputs.birthDate,\n      annualSalary: inputs.auInvestment.annualSalary,'''
)

replace_once(
    "App.jsx",
    '''  }, [simulationReady, country, rules, effectiveCurrentAge, inputs.retireAge, inputs.deathAge, inputs.auInvestment, auWithdrawalNeeded, auDiv293Tax, auDiv293PaidFrom, auListoAnnual, auCoContributionAnnual]);''',
    '''  }, [simulationReady, country, rules, effectiveCurrentAge, inputs.retireAge, inputs.deathAge, inputs.auInvestment, inputs.birthDate, auWithdrawalNeeded, auDiv293Tax, auDiv293PaidFrom, auListoAnnual, auCoContributionAnnual]);'''
)

replace_once(
    "App.jsx",
    '''  const auAssetSplit = (country === "AU" && rules.investment.implemented)\n    ? rules.investment.splitAssets(effectiveCurrentAge, inputs.auInvestment)''',
    '''  const auAssetSplit = (country === "AU" && rules.investment.implemented)\n    ? rules.investment.splitAssets(effectiveCurrentAge, inputs.auInvestment, inputs.birthDate)'''
)

replace_once(
    "utils/buildPlanInput.js",
    '''        pool.accessAge = inv.preservationAge; // preservation age まで取り崩せない\n        // 60〜64歳は condition of release（退職等）が必要、65歳以降は無条件。\n        // simulateGrowth の canAccessSuperAt と同じ規則をエンジンにも渡す。\n        pool.unconditionalAccessAge = inv.unrestrictedAccessAge;\n        pool.earningsTaxPct = earnTax * 100;  // 積立期の運用益に15%課税\n        pool.minimumDrawdown = (age, bal) =>\n          (inv.canAccessSuper(age) ? inv.getMinimumDrawdown(age, bal) : 0);''',
    '''        const preservationAge = inv.getPreservationAge(inputs.birthDate);\n        pool.accessAge = preservationAge; // 生年月日別 preservation age まで取り崩せない\n        // preservation age〜64歳は condition of release（退職等）が必要、65歳以降は無条件。\n        // simulateGrowth と同じ生年月日ルールを統合エンジンにも渡す。\n        pool.unconditionalAccessAge = inv.unrestrictedAccessAge;\n        pool.earningsTaxPct = earnTax * 100;  // 積立期の運用益に15%課税\n        pool.minimumDrawdown = (age, bal) =>\n          (inv.canAccessSuper(age, inputs.birthDate) ? inv.getMinimumDrawdown(age, bal) : 0);'''
)

p = Path("auBoundaries.test.js")
text = p.read_text()
marker = "AU audit: preservation age by birth date"
if marker not in text:
    text += '''\n\n// AU audit: preservation age by birth date\ndescribe("AU境界：生年月日別 preservation age", () => {\n  it("ATO移行表どおり55〜60歳を返す", () => {\n    expect(inv.getPreservationAge("1959-12-31")).toBe(55);\n    expect(inv.getPreservationAge("1960-07-01")).toBe(56);\n    expect(inv.getPreservationAge("1961-07-01")).toBe(57);\n    expect(inv.getPreservationAge("1962-07-01")).toBe(58);\n    expect(inv.getPreservationAge("1963-07-01")).toBe(59);\n    expect(inv.getPreservationAge("1964-07-01")).toBe(60);\n  });\n\n  it("旧生年では固定60歳ではなく本人のpreservation ageでアクセス判定する", () => {\n    expect(inv.canAccessSuper(55, "1959-12-31")).toBe(true);\n    expect(inv.canAccessSuper(55, "1960-07-01")).toBe(false);\n    expect(inv.canAccessSuperAt(56, true, "1960-07-01")).toBe(true);\n    expect(inv.canAccessSuperAt(56, false, "1960-07-01")).toBe(false);\n    expect(inv.canAccessSuperAt(65, false, "1964-07-01")).toBe(true);\n  });\n\n  it("資産区分も生年月日別preservation ageを使う", () => {\n    const a = accounts({ superannuation: 10000 });\n    expect(inv.splitAssets(55, a, "1959-12-31").isAccessibleAge).toBe(true);\n    expect(inv.splitAssets(55, a, "1960-07-01").isAccessibleAge).toBe(false);\n  });\n});\n'''
    p.write_text(text)
