import { describe, expect, it } from "vitest";
import { CA_COUNTRY_RULES } from "./countryRules/CA.js";
import { buildCountryRuleCatalog } from "./utils/countryRuleCatalog.js";

describe("overseas 100 phase 11 — Canada death deemed disposition", () => {
  const estate = CA_COUNTRY_RULES.estate;

  it("treats death as a fair-market-value deemed disposition with 50 percent inclusion", () => {
    const r = estate.calculateDeemedDisposition({
      fairMarketValue: 300000,
      adjustedCostBase: 100000,
      otherTaxableIncome: 0,
      provinceCode: "ON",
    });
    expect(r.capitalGain).toBe(200000);
    expect(r.taxableCapitalGain).toBe(100000);
    expect(r.totalTaxEstimate).toBeGreaterThan(0);
  });

  it("defers the gain when qualifying property rolls to a Canadian-resident spouse/common-law partner", () => {
    const r = estate.calculateDeemedDisposition({
      fairMarketValue: 500000,
      adjustedCostBase: 100000,
      transferToSpouseOrCommonLaw: true,
      spouseResidentInCanada: true,
    });
    expect(r.spouseRolloverApplied).toBe(true);
    expect(r.taxableCapitalGain).toBe(0);
    expect(r.totalTaxEstimate).toBe(0);
  });

  it("does not grant spouse rollover when the spouse/common-law partner is not Canadian-resident", () => {
    const r = estate.calculateDeemedDisposition({
      fairMarketValue: 500000,
      adjustedCostBase: 100000,
      transferToSpouseOrCommonLaw: true,
      spouseResidentInCanada: false,
      provinceCode: "ON",
    });
    expect(r.spouseRolloverApplied).toBe(false);
    expect(r.taxableCapitalGain).toBe(200000);
  });

  it("can exclude an eligible principal residence from this planning estimate", () => {
    const r = estate.calculateDeemedDisposition({
      fairMarketValue: 800000,
      adjustedCostBase: 250000,
      principalResidenceExempt: true,
    });
    expect(r.principalResidenceExemptionApplied).toBe(true);
    expect(r.taxableCapitalGain).toBe(0);
  });

  it("publishes Canada estate coverage as implemented with an official source", () => {
    const row = buildCountryRuleCatalog("CA").find((x) => x.key === "estate");
    expect(row.status).toBe("implemented");
    expect(row.hasCalculationSection).toBe(true);
    expect(row.officialSourceCount).toBeGreaterThan(0);
  });
});
