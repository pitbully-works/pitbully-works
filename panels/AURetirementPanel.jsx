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
  qualifyingAge, maxAnnual, agePensionAnnual, agePensionPerPersonAnnual, recipients,
  deemedIncomeAnnual, retirementIncomeAnnual,
  assessableAssets, expensesAnnual, healthcareAnnual, withdrawalNeeded, incomeSurplus, retireAge,
}) {
  const { t, money } = useContext(LocaleContext);
  const status = auInvestment.agePension.status;
  const homeowner = !!auInvestment.agePension.homeowner;
  const bothQualified = auInvestment.agePension.bothQualified !== false;
  const statusLabel = status === "couple" ? t("auCoupleLabel") : t("auSingleLabel");
  // 所得テストに実際に使われる所得＝入力したその他の年収 ＋ 金融資産のみなし収入
  const otherIncome = Number(auInvestment.agePension.otherAnnualIncome) || 0;
  const assessableIncome = otherIncome + (Number(deemedIncomeAnnual) || 0);

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
      {status === "couple" && (
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={bothQualified}
            onChange={(e) => onUpdateAgePension("bothQualified", e.target.checked)}
          />
          <span>{t("auBothQualifiedLabel", { age: qualifyingAge })}</span>
        </label>
      )}

      <Field
        guide={t("auOtherIncomeGuide")}
        label={t("auOtherIncomeLabel")} unit="A$" step={500}
        value={auInvestment.agePension.otherAnnualIncome}
        onChange={(v) => onUpdateAgePension("otherAnnualIncome", v)}
      />

      <div className="stat-grid" style={{ marginTop: 10 }}>
        <StatCard
          label={t("auIncomeTestLabel")}
          value={money(retirementRules.getAgePensionByIncomeTest(assessableIncome, status))}
          sub={t("auIncomeTestSub", {
            // 逓減率は1人あたり。カップルは世帯合計の半分（25セント／隔週1.50ドル）。
            amount: money(retirementRules.getIncomeFreeAreaAnnual(status)),
            taper: Math.round(retirementRules.getIncomeTaperPerDollar(status) * 100),
            deemed: money(Number(deemedIncomeAnnual) || 0),
            total: money(assessableIncome),
          })}
        />
        <StatCard
          label={t("auAssetsTestLabel")}
          value={money(retirementRules.getAgePensionByAssetsTest(assessableAssets, status, homeowner))}
          sub={t("auAssetsTestSub", {
            amount: money(retirementRules.getAssetsFreeArea(status, homeowner)),
            taper: retirementRules.getAssetsTaperPerThousandFortnightly(status),
            assets: money(assessableAssets),
            qualifyingAge,
          })}
        />
      </div>
      <div className="note" style={{ marginTop: 10 }}>
        <Info size={13} />
        <span>{t("auDeemingNote", {
          lower: Number((retirementRules.deeming.lowerRate * 100).toFixed(2)),
          upper: Number((retirementRules.deeming.upperRate * 100).toFixed(2)),
          threshold: money(retirementRules.getDeemingThreshold(status)),
          deemed: money(Number(deemedIncomeAnnual) || 0),
        })}</span>
      </div>

      <div className="stat-grid" style={{ marginTop: 10, marginBottom: 14 }}>
        <StatCard
          label={t("auAgePensionAnnualLabel")}
          value={money(agePensionAnnual)}
          sub={recipients > 1
            ? t("auAgePensionHouseholdSub", { perPerson: money(agePensionPerPersonAnnual) })
            : t("auAgePensionAnnualSub")}
        />
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
