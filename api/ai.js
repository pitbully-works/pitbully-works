const WORKER_URL = "https://lifeplan-ai.kunihiko-hioki.workers.dev";
const MAX_BODY_CHARS = 18000;

function cleanSnapshot(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

  const allowed = [
    "schemaVersion",
    "country",
    "language",
    "currency",
    "currentAge",
    "retireAge",
    "deathAge",
    "currentNetWorth",
    "finalNetWorth",
    "depletionAge",
    "publicPensionMonthly",
    "totalPensionMonthly",
    "publicPensionStartAge",
    "livingCostMonthly",
    "inflationPct",
    "postRetireReturnPct",
    "milestones"
  ];

  const out = {};

  for (const k of allowed) {
    if (Object.prototype.hasOwnProperty.call(raw, k)) {
      out[k] = raw[k];
    }
  }

  if (!Array.isArray(out.milestones)) {
    out.milestones = [];
  }

  out.milestones = out.milestones.slice(0, 8);

  return out;
}

function extractText(value) {
  if (!value) return "";

  if (typeof value === "string") {
    return value;
  }

  if (typeof value.response === "string") {
    return value.response;
  }

  if (typeof value.output_text === "string") {
    return value.output_text;
  }

  if (Array.isArray(value.choices)) {
    const c = value.choices[0];

    if (typeof c?.message?.content === "string") {
      return c.message.content;
    }

    if (typeof c?.text === "string") {
      return c.text;
    }
  }

  if (value.result) {
    return extractText(value.result);
  }

  return "";
}

function extractJsonObject(text) {
  const raw = String(text || "").trim();
  try { return JSON.parse(raw); } catch { /* continue */ }
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try { return JSON.parse(fenced[1].trim()); } catch { /* continue */ }
  }
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first >= 0 && last > first) {
    try { return JSON.parse(raw.slice(first, last + 1)); } catch { /* noop */ }
  }
  return null;
}

async function askWorker(prompt) {
  const upstream = await fetch(WORKER_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question: prompt })
  });

  const text = await upstream.text();
  let data = {};
  try { data = JSON.parse(text); } catch { data = { result: text }; }
  if (!upstream.ok) {
    const error = new Error("AI upstream request failed");
    error.status = 502;
    error.detail = extractText(data) || text.slice(0, 500);
    throw error;
  }
  const answer = extractText(data);
  if (!answer) {
    const error = new Error("AI returned no answer");
    error.status = 502;
    throw error;
  }
  return answer;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  try {
    const body = req.body || {};
    const question = typeof body.question === "string" ? body.question.trim() : "";
    if (!question) return res.status(400).json({ error: "Question is required" });
    if (question.length > MAX_BODY_CHARS) return res.status(413).json({ error: "Question is too long" });

    const snapshot = cleanSnapshot(body.snapshot);
    const mode = String(body.mode || "answer");

    if (mode === "agent-plan") {
      const prompt = `You are the planning controller for a life-planning app.
The app, not you, performs every financial calculation. Your job is only to decide whether the user's request needs scenario calculations and, if so, choose safe scenario inputs for the app's existing comparison engine.

The comparison engine accepts ONLY these controls:
- retireAge: retirement age
- livingCostMonthly: monthly retirement living cost in the user's currency
- contributionMultiplier: one of 0.8, 1.0, 1.2, 1.5. This scales future contributions as a comparison only.

Rules:
- Never calculate future assets yourself.
- Never invent a result.
- Use kind "scenario" when the user asks what-if, comparison, improvement, optimization, affordability, or "what should I change" questions that can be tested with the three controls above.
- Return at most 3 scenarios and keep them meaningfully different.
- Do not pretend contributionMultiplier means NISA only; it means the app's supported future contributions as a whole.
- If the question cannot be tested with these controls, use kind "answer" and give a short natural-language answer.
- Output valid JSON only. No Markdown.

JSON shape for a scenario request:
{"kind":"scenario","message":"short message","scenarios":[{"id":"a","label":"short label","retireAge":65,"livingCostMonthly":200000,"contributionMultiplier":1.2,"rationale":"why this is worth testing"}]}

JSON shape for a normal answer:
{"kind":"answer","message":"answer text","scenarios":[]}

Current app snapshot:
${JSON.stringify(snapshot)}

User question:
${question}`;
      const raw = await askWorker(prompt);
      const parsed = extractJsonObject(raw);
      if (!parsed || !["scenario", "answer"].includes(parsed.kind)) {
        return res.status(200).json({ kind: "answer", message: raw, scenarios: [] });
      }
      return res.status(200).json({
        kind: parsed.kind,
        message: String(parsed.message || ""),
        scenarios: Array.isArray(parsed.scenarios) ? parsed.scenarios.slice(0, 3) : [],
      });
    }

    if (mode === "agent-review") {
      const beforeSnapshot = cleanSnapshot(body.beforeSnapshot);
      const afterSnapshot = cleanSnapshot(body.afterSnapshot);
      const appliedScenario = body.appliedScenario && typeof body.appliedScenario === "object" ? body.appliedScenario : {};
      const prompt = `You are the post-action review step of a life-planning agent.
The user explicitly approved a scenario, and the app has now recalculated the life plan.
The app's before/after numbers are authoritative. Do not recalculate them and do not invent missing values.

Your task:
- Confirm, in natural language, what setting change was actually applied.
- Compare the before and after plan using only the supplied app-calculated values.
- Say whether the user's original goal appears improved, unchanged, or worsened.
- Mention the main trade-off.
- If another action may be worth considering, suggest it as a next option, but do not claim it has been tested unless it appears in the supplied data.
- Never change settings yourself. Never imply that an unapproved action was performed.
- Write plain text only, no Markdown, and never expose internal JSON field names.

Original user goal:
${question}

Approved scenario:
${JSON.stringify(appliedScenario)}

Before recalculation:
${JSON.stringify(beforeSnapshot)}

After recalculation:
${JSON.stringify(afterSnapshot)}`;
      const answer = await askWorker(prompt);
      return res.status(200).json({ answer });
    }

    if (mode === "agent-explain") {
      const compactResults = Array.isArray(body.results) ? body.results.slice(0, 3) : [];
      const prompt = `You are the explanation step of a life-planning agent.
The numbers below were calculated by the app's own financial engine. Treat them as authoritative. Do not recalculate them or invent any missing values.
Explain which tested scenario best answers the user's question, the trade-offs, and any important caution. Do not imply certainty about future markets. Write plain text only, no Markdown, and never expose internal JSON field names.

User question:
${question}

Current snapshot:
${JSON.stringify(snapshot)}

App-calculated scenario results:
${JSON.stringify(compactResults)}`;
      const answer = await askWorker(prompt);
      return res.status(200).json({ answer });
    }

    const prompt = `You are an assistant for a life-planning application.
Answer the user's question using the supplied snapshot when relevant.
Do not invent missing financial data.
Keep the answer clear and practical.
Write for an ordinary end user, not a developer. Never expose JSON keys or internal field names such as depletionAge, currentNetWorth, finalNetWorth, publicPensionStartAge, livingCostMonthly, milestones, or schemaVersion; translate them into natural user-facing wording.
Return plain text only. Do not use Markdown syntax such as **, __, #, backticks, or Markdown tables.

Snapshot:
${JSON.stringify(snapshot, null, 2)}

Question:
${question}`;
    const answer = await askWorker(prompt);
    return res.status(200).json({ answer });
  } catch (error) {
    return res.status(Number(error?.status) || 500).json({
      error: error?.message || "AI request failed",
      detail: String(error?.detail || error?.message || error)
    });
  }
}
