import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const app = readFileSync(join(process.cwd(), "App.jsx"), "utf8");

describe("snapshot restore trust boundary", () => {
  it("requires a plain snapshot record", () => {
    expect(app).toContain('if (!isPlainRecord(entry) || !normalizeSnapshotDate(entry.date)) return;');
  });

  it("requires a normalized snapshot date before restoring", () => {
    expect(app).toContain('normalizeSnapshotDate(entry.date)');
  });

  it("rechecks the snapshot country against the active country", () => {
    expect(app).toContain('if (entryCountry !== currentCountry) return;');
  });

  it("accepts snapshot inputs only when they are a plain record", () => {
    expect(app).toContain('if (isPlainRecord(entry.inputs))');
  });
});
