// ============================================================================
// countryRules/index.js
// 国別ルール（JP / US / GB / CA / AU）の集約と取得口。
// 中身は App.jsx にあった COUNTRY_RULES / UNIMPLEMENTED_COUNTRY_RULES /
// getCountryRules() をそのまま移設したもので、挙動・取得方法は一切変更していない。
//
// 各カテゴリは必ず `implemented: boolean` を持つ。true の国だけが実際の計算式を持ち、
// false の国は「まだ実装されていない」ことを示すプレースホルダーのみを持つ。
// falseのときにJPの数値へフォールバックすることは絶対にしない
// （フォールバックすると「日本の制度の数値が、あたかも米国・英国の制度の数値であるかのように」
//   表示されてしまうため。未実装の場合は呼び出し側が明示的にプレビュー/未対応表示を出す）。
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
  // CA / AU: SUPPORTED_COUNTRIES 側でまだ enabled:false（Coming Soon）のため、
  // ここに追加しなくても getCountryRules() は自動的に JP へフォールバック値を
  // 返さず、下記の通り「未定義国は最も安全側の＝未実装として扱う」ようにしてある。
};

export const UNIMPLEMENTED_COUNTRY_RULES = {
  investment: { implemented: false, plannedAccountTypes: [], annualInstallmentLimit: null, annualGrowthLimit: null, growthLifetimeLimit: null, taxFreeInvestmentLimit: null },
  retirement: { implemented: false, plannedAccountTypes: [], hasFixedContributionLimit: null },
  healthcare: { implemented: false, model: null },
  tax: { implemented: false, model: null },
  labels: {},
  defaults: {},
};

// 共通計算エンジンの入口。`const rules = getCountryRules(country);` の形で呼び出す。
// 重要：未対応の国であっても JP の数値へフォールバックしない
// （フォールバックすると日本の制度の数値が、あたかもその国の制度の数値であるかのように
//   表示されてしまうため）。JPだけが実装済みの計算式を持ち、それ以外は
// 「未実装であることが明確に分かるプレースホルダー」を返す。
export function getCountryRules(country) {
  return COUNTRY_RULES[country] || UNIMPLEMENTED_COUNTRY_RULES;
}
