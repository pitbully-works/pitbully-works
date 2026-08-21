import { describe, it, expect } from "vitest";
import { PROFILE_COUNTRIES, PROFILE_STORAGE_VERSION, applySharedIdentity, forceCountryMeta, makeCountryProfile, migrateCountryProfiles, normalizeProfileCurrency, normalizeCountryKeyedRecord, normalizeSnapshotDate, resolvePersistedActiveCountry, snapshotStorageKey, legacyJpSnapshotStorageKey, targetCountryFromKakeibo, targetCountryFromBackup, normalizeStockWatchlist, snapshotDateFromStorageKey, normalizeProfileStorageVersion, isPlainRecord, MAX_SNAPSHOT_HISTORY } from "./utils/countryProfiles.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const defaults={country:"JP",baseCurrency:"JPY",language:"ja",userName:"",birthDate:"",currentAge:35,currentAssets:0,banks:[],pensionMonthly:0,livingCostMonthly:0};
describe("5-country life-plan profiles",()=>{
 it("supports exactly five countries",()=>expect(PROFILE_COUNTRIES).toEqual(["JP","US","GB","CA","AU"]));
 it("new US profile does not inherit JP identity or money",()=>{const jp={...defaults,userName:"K",birthDate:"1968-11-13",currentAssets:10000000,banks:[{balance:3000000}]};const us=makeCountryProfile(defaults,"US",jp);expect(us.baseCurrency).toBe("USD");expect(us.currentAssets).toBe(0);expect(us.banks).toEqual([]);expect(us.birthDate).toBe("");expect(us.userName).toBe("");});
 it("identity is not shared between countries",()=>{const out=applySharedIdentity({...defaults,currentAssets:1234,birthDate:"",userName:""},{...defaults,currentAssets:9999,birthDate:"1968-11-13",userName:"K"});expect(out.currentAssets).toBe(1234);expect(out.birthDate).toBe("");expect(out.userName).toBe("");});
 it("legacy save migrates entirely to JP",()=>{const m=migrateCountryProfiles(defaults,{inputs:{country:"US",baseCurrency:"USD",currentAssets:777}});expect(m.migratedLegacy).toBe(true);expect(m.activeCountry).toBe("JP");expect(m.profiles.JP.country).toBe("JP");expect(m.profiles.JP.baseCurrency).toBe("JPY");expect(m.profiles.JP.currentAssets).toBe(777);});
 it("v2 keeps all profiles",()=>{const m=migrateCountryProfiles(defaults,{profileStorageVersion:PROFILE_STORAGE_VERSION,activeCountry:"GB",profiles:{JP:{currentAssets:1},GB:{currentAssets:2}}});expect(m.activeCountry).toBe("GB");expect(m.profiles.JP.currentAssets).toBe(1);expect(m.profiles.GB.currentAssets).toBe(2);});
 it("kakeibo country routes import",()=>{for(const c of PROFILE_COUNTRIES){expect(targetCountryFromKakeibo({countryCode:c})).toBe(c);expect(targetCountryFromKakeibo({countryCode:c.toLowerCase()})).toBe(c);}expect(targetCountryFromKakeibo({countryCode:"XX"})).toBeNull();expect(targetCountryFromKakeibo({})).toBe("JP");});
 it("forces each country currency",()=>{expect(forceCountryMeta({},"JP").baseCurrency).toBe("JPY");expect(forceCountryMeta({},"US").baseCurrency).toBe("USD");expect(forceCountryMeta({},"GB").baseCurrency).toBe("GBP");expect(forceCountryMeta({},"CA").baseCurrency).toBe("CAD");expect(forceCountryMeta({},"AU").baseCurrency).toBe("AUD");});
});
describe("App integration",()=>{const app=readFileSync(join(process.cwd(), "App.jsx"),"utf8");it("uses profile storage",()=>expect(app).toContain("profileStorageVersion: PROFILE_STORAGE_VERSION"));it("normalizes country and currency again at the render/calculation boundary",()=>{expect(app).toContain('const country = normalizeProfileCountry(inputs.country || "JP")');expect(app).toContain('const baseCurrency = normalizeProfileCurrency(inputs.baseCurrency, country)');});it("routes kakeibo by countryCode",()=>expect(app).toContain("targetCountryFromKakeibo(parsed)"));it("validates country/currency pair",()=>expect(app).toContain("Country/currency mismatch"));it("normalizes imported currency code before country/currency validation",()=>{expect(app).toContain('String(parsed.baseCurrency).trim().toUpperCase()');expect(app).toContain('if (importedCurrency && importedCurrency !== expectedCurrency)');});it("stores country history separately",()=>expect(app).toContain('snapshotStorageKey(code, date)'));it("country select saves current and restores target",()=>{expect(app).toContain("countryProfilesRef.current = { ...countryProfilesRef.current, [currentCountry]: inputs }");expect(app).toContain("const rawTarget = countryProfilesRef.current[nextCountry]");});it("history country is normalized and unknown codes are not mixed into JP",()=>{expect(app).toContain('const entryCountry = targetCountryFromBackup(entry.country)');expect(app).toContain('const sameCountryPrev = prev.filter((h) => targetCountryFromBackup(h?.country) === currentCountry)');expect(app).toContain('targetCountryFromBackup(h?.country) === code && h.date !== date');});});

