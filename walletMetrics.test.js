// ============================================================================
// walletMetrics.test.js — 「未来現在統合財布」の表示専用メトリクスの純粋関数テスト。
//   ここで検証するのは表示用の派生値だけで、エンジンのキャッシュフロー計算には影響しない。
// ============================================================================
import { describe, it, expect } from "vitest";
import { nearTermPlannedExpenses, freeToSpendNow, availableToSpendAtAge, normalizeExpenseAge, NEAR_TERM_HORIZON_YEARS } from "./utils/walletMetrics.js";

const assert = {
  ok: (cond, msg) => expect(cond, msg).toBeTruthy(),
  equal: (a, b, msg) => expect(a, msg).toBe(b),
};

describe("nearTermPlannedExpenses（近い将来の予定支出）", () => {
  const led = (over) => ({ id: "x", kind: "consume", age: 66, amount: 100000, category: "car", ...over });

  it("既定の期間は3年", () => {
    assert.equal(NEAR_TERM_HORIZON_YEARS, 3);
  });

  it("現在〜現在+3年 の consume だけを合計する", () => {
    const ledger = [
      led({ age: 65, amount: 100000 }), // 現在ちょうど → 含む
      led({ age: 66, amount: 200000 }), // 1年後 → 含む
      led({ age: 68, amount: 300000 }), // 3年後（境界）→ 含む
      led({ age: 69, amount: 999999 }), // 4年後 → 除外
    ];
    assert.equal(nearTermPlannedExpenses(ledger, 65, 3), 600000);
  });

  it("transfer（付け替え）は予定支出に数えない", () => {
    const ledger = [
      led({ age: 66, kind: "consume", amount: 100000 }),
      led({ age: 66, kind: "transfer", amount: 500000 }),
    ];
    assert.equal(nearTermPlannedExpenses(ledger, 65, 3), 100000);
  });

  it("現在より過去・金額0・不正な年齢は無視する", () => {
    const ledger = [
      led({ age: 60, amount: 100000 }), // 過去 → 除外
      led({ age: 66, amount: 0 }),      // 0円 → 除外
      led({ age: NaN, amount: 100000 }),// 不正 → 除外
      led({ age: 66, amount: 250000 }), // 有効
    ];
    assert.equal(nearTermPlannedExpenses(ledger, 65, 3), 250000);
  });

  it("空・未定義でも 0 を返す", () => {
    assert.equal(nearTermPlannedExpenses(undefined, 65, 3), 0);
    assert.equal(nearTermPlannedExpenses([], 65, 3), 0);
  });

  it("期間を5年にすると4年後の支出も含む", () => {
    const ledger = [led({ age: 69, amount: 400000 })];
    assert.equal(nearTermPlannedExpenses(ledger, 65, 5), 400000);
    assert.equal(nearTermPlannedExpenses(ledger, 65, 3), 0);
  });
});

describe("freeToSpendNow（現在自由に使える金額）", () => {
  it("= max(0, 使える資産 − 生活防衛資金 − 近い将来の予定支出)", () => {
    assert.equal(
      freeToSpendNow({ accessibleAssets: 4300000, emergencyFund: 1000000, nearTermPlanned: 300000 }),
      3000000
    );
  });

  it("0円未満にはしない", () => {
    assert.equal(freeToSpendNow({ accessibleAssets: 100000, emergencyFund: 500000, nearTermPlanned: 0 }), 0);
  });

  it("省略時は生活防衛資金・予定支出を0として扱う", () => {
    assert.equal(freeToSpendNow({ accessibleAssets: 500000 }), 500000);
  });

  it("生活防衛資金と予定支出の両方を差し引く", () => {
    assert.equal(
      freeToSpendNow({ accessibleAssets: 1000000, emergencyFund: 300000, nearTermPlanned: 200000 }),
      500000
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

describe("nearTermPlannedExpenses × 小数現在年齢", () => {
  it("現在58.66歳のとき、58歳の予定支出は含み、57歳は除外する", () => {
    const ledger = [
      { id: "a", kind: "consume", age: 58, amount: 100000 }, // 現在（floor）→ 含む
      { id: "b", kind: "consume", age: 57, amount: 200000 }, // 過去 → 除外
      { id: "c", kind: "consume", age: 61, amount: 300000 }, // 3年内 → 含む
      { id: "d", kind: "consume", age: 62, amount: 400000 }, // 3年超(58.66+3=61.66)→ 除外
    ];
    expect(nearTermPlannedExpenses(ledger, 58.66, 3)).toBe(400000); // 100000 + 300000
  });
});
