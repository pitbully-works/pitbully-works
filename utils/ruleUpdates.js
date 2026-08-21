// 制度更新センター：計算本体と制度変更通知を分離する。
// 承認済みでも effectiveDate より前は計算へ適用しない。
export const RULE_UPDATE_STORAGE_KEY = "nisa-lifeplan-rule-updates-v1";
export const RULE_UPDATE_COUNTRIES = Object.freeze(["JP", "US", "GB", "CA", "AU"]);
export const MAX_REMOTE_RULE_UPDATES = 500;
export const MAX_RULE_CHANGES_PER_UPDATE = 100;
export const MAX_RULE_SOURCE_URL_LENGTH = 2048;
export const MAX_RULE_PATH_LENGTH = 512;
export const MAX_RULE_PATH_SEGMENTS = 24;
export const MAX_RULE_TEXT_LENGTH = 4000;
export const MAX_RULE_DECISION_ENTRIES = 2000;
export const MAX_RULE_HISTORY_INPUT_ROWS = 1000;
export const MAX_RULE_SOURCE_ACK_ENTRIES = 1000;

export function normalizeRuleCountry(value) {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  return RULE_UPDATE_COUNTRIES.includes(code) ? code : null;
}

function normalizeRuleText(value, maxLength = MAX_RULE_TEXT_LENGTH) {
  if (typeof value !== "string") return "";
  const text = value.trim();
  return text.length <= maxLength ? text : text.slice(0, maxLength);
}

function normalizeRuleDisplayScalar(value) {
  if (value === null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return normalizeRuleText(value, 500);
  return null;
}

export function normalizeRuleUpdateId(value) {
  const id = typeof value === "string" ? value.trim() : "";
  return id && id.length <= 200 ? id : null;
}

// Remote rule manifests can supply sourceUrl. Render only normal web links; never
// pass javascript:, data:, file:, or other active/opaque schemes into an href.
export function safeRuleSourceUrl(value) {
  if (typeof value !== "string") return "";
  const text = value.trim();
  if (!text || text.length > MAX_RULE_SOURCE_URL_LENGTH) return "";
  try {
    const url = new URL(text);
    if (url.username || url.password) return "";
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
  } catch {
    return "";
  }
}

// Validate rule-source status as one atomic feed. A single unknown/duplicate/malformed
// row rejects the whole payload so a partially corrupted deployment cannot both
// discard a valid alert and advance lastCheckedAt. The registry remains the source
// of truth for country and URL; the remote file contributes status only.
export function normalizeRuleSourceStatusFeed(payload, registry) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  if (payload.schemaVersion !== 1 || !Array.isArray(payload.sources) || payload.sources.length > 500) return null;
  if (!Array.isArray(registry)) return null;

  const registryById = new Map();
  for (const source of registry) {
    const id = normalizeRuleUpdateId(source?.id);
    const country = normalizeRuleCountry(source?.country);
    if (!id || !country || registryById.has(id)) return null;
    registryById.set(id, { ...source, id, country });
  }

  const seen = new Set();
  const normalized = [];
  for (const item of payload.sources) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const id = normalizeRuleUpdateId(item.id);
    const country = normalizeRuleCountry(item.country);
    const registered = id ? registryById.get(id) : null;
    if (!id || !country || !registered || registered.country !== country || seen.has(id)) return null;
    seen.add(id);

    const rawHash = typeof item.hash === "string" ? item.hash.trim().toLowerCase() : "";
    if (rawHash && !/^[a-f0-9]{64}$/.test(rawHash)) return null;
    normalized.push({
      id,
      country,
      changed: item.changed === true,
      hash: rawHash,
      url: safeRuleSourceUrl(registered.url),
    });
  }
  return normalized;
}


function hasOwnTrue(map, id) {
  const key = normalizeRuleUpdateId(id);
  return !!key
    && !!map
    && Object.prototype.hasOwnProperty.call(map, key)
    && map[key] === true;
}

function normalizeDecisionMap(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  // IDs are external keys. A null-prototype map prevents magic names such as
  // __proto__ from invoking Object.prototype setters during normalization.
  const out = Object.create(null);
  for (const [rawId, rawDecision] of Object.entries(source).slice(0, MAX_RULE_DECISION_ENTRIES)) {
    const id = normalizeRuleUpdateId(rawId);
    if (!id || typeof rawDecision !== "boolean") continue;
    out[id] = rawDecision;
  }
  return out;
}

