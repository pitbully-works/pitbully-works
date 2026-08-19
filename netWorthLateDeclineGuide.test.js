import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("net worth late decline guide", () => {
  it("shows a plain-language explanation below the net-worth chart", () => {
    const app = readFileSync(resolve(process.cwd(), "App.jsx"), "utf8");
    const ja = readFileSync(resolve(process.cwd(), "translations/ja.js"), "utf8");
    expect(app).toContain('t("netWorthLateDeclineGuide")');
    expect(ja).toContain("なぜ後半になると資産が減りやすくなるの？");
    expect(ja).toContain("運用に回る元のお金も減る");
  });
});
