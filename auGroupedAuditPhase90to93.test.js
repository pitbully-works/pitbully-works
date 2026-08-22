import { describe, it, expect } from "vitest";
import { AU_COUNTRY_RULES } from "./countryRules/AU.js";

describe("AU grouped audit phases 90-93 - 2026-27 super and FHSS", () => {
  const inv = AU_COUNTRY_RULES.investment;

  it("keeps the indexed 2026-27 super caps and contribution base", () => {
    expect(inv.limits.concessionalCap).toBe(32500);
    expect(inv.limits.nonConcessionalCap).toBe(130000);
    expect(inv.limits.transferBalanceCap).toBe(2100000);
    expect(inv.limits.maximumContributionBase).toBe(270830);
  });

  it("applies the FHSS A$15,000 annual and A$50,000 overall contribution limits", () => {
    const r = inv.calculateFhssReleasableContributions([
      { financialYear: "2023-24", type: "nonConcessional", amount: 12000 },
      { financialYear: "2024-25", type: "nonConcessional", amount: 12000 },
      { financialYear: "2025-26", type: "nonConcessional", amount: 12000 },
      { financialYear: "2026-27", type: "nonConcessional", amount: 12000 },
      { financialYear: "2027-28", type: "nonConcessional", amount: 12000 },
    ]);
    expect(r.includedContributions).toBe(50000);
    expect(r.releasableContributions).toBe(50000);
    expect(r.maximumContributionLimitReached).toBe(true);
  });

  it("releases 85% of eligible concessional contributions and 100% of non-concessional contributions", () => {
    const r = inv.calculateFhssReleasableContributions([
      { financialYear: "2026-27", type: "nonConcessional", amount: 6000 },
      { financialYear: "2026-27", type: "concessional", amount: 9000 },
    ]);
    expect(r.includedContributions).toBe(15000);
    expect(r.releasableContributions).toBeCloseTo(13650, 8);
  });

  it("does not pretend to calculate ATO associated earnings or the final FHSS determination", () => {
    const r = inv.calculateFhssReleasableContributions([
      { financialYear: "2026-27", type: "concessional", amount: 15000 },
    ]);
    expect(r.associatedEarningsIncluded).toBe(false);
    expect(inv.notImplemented.join(" / ")).toMatch(/FHSS/);
    expect(inv.notImplemented.join(" / ")).toMatch(/associated earnings/);
  });
});
