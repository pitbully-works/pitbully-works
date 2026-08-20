import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(__dirname, "App.jsx"), "utf8");

describe("制度更新センター UI", () => {
  it("トップ状態は未承認=赤・保留=黄・最新=緑の3段階", () => {
    expect(app).toContain('"#E06B5A"');
    expect(app).toContain('"#D9A54F"');
    expect(app).toContain('"#54B07A"');
    expect(app).toContain("🔴 制度更新あり");
    expect(app).toContain("🟡 制度更新を保留中");
    expect(app).toContain("🟢 制度は最新です");
  });

  it("制度更新センターはモーダルで開き、背景タップと閉じる操作を持つ", () => {
    expect(app).toContain('role="dialog"');
    expect(app).toContain('aria-modal="true"');
    expect(app).toContain('background: "rgba(0,0,0,0.58)"');
    expect(app).toContain('onClick={() => setShowRuleUpdates(false)}');
  });

  it("モーダル表示中は背景スクロールを止め、Escapeでも閉じられる", () => {
    expect(app).toContain('document.body.style.overflow = "hidden"');
    expect(app).toContain('event.key === "Escape"');
    expect(app).toContain('window.addEventListener("keydown", onKeyDown)');
  });
});
