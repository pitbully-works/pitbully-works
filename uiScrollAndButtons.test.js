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

  it("「トップ」はクイックジャンプ列の項目として存在する（独立した常駐ボタンは廃止）", () => {
    // 以前は右下に別枠の .back-to-top ボタンを置いていたが、
    // ジャンプボタンをページ順に並べ替えた際に列の中へ統合した。
    const idx = app.indexOf("const quickNavItems = useMemo");
    const block = app.slice(idx, app.indexOf("]), [t]);", idx));
    expect(block).toContain('anchor: "simulator"');
    expect(block).toContain('t("backToTopShort")');
    // 翻訳キーが解決できる
    expect(JA_TRANSLATIONS.backToTopShort).toBeTruthy();
    expect(EN_TRANSLATIONS.backToTopShort).toBeTruthy();
  });

  it("フローティング領域は no-print で、印刷時に出ない", () => {
    expect(app).toContain('className="quicknav-wrap no-print"');
  });

  it("「トップ」の着地先は入力フォーム先頭（#simulator）", () => {
    const idx = app.indexOf("const quickNavItems = useMemo");
    expect(idx).toBeGreaterThan(0);
    const block = app.slice(idx, app.indexOf("]), [t]);", idx));
    expect(block).toContain('anchor: "simulator"');
    // クイックジャンプは anchor を getElementById でそのまま解決している
    expect(app).toContain("document.getElementById(anchor)");
  });

  it("入力フォームのアンカー #simulator が存在する（着地先が実在する）", () => {
    expect(app).toContain('id="simulator"');
  });

  it("フローティング領域は Portal で body 直下に描画される（overflow/transform の影響を受けない）", () => {
    expect(app).toContain("createPortal");
    const idx = app.indexOf('className="quicknav-wrap no-print"');
    expect(idx).toBeGreaterThan(0);
    const portalStart = app.lastIndexOf("createPortal", idx);
    const portalTarget = app.indexOf("document.body", idx);
    expect(portalStart).toBeGreaterThan(0);
    expect(portalTarget).toBeGreaterThan(idx);
  });

  it("入力フォーム末尾にもインラインの「トップへ戻る」ボタンがある", () => {
    expect(app).toContain('className="back-to-top-inline no-print"');
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

describe("UI改善：クイックジャンプ（各項目ボタン）", () => {
  const app = read("./App.jsx");

  it("クイックジャンプの項目一覧に22個ある（ページ表示順：概要〜個別株）", () => {
    // 12の入力セクションに加え、概要・コラム・トップ・総財布・項目・余剰金・
    // 診断・比較・グラフ・個別株を足して22個。
    const idx = app.indexOf("const quickNavItems = useMemo");
    expect(idx).toBeGreaterThan(0);
    const block = app.slice(idx, app.indexOf("]), [t]);", idx));
    const anchors = block.match(/anchor: "/g) || [];
    expect(anchors.length).toBe(22);
  });

  it("追加したジャンプ先のアンカーがすべて実在する", () => {
    for (const id of [
      "section-overview", "section-column", "section-wallet", "section-nav",
      "section-surplus-balance", "section-advice", "section-comparison",
    ]) {
      expect(app).toContain(`id="${id}"`);
    }
  });

  it("個別株（section-stock）と総資産グラフ（section-networth-chart）の着地先が実在する", () => {
    expect(app).toContain('id="section-stock"');
    expect(app).toContain('id="section-networth-chart"');
    // quickNavItems から両方を参照している
    expect(app).toContain('anchor: "section-stock"');
    expect(app).toContain('anchor: "section-networth-chart"');
  });

  it("各項目ボタンは quicknav-btn クラスで、背景透明・アクセント色", () => {
    expect(app).toContain('className="quicknav-btn"');
    // 背景 transparent とアクセント色の指定がCSSにある
    const cssIdx = app.indexOf(".quicknav-btn {");
    expect(cssIdx).toBeGreaterThan(0);
    const css = app.slice(cssIdx, cssIdx + 400);
    expect(css).toContain("background: transparent");
    expect(css).toContain("#6FC0EC");
  });

  it("短縮ラベルの翻訳キーが ja / en で解決できる", () => {
    const keys = [
      "navShortPersonal", "navShortBasic", "navShortInvestment", "navShortRetirementAcct",
      "navShortPension", "navShortHealth", "navShortInheritance", "navShortGold",
      "navShortCash", "navShortLoan", "navShortInsurance", "navShortPrivatePension",
      "navShortStock", "navShortChart",
    ];
    for (const dict of [JA_TRANSLATIONS, EN_TRANSLATIONS]) {
      for (const k of keys) {
        expect(dict[k]).toBeTruthy();
      }
    }
  });
});
