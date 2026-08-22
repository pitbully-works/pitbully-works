import { describe, expect, it } from "vitest";
import { GB_COUNTRY_RULES } from "./countryRules/GB.js";

describe("overseas 100 phase 24 — GB carry-forward and 2027 ISA reform", () => {
  const inv = GB_COUNTRY_RULES.investment;

  it("switches Cash ISA limits on 6 April 2027 by age", () => {
    expect(inv.getCashIsaAnnualLimit({ date: "2027-04-05", age: 40 })).toBe(20000);
    expect(inv.getCashIsaAnnualLimit({ date: "2027-04-06", age: 40 })).toBe(12000);
    expect(inv.getCashIsaAnnualLimit({ date: "2027-04-06", age: 65 })).toBe(20000);
  });

  it("models the under-65 transfer restriction from non-Cash ISA to Cash ISA", () => {
    expect(inv.canTransferNonCashIsaToCashIsa({ date: "2027-04-05", age: 40 })).toBe(true);
    expect(inv.canTransferNonCashIsaToCashIsa({ date: "2027-04-06", age: 40 })).toBe(false);
    expect(inv.canTransferNonCashIsaToCashIsa({ date: "2027-04-06", age: 65 })).toBe(true);
  });

  it("models the 22 percent charge on interest from cash held in a non-Cash ISA from reform date", () => {
    expect(inv.getNonCashIsaCashInterestChargeRate({ date: "2027-04-05" })).toBe(0);
    expect(inv.getNonCashIsaCashInterestChargeRate({ date: "2027-04-06" })).toBe(0.22);
  });

  it("reconstructs unused pension annual allowance from the previous three tax years", () => {
    const history = [
      { taxYear: "2023/24", annualAllowance: 60000, pensionInputAmount: 20000, wasMember: true },
      { taxYear: "2024/25", annualAllowance: 60000, pensionInputAmount: 50000, wasMember: true },
      { taxYear: "2025/26", annualAllowance: 60000, pensionInputAmount: 60000, wasMember: true },
    ];
    expect(inv.getReconstructedPensionCarryForwardAvailable(history)).toBe(50000);
  });

  it("does not create carry-forward for a year in which the person was not a scheme member", () => {
    const history = [
      { taxYear: "2023/24", annualAllowance: 60000, pensionInputAmount: 0, wasMember: false },
      { taxYear: "2024/25", annualAllowance: 60000, pensionInputAmount: 50000, wasMember: true },
      { taxYear: "2025/26", annualAllowance: 60000, pensionInputAmount: 60000, wasMember: true },
    ];
    expect(inv.getReconstructedPensionCarryForwardAvailable(history)).toBe(10000);
  });

  it("uses current-year allowance first, then oldest carry-forward first", () => {
    const r = inv.allocatePensionCarryForward({
      currentAllowance: 60000,
      currentPensionInput: 95000,
      priorTaxYears: [
        { taxYear: "2023/24", annualAllowance: 60000, pensionInputAmount: 40000, wasMember: true },
        { taxYear: "2024/25", annualAllowance: 60000, pensionInputAmount: 50000, wasMember: true },
        { taxYear: "2025/26", annualAllowance: 60000, pensionInputAmount: 55000, wasMember: true },
      ],
    });
    expect(r.currentAllowanceUsed).toBe(60000);
    expect(r.usage[0].used).toBe(20000);
    expect(r.usage[1].used).toBe(10000);
    expect(r.usage[2].used).toBe(5000);
    expect(r.excessAfterCarryForward).toBe(0);
  });
});