describe("backup active-country strictness", () => {
  it.each(["JP", "US", "GB", "CA", "AU"])("%s: lowercase and surrounding spaces normalize safely", (code) => {
    expect(targetCountryFromBackup(`  ${code.toLowerCase()}  `)).toBe(code);
  });
  it("missing country remains legacy-JP compatible", () => {
    expect(targetCountryFromBackup(undefined)).toBe("JP");
    expect(targetCountryFromBackup("   ")).toBe("JP");
  });
  it("explicit unknown country is rejected instead of silently becoming JP", () => {
    expect(targetCountryFromBackup("XX")).toBeNull();
  });
});


describe("country-keyed persisted map normalization", () => {
  it("restores lowercase/spaced profile keys instead of silently losing that country", () => {
    const m = migrateCountryProfiles(defaults, {
      profileStorageVersion: PROFILE_STORAGE_VERSION,
      activeCountry: " us ",
      profiles: { " us ": { currentAssets: 4321 } },
    });
    expect(m.activeCountry).toBe("US");
    expect(m.profiles.US.currentAssets).toBe(4321);
  });
  it("normalizes watchlist-style maps and ignores unsupported country keys", () => {
    expect(normalizeCountryKeyedRecord({ " ca ": [1], XX: [2] })).toEqual({ CA: [1] });
  });
  it("canonical country key wins when a noisy duplicate also exists", () => {
    expect(normalizeCountryKeyedRecord({ " us ": [1], US: [2] }).US).toEqual([2]);
  });
});


describe("profile render-boundary currency normalization", () => {
  it("normalizes lowercase and surrounding spaces for every supported currency", () => {
    expect(normalizeProfileCurrency(" jpy ", "JP")).toBe("JPY");
    expect(normalizeProfileCurrency(" usd ", "US")).toBe("USD");
    expect(normalizeProfileCurrency(" gbp ", "GB")).toBe("GBP");
    expect(normalizeProfileCurrency(" cad ", "CA")).toBe("CAD");
    expect(normalizeProfileCurrency(" aud ", "AU")).toBe("AUD");
  });
  it("unsupported currency falls back to the selected country's canonical currency", () => {
    expect(normalizeProfileCurrency("XYZ", "US")).toBe("USD");
    expect(normalizeProfileCurrency("", "AU")).toBe("AUD");
  });
});


