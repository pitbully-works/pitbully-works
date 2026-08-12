import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const app = readFileSync(resolve(process.cwd(), "App.jsx"), "utf8");

describe("lifeplan -> kakeibo navigation", () => {
  it("5カ国すべてで選択中の国コードを家計簿URLへ渡す", () => {
    expect(app).toContain('const KAKEIBO_APP_URL = "https://kakeibo-lemon.vercel.app/";');
    expect(app).toContain('function buildKakeiboBridgeUrl(country)');
    expect(app).toContain('["JP", "US", "GB", "CA", "AU"].includes(country)');
    expect(app).toContain('?country=${encodeURIComponent(code)}');
    expect(app).toContain('href={buildKakeiboBridgeUrl(country)}');
    expect(app).not.toContain("#lpbridge=");
    expect(app).not.toContain("lpbridge=");
  });
});
