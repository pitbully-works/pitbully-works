// ============================================================================
// utils/buildPlanInput.js
//
// 「runIntegratedPlan に渡す引数オブジェクト」を組み立てる純粋関数。
//
// 【なぜ必要か】
// 従来この処理は App.jsx の中の useMemo（約230行）に埋め込まれており、
// React のクロージャに閉じていたため「別の条件でもう一度組み立て直す」ことが
// できなかった。シナリオ比較は同じ組み立てを2回（現在プラン／比較プラン）行う
// 必要があるため、React から切り離した純粋関数として独立させる。
//
// 【重要】計算式は1つも新規に作っていない。App.jsx にあったものをそのまま移設し、
// 「上書き（overrides）を受け取る口」だけを追加してある。
//
// ---------------------------------------------------------------------------
// 上書きできる項目（シナリオ比較の第1段階）
//   retireAge              退職年齢
//   livingCostMonthly      退職後の毎月の生活費（国ごとに置き場所が違うのでここで吸収）
//   contributionMultiplier 毎月の積立額の倍率（0.8 / 1.0 / 1.2 / 1.5）
//
// 【倍率の適用範囲】
// 倍率は「これから積み立てる分」だけに掛ける。過去の積立・現在の残高・使用済みの
// 非課税枠は、倍率をどう変えても1円も動かない。
//
//   ✓ 対象  JP …… tsumitateSchedule / growthSchedule の monthlyYen（将来区間のみ）
//   ✓ 対象  US/GB/CA/AU …… 各投資口座の annualContribution（＋AUの voluntaryConcessional）
//   ✓ 対象  banks[].monthlyDeposit（第2段階で追加）
//           銀行は残高を入力値からそのまま使い、遡及計算を持たないため、
//           月々の入金に倍率を掛けても現在残高は変わらない。
//   ✓ 対象  gold.monthlyYen（第3段階で追加）
//           金の現在評価額は App 側が「倍率をかけていない入力」から算出し、
//           goldCurrentValue として渡してくる。ここでは再計算しないため、
//           月々の積立に倍率を掛けても現在の保有グラム数・評価額は変わらない。
//
//   ✗ 対象外 ideco.monthlyContribution
//           runIdecoSimulation は同じ monthlyContribution を「基準年齢から今日までの
//           遡及計算」と「将来の積立」の両方に使っている。素直に倍率を掛けると、
//           過去に積み立てた額まで書き換わって現在のiDeCo残高そのものが変わり、
//           さらに一時金・受取額まで狂う。遡及計算と将来計算を分離する必要があるため、
//           第4段階で個別に対応する。
//
// NISAの年間上限・生涯上限は倍率を掛けたあとに再判定される（buildNisaContributionPlan
// をスケジュールごと作り直しているため）。1.5倍にしても上限を超えて積み立てられない。
// ---------------------------------------------------------------------------
// ============================================================================

import { NOT_DRAWABLE } from "../lifePlanEngine.js";
import {
  ACCOUNT_DRAW_CATEGORY,
  drawOrderOf,
  buildNisaContributionPlan,
  elapsedScheduleAmount,
  runIdecoSimulation,
  healthAnnualCost,
  guessDefaultReturn,
} from "./simulations.js";

// 比較UIで選べる倍率。UI側はこの配列をそのまま並べる。
export const CONTRIBUTION_MULTIPLIERS = [0.8, 1.0, 1.2, 1.5];

// 国ごとに「退職後の毎月の生活費」がどこに入っているか。
// JPだけトップレベル、他国は {country}Investment.expensesMonthly。
const LIVING_COST_PATH = {
  JP: null, // inputs.livingCostMonthly
  US: "usInvestment",
  GB: "gbInvestment",
  CA: "caInvestment",
  AU: "auInvestment",
};

// 国ごとの「投資口座」キー。倍率はこの口座群の annualContribution にだけ掛かる。
const INVESTMENT_ACCOUNT_KEYS = {
  US: ["brokerage", "rothIra", "traditionalIra", "k401"],
  GB: ["cashSavings", "gia", "cashIsa", "stocksSharesIsa", "workplacePension", "sipp"],
  CA: ["cashSavings", "nonRegistered", "tfsa", "rrsp"],
  AU: ["cashSavings", "investmentAccount", "superannuation"],
};

