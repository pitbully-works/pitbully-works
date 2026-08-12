// ============================================================================
// navSummaryAndKakeibo.test.js
//
// 画面の入口まわりの3点を、コード上の契約として固定するテスト。
//   ① 資産サマリー：右側ダッシュボードの先頭に見出しを置き、
//      右のクイックジャンプ「サマリ」と「入力する項目を選ぶ」から飛べる
//   ② 右のクイックジャンプの短縮名を「私年金」から「民年金」へ変更
//   ③ 家計簿：概要とコラムの間にボタンを置き、家計簿アプリの入口カードへ飛ぶ
//
// 【方針】
// App.jsx 全体のレンダリングは重く環境依存も大きいため、既存の
// uiScrollAndButtons.test.js と同じく、App.jsx のソースを読んで
// 「着地先が実在するか」「並び順が指定どおりか」を静的に検証する。
// 計算ロジックには一切触れない。
// ============================================================================

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { JA_TRANSLATIONS } from "./translations/ja.js";
import { EN_TRANSLATIONS } from "./translations/en.js";
import { EN_GB_OVERRIDES } from "./translations/enGB.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(__dirname, "App.jsx"), "utf8");

// 実際の言語解決と同じ規則：GB は en をベースに override を重ねる。
const resolved = {
  ja: JA_TRANSLATIONS,
  en: EN_TRANSLATIONS,
  gb: { ...EN_TRANSLATIONS, ...EN_GB_OVERRIDES },
};

const NEW_KEYS = ["summarySectionTitle", "navShortSummary", "navShortKakeibo", "navFullKakeibo"];

describe("追加した翻訳キー", () => {
  it.each(Object.keys(resolved))("%s：新しいキーがすべて解決でき、空でない", (lang) => {
    for (const key of NEW_KEYS) {
      expect(typeof resolved[lang][key], `${lang}.${key}`).toBe("string");
      expect(resolved[lang][key].length, `${lang}.${key}`).toBeGreaterThan(0);
    }
  });
});

// ============================================================================
// ① 資産サマリー
// ============================================================================
describe("資産サマリー：右側ダッシュボードの先頭に見出しを置く", () => {
  it("着地先 id=\"section-summary\" が実在し、見出しに翻訳キーを使っている", () => {
    expect(app).toContain('id="section-summary"');
    expect(app).toContain('{t("summarySectionTitle")}');
  });

  it("見出しは右側ダッシュボード（RIGHT: DASHBOARD）の中にあり、最初のカード群より上にある", () => {
    const dash = app.indexOf("-------- RIGHT: DASHBOARD --------");
    const heading = app.indexOf('id="section-summary"');
    const firstGrid = app.indexOf('<div className="stat-grid"', dash);
    expect(dash).toBeGreaterThan(0);
    expect(heading).toBeGreaterThan(dash);
    expect(heading).toBeLessThan(firstGrid);
  });

  it("日本語の名前は「資産サマリー」、右のボタンは「サマリ」", () => {
    expect(JA_TRANSLATIONS.summarySectionTitle).toBe("資産サマリー");
    expect(JA_TRANSLATIONS.navShortSummary).toBe("サマリ");
  });

  it("右のクイックジャンプでは、民年金（section-11）と診断の間に入る", () => {
    const i11 = app.indexOf('{ anchor: "section-11", short: t("navShortPrivatePension") }');
    const iSum = app.indexOf('{ anchor: "section-summary", short: t("navShortSummary") }');
    const iAdv = app.indexOf('{ anchor: "section-advice", short: t("navShortDiagnosis") }');
    expect(i11).toBeGreaterThan(0);
    expect(iSum).toBeGreaterThan(i11);
    expect(iAdv).toBeGreaterThan(iSum);
  });

  it("「入力する項目を選ぶ」にも同じ着地先で並んでいる", () => {
    const i11 = app.indexOf('{ index: "11", title: label("privatePension")');
    const iSum = app.indexOf('{ anchor: "section-summary", title: t("summarySectionTitle") }');
    const iAdv = app.indexOf('{ anchor: "section-advice", title: t("adviceCardTitle") }');
    expect(i11).toBeGreaterThan(0);
    expect(iSum).toBeGreaterThan(i11);
    expect(iAdv).toBeGreaterThan(iSum);
  });

  it("上部の固定ヘッダーに隠れないよう scroll-margin-top が効く", () => {
    const css = app.slice(app.indexOf("#simulator { scroll-margin-top"), app.indexOf(".section-title { scroll-margin-top"));
    expect(css).toContain("#section-summary");
    expect(css).toContain("#section-kakeibo");
  });
});

// ============================================================================
// ② 私年金 → 民年金（右のクイックジャンプの短縮名だけ）
// ============================================================================
describe("右のクイックジャンプの短縮名", () => {
  it("日本語は「民年金」になっている", () => {
    expect(JA_TRANSLATIONS.navShortPrivatePension).toBe("民年金");
  });

  it("入力セクションの見出し（label(\"privatePension\")）は従来どおりで、短縮名だけの変更", () => {
    // 短縮名は navShortPrivatePension、見出しは label("privatePension") と別経路。
    expect(app).toContain('{ index: "11", title: label("privatePension")');
    expect(app).toContain('{ anchor: "section-11", short: t("navShortPrivatePension") }');
  });
});

// ============================================================================
// ③ 家計簿
// ============================================================================
describe("家計簿：概要とコラムの間から入口カードへ飛べる", () => {
  it("着地先 id=\"section-kakeibo\" が家計簿カードに付いている", () => {
    expect(app).toContain('className="landing-kakeibo" id="section-kakeibo"');
  });

  it("右のクイックジャンプでは、概要とコラムの間に入る", () => {
    const iOv = app.indexOf('{ anchor: "section-overview", short: t("navShortOverview") }');
    const iKa = app.indexOf('{ anchor: "section-kakeibo", short: t("navShortKakeibo") }');
    const iCol = app.indexOf('{ anchor: "section-column", short: t("navShortColumn") }');
    expect(iOv).toBeGreaterThan(0);
    expect(iKa).toBeGreaterThan(iOv);
    expect(iCol).toBeGreaterThan(iKa);
  });

  it("「入力する項目を選ぶ」でも、概要とコラムの間に入る", () => {
    const iOv = app.indexOf('{ anchor: "section-overview", title: t("navFullOverview") }');
    const iKa = app.indexOf('{ anchor: "section-kakeibo", title: t("navFullKakeibo") }');
    const iCol = app.indexOf('{ anchor: "section-column", title: t("landingBlogTitle") }');
    expect(iOv).toBeGreaterThan(0);
    expect(iKa).toBeGreaterThan(iOv);
    expect(iCol).toBeGreaterThan(iKa);
  });

  it("家計簿カードとジャンプボタンは5カ国すべてで表示する", () => {
    expect(app).toContain('{ anchor: "section-kakeibo", short: t("navShortKakeibo") }');
    expect(app).toContain('{ anchor: "section-kakeibo", title: t("navFullKakeibo") }');
    expect(app).not.toContain('language === "ja" && (\n          <div className="landing-kakeibo"');
  });

  it("国切替時も家計簿URLが更新されるよう依存配列にcountryを持つ", () => {
    expect(app).toContain("]), [label, t, country, language]);");
    expect(app).toContain("]), [t, country, language]);");
  });

  it("日本語の名前はどちらも「家計簿」", () => {
    expect(JA_TRANSLATIONS.navShortKakeibo).toBe("家計簿");
    expect(JA_TRANSLATIONS.navFullKakeibo).toBe("家計簿");
  });
});
