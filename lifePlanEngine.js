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
// このエンジンは、すべての資産を「プール（pool）」として1本の月次ループで扱い、
// 収入・支出・取り崩しを一度だけ処理する。二重控除・二重加算が構造的に発生しない。
//
// 【純資産の定義（このエンジンでの唯一の定義）】
//   総資産 = 全プール残高の合計（iDeCo受取前残高を含む）
//   純資産 = 総資産 − 借入残高合計
// 保険料は「支払月に資産から出ていくキャッシュアウト」として扱うため、
// 純資産から重ねて引くことはしない（＝二重控除の排除）。
// したがって常に「資産バンドの最上部 − 借入残高 ＝ 純資産線」が成立する。
// ============================================================================

export const NOT_DRAWABLE = Number.POSITIVE_INFINITY;

function monthlyRateFromAnnualPct(annualPct) {
  const pct = Number(annualPct) || 0;
  if (pct <= -100) return -1 / 12;
  return Math.pow(1 + pct / 100, 1 / 12) - 1;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// 浮動小数の誤差で -0.0000001 のような値が残ると「負の資産」に見えるため丸める
const EPS = 1e-6;
function clampZero(v) {
  return v > EPS ? v : 0;
}

/**
 * 資産プールの定義。
 *
 * id                  一意キー
 * group               チャートの帯（バンド）にまとめる単位:
 *                     "investment" | "gold" | "bank" | "stock" | "privatePension" | "ideco"
 * balance             現在残高
 * annualReturnPct     想定年利（%）
 * retireReturnPct     退職後の想定年利（%）。未指定なら annualReturnPct を継続。
 * monthlyContribution 毎月の拠出額（積立）
 * contribEndAge       拠出終了年齢（この年齢まで拠出。未指定なら retireAge）
 * contributionTaxPct  拠出時課税（豪Superの15%など）
 * earningsTaxPct      積立期の運用益課税（豪Superの15%など。退職フェーズでは非課税）
 * accessAge           この年齢未満では取り崩せない（米401k=59.5, 英年金=57 など）
 *                     NOT_DRAWABLE を渡すと生活費の取り崩し対象から完全に外れる
 *                     （iDeCo受取前残高・民間年金積立がこれに当たる）
 * drawOrder           取り崩し順（小さいほど先に取り崩す）
 * minimumDrawdown     (age, balance) => 額。年1回の強制取崩し（加RRIF・豪Super最低取崩し）
 * minimumDrawdownTo   強制取崩し分の移動先プールid（生活費に使える口座へ移す）
 */

/**
 * 統合キャッシュフローシミュレーション。
 *
 * @param {object} p
 * @param {number} p.currentAge
 * @param {number} p.retireAge
 * @param {number} p.deathAge
 * @param {Array}  p.pools              上記の資産プール定義
 * @param {Array}  p.loans              [{ principal, annualRatePct, monthlyPayment }]
 * @param {Array}  p.insurancePolicies  [{ monthlyPremium, premiumFromAge, premiumToAge }]
 * @param {Array}  p.privatePensionPlans[{ poolId, monthlyPayout, payoutFromAge, payoutToAge }]
 *                                      poolId は group:"privatePension" のプールを指す。
 *                                      実際にその月に残高から取り崩せた額だけが収入になる。
 * @param {number} p.livingCostMonthly  退職後の月間生活費
 * @param {function} p.healthCostAnnual (age) => 年間医療費
 * @param {number} p.publicPensionMonthly 公的年金（退職後の月額）
 * @param {function} p.extraIncomeMonthly (age) => 追加の月間収入（iDeCo年金受取など）
 * @param {function} p.extraLumpSum      (age) => その月に一度だけ使える一時金（iDeCo一時金など）
 * @param {string}   p.lumpSumTargetId   一時金の受け皿プールid（通常は現金/銀行）
 * @param {function} p.idecoDrawdown     (age) => iDeCoプールから引き出す額（一時金・年金の原資）
 * @param {string}   p.idecoPoolId
 * @param {Array}    p.investLumpSums    [{ age, amount }] 主要投資口座への一括投資
 * @param {string}   p.investLumpTargetId
 * @param {boolean}  p.chargeFixedCostsBeforeRetirement
 *        退職前もローン返済・保険料を資産から引くか。
 *        既定 false ＝ 積立期は給与から支払われる前提（積立額は「手取りから返済・保険料を
 *        払った後の余剰」として入力されているため、資産から重ねて引くと二重控除になる）。
 *        退職後は給与が無いので、必ず資産から引かれる（＝ここが従来の最大のバグ）。
 */
export function runIntegratedPlan(p) {
  const currentAge = num(p.currentAge);
  const retireAge = num(p.retireAge);
  const deathAge = num(p.deathAge);
  const chargeFixedCostsBeforeRetirement = !!p.chargeFixedCostsBeforeRetirement;

  const totalMonths = Math.max(1, Math.round((deathAge - currentAge) * 12));

  // ---- プール初期化 ----
  const pools = (p.pools || []).map((raw) => ({
    id: raw.id,
    group: raw.group,
    balance: clampZero(num(raw.balance)),
    annualReturnPct: num(raw.annualReturnPct),
    retireReturnPct: raw.retireReturnPct === undefined || raw.retireReturnPct === null
      ? num(raw.annualReturnPct)
      : num(raw.retireReturnPct),
    monthlyContribution: num(raw.monthlyContribution),
    contribEndAge: raw.contribEndAge === undefined || raw.contribEndAge === null
      ? retireAge
      : num(raw.contribEndAge),
    contributionTaxPct: num(raw.contributionTaxPct),
    earningsTaxPct: num(raw.earningsTaxPct),
    accessAge: raw.accessAge === undefined || raw.accessAge === null ? 0 : raw.accessAge,
    drawOrder: raw.drawOrder === undefined || raw.drawOrder === null ? 9999 : num(raw.drawOrder),
    minimumDrawdown: typeof raw.minimumDrawdown === "function" ? raw.minimumDrawdown : null,
    minimumDrawdownTo: raw.minimumDrawdownTo || null,
    contributionFn: typeof raw.contributionFn === "function" ? raw.contributionFn : null,
  }));
  const poolById = new Map(pools.map((x) => [x.id, x]));

  // 取り崩し順（accessAge が来ていないプールは毎月スキップされる）
  const drawSequence = pools
    .filter((x) => x.accessAge !== NOT_DRAWABLE)
    .slice()
    .sort((a, b) => a.drawOrder - b.drawOrder);

  // ---- 借入 ----
  const loans = (p.loans || []).map((l) => ({
    balance: clampZero(num(l.principal)),
    monthlyRate: num(l.annualRatePct) / 1200, // 従来と同じ単利換算を維持
    monthlyPayment: num(l.monthlyPayment),
    payoffAge: null,
  }));

  const insurancePolicies = p.insurancePolicies || [];
  const privatePensionPlans = p.privatePensionPlans || [];

  // 一括投資（NISA成長投資枠など）を月インデックスへ展開
  const lumpByMonth = new Map();
  (p.investLumpSums || []).forEach((entry) => {
    const m = Math.max(1, Math.round((num(entry.age) - currentAge) * 12));
    if (m >= 1 && m <= totalMonths) {
      lumpByMonth.set(m, (lumpByMonth.get(m) || 0) + num(entry.amount));
    }
  });

  const livingCostMonthly = num(p.livingCostMonthly);
  const publicPensionMonthly = num(p.publicPensionMonthly);
  const healthCostAnnual = typeof p.healthCostAnnual === "function" ? p.healthCostAnnual : () => 0;
  const extraIncomeMonthly = typeof p.extraIncomeMonthly === "function" ? p.extraIncomeMonthly : () => 0;
  const extraLumpSum = typeof p.extraLumpSum === "function" ? p.extraLumpSum : () => 0;
  const idecoDrawdown = typeof p.idecoDrawdown === "function" ? p.idecoDrawdown : () => 0;

  const totalAssets = () => pools.reduce((s, x) => s + x.balance, 0);
  const totalLoans = () => loans.reduce((s, l) => s + l.balance, 0);

  let depletionAge = null;
  let cumulativeUnmet = 0;      // 資産が尽きて払えなかった額の累計
  let cumulativePremiums = 0;   // 参考表示用（純資産からは引かない）
  let cumulativeLoanInterest = 0;
  let cumulativeLoanPrincipal = 0;

  const snapshot = (age) => {
    const row = {
      // 表示用の整数年齢。現在年齢は 58.66 のような小数になるため、
      // Math.round だと 58歳台が「59歳」と表示され、グラフの横軸が1歳ずれていた。
      // 「その時点で実際に到達している年齢」＝ Math.floor を使う。
      age: Math.floor(age + 1e-9),
      // 計算に使った実際の年齢（小数）。表示用の age とは分けて保持する。
      exactAge: age,
      loanBalance: clampZero(totalLoans()),
      cumulativeUnmet,
      cumulativePremiums,
    };
    // グループ別の帯（チャートのAreaはこのキーを使う）
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
    // 生活費に使える資産（iDeCo受取前残高・民間年金積立は除く）
    row.spendableAssets = clampZero(
      pools.reduce((s, x) => (x.accessAge === NOT_DRAWABLE ? s : s + x.balance), 0)
    );
    // ★ 唯一の純資産定義。バンド最上部 − 借入残高。
    row.netWorth = row.totalAssets - row.loanBalance;
    return row;
  };

  const yearly = [snapshot(currentAge)];

  for (let m = 1; m <= totalMonths; m++) {
    const age = currentAge + m / 12;
    const retired = age >= retireAge;

    // ---------------- 1. 運用（成長） ----------------
    pools.forEach((x) => {
      const basePct = retired ? x.retireReturnPct : x.annualReturnPct;
      // 積立期の運用益課税（豪Super等）。退職フェーズでは非課税。
      const effPct = (!retired && x.earningsTaxPct > 0)
        ? basePct * (1 - x.earningsTaxPct / 100)
        : basePct;
      x.balance = x.balance * (1 + monthlyRateFromAnnualPct(effPct));
    });

    // ---------------- 2. 拠出（積立） ----------------
    pools.forEach((x) => {
      // contributionFn があればそちらを優先（NISAの年間/生涯上限のように、
      // 月ごとに拠出可能額が変わるケースを呼び出し側で表現できるようにする）
      let gross;
      if (x.contributionFn) {
        gross = clampZero(num(x.contributionFn(age, m)));
      } else {
        if (x.monthlyContribution <= 0 || age > x.contribEndAge) return;
        gross = x.monthlyContribution;
      }
      if (gross <= 0) return;
      x.balance += gross * (1 - x.contributionTaxPct / 100);
    });

    // 主要投資口座への一括投資
    const lump = lumpByMonth.get(m) || 0;
    if (lump > 0 && p.investLumpTargetId && poolById.has(p.investLumpTargetId)) {
      poolById.get(p.investLumpTargetId).balance += lump;
    }

    // ---------------- 3. 強制取崩し（加RRIF / 豪Super最低取崩し） ----------------
    // 年1回、誕生月に実行。引き出した額は生活費に使える口座へ移すだけで、
    // 総資産は変わらない（＝二重加算しない）。
    if (m % 12 === 0) {
      pools.forEach((x) => {
        if (!x.minimumDrawdown || !retired || x.balance <= 0) return;
        if (x.accessAge !== NOT_DRAWABLE && age < x.accessAge) return;
        const amount = Math.min(x.balance, clampZero(num(x.minimumDrawdown(age, x.balance))));
        if (amount <= 0) return;
        x.balance -= amount;
        const target = x.minimumDrawdownTo ? poolById.get(x.minimumDrawdownTo) : null;
        if (target) target.balance += amount;
        else x.balance += amount; // 移動先が無ければ動かさない（安全側）
      });
    }

    // ---------------- 4. 収入 ----------------
    let income = 0;

    if (retired) income += publicPensionMonthly;

    // 民間年金：実際にその月に残高から取り崩せた額だけが収入になる。
    // 残高が0なら収入も0（＝従来の「残高0でも払われ続ける」バグの修正）。
    privatePensionPlans.forEach((pl) => {
      if (age < num(pl.payoutFromAge) || age > num(pl.payoutToAge)) return;
      const pool = poolById.get(pl.poolId);
      if (!pool || pool.balance <= 0) return;
      const paid = Math.min(pool.balance, num(pl.monthlyPayout));
      pool.balance -= paid;
      income += paid;
    });

    // iDeCo：受取原資はiDeCoプール残高から引き出す（残高以上は出ない）
    const idecoWant = clampZero(num(idecoDrawdown(age)));
    if (idecoWant > 0 && p.idecoPoolId && poolById.has(p.idecoPoolId)) {
      const pool = poolById.get(p.idecoPoolId);
      const taken = Math.min(pool.balance, idecoWant);
      pool.balance -= taken;
      income += taken;
    }

    // その他の追加収入（残高の裏付けが不要なもの）
    income += clampZero(num(extraIncomeMonthly(age)));

    // 一時金（iDeCo一時金など）は「収入」ではなく資産の移し替え。
    // 受け皿プールへ加算するだけ（二重加算防止のため収入には入れない）。
    const lumpIn = clampZero(num(extraLumpSum(age)));
    if (lumpIn > 0 && p.lumpSumTargetId && poolById.has(p.lumpSumTargetId)) {
      poolById.get(p.lumpSumTargetId).balance += lumpIn;
    }

    // ---------------- 5. 支出 ----------------
    let outflow = 0;

    if (retired) {
      outflow += livingCostMonthly;
      outflow += clampZero(num(healthCostAnnual(age))) / 12;
    }

    // 保険料：支払月のキャッシュアウトとして扱う（純資産からの恒久控除は廃止）
    let premiumThisMonth = 0;
    insurancePolicies.forEach((pol) => {
      if (age >= num(pol.premiumFromAge) && age <= num(pol.premiumToAge)) {
        premiumThisMonth += num(pol.monthlyPremium);
      }
    });
    cumulativePremiums += premiumThisMonth;

    // ローン返済：利息を計上し、実際に払える額だけ元本を減らす。
    // 返済額は必ずどこかの資産から出ていく（＝純資産の永久機関の修正）。
    let loanPaymentThisMonth = 0;
    loans.forEach((l) => {
      if (l.balance <= 0) return;
      const interest = l.balance * l.monthlyRate;
      const due = l.balance + interest;
      const pay = Math.min(l.monthlyPayment, due);
      l.balance = clampZero(due - pay);
      loanPaymentThisMonth += pay;
      cumulativeLoanInterest += interest;
      cumulativeLoanPrincipal += clampZero(pay - interest);
      if (l.balance <= 0 && l.payoffAge === null) l.payoffAge = age;
    });

    // 積立期は給与から支払われる前提（既定）。退職後は必ず資産から出る。
    const chargeFixed = retired || chargeFixedCostsBeforeRetirement;
    if (chargeFixed) {
      outflow += premiumThisMonth;
      outflow += loanPaymentThisMonth;
    }

    // ---------------- 6. 収支の精算 ----------------
    let net = income - outflow;

    if (net < 0) {
      // 不足分を、取り崩し可能な資産から順番に取り崩す
      let need = -net;
      for (const pool of drawSequence) {
        if (need <= EPS) break;
        if (pool.balance <= EPS) continue;
        if (age < pool.accessAge) continue; // 引出制限中の退職口座は手を付けない
        const take = Math.min(pool.balance, need);
        pool.balance = clampZero(pool.balance - take);
        need -= take;
      }
      if (need > EPS) {
        // 取り崩せる資産が尽きた。資産はマイナスにしない（負数を作らない）。
        cumulativeUnmet += need;
        if (depletionAge === null) depletionAge = age;
      }
    } else if (net > 0 && p.surplusTargetId && poolById.has(p.surplusTargetId)) {
      // 余剰（年金が生活費を上回るなど）は現金プールへ積む
      poolById.get(p.surplusTargetId).balance += net;
    }

    // 誤差の掃除（負数・NaNを絶対に出さない）
    pools.forEach((x) => { x.balance = clampZero(Number.isFinite(x.balance) ? x.balance : 0); });

    if (m % 12 === 0) yearly.push(snapshot(age));
  }

  // 現在年齢が小数（例：58.66歳）のとき、最後の12ヶ月区切りは deathAge に届かない
  // （58.66 → 59.66 → … → 94.66 で終わり、95歳が記録されない）。
  // 死亡想定年齢のスナップショットを必ず1件だけ追加し、年齢の欠落をなくす。
  const finalDisplayAge = Math.floor(deathAge + 1e-9);
  if (yearly[yearly.length - 1].age < finalDisplayAge) {
    yearly.push(snapshot(deathAge));
  }

  const last = yearly[yearly.length - 1];
  return {
    yearly,
    finalNetWorth: last.netWorth,
    finalAssets: last.totalAssets,
    depletionAge,
    cumulativeUnmet,
    cumulativePremiums,
    cumulativeLoanInterest,
    cumulativeLoanPrincipal,
    loanPayoffAges: loans.map((l) => l.payoffAge),
    peakNetWorth: yearly.reduce((mx, r) => Math.max(mx, r.netWorth), -Infinity),
  };
}
