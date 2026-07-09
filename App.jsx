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
const clampPct = (v) => Math.max(0, Math.min(100, v));

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

// 一括投資のうち「すでに投資時期を迎えた（現在の年齢より前の）」ものを合算する
// ※ ちょうど現在の年齢と同じものは、以降のシミュレーションのm=0処理側で計上されるためここでは含めない
function elapsedLumpSumAmount(lumpSums, currentAge) {
  if (!lumpSums || !lumpSums.length) return 0;
  return lumpSums.reduce((sum, e) => (e.age < currentAge ? sum + (e.amount || 0) : sum), 0);
}

function runSimulation(inputs) {
  const {
    currentAge, retireAge, deathAge,
    currentAssets, tsumitateSchedule, growthSchedule, lumpSums,
    tsumitateUsed, growthUsed,
    fundAllocation,
    pensionMonthly, livingCostMonthly, postRetireReturn,
    healthBrackets, inheritanceTarget,
    privatePensionPlans,
  } = inputs;

  const funds_list = (fundAllocation && fundAllocation.length) ? fundAllocation : [{ id: "default", name: "資産", amount: 1, returnPct: 5 }];
  const totalWeightBasis = funds_list.reduce((s, f) => s + (f.amount || 0), 0);
  const weightOf = (f) => (totalWeightBasis > 0 ? (f.amount || 0) / totalWeightBasis : 1 / funds_list.length);

  const totalMonths = Math.max(1, Math.round((deathAge - currentAge) * 12));
  let funds = {};
  funds_list.forEach((f) => {
    funds[f.id] = currentAssets * weightOf(f);
  });

  // lump-sum growth-quota investments, indexed by month offset from currentAge
  const lumpByMonth = new Map();
  (lumpSums || []).forEach((entry) => {
    const targetMonth = Math.round((entry.age - currentAge) * 12);
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

  const yearly = [];
  let depletionAge = null;
  let peakAssets = 0;
  let assetsAtRetire = null;

  for (let m = 0; m <= totalMonths; m++) {
    const age = currentAge + m / 12;
    const inAccumulation = age < retireAge;
    const lumpGross = lumpByMonth.get(m) || 0;

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

      funds_list.forEach((f) => {
        const r = monthlyRate(f.returnPct);
        funds[f.id] = funds[f.id] * (1 + r) + contribution * weightOf(f);
      });
    } else {
      let total = funds_list.reduce((s, f) => s + funds[f.id], 0);
      const r = monthlyRate(postRetireReturn);
      total = total * (1 + r);
      const healthMonthly = healthAnnualCost(age, healthBrackets) / 12;
      const privatePensionIncome = (privatePensionPlans || []).reduce(
        (s, pl) => (age >= pl.payoutFromAge && age <= pl.payoutToAge ? s + (pl.monthlyPayout || 0) : s),
        0
      );
      const netOutflow = livingCostMonthly + healthMonthly - pensionMonthly - privatePensionIncome;
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
  const yearly = [];
  let valueAtTarget = null;

  for (let m = 0; m <= totalMonths; m++) {
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
  const yearly = [];

  for (let m = 0; m <= totalMonths; m++) {
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
  const yearly = [];
  for (let m = 0; m <= totalMonths; m++) {
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
  const yearly = [];

  for (let m = 0; m <= totalMonths; m++) {
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
  const yearly = [];
  let cumulativeAtCurrentAge = 0;

  for (let m = 0; m <= totalMonths; m++) {
    const age = currentAge + m / 12;
    (policies || []).forEach((p) => {
      if (age >= p.premiumFromAge && age <= p.premiumToAge) {
        cumulative += p.monthlyPremium || 0;
      }
    });
    if (m === 0) cumulativeAtCurrentAge = cumulative;
    if (m % 12 === 0) yearly.push({ age: Math.round(age), total: cumulative });
  }
  const totalFinal = yearly.length ? yearly[yearly.length - 1].total : cumulative;
  return { yearly, totalFinal, cumulativeAtCurrentAge };
}

// ---------- 民間年金積立：積立期間で貯め、受給期間で取り崩す個人年金のシミュレーション ----------
function runPrivatePensionSimulation({ currentAge, deathAge, plans }) {
  const totalMonths = Math.max(1, Math.round((deathAge - currentAge) * 12));
  const balances = (plans || []).map(() => 0);
  const yearly = [];

  for (let m = 0; m <= totalMonths; m++) {
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
function Field({ label, unit, value, onChange, step = 1, min = 0, max, mono = true }) {
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
          onChange={(e) => onChange(Number(e.target.value))}
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
function AgeField({ label, value, onChange }) {
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
          <input type="number" className="mono" value={years} onChange={(e) => commit(Number(e.target.value), months)} />
          <span className="field-unit">歳</span>
        </div>
        <div className="field-input-wrap" style={{ flex: 1 }}>
          <input type="number" className="mono" min={0} max={11} value={months} onChange={(e) => commit(years, Number(e.target.value))} />
          <span className="field-unit">ヶ月</span>
        </div>
      </div>
    </label>
  );
}

// 追加フォーム用の小型「歳＋ヶ月」入力（2つの数値を親のuseState断片として管理）
function AgeYMInput({ years, months, onYears, onMonths, placeholder }) {
  return (
    <div style={{ display: "flex", gap: 4, flex: 1 }}>
      <input
        type="number" placeholder={`${placeholder}歳`} value={years}
        onChange={(e) => onYears(e.target.value)}
        style={{ width: "50%" }}
      />
      <input
        type="number" placeholder="ヶ月" min={0} max={11} value={months}
        onChange={(e) => onMonths(e.target.value)}
        style={{ width: "50%" }}
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
  return (
    <>
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={items} dataKey="amount" nameKey="name" cx="50%" cy="50%" outerRadius={65}
            label={({ name, value, percent }) => `${name} ${yen(value)}（${(percent * 100).toFixed(0)}%）`}
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

export default function NisaLifePlan() {
  const [inputs, setInputs] = useState({
    currentAge: 35,
    retireAge: 65,
    deathAge: 90,
    currentAssets: 3000000,
    tsumitateSchedule: [{ fromAge: 35, toAge: 65, monthlyYen: 100000 }],
    growthSchedule: [{ fromAge: 35, toAge: 65, monthlyYen: 50000 }],
    tsumitateUsed: 0,
    growthUsed: 0,
    lumpSums: [],
    fundAllocation: [
      { id: "f1", name: "全世界株式", amount: 300000, returnPct: 5 },
      { id: "f2", name: "S&P500", amount: 300000, returnPct: 6 },
      { id: "f3", name: "半導体・AI", amount: 250000, returnPct: 8 },
      { id: "f4", name: "インド株式", amount: 150000, returnPct: 7 },
    ],
    pensionMonthly: 150000,
    livingCostMonthly: 250000,
    postRetireReturn: 3,
    healthBrackets: { b60: 150000, b70: 250000, b80: 400000 },
    inheritanceTarget: 10000000,
    gold: {
      currentGrams: 0,
      pricePerGram: 24000,
      priceGrowthPct: 3,
      monthlyYen: 20000,
      accumulateUntilAge: 65,
    },
    banks: [],
    stockReturnPct: 6,
    loans: [],
    insurancePolicies: [],
    privatePensionPlans: [],
    lumpAllocation: [],
    tsumitateAllocation: [],
    growthAllocation: [],
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
  });
  const [newLumpAllocItem, setNewLumpAllocItem] = useState({ name: "", amount: "" });
  const [newTsumitateAllocItem, setNewTsumitateAllocItem] = useState({ name: "", amount: "" });
  const [newGrowthAllocItem, setNewGrowthAllocItem] = useState({ name: "", amount: "" });
  const [newFundItem, setNewFundItem] = useState({ name: "", amount: "" });
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
        currentAssets: nextInputs.currentAssets,
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
  const deleteSnapshot = async (date) => {
    try {
      await window.storage?.delete(SNAPSHOT_PREFIX + date, false);
      setHistory((prev) => prev.filter((h) => h.date !== date));
    } catch (e) {
      // ignore
    }
  };

  const update = (patch) => setInputs((prev) => ({ ...prev, ...patch }));
  const updateFundItem = (id, key, val) =>
    setInputs((prev) => ({
      ...prev,
      fundAllocation: prev.fundAllocation.map((f) => (f.id === id ? { ...f, [key]: val } : f)),
    }));
  const addFundItem = (name, amount) => {
    if (!name || !name.trim()) return;
    setInputs((prev) => ({
      ...prev,
      fundAllocation: [...prev.fundAllocation, { id: `f${Date.now()}`, name: name.trim(), amount: Number(amount) || 0, returnPct: 5 }],
    }));
  };
  const removeFundItem = (id) =>
    setInputs((prev) => ({ ...prev, fundAllocation: prev.fundAllocation.filter((f) => f.id !== id) }));
  const updateHealth = (key, val) =>
    setInputs((prev) => ({ ...prev, healthBrackets: { ...prev.healthBrackets, [key]: val } }));
  const updateGold = (key, val) =>
    setInputs((prev) => ({ ...prev, gold: { ...prev.gold, [key]: val } }));

  const fundTotalWeight = inputs.fundAllocation.reduce((s, f) => s + (f.amount || 0), 0);

  const sim = useMemo(() => runSimulation(inputs), [inputs]);
  const goldSim = useMemo(
    () => runGoldSimulation({ currentAge: inputs.currentAge, deathAge: inputs.deathAge, gold: inputs.gold }),
    [inputs.currentAge, inputs.deathAge, inputs.gold]
  );
  const bankSim = useMemo(
    () => runBankSimulation({
      currentAge: inputs.currentAge, retireAge: inputs.retireAge, deathAge: inputs.deathAge, banks: inputs.banks,
    }),
    [inputs.currentAge, inputs.retireAge, inputs.deathAge, inputs.banks]
  );
  const stockTotalNow = useMemo(() => watchlist.reduce((s, w) => s + (w.value || 0), 0), [watchlist]);
  const stockAllocationItems = useMemo(
    () => watchlist.filter((w) => (w.value || 0) > 0).map((w) => ({ name: w.name, amount: w.value })),
    [watchlist]
  );
  const stockSim = useMemo(
    () => runStockSim({ currentAge: inputs.currentAge, deathAge: inputs.deathAge, totalValue: stockTotalNow, returnPct: inputs.stockReturnPct }),
    [inputs.currentAge, inputs.deathAge, stockTotalNow, inputs.stockReturnPct]
  );
  const loanSim = useMemo(
    () => runLoanSimulation({ currentAge: inputs.currentAge, deathAge: inputs.deathAge, loans: inputs.loans }),
    [inputs.currentAge, inputs.deathAge, inputs.loans]
  );
  const insuranceSim = useMemo(
    () => runInsuranceSimulation({ currentAge: inputs.currentAge, deathAge: inputs.deathAge, policies: inputs.insurancePolicies }),
    [inputs.currentAge, inputs.deathAge, inputs.insurancePolicies]
  );
  const pensionSim = useMemo(
    () => runPrivatePensionSimulation({ currentAge: inputs.currentAge, deathAge: inputs.deathAge, plans: inputs.privatePensionPlans }),
    [inputs.currentAge, inputs.deathAge, inputs.privatePensionPlans]
  );

  // merge NISA + gold + bank + stocks + 民間年金積立 - loans - 保険料累計 into one net-worth-by-age series for the combined chart
  const netWorthYearly = useMemo(() => {
    return sim.yearly.map((row, i) => {
      const goldValue = goldSim.yearly[i]?.value ?? goldSim.finalValue;
      const bankValue = bankSim.yearly[i]?.total ?? bankSim.totalFinal;
      const stockValue = stockSim.yearly[i]?.value ?? stockSim.finalValue;
      const loanValue = loanSim.yearly[i]?.total ?? loanSim.totalFinal;
      const insuranceValue = insuranceSim.yearly[i]?.total ?? insuranceSim.totalFinal;
      const pensionValue = pensionSim.yearly[i]?.total ?? pensionSim.totalFinal;
      return {
        ...row, goldValue, bankValue, stockValue, loanValue, insuranceValue, pensionValue,
        netWorth: row.total + goldValue + bankValue + stockValue + pensionValue - loanValue - insuranceValue,
      };
    });
  }, [sim, goldSim, bankSim, stockSim, loanSim, insuranceSim, pensionSim]);
  const netWorthFinal = netWorthYearly.length ? netWorthYearly[netWorthYearly.length - 1].netWorth : sim.finalAssets;
  const netInheritanceGap = netWorthFinal - inputs.inheritanceTarget;

  const loanBreakdownByAge = useMemo(() => {
    const ages = [
      { label: "現在", age: inputs.currentAge },
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
  }, [inputs.loans, inputs.currentAge, inputs.retireAge, inputs.deathAge, loanSim]);

  const bankBreakdownByAge = useMemo(() => {
    const ages = [
      { label: "現在", age: inputs.currentAge },
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
  }, [inputs.banks, inputs.currentAge, inputs.retireAge, inputs.deathAge, bankSim]);

  const fundBreakdownAtRetire = useMemo(() => {
    const row = sim.yearly.find((y) => y.age >= inputs.retireAge) || sim.yearly[sim.yearly.length - 1];
    if (!row || !row.funds) return [];
    return inputs.fundAllocation.map((f, i) => ({
      name: f.name,
      value: Math.round(row.funds[f.id] || 0),
      color: PIE_COLORS[i % PIE_COLORS.length],
    }));
  }, [sim, inputs.retireAge, inputs.fundAllocation]);

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
    });
  };
  const removePension = (idx) =>
    setInputs((prev) => ({ ...prev, privatePensionPlans: prev.privatePensionPlans.filter((_, i) => i !== idx) }));
  const removeInsurance = (idx) =>
    setInputs((prev) => ({ ...prev, insurancePolicies: prev.insurancePolicies.filter((_, i) => i !== idx) }));

  // 汎用：銘柄別内訳リスト（一括投資／つみたて／成長投資枠で共用）の追加・削除・編集
  const addAllocationItem = (field, newItem, resetNewItem) => {
    if (!newItem.name.trim()) return;
    const name = newItem.name.trim();
    const amount = Number(newItem.amount) || 0;
    setInputs((prev) => {
      const updatedField = [...prev[field], { name, amount }];
      const alreadyInFundAllocation = prev.fundAllocation.some((f) => f.name === name);
      const updatedFundAllocation = alreadyInFundAllocation
        ? prev.fundAllocation
        : [...prev.fundAllocation, { id: `f${Date.now()}`, name, amount, returnPct: 5 }];
      return { ...prev, [field]: updatedField, fundAllocation: updatedFundAllocation };
    });
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
  const tsumitateElapsed = elapsedScheduleAmount(inputs.tsumitateSchedule, inputs.currentAge);
  const growthElapsed =
    elapsedScheduleAmount(inputs.growthSchedule, inputs.currentAge) +
    elapsedLumpSumAmount(inputs.lumpSums, inputs.currentAge);
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
  const currentTsumitateMonthly = scheduledAmount(inputs.tsumitateSchedule, inputs.currentAge);
  const tsumitateAnnualPace = currentTsumitateMonthly * 12;
  const tsumitateAnnualDiff = NISA_LIMITS.tsumitateAnnual - tsumitateAnnualPace;
  const tsumitateAnnualRemaining = Math.max(0, tsumitateAnnualDiff);
  const tsumitateAnnualOverage = Math.max(0, -tsumitateAnnualDiff);

  const currentGrowthMonthly = scheduledAmount(inputs.growthSchedule, inputs.currentAge);
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
          gap: 18px;
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
      `}</style>

      <div className="titleblock">
        <div>
          <h1>資産形成 総合ライフプラン</h1>
          <div className="sub">NISA積立 × 老後資産 × 年金 × 健康費用 × 相続 — 統合シミュレーション</div>
        </div>
        <div className="meta" style={{ alignItems: "center" }}>
          <div>現在 <span>{inputs.currentAge}歳</span></div>
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
          <SectionTitle index="01" title="基本情報" icon={Ruler} />
          <AgeField label="現在の年齢" value={inputs.currentAge} onChange={(v) => update({ currentAge: v })} />
          <AgeField label="引退（年金開始）年齢" value={inputs.retireAge} onChange={(v) => update({ retireAge: v })} />
          <AgeField label="想定寿命" value={inputs.deathAge} onChange={(v) => update({ deathAge: v })} />

          <SectionTitle index="02" title="NISA積立（つみたて枠 + 成長投資枠）" icon={TrendingUp} />
          <Field label="現在のNISA資産" unit="円" value={inputs.currentAssets} step={100000} onChange={(v) => update({ currentAssets: v })} />

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

          <div className="field-label" style={{ marginBottom: 6 }}>つみたて投資枠の銘柄別内訳（金額を入れると割合を自動計算・新しい銘柄はNISA配分にも自動追加されます）</div>
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

          <div className="field-label" style={{ marginBottom: 6 }}>成長投資枠の銘柄別内訳（金額を入れると割合を自動計算・新しい銘柄はNISA配分にも自動追加されます）</div>
          <AllocationBreakdown
            items={inputs.growthAllocation}
            newItem={newGrowthAllocItem}
            onNewItemChange={setNewGrowthAllocItem}
            onAdd={() => addAllocationItem("growthAllocation", newGrowthAllocItem, setNewGrowthAllocItem)}
            onRemove={(i) => removeAllocationItem("growthAllocation", i)}
            onUpdate={(i, key, val) => updateAllocationItem("growthAllocation", i, key, val)}
          />
          <div style={{ marginBottom: 18 }} />

          <Field label="つみたて投資枠：アプリ管理外の使用累計（基準額）" unit="円" step={10000} value={inputs.tsumitateUsed} onChange={(v) => update({ tsumitateUsed: v })} />
          <div className="note" style={{ marginTop: -8 }}>
            <Info size={13} />
            <span>
              スケジュールの過去分（自動計算 {yen(tsumitateElapsed)}）を合算した<strong>現在日付での使用累計：{yen(computedTsumitateUsed)}</strong>／
              年間上限まであと{yen(tsumitateAnnualRemaining)}（現在のペース基準）／生涯投資枠（総枠）まであと{yen(remainingTotal)}
            </span>
          </div>
          <Field label="成長投資枠：アプリ管理外の使用累計（基準額）" unit="円" step={10000} value={inputs.growthUsed} onChange={(v) => update({ growthUsed: v })} />
          <div className="note" style={{ marginTop: -8 }}>
            <Info size={13} />
            <span>
              スケジュール＋一括投資の実行済み分（自動計算 {yen(growthElapsed)}）を合算した<strong>現在日付での使用累計：{yen(computedGrowthUsed)}</strong>／
              年間上限まであと{yen(growthAnnualRemaining)}（現在のペース基準）／生涯投資枠（総枠）まであと{yen(remainingTotal)}
            </span>
          </div>
          <div className="note">
            <Info size={13} />
            <span>ここに入力するのは、このアプリのスケジュールや一括投資に含まれていない「それ以前の実績」だけで構いません。スケジュール・一括投資に登録済みの過去分は自動で合算されます。</span>
          </div>
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

          <div className="field-label" style={{ marginBottom: 6 }}>一括投資の銘柄別内訳（金額を入れると割合を自動計算・新しい銘柄はNISA配分にも自動追加されます）</div>
          <AllocationBreakdown
            items={inputs.lumpAllocation}
            newItem={newLumpAllocItem}
            onNewItemChange={setNewLumpAllocItem}
            onAdd={() => addAllocationItem("lumpAllocation", newLumpAllocItem, setNewLumpAllocItem)}
            onRemove={(i) => removeAllocationItem("lumpAllocation", i)}
            onUpdate={(i, key, val) => updateAllocationItem("lumpAllocation", i, key, val)}
          />

          <div className="field-label" style={{ marginBottom: 6 }}>
            NISA資産の銘柄別配分（金額を入れると割合を自動計算・想定年率も銘柄ごとに設定）
          </div>
          {inputs.fundAllocation.length > 0 && (
            <table className="watchlist" style={{ marginBottom: 8 }}>
              <thead><tr><th>銘柄</th><th>金額</th><th>割合</th><th>年率</th><th></th></tr></thead>
              <tbody>
                {inputs.fundAllocation.map((f, i) => (
                  <tr key={f.id}>
                    <td>
                      <input
                        className="inline-num" value={f.name}
                        onChange={(e) => updateFundItem(f.id, "name", e.target.value)}
                      />
                    </td>
                    <td style={{ width: 90 }}>
                      <input
                        type="number" className="inline-num" value={f.amount}
                        onChange={(e) => updateFundItem(f.id, "amount", Number(e.target.value))}
                      />
                    </td>
                    <td className="mono" style={{ width: 46 }}>
                      {fundTotalWeight > 0 ? `${((f.amount / fundTotalWeight) * 100).toFixed(1)}%` : "—"}
                    </td>
                    <td style={{ width: 60 }}>
                      <input
                        type="number" step={0.5} className="inline-num" value={f.returnPct}
                        onChange={(e) => updateFundItem(f.id, "returnPct", Number(e.target.value))}
                      />
                    </td>
                    <td style={{ width: 24 }}>
                      <button className="del-btn" onClick={() => removeFundItem(f.id)}><Trash2 size={13} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="add-row">
            <input placeholder="銘柄名" value={newFundItem.name} onChange={(e) => setNewFundItem((p) => ({ ...p, name: e.target.value }))} />
            <input placeholder="金額（割合の基準）" type="number" value={newFundItem.amount} onChange={(e) => setNewFundItem((p) => ({ ...p, amount: e.target.value }))} />
            <button
              className="add-btn"
              onClick={() => { addFundItem(newFundItem.name, newFundItem.amount); setNewFundItem({ name: "", amount: "" }); }}
            >
              <Plus size={15} />
            </button>
          </div>

          <div className="note">
            <Info size={13} />
            <span>
              銘柄は自由に追加・削除できます。「金額」はその銘柄への配分の重み（今すでに投資済みの金額である必要はありません）で、割合(%)は金額の比率から自動計算されます。米国株比重の高いファンドを重ねすぎると分散効果が薄れる点にご注意ください。
            </span>
          </div>

          <SectionTitle index="03" title="老後・年金" icon={Landmark} />
          <Field label="年金受給見込み額" unit="円/月" value={inputs.pensionMonthly} step={5000} onChange={(v) => update({ pensionMonthly: v })} />
          <Field label="老後の生活費" unit="円/月" value={inputs.livingCostMonthly} step={5000} onChange={(v) => update({ livingCostMonthly: v })} />
          <Field label="退職後の想定運用利回り" unit="%" step={0.5} value={inputs.postRetireReturn} onChange={(v) => update({ postRetireReturn: v })} />

          <SectionTitle index="04" title="健康リスク費用（自己負担目安）" icon={HeartPulse} />
          <Field label="60代 年間自己負担" unit="円/年" step={10000} value={inputs.healthBrackets.b60} onChange={(v) => updateHealth("b60", v)} />
          <Field label="70代 年間自己負担" unit="円/年" step={10000} value={inputs.healthBrackets.b70} onChange={(v) => updateHealth("b70", v)} />
          <Field label="80代以降 年間自己負担" unit="円/年" step={10000} value={inputs.healthBrackets.b80} onChange={(v) => updateHealth("b80", v)} />
          <div className="note">
            <Info size={13} />
            <span>公的医療保険の高額療養費制度を考慮した後の自己負担額の概算です。実際は所得区分により上限が変わるため目安としてご利用ください。</span>
          </div>

          <SectionTitle index="05" title="相続プラン" icon={Users} />
          <Field label="子孫に残したい金額" unit="円" step={100000} value={inputs.inheritanceTarget} onChange={(v) => update({ inheritanceTarget: v })} />

          <SectionTitle index="06" title="金（ゴールド）資産形成" icon={Coins} />
          <Field label="現在の保有量" unit="g" step={1} value={inputs.gold.currentGrams} onChange={(v) => updateGold("currentGrams", v)} />
          <Field label="現在の金価格（参考）" unit="円/g" step={100} value={inputs.gold.pricePerGram} onChange={(v) => updateGold("pricePerGram", v)} />
          <Field label="想定 年率価格上昇率" unit="%" step={0.5} value={inputs.gold.priceGrowthPct} onChange={(v) => updateGold("priceGrowthPct", v)} />
          <Field label="毎月の積立額" unit="円/月" step={1000} value={inputs.gold.monthlyYen} onChange={(v) => updateGold("monthlyYen", v)} />
          <AgeField label="積立を続ける年齢（まで）" value={inputs.gold.accumulateUntilAge} onChange={(v) => updateGold("accumulateUntilAge", v)} />
          <div className="note">
            <Info size={13} />
            <span>金価格は2026年7月時点の店頭小売価格（1g ≈ 24,000円前後）を参考値としています。実際の価格は日々変動するため、最新の価格に置き換えてご利用ください。</span>
          </div>

          <SectionTitle index="07" title="銀行預金（銀行別）" icon={PiggyBank} />
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

          <SectionTitle index="08" title="借入金（返済シミュレーション）" icon={Landmark} />
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

          <SectionTitle index="09" title="生命保険" icon={HeartPulse} />
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

          <SectionTitle index="10" title="民間年金積立" icon={PiggyBank} />
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
          <div className="add-row" style={{ marginBottom: 14 }}>
            <button className="add-btn" onClick={addPension} style={{ width: "100%" }}><Plus size={15} /></button>
          </div>
          <div className="note">
            <Info size={13} />
            <span>積立期間中は毎月の積立額を貯め、受給期間中はそこから毎月の受給額を取り崩していく残高として、生涯資産グラフに資産の一部として反映されます。さらに受給額は、公的年金と同様に生活費・健康費用の補填としても扱われ、NISA資産の取り崩しペースを緩める効果があります。</span>
          </div>
        </div>

        {/* -------- RIGHT: DASHBOARD -------- */}
        <div className="content">
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
            <div className="chart-label">総資産推移 — NISA + 金 + 銀行預金 + 個別株 + 民間年金積立 − 借入金 − 保険料累計（{inputs.currentAge}歳 〜 {inputs.deathAge}歳）</div>
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
                label={`${inputs.deathAge}歳までの想定年率（個別株全体）`} unit="%" step={0.5}
                value={inputs.stockReturnPct} onChange={(v) => update({ stockReturnPct: v })}
              />
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
