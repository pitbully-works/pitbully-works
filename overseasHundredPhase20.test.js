import { describe, expect, it } from "vitest";
import { CA_COUNTRY_RULES } from "./countryRules/CA.js";

const tax = CA_COUNTRY_RULES.tax;

function progressive(income, bands) {
  let total = 0, lower = 0;
  for (const b of bands) {
    if (income <= lower) break;
    total += (Math.min(income, b.upTo) - lower) * b.rate;
    lower = b.upTo;
  }
  return total;
}

describe("overseas 100 phase 20 — remaining Canada 2026 province/territory tax", () => {
  it("implements all 10 provinces and 3 territories", () => {
    expect(tax.province.implementedRegions).toEqual(
      ["ON","QC","BC","AB","MB","SK","NS","NB","PE","NL","NT","NU","YT"]
    );
  });

  it("protects Newfoundland and Labrador 2026 brackets, rates and BPA", () => {
    const c=tax.province.newfoundlandLabrador;
    expect(c.bands.map(x=>x.upTo)).toEqual([44678,89354,159528,223340,285319,570638,1141275,Infinity]);
    expect(c.bands.map(x=>x.rate)).toEqual([0.087,0.145,0.158,0.178,0.198,0.208,0.213,0.218]);
    expect(c.basicPersonalAmount).toBe(13094);
  });

  it("protects Northwest Territories 2026 brackets, rates and BPA", () => {
    const c=tax.province.northwestTerritories;
    expect(c.bands.map(x=>x.upTo)).toEqual([53003,106009,172346,Infinity]);
    expect(c.bands.map(x=>x.rate)).toEqual([0.059,0.086,0.122,0.1405]);
    expect(c.basicPersonalAmount).toBe(18198);
  });

  it("protects Nunavut 2026 brackets, rates and BPA", () => {
    const c=tax.province.nunavut;
    expect(c.bands.map(x=>x.upTo)).toEqual([55801,111602,181439,Infinity]);
    expect(c.bands.map(x=>x.rate)).toEqual([0.04,0.07,0.09,0.115]);
    expect(c.basicPersonalAmount).toBe(19659);
  });

  it("protects Yukon 2026 brackets, rates and tapered BPA", () => {
    const c=tax.province.yukon;
    expect(c.bands.map(x=>x.upTo)).toEqual([58523,117045,181440,500000,Infinity]);
    expect(c.bands.map(x=>x.rate)).toEqual([0.064,0.09,0.109,0.128,0.15]);
    expect(c.basicPersonalAmount).toBe(16452);
    expect(c.basicPersonalAmountMinimum).toBe(14829);
  });

  it.each([
    ["NL","newfoundlandLabrador",90000],
    ["NT","northwestTerritories",90000],
    ["NU","nunavut",90000],
    ["YT","yukon",90000],
  ])("routes %s and computes progressive tax", (code,key,income) => {
    const c=tax.province[key];
    const r=tax.calculateProvincialTax(income,code);
    const expected=progressive(income,c.bands)-r.basicPersonalAmount*c.basicCreditRate;
    expect(r.tax).toBeCloseTo(Math.max(0,expected),6);
  });

  it.each(["NL","NT","NU","YT"])("%s supports capital gains and RRSP saving", (code) => {
    expect(tax.calculateProvincialCapitalGainsTax(30000,70000,code)).toBeGreaterThan(0);
    expect(tax.calculateProvincialRrspTaxSaving(10000,90000,30000,code)).toBeGreaterThan(0);
  });

  it("keeps unknown province/territory codes unsupported", () => {
    const r=tax.calculateProvincialTax(80000,"XX");
    expect(r.tax).toBe(0);
    expect(r.unsupported).toBe(true);
  });
});
