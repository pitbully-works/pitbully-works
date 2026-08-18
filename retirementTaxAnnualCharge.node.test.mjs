import { test, expect } from 'vitest';
import { runIntegratedPlan } from './lifePlanEngine.js';
import { estimatePublicPensionTax, resolveTaxAmount } from './utils/retirementTax.js';

const annualPension = 2_005_272; // 16.7106万円/月 × 12
const autoTax = estimatePublicPensionTax('JP', annualPension, 65);

function plan(recurringCharges = []) {
  return {
    currentAge: 65,
    retireAge: 65,
    deathAge: 66,
    boundaries: [65, 66],
    pools: [{
      id: 'bank_0', group: 'bank', balance: 1_000_000,
      annualReturnPct: 0, retireReturnPct: 0,
      monthlyContribution: 0, drawOrder: 1,
    }],
    loans: [], insurancePolicies: [], privatePensionPlans: [],
    publicPensions: [{ monthlyAmount: annualPension / 12, startAge: 65 }],
    livingCostMonthly: 0,
    healthCostAnnual: () => 0,
    idecoAnnuityMonthly: () => 0,
    recurringCharges,
    surplusTargetId: 'bank_0',
  };
}

test('JP pension estimate: 16.7106万円/月 gives about 4.9万円/year tax', () => {
  expect(Math.abs(autoTax - 48_790.8)).toBeLessThan(0.01);
});

test('manual tax override is annual and replaces auto amount', () => {
  expect(resolveTaxAmount({ mode: 'manual', manualAnnual: 49_000 }, autoTax)).toBe(49_000);
});

test('annual pension tax is deducted once per year, not once per month', () => {
  const withoutTax = runIntegratedPlan(plan()).finalNetWorth;
  const withTax = runIntegratedPlan(plan([
    { id: 'publicPensionTax', annualAmount: 49_000, fromAge: 65, toAge: 66.001 },
  ])).finalNetWorth;
  expect(Math.abs((withoutTax - withTax) - 49_000)).toBeLessThan(0.01);
  expect(Math.abs(withTax - (1_000_000 + annualPension - 49_000))).toBeLessThan(0.01);
});

test('public tax + private tax + fixed costs are each deducted exactly once', () => {
  const without = runIntegratedPlan(plan()).finalNetWorth;
  const charges = [
    { id: 'publicPensionTax', annualAmount: 49_000, fromAge: 65, toAge: 66.001 },
    { id: 'privatePensionTax', annualAmount: 12_000, fromAge: 65, toAge: 66.001 },
    { id: 'otherAnnualTaxes', annualAmount: 30_000, fromAge: 65, toAge: 66.001 },
  ];
  const withCharges = runIntegratedPlan(plan(charges)).finalNetWorth;
  expect(Math.abs((without - withCharges) - 91_000)).toBeLessThan(0.01);
});
