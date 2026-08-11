import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const app = readFileSync(resolve(process.cwd(), "App.jsx"), "utf8");

describe("lifeplan -> kakeibo navigation", () => {
  it("家計簿はデータを渡さずURLをそのまま開く", () => {
    expect(app).toContain('const KAKEIBO_APP_URL = "https://kakeibo-lemon.vercel.app/";');
    expect(app).toMatch(/function buildKakeiboBridgeUrl\(\)\s*\{\s*return KAKEIBO_APP_URL;\s*\}/);
    expect(app).not.toContain("#lpbridge=");
    expect(app).not.toContain("lpbridge=");
  });
});
