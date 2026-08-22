import { describe, expect, it } from "vitest";
import { CA_COUNTRY_RULES } from "./countryRules/CA.js";

describe("CA grouped audit phases 78–81 — dividend scope disclosure boundaries", () => {
  const tax = CA_COUNTRY_RULES.tax;

  it("states that the live dividend calculator is federal in scope", () => {
    expect(typeof tax.calculateFederalDividendTax).toBe("function");
    expect(tax.sourceUrls.federalDividendTaxCredit).toContain("canada.ca");
  });

  it("explicitly discloses that provincial and territorial dividend tax credits are not implemented", () => {
    const listed = tax.notImplemented.some((n) =>
      n.includes("配当税額控除") && n.includes("未実装") && n.includes("連邦")
    );
    expect(listed).toBe(true);
  });

  it("does not mislabel the tax coverage summary as a full provincial dividend-credit implementation", () => {
    const coverage = CA_COUNTRY_RULES.meta.coverage.find((x) => x.key === "tax");
    expect(coverage.status).toBe("partial");
    expect(coverage.updateJa).toContain("連邦");
    expect(coverage.updateEn).toContain("federal");
  });

  it("keeps dividend results finite while the provincial credit remains outside model scope", () => {
    const r = tax.calculateFederalDividendTax({
      eligibleDividends: 10000,
      nonEligibleDividends: 5000,
      otherTaxableIncome: 90000,
    });
    expect(Number.isFinite(r.netFederalTax)).toBe(true);
    expect(Number.isFinite(r.incrementalFederalTax)).toBe(true);
  });
});