describe("persisted active-country recovery", () => {
  it("keeps valid lowercase/spaced active country", () => {
    expect(resolvePersistedActiveCountry("  au  ", { AU: {} })).toBe("AU");
  });
  it("does not silently reinterpret an unsupported active code as JP when another valid bucket exists", () => {
    expect(resolvePersistedActiveCountry("XX", { US: { currentAssets: 9 } })).toBe("US");
  });
  it("falls back safely when an unsupported active code has no valid saved bucket", () => {
    expect(resolvePersistedActiveCountry("XX", { XX: {} }, "CA")).toBe("CA");
  });
  it("migration recovers an existing valid bucket from corrupted activeCountry", () => {
    const m = migrateCountryProfiles(defaults, {
      profileStorageVersion: PROFILE_STORAGE_VERSION,
      activeCountry: "XX",
      profiles: { US: { currentAssets: 9876 } },
    });
    expect(m.activeCountry).toBe("US");
    expect(m.profiles.US.currentAssets).toBe(9876);
  });
});


describe("App defensive boundary helpers", () => {
  const app = readFileSync(join(process.cwd(), "App.jsx"), "utf8");
  it("normalizes currency inside the formatter itself", () => {
    expect(app).toContain('const currencyCode = String(baseCurrency || "JPY").trim().toUpperCase()');
    expect(app).toContain('CURRENCY_BY_CODE[currencyCode]');
  });
  it("normalizes country inside the default-watchlist selector", () => {
    expect(app).toContain('const code = normalizeProfileCountry(country)');
    expect(app).toContain('if (code === "US") return DEFAULT_WATCHLIST_US');
  });
});

describe("batch hardening: country/currency and history restore boundaries", () => {
  it("never accepts another supported country's currency for the selected country", () => {
    expect(normalizeProfileCurrency("JPY", "US")).toBe("USD");
    expect(normalizeProfileCurrency("USD", "JP")).toBe("JPY");
    expect(normalizeProfileCurrency("AUD", "CA")).toBe("CAD");
  });

  it("re-checks snapshot country and metadata at the restore boundary", () => {
    const app = readFileSync(join(process.cwd(), "App.jsx"), "utf8");
    expect(app).toContain("const entryCountry = targetCountryFromBackup(entry.country)");
    expect(app).toContain("if (entryCountry !== currentCountry) return");
    expect(app).toContain("forceCountryMeta(mergeSavedInputs(prev, entry.inputs), currentCountry)");
    expect(app).toContain("setWatchlist(normalizeStockWatchlist(entry.watchlist, currentCountry))");
  });

  it("drops malformed or impossible history dates", () => {
    const app = readFileSync(join(process.cwd(), "App.jsx"), "utf8");
    expect(app).toContain('const entryDate = normalizeSnapshotDate(entry.date)');
    expect(app).toContain('if (!entryDate || !keyDate || entryDate !== keyDate) return null');
  });
});


describe("batch hardening: history storage keys and strict dates", () => {
  it("accepts only real YYYY-MM-DD calendar dates", () => {
    expect(normalizeSnapshotDate("2026-08-21")).toBe("2026-08-21");
    expect(normalizeSnapshotDate(" 2028-02-29 ")).toBe("2028-02-29");
    expect(normalizeSnapshotDate("2026-02-30")).toBeNull();
    expect(normalizeSnapshotDate("2026-13-01")).toBeNull();
    expect(normalizeSnapshotDate("08/21/2026")).toBeNull();
  });

  it("builds country-scoped snapshot keys and keeps legacy JP key compatibility", () => {
    expect(snapshotStorageKey(" us ", "2026-08-21")).toBe("snapshot:US:2026-08-21");
    expect(snapshotStorageKey("XX", "2026-08-21")).toBeNull();
    expect(snapshotStorageKey("JP", "2026-02-30")).toBeNull();
    expect(legacyJpSnapshotStorageKey("2026-08-21")).toBe("snapshot:2026-08-21");
  });

  it("reads only the active country's storage keys while retaining legacy JP snapshots", () => {
    const app = readFileSync(join(process.cwd(), "App.jsx"), "utf8");
    expect(app).toContain('const countryPrefix = `${SNAPSHOT_PREFIX}${currentCountry}:`');
    expect(app).toContain('if (key.startsWith(countryPrefix)) return true');
    expect(app).toContain('currentCountry === "JP" && /^snapshot:');
    expect(app).toContain('relevantKeys.map(async (k) =>');
  });

  it("deletes the current country's new-format key and the JP legacy key", () => {
    const app = readFileSync(join(process.cwd(), "App.jsx"), "utf8");
    expect(app).toContain('snapshotStorageKey(currentCountry, normalizedDate)');
    expect(app).toContain('legacyJpSnapshotStorageKey(normalizedDate)');
    expect(app).toContain('window.storage.delete(key, false)');
  });
});


