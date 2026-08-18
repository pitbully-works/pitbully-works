import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("tax/fixed-cost chart tooltip", () => {
  it("keeps the tooltip background transparent so the chart remains visible", () => {
    const app = fs.readFileSync(path.resolve(process.cwd(), "App.jsx"), "utf8");
    const start = app.indexOf('t("taxFixedCostChartTitle")');
    const end = app.indexOf('</ComposedChart>', start);
    const block = app.slice(start, end);
    expect(block).toContain('contentStyle={{ background: "transparent", border: "none", boxShadow: "none", fontSize: 12 }}');
  });
});
