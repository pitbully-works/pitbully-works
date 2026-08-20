import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(__dirname, "App.jsx"), "utf8");

describe("制度更新センター 最終UI仕上げ", () => {
  it("0件は灰色表示にして、反映中の緑と区別する", () => {
    expect(app).toContain('color: "#9AA6AD"');
    expect(app).toContain("⚪ 承認待ちなし");
    expect(app).toContain("⚪ 新規の承認待ちなし");
  });

  it("制度ごとに独立した強いカード境界を持つ", () => {
    expect(app).toContain('border: "2px solid #344B57"');
    expect(app).toContain('borderLeft: `6px solid ${updateVisualStatus.color}`');
    expect(app).toContain('background: "#11191E"');
  });

  it("差分は必要時だけ展開し、履歴から該当制度へ移動できる", () => {
    expect(app).toContain("前回との差分を見る");
    expect(app).toContain("差分を閉じる");
    expect(app).toContain("expandedRuleDiffs[update.id]");
    expect(app).toContain("scrollIntoView");
  });

  it("公式ソースは視認性の高いボタン表示にする", () => {
    expect(app).toContain("公式ソースを開く");
    expect(app).toContain('color: "#8ED8FF"');
    expect(app).toContain('borderColor: "#3E8FB8"');
  });

  it("履歴は個別削除と国別全削除を持つ", () => {
    expect(app).toContain("deleteRuleUpdateHistoryEntry");
    expect(app).toContain("clearCountryRuleUpdateHistory");
    expect(app).toContain("この履歴を削除");
    expect(app).toContain("履歴を全削除");
  });
});
