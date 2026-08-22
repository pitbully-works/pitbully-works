import { describe, expect, it } from "vitest";
import { GB_COUNTRY_RULES } from "./countryRules/GB.js";

describe("GB grouped audit phases 46-49 — regional NHS dental completion", () => {
  const healthcare = GB_COUNTRY_RULES.healthcare;

  it("models Scotland at 80% of NHS treatment cost with a £384 cap per course", () => {
    expect(healthcare.getScotlandDentalCourseCharge(100)).toBeCloseTo(80, 2);
    expect(healthcare.getScotlandDentalCourseCharge(1000)).toBe(384);
    expect(healthcare.getScotlandDentalAnnual([100, 1000])).toBeCloseTo(464, 2);
  });

  it("keeps Scotland examinations/free-treatment cases at zero when exempt or under 26", () => {
    expect(healthcare.getScotlandDentalCourseCharge(200, { exempt: true })).toBe(0);
    expect(healthcare.getScotlandDentalCourseCharge(200, { age: 25 })).toBe(0);
    expect(healthcare.getScotlandDentalCourseCharge(200, { age: 26 })).toBeCloseTo(160, 2);
  });

  it("uses the 2026/27 Wales care-package charges", () => {
    const annual = healthcare.getWalesDentalAnnual({
      urgent: 1,
      simpleRestorative: 2,
      adultRecall: 1,
    });
    expect(annual).toBeCloseTo(37.50 + 36.03 * 2 + 25, 2);
    expect(healthcare.dentalWales.charges.crownOrBridge).toBeCloseTo(140.44, 2);
    expect(healthcare.dentalWales.charges.posteriorRootCanal).toBeCloseTo(182.72, 2);
  });

  it("routes regional automatic dental costs through the annual healthcare total", () => {
    expect(healthcare.getAnnualTotal({
      region: "scotland",
      dentalMode: "auto",
      dentalCourseCosts: [100, 1000],
      age: 40,
    })).toBeCloseTo(464, 2);

    expect(healthcare.getAnnualTotal({
      region: "wales",
      dentalMode: "auto",
      dentalPackageCounts: { urgent: 1, adultRecall: 1 },
    })).toBeCloseTo(62.50, 2);
  });
});
