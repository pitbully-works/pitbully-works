import { describe, it, expect } from "vitest";
import { GB_COUNTRY_RULES } from "./countryRules/GB.js";

describe("GB healthcare 2026/27", () => {
  const h = GB_COUNTRY_RULES.healthcare;
  it("uses the England prescription charge and free-prescription nations", () => {
    expect(h.getPrescriptionAnnual("england", 10, false)).toBeCloseTo(99);
    expect(h.getPrescriptionAnnual("scotland", 10, false)).toBe(0);
    expect(h.getPrescriptionAnnual("wales", 10, false)).toBe(0);
    expect(h.getPrescriptionAnnual("northernIreland", 10, false)).toBe(0);
    expect(h.getPrescriptionAnnual("england", 10, true)).toBe(0);
  });

  it("calculates 2026/27 England NHS dental bands", () => {
    expect(h.getEnglandDentalAnnual(1, 1, 1, false)).toBeCloseTo(436.6);
    expect(h.getEnglandDentalAnnual(2, 0, 0, true)).toBe(0);
  });

  it("applies England social-care capital thresholds", () => {
    expect(h.getEnglandSocialCareAssessment(14000).status).toBe("belowLowerLimit");
    expect(h.getEnglandSocialCareAssessment(24000).status).toBe("selfFunder");
    expect(h.getEnglandSocialCareAssessment(14500)).toEqual({ status: "meansTested", weeklyTariffIncome: 1 });
    expect(h.getEnglandSocialCareAssessment(23250).weeklyTariffIncome).toBe(36);
  });

  it("uses automatic prescription and dental values without double counting manual amounts", () => {
    const total = h.getAnnualTotal({
      region: "england", nhsBasicAnnual: 100, privateHealthInsuranceMonthly: 10,
      prescriptionMode: "auto", prescriptionItemsAnnual: 10, prescriptionAnnual: 999,
      dentalMode: "auto", dentalBand1Courses: 1, dentalBand2Courses: 0, dentalBand3Courses: 0, dentalAnnual: 999,
      longTermCareAnnual: 200, otherOutOfPocketAnnual: 50,
    });
    expect(total).toBeCloseTo(596.9);
  });
});
