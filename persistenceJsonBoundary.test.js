import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const app = readFileSync(join(process.cwd(), "App.jsx"), "utf8");
const storage = readFileSync(join(process.cwd(), "storageShim.js"), "utf8");

describe("persisted JSON trust-boundary caps", () => {
  it("caps calculator-history JSON before parsing", () => {
    expect(app).toContain("MAX_SCI_HISTORY_JSON_CHARS = 256_000");
    expect(app).toContain("raw.length > MAX_SCI_HISTORY_JSON_CHARS");
  });

  it("caps rule-update state JSON before parsing", () => {
    expect(app).toContain("MAX_RULE_UPDATE_JSON_CHARS = 1_000_000");
    expect(app).toContain("raw.length <= MAX_RULE_UPDATE_JSON_CHARS");
  });

  it("caps main persisted data and individual snapshots before JSON.parse", () => {
    expect(app).toContain("MAX_PERSISTED_JSON_CHARS = 8_000_000");
    expect(app).toContain('throw new RangeError("Saved data is too large")');
    expect(app).toContain("res.value.length > MAX_PERSISTED_JSON_CHARS");
  });

  it("preserves malformed main persistence under a recovery key before safe fallback autosave", () => {
    expect(app).toContain("recovery:inputs:${Date.now()}");
    expect(app).toContain("Never destroy the only copy of malformed persisted data");
  });

  it("bounds storage values at the shim boundary as defense in depth", () => {
    expect(storage).toContain("MAX_VALUE_LENGTH = 8_000_000");
    expect(storage).toContain('throw new RangeError("Stored value is too large")');
    expect(storage).toContain('throw new RangeError("Storage value is too large")');
  });
});

describe("backup paste size boundary", () => {
  it("rejects oversized backup text both while editing and immediately before JSON.parse", () => {
    expect(app).toContain("handleImportTextChange");
    expect(app).toContain("value.length > MAX_PERSISTED_JSON_CHARS");
    expect(app).toContain('importText.length > MAX_PERSISTED_JSON_CHARS');
    expect(app).toContain('throw new RangeError("Backup text is too large")');
    expect(app).toContain('onChange={(e) => handleImportTextChange(e.target.value)}');
  });
});
