const WORKER_URL = "https://lifeplan-ai.kunihiko-hioki.workers.dev";
const MAX_BODY_CHARS = 18000;

function cleanSnapshot(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const allowed = [
    "schemaVersion", "country", "language", "currentAge", "retireAge", "deathAge",
    "currentNetWorth", "finalNetWorth", "depletionAge", "publicPensionMonthly", "totalPensionMonthly",
    "publicPensionStartAge", "livingCostMonthly", "inflationPct", "postRetireReturnPct", "milestones",
  ];
  const out = {};
  for (const k of allowed) if (Object.prototype.hasOwnProperty.call(raw, k)) out[k] = raw[k];
  if (!Array.isArray(out.milestones)) out.milestones = [];
  out.milestones = out.milestones.slice(0, 8).map((x) => ({ age: Number(x?.age) || 0, netWorth: Number(x?.netWorth) || 0 }));
  return out;
}

function extractText(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value.response === "string") return value.response;
  if (typeof value.output_text === "string") return value.output_text;
  if (Array.isArray(value.choices)) {
    const c = value.choices[0];
    if (typeof c?.message?.content === "string") return c.message.content;
    if (typeof c?.text === "string") return c.text;
  }
  if (value.result) return extractText(value.result);
  return "";
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const raw = typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
    if (raw.length > MAX_BODY_CHARS) return res.status(413).json({ error: "Request too large" });
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const question = typeof body.question === "string" ? body.question.trim().slice(0, 1000) : "";
    if (!question) return res.status(400).json({ error: "質問がありません" });
    const snapshot = cleanSnapshot(body.snapshot);
    const ja = body.language === "ja";

    const prompt = `${ja ? "以下はライフプランアプリ専用AIへの質問です。" : "This is a question for the life-plan app assistant."}

【最重要ルール】
- 金融計算の数値を自分で新規計算して確定しない。
- 下の「アプリ計算結果」は、このアプリ本体の計算エンジンが出した値なので最優先する。
- 与えられていない将来ケースの金額を推測しない。必要なら「アプリで比較試算してください」と明示する。
- ユーザー設定を変更したと主張しない。AIには保存データの書き込み権限がない。
- 投資・税務・年金・医療等について断定的な専門助言をしない。
- 回答は${ja ? "日本語" : "英語"}で、結論→理由→注意点の順に簡潔に説明する。

【このアプリの基本仕様】
- 対応国はJP/US/GB/CA/AU。国ごとの制度計算ロジックをアプリ本体が持つ。
- 日本の公的年金と企業年金基金・国民年金基金等は別計算。個人年金も別系統。
- 額面資産と実質資産（現在価値換算）を区別する。
- NISA/iDeCo/年金/税/医療費/銀行/金/個別株/ローン/保険/個人年金/余剰金等を統合して資産推移を計算する。

【アプリ計算結果】
${JSON.stringify(snapshot, null, 2)}

【ユーザーの質問】
${question}`;

    const upstream = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: prompt }),
    });
    const text = await upstream.text();
    let data = {};
    try { data = JSON.parse(text); } catch { data = { response: text }; }
    if (!upstream.ok) return res.status(502).json({ error: "AIサービスが一時的に利用できません" });
    const answer = extractText(data);
    if (!answer) return res.status(502).json({ error: "AIの回答を取得できませんでした" });
    return res.status(200).json({ answer });
  } catch {
    return res.status(500).json({ error: "AI処理に失敗しました" });
  }
}
