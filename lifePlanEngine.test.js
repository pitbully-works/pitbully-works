import { describe, it, expect } from "vitest";
import { runIntegratedPlan, NOT_DRAWABLE } from "./lifePlanEngine.js";

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
  publicPensions: [{ monthlyAmount: 150000, startAge: 65 }],
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
    livingCostMonthly: 0, publicPensions: [],
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
    livingCostMonthly: 100000, publicPensions: [],
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
    livingCostMonthly: 200000, publicPensions: [],
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
    livingCostMonthly: 0, publicPensions: [],
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
// 年齢軸（表示用の整数年齢）
// ---------------------------------------------------------------------------
const agePools = [{ id: "bank", group: "bank", balance: 10000000, annualReturnPct: 0, drawOrder: 1 }];

test("G: 現在58.66歳でもグラフは58歳から始まる（59歳に切り上がらない）", () => {
  const res = runIntegratedPlan({
    ...base, currentAge: 58.66478859472867, retireAge: 65, deathAge: 95, pools: agePools,
  });
  assert.equal(res.yearly[0].age, 58, "最初の行は58歳のはず");
  assert.ok(Math.abs(res.yearly[0].exactAge - 58.66478859472867) < 1e-9, "exactAgeに小数年齢が保持されるはず");
});

test("G: 年齢に重複も欠落もなく、58→95まで1歳刻みで並ぶ（小数年齢）", () => {
  const res = runIntegratedPlan({
    ...base, currentAge: 58.66478859472867, retireAge: 65, deathAge: 95, pools: agePools,
  });
  const ages = res.yearly.map((r) => r.age);
  assert.equal(ages[0], 58);
  assert.equal(ages[ages.length - 1], 95);
  assert.equal(new Set(ages).size, ages.length, `年齢が重複している: ${ages}`);
  for (let i = 1; i < ages.length; i++) {
    assert.equal(ages[i], ages[i - 1] + 1, `年齢が飛んでいる: ${ages[i - 1]} → ${ages[i]}`);
  }
  assert.equal(ages.length, 38, "58〜95歳で38行のはず");
});

test("G: 現在年齢が整数のときも重複・欠落なく 58→95 になる", () => {
  const res = runIntegratedPlan({
    ...base, currentAge: 58, retireAge: 65, deathAge: 95, pools: agePools,
  });
  const ages = res.yearly.map((r) => r.age);
  assert.equal(ages[0], 58);
  assert.equal(ages[ages.length - 1], 95);
  assert.equal(new Set(ages).size, ages.length);
  for (let i = 1; i < ages.length; i++) assert.equal(ages[i], ages[i - 1] + 1);
});

test("G: 端数のある他の年齢でも開始年齢が切り上がらない", () => {
  [35.99, 40.5, 62.08].forEach((a) => {
    const res = runIntegratedPlan({ ...base, currentAge: a, retireAge: 65, deathAge: 90, pools: agePools });
    assert.equal(res.yearly[0].age, Math.floor(a), `${a}歳が ${res.yearly[0].age} と表示された`);
    assert.equal(res.yearly[res.yearly.length - 1].age, 90);
    const ages = res.yearly.map((r) => r.age);
    assert.equal(new Set(ages).size, ages.length, `${a}: 年齢が重複`);
  });
});

// ---------------------------------------------------------------------------
// H. 支払えないローン返済（資産が尽きても残高が減ってはいけない）
// ---------------------------------------------------------------------------
test("H: 資産0円・収入0円ならローン残高は減らない", () => {
  const res = runIntegratedPlan({
    ...base,
    currentAge: 65, retireAge: 65, deathAge: 66,
    livingCostMonthly: 0, publicPensions: [],
    pools: [{ id: "bank", group: "bank", balance: 0, annualReturnPct: 0, drawOrder: 1 }],
    loans: [{ principal: 120000, annualRatePct: 0, monthlyPayment: 10000 }],
  });
  const last = res.yearly[res.yearly.length - 1];
  assert.equal(last.loanBalance, 120000, "1円も返済できないので残高は据え置き");
  assert.ok(Math.abs(res.cumulativeUnpaidLoan - 120000) < 1, `未払い額=${res.cumulativeUnpaidLoan}`);
  assert.equal(last.netWorth, -120000, "純資産は借入残高ぶんマイナスのまま");
  assertInvariants(res, "H1");
});

test("H: 一部だけ払える場合は、払えた金額だけ残高が減る", () => {
  const res = runIntegratedPlan({
    ...base,
    currentAge: 65, retireAge: 65, deathAge: 66,
    livingCostMonthly: 0, publicPensions: [],
    // 資産は5万円だけ。年間の返済予定は12万円。
    pools: [{ id: "bank", group: "bank", balance: 50000, annualReturnPct: 0, drawOrder: 1 }],
    loans: [{ principal: 120000, annualRatePct: 0, monthlyPayment: 10000 }],
  });
  const last = res.yearly[res.yearly.length - 1];
  assert.equal(last.bankValue, 0, "資産は使い切る");
  assert.ok(Math.abs(last.loanBalance - 70000) < 1, `払えた5万円だけ減るはず: ${last.loanBalance}`);
  assert.ok(Math.abs(res.cumulativeUnpaidLoan - 70000) < 1, `未払い=${res.cumulativeUnpaidLoan}`);
  assertInvariants(res, "H2");
});

