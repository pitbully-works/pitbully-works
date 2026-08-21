import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { normalizeRuleUpdateState } from "./utils/ruleUpdates.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(__dirname, "App.jsx"), "utf8");

describe("制度更新履歴とモーダル視認性", () => {
  it("旧保存データにhistoryが無くても空配列へ正規化する", () => {
    expect(normalizeRuleUpdateState({ approved: { a: true } }).history).toEqual([]);
  });

  it("履歴は最大100件まで保持する", () => {
    const history = Array.from({ length: 130 }, (_, i) => ({ id: String(i), country: "JP", action: "approved" }));
    const state = normalizeRuleUpdateState({ history });
    expect(state.history).toHaveLength(100);
    expect(state.history[0].id).toBe("30");
  });

  it("モーダルは不透明背景と濃いオーバーレイを使う", () => {
    expect(app).toContain('background: "rgba(0,0,0,0.82)"');
    expect(app).toContain('background: "#151C20"');
    expect(app).toContain('maxHeight: "82vh"');
  });

  it("承認と保留を履歴へ記録し、履歴UIを表示する", () => {
    expect(app).toContain('recordRuleUpdateDecision(update, "approved")');
    expect(app).toContain('recordRuleUpdateDecision(update, "deferred")');
    expect(app).toContain("制度変更履歴");
    expect(app).toContain("まだ承認・保留の履歴はありません。");
    expect(app).toContain("現在：${currentStatus.ja}");
    expect(app).toContain("approved ${countryRuleUpdateHistory.filter");
  });
});
