import { describe, it, expect } from "vitest";
import { AU_COUNTRY_RULES } from "./countryRules/AU.js";

describe("AU 2026-27 LISTO", () => {
  const tax = AU_COUNTRY_RULES.tax;
  const inv = AU_COUNTRY_RULES.investment;

  it("ATI A$37,000以下かつ対象確認済みなら税引前拠出の15%、最大A$500", () => {
    expect(tax.calculateLowIncomeSuperTaxOffset(37000, 4000, true)).toBe(500);
    expect(tax.calculateLowIncomeSuperTaxOffset(30000, 2000, true)).toBe(300);
  });

  it("A$37,000を1ドルでも超えると0", () => {
    expect(tax.calculateLowIncomeSuperTaxOffset(37001, 10000, true)).toBe(0);
  });

  it("対象条件を明示確認していない場合は0", () => {
    expect(tax.calculateLowIncomeSuperTaxOffset(30000, 10000, false)).toBe(0);
    expect(tax.calculateLowIncomeSuperTaxOffset(30000, 10000)).toBe(0);
  });

  it("算定額が0超A$10未満なら最低A$10", () => {
    expect(tax.calculateLowIncomeSuperTaxOffset(30000, 20, true)).toBe(10);
  });

  it("LISTOは拠出時15%課税を受けず、そのままSuper残高に入る", () => {
    const base = {
      currentAge: 40, retireAge: 65, deathAge: 41, annualWithdrawalNeeded: 0,
      annualSalary: 0, voluntaryConcessional: 0, contributionsTaxRate: 0.15, earningsTaxAccumulation: 0.15,
      div293TaxAnnual: 0, div293PaidFrom: "super",
      accounts: {
        superannuation: { currentValue: 0, annualContribution: 0, expectedReturnPct: 0, contributionEndAge: 65, withdrawalTaxPct: 0 },
        investmentAccount: { currentValue: 0, annualContribution: 0, expectedReturnPct: 0, contributionEndAge: 65, withdrawalTaxPct: 0 },
        cashSavings: { currentValue: 0, annualContribution: 0, expectedReturnPct: 0, contributionEndAge: 65, withdrawalTaxPct: 0 },
      },
    };
    const without = inv.simulateGrowth({ ...base, listoAnnual: 0 });
    const withListo = inv.simulateGrowth({ ...base, listoAnnual: 500 });
    expect(withListo.finalAccounts.superannuation - without.finalAccounts.superannuation).toBe(500);
  });

  it("ATO公式ソースを保持する", () => {
    expect(tax.sourceUrls.listo).toContain("ato.gov.au");
    expect(tax.superannuation.listo.incomeMax).toBe(37000);
    expect(tax.superannuation.listo.maximum).toBe(500);
  });
});
