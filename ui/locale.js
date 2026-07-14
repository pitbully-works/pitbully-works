// ============================================================================
// ui/locale.js
// 表示層の共通基盤（国・通貨・言語に依存しないUI部品が参照する土台）。
// App.jsx から yen / CATEGORY_LABELS / getCategoryLabel / LocaleContext を
// そのまま切り出したもので、値・出力・既定値は一切変更していない。
//
// UI部品（ui/guides.jsx・ui/inputs.jsx・ui/charts.jsx）は useContext(LocaleContext) で
// 現在の国・通貨・言語と money()/label()/t() にアクセスする。
// ============================================================================

import { createContext } from "react";
import { translateWith } from "../translations/index.js";

const yen = (n) => {
  if (n === null || n === undefined || isNaN(n)) return "¥0";
  const sign = n < 0 ? "-" : "";
  n = Math.abs(Math.round(n));
  if (n >= 100000000) return `${sign}¥${(n / 100000000).toFixed(2)}億`;
  if (n >= 10000) return `${sign}¥${(n / 10000).toFixed(1)}万`;
  return `${sign}¥${n.toLocaleString()}`;
};

// 世界共通の内部カテゴリ・キー → 国別の「表示名」だけを切り替えるテーブル。
// データ構造・計算ロジックはこのキー（例："investmentTaxAdvantaged"）を使い、
// NISAやiDeCoといった日本固有の名称はここでの「表示専用マッピング」としてのみ登場する。
const CATEGORY_LABELS = {
  personalInfo: {
    JP: "ご本人情報", US: "Personal Info", GB: "Personal Info", CA: "Personal Info", AU: "Personal Info",
  },
  basicInfo: {
    JP: "基本情報", US: "Basic Info", GB: "Basic Info", CA: "Basic Info", AU: "Basic Info",
  },
  // NISA（日本）→ 他国では税制優遇のある投資口座全般
  investmentTaxAdvantaged: {
    JP: "NISA積立（つみたて枠 + 成長投資枠）",
    US: "Investment Account (401(k) + Brokerage)",
    GB: "ISA (Stocks & Shares)",
    CA: "TFSA (Tax-Free Savings Account)",
    AU: "Investment Account (Super + Brokerage)",
  },
  // iDeCo（日本）→ 他国では個人年金口座全般
  retirementAccount: {
    JP: "iDeCo積立（個人型確定拠出年金）",
    US: "Retirement Account (IRA)",
    GB: "SIPP / Personal Pension",
    CA: "RRSP (Registered Retirement Savings Plan)",
    AU: "Superannuation Contributions",
  },
  pensionRetirement: {
    JP: "老後・年金",
    US: "Retirement & Social Security",
    GB: "Retirement & State Pension",
    CA: "Retirement & CPP",
    AU: "Retirement & Age Pension",
  },
  healthCost: {
    JP: "健康リスク費用（自己負担目安）",
    US: "Healthcare Costs (Out-of-Pocket Estimate)",
    GB: "Healthcare Costs",
    CA: "Healthcare Costs (Out-of-Pocket Estimate)",
    AU: "Healthcare Costs (Out-of-Pocket Estimate)",
  },
  inheritance: {
    JP: "相続プラン",
    US: "Estate & Inheritance Plan",
    GB: "Inheritance",
    CA: "Estate & Inheritance Plan",
    AU: "Estate & Inheritance Plan",
  },
  gold: {
    JP: "金（ゴールド）資産形成",
    US: "Gold Holdings",
    GB: "Gold Holdings",
    CA: "Gold Holdings",
    AU: "Gold Holdings",
  },
  cash: {
    JP: "銀行預金（銀行別）",
    US: "Cash & Bank Accounts",
    GB: "Cash Savings",
    CA: "Cash & Bank Accounts",
    AU: "Cash & Bank Accounts",
  },
  loan: {
    JP: "借入金（返済シミュレーション）",
    US: "Loans (Repayment Simulation)",
    GB: "Loans (Repayment Simulation)",
    CA: "Loans (Repayment Simulation)",
    AU: "Loans (Repayment Simulation)",
  },
  insurance: {
    JP: "生命保険",
    US: "Insurance (Life)",
    GB: "Life Insurance",
    CA: "Insurance (Life)",
    AU: "Insurance (Life)",
  },
  privatePension: {
    JP: "民間年金積立",
    US: "Private Pension / Annuity",
    GB: "Private Pension",
    CA: "Private Pension / Annuity",
    AU: "Private Pension / Annuity",
  },
};

function getCategoryLabel(key, country) {
  const entry = CATEGORY_LABELS[key];
  if (!entry) return key;
  return entry[country] || entry.JP;
}

// 表示層（見出し・金額フォーマット・現在の国/通貨/言語設定）だけを配布するための軽量Context。
// AllocationCharts等、メインコンポーネントの外側にある小コンポーネントからも
// props経由でバケツリレーせずに現在の設定へアクセスできるようにする。
const LocaleContext = createContext({
  country: "JP",
  baseCurrency: "JPY",
  language: "ja",
  money: yen,
  label: (key) => getCategoryLabel(key, "JP"),
  t: (key) => translateWith("ja", key),
});

// 通貨コード → 記号・ロケール。金額表示（formatMoneyFor）と英国パネルの週額表示で共有する。
const CURRENCY_BY_CODE = {
  JPY: { symbol: "¥", locale: "ja-JP" },
  USD: { symbol: "$", locale: "en-US" },
  GBP: { symbol: "£", locale: "en-GB" },
  CAD: { symbol: "C$", locale: "en-CA" },
  AUD: { symbol: "A$", locale: "en-AU" },
};

export { yen, CURRENCY_BY_CODE, CATEGORY_LABELS, getCategoryLabel, LocaleContext };
