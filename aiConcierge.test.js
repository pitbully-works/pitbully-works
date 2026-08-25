import { describe, expect, it } from "vitest";
import { buildAiPlanSnapshot, readAiUsage, incrementAiUsage, aiUsageRemaining } from "./utils/aiConcierge.js";

describe("AI concierge safety helpers", () => {
  it("exports only summarized calculated values with dynamic age milestones", () => {
    const snap = buildAiPlanSnapshot({
      country: "JP", language: "ja", currentAge: 58.5, retireAge: 67, deathAge: 92,
      currentNetWorth: 1234567.8, finalNetWorth: 7654321.2, depletionAge: null,
      publicPensionMonthly: 120990, totalPensionMonthly: 167000, publicPensionStartAge: 67,
      livingCostMonthly: 210000, inflationPct: 2, postRetireReturnPct: 3,
      yearly: [
        { age: 67, netWorth: 2000000 },
        { age: 70, netWorth: 2500000 },
        { age: 80, netWorth: 3500000 },
        { age: 90, netWorth: 4500000 },
        { age: 92, netWorth: 5000000 },
      ],
    });

    expect(snap.currentNetWorth).toBe(1234568);
    expect(snap.retireAge).toBe(67);
    expect(snap.deathAge).toBe(92);
    expect(snap.milestones).toHaveLength(5);
    expect(snap.milestones.map((m) => m.age)).toEqual([67, 70, 80, 90, 92]);
    expect(snap.milestones.at(-1)?.age).toBe(snap.deathAge);
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
