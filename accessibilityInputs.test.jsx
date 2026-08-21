import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LocaleContext } from "./ui/locale.js";
import { Field, AgeField, LabeledMiniInput, MoneyField } from "./ui/inputs.jsx";

const locale = {
  country: "US",
  baseCurrency: "USD",
  currencySymbol: "$",
  language: "en",
  money: (v) => `$${v}`,
  label: (v) => v,
  t: (key) => ({ unitYears: "years", unitMonths: "months", unitMan: "10k" }[key] || key),
};

function withLocale(node) {
  return render(<LocaleContext.Provider value={locale}>{node}</LocaleContext.Provider>);
}

describe("common input accessibility", () => {
  it("Field explicitly associates its visible label with the input", () => {
    withLocale(<Field label="Current Age" value={57} onChange={vi.fn()} />);
    expect(screen.getByLabelText("Current Age")).toBeTruthy();
  });

  it("AgeField exposes distinct accessible names for years and months", () => {
    withLocale(<AgeField label="Retirement Age" value={65} onChange={vi.fn()} />);
    expect(screen.getByLabelText("Retirement Age years")).toBeTruthy();
    expect(screen.getByLabelText("Retirement Age months")).toBeTruthy();
  });

  it("LabeledMiniInput explicitly associates its label", () => {
    withLocale(<LabeledMiniInput label="Hospital days" value={10} onChange={vi.fn()} />);
    expect(screen.getByLabelText("Hospital days")).toBeTruthy();
  });

  it("normalizes lowercase/whitespace JPY before applying the 10k input scale", () => {
    const noisyLocale = { ...locale, country: "JP", baseCurrency: "  jpy  ", currencySymbol: "¥", t: (key) => ({ unitMan: "万円" }[key] || key) };
    render(<LocaleContext.Provider value={noisyLocale}><MoneyField label="生活費" value={240000} onChange={vi.fn()} /></LocaleContext.Provider>);
    expect(screen.getByLabelText("生活費").value).toBe("24");
    expect(screen.getByText("万円")).toBeTruthy();
  });

  it("does not apply the JPY 10k scale to noisy non-JPY currency codes", () => {
    const noisyLocale = { ...locale, baseCurrency: "  usd  ", currencySymbol: "$" };
    render(<LocaleContext.Provider value={noisyLocale}><MoneyField label="Living cost" value={240000} onChange={vi.fn()} /></LocaleContext.Provider>);
    expect(screen.getByLabelText("Living cost").value).toBe("240000");
    expect(screen.getByText("$")).toBeTruthy();
  });

});