function normalizeSourceAcknowledgedHashes(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const out = Object.create(null);
  for (const [rawId, rawHash] of Object.entries(source).slice(0, MAX_RULE_SOURCE_ACK_ENTRIES)) {
    const id = normalizeRuleUpdateId(rawId);
    const hash = typeof rawHash === "string" ? rawHash.trim().toLowerCase() : "";
    if (!id || !/^[a-f0-9]{64}$/.test(hash)) continue;
    out[id] = hash;
  }
  return out;
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

const UNSAFE_RULE_PATH_SEGMENTS = new Set(["__proto__", "prototype", "constructor"]);

function safeRulePathParts(path) {
  if (typeof path !== "string") return null;
  const text = path.trim();
  if (!text || text.length > MAX_RULE_PATH_LENGTH) return null;
  const parts = text.split(".");
  if (!parts.length || parts.length > MAX_RULE_PATH_SEGMENTS || parts.some((part) => !part || part.length > 100 || UNSAFE_RULE_PATH_SEGMENTS.has(part))) return null;
  return parts;
}

function setByPath(root, path, value) {
  // Rule-update paths may come from a remote manifest. Never traverse prototype
  // keys: e.g. "__proto__.x" or "constructor.prototype.x" could otherwise
  // mutate Object.prototype after the user approves an update.
  //
  // Also fail closed when the path does not already exist in the verified base
  // rules. A typo such as "tax.implementedd" must not create a hidden property,
  // and a path such as "tax.implemented.foo" must not replace the boolean
  // `implemented` flag with an object. New rule fields require an app release
  // (and tests) before a remote manifest is allowed to update them.
  const parts = safeRulePathParts(path);
  if (!parts || !root || typeof root !== "object") return false;
  let cursor = root;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    if (!Object.prototype.hasOwnProperty.call(cursor, key)) return false;
    const next = cursor[key];
    if (!next || typeof next !== "object" || Array.isArray(next)) return false;
    cursor = next;
  }
  const leaf = parts[parts.length - 1];
  if (!Object.prototype.hasOwnProperty.call(cursor, leaf)) return false;
  const current = cursor[leaf];
  // Remote updates may change statutory scalar values only. Never replace a
  // verified function/object/array with remote data, and keep primitive types
  // compatible so a number cannot silently become a string or boolean.
  if (typeof current === "function" || (current && typeof current === "object")) return false;
  if (typeof current === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) return false;
  } else if (typeof current === "boolean") {
    if (typeof value !== "boolean") return false;
  } else if (typeof current === "string") {
    if (typeof value !== "string") return false;
  } else if (current === null) {
    if (value !== null && !["string", "number", "boolean"].includes(typeof value)) return false;
    if (typeof value === "number" && !Number.isFinite(value)) return false;
  } else {
    return false;
  }
  cursor[leaf] = value;
  return true;
}

export function normalizeRuleTimestamp(value) {
  if (typeof value !== "string") return "";
  const text = value.trim();
  // Persisted audit timestamps must be explicit ISO-8601 date-times with a
  // timezone. Reject locale-dependent strings such as "08/21/2026" so the
  // same saved state cannot mean different instants on different devices.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(text)) return "";
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : "";
}

export function normalizeRuleUpdateState(raw) {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const history = Array.isArray(source.history)
    ? source.history
      .slice(-MAX_RULE_HISTORY_INPUT_ROWS)
      .filter((item) => item && typeof item === "object" && !Array.isArray(item))
      .map((item) => {
        const country = normalizeRuleCountry(item.country);
        const id = normalizeRuleUpdateId(item.id);
        const updateId = item.updateId == null ? null : normalizeRuleUpdateId(item.updateId);
        const action = item.action === "approved" || item.action === "deferred" ? item.action : null;
        if (!country || !id || (item.updateId != null && !updateId) || !action) return null;
        const decidedAt = normalizeRuleTimestamp(item.decidedAt);
        const effectiveDate = normalizeRuleDateString(item.effectiveDate);
        return {
          id,
          ...(updateId ? { updateId } : {}),
          country,
          action,
          category: normalizeRuleText(item.category, 100),
          titleJa: normalizeRuleText(item.titleJa, 500),
          titleEn: normalizeRuleText(item.titleEn, 500),
          decidedAt,
          effectiveDate,
        };
      })
      .filter(Boolean)
      .slice(-100)
    : [];
  return {
    approved: normalizeDecisionMap(source.approved),
    dismissed: normalizeDecisionMap(source.dismissed),
    sourceAcknowledgedHashes: normalizeSourceAcknowledgedHashes(source.sourceAcknowledgedHashes),
    history,
    lastCheckedAt: normalizeRuleTimestamp(source.lastCheckedAt),
  };
}

