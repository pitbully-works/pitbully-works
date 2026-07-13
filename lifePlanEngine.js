// ============================================================================
// lifePlanEngine.js
//
// 「総資産推移」専用の統合キャッシュフローエンジン。
//
// 【なぜ必要か】
// 従来は NISA / 金 / 銀行預金 / 個別株 / 民間年金 / iDeCo / 借入金 / 保険料 を
// それぞれ独立したシミュレーションで計算し、あとから配列の [i] 番目どうしを
// 足し合わせて総資産・純資産を作っていた。その結果、
//   ・退職後の不足額が NISA からしか引かれない（NISA が尽きると不足が消滅する）
//   ・ローン返済の原資がどの資産からも出ていない（返済すると純資産が増える）
//   ・民間年金が残高0のあとも収入として出続ける
//   ・保険料が資産からではなく純資産からだけ恒久控除される
// という不整合が起きていた。
//
// このエンジンは、すべての資産を「プール（pool）」として1本の時系列ループで扱い、
// 収入・支出・取り崩しを一度だけ処理する。二重控除・二重加算が構造的に発生しない。
//
// 【純資産の定義（このエンジンでの唯一の定義）】
//   総資産 = 全プール残高の合計（iDeCo受取前残高を含む）
//   純資産 = 総資産 − 借入残高合計
// 保険料は「支払時に資産から出ていくキャッシュアウト」として扱うため、
// 純資産から重ねて引くことはしない（＝二重控除の排除）。
// したがって常に「資産バンドの最上部 − 借入残高 ＝ 純資産線」が成立する。
//
// 【時間軸】
// 現在年齢は 58.66歳 のような小数になる。単純に12ヶ月刻みで記録すると
// 58.66 → 59.66 → 60.66 … となり、「65歳」と表示される行の中身が実際には
// 65.66歳時点の残高になってしまう。
// そこで buildAgeSteps() で「次の誕生日までを細かく刻み、以降は各誕生日で
// ちょうど区切る」可変長ステップを作る。スナップショットは必ず誕生日（整数年齢）
// および deathAge ちょうどで記録されるので、表示年齢と exactAge は常に一致する。
// deathAge までの残り期間も最後のステップで必ず計算される。
// ============================================================================

export const NOT_DRAWABLE = Number.POSITIVE_INFINITY;

const EPS = 1e-6;

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function clampZero(v) {
  return v > EPS ? v : 0;
}
// dt年ぶんの複利成長係数
function growthFactor(annualPct, dt) {
  const pct = num(annualPct);
  if (pct <= -100) return Math.max(0, 1 - dt);
  return Math.pow(1 + pct / 100, dt);
}

/**
 * 年齢ステップの生成。
 *
 * ・現在年齢から「次の誕生日」までを、およそ1ヶ月ずつに分割する
 * ・以降は各誕生日でちょうど区切る（1年 ≒ 12ステップ）
 * ・最後は deathAge ちょうどで終わる（deathAge までの残り期間も必ず計算される）
 * ・snapshot=true のステップの終了時点が、誕生日 または deathAge ちょうどに一致する
 *
 * 例：currentAge=58.66, deathAge=95
 *   → 59.0（記録）→ 60.0（記録）→ … → 95.0（記録）
 *
 * エンジンと呼び出し側（NISA枠の事前計算など）が同じ添字を共有できるよう、
 * 決定的な純関数として公開する。
 */
