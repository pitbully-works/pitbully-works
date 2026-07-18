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
 *        monthlyAmountAt(age, ctx) を持つ場合はそちらが優先される。
 *        ctx = { assessedAssets, deemedAssets, totalAssets }。
 *        assessedAssets は assessedPoolIds（プールidの配列）で指定したプールの残高合計、
 *        deemedAssets は deemedPoolIds で指定したプールの残高合計。どちらも未指定なら null。
 *        資力調査のある公的年金（豪Age Pension）はこれを使って毎ステップ再判定する。
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
 * @param {number}   p.initialSurplusBalance 現在までに貯まっている余剰金の初期残高。
 *        既存の銀行残高の内数として扱い、銀行残高合計を上限に頭打ちする。総資産には加算しない。
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
    // 強制取崩しが「退職していること」を条件とするか。
    //   豪Super：pension phase（退職等の解放条件を満たすこと）が前提なので true（既定）。
    //   加RRIF：就労を続けていても年齢だけで義務が発生するので false を明示的に渡す。
    minimumDrawdownRequiresRetirement:
      raw.minimumDrawdownRequiresRetirement === undefined || raw.minimumDrawdownRequiresRetirement === null
        ? true : !!raw.minimumDrawdownRequiresRetirement,
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
  // 一時支出（第4段階4a）が引き落とす先＝銀行グループのプールのみ。drawOrder 昇順。
  // 余剰金は銀行預金プールの内数なので、その消費はこの銀行プールからだけ差し引く。
  const bankDrawPools = pools
    .filter((x) => x.group === "bank")
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
  // 余剰金（使われず残った現金）の入金先。既定は surplusTargetId（＝銀行プール）。
  // 指定が見つからなくても現金を失わない（総資産を保存する）よう、
  //   ① surplusTargetId のプール → ② 最初の銀行プール → ③ 最初のプール
  // の順にフォールバック先を決める。
  const surplusDepositPool = surplusPool || bankDrawPools[0] || pools[0] || null;
  // 余剰金残高（表示用の台帳）を積み増すのは「surplusTargetId で明示指定され、かつ
  // 銀行グループ」のときだけ。②③のフォールバックに落ちた場合は、cash は総資産として
  // 保存はするが余剰金残高には計上しない（Problem 2：置き場所が無いのに表示だけ増える
  // 不整合を防ぐ）。
  const trackSurplusLedger = !!surplusPool && surplusPool.group === "bank";

  let depletionAge = null;
  let cumulativeUnmet = 0;        // 生活費・医療費・保険料で払えなかった額の累計
  let cumulativeUnpaidLoan = 0;   // 資産不足で払えなかったローン返済額の累計
  let cumulativePremiums = 0;
  let cumulativeLoanInterest = 0;
  let cumulativeLoanPrincipal = 0;
  let idecoLumpPaid = false;
  let cumulativeWithdrawalTax = 0;   // 引出時課税として失われた額の累計

  // ---- 余剰金残高（surplusBalance）----
  // 【定義】銀行プールの中にある「余剰金由来（＝収入が使われずに残って積み上がった分、
  //   および利用者が初期入力した既存の余剰金）」の元本残高。単なる発生累計ではなく、
  //   実際に銀行に残っている余剰金の残高を表す。関数スコープの局所変数なので、呼ぶたびに
  //   必ず initialSurplusBalance から始まる（再実行で二重加算されない）。
  //
  // 【初期値】p.initialSurplusBalance（利用者が「現在までに貯まっている余剰金」として入力）。
  //   これは既存の銀行残高の一部を「余剰金」として区別するラベルなので、銀行残高の合計を
  //   上限に頭打ちする（銀行残高を超える初期余剰は指定できない＝二重計上・不変条件破りを防ぐ）。
  //   総資産には一切加算しない（銀行残高の内数）。
  // 【増える時】surplusDepositPool（既定は銀行）へ余剰の cash を入金したとき、同額だけ増える。
  // 【減る時】銀行プールを取り崩したとき（生活費・医療費・保険料・ローン返済・一時支出の
  //   いずれでも）、reduceSurplusByBankDraw を通して実際に引かれた額だけ減る（余剰金を
  //   先に使う仕様＝surplus-first）。0未満にはしない。
  //
  // 【不変条件】常に 0 ≤ surplusBalance ≤ 銀行プール残高の合計。
  //   （初期値も銀行合計で頭打ち。増加は銀行入金と同額、減少は銀行取崩しと同額を上限に
  //     減らすため、破れない。）
  //
  // 【重要・この値は表示専用】どのプール残高にも足し込まないため、totalAssets /
  //   netWorth / bankValue などの資産計算には一切算入されない。したがって
  //   surplusBalance を丸ごと消しても、資産・純資産の数値は 1 円も変わらない
  //   （＝初期余剰金を入力しても総資産は増えない）。
  const initialBankTotal = bankDrawPools.reduce((s, bp) => s + Math.max(0, bp.balance), 0);
  let surplusBalance = Math.min(clampZero(num(p.initialSurplusBalance)), initialBankTotal);

  // 銀行プールから実際に引かれた額だけ、余剰金台帳を減らす共通関数。
  // 通常支出（pay 経由）も一時支出も、銀行の取り崩しはすべてここを一元的に通す。
  // 余剰金を先に使う（surplus-first）ので、引かれた額をそのまま減じて 0 で頭打ちする。
  const reduceSurplusByBankDraw = (bankGrossDrawn) => {
    if (!(bankGrossDrawn > EPS)) return;
    surplusBalance = clampZero(surplusBalance - bankGrossDrawn);
  };

  // ---- 一時支出（余剰金を使う）----
  // 指定年齢に到達したとき、余剰金の範囲で銀行プールから「一度だけ」差し引く一時支出。
  // oneTimeExpenses が未指定/空なら、このブロックは完全に無効（従来と1円も変わらない）。
  // 関数スコープの paid フラグで、シミュレーション再実行でも二重に引かれない。
  //
  // 【Problem 3 対策】現在年齢より過去の一時支出は無視する。過去の支出は既に現在の
  //   銀行残高へ反映済みのはずで、最初のステップで現在残高から引くと二重控除になるため。
  const oneTimeExpenses = (p.oneTimeExpenses || [])
    .map((e) => ({
      id: e.id === undefined || e.id === null ? null : e.id,
      age: num(e.age),
      amount: clampZero(num(e.amount)),
      paid: false,
    }))
    .filter((e) => e.amount > 0 && e.age >= currentAge - EPS);
  let cumulativeOneTimeSpent = 0; // 実際に銀行から引けた一時支出の累計
  // 各一時支出の結果（UI表示用）。要求額・実使用額・不足額をエンジンが返す。
  const oneTimeExpenseResults = [];

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
      // 記録専用。資産バンド（totalAssets）にも純資産（netWorth）にも算入されない。
      surplusBalance,
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
    // 「現在使える資産（＝今すぐ換金・引き出しできる資産）」＝ 銀行・投資（課税/非課税の
    // 上場株・ETF・投資信託等）・金・株のうち、この年齢で引き出し制限が無い（accessAge に
    // 到達済みで、恒久ロック=NOT_DRAWABLE でない）プールの合計。iDeCo（受取前）や民間年金の
    // 予備原資（group=ideco / privatePension）は「引き出せない資産」なので含めない。
    // 読み取り専用の派生値。どのプール残高にも足し込まず、totalAssets/netWorth を1円も変えない。
    // 不変条件：0 ≤ accessibleAssets ≤ spendableAssets ≤ totalAssets。
    //
    // 【内訳（将来の「使える資産の内訳」表示のための基盤）】グループ別の使える額も併せて
    // 出す。すべて数値フィールドなので、行の値はすべて finite のまま。
    //   accessibleAssets === accessibleBank + accessibleInvestment + accessibleGold + accessibleStock
    let accBank = 0, accInvestment = 0, accGold = 0, accStock = 0;
    pools.forEach((x) => {
      const accessibleNow = x.accessAge !== NOT_DRAWABLE && age >= x.accessAge - EPS;
      if (!accessibleNow) return;
      if (x.group === "bank") accBank += x.balance;
      else if (x.group === "investment") accInvestment += x.balance;
      else if (x.group === "gold") accGold += x.balance;
      else if (x.group === "stock") accStock += x.balance;
    });
    row.accessibleBank = clampZero(accBank);
    row.accessibleInvestment = clampZero(accInvestment);
    row.accessibleGold = clampZero(accGold);
    row.accessibleStock = clampZero(accStock);
    row.accessibleAssets = clampZero(
      row.accessibleBank + row.accessibleInvestment + row.accessibleGold + row.accessibleStock
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
    // 誕生日に年1回。生活費に使える口座へ移す。
    // 【引出時課税】強制取崩しであっても、引き出した時点で課税される口座
    //   （加RRIF＝引出額の全額が課税所得）では、税引後の手取りだけが移動先へ入る。
    //   税額は cumulativeWithdrawalTax に積み、その分だけ総資産が減る。
    //   非課税の口座（withdrawalTaxPct=0／豪Superの60歳以降など）は従来どおり
    //   全額が移るだけで総資産は変わらない。
    if (isBirthday) {
      pools.forEach((x) => {
        if (!x.minimumDrawdown || x.balance <= 0) return;
        // 退職前でも義務が生じる強制取崩し（加RRIF）は、この年齢ゲートを通さない。
        if (x.minimumDrawdownRequiresRetirement && age < retireAge - EPS) return;
        if (x.accessAge !== NOT_DRAWABLE && age < x.accessAge) return;
        const target = x.minimumDrawdownTo ? poolById.get(x.minimumDrawdownTo) : null;
        if (!target) return;
        const gross = Math.min(x.balance, clampZero(num(x.minimumDrawdown(age, x.balance))));
        if (gross <= 0) return;
        const keep = 1 - x.withdrawalTaxPct / 100;
        const net = gross * keep;
        x.balance -= gross;
        target.balance += net;
        cumulativeWithdrawalTax += gross - net;
      });
    }

    // -------- 4. 収入 --------
    let cash = 0;

    // 公的年金：ストリームごとの受給開始年齢に達してから。退職年齢では始まらない。
    //
    // monthlyAmountAt(age, ctx) を持つストリームは、その時点で月額を再評価する。
    //   ・年齢だけで変わる制度（加OASの75歳到達による10%上乗せ）→ 第1引数だけを使う
    //   ・資力調査のある制度（豪Age Pensionの資産テスト）→ ctx.assessedAssets を使う
    // ctx.assessedAssets は assessedPoolIds で指定されたプールの現在残高の合計（資産テスト用）。
    // ctx.deemedAssets は deemedPoolIds で指定されたプールの現在残高の合計
    //   （みなし収入＝豪Deemingの対象となる金融資産。資産テストの対象と範囲が異なるため別枠）。
    // どちらも指定がなければ null（その調査を行わない制度は参照しない）。
    // 資産は毎ステップ変動するため、ここでの再評価が「毎年の再判定」に相当する。
    // 年齢の境界（受給開始年齢・金額が変わる年齢）は buildPlanInput 側で
    // boundaries に積んでステップを割ること。
    const assessedAssetsOf = (ids) => {
      if (!Array.isArray(ids) || ids.length === 0) return null;
      return ids.reduce((sum, id) => {
        const pool = poolById.get(id);
        return sum + (pool ? clampZero(pool.balance) : 0);
      }, 0);
    };
    publicPensions.forEach((ps) => {
      if (ageStart < num(ps.startAge) - EPS) return;
      let monthly;
      if (typeof ps.monthlyAmountAt === "function") {
        monthly = num(ps.monthlyAmountAt(ageStart, {
          assessedAssets: assessedAssetsOf(ps.assessedPoolIds),
          deemedAssets: assessedAssetsOf(ps.deemedPoolIds),
          totalAssets: totalAssets(),
        }));
      } else {
        monthly = num(ps.monthlyAmount);
      }
      cash += clampZero(monthly) * months;
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
          // 銀行プールを取り崩したら、余剰金台帳を同額（実際に引かれた gross）だけ減らす。
          // 通常支出（生活費・医療費・保険料・ローン返済）の取り崩しもここで一元管理される。
          if (pool.group === "bank") reduceSurplusByBankDraw(gross);
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

    // -------- 7. 余剰金（残った現金を銀行等へ入金し、台帳へも記録）--------
    // ここに到達した cash は、収入（公的年金・民間年金・iDeCo年金・iDeCo一時金）から
    // 生活費・医療費・保険料・ローン返済をすべて差し引いた「後」の残額。
    // 置き場所（surplusDepositPool・既定は銀行）へ入金して総資産に残す。
    // 【Problem 2 対策】置き場所が見つからないフォールバック時も cash は失わない（総資産を保存）。
    //   余剰金残高（表示）へ積み増すのは、銀行に明示入金したとき（trackSurplusLedger）だけ。
    if (cash > EPS) {
      if (surplusDepositPool) surplusDepositPool.balance += cash;
      if (trackSurplusLedger) surplusBalance += cash;
      cash = 0;
    }

    // -------- 8. 一時支出（余剰金を使う）--------
    // 【新仕様】余剰金の範囲でだけ使う。実際に使える額は
    //     actuallySpent = min(requestedAmount, surplusBalance, availableBankBalance)
    //   に制限し、この額だけを銀行プールから引く。要求額が余剰金残高を超えても、
    //   超過分を通常の銀行預金からは引かない（通常預金からの臨時支出は将来別機能で扱う）。
    //   余剰金残高からの減算も、銀行取り崩しの一元管理（reduceSurplusByBankDraw）を通す。
    //   結果（要求額・実使用額・不足額）を oneTimeExpenseResults に記録して UI へ返す。
    if (oneTimeExpenses.length) {
      oneTimeExpenses.forEach((e) => {
        if (e.paid || age < e.age - EPS) return;
        const requestedAmount = e.amount;
        const availableBank = bankDrawPools.reduce((s, bp) => s + Math.max(0, bp.balance), 0);
        const actuallySpent = Math.max(
          0,
          Math.min(requestedAmount, clampZero(surplusBalance), clampZero(availableBank))
        );
        // 実際に使える額だけを銀行から引く（余剰金以外＝通常預金には波及させない）。
        let need = actuallySpent;
        for (const bp of bankDrawPools) {
          if (need <= EPS) break;
          const take = Math.min(bp.balance, need);
          bp.balance = clampZero(bp.balance - take);
          need -= take;
        }
        const spent = actuallySpent - Math.max(0, need); // 端数丸め対策。実質 actuallySpent。
        cumulativeOneTimeSpent += spent;
        reduceSurplusByBankDraw(spent); // 共通台帳から実使用額を減らす（spent ≤ surplusBalance）。
        oneTimeExpenseResults.push({
          id: e.id,
          age: e.age,
          requestedAmount,
          actuallySpent: spent,
          // 余剰金残高が足りず使えなかった額。UI で「未処理額」として表示する。
          insufficientSurplusAmount: clampZero(requestedAmount - spent),
        });
        e.paid = true;
      });
    }

    pools.forEach((x) => { x.balance = clampZero(Number.isFinite(x.balance) ? x.balance : 0); });

    if (isBirthday) yearly.push(snapshot(age));
  }

  const last = yearly[yearly.length - 1];
  return {
    yearly,
    finalNetWorth: last.netWorth,
    finalAssets: last.totalAssets,
    // 記録専用の累計余剰金の最終値（各スナップショットの surplusBalance と同じ系列の最後）。
    // 既存の finalNetWorth / finalAssets には一切影響しない。
    finalSurplusBalance: surplusBalance,
    depletionAge,
    cumulativeUnmet,
    cumulativeUnpaidLoan,
    cumulativePremiums,
    cumulativeLoanInterest,
    cumulativeLoanPrincipal,
    cumulativeWithdrawalTax,
    // 一時支出で実際に銀行から引けた累計。既存フィールドには影響しない。
    cumulativeOneTimeSpent,
    // 各一時支出の結果（要求額・実使用額・不足額）。UI が不足時の案内表示に使う。
    oneTimeExpenseResults,
    loanPayoffAges: loans.map((l) => l.payoffAge),
    peakNetWorth: yearly.reduce((mx, r) => Math.max(mx, r.netWorth), -Infinity),
  };
}
