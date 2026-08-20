// 制度更新センター：計算本体と制度変更通知を分離する。
// 承認済みでも effectiveDate より前は計算へ適用しない。
export const RULE_UPDATE_STORAGE_KEY = "nisa-lifeplan-rule-updates-v1";

export const BUILTIN_RULE_UPDATES = [
  {
    id: "JP-IDECO-2026-12-01",
    country: "JP",
    category: "retirement",
    detectedAt: "2026-08-21",
    effectiveDate: "2026-12-01",
    titleJa: "iDeCo・企業型DC等の拠出限度額改正",
    titleEn: "iDeCo / corporate DC contribution limit reform",
    summaryJa: "2026年12月1日施行予定。第2号被保険者の共通拠出限度額は月6.2万円、第1号被保険者はiDeCoと国民年金基金の合算で月7.5万円へ引き上げられます。",
    summaryEn: "Scheduled for 1 Dec 2026. The common ceiling for Category 2 insured persons rises to JPY 62,000/month; the combined iDeCo/National Pension Fund ceiling for Category 1 rises to JPY 75,000/month.",
    sourceLabel: "厚生労働省「2025年の制度改正」",
    sourceUrl: "https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/nenkin/nenkin/kyoshutsu/2025kaisei.html",
    changes: [
      { labelJa: "第1号被保険者（月額・国民年金基金との合算上限）", before: 68000, after: 75000, path: "retirement.currentMonthlyLimits.firstInsured" },
      { labelJa: "任意加入被保険者（月額・共通上限）", before: 68000, after: 75000, path: "retirement.currentMonthlyLimits.voluntaryInsured" },
      { labelJa: "第2号・企業年金なし（月額）", before: 23000, after: 62000, path: "retirement.currentMonthlyLimits.employeeNoCorporatePension" },
      { labelJa: "第2号・企業年金ありの共通上限（月額）", before: 20000, after: 62000, path: "retirement.currentMonthlyLimits.employeeWithCorporatePensionMax" },
      { labelJa: "第2号・企業年金等との共通拠出限度額（月額）", before: 55000, after: 62000, path: "retirement.currentMonthlyLimits.corporatePensionCombinedCeiling" },
    ],
  },
];

function clonePreservingFunctions(value) {
  if (Array.isArray(value)) return value.map(clonePreservingFunctions);
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const [key, child] of Object.entries(value)) out[key] = clonePreservingFunctions(child);
  return out;
}

function setByPath(root, path, value) {
  const parts = String(path).split(".");
  let cursor = root;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    if (!cursor[key] || typeof cursor[key] !== "object") cursor[key] = {};
    cursor = cursor[key];
  }
  cursor[parts[parts.length - 1]] = value;
}

export function normalizeRuleUpdateState(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    approved: source.approved && typeof source.approved === "object" ? source.approved : {},
    dismissed: source.dismissed && typeof source.dismissed === "object" ? source.dismissed : {},
    lastCheckedAt: typeof source.lastCheckedAt === "string" ? source.lastCheckedAt : "",
  };
}

export function isUpdateEffective(update, now = new Date()) {
  if (!update?.effectiveDate) return true;
  const effective = new Date(`${update.effectiveDate}T00:00:00`);
  return Number.isFinite(effective.getTime()) && now >= effective;
}

export function applyApprovedRuleUpdates(baseRules, country, updates, state, now = new Date()) {
  const result = clonePreservingFunctions(baseRules);
  for (const update of updates || []) {
    if (update.country !== country) continue;
    if (!state?.approved?.[update.id]) continue;
    if (!isUpdateEffective(update, now)) continue;
    for (const change of update.changes || []) {
      if (change.path) setByPath(result, change.path, change.after);
    }
  }
  return result;
}

export function mergeRuleUpdateManifests(remoteUpdates) {
  const byId = new Map(BUILTIN_RULE_UPDATES.map((item) => [item.id, item]));
  if (Array.isArray(remoteUpdates)) {
    for (const item of remoteUpdates) {
      if (item && typeof item.id === "string" && typeof item.country === "string") byId.set(item.id, item);
    }
  }
  return [...byId.values()];
}
