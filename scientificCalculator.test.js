import { describe, expect, it } from "vitest";
import { newSci, sciPress, sciFormat, sciTokensFromExpr, normalizeSciHistory, sciClearHistory } from "./utils/scientificCalculator.js";

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
