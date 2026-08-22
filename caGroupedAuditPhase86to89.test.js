import { describe, it, expect } from "vitest";
import { CA_COUNTRY_RULES } from "./countryRules/CA.js";

describe("CA grouped audit phases 86-89 - final scope and terminology consistency", () => {
  it("distinguishes CPP pension sharing from CRA pension income splitting", () => {
    const retirementMissing = CA_COUNTRY_RULES.retirement.notImplemented.join("\n");
    const taxMissing = CA_COUNTRY_RULES.tax.notImplemented.join("\n");
    expect(retirementMissing).toContain("CPP pension sharing");
    expect(retirementMissing).toContain("pension income splittingとは別制度");
    expect(taxMissing).toContain("年金所得分割は最大50%の移転上限を計画用に実装済み");
  });

  it("keeps an official Service Canada source for CPP pension sharing", () => {
    expect(CA_COUNTRY_RULES.retirement.sourceUrls.cppPensionSharing)
      .toBe("https://www.canada.ca/en/services/benefits/publicpensions/cpp/share-cpp.html");
  });

  it("keeps the implemented CRA pension-income split planning cap at 50 percent", () => {
    const r = CA_COUNTRY_RULES.tax.getPensionIncomeSplit({ eligiblePensionIncome: 24000 });
    expect(r.maximumTransfer).toBe(12000);
    expect(r.transferred).toBe(12000);
    expect(r.pensionerRetains).toBe(12000);
  });

  it("keeps non-uniform Canadian items explicitly bounded rather than silently nationwide", () => {
    expect(CA_COUNTRY_RULES.healthcare.longTermCare.automaticRegions).toEqual(["ON"]);
    expect(CA_COUNTRY_RULES.healthcare.notImplemented.join("\n")).toContain("オンタリオ州以外の長期介護");
    expect(CA_COUNTRY_RULES.tax.notImplemented.join("\n")).toContain("Alternative Minimum Tax");
    expect(CA_COUNTRY_RULES.tax.notImplemented.join("\n")).toContain("州・準州の配当税額控除");
  });
});
