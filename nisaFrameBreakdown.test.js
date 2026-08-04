// ============================================================================
// nisaFrameBreakdown.test.js
//
// 現在のNISA資産を「どこから来たお金か」で4つに分けて見せる表示の回帰テスト。
//
//   【1】4区分の組み立て（純粋関数）
//   【2】元本のグラフ・年率のグラフ・明細表への受け渡し
//   【3】報告された保存データでの並び
//   【4】画面との配線（見出し・翻訳・古いグラフが残っていないこと）
//
// 【背景】以前ここには「つみたて枠 × 成長投資枠」の円グラフがあった。
// 見出しは「現在のNISA資産の内訳」なのに、中身は枠の使用額（元本）で、
// すぐ上に出ている評価額と食い違って読めてしまい、資産が減ったように見えていた。
// お金の出どころで分け、元本と年率を別のグラフにして置き換えた。
//
// 【重要】ここで見るのは表示用の整形だけで、エンジンの計算には触れない。
// ============================================================================
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  buildNisaBreakdown, breakdownPrincipalItems, breakdownReturnBars, breakdownTotals,
  NISA_BREAKDOWN_KEYS,
} from "./utils/nisaBreakdown.js";
import { elapsedScheduleAmount, elapsedLumpSumAmount } from "./utils/simulations.js";
import { JA_TRANSLATIONS } from "./translations/ja.js";
import { EN_TRANSLATIONS } from "./translations/en.js";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), "utf8");

const LABELS = {
  initial: "最初の残高", tsumitate: "つみたて積立", growth: "成長投資 積立", lump: "一括投資",
};
const parts = (over = {}) => ({
  initial: { principal: 534323, value: 534323, returnPct: 5 },
  tsumitate: { principal: 267600, value: 301000, returnPct: 5.6 },
  growth: { principal: 26760, value: 30000, returnPct: 6.5 },
  lump: { principal: 2280000, value: 2312000, returnPct: 5.8 },
  ...over,
});

describe("【1】4区分の組み立て", () => {
  it("最初の残高・つみたて積立・成長投資積立・一括投資の順に並ぶ", () => {
    expect(NISA_BREAKDOWN_KEYS).toEqual(["initial", "tsumitate", "growth", "lump"]);
    const rows = buildNisaBreakdown(parts(), LABELS);
    expect(rows.map((r) => r.key)).toEqual(["initial", "tsumitate", "growth", "lump"]);
    expect(rows.map((r) => r.name)).toEqual(Object.values(LABELS));
  });

  it("区分ごとに 元本・年率・評価額 を持つ", () => {
    const row = buildNisaBreakdown(parts(), LABELS)[1];
    expect(row.principal).toBe(267600);
    expect(row.returnPct).toBe(5.6);
    expect(row.value).toBe(301000);
    expect(row.gain).toBe(301000 - 267600);
  });

  it("評価額が元本を下回るときは、増減がマイナスになる", () => {
    const rows = buildNisaBreakdown(parts({ initial: { principal: 600000, value: 534323, returnPct: 5 } }), LABELS);
    expect(rows[0].gain).toBeLessThan(0);
  });

  it("中身が空の区分は出さない（0円の棒を並べない）", () => {
    const rows = buildNisaBreakdown(parts({ growth: { principal: 0, value: 0, returnPct: 0 } }), LABELS);
    expect(rows.map((r) => r.key)).toEqual(["initial", "tsumitate", "lump"]);
  });

  it("空の区分も残したいときは、そう指定できる", () => {
    const rows = buildNisaBreakdown(parts({ growth: { principal: 0, value: 0, returnPct: 0 } }), LABELS, { includeEmpty: true });
    expect(rows).toHaveLength(4);
  });

  it("数値でない値・欠けた区分が来ても落ちない", () => {
    const rows = buildNisaBreakdown(
      { initial: { principal: "こわれ", value: null, returnPct: undefined }, tsumitate: { principal: 100, value: 120, returnPct: 5 } },
      LABELS, { includeEmpty: true }
    );
    expect(rows[0].principal).toBe(0);
    expect(rows[0].value).toBe(0);
    expect(rows[0].returnPct).toBe(0);
    expect(rows[1].principal).toBe(100);
    expect(() => buildNisaBreakdown(null, null)).not.toThrow();
    expect(buildNisaBreakdown(null, null)).toEqual([]);
  });
});

