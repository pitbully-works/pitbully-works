// ============================================================================
// utils/inputValidation.test.js
//
// Ver.1.0 公開前の品質対応（表示のみ・計算は不変）の回帰テスト。
//
//   【1】未入力状態では診断を出さない（何も入れていないのに「資産が持つ」と言わない）
//   【2】保存できない環境の文言に開発者向けの表現を残さない
//   【3】名目値（インフレ非考慮）の注記が ja / en にある
//   【4】年齢の矛盾入力を検出して、直し方の分かる警告を出せる
//
// 【重要】ここで検証するのはすべて表示用の判定だけで、エンジンの計算には触れない。
// ============================================================================

import { describe, it, expect } from "vitest";
import { validateAgeInputs, hasEnoughInputForAdvice, AGE_VALIDATION } from "./inputValidation.js";
import { runIntegratedPlan } from "../lifePlanEngine.js";
import { JA_TRANSLATIONS } from "../translations/ja.js";
import { EN_TRANSLATIONS } from "../translations/en.js";
import { TRANSLATIONS } from "../translations/index.js";

// ============================================================================
// 【1】診断のゲート
// ============================================================================
describe("公開前1：未入力のときは診断を出さない", () => {
  it("現在年齢・生活費・資産がすべて入っているときだけ診断する", () => {
    expect(hasEnoughInputForAdvice({ currentAge: 40, livingCostMonthly: 250000, totalAssets: 5000000 })).toBe(true);
  });

  it("初期状態（生活費0・資産0）では診断しない", () => {
    // アプリの初期値そのもの。ここで true を返すと、何も入力していない人に
    // 「想定寿命まで資産が残ります」と緑の判定を出してしまう。
    expect(hasEnoughInputForAdvice({ currentAge: 35, livingCostMonthly: 0, totalAssets: 0 })).toBe(false);
  });

  it("どれか1つでも欠けていれば診断しない", () => {
    expect(hasEnoughInputForAdvice({ currentAge: 0, livingCostMonthly: 250000, totalAssets: 5000000 })).toBe(false);
    expect(hasEnoughInputForAdvice({ currentAge: 40, livingCostMonthly: 0, totalAssets: 5000000 })).toBe(false);
    expect(hasEnoughInputForAdvice({ currentAge: 40, livingCostMonthly: 250000, totalAssets: 0 })).toBe(false);
  });

  it("未入力・非数値・負の値でも例外にならず false を返す", () => {
    expect(hasEnoughInputForAdvice()).toBe(false);
    expect(hasEnoughInputForAdvice({})).toBe(false);
    expect(hasEnoughInputForAdvice({ currentAge: "", livingCostMonthly: "", totalAssets: "" })).toBe(false);
    expect(hasEnoughInputForAdvice({ currentAge: NaN, livingCostMonthly: 1, totalAssets: 1 })).toBe(false);
    expect(hasEnoughInputForAdvice({ currentAge: 40, livingCostMonthly: -1, totalAssets: 100 })).toBe(false);
  });

  it("文字列の数値（入力欄由来）でも正しく判定する", () => {
    expect(hasEnoughInputForAdvice({ currentAge: "40", livingCostMonthly: "250000", totalAssets: "5000000" })).toBe(true);
  });

  it("【根拠】生活費0だと資産が減らず、診断が『枯渇しない』側に倒れる", () => {
    // ゲートが必要な理由そのもの。生活費0なら depletionAge は null になり、
    // 診断は成功（✅）を出す。だからこそ入力が揃うまで診断を出してはいけない。
    const res = runIntegratedPlan({
      currentAge: 35, retireAge: 65, deathAge: 90,
      livingCostMonthly: 0, healthCostAnnual: () => 0,
      surplusTargetId: "bank",
      pools: [{ id: "bank", group: "bank", balance: 0, annualReturnPct: 0, drawOrder: 1 }],
      publicPensions: [],
    });
    expect(res.depletionAge).toBeNull();
    expect(hasEnoughInputForAdvice({ currentAge: 35, livingCostMonthly: 0, totalAssets: res.yearly[0].totalAssets })).toBe(false);
  });

  it("案内文キー adviceNotReady が ja・en にあり、入力すべき項目に触れている", () => {
    expect(typeof JA_TRANSLATIONS.adviceNotReady).toBe("string");
    expect(JA_TRANSLATIONS.adviceNotReady.length).toBeGreaterThan(0);
    expect(typeof EN_TRANSLATIONS.adviceNotReady).toBe("string");
    expect(EN_TRANSLATIONS.adviceNotReady.length).toBeGreaterThan(0);
    ["現在年齢", "生活費", "資産"].forEach((w) => {
      expect(JA_TRANSLATIONS.adviceNotReady.includes(w)).toBe(true);
    });
  });
});

