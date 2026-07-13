// ============================================================================
// 資産形成総合ライフプラン — 回帰テスト（Regression Tests）
//
// 目的：一度直したバグを二度と埋め込まないこと。
//   - BUG-1 個別株シミュレーションの1ヶ月ズレ
//   - BUG-2 金シミュレーションの価格1ヶ月ズレ
//   - BUG-3 保存データ復元時の浅いマージ（入れ子フィールドが消える）
// および、日本版・アメリカ版・イギリス版の主要計算が壊れていないこと。
// ============================================================================

import { describe, it, expect } from "vitest";
import {
  runSimulation,
  runGoldSimulation,
  runBankSimulation,
  runStockSim,
  runLoanSimulation,
  runInsuranceSimulation,
  runPrivatePensionSimulation,
  runIdecoSimulation,
  mergeSavedInputs,
  healthAnnualCost,
  JP_COUNTRY_RULES,
  US_COUNTRY_RULES,
  GB_COUNTRY_RULES,
  NISA_LIMITS,
} from "./App.jsx";

// 手計算との一致を見るための許容誤差（相対）
const closeTo = (actual, expected, tolerance = 1e-6) =>
  Math.abs(actual - expected) / Math.abs(expected || 1) < tolerance;

// ============================================================================
// BUG-1 再発防止：個別株は「その月の運用益を反映してから」記録すること
// ============================================================================
describe("BUG-1 個別株：1ヶ月ズレの再発防止", () => {
  it("最終評価額が手計算（元本 × (1+r)^年数）と一致する", () => {
    const sim = runStockSim({ currentAge: 35, deathAge: 90, totalValue: 5_000_000, returnPct: 6 });
    const hand = 5_000_000 * Math.pow(1.06, 55);
    expect(closeTo(sim.finalValue, hand, 1e-4)).toBe(true);
  });

  it("1年後の評価額が12ヶ月分（1年分）の複利になっている", () => {
    const sim = runStockSim({ currentAge: 40, deathAge: 41, totalValue: 1_000_000, returnPct: 12 });
    const oneYear = sim.yearly.find((y) => y.age === 41);
    expect(closeTo(oneYear.value, 1_000_000 * 1.12, 1e-6)).toBe(true);
  });

  it("利回り0%なら評価額は変わらない", () => {
    const sim = runStockSim({ currentAge: 30, deathAge: 90, totalValue: 1234, returnPct: 0 });
    expect(sim.finalValue).toBe(1234);
  });
});

// ============================================================================
// BUG-2 再発防止：金は「その月の価格上昇を反映してから」評価・記録すること
// ============================================================================
describe("BUG-2 金：価格1ヶ月
