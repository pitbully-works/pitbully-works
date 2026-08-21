import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildKakeiboBridgeUrl } from "./App.jsx";

const app = readFileSync(resolve(process.cwd(), "App.jsx"), "utf8");

describe("lifeplan -> kakeibo navigation", () => {
  it("5カ国すべてで選択中の国コードを家計簿URLへ渡す", () => {
    expect(app).toContain('const KAKEIBO_APP_URL = "https://kakeibo-lemon.vercel.app/";');
    expect(app).toContain('function buildKakeiboBridgeUrl(country)');
    expect(app).toContain('["JP", "US", "GB", "CA", "AU"].includes(raw)');
    expect(app).toContain('?country=${encodeURIComponent(code)}');
    expect(app).toContain('href={buildKakeiboBridgeUrl(country)}');
    expect(app).not.toContain("#lpbridge=");
    expect(app).not.toContain("lpbridge=");
  });

  it("小文字や前後空白でも5か国コードを正規化して渡す", () => {
    expect(buildKakeiboBridgeUrl(" us ")).toBe("https://kakeibo-lemon.vercel.app/?country=US");
    expect(buildKakeiboBridgeUrl("gb")).toBe("https://kakeibo-lemon.vercel.app/?country=GB");
    expect(buildKakeiboBridgeUrl("ca")).toBe("https://kakeibo-lemon.vercel.app/?country=CA");
    expect(buildKakeiboBridgeUrl("au")).toBe("https://kakeibo-lemon.vercel.app/?country=AU");
  });

  it("未知の国コードをJPへ誤変換しない", () => {
    expect(buildKakeiboBridgeUrl("XX")).toBe("https://kakeibo-lemon.vercel.app/");
    expect(buildKakeiboBridgeUrl("")).toBe("https://kakeibo-lemon.vercel.app/");
    expect(buildKakeiboBridgeUrl(null)).toBe("https://kakeibo-lemon.vercel.app/");
  });
});
