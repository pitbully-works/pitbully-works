import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { US_COUNTRY_RULES } from "./countryRules/US.js";

describe("overseas 100 phase 6 — US estate/death-tax boundaries", () => {
  it("keeps the 2026 federal basic exclusion at $15m", () => {
    expect(US_COUNTRY_RULES.estate.basicExclusionAmount).toBe(15000000);
  });
  it("identifies Maryland as both estate-tax and inheritance-tax jurisdiction", () => {
    const md = US_COUNTRY_RULES.estate.getStateDeathTaxProfile("MD");
    expect(md.estate).toBe(true);
    expect(md.inheritance).toBe(true);
    expect(md.exemption).toBe(5000000);
  });
  it("protects 2026 New York exemption and cliff metadata", () => {
    const ny = US_COUNTRY_RULES.estate.getStateDeathTaxProfile("NY");
    expect(ny.exemption).toBe(7350000);
    expect(ny.cliffPct).toBe(1.05);
  });
  it("identifies Pennsylvania as inheritance-tax only", () => {
    const pa = US_COUNTRY_RULES.estate.getStateDeathTaxProfile("PA");
    expect(pa.estate).toBe(false);
    expect(pa.inheritance).toBe(true);
    expect(pa.rateMax).toBe(0.15);
  });
  it("shows the federal estimator and state selector in the inheritance panel", () => {
    const app = readFileSync(join(process.cwd(), "App.jsx"), "utf8");
    expect(app).toContain('calculateFederalEstateTaxEstimate(e)');
    expect(app).toContain('getStateDeathTaxProfile(e.stateCode)');
    expect(app).toContain('usEstateStateLabel');
  });
});
