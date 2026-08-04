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
import { mergeSavedInputs, RETIRED_INPUT_KEYS } from "./App.jsx";
import { elapsedScheduleAmount, elapsedLumpSumAmount } from "./utils/simulations.js";
import { JA_TRANSLATIONS } from "./translations/ja.js";
import { EN_TRANSLATIONS } from "./translations/en.js";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), "utf8");

const LABELS = {
  initialTsumitate: "つみたて 最初の残高", initialGrowth: "成長投資 最初の残高",
  tsumitate: "つみたて積立", growth: "成長投資 積立", lump: "一括投資",
};
const parts = (over = {}) => ({
  initialTsumitate: { principal: 534323, value: 534323, returnPct: 5 },
  initialGrowth: { principal: 200000, value: 210000, returnPct: 6 },
  tsumitate: { principal: 267600, value: 301000, returnPct: 5.6 },
  growth: { principal: 26760, value: 30000, returnPct: 6.5 },
  lump: { principal: 2280000, value: 2312000, returnPct: 5.8 },
  ...over,
});

describe("【1】4区分の組み立て", () => {
  it("最初の残高はつみたてと成長で分け、5区分で並ぶ", () => {
    expect(NISA_BREAKDOWN_KEYS).toEqual(["initialTsumitate", "initialGrowth", "tsumitate", "growth", "lump"]);
    const rows = buildNisaBreakdown(parts(), LABELS);
    expect(rows.map((r) => r.key)).toEqual(NISA_BREAKDOWN_KEYS);
    expect(rows.map((r) => r.name)).toEqual(Object.values(LABELS));
  });

  it("区分ごとに 元本・年率・評価額 を持つ", () => {
    const row = buildNisaBreakdown(parts(), LABELS)[2];
    expect(row.principal).toBe(267600);
    expect(row.returnPct).toBe(5.6);
    expect(row.value).toBe(301000);
    expect(row.gain).toBe(301000 - 267600);
  });

  it("評価額が元本を下回るときは、増減がマイナスになる", () => {
    const rows = buildNisaBreakdown(parts({ initialTsumitate: { principal: 600000, value: 534323, returnPct: 5 } }), LABELS);
    expect(rows[0].gain).toBeLessThan(0);
  });

  it("中身が空の区分は出さない（0円の棒を並べない）", () => {
    const rows = buildNisaBreakdown(parts({ initialGrowth: { principal: 0, value: 0, returnPct: 0 } }), LABELS);
    expect(rows.map((r) => r.key)).toEqual(["initialTsumitate", "tsumitate", "growth", "lump"]);
  });

  it("空の区分も残したいときは、そう指定できる", () => {
    const rows = buildNisaBreakdown(parts({ initialGrowth: { principal: 0, value: 0, returnPct: 0 } }), LABELS, { includeEmpty: true });
    expect(rows).toHaveLength(5);
  });

  it("数値でない値・欠けた区分が来ても落ちない", () => {
    const rows = buildNisaBreakdown(
      { initialTsumitate: { principal: "こわれ", value: null, returnPct: undefined }, tsumitate: { principal: 100, value: 120, returnPct: 5 } },
      LABELS, { includeEmpty: true }
    );
    expect(rows[0].principal).toBe(0);
    expect(rows[0].value).toBe(0);
    expect(rows[0].returnPct).toBe(0);
    expect(rows[2].principal).toBe(100);
    expect(() => buildNisaBreakdown(null, null)).not.toThrow();
    expect(buildNisaBreakdown(null, null)).toEqual([]);
  });
});

