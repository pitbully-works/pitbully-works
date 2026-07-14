// ============================================================================
// utils/generateAdvice.js
//
// シミュレーション結果から「診断コメント」を組み立てる純粋関数。
//
// 【設計方針】
// ・外部AI（OpenAI等）は使わない。既存の計算結果だけを見て、ルールで判定する。
// ・この関数は React も翻訳辞書も知らない。返すのは「翻訳キー」と「差し込む値」だけ。
//   文章は translations/ 側にあるので、5か国どこでも同じロジックがそのまま使える。
// ・新しい計算は一切しない。改善額のような「作った数字」は返さない
//   （根拠のない金額を見せると、利用者が誤った判断をするため）。
//
// 【入力】すべて既存の計算結果・入力値
//   currentAge            現在年齢
//   retireAge             退職年齢
//   deathAge              想定寿命
//   depletionAge          資産が尽きる年齢（尽きないなら null）… integrated.depletionAge
//   netWorthNow           現在の純資産
//   netWorthAtRetire      退職時点の純資産
//   netWorthFinal         想定寿命時点の純資産
//   inheritanceTarget     相続目標額（0 なら判定しない）
//   retirementMonthlyGap  退職後の毎月の不足額（プラスなら赤字。判定できない国は null）
//
// 【出力】画面にそのまま並べられる配列。先頭は必ず「総合評価」。
//   [{ id, severity, icon, titleKey, valueKey?, messageKey, vars? }, ...]
//   severity: "success" | "warning" | "danger" | "info"
// ============================================================================

const num = (v) => (typeof v === "number" && isFinite(v) ? v : 0);

export function generateAdvice({
  currentAge,
  retireAge,
  deathAge,
  depletionAge,
  netWorthNow,
  netWorthAtRetire,
  netWorthFinal,
  inheritanceTarget,
  retirementMonthlyGap,
} = {}) {
  const items = [];

  // ---------- ① / ② 資産寿命 ----------
  // depletionAge が入っていれば「想定寿命より前に資産が尽きる」ことを意味する。
  const runsOut = depletionAge !== null && depletionAge !== undefined && isFinite(depletionAge);
  items.push(
    runsOut
      ? {
          id: "assetLife",
          severity: "danger",
          icon: "🔴",
          titleKey: "adviceAssetLifeTitle",
          messageKey: "adviceAssetLifeShort",
          vars: { age: Math.round(depletionAge) },
        }
      : {
          id: "assetLife",
          severity: "success",
          icon: "✅",
          titleKey: "adviceAssetLifeTitle",
          messageKey: "adviceAssetLifeOk",
          vars: { age: Math.round(num(deathAge)) },
        }
  );

  // ---------- ③ 退職時点までの資産形成 ----------
  // 退職年齢が現在年齢より先にある場合だけ意味を持つ判定。
  let accumulationWarning = false;
  if (num(retireAge) > num(currentAge)) {
    const grows = num(netWorthAtRetire) > num(netWorthNow);
    accumulationWarning = !grows;
    items.push({
      id: "accumulation",
      severity: grows ? "success" : "warning",
      icon: grows ? "✅" : "⚠️",
      titleKey: "adviceAccumulationTitle",
      messageKey: grows ? "adviceAccumulationOk" : "adviceAccumulationFlat",
      vars: { age: Math.round(num(retireAge)) },
    });
  }

  // ---------- ④ 退職後の収支 ----------
  // 判定材料が無い国（retirementMonthlyGap が null）では、この項目自体を出さない。
  // 「分からないのに断定する」ことを避けるため。
  const hasGap = retirementMonthlyGap !== null && retirementMonthlyGap !== undefined && isFinite(retirementMonthlyGap);
  const deficit = hasGap && retirementMonthlyGap > 0;
  if (hasGap) {
    items.push({
      id: "retirementCashflow",
      severity: deficit ? "warning" : "success",
      icon: deficit ? "⚠️" : "✅",
      titleKey: "adviceRetirementCashflowTitle",
      messageKey: deficit ? "adviceRetirementCashflowDeficit" : "adviceRetirementCashflowOk",
    });
  }

  // ---------- ⑤ 相続 ----------
  // 相続目標額が未設定（0以下）なら、そもそも判定しない。
  const hasInheritanceTarget = num(inheritanceTarget) > 0;
  const inheritanceOk = hasInheritanceTarget && num(netWorthFinal) >= num(inheritanceTarget);
  if (hasInheritanceTarget) {
    items.push({
      id: "inheritance",
      severity: inheritanceOk ? "success" : "warning",
      icon: "💰",
      titleKey: "adviceInheritanceTitle",
      messageKey: inheritanceOk ? "adviceInheritanceOk" : "adviceInheritanceShort",
      vars: { age: Math.round(num(deathAge)) },
    });
  }

  // ---------- ⑥ ワンポイントアドバイス ----------
  // 問題があるときだけ出す。金額は出さない（根拠のない数字を作らないため）。
  const needsAdvice =
    runsOut || deficit || accumulationWarning || (hasInheritanceTarget && !inheritanceOk);
  if (needsAdvice) {
    items.push({
      id: "tip",
      severity: "info",
      icon: "💡",
      titleKey: "adviceTipTitle",
      messageKey: "adviceTipGeneric",
    });
  }

  // ---------- 総合評価（先頭に置く）----------
  // 赤：想定寿命より前に資産が尽きる（いちばん重い）
  // 黄：資産は残るが、老後赤字・相続目標未達・退職まで資産が増えないなど気になる点がある
  // 緑：どれにも当てはまらない
  const anyWarning = items.some((it) => it.severity === "warning");
  const overall = runsOut
    ? { severity: "danger", icon: "🔴", valueKey: "adviceOverallBad", messageKey: "adviceOverallBadMessage" }
    : anyWarning
    ? { severity: "warning", icon: "🟡", valueKey: "adviceOverallWarn", messageKey: "adviceOverallWarnMessage" }
    : { severity: "success", icon: "🟢", valueKey: "adviceOverallGood", messageKey: "adviceOverallGoodMessage" };

  return [
    { id: "overall", titleKey: "adviceOverallTitle", ...overall },
    ...items,
  ];
}
