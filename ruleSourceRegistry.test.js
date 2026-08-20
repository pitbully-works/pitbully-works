import { describe, expect, it } from "vitest";
import { RULE_SOURCE_REGISTRY, getRuleSourcesForCountry } from "./utils/ruleSourceRegistry.js";

describe("JP制度更新の公式監視対象", () => {
  it("NISA・iDeCo・公的年金の3制度を公式情報源で監視する", () => {
    const jp = getRuleSourcesForCountry("JP");
    expect(jp.map((x) => x.category)).toEqual(["nisa", "ideco", "publicPension"]);
    expect(jp.every((x) => x.url.startsWith("https://"))).toBe(true);
    expect(RULE_SOURCE_REGISTRY).toHaveLength(3);
  });

  it("公式ページの変更検知だけでは計算ルールのpathを持たない", () => {
    const jp = getRuleSourcesForCountry("JP");
    expect(jp.every((x) => !("changes" in x) && !("path" in x))).toBe(true);
  });
});
