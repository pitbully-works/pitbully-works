import { describe, expect, it } from "vitest";
import { GB_COUNTRY_RULES } from "./countryRules/GB.js";

describe("overseas 100 phase 23 — GB child pension access boundary", () => {
  const inv = GB_COUNTRY_RULES.investment;

  it("keeps ordinary child-pension money locked before the normal minimum age", () => {
    expect(inv.juniorSipp.normalMinimumPensionAge).toBe(57);
    expect(inv.juniorSipp.exceptionalAccess.ordinaryEarlyWithdrawal).toBe(false);
    expect(inv.canAccessJuniorSippBeforeMinimumAge({ age: 30 })).toBe(false);
    expect(inv.getJuniorSippAccessReason({ age: 30 })).toBe("locked");
  });

  it("allows normal access from the modelled minimum pension age", () => {
    expect(inv.canAccessJuniorSippBeforeMinimumAge({ age: 57 })).toBe(true);
    expect(inv.getJuniorSippAccessReason({ age: 57 })).toBe("normal-minimum-age");
  });

  it("models death as an exceptional pre-minimum-age access condition", () => {
    expect(inv.juniorSipp.exceptionalAccess.deathBeforeAccessAge).toBe(true);
    expect(inv.canAccessJuniorSippBeforeMinimumAge({ age: 30, deceased: true })).toBe(true);
    expect(inv.getJuniorSippAccessReason({ age: 30, deceased: true })).toBe("death");
  });

  it("models serious ill health as an exceptional pre-minimum-age access condition", () => {
    expect(inv.juniorSipp.exceptionalAccess.seriousIllHealthBeforeAccessAge).toBe(true);
    expect(inv.canAccessJuniorSippBeforeMinimumAge({ age: 30, seriousIllHealth: true })).toBe(true);
    expect(inv.getJuniorSippAccessReason({ age: 30, seriousIllHealth: true })).toBe("serious-ill-health");
  });

  it("does not pretend provider-specific product terms are universal law", () => {
    expect(inv.juniorSipp.providerSpecificTermsModelled).toBe(false);
  });
});