describe("【2】グラフ・表への受け渡し", () => {
  it("元本のグラフには、元本の入っている区分だけを渡す", () => {
    const rows = buildNisaBreakdown(parts({ growth: { principal: 0, value: 5000, returnPct: 6 } }), LABELS);
    const items = breakdownPrincipalItems(rows);
    expect(items.map((i) => i.name)).toEqual(["最初の残高", "つみたて積立", "一括投資"]);
    expect(items[0]).toEqual({ name: "最初の残高", amount: 534323 });
  });

  it("年率は円グラフにせず、いちばん高い区分を基準にした棒にする", () => {
    const bars = breakdownReturnBars(buildNisaBreakdown(parts(), LABELS));
    const top = bars.find((b) => b.key === "growth");     // 6.5% がいちばん高い
    expect(top.widthPct).toBe(100);
    const initial = bars.find((b) => b.key === "initial"); // 5.0%
    expect(initial.widthPct).toBeCloseTo((5 / 6.5) * 100, 6);
  });

  it("年率0%でも棒が消えてなくならない", () => {
    const bars = breakdownReturnBars(buildNisaBreakdown(parts({ initial: { principal: 1000, value: 1000, returnPct: 0 } }), LABELS));
    expect(bars.find((b) => b.key === "initial").widthPct).toBe(2);
  });

  it("全部が年率0%でも落ちない", () => {
    const flat = buildNisaBreakdown(
      { initial: { principal: 100, value: 100, returnPct: 0 }, lump: { principal: 100, value: 100, returnPct: 0 } },
      LABELS
    );
    expect(breakdownReturnBars(flat).every((b) => b.widthPct === 0)).toBe(true);
  });

  it("合計は、元本と評価額をそれぞれ足したもの", () => {
    const totals = breakdownTotals(buildNisaBreakdown(parts(), LABELS));
    expect(totals.principal).toBeCloseTo(534323 + 267600 + 26760 + 2280000, 6);
    expect(totals.value).toBeCloseTo(534323 + 301000 + 30000 + 2312000, 6);
    expect(totals.gain).toBeCloseTo(totals.value - totals.principal, 6);
  });

  it("配列でないものを渡しても落ちない", () => {
    expect(breakdownPrincipalItems(null)).toEqual([]);
    expect(breakdownReturnBars(null)).toEqual([]);
    expect(breakdownTotals(null)).toEqual({ principal: 0, value: 0, gain: 0 });
  });
});

describe("【3】報告された保存データでの並び", () => {
  // 1968-11-13生・57.7歳時点。57.5歳で¥228万を一括投資し、
  // 同時に月10万のつみたてと月1万の成長投資を始めている。
  const age = 57.723;
  const rows = buildNisaBreakdown(
    {
      initial: { principal: 534323, value: 534323, returnPct: 5 },
      tsumitate: {
        principal: elapsedScheduleAmount([{ fromAge: 57.5, toAge: 65, monthlyYen: 100000 }], age),
        value: 301000, returnPct: 5.6,
      },
      growth: {
        principal: elapsedScheduleAmount([{ fromAge: 57.5, toAge: 65, monthlyYen: 10000 }], age),
        value: 30000, returnPct: 6.5,
      },
      lump: {
        principal: elapsedLumpSumAmount(
          [{ age: 57.5, amount: 2280000 }, { age: 59, amount: 2280000 }, { age: 60, amount: 2280000 }, { age: 61, amount: 1200000 }],
          age
        ),
        value: 2312000, returnPct: 5.8,
      },
    },
    LABELS
  );

  it("まだ先の一括投資は元本に入らない（57.5歳の¥228万だけ）", () => {
    expect(rows.find((r) => r.key === "lump").principal).toBe(2280000);
  });

  it("元本の合計が、申告された残高と桁違いにならない", () => {
    // 申告された現在のNISA残高（評価額）は ¥3,178,251。
    // 元本と評価額は本来ぴったり同じにはならないが、近い水準に収まる。
    const totals = breakdownTotals(rows);
    expect(Math.abs(totals.principal - 3178251)).toBeLessThan(200000);
  });

  it("以前の「枠の使用額」表示のように、倍近くふくらまない", () => {
    // 直す前のグラフは、保存データに取り残された¥300万を足して¥557.9万を出していた。
    expect(breakdownTotals(rows).principal).toBeLessThan(4000000);
  });
});

