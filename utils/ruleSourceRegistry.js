// 制度更新センターが監視する公式情報源。
// 「公式ページが変わった」ことと「計算ルールを変更する」ことは分離する。
// ページ変更は要確認通知だけを出し、承認可能な制度差分は rules-updates.json / BUILTIN_RULE_UPDATES で別管理する。
export const RULE_SOURCE_REGISTRY = [
  // Japan
  { id: "JP-FSA-NISA", country: "JP", category: "nisa", labelJa: "NISA", labelEn: "NISA", sourceLabel: "金融庁 NISA特設ウェブサイト「NISAを知る」", url: "https://www.fsa.go.jp/policy/nisa2/know/index.html" },
  { id: "JP-MHLW-IDECO-REFORM", country: "JP", category: "ideco", labelJa: "iDeCo", labelEn: "iDeCo", sourceLabel: "厚生労働省「2025年の制度改正」", url: "https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/nenkin/nenkin/kyoshutsu/2025kaisei.html" },
  { id: "JP-JPS-PUBLIC-PENSION", country: "JP", category: "publicPension", labelJa: "公的年金", labelEn: "Public pension", sourceLabel: "日本年金機構「年金額等の改定」", url: "https://www.nenkin.go.jp/tokusetsu/nenkingakutou_kaitei.html" },
  { id: "JP-JPS-PENSION-EARLY", country: "JP", category: "publicPension", labelJa: "公的年金（繰上げ）", labelEn: "Public pension (early claim)", sourceLabel: "日本年金機構「年金の繰上げ受給」", url: "https://www.nenkin.go.jp/service/jukyu/seido/roureinenkin/kuriage-kurisage/20140421-01.html" },
  { id: "JP-JPS-PENSION-DEFER", country: "JP", category: "publicPension", labelJa: "公的年金（繰下げ）", labelEn: "Public pension (deferral)", sourceLabel: "日本年金機構「年金の繰下げ受給」", url: "https://www.nenkin.go.jp/service/jukyu/seido/roureinenkin/kuriage-kurisage/20140421-02.html" },

  // United States
  { id: "US-IRS-401K-IRA", country: "US", category: "investment", labelJa: "401(k)・IRA", labelEn: "401(k) / IRA", sourceLabel: "IRS — Retirement plan contribution limits", url: "https://www.irs.gov/retirement-plans/plan-participant-employee/retirement-topics-contributions" },
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

  // Common-schema source coverage: every one of the five common sections has
  // at least one official source, even when the calculator itself is partial.
  { id: "JP-MHLW-HEALTH", country: "JP", category: "healthcare", labelJa: "医療", labelEn: "Healthcare", sourceLabel: "厚生労働省 — 医療保険制度", url: "https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/kenkou_iryou/iryouhoken/index.html" },
  { id: "JP-NTA-INCOME-TAX", country: "JP", category: "tax", labelJa: "所得税", labelEn: "Income tax", sourceLabel: "国税庁 — 所得税の税率", url: "https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2260.htm" },
  { id: "JP-NTA-INHERITANCE", country: "JP", category: "estate", labelJa: "相続税", labelEn: "Inheritance tax", sourceLabel: "国税庁 — 相続税", url: "https://www.nta.go.jp/taxes/shiraberu/taxanswer/sozoku/4155.htm" },

  { id: "US-IRS-INCOME-TAX", country: "US", category: "tax", labelJa: "連邦所得税", labelEn: "Federal income tax", sourceLabel: "IRS — Inflation adjustments for tax items", url: "https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments" },
  { id: "US-IRS-ESTATE", country: "US", category: "estate", labelJa: "Estate tax", labelEn: "Estate tax", sourceLabel: "IRS — Estate Tax", url: "https://www.irs.gov/businesses/small-businesses-self-employed/estate-tax" },

  { id: "GB-NHS-HEALTH-COSTS", country: "GB", category: "healthcare", labelJa: "NHS医療費", labelEn: "NHS health costs", sourceLabel: "NHS — Help with health costs", url: "https://www.nhs.uk/nhs-services/help-with-health-costs/" },
  { id: "GB-HMRC-INCOME-TAX", country: "GB", category: "tax", labelJa: "所得税", labelEn: "Income Tax", sourceLabel: "GOV.UK — Income Tax rates and Personal Allowances", url: "https://www.gov.uk/income-tax-rates" },
  { id: "GB-HMRC-IHT", country: "GB", category: "estate", labelJa: "相続税", labelEn: "Inheritance Tax", sourceLabel: "GOV.UK — Inheritance Tax", url: "https://www.gov.uk/inheritance-tax" },

  { id: "CA-HEALTH-COVERAGE", country: "CA", category: "healthcare", labelJa: "公的医療", labelEn: "Public healthcare", sourceLabel: "Health Canada — Canada's health care system", url: "https://www.canada.ca/en/health-canada/services/canada-health-care-system.html" },
  { id: "CA-CRA-INCOME-TAX", country: "CA", category: "tax", labelJa: "連邦所得税", labelEn: "Federal income tax", sourceLabel: "Canada Revenue Agency — Tax rates and income brackets", url: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/frequently-asked-questions-individuals/canadian-income-tax-rates-individuals-current-previous-years.html" },
  { id: "CA-CRA-DEATH", country: "CA", category: "estate", labelJa: "死亡時課税", labelEn: "Tax at death", sourceLabel: "Canada Revenue Agency — Taxable capital gains for someone who died", url: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/life-events/doing-taxes-someone-died/prepare-returns/report-income/capital-gains.html" },

  { id: "AU-ATO-INVESTMENT", country: "AU", category: "investment", labelJa: "投資・Super", labelEn: "Investment / Super", sourceLabel: "Australian Taxation Office — Super contribution caps", url: "https://www.ato.gov.au/tax-rates-and-codes/key-superannuation-rates-and-thresholds" },
  { id: "AU-HEALTH-MEDICARE", country: "AU", category: "healthcare", labelJa: "Medicare", labelEn: "Medicare", sourceLabel: "Australian Government Department of Health — Medicare Safety Nets", url: "https://www.health.gov.au/topics/medicare/about/safety-nets" },
  { id: "AU-ATO-DECEASED-ESTATES", country: "AU", category: "estate", labelJa: "死亡・相続税務", labelEn: "Deceased estates", sourceLabel: "Australian Taxation Office — Deceased estates", url: "https://www.ato.gov.au/individuals-and-families/deceased-estates" },
];

export function getRuleSourcesForCountry(country) {
  const code = String(country || "").trim().toUpperCase();
  return RULE_SOURCE_REGISTRY.filter((source) => source.country === code);
}
