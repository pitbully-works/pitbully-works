import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const app = readFileSync(resolve(process.cwd(), "App.jsx"), "utf8");
const ja = readFileSync(resolve(process.cwd(), "translations/ja.js"), "utf8");

describe("個別グラフの分かりやすさ", () => {
  it("借入は借入名と時点を1本ごとのラベルにする", () => {
    expect(app).toContain('label: `${l.name || t("unnamedLoanLabel", { index: i + 1 })}｜${label}`');
    expect(app).toContain('dataKey="label"');
    expect(app).toContain('dataKey="balance"');
    expect(app).toContain('LabelList dataKey="balance" content={renderLoanBalanceLabel}');
    expect(app).toContain('fill="#E6EDF1"');
    expect(app).toContain('stroke="#0B1115"');
    expect(app).not.toContain('<Tooltip contentStyle={{ background: "transparent", border: "none", boxShadow: "none", fontSize: 12 }} itemStyle={{ textShadow: "0 0 3px #000, 0 0 3px #000, 0 0 2px #000" }} labelStyle={{ textShadow: "0 0 3px #000, 0 0 3px #000, 0 0 2px #000" }} formatter={(v) => money(v)} />\n                  <Bar dataKey="balance"');
    expect(ja).toContain("棒ごとに「借入名｜時点」を表示");
  });

  it("銀行グラフは余剰金を独立カテゴリとして表示し二重表示しない", () => {
    expect(app).toContain('const surplusRow = { name: t("surplusChartCategory") };');
    expect(app).toContain('rows[i][label] = balance - surplusPart;');
    expect(app).toContain('return [...rows, surplusRow];');
    expect(ja).toContain("総資産額は変わりません");
  });

  it("グラフから既存の余剰金説明へ移動できる", () => {
    expect(app).toContain('document.getElementById("section-surplus-balance")?.scrollIntoView');
    expect(app).toContain('t("readSurplusExplanationLink")');
  });
});
