import { describe, it, expect } from "vitest";
import { AU_COUNTRY_RULES } from "./countryRules/AU.js";

describe("AU 2026-27 Super death-benefit income-stream treatment", () => {
  const f = (x) => AU_COUNTRY_RULES.estate.getSuperDeathBenefitIncomeStreamTreatment(x);
  it("non-dependant is ineligible for a new death-benefit income stream", () => expect(f({isDeathBenefitsDependant:false}).eligible).toBe(false));
  it("dependant recipient age 60 makes taxed element tax free", () => expect(f({isDeathBenefitsDependant:true,recipientAge:60,deceasedAge:50}).taxedElementTaxFree).toBe(true));
  it("deceased age 60 makes taxed element tax free", () => expect(f({isDeathBenefitsDependant:true,recipientAge:40,deceasedAge:60}).taxedElementTaxFree).toBe(true));
  it("age-60-plus untaxed element gets 10% offset", () => expect(f({isDeathBenefitsDependant:true,recipientAge:60,deceasedAge:50}).untaxedElementOffsetRate).toBe(0.10));
  it("both under 60 taxed element gets 15% offset", () => expect(f({isDeathBenefitsDependant:true,recipientAge:59,deceasedAge:59}).taxedElementOffsetRate).toBe(0.15));
  it("both under 60 untaxed element gets no offset", () => expect(f({isDeathBenefitsDependant:true,recipientAge:59,deceasedAge:59}).untaxedElementOffsetRate).toBe(0));
});
