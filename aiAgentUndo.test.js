import { describe, expect, it } from "vitest";
import {
  buildAgentChangeRecord,
  undoAgentChangeToInputs,
  validateAgentChangeUndo,
} from "./utils/aiAgentApply.js";

describe("AI agent stage 4 undo guard", () => {
  const before = { country: "JP", retireAge: 65, livingCostMonthly: 163000 };
  const scenario = { retireAge: 67, livingCostMonthly: 140000, contributionMultiplier: 1 };

  it("records only the settings needed to undo an approved AI change", () => {
    const record = buildAgentChangeRecord({ currentSnapshot: before, scenario, appliedAt: 123 });
    expect(record).toEqual({
      version: 1,
      key: "67|140000|1",
      appliedAt: 123,
      country: "JP",
      before: { country: "JP", retireAge: 65, livingCostMonthly: 163000 },
      after: { country: "JP", retireAge: 67, livingCostMonthly: 140000 },
    });
  });

  it("allows undo only while current settings still match the AI-applied values", () => {
    const record = buildAgentChangeRecord({ currentSnapshot: before, scenario });
    expect(validateAgentChangeUndo({ record, currentSnapshot: { country: "JP", retireAge: 67, livingCostMonthly: 140000 } }).ok).toBe(true);
    const blocked = validateAgentChangeUndo({ record, currentSnapshot: { country: "JP", retireAge: 67, livingCostMonthly: 150000 } });
    expect(blocked.ok).toBe(false);
    expect(blocked.reason).toBe("settings-changed");
  });

  it("restores JP retirement age and living cost without touching unrelated settings", () => {
    const record = buildAgentChangeRecord({ currentSnapshot: before, scenario });
    const inputs = { retireAge: 67, livingCostMonthly: 140000, marker: 9 };
    const result = undoAgentChangeToInputs(inputs, "JP", record);
    expect(result.ok).toBe(true);
    expect(result.nextInputs).toEqual({ retireAge: 65, livingCostMonthly: 163000, marker: 9 });
  });

  it("restores only the active overseas living-cost bag", () => {
    const record = buildAgentChangeRecord({
      currentSnapshot: { country: "US", retireAge: 65, livingCostMonthly: 2200 },
      scenario: { retireAge: 68, livingCostMonthly: 1800, contributionMultiplier: 1 },
    });
    const inputs = {
      retireAge: 68,
      usInvestment: { expensesMonthly: 1800, annualIncome: 90000 },
      gbInvestment: { expensesMonthly: 1900 },
    };
    const result = undoAgentChangeToInputs(inputs, "US", record);
    expect(result.ok).toBe(true);
    expect(result.nextInputs.retireAge).toBe(65);
    expect(result.nextInputs.usInvestment).toEqual({ expensesMonthly: 2200, annualIncome: 90000 });
    expect(result.nextInputs.gbInvestment).toEqual({ expensesMonthly: 1900 });
  });
});
