import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const app = fs.readFileSync(path.resolve(process.cwd(), "App.jsx"), "utf8");

describe("section card visual hierarchy", () => {
  it("makes every major section a clearly separated card", () => {
    expect(app).toContain("border-left: 8px solid var(--section-accent)");
    expect(app).toContain("margin-bottom: 34px");
    expect(app).toContain("border-radius: 14px");
  });

  it("uses the same current blue accent for every page card", () => {
    expect(app).toContain("--section-accent: #4FA8D8;");
    expect(app).not.toContain('.section-block:has(#section-03) { --section-accent: #9B7AF2; }');
    expect(app).not.toContain('.section-block:has(#section-04) { --section-accent: #57BC87; }');
  });

  it("alternates only the quick-nav border between blue and lighter blue", () => {
    expect(app).toContain('.quicknav .quicknav-btn:nth-child(even):not(.is-current)');
    expect(app).toContain('border-color: rgba(126, 199, 235, 0.82)');
  });

  it("adds a divider under section headings", () => {
    expect(app).toContain("border-bottom: 1px solid rgba(160,190,205,0.20)");
  });
});
