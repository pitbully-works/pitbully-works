// ============================================================================
// countryRules/index.js
// 国別ルール（JP / US / GB / CA / AU）の集約と取得口。
// 中身は App.jsx にあった COUNTRY_RULES / UNIMPLEMENTED_COUNTRY_RULES /
// getCountryRules() をそのまま移設したもので、挙動・取得方法は一切変更していない。
//
// 各カテゴリは必ず `implemented: boolean` を持つ。true の国だけが実際の計算式を持ち、
// false の国は「まだ実装されていない」ことを示すプレースホルダーのみを持つ。
// 5か国はいずれも専用ルールを持つ。未知の国コードだけは未実装プレースホルダーへ落とし、
// JPの数値へフォールバックしない（他国に日本制度の数値が混入するのを防ぐ）。
// ============================================================================

import { JP_COUNTRY_RULES } from "./JP.js";
import { US_COUNTRY_RULES } from "./US.js";
import { GB_COUNTRY_RULES } from "./GB.js";
import { CA_COUNTRY_RULES } from "./CA.js";
import { AU_COUNTRY_RULES } from "./AU.js";

export { JP_COUNTRY_RULES, US_COUNTRY_RULES, GB_COUNTRY_RULES, CA_COUNTRY_RULES, AU_COUNTRY_RULES };

export const COUNTRY_RULES = {
  JP: JP_COUNTRY_RULES,
  US: US_COUNTRY_RULES,
  GB: GB_COUNTRY_RULES,
  CA: CA_COUNTRY_RULES,
  AU: AU_COUNTRY_RULES,
};

export const UNIMPLEMENTED_COUNTRY_RULES = {
  investment: { implemented: false, plannedAccountTypes: [], annualInstallmentLimit: null, annualGrowthLimit: null, growthLifetimeLimit: null, taxFreeInvestmentLimit: null },
  retirement: { implemented: false, plannedAccountTypes: [], hasFixedContributionLimit: null },
  healthcare: { implemented: false, model: null },
  tax: { implemented: false, model: null },
  estate: { implemented: false, model: null },
  labels: {},
  defaults: {},
};

// 共通計算エンジンの入口。`const rules = getCountryRules(country);` の形で呼び出す。
// 重要：未知の国コードでもJPの数値へフォールバックしない。
// 大文字・小文字と前後空白を正規化し、既知5か国なら必ずその国専用ルールを返す。
export function getCountryRules(country) {
  const code = String(country || "").trim().toUpperCase();
  return COUNTRY_RULES[code] || UNIMPLEMENTED_COUNTRY_RULES;
}
