// ============================================================================
// countryRules/JP.js
// App.jsx から国別ルール定義（JP_COUNTRY_RULES）をそのまま切り出したファイル。
// 数値・関数・コメントは一切変更していない（挙動・計算結果は完全に同一）。
// ============================================================================

// ---------- countryRules/JP.js 相当 ----------
// 現行の新NISA制度（2024年〜）・iDeCo・医療費モデル。既存の計算結果と完全に同一。
export const JP_COUNTRY_RULES = {
  meta: {
    verifiedAsOf: "2026-08-17",
    effectivePeriod: "2026年8月時点",
    updateCycle: "制度改正時＋毎年1月/4月/12月の定期確認",
    noteJa: "2026年8月17日に現行制度を確認。2026年12月1日施行予定のiDeCo改正は予定制度として別管理します。",
    noteEn: "Rules verified on 17 Aug 2026. The iDeCo changes scheduled for 1 Dec 2026 are tracked separately as future rules.",
  },
  investment: {
    implemented: true,
    // つみたて投資枠 年間上限 / 成長投資枠 年間上限 / 成長投資枠 生涯（簿価）上限 / 総枠 生涯（簿価）上限
    annualInstallmentLimit: 1200000,
    annualGrowthLimit: 2400000,
    growthLifetimeLimit: 12000000,
    taxFreeInvestmentLimit: 18000000,
    accountTypes: ["tsumitate", "growth", "lumpSum"], // つみたて投資枠・成長投資枠・一括投資
  },
  retirement: {
    implemented: true,
    accountTypes: ["ideco"],
    hasFixedContributionLimit: true,
    effectiveAsOf: "2026-08-17",
    // 2026年8月時点の現行上限（月額）。企業年金加入者は、2万円かつ
    // 企業型DC事業主掛金＋DB等の他制度掛金相当額との合計が5.5万円以内。
    currentMonthlyLimits: {
      firstInsured: 68000,
      voluntaryInsured: 68000,
      employeeNoCorporatePension: 23000,
      employeeWithCorporatePensionMax: 20000,
      thirdInsured: 23000,
      corporatePensionCombinedCeiling: 55000,
    },
    contributionCategories: [
      "firstInsured", "employeeNoCorporatePension", "employeeWithCorporatePension", "thirdInsured", "voluntaryInsured",
    ],
    getMonthlyContributionLimit(category, otherPlanMonthlyContribution = 0) {
      const l = this.currentMonthlyLimits;
      const other = Math.max(0, Number(otherPlanMonthlyContribution) || 0);
      if (category === "firstInsured") return l.firstInsured;
      if (category === "voluntaryInsured") return l.voluntaryInsured;
      if (category === "employeeWithCorporatePension") {
        return Math.max(0, Math.min(l.employeeWithCorporatePensionMax, l.corporatePensionCombinedCeiling - other));
      }
      if (category === "thirdInsured") return l.thirdInsured;
      return l.employeeNoCorporatePension;
    },
    // 2026年12月1日施行予定。現時点の計算にはまだ適用しない。
    scheduledFrom20261201: {
      effectiveDate: "2026-12-01",
      firstInsuredCombinedWithNationalPensionFund: 75000,
      secondInsuredCommonCeiling: 62000,
      note: "MHLW 2025 pension reform; future rule, not active before 2026-12-01",
    },
  },
  healthcare: {
    implemented: true,
    // 高額療養費制度を考慮した自己負担額を、年代別にユーザーが直接入力するモデル。
    model: "selfInputByAgeBracket",
  },
  tax: {
    implemented: true,
    // iDeCoの節税額（概算）は年収から推定した実効税率で簡易計算する。
    model: "estimatedMarginalRateFromIncome",
  },
  labels: {
    investmentNote: null, // JPは実際のNISA制度の説明文（TRANSLATIONS側）をそのまま使うため未使用
    retirementNote: null,
    healthcareNote: null,
    taxNote: null,
  },
  defaults: {},
};
