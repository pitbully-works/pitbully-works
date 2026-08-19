import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("net worth late decline guide", () => {
  it("shows a plain-language explanation below the net-worth chart", () => {
    const app = readFileSync(resolve(process.cwd(), "App.jsx"), "utf8");
    const ja = readFileSync(resolve(process.cwd(), "translations/ja.js"), "utf8");
    expect(app).toContain('t("netWorthLateDeclineGuide")');
    expect(app).toContain('t("netWorthFinalSummary"');
    expect(app).toContain('amount: money(netWorthFinal)');
    expect(ja).toContain("なぜ後半になると資産が減りやすくなるの？");
    expect(ja).toContain("5,000万円を年5%で運用すると年間250万円");
    expect(ja).toContain("支出の増加");
    expect(ja).toContain("運用で増える金額の減少");
    expect(ja).toContain("現在の設定では、{age}時点に残る純資産は {amount} の予測です。");
  });
});
