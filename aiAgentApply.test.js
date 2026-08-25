import { describe, expect, it } from "vitest";
import {
  agentScenarioKey,
  agentSettingsFingerprint,
  applyAgentScenarioToInputs,
  scenarioMatchesSnapshot,
  validateAgentScenarioApplication,
} from "./utils/aiAgentApply.js";

describe("AI agent approved setting application", () => {
  it("applies JP retirement age and living cost without mutating the original", () => {
    const inputs = { retireAge: 65, livingCostMonthly: 163000, marker: 1 };
    const result = applyAgentScenarioToInputs(inputs, "JP", {
      retireAge: 70,
      livingCostMonthly: 140000,
      contributionMultiplier: 1,
    });
    expect(result.ok).toBe(true);
    expect(result.nextInputs.retireAge).toBe(70);
    expect(result.nextInputs.livingCostMonthly).toBe(140000);
    expect(inputs).toEqual({ retireAge: 65, livingCostMonthly: 163000, marker: 1 });
  });

  it("applies overseas living cost to the active country bag only", () => {
    const inputs = {
      retireAge: 65,
      usInvestment: { expensesMonthly: 2000, annualIncome: 50000 },
      gbInvestment: { expensesMonthly: 1800 },
    };
    const result = applyAgentScenarioToInputs(inputs, "US", {
      retireAge: 67,
      livingCostMonthly: 1750,
      contributionMultiplier: 1,
    });
    expect(result.ok).toBe(true);
    expect(result.nextInputs.retireAge).toBe(67);
    expect(result.nextInputs.usInvestment).toEqual({ expensesMonthly: 1750, annualIncome: 50000 });
    expect(result.nextInputs.gbInvestment).toEqual({ expensesMonthly: 1800 });
  });

  it("refuses contribution-multiplier scenarios so historical contributions cannot be rewritten", () => {
    const inputs = { retireAge: 65, livingCostMonthly: 163000 };
    const result = applyAgentScenarioToInputs(inputs, "JP", {
      retireAge: 65,
      livingCostMonthly: 163000,
      contributionMultiplier: 1.5,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("contribution-multiplier-not-persistable");
    expect(result.nextInputs).toBe(inputs);
  });

  it("rejects malformed scenarios", () => {
    const inputs = { retireAge: 65, livingCostMonthly: 163000 };
    expect(applyAgentScenarioToInputs(inputs, "JP", null).ok).toBe(false);
    expect(applyAgentScenarioToInputs(inputs, "JP", { retireAge: NaN, livingCostMonthly: 1, contributionMultiplier: 1 }).ok).toBe(false);
    expect(applyAgentScenarioToInputs(inputs, "ZZ", { retireAge: 65, livingCostMonthly: 1, contributionMultiplier: 1 }).ok).toBe(false);
  });
});

describe("AI agent stage 3 approval guard", () => {
  const snapshot = { country: "JP", retireAge: 65, livingCostMonthly: 163000 };
  const scenario = { retireAge: 70, livingCostMonthly: 140000, contributionMultiplier: 1 };

  it("creates a stable key for the same approved scenario", () => {
    expect(agentScenarioKey(scenario)).toBe("70|140000|1");
    expect(agentScenarioKey({ ...scenario, livingCostMonthly: 140000.4 })).toBe("70|140000|1");
  });

  it("detects when settings changed after scenario calculation", () => {
    const baselineFingerprint = agentSettingsFingerprint(snapshot);
    const result = validateAgentScenarioApplication({
      scenario,
      currentSnapshot: { ...snapshot, livingCostMonthly: 150000 },
      baselineFingerprint,
      appliedKeys: [],
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("stale-baseline");
  });

  it("blocks applying the same scenario twice", () => {
    const key = agentScenarioKey(scenario);
    const result = validateAgentScenarioApplication({
      scenario,
      currentSnapshot: snapshot,
      baselineFingerprint: agentSettingsFingerprint(snapshot),
      appliedKeys: [key],
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("already-applied");
  });

  it("allows a fresh, user-approved persistable scenario", () => {
    const result = validateAgentScenarioApplication({
      scenario,
      currentSnapshot: snapshot,
      baselineFingerprint: agentSettingsFingerprint(snapshot),
      appliedKeys: [],
    });
    expect(result.ok).toBe(true);
  });

  it("recognizes when recalculated settings match the approved scenario", () => {
    expect(scenarioMatchesSnapshot({ country: "JP", retireAge: 70, livingCostMonthly: 140000 }, scenario)).toBe(true);
    expect(scenarioMatchesSnapshot(snapshot, scenario)).toBe(false);
  });
});
