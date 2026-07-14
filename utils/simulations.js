// ============================================================================
// utils/simulations.js
//
// App.jsx の上部にあった「純粋な計算関数」を、そのまま切り出したファイル。
// 中身は1行も変えていない（数式・定数・関数名・コメントすべて移動前と同一）。
//
// 【なぜ切り出すか】
// utils/buildPlanInput.js がこれらの関数を必要とするが、App.jsx から import すると
// App.jsx → buildPlanInput → App.jsx の循環参照になる。計算関数を独立させることで
// 循環を断ち、シミュレーションを React の外から何度でも呼べるようにする。
//
// 後方互換：App.jsx はこのファイルを re-export するため、
// 既存テストの `import { runSimulation } from "../App.jsx"` はそのまま動く。
// ============================================================================

import {
  JP_COUNTRY_RULES,
  US_COUNTRY_RULES,
  GB_COUNTRY_RULES,
  CA_COUNTRY_RULES,
  AU_COUNTRY_RULES,
  getCountryRules,
} from "../countryRules/index.js";
import { buildAgeSteps } from "../lifePlanEngine.js";


function monthlyRate(annualPct) {
  return Math.pow(1 + annualPct / 100, 1 / 12) - 1;
}

// ============================================================================
// ---------- 国別ルール（countryRules/） ----------
// 旧・App.jsx 内に直書きしていた各国ルール定義は、以下のファイルへそのまま切り出した。
//   src/countryRules/JP.js  … JP_COUNTRY_RULES
//   src/countryRules/US.js  … US_COUNTRY_RULES
//   src/countryRules/GB.js  … GB_COUNTRY_RULES
//   src/countryRules/CA.js  … CA_COUNTRY_RULES
//   src/countryRules/AU.js  … AU_COUNTRY_RULES
//   src/countryRules/index.js … COUNTRY_RULES の集約 / getCountryRules(country)
//
// 数値・関数・フォールバック方針（未実装国は JP へフォールバックしない）は一切変更していない。
// 取得方法も従来どおり `const rules = getCountryRules(country);`。
// 既存の import 互換のため、各国ルールは App.jsx からも同名で再エクスポートする。
// ============================================================================
export {
  JP_COUNTRY_RULES,
  US_COUNTRY_RULES,
  GB_COUNTRY_RULES,
  CA_COUNTRY_RULES,
  AU_COUNTRY_RULES,
};

// ---------- NISA quota rules (2024- new NISA system) ----------
// 数値そのものは countryRules/JP.js 相当（JP_COUNTRY_RULES.investment）に集約し、
// ここでは既存コード互換のための別名として参照するのみ。
// （NISA_LIMITS.xxx という参照は既存コード全体にそのまま残しているため、ここを書き換えても
//   計算結果・呼び出し側のコードには一切影響しない。）
// ============================================================================
// 取り崩し順序（drawdown order）
//
// 標準設定：
//   1. 現金・銀行預金        （即時に使え、運用機会損失が最小）
//   2. 課税口座・個別株      （税優遇が無いので先に使う）
//   3. 非課税投資口座        （NISA / Roth IRA / ISA / TFSA）
//   4. 引出制限のある退職口座（iDeCo / 401(k) / SIPP / RRSP / Super。accessAge未満は不可）
//   5. 金などの現物資産      （最後に温存）
//
// DRAWDOWN_CATEGORIES の並び順がそのまま優先順位になる。
// 配列を差し替えれば順序を変更できる（将来の利用者設定用）。
// ============================================================================
export const DRAWDOWN_CATEGORIES = ["cash", "taxable", "taxFree", "restricted", "physical"];

export function drawOrderOf(category, tieBreak = 0, order = DRAWDOWN_CATEGORIES) {
  const rank = order.indexOf(category);
  return (rank < 0 ? order.length : rank) * 100 + tieBreak;
}

// 各国の口座 → 取り崩しカテゴリの対応表。コメントではなく、この表が実装そのもの。
export const ACCOUNT_DRAW_CATEGORY = {
  // 日本：銀行預金 → 課税口座・個別株 → NISA → iDeCo → 金
  JP: { bank: "cash", stock: "taxable", nisa: "taxFree", ideco: "restricted", gold: "physical" },
  // 米国：Cash/Bank → Brokerage → Roth IRA → Traditional IRA・401(k) → Gold
  US: {
    cashSavings: "cash", brokerage: "taxable", rothIra: "taxFree",
    traditionalIra: "restricted", k401: "restricted",
  },
  // 英国：Cash → General Investment Account → ISA → Pension/SIPP → Gold
  GB: {
    cashSavings: "cash", gia: "taxable",
    cashIsa: "taxFree", stocksSharesIsa: "taxFree",
    workplacePension: "restricted", sipp: "restricted",
  },
  // カナダ：Cash → Taxable Account → TFSA → RRSP/RRIF → Gold
  CA: { cashSavings: "cash", nonRegistered: "taxable", tfsa: "taxFree", rrsp: "restricted" },
  // 豪州：Cash → Taxable Investments → Superannuation → Gold
  AU: { cashSavings: "cash", investmentAccount: "taxable", superannuation: "restricted" },
};

