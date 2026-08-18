import { describe, it, expect } from "vitest";
import { stockCostBasisValue, runStockSim } from "./utils/simulations.js";

describe("individual stock acquisition-price regression", () => {
  it("uses shares × average acquisition price as current principal", () => {
    expect(stockCostBasisValue({ shares: 20, value: 77_800 })).toBe(1_556_000);
    expect(stockCostBasisValue({ shares: 3, value: 86_700 })).toBe(260_100);
  });

  it("does not treat average acquisition price alone as the holding total", () => {
    const holdings = [
      { shares: 20, value: 77_800 },
      { shares: 3, value: 86_700 },
    ];
    const total = holdings.reduce((sum, h) => sum + stockCostBasisValue(h), 0);
    expect(total).toBe(1_816_100);
    expect(total).not.toBe(164_500);
  });

  it("compounds the shares × acquisition-price principal at the expected annual return", () => {
    const principal = stockCostBasisValue({ shares: 10, value: 50_000 });
    const sim = runStockSim({ currentAge: 60, deathAge: 61, totalValue: principal, returnPct: 6 });
    expect(sim.yearly[0].value).toBe(500_000);
    expect(sim.finalValue).toBeCloseTo(530_000, 5);
  });
});
