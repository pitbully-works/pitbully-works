// ============================================================================
// panels/AURetirementPanel.jsx
// オーストラリア選択時：退職後パネル（Age Pension → Expenses → Withdrawal）
// App.jsx からそのまま切り出したパネル。JSX・スタイル・計算式・props は一切変更していない。
// 状態（state）は一切持たず、App.jsx から props で受け取った値のみを表示・計算に使う。
// ============================================================================

import { useContext } from "react";
import { Info } from "lucide-react";
import { LocaleContext, Field, StatCard } from "../ui/index.js";

// ---------- オーストラリア選択時：退職後パネル（Age Pension → Expenses → Withdrawal） ----------
function AURetirementPanel({
  auInvestment, onUpdateAgePension, onUpdate, retirementRules,
  qualifyingAge, maxAnnual, agePensionAnnual, retirementIncomeAnnual,
  assessableAssets, expensesAnnual, healthcareAnnual, withdrawalNeeded, incomeSurplus, retireAge,
}) {
  const { t, money } = useContext(LocaleContext);
  const p = retirementRules.agePension;
  const status = auInvestment.agePension.status;
  const homeowner = !!auInvestment.agePension.homeowner;
  const statusLabel = status === "couple" ? t("auCoupleLabel") : t("auSingleLabel");

  return (
    <div>
      <div className="stat-grid" style={{ marginBottom: 12 }}>
        <StatCard
          label={t("auAgePensionQualifyingAgeLabel")}
          value={t("ageYears", { age: qualifyingAge })}
          sub={t("auAgePensionMaxSub", { status: statusLabel })}
        />
        <StatCard label={t("auAgePensionMaxLabel")} value={money(maxAnnual)} sub={t("auAgePensionMaxSub", { status: statusLabel })} />
      </div>
      {retireAge < qualifyingAge && (
        <div className="note" style={{ borderLeftColor: "#D9A54F", marginBottom: 10 }}>
          <Info size={13} style={{ color: "#D9A54F" }} />
          <span>{t("auAgePensionNotYetNote", { age: qualifyingAge })}</span>
        </div>
      )}

      <div className="field-label" style={{ marginBottom: 6 }}>{t("auStatusLabel")}</div>
      <div className="chip-row" style={{ marginBottom: 10 }}>
        <button
          className={`chip ${status === "single" ? "chip-active" : ""}`}
          onClick={() => onUpdateAgePension("status", "single")}
        >{t("auSingleLabel")}</button>
        <button
          className={`chip ${status === "couple" ? "chip-active" : ""}`}
          onClick={() => onUpdateAgePension("status", "couple")}
        >{t("auCoupleLabel")}</button>
      </div>

      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={homeowner}
          onChange={(e) => onUpdateAgePension("homeowner", e.target.checked)}
        />
        <span>{t("auHomeownerLabel")}</span>
      </label>

      <Field
        guide={t("auOtherIncomeGuide")}
        label={t("auOtherIncomeLabel")} unit="A$" step={500}
        value={auInvestment.agePension.otherAnnualIncome}
        onChange={(v) => onUpdateAgePension("otherAnnualIncome", v)}
      />

      <div className="stat-grid" style={{ marginTop: 10 }}>
        <StatCard
          label={t("auIncomeTestLabel")}
          value={money(retirementRules.getAgePensionByIncomeTest(auInvestment.agePension.otherAnnualIncome, status))}
          sub={t("auIncomeTestSub", {
            amount: money(retirementRules.getIncomeFreeAreaAnnual(status)),
            taper: Math.round(p.incomeTaperPerDollar * 100),
          })}
        />
        <StatCard
          label={t("auAssetsTestLabel")}
          value={money(retirementRules.getAgePensionByAssetsTest(assessableAssets, status, homeowner))}
          sub={t("auAssetsTestSub", {
            amount: money(retirementRules.getAssetsFreeArea(status, homeowner)),
            taper: p.assetsTaperPerThousandFortnightly,
          })}
        />
      </div>
      <div className="stat-grid" style={{ marginTop: 10, marginBottom: 14 }}>
        <StatCard label={t("auAgePensionAnnualLabel")} value={money(agePensionAnnual)} sub={t("auAgePensionAnnualSub")} />
        <StatCard label={t("auRetirementIncomeLabel")} value={money(retirementIncomeAnnual)} sub={t("auRetirementIncomeSub")} tone="good" />
      </div>
      {agePensionAnnual <= 0 && retireAge >= qualifyingAge && (
        <div className="note" style={{ borderLeftColor: "#C2694F", marginBottom: 10 }}>
          <Info size={13} style={{ color: "#C2694F" }} />
          <span>{t("auAgePensionZeroNote")}</span>
        </div>
      )}

      <Field
        guide={t("auExpensesMonthlyGuide")}
        label={t("auExpensesMonthlyLabel")} unit="A$" step={50}
        value={auInvestment.expensesMonthly}
        onChange={(v) => onUpdate("expensesMonthly", v)}
      />
      <div className="stat-grid" style={{ marginTop: 10 }}>
        <StatCard label={t("auExpensesTotalLabel")} value={money(expensesAnnual + healthcareAnnual)} sub={t("auExpensesTotalSub")} />
        {withdrawalNeeded > 0 ? (
          <StatCard label={t("auWithdrawalLabel")} value={money(withdrawalNeeded)} sub={t("auWithdrawalSub")} tone="danger" />
        ) : (
          <StatCard label={t("auSurplusLabel")} value={money(incomeSurplus)} sub={t("auSurplusSub")} tone="good" />
        )}
      </div>
    </div>
  );
}

export { AURetirementPanel };
