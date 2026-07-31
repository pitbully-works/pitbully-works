// ============================================================================
// allocationSection.test.jsx
// 「NISA資産の配分」まわりの改善（2026-07）を守るテスト。
//   ① 想定年率の入力で「04」のような先頭0が表示に残らない（RateInput）
//   ② 「想定配分に戻す」ボタンで、手動の想定年率がすべて自動値へ戻る
//   ③ 右のクイックジャンプに「配分」が NISA と iDeCo の間に入る（JPのみ）
//   ④ 「入力する項目を選ぶ」に「NISA資産の配分」が入る（JPのみ）
// ①はコンポーネントを実際に描画して打鍵まで確認し、②〜④はソースと翻訳辞書で
// 構造を固定する（他国では出さないゲートも含む）。
// ============================================================================
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import { RateInput } from "./ui/index.js";
import { JA_TRANSLATIONS } from "./translations/ja.js";
import { EN_TRANSLATIONS } from "./translations/en.js";

const app = fs.readFileSync(path.join(__dirname, "App.jsx"), "utf8");

afterEach(cleanup);

// ---------------------------------------------------------------------------
// ① RateInput：先頭0が残らない
// ---------------------------------------------------------------------------
describe("RateInput（想定年率の入力欄）", () => {
  it("「04」と打っても、離れると「4」に正規化される", () => {
    const onChange = vi.fn();
    const { container } = render(<RateInput value={0.4} onChange={onChange} />);
    const input = container.querySelector("input");
    fireEvent.change(input, { target: { value: "04" } });
    expect(onChange).toHaveBeenLastCalledWith(4);
    fireEvent.blur(input);
    expect(input.value).toBe("4");          // 表示から先頭の0が消える
  });

  it("フォーカスしたとき、値が0なら枠が空になる（0の後ろに打って04にならない）", () => {
    const { container } = render(<RateInput value={0} onChange={() => {}} />);
    const input = container.querySelector("input");
    fireEvent.focus(input);
    expect(input.value).toBe("");
  });

  it("小数はそのまま打てる（0.5 など）", () => {
    const onChange = vi.fn();
    const { container } = render(<RateInput value={5} onChange={onChange} />);
    const input = container.querySelector("input");
    fireEvent.change(input, { target: { value: "0.5" } });
    expect(onChange).toHaveBeenLastCalledWith(0.5);
    fireEvent.blur(input);
    expect(input.value).toBe("0.5");
  });

  it("空のまま離れたら onEmpty が呼ばれる（自動の値へ戻すため）", () => {
    const onEmpty = vi.fn();
    const onChange = vi.fn();
    const { container } = render(<RateInput value={7} onChange={onChange} onEmpty={onEmpty} />);
    const input = container.querySelector("input");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(onEmpty).toHaveBeenCalledTimes(1);
  });

  it("外から値が変わったら（自動値への復帰など）表示も同期する", () => {
    const { container, rerender } = render(<RateInput value={7} onChange={() => {}} />);
    const input = container.querySelector("input");
    rerender(<RateInput value={5} onChange={() => {}} />);
    expect(input.value).toBe("5");
  });
});

// ---------------------------------------------------------------------------
// ②〜④：App.jsx の構造をソースで固定
// ---------------------------------------------------------------------------
describe("想定年率の入力とリセット（App.jsx の配線）", () => {
  it("配分の想定年率は RateInput を使っている（素の number 入力へ戻っていない）", () => {
    const block = app.slice(app.indexOf('id="section-allocation"'), app.indexOf("overlapWarningNote"));
    expect(block).toContain("<RateInput");
    expect(block).toContain("onEmpty={() => clearExtraFundReturn(f.id)}");
    // 旧実装（打鍵のたびに Number() で潰す形）が残っていないこと
    expect(block).not.toContain("Number(e.target.value)");
  });

  it("「想定配分に戻す」ボタンがあり、全銘柄の上書きを消す", () => {
    expect(app).toContain('t("resetAssumedReturnsButton")');
    expect(app).toContain("const resetExtraFundReturns = ()");
    expect(app).toContain("extraFundReturns: {} }));");
    // 1銘柄だけ自動へ戻す方も存在する（空欄で離れたとき用）
    expect(app).toContain("const clearExtraFundReturn = (name)");
  });

  it("リセットの文言が ja / en にある", () => {
    expect(JA_TRANSLATIONS.resetAssumedReturnsButton).toBe("想定配分に戻す");
    expect(EN_TRANSLATIONS.resetAssumedReturnsButton).toBeTruthy();
  });
});

describe("配分セクションへのジャンプ", () => {
  it("配分セクションに着地先の id がある（scroll-margin も設定済み）", () => {
    expect(app).toContain('<div id="section-allocation">');
    expect(app).toMatch(/#section-allocation \{ scroll-margin-top: 12px; \}|#section-surplus-balance,[^\n]*#section-allocation \{ scroll-margin-top: 12px; \}/);
  });

  it("クイックジャンプで「配分」は NISA と iDeCo の間にある（JPのみ）", () => {
    const i02 = app.indexOf('{ anchor: "section-02", short: t("navShortInvestment") }');
    const iAl = app.indexOf('{ anchor: "section-allocation", short: t("navShortAllocation") }');
    const i03 = app.indexOf('{ anchor: "section-03", short: t("navShortRetirementAcct") }');
    expect(i02).toBeGreaterThan(-1);
    expect(iAl).toBeGreaterThan(i02);       // NISA の後
    expect(i03).toBeGreaterThan(iAl);       // iDeCo の前
    // JP以外では出さない（配分スライダーはJPのNISA画面にしか無いため）
    const line = app.slice(app.lastIndexOf("\n", iAl), app.indexOf("\n", iAl));
    expect(app.slice(iAl - 80, iAl)).toContain('country === "JP"');
    expect(line).toBeTruthy();
  });

  it("「入力する項目を選ぶ」に「NISA資産の配分」がNISAの直後にある（JPのみ）", () => {
    const i02 = app.indexOf('{ index: "02", title: label("investmentTaxAdvantaged")');
    const iAl = app.indexOf('{ anchor: "section-allocation", title: t("sectionNavAllocation")');
    const i03 = app.indexOf('{ index: "03", title: label("retirementAccount")');
    expect(i02).toBeGreaterThan(-1);
    expect(iAl).toBeGreaterThan(i02);
    expect(i03).toBeGreaterThan(iAl);
    expect(app.slice(iAl - 80, iAl)).toContain('country === "JP"');
  });

  it("ジャンプ用の翻訳キーが ja / en にある", () => {
    expect(JA_TRANSLATIONS.navShortAllocation).toBe("配分");
    expect(JA_TRANSLATIONS.sectionNavAllocation).toBe("NISA資産の配分");
    expect(EN_TRANSLATIONS.navShortAllocation).toBeTruthy();
    expect(EN_TRANSLATIONS.sectionNavAllocation).toBeTruthy();
  });

  it("項目リストは country に依存するようになった（useMemo の依存に country がある）", () => {
    expect(app).toContain("]), [t, country]);");
    expect(app).toContain("]), [label, t, country]);");
  });
});
