import { describe, expect, it } from "vitest";
import { JP_COUNTRY_RULES } from "./countryRules/JP.js";
import { BUILTIN_RULE_UPDATES, applyApprovedRuleUpdates, mergeRuleUpdateManifests, normalizeRuleUpdateState, isRuleUpdateApproved, isRuleUpdateDismissed, safeRuleSourceUrl } from "./utils/ruleUpdates.js";

describe("rule update center", () => {
  it("does not change calculations before approval", () => {
    const rules = applyApprovedRuleUpdates(JP_COUNTRY_RULES, "JP", BUILTIN_RULE_UPDATES, normalizeRuleUpdateState({}), new Date("2027-01-01"));
    expect(rules.retirement.currentMonthlyLimits.employeeNoCorporatePension).toBe(23000);
  });

  it("approved future rule stays inactive before effective date", () => {
    const state = normalizeRuleUpdateState({ approved: { "JP-IDECO-2026-12-01": true } });
    const rules = applyApprovedRuleUpdates(JP_COUNTRY_RULES, "JP", BUILTIN_RULE_UPDATES, state, new Date("2026-11-30T12:00:00"));
    expect(rules.retirement.currentMonthlyLimits.employeeNoCorporatePension).toBe(23000);
  });

  it("approved rule applies on/after effective date", () => {
    const state = normalizeRuleUpdateState({ approved: { "JP-IDECO-2026-12-01": true } });
    const rules = applyApprovedRuleUpdates(JP_COUNTRY_RULES, "JP", BUILTIN_RULE_UPDATES, state, new Date("2026-12-01T12:00:00"));
    expect(rules.retirement.currentMonthlyLimits.firstInsured).toBe(75000);
    expect(rules.retirement.currentMonthlyLimits.employeeNoCorporatePension).toBe(62000);
    expect(rules.retirement.currentMonthlyLimits.corporatePensionCombinedCeiling).toBe(62000);
  });

  it("NISA未成年者枠は承認しても2027年までは有効化しない", () => {
    const state = normalizeRuleUpdateState({ approved: { "JP-NISA-2027-MINOR-TSUMITATE": true } });
    const before = applyApprovedRuleUpdates(JP_COUNTRY_RULES, "JP", BUILTIN_RULE_UPDATES, state, new Date("2026-12-31T12:00:00"));
    expect(before.investment.minorTsumitate.annualLimit).toBe(0);
    const active = applyApprovedRuleUpdates(JP_COUNTRY_RULES, "JP", BUILTIN_RULE_UPDATES, state, new Date("2027-01-01T12:00:00"));
    expect(active.investment.minorTsumitate.eligibleFromAge).toBe(0);
    expect(active.investment.minorTsumitate.annualLimit).toBe(600000);
    expect(active.investment.minorTsumitate.lifetimeLimit).toBe(6000000);
    expect(active.investment.annualInstallmentLimit).toBe(1200000);
    expect(active.investment.annualGrowthLimit).toBe(2400000);
    expect(active.investment.taxFreeInvestmentLimit).toBe(18000000);
  });

  it("公的年金の2026年度改定は承認後に参照データへ反映する", () => {
    const state = normalizeRuleUpdateState({ approved: { "JP-PENSION-2026-ANNUAL-REVISION": true } });
    const rules = applyApprovedRuleUpdates(JP_COUNTRY_RULES, "JP", BUILTIN_RULE_UPDATES, state, new Date("2026-08-21T12:00:00"));
    expect(rules.publicPension.annualRevision.fiscalYear).toBe(2026);
    expect(rules.publicPension.annualRevision.basicPensionPct).toBe(1.9);
    expect(rules.publicPension.annualRevision.employeesEarningsRelatedPct).toBe(2);
    expect(rules.publicPension.annualRevision.macroSlideBasicPct).toBe(-0.2);
    expect(rules.publicPension.annualRevision.basicPensionFullMonthly).toBe(70608);
  });
  it("国コードの小文字・前後空白でも承認済み制度更新を同じ国へ適用する", () => {
    const state = normalizeRuleUpdateState({ approved: { "JP-IDECO-2026-12-01": true } });
    const canonical = applyApprovedRuleUpdates(JP_COUNTRY_RULES, "JP", BUILTIN_RULE_UPDATES, state, new Date("2026-12-01T12:00:00"));
    const noisy = applyApprovedRuleUpdates(JP_COUNTRY_RULES, "  jp  ", BUILTIN_RULE_UPDATES, state, new Date("2026-12-01T12:00:00"));
    expect(noisy.retirement.currentMonthlyLimits).toEqual(canonical.retirement.currentMonthlyLimits);
  });

  it("Object.prototype由来のIDを未承認なのに承認済みとして扱わない", () => {
    const updates = [{
      id: "toString",
      country: "JP",
      effectiveDate: "2026-01-01",
      changes: [{ path: "retirement.currentMonthlyLimits.firstInsured", after: 999999999 }],
    }];
    const state = normalizeRuleUpdateState({});
    expect(isRuleUpdateApproved(state, "toString")).toBe(false);
    expect(isRuleUpdateDismissed(state, "constructor")).toBe(false);
    const rules = applyApprovedRuleUpdates(JP_COUNTRY_RULES, "JP", updates, state, new Date("2026-08-21T12:00:00"));
    expect(rules.retirement.currentMonthlyLimits.firstInsured).not.toBe(999999999);
  });

  it("Object.prototypeと同名のIDでも明示承認した場合だけ適用する", () => {
    const updates = [{
      id: "toString",
      country: "JP",
      effectiveDate: "2026-01-01",
      changes: [{ path: "retirement.currentMonthlyLimits.firstInsured", after: 75001 }],
    }];
    const state = normalizeRuleUpdateState({ approved: { toString: true } });
    expect(isRuleUpdateApproved(state, "toString")).toBe(true);
    const rules = applyApprovedRuleUpdates(JP_COUNTRY_RULES, "JP", updates, state, new Date("2026-08-21T12:00:00"));
    expect(rules.retirement.currentMonthlyLimits.firstInsured).toBe(75001);
  });

  it("remote制度更新の国コードを5か国へ正規化し、未知国は取り込まない", () => {
    const merged = mergeRuleUpdateManifests([
      { id: "REMOTE-US", country: "  us  ", effectiveDate: "2026-01-01", changes: [] },
      { id: "REMOTE-XX", country: "XX", effectiveDate: "2026-01-01", changes: [] },
    ]);
    expect(merged.find((item) => item.id === "REMOTE-US")?.country).toBe("US");
    expect(merged.some((item) => item.id === "REMOTE-XX")).toBe(false);
  });


  it("remote制度更新は既存IDを別国へすり替えられない", () => {
    const builtin = BUILTIN_RULE_UPDATES.find((item) => item.id === "JP-IDECO-2026-12-01");
    const merged = mergeRuleUpdateManifests([
      { id: "JP-IDECO-2026-12-01", country: "US", titleEn: "wrong-country replacement", changes: [] },
    ]);
    const kept = merged.find((item) => item.id === "JP-IDECO-2026-12-01");
    expect(kept?.country).toBe("JP");
    expect(kept?.titleJa).toBe(builtin?.titleJa);
    expect(kept?.titleEn).not.toBe("wrong-country replacement");
  });


  it("remote制度更新は既存IDを同じ国でも上書きできない", () => {
    const builtin = BUILTIN_RULE_UPDATES.find((item) => item.id === "JP-IDECO-2026-12-01");
    const merged = mergeRuleUpdateManifests([
      {
        id: "JP-IDECO-2026-12-01",
        country: "JP",
        titleEn: "same-country replacement",
        changes: [{ path: "retirement.currentMonthlyLimits.employeeNoCorporatePension", after: 999999999 }],
      },
    ]);
    const kept = merged.find((item) => item.id === "JP-IDECO-2026-12-01");
    expect(kept?.titleJa).toBe(builtin?.titleJa);
    expect(kept?.titleEn).not.toBe("same-country replacement");
    expect(kept?.changes).toEqual(builtin?.changes);
  });

  it("remote制度更新の重複IDは最初の有効データを保持する", () => {
    const merged = mergeRuleUpdateManifests([
      { id: "REMOTE-DUP", country: "US", titleEn: "first", changes: [] },
      { id: "REMOTE-DUP", country: "US", titleEn: "second", changes: [{ path: "tax.fake", after: 1 }] },
    ]);
    const rows = merged.filter((item) => item.id === "REMOTE-DUP");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.titleEn).toBe("first");
    expect(rows[0]?.changes).toEqual([]);
  });

  it("保存済み制度変更履歴も国コードを正規化し、未知国履歴は除外する", () => {
    const state = normalizeRuleUpdateState({
      history: [
        { id: "h1", country: " ca ", action: "approved" },
        { id: "h2", country: "XX", action: "approved" },
      ],
    });
    expect(state.history).toEqual([{ id: "h1", country: "CA", action: "approved" }]);
  });

  it("承認済みremote制度更新でもprototype pollution用pathは適用しない", () => {
    const updates = [{
      id: "REMOTE-PROTOTYPE-PATH",
      country: "JP",
      effectiveDate: "2026-01-01",
      changes: [
        { path: "__proto__.pollutedByRuleUpdate", after: "yes" },
        { path: "constructor.prototype.pollutedByRuleUpdate2", after: "yes" },
        { path: "retirement.currentMonthlyLimits.firstInsured", after: 75002 },
      ],
    }];
    const state = normalizeRuleUpdateState({ approved: { "REMOTE-PROTOTYPE-PATH": true } });
    const rules = applyApprovedRuleUpdates(JP_COUNTRY_RULES, "JP", updates, state, new Date("2026-08-21T12:00:00"));

    expect(rules.retirement.currentMonthlyLimits.firstInsured).toBe(75002);
    expect(Object.prototype.pollutedByRuleUpdate).toBeUndefined();
    expect(Object.prototype.pollutedByRuleUpdate2).toBeUndefined();
    expect(({}).pollutedByRuleUpdate).toBeUndefined();
    expect(({}).pollutedByRuleUpdate2).toBeUndefined();
  });

  it("未知国コード同士がnull一致して制度更新を適用しない", () => {
    const updates = [{
      id: "REMOTE-UNKNOWN-COUNTRY",
      country: "XX",
      effectiveDate: "2026-01-01",
      changes: [{ path: "retirement.currentMonthlyLimits.firstInsured", after: 999999999 }],
    }];
    const state = normalizeRuleUpdateState({ approved: { "REMOTE-UNKNOWN-COUNTRY": true } });
    const rules = applyApprovedRuleUpdates(JP_COUNTRY_RULES, "XX", updates, state, new Date("2026-08-21T12:00:00"));

    expect(rules.retirement.currentMonthlyLimits.firstInsured)
      .toBe(JP_COUNTRY_RULES.retirement.currentMonthlyLimits.firstInsured);
  });

  it("有効な国に対して未知国の制度更新を適用しない", () => {
    const updates = [{
      id: "REMOTE-UNKNOWN-IN-JP",
      country: "XX",
      effectiveDate: "2026-01-01",
      changes: [{ path: "retirement.currentMonthlyLimits.firstInsured", after: 999999998 }],
    }];
    const state = normalizeRuleUpdateState({ approved: { "REMOTE-UNKNOWN-IN-JP": true } });
    const rules = applyApprovedRuleUpdates(JP_COUNTRY_RULES, "JP", updates, state, new Date("2026-08-21T12:00:00"));

    expect(rules.retirement.currentMonthlyLimits.firstInsured)
      .toBe(JP_COUNTRY_RULES.retirement.currentMonthlyLimits.firstInsured);
  });

  it("存在しない日付のremote制度更新をJavaScriptの日付繰上げで誤適用しない", () => {
    const updates = [{
      id: "REMOTE-INVALID-EFFECTIVE-DATE",
      country: "JP",
      effectiveDate: "2026-02-30",
      changes: [{ path: "retirement.currentMonthlyLimits.firstInsured", after: 999999997 }],
    }];
    const state = normalizeRuleUpdateState({ approved: { "REMOTE-INVALID-EFFECTIVE-DATE": true } });
    const rules = applyApprovedRuleUpdates(JP_COUNTRY_RULES, "JP", updates, state, new Date("2026-03-10T12:00:00"));

    expect(rules.retirement.currentMonthlyLimits.firstInsured)
      .toBe(JP_COUNTRY_RULES.retirement.currentMonthlyLimits.firstInsured);
  });

  it("施行日が欠落したremote制度更新を即時有効として誤適用しない", () => {
    const updates = [{
      id: "REMOTE-MISSING-EFFECTIVE-DATE",
      country: "JP",
      changes: [{ path: "retirement.currentMonthlyLimits.firstInsured", after: 999999996 }],
    }];
    const state = normalizeRuleUpdateState({ approved: { "REMOTE-MISSING-EFFECTIVE-DATE": true } });
    const rules = applyApprovedRuleUpdates(JP_COUNTRY_RULES, "JP", updates, state, new Date("2026-08-21T12:00:00"));

    expect(rules.retirement.currentMonthlyLimits.firstInsured)
      .toBe(JP_COUNTRY_RULES.retirement.currentMonthlyLimits.firstInsured);
  });

  it("空白だけの施行日も即時有効として扱わない", () => {
    const updates = [{
      id: "REMOTE-BLANK-EFFECTIVE-DATE",
      country: "JP",
      effectiveDate: "   ",
      changes: [{ path: "retirement.currentMonthlyLimits.firstInsured", after: 999999995 }],
    }];
    const state = normalizeRuleUpdateState({ approved: { "REMOTE-BLANK-EFFECTIVE-DATE": true } });
    const rules = applyApprovedRuleUpdates(JP_COUNTRY_RULES, "JP", updates, state, new Date("2026-08-21T12:00:00"));

    expect(rules.retirement.currentMonthlyLimits.firstInsured)
      .toBe(JP_COUNTRY_RULES.retirement.currentMonthlyLimits.firstInsured);
  });

  it("実在するうるう日は通常どおり有効日として扱う", () => {
    const updates = [{
      id: "REMOTE-LEAP-DATE",
      country: "JP",
      effectiveDate: "2028-02-29",
      changes: [{ path: "retirement.currentMonthlyLimits.firstInsured", after: 75003 }],
    }];
    const state = normalizeRuleUpdateState({ approved: { "REMOTE-LEAP-DATE": true } });
    const rules = applyApprovedRuleUpdates(JP_COUNTRY_RULES, "JP", updates, state, new Date("2028-02-29T12:00:00"));

    expect(rules.retirement.currentMonthlyLimits.firstInsured).toBe(75003);
  });

});


describe("rule update source URL safety", () => {
  it("allows only absolute http/https official-source links", () => {
    expect(safeRuleSourceUrl(" https://example.com/rules?q=1 ")).toBe("https://example.com/rules?q=1");
    expect(safeRuleSourceUrl("http://example.com/rules")).toBe("http://example.com/rules");
    expect(safeRuleSourceUrl("javascript:alert(1)")).toBe("");
    expect(safeRuleSourceUrl("data:text/html,<script>alert(1)</script>")).toBe("");
    expect(safeRuleSourceUrl("/relative/source")).toBe("");
  });
});
