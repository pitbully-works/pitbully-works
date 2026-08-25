export const AI_DAILY_LIMIT = 3;
export const AI_USAGE_KEY = "lifeplan-ai-usage-v1";

const safeNum = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
const rounded = (v) => Math.round(safeNum(v));

export function buildPlanMilestoneAges({ currentAge, retireAge, deathAge }) {
  const current = Math.max(0, safeNum(currentAge));
  const retire = Math.max(current, safeNum(retireAge));
  const end = Math.max(retire, safeNum(deathAge));
  const ages = [];
  const add = (age) => {
    const n = Math.round(safeNum(age));
    if (n >= Math.floor(current) && n <= Math.ceil(end) && !ages.includes(n)) ages.push(n);
  };
  add(retire);
  for (let age = Math.ceil(retire / 10) * 10; age < end; age += 10) add(age);
  add(end);
  return ages.sort((a, b) => a - b);
}

export function buildAiPlanSnapshot({
  country,
  language,
  currentAge,
  retireAge,
  deathAge,
  currentNetWorth,
  finalNetWorth,
  depletionAge,
  publicPensionMonthly,
  totalPensionMonthly,
  publicPensionStartAge,
  livingCostMonthly,
  inflationPct,
  postRetireReturnPct,
  yearly = [],
}) {
  const milestones = buildPlanMilestoneAges({ currentAge, retireAge, deathAge })
    .map((age) => {
      const row = (yearly || []).find((r) => safeNum(r.age) >= age) || null;
      return row ? { age, netWorth: rounded(row.netWorth) } : null;
    })
    .filter(Boolean);

  return {
    schemaVersion: 1,
    country: String(country || "JP"),
    language: String(language || "ja"),
    currentAge: Math.round(safeNum(currentAge) * 12) / 12,
    retireAge: safeNum(retireAge),
    deathAge: safeNum(deathAge),
    currentNetWorth: rounded(currentNetWorth),
    finalNetWorth: rounded(finalNetWorth),
    depletionAge: depletionAge == null ? null : safeNum(depletionAge),
    publicPensionMonthly: rounded(publicPensionMonthly),
    totalPensionMonthly: rounded(totalPensionMonthly),
    publicPensionStartAge: safeNum(publicPensionStartAge),
    livingCostMonthly: rounded(livingCostMonthly),
    inflationPct: safeNum(inflationPct),
    postRetireReturnPct: safeNum(postRetireReturnPct),
    milestones,
  };
}

export function readAiUsage(storage, now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  try {
    const raw = storage?.getItem(AI_USAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || parsed.day !== day) return { day, count: 0 };
    return { day, count: Math.max(0, Math.floor(safeNum(parsed.count))) };
  } catch {
    return { day, count: 0 };
  }
}

export function incrementAiUsage(storage, now = new Date()) {
  const current = readAiUsage(storage, now);
  const next = { day: current.day, count: current.count + 1 };
  try { storage?.setItem(AI_USAGE_KEY, JSON.stringify(next)); } catch { /* noop */ }
  return next;
}

export function aiUsageRemaining(storage, now = new Date(), limit = AI_DAILY_LIMIT) {
  return Math.max(0, limit - readAiUsage(storage, now).count);
}