/**
 * 現在の入力から「退職後の毎月の生活費」を国に関係なく読み出す。
 */
export function readLivingCostMonthly(country, inputs) {
  const key = LIVING_COST_PATH[country];
  if (!key) return Number(inputs.livingCostMonthly) || 0;
  return Number((inputs[key] || {}).expensesMonthly) || 0;
}

const scale = (v, m) => (Number(v) || 0) * m;

/**
 * runIntegratedPlan の引数オブジェクトを組み立てる。
 *
 * @param {object} ctx  App.jsx が持っている派生値。すべて「上書きの影響を受けない値」。
 *   country, rules, inputs, effectiveCurrentAge, effectiveCurrentAssets,
 *   effectivePostRetireReturn, dynamicFunds, stockTotalNow, effectiveStockReturnPct,
 *   goldCurrentValue, effectiveGoldReturnPct, effectivePensionMonthly,
 *   effectivePublicPensionStartAge, drawdownOrder, uncategorizedLabel,
 *   countryDerived { usSSMonthlyBenefit, usTotalHealthcareAnnual, usClaimAge,
 *                    gbStatePensionAnnual, gbAdditionalPensionAnnual, gbEffectiveClaimAge,
 *                    gbHealthcareAnnual, caCppAnnual, caCppStartAge, caOasAnnual,
 *                    caOasStartAge, caAdditionalPensionAnnual, caHealthcareAnnual,
 *                    auAgePensionAnnual, auAgePensionQualifyingAge, auOtherAnnualIncome,
 *                    auHealthcareAnnual }
 *
 * @param {object} overrides  { retireAge?, livingCostMonthly?, contributionMultiplier? }
 *   未指定の項目は現在プランの値がそのまま使われる。
 *   ctx.inputs は絶対に書き換えない（読み取り専用として扱う）。
 */
/**
 * NISAの拠出計画を、倍率を「これから積み立てる分」にだけ適用して組み立てる。
 * テストから直接検証できるよう、独立した純粋関数として公開する。
 *
 * @returns {{ nisaPlan, tsumitateUsedForPlan, growthUsedForPlan, tsumitateSchedule, growthSchedule }}
 *   tsumitateUsedForPlan / growthUsedForPlan は「現在年齢より前に使ったNISA枠」。
 *   倍率をどう変えてもこの値は一定でなければならない。
 */
export function buildScaledNisaPlan({ inputs, effectiveCurrentAge, retireAge, contributionMultiplier = 1, boundaries }) {
  const m = Number.isFinite(Number(contributionMultiplier)) ? Number(contributionMultiplier) : 1;

  // 現在年齢より前を切り落とし、残り（これから積み立てる分）にだけ倍率を掛ける
  const futureSchedule = (sched) => {
    const out = [];
    (sched || []).forEach((r) => {
      const from = Number(r.fromAge);
      const to = Number(r.toAge);
      if (!Number.isFinite(from) || !Number.isFinite(to)) return;
      if (to <= effectiveCurrentAge) return; // 完全に過去 → これから積む分は無い
      out.push({
        ...r,
        fromAge: Math.max(from, effectiveCurrentAge), // 現在年齢より前は切り落とす
        toAge: to,
        monthlyYen: scale(r.monthlyYen, m),
      });
    });
    return out;
  };

  // 過去に使ったNISA枠。倍率は掛けない（過去は変えられない）。
  const tsumitateUsedForPlan = (Number(inputs.tsumitateUsed) || 0)
    + elapsedScheduleAmount(inputs.tsumitateSchedule, effectiveCurrentAge);
  const growthUsedForPlan = (Number(inputs.growthUsed) || 0)
    + elapsedScheduleAmount(inputs.growthSchedule, effectiveCurrentAge);

  const tsumitateSchedule = futureSchedule(inputs.tsumitateSchedule);
  const growthSchedule = futureSchedule(inputs.growthSchedule);

  const nisaPlan = buildNisaContributionPlan({
    currentAge: effectiveCurrentAge,
    retireAge,
    deathAge: inputs.deathAge,
    tsumitateSchedule,
    growthSchedule,
    lumpSums: inputs.lumpSums, // 一括投資は倍率の対象外（既存の枠消化ロジックのまま）
    tsumitateUsed: tsumitateUsedForPlan,
    growthUsed: growthUsedForPlan,
    boundaries,
  });

  return { nisaPlan, tsumitateUsedForPlan, growthUsedForPlan, tsumitateSchedule, growthSchedule };
}

