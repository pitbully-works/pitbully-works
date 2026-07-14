// ============================================================================
// panels/USInvestmentAccountsPanel.jsx
// アメリカ選択時：投資口座パネル（401(k) / Traditional IRA / Roth IRA / Brokerage）
// App.jsx からそのまま切り出したパネル。JSX・スタイル・計算式・props は一切変更していない。
// 状態（state）は一切持たず、App.jsx から props で受け取った値のみを表示・計算に使う。
// ============================================================================

import { useContext } from "react";
import { Info } from "lucide-react";
import { LocaleContext, Field, StatCard } from "../ui/index.js";

// ---------- アメリカ選択時：投資口座パネル（401(k) / Traditional IRA / Roth IRA / Brokerage） ----------
// JP側のNISA関連ステート・計算（tsumitateSchedule, NISA_LIMITS, runSimulation等）とは
// 完全に独立している。計算ロジックは US_COUNTRY_RULES.investment の純粋関数のみを使用する。
function USInvestmentAccountsPanel({ usInvestment, onUpdate, onUpdateAccount, age, investmentRules, taxRules, taxResult }) {
  const { t, money } = useContext(LocaleContext);
  const fs = usInvestment.filingStatus;
  const magi = Number(usInvestment.modifiedAGI) || 0;

  const k401Limit = investmentRules.get401kEmployeeLimit(age);
  const k401Combined = investmentRules.get401kCombinedLimit(age);
  const k401Contribution = Number(usInvestment.k401.annualContribution) || 0;
  const k401Remaining = k401Limit - k401Contribution;

  const iraLimit = investmentRules.getIraContributionLimit(age);
  const traditionalContribution = Number(usInvestment.traditionalIra.annualContribution) || 0;
  const rothContribution = Number(usInvestment.rothIra.annualContribution) || 0;
  const combinedIraContribution = traditionalContribution + rothContribution;
  const iraRemaining = iraLimit - combinedIraContribution;

  const deductibleFraction = investmentRules.getTraditionalIraDeductibleFraction({
    filingStatus: fs,
    magi,
    coveredByWorkplacePlan: usInvestment.coveredByWorkplacePlan,
    spouseCoveredByWorkplacePlan: usInvestment.spouseCoveredByWorkplacePlan,
  });
  const traditionalDeductibleAmount = traditionalContribution * deductibleFraction;

  const rothEligibleFraction = investmentRules.getRothIraEligibleFraction(fs, magi);
  const rothAllowedContribution = iraLimit * rothEligibleFraction;
  const rothOverEligible = rothContribution > rothAllowedContribution + 0.01;

  const brokerageValue = Number(usInvestment.brokerage.currentValue) || 0;
  const brokerageContribution = Number(usInvestment.brokerage.annualContribution) || 0;

  const liquidRestricted = investmentRules.splitLiquidRestricted(age, {
    k401: usInvestment.k401.currentValue,
    traditionalIra: usInvestment.traditionalIra.currentValue,
    rothIra: usInvestment.rothIra.currentValue,
    brokerage: usInvestment.brokerage.currentValue,
  });

  return (
    <div>
      <div className="note" style={{ marginBottom: 14 }}>
        <Info size={13} />
        <span>{t("usInvestmentSourceNote")}</span>
      </div>

      <div className="field-label" style={{ marginBottom: 6 }}>{t("usFilingStatusLabel")}</div>
      <div className="add-row" style={{ marginBottom: 10, flexWrap: "wrap" }}>
        {[
          { key: "single", label: t("usFilingSingle") },
          { key: "marriedJoint", label: t("usFilingMarriedJoint") },
          { key: "marriedSeparate", label: t("usFilingMarriedSeparate") },
          { key: "headOfHousehold", label: t("usFilingHoh") },
        ].map((opt) => (
          <button
            key={opt.key}
            onClick={() => onUpdate("filingStatus", opt.key)}
            style={{
              flex: "1 1 auto", padding: "8px 8px", borderRadius: 4, fontSize: 12, cursor: "pointer",
              border: fs === opt.key ? "1px solid #4FA8D8" : "1px solid var(--line)",
              background: fs === opt.key ? "rgba(79,168,216,0.15)" : "var(--panel)",
              color: fs === opt.key ? "#4FA8D8" : "var(--text)",
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <Field
        guide={t("usModifiedAGIGuide")}
        label={t("usModifiedAGILabel")} unit="$" step={1000}
        value={usInvestment.modifiedAGI}
        onChange={(v) => onUpdate("modifiedAGI", v)}
      />
      <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <input
          type="checkbox" checked={usInvestment.coveredByWorkplacePlan}
          onChange={(e) => onUpdate("coveredByWorkplacePlan", e.target.checked)}
        />
        <span className="field-label" style={{ margin: 0 }}>{t("usCoveredByPlanLabel")}</span>
      </label>
      {fs === "marriedJoint" && (
        <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox" checked={usInvestment.spouseCoveredByWorkplacePlan}
            onChange={(e) => onUpdate("spouseCoveredByWorkplacePlan", e.target.checked)}
          />
          <span className="field-label" style={{ margin: 0 }}>{t("usSpouseCoveredByPlanLabel")}</span>
        </label>
      )}

      <div className="section-block" style={{ borderColor: "#4FA8D8", marginTop: 16 }}>
        <div className="field-label" style={{ marginBottom: 6 }}>{t("us401kLabel")}</div>
        <Field guide={t("usCurrentBalanceGuide")} label={t("currentBalancePlaceholder")} unit="$" step={1000} value={usInvestment.k401.currentValue} onChange={(v) => onUpdateAccount("k401", "currentValue", v)} />
        <Field guide={t("usAnnualContributionGuide")} label={t("usAnnualContributionLabel")} unit="$" step={500} value={usInvestment.k401.annualContribution} onChange={(v) => onUpdateAccount("k401", "annualContribution", v)} />
        <div className="stat-sub">{t("usEmployeeLimitLabel")}：<span className="mono">{money(k401Limit)}</span></div>
        <div className="stat-sub">{t("usCombinedLimitLabel")}：<span className="mono">{money(k401Combined)}</span></div>
        <div className="stat-sub" style={{ color: k401Remaining < 0 ? "#C2694F" : "#7C8A90" }}>
          {k401Remaining >= 0
            ? t("usRemainingLabel", { amount: money(k401Remaining) })
            : t("usOverLimitLabel", { amount: money(-k401Remaining) })}
        </div>
      </div>

      <div className="section-block" style={{ borderColor: "#D9A54F", marginTop: 12 }}>
        <div className="field-label" style={{ marginBottom: 6 }}>{t("usTraditionalIraLabel")}</div>
        <Field guide={t("usCurrentBalanceGuide")} label={t("currentBalancePlaceholder")} unit="$" step={500} value={usInvestment.traditionalIra.currentValue} onChange={(v) => onUpdateAccount("traditionalIra", "currentValue", v)} />
        <Field guide={t("usAnnualContributionGuide")} label={t("usAnnualContributionLabel")} unit="$" step={100} value={usInvestment.traditionalIra.annualContribution} onChange={(v) => onUpdateAccount("traditionalIra", "annualContribution", v)} />
        <div className="stat-sub">{t("usIraSharedLimitLabel")}：<span className="mono">{money(iraLimit)}</span></div>
        <div className="stat-sub">{t("usDeductibleAmountLabel")}：<span className="mono">{money(traditionalDeductibleAmount)}</span></div>
        {deductibleFraction < 1 && deductibleFraction > 0 && (
          <div className="stat-sub" style={{ color: "#D9A54F" }}>{t("usPartialDeductionNote")}</div>
        )}
        {deductibleFraction === 0 && traditionalContribution > 0 && (
          <div className="stat-sub" style={{ color: "#C2694F" }}>{t("usNoDeductionNote")}</div>
        )}
      </div>

      <div className="section-block" style={{ borderColor: "#8FBF7F", marginTop: 12 }}>
        <div className="field-label" style={{ marginBottom: 6 }}>{t("usRothIraLabel")}</div>
        <Field guide={t("usCurrentBalanceGuide")} label={t("currentBalancePlaceholder")} unit="$" step={500} value={usInvestment.rothIra.currentValue} onChange={(v) => onUpdateAccount("rothIra", "currentValue", v)} />
        <Field guide={t("usAnnualContributionGuide")} label={t("usAnnualContributionLabel")} unit="$" step={100} value={usInvestment.rothIra.annualContribution} onChange={(v) => onUpdateAccount("rothIra", "annualContribution", v)} />
        <div className="stat-sub">{t("usIraSharedLimitLabel")}：<span className="mono">{money(iraLimit)}</span></div>
        <div className="stat-sub">{t("usRothAllowedLabel")}：<span className="mono">{money(rothAllowedContribution)}</span></div>
        {rothEligibleFraction === 0 && (
          <div className="stat-sub" style={{ color: "#C2694F" }}>{t("usRothIneligibleNote")}</div>
        )}
        {rothEligibleFraction > 0 && rothEligibleFraction < 1 && (
          <div className="stat-sub" style={{ color: "#D9A54F" }}>{t("usRothPartialNote")}</div>
        )}
        {rothOverEligible && (
          <div className="stat-sub" style={{ color: "#C2694F" }}>{t("usRothOverEligibleNote")}</div>
        )}
      </div>

      <div className="note" style={{ marginTop: 12 }}>
        <Info size={13} />
        <span>{t("usIraCombinedNote", { amount: money(iraRemaining >= 0 ? iraRemaining : 0) })}</span>
      </div>
      {combinedIraContribution > iraLimit && (
        <div className="note" style={{ borderLeftColor: "#C2694F" }}>
          <Info size={13} style={{ color: "#C2694F" }} />
          <span>{t("usOverLimitLabel", { amount: money(combinedIraContribution - iraLimit) })}</span>
        </div>
      )}

      <div className="section-block" style={{ borderColor: "#B08FD6", marginTop: 12 }}>
        <div className="field-label" style={{ marginBottom: 6 }}>{t("usBrokerageLabel")}</div>
        <Field guide={t("usCurrentBalanceGuide")} label={t("currentBalancePlaceholder")} unit="$" step={1000} value={usInvestment.brokerage.currentValue} onChange={(v) => onUpdateAccount("brokerage", "currentValue", v)} />
        <Field guide={t("usAnnualContributionGuide")} label={t("usAnnualContributionLabel")} unit="$" step={500} value={usInvestment.brokerage.annualContribution} onChange={(v) => onUpdateAccount("brokerage", "annualContribution", v)} />
        <div className="stat-sub">{t("usBrokerageNoLimitNote")}</div>
      </div>

      <div className="stat-grid" style={{ marginTop: 16 }}>
        <StatCard label={t("usTotalInvestmentLabel")} value={money(Number(usInvestment.k401.currentValue || 0) + Number(usInvestment.traditionalIra.currentValue || 0) + Number(usInvestment.rothIra.currentValue || 0) + brokerageValue)} sub={t("usTotalInvestmentSub")} />
      </div>
      <div className="stat-grid" style={{ marginTop: 10 }}>
        <StatCard label={t("usLiquidAssetsLabel")} value={money(liquidRestricted.liquid)} sub={t("usLiquidAssetsSub")} tone="good" />
        <StatCard
          label={t("usRestrictedAssetsLabel")}
          value={money(liquidRestricted.restricted)}
          sub={liquidRestricted.isAccessibleAge ? t("usRestrictedAssetsSubOver595") : t("usRestrictedAssetsSubUnder595")}
        />
      </div>
      <div className="note" style={{ marginTop: 10 }}>
        <Info size={13} />
        <span>{t("usEarlyWithdrawalWarning")}</span>
      </div>

      <div className="section-block" style={{ borderColor: "#5FB0A0", marginTop: 16 }}>
        <div className="field-label" style={{ marginBottom: 6 }}>{t("usTaxSectionLabel")}</div>
        <div className="note" style={{ marginBottom: 12 }}>
          <Info size={13} />
          <span>{t("usTaxSourceNote")}</span>
        </div>
        <Field guide={t("usStateTaxRateGuide")} label={t("usStateTaxRateLabel")} unit="%" step={0.5} value={usInvestment.stateTaxRatePct} onChange={(v) => onUpdate("stateTaxRatePct", v)} />
        <Field guide={t("usCapitalGainGuide")} label={t("usCapitalGainLabel")} unit="$" step={1000} value={usInvestment.estimatedCapitalGainAnnual} onChange={(v) => onUpdate("estimatedCapitalGainAnnual", v)} />
        <div className="stat-grid" style={{ marginTop: 10 }}>
          <StatCard label={t("usFederalTaxLabel")} value={money(taxResult.federalTax)} sub={t("usTaxableIncomeSub", { amount: money(taxResult.taxableIncome) })} />
          <StatCard label={t("usCapGainsTaxLabel")} value={money(taxResult.ltcgTax)} sub={t("usCapGainsTaxSub")} />
          <StatCard label={t("usNiitLabel")} value={money(taxResult.niit)} sub={t("usNiitSub")} />
          <StatCard label={t("usStateTaxLabel")} value={money(taxResult.stateTax)} sub={t("usStateTaxSub")} />
        </div>
        <div className="stat-grid" style={{ marginTop: 10 }}>
          <StatCard label={t("usTotalTaxLabel")} value={money(taxResult.totalTax)} sub={t("usTotalTaxSub")} tone="danger" />
        </div>
      </div>
    </div>
  );
}

export { USInvestmentAccountsPanel };
