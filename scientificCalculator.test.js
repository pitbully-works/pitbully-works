import { describe, expect, it } from "vitest";
import { newSci, sciPress, sciFormat, sciTokensFromExpr, normalizeSciHistory, sciClearHistory, sciEvaluate } from "./utils/scientificCalculator.js";

function press(keys) {
  return keys.reduce((state, key) => sciPress(state, key), newSci());
}

describe("家計簿仕様の関数電卓", () => {
  it("四則演算・関数・定数・べき乗を計算する", () => {
    expect(sciFormat(press(["1","2","0","/","3","="]).result)).toBe("40");
    expect(sciFormat(press(["sin","3","0",")","="]).result)).toBe("0.5");
    expect(sciFormat(press(["√","9",")","="]).result)).toBe("3");
    expect(sciFormat(press(["2","^","3","="]).result)).toBe("8");
    expect(sciFormat(press(["log","1","0","0",")","="]).result)).toBe("2");
    expect(sciFormat(press(["ln","e",")","="]).result)).toBe("1");
  });

  it("Deg/Rad、Ans、0除算を家計簿と同じ考え方で扱う", () => {
    let s = press(["9","0"]);
    s = sciPress(s, "sin");
    s = sciPress(s, "3");
    s = sciPress(s, "0");
    s = sciPress(s, ")");
    s = sciPress(s, "=");
    expect(Number.isFinite(s.result)).toBe(true);

    const bad = press(["1","/","0","="]);
    expect(bad.result).toBeNull();
    expect(bad.error).toBe("0では割れません");
  });

  it("履歴は最大30件・再利用可能・全削除可能", () => {
    let s = newSci();
    for (let i = 0; i < 35; i += 1) {
      s = { ...s, tokens: String(i + 1).split(""), result: null };
      s = sciPress(s, "=");
    }
    expect(s.history).toHaveLength(30);
    expect(normalizeSciHistory(s.history)).toHaveLength(30);

    const trig = press(["sin","3","0",")","="]);
    let replay = newSci();
    replay.tokens = sciTokensFromExpr(trig.history[0].expr);
    replay = sciPress(replay, "=");
    expect(sciFormat(replay.result)).toBe("0.5");
    expect(sciClearHistory(s).history).toEqual([]);
  });
});

describe("batch hardening 17: bounded calculator state", () => {
  it("rejects direct evaluation of oversized token arrays", () => {
    const r = sciEvaluate(Array.from({ length: 121 }, () => "1"));
    expect(r.ok).toBe(false);
    expect(r.error).toBe("式が長すぎます");
  });

  it("bounds corrupted persisted tokens before copying calculator state", () => {
    const huge = Array.from({ length: 10000 }, () => "1");
    const s = sciPress({ ...newSci(), tokens: huge }, "DEL");
    expect(s.tokens.length).toBeLessThanOrEqual(120);
  });

  it("bounds raw history work before normalizing entries", () => {
    const raw = Array.from({ length: 5000 }, (_, i) => ({ expr: String(i + 1), value: i + 1 }));
    const history = normalizeSciHistory(raw);
    expect(history).toHaveLength(30);
    expect(history[0]).toEqual({ expr: "1", value: 1 });
    expect(history.at(-1)).toEqual({ expr: "30", value: 30 });
  });

  it("bounds expression replay tokens from oversized strings", () => {
    const tokens = sciTokensFromExpr("1".repeat(10000));
    expect(tokens).toHaveLength(120);
  });

  it("does not preserve invalid scalar state from a corrupted calculator object", () => {
    const s = sciPress({ tokens: [], history: [], ans: Infinity, result: NaN, deg: "yes" }, "1");
    expect(s.ans).toBe(0);
    expect(s.result).toBeNull();
    expect(s.deg).toBe(true);
  });
});