test("H: 未払い返済によって純資産が不自然に増えない", () => {
  const res = runIntegratedPlan({
    ...base,
    currentAge: 65, retireAge: 65, deathAge: 80,
    livingCostMonthly: 0, publicPensions: [],
    pools: [{ id: "bank", group: "bank", balance: 0, annualReturnPct: 0, drawOrder: 1 }],
    loans: [{ principal: 1000000, annualRatePct: 3, monthlyPayment: 50000 }],
  });
  // 払えないので残高は利息ぶん増え続ける → 純資産は単調減少でなければならない
  for (let i = 1; i < res.yearly.length; i++) {
    assert.ok(res.yearly[i].netWorth <= res.yearly[i - 1].netWorth + 1e-6,
      `age ${res.yearly[i].age}: 純資産が増えている（未払い返済で借入が減った）`);
    assert.ok(res.yearly[i].loanBalance >= res.yearly[i - 1].loanBalance - 1e-6,
      `age ${res.yearly[i].age}: 払えていないのに借入残高が減っている`);
  }
  assertInvariants(res, "H3");
});

// ---------------------------------------------------------------------------
// I. 公的年金の受給開始年齢（退職年齢から自動的に始まらない）
// ---------------------------------------------------------------------------
test("I: 退職60歳・年金開始67歳なら、60〜66歳は公的年金収入が0", () => {
  const res = runIntegratedPlan({
    ...base,
    currentAge: 60, retireAge: 60, deathAge: 80,
    livingCostMonthly: 100000,
    publicPensions: [{ monthlyAmount: 100000, startAge: 67 }],
    pools: [{ id: "bank", group: "bank", balance: 8400000, annualReturnPct: 0, drawOrder: 1 }],
  });
  // 60〜66歳の7年間は年金が無いので、生活費 月10万 × 84ヶ月 = 840万を資産から取り崩す
  const at67 = res.yearly.find((r) => r.age === 67);
  assert.ok(Math.abs(at67.bankValue) < 1, `67歳で資産を使い切るはず: ${at67.bankValue}`);
  // 67歳以降は年金が生活費と釣り合うので、それ以上は減らない（不足も出ない）
  const last = res.yearly[res.yearly.length - 1];
  assert.ok(Math.abs(last.bankValue) < 1);
  assert.ok(res.cumulativeUnmet < 1, `年金開始後に不足が出てはいけない: ${res.cumulativeUnmet}`);
  assertInvariants(res, "I1");
});

test("I: 年金開始前は1円も収入にならない（開始年齢の直前と直後で差が出る）", () => {
  const make = (startAge) => runIntegratedPlan({
    ...base,
    currentAge: 60, retireAge: 60, deathAge: 66,
    livingCostMonthly: 100000,
    publicPensions: [{ monthlyAmount: 100000, startAge }],
    pools: [{ id: "bank", group: "bank", balance: 10000000, annualReturnPct: 0, drawOrder: 1 }],
  });
  const never = make(67);   // 期間中ずっと年金なし → 6年 × 120万 = 720万を取り崩す
  const from60 = make(60);  // 最初から年金あり → 取り崩しゼロ
  assert.ok(Math.abs(never.yearly[never.yearly.length - 1].bankValue - 2800000) < 1,
    `年金なし: ${never.yearly[never.yearly.length - 1].bankValue}`);
  assert.ok(Math.abs(from60.yearly[from60.yearly.length - 1].bankValue - 10000000) < 1,
    `年金あり: ${from60.yearly[from60.yearly.length - 1].bankValue}`);
  assertInvariants(never, "I2");
});

test("I: CA方式（CPPとOASで開始年齢が別）でもそれぞれの年齢から始まる", () => {
  const res = runIntegratedPlan({
    ...base,
    currentAge: 60, retireAge: 60, deathAge: 75,
    livingCostMonthly: 0,
    publicPensions: [
      { monthlyAmount: 1000, startAge: 62 },  // CPP（前倒し）
      { monthlyAmount: 2000, startAge: 70 },  // OAS（繰下げ）
    ],
    pools: [{ id: "bank", group: "bank", balance: 0, annualReturnPct: 0, drawOrder: 1 }],
  });
  const at62 = res.yearly.find((r) => r.age === 62);
  const at63 = res.yearly.find((r) => r.age === 63);
  const at70 = res.yearly.find((r) => r.age === 70);
  const at71 = res.yearly.find((r) => r.age === 71);
  assert.equal(at62.bankValue, 0, "62歳の誕生日時点ではまだ受給していない");
  assert.ok(Math.abs(at63.bankValue - 12000) < 1, `63歳でCPPの1年分: ${at63.bankValue}`);
  // 70→71歳の1年で CPP 12,000 + OAS 24,000 = 36,000 増える
  assert.ok(Math.abs((at71.bankValue - at70.bankValue) - 36000) < 1,
    `70歳以降は両方受給: ${at71.bankValue - at70.bankValue}`);
  assertInvariants(res, "I3");
});

