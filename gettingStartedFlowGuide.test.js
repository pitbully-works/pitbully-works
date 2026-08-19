import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("7-step getting-started flow guide", () => {
  it("adds a jumpable 7-step flow without increasing the fixed quick-nav button count", () => {
    const app = readFileSync(resolve(process.cwd(), "App.jsx"), "utf8");
    const ja = readFileSync(resolve(process.cwd(), "translations/ja.js"), "utf8");
    const en = readFileSync(resolve(process.cwd(), "translations/en.js"), "utf8");
    const enGB = readFileSync(resolve(process.cwd(), "translations/enGB.js"), "utf8");
    const index = readFileSync(resolve(process.cwd(), "translations/index.js"), "utf8");

    expect(app).toContain('id="section-guide"');
    expect(app).toContain('{ anchor: "section-overview", short: t("navShortOverview") }');
    expect(app).toContain('if (anchor === "section-overview")');
    expect(app).toContain('document.getElementById("section-guide")');
    expect(app).toContain('[7, "guideStep7Title", "guideStep7Desc", "section-networth-chart"]');
    expect(app).toContain('setShowGettingStarted(true)');
    expect(app).toContain('t("guideFinalCheckTitle")');
    expect(app).toContain('className="guide-easy-mode"');
    expect(app).toContain('t("guideEasyRequiredTitle")');
    expect(app).toContain('t("guideEasyRecommendedTitle")');
    expect(app).toContain('t("guideEasyOptionalTitle")');
    expect(app).toContain('document.getElementById("section-00")');

    expect(ja).toContain('"navShortOverview": "ガイド"');
    expect(ja).toContain('"guideEasyRequiredTitle": "まずはここだけ入力（約3分）"');
    expect(ja).toContain('"guideEasyRecommendedTitle": "さらに入力すると精度が向上（約10分）"');
    expect(ja).toContain('"guideEasyOptionalTitle": "必要な人だけ追加"');
    expect(en).toContain('"guideEasyRequiredTitle": "Start with just these (about 3 min)"');
    expect(en).toContain('"guideEasyOptionalTitle": "Add only if relevant to you"');
    expect(enGB).toContain('"guideEasyRequiredPublicPension": "State Pension"');
    expect(ja).toContain('"guideStepLabel": "ステップ"');
    expect(ja).toContain('"guideStep1Title": "本人・基本情報"');
    expect(ja).toContain('"guideStep7Title": "比較・グラフで最終確認"');
    expect(ja).toContain('"guideFinalWallet": "資産まとめ"');
    expect(ja).toContain('"guideFinalDiagnosis": "診断"');
    expect(ja).toContain('"guideFinalCompare": "比較"');
    expect(ja).toContain('"guideFinalChart": "グラフ"');

    expect(app).toContain('t("guideRecommendedCheckTitle")');
    expect(app).toContain('t("guideRecommendedCheck65")');
    expect(app).toContain('t("guideRecommendedCheckPeak")');
    expect(app).toContain('t("guideRecommendedCheckLife")');
    expect(app).toContain('t("guideRecommendedCheckZero")');
    expect(app).toContain('t("guideFinalCaution")');

    expect(ja).toContain('"guideRecommendedCheckTitle": "推奨チェック項目"');
    expect(en).toContain('"guideRecommendedCheckTitle": "Recommended checks"');
    expect(enGB).toContain('"guideStep3Desc": "Enter State and private pension income.');
    expect(index).toContain('JP→ja / US・CA・AU→en / GB→en-GB');
  });
});
