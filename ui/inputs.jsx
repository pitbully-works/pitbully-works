// ============================================================================
// ui/inputs.jsx
// 入力欄まわりの共通UI部品（国に依存しない部品）。
// App.jsx から MAN / useMoneyScale / MoneyInput / MoneyField / Field / AgeField /
// AgeYMInput / LabeledMiniInput / CustomBenefitEditor をそのまま切り出したもので、
// JSX・スタイル・入力挙動・単位換算（円↔万円）は一切変更していない。
// ============================================================================

import { useState, useEffect, useContext } from "react";
import { Plus } from "lucide-react";
import { LocaleContext, yen } from "./locale.js";
import { GuideButton } from "./guides.jsx";

// ============================================================================
// 金額入力は「万円」単位に統一する（基準通貨が円のとき）。
//
// 【なぜ】円のまま7桁を入力させると、スマホでは先頭のゼロ1文字だけを消すような
// 細かいカーソル操作ができず、`0240000`（24万円）を `023000`（2.3万円）に
// 直してしまうような1桁の取り違えが起きる。実際にそれで生活費が1/10になり、
// シミュレーション結果が別物になった。
// 万円単位なら「24」の2桁で済むため、桁を数え間違えようがない。
//
// 内部で保持する値は従来どおり「円」。表示と入力だけを万円に変換する。
// 円以外の通貨（USD等）は万の概念が無いため、そのままの単位で扱う。
// ============================================================================
const MAN = 10000;

function useMoneyScale() {
  const { baseCurrency } = useContext(LocaleContext);
  return (baseCurrency || "JPY") === "JPY" ? MAN : 1;
}

// 円 <-> 万円 の相互変換を行う入力欄（行内の小さな入力用）
function MoneyInput({ value, onChange, placeholder, className, style, disabled }) {
  const scale = useMoneyScale();
  const toDisplay = (yen) => (yen === "" || yen === null || yen === undefined ? "" : String(Number(yen) / scale));
  const [text, setText] = useState(toDisplay(value));
  const [editing, setEditing] = useState(false);

  // 外部から値が変わったとき（他の操作でリセットされた等）に表示を同期する
  useEffect(() => {
    if (!editing) setText(toDisplay(value));
  }, [value, scale]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <input
      type="number"
      inputMode="decimal"
      className={className}
      style={style}
      disabled={disabled}
      placeholder={placeholder}
      value={text}
      onFocus={(e) => { setEditing(true); e.target.select(); }}
      onBlur={() => { setEditing(false); setText(toDisplay(value)); }}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        onChange(raw === "" ? "" : Number(raw) * scale);
      }}
    />
  );
}

// ラベル付きの金額入力欄（Field の金額版）
function MoneyField({ label, value, onChange, unitPer, guide, disabled, mono = true }) {
  const { t, baseCurrency, currencySymbol } = useContext(LocaleContext);
  const [showGuide, setShowGuide] = useState(false);
  const isYen = (baseCurrency || "JPY") === "JPY";
  const scale = isYen ? MAN : 1;
  // unitPer: undefined | "month" | "year"
  const base = isYen ? t("unitMan") : currencySymbol;
  const unit = unitPer === "month" ? `${base}${t("unitPerMonthSuffix")}`
    : unitPer === "year" ? `${base}${t("unitPerYearSuffix")}`
    : base;

  const toDisplay = (yen) => (yen === "" || yen === null || yen === undefined ? "" : String(Number(yen) / scale));
  const [text, setText] = useState(toDisplay(value));
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (!editing) setText(toDisplay(value)); }, [value, scale]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <label className="field">
      <span className="field-label-row">
        <span className="field-label">{label}</span>
        {guide && <GuideButton open={showGuide} onToggle={() => setShowGuide((v) => !v)} />}
      </span>
      {guide && showGuide && <span className="guide-text">{guide}</span>}
      <div className="field-input-wrap">
        <input
          type="number"
          inputMode="decimal"
          value={text}
          min={0}
          disabled={disabled}
          className={mono ? "mono" : ""}
          onFocus={(e) => { setEditing(true); e.target.select(); }}
          onBlur={() => { setEditing(false); setText(toDisplay(value)); }}
          onChange={(e) => {
            const raw = e.target.value;
            setText(raw);
            onChange(raw === "" ? 0 : Number(raw) * scale);
          }}
        />
        <span className="field-unit">{unit}</span>
      </div>
      {/* 桁の取り違えを目視で防ぐため、実額を併記する */}
      {value !== "" && value !== null && value !== undefined && Number(value) > 0 && (
        <span className="guide-text" style={{ opacity: 0.6, marginTop: 4 }}>
          = {new Intl.NumberFormat().format(Math.round(Number(value)))} {isYen ? t("currencyUnit") : currencySymbol}
        </span>
      )}
    </label>
  );
}

