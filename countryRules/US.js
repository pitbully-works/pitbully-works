// ============================================================================
// countryRules/US.js
// 米国版の国別ルール定義（US_COUNTRY_RULES）。
//
// 実装済み（investment / retirement / healthcare / tax の4分野すべて implemented: true）。
// 収録している数値はいずれも2026年の公式値で、出典は各セクションの sourceNote に明記している。
//   - 拠出上限・catch-up・phase-out : IRS Notice 2025-67
//   - 連邦所得税・標準控除・長期CG   : IRS Revenue Procedure 2025-32
//   - Medicare Part B / IRMAA        : CMS 2026 Parts A & B Premiums（2025-11-14発表）
//   - Social Security の受給年齢・増減率 : SSA
//
// 税額はいずれも「老後資産シミュレーション用の概算」であり、確定申告の計算ではない。
// 州税は州差が大きいため固定値を持たず、ユーザーが実効税率を入力する方式にしている。
// ============================================================================

// ---------- countryRules/US.js 相当 ----------
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
    // ここで RMD（必須最低引出）も反映する。retirementRules（US_COUNTRY_RULES.retirement）と
    // birthYear を渡した場合のみ有効になり、渡さなければ従来どおりRMD無しで動作する
    // （既存の呼び出し・テストとの後方互換のため）。
    //
    // RMDの扱い（簡易モデル。詳細な前提は retirement.rmd のコメントを参照）：
    //   - 開始年齢（生年により73歳/75歳）以降、Traditional IRA と 401(k) の合計残高を
    //     Uniform Lifetime Table の除数で割った額を必ず引き出す。
    //   - 生活費として必要な額をRMDが上回った場合、超過分は「使ったこと」にはしない。
    //     課税繰延口座からの引出は課税所得になるため、rmdTaxRatePct ぶんの税を差し引いた
    //     残りを Brokerage（課税口座）へ移す＝資産としては残る。
    //   - Roth IRA は本人存命中はRMD対象外。
    // 【段階3】課税繰延口座からの引出に、連邦所得税の概算グロスアップを反映する。
    //
    // 生活費として必要なのは「税引後の手取り」である。Brokerage（課税口座）からの引出は
    // 元本部分が非課税なので概ねそのまま使えるが、Traditional IRA / 401(k) からの引出は
    // 全額が通常所得として課税されるため、手取りを確保するには税額ぶん多く引き出す必要がある。
    //   必要な引出額 = 必要な手取り ÷ (1 − 税率)
    // 例：手取り10,000ドルが必要で税率22%なら、12,820.51ドルを引き出す（税2,820.51ドル）。
    //
    // Roth IRA からの引出は適格分配であれば非課税のため、グロスアップしない。
    //
    // 【重要】この税率は「老後資産シミュレーション用の概算」であり、確定申告の計算ではない。
    // 実際には控除・所得の種類・州税・Social Securityの課税割合などで変動する。
    //
    // 返り値 yearly[] の各年に、次の3つを別々に記録する（混同しないため）：
    //   rmdRequired        : 法定の最低引出額（Uniform Lifetime Table による計算値そのもの）
    //   taxableWithdrawn   : Traditional IRA / 401(k) から実際に引き出した課税対象の総額
    //   estimatedTax       : 上記に対する概算税額
    // RMDを満たしたかどうかは taxableWithdrawn >= rmdRequired で判定できる。
    // 【段階4】Social Security給付の課税を反映する。
    //
    // 課税繰延口座からの引出が増える → 暫定所得が増える → Social Securityの課税所得算入額が
    // 増える → 必要な税額が増える → さらに引出が必要、という循環が起きる。
    // これを反復計算（最大10回、1ドル未満で収束打ち切り）で解く。
    //
    // socialSecurityAnnual と filingStatus を渡した場合のみ有効。渡さなければ
    // 段階3までと同じ挙動（後方互換）。
    simulateGrowth({ currentAge, retireAge, deathAge, accounts, returnPct, annualWithdrawalNeeded, retirementRules, birthYear, rmdTaxRatePct, taxRatePct, taxRules, socialSecurityAnnual, socialSecurityStartAge, filingStatus, taxExemptInterest }) {
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
      // 課税繰延口座（引出時に通常所得として課税される口座）
      const taxDeferredAccounts = ["traditionalIra", "k401"];
      const rmdEnabled = !!(retirementRules && typeof retirementRules.getRequiredMinimumDistribution === "function");
      // 税率は2つを別々に扱う（意味が異なるため混ぜない）：
      //   taxRatePct    … 生活費のための引出をグロスアップするときの税率【段階3で追加】
      //   rmdTaxRatePct … RMDの超過分をBrokerageへ移すときに差し引く税率【段階2から】
      // taxRatePct を渡さなければグロスアップは行われず、段階2までと同じ挙動になる。
      const clampRate = (v) => Math.min(Math.max(Number(v) || 0, 0), 99.9) / 100;
      const taxRate = taxRatePct !== undefined && taxRatePct !== null ? clampRate(taxRatePct) : 0;
      const rmdSurplusTaxRate = rmdTaxRatePct !== undefined && rmdTaxRatePct !== null
        ? clampRate(rmdTaxRatePct)
        : taxRate;
      const combinedValue = (b) => b.k401 + b.traditionalIra + b.rothIra + b.brokerage;
      // Social Security課税を計算できるか（給付額と税ルールが揃っている場合のみ）
      const ssEnabled = !!(
        retirementRules &&
        typeof retirementRules.getTaxableSocialSecurity === "function" &&
        taxRules &&
        typeof taxRules.calculateFederalTax === "function" &&
        Number(socialSecurityAnnual) > 0
      );
      const ssStart = Number(socialSecurityStartAge) || 0;
      const ssFilingStatus = filingStatus || "single";
      const exemptInterest = Number(taxExemptInterest) || 0;
      const startAge = Math.round(currentAge);
      const endAge = Math.round(deathAge);
      const yearly = [{
        age: startAge, value: combinedValue(balances), accounts: { ...balances },
        rmd: 0, rmdRequired: 0, taxableWithdrawn: 0, estimatedTax: 0, rmdSurplusToBrokerage: 0,
        brokerageWithdrawn: 0, rothWithdrawn: 0, totalWithdrawn: 0, incomeSurplusToBrokerage: 0,
        socialSecurityBenefit: 0, provisionalIncome: 0, taxableSocialSecurity: 0,
        ordinaryTaxableIncome: 0, federalTax: 0,
      }];
      for (let age = startAge + 1; age <= endAge; age++) {
        // IRSのRMDは「前年12月31日時点の残高 ÷ 当年の年齢の除数」で決まる。
        // そのため、当年の運用益を加算する前の残高（＝前年末残高）を先に控えておく。
        const priorYearEndBalances = { ...balances };
        Object.keys(balances).forEach((k) => { balances[k] = balances[k] * (1 + rate); });
        // 法定の最低引出額。前年末残高から計算する（当年の運用益は含めない）。
        const rmdRequired = rmdEnabled
          ? retirementRules.getRequiredMinimumDistribution({ age, birthYear, balances: priorYearEndBalances })
          : 0;
        // 課税繰延口座から実際に引き出した総額（＝課税対象額）。RMD達成判定と税計算に使う。
        let taxableWithdrawn = 0;
        let estimatedTax = 0;
        let rmdSurplusToBrokerage = 0;
        // 口座別の引出額（収支検算のため、口座ごとに分けて記録する）
        let brokerageWithdrawn = 0;
        let rothWithdrawn = 0;
        let totalWithdrawn = 0;
        // 使われずに口座へ戻した現金のうち、RMD超過分ではない部分（SS給付の余りなど）
        let incomeSurplusToBrokerage = 0;
        // Social Security関連（この年の値）
        const socialSecurityBenefit = ssEnabled && age >= ssStart ? Number(socialSecurityAnnual) || 0 : 0;
        let provisionalIncome = 0;
        let taxableSocialSecurity = 0;
        let ordinaryTaxableIncome = 0;
        let federalTax = 0;

        // 拠出フェーズ（退職前）は各口座へ拠出する。RMDや税の計算はこの後で
        // 退職後と共通の処理として行う（退職前でもRMDは適用されるため）。
        if (age <= retireAge) {
          Object.keys(balances).forEach((k) => { balances[k] += contributions[k]; });
        }

        // --- 引出のシミュレーション（実際の引出順をそのまま再現する） ---
        // 引出順は brokerage → traditionalIra → k401 → rothIra。
        // 「いくら税がかかるか」は「どの口座からいくら引くか」に依存し、
        // その引出額はまた税額に依存する（循環）。そこで、実際の引出順を
        // そのまま試算する純粋関数を用意し、反復して収束させる。
        //
        // cashNeeded : 口座から用意すべき現金（生活費 ＋ 税額 − SS給付）
        // rmdFloor   : 課税繰延口座から最低限引き出さなければならない額
        // 返り値は口座別の引出額（実際の残高は変更しない）。
        const planWithdrawals = (cashNeeded, rmdFloor) => {
          const taken = { brokerage: 0, traditionalIra: 0, k401: 0, rothIra: 0 };
          let remaining = Math.max(0, cashNeeded);
          for (const key of withdrawalOrder) {
            if (remaining <= 0) break;
            const take = Math.min(balances[key], remaining);
            taken[key] += take;
            remaining -= take;
          }
          // RMDの不足分を課税繰延口座から追加で引き出す
          let taxableSoFar = taken.traditionalIra + taken.k401;
          let stillNeeded = Math.max(0, rmdFloor - taxableSoFar);
          for (const key of taxDeferredAccounts) {
            if (stillNeeded <= 0) break;
            const take = Math.min(balances[key] - taken[key], stillNeeded);
            taken[key] += take;
            stillNeeded -= take;
          }
          const taxable = taken.traditionalIra + taken.k401;
          const nonTaxable = taken.brokerage + taken.rothIra;
          return { taken, taxable, nonTaxable, total: taxable + nonTaxable };
        };

        // 【仕様】退職前（age <= retireAge）の生活費は資産から引き出さない。
        // 現役期間の生活費は給与で賄う前提であり、annualWithdrawalNeeded は
        // 「退職後の生活費（＋医療費 − 公的年金収入）」として渡される値だから。
        // GB / CA / AU の simulateGrowth も同じく age > retireAge のときだけ引き出す。
        // ただしRMDは法律上、退職前でも適用されるため下の計算では常に考慮する。
        const spendingNeed = age <= retireAge ? 0 : (Number(annualWithdrawalNeeded) || 0);
        // RMDは対象口座の残高を超えては引き出せない
        const taxDeferredAvailable = balances.traditionalIra + balances.k401;
        const rmdFloor = Math.min(rmdRequired, taxDeferredAvailable);

        let plan;
        if (ssEnabled || socialSecurityBenefit > 0) {
          // --- Social Securityの課税を含めて反復計算する ---
          // 課税繰延口座からの引出↑ → 暫定所得↑ → SS課税所得算入額↑ → 税額↑ → 引出↑
          // という循環を、実際の引出順を模擬しながら収束させる。
          let guessTax = 0;
          for (let iter = 0; iter < 15; iter++) {
            const cashNeeded = Math.max(0, spendingNeed + guessTax - socialSecurityBenefit);
            plan = planWithdrawals(cashNeeded, rmdFloor);
            const ssCalc = retirementRules.getTaxableSocialSecurity({
              filingStatus: ssFilingStatus,
              otherIncome: plan.taxable,
              taxExemptInterest: exemptInterest,
              ssBenefit: socialSecurityBenefit,
            });
            const ordinary = plan.taxable + ssCalc.taxableSocialSecurity;
            const nextTax = taxRules.calculateFederalTax(ordinary, ssFilingStatus).tax;
            provisionalIncome = ssCalc.provisionalIncome;
            taxableSocialSecurity = ssCalc.taxableSocialSecurity;
            ordinaryTaxableIncome = ordinary;
            federalTax = nextTax;
            if (Math.abs(nextTax - guessTax) < 1) break;
            guessTax = nextTax;
          }
          estimatedTax = federalTax;
        } else {
          // --- Social Securityが無い場合：概算税率でグロスアップする（段階3までと同じ考え方）---
          // 生活費ぶんの税は「手取りを確保するための上乗せ」なので引出額に含めて反復で求める。
          // 一方、RMDで生活費を超えて強制的に引き出した分の税は、その超過分から差し引く
          // （追加で引き出して払うのではない）ため、反復には含めず別に計算する。
          let taxOnSpending = 0;
          for (let iter = 0; iter < 40; iter++) {
            const cashNeeded = spendingNeed + taxOnSpending;
            const spendOnly = planWithdrawals(cashNeeded, 0);
            const next = spendOnly.taxable * taxRate;
            if (Math.abs(next - taxOnSpending) < 1e-9) { taxOnSpending = next; break; }
            taxOnSpending = next;
          }
          const cashNeeded = spendingNeed + taxOnSpending;
          const spendOnlyPlan = planWithdrawals(cashNeeded, 0);
          plan = planWithdrawals(cashNeeded, rmdFloor);
          // RMDによって生活費以上に引き出された課税繰延分
          const taxableSurplus = Math.max(0, plan.taxable - spendOnlyPlan.taxable);
          estimatedTax = taxOnSpending + taxableSurplus * rmdSurplusTaxRate;
          ordinaryTaxableIncome = plan.taxable;
          federalTax = 0; // SS非有効時は連邦税の詳細計算を行わないため0のまま
        }

        // --- 収束した計画を、実際の残高に反映する ---
        for (const key of withdrawalOrder) {
          balances[key] -= plan.taken[key];
        }
        brokerageWithdrawn = plan.taken.brokerage;
        rothWithdrawn = plan.taken.rothIra;
        taxableWithdrawn = plan.taxable;
        totalWithdrawn = plan.total;

        // --- 使い切らなかった現金を口座へ戻す ---
        // 引き出した総額＋SS給付のうち、生活費と税に使われなかった分は消費されていない。
        // 主な発生源は「RMDで生活費以上に強制的に引き出した分」と「SS給付が生活費を上回った分」。
        // どちらも課税口座（Brokerage）へ再投資する。
        const cashIn = totalWithdrawn + socialSecurityBenefit;
        const cashOut = spendingNeed + (socialSecurityBenefit > 0 ? federalTax : estimatedTax);
        const unusedCash = Math.max(0, cashIn - cashOut);
        if (unusedCash > 0) {
          // このうち「RMDによる強制引出が生活費を超えた分」を rmdSurplus として区別する。
          // 残りはSS給付などの収入余剰（incomeSurplus）。
          const rmdDriven = Math.max(0, taxableWithdrawn - Math.max(0, spendingNeed - socialSecurityBenefit));
          rmdSurplusToBrokerage = Math.min(unusedCash, Math.max(0, rmdDriven - (socialSecurityBenefit > 0 ? federalTax : estimatedTax)));
          incomeSurplusToBrokerage = unusedCash - rmdSurplusToBrokerage;
          balances.brokerage += unusedCash;
        }
        yearly.push({
          age,
          value: combinedValue(balances),
          accounts: { ...balances },
          // rmd は後方互換のため残す（＝課税繰延口座からの実引出総額）。
          // 新しいコードでは taxableWithdrawn / rmdRequired を使うこと。
          rmd: taxableWithdrawn,
          rmdRequired,
          taxableWithdrawn,
          estimatedTax,
          rmdSurplusToBrokerage,
          // 口座別の引出額（収支検算用）。
          //   totalWithdrawn = brokerageWithdrawn + taxableWithdrawn + rothWithdrawn
          brokerageWithdrawn,
          rothWithdrawn,
          totalWithdrawn,
          // 使われずに口座へ戻した現金のうち、RMD超過分ではない部分（SS給付の余りなど）
          incomeSurplusToBrokerage,
          // --- Social Security課税（段階4）。それぞれ意味が異なるので必ず分けて記録する ---
          socialSecurityBenefit,      // その年に受け取るSocial Security給付総額
          provisionalIncome,          // 暫定所得（他の所得 ＋ 非課税利子 ＋ 給付の50%）
          taxableSocialSecurity,      // 給付のうち課税所得に算入される額（最大85%。税額ではない）
          ordinaryTaxableIncome,      // 課税所得の合計（課税繰延引出 ＋ 上記算入額）
          federalTax,                 // 上記に対する連邦所得税の概算額
        });
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

    // ------------------------------------------------------------------
    // Social Security給付の課税（IRC §86 / IRS Publication 915 Worksheet 1）
    //
    // 【重要な考え方】
    //   「給付額の85%が税金になる」のではない。
    //   「給付額のうち最大85%までが課税所得に算入される」であり、
    //   その課税所得に対して通常の連邦所得税率が適用される。
    //   実際の税額は、算入額 × 限界税率 なので、給付額に対する実効負担は
    //   85%よりはるかに小さい。
    //
    // 【計算手順】
    //   1. 暫定所得（provisional income、Pub 915では combined income）
    //        = Social Security以外のAGI ＋ 非課税利子 ＋ 給付額の50%
    //   2. 基準額（base amount）以下 → 算入額ゼロ
    //   3. 基準額〜調整基準額（adjusted base amount）
    //        算入額 = min( 給付額の50%, 超過額の50% )
    //   4. 調整基準額 超 → 次の小さい方
    //        A) 85% ×（暫定所得 − 調整基準額）
    //           ＋ min( 第2段階の算入額, (調整基準額 − 基準額) の50% )
    //        B) 給付額の85%          ← これが法定の上限（絶対に超えない）
    //
    // 【出典】26 U.S.C. §86 / IRS Publication 915。
    //   しきい値は1984年・1994年に定められて以降、物価調整されていない固定額。
    socialSecurityTaxation: {
      // 基準額 / 調整基準額（filing status別）
      // marriedSeparateLivingTogether（同居のまま個別申告）は基準額0で、
      // 最初の1ドルから最大85%まで算入されうる。
      thresholds: {
        single: { base: 25000, adjustedBase: 34000 },
        headOfHousehold: { base: 25000, adjustedBase: 34000 },
        qualifyingSurvivingSpouse: { base: 25000, adjustedBase: 34000 },
        marriedJoint: { base: 32000, adjustedBase: 44000 },
        // 別居のまま個別申告している場合は単身と同じ扱い
        marriedSeparate: { base: 25000, adjustedBase: 34000 },
        marriedSeparateLivingTogether: { base: 0, adjustedBase: 0 },
      },
      maxInclusionRate: 0.85,  // 法定の上限（85%を超えて算入されることはない）
      firstTierRate: 0.50,
      sourceNote: "26 U.S.C. §86 / IRS Publication 915 Worksheet 1. Thresholds are fixed in statute (1984/1994) and are not inflation-adjusted.",
    },
    // 暫定所得（provisional income）を計算する。
    //   otherIncome      : Social Security以外の課税所得（年金・IRA引出・給与など）
    //   taxExemptInterest: 非課税利子（地方債など。課税されないが暫定所得には算入される）
    //   ssBenefit        : その年のSocial Security給付総額
    getProvisionalIncome({ otherIncome, taxExemptInterest, ssBenefit }) {
      const other = Number(otherIncome) || 0;
      const exempt = Number(taxExemptInterest) || 0;
      const benefit = Number(ssBenefit) || 0;
      return other + exempt + benefit * 0.5;
    },
    // Social Security給付のうち「課税所得に算入される額」を計算する（税額ではない）。
    // 返り値は { provisionalIncome, taxableSocialSecurity, inclusionRate }。
    //   inclusionRate は給付額に対する算入割合（0〜0.85）。参考表示用。
    getTaxableSocialSecurity({ filingStatus, otherIncome, taxExemptInterest, ssBenefit }) {
      const benefit = Number(ssBenefit) || 0;
      const cfg = this.socialSecurityTaxation;
      const t = cfg.thresholds[filingStatus] || cfg.thresholds.single;
      const provisionalIncome = this.getProvisionalIncome({ otherIncome, taxExemptInterest, ssBenefit });
      if (benefit <= 0) {
        return { provisionalIncome, taxableSocialSecurity: 0, inclusionRate: 0 };
      }
      // 上限は常に「給付額の85%」
      const maxTaxable = benefit * cfg.maxInclusionRate;
      let taxable;
      if (provisionalIncome <= t.base) {
        taxable = 0;
      } else if (provisionalIncome <= t.adjustedBase) {
        // 第1段階：最大でも給付額の50%
        taxable = Math.min(benefit * cfg.firstTierRate, (provisionalIncome - t.base) * cfg.firstTierRate);
      } else {
        // 第2段階：A と B の小さい方
        const firstTierAmount = Math.min(
          benefit * cfg.firstTierRate,
          (t.adjustedBase - t.base) * cfg.firstTierRate
        );
        const optionA = cfg.maxInclusionRate * (provisionalIncome - t.adjustedBase) + firstTierAmount;
        taxable = Math.min(optionA, maxTaxable);
      }
      taxable = Math.max(0, Math.min(taxable, maxTaxable));
      return {
        provisionalIncome,
        taxableSocialSecurity: taxable,
        inclusionRate: benefit > 0 ? taxable / benefit : 0,
      };
    },
    //
    // 【出典】
    //   - 除数表：IRS Publication 590-B, Appendix B, Table III（Uniform Lifetime Table）。
    //     根拠規則は Treasury Regulation §1.401(a)(9)-9。現行の除数は T.D. 9930（2020-11-12確定）
    //     により 2022-01-01 から適用され、2026年時点でも変更されていない。
    //   - 開始年齢：SECURE 2.0 Act §107。1951〜1959年生まれは73歳、1960年以降生まれは75歳。
    //   - 計算式：RMD = 前年末の口座残高 ÷ その年に到達する年齢の除数。
    //
    // 【このアプリの簡易モデルの前提】（老後資産シミュレーション用の概算）
    //   1. 対象口座は Traditional IRA と 401(k) のみ。Roth IRA は本人存命中はRMD対象外
    //      （相続後の受益者RMDはモデル化しない）。
    //   2. 初回RMDは「翌年4月1日まで繰下げ可能」だが、本モデルでは繰下げず、到達年に
    //      その年ぶんを引き出すものとして扱う（2年分が1年に重なる事象は再現しない）。
    //   3. 「在職中の例外（still-working exception）」は再現しない。勤務先の401(k)は
    //      在職中であればRMDを繰下げられる（IRAには適用されない／5%以上の株主も対象外）が、
    //      本モデルでは退職済みを前提に一律で適用する。
    //   4. 配偶者が10歳超年下で唯一の受益者の場合に使う Joint and Last Survivor Table
    //      （除数が大きくRMDが小さくなる）は使わず、常に Uniform Lifetime Table を使う。
    //   5. 口座ごとの集約規則（401(k)はプランごとに引き出す必要がある等）は再現せず、
    //      対象口座の合計に対して計算する。
    //   6. 未達成時の追徴課税（IRC §4974、25%／是正時10%）は計算しない。
    rmd: {
      // Uniform Lifetime Table（IRS Pub 590-B Appendix B Table III）。キー=年齢、値=除数。
      // 公式表のとおり 73〜120歳を全て収録している（表は「120 and over = 2.0」で終わる）。
      // 121歳以上は表の最終行（120歳以上）と同じ 2.0 を使う。
      uniformLifetimeTable: {
        73: 26.5, 74: 25.5, 75: 24.6, 76: 23.7, 77: 22.9, 78: 22.0, 79: 21.1, 80: 20.2,
        81: 19.4, 82: 18.5, 83: 17.7, 84: 16.8, 85: 16.0, 86: 15.2, 87: 14.4, 88: 13.7,
        89: 12.9, 90: 12.2, 91: 11.5, 92: 10.8, 93: 10.1, 94: 9.5, 95: 8.9, 96: 8.4,
        97: 7.8, 98: 7.3, 99: 6.8, 100: 6.4, 101: 6.0, 102: 5.6, 103: 5.2, 104: 4.9,
        105: 4.6, 106: 4.3, 107: 4.1, 108: 3.9, 109: 3.7, 110: 3.5, 111: 3.4, 112: 3.3,
        113: 3.1, 114: 3.0, 115: 2.9, 116: 2.8, 117: 2.7, 118: 2.5, 119: 2.3, 120: 2.0,
      },
      // RMD対象の口座（Roth IRA と Brokerage は対象外）
      applicableAccounts: ["traditionalIra", "k401"],
      // 開始年齢の分岐（SECURE 2.0 §107）
      startAgeBornBefore1960: 73,
      startAgeBorn1960OrLater: 75,
      birthYearThreshold: 1960,
    },
    // 生年からRMD開始年齢を判定する。1960年以降生まれは75歳、それ以前は73歳。
    // birthYear が不明（未入力・非数値）の場合は、より早く始まる73歳を返す（安全側）。
    getRmdStartAge(birthYear) {
      const y = Number(birthYear);
      if (!Number.isFinite(y) || y <= 0) return this.rmd.startAgeBornBefore1960;
      return y >= this.rmd.birthYearThreshold
        ? this.rmd.startAgeBorn1960OrLater
        : this.rmd.startAgeBornBefore1960;
    },
    // Uniform Lifetime Table の除数を返す。開始年齢未満は null（RMD不要）。
    // 表は公式どおり「120歳以上 = 2.0」で終わるため、121歳以上も 2.0 を返す。
    uniformLifetimeDivisor(age) {
      const a = Math.floor(Number(age));
      const table = this.rmd.uniformLifetimeTable;
      if (!Number.isFinite(a)) return null;
      if (table[a] !== undefined) return table[a];
      const ages = Object.keys(table).map(Number);
      const minAge = Math.min(...ages);
      const maxAge = Math.max(...ages);
      if (a < minAge) return null;
      return table[maxAge];
    },
    // その年に必要なRMD額を計算する。
    //   balances : { traditionalIra, k401, ... } 前年12月31日時点の残高
    //   age      : その年に到達する年齢
    //   birthYear: 開始年齢の判定に使う生年
    // 開始年齢未満、または対象残高が0なら 0 を返す。
    getRequiredMinimumDistribution({ age, birthYear, balances }) {
      const startAge = this.getRmdStartAge(birthYear);
      if (Math.floor(Number(age)) < startAge) return 0;
      const divisor = this.uniformLifetimeDivisor(age);
      if (!divisor || divisor <= 0) return 0;
      const applicable = this.rmd.applicableAccounts
        .reduce((sum, key) => sum + (Number(balances?.[key]) || 0), 0);
      if (applicable <= 0) return 0;
      return applicable / divisor;
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
    // 米国版は投資・年金・医療費・税制のすべてを実装済みのため、未実装の注記は使用しない。
    // （以前はここが "…NotImplementedNote" を指しており、表示条件が変わると
    //   「アメリカ向けは未実装です」と誤表示される潜在バグになっていた。）
    // ただしiDeCoセクション（JP専用）内の税制表示だけは米国向けの案内文へ差し替える。
    investmentNote: null,
    retirementNote: null,
    healthcareNote: null,
    taxNote: "usTaxHandledInInvestmentNote",
  },
  defaults: {},
};
