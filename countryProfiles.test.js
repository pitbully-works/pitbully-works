import { describe, it, expect } from "vitest";
import { PROFILE_COUNTRIES, PROFILE_STORAGE_VERSION, applySharedIdentity, forceCountryMeta, makeCountryProfile, migrateCountryProfiles, targetCountryFromKakeibo, targetCountryFromBackup } from "./utils/countryProfiles.js";
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
describe("App integration",()=>{const app=readFileSync(join(process.cwd(), "App.jsx"),"utf8");it("uses profile storage",()=>expect(app).toContain("profileStorageVersion: PROFILE_STORAGE_VERSION"));it("routes kakeibo by countryCode",()=>expect(app).toContain("targetCountryFromKakeibo(parsed)"));it("validates country/currency pair",()=>expect(app).toContain("Country/currency mismatch"));it("stores country history separately",()=>expect(app).toContain('SNAPSHOT_PREFIX + code + ":" + date'));it("country select saves current and restores target",()=>{expect(app).toContain("countryProfilesRef.current = { ...countryProfilesRef.current, [currentCountry]: inputs }");expect(app).toContain("const rawTarget = countryProfilesRef.current[nextCountry]");});it("history is filtered by explicit profile country",()=>{expect(app).toContain('const entryCountry = entry.country || "JP"');expect(app).toContain('const sameCountryPrev = prev.filter((h) => (h?.country || "JP") === currentCountry)');expect(app).toContain('(h?.country || "JP") === code && h.date !== date');});});

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
