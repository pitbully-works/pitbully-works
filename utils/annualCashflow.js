const num = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
const delta = (cur, prev) => Math.max(0, num(cur) - num(prev));

/**
 * 統合エンジンの累計ログから、各満年齢区間 [age, age+1) の年間収支を作る。
 * 計算結果を変更しない表示専用の派生データ。
 */
export function deriveAnnualCashflowRows(yearly = []) {
  const rows = [];
  for (let i = 1; i < yearly.length; i += 1) {
    const prev = yearly[i - 1] || {};
    const cur = yearly[i] || {};
    const startAge = Math.floor(num(prev.exactAge ?? prev.age) + 1e-9);
    const endAge = Math.floor(num(cur.exactAge ?? cur.age) + 1e-9);
    const seniorMedical = delta(cur.charge_jpSeniorMedical75, prev.charge_jpSeniorMedical75);
    const recurring = delta(cur.cumulativeRecurringCharges, prev.cumulativeRecurringCharges);
    const withdrawalTax = delta(cur.cumulativeWithdrawalTax, prev.cumulativeWithdrawalTax);
    const healthBase = delta(cur.cumulativeHealthCost, prev.cumulativeHealthCost);
    const publicPension = delta(cur.cumulativePublicPensionIncome, prev.cumulativePublicPensionIncome);
    const privatePension = delta(cur.cumulativePrivatePensionIncome, prev.cumulativePrivatePensionIncome);
    const livingCost = delta(cur.cumulativeLivingCost, prev.cumulativeLivingCost);
    const insurancePremium = delta(cur.cumulativePremiums, prev.cumulativePremiums);
    const loanPayment = delta(cur.cumulativeLoanPayments, prev.cumulativeLoanPayments);
    const investmentReturn = num(cur.cumulativeInvestmentReturn) - num(prev.cumulativeInvestmentReturn);
    const contributions = delta(cur.cumulativeContributions, prev.cumulativeContributions);
    const openingAssets = num(prev.totalAssets);
    const closingAssets = num(cur.totalAssets);
    const healthCost = healthBase + seniorMedical;
    const taxFixedCost = Math.max(0, recurring - seniorMedical) + withdrawalTax;
    const totalCashIncome = publicPension + privatePension;
    const totalCashOutflow = livingCost + healthCost + taxFixedCost + insurancePremium + loanPayment;
    rows.push({
      age: startAge,
      endAge,
      openingAssets,
      closingAssets,
      assetChange: closingAssets - openingAssets,
      investmentReturn,
      contributions,
      publicPension,
      privatePension,
      totalCashIncome,
      livingCost,
      healthCost,
      taxFixedCost,
      insurancePremium,
      loanPayment,
      totalCashOutflow,
      annualCashflow: totalCashIncome - totalCashOutflow,
    });
  }
  return rows;
}
