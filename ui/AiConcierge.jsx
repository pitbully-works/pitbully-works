import React, { useMemo, useState } from "react";
import { AI_DAILY_LIMIT, aiUsageRemaining, incrementAiUsage } from "../utils/aiConcierge.js";
import { agentBaselineFromSnapshot, normalizeAgentScenarios } from "../utils/aiAgent.js";

const JP_QUESTIONS = [
  "このライフプランを総合診断して",
  "老後資金は足りますか？",
  "老後資金をもっと増やす方法を3案試算して",
  "生活費や退職年齢を変えるとどうなる？",
  "資産が減り始める主な原因を教えて",
  "入力内容で注意した方がよい点はある？",
];
const EN_QUESTIONS = [
  "Give me an overall review of this life plan",
  "Will my retirement funds last?",
  "Test three ways to improve my retirement assets",
  "What if I change retirement age or living costs?",
  "What mainly causes my assets to decline?",
  "Are there any inputs I should review?",
];
const AI_CONSENT_KEY = "lifeplan-ai-consent-v1";

function formatAiAnswer(raw, ja) {
  let text = String(raw || "");
  text = text.replace(/\*\*(.*?)\*\*/gs, "$1").replace(/__(.*?)__/gs, "$1");
  if (ja) {
    const labels = {
      depletionAge: "資産が底をつく年齢",
      currentNetWorth: "現在の総資産",
      finalNetWorth: "最終年齢時点の総資産",
      publicPensionStartAge: "公的年金の受給開始年齢",
      livingCostMonthly: "毎月の生活費",
      milestones: "年齢ごとの資産推移",
      schemaVersion: "データ形式",
    };
    for (const [key, label] of Object.entries(labels)) {
      text = text.replace(new RegExp(`\\b${key}\\b`, "g"), label);
    }
  }
  return text;
}

function signedMoney(v, money) {
  const n = Number(v) || 0;
  if (Math.abs(n) < 1) return "±0";
  return `${n > 0 ? "+" : "−"}${money(Math.abs(n))}`;
}

