import { describe, expect, it } from "vitest";
import { RULE_SOURCE_REGISTRY, getRuleSourcesForCountry } from "./utils/ruleSourceRegistry.js";

describe("5か国制度更新の公式監視対象", () => {
  it("JP/US/GB/CA/AUすべてに共通5分野以上の公式監視対象がある", () => {
    for (const country of ["JP", "US", "GB", "CA", "AU"]) {
      const sources = getRuleSourcesForCountry(country);
      expect(sources.length).toBeGreaterThanOrEqual(5);
      expect(sources.every((x) => x.country === country)).toBe(true);
      expect(sources.every((x) => x.url.startsWith("https://"))).toBe(true);
    }
    // 共通5分野を5か国ぶん監視できることを保証する。
    // 今後ソースを追加しても、このテスト自体が壊れないよう下限で確認する。
    expect(RULE_SOURCE_REGISTRY.length).toBeGreaterThanOrEqual(25);
  });

  it("公式ページの変更検知だけでは計算ルールのpathを持たない", () => {
    expect(RULE_SOURCE_REGISTRY.every((x) => !("changes" in x) && !("path" in x))).toBe(true);
  });

  it("日本はNISA・iDeCo・公的年金に加えて医療・税・相続も監視する", () => {
    expect(getRuleSourcesForCountry("JP").map((x) => x.category)).toEqual(
      expect.arrayContaining(["nisa", "ideco", "publicPension", "healthcare", "tax", "estate"]),
    );
  });
});