export const NISA_LIMITS = {
  tsumitateAnnual: JP_COUNTRY_RULES.investment.annualInstallmentLimit,
  growthAnnual: JP_COUNTRY_RULES.investment.annualGrowthLimit,
  growthLifetime: JP_COUNTRY_RULES.investment.growthLifetimeLimit,
  totalLifetime: JP_COUNTRY_RULES.investment.taxFreeInvestmentLimit,
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
export function guessDefaultReturn(name) {
  const lower = (name || "").toLowerCase();
  for (const row of RETURN_GUESS_TABLE) {
    if (row.keywords.some((k) => lower.includes(k))) return row.pct;
  }
  return 5;
}

// iDeCoの節税額（概算）用：所得税＋住民税をまとめた大まかな実効税率の目安
// ※実際の税額は控除の状況等により異なります。あくまで概算です。
export function estimateMarginalTaxRate(annualIncome) {
  if (!annualIncome || annualIncome <= 0) return 0.2; // 年収未入力時の目安
  if (annualIncome <= 1950000) return 0.15;
  if (annualIncome <= 3300000) return 0.2;
  if (annualIncome <= 6950000) return 0.3;
  if (annualIncome <= 9000000) return 0.33;
  if (annualIncome <= 18000000) return 0.43;
  return 0.5;
}

export function computeAgeFromBirthDate(birthDateStr, asOfDate) {
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

export function healthAnnualCost(age, brackets) {
  if (age < 60) return 0;
  if (age < 70) return brackets.b60;
  if (age < 80) return brackets.b70;
  return brackets.b80;
}

// 年齢レンジごとの毎月投資額スケジュールから、指定年齢時点の該当額を合算して返す（つみたて枠・成長投資枠で共用）
export function scheduledAmount(schedule, age) {
  if (!schedule || !schedule.length) return 0;
  return schedule.reduce((sum, r) => {
    if (age >= r.fromAge && age <= r.toAge) return sum + (r.monthlyYen || 0);
    return sum;
  }, 0);
}

// スケジュールのうち「現在の年齢より前」の区間分を、経過月数×月額で合算する
// （すでに実行済みの積立として、これまでの使用累計に自動で反映するため）
export function elapsedScheduleAmount(schedule, currentAge) {
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
export function compoundedElapsedValue(schedule, fromAge, toAge, annualReturnPct) {
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
export function compoundPrincipal(value, fromAge, toAge, annualReturnPct) {
  if (fromAge === null || fromAge === undefined || fromAge >= toAge) return value || 0;
  const months = Math.max(0, Math.round((toAge - fromAge) * 12));
  const r = monthlyRate(annualReturnPct || 0);
  return (value || 0) * Math.pow(1 + r, months);
}

// 一括投資のうち「すでに投資時期を迎えた（現在の年齢より前の）」ものを合算する（簿価ベース、NISA枠の使用量トラッキング用）
// ※ ちょうど現在の年齢と同じものは、以降のシミュレーションのm=0処理側で計上されるためここでは含めない
export function elapsedLumpSumAmount(lumpSums, currentAge) {
  if (!lumpSums || !lumpSums.length) return 0;
  return lumpSums.reduce((sum, e) => (e.age < currentAge ? sum + (e.amount || 0) : sum), 0);
}

// 一括投資のうち「すでに投資時期を迎えた（現在の年齢より前の）」ものを、
// それぞれの投資日から現在まで想定利回りで複利運用したものとして合算する（現在資産の評価額用）
export function compoundedLumpSumValue(lumpSums, currentAge, annualReturnPct) {
  if (!lumpSums || !lumpSums.length) return 0;
  const r = monthlyRate(annualReturnPct || 0);
  return lumpSums.reduce((sum, e) => {
    if (e.age >= currentAge) return sum;
    const months = Math.max(0, Math.round((currentAge - e.age) * 12));
    return sum + (e.amount || 0) * Math.pow(1 + r, months);
  }, 0);
}

export function runSimulation(inputs, uncategorizedLabel, phaseAccumLabel, phaseDrawdownLabel) {
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
    : [{ id: uncategorizedLabel || "未分類", pct: 100, returnPct: 5 }];

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
    phase: currentAge < retireAge ? (phaseAccumLabel || "積立期") : (phaseDrawdownLabel || "取崩期"),
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
        phase: inAccumulation ? (phaseAccumLabel || "積立期") : (phaseDrawdownLabel || "取崩期"),
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

// ---------- NISA拠出計画（統合エンジン用） ----------
// runSimulation の積立ロジック（年間上限・成長投資枠の生涯上限・合計生涯上限・一括投資）と
// 同一のルールで「各月に実際にNISAへ入る金額」を先に計算しておく。
// 統合エンジンはこの配列を参照するだけなので、NISAの枠計算が二重実装にならない。
export function buildNisaContributionPlan({
  currentAge, retireAge, deathAge,
  tsumitateSchedule, growthSchedule, lumpSums, tsumitateUsed, growthUsed, boundaries,
}) {
  // 統合エンジンと同一の可変長ステップを共有する（添字が一致する）
  const steps = buildAgeSteps(currentAge, deathAge, boundaries);
  const tsumitateMonthlyCap = NISA_LIMITS.tsumitateAnnual / 12;
  const growthMonthlyCap = NISA_LIMITS.growthAnnual / 12;
  let tsumitateCum = (tsumitateUsed || 0) + elapsedScheduleAmount(tsumitateSchedule, currentAge);
  let growthCum = (growthUsed || 0) + elapsedScheduleAmount(growthSchedule, currentAge) + elapsedLumpSumAmount(lumpSums, currentAge);

  // 一括投資は「その金額を投じる年齢に到達した最初のステップ」で1回だけ実行する
  const pendingLumps = (lumpSums || [])
    .filter((e) => e && Number(e.amount) > 0 && Number(e.age) > currentAge)
    .map((e) => ({ age: Number(e.age), amount: Number(e.amount), done: false }));

  // byStep[i] = ステップ i でNISAへ実際に入る金額（上限適用後）
  const byStep = new Array(steps.length).fill(0);

  steps.forEach((st, i) => {
    const age = st.age;
    // 資格判定はステップ開始時点の年齢で行う（エンジンと同じ規則）
    const ageStart = st.age - st.dt;
    const months = st.dt * 12;
    let contribution = 0;

    if (ageStart < retireAge - 1e-9) {
      let effGrowth = Math.min(scheduledAmount(growthSchedule, ageStart), growthMonthlyCap) * months;
      let effTsumitate = Math.min(scheduledAmount(tsumitateSchedule, ageStart), tsumitateMonthlyCap) * months;
      const growthRoom = Math.max(0, NISA_LIMITS.growthLifetime - growthCum);
      if (effGrowth > growthRoom) effGrowth = growthRoom;
      let totalRoom = Math.max(0, NISA_LIMITS.totalLifetime - (tsumitateCum + growthCum));
      if (effGrowth > totalRoom) effGrowth = totalRoom;
      totalRoom -= effGrowth;
      if (effTsumitate > totalRoom) effTsumitate = totalRoom;
      growthCum += effGrowth;
      tsumitateCum += effTsumitate;
      contribution += effGrowth + effTsumitate;
    }

    pendingLumps.forEach((lp) => {
      if (lp.done || ageStart < lp.age - 1e-9) return;
      const gRoom = Math.max(0, NISA_LIMITS.growthLifetime - growthCum);
      const tRoom = Math.max(0, NISA_LIMITS.totalLifetime - (tsumitateCum + growthCum));
      const eff = Math.min(lp.amount, gRoom, tRoom);
      if (eff > 0) growthCum += eff;
      contribution += eff;
      lp.done = true;
    });

    byStep[i] = contribution;
  });

  return { byStep, tsumitateCum, growthCum };
}

// ---------- gold (純金積立) simulation ----------
export function runGoldSimulation({ currentAge, deathAge, gold }) {
  const { currentGrams, pricePerGram, priceGrowthPct, monthlyYen, accumulateUntilAge, asOfAge } = gold;
  const r = monthlyRate(priceGrowthPct);

  // 「基準年齢」時点の保有量（currentGrams）を、基準年齢〜現在の年齢まで
  // 毎月積立を加算しながら複利成長させ、"現在"時点の実際の保有量・評価額を算出する
  let grams = currentGrams;
  let price = pricePerGram;
  if (asOfAge !== null && asOfAge !== undefined && asOfAge < currentAge) {
    const catchUpMonths = Math.max(0, Math.round((currentAge - asOfAge) * 12));
    for (let m = 1; m <= catchUpMonths; m++) {
      const age = asOfAge + m / 12;
      if (age < accumulateUntilAge && monthlyYen > 0 && price > 0) {
        grams += monthlyYen / price;
      }
      price = price * (1 + r);
    }
  }
  const currentValue = grams * price; // 現在の日付時点での金資産評価額

  const totalMonths = Math.max(1, Math.round((deathAge - currentAge) * 12));
  const yearly = [{ age: Math.round(currentAge), grams, price, value: grams * price }];
  let valueAtTarget = currentAge >= accumulateUntilAge ? grams * price : null;

  for (let m = 1; m <= totalMonths; m++) {
    const age = currentAge + m / 12;
    // その月の積立は「月初の価格」で購入する
    if (age < accumulateUntilAge && monthlyYen > 0 && price > 0) {
      grams += monthlyYen / price;
    }
    // 【修正】その月の価格上昇を反映してから年次データへ記録・評価する。
    // （記録が先だと、各年の評価額が1ヶ月分古い価格で計算されていた）
    price = price * (1 + r);
    if (m % 12 === 0) {
      yearly.push({ age: Math.round(age), grams, price, value: grams * price });
    }
    if (valueAtTarget === null && age >= accumulateUntilAge) {
      valueAtTarget = grams * price;
    }
  }
  const finalValue = yearly.length ? yearly[yearly.length - 1].value : grams * price;
  if (valueAtTarget === null) valueAtTarget = finalValue;

  return { yearly, finalGrams: grams, finalValue, valueAtTarget, currentValue, currentGrams: grams };
}

// ---------- bank savings (銀行別) simulation ----------
export function runBankSimulation({ currentAge, retireAge, deathAge, banks }) {
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
export function runStockSim({ currentAge, deathAge, totalValue, returnPct }) {
  const totalMonths = Math.max(1, Math.round((deathAge - currentAge) * 12));
  const r = monthlyRate(returnPct);
  let value = totalValue;
  const yearly = [{ age: Math.round(currentAge), value }];
  for (let m = 1; m <= totalMonths; m++) {
    const age = currentAge + m / 12;
    // 【修正】その月の運用益を反映してから年次データへ記録する。
    // （記録が先だと、各年のデータが1ヶ月分だけ古い値になり、最終評価額も1ヶ月分少なくなっていた）
    value = value * (1 + r);
    if (m % 12 === 0) yearly.push({ age: Math.round(age), value });
  }
  return { yearly, finalValue: yearly.length ? yearly[yearly.length - 1].value : totalValue };
}

// ---------- loan repayment (借入金返済シミュレーション) ----------
function simpleMonthlyRate(annualPct) {
  return (annualPct || 0) / 1200;
}
export function runLoanSimulation({ currentAge, deathAge, loans }) {
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
export function runInsuranceSimulation({ currentAge, deathAge, policies }) {
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
export function runPrivatePensionSimulation({ currentAge, deathAge, plans }) {
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

export function runIdecoSimulation({ currentAge, deathAge, ideco }) {
  const {
    currentValue, monthlyContribution, startAge, endAge, returnPct,
    payoutStartAge, payoutMethod, payoutYears, lumpPortionPct, payoutReturnPct, asOfAge,
  } = ideco;

  // 「現在評価額」の基準年齢が設定されていれば、基準年齢〜現在の年齢まで
  // 掛金を加算しながら複利成長させ、"現在"時点の実際の評価額を算出する（金・NISAと同じ考え方）
  const accRPre = monthlyRate(returnPct);
  let currentValueAdjusted = currentValue || 0;
  if (asOfAge !== null && asOfAge !== undefined && asOfAge < currentAge) {
    const catchUpMonths = Math.max(0, Math.round((currentAge - asOfAge) * 12));
    for (let m = 1; m <= catchUpMonths; m++) {
      const age = asOfAge + m / 12;
      const contributing = age >= startAge && age < endAge;
      const contribution = contributing ? (monthlyContribution || 0) : 0;
      currentValueAdjusted = currentValueAdjusted * (1 + accRPre) + contribution;
    }
  }

  // 既存データ（新項目未設定の場合）でもエラーにならないよう安全な既定値を使用
  const safePayoutYears = Math.max(1, Number(payoutYears) || 10);
  const safeLumpPct = Math.min(1, Math.max(0, Number(lumpPortionPct ?? 50) / 100));
  const safePayoutReturn = Number(payoutReturnPct) || 0;

  const totalMonths = Math.max(1, Math.round((deathAge - currentAge) * 12));
  const accR = monthlyRate(returnPct);
  let value = currentValueAdjusted;
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
    currentValueAdjusted,
  };
}
