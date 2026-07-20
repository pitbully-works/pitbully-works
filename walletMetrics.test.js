// ============================================================================
// walletMetrics.test.js — 「未来現在統合財布」の表示専用メトリクスの純粋関数テスト。
//   ここで検証するのは表示用の派生値だけで、エンジンのキャッシュフロー計算には影響しない。
// ============================================================================
import { describe, it, expect } from "vitest";
import { freeToSpendNow, availableToSpendAtAge, normalizeExpenseAge } from "./utils/walletMetrics.js";
import { runIntegratedPlan } from "./lifePlanEngine.js";

const assert = {
  ok: (cond, msg) => expect(cond, msg).toBeTruthy(),
  equal: (a, b, msg) => expect(a, msg).toBe(b),
};


describe("freeToSpendNow（現在自由に使える金額）", () => {
  it("= max(0, 使える資産 − 生活防衛資金)", () => {
    assert.equal(
      freeToSpendNow({ accessibleAssets: 4300000, emergencyFund: 1000000 }),
      3300000
    );
  });

  it("0円未満にはしない", () => {
    assert.equal(freeToSpendNow({ accessibleAssets: 100000, emergencyFund: 500000 }), 0);
  });

  it("省略時は生活防衛資金を0として扱う", () => {
    assert.equal(freeToSpendNow({ accessibleAssets: 500000 }), 500000);
  });

  it("生活防衛資金を差し引く", () => {
    assert.equal(
      freeToSpendNow({ accessibleAssets: 1000000, emergencyFund: 300000 }),
      700000
    );
  });
});

describe("availableToSpendAtAge（年齢別使用可能額・静的版）", () => {
  it("= max(0, spendableAssets − minimumResidual)", () => {
    expect(availableToSpendAtAge({ spendableAssets: 30000000, minimumResidual: 10000000 })).toBe(20000000);
  });

  it("最低残したい資産が使える資産を上回っても 0円未満にはしない（ガードレール）", () => {
    expect(availableToSpendAtAge({ spendableAssets: 5000000, minimumResidual: 10000000 })).toBe(0);
  });

  it("minimumResidual 省略時は 0 として扱う", () => {
    expect(availableToSpendAtAge({ spendableAssets: 8000000 })).toBe(8000000);
  });

  it("不正・欠損値は 0 として安全に扱う", () => {
    expect(availableToSpendAtAge({ spendableAssets: undefined, minimumResidual: NaN })).toBe(0);
  });
});

describe("normalizeExpenseAge（小数現在年齢での支出年齢の正規化）", () => {
  it("画面表示上の現在年齢（floor）で入力された支出は現在時点(小数)に正規化する", () => {
    expect(normalizeExpenseAge(58, 58.66)).toBe(58.66);
  });
  it("現在より過去の年齢はそのまま（＝エンジンで過去として除外される）", () => {
    expect(normalizeExpenseAge(57, 58.66)).toBe(57);
  });
  it("未来の年齢はそのまま", () => {
    expect(normalizeExpenseAge(59, 58.66)).toBe(59);
  });
  it("現在年齢が整数なら値は変わらない", () => {
    expect(normalizeExpenseAge(58, 58)).toBe(58);
  });
  it("不正値は数値化して返す（安全）", () => {
    expect(Number.isNaN(normalizeExpenseAge("x", 58.66))).toBe(true);
  });
});



