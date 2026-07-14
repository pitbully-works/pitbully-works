// ============================================================================
// translations/index.js
// 翻訳辞書の集約と取得口。
// 画面内の文字列（見出し・ボタン・単位・注意書き・グラフの凡例やツールチップ等）は
// すべてここに集約し、JSX側では TRANSLATIONS を直接書かず t("キー") 経由で参照する。
// {name} のようなプレースホルダーは t(key, { name: "..." }) で差し込む。
//
// 辞書は「国別」ではなく「言語別」で管理する（JP→ja / US・CA・AU→en / GB→en-GB）。
// en-GB は en を完全に継承しつつ EN_GB_OVERRIDES の差分だけを上書きした辞書として、
// モジュール読み込み時に一度だけ組み立てる（実行時に毎回マージし直す必要がない）。
// 中身は App.jsx にあった TRANSLATIONS / EN_GB_OVERRIDES / translateWith() を
// そのまま移設したもので、挙動・取得方法は一切変更していない。
// ============================================================================

import { JA_TRANSLATIONS } from "./ja.js";
import { EN_TRANSLATIONS } from "./en.js";
import { EN_GB_OVERRIDES } from "./enGB.js";

export { EN_GB_OVERRIDES };

export const TRANSLATIONS = {
  ja: JA_TRANSLATIONS,
  en: EN_TRANSLATIONS,
};

// en-GB は「en を完全に継承しつつ、上記の差分だけを上書きした完全な辞書」として
// モジュール読み込み時に一度だけ組み立てる（実行時に毎回マージし直す必要がない）。
TRANSLATIONS["en-GB"] = { ...TRANSLATIONS.en, ...EN_GB_OVERRIDES };

export function translateWith(language, key, vars) {
  const dict = TRANSLATIONS[language] || TRANSLATIONS.ja;
  let str = dict[key];
  if (str === undefined) str = TRANSLATIONS.ja[key];
  if (str === undefined) return key; // 未登録キーは開発時に気付けるようキー名をそのまま返す
  if (vars) {
    Object.keys(vars).forEach((k) => {
      str = str.split(`{${k}}`).join(vars[k]);
    });
  }
  return str;
}
