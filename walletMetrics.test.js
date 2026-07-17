// ============================================================================
// walletMetrics.test.js — 「未来現在統合財布」の表示専用メトリクスの純粋関数テスト。
//   ここで検証するのは表示用の派生値だけで、エンジンのキャッシュフロー計算には影響しない。
// ============================================================================
import { describe, it, expect } from "vitest";
import { nearTermPlannedExpenses, freeToSpendNow, availableToSpendAtAge, normalizeExpenseAge, withWhatIfExpense, summarizeWhatIfImpact, WHATIF_EXPENSE_ID, NEAR_TERM_HORIZON_YEARS } from "./utils/walletMetrics.js";
import { runIntegratedPlan } from "./lifePlanEngine.js";

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

describe("withWhatIfExpense（非破壊の一時 What-if プラン生成）", () => {
  const basePlan = () => ({
    currentAge: 65, retireAge: 65, deathAge: 95, livingCostMonthly: 200000,
    publicPensions: [{ monthlyAmount: 200000, startAge: 65 }], healthCostAnnual: () => 0,
    surplusTargetId: "bank", initialSurplusBalance: 500000,
    pools: [{ id: "bank", group: "bank", balance: 1000000, annualReturnPct: 0, drawOrder: 1 }],
    oneTimeExpenses: [],
  });

  it("基のプランを書き換えず、クローンに一時支出を1件追加する", () => {
    const base = basePlan();
    const cloned = withWhatIfExpense(base, { amount: 300000, age: 65 });
    expect(base.oneTimeExpenses.length).toBe(0);           // 非破壊
    expect(cloned).not.toBe(base);
    expect(cloned.oneTimeExpenses.length).toBe(1);
    expect(cloned.oneTimeExpenses[0].id).toBe(WHATIF_EXPENSE_ID);
    expect(cloned.oneTimeExpenses[0].amount).toBe(300000);
  });

  it("金額0以下なら基のプランをそのまま返す（何も足さない）", () => {
    const base = basePlan();
    expect(withWhatIfExpense(base, { amount: 0, age: 65 })).toBe(base);
    expect(withWhatIfExpense(base, { amount: -100, age: 65 })).toBe(base);
  });

  it("既存の一時支出があってもそれを保ったまま追加する", () => {
    const base = { ...basePlan(), oneTimeExpenses: [{ id: "keep", age: 70, amount: 100000 }] };
    const cloned = withWhatIfExpense(base, { amount: 200000, age: 65 });
    expect(cloned.oneTimeExpenses.length).toBe(2);
    expect(cloned.oneTimeExpenses[0].id).toBe("keep");
  });
});

describe("summarizeWhatIfImpact（使用前後の比較・end-to-end）", () => {
  const near = (a, b, t = 1) => Math.abs(a - b) <= t;
  const basePlan = () => ({
    currentAge: 65, retireAge: 65, deathAge: 95, livingCostMonthly: 200000,
    publicPensions: [{ monthlyAmount: 200000, startAge: 65 }], healthCostAnnual: () => 0,
    surplusTargetId: "bank", initialSurplusBalance: 500000,
    pools: [{ id: "bank", group: "bank", balance: 1000000, annualReturnPct: 0, drawOrder: 1 }],
    oneTimeExpenses: [],
  });

  it("余剰内（30万）：余剰・銀行・総資産が使う前後で30万減る", () => {
    const base = runIntegratedPlan(basePlan());
    const wi = runIntegratedPlan(withWhatIfExpense(basePlan(), { amount: 300000, age: 65 }));
    const s = summarizeWhatIfImpact(base, wi, [65, 75, 95]);
    expect(near(s.surplus.before, 500000)).toBe(true);
    expect(near(s.surplus.after, 200000)).toBe(true);
    expect(near(s.surplus.delta, -300000)).toBe(true);
    expect(near(s.bank.delta, -300000)).toBe(true);
    expect(near(s.totalAssets.delta, -300000)).toBe(true);
    expect(near(s.actuallySpent, 300000)).toBe(true);
    expect(near(s.insufficientSurplusAmount, 0)).toBe(true);
    expect(s.byAge.length).toBe(3);
  });

  it("余剰超過（100万に対し余剰50万）：実使用は50万まで・未処理50万", () => {
    const base = runIntegratedPlan(basePlan());
    const wi = runIntegratedPlan(withWhatIfExpense(basePlan(), { amount: 1000000, age: 65 }));
    const s = summarizeWhatIfImpact(base, wi, [65, 75, 95]);
    expect(near(s.actuallySpent, 500000)).toBe(true);
    expect(near(s.insufficientSurplusAmount, 500000)).toBe(true);
    expect(near(s.totalAssets.delta, -500000)).toBe(true); // 超過分は通常預金から引かない
  });

  it("基の integrated は What-if で一切変更されない（非破壊）", () => {
    const plan = basePlan();
    const base = runIntegratedPlan(plan);
    const beforeSeq = JSON.stringify(base.yearly.map((r) => r.totalAssets));
    runIntegratedPlan(withWhatIfExpense(plan, { amount: 300000, age: 65 })); // What-if 実行
    const afterSeq = JSON.stringify(runIntegratedPlan(plan).yearly.map((r) => r.totalAssets));
    expect(afterSeq).toBe(beforeSeq); // 基の結果は同一
  });

  it("depletionAge の before/after が返る（枯渇年齢への影響）", () => {
    const base = runIntegratedPlan(basePlan());
    const wi = runIntegratedPlan(withWhatIfExpense(basePlan(), { amount: 300000, age: 65 }));
    const s = summarizeWhatIfImpact(base, wi, [65, 75, 95]);
    expect("before" in s.depletionAge && "after" in s.depletionAge).toBe(true);
  });
});
