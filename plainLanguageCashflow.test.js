import { describe, it, expect } from "vitest";
import { JA_TRANSLATIONS } from "./translations/ja.js";
import { EN_TRANSLATIONS } from "./translations/en.js";

describe("annual cashflow uses concise financial labels", () => {
  it("Japanese uses the adopted display labels", () => {
    expect(JA_TRANSLATIONS.cashflowOpeningAssetsLabel).toBe("年初の資産");
    expect(JA_TRANSLATIONS.cashflowInvestmentReturnLabel).toBe("運用益");
    expect(JA_TRANSLATIONS.cashflowPublicPensionLabel).toBe("公的年金");
    expect(JA_TRANSLATIONS.cashflowPrivatePensionLabel).toBe("民間年金");
    expect(JA_TRANSLATIONS.cashflowTotalIncomeLabel).toBe("年間収入");
    expect(JA_TRANSLATIONS.cashflowLivingCostLabel).toBe("生活費");
    expect(JA_TRANSLATIONS.cashflowHealthCostLabel).toBe("医療費");
    expect(JA_TRANSLATIONS.cashflowTaxFixedCostLabel).toBe("税金・固定費");
    expect(JA_TRANSLATIONS.cashflowInsuranceLabel).toBe("保険料");
    expect(JA_TRANSLATIONS.cashflowLoanLabel).toBe("ローン返済");
    expect(JA_TRANSLATIONS.cashflowTotalOutflowLabel).toBe("年間支出");
    expect(JA_TRANSLATIONS.cashflowAnnualNetLabel).toBe("家計の収支");
    expect(JA_TRANSLATIONS.cashflowAssetChangeLabel).toBe("資産の増減");
    expect(JA_TRANSLATIONS.cashflowClosingAssetsLabel).toBe("年末の資産");
    expect(JA_TRANSLATIONS.cashflowRealClosingAssetsLabel).toBe("現在価値");
  });

  it("provides the three quick-help definitions", () => {
    expect(JA_TRANSLATIONS.cashflowQuickHelpAnnualNet).toBe("家計の収支＝年間収入−年間支出");
    expect(JA_TRANSLATIONS.cashflowQuickHelpAssetChange).toBe("資産の増減＝投資・資産移動による変化");
    expect(JA_TRANSLATIONS.cashflowQuickHelpPresentValue).toBe("現在価値＝インフレを考慮した金額");
    expect(EN_TRANSLATIONS.cashflowQuickHelpAnnualNet).toContain("annual income");
    expect(EN_TRANSLATIONS.cashflowQuickHelpAssetChange).toContain("Asset change");
    expect(EN_TRANSLATIONS.cashflowQuickHelpPresentValue).toContain("inflation");
  });
});
