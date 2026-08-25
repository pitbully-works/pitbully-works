import { CONTRIBUTION_MULTIPLIERS } from "./buildPlanInput.js";
import { buildPlanMilestoneAges } from "./aiConcierge.js";

const finite = (v) => Number.isFinite(Number(v)) ? Number(v) : null;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const AI_AGENT_MAX_SCENARIOS = 3;

function nearestMultiplier(value) {
  const n = finite(value);
  if (n === null) return 1;
  return CONTRIBUTION_MULTIPLIERS.reduce((best, cur) =>
    Math.abs(cur - n) < Math.abs(best - n) ? cur : best,
  CONTRIBUTION_MULTIPLIERS[0]);
}

export function normalizeAgentScenario(raw, baseline = {}) {
  const currentAge = finite(baseline.currentAge) ?? 0;
  const deathAge = finite(baseline.deathAge) ?? 120;
  const baseRetireAge = finite(baseline.retireAge) ?? Math.max(currentAge, 65);
  const baseLiving = Math.max(0, finite(baseline.livingCostMonthly) ?? 0);

  const retireRaw = finite(raw?.retireAge);
  const livingRaw = finite(raw?.livingCostMonthly);
  const multiplierRaw = finite(raw?.contributionMultiplier);

  const retireAge = retireRaw === null
    ? baseRetireAge
    : clamp(retireRaw, currentAge, deathAge);
  const livingCostMonthly = livingRaw === null
    ? baseLiving
    : clamp(livingRaw, 0, 100_000_000);
  const contributionMultiplier = multiplierRaw === null
    ? 1
    : nearestMultiplier(multiplierRaw);

  return {
    id: String(raw?.id || "").slice(0, 40),
    label: String(raw?.label || "Scenario").slice(0, 80),
    rationale: String(raw?.rationale || "").slice(0, 400),
    retireAge: Math.round(retireAge * 12) / 12,
    livingCostMonthly: Math.round(livingCostMonthly),
    contributionMultiplier,
  };
}

export function normalizeAgentScenarios(rawList, baseline = {}) {
  if (!Array.isArray(rawList)) return [];
  const out = [];
  for (const raw of rawList.slice(0, AI_AGENT_MAX_SCENARIOS)) {
    const item = normalizeAgentScenario(raw, baseline);
    const key = `${item.retireAge}|${item.livingCostMonthly}|${item.contributionMultiplier}`;
    if (out.some((x) => x._key === key)) continue;
    out.push({ ...item, _key: key });
  }
  return out.map(({ _key, ...rest }) => rest);
}

function atAge(yearly, age) {
  const target = Number(age);
  if (!Array.isArray(yearly) || !yearly.length || !Number.isFinite(target)) return null;
  const row = yearly.find((r) => Number(r?.age) >= target) || yearly[yearly.length - 1];
  return row ? Math.round(Number(row.netWorth) || 0) : null;
}

export function summarizeAgentComparison(scenario, result, deathAge) {
  if (!result) return null;
  const milestoneAges = buildPlanMilestoneAges({
    currentAge: result.base?.currentAge ?? result.compare?.currentAge ?? 0,
    retireAge: scenario?.retireAge ?? result.compare?.retireAge ?? 0,
    deathAge,
  });
  return {
    scenario,
    metrics: {
      netWorthAtRetire: Math.round(Number(result.compare?.netWorthAtRetire) || 0),
      netWorthAtRetireDiff: Math.round(Number(result.diff?.netWorthAtRetire) || 0),
      finalNetWorth: Math.round(Number(result.compare?.netWorthFinal) || 0),
      finalNetWorthDiff: Math.round(Number(result.diff?.netWorthFinal) || 0),
      depletionAge: result.compare?.depletionAge ?? null,
      milestones: milestoneAges.map((age) => ({
        age,
        netWorth: atAge(result.compareYearly, age),
        baseNetWorth: atAge(result.baseYearly, age),
      })),
    },
  };
}

export function agentBaselineFromSnapshot(snapshot = {}) {
  return {
    currentAge: finite(snapshot.currentAge) ?? 0,
    retireAge: finite(snapshot.retireAge) ?? 65,
    deathAge: finite(snapshot.deathAge) ?? 95,
    livingCostMonthly: Math.max(0, finite(snapshot.livingCostMonthly) ?? 0),
  };
}
