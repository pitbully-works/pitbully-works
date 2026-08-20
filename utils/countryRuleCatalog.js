import { COUNTRY_RULES } from "../countryRules/index.js";
import { getRuleSourcesForCountry } from "./ruleSourceRegistry.js";

// 5か国の制度データを、画面・監査・将来更新で同じ形に扱うための共通スキーマ。
// 各国固有の計算オブジェクト自体は変更せず、meta.coverage と各セクションの情報を
// 読み取り専用のカタログへ正規化する。これにより国ごとの実装差が UI に漏れない。
export const COUNTRY_RULE_SCHEMA_VERSION = 1;

export const COUNTRY_RULE_SECTION_KEYS = Object.freeze([
  "investment",
  "retirement",
  "healthcare",
  "tax",
  "estate",
]);

export const COUNTRY_RULE_SECTION_LABELS = Object.freeze({
  investment: { ja: "投資制度", en: "Investment" },
  retirement: { ja: "年金・退職口座", en: "Pension / retirement" },
  healthcare: { ja: "医療", en: "Healthcare" },
  tax: { ja: "税金", en: "Tax" },
  estate: { ja: "相続", en: "Estate" },
});

const SOURCE_CATEGORY_CANDIDATES = {
  investment: ["investment", "nisa"],
  retirement: ["retirement", "ideco", "publicPension"],
  healthcare: ["healthcare"],
  tax: ["tax"],
  estate: ["estate"],
};

function findRegistrySource(country, key) {
  const candidates = SOURCE_CATEGORY_CANDIDATES[key] || [key];
  return getRuleSourcesForCountry(country).find((source) => candidates.includes(source.category)) || null;
}

function coverageMap(rules) {
  return new Map((Array.isArray(rules?.meta?.coverage) ? rules.meta.coverage : []).map((item) => [item.key, item]));
}

export function buildCountryRuleCatalog(country, rules = COUNTRY_RULES[country]) {
  const code = String(country || "").toUpperCase();
  const coverage = coverageMap(rules);

  return COUNTRY_RULE_SECTION_KEYS.map((key) => {
    const cov = coverage.get(key) || {};
    const section = rules?.[key] || null;
    const registrySource = findRegistrySource(code, key);
    const labels = COUNTRY_RULE_SECTION_LABELS[key];
    const status = cov.status || (section?.implemented === true ? "implemented" : "notImplemented");

    return {
      schemaVersion: COUNTRY_RULE_SCHEMA_VERSION,
      country: code,
      key,
      labelJa: cov.labelJa || labels.ja,
      labelEn: cov.labelEn || labels.en,
      status,
      implemented: status !== "notImplemented" && section?.implemented !== false,
      effective: cov.effective || section?.effectiveTaxYear || section?.effectiveYear || rules?.meta?.effectivePeriod || null,
      lastUpdated: cov.lastUpdated || section?.lastUpdated || rules?.meta?.verifiedAsOf || null,
      updateJa: cov.updateJa || "",
      updateEn: cov.updateEn || "",
      sourceName: section?.sourceName || registrySource?.sourceLabel || null,
      sourceUrl: section?.sourceUrl || registrySource?.url || null,
      sourceUrls: section?.sourceUrls || null,
      notImplemented: Array.isArray(section?.notImplemented) ? [...section.notImplemented] : [],
      hasCalculationSection: !!section,
    };
  });
}

export function getAllCountryRuleCatalog() {
  return Object.fromEntries(
    Object.keys(COUNTRY_RULES).map((country) => [country, buildCountryRuleCatalog(country, COUNTRY_RULES[country])])
  );
}

export function auditCountryRuleCatalog() {
  const catalog = getAllCountryRuleCatalog();
  const issues = [];
  for (const [country, rows] of Object.entries(catalog)) {
    for (const row of rows) {
      if (!row.effective) issues.push({ country, key: row.key, field: "effective" });
      if (!row.lastUpdated) issues.push({ country, key: row.key, field: "lastUpdated" });
      if (!row.labelJa || !row.labelEn) issues.push({ country, key: row.key, field: "label" });
      if (!row.updateJa || !row.updateEn) issues.push({ country, key: row.key, field: "updateNote" });
    }
  }
  return issues;
}
