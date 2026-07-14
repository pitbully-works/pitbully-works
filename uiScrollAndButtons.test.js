// ============================================================================
// uiScrollAndButtons.test.js
//
// UI改善（スクロール着地点の変更・トップへ戻るボタン・比較終了ボタンの文言）の
// 表示テスト。計算ロジックには一切触れない。
//
// 【方針】
// App.jsx 全体のレンダリングは重く環境依存も大きいため、ここでは
//  ① 追加した翻訳キーが 5か国すべてで解決できること（enGB は en 継承を含む）
//  ② 比較カードが新しいキー（scenarioCompareEndFull）を参照していること
//  ③ 「保存されません」の説明（scenarioCompareNote）が残っていること
// を検証する。実際のスクロール挙動（scrollIntoView）は jsdom では意味を持たないため、
// 着地先アンカーが #simulator であることはコード上の契約としてここで固定する。
// ============================================================================

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { JA_TRANSLATIONS } from "./translations/ja.js";
import { EN_TRANSLATIONS } from "./translations/en.js";
import { EN_GB_OVERRIDES } from "./translations/enGB.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(__dirname, rel), "utf8");

// 実際の言語解決と同じ規則：GB は en をベースに override を重ねる。
const resolved = {
  ja: JA_TRANSLATIONS,
  en: EN_TRANSLATIONS,
  us: EN_TRANSLATIONS,
  gb: { ...EN_TRANSLATIONS, ...EN_GB_OVERRIDES }, // カナダ・豪州も en を共用
  ca: EN_TRANSLATIONS,
  au: EN_TRANSLATIONS,
};

const NEW_KEYS = ["backToTopLabel", "scenarioCompareEndFull"];

describe("UI改善：追加した翻訳キー", () => {
  it.each(Object.keys(resolved))("%s：新しいキーがすべて解決でき、空でない", (lang) => {
    const dict = resolved[lang];
    for (const key of NEW_KEYS) {
      expect(dict[key], `${lang} に ${key} が無い`).toBeTruthy();
      expect(typeof dict[key]).toBe("string");
      expect(dict[key].length).toBeGreaterThan(0);
    }
  });

  it("日本語の文言が仕様どおり", () => {
    expect(JA_TRANSLATIONS.scenarioCompareEndFull).toBe("比較を終了して元に戻る");
    expect(JA_TRANSLATIONS.backToTopLabel).toBe("トップへ戻る");
  });

  it("既存の scenarioCompareEnd / scenarioCompareNote は残っている（削除していない）", () => {
    for (const dict of [JA_TRANSLATIONS, EN_TRANSLATIONS]) {
      expect(dict.scenarioCompareEnd).toBeTruthy();  // 旧キーは消さない
      expect(dict.scenarioCompareNote).toBeTruthy(); // 「保存されません」の説明
    }
  });
});

describe("UI改善：比較カードのマークアップ", () => {
  const comparison = read("./ui/comparison.jsx");

  it("比較終了ボタンは新しい文言キー scenarioCompareEndFull を使う", () => {
    expect(comparison).toContain('t("scenarioCompareEndFull")');
  });

  it("比較終了ボタンは横幅いっぱい（width:100%）で、押しやすい余白を持つ", () => {
    // ボタンのすぐ上に width: "100%" の指定があること
    const idx = comparison.indexOf('t("scenarioCompareEndFull")');
    expect(idx).toBeGreaterThan(0);
    const around = comparison.slice(idx - 400, idx);
    expect(around).toContain('width: "100%"');
  });

  it("「保存されません」の説明（scenarioCompareNote）はボタンの下に残っている", () => {
    const btn = comparison.indexOf('t("scenarioCompareEndFull")');
    const note = comparison.indexOf('t("scenarioCompareNote")');
    expect(note).toBeGreaterThan(btn); // ボタンより後ろ＝下に配置
  });
});

describe("UI改善：トップへ戻るボタンとスクロール着地点", () => {
  const app = read("./App.jsx");

  it("常駐ボタンが存在し、backToTopLabel を表示する", () => {
    expect(app).toContain('className="back-to-top no-print"');
    expect(app).toContain('t("backToTopLabel")');
  });

  it("着地先はアプリ紹介ではなく入力フォーム先頭（#simulator）", () => {
    // back-to-top ボタンの onClick が simulator を対象にしていること
    const idx = app.indexOf('className="back-to-top no-print"');
    expect(idx).toBeGreaterThan(0);
    const block = app.slice(idx, idx + 500);
    expect(block).toContain('getElementById("simulator")');
    // landing（紹介）へ戻していないこと
    expect(block).not.toContain('getElementById("landing")');
  });

  it("入力フォームのアンカー #simulator が存在する（着地先が実在する）", () => {
    expect(app).toContain('id="simulator"');
  });

  it("トップへ戻るボタンは Portal で body 直下に描画される（overflow/transform の影響を受けない）", () => {
    // .app や祖先に overflow-x:hidden / transform があると、内側の position:fixed は
    // 画面ではなく祖先の枠を基準にして流れてしまう。createPortal で document.body に
    // 出すことで、いかなる祖先の影響も受けず確実に画面へ固定する。
    expect(app).toContain("createPortal");
    const idx = app.indexOf('className="back-to-top no-print"');
    expect(idx).toBeGreaterThan(0);
    // 常駐ボタンが createPortal(..., document.body) の内側にあること
    const portalStart = app.lastIndexOf("createPortal", idx);
    const portalTarget = app.indexOf("document.body", idx);
    expect(portalStart).toBeGreaterThan(0);
    expect(portalTarget).toBeGreaterThan(idx);
  });

  it("入力フォーム末尾にもインラインの「トップへ戻る」ボタンがある", () => {
    expect(app).toContain('className="back-to-top-inline no-print"');
    // インラインボタンも着地先は #simulator
    const idx = app.indexOf('className="back-to-top-inline no-print"');
    const block = app.slice(idx, idx + 400);
    expect(block).toContain('getElementById("simulator")');
  });

  it("インラインボタンは民間年金（privatePension）セクションの後にある", () => {
    const pension = app.lastIndexOf("privatePensionNote");
    const inline = app.indexOf('className="back-to-top-inline no-print"');
    expect(inline).toBeGreaterThan(pension);
  });

  it("アプリ紹介（landing）は削除されず残っている", () => {
    expect(app).toContain('className="landing"');
  });
});
