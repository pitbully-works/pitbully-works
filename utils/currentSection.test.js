// ============================================================================
// utils/currentSection.test.js
//
// 「いまどのセクションを見ているか」を決める純粋関数のテスト。
// 右のクイックジャンプに付ける印の位置を決めるだけで、資産計算には関与しない。
// ============================================================================
import { describe, it, expect } from "vitest";
import { pickCurrentAnchor, CURRENT_SECTION_OFFSET } from "./currentSection.js";

// 画面上端からの距離(px)を並べて、テスト用のセクション一覧を作る
const at = (...tops) => tops.map((top, i) => ({ anchor: `s${i}`, top }));

describe("いま見ているセクションの判定", () => {
  it("ページ先頭では、いちばん上のセクションを指す", () => {
    // どれもまだ基準線（96px）より下にある
    expect(pickCurrentAnchor(at(300, 900, 1500))).toBe("s0");
  });

  it("基準線を通り過ぎたもののうち、いちばん下を指す", () => {
    // s0 は上へ流れ、s1 がちょうど画面上部にある
    expect(pickCurrentAnchor(at(-700, 50, 700))).toBe("s1");
    expect(pickCurrentAnchor(at(-1400, -700, 40, 800))).toBe("s2");
  });

  it("基準線にちょうど乗ったところで切り替わる", () => {
    const offset = CURRENT_SECTION_OFFSET;
    expect(pickCurrentAnchor(at(-500, offset))).toBe("s1");
    expect(pickCurrentAnchor(at(-500, offset + 1))).toBe("s0");
  });

  it("ページの一番下まで来たら、最後のセクションを指す", () => {
    // 最後の区画が短くて基準線まで届かない場合でも、印が最後まで進む
    expect(pickCurrentAnchor(at(-2000, -1200, -40), { atBottom: true })).toBe("s2");
    expect(pickCurrentAnchor(at(-2000, -1200, 500), { atBottom: true })).toBe("s2");
  });

  it("並び順が入れ替わっていても、画面上の位置で決める", () => {
    const shuffled = [
      { anchor: "c", top: 900 },
      { anchor: "a", top: -600 },
      { anchor: "b", top: 20 },
    ];
    expect(pickCurrentAnchor(shuffled)).toBe("b");
  });

  it("基準線の位置は指定できる", () => {
    expect(pickCurrentAnchor(at(-500, 200), { offset: 300 })).toBe("s1");
    expect(pickCurrentAnchor(at(-500, 200), { offset: 100 })).toBe("s0");
  });

  it("測れなかったセクションは、判定から外す（落ちない）", () => {
    const mixed = [
      { anchor: "a", top: Number.NaN },
      { anchor: "", top: 10 },
      { anchor: "b", top: 10 },
      null,
      { top: 5 },
    ];
    expect(pickCurrentAnchor(mixed)).toBe("b");
  });

  it("何も渡されなくても落ちず、null を返す", () => {
    expect(pickCurrentAnchor([])).toBe(null);
    expect(pickCurrentAnchor(null)).toBe(null);
    expect(pickCurrentAnchor(undefined)).toBe(null);
    expect(pickCurrentAnchor("なにか")).toBe(null);
    expect(pickCurrentAnchor([{ anchor: "a", top: Number.NaN }])).toBe(null);
  });

  it("セクションが1つだけなら、それを指す", () => {
    expect(pickCurrentAnchor(at(1200))).toBe("s0");
    expect(pickCurrentAnchor(at(-1200))).toBe("s0");
  });
});
