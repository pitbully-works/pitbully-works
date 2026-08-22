import { describe, expect, it } from "vitest";
import { runBankSimulation } from "./utils/simulations.js";

describe("bank retirement boundary", () => {
  it("captures retirement balance at the first monthly retirement boundary, not the next birthday", () => {
    const r = runBankSimulation({
      currentAge: 60,
      retireAge: 60.5,
      deathAge: 62,
      banks: [{
        name: "bank",
        balance: 100000,
        monthlyDeposit: 10000,
        interestPct: 0,
      }],
    });

    // Deposits happen at months 1..5. At month 6 age === 60.5, contribution has stopped.
    expect(r.totalAtRetire).toBe(150000);

    const age61 = r.yearly.find((row) => row.age === 61);
    expect(age61).toBeTruthy();
    expect(r.totalAtRetire).toBeLessThanOrEqual(age61.total);
  });

  it("uses the current balance immediately when the user is already retired", () => {
    const r = runBankSimulation({
      currentAge: 66,
      retireAge: 65,
      deathAge: 67,
      banks: [{ balance: 345678, monthlyDeposit: 50000, interestPct: 0 }],
    });
    expect(r.totalAtRetire).toBe(345678);
  });
});