export function buildAgeSteps(currentAge, deathAge, boundaries) {
  const start = num(currentAge);
  const end = num(deathAge);
  const steps = [];
  if (end <= start + EPS) return steps;

  // 区切りたい年齢（誕生日 ＋ 各種の境界年齢）を集めて昇順に並べる。
  // 境界がステップの途中にあると、その1ヶ月ぶんが丸ごと「境界の内側」または
  // 「外側」と判定され、終了年齢ちょうどのはずが1ヶ月分よけいに加算されてしまう。
  const cuts = new Set();
  for (let a = Math.ceil(start - EPS); a <= Math.floor(end + EPS); a++) {
    if (a > start + EPS && a < end - EPS) cuts.add(a);
  }
  (boundaries || []).forEach((b) => {
    const v = Number(b);
    if (Number.isFinite(v) && v > start + EPS && v < end - EPS) cuts.add(v);
  });
  const cutList = Array.from(cuts).sort((a, b) => a - b);

  // 区間を、およそ1ヶ月ずつのステップに分割する
  const pushSpan = (from, to, isBirthday) => {
    const span = to - from;
    if (span <= EPS) return;
    const n = Math.max(1, Math.round(span * 12));
    for (let i = 1; i <= n; i++) {
      const last = i === n;
      steps.push({
        dt: span / n,
        // 最後のステップは浮動小数の誤差を避けるため区間の終端をそのまま使う
        age: last ? to : from + (span * i) / n,
        // スナップショットは誕生日（整数年齢）と deathAge のみ。境界年齢では記録しない。
        snapshot: last && isBirthday,
      });
    }
  };

  let a = start;
  cutList.forEach((cut) => {
    const isBirthday = Math.abs(cut - Math.round(cut)) < EPS;
    pushSpan(a, cut, isBirthday);
    a = cut;
  });
  pushSpan(a, end, true); // 最終区間は deathAge ちょうどで終わり、必ず記録する
  return steps;
}

/**
 * 統合キャッシュフローシミュレーション。
 *
 * @param {object} p
 * @param {number} p.currentAge / p.retireAge / p.deathAge
 * @param {Array}  p.pools     資産プール
 * @param {Array}  p.loans     [{ principal, annualRatePct, monthlyPayment }]
 * @param {Array}  p.insurancePolicies   [{ monthlyPremium, premiumFromAge, premiumToAge }]
 * @param {Array}  p.privatePensionPlans [{ poolId, monthlyPayout, payoutFromAge, payoutToAge }]
 * @param {Array}  p.publicPensions      [{ monthlyAmount, startAge }]
 *        公的年金。国ごとに受給開始年齢が異なる（US: Social Security の claim age、
 *        GB: State Pension の effective claim age、CA: CPP と OAS で別々、
 *        AU: Age Pension の qualifying age）ため、ストリームごとに開始年齢を持つ。
 *        退職年齢からは自動的に始まらない。
 * @param {number}   p.livingCostMonthly  退職後の月間生活費
 * @param {function} p.healthCostAnnual   (age) => 年間医療費
 * @param {number}   p.idecoLumpAmount / p.idecoLumpAge  iDeCo一時金（到達時に一度だけ）
 * @param {function} p.idecoAnnuityMonthly (age) => iDeCo年金の月額
 * @param {string}   p.idecoPoolId
 * @param {string}   p.surplusTargetId    余剰金・一時金の受け皿プールid
 * @param {boolean}  p.chargeFixedCostsBeforeRetirement
 *        退職前もローン返済・保険料を資産から引くか。既定 false
 *        （積立期は給与から支払われる前提。積立額は返済・保険料を払った後の余剰のため、
 *          資産から重ねて引くと二重控除になる）。
 */
