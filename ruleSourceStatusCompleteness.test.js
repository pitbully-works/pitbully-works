import { describe, expect, it } from "vitest";
import { normalizeRuleSourceStatusFeed } from "./utils/ruleUpdates.js";

const registry = [
  { id: "JP-ONE", country: "JP", url: "https://example.com/one" },
  { id: "US-TWO", country: "US", url: "https://example.com/two" },
];
const checkedAt = "2026-08-21T22:00:00.000Z";
const hashA = "a".repeat(64);
const hashB = "b".repeat(64);
const validSources = [
  { id: "JP-ONE", country: "JP", changed: false, hash: hashA, checkedAt, error: "" },
  { id: "US-TWO", country: "US", changed: true, hash: hashB, checkedAt, error: "" },
];

describe("rule-source status completed-pass boundary", () => {
  it("accepts only a complete successful watcher pass", () => {
    const out = normalizeRuleSourceStatusFeed({ schemaVersion: 1, checkedAt, sources: validSources }, registry);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ id: "JP-ONE", hash: hashA, checkedAt });
    expect(out[1]).toMatchObject({ id: "US-TWO", hash: hashB, checkedAt });
  });

  it("rejects empty or truncated source lists instead of treating them as checked", () => {
    expect(normalizeRuleSourceStatusFeed({ schemaVersion: 1, checkedAt, sources: [] }, registry)).toBeNull();
    expect(normalizeRuleSourceStatusFeed({ schemaVersion: 1, checkedAt, sources: validSources.slice(0, 1) }, registry)).toBeNull();
  });

  it("rejects a watcher pass containing any fetch error or missing hash", () => {
    const errored = validSources.map((row) => ({ ...row }));
    errored[1].error = "HTTP 503";
    expect(normalizeRuleSourceStatusFeed({ schemaVersion: 1, checkedAt, sources: errored }, registry)).toBeNull();

    const missingHash = validSources.map((row) => ({ ...row }));
    missingHash[1].hash = "";
    expect(normalizeRuleSourceStatusFeed({ schemaVersion: 1, checkedAt, sources: missingHash }, registry)).toBeNull();
  });

  it("requires one consistent ISO timestamp for the completed watcher pass", () => {
    expect(normalizeRuleSourceStatusFeed({ schemaVersion: 1, checkedAt: "", sources: validSources }, registry)).toBeNull();
    const mismatched = validSources.map((row) => ({ ...row }));
    mismatched[1].checkedAt = "2026-08-21T22:00:01.000Z";
    expect(normalizeRuleSourceStatusFeed({ schemaVersion: 1, checkedAt, sources: mismatched }, registry)).toBeNull();
  });
});
