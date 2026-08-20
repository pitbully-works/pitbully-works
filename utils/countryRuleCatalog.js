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

function findRegistrySources(country, key) {
  const candidates = SOURCE_CATEGORY_CANDIDATES[key] || [key];
  return getRuleSourcesForCountry(country).filter((source) => candidates.includes(source.category));
}

function normalizeOfficialSources(section, registrySources) {
  const sources = [];
  const push = (url, label, origin) => {
    if (!url || sources.some((item) => item.url === url)) return;
    sources.push({ url, label: label || url, origin });
  };

  push(section?.sourceUrl, section?.sourceName, "section");
  if (section?.sourceUrls && typeof section.sourceUrls === "object") {
    for (const [name, url] of Object.entries(section.sourceUrls)) push(url, name, "section");
  }
  for (const source of registrySources) push(source.url, source.sourceLabel, "registry");
  return sources;
}

function normalizeLimitations(section, cov, status) {
  const explicit = Array.isArray(section?.notImplemented) ? section.notImplemented.filter(Boolean) : [];
  if (explicit.length > 0) return explicit;
  if (status === "partial") {
    const fallback = cov?.updateJa || cov?.updateEn;
    return fallback ? [fallback] : [];
  }
  return [];
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
    const registrySources = findRegistrySources(code, key);
    const labels = COUNTRY_RULE_SECTION_LABELS[key];
    const status = cov.status || (section?.implemented === true ? "implemented" : "notImplemented");
    const officialSources = normalizeOfficialSources(section, registrySources);
    const limitations = normalizeLimitations(section, cov, status);

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
      sourceName: section?.sourceName || registrySources[0]?.sourceLabel || null,
      sourceUrl: section?.sourceUrl || registrySources[0]?.url || null,
      sourceUrls: section?.sourceUrls || null,
      officialSources,
      officialSourceCount: officialSources.length,
      limitations,
      limitationCount: limitations.length,
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
      if (!Array.isArray(row.officialSources) || row.officialSources.length === 0) issues.push({ country, key: row.key, field: "officialSource" });
      if (row.status === "partial" && (!Array.isArray(row.limitations) || row.limitations.length === 0)) issues.push({ country, key: row.key, field: "limitations" });
    }
  }
  return issues;
}


export function summarizeCountryRuleCatalog(country) {
  const rows = buildCountryRuleCatalog(country);
  return {
    country: String(country || "").toUpperCase(),
    sectionCount: rows.length,
    implementedCount: rows.filter((row) => row.status === "implemented").length,
    partialCount: rows.filter((row) => row.status === "partial").length,
    notImplementedCount: rows.filter((row) => row.status === "notImplemented").length,
    officialSourceCount: rows.reduce((sum, row) => sum + row.officialSourceCount, 0),
    limitationCount: rows.reduce((sum, row) => sum + row.limitationCount, 0),
  };
}
