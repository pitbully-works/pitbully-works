import { describe, it, expect } from "vitest";
import {
  PROFILE_COUNTRIES,
  PROFILE_STORAGE_VERSION,
  forceCountryMeta,
  migrateCountryProfiles,
  normalizeStockWatchlist,
  profileMeta,
  snapshotStorageKey,
  targetCountryFromBackup,
  targetCountryFromKakeibo,
} from "./utils/countryProfiles.js";

describe("5-country persistence and country-boundary audit - 2026", () => {
  const defaults = {
    country: "JP",
    baseCurrency: "JPY",
    language: "ja",
    currentAssets: 0,
    userName: "",
    birthDate: "",
  };

  it("keeps current-schema profiles in five independent country buckets", () => {
    const profiles = Object.fromEntries(
      PROFILE_COUNTRIES.map((code, index) => [
        code,
        forceCountryMeta({
          ...defaults,
          currentAssets: (index + 1) * 111111,
          userName: `user-${code}`,
          birthDate: `197${index}-01-0${index + 1}`,
        }, code),
      ])
    );

    const migrated = migrateCountryProfiles(defaults, {
      profileStorageVersion: PROFILE_STORAGE_VERSION,
      activeCountry: "CA",
      profiles,
    });

    expect(migrated.activeCountry).toBe("CA");
    expect(Object.keys(migrated.profiles).sort()).toEqual([...PROFILE_COUNTRIES].sort());

    for (const [index, code] of PROFILE_COUNTRIES.entries()) {
      expect(migrated.profiles[code].country).toBe(code);
      expect(migrated.profiles[code].baseCurrency).toBe(profileMeta(code).baseCurrency);
      expect(migrated.profiles[code].currentAssets).toBe((index + 1) * 111111);
      expect(migrated.profiles[code].userName).toBe(`user-${code}`);
    }
  });

  it("rejects unsupported and duplicate-normalized profile buckets in the current schema", () => {
    expect(() => migrateCountryProfiles(defaults, {
      profileStorageVersion: PROFILE_STORAGE_VERSION,
      activeCountry: "JP",
      profiles: { JP: forceCountryMeta(defaults, "JP"), XX: { country: "XX" } },
    })).toThrow("Invalid persisted country profiles");

    expect(() => migrateCountryProfiles(defaults, {
      profileStorageVersion: PROFILE_STORAGE_VERSION,
      activeCountry: "US",
      profiles: {
        US: forceCountryMeta(defaults, "US"),
        " us ": forceCountryMeta(defaults, "US"),
      },
    })).toThrow("Invalid persisted country profiles");
  });

  it("keeps watchlist currency canonical for each country", () => {
    const expected = { JP: "JPY", US: "USD", GB: "GBP", CA: "CAD", AU: "AUD" };

    for (const code of PROFILE_COUNTRIES) {
      const normalized = normalizeStockWatchlist([
        { name: "Example", sector: "Test", shares: 2, value: 100, currency: "JPY" },
      ], code);

      expect(normalized).toHaveLength(1);
      expect(normalized[0].currency).toBe(expected[code]);
    }
  });

  it("keeps snapshot storage keys separated by country", () => {
    const keys = PROFILE_COUNTRIES.map((code) =>
      snapshotStorageKey(code, "2026-08-23")
    );

    expect(new Set(keys).size).toBe(PROFILE_COUNTRIES.length);
    expect(keys).toEqual([
      "snapshot:JP:2026-08-23",
      "snapshot:US:2026-08-23",
      "snapshot:GB:2026-08-23",
      "snapshot:CA:2026-08-23",
      "snapshot:AU:2026-08-23",
    ]);
  });

  it("does not silently reinterpret an explicit unknown backup country as JP", () => {
    expect(targetCountryFromBackup("US")).toBe("US");
    expect(targetCountryFromBackup(" gb ")).toBe("GB");
    expect(targetCountryFromBackup("ZZ")).toBeNull();

    // Legacy backups without a country marker remain JP-compatible by design.
    expect(targetCountryFromBackup(undefined)).toBe("JP");
  });

  it("does not silently reinterpret an explicit unknown Kakeibo country as JP", () => {
    expect(targetCountryFromKakeibo({ countryCode: "CA" })).toBe("CA");
    expect(targetCountryFromKakeibo({ countryCode: " au " })).toBe("AU");
    expect(targetCountryFromKakeibo({ countryCode: "ZZ" })).toBeNull();

    // Legacy Kakeibo payloads without countryCode remain JP-compatible by design.
    expect(targetCountryFromKakeibo({})).toBe("JP");
  });
});
