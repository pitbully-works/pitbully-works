import { describe, it, expect } from "vitest";
import { CA_COUNTRY_RULES } from "./countryRules/CA.js";

describe("CA 2026 TFSA contribution room", () => {
  const inv = CA_COUNTRY_RULES.investment;

  it("uses the 2026 annual dollar limit of C$7,000 when no carryforward exists", () => {
    expect(inv.getTfsaContributionRoom()).toBe(7000);
  });

  it("adds prior unused room and prior-year withdrawals to the annual limit", () => {
    expect(inv.getTfsaContributionRoom({ priorUnusedTfsaRoom: 6000, priorYearTfsaWithdrawals: 4000 })).toBe(17000);
  });

  it("prefers an explicitly calculated current-year room when supplied", () => {
    expect(inv.getTfsaContributionRoom({ officialTfsaRoom: 23500, priorUnusedTfsaRoom: 1000, priorYearTfsaWithdrawals: 2000 })).toBe(23500);
  });

  it("subtracts contributions already made this year from available room", () => {
    expect(inv.getTfsaRemaining({ priorUnusedTfsaRoom: 6000, priorYearTfsaWithdrawals: 4000, tfsa: { annualContribution: 5000 } })).toBe(12000);
  });

  it("returns a negative remainder when contributions exceed available room", () => {
    expect(inv.getTfsaRemaining({ tfsa: { annualContribution: 7500 } })).toBe(-500);
  });

  it("does not allow negative prior room or withdrawals to reduce current room", () => {
    expect(inv.getTfsaContributionRoom({ priorUnusedTfsaRoom: -5000, priorYearTfsaWithdrawals: -1000 })).toBe(7000);
  });
});
