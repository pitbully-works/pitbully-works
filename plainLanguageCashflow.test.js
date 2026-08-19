import { describe, it, expect } from "vitest";
import { JA_TRANSLATIONS } from "./translations/ja.js";
import { EN_TRANSLATIONS } from "./translations/en.js";

describe("annual cashflow uses plain-language labels", () => {
  it("Japanese avoids accounting jargon in the user-facing cashflow table", () => {
    expect(JA_TRANSLATIONS.cashflowOpeningAssetsLabel).toContain("スタート時点");
    expect(JA_TRANSLATIONS.cashflowClosingAssetsLabel).toContain("年末に残る");
    expect(JA_TRANSLATIONS.cashflowAssetChangeLabel).toContain("投資などで増えた・減ったお金");
    expect(JA_TRANSLATIONS.annualCashflowTermsGuide).toContain("赤字でも");
    expect(JA_TRANSLATIONS.cashflowInvestmentReturnLabel).toContain("投資で増えた");
    expect(JA_TRANSLATIONS.cashflowAnnualNetLabel).toContain("黒字・赤字");
    expect(JA_TRANSLATIONS.assetValueModeNominal).toContain("物価上昇");
    expect(JA_TRANSLATIONS.assetValueModeReal).toContain("今の価値");
    ["期首資産", "期末資産", "運用益", "名目資産", "実質資産"].forEach((word) => {
      expect(JA_TRANSLATIONS.cashflowOpeningAssetsLabel).not.toBe(word);
      expect(JA_TRANSLATIONS.cashflowClosingAssetsLabel).not.toBe(word);
    });
  });

  it("English uses everyday money wording", () => {
    expect(EN_TRANSLATIONS.cashflowOpeningAssetsLabel).toContain("start of that year");
    expect(EN_TRANSLATIONS.cashflowClosingAssetsLabel).toContain("year-end");
    expect(EN_TRANSLATIONS.cashflowAssetChangeLabel).toContain("investments");
    expect(EN_TRANSLATIONS.annualCashflowTermsGuide).toContain("deficit");
    expect(EN_TRANSLATIONS.cashflowAnnualNetLabel).toContain("surplus / shortfall");
    expect(EN_TRANSLATIONS.assetValueModeReal).toContain("today's value");
  });
});
