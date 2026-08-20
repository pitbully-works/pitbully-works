import { describe, it, expect } from "vitest";
import { AU_COUNTRY_RULES } from "./countryRules/AU.js";

describe("AU 2026 Medicare / PBS healthcare", () => {
  const h = AU_COUNTRY_RULES.healthcare;

  it("stores the official 2026 PBS co-pay and Safety Net figures", () => {
    expect(h.pbs2026.general.maxCopayBeforeSafetyNet).toBe(25);
    expect(h.pbs2026.general.safetyNetThreshold).toBe(1748.20);
    expect(h.pbs2026.general.copayAfterSafetyNet).toBe(7.70);
    expect(h.pbs2026.concessional.maxCopayBeforeSafetyNet).toBe(7.70);
    expect(h.pbs2026.concessional.safetyNetThreshold).toBe(277.20);
    expect(h.pbs2026.concessional.copayAfterSafetyNet).toBe(0);
  });

  it("stores 2026 Medicare Safety Net thresholds", () => {
    expect(h.medicareSafetyNet2026.originalThreshold).toBe(594.40);
    expect(h.medicareSafetyNet2026.extendedThresholdConcessionalOrFtbA).toBe(861.20);
    expect(h.medicareSafetyNet2026.extendedThresholdGeneral).toBe(2699.10);
    expect(h.medicareSafetyNet2026.extendedBenefitRate).toBe(0.80);
  });

  it("keeps manual pharmaceutical costs in manual mode", () => {
    expect(h.getPharmaceuticalAnnual({ pbsMode: "manual", pharmaceuticalAnnual: 345 })).toBe(345);
  });

  it("estimates general PBS prescriptions using 2026 maximum co-pay", () => {
    expect(h.getPbsAnnualOutOfPocket({ prescriptionsAnnual: 12, concessional: false })).toBe(300);
  });

  it("switches concessional prescriptions to zero after reaching the Safety Net", () => {
    // 36 × $7.70 = $277.20 reaches the 2026 concessional threshold; later scripts are $0.
    expect(h.getPbsAnnualOutOfPocket({ prescriptionsAnnual: 40, concessional: true })).toBe(277.20);
  });

  it("annual total uses the PBS estimate when estimate mode is selected", () => {
    const total = h.getAnnualTotal({
      gapAnnual: 100,
      privateHealthInsuranceMonthly: 10,
      pbsMode: "estimate",
      pbsPrescriptionsAnnual: 12,
      pbsConcessional: false,
      pharmaceuticalAnnual: 9999,
      dentalAnnual: 50,
      opticalAnnual: 25,
      agedCareAnnual: 0,
      otherOutOfPocketAnnual: 5,
    });
    expect(total).toBe(600);
  });
});