describe("batch hardening 5: UI boundary normalization", () => {
  const app = readFileSync(join(process.cwd(), "App.jsx"), "utf8");
  it("normalizes calculator currency before selecting JPY 10k units", () => {
    expect(app).toContain('const calculatorCurrency = String(baseCurrency || "").trim().toUpperCase()');
    expect(app).toContain('calculatorCurrency === "JPY"');
  });
  it("re-normalizes rule-center country comparisons at render time", () => {
    expect(app).toContain('normalizeRuleCountry(item?.country) === country');
    expect(app).toContain('normalizeRuleCountry(entry?.country) === country');
  });
  it("formats only strict real rule dates", () => {
    expect(app).toContain('const normalizedDate = normalizeRuleDateString(isoDate)');
    expect(app).toContain('if (!normalizedDate) return "—"');
  });
});


describe("batch hardening 6: persisted watchlists and snapshot integrity", () => {
  it("sanitizes malformed stock watchlists and forces the selected-country currency", () => {
    const out = normalizeStockWatchlist([
      null,
      "bad",
      { name: "  Example  ", sector: "  Tech ", shares: "3", value: "125.5", currency: "JPY" },
      { name: "", shares: 9, value: 9 },
      { name: "Negative", shares: -5, value: Number.POSITIVE_INFINITY },
    ], " us ");
    expect(out).toEqual([
      { name: "Example", sector: "Tech", shares: 3, value: 125.5, currency: "USD" },
      { name: "Negative", sector: "", shares: 0, value: 0, currency: "USD" },
    ]);
  });

  it("caps restored watchlists so corrupted storage cannot create an unbounded render list", () => {
    const rows = Array.from({ length: 600 }, (_, i) => ({ name: `S${i}`, shares: 1, value: 1 }));
    expect(normalizeStockWatchlist(rows, "JP")).toHaveLength(500);
  });

  it("requires a snapshot's internal date to match its storage-key date", () => {
    expect(snapshotDateFromStorageKey("US", "snapshot:US:2026-08-21")).toBe("2026-08-21");
    expect(snapshotDateFromStorageKey("US", "snapshot:JP:2026-08-21")).toBeNull();
    expect(snapshotDateFromStorageKey("JP", "snapshot:2026-08-21")).toBe("2026-08-21");
    expect(snapshotDateFromStorageKey("JP", "snapshot:2026-02-30")).toBeNull();
  });

  it("rejects backup schemas from a newer app version instead of guessing their layout", () => {
    const app = readFileSync(join(process.cwd(), "App.jsx"), "utf8");
    expect(app).toContain("backupVersion > PROFILE_STORAGE_VERSION");
    expect(app).toContain("Unsupported backup version");
  });

  it("normalizes watchlists at every persisted-data boundary", () => {
    const app = readFileSync(join(process.cwd(), "App.jsx"), "utf8");
    expect(app).toContain("safeSavedWatchlists[code] = normalizeStockWatchlist(savedWatchlists[code], code)");
    expect(app).toContain("restoredWatchlists[code] = normalizeStockWatchlist(rawRestoredWatchlists[code], code)");
    expect(app).toContain('normalizeStockWatchlist(parsed.watchlist, "JP")');
    expect(app).toContain("watchlist: normalizeStockWatchlist(entry.watchlist, currentCountry)");
    expect(app).toContain("const safeNextWatchlist = normalizeStockWatchlist(nextWatchlist, code)");
  });
});


