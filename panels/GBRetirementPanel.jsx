// ============================================================================
// panels/GBRetirementPanel.jsx
// イギリス選択時：退職後パネル（State Pension → Expenses → Withdrawal）
// App.jsx からそのまま切り出したパネル。JSX・スタイル・計算式・props は一切変更していない。
// 状態（state）は一切持たず、App.jsx から props で受け取った値のみを表示・計算に使う。
// ============================================================================

import { useContext } from "react";
import { Info } from "lucide-react";
import { LocaleContext, Field, AgeField, StatCard } from "../ui/index.js";
import { GB_COUNTRY_RULES } from "../countryRules/index.js";

// ---------- イギリス選択時：退職後パネル（State Pension → Expenses → Withdrawal） ----------
function GBRetirementPanel({
  gbInvestment, onUpdateStatePension, onUpdate, retirementRules,
  statePensionAge, claimAge, effectiveClaimAge, deferralFactor,
  statePensionAnnual, retirementIncomeAnnual, fullStatePensionAnnual,
  expensesAnnual, healthcareAnnual, withdrawalNeeded, incomeSurplus,
}) {
  const { t, money, baseCurrency } = useContext(LocaleContext);
  // 表示に使う数値はすべて GB_COUNTRY_RULES（retirementRules）から取り出す。
  const sp = retirementRules.statePension;
  const symbol = (CURRENCY_BY_CODE[baseCurrency] || CURRENCY_BY_CODE.GBP).symbol;
  const weeklyFull = `${symbol}${sp.fullWeeklyRate.toFixed(2)}`;
  // 繰下げ増額率（小数第2位まで。52週の繰下げなら 5.78%）
  const deferralPct = Number(((deferralFactor - 1) * 100).toFixed(2));
  return (
    <div>
      <div className="note" style={{ marginBottom: 12 }}>
        <Info size={13} />
        <span>{t("gbStatePensionSourceNote", {
          years: sp.qualifyingYearsForFull,
          weeks: sp.deferralUnitWeeks,
          unitPct: Number((sp.deferralUpliftPerNineWeeks * 100).toFixed(2)),
        })}</span>
      </div>

      <AgeField
        label={t("gbStatePensionAgeLabel")}
        value={statePensionAge}
        onChange={(v) => onUpdateStatePension("statePensionAge", Math.round(v))}
      />
      <div className="note" style={{ marginTop: -8, marginBottom: 8 }}>
        <Info size={13} />
        <span>{t("gbStatePensionAgeNote", { from: sp.ageBefore2026, to: sp.ageAfterTransition })}</span>
      </div>

      <Field
        guide={t("gbStatePensionEstimateGuide")}
        label={t("gbStatePensionEstimateLabel")} unit="£" step={100}
        value={gbInvestment.statePension.estimatedAnnual}
        onChange={(v) => onUpdateStatePension("estimatedAnnual", v)}
      />
      <div className="stat-sub" style={{ marginBottom: 8 }}>
        {t("gbFullStatePensionNote", {
          amount: money(fullStatePensionAnnual),
          weekly: weeklyFull,
          taxYear: retirementRules.effectiveTaxYear,
        })}
      </div>

      <AgeField
        label={t("gbClaimAgeLabel")}
        value={claimAge}
        onChange={(v) => onUpdateStatePension("claimAge", Math.round(v))}
      />
      {effectiveClaimAge > claimAge && (
        <div className="note" style={{ marginTop: -8, borderLeftColor: "#D9A54F" }}>
          <Info size={13} style={{ color: "#D9A54F" }} />
          <span>{t("gbEffectiveClaimAgeNote", { age: t("ageYears", { age: effectiveClaimAge }) })}</span>
        </div>
      )}
      {deferralFactor > 1 && (
        <div className="note" style={{ marginTop: -8 }}>
          <Info size={13} />
          <span>{t("gbDeferralNote", {
            pct: deferralPct,
            unitPct: Number((sp.deferralUpliftPerNineWeeks * 100).toFixed(2)),
            weeks: sp.deferralUnitWeeks,
          })}</span>
        </div>
      )}

      <Field
        guide={t("gbOverlapYearsGuide")}
        label={t("gbOverlapYearsLabel")} unit={t("gbOverlapYearsUnit")} step={1}
        value={gbInvestment.statePension.incomeOverlapYears}
        onChange={(v) => onUpdateStatePension("incomeOverlapYears", v)}
      />
      <div className="stat-sub" style={{ marginBottom: 8 }}>{t("gbOverlapYearsSub")}</div>

      <Field
        guide={t("gbAdditionalPensionGuide")}
        label={t("gbAdditionalPensionLabel")} unit="£" step={100}
        value={gbInvestment.statePension.additionalPensionAnnual}
        onChange={(v) => onUpdateStatePension("additionalPensionAnnual", v)}
      />

      <div className="stat-grid" style={{ marginTop: 10, marginBottom: 14 }}>
        <StatCard label={t("gbStatePensionAnnualLabel")} value={money(statePensionAnnual)} sub={t("gbStatePensionAnnualSub")} />
        <StatCard label={t("gbRetirementIncomeLabel")} value={money(retirementIncomeAnnual)} sub={t("gbRetirementIncomeSub")} tone="good" />
      </div>

      <Field
        guide={t("gbExpensesMonthlyGuide")}
        label={t("gbExpensesMonthlyLabel")} unit="£" step={50}
        value={gbInvestment.expensesMonthly}
        onChange={(v) => onUpdate("expensesMonthly", v)}
      />

      <div className="stat-grid" style={{ marginTop: 10 }}>
        <StatCard label={t("gbExpensesTotalLabel")} value={money(expensesAnnual + healthcareAnnual)} sub={t("gbExpensesTotalSub")} />
        {withdrawalNeeded > 0 ? (
          <StatCard label={t("gbWithdrawalLabel")} value={money(withdrawalNeeded)} sub={t("gbWithdrawalSub")} tone="danger" />
        ) : (
          <StatCard label={t("gbSurplusLabel")} value={money(incomeSurplus)} sub={t("gbSurplusSub")} tone="good" />
        )}
      </div>
    </div>
  );
}

export { GBRetirementPanel };
