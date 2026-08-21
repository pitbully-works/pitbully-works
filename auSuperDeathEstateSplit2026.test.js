import { describe, it, expect } from "vitest";
import { AU_COUNTRY_RULES } from "./countryRules/AU.js";

describe("AU 2026-27 Super death benefit: mixed beneficiaries through deceased estate", () => {
  const calc = (x) => AU_COUNTRY_RULES.estate.calculateSuperDeathBenefitLumpSum({ paymentRoute: "estate", ...x });
  it("taxes only the non-dependant half for a 50/50 estate split", () => {
    const r = calc({ taxedElement: 100000, untaxedElement: 50000, dependantSharePercent: 50 });
    expect(r.tax).toBeCloseTo((100000 * .15 + 50000 * .30) * .5, 8);
  });
  it("100% dependant remains tax free", () => expect(calc({ taxedElement: 100000, dependantSharePercent: 100 }).tax).toBe(0));
  it("0% dependant applies the full estate non-dependant estimate", () => expect(calc({ taxedElement: 100000, dependantSharePercent: 0 }).tax).toBeCloseTo(15000, 8));
  it("tax-free component stays tax free under a mixed split", () => {
    const a = calc({ taxFreeComponent: 90000, taxedElement: 100000, dependantSharePercent: 40 });
    const b = calc({ taxedElement: 100000, dependantSharePercent: 40 });
    expect(a.tax).toBe(b.tax);
  });
  it("clamps dependant share above 100", () => expect(calc({ taxedElement: 100000, dependantSharePercent: 150 }).tax).toBe(0));
  it("clamps dependant share below zero", () => expect(calc({ taxedElement: 100000, dependantSharePercent: -20 }).tax).toBeCloseTo(15000, 8));
});
