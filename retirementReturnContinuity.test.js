import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("retirement return continuity UI", () => {
  it("自動退職後利回りは加重平均を半減せず継続する", () => {
    const app = fs.readFileSync(path.resolve(process.cwd(), "App.jsx"), "utf8");
    expect(app).toContain("Math.round(weightedAvgReturn * 100) / 100");
    expect(app).not.toContain("Math.round((weightedAvgReturn / 2) * 10) / 10");
    expect(app).toContain('t("autoWeightedSuffix")');
  });
});