// ---------------------------------------------------------------------------
// J. 表示年齢と exactAge の一致 / deathAge まで計算されている
// ---------------------------------------------------------------------------
test("J: 表示年齢と exactAge が一致する（65歳の行は本当に65.0歳時点）", () => {
  const res = runIntegratedPlan({
    ...base, currentAge: 58.66478859472867, retireAge: 65, deathAge: 95,
    pools: [{ id: "bank", group: "bank", balance: 10000000, annualReturnPct: 0, drawOrder: 1 }],
  });
  res.yearly.slice(1).forEach((r) => {
    assert.ok(Math.abs(r.exactAge - r.age) < 1e-9,
      `age=${r.age} なのに exactAge=${r.exactAge}`);
  });
  // 先頭行だけは小数年齢（58.66歳）で、表示は58歳
  assert.equal(res.yearly[0].age, 58);
  assert.ok(Math.abs(res.yearly[0].exactAge - 58.66478859472867) < 1e-9);
});

test("J: deathAge までの残り期間が実際に計算されている", () => {
  // 収入0・生活費のみ。95歳までの月数ぶん、きっちり取り崩されているはず。
  const currentAge = 58.5;
  const res = runIntegratedPlan({
    ...base,
    currentAge, retireAge: 58.5, deathAge: 95,
    livingCostMonthly: 10000, publicPensions: [],
    pools: [{ id: "bank", group: "bank", balance: 100000000, annualReturnPct: 0, drawOrder: 1 }],
  });
  const last = res.yearly[res.yearly.length - 1];
  assert.equal(last.age, 95, "最終行は95歳");
  assert.ok(Math.abs(last.exactAge - 95) < 1e-9, "最終行は本当に95.0歳時点");
  const spent = 100000000 - last.bankValue;
  const expected = 10000 * (95 - currentAge) * 12; // 36.5年 × 12ヶ月 × 1万円
  assert.ok(Math.abs(spent - expected) < 1, `取り崩し額=${spent} 期待=${expected}`);
  assertInvariants(res, "J2");
});

// ---------------------------------------------------------------------------
// K. 取り崩し順序（現金 → 課税 → 非課税 → 引出制限 → 現物）
// ---------------------------------------------------------------------------
// 標準順序に沿った5つのプール。すべて利回り0で、金額だけを追う。
const orderPools = () => ([
  { id: "cash",     group: "bank",       balance: 1000000, annualReturnPct: 0, drawOrder: 0 },
  { id: "taxable",  group: "stock",      balance: 1000000, annualReturnPct: 0, drawOrder: 100 },
  { id: "taxFree",  group: "investment", balance: 1000000, annualReturnPct: 0, drawOrder: 200 },
  { id: "locked",   group: "investment", balance: 1000000, annualReturnPct: 0, drawOrder: 300, accessAge: 70 },
  { id: "gold",     group: "gold",       balance: 1000000, annualReturnPct: 0, drawOrder: 400 },
]);
const orderBase = {
  ...base, currentAge: 60, retireAge: 60, deathAge: 95,
  livingCostMonthly: 100000, publicPensions: [], surplusTargetId: "cash",
};

test("K: 銀行預金が残っている間は投資口座を取り崩さない", () => {
  const res = runIntegratedPlan({ ...orderBase, pools: orderPools() });
  // 月10万 → 現金100万は10ヶ月で尽きる。61歳時点では現金だけが減っている。
  const at61 = res.yearly.find((r) => r.age === 61);
  assert.equal(at61.pool_cash, 0, "現金は尽きているはず");
  // 現金が尽きるまでの10ヶ月は、投資口座に一切手を付けていない
  const at60 = res.yearly[0];
  assert.equal(at60.pool_taxFree, 1000000);
  const zeroCash = res.yearly.find((r) => r.pool_cash === 0);
  assert.equal(zeroCash.pool_taxFree, 1000000, "現金が尽きた時点でも非課税口座は満額");
  assert.equal(zeroCash.pool_gold, 1000000, "金も満額");
  assertInvariants(res, "K1");
});

test("K: 課税口座が残っている間は非課税口座を取り崩さない", () => {
  const res = runIntegratedPlan({ ...orderBase, pools: orderPools() });
  // 現金(100万) → 課税(100万) の順。合計200万 ＝ 20ヶ月ぶん。61歳(12ヶ月)時点では
  // 現金0・課税は残っており、非課税は満額のまま。
  const at61 = res.yearly.find((r) => r.age === 61);
  assert.equal(at61.pool_cash, 0);
  assert.ok(at61.pool_taxable > 0 && at61.pool_taxable < 1000000, `課税口座が取り崩し中: ${at61.pool_taxable}`);
  assert.equal(at61.pool_taxFree, 1000000, "非課税口座は1円も減っていないはず");
  assert.equal(at61.pool_gold, 1000000, "金も減っていないはず");
  assertInvariants(res, "K2");
});

test("K: 引出制限口座はaccessAge未満では取り崩さない（先に金へ回る）", () => {
  const res = runIntegratedPlan({ ...orderBase, pools: orderPools() });
  // 70歳になるまで locked は使えないので、非課税が尽きたら金へ回る。
  res.yearly.filter((r) => r.age < 70).forEach((r) => {
    assert.equal(r.pool_locked, 1000000, `age ${r.age}: 制限口座が取り崩されている`);
  });
  const at69 = res.yearly.find((r) => r.age === 69);
  assert.ok(at69.pool_gold < 1000000, "制限中は金が先に取り崩されるはず");
  assertInvariants(res, "K3");
});

