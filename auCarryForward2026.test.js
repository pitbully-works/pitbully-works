import { describe, it, expect } from "vitest";
import { AU_COUNTRY_RULES } from "./countryRules/AU.js";

describe("AU 2026-27 carry-forward concessional contributions", () => {
  const inv = AU_COUNTRY_RULES.investment;

  it("adds ATO available unused cap when prior 30 June total super balance is below $500,000", () => {
    expect(inv.getEffectiveConcessionalCap(499999, 20000)).toBe(52500);
  });

  it("does not add carry-forward when prior balance is exactly $500,000 or more", () => {
    expect(inv.getEffectiveConcessionalCap(500000, 20000)).toBe(32500);
    expect(inv.getCarryForwardAvailable(700000, 20000)).toBe(0);
  });

  it("does not invent carry-forward when ATO available amount is zero", () => {
    expect(inv.getEffectiveConcessionalCap(100000, 0)).toBe(32500);
  });

  it("caps projected concessional contributions at base cap plus eligible carry-forward", () => {
    // Salary 200k -> SG 24k; voluntary 40k -> total 64k. Effective cap 52.5k.
    expect(inv.getCappedConcessional(200000, 40000, 300000, 20000)).toBe(52500);
  });

  it("remaining cap uses the effective carry-forward cap", () => {
    // Salary 100k -> SG 12k; voluntary 10k -> total 22k; effective cap 42.5k.
    expect(inv.getConcessionalRemaining(100000, 10000, 200000, 10000)).toBe(20500);
  });

  it("keeps the ATO five-year history as an explicit limitation rather than guessing it", () => {
    expect(inv.notImplemented.join(" / ")).toMatch(/過去5年/);
  });
});
