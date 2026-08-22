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
  meta: {
    verifiedAsOf: "2026-08-22",
    effectivePeriod: "2026 calendar year / OAS Jul-Sep 2026",
    updateCycle: "毎年1月＋OASは1/4/7/10月",
    noteJa: "2026年制度を2026年8月22日に確認。OASは2026年7〜9月四半期の公表値を基準にしています。",
    noteEn: "2026 rules verified on 22 Aug 2026. OAS uses the July-September 2026 quarterly figures.",
    coverage: [
      { key: "investment", labelJa: "投資制度", labelEn: "Investment", status: "implemented", effective: "2026 calendar year", lastUpdated: "2026-08-17", updateJa: "TFSA、RRSP、非登録口座、RRIF、FHSAに加え、RESPの2026 CESG・生涯拠出上限・CLB基準、RDSPの生涯拠出上限・2026 Grant/Bond基準を反映。", updateEn: "TFSA, RRSP, non-registered accounts, RRIF and FHSA are modelled, together with 2026 RESP CESG/lifetime limits/CLB thresholds and RDSP lifetime contribution/grant/bond rules." },
      { key: "retirement", labelJa: "年金・退職口座", labelEn: "Pension / retirement", status: "partial", effective: "2026 / OAS & GIS Jul-Sep", lastUpdated: "2026-08-22", updateJa: "CPPに加え、ケベック州QPPの受給開始年齢60〜72歳・65歳満額・65歳後0.7%/月増額・早期0.5〜0.6%/月減額の選択計算を実装。OAS・回収税・GIS/Allowance上限・CPP PRBも反映。", updateEn: "Adds QPP claim-age modelling (60–72, full at 65, +0.7%/month after 65 and configurable 0.5–0.6%/month early reduction) alongside CPP, OAS recovery tax, GIS/Allowance maxima and CPP PRB." },
      { key: "healthcare", labelJa: "医療", labelEn: "Healthcare", status: "partial", effective: "2026", lastUpdated: "2026-08-21", updateJa: "州・準州の公的医療保険を前提に自己負担を計算し、CDCPの所得別自己負担率とオンタリオ州の2026年長期介護ホーム最大自己負担額を自動計算。その他の州・準州の薬剤・視力・介護費は手入力。", updateEn: "Models out-of-pocket costs under provincial/territorial coverage, the income-based CDCP co-payment and Ontario 2026 long-term-care home maximum co-payments; drug, vision and long-term-care charges outside Ontario remain manual." },
      { key: "tax", labelJa: "税金", labelEn: "Tax", status: "partial", effective: "2026 tax year", lastUpdated: "2026-08-22", updateJa: "連邦所得税に加え、全10州・3準州の所得税、Quebec abatement、CPP/QPP・EI・QPIPを反映。2026年のCPP自営業者拠出と、適格年金所得の最大50%分割の計画用上限判定も実装。連邦のeligible / non-eligible dividend gross-upと配当税額控除を実装。AMT等は未実装。", updateEn: "Federal income tax plus all 10 provinces and 3 territories, the Quebec abatement, CPP/QPP, EI and QPIP are modelled. Also includes 2026 self-employed CPP contributions and a planning cap for splitting up to 50% of eligible pension income; federal eligible/non-eligible dividend gross-up and dividend tax credits are modelled; AMT remains unimplemented." },
      { key: "estate", labelJa: "相続", labelEn: "Estate", status: "implemented", effective: "2026", lastUpdated: "2026-08-22", updateJa: "死亡直前の時価によるみなし譲渡、配偶者・コモンローへの税繰延ロールオーバー、主たる住居の除外を使った概算を実装。", updateEn: "Adds an estimate for deemed disposition at fair market value immediately before death, spouse/common-law rollover, and principal-residence exclusion." },
    ],
  },
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
      fhsa: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/first-home-savings-account/contributing-your-fhsa.html",
      resp: "https://www.canada.ca/en/services/benefits/education/education-savings/estimating-amounts.html",
      respContributions: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/registered-education-savings-plans-resps/resp-contributions.html",
      rdsp: "https://www.canada.ca/en/employment-social-development/programs/disability/savings/how-much.html",
      rdspLimits: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/registered-disability-savings-plan-rdsp/rdsp-limits-transfers-rollovers.html",
    },
    // カナダ版で別々に管理・計算する口座
    accountTypes: ["tfsa", "rrsp", "nonRegistered", "cashSavings"],
    taxAdvantagedAccounts: ["tfsa", "rrsp"],
    limits: {
      // TFSA：2026年の年間拠出上限（2024・2025年と同額）
      tfsaAnnualLimit: 7000,
      // 2009年から毎年資格があり、一度も拠出していない人に限る「理論上の累計額」。
      // 個人の利用可能枠としては使わない（実際のroomは未使用枠＋前年引出し等で人ごとに異なる）。
      tfsaMaximumPossibleIfEligibleSince2009: 109000,
      // RRSP：前年の稼得所得の18% と 年間上限額 の低い方
      rrspAnnualDollarLimit: 33810,
      rrspIncomePercent: 0.18,
      // FHSA：初年度のparticipation room C$8,000、未使用枠の繰越は最大C$8,000、生涯上限C$40,000。
      fhsaAnnualLimit: 8000,
      fhsaCarryforwardMax: 8000,
      fhsaLifetimeLimit: 40000,
    },
    resp: {
      lifetimeContributionLimit: 50000,
      cesgBasicRate: 0.20,
      cesgBasicContributionCap: 2500,
      cesgAnnualBasicMax: 500,
      cesgAnnualCarryForwardMax: 1000,
      cesgLifetimeMax: 7200,
      cesgAdditionalFirstContribution: 500,
      cesgAdditionalLowIncomeRate: 0.20,
      cesgAdditionalMiddleIncomeRate: 0.10,
      cesg2026LowIncomeMax: 58523,
      cesg2026MiddleIncomeMax: 117045,
      cesgLastEligibleAge: 17,
      clb2026BenefitYearIncomeMax1To3Children: 58523,
    },
    rdsp: {
      lifetimeContributionLimit: 200000,
      contributionLastAge: 59,
      grantLastAge: 49,
      grant2026EnhancedIncomeMax: 117045,
      grantEnhancedFirstContribution: 500,
      grantEnhancedFirstRate: 3,
      grantEnhancedNextContribution: 1000,
      grantEnhancedNextRate: 2,
      grantStandardContributionCap: 1000,
      grantStandardRate: 1,
      grantAnnualMax: 3500,
      grantLifetimeMax: 70000,
      bond2026FullIncomeMax: 38237,
      bond2026PhaseOutIncomeMax: 58523,
      bondAnnualMax: 1000,
      bondLifetimeMax: 20000,
    },
    rrspWithdrawalWithholding: {
      residentRates: [
        { upTo: 5000, rate: 0.10, quebecFederalRate: 0.05 },
        { upTo: 15000, rate: 0.20, quebecFederalRate: 0.10 },
        { upTo: Infinity, rate: 0.30, quebecFederalRate: 0.15 },
      ],
      nonResidentDefaultRate: 0.25,
    },
    getRrspWithdrawalWithholdingRate(amount, { isQuebec = false, isNonResident = false } = {}) {
      if (isNonResident) return this.rrspWithdrawalWithholding.nonResidentDefaultRate;
      const a = Math.max(0, Number(amount) || 0);
      const band = this.rrspWithdrawalWithholding.residentRates.find((b) => a <= b.upTo)
        || this.rrspWithdrawalWithholding.residentRates[this.rrspWithdrawalWithholding.residentRates.length - 1];
      return isQuebec ? band.quebecFederalRate : band.rate;
    },
    estimateRrspWithdrawalWithholding(amount, options = {}) {
      const a = Math.max(0, Number(amount) || 0);
      return a * this.getRrspWithdrawalWithholdingRate(a, options);
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
    // TFSAの当年利用可能枠。利用者が自分の記録から計算した年初時点の利用可能枠を
    // 入力した場合はそれを最優先。未入力時はCRA式
    // 「当年ドル上限 + 前年末未使用枠 + 前年引出し額」で年初枠を概算する。
    // 当年中の引出しは翌年1月1日まで枠を復活させないため、ここには加えない。
    getTfsaContributionRoom({ officialTfsaRoom = 0, priorUnusedTfsaRoom = 0, priorYearTfsaWithdrawals = 0 } = {}) {
      const official = this._num(officialTfsaRoom);
      if (official > 0) return official;
      return this.limits.tfsaAnnualLimit
        + Math.max(0, this._num(priorUnusedTfsaRoom))
        + Math.max(0, this._num(priorYearTfsaWithdrawals));
    },
    getTfsaRemaining(accounts = {}) {
      return this.getTfsaContributionRoom(accounts) - this._num((accounts.tfsa || {}).annualContribution);
    },
    // RRSP deduction limit。最新Notice of Assessment / Reassessmentの値があればそれを最優先。
    // 未入力時だけCRA式（未使用枠 + min(前年稼得所得18%, 年間上限) - PA + PAR - net PSPA）で概算する。
    getRrspRoom(priorEarnedIncome, adjustments = {}) {
      const official = this._num(adjustments.rrspDeductionLimitFromNoa);
      if (official > 0) return official;
      const l = this.limits;
      const newRoom = Math.min(this._num(priorEarnedIncome) * l.rrspIncomePercent, l.rrspAnnualDollarLimit);
      const unused = this._num(adjustments.unusedRrspDeductionRoom);
      const pa = this._num(adjustments.pensionAdjustment);
      const par = this._num(adjustments.pensionAdjustmentReversal);
      const pspa = this._num(adjustments.netPastServicePensionAdjustment);
      return Math.max(0, unused + newRoom - pa + par - pspa);
    },
    getRrspRemaining(accounts, priorEarnedIncome) {
      return this.getRrspRoom(priorEarnedIncome, accounts) - this._num((accounts.rrsp || {}).annualContribution);
    },
    // FHSA participation room の簡易計算。CRAの個別通知値があればそれを最優先し、
    // 未入力時は「C$8,000 + 前年未使用枠（最大C$8,000）」と生涯残枠の小さい方で概算する。
    // re-participation room / excess FHSA amount がある複雑なケースは officialParticipationRoom を入力する。
    getFhsaParticipationRoom({ officialParticipationRoom = 0, priorUnusedRoom = 0, lifetimeContributionsAndTransfers = 0 } = {}) {
      const official = this._num(officialParticipationRoom);
      if (official > 0) return official;
      const carry = Math.min(this.limits.fhsaCarryforwardMax, Math.max(0, this._num(priorUnusedRoom)));
      const annualRoom = this.limits.fhsaAnnualLimit + carry;
      const lifetimeRemaining = Math.max(0, this.limits.fhsaLifetimeLimit - Math.max(0, this._num(lifetimeContributionsAndTransfers)));
      return Math.min(annualRoom, lifetimeRemaining);
    },
    getFhsaRemaining({ annualContributionsAndTransfers = 0, ...roomInputs } = {}) {
      return this.getFhsaParticipationRoom(roomInputs) - Math.max(0, this._num(annualContributionsAndTransfers));
    },
    getRespLifetimeRemaining(lifetimeContributions = 0) {
      return Math.max(0, this.resp.lifetimeContributionLimit - Math.max(0, this._num(lifetimeContributions)));
    },
    estimateRespCesg({ annualContribution = 0, adjustedFamilyNetIncome = 0, beneficiaryAge = 0, unusedCesgRoomAvailable = false, lifetimeCesgReceived = 0 } = {}) {
      const r = this.resp;
      const contribution = Math.max(0, this._num(annualContribution));
      const age = Math.floor(this._num(beneficiaryAge));
      if (age > r.cesgLastEligibleAge) return 0;
      const basicCap = unusedCesgRoomAvailable ? 5000 : r.cesgBasicContributionCap;
      const basic = Math.min(contribution, basicCap) * r.cesgBasicRate;
      const income = Math.max(0, this._num(adjustedFamilyNetIncome));
      const first = Math.min(contribution, r.cesgAdditionalFirstContribution);
      const additionalRate = income <= r.cesg2026LowIncomeMax
        ? r.cesgAdditionalLowIncomeRate
        : income <= r.cesg2026MiddleIncomeMax ? r.cesgAdditionalMiddleIncomeRate : 0;
      const additional = first * additionalRate;
      const annualMax = (unusedCesgRoomAvailable ? r.cesgAnnualCarryForwardMax : r.cesgAnnualBasicMax) + additional;
      const lifetimeRemaining = Math.max(0, r.cesgLifetimeMax - Math.max(0, this._num(lifetimeCesgReceived)));
      return Math.min(lifetimeRemaining, annualMax, basic + additional);
    },
    isRespClbIncomeEligible2026(adjustedFamilyIncome = 0, qualifiedChildren = 1) {
      const income = Math.max(0, this._num(adjustedFamilyIncome));
      const children = Math.max(1, Math.floor(this._num(qualifiedChildren)));
      const thresholds = { 1:58523, 2:58523, 3:58523, 4:66036, 5:73577, 6:81117, 7:88658, 8:96198, 9:103739, 10:111279, 11:118820, 12:126360, 13:133901, 14:141442, 15:148982, 16:156523 };
      return income <= thresholds[Math.min(children, 16)];
    },
    getRdspLifetimeRemaining(lifetimeContributions = 0) {
      return Math.max(0, this.rdsp.lifetimeContributionLimit - Math.max(0, this._num(lifetimeContributions)));
    },
    estimateRdspGrant2026({ contribution = 0, adjustedFamilyNetIncome = 0, beneficiaryAge = 0, lifetimeGrantReceived = 0 } = {}) {
      const r = this.rdsp;
      if (Math.floor(this._num(beneficiaryAge)) > r.grantLastAge) return 0;
      const c = Math.max(0, this._num(contribution));
      const income = Math.max(0, this._num(adjustedFamilyNetIncome));
      let grant = 0;
      if (income <= r.grant2026EnhancedIncomeMax) {
        grant += Math.min(c, r.grantEnhancedFirstContribution) * r.grantEnhancedFirstRate;
        grant += Math.min(Math.max(0, c - r.grantEnhancedFirstContribution), r.grantEnhancedNextContribution) * r.grantEnhancedNextRate;
      } else {
        grant = Math.min(c, r.grantStandardContributionCap) * r.grantStandardRate;
      }
      return Math.min(r.grantAnnualMax, Math.max(0, r.grantLifetimeMax - Math.max(0, this._num(lifetimeGrantReceived))), grant);
    },
    estimateRdspBond2026({ adjustedFamilyNetIncome = 0, beneficiaryAge = 0, lifetimeBondReceived = 0 } = {}) {
      const r = this.rdsp;
      if (Math.floor(this._num(beneficiaryAge)) > r.grantLastAge) return 0;
      const income = Math.max(0, this._num(adjustedFamilyNetIncome));
      let bond = 0;
      if (income <= r.bond2026FullIncomeMax) bond = r.bondAnnualMax;
      else if (income < r.bond2026PhaseOutIncomeMax) {
        bond = r.bondAnnualMax * (r.bond2026PhaseOutIncomeMax - income) / (r.bond2026PhaseOutIncomeMax - r.bond2026FullIncomeMax);
      }
      return Math.min(Math.max(0, r.bondLifetimeMax - Math.max(0, this._num(lifetimeBondReceived))), Math.max(0, bond));
    },

    // RRIFの年齢別最低取崩し率。95歳以上は一律20%。
    getRrifMinimumFactor(age) {
      const a = Math.floor(Number(age) || 0);
      if (a >= 95) return this.rrifMinimumFactorAt95Plus;
      return this.rrifMinimumFactors[a] || 0;
    },
    getRrifMinimumAge(ownerAge, useSpouseAge = false, spouseAge = 0) {
      const owner = Math.floor(Number(ownerAge) || 0);
      const spouse = Math.floor(Number(spouseAge) || 0);
      return useSpouseAge && spouse > 0 ? spouse : owner;
    },
    getRrifMinimumWithdrawal(age, rrspBalance, useSpouseAge = false, spouseAge = 0) {
      const factorAge = this.getRrifMinimumAge(age, useSpouseAge, spouseAge);
      return (Number(rrspBalance) || 0) * this.getRrifMinimumFactor(factorAge);
    },

    // 4口座の残高を、現在の年齢から死亡想定年齢まで年単位で積み上げる。
    // 口座ごとに「現在額・年間積立額・想定利回り・積立終了年齢」を個別に持つ。
    // 取崩し順：Cash Savings → Non-Registered → TFSA → RRSP
    // （utils/simulations.js の ACCOUNT_DRAW_CATEGORY.CA = cash → taxable → taxFree →
    //   restricted と完全に一致させること。ここが食い違うと、パネルのプレビューと
    //   lifePlanEngine の本計算で取崩し順が変わり、結果が一致しなくなる）
    // ただし rrifFirstWithdrawalAge 以降は、RRSPからの最低取崩し額が強制的に発生する。
    simulateGrowth({ currentAge, retireAge, deathAge, accounts, annualWithdrawalNeeded, rrifUseSpouseAge = false, rrifSpouseAge = 0 }) {
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
          rrifMinimum = Math.min(balances.rrsp, this.getRrifMinimumWithdrawal(age, balances.rrsp, rrifUseSpouseAge, rrifSpouseAge));
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
      "FHSAのre-participation room・excess amount等の複雑な個別調整。RESP/RDSPは基本枠・2026年連邦Grant/Bond基準まで実装済みで、州独自助成・過年度carry-forwardの完全再構成・返還ルール等は未実装",
      "RRSP/RRIFの一括・超過引出し源泉徴収率（10/20/30%、Quebec連邦分5/10/15%、非居住者25%既定）はルール計算を実装済み。実際の最終所得税・租税条約・Quebec州税は別途",
    ],
  },

  retirement: {
    implemented: true,
    effectiveTaxYear: "2026",
    lastUpdated: "2026-08-22",
    sourceName: "Service Canada / ESDC — Canada Pension Plan, Old Age Security",
    sourceUrl: "https://www.canada.ca/en/services/benefits/publicpensions.html",
    sourceUrls: {
      cpp: "https://www.canada.ca/en/services/benefits/publicpensions/cpp.html",
      cppAmounts: "https://www.canada.ca/en/services/benefits/publicpensions/cpp/cpp-benefit/amount.html",
      oas: "https://www.canada.ca/en/services/benefits/publicpensions/cpp/old-age-security.html",
      oasRecoveryTax: "https://www.canada.ca/en/services/benefits/publicpensions/cpp/old-age-security/recovery-tax.html",
      gisAmounts: "https://www.canada.ca/en/employment-social-development/programs/pensions/pension/statistics/2026-quarterly-july-september.html",
      cppPostRetirementBenefit: "https://www.canada.ca/en/services/benefits/publicpensions/cpp/cpp-post-retirement/benefit-amount.html",
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
    qpp: {
      // Retraite Québec 2026：65歳時点の最大月額はC$1,507.65。
      // 60歳から受給可、72歳まで繰下げ可。65歳後は1か月0.7%増（72歳で+58.8%）。
      // 65歳前の減額率は本人の年金額等により0.5〜0.6%/月なので、
      // アプリでは利用者がこの範囲内で率を選べるようにする。
      maxMonthlyAt65: 1507.65,
      standardAge: 65,
      earliestAge: 60,
      latestAge: 72,
      earlyReductionPerMonthMin: 0.005,
      earlyReductionPerMonthMax: 0.006,
      earlyReductionPerMonthDefault: 0.006,
      lateIncreasePerMonth: 0.007,
      sourceUrl: "https://www.retraitequebec.gouv.qc.ca/en/citizens/retirement-planning/applying-your-retirement-pension/retirement-pension-quebec-pension-plan/calculation-your-retirement-pension",
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
      // OAS回収税は「所得年」と「翌年7月〜翌々年6月の支給期間」がずれる。
      // 2025年所得 C$93,454 → 2026-07〜2027-06 の支給に反映。
      // 2026年所得 C$95,323 → 2027-07〜2028-06 の支給に反映。
      recoveryTaxThreshold2025: 93454,
      recoveryTaxThreshold2026: 95323,
      recoveryTaxRate: 0.15,
      // 満額受給には18歳以降40年のカナダ居住が必要（10年で最低受給資格）
      fullResidenceYears: 40,
      minimumResidenceYears: 10,
      minimumResidenceYearsOutsideCanada: 20,
    },


    // GIS / Allowance（2026年7〜9月の公表上限額・所得基準）。
    // 実際のGIS支給額は所得構成、配偶者状況、OAS受給状況などで変わるため、
    // ここでは公表上限と受給可否の目安だけを保持し、正確な給付額の自動算定は行わない。
    gis: {
      effectivePeriod: "2026-07-01/2026-09-30",
      single: { maxMonthly: 1123.17, incomeCutoff: 22800 },
      spouseReceivesOas: { maxMonthly: 676.09, incomeCutoff: 30096 },
      spouseReceivesAllowance: { maxMonthly: 676.09, incomeCutoff: 42144 },
      spouseNoOasOrAllowance: { maxMonthly: 1123.17, incomeCutoff: 54624 },
      allowance: { maxMonthly: 1428.06, incomeCutoff: 42144, minAge: 60, maxAge: 64 },
      allowanceSurvivor: { maxMonthly: 1702.34, incomeCutoff: 30696, minAge: 60, maxAge: 64 },
    },
    getGisRule(status = "single") {
      return this.gis[status] || this.gis.single;
    },
    isGisIncomeEligible(status, annualIncome) {
      const rule = this.getGisRule(status);
      return (Number(annualIncome) || 0) < rule.incomeCutoff;
    },
    // GISの基本資格ゲート。正確な支給額は所得構成ごとの公式表を使う必要があるため別扱いだが、
    // 65歳以上・OAS受給資格・所得基準・スポンサー期間中でないことをここで判定する。
    isGisEligible({ age = 0, status = "single", annualIncome = 0, receivesOas = true, underSponsorshipAgreement = false } = {}) {
      const a = Math.floor(Number(age) || 0);
      if (a < 65 || !receivesOas || underSponsorshipAgreement) return false;
      return this.isGisIncomeEligible(status, annualIncome);
    },
    isAllowanceEligible({ age = 0, combinedAnnualIncome = 0, residenceYears = 0, isCitizenOrLegalResident = true, underSponsorshipAgreement = false } = {}) {
      const r = this.gis.allowance;
      const a = Math.floor(Number(age) || 0);
      const years = Math.max(0, Number(residenceYears) || 0);
      return a >= r.minAge && a <= r.maxAge
        && isCitizenOrLegalResident
        && years >= 10
        && !underSponsorshipAgreement
        && (Number(combinedAnnualIncome) || 0) < r.incomeCutoff;
    },
    isAllowanceSurvivorEligible({ age = 0, annualIncome = 0, residenceYears = 0, isCitizenOrLegalResident = true, spouseOrPartnerDied = true, remarriedOrNewCommonLaw = false, underSponsorshipAgreement = false } = {}) {
      const r = this.gis.allowanceSurvivor;
      const a = Math.floor(Number(age) || 0);
      const years = Math.max(0, Number(residenceYears) || 0);
      return a >= r.minAge && a <= r.maxAge
        && isCitizenOrLegalResident
        && years >= 10
        && spouseOrPartnerDied
        && !remarriedOrNewCommonLaw
        && !underSponsorshipAgreement
        && (Number(annualIncome) || 0) < r.incomeCutoff;
    },

    // CPP Post-Retirement Benefit（PRB）。2026年の65歳時点の最大月額。
    // 実額は受給開始後の拠出実績等によって決まるため、factor で見込み割合を入力する簡易モデル。
    cppPostRetirementBenefit: {
      maxMonthlyAt65: 54.69,
    },
    getCppPostRetirementBenefitAnnual(factor = 1) {
      const f = Math.min(1, Math.max(0, Number(factor) || 0));
      return this.cppPostRetirementBenefit.maxMonthlyAt65 * 12 * f;
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
    getQppMaxAnnualAt65() { return this.qpp.maxMonthlyAt65 * 12; },
    normalizeQppEarlyReductionPerMonth(rate) {
      const q = this.qpp;
      const n = Number(rate);
      if (!Number.isFinite(n)) return q.earlyReductionPerMonthDefault;
      return Math.min(q.earlyReductionPerMonthMax, Math.max(q.earlyReductionPerMonthMin, n));
    },
    getQppFactor(startAge, earlyReductionPerMonth = this.qpp.earlyReductionPerMonthDefault) {
      const q = this.qpp;
      const a = Math.min(Math.max(Number(startAge) || q.standardAge, q.earliestAge), q.latestAge);
      const months = (a - q.standardAge) * 12;
      if (months < 0) {
        return 1 + months * this.normalizeQppEarlyReductionPerMonth(earlyReductionPerMonth);
      }
      return 1 + months * q.lateIncreasePerMonth;
    },
    getQppAnnualBenefit(estimatedAnnualAt65, startAge, earlyReductionPerMonth = this.qpp.earlyReductionPerMonthDefault) {
      return (Number(estimatedAnnualAt65) || 0) * this.getQppFactor(startAge, earlyReductionPerMonth);
    },
    getPublicContributoryPensionAnnual({
      plan = "CPP",
      estimatedAnnualAt65 = 0,
      startAge = 65,
      qppEarlyReductionPerMonth,
    } = {}) {
      return String(plan || "CPP").toUpperCase() === "QPP"
        ? this.getQppAnnualBenefit(estimatedAnnualAt65, startAge, qppEarlyReductionPerMonth)
        : this.getCppAnnualBenefit(estimatedAnnualAt65, startAge);
    },
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
    // OASの最低居住年数。申請時にカナダ国内に居住する場合は18歳以降10年、
    // 国外居住の場合は原則20年。社会保障協定で資格要件を満たす場合でも、
    // 支給額の按分は実際にカナダに居住した年数を40で割って計算する。
    getOasMinimumResidenceYears({ livingOutsideCanada = false } = {}) {
      const o = this.oas;
      return livingOutsideCanada ? o.minimumResidenceYearsOutsideCanada : o.minimumResidenceYears;
    },
    isOasResidenceEligible(residenceYears, { livingOutsideCanada = false, qualifiesViaSocialSecurityAgreement = false } = {}) {
      if (qualifiesViaSocialSecurityAgreement) return true;
      const y = Math.max(0, Number(residenceYears) || 0);
      return y >= this.getOasMinimumResidenceYears({ livingOutsideCanada });
    },
    // 居住年数による按分（40年で満額）。国外居住の20年要件も区別する。
    // 社会保障協定は「資格」を補えるが、年金額そのものの分子には国外期間を足さない。
    getOasResidenceFraction(residenceYears, options = {}) {
      const o = this.oas;
      const y = Math.max(0, Number(residenceYears) || 0);
      if (!this.isOasResidenceEligible(y, options)) return 0;
      return Math.min(1, y / o.fullResidenceYears);
    },
    // クローバック前のOAS年額
    getOasAnnualBeforeClawback(age, startAge, residenceYears, options = {}) {
      return this.getOasMaxAnnual(age)
        * this.getOasFactor(startAge)
        * this.getOasResidenceFraction(residenceYears, options);
    },
    // 支給月に対応する前年所得のクローバック閾値を返す。
    // 未指定時は制度基準日（2026-08-17）が属する 2026-07〜2027-06 を使う。
    getOasRecoveryThreshold(paymentDate = "2026-08-17") {
      const o = this.oas;
      const d = new Date(`${paymentDate}T00:00:00`);
      if (!Number.isFinite(d.getTime())) return o.recoveryTaxThreshold2025;
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      if (y > 2027 || (y === 2027 && m >= 7)) return o.recoveryTaxThreshold2026;
      return o.recoveryTaxThreshold2025;
    },
    // OAS回収税（クローバック）：純所得が該当支給期間の閾値を超えた分の15%を、OAS年額を上限として回収する。
    getOasClawback(netIncome, oasAnnualBeforeClawback, paymentDate = "2026-08-17") {
      const o = this.oas;
      const threshold = this.getOasRecoveryThreshold(paymentDate);
      const excess = Math.max(0, (Number(netIncome) || 0) - threshold);
      return Math.min(Math.max(0, Number(oasAnnualBeforeClawback) || 0), excess * o.recoveryTaxRate);
    },
    getOasAnnualAfterClawback(netIncome, oasAnnualBeforeClawback, paymentDate = "2026-08-17") {
      const before = Math.max(0, Number(oasAnnualBeforeClawback) || 0);
      return before - this.getOasClawback(netIncome, before, paymentDate);
    },
    notImplemented: [
      "GIS/Allowanceの正確な支給額（基本資格ゲート・公表上限額・所得基準までは対応。所得構成別の公式支給額表による完全算定は未実装）",
      "QPPは受給開始年齢による増減計算まで実装済み。実際の拠出履歴から65歳時点見込額を自動算定する機能は未実装（Retraite Québecの見込額を入力）",
      "CPP拠出履歴からの受給見込額の自動算出（利用者が見込額を入力する方式）",
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
    model: "provincialCoveragePlusCdcp",
    effectiveTaxYear: "2026",
    lastUpdated: "2026-08-21",
    sourceName: "Health Canada / Service Canada — Canada Health Act and Canadian Dental Care Plan",
    sourceUrl: "https://www.canada.ca/en/health-canada/services/canada-health-care-system.html",
    sourceUrls: {
      healthSystem: "https://www.canada.ca/en/health-canada/services/canada-health-care-system.html",
      publicCoverage: "https://www.canada.ca/en/health-canada/services/health-care-system/canada-health-care-system-medicare/canada-health-act/how-publicly-funded-coverage-works.html",
      cdcpEligibility: "https://www.canada.ca/en/services/benefits/dental/dental-care-plan/qualify.html",
      longTermCareCanada: "https://www.canada.ca/en/health-canada/services/health-services-benefits/home-community-long-term-care.html",
      ontarioLongTermCareRates: "https://www.ontario.ca/page/paying-long-term-care",
    },
    provinces: [
      "AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT",
    ],
    provinceNames: {
      AB: "Alberta", BC: "British Columbia", MB: "Manitoba", NB: "New Brunswick",
      NL: "Newfoundland and Labrador", NS: "Nova Scotia", NT: "Northwest Territories",
      NU: "Nunavut", ON: "Ontario", PE: "Prince Edward Island", QC: "Quebec",
      SK: "Saskatchewan", YT: "Yukon",
    },
    canadaHealthAct: {
      physicianEquivalentPolicyEffective: "2026-04-01",
      coreInsuredServices: ["medically necessary hospital", "physician", "certain surgical-dental"],
    },
    cdcp: {
      incomeLimitExclusive: 90000,
      fullCoverageIncomeExclusive: 70000,
      fortyPercentCopayIncomeExclusive: 80000,
      copayRates: { under70000: 0, from70000To79999: 0.40, from80000To89999: 0.60 },
    },
    // 長期介護は州・準州の責任で制度・自己負担が大きく異なる。
    // 2026年8月時点では、公式に2026-07-01の最大自己負担額を確認できるオンタリオ州のみ自動計算する。
    // その他12地域は誤った全国一律額を置かず、従来どおり利用者の見込額を手入力する。
    longTermCare: {
      model: "provincialResidentialCare",
      nationalResponsibility: "province-territory",
      automaticRegions: ["ON"],
      ontario: {
        effectiveFrom: "2026-07-01",
        currency: "CAD",
        longStay: {
          basic: { daily: 70.00, monthly: 2129.17 },
          semiPrivate: { daily: 84.40, monthly: 2567.17 },
          private: { daily: 100.01, monthly: 3041.97 },
        },
        shortStay: { daily: 45.31 },
        basicRateReductionAvailable: true,
      },
    },
    getCdcpEligibility(healthcare) {
      const h = healthcare || {};
      const income = Math.max(0, Number(h.adjustedFamilyNetIncome) || 0);
      const eligible = !h.hasPrivateDentalCoverage && h.taxReturnFiled !== false && h.canadianResident !== false && income < this.cdcp.incomeLimitExclusive;
      let copayRate = null;
      if (eligible) {
        if (income < this.cdcp.fullCoverageIncomeExclusive) copayRate = this.cdcp.copayRates.under70000;
        else if (income < this.cdcp.fortyPercentCopayIncomeExclusive) copayRate = this.cdcp.copayRates.from70000To79999;
        else copayRate = this.cdcp.copayRates.from80000To89999;
      }
      return { eligible, copayRate, adjustedFamilyNetIncome: income };
    },
    getCdcpDentalOutOfPocket(healthcare) {
      const h = healthcare || {};
      const eligibleFees = Math.max(0, Number(h.cdcpEligibleFeesAnnual) || 0);
      const e = this.getCdcpEligibility(h);
      if (!e.eligible || e.copayRate === null) return eligibleFees;
      return eligibleFees * e.copayRate;
    },
    getAnnualDentalCost(healthcare) {
      const h = healthcare || {};
      if ((h.dentalMode || "manual") === "cdcp") return this.getCdcpDentalOutOfPocket(h);
      return Math.max(0, Number(h.dentalAnnual) || 0);
    },
    getLongTermCareOutOfPocket(healthcare) {
      const h = healthcare || {};
      const province = h.province || "ON";
      const mode = h.longTermCareMode || "manual";
      if (province === "ON" && mode === "ontario2026") {
        const accommodation = ["basic", "semiPrivate", "private"].includes(h.longTermCareAccommodation)
          ? h.longTermCareAccommodation : "basic";
        const months = Math.min(12, Math.max(0, Number(h.longTermCareMonths) || 0));
        return this.longTermCare.ontario.longStay[accommodation].monthly * months;
      }
      return Math.max(0, Number(h.longTermCareAnnual) || 0);
    },
    getAnnualTotal(healthcare) {
      const h = healthcare || {};
      const n = (v) => Number(v) || 0;
      return n(h.basicAnnual)
        + n(h.privateHealthInsuranceMonthly) * 12
        + n(h.prescriptionAnnual)
        + this.getAnnualDentalCost(h)
        + n(h.visionAnnual)
        + this.getLongTermCareOutOfPocket(h)
        + n(h.otherOutOfPocketAnnual);
    },
    notImplemented: [
      "州・準州ごとの処方薬プランの自己負担額の自動計算",
      "州・準州ごとの視力補助の自動計算",
      "オンタリオ州以外の長期介護（Long-term care）の州・準州別自己負担額の自動計算",
      "CDCP fee scheduleを超える歯科医院独自料金や、対象外サービスの追加負担",
    ],
  },

  tax: {
    implemented: true,
    model: "canadaFederalIncomeTax",
    effectiveTaxYear: "2026",
    lastUpdated: "2026-08-22",
    sourceName: "Canada Revenue Agency (CRA) / ESDC — 2026 income tax, CPP/QPP and EI rates",
    sourceUrl: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/tax-rates-brackets/current-year.html",
    sourceUrls: {
      brackets: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/tax-rates-brackets/current-year.html",
      ontario: "https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4032-payroll-deductions-tables/t4032on-jan/t4032on-january-general-information.html",
      bpa: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/frequently-asked-questions-individuals/basic-personal-amount.html",
      capitalGains: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/personal-income/line-12700-capital-gains.html",
      payroll: "https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4127-payroll-deductions-formulas/t4127-jan/t4127-jan-payroll-deductions-formulas-computer-programs.html",
      cppSelfEmployed: "https://www.canada.ca/en/employment-social-development/programs/pensions/pension/statistics/2026-quarterly-july-september.html",
      pensionIncomeSplitting: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/pension-income-splitting.html",
      federalDividendTaxCredit: "https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/t4015/t5-guide-return-investment-income.html",
      ei: "https://www.canada.ca/en/employment-social-development/programs/ei/ei-list/ei-employers/premium-reduction-program/2026-maximum-insurable-earnings.html",
      qpip: "https://www.revenuquebec.ca/en/businesses/source-deductions-and-employer-contributions/calculating-source-deductions-and-contributions/qpip-premiums/maximum-insurable-earnings-and-premium-rate/",
      quebecIncomeTax: "https://www.revenuquebec.ca/en/citizens/income-tax-return/completing-your-income-tax-return/income-tax-rates/",
      quebecAbatement: "https://www.canada.ca/en/department-finance/programs/federal-transfers/quebec-abatement.html",
      britishColumbiaTax: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/tax-rates-brackets/current-year.html",
      britishColumbiaBudget2026: "https://www.bcbudget.gov.bc.ca/2026/pdf/2026_Budget_and_Fiscal_Plan.pdf",
      albertaTax: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/tax-rates-brackets/current-year.html",
      albertaTaxCredits: "https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4032-payroll-deductions-tables/t4032ab-jan/t4032ab-january-general-information.html",
      manitobaTax: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/tax-rates-brackets/current-year.html",
      manitobaTaxCredits: "https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4032-payroll-deductions-tables/t4032mb-jan/t4032mb-january-general-information.html",
      saskatchewanTax: "https://www.saskatchewan.ca/residents/taxes-and-investments/personal-income-tax/personal-income-tax-structure",
      saskatchewanTaxCredits: "https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4032-payroll-deductions-tables/t4032sk-jan/t4032sk-january-general-information.html",
      novaScotiaTax: "https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4032-payroll-deductions-tables/t4032ns-jan/t4032ns-january-general-information.html",
      newBrunswickTax: "https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4032-payroll-deductions-tables/t4032nb-jan.html",
      princeEdwardIslandTax: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/tax-rates-brackets/current-year.html",
      newfoundlandLabradorTax: "https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4032-payroll-deductions-tables/t4032nl-july/t4032nl-july-general-information.html",
      northwestTerritoriesTax: "https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4032-payroll-deductions-tables/t4032nt-jan/t4032nt-january-general-information.html",
      nunavutTax: "https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4032-payroll-deductions-tables/t4032nu-jan/t4032nu-january-general-information.html",
      yukonTax: "https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4032-payroll-deductions-tables/t4032yt-jan/t4032yt-january-general-information.html",
    },
    // 2026-08-22時点：Ontario / Quebec / British Columbia / Alberta / Manitoba / Saskatchewan / Nova Scotia / New Brunswick / Prince Edward Island / Newfoundland and Labrador / Northwest Territories / Nunavut / Yukon を自動計算。
    region: "Federal + Ontario + Quebec + British Columbia + Alberta + Manitoba + Saskatchewan + Nova Scotia + New Brunswick + Prince Edward Island + Newfoundland and Labrador + Northwest Territories + Nunavut + Yukon",
    province: {
      implemented: true,
      implementedRegions: ["ON", "QC", "BC", "AB", "MB", "SK", "NS", "NB", "PE", "NL", "NT", "NU", "YT"],
      defaultRegion: "ON",
      ontario: {
        bands: [
          { upTo: 53891, rate: 0.0505 },
          { upTo: 107785, rate: 0.0915 },
          { upTo: 150000, rate: 0.1116 },
          { upTo: 220000, rate: 0.1216 },
          { upTo: Infinity, rate: 0.1316 },
        ],
        basicPersonalAmount: 12989,
        basicCreditRate: 0.0505,
        surtaxThreshold1: 5818,
        surtaxRate1: 0.20,
        surtaxThreshold2: 7446,
        surtaxRate2: 0.36,
        taxReductionBasicAmount: 300,
      },
      quebec: {
        bands: [
          { upTo: 54345, rate: 0.14 },
          { upTo: 108680, rate: 0.19 },
          { upTo: 132245, rate: 0.24 },
          { upTo: Infinity, rate: 0.2575 },
        ],
        basicPersonalAmount: 18952,
        basicCreditRate: 0.14,
        federalAbatementRate: 0.165,
      },
      britishColumbia: {
        // 2026 return-year brackets. Budget 2026 raised the first rate to 5.60%.
        bands: [
          { upTo: 50363, rate: 0.056 },
          { upTo: 100728, rate: 0.077 },
          { upTo: 115648, rate: 0.105 },
          { upTo: 140430, rate: 0.1229 },
          { upTo: 190405, rate: 0.147 },
          { upTo: 265545, rate: 0.168 },
          { upTo: Infinity, rate: 0.205 },
        ],
        basicPersonalAmount: 13216,
        basicCreditRate: 0.056,
        taxReductionMax: 690,
        taxReductionThreshold: 25570,
        taxReductionPhaseoutRate: 0.0356,
      },
      alberta: {
        bands: [
          { upTo: 61200, rate: 0.08 },
          { upTo: 154259, rate: 0.10 },
          { upTo: 185111, rate: 0.12 },
          { upTo: 246813, rate: 0.13 },
          { upTo: 370220, rate: 0.14 },
          { upTo: Infinity, rate: 0.15 },
        ],
        basicPersonalAmount: 22769,
        basicCreditRate: 0.08,
      },
      manitoba: {
        bands: [
          { upTo: 47564, rate: 0.108 },
          { upTo: 101200, rate: 0.1275 },
          { upTo: Infinity, rate: 0.174 },
        ],
        basicPersonalAmount: 15780,
        basicCreditRate: 0.108,
      },
      saskatchewan: {
        bands: [
          { upTo: 54532, rate: 0.105 },
          { upTo: 155805, rate: 0.125 },
          { upTo: Infinity, rate: 0.145 },
        ],
        basicPersonalAmount: 20381,
        basicCreditRate: 0.105,
      },
      novaScotia: {
        bands: [
          { upTo: 30995, rate: 0.0879 },
          { upTo: 61991, rate: 0.1495 },
          { upTo: 97417, rate: 0.1667 },
          { upTo: 157124, rate: 0.175 },
          { upTo: Infinity, rate: 0.21 },
        ],
        basicPersonalAmount: 11932,
        basicCreditRate: 0.0879,
      },
      newBrunswick: {
        bands: [
          { upTo: 52333, rate: 0.094 },
          { upTo: 104666, rate: 0.14 },
          { upTo: 193861, rate: 0.16 },
          { upTo: Infinity, rate: 0.195 },
        ],
        basicPersonalAmount: 13664,
        basicCreditRate: 0.094,
      },
      princeEdwardIsland: {
        bands: [
          { upTo: 33928, rate: 0.095 },
          { upTo: 65820, rate: 0.1347 },
          { upTo: 106890, rate: 0.166 },
          { upTo: 142520, rate: 0.1762 },
          { upTo: 200000, rate: 0.19 },
          { upTo: Infinity, rate: 0.20 },
        ],
        basicPersonalAmount: 15000,
        basicCreditRate: 0.095,
      },
      newfoundlandLabrador: {
        bands: [
          { upTo: 44678, rate: 0.087 },
          { upTo: 89354, rate: 0.145 },
          { upTo: 159528, rate: 0.158 },
          { upTo: 223340, rate: 0.178 },
          { upTo: 285319, rate: 0.198 },
          { upTo: 570638, rate: 0.208 },
          { upTo: 1141275, rate: 0.213 },
          { upTo: Infinity, rate: 0.218 },
        ],
        basicPersonalAmount: 13094,
        basicCreditRate: 0.087,
      },
      northwestTerritories: {
        bands: [
          { upTo: 53003, rate: 0.059 },
          { upTo: 106009, rate: 0.086 },
          { upTo: 172346, rate: 0.122 },
          { upTo: Infinity, rate: 0.1405 },
        ],
        basicPersonalAmount: 18198,
        basicCreditRate: 0.059,
      },
      nunavut: {
        bands: [
          { upTo: 55801, rate: 0.04 },
          { upTo: 111602, rate: 0.07 },
          { upTo: 181439, rate: 0.09 },
          { upTo: Infinity, rate: 0.115 },
        ],
        basicPersonalAmount: 19659,
        basicCreditRate: 0.04,
      },
      yukon: {
        bands: [
          { upTo: 58523, rate: 0.064 },
          { upTo: 117045, rate: 0.09 },
          { upTo: 181440, rate: 0.109 },
          { upTo: 500000, rate: 0.128 },
          { upTo: Infinity, rate: 0.15 },
        ],
        basicPersonalAmount: 16452,
        basicPersonalAmountMinimum: 14829,
        bpaTaperStart: 181440,
        bpaTaperEnd: 258482,
        basicCreditRate: 0.064,
      },
    },

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
    // 2026 employee payroll deductions.
    // CPP/QPP: YBE C$3,500, YMPE C$74,600, YAMPE C$85,000.
    // CPP employee rate 5.95% to YMPE, CPP2/QPP2 4% from YMPE to YAMPE.
    // QPP employee rate is 6.30% to YMPE.
    // EI: max insurable earnings C$68,900; 1.63% outside Quebec / 1.30% in Quebec.
    payrollDeductions: {
      year: 2026,
      ybe: 3500,
      ympe: 74600,
      yampe: 85000,
      cppRate: 0.0595,
      qppRate: 0.0630,
      secondAdditionalRate: 0.0400,
      cppSelfEmployedRate: 0.1190,
      cppSelfEmployedSecondAdditionalRate: 0.0800,
      cppSelfEmployedFirstMax: 8460.90,
      cppSelfEmployedSecondMax: 832.00,
      qppSelfEmployedRate: 0.1260,
      qppSelfEmployedSecondAdditionalRate: 0.0800,
      qppSelfEmployedFirstMax: 8961.30,
      qppSelfEmployedSecondMax: 832.00,
      eiMaxInsurableEarnings: 68900,
      eiRate: 0.0163,
      eiQuebecRate: 0.0130,
      qpipMaxInsurableEarnings: 103000,
      qpipEmployeeRate: 0.00430,
      qpipEmployeeMaxPremium: 442.90,
    },
    calculateEmployeePensionContribution(employmentIncome, provinceCode = "ON") {
      const cfg = this.payrollDeductions;
      const income = Math.max(0, Number(employmentIncome) || 0);
      const isQuebec = String(provinceCode || "").toUpperCase() === "QC";
      const firstRate = isQuebec ? cfg.qppRate : cfg.cppRate;
      const firstBand = Math.max(0, Math.min(income, cfg.ympe) - cfg.ybe);
      const secondBand = Math.max(0, Math.min(income, cfg.yampe) - cfg.ympe);
      const first = firstBand * firstRate;
      const second = secondBand * cfg.secondAdditionalRate;
      return {
        plan: isQuebec ? "QPP" : "CPP",
        first,
        second,
        total: first + second,
      };
    },
    // Self-employed CPP (outside Quebec), 2026. Self-employed people pay both the
    // employee and employer shares: 11.90% between the YBE and YMPE, plus 8.00%
    // on earnings between YMPE and YAMPE. Quebec uses QPP rules and is deliberately
    // not approximated by this CPP helper.
    calculateSelfEmployedCppContribution(netBusinessIncome, provinceCode = "ON") {
      const cfg = this.payrollDeductions;
      const income = Math.max(0, Number(netBusinessIncome) || 0);
      const code = String(provinceCode || "ON").toUpperCase();
      if (code === "QC") {
        return { plan: "QPP", supported: false, first: 0, second: 0, total: 0 };
      }
      const firstBand = Math.max(0, Math.min(income, cfg.ympe) - cfg.ybe);
      const secondBand = Math.max(0, Math.min(income, cfg.yampe) - cfg.ympe);
      const first = Math.min(cfg.cppSelfEmployedFirstMax, firstBand * cfg.cppSelfEmployedRate);
      const second = Math.min(cfg.cppSelfEmployedSecondMax, secondBand * cfg.cppSelfEmployedSecondAdditionalRate);
      return { plan: "CPP", supported: true, first, second, total: first + second };
    },

    // Self-employed QPP, 2026. Quebec self-employed workers pay both the
    // employee and employer shares: 12.60% between the YBE and YMPE, plus 8.00%
    // on earnings between YMPE and YAMPE.
    calculateSelfEmployedQppContribution(netBusinessIncome) {
      const cfg = this.payrollDeductions;
      const income = Math.max(0, Number(netBusinessIncome) || 0);
      const firstBand = Math.max(0, Math.min(income, cfg.ympe) - cfg.ybe);
      const secondBand = Math.max(0, Math.min(income, cfg.yampe) - cfg.ympe);
      const first = Math.min(cfg.qppSelfEmployedFirstMax, firstBand * cfg.qppSelfEmployedRate);
      const second = Math.min(cfg.qppSelfEmployedSecondMax, secondBand * cfg.qppSelfEmployedSecondAdditionalRate);
      return { plan: "QPP", supported: true, first, second, total: first + second };
    },

    // Planning helper for CRA pension-income splitting. The election may allocate
    // up to 50% of eligible pension income to a spouse/common-law partner. This
    // helper only enforces the transfer ceiling; eligibility of the income itself
    // must be established by the caller because it depends on income type and age.
    getPensionIncomeSplit({ eligiblePensionIncome = 0, requestedSplit = null } = {}) {
      const eligible = Math.max(0, Number(eligiblePensionIncome) || 0);
      const maximumTransfer = eligible * 0.50;
      const requested = requestedSplit === null || requestedSplit === undefined
        ? maximumTransfer
        : Math.max(0, Number(requestedSplit) || 0);
      const transferred = Math.min(maximumTransfer, requested);
      return {
        eligiblePensionIncome: eligible,
        maximumTransfer,
        transferred,
        pensionerRetains: Math.max(0, eligible - transferred),
      };
    },

    calculateEmployeeEiPremium(employmentIncome, provinceCode = "ON") {
      const cfg = this.payrollDeductions;
      const income = Math.max(0, Number(employmentIncome) || 0);
      const isQuebec = String(provinceCode || "").toUpperCase() === "QC";
      const rate = isQuebec ? cfg.eiQuebecRate : cfg.eiRate;
      return Math.min(income, cfg.eiMaxInsurableEarnings) * rate;
    },
    calculateEmployeeQpipPremium(employmentIncome, provinceCode = "ON") {
      const cfg = this.payrollDeductions;
      const income = Math.max(0, Number(employmentIncome) || 0);
      const isQuebec = String(provinceCode || "").toUpperCase() === "QC";
      if (!isQuebec) return 0;
      return Math.min(
        cfg.qpipEmployeeMaxPremium,
        Math.min(income, cfg.qpipMaxInsurableEarnings) * cfg.qpipEmployeeRate
      );
    },
    calculateEmployeePayrollDeductions(employmentIncome, provinceCode = "ON") {
      const pension = this.calculateEmployeePensionContribution(employmentIncome, provinceCode);
      const ei = this.calculateEmployeeEiPremium(employmentIncome, provinceCode);
      const qpip = this.calculateEmployeeQpipPremium(employmentIncome, provinceCode);
      return {
        employmentIncome: Math.max(0, Number(employmentIncome) || 0),
        provinceCode: String(provinceCode || "ON").toUpperCase(),
        pensionPlan: pension.plan,
        pensionContribution: pension.total,
        pensionFirstContribution: pension.first,
        pensionSecondContribution: pension.second,
        eiPremium: ei,
        qpipPremium: qpip,
        total: pension.total + ei + qpip,
      };
    },

    // TFSA内の運用益・引出しは完全非課税
    tfsaTaxFree: true,
    // RRSPは拠出時に所得控除、引出し時に全額が課税所得
    rrspModel: "deductOnContributionTaxOnWithdrawal",


    calculateOntarioHealthPremium(taxableIncome) {
      const income = Math.max(0, Number(taxableIncome) || 0);
      if (income <= 20000) return 0;
      if (income <= 36000) return Math.min(300, (income - 20000) * 0.06);
      if (income <= 48000) return Math.min(450, 300 + (income - 36000) * 0.06);
      if (income <= 72000) return Math.min(600, 450 + (income - 48000) * 0.25);
      if (income <= 200000) return Math.min(750, 600 + (income - 72000) * 0.25);
      return Math.min(900, 750 + (income - 200000) * 0.25);
    },
    calculateOntarioTax(taxableIncome) {
      const cfg = this.province.ontario;
      const income = Math.max(0, Number(taxableIncome) || 0);
      let grossTax = 0;
      let lower = 0;
      for (const b of cfg.bands) {
        if (income > lower) {
          grossTax += (Math.min(income, b.upTo) - lower) * b.rate;
          lower = b.upTo;
        } else break;
      }
      const basicCredit = cfg.basicPersonalAmount * cfg.basicCreditRate;
      const basicTax = Math.max(0, grossTax - basicCredit);
      const surtax = basicTax <= cfg.surtaxThreshold1 ? 0
        : basicTax <= cfg.surtaxThreshold2
          ? (basicTax - cfg.surtaxThreshold1) * cfg.surtaxRate1
          : (basicTax - cfg.surtaxThreshold1) * cfg.surtaxRate1
            + (basicTax - cfg.surtaxThreshold2) * cfg.surtaxRate2;
      const taxIncludingSurtax = basicTax + surtax;
      const reduction = Math.min(taxIncludingSurtax, Math.max(0, cfg.taxReductionBasicAmount * 2 - taxIncludingSurtax));
      const healthPremium = this.calculateOntarioHealthPremium(income);
      return {
        taxableIncome: income, grossTax, basicPersonalAmount: cfg.basicPersonalAmount, basicCredit,
        basicTax, surtax, taxReduction: reduction, healthPremium,
        tax: Math.max(0, taxIncludingSurtax + healthPremium - reduction),
      };
    },
    calculateQuebecTax(taxableIncome) {
      const cfg = this.province.quebec;
      const income = Math.max(0, Number(taxableIncome) || 0);
      let grossTax = 0;
      let lower = 0;
      for (const b of cfg.bands) {
        if (income > lower) {
          grossTax += (Math.min(income, b.upTo) - lower) * b.rate;
          lower = b.upTo;
        } else break;
      }
      const basicCredit = cfg.basicPersonalAmount * cfg.basicCreditRate;
      return {
        taxableIncome: income,
        grossTax,
        basicPersonalAmount: cfg.basicPersonalAmount,
        basicCredit,
        tax: Math.max(0, grossTax - basicCredit),
      };
    },
    calculateBritishColumbiaTax(taxableIncome) {
      const cfg = this.province.britishColumbia;
      const income = Math.max(0, Number(taxableIncome) || 0);
      let grossTax = 0;
      let lower = 0;
      for (const b of cfg.bands) {
        if (income > lower) {
          grossTax += (Math.min(income, b.upTo) - lower) * b.rate;
          lower = b.upTo;
        } else break;
      }
      const basicCredit = cfg.basicPersonalAmount * cfg.basicCreditRate;
      const basicTax = Math.max(0, grossTax - basicCredit);
      const reduction = Math.min(
        basicTax,
        Math.max(
          0,
          cfg.taxReductionMax
            - Math.max(0, income - cfg.taxReductionThreshold) * cfg.taxReductionPhaseoutRate
        )
      );
      return {
        taxableIncome: income,
        grossTax,
        basicPersonalAmount: cfg.basicPersonalAmount,
        basicCredit,
        taxReduction: reduction,
        tax: Math.max(0, basicTax - reduction),
      };
    },
    calculateAlbertaTax(taxableIncome) {
      const cfg = this.province.alberta;
      const income = Math.max(0, Number(taxableIncome) || 0);
      let grossTax = 0;
      let lower = 0;
      for (const b of cfg.bands) {
        if (income > lower) {
          grossTax += (Math.min(income, b.upTo) - lower) * b.rate;
          lower = b.upTo;
        } else break;
      }
      const basicCredit = cfg.basicPersonalAmount * cfg.basicCreditRate;
      return {
        taxableIncome: income,
        grossTax,
        basicPersonalAmount: cfg.basicPersonalAmount,
        basicCredit,
        tax: Math.max(0, grossTax - basicCredit),
      };
    },
    calculateManitobaTax(taxableIncome) {
      const cfg = this.province.manitoba;
      const income = Math.max(0, Number(taxableIncome) || 0);
      let grossTax = 0;
      let lower = 0;
      for (const b of cfg.bands) {
        if (income > lower) {
          grossTax += (Math.min(income, b.upTo) - lower) * b.rate;
          lower = b.upTo;
        } else break;
      }
      const basicCredit = cfg.basicPersonalAmount * cfg.basicCreditRate;
      return {
        taxableIncome: income,
        grossTax,
        basicPersonalAmount: cfg.basicPersonalAmount,
        basicCredit,
        tax: Math.max(0, grossTax - basicCredit),
      };
    },
    calculateSaskatchewanTax(taxableIncome) {
      const cfg = this.province.saskatchewan;
      const income = Math.max(0, Number(taxableIncome) || 0);
      let grossTax = 0;
      let lower = 0;
      for (const b of cfg.bands) {
        if (income > lower) {
          grossTax += (Math.min(income, b.upTo) - lower) * b.rate;
          lower = b.upTo;
        } else break;
      }
      const basicCredit = cfg.basicPersonalAmount * cfg.basicCreditRate;
      return {
        taxableIncome: income,
        grossTax,
        basicPersonalAmount: cfg.basicPersonalAmount,
        basicCredit,
        tax: Math.max(0, grossTax - basicCredit),
      };
    },
    calculateNovaScotiaTax(taxableIncome) {
      const cfg = this.province.novaScotia;
      const income = Math.max(0, Number(taxableIncome) || 0);
      let grossTax = 0;
      let lower = 0;
      for (const b of cfg.bands) {
        if (income > lower) {
          grossTax += (Math.min(income, b.upTo) - lower) * b.rate;
          lower = b.upTo;
        } else break;
      }
      const basicCredit = cfg.basicPersonalAmount * cfg.basicCreditRate;
      return {
        taxableIncome: income,
        grossTax,
        basicPersonalAmount: cfg.basicPersonalAmount,
        basicCredit,
        tax: Math.max(0, grossTax - basicCredit),
      };
    },
    calculateNewBrunswickTax(taxableIncome) {
      const cfg = this.province.newBrunswick;
      const income = Math.max(0, Number(taxableIncome) || 0);
      let grossTax = 0;
      let lower = 0;
      for (const b of cfg.bands) {
        if (income > lower) {
          grossTax += (Math.min(income, b.upTo) - lower) * b.rate;
          lower = b.upTo;
        } else break;
      }
      const basicCredit = cfg.basicPersonalAmount * cfg.basicCreditRate;
      return {
        taxableIncome: income,
        grossTax,
        basicPersonalAmount: cfg.basicPersonalAmount,
        basicCredit,
        tax: Math.max(0, grossTax - basicCredit),
      };
    },
    calculatePrinceEdwardIslandTax(taxableIncome) {
      const cfg = this.province.princeEdwardIsland;
      const income = Math.max(0, Number(taxableIncome) || 0);
      let grossTax = 0;
      let lower = 0;
      for (const b of cfg.bands) {
        if (income > lower) {
          grossTax += (Math.min(income, b.upTo) - lower) * b.rate;
          lower = b.upTo;
        } else break;
      }
      const basicCredit = cfg.basicPersonalAmount * cfg.basicCreditRate;
      return {
        taxableIncome: income,
        grossTax,
        basicPersonalAmount: cfg.basicPersonalAmount,
        basicCredit,
        tax: Math.max(0, grossTax - basicCredit),
      };
    },
    calculateSimpleProvinceTax(taxableIncome, configKey) {
      const cfg = this.province[configKey];
      const income = Math.max(0, Number(taxableIncome) || 0);
      let grossTax = 0;
      let lower = 0;
      for (const b of cfg.bands) {
        if (income > lower) {
          grossTax += (Math.min(income, b.upTo) - lower) * b.rate;
          lower = b.upTo;
        } else break;
      }
      let basicPersonalAmount = cfg.basicPersonalAmount;
      if (cfg.basicPersonalAmountMinimum != null && income > cfg.bpaTaperStart) {
        if (income >= cfg.bpaTaperEnd) basicPersonalAmount = cfg.basicPersonalAmountMinimum;
        else {
          const ratio = (income - cfg.bpaTaperStart) / (cfg.bpaTaperEnd - cfg.bpaTaperStart);
          basicPersonalAmount = cfg.basicPersonalAmount -
            ratio * (cfg.basicPersonalAmount - cfg.basicPersonalAmountMinimum);
        }
      }
      const basicCredit = basicPersonalAmount * cfg.basicCreditRate;
      return { taxableIncome: income, grossTax, basicPersonalAmount, basicCredit, tax: Math.max(0, grossTax - basicCredit) };
    },
    calculateNewfoundlandLabradorTax(taxableIncome) {
      return this.calculateSimpleProvinceTax(taxableIncome, "newfoundlandLabrador");
    },
    calculateNorthwestTerritoriesTax(taxableIncome) {
      return this.calculateSimpleProvinceTax(taxableIncome, "northwestTerritories");
    },
    calculateNunavutTax(taxableIncome) {
      return this.calculateSimpleProvinceTax(taxableIncome, "nunavut");
    },
    calculateYukonTax(taxableIncome) {
      return this.calculateSimpleProvinceTax(taxableIncome, "yukon");
    },
    calculateProvincialTax(taxableIncome, provinceCode = "ON") {
      const code = String(provinceCode || "ON").toUpperCase();
      if (code === "ON") return this.calculateOntarioTax(taxableIncome);
      if (code === "QC") return this.calculateQuebecTax(taxableIncome);
      if (code === "BC") return this.calculateBritishColumbiaTax(taxableIncome);
      if (code === "AB") return this.calculateAlbertaTax(taxableIncome);
      if (code === "MB") return this.calculateManitobaTax(taxableIncome);
      if (code === "SK") return this.calculateSaskatchewanTax(taxableIncome);
      if (code === "NS") return this.calculateNovaScotiaTax(taxableIncome);
      if (code === "NB") return this.calculateNewBrunswickTax(taxableIncome);
      if (code === "PE") return this.calculatePrinceEdwardIslandTax(taxableIncome);
      if (code === "NL") return this.calculateNewfoundlandLabradorTax(taxableIncome);
      if (code === "NT") return this.calculateNorthwestTerritoriesTax(taxableIncome);
      if (code === "NU") return this.calculateNunavutTax(taxableIncome);
      if (code === "YT") return this.calculateYukonTax(taxableIncome);
      return { taxableIncome: Math.max(0, Number(taxableIncome) || 0), tax: 0, unsupported: true, provinceCode: code };
    },
    calculateProvincialCapitalGainsTax(gain, otherIncome, provinceCode = "ON") {
      const g = Math.max(0, Number(gain) || 0);
      if (g <= 0) return 0;
      const code = String(provinceCode || "ON").toUpperCase();
      if (!["ON", "QC", "BC", "AB", "MB", "SK", "NS", "NB", "PE", "NL", "NT", "NU", "YT"].includes(code)) return 0;
      const taxableGain = g * this.capitalGains.inclusionRate;
      const base = this.calculateProvincialTax(otherIncome, code).tax;
      const withGain = this.calculateProvincialTax((Number(otherIncome) || 0) + taxableGain, code).tax;
      return Math.max(0, withGain - base);
    },
    calculateProvincialRrspTaxSaving(contribution, income, rrspRoom, provinceCode = "ON") {
      const code = String(provinceCode || "ON").toUpperCase();
      if (!["ON", "QC", "BC", "AB", "MB", "SK", "NS", "NB", "PE", "NL", "NT", "NU", "YT"].includes(code)) return 0;
      const cap = (rrspRoom === undefined || rrspRoom === null) ? Infinity : Math.max(0, Number(rrspRoom) || 0);
      const c = Math.min(Math.max(0, Number(contribution) || 0), cap);
      if (c <= 0) return 0;
      const g = Math.max(0, Number(income) || 0);
      return Math.max(0,
        this.calculateProvincialTax(g, code).tax
        - this.calculateProvincialTax(Math.max(0, g - c), code).tax
      );
    },

    // カナダ法人から受け取る課税配当の連邦 gross-up / Dividend Tax Credit (DTC)。
    // Eligible dividend: 現金配当の38%をgross-upし、課税配当額の15.0198%を連邦DTC。
    // Other-than-eligible dividend: 現金配当の15%をgross-upし、課税配当額の9.0301%を連邦DTC。
    // 外国配当は対象外なので、この関数へはカナダ法人の課税配当だけを渡す。
    dividendTaxCredit: {
      eligibleGrossUpRate: 0.38,
      eligibleCreditRateOnTaxableAmount: 0.150198,
      nonEligibleGrossUpRate: 0.15,
      nonEligibleCreditRateOnTaxableAmount: 0.090301,
    },
    calculateFederalDividendTax({ eligibleDividends = 0, nonEligibleDividends = 0, otherTaxableIncome = 0 } = {}) {
      const cfg = this.dividendTaxCredit;
      const eligibleCash = Math.max(0, Number(eligibleDividends) || 0);
      const nonEligibleCash = Math.max(0, Number(nonEligibleDividends) || 0);
      const other = Math.max(0, Number(otherTaxableIncome) || 0);
      const eligibleTaxable = eligibleCash * (1 + cfg.eligibleGrossUpRate);
      const nonEligibleTaxable = nonEligibleCash * (1 + cfg.nonEligibleGrossUpRate);
      const taxableDividends = eligibleTaxable + nonEligibleTaxable;
      const eligibleCredit = eligibleTaxable * cfg.eligibleCreditRateOnTaxableAmount;
      const nonEligibleCredit = nonEligibleTaxable * cfg.nonEligibleCreditRateOnTaxableAmount;
      const federalDividendTaxCredit = eligibleCredit + nonEligibleCredit;
      const baseFederalTax = this.calculateFederalTax(other).tax;
      const federalTaxBeforeDividendCredit = this.calculateFederalTax(other + taxableDividends).tax;
      const netFederalTax = Math.max(0, federalTaxBeforeDividendCredit - federalDividendTaxCredit);
      return {
        eligibleCash,
        nonEligibleCash,
        eligibleTaxable,
        nonEligibleTaxable,
        taxableDividends,
        eligibleCredit,
        nonEligibleCredit,
        federalDividendTaxCredit,
        baseFederalTax,
        federalTaxBeforeDividendCredit,
        netFederalTax,
        incrementalFederalTax: netFederalTax - baseFederalTax,
      };
    },

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
    calculateFederalTaxForProvince(taxableIncome, provinceCode = "ON") {
      const result = this.calculateFederalTax(taxableIncome);
      const code = String(provinceCode || "ON").toUpperCase();
      if (code !== "QC") return { ...result, abatement: 0, abatementRate: 0, taxAfterAbatement: result.tax };
      const rate = this.province.quebec.federalAbatementRate;
      const abatement = result.tax * rate;
      return { ...result, abatement, abatementRate: rate, taxAfterAbatement: Math.max(0, result.tax - abatement) };
    },
    calculateCapitalGainsTaxForProvince(gain, otherIncome, provinceCode = "ON") {
      const g = Math.max(0, Number(gain) || 0);
      if (g <= 0) return 0;
      const taxableGain = g * this.capitalGains.inclusionRate;
      const base = this.calculateFederalTaxForProvince(otherIncome, provinceCode).taxAfterAbatement;
      const withGain = this.calculateFederalTaxForProvince((Number(otherIncome) || 0) + taxableGain, provinceCode).taxAfterAbatement;
      return Math.max(0, withGain - base);
    },
    calculateRrspTaxSavingForProvince(contribution, income, rrspRoom, provinceCode = "ON") {
      const cap = (rrspRoom === undefined || rrspRoom === null) ? Infinity : Math.max(0, Number(rrspRoom) || 0);
      const c = Math.min(Math.max(0, Number(contribution) || 0), cap);
      if (c <= 0) return 0;
      const g = Math.max(0, Number(income) || 0);
      const base = this.calculateFederalTaxForProvince(g, provinceCode).taxAfterAbatement;
      const reduced = this.calculateFederalTaxForProvince(Math.max(0, g - c), provinceCode).taxAfterAbatement;
      return Math.max(0, base - reduced);
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
      "州・準州所得税の追加地域はなし（カナダ10州・3準州を実装済み）",
      "オンタリオ州の扶養家族等を含むTax Reductionの完全計算（基本本人分のみ反映）",
      "CPP/QPP拠出金・EI保険料・Quebec Parental Insurance Plan（QPIP）は2026年の従業員本人分を実装済み。CPPの自営業者拠出（Quebec以外）と自営業QPPは2026年基準で実装済み",
      "Alternative Minimum Tax（AMT）",
      "州・準州の配当税額控除（provincial/territorial dividend tax credit）は未実装。現在の配当計算は連邦gross-up / federal DTCのみ",
      "年金所得分割は最大50%の移転上限を計画用に実装済み。所得種類・年齢ごとのeligible pension income判定と双方の最終申告税額の完全自動最適化は未実装",
    ],
  },

  estate: {
    implemented: true,
    model: "canadaDeemedDispositionEstimate",
    effectiveTaxYear: "2026",
    lastUpdated: "2026-08-22",
    sourceName: "Canada Revenue Agency (CRA) — Taxable capital gains for someone who died",
    sourceUrl: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/life-events/doing-taxes-someone-died/prepare-returns/report-income/capital-gains.html",
    sourceUrls: {
      deemedDisposition: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/life-events/doing-taxes-someone-died/prepare-returns/report-income/capital-gains.html",
      spouseRollover: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/personal-income/line-12700-capital-gains/transfers-capital-property.html",
    },
    capitalGainsInclusionRate: 0.50,
    // Planning estimate for ordinary capital property. It deliberately does not attempt
    // CCA recapture, farm/fishing property, private-company shares, trust elections,
    // or detailed principal-residence year-by-year designation.
    calculateDeemedDisposition({
      fairMarketValue = 0,
      adjustedCostBase = 0,
      transferToSpouseOrCommonLaw = false,
      spouseResidentInCanada = true,
      principalResidenceExempt = false,
      otherTaxableIncome = 0,
      provinceCode = "ON",
    } = {}) {
      const fmv = Math.max(0, Number(fairMarketValue) || 0);
      const acb = Math.max(0, Number(adjustedCostBase) || 0);
      const rollover = !!transferToSpouseOrCommonLaw && !!spouseResidentInCanada;
      const principalResidence = !!principalResidenceExempt;

      if (rollover || principalResidence) {
        return {
          fairMarketValue: fmv,
          adjustedCostBase: acb,
          capitalGain: 0,
          taxableCapitalGain: 0,
          federalTaxEstimate: 0,
          provincialTaxEstimate: 0,
          totalTaxEstimate: 0,
          spouseRolloverApplied: rollover,
          principalResidenceExemptionApplied: principalResidence,
        };
      }

      const capitalGain = Math.max(0, fmv - acb);
      const taxableCapitalGain = capitalGain * this.capitalGainsInclusionRate;
      const otherIncome = Math.max(0, Number(otherTaxableIncome) || 0);
      const code = String(provinceCode || "ON").toUpperCase();

      const federalBefore = CA_COUNTRY_RULES.tax
        .calculateFederalTaxForProvince(otherIncome, code).taxAfterAbatement;
      const federalAfter = CA_COUNTRY_RULES.tax
        .calculateFederalTaxForProvince(otherIncome + taxableCapitalGain, code).taxAfterAbatement;
      const federalTaxEstimate = Math.max(0, federalAfter - federalBefore);

      const provincialBefore = CA_COUNTRY_RULES.tax
        .calculateProvincialTax(otherIncome, code).tax;
      const provincialAfter = CA_COUNTRY_RULES.tax
        .calculateProvincialTax(otherIncome + taxableCapitalGain, code).tax;
      const provincialTaxEstimate = Math.max(0, provincialAfter - provincialBefore);

      return {
        fairMarketValue: fmv,
        adjustedCostBase: acb,
        capitalGain,
        taxableCapitalGain,
        federalTaxEstimate,
        provincialTaxEstimate,
        totalTaxEstimate: federalTaxEstimate + provincialTaxEstimate,
        spouseRolloverApplied: false,
        principalResidenceExemptionApplied: false,
      };
    },
    notImplemented: [
      "CCA recapture・terminal lossの自動計算",
      "qualified farm/fishing property・QSBC shares等の特例",
      "主たる住居の年別designation・1+ルールの完全自動判定",
      "RRSP/RRIF/FHSA等の死亡時課税と受益者別ロールオーバーの完全統合",
      "遺産管理中のT3申告・GRE・国外資産・信託の詳細税務",
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
