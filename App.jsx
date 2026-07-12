import React, { useState, useMemo, useEffect, useCallback } from "react";
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, BarChart, Bar, Legend, Cell, PieChart, Pie, LabelList
} from "recharts";
import { Plus, Trash2, TrendingUp, HeartPulse, Landmark, Users, Ruler, Info, Coins, PiggyBank } from "lucide-react";
import "./storageShim.js";

// ---------- helpers ----------
const yen = (n) => {
  if (n === null || n === undefined || isNaN(n)) return "¥0";
  const sign = n < 0 ? "-" : "";
  n = Math.abs(Math.round(n));
  if (n >= 100000000) return `${sign}¥${(n / 100000000).toFixed(2)}億`;
  if (n >= 10000) return `${sign}¥${(n / 10000).toFixed(1)}万`;
  return `${sign}¥${n.toLocaleString()}`;
};

function monthlyRate(annualPct) {
  return Math.pow(1 + annualPct / 100, 1 / 12) - 1;
}

// ---------- NISA quota rules (2024- new NISA system) ----------
const NISA_LIMITS = {
  tsumitateAnnual: 1200000,   // つみたて投資枠 年間上限
  growthAnnual: 2400000,      // 成長投資枠 年間上限
  growthLifetime: 12000000,   // 成長投資枠 生涯（簿価）上限
  totalLifetime: 18000000,    // 総枠 生涯（簿価）上限（つみたて+成長）
};

// 生年月日から、今日時点での正確な年齢（年・月・日・小数の年齢）を計算する
// 銘柄名からよくある想定年率の目安を推測する（実際の市場データではなく、一般的な傾向に基づく参考値）
// マッチしない場合は中立的な既定値 5% を返す。あくまで初期値で、いつでも手動で書き換え可能。
const RETURN_GUESS_TABLE = [
  { keywords: ["半導体", "ai", "エヌビディア", "nvidia"], pct: 8 },
  { keywords: ["ナスダック", "nasdaq"], pct: 7 },
  { keywords: ["インド"], pct: 7 },
  { keywords: ["新興国", "emerging"], pct: 6.5 },
  { keywords: ["s&p500", "sp500", "s&p 500", "米国株", "全米"], pct: 6 },
  { keywords: ["全世界", "オルカン", "先進国"], pct: 5 },
  { keywords: ["高配当"], pct: 5 },
  { keywords: ["日経", "topix", "日本株"], pct: 4 },
  { keywords: ["reit", "リート", "不動産"], pct: 4 },
  { keywords: ["ゴールド", "gold", "金"], pct: 3 },
  { keywords: ["バランス"], pct: 3 },
  { keywords: ["債券", "国債", "ボンド", "bond"], pct: 2 },
  { keywords: ["預金", "貯金", "定期"], pct: 0.2 },
];
function guessDefaultReturn(name) {
  const lower = (name || "").toLowerCase();
  for (const row of RETURN_GUESS_TABLE) {
    if (row.keywords.some((k) => lower.includes(k))) return row.pct;
  }
  return 5;
}

// iDeCoの節税額（概算）用：所得税＋住民税をまとめた大まかな実効税率の目安
// ※実際の税額は控除の状況等により異なります。あくまで概算です。
function estimateMarginalTaxRate(annualIncome) {
  if (!annualIncome || annualIncome <= 0) return 0.2; // 年収未入力時の目安
  if (annualIncome <= 1950000) return 0.15;
  if (annualIncome <= 3300000) return 0.2;
  if (annualIncome <= 6950000) return 0.3;
  if (annualIncome <= 9000000) return 0.33;
  if (annualIncome <= 18000000) return 0.43;
  return 0.5;
}

function computeAgeFromBirthDate(birthDateStr, asOfDate) {
  if (!birthDateStr) return null;
  const birth = new Date(birthDateStr + "T00:00:00");
  const now = asOfDate || new Date();
  if (isNaN(birth.getTime()) || now < birth) return null;

  let years = now.getFullYear() - birth.getFullYear();
  let months = now.getMonth() - birth.getMonth();
  let days = now.getDate() - birth.getDate();
  if (days < 0) {
    months -= 1;
    const prevMonthLastDay = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
    days += prevMonthLastDay;
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  const diffMs = now - birth;
  const decimal = diffMs / (365.2425 * 24 * 3600 * 1000);

  return { years, months, days, decimal };
}

function healthAnnualCost(age, brackets) {
  if (age < 60) return 0;
  if (age < 70) return brackets.b60;
  if (age < 80) return brackets.b70;
  return brackets.b80;
}

// 年齢レンジごとの毎月投資額スケジュールから、指定年齢時点の該当額を合算して返す（つみたて枠・成長投資枠で共用）
function scheduledAmount(schedule, age) {
  if (!schedule || !schedule.length) return 0;
  return schedule.reduce((sum, r) => {
    if (age >= r.fromAge && age <= r.toAge) return sum + (r.monthlyYen || 0);
    return sum;
  }, 0);
}

// スケジュールのうち「現在の年齢より前」の区間分を、経過月数×月額で合算する
// （すでに実行済みの積立として、これまでの使用累計に自動で反映するため）
function elapsedScheduleAmount(schedule, currentAge) {
  if (!schedule || !schedule.length) return 0;
  return schedule.reduce((sum, r) => {
    if (r.fromAge >= currentAge) return sum;
    const monthsElapsed = Math.max(0, Math.min(r.toAge, currentAge) - r.fromAge) * 12;
    return sum + monthsElapsed * (r.monthlyYen || 0);
  }, 0);
}

// スケジュールの毎月の拠出額を、それぞれ「引き落とされた月」に元本として加え、
// そこから現在（toAge）まで想定利回りで複利運用したものとして、経過分の評価額を計算する
// （実際に投資してきた金額が、これまでの運用成果も含めて今いくらになっているかを近似するため）
function compoundedElapsedValue(schedule, fromAge, toAge, annualReturnPct) {
  if (!schedule || !schedule.length || fromAge === null || fromAge === undefined || fromAge >= toAge) return 0;
  const totalMonths = Math.max(0, Math.round((toAge - fromAge) * 12));
  const r = monthlyRate(annualReturnPct || 0);
  let value = 0;
  for (let m = 0; m < totalMonths; m++) {
    const age = fromAge + m / 12;
    const contribution = scheduledAmount(schedule, age);
    value = value * (1 + r) + contribution;
  }
  return value;
}

// 手入力した「その時点での実際の金額」を、基準日から現在まで想定利回りで複利成長させる
function compoundPrincipal(value, fromAge, toAge, annualReturnPct) {
  if (fromAge === null || fromAge === undefined || fromAge >= toAge) return value || 0;
  const months = Math.max(0, Math.round((toAge - fromAge) * 12));
  const r = monthlyRate(annualReturnPct || 0);
  return (value || 0) * Math.pow(1 + r, months);
}

// 一括投資のうち「すでに投資時期を迎えた（現在の年齢より前の）」ものを合算する（簿価ベース、NISA枠の使用量トラッキング用）
// ※ ちょうど現在の年齢と同じものは、以降のシミュレーションのm=0処理側で計上されるためここでは含めない
function elapsedLumpSumAmount(lumpSums, currentAge) {
  if (!lumpSums || !lumpSums.length) return 0;
  return lumpSums.reduce((sum, e) => (e.age < currentAge ? sum + (e.amount || 0) : sum), 0);
}

// 一括投資のうち「すでに投資時期を迎えた（現在の年齢より前の）」ものを、
// それぞれの投資日から現在まで想定利回りで複利運用したものとして合算する（現在資産の評価額用）
function compoundedLumpSumValue(lumpSums, currentAge, annualReturnPct) {
  if (!lumpSums || !lumpSums.length) return 0;
  const r = monthlyRate(annualReturnPct || 0);
  return lumpSums.reduce((sum, e) => {
    if (e.age >= currentAge) return sum;
    const months = Math.max(0, Math.round((currentAge - e.age) * 12));
    return sum + (e.amount || 0) * Math.pow(1 + r, months);
  }, 0);
}

function runSimulation(inputs) {
  const {
    currentAge, retireAge, deathAge,
    currentAssets, tsumitateSchedule, growthSchedule, lumpSums,
    tsumitateUsed, growthUsed,
    dynamicFunds,
    pensionMonthly, livingCostMonthly, postRetireReturn,
    healthBrackets, inheritanceTarget,
    privatePensionPlans,
    // 追加パラメータ（省略時は既存のNISA計算と完全に同一の結果になる、後方互換の任意フック）
    // iDeCoの年金受取分など、老後の収支に上乗せしたい追加収入を年齢から算出する関数
    extraRetirementIncomeMonthly,
    // iDeCo一時金など、指定月に一度だけ使用可能資産へ移す金額を年齢から算出する関数
    extraSpendableLumpSum,
  } = inputs;

  // 積立・成長投資枠・一括投資の内訳に入力された銘柄だけで配分リストを作る（固定カテゴリなし）
  const allFundEntries = (dynamicFunds && dynamicFunds.length)
    ? dynamicFunds
    : [{ id: "未分類", pct: 100, returnPct: 5 }];

  const totalMonths = Math.max(1, Math.round((deathAge - currentAge) * 12));
  let funds = {};
  allFundEntries.forEach((f) => {
    funds[f.id] = currentAssets * (f.pct / 100);
  });

  // lump-sum growth-quota investments, indexed by month offset from currentAge
  const lumpByMonth = new Map();
  (lumpSums || []).forEach((entry) => {
    const targetMonth = Math.max(1, Math.round((entry.age - currentAge) * 12));
    if (targetMonth >= 0 && targetMonth <= totalMonths) {
      lumpByMonth.set(targetMonth, (lumpByMonth.get(targetMonth) || 0) + entry.amount);
    }
  });
  const lumpTruncations = [];

  // quota tracking (簿価ベース累計投資額)
  const tsumitateMonthlyCap = NISA_LIMITS.tsumitateAnnual / 12;
  const growthMonthlyCap = NISA_LIMITS.growthAnnual / 12;
  let tsumitateCum = (tsumitateUsed || 0) + elapsedScheduleAmount(tsumitateSchedule, currentAge);
  let growthCum = (growthUsed || 0) + elapsedScheduleAmount(growthSchedule, currentAge) + elapsedLumpSumAmount(lumpSums, currentAge);
  let growthMaxedAge = null;
  let totalMaxedAge = null;

  const initialTotal = Object.values(funds).reduce((sum, value) => sum + value, 0);
  const yearly = [{
    age: Math.round(currentAge),
    total: initialTotal,
    funds: { ...funds },
    phase: currentAge < retireAge ? "積立期" : "取崩期",
    tsumitateCum,
    growthCum,
  }];
  let depletionAge = null;
  let peakAssets = initialTotal;
  let assetsAtRetire = currentAge >= retireAge ? initialTotal : null;

  for (let m = 1; m <= totalMonths; m++) {
    const age = currentAge + m / 12;
    const inAccumulation = age < retireAge;
    const lumpGross = lumpByMonth.get(m) || 0;
    // iDeCo一時金などの外部一時金。呼び出し側が受取月だけ金額を返すため、二重加算されない。
    const extraSpendableLump = typeof extraSpendableLumpSum === "function" ? (extraSpendableLumpSum(age) || 0) : 0;

    if (inAccumulation) {
      // enforce annual-rate caps
      let effGrowth = Math.min(scheduledAmount(growthSchedule, age), growthMonthlyCap);
      let effTsumitate = Math.min(scheduledAmount(tsumitateSchedule, age), tsumitateMonthlyCap);

      // enforce growth lifetime cap
      const growthRoom = Math.max(0, NISA_LIMITS.growthLifetime - growthCum);
      if (effGrowth > growthRoom) effGrowth = growthRoom;

      // enforce combined lifetime cap (growth counted first, then tsumitate fills remainder)
      let totalRoom = Math.max(0, NISA_LIMITS.totalLifetime - (tsumitateCum + growthCum));
      if (effGrowth > totalRoom) effGrowth = totalRoom;
      totalRoom -= effGrowth;
      if (effTsumitate > totalRoom) effTsumitate = totalRoom;

      if (effGrowth > 0) growthCum += effGrowth;
      if (effTsumitate > 0) tsumitateCum += effTsumitate;

      // lump-sum investment this month (goes into growth quota)
      let lumpEff = 0;
      if (lumpGross > 0) {
        const gRoom = Math.max(0, NISA_LIMITS.growthLifetime - growthCum);
        const tRoom = Math.max(0, NISA_LIMITS.totalLifetime - (tsumitateCum + growthCum));
        lumpEff = Math.min(lumpGross, gRoom, tRoom);
        if (lumpEff > 0) growthCum += lumpEff;
        if (lumpEff < lumpGross) {
          lumpTruncations.push({ age: Math.round(age * 10) / 10, shortfall: lumpGross - lumpEff });
        }
      }

      if (growthMaxedAge === null && growthCum >= NISA_LIMITS.growthLifetime - 1) growthMaxedAge = age;
      if (totalMaxedAge === null && tsumitateCum + growthCum >= NISA_LIMITS.totalLifetime - 1) totalMaxedAge = age;

      const contribution = effGrowth + effTsumitate + lumpEff;

      allFundEntries.forEach((f) => {
        const r = monthlyRate(f.returnPct);
        funds[f.id] = funds[f.id] * (1 + r) + contribution * (f.pct / 100);
      });
      // 退職前にiDeCo一時金を受け取った場合も、使用可能な現金として保持する。
      if (extraSpendableLump > 0) {
        funds.__ideco_cash__ = (funds.__ideco_cash__ || 0) + extraSpendableLump;
      }
    } else {
      let total = Object.values(funds).reduce((s, v) => s + v, 0);
      const r = monthlyRate(postRetireReturn);
      total = total * (1 + r);
      // 受取開始月に一度だけ、iDeCo一時金を生活費に使える資産へ移す。
      total += extraSpendableLump;
      const healthMonthly = healthAnnualCost(age, healthBrackets) / 12;
      const privatePensionIncome = (privatePensionPlans || []).reduce(
        (s, pl) => (age >= pl.payoutFromAge && age <= pl.payoutToAge ? s + (pl.monthlyPayout || 0) : s),
        0
      );
      // 追加収入（iDeCo年金受取分など）：未指定なら0のため、既存の計算結果に一切影響しない
      const extraIncome = typeof extraRetirementIncomeMonthly === "function" ? extraRetirementIncomeMonthly(age) : 0;
      const netOutflow = livingCostMonthly + healthMonthly - pensionMonthly - privatePensionIncome - extraIncome;
      total -= netOutflow;
      if (total < 0) {
        if (depletionAge === null) depletionAge = age;
        total = 0;
      }
      // lump-sum investment during decumulation (e.g. retirement bonus reinvested)
      if (lumpGross > 0) {
        const gRoom = Math.max(0, NISA_LIMITS.growthLifetime - growthCum);
        const tRoom = Math.max(0, NISA_LIMITS.totalLifetime - (tsumitateCum + growthCum));
        const lumpEff = Math.min(lumpGross, gRoom, tRoom);
        if (lumpEff > 0) growthCum += lumpEff;
        if (lumpEff < lumpGross) {
          lumpTruncations.push({ age: Math.round(age * 10) / 10, shortfall: lumpGross - lumpEff });
        }
        total += lumpEff;
      }
      // collapse into a single post-retirement bucket for simplicity so chart total stays coherent
      funds = { __cash__: total };
    }

    if (Math.abs(age - retireAge) < (1 / 24) && assetsAtRetire === null) {
      assetsAtRetire = Object.values(funds).reduce((s, v) => s + v, 0);
    }

    if (m % 12 === 0) {
      const total = Object.values(funds).reduce((s, v) => s + v, 0);
      peakAssets = Math.max(peakAssets, total);
      yearly.push({
        age: Math.round(age),
        total,
        funds: { ...funds },
        phase: inAccumulation ? "積立期" : "取崩期",
        tsumitateCum,
        growthCum,
      });
    }
  }

  const finalAssets = yearly.length ? yearly[yearly.length - 1].total : 0;
  if (assetsAtRetire === null) assetsAtRetire = finalAssets;

  return {
    yearly,
    finalAssets,
    assetsAtRetire,
    depletionAge,
    peakAssets,
    inheritanceGap: finalAssets - inheritanceTarget,
    tsumitateCum,
    growthCum,
    growthMaxedAge,
    totalMaxedAge,
    lumpTruncations,
  };
}

// ---------- gold (純金積立) simulation ----------
function runGoldSimulation({ currentAge, deathAge, gold }) {
  const { currentGrams, pricePerGram, priceGrowthPct, monthlyYen, accumulateUntilAge } = gold;
  const totalMonths = Math.max(1, Math.round((deathAge - currentAge) * 12));
  const r = monthlyRate(priceGrowthPct);
  let grams = currentGrams;
  let price = pricePerGram;
  const yearly = [{ age: Math.round(currentAge), grams, price, value: grams * price }];
  let valueAtTarget = currentAge >= accumulateUntilAge ? grams * price : null;

  for (let m = 1; m <= totalMonths; m++) {
    const age = currentAge + m / 12;
    if (age < accumulateUntilAge && monthlyYen > 0 && price > 0) {
      grams += monthlyYen / price;
    }
    if (m % 12 === 0) {
      yearly.push({ age: Math.round(age), grams, price, value: grams * price });
    }
    if (valueAtTarget === null && age >= accumulateUntilAge) {
      valueAtTarget = grams * price;
    }
    price = price * (1 + r);
  }
  const finalValue = yearly.length ? yearly[yearly.length - 1].value : grams * price;
  if (valueAtTarget === null) valueAtTarget = finalValue;

  return { yearly, finalGrams: grams, finalValue, valueAtTarget };
}

// ---------- bank savings (銀行別) simulation ----------
function runBankSimulation({ currentAge, retireAge, deathAge, banks }) {
  const totalMonths = Math.max(1, Math.round((deathAge - currentAge) * 12));
  const balances = banks.map((b) => b.balance);
  const initialBankRow = { age: Math.round(currentAge), total: balances.reduce((sum, value) => sum + value, 0) };
  banks.forEach((b, i) => { initialBankRow[`bank_${i}`] = balances[i]; });
  const yearly = [initialBankRow];

  for (let m = 1; m <= totalMonths; m++) {
    const age = currentAge + m / 12;
    banks.forEach((b, i) => {
      const r = monthlyRate(b.interestPct || 0);
      balances[i] = balances[i] * (1 + r);
      if (age < retireAge) balances[i] += b.monthlyDeposit || 0;
    });
    if (m % 12 === 0) {
      const row = { age: Math.round(age), total: balances.reduce((s, v) => s + v, 0) };
      banks.forEach((b, i) => { row[`bank_${i}`] = balances[i]; });
      yearly.push(row);
    }
  }
  const totalNow = banks.reduce((s, b) => s + b.balance, 0);
  const totalFinal = yearly.length ? yearly[yearly.length - 1].total : totalNow;
  const totalAtRetire = yearly.find((y) => y.age >= retireAge)?.total ?? totalFinal;

  return { yearly, totalNow, totalAtRetire, totalFinal };
}

// ---------- individual stock portfolio (保有中の個別株) ----------
function runStockSim({ currentAge, deathAge, totalValue, returnPct }) {
  const totalMonths = Math.max(1, Math.round((deathAge - currentAge) * 12));
  const r = monthlyRate(returnPct);
  let value = totalValue;
  const yearly = [{ age: Math.round(currentAge), value }];
  for (let m = 1; m <= totalMonths; m++) {
    const age = currentAge + m / 12;
    if (m % 12 === 0) yearly.push({ age: Math.round(age), value });
    value = value * (1 + r);
  }
  return { yearly, finalValue: yearly.length ? yearly[yearly.length - 1].value : totalValue };
}

// ---------- loan repayment (借入金返済シミュレーション) ----------
function simpleMonthlyRate(annualPct) {
  return (annualPct || 0) / 1200;
}
function runLoanSimulation({ currentAge, deathAge, loans }) {
  const totalMonths = Math.max(1, Math.round((deathAge - currentAge) * 12));
  const balances = loans.map((l) => l.principal);
  const payoffAges = loans.map(() => null);
  const initialLoanRow = { age: Math.round(currentAge), total: balances.reduce((sum, value) => sum + value, 0) };
  loans.forEach((l, i) => { initialLoanRow[`loan_${i}`] = balances[i]; });
  const yearly = [initialLoanRow];

  for (let m = 1; m <= totalMonths; m++) {
    const age = currentAge + m / 12;
    loans.forEach((l, i) => {
      if (balances[i] > 0) {
        const interest = balances[i] * simpleMonthlyRate(l.annualRatePct);
        balances[i] = balances[i] + interest - (l.monthlyPayment || 0);
        if (balances[i] <= 0) {
          balances[i] = 0;
          if (payoffAges[i] === null) payoffAges[i] = age;
        }
      }
    });
    if (m % 12 === 0) {
      const row = { age: Math.round(age), total: balances.reduce((s, v) => s + v, 0) };
      loans.forEach((l, i) => { row[`loan_${i}`] = balances[i]; });
      yearly.push(row);
    }
  }
  const totalNow = loans.reduce((s, l) => s + l.principal, 0);
  const totalFinal = yearly.length ? yearly[yearly.length - 1].total : totalNow;

  return { yearly, totalNow, totalFinal, payoffAges };
}

// ---------- 生命保険：払込期間中の保険料を累計（将来資産から控除するため） ----------
function runInsuranceSimulation({ currentAge, deathAge, policies }) {
  const totalMonths = Math.max(1, Math.round((deathAge - currentAge) * 12));
  let cumulative = 0;
  const yearly = [{ age: Math.round(currentAge), total: 0 }];
  let cumulativeAtCurrentAge = 0;

  for (let m = 1; m <= totalMonths; m++) {
    const age = currentAge + m / 12;
    (policies || []).forEach((p) => {
      if (age >= p.premiumFromAge && age <= p.premiumToAge) {
        cumulative += p.monthlyPremium || 0;
      }
    });
    if (m % 12 === 0) yearly.push({ age: Math.round(age), total: cumulative });
  }
  const totalFinal = yearly.length ? yearly[yearly.length - 1].total : cumulative;
  return { yearly, totalFinal, cumulativeAtCurrentAge };
}

// ---------- 民間年金積立：積立期間で貯め、受給期間で取り崩す個人年金のシミュレーション ----------
function runPrivatePensionSimulation({ currentAge, deathAge, plans }) {
  const totalMonths = Math.max(1, Math.round((deathAge - currentAge) * 12));
  // 現在の年齢より前（例：35歳〜現在）にすでに積み立ててきた分を遡って開始残高に反映する。
  // ただし、証書などで実際の現在残高が手入力されている場合はそちらを優先する。
  const balances = (plans || []).map((pl) => {
    if (pl.currentBalance !== null && pl.currentBalance !== undefined) {
      return pl.currentBalance;
    }
    const priorContribEndAge = Math.min(pl.contribToAge, currentAge);
    const priorContribMonths = Math.max(0, Math.round((priorContribEndAge - pl.contribFromAge) * 12));
    return priorContribMonths * (pl.monthlyContribution || 0);
  });
  const initialPrivatePensionRow = { age: Math.round(currentAge), total: balances.reduce((sum, value) => sum + value, 0) };
  (plans || []).forEach((pl, i) => { initialPrivatePensionRow[`pension_${i}`] = balances[i]; });
  const yearly = [initialPrivatePensionRow];

  for (let m = 1; m <= totalMonths; m++) {
    const age = currentAge + m / 12;
    (plans || []).forEach((pl, i) => {
      if (age >= pl.contribFromAge && age <= pl.contribToAge) {
        balances[i] += pl.monthlyContribution || 0;
      }
      if (age >= pl.payoutFromAge && age <= pl.payoutToAge) {
        balances[i] = Math.max(0, balances[i] - (pl.monthlyPayout || 0));
      }
    });
    if (m % 12 === 0) {
      const row = { age: Math.round(age), total: balances.reduce((s, v) => s + v, 0) };
      (plans || []).forEach((pl, i) => { row[`pension_${i}`] = balances[i]; });
      yearly.push(row);
    }
  }
  const totalFinal = yearly.length ? yearly[yearly.length - 1].total : 0;
  return { yearly, totalFinal, totalNow: yearly[0] ? yearly[0].total : 0 };
}

// ---------- iDeCo（個人型確定拠出年金）シミュレーション ----------
// NISAの計算式（runSimulation）は変更していません。iDeCo専用の計算関数として独立させています。
// 受取開始年齢までは生活費に使わず増やすだけ。受取開始後は受取方法に応じて、
// 一時金は「使用可能資産へ一度だけ加算」、年金は「受取期間中、年間収入へ加算」します。
function levelMonthlyPayment(principal, annualRatePct, years) {
  const safePrincipal = Math.max(0, Number(principal) || 0);
  const safeYears = Math.max(1, Number(years) || 1);
  const months = Math.max(1, Math.round(safeYears * 12));
  const r = monthlyRate(Number(annualRatePct) || 0);
  if (Math.abs(r) < 1e-12) return safePrincipal / months;
  return (safePrincipal * r) / (1 - Math.pow(1 + r, -months));
}

function runIdecoSimulation({ currentAge, deathAge, ideco }) {
  const {
    currentValue, monthlyContribution, startAge, endAge, returnPct,
    payoutStartAge, payoutMethod, payoutYears, lumpPortionPct, payoutReturnPct,
  } = ideco;

  // 既存データ（新項目未設定の場合）でもエラーにならないよう安全な既定値を使用
  const safePayoutYears = Math.max(1, Number(payoutYears) || 10);
  const safeLumpPct = Math.min(1, Math.max(0, Number(lumpPortionPct ?? 50) / 100));
  const safePayoutReturn = Number(payoutReturnPct) || 0;

  const totalMonths = Math.max(1, Math.round((deathAge - currentAge) * 12));
  const accR = monthlyRate(returnPct);
  let value = currentValue || 0;
  let contributedSinceNow = 0;

  let valueAtPayout = null;
  let lumpAmount = 0;      // 受取開始年に一度だけ「使用可能資産」へ加算される金額
  let annualPayout = 0;    // 受取期間中、毎年「年間収入」へ加算される金額
  let payoutEndAge = payoutStartAge;

  const yearly = [{
    age: Math.round(currentAge),
    value,
    lumpAmount: 0,
    annualIncomeThisYear: 0,
  }];

  for (let m = 1; m <= totalMonths; m++) {
    const age = currentAge + m / 12;

    if (age < payoutStartAge) {
      // 受取開始前：掛金を積み立てて運用するだけ（生活費には使用しない）
      const contributing = age >= startAge && age < endAge;
      const contribution = contributing ? (monthlyContribution || 0) : 0;
      value = value * (1 + accR) + contribution;
      if (contributing) contributedSinceNow += contribution;
    } else {
      if (valueAtPayout === null) {
        valueAtPayout = value;
        if (payoutMethod === "lump") {
          lumpAmount = valueAtPayout;
          annualPayout = 0;
          value = 0;
          payoutEndAge = payoutStartAge;
        } else if (payoutMethod === "pension") {
          lumpAmount = 0;
          annualPayout = levelMonthlyPayment(valueAtPayout, safePayoutReturn, safePayoutYears) * 12;
          payoutEndAge = payoutStartAge + safePayoutYears;
        } else {
          // 併用：指定割合を一時金、残りを年金原資として指定年数で分割
          lumpAmount = valueAtPayout * safeLumpPct;
          const pensionBase = valueAtPayout * (1 - safeLumpPct);
          annualPayout = levelMonthlyPayment(pensionBase, safePayoutReturn, safePayoutYears) * 12;
          payoutEndAge = payoutStartAge + safePayoutYears;
          value = pensionBase;
        }
      }
      if (age < payoutEndAge && annualPayout > 0) {
        const payR = monthlyRate(safePayoutReturn);
        value = Math.max(0, value * (1 + payR) - annualPayout / 12);
      } else if (age >= payoutEndAge) {
        value = 0;
      }
    }

    if (m % 12 === 0) {
      const inPayoutPeriod = age >= payoutStartAge && age < payoutEndAge;
      yearly.push({
        age: Math.round(age),
        value,
        lumpAmount, // 一度だけ加算する金額（表示・加算判定は呼び出し側でage===payoutStartAgeの年にのみ使用）
        annualIncomeThisYear: inPayoutPeriod ? annualPayout : 0,
      });
    }
  }

  return {
    yearly,
    finalValue: yearly.length ? yearly[yearly.length - 1].value : value,
    valueAtPayout,
    lumpAmount,
    annualPayout,
    payoutStartAge,
    payoutEndAge,
    contributedSinceNow,
  };
}

// ---------- default watchlist (personal holdings + reference sectors) ----------
const DEFAULT_WATCHLIST = [
  { name: "東京エレクトロン", sector: "半導体製造装置", shares: 0, value: 0 },
  { name: "アドバンテスト", sector: "半導体製造装置", shares: 0, value: 0 },
  { name: "信越化学工業", sector: "半導体材料", shares: 0, value: 0 },
  { name: "東京応化工業", sector: "半導体材料", shares: 0, value: 0 },
  { name: "ローム", sector: "半導体", shares: 0, value: 0 },
  { name: "ファナック", sector: "FA・産業用ロボット", shares: 0, value: 0 },
  { name: "安川電機", sector: "FA・産業用ロボット", shares: 0, value: 0 },
  { name: "ダイキン工業", sector: "空調・FA関連", shares: 0, value: 0 },
  { name: "三菱重工業", sector: "重工業", shares: 0, value: 0 },
  { name: "INPEX", sector: "資源・エネルギー", shares: 0, value: 0 },
];

// ---------- UI atoms ----------
function Field({ label, unit, value, onChange, step = 1, min = 0, max, mono = true, disabled = false }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <div className="field-input-wrap">
        <input
          type="number"
          value={value}
          step={step}
          min={min}
          max={max}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          onFocus={(e) => e.target.select()}
          className={mono ? "mono" : ""}
        />
        {unit && <span className="field-unit">{unit}</span>}
      </div>
    </label>
  );
}