describe("batch hardening: backup version and history bounds", () => {
  it("accepts canonical numeric-string versions but rejects malformed versions", () => {
    expect(normalizeProfileStorageVersion(PROFILE_STORAGE_VERSION)).toBe(PROFILE_STORAGE_VERSION);
    expect(normalizeProfileStorageVersion(String(PROFILE_STORAGE_VERSION))).toBe(PROFILE_STORAGE_VERSION);
    expect(normalizeProfileStorageVersion("3.5")).toBeNull();
    expect(normalizeProfileStorageVersion("abc")).toBeNull();
    expect(normalizeProfileStorageVersion(-1)).toBeNull();
  });

  it("recognizes only plain record containers for persisted maps", () => {
    expect(isPlainRecord({ JP: {} })).toBe(true);
    expect(isPlainRecord(Object.create(null))).toBe(true);
    expect(isPlainRecord([])).toBe(false);
    expect(isPlainRecord(null)).toBe(false);
    expect(isPlainRecord(new Date())).toBe(false);
  });

  it("does not reinterpret a current-version numeric string as an old JP-only backup", () => {
    const app = readFileSync(join(process.cwd(), "App.jsx"), "utf8");
    expect(app).toContain("const backupVersion = normalizeProfileStorageVersion(parsed.profileStorageVersion)");
    expect(app).toContain("if (backupVersion === PROFILE_STORAGE_VERSION)");
    expect(app).toContain('if (!isPlainRecord(parsed.profiles)) throw new Error("Invalid country profiles in backup")');
  });

  it("bounds snapshot reads and in-memory history", () => {
    const app = readFileSync(join(process.cwd(), "App.jsx"), "utf8");
    expect(MAX_SNAPSHOT_HISTORY).toBe(1000);
    expect(app).toContain(".slice(0, MAX_SNAPSHOT_HISTORY)");
    expect(app).toContain("snapshotDateFromStorageKey(currentCountry, key)");
  });
});

describe("batch hardening 8: persisted schema fail-closed boundaries", () => {
  it("refuses explicit future or malformed persisted profile versions", () => {
    expect(() => migrateCountryProfiles({}, { profileStorageVersion: PROFILE_STORAGE_VERSION + 1, profiles: { JP: {} } })).toThrow(/Unsupported profile storage version/);
    expect(() => migrateCountryProfiles({}, { profileStorageVersion: "3.5", inputs: { country: "US" } })).toThrow(/Invalid profile storage version/);
  });

  it("requires a plain profiles container for the current persisted schema", () => {
    expect(() => migrateCountryProfiles({}, { profileStorageVersion: PROFILE_STORAGE_VERSION, profiles: [] })).toThrow(/Invalid persisted country profiles/);
  });

  it("requires plain country profile buckets at both startup and backup restore boundaries", () => {
    const app = readFileSync(join(process.cwd(), "App.jsx"), "utf8");
    expect((app.match(/if \(!isPlainRecord\(raw\)\) return;/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  it("requires snapshot payloads themselves to be plain records", () => {
    const app = readFileSync(join(process.cwd(), "App.jsx"), "utf8");
    expect(app).toContain("if (!isPlainRecord(entry)) return null");
  });
});


describe("batch hardening 8b: legacy bucket shape validation", () => {
  it("ignores malformed v2 country buckets instead of spreading arrays into profiles", () => {
    const migrated = migrateCountryProfiles({ currentAge: 35 }, {
      profileStorageVersion: 2,
      activeCountry: "US",
      profiles: { JP: [], US: { country: "US", currentAge: 44 } },
    });
    expect(migrated.profiles.JP).toBeUndefined();
    expect(migrated.profiles.US.currentAge).toBe(44);
  });

  it("does not reinterpret a legacy top-level inputs array as a JP profile", () => {
    const migrated = migrateCountryProfiles({}, { inputs: [{ country: "US" }] });
    expect(migrated.profiles).toEqual({});
    expect(migrated.activeCountry).toBe("JP");
  });

  it("uses only a plain valid bucket when recovering from a corrupted active-country code", () => {
    expect(resolvePersistedActiveCountry("XX", { JP: [], US: { country: "US" } })).toBe("US");
  });
});