export default function AiConcierge({ language = "ja", snapshot, onRunAgentScenario, onUseComparisonScenario, onApplyAgentScenario, money = (v) => String(v) }) {
  const ja = language === "ja";
  const suggestions = ja ? JP_QUESTIONS : EN_QUESTIONS;
  const finalAge = Math.round(Number(snapshot?.deathAge) || 0);
  const retireAge = Math.round(Number(snapshot?.retireAge) || 0);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [agentResults, setAgentResults] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingApply, setPendingApply] = useState(null);
  const [applyMessage, setApplyMessage] = useState("");
  const [remaining, setRemaining] = useState(() => typeof window === "undefined" ? AI_DAILY_LIMIT : aiUsageRemaining(window.localStorage));
  const [consented, setConsented] = useState(() => {
    if (typeof window === "undefined") return false;
    try { return window.localStorage.getItem(AI_CONSENT_KEY) === "1"; } catch { return false; }
  });

  const acceptConsent = () => {
    try { window.localStorage.setItem(AI_CONSENT_KEY, "1"); } catch { /* noop */ }
    setConsented(true);
  };

  const canSend = useMemo(() => consented && question.trim().length > 0 && !loading && remaining > 0, [consented, question, loading, remaining]);

  const postAi = async (payload) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.detail || data?.error || (ja ? "AIとの通信に失敗しました" : "AI request failed"));
      return data;
    } catch (e) {
      if (e?.name === "AbortError") throw new Error(ja ? "AIの応答が時間内に返りませんでした。もう一度お試しください。" : "AI response timed out. Please try again.");
      throw e;
    } finally {
      clearTimeout(timer);
    }
  };

  const send = async (preset) => {
    const q = String(preset ?? question).trim();
    if (!consented || !q || loading || remaining <= 0) return;
    setQuestion(q);
    setLoading(true);
    setError("");
    setAnswer("");
    setAgentResults([]);
    setPendingApply(null);
    setApplyMessage("");
    try {
      // The basic questions that do not require what-if calculations should use the
      // proven single-request path.  Only comparison/what-if requests invoke the
      // two-step agent planner.  This keeps ordinary AI questions responsive even
      // if the planner cannot produce structured scenario JSON.
      const wantsScenario = /3案|試算|比較|変える|増やす方法|what if|three ways|compare|improve/i.test(q);
      if (!wantsScenario) {
        const basic = await postAi({ mode: "answer", question: q, snapshot, language });
        setAnswer(formatAiAnswer(basic?.answer || basic?.message || "", ja));
      } else {
        const plan = await postAi({ mode: "agent-plan", question: q, snapshot, language });
        if (plan?.kind === "scenario" && typeof onRunAgentScenario === "function") {
        const normalized = normalizeAgentScenarios(plan.scenarios, agentBaselineFromSnapshot(snapshot));
        const calculated = normalized.map((scenario) => {
          try { return onRunAgentScenario(scenario); } catch { return null; }
        }).filter(Boolean);
        setAgentResults(calculated);
        if (calculated.length) {
          const explained = await postAi({ mode: "agent-explain", question: q, snapshot, language, results: calculated });
          setAnswer(formatAiAnswer(explained?.answer || plan?.message, ja));
        } else {
          setAnswer(formatAiAnswer(plan?.message, ja));
        }
        } else {
          setAnswer(formatAiAnswer(plan?.message || "", ja));
        }
      }
      if (typeof window !== "undefined") {
        incrementAiUsage(window.localStorage);
        setRemaining(aiUsageRemaining(window.localStorage));
      }
    } catch (e) {
      setError(e?.message || (ja ? "AIとの通信に失敗しました" : "AI request failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="card section-block" id="section-ai" style={{ borderColor: "#4FA8D8" }}>
      <div className="chart-label">🤖 {ja ? "AIエージェントに相談" : "Ask AI agent"}</div>
      <div className="note" style={{ marginBottom: 12 }}>
        <span>{ja
          ? "AIが質問を理解し、必要ならアプリ本体の比較計算を自動実行します。金融計算はAIではなくアプリ本体が行い、保存設定をAIが直接変更することはありません。"
          : "AI interprets your question and can ask the app's own comparison engine to run scenarios. The app performs the financial calculations; AI cannot directly modify saved settings."}</span>
      </div>

      {!consented && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="chart-label">{ja ? "AI機能を利用する前に" : "Before using AI"}</div>
          <div className="guide-text" style={{ lineHeight: 1.7 }}>
            {ja
              ? "質問内容と回答に必要な最小限の計算結果が外部AI処理基盤へ送信されます。氏名・住所・口座番号などは入力しないでください。AIは保存データを直接変更できず、回答は参考情報です。"
              : "Your question and the minimum calculated data needed to answer it are sent to an external AI service. Do not enter names, addresses, account numbers, or similar identifiers."}
          </div>
          <button type="button" className="section-nav-btn" onClick={acceptConsent} style={{ marginTop: 10 }}>
            {ja ? "内容を確認してAIを利用する" : "I understand — enable AI"}
          </button>
        </div>
      )}

      <div className="section-nav" style={{ marginBottom: 12, opacity: consented ? 1 : 0.55 }}>
        {suggestions.map((q) => {
          const dynamicQ = ja && q === "生活費や退職年齢を変えるとどうなる？" && retireAge
            ? `生活費や退職年齢（現在${retireAge}歳）を変えるとどうなる？`
            : q;
          return <button key={q} type="button" className="section-nav-btn" onClick={() => send(dynamicQ)} disabled={!consented || loading || remaining <= 0}>{dynamicQ}</button>;
        })}
      </div>

      <label className="field">
        <span className="field-label">{ja ? "自由に質問" : "Your question"}</span>
        <textarea value={question} maxLength={1000} onChange={(e) => setQuestion(e.target.value)} placeholder={ja
          ? `例：${finalAge || "最終"}歳時点の資産を増やす方法を3案比較して`
          : `Example: Compare three ways to improve my assets at age ${finalAge || "the final age"}`} style={{ width: "100%", minHeight: 92, resize: "vertical" }} />
      </label>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" className="section-nav-btn" onClick={() => send()} disabled={!canSend}>{loading ? (ja ? "AIが試算中…" : "Running scenarios…") : (ja ? "質問する" : "Ask")}</button>
        <span className="stat-sub">{ja ? `本日の残り ${remaining}/${AI_DAILY_LIMIT} 回` : `${remaining}/${AI_DAILY_LIMIT} requests left today`}</span>
      </div>
      {remaining <= 0 && <div className="note" style={{ marginTop: 10 }}><span>{ja ? "本日のAI利用回数に達しました。通常のライフプラン機能は引き続き利用できます。" : "Today's AI limit has been reached. The rest of the app remains available."}</span></div>}
      {error && <div className="note" style={{ marginTop: 10, borderLeftColor: "#C2694F" }}><span>{error}</span></div>}

      {agentResults.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div className="chart-label">{ja ? "アプリ本体で自動試算した案" : "Scenarios calculated by the app"}</div>
          <div style={{ display: "grid", gap: 9 }}>
            {agentResults.map((item, idx) => (
              <div className="card" key={`${item.scenario?.id || idx}-${idx}`} style={{ borderLeft: "4px solid #4FA8D8" }}>
                <div style={{ fontWeight: 800, marginBottom: 6 }}>{item.scenario?.label || `${ja ? "案" : "Scenario"} ${idx + 1}`}</div>
                {item.scenario?.rationale && <div className="guide-text" style={{ marginBottom: 8 }}>{item.scenario.rationale}</div>}
                <div className="stat-sub">{ja ? "退職年齢" : "Retirement age"}: {item.scenario.retireAge}</div>
                <div className="stat-sub">{ja ? "退職後生活費" : "Retirement living cost"}: {money(item.scenario.livingCostMonthly)} / {ja ? "月" : "month"}</div>
                <div className="stat-sub">{ja ? "将来の積立倍率" : "Future contribution multiplier"}: {item.scenario.contributionMultiplier.toFixed(1)}x</div>
                <div style={{ marginTop: 7, fontWeight: 700 }}>{ja ? "最終年齢時点" : "At final age"}: {money(item.metrics.finalNetWorth)}</div>
                <div className="stat-sub">{ja ? "現在プランとの差" : "Difference vs current"}: {signedMoney(item.metrics.finalNetWorthDiff, money)}</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 9 }}>
                  <button type="button" className="section-nav-btn" onClick={() => onUseComparisonScenario?.(item.scenario)}>
                    {ja ? "この案を比較画面で詳しく見る" : "Open this in comparison"}
                  </button>
                  {Number(item.scenario?.contributionMultiplier) === 1 ? (
                    <button type="button" className="section-nav-btn" onClick={() => { setPendingApply(item.scenario); setApplyMessage(""); }}>
                      {ja ? "この案を設定に反映" : "Apply this scenario"}
                    </button>
                  ) : (
                    <div className="stat-sub" style={{ flexBasis: "100%" }}>
                      {ja
                        ? "※ 積立倍率を含む案は、過去の積立実績を変えないため自動反映しません。比較画面で確認してください。"
                        : "Contribution-multiplier scenarios are not auto-applied, so past contribution history is never rewritten. Review them in comparison."}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}


      {pendingApply && (
        <div className="card" style={{ marginTop: 14, borderLeft: "4px solid #D89B4F" }}>
          <div className="chart-label">{ja ? "設定変更の最終確認" : "Confirm setting changes"}</div>
          <div className="guide-text" style={{ lineHeight: 1.7, marginBottom: 10 }}>
            {ja
              ? "AIが直接設定を変更することはありません。下の内容を確認し、『この内容で反映する』を押した場合だけ保存設定を変更します。"
              : "AI never changes settings by itself. Saved settings change only after you press Apply below."}
          </div>
          <div className="stat-sub">{ja ? "退職年齢" : "Retirement age"}: {snapshot?.retireAge} → {pendingApply.retireAge}</div>
          <div className="stat-sub">{ja ? "退職後生活費" : "Retirement living cost"}: {money(snapshot?.livingCostMonthly)} → {money(pendingApply.livingCostMonthly)} / {ja ? "月" : "month"}</div>
          <div className="stat-sub">{ja ? "将来の積立倍率" : "Future contribution multiplier"}: {Number(pendingApply.contributionMultiplier).toFixed(1)}x</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            <button type="button" className="section-nav-btn" onClick={() => {
              const result = onApplyAgentScenario?.(pendingApply);
              if (result?.ok === false) {
                setApplyMessage(result.message || (ja ? "設定を反映できませんでした。" : "Could not apply settings."));
                return;
              }
              setApplyMessage(ja ? "設定に反映しました。ライフプランを新しい条件で再計算しています。" : "Settings applied. The life plan is recalculating with the new values.");
              setPendingApply(null);
            }}>
              {ja ? "この内容で反映する" : "Apply these settings"}
            </button>
            <button type="button" className="section-nav-btn" onClick={() => { setPendingApply(null); setApplyMessage(""); }}>
              {ja ? "キャンセル" : "Cancel"}
            </button>
          </div>
        </div>
      )}

      {applyMessage && <div className="note" style={{ marginTop: 10 }}><span>{applyMessage}</span></div>}

      {answer && (
        <div className="card" style={{ marginTop: 14, whiteSpace: "pre-wrap", lineHeight: 1.75 }}>
          <div className="chart-label">{ja ? "AIエージェントの回答" : "AI agent response"}</div>
          <div>{answer}</div>
          <div className="stat-sub" style={{ marginTop: 10 }}>{ja ? "※ 金額はアプリ本体の計算結果です。AIは結果の比較・説明を担当します。将来の市場結果を保証するものではありません。" : "Amounts come from the app's calculation engine. AI compares and explains them; future market outcomes are not guaranteed."}</div>
        </div>
      )}
    </section>
  );
}
