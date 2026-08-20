import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const app = fs.readFileSync(path.resolve(process.cwd(), "App.jsx"), "utf8");

describe("section card visual hierarchy", () => {
  it("makes every major section a clearly separated card", () => {
    expect(app).toContain("border-left: 8px solid var(--section-accent)");
    expect(app).toContain("margin-bottom: 28px");
    expect(app).toContain("border-radius: 14px");
  });

  it("gives the main input pages distinct accent groups", () => {
    expect(app).toContain('.section-block:has(#section-02) { --section-accent: #4FA8D8; }');
    expect(app).toContain('.section-block:has(#section-03) { --section-accent: #9B7AF2; }');
    expect(app).toContain('.section-block:has(#section-04) { --section-accent: #57BC87; }');
    expect(app).toContain('.section-block:has(#section-07) { --section-accent: #D8AE4F; }');
  });

  it("adds a divider under section headings", () => {
    expect(app).toContain("border-bottom: 1px solid rgba(160,190,205,0.20)");
  });
});
