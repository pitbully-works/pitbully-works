// ============================================================================
// panels/index.js
// 各国パネルの集約・再エクスポート。
// App.jsx からは `import { USInvestmentAccountsPanel, ... } from "./panels/index.js";` で読み込む。
// パネルは state を持たず、App.jsx から props で受け取った値だけを使う（計算式は移動前と同一）。
// ============================================================================

export { USInvestmentAccountsPanel } from "./USInvestmentAccountsPanel.jsx";
export { GBRetirementPanel } from "./GBRetirementPanel.jsx";
export { CARetirementPanel } from "./CARetirementPanel.jsx";
export { AURetirementPanel } from "./AURetirementPanel.jsx";
