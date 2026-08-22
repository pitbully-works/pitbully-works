// ============================================================================
// countryRules/GB.js
// App.jsx から国別ルール定義（GB_COUNTRY_RULES）をそのまま切り出したファイル。
// 数値・関数・コメントは一切変更していない（挙動・計算結果は完全に同一）。
// ============================================================================

// ---------- countryRules/GB.js 相当（英国版：実装済み） ----------
// 対象年度：2026/27（2026年4月6日〜2027年4月5日）。
// 制度上限・税率はすべて GB_COUNTRY_RULES 内に集約し、画面や共通計算関数へ直接書かない。
// 各セクションは effectiveYear / lastUpdated / sourceName / sourceUrl を持つ。
// 根拠が確認できない数値は推測で入れず、未確認・未対応の項目は notImplemented に明示する。
// 【重要】このオブジェクトは JP_COUNTRY_RULES / US_COUNTRY_RULES を一切参照せず、
// 逆に JP/US 側からも参照されない。英国版の変更はこのオブジェクト内で完結する。
export const GB_COUNTRY_RULES = {
  meta: {
    verifiedAsOf: "2026-08-21",
    effectivePeriod: "2026/27 tax year",
    updateCycle: "毎年3〜4月（新税年度前後）＋Budget/Finance Act時",
    noteJa: "2026/27税年度の制度を2026年8月21日に再確認。England / Wales / Northern Irelandに加え、Scottish Income TaxとInheritance Taxの概算計算にも対応しています。",
    noteEn: "2026/27 rules re-verified on 21 Aug 2026. Income tax now covers England, Wales, Northern Ireland and Scottish Income Tax, with an Inheritance Tax estimate model.",
    coverage: [
      { key: "investment", labelJa: "投資制度", labelEn: "Investment", status: "implemented", effective: "2026/27 tax year", lastUpdated: "2026-08-17", updateJa: "ISA・LISA・SIPP・職域年金・GIAに加え、Junior ISAと子ども向けSIPPの2026/27拠出・税控除・年齢制約を反映。予定されるCash ISA変更は将来制度として保持。", updateEn: "ISA, LISA, SIPP, workplace pension and GIA are modelled, together with 2026/27 Junior ISA and child-pension contribution/tax-relief/age rules; the scheduled Cash ISA change is kept as a future rule." },
      { key: "retirement", labelJa: "年金・退職口座", labelEn: "Pension / retirement", status: "implemented", effective: "2026/27 tax year", lastUpdated: "2026-08-17", updateJa: "State Pension・私的年金の受給/繰下げに加え、NI qualifying yearsによる簡易見込額と2026/27 Pension Credit Guarantee Credit概算を反映。公式NI記録を使う完全forecastは未実装。", updateEn: "Models State Pension and private-pension access/deferral, a qualifying-years State Pension estimate and a 2026/27 Pension Credit Guarantee Credit estimate; a full forecast from official NI history is not implemented." },
      { key: "healthcare", labelJa: "医療", labelEn: "Healthcare", status: "partial", effective: "2026/27", lastUpdated: "2026-08-21", updateJa: "地域別処方箋、EnglandのNHS歯科料金、Englandの介護資産判定を追加。その他地域の歯科・介護は利用者入力。", updateEn: "Adds regional prescription rules, NHS dental charges for England and England social-care capital assessment; dental/social-care costs in other nations remain user-entered." },
      { key: "tax", labelJa: "税金", labelEn: "Tax", status: "implemented", effective: "2026/27 tax year", lastUpdated: "2026-08-21", updateJa: "England/Wales/NIの所得税・配当・CGTに加え、2026/27 Scottish Income Taxを反映。", updateEn: "Models England/Wales/NI income tax, dividends and CGT, plus 2026/27 Scottish Income Tax." },
      { key: "estate", labelJa: "相続", labelEn: "Estate", status: "implemented", effective: "2026/27", lastUpdated: "2026-08-21", updateJa: "Inheritance TaxのNRB・RNRB・£2m超のテーパー・配偶者等の未使用枠移転を概算。", updateEn: "Estimates Inheritance Tax using the NRB, RNRB, the £2m taper and transferable unused spouse/civil-partner bands." },
    ],
  },
  investment: {
    implemented: true,
    effectiveTaxYear: "2026/27",
    lastUpdated: "2026-08-22",
    sourceName: "GOV.UK — Individual Savings Accounts (ISAs) / Tax on your private pension contributions",
    sourceUrl: "https://www.gov.uk/individual-savings-accounts",
    sourceUrls: {
      isaAllowance: "https://www.gov.uk/individual-savings-accounts",
      pensionAnnualAllowance: "https://www.gov.uk/tax-on-your-private-pension/annual-allowance",
      pensionAccessAge: "https://www.gov.uk/personal-pensions-your-rights",
      taxFreeLumpSum: "https://www.gov.uk/tax-on-pension",
      juniorIsa: "https://www.gov.uk/junior-individual-savings-accounts/add-money-to-an-account",
      pensionContributionRelief: "https://www.gov.uk/government/publications/rates-and-allowances-pension-schemes/pension-schemes-rates",
    },
    // 英国版で別々に管理・計算する口座
    accountTypes: ["stocksSharesIsa", "cashIsa", "lifetimeIsa", "sipp", "workplacePension", "gia", "cashSavings"],
    isaAccounts: ["stocksSharesIsa", "cashIsa", "lifetimeIsa"],
    pensionAccounts: ["sipp", "workplacePension"],
    taxAdvantagedAccounts: ["stocksSharesIsa", "cashIsa", "lifetimeIsa", "sipp", "workplacePension"],
    limits: {
      // ISA：全ISA合算での年間拠出上限（2026/27）
      isaAnnualAllowance: 20000,
      lifetimeIsaAnnual: 4000,
      juniorIsaAnnual: 9000,
      // 年金（SIPP＋職域年金の合算）：Annual Allowance（2026/27）
      pensionAnnualAllowance: 60000,
      pensionTaperThresholdIncome: 200000,
      pensionTaperAdjustedIncome: 260000,
      pensionAnnualAllowanceFloor: 10000,
      moneyPurchaseAnnualAllowance: 10000,
    },
    lifetimeIsa: {
      annualPaymentLimit: 4000,
      governmentBonusRate: 0.25,
      openingMinAge: 18,
      openingMaxAge: 39,
      contributionEndsAtAge: 50,
      retirementWithdrawalAge: 60,
      firstHomeMaxPrice: 450000,
      firstHomeMinimumHoldingMonths: 12,
      unauthorisedWithdrawalChargeRate: 0.25,
    },
    juniorIsa: {
      annualContributionLimit: 9000,
      minimumAge: 0,
      maximumAgeExclusive: 18,
      accessAge: 18,
      unusedAllowanceCarryForward: false,
      taxFreeGrowth: true,
      taxFreeWithdrawals: true,
    },
    juniorSipp: {
      // 「Junior SIPP」は子ども名義の登録年金。税制上は通常の登録年金ルールを使う。
      minimumAge: 0,
      maximumAgeExclusive: 18,
      grossReliefFloorWithoutEarnings: 3600,
      netReliefFloorWithoutEarnings: 2880,
      reliefAtSourceRate: 0.20,
      annualAllowance: 60000,
      // 子どもが到達する時点では、既に法定最低年金受給年齢57歳（2028-04-06以降）が適用される前提。
      normalMinimumPensionAge: 57,
      unusedTaxReliefFloorCarryForward: false,
      exceptionalAccess: {
        deathBeforeAccessAge: true,
        seriousIllHealthBeforeAccessAge: true,
        ordinaryEarlyWithdrawal: false,
      },
      providerSpecificTermsModelled: false,
    },
    // 予定されている制度変更（2026/27時点では未適用。計算には反映していない）
    scheduled: {
      // 2027年4月6日からのISA改革
      cashIsaLimitUnder65From2027: 12000,
      cashIsaLimitAge65PlusFrom2027: 20000,
      cashIsaLimitEffectiveDate: "2027-04-06",
      cashIsaTransferFromNonCashUnder65AllowedFrom2027: false,
      nonCashIsaCashInterestChargeRateFrom2027: 0.22,
      // 私的年金の受給可能最低年齢は2028年4月6日から57歳へ引き上げ予定
      pensionAccessAgeFrom2028: 57,
      pensionAccessAgeEffectiveDate: "2028-04-06",
    },
    // 私的年金（SIPP・職域年金）にアクセスできる最低年齢（2026/27時点）
    pensionAccessAge: 55,
    // 非課税一時金：年金資産の25%（Lump Sum Allowance の範囲内）
    taxFreeLumpSumRate: 0.25,
    lumpSumAllowance: 268275,

    // ---------- 計算関数（すべて純粋関数。JP/USや共通エンジンからは呼ばれない） ----------
    _num(v) { return Number(v) || 0; },
    getIsaAnnualAllowance() { return this.limits.isaAnnualAllowance; },
    getCashIsaAnnualLimit({ date = "2026-04-06", age = 0 } = {}) {
      const d = String(date || "");
      const a = Math.max(0, Math.floor(this._num(age)));
      if (d < this.scheduled.cashIsaLimitEffectiveDate) return this.limits.isaAnnualAllowance;
      return a >= 65
        ? this.scheduled.cashIsaLimitAge65PlusFrom2027
        : this.scheduled.cashIsaLimitUnder65From2027;
    },
    canTransferNonCashIsaToCashIsa({ date = "2026-04-06", age = 0 } = {}) {
      const d = String(date || "");
      const a = Math.max(0, Math.floor(this._num(age)));
      if (d < this.scheduled.cashIsaLimitEffectiveDate) return true;
      if (a >= 65) return true;
      return this.scheduled.cashIsaTransferFromNonCashUnder65AllowedFrom2027;
    },
    getNonCashIsaCashInterestChargeRate({ date = "2026-04-06" } = {}) {
      const d = String(date || "");
      return d >= this.scheduled.cashIsaLimitEffectiveDate
        ? this.scheduled.nonCashIsaCashInterestChargeRateFrom2027
        : 0;
    },
    getLifetimeIsaAnnualBonus(contribution, age) {
      const lisa = this.lifetimeIsa;
      const a = Number(age);
      if (!Number.isFinite(a) || a < lisa.openingMinAge || a >= lisa.contributionEndsAtAge) return 0;
      const eligibleContribution = Math.min(lisa.annualPaymentLimit, Math.max(0, Number(contribution) || 0));
      return eligibleContribution * lisa.governmentBonusRate;
    },
    canUseLifetimeIsaForFirstHome({ propertyPrice = 0, monthsSinceFirstPayment = 0, isFirstHome = true, usesMortgage = true } = {}) {
      const lisa = this.lifetimeIsa;
      return !!isFirstHome
        && !!usesMortgage
        && Math.max(0, Number(propertyPrice) || 0) <= lisa.firstHomeMaxPrice
        && Math.max(0, Number(monthsSinceFirstPayment) || 0) >= lisa.firstHomeMinimumHoldingMonths;
    },
    getLifetimeIsaUnauthorisedWithdrawalCharge(withdrawalAmount) {
      return Math.max(0, Number(withdrawalAmount) || 0) * this.lifetimeIsa.unauthorisedWithdrawalChargeRate;
    },
    getJuniorIsaEligibleContribution(contribution, age) {
      const j = this.juniorIsa;
      const a = Number(age);
      if (!Number.isFinite(a) || a < j.minimumAge || a >= j.maximumAgeExclusive) return 0;
      return Math.min(j.annualContributionLimit, Math.max(0, this._num(contribution)));
    },
    getJuniorIsaRemaining(contribution, age) {
      const j = this.juniorIsa;
      const a = Number(age);
      if (!Number.isFinite(a) || a < j.minimumAge || a >= j.maximumAgeExclusive) return 0;
      return Math.max(0, j.annualContributionLimit - Math.max(0, this._num(contribution)));
    },
    projectJuniorIsaTo18({ currentAge = 0, currentValue = 0, annualContribution = 0, expectedReturnPct = 0 } = {}) {
      const startAge = Math.max(0, Math.floor(this._num(currentAge)));
      let balance = Math.max(0, this._num(currentValue));
      const rate = this._num(expectedReturnPct) / 100;
      for (let age = startAge; age < this.juniorIsa.accessAge; age += 1) {
        const contribution = this.getJuniorIsaEligibleContribution(annualContribution, age);
        balance = (balance + contribution) * (1 + rate);
      }
      return balance;
    },
    getJuniorSippTaxRelievedGrossLimit(relevantUkEarnings = 0) {
      const j = this.juniorSipp;
      const earnings = Math.max(0, this._num(relevantUkEarnings));
      return Math.min(j.annualAllowance, Math.max(j.grossReliefFloorWithoutEarnings, earnings));
    },
    getJuniorSippEligibleGrossContribution(grossContribution = 0, relevantUkEarnings = 0, age = 0) {
      const j = this.juniorSipp;
      const a = Number(age);
      if (!Number.isFinite(a) || a < j.minimumAge || a >= j.maximumAgeExclusive) return 0;
      return Math.min(
        Math.max(0, this._num(grossContribution)),
        this.getJuniorSippTaxRelievedGrossLimit(relevantUkEarnings)
      );
    },
    getJuniorSippReliefAtSource(grossContribution = 0, relevantUkEarnings = 0, age = 0) {
      const eligibleGross = this.getJuniorSippEligibleGrossContribution(grossContribution, relevantUkEarnings, age);
      return eligibleGross * this.juniorSipp.reliefAtSourceRate;
    },
    getJuniorSippNetPaymentForGross(grossContribution = 0, relevantUkEarnings = 0, age = 0) {
      const eligibleGross = this.getJuniorSippEligibleGrossContribution(grossContribution, relevantUkEarnings, age);
      return eligibleGross * (1 - this.juniorSipp.reliefAtSourceRate);
    },
    canAccessJuniorSippBeforeMinimumAge({ age = 0, deceased = false, seriousIllHealth = false } = {}) {
      const a = Math.max(0, this._num(age));
      if (a >= this.juniorSipp.normalMinimumPensionAge) return true;
      return Boolean(deceased || seriousIllHealth);
    },
    getJuniorSippAccessReason({ age = 0, deceased = false, seriousIllHealth = false } = {}) {
      const a = Math.max(0, this._num(age));
      if (a >= this.juniorSipp.normalMinimumPensionAge) return "normal-minimum-age";
      if (deceased) return "death";
      if (seriousIllHealth) return "serious-ill-health";
      return "locked";
    },
    projectJuniorSipp({ currentAge = 0, currentValue = 0, annualGrossContribution = 0, relevantUkEarnings = 0, expectedReturnPct = 0, projectToAge = 18 } = {}) {
      const startAge = Math.max(0, Math.floor(this._num(currentAge)));
      const endAge = Math.max(startAge, Math.floor(this._num(projectToAge)));
      let balance = Math.max(0, this._num(currentValue));
      const rate = this._num(expectedReturnPct) / 100;
      for (let age = startAge; age < endAge; age += 1) {
        const gross = this.getJuniorSippEligibleGrossContribution(annualGrossContribution, relevantUkEarnings, age);
        balance = (balance + gross) * (1 + rate);
      }
      return balance;
    },

    // ISA年間拠出額（Stocks and Shares ISA + Cash ISA の合算）
    getIsaContributed(accounts) {
      return this._num((accounts.stocksSharesIsa || {}).annualContribution)
        + this._num((accounts.cashIsa || {}).annualContribution)
        + this._num((accounts.lifetimeIsa || {}).annualContribution);
    },
    getLifetimeIsaEligibleContribution(accounts, age) {
      const a = Number(age);
      if (!Number.isFinite(a) || a >= this.lifetimeIsa.contributionEndsAtAge) return 0;
      return Math.min(
        this.lifetimeIsa.annualPaymentLimit,
        Math.max(0, this._num((accounts.lifetimeIsa || {}).annualContribution))
      );
    },
    getLifetimeIsaAnnualContributionWithBonus(accounts, age) {
      const eligible = this.getLifetimeIsaEligibleContribution(accounts, age);
      return eligible + (eligible * this.lifetimeIsa.governmentBonusRate);
    },
    getIsaRemaining(accounts) {
      return this.limits.isaAnnualAllowance - this.getIsaContributed(accounts);
    },
    // 年金のAnnual Allowance。高所得者はテーパリングにより最低 £10,000 まで逓減する。
    // （threshold income が £200,000 以下、または adjusted income が £260,000 以下なら満額）
    getPensionAnnualAllowance(adjustedIncome, thresholdIncome) {
      const l = this.limits;
      const ai = this._num(adjustedIncome);
      const ti = (thresholdIncome === undefined || thresholdIncome === null) ? ai : this._num(thresholdIncome);
      if (ti <= l.pensionTaperThresholdIncome || ai <= l.pensionTaperAdjustedIncome) return l.pensionAnnualAllowance;
      const reduction = (ai - l.pensionTaperAdjustedIncome) / 2;
      return Math.max(l.pensionAnnualAllowanceFloor, l.pensionAnnualAllowance - reduction);
    },
    // 年金年間拠出額（SIPP + 職域年金の合算）
    getPensionContributed(accounts) {
      return this._num((accounts.sipp || {}).annualContribution)
        + this._num((accounts.workplacePension || {}).annualContribution);
    },
    getPensionCarryForwardAvailable(availableFromPrior3Years) {
      return Math.max(0, this._num(availableFromPrior3Years));
    },
    reconstructPensionCarryForward(priorTaxYears = []) {
      const rows = Array.isArray(priorTaxYears) ? priorTaxYears.slice(-3) : [];
      return rows.map((row) => {
        const annualAllowance = Math.max(0, this._num(row?.annualAllowance));
        const pensionInputAmount = Math.max(0, this._num(row?.pensionInputAmount));
        const wasMember = row?.wasMember !== false;
        const unused = wasMember ? Math.max(0, annualAllowance - pensionInputAmount) : 0;
        return {
          taxYear: String(row?.taxYear || ""),
          annualAllowance,
          pensionInputAmount,
          wasMember,
          unused,
        };
      });
    },
    getReconstructedPensionCarryForwardAvailable(priorTaxYears = []) {
      return this.reconstructPensionCarryForward(priorTaxYears)
        .reduce((sum, row) => sum + row.unused, 0);
    },
    allocatePensionCarryForward({ currentAllowance = 0, currentPensionInput = 0, priorTaxYears = [] } = {}) {
      const current = Math.max(0, this._num(currentAllowance));
      let excess = Math.max(0, this._num(currentPensionInput) - current);
      const history = this.reconstructPensionCarryForward(priorTaxYears);
      const usage = [];
      // HMRCの順序：当年枠を先に使い、その後は最も古いcarry-forwardから消化。
      for (const row of history) {
        const used = Math.min(row.unused, excess);
        usage.push({ ...row, used, remaining: row.unused - used });
        excess -= used;
      }
      return {
        currentAllowanceUsed: Math.min(current, Math.max(0, this._num(currentPensionInput))),
        carryForwardUsed: usage.reduce((sum, row) => sum + row.used, 0),
        unusedCarryForwardRemaining: usage.reduce((sum, row) => sum + row.remaining, 0),
        excessAfterCarryForward: Math.max(0, excess),
        usage,
      };
    },
    getEffectivePensionAnnualAllowance(adjustedIncome, thresholdIncome, availableFromPrior3Years = 0) {
      return this.getPensionAnnualAllowance(adjustedIncome, thresholdIncome) + this.getPensionCarryForwardAvailable(availableFromPrior3Years);
    },
    getPensionRemaining(accounts, adjustedIncome, thresholdIncome, availableFromPrior3Years = 0) {
      return this.getEffectivePensionAnnualAllowance(adjustedIncome, thresholdIncome, availableFromPrior3Years) - this.getPensionContributed(accounts);
    },

    // 6口座の残高を、現在の年齢から死亡想定年齢まで年単位で積み上げる。
    // 口座ごとに「現在額・年間積立額・想定利回り・積立終了年齢」を個別に持つ点がJP/US版と異なる。
    // 退職後は、年金収入で賄えない不足額（annualWithdrawalNeeded）を口座から取り崩す。
    // 取崩し順：General Investment Account → Cash Savings → Cash ISA → Stocks and Shares ISA
    //           → Workplace Pension → SIPP
    // （税制優遇の小さい口座から先に取り崩し、年金資産は受給可能年齢に達するまで手を付けない）
    simulateGrowth({ currentAge, retireAge, deathAge, accounts, annualWithdrawalNeeded, pensionAccessAge }) {
      const keys = this.accountTypes;
      const accessAge = (pensionAccessAge === undefined || pensionAccessAge === null)
        ? this.pensionAccessAge
        : Number(pensionAccessAge);
      const balances = {};
      const contributions = {};
      const rates = {};
      const endAges = {};
      keys.forEach((k) => {
        const a = accounts[k] || {};
        balances[k] = Number(a.currentValue) || 0;
        contributions[k] = k === "lifetimeIsa"
          ? this.getLifetimeIsaAnnualContributionWithBonus(accounts, currentAge)
          : (Number(a.annualContribution) || 0);
        rates[k] = (Number(a.expectedReturnPct) || 0) / 100;
        endAges[k] = k === "lifetimeIsa"
          ? Math.min(Number(a.contributionEndAge) || this.lifetimeIsa.contributionEndsAtAge, this.lifetimeIsa.contributionEndsAtAge)
          : (Number(a.contributionEndAge) || 0);
      });
      const withdrawalOrder = ["gia", "cashSavings", "cashIsa", "stocksSharesIsa", "lifetimeIsa", "workplacePension", "sipp"];
      const totalOf = (b) => keys.reduce((s, k) => s + b[k], 0);
      const startAge = Math.round(currentAge);
      const endAge = Math.round(deathAge);
      const yearly = [{ age: startAge, value: totalOf(balances), accounts: { ...balances } }];
      for (let age = startAge + 1; age <= endAge; age++) {
        keys.forEach((k) => { balances[k] = balances[k] * (1 + rates[k]); });
        // 積立は口座ごとの「積立終了年齢」まで継続する
        keys.forEach((k) => { if (age <= endAges[k]) balances[k] += contributions[k]; });
        if (age > retireAge) {
          let remaining = Number(annualWithdrawalNeeded) || 0;
          for (const key of withdrawalOrder) {
            if (remaining <= 0) break;
            const isPension = (key === "sipp" || key === "workplacePension");
            const isLifetimeIsa = key === "lifetimeIsa";
            if (isPension && age < accessAge) continue; // 受給可能年齢前の年金資産は取り崩せない
            if (isLifetimeIsa && age < this.lifetimeIsa.retirementWithdrawalAge) continue;
            const take = Math.min(balances[key], remaining);
            balances[key] -= take;
            remaining -= take;
          }
        }
        yearly.push({ age, value: totalOf(balances), accounts: { ...balances } });
      }
      return { yearly, finalValue: totalOf(balances), finalAccounts: { ...balances } };
    },

    // 資産区分。
    // ・Liquid / Accessible：Cash Savings・Cash ISA・GIA・Stocks and Shares ISA（＋受給可能年齢に達していれば年金資産）
    // ・Retirement / Restricted：SIPP・職域年金（受給可能年齢に達するまで）
    // ・Tax-Advantaged：ISA（S&S・Cash）＋SIPP＋職域年金 ＝ 上2区分と重なる「横断的な内訳」
    // 総資産（total）は6口座すべての単純合計であり、Liquid + Restricted と必ず一致する。
    splitAssets(age, accounts) {
      const v = {};
      this.accountTypes.forEach((k) => { v[k] = Number((accounts[k] || {}).currentValue) || 0; });
      const isAccessibleAge = age >= this.pensionAccessAge;
      const pensions = v.sipp + v.workplacePension;
      const lisa = v.lifetimeIsa;
      const lisaAccessible = age >= this.lifetimeIsa.retirementWithdrawalAge;
      const liquidBase = v.cashSavings + v.cashIsa + v.gia + v.stocksSharesIsa;
      const liquid = liquidBase + (lisaAccessible ? lisa : 0) + (isAccessibleAge ? pensions : 0);
      const restricted = (lisaAccessible ? 0 : lisa) + (isAccessibleAge ? 0 : pensions);
      const taxAdvantaged = v.stocksSharesIsa + v.cashIsa + lisa + v.sipp + v.workplacePension;
      return { liquid, restricted, taxAdvantaged, total: liquidBase + lisa + pensions, isAccessibleAge, lisaAccessible, accounts: v };
    },
    notImplemented: [
      "Lifetime ISA（LISA）は独立口座・年間£4,000上限・25%政府ボーナス・50歳までの拠出・60歳からの退職目的アクセスを資産推移へ統合済み。初回住宅購入による途中引出しをライフプラン資産推移へ自動反映する機能は未実装",
      "Junior ISAは年間£9,000上限・18歳までロック・未使用枠繰越なし・18歳時点投影を実装済み。子ども向けSIPPは無収入時£3,600 gross（£2,880 net＋20% relief at source）・所得連動上限・57歳最低受給年齢・残高投影・死亡/重篤疾患の例外アクセス判定まで実装済み。provider固有の手数料・最低拠出額・商品制限等は未実装",
      "年金carry forwardは過去3年のannual allowance・pension input amount・加入有無から未使用枠を再構成し、当年枠→最古年度の順で使用する計算まで実装済み。UIから各年度履歴を自動取得する機能は未実装",
      "2027年4月6日ISA改革は65歳未満Cash ISA £12,000、65歳以上£20,000、65歳未満の非Cash ISA→Cash ISA移管禁止、非Cash ISA内現金利息22% chargeの切替判定までscheduled計算に実装済み。2027年制度を画面入力へ自動切替するUIは未実装",
    ],
  },

  retirement: {
    implemented: true,
    effectiveTaxYear: "2026/27",
    lastUpdated: "2026-08-22",
    sourceName: "GOV.UK — The new State Pension",
    sourceUrl: "https://www.gov.uk/new-state-pension",
    sourceUrls: {
      fullRate: "https://www.gov.uk/new-state-pension/what-youll-get",
      statePensionAge: "https://www.gov.uk/state-pension-age",
      deferral: "https://www.gov.uk/deferring-state-pension",
      forecast: "https://www.gov.uk/check-state-pension",
      pensionCreditRates: "https://www.gov.uk/government/publications/benefit-and-pension-rates-2026-to-2027",
    },
    accountTypes: ["statePension"],
    statePension: {
      // 2026/27：新State Pension満額 週£241.30（三重ロックにより2026年4月から4.8%増額）
      fullWeeklyRate: 241.30,
      fullAnnualRate: 241.30 * 52, // = £12,547.60
      // 2016年4月より前に受給開始年齢に達した人の基礎年金（Basic State Pension）満額
      basicFullWeeklyRate: 184.90,
      qualifyingYearsForFull: 35,
      minimumQualifyingYears: 10,
      // State Pension age は生年月日で法律により決まる（利用者の入力ではなく自動算出する）。
      // 根拠：Pensions Act 2014 s.26（66→67の前倒し）／Pensions Act 2007 Sch.3（67→68）。
      //   〜1960-04-05生まれ            → 66歳
      //   1960-04-06〜1961-03-05生まれ  → 66歳1か月〜66歳11か月（1か月刻みで逓増）
      //   1961-03-06〜1977-04-05生まれ  → 67歳
      //   1977-04-06〜1978-04-05生まれ  → 移行期。下の TABLE 4 の固定日にSPAへ到達する
      //   1978-04-06以降生まれ          → 68歳（68歳の誕生日に到達）
      // 1954-10-06より前の生まれ（2026年時点で71歳以上）は既にSPAに到達済みのため66歳を返す。
      ageBefore2026: 66,
      ageAfterTransition: 67,
      ageFrom2044: 68,
      defaultAge: 67,
      // 段階的引上げの区切り（ISO日付）
      transitionStart: "1960-04-06",   // これ以降、66歳から月単位で逓増
      age67From: "1961-03-06",         // これ以降は67歳
      age68TransitionStart: "1977-04-06", // これ以降、67→68の移行期に入る
      age68From: "1978-04-06",         // これ以降は68歳（68歳の誕生日）
      // Pensions Act 2007 Schedule 3 TABLE 4（GOV.UK「State Pension age timetable」Table 5と同一）。
      // 移行期は「年齢」ではなく「SPAに到達する固定日」で定められているため、表をそのまま持つ。
      // 実際の到達年齢は生年月日とこの固定日の差で決まり、区分内でも人によって異なる。
      // 出典：https://www.legislation.gov.uk/ukpga/2007/22/schedule/3/enacted
      age68Table: [
        { from: "1977-04-06", to: "1977-05-05", spaDate: "2044-05-06" },
        { from: "1977-05-06", to: "1977-06-05", spaDate: "2044-07-06" },
        { from: "1977-06-06", to: "1977-07-05", spaDate: "2044-09-06" },
        { from: "1977-07-06", to: "1977-08-05", spaDate: "2044-11-06" },
        { from: "1977-08-06", to: "1977-09-05", spaDate: "2045-01-06" },
        { from: "1977-09-06", to: "1977-10-05", spaDate: "2045-03-06" },
        { from: "1977-10-06", to: "1977-11-05", spaDate: "2045-05-06" },
        { from: "1977-11-06", to: "1977-12-05", spaDate: "2045-07-06" },
        { from: "1977-12-06", to: "1978-01-05", spaDate: "2045-09-06" },
        { from: "1978-01-06", to: "1978-02-05", spaDate: "2045-11-06" },
        { from: "1978-02-06", to: "1978-03-05", spaDate: "2046-01-06" },
        { from: "1978-03-06", to: "1978-04-05", spaDate: "2046-03-06" },
      ],
      // 繰下げ受給：9週ごとに1%増額（1年＝52週の繰下げで約5.78%増）。英国では繰上げ受給はできない。
      // GOV.UK "Delay (defer) your State Pension"：最低9週間の繰下げが必要で、それ以降は比例して増額する。
      deferralUpliftPerNineWeeks: 0.01,
      deferralUnitWeeks: 9,      // 増額の単位（9週間ごとに1%）
      deferralMinimumWeeks: 9,   // これ未満の繰下げでは増額しない
      weeksPerYear: 52,
      earlyClaimAllowed: false,
    },
    pensionCredit: {
      effectiveTaxYear: "2026/27",
      standardMinimumGuaranteeWeekly: {
        single: 238.00,
        couple: 363.25,
      },
      severeDisabilityAdditionalWeekly: {
        single: 86.05,
        coupleOneQualifies: 86.05,
        coupleBothQualify: 172.10,
      },
      carerAdditionalWeekly: 48.15,
      capital: {
        disregard: 10000,
        tariffUnit: 500,
        tariffIncomePerUnitWeekly: 1,
        upperLimit: null,
      },
      guaranteeCreditExtraAmounts: {
        severeDisabilityWeekly: 86.05,
        severeDisabilityCoupleBothQualifyWeekly: 172.10,
        carerWeeklyPerQualifyingPartner: 48.15,
        childFirstBornBefore2017Weekly: 81.07,
        childOtherWeekly: 69.98,
        disabledChildLowerWeekly: 37.93,
        disabledChildHigherWeekly: 118.46,
      },
      mixedAgeCouples: {
        newClaimRuleFrom: "2019-05-15",
        bothPartnersNormallyMustReachQualifyingAge: true,
        protectedContinuityCutoff: "2019-05-14",
        pensionAgeHousingBenefitCanPreserveEligibility: true,
      },
      savingsCredit: {
        singleThresholdWeekly: 208.07,
        coupleThresholdWeekly: 329.75,
        singleMaximumWeekly: 17.96,
        coupleMaximumWeekly: 20.10,
        amountARate: 0.60,
        amountBRate: 0.40,
        closedToNewStatePensionAgeFrom: "2016-04-06",
        transitionalCoupleContinuityRequired: true,
      },
    },
    niForecastModel: {
      minimumQualifyingYears: 10,
      fullRateQualifyingYears: 35,
      exactForecastRequiresOfficialRecord: true,
      approximationScope: "simple-new-state-pension-years-only",
    },
    estimateStatePensionFromQualifyingYears(qualifyingYears) {
      const years = Math.max(0, Math.floor(Number(qualifyingYears) || 0));
      const model = this.niForecastModel;
      if (years < model.minimumQualifyingYears) {
        return { qualifyingYears: years, eligible: false, weekly: 0, annual: 0, isExactForecast: false };
      }
      const creditedYears = Math.min(model.fullRateQualifyingYears, years);
      const ratio = creditedYears / model.fullRateQualifyingYears;
      const weekly = this.statePension.fullWeeklyRate * ratio;
      return {
        qualifyingYears: years,
        eligible: true,
        weekly,
        annual: weekly * this.statePension.weeksPerYear,
        isExactForecast: false,
      };
    },
    calculatePensionCreditAssessableIncome({
      statePensionWeekly = 0,
      privatePensionWeekly = 0,
      earningsWeekly = 0,
      otherCountedBenefitsWeekly = 0,
      otherCountedIncomeWeekly = 0,
      capital = 0,
      status = "single",
      higherEarningsDisregard = false,
      fullyDisregardedIncomeWeekly = 0,
    } = {}) {
      const nonNegative = (value) => Math.max(0, Number(value) || 0);
      const earnings = nonNegative(earningsWeekly);
      const normalEarningsDisregard = status === "couple" ? 10 : 5;
      const earningsDisregard = higherEarningsDisregard ? 20 : normalEarningsDisregard;
      const countedEarnings = Math.max(0, earnings - earningsDisregard);
      const tariffIncome = this.calculatePensionCreditTariffIncome(capital);

      const countedIncome =
        nonNegative(statePensionWeekly) +
        nonNegative(privatePensionWeekly) +
        countedEarnings +
        nonNegative(otherCountedBenefitsWeekly) +
        nonNegative(otherCountedIncomeWeekly) +
        tariffIncome;

      // State Pension Credit Regulations 2002, reg. 24A: where a calculation
      // leaves a fraction of a penny, keep the claimant-favourable result. On
      // the income side, a lower counted-income figure favours the claimant, so
      // discard sub-penny fractions rather than rounding them up to nearest.
      const floorPence = (value) => Math.floor((value + Number.EPSILON) * 100) / 100;
      return {
        countedIncomeWeekly: floorPence(countedIncome),
        countedEarningsWeekly: floorPence(countedEarnings),
        earningsDisregardWeekly: earningsDisregard,
        tariffIncomeWeekly: tariffIncome,
        fullyDisregardedIncomeWeekly: nonNegative(fullyDisregardedIncomeWeekly),
      };
    },

    calculatePensionCreditGuaranteeAppropriateAmount({
      status = "single",
      severeDisabilityQualifiers = 0,
      carerQualifiers = 0,
      firstChildrenBornBefore2017 = 0,
      otherChildren = 0,
      disabledChildrenLower = 0,
      disabledChildrenHigher = 0,
      eligibleHousingCostsWeekly = 0,
      transitionalAdditionalAmountWeekly = 0,
    } = {}) {
      const pc = this.pensionCredit;
      const extras = pc.guaranteeCreditExtraAmounts;
      const nonNegative = (value) => Math.max(0, Number(value) || 0);
      const whole = (value) => Math.max(0, Math.floor(Number(value) || 0));
      const base = status === "couple"
        ? pc.standardMinimumGuaranteeWeekly.couple
        : pc.standardMinimumGuaranteeWeekly.single;

      const severeCount = whole(severeDisabilityQualifiers);
      const severeDisabilityExtra =
        status === "couple" && severeCount >= 2
          ? extras.severeDisabilityCoupleBothQualifyWeekly
          : severeCount >= 1
            ? extras.severeDisabilityWeekly
            : 0;
      const carerExtra =
        Math.min(status === "couple" ? 2 : 1, whole(carerQualifiers)) *
        extras.carerWeeklyPerQualifyingPartner;
      const firstChildren = whole(firstChildrenBornBefore2017);
      const laterChildren = whole(otherChildren);
      const totalChildren = firstChildren + laterChildren;
      // A child/QYP can receive one disabled-child extra amount (lower or higher),
      // and the disabled-child count cannot exceed the children included above.
      // If inconsistent input supplies both tiers for more children than exist,
      // preserve the higher-rate claims first and cap the lower-rate remainder.
      const disabledHigherCount = Math.min(totalChildren, whole(disabledChildrenHigher));
      const disabledLowerCount = Math.min(
        Math.max(0, totalChildren - disabledHigherCount),
        whole(disabledChildrenLower),
      );
      const childExtra =
        (firstChildren > 0 ? extras.childFirstBornBefore2017Weekly : 0) +
        Math.max(0, firstChildren - 1) * extras.childOtherWeekly +
        laterChildren * extras.childOtherWeekly +
        disabledLowerCount * extras.disabledChildLowerWeekly +
        disabledHigherCount * extras.disabledChildHigherWeekly;
      const housingExtra = nonNegative(eligibleHousingCostsWeekly);
      const transitionalExtra = nonNegative(transitionalAdditionalAmountWeekly);
      const total =
        base + severeDisabilityExtra + carerExtra + childExtra +
        housingExtra + transitionalExtra;

      return {
        standardMinimumGuaranteeWeekly: base,
        severeDisabilityExtraWeekly: severeDisabilityExtra,
        carerExtraWeekly: Math.round(carerExtra * 100) / 100,
        childExtraWeekly: Math.round(childExtra * 100) / 100,
        housingExtraWeekly: Math.round(housingExtra * 100) / 100,
        transitionalAdditionalAmountWeekly: Math.round(transitionalExtra * 100) / 100,
        appropriateAmountWeekly: Math.round(total * 100) / 100,
      };
    },

    assessPensionCreditAgeEligibility({
      status = "single",
      claimantReachedStatePensionAge = false,
      partnerReachedStatePensionAge = false,
      protectedMixedAgeContinuity = false,
      pensionAgeHousingBenefitContinuity = false,
    } = {}) {
      const couple = status === "couple";
      const claimantAtAge = claimantReachedStatePensionAge === true;
      const partnerAtAge = partnerReachedStatePensionAge === true;

      if (!couple) {
        return {
          eligible: claimantAtAge,
          reason: claimantAtAge ? "single-at-qualifying-age" : "single-below-qualifying-age",
          requiresUniversalCreditRoute: !claimantAtAge,
        };
      }

      if (claimantAtAge && partnerAtAge) {
        return {
          eligible: true,
          reason: "both-partners-at-qualifying-age",
          requiresUniversalCreditRoute: false,
        };
      }

      const protectedContinuity =
        protectedMixedAgeContinuity === true ||
        pensionAgeHousingBenefitContinuity === true;

      if ((claimantAtAge || partnerAtAge) && protectedContinuity) {
        return {
          eligible: true,
          reason: "protected-mixed-age-continuity",
          requiresUniversalCreditRoute: false,
        };
      }

      return {
        eligible: false,
        reason: "mixed-age-new-claim",
        requiresUniversalCreditRoute: true,
      };
    },

    calculatePensionCreditGuaranteeCredit({
      status = "single",
      claimantReachedStatePensionAge = false,
      partnerReachedStatePensionAge = false,
      protectedMixedAgeContinuity = false,
      pensionAgeHousingBenefitContinuity = false,

      statePensionWeekly = 0,
      privatePensionWeekly = 0,
      earningsWeekly = 0,
      otherCountedBenefitsWeekly = 0,
      otherCountedIncomeWeekly = 0,
      capital = 0,
      higherEarningsDisregard = false,
      fullyDisregardedIncomeWeekly = 0,

      severeDisabilityQualifiers = 0,
      carerQualifiers = 0,
      firstChildrenBornBefore2017 = 0,
      otherChildren = 0,
      disabledChildrenLower = 0,
      disabledChildrenHigher = 0,
      eligibleHousingCostsWeekly = 0,
      transitionalAdditionalAmountWeekly = 0,
    } = {}) {
      const age = this.assessPensionCreditAgeEligibility({
        status,
        claimantReachedStatePensionAge,
        partnerReachedStatePensionAge,
        protectedMixedAgeContinuity,
        pensionAgeHousingBenefitContinuity,
      });

      const income = this.calculatePensionCreditAssessableIncome({
        statePensionWeekly,
        privatePensionWeekly,
        earningsWeekly,
        otherCountedBenefitsWeekly,
        otherCountedIncomeWeekly,
        capital,
        status,
        higherEarningsDisregard,
        fullyDisregardedIncomeWeekly,
      });

      const appropriate = this.calculatePensionCreditGuaranteeAppropriateAmount({
        status,
        severeDisabilityQualifiers,
        carerQualifiers,
        firstChildrenBornBefore2017,
        otherChildren,
        disabledChildrenLower,
        disabledChildrenHigher,
        eligibleHousingCostsWeekly,
        transitionalAdditionalAmountWeekly,
      });

      const rawWeekly =
        appropriate.appropriateAmountWeekly - income.countedIncomeWeekly;
      const guaranteeCreditWeekly =
        age.eligible ? Math.max(0, Math.ceil((rawWeekly - Number.EPSILON) * 100) / 100) : 0;

      return {
        eligibleByAge: age.eligible,
        ageReason: age.reason,
        requiresUniversalCreditRoute: age.requiresUniversalCreditRoute,
        appropriateAmountWeekly: appropriate.appropriateAmountWeekly,
        countedIncomeWeekly: income.countedIncomeWeekly,
        guaranteeCreditWeekly,
        annualGuaranteeCredit: Math.round(guaranteeCreditWeekly * 52 * 100) / 100,
        incomeBreakdown: income,
        appropriateAmountBreakdown: appropriate,
      };
    },

    calculatePensionCreditTariffIncome(capital) {
      const amount = Math.max(0, Number(capital) || 0);
      const rules = this.pensionCredit.capital;
      if (amount <= rules.disregard) return 0;
      const excess = amount - rules.disregard;
      return Math.ceil(excess / rules.tariffUnit) * rules.tariffIncomePerUnitWeekly;
    },
    calculatePensionCreditSavingsCredit({
      status = "single",
      qualifyingIncomeWeekly = 0,
      totalIncomeWeekly = null,
      appropriateAmountWeekly = null,
      reachedStatePensionAgeBefore20160406 = false,
      partnerReachedStatePensionAgeBefore20160406 = null,
      transitionalCoupleContinuousEntitlement = false,
    } = {}) {
      const pc = this.pensionCredit;
      const rules = pc.savingsCredit;
      const couple = status === "couple";
      const threshold = couple ? rules.coupleThresholdWeekly : rules.singleThresholdWeekly;
      const maximum = couple ? rules.coupleMaximumWeekly : rules.singleMaximumWeekly;
      const standardAmount = couple
        ? pc.standardMinimumGuaranteeWeekly.couple
        : pc.standardMinimumGuaranteeWeekly.single;

      const claimantPre2016 = reachedStatePensionAgeBefore20160406 === true;
      const partnerAgeKnown = partnerReachedStatePensionAgeBefore20160406 != null;
      const partnerPre2016 = partnerReachedStatePensionAgeBefore20160406 === true;
      // Savings Credit closed to people reaching State Pension age on/after
      // 6 April 2016. For newly explicit couple data, both partners must be
      // pre-2016 unless a mixed-age couple has protected continuous entitlement.
      // Older saved/call-site data did not carry a separate partner-age flag;
      // when that value is unknown (null/undefined), preserve the historical
      // household-level meaning of reachedStatePensionAgeBefore20160406 so
      // existing valid couple calculations do not silently become ineligible.
      const mixedPre2016Couple =
        couple && partnerAgeKnown && (claimantPre2016 !== partnerPre2016);
      const eligibleByAge = couple
        ? (!partnerAgeKnown
          ? claimantPre2016
          : ((claimantPre2016 && partnerPre2016) ||
            (mixedPre2016Couple && transitionalCoupleContinuousEntitlement === true)))
        : claimantPre2016;

      const qualifyingIncome = Math.max(0, Number(qualifyingIncomeWeekly) || 0);
      const suppliedTotalIncome = Math.max(
        0,
        totalIncomeWeekly == null ? qualifyingIncome : Number(totalIncomeWeekly) || 0,
      );
      // Total income includes qualifying income plus any non-qualifying income,
      // so it cannot coherently be lower than qualifying income. Clamp impossible
      // caller/saved-data combinations upward to avoid overstating Savings Credit
      // by suppressing Amount B.
      const totalIncome = Math.max(qualifyingIncome, suppliedTotalIncome);
      const appropriateAmount = Math.max(
        0,
        appropriateAmountWeekly == null ? standardAmount : Number(appropriateAmountWeekly) || 0,
      );

      if (!eligibleByAge || qualifyingIncome <= threshold) {
        return {
          eligible: false,
          thresholdWeekly: threshold,
          maximumWeekly: maximum,
          amountAWeekly: 0,
          amountBWeekly: 0,
          savingsCreditWeekly: 0,
        };
      }

      // State Pension Credit Regulations: when a calculation produces a fraction
      // of a penny, round in the claimant's favour. For Amount A a larger figure
      // helps the claimant (round up); for Amount B a larger figure reduces the
      // award (discard the fraction / round down). This matches DWP's 2026 examples:
      // £7.776 -> Amount A £7.78, and £5.796 -> Amount B £5.79.
      const ceilPence = (value) => Math.ceil((value - Number.EPSILON) * 100) / 100;
      const floorPence = (value) => Math.floor((value + Number.EPSILON) * 100) / 100;
      const uncappedAmountA =
        qualifyingIncome >= standardAmount
          ? maximum
          : Math.max(0, qualifyingIncome - threshold) * rules.amountARate;
      const amountA = Math.min(maximum, ceilPence(uncappedAmountA));
      const amountB =
        totalIncome > appropriateAmount
          ? floorPence((totalIncome - appropriateAmount) * rules.amountBRate)
          : 0;
      const savingsCredit = Math.max(0, Math.round((amountA - amountB) * 100) / 100);

      return {
        eligible: true,
        thresholdWeekly: threshold,
        maximumWeekly: maximum,
        amountAWeekly: amountA,
        amountBWeekly: amountB,
        savingsCreditWeekly: savingsCredit,
      };
    },

    calculatePensionCreditGuarantee({
      status = "single",
      weeklyIncome = 0,
      capital = 0,
      severeDisabilityQualifiers = 0,
      carerQualifiers = 0,
    } = {}) {
      const pc = this.pensionCredit;
      const couple = status === "couple";
      let guarantee = couple
        ? pc.standardMinimumGuaranteeWeekly.couple
        : pc.standardMinimumGuaranteeWeekly.single;
      const disabled = Math.max(0, Math.floor(Number(severeDisabilityQualifiers) || 0));
      if (couple) {
        if (disabled >= 2) guarantee += pc.severeDisabilityAdditionalWeekly.coupleBothQualify;
        else if (disabled === 1) guarantee += pc.severeDisabilityAdditionalWeekly.coupleOneQualifies;
      } else if (disabled >= 1) {
        guarantee += pc.severeDisabilityAdditionalWeekly.single;
      }
      const carers = Math.max(0, Math.floor(Number(carerQualifiers) || 0));
      const cappedCarers = Math.min(couple ? 2 : 1, carers);
      guarantee += cappedCarers * pc.carerAdditionalWeekly;
      const income = Math.max(0, Number(weeklyIncome) || 0);
      const tariffIncomeWeekly = this.calculatePensionCreditTariffIncome(capital);
      const assessedIncomeWeekly = income + tariffIncomeWeekly;
      return {
        guaranteeWeekly: guarantee,
        weeklyIncome: income,
        capital: Math.max(0, Number(capital) || 0),
        tariffIncomeWeekly,
        assessedIncomeWeekly,
        guaranteeCreditWeekly: Math.max(
          0,
          Math.ceil(((guarantee - assessedIncomeWeekly) - Number.EPSILON) * 100) / 100,
        ),
      };
    },

    // 生年月日から法定の State Pension age を算出する（自動算出が標準）。
    // 返り値は { years, months, ageInYears, isTransitional, spaDate, source }。
    //   ageInYears は年単位の小数（例：66歳4か月 → 66.3333…）。計算にはこれを使う。
    //   spaDate は到達日が法律で固定されている場合のみ入る（67→68の移行期）。
    //   birthDate は "YYYY-MM-DD" 形式の文字列、または Date。
    // 判定できない場合（未入力・不正値）は null を返し、呼び出し側が既定値を使えるようにする。
    getStatePensionAge(birthDate) {
      const sp = this.statePension;
      if (!birthDate) return null;
      const d = birthDate instanceof Date ? birthDate : new Date(String(birthDate));
      if (Number.isNaN(d.getTime())) return null;
      const toKey = (iso) => {
        const p = String(iso).split("-").map(Number);
        return p[0] * 10000 + p[1] * 100 + p[2];
      };
      const key = d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();

      // 1978-04-06以降 → 68歳（68歳の誕生日に到達）
      if (key >= toKey(sp.age68From)) {
        return { years: sp.ageFrom2044, months: 0, ageInYears: sp.ageFrom2044, isTransitional: false, spaDate: null, source: "Pensions Act 2007 Sch.3" };
      }
      // 1977-04-06〜1978-04-05 → 67→68の移行期。法定の固定日にSPAへ到達する。
      if (key >= toKey(sp.age68TransitionStart)) {
        const row = sp.age68Table.find((r) => key >= toKey(r.from) && key <= toKey(r.to));
        if (row) {
          const spa = new Date(`${row.spaDate}T00:00:00Z`);
          // 生年月日から到達日までの正確な年数・月数を求める
          let years = spa.getUTCFullYear() - d.getUTCFullYear();
          let months = spa.getUTCMonth() - d.getUTCMonth();
          let days = spa.getUTCDate() - d.getUTCDate();
          if (days < 0) {
            months -= 1;
            // 前月の日数を足して日数を正の値にする
            const prevMonth = new Date(Date.UTC(spa.getUTCFullYear(), spa.getUTCMonth(), 0));
            days += prevMonth.getUTCDate();
          }
          if (months < 0) { years -= 1; months += 12; }
          return {
            years,
            months,
            days,
            ageInYears: years + months / 12,
            isTransitional: true,
            spaDate: row.spaDate,
            source: "Pensions Act 2007 Sch.3 Table 4",
          };
        }
      }
      // 1961-03-06〜1977-04-05 → 67歳
      if (key >= toKey(sp.age67From)) {
        return { years: sp.ageAfterTransition, months: 0, ageInYears: sp.ageAfterTransition, isTransitional: false, spaDate: null, source: "Pensions Act 2014 s.26" };
      }
      // 1960-04-06〜1961-03-05 → 66歳＋N か月（「6日〜翌5日」を1区切りとして数える）
      if (key >= toKey(sp.transitionStart)) {
        // 区切りの開始は1960-04-06。生年月日が各月の6日以降なら当月、5日以前なら前月の区切りに属する。
        const y = d.getUTCFullYear();
        const m = d.getUTCMonth() + 1; // 1-12
        const day = d.getUTCDate();
        const windowMonth = day >= 6 ? m : m - 1;   // 属する区切りの開始月
        const windowYear = windowMonth === 0 ? y - 1 : y;
        const normalizedMonth = windowMonth === 0 ? 12 : windowMonth;
        // 1960年4月を1番目として何番目の区切りか
        const monthsFromStart = (windowYear - 1960) * 12 + (normalizedMonth - 4) + 1;
        const months = Math.min(11, Math.max(1, monthsFromStart));
        return {
          years: sp.ageBefore2026,
          months,
          ageInYears: sp.ageBefore2026 + months / 12,
          isTransitional: true,
          spaDate: null,
          source: "Pensions Act 2014 s.26",
        };
      }
      // 1960-04-05以前 → 66歳
      return { years: sp.ageBefore2026, months: 0, ageInYears: sp.ageBefore2026, isTransitional: false, spaDate: null, source: "Pensions Act 2011" };
    },
    // 自動算出を標準とし、利用者が手動で上書きした場合のみその値を使う。
    //   manualOverride が有効な数値（>0）ならそれを優先する。
    //   そうでなければ生年月日から算出し、算出できなければ defaultAge を使う。
    resolveStatePensionAge(birthDate, manualOverride) {
      const manual = Number(manualOverride);
      if (Number.isFinite(manual) && manual > 0) {
        return { ageInYears: manual, isAuto: false, detail: null };
      }
      const auto = this.getStatePensionAge(birthDate);
      if (auto) return { ageInYears: auto.ageInYears, isAuto: true, detail: auto };
      return { ageInYears: this.statePension.defaultAge, isAuto: false, detail: null };
    },
    // 繰下げ受給による増額率（State Pension age より前は増額なし＝1.0）。
    // 端数を切り捨てず比例計算する（52週 → 52/9 × 1% ≒ 5.78%増）。
    // ただし最低繰下げ週数（9週）未満の場合は増額しない。
    getDeferralFactor(claimAge, statePensionAge) {
      const sp = this.statePension;
      const deferredYears = Math.max(0, (Number(claimAge) || 0) - (Number(statePensionAge) || 0));
      const weeks = deferredYears * sp.weeksPerYear;
      if (weeks < sp.deferralMinimumWeeks) return 1;
      return 1 + (weeks / sp.deferralUnitWeeks) * sp.deferralUpliftPerNineWeeks;
    },
    // 繰下げ週数から直接増額率を求める（テスト・表示用）
    getDeferralFactorFromWeeks(weeks) {
      const sp = this.statePension;
      const w = Math.max(0, Number(weeks) || 0);
      if (w < sp.deferralMinimumWeeks) return 1;
      return 1 + (w / sp.deferralUnitWeeks) * sp.deferralUpliftPerNineWeeks;
    },
    // 英国では繰上げ受給ができないため、実際の受給開始年齢は State Pension age を下回らない
    getEffectiveClaimAge(claimAge, statePensionAge) {
      return Math.max(Number(claimAge) || 0, Number(statePensionAge) || 0);
    },
    // 年間受給額 ＝ 利用者が入力した年間受給見込額 × 繰下げ増額率
    getAnnualBenefit(estimatedAnnual, claimAge, statePensionAge) {
      return (Number(estimatedAnnual) || 0) * this.getDeferralFactor(claimAge, statePensionAge);
    },
    getFullAnnualRate() { return this.statePension.fullAnnualRate; },
    notImplemented: [
      "National Insuranceのqualifying years入力から10年最低・35年満額の単純近似は実装済み。2016年開始額、contracting-out、海外期間、credits、Protected Payment等を含む正確なState Pension forecastはGOV.UK公式記録が必要",
      "Additional State Pension（SERPS / S2P）・Protected Payment",
      "Pension Creditの2026/27 Guarantee Credit・Savings Credit基本計算に加え、単身の年齢要件、夫婦双方がqualifying ageに達する通常ルール、2019-05-14以前からのprotected mixed-age continuity / pension-age Housing Benefit継続例外を判定可能。実際の給付履歴の自動確認などを含む完全なmeans testは未実装。Guarantee Creditの住宅費・子・障害・介護・経過措置の追加額は計算可能。収入側はState Pension・私的年金・その他算入収入・資本tariff income・通常£5/夫婦£10/高額£20のearnings disregardを合算可能",
    ],
  },

  healthcare: {
    implemented: true,
    model: "regionalNhsPlusUserCosts",
    effectiveTaxYear: "2026/27",
    lastUpdated: "2026-08-21",
    sourceName: "NHS / NHSBSA / GOV.UK — health costs and adult social care",
    sourceUrl: "https://www.nhs.uk/nhs-services/help-with-health-costs/",
    sourceUrls: {
      prescriptionEngland: "https://www.nhs.uk/nhs-services/prescriptions/nhs-prescription-charges/",
      dentalEngland: "https://www.nhsbsa.nhs.uk/help-nhs-dental-costs",
      socialCareEngland: "https://www.gov.uk/government/publications/social-care-charging-for-local-authorities-2026-to-2027",
    },
    regions: ["england", "scotland", "wales", "northernIreland"],
    prescription: {
      englandChargePerItem: 9.90,
      freeRegions: ["scotland", "wales", "northernIreland"],
    },
    dentalEngland: {
      band1: 27.90,
      band2: 76.60,
      band3: 332.10,
    },
    socialCareEngland: {
      lowerCapitalLimit: 14250,
      upperCapitalLimit: 23250,
      tariffUnit: 250,
      tariffIncomePerWeekPerUnit: 1,
    },
    getPrescriptionAnnual(region, chargeableItemsAnnual, exempt = false) {
      if (exempt) return 0;
      const r = String(region || "england");
      if (this.prescription.freeRegions.includes(r)) return 0;
      return Math.max(0, Number(chargeableItemsAnnual) || 0) * this.prescription.englandChargePerItem;
    },
    getEnglandDentalAnnual(band1Courses, band2Courses, band3Courses, exempt = false) {
      if (exempt) return 0;
      const n = (v) => Math.max(0, Number(v) || 0);
      return n(band1Courses) * this.dentalEngland.band1
        + n(band2Courses) * this.dentalEngland.band2
        + n(band3Courses) * this.dentalEngland.band3;
    },
    getEnglandSocialCareAssessment(capital) {
      const c = Math.max(0, Number(capital) || 0);
      const sc = this.socialCareEngland;
      if (c > sc.upperCapitalLimit) return { status: "selfFunder", weeklyTariffIncome: 0 };
      if (c <= sc.lowerCapitalLimit) return { status: "belowLowerLimit", weeklyTariffIncome: 0 };
      const units = Math.ceil((c - sc.lowerCapitalLimit) / sc.tariffUnit);
      return { status: "meansTested", weeklyTariffIncome: units * sc.tariffIncomePerWeekPerUnit };
    },
    costItems: [
      "nhsBasicAnnual",
      "privateHealthInsuranceMonthly",
      "dentalAnnual",
      "prescriptionAnnual",
      "longTermCareAnnual",
      "otherOutOfPocketAnnual",
    ],
    getAnnualTotal(healthcare) {
      const h = healthcare || {};
      const n = (v) => Number(v) || 0;
      const region = h.region || "england";
      const prescriptionAnnual = h.prescriptionMode === "auto"
        ? this.getPrescriptionAnnual(region, h.prescriptionItemsAnnual, Boolean(h.prescriptionExempt))
        : n(h.prescriptionAnnual);
      const dentalAnnual = h.dentalMode === "auto" && region === "england"
        ? this.getEnglandDentalAnnual(h.dentalBand1Courses, h.dentalBand2Courses, h.dentalBand3Courses, Boolean(h.dentalExempt))
        : n(h.dentalAnnual);
      return n(h.nhsBasicAnnual)
        + n(h.privateHealthInsuranceMonthly) * 12
        + dentalAnnual
        + prescriptionAnnual
        + n(h.longTermCareAnnual)
        + n(h.otherOutOfPocketAnnual);
    },
    notImplemented: [
      "Scotland / Wales / Northern Ireland のNHS歯科料金の自動計算",
      "England以外の社会的介護（social care）の資力調査と地域別負担額の自動計算",
      "Englandの介護費そのものの自動算定（資産判定のみ対応。実際の負担額は自治体評価・所得等で変わる）",
    ],
  },

  tax: {
    implemented: true,
    model: "ukIncomeTaxPlusDividendPlusCgt",
    effectiveTaxYear: "2026/27",
    lastUpdated: "2026-08-22",
    sourceName: "GOV.UK / HMRC — Income Tax, National Insurance, dividends and Capital Gains Tax",
    sourceUrl: "https://www.gov.uk/income-tax-rates",
    sourceUrls: {
      incomeTax: "https://www.gov.uk/income-tax-rates",
      personalAllowance: "https://www.gov.uk/income-tax-rates/income-over-100000",
      dividend: "https://www.gov.uk/tax-on-dividends",
      capitalGains: "https://www.gov.uk/capital-gains-tax/rates",
      savings: "https://www.gov.uk/apply-tax-free-interest-on-savings",
      pensionTaxRelief: "https://www.gov.uk/tax-on-your-private-pension/pension-tax-relief",
      scotland: "https://www.gov.uk/scottish-income-tax",
      nationalInsurance: "https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2026-to-2027",
    },
    region: "United Kingdom",
    regionsImplemented: ["england", "wales", "northernIreland", "scotland"],
    // 2026/27 Scottish Income Tax（非貯蓄・非配当所得）。貯蓄・配当はUK共通税率。
    scotland: {
      implemented: true,
      bands: [
        { upTo: 3967, rate: 0.19 },
        { upTo: 16956, rate: 0.20 },
        { upTo: 31092, rate: 0.21 },
        { upTo: 62430, rate: 0.42 },
        { upTo: 112570, rate: 0.45 },
        { upTo: Infinity, rate: 0.48 },
      ],
    },
    incomeTax: {
      personalAllowance: 12570,
      personalAllowanceTaperStart: 100000,
      personalAllowanceTaperEnd: 125140,
      // 課税所得（総所得 − Personal Allowance）に対する累進バンド
      bands: [
        { upTo: 37700, rate: 0.20 },    // Basic rate（総所得 £50,270 まで）
        { upTo: 112570, rate: 0.40 },   // Higher rate（総所得 £125,140 まで）
        { upTo: Infinity, rate: 0.45 }, // Additional rate
      ],
    },
    dividend: {
      allowance: 500,
      // 2026年4月6日から基本税率・高税率が2ポイント引き上げ（Autumn Budget 2025 / Finance Act 2026）
      basicRate: 0.1075,
      higherRate: 0.3575,
      additionalRate: 0.3935,
    },
    capitalGains: {
      annualExemptAmount: 3000,
      // 2024年10月30日以降、住宅用不動産もその他資産も同率
      basicRate: 0.18,
      higherRate: 0.24,
    },
    nationalInsurance: {
      primaryThresholdAnnual: 12570,
      upperEarningsLimitAnnual: 50270,
      mainRate: 0.08,
      additionalRate: 0.02,
    },
    calculateEmployeeNationalInsurance(employmentIncome) {
      const income = Math.max(0, Number(employmentIncome) || 0);
      const ni = this.nationalInsurance;
      if (income <= ni.primaryThresholdAnnual) return 0;
      const mainBand = Math.max(0, Math.min(income, ni.upperEarningsLimitAnnual) - ni.primaryThresholdAnnual);
      const above = Math.max(0, income - ni.upperEarningsLimitAnnual);
      return mainBand * ni.mainRate + above * ni.additionalRate;
    },

    savings: {
      personalSavingsAllowanceBasic: 1000,
      personalSavingsAllowanceHigher: 500,
      personalSavingsAllowanceAdditional: 0,
      // 2027年4月から貯蓄利子の税率が 22 / 42 / 47% へ引き上げ予定。2026/27では未適用。
      scheduledRatesFrom2027: { basic: 0.22, higher: 0.42, additional: 0.47 },
    },
    // ISA内の利子・配当・譲渡益はすべて非課税
    isaTaxFree: true,
    pensionTaxRelief: {
      model: "marginalRate",
      taxFreeLumpSumRate: 0.25,
      lumpSumAllowance: 268275,
    },

    // Personal Allowance（£100,000超で£2につき£1ずつ逓減し、£125,140でゼロ）
    getPersonalAllowance(grossIncome) {
      const it = this.incomeTax;
      const g = Number(grossIncome) || 0;
      if (g <= it.personalAllowanceTaperStart) return it.personalAllowance;
      return Math.max(0, it.personalAllowance - (g - it.personalAllowanceTaperStart) / 2);
    },
    calculateIncomeTax(grossIncome) {
      const g = Number(grossIncome) || 0;
      const personalAllowance = this.getPersonalAllowance(g);
      const taxableIncome = Math.max(0, g - personalAllowance);
      let tax = 0;
      let lower = 0;
      for (const b of this.incomeTax.bands) {
        if (taxableIncome > lower) {
          tax += (Math.min(taxableIncome, b.upTo) - lower) * b.rate;
          lower = b.upTo;
        } else break;
      }
      return { personalAllowance, taxableIncome, tax };
    },
    // Scottish Income Tax：賃金・年金などの非貯蓄・非配当所得に独自バンドを適用。
    calculateScottishIncomeTax(grossIncome) {
      const g = Number(grossIncome) || 0;
      const personalAllowance = this.getPersonalAllowance(g);
      const taxableIncome = Math.max(0, g - personalAllowance);
      let tax = 0;
      let lower = 0;
      for (const b of this.scotland.bands) {
        if (taxableIncome > lower) {
          tax += (Math.min(taxableIncome, b.upTo) - lower) * b.rate;
          lower = b.upTo;
        } else break;
      }
      return { personalAllowance, taxableIncome, tax };
    },
    calculateIncomeTaxByRegion(grossIncome, region = "england") {
      return String(region).toLowerCase() === "scotland"
        ? this.calculateScottishIncomeTax(grossIncome)
        : this.calculateIncomeTax(grossIncome);
    },
    // 限界税率。£100,000〜£125,140 は Personal Allowance の逓減により実効60%となる。
    getMarginalRate(grossIncome) {
      const it = this.incomeTax;
      const g = Number(grossIncome) || 0;
      if (g > it.personalAllowanceTaperStart && g <= it.personalAllowanceTaperEnd) return 0.60;
      const { taxableIncome } = this.calculateIncomeTax(g);
      if (taxableIncome <= 0) return 0;
      if (taxableIncome <= it.bands[0].upTo) return it.bands[0].rate;
      if (taxableIncome <= it.bands[1].upTo) return it.bands[1].rate;
      return it.bands[2].rate;
    },
    // 基本税率帯の残り（譲渡益・配当を積み上げる際に使う）
    getBasicRateBandRemaining(grossIncome) {
      const { taxableIncome } = this.calculateIncomeTax(grossIncome);
      return Math.max(0, this.incomeTax.bands[0].upTo - taxableIncome);
    },
    // 配当課税：配当は所得の最上位に積み上げて税率帯を判定する
    calculateDividendTax(dividendIncome, grossIncome) {
      const taxable = Math.max(0, (Number(dividendIncome) || 0) - this.dividend.allowance);
      if (taxable <= 0) return 0;
      const it = this.incomeTax;
      const bands = [
        { upTo: it.bands[0].upTo, rate: this.dividend.basicRate },
        { upTo: it.bands[1].upTo, rate: this.dividend.higherRate },
        { upTo: Infinity, rate: this.dividend.additionalRate },
      ];
      let stack = this.calculateIncomeTax(grossIncome).taxableIncome;
      let remaining = taxable;
      let tax = 0;
      for (const b of bands) {
        if (remaining <= 0) break;
        const room = Math.max(0, b.upTo - stack);
        const amount = Math.min(remaining, room);
        tax += amount * b.rate;
        remaining -= amount;
        stack += amount;
      }
      return tax;
    },
    // 譲渡益課税：年間非課税枠を控除し、基本税率帯の残りに18%、それを超える分に24%
    calculateCapitalGainsTax(gain, grossIncome) {
      const cg = this.capitalGains;
      const taxableGain = Math.max(0, (Number(gain) || 0) - cg.annualExemptAmount);
      if (taxableGain <= 0) return 0;
      const atBasic = Math.min(taxableGain, this.getBasicRateBandRemaining(grossIncome));
      const atHigher = taxableGain - atBasic;
      return atBasic * cg.basicRate + atHigher * cg.higherRate;
    },
    // 年金拠出による所得税の軽減額（概算）＝ Annual Allowance の範囲内の拠出額 × 限界税率
    calculatePensionTaxRelief(annualPensionContribution, grossIncome, annualAllowance) {
      const contribution = Math.max(0, Number(annualPensionContribution) || 0);
      const cap = (annualAllowance === undefined || annualAllowance === null)
        ? Infinity
        : Math.max(0, Number(annualAllowance) || 0);
      return Math.min(contribution, cap) * this.getMarginalRate(grossIncome);
    },
    notImplemented: [
      "貯蓄利子への課税額計算（Personal Savings Allowanceは保持。2027年4月からの22/42/47%への引上げも未適用）",
      "2027年4月からの不動産所得税率（22/42/47%）",
      "Marriage Allowance / Married Couple's Allowance",
    ],
  },

  estate: {
    implemented: true,
    model: "ukInheritanceTaxEstimate",
    effectiveTaxYear: "2026/27",
    lastUpdated: "2026-08-21",
    sourceName: "GOV.UK / HMRC — Inheritance Tax thresholds and residence nil rate band",
    sourceUrl: "https://www.gov.uk/inheritance-tax",
    sourceUrls: {
      thresholds: "https://www.gov.uk/government/publications/inheritance-tax-thresholds/inheritance-tax-thresholds",
      residenceNilRateBand: "https://www.gov.uk/guidance/check-if-you-can-get-an-additional-inheritance-tax-threshold",
    },
    nilRateBand: 325000,
    residenceNilRateBand: 175000,
    residenceTaperThreshold: 2000000,
    standardRate: 0.40,
    charityReducedRate: 0.36,
    // 概算モデル。事業・農業財産救済、贈与、信託、国外資産等は別途専門確認が必要。
    calculateInheritanceTax({
      estateValue = 0,
      qualifyingResidenceValue = 0,
      passesResidenceToDirectDescendants = false,
      transferableNrbPercent = 0,
      transferableRnrbPercent = 0,
      spouseOrCivilPartnerExemptAmount = 0,
      charityReducedRateEligible = false,
    } = {}) {
      const estate = Math.max(0, Number(estateValue) || 0);
      const spouseExempt = Math.max(0, Number(spouseOrCivilPartnerExemptAmount) || 0);
      const nrbTransfer = Math.min(100, Math.max(0, Number(transferableNrbPercent) || 0));
      const rnrbTransfer = Math.min(100, Math.max(0, Number(transferableRnrbPercent) || 0));
      const nrb = this.nilRateBand * (1 + nrbTransfer / 100);
      const rnrbMaximum = this.residenceNilRateBand * (1 + rnrbTransfer / 100);
      const residenceValue = Math.max(0, Number(qualifyingResidenceValue) || 0);
      let rnrb = passesResidenceToDirectDescendants ? Math.min(residenceValue, rnrbMaximum) : 0;
      const taper = Math.max(0, estate - this.residenceTaperThreshold) / 2;
      rnrb = Math.max(0, rnrb - taper);
      const chargeableEstate = Math.max(0, estate - spouseExempt - nrb - rnrb);
      const rate = charityReducedRateEligible ? this.charityReducedRate : this.standardRate;
      return {
        estateValue: estate,
        nilRateBand: nrb,
        residenceNilRateBand: rnrb,
        spouseOrCivilPartnerExemptAmount: spouseExempt,
        chargeableEstate,
        rate,
        tax: chargeableEstate * rate,
      };
    },
    notImplemented: [
      "7年ルールを含む生前贈与の個別追跡",
      "Agricultural Property Relief / Business Property Reliefの個別判定",
      "信託・国外資産・long-term UK residenceの詳細判定",
    ],
  },

  labels: {
    // 英国版は投資・年金・医療費・税制のすべてを実装済みのため、未実装の注記は使用しない。
    // ただしiDeCoセクション（JP専用）内の税制表示だけは英国向けの案内文へ差し替える。
    investmentNote: null,
    retirementNote: null,
    healthcareNote: null,
    taxNote: "gbTaxHandledInInvestmentNote",
  },
  defaults: {},
};