test("K: 先順位資産が0になった後に次順位へ移る（枯渇の順番が守られる）", () => {
  const res = runIntegratedPlan({ ...orderBase, pools: orderPools() });
  const zeroAge = (key) => {
    const hit = res.yearly.find((r) => r[key] === 0);
    return hit ? hit.age : Infinity;
  };
  const cash = zeroAge("pool_cash");
  const taxable = zeroAge("pool_taxable");
  const taxFree = zeroAge("pool_taxFree");
  const gold = zeroAge("pool_gold");
  const locked = zeroAge("pool_locked");
  assert.ok(cash <= taxable, `現金(${cash}) → 課税(${taxable})`);
  assert.ok(taxable <= taxFree, `課税(${taxable}) → 非課税(${taxFree})`);
  // 制限口座は70歳まで使えないので、金より後に尽きる
  assert.ok(gold <= locked, `金(${gold}) → 制限口座(${locked})`);
  assertInvariants(res, "K4");
});

// ---------------------------------------------------------------------------
// L. 引出時課税
// ---------------------------------------------------------------------------
test("L: 引出時課税があると、手取り必要額より多く口座から引き出される", () => {
  const res = runIntegratedPlan({
    ...base,
    currentAge: 65, retireAge: 65, deathAge: 66,
    livingCostMonthly: 75000, publicPensions: [],
    pools: [{
      id: "rrsp", group: "investment", balance: 10000000,
      annualReturnPct: 0, drawOrder: 1, withdrawalTaxPct: 25,
    }],
  });
  const last = res.yearly[res.yearly.length - 1];
  // 手取り年90万が必要。税率25%なら 90万 ÷ 0.75 = 120万を引き出す。
  const drawn = 10000000 - last.investmentValue;
  assert.ok(Math.abs(drawn - 1200000) < 1, `引出額=${drawn}（期待 1,200,000）`);
  assert.ok(Math.abs(res.cumulativeWithdrawalTax - 300000) < 1, `税額=${res.cumulativeWithdrawalTax}`);
  assertInvariants(res, "L1");
});

test("L: 非課税口座（0%）は必要額ちょうどしか減らない", () => {
  const res = runIntegratedPlan({
    ...base,
    currentAge: 65, retireAge: 65, deathAge: 66,
    livingCostMonthly: 75000, publicPensions: [],
    pools: [{
      id: "tfsa", group: "investment", balance: 10000000,
      annualReturnPct: 0, drawOrder: 1, withdrawalTaxPct: 0,
    }],
  });
  const last = res.yearly[res.yearly.length - 1];
  assert.ok(Math.abs((10000000 - last.investmentValue) - 900000) < 1);
  assert.equal(res.cumulativeWithdrawalTax, 0);
  assertInvariants(res, "L2");
});

// ---------------------------------------------------------------------------
// M. 境界年齢でのステップ分割（終了年齢ちょうどから余分な1ヶ月が出ない）
// ---------------------------------------------------------------------------
test("M: 保険料の払込終了年齢ちょうどで止まり、1ヶ月分よけいに払わない", () => {
  // 現在58.5歳（誕生日と月の区切りがずれる）。保険料は58.5〜70.25歳の141ヶ月ぶん。
  const currentAge = 58.5;
  const res = runIntegratedPlan({
    ...base,
    currentAge, retireAge: 58.5, deathAge: 95,
    livingCostMonthly: 0, publicPensions: [],
    boundaries: [70.25],
    pools: [{ id: "bank", group: "bank", balance: 100000000, annualReturnPct: 0, drawOrder: 1 }],
    insurancePolicies: [{ monthlyPremium: 10000, premiumFromAge: 0, premiumToAge: 70.25 }],
  });
  const expected = 10000 * (70.25 - currentAge) * 12; // 141ヶ月 × 1万円
  assert.ok(Math.abs(res.cumulativePremiums - expected) < 1,
    `保険料累計=${res.cumulativePremiums} 期待=${expected}`);
  assertInvariants(res, "M1");
});

test("M: 民間年金の受給終了年齢ちょうどで止まる（境界なしだと1ヶ月ぶれる）", () => {
  const res = runIntegratedPlan({
    ...base,
    currentAge: 60.5, retireAge: 60.5, deathAge: 90,
    livingCostMonthly: 0, publicPensions: [],
    boundaries: [65.25, 75.75],
    pools: [
      { id: "bank", group: "bank", balance: 0, annualReturnPct: 0, drawOrder: 1 },
      { id: "pp", group: "privatePension", balance: 100000000, annualReturnPct: 0, accessAge: NOT_DRAWABLE },
    ],
    privatePensionPlans: [
      { poolId: "pp", monthlyPayout: 50000, payoutFromAge: 65.25, payoutToAge: 75.75 },
    ],
  });
  const last = res.yearly[res.yearly.length - 1];
  // 受給期間は 65.25〜75.75 の 126ヶ月ちょうど。全額が余剰として銀行へ移る。
  const expected = 50000 * (75.75 - 65.25) * 12;
  assert.ok(Math.abs(last.bankValue - expected) < 1,
    `受給総額=${last.bankValue} 期待=${expected}`);
  assertInvariants(res, "M2");
});

