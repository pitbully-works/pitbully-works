import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { migrateCountryProfiles } from "./utils/countryProfiles.js";

const app = readFileSync(join(process.cwd(), "App.jsx"), "utf8");
const defaults = { country: "JP", baseCurrency: "JPY", language: "ja" };

describe("final current-schema persistence boundary", () => {
  it("rejects unknown current-schema profile buckets instead of silently dropping them", () => {
    expect(() => migrateCountryProfiles(defaults, {
      profileStorageVersion: 3,
      activeCountry: "JP",
      profiles: { JP: defaults, XX: { country: "XX" } },
    })).toThrow("Invalid persisted country profiles");
  });

  it("rejects duplicate-normalized current-schema profile buckets", () => {
    expect(() => migrateCountryProfiles(defaults, {
      profileStorageVersion: 3,
      activeCountry: "US",
      profiles: { US: { country: "US" }, " us ": { country: "US" } },
    })).toThrow("Invalid persisted country profiles");
  });

  it("validates current-schema watchlist containers before accepting persisted data", () => {
    expect(app).toContain("parsedStorageVersion === PROFILE_STORAGE_VERSION");
    expect(app).toContain("parsed.watchlists !== undefined");
    expect(app).toContain('throw new Error("Invalid persisted country watchlists")');
  });

  it("keeps the legacy single-watchlist fallback only when the country map is absent", () => {
    expect(app).toContain("if (!parsed.watchlists && Array.isArray(parsed.watchlist)) savedWatchlists.JP = parsed.watchlist;");
  });
});