export function runIntegratedPlan(p) {
  const currentAge = num(p.currentAge);
  const retireAge = num(p.retireAge);
  const deathAge = num(p.deathAge);
  const chargeFixedCostsBeforeRetirement = !!p.chargeFixedCostsBeforeRetirement;

  // ---- プール ----
  const pools = (p.pools || []).map((raw) => ({
    id: raw.id,
    group: raw.group,
    balance: clampZero(num(raw.balance)),
    annualReturnPct: num(raw.annualReturnPct),
    retireReturnPct: raw.retireReturnPct === undefined || raw.retireReturnPct === null
      ? num(raw.annualReturnPct) : num(raw.retireReturnPct),
    monthlyContribution: num(raw.monthlyContribution),
    contribEndAge: raw.contribEndAge === undefined || raw.contribEndAge === null
      ? retireAge : num(raw.contribEndAge),
    contributionTaxPct: num(raw.contributionTaxPct),
    earningsTaxPct: num(raw.earningsTaxPct),
    accessAge: raw.accessAge === undefined || raw.accessAge === null ? 0 : raw.accessAge,
    drawOrder: raw.drawOrder === undefined || raw.drawOrder === null ? 9999 : num(raw.drawOrder),
    minimumDrawdown: typeof raw.minimumDrawdown === "function" ? raw.minimumDrawdown : null,
    minimumDrawdownTo: raw.minimumDrawdownTo || null,
    contributionFn: typeof raw.contributionFn === "function" ? raw.contributionFn : null,
    // 引出時課税（%）。取り崩した金額に対してこの率で課税され、手取りが目減りするため、
    // 必要額を賄うには「必要額 ÷ (1 − 税率)」を口座から引き出す必要がある。
    // 非課税口座（NISA / Roth IRA / ISA / TFSA / 豪Super(60歳以降) など）は 0。
    withdrawalTaxPct: Math.min(99, Math.max(0, num(raw.withdrawalTaxPct))),
    drawCategory: raw.drawCategory || null,
  }));
  const poolById = new Map(pools.map((x) => [x.id, x]));
  const drawSequence = pools
    .filter((x) => x.accessAge !== NOT_DRAWABLE)
    .slice()
    .sort((a, b) => a.drawOrder - b.drawOrder);

  // ---- 借入 ----
  const loans = (p.loans || []).map((l) => ({
    balance: clampZero(num(l.principal)),
    monthlyRate: num(l.annualRatePct) / 1200,
    monthlyPayment: num(l.monthlyPayment),
    payoffAge: null,
  }));

  const insurancePolicies = p.insurancePolicies || [];
  const privatePensionPlans = p.privatePensionPlans || [];
  const publicPensions = p.publicPensions || [];

  const livingCostMonthly = num(p.livingCostMonthly);
  const healthCostAnnual = typeof p.healthCostAnnual === "function" ? p.healthCostAnnual : () => 0;
  const idecoAnnuityMonthly = typeof p.idecoAnnuityMonthly === "function" ? p.idecoAnnuityMonthly : () => 0;
  const idecoLumpAmount = clampZero(num(p.idecoLumpAmount));
  const idecoLumpAge = (p.idecoLumpAge === undefined || p.idecoLumpAge === null) ? null : num(p.idecoLumpAge);
  const idecoPool = p.idecoPoolId ? poolById.get(p.idecoPoolId) : null;
  const surplusPool = p.surplusTargetId ? poolById.get(p.surplusTargetId) : null;

  let depletionAge = null;
  let cumulativeUnmet = 0;        // 生活費・医療費・保険料で払えなかった額の累計
  let cumulativeUnpaidLoan = 0;   // 資産不足で払えなかったローン返済額の累計
  let cumulativePremiums = 0;
  let cumulativeLoanInterest = 0;
  let cumulativeLoanPrincipal = 0;
  let idecoLumpPaid = false;
  let cumulativeWithdrawalTax = 0;   // 引出時課税として失われた額の累計

  const totalAssets = () => pools.reduce((s, x) => s + x.balance, 0);
  const totalLoans = () => loans.reduce((s, l) => s + l.balance, 0);

  const snapshot = (age) => {
    const row = {
      // ステップは必ず誕生日ちょうどで区切られるため、表示年齢と exactAge は一致する
      // （「65歳」の行の中身は本当に65.0歳時点の残高）。
      // 先頭行だけは小数年齢（例：58.66歳）なので、切り上げず「到達している年齢」を使う。
      age: Math.floor(age + 1e-9),
      exactAge: age,
      loanBalance: clampZero(totalLoans()),
      cumulativeWithdrawalTax,
      cumulativeUnmet,
      cumulativeUnpaidLoan,
      cumulativePremiums,
    };
    loans.forEach((l, i) => { row[`loan_${i}`] = clampZero(l.balance); });
    const groups = { investment: 0, gold: 0, bank: 0, stock: 0, privatePension: 0, ideco: 0 };
    pools.forEach((x) => {
      groups[x.group] = (groups[x.group] || 0) + x.balance;
      row[`pool_${x.id}`] = clampZero(x.balance);
    });
    row.investmentValue = clampZero(groups.investment);
    row.goldValue = clampZero(groups.gold);
    row.bankValue = clampZero(groups.bank);
    row.stockValue = clampZero(groups.stock);
    row.pensionValue = clampZero(groups.privatePension);
    row.idecoLockedValue = clampZero(groups.ideco);
    row.totalAssets = clampZero(totalAssets());
    row.spendableAssets = clampZero(
      pools.reduce((s, x) => (x.accessAge === NOT_DRAWABLE ? s : s + x.balance), 0)
    );
    row.netWorth = row.totalAssets - row.loanBalance; // ★ 唯一の純資産定義
    return row;
  };

  const yearly = [snapshot(currentAge)];
  const steps = buildAgeSteps(currentAge, deathAge, p.boundaries);

  for (let i = 0; i < steps.length; i++) {
    const { dt, age, snapshot: isBirthday } = steps[i];
    const months = dt * 12;
    // 【重要】収入・支出の資格判定は「ステップ開始時点の年齢」で行う。
    // 終了時点の年齢で判定すると、67歳の誕生日を迎える最後の1ヶ月（66.92〜67.0）が
    // 「67歳以上」と判定され、受給開始前に1ヶ月ぶん年金が出てしまう。
    const ageStart = age - dt;
    const retired = ageStart >= retireAge - EPS;

    // -------- 1. 運用（成長） --------
    pools.forEach((x) => {
      const basePct = retired ? x.retireReturnPct : x.annualReturnPct;
      // 積立期の運用益課税（豪Super等）。退職フェーズでは非課税。
      const effPct = (!retired && x.earningsTaxPct > 0)
        ? basePct * (1 - x.earningsTaxPct / 100)
        : basePct;
      x.balance = x.balance * growthFactor(effPct, dt);
    });

    // -------- 2. 拠出（積立） --------
    pools.forEach((x) => {
      let gross;
      if (x.contributionFn) {
        gross = clampZero(num(x.contributionFn(age, dt, i)));
      } else {
        // 積立も [.., contribEndAge) の開区間。終了年齢ちょうどで拠出が止まる。
        if (x.monthlyContribution <= 0 || ageStart >= x.contribEndAge - EPS) return;
        gross = x.monthlyContribution * months;
      }
      if (gross <= 0) return;
      x.balance += gross * (1 - x.contributionTaxPct / 100);
    });

    // -------- 3. 強制取崩し（加RRIF / 豪Super最低取崩し）--------
    // 誕生日に年1回。生活費に使える口座へ移すだけで総資産は変わらない（二重加算しない）。
    if (isBirthday) {
      pools.forEach((x) => {
        if (!x.minimumDrawdown || x.balance <= 0) return;
        if (age < retireAge - EPS) return;
        if (x.accessAge !== NOT_DRAWABLE && age < x.accessAge) return;
        const target = x.minimumDrawdownTo ? poolById.get(x.minimumDrawdownTo) : null;
        if (!target) return;
        const amount = Math.min(x.balance, clampZero(num(x.minimumDrawdown(age, x.balance))));
        if (amount <= 0) return;
        x.balance -= amount;
        target.balance += amount;
      });
    }

    // -------- 4. 収入 --------
    let cash = 0;

    // 公的年金：ストリームごとの受給開始年齢に達してから。退職年齢では始まらない。
    publicPensions.forEach((ps) => {
      if (ageStart >= num(ps.startAge) - EPS) cash += num(ps.monthlyAmount) * months;
    });

    // 民間年金：その期間に残高から実際に取り崩せた額だけが収入になる
    privatePensionPlans.forEach((pl) => {
      // 受給期間は [payoutFromAge, payoutToAge) の開区間。終了年齢ちょうどに到達したら
      // その時点で終了し、1ヶ月ぶん余計に払わない。
      if (ageStart < num(pl.payoutFromAge) - EPS || ageStart >= num(pl.payoutToAge) - EPS) return;
      const pool = poolById.get(pl.poolId);
      if (!pool || pool.balance <= 0) return;
      const paid = Math.min(pool.balance, num(pl.monthlyPayout) * months);
      pool.balance -= paid;
      cash += paid;
    });

    // iDeCo：年金・一時金とも残高が原資（残高以上は出ない）
    if (idecoPool) {
      const want = clampZero(num(idecoAnnuityMonthly(ageStart))) * months;
      if (want > 0) {
        const taken = Math.min(idecoPool.balance, want);
        idecoPool.balance -= taken;
        cash += taken;
      }
      // 一時金：受取年齢に到達した最初のステップで一度だけ。
      // 収入ではなく資産の移し替えなので、使われなければ余剰として現金プールに残る。
      if (!idecoLumpPaid && idecoLumpAge !== null && idecoLumpAmount > 0 && ageStart >= idecoLumpAge - EPS) {
        const taken = Math.min(idecoPool.balance, idecoLumpAmount);
        idecoPool.balance -= taken;
        cash += taken;
        idecoLumpPaid = true;
      }
    }

    // 支払い：まず手元資金（収入）から、足りなければ取り崩し可能な資産から。
    // 実際に払えた額（paid）と払えなかった額（shortfall）を返す。
    const pay = (amount) => {
      let need = amount;
      if (need <= EPS) return { paid: 0, shortfall: 0 };
      const fromCash = Math.min(cash, need);
      cash -= fromCash;
      need -= fromCash;
      if (need > EPS) {
        for (const pool of drawSequence) {
          if (need <= EPS) break;
          if (pool.balance <= EPS) continue;
          if (ageStart < pool.accessAge) continue; // 引出制限中の退職口座は手を付けない
          // 引出時課税：手取り need を得るには gross = need / (1 - 税率) を引き出す必要がある
          const keep = 1 - pool.withdrawalTaxPct / 100;
          const grossWanted = keep > 0 ? need / keep : Infinity;
          const gross = Math.min(pool.balance, grossWanted);
          const net = gross * keep;
          pool.balance = clampZero(pool.balance - gross);
          cumulativeWithdrawalTax += gross - net;
          need -= net;
        }
      }
      const shortfall = Math.max(0, need);
      return { paid: amount - shortfall, shortfall };
    };

    // -------- 5. 支出（生活費・医療費・保険料）--------
    const chargeFixed = retired || chargeFixedCostsBeforeRetirement;

    let premium = 0;
    insurancePolicies.forEach((pol) => {
      // 払込期間も [premiumFromAge, premiumToAge) の開区間
      if (ageStart >= num(pol.premiumFromAge) - EPS && ageStart < num(pol.premiumToAge) - EPS) {
        premium += num(pol.monthlyPremium) * months;
      }
    });
    cumulativePremiums += premium;

    let essentials = 0;
    if (retired) {
      essentials += livingCostMonthly * months;
      essentials += clampZero(num(healthCostAnnual(ageStart))) * dt;
    }
    if (chargeFixed) essentials += premium;

    if (essentials > EPS) {
      const r = pay(essentials);
      if (r.shortfall > EPS) {
        cumulativeUnmet += r.shortfall;
        if (depletionAge === null) depletionAge = age;
      }
    }

    // -------- 6. ローン返済 --------
    // 【修正】従来は資産が0でも返済したことにしてローン残高を減らしていた。
    // 実際に支払えた金額だけ元本を減らし、支払えなかった分は残高に残す。
    // 利息は残高に組み入れられ、翌期以降へ繰り越される。
    loans.forEach((l) => {
      if (l.balance <= EPS) return;
      const interest = l.balance * l.monthlyRate * months;
      l.balance += interest;
      cumulativeLoanInterest += interest;

      const due = Math.min(l.monthlyPayment * months, l.balance);
      if (due <= EPS) return;

      if (!chargeFixed) {
        // 積立期：給与から支払われる前提（資産からは引かない）
        l.balance = clampZero(l.balance - due);
        cumulativeLoanPrincipal += Math.max(0, due - interest);
      } else {
        const r = pay(due);
        l.balance = clampZero(l.balance - r.paid);
        cumulativeLoanPrincipal += Math.max(0, r.paid - interest);
        if (r.shortfall > EPS) {
          cumulativeUnpaidLoan += r.shortfall;
          if (depletionAge === null) depletionAge = age;
        }
      }
      if (l.balance <= EPS && l.payoffAge === null) l.payoffAge = age;
    });

    // -------- 7. 余剰金 --------
    if (cash > EPS && surplusPool) surplusPool.balance += cash;

    pools.forEach((x) => { x.balance = clampZero(Number.isFinite(x.balance) ? x.balance : 0); });

    if (isBirthday) yearly.push(snapshot(age));
  }

  const last = yearly[yearly.length - 1];
  return {
    yearly,
    finalNetWorth: last.netWorth,
    finalAssets: last.totalAssets,
    depletionAge,
    cumulativeUnmet,
    cumulativeUnpaidLoan,
    cumulativePremiums,
    cumulativeLoanInterest,
    cumulativeLoanPrincipal,
    cumulativeWithdrawalTax,
    loanPayoffAges: loans.map((l) => l.payoffAge),
    peakNetWorth: yearly.reduce((mx, r) => Math.max(mx, r.netWorth), -Infinity),
  };
}
