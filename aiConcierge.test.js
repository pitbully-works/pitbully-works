import { describe, expect, it } from "vitest";
import { buildAiPlanSnapshot, readAiUsage, incrementAiUsage, aiUsageRemaining } from "./utils/aiConcierge.js";

describe("AI concierge safety helpers", () => {
  it("exports only summarized calculated values", () => {
    const snap = buildAiPlanSnapshot({
      country: "JP", language: "ja", currentAge: 58.5, retireAge: 65, deathAge: 95,
      currentNetWorth: 1234567.8, finalNetWorth: 7654321.2, depletionAge: null,
      publicPensionMonthly: 120990, totalPensionMonthly: 167000, publicPensionStartAge: 65,
      livingCostMonthly: 210000, inflationPct: 2, postRetireReturnPct: 3,
      yearly: [{ age: 65, netWorth: 2000000 }, { age: 75, netWorth: 3000000 }, { age: 85, netWorth: 4000000 }, { age: 95, netWorth: 5000000 }],
    });
    expect(snap.currentNetWorth).toBe(1234568);
    expect(snap.milestones).toHaveLength(4);
    expect(Object.keys(snap)).not.toContain("name");
    expect(Object.keys(snap)).not.toContain("birthDate");
  });

  it("tracks a best-effort per-device daily limit", () => {
    const m = new Map();
    const storage = { getItem: (k) => m.get(k) || null, setItem: (k,v) => m.set(k,v) };
    const now = new Date("2026-08-25T00:00:00Z");
    expect(readAiUsage(storage, now).count).toBe(0);
    incrementAiUsage(storage, now);
    expect(aiUsageRemaining(storage, now, 3)).toBe(2);
  });
});
