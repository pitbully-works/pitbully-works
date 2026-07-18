// ============================================================================
// countryRules/CA.js
// App.jsx から国別ルール定義（CA_COUNTRY_RULES）をそのまま切り出したファイル。
// 数値・関数・コメントは一切変更していない（挙動・計算結果は完全に同一）。
// ============================================================================

// ---------- countryRules/CA.js 相当（カナダ版：実装済み） ----------
// country: CA
// lastUpdated: 2026-07-18
// source: canada.ca（CRA / Service Canada / ESDC）
// 対象年度：2026課税年度（暦年）。CPP・OASの給付額は四半期ごとに物価連動で改定される。
// 制度上限・税率はすべて CA_COUNTRY_RULES 内に集約し、画面や共通計算関数へ直接書かない。
// 各セクションは effectiveTaxYear / lastUpdated / sourceName / sourceUrl を持つ。
// 根拠が確認できない数値は推測で入れず、未実装項目は notImplemented に明示する。
// 【重要】このオブジェクトは JP / US / GB のルールを一切参照せず、逆に参照もされない。
export const CA_COUNTRY_RULES = {
  investment: {
    implemented: true,
    effectiveTaxYear: "2026",
    lastUpdated: "2026-07-18",
    sourceName: "Government of Canada (CRA) — TFSA / RRSP contribution limits, RRIF minimum withdrawals",
    sourceUrl: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/tax-free-savings-account.html",
    sourceUrls: {
      tfsa: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/tax-free-savings-account.html",
      rrsp: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/rrsps-related-plans.html",
      limitsTable: "https://www.canada.ca/en/revenue-agency/services/tax/registered-plans-administrators/pspa/mp-rrsp-dpsp-tfsa-limits-ympe.html",
      rrif: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/rrsps-related-plans/registered-retirement-income-fund-rrif.html",
    },
    // カナダ版で別々に管理・計算する口座
    accountTypes: ["tfsa", "rrsp", "nonRegistered", "cashSavings"],
    taxAdvantagedAccounts: ["tfsa", "rrsp"],
    limits: {
      // TFSA：2026年の年間拠出上限（2024・2025年と同額）
      tfsaAnnualLimit: 7000,
      // 2009年から一度も拠出していない場合の累積上限（2026年1月1日時点）
      tfsaCumulativeRoom2026: 109000,
      // RRSP：前年の稼得所得の18% と 年間上限額 の低い方
      rrspAnnualDollarLimit: 33810,
      rrspIncomePercent: 0.18,
    },
    // RRSPは71歳の年末までにRRIF（またはアニュイティ）へ強制転換される（rrifConversionAge）。
    // 最低取崩しが義務づけられるのは転換の「翌年」＝72歳の年からで、その年の1月1日時点の
    // 残高に年齢別の率を掛けた額を引き出す（rrifFirstWithdrawalAge）。
    // 65〜71歳の率は、任意で早期にRRIFを開設した場合にのみ適用される。
    rrifConversionAge: 71,
    rrifFirstWithdrawalAge: 72,
    // RRIF最低取崩し率（CRA公表テーブル。71歳以降が強制、65〜70歳は任意のRRIF開始時に適用）
    rrifMinimumFactors: {
      65: 0.0400, 66: 0.0417, 67: 0.0435, 68: 0.0455, 69: 0.0476, 70: 0.0500,
      71: 0.0528, 72: 0.0540, 73: 0.0553, 74: 0.0567, 75: 0.0582, 76: 0.0598,
      77: 0.0617, 78: 0.0636, 79: 0.0658, 80: 0.0682, 81: 0.0708, 82: 0.0738,
      83: 0.0771, 84: 0.0808, 85: 0.0851, 86: 0.0899, 87: 0.0955, 88: 0.1021,
      89: 0.1099, 90: 0.1192, 91: 0.1306, 92: 0.1449, 93: 0.1634, 94: 0.1879,
    },
    rrifMinimumFactorAt95Plus: 0.2000,

    // ---------- 計算関数（すべて純関数） ----------
    _num(v) { return Number(v) || 0; },
    getTfsaAnnualLimit() { return this.limits.tfsaAnnualLimit; },
    getTfsaRemaining(accounts) {
      return this.limits.tfsaAnnualLimit - this._num((accounts.tfsa || {}).annualContribution);
    },
    // RRSPの拠出枠：前年の稼得所得の18% と 年間上限額（$33,810）の低い方。
    // （職域年金がある場合の pension adjustment は未実装）
    getRrspRoom(priorEarnedIncome) {
      const l = this.limits;
      return Math.min(this._num(priorEarnedIncome) * l.rrspIncomePercent, l.rrspAnnualDollarLimit);
    },
    getRrspRemaining(accounts, priorEarnedIncome) {
      return this.getRrspRoom(priorEarnedIncome) - this._num((accounts.rrsp || {}).annualContribution);
    },
    // RRIFの年齢別最低取崩し率。95歳以上は一律20%。
    getRrifMinimumFactor(age) {
      const a = Math.floor(Number(age) || 0);
      if (a >= 95) return this.rrifMinimumFactorAt95Plus;
      return this.rrifMinimumFactors[a] || 0;
    },
    getRrifMinimumWithdrawal(age, rrspBalance) {
      return (Number(rrspBalance) || 0) * this.getRrifMinimumFactor(age);
    },

    // 4口座の残高を、現在の年齢から死亡想定年齢まで年単位で積み上げる。
    // 口座ごとに「現在額・年間積立額・想定利回り・積立終了年齢」を個別に持つ。
    // 取崩し順：Cash Savings → Non-Registered → TFSA → RRSP
    // （utils/simulations.js の ACCOUNT_DRAW_CATEGORY.CA = cash → taxable → taxFree →
    //   restricted と完全に一致させること。ここが食い違うと、パネルのプレビューと
    //   lifePlanEngine の本計算で取崩し順が変わり、結果が一致しなくなる）
    // ただし rrifFirstWithdrawalAge 以降は、RRSPからの最低取崩し額が強制的に発生する。
    simulateGrowth({ currentAge, retireAge, deathAge, accounts, annualWithdrawalNeeded }) {
      const keys = this.accountTypes;
      const balances = {}, contributions = {}, rates = {}, endAges = {}, withdrawalTax = {};
      keys.forEach((k) => {
        const a = accounts[k] || {};
        balances[k] = Number(a.currentValue) || 0;
        contributions[k] = Number(a.annualContribution) || 0;
        rates[k] = (Number(a.expectedReturnPct) || 0) / 100;
        endAges[k] = Number(a.contributionEndAge) || 0;
        // 引出時課税（%）。lifePlanEngine と同じ扱いにするため、ここでも税引後の手取りで計算する。
        withdrawalTax[k] = Math.min(99, Math.max(0, Number(a.withdrawalTaxPct) || 0)) / 100;
      });
      const withdrawalOrder = ["cashSavings", "nonRegistered", "tfsa", "rrsp"];
      const totalOf = (b) => keys.reduce((s, k) => s + b[k], 0);
      const startAge = Math.round(currentAge);
      const endAge = Math.round(deathAge);
      let withdrawalTaxPaid = 0;
      const yearly = [{
        age: startAge, value: totalOf(balances), accounts: { ...balances },
        rrifMinimum: 0, rrifTax: 0, withdrawalTaxPaid: 0,
      }];
      for (let age = startAge + 1; age <= endAge; age++) {
        keys.forEach((k) => { balances[k] = balances[k] * (1 + rates[k]); });
        keys.forEach((k) => { if (age <= endAges[k]) balances[k] += contributions[k]; });

        // RRIF強制取崩し（72歳以降）。引き出した額は全額が課税所得になるため、
        // 税引後の手取りだけを非登録口座へ移す（税額 rrifTax のぶん総資産が減る）。
        let rrifMinimum = 0, rrifTax = 0;
        if (age >= this.rrifFirstWithdrawalAge && balances.rrsp > 0) {
          rrifMinimum = Math.min(balances.rrsp, this.getRrifMinimumWithdrawal(age, balances.rrsp));
          const net = rrifMinimum * (1 - withdrawalTax.rrsp);
          rrifTax = rrifMinimum - net;
          balances.rrsp -= rrifMinimum;
          balances.nonRegistered += net;
        }
        withdrawalTaxPaid += rrifTax;

        if (age > retireAge) {
          // 必要額は「手取り」ベース。課税口座からは 必要額 ÷ (1 − 税率) を引き出す。
          let remaining = Number(annualWithdrawalNeeded) || 0;
          for (const key of withdrawalOrder) {
            if (remaining <= 0) break;
            const keep = 1 - withdrawalTax[key];
            const grossWanted = keep > 0 ? remaining / keep : Infinity;
            const gross = Math.min(balances[key], grossWanted);
            const net = gross * keep;
            balances[key] -= gross;
            withdrawalTaxPaid += gross - net;
            remaining -= net;
          }
        }
        yearly.push({
          age, value: totalOf(balances), accounts: { ...balances },
          rrifMinimum, rrifTax, withdrawalTaxPaid,
        });
      }
      return {
        yearly, finalValue: totalOf(balances), finalAccounts: { ...balances },
        withdrawalTaxPaid,
      };
    },

    // 資産区分。
    // ・Liquid / Accessible：TFSA・非登録口座・現金（いつでも引き出せ、引出しに課税されない or 既に課税済み）
    // ・Restricted：RRSP（引き出し自体は可能だが全額が課税所得となり源泉徴収もあるため、
    //                実質的に自由に使える資産ではない。71歳でRRIFへ強制転換される）
    // ・Tax-Advantaged：TFSA + RRSP（上2区分と重なる横断的な内訳）
    // 総資産（total）は4口座の単純合計であり、Liquid + Restricted と必ず一致する。
    splitAssets(age, accounts) {
      const v = {};
      this.accountTypes.forEach((k) => { v[k] = Number((accounts[k] || {}).currentValue) || 0; });
      const liquid = v.tfsa + v.nonRegistered + v.cashSavings;
      const restricted = v.rrsp;
      const taxAdvantaged = v.tfsa + v.rrsp;
      return {
        liquid, restricted, taxAdvantaged,
        total: liquid + restricted,
        isRrifPhase: age >= this.rrifConversionAge,
        accounts: v,
      };
    },
    notImplemented: [
      "職域年金加入者のPension Adjustment（PA）によるRRSP枠の減額",
      "RRSP・TFSAの未使用枠の繰越（キャリーフォワード）",
      "FHSA（First Home Savings Account）／RESP／RDSP",
      "RRSPからの引出し時の源泉徴収税（withholding tax）。引出時課税は口座ごとの withdrawalTaxPct（単一税率）で近似しており、実際の限界税率や源泉徴収率とは一致しない",
      "RRIF最低取崩し率に配偶者（通常は年下の配偶者）の年齢を使う選択（spousal age election）。RRIF開設時に一度だけ選べ、以後は変更できない",
      "ケベック州のQPP（CPPと拠出率・給付が異なる）",
    ],
  },

  retirement: {
    implemented: true,
    effectiveTaxYear: "2026",
    lastUpdated: "2026-07-18",
    sourceName: "Service Canada / ESDC — Canada Pension Plan, Old Age Security",
    sourceUrl: "https://www.canada.ca/en/services/benefits/publicpensions.html",
    sourceUrls: {
      cpp: "https://www.canada.ca/en/services/benefits/publicpensions/cpp.html",
      cppAmounts: "https://www.canada.ca/en/services/benefits/publicpensions/cpp/cpp-benefit/amount.html",
      oas: "https://www.canada.ca/en/services/benefits/publicpensions/cpp/old-age-security.html",
      oasRecoveryTax: "https://www.canada.ca/en/services/benefits/publicpensions/cpp/old-age-security/recovery-tax.html",
    },
    accountTypes: ["cpp", "oas"],
    cpp: {
      // 2026年に65歳で受給を開始した場合の満額（月額）。実際の受給額は拠出履歴により大きく異なるため、
      // 利用者が My Service Canada Account で確認した見込額で上書きできるようにする。
      maxMonthlyAt65: 1507.65,
      standardAge: 65,
      earliestAge: 60,
      latestAge: 70,
      // 繰上げ：65歳より前は1か月あたり0.6%減額（60歳で -36%）
      earlyReductionPerMonth: 0.006,
      // 繰下げ：65歳より後は1か月あたり0.7%増額（70歳で +42%）
      lateIncreasePerMonth: 0.007,
    },
    oas: {
      // 2026年7〜9月期の満額（月額）。OASは四半期ごとに物価連動で改定される
      // （2026年7月支給分から+1.2%：743.05→751.97 / 817.36→827.17）。
      maxMonthly65to74: 751.97,
      maxMonthly75plus: 827.17,
      enhancedAge: 75,   // 75歳以降は10%上乗せ
      standardAge: 65,
      latestAge: 70,
      earlyClaimAllowed: false, // OASは65歳より前には受給できない
      // 繰下げ：1か月あたり0.6%増額（70歳で +36%）
      lateIncreasePerMonth: 0.006,
      // 回収（クローバック）：2026課税年度、純所得がこの額を超えると超過分の15%が回収される
      recoveryTaxThreshold2026: 95323,
      recoveryTaxRate: 0.15,
      // 満額受給には18歳以降40年のカナダ居住が必要（10年で最低受給資格）
      fullResidenceYears: 40,
      minimumResidenceYears: 10,
    },

    // CPPの受給開始年齢による増減率。65歳が基準（=1.0）。
    getCppFactor(startAge) {
      const c = this.cpp;
      const a = Math.min(Math.max(Number(startAge) || c.standardAge, c.earliestAge), c.latestAge);
      const months = (a - c.standardAge) * 12;
      if (months < 0) return 1 + months * c.earlyReductionPerMonth;  // months負 → 減額
      return 1 + months * c.lateIncreasePerMonth;
    },
    getCppMaxAnnualAt65() { return this.cpp.maxMonthlyAt65 * 12; },
    // 年間受給額 ＝ 利用者が入力した「65歳時点の見込み年額」× 受給開始年齢による増減率
    getCppAnnualBenefit(estimatedAnnualAt65, startAge) {
      return (Number(estimatedAnnualAt65) || 0) * this.getCppFactor(startAge);
    },

    // OASの受給開始年齢による増額率。65歳が基準（=1.0）。繰上げ受給はできない。
    getOasFactor(startAge) {
      const o = this.oas;
      const a = Math.min(Math.max(Number(startAge) || o.standardAge, o.standardAge), o.latestAge);
      const months = (a - o.standardAge) * 12;
      return 1 + months * o.lateIncreasePerMonth;
    },
    getOasEffectiveStartAge(startAge) {
      const o = this.oas;
      return Math.min(Math.max(Number(startAge) || o.standardAge, o.standardAge), o.latestAge);
    },
    // 年齢に応じたOAS満額（年額）。75歳以降は10%上乗せされる。
    getOasMaxAnnual(age) {
      const o = this.oas;
      const monthly = (Number(age) || 0) >= o.enhancedAge ? o.maxMonthly75plus : o.maxMonthly65to74;
      return monthly * 12;
    },
    // 居住年数による按分（40年で満額、10年未満は受給資格なし）
    getOasResidenceFraction(residenceYears) {
      const o = this.oas;
      const y = Number(residenceYears) || 0;
      if (y < o.minimumResidenceYears) return 0;
      return Math.min(1, y / o.fullResidenceYears);
    },
    // クローバック前のOAS年額
    getOasAnnualBeforeClawback(age, startAge, residenceYears) {
      return this.getOasMaxAnnual(age)
        * this.getOasFactor(startAge)
        * this.getOasResidenceFraction(residenceYears);
    },
    // OAS回収税（クローバック）：純所得が閾値を超えた分の15%を、OAS年額を上限として回収する
    getOasClawback(netIncome, oasAnnualBeforeClawback) {
      const o = this.oas;
      const excess = Math.max(0, (Number(netIncome) || 0) - o.recoveryTaxThreshold2026);
      return Math.min(Math.max(0, Number(oasAnnualBeforeClawback) || 0), excess * o.recoveryTaxRate);
    },
    getOasAnnualAfterClawback(netIncome, oasAnnualBeforeClawback) {
      const before = Math.max(0, Number(oasAnnualBeforeClawback) || 0);
      return before - this.getOasClawback(netIncome, before);
    },
    notImplemented: [
      "GIS（Guaranteed Income Supplement）およびAllowance",
      "ケベック州のQPP（受給額・拠出率がCPPと異なる）",
      "CPP拠出履歴からの受給見込額の自動算出（利用者が見込額を入力する方式）",
      "CPP post-retirement benefit（受給開始後も就労を続けた場合の増額）",
      "配偶者との年金分割（pension income splitting / CPP sharing）",
      // 【B-3／将来対応】OAS回収税の判定所得は、本来はその年の純世界所得（OAS本体・CPP・
      //   RRIF強制取崩し・非登録口座の課税所得を含み、TFSA引出しは含まない）で毎年
      //   再計算すべきもの。現行は利用者が入力した年間総所得（annualIncome）を全期間
      //   一定として扱うため、RRIF最低取崩し率が上がる80代以降のクローバックを過小評価する。
      "OAS回収税の判定所得を、退職後の純世界所得から年ごとに再計算すること（現行は入力値で固定）",
    ],
  },

  healthcare: {
    implemented: true,
    // 州・準州の公的医療保険（Medicare）でカバーされることを前提に、
    // 自己負担が生じうる費目のみ年間費用を入力する簡易モデル。
    model: "selfInputAnnualCostsWithProvincialCoverage",
    effectiveTaxYear: "2026",
    lastUpdated: "2026-07-18",
    sourceName: "Government of Canada — Canada's health care system",
    sourceUrl: "https://www.canada.ca/en/health-canada/services/canada-health-care-system.html",
    costItems: [
      "basicAnnual",
      "privateHealthInsuranceMonthly",
      "prescriptionAnnual",
      "dentalAnnual",
      "visionAnnual",
      "longTermCareAnnual",
      "otherOutOfPocketAnnual",
    ],
    getAnnualTotal(healthcare) {
      const h = healthcare || {};
      const n = (v) => Number(v) || 0;
      return n(h.basicAnnual)
        + n(h.privateHealthInsuranceMonthly) * 12
        + n(h.prescriptionAnnual)
        + n(h.dentalAnnual)
        + n(h.visionAnnual)
        + n(h.longTermCareAnnual)
        + n(h.otherOutOfPocketAnnual);
    },
    notImplemented: [
      "州・準州ごとの医療保険料（British Columbia の MSP など）の自動計算",
      "処方薬・歯科・視力の公的補助（州により制度が大きく異なるため、金額は利用者入力）",
      "長期介護（Long-term care）の州別自己負担額",
    ],
  },

  tax: {
    implemented: true,
    model: "canadaFederalIncomeTax",
    effectiveTaxYear: "2026",
    lastUpdated: "2026-07-18",
    sourceName: "Canada Revenue Agency (CRA) — Federal tax rates and income brackets",
    sourceUrl: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/tax-rates-brackets/current-year.html",
    sourceUrls: {
      brackets: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/tax-rates-brackets/current-year.html",
      bpa: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/frequently-asked-questions-individuals/basic-personal-amount.html",
      capitalGains: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/personal-income/line-12700-capital-gains.html",
    },
    // 【重要】連邦税のみ実装。州・準州（13地域）はそれぞれ独自の税率・バンド・控除を持つため未実装。
    region: "Federal only (provincial / territorial tax not included)",
    province: { implemented: false, brackets: null, rates: null, basicPersonalAmount: null },

    // 2026課税年度の連邦税バンド（最低税率は2025年7月に15%→14%へ引下げ済み）
    incomeTax: {
      bands: [
        { upTo: 58523, rate: 0.14 },
        { upTo: 117045, rate: 0.205 },
        { upTo: 181440, rate: 0.26 },
        { upTo: 258482, rate: 0.29 },
        { upTo: Infinity, rate: 0.33 },
      ],
      // Basic Personal Amount（基礎控除）。「所得控除」ではなく「最低税率で計算される税額控除」。
      // 高所得者は逓減し、最上位バンドで下限額になる。
      basicPersonalAmount: 16452,
      basicPersonalAmountMinimum: 14829,
      bpaTaperStart: 181440,
      bpaTaperEnd: 258482,
      bpaCreditRate: 0.14, // BPAは最低税率で税額控除される
    },
    // 譲渡益の課税所得算入率（2026年時点で50%）
    capitalGains: { inclusionRate: 0.50 },
    // TFSA内の運用益・引出しは完全非課税
    tfsaTaxFree: true,
    // RRSPは拠出時に所得控除、引出し時に全額が課税所得
    rrspModel: "deductOnContributionTaxOnWithdrawal",

    // BPA（高所得で逓減）
    getBasicPersonalAmount(income) {
      const it = this.incomeTax;
      const g = Number(income) || 0;
      if (g <= it.bpaTaperStart) return it.basicPersonalAmount;
      if (g >= it.bpaTaperEnd) return it.basicPersonalAmountMinimum;
      const range = it.bpaTaperEnd - it.bpaTaperStart;
      const reduction = (it.basicPersonalAmount - it.basicPersonalAmountMinimum) * ((g - it.bpaTaperStart) / range);
      return it.basicPersonalAmount - reduction;
    },
    // 連邦所得税（BPAの税額控除適用後）
    calculateFederalTax(taxableIncome) {
      const it = this.incomeTax;
      const income = Math.max(0, Number(taxableIncome) || 0);
      let grossTax = 0;
      let lower = 0;
      for (const b of it.bands) {
        if (income > lower) {
          grossTax += (Math.min(income, b.upTo) - lower) * b.rate;
          lower = b.upTo;
        } else break;
      }
      const bpa = this.getBasicPersonalAmount(income);
      const bpaCredit = bpa * it.bpaCreditRate;
      return {
        taxableIncome: income,
        grossTax,
        basicPersonalAmount: bpa,
        bpaCredit,
        tax: Math.max(0, grossTax - bpaCredit),
      };
    },
    getMarginalRate(income) {
      const it = this.incomeTax;
      const g = Math.max(0, Number(income) || 0);
      for (const b of it.bands) {
        if (g <= b.upTo) return b.rate;
      }
      return it.bands[it.bands.length - 1].rate;
    },
    // 譲渡益課税：利益の50%が課税所得に算入され、限界税率で課税される
    calculateCapitalGainsTax(gain, otherIncome) {
      const g = Math.max(0, Number(gain) || 0);
      if (g <= 0) return 0;
      const taxableGain = g * this.capitalGains.inclusionRate;
      const base = this.calculateFederalTax(otherIncome).tax;
      const withGain = this.calculateFederalTax((Number(otherIncome) || 0) + taxableGain).tax;
      return Math.max(0, withGain - base);
    },
    // RRSP拠出による所得税の軽減額。拠出は所得控除なので、課税所得そのものが減る。
    calculateRrspTaxSaving(contribution, income, rrspRoom) {
      const cap = (rrspRoom === undefined || rrspRoom === null) ? Infinity : Math.max(0, Number(rrspRoom) || 0);
      const c = Math.min(Math.max(0, Number(contribution) || 0), cap);
      if (c <= 0) return 0;
      const g = Math.max(0, Number(income) || 0);
      const base = this.calculateFederalTax(g).tax;
      const reduced = this.calculateFederalTax(Math.max(0, g - c)).tax;
      return Math.max(0, base - reduced);
    },
    notImplemented: [
      "州・準州の所得税（13地域すべてで税率・バンド・控除が異なる）",
      "オンタリオ州などのサータックス（surtax）",
      "ケベック州の連邦税減額（Quebec abatement 16.5%）",
      "配当税額控除（eligible / non-eligible dividend tax credit）",
      "CPP拠出金・EI保険料（所得税とは別の天引き）",
      "Alternative Minimum Tax（AMT）",
      "年金所得の分割（pension income splitting）",
    ],
  },

  labels: {
    // カナダ版は投資・年金・医療費・税制のすべてを実装済みのため、未実装の注記は使用しない。
    // ただしiDeCoセクション（JP専用）内の税制表示だけはカナダ向けの案内文へ差し替える。
    investmentNote: null,
    retirementNote: null,
    healthcareNote: null,
    taxNote: "caTaxHandledInInvestmentNote",
  },
  defaults: {},
};
