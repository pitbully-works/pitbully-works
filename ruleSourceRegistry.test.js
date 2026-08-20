import { describe, expect, it } from "vitest";
import { RULE_SOURCE_REGISTRY, getRuleSourcesForCountry } from "./utils/ruleSourceRegistry.js";

describe("5か国制度更新の公式監視対象", () => {
  it("JP/US/GB/CA/AUすべてに公式監視対象が3件以上ある", () => {
    for (const country of ["JP", "US", "GB", "CA", "AU"]) {
      const sources = getRuleSourcesForCountry(country);
      expect(sources.length).toBeGreaterThanOrEqual(3);
      expect(sources.every((x) => x.country === country)).toBe(true);
      expect(sources.every((x) => x.url.startsWith("https://"))).toBe(true);
    }
    expect(RULE_SOURCE_REGISTRY).toHaveLength(15);
  });

  it("公式ページの変更検知だけでは計算ルールのpathを持たない", () => {
    expect(RULE_SOURCE_REGISTRY.every((x) => !("changes" in x) && !("path" in x))).toBe(true);
  });

  it("日本はNISA・iDeCo・公的年金を監視する", () => {
    expect(getRuleSourcesForCountry("JP").map((x) => x.category)).toEqual(["nisa", "ideco", "publicPension"]);
  });
});