export function normalizeRuleDateString(value) {
  const text = String(value || "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 0, 0, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return "";
  return text;
}

function parseStrictRuleDate(value) {
  const text = normalizeRuleDateString(value);
  if (!text) return null;
  const [year, month, day] = text.split("-").map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

export function isUpdateEffective(update, now = new Date()) {
  // A rule manifest without a valid effective date must fail closed. Remote
  // updates are statutory changes; treating a missing date as "effective now"
  // could activate an approved draft earlier than intended.
  const effective = parseStrictRuleDate(update?.effectiveDate);
  return !!effective && Number.isFinite(now?.getTime?.()) && now >= effective;
}

export function applyApprovedRuleUpdates(baseRules, country, updates, state, now = new Date()) {
  const result = clonePreservingFunctions(baseRules);
  const code = normalizeRuleCountry(country);
  // Never let two invalid/unknown country codes match through `null === null`.
  // The calculation engine only supports the explicit five-country set.
  if (!code) return result;
  const safeUpdates = Array.isArray(updates) ? updates.slice(0, MAX_REMOTE_RULE_UPDATES + BUILTIN_RULE_UPDATES.length) : [];
  for (const update of safeUpdates) {
    const updateCountry = normalizeRuleCountry(update?.country);
    const updateId = normalizeRuleUpdateId(update?.id);
    if (!updateCountry || updateCountry !== code || !updateId) continue;
    if (!isRuleUpdateApproved(state, updateId)) continue;
    if (!isUpdateEffective(update, now)) continue;
    const changes = Array.isArray(update?.changes) ? update.changes.slice(0, MAX_RULE_CHANGES_PER_UPDATE) : [];
    for (const change of changes) {
      if (!change || typeof change !== "object") continue;
      if (typeof change.path !== "string" || !change.path.trim()) continue;
      setByPath(result, change.path, change.after);
    }
  }
  return result;
}

export function mergeRuleUpdateManifests(remoteUpdates) {
  const byId = new Map(BUILTIN_RULE_UPDATES.map((item) => [item.id, item]));
  if (Array.isArray(remoteUpdates)) {
    for (const item of remoteUpdates.slice(0, MAX_REMOTE_RULE_UPDATES)) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const id = normalizeRuleUpdateId(item.id);
      const country = normalizeRuleCountry(item.country);
      if (!id || !country) continue;
      // IDs are global approval keys. Once an ID is present, a later remote row must
      // never replace it — even within the same country. Otherwise an already-approved
      // ID could silently acquire different paths/values without a fresh approval.
      // Built-ins therefore always win, and the first valid remote row wins among
      // duplicate remote IDs.
      if (byId.has(id)) continue;
      const changes = Array.isArray(item.changes)
        ? item.changes
          .slice(0, MAX_RULE_CHANGES_PER_UPDATE)
          .filter((change) => change && typeof change === "object" && !Array.isArray(change))
          .map((change) => ({
            path: typeof change.path === "string" && safeRulePathParts(change.path) ? change.path.trim() : "",
            labelJa: normalizeRuleText(change.labelJa, 500),
            labelEn: normalizeRuleText(change.labelEn, 500),
            unit: normalizeRuleText(change.unit, 50),
            before: normalizeRuleDisplayScalar(change.before),
            after: normalizeRuleDisplayScalar(change.after),
          }))
          .filter((change) => !!change.path)
        : [];
      const effectiveDate = normalizeRuleDateString(item.effectiveDate);
      const detectedAt = normalizeRuleDateString(item.detectedAt);
      const sourceUrl = safeRuleSourceUrl(item.sourceUrl);
      // Remote manifests are external JSON. Retain only the documented fields the
      // rule center consumes; unknown nested metadata must not stay resident in state.
      byId.set(id, {
        id, country, changes, effectiveDate, detectedAt, sourceUrl,
        category: normalizeRuleText(item.category, 100),
        titleJa: normalizeRuleText(item.titleJa, 500),
        titleEn: normalizeRuleText(item.titleEn, 500),
        summaryJa: normalizeRuleText(item.summaryJa),
        summaryEn: normalizeRuleText(item.summaryEn),
        impactJa: normalizeRuleText(item.impactJa),
        impactEn: normalizeRuleText(item.impactEn),
        sourceLabel: normalizeRuleText(item.sourceLabel, 500),
      });
    }
  }
  return [...byId.values()];
}
