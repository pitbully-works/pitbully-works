// ============================================================================
// countryRules/AU.js
// App.jsx から国別ルール定義（AU_COUNTRY_RULES）をそのまま切り出したファイル。
// 数値・関数・コメントは一切変更していない（挙動・計算結果は完全に同一）。
// ============================================================================

// ---------- countryRules/AU.js 相当（オーストラリア版：実装済み） ----------
// country: AU
// lastUpdated: 2026-07-13
// source: ato.gov.au（税制・Superannuation）／ servicesaustralia.gov.au（Age Pension）
// 対象年度：2026-27会計年度（2026年7月1日〜2027年6月30日）。
//   ※オーストラリアの会計年度は7月1日開始。2026年7月13日現在、2026-27年度が進行中。
//   ※Age Pensionの給付額は毎年3月20日・9月20日に物価連動で改定される（本データは2026年3月20日改定値）。
// 制度上限・税率はすべて AU_COUNTRY_RULES 内に集約し、画面や共通計算関数へ直接書かない。
// 各セクションは effectiveTaxYear / lastUpdated / sourceName / sourceUrl を持つ。
// 【重要】このオブジェクトは JP / US / GB / CA のルールを一切参照せず、逆に参照もされない。
export const AU_COUNTRY_RULES = {
  investment: {
    implemented: true,
    effectiveTaxYear: "2026-27",
    lastUpdated: "2026-07-13",
    sourceName: "Australian Taxation Office (ATO) — Key superannuation rates and thresholds",
    sourceUrl: "https://www.ato.gov.au/tax-rates-and-codes/key-superannuation-rates-and-thresholds",
    sourceUrls: {
      contributionsCaps: "https://www.ato.gov.au/tax-rates-and-codes/key-superannuation-rates-and-thresholds/contributions-caps",
      paymentsFromSuper: "https://www.ato.gov.au/tax-rates-and-codes/key-superannuation-rates-and-thresholds/payments-from-super",
      superGuarantee: "https://www.ato.gov.au/businesses-and-organisations/super-for-employers/paying-super-contributions/how-much-super-to-pay",
      preservationAge: "https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/withdrawing-and-using-your-super",
    },
    // オーストラリア版で別々に管理・計算する口座
    accountTypes: ["superannuation", "investmentAccount", "cashSavings"],
    taxAdvantagedAccounts: ["superannuation"],
    limits: {
      // 2026年7月1日からの拠出上限（前年度は $30,000 / $120,000）
      concessionalCap: 32500,        // 税引前拠出（SG＋給与犠牲＋個人控除拠出の合計）
      nonConcessionalCap: 130000,    // 税引後拠出
      // 3年分の前倒し拠出（bring-forward）。総残高により利用可否が変わる。
      bringForwardMax: 390000,
      // Superannuation Guarantee（雇用主の義務拠出率）。2025年7月1日に12%へ到達し、以降据置。
      superGuaranteeRate: 0.12,
      // SG算定の対象となる四半期あたり収入の上限（年額換算・2026-27）
      maximumContributionBase: 270830,
      // Transfer Balance Cap：退職フェーズ（非課税）へ移せる上限（2026年7月1日から）
      transferBalanceCap: 2100000,
      // 繰越拠出（carry-forward）が使える総残高の上限
      carryForwardBalanceThreshold: 500000,
    },
    // Preservation age：Superにアクセスできる最低年齢。1964年7月1日以降生まれは60歳。
    // 60歳＋「条件を満たす退職」で引き出し可能。65歳になれば就労状況に関わらず無条件で引き出せる。
    preservationAge: 60,
    unrestrictedAccessAge: 65,
    // Account-based pension の年齢別「最低取崩し率」（ATO公表テーブル）
    minimumDrawdownFactors: {
      under65: 0.04,
      "65to74": 0.05,
      "75to79": 0.06,
      "80to84": 0.07,
      "85to89": 0.09,
      "90to94": 0.11,
      "95plus": 0.14,
    },

    // ---------- 計算関数（すべて純関数） ----------
    _num(v) { return Number(v) || 0; },
    getConcessionalCap() { return this.limits.concessionalCap; },
    getNonConcessionalCap() { return this.limits.nonConcessionalCap; },
    getSuperGuaranteeRate() { return this.limits.superGuaranteeRate; },
    // 雇用主のSG拠出額。SG算定の対象収入には上限（maximum contribution base）がある。
    getEmployerSgContribution(annualSalary) {
      const l = this.limits;
      const base = Math.min(this._num(annualSalary), l.maximumContributionBase);
      return base * l.superGuaranteeRate;
    },
    // 税引前拠出の合計（雇用主SG ＋ 本人の給与犠牲・個人控除拠出）
    getTotalConcessional(annualSalary, voluntaryConcessional) {
      return this.getEmployerSgContribution(annualSalary) + this._num(voluntaryConcessional);
    },
    getConcessionalRemaining(annualSalary, voluntaryConcessional) {
      return this.limits.concessionalCap - this.getTotalConcessional(annualSalary, voluntaryConcessional);
    },
    getNonConcessionalRemaining(nonConcessionalContribution) {
      return this.limits.nonConcessionalCap - this._num(nonConcessionalContribution);
    },
    // Superへアクセスできるか（60歳以上。65歳で無条件）
    canAccessSuper(age) {
      return (Number(age) || 0) >= this.preservationAge;
    },
    // 年齢別の最低取崩し率（Account-based pension）
    getMinimumDrawdownFactor(age) {
      const a = Number(age) || 0;
      const f = this.minimumDrawdownFactors;
      if (a < 65) return f.under65;
      if (a < 75) return f["65to74"];
      if (a < 80) return f["75to79"];
      if (a < 85) return f["80to84"];
      if (a < 90) return f["85to89"];
      if (a < 95) return f["90to94"];
      return f["95plus"];
    },
    getMinimumDrawdown(age, superBalance) {
      return (Number(superBalance) || 0) * this.getMinimumDrawdownFactor(age);
    },

    // 3口座の残高を、現在の年齢から死亡想定年齢まで年単位で積み上げる。
    // Superの特殊な扱い：
    //   ・税引前拠出は「拠出時に15%課税」されてから口座へ入る
    //   ・積立期（accumulation phase）の運用益には15%課税 → 実効利回りが下がる
    //   ・退職フェーズ（preservation age以降かつ退職後）では運用益が非課税
    //   ・退職後は年齢別の最低取崩し率に従って引き出す義務がある
    // 取崩し順：Investment Account → Cash Savings → Superannuation
    //           （Superは preservation age に達するまで取り崩せない）
    simulateGrowth({
      currentAge, retireAge, deathAge, accounts, annualWithdrawalNeeded,
      annualSalary, voluntaryConcessional, contributionsTaxRate, earningsTaxAccumulation,
    }) {
      const keys = this.accountTypes;
      const contribTax = (contributionsTaxRate === undefined || contributionsTaxRate === null) ? 0.15 : Number(contributionsTaxRate);
      const earnTax = (earningsTaxAccumulation === undefined || earningsTaxAccumulation === null) ? 0.15 : Number(earningsTaxAccumulation);

      const balances = {}, contributions = {}, rates = {}, endAges = {};
      keys.forEach((k) => {
        const a = accounts[k] || {};
        balances[k] = Number(a.currentValue) || 0;
        contributions[k] = Number(a.annualContribution) || 0;
        rates[k] = (Number(a.expectedReturnPct) || 0) / 100;
        endAges[k] = Number(a.contributionEndAge) || 0;
      });
      // Superへの税引前拠出（SG＋任意拠出）は、上限を超えた分も含めて15%課税後に口座へ入る。
      const concessionalGross = this.getTotalConcessional(annualSalary, voluntaryConcessional);
      const concessionalNet = concessionalGross * (1 - contribTax);

      const withdrawalOrder = ["investmentAccount", "cashSavings", "superannuation"];
      const totalOf = (b) => keys.reduce((s, k) => s + b[k], 0);
      const startAge = Math.round(currentAge);
      const endAge = Math.round(deathAge);
      const yearly = [{ age: startAge, value: totalOf(balances), accounts: { ...balances }, minimumDrawdown: 0 }];

      for (let age = startAge + 1; age <= endAge; age++) {
        // 退職フェーズか（preservation age以降かつ退職後）。運用益が非課税になる。
        const inRetirementPhase = age > retireAge && this.canAccessSuper(age);

        keys.forEach((k) => {
          let r = rates[k];
          // Superの積立期は運用益に15%課税されるため、実効利回りが下がる
          if (k === "superannuation" && !inRetirementPhase) r = r * (1 - earnTax);
          balances[k] = balances[k] * (1 + r);
        });

        // 積立（Superは税引前拠出が15%課税後に入る＋任意の税引後拠出）
        keys.forEach((k) => {
          if (age > endAges[k]) return;
          if (k === "superannuation") {
            balances[k] += concessionalNet + contributions[k]; // contributions[k] は税引後拠出（non-concessional）
          } else {
            balances[k] += contributions[k];
          }
        });

        // 退職フェーズでの最低取崩し（引き出した額は投資口座へ移し、生活費に充てられる状態にする）
        let minimumDrawdown = 0;
        if (inRetirementPhase && balances.superannuation > 0) {
          minimumDrawdown = Math.min(
            balances.superannuation,
            this.getMinimumDrawdown(age, balances.superannuation)
          );
          balances.superannuation -= minimumDrawdown;
          balances.investmentAccount += minimumDrawdown;
        }

        if (age > retireAge) {
          let remaining = Number(annualWithdrawalNeeded) || 0;
          for (const key of withdrawalOrder) {
            if (remaining <= 0) break;
            if (key === "superannuation" && !this.canAccessSuper(age)) continue;
            const take = Math.min(balances[key], remaining);
            balances[key] -= take;
            remaining -= take;
          }
        }
        yearly.push({ age, value: totalOf(balances), accounts: { ...balances }, minimumDrawdown });
      }
      return { yearly, finalValue: totalOf(balances), finalAccounts: { ...balances } };
    },

    // 資産区分。
    // ・Liquid / Accessible：Investment Account・Cash Savings（＋preservation age以降のSuper）
    // ・Restricted：Superannuation（preservation age未満は一切引き出せない）
    // ・Tax-Advantaged：Superannuation（上2区分と重なる横断的な内訳）
    // 総資産（total）は3口座の単純合計であり、Liquid + Restricted と必ず一致する。
    splitAssets(age, accounts) {
      const v = {};
      this.accountTypes.forEach((k) => { v[k] = Number((accounts[k] || {}).currentValue) || 0; });
      const accessible = this.canAccessSuper(age);
      const liquidBase = v.investmentAccount + v.cashSavings;
      const liquid = liquidBase + (accessible ? v.superannuation : 0);
      const restricted = accessible ? 0 : v.superannuation;
      return {
        liquid, restricted,
        taxAdvantaged: v.superannuation,
        total: liquidBase + v.superannuation,
        isAccessibleAge: accessible,
        accounts: v,
      };
    },
    notImplemented: [
      "繰越拠出（carry-forward）：総残高$500,000未満なら過去5年分の未使用枠を繰り越せる",
      "3年分の前倒し拠出（bring-forward）の可否判定",
      "Transfer Balance Capを超えた分の課税（超過分は積立フェーズに留まり15%課税）",
      "Downsizer contribution（自宅売却時の最大$300,000拠出）",
      "政府のco-contribution（低・中所得者への最大$500の上乗せ）",
      "残高$3M超の運用益への追加課税（Division 296）",
    ],
  },

  retirement: {
    implemented: true,
    effectiveTaxYear: "2026-27",
    lastUpdated: "2026-07-13",
    sourceName: "Services Australia — Age Pension（給付額は2026年3月20日改定値、資産・所得基準は2026年7月1日改定値）",
    sourceUrl: "https://www.servicesaustralia.gov.au/age-pension",
    sourceUrls: {
      howMuch: "https://www.servicesaustralia.gov.au/how-much-age-pension-you-can-get",
      incomeTest: "https://www.servicesaustralia.gov.au/income-test-for-age-pension",
      assetsTest: "https://www.servicesaustralia.gov.au/assets-test-for-age-pension",
      eligibility: "https://www.servicesaustralia.gov.au/who-can-get-age-pension",
    },
    accountTypes: ["agePension"],
    agePension: {
      // 受給資格年齢（引き上げは2023年7月に完了し、67歳で確定）
      qualifyingAge: 67,
      fortnightsPerYear: 26,
      // 最大給付額（2026年3月20日〜9月19日。年金補助・エネルギー補助を含む）
      maxFortnightlySingle: 1200.90,
      maxFortnightlyCoupleEach: 905.20,
      // 所得テスト：無影響枠を超えた分、1ドルにつき50セント減額
      incomeFreeAreaFortnightlySingle: 226,
      incomeFreeAreaFortnightlyCoupleCombined: 396,
      incomeTaperPerDollar: 0.50,
      // 資産テスト：無影響枠を超えた1,000ドルごとに、隔週3ドル減額
      assetsFreeAreaSingleHomeowner: 333000,
      assetsFreeAreaSingleNonHomeowner: 600000,
      assetsFreeAreaCoupleHomeowner: 499000,
      assetsFreeAreaCoupleNonHomeowner: 766000,
      assetsTaperPerThousandFortnightly: 3,
      // Work Bonus：就労収入のうち、所得テストから除外される年額
      workBonusAnnual: 11800,
    },

    getQualifyingAge() { return this.agePension.qualifyingAge; },
    // 最大給付額（年額）
    getMaxAnnual(status) {
      const p = this.agePension;
      const fortnightly = status === "couple" ? p.maxFortnightlyCoupleEach : p.maxFortnightlySingle;
      return fortnightly * p.fortnightsPerYear;
    },
    // 資産テストの無影響枠
    getAssetsFreeArea(status, homeowner) {
      const p = this.agePension;
      if (status === "couple") {
        return homeowner ? p.assetsFreeAreaCoupleHomeowner : p.assetsFreeAreaCoupleNonHomeowner;
      }
      return homeowner ? p.assetsFreeAreaSingleHomeowner : p.assetsFreeAreaSingleNonHomeowner;
    },
    // 所得テストの無影響枠（年額）
    getIncomeFreeAreaAnnual(status) {
      const p = this.agePension;
      const fortnightly = status === "couple"
        ? p.incomeFreeAreaFortnightlyCoupleCombined
        : p.incomeFreeAreaFortnightlySingle;
      return fortnightly * p.fortnightsPerYear;
    },
    // 所得テストによる給付額（年額）。就労収入はWork Bonus分が除外される。
    getAgePensionByIncomeTest(annualIncome, status) {
      const p = this.agePension;
      const max = this.getMaxAnnual(status);
      const excess = Math.max(0, (Number(annualIncome) || 0) - this.getIncomeFreeAreaAnnual(status));
      return Math.max(0, max - excess * p.incomeTaperPerDollar);
    },
    // 資産テストによる給付額（年額）
    getAgePensionByAssetsTest(assessableAssets, status, homeowner) {
      const p = this.agePension;
      const max = this.getMaxAnnual(status);
      const excess = Math.max(0, (Number(assessableAssets) || 0) - this.getAssetsFreeArea(status, homeowner));
      const reductionPerYear = (excess / 1000) * p.assetsTaperPerThousandFortnightly * p.fortnightsPerYear;
      return Math.max(0, max - reductionPerYear);
    },
    // 実際の給付額 ＝ 所得テストと資産テストの「低い方」。受給資格年齢未満はゼロ。
    getAgePension({ age, annualIncome, assessableAssets, status, homeowner }) {
      if ((Number(age) || 0) < this.agePension.qualifyingAge) return 0;
      const byIncome = this.getAgePensionByIncomeTest(annualIncome, status);
      const byAssets = this.getAgePensionByAssetsTest(assessableAssets, status, homeowner);
      return Math.min(byIncome, byAssets);
    },
    notImplemented: [
      "Deeming（金融資産のみなし収入）— 実際の運用益ではなく、みなし利率で所得を算定する制度",
      "Work Bonusの income bank（未使用分の繰越）",
      "Rent Assistance（賃貸住宅手当）",
      "Transitional rate pension（2009年以前からの受給者への経過措置）",
      "Commonwealth Seniors Health Card",
    ],
  },

  healthcare: {
    implemented: true,
    // Medicare（公的医療保険）でカバーされることを前提に、
    // 自己負担が生じうる費目のみ年間費用を入力する簡易モデル。
    model: "selfInputAnnualCostsWithMedicare",
    effectiveTaxYear: "2026-27",
    lastUpdated: "2026-07-13",
    sourceName: "Services Australia — Medicare",
    sourceUrl: "https://www.servicesaustralia.gov.au/medicare",
    costItems: [
      "gapAnnual",
      "privateHealthInsuranceMonthly",
      "pharmaceuticalAnnual",
      "dentalAnnual",
      "opticalAnnual",
      "agedCareAnnual",
      "otherOutOfPocketAnnual",
    ],
    getAnnualTotal(healthcare) {
      const h = healthcare || {};
      const n = (v) => Number(v) || 0;
      return n(h.gapAnnual)
        + n(h.privateHealthInsuranceMonthly) * 12
        + n(h.pharmaceuticalAnnual)
        + n(h.dentalAnnual)
        + n(h.opticalAnnual)
        + n(h.agedCareAnnual)
        + n(h.otherOutOfPocketAnnual);
    },
    notImplemented: [
      "Medicare Levy Surcharge（民間医療保険未加入の高所得者への1〜1.5%の追加課税）",
      "PBS Safety Net（薬剤費の自己負担上限）",
      "Medicare Safety Net（診療費の自己負担上限）",
      "Aged care（高齢者介護）の資力調査に基づく自己負担額",
    ],
  },

  tax: {
    implemented: true,
    model: "australiaIncomeTaxPlusMedicareLevy",
    effectiveTaxYear: "2026-27",
    lastUpdated: "2026-07-13",
    sourceName: "Australian Taxation Office (ATO) — Tax rates for Australian residents",
    sourceUrl: "https://www.ato.gov.au/tax-rates-and-codes/tax-rates-australian-residents",
    sourceUrls: {
      incomeTax: "https://www.ato.gov.au/tax-rates-and-codes/tax-rates-australian-residents",
      medicareLevy: "https://www.ato.gov.au/individuals-and-families/medicare-and-private-health-insurance/medicare-levy",
      capitalGains: "https://www.ato.gov.au/individuals-and-families/investments-and-assets/capital-gains-tax",
      div293: "https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/growing-your-super/how-to-save-more-in-your-super/division-293-tax",
    },
    region: "Australian residents (foreign residents not implemented)",
    // 2026-27年度の税率。第2バンドは2026年7月1日に16%→15%へ引下げ済み。
    // （さらに2027年7月1日から14%へ引下げが法制化されているが、本年度は未適用）
    incomeTax: {
      taxFreeThreshold: 18200,
      bands: [
        { upTo: 18200, rate: 0.00 },
        { upTo: 45000, rate: 0.15 },
        { upTo: 135000, rate: 0.30 },
        { upTo: 190000, rate: 0.37 },
        { upTo: Infinity, rate: 0.45 },
      ],
      scheduledSecondBandRateFrom2027: 0.14, // 2027年7月1日から。本年度は未適用。
    },
    medicareLevy: { rate: 0.02 },
    // Superannuationの税制
    superannuation: {
      contributionsTaxRate: 0.15,           // 税引前拠出への課税
      earningsTaxAccumulation: 0.15,        // 積立期の運用益への課税
      earningsTaxRetirementPhase: 0.00,     // 退職フェーズの運用益（Transfer Balance Capの範囲内）
      withdrawalTaxAfter60: 0.00,           // 60歳以降の引き出しは非課税（課税済みファンドの場合）
      div293Threshold: 250000,              // 所得＋拠出額がこの額を超えると
      div293AdditionalRate: 0.15,           //   税引前拠出に追加15%（合計30%）
      lowRateCap: 260000,                   // 60歳未満の一時金の低税率枠（2026年7月1日から）
    },
    // 譲渡益：12か月超保有した資産は50%割引
    capitalGains: { discountRate: 0.50, minimumHoldingMonths: 12 },

    // 所得税（Medicare levyを除く）
    calculateIncomeTax(taxableIncome) {
      const income = Math.max(0, Number(taxableIncome) || 0);
      let tax = 0;
      let lower = 0;
      for (const b of this.incomeTax.bands) {
        if (income > lower) {
          tax += (Math.min(income, b.upTo) - lower) * b.rate;
          lower = b.upTo;
        } else break;
      }
      return tax;
    },
    // Medicare levy（2%）。低所得者の減免は未実装。
    calculateMedicareLevy(taxableIncome) {
      return Math.max(0, Number(taxableIncome) || 0) * this.medicareLevy.rate;
    },
    // 所得税＋Medicare levy の合計
    calculateTotalTax(taxableIncome) {
      const incomeTax = this.calculateIncomeTax(taxableIncome);
      const medicareLevy = this.calculateMedicareLevy(taxableIncome);
      return { incomeTax, medicareLevy, total: incomeTax + medicareLevy };
    },
    getMarginalRate(taxableIncome) {
      const income = Math.max(0, Number(taxableIncome) || 0);
      for (const b of this.incomeTax.bands) {
        if (income <= b.upTo) return b.rate;
      }
      return this.incomeTax.bands[this.incomeTax.bands.length - 1].rate;
    },
    // Medicare levyを含む実効限界税率
    getMarginalRateWithLevy(taxableIncome) {
      return this.getMarginalRate(taxableIncome) + this.medicareLevy.rate;
    },
    // 税引前拠出への課税。所得＋拠出額が$250,000を超えるとDivision 293で追加15%。
    calculateSuperContributionTax(concessionalContribution, taxableIncome) {
      const s = this.superannuation;
      const c = Math.max(0, Number(concessionalContribution) || 0);
      const income = Math.max(0, Number(taxableIncome) || 0);
      const baseTax = c * s.contributionsTaxRate;
      const div293Applies = (income + c) > s.div293Threshold;
      const div293Tax = div293Applies ? c * s.div293AdditionalRate : 0;
      return {
        baseTax,
        div293Tax,
        total: baseTax + div293Tax,
        effectiveRate: c > 0 ? (baseTax + div293Tax) / c : 0,
        div293Applies,
      };
    },
    // 給与犠牲による節税額 ＝ 拠出額 ×（限界税率＋Medicare levy − 拠出課税の実効税率）
    calculateSalarySacrificeSaving(concessionalContribution, taxableIncome) {
      const c = Math.max(0, Number(concessionalContribution) || 0);
      if (c <= 0) return 0;
      const income = Math.max(0, Number(taxableIncome) || 0);
      // 拠出前の税額 − 拠出後（課税所得が減る）の税額
      const before = this.calculateTotalTax(income).total;
      const after = this.calculateTotalTax(Math.max(0, income - c)).total;
      const personalTaxSaved = before - after;
      const superTax = this.calculateSuperContributionTax(c, Math.max(0, income - c)).total;
      return Math.max(0, personalTaxSaved - superTax);
    },
    // 譲渡益課税：12か月超保有なら利益の50%が課税所得に算入され、限界税率＋levyで課税される
    calculateCapitalGainsTax(gain, otherIncome, heldOver12Months) {
      const g = Math.max(0, Number(gain) || 0);
      if (g <= 0) return 0;
      const discount = (heldOver12Months === false) ? 0 : this.capitalGains.discountRate;
      const taxableGain = g * (1 - discount);
      const base = this.calculateTotalTax(otherIncome).total;
      const withGain = this.calculateTotalTax((Number(otherIncome) || 0) + taxableGain).total;
      return Math.max(0, withGain - base);
    },
    notImplemented: [
      "Low Income Tax Offset（LITO・最大$700）",
      "Seniors and Pensioners Tax Offset（SAPTO・最大$2,230）",
      "Medicare levyの低所得者減免",
      "Medicare Levy Surcharge（民間医療保険未加入の高所得者）",
      "HECS-HELP（学生ローン）の返済",
      "非居住者（foreign resident）の税率",
      "60歳未満のSuper引き出しへの課税（low rate capは保持）",
    ],
  },

  labels: {
    investmentNote: null,
    retirementNote: null,
    healthcareNote: null,
    taxNote: "auTaxHandledInInvestmentNote",
  },
  defaults: {},
};
