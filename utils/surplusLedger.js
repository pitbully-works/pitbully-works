// ============================================================================
// utils/surplusLedger.js
//
// 余剰金の「使う」台帳（surplusLedger）まわりの、UI・エンジン結線・テストで共有する
// 純粋関数だけを置く。React にも DOM にも依存しない（テストしやすさと一貫性のため）。
//
// 【設計の要】
//   ・利用者は「用途（category）」だけを選ぶ。種別（kind: consume / transfer）は
//     用途から自動判定する（surplusKindForCategory）。UI・buildPlanInput・テストが
//     この 1 つの関数を共有するので、判定がズレない。
//   ・consume … 実消費。銀行プールから一度だけ引く＝総資産がその分だけ減る。
//   ・transfer … 預金へ回す/銀行へ戻す等。総資産不変のラベル移動（エンジンに渡さない）。
// ============================================================================

// 用途の一覧（表示順）。翻訳キーは "surplusCategory_" + value（ja.js / en.js 側）。
export const SURPLUS_CATEGORIES = [
  "living",   // 生活費
  "medical",  // 医療費
  "travel",   // 旅行
  "car",      // 車
  "reform",   // リフォーム
  "toNisa",   // NISAへ回す（付け替え）
  "toBank",   // 銀行へ戻す（付け替え）
  "other",    // その他（メモ）
];

// 付け替え（総資産不変）になる用途。これ以外は消費。
const TRANSFER_CATEGORIES = new Set(["toNisa", "toBank"]);

// 用途 → 種別（kind）。toNisa / toBank だけ transfer、それ以外は consume。
export function surplusKindForCategory(category) {
  return TRANSFER_CATEGORIES.has(category) ? "transfer" : "consume";
}

// 用途が既知のものか（不明な値は "other" 扱いにするための判定に使える）。
export function isKnownSurplusCategory(category) {
  return SURPLUS_CATEGORIES.includes(category);
}