test("M: 積立終了年齢ちょうどで拠出が止まる", () => {
  const res = runIntegratedPlan({
    ...base,
    currentAge: 40.25, retireAge: 65, deathAge: 66,
    livingCostMonthly: 0, publicPensions: [],
    boundaries: [60.75],
    pools: [{
      id: "bank", group: "bank", balance: 0, annualReturnPct: 0,
      monthlyContribution: 10000, contribEndAge: 60.75, drawOrder: 1,
    }],
  });
  const last = res.yearly[res.yearly.length - 1];
  const expected = 10000 * (60.75 - 40.25) * 12; // 246ヶ月
  assert.ok(Math.abs(last.bankValue - expected) < 1,
    `積立累計=${last.bankValue} 期待=${expected}`);
  assertInvariants(res, "M3");
});

// ---------------------------------------------------------------------------
// N. 内訳の合計 ＝ 総資産帯の各グループ残高
// ---------------------------------------------------------------------------
test("N: 各年齢で、口座別内訳の合計がグループ残高と一致する", () => {
  const res = runIntegratedPlan({
    ...base,
    currentAge: 58.66478859472867, retireAge: 65, deathAge: 95,
    livingCostMonthly: 300000,
    healthCostAnnual: (age) => (age >= 75 ? 300000 : 120000),
    pools: [
      { id: "bank_0", group: "bank", balance: 3000000, annualReturnPct: 0.1, drawOrder: 0 },
      { id: "bank_1", group: "bank", balance: 2000000, annualReturnPct: 0.1, drawOrder: 1 },
      { id: "brokerage", group: "investment", balance: 4000000, annualReturnPct: 5, drawOrder: 100, withdrawalTaxPct: 15 },
      { id: "rothIra", group: "investment", balance: 3000000, annualReturnPct: 5, drawOrder: 200, accessAge: 59.5 },
      { id: "k401", group: "investment", balance: 8000000, annualReturnPct: 5, drawOrder: 300, accessAge: 59.5, withdrawalTaxPct: 22 },
      { id: "stock", group: "stock", balance: 2000000, annualReturnPct: 6, drawOrder: 150 },
      { id: "gold", group: "gold", balance: 3000000, annualReturnPct: 4, drawOrder: 400 },
    ],
    loans: [{ principal: 5000000, annualRatePct: 1.2, monthlyPayment: 40000 }],
    insurancePolicies: [{ monthlyPremium: 15000, premiumFromAge: 0, premiumToAge: 80 }],
  });
  res.yearly.forEach((r) => {
    const bank = r.pool_bank_0 + r.pool_bank_1;
    const investment = r.pool_brokerage + r.pool_rothIra + r.pool_k401;
    assert.ok(Math.abs(bank - r.bankValue) < 1e-6, `age ${r.age}: 銀行内訳の合計≠bankValue`);
    assert.ok(Math.abs(investment - r.investmentValue) < 1e-6, `age ${r.age}: 口座内訳の合計≠investmentValue`);
    assert.ok(Math.abs(r.pool_stock - r.stockValue) < 1e-6, `age ${r.age}: 個別株`);
    assert.ok(Math.abs(r.pool_gold - r.goldValue) < 1e-6, `age ${r.age}: 金`);
    assert.ok(Math.abs(r.loan_0 - r.loanBalance) < 1e-6, `age ${r.age}: 借入内訳の合計≠loanBalance`);
  });
  assertInvariants(res, "N1");
});

