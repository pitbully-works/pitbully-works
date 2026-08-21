import { describe, it, expect } from "vitest";
import fs from "node:fs";

describe("AU Age Pension: partner under Age Pension age super treatment", () => {
  it("keeps the limitation explicit in AU retirement rules", async () => {
    const { AU_COUNTRY_RULES } = await import("./countryRules/AU.js");
    const text = AU_COUNTRY_RULES.retirement.notImplemented.join(" / ");
    expect(text).toMatch(/片方だけが受給資格年齢/);
    expect(text).toMatch(/Super/);
    expect(text).toMatch(/除外/);
  });

  it("shows a warning only when couple and only one partner is qualified", () => {
    const panel = fs.readFileSync(new URL("./panels/AURetirementPanel.jsx", import.meta.url), "utf8");
    expect(panel).toContain('status === "couple" && !bothQualified');
    expect(panel).toContain('auPartnerUnderAgeSuperLimitationNote');
  });

  it("provides Japanese and English explanatory text", () => {
    const ja = fs.readFileSync(new URL("./translations/ja.js", import.meta.url), "utf8");
    const en = fs.readFileSync(new URL("./translations/en.js", import.meta.url), "utf8");
    expect(ja).toContain('"auPartnerUnderAgeSuperLimitationNote"');
    expect(en).toContain('"auPartnerUnderAgeSuperLimitationNote"');
    expect(ja).toContain("資産・Deeming対象から除外");
    expect(en).toContain("generally exempt");
  });
});