describe("【4】画面との配線", () => {
  const app = read("./App.jsx");

  it("古い「つみたて枠 × 成長投資枠」の円グラフは残っていない", () => {
    expect(app).not.toContain("nisaFrameAllocationItems");
    expect(JA_TRANSLATIONS.nisaBreakdownChartTitle).toBeUndefined();
    expect(EN_TRANSLATIONS.nisaBreakdownChartTitle).toBeUndefined();
  });

  it("元本のグラフと年率のグラフを、別々に出している", () => {
    expect(app).toContain('t("nisaBreakPrincipalChartTitle")');
    expect(app).toContain('t("nisaBreakReturnChartTitle")');
    expect(app).toContain("items={nisaBreakdownPrincipalItems}");
    expect(app).toContain("nisaBreakdownReturnBars.map");
  });

  it("元本・年率・評価額を数字でも確かめられる表がある", () => {
    expect(app).toContain('className="mini-table"');
    for (const key of ["nisaBreakColPrincipal", "nisaBreakColReturn", "nisaBreakColValue", "nisaBreakColTotal"]) {
      expect(app).toContain(`t("${key}")`);
    }
  });

  it("評価額は上の合計と同じ計算を使い回している（別々に計算し直さない）", () => {
    const idx = app.indexOf("const nisaBreakdownRows = buildNisaBreakdown");
    expect(idx).toBeGreaterThan(0);
    const block = app.slice(idx, idx + 1200);
    expect(block).toContain("tsumitateCatchUp");
    expect(block).toContain("growthCatchUp");
    expect(block).toContain("lumpElapsedTotal");
  });

  it("「最初の残高」は、つみたて枠と成長投資枠を合算している", () => {
    const idx = app.indexOf("const initialHoldingsPrincipal");
    expect(idx).toBeGreaterThan(0);
    const block = app.slice(idx, idx + 320);
    expect(block).toContain("inputs.tsumitateHoldings");
    expect(block).toContain("inputs.growthHoldings");
  });

  it("4区分の名前が ja / en どちらでも出せる", () => {
    const keys = [
      "nisaBreakInitialLabel", "nisaBreakTsumitateLabel", "nisaBreakGrowthLabel", "nisaBreakLumpLabel",
      "nisaBreakPrincipalChartTitle", "nisaBreakReturnChartTitle", "nisaBreakChartNote",
      "nisaBreakColSource", "nisaBreakColPrincipal", "nisaBreakColReturn", "nisaBreakColValue", "nisaBreakColTotal",
    ];
    for (const dict of [JA_TRANSLATIONS, EN_TRANSLATIONS]) {
      for (const k of keys) expect(dict[k]).toBeTruthy();
    }
  });

  it("見出しが「元本」だと分かる書き方になっている", () => {
    expect(JA_TRANSLATIONS.nisaBreakPrincipalChartTitle).toContain("元本");
    expect(JA_TRANSLATIONS.nisaBreakChartNote).toContain("一致します");
  });

  it("年率の棒グラフと明細表の見た目が用意されている", () => {
    expect(app).toContain(".rate-bar-track");
    expect(app).toContain(".mini-table {");
  });
});
