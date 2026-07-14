// ============================================================================
// translations/enGB.js
// 英国向け表示差分（EN_GB_OVERRIDES）。App.jsx からそのまま切り出したもので、
// キー名・訳文は一文字も変更していない。
// ============================================================================

// ============================================================================
// ---------- イギリス向け表示差分（en-GB） ----------
// アメリカ版の英語辞書（en）をベースに、米国特有の表現だけをイギリス向けに
// 上書きする差分オブジェクト。ここに列挙していないキーはすべて en の値を
// そのまま継承するため、二重管理を避けられる。
// 例：Retirement Account → Pension Account、Social Security → State Pension、
//     Individual Stocks → Stocks & Shares、Bank Deposits → Cash Savings。
// ============================================================================
export const EN_GB_OVERRIDES = {
  disclaimerBanner: "Disclaimer: This app is provided for information and simulation purposes only. It does not constitute tax, investment, or legal advice. Allowances and tax rates can change, and all figures are estimates based on the assumptions you enter. Please consult a qualified professional \u2014 such as an FCA-regulated financial adviser or an accountant \u2014 before acting on any result.",
  localePreviewWarning: "UK edition: ISA and pension allowances, State Pension, Income Tax, Dividend Tax and Capital Gains Tax use GOV.UK figures for the 2026/27 tax year (England, Wales & Northern Ireland). Scottish Income Tax, National Insurance and Inheritance Tax are not implemented. This is a planning tool, not financial advice.",
  appSubtitle: "Investment Accounts × Retirement Assets × Pensions × Healthcare Costs × Inheritance Planning — Integrated Simulation",
  idecoCurrentValueAutoLabel: "Current Pension Value (Auto-calculated)",
  idecoIntroNote: "A SIPP or Personal Pension is a retirement savings account. In principle, funds cannot be withdrawn before the eligible age. Investment returns are not guaranteed. The tax savings shown are estimates.",
  payoutAccountingNote: "After payout begins, a lump-sum payment is added once, in the year received, to Current Spendable Assets. Annuity payments are added to Annual Income during the payout period and offset against the living-cost shortfall. Once the payout period ends, income from the pension stops.",
  pensionNamePlaceholder: "e.g. State Pension, Workplace Pension",
  pensionSourcesLabel: "Expected Pension Income (State Pension, workplace pension, etc. — add as many as you like)",
  legendStocks: "Stocks & Shares",
  statStockValueNowLabel: "Stocks & Shares Holdings (Current)",
  stockCurrentTotalLabel: "Stocks & Shares Current Value (Total)",
  stockReturnLabel: "Expected Annual Return Until {age} (All Stocks & Shares)",
  stockWatchlistTitle: "Stocks & Shares Holdings (enter shares and value)",
  statIdecoAssetsLabel: "Investment Assets: Pension Account",
  statRetirementOnlyAssetsLabel: "Retirement-Only Assets (Pension Account)",
  legendIdecoAssets: "Pension Account",
  netWorthChartTitle: "Net Worth Over Time \u2014 Investments + Gold + Cash + Stocks & Shares + Private Pension + Pension Account \u2212 Loans \u2212 Cumulative Insurance Premiums ({currentAge} \u2013 {deathAge})",
  legendBankDeposits: "Cash Savings",
  bankTotalNowLabel: "Total Cash Savings (Current)",
  statBankTotalNowLabel: "Total Cash Savings (Current)",
  statBankAtRetireLabel: "Total Cash Savings — at {age}",
  bankBreakdownChartTitle: "Cash Savings Balance by Bank — Projected by Age (Current / {retireAge} / {deathAge})",
  goldPriceRefNote: "The gold price uses the retail spot price as of July 2026 (about £125/g) as a reference. Actual prices fluctuate daily, so replace this with the latest price when using the tool.",
  growthScheduleExampleNote: "Example: you can split growth allocation contributions into ranges by year and month, such as \u201c50y0m to 55y11m: \u00a31,500/month\u201d and \u201c56y0m to 65y0m: \u00a3500/month.\u201d Overlapping ranges are added together.",
  scheduleExampleNote: "Example: you can split contributions into ranges by year and month, such as \u201c58y0m to 61y11m: \u00a31,100/month\u201d and \u201c62y0m to 65y0m: \u00a3900/month.\u201d Overlapping ranges are added together.",
  nisaCapSummaryNote: "Annual caps: regular allocation \u00a312,000 (\u00a31,000/month), growth allocation \u00a324,000 (\u00a32,000/month). Lifetime limit is \u00a3180,000 total (up to \u00a3120,000 of which can be growth allocation). Once the limit is reached, the simulation assumes no further tax-advantaged investment.",
  statTsumitateRemainingSub: "Shares the \u00a3180,000 lifetime limit with growth allocation",
};
