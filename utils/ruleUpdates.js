// 制度更新センター：計算本体と制度変更通知を分離する。
// 承認済みでも effectiveDate より前は計算へ適用しない。
export const RULE_UPDATE_STORAGE_KEY = "nisa-lifeplan-rule-updates-v1";
export const RULE_UPDATE_COUNTRIES = Object.freeze(["JP", "US", "GB", "CA", "AU"]);

export function normalizeRuleCountry(value) {
  const code = String(value || "").trim().toUpperCase();
  return RULE_UPDATE_COUNTRIES.includes(code) ? code : null;
}

function hasOwnTrue(map, id) {
  return !!map
    && Object.prototype.hasOwnProperty.call(map, id)
    && map[id] === true;
}

// Approval/defer maps are keyed by externally supplied update IDs.
// Never read them with a plain truthiness lookup because names such as
// "toString" or "constructor" exist on Object.prototype and would otherwise
// look approved even when the user never approved them.
export function isRuleUpdateApproved(state, id) {
  return hasOwnTrue(state?.approved, id);
}

export function isRuleUpdateDismissed(state, id) {
  return hasOwnTrue(state?.dismissed, id);
}

export const BUILTIN_RULE_UPDATES = [
  {
    id: "JP-NISA-2027-MINOR-TSUMITATE",
    country: "JP",
    category: "nisa",
    detectedAt: "2026-08-21",
    effectiveDate: "2027-01-01",
    titleJa: "NISA・0〜17歳向けつみたて投資枠の新設",
    titleEn: "NISA tsumitate allowance for ages 0–17",
    summaryJa: "2027年1月以降、0〜17歳にもつみたて投資枠を拡充する予定です。未成年者は年間60万円、非課税保有限度額600万円。18歳以上の現行NISA枠は変更しません。",
    summaryEn: "From Jan 2027, the tsumitate allowance is scheduled to extend to ages 0–17, with JPY 600,000 annual and JPY 6,000,000 lifetime limits. Existing adult NISA limits remain unchanged.",
    sourceLabel: "金融庁「NISAの拡充」",
    sourceUrl: "https://www.fsa.go.jp/access/r7/270.html",
    impactJa: "0〜17歳向けの制度追加です。成人の年間120万円・成長投資枠240万円・生涯1,800万円は変更しません。",
    changes: [
      { labelJa: "対象年齢の下限", before: 18, after: 0, unit: "歳", path: "investment.minorTsumitate.eligibleFromAge" },
      { labelJa: "未成年者つみたて投資枠・年間上限", before: 0, after: 600000, unit: "円", path: "investment.minorTsumitate.annualLimit" },
      { labelJa: "未成年者つみたて投資枠・非課税保有限度額", before: 0, after: 6000000, unit: "円", path: "investment.minorTsumitate.lifetimeLimit" },
    ],
  },
  {
    id: "JP-PENSION-2026-ANNUAL-REVISION",
    country: "JP",
    category: "publicPension",
    detectedAt: "2026-08-21",
    effectiveDate: "2026-04-01",
    titleJa: "2026年度 公的年金額の改定",
    titleEn: "FY2026 public pension annual revision",
    summaryJa: "2026年4月分から、国民年金（基礎年金）は前年度比1.9％、厚生年金の報酬比例部分は2.0％の引上げです。マクロ経済スライド調整は基礎年金▲0.2％、厚生年金▲0.1％です。",
    summaryEn: "From Apr 2026, the basic pension rose 1.9% and the employees' earnings-related pension 2.0%. Macro slide adjustments were -0.2% and -0.1% respectively.",
    sourceLabel: "日本年金機構「令和8年4月分からの年金額等について」",
    sourceUrl: "https://www.nenkin.go.jp/oshirase/taisetu/kojin/2026/202604/0401.html",
    impactJa: "法定の年度改定値を参照データとして更新します。あなたが入力した年金見込額そのものは自動で書き換えません。",
    changes: [
      { labelJa: "国民年金（基礎年金）改定率", before: 0, after: 1.9, unit: "%", path: "publicPension.annualRevision.basicPensionPct" },
      { labelJa: "厚生年金（報酬比例部分）改定率", before: 0, after: 2.0, unit: "%", path: "publicPension.annualRevision.employeesEarningsRelatedPct" },
      { labelJa: "マクロ経済スライド（基礎年金）", before: 0, after: -0.2, unit: "%", path: "publicPension.annualRevision.macroSlideBasicPct" },
      { labelJa: "マクロ経済スライド（厚生年金）", before: 0, after: -0.1, unit: "%", path: "publicPension.annualRevision.macroSlideEmployeesPct" },
      { labelJa: "老齢基礎年金・満額（月額）", before: 69308, after: 70608, unit: "円", path: "publicPension.annualRevision.basicPensionFullMonthly" },
      { labelJa: "標準的な厚生年金額（月額・夫婦2人分の基礎年金含む）", before: 232784, after: 237279, unit: "円", path: "publicPension.annualRevision.standardEmployeesPensionMonthly" },
      { labelJa: "参照年度", before: 2025, after: 2026, unit: "年度", path: "publicPension.annualRevision.fiscalYear" },
    ],
  },
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
  const history = Array.isArray(source.history)
    ? source.history
      .filter((item) => item && typeof item === "object")
      .map((item) => {
        const country = normalizeRuleCountry(item.country);
        return country ? { ...item, country } : null;
      })
      .filter(Boolean)
      .slice(-100)
    : [];
  return {
    approved: source.approved && typeof source.approved === "object" ? source.approved : {},
    dismissed: source.dismissed && typeof source.dismissed === "object" ? source.dismissed : {},
    history,
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
  const code = normalizeRuleCountry(country);
  for (const update of updates || []) {
    const updateCountry = normalizeRuleCountry(update?.country);
    if (updateCountry !== code) continue;
    if (!isRuleUpdateApproved(state, update.id)) continue;
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
      if (!item || typeof item.id !== "string") continue;
      const country = normalizeRuleCountry(item.country);
      if (!country) continue;
      // IDs are global approval keys. Once an ID is present, a later remote row must
      // never replace it — even within the same country. Otherwise an already-approved
      // ID could silently acquire different paths/values without a fresh approval.
      // Built-ins therefore always win, and the first valid remote row wins among
      // duplicate remote IDs.
      if (byId.has(item.id)) continue;
      byId.set(item.id, { ...item, country });
    }
  }
  return [...byId.values()];
}
