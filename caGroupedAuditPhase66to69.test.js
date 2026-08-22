import { describe, it, expect } from "vitest";
import { CA_COUNTRY_RULES } from "./countryRules/CA.js";

const tax = CA_COUNTRY_RULES.tax;

describe("CA grouped audit phases 66-69 - pension income splitting planning boundary", () => {
  it("defaults to the statutory planning ceiling of 50% of eligible pension income", () => {
    const r = tax.getPensionIncomeSplit({ eligiblePensionIncome: 40000 });
    expect(r.maximumTransfer).toBe(20000);
    expect(r.transferred).toBe(20000);
    expect(r.pensionerRetains).toBe(20000);
  });

  it("honours a requested transfer below the 50% ceiling", () => {
    const r = tax.getPensionIncomeSplit({ eligiblePensionIncome: 40000, requestedSplit: 12500 });
    expect(r.maximumTransfer).toBe(20000);
    expect(r.transferred).toBe(12500);
    expect(r.pensionerRetains).toBe(27500);
  });

  it("caps an excessive requested transfer at 50%", () => {
    const r = tax.getPensionIncomeSplit({ eligiblePensionIncome: 40000, requestedSplit: 30000 });
    expect(r.transferred).toBe(20000);
    expect(r.pensionerRetains).toBe(20000);
  });

  it("never creates negative pension income or transfers from invalid inputs", () => {
    const negative = tax.getPensionIncomeSplit({ eligiblePensionIncome: -1000, requestedSplit: 500 });
    const invalid = tax.getPensionIncomeSplit({ eligiblePensionIncome: "invalid", requestedSplit: -50 });
    expect(negative).toEqual({ eligiblePensionIncome: 0, maximumTransfer: 0, transferred: 0, pensionerRetains: 0 });
    expect(invalid).toEqual({ eligiblePensionIncome: 0, maximumTransfer: 0, transferred: 0, pensionerRetains: 0 });
  });
});
