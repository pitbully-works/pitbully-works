import { describe, it, expect } from "vitest";
import { GB_COUNTRY_RULES as gb } from "./countryRules/GB.js";

describe("GB grouped final audit phases 50-53 — regional healthcare and completion boundary", () => {
  it("keeps Northern Ireland prescriptions free in automatic mode", () => {
    expect(gb.healthcare.getPrescriptionAnnual("northernIreland", 12, false)).toBe(0);
  });

  it("preserves user-entered Northern Ireland item-of-service dental cost even when dental auto mode is selected", () => {
    const total = gb.healthcare.getAnnualTotal({
      region: "northernIreland",
      dentalMode: "auto",
      dentalAnnual: 246.75,
      prescriptionMode: "auto",
      prescriptionItemsAnnual: 10,
    });
    expect(total).toBeCloseTo(246.75, 2);
  });

  it("documents Northern Ireland dental as item-of-service input rather than inventing a flat automatic charge", () => {
    expect(gb.healthcare.sourceUrls.dentalNorthernIreland).toContain("nidirect.gov.uk");
    expect(gb.healthcare.notImplemented.some((x) => x.includes("Northern Ireland") && x.includes("item-of-service"))).toBe(true);
  });

  it("final-audit metadata accurately reflects implemented regional dental coverage and explicit remaining boundaries", () => {
    expect(gb.meta.verifiedAsOf).toBe("2026-08-22");
    const healthcare = gb.meta.coverage.find((x) => x.key === "healthcare");
    expect(healthcare?.status).toBe("partial");
    expect(healthcare?.updateJa).toContain("England/Scotland/Wales");
    expect(healthcare?.updateJa).toContain("Northern Ireland");
    expect(gb.healthcare.notImplemented.length).toBeGreaterThan(0);
  });
});
