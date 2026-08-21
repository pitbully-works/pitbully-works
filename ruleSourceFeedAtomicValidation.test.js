import { describe, expect, it } from "vitest";
import { normalizeRuleSourceStatusFeed } from "./utils/ruleUpdates.js";

const registry = [
  { id: "JP-ONE", country: "JP", url: "https://example.com/one" },
  { id: "US-TWO", country: "US", url: "https://example.com/two" },
];
const hash = "a".repeat(64);

describe("rule-source status atomic validation", () => {
  it("accepts valid rows and pins the URL to the bundled registry", () => {
    const out = normalizeRuleSourceStatusFeed({ schemaVersion: 1, sources: [
      { id: "JP-ONE", country: "jp", changed: true, hash, url: "https://evil.invalid" },
    ] }, registry);
    expect(out).toEqual([{ id: "JP-ONE", country: "JP", changed: true, hash, url: "https://example.com/one" }]);
  });

  it("rejects the whole feed when an unknown source is mixed with a valid one", () => {
    expect(normalizeRuleSourceStatusFeed({ schemaVersion: 1, sources: [
      { id: "JP-ONE", country: "JP", changed: false, hash: "" },
      { id: "JP-UNKNOWN", country: "JP", changed: false, hash: "" },
    ] }, registry)).toBeNull();
  });

  it("rejects duplicate IDs instead of rendering duplicate alerts", () => {
    expect(normalizeRuleSourceStatusFeed({ schemaVersion: 1, sources: [
      { id: "JP-ONE", country: "JP", changed: false, hash: "" },
      { id: "JP-ONE", country: "JP", changed: true, hash },
    ] }, registry)).toBeNull();
  });

  it("rejects a country mismatch and malformed non-empty hash", () => {
    expect(normalizeRuleSourceStatusFeed({ schemaVersion: 1, sources: [
      { id: "JP-ONE", country: "US", changed: false, hash: "" },
    ] }, registry)).toBeNull();
    expect(normalizeRuleSourceStatusFeed({ schemaVersion: 1, sources: [
      { id: "JP-ONE", country: "JP", changed: true, hash: "not-a-sha256" },
    ] }, registry)).toBeNull();
  });

  it("rejects oversized status arrays before retaining remote data", () => {
    const sources = Array.from({ length: 501 }, (_, i) => ({ id: `X-${i}`, country: "JP" }));
    expect(normalizeRuleSourceStatusFeed({ schemaVersion: 1, sources }, registry)).toBeNull();
  });
});
