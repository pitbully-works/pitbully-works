// ============================================================================
// panels/CARetirementPanel.jsx
// カナダ選択時：退職後パネル（CPP → OAS → Expenses → Withdrawal）
// App.jsx からそのまま切り出したパネル。JSX・スタイル・計算式・props は一切変更していない。
// 状態（state）は一切持たず、App.jsx から props で受け取った値のみを表示・計算に使う。
// ============================================================================

import { useContext } from "react";
import { Info } from "lucide-react";
import { LocaleContext, Field, AgeField, StatCard } from "../ui/index.js";

// ---------- カナダ選択時：退職後パネル（CPP → OAS → Expenses → Withdrawal） ----------
function CARetirementPanel({
  caInvestment, onUpdateCpp, onUpdateOas, onUpdate, retirementRules,
  cppStartAge, cppFactor, cppAnnual, cppMaxAnnual,
  oasStartAge, oasEffectiveStartAge, oasResidenceFraction,
  oasBeforeClawback, oasClawback, oasAnnual,
  retirementIncomeAnnual, expensesAnnual, healthcareAnnual, withdrawalNeeded, incomeSurplus,
}) {
  const { t, money } = useContext(LocaleContext);
  const cpp = retirementRules.cpp;
  const oas = retirementRules.oas;
  const pct = (rate) => `${Number((rate * 100).toFixed(2))}`;
  const residenceYears = Number(caInvestment.oas.residenceYears) || 0;

  return (
    <div>
      {/* ---- CPP ---- */}
      <div className="field-label" style={{ marginBottom: 6 }}>{t("caCppAnnualLabel")}</div>
      <Field
        guide={t("caCppEstimateGuide")}
        label={t("caCppEstimateLabel")} unit="C$" step={100}
        value={caInvestment.cpp.estimatedAnnualAt65}
        onChange={(v) => onUpdateCpp("estimatedAnnualAt65", v)}
      />
      <div className="stat-sub" style={{ marginBottom: 8 }}>
        {t("caCppFullNote", { taxYear: retirementRules.effectiveTaxYear, amount: money(cppMaxAnnual) })}
      </div>
      <AgeField
        label={t("caCppStartAgeLabel", { min: cpp.earliestAge, max: cpp.latestAge })}
        value={cppStartAge}
        onChange={(v) => onUpdateCpp("startAge", Math.round(v))}
      />
      {cppFactor !== 1 && (
        <div className="note" style={{ marginTop: -8 }}>
          <Info size={13} />
          <span>{t("caCppFactorNote", {
            age: cppStartAge,
            pct: Number((cppFactor * 100).toFixed(1)),
            early: pct(cpp.earlyReductionPerMonth),
            late: pct(cpp.lateIncreasePerMonth),
          })}</span>
        </div>
      )}

      {/* ---- OAS ---- */}
      <div className="field-label" style={{ marginTop: 16, marginBottom: 6 }}>{t("caOasAnnualLabel")}</div>
      <AgeField
        label={t("caOasStartAgeLabel", { min: oas.standardAge, max: oas.latestAge })}
        value={oasStartAge}
        onChange={(v) => onUpdateOas("startAge", Math.round(v))}
      />
      {oasEffectiveStartAge > oasStartAge && (
        <div className="note" style={{ marginTop: -8, borderLeftColor: "#D9A54F" }}>
          <Info size={13} style={{ color: "#D9A54F" }} />
          <span>{t("caOasNoEarlyNote", { age: oasEffectiveStartAge })}</span>
        </div>
      )}
      <Field
        guide={t("caOasResidenceGuide")}
        label={t("caOasResidenceLabel", { full: oas.fullResidenceYears })}
        unit={t("caYearsUnit")} step={1}
        value={caInvestment.oas.residenceYears}
        onChange={(v) => onUpdateOas("residenceYears", v)}
      />
      <div className="stat-sub" style={{ marginBottom: 8 }}>
        {t("caOasResidenceSub", {
          years: residenceYears,
          pct: Number((oasResidenceFraction * 100).toFixed(1)),
          min: oas.minimumResidenceYears,
        })}
      </div>
      <div className="note" style={{ marginBottom: 8 }}>
        <Info size={13} />
        <span>{t("caOasEnhancedNote", {
          base: money(oas.maxMonthly65to74 * 12),
          enhanced: money(oas.maxMonthly75plus * 12),
        })}</span>
      </div>
      {oasClawback > 0 && (
        <div className="note" style={{ borderLeftColor: "#C2694F", marginBottom: 8 }}>
          <Info size={13} style={{ color: "#C2694F" }} />
          <span>{t("caOasClawbackNote", {
            threshold: money(oas.recoveryTaxThreshold2026),
            pct: pct(oas.recoveryTaxRate),
            amount: money(oasClawback),
          })}</span>
        </div>
      )}

      <Field
        guide={t("caAdditionalPensionGuide")}
        label={t("caAdditionalPensionLabel")} unit="C$" step={100}
        value={caInvestment.additionalPensionAnnual}
        onChange={(v) => onUpdate("additionalPensionAnnual", v)}
      />

      <div className="stat-grid" style={{ marginTop: 10, marginBottom: 14 }}>
        <StatCard label={t("caCppAnnualLabel")} value={money(cppAnnual)} sub={t("caCppAnnualSub")} />
        <StatCard label={t("caOasAnnualLabel")} value={money(oasAnnual)} sub={t("caOasAnnualSub")} />
        <StatCard
          label={t("caOasClawbackLabel")}
          value={money(oasClawback)}
          sub={t("caOasClawbackSub", { threshold: money(oas.recoveryTaxThreshold2026), pct: pct(oas.recoveryTaxRate) })}
          tone={oasClawback > 0 ? "danger" : undefined}
        />
        <StatCard label={t("caRetirementIncomeLabel")} value={money(retirementIncomeAnnual)} sub={t("caRetirementIncomeSub")} tone="good" />
      </div>

      <Field
        guide={t("caExpensesMonthlyGuide")}
        label={t("caExpensesMonthlyLabel")} unit="C$" step={50}
        value={caInvestment.expensesMonthly}
        onChange={(v) => onUpdate("expensesMonthly", v)}
      />
      <div className="stat-grid" style={{ marginTop: 10 }}>
        <StatCard label={t("caExpensesTotalLabel")} value={money(expensesAnnual + healthcareAnnual)} sub={t("caExpensesTotalSub")} />
        {withdrawalNeeded > 0 ? (
          <StatCard label={t("caWithdrawalLabel")} value={money(withdrawalNeeded)} sub={t("caWithdrawalSub")} tone="danger" />
        ) : (
          <StatCard label={t("caSurplusLabel")} value={money(incomeSurplus)} sub={t("caSurplusSub")} tone="good" />
        )}
      </div>
    </div>
  );
}

export { CARetirementPanel };
