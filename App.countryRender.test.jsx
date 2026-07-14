// ============================================================================
// App.countryRender.test.jsx
//
// 【このテストが存在する理由】
// GB（イギリス）を選んだ瞬間に画面が真っ白になる不具合があった。原因は
// GBRetirementPanel が CURRENCY_BY_CODE を import し忘れていたこと。
// 描画時にしか起きない ReferenceError だったため、当時の 143 件のテスト
// （計算式の単体テスト中心）はすべて緑のまま素通りしてしまった。
//
// そこで、5か国それぞれで App を実際に描画し、
//   ・例外を投げないこと
//   ・画面が空にならないこと（真っ白でないこと）
//   ・国選択欄・入力セクション・総資産グラフ周辺が存在すること
//   ・console.error（Reactが描画エラー時に出す）が起きないこと
// を機械的に確認する。
//
// App.jsx にはテスト用の分岐を一切足していない。実際の利用者と同じ経路で
// <select> を操作して国を切り替え、そのつど描画結果を検証する。
// ============================================================================

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, act, fireEvent } from "@testing-library/react";
import React from "react";
import NisaLifePlan from "./App.jsx";

// ---------------------------------------------------------------------------
// jsdom に無いブラウザAPIを、このテストファイル内だけで補う
// （App.jsx / recharts が参照するが、jsdom は実装を持たないもの）
// ---------------------------------------------------------------------------
beforeAll(() => {
  // recharts の ResponsiveContainer が使う。無いと描画時に落ちる。
  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }

  if (!window.matchMedia) {
    window.matchMedia = (query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {
        return false;
      },
    });
  }

  // 印刷ボタン（押さないが、念のため実装が無いことによる例外を防ぐ）
  if (!window.print) window.print = () => {};

  // ResponsiveContainer は幅・高さ 0 だと中身を描かない。
  // グラフの中身そのものはこのテストの対象ではないが、
  // 実寸を与えておくほうが本番に近い描画になる。
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    value: 1024,
  });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    value: 768,
  });
});

// ---------------------------------------------------------------------------
// console.error と未処理例外の監視
//
// React は描画中に例外が起きると console.error で
// 「The above error occurred in the <X> component」を出す。
// GB の真っ白事件は、まさにこれが出ていた状態だった。
//
// ただし、アプリの不具合とは無関係なライブラリ由来の警告まで拾うと
// テストが常に赤くなって役に立たなくなるため、それだけは除外する。
// ---------------------------------------------------------------------------
const IGNORED_CONSOLE_ERRORS = [
  // recharts 2.x が React 18.3 で出す非推奨警告。アプリの不具合ではない。
  /Support for defaultProps will be removed/,
];

let consoleErrors = [];
let consoleErrorSpy;
let unhandledErrors = [];

const onUnhandled = (e) => {
  unhandledErrors.push(String((e && (e.reason || e.error || e.message)) || e));
};

beforeEach(() => {
  consoleErrors = [];
  unhandledErrors = [];

  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation((...args) => {
    const message = args
      .map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : String(a)))
      .join(" ");
    if (!IGNORED_CONSOLE_ERRORS.some((re) => re.test(message))) {
      consoleErrors.push(message);
    }
  });

  window.addEventListener("error", onUnhandled);
  window.addEventListener("unhandledrejection", onUnhandled);
});

afterEach(() => {
  cleanup();
  consoleErrorSpy.mockRestore();
  window.removeEventListener("error", onUnhandled);
  window.removeEventListener("unhandledrejection", onUnhandled);
});

// ---------------------------------------------------------------------------
// 共通の検証
// ---------------------------------------------------------------------------
const COUNTRIES = [
  { code: "JP", label: "日本" },
  { code: "US", label: "アメリカ" },
  { code: "GB", label: "イギリス" },
  { code: "CA", label: "カナダ" },
  { code: "AU", label: "オーストラリア" },
];

// App を描画し、非同期の副作用（保存データの読み込み等）が落ち着くまで待つ
async function renderApp() {
  let result;
  await act(async () => {
    result = render(<NisaLifePlan />);
  });
  return result;
}