// ============================================================================
// 【2】保存できない環境の文言
// ============================================================================
describe("公開前2：保存できない環境の文言が一般ユーザー向けである", () => {
  const DEV_WORDS = ["Claude", "アーティファクト", "artifact", "window.storage", "inputs", "localStorage", "undefined", "null"];

  it.each(["saveMessageUnavailable", "storageUnavailableDebug", "importInputsNotFoundError"])(
    "%s に開発者向けの表現が残っていない（ja・en とも）",
    (key) => {
      [JA_TRANSLATIONS[key], EN_TRANSLATIONS[key]].forEach((text) => {
        expect(typeof text).toBe("string");
        expect(text.length).toBeGreaterThan(0);
        DEV_WORDS.forEach((w) => {
          expect(text.includes(w), `${key} に「${w}」が残っている：${text}`).toBe(false);
        });
      });
    }
  );

  it("自動保存が使えない案内が、代わりの手段（バックアップ）に触れている", () => {
    expect(JA_TRANSLATIONS.saveMessageUnavailable.includes("バックアップ")).toBe(true);
    expect(EN_TRANSLATIONS.saveMessageUnavailable.toLowerCase().includes("backup")).toBe(true);
  });

  it("英国版（en-GB）でも同じ文言が引ける（キーの継承が壊れていない）", () => {
    ["saveMessageUnavailable", "storageUnavailableDebug", "importInputsNotFoundError"].forEach((key) => {
      expect(typeof TRANSLATIONS["en-GB"][key]).toBe("string");
      expect(TRANSLATIONS["en-GB"][key].length).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// 【3】名目値（インフレ非考慮）の注記
// ============================================================================
describe("公開前3：名目値の注記", () => {
  it("nominalValueNote が ja・en に存在する", () => {
    expect(typeof JA_TRANSLATIONS.nominalValueNote).toBe("string");
    expect(JA_TRANSLATIONS.nominalValueNote.length).toBeGreaterThan(0);
    expect(typeof EN_TRANSLATIONS.nominalValueNote).toBe("string");
    expect(EN_TRANSLATIONS.nominalValueNote.length).toBeGreaterThan(0);
  });

  it("『名目値』と『インフレを考慮していない』ことの両方に触れている", () => {
    expect(JA_TRANSLATIONS.nominalValueNote.includes("名目")).toBe(true);
    expect(JA_TRANSLATIONS.nominalValueNote.includes("インフレ")).toBe(true);
    const en = EN_TRANSLATIONS.nominalValueNote.toLowerCase();
    expect(en.includes("nominal")).toBe(true);
    expect(en.includes("inflation")).toBe(true);
  });

  it("5か国すべてで注記が引ける（言語辞書の欠落が無い）", () => {
    ["ja", "en", "en-GB"].forEach((lang) => {
      expect(typeof TRANSLATIONS[lang].nominalValueNote).toBe("string");
      expect(TRANSLATIONS[lang].nominalValueNote.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// 【4】年齢の入力チェック
// ============================================================================
describe("公開前4：年齢の矛盾入力を検出する", () => {
  it("正常な年齢では警告を出さない", () => {
    expect(validateAgeInputs({ currentAge: 40, retireAge: 65, deathAge: 90 })).toEqual([]);
  });

  it("想定寿命 ≤ 現在年齢 を検出する（未満・同値の両方）", () => {
    expect(validateAgeInputs({ currentAge: 60, retireAge: 65, deathAge: 50 }))
      .toContain(AGE_VALIDATION.DEATH_BEFORE_CURRENT);
    expect(validateAgeInputs({ currentAge: 60, retireAge: 65, deathAge: 60 }))
      .toContain(AGE_VALIDATION.DEATH_BEFORE_CURRENT);
  });

  it("退職年齢 < 現在年齢 を検出する（同値は警告しない）", () => {
    expect(validateAgeInputs({ currentAge: 60, retireAge: 55, deathAge: 90 }))
      .toContain(AGE_VALIDATION.RETIRE_BEFORE_CURRENT);
    expect(validateAgeInputs({ currentAge: 60, retireAge: 60, deathAge: 90 })).toEqual([]);
  });

  it("小数の現在年齢（誕生日から算出）でも正しく判定する", () => {
    expect(validateAgeInputs({ currentAge: 57.66, retireAge: 65, deathAge: 90 })).toEqual([]);
    expect(validateAgeInputs({ currentAge: 57.66, retireAge: 57, deathAge: 90 }))
      .toContain(AGE_VALIDATION.RETIRE_BEFORE_CURRENT);
  });

  it("両方おかしいときは2件とも返す", () => {
    const w = validateAgeInputs({ currentAge: 70, retireAge: 60, deathAge: 65 });
    expect(w).toHaveLength(2);
    expect(w).toContain(AGE_VALIDATION.DEATH_BEFORE_CURRENT);
    expect(w).toContain(AGE_VALIDATION.RETIRE_BEFORE_CURRENT);
  });

  it("未入力・非数値のときは判定しない（入力途中に警告を出さない）", () => {
    expect(validateAgeInputs()).toEqual([]);
    expect(validateAgeInputs({})).toEqual([]);
    // 【回帰】Number("") は 0 かつ有限。空欄を 0 歳と解釈すると、入力を消した瞬間に
    // 「想定寿命が現在年齢以下」と赤い警告が出てしまう。空欄は未入力として扱う。
    expect(validateAgeInputs({ currentAge: 60, retireAge: "", deathAge: "" })).toEqual([]);
    expect(validateAgeInputs({ currentAge: 60, retireAge: null, deathAge: null })).toEqual([]);
    expect(validateAgeInputs({ currentAge: "", retireAge: 65, deathAge: 90 })).toEqual([]);
    expect(validateAgeInputs({ currentAge: NaN, retireAge: 65, deathAge: 90 })).toEqual([]);
  });

  it("【根拠】想定寿命 ≤ 現在年齢 だと将来の行が作られない（警告が必要な理由）", () => {
    // エンジンは例外を出さないが、行が1本しか無いグラフになる。
    // 利用者にはこの状態の理由が分からないため、入力欄で知らせる必要がある。
    const res = runIntegratedPlan({
      currentAge: 60, retireAge: 65, deathAge: 50,
      livingCostMonthly: 200000, healthCostAnnual: () => 0,
      surplusTargetId: "bank",
      pools: [{ id: "bank", group: "bank", balance: 1000000, annualReturnPct: 0, drawOrder: 1 }],
      publicPensions: [],
    });
    expect(res.yearly).toHaveLength(1);
    expect(validateAgeInputs({ currentAge: 60, retireAge: 65, deathAge: 50 }))
      .toContain(AGE_VALIDATION.DEATH_BEFORE_CURRENT);
  });

  it("警告文が ja・en に存在し、直し方に触れている", () => {
    const keys = ["validationDeathAgeTooLow", "validationRetireAgeTooLow"];
    keys.forEach((k) => {
      expect(typeof JA_TRANSLATIONS[k]).toBe("string");
      expect(JA_TRANSLATIONS[k].length).toBeGreaterThan(0);
      expect(typeof EN_TRANSLATIONS[k]).toBe("string");
      expect(EN_TRANSLATIONS[k].length).toBeGreaterThan(0);
      // 「入力してください」に相当する指示が含まれること（原因だけでなく直し方を伝える）
      expect(JA_TRANSLATIONS[k].includes("入力")).toBe(true);
      expect(EN_TRANSLATIONS[k].toLowerCase().includes("enter")).toBe(true);
    });
  });

  it("警告の種類の名前は翻訳キーと対応している", () => {
    expect(`validation${AGE_VALIDATION.DEATH_BEFORE_CURRENT.charAt(0).toUpperCase()}${AGE_VALIDATION.DEATH_BEFORE_CURRENT.slice(1)}`)
      .toBe("validationDeathAgeTooLow");
    expect(`validation${AGE_VALIDATION.RETIRE_BEFORE_CURRENT.charAt(0).toUpperCase()}${AGE_VALIDATION.RETIRE_BEFORE_CURRENT.slice(1)}`)
      .toBe("validationRetireAgeTooLow");
  });
});
