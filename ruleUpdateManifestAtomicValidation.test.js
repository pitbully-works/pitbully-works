import { describe, expect, it } from "vitest";
import { normalizeRuleUpdateManifestFeed } from "./utils/ruleUpdates.js";

const validUpdate = (overrides = {}) => ({
  id: "US-TEST-2027",
  country: "US",
  detectedAt: "2026-08-21",
  effectiveDate: "2027-01-01",
  sourceUrl: "https://www.irs.gov/",
  changes: [{ path: "investment.ira.contribution", after: 8000 }],
  ...overrides,
});

describe("atomic remote rule manifest validation", () => {
  it("accepts an empty documented feed and a well-formed update", () => {
    expect(normalizeRuleUpdateManifestFeed({ schemaVersion: 1, updates: [] })).toEqual([]);
    expect(normalizeRuleUpdateManifestFeed({ schemaVersion: 1, updates: [validUpdate()] })).toHaveLength(1);
  });

  it("rejects a manifest without the documented schema version", () => {
    expect(normalizeRuleUpdateManifestFeed({ updates: [] })).toBeNull();
    expect(normalizeRuleUpdateManifestFeed({ schemaVersion: 2, updates: [] })).toBeNull();
  });

  it("rejects duplicate IDs so one approval key cannot describe two remote rows", () => {
    const payload = { schemaVersion: 1, updates: [validUpdate(), validUpdate({ country: "CA" })] };
    expect(normalizeRuleUpdateManifestFeed(payload)).toBeNull();
  });

  it("rejects malformed paths, dates, source URLs and oversized change lists atomically", () => {
    expect(normalizeRuleUpdateManifestFeed({ schemaVersion: 1, updates: [validUpdate({ changes: [{ path: "__proto__.x", after: 1 }] })] })).toBeNull();
    expect(normalizeRuleUpdateManifestFeed({ schemaVersion: 1, updates: [validUpdate({ effectiveDate: "2027-02-30" })] })).toBeNull();
    expect(normalizeRuleUpdateManifestFeed({ schemaVersion: 1, updates: [validUpdate({ sourceUrl: "javascript:alert(1)" })] })).toBeNull();
    expect(normalizeRuleUpdateManifestFeed({ schemaVersion: 1, updates: [validUpdate({ changes: Array.from({ length: 101 }, (_, i) => ({ path: `investment.test.p${i}`, after: i })) })] })).toBeNull();
  });
});
