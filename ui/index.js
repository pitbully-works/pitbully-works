// ============================================================================
// ui/index.js
// 国に依存しない共通UI部品の集約・再エクスポート。
// App.jsx からは `import { Field, MoneyField, ... } from "./ui/index.js";` の形で読み込む。
// 部品の中身（JSX・スタイル・挙動）は App.jsx にあったものと完全に同一。
// ============================================================================

export { yen, CURRENCY_BY_CODE, CATEGORY_LABELS, getCategoryLabel, LocaleContext } from "./locale.js";
export { GuideButton, SectionGuide, GuideLabel } from "./guides.jsx";
export {
  MAN,
  useMoneyScale,
  MoneyInput,
  MoneyField,
  Field,
  AgeField,
  AgeYMInput,
  LabeledMiniInput,
  CustomBenefitEditor,
} from "./inputs.jsx";
export { PIE_COLORS, AllocationCharts, AllocationBreakdown } from "./charts.jsx";
export { StatCard } from "./cards.jsx";
// シナリオ比較カード（総資産推移グラフの上に置く）。state を持たない表示専用部品。
export { ScenarioComparisonCard } from "./comparison.jsx";
