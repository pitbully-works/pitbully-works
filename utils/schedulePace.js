// ============================================================================
// utils/schedulePace.js
//
// 積立スケジュールの「いまの状態」を言い分ける。
//
//   active   … いま積立中（区間の中にいる）
//   upcoming … まだ始まっていない（開始はこれから）
//   ended    … すべて終わった
//   none     … スケジュールが1件も入っていない
//
// 【背景】「現在のペース」は、いまの年齢が区間の中にあるかだけで決めていた。
// そのため開始年齢が数日先だと「月¥0のペース」とだけ出て、
// 入力を間違えたのか、まだ始まっていないだけなのか区別がつかなかった。
//
// ここは純粋関数だけ。DOM も React も触らない。
// 【重要】表示の言い分けだけで、金額の計算そのものには一切関与しない。
// ============================================================================

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

/**
 * @param {Array<{fromAge:number,toAge:number,monthlyYen:number}>} schedule
 * @param {number} currentAge いまの年齢（小数）
 * @returns {{status:string, monthly:number, nextFromAge:number|null, nextMonthly:number}}
 */
export function describeSchedulePace(schedule, currentAge) {
  const rows = (Array.isArray(schedule) ? schedule : []).filter(
    (r) => r && num(r.fromAge) !== null && num(r.toAge) !== null
  );
  const age = num(currentAge);
  if (rows.length === 0 || age === null) {
    return { status: "none", monthly: 0, nextFromAge: null, nextMonthly: 0 };
  }

  // いま積立中の区間（重なっていれば合算する。scheduledAmount と同じ数え方）
  const monthly = rows.reduce(
    (sum, r) => (age >= r.fromAge && age <= r.toAge ? sum + (num(r.monthlyYen) || 0) : sum),
    0
  );
  if (monthly > 0) return { status: "active", monthly, nextFromAge: null, nextMonthly: 0 };

  // まだ始まっていない区間のうち、いちばん早いもの
  const upcoming = rows
    .filter((r) => r.fromAge > age)
    .sort((a, b) => a.fromAge - b.fromAge)[0];
  if (upcoming) {
    // 同じ年齢から始まる区間が複数あれば合算する
    const nextMonthly = rows.reduce(
      (sum, r) => (r.fromAge === upcoming.fromAge ? sum + (num(r.monthlyYen) || 0) : sum),
      0
    );
    return { status: "upcoming", monthly: 0, nextFromAge: upcoming.fromAge, nextMonthly };
  }

  // 区間はあるが、すべて過ぎている
  return { status: "ended", monthly: 0, nextFromAge: null, nextMonthly: 0 };
}
