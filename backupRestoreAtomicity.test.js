import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { hasOnlySupportedCountryKeys } from "./utils/countryProfiles.js";

const app = readFileSync(join(process.cwd(), "App.jsx"), "utf8");

describe("backup/persistence restore atomicity", () => {
  it("rejects unknown or duplicate-normalized country buckets in current-schema backups", () => {
    expect(hasOnlySupportedCountryKeys({ JP: {}, US: {} })).toBe(true);
    expect(hasOnlySupportedCountryKeys({ JP: {}, XX: {} })).toBe(false);
    expect(hasOnlySupportedCountryKeys({ US: {}, " us ": {} })).toBe(false);
  });

  it("preserves semantically invalid persisted JSON before fallback autosave", () => {
    expect(app).toContain("let rawPersistedValue = null;");
    expect(app).toContain("rawPersistedValue = res.value;");
    expect(app).toContain("if (rawPersistedValue !== null)");
    expect(app).toContain("recovery:inputs:${Date.now()}");
  });

  it("validates profiles and watchlists before committing restored refs", () => {
    const watchlistValidation = app.indexOf('throw new Error("Invalid country watchlists in backup")');
    const profileCommit = app.indexOf("countryProfilesRef.current = restored;");
    const watchlistCommit = app.indexOf("countryWatchlistsRef.current = restoredWatchlists;");
    expect(watchlistValidation).toBeGreaterThan(-1);
    expect(profileCommit).toBeGreaterThan(watchlistValidation);
    expect(watchlistCommit).toBeGreaterThan(watchlistValidation);
  });

  it("uses strict supported-country validation for both current-schema maps", () => {
    expect((app.match(/hasOnlySupportedCountryKeys\(parsed\.(profiles|watchlists)\)/g) || []).length).toBe(3);
  });
});
