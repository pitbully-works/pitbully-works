import { describe, expect, it } from "vitest";
import { CA_COUNTRY_RULES } from "./countryRules/CA.js";

describe("overseas 100 phase 20 compatibility", () => {
  const tax = CA_COUNTRY_RULES.tax;

  it("keeps all thirteen Canadian province/territory codes visible", () => {
    expect(tax.province.implementedRegions).toEqual(
      ["ON","QC","BC","AB","MB","SK","NS","NB","PE","NL","NT","NU","YT"]
    );
  });

  it("keeps human-readable region labels for existing UI/tests", () => {
    expect(tax.region).toMatch(/Ontario/);
    expect(tax.region).toMatch(/Prince Edward Island/);
    expect(tax.region).toMatch(/Newfoundland and Labrador/);
    expect(tax.region).toMatch(/Yukon/);
  });

  it("does not describe any Canadian province or territory income tax as unimplemented", () => {
    expect(tax.notImplemented.join(" / ")).toMatch(/10州・3準州を実装済み/);
  });

  it.each(["NL","NT","NU","YT"])("%s participates in capital-gains provincial tax", (code) => {
    expect(tax.calculateProvincialCapitalGainsTax(20000, 60000, code)).toBeGreaterThan(0);
  });
});
