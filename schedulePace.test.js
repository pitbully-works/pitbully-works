// ============================================================================
// schedulePace.test.js
//
// 積立スケジュールの「いまの状態」を言い分ける仕組みのテスト。
//
// 【背景】年間上限カードの「現在のペース」は、いまの年齢が区間の中にあるかだけを
// 見ていた。そのため開始年齢が数日先だと「月¥0のペース」とだけ出て、
// 入力を間違えたのか、まだ始まっていないだけなのか区別がつかなかった。
// （57歳9ヶ月開始・現在57歳8.7ヶ月で、つみたてが月¥0と表示された）
//
// 【重要】表示の言い分けだけで、金額の計算そのものには関与しない。
// ============================================================================
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describeSchedulePace } from "./utils/schedulePace.js";
import { scheduledAmount } from "./utils/simulations.js";
import { JA_TRANSLATIONS } from "./translations/ja.js";
import { EN_TRANSLATIONS } from "./translations/en.js";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), "utf8");

describe("積立スケジュールの状態", () => {
  const soon = [{ fromAge: 57.75, toAge: 65, monthlyYen: 90000 }];

  it("開始前は「これから始まる」と分かる（月¥0とだけ出さない）", () => {
    const pace = describeSchedulePace(soon, 57.723);   // 開始まであと約10日
    expect(pace.status).toBe("upcoming");
    expect(pace.nextFromAge).toBe(57.75);
    expect(pace.nextMonthly).toBe(90000);
  });

  it("区間の中にいれば「積立中」と、その月額を返す", () => {
    const pace = describeSchedulePace(soon, 57.8);
    expect(pace.status).toBe("active");
    expect(pace.monthly).toBe(90000);
  });

  it("開始年齢ちょうどで「積立中」に切り替わる", () => {
    expect(describeSchedulePace(soon, 57.75).status).toBe("active");
    expect(describeSchedulePace(soon, 57.7499).status).toBe("upcoming");
  });

  it("すべて過ぎていれば「終了」と分かる", () => {
    expect(describeSchedulePace(soon, 66).status).toBe("ended");
    expect(describeSchedulePace(soon, 65).status).toBe("active");  // 終了年齢は含む
  });

  it("予定が1件も無ければ「未入力」と分かる", () => {
    expect(describeSchedulePace([], 57.7).status).toBe("none");
    expect(describeSchedulePace(null, 57.7).status).toBe("none");
    expect(describeSchedulePace(undefined, 57.7).status).toBe("none");
  });

  it("区間が複数あるとき、いちばん早く始まるものを指す", () => {
    const many = [
      { fromAge: 62, toAge: 65, monthlyYen: 50000 },
      { fromAge: 58, toAge: 61, monthlyYen: 30000 },
    ];
    const pace = describeSchedulePace(many, 57.5);
    expect(pace.nextFromAge).toBe(58);
    expect(pace.nextMonthly).toBe(30000);
  });

  it("同じ年齢から始まる区間が複数あれば、月額を合算する", () => {
    const same = [
      { fromAge: 58, toAge: 61, monthlyYen: 30000 },
      { fromAge: 58, toAge: 65, monthlyYen: 20000 },
    ];
    expect(describeSchedulePace(same, 57).nextMonthly).toBe(50000);
  });

  it("重なった区間の中にいるときは、月額を合算する（既存の数え方と同じ）", () => {
    const overlap = [
      { fromAge: 55, toAge: 65, monthlyYen: 30000 },
      { fromAge: 57, toAge: 60, monthlyYen: 20000 },
    ];
    expect(describeSchedulePace(overlap, 58).monthly).toBe(50000);
    // 既存の scheduledAmount と食い違わないこと
    expect(describeSchedulePace(overlap, 58).monthly).toBe(scheduledAmount(overlap, 58));
  });

  it("壊れた行や年齢が来ても落ちない", () => {
    const broken = [{ fromAge: "こわれ", toAge: 65, monthlyYen: 1000 }, { fromAge: 58, toAge: 60, monthlyYen: 2000 }];
    expect(() => describeSchedulePace(broken, 57)).not.toThrow();
    expect(describeSchedulePace(broken, 57).nextFromAge).toBe(58);
    expect(describeSchedulePace([{ fromAge: 58, toAge: 60, monthlyYen: 2000 }], "こわれ").status).toBe("none");
  });

  it("月額が未入力の区間でも、開始予定は分かる", () => {
    const pace = describeSchedulePace([{ fromAge: 58, toAge: 60 }], 57);
    expect(pace.status).toBe("upcoming");
    expect(pace.nextMonthly).toBe(0);
  });
});

describe("画面との配線", () => {
  const app = read("./App.jsx");

  it("つみたて・成長投資枠の両方で言い分けている", () => {
    expect(app).toContain("const tsumitatePace = describeSchedulePace(inputs.tsumitateSchedule, effectiveCurrentAge);");
    expect(app).toContain("const growthPace = describeSchedulePace(inputs.growthSchedule, effectiveCurrentAge);");
    expect(app).toContain("paceNote(tsumitatePace, currentTsumitateMonthly, tsumitateAnnualPace)");
    expect(app).toContain("paceNote(growthPace, currentGrowthMonthly, growthAnnualPace)");
  });

  it("開始前は、開始年齢と月額を出す", () => {
    const idx = app.indexOf("const paceNote =");
    expect(idx).toBeGreaterThan(0);
    const block = app.slice(idx, idx + 600);
    expect(block).toContain('t("pacePendingNote"');
    expect(block).toContain("formatAge(pace.nextFromAge)");
    expect(block).toContain("money(pace.nextMonthly)");
  });

  it("終了後・未入力も、それと分かる文言にしている", () => {
    const idx = app.indexOf("const paceNote =");
    const block = app.slice(idx, idx + 600);
    expect(block).toContain('t("paceEndedNote")');
    expect(block).toContain('t("paceNoneNote")');
  });

  it("積立中はこれまでどおりの文言に戻る", () => {
    const idx = app.indexOf("const paceNote =");
    const block = app.slice(idx, idx + 600);
    expect(block).toContain('t("monthlyPaceNote"');
  });

  it("文言が ja / en どちらにもある", () => {
    for (const dict of [JA_TRANSLATIONS, EN_TRANSLATIONS]) {
      for (const k of ["pacePendingNote", "paceEndedNote", "paceNoneNote", "monthlyPaceNote"]) {
        expect(dict[k]).toBeTruthy();
      }
    }
    expect(JA_TRANSLATIONS.pacePendingNote).toContain("{age}");
    expect(JA_TRANSLATIONS.pacePendingNote).toContain("{monthly}");
  });
});
