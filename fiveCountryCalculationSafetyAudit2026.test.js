import { describe, it, expect } from "vitest";
import { JP_COUNTRY_RULES } from "./countryRules/JP.js";
import { US_COUNTRY_RULES } from "./countryRules/US.js";
import { GB_COUNTRY_RULES } from "./countryRules/GB.js";
import { CA_COUNTRY_RULES } from "./countryRules/CA.js";
import { AU_COUNTRY_RULES } from "./countryRules/AU.js";

const finite = (value) => {
  expect(typeof value).toBe("number");
  expect(Number.isFinite(value)).toBe(true);
};

const finiteTree = (value) => {
  if (typeof value === "number") {
    expect(Number.isFinite(value)).toBe(true);
  } else if (Array.isArray(value)) {
    value.forEach(finiteTree);
  } else if (value && typeof value === "object") {
    Object.values(value).forEach(finiteTree);
  }
};

describe("5-country calculation safety audit - 2026", () => {
  it("JP keeps contribution calculations finite", () => {
    finite(JP_COUNTRY_RULES.retirement.getMonthlyContributionLimit(
      "employeeWithCorporatePension",
      "not-a-number"
    ));
  });

  it("US normalises malformed numeric input instead of emitting NaN", () => {
    finite(US_COUNTRY_RULES.retirement.getMonthlyBenefit(
      "not-a-number",
      "not-a-number"
    ));
    finiteTree(US_COUNTRY_RULES.tax.calculateFederalTax(
      "not-a-number",
      "unknown"
    ));
    finite(US_COUNTRY_RULES.tax.calculateNiit(
      "not-a-number",
      "not-a-number",
      "unknown"
    ));
  });

  it("GB keeps malformed tax input finite", () => {
    finiteTree(GB_COUNTRY_RULES.tax.calculateIncomeTax("not-a-number"));
  });

  it("CA keeps malformed tax input finite", () => {
    finiteTree(CA_COUNTRY_RULES.tax.calculateFederalTax("not-a-number"));
  });

  it("AU keeps malformed tax input finite", () => {
    finiteTree(AU_COUNTRY_RULES.tax.calculateTotalTax("not-a-number"));
  });

  it("representative calculations remain finite across all five countries", () => {
    [
      JP_COUNTRY_RULES.retirement.getMonthlyContributionLimit(
        "employeeWithCorporatePension", 10000
      ),
      US_COUNTRY_RULES.tax.calculateFederalTax(100000, "single").tax,
      GB_COUNTRY_RULES.tax.calculateIncomeTax(100000).tax,
      CA_COUNTRY_RULES.tax.calculateFederalTax(100000).tax,
      AU_COUNTRY_RULES.tax.calculateTotalTax(100000).total,
    ].forEach(finite);
  });
});
