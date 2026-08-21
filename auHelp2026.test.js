import { describe, it, expect } from "vitest";
import { AU_COUNTRY_RULES } from "./countryRules/AU.js";

describe("AU 2026-27 HELP / study-loan compulsory repayment", () => {
  const tax = AU_COUNTRY_RULES.tax;
  it("uses the legislated 2026-27 thresholds", () => {
    expect(tax.studyLoan.minimumRepaymentIncome).toBe(69528);
    expect(tax.studyLoan.secondThreshold).toBe(129717);
  });
  it("is zero at or below the minimum repayment income", () => {
    expect(tax.calculateStudyLoanCompulsoryRepayment(69528, 50000)).toBe(0);
  });
  it("uses 15 cents per dollar above A$69,528 in the first band", () => {
    expect(tax.calculateStudyLoanCompulsoryRepayment(80000, 50000)).toBeCloseTo((80000 - 69528) * 0.15, 8);
  });
  it("adds the 17 cent second marginal band above A$129,717", () => {
    const income = 150000;
    const expected = (129717 - 69528) * 0.15 + (income - 129717) * 0.17;
    expect(tax.calculateStudyLoanCompulsoryRepayment(income, 50000)).toBeCloseTo(expected, 8);
  });
  it("never exceeds 10% of repayment income", () => {
    const income = 250000;
    expect(tax.calculateStudyLoanCompulsoryRepayment(income, 50000)).toBeCloseTo(income * 0.10, 8);
  });
  it("never repays more than the outstanding debt balance", () => {
    expect(tax.calculateStudyLoanCompulsoryRepayment(150000, 1200)).toBe(1200);
  });
  it("keeps future debt/indexation projection explicitly limited", () => {
    expect(tax.notImplemented.join(" / ")).toMatch(/将来の債務残高.*indexation/);
  });
});
