// ============================================================================
// ui/guides.jsx
// 入力ガイド系の共通UI部品（国に依存しない表示専用部品）。
// App.jsx から GuideButton / SectionGuide / GuideLabel をそのまま切り出したもので、
// JSX・スタイル・文言キーは一切変更していない。
// ============================================================================

import { useState, useContext } from "react";
import { LocaleContext } from "./locale.js";

// ---------- UI atoms ----------
// ---------- 入力ガイド（「?」ボタンを押すと、何を入力する欄なのかが開く） ----------
// 金額の入力欄・入力ブロックの見出しの隣に置き、迷わず入力できるようにする。
// 計算やデータ構造には一切関与しない、表示専用のUI部品。
function GuideButton({ open, onToggle }) {
  const { t } = useContext(LocaleContext);
  return (
    <button
      type="button"
      className={`guide-btn ${open ? "guide-btn-open" : ""}`}
      aria-label={t("guideButtonLabel")}
      aria-expanded={open}
      title={t("guideButtonLabel")}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggle(); }}
    >
      ?
    </button>
  );
}

// 入力ブロックの見出し（例：「積立枠の保有銘柄」）にガイドを付けるためのラッパー。
// <GuideLabel guide={t("...Guide")}>{t("...Label")}</GuideLabel> の形で使う。
// セクション見出しの直下に置く、単独のガイドボタン（テーブル形式のセクション用）
function SectionGuide({ guide }) {
  const { t } = useContext(LocaleContext);
  const [open, setOpen] = useState(false);
  if (!guide) return null;
  return (
    <div style={{ marginBottom: 10, marginTop: -4 }}>
      <button
        type="button"
        className={`section-guide-btn ${open ? "guide-btn-open" : ""}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="guide-btn" aria-hidden="true">?</span>
        <span>{t("guideButtonLabel")}</span>
      </button>
      {open && <div className="guide-text">{guide}</div>}
    </div>
  );
}

function GuideLabel({ children, guide, style }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginBottom: 6, ...(style || {}) }}>
      <div className="field-label-row">
        <span className="field-label">{children}</span>
        {guide && <GuideButton open={open} onToggle={() => setOpen((v) => !v)} />}
      </div>
      {guide && open && <div className="guide-text">{guide}</div>}
    </div>
  );
}

export { GuideButton, SectionGuide, GuideLabel };