test("I: 日本モデル — 退職60歳・年金開始65歳なら60〜64歳は公的年金0", () => {
  const res = runIntegratedPlan({
    ...base,
    currentAge: 60, retireAge: 60, deathAge: 90,
    livingCostMonthly: 200000,
    // 未入力時の既定は65歳（退職年齢からは始まらない）
    publicPensions: [{ monthlyAmount: 200000, startAge: 65 }],
    pools: [{ id: "bank", group: "bank", balance: 12000000, annualReturnPct: 0, drawOrder: 1 }],
  });
  // 60〜64歳の5年間 × 月20万 = 1,200万をちょうど取り崩す
  const at65 = res.yearly.find((r) => r.age === 65);
  assert.ok(Math.abs(at65.bankValue) < 1, `65歳で資産を使い切るはず: ${at65.bankValue}`);
  // 60〜64歳は年金が1円も入っていない（＝毎年ちょうど240万ずつ減る）
  for (let a = 61; a <= 65; a++) {
    const cur = res.yearly.find((r) => r.age === a);
    const prev = res.yearly.find((r) => r.age === a - 1);
    assert.ok(Math.abs((prev.bankValue - cur.bankValue) - 2400000) < 1,
      `age ${a}: 年金が入ってしまっている（減少額 ${prev.bankValue - cur.bankValue}）`);
  }
  // 65歳以降は年金と生活費が釣り合い、不足も出ない
  assert.ok(res.cumulativeUnmet < 1, `年金開始後の不足=${res.cumulativeUnmet}`);
  assertInvariants(res, "I-JP");
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
      livingCostMonthly: 300000, publicPensions: [],
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
      livingCostMonthly: 300000, publicPensions: [],
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
      livingCostMonthly: 500000, publicPensions: [],
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
      livingCostMonthly: 200000, publicPensions: [{ monthlyAmount: 180000, startAge: 65 }],
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
    livingCostMonthly: 0, publicPensions: [],
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

// ===========================================================================
// 余剰金の記録（surplusBalance）— 第2段階・記録専用
//
// 【この段階の約束】
//   ・surplusBalance は「記録専用」。どのプール残高にも足し込まない。
//   ・既存の surplusPool.balance += cash は変更していない。
//   ・bankValue / totalAssets / netWorth / 取り崩し順序 は一切変わらない。
//   ・各期間の収入から生活費・医療費・保険料・ローン返済を差し引いた「後」に
//     残った現金だけを累計する。
//   ・公的年金・民間年金・iDeCo年金・iDeCo一時金は、最終的に残った現金を通じて
//     自動的に含まれる（surplusBalance 側に個別の加算処理は無い）。
//   ・シミュレーション再実行で二重加算されない（関数スコープで毎回 0 初期化）。
// ===========================================================================

// ① 変更前後で bankValue / totalAssets / 純資産が完全一致する（記録は残高に影響しない）。
//
// 【なぜこれで「変更前後の一致」を検証できるか】
//   surplusBalance は新設の局所変数で、スナップショットに読み出す以外に何もしない。
//   よって資産・純資産の数値は、この機能を入れる前とビット単位で同じはずである。
//   ここでは独立に手計算した期待値と突き合わせ、記録処理が残高を 1 円も動かして
//   いないことを固定する。
//   構成：65→66歳の1年、退職済み。公的年金 月20万 − 生活費 月15万 = 月5万の余剰。
//         余剰は既存仕様どおり銀行プールへ流入する（＝変更前の挙動そのまま）。
test("余剰金①: 記録を入れても bankValue・totalAssets・純資産は変わらない（手計算と完全一致）", () => {
  const res = runIntegratedPlan({
    ...base,
    currentAge: 65, retireAge: 65, deathAge: 66,
    livingCostMonthly: 150000,
    publicPensions: [{ monthlyAmount: 200000, startAge: 65 }],
    surplusTargetId: "bank",
    pools: [{ id: "bank", group: "bank", balance: 1000000, annualReturnPct: 0, drawOrder: 1 }],
  });
  const last = res.yearly[res.yearly.length - 1];

  // 余剰 月5万 × 12ヶ月 = 60万。銀行は既存仕様で余剰を受け取り 100万 → 160万。
  // （この 160万は「変更前」のエンジンでも同じ値。記録追加で動いていないことの固定。）
  assert.ok(Math.abs(last.bankValue - 1600000) < 1e-6, `bankValue=${last.bankValue}（期待 1,600,000）`);
  assert.ok(Math.abs(last.totalAssets - 1600000) < 1e-6, `totalAssets=${last.totalAssets}（期待 1,600,000）`);
  assert.ok(Math.abs(last.netWorth - 1600000) < 1e-6, `netWorth=${last.netWorth}（期待 1,600,000）`);

  // 記録は正しく積まれている（60万）。
  assert.ok(Math.abs(last.surplusBalance - 600000) < 1e-6, `surplusBalance=${last.surplusBalance}（期待 600,000）`);
  assert.ok(Math.abs(res.finalSurplusBalance - 600000) < 1e-6, `finalSurplusBalance=${res.finalSurplusBalance}`);

  // 記録は総資産へ二重計上されない（totalAssets は帯の合計＝プール残高のみ）。
  assert.ok(Math.abs(last.totalAssets - last.bankValue) < 1e-6, "surplusBalance が totalAssets に紛れ込んでいる");
  assertInvariants(res, "余剰金①");
});

// ② 余剰が出ないケースでは surplusBalance が全期間 0 のまま。
//   収入源が無く、生活費を資産から取り崩すだけの構成。残った現金は常に 0。
test("余剰金②: 余剰が発生しない場合は surplusBalance が全行 0 のまま", () => {
  const res = runIntegratedPlan({
    ...base,
    currentAge: 65, retireAge: 65, deathAge: 70,
    livingCostMonthly: 200000, publicPensions: [],
    surplusTargetId: "bank",
    pools: [{ id: "bank", group: "bank", balance: 12000000, annualReturnPct: 0, drawOrder: 1 }],
  });
  res.yearly.forEach((r) => {
    assert.equal(r.surplusBalance, 0, `age ${r.age}: 余剰が無いのに surplusBalance=${r.surplusBalance}`);
  });
  assert.equal(res.finalSurplusBalance, 0, `finalSurplusBalance=${res.finalSurplusBalance}`);
  assertInvariants(res, "余剰金②");
});

// ③ iDeCo一時金は一度だけ surplusBalance に反映され、再実行で二重加算されない。
//   iDeCo一時金 300万を 67歳で受取（生活費0なので全額が余剰として残る）。
//   一時金は「受取年齢に到達した最初のステップ」で一度だけ現金化される。67.0歳の
//   誕生日ステップは開始年齢が約66.9歳のため未発火で、次のステップで発火する。
//   したがって 67歳スナップショットでは 0、68歳以降で 300万になるのが正しい。
test("余剰金③: iDeCo一時金は一度だけ surplusBalance に載り、再実行でも二重加算されない", () => {
  const cfg = {
    ...base,
    currentAge: 65, retireAge: 65, deathAge: 70,
    livingCostMonthly: 0, publicPensions: [],
    surplusTargetId: "bank",
    idecoPoolId: "ideco", idecoLumpAmount: 3000000, idecoLumpAge: 67,
    pools: [
      { id: "bank", group: "bank", balance: 0, annualReturnPct: 0, drawOrder: 1 },
      { id: "ideco", group: "ideco", balance: 5000000, annualReturnPct: 0, accessAge: NOT_DRAWABLE },
    ],
  };
  const res = runIntegratedPlan(cfg);

  // 受取前（〜67歳）は 0、受取後（68歳〜）は 300万ちょうど（毎ステップ加算されていない）。
  res.yearly.filter((r) => r.age <= 67).forEach((r) => {
    assert.equal(r.surplusBalance, 0, `age ${r.age}: 受取前なのに ${r.surplusBalance}`);
  });
  res.yearly.filter((r) => r.age >= 68).forEach((r) => {
    assert.ok(Math.abs(r.surplusBalance - 3000000) < 1e-6, `age ${r.age}: surplusBalance=${r.surplusBalance}（期待 3,000,000）`);
  });
  assert.ok(Math.abs(res.finalSurplusBalance - 3000000) < 1e-6, `finalSurplusBalance=${res.finalSurplusBalance}（一時金は1回だけ）`);

  // 一時金の元本はプールから抜けている（iDeCo 500万 → 200万）。残高そのものは余剰にしない。
  const last = res.yearly[res.yearly.length - 1];
  assert.ok(Math.abs(last.idecoLockedValue - 2000000) < 1e-6, `idecoLockedValue=${last.idecoLockedValue}（期待 2,000,000）`);

  // 再実行しても系列・最終値が完全一致（＝再実行で二重加算されない）。
  const again = runIntegratedPlan(cfg);
  const seqA = res.yearly.map((r) => r.surplusBalance);
  const seqB = again.yearly.map((r) => r.surplusBalance);
  assert.equal(seqB.length, seqA.length, "再実行で行数が変わってはいけない");
  for (let i = 0; i < seqA.length; i++) {
    assert.ok(Math.abs(seqA[i] - seqB[i]) < 1e-6, `age ${res.yearly[i].age}: 再実行で surplusBalance が不一致`);
  }
  assert.ok(Math.abs(again.finalSurplusBalance - res.finalSurplusBalance) < 1e-6, "再実行で最終値が不一致");
  assertInvariants(res, "余剰金③");
});

// ===========================================================================
// accessibleAssets（現在使える資産）— 読み取り専用の派生フィールド。
//   銀行・投資・金・株のうち、その年齢で引出制限が無い（accessAge到達済み・
//   NOT_DRAWABLEでない）プールの合計。iDeCo（受取前）・民間年金予備は含めない。
//   既存の残高・総資産・純資産は1円も変えない（追加フィールドのみ）。
//   不変条件：0 ≤ accessibleAssets ≤ spendableAssets ≤ totalAssets。
// ===========================================================================
test("accessibleAssets①: 引出制限中の口座（accessAge未到達）は含めず、到達後に含める", () => {
  const cfg = {
    ...base, currentAge: 55, retireAge: 65, deathAge: 70,
    livingCostMonthly: 0, publicPensions: [], surplusTargetId: "bank",
    idecoPoolId: "ideco",
    pools: [
      { id: "bank", group: "bank", balance: 1000000, annualReturnPct: 0, drawOrder: 1 },
      { id: "nisa", group: "investment", balance: 2000000, annualReturnPct: 0, drawOrder: 2 },
      { id: "k401", group: "investment", balance: 3000000, annualReturnPct: 0, drawOrder: 3, accessAge: 59.5 },
      { id: "gold", group: "gold", balance: 500000, annualReturnPct: 0, drawOrder: 90 },
      { id: "stock", group: "stock", balance: 800000, annualReturnPct: 0, drawOrder: 4 },
      { id: "ideco", group: "ideco", balance: 4000000, annualReturnPct: 0, accessAge: NOT_DRAWABLE },
      { id: "priv", group: "privatePension", balance: 2500000, annualReturnPct: 0, drawOrder: 80 },
    ],
  };
  const res = runIntegratedPlan(cfg);
  const at = (a) => res.yearly.find((r) => r.age === a);
  // 55歳：401k未解禁。iDeCo・民間年金予備は常に除外。= 1M+2M+0.5M+0.8M = 4.3M
  assert.ok(Math.abs(at(55).accessibleAssets - 4300000) < 1, `55歳=${at(55).accessibleAssets}`);
  // 59歳：まだ59.5未満 → 4.3M
  assert.ok(Math.abs(at(59).accessibleAssets - 4300000) < 1, `59歳=${at(59).accessibleAssets}`);
  // 60歳：401k解禁 → +3M = 7.3M
  assert.ok(Math.abs(at(60).accessibleAssets - 7300000) < 1, `60歳=${at(60).accessibleAssets}`);
});

test("accessibleAssets②: iDeCo（受取前）と民間年金予備は accessible に含めない", () => {
  const res = runIntegratedPlan({
    ...base, currentAge: 60, retireAge: 65, deathAge: 66,
    livingCostMonthly: 0, publicPensions: [], surplusTargetId: "bank",
    idecoPoolId: "ideco",
    pools: [
      { id: "bank", group: "bank", balance: 1000000, annualReturnPct: 0, drawOrder: 1 },
      { id: "ideco", group: "ideco", balance: 4000000, annualReturnPct: 0, accessAge: NOT_DRAWABLE },
      { id: "priv", group: "privatePension", balance: 2500000, annualReturnPct: 0, drawOrder: 80 },
    ],
  });
  const r0 = res.yearly[0];
  // accessible は銀行100万のみ。iDeCo400万・年金予備250万は除外。
  assert.ok(Math.abs(r0.accessibleAssets - 1000000) < 1, `accessible=${r0.accessibleAssets}`);
  // spendable は NOT_DRAWABLE の iDeCo だけ除外 → 銀行100万＋年金予備250万 = 350万
  assert.ok(Math.abs(r0.spendableAssets - 3500000) < 1, `spendable=${r0.spendableAssets}`);
});

test("accessibleAssets③: 全年齢で 0 ≤ accessible ≤ spendable ≤ total（不変条件）＋既存値は不変", () => {
  const cfg = {
    ...base, currentAge: 58, retireAge: 65, deathAge: 95,
    pools: [
      { id: "nisa", group: "investment", balance: 8000000, annualReturnPct: 5, retireReturnPct: 3, drawOrder: 1 },
      { id: "bank", group: "bank", balance: 5000000, annualReturnPct: 0.1, drawOrder: 2 },
      { id: "gold", group: "gold", balance: 3000000, annualReturnPct: 4, drawOrder: 4 },
    ],
    loans: [{ principal: 12000000, annualRatePct: 1.2, monthlyPayment: 70000 }],
  };
  const res = runIntegratedPlan(cfg);
  res.yearly.forEach((r) => {
    assert.ok(r.accessibleAssets >= -1e-6, `age ${r.age}: accessible が負`);
    assert.ok(r.accessibleAssets <= r.spendableAssets + 1, `age ${r.age}: accessible > spendable`);
    assert.ok(r.spendableAssets <= r.totalAssets + 1, `age ${r.age}: spendable > total`);
    // 銀行が常に含まれる（ロック無し）ので accessible は少なくとも bankValue 以上。
    assert.ok(r.accessibleAssets >= r.bankValue - 1, `age ${r.age}: accessible < bank`);
  });
  assertInvariants(res, "accessibleAssets③");
});

test("accessibleAssets④: グループ別内訳の合計が accessibleAssets と一致（将来の内訳表示の基盤）", () => {
  const res = runIntegratedPlan({
    ...base, currentAge: 55, retireAge: 65, deathAge: 70,
    livingCostMonthly: 0, publicPensions: [], surplusTargetId: "bank",
    pools: [
      { id: "bank", group: "bank", balance: 1000000, annualReturnPct: 0, drawOrder: 1 },
      { id: "nisa", group: "investment", balance: 2000000, annualReturnPct: 0, drawOrder: 2 },
      { id: "k401", group: "investment", balance: 3000000, annualReturnPct: 0, drawOrder: 3, accessAge: 59.5 },
      { id: "gold", group: "gold", balance: 500000, annualReturnPct: 0, drawOrder: 90 },
      { id: "stock", group: "stock", balance: 800000, annualReturnPct: 0, drawOrder: 4 },
    ],
  });
  const at = (a) => res.yearly.find((r) => r.age === a);
  // 55歳：401k未解禁。bank1M / investment(nisaのみ)2M / gold0.5M / stock0.8M
  assert.ok(Math.abs(at(55).accessibleBank - 1000000) < 1, `bank=${at(55).accessibleBank}`);
  assert.ok(Math.abs(at(55).accessibleInvestment - 2000000) < 1, `inv=${at(55).accessibleInvestment}`);
  assert.ok(Math.abs(at(55).accessibleGold - 500000) < 1, `gold=${at(55).accessibleGold}`);
  assert.ok(Math.abs(at(55).accessibleStock - 800000) < 1, `stock=${at(55).accessibleStock}`);
  // 60歳：401k解禁 → investment 5M
  assert.ok(Math.abs(at(60).accessibleInvestment - 5000000) < 1, `60歳 inv=${at(60).accessibleInvestment}`);
  // 内訳の合計は常に accessibleAssets に一致（全行）。
  res.yearly.forEach((r) => {
    const sum = r.accessibleBank + r.accessibleInvestment + r.accessibleGold + r.accessibleStock;
    assert.ok(Math.abs(sum - r.accessibleAssets) < 1, `age ${r.age}: 内訳合計≠accessibleAssets`);
  });
});
});

