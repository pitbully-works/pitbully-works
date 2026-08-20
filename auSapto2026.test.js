import { describe, it, expect } from "vitest";
import { AU_COUNTRY_RULES } from "./countryRules/AU.js";

describe("AU 2026-27 SAPTO", () => {
  const tax = AU_COUNTRY_RULES.tax;

  it("明示的にeligibleでない場合はSAPTOを適用しない", () => {
    expect(tax.calculateSeniorsAndPensionersTaxOffset(30_000, "single", false)).toBe(0);
    expect(tax.calculateTotalTax(40_000).saptoApplied).toBe(0);
  });

  it("singleは最大$2,230、shade-out後は12.5%で減額しcut-outで0", () => {
    expect(tax.calculateSeniorsAndPensionersTaxOffset(34_919, "single", true)).toBe(2_230);
    expect(tax.calculateSeniorsAndPensionersTaxOffset(40_000, "single", true)).toBeCloseTo(1594.875, 6);
    expect(tax.calculateSeniorsAndPensionersTaxOffset(52_759, "single", true)).toBe(0);
  });

  it("coupleとillness-separatedの公式閾値を保持する", () => {
    expect(tax.calculateSeniorsAndPensionersTaxOffset(30_994, "couple", true)).toBe(1_602);
    expect(tax.calculateSeniorsAndPensionersTaxOffset(43_810, "couple", true)).toBe(0);
    expect(tax.calculateSeniorsAndPensionersTaxOffset(33_732, "illnessSeparated", true)).toBe(2_040);
    expect(tax.calculateSeniorsAndPensionersTaxOffset(50_052, "illnessSeparated", true)).toBe(0);
  });

  it("SAPTOは非還付型でLITO適用後の所得税を0未満にしない", () => {
    const r = tax.calculateTotalTax(30_000, { saptoEligible: true, saptoStatus: "single", rebateIncome: 30_000 });
    expect(r.saptoEntitlement).toBe(2_230);
    expect(r.saptoApplied).toBeLessThanOrEqual(r.incomeTaxBeforeOffsets - r.litoApplied);
    expect(r.incomeTax).toBeGreaterThanOrEqual(0);
  });

  it("SAPTOは実装済みだが資格完全自動判定とspouse transferは未実装として残す", () => {
    const text = tax.notImplemented.join(" / ");
    expect(text).not.toMatch(/SAPTO・最大\$2,230/);
    expect(text).toMatch(/spouse transfer/);
  });
});
