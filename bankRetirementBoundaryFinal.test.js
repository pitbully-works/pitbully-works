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
        interestPct: 12,
      }],
    });

    // Deposits happen at months 1..5. At month 6 age === 60.5, contribution has stopped.
    // Use a non-zero return so a fallback to the final balance can never masquerade
    // as the true retirement-boundary balance.
    const monthlyRate = Math.pow(1.12, 1 / 12) - 1;
    let expectedAtRetire = 100000;
    for (let m = 1; m <= 6; m += 1) {
      expectedAtRetire *= (1 + monthlyRate);
      if (m < 6) expectedAtRetire += 10000;
    }
    expect(r.totalAtRetire).toBeCloseTo(expectedAtRetire, 6);

    const age61 = r.yearly.find((row) => row.age === 61);
    expect(age61).toBeTruthy();
    expect(r.totalAtRetire).toBeLessThan(age61.total);
    expect(r.totalAtRetire).toBeLessThan(r.totalFinal);
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
