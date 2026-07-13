// ============================================================================
// countryRules/US.js
// App.jsx から国別ルール定義（US_COUNTRY_RULES）をそのまま切り出したファイル。
// 数値・関数・コメントは一切変更していない（挙動・計算結果は完全に同一）。
// ============================================================================

// ---------- countryRules/US.js 相当（仮実装：未実装のプレースホルダーのみ） ----------
// 実装時にはこのオブジェクトの中身だけを差し替えればよく、JP.js・GB.js・共通エンジン・
// React画面側のコードは一切変更不要な設計にしてある。
export const US_COUNTRY_RULES = {
  investment: {
    implemented: true,
    accountTypes: ["401k", "traditionalIra", "rothIra", "brokerage"],
    // 出典：IRS Notice 2025-67（2026年分の物価連動調整）。
    // "401(k) limit increases to $24,500 for 2026, IRA limit increases to $7,500"
    // https://www.irs.gov/newsroom/401k-limit-increases-to-24500-for-2026-ira-limit-increases-to-7500
    sourceNote: "IRS Notice 2025-67 (published Nov 13, 2025): 2026 cost-of-living adjustments for retirement plans.",
    limits2026: {
      k401: {
        employeeDeferral: 24500,     // 従業員拠出（elective deferral）上限
        catchUp50: 8000,             // 50歳以上の追加拠出（catch-up）
        catchUp60to63: 11250,        // 60〜63歳の特例追加拠出（"super catch-up"）
        combinedEmployerEmployee: 72000, // 従業員＋雇用主合計（IRC §415(c)）上限
      },
      ira: {
        // Traditional IRAとRoth IRAは拠出上限を共有する（合算で上限まで）
        contribution: 7500,
        catchUp50: 1100,
      },
    },
    // Roth IRAへ拠出できるかどうかのMAGI（修正調整後総所得）フェーズアウト範囲（2026年）
    rothPhaseOut2026: {
      single: [153000, 168000],
      headOfHousehold: [153000, 168000],
      marriedJoint: [242000, 252000],
      marriedSeparate: [0, 10000],
    },
    // Traditional IRAの「掛金控除」が縮小され始めるMAGI範囲（2026年）。
    // 本人・配偶者どちらも勤務先の企業年金制度に加入していない場合は、
    // 所得にかかわらず全額控除できる（フェーズアウト適用外）。
    traditionalIraDeductionPhaseOut2026: {
      // 本人が企業年金制度に加入している場合
      coveredSingleOrHoh: [81000, 91000],
      coveredMarriedJoint: [129000, 149000],
      coveredMarriedSeparate: [0, 10000],
      // 本人は非加入だが配偶者が加入している場合（共同申告）
      notCoveredSpouseCoveredMarriedJoint: [242000, 252000],
    },
    brokerage: {
      contributionLimit: null, // 上限なし（課税口座）
      taxAdvantaged: false,
    },

    // ---------- 計算関数（すべて純粋関数。共通エンジンやJPのコードからは呼ばれない） ----------

    // 401(k) の年間拠出上限（従業員拠出分のみ。雇用主分は含まない）
    get401kEmployeeLimit(age) {
      const l = this.limits2026.k401;
      if (age >= 60 && age <= 63) return l.employeeDeferral + l.catchUp60to63;
      if (age >= 50) return l.employeeDeferral + l.catchUp50;
      return l.employeeDeferral;
    },
    // 401(k) の従業員＋雇用主合計拠出上限（IRC §415(c)）
    get401kCombinedLimit(age) {
      const l = this.limits2026.k401;
      const catchUp = age >= 60 && age <= 63 ? l.catchUp60to63 : (age >= 50 ? l.catchUp50 : 0);
      return l.combinedEmployerEmployee + catchUp;
    },
    // IRA（Traditional + Roth 合算）の年間拠出上限
    getIraContributionLimit(age) {
      const l = this.limits2026.ira;
      return age >= 50 ? l.contribution + l.catchUp50 : l.contribution;
    },
    // 直線的なフェーズアウト計算（範囲内で上限から0へ比例的に減少）。
    // full を超えていれば1、start未満なら0、範囲内ならその比率を返す。
    _phaseOutRatio(magi, [start, end]) {
      if (end <= start) return magi >= start ? 1 : 0;
      if (magi <= start) return 0;
      if (magi >= end) return 1;
      return (magi - start) / (end - start);
    },
    // Roth IRAへ拠出可能な割合（1=満額拠出可, 0=拠出不可, 間の値=一部のみ）
    getRothIraEligibleFraction(filingStatus, magi) {
      const range = this.rothPhaseOut2026[filingStatus] || this.rothPhaseOut2026.single;
      return 1 - this._phaseOutRatio(magi, range);
    },
    // Traditional IRA拠出額のうち、所得控除の対象となる割合
    // （本人・配偶者とも企業年金制度未加入なら、所得に関係なく常に1＝全額控除）
    getTraditionalIraDeductibleFraction({ filingStatus, magi, coveredByWorkplacePlan, spouseCoveredByWorkplacePlan }) {
      if (!coveredByWorkplacePlan && !spouseCoveredByWorkplacePlan) return 1;
      let range;
      if (coveredByWorkplacePlan) {
        if (filingStatus === "marriedJoint") range = this.traditionalIraDeductionPhaseOut2026.coveredMarriedJoint;
        else if (filingStatus === "marriedSeparate") range = this.traditionalIraDeductionPhaseOut2026.coveredMarriedSeparate;
        else range = this.traditionalIraDeductionPhaseOut2026.coveredSingleOrHoh;
      } else {
        // 本人は非加入・配偶者のみ加入（共同申告のときだけこの優遇レンジが使える）
        range = filingStatus === "marriedJoint"
          ? this.traditionalIraDeductionPhaseOut2026.notCoveredSpouseCoveredMarriedJoint
          : [0, 0]; // 単身などでこのケースは通常発生しない
      }
      return 1 - this._phaseOutRatio(magi, range);
    },
    // 401(k)/Traditional IRA/Roth IRA/Brokerageの残高を、現在の年齢から死亡想定年齢まで
    // 口座ごとに年単位で積み上げる（退職年齢までは各口座へ拠出を継続、退職後は年間取崩し額を
    // 差し引く）。取崩しは「Brokerage → Traditional IRA → 401(k) → Roth IRA」の順に行う
    // （課税口座を先に使い、Rothを最後まで温存する一般的な考え方の簡易モデル）。
    // JPのrunSimulation（NISA専用）とは完全に別関数。US_COUNTRY_RULES以外からは呼ばれない。
    simulateGrowth({ currentAge, retireAge, deathAge, accounts, returnPct, annualWithdrawalNeeded }) {
      const rate = (Number(returnPct) || 0) / 100;
      const balances = {
        k401: Number(accounts.k401.currentValue) || 0,
        traditionalIra: Number(accounts.traditionalIra.currentValue) || 0,
        rothIra: Number(accounts.rothIra.currentValue) || 0,
        brokerage: Number(accounts.brokerage.currentValue) || 0,
      };
      const contributions = {
        k401: Number(accounts.k401.annualContribution) || 0,
        traditionalIra: Number(accounts.traditionalIra.annualContribution) || 0,
        rothIra: Number(accounts.rothIra.annualContribution) || 0,
        brokerage: Number(accounts.brokerage.annualContribution) || 0,
      };
      const withdrawalOrder = ["brokerage", "traditionalIra", "k401", "rothIra"];
      const combinedValue = (b) => b.k401 + b.traditionalIra + b.rothIra + b.brokerage;
      const startAge = Math.round(currentAge);
      const endAge = Math.round(deathAge);
      const yearly = [{ age: startAge, value: combinedValue(balances), accounts: { ...balances } }];
      for (let age = startAge + 1; age <= endAge; age++) {
        Object.keys(balances).forEach((k) => { balances[k] = balances[k] * (1 + rate); });
        if (age <= retireAge) {
          Object.keys(balances).forEach((k) => { balances[k] += contributions[k]; });
        } else {
          let remaining = Number(annualWithdrawalNeeded) || 0;
          for (const key of withdrawalOrder) {
            if (remaining <= 0) break;
            const take = Math.min(balances[key], remaining);
            balances[key] -= take;
            remaining -= take;
          }
        }
        yearly.push({ age, value: combinedValue(balances), accounts: { ...balances } });
      }
      return { yearly, finalValue: combinedValue(balances), finalAccounts: { ...balances } };
    },
    // 59½歳未満の場合、401(k)・Traditional IRAは早期引き出しに税金・ペナルティが伴うため
    // 「制約付き資産」として扱う。Roth IRAは拠出元本と運用益を分離できない現在のデータ構造の
    // 制約上、簡易的に常に「退職資産（制約付き）」として扱う。Brokerageは常に「引き出し可能資産」。
    // 今回は完全な税額計算は行わない（画面上に注意書きを表示するのみ）。
    earlyWithdrawalAge: 59.5,
    splitLiquidRestricted(age, accounts) {
      const isAccessibleAge = age >= this.earlyWithdrawalAge;
      const k401 = Number(accounts.k401) || 0;
      const traditionalIra = Number(accounts.traditionalIra) || 0;
      const rothIra = Number(accounts.rothIra) || 0;
      const brokerage = Number(accounts.brokerage) || 0;
      const liquid = brokerage + (isAccessibleAge ? k401 + traditionalIra : 0);
      const restricted = rothIra + (isAccessibleAge ? 0 : k401 + traditionalIra);
      return { liquid, restricted, isAccessibleAge };
    },
  },
  retirement: {
    implemented: true,
    accountTypes: ["socialSecurity"],
    // 出典：SSA "Retirement Age and Benefit Reduction" / "Delayed Retirement Credits"（ssa.gov）。
    // 1960年以降生まれの満額支給開始年齢（Full Retirement Age）は67歳で固定。
    sourceNote: "SSA rules (ssa.gov): full retirement age 67 for anyone born 1960 or later. Early claiming reduces benefits; delayed claiming increases them.",
    socialSecurity: {
      fullRetirementAge: 67,
      earliestClaimAge: 62,
      latestClaimAge: 70,
      // 早期受給：FRAより前の最初の36ヶ月は月あたり5/9%減額、それ以前（36ヶ月超）は月あたり5/12%減額
      earlyReductionPerMonthFirst36: 5 / 9 / 100,
      earlyReductionPerMonthBeyond36: 5 / 12 / 100,
      // 繰下げ受給：FRAより後は月あたり2/3%増額（年8%）、70歳で頭打ち
      delayedCreditPerMonth: (2 / 3) / 100,
    },
    // 満額（FRA）受給額に対する倍率を、実際に受給を開始する年齢から計算する（月単位で正確に計算）。
    getClaimingFactor(claimAgeInYears) {
      const ss = this.socialSecurity;
      const fraMonths = ss.fullRetirementAge * 12;
      const claimMonths = Math.round(claimAgeInYears * 12);
      const diffMonths = claimMonths - fraMonths;
      if (diffMonths >= 0) {
        // 繰下げ受給（70歳＝FRA+36ヶ月で頭打ち）
        const cappedMonths = Math.min(diffMonths, (ss.latestClaimAge - ss.fullRetirementAge) * 12);
        return 1 + cappedMonths * ss.delayedCreditPerMonth;
      }
      // 早期受給
      const monthsEarly = Math.min(-diffMonths, (ss.fullRetirementAge - ss.earliestClaimAge) * 12);
      const first36 = Math.min(monthsEarly, 36);
      const beyond36 = Math.max(0, monthsEarly - 36);
      const reduction = first36 * ss.earlyReductionPerMonthFirst36 + beyond36 * ss.earlyReductionPerMonthBeyond36;
      return 1 - reduction;
    },
    // 月額の実受給額 = FRA時点の月額（PIA、ユーザー入力） × 受給開始年齢に応じた倍率
    getMonthlyBenefit(piaMonthly, claimAgeInYears) {
      return piaMonthly * this.getClaimingFactor(claimAgeInYears);
    },
  },
  healthcare: {
    implemented: true,
    model: "medicarePartBWithIrmaa",
    // 出典：CMS "2026 Medicare Parts A & B Premiums and Deductibles"（cms.gov、2025年11月14日発表）。
    sourceNote: "CMS 2026 Medicare Part B premium and IRMAA brackets (announced Nov 14, 2025).",
    medicare2026: {
      standardPartB: 202.90,
      // IRMAA（所得に応じた追加保険料）区分。しきい値はMAGI（修正調整後総所得）。
      irmaaSingleOrHoh: [
        { upTo: 109000, premium: 202.90 },
        { upTo: 137000, premium: 284.10 },
        { upTo: 171000, premium: 405.80 },
        { upTo: 205000, premium: 527.50 },
        { upTo: 499999, premium: 649.20 },
        { upTo: Infinity, premium: 689.90 },
      ],
      irmaaMarriedJoint: [
        { upTo: 218000, premium: 202.90 },
        { upTo: 274000, premium: 284.10 },
        { upTo: 342000, premium: 405.80 },
        { upTo: 410000, premium: 527.50 },
        { upTo: 749999, premium: 649.20 },
        { upTo: Infinity, premium: 689.90 },
      ],
      // 別居していない夫婦の個別申告（Married Filing Separately）は中間区分がなく急に跳ね上がる
      irmaaMarriedSeparate: [
        { upTo: 109000, premium: 202.90 },
        { upTo: 390999, premium: 649.20 },
        { upTo: Infinity, premium: 689.90 },
      ],
    },
    // 年間のMedicare Part B保険料（IRMAA込み）を試算する
    getAnnualMedicarePartB(filingStatus, magi) {
      const table = filingStatus === "marriedJoint"
        ? this.medicare2026.irmaaMarriedJoint
        : filingStatus === "marriedSeparate"
          ? this.medicare2026.irmaaMarriedSeparate
          : this.medicare2026.irmaaSingleOrHoh;
      const bracket = table.find((b) => magi <= b.upTo) || table[table.length - 1];
      return bracket.premium * 12;
    },
  },
  tax: {
    implemented: true,
    model: "federalBracketsPlusLtcgPlusNiit",
    // 出典：IRS "2026 tax inflation adjustments"（Revenue Procedure 2025-32）。州税は州により大きく異なるため、
    // このアプリでは固定税率を推測せず、ユーザー自身が概算の実効税率を入力する方式にしている。
    sourceNote: "IRS Revenue Procedure 2025-32 (2026 federal brackets, standard deduction, LTCG brackets, NIIT threshold). State tax is user-entered since it varies by state.",
    federalBrackets2026: {
      single: [
        { upTo: 12400, rate: 0.10 },
        { upTo: 50400, rate: 0.12 },
        { upTo: 105700, rate: 0.22 },
        { upTo: 201775, rate: 0.24 },
        { upTo: 256225, rate: 0.32 },
        { upTo: 640600, rate: 0.35 },
        { upTo: Infinity, rate: 0.37 },
      ],
      marriedJoint: [
        { upTo: 24800, rate: 0.10 },
        { upTo: 100800, rate: 0.12 },
        { upTo: 211400, rate: 0.22 },
        { upTo: 403550, rate: 0.24 },
        { upTo: 512450, rate: 0.32 },
        { upTo: 768700, rate: 0.35 },
        { upTo: Infinity, rate: 0.37 },
      ],
    },
    standardDeduction2026: {
      single: 16100,
      marriedJoint: 32200,
      marriedSeparate: 16100,
      headOfHousehold: 24150,
    },
    // 長期キャピタルゲイン税率（0/15/20%）の所得区分（課税所得ベース）
    ltcgBrackets2026: {
      single: [{ upTo: 49450, rate: 0 }, { upTo: 545500, rate: 0.15 }, { upTo: Infinity, rate: 0.20 }],
      marriedJoint: [{ upTo: 98900, rate: 0 }, { upTo: 613700, rate: 0.15 }, { upTo: Infinity, rate: 0.20 }],
      marriedSeparate: [{ upTo: 49450, rate: 0 }, { upTo: 306850, rate: 0.15 }, { upTo: Infinity, rate: 0.20 }],
      headOfHousehold: [{ upTo: 66200, rate: 0 }, { upTo: 579600, rate: 0.15 }, { upTo: Infinity, rate: 0.20 }],
    },
    // Net Investment Income Tax：3.8%が投資所得にかかる追加税（MAGIが閾値を超えた分にのみ適用）
    niitRate: 0.038,
    niitThreshold: { single: 200000, marriedJoint: 250000, marriedSeparate: 125000, headOfHousehold: 200000 },
    // 累進課税：課税所得（gross - standard deduction）に区分ごとの税率を順番に適用する
    calculateFederalTax(grossIncome, filingStatus) {
      const fs = this.federalBrackets2026[filingStatus] ? filingStatus : "single";
      const deduction = this.standardDeduction2026[fs] || this.standardDeduction2026.single;
      const taxableIncome = Math.max(0, grossIncome - deduction);
      const brackets = this.federalBrackets2026[fs === "marriedSeparate" || fs === "headOfHousehold" ? "single" : fs] || this.federalBrackets2026.single;
      let tax = 0;
      let lower = 0;
      for (const b of brackets) {
        if (taxableIncome > lower) {
          const taxableAtThisRate = Math.min(taxableIncome, b.upTo) - lower;
          tax += taxableAtThisRate * b.rate;
          lower = b.upTo;
        } else break;
      }
      return { taxableIncome, tax };
    },
    // 長期キャピタルゲイン税額（他の所得の上に積み上がるものとして概算）
    calculateLtcgTax(ordinaryTaxableIncome, gain, filingStatus) {
      const fs = this.ltcgBrackets2026[filingStatus] ? filingStatus : "single";
      const brackets = this.ltcgBrackets2026[fs];
      let tax = 0;
      let stackStart = ordinaryTaxableIncome;
      let remainingGain = gain;
      let lower = 0;
      for (const b of brackets) {
        if (remainingGain <= 0) break;
        const bandTop = b.upTo;
        const bandRemaining = Math.max(0, bandTop - Math.max(lower, stackStart));
        const amountInBand = Math.min(remainingGain, bandRemaining);
        if (stackStart < bandTop && amountInBand > 0) {
          tax += amountInBand * b.rate;
          remainingGain -= amountInBand;
          stackStart += amountInBand;
        }
        lower = bandTop;
      }
      return tax;
    },
    calculateNiit(magi, netInvestmentIncome, filingStatus) {
      const threshold = this.niitThreshold[filingStatus] || this.niitThreshold.single;
      const excess = Math.max(0, magi - threshold);
      return Math.min(excess, Math.max(0, netInvestmentIncome)) * this.niitRate;
    },
  },
  labels: {
    investmentNote: "investmentLimitsNotImplementedNote",
    retirementNote: "retirementNotImplementedNote",
    healthcareNote: "healthcareNotImplementedNote",
    taxNote: "taxNotImplementedNote",
  },
  defaults: {},
};
