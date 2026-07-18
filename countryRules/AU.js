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
  investment: {
    implemented: true,
    effectiveTaxYear: "2026-27",
    lastUpdated: "2026-07-18",
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
    // 取崩し順：Cash Savings → Investment Account → Superannuation
    //   （utils/simulations.js の ACCOUNT_DRAW_CATEGORY.AU = cash → taxable → restricted と
    //     完全に一致させること。ここが食い違うと、パネルのプレビューと lifePlanEngine の
    //     本計算で取崩し順が変わり、結果が一致しなくなる）
    //   Superは preservation age に達するまで取り崩せない。
    simulateGrowth({
      currentAge, retireAge, deathAge, accounts, annualWithdrawalNeeded,
      annualSalary, voluntaryConcessional, contributionsTaxRate, earningsTaxAccumulation,
    }) {
      const keys = this.accountTypes;
      const contribTax = (contributionsTaxRate === undefined || contributionsTaxRate === null) ? 0.15 : Number(contributionsTaxRate);
      const earnTax = (earningsTaxAccumulation === undefined || earningsTaxAccumulation === null) ? 0.15 : Number(earningsTaxAccumulation);

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
      // Superへの税引前拠出（SG＋任意拠出）は、上限を超えた分も含めて15%課税後に口座へ入る。
      const concessionalGross = this.getTotalConcessional(annualSalary, voluntaryConcessional);
      const concessionalNet = concessionalGross * (1 - contribTax);

      const withdrawalOrder = ["cashSavings", "investmentAccount", "superannuation"];
      const totalOf = (b) => keys.reduce((s, k) => s + b[k], 0);
      const startAge = Math.round(currentAge);
      const endAge = Math.round(deathAge);
      let withdrawalTaxPaid = 0;
      const yearly = [{
        age: startAge, value: totalOf(balances), accounts: { ...balances },
        minimumDrawdown: 0, minimumDrawdownTax: 0, withdrawalTaxPaid: 0,
      }];

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
            if (key === "superannuation" && !this.canAccessSuper(age)) continue;
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
        withdrawalTaxPaid,
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
    lastUpdated: "2026-07-18",
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
      // Work Bonus：就労収入のうち、所得テストから除外される年額
      workBonusAnnual: 11800,
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
    // 所得テストによる給付額（年額）。就労収入はWork Bonus分が除外される。
    getAgePensionByIncomeTest(annualIncome, status) {
      const max = this.getMaxAnnual(status);
      const excess = Math.max(0, (Number(annualIncome) || 0) - this.getIncomeFreeAreaAnnual(status));
      return Math.max(0, max - excess * this.getIncomeTaperPerDollar(status));
    },
    // 資産テストによる給付額（年額）
    getAgePensionByAssetsTest(assessableAssets, status, homeowner) {
      const p = this.agePension;
      const max = this.getMaxAnnual(status);
      const excess = Math.max(0, (Number(assessableAssets) || 0) - this.getAssetsFreeArea(status, homeowner));
      const reductionPerYear = (excess / 1000)
        * this.getAssetsTaperPerThousandFortnightly(status)
        * p.fortnightsPerYear;
      return Math.max(0, max - reductionPerYear);
    },
    // 給付が完全に打ち切られる資産額（カットオフ）。テストと画面表示で共有する。
    getAssetsCutOff(status, homeowner) {
      const p = this.agePension;
      const perThousand = this.getAssetsTaperPerThousandFortnightly(status) * p.fortnightsPerYear;
      return this.getAssetsFreeArea(status, homeowner) + (this.getMaxAnnual(status) / perThousand) * 1000;
    },
    // 給付が完全に打ち切られる年間所得（カットオフ）。
    getIncomeCutOffAnnual(status) {
      return this.getIncomeFreeAreaAnnual(status)
        + this.getMaxAnnual(status) / this.getIncomeTaperPerDollar(status);
    },
    // 所得テストに算入する所得＝利用者が入力したその他の年収 ＋ 金融資産のみなし収入。
    // financialAssets を渡さなければみなし収入は0として扱う（従来の呼び出しと互換）。
    getAssessableIncomeAnnual(annualIncome, financialAssets, status) {
      return (Number(annualIncome) || 0) + this.getDeemedIncomeAnnual(financialAssets, status);
    },
    // 実際の給付額（1人あたり年額）＝ 所得テストと資産テストの「低い方」。
    // 受給資格年齢未満はゼロ。
    getAgePension({ age, annualIncome, assessableAssets, financialAssets, status, homeowner }) {
      if ((Number(age) || 0) < this.agePension.qualifyingAge) return 0;
      const income = this.getAssessableIncomeAnnual(annualIncome, financialAssets, status);
      const byIncome = this.getAgePensionByIncomeTest(income, status);
      const byAssets = this.getAgePensionByAssetsTest(assessableAssets, status, homeowner);
      return Math.min(byIncome, byAssets);
    },
    // 世帯合計の給付額（年額）。生活費を世帯合計で扱っているため、投影に入れる年金収入も
    // 世帯合計に揃える。カップルで双方が受給資格年齢に達している場合だけ2人分になる。
    //   status !== "couple" → 1人分
    //   status === "couple" かつ bothQualified === false → 1人分（片方だけが受給）
    // ※ 片方が受給資格年齢未満の場合、その人の積立フェーズのSuperは資産テストの対象外に
    //   なるが、本アプリは世帯の資産をまとめて扱うため、その除外は未実装。
    getAgePensionHousehold({ age, annualIncome, assessableAssets, financialAssets, status, homeowner, bothQualified }) {
      const perPerson = this.getAgePension({ age, annualIncome, assessableAssets, financialAssets, status, homeowner });
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
      annualSalary, voluntaryConcessional,
      expensesAnnual, healthcareAnnual, otherAnnualIncome,
      status, homeowner, bothQualified,
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
      "Rent Assistance（賃貸住宅手当）",
      "Transitional rate pension（2009年以前からの受給者への経過措置）",
      // 【A-2】投影中のAge Pensionは lifePlanEngine 側で毎ステップ再判定している
      //   （publicPensions.monthlyAmountAt + assessedPoolIds）。
      //   projectAgePension は画面カードに出す「受給開始時点の見込額」を求めるためのもので、
      //   投影値そのものではない。
      "Work Bonus（就労収入 年 A$11,800 の所得テスト除外）。就労収入と非就労収入を区別せず入力するため未適用",
      "カップルで片方だけが受給資格年齢の場合、受給資格年齢未満の配偶者の積立フェーズSuperを資産テストから除外する扱い",
      "投資用不動産の実収入（Deemingの対象外だが所得テストには算入される）",
      "カップルで片方だけが受給資格年齢に達している場合の取り扱い（資産・所得は世帯合算のまま）",
      "Commonwealth Seniors Health Card",
    ],
  },

  healthcare: {
    implemented: true,
    // Medicare（公的医療保険）でカバーされることを前提に、
    // 自己負担が生じうる費目のみ年間費用を入力する簡易モデル。
    model: "selfInputAnnualCostsWithMedicare",
    effectiveTaxYear: "2026-27",
    lastUpdated: "2026-07-18",
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
    lastUpdated: "2026-07-18",
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
    // 【重要】Division 293 の追加課税は「拠出額の全額」ではなく、
    //   min(税引前拠出額, 所得＋拠出額 − 250,000)
    // に対してのみ15%がかかる。閾値をわずかに超えただけの人に拠出額全額へ課税すると
    // 大きく過大評価になる（閾値をまたぐ境界で税額が不連続に跳ね上がってしまう）。
    calculateSuperContributionTax(concessionalContribution, taxableIncome) {
      const s = this.superannuation;
      const c = Math.max(0, Number(concessionalContribution) || 0);
      const income = Math.max(0, Number(taxableIncome) || 0);
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