const formatAge = (age) => {
  const y = Math.floor(age + 1e-9);
  const m = Math.round((age - y) * 12);
  return m > 0 ? `${y}歳${m}ヶ月` : `${y}歳`;
};

// 年齢を「歳」と「ヶ月」の2つの入力欄に分けて、小数の年齢値として扱う
function AgeField({ label, value, onChange, disabled }) {
  const years = Math.floor(value + 1e-9);
  const months = Math.round((value - years) * 12);
  const commit = (y, m) => {
    let yy = y, mm = m;
    if (mm >= 12) { yy += Math.floor(mm / 12); mm = mm % 12; }
    if (mm < 0) { mm = 0; }
    onChange(yy + mm / 12);
  };
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <div style={{ display: "flex", gap: 6 }}>
        <div className="field-input-wrap" style={{ flex: 1 }}>
          <input type="number" className="mono" value={years} disabled={disabled} onChange={(e) => commit(Number(e.target.value), months)} onFocus={(e) => e.target.select()} />
          <span className="field-unit">歳</span>
        </div>
        <div className="field-input-wrap" style={{ flex: 1 }}>
          <input type="number" className="mono" min={0} max={11} value={months} disabled={disabled} onChange={(e) => commit(years, Number(e.target.value))} onFocus={(e) => e.target.select()} />
          <span className="field-unit">ヶ月</span>
        </div>
      </div>
    </label>
  );
}

// 追加フォーム用の小型「歳＋ヶ月」入力（2つの数値を親のuseState断片として管理）
function AgeYMInput({ years, months, onYears, onMonths, placeholder }) {
  const inputStyle = {
    width: "50%",
    background: "var(--panel-2)",
    border: "1px solid var(--line)",
    color: "var(--text)",
    padding: "7px 9px",
    borderRadius: 3,
    fontSize: 12,
    outline: "none",
  };
  return (
    <div style={{ display: "flex", gap: 4, flex: 1 }}>
      <input
        type="number" placeholder={`${placeholder}歳`} value={years}
        onChange={(e) => onYears(e.target.value)}
        onFocus={(e) => e.target.select()}
        style={inputStyle}
      />
      <input
        type="number" placeholder="ヶ月" min={0} max={11} value={months}
        onChange={(e) => onMonths(e.target.value)}
        onFocus={(e) => e.target.select()}
        style={inputStyle}
      />
    </div>
  );
}

// 常に表示されるラベル付き入力（placeholderは入力すると消えてしまい何の欄か分からなくなるため、
// ラベルを別要素として常時表示する）
function LabeledMiniInput({ label, value, onChange, type = "number" }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 10, color: "#7C8A90", marginBottom: 2 }}>{label}</div>
      <input type={type} value={value} onChange={onChange} style={{ width: "100%" }} />
    </div>
  );
}

// 保険の保障内容に、任意の項目名と金額を自由に追加できる小さな編集フォーム
function CustomBenefitEditor({ onAdd }) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  return (
    <div className="add-row" style={{ marginTop: 6 }}>
      <input placeholder="項目名（例：先進医療給付日数）" value={name} onChange={(e) => setName(e.target.value)} />
      <input placeholder="金額（円）" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <button
        className="add-btn"
        onClick={() => {
          if (!name.trim()) return;
          onAdd(name.trim(), Number(amount) || 0);
          setName("");
          setAmount("");
        }}
      >
        <Plus size={15} />
      </button>
    </div>
  );
}

const PIE_COLORS = ["#4FA8D8", "#D9A54F", "#8FBF7F", "#B08FD6", "#C2694F", "#7BC9E0", "#E6B0A6", "#6FA88A"];

