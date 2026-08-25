import { describe, expect, it } from "vitest";
import {
  applyAgentScenarioToInputs,
  buildAgentChangeRecord,
  validateAgentChangeUndo,
  validateAgentScenarioApplication,
  agentSettingsFingerprint,
} from "./utils/aiAgentApply.js";

describe("AI agent final abnormal-path safety", () => {
  const current = { country: "JP", currentAge: 58, retireAge: 65, deathAge: 95, livingCostMonthly: 163000 };

  it("rejects a scenario with retirement age outside the user's simulation range", () => {
    const result = validateAgentScenarioApplication({
      scenario: { retireAge: 120, livingCostMonthly: 140000, contributionMultiplier: 1 },
      currentSnapshot: current,
      baselineFingerprint: agentSettingsFingerprint(current),
      appliedKeys: [],
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("retire-age-out-of-range");
  });

  it("rejects unanchored and no-op apply requests", () => {
    const scenario = { retireAge: 65, livingCostMonthly: 163000, contributionMultiplier: 1 };
    expect(validateAgentScenarioApplication({ scenario, currentSnapshot: current, baselineFingerprint: "", appliedKeys: [] }).reason).toBe("missing-baseline");
    expect(validateAgentScenarioApplication({ scenario, currentSnapshot: current, baselineFingerprint: agentSettingsFingerprint(current), appliedKeys: [] }).reason).toBe("no-op-scenario");
  });

  it("rejects extreme persisted values even if a caller bypasses the UI normalizer", () => {
    const inputs = { retireAge: 65, livingCostMonthly: 163000 };
    expect(applyAgentScenarioToInputs(inputs, "JP", { retireAge: -1, livingCostMonthly: 100000, contributionMultiplier: 1 }).ok).toBe(false);
    expect(applyAgentScenarioToInputs(inputs, "JP", { retireAge: 65, livingCostMonthly: 100000001, contributionMultiplier: 1 }).ok).toBe(false);
  });

  it("rejects corrupted undo records before they can overwrite saved settings", () => {
    const record = buildAgentChangeRecord({
      currentSnapshot: current,
      scenario: { retireAge: 67, livingCostMonthly: 140000, contributionMultiplier: 1 },
    });
    const corrupted = { ...record, before: { ...record.before, livingCostMonthly: -999 } };
    const result = validateAgentChangeUndo({
      record: corrupted,
      currentSnapshot: { ...current, retireAge: 67, livingCostMonthly: 140000 },
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("invalid-record");
  });

  it("rejects undo after country changes", () => {
    const record = buildAgentChangeRecord({
      currentSnapshot: current,
      scenario: { retireAge: 67, livingCostMonthly: 140000, contributionMultiplier: 1 },
    });
    const result = validateAgentChangeUndo({
      record,
      currentSnapshot: { country: "US", retireAge: 67, livingCostMonthly: 140000 },
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("country-changed");
  });
});
