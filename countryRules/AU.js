// ============================================================================
// countryRules/AU.js
// App.jsx から国別ルール定義（AU_COUNTRY_RULES）をそのまま切り出したファイル。
// 数値・関数・コメントは一切変更していない（挙動・計算結果は完全に同一）。
// ============================================================================

// ---------- countryRules/AU.js 相当（オーストラリア版：実装済み） ----------
// country: AU
// lastUpdated: 2026-07-18
// source: ato.gov.au（税制・Superannuation）／ servicesaustralia.gov.au（Age Pension）
// 対象年度：2026-27会計年度（2026年7月1日〜2027年6月30日）。
//   ※オーストラリアの会計年度は7月1日開始。2026年7月13日現在、2026-27年度が進行中。
//   ※Age Pensionの給付額は毎年3月20日・9月20日に物価連動で改定される（本データは2026年3月20日改定値）。
// 制度上限・税率はすべて AU_COUNTRY_RULES 内に集約し、画面や共通計算関数へ直接書かない。
// 各セクションは effectiveTaxYear / lastUpdated / sourceName / sourceUrl を持つ。
// 【重要】このオブジェクトは JP / US / GB / CA のルールを一切参照せず、逆に参照もされない。
export const AU_COUNTRY_RULES = {
  meta: {
    verifiedAsOf: "2026-08-23",
    effectivePeriod: "2026-27 financial year",
    updateCycle: "毎年7月＋Age Pensionは3/20・9/20",
    noteJa: "2026-27年度制度を2026年8月23日に確認。Age Pensionは2026年3月20日改定値で、次回は9月20日改定を確認します。",
    noteEn: "2026-27 rules verified on 23 Aug 2026. Age Pension uses the 20 Mar 2026 rates; the next scheduled indexation is 20 Sep 2026.",
    coverage: [
      { key: "investment", labelJa: "投資制度", labelEn: "Investment", status: "partial", effective: "2026-27 financial year", lastUpdated: "2026-08-23", updateJa: "Super・投資口座・拠出上限、carry-forward、bring-forwardに加え、適格確認式のDownsizer contribution（最大A$300,000）を今年度一括拠出として反映。", updateEn: "Super, investment accounts and contribution caps are modelled, including concessional carry-forward, non-concessional bring-forward, and an eligibility-confirmed one-off downsizer contribution of up to A$300,000." },
      { key: "retirement", labelJa: "年金・退職口座", labelEn: "Pension / retirement", status: "partial", effective: "2026-27 / Age Pension Mar 2026 rates / Rent Assistance & CSHC Jul 2026 rates", lastUpdated: "2026-08-23", updateJa: "Age Pensionの資産・所得テスト、Work Bonus、Rent Assistance、CSHCに加え、カップルで片方だけ67歳以上の場合の配偶者Super除外を年齢進行に合わせて投影へ統合。", updateEn: "Age Pension means tests, Work Bonus, Rent Assistance and CSHC are modelled, with dynamic partner-Super exclusion integrated when only one member of a couple has reached Age Pension age." },
      { key: "healthcare", labelJa: "医療", labelEn: "Healthcare", status: "partial", effective: "2026-27 / 2026 calendar-year Safety Nets / Support at Home Jul 2026", lastUpdated: "2026-08-23", updateJa: "Medicare・2026年PBS/Medicare Safety Netに加え、Support at Homeの2026年7月拠出率・閾値・lifetime capを反映。複雑なServices Australia資力判定は手動入力を併用。", updateEn: "Adds the July 2026 Support at Home contribution schedule, thresholds and lifetime caps to the Medicare/PBS model. Complex Services Australia means-assessment outcomes remain manual inputs." },
      { key: "tax", labelJa: "税金", labelEn: "Tax", status: "partial", effective: "2026-27 financial year", lastUpdated: "2026-08-23", updateJa: "居住者所得税・LITO・SAPTO・Medicare levy・MLS・CGT・非居住者所得税に加え、Super一時金のtaxed elementについて60歳未満の基本税率を反映。", updateEn: "Resident income tax, LITO, SAPTO, Medicare levy, MLS, CGT and foreign-resident income tax are modelled, together with the core under-60 tax treatment for the taxed element of Super lump sums." },
      { key: "estate", labelJa: "相続", labelEn: "Estate", status: "partial", effective: "2026-27", lastUpdated: "2026-08-21", updateJa: "オーストラリアには相続税はありません。Super death benefitの一括受取について、death benefits dependant / non-dependant別の税額概算を実装。所得ストリーム・遺産管理人経由などの詳細税務は未自動化。", updateEn: "Australia has no inheritance tax. A lump-sum Super death-benefit estimator now models tax for death-benefits dependants versus non-dependants; income streams and detailed deceased-estate treatment remain manual." },
    ],
  },
  investment: {
    implemented: true,
    effectiveTaxYear: "2026-27",
    lastUpdated: "2026-08-23",
    sourceName: "Australian Taxation Office (ATO) — Key superannuation rates and thresholds",
    sourceUrl: "https://www.ato.gov.au/tax-rates-and-codes/key-superannuation-rates-and-thresholds",
    sourceUrls: {
      contributionsCaps: "https://www.ato.gov.au/tax-rates-and-codes/key-superannuation-rates-and-thresholds/contributions-caps",
      carryForward: "https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/growing-and-keeping-track-of-your-super/caps-limits-and-tax-on-super-contributions/concessional-contributions-cap",
      bringForward: "https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/growing-and-keeping-track-of-your-super/caps-limits-and-tax-on-super-contributions/bring-forward-arrangements",
      paymentsFromSuper: "https://www.ato.gov.au/tax-rates-and-codes/key-superannuation-rates-and-thresholds/payments-from-super",
      superGuarantee: "https://www.ato.gov.au/businesses-and-organisations/super-for-employers/paying-super-contributions/how-much-super-to-pay",
      preservationAge: "https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/withdrawing-and-using-your-super",
      fhss: "https://www.ato.gov.au/law/view/document?LocID=%22TXR%2FTR20244%2FNAT%2FATO%2F00001%22",
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
      downsizerContributionMax: 300000,
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

    // First Home Super Saver (FHSS): eligible voluntary contributions are limited to
    // A$15,000 per financial year and A$50,000 overall. Releasable contribution amounts are
    // 100% of eligible non-concessional contributions and 85% of eligible concessional contributions.
    // The caller must provide contribution entries in the statutory ordering already determined for
    // that financial year; associated earnings are calculated by the ATO and are not reconstructed here.
    firstHomeSuperSaver: {
      annualEligibleContributionLimit: 15000,
      overallEligibleContributionLimit: 50000,
      concessionalReleaseRate: 0.85,
      nonConcessionalReleaseRate: 1.00,
      taxOffsetRateOnAssessableReleasedAmount: 0.30,
    },

    // ---------- 計算関数（すべて純関数） ----------
    _num(v) { return Number(v) || 0; },
    calculateFhssReleasableContributions(entries = []) {
      const cfg = this.firstHomeSuperSaver;
      const usedByYear = new Map();
      let includedContributions = 0;
      let releasableContributions = 0;
      const details = [];

      for (const raw of Array.isArray(entries) ? entries : []) {
        if (includedContributions >= cfg.overallEligibleContributionLimit) break;
        const financialYear = String(raw?.financialYear || "").trim();
        if (!financialYear) continue;
        const type = raw?.type === "nonConcessional" ? "nonConcessional"
          : raw?.type === "concessional" ? "concessional" : null;
        if (!type) continue;
        const amount = Math.max(0, this._num(raw?.amount));
        if (amount <= 0) continue;

        const usedThisYear = usedByYear.get(financialYear) || 0;
        const annualRoom = Math.max(0, cfg.annualEligibleContributionLimit - usedThisYear);
        const overallRoom = Math.max(0, cfg.overallEligibleContributionLimit - includedContributions);
        const included = Math.min(amount, annualRoom, overallRoom);
        if (included <= 0) continue;

        const rate = type === "concessional"
          ? cfg.concessionalReleaseRate
          : cfg.nonConcessionalReleaseRate;
        const releasable = included * rate;
        usedByYear.set(financialYear, usedThisYear + included);
        includedContributions += included;
        releasableContributions += releasable;
        details.push({ financialYear, type, contributed: amount, included, releasable });
      }

      return {
        includedContributions,
        releasableContributions,
        associatedEarningsIncluded: false,
        maximumContributionLimitReached:
          includedContributions >= cfg.overallEligibleContributionLimit,
        details,
      };
    },
    getConcessionalCap() { return this.limits.concessionalCap; },
    // Carry-forward unused concessional cap amounts:
    // ATO上で現在利用可能と表示される未使用枠を入力してもらい、前年6/30時点の
    // total super balance が $500,000 未満の場合だけ今年度上限へ加算する。
    // 過去5年の各年度履歴・失効順はATO側で既に反映された「available amount」を使うため、
    // アプリ側で履歴を推測しない。
    getCarryForwardAvailable(priorYearTotalSuperBalance, availableUnusedCap) {
      const balance = Math.max(0, this._num(priorYearTotalSuperBalance));
      const available = Math.max(0, this._num(availableUnusedCap));
      return balance < this.limits.carryForwardBalanceThreshold ? available : 0;
    },
    getEffectiveConcessionalCap(priorYearTotalSuperBalance, availableUnusedCap) {
      return this.limits.concessionalCap
        + this.getCarryForwardAvailable(priorYearTotalSuperBalance, availableUnusedCap);
    },
    getNonConcessionalCap() { return this.limits.nonConcessionalCap; },
    getTransferBalanceCapStatus(retirementPhaseBalance, personalTransferBalanceCap = 0) {
      const general = this.limits.transferBalanceCap;
      const personal = Math.max(0, this._num(personalTransferBalanceCap)) || general;
      const cap = Math.min(personal, general);
      const balance = Math.max(0, this._num(retirementPhaseBalance));
      return { cap, balance, excess: Math.max(0, balance - cap), remaining: Math.max(0, cap - balance) };
    },
    // Bring-forward arrangement (non-concessional contributions):
    // The ATO table is derived from the general Transfer Balance Cap (TBC).
    // If the prior 30 June TSB is below TBC - 2×NCC, up to 3 years can be brought forward;
    // below TBC - 1×NCC, up to 2 years; below TBC, only the ordinary annual cap; at/above TBC, nil.
    // We do not reconstruct an existing bring-forward period. If the user elects to use the ATO figure,
    // the app uses the current-year available amount shown by the ATO and caps it at this structural maximum.
    getBringForwardStructuralCap(priorYearTotalSuperBalance) {
      const balance = Math.max(0, this._num(priorYearTotalSuperBalance));
      const ncc = this.limits.nonConcessionalCap;
      const tbc = this.limits.transferBalanceCap;
      if (balance >= tbc) return 0;
      if (balance < tbc - 2 * ncc) return 3 * ncc;
      if (balance < tbc - ncc) return 2 * ncc;
      return ncc;
    },
    getEffectiveNonConcessionalCap(age, priorYearTotalSuperBalance, useAtoBringForwardCap = false, atoAvailableCap = 0) {
      const structural = this.getBringForwardStructuralCap(priorYearTotalSuperBalance);
      if (!useAtoBringForwardCap) return Math.min(this.limits.nonConcessionalCap, structural);
      if ((Number(age) || 0) >= 75) return Math.min(this.limits.nonConcessionalCap, structural);
      const ato = Math.max(0, this._num(atoAvailableCap));
      return Math.min(ato, structural);
    },
    getBringForwardOneOffApplied(age, priorYearTotalSuperBalance, useAtoBringForwardCap, atoAvailableCap, recurringNonConcessional, requestedOneOff) {
      const effective = this.getEffectiveNonConcessionalCap(age, priorYearTotalSuperBalance, useAtoBringForwardCap, atoAvailableCap);
      const recurring = Math.min(Math.max(0, this._num(recurringNonConcessional)), this.limits.nonConcessionalCap);
      const room = Math.max(0, effective - recurring);
      return Math.min(Math.max(0, this._num(requestedOneOff)), room);
    },
    // Downsizer contribution: from age 55, up to A$300,000 per person from eligible home-sale proceeds.
    // It does not count toward the non-concessional contribution cap. Eligibility includes the home/proceeds/
    // ownership-period and timing rules, so the app requires the user to confirm eligibility rather than infer it.
    getDownsizerContribution(age, eligible, requestedAmount) {
      const a = Number(age) || 0;
      if (a < 55 || eligible !== true) return 0;
      return Math.min(Math.max(0, this._num(requestedAmount)), this.limits.downsizerContributionMax);
    },
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
    // 【安全側の扱い】concessional cap を超えた税引前拠出は、実際には
    //   ・超過分が課税所得に加算され、限界税率で課税される
    //   ・すでに引かれた15%は税額控除される
    //   ・超過分は「Superに残す」か「85%まで払い戻す」かを本人が選べる
    //   ・繰越拠出（carry-forward）枠があれば、そもそも超過にならない
    // という複雑な処理になる。本アプリはこれらを実装していないため、
    // 投影では「通常の税引前拠出として扱う額」を cap までに制限する（安全側＝残高を過大にしない）。
    // 超過分は投影に一切入らない。notImplemented と画面注記に明記すること。
    getCappedConcessional(annualSalary, voluntaryConcessional, priorYearTotalSuperBalance = 0, availableUnusedCap = 0) {
      return Math.min(
        this.getTotalConcessional(annualSalary, voluntaryConcessional),
        this.getEffectiveConcessionalCap(priorYearTotalSuperBalance, availableUnusedCap)
      );
    },
    getConcessionalRemaining(annualSalary, voluntaryConcessional, priorYearTotalSuperBalance = 0, availableUnusedCap = 0) {
      return this.getEffectiveConcessionalCap(priorYearTotalSuperBalance, availableUnusedCap)
        - this.getTotalConcessional(annualSalary, voluntaryConcessional);
    },
    getNonConcessionalRemaining(nonConcessionalContribution, age = 0, priorYearTotalSuperBalance = 0, useAtoBringForwardCap = false, atoAvailableCap = 0, requestedOneOff = 0) {
      const effective = this.getEffectiveNonConcessionalCap(age, priorYearTotalSuperBalance, useAtoBringForwardCap, atoAvailableCap);
      const requestedRecurring = Math.max(0, this._num(nonConcessionalContribution));
      const oneOff = this.getBringForwardOneOffApplied(age, priorYearTotalSuperBalance, useAtoBringForwardCap, atoAvailableCap, requestedRecurring, requestedOneOff);
      return effective - requestedRecurring - oneOff;
    },
    // Superへアクセスできるか（preservation age = 60歳以上）。
    // 【注意】これは「preservation age に達しているか」だけを見る従来の判定で、
    //   資産区分の表示（splitAssets）に使う。実際の取り崩し可否は
    //   canAccessSuperAt(age, retired) を使うこと。
    canAccessSuper(age) {
      return (Number(age) || 0) >= this.preservationAge;
    },
    // 実際に取り崩せるか。condition of release を反映する。
    //   ・60歳未満              ：不可
    //   ・60〜64歳              ：退職等の condition of release を満たしている場合のみ可
    //   ・65歳以降              ：就労状況に関わらず無条件で可
    // simulateGrowth と lifePlanEngine の双方がこの同じ判定を使う。
    canAccessSuperAt(age, retired) {
      const a = Number(age) || 0;
      if (a >= this.unrestrictedAccessAge) return true;
      return a >= this.preservationAge && !!retired;
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
    // 取崩し順：Cash Savings → Investment Account → Superannuation
    //   （utils/simulations.js の ACCOUNT_DRAW_CATEGORY.AU = cash → taxable → restricted と
    //     完全に一致させること。ここが食い違うと、パネルのプレビューと lifePlanEngine の
    //     本計算で取崩し順が変わり、結果が一致しなくなる）
    //   Superは preservation age に達するまで取り崩せない。
    //
    // 【Division 293】税引前拠出への追加15%。呼び出し側が tax セクションで算出した
    //   年額（div293TaxAnnual）と支払元（div293PaidFrom）を渡す。
    //   ・"super"   ：Superへ入る額から差し引く（口座へ入る前に控除）
    //   ・"outside" ：Cash Savings →（不足分は）Investment Account から差し引く
    //   いずれの場合も総資産は税額分だけ減る。拠出が続いている年だけ課税される。
    simulateGrowth({
      currentAge, retireAge, deathAge, accounts, annualWithdrawalNeeded,
      annualSalary, voluntaryConcessional, contributionsTaxRate, earningsTaxAccumulation,
      div293TaxAnnual, div293PaidFrom, listoAnnual, coContributionAnnual,
      carryForwardPriorYearBalance, carryForwardAvailableUnusedCap,
      bringForwardUseAtoCap, bringForwardAvailableCap, bringForwardOneOffContribution,
      downsizerEligible, downsizerContribution,
    }) {
      const keys = this.accountTypes;
      const contribTax = (contributionsTaxRate === undefined || contributionsTaxRate === null) ? 0.15 : Number(contributionsTaxRate);
      const div293Annual = Math.max(0, Number(div293TaxAnnual) || 0);
      const div293FromSuper = div293PaidFrom !== "outside";
      const earnTax = (earningsTaxAccumulation === undefined || earningsTaxAccumulation === null) ? 0.15 : Number(earningsTaxAccumulation);
      const listo = Math.max(0, Number(listoAnnual) || 0);
      const coContribution = Math.max(0, Number(coContributionAnnual) || 0);
      const recurringNcc = Math.min(
        Math.max(0, Number((accounts.superannuation || {}).annualContribution) || 0),
        this.limits.nonConcessionalCap
      );
      const bringForwardOneOff = this.getBringForwardOneOffApplied(
        currentAge, carryForwardPriorYearBalance, bringForwardUseAtoCap === true,
        bringForwardAvailableCap, recurringNcc, bringForwardOneOffContribution
      );
      const downsizerOneOff = this.getDownsizerContribution(currentAge, downsizerEligible === true, downsizerContribution);

      const balances = {}, contributions = {}, rates = {}, endAges = {}, withdrawalTax = {};
      keys.forEach((k) => {
        const a = accounts[k] || {};
        balances[k] = Number(a.currentValue) || 0;
        contributions[k] = Number(a.annualContribution) || 0;
        rates[k] = (Number(a.expectedReturnPct) || 0) / 100;
        endAges[k] = Number(a.contributionEndAge) || 0;
        // 引出時課税（%）。lifePlanEngine と同じ扱いにするため、ここでも税引後の手取りで計算する。
        // Superは60歳以降の引き出しが非課税なので既定0%。
        withdrawalTax[k] = Math.min(99, Math.max(0, Number(a.withdrawalTaxPct) || 0)) / 100;
      });
      // Superへの税引前拠出（SG＋任意拠出）は15%課税後に口座へ入る。
      // ただし concessional cap を超えた分は投影に入れない（getCappedConcessional 参照）。
      // 超過分の限界税率課税・15%税額控除・払戻し／残留の選択・繰越拠出は未実装のため、
      // 残高を過大に見せない安全側の扱いにしている。
      // 【concessional cap】超過分の課税・払戻し／残留の選択は未実装のため、
      // 通常の税引前拠出として投影する額を cap までに制限する（安全側）。
      const concessionalGross = this.getCappedConcessional(
        annualSalary, voluntaryConcessional,
        carryForwardPriorYearBalance, carryForwardAvailableUnusedCap
      );
      // Division 293 を Super から払う場合、口座へ入る額がその分だけ減る（0で下げ止まる）。
      const concessionalNet = Math.max(
        0,
        concessionalGross * (1 - contribTax) - (div293FromSuper ? div293Annual : 0)
      );

      const withdrawalOrder = ["cashSavings", "investmentAccount", "superannuation"];
      const totalOf = (b) => keys.reduce((s, k) => s + b[k], 0);
      const startAge = Math.round(currentAge);
      const endAge = Math.round(deathAge);
      let withdrawalTaxPaid = 0;
      let div293TaxPaid = 0;
      const yearly = [{
        age: startAge, value: totalOf(balances), accounts: { ...balances },
        minimumDrawdown: 0, minimumDrawdownTax: 0, withdrawalTaxPaid: 0,
      }];

      for (let age = startAge + 1; age <= endAge; age++) {
        // 退職フェーズか（preservation age以降かつ退職後）。運用益が非課税になる。
        // pension phase（運用益非課税・最低取崩し義務）は、退職して preservation age に
        // 達していることが前提。取り崩しの可否とは判定が別であることに注意。
        const retired = age > retireAge;
        const inRetirementPhase = retired && this.canAccessSuper(age);
        // 実際に取り崩せるか：60〜64歳は退職が条件、65歳以降は無条件。
        const superAccessible = this.canAccessSuperAt(age, retired);

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
            balances[k] += concessionalNet + (k === "superannuation" ? recurringNcc : contributions[k]) + listo + coContribution
              + (age === startAge + 1 ? bringForwardOneOff + downsizerOneOff : 0); // 一括拠出は初年度だけ反映
          } else {
            balances[k] += contributions[k];
          }
        });

        // Division 293 を口座外から払う場合：Superは満額入るかわりに、
        // 現金 →（不足分は）投資口座 の順に同額を差し引く。
        // 拠出が続いている年だけ課税されるので、Superの拠出終了年齢で止める。
        if (!div293FromSuper && div293Annual > 0 && age <= endAges.superannuation) {
          let remaining = div293Annual;
          for (const k of ["cashSavings", "investmentAccount"]) {
            if (remaining <= 0) break;
            const taken = Math.min(balances[k], remaining);
            balances[k] -= taken;
            remaining -= taken;
          }
          div293TaxPaid += div293Annual - remaining;
        } else if (div293FromSuper && div293Annual > 0 && age <= endAges.superannuation) {
          div293TaxPaid += Math.min(
            div293Annual,
            concessionalGross * (1 - contribTax)
          );
        }

        // 退職フェーズでの最低取崩し（引き出した額は投資口座へ移し、生活費に充てられる状態にする）
        let minimumDrawdown = 0, minimumDrawdownTax = 0;
        if (inRetirementPhase && balances.superannuation > 0) {
          minimumDrawdown = Math.min(
            balances.superannuation,
            this.getMinimumDrawdown(age, balances.superannuation)
          );
          const net = minimumDrawdown * (1 - withdrawalTax.superannuation);
          minimumDrawdownTax = minimumDrawdown - net;
          balances.superannuation -= minimumDrawdown;
          balances.investmentAccount += net;
        }
        withdrawalTaxPaid += minimumDrawdownTax;

        if (age > retireAge) {
          // 必要額は「手取り」ベース。課税口座からは 必要額 ÷ (1 − 税率) を引き出す。
          let remaining = Number(annualWithdrawalNeeded) || 0;
          for (const key of withdrawalOrder) {
            if (remaining <= 0) break;
            if (key === "superannuation" && !superAccessible) continue;
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
          minimumDrawdown, minimumDrawdownTax, withdrawalTaxPaid,
        });
      }
      return {
        yearly, finalValue: totalOf(balances), finalAccounts: { ...balances },
        withdrawalTaxPaid, div293TaxPaid,
      };
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
      "Concessional cap 超過分の扱い：超過額は課税所得に加算されて限界税率で課税され、"
        + "すでに引かれた15%が税額控除される。さらに超過分をSuperに残すか85%まで払い戻すかを"
        + "選択できるが、いずれも未実装。投影では安全側として、通常の税引前拠出として扱う額を"
        + "concessional cap までに制限し、超過分は投影に入れていない",
      "繰越拠出（carry-forward）はATOオンラインサービスに表示される現在利用可能額を入力して反映済み。過去5年の各年度履歴をアプリ内で自動再構成する機能は未実装",
      "Bring-forwardはATO表示の今年度利用可能額を入力して初年度の一括拠出へ反映済み。既に開始済みの2年/3年bring-forward期間について、過年度の拠出履歴をアプリ内で自動再構成する機能は未実装",
      "Transfer Balance Capは個人上限・退職フェーズ残高を入力して超過/残枠を判定済み。超過transfer balance earnings taxとcommutationの自動投影は未実装",
      "First Home Super Saver (FHSS)は年A$15,000・通算A$50,000と85%/100%のreleasable contribution計算を実装済み。ATOが算定するassociated earnings、最終determination、実際のrelease authority・住宅購入期限などは未自動化",
      "Downsizer contributionは55歳以上かつATOの適格要件を満たすことを本人確認した場合、今年度一括額として最大A$300,000を反映済み。自宅保有10年・主たる住居CGT要件・売却代金・90日以内拠出等の資格条件の完全自動判定は未実装",
    ],
  },

  retirement: {
    implemented: true,
    effectiveTaxYear: "2026-27",
    lastUpdated: "2026-08-23",
    sourceName: "Services Australia — Age Pension（給付額は2026年3月20日改定値、資産・所得基準は2026年7月1日改定値）",
    sourceUrl: "https://www.servicesaustralia.gov.au/age-pension",
    sourceUrls: {
      howMuch: "https://www.servicesaustralia.gov.au/how-much-age-pension-you-can-get",
      incomeTest: "https://www.servicesaustralia.gov.au/income-test-for-age-pension",
      assetsTest: "https://www.servicesaustralia.gov.au/assets-test-for-age-pension",
      eligibility: "https://www.servicesaustralia.gov.au/who-can-get-age-pension",
      residence: "https://www.servicesaustralia.gov.au/who-can-get-age-pension",
      overseas: "https://www.servicesaustralia.gov.au/when-you-leave-australia-if-you-get-age-pension",
      rentAssistance: "https://www.servicesaustralia.gov.au/rent-assistance",
      seniorsHealthCard: "https://www.servicesaustralia.gov.au/commonwealth-seniors-health-card",
    },
    accountTypes: ["agePension"],
    isSuperAssessableForAgePension(personAge, isReceivingSuperPension = false) {
      const age = Math.max(0, Number(personAge) || 0);
      return age >= this.agePension.qualifyingAge || !!isReceivingSuperPension;
    },
    projectPartnerSuperBalance({
      currentAge = 0,
      targetAge = 0,
      currentBalance = 0,
      annualContribution = 0,
      expectedReturnPct = 0,
      contributionEndAge = 67,
    } = {}) {
      let balance = Math.max(0, Number(currentBalance) || 0);
      const start = Math.max(0, Number(currentAge) || 0);
      const target = Math.max(start, Number(targetAge) || start);
      const annual = Math.max(0, Number(annualContribution) || 0);
      const endAge = Math.max(start, Number(contributionEndAge) || start);
      const r = Math.max(-0.99, (Number(expectedReturnPct) || 0) / 100);
      const years = Math.max(0, Math.floor(target - start));
      for (let i = 0; i < years; i += 1) {
        const age = start + i;
        if (age < endAge) balance += annual;
        balance *= (1 + r);
      }
      return Math.max(0, balance);
    },
    getProjectedPartnerAge(currentPartnerAge, claimantCurrentAge, claimantTargetAge) {
      return Math.max(0, (Number(currentPartnerAge) || 0) + ((Number(claimantTargetAge) || 0) - (Number(claimantCurrentAge) || 0)));
    },
    getAssessableCoupleSuper({
      claimantAge = 0,
      claimantSuper = 0,
      claimantReceivingSuperPension = false,
      partnerAge = 0,
      partnerSuper = 0,
      partnerReceivingSuperPension = false,
    } = {}) {
      const clean = (v) => Math.max(0, Number(v) || 0);
      const claimantAssessable = this.isSuperAssessableForAgePension(claimantAge, claimantReceivingSuperPension)
        ? clean(claimantSuper) : 0;
      const partnerAssessable = this.isSuperAssessableForAgePension(partnerAge, partnerReceivingSuperPension)
        ? clean(partnerSuper) : 0;
      return { claimantAssessable, partnerAssessable, combinedAssessable: claimantAssessable + partnerAssessable };
    },
    agePension: {
      // 受給資格年齢（引き上げは2023年7月に完了し、67歳で確定）
      qualifyingAge: 67,
      fortnightsPerYear: 26,
      // 最大給付額（2026年3月20日〜9月19日。年金補助・エネルギー補助を含む）
      maxFortnightlySingle: 1200.90,
      maxFortnightlyCoupleEach: 905.20,
      // 所得テスト：無影響枠を超えた分を逓減。
      // 【重要】公表されている「1ドルにつき50セント」「1,000ドルにつき隔週3ドル」は
      //   いずれも“世帯合計”の減額幅。カップルの給付額は1人あたりで管理するため、
      //   1人あたりの逓減率はその半分（所得25セント／資産隔週1.50ドル）になる。
      //   世帯合計の率を1人あたりの満額へ適用すると、約2倍の減額になってしまう。
      incomeFreeAreaFortnightlySingle: 226,
      incomeFreeAreaFortnightlyCoupleCombined: 396,
      incomeTaperPerDollarSingle: 0.50,
      incomeTaperPerDollarCouplePerPerson: 0.25,
      // 資産テスト：無影響枠を超えた1,000ドルごとの隔週減額（1人あたり）
      assetsFreeAreaSingleHomeowner: 333000,
      assetsFreeAreaSingleNonHomeowner: 600000,
      assetsFreeAreaCoupleHomeowner: 499000,
      assetsFreeAreaCoupleNonHomeowner: 766000,
      assetsTaperPerThousandFortnightlySingle: 3,
      assetsTaperPerThousandFortnightlyCouplePerPerson: 1.5,
      // 2026年7月1日からの公表カットオフ（Rent Assistance等による上乗せなしの標準ケース）。
      // 連続式から逆算すると端数処理等で公表値と数百ドルずれるため、表示・境界判定は公表値を優先する。
      assetsCutOffSingleHomeowner: 733500,
      assetsCutOffSingleNonHomeowner: 1000500,
      assetsCutOffCoupleHomeowner: 1102500,
      assetsCutOffCoupleNonHomeowner: 1369500,
      incomeCutOffFortnightlySingle: 2627.80,
      incomeCutOffFortnightlyCoupleCombined: 4016.80,
      // Work Bonus：就労収入のうち、所得テストから除外される年額
      workBonusFortnightly: 300,
      workBonusMaxBalance: 11800,
      workBonusNewRecipientBalance: 4000,
      // Rent Assistance（1 July–19 September 2026 rates）。
      // Age Pension等の主給付に上乗せされ、最大支給率の一部として所得・資産テストの対象となる。
      rentAssistance: {
        ratePerDollarAboveThreshold: 0.75,
        single: { thresholdFortnightly: 154.80, maxFortnightly: 219.40 },
        singleSharer: { thresholdFortnightly: 154.80, maxFortnightly: 146.27 },
        coupleCombined: { thresholdFortnightly: 250.80, maxFortnightly: 206.80 },
      },
      // Commonwealth Seniors Health Card (1 July 2026 income limits).
      // Income test uses annual adjusted taxable income plus deemed income from account-based income streams.
      // There is no assets test. Residence / identity / TFN / income-support conditions are not inferred.
      commonwealthSeniorsHealthCard: {
        singleAnnualLimit: 101105,
        coupleCombinedAnnualLimit: 161768,
        separatedCoupleCombinedAnnualLimit: 202210,
        dependentChildAnnualAdd: 639.60,
      },
    },
    // Deeming（みなし収入）：金融資産は実際の運用益ではなく、みなし利率で所得を算定する。
    //   レートは2026年3月20日から、しきい値は2026年7月1日から。
    //   対象（financial investments）：Super（受給資格年齢以降）・預金・現金・定期預金・
    //     上場株式・管理投資・債権・貸付金・金/銀/プラチナの地金。
    //   対象外：自宅・家財・自動車・投資用不動産（不動産の実収入は別途所得テストに算入）。
    deeming: {
      lowerRate: 0.0125,
      upperRate: 0.0325,
      thresholdSingle: 66800,
      thresholdCoupleCombined: 110600,
    },

    // Age Pension residence eligibility helper.
    // Normal rule: resident and in Australia on claim day, with 10 years total
    // Australian residence and at least 5 years continuous. Exemptions and
    // international social-security agreements can satisfy the residence gateway.
    getAgePensionResidenceEligibility({
      australianResident = false,
      inAustraliaOnClaimDay = false,
      residenceYearsTotal = 0,
      longestContinuousResidenceYears = 0,
      residenceExemption = false,
      internationalAgreementEligible = false,
    } = {}) {
      const total = Math.max(0, Number(residenceYearsTotal) || 0);
      const continuous = Math.max(0, Number(longestContinuousResidenceYears) || 0);
      const normalResidence = australianResident === true
        && inAustraliaOnClaimDay === true
        && total >= 10
        && continuous >= 5;
      const eligible = normalResidence
        || residenceExemption === true
        || internationalAgreementEligible === true;
      return {
        eligible,
        normalResidence,
        australianResident: australianResident === true,
        inAustraliaOnClaimDay: inAustraliaOnClaimDay === true,
        residenceYearsTotal: total,
        longestContinuousResidenceYears: continuous,
        residenceExemption: residenceExemption === true,
        internationalAgreementEligible: internationalAgreementEligible === true,
      };
    },
    getAgePensionEligibility({
      age = 0,
      australianResident = false,
      inAustraliaOnClaimDay = false,
      residenceYearsTotal = 0,
      longestContinuousResidenceYears = 0,
      residenceExemption = false,
      internationalAgreementEligible = false,
    } = {}) {
      const ageEligible = (Number(age) || 0) >= this.agePension.qualifyingAge;
      const residence = this.getAgePensionResidenceEligibility({
        australianResident,
        inAustraliaOnClaimDay,
        residenceYearsTotal,
        longestContinuousResidenceYears,
        residenceExemption,
        internationalAgreementEligible,
      });
      return { ...residence, ageEligible, eligible: ageEligible && residence.eligible };
    },
    // After more than 26 weeks overseas, the basic means-tested Age Pension rate
    // is generally proportional to Australian Working Life Residence (AWLR),
    // capped at 35 years. Grandfathering / agreement cases can bypass the reduction.
    getOverseasAgePensionPortabilityFactor({
      weeksOutsideAustralia = 0,
      australianWorkingLifeResidenceYears = 35,
      grandfatheredFullRate = false,
      internationalAgreementOverride = false,
    } = {}) {
      const weeks = Math.max(0, Number(weeksOutsideAustralia) || 0);
      if (weeks <= 26 || grandfatheredFullRate === true || internationalAgreementOverride === true) return 1;
      const years = Math.max(0, Number(australianWorkingLifeResidenceYears) || 0);
      return Math.min(1, years / 35);
    },
    getQualifyingAge() { return this.agePension.qualifyingAge; },
    // Deemingのしきい値（カップルは世帯合算）
    getDeemingThreshold(status) {
      const d = this.deeming;
      return status === "couple" ? d.thresholdCoupleCombined : d.thresholdSingle;
    },
    // 金融資産からのみなし収入（年額）。しきい値までは下限レート、超過分は上限レート。
    getDeemedIncomeAnnual(financialAssets, status) {
      const d = this.deeming;
      const assets = Math.max(0, Number(financialAssets) || 0);
      const threshold = this.getDeemingThreshold(status);
      const lower = Math.min(assets, threshold);
      const upper = Math.max(0, assets - threshold);
      return lower * d.lowerRate + upper * d.upperRate;
    },
    // Rent Assistance（世帯合計）。持家・対象外住宅なら0。
    // ここではAge Pension世帯で一般的な「子なし」の率を扱う。単身のシェア居住は専用上限を使用。
    getRentAssistanceFortnightly({ status, homeowner, eligible, rentFortnightly, sharer = false } = {}) {
      if (homeowner || !eligible) return 0;
      const rent = Math.max(0, Number(rentFortnightly) || 0);
      const rules = this.agePension.rentAssistance;
      const rule = status === "couple"
        ? rules.coupleCombined
        : (sharer ? rules.singleSharer : rules.single);
      const excessRent = Math.max(0, rent - rule.thresholdFortnightly);
      return Math.min(rule.maxFortnightly, excessRent * rules.ratePerDollarAboveThreshold);
    },
    getRentAssistanceHouseholdAnnual(args = {}) {
      return this.getRentAssistanceFortnightly(args) * this.agePension.fortnightsPerYear;
    },
    // Commonwealth Seniors Health Card (CSHC) income-test helper.
    // Services Australia tests ATI plus deemed income from account-based income streams.
    // The card has no assets test. Other qualification conditions are explicit user confirmations.
    getCshcIncomeLimit(status = "single", illnessSeparated = false, dependentChildren = 0) {
      const c = this.agePension.commonwealthSeniorsHealthCard;
      const children = Math.max(0, Math.floor(Number(dependentChildren) || 0));
      let base = c.singleAnnualLimit;
      if (status === "couple") {
        base = illnessSeparated ? c.separatedCoupleCombinedAnnualLimit : c.coupleCombinedAnnualLimit;
      }
      return base + children * c.dependentChildAnnualAdd;
    },
    getCshcAssessableIncome(adjustedTaxableIncome = 0, deemedAccountBasedIncome = 0) {
      return Math.max(0, Number(adjustedTaxableIncome) || 0)
        + Math.max(0, Number(deemedAccountBasedIncome) || 0);
    },
    isCshcIncomeEligible({ status = "single", illnessSeparated = false, dependentChildren = 0, adjustedTaxableIncome = 0, deemedAccountBasedIncome = 0 } = {}) {
      const income = this.getCshcAssessableIncome(adjustedTaxableIncome, deemedAccountBasedIncome);
      const limit = this.getCshcIncomeLimit(status, illnessSeparated, dependentChildren);
      return income < limit;
    },
    getCshcEligibility({
      age, status = "single", illnessSeparated = false, dependentChildren = 0,
      adjustedTaxableIncome = 0, deemedAccountBasedIncome = 0,
      residenceEligible = false, noOtherIncomeSupport = false, agePensionAnnual = 0,
    } = {}) {
      const income = this.getCshcAssessableIncome(adjustedTaxableIncome, deemedAccountBasedIncome);
      const limit = this.getCshcIncomeLimit(status, illnessSeparated, dependentChildren);
      const ageEligible = (Number(age) || 0) >= this.agePension.qualifyingAge;
      const notReceivingIncomeSupport = noOtherIncomeSupport === true && (Number(agePensionAnnual) || 0) <= 0;
      const eligible = ageEligible && residenceEligible === true && notReceivingIncomeSupport && income < limit;
      return { eligible, ageEligible, residenceEligible: residenceEligible === true, notReceivingIncomeSupport, income, limit };
    },

    // 最大給付額（年額）。カップルは「1人あたり」の額を返す（世帯合計はこの2倍）。
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
    // 逓減率（1人あたり）。カップルは世帯合計の半分。
    getIncomeTaperPerDollar(status) {
      const p = this.agePension;
      return status === "couple" ? p.incomeTaperPerDollarCouplePerPerson : p.incomeTaperPerDollarSingle;
    },
    getAssetsTaperPerThousandFortnightly(status) {
      const p = this.agePension;
      return status === "couple"
        ? p.assetsTaperPerThousandFortnightlyCouplePerPerson
        : p.assetsTaperPerThousandFortnightlySingle;
    },
    // 所得テストの無影響枠（年額）
    getIncomeFreeAreaAnnual(status) {
      const p = this.agePension;
      const fortnightly = status === "couple"
        ? p.incomeFreeAreaFortnightlyCoupleCombined
        : p.incomeFreeAreaFortnightlySingle;
      return fortnightly * p.fortnightsPerYear;
    },
    // Work Bonus：就労・対象自営業収入だけに適用。年額入力のライフプランでは、
    // $300 × 26 fortnights の通常除外に、利用者が入力した現在のWork Bonus残高を加える。
    // 実際のCentrelinkは隔週で残高を増減するため、これは年次投影用の近似。
    getWorkBonusExcludedAnnual(employmentIncomeAnnual, workBonusBalance = 0) {
      const p = this.agePension;
      const employment = Math.max(0, Number(employmentIncomeAnnual) || 0);
      const balance = Math.min(p.workBonusMaxBalance, Math.max(0, Number(workBonusBalance) || 0));
      const standard = p.workBonusFortnightly * p.fortnightsPerYear;
      return Math.min(employment, standard + balance);
    },
    getAssessableEmploymentIncomeAnnual(employmentIncomeAnnual, workBonusBalance = 0) {
      const employment = Math.max(0, Number(employmentIncomeAnnual) || 0);
      return Math.max(0, employment - this.getWorkBonusExcludedAnnual(employment, workBonusBalance));
    },
    // 所得テストによる給付額（年額）。
    getAgePensionByIncomeTest(annualIncome, status, supplementPerPersonAnnual = 0) {
      const max = this.getMaxAnnual(status) + Math.max(0, Number(supplementPerPersonAnnual) || 0);
      const excess = Math.max(0, (Number(annualIncome) || 0) - this.getIncomeFreeAreaAnnual(status));
      return Math.max(0, max - excess * this.getIncomeTaperPerDollar(status));
    },
    // 資産テストによる給付額（年額）
    getAgePensionByAssetsTest(assessableAssets, status, homeowner, supplementPerPersonAnnual = 0) {
      const p = this.agePension;
      const max = this.getMaxAnnual(status) + Math.max(0, Number(supplementPerPersonAnnual) || 0);
      const excess = Math.max(0, (Number(assessableAssets) || 0) - this.getAssetsFreeArea(status, homeowner));
      const reductionPerYear = (excess / 1000)
        * this.getAssetsTaperPerThousandFortnightly(status)
        * p.fortnightsPerYear;
      return Math.max(0, max - reductionPerYear);
    },
    // 給付が完全に打ち切られる資産額（カットオフ）。テストと画面表示で共有する。
    getAssetsCutOff(status, homeowner) {
      const p = this.agePension;
      if (status === "couple") {
        return homeowner ? p.assetsCutOffCoupleHomeowner : p.assetsCutOffCoupleNonHomeowner;
      }
      return homeowner ? p.assetsCutOffSingleHomeowner : p.assetsCutOffSingleNonHomeowner;
    },
    // 給付が完全に打ち切られる年間所得（カットオフ）。
    // Services Australiaが公表する隔週カットオフを年額化して返す。
    getIncomeCutOffAnnual(status) {
      const p = this.agePension;
      const fortnightly = status === "couple"
        ? p.incomeCutOffFortnightlyCoupleCombined
        : p.incomeCutOffFortnightlySingle;
      return fortnightly * p.fortnightsPerYear;
    },
    // 所得テストに算入する所得＝利用者が入力したその他の年収 ＋ 金融資産のみなし収入。
    // financialAssets を渡さなければみなし収入は0として扱う（従来の呼び出しと互換）。
    getAssessableIncomeAnnual(annualIncome, financialAssets, status, employmentIncomeAnnual = 0, workBonusBalance = 0) {
      return (Number(annualIncome) || 0)
        + this.getAssessableEmploymentIncomeAnnual(employmentIncomeAnnual, workBonusBalance)
        + this.getDeemedIncomeAnnual(financialAssets, status);
    },
    // 実際の給付額（1人あたり年額）＝ 所得テストと資産テストの「低い方」。
    // 受給資格年齢未満はゼロ。
    getAgePension({
      age, annualIncome, employmentIncomeAnnual, workBonusBalance, assessableAssets, financialAssets,
      status, homeowner, bothQualified, rentAssistanceEligible = false, rentFortnightly = 0, rentAssistanceSharer = false,
    }) {
      if ((Number(age) || 0) < this.agePension.qualifyingAge) return 0;
      const income = this.getAssessableIncomeAnnual(annualIncome, financialAssets, status, employmentIncomeAnnual, workBonusBalance);
      const recipients = this.getHouseholdRecipients(status, bothQualified);
      const rentAssistanceHouseholdAnnual = this.getRentAssistanceHouseholdAnnual({
        status, homeowner, eligible: rentAssistanceEligible, rentFortnightly, sharer: rentAssistanceSharer,
      });
      const supplementPerPersonAnnual = recipients > 0 ? rentAssistanceHouseholdAnnual / recipients : 0;
      const byIncome = this.getAgePensionByIncomeTest(income, status, supplementPerPersonAnnual);
      const byAssets = this.getAgePensionByAssetsTest(assessableAssets, status, homeowner, supplementPerPersonAnnual);
      return Math.min(byIncome, byAssets);
    },
    // 世帯合計の給付額（年額）。生活費を世帯合計で扱っているため、投影に入れる年金収入も
    // 世帯合計に揃える。カップルで双方が受給資格年齢に達している場合だけ2人分になる。
    //   status !== "couple" → 1人分
    //   status === "couple" かつ bothQualified === false → 1人分（片方だけが受給）
    // ※ カップルで片方が受給資格年齢未満の場合、その人の積立フェーズSuperは
    //   資産・Deeming対象から除外する。buildPlanInput側で配偶者年齢を毎年進め、
    //   67歳到達またはSuper income stream開始時に自動で対象へ切り替える。
    getAgePensionHousehold({
      age, annualIncome, employmentIncomeAnnual, workBonusBalance, assessableAssets, financialAssets, status, homeowner, bothQualified,
      rentAssistanceEligible = false, rentFortnightly = 0, rentAssistanceSharer = false,
    }) {
      const perPerson = this.getAgePension({
        age, annualIncome, employmentIncomeAnnual, workBonusBalance, assessableAssets, financialAssets, status, homeowner, bothQualified,
        rentAssistanceEligible, rentFortnightly, rentAssistanceSharer,
      });
      const recipients = (status === "couple" && bothQualified !== false) ? 2 : 1;
      return perPerson * recipients;
    },
    getHouseholdRecipients(status, bothQualified) {
      return (status === "couple" && bothQualified !== false) ? 2 : 1;
    },
    // 【画面表示用】Age Pensionを「受給資格年齢に到達した時点の投影資産」で算定する（純関数）。
    // 投影（lifePlanEngine）側は毎ステップその時点の資産で再判定するため、この値は
    // 「受給を開始する時点の見込額」であって、投影期間を通じた固定額ではない。
    // 取り崩し額そのものがAge Pensionに依存して循環するため、2パスに分ける。
    //   パス1：Age Pensionを一切見込まない取り崩し額で資産を投影し、受給資格年齢時点の総資産を得る
    //   パス2：その資産額で所得テスト・資産テストを行い、給付額を確定する
    // 投影中の毎年の再判定は lifePlanEngine 側が行う。
    // investmentRules は同じ AU_COUNTRY_RULES.investment を呼び出し側から渡す
    // （他国のルールは参照しないという原則を保つため、内部で import はしない）。
    projectAgePension({
      investmentRules, contributionsTaxRate, earningsTaxAccumulation,
      currentAge, retireAge, deathAge, accounts,
      annualSalary, voluntaryConcessional, div293TaxAnnual, div293PaidFrom,
      expensesAnnual, healthcareAnnual, otherAnnualIncome,
      status, homeowner, bothQualified,
      rentAssistanceEligible = false, rentFortnightly = 0, rentAssistanceSharer = false,
    }) {
      const qualifyingAge = this.getQualifyingAge();
      const other = Number(otherAnnualIncome) || 0;
      let assessableAssets = 0;
      if (investmentRules && typeof investmentRules.simulateGrowth === "function") {
        const needWithoutPension = Math.max(
          0, (Number(expensesAnnual) || 0) + (Number(healthcareAnnual) || 0) - other
        );
        const sim = investmentRules.simulateGrowth({
          currentAge,
          retireAge,
          // 想定寿命が受給資格年齢より手前でも、判定年齢までは投影する
          deathAge: Math.max(Number(deathAge) || 0, qualifyingAge),
          accounts,
          annualWithdrawalNeeded: needWithoutPension,
          annualSalary,
          voluntaryConcessional,
          contributionsTaxRate,
          earningsTaxAccumulation,
          // Division 293 の分だけ資産が減るので、資産テストの判定にも同じ前提を使う
          div293TaxAnnual,
          div293PaidFrom,
        });
        const target = Math.round(qualifyingAge);
        // すでに受給資格年齢を過ぎている場合は先頭行（＝現在の資産）で判定する
        const row = sim.yearly.find((y) => y.age === target) || sim.yearly[0] || { value: 0 };
        assessableAssets = Math.max(0, Number(row.value) || 0);
      }
      // 画面カードでも投影と同じ判定を使う：資産テストの対象資産＝投影総資産、
      // 所得テストには金融資産のみなし収入（Deeming）を加算する。
      // ここでの financialAssets は投影総資産と同じ（自宅を資産として保持していないため）。
      const perPerson = this.getAgePension({
        age: qualifyingAge,
        annualIncome: other,
        assessableAssets,
        financialAssets: assessableAssets,
        status,
        homeowner,
        bothQualified,
        rentAssistanceEligible,
        rentFortnightly,
        rentAssistanceSharer,
      });
      const recipients = this.getHouseholdRecipients(status, bothQualified);
      const deemedIncomeAnnual = this.getDeemedIncomeAnnual(assessableAssets, status);
      return {
        qualifyingAge,
        assessableAssets,
        deemedIncomeAnnual,
        recipients,
        // 1人あたりの年額
        agePensionPerPersonAnnual: perPerson,
        // 世帯合計の年額（投影に入るのはこちら）
        agePensionAnnual: perPerson * recipients,
      };
    },
    notImplemented: [
      "Rent Assistanceは子なし世帯（単身・単身シェア・カップル合算）の2026年7月率を実装済み。扶養児童あり・疾病別居・一時別居などの特殊率は未実装",
      "Transitional rate pension（2009年以前からの受給者への経過措置）",
      // 【A-2】投影中のAge Pensionは lifePlanEngine 側で毎ステップ再判定している
      //   （publicPensions.monthlyAmountAt + assessedPoolIds）。
      //   projectAgePension は画面カードに出す「受給開始時点の見込額」を求めるためのもので、
      //   投影値そのものではない。
      "Work Bonus残高は年次近似で反映済み。Centrelinkの隔週単位での残高増減・雇用収入発生日ごとの厳密計算は未実装",
      "カップルのSuperは、Age Pension年齢未満かつincome stream未開始なら資産・所得テストから除外する基本判定を実装済み。特殊なincome stream商品や免除判定は未実装",
      "投資用不動産の実収入（Deemingの対象外だが所得テストには算入される）",
      "カップルで片方だけが受給資格年齢に達している場合、配偶者の積立フェーズSuper除外は投影へ統合済み。特殊なincome stream商品・免除判定は未実装",
      "Age Pensionの通常居住要件（10年合計・うち5年連続）と26週超海外滞在時の35年AWLR按分は判定ヘルパーを実装済み。難民等の個別免除・国際社会保障協定・2014年経過措置の最終判定は利用者確認が必要 / Commonwealth Seniors Health Cardは2026年7月の所得上限で見込み判定を実装済み。居住・TFN・本人確認・特例カード等の完全自動判定は未実装",
    ],
  },

  healthcare: {
    implemented: true,
    // Medicare（公的医療保険）を土台にした自己負担モデル。
    // 2026年のPBS Safety Netは、標準的な最大自己負担額を使った概算を選択できる。
    // Medicare Safety Netは、診療ごとのMBS schedule fee / 実請求額が必要なため、
    // 閾値を表示するに留め、gapAnnualを機械的に減額しない（過小評価防止）。
    model: "medicareWithPbs2026AndSafetyNetReference",
    effectiveTaxYear: "2026-27",
    lastUpdated: "2026-08-23",
    sourceName: "Australian Government — Medicare / PBS Safety Nets / Support at Home",
    sourceUrl: "https://www.health.gov.au/topics/medicare/about/safety-nets",
    sourceUrls: {
      medicare: "https://www.servicesaustralia.gov.au/medicare",
      medicareSafetyNets: "https://www.health.gov.au/topics/medicare/about/safety-nets",
      pbsSafetyNet: "https://www.servicesaustralia.gov.au/pbs-safety-net-thresholds",
      supportAtHome: "https://www.health.gov.au/resources/publications/schedule-of-contributions-for-support-at-home-services",
    },
    pbs2026: {
      effectiveCalendarYear: "2026",
      general: { maxCopayBeforeSafetyNet: 25.00, safetyNetThreshold: 1748.20, copayAfterSafetyNet: 7.70 },
      concessional: { maxCopayBeforeSafetyNet: 7.70, safetyNetThreshold: 277.20, copayAfterSafetyNet: 0.00 },
    },
    medicareSafetyNet2026: {
      originalThreshold: 594.40,
      extendedThresholdConcessionalOrFtbA: 861.20,
      extendedThresholdGeneral: 2699.10,
      extendedBenefitRate: 0.80,
      greatestPermissibleGapFrom20251101: 104.50,
    },
    // Support at Home participant contributions — Schedule from 1 July 2026.
    // Clinical services are government-funded at 0%.
    // For part pensioners / CSHC holders, Services Australia determines the exact rate
    // from income and assets. If no assessed rate is supplied, use the statutory maximum
    // as a conservative planning estimate so costs are not understated.
    supportAtHome2026: {
      effectiveFrom: "2026-07-01",
      standard: {
        fullPensioner: { clinical: 0, independence: 0.05, everydayLiving: 0.175 },
        partPensionerOrCshc: {
          clinical: 0,
          independenceMin: 0.05,
          independenceMax: 0.50,
          everydayLivingMin: 0.175,
          everydayLivingMax: 0.80,
        },
        selfFundedRetiree: { clinical: 0, independence: 0.50, everydayLiving: 0.80 },
      },
      noWorseOff: {
        fullPensioner: { clinical: 0, independence: 0, everydayLiving: 0 },
        partPensionerOrCshc: {
          clinical: 0,
          independenceMin: 0,
          independenceMax: 0.25,
          everydayLivingMin: 0,
          everydayLivingMax: 0.25,
        },
        selfFundedRetiree: { clinical: 0, independence: 0.25, everydayLiving: 0.25 },
      },
      nonPensionIncomeThresholds: {
        single: { min: 5876, max: 101105 },
        coupleCombined: { min: 10296, max: 161768 },
        illnessSeparatedCoupleCombined: { min: 10296, max: 202210 },
      },
      assetThresholds: {
        singleHomeowner: { min: 333000, max: 943442.31 },
        singleNonHomeowner: { min: 600000, max: 1210442.31 },
        coupleHomeownerCombined: { min: 499000, max: 1469974.36 },
        coupleNonHomeownerCombined: { min: 766000, max: 1736974.36 },
        illnessSeparatedCoupleHomeownerCombined: { min: 499000, max: 1729217.95 },
        illnessSeparatedCoupleNonHomeownerCombined: { min: 766000, max: 1996217.95 },
      },
      lifetimeCap: 137917.01,
      noWorseOffLifetimeCap: 86185.23,
      deeming: {
        singleThreshold: 66800,
        coupleOnePensionerThreshold: 110600,
        coupleNoPensionThreshold: 55300,
        lowerRate: 0.0125,
        higherRate: 0.0325,
      },
    },
    getSupportAtHomeContributionRates({
      status = "fullPensioner",
      noWorseOff = false,
      assessedIndependenceRate,
      assessedEverydayLivingRate,
    } = {}) {
      const schedule = noWorseOff ? this.supportAtHome2026.noWorseOff : this.supportAtHome2026.standard;
      if (status === "selfFundedRetiree") return { ...schedule.selfFundedRetiree };
      if (status !== "partPensionerOrCshc") return { ...schedule.fullPensioner };
      const cfg = schedule.partPensionerOrCshc;
      const clamp = (value, min, max) => {
        const n = Number(value);
        if (!Number.isFinite(n)) return max;
        return Math.max(min, Math.min(max, n));
      };
      return {
        clinical: 0,
        independence: clamp(assessedIndependenceRate, cfg.independenceMin, cfg.independenceMax),
        everydayLiving: clamp(assessedEverydayLivingRate, cfg.everydayLivingMin, cfg.everydayLivingMax),
      };
    },
    getSupportAtHomeAnnualContribution({
      clinicalAnnual = 0,
      independenceAnnual = 0,
      everydayLivingAnnual = 0,
      status = "fullPensioner",
      noWorseOff = false,
      assessedIndependenceRate,
      assessedEverydayLivingRate,
      priorLifetimeContributions = 0,
    } = {}) {
      const rates = this.getSupportAtHomeContributionRates({
        status,
        noWorseOff,
        assessedIndependenceRate,
        assessedEverydayLivingRate,
      });
      const annual = Math.max(0, Number(clinicalAnnual) || 0) * rates.clinical
        + Math.max(0, Number(independenceAnnual) || 0) * rates.independence
        + Math.max(0, Number(everydayLivingAnnual) || 0) * rates.everydayLiving;
      const cap = noWorseOff
        ? this.supportAtHome2026.noWorseOffLifetimeCap
        : this.supportAtHome2026.lifetimeCap;
      return Math.min(
        Math.max(0, annual),
        Math.max(0, cap - Math.max(0, Number(priorLifetimeContributions) || 0))
      );
    },
    costItems: [
      "gapAnnual",
      "privateHealthInsuranceMonthly",
      "pharmaceuticalAnnual",
      "dentalAnnual",
      "opticalAnnual",
      "agedCareAnnual",
      "otherOutOfPocketAnnual",
    ],
    // PBS対象薬をすべて上限自己負担額で購入する前提の簡易推計。
    // 実際は薬価・ブランド差額・Safety Net記録状況等で異なるため「概算」として扱う。
    getPbsAnnualOutOfPocket({ prescriptionsAnnual, concessional } = {}) {
      const count = Math.max(0, Math.floor(Number(prescriptionsAnnual) || 0));
      if (count <= 0) return 0;
      const rule = concessional ? this.pbs2026.concessional : this.pbs2026.general;
      let paid = 0;
      for (let i = 0; i < count; i++) {
        if (paid + 1e-9 >= rule.safetyNetThreshold) {
          paid += rule.copayAfterSafetyNet;
        } else {
          paid += rule.maxCopayBeforeSafetyNet;
        }
        paid = Math.round(paid * 100) / 100;
      }
      return paid;
    },
    getPharmaceuticalAnnual(healthcare) {
      const h = healthcare || {};
      if ((h.pbsMode || "manual") !== "estimate") return Number(h.pharmaceuticalAnnual) || 0;
      return this.getPbsAnnualOutOfPocket({
        prescriptionsAnnual: h.pbsPrescriptionsAnnual,
        concessional: Boolean(h.pbsConcessional),
      });
    },
    getAgedCareAnnual(healthcare) {
      const h = healthcare || {};
      if ((h.agedCareMode || "manual") !== "supportAtHome") return Number(h.agedCareAnnual) || 0;
      return this.getSupportAtHomeAnnualContribution({
        clinicalAnnual: h.supportAtHomeClinicalAnnual,
        independenceAnnual: h.supportAtHomeIndependenceAnnual,
        everydayLivingAnnual: h.supportAtHomeEverydayLivingAnnual,
        status: h.supportAtHomeStatus,
        noWorseOff: Boolean(h.supportAtHomeNoWorseOff),
        assessedIndependenceRate: h.supportAtHomeAssessedIndependenceRate,
        assessedEverydayLivingRate: h.supportAtHomeAssessedEverydayLivingRate,
        priorLifetimeContributions: h.supportAtHomePriorLifetimeContributions,
      });
    },
    getAnnualTotal(healthcare) {
      const h = healthcare || {};
      const n = (v) => Number(v) || 0;
      return n(h.gapAnnual)
        + n(h.privateHealthInsuranceMonthly) * 12
        + this.getPharmaceuticalAnnual(h)
        + n(h.dentalAnnual)
        + n(h.opticalAnnual)
        + this.getAgedCareAnnual(h)
        + n(h.otherOutOfPocketAnnual);
    },
    notImplemented: [
      "Medicare levyの家族所得による減免は税計算側で実装済み。年途中の婚姻・離婚・免除日数などの日割り計算は未実装",
      "Medicare Safety Netの診療ごとの自動還付計算（MBS schedule feeと実請求額が必要）",
      "Support at Homeの標準/NWOP拠出率・主要閾値・lifetime capは実装済み。Part pensioner/CSHCの正確なServices Australia資力判定、Residential aged careの個別means assessmentは未自動化",
    ],
  },

  tax: {
    implemented: true,
    model: "australiaIncomeTaxPlusMedicareLevy",
    effectiveTaxYear: "2026-27",
    lastUpdated: "2026-08-23",
    sourceName: "Australian Taxation Office (ATO) — Tax rates for Australian and foreign residents / LITO / SAPTO",
    sourceUrl: "https://www.ato.gov.au/tax-rates-and-codes/tax-rates-australian-residents",
    sourceUrls: {
      incomeTax: "https://www.ato.gov.au/tax-rates-and-codes/tax-rates-australian-residents",
      foreignResidentTax: "https://www.ato.gov.au/tax-rates-and-codes/tax-rates-foreign-residents",
      medicareLevy: "https://www.ato.gov.au/individuals-and-families/medicare-and-private-health-insurance/medicare-levy",
      capitalGains: "https://www.ato.gov.au/individuals-and-families/investments-and-assets/capital-gains-tax",
      lito: "https://www.ato.gov.au/individuals-and-families/income-deductions-offsets-and-records/tax-offsets/low-income-tax-offset",
      div293: "https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/growing-your-super/how-to-save-more-in-your-super/division-293-tax",
      listo: "https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/growing-and-keeping-track-of-your-super/how-to-save-more-in-your-super/government-super-contributions/low-income-super-tax-offset",
      coContribution: "https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/growing-and-keeping-track-of-your-super/how-to-save-more-in-your-super/government-super-contributions/super-co-contributions",
      sapto: "https://www.ato.gov.au/individuals-and-families/income-deductions-offsets-and-records/tax-offsets/seniors-and-pensioners-tax-offset",
      medicareLevySurcharge: "https://www.privatehealth.gov.au/health_insurance/surcharges_incentives/medicare_levy.htm",
      studyLoan: "https://www.studyassist.gov.au/managing-and-repaying-your-loan/loan-repayments",
    },
    region: "Australian and foreign residents (working holiday makers are separate and not modelled here)",
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
    // Foreign resident rates for 2026-27. No tax-free threshold applies.
    // The first rate follows the second resident personal tax rate for 2024-25 and later.
    foreignResidentIncomeTax: {
      bands: [
        { upTo: 135000, rate: 0.30 },
        { upTo: 190000, rate: 0.37 },
        { upTo: Infinity, rate: 0.45 },
      ],
    },
    medicareLevy: {
      rate: 0.02,
      // 2026-27年度固有の低所得閾値はまだ公表されていないため、
      // 2025-26から適用される最新の法定閾値を継続使用する。
      // 単身者：通常 A$28,011 / SAPTO対象 A$44,268。
      // phase-in は閾値超過額の10%と通常2%の小さい方。
      lowIncomeThresholds: {
        effectiveFrom: "2025-26",
        ordinarySingle: { lower: 28011, upper: 35013 },
        saptoSingle: { lower: 44268, upper: 55335 },
        // 2025-26から適用される家族低所得閾値。2026-27の新しい閾値が未公表のため最新法定値を使用。
        // Medicare Levy Act s8(2) により、家族の場合は「家族所得が閾値を超えた額の10%」が
        // 個人の通常levy額の上限となる。扶養子・学生1人ごとに閾値を加算する。
        ordinaryFamily: { lower: 47238, dependentIncrement: 4338 },
        saptoFamily: { lower: 61623, dependentIncrement: 4338 },
      },
      phaseInRate: 0.10,
    },
    // Medicare Levy Surcharge (MLS), 2026-27.
    // incomeForSurcharge は taxable income と同一とは限らないため、呼出側で明示値を渡せる。
    medicareLevySurcharge: {
      effectiveTaxYear: "2026-27",
      singleThresholds: [105000, 123000, 164000],
      familyThresholds: [210000, 246000, 328000],
      rates: [0, 0.01, 0.0125, 0.015],
      dependentChildIncrementAfterFirst: 1500,
    },
    calculateMedicareLevySurcharge(incomeForSurcharge, options = {}) {
      if (options.hasAppropriateHospitalCover === true) return 0;
      const income = Math.max(0, Number(incomeForSurcharge) || 0);
      const family = options.family === true;
      const children = Math.max(0, Math.floor(Number(options.dependentChildren) || 0));
      const cfg = this.medicareLevySurcharge;
      const extra = family ? Math.max(0, children - 1) * cfg.dependentChildIncrementAfterFirst : 0;
      const thresholds = (family ? cfg.familyThresholds : cfg.singleThresholds).map((x) => x + extra);
      let rate = 0;
      if (income > thresholds[2]) rate = cfg.rates[3];
      else if (income > thresholds[1]) rate = cfg.rates[2];
      else if (income > thresholds[0]) rate = cfg.rates[1];
      const uncoveredDays = Math.max(0, Math.min(365, Number(options.uncoveredDays ?? 365) || 0));
      return income * rate * (uncoveredDays / 365);
    },

    // Study and training support loans (HELP/VSL/SSL等) 2026-27。
    // 2025-26以降は限界返済方式。repayment income は taxable income と異なるため、
    // 呼出側で明示値を渡せる。入力0の場合のみ課税所得を概算利用する。
    studyLoan: {
      effectiveTaxYear: "2026-27",
      minimumRepaymentIncome: 69528,
      secondThreshold: 129717,
      firstMarginalRate: 0.15,
      secondMarginalRate: 0.17,
      totalIncomeCapRate: 0.10,
    },
    calculateStudyLoanCompulsoryRepayment(repaymentIncome, debtBalance = Infinity) {
      const income = Math.max(0, Number(repaymentIncome) || 0);
      const debt = Number.isFinite(Number(debtBalance)) ? Math.max(0, Number(debtBalance) || 0) : Infinity;
      const cfg = this.studyLoan;
      if (income <= cfg.minimumRepaymentIncome || debt <= 0) return 0;
      const firstBand = Math.max(0, Math.min(income, cfg.secondThreshold) - cfg.minimumRepaymentIncome);
      const secondBand = Math.max(0, income - cfg.secondThreshold);
      const marginal = firstBand * cfg.firstMarginalRate + secondBand * cfg.secondMarginalRate;
      const capped = Math.min(marginal, income * cfg.totalIncomeCapRate);
      return Math.min(debt, Math.max(0, capped));
    },

    // Low Income Tax Offset (LITO)。非還付型で、所得税本体を0未満にはしない。
    lowIncomeTaxOffset: {
      maximum: 700,
      fullOffsetIncomeMax: 37500,
      firstTaperIncomeMax: 45000,
      eligibilityIncomeMax: 66667,
      firstTaperRate: 0.05,
      secondBandBase: 325,
      secondTaperRate: 0.015,
    },
    // Seniors and Pensioners Tax Offset (SAPTO)。
    // ATO公表の区分別上限・shade-out・cut-outを保持する。
    // eligibility は年齢だけでは決まらないため、呼出側が eligible=true を明示した場合だけ適用する。
    seniorsAndPensionersTaxOffset: {
      shadeOutRate: 0.125,
      statuses: {
        single: { maximum: 2230, shadeOutThreshold: 34919, cutOutThreshold: 52759 },
        couple: { maximum: 1602, shadeOutThreshold: 30994, cutOutThreshold: 43810 },
        illnessSeparated: { maximum: 2040, shadeOutThreshold: 33732, cutOutThreshold: 50052 },
      },
    },
    // Superannuationの税制
    superannuation: {
      contributionsTaxRate: 0.15,           // 税引前拠出への課税
      earningsTaxAccumulation: 0.15,        // 積立期の運用益への課税
      earningsTaxRetirementPhase: 0.00,     // 退職フェーズの運用益（Transfer Balance Capの範囲内）
      withdrawalTaxAfter60: 0.00,           // 60歳以降の引き出しは非課税（課税済みファンドの場合）
      div293Threshold: 250000,              // 所得＋拠出額がこの額を超えると
      div293AdditionalRate: 0.15,           //   税引前拠出に追加15%（合計30%）
      division296: { largeBalanceThreshold: 3000000, veryLargeBalanceThreshold: 10000000, largeAdditionalRate: 0.15, veryLargeAdditionalRate: 0.25 },
      lowRateCap: 260000,                   // 60歳未満の一時金の低税率枠（2026年7月1日から）
      // Low Income Super Tax Offset (LISTO)：低所得者の税引前拠出に対する政府のSuper上乗せ。
      // ATI <= A$37,000、15%相当、最大A$500。算定額が0超A$10未満ならA$10。
      // 年齢・ビザ・10% eligible income test等は呼出側で eligible=true を明示した場合だけ適用する。
      listo: { incomeMax: 37000, rate: 0.15, maximum: 500, minimum: 10 },
      // Government super co-contribution 2026-27。個人の税引後拠出に対し50%、最大A$500。
      // 所得がA$49,293を超えると最大額が逓減し、A$64,293以上で0。
      // 年齢・ビザ・10% eligible income test・税申告・TSB・non-concessional cap等は
      // 呼出側で eligible=true を明示した場合だけ適用する。
      coContribution: { lowerIncomeThreshold: 49293, higherIncomeThreshold: 64293, matchRate: 0.50, maximum: 500, minimum: 20 },
    },
    // Division 296 (2026-27〜): realised earningsのうちTSBがA$3m超に対応する部分へ追加課税。
    // A$3m〜A$10m部分は15%、A$10m超部分は合計25%の追加税率。損失年はこの簡易計算では0。
    calculateDivision296Tax(totalSuperBalance, realisedEarnings) {
      const balance = Math.max(0, Number(totalSuperBalance) || 0);
      const earnings = Math.max(0, Number(realisedEarnings) || 0);
      const d = this.superannuation.division296;
      if (balance <= d.largeBalanceThreshold || earnings <= 0) return { tax: 0, tier1Tax: 0, tier2Tax: 0 };
      const tier1Balance = Math.max(0, Math.min(balance, d.veryLargeBalanceThreshold) - d.largeBalanceThreshold);
      const tier2Balance = Math.max(0, balance - d.veryLargeBalanceThreshold);
      const tier1Tax = earnings * (tier1Balance / balance) * d.largeAdditionalRate;
      const tier2Tax = earnings * (tier2Balance / balance) * d.veryLargeAdditionalRate;
      return { tax: tier1Tax + tier2Tax, tier1Tax, tier2Tax };
    },
    // LISTO（Low Income Super Tax Offset）。eligibility は年齢・ビザ・10% income test等を含むため、
    // 呼出側で eligible=true を明示した場合だけ算定する。
    calculateLowIncomeSuperTaxOffset(adjustedTaxableIncome, concessionalContributions, eligible = false) {
      if (!eligible) return 0;
      const income = Math.max(0, Number(adjustedTaxableIncome) || 0);
      const contributions = Math.max(0, Number(concessionalContributions) || 0);
      const cfg = this.superannuation.listo;
      if (income > cfg.incomeMax || contributions <= 0) return 0;
      const raw = Math.min(cfg.maximum, contributions * cfg.rate);
      return raw > 0 && raw < cfg.minimum ? cfg.minimum : raw;
    },
    // Government super co-contribution。eligibilityの完全判定には税申告・年齢・ビザ・
    // 10% eligible income test・前年TSB・non-concessional cap等が必要なため、
    // 呼出側で eligible=true を明示した場合だけ算定する。
    calculateGovernmentSuperCoContribution(totalIncome, personalAfterTaxContribution, eligible = false) {
      if (!eligible) return 0;
      const income = Math.max(0, Number(totalIncome) || 0);
      const contribution = Math.max(0, Number(personalAfterTaxContribution) || 0);
      const cfg = this.superannuation.coContribution;
      if (contribution <= 0 || income >= cfg.higherIncomeThreshold) return 0;
      const contributionBased = Math.min(cfg.maximum, contribution * cfg.matchRate);
      let incomeBasedMaximum = cfg.maximum;
      if (income > cfg.lowerIncomeThreshold) {
        const range = cfg.higherIncomeThreshold - cfg.lowerIncomeThreshold;
        incomeBasedMaximum = Math.max(0, cfg.maximum * (cfg.higherIncomeThreshold - income) / range);
      }
      const raw = Math.min(contributionBased, incomeBasedMaximum);
      return raw > 0 && raw < cfg.minimum ? cfg.minimum : raw;
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
    // Foreign residents have no tax-free threshold and generally do not pay the Medicare levy.
    // This function therefore returns income tax only; offsets and levy are intentionally excluded.
    calculateForeignResidentIncomeTax(taxableIncome) {
      const income = Math.max(0, Number(taxableIncome) || 0);
      let tax = 0;
      let lower = 0;
      for (const b of this.foreignResidentIncomeTax.bands) {
        if (income > lower) {
          tax += (Math.min(income, b.upTo) - lower) * b.rate;
          lower = b.upTo;
        } else break;
      }
      return tax;
    },
    // Super member lump-sum tax — taxable component, taxed element only.
    // Tax-free component is always tax free. For a taxed fund:
    // - age 60+: taxable taxed element is tax free;
    // - below preservation age: maximum income-tax rate is 20% + Medicare levy (22% withholding);
    // - preservation age to 59: amount within the remaining low-rate cap is nil,
    //   excess is capped at 15% + Medicare levy (17% withholding).
    // The low-rate cap is A$260,000 for 2026-27 and is a lifetime cap.
    // Actual final income tax can be lower than these maximum rates because statutory tax offsets apply.
    calculateSuperLumpSumTaxedElement({
      age = 0,
      taxedElement = 0,
      taxFreeComponent = 0,
      preservationAge = 60,
      lowRateCapRemaining = null,
    } = {}) {
      const a = Math.max(0, Number(age) || 0);
      const taxed = Math.max(0, Number(taxedElement) || 0);
      const taxFree = Math.max(0, Number(taxFreeComponent) || 0);
      const pAge = Math.max(0, Number(preservationAge) || this.superannuation?.preservationAge || 60);
      const configuredLowRateCap = Math.max(0, Number(this.superannuation?.lowRateCap) || 0);
      const remaining = lowRateCapRemaining === null || lowRateCapRemaining === undefined || lowRateCapRemaining === ""
        ? configuredLowRateCap
        : Math.min(configuredLowRateCap, Math.max(0, Number(lowRateCapRemaining) || 0));

      if (taxed <= 0 || a >= 60) {
        return {
          age: a,
          preservationAge: pAge,
          taxFreeComponent: taxFree,
          taxedElement: taxed,
          lowRateCapRemaining: remaining,
          lowRateCapApplied: 0,
          taxableAtMaximumRate: 0,
          maximumRateIncludingMedicare: 0,
          estimatedMaximumTax: 0,
          netAfterEstimatedMaximumTax: taxFree + taxed,
          basis: a >= 60 ? "taxed-element-age-60-plus-tax-free" : "no-taxed-element",
        };
      }

      if (a < pAge) {
        const rate = 0.22;
        const tax = taxed * rate;
        return {
          age: a,
          preservationAge: pAge,
          taxFreeComponent: taxFree,
          taxedElement: taxed,
          lowRateCapRemaining: remaining,
          lowRateCapApplied: 0,
          taxableAtMaximumRate: taxed,
          maximumRateIncludingMedicare: rate,
          estimatedMaximumTax: tax,
          netAfterEstimatedMaximumTax: taxFree + taxed - tax,
          basis: "under-preservation-age-taxed-element",
        };
      }

      const lowRateCapApplied = Math.min(taxed, remaining);
      const excess = Math.max(0, taxed - lowRateCapApplied);
      const rate = 0.17;
      const tax = excess * rate;
      return {
        age: a,
        preservationAge: pAge,
        taxFreeComponent: taxFree,
        taxedElement: taxed,
        lowRateCapRemaining: remaining,
        lowRateCapApplied,
        taxableAtMaximumRate: excess,
        maximumRateIncludingMedicare: excess > 0 ? rate : 0,
        estimatedMaximumTax: tax,
        netAfterEstimatedMaximumTax: taxFree + taxed - tax,
        basis: "preservation-age-to-59-taxed-element",
      };
    },
    // LITO（Low Income Tax Offset）。ATOの所得帯別計算をそのまま実装する。
    calculateLowIncomeTaxOffset(taxableIncome) {
      const income = Math.max(0, Number(taxableIncome) || 0);
      const l = this.lowIncomeTaxOffset;
      if (income <= l.fullOffsetIncomeMax) return l.maximum;
      if (income <= l.firstTaperIncomeMax) {
        return Math.max(0, l.maximum - (income - l.fullOffsetIncomeMax) * l.firstTaperRate);
      }
      if (income <= l.eligibilityIncomeMax) {
        return Math.max(0, l.secondBandBase - (income - l.firstTaperIncomeMax) * l.secondTaperRate);
      }
      return 0;
    },
    // SAPTO。rebateIncome は課税所得とは別概念なので、明示値を受け取る。
    // eligible=false/未指定なら0。配偶者間の未使用額移転は未実装。
    calculateSeniorsAndPensionersTaxOffset(rebateIncome, status = "single", eligible = false) {
      if (!eligible) return 0;
      const income = Math.max(0, Number(rebateIncome) || 0);
      const cfg = this.seniorsAndPensionersTaxOffset.statuses[status]
        || this.seniorsAndPensionersTaxOffset.statuses.single;
      if (income <= cfg.shadeOutThreshold) return cfg.maximum;
      if (income >= cfg.cutOutThreshold) return 0;
      return Math.max(0, cfg.maximum - (income - cfg.shadeOutThreshold) * this.seniorsAndPensionersTaxOffset.shadeOutRate);
    },
    // SAPTOの配偶者間移転。双方がSAPTO対象である場合に限り、
    // ATOの「unused spouse SAPTO」式で移転可能額を計算する。
    // spouse taxable income がA$6,000以下なら未使用SAPTO全額、
    // 超える場合は A - ((B - 6,000) × 15%)。Bにはexempt pension incomeも含む。
    // これは移転可能なoffset entitlementの概算であり、最終税額への適用は非還付型offsetとして扱う。
    calculateUnusedSaptoTransferFromSpouse({
      spouseSaptoAmount = 0,
      spouseTaxableIncome = 0,
      spouseExemptPensionIncome = 0,
      bothEligible = false,
    } = {}) {
      if (bothEligible !== true) return 0;
      const amount = Math.max(0, Number(spouseSaptoAmount) || 0);
      const taxable = Math.max(0, Number(spouseTaxableIncome) || 0);
      const exemptPension = Math.max(0, Number(spouseExemptPensionIncome) || 0);
      const incomeForUnusedTest = taxable + exemptPension;
      if (incomeForUnusedTest <= 6000) return amount;
      return Math.max(0, amount - (incomeForUnusedTest - 6000) * 0.15);
    },
    calculateSaptoIncludingSpouseTransfer({
      rebateIncome = 0,
      status = "couple",
      eligible = false,
      spouseEligible = false,
      spouseRebateIncome = 0,
      spouseStatus = "couple",
      spouseTaxableIncome = 0,
      spouseExemptPensionIncome = 0,
    } = {}) {
      const ownSapto = this.calculateSeniorsAndPensionersTaxOffset(rebateIncome, status, eligible);
      if (!eligible || !spouseEligible) {
        return { ownSapto, spouseSapto: 0, transferableFromSpouse: 0, totalEntitlement: ownSapto };
      }
      const spouseSapto = this.calculateSeniorsAndPensionersTaxOffset(
        spouseRebateIncome,
        spouseStatus,
        true
      );
      const transferableFromSpouse = this.calculateUnusedSaptoTransferFromSpouse({
        spouseSaptoAmount: spouseSapto,
        spouseTaxableIncome,
        spouseExemptPensionIncome,
        bothEligible: true,
      });
      return {
        ownSapto,
        spouseSapto,
        transferableFromSpouse,
        totalEntitlement: ownSapto + transferableFromSpouse,
      };
    },
    // Medicare levy（2%）。個人の低所得減免に加え、夫婦・ひとり親等の家族所得減免を反映する。
    // saptoEligible=true の場合はSAPTO対象者用の閾値を使う。
    // family=true の場合、本人＋配偶者の課税所得と扶養子数から家族閾値を計算し、
    // Medicare Levy Act s8(2) の上限（家族所得－閾値の10%）を適用する。
    // 年途中の婚姻・免除日数などの日割りは未実装。
    calculateMedicareLevy(taxableIncome, options = {}) {
      const income = Math.max(0, Number(taxableIncome) || 0);
      const singleThresholds = options.saptoEligible === true
        ? this.medicareLevy.lowIncomeThresholds.saptoSingle
        : this.medicareLevy.lowIncomeThresholds.ordinarySingle;
      if (income <= singleThresholds.lower) return 0;
      const fullLevy = income * this.medicareLevy.rate;
      const individualLevy = income >= singleThresholds.upper
        ? fullLevy
        : Math.min(fullLevy, (income - singleThresholds.lower) * this.medicareLevy.phaseInRate);

      if (options.family !== true) return individualLevy;

      const familyCfg = options.saptoEligible === true
        ? this.medicareLevy.lowIncomeThresholds.saptoFamily
        : this.medicareLevy.lowIncomeThresholds.ordinaryFamily;
      const spouseIncome = Math.max(0, Number(options.spouseTaxableIncome) || 0);
      const dependentChildren = Math.max(0, Math.floor(Number(options.dependentChildren) || 0));
      const familyIncome = income + spouseIncome;
      const familyThreshold = familyCfg.lower + dependentChildren * familyCfg.dependentIncrement;
      const familyBasedMaximum = Math.max(0, familyIncome - familyThreshold) * this.medicareLevy.phaseInRate;
      return Math.min(individualLevy, familyBasedMaximum);
    },
    // 所得税＋Medicare levy の合計
    calculateTotalTax(taxableIncome, options = {}) {
      const incomeTaxBeforeOffsets = this.calculateIncomeTax(taxableIncome);
      const litoEntitlement = this.calculateLowIncomeTaxOffset(taxableIncome);
      const litoApplied = Math.min(incomeTaxBeforeOffsets, litoEntitlement);
      const afterLito = Math.max(0, incomeTaxBeforeOffsets - litoApplied);
      const saptoEntitlement = this.calculateSeniorsAndPensionersTaxOffset(
        options.rebateIncome ?? taxableIncome,
        options.saptoStatus || "single",
        options.saptoEligible === true,
      );
      const saptoApplied = Math.min(afterLito, saptoEntitlement);
      const incomeTax = Math.max(0, afterLito - saptoApplied);
      const medicareLevy = this.calculateMedicareLevy(taxableIncome, {
        saptoEligible: options.saptoEligible === true,
        family: options.medicareFamily === true,
        spouseTaxableIncome: options.medicareSpouseTaxableIncome || 0,
        dependentChildren: options.medicareDependentChildren || 0,
      });
      // MLSは民間病院保険の加入状況・家族構成等が必要なため、
      // mlsIncome が明示された場合だけ計算する。
      // これによりCGTや給与犠牲など、MLS条件を持たない内部計算へ
      // 「未加入」と仮定したMLSを誤って加算しない。
      const hasMlsContext = Object.prototype.hasOwnProperty.call(options, "mlsIncome");
      const mlsIncome = hasMlsContext
        ? Math.max(0, Number(options.mlsIncome) || 0)
        : 0;
      const medicareLevySurcharge = hasMlsContext
        ? this.calculateMedicareLevySurcharge(mlsIncome, {
            hasAppropriateHospitalCover: options.hasAppropriateHospitalCover === true,
            family: options.mlsFamily === true,
            dependentChildren: options.mlsDependentChildren || 0,
            uncoveredDays: options.mlsUncoveredDays ?? 365,
          })
        : 0;
      return { incomeTaxBeforeOffsets, litoEntitlement, litoApplied, saptoEntitlement, saptoApplied, incomeTax, medicareLevy, medicareLevySurcharge, total: incomeTax + medicareLevy + medicareLevySurcharge };
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
    // 【重要】Division 293 の追加課税は「拠出額の全額」ではなく、
    //   min(税引前拠出額, 所得＋拠出額 − 250,000)
    // に対してのみ15%がかかる。閾値をわずかに超えただけの人に拠出額全額へ課税すると
    // 大きく過大評価になる（閾値をまたぐ境界で税額が不連続に跳ね上がってしまう）。
    // 【Division 293 income について】
    //   ATOの定義する Division 293 income は「課税所得＋報告対象フリンジベネフィット＋
    //   純投資損失＋純賃貸損失＋一部の海外所得」等の合計であり、年収そのものではない。
    //   このアプリはフリンジベネフィットや投資損失を入力として持たないため厳密には
    //   再現できない。そこで div293Income（概算用の入力欄）が正の値なら それを使い、
    //   未入力なら「課税所得の概算＝年収 − 給与犠牲」で代用する（＝簡易計算）。
    //   年収そのものではないのは、給与犠牲が課税所得から控除されるため。
    //   どちらを使ったかは isEstimated で返し、画面にも簡易計算である旨を明示する。
    //   なお calculateSuperContributionTax が income に拠出額を足し戻すので、
    //   給与犠牲は二重に控除されない。
    resolveDivision293Income(taxableIncomeApprox, div293Income) {
      const explicit = Number(div293Income);
      if (Number.isFinite(explicit) && explicit > 0) {
        return { income: explicit, isEstimated: false };
      }
      return { income: Math.max(0, Number(taxableIncomeApprox) || 0), isEstimated: true };
    },
    // Division 293 税の支払元。
    //   "super"   ：release authority で Super から支払う（Super残高が減る）
    //   "outside" ：本人が口座外の現金で支払う（銀行・現金が減る）
    //   どちらでも総資産は税額分だけ減る。既定は "super"。
    DIV293_PAID_FROM: ["super", "outside"],
    normalizeDiv293PaidFrom(v) {
      return v === "outside" ? "outside" : "super";
    },
    // 第2引数は「Division 293 income」（年収そのものではない。resolveDivision293Income 参照）。
    calculateSuperContributionTax(concessionalContribution, div293Income) {
      const s = this.superannuation;
      const c = Math.max(0, Number(concessionalContribution) || 0);
      const income = Math.max(0, Number(div293Income) || 0);
      const baseTax = c * s.contributionsTaxRate;
      const excessOverThreshold = Math.max(0, income + c - s.div293Threshold);
      const div293Base = Math.min(c, excessOverThreshold);
      const div293Tax = div293Base * s.div293AdditionalRate;
      return {
        baseTax,
        div293Base,
        div293Tax,
        total: baseTax + div293Tax,
        effectiveRate: c > 0 ? (baseTax + div293Tax) / c : 0,
        div293Applies: div293Base > 0,
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
      "SAPTOの配偶者間の未使用税額控除移転は実装済み。年齢・政府年金等の資格条件、年途中の配偶者関係、最終ATO判定の完全自動化は未実装",
      "Government super co-contributionは本人確認入力で反映済み。年齢・ビザ・10% eligible income test・税申告・前年TSB等の完全自動判定は未実装",
      "Medicare levyの家族所得による減免は実装済み。年途中の婚姻・離婚・免除日数などの日割り計算は未実装",
      "HELP等の学生ローンは2026-27の当年強制返済額を実装済み。将来の債務残高・年次indexation・任意返済の自動投影は未実装",
      "Super一時金のtaxed elementは60歳未満の基本税率（保存年齢未満22%、保存年齢到達後60歳未満はlow rate cap内0%・超過17%）を実装済み。untaxed element、income stream、障害給付、DASP、個別の最終限界税率・税額控除は未自動化",
    ],
  },

  estate: {
    implemented: true,
    effectiveTaxYear: "2026-27",
    lastUpdated: "2026-08-21",
    sourceName: "Australian Taxation Office (ATO) — Tax on super benefits / deceased estates",
    sourceUrl: "https://www.ato.gov.au/tax-rates-and-codes/key-superannuation-rates-and-thresholds/payments-from-super",
    sourceUrls: {
      deathBenefits: "https://www.ato.gov.au/tax-rates-and-codes/key-superannuation-rates-and-thresholds/payments-from-super",
      deceasedEstates: "https://www.ato.gov.au/individuals-and-families/deceased-estates/doing-trust-tax-returns-for-the-deceased-estate/when-and-how-to-lodge-returns-for-a-deceased-estate",
    },
    // Australia has no general inheritance tax. This calculator is intentionally limited to
    // a Super death-benefit lump sum paid directly to an individual beneficiary.
    // Death-benefits dependant: lump sum is tax free.
    // Non-dependant: tax-free component remains tax free; taxed element max 15% + Medicare levy;
    // untaxed element max 30% + Medicare levy. The Medicare levy is modelled at 2% for a direct payment.
    medicareLevyRate: 0.02,
    nonDependantTaxedElementRate: 0.15,
    nonDependantUntaxedElementRate: 0.30,
    calculateSuperDeathBenefitLumpSum({
      taxFreeComponent = 0,
      taxedElement = 0,
      untaxedElement = 0,
      isDeathBenefitsDependant = true,
      includeMedicareLevy = true,
      paymentRoute = "direct",
      dependantSharePercent = null,
    } = {}) {
      const clean = (v) => Math.max(0, Number(v) || 0);
      const taxFree = clean(taxFreeComponent);
      const taxed = clean(taxedElement);
      const untaxed = clean(untaxedElement);
      const gross = taxFree + taxed + untaxed;
      const route = paymentRoute === "estate" ? "estate" : "direct";
      // A deceased estate can ultimately benefit both tax dependants and non-dependants.
      // Section 302-10 applies the death-benefit tax treatment to each beneficiary portion.
      const hasEstateSplit = route === "estate" && dependantSharePercent !== null && dependantSharePercent !== undefined && dependantSharePercent !== "";
      const dependantShare = hasEstateSplit
        ? Math.min(1, Math.max(0, (Number(dependantSharePercent) || 0) / 100))
        : (isDeathBenefitsDependant ? 1 : 0);
      const nonDependantShare = 1 - dependantShare;
      if (nonDependantShare <= 0) {
        return { gross, taxFreeComponent: taxFree, taxedElement: taxed, untaxedElement: untaxed, tax: 0, net: gross, effectiveTaxRate: 0, paymentRoute: route, medicareLevyApplied: false, dependantSharePercent: dependantShare * 100, nonDependantSharePercent: 0 };
      }
      // For this estimator, Medicare levy is only applied to a direct payment.
      // A deceased-estate trustee is modelled at the statutory 15% / 30% maximum rates.
      const medicareLevyApplied = route === "direct" && includeMedicareLevy;
      const levy = medicareLevyApplied ? this.medicareLevyRate : 0;
      const tax = nonDependantShare * (taxed * (this.nonDependantTaxedElementRate + levy)
        + untaxed * (this.nonDependantUntaxedElementRate + levy));
      return {
        gross,
        taxFreeComponent: taxFree,
        taxedElement: taxed,
        untaxedElement: untaxed,
        tax,
        net: Math.max(0, gross - tax),
        effectiveTaxRate: gross > 0 ? tax / gross : 0,
        paymentRoute: route,
        medicareLevyApplied,
        dependantSharePercent: dependantShare * 100,
        nonDependantSharePercent: nonDependantShare * 100,
      };
    },
    calculateSuperDeathBenefitIncomeStream({
      recipientAge = 0,
      deceasedAge = 0,
      taxFreeComponent = 0,
      taxedElement = 0,
      untaxedElement = 0,
      isDeathBenefitsDependant = true,
    } = {}) {
      const clean = (v) => Math.max(0, Number(v) || 0);
      const recipient = clean(recipientAge);
      const deceased = clean(deceasedAge);
      const taxFree = clean(taxFreeComponent);
      const taxed = clean(taxedElement);
      const untaxed = clean(untaxedElement);
      const gross = taxFree + taxed + untaxed;
      if (!isDeathBenefitsDependant) return { eligible: false, reason: "nonDependant", recipientAge: recipient, deceasedAge: deceased, gross, finalTaxCalculated: false };
      const age60Condition = recipient >= 60 || deceased >= 60;
      const taxFreeAmount = taxFree + (age60Condition ? taxed : 0);
      const assessableAmount = untaxed + (age60Condition ? 0 : taxed);
      const taxOffsetRateTaxed = age60Condition ? 0 : 0.15;
      const taxOffsetRateUntaxed = age60Condition ? 0.10 : 0;
      const taxOffsetAmount = taxed * taxOffsetRateTaxed + untaxed * taxOffsetRateUntaxed;
      return { eligible: true, recipientAge: recipient, deceasedAge: deceased, gross, taxFreeAmount, assessableAmount, taxOffsetRateTaxed, taxOffsetRateUntaxed, taxOffsetAmount, finalTaxCalculated: false };
    },
    notImplemented: [
      "Super death benefit income streamsの最終所得税額（他の課税所得・Medicare levy等が必要なため課税区分とtax offsetまで実装）",
      "複数受益者のdependant/non-dependant比率による比例按分は実装済み。各受益者ごとにcomponent構成が異なるケース・特殊なdependant判定は未実装",
      "CGT・deceased estate trust return・非居住者受益者など死亡後の資産税務の完全自動計算",
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
