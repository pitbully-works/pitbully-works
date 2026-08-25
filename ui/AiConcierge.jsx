import React, { useMemo, useState } from "react";
import { AI_DAILY_LIMIT, aiUsageRemaining, incrementAiUsage } from "../utils/aiConcierge.js";

const JP_QUESTIONS = [
  "このライフプランを総合診断して",
  "老後資金は足りますか？",
  "資産が減り始める主な原因を教えて",
  "このアプリの計算結果はどう見ればいい？",
  "公的年金の受給開始年齢の考え方を教えて",
  "入力内容で注意した方がよい点はある？",
];
const AI_CONSENT_KEY = "lifeplan-ai-consent-v1";

function formatAiAnswer(raw, ja) {
  let text = String(raw || "");
  // The AI may return Markdown even though this UI intentionally renders plain text.
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

const EN_QUESTIONS = [
  "Give me an overall review of this life plan",
  "Will my retirement funds last?",
  "What mainly causes my assets to decline?",
  "How should I read the calculation results?",
  "Explain how to think about public pension claiming age",
  "Are there any inputs I should review?",
];

export default function AiConcierge({ language = "ja", snapshot }) {
  const ja = language === "ja";
  const suggestions = ja ? JP_QUESTIONS : EN_QUESTIONS;
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [remaining, setRemaining] = useState(() =>
    typeof window === "undefined" ? AI_DAILY_LIMIT : aiUsageRemaining(window.localStorage)
  );
  const [consented, setConsented] = useState(() => {
    if (typeof window === "undefined") return false;
    try { return window.localStorage.getItem(AI_CONSENT_KEY) === "1"; } catch { return false; }
  });

  const acceptConsent = () => {
    try { window.localStorage.setItem(AI_CONSENT_KEY, "1"); } catch { /* noop */ }
    setConsented(true);
  };

  const canSend = useMemo(() => consented && question.trim().length > 0 && !loading && remaining > 0, [consented, question, loading, remaining]);

  const send = async (preset) => {
    const q = String(preset ?? question).trim();
    if (!consented || !q || loading || remaining <= 0) return;
    setQuestion(q);
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q, snapshot, language }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || (ja ? "AIとの通信に失敗しました" : "AI request failed"));
      setAnswer(formatAiAnswer(data?.answer, ja));
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
      <div className="chart-label">🤖 {ja ? "AIに相談" : "Ask AI"}</div>
      <div className="note" style={{ marginBottom: 12 }}>
        <span>{ja
          ? "AIは説明・分析・提案を担当します。資産計算はアプリ本体の計算結果を優先し、AIが設定を直接変更することはありません。"
          : "AI explains and analyzes. The app's own calculation engine remains authoritative, and AI cannot directly change saved settings."}</span>
      </div>

      {!consented && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="chart-label">{ja ? "AI機能を利用する前に" : "Before using AI"}</div>
          <div className="guide-text" style={{ lineHeight: 1.7 }}>
            {ja
              ? "質問内容と回答に必要な最小限の計算結果が外部AI処理基盤へ送信されます。氏名・住所・口座番号などは入力しないでください。AIは保存データを直接変更できず、回答は参考情報です。"
              : "Your question and the minimum calculated data needed to answer it are sent to an external AI service. Do not enter names, addresses, account numbers, or similar identifiers. AI cannot directly change saved data and its answers are for reference."}
          </div>
          <button type="button" className="section-nav-btn" onClick={acceptConsent} style={{ marginTop: 10 }}>
            {ja ? "内容を確認してAIを利用する" : "I understand — enable AI"}
          </button>
        </div>
      )}

      <div className="section-nav" style={{ marginBottom: 12, opacity: consented ? 1 : 0.55 }}>
        {suggestions.map((q) => (
          <button key={q} type="button" className="section-nav-btn" onClick={() => send(q)} disabled={!consented || loading || remaining <= 0}>{q}</button>
        ))}
      </div>

      <label className="field">
        <span className="field-label">{ja ? "自由に質問" : "Your question"}</span>
        <textarea
          value={question}
          maxLength={1000}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={ja ? "例：私の資産推移で注意する点は？" : "Example: What should I watch in my asset projection?"}
          style={{ width: "100%", minHeight: 92, resize: "vertical" }}
        />
      </label>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" className="section-nav-btn" onClick={() => send()} disabled={!canSend}>
          {loading ? (ja ? "AIが確認中…" : "Checking…") : (ja ? "質問する" : "Ask")}
        </button>
        <span className="stat-sub">{ja ? `本日の残り ${remaining}/${AI_DAILY_LIMIT} 回` : `${remaining}/${AI_DAILY_LIMIT} requests left today`}</span>
      </div>
      {remaining <= 0 && <div className="note" style={{ marginTop: 10 }}><span>{ja ? "本日のAI利用回数に達しました。通常のライフプラン機能は引き続き利用できます。" : "Today's AI limit has been reached. The rest of the app remains available."}</span></div>}
      {error && <div className="note" style={{ marginTop: 10, borderLeftColor: "#C2694F" }}><span>{error}</span></div>}
      {answer && (
        <div className="card" style={{ marginTop: 14, whiteSpace: "pre-wrap", lineHeight: 1.75 }}>
          <div className="chart-label">{ja ? "AIの回答" : "AI response"}</div>
          <div>{answer}</div>
          <div className="stat-sub" style={{ marginTop: 10 }}>{ja ? "※ AIの回答は参考情報です。最終判断はアプリの計算結果・公的資料等も確認してください。" : "AI output is reference information. Confirm important decisions against the app's calculations and official sources."}</div>
        </div>
      )}
    </section>
  );
}
