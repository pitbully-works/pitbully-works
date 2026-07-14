// ============================================================================
// generateAdvice.test.js
//
// 診断コメント（utils/generateAdvice.js）のテスト。
// generateAdvice は React も翻訳辞書も使わない純粋関数なので、追加パッケージなしで検証できる。
//
// 【このテストが守るもの】
// ・判定の分岐（資産寿命 / 資産形成 / 老後収支 / 相続 / 総合評価）が仕様どおりであること
// ・返す翻訳キーが translations/ に実在すること（キー名の打ち間違いで文章が出ない事故を防ぐ）
// ・根拠のない金額を勝手に作っていないこと
// ============================================================================

import { describe, it, expect } from "vitest";
import { generateAdvice } from "./utils/generateAdvice.js";
import { TRANSLATIONS } from "./translations/index.js";

// 「資産が寿命まで持ち、老後も黒字、相続目標も達成」する健全なケースを土台にする。
const HEALTHY = {
  currentAge: 40,
  retireAge: 65,
  deathAge: 95,
  depletionAge: null,
  netWorthNow: 5_000_000,
  netWorthAtRetire: 40_000_000,
  netWorthFinal: 20_000_000,
  inheritanceTarget: 10_000_000,
  retirementMonthlyGap: -30_000, // マイナス＝収入が生活費を上回る（黒字）
};

const byId = (advice, id) => advice.find((a) => a.id === id);

describe("generateAdvice：想定寿命まで資産が残るケース", () => {
  const advice = generateAdvice(HEALTHY);

  it("資産寿命は success で、想定寿命の年齢を差し込む", () => {
    const a = byId(advice, "assetLife");
    expect(a.severity).toBe("success");
    expect(a.messageKey).toBe("adviceAssetLifeOk");
    expect(a.vars.age).toBe(95);
  });

  it("総合評価は「良好」になり、必ず先頭に置かれる", () => {
    expect(advice[0].id).toBe("overall");
    expect(advice[0].severity).toBe("success");
    expect(advice[0].valueKey).toBe("adviceOverallGood");
  });

  it("問題が無いので、ワンポイントアドバイスは出さない", () => {
    expect(byId(advice, "tip")).toBe(undefined);
  });
});

describe("generateAdvice：途中で資産が尽きるケース", () => {
  const advice = generateAdvice({ ...HEALTHY, depletionAge: 82.4 });

  it("資産寿命は danger で、尽きる年齢を四捨五入して差し込む", () => {
    const a = byId(advice, "assetLife");
    expect(a.severity).toBe("danger");
    expect(a.messageKey).toBe("adviceAssetLifeShort");
    expect(a.vars.age).toBe(82);
  });

  it("総合評価は「要改善」になる", () => {
    expect(advice[0].severity).toBe("danger");
    expect(advice[0].valueKey).toBe("adviceOverallBad");
  });

  it("改善案（ワンポイントアドバイス）を1つだけ出す", () => {
    const tips = advice.filter((a) => a.id === "tip");
    expect(tips.length).toBe(1);
    expect(tips[0].messageKey).toBe("adviceTipGeneric");
  });

  it("根拠のない金額を作らない（vars に金額を持たせない）", () => {
    for (const a of advice) {
      const keys = Object.keys(a.vars || {});
      expect(keys.every((k) => k === "age")).toBe(true);
    }
  });
});

describe("generateAdvice：退職後の収支が赤字のケース", () => {
  const advice = generateAdvice({ ...HEALTHY, retirementMonthlyGap: 50_000 });

  it("老後収支は warning になる", () => {
    const a = byId(advice, "retirementCashflow");
    expect(a.severity).toBe("warning");
    expect(a.messageKey).toBe("adviceRetirementCashflowDeficit");
  });

  it("資産自体は寿命まで持つので、総合評価は「注意」（要改善ではない）", () => {
    expect(advice[0].severity).toBe("warning");
    expect(advice[0].valueKey).toBe("adviceOverallWarn");
  });

  it("判定できない国（gap が null）では、老後収支の項目自体を出さない", () => {
    const noGap = generateAdvice({ ...HEALTHY, retirementMonthlyGap: null });
    expect(byId(noGap, "retirementCashflow")).toBe(undefined);
  });
});

describe("generateAdvice：相続目標を達成するケース", () => {
  it("最終資産が目標以上なら success", () => {
    const a = byId(generateAdvice(HEALTHY), "inheritance");
    expect(a.severity).toBe("success");
    expect(a.messageKey).toBe("adviceInheritanceOk");
  });

  it("ちょうど同額でも達成扱いにする（境界）", () => {
    const a = byId(generateAdvice({ ...HEALTHY, netWorthFinal: 10_000_000 }), "inheritance");
    expect(a.severity).toBe("success");
  });

  it("届かなければ warning になり、総合評価も「注意」に下がる", () => {
    const advice = generateAdvice({ ...HEALTHY, netWorthFinal: 3_000_000 });
    expect(byId(advice, "inheritance").messageKey).toBe("adviceInheritanceShort");
    expect(advice[0].valueKey).toBe("adviceOverallWarn");
  });

  it("相続目標が未設定（0）なら、相続の項目自体を出さない", () => {
    const advice = generateAdvice({ ...HEALTHY, inheritanceTarget: 0 });
    expect(byId(advice, "inheritance")).toBe(undefined);
  });
});

describe("generateAdvice：資産形成（退職時点）", () => {
  it("退職時点の資産が現在より多ければ success", () => {
    expect(byId(generateAdvice(HEALTHY), "accumulation").severity).toBe("success");
  });

  it("増えていなければ warning", () => {
    const advice = generateAdvice({ ...HEALTHY, netWorthAtRetire: 4_000_000 });
    expect(byId(advice, "accumulation").messageKey).toBe("adviceAccumulationFlat");
  });

  it("すでに退職年齢を過ぎている人には、この項目を出さない", () => {
    const advice = generateAdvice({ ...HEALTHY, currentAge: 70 });
    expect(byId(advice, "accumulation")).toBe(undefined);
  });
});

describe("generateAdvice：返した翻訳キーがすべて辞書に実在する", () => {
  const cases = [
    HEALTHY,
    { ...HEALTHY, depletionAge: 82 },
    { ...HEALTHY, retirementMonthlyGap: 50_000 },
    { ...HEALTHY, netWorthFinal: 0 },
    { ...HEALTHY, currentAge: 70, retirementMonthlyGap: null, inheritanceTarget: 0 },
  ];

  for (const lang of ["ja", "en", "en-GB"]) {
    it(`${lang} の辞書に、全ケースで使うキーが揃っている`, () => {
      const dict = TRANSLATIONS[lang];
      const missing = [];
      for (const input of cases) {
        for (const a of generateAdvice(input)) {
          for (const key of [a.titleKey, a.messageKey, a.valueKey].filter(Boolean)) {
            if (dict[key] === undefined) missing.push(key);
          }
        }
      }
      expect(missing, `${lang} に無いキー: ${missing.join(", ")}`).toEqual([]);
    });
  }

  it("画面が使うカード見出し・注意書きのキーも実在する", () => {
    for (const lang of ["ja", "en", "en-GB"]) {
      expect(TRANSLATIONS[lang].adviceCardTitle !== undefined).toBe(true);
      expect(TRANSLATIONS[lang].adviceNote !== undefined).toBe(true);
    }
  });
});