export function buildPlanInput(ctx, overrides = {}) {
  const {
    country, rules, inputs,
    effectiveCurrentAge, effectiveCurrentAssets, effectivePostRetireReturn,
    dynamicFunds, stockTotalNow, effectiveStockReturnPct,
    goldCurrentValue, effectiveGoldReturnPct,
    effectivePensionMonthly, effectivePublicPensionStartAge,
    drawdownOrder, uncategorizedLabel,
    countryDerived = {},
  } = ctx;

  // ---- 上書き値の確定（未指定なら現在プランの値）----
  const m = Number.isFinite(Number(overrides.contributionMultiplier))
    ? Number(overrides.contributionMultiplier) : 1;
  const retireAge = overrides.retireAge === undefined || overrides.retireAge === null
    ? Number(inputs.retireAge) : Number(overrides.retireAge);
  const livingCostMonthly = overrides.livingCostMonthly === undefined || overrides.livingCostMonthly === null
    ? readLivingCostMonthly(country, inputs) : Number(overrides.livingCostMonthly);

  const D = countryDerived;
  const pools = [];
  const catMap = ACCOUNT_DRAW_CATEGORY[country] || ACCOUNT_DRAW_CATEGORY.JP;
  const ord = (key, tie = 0) => drawOrderOf(catMap[key], tie, drawdownOrder);

  // 口座の積立額に倍率を掛けた複製を返す（元の口座オブジェクトは変更しない）
  const acctOf = (bag, key) => {
    const a = (bag || {})[key] || {};
    return { ...a, annualContribution: scale(a.annualContribution, m) };
  };

  // ==========================================================================
  // 境界年齢。上書きされた retireAge を使う点だけが移設前と異なる。
  // ==========================================================================
  const boundaries = [retireAge, effectivePublicPensionStartAge];
  (inputs.insurancePolicies || []).forEach((x) => boundaries.push(x.premiumFromAge, x.premiumToAge));
  (inputs.privatePensionPlans || []).forEach((x) => {
    boundaries.push(x.contribFromAge, x.contribToAge, x.payoutFromAge, x.payoutToAge);
  });
  (inputs.tsumitateSchedule || []).forEach((x) => boundaries.push(x.fromAge, x.toAge));
  (inputs.growthSchedule || []).forEach((x) => boundaries.push(x.fromAge, x.toAge));
  (inputs.lumpSums || []).forEach((x) => boundaries.push(x.age));
  boundaries.push(inputs.gold.accumulateUntilAge);
  boundaries.push(inputs.ideco.startAge, inputs.ideco.endAge, inputs.ideco.payoutStartAge);
  if (country === "US") {
    boundaries.push(inputs.usInvestment.socialSecurity.claimAge, 59.5);
  } else if (country === "GB") {
    boundaries.push(D.gbEffectiveClaimAge, rules.investment.pensionAccessAge);
    Object.values(inputs.gbInvestment).forEach((a) => { if (a && a.contributionEndAge) boundaries.push(a.contributionEndAge); });
  } else if (country === "CA") {
    boundaries.push(D.caCppStartAge, D.caOasStartAge, rules.investment.rrifConversionAge);
    Object.values(inputs.caInvestment).forEach((a) => { if (a && a.contributionEndAge) boundaries.push(a.contributionEndAge); });
  } else if (country === "AU") {
    boundaries.push(D.auAgePensionQualifyingAge, rules.investment.preservationAge);
    Object.values(inputs.auInvestment).forEach((a) => { if (a && a.contributionEndAge) boundaries.push(a.contributionEndAge); });
  }
  const planBoundaries = boundaries.filter((v) => Number.isFinite(Number(v))).map(Number);

  // ==========================================================================
  // NISAの枠計算。
  //
  // 【なぜ単純に倍率を掛けてはいけないか】
  // buildNisaContributionPlan は内部で
  //     tsumitateCum = tsumitateUsed + elapsedScheduleAmount(schedule, currentAge)
  // として「既に使用したNISA枠」をスケジュールの過去区間から算出している。
  // スケジュール全体に倍率を掛けると、この“過去に使った枠”まで1.5倍になり、
  // 現在の状態そのものが書き換わってしまう。
  //
  // 【この実装】
  // ① スケジュールから現在年齢より前を切り落とし、残り（＝これから積み立てる分）
  //    にだけ倍率を掛ける。
  // ② 切り落とした過去分の使用枠は、倍率を掛けないまま tsumitateUsed / growthUsed
  //    へ事前に加算して渡す。
  // これにより buildNisaContributionPlan 側の elapsedScheduleAmount() は 0 になり
  // （将来区間の fromAge は必ず currentAge 以上のため）、使用済み枠の合計は
  // 移設前と完全に同一の値になる。倍率1.0なら旧実装と1円も違わない。
  //
  // 区間を2本に割って過去側を残す方法は採らない。scheduledAmount() が
  // `age >= fromAge && age <= toAge` の両端閉区間で判定するため、境界の1ステップで
  // 過去区間と将来区間の両方に一致し、その月だけ拠出が二重計上されるため。
  //
  // 年間上限・生涯上限は倍率適用後の額に対して buildNisaContributionPlan が
  // そのまま再判定するので、1.5倍にしても上限を超えて積み立てられない。
  // ==========================================================================
  const { nisaPlan } = buildScaledNisaPlan({
    inputs,
    effectiveCurrentAge,
    retireAge,
    contributionMultiplier: m,
    boundaries: planBoundaries,
  });

  // ==========================================================================
  // iDeCo（日本のみ）。倍率は掛けない（上のヘッダコメントの理由による）。
  // 退職年齢を変えても iDeCo は自身の endAge / payoutStartAge に従うため、
  // 移設前と同じ入力で同じ結果になる。
  // ==========================================================================
  const effectiveIdecoReturn = inputs.ideco.returnPctAuto
    ? guessDefaultReturn(inputs.ideco.productName) : inputs.ideco.returnPct;
  const idecoAsOfAge = (inputs.ideco.asOfYears !== "" && inputs.ideco.asOfYears !== undefined && inputs.ideco.asOfYears !== null)
    ? Number(inputs.ideco.asOfYears || 0) + Number(inputs.ideco.asOfMonths || 0) / 12
    : null;
  const idecoSim = runIdecoSimulation({
    currentAge: effectiveCurrentAge,
    deathAge: inputs.deathAge,
    ideco: { ...inputs.ideco, returnPct: effectiveIdecoReturn, asOfAge: idecoAsOfAge },
  });
  const idecoPayoutMethod = inputs.ideco.payoutMethod;
  const getIdecoMonthlyIncome = (idecoPayoutMethod === "pension" || idecoPayoutMethod === "both")
    ? (age) => ((age >= idecoSim.payoutStartAge && age < idecoSim.payoutEndAge) ? idecoSim.annualPayout / 12 : 0)
    : null;

  // ==========================================================================
  // 主要投資口座（国別）— 移設前と同一。retireAge と倍率だけが差し替わる。
  // ==========================================================================
  if (country === "JP") {
    const entries = (dynamicFunds && dynamicFunds.length)
      ? dynamicFunds
      : [{ id: uncategorizedLabel, pct: 100, returnPct: 5 }];
    entries.forEach((f, i) => {
      pools.push({
        id: `nisa_${i}`,
        group: "investment",
        drawCategory: catMap.nisa,
        balance: effectiveCurrentAssets * ((f.pct || 0) / 100),
        annualReturnPct: f.returnPct,
        retireReturnPct: effectivePostRetireReturn,
        contributionFn: (age, dt, stepIndex) => (nisaPlan.byStep[stepIndex] || 0) * ((f.pct || 0) / 100),
        withdrawalTaxPct: 0, // NISAは非課税
        drawOrder: ord("nisa", i),
      });
    });
  } else if (country === "US" && rules.investment.implemented) {
    const acc = inputs.usInvestment;
    const early = rules.investment.earlyWithdrawalAge;
    INVESTMENT_ACCOUNT_KEYS.US.forEach((key, i) => {
      const a = acctOf(acc, key);
      pools.push({
        id: key, group: "investment", drawCategory: catMap[key],
        balance: Number(a.currentValue) || 0,
        annualReturnPct: acc.expectedReturnPct,
        monthlyContribution: (Number(a.annualContribution) || 0) / 12,
        contribEndAge: retireAge,
        // Brokerageはいつでも引き出せる。401(k)/IRA/Rothは59.5歳まで制限。
        accessAge: key === "brokerage" ? 0 : early,
        withdrawalTaxPct: Number(a.withdrawalTaxPct) || 0,
        drawOrder: ord(key, i),
      });
    });
  } else if (country === "GB" && rules.investment.implemented) {
    const acc = inputs.gbInvestment;
    const accessAge = rules.investment.pensionAccessAge;
    INVESTMENT_ACCOUNT_KEYS.GB.forEach((key, i) => {
      const a = acctOf(acc, key);
      const isPension = key === "sipp" || key === "workplacePension";
      pools.push({
        id: key, group: "investment", drawCategory: catMap[key],
        balance: Number(a.currentValue) || 0,
        annualReturnPct: a.expectedReturnPct,
        monthlyContribution: (Number(a.annualContribution) || 0) / 12,
        contribEndAge: Number(a.contributionEndAge) || retireAge,
        accessAge: isPension ? accessAge : 0,
        withdrawalTaxPct: Number(a.withdrawalTaxPct) || 0,
        drawOrder: ord(key, i),
      });
    });
  } else if (country === "CA" && rules.investment.implemented) {
    const acc = inputs.caInvestment;
    const inv = rules.investment;
    INVESTMENT_ACCOUNT_KEYS.CA.forEach((key, i) => {
      const a = acctOf(acc, key);
      const pool = {
        id: key, group: "investment", drawCategory: catMap[key],
        balance: Number(a.currentValue) || 0,
        annualReturnPct: a.expectedReturnPct,
        monthlyContribution: (Number(a.annualContribution) || 0) / 12,
        contribEndAge: Number(a.contributionEndAge) || retireAge,
        withdrawalTaxPct: Number(a.withdrawalTaxPct) || 0,
        drawOrder: ord(key, i),
      };
      // RRIF：71歳以降はRRSPから最低取崩し額が強制的に発生し、非登録口座へ移る
      if (key === "rrsp") {
        pool.minimumDrawdown = (age, bal) =>
          (age >= inv.rrifConversionAge ? inv.getRrifMinimumWithdrawal(age, bal) : 0);
        pool.minimumDrawdownTo = "nonRegistered";
      }
      pools.push(pool);
    });
  } else if (country === "AU" && rules.investment.implemented) {
    const acc = inputs.auInvestment;
    const inv = rules.investment;
    const contribTax = rules.tax.superannuation.contributionsTaxRate;
    const earnTax = rules.tax.superannuation.earningsTaxAccumulation;
    // 任意拠出（voluntaryConcessional）も「これから積み立てる分」なので倍率の対象。
    // annualSalary（＝SG拠出の基礎）は給与であって積立額ではないため倍率を掛けない。
    const concessionalNet = inv.getTotalConcessional(
      acc.annualSalary, scale(acc.voluntaryConcessional, m)
    ) * (1 - contribTax);
    INVESTMENT_ACCOUNT_KEYS.AU.forEach((key, i) => {
      const a = acctOf(acc, key);
      const isSuper = key === "superannuation";
      const pool = {
        id: key, group: "investment", drawCategory: catMap[key],
        balance: Number(a.currentValue) || 0,
        annualReturnPct: a.expectedReturnPct,
        monthlyContribution: ((Number(a.annualContribution) || 0) + (isSuper ? concessionalNet : 0)) / 12,
        contribEndAge: Number(a.contributionEndAge) || retireAge,
        withdrawalTaxPct: Number(a.withdrawalTaxPct) || 0,
        drawOrder: ord(key, i),
      };
      if (isSuper) {
        pool.accessAge = inv.preservationAge; // preservation age まで取り崩せない
        pool.earningsTaxPct = earnTax * 100;  // 積立期の運用益に15%課税
        pool.minimumDrawdown = (age, bal) =>
          (inv.canAccessSuper(age) ? inv.getMinimumDrawdown(age, bal) : 0);
        pool.minimumDrawdownTo = "investmentAccount";
      }
      pools.push(pool);
    });
  }

  // ---- 銀行預金（全ての国で共通。取り崩しの最優先）----
  //
  // 【第2段階：銀行積立にも倍率を掛ける】
  // 銀行は残高（balance）を入力値からそのまま使っており、金やiDeCoのような
  // 「基準年齢から現在までの遡及計算」を持たない。したがって monthlyDeposit に
  // 倍率を掛けても、現在の残高＝過去に積み立てた結果は一切変わらない。
  // 影響するのは contribEndAge（退職）までの将来の入金だけ。
  (inputs.banks || []).forEach((b, i) => {
    pools.push({
      id: `bank_${i}`, group: "bank", drawCategory: "cash",
      balance: Number(b.balance) || 0, // 現在残高：倍率の対象外（過去は変えない）
      annualReturnPct: b.interestPct || 0,
      monthlyContribution: scale(b.monthlyDeposit, m), // これから入金する分だけ倍率
      contribEndAge: retireAge,
      withdrawalTaxPct: 0,
      drawOrder: drawOrderOf("cash", i, drawdownOrder),
    });
  });
  if (!(inputs.banks || []).length) {
    // 銀行口座が1つも無い場合の受け皿（一時金・余剰金の行き先）
    pools.push({
      id: "bank_0", group: "bank", drawCategory: "cash",
      balance: 0, annualReturnPct: 0, withdrawalTaxPct: 0,
      drawOrder: drawOrderOf("cash", 0, drawdownOrder),
    });
  }

  // ---- 個別株（課税口座）→ 金（現物・最後）----
  pools.push({
    id: "stock", group: "stock", drawCategory: "taxable",
    balance: stockTotalNow, annualReturnPct: effectiveStockReturnPct,
    withdrawalTaxPct: 0,
    drawOrder: drawOrderOf("taxable", 50, drawdownOrder),
  });
  pools.push({
    id: "gold", group: "gold", drawCategory: "physical",
    // 【第3段階：金積立にも倍率を掛ける】
    // 金の現在評価額（goldCurrentValue）は App 側が runGoldSimulation で
    // 「倍率をかけていない入力」から算出し、ctx 経由で渡している。
    // buildPlanInput の中で再計算していないため、monthlyYen に倍率を掛けても
    // 基準年齢から今日までの遡及計算＝現在の保有グラム数・評価額には一切影響しない。
    // 動くのは accumulateUntilAge までの「これから買う分」だけ。
    balance: goldCurrentValue, // 現在評価額：倍率の対象外（過去は変えない）
    annualReturnPct: effectiveGoldReturnPct,
    monthlyContribution: scale(inputs.gold.monthlyYen, m), // これから積み立てる分だけ倍率
    // 金の積立終了は退職年齢ではなく、金専用の accumulateUntilAge で決まる。
    // 比較プランで退職年齢を変えても、この年齢が設定されていればそちらが優先される。
    contribEndAge: Number(inputs.gold.accumulateUntilAge) || retireAge,
    withdrawalTaxPct: 0,
    drawOrder: drawOrderOf("physical", 0, drawdownOrder),
  });

  // ---- 民間年金積立：生活費の直接の取り崩し対象にはしない ----
  const privatePensionPlans = [];
  (inputs.privatePensionPlans || []).forEach((pl, i) => {
    const id = `pp_${i}`;
    const priorEndAge = Math.min(pl.contribToAge, effectiveCurrentAge);
    const priorMonths = Math.max(0, Math.round((priorEndAge - pl.contribFromAge) * 12));
    const opening = (pl.currentBalance !== null && pl.currentBalance !== undefined)
      ? pl.currentBalance
      : priorMonths * (pl.monthlyContribution || 0);
    pools.push({
      id, group: "privatePension",
      balance: opening, annualReturnPct: 0,
      monthlyContribution: Number(pl.monthlyContribution) || 0,
      contribEndAge: pl.contribToAge,
      accessAge: NOT_DRAWABLE,
    });
    privatePensionPlans.push({
      poolId: id,
      monthlyPayout: pl.monthlyPayout || 0,
      payoutFromAge: pl.payoutFromAge,
      payoutToAge: pl.payoutToAge,
    });
  });

  // ---- iDeCo（日本のみ）：受取開始まではロック ----
  let idecoPoolId = null;
  let idecoLumpAmount = 0;
  let idecoLumpAge = null;
  let idecoAnnuityMonthly = null;
  if (country === "JP") {
    idecoPoolId = "ideco";
    pools.push({
      id: "ideco", group: "ideco", drawCategory: "restricted",
      balance: idecoSim.currentValueAdjusted ?? (inputs.ideco.currentValue || 0),
      annualReturnPct: inputs.ideco.expectedReturnPct,
      monthlyContribution: Number(inputs.ideco.monthlyContribution) || 0,
      contribEndAge: inputs.ideco.endAge,
      accessAge: NOT_DRAWABLE, // 受取ルール（一時金・年金）でのみ払い出される
    });
    idecoLumpAmount = (idecoPayoutMethod === "lump" || idecoPayoutMethod === "both")
      ? (idecoSim.lumpAmount || 0) : 0;
    idecoLumpAge = idecoSim.payoutStartAge;
    idecoAnnuityMonthly = (age) => (getIdecoMonthlyIncome ? (getIdecoMonthlyIncome(age) || 0) : 0);
  }

  // ==========================================================================
  // 国別の生活費・医療費・公的年金（受給開始年齢つき）
  // 公的年金は退職年齢から自動的には始まらない。
  // ==========================================================================
  let healthCostAnnual = () => 0;
  const publicPensions = [];
  if (country === "JP") {
    healthCostAnnual = (age) => healthAnnualCost(age, inputs.healthBrackets);
    publicPensions.push({ monthlyAmount: effectivePensionMonthly, startAge: effectivePublicPensionStartAge });
  } else if (country === "US") {
    healthCostAnnual = () => D.usTotalHealthcareAnnual;
    publicPensions.push({ monthlyAmount: D.usSSMonthlyBenefit, startAge: D.usClaimAge });
  } else if (country === "GB") {
    healthCostAnnual = () => D.gbHealthcareAnnual;
    publicPensions.push({ monthlyAmount: D.gbStatePensionAnnual / 12, startAge: D.gbEffectiveClaimAge });
    publicPensions.push({ monthlyAmount: D.gbAdditionalPensionAnnual / 12, startAge: retireAge });
  } else if (country === "CA") {
    healthCostAnnual = () => D.caHealthcareAnnual;
    publicPensions.push({ monthlyAmount: D.caCppAnnual / 12, startAge: D.caCppStartAge });
    publicPensions.push({
      monthlyAmount: D.caOasAnnual / 12,
      startAge: rules.retirement.implemented
        ? rules.retirement.getOasEffectiveStartAge(D.caOasStartAge) : D.caOasStartAge,
    });
    publicPensions.push({ monthlyAmount: D.caAdditionalPensionAnnual / 12, startAge: retireAge });
  } else if (country === "AU") {
    healthCostAnnual = () => D.auHealthcareAnnual;
    publicPensions.push({ monthlyAmount: D.auAgePensionAnnual / 12, startAge: D.auAgePensionQualifyingAge });
    publicPensions.push({ monthlyAmount: D.auOtherAnnualIncome / 12, startAge: retireAge });
  }

  return {
    currentAge: effectiveCurrentAge,
    retireAge,
    deathAge: inputs.deathAge,
    boundaries: planBoundaries,
    pools,
    loans: inputs.loans,
    insurancePolicies: inputs.insurancePolicies,
    privatePensionPlans,
    livingCostMonthly,
    publicPensions,
    healthCostAnnual,
    idecoPoolId,
    idecoLumpAmount,
    idecoLumpAge,
    idecoAnnuityMonthly,
    surplusTargetId: "bank_0",
  };
}
