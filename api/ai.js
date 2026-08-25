const WORKER_URL = "https://lifeplan-ai.kunihiko-hioki.workers.dev";
const MAX_BODY_CHARS = 18000;

function cleanSnapshot(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

  const allowed = [
    "schemaVersion",
    "country",
    "language",
    "currency",
    "currentNetWorth",
    "finalNetWorth",
    "depletionAge",
    "publicPensionStartAge",
    "livingCostMonthly",
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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "POST required"
    });
  }

  try {
    const body = req.body || {};

    const question =
      typeof body.question === "string"
        ? body.question.trim()
        : "";

    if (!question) {
      return res.status(400).json({
        error: "Question is required"
      });
    }

    if (question.length > MAX_BODY_CHARS) {
      return res.status(413).json({
        error: "Question is too long"
      });
    }

    const snapshot = cleanSnapshot(body.snapshot);

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

    const upstream = await fetch(WORKER_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        question: prompt
      })
    });

    const text = await upstream.text();

    let data = {};

    try {
      data = JSON.parse(text);
    } catch {
      data = {
        result: text
      };
    }

    if (!upstream.ok) {
      return res.status(502).json({
        error: "AI upstream request failed",
        detail: extractText(data) || text.slice(0, 500)
      });
    }

    const answer = extractText(data);

    if (!answer) {
      return res.status(502).json({
        error: "AI returned no answer"
      });
    }

    return res.status(200).json({
      answer
    });

  } catch (error) {
    return res.status(500).json({
      error: "AI request failed",
      detail: String(error?.message || error)
    });
  }
}
