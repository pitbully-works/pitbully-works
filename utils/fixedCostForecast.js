export const FIXED_COST_TEMPLATE_KEYS = Object.freeze({
  JP: ["fixedCostTplPropertyTax", "fixedCostTplCityPlanningTax", "fixedCostTplVehicleTax", "fixedCostTplManagementFee", "fixedCostTplRepairReserve", "fixedCostTplOtherLocalCharge"],
  US: ["fixedCostTplPropertyTax", "fixedCostTplHoaFee", "fixedCostTplVehicleRegistration", "fixedCostTplCondoFee", "fixedCostTplOtherLocalCharge"],
  GB: ["fixedCostTplCouncilTax", "fixedCostTplServiceCharge", "fixedCostTplGroundRent", "fixedCostTplVehicleTax", "fixedCostTplOtherLocalCharge"],
  CA: ["fixedCostTplPropertyTax", "fixedCostTplCondoFee", "fixedCostTplVehicleRegistration", "fixedCostTplOtherLocalCharge"],
  AU: ["fixedCostTplCouncilRates", "fixedCostTplStrataFee", "fixedCostTplLandTax", "fixedCostTplVehicleRegistration", "fixedCostTplOtherLocalCharge"],
});

const nonNegativeDelta = (now, prev) => Math.max(0, Number(now || 0) - Number(prev || 0));
const cumulativePrivateTax = (row = {}) => Object.keys(row)
  .filter((key) => key.startsWith("charge_privatePensionTax"))
  .reduce((sum, key) => sum + Number(row[key] || 0), 0);
const cumulativeFixedCosts = (row = {}) => Object.keys(row)
  .filter((key) => key.startsWith("charge_fixedCost_"))
  .reduce((sum, key) => sum + Number(row[key] || 0), 0);

/**
 * 統合エンジンが記録した累計控除額から、年齢ごとの予測年額を作る。
 * 元データが「実際に資産から控除できた累計額」なので、総資産推移と表示が食い違わない。
 */
export function deriveTaxFixedCostForecastRows(yearly = [], fixedCostItems = []) {
  return yearly.map((row, index, rows) => {
    const prev = index > 0 ? rows[index - 1] : {};
    const annualFixedCostByItem = {};
    fixedCostItems.forEach((_, fixedCostIndex) => {
      const key = `charge_fixedCost_${fixedCostIndex}`;
      annualFixedCostByItem[`annualFixedCost_${fixedCostIndex}`] = nonNegativeDelta(row[key], prev[key]);
    });
    return {
      ...row,
      cumulativePublicPensionTax: Number(row.charge_publicPensionTax || 0),
      cumulativePrivatePensionTax: cumulativePrivateTax(row),
      cumulativeOtherFixedCosts: Number(row.charge_otherAnnualTaxes || 0) + cumulativeFixedCosts(row),
      cumulativeSeniorMedical75: Number(row.charge_jpSeniorMedical75 || 0),
      annualPublicPensionTax: nonNegativeDelta(row.charge_publicPensionTax, prev.charge_publicPensionTax),
      annualPrivatePensionTax: nonNegativeDelta(cumulativePrivateTax(row), cumulativePrivateTax(prev)),
      annualOtherTaxes: nonNegativeDelta(row.charge_otherAnnualTaxes, prev.charge_otherAnnualTaxes),
      annualSeniorMedical75: nonNegativeDelta(row.charge_jpSeniorMedical75, prev.charge_jpSeniorMedical75),
      ...annualFixedCostByItem,
    };
  });
}
