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
    coverage: [
      { key: "investment", labelJa: "投資制度", labelEn: "Investment", status: "implemented", effective: "2026年8月時点", lastUpdated: "2026-08-17", updateJa: "新NISAの年間・生涯上限を反映。0〜17歳向け制度は将来制度として別管理。", updateEn: "Current NISA annual and lifetime limits are active; the 0-17 scheme is tracked separately as a future rule." },
      { key: "retirement", labelJa: "年金・退職口座", labelEn: "Pension / retirement", status: "implemented", effective: "2026年8月時点", lastUpdated: "2026-08-17", updateJa: "現行iDeCo上限、公的年金の年度改定値、繰上げ・繰下げの現行率を反映。2026年12月施行予定改正は未適用。", updateEn: "Current iDeCo limits, annual public-pension reference figures, and current early/deferral claim rates are active; the Dec 2026 reform remains scheduled." },
      { key: "healthcare", labelJa: "医療", labelEn: "Healthcare", status: "implemented", effective: "2026年8月時点", lastUpdated: "2026-08-17", updateJa: "年代別の自己負担額を入力して反映する方式。", updateEn: "Healthcare is modelled from user-entered out-of-pocket costs by age band." },
      { key: "tax", labelJa: "税金", labelEn: "Tax", status: "partial", effective: "2026年8月時点", lastUpdated: "2026-08-17", updateJa: "老後シミュレーション向け概算税率を使用。確定申告計算ではありません。", updateEn: "Uses estimated effective/marginal rates for planning; it is not a tax-return calculator." },
      { key: "estate", labelJa: "相続", labelEn: "Estate", status: "partial", effective: "2026年8月時点", lastUpdated: "2026-08-17", updateJa: "相続予定額・相続目標を資産計画へ反映。相続税の自動計算は行いません。", updateEn: "Inheritance targets and planned amounts feed the life plan; inheritance tax is not automatically calculated." },
    ],
  },
  investment: {
    implemented: true,
    // つみたて投資枠 年間上限 / 成長投資枠 年間上限 / 成長投資枠 生涯（簿価）上限 / 総枠 生涯（簿価）上限
    annualInstallmentLimit: 1200000,
    annualGrowthLimit: 2400000,
    growthLifetimeLimit: 12000000,
    taxFreeInvestmentLimit: 18000000,
    // 18歳未満向けつみたて投資枠は2027年施行予定。承認・施行前は未適用。
    minorTsumitate: {
      eligibleFromAge: 18,
      annualLimit: 0,
      lifetimeLimit: 0,
    },
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
  publicPension: {
    // 法定の年度改定値は参照情報として保持する。個人の入力年金額を自動上書きしない。
    annualRevision: {
      fiscalYear: 2025,
      basicPensionPct: 0,
      employeesEarningsRelatedPct: 0,
      macroSlideBasicPct: 0,
      macroSlideEmployeesPct: 0,
      basicPensionFullMonthly: 69308,
      standardEmployeesPensionMonthly: 232784,
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
  estate: {
    implemented: true,
    // 日本版は相続予定額・相続目標を資産計画へ反映する入力モデル。
    // 相続税の自動計算は行わないことを構造上も明示し、coverage と実体を一致させる。
    model: "plannedInheritanceInput",
    automaticInheritanceTaxCalculation: false,
  },
  labels: {
    investmentNote: null, // JPは実際のNISA制度の説明文（TRANSLATIONS側）をそのまま使うため未使用
    retirementNote: null,
    healthcareNote: null,
    taxNote: null,
  },
  defaults: {},
};
