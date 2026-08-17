import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LocaleContext } from "./ui/locale.js";
import { Field, AgeField, LabeledMiniInput } from "./ui/inputs.jsx";

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
});
