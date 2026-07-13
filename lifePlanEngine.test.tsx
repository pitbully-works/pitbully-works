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
});
