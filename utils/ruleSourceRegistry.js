// 制度更新センターが監視する公式情報源。
// 「公式ページが変わった」ことと「計算ルールを変更する」ことは分離する。
// ページ変更は要確認通知だけを出し、承認可能な制度差分は rules-updates.json / BUILTIN_RULE_UPDATES で別管理する。
export const RULE_SOURCE_REGISTRY = [
  // Japan
  { id: "JP-FSA-NISA", country: "JP", category: "nisa", labelJa: "NISA", labelEn: "NISA", sourceLabel: "金融庁 NISA特設ウェブサイト「NISAを知る」", url: "https://www.fsa.go.jp/policy/nisa2/know/index.html" },
  { id: "JP-MHLW-IDECO-REFORM", country: "JP", category: "ideco", labelJa: "iDeCo", labelEn: "iDeCo", sourceLabel: "厚生労働省「2025年の制度改正」", url: "https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/nenkin/nenkin/kyoshutsu/2025kaisei.html" },
  { id: "JP-JPS-PUBLIC-PENSION", country: "JP", category: "publicPension", labelJa: "公的年金", labelEn: "Public pension", sourceLabel: "日本年金機構「年金額等の改定」", url: "https://www.nenkin.go.jp/tokusetsu/nenkingakutou_kaitei.html" },

  // United States
  { id: "US-IRS-RETIREMENT-LIMITS", country: "US", category: "retirement", labelJa: "401(k)・IRA", labelEn: "401(k) / IRA", sourceLabel: "IRS — COLA increases for retirement plan limits", url: "https://www.irs.gov/retirement-plans/cola-increases-for-dollar-limitations-on-benefits-and-contributions" },
  { id: "US-SSA-COLA", country: "US", category: "publicPension", labelJa: "Social Security", labelEn: "Social Security", sourceLabel: "Social Security Administration — Latest COLA", url: "https://www.ssa.gov/OACT/COLA/latestCOLA.html" },
  { id: "US-CMS-MEDICARE", country: "US", category: "healthcare", labelJa: "Medicare", labelEn: "Medicare", sourceLabel: "CMS — Medicare premiums and costs", url: "https://www.medicare.gov/basics/costs/medicare-costs" },

  // United Kingdom
  { id: "GB-GOV-ISA", country: "GB", category: "investment", labelJa: "ISA", labelEn: "ISA", sourceLabel: "GOV.UK — Individual Savings Accounts (ISAs)", url: "https://www.gov.uk/individual-savings-accounts" },
  { id: "GB-GOV-PENSION-TAX", country: "GB", category: "retirement", labelJa: "SIPP・年金税制", labelEn: "SIPP / pension tax", sourceLabel: "GOV.UK — Tax on your private pension contributions", url: "https://www.gov.uk/tax-on-your-private-pension/pension-tax-relief" },
  { id: "GB-GOV-STATE-PENSION", country: "GB", category: "publicPension", labelJa: "State Pension", labelEn: "State Pension", sourceLabel: "GOV.UK — The new State Pension", url: "https://www.gov.uk/new-state-pension" },

  // Canada
  { id: "CA-CRA-TFSA", country: "CA", category: "investment", labelJa: "TFSA", labelEn: "TFSA", sourceLabel: "Canada Revenue Agency — Tax-Free Savings Account", url: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/tax-free-savings-account.html" },
  { id: "CA-CRA-RRSP", country: "CA", category: "retirement", labelJa: "RRSP", labelEn: "RRSP", sourceLabel: "Canada Revenue Agency — RRSP", url: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/rrsps-related-plans.html" },
  { id: "CA-SERVICE-PENSIONS", country: "CA", category: "publicPension", labelJa: "CPP・OAS", labelEn: "CPP / OAS", sourceLabel: "Government of Canada — Public pensions", url: "https://www.canada.ca/en/services/benefits/publicpensions.html" },

  // Australia
  { id: "AU-ATO-SUPER-CAPS", country: "AU", category: "retirement", labelJa: "Superannuation", labelEn: "Superannuation", sourceLabel: "Australian Taxation Office — Key superannuation rates and thresholds", url: "https://www.ato.gov.au/tax-rates-and-codes/key-superannuation-rates-and-thresholds" },
  { id: "AU-SA-AGE-PENSION", country: "AU", category: "publicPension", labelJa: "Age Pension", labelEn: "Age Pension", sourceLabel: "Services Australia — Age Pension", url: "https://www.servicesaustralia.gov.au/age-pension" },
  { id: "AU-ATO-TAX-RATES", country: "AU", category: "tax", labelJa: "所得税", labelEn: "Income tax", sourceLabel: "Australian Taxation Office — Tax rates for Australian residents", url: "https://www.ato.gov.au/tax-rates-and-codes/tax-rates-australian-residents" },
];

export function getRuleSourcesForCountry(country) {
  return RULE_SOURCE_REGISTRY.filter((source) => source.country === country);
}