async function selectCountry(container, code) {
  const select = container.querySelector(".country-select");
  expect(select, "国選択欄（.country-select）が見つからない").toBeTruthy();
  await act(async () => {
    fireEvent.change(select, { target: { value: code } });
  });
  return select;
}

// その国で「画面が成立しているか」を確認する
function expectScreenIsAlive(container, code) {
  // ① 真っ白でないこと。React がクラッシュすると container は空になる。
  const text = container.textContent || "";
  expect(
    text.trim().length > 200,
    `${code}: 画面が空（真っ白）になっている。文字数=${text.trim().length}`
  ).toBe(true);

  // ② 国選択欄が残っていること
  const select = container.querySelector(".country-select");
  expect(select, `${code}: 国選択欄が消えている`).toBeTruthy();
  expect(select.value, `${code}: 国選択欄の値が切り替わっていない`).toBe(code);

  // ③ 入力項目の一覧（左側の入力パネルとセクション）が存在すること
  expect(
    container.querySelector(".panel"),
    `${code}: 入力パネル（.panel）が無い`
  ).toBeTruthy();
  const sections = container.querySelectorAll(".section-block");
  expect(
    sections.length > 0,
    `${code}: 入力セクション（.section-block）が1つも無い`
  ).toBe(true);

  // ④ 総資産グラフ周辺が存在すること
  expect(
    container.querySelector(".chart-frame"),
    `${code}: 総資産グラフの枠（.chart-frame）が無い`
  ).toBeTruthy();

  // ⑤ 描画中に例外が起きていないこと
  expect(
    consoleErrors,
    `${code}: 描画中に console.error が発生した:\n${consoleErrors.join("\n")}`
  ).toEqual([]);
  expect(
    unhandledErrors,
    `${code}: 未処理の例外が発生した:\n${unhandledErrors.join("\n")}`
  ).toEqual([]);
}

// ---------------------------------------------------------------------------
// 本体
// ---------------------------------------------------------------------------
describe("5か国レンダリング：初期表示（日本）", () => {
  it("JP：例外なく描画され、画面が空にならない", async () => {
    const { container } = await renderApp();
    expectScreenIsAlive(container, "JP");
  });
});

describe("5か国レンダリング：国を切り替えても描画できる", () => {
  for (const { code, label } of COUNTRIES) {
    it(`${code}（${label}）：切り替え後も例外なく描画され、画面が空にならない`, async () => {
      const { container } = await renderApp();

      // 初期状態（JP）から目的の国へ切り替える。JP の場合も同じ経路を通す。
      await selectCountry(container, code);

      expectScreenIsAlive(container, code);
    });
  }
});

describe("5か国レンダリング：国を続けて切り替えても壊れない", () => {
  // 実際の利用者は何度も国を切り替える。
  // 一度でも描画に失敗すると、そこで画面が真っ白のまま戻らなくなる。
  it("JP → US → GB → CA → AU → JP と巡回しても、毎回画面が生きている", async () => {
    const { container } = await renderApp();

    for (const code of ["US", "GB", "CA", "AU", "JP"]) {
      await selectCountry(container, code);
      expectScreenIsAlive(container, code);
    }
  });
});

describe("5か国レンダリング：GBの再発防止（CURRENCY_BY_CODE の import 漏れ）", () => {
  // 真っ白事件の直接の原因になった箇所。GB の退職後パネルは
  // CURRENCY_BY_CODE から通貨記号を引いて「£241.30 / 週」を組み立てる。
  it("GB を選ぶと、State Pension の週額が £ 付きで表示される", async () => {
    const { container } = await renderApp();
    await selectCountry(container, "GB");

    expectScreenIsAlive(container, "GB");

    const text = container.textContent || "";
    expect(
      text.includes("£"),
      "GB: ポンド記号（£）が画面に出ていない。CURRENCY_BY_CODE が引けていない可能性がある"
    ).toBe(true);
  });
});
