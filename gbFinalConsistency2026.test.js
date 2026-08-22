import { describe, expect, it } from "vitest";
import { GB_COUNTRY_RULES } from "./countryRules/GB.js";
import { JA_TRANSLATIONS as ja } from "./translations/ja.js";
import { EN_TRANSLATIONS as en } from "./translations/en.js";

describe("GB 2026/27 final user-facing consistency", () => {
  it("marks the final verification date as 2026-08-21", () => {
    expect(GB_COUNTRY_RULES.meta.verifiedAsOf).toBe("2026-08-21");
  });

  it("keeps Scottish Income Tax implemented in coverage", () => {
    const tax = GB_COUNTRY_RULES.meta.coverage.find((x) => x.key === "tax");
    expect(tax?.status).toBe("implemented");
    expect(tax?.updateEn).toContain("Scottish Income Tax");
  });

  it("keeps Inheritance Tax implemented in coverage", () => {
    const estate = GB_COUNTRY_RULES.meta.coverage.find((x) => x.key === "estate");
    expect(estate?.status).toBe("implemented");
    expect(estate?.updateEn).toContain("Inheritance Tax");
  });

  it("Japanese tax source note no longer falsely says Scottish tax or IHT is unimplemented", () => {
    const note = ja.gbTaxSourceNote;
    expect(note).toContain("Scottish Income Taxにも対応");
    expect(note).toContain("Inheritance Taxは相続セクションで概算");
    expect(note).not.toContain("スコットランド税率、National Insurance、貯蓄利子課税、相続税は未実装");
  });

  it("English tax source note no longer falsely says Scottish tax or IHT is unimplemented", () => {
    const note = en.gbTaxSourceNote;
    expect(note).toContain("Scottish Income Tax is supported");
    expect(note).toContain("Inheritance Tax is estimated in the estate section");
    expect(note).not.toContain("Scottish Income Tax, National Insurance, tax on savings interest and Inheritance Tax are not implemented");
  });

  it("now identifies only savings-interest tax as the remaining source-note gap", () => {
    expect(ja.gbTaxSourceNote).toContain("貯蓄利子課税は未実装");
    expect(ja.gbTaxSourceNote).not.toContain("National Insuranceと貯蓄利子課税は未実装");
    expect(en.gbTaxSourceNote).toContain("Tax on savings interest is not implemented");
    expect(en.gbTaxSourceNote).not.toContain("National Insurance and tax on savings interest are not implemented");
  });
});
