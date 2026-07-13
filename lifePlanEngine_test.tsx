import { describe, it, expect } from "vitest";
import { runIntegratedPlan, NOT_DRAWABLE } from "./lifePlanEngine.js";

// node:assert 互換の薄いラッパー（vitest の expect に委譲）
const assert = {
  ok: (cond, msg) => expect(cond, msg).toBeTruthy(),
  equal: (a, b, msg) => expect(a, msg).toBe(b),
};
const test = (name, fn) => it(name, fn);

describe("統合キャッシュフローエンジン", () => {
const base = {
  currentAge: 58,
  retireAge: 65,
  deathAge: 95,
  livingCostMonthly: 250000,
  publicPensionMonthly: 150000,
  healthCostAnnual: () => 0,
  surplusTargetId: "bank",
};

// 共通の検証：どの結果にもNaN・負数・帯の不整合があってはならない
function assertInvariants(res, label) {
  res.yearly.forEach((r) => {
    Object.entries(r).forEach(([k, v]) => {
      assert.ok(Number.isFinite(v), `${label}: ${k} が NaN/Infinity (age ${r.age})`);
    });
    ["investmentValue", "goldValue", "bankValue", "stockValue", "pensionValue",
     "idecoLockedValue", "totalAssets", "loanBalance"].forEach((k) => {
      assert.ok(r[k] >= 0, `${label}: ${k} が負数 (age ${r.age}, ${r[k]})`);
    });
    // E: 帯の最上部（総資産） − 借入残高 ＝ 純資産線
    const bandTop = r.investmentValue + r.goldValue + r.bankValue + r.stockValue
                  + r.pensionValue + r.idecoLockedValue;
    assert.ok(Math.abs(bandTop - r.totalAssets) < 1e-6, `${label}: 帯の合計 ≠ 総資産 (age ${r.age})`);
    assert.ok(Math.abs((bandTop - r.loanBalance) - r.netWorth) < 1e-6,
      `${label}: 帯上端 − 借入 ≠ 純資産 (age ${r.age})`);
  });
}


// A. NISAが0円になった後、銀行預金から生活費が引かれる
test("A: 主要投資口座が枯渇したら次の資産（銀行預金）から取り崩される", () => {
  const res = runIntegratedPlan({
    ...base,
    pools: [
      { id: "nisa", group: "investment", balance: 1000000, annualReturnPct: 0, drawOrder: 1 },
      { id: "bank", group: "bank", balance: 20000000, annualReturnPct: 0, drawOrder: 2 },
    ],
  });
  const at70 = res.yearly.find((r) => r.age === 70);
  assert.equal(at70.investmentValue, 0, "NISAは尽きているはず");
  assert.ok(at70.bankValue < 20000000, "銀行預金が減っているはず");
  assertInvariants(res, "A");
});

// B. 全使用可能資産がなくなれば純資産が0円になる
test("B: 全資産が尽きたら純資産0で止まり、その後増えない", () => {
  const res = runIntegratedPlan({
    ...base,
    pools: [
      { id: "nisa", group: "investment", balance: 3000000, annualReturnPct: 0, drawOrder: 1 },
      { id: "bank", group: "bank", balance: 1000000, annualReturnPct: 0, drawOrder: 2 },
    ],
  });
  const last = res.yearly[res.yearly.length - 1];
  assert.equal(last.totalAssets, 0);
  assert.equal(last.netWorth, 0);
  assert.ok(res.depletionAge !== null, "枯渇年齢が記録されるはず");
  // 枯渇後に資産が再び増えないこと
  const after = res.yearly.filter((r) => r.age >= Math.ceil(res.depletionAge) + 1);
  after.forEach((r) => assert.equal(r.totalAssets, 0, `age ${r.age} で資産が復活している`));
  assertInvariants(res, "B");
});

// C. ローン元本返済では純資産が不自然に増えず、利息分だけ減る
test("C: ローン返済で純資産は増えない（利息分だけ減る）", () => {
  const common = {
    ...base,
    currentAge: 65, retireAge: 65, deathAge: 66,
    livingCostMonthly: 0, publicPensionMonthly: 0,
    pools: [{ id: "bank", group: "bank", balance: 10000000, annualReturnPct: 0, drawOrder: 1 }],
  };
  const noLoan = runIntegratedPlan({ ...common, loans: [] });
  const withLoan = runIntegratedPlan({
    ...common,
    loans: [{ principal: 3000000, annualRatePct: 12, monthlyPayment: 100000 }],
  });
  const a = noLoan.yearly[noLoan.yearly.length - 1];
  const b = withLoan.yearly[withLoan.yearly.length - 1];
  // 1年間の純資産の変化を比較：差は「支払った利息」とほぼ一致するはず
  const noLoanDelta = a.netWorth - noLoan.yearly[0].netWorth;   // 0
  const withLoanDelta = b.netWorth - withLoan.yearly[0].netWorth;
  const diff = noLoanDelta - withLoanDelta;
  assert.ok(Math.abs(diff - withLoan.cumulativeLoanInterest) < 1,
    `純資産の目減りが利息と一致しない: 差=${diff}, 利息=${withLoan.cumulativeLoanInterest}`);
  assert.ok(withLoanDelta < 0, "ローンがある方が純資産は減るはず（増えてはいけない）");
  assertInvariants(withLoan, "C");
});

// D. 民間年金残高が0円になった後は年金収入が発生しない
test("D: 民間年金は残高が尽きたら収入が止まる", () => {
  const pools = [
    { id: "bank", group: "bank", balance: 0, annualReturnPct: 0, drawOrder: 1 },
    { id: "pp", group: "privatePension", balance: 1200000, annualReturnPct: 0, accessAge: NOT_DRAWABLE },
  ];
  const res = runIntegratedPlan({
    ...base,
    currentAge: 65, retireAge: 65, deathAge: 75,
    livingCostMonthly: 100000, publicPensionMonthly: 0,
    pools,
    privatePensionPlans: [
      { poolId: "pp", monthlyPayout: 100000, payoutFromAge: 65, payoutToAge: 75 },
    ],
  });
  // 残高120万 ÷ 月10万 = 12ヶ月で枯渇 → 66歳で年金は尽きる
  const at67 = res.yearly.find((r) => r.age === 67);
  assert.equal(at67.pensionValue, 0, "年金原資は尽きているはず");
  // 収入が止まるので、生活費が払えず不足が発生している
  assert.ok(res.cumulativeUnmet > 0, "年金が尽きた後は不足が発生するはず");
  assert.ok(res.depletionAge !== null && res.depletionAge >= 66,
    `枯渇は66歳以降のはず (${res.depletionAge})`);
  assertInvariants(res, "D");
});

// F. 58歳から95歳まで、各年齢でNaNや負数が発生しない
test("F: 58〜95歳の全年齢でNaN・負数が発生しない（フル構成）", () => {
  const res = runIntegratedPlan({
    ...base,
    healthCostAnnual: (age) => (age >= 75 ? 300000 : 120000),
    pools: [
      { id: "nisa", group: "investment", balance: 8000000, annualReturnPct: 5, retireReturnPct: 3, monthlyContribution: 100000, contribEndAge: 65, drawOrder: 1 },
      { id: "bank", group: "bank", balance: 5000000, annualReturnPct: 0.1, monthlyContribution: 30000, drawOrder: 2 },
      { id: "stock", group: "stock", balance: 4000000, annualReturnPct: 6, drawOrder: 3 },
      { id: "gold", group: "gold", balance: 3000000, annualReturnPct: 4, drawOrder: 4 },
      { id: "pp", group: "privatePension", balance: 2000000, annualReturnPct: 0, accessAge: NOT_DRAWABLE },
      { id: "ideco", group: "ideco", balance: 6000000, annualReturnPct: 3, accessAge: NOT_DRAWABLE },
    ],
    loans: [{ principal: 12000000, annualRatePct: 1.2, monthlyPayment: 70000 }],
    insurancePolicies: [{ monthlyPremium: 20000, premiumFromAge: 58, premiumToAge: 80 }],
    privatePensionPlans: [{ poolId: "pp", monthlyPayout: 50000, payoutFromAge: 65, payoutToAge: 85 }],
    idecoPoolId: "ideco",
    idecoDrawdown: (age) => (age >= 70 && age < 80 ? 50000 : 0),
    investLumpSums: [{ age: 60, amount: 2000000 }],
    investLumpTargetId: "nisa",
  });
  assert.equal(res.yearly[0].age, 58);
  assert.equal(res.yearly[res.yearly.length - 1].age, 95);
  assertInvariants(res, "F");
});

test("iDeCo受取前残高は生活費の取り崩し対象にならない", () => {
  const res = runIntegratedPlan({
    ...base,
    currentAge: 65, retireAge: 65, deathAge: 70,
    livingCostMonthly: 200000, publicPensionMonthly: 0,
    pools: [
      { id: "bank", group: "bank", balance: 1200000, annualReturnPct: 0, drawOrder: 1 },
      { id: "ideco", group: "ideco", balance: 9000000, annualReturnPct: 0, accessAge: NOT_DRAWABLE },
    ],
  });
  const last = res.yearly[res.yearly.length - 1];
  assert.equal(last.bankValue, 0, "銀行預金は尽きるはず");
  assert.equal(last.idecoLockedValue, 9000000, "iDeCoは1円も取り崩されてはいけない");
  assert.ok(res.cumulativeUnmet > 0);
  assertInvariants(res, "iDeCo");
});

test("保険料は資産から引かれ、純資産から二重控除されない", () => {
  const common = {
    ...base,
    currentAge: 65, retireAge: 65, deathAge: 66,
    livingCostMonthly: 0, publicPensionMonthly: 0,
    pools: [{ id: "bank", group: "bank", balance: 10000000, annualReturnPct: 0, drawOrder: 1 }],
  };
  const res = runIntegratedPlan({
    ...common,
    insurancePolicies: [{ monthlyPremium: 10000, premiumFromAge: 0, premiumToAge: 200 }],
  });
  const last = res.yearly[res.yearly.length - 1];
  // 12ヶ月 × 1万円 = 12万円だけ資産が減る（純資産からさらに引かれない）
  assert.ok(Math.abs(last.totalAssets - (10000000 - 120000)) < 1, `資産=${last.totalAssets}`);
  assert.ok(Math.abs(last.netWorth - last.totalAssets) < 1e-6, "借入0なら純資産＝総資産");
  assertInvariants(res, "保険料");
});

test("退職前はローン返済・保険料を資産から引かない（既定＝給与から支払う前提）", () => {
  const res = runIntegratedPlan({
    ...base,
    currentAge: 58, retireAge: 65, deathAge: 66,
    pools: [{ id: "bank", group: "bank", balance: 10000000, annualReturnPct: 0, drawOrder: 1 }],
    loans: [{ principal: 5000000, annualRatePct: 0, monthlyPayment: 50000 }],
  });
  const at60 = res.yearly.find((r) => r.age === 60);
  assert.equal(at60.bankValue, 10000000, "積立期は資産が減らない");
  // ただし借入残高は減るので、純資産は増える（給与で返済しているため、これは正しい）
  assert.ok(at60.netWorth > res.yearly[0].netWorth);
  assertInvariants(res, "積立期");
});

// ---------------------------------------------------------------------------
// 各国モデル
// ---------------------------------------------------------------------------
const commonSide = {
  gold: { id: "gold", group: "gold", balance: 1000000, annualReturnPct: 0, drawOrder: 90 },
  bank: { id: "bank", group: "bank", balance: 2000000, annualReturnPct: 0, drawOrder: 80 },
  stock: { id: "stock", group: "stock", balance: 1000000, annualReturnPct: 0, drawOrder: 85 },
};

function countryCase(name, investPools, extra = {}) {
  
  test(`${name}: 主要投資口座が0になった後、現金・他の換金可能資産から取り崩される`, () => {
    const res = runIntegratedPlan({
      ...base,
      currentAge: 65, retireAge: 65, deathAge: 80,
      livingCostMonthly: 300000, publicPensionMonthly: 0,
      pools: [...investPools(), commonSide.bank, commonSide.stock, commonSide.gold],
      ...extra,
    });
    const last = res.yearly[res.yearly.length - 1];
    assert.equal(last.investmentValue, 0, "主要投資口座は尽きているはず");
    assert.ok(last.bankValue < 2000000 || last.stockValue < 1000000 || last.goldValue < 1000000,
      "投資口座が尽きたあと、他の資産が取り崩されているはず");
    assertInvariants(res, name);
  });

  test(`${name}: 引出制限中の退職口座からは取り崩されない`, () => {
    // 制限年齢に達する前に、他の資産だけで足りない状況を作る
    const res = runIntegratedPlan({
      ...base,
      currentAge: 50, retireAge: 50, deathAge: 55,
      livingCostMonthly: 300000, publicPensionMonthly: 0,
      pools: [...investPools(), { ...commonSide.bank, balance: 500000 }],
      ...extra,
    });
    const restricted = investPools().filter((x) => x.accessAge && x.accessAge > 55 && x.accessAge !== NOT_DRAWABLE);
    restricted.forEach((r0) => {
      res.yearly.forEach((row) => {
        assert.ok(row[`pool_${r0.id}`] >= r0.balance - 1e-6,
          `${r0.id} が制限年齢前に取り崩されている (age ${row.age})`);
      });
    });
    assertInvariants(res, name);
  });

  test(`${name}: 全資産が尽きた後に資産が再び増えない`, () => {
    const res = runIntegratedPlan({
      ...base,
      currentAge: 65, retireAge: 65, deathAge: 95,
      livingCostMonthly: 500000, publicPensionMonthly: 0,
      pools: [...investPools(), { ...commonSide.bank, balance: 100000 }],
      ...extra,
    });
    assert.ok(res.depletionAge !== null);
    const after = res.yearly.filter((r) => r.age >= Math.ceil(res.depletionAge) + 2);
    after.forEach((r) => assert.equal(r.totalAssets, 0, `age ${r.age} で資産が復活`));
    assertInvariants(res, name);
  });

  test(`${name}: ローン元本返済で純資産が不自然に増えない / 帯上端−借入＝純資産`, () => {
    const res = runIntegratedPlan({
      ...base,
      currentAge: 65, retireAge: 65, deathAge: 85,
      livingCostMonthly: 200000, publicPensionMonthly: 180000,
      pools: [...investPools(), commonSide.bank, commonSide.stock, commonSide.gold],
      loans: [{ principal: 8000000, annualRatePct: 2, monthlyPayment: 60000 }],
      insurancePolicies: [{ monthlyPremium: 15000, premiumFromAge: 0, premiumToAge: 200 }],
      ...extra,
    });
    // 退職後なので、返済も保険料も必ず資産から出ている
    for (let i = 1; i < res.yearly.length; i++) {
      const prev = res.yearly[i - 1], cur = res.yearly[i];
      if (cur.loanBalance < prev.loanBalance && cur.totalAssets > 0) {
        assert.ok(cur.totalAssets < prev.totalAssets + 1e-6 || cur.netWorth <= prev.netWorth + 1e6,
          `age ${cur.age}: 借入が減った分だけ純資産が湧いている`);
      }
    }
    assertInvariants(res, name);
  });
}

// 日本：NISA → 銀行 → 個別株 → 金
countryCase("日本 (JP)", () => [
  { id: "nisa", group: "investment", balance: 3000000, annualReturnPct: 0, drawOrder: 1 },
]);

// 米国：Brokerage → Traditional IRA → 401(k) → Roth IRA（59.5歳未満は制限）
countryCase("米国 (US)", () => [
  { id: "brokerage", group: "investment", balance: 1000000, annualReturnPct: 0, drawOrder: 1 },
  { id: "traditionalIra", group: "investment", balance: 1000000, annualReturnPct: 0, drawOrder: 2, accessAge: 59.5 },
  { id: "k401", group: "investment", balance: 1000000, annualReturnPct: 0, drawOrder: 3, accessAge: 59.5 },
  { id: "rothIra", group: "investment", balance: 1000000, annualReturnPct: 0, drawOrder: 4, accessAge: 59.5 },
]);

// 英国：GIA → Cash Savings → Cash ISA → S&S ISA → 職域年金 → SIPP（年金は57歳制限）
countryCase("英国 (GB)", () => [
  { id: "gia", group: "investment", balance: 800000, annualReturnPct: 0, drawOrder: 1 },
  { id: "cashIsa", group: "investment", balance: 800000, annualReturnPct: 0, drawOrder: 2 },
  { id: "stocksSharesIsa", group: "investment", balance: 800000, annualReturnPct: 0, drawOrder: 3 },
  { id: "workplacePension", group: "investment", balance: 800000, annualReturnPct: 0, drawOrder: 4, accessAge: 57 },
  { id: "sipp", group: "investment", balance: 800000, annualReturnPct: 0, drawOrder: 5, accessAge: 57 },
]);

// カナダ：Non-Registered → Cash → TFSA → RRSP（71歳からRRIF強制取崩し）
countryCase("カナダ (CA)", () => [
  { id: "nonRegistered", group: "investment", balance: 1000000, annualReturnPct: 0, drawOrder: 1 },
  { id: "tfsa", group: "investment", balance: 1000000, annualReturnPct: 0, drawOrder: 2 },
  {
    id: "rrsp", group: "investment", balance: 2000000, annualReturnPct: 0, drawOrder: 3,
    minimumDrawdown: (age, bal) => (age >= 71 ? bal * 0.0528 : 0),
    minimumDrawdownTo: "nonRegistered",
  },
]);

// オーストラリア：Investment → Cash → Super（preservation age 60歳制限）
countryCase("豪州 (AU)", () => [
  { id: "investmentAccount", group: "investment", balance: 1000000, annualReturnPct: 0, drawOrder: 1 },
  {
    id: "superannuation", group: "investment", balance: 3000000, annualReturnPct: 0, drawOrder: 3,
    accessAge: 60, earningsTaxPct: 15, contributionTaxPct: 15,
    minimumDrawdown: (age, bal) => (age >= 65 ? bal * 0.05 : 0),
    minimumDrawdownTo: "investmentAccount",
  },
]);

test("CA: RRIF強制取崩しで総資産が増減しない（口座間の移動のみ）", () => {
  const res = runIntegratedPlan({
    ...base,
    currentAge: 71, retireAge: 71, deathAge: 75,
    livingCostMonthly: 0, publicPensionMonthly: 0,
    pools: [
      { id: "nonRegistered", group: "investment", balance: 0, annualReturnPct: 0, drawOrder: 1 },
      {
        id: "rrsp", group: "investment", balance: 10000000, annualReturnPct: 0, drawOrder: 3,
        minimumDrawdown: (age, bal) => bal * 0.0528, minimumDrawdownTo: "nonRegistered",
      },
    ],
  });
  res.yearly.forEach((r) => {
    assert.ok(Math.abs(r.totalAssets - 10000000) < 1, `age ${r.age}: 総資産が変動 (${r.totalAssets})`);
  });
  const last = res.yearly[res.yearly.length - 1];
  assert.ok(last.pool_nonRegistered > 0, "RRIF分が非登録口座へ移っているはず");
  assertInvariants(res, "CA-RRIF");
});
});
