// ============================================================================
// ui/comparison.jsx
// シナリオ比較カード（総資産推移グラフの上に置く）。
//
// 【設計方針】
// ・state を持たない。すべて App.jsx から props で受け取る（他のパネルと同じ規約）。
// ・計算は一切しない。utils/scenarioComparison.js が返した結果を並べるだけ。
// ・スマホ前提：横スクロールする表は使わず、縦に積むカード形式にする。
// ・国に依存しない。生活費の単位・通貨は LocaleContext の money()/MoneyField が吸収する。
// ============================================================================

import { useContext } from "react";
// ui/index.js 経由で読むと index.js → comparison.jsx → index.js の循環になるため、
// 各モジュールから直接 import する。
import { LocaleContext } from "./locale.js";
import { AgeField, MoneyField } from "./inputs.jsx";
import { SectionGuide } from "./guides.jsx";

// 差額の表示。プラス（改善）は緑、マイナス（悪化）は赤。0はグレー。
function DiffLine({ value, invert = false }) {
  const { t, money } = useContext(LocaleContext);
  if (!Number.isFinite(value) || Math.abs(value) < 1) {
    return <span style={{ color: "#7C8A90" }}>{t("scenarioCompareNoChange")}</span>;
  }
  const good = invert ? value < 0 : value > 0;
  const sign = value > 0 ? "+" : "−";
  return (
    <span style={{ color: good ? "#8FBF7F" : "#C2694F", fontWeight: 600 }}>
      {sign}{money(Math.abs(value))}
    </span>
  );
}

// 「現在プラン → 比較プラン」と差額を1枚に収めた比較カード。
// StatCard の sub 行に差額を入れることで、既存のカード様式をそのまま使える。
function CompareCard({ label, baseText, compareText, diff, invertDiff, tone }) {
  const { t } = useContext(LocaleContext);
  return (
    <div className={`stat-card ${tone || ""}`}>
      <div className="stat-label">{label}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 2 }}>
        <div className="stat-sub">
          {t("scenarioCompareCurrentPlan")}：<span className="mono">{baseText}</span>
        </div>
        <div className="stat-value mono" style={{ fontSize: 15 }}>{compareText}</div>
        {diff !== undefined && (
          <div className="stat-sub">
            {t("scenarioCompareDiff")}：<DiffLine value={diff} invert={invertDiff} />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * @param {boolean}  active            比較中か
 * @param {object}   draft             { retireAge, livingCostMonthly, contributionMultiplier }
 * @param {object}   result            runScenarioComparison の戻り値（比較中のみ）
 * @param {number[]} multipliers       選べる倍率（CONTRIBUTION_MULTIPLIERS）
 * @param {function} onStart / onEnd / onChange
 */
function ScenarioComparisonCard({
  active, draft, result, multipliers, onStart, onEnd, onChange,
}) {
  const { t, money } = useContext(LocaleContext);

  const ageText = (age) =>
    (age === null || age === undefined || !Number.isFinite(age))
      ? t("scenarioCompareNoDepletion")
      : t("ageYears", { age: Math.round(age) });

  const inheritanceText = (s) =>
    s.inheritanceAchieved === null
      ? t("scenarioCompareNoTarget")
      : s.inheritanceAchieved
        ? t("scenarioCompareAchieved", { amount: money(Math.abs(s.inheritanceGap)) })
        : t("scenarioCompareNotAchieved", { amount: money(Math.abs(s.inheritanceGap)) });

  return (
    <div className="section-block" style={{ borderColor: "#4FA8D8", marginBottom: 18 }}>
      <div className="field-label" style={{ marginBottom: 6, fontWeight: 700 }}>
        {t("scenarioCompareTitle")}
      </div>
      <SectionGuide guide={t("scenarioCompareGuide")} />

      {!active && (
        <button
          type="button"
          className="add-btn"
          style={{ width: "100%", padding: "10px 0", fontSize: 13 }}
          onClick={onStart}
        >
          {t("scenarioCompareCreate")}
        </button>
      )}

      {active && draft && (
        <>
          {/* ---- 変更できるのはこの3項目だけ ---- */}
          <AgeField
            guide={t("scenarioCompareRetireAgeGuide")}
            label={t("scenarioCompareRetireAge")}
            value={draft.retireAge}
            onChange={(v) => onChange({ ...draft, retireAge: v })}
          />
          <MoneyField
            unitPer="month"
            guide={t("scenarioCompareLivingCostGuide")}
            label={t("scenarioCompareLivingCost")}
            value={draft.livingCostMonthly}
            onChange={(v) => onChange({ ...draft, livingCostMonthly: v })}
          />

          <div className="field-label" style={{ marginTop: 10, marginBottom: 6 }}>
            {t("scenarioCompareMultiplier")}
          </div>
          <div className="chip-row" style={{ marginBottom: 4, flexWrap: "wrap" }}>
            {multipliers.map((m) => (
              <button
                key={m}
                type="button"
                className={`chip ${draft.contributionMultiplier === m ? "chip-active" : ""}`}
                onClick={() => onChange({ ...draft, contributionMultiplier: m })}
              >
                {t("scenarioCompareMultiplierValue", { value: m.toFixed(1) })}
              </button>
            ))}
          </div>
          <div className="guide-text" style={{ marginBottom: 12 }}>
            {t("scenarioCompareMultiplierNote")}
          </div>

          {/* ---- 結果（表ではなくカード。スマホでは1列に縦積みされる） ---- */}
          {result && (
            <div
              className="stat-grid"
              style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8, marginBottom: 12 }}
            >
              <CompareCard
                label={t("scenarioCompareAtRetire", { age: t("ageYears", { age: Math.round(result.compare.retireAge) }) })}
                baseText={money(result.base.netWorthAtRetire)}
                compareText={money(result.compare.netWorthAtRetire)}
                diff={result.diff.netWorthAtRetire}
              />
              <CompareCard
                label={t("scenarioCompareAtDeath")}
                baseText={money(result.base.netWorthFinal)}
                compareText={money(result.compare.netWorthFinal)}
                diff={result.diff.netWorthFinal}
              />
              <CompareCard
                label={t("scenarioCompareDepletion")}
                baseText={ageText(result.base.depletionAge)}
                compareText={ageText(result.compare.depletionAge)}
                tone={result.compare.depletionAge !== null ? "danger" : "good"}
              />
              <CompareCard
                label={t("scenarioCompareInheritance")}
                baseText={inheritanceText(result.base)}
                compareText={inheritanceText(result.compare)}
                diff={result.compare.inheritanceAchieved === null ? undefined : result.diff.inheritanceGap}
                tone={result.compare.inheritanceAchieved ? "good" : undefined}
              />
            </div>
          )}

          <button
            type="button"
            className="add-btn"
            style={{
              width: "100%",
              padding: "13px 0",
              fontSize: 14,
              fontWeight: 600,
              borderRadius: 6,
              marginTop: 4,
            }}
            onClick={onEnd}
          >
            {t("scenarioCompareEndFull")}
          </button>

          <div className="guide-text" style={{ marginTop: 8 }}>
            {t("scenarioCompareNote")}
          </div>
        </>
      )}
    </div>
  );
}

export { ScenarioComparisonCard };
