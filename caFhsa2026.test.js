import { describe, it, expect } from "vitest";
import { CA_COUNTRY_RULES } from "./countryRules/index.js";

describe("CA 2026 FHSA participation room", () => {
  const inv = CA_COUNTRY_RULES.investment;
  it("uses the C$8,000 annual and C$40,000 lifetime limits", () => {
    expect(inv.limits.fhsaAnnualLimit).toBe(8000);
    expect(inv.limits.fhsaLifetimeLimit).toBe(40000);
  });
  it("first-year/basic room is C$8,000", () => {
    expect(inv.getFhsaParticipationRoom()).toBe(8000);
  });
  it("carries forward at most C$8,000", () => {
    expect(inv.getFhsaParticipationRoom({ priorUnusedRoom: 3000 })).toBe(11000);
    expect(inv.getFhsaParticipationRoom({ priorUnusedRoom: 20000 })).toBe(16000);
  });
  it("never exceeds remaining lifetime room", () => {
    expect(inv.getFhsaParticipationRoom({ priorUnusedRoom: 8000, lifetimeContributionsAndTransfers: 35000 })).toBe(5000);
    expect(inv.getFhsaParticipationRoom({ lifetimeContributionsAndTransfers: 40000 })).toBe(0);
  });
  it("prefers an official CRA participation-room amount for complex cases", () => {
    expect(inv.getFhsaParticipationRoom({ officialParticipationRoom: 9500, priorUnusedRoom: 8000 })).toBe(9500);
  });
  it("reports remaining room after current-year contributions/transfers", () => {
    expect(inv.getFhsaRemaining({ priorUnusedRoom: 3000, annualContributionsAndTransfers: 9000 })).toBe(2000);
  });
});
