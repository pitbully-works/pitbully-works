// ============================================================================
// countryRules/JP.js
// App.jsx から国別ルール定義（JP_COUNTRY_RULES）をそのまま切り出したファイル。
// 数値・関数・コメントは一切変更していない（挙動・計算結果は完全に同一）。
// ============================================================================

// ---------- countryRules/JP.js 相当 ----------
// 現行の新NISA制度（2024年〜）・iDeCo・医療費モデル。既存の計算結果と完全に同一。
export const JP_COUNTRY_RULES = {
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
    // iDeCo（個人型確定拠出年金）。拠出上限は加入区分により異なるため、現行仕様では
    // 画面から自由入力（ユーザーが自身の上限を把握している前提）としており、
    // アプリ側で固定の上限値は持たない。
    accountTypes: ["ideco"],
    hasFixedContributionLimit: false,
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