// 銘柄別の内訳（金額を入れると割合を自動計算し、円グラフで表示）
// 円グラフ＋棒グラフ（同じitems/合計から生成するので常に連動する）。編集UIを持たない読み取り専用版。
function AllocationCharts({ items, height = 180 }) {
  const total = items.reduce((s, it) => s + (it.amount || 0), 0);
  if (total <= 0) return null;
  const renderPieLabel = ({ cx, cy, midAngle, outerRadius, percent, name, value }) => {
    const RADIAN = Math.PI / 180;
    const radius = outerRadius + 4;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    return (
      <text x={x} y={y} fill="#B7C2C7" fontSize={7.5} textAnchor={x > cx ? "start" : "end"} dominantBaseline="central">
        {`${name} ${yen(value)}（${(percent * 100).toFixed(0)}%）`}
      </text>
    );
  };
  return (
    <>
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={items} dataKey="amount" nameKey="name" cx="50%" cy="50%" outerRadius={65}
            label={renderPieLabel}
            labelLine={false}
          >
            {items.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
          </Pie>
          <Tooltip formatter={(v) => yen(v)} contentStyle={{ background: "#151C20", border: "1px solid #2A363C", fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
      <ResponsiveContainer width="100%" height={Math.max(90, items.length * 32)}>
        <BarChart
          data={items.map((it) => ({ name: it.name, pct: (it.amount / total) * 100, amount: it.amount }))}
          layout="vertical" margin={{ left: 8, right: 56, top: 4, bottom: 4 }}
        >
          <CartesianGrid stroke="#2A363C" strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" domain={[0, 100]} stroke="#7C8A90" fontSize={10} tickFormatter={(v) => `${v}%`} />
          <YAxis type="category" dataKey="name" stroke="#7C8A90" fontSize={10} width={90} />
          <Tooltip
            formatter={(v, n, p) => (n === "pct" ? [`${v.toFixed(1)}% (${yen(p.payload.amount)})`, "割合"] : [yen(v), n])}
            contentStyle={{ background: "#151C20", border: "1px solid #2A363C", fontSize: 12 }}
          />
          <Bar dataKey="pct" radius={[0, 2, 2, 0]}>
            {items.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
            <LabelList
              dataKey="amount"
              position="right"
              formatter={(v) => yen(v)}
              style={{ fill: "#E7ECEE", fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </>
  );
}

function AllocationBreakdown({ items, newItem, onNewItemChange, onAdd, onRemove, onUpdate }) {
  const total = items.reduce((s, it) => s + (it.amount || 0), 0);
  return (
    <div>
      {items.length > 0 && (
        <table className="watchlist" style={{ marginBottom: 8 }}>
          <thead><tr><th>銘柄</th><th>金額</th><th>割合</th><th></th></tr></thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i}>
                <td>
                  <input
                    className="inline-num" value={it.name}
                    onChange={(e) => onUpdate(i, "name", e.target.value)}
                  />
                </td>
                <td style={{ width: 96 }}>
                  <input
                    type="number" className="inline-num" value={it.amount}
                    onChange={(e) => onUpdate(i, "amount", Number(e.target.value))}
                  />
                </td>
                <td className="mono" style={{ width: 52 }}>{total > 0 ? `${((it.amount / total) * 100).toFixed(1)}%` : "—"}</td>
                <td style={{ width: 24 }}>
                  <button className="del-btn" onClick={() => onRemove(i)}><Trash2 size={13} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="add-row" style={{ marginBottom: total > 0 ? 8 : 0 }}>
        <input placeholder="銘柄名" value={newItem.name} onChange={(e) => onNewItemChange({ ...newItem, name: e.target.value })} />
        <input placeholder="金額（円）" type="number" value={newItem.amount} onChange={(e) => onNewItemChange({ ...newItem, amount: e.target.value })} />
        <button className="add-btn" onClick={onAdd}><Plus size={15} /></button>
      </div>
      <AllocationCharts items={items} />
    </div>
  );
}

function SectionTitle({ index, title, icon: Icon }) {
  return (
    <div className="section-title">
      <span className="section-index">{index}</span>
      <Icon size={15} strokeWidth={1.75} />
      <h2>{title}</h2>
    </div>
  );
}

function StatCard({ label, value, sub, tone }) {
  return (
    <div className={`stat-card ${tone || ""}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value mono">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

const STORAGE_KEY = "nisa-lifeplan-inputs-v1";
const SNAPSHOT_PREFIX = "snapshot:";
const todayKey = () => new Date().toISOString().slice(0, 10);
const formatDateLabel = (d) => {
  const dt = new Date(d + "T00:00:00");
  return `${dt.getFullYear()}/${dt.getMonth() + 1}/${dt.getDate()}`;
};

export default function NisaLifePlan({ onOpenBlog } = {}) {
  const [inputs, setInputs] = useState({
    userName: "",
    birthDate: "",
    currentAge: 35,
    retireAge: 65,
    deathAge: 90,
    currentAssets: 3000000,
    currentAssetHoldings: [],
    tsumitateHoldings: [],
    tsumitateHoldingsAsOfYears: "", tsumitateHoldingsAsOfMonths: "", // この残高の基準年齢（未入力なら現在の年齢＝追加計算なし）
    growthHoldings: [],
    growthHoldingsAsOfYears: "", growthHoldingsAsOfMonths: "", // この残高の基準年齢（未入力なら現在の年齢＝追加計算なし）
    tsumitateSchedule: [{ fromAge: 35, toAge: 65, monthlyYen: 100000 }],
    growthSchedule: [{ fromAge: 35, toAge: 65, monthlyYen: 50000 }],
    tsumitateUsed: 0,
    growthUsed: 0,
    lumpSums: [],
    lumpAllocation: [],
    tsumitateAllocation: [],
    growthAllocation: [],
    extraFundReturns: {},
    pensionMonthly: 150000,
    pensionSources: [],
    livingCostMonthly: 250000,
    postRetireReturn: 3,
    postRetireReturnAuto: true,
    healthBrackets: { b60: 150000, b70: 250000, b80: 400000 },
    inheritanceTarget: 10000000,
    inheritancePlans: [],
    gold: {
      currentGrams: 0,
      pricePerGram: 24000,
      priceGrowthPct: 3,
      priceGrowthPctAuto: true,
      monthlyYen: 20000,
      accumulateUntilAge: 65,
    },
    banks: [],
    stockReturnPct: 6,
    stockReturnPctAuto: true,
    ideco: {
      currentValue: 1000000,
      principalTotal: 900000,
      monthlyContribution: 23000,
      startAge: 35,
      endAge: 60,
      productName: "全世界株式",
      returnPct: 5,
      returnPctAuto: true,
      payoutStartAge: 60,
      payoutMethod: "lump", // "lump" | "pension" | "both"
      payoutYears: 10,
      lumpPortionPct: 50, // 併用時の一時金割合（%）
      payoutReturnPct: 0, // 受取中の想定運用利回り
      annualIncome: 0,
    },
    loans: [],
    insurancePolicies: [],
    privatePensionPlans: [],
  });
  const [watchlist, setWatchlist] = useState(DEFAULT_WATCHLIST);
  const [newStock, setNewStock] = useState({ name: "", sector: "" });
  const [newLump, setNewLump] = useState({ years: "", months: "", amount: "" });
  const [newTsumitateRange, setNewTsumitateRange] = useState({
    fromYears: "", fromMonths: "", toYears: "", toMonths: "", monthlyYen: "",
  });
  const [newGrowthRange, setNewGrowthRange] = useState({
    fromYears: "", fromMonths: "", toYears: "", toMonths: "", monthlyYen: "",
  });
  const [newBank, setNewBank] = useState({ name: "", balance: "", monthlyDeposit: "", interestPct: "" });
  const [newInheritance, setNewInheritance] = useState({ name: "", relation: "", amount: "" });
  const [newPensionSource, setNewPensionSource] = useState({ name: "", monthlyAmount: "" });
  const [newAssetHolding, setNewAssetHolding] = useState({ name: "", value: "" });
  const [newTsumitateHolding, setNewTsumitateHolding] = useState({ name: "", value: "" });
  const [newGrowthHolding, setNewGrowthHolding] = useState({ name: "", value: "" });
  const [newLoan, setNewLoan] = useState({ name: "", principal: "", annualRatePct: "", monthlyPayment: "" });
  const [newInsurance, setNewInsurance] = useState({
    name: "",
    premiumFromYears: "", premiumFromMonths: "",
    premiumToYears: "", premiumToMonths: "",
    monthlyPremium: "",
    coverageUntilYears: "", coverageUntilMonths: "",
    hospitalizationPerDay: "", hospitalizationDaysLimit: "", hospitalizationSurgery: "", daySurgery: "",
    radiationPerSession: "", advancedMedical: "", death: "",
  });
  const [newPension, setNewPension] = useState({
    name: "",
    contribFromYears: "", contribFromMonths: "",
    contribToYears: "", contribToMonths: "",
    monthlyContribution: "",
    payoutFromYears: "", payoutFromMonths: "",
    payoutToYears: "", payoutToMonths: "",
    monthlyPayout: "",
    currentBalance: "",
  });
  const [newLumpAllocItem, setNewLumpAllocItem] = useState({ name: "", amount: "" });
  const [newTsumitateAllocItem, setNewTsumitateAllocItem] = useState({ name: "", amount: "" });
  const [newGrowthAllocItem, setNewGrowthAllocItem] = useState({ name: "", amount: "" });
  const [loaded, setLoaded] = useState(false);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [saveStatus, setSaveStatus] = useState("idle"); // idle | saving | saved | error | unavailable
  const [saveMessage, setSaveMessage] = useState("");

  // load persisted inputs
  useEffect(() => {
    (async () => {
      if (!window.storage) {
        setSaveStatus("unavailable");
        setSaveMessage("このブラウザ/表示環境では自動保存が利用できません（Claudeのアーティファクトとして開いてください）");
        setLoaded(true);
        return;
      }
      try {
        const res = await window.storage.get(STORAGE_KEY, false);
        if (res?.value) {
          const parsed = JSON.parse(res.value);
          if (parsed.inputs) setInputs((prev) => ({ ...prev, ...parsed.inputs }));
          if (parsed.watchlist) setWatchlist(parsed.watchlist);
        }
      } catch (e) {
        // no saved data yet — this is normal on first use, not an error
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const [historyDebug, setHistoryDebug] = useState("");
  const [showBackup, setShowBackup] = useState(false);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState("");
  const [importOk, setImportOk] = useState(false);

  const backupText = useMemo(() => {
    try {
      return JSON.stringify({ inputs, watchlist }, null, 2);
    } catch (e) {
      return "";
    }
  }, [inputs, watchlist]);

  const importBackup = () => {
    setImportError("");
    setImportOk(false);
    try {
      const parsed = JSON.parse(importText);
      if (!parsed.inputs) throw new Error("inputsが見つかりません");
      setInputs((prev) => ({ ...prev, ...parsed.inputs }));
      if (parsed.watchlist) setWatchlist(parsed.watchlist);
      setImportOk(true);
    } catch (e) {
      setImportError("読み込みに失敗しました。正しいバックアップテキストか確認してください。（" + (e?.message || "") + "）");
    }
  };

  const refreshHistory = useCallback(async () => {
    if (!window.storage) {
      setHistoryDebug("ストレージ機能が利用できません（window.storage未対応の環境）");
      return;
    }
    try {
      const list = await window.storage.list(SNAPSHOT_PREFIX, false);
      const keys = list?.keys || [];
      setHistoryDebug(`ストレージ内のキー数: ${keys.length}`);
      if (!keys.length) return; // nothing stored yet — leave any locally-known entries as-is
      const entries = await Promise.all(
        keys.map(async (k) => {
          try {
            const res = await window.storage.get(k, false);
            return res?.value ? JSON.parse(res.value) : null;
          } catch (e) { return null; }
        })
      );
      const clean = entries.filter(Boolean);
      // merge with whatever is already in local state instead of replacing outright,
      // so an in-progress save from this session is never clobbered by a stale fetch
      setHistory((prev) => {
        const map = new Map(prev.map((h) => [h.date, h]));
        clean.forEach((h) => map.set(h.date, h));
        return [...map.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
      });
    } catch (e) {
      setHistoryDebug("履歴の取得中にエラー: " + (e?.message || "不明"));
    }
  }, []);

  const save = useCallback(async (nextInputs, nextWatchlist) => {
    if (!window.storage) {
      setSaveStatus("unavailable");
      setSaveMessage("このブラウザ/表示環境では自動保存が利用できません（Claudeのアーティファクトとして開いてください）");
      return;
    }
    setSaveStatus("saving");
    try {
      await window.storage.set(
        STORAGE_KEY,
        JSON.stringify({ inputs: nextInputs, watchlist: nextWatchlist }),
        false
      );
      // record (or overwrite) today's dated snapshot so history builds up day by day
      const date = todayKey();
      const bankTotal = (nextInputs.banks || []).reduce((s, b) => s + (b.balance || 0), 0);
      const snapshot = {
        date,
        currentAssets: (nextInputs.tsumitateHoldings || []).reduce((s, h) => s + (h.value || 0), 0)
          + (nextInputs.growthHoldings || []).reduce((s, h) => s + (h.value || 0), 0),
        tsumitateUsed: nextInputs.tsumitateUsed,
        growthUsed: nextInputs.growthUsed,
        goldGrams: nextInputs.gold?.currentGrams ?? 0,
        bankTotal,
        inputs: nextInputs,
        watchlist: nextWatchlist,
      };
      await window.storage.set(SNAPSHOT_PREFIX + date, JSON.stringify(snapshot), false);
      // upsert today's entry locally so the history list reflects it immediately
      // without re-fetching every stored snapshot on each keystroke
      setHistory((prev) => {
        const others = prev.filter((h) => h.date !== date);
        return [snapshot, ...others].sort((a, b) => (a.date < b.date ? 1 : -1));
      });
      setSaveStatus("saved");
      setSaveMessage(`最終保存: ${new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}`);
    } catch (e) {
      setSaveStatus("error");
      setSaveMessage("保存に失敗しました：" + (e?.message || "不明なエラー"));
    }
  }, []);

  useEffect(() => {
    if (loaded) save(inputs, watchlist);
  }, [inputs, watchlist, loaded, save]);

  useEffect(() => {
    if (loaded) refreshHistory();
  }, [loaded, refreshHistory]);

  const restoreSnapshot = (entry) => {
    if (entry.inputs) setInputs((prev) => ({ ...prev, ...entry.inputs }));
    if (entry.watchlist) setWatchlist(entry.watchlist);
  };
  const scrollToSimulator = () => {
    document.getElementById("simulator")?.scrollIntoView({ behavior: "smooth" });
  };
  const deleteSnapshot = async (date) => {
    try {
      await window.storage?.delete(SNAPSHOT_PREFIX + date, false);
      setHistory((prev) => prev.filter((h) => h.date !== date));
    } catch (e) {
      // ignore
    }
  };

  const update = (patch) => setInputs((prev) => ({ ...prev, ...patch }));
  const updateExtraFundReturn = (name, val) =>
    setInputs((prev) => ({ ...prev, extraFundReturns: { ...prev.extraFundReturns, [name]: val } }));
  const updateHealth = (key, val) =>
    setInputs((prev) => ({ ...prev, healthBrackets: { ...prev.healthBrackets, [key]: val } }));
  const updateGold = (key, val) =>
    setInputs((prev) => ({ ...prev, gold: { ...prev.gold, [key]: val } }));
  const updateIdeco = (key, val) =>
    setInputs((prev) => ({ ...prev, ideco: { ...prev.ideco, [key]: val } }));

  // 積立・成長投資枠・一括投資の銘柄別内訳、および「つみたて/成長投資枠：実際の残高」に入力された銘柄を集約して、
  // そのままスライダー（自動計算・操作不可）として表示する
  const allBreakdownItems = [
    ...(inputs.lumpAllocation || []),
    ...(inputs.tsumitateAllocation || []),
    ...(inputs.growthAllocation || []),
    ...(inputs.tsumitateHoldings || []).map((h) => ({ name: h.name, amount: h.value })),
    ...(inputs.growthHoldings || []).map((h) => ({ name: h.name, amount: h.value })),
  ];
  const fundNames = [...new Set(allBreakdownItems.filter((it) => it.name && it.name.trim()).map((it) => it.name))];
  const fundAmounts = fundNames.reduce((acc, name) => {
    acc[name] = allBreakdownItems.reduce((s, it) => (it.name === name ? s + (it.amount || 0) : s), 0);
    return acc;
  }, {});
  const combinedGrandTotal = fundNames.reduce((s, n) => s + fundAmounts[n], 0);
  const dynamicFunds = combinedGrandTotal > 0
    ? fundNames.map((name) => ({
        id: name,
        pct: (fundAmounts[name] / combinedGrandTotal) * 100,
        returnPct: (inputs.extraFundReturns && inputs.extraFundReturns[name] !== undefined) ? inputs.extraFundReturns[name] : guessDefaultReturn(name),
      }))
    : [];

  // 生年月日が入力されていれば、今日時点での正確な年齢（日単位）をそこから自動計算し、
  // 現在の年齢として全体のシミュレーションに反映する
  const preciseAge = useMemo(() => computeAgeFromBirthDate(inputs.birthDate), [inputs.birthDate]);
  const effectiveCurrentAge = preciseAge ? preciseAge.decimal : inputs.currentAge;

  // 銘柄名から、その銘柄の想定年率（利回り）を取得する（銘柄別内訳のスライダーで手動調整した値があればそちらを優先）
  const getFundReturnPct = (name) =>
    (inputs.extraFundReturns && inputs.extraFundReturns[name] !== undefined) ? inputs.extraFundReturns[name] : guessDefaultReturn(name);

  // カテゴリ（つみたて／成長／一括投資）の銘柄別内訳から、加重平均の想定利回りを算出する
  // （経過分の積立額を複利で運用成長させる際の利回りとして使う。内訳が空ならフォールバック値を使う）
  const categoryWeightedReturn = (allocationList, fallback) => {
    const named = (allocationList || []).filter((it) => it.name && it.name.trim());
    if (!named.length) return fallback;
    const total = named.reduce((s, it) => s + (it.amount || 0), 0);
    if (total <= 0) return fallback;
    return named.reduce((s, it) => s + (it.amount / total) * getFundReturnPct(it.name), 0);
  };

  // 一括投資：それぞれの投資日から現在まで、想定利回りで複利運用したものとして評価額を計算する
  // （投資した金額をそのまま元本として加え、その時点から利回りを積み上げていく）
  const lumpScheduleReturn = categoryWeightedReturn(inputs.lumpAllocation, guessDefaultReturn("全世界株式"));
  const lumpElapsedTotal = compoundedLumpSumValue(inputs.lumpSums, effectiveCurrentAge, lumpScheduleReturn);

  const autoHoldingRowsFor = (allocationList, elapsedTotal, categoryLabel) => {
    const named = (allocationList || []).filter((it) => it.name && it.name.trim());
    if (named.length === 0) return [];
    const listTotal = named.reduce((s, it) => s + (it.amount || 0), 0);
    return named.map((it) => ({
      name: `${it.name}（${categoryLabel}）`,
      value: listTotal > 0 ? (it.amount / listTotal) * elapsedTotal : 0,
    }));
  };

  // 「実際の残高」の基準年齢（年・月の入力から小数年齢に変換。未入力なら null＝現在の年齢として扱う＝追加計算なし）
  const tsumitateHoldingsAsOfAge = (inputs.tsumitateHoldingsAsOfYears !== "" && inputs.tsumitateHoldingsAsOfYears !== undefined && inputs.tsumitateHoldingsAsOfYears !== null)
    ? Number(inputs.tsumitateHoldingsAsOfYears || 0) + Number(inputs.tsumitateHoldingsAsOfMonths || 0) / 12
    : null;
  const growthHoldingsAsOfAge = (inputs.growthHoldingsAsOfYears !== "" && inputs.growthHoldingsAsOfYears !== undefined && inputs.growthHoldingsAsOfYears !== null)
    ? Number(inputs.growthHoldingsAsOfYears || 0) + Number(inputs.growthHoldingsAsOfMonths || 0) / 12
    : null;

  // 手入力した「実際の残高」（＝基準年齢時点で実際にいくらだったかという金額）を、
  // その銘柄の想定利回りで基準年齢〜現在まで複利成長させる（基準年齢が未入力ならそのままの金額を使う）
  const tsumitateHoldingsManualTotal = (inputs.tsumitateHoldings || []).reduce((s, h) => {
    const rate = getFundReturnPct(h.name);
    return s + compoundPrincipal(h.value || 0, tsumitateHoldingsAsOfAge, effectiveCurrentAge, rate);
  }, 0);
  const growthHoldingsManualTotal = (inputs.growthHoldings || []).reduce((s, h) => {
    const rate = getFundReturnPct(h.name);
    return s + compoundPrincipal(h.value || 0, growthHoldingsAsOfAge, effectiveCurrentAge, rate);
  }, 0);

  // つみたて・成長投資枠のスケジュール（毎月投資額）に沿って、これまで実際に引き落とされてきたはずの金額を、
  // その都度（引き落とされた月ごとに）想定利回りで複利運用したものとして自動計算する
  // （一括投資と同様、これは基準年齢の入力有無に関わらず常に自動で計算される。手入力の「実際の残高」とは別建てで加算されるため、
  // 　手入力欄にはスケジュールで既に積み立てられている分を重複して含めないよう入力してください）
  const tsumitateScheduleReturn = categoryWeightedReturn(inputs.tsumitateAllocation, guessDefaultReturn("全世界株式"));
  const growthScheduleReturn = categoryWeightedReturn(inputs.growthAllocation, guessDefaultReturn("全世界株式"));
  const tsumitateCatchUp = compoundedElapsedValue(inputs.tsumitateSchedule, 0, effectiveCurrentAge, tsumitateScheduleReturn);
  const growthCatchUp = compoundedElapsedValue(inputs.growthSchedule, 0, effectiveCurrentAge, growthScheduleReturn);

  const tsumitateHoldingsTotal = tsumitateHoldingsManualTotal + tsumitateCatchUp;
  const growthHoldingsTotal = growthHoldingsManualTotal + growthCatchUp;

  // 時価（自動計算）の一覧：一括投資に加え、つみたて・成長投資枠のスケジュール分もまとめて銘柄別に表示する
  const autoHoldingRows = [
    ...autoHoldingRowsFor(inputs.tsumitateAllocation, tsumitateCatchUp, "つみたてスケジュール分"),
    ...autoHoldingRowsFor(inputs.growthAllocation, growthCatchUp, "成長投資枠スケジュール分"),
    ...autoHoldingRowsFor(inputs.lumpAllocation, lumpElapsedTotal, "一括投資"),
  ];
  const autoHoldingsTotal = lumpElapsedTotal;

  // 現在のNISA資産は手入力せず、つみたて/成長投資枠の実際の残高（＋基準年齢以降の複利成長分）＋一括投資の自動計算分から完全に自動算出する
  const currentAssetHoldingsTotal = tsumitateHoldingsTotal + growthHoldingsTotal + autoHoldingsTotal;
  const effectiveCurrentAssets = currentAssetHoldingsTotal;

  // 退職後の想定利回りを、現役時代（銘柄別スライダー）の加重平均利回りの半分から自動で仮設定する
  const weightedAvgReturn = dynamicFunds.reduce((s, f) => s + (f.pct / 100) * f.returnPct, 0);
  const autoPostRetireReturn = dynamicFunds.length > 0 ? Math.round((weightedAvgReturn / 2) * 10) / 10 : inputs.postRetireReturn;
  const effectivePostRetireReturn = (inputs.postRetireReturnAuto && dynamicFunds.length > 0) ? autoPostRetireReturn : inputs.postRetireReturn;

  // iDeCo：NISAとは別の専用計算関数（受取前は生活費に使わず増やすだけ）。
  // ここで先に受取額を算出し、年金・併用の場合のみ「追加収入」としてNISA側の取り崩し計算へ渡す。
  const effectiveIdecoReturn = inputs.ideco.returnPctAuto ? guessDefaultReturn(inputs.ideco.productName) : inputs.ideco.returnPct;
  const idecoSim = useMemo(
    () => runIdecoSimulation({
      currentAge: effectiveCurrentAge, deathAge: inputs.deathAge,
      ideco: { ...inputs.ideco, returnPct: effectiveIdecoReturn },
    }),
    [effectiveCurrentAge, inputs.deathAge, inputs.ideco, effectiveIdecoReturn]
  );
  const idecoPayoutMethod = inputs.ideco.payoutMethod;
  const getIdecoMonthlyIncome = useMemo(() => {
    if (idecoPayoutMethod !== "pension" && idecoPayoutMethod !== "both") return null;
    return (age) => (age >= idecoSim.payoutStartAge && age < idecoSim.payoutEndAge) ? idecoSim.annualPayout / 12 : 0;
  }, [idecoPayoutMethod, idecoSim.payoutStartAge, idecoSim.payoutEndAge, idecoSim.annualPayout]);

  const getIdecoSpendableLump = useMemo(() => {
    if (idecoPayoutMethod !== "lump" && idecoPayoutMethod !== "both") return null;
    // 月次シミュレーションのうち、受取開始月にだけ一時金を返す。
    return (age) => Math.abs(age - idecoSim.payoutStartAge) < (1 / 24) ? idecoSim.lumpAmount : 0;
  }, [idecoPayoutMethod, idecoSim.payoutStartAge, idecoSim.lumpAmount]);

  // 年金受給見込み額：国民年金・企業年金基金など複数の項目を追加すると、その合計が自動的に使われる
  const pensionSourcesTotal = inputs.pensionSources.reduce((s, p) => s + (p.monthlyAmount || 0), 0);
  const effectivePensionMonthly = inputs.pensionSources.length > 0 ? pensionSourcesTotal : inputs.pensionMonthly;

  const effectiveInputs = useMemo(
    () => ({
      ...inputs, dynamicFunds, currentAge: effectiveCurrentAge, currentAssets: effectiveCurrentAssets,
      postRetireReturn: effectivePostRetireReturn,
      extraRetirementIncomeMonthly: getIdecoMonthlyIncome,
      extraSpendableLumpSum: getIdecoSpendableLump,
      pensionMonthly: effectivePensionMonthly,
    }),
    [inputs, JSON.stringify(dynamicFunds), effectiveCurrentAge, effectiveCurrentAssets, effectivePostRetireReturn, getIdecoMonthlyIncome, getIdecoSpendableLump, effectivePensionMonthly]
  );

  const sim = useMemo(() => runSimulation(effectiveInputs), [effectiveInputs]);
  const autoGoldReturn = guessDefaultReturn("金");
  const effectiveGoldReturnPct = inputs.gold.priceGrowthPctAuto ? autoGoldReturn : inputs.gold.priceGrowthPct;
  const goldSim = useMemo(
    () => runGoldSimulation({ currentAge: effectiveCurrentAge, deathAge: inputs.deathAge, gold: { ...inputs.gold, priceGrowthPct: effectiveGoldReturnPct } }),
    [effectiveCurrentAge, inputs.deathAge, inputs.gold, effectiveGoldReturnPct]
  );
  const bankSim = useMemo(
    () => runBankSimulation({
      currentAge: effectiveCurrentAge, retireAge: inputs.retireAge, deathAge: inputs.deathAge, banks: inputs.banks,
    }),
    [effectiveCurrentAge, inputs.retireAge, inputs.deathAge, inputs.banks]
  );
  const stockTotalNow = useMemo(() => watchlist.reduce((s, w) => s + (w.value || 0), 0), [watchlist]);
  const stockAllocationItems = useMemo(
    () => watchlist.filter((w) => (w.value || 0) > 0).map((w) => ({ name: w.name, amount: w.value })),
    [watchlist]
  );
  const autoStockReturn = useMemo(() => {
    const held = watchlist.filter((w) => (w.value || 0) > 0);
    const total = held.reduce((s, w) => s + w.value, 0);
    if (total <= 0) return inputs.stockReturnPct;
    return Math.round((held.reduce((s, w) => s + (w.value / total) * guessDefaultReturn(w.name), 0)) * 10) / 10;
  }, [watchlist, inputs.stockReturnPct]);
  const effectiveStockReturnPct = inputs.stockReturnPctAuto ? autoStockReturn : inputs.stockReturnPct;
  const stockSim = useMemo(
    () => runStockSim({ currentAge: effectiveCurrentAge, deathAge: inputs.deathAge, totalValue: stockTotalNow, returnPct: effectiveStockReturnPct }),
    [effectiveCurrentAge, inputs.deathAge, stockTotalNow, effectiveStockReturnPct]
  );
  const loanSim = useMemo(
    () => runLoanSimulation({ currentAge: effectiveCurrentAge, deathAge: inputs.deathAge, loans: inputs.loans }),
    [effectiveCurrentAge, inputs.deathAge, inputs.loans]
  );
  const insuranceSim = useMemo(
    () => runInsuranceSimulation({ currentAge: effectiveCurrentAge, deathAge: inputs.deathAge, policies: inputs.insurancePolicies }),
    [effectiveCurrentAge, inputs.deathAge, inputs.insurancePolicies]
  );
  const pensionSim = useMemo(
    () => runPrivatePensionSimulation({ currentAge: effectiveCurrentAge, deathAge: inputs.deathAge, plans: inputs.privatePensionPlans }),
    [effectiveCurrentAge, inputs.deathAge, inputs.privatePensionPlans]
  );

  // iDeCo 自動計算項目
  const idecoAnnualContribution = (inputs.ideco.monthlyContribution || 0) * 12;
  const idecoRemainingContribYears = Math.max(0, inputs.ideco.endAge - Math.max(inputs.ideco.startAge, effectiveCurrentAge));
  const idecoContributionTotal = (inputs.ideco.principalTotal || 0) + idecoAnnualContribution * idecoRemainingContribYears;
  const idecoInvestmentGain = (inputs.ideco.currentValue || 0) - (inputs.ideco.principalTotal || 0);
  // iDeCo 節税シミュレーション（概算）
  const idecoMarginalTaxRate = estimateMarginalTaxRate(inputs.ideco.annualIncome);
  const idecoAnnualTaxSaving = idecoAnnualContribution * idecoMarginalTaxRate;
  const idecoCumulativeTaxSaving = idecoAnnualTaxSaving * idecoRemainingContribYears;

  // merge NISA + gold + bank + stocks + 民間年金積立 + iDeCo一時金 - loans - 保険料累計 into one net-worth-by-age series for the combined chart
  const netWorthYearly = useMemo(() => {
    return sim.yearly.map((row, i) => {
      const goldValue = goldSim.yearly[i]?.value ?? goldSim.finalValue;
      const bankValue = bankSim.yearly[i]?.total ?? bankSim.totalFinal;
      const stockValue = stockSim.yearly[i]?.value ?? stockSim.finalValue;
      const loanValue = loanSim.yearly[i]?.total ?? loanSim.totalFinal;
      const insuranceValue = insuranceSim.yearly[i]?.total ?? insuranceSim.totalFinal;
      const pensionValue = pensionSim.yearly[i]?.total ?? pensionSim.totalFinal;
      const idecoRow = idecoSim.yearly[i];
      // 受取開始前および年金受取中に残っている、まだロックされたiDeCo残高。
      // 一時金部分は受取開始月にrunSimulation側へ一度だけ移され、row.totalへ含まれる。
      const idecoLockedValue = idecoRow ? idecoRow.value : idecoSim.finalValue;
      const spendableNetWorth = row.total + goldValue + bankValue + stockValue + pensionValue - loanValue - insuranceValue;
      return {
        ...row, goldValue, bankValue, stockValue, loanValue, insuranceValue, pensionValue,
        idecoLockedValue,
        spendableNetWorth,
        netWorth: spendableNetWorth + idecoLockedValue,
      };
    });
  }, [sim, goldSim, bankSim, stockSim, loanSim, insuranceSim, pensionSim, idecoSim]);
  const netWorthFinal = netWorthYearly.length ? netWorthYearly[netWorthYearly.length - 1].netWorth : sim.finalAssets;
  const inheritanceTotal = inputs.inheritancePlans.reduce((s, p) => s + (p.amount || 0), 0);
  const effectiveInheritanceTarget = inputs.inheritancePlans.length > 0 ? inheritanceTotal : inputs.inheritanceTarget;
  const netInheritanceGap = netWorthFinal - effectiveInheritanceTarget;

  const loanBreakdownByAge = useMemo(() => {
    const ages = [
      { label: "現在", age: effectiveCurrentAge },
      { label: `${inputs.retireAge}歳`, age: inputs.retireAge },
      { label: `${inputs.deathAge}歳`, age: inputs.deathAge },
    ];
    return inputs.loans.map((l, i) => {
      const row = { name: l.name };
      ages.forEach(({ label, age }) => {
        const yr = loanSim.yearly.find((y) => y.age >= age) || loanSim.yearly[loanSim.yearly.length - 1];
        row[label] = Math.round(yr ? yr[`loan_${i}`] : l.principal);
      });
      return row;
    });
  }, [inputs.loans, effectiveCurrentAge, inputs.retireAge, inputs.deathAge, loanSim]);

  const bankBreakdownByAge = useMemo(() => {
    const ages = [
      { label: "現在", age: effectiveCurrentAge },
      { label: `${inputs.retireAge}歳`, age: inputs.retireAge },
      { label: `${inputs.deathAge}歳`, age: inputs.deathAge },
    ];
    return inputs.banks.map((b, i) => {
      const row = { name: b.name };
      ages.forEach(({ label, age }) => {
        const yr = bankSim.yearly.find((y) => y.age >= age) || bankSim.yearly[bankSim.yearly.length - 1];
        row[label] = Math.round(yr ? yr[`bank_${i}`] : b.balance);
      });
      return row;
    });
  }, [inputs.banks, effectiveCurrentAge, inputs.retireAge, inputs.deathAge, bankSim]);

  const fundBreakdownAtRetire = useMemo(() => {
    const row = sim.yearly.find((y) => y.age >= inputs.retireAge) || sim.yearly[sim.yearly.length - 1];
    if (!row || !row.funds) return [];
    return dynamicFunds.map((f, i) => ({
      name: f.id,
      value: Math.round(row.funds[f.id] || 0),
      color: PIE_COLORS[i % PIE_COLORS.length],
    }));
  }, [sim, inputs.retireAge, JSON.stringify(dynamicFunds)]);

  const addBank = () => {
    const balance = Number(newBank.balance) || 0;
    if (!newBank.name.trim()) return;
    setInputs((prev) => ({
      ...prev,
      banks: [...prev.banks, {
        name: newBank.name.trim(),
        balance,
        monthlyDeposit: Number(newBank.monthlyDeposit) || 0,
        interestPct: Number(newBank.interestPct) || 0,
      }],
    }));
    setNewBank({ name: "", balance: "", monthlyDeposit: "", interestPct: "" });
  };
  const removeBank = (idx) => setInputs((prev) => ({ ...prev, banks: prev.banks.filter((_, i) => i !== idx) }));

  const addInheritancePlan = () => {
    if (!newInheritance.name.trim()) return;
    setInputs((prev) => ({
      ...prev,
      inheritancePlans: [...prev.inheritancePlans, {
        name: newInheritance.name.trim(),
        relation: newInheritance.relation.trim(),
        amount: Number(newInheritance.amount) || 0,
      }],
    }));
    setNewInheritance({ name: "", relation: "", amount: "" });
  };
  const removeInheritancePlan = (idx) =>
    setInputs((prev) => ({ ...prev, inheritancePlans: prev.inheritancePlans.filter((_, i) => i !== idx) }));

  const addPensionSource = () => {
    if (!newPensionSource.name.trim()) return;
    setInputs((prev) => ({
      ...prev,
      pensionSources: [...prev.pensionSources, {
        name: newPensionSource.name.trim(),
        monthlyAmount: Number(newPensionSource.monthlyAmount) || 0,
      }],
    }));
    setNewPensionSource({ name: "", monthlyAmount: "" });
  };
  const removePensionSource = (idx) =>
    setInputs((prev) => ({ ...prev, pensionSources: prev.pensionSources.filter((_, i) => i !== idx) }));

  const addAssetHolding = () => {
    if (!newAssetHolding.name.trim()) return;
    setInputs((prev) => ({
      ...prev,
      currentAssetHoldings: [...prev.currentAssetHoldings, {
        name: newAssetHolding.name.trim(),
        value: Number(newAssetHolding.value) || 0,
      }],
    }));
    setNewAssetHolding({ name: "", value: "" });
  };
  const removeAssetHolding = (idx) =>
    setInputs((prev) => ({ ...prev, currentAssetHoldings: prev.currentAssetHoldings.filter((_, i) => i !== idx) }));

  const addTsumitateHolding = () => {
    if (!newTsumitateHolding.name.trim()) return;
    setInputs((prev) => ({
      ...prev,
      tsumitateHoldings: [...prev.tsumitateHoldings, {
        name: newTsumitateHolding.name.trim(),
        value: Number(newTsumitateHolding.value) || 0,
      }],
    }));
    setNewTsumitateHolding({ name: "", value: "" });
  };
  const removeTsumitateHolding = (idx) =>
    setInputs((prev) => ({ ...prev, tsumitateHoldings: prev.tsumitateHoldings.filter((_, i) => i !== idx) }));

  const addGrowthHolding = () => {
    if (!newGrowthHolding.name.trim()) return;
    setInputs((prev) => ({
      ...prev,
      growthHoldings: [...prev.growthHoldings, {
        name: newGrowthHolding.name.trim(),
        value: Number(newGrowthHolding.value) || 0,
      }],
    }));
    setNewGrowthHolding({ name: "", value: "" });
  };
  const removeGrowthHolding = (idx) =>
    setInputs((prev) => ({ ...prev, growthHoldings: prev.growthHoldings.filter((_, i) => i !== idx) }));

  const addLoan = () => {
    const principal = Number(newLoan.principal) || 0;
    if (!newLoan.name.trim() || !principal) return;
    setInputs((prev) => ({
      ...prev,
      loans: [...prev.loans, {
        name: newLoan.name.trim(),
        principal,
        annualRatePct: Number(newLoan.annualRatePct) || 0,
        monthlyPayment: Number(newLoan.monthlyPayment) || 0,
      }],
    }));
    setNewLoan({ name: "", principal: "", annualRatePct: "", monthlyPayment: "" });
  };
  const removeLoan = (idx) => setInputs((prev) => ({ ...prev, loans: prev.loans.filter((_, i) => i !== idx) }));

  const addInsurance = () => {
    const ni = newInsurance;
    if (!ni.name.trim() || !ni.premiumFromYears || !ni.premiumToYears || !ni.coverageUntilYears) return;
    const premiumFromAge = Number(ni.premiumFromYears || 0) + Number(ni.premiumFromMonths || 0) / 12;
    const premiumToAge = Number(ni.premiumToYears || 0) + Number(ni.premiumToMonths || 0) / 12;
    const coverageUntilAge = Number(ni.coverageUntilYears || 0) + Number(ni.coverageUntilMonths || 0) / 12;
    setInputs((prev) => ({
      ...prev,
      insurancePolicies: [...prev.insurancePolicies, {
        name: ni.name.trim(),
        premiumFromAge, premiumToAge,
        monthlyPremium: Number(ni.monthlyPremium) || 0,
        coverageUntilAge,
        benefits: {
          hospitalizationPerDay: Number(ni.hospitalizationPerDay) || 0,
          hospitalizationDaysLimit: Number(ni.hospitalizationDaysLimit) || 0,
          hospitalizationSurgery: Number(ni.hospitalizationSurgery) || 0,
          daySurgery: Number(ni.daySurgery) || 0,
          radiationPerSession: Number(ni.radiationPerSession) || 0,
          advancedMedical: Number(ni.advancedMedical) || 0,
          death: Number(ni.death) || 0,
        },
        customBenefits: [],
      }],
    }));
    setNewInsurance({
      name: "",
      premiumFromYears: "", premiumFromMonths: "",
      premiumToYears: "", premiumToMonths: "",
      monthlyPremium: "",
      coverageUntilYears: "", coverageUntilMonths: "",
      hospitalizationPerDay: "", hospitalizationDaysLimit: "", hospitalizationSurgery: "", daySurgery: "",
      radiationPerSession: "", advancedMedical: "", death: "",
    });
  };
  const addCustomBenefit = (policyIdx, name, amount) =>
    setInputs((prev) => ({
      ...prev,
      insurancePolicies: prev.insurancePolicies.map((p, i) =>
        i === policyIdx ? { ...p, customBenefits: [...(p.customBenefits || []), { name, amount }] } : p
      ),
    }));
  const removeCustomBenefit = (policyIdx, itemIdx) =>
    setInputs((prev) => ({
      ...prev,
      insurancePolicies: prev.insurancePolicies.map((p, i) =>
        i === policyIdx ? { ...p, customBenefits: p.customBenefits.filter((_, j) => j !== itemIdx) } : p
      ),
    }));

  const addPension = () => {
    const np = newPension;
    if (!np.name.trim() || !np.contribFromYears || !np.contribToYears || !np.payoutFromYears || !np.payoutToYears) return;
    const contribFromAge = Number(np.contribFromYears || 0) + Number(np.contribFromMonths || 0) / 12;
    const contribToAge = Number(np.contribToYears || 0) + Number(np.contribToMonths || 0) / 12;
    const payoutFromAge = Number(np.payoutFromYears || 0) + Number(np.payoutFromMonths || 0) / 12;
    const payoutToAge = Number(np.payoutToYears || 0) + Number(np.payoutToMonths || 0) / 12;
    setInputs((prev) => ({
      ...prev,
      privatePensionPlans: [...prev.privatePensionPlans, {
        name: np.name.trim(),
        contribFromAge, contribToAge,
        monthlyContribution: Number(np.monthlyContribution) || 0,
        payoutFromAge, payoutToAge,
        monthlyPayout: Number(np.monthlyPayout) || 0,
        // 任意：現在すでにある実際の残高（証書記載の解約返戻金額など）。未入力なら積立実績から自動概算する。
        currentBalance: np.currentBalance === "" ? null : Number(np.currentBalance) || 0,
      }],
    }));
    setNewPension({
      name: "",
      contribFromYears: "", contribFromMonths: "",
      contribToYears: "", contribToMonths: "",
      monthlyContribution: "",
      payoutFromYears: "", payoutFromMonths: "",
      payoutToYears: "", payoutToMonths: "",
      monthlyPayout: "",
      currentBalance: "",
    });
  };
  const removePension = (idx) =>
    setInputs((prev) => ({ ...prev, privatePensionPlans: prev.privatePensionPlans.filter((_, i) => i !== idx) }));
  const removeInsurance = (idx) =>
    setInputs((prev) => ({ ...prev, insurancePolicies: prev.insurancePolicies.filter((_, i) => i !== idx) }));

  // 汎用：銘柄別内訳リスト（一括投資／つみたて／成長投資枠で共用）の追加・削除・編集
  const addAllocationItem = (field, newItem, resetNewItem) => {
    if (!newItem.name.trim()) return;
    setInputs((prev) => ({
      ...prev,
      [field]: [...prev[field], { name: newItem.name.trim(), amount: Number(newItem.amount) || 0 }],
    }));
    resetNewItem({ name: "", amount: "" });
  };
  const removeAllocationItem = (field, idx) =>
    setInputs((prev) => ({ ...prev, [field]: prev[field].filter((_, i) => i !== idx) }));
  const updateAllocationItem = (field, idx, key, val) =>
    setInputs((prev) => ({
      ...prev,
      [field]: prev[field].map((it, i) => (i === idx ? { ...it, [key]: val } : it)),
    }));

  const addStock = () => {
    if (!newStock.name.trim()) return;
    setWatchlist((prev) => [...prev, { name: newStock.name.trim(), sector: newStock.sector.trim() || "未分類", shares: 0, value: 0 }]);
    setNewStock({ name: "", sector: "" });
  };
  const removeStock = (idx) => setWatchlist((prev) => prev.filter((_, i) => i !== idx));
  const updateStockField = (idx, field, val) =>
    setWatchlist((prev) => prev.map((s, i) => (i === idx ? { ...s, [field]: val } : s)));

  const addLump = () => {
    const age = Number(newLump.years || 0) + Number(newLump.months || 0) / 12;
    const amount = Number(newLump.amount);
    if (!newLump.years || !amount) return;
    setInputs((prev) => ({
      ...prev,
      lumpSums: [...prev.lumpSums, { age, amount }].sort((a, b) => a.age - b.age),
    }));
    setNewLump({ years: "", months: "", amount: "" });
  };
  const removeLump = (idx) =>
    setInputs((prev) => ({ ...prev, lumpSums: prev.lumpSums.filter((_, i) => i !== idx) }));

  const addTsumitateRange = () => {
    const fromAge = Number(newTsumitateRange.fromYears || 0) + Number(newTsumitateRange.fromMonths || 0) / 12;
    const toAge = Number(newTsumitateRange.toYears || 0) + Number(newTsumitateRange.toMonths || 0) / 12;
    const monthlyYen = Number(newTsumitateRange.monthlyYen);
    if (!newTsumitateRange.fromYears || !newTsumitateRange.toYears || toAge < fromAge || !monthlyYen) return;
    if (tsumitateHoldingsAsOfAge !== null && fromAge < tsumitateHoldingsAsOfAge) {
      window.alert(
        `スケジュールの開始年齢が、上の「この残高時点の基準年齢」（${formatAge(tsumitateHoldingsAsOfAge)}）より前になっています。\n` +
        `基準年齢より前の期間は、既に「実際の残高」に反映されているはずのため、開始年齢は基準年齢と同じかそれより後にしてください。`
      );
      return;
    }
    setInputs((prev) => ({
      ...prev,
      tsumitateSchedule: [...prev.tsumitateSchedule, { fromAge, toAge, monthlyYen }].sort((a, b) => a.fromAge - b.fromAge),
    }));
    setNewTsumitateRange({ fromYears: "", fromMonths: "", toYears: "", toMonths: "", monthlyYen: "" });
  };
  const removeTsumitateRange = (idx) =>
    setInputs((prev) => ({ ...prev, tsumitateSchedule: prev.tsumitateSchedule.filter((_, i) => i !== idx) }));

  const addGrowthRange = () => {
    const fromAge = Number(newGrowthRange.fromYears || 0) + Number(newGrowthRange.fromMonths || 0) / 12;
    const toAge = Number(newGrowthRange.toYears || 0) + Number(newGrowthRange.toMonths || 0) / 12;
    const monthlyYen = Number(newGrowthRange.monthlyYen);
    if (!newGrowthRange.fromYears || !newGrowthRange.toYears || toAge < fromAge || !monthlyYen) return;
    if (growthHoldingsAsOfAge !== null && fromAge < growthHoldingsAsOfAge) {
      window.alert(
        `スケジュールの開始年齢が、上の「この残高時点の基準年齢」（${formatAge(growthHoldingsAsOfAge)}）より前になっています。\n` +
        `基準年齢より前の期間は、既に「実際の残高」に反映されているはずのため、開始年齢は基準年齢と同じかそれより後にしてください。`
      );
      return;
    }
    setInputs((prev) => ({
      ...prev,
      growthSchedule: [...prev.growthSchedule, { fromAge, toAge, monthlyYen }].sort((a, b) => a.fromAge - b.fromAge),
    }));
    setNewGrowthRange({ fromYears: "", fromMonths: "", toYears: "", toMonths: "", monthlyYen: "" });
  };
  const removeGrowthRange = (idx) =>
    setInputs((prev) => ({ ...prev, growthSchedule: prev.growthSchedule.filter((_, i) => i !== idx) }));

  const netMonthlyGap = inputs.livingCostMonthly - inputs.pensionMonthly;

  // つみたて枠・成長投資枠の「これまでの使用累計」は、手入力の基準額に加えて
  // スケジュール（過去分）・一括投資（実行済み分）から自動集計した金額を合算する
  const tsumitateElapsed = elapsedScheduleAmount(inputs.tsumitateSchedule, effectiveCurrentAge);
  const growthElapsed =
    elapsedScheduleAmount(inputs.growthSchedule, effectiveCurrentAge) +
    elapsedLumpSumAmount(inputs.lumpSums, effectiveCurrentAge);
  const computedTsumitateUsed = inputs.tsumitateUsed + tsumitateElapsed;
  const computedGrowthUsed = inputs.growthUsed + growthElapsed;

  // 現在のNISA資産の内訳（つみたて投資枠 / 成長投資枠）— 円グラフ・棒グラフ用
  const nisaFrameAllocationItems = [
    { name: "つみたて投資枠", amount: Math.max(0, computedTsumitateUsed) },
    { name: "成長投資枠", amount: Math.max(0, computedGrowthUsed) },
  ];

  const growthDiff = NISA_LIMITS.growthLifetime - computedGrowthUsed;
  const remainingGrowth = Math.max(0, growthDiff);
  const growthOverage = Math.max(0, -growthDiff);

  const totalDiff = NISA_LIMITS.totalLifetime - computedTsumitateUsed - computedGrowthUsed;
  const remainingTotal = Math.max(0, totalDiff);
  const totalOverage = Math.max(0, -totalDiff);

  // つみたて投資枠には単独の生涯上限はなく、総枠(1,800万円)を成長投資枠と共有する。
  // そのため「つみたて分の残り」は、総枠の残りのうち今後つみたてに割り当てられる分として扱う。
  const remainingTsumitate = remainingTotal;
  const tsumitateOverage = Math.max(0, computedTsumitateUsed - NISA_LIMITS.totalLifetime);

  // 今年時点でのペース（現在の年齢での積立額 × 12ヶ月）が年間上限に対してどうかを表示
  const currentTsumitateMonthly = scheduledAmount(inputs.tsumitateSchedule, effectiveCurrentAge);
  const tsumitateAnnualPace = currentTsumitateMonthly * 12;
  const tsumitateAnnualDiff = NISA_LIMITS.tsumitateAnnual - tsumitateAnnualPace;
  const tsumitateAnnualRemaining = Math.max(0, tsumitateAnnualDiff);
  const tsumitateAnnualOverage = Math.max(0, -tsumitateAnnualDiff);

  const currentGrowthMonthly = scheduledAmount(inputs.growthSchedule, effectiveCurrentAge);
  const growthAnnualPace = currentGrowthMonthly * 12;
  const growthAnnualDiff = NISA_LIMITS.growthAnnual - growthAnnualPace;
  const growthAnnualRemaining = Math.max(0, growthAnnualDiff);
  const growthAnnualOverage = Math.max(0, -growthAnnualDiff);

  // 各スケジュール区間の横に「月上限まであと幾ら」「その区間終了時点で生涯投資枠があと幾ら残るか」を表示するためのヘルパー
  const tsumitateMonthlyCapValue = NISA_LIMITS.tsumitateAnnual / 12;
  const growthMonthlyCapValue = NISA_LIMITS.growthAnnual / 12;

  const formatCapDiff = (diff) => (diff >= 0 ? `月上限まであと${yen(diff)}` : `月上限を${yen(-diff)}超過`);

  const lifetimeRemainingAtAge = (age) => {
    const row = sim.yearly.find((y) => y.age >= age) || sim.yearly[sim.yearly.length - 1];
    const cum = row ? row.tsumitateCum + row.growthCum : computedTsumitateUsed + computedGrowthUsed;
    return NISA_LIMITS.totalLifetime - cum;
  };

  return (
    <div className="app">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@500;700&family=Noto+Sans+JP:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap');
        html, body {
          background: #0E1316;
        }

        * { box-sizing: border-box; }
        .app {
          --bg: #0E1316;
          --panel: #151C20;
          --panel-2: #182027;
          --line: #2A363C;
          --line-faint: rgba(79,168,216,0.14);
          --blue: #4FA8D8;
          --blue-dim: #2E5F78;
          --amber: #D9A54F;
          --green: #8FBF7F;
          --text: #E7ECEE;
          --muted: #7C8A90;
          --danger: #C2694F;
          font-family: 'Noto Sans JP', sans-serif;
          background: var(--bg);
          color: var(--text);
          min-height: 100vh;
          background-image:
            linear-gradient(var(--line-faint) 1px, transparent 1px),
            linear-gradient(90deg, var(--line-faint) 1px, transparent 1px);
          background-size: 28px 28px;
          padding: 0 0 60px 0;
        }
        .mono { font-family: 'JetBrains Mono', monospace; }

        /* ---------- responsive safety ---------- */
        .app, .app * { box-sizing: border-box; }
        .app { width: 100%; max-width: 100%; overflow-x: hidden; }
        .grid-main, .panel, .content, .two-col, .stat-grid, .chart-frame { min-width: 0; }
        img, svg, canvas { max-width: 100%; }
        img { height: auto; }
        input, select, textarea, button { max-width: 100%; }
        input:disabled {
          color: var(--text) !important;
          -webkit-text-fill-color: var(--text) !important;
          opacity: 1 !important;
        }
        .field-input-wrap, .add-row { min-width: 0; }
        .add-row input { min-width: 0; }
        table.watchlist { table-layout: fixed; }
        table.watchlist th, table.watchlist td { overflow-wrap: anywhere; word-break: break-word; }

        @media (max-width: 640px) {
          .titleblock { padding: 16px 14px 12px; align-items: flex-start; }
          .titleblock h1 { font-size: 19px; line-height: 1.35; }
          .titleblock .meta { width: 100%; gap: 6px 12px; }
          .panel, .content { padding: 16px 14px; border-right: none; }
          .save-warning, .history-panel { padding-left: 14px; padding-right: 14px; }
          .footer-note { padding-left: 14px; padding-right: 14px; }
          .stat-grid { grid-template-columns: 1fr 1fr; gap: 8px; }
          .stat-card { padding: 12px; }
          .stat-value { font-size: 17px; overflow-wrap: anywhere; }
          .chart-frame { padding-left: 0; padding-right: 0; }
          .chart-frame .chart-label { padding-left: 10px; padding-right: 10px; }
          .add-row { flex-wrap: wrap; }
          .add-row input { flex: 1 1 140px; }
          .add-btn { min-height: 36px; }
          table.watchlist { display: block; width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; table-layout: auto; }
          table.watchlist th, table.watchlist td { white-space: nowrap; }
          .landing { padding: 30px 14px 28px; }
          .landing-hero h1 { font-size: 22px; }
          .landing-screenshot { width: 100%; }
          .landing-screenshot img { width: 100%; max-width: 100%; margin: 0; border-radius: 10px; }
        }

        @media (max-width: 420px) {
          .stat-grid { grid-template-columns: 1fr; }
          .titleblock .meta { display: grid; grid-template-columns: 1fr; }
          .landing-cta { width: 100%; }
        }

        .titleblock {
          border-bottom: 1px solid var(--line);
          padding: 22px 28px 16px;
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          flex-wrap: wrap;
          gap: 12px;
        }
        .titleblock h1 {
          font-family: 'Zen Kaku Gothic New', sans-serif;
          font-weight: 700;
          font-size: 22px;
          letter-spacing: 0.02em;
          margin: 0;
          color: var(--text);
        }
        .titleblock .sub {
          color: var(--muted);
          font-size: 12px;
          margin-top: 4px;
          font-family: 'JetBrains Mono', monospace;
        }
        .titleblock .meta {
          display: flex;
          flex-wrap: wrap;
          gap: 10px 18px;
          font-size: 11px;
          color: var(--muted);
          font-family: 'JetBrains Mono', monospace;
        }
        .titleblock .meta div span { color: var(--blue); }

        .grid-main {
          display: grid;
          grid-template-columns: 340px 1fr;
          gap: 0;
        }
        @media (max-width: 880px) {
          .grid-main { grid-template-columns: 1fr; }
        }

        .panel {
          padding: 20px 24px;
          border-right: 1px solid var(--line);
        }
        .content { padding: 20px 28px; }

        .section-title {
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 26px 0 12px;
        }
        .section-title:first-child { margin-top: 4px; }
        .section-title .section-index {
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          color: var(--blue);
          border: 1px solid var(--blue-dim);
          padding: 1px 6px;
          border-radius: 2px;
        }
        .section-title h2 {
          font-family: 'Zen Kaku Gothic New', sans-serif;
          font-size: 13px;
          font-weight: 700;
          margin: 0;
          letter-spacing: 0.02em;
        }
        .section-title svg { color: var(--muted); }

        .field {
          display: flex;
          flex-direction: column;
          gap: 4px;
          margin-bottom: 12px;
        }
        .field-label {
          font-size: 11px;
          color: var(--muted);
        }
        .field-input-wrap {
          display: flex;
          align-items: center;
          border: 1px solid var(--line);
          background: var(--panel-2);
          border-radius: 3px;
          overflow: hidden;
        }
        .field-input-wrap:focus-within { border-color: var(--blue-dim); }
        .field input {
          flex: 1;
          background: transparent;
          border: none;
          outline: none;
          color: var(--text);
          padding: 8px 10px;
          font-size: 13px;
          min-width: 0;
        }
        .field-unit {
          padding: 0 10px;
          font-size: 11px;
          color: var(--muted);
          border-left: 1px solid var(--line);
          align-self: stretch;
          display: flex;
          align-items: center;
        }

        .alloc-row {
          display: grid;
          grid-template-columns: 16px 1fr 56px;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
        }
        .alloc-dot { width: 8px; height: 8px; border-radius: 50%; }
        .alloc-row input[type="range"] {
          width: 100%;
          accent-color: var(--blue);
        }
        .alloc-row .alloc-val {
          font-size: 12px;
          text-align: right;
          font-family: 'JetBrains Mono', monospace;
          color: var(--muted);
        }
        .alloc-sum {
          font-size: 11px;
          margin-top: 4px;
          color: var(--muted);
        }
        .alloc-sum.warn { color: var(--danger); }

        .note {
          display: flex;
          gap: 6px;
          font-size: 11px;
          color: var(--muted);
          background: var(--panel-2);
          border: 1px solid var(--line);
          border-left: 2px solid var(--blue-dim);
          padding: 8px 10px;
          border-radius: 2px;
          line-height: 1.5;
          margin: 10px 0 16px;
        }
        .note svg { flex-shrink: 0; margin-top: 1px; color: var(--blue); }

        .stat-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          margin-bottom: 22px;
        }
        @media (max-width: 880px) { .stat-grid { grid-template-columns: repeat(2, 1fr); } }
        .stat-card {
          border: 1px solid var(--line);
          background: var(--panel);
          padding: 14px 16px;
          border-radius: 3px;
          position: relative;
        }
        .stat-card::before {
          content: "";
          position: absolute; top: 0; left: 0; width: 100%; height: 2px;
          background: var(--blue-dim);
        }
        .stat-card.danger::before { background: var(--danger); }
        .stat-card.good::before { background: var(--green); }
        .stat-label { font-size: 11px; color: var(--muted); margin-bottom: 6px; }
        .stat-value { font-size: 19px; font-weight: 600; }
        .stat-sub { font-size: 11px; color: var(--muted); margin-top: 4px; }

        .chart-frame {
          border: 1px solid var(--line);
          background: var(--panel);
          padding: 16px 8px 8px;
          border-radius: 3px;
          margin-bottom: 22px;
        }
        .chart-frame .chart-label {
          font-size: 11px;
          color: var(--muted);
          padding: 0 12px 8px;
          font-family: 'JetBrains Mono', monospace;
        }

        .two-col {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        @media (max-width: 880px) { .two-col { grid-template-columns: 1fr; } }

        table.watchlist { width: 100%; border-collapse: collapse; font-size: 12px; }
        table.watchlist th {
          text-align: left; color: var(--muted); font-weight: 500;
          border-bottom: 1px solid var(--line); padding: 6px 8px; font-size: 11px;
        }
        table.watchlist td { padding: 7px 8px; border-bottom: 1px solid rgba(42,54,60,0.5); }
        table.watchlist tr:hover { background: rgba(79,168,216,0.05); }
        .del-btn {
          background: none; border: none; color: var(--muted); cursor: pointer;
          display: flex; align-items: center; padding: 2px;
        }
        .del-btn:hover { color: var(--danger); }

        .add-row {
          display: flex; gap: 8px; margin-top: 10px;
        }
        .add-row input {
          flex: 1; background: var(--panel-2); border: 1px solid var(--line);
          color: var(--text); padding: 7px 9px; border-radius: 3px; font-size: 12px; outline: none;
        }
        .add-row input:focus { border-color: var(--blue-dim); }
        .add-btn {
          background: var(--blue-dim); border: 1px solid var(--blue);
          color: var(--text); border-radius: 3px; padding: 0 12px;
          display: flex; align-items: center; cursor: pointer;
        }
        .add-btn:hover { background: var(--blue); }

        .history-toggle {
          background: var(--panel-2); border: 1px solid var(--line);
          color: var(--blue); font-size: 11px; font-family: 'JetBrains Mono', monospace;
          padding: 5px 10px; border-radius: 3px; cursor: pointer; white-space: nowrap;
        }
        .history-toggle:hover { border-color: var(--blue-dim); }

        .save-badge {
          font-size: 10.5px; font-family: 'JetBrains Mono', monospace;
          padding: 4px 8px; border-radius: 3px; border: 1px solid var(--line);
          cursor: default; white-space: nowrap;
        }
        .save-saved { color: var(--green); border-color: rgba(143,191,127,0.35); }
        .save-saving { color: var(--muted); }
        .save-error, .save-unavailable { color: var(--danger); border-color: rgba(194,105,79,0.4); }
        .save-warning {
          display: flex; gap: 8px; align-items: flex-start;
          font-size: 12px; color: var(--danger); background: rgba(194,105,79,0.08);
          border-bottom: 1px solid var(--line); padding: 10px 28px;
        }
        .history-panel {
          padding: 14px 28px; border-bottom: 1px solid var(--line);
          background: var(--panel);
        }
        .history-empty { font-size: 12px; color: var(--muted); }
        .history-action {
          background: none; border: 1px solid var(--line); color: var(--blue);
          font-size: 11px; padding: 3px 8px; border-radius: 3px; cursor: pointer;
        }
        .history-action:hover { border-color: var(--blue-dim); }

        .inline-num {
          width: 100%; background: var(--panel-2); border: 1px solid var(--line);
          color: var(--text); padding: 4px 6px; border-radius: 3px; font-size: 12px; outline: none;
        }
        .inline-num:focus { border-color: var(--blue-dim); }

        .footer-note {
          font-size: 10.5px; color: var(--muted); padding: 20px 28px 0;
          line-height: 1.6; border-top: 1px solid var(--line); margin-top: 10px;
        }

        @media print {
          .app { background: #fff !important; color: #111 !important; background-image: none !important; }
          button, .add-row, .history-panel, .save-warning, .history-toggle { display: none !important; }
          .grid-main { grid-template-columns: 1fr !important; }
          .panel { border-right: none !important; border-bottom: 2px solid #ccc; }
          .stat-card, .chart-frame, .panel, .content { background: #fff !important; border-color: #ccc !important; color: #111 !important; }
          .stat-value, h1, h2, .field-label, .stat-label, .stat-sub { color: #111 !important; }
          input, select { border: none !important; background: transparent !important; color: #111 !important; }
          .field-input-wrap { border: none !important; }
          .field-unit { border-left: none !important; color: #555 !important; }
          table.watchlist th, table.watchlist td { color: #111 !important; }
          .chart-frame { break-inside: avoid; }
          .stat-card { break-inside: avoid; }
        }

        /* ---------- 紹介セクション（初めて訪れた人向け） ---------- */
        .landing {
          padding: 40px 24px 36px;
          border-bottom: 1px solid var(--line);
          background-image:
            linear-gradient(var(--line-faint) 1px, transparent 1px),
            linear-gradient(90deg, var(--line-faint) 1px, transparent 1px);
          background-size: 28px 28px;
        }
        .landing-hero { max-width: 640px; margin: 0 auto; text-align: center; }
        .landing-hero h1 {
          font-family: 'Zen Kaku Gothic New', sans-serif;
          font-size: 26px; font-weight: 700; line-height: 1.4;
          margin: 0 0 14px; color: var(--text);
        }
        .landing-free-notice {
          font-size: 11.5px; line-height: 1.6; color: var(--green);
          margin: -6px 0 16px;
        }
        .landing-free-notice strong { color: var(--green); font-weight: 700; }
        .landing-catch {
          font-size: 16px; line-height: 1.7; color: var(--blue);
          margin: 0 0 16px; font-weight: 500;
        }
        .landing-sub {
          font-size: 13.5px; line-height: 1.8; color: var(--muted);
          margin: 0 0 26px;
        }
        .landing-cta {
          display: inline-block; width: 100%; max-width: 360px;
          background: var(--blue); color: #0E1316; border: none;
          font-family: 'Zen Kaku Gothic New', sans-serif;
          font-size: 15px; font-weight: 700; letter-spacing: 0.02em;
          padding: 15px 20px; border-radius: 6px; cursor: pointer;
        }
        .landing-cta:hover { background: #6BB8E0; }

        .landing-screenshot {
          max-width: 900px; margin: 36px auto 0; text-align: center;
        }
        .landing-screenshot h2 {
          font-family: 'Zen Kaku Gothic New', sans-serif; font-size: 16px; font-weight: 700;
          margin: 0 0 8px; color: var(--text);
        }
        .landing-screenshot p {
          font-size: 12.5px; line-height: 1.7; color: var(--muted);
          margin: 0 0 18px; max-width: 480px; margin-left: auto; margin-right: auto;
        }
        .landing-screenshot img {
          width: 100%; max-width: 900px; height: auto;
          border-radius: 16px;
          box-shadow: 0 8px 30px rgba(0,0,0,0.35);
          border: 1px solid var(--line);
          display: block; margin: 0 auto;
        }

        .landing-features {
          max-width: 640px; margin: 40px auto 0;
          display: grid; grid-template-columns: 1fr 1fr; gap: 14px;
        }
        @media (max-width: 520px) { .landing-features { grid-template-columns: 1fr; } }
        .landing-feature-card {
          border: 1px solid var(--line); background: var(--panel);
          border-radius: 6px; padding: 16px 18px; text-align: left;
          position: relative;
        }
        .landing-feature-card::before {
          content: ""; position: absolute; top: 0; left: 0; width: 100%; height: 2px;
          background: var(--blue-dim);
        }
        .landing-feature-num {
          font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--blue);
          margin-bottom: 6px; display: block;
        }
        .landing-feature-card h3 {
          font-family: 'Zen Kaku Gothic New', sans-serif; font-size: 14.5px; font-weight: 700;
          margin: 0 0 6px; color: var(--text);
        }
        .landing-feature-card p {
          font-size: 12.5px; line-height: 1.6; color: var(--muted); margin: 0;
        }

        .landing-audience {
          max-width: 640px; margin: 34px auto 0;
          border: 1px solid var(--line); border-left: 2px solid var(--amber);
          background: var(--panel); border-radius: 4px; padding: 18px 20px;
        }
        .landing-audience h4 {
          font-family: 'Zen Kaku Gothic New', sans-serif; font-size: 13.5px; font-weight: 700;
          margin: 0 0 10px; color: var(--amber);
        }
        .landing-audience ul { margin: 0; padding-left: 18px; }
        .landing-audience li { font-size: 13px; line-height: 1.9; color: var(--text); }

        .landing-blog-section {
          max-width: 640px; margin: 34px auto 0; padding: 30px 24px;
          text-align: center; border: 1px solid var(--line); border-radius: 8px;
          background: var(--panel);
        }
        .landing-blog-section h3 {
          font-family: 'Zen Kaku Gothic New', sans-serif; font-size: 18px; font-weight: 700;
          margin: 0 0 12px; color: var(--text);
        }
        .landing-blog-section p {
          font-size: 13px; line-height: 1.8; color: var(--muted);
          margin: 0 0 20px;
        }

        .landing-disclaimer {
          max-width: 640px; margin: 22px auto 0;
          font-size: 11px; line-height: 1.7; color: var(--muted); text-align: center;
        }
      `}</style>

      <div className="landing">
        <div className="landing-hero">
          <h1>資産形成 総合ライフプラン</h1>
          <p className="landing-free-notice">
            <strong>完全無料・登録不要</strong><br />
            現在はすべての機能を無料でご利用いただけます。
          </p>
          <p className="landing-catch">
            あなたの人生設計を、ひとつの画面で。
          </p>
          <p className="landing-sub">
            入力するだけで、将来のお金の流れを見える化。<br />
            NISA・年金・預貯金・金・保険をまとめて管理し、将来の資産推移をシミュレーションできます。
          </p>
          <button className="landing-cta" onClick={scrollToSimulator}>
            無料でシミュレーションを始める
          </button>
        </div>

        <div className="landing-screenshot">
          <h2>実際のシミュレーション画面</h2>
          <p>現在の資産・NISA・年金・預貯金・金・保険などを入力するだけで、将来の資産推移をグラフで分かりやすく確認できます。</p>
          <img src="/ogp.png" alt="資産形成 総合ライフプラン シミュレーション画面" loading="lazy" />
        </div>

        <div className="landing-features">
          <div className="landing-feature-card">
            <span className="landing-feature-num">01</span>
            <h3>資産を一括管理</h3>
            <p>NISA・預貯金・金・個別株・保険などをまとめて管理</p>
          </div>
          <div className="landing-feature-card">
            <span className="landing-feature-num">02</span>
            <h3>年金・生活費を反映</h3>
            <p>公的年金・企業年金・生活費・医療費まで考慮してシミュレーション</p>
          </div>
          <div className="landing-feature-card">
            <span className="landing-feature-num">03</span>
            <h3>将来の資産推移を見える化</h3>
            <p>年齢ごとの資産推移をグラフで確認</p>
          </div>
          <div className="landing-feature-card">
            <span className="landing-feature-num">04</span>
            <h3>無料・登録不要</h3>
            <p>すぐ利用でき、入力データは端末内へ保存</p>
          </div>
        </div>

        <div className="landing-audience">
          <h4>こんな方におすすめ</h4>
          <ul>
            <li>老後資金が足りるか不安な方</li>
            <li>NISAを始めたい方</li>
            <li>退職後の生活をシミュレーションしたい方</li>
            <li>年金と資産をまとめて管理したい方</li>
            <li>ライフプランを見える化したい方</li>
          </ul>
        </div>

        {onOpenBlog && (
          <div className="landing-blog-section">
            <h3>資産形成コラム</h3>
            <p>
              老後資産・NISA・年金・保険・ライフプランに役立つ情報を分かりやすく解説しています。<br />
              シミュレーションだけでは伝えきれない考え方や資産形成のポイントも随時更新していきます。
            </p>
            <button className="landing-cta" onClick={onOpenBlog}>
              資産形成コラムを見る
            </button>
          </div>
        )}

        <p className="landing-disclaimer">
          本サービスは入力された条件に基づくシミュレーションです。将来の運用成果や生活を保証するものではありません。特定の金融商品を推奨するサービスではありません。
        </p>
      </div>

      <div className="titleblock" id="simulator">
        <div>
          <h1>
            資産形成 総合ライフプラン
            {inputs.userName && <><br />{`（${inputs.userName}様）`}</>}
          </h1>
          <div className="sub">
            NISA積立 × 老後資産 × 年金 × 健康費用 × 相続 — 統合シミュレーション
            <br />
            本日：{new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" })}
          </div>
        </div>
        <div className="meta" style={{ alignItems: "center" }}>
          <div>
            現在{" "}
            <span>
              {preciseAge ? `${preciseAge.years}歳${preciseAge.months}ヶ月${preciseAge.days}日` : `${effectiveCurrentAge}歳`}
            </span>
          </div>
          <div>引退 <span>{inputs.retireAge}歳</span></div>
          <div>想定寿命 <span>{inputs.deathAge}歳</span></div>
          <div
            className={`save-badge save-${saveStatus}`}
            title={saveMessage}
          >
            {saveStatus === "saved" && "● 保存済み"}
            {saveStatus === "saving" && "○ 保存中…"}
            {saveStatus === "error" && "⚠ 保存失敗"}
            {saveStatus === "unavailable" && "⚠ 保存不可"}
            {saveStatus === "idle" && "…"}
          </div>
          <button className="history-toggle" onClick={() => setShowHistory((v) => !v)}>
            {showHistory ? "履歴を閉じる" : `入力履歴（${history.length}件）`}
          </button>
          <button className="history-toggle" onClick={() => setShowBackup((v) => !v)}>
            {showBackup ? "バックアップを閉じる" : "手動バックアップ"}
          </button>
          <button className="history-toggle no-print" onClick={() => window.print()}>
            PDFで保存 / 印刷
          </button>
        </div>
      </div>
      {(saveStatus === "unavailable" || saveStatus === "error") && (
        <div className="save-warning">
          <Info size={13} />
          <span>{saveMessage}　自動保存が使えない環境のため、下の「手動バックアップ」からテキストをコピーして保管してください。</span>
        </div>
      )}
      {showBackup && (
        <div className="history-panel">
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>
            下のテキストを全選択してコピーし、メモ帳やメモアプリに保存しておいてください。次回はそれを「復元用テキスト」に貼り付けて「読み込む」を押すと元に戻ります。
          </div>
          <div className="field-label" style={{ marginBottom: 4 }}>エクスポート（コピー用）</div>
          <textarea
            readOnly value={backupText}
            onClick={(e) => e.target.select()}
            style={{
              width: "100%", height: 120, background: "var(--panel-2)", color: "var(--text)",
              border: "1px solid var(--line)", borderRadius: 3, fontSize: 10.5,
              fontFamily: "'JetBrains Mono', monospace", padding: 8, marginBottom: 14,
            }}
          />
          <div className="field-label" style={{ marginBottom: 4 }}>復元用テキスト（貼り付け）</div>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder="ここに以前コピーしたテキストを貼り付けてください"
            style={{
              width: "100%", height: 100, background: "var(--panel-2)", color: "var(--text)",
              border: "1px solid var(--line)", borderRadius: 3, fontSize: 10.5,
              fontFamily: "'JetBrains Mono', monospace", padding: 8, marginBottom: 8,
            }}
          />
          <button className="history-action" onClick={importBackup}>読み込む</button>
          {importOk && <span style={{ fontSize: 11, color: "var(--green)", marginLeft: 8 }}>読み込みました</span>}
          {importError && <div style={{ fontSize: 11, color: "var(--danger)", marginTop: 6 }}>{importError}</div>}
        </div>
      )}

      {showHistory && (
        <div className="history-panel">
          <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button className="history-action" onClick={() => save(inputs, watchlist)}>今すぐ記録する</button>
            <button className="history-action" onClick={refreshHistory}>履歴を再読み込み</button>
            {historyDebug && <span style={{ fontSize: 10.5, color: "var(--muted)" }}>{historyDebug}</span>}
          </div>
          {history.length === 0 ? (
            <div className="history-empty">まだ記録がありません。入力すると今日の日付で自動記録されます。</div>
          ) : (
            <table className="watchlist">
              <thead>
                <tr>
                  <th>日付</th>
                  <th>NISA元本</th>
                  <th>金保有量</th>
                  <th>銀行預金合計</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.date}>
                    <td className="mono">{formatDateLabel(h.date)}</td>
                    <td className="mono">{yen(h.currentAssets)}</td>
                    <td className="mono">{(h.goldGrams || 0).toFixed(1)}g</td>
                    <td className="mono">{yen(h.bankTotal)}</td>
                    <td style={{ display: "flex", gap: 6 }}>
                      <button className="history-action" onClick={() => restoreSnapshot(h)}>この記録を復元</button>
                      <button className="del-btn" onClick={() => deleteSnapshot(h.date)}><Trash2 size={13} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div className="grid-main">
        {/* -------- LEFT: INPUT PANEL -------- */}
        <div className="panel">
          <SectionTitle index="00" title="ご本人情報" icon={Users} />
          <label className="field">
            <span className="field-label">お名前（任意）</span>
            <div className="field-input-wrap">
              <input
                type="text"
                value={inputs.userName}
                onChange={(e) => update({ userName: e.target.value })}
                style={{ width: "100%" }}
              />
            </div>
          </label>
          <label className="field">
            <span className="field-label">生年月日</span>
            <div className="field-input-wrap">
              <input
                type="date" className="mono"
                value={inputs.birthDate}
                onChange={(e) => update({ birthDate: e.target.value })}
                style={{ width: "100%" }}
              />
            </div>
          </label>
          {preciseAge && (
            <div className="note">
              <Info size={13} />
              <span>
                生年月日から計算した現在の年齢：<strong>{preciseAge.years}歳{preciseAge.months}ヶ月{preciseAge.days}日</strong>
                （本日時点）。この数値がシミュレーション全体の「現在の年齢」として自動的に使われます。
              </span>
            </div>
          )}

          <SectionTitle index="01" title="基本情報" icon={Ruler} />
          <AgeField label="現在の年齢" value={effectiveCurrentAge} disabled={!!preciseAge} onChange={(v) => update({ currentAge: v })} />
          {preciseAge && (
            <div className="note" style={{ marginTop: -8 }}>
              <Info size={13} />
              <span>生年月日が入力されているため、この欄は自動計算され編集できません。年齢を手動で調整したい場合は、上の生年月日を空欄にしてください。</span>
            </div>
          )}
          <AgeField label="引退（年金開始）年齢" value={inputs.retireAge} onChange={(v) => update({ retireAge: v })} />
          <AgeField label="想定寿命" value={inputs.deathAge} onChange={(v) => update({ deathAge: v })} />

          <SectionTitle index="02" title="NISA積立（つみたて枠 + 成長投資枠）" icon={TrendingUp} />

          <div className="field-label" style={{ marginBottom: 6 }}>つみたて投資枠：実際の残高（銘柄・金額）</div>
          {inputs.tsumitateHoldings.length > 0 && (
            <table className="watchlist" style={{ marginBottom: 8 }}>
              <thead><tr><th>銘柄</th><th>金額</th><th></th></tr></thead>
              <tbody>
                {inputs.tsumitateHoldings.map((h, i) => (
                  <tr key={i}>
                    <td>{h.name}</td>
                    <td className="mono">{yen(h.value)}</td>
                    <td style={{ width: 24 }}>
                      <button className="del-btn" onClick={() => removeTsumitateHolding(i)}><Trash2 size={13} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="add-row" style={{ marginBottom: 8 }}>
            <input placeholder="銘柄名" value={newTsumitateHolding.name} onChange={(e) => setNewTsumitateHolding((p) => ({ ...p, name: e.target.value }))} />
            <input placeholder="金額（円）" type="number" value={newTsumitateHolding.value} onChange={(e) => setNewTsumitateHolding((p) => ({ ...p, value: e.target.value }))} />
            <button className="add-btn" onClick={addTsumitateHolding}><Plus size={15} /></button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
            <span style={{ fontSize: 10, color: "#E07A5F", whiteSpace: "nowrap", fontWeight: 700 }}>この残高時点の基準年齢（必須）</span>
            <AgeYMInput
              placeholder="基準年齢" years={inputs.tsumitateHoldingsAsOfYears} months={inputs.tsumitateHoldingsAsOfMonths}
              onYears={(v) => update({ tsumitateHoldingsAsOfYears: v })}
              onMonths={(v) => update({ tsumitateHoldingsAsOfMonths: v })}
            />
          </div>
          <div className="note" style={{ marginBottom: 12 }}>
            <Info size={13} />
            <span>残高時点の基準年齢を基に計算いたします。（現在の実際の残高＋利率　<span className="mono">{yen(tsumitateHoldingsManualTotal)}</span>）＋（スケジュール分＋利率　<span className="mono">{yen(tsumitateCatchUp)}</span>）＝現在のNISA資産合計。</span>
          </div>

          <div className="field-label" style={{ marginBottom: 6 }}>成長投資枠：実際の残高（銘柄・金額）</div>
          {inputs.growthHoldings.length > 0 && (
            <table className="watchlist" style={{ marginBottom: 8 }}>
              <thead><tr><th>銘柄</th><th>金額</th><th></th></tr></thead>
              <tbody>
                {inputs.growthHoldings.map((h, i) => (
                  <tr key={i}>
                    <td>{h.name}</td>
                    <td className="mono">{yen(h.value)}</td>
                    <td style={{ width: 24 }}>
                      <button className="del-btn" onClick={() => removeGrowthHolding(i)}><Trash2 size={13} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="add-row" style={{ marginBottom: 8 }}>
            <input placeholder="銘柄名" value={newGrowthHolding.name} onChange={(e) => setNewGrowthHolding((p) => ({ ...p, name: e.target.value }))} />
            <input placeholder="金額（円）" type="number" value={newGrowthHolding.value} onChange={(e) => setNewGrowthHolding((p) => ({ ...p, value: e.target.value }))} />
            <button className="add-btn" onClick={addGrowthHolding}><Plus size={15} /></button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
            <span style={{ fontSize: 10, color: "#E07A5F", whiteSpace: "nowrap", fontWeight: 700 }}>この残高時点の基準年齢（必須）</span>
            <AgeYMInput
              placeholder="基準年齢" years={inputs.growthHoldingsAsOfYears} months={inputs.growthHoldingsAsOfMonths}
              onYears={(v) => update({ growthHoldingsAsOfYears: v })}
              onMonths={(v) => update({ growthHoldingsAsOfMonths: v })}
            />
          </div>
          <div className="note" style={{ marginBottom: 12 }}>
            <Info size={13} />
            <span>残高時点の基準年齢を基に計算いたします。（現在の実際の残高＋利率　<span className="mono">{yen(growthHoldingsManualTotal)}</span>）＋（スケジュール分＋利率　<span className="mono">{yen(growthCatchUp)}</span>）＝現在のNISA資産合計。</span>
          </div>

          {autoHoldingRows.length > 0 && (
            <>
              <div className="field-label" style={{ marginBottom: 6 }}>
                時価（自動計算：つみたて・成長投資枠のスケジュール分＋一括投資の経過分）
              </div>
              <table className="watchlist" style={{ marginBottom: 8 }}>
                <thead><tr><th>銘柄</th><th>時価（自動）</th></tr></thead>
                <tbody>
                  {autoHoldingRows.map((r, i) => (
                    <tr key={i}>
                      <td>{r.name}</td>
                      <td className="mono">{yen(r.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <label className="field">
            <span className="field-label">現在のNISA資産：合計（自動計算）</span>
            <div className="field-input-wrap">
              <div className="mono" style={{ flex: 1, padding: "8px 10px", fontSize: 13 }}>
                {Math.round(effectiveCurrentAssets).toLocaleString()}
              </div>
              <span className="field-unit">円</span>
            </div>
          </label>
          <div className="note" style={{ marginTop: -8 }}>
            <Info size={13} />
            <span>
              つみたて投資枠の評価額（{yen(tsumitateHoldingsTotal)}） + 成長投資枠の評価額（{yen(growthHoldingsTotal)}） + 一括投資の評価額（{yen(autoHoldingsTotal)}）を合計したものが、この「合計」欄（{yen(effectiveCurrentAssets)}）に反映され、シミュレーションではこの金額が使われます。「実際の残高」は基準年齢時点で実際にいくらだったかという金額として入力してください。基準年齢を入力すると、そこから現在の年齢まで銘柄ごとの想定利回りで複利運用したものとして評価額を計算します（未入力ならそのままの金額を使用）。それとは別に、つみたて・成長投資枠それぞれの毎月投資額スケジュールで実際に引き落とされてきたはずの金額も、その都度の想定利回りで複利運用したものとして自動計算・加算されます（つみたてスケジュール分：{yen(tsumitateCatchUp)}／成長投資枠スケジュール分：{yen(growthCatchUp)}）。一括投資も同様に、それぞれの投資日から現在まで複利運用したものとして自動計算されます。※スケジュール分は自動加算されるため、「実際の残高」にはスケジュールで積み立て済みの分を重複して含めないようご注意ください。ここで入力した銘柄名は、下の「NISA資産の配分」スライダーにもそのまま反映され、想定年率（利回り）はそちらで銘柄ごとに自動設定・調整されます（この欄自体には利回りの入力は不要です）。ご自身で利回りを変更したい場合は、下の「NISA資産の配分」セクションにある、各銘柄の「想定年率」欄を直接書き換えてください。
            </span>
          </div>

          <div className="field-label" style={{ marginBottom: 6 }}>つみたて投資枠：毎月投資額（年齢区間ごとに設定）</div>
          {inputs.tsumitateSchedule.length > 0 && (
            <table className="watchlist" style={{ marginBottom: 8 }}>
              <thead><tr><th>年齢</th><th>月額 / 上限との差</th><th></th></tr></thead>
              <tbody>
                {inputs.tsumitateSchedule.map((r, i) => (
                  <tr key={i}>
                    <td>{formatAge(r.fromAge)}〜{formatAge(r.toAge)}</td>
                    <td className="mono">
                      <div>{yen(r.monthlyYen)}/月</div>
                      <div style={{ fontSize: 10, color: r.monthlyYen > tsumitateMonthlyCapValue ? "#C2694F" : "#7C8A90" }}>
                        {formatCapDiff(tsumitateMonthlyCapValue - r.monthlyYen)}
                      </div>
                      <div style={{ fontSize: 10, color: "#7C8A90" }}>
                        区間終了時 生涯枠残り {yen(lifetimeRemainingAtAge(r.toAge))}
                      </div>
                    </td>
                    <td style={{ width: 24 }}>
                      <button className="del-btn" onClick={() => removeTsumitateRange(i)}><Trash2 size={13} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="add-row">
            <AgeYMInput
              placeholder="開始" years={newTsumitateRange.fromYears} months={newTsumitateRange.fromMonths}
              onYears={(v) => setNewTsumitateRange((p) => ({ ...p, fromYears: v }))}
              onMonths={(v) => setNewTsumitateRange((p) => ({ ...p, fromMonths: v }))}
            />
            <AgeYMInput
              placeholder="終了" years={newTsumitateRange.toYears} months={newTsumitateRange.toMonths}
              onYears={(v) => setNewTsumitateRange((p) => ({ ...p, toYears: v }))}
              onMonths={(v) => setNewTsumitateRange((p) => ({ ...p, toMonths: v }))}
            />
          </div>
          <div className="add-row" style={{ marginBottom: 14 }}>
            <input placeholder="毎月投資額（円）" type="number" value={newTsumitateRange.monthlyYen} onChange={(e) => setNewTsumitateRange((p) => ({ ...p, monthlyYen: e.target.value }))} />
            <button className="add-btn" onClick={addTsumitateRange}><Plus size={15} /></button>
          </div>
          <div className="note">
            <Info size={13} />
            <span>例：「58歳0ヶ月〜61歳11ヶ月・月11万円」「62歳0ヶ月〜65歳0ヶ月・月9万円」のように、歳とヶ月で区間を分けて毎月投資額を設定できます。区間が重なる場合は合算されます。</span>
          </div>

          <div className="field-label" style={{ marginBottom: 6 }}>つみたて投資枠の銘柄別内訳（金額を入れると割合を自動計算）</div>
          <AllocationBreakdown
            items={inputs.tsumitateAllocation}
            newItem={newTsumitateAllocItem}
            onNewItemChange={setNewTsumitateAllocItem}
            onAdd={() => addAllocationItem("tsumitateAllocation", newTsumitateAllocItem, setNewTsumitateAllocItem)}
            onRemove={(i) => removeAllocationItem("tsumitateAllocation", i)}
            onUpdate={(i, key, val) => updateAllocationItem("tsumitateAllocation", i, key, val)}
          />
          <div style={{ marginBottom: 18 }} />

          <div className="field-label" style={{ marginBottom: 6 }}>成長投資枠：毎月投資額（年齢区間ごとに設定）</div>
          {inputs.growthSchedule.length > 0 && (
            <table className="watchlist" style={{ marginBottom: 8 }}>
              <thead><tr><th>年齢</th><th>月額 / 上限との差</th><th></th></tr></thead>
              <tbody>
                {inputs.growthSchedule.map((r, i) => (
                  <tr key={i}>
                    <td>{formatAge(r.fromAge)}〜{formatAge(r.toAge)}</td>
                    <td className="mono">
                      <div>{yen(r.monthlyYen)}/月</div>
                      <div style={{ fontSize: 10, color: r.monthlyYen > growthMonthlyCapValue ? "#C2694F" : "#7C8A90" }}>
                        {formatCapDiff(growthMonthlyCapValue - r.monthlyYen)}
                      </div>
                      <div style={{ fontSize: 10, color: "#7C8A90" }}>
                        区間終了時 生涯枠残り {yen(lifetimeRemainingAtAge(r.toAge))}
                      </div>
                    </td>
                    <td style={{ width: 24 }}>
                      <button className="del-btn" onClick={() => removeGrowthRange(i)}><Trash2 size={13} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="add-row">
            <AgeYMInput
              placeholder="開始" years={newGrowthRange.fromYears} months={newGrowthRange.fromMonths}
              onYears={(v) => setNewGrowthRange((p) => ({ ...p, fromYears: v }))}
              onMonths={(v) => setNewGrowthRange((p) => ({ ...p, fromMonths: v }))}
            />
            <AgeYMInput
              placeholder="終了" years={newGrowthRange.toYears} months={newGrowthRange.toMonths}
              onYears={(v) => setNewGrowthRange((p) => ({ ...p, toYears: v }))}
              onMonths={(v) => setNewGrowthRange((p) => ({ ...p, toMonths: v }))}
            />
          </div>
          <div className="add-row" style={{ marginBottom: 14 }}>
            <input placeholder="毎月投資額（円）" type="number" value={newGrowthRange.monthlyYen} onChange={(e) => setNewGrowthRange((p) => ({ ...p, monthlyYen: e.target.value }))} />
            <button className="add-btn" onClick={addGrowthRange}><Plus size={15} /></button>
          </div>
          <div className="note">
            <Info size={13} />
            <span>例：「50歳0ヶ月〜55歳11ヶ月・月15万円」「56歳0ヶ月〜65歳0ヶ月・月5万円」のように、歳とヶ月で区間を分けて成長投資枠の毎月投資額を設定できます。区間が重なる場合は合算されます。</span>
          </div>

          <div className="field-label" style={{ marginBottom: 6 }}>成長投資枠の銘柄別内訳（金額を入れると割合を自動計算）</div>
          <AllocationBreakdown
            items={inputs.growthAllocation}
            newItem={newGrowthAllocItem}
            onNewItemChange={setNewGrowthAllocItem}
            onAdd={() => addAllocationItem("growthAllocation", newGrowthAllocItem, setNewGrowthAllocItem)}
            onRemove={(i) => removeAllocationItem("growthAllocation", i)}
            onUpdate={(i, key, val) => updateAllocationItem("growthAllocation", i, key, val)}
          />
          <div style={{ marginBottom: 18 }} />

          <div className="note">
            <Info size={13} />
            <span>
              年間上限：つみたて枠120万円（月10万円）／成長投資枠240万円（月20万円）。生涯投資枠は合計1,800万円（うち成長投資枠は1,200万円まで）。上限に達すると自動的にそれ以上の非課税投資は停止する前提で計算します。
            </span>
          </div>

          <div className="field-label" style={{ marginBottom: 6 }}>一括投資（成長投資枠・年齢と金額を指定）</div>
          {inputs.lumpSums.length > 0 && (
            <table className="watchlist" style={{ marginBottom: 8 }}>
              <thead><tr><th>年齢</th><th>金額 / 枠との差</th><th></th></tr></thead>
              <tbody>
                {inputs.lumpSums.map((entry, i) => {
                  const annualHeadroom = NISA_LIMITS.growthAnnual - (scheduledAmount(inputs.growthSchedule, entry.age) * 12 + entry.amount);
                  return (
                    <tr key={i}>
                      <td>{formatAge(entry.age)}</td>
                      <td className="mono">
                        <div>{yen(entry.amount)}</div>
                        <div style={{ fontSize: 10, color: annualHeadroom < 0 ? "#C2694F" : "#7C8A90" }}>
                          {formatCapDiff(annualHeadroom).replace("月上限", "年間上限")}
                        </div>
                        <div style={{ fontSize: 10, color: "#7C8A90" }}>
                          投資後 生涯枠残り {yen(lifetimeRemainingAtAge(entry.age))}
                        </div>
                      </td>
                      <td style={{ width: 24 }}>
                        <button className="del-btn" onClick={() => removeLump(i)}><Trash2 size={13} /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <div className="add-row" style={{ marginBottom: 14 }}>
            <AgeYMInput
              placeholder="投資時" years={newLump.years} months={newLump.months}
              onYears={(v) => setNewLump((p) => ({ ...p, years: v }))}
              onMonths={(v) => setNewLump((p) => ({ ...p, months: v }))}
            />
            <input placeholder="金額（円）" type="number" value={newLump.amount} onChange={(e) => setNewLump((p) => ({ ...p, amount: e.target.value }))} />
            <button className="add-btn" onClick={addLump}><Plus size={15} /></button>
          </div>

          <div className="field-label" style={{ marginBottom: 6 }}>一括投資の銘柄別内訳（金額を入れると割合を自動計算）</div>
          <AllocationBreakdown
            items={inputs.lumpAllocation}
            newItem={newLumpAllocItem}
            onNewItemChange={setNewLumpAllocItem}
            onAdd={() => addAllocationItem("lumpAllocation", newLumpAllocItem, setNewLumpAllocItem)}
            onRemove={(i) => removeAllocationItem("lumpAllocation", i)}
            onUpdate={(i, key, val) => updateAllocationItem("lumpAllocation", i, key, val)}
          />

          <div className="field-label" style={{ marginTop: 16, marginBottom: 6 }}>
            NISA資産の配分（積立・成長投資枠・一括投資の内訳に入れた銘柄がそのままスライダーになります）
          </div>
          {dynamicFunds.length > 0 ? (
            <>
              {dynamicFunds.map((f, i) => (
                <div key={f.id}>
                  <div className="alloc-row">
                    <span className="alloc-dot" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <div>
                      <div style={{ fontSize: 11, marginBottom: 2 }}>{f.id}</div>
                      <input type="range" min={0} max={100} value={f.pct} disabled />
                    </div>
                    <span className="alloc-val">{f.pct.toFixed(1)}%</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: -4, marginBottom: 10, paddingLeft: 24 }}>
                    <span style={{ fontSize: 10, color: "#7C8A90" }}>想定年率</span>
                    <input
                      type="number" step={0.5} className="inline-num" style={{ width: 60 }}
                      value={inputs.extraFundReturns[f.id] !== undefined ? inputs.extraFundReturns[f.id] : guessDefaultReturn(f.id)}
                      onChange={(e) => updateExtraFundReturn(f.id, Number(e.target.value))}
                    />
                    <span style={{ fontSize: 10, color: "#7C8A90" }}>%</span>
                  </div>
                </div>
              ))}
              <div className="alloc-sum">
                積立・成長投資枠・一括投資の内訳合計（{yen(combinedGrandTotal)}）から自動計算されています。
              </div>
              <div className="note" style={{ marginTop: 8 }}>
                <Info size={13} />
                <span>想定年率は、銘柄名から一般的な目安を自動で仮設定しています（実際の市場データではありません）。数値はいつでも手動で書き換えられます。</span>
              </div>
            </>
          ) : (
            <div className="note">
              <Info size={13} />
              <span>まだ銘柄が入力されていません。上の「積立投資枠」「成長投資枠」「一括投資」いずれかの銘柄別内訳に銘柄名と金額を入力すると、ここにスライダーが自動的に表示されます。</span>
            </div>
          )}

          <div className="note">
            <Info size={13} />
            <span>同じ系統のファンドを重ねすぎると分散効果が薄れる点にご注意ください（例：全世界株式とS&P500は米国株の比重が重なりやすい組み合わせです）。</span>
          </div>

          <SectionTitle index="03" title="iDeCo積立（個人型確定拠出年金）" icon={Landmark} />

          <div className="note">
            <Info size={13} />
            <span>
              iDeCoは老後資産形成制度です。原則として受給可能年齢まで引き出せません。運用成果は将来を保証するものではありません。節税額は概算です。
            </span>
          </div>

          <Field label="現在評価額" unit="円" step={10000} value={inputs.ideco.currentValue} onChange={(v) => updateIdeco("currentValue", v)} />
          <Field label="投資元本（これまでの掛金累計）" unit="円" step={10000} value={inputs.ideco.principalTotal} onChange={(v) => updateIdeco("principalTotal", v)} />
          <Field label="毎月掛金" unit="円" step={1000} value={inputs.ideco.monthlyContribution} onChange={(v) => updateIdeco("monthlyContribution", v)} />
          <AgeField label="掛金開始年齢" value={inputs.ideco.startAge} onChange={(v) => updateIdeco("startAge", v)} />
          <AgeField label="掛金終了年齢" value={inputs.ideco.endAge} onChange={(v) => updateIdeco("endAge", v)} />

          <label className="field">
            <span className="field-label">運用商品名</span>
            <div className="field-input-wrap">
              <input
                type="text" value={inputs.ideco.productName}
                onChange={(e) => updateIdeco("productName", e.target.value)}
                style={{ width: "100%" }}
              />
            </div>
          </label>

          <Field
            label={`想定年間利回り${inputs.ideco.returnPctAuto ? "（自動：商品名から仮設定）" : ""}`}
            unit="%" step={0.5}
            value={effectiveIdecoReturn}
            onChange={(v) => { updateIdeco("returnPct", v); updateIdeco("returnPctAuto", false); }}
          />
          {!inputs.ideco.returnPctAuto && (
            <div className="note" style={{ marginTop: -8 }}>
              <Info size={13} />
              <span>
                手動設定中です。
                <span
                  style={{ color: "#4FA8D8", textDecoration: "underline", cursor: "pointer", marginLeft: 4 }}
                  onClick={() => updateIdeco("returnPctAuto", true)}
                >
                  自動計算に戻す
                </span>
              </span>
            </div>
          )}

          <AgeField label="受取開始年齢" value={inputs.ideco.payoutStartAge} onChange={(v) => updateIdeco("payoutStartAge", v)} />

          <div className="field-label" style={{ marginBottom: 6 }}>受取方法</div>
          <div className="add-row" style={{ marginBottom: 14 }}>
            {[
              { key: "lump", label: "一時金" },
              { key: "pension", label: "年金" },
              { key: "both", label: "併用" },
            ].map((opt) => (
              <button
                key={opt.key}
                onClick={() => updateIdeco("payoutMethod", opt.key)}
                style={{
                  flex: 1, padding: "9px 8px", borderRadius: 4, fontSize: 12.5, cursor: "pointer",
                  border: inputs.ideco.payoutMethod === opt.key ? "1px solid #4FA8D8" : "1px solid var(--line)",
                  background: inputs.ideco.payoutMethod === opt.key ? "rgba(79,168,216,0.15)" : "var(--panel)",
                  color: inputs.ideco.payoutMethod === opt.key ? "#4FA8D8" : "var(--text)",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {(inputs.ideco.payoutMethod === "pension" || inputs.ideco.payoutMethod === "both") && (
            <>
              <Field label="年金受取期間" unit="年" step={1} value={inputs.ideco.payoutYears} onChange={(v) => updateIdeco("payoutYears", v)} />
              <Field label="受取中の想定運用利回り" unit="%" step={0.5} value={inputs.ideco.payoutReturnPct} onChange={(v) => updateIdeco("payoutReturnPct", v)} />
            </>
          )}
          {inputs.ideco.payoutMethod === "both" && (
            <Field label="一時金として受け取る割合" unit="%" step={5} min={0} max={100} value={inputs.ideco.lumpPortionPct} onChange={(v) => updateIdeco("lumpPortionPct", v)} />
          )}

          <div className="stat-sub" style={{ marginBottom: 4 }}>年間掛金：<span className="mono">{yen(idecoAnnualContribution)}</span></div>
          <div className="stat-sub" style={{ marginBottom: 4 }}>積立総額（見込み）：<span className="mono">{yen(idecoContributionTotal)}</span></div>
          <div className="stat-sub" style={{ marginBottom: 4 }}>運用益（現時点）：<span className="mono">{yen(idecoInvestmentGain)}</span></div>
          <div className="stat-sub" style={{ marginBottom: 4 }}>
            受取開始時点の予想資産：<span className="mono">{idecoSim.valueAtPayout !== null ? yen(idecoSim.valueAtPayout) : "—"}</span>
          </div>
          {(inputs.ideco.payoutMethod === "lump" || inputs.ideco.payoutMethod === "both") && (
            <div className="stat-sub" style={{ marginBottom: 4 }}>
              一時金として受け取る額（{inputs.ideco.payoutStartAge}歳に一度）：<span className="mono">{yen(idecoSim.lumpAmount)}</span>
            </div>
          )}
          {(inputs.ideco.payoutMethod === "pension" || inputs.ideco.payoutMethod === "both") && (
            <div className="stat-sub" style={{ marginBottom: 14 }}>
              年間予想受取額（{inputs.ideco.payoutStartAge}〜{idecoSim.payoutEndAge - 1}歳）：<span className="mono">{yen(idecoSim.annualPayout)}</span>
            </div>
          )}

          <div className="field-label" style={{ marginBottom: 6 }}>節税シミュレーション（概算）</div>
          <Field label="年収（任意）" unit="円" step={100000} value={inputs.ideco.annualIncome} onChange={(v) => updateIdeco("annualIncome", v)} />
          <div className="stat-sub" style={{ marginBottom: 4 }}>年間節税額（概算）：<span className="mono">{yen(idecoAnnualTaxSaving)}</span></div>
          <div className="stat-sub" style={{ marginBottom: 8 }}>積立終了までの累計節税額（概算）：<span className="mono">{yen(idecoCumulativeTaxSaving)}</span></div>
          <div className="note" style={{ marginTop: -4 }}>
            <Info size={13} />
            <span>節税額は、年収から推定した税率を使う簡易計算です。実際は給与所得控除、社会保険料、扶養・配偶者控除などを差し引いた課税所得で決まるため、表示額と異なる場合があります。年収未入力時は目安の税率20%で計算します。</span>
          </div>
          <div className="note">
            <Info size={13} />
            <span>受取開始後は、一時金は受取年に「現在使える資産」へ一度だけ加算され、年金は受取期間中「年間収入」へ加算されて生活費との差額の取り崩しに反映されます。受取期間が終わるとiDeCoからの収入加算は終了します。</span>
          </div>

          <SectionTitle index="04" title="老後・年金" icon={Landmark} />
          <div className="field-label" style={{ marginBottom: 6 }}>年金受給見込み額（国民年金・企業年金基金など、いくつでも追加できます）</div>
          {inputs.pensionSources.length > 0 && (
            <table className="watchlist" style={{ marginBottom: 8 }}>
              <thead><tr><th>年金の種類</th><th>月額</th><th></th></tr></thead>
              <tbody>
                {inputs.pensionSources.map((p, i) => (
                  <tr key={i}>
                    <td>{p.name}</td>
                    <td className="mono">{yen(p.monthlyAmount)}</td>
                    <td style={{ width: 24 }}>
                      <button className="del-btn" onClick={() => removePensionSource(i)}><Trash2 size={13} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="add-row" style={{ marginBottom: 8 }}>
            <input placeholder="例：国民年金、企業年金基金" value={newPensionSource.name} onChange={(e) => setNewPensionSource((p) => ({ ...p, name: e.target.value }))} />
            <input placeholder="月額（円）" type="number" value={newPensionSource.monthlyAmount} onChange={(e) => setNewPensionSource((p) => ({ ...p, monthlyAmount: e.target.value }))} />
            <button className="add-btn" onClick={addPensionSource}><Plus size={15} /></button>
          </div>
          <Field
            label={inputs.pensionSources.length > 0 ? "年金受給見込み額：合計（上のリストから自動反映）" : "年金受給見込み額"}
            unit="円/月"
            value={effectivePensionMonthly}
            disabled={inputs.pensionSources.length > 0}
            step={5000}
            onChange={(v) => update({ pensionMonthly: v })}
          />
          {inputs.pensionSources.length > 0 && (
            <div className="note" style={{ marginTop: -8 }}>
              <Info size={13} />
              <span>年金の種類を1件以上登録すると、この欄には自動的にその合計月額が反映され、編集できなくなります。手入力に戻したい場合は、登録した項目をすべて削除してください。</span>
            </div>
          )}
          <Field label="老後の生活費" unit="円/月" value={inputs.livingCostMonthly} step={5000} onChange={(v) => update({ livingCostMonthly: v })} />
          <Field
            label={`退職後の想定運用利回り${inputs.postRetireReturnAuto && dynamicFunds.length > 0 ? "（自動：現役時代の加重平均の半分）" : ""}`}
            unit="%" step={0.5}
            value={effectivePostRetireReturn}
            onChange={(v) => update({ postRetireReturn: v, postRetireReturnAuto: false })}
          />
          {!inputs.postRetireReturnAuto && dynamicFunds.length > 0 && (
            <div className="note" style={{ marginTop: -8 }}>
              <Info size={13} />
              <span>
                手動設定中です。
                <span
                  style={{ color: "#4FA8D8", textDecoration: "underline", cursor: "pointer", marginLeft: 4 }}
                  onClick={() => update({ postRetireReturnAuto: true })}
                >
                  自動計算に戻す
                </span>
              </span>
            </div>
          )}

          <SectionTitle index="05" title="健康リスク費用（自己負担目安）" icon={HeartPulse} />
          <Field label="60代 年間自己負担" unit="円/年" step={10000} value={inputs.healthBrackets.b60} onChange={(v) => updateHealth("b60", v)} />
          <Field label="70代 年間自己負担" unit="円/年" step={10000} value={inputs.healthBrackets.b70} onChange={(v) => updateHealth("b70", v)} />
          <Field label="80代以降 年間自己負担" unit="円/年" step={10000} value={inputs.healthBrackets.b80} onChange={(v) => updateHealth("b80", v)} />
          <div className="note">
            <Info size={13} />
            <span>公的医療保険の高額療養費制度を考慮した後の自己負担額の概算です。実際は所得区分により上限が変わるため目安としてご利用ください。</span>
          </div>

          <SectionTitle index="06" title="相続プラン" icon={Users} />
          {inputs.inheritancePlans.length > 0 && (
            <table className="watchlist" style={{ marginBottom: 8 }}>
              <thead><tr><th>名前</th><th>続柄</th><th>金額</th><th></th></tr></thead>
              <tbody>
                {inputs.inheritancePlans.map((p, i) => (
                  <tr key={i}>
                    <td>{p.name}</td>
                    <td style={{ color: "#7C8A90" }}>{p.relation || "—"}</td>
                    <td className="mono">{yen(p.amount)}</td>
                    <td style={{ width: 24 }}>
                      <button className="del-btn" onClick={() => removeInheritancePlan(i)}><Trash2 size={13} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="add-row" style={{ flexWrap: "wrap" }}>
            <input placeholder="名前" value={newInheritance.name} onChange={(e) => setNewInheritance((p) => ({ ...p, name: e.target.value }))} />
            <input placeholder="続柄（例：妻・長男）" value={newInheritance.relation} onChange={(e) => setNewInheritance((p) => ({ ...p, relation: e.target.value }))} />
          </div>
          <div className="add-row" style={{ marginBottom: 10 }}>
            <input placeholder="残したい金額（円）" type="number" value={newInheritance.amount} onChange={(e) => setNewInheritance((p) => ({ ...p, amount: e.target.value }))} />
            <button className="add-btn" onClick={addInheritancePlan}><Plus size={15} /></button>
          </div>
          {inputs.inheritancePlans.length > 0 && (
            <div className="stat-sub" style={{ marginBottom: 10 }}>
              相続予定 合計：<span className="mono">{yen(inheritanceTotal)}</span>（{inputs.inheritancePlans.length}名）
            </div>
          )}
          <Field
            label={inputs.inheritancePlans.length > 0 ? "子孫に残したい金額（上の合計が自動反映）" : "子孫に残したい金額"}
            unit="円" step={100000}
            value={effectiveInheritanceTarget}
            disabled={inputs.inheritancePlans.length > 0}
            onChange={(v) => update({ inheritanceTarget: v })}
          />
          {inputs.inheritancePlans.length > 0 && (
            <div className="note" style={{ marginTop: -8 }}>
              <Info size={13} />
              <span>相続予定を1人以上登録すると、この欄には自動的にその合計金額が反映され、編集できなくなります。手入力に戻したい場合は、登録した相続予定をすべて削除してください。</span>
            </div>
          )}

          <SectionTitle index="07" title="金（ゴールド）資産形成" icon={Coins} />
          <Field label="現在の保有量" unit="g" step={1} value={inputs.gold.currentGrams} onChange={(v) => updateGold("currentGrams", v)} />
          <Field label="現在の金価格（参考）" unit="円/g" step={100} value={inputs.gold.pricePerGram} onChange={(v) => updateGold("pricePerGram", v)} />
          <Field
            label={`想定 年率価格上昇率${inputs.gold.priceGrowthPctAuto ? "（自動仮設定）" : ""}`}
            unit="%" step={0.5}
            value={effectiveGoldReturnPct}
            onChange={(v) => { updateGold("priceGrowthPct", v); updateGold("priceGrowthPctAuto", false); }}
          />
          {!inputs.gold.priceGrowthPctAuto && (
            <div className="note" style={{ marginTop: -8 }}>
              <Info size={13} />
              <span>
                手動設定中です。
                <span
                  style={{ color: "#4FA8D8", textDecoration: "underline", cursor: "pointer", marginLeft: 4 }}
                  onClick={() => updateGold("priceGrowthPctAuto", true)}
                >
                  自動計算に戻す
                </span>
              </span>
            </div>
          )}
          <Field label="毎月の積立額" unit="円/月" step={1000} value={inputs.gold.monthlyYen} onChange={(v) => updateGold("monthlyYen", v)} />
          <AgeField label="積立を続ける年齢（まで）" value={inputs.gold.accumulateUntilAge} onChange={(v) => updateGold("accumulateUntilAge", v)} />
          <div className="note">
            <Info size={13} />
            <span>金価格は2026年7月時点の店頭小売価格（1g ≈ 24,000円前後）を参考値としています。実際の価格は日々変動するため、最新の価格に置き換えてご利用ください。</span>
          </div>

          <SectionTitle index="08" title="銀行預金（銀行別）" icon={PiggyBank} />
          {inputs.banks.length > 0 && (
            <table className="watchlist" style={{ marginBottom: 8 }}>
              <thead><tr><th>銀行名</th><th>残高</th><th>月次入金</th><th></th></tr></thead>
              <tbody>
                {inputs.banks.map((b, i) => (
                  <tr key={i}>
                    <td>{b.name}</td>
                    <td className="mono">{yen(b.balance)}</td>
                    <td className="mono">{yen(b.monthlyDeposit)}/月</td>
                    <td style={{ width: 24 }}>
                      <button className="del-btn" onClick={() => removeBank(i)}><Trash2 size={13} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="add-row" style={{ flexWrap: "wrap" }}>
            <input placeholder="銀行名" value={newBank.name} onChange={(e) => setNewBank((p) => ({ ...p, name: e.target.value }))} />
            <input placeholder="現在の残高（円）" type="number" value={newBank.balance} onChange={(e) => setNewBank((p) => ({ ...p, balance: e.target.value }))} />
          </div>
          <div className="add-row">
            <input placeholder="毎月入金額（円）" type="number" value={newBank.monthlyDeposit} onChange={(e) => setNewBank((p) => ({ ...p, monthlyDeposit: e.target.value }))} />
            <input placeholder="金利（%・任意）" type="number" value={newBank.interestPct} onChange={(e) => setNewBank((p) => ({ ...p, interestPct: e.target.value }))} />
            <button className="add-btn" onClick={addBank}><Plus size={15} /></button>
          </div>
          <div className="note">
            <Info size={13} />
            <span>毎月入金は引退年齢（{inputs.retireAge}歳）まで継続する前提で計算します。金利は普通預金なら0〜0.1%程度が目安です。</span>
          </div>

          <SectionTitle index="09" title="借入金（返済シミュレーション）" icon={Landmark} />
          {inputs.loans.length > 0 && (
            <table className="watchlist" style={{ marginBottom: 8 }}>
              <thead><tr><th>名称</th><th>残元本</th><th>金利</th><th>月返済</th><th></th></tr></thead>
              <tbody>
                {inputs.loans.map((l, i) => (
                  <tr key={i}>
                    <td>{l.name}</td>
                    <td className="mono">{yen(l.principal)}</td>
                    <td className="mono">{l.annualRatePct}%</td>
                    <td className="mono">{yen(l.monthlyPayment)}/月</td>
                    <td style={{ width: 24 }}>
                      <button className="del-btn" onClick={() => removeLoan(i)}><Trash2 size={13} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="add-row" style={{ flexWrap: "wrap" }}>
            <input placeholder="名称（例：住宅ローン）" value={newLoan.name} onChange={(e) => setNewLoan((p) => ({ ...p, name: e.target.value }))} />
            <input placeholder="借入残高（円）" type="number" value={newLoan.principal} onChange={(e) => setNewLoan((p) => ({ ...p, principal: e.target.value }))} />
          </div>
          <div className="add-row">
            <input placeholder="金利（年率%）" type="number" value={newLoan.annualRatePct} onChange={(e) => setNewLoan((p) => ({ ...p, annualRatePct: e.target.value }))} />
            <input placeholder="毎月返済額（円）" type="number" value={newLoan.monthlyPayment} onChange={(e) => setNewLoan((p) => ({ ...p, monthlyPayment: e.target.value }))} />
            <button className="add-btn" onClick={addLoan}><Plus size={15} /></button>
          </div>
          {loanSim.payoffAges.some((a) => a !== null) && (
            <div className="note">
              <Info size={13} />
              <span>
                完済予定：{inputs.loans.map((l, i) => (
                  <span key={i}>{i > 0 && "、"}{l.name} {loanSim.payoffAges[i] ? `${Math.round(loanSim.payoffAges[i])}歳` : "返済額不足のため未完済"}</span>
                ))}
              </span>
            </div>
          )}

          <SectionTitle index="10" title="生命保険" icon={HeartPulse} />
          {inputs.insurancePolicies.length > 0 && (
            <table className="watchlist" style={{ marginBottom: 10 }}>
              <thead><tr><th>保険名</th><th>払込 / 保障</th><th></th></tr></thead>
              <tbody>
                {inputs.insurancePolicies.map((p, i) => (
                  <tr key={i}>
                    <td>{p.name}</td>
                    <td className="mono" style={{ fontSize: 10.5 }}>
                      <div>払込 {formatAge(p.premiumFromAge)}〜{formatAge(p.premiumToAge)}：{yen(p.monthlyPremium)}/月</div>
                      <div style={{ color: "#7C8A90" }}>保障 {formatAge(p.coverageUntilAge)}まで</div>
                      <div style={{ color: "#7C8A90" }}>
                        入院{yen(p.benefits.hospitalizationPerDay)}/日（限度{p.benefits.hospitalizationDaysLimit || 0}日/回）・
                        手術{yen(p.benefits.hospitalizationSurgery)}・
                        日帰り{yen(p.benefits.daySurgery)}・放射線{yen(p.benefits.radiationPerSession)}/回・
                        先進医療{yen(p.benefits.advancedMedical)}・死亡{yen(p.benefits.death)}
                      </div>
                      {(p.customBenefits || []).length > 0 && (
                        <div style={{ color: "#7C8A90", marginTop: 4 }}>
                          {p.customBenefits.map((cb, j) => (
                            <div key={j} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <span>{cb.name}：{yen(cb.amount)}</span>
                              <button className="del-btn" onClick={() => removeCustomBenefit(i, j)}><Trash2 size={11} /></button>
                            </div>
                          ))}
                        </div>
                      )}
                      <CustomBenefitEditor onAdd={(name, amount) => addCustomBenefit(i, name, amount)} />
                    </td>
                    <td style={{ width: 24 }}>
                      <button className="del-btn" onClick={() => removeInsurance(i)}><Trash2 size={13} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="field-label" style={{ marginBottom: 4 }}>保険名</div>
          <div className="add-row" style={{ marginBottom: 8 }}>
            <input placeholder="例：〇〇生命 医療保険" value={newInsurance.name} onChange={(e) => setNewInsurance((p) => ({ ...p, name: e.target.value }))} />
          </div>

          <div className="field-label" style={{ marginBottom: 4 }}>掛け金払込：開始〜終了</div>
          <div className="add-row" style={{ marginBottom: 8 }}>
            <AgeYMInput
              placeholder="開始" years={newInsurance.premiumFromYears} months={newInsurance.premiumFromMonths}
              onYears={(v) => setNewInsurance((p) => ({ ...p, premiumFromYears: v }))}
              onMonths={(v) => setNewInsurance((p) => ({ ...p, premiumFromMonths: v }))}
            />
            <AgeYMInput
              placeholder="終了" years={newInsurance.premiumToYears} months={newInsurance.premiumToMonths}
              onYears={(v) => setNewInsurance((p) => ({ ...p, premiumToYears: v }))}
              onMonths={(v) => setNewInsurance((p) => ({ ...p, premiumToMonths: v }))}
            />
          </div>
          <div className="add-row" style={{ marginBottom: 8 }}>
            <input placeholder="毎月の払込金額（円）" type="number" value={newInsurance.monthlyPremium} onChange={(e) => setNewInsurance((p) => ({ ...p, monthlyPremium: e.target.value }))} />
          </div>

          <div className="field-label" style={{ marginBottom: 4 }}>何歳までの保証か</div>
          <div className="add-row" style={{ marginBottom: 8 }}>
            <AgeYMInput
              placeholder="保証" years={newInsurance.coverageUntilYears} months={newInsurance.coverageUntilMonths}
              onYears={(v) => setNewInsurance((p) => ({ ...p, coverageUntilYears: v }))}
              onMonths={(v) => setNewInsurance((p) => ({ ...p, coverageUntilMonths: v }))}
            />
          </div>

          <div className="field-label" style={{ marginBottom: 4 }}>保障内容（項目別の金額）</div>
          <div className="add-row" style={{ marginBottom: 6 }}>
            <LabeledMiniInput label="入院1日あたり（円）" value={newInsurance.hospitalizationPerDay} onChange={(e) => setNewInsurance((p) => ({ ...p, hospitalizationPerDay: e.target.value }))} />
            <LabeledMiniInput label="限度日数（1回何日まで）" value={newInsurance.hospitalizationDaysLimit} onChange={(e) => setNewInsurance((p) => ({ ...p, hospitalizationDaysLimit: e.target.value }))} />
          </div>
          <div className="add-row" style={{ marginBottom: 6 }}>
            <LabeledMiniInput label="入院手術（円）" value={newInsurance.hospitalizationSurgery} onChange={(e) => setNewInsurance((p) => ({ ...p, hospitalizationSurgery: e.target.value }))} />
            <LabeledMiniInput label="日帰り手術（円）" value={newInsurance.daySurgery} onChange={(e) => setNewInsurance((p) => ({ ...p, daySurgery: e.target.value }))} />
          </div>
          <div className="add-row" style={{ marginBottom: 6 }}>
            <LabeledMiniInput label="放射線治療1回（円）" value={newInsurance.radiationPerSession} onChange={(e) => setNewInsurance((p) => ({ ...p, radiationPerSession: e.target.value }))} />
            <LabeledMiniInput label="先進医療（円）" value={newInsurance.advancedMedical} onChange={(e) => setNewInsurance((p) => ({ ...p, advancedMedical: e.target.value }))} />
          </div>
          <div className="add-row" style={{ marginBottom: 10 }}>
            <LabeledMiniInput label="死亡保険金（円）" value={newInsurance.death} onChange={(e) => setNewInsurance((p) => ({ ...p, death: e.target.value }))} />
          </div>
          <div className="add-row" style={{ marginBottom: 14 }}>
            <button className="add-btn" onClick={addInsurance} style={{ width: "100%" }}><Plus size={15} /></button>
          </div>
          <div className="note">
            <Info size={13} />
            <span>払込中の保険料は将来資産から自動的に控除されます。入院・手術等の給付額は保障内容の記録用で、発生が不確実なため資産予測には自動反映されません（必要に応じて健康費用の想定額をご自身で調整してください）。登録後、各保険の項目下にある欄から項目名を自由に追加できます。</span>
          </div>

          <SectionTitle index="11" title="民間年金積立" icon={PiggyBank} />
          {inputs.privatePensionPlans.length > 0 && (
            <table className="watchlist" style={{ marginBottom: 10 }}>
              <thead><tr><th>年金名</th><th>積立 / 受給</th><th></th></tr></thead>
              <tbody>
                {inputs.privatePensionPlans.map((pl, i) => (
                  <tr key={i}>
                    <td>{pl.name}</td>
                    <td className="mono" style={{ fontSize: 10.5 }}>
                      <div>積立 {formatAge(pl.contribFromAge)}〜{formatAge(pl.contribToAge)}：{yen(pl.monthlyContribution)}/月</div>
                      <div style={{ color: "#7C8A90" }}>受給 {formatAge(pl.payoutFromAge)}〜{formatAge(pl.payoutToAge)}：{yen(pl.monthlyPayout)}/月</div>
                      {pl.currentBalance !== null && pl.currentBalance !== undefined && (
                        <div style={{ color: "#6FA88A" }}>現在の残高（手入力）：{yen(pl.currentBalance)}</div>
                      )}
                    </td>
                    <td style={{ width: 24 }}>
                      <button className="del-btn" onClick={() => removePension(i)}><Trash2 size={13} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="field-label" style={{ marginBottom: 4 }}>年金名</div>
          <div className="add-row" style={{ marginBottom: 8 }}>
            <input placeholder="例：〇〇個人年金保険" value={newPension.name} onChange={(e) => setNewPension((p) => ({ ...p, name: e.target.value }))} />
          </div>

          <div className="field-label" style={{ marginBottom: 4 }}>積立期間：開始〜終了</div>
          <div className="add-row" style={{ marginBottom: 8 }}>
            <AgeYMInput
              placeholder="開始" years={newPension.contribFromYears} months={newPension.contribFromMonths}
              onYears={(v) => setNewPension((p) => ({ ...p, contribFromYears: v }))}
              onMonths={(v) => setNewPension((p) => ({ ...p, contribFromMonths: v }))}
            />
            <AgeYMInput
              placeholder="終了" years={newPension.contribToYears} months={newPension.contribToMonths}
              onYears={(v) => setNewPension((p) => ({ ...p, contribToYears: v }))}
              onMonths={(v) => setNewPension((p) => ({ ...p, contribToMonths: v }))}
            />
          </div>
          <div className="add-row" style={{ marginBottom: 8 }}>
            <LabeledMiniInput label="毎月の積立金額（円）" value={newPension.monthlyContribution} onChange={(e) => setNewPension((p) => ({ ...p, monthlyContribution: e.target.value }))} />
          </div>

          <div className="field-label" style={{ marginBottom: 4 }}>年金受給期間：開始〜終了</div>
          <div className="add-row" style={{ marginBottom: 8 }}>
            <AgeYMInput
              placeholder="開始" years={newPension.payoutFromYears} months={newPension.payoutFromMonths}
              onYears={(v) => setNewPension((p) => ({ ...p, payoutFromYears: v }))}
              onMonths={(v) => setNewPension((p) => ({ ...p, payoutFromMonths: v }))}
            />
            <AgeYMInput
              placeholder="終了" years={newPension.payoutToYears} months={newPension.payoutToMonths}
              onYears={(v) => setNewPension((p) => ({ ...p, payoutToYears: v }))}
              onMonths={(v) => setNewPension((p) => ({ ...p, payoutToMonths: v }))}
            />
          </div>
          <div className="add-row" style={{ marginBottom: 10 }}>
            <LabeledMiniInput label="受給時に毎月もらえる金額（円）" value={newPension.monthlyPayout} onChange={(e) => setNewPension((p) => ({ ...p, monthlyPayout: e.target.value }))} />
          </div>
          <div className="field-label" style={{ marginBottom: 4 }}>現在の残高（円・任意）</div>
          <div className="add-row" style={{ marginBottom: 10 }}>
            <input
              type="number"
              placeholder="未入力なら積立実績から自動概算"
              value={newPension.currentBalance}
              onChange={(e) => setNewPension((p) => ({ ...p, currentBalance: e.target.value }))}
            />
          </div>
          <div className="add-row" style={{ marginBottom: 14 }}>
            <button className="add-btn" onClick={addPension} style={{ width: "100%" }}><Plus size={15} /></button>
          </div>
          <div className="note">
            <Info size={13} />
            <span>積立期間中は毎月の積立額を貯め、受給期間中はそこから毎月の受給額を取り崩していく残高として、生涯資産グラフに資産の一部として反映されます。さらに受給額は、公的年金と同様に生活費・健康費用の補填としても扱われ、NISA資産の取り崩しペースを緩める効果があります。「現在の残高」を入力すると、証書に記載の実際の解約返戻金額などをそのまま開始残高として使用します（未入力の場合は積立開始年齢〜現在までの積立額の単純合計＝0%運用想定で自動概算します）。</span>
          </div>
        </div>

        {/* -------- RIGHT: DASHBOARD -------- */}
        <div className="content">
          <div className="stat-grid" style={{ marginBottom: 10 }}>
            <StatCard label="投資資産：NISA" value={yen(effectiveCurrentAssets)} sub="現在のNISA評価額" />
            <StatCard label="投資資産：iDeCo" value={yen(inputs.ideco.currentValue)} sub="現在のiDeCo評価額" />
          </div>
          <div className="stat-grid" style={{ marginBottom: 14 }}>
            <StatCard
              label="現在使える資産"
              value={yen((netWorthYearly[0]?.spendableNetWorth) ?? (netWorthFinal - idecoSim.finalValue))}
              sub="iDeCoロック分を除く、現時点の資産"
              tone="good"
            />
            <StatCard
              label="老後専用資産（iDeCo）"
              value={yen((netWorthYearly[0]?.idecoLockedValue) ?? idecoSim.finalValue)}
              sub="受取開始年齢までは引き出せません"
            />
          </div>
          <div className="stat-grid" style={{ marginBottom: 10 }}>
            <StatCard
              label="つみたて投資枠 残り"
              value={yen(remainingTsumitate)}
              sub="総枠（1,800万円）を成長投資枠と共有"
              tone={remainingTsumitate <= 0 ? "danger" : "good"}
            />
            <StatCard
              label="成長投資枠 残り"
              value={yen(remainingGrowth)}
              sub={`上限1,200万円 中 ${yen(computedGrowthUsed)} 使用済み`}
              tone={remainingGrowth <= 0 ? "danger" : "good"}
            />
            <StatCard
              label="生涯投資枠（総枠） 残り"
              value={yen(remainingTotal)}
              sub={`上限1,800万円 中 ${yen(computedTsumitateUsed + computedGrowthUsed)} 使用済み`}
              tone={remainingTotal <= 0 ? "danger" : "good"}
            />
          </div>
          <div className="stat-grid" style={{ marginBottom: 14 }}>
            <StatCard
              label="つみたて投資枠 上限オーバー額"
              value={yen(tsumitateOverage)}
              sub={tsumitateOverage > 0 ? "総枠1,800万円を単独で超えています" : "上限内におさまっています"}
              tone={tsumitateOverage > 0 ? "danger" : "good"}
            />
            <StatCard
              label="成長投資枠 上限オーバー額"
              value={yen(growthOverage)}
              sub={growthOverage > 0 ? "上限1,200万円を超えています" : "上限内におさまっています"}
              tone={growthOverage > 0 ? "danger" : "good"}
            />
            <StatCard
              label="生涯投資枠（総枠） 上限オーバー額"
              value={yen(totalOverage)}
              sub={totalOverage > 0 ? "上限1,800万円を超えています" : "上限内におさまっています"}
              tone={totalOverage > 0 ? "danger" : "good"}
            />
          </div>
          {(growthOverage > 0 || totalOverage > 0) && (
            <div className="note" style={{ borderLeftColor: "#C2694F", marginBottom: 22 }}>
              <Info size={13} style={{ color: "#C2694F" }} />
              <span>
                入力された「これまでの使用累計」がNISAの上限を超えています。
                {growthOverage > 0 && ` 成長投資枠は上限を${yen(growthOverage)}超過。`}
                {totalOverage > 0 && ` 総枠（生涯上限）は${yen(totalOverage)}超過。`}
                実際の証券口座の使用累計をご確認のうえ、数値を見直してください。
              </span>
            </div>
          )}

          <div className="chart-frame" style={{ marginBottom: 22 }}>
            <div className="chart-label">現在のNISA資産の内訳 — つみたて投資枠 × 成長投資枠（現在日付での使用累計ベース）</div>
            <AllocationCharts items={nisaFrameAllocationItems} height={160} />
          </div>

          <div className="stat-grid" style={{ marginBottom: 14 }}>
            <StatCard
              label="つみたて 年間上限 残り（現在の年齢のペース基準）"
              value={yen(tsumitateAnnualRemaining)}
              sub={
                tsumitateAnnualOverage > 0
                  ? `年間上限120万円を ${yen(tsumitateAnnualOverage)} 超過するペースです（自動的に月10万円に調整されます）`
                  : `月${yen(currentTsumitateMonthly)}のペース（年換算 ${yen(tsumitateAnnualPace)}）`
              }
              tone={tsumitateAnnualOverage > 0 ? "danger" : "good"}
            />
            <StatCard
              label="成長投資枠 年間上限 残り（現在のペース基準）"
              value={yen(growthAnnualRemaining)}
              sub={
                growthAnnualOverage > 0
                  ? `年間上限240万円を ${yen(growthAnnualOverage)} 超過するペースです（自動的に月20万円に調整されます）`
                  : `月${yen(currentGrowthMonthly)}のペース（年換算 ${yen(growthAnnualPace)}）`
              }
              tone={growthAnnualOverage > 0 ? "danger" : "good"}
            />
          </div>

          <div className="stat-grid">
            <StatCard label={`${inputs.retireAge}歳時点の資産`} value={yen(sim.assetsAtRetire)} sub="積立フェーズ終了時" />
            <StatCard
              label={`${inputs.deathAge}歳時点の総資産（NISA+金+預金・相続可能額）`}
              value={yen(netWorthFinal)}
              sub={netInheritanceGap >= 0 ? `目標に対し +${yen(netInheritanceGap)}` : `目標に対し ${yen(netInheritanceGap)}`}
              tone={netInheritanceGap >= 0 ? "good" : "danger"}
            />
            <StatCard
              label="老後の月次収支ギャップ"
              value={`${netMonthlyGap >= 0 ? "" : "+"}${yen(-netMonthlyGap)}`}
              sub={netMonthlyGap >= 0 ? "年金だけでは不足（資産取崩し要）" : "年金で生活費を賄える"}
              tone={netMonthlyGap > 0 ? "danger" : "good"}
            />
            <StatCard
              label="資産の持続性"
              value={sim.depletionAge ? `${Math.round(sim.depletionAge)}歳で枯渇` : "生涯枯渇なし"}
              sub={sim.depletionAge ? "取崩し速度の見直しが必要" : "現在の前提では維持可能"}
              tone={sim.depletionAge ? "danger" : "good"}
            />
          </div>

          <div className="stat-grid" style={{ marginBottom: 22 }}>
            <StatCard
              label="つみたて投資枠 生涯累計使用額（予測）"
              value={yen(sim.tsumitateCum)}
              sub={`生涯合算枠 ${yen(NISA_LIMITS.totalLifetime)} 中`}
            />
            <StatCard
              label="成長投資枠 生涯累計使用額（予測）"
              value={`${yen(sim.growthCum)} / ${yen(NISA_LIMITS.growthLifetime)}`}
              sub={sim.growthMaxedAge ? `${Math.round(sim.growthMaxedAge)}歳で上限到達見込み` : "上限未到達の見込み"}
              tone={sim.growthMaxedAge ? "danger" : "good"}
            />
            <StatCard
              label="NISA総枠 生涯累計使用額（予測）"
              value={`${yen(sim.tsumitateCum + sim.growthCum)} / ${yen(NISA_LIMITS.totalLifetime)}`}
              sub={sim.totalMaxedAge ? `${Math.round(sim.totalMaxedAge)}歳で使い切り見込み` : "生涯枠に余裕がある見込み"}
              tone={sim.totalMaxedAge ? "danger" : "good"}
            />
          </div>

          <div className="stat-grid" style={{ marginBottom: 22 }}>
            <StatCard
              label={`金資産 — ${formatAge(inputs.gold.accumulateUntilAge)}時点`}
              value={yen(goldSim.valueAtTarget)}
              sub={`${goldSim.yearly.find((y) => y.age >= inputs.gold.accumulateUntilAge)?.grams.toFixed(1) ?? goldSim.finalGrams.toFixed(1)}g 想定`}
            />
            <StatCard
              label="銀行預金 合計（現在）"
              value={yen(bankSim.totalNow)}
              sub={inputs.banks.length ? `${inputs.banks.length}行に分散` : "銀行口座が未登録です"}
            />
            <StatCard
              label={`銀行預金 合計 — ${inputs.retireAge}歳時点`}
              value={yen(bankSim.totalAtRetire)}
              sub="毎月入金を継続した場合の見込み"
            />
            <StatCard
              label="個別株 保有評価額（現在）"
              value={yen(stockTotalNow)}
              sub={`${watchlist.filter((w) => w.value > 0).length}銘柄に保有あり`}
            />
            <StatCard
              label="借入金 残高（現在）"
              value={yen(loanSim.totalNow)}
              sub={inputs.loans.length ? `${inputs.loans.length}件の借入` : "借入金なし"}
              tone={loanSim.totalNow > 0 ? "danger" : "good"}
            />
            <StatCard
              label="生命保険 払込累計（生涯）"
              value={yen(insuranceSim.totalFinal)}
              sub={inputs.insurancePolicies.length ? `${inputs.insurancePolicies.length}件の保険` : "保険未登録"}
              tone={insuranceSim.totalFinal > 0 ? "danger" : "good"}
            />
            <StatCard
              label="民間年金 積立残高（受給終了時点）"
              value={yen(pensionSim.totalFinal)}
              sub={inputs.privatePensionPlans.length ? `${inputs.privatePensionPlans.length}件の年金プラン` : "未登録"}
              tone="good"
            />
          </div>

          <div className="chart-frame">
            <div className="chart-label">総資産推移 — NISA + 金 + 銀行預金 + 個別株 + 民間年金積立 + iDeCo − 借入金 − 保険料累計（{effectiveCurrentAge}歳 〜 {inputs.deathAge}歳）</div>
            <ResponsiveContainer width="100%" height={340}>
              <ComposedChart data={netWorthYearly} margin={{ top: 10, right: 24, left: 8, bottom: 4 }}>
                <CartesianGrid stroke="#2A363C" strokeDasharray="3 3" />
                <XAxis dataKey="age" stroke="#7C8A90" fontSize={11} tickFormatter={(a) => `${a}`} />
                <YAxis stroke="#7C8A90" fontSize={11} tickFormatter={(v) => yen(v)} width={64} />
                <Tooltip
                  contentStyle={{ background: "#151C20", border: "1px solid #2A363C", fontSize: 12 }}
                  labelFormatter={(a) => `${a}歳`}
                  formatter={(v, n) => [yen(v), n]}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <ReferenceLine x={inputs.retireAge} stroke="#D9A54F" strokeDasharray="4 4" label={{ value: "引退", position: "top", fill: "#D9A54F", fontSize: 11 }} />
                {inputs.lumpSums.map((entry, i) => (
                  <ReferenceLine key={i} x={entry.age} stroke="#8FBF7F" strokeDasharray="2 3" label={{ value: "一括", position: "insideTop", fill: "#8FBF7F", fontSize: 10 }} />
                ))}
                {sim.depletionAge && (
                  <ReferenceLine x={Math.round(sim.depletionAge)} stroke="#C2694F" strokeDasharray="4 4" label={{ value: "枯渇", position: "top", fill: "#C2694F", fontSize: 11 }} />
                )}
                <Area type="monotone" dataKey="total" name="NISA資産" stackId="net" stroke="#4FA8D8" fill="rgba(79,168,216,0.35)" strokeWidth={1.5} />
                <Area type="monotone" dataKey="goldValue" name="金資産" stackId="net" stroke="#D9A54F" fill="rgba(217,165,79,0.35)" strokeWidth={1.5} />
                <Area type="monotone" dataKey="bankValue" name="銀行預金" stackId="net" stroke="#8FBF7F" fill="rgba(143,191,127,0.35)" strokeWidth={1.5} />
                <Area type="monotone" dataKey="stockValue" name="個別株" stackId="net" stroke="#B08FD6" fill="rgba(176,143,214,0.35)" strokeWidth={1.5} />
                <Area type="monotone" dataKey="pensionValue" name="民間年金積立" stackId="net" stroke="#6FA88A" fill="rgba(111,168,138,0.35)" strokeWidth={1.5} />
                <Area type="monotone" dataKey="idecoLockedValue" name="iDeCo資産" stackId="net" stroke="#D68FB0" fill="rgba(214,143,176,0.35)" strokeWidth={1.5} />
                <Line type="monotone" dataKey="netWorth" name="純資産（借入金・保険料控除後）" stroke="#F2F5F6" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="note" style={{ marginBottom: 22 }}>
            <Info size={13} />
            <span>塗りつぶし部分は資産の内訳（総額）、白い線が借入金・生命保険の払込累計額を差し引いた実質的な純資産です。</span>
          </div>

          {sim.lumpTruncations.length > 0 && (
            <div className="note" style={{ borderLeftColor: "#C2694F", marginBottom: 22 }}>
              <Info size={13} style={{ color: "#C2694F" }} />
              <span>
                一部の一括投資は成長投資枠・生涯枠の上限を超えたため、超過分（
                {sim.lumpTruncations.map((t, i) => (
                  <span key={i}>{i > 0 && "、"}{t.age}歳時点で{yen(t.shortfall)}</span>
                ))}
                ）は非課税枠に反映されていません。
              </span>
            </div>
          )}

          <div className="two-col">
            <div className="chart-frame">
              <div className="chart-label">{inputs.retireAge}歳時点 ファンド別内訳</div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={fundBreakdownAtRetire} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid stroke="#2A363C" strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" stroke="#7C8A90" fontSize={11} tickFormatter={(v) => yen(v)} />
                  <YAxis type="category" dataKey="name" stroke="#7C8A90" fontSize={11} width={90} />
                  <Tooltip contentStyle={{ background: "#151C20", border: "1px solid #2A363C", fontSize: 12 }} formatter={(v) => yen(v)} />
                  <Bar dataKey="value" radius={[0, 3, 3, 0]}>
                    {fundBreakdownAtRetire.map((f, i) => (
                      <Cell key={i} fill={f.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="chart-frame" style={{ padding: "16px 16px 18px" }}>
              <div className="chart-label" style={{ padding: 0, marginBottom: 10 }}>個別株 保有一覧（個数・保有金額を入力）</div>
              <table className="watchlist">
                <thead>
                  <tr><th>銘柄</th><th>セクター</th><th>個数</th><th>保有金額</th><th></th></tr>
                </thead>
                <tbody>
                  {watchlist.map((s, i) => (
                    <tr key={i}>
                      <td>{s.name}</td>
                      <td style={{ color: "#7C8A90" }}>{s.sector}</td>
                      <td style={{ width: 64 }}>
                        <input
                          type="number" value={s.shares} className="mono inline-num"
                          onChange={(e) => updateStockField(i, "shares", Number(e.target.value))}
                        />
                      </td>
                      <td style={{ width: 96 }}>
                        <input
                          type="number" value={s.value} className="mono inline-num"
                          onChange={(e) => updateStockField(i, "value", Number(e.target.value))}
                        />
                      </td>
                      <td style={{ width: 24 }}>
                        <button className="del-btn" onClick={() => removeStock(i)}><Trash2 size={13} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="add-row">
                <input placeholder="銘柄名" value={newStock.name} onChange={(e) => setNewStock((p) => ({ ...p, name: e.target.value }))} />
                <input placeholder="セクター" value={newStock.sector} onChange={(e) => setNewStock((p) => ({ ...p, sector: e.target.value }))} />
                <button className="add-btn" onClick={addStock}><Plus size={15} /></button>
              </div>
              <div className="stat-sub" style={{ marginTop: 10 }}>保有合計：<span className="mono">{yen(stockTotalNow)}</span></div>
              <Field
                label={`${inputs.deathAge}歳までの想定年率（個別株全体）${inputs.stockReturnPctAuto ? "（自動：保有銘柄名から仮設定）" : ""}`} unit="%" step={0.5}
                value={effectiveStockReturnPct} onChange={(v) => update({ stockReturnPct: v, stockReturnPctAuto: false })}
              />
              {!inputs.stockReturnPctAuto && (
                <div className="note" style={{ marginTop: -8 }}>
                  <Info size={13} />
                  <span>
                    手動設定中です。
                    <span
                      style={{ color: "#4FA8D8", textDecoration: "underline", cursor: "pointer", marginLeft: 4 }}
                      onClick={() => update({ stockReturnPctAuto: true })}
                    >
                      自動計算に戻す
                    </span>
                  </span>
                </div>
              )}
              {stockAllocationItems.length > 0 && (
                <>
                  <div className="chart-label" style={{ padding: 0, margin: "12px 0 4px" }}>保有金額に連動した銘柄別割合</div>
                  <AllocationCharts items={stockAllocationItems} height={160} />
                </>
              )}
            </div>
          </div>

          {inputs.loans.length > 0 && (
            <div className="chart-frame" style={{ marginTop: 16 }}>
              <div className="chart-label">借入金 残高推移 — 年齢ごとの見込み（現在 / {inputs.retireAge}歳 / {inputs.deathAge}歳）</div>
              <ResponsiveContainer width="100%" height={Math.max(180, inputs.loans.length * 46)}>
                <BarChart data={loanBreakdownByAge} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid stroke="#2A363C" strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" stroke="#7C8A90" fontSize={11} tickFormatter={(v) => yen(v)} />
                  <YAxis type="category" dataKey="name" stroke="#7C8A90" fontSize={11} width={90} />
                  <Tooltip contentStyle={{ background: "#151C20", border: "1px solid #2A363C", fontSize: 12 }} formatter={(v) => yen(v)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="現在" fill="#C2694F" radius={[0, 2, 2, 0]} />
                  <Bar dataKey={`${inputs.retireAge}歳`} fill="#D9877A" radius={[0, 2, 2, 0]} />
                  <Bar dataKey={`${inputs.deathAge}歳`} fill="#E6B0A6" radius={[0, 2, 2, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {inputs.banks.length > 0 && (
            <div className="chart-frame" style={{ marginTop: 16 }}>
              <div className="chart-label">銀行別 預金残高 — 年齢ごとの見込み（現在 / {inputs.retireAge}歳 / {inputs.deathAge}歳）</div>
              <ResponsiveContainer width="100%" height={Math.max(180, inputs.banks.length * 46)}>
                <BarChart data={bankBreakdownByAge} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid stroke="#2A363C" strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" stroke="#7C8A90" fontSize={11} tickFormatter={(v) => yen(v)} />
                  <YAxis type="category" dataKey="name" stroke="#7C8A90" fontSize={11} width={90} />
                  <Tooltip contentStyle={{ background: "#151C20", border: "1px solid #2A363C", fontSize: 12 }} formatter={(v) => yen(v)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="現在" fill="#4FA8D8" radius={[0, 2, 2, 0]} />
                  <Bar dataKey={`${inputs.retireAge}歳`} fill="#D9A54F" radius={[0, 2, 2, 0]} />
                  <Bar dataKey={`${inputs.deathAge}歳`} fill="#8FBF7F" radius={[0, 2, 2, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      <div className="footer-note">
        ※ 本ツールは入力値に基づく概算シミュレーションであり、将来の運用成果・年金額・医療費・税制を保証するものではありません。相続・税務・投資判断は専門家（FP・税理士等）にご確認ください。データは入力のたびにブラウザ上のストレージに自動保存されます。
      </div>
    </div>
  );
}
