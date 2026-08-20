import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const app = fs.readFileSync(path.resolve(process.cwd(), "App.jsx"), "utf8");

describe("all-page inner card clarity", () => {
  it("cards charts tables and summary tiles consistently", () => {
    expect(app).toContain(".section-block .chart-frame");
    expect(app).toContain(".section-block > .card");
    expect(app).toContain(".section-block .stat-card");
    expect(app).toContain("table.watchlist");
    expect(app).toContain("table.mini-table");
    expect(app).toContain("border-left: 7px solid var(--module-accent)");
  });
});
