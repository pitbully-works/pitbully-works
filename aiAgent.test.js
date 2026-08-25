import { describe, expect, it } from "vitest";
import { normalizeAgentScenario, normalizeAgentScenarios, summarizeAgentComparison } from "./utils/aiAgent.js";

describe("AI agent scenario safety", () => {
  const baseline = { currentAge: 58, retireAge: 65, deathAge: 95, livingCostMonthly: 210000 };

  it("clamps ages and maps contribution multiplier to supported values", () => {
    const s = normalizeAgentScenario({ retireAge: 120, livingCostMonthly: -1, contributionMultiplier: 1.27 }, baseline);
    expect(s.retireAge).toBe(95);
    expect(s.livingCostMonthly).toBe(0);
    expect(s.contributionMultiplier).toBe(1.2);
  });

  it("limits and deduplicates scenarios", () => {
    const list = normalizeAgentScenarios([
      { label: "a", retireAge: 65, livingCostMonthly: 200000, contributionMultiplier: 1 },
      { label: "dup", retireAge: 65, livingCostMonthly: 200000, contributionMultiplier: 1 },
      { label: "b", retireAge: 67, livingCostMonthly: 200000, contributionMultiplier: 1 },
      { label: "c", retireAge: 68, livingCostMonthly: 190000, contributionMultiplier: 1.2 },
    ], baseline);
    expect(list).toHaveLength(2);
  });

  it("summarizes only app-calculated comparison results", () => {
    const result = {
      compare: { netWorthAtRetire: 500, netWorthFinal: 900, depletionAge: null },
      diff: { netWorthAtRetire: 50, netWorthFinal: 100 },
      compareYearly: [{ age: 65, netWorth: 500 }, { age: 95, netWorth: 900 }],
      baseYearly: [{ age: 65, netWorth: 450 }, { age: 95, netWorth: 800 }],
    };
    const out = summarizeAgentComparison({ label: "x" }, result, 95);
    expect(out.metrics.finalNetWorth).toBe(900);
    expect(out.metrics.finalNetWorthDiff).toBe(100);
    expect(out.metrics.milestones.find((x) => x.age === 95).netWorth).toBe(900);
  });
});