describe("【2】グラフ・表への受け渡し", () => {
  it("元本のグラフには、元本の入っている区分だけを渡す", () => {
    const rows = buildNisaBreakdown(parts({ growth: { principal: 0, value: 5000, returnPct: 6 } }), LABELS);
    const items = breakdownPrincipalItems(rows);
    expect(items.map((i) => i.name)).toEqual(["つみたて 最初の残高", "成長投資 最初の残高", "つみたて積立", "一括投資"]);
    expect(items[0]).toEqual({ name: "つみたて 最初の残高", amount: 534323 });
  });

  it("年率の目もりは必ず0%から始める（差を実際より大きく見せない）", () => {
    const bars = breakdownReturnBars(buildNisaBreakdown(parts(), LABELS));
    expect(bars.every((b) => b.axisMax === 7)).toBe(true);   // 最大6.5% → 0〜7%
    expect(bars.find((b) => b.key === "growth").widthPct).toBeCloseTo((6.5 / 7) * 100, 6);
    expect(bars.find((b) => b.key === "initialTsumitate").widthPct).toBeCloseTo((5 / 7) * 100, 6);
    expect(bars.some((b) => b.widthPct === 100)).toBe(false);
  });

  it("年率0%でも棒が消えてなくならない", () => {
    const bars = breakdownReturnBars(buildNisaBreakdown(parts({ initialTsumitate: { principal: 1000, value: 1000, returnPct: 0 } }), LABELS));
    expect(bars.find((b) => b.key === "initialTsumitate").widthPct).toBe(2);
  });

  it("全部が年率0%でも落ちない", () => {
    const flat = buildNisaBreakdown(
      { initialTsumitate: { principal: 100, value: 100, returnPct: 0 }, lump: { principal: 100, value: 100, returnPct: 0 } },
      LABELS
    );
    expect(breakdownReturnBars(flat).every((b) => b.widthPct === 0)).toBe(true);
  });

  it("合計は、元本と評価額をそれぞれ足したもの", () => {
    const totals = breakdownTotals(buildNisaBreakdown(parts(), LABELS));
    expect(totals.principal).toBeCloseTo(534323 + 200000 + 267600 + 26760 + 2280000, 6);
    expect(totals.value).toBeCloseTo(534323 + 210000 + 301000 + 30000 + 2312000, 6);
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
      initialTsumitate: { principal: 534323, value: 534323, returnPct: 5 },
      initialGrowth: { principal: 0, value: 0, returnPct: 0 },
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

  it("「最初の残高」は、つみたて枠と成長投資枠で分けて出す", () => {
    expect(app).toContain("const tsumitateHoldingsPrincipal");
    expect(app).toContain("const growthHoldingsPrincipal");
    expect(app).toContain('t("nisaBreakInitialTsumitateLabel")');
    expect(app).toContain('t("nisaBreakInitialGrowthLabel")');
  });

  it("4区分の名前が ja / en どちらでも出せる", () => {
    const keys = [
      "nisaBreakInitialTsumitateLabel", "nisaBreakInitialGrowthLabel",
      "nisaBreakTsumitateLabel", "nisaBreakGrowthLabel", "nisaBreakLumpLabel", "nisaBreakReturnAxis",
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

// ============================================================================
// 【5】廃止した「すでに使った枠」の後始末
//
// 画面から入力欄が消えたあとも保存データに値が残り、NISA枠の使用額へ
// 黙って足され続けていた。一括投資と同じお金を二重に数え、利用者からは
// 見えず、消す手段も無かった。項目ごと廃止する。
// ============================================================================
describe("【5】廃止した「すでに使った枠」の後始末", () => {
  const app = read("./App.jsx");
  const defaults = () => ({ currentAssets: 0, banks: [], gold: { currentGrams: 0 } });

  it("廃止した項目の一覧が決まっている", () => {
    expect(RETIRED_INPUT_KEYS).toContain("tsumitateUsed");
    expect(RETIRED_INPUT_KEYS).toContain("growthUsed");
  });

  it("保存データに残っていても読み込まない", () => {
    const merged = mergeSavedInputs(defaults(), { tsumitateUsed: 600000, growthUsed: 2400000, currentAssets: 300 });
    expect("tsumitateUsed" in merged).toBe(false);
    expect("growthUsed" in merged).toBe(false);
    expect(merged.currentAssets).toBe(300);
  });

  it("ほかの保存値は、これまでどおり読み込む", () => {
    const merged = mergeSavedInputs(defaults(), { banks: [{ name: "A", balance: 100 }], gold: { currentGrams: 208 } });
    expect(merged.banks).toEqual([{ name: "A", balance: 100 }]);
    expect(merged.gold.currentGrams).toBe(208);
  });

  it("既定値からも、日々の記録からも消えている", () => {
    expect(app).not.toContain("tsumitateUsed: 0,");
    expect(app).not.toContain("tsumitateUsed: nextInputs.tsumitateUsed");
  });

  it("枠の使用額は「実際の残高＋スケジュールの経過分」で数える", () => {
    expect(app).toContain("const computedTsumitateUsed = tsumitateHoldingsPrincipal + tsumitateElapsed;");
    expect(app).toContain("const computedGrowthUsed = growthHoldingsPrincipal + growthElapsed;");
  });

  it("シミュレーション側も、同じ数え方にそろえている", () => {
    const plan = read("./utils/buildPlanInput.js");
    expect(plan).not.toContain("Number(inputs.tsumitateUsed)");
    expect(plan).not.toContain("Number(inputs.growthUsed)");
    expect(plan).toContain("holdingsPrincipal(inputs.tsumitateHoldings)");
    expect(plan).toContain("holdingsPrincipal(inputs.growthHoldings)");
  });
});