function Field({ label, unit, value, onChange, step = 1, min = 0, max, mono = true, disabled = false, guide }) {
  const [showGuide, setShowGuide] = useState(false);

  // 【なぜ表示用のテキストを別に持つか】
  // 従来は <input type="number" value={value}> に数値をそのまま流していたため、
  // 初期値 0 が「0」という文字として枠内に残り、iOSでは type="number" に対して
  // e.target.select()（全選択）が効かないので、カーソルが 0 の後ろに置かれて
  // 「0」＋「789」＝「0789」と入力されてしまっていた。
  // （保存される値は Number("0789") = 789 で正しいが、画面の表示だけが 0789 のまま残る）
  // MoneyInput と同じく表示用テキストを自前で持ち、フォーカス時に 0 を消すことで解決する。
  // 表示形式・計算・保存データ構造は一切変えていない。
  const toDisplay = (v) => (v === "" || v === null || v === undefined ? "" : String(v));
  const [text, setText] = useState(toDisplay(value));
  const [editing, setEditing] = useState(false);

  // 外部から値が変わったとき（国の切替・保存データの読み込み等）に表示を同期する
  useEffect(() => {
    if (!editing) setText(toDisplay(value));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <label className="field">
      <span className="field-label-row">
        <span className="field-label">{label}</span>
        {guide && <GuideButton open={showGuide} onToggle={() => setShowGuide((v) => !v)} />}
      </span>
      {guide && showGuide && <span className="guide-text">{guide}</span>}
      <div className="field-input-wrap">
        <input
          type="number"
          value={text}
          step={step}
          min={min}
          max={max}
          disabled={disabled}
          onChange={(e) => {
            const raw = e.target.value;
            setText(raw);
            onChange(raw === "" ? 0 : Number(raw));
          }}
          onFocus={(e) => {
            setEditing(true);
            // 0 のときは枠を空にして、先頭に 0 が残らないようにする
            if (Number(text) === 0) setText("");
            else e.target.select();
          }}
          onBlur={() => {
            setEditing(false);
            // 空のまま離れたら 0 に戻す。数字が入っていれば先頭の 0 を落として正規化する
            if (text === "") { onChange(0); setText("0"); }
            else setText(String(Number(text)));
          }}
          className={mono ? "mono" : ""}
        />
        {unit && <span className="field-unit">{unit}</span>}
      </div>
    </label>
  );
}

// 年齢の「歳＋ヶ月」表示は、言語設定を必要とするためコンポーネント内のformatAge（下記）で行う。

// 年齢を「歳」と「ヶ月」の2つの入力欄に分けて、小数の年齢値として扱う
function AgeField({ label, value, onChange, disabled, guide }) {
  const { t } = useContext(LocaleContext);
  const [showGuide, setShowGuide] = useState(false);
  const years = Math.floor(value + 1e-9);
  const months = Math.round((value - years) * 12);
  const commit = (y, m) => {
    let yy = y, mm = m;
    if (mm >= 12) { yy += Math.floor(mm / 12); mm = mm % 12; }
    if (mm < 0) { mm = 0; }
    onChange(yy + mm / 12);
  };
  return (
    <label className="field">
      <span className="field-label-row">
        <span className="field-label">{label}</span>
        {guide && <GuideButton open={showGuide} onToggle={() => setShowGuide((v) => !v)} />}
      </span>
      {guide && showGuide && <span className="guide-text">{guide}</span>}
      <div style={{ display: "flex", gap: 6 }}>
        <div className="field-input-wrap" style={{ flex: 1 }}>
          <input type="number" className="mono" value={years} disabled={disabled} onChange={(e) => commit(Number(e.target.value), months)} onFocus={(e) => e.target.select()} />
          <span className="field-unit">{t("unitYears")}</span>
        </div>
        <div className="field-input-wrap" style={{ flex: 1 }}>
          <input type="number" className="mono" min={0} max={11} value={months} disabled={disabled} onChange={(e) => commit(years, Number(e.target.value))} onFocus={(e) => e.target.select()} />
          <span className="field-unit">{t("unitMonths")}</span>
        </div>
      </div>
    </label>
  );
}

// 追加フォーム用の小型「歳＋ヶ月」入力（2つの数値を親のuseState断片として管理）
function AgeYMInput({ years, months, onYears, onMonths, placeholder }) {
  const { t } = useContext(LocaleContext);
  const inputStyle = {
    width: "50%",
    background: "var(--panel-2)",
    border: "1px solid var(--line)",
    color: "var(--text)",
    padding: "7px 9px",
    borderRadius: 3,
    fontSize: 12,
    outline: "none",
  };
  return (
    <div style={{ display: "flex", gap: 4, flex: 1 }}>
      <input
        type="number" placeholder={`${placeholder}${t("unitYearsShort")}`} value={years}
        onChange={(e) => onYears(e.target.value)}
        onFocus={(e) => e.target.select()}
        style={inputStyle}
      />
      <input
        type="number" placeholder={t("unitMonths")} min={0} max={11} value={months}
        onChange={(e) => onMonths(e.target.value)}
        onFocus={(e) => e.target.select()}
        style={inputStyle}
      />
    </div>
  );
}

// 常に表示されるラベル付き入力（placeholderは入力すると消えてしまい何の欄か分からなくなるため、
// ラベルを別要素として常時表示する）
function LabeledMiniInput({ label, value, onChange, type = "number", money = false, onChangeValue }) {
  const { t, baseCurrency } = useContext(LocaleContext);
  const isYen = (baseCurrency || "JPY") === "JPY";
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 10, color: "#7C8A90", marginBottom: 2 }}>
        {label}{money && isYen ? `（${t("unitMan")}）` : ""}
      </div>
      {money ? (
        <MoneyInput value={value} onChange={(v) => onChangeValue(v)} style={{ width: "100%" }} />
      ) : (
        <input type={type} value={value} onChange={onChange} style={{ width: "100%" }} />
      )}
    </div>
  );
}

// 保険の保障内容に、任意の項目名と金額を自由に追加できる小さな編集フォーム
function CustomBenefitEditor({ onAdd }) {
  const { t } = useContext(LocaleContext);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  return (
    <div className="add-row" style={{ marginTop: 6 }}>
      <input placeholder={t("customBenefitNamePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} />
      <MoneyInput placeholder={t("amountPlaceholderMan")} value={amount} onChange={(v) => setAmount(v)} />
      <button
        className="add-btn"
        onClick={() => {
          if (!name.trim()) return;
          onAdd(name.trim(), Number(amount) || 0);
          setName("");
          setAmount("");
        }}
      >
        <Plus size={15} />
      </button>
    </div>
  );
}

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
};
