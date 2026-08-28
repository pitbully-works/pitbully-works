import { describe, expect, it } from "vitest";
import { US_COUNTRY_RULES } from "./countryRules/US.js";

const retirement = US_COUNTRY_RULES.retirement;
const closeTo = (actual, expected, digits = 10) => {
  expect(actual).toBeCloseTo(expected, digits);
};

describe("US Social Security FRA follows SSA birth-year schedule", () => {
  it("resolves statutory FRA by birth year", () => {
    expect(retirement.getFullRetirementAge(1937)).toBe(65);
    closeTo(retirement.getFullRetirementAge(1938), 65 + 2 / 12);
    closeTo(retirement.getFullRetirementAge(1942), 65 + 10 / 12);
    expect(retirement.getFullRetirementAge(1950)).toBe(66);
    closeTo(retirement.getFullRetirementAge(1955), 66 + 2 / 12);
    closeTo(retirement.getFullRetirementAge("1959-08-01"), 66 + 10 / 12);
    expect(retirement.getFullRetirementAge(1960)).toBe(67);
    expect(retirement.getFullRetirementAge(1970)).toBe(67);
  });

  it("returns factor 1.0 when claiming exactly at that cohort FRA", () => {
    closeTo(retirement.getClaimingFactor(66, 1950), 1);
    closeTo(retirement.getClaimingFactor(66 + 10 / 12, 1959), 1);
    closeTo(retirement.getClaimingFactor(67, 1960), 1);
  });

  it("applies delayed credits from the cohort FRA instead of a fixed age 67", () => {
    // Born 1950: FRA 66, so claiming at 67 is 12 months late = +8%.
    closeTo(retirement.getClaimingFactor(67, 1950), 1.08);
    // Born 1959: FRA 66y10m, so claiming at 67 is 2 months late = +1 1/3%.
    closeTo(retirement.getClaimingFactor(67, 1959), 1 + 2 * ((2 / 3) / 100));
    // Born 1960: FRA is 67, therefore 67 remains exactly full benefit.
    closeTo(retirement.getClaimingFactor(67, 1960), 1);
  });

  it("applies the correct early-claim reduction for pre-1960 cohorts", () => {
    // Born 1959: age 62 is 58 months before FRA: 36*(5/9)% + 22*(5/12)%.
    const expected1959 = 1 - 36 * (5 / 9 / 100) - 22 * (5 / 12 / 100);
    closeTo(retirement.getClaimingFactor(62, 1959), expected1959);
    // Born 1960+: the familiar age-62 factor remains 70%.
    closeTo(retirement.getClaimingFactor(62, 1960), 0.70);
  });

  it("uses birth year in the actual monthly-benefit calculation", () => {
    closeTo(retirement.getMonthlyBenefit(2000, 67, 1950), 2160);
    closeTo(retirement.getMonthlyBenefit(2000, 67, 1960), 2000);
  });
});
